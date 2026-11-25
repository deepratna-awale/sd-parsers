"""Errors raised while reading metadata."""


class ParserError(Exception):
    """A parser could not read the metadata it was given."""


class MetadataError(ParserError):
    """The metadata did not match what an extractor expected; safe to ignore."""


class UnidentifiedImageError(Exception):
    """The input is not an image or video that can be read."""
