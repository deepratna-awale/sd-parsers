"""Structured generation data."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from enum import Enum
from typing import TYPE_CHECKING, Any, Dict, List, Optional

from ._util import dumps, to_json

if TYPE_CHECKING:
    from .provenance import Provenance


class Generators(str, Enum):
    """One member for each metadata format that is understood.

    Tools that write the format of another generator (for example Forge, which writes the
    AUTOMATIC1111 format) are reported with that generator; `PromptInfo.software` names the
    actual tool.
    """

    AUTOMATIC1111 = "AUTOMATIC1111"
    COMFYUI = "ComfyUI"
    FOOOCUS = "Fooocus"
    INVOKEAI = "InvokeAI"
    NOVELAI = "NovelAI"
    SWARMUI = "SwarmUI"
    EASYDIFFUSION = "Easy Diffusion"
    DRAWTHINGS = "Draw Things"
    RUINED_FOOOCUS = "RuinedFooocus"
    STABILITY_MATRIX = "Stability Matrix"
    TENSORART = "TensorArt"
    CIVITAI = "Civitai"
    HF_SPACE = "Hugging Face Space"
    DEZGO = "Dezgo"
    KUSART = "KusArt"
    #: No generation data, but C2PA manifests (Content Credentials) that label the image as AI made
    C2PA = "C2PA"
    #: No generation data, but an IPTC digital source type in the XMP metadata that labels the image as AI made
    IPTC = "IPTC"
    UNKNOWN = "Unknown"

    def __str__(self) -> str:
        return self.value


@dataclass
class Model:
    """A checkpoint model used during image generation."""

    name: Optional[str] = None
    hash: Optional[str] = None
    model_id: Optional[str] = None
    #: Additional generator-specific information
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __post_init__(self) -> None:
        if self.name is None and self.hash is None:
            raise ValueError("Either name or hash need to be given.")

    def __str__(self) -> str:
        if self.name is None:
            return self.hash or ""
        return str(self.name)

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        if self.name is not None:
            result["name"] = self.name
        if self.hash is not None:
            result["hash"] = self.hash
        if self.model_id is not None:
            result["modelId"] = self.model_id
        result["metadata"] = self.metadata
        return result


@dataclass
class Prompt:
    """An image generation prompt."""

    value: str
    prompt_id: Optional[str] = None
    #: Additional generator-specific information
    metadata: Dict[str, Any] = field(default_factory=dict)

    def __str__(self) -> str:
        return str(self.value)

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {"value": self.value}
        if self.prompt_id is not None:
            result["promptId"] = self.prompt_id
        result["metadata"] = self.metadata
        return result


@dataclass
class Sampler:
    """A sampler used during image generation."""

    name: Any
    #: Generation parameters, including cfg_scale, seed, steps and others
    parameters: Dict[str, Any] = field(default_factory=dict)
    sampler_id: Optional[str] = None
    model: Optional[Model] = None
    prompts: List[Prompt] = field(default_factory=list)
    negative_prompts: List[Prompt] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {"name": self.name, "parameters": self.parameters}
        if self.sampler_id is not None:
            result["samplerId"] = self.sampler_id
        if self.model is not None:
            result["model"] = self.model.to_dict()
        result["prompts"] = [prompt.to_dict() for prompt in self.prompts]
        result["negativePrompts"] = [prompt.to_dict() for prompt in self.negative_prompts]
        return result


@dataclass
class Lora:
    """A LoRA (or LyCORIS / LoCon network) that was applied to an image."""

    #: Name as the tool wrote it: file name, path, display name or AIR
    name: str
    #: Model (UNet) strength
    weight: Optional[float] = None
    #: Text encoder strength, when it was recorded separately and differs from `weight`
    clip_weight: Optional[float] = None
    #: Hash as the tool wrote it
    hash: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {"name": self.name}
        if self.weight is not None:
            result["weight"] = self.weight
        if self.clip_weight is not None:
            result["clipWeight"] = self.clip_weight
        if self.hash is not None:
            result["hash"] = self.hash
        return result


def _unique(items: List[Any], key) -> List[Any]:
    seen = set()
    result = []
    for item in items:
        identity = key(item)
        if identity not in seen:
            seen.add(identity)
            result.append(item)
    return result


def _prompt_key(prompt: Prompt) -> str:
    return dumps([prompt.value, prompt.prompt_id, prompt.metadata])


@dataclass
class PromptInfo:
    """Structured image generation parameters."""

    #: Image generator which might have produced the parsed image
    generator: Generators
    #: Samplers used in generating the parsed image
    samplers: List[Sampler] = field(default_factory=list)
    #: Additional parameters found in the image metadata, highly dependent on the generator
    metadata: Dict[str, Any] = field(default_factory=dict)
    #: Unprocessed parameters as found in the parsed image
    raw_parameters: Dict[str, Any] = field(default_factory=dict)
    #: The tool that made the image, when it can be told apart from the generator
    software: Optional[str] = None
    #: LoRAs applied to the image, when any were recorded
    loras: Optional[List[Lora]] = None
    #: Image size, as recorded in the generation data or read from the image header
    width: Optional[int] = None
    height: Optional[int] = None
    #: Provenance labels (C2PA manifests or the XMP digital source type), when the image has any
    provenance: Optional["Provenance"] = None

    @property
    def full_prompt(self) -> str:
        return get_full_prompt(self)

    @property
    def full_negative_prompt(self) -> str:
        return get_full_negative_prompt(self)

    @property
    def prompts(self) -> List[Prompt]:
        return get_prompts(self)

    @property
    def negative_prompts(self) -> List[Prompt]:
        return get_negative_prompts(self)

    @property
    def models(self) -> List[Model]:
        return get_models(self)

    def to_dict(self) -> Dict[str, Any]:
        return prompt_info_to_dict(self)

    def to_json(self) -> str:
        return prompt_info_to_json(self)


def get_prompts(prompt_info: PromptInfo) -> List[Prompt]:
    """Unique prompts used in generating the image"""
    return _unique([p for s in prompt_info.samplers for p in s.prompts], _prompt_key)


def get_negative_prompts(prompt_info: PromptInfo) -> List[Prompt]:
    """Unique negative prompts used in generating the image"""
    return _unique([p for s in prompt_info.samplers for p in s.negative_prompts], _prompt_key)


def get_models(prompt_info: PromptInfo) -> List[Model]:
    """Unique models used in generating the image"""
    models = [s.model for s in prompt_info.samplers if s.model is not None]
    return _unique(models, lambda m: dumps([m.model_id, m.name, m.hash, m.metadata]))


def get_full_prompt(prompt_info: PromptInfo) -> Any:
    """The full prompt if the metadata has one, otherwise all prompts joined with commas"""
    if "full_prompt" in prompt_info.metadata:
        return prompt_info.metadata["full_prompt"]
    return ", ".join(str(prompt) for prompt in get_prompts(prompt_info))


def get_full_negative_prompt(prompt_info: PromptInfo) -> Any:
    """The full negative prompt if the metadata has one, otherwise all negative prompts joined with commas"""
    if "full_negative_prompt" in prompt_info.metadata:
        return prompt_info.metadata["full_negative_prompt"]
    return ", ".join(str(prompt) for prompt in get_negative_prompts(prompt_info))


def _generator_name(generator: Any) -> Any:
    return generator.value if isinstance(generator, Generators) else generator


def prompt_info_to_dict(prompt_info: PromptInfo) -> Dict[str, Any]:
    """The generation data as a JSON compatible dict, in the same shape as the npm package writes it"""
    result: Dict[str, Any] = {
        "full_prompt": get_full_prompt(prompt_info),
        "full_negative_prompt": get_full_negative_prompt(prompt_info),
        "generator": _generator_name(prompt_info.generator),
        "software": _generator_name(prompt_info.generator) if prompt_info.software is None else prompt_info.software,
    }
    if prompt_info.loras is not None:
        result["loras"] = [lora.to_dict() for lora in prompt_info.loras]
    if prompt_info.width and prompt_info.height:
        result["width"] = prompt_info.width
        result["height"] = prompt_info.height
    if prompt_info.provenance is not None:
        result["provenance"] = prompt_info.provenance.summary()
    result["samplers"] = [sampler.to_dict() for sampler in prompt_info.samplers]
    result["metadata"] = prompt_info.metadata
    result["rawParameters"] = prompt_info.raw_parameters
    return to_json(result)


def prompt_info_to_json(prompt_info: PromptInfo, **kwargs: Any) -> str:
    """The generation data as JSON"""
    kwargs.setdefault("ensure_ascii", False)
    return json.dumps(prompt_info_to_dict(prompt_info), **kwargs)
