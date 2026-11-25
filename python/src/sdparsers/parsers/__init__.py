"""Parsers, one for each metadata format."""

from __future__ import annotations

from typing import Any, Dict

from ..data import Generators, PromptInfo
from ..exceptions import ParserError
from ._base import Parser, pop_keys
from .automatic1111 import AUTOMATIC1111Parser
from .comfyui import ComfyUIParser
from .invokeai import InvokeAIParser
from .simple import (
    CivitaiParser,
    DezgoParser,
    DrawThingsParser,
    DummyParser,
    EasyDiffusionParser,
    FooocusParser,
    HFSpaceParser,
    KusArtParser,
    NovelAIParser,
    RuinedFooocusParser,
    StabilityMatrixParser,
    SwarmUIParser,
    TensorArtParser,
)


class ProvenanceParser(Parser):
    """Reports images that hold no generation data but are labelled as AI made: ChatGPT, Gemini,
    Grok, Meta AI and other services that write C2PA manifests or an IPTC digital source type.
    Runs after the other parsers, so images with generation data keep their generator."""

    generator = Generators.C2PA

    def parse(self, parameters: Dict[str, Any]) -> PromptInfo:
        provenance = parameters.get("provenance")
        if provenance is None or not getattr(provenance, "ai_generated", False):
            raise ParserError("no AI provenance label found")
        metadata: Dict[str, Any] = {}
        if provenance.digital_source_type:
            metadata["digital_source_type"] = provenance.digital_source_type
        if provenance.vendor:
            metadata["vendor"] = provenance.vendor
        generator = Generators.C2PA if provenance.source == "C2PA" else Generators.IPTC
        prompt_info = PromptInfo(generator, [], metadata, {})
        if provenance.software is not None:
            prompt_info.software = provenance.software
        elif provenance.vendor is not None:
            prompt_info.software = provenance.vendor
        else:
            prompt_info.software = generator.value
        prompt_info.provenance = provenance
        return prompt_info


#: Default managed parsers in order of precedence
MANAGED_PARSERS = [
    SwarmUIParser,
    RuinedFooocusParser,
    HFSpaceParser,
    EasyDiffusionParser,
    DrawThingsParser,
    DezgoParser,
    KusArtParser,
    TensorArtParser,
    StabilityMatrixParser,
    CivitaiParser,
    FooocusParser,
    AUTOMATIC1111Parser,
    ComfyUIParser,
    InvokeAIParser,
    NovelAIParser,
    ProvenanceParser,
]

__all__ = [
    "Parser",
    "pop_keys",
    "MANAGED_PARSERS",
    "AUTOMATIC1111Parser",
    "CivitaiParser",
    "ComfyUIParser",
    "DezgoParser",
    "DrawThingsParser",
    "DummyParser",
    "EasyDiffusionParser",
    "FooocusParser",
    "HFSpaceParser",
    "InvokeAIParser",
    "KusArtParser",
    "NovelAIParser",
    "ProvenanceParser",
    "RuinedFooocusParser",
    "StabilityMatrixParser",
    "SwarmUIParser",
    "TensorArtParser",
]
