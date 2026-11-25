"""Metadata of MP4, MOV, WebM and MKV videos."""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from ._util import latin1, utf8_lenient
from .extractors.entries import MetadataEntries, read_xmp_entries

#: AVIF and HEIF images share the MP4 container
STILL_IMAGE_BRANDS = {"avif", "avis", "heic", "heix", "heim", "heis", "hevc", "hevx", "mif1", "msf1"}

XMP_UUID = "be7acfcb97a942e89c71999491e3afac"
C2PA_UUID = "d8fec3d61b0e483c92975828877ec481"


def detect_video_format(data: bytes) -> Optional[str]:
    """Tell MP4 / MOV (ISO base media) and WebM / MKV (Matroska) files apart"""
    if len(data) >= 12 and data[4:8] == b"ftyp":
        brand = latin1(bytes(data[8:12]))
        if brand in STILL_IMAGE_BRANDS:
            return None
        return "MOV" if brand == "qt  " else "MP4"
    if len(data) >= 4 and bytes(data[:4]) == b"\x1a\x45\xdf\xa3":
        return "WEBM" if b"webm" in bytes(data[:64]) else "MKV"
    return None


# ---------- MP4 / MOV ----------

Box = Tuple[str, bytes]


def _read_mp4_boxes(data: bytes) -> List[Box]:
    boxes: List[Box] = []
    offset = 0
    while offset + 8 <= len(data):
        size = struct.unpack_from(">I", data, offset)[0]
        header = 8
        if size == 1:
            if offset + 16 > len(data):
                break
            size = struct.unpack_from(">Q", data, offset + 8)[0]
            header = 16
        elif size == 0:
            size = len(data) - offset
        if size < header:
            break
        end = min(offset + size, len(data))
        boxes.append((latin1(data[offset + 4 : offset + 8]), data[offset + header : end]))
        offset += size
    return boxes


def _child(boxes: List[Box], type_: str) -> Optional[Box]:
    for box in boxes:
        if box[0] == type_:
            return box
    return None


def _meta_children(meta: bytes) -> List[Box]:
    """`meta` is a full box in MP4 files (version and flags first) but not always in QuickTime files"""
    plain = _read_mp4_boxes(meta)
    return plain if any(box[0] == "hdlr" for box in plain) else _read_mp4_boxes(meta[4:])


ILST_NAMES = {
    "\xa9cmt": "comment",
    "desc": "description",
    "ldes": "synopsis",
    "\xa9nam": "title",
    "\xa9too": "encoder",
    "\xa9swr": "encoder",
    "\xa9ART": "artist",
    "\xa9day": "date",
    "\xa9gen": "genre",
    "\xa9inf": "information",
    "cprt": "copyright",
}


def _decode_data_atom(box: Box) -> Optional[str]:
    data = _child(_read_mp4_boxes(box[1]), "data")
    if not data or len(data[1]) < 8:
        return None
    type_ = struct.unpack_from(">I", data[1], 0)[0] & 0xFFFFFF
    # 1: UTF-8, 2: UTF-16 BE
    if type_ not in (1, 2):
        return None
    value = data[1][8:]
    if type_ == 1:
        return utf8_lenient(value)
    even = len(value) - len(value) % 2
    text = value[:even].decode("utf-16-be", errors="replace") + ("�" if len(value) % 2 else "")
    return text[1:] if text.startswith("﻿") else text


def _read_ilst(ilst: Box, keys: List[str]) -> MetadataEntries:
    entries: MetadataEntries = {}
    for item in _read_mp4_boxes(ilst[1]):
        value = _decode_data_atom(item)
        if value is None:
            continue
        type_ = item[0]
        # items of a `keys` list are numbered from 1 instead of named
        index = 0
        for char in type_:
            index = index * 256 + ord(char)
        raw = keys[index - 1] if ord(type_[0]) == 0 and 0 < index <= len(keys) else None
        if raw is not None:
            name = re.sub(r"^com\.apple\.quicktime\.", "", raw)
        else:
            name = ILST_NAMES.get(type_, type_)
        entries.setdefault(name, value)
    return entries


def _read_keys(keys: Box) -> List[str]:
    data = keys[1]
    names: List[str] = []
    offset = 8  # version, flags and entry count
    while offset + 8 <= len(data):
        size = struct.unpack_from(">I", data, offset)[0]
        if size < 8:
            break
        names.append(utf8_lenient(data[offset + 8 : offset + size]))
        offset += size
    return names


def _read_udta_text(box: Box) -> Optional[str]:
    """QuickTime user data text: 16 bit length, language code, text"""
    data = box[1]
    if len(data) < 4:
        return None
    length = (data[0] << 8) | data[1]
    if length == 0 or 4 + length > len(data):
        return None
    return utf8_lenient(data[4 : 4 + length])


@dataclass
class _RawVideo:
    entries: MetadataEntries = field(default_factory=dict)
    xmp: Optional[str] = None
    c2pa: Optional[bytes] = None
    width: Optional[int] = None
    height: Optional[int] = None


def _read_mp4(data: bytes) -> _RawVideo:
    top = _read_mp4_boxes(data)
    result = _RawVideo()

    def add(entries: MetadataEntries) -> None:
        for key, value in entries.items():
            result.entries.setdefault(key, value)

    moov = _child(top, "moov")
    moov_children = _read_mp4_boxes(moov[1]) if moov else []

    def read_meta(meta: Box) -> None:
        meta_boxes = _meta_children(meta[1])
        keys = _child(meta_boxes, "keys")
        ilst = _child(meta_boxes, "ilst")
        if ilst:
            add(_read_ilst(ilst, _read_keys(keys) if keys else []))

    meta = _child(moov_children, "meta")
    if meta:
        read_meta(meta)

    udta = _child(moov_children, "udta")
    if udta:
        for box in _read_mp4_boxes(udta[1]):
            if box[0] == "meta":
                read_meta(box)
            elif box[0] == "XMP_":
                if result.xmp is None:
                    result.xmp = utf8_lenient(box[1])
            elif ord(box[0][0]) == 0xA9:
                text = _read_udta_text(box)
                if text:
                    add({ILST_NAMES.get(box[0], box[0]): text})

    for type_, body in top:
        if type_ != "uuid" or len(body) < 16:
            continue
        uuid = body[:16].hex()
        if uuid == XMP_UUID:
            if result.xmp is None:
                result.xmp = utf8_lenient(body[16:])
        elif uuid == C2PA_UUID and result.c2pa is None:
            # version and flags, a purpose string, and for manifests a 64 bit offset before the JUMBF data
            rest = body[20:]
            end = rest.find(b"\x00")
            purpose = latin1(rest[: 0 if end == -1 else end])
            if purpose == "manifest":
                result.c2pa = rest[end + 1 + 8 :]

    # size of the first video track, from its track header (16.16 fixed point)
    for type_, trak in moov_children:
        if type_ != "trak":
            continue
        trak_boxes = _read_mp4_boxes(trak)
        mdia = _child(trak_boxes, "mdia")
        hdlr = _child(_read_mp4_boxes(mdia[1]), "hdlr") if mdia else None
        tkhd = _child(trak_boxes, "tkhd")
        if not tkhd or not hdlr or hdlr[1][8:12] != b"vide":
            continue
        offset = 88 if tkhd[1][0] == 1 else 76
        if offset + 8 > len(tkhd[1]):
            continue
        result.width = struct.unpack_from(">I", tkhd[1], offset)[0] >> 16
        result.height = struct.unpack_from(">I", tkhd[1], offset + 4)[0] >> 16
        break
    return result


# ---------- Matroska / WebM ----------

SEGMENT = 0x18538067
INFO = 0x1549A966
TITLE = 0x7BA9
TRACKS = 0x1654AE6B
TRACK_ENTRY = 0xAE
VIDEO = 0xE0
PIXEL_WIDTH = 0xB0
PIXEL_HEIGHT = 0xBA
TAGS = 0x1254C367
TAG = 0x7373
TARGETS = 0x63C0
SIMPLE_TAG = 0x67C8
TAG_NAME = 0x45A3
TAG_STRING = 0x4487

#: Track, edition, chapter and attachment UIDs: tags that describe one part of the file
PART_TARGETS = {0x63C5, 0x63C9, 0x63C4, 0x63C6}


def read_vint(data: bytes, offset: int, keep_marker: bool) -> Optional[Tuple[int, int, bool]]:
    """An EBML variable length integer: value, length in bytes, and whether it means "unknown size\""""
    if offset >= len(data) or data[offset] == 0:
        return None
    first = data[offset]
    length = 9 - first.bit_length()
    if offset + length > len(data):
        return None
    value = first if keep_marker else first & (0xFF >> length)
    all_ones = value == 0xFF >> length
    for i in range(1, length):
        value = value * 256 + data[offset + i]
        if data[offset + i] != 0xFF:
            all_ones = False
    return value, length, (not keep_marker and all_ones)


def _read_ebml(data: bytes) -> List[Tuple[int, bytes]]:
    elements: List[Tuple[int, bytes]] = []
    offset = 0
    while offset < len(data):
        id_ = read_vint(data, offset, True)
        size = read_vint(data, offset + id_[1], False) if id_ else None
        if not id_ or not size:
            break
        start = offset + id_[1] + size[1]
        # an element of unknown size runs to the end of its parent
        end = len(data) if size[2] else min(start + size[0], len(data))
        elements.append((id_[0], data[start:end]))
        offset = end
    return elements


def _find(elements: List[Tuple[int, bytes]], id_: int) -> Optional[bytes]:
    for element_id, data in elements:
        if element_id == id_:
            return data
    return None


def _read_simple_tags(data: bytes, entries: MetadataEntries) -> None:
    for element_id, simple_tag in _read_ebml(data):
        if element_id != SIMPLE_TAG:
            continue
        children = _read_ebml(simple_tag)
        name = _find(children, TAG_NAME)
        value = _find(children, TAG_STRING)
        if name is not None and value is not None:
            entries.setdefault(utf8_lenient(name), utf8_lenient(value))
        _read_simple_tags(simple_tag, entries)


def _read_matroska(data: bytes) -> _RawVideo:
    result = _RawVideo()
    segment = _find(_read_ebml(data), SEGMENT)
    if segment is None:
        return result
    for element_id, element in _read_ebml(segment):
        if element_id == TAGS:
            for child_id, tag in _read_ebml(element):
                if child_id != TAG:
                    continue
                targets = _find(_read_ebml(tag), TARGETS)
                if targets is not None and any(target_id in PART_TARGETS for target_id, _ in _read_ebml(targets)):
                    continue
                _read_simple_tags(tag, result.entries)
        elif element_id == INFO:
            title = _find(_read_ebml(element), TITLE)
            if title is not None:
                result.entries.setdefault("TITLE", utf8_lenient(title))
        elif element_id == TRACKS and result.width is None:
            for child_id, entry in _read_ebml(element):
                if child_id != TRACK_ENTRY:
                    continue
                video = _find(_read_ebml(entry), VIDEO)
                if video is None:
                    continue
                fields = _read_ebml(video)
                width = _find(fields, PIXEL_WIDTH)
                height = _find(fields, PIXEL_HEIGHT)
                if width is not None and height is not None:
                    result.width = int.from_bytes(width, "big") if width else 0
                    result.height = int.from_bytes(height, "big") if height else 0
                    break
    return result


# ---------- public API ----------


@dataclass
class VideoMetadata:
    format: str
    #: Text metadata under lower-case names (`prompt`, `workflow`, `comment`, `description`, ...)
    entries: MetadataEntries
    #: XMP packet (MP4 / MOV)
    xmp: Optional[str] = None
    #: C2PA manifest store as JUMBF (MP4 / MOV)
    c2pa: Optional[bytes] = None
    width: Optional[int] = None
    height: Optional[int] = None


_A1111_STEPS = re.compile(r"(?:^|\n)Steps: [0-9]")


def read_video_metadata(data: bytes) -> Optional[VideoMetadata]:
    """Read the metadata of an MP4, MOV, WebM or MKV file: ffmpeg metadata tags (which ComfyUI and
    Forge use for their generation data), XMP and C2PA boxes, and the video size. Media data is
    skipped without being decoded. Pass the whole file: MP4 files may keep their metadata after
    the media data.
    """
    data = bytes(data)
    format_ = detect_video_format(data)
    if not format_:
        return None
    if format_ in ("MP4", "MOV"):
        raw = _read_mp4(data)
    else:
        raw = _read_matroska(data)
    entries: Dict[str, str] = {}
    for key, value in raw.entries.items():
        entries.setdefault(key.lower(), value)
    for candidate in (entries.get("parameters"), entries.get("description"), entries.get("comment")):
        if candidate and _A1111_STEPS.search(candidate):
            entries["parameters"] = candidate
            break
    if raw.xmp:
        for key, value in read_xmp_entries(raw.xmp).items():
            entries.setdefault(key, value)
    return VideoMetadata(format_, entries, raw.xmp, raw.c2pa, raw.width, raw.height)
