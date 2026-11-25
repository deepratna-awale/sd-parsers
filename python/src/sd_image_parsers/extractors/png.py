"""PNG text chunks."""

from __future__ import annotations

import struct
import zlib
from dataclasses import dataclass, field
from typing import Any, Dict, Optional, Tuple

from .._util import latin1
from .entries import read_exif_entries, read_xmp_entries

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"


@dataclass
class PngTextData:
    #: Text chunks found before the image data (PIL's `Image.info`)
    info: Dict[str, Any] = field(default_factory=dict)
    #: All text chunks of the file (PIL's `PngImageFile.text`)
    text: Dict[str, Any] = field(default_factory=dict)
    #: PNG color type from the IHDR chunk
    color_type: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None


def _split_null(data: bytes) -> Optional[Tuple[bytes, bytes]]:
    index = data.find(b"\x00")
    return None if index == -1 else (data[:index], data[index + 1 :])


def _decode_utf8_strict(data: bytes) -> str:
    text = data.decode("utf-8")
    return text[1:] if text.startswith("﻿") else text


def _decode_text_value(data: bytes) -> str:
    if all(byte < 0x80 for byte in data):
        return latin1(data)
    try:
        return _decode_utf8_strict(data)
    except UnicodeDecodeError:
        return latin1(data)


def inflate(data: bytes) -> bytes:
    """Decompress zlib data, returning whatever could be decompressed from truncated streams"""
    return zlib.decompressobj().decompress(data)


def _read_text_chunk(type_: bytes, data: bytes) -> Optional[Tuple[str, Any, str]]:
    """Read a tEXt, zTXt or iTXt chunk the way PIL does: keyword, `Image.info` value, `Image.text` value"""
    if type_ == b"tEXt":
        key, value = _split_null(data) or (data, b"")
        if not key:
            return None
        keyword = latin1(key)
        # the specification says latin-1, but many tools write UTF-8
        text = _decode_text_value(value)
        return keyword, (value if keyword == "exif" else text), text

    if type_ == b"zTXt":
        key, value = _split_null(data) or (data, b"")
        method = value[0] if value else 0
        if method != 0 or not key:
            return None
        try:
            text = _decode_text_value(inflate(value[1:]))
        except zlib.error:
            text = ""
        return latin1(key), text, text

    if type_ == b"iTXt":
        split = _split_null(data)
        if not split:
            return None
        key, rest = split
        if len(rest) < 2:
            return None
        flag, method = rest[0], rest[1]
        lang_split = _split_null(rest[2:])
        translated_split = lang_split and _split_null(lang_split[1])
        if not lang_split or not translated_split:
            return None
        lang, translated = lang_split[0], translated_split[0]
        value = translated_split[1]
        if flag != 0:
            if method != 0:
                return None
            try:
                value = inflate(value)
            except zlib.error:
                return None
        try:
            _decode_utf8_strict(lang)
            _decode_utf8_strict(translated)
            text = _decode_utf8_strict(value)
        except UnicodeDecodeError:
            return None
        return latin1(key), text, text

    return None


def _add_entries(result: PngTextData, entries: Dict[str, str], before_image_data: bool) -> None:
    for key, value in entries.items():
        if before_image_data:
            result.info.setdefault(key, value)
        result.text.setdefault(key, value)


def read_png_text(buffer: bytes) -> PngTextData:
    """Read the text chunks of a PNG file.

    The text of an eXIf chunk and of an XMP packet is added under the names of the EXIF tags and
    XMP properties it was read from (`UserComment`, `CreatorTool`, ...).
    """
    result = PngTextData()
    if len(buffer) < 8 or buffer[:8] != PNG_SIGNATURE:
        return result

    offset = 8
    seen_image_data = False
    while offset + 8 <= len(buffer):
        length = struct.unpack_from(">I", buffer, offset)[0]
        type_ = bytes(buffer[offset + 4 : offset + 8])
        start = offset + 8
        end = start + length
        if end > len(buffer):
            break
        data = bytes(buffer[start:end])

        if type_ == b"IHDR" and len(data) >= 10:
            result.width, result.height = struct.unpack_from(">II", data, 0)
            result.color_type = data[9]
        elif type_ == b"eXIf":
            # CivitAI stores its metadata in an eXIf chunk instead of text chunks
            _add_entries(result, read_exif_entries(data), not seen_image_data)
        elif type_ == b"IDAT":
            seen_image_data = True
        elif type_ == b"IEND":
            break
        else:
            entry = _read_text_chunk(type_, data)
            if entry:
                keyword, info_value, text_value = entry
                if not seen_image_data:
                    result.info[keyword] = info_value
                result.text[keyword] = text_value
                if keyword == "XML:com.adobe.xmp":
                    _add_entries(result, read_xmp_entries(text_value), not seen_image_data)

        offset = end + 4
    return result
