"""Try every parser against an image."""

from __future__ import annotations

import logging
import os
from typing import Any, BinaryIO, Optional, Sequence, Type, Union

from .data import PromptInfo
from .exceptions import MetadataError, UnidentifiedImageError
from .extractors import METADATA_EXTRACTORS, Eagerness, ExtractorImage, PixelDecoder
from .extractors.image import detect_format, is_other_image_format
from .loras import get_loras
from .parsers import MANAGED_PARSERS, Parser
from .size import get_generation_size
from .software import detect_software
from .stream import read_metadata_bytes
from .video import detect_video_format

logger = logging.getLogger(__name__)

#: A file path, the file contents, or a binary file object
ParseInput = Union[str, "os.PathLike[str]", bytes, bytearray, memoryview, BinaryIO]


def _read_input(source: ParseInput, needs_pixels: bool) -> bytes:
    """The bytes to parse. Files and streams are read without their image and media data, unless
    the pixels are needed for stealth metadata."""
    if isinstance(source, (bytes, bytearray, memoryview)):
        return bytes(source)
    if isinstance(source, (str, os.PathLike)):
        if needs_pixels:
            with open(source, "rb") as file:
                return file.read()
        return read_metadata_bytes(source)
    if hasattr(source, "read"):
        if needs_pixels:
            return source.read()
        return read_metadata_bytes(source)
    filename = getattr(source, "filename", None)
    if isinstance(filename, str) and filename:
        # a PIL image opened from a file
        return _read_input(filename, needs_pixels)
    raise TypeError(f"cannot parse {type(source).__name__}: pass a file path, bytes or a binary file object")


def _add_derived_fields(prompt_info: PromptInfo, image: ExtractorImage) -> None:
    """Fill in the fields that are worked out from the parsed data: software, LoRAs, provenance and size"""
    if prompt_info.software is None:
        prompt_info.software = detect_software(prompt_info)
    if prompt_info.loras is None:
        loras = get_loras(prompt_info)
        if loras:
            prompt_info.loras = loras
    if prompt_info.provenance is None:
        provenance = image.provenance()
        if provenance:
            prompt_info.provenance = provenance
    if not prompt_info.width or not prompt_info.height:
        size = get_generation_size(prompt_info)
        if size is None:
            try:
                size = image.size()
            except Exception:  # noqa: BLE001
                size = None
        if size:
            prompt_info.width = size.width
            prompt_info.height = size.height


class ParserManager:
    """Provides a simple way of testing multiple parser modules against a given image"""

    def __init__(
        self,
        *,
        debug: bool = False,
        eagerness: Eagerness = Eagerness.DEFAULT,
        managed_parsers: Optional[Sequence[Type[Parser]]] = None,
        normalize_parameters: bool = True,
    ) -> None:
        self.eagerness = eagerness
        self.debug = debug
        self.managed_parsers = [parser(normalize_parameters, debug) for parser in (managed_parsers or MANAGED_PARSERS)]

    def parse(
        self,
        source: ParseInput,
        eagerness: Optional[Eagerness] = None,
        decode_pixels: Optional[PixelDecoder] = None,
    ) -> Optional[PromptInfo]:
        """Try to extract image generation parameters from the given image.

        Accepts a file path, the file contents (`bytes`) or a binary file object, and returns a
        `PromptInfo`, or None when no known metadata is found.
        """
        target = eagerness or self.eagerness
        data = _read_input(source, target >= Eagerness.EAGER)
        if not detect_format(data) and not detect_video_format(data) and not is_other_image_format(data):
            raise UnidentifiedImageError("cannot identify image file")

        image = ExtractorImage(data, decode_pixels)
        if not image.format:
            logger.debug("Unknown image format")
            return None
        extractors = METADATA_EXTRACTORS.get(image.format)
        if not extractors:
            logger.debug("Unsupported image format: %s", image.format)
            return None

        for level in (Eagerness.FAST, Eagerness.DEFAULT, Eagerness.EAGER):
            if level > target:
                break
            for extractor in extractors.get(level, []):
                for parser in self.managed_parsers:
                    try:
                        parameters = extractor(image, parser.generator)
                    except MetadataError as error:
                        logger.debug("Error reading metadata: %s", error)
                        break  # try the next extractor
                    if parameters is None:
                        continue
                    try:
                        prompt_info = parser.parse(parameters)
                    except Exception as error:  # noqa: BLE001
                        # metadata in unexpected shapes can trip a parser anywhere: try the next one
                        logger.debug("Error in parser[%s]: %s", type(parser).__name__, error)
                        continue
                    _add_derived_fields(prompt_info, image)
                    return prompt_info
        return None
