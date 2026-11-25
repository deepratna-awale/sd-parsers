"""Image size, from the image header or the generation data."""

from __future__ import annotations

import re
import struct
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any, Optional

from ._util import is_dict, js_number, js_values

if TYPE_CHECKING:
    from .data import PromptInfo


@dataclass
class ImageSize:
    width: int
    height: int


def read_image_size(data: bytes) -> Optional[ImageSize]:
    """Read the size of a PNG, JPEG or WEBP image from its header"""
    data = bytes(data)
    try:
        # PNG: IHDR is always the first chunk
        if len(data) >= 24 and data[0] == 0x89 and data[12:16] == b"IHDR":
            return ImageSize(*struct.unpack_from(">II", data, 16))

        # JPEG: the first start-of-frame segment
        if len(data) >= 4 and data[0] == 0xFF and data[1] == 0xD8:
            offset = 2
            while offset + 9 < len(data):
                if data[offset] != 0xFF:
                    return None
                marker = data[offset + 1]
                if marker == 0xFF:
                    offset += 1
                    continue
                if marker == 0xD8 or marker == 0x01 or 0xD0 <= marker <= 0xD7:
                    offset += 2
                    continue
                if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
                    height, width = struct.unpack_from(">HH", data, offset + 5)
                    return ImageSize(width, height)
                if marker in (0xDA, 0xD9):
                    return None
                offset += 2 + struct.unpack_from(">H", data, offset + 2)[0]
            return None

        # WEBP: VP8X, VP8L or VP8 chunk
        if len(data) >= 30 and data[0:4] == b"RIFF" and data[8:12] == b"WEBP":
            type_ = data[12:16]
            if type_ == b"VP8X":
                width = 1 + (data[24] | (data[25] << 8) | (data[26] << 16))
                height = 1 + (data[27] | (data[28] << 8) | (data[29] << 16))
                return ImageSize(width, height)
            if type_ == b"VP8L" and data[20] == 0x2F:
                bits = struct.unpack_from("<I", data, 21)[0]
                return ImageSize((bits & 0x3FFF) + 1, ((bits >> 14) & 0x3FFF) + 1)
            if type_ == b"VP8 " and data[23] == 0x9D and data[24] == 0x01 and data[25] == 0x2A:
                width, height = struct.unpack_from("<HH", data, 26)
                return ImageSize(width & 0x3FFF, height & 0x3FFF)
    except (struct.error, IndexError):
        # truncated header
        pass
    return None


_SIZE = re.compile(r"\s*\(?\s*([0-9]+)\s*[x×,]\s*([0-9]+)\s*\)?", re.I)


def _positive(value: Any) -> bool:
    number = js_number(value)
    return number == number and number > 0


def _parse_size(value: Any) -> Optional[ImageSize]:
    if is_dict(value):
        width = js_number(value.get("width"))
        height = js_number(value.get("height"))
        return ImageSize(width, height) if _positive(width) and _positive(height) else None
    if not isinstance(value, str):
        return None
    match = _SIZE.match(value)
    return ImageSize(int(match.group(1)), int(match.group(2))) if match else None


def get_generation_size(prompt_info: "PromptInfo") -> Optional[ImageSize]:
    """Find the image size recorded in the generation data (`Size: 1024x1024`, `width` / `height`, ...)"""
    metadata = prompt_info.metadata or {}
    sources = [metadata] + [sampler.parameters for sampler in prompt_info.samplers]
    for source in sources:
        for key in ("Size", "size", "resolution", "Resolution"):
            size = _parse_size(source.get(key))
            if size:
                return size
        for w, h in (("width", "height"), ("Width", "Height")):
            width = js_number(source.get(w))
            height = js_number(source.get(h))
            if _positive(width) and _positive(height):
                return ImageSize(width, height)

    # ComfyUI: the size of the latent image node
    for value in js_values(metadata):
        for entry in value if isinstance(value, list) else []:
            if is_dict(entry) and _positive(entry.get("width")) and _positive(entry.get("height")):
                return ImageSize(js_number(entry.get("width")), js_number(entry.get("height")))
            # rgthree's SDXL Empty Latent Image: "1024 x 1024  (square)"
            size = _parse_size(entry.get("dimensions")) if is_dict(entry) else None
            if size:
                return size
    return None
