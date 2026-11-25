"""Write, strip and copy the metadata of PNG, JPEG and WEBP images."""

from __future__ import annotations

import re
import struct
import zlib
from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Union

from ._util import dumps, is_dict, js_trim_start, latin1, load_json
from .exceptions import UnidentifiedImageError
from .extractors.entries import (
    MetadataEntries,
    read_exif_entries,
    read_exif_image_entries,
    read_jpeg_segments,
    read_webp_chunks,
    read_xmp_entries,
)
from .extractors.image import detect_format
from .extractors.png import read_png_text

PNG_TEXT_CHUNKS = {b"tEXt", b"zTXt", b"iTXt", b"eXIf"}
EXIF_HEADER = b"Exif\x00\x00"
XMP_HEADER = b"http://ns.adobe.com/xap/1.0/\x00"
MAX_JPEG_SEGMENT = 0xFFFF - 2
MAX_JPEG_EXIF = MAX_JPEG_SEGMENT - len(EXIF_HEADER)

#: Packed keys that tools never use inside their own JSON parameters
PACKING_MARKERS = {
    "workflow",
    "parameters",
    "Comment",
    "Description",
    "Title",
    "Source",
    "Generation time",
    "generation_data",
    "invokeai_metadata",
    "smproj",
    "parameters-json",
}


def _require_format(image: bytes) -> str:
    format_ = detect_format(image)
    if not format_:
        raise UnidentifiedImageError("Not a PNG, JPEG or WEBP image")
    return format_


def _normalize_entries(metadata: Union[str, Mapping[str, Any]]) -> MetadataEntries:
    entries = {"parameters": metadata} if isinstance(metadata, str) else dict(metadata)
    return {key: value if isinstance(value, str) else dumps(value) for key, value in entries.items() if value is not None}


def _latin1_bytes(text: str) -> bytes:
    return bytes(ord(char) & 0xFF for char in text)


# ---------- PNG ----------


def _read_png_chunks(image: bytes) -> List[tuple]:
    chunks = []
    offset = 8
    while offset + 12 <= len(image):
        length = struct.unpack_from(">I", image, offset)[0]
        end = offset + 12 + length
        if end > len(image):
            break
        type_ = image[offset + 4 : offset + 8]
        chunks.append((type_, image[offset:end]))
        offset = end
        if type_ == b"IEND":
            break
    return chunks


def _png_chunk(type_: bytes, data: bytes) -> bytes:
    return struct.pack(">I", len(data)) + type_ + data + struct.pack(">I", zlib.crc32(type_ + data) & 0xFFFFFFFF)


def _png_text_chunk(keyword: str, text: str) -> bytes:
    key = _latin1_bytes(re.sub(r"[^\x20-\x7e\xa1-\xff]", "", keyword)[:79] or "Comment")
    if re.fullmatch(r"[\x00-\xff]*", text) and "\x00" not in text:
        return _png_chunk(b"tEXt", key + b"\x00" + _latin1_bytes(text))
    # iTXt: keyword, NUL, compression flag, method, empty language tag and translated keyword, UTF-8 text
    return _png_chunk(b"iTXt", key + b"\x00\x00\x00\x00\x00" + text.encode("utf-8", errors="surrogatepass"))


def _rebuild_png(image: bytes, entries: MetadataEntries, remove_c2pa: bool = False) -> bytes:
    parts = [image[:8]]
    for type_, raw in _read_png_chunks(image):
        if type_ in PNG_TEXT_CHUNKS or (remove_c2pa and type_ == b"caBX"):
            continue
        parts.append(raw)
        if type_ == b"IHDR":
            parts.extend(_png_text_chunk(key, value) for key, value in entries.items())
    return b"".join(parts)


# ---------- EXIF ----------

#: Text tags written to IFD0 (ASCII) and the Exif IFD (UNDEFINED)
IFD0_TAGS = {"ImageDescription": 0x10E, "Make": 0x10F, "Model": 0x110, "Software": 0x131, "Artist": 0x13B, "Copyright": 0x8298}
EXIF_IFD_TAGS = {"MakerNote": 0x927C, "UserComment": 0x9286}
XMP_KEYS = ["XML:com.adobe.xmp", "XMP"]


@dataclass
class _TiffTag:
    tag: int
    type: int
    value: bytes


def _encode_user_comment(text: str) -> bytes:
    return b"UNICODE\x00" + text.encode("utf-16-be", errors="surrogatepass")


def _build_tiff(ifd0: List[_TiffTag], exif_ifd: List[_TiffTag]) -> bytes:
    """A big-endian TIFF block from IFD0 tags and Exif IFD tags"""
    pointer = _TiffTag(0x8769, 4, b"\x00\x00\x00\x00")
    first = sorted(ifd0 + ([pointer] if exif_ifd else []), key=lambda t: t.tag)
    second = sorted(exif_ifd, key=lambda t: t.tag)

    def ifd_size(tags: List[_TiffTag]) -> int:
        return 2 + len(tags) * 12 + 4

    def data_size(tags: List[_TiffTag]) -> int:
        return sum(len(t.value) + len(t.value) % 2 for t in tags if len(t.value) > 4)

    first_offset = 8
    second_offset = first_offset + ifd_size(first) + data_size(first)
    tiff = bytearray(second_offset + (ifd_size(second) + data_size(second) if second else 0))
    tiff[0:2] = b"MM"
    struct.pack_into(">HI", tiff, 2, 42, first_offset)
    pointer.value = struct.pack(">I", second_offset)

    def write_ifd(tags: List[_TiffTag], offset: int) -> None:
        struct.pack_into(">H", tiff, offset, len(tags))
        data = offset + ifd_size(tags)
        for i, t in enumerate(tags):
            entry = offset + 2 + i * 12
            struct.pack_into(">HHI", tiff, entry, t.tag, t.type, len(t.value))
            if len(t.value) <= 4:
                tiff[entry + 8 : entry + 8 + len(t.value)] = t.value
            else:
                struct.pack_into(">I", tiff, entry + 8, data)
                tiff[data : data + len(t.value)] = t.value
                data += len(t.value) + len(t.value) % 2
        struct.pack_into(">I", tiff, offset + 2 + len(tags) * 12, 0)

    write_ifd(first, first_offset)
    if second:
        write_ifd(second, second_offset)
    return bytes(tiff)


def _layout_exif(entries: MetadataEntries, max_exif: float = float("inf")) -> tuple:
    """Lay out entries the way JPEG and WEBP files hold them: EXIF text tags under their own names,
    an XMP packet, and the generation data in the UserComment"""
    rest = dict(entries)
    xmp = None
    for key in XMP_KEYS:
        value = rest.pop(key, None)
        if xmp is None:
            xmp = value
    tags: Dict[str, str] = {}
    for key in list(IFD0_TAGS) + list(EXIF_IFD_TAGS):
        value = rest.pop(key, None)
        if value is not None:
            tags[key] = value
    parameters = rest.pop("parameters", None)
    if "UserComment" not in tags:
        if parameters is not None and not rest:
            tags["UserComment"] = parameters
        elif parameters is not None or rest:
            tags["UserComment"] = dumps(rest if parameters is None else {"parameters": parameters, **rest})

    def build(utf8_comment: bool) -> Optional[bytes]:
        ifd0: List[_TiffTag] = []
        exif_ifd: List[_TiffTag] = []
        for key, value in tags.items():
            if key == "UserComment":
                # UTF-8 is about half the size of UTF-16 for mostly ASCII text such as JSON
                comment = b"\x00" * 8 + value.encode("utf-8", errors="surrogatepass") if utf8_comment else _encode_user_comment(value)
                exif_ifd.append(_TiffTag(EXIF_IFD_TAGS["UserComment"], 7, comment))
            elif key in EXIF_IFD_TAGS:
                exif_ifd.append(_TiffTag(EXIF_IFD_TAGS[key], 7, value.encode("utf-8", errors="surrogatepass")))
            else:
                ifd0.append(_TiffTag(IFD0_TAGS[key], 2, value.encode("utf-8", errors="surrogatepass") + b"\x00"))
        return _build_tiff(ifd0, exif_ifd) if ifd0 or exif_ifd else None

    exif = build(False)
    if exif and len(exif) > max_exif:
        exif = build(True)
    return exif, xmp


# ---------- JPEG ----------


def _read_jpeg_header(image: bytes) -> tuple:
    """The segments before the image data, as (marker, raw, data), and the rest"""
    segments = []
    offset = 2
    while offset + 4 <= len(image) and image[offset] == 0xFF:
        marker = image[offset + 1]
        if marker in (0xDA, 0xD9):
            break
        length = struct.unpack_from(">H", image, offset + 2)[0]
        end = min(offset + 2 + length, len(image))
        segments.append((marker, image[offset:end], image[offset + 4 : end]))
        offset = end
    return segments, image[offset:]


def _is_c2pa_segment(segment: tuple) -> bool:
    """APP11 segments holding JUMBF boxes, which is where C2PA manifests go"""
    return segment[0] == 0xEB and segment[2][:2] == b"JP"


def _is_metadata_segment(segment: tuple) -> bool:
    marker, _, data = segment
    if marker in (0xFE, 0xED):
        return True
    if marker != 0xE1:
        return False
    head = data[: len(XMP_HEADER)]
    return head.startswith(EXIF_HEADER) or head == XMP_HEADER or head.startswith(b"http://ns.adobe.com/xmp/extension/")


def _jpeg_segment(marker: int, data: bytes) -> bytes:
    if len(data) > MAX_JPEG_SEGMENT:
        raise ValueError(f"The metadata is {len(data)} bytes, more than the {MAX_JPEG_SEGMENT} that fit in a JPEG segment")
    return bytes([0xFF, marker]) + struct.pack(">H", len(data) + 2) + data


def _rebuild_jpeg(image: bytes, exif: Optional[bytes] = None, xmp: Optional[str] = None, remove_c2pa: bool = False) -> bytes:
    segments, rest = _read_jpeg_header(image)
    kept = [s for s in segments if not _is_metadata_segment(s) and not (remove_c2pa and _is_c2pa_segment(s))]
    # EXIF goes right after SOI, or after a JFIF APP0 segment
    jfif = 1 if kept and kept[0][0] == 0xE0 else 0
    parts = [image[:2]] + [s[1] for s in kept[:jfif]]
    if exif:
        parts.append(_jpeg_segment(0xE1, EXIF_HEADER + exif))
    if xmp:
        parts.append(_jpeg_segment(0xE1, XMP_HEADER + xmp.encode("utf-8", errors="surrogatepass")))
    parts.extend(s[1] for s in kept[jfif:])
    parts.append(rest)
    return b"".join(parts)


# ---------- WEBP ----------


def _read_riff_chunks(image: bytes) -> List[tuple]:
    chunks = []
    offset = 12
    while offset + 8 <= len(image):
        size = struct.unpack_from("<I", image, offset + 4)[0]
        chunks.append((image[offset : offset + 4], image[offset + 8 : min(offset + 8 + size, len(image))]))
        offset += 8 + size + size % 2
    return chunks


def _riff_chunk(type_: bytes, data: bytes) -> bytes:
    return type_ + struct.pack("<I", len(data)) + data + (b"\x00" if len(data) % 2 else b"")


def _webp_canvas(chunks: List[tuple]) -> Optional[tuple]:
    for type_, data in chunks:
        if type_ == b"VP8 " and len(data) >= 10:
            width, height = struct.unpack_from("<HH", data, 6)
            return width & 0x3FFF, height & 0x3FFF, False
        if type_ == b"VP8L" and len(data) >= 5:
            bits = struct.unpack_from("<I", data, 1)[0]
            return (bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1, ((bits >> 28) & 1) == 1
    return None


def _rebuild_webp(image: bytes, exif: Optional[bytes] = None, xmp: Optional[str] = None, remove_c2pa: bool = False) -> bytes:
    chunks = [
        (type_, data)
        for type_, data in _read_riff_chunks(image)
        if type_ not in (b"EXIF", b"XMP ") and not (remove_c2pa and type_ == b"C2PA")
    ]
    vp8x_data = next((data for type_, data in chunks if type_ == b"VP8X"), None)
    vp8x: Optional[bytearray] = None
    if vp8x_data is not None:
        vp8x = bytearray(vp8x_data)
        if vp8x:
            vp8x[0] = (vp8x[0] & ~0x0C & 0xFF) | (0x08 if exif else 0) | (0x04 if xmp else 0)
    elif exif or xmp:
        # simple WEBP files have no room for metadata until they get an extended header
        canvas = _webp_canvas(chunks)
        if not canvas:
            raise UnidentifiedImageError("Unsupported WEBP image data")
        width, height, alpha = canvas
        vp8x = bytearray(10)
        vp8x[0] = (0x08 if exif else 0) | (0x04 if xmp else 0) | (0x10 if alpha else 0)
        vp8x[4:7] = (width - 1).to_bytes(3, "little")
        vp8x[7:10] = (height - 1).to_bytes(3, "little")

    parts: List[bytes] = []
    if vp8x is not None:
        parts.append(_riff_chunk(b"VP8X", bytes(vp8x)))
    parts.extend(_riff_chunk(type_, data) for type_, data in chunks if type_ != b"VP8X")
    if exif:
        parts.append(_riff_chunk(b"EXIF", exif))
    if xmp:
        parts.append(_riff_chunk(b"XMP ", xmp.encode("utf-8", errors="surrogatepass")))
    body = b"".join(parts)
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body


# ---------- public API ----------


def strip_metadata(image: bytes) -> bytes:
    """Remove the metadata of an image: PNG text and `eXIf` chunks, JPEG EXIF / XMP / IPTC segments
    and comments, WEBP `EXIF` / `XMP` chunks, and C2PA manifests. The image data and color profiles
    are left untouched. Stealth metadata hidden in the alpha channel is image data, and stays."""
    image = bytes(image)
    format_ = _require_format(image)
    if format_ == "PNG":
        return _rebuild_png(image, {}, True)
    if format_ == "JPEG":
        return _rebuild_jpeg(image, remove_c2pa=True)
    return _rebuild_webp(image, remove_c2pa=True)


def write_metadata(image: bytes, metadata: Union[str, Mapping[str, Any]]) -> bytes:
    """Replace the metadata of an image.

    A string is written the way AUTOMATIC1111 writes its parameters: as the PNG `parameters` chunk,
    or as the EXIF UserComment of JPEG and WEBP files. Pass `to_infotext(prompt_info)` to make any
    image readable by tools that only know the AUTOMATIC1111 format.

    Entries become PNG text chunks. In JPEG and WEBP files, EXIF tag names (`Software`,
    `UserComment`, `MakerNote`, ...) become those tags, `XML:com.adobe.xmp` an XMP packet, and the
    other entries a JSON UserComment holding them, the way ComfyUI and NovelAI save their JPEG /
    WEBP images.

    Raises ValueError when the metadata does not fit in a JPEG segment (64 KB).
    """
    image = bytes(image)
    format_ = _require_format(image)
    entries = _normalize_entries(metadata)
    if format_ == "PNG":
        return _rebuild_png(image, entries)
    if format_ == "JPEG":
        return _rebuild_jpeg(image, *_layout_exif(entries, MAX_JPEG_EXIF))
    return _rebuild_webp(image, *_layout_exif(entries))


def _parse_json_object(text: Optional[str]) -> Optional[Dict[str, Any]]:
    if not text or not js_trim_start(text).startswith("{"):
        return None
    try:
        value = load_json(text)
    except (ValueError, TypeError):
        return None
    return value if is_dict(value) else None


def _is_packed_json(text: Optional[str]) -> bool:
    """A JSON object of PNG chunks, as ComfyUI and NovelAI pack them into JPEG / WEBP files"""
    value = _parse_json_object(text)
    if value is None:
        return False
    prompt = value.get("prompt")
    return any(key in PACKING_MARKERS for key in value) or isinstance(prompt, (dict, list)) or ("prompt" in value and prompt is None)


def _unpacked_from(user_comment: Optional[str]) -> Dict[str, Any]:
    if _is_packed_json(user_comment):
        return {}
    return _parse_json_object(user_comment) or {}


def _is_a1111_text(text: str) -> bool:
    return not js_trim_start(text).startswith("{") and re.search(r"(?:^|\n)Steps: [0-9]", text) is not None


def read_metadata_entries(image: bytes) -> MetadataEntries:
    """Read the metadata entries of an image in the shape that `write_metadata()` takes: the PNG
    text chunks, or the EXIF text tags, XMP packet and comments of JPEG and WEBP files. A JSON
    UserComment holding PNG chunks is unpacked into those chunks, and AUTOMATIC1111 text is named
    `parameters`, as in PNG files."""
    image = bytes(image)
    format_ = _require_format(image)
    if format_ == "PNG":
        text = read_png_text(image).text
        entries = {key: value for key, value in text.items() if isinstance(value, str)}
        if "parameters" not in entries and "UserComment" in entries and _is_a1111_text(entries["UserComment"]):
            entries["parameters"] = entries.pop("UserComment")
        return entries

    raw = read_exif_image_entries(image, format_)
    if format_ == "JPEG":
        exif, xmp, _ = read_jpeg_segments(image)
    else:
        exif, xmp = read_webp_chunks(image)
    tagged = read_exif_entries(exif) if exif else {}
    xmp_values = read_xmp_entries(xmp) if xmp else {}
    unpacked = _unpacked_from(raw.get("UserComment"))
    entries: MetadataEntries = {}
    for key, value in raw.items():
        if key == "XMP":
            entries["XML:com.adobe.xmp"] = value
        elif key == "UserComment":
            if _is_packed_json(value):
                continue
            # JSON parameters (Fooocus, SwarmUI, ...) and A1111 text live in the PNG `parameters` chunk
            entries["parameters" if _is_a1111_text(value) or _parse_json_object(value) is not None else "UserComment"] = value
        elif key in unpacked and key not in tagged:
            continue
        elif key == "Comment" and _is_packed_json(value):
            continue
        elif key not in tagged and xmp_values.get(key) == value and key != "Description":
            # read from the XMP packet, which is kept as a whole
            continue
        else:
            entries[key] = value
    return entries


def copy_metadata(source: bytes, target: bytes) -> bytes:
    """Copy the metadata of one image into another, converting it to the container format of the
    target: PNG text chunks become EXIF tags and a UserComment in JPEG / WEBP files and the other
    way around."""
    return write_metadata(target, read_metadata_entries(source))
