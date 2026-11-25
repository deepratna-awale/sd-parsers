"""The LoRAs applied to an image."""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from ._util import (
    is_dict,
    is_finite_number,
    js_items,
    js_keys,
    js_number,
    js_str,
    js_trim,
    js_trim_start,
    js_values,
    load_json,
)
from .data import Generators, Lora, PromptInfo
from .parsers.automatic1111 import extract_metadata

__all__ = ["Lora", "get_loras", "loras_from_prompt_tags", "loras_from_a1111", "loras_from_comfy_graph", "lora_tag_name"]


def _num(value: Any) -> Optional[float]:
    if is_finite_number(value):
        return value
    if isinstance(value, str) and js_trim(value) != "":
        number = js_number(value)
        if is_finite_number(number):
            return number
    return None


def _str(value: Any) -> str:
    return value if isinstance(value, str) else ""


def _parse_json(value: Any) -> Any:
    if not isinstance(value, str):
        return value
    try:
        return load_json(re.sub(r"[\x00\s]+$", "", value))
    except (ValueError, TypeError):
        return None


def _make_lora(name: Any, weight: Any = None, clip_weight: Any = None, hash_: Any = None) -> Optional[Lora]:
    if not isinstance(name, str) or not js_trim(name) or name == "None":
        return None
    lora = Lora(js_trim(name))
    w = _num(weight)
    c = _num(clip_weight)
    if w is not None:
        lora.weight = w
    if c is not None and c != w:
        lora.clip_weight = c
    if isinstance(hash_, str) and hash_:
        lora.hash = hash_
    return lora


def _compact(loras: List[Optional[Lora]]) -> List[Lora]:
    return [lora for lora in loras if lora is not None]


def _coalesce(*values: Any) -> Any:
    for value in values:
        if value is not None:
            return value
    return None


def lora_tag_name(name: str) -> str:
    """File name without directory and extension, the name A1111 uses in `<lora:...>` tags"""
    name = re.sub(r"^.*[\\/]", "", name, flags=re.S)
    return re.sub(r"\.(safetensors|ckpt|pt|pth|bin)$", "", name, flags=re.I)


def loras_from_prompt_tags(prompt: str) -> List[Lora]:
    """Read `<lora:name:weight>` / `<lora:name:unet:te>` (and `<lyco:...>`) tags from a prompt"""
    loras: List[Lora] = []
    for match in re.finditer(r"<(?:lora|lyco):([^>]+)>", prompt, re.I):
        parts = match.group(1).split(":")
        name = parts.pop(0) if parts else ""
        # names may hold colons; the weights are the trailing numeric parts
        while len(parts) > 2 or (parts and _num(parts[0]) is None):
            name += ":" + parts.pop(0)
        lora = _make_lora(name, parts[0] if parts else 1, parts[1] if len(parts) > 1 else None)
        if lora:
            loras.append(lora)
    return loras


def loras_from_a1111(parameters: str) -> List[Lora]:
    """The LoRAs of an AUTOMATIC1111 style parameter string: prompt tags, `Lora hashes` and `Civitai resources`"""
    lines = parameters.split("\n")
    settings = extract_metadata(lines[-1] if lines else "")
    prompt = parameters.split("Negative prompt:")[0]
    loras = loras_from_prompt_tags(prompt)

    hashes: Dict[str, str] = {}
    if isinstance(settings.get("Lora hashes"), str):
        for entry in settings["Lora hashes"].split(","):
            separator = entry.rfind(":")
            if separator > 0:
                hashes[js_trim(entry[:separator])] = js_trim(entry[separator + 1 :])
    for lora in loras:
        hash_ = hashes.get(lora.name)
        if hash_ is None:
            hash_ = hashes.get(lora.name.replace(",", ""))
        if hash_:
            lora.hash = hash_

    # ComfyUI's SaveImageWithMetaData: `Lora_0 Model name: x, Lora_0 Strength model: 1, ...`
    i = 0
    while isinstance(settings.get(f"Lora_{i} Model name"), str):
        lora = _make_lora(
            settings[f"Lora_{i} Model name"],
            settings.get(f"Lora_{i} Strength model"),
            settings.get(f"Lora_{i} Strength clip"),
            settings.get(f"Lora_{i} Model hash"),
        )
        if lora:
            loras.append(lora)
        i += 1

    resources = settings.get("Civitai resources")
    if isinstance(resources, list):
        for resource in resources:
            if not is_dict(resource) or not re.search(r"lora|lycoris|locon", _str(resource.get("type")), re.I):
                continue
            name = _coalesce(resource.get("modelName"), resource.get("modelVersionName"))
            if any(lora.name == name for lora in loras):
                continue
            lora = _make_lora(name, resource.get("weight"), None, resource.get("hash"))
            if lora:
                loras.append(lora)
    return loras


def _loras_from_comfy_node(node: Dict[str, Any]) -> List[Lora]:
    """The LoRAs of one ComfyUI node: loader nodes, stack nodes and the loaders of popular node packs"""
    inputs = node.get("inputs") if is_dict(node.get("inputs")) else {}
    class_type = _str(node.get("class_type"))
    if inputs.get("toggle") is False:
        return []

    # LoraLoader, LoraLoaderModelOnly and their many look-alikes
    if isinstance(inputs.get("lora_name"), str):
        return _compact(
            [
                _make_lora(
                    inputs["lora_name"],
                    _coalesce(
                        inputs.get("strength_model"),
                        inputs.get("lora_model_strength"),
                        inputs.get("lora_strength"),
                        inputs.get("strength"),
                        inputs.get("model_weight"),
                    ),
                    _coalesce(
                        inputs.get("strength_clip"),
                        inputs.get("lora_clip_strength"),
                        inputs.get("clip_strength"),
                        inputs.get("clip_weight"),
                    ),
                )
            ]
        )

    # LoRA Manager: a list with an active flag per LoRA
    loras_input = inputs.get("loras")
    if isinstance(loras_input, list) or (is_dict(loras_input) and isinstance(loras_input.get("__value__"), list)):
        entries = loras_input if isinstance(loras_input, list) else loras_input["__value__"]
        return _compact(
            [
                _make_lora(entry.get("name"), entry.get("strength"), entry.get("clipStrength"))
                for entry in entries
                if is_dict(entry) and entry.get("active") is not False
            ]
        )

    # rgthree Power Lora Loader: one object per slot
    slots = [value for key, value in js_items(inputs) if re.fullmatch(r"lora_[0-9]+", key) and is_dict(value)]
    if slots:
        return _compact(
            [_make_lora(value.get("lora"), value.get("strength"), value.get("strengthTwo")) for value in slots if value.get("on") is not False]
        )

    # easy loraSwitcher: only the selected slot is applied
    if _num(inputs.get("select")) is not None and re.search("switch", class_type, re.I):
        return _compact([_make_lora(inputs.get(f"lora_{js_str(inputs['select'])}_name"), inputs.get("lora_strength"))])

    # numbered slots: CR LoRA Stack, Efficiency LoRA Stacker, easy loraStack, rgthree Lora Loader Stack
    simple = inputs.get("mode") == "simple" or inputs.get("input_mode") == "simple"
    count = _num(inputs.get("num_loras"))
    if count is None:
        count = _num(inputs.get("lora_count"))
    loras: List[Lora] = []
    for key in js_keys(inputs):
        match = re.fullmatch(r"lora_name_([0-9]+)|lora_([0-9]+)_name|lora_([0-9]+)", key)
        if not match or not isinstance(inputs[key], str):
            continue
        slot = match.group(1) or match.group(2) or match.group(3)
        index = int(slot)
        if count is not None and index > count:
            continue
        if inputs.get(f"switch_{slot}") == "Off":
            continue
        if simple:
            weight = _coalesce(inputs.get(f"lora_{slot}_strength"), inputs.get(f"lora_wt_{slot}"))
            clip_weight = None
        else:
            weight = _coalesce(
                inputs.get(f"model_weight_{slot}"),
                inputs.get(f"lora_{slot}_model_strength"),
                inputs.get(f"model_str_{slot}"),
                inputs.get(f"strength_{slot}"),
                inputs.get(f"lora_{slot}_strength"),
                inputs.get(f"lora_wt_{slot}"),
            )
            clip_weight = _coalesce(
                inputs.get(f"clip_weight_{slot}"),
                inputs.get(f"lora_{slot}_clip_strength"),
                inputs.get(f"clip_str_{slot}"),
            )
        lora = _make_lora(inputs[key], weight, clip_weight)
        if lora:
            loras.append(lora)
    if loras:
        return loras

    # prompt nodes that apply `<lora:...>` tags themselves (rgthree Power Prompt)
    if re.search(r"lora|power prompt", class_type, re.I):
        for key in ("text", "prompt"):
            if isinstance(inputs.get(key), str) and re.search(r"<(?:lora|lyco):", inputs[key], re.I):
                return loras_from_prompt_tags(inputs[key])
    return []


def loras_from_comfy_graph(graph: Dict[str, Any], sampler_ids: Optional[List[str]] = None) -> List[Lora]:
    """The LoRAs of a ComfyUI API graph that the samplers actually depend on, so that unconnected
    loaders are left out (bypassed ones are not part of the graph at all)"""
    nodes: Dict[str, Dict[str, Any]] = {}
    for node_id, node in js_items(graph):
        if is_dict(node) and is_dict(node.get("inputs")) and isinstance(node.get("class_type"), str):
            nodes[js_str(node_id)] = node

    starts = [node_id for node_id in (sampler_ids or []) if node_id in nodes]
    if not starts:
        starts = [
            node_id
            for node_id, node in nodes.items()
            if re.search("sampler", _str(node.get("class_type")), re.I) and ("model" in node["inputs"] or "guider" in node["inputs"])
        ]

    visited: set = set()
    order: List[str] = []

    def visit(node_id: str) -> None:
        if node_id in visited:
            return
        visited.add(node_id)
        node = nodes.get(node_id)
        if not node:
            return
        for value in js_values(node.get("inputs") or {}):
            if isinstance(value, list) and len(value) == 2 and js_str(value[0]) in nodes:
                visit(js_str(value[0]))
        order.append(node_id)

    # without a sampler there is nothing to trace from, so every loader counts
    if not starts:
        starts = list(nodes.keys())
    for start in starts:
        visit(start)

    # upstream first, so loaders come in the order they are chained
    return [lora for node_id in order for lora in _loras_from_comfy_node(nodes[node_id])]


def _pad(values: List[Any], length: int) -> List[Any]:
    return list(values) + [None] * max(0, length - len(values))


def _dedupe(loras: List[Lora]) -> List[Lora]:
    seen = set()
    result = []
    for lora in loras:
        key = (lora.name, lora.weight, lora.clip_weight)
        if key not in seen:
            seen.add(key)
            result.append(lora)
    return result


def _round6(value: Any) -> Optional[float]:
    number = _num(value)
    if number is None:
        return None
    return _js_round(number * 1e6) / 1e6


def _js_round(value: float) -> float:
    """`Math.round`: halves round up"""
    import math

    return float(math.floor(value + 0.5))


def _from_generator(prompt_info: PromptInfo) -> Optional[List[Lora]]:
    raw = prompt_info.raw_parameters or {}
    metadata = prompt_info.metadata or {}
    generator = prompt_info.generator

    if generator == Generators.SWARMUI:
        names = metadata.get("loras") if isinstance(metadata.get("loras"), list) else []
        weights = metadata.get("loraweights") if isinstance(metadata.get("loraweights"), list) else []
        models = metadata.get("sui_models") if isinstance(metadata.get("sui_models"), list) else []
        result = []
        for i, name in enumerate(names):
            model = next(
                (m for m in models if is_dict(m) and m.get("param") == "loras" and lora_tag_name(_str(m.get("name"))) == name),
                None,
            )
            result.append(_make_lora(name, weights[i] if i < len(weights) else None, None, model.get("hash") if model else None))
        return _compact(result)

    if generator == Generators.EASYDIFFUSION:
        names = metadata.get("use_lora_model")
        weights = metadata.get("lora_alpha")
        if isinstance(names, str):
            return _compact([_make_lora(names, weights)])
        if not isinstance(names, list):
            return []
        return _compact(
            [
                _make_lora(name, (weights[i] if i < len(weights) else None) if isinstance(weights, list) else weights)
                for i, name in enumerate(names)
            ]
        )

    if generator == Generators.RUINED_FOOOCUS:
        entries = metadata.get("loras") if isinstance(metadata.get("loras"), list) else []
        result = []
        for entry in entries:
            if not isinstance(entry, list):
                result.append(None)
                continue
            first = entry[0] if entry else None
            hash_ = first if first else None
            second = entry[1] if len(entry) > 1 else None
            match = re.match(r"\s*(-?[0-9.]+)\s*-\s*(.+)\Z", _str(second))
            if match:
                result.append(_make_lora(match.group(2), match.group(1), None, hash_))
            else:
                result.append(_make_lora(second, None, None, hash_))
        return _compact(result)

    if generator == Generators.FOOOCUS:
        entries = metadata.get("loras") if isinstance(metadata.get("loras"), list) else []
        if entries:
            return _compact([_make_lora(*_pad(entry, 3)[:2], None, _pad(entry, 3)[2]) if isinstance(entry, list) else None for entry in entries])
        result = []
        for key, value in js_items(metadata):
            if re.fullmatch(r"lora_combined_[0-9]+", key):
                parts = _str(value).split(" : ")
                result.append(_make_lora(parts[0], parts[1] if len(parts) > 1 else None))
        return _compact(result)

    if generator == Generators.INVOKEAI:
        data = _parse_json(raw.get("invokeai_metadata"))
        entries = data.get("loras") if is_dict(data) and isinstance(data.get("loras"), list) else []
        result = []
        for entry in entries:
            if not is_dict(entry):
                result.append(None)
                continue
            model = entry["model"] if is_dict(entry.get("model")) else entry["lora"] if is_dict(entry.get("lora")) else {}
            result.append(
                _make_lora(_coalesce(model.get("name"), model.get("model_name")), entry.get("weight"), None, model.get("hash"))
            )
        return _compact(result)

    if generator == Generators.DRAWTHINGS:
        entries = metadata.get("lora") if isinstance(metadata.get("lora"), list) else []
        # weights are stored as 32-bit floats (0.30000001192092896)
        return _compact([_make_lora(entry.get("model"), _round6(entry.get("weight"))) if is_dict(entry) else None for entry in entries])

    if generator == Generators.DEZGO:
        keys = [key for key in js_keys(metadata) if re.fullmatch(r"lora[0-9]+", key)]
        return _compact([_make_lora(metadata[key], metadata.get(f"{key}_strength")) for key in keys])

    if generator == Generators.TENSORART:
        data = _parse_json(raw.get("generation_data"))
        models = data.get("models") if is_dict(data) and isinstance(data.get("models"), list) else []
        return _compact(
            [
                _make_lora(_coalesce(model.get("modelFileName"), model.get("label")), model.get("weight"), None, model.get("hash"))
                for model in models
                if is_dict(model) and re.search(r"lora|lycoris", _str(model.get("type")), re.I)
            ]
        )

    return None


def get_loras(prompt_info: PromptInfo) -> List[Lora]:
    """The LoRAs that were applied to an image, in the order the tool lists them"""
    specific = _from_generator(prompt_info)
    if specific:
        return _dedupe(specific)

    raw = prompt_info.raw_parameters or {}
    text = next(
        (
            value
            for value in (raw.get("parameters"), raw.get("UserComment"))
            if isinstance(value, str) and not js_trim_start(value).startswith("{")
        ),
        None,
    )
    if prompt_info.generator == Generators.AUTOMATIC1111 and isinstance(text, str):
        loras = loras_from_a1111(text)
        if loras:
            return _dedupe(loras)

    for source in (raw.get("prompt"), raw.get("UserComment")):
        graph = _parse_json(source)
        if not is_dict(graph) or not any(is_dict(node) and "class_type" in node for node in graph.values()):
            continue
        sampler_ids = [sampler.sampler_id for sampler in prompt_info.samplers if sampler.sampler_id]
        return _dedupe(loras_from_comfy_graph(graph, sampler_ids))
    return []
