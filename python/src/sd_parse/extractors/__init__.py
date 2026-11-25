"""Metadata extractors: read the raw metadata of an image for the parsers."""

from __future__ import annotations

from enum import IntEnum
from typing import Any, Callable, Dict, List, Optional

from .._util import load_json
from ..data import Generators
from ..exceptions import MetadataError
from .entries import (
    MetadataEntries,
    decode_user_comment,
    get_xmp_property,
    read_exif_entries,
    read_exif_image_entries,
    read_jpeg_segments,
    read_webp_chunks,
    read_xmp_entries,
)
from .image import DecodedPixels, PixelDecoder, default_pixel_decoder, detect_format, is_other_image_format
from .png import PngTextData, read_png_text
from .stealth import read_stealth_text

__all__ = [
    "Eagerness",
    "ExtractorImage",
    "METADATA_EXTRACTORS",
    "DecodedPixels",
    "PixelDecoder",
    "MetadataEntries",
    "PngTextData",
    "detect_format",
    "is_other_image_format",
    "read_png_text",
    "read_stealth_text",
    "read_exif_entries",
    "read_exif_image_entries",
    "read_jpeg_segments",
    "read_webp_chunks",
    "read_xmp_entries",
    "get_xmp_property",
    "decode_user_comment",
]


class Eagerness(IntEnum):
    """How hard to look for metadata"""

    #: Only the metadata tools usually write to
    FAST = 1
    #: All text metadata
    DEFAULT = 2
    #: Also stealth metadata in the alpha channel (needs Pillow)
    EAGER = 3


_MISSING = object()


class ExtractorImage:
    """An encoded image (or video), with the results of the extractors cached"""

    def __init__(self, data: bytes, decode_pixels: Optional[PixelDecoder] = None, image_format: Optional[str] = None) -> None:
        from ..video import detect_video_format

        self.data = bytes(data)
        self.format = image_format or detect_format(self.data) or detect_video_format(self.data)
        self.decode_pixels = decode_pixels or default_pixel_decoder(self.data)
        self._cache: Dict[str, Any] = {}

    def _cached(self, key: str, compute: Callable[[], Any]) -> Any:
        value = self._cache.get(key, _MISSING)
        if value is _MISSING:
            value = compute()
            self._cache[key] = value
        return value

    def png_text(self) -> PngTextData:
        return self._cached("png", lambda: read_png_text(self.data))

    def exif_entries(self) -> Optional[MetadataEntries]:
        def compute() -> Optional[MetadataEntries]:
            if self.format not in ("JPEG", "WEBP"):
                return None
            return read_exif_image_entries(self.data, self.format)

        return self._cached("exif", compute)

    def video_metadata(self):
        from ..video import read_video_metadata

        return self._cached("video", lambda: read_video_metadata(self.data))

    def provenance(self):
        from ..provenance import read_provenance

        def compute():
            try:
                return read_provenance(self.data)
            except Exception:
                return None

        return self._cached("provenance", compute)

    def stealth(self) -> Dict[str, Any]:
        def compute() -> Dict[str, Any]:
            try:
                if not self.decode_pixels:
                    raise RuntimeError("no pixel decoder available (install Pillow or pass `decode_pixels`)")
                pixels = self.decode_pixels()
                text = read_stealth_text(pixels.data, pixels.width, pixels.height, pixels.channels)
                try:
                    parsed = load_json(text)
                except ValueError:
                    parsed = None
                return {"text": text, "json": parsed}
            except Exception as error:  # noqa: BLE001
                return {"error": error}

        return self._cached("stealth", compute)

    def size(self):
        from ..size import ImageSize, read_image_size
        from ..video import detect_video_format

        if detect_video_format(self.data):
            video = self.video_metadata()
            if video:
                return ImageSize(video.width, video.height) if video.width and video.height else None
        return read_image_size(self.data)


ExtractorFunction = Callable[[ExtractorImage, Generators], Optional[Dict[str, Any]]]


def png_image_info(image: ExtractorImage, _: Generators) -> Optional[Dict[str, Any]]:
    """The PNG text chunks preceding the image data (PIL's `Image.info`)"""
    return image.png_text().info


def png_image_text(image: ExtractorImage, _: Generators) -> Optional[Dict[str, Any]]:
    """All PNG text chunks (iTXt, tEXt and zTXt chunks may appear at the end of the file)"""
    return image.png_text().text


def png_stenographic_alpha(image: ExtractorImage, generator: Generators) -> Optional[Dict[str, Any]]:
    """Stealth metadata from the alpha channel of a PNG image"""
    if image.png_text().color_type != 6:
        raise MetadataError("image mode is not RGBA")
    stealth = image.stealth()
    if "error" in stealth:
        raise MetadataError(f"error reading metadata: {stealth['error']}")
    if generator == Generators.NOVELAI:
        return stealth["json"]
    if generator == Generators.AUTOMATIC1111:
        return {"parameters": stealth["text"]} if stealth["text"] else None
    return None


def jpeg_user_comment(image: ExtractorImage, generator: Generators) -> Optional[Dict[str, Any]]:
    """The JPEG / WEBP UserComment EXIF field"""
    entries = image.exif_entries()
    value = entries.get("UserComment") if entries else None
    if not value:
        raise MetadataError("error reading UserComment: no exif data")
    if generator in (Generators.AUTOMATIC1111, Generators.FOOOCUS):
        return {"parameters": value}
    return None


def exif_image_entries(image: ExtractorImage, _: Generators) -> Optional[Dict[str, Any]]:
    """All text metadata of a JPEG / WEBP image: EXIF text tags, JPEG comments and XMP properties"""
    entries = image.exif_entries()
    return dict(entries) if entries else None


def video_entries(image: ExtractorImage, _: Generators) -> Optional[Dict[str, Any]]:
    """The text metadata of an MP4, MOV, WebM or MKV video (ffmpeg metadata tags and XMP)"""
    metadata = image.video_metadata()
    return dict(metadata.entries) if metadata and metadata.entries else None


def provenance_labels(image: ExtractorImage, generator: Generators) -> Optional[Dict[str, Any]]:
    """Provenance labels for the provenance parser, as `{"provenance": ...}`"""
    if generator != Generators.C2PA:
        return None
    provenance = image.provenance()
    return {"provenance": provenance} if provenance else None


_IMAGE_EXTRACTORS: Dict[Eagerness, List[ExtractorFunction]] = {
    Eagerness.FAST: [jpeg_user_comment, exif_image_entries, provenance_labels],
}
_VIDEO_EXTRACTORS: Dict[Eagerness, List[ExtractorFunction]] = {Eagerness.FAST: [video_entries, provenance_labels]}

#: Metadata extractors by image format and eagerness level
METADATA_EXTRACTORS: Dict[str, Dict[Eagerness, List[ExtractorFunction]]] = {
    "PNG": {
        Eagerness.FAST: [png_image_info],
        Eagerness.DEFAULT: [png_image_text, provenance_labels],
        Eagerness.EAGER: [png_stenographic_alpha],
    },
    "JPEG": _IMAGE_EXTRACTORS,
    "WEBP": _IMAGE_EXTRACTORS,
    "MP4": _VIDEO_EXTRACTORS,
    "MOV": _VIDEO_EXTRACTORS,
    "WEBM": _VIDEO_EXTRACTORS,
    "MKV": _VIDEO_EXTRACTORS,
}
