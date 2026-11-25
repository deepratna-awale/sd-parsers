"""Image format detection and pixel decoding."""

from __future__ import annotations

import io
from dataclasses import dataclass
from typing import Callable, Optional


@dataclass
class DecodedPixels:
    """Raw, interleaved pixel data"""

    data: bytes
    width: int
    height: int
    channels: int


#: Decodes an image to raw pixels; needed for stealth (alpha channel) metadata only
PixelDecoder = Callable[[], DecodedPixels]


def detect_format(data: bytes) -> Optional[str]:
    """Detect the image format (`PNG`, `JPEG` or `WEBP`) from the file signature"""
    if len(data) >= 8 and data[0] == 0x89 and data[1:4] == b"PNG":
        return "PNG"
    if len(data) >= 3 and data[0] == 0xFF and data[1] == 0xD8 and data[2] == 0xFF:
        return "JPEG"
    if len(data) >= 12 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "WEBP"
    return None


def is_other_image_format(data: bytes) -> bool:
    """Image formats that are recognized, but carry no supported metadata"""
    head = bytes(data[:12])
    return (
        head.startswith(b"GIF8")
        or head.startswith(b"BM")
        or head.startswith(b"II*\x00")
        or head.startswith(b"MM\x00*")
        or head[4:8] == b"ftyp"  # AVIF, HEIF
        or head.startswith(b"\x00\x00\x01\x00")  # ICO
        or head.startswith(b"\xff\x0a")  # JPEG XL codestream
        or head == b"\x00\x00\x00\x0cJXL \x0d\x0a\x87\x0a"  # JPEG XL container
    )


def decode_with_pillow(data: bytes) -> DecodedPixels:
    from PIL import Image  # optional dependency

    with Image.open(io.BytesIO(data)) as image:
        # keep the alpha channel untouched: the stealth metadata lives in its lowest bits
        rgba = image if image.mode == "RGBA" else image.convert("RGBA")
        return DecodedPixels(rgba.tobytes(), rgba.width, rgba.height, 4)


def default_pixel_decoder(data: bytes) -> Optional[PixelDecoder]:
    """A Pillow based pixel decoder, when Pillow is installed"""
    try:
        import PIL  # noqa: F401
    except ImportError:
        return None
    return lambda: decode_with_pillow(data)
