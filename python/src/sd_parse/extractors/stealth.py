"""Stealth metadata hidden in the alpha channel of PNG images."""

from __future__ import annotations

import gzip

STEALTH_HEADER = "stealth_pngcomp"


class _LSBExtractor:
    """Reads the least significant bits of the alpha channel, column by column"""

    def __init__(self, data: bytes, width: int, height: int, channels: int) -> None:
        self.data = data
        self.width = width
        self.height = height
        self.channels = channels
        self.row = 0
        self.col = 0

    def _next_bit(self) -> int:
        if self.row >= self.height or self.col >= self.width:
            raise ValueError("no more image data")
        bit = self.data[(self.row * self.width + self.col) * self.channels + self.channels - 1] & 1
        self.row += 1
        if self.row == self.height:
            self.row = 0
            self.col += 1
        return bit

    def next_bytes(self, n: int) -> bytes:
        result = bytearray(n)
        for i in range(n):
            byte = 0
            for _ in range(8):
                byte = (byte << 1) | self._next_bit()
            result[i] = byte
        return bytes(result)

    def read_uint32(self) -> int:
        return int.from_bytes(self.next_bytes(4), "big")


def read_stealth_text(data: bytes, width: int, height: int, channels: int) -> str:
    """Decode the stealth metadata hidden in the alpha channel of raw, interleaved pixel data"""
    extractor = _LSBExtractor(data, width, height, channels)
    magic = extractor.next_bytes(len(STEALTH_HEADER)).decode("utf-8")
    if magic != STEALTH_HEADER:
        raise ValueError(f'Header "{magic}" does not match the expected value of "{STEALTH_HEADER}"')
    length = extractor.read_uint32() // 8
    raw = extractor.next_bytes(length)
    text = gzip.decompress(raw).decode("utf-8")
    return text[1:] if text.startswith("﻿") else text
