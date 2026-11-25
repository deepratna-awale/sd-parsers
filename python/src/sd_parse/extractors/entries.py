"""Text metadata of EXIF blocks, JPEG segments, WEBP chunks and XMP packets."""

from __future__ import annotations

import re
import struct
from typing import Dict, List, Optional, Tuple

from .._util import decode_utf8, dumps, is_dict, js_trim_start, latin1, load_json

#: Text metadata found in an image, keyed by the name of the PNG chunk, EXIF tag or JPEG segment it was read from
MetadataEntries = Dict[str, str]

TIFF_TYPE_SIZES = {1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8}

EXIF_HEADER = b"Exif\x00\x00"
XMP_HEADER = b"http://ns.adobe.com/xap/1.0/\x00"
EXIF_IFD_POINTER = 0x8769

TEXT_TAGS = {
    0x010E: "ImageDescription",
    0x010F: "Make",
    0x0110: "Model",
    0x0131: "Software",
    0x013B: "Artist",
    0x8298: "Copyright",
    0x927C: "MakerNote",
    0x9286: "UserComment",
}

#: PNG chunk names that tools pack into one JSON object when they write JPEG or WEBP files
PACKED_KEYS = [
    "prompt",
    "workflow",
    "parameters",
    "Comment",
    "Description",
    "Software",
    "Source",
    "Title",
    "Generation time",
    "generation_data",
    "invokeai_metadata",
    "smproj",
    "parameters-json",
    "Copyright",
    "extra",
]

_LABEL = re.compile(r"([A-Za-z]+):(?:\s|(?=[{\[]))")


def _strip_trailing_nulls(text: str) -> str:
    return text.rstrip("\x00")


def _count_ascii(text: str) -> int:
    return sum(1 for char in text if 0x20 <= ord(char) < 0x7F or char in "\n\r\t")


def _decode_utf16(data: bytes, little_endian: bool) -> str:
    even = len(data) - len(data) % 2
    text = data[:even].decode("utf-16-le" if little_endian else "utf-16-be", errors="replace")
    return text[1:] if text.startswith("﻿") else text


def decode_utf16_guess(data: bytes, little_endian_hint: bool = False) -> str:
    """Decode UTF-16 text whose byte order is not reliably known.

    Tools write both orders regardless of the TIFF header (A1111 always writes big endian).
    Generation data is mostly ASCII, so the order that yields far more ASCII characters wins.
    """
    preferred = _decode_utf16(data, little_endian_hint)
    other = _decode_utf16(data, not little_endian_hint)
    preferred_ascii = _count_ascii(preferred)
    other_ascii = _count_ascii(other)
    text = other if other_ascii > preferred_ascii * 2 and other_ascii * 2 > _utf16_length(other) else preferred
    if text.startswith("﻿"):
        text = text[1:]
    return _strip_trailing_nulls(text)


def _utf16_length(text: str) -> int:
    return sum(2 if ord(char) > 0xFFFF else 1 for char in text)


def decode_user_comment(value: bytes, little_endian_hint: bool = False) -> str:
    """Decode an EXIF UserComment value: an 8 byte character code followed by the text"""
    code = value[:8]
    body = value[8:]
    if code == b"UNICODE\x00":
        return decode_utf16_guess(body, little_endian_hint)
    if code == b"ASCII\x00\x00\x00" or code == b"\x00" * 8:
        return _strip_trailing_nulls(_utf8_or_latin1(body))
    # no character code: some ComfyUI save nodes write plain UTF-8
    return _strip_trailing_nulls(_utf8_or_latin1(value))


def _utf8_or_latin1(data: bytes) -> str:
    text = decode_utf8(data)
    if text is None:
        return latin1(data)
    return text[1:] if text.startswith("﻿") else text


def read_exif_entries(exif: bytes) -> MetadataEntries:
    """Read the text tags of an EXIF block (TIFF structure, with or without the `Exif\\0\\0` header).

    Values labelled with the PNG chunk they stand in for, like `prompt:{...}` or `Workflow: {...}`
    (ComfyUI save nodes), are stored under the lower-cased label.
    """
    tiff = bytes(exif)
    if tiff[:6] == EXIF_HEADER:
        tiff = tiff[6:]
    entries: MetadataEntries = {}
    if len(tiff) < 8:
        return entries
    byte_order = tiff[:2]
    if byte_order not in (b"II", b"MM"):
        return entries
    little_endian = byte_order == b"II"
    prefix = "<" if little_endian else ">"

    def u16(offset: int) -> int:
        return struct.unpack_from(prefix + "H", tiff, offset)[0]

    def u32(offset: int) -> int:
        return struct.unpack_from(prefix + "I", tiff, offset)[0]

    visited = set()

    def read_ifd(ifd_offset: int) -> None:
        if ifd_offset in visited or ifd_offset + 2 > len(tiff):
            return
        visited.add(ifd_offset)
        count = u16(ifd_offset)
        for i in range(count):
            entry = ifd_offset + 2 + i * 12
            if entry + 12 > len(tiff):
                return
            tag = u16(entry)
            type_ = u16(entry + 2)
            size = TIFF_TYPE_SIZES.get(type_, 1) * u32(entry + 4)

            if tag == EXIF_IFD_POINTER:
                read_ifd(u32(entry + 8))
                continue

            name = TEXT_TAGS.get(tag)
            if not name or size > len(tiff):
                continue
            value_offset = entry + 8 if size <= 4 else u32(entry + 8)
            if value_offset + size > len(tiff):
                continue
            value = tiff[value_offset : value_offset + size]

            if name == "UserComment":
                text = decode_user_comment(value, little_endian)
            elif type_ in (1, 2, 7):
                text = _strip_trailing_nulls(_utf8_or_latin1(value))
            else:
                continue
            if not text:
                continue

            label = _LABEL.match(text)
            if label and name != "UserComment" and label.group(1).lower() in PACKED_KEYS:
                entries.setdefault(label.group(1).lower(), text[label.end() :])
            else:
                entries.setdefault(name, text)

    read_ifd(u32(4))
    return entries


def unpack_json_entries(entries: MetadataEntries, text: Optional[str]) -> None:
    """Add the values of a JSON object holding PNG chunk names as entries of their own"""
    if not text or not js_trim_start(text).startswith("{"):
        return
    try:
        value = load_json(text)
    except Exception:
        return
    if not is_dict(value):
        return
    for key in PACKED_KEYS:
        packed = value.get(key)
        if packed is None or key in entries:
            continue
        entries[key] = packed if isinstance(packed, str) else dumps(packed)


def read_jpeg_segments(data: bytes) -> Tuple[Optional[bytes], Optional[str], List[str]]:
    """Find the APP1 EXIF block, XMP packet and COM segments of a JPEG file"""
    exif: Optional[bytes] = None
    xmp: Optional[str] = None
    xmp_found = False
    comments: List[str] = []
    offset = 2
    while offset + 4 <= len(data):
        if data[offset] != 0xFF:
            break
        marker = data[offset + 1]
        if marker == 0xFF:
            offset += 1
            continue
        if marker in (0xDA, 0xD9):
            break
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:
            offset += 2
            continue
        length = struct.unpack_from(">H", data, offset + 2)[0]
        segment = data[offset + 4 : min(offset + 2 + length, len(data))]
        if marker == 0xE1:
            head = segment[: len(XMP_HEADER)]
            if exif is None and head.startswith(EXIF_HEADER):
                exif = segment
            elif not xmp_found and head == XMP_HEADER:
                xmp = _utf8_strict(segment[len(XMP_HEADER) :])
                xmp_found = xmp is not None
        elif marker == 0xFE:
            text = _strip_trailing_nulls(_utf8_or_latin1(segment))
            if text:
                comments.append(text)
        offset += 2 + length
    return exif, xmp, comments


def _utf8_strict(data: bytes) -> Optional[str]:
    text = decode_utf8(data)
    if text is not None and text.startswith("﻿"):
        text = text[1:]
    return text


def read_webp_chunks(data: bytes) -> Tuple[Optional[bytes], Optional[str]]:
    """Find the EXIF and XMP chunks of a WEBP file"""
    exif: Optional[bytes] = None
    xmp: Optional[str] = None
    xmp_found = False
    offset = 12
    while offset + 8 <= len(data):
        type_ = data[offset : offset + 4]
        size = struct.unpack_from("<I", data, offset + 4)[0]
        chunk = data[offset + 8 : min(offset + 8 + size, len(data))]
        if type_ == b"EXIF" and exif is None:
            exif = chunk
        elif type_ == b"XMP " and not xmp_found:
            xmp = _utf8_strict(chunk)
            xmp_found = xmp is not None
        offset += 8 + size + size % 2
    return exif, xmp


def _decode_xml_text(text: str) -> str:
    text = re.sub(r"&#x([0-9a-fA-F]+);", lambda m: chr(int(m.group(1), 16)), text)
    text = re.sub(r"&#([0-9]+);", lambda m: chr(int(m.group(1), 10)), text)
    return (
        text.replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&amp;", "&")
    )


def get_xmp_property(xmp: str, name: str) -> Optional[str]:
    """Read a simple property of an XMP packet, written as an attribute or as an element.

    For language alternatives and lists, the first item. A `*:` prefix matches any namespace prefix.
    """
    if name.startswith("*:"):
        escaped = r"[\w.-]+:" + re.escape(name[2:])
    else:
        escaped = re.escape(name)
    attribute = re.search(r"\s" + escaped + r"\s*=\s*\"([^\"]*)\"", xmp, re.ASCII) or re.search(
        r"\s" + escaped + r"\s*=\s*'([^']*)'", xmp, re.ASCII
    )
    if attribute:
        return _decode_xml_text(attribute.group(1))
    element = re.search(r"<(" + escaped + r")(?:\s[^>]*)?>([\s\S]*?)</\1>", xmp, re.ASCII)
    if not element:
        return None
    item = re.search(r"<rdf:li(?:\s[^>]*)?>([\s\S]*?)</rdf:li>", element.group(2))
    return _decode_xml_text((item.group(1) if item else element.group(2)).strip())


def read_xmp_entries(xmp: str) -> MetadataEntries:
    """Collect the XMP properties that carry generation data"""
    entries: MetadataEntries = {}
    for prop, key in (
        ("dc:description", "Description"),
        ("exif:UserComment", "UserComment"),
        ("xmp:CreatorTool", "CreatorTool"),
        ("*:DigitalSourceType", "DigitalSourceType"),
        ("dc:publisher", "Publisher"),
    ):
        value = get_xmp_property(xmp, prop)
        if value:
            entries[key] = value
    return entries


def read_exif_image_entries(data: bytes, image_format: str) -> MetadataEntries:
    """Read the text metadata of a JPEG or WEBP file: EXIF text tags, JPEG comments and XMP properties"""
    if image_format == "JPEG":
        exif, xmp, comments = read_jpeg_segments(data)
    else:
        exif, xmp = read_webp_chunks(data)
        comments = []
    entries = read_exif_entries(exif) if exif else {}
    if comments:
        entries.setdefault("Comment", "\n".join(comments))
    if xmp:
        entries["XMP"] = xmp
        for key, value in read_xmp_entries(xmp).items():
            entries.setdefault(key, value)
    unpack_json_entries(entries, entries.get("UserComment"))
    unpack_json_entries(entries, entries.get("Comment"))
    return entries
