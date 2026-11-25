"""A small CBOR (RFC 8949) decoder."""

from __future__ import annotations

import math
import struct
from dataclasses import dataclass
from typing import Any, List, Optional

from .._util import js_str, utf8_lenient


@dataclass
class CborTagged:
    """A CBOR tag that has no plain Python equivalent"""

    tag: int
    value: Any

    def to_dict(self) -> dict:
        return {"tag": self.tag, "value": self.value}


_BREAK = object()
_UNDEFINED = None


class CborError(ValueError):
    pass


def decode_cbor(data: bytes) -> Any:
    """Decode one CBOR item. Byte strings become `bytes`, maps become dicts with string keys,
    and tags other than date/time keep their tag number."""
    data = bytes(data)
    offset = 0

    def need(length: int) -> None:
        if offset + length > len(data):
            raise CborError("CBOR data ends early")

    def take(length: int) -> bytes:
        nonlocal offset
        need(length)
        offset += length
        return data[offset - length : offset]

    def read_length(info: int) -> Optional[int]:
        if info < 24:
            return info
        if info == 24:
            return take(1)[0]
        if info == 25:
            return struct.unpack(">H", take(2))[0]
        if info == 26:
            return struct.unpack(">I", take(4))[0]
        if info == 27:
            return struct.unpack(">Q", take(8))[0]
        if info == 31:
            return None
        raise CborError(f"Invalid CBOR length {info}")

    def read_half(bits: int) -> float:
        exponent = (bits >> 10) & 0x1F
        fraction = bits & 0x3FF
        sign = -1 if bits & 0x8000 else 1
        if exponent == 0:
            return sign * 2.0**-14 * (fraction / 1024)
        if exponent == 31:
            return math.nan if fraction else sign * math.inf
        return sign * 2.0 ** (exponent - 15) * (1 + fraction / 1024)

    def read_chunks(major: int) -> bytes:
        chunks: List[bytes] = []
        while True:
            item = read_item()
            if item is _BREAK:
                return b"".join(chunks)
            if major == 2:
                chunks.append(bytes(item))
            else:
                chunks.append(str(item).encode("utf-8", errors="surrogatepass"))

    def read_item() -> Any:
        nonlocal offset
        initial = take(1)[0]
        major = initial >> 5
        info = initial & 0x1F

        if major == 7:
            if info == 20:
                return False
            if info == 21:
                return True
            if info in (22, 23):
                return None
            if info == 25:
                return read_half(struct.unpack(">H", take(2))[0])
            if info == 26:
                return struct.unpack(">f", take(4))[0]
            if info == 27:
                return struct.unpack(">d", take(8))[0]
            if info == 31:
                return _BREAK
            if info == 24:
                take(1)
            return _UNDEFINED

        length = read_length(info)
        if major == 0:
            return length
        if major == 1:
            return -1 - (length or 0)
        if major == 2:
            return read_chunks(2) if length is None else take(length)
        if major == 3:
            return utf8_lenient(read_chunks(3) if length is None else take(length))
        if major == 4:
            items: List[Any] = []
            i = 0
            while length is None or i < length:
                item = read_item()
                if item is _BREAK:
                    break
                items.append(item)
                i += 1
            return items
        if major == 5:
            result: dict = {}
            i = 0
            while length is None or i < length:
                key = read_item()
                if key is _BREAK:
                    break
                result[_map_key(key)] = read_item()
                i += 1
            return result
        value = read_item()
        # 0: date/time string, 1: epoch seconds
        if length in (0, 1):
            return value
        return CborTagged(length, value)

    return read_item()


def _map_key(key: Any) -> str:
    if isinstance(key, bytes):
        return ",".join(str(byte) for byte in key)
    if isinstance(key, CborTagged):
        return "[object Object]"
    if key is None:
        return "undefined"
    return js_str(key)
