"""Read the metadata of files and streams without their image and media data."""

from __future__ import annotations

import io
import os
import struct
from typing import BinaryIO, List, Optional, Union

from .extractors.image import detect_format
from .video import detect_video_format

#: A file path, or a binary file object (read forwards when it is not seekable)
StreamInput = Union[str, "os.PathLike[str]", BinaryIO]

#: Bytes kept of a WEBP image data chunk: enough for the size in its header
WEBP_IMAGE_HEADER = 32
#: Read when the format is unknown, for format detection
HEAD_SIZE = 64


class _Reader:
    """Reads byte ranges of a file. Offsets of a stream that cannot seek must not go backwards."""

    def __init__(self, file: BinaryIO) -> None:
        self.file = file
        try:
            self.seekable = bool(file.seekable())
        except (AttributeError, ValueError, OSError):
            self.seekable = False
        self.start = file.tell() if self.seekable else 0
        self.position = 0
        self.buffer = b""

    def read(self, offset: int, length: int) -> bytes:
        if length <= 0:
            return b""
        if self.seekable:
            self.file.seek(self.start + offset)
            chunks: List[bytes] = []
            remaining = length
            while remaining > 0:
                chunk = self.file.read(remaining)
                if not chunk:
                    break
                chunks.append(chunk)
                remaining -= len(chunk)
            return b"".join(chunks)

        if offset < self.position:
            raise ValueError("a stream cannot be read backwards")
        # drop everything before `offset`, so skipped media data is never held
        drop = offset - self.position
        if drop <= len(self.buffer):
            self.buffer = self.buffer[drop:]
        else:
            drop -= len(self.buffer)
            self.buffer = b""
            while drop > 0:
                chunk = self.file.read(min(drop, 1 << 20))
                if not chunk:
                    self.position = offset
                    return b""
                drop -= len(chunk)
        self.position = offset
        while len(self.buffer) < length:
            chunk = self.file.read(max(length - len(self.buffer), 1 << 16))
            if not chunk:
                break
            self.buffer += chunk
        return self.buffer[:length]


def _u32be(data: bytes, offset: int) -> int:
    return struct.unpack_from(">I", data, offset)[0]


#: An empty IDAT chunk, so readers still see where the image data was
EMPTY_IDAT = bytes([0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54, 0x35, 0xAF, 0x06, 0x1E])


def _png_skeleton(reader: _Reader) -> bytes:
    parts = [reader.read(0, 8)]
    offset = 8
    wrote_image_data = False
    while True:
        header = reader.read(offset, 8)
        if len(header) < 8:
            break
        length = _u32be(header, 0)
        type_ = header[4:8]
        if type_ in (b"IDAT", b"fdAT"):
            if not wrote_image_data:
                parts.append(EMPTY_IDAT)
            wrote_image_data = True
        else:
            parts.extend([header, reader.read(offset + 8, length + 4)])
        offset += 12 + length
        if type_ == b"IEND":
            break
    return b"".join(parts)


def _jpeg_skeleton(reader: _Reader) -> bytes:
    parts = [reader.read(0, 2)]
    offset = 2
    while True:
        marker = reader.read(offset, 2)
        if len(marker) < 2 or marker[0] != 0xFF:
            break
        if marker[1] == 0xFF:
            offset += 1
            continue
        # start of scan: the image data follows, and no metadata comes before it ends
        if marker[1] in (0xDA, 0xD9):
            break
        if marker[1] == 0x01 or 0xD0 <= marker[1] <= 0xD7:
            parts.append(marker)
            offset += 2
            continue
        length_bytes = reader.read(offset + 2, 2)
        if len(length_bytes) < 2:
            break
        length = (length_bytes[0] << 8) | length_bytes[1]
        parts.extend([marker, length_bytes, reader.read(offset + 4, length - 2)])
        offset += 2 + length
    parts.append(b"\xff\xd9")
    return b"".join(parts)


def _webp_skeleton(reader: _Reader) -> bytes:
    parts: List[bytes] = []
    offset = 12
    while True:
        header = reader.read(offset, 8)
        if len(header) < 8:
            break
        type_ = header[:4]
        size = struct.unpack_from("<I", header, 4)[0]
        padded = size + size % 2
        if type_ in (b"VP8 ", b"VP8L"):
            kept = min(size, WEBP_IMAGE_HEADER)
            body = reader.read(offset + 8, kept)
            chunk = bytearray(8 + kept + kept % 2)
            chunk[0:4] = type_
            struct.pack_into("<I", chunk, 4, kept)
            chunk[8 : 8 + len(body)] = body
            parts.append(bytes(chunk))
        elif type_ not in (b"ALPH", b"ANMF"):
            parts.extend([header, reader.read(offset + 8, padded)])
        offset += 8 + padded
    body = b"".join(parts)
    return b"RIFF" + struct.pack("<I", len(body) + 4) + b"WEBP" + body


def _mp4_skeleton(reader: _Reader) -> bytes:
    parts: List[bytes] = []
    offset = 0
    while True:
        header = reader.read(offset, 16)
        if len(header) < 8:
            break
        type_ = header[4:8]
        size = _u32be(header, 0)
        if size == 1 and len(header) >= 16:
            size = struct.unpack_from(">Q", header, 8)[0]
        if type_ == b"mdat":
            parts.append(b"\x00\x00\x00\x08mdat")
            if size == 0:
                break
        elif size == 0:
            # the box runs to the end of the file
            position = offset
            while True:
                chunk = reader.read(position, 1 << 20)
                parts.append(chunk)
                if len(chunk) < 1 << 20:
                    break
                position += 1 << 20
            break
        else:
            if size < 8:
                break
            parts.append(reader.read(offset, size))
        offset += size
    return b"".join(parts)


def _read_vint(reader: _Reader, offset: int, keep_marker: bool):
    first_bytes = reader.read(offset, 1)
    if not first_bytes or first_bytes[0] == 0:
        return None
    first = first_bytes[0]
    length = 9 - first.bit_length()
    data = reader.read(offset, length)
    if len(data) < length:
        return None
    value = first if keep_marker else first & (0xFF >> length)
    all_ones = value == 0xFF >> length
    for i in range(1, length):
        value = value * 256 + data[i]
        if data[i] != 0xFF:
            all_ones = False
    return value, length, (not keep_marker and all_ones), data


SEGMENT = 0x18538067
#: Cluster and Cues hold the media data and its index; SeekHead positions go stale without them
MEDIA_ELEMENTS = {0x1F43B675, 0x1C53BB6B, 0x114D9B74}
UNKNOWN_SIZE = bytes([0x01, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF, 0xFF])


def _matroska_skeleton(reader: _Reader) -> bytes:
    parts: List[bytes] = []
    offset = 0
    while True:
        id_ = _read_vint(reader, offset, True)
        size = _read_vint(reader, offset + id_[1], False) if id_ else None
        if not id_ or not size:
            break
        start = offset + id_[1] + size[1]
        if id_[0] != SEGMENT:
            if size[2]:
                break
            parts.extend([id_[3], size[3], reader.read(start, size[0])])
            offset = start + size[0]
            continue

        # the segment: keep its children but the media data, under an unknown size
        parts.extend([id_[3], UNKNOWN_SIZE])
        end = float("inf") if size[2] else start + size[0]
        child = start
        while child < end:
            child_id = _read_vint(reader, child, True)
            child_size = _read_vint(reader, child + child_id[1], False) if child_id else None
            # a cluster of unknown size (live recording) can only be skipped by reading it: stop there
            if not child_id or not child_size or child_size[2]:
                break
            child_start = child + child_id[1] + child_size[1]
            if child_id[0] not in MEDIA_ELEMENTS:
                parts.extend([child_id[3], child_size[3], reader.read(child_start, child_size[0])])
            child = child_start + child_size[0]
        break
    return b"".join(parts)


def _skeleton(reader: _Reader) -> bytes:
    head = reader.read(0, HEAD_SIZE)
    format_ = detect_format(head) or detect_video_format(head)
    if format_ == "PNG":
        return _png_skeleton(reader)
    if format_ == "JPEG":
        return _jpeg_skeleton(reader)
    if format_ == "WEBP":
        return _webp_skeleton(reader)
    if format_ in ("MP4", "MOV"):
        return _mp4_skeleton(reader)
    if format_ in ("WEBM", "MKV"):
        return _matroska_skeleton(reader)
    return head


def read_metadata_bytes(source: StreamInput) -> bytes:
    """Read the parts of an image or video file that hold metadata, skipping the image and media
    data: PNG chunks but the image data, JPEG segments up to the image data, WEBP chunks with only
    the header of the image data, MP4 / MOV boxes but `mdat`, and Matroska elements but clusters
    and cues.

    Files are read in parts, without loading them whole; streams that cannot seek are read to the
    end of their last metadata, and skipped data is dropped as it arrives. The result is much
    smaller than the file and can be passed to `parse()` and the other readers of this library,
    but it is not a valid image: the pixels, and so stealth metadata, are gone.
    """
    if isinstance(source, (str, os.PathLike)):
        with open(source, "rb") as file:
            return _skeleton(_Reader(file))
    if isinstance(source, (bytes, bytearray, memoryview)):
        return _skeleton(_Reader(io.BytesIO(bytes(source))))
    if hasattr(source, "read"):
        return _skeleton(_Reader(source))
    raise TypeError("unsupported input type")
