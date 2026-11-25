"""Provenance labels: C2PA manifests and the IPTC digital source type."""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Dict, Optional

from ..extractors.entries import read_jpeg_segments, read_webp_chunks, read_xmp_entries
from ..extractors.image import detect_format
from ..extractors.png import read_png_text
from ..video import read_video_metadata
from .c2pa import (
    C2paAction,
    C2paManifest,
    C2paManifestStore,
    JumbfBox,
    extract_c2pa,
    read_c2pa,
    read_jumbf,
)
from .cbor import CborTagged, decode_cbor

__all__ = [
    "Provenance",
    "read_provenance",
    "read_c2pa",
    "read_jumbf",
    "extract_c2pa",
    "decode_cbor",
    "CborTagged",
    "C2paAction",
    "C2paManifest",
    "C2paManifestStore",
    "JumbfBox",
]

IPTC_SOURCE_TYPES = "http://cv.iptc.org/newscodes/digitalsourcetype/"
AI_SOURCE_TYPES = {"trainedAlgorithmicMedia", "compositeWithTrainedAlgorithmicMedia", "compositeSynthetic"}


@dataclass
class Provenance:
    """What an image says about where it came from. Nothing here is verified: signatures are not
    checked, and the labels are easy to remove or fake."""

    #: Where the information was found: `C2PA` or `XMP`
    source: str
    #: The image is labelled as made, or partly made, by generative AI
    ai_generated: bool
    #: IPTC digital source type of the original image, without the vocabulary URL
    digital_source_type: Optional[str] = None
    #: Company behind the tool (`OpenAI`, `Google`, ...)
    vendor: Optional[str] = None
    #: Tool that made the image, when the metadata names it (`ChatGPT`, `Gemini`, ...)
    software: Optional[str] = None
    #: All C2PA manifests, oldest first
    c2pa: Optional[C2paManifestStore] = None

    def summary(self) -> Dict[str, Any]:
        """JSON compatible, with the labels of the C2PA assertions instead of their contents"""
        result: Dict[str, Any] = {"source": self.source, "aiGenerated": self.ai_generated}
        if self.digital_source_type is not None:
            result["digitalSourceType"] = self.digital_source_type
        if self.vendor is not None:
            result["vendor"] = self.vendor
        if self.software is not None:
            result["software"] = self.software
        if self.c2pa is not None:
            result["manifests"] = [manifest.summary() for manifest in self.c2pa.manifests]
        return result


VENDORS = [
    (re.compile(r"openai", re.I), "OpenAI"),
    (re.compile(r"google", re.I), "Google"),
    (re.compile(r"adobe", re.I), "Adobe"),
    (re.compile(r"microsoft", re.I), "Microsoft"),
    (re.compile(r"\bxai\b|spacexai|grok", re.I | re.A), "xAI"),
    (re.compile(r"\bmeta\b|facebook|instagram", re.I | re.A), "Meta"),
    (re.compile(r"stability", re.I), "Stability AI"),
    (re.compile(r"midjourney", re.I), "Midjourney"),
    (re.compile(r"runway", re.I), "Runway"),
    (re.compile(r"black forest labs", re.I), "Black Forest Labs"),
]


def _vendor_of(*names: Optional[str]) -> Optional[str]:
    for name in names:
        if not name:
            continue
        for pattern, vendor in VENDORS:
            if pattern.search(name):
                return vendor
    return None


def _source_type(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    return value[len(IPTC_SOURCE_TYPES) :] if value.startswith(IPTC_SOURCE_TYPES) else value


def _creative_work_author(manifest: C2paManifest) -> Optional[str]:
    work = manifest.assertions.get("c2pa.creative_work")
    if work is None:
        work = manifest.assertions.get("stds.schema-org.CreativeWork")
    authors = work.get("author") if isinstance(work, dict) else None
    items = authors if isinstance(authors, list) else ([authors] if authors else [])
    for author in items:
        if isinstance(author, dict) and isinstance(author.get("name"), str):
            return author["name"]
    return None


def _software_name(agent: Optional[str], vendor: Optional[str], ai_generated: bool) -> Optional[str]:
    """Product names for agents that only name a model, and for vendors that don't name one"""
    if agent:
        if re.match(r"chatgpt\b", agent, re.I | re.A):
            return "ChatGPT"
        if re.match(r"(?:gpt-image|dall-e)", agent, re.I):
            return "ChatGPT"
        return re.sub(r"\s+[0-9]+(?:\.[0-9]+)*$", "", agent)
    if not ai_generated:
        return None
    if vendor == "Google":
        return "Gemini"
    if vendor == "Meta":
        return "Meta AI"
    return None


def _from_c2pa(store: C2paManifestStore) -> Provenance:
    # the first manifest describes how the image was made, later ones how it was edited
    actions = [action for manifest in store.manifests for action in manifest.actions]
    created = next((a for a in actions if a.action == "c2pa.created"), None) or next(
        (a for a in actions if a.digital_source_type), None
    )
    digital_source_type = _source_type(created.digital_source_type if created else None)
    ai_generated = any((_source_type(a.digital_source_type) or "") in AI_SOURCE_TYPES for a in actions)
    origin = store.manifests[0] if store.manifests else None
    agent = (created.software_agent if created else None) or next(
        (a.software_agent for a in actions if a.software_agent), None
    )
    vendor = _vendor_of(
        origin.signers[0] if origin and origin.signers else None,
        _creative_work_author(origin) if origin else None,
        origin.claim_generator if origin else None,
        agent,
    )
    return Provenance("C2PA", ai_generated, digital_source_type, vendor, _software_name(agent, vendor, ai_generated), store)


def _read_xmp(data: bytes) -> Optional[str]:
    format_ = detect_format(data)
    if format_ == "PNG":
        xmp = read_png_text(data).text.get("XML:com.adobe.xmp")
        return xmp if isinstance(xmp, str) else None
    if format_ == "JPEG":
        return read_jpeg_segments(data)[1]
    if format_ == "WEBP":
        return read_webp_chunks(data)[1]
    video = read_video_metadata(data)
    return video.xmp if video else None


def read_provenance(data: bytes) -> Optional[Provenance]:
    """Read the provenance labels of a PNG, JPEG, WEBP, MP4 or MOV file: C2PA manifests, or else
    the IPTC digital source type in its XMP metadata. Returns None when the image has neither."""
    data = bytes(data)
    store = read_c2pa(data)
    if store and store.manifests:
        return _from_c2pa(store)

    xmp = _read_xmp(data)
    if not xmp:
        return None
    entries = read_xmp_entries(xmp)
    digital_source_type = _source_type(entries.get("DigitalSourceType"))
    if not digital_source_type:
        return None
    ai_generated = digital_source_type in AI_SOURCE_TYPES
    vendor = _vendor_of(entries.get("Publisher"), entries.get("CreatorTool"))
    creator_tool = entries.get("CreatorTool")
    software = creator_tool if creator_tool is not None else _software_name(None, vendor, ai_generated)
    return Provenance("XMP", ai_generated, digital_source_type, vendor, software)
