"""AUTOMATIC1111 style parameters ("infotext")."""

from __future__ import annotations

import json
import math
import re
from typing import Any, Dict, List, Optional, Tuple

from ._util import dumps, is_number, js_trim, js_trim_start
from .data import Generators, PromptInfo, get_full_negative_prompt, get_full_prompt, get_models
from .loras import get_loras, lora_tag_name, loras_from_prompt_tags
from .size import get_generation_size


def _join_prompt(value: Any) -> str:
    if isinstance(value, list):
        return ", ".join(part for part in value if isinstance(part, str) and js_trim(part))
    return value if isinstance(value, str) else ""


def _normalize_newlines(text: str) -> str:
    return re.sub(r"\r\n?", "\n", text)


def _format_value(value: Any) -> str:
    if is_number(value) and isinstance(value, float) and math.isfinite(value) and not value.is_integer():
        value = float(format(value, ".6g"))
    text = value if isinstance(value, str) else dumps(value)
    return json.dumps(text, ensure_ascii=False) if re.search(r'[,:\n"]', text) else text


def _pick(parameters: Dict[str, Any], *keys: str) -> Any:
    for key in keys:
        value = parameters.get(key)
        if value is not None and value != "":
            return value
    return None


def _is_one(value: Any) -> bool:
    return (is_number(value) and value == 1) or value == "1"


def to_infotext(prompt_info: PromptInfo) -> str:
    """Format the generation data of an image as AUTOMATIC1111 style parameters ("infotext"),
    the text most tools accept for pasting settings and that `write_metadata()` embeds.

    Images in the AUTOMATIC1111 format get their original text back. For the others, the prompts,
    the first sampler's settings, the model and the LoRAs are written.
    """
    raw = prompt_info.raw_parameters or {}
    if prompt_info.generator == Generators.AUTOMATIC1111:
        for value in (raw.get("parameters"), raw.get("UserComment")):
            if isinstance(value, str) and js_trim(value) and not js_trim_start(value).startswith("{"):
                return js_trim(_normalize_newlines(value))

    prompt = js_trim(_normalize_newlines(_join_prompt(get_full_prompt(prompt_info))))
    negative_prompt = js_trim(_normalize_newlines(_join_prompt(get_full_negative_prompt(prompt_info))))

    loras = prompt_info.loras if prompt_info.loras is not None else get_loras(prompt_info)
    tagged = {lora.name for lora in loras_from_prompt_tags(prompt)}
    tags: List[str] = []
    for lora in loras:
        if lora_tag_name(lora.name) in tagged or lora.name in tagged:
            continue
        weights = [1 if lora.weight is None else lora.weight] + ([lora.clip_weight] if lora.clip_weight is not None else [])
        tags.append(f"<lora:{lora_tag_name(lora.name)}:{':'.join(dumps(w) for w in weights)}>")
    if tags:
        prompt = f"{prompt}\n{' '.join(tags)}" if prompt else " ".join(tags)

    sampler = prompt_info.samplers[0] if prompt_info.samplers else None
    parameters = {**prompt_info.metadata, **(sampler.parameters if sampler else {})}
    models = get_models(prompt_info)
    model = models[0] if models else None
    size = get_generation_size(prompt_info)
    if size is None and prompt_info.width and prompt_info.height:
        size_text: Optional[str] = f"{dumps(prompt_info.width)}x{dumps(prompt_info.height)}"
    else:
        size_text = f"{dumps(size.width)}x{dumps(size.height)}" if size else None
    lora_hashes = [f"{lora_tag_name(lora.name)}: {lora.hash}" for lora in loras if lora.hash]

    denoise = _pick(parameters, "denoising_strength", "denoise", "strength")
    clip_skip = _pick(parameters, "clip_skip", "clipSkip")
    # Easy Diffusion stores a flag that means "skip the last layer"
    if clip_skip is False:
        clip_skip = None
    elif clip_skip is True:
        clip_skip = 2

    fields: List[Tuple[str, Any]] = [
        ("Steps", _pick(parameters, "steps", "Steps", "num_inference_steps")),
        ("Sampler", sampler.name if sampler and sampler.name != "unknown" else None),
        ("Schedule type", _pick(parameters, "scheduler", "scheduler_name", "schedule")),
        ("CFG scale", _pick(parameters, "cfg_scale", "cfg", "cfgscale", "guidance_scale", "scale")),
        ("Seed", _pick(parameters, "seed", "Seed", "noise_seed")),
        ("Size", size_text),
        ("Model hash", model.hash if model else None),
        ("Model", lora_tag_name(model.name) if model and model.name else None),
        ("Denoising strength", None if _is_one(denoise) else denoise),
        ("Clip skip", clip_skip),
        ("Lora hashes", ", ".join(lora_hashes) if lora_hashes else None),
    ]
    settings = ", ".join(
        f"{key}: {_format_value(value)}" for key, value in fields if value is not None and value is not False and value != ""
    )

    lines = [prompt]
    if negative_prompt:
        lines.append(f"Negative prompt: {negative_prompt}")
    if settings:
        lines.append(settings)
    return "\n".join(lines)
