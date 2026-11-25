"""Tell apart the tools that write the same metadata format."""

from __future__ import annotations

import re
from typing import Any, Optional

from .data import Generators, PromptInfo


def detect_a1111_software(parameters: str) -> Optional[str]:
    """Name the tool behind an AUTOMATIC1111 style parameter string, from its `Version` and `App` fields"""
    if re.search(r"(?:^|[,\n])\s*App:\s*SD\.Next\b", parameters):
        return "SD.Next"
    if "Civitai resources:" in parameters or "Civitai metadata:" in parameters:
        return "Civitai"

    # a standalone "Version:" field, not one with a prefix like "ADetailer version:"
    match = re.search(r"(?:^|[,\n])\s*Version:\s*([^\s,]+)", parameters)
    if not match:
        return None
    version = match.group(1)

    if re.match(r"v[0-9]", version):
        return "Stable Diffusion WebUI"
    if version == "classic":
        return "Forge Classic"
    if version.startswith("neo"):
        return "Forge Neo"
    if re.match(r"f[0-9]+\.[0-9]+(?:\.[0-9]+)?-v", version):
        return "EasyReforge"
    if re.match(r"f[0-9]+\.[0-9]+(?:\.[0-9]+)?v[0-9]+-v", version):
        return "reForge"
    if re.match(r"f[0-9]", version):
        return "Forge"
    if version.startswith("Fooocus"):
        return "Fooocus"
    if version == "ComfyUI":
        return "ComfyUI"
    return None


def _text(value: Any) -> str:
    return value if isinstance(value, str) else ""


def detect_software(prompt_info: PromptInfo) -> str:
    """Work out which tool made an image, from its parsed generation data and its raw metadata.
    Falls back to the name of the generator."""
    raw = prompt_info.raw_parameters or {}

    if "smproj" in raw or "parameters-json" in raw:
        return "Stability Matrix"
    if "generation_data" in raw:
        return "TensorArt"
    if _text(raw.get("Software")).startswith("Fooocus") or "fooocus_scheme" in raw or raw.get("MakerNote") == "a1111":
        return "Fooocus"

    if prompt_info.generator == Generators.AUTOMATIC1111:
        source = raw.get("parameters")
        if source is None:
            source = raw.get("UserComment")
        detected = detect_a1111_software(_text(source))
        if detected:
            return detected
        # ComfyUI save nodes that write AUTOMATIC1111 parameters next to the node graph
        if '"class_type"' in _text(raw.get("prompt")):
            return "ComfyUI"

    generator = prompt_info.generator
    return generator.value if isinstance(generator, Generators) else generator
