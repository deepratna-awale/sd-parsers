"""Turn parsed generation data into plain settings, compare images and summarize collections."""

from __future__ import annotations

import functools
import math
import re
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Tuple

from ._util import is_finite_number, js_number, js_trim
from .data import Lora, PromptInfo, get_full_negative_prompt, get_full_prompt, get_models

__all__ = [
    "PromptToken",
    "GenerationSettings",
    "PromptDiff",
    "MetadataComparison",
    "Count",
    "Range",
    "CollectionStats",
    "parse_prompt_tokens",
    "normalize_tag",
    "get_generation_settings",
    "diff_prompts",
    "prompt_similarity",
    "compare_metadata",
    "analyze_collection",
]


@dataclass
class PromptToken:
    """One comma separated part of a prompt, with the weight that its brackets give it"""

    #: The text without emphasis brackets or explicit weight (`blue sky` for `(blue sky:1.2)`)
    text: str
    #: Lower-cased, with underscores and repeated spaces turned into single spaces
    normalized: str
    #: 1 when unweighted; `(x)` is 1.1, `[x]` 1/1.1, `{x}` (NovelAI) 1.05, `(x:1.3)` and `1.3::x::` 1.3
    weight: float
    #: `tag`, `lora`, `embedding` or `break`
    kind: str

    def to_dict(self) -> Dict[str, Any]:
        return {"text": self.text, "normalized": self.normalized, "weight": self.weight, "kind": self.kind}


@dataclass
class GenerationSettings:
    """The settings of an image as plain values, for display, comparison and grouping"""

    generator: str
    software: str
    model: Optional[str] = None
    model_hash: Optional[str] = None
    sampler: Optional[str] = None
    scheduler: Optional[str] = None
    steps: Optional[float] = None
    cfg_scale: Optional[float] = None
    seed: Optional[float] = None
    denoise: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    loras: List[Lora] = field(default_factory=list)
    prompt: str = ""
    negative_prompt: str = ""

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {}
        for name, key in _SETTING_KEYS:
            value = getattr(self, name)
            if value is not None:
                result[key] = value
        result["loras"] = [lora.to_dict() for lora in self.loras]
        result["prompt"] = self.prompt
        result["negativePrompt"] = self.negative_prompt
        return result


_SETTING_KEYS = [
    ("generator", "generator"),
    ("software", "software"),
    ("model", "model"),
    ("model_hash", "modelHash"),
    ("sampler", "sampler"),
    ("scheduler", "scheduler"),
    ("steps", "steps"),
    ("cfg_scale", "cfgScale"),
    ("seed", "seed"),
    ("denoise", "denoise"),
    ("width", "width"),
    ("height", "height"),
]


@dataclass
class Reweighted:
    token: str
    from_: float
    to: float

    def to_dict(self) -> Dict[str, Any]:
        return {"token": self.token, "from": self.from_, "to": self.to}


@dataclass
class PromptDiff:
    #: Tokens only in the second prompt
    added: List[PromptToken] = field(default_factory=list)
    #: Tokens only in the first prompt
    removed: List[PromptToken] = field(default_factory=list)
    #: Tokens in both, with a different weight
    reweighted: List[Reweighted] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "added": [t.to_dict() for t in self.added],
            "removed": [t.to_dict() for t in self.removed],
            "reweighted": [r.to_dict() for r in self.reweighted],
        }


@dataclass
class LoraChange:
    name: str
    from_: Optional[float] = None
    to: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        return {"name": self.name, "from": self.from_, "to": self.to}


@dataclass
class LoraDiff:
    added: List[Lora] = field(default_factory=list)
    removed: List[Lora] = field(default_factory=list)
    reweighted: List[LoraChange] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "added": [lora.to_dict() for lora in self.added],
            "removed": [lora.to_dict() for lora in self.removed],
            "reweighted": [change.to_dict() for change in self.reweighted],
        }


@dataclass
class MetadataComparison:
    prompt: PromptDiff
    negative_prompt: PromptDiff
    #: Settings that differ, as `(first, second)`, keyed like `GenerationSettings.to_dict()`
    settings: Dict[str, Tuple[Any, Any]]
    loras: LoraDiff
    #: Jaccard similarity of the positive prompts' tokens, 0 to 1
    prompt_similarity: float

    def to_dict(self) -> Dict[str, Any]:
        return {
            "prompt": self.prompt.to_dict(),
            "negativePrompt": self.negative_prompt.to_dict(),
            "settings": {key: list(values) for key, values in self.settings.items()},
            "loras": self.loras.to_dict(),
            "promptSimilarity": self.prompt_similarity,
        }


@dataclass
class Count:
    value: str
    count: int

    def to_dict(self) -> Dict[str, Any]:
        return {"value": self.value, "count": self.count}


@dataclass
class Range:
    min: float
    max: float
    mean: float

    def to_dict(self) -> Dict[str, Any]:
        return {"min": self.min, "max": self.max, "mean": self.mean}


@dataclass
class CollectionStats:
    """What a set of images have in common, most frequent first"""

    count: int
    generators: List[Count]
    software: List[Count]
    models: List[Count]
    samplers: List[Count]
    schedulers: List[Count]
    sizes: List[Count]
    loras: List[Count]
    #: Prompt tokens and the number of images that use them
    tags: List[Count]
    negative_tags: List[Count]
    steps: Optional[Range] = None
    cfg_scale: Optional[Range] = None

    def to_dict(self) -> Dict[str, Any]:
        result: Dict[str, Any] = {"count": self.count}
        for name, key in (
            ("generators", "generators"),
            ("software", "software"),
            ("models", "models"),
            ("samplers", "samplers"),
            ("schedulers", "schedulers"),
            ("sizes", "sizes"),
            ("loras", "loras"),
            ("tags", "tags"),
            ("negative_tags", "negativeTags"),
        ):
            result[key] = [count.to_dict() for count in getattr(self, name)]
        if self.steps:
            result["steps"] = self.steps.to_dict()
        if self.cfg_scale:
            result["cfgScale"] = self.cfg_scale.to_dict()
        return result


WRAPPERS = {"(": (")", 1.1), "[": ("]", 1 / 1.1), "{": ("}", 1.05)}


def _round(value: float) -> float:
    result = math.floor(value * 1e4 + 0.5) / 1e4
    return int(result) if result.is_integer() else result


def _split_prompt(prompt: str) -> List[str]:
    """Split at commas and newlines outside brackets, and around BREAK"""
    parts: List[str] = []
    depth = 0
    current = ""
    i = 0
    while i < len(prompt):
        char = prompt[i]
        if char == "\\" and i + 1 < len(prompt):
            current += char + prompt[i + 1]
            i += 2
            continue
        if char in "([{<":
            depth += 1
        elif char in ")]}>":
            depth = max(0, depth - 1)
        if char in ",\n" and depth == 0:
            parts.append(current)
            current = ""
        else:
            current += char
        i += 1
    parts.append(current)
    result = []
    for part in parts:
        for piece in re.split(r"(\bBREAK\b)", part, flags=re.A):
            piece = js_trim(piece)
            if piece:
                result.append(piece)
    return result


_NOVELAI = re.compile(r"(-?[0-9]+(?:\.[0-9]+)?)::([\s\S]*?)(?:::)?\Z")
_EXPLICIT = re.compile(r"([\s\S]*?):\s*(-?[0-9]+(?:\.[0-9]+)?)\Z")


def _unwrap(text: str) -> Tuple[str, float]:
    weight: float = 1
    value = js_trim(text)
    while True:
        novelai = _NOVELAI.match(value)
        if novelai:
            weight *= float(novelai.group(1))
            value = js_trim(novelai.group(2))
            continue
        wrapper = WRAPPERS.get(value[0]) if value else None
        if not wrapper or value[-1] != wrapper[0] or (len(value) >= 2 and value[-2] == "\\"):
            break
        inner = js_trim(value[1:-1])
        explicit = _EXPLICIT.match(inner) if value[0] != "{" else None
        if explicit and value[0] == "(":
            weight *= float(explicit.group(2))
            value = js_trim(explicit.group(1))
        else:
            weight *= wrapper[1]
            value = inner
    return value, _round(weight)


def normalize_tag(text: str) -> str:
    """Lower-case, unescape brackets and turn underscores and repeated spaces into single spaces"""
    text = re.sub(r"\\([()\[\]{}])", r"\1", text)
    text = text.replace("_", " ")
    text = re.sub(r"\s+", " ", text)
    return js_trim(text).lower()


_LORA_TOKEN = re.compile(r"<(?:lora|lyco):([^:>]+)(?::(-?[0-9.]+))?[^>]*>", re.I)


def _lora_weight(value: Optional[str]) -> float:
    if not value:
        return 1
    number = js_number(value)
    return number


def parse_prompt_tokens(prompt: str) -> List[PromptToken]:
    """Split a prompt into its comma separated tokens and work out their weights. Understands
    A1111 / ComfyUI emphasis (`(x)`, `((x))`, `[x]`, `(x:1.2)`), NovelAI emphasis (`{x}`,
    `1.2::x::`), `<lora:...>` tags, `embedding:` names and `BREAK`."""
    tokens: List[PromptToken] = []
    for part in _split_prompt(prompt):
        if part == "BREAK":
            tokens.append(PromptToken("BREAK", "break", 1, "break"))
            continue
        lora = _LORA_TOKEN.fullmatch(part)
        if lora:
            tokens.append(PromptToken(js_trim(lora.group(1)), normalize_tag(lora.group(1)), _lora_weight(lora.group(2)), "lora"))
            continue
        # LoRA tags written next to other text: count both
        rest = part
        for match in _LORA_TOKEN.finditer(part):
            tokens.append(PromptToken(js_trim(match.group(1)), normalize_tag(match.group(1)), _lora_weight(match.group(2)), "lora"))
            rest = rest.replace(match.group(0), "", 1)
        rest = js_trim(rest)
        if not rest:
            continue
        text, weight = _unwrap(rest)
        if not text:
            continue
        embedding = re.match(r"embedding:(.+)\Z", text, re.I | re.S)
        if embedding:
            name = re.sub(r"\.(?:pt|safetensors|bin)$", "", embedding.group(1), flags=re.I)
            tokens.append(PromptToken(name, normalize_tag(name), weight, "embedding"))
        else:
            tokens.append(PromptToken(text, normalize_tag(text), weight, "tag"))
    return tokens


def _to_number(value: Any) -> Optional[float]:
    number = js_number(value) if isinstance(value, str) and js_trim(value) else value
    return number if is_finite_number(number) else None


def _prompt_text(value: Any) -> str:
    """Fooocus records its full prompts as a list, one entry per style"""
    if isinstance(value, list):
        return ", ".join(part for part in value if isinstance(part, str) and js_trim(part))
    return value if isinstance(value, str) else ""


def get_generation_settings(prompt_info: PromptInfo) -> GenerationSettings:
    """The settings of a parsed image as plain values: model, sampler, scheduler, steps, CFG scale,
    seed, size, LoRAs and the full prompts. Values that tools write as text become numbers. For
    images with several samplers (hires fix, refiners), the first sampler's settings are used."""
    sampler = prompt_info.samplers[0] if prompt_info.samplers else None
    models = get_models(prompt_info)
    model = models[0] if models else None
    parameters = sampler.parameters if sampler else {}
    denoise = parameters.get("denoise")
    if denoise is None:
        denoise = parameters.get("denoising_strength")
    generator = prompt_info.generator.value if hasattr(prompt_info.generator, "value") else prompt_info.generator
    return GenerationSettings(
        generator=generator,
        software=prompt_info.software if prompt_info.software is not None else generator,
        model=model.name if model else None,
        model_hash=model.hash if model else None,
        sampler=sampler.name if sampler else None,
        scheduler=parameters.get("scheduler") if isinstance(parameters.get("scheduler"), str) else None,
        steps=_to_number(parameters.get("steps")),
        cfg_scale=_to_number(parameters.get("cfg_scale")),
        seed=_to_number(parameters.get("seed")),
        denoise=_to_number(denoise),
        width=prompt_info.width,
        height=prompt_info.height,
        loras=list(prompt_info.loras or []),
        prompt=_prompt_text(get_full_prompt(prompt_info)),
        negative_prompt=_prompt_text(get_full_negative_prompt(prompt_info)),
    )


def _token_map(prompt: Any) -> Dict[str, PromptToken]:
    tokens: Dict[str, PromptToken] = {}
    for token in parse_prompt_tokens(prompt if isinstance(prompt, str) else ""):
        if token.kind == "break":
            continue
        tokens.setdefault(f"{token.kind}:{token.normalized}", token)
    return tokens


def diff_prompts(first: str, second: str) -> PromptDiff:
    """Tokens added, removed and reweighted from the first prompt to the second"""
    before = _token_map(first)
    after = _token_map(second)
    diff = PromptDiff()
    for key, token in after.items():
        old = before.get(key)
        if old is None:
            diff.added.append(token)
        elif old.weight != token.weight:
            diff.reweighted.append(Reweighted(token.text, old.weight, token.weight))
    for key, token in before.items():
        if key not in after:
            diff.removed.append(token)
    return diff


def prompt_similarity(first: str, second: str) -> float:
    """How alike two prompts are: the share of their tokens (ignoring weights, case and underscores)
    that they have in common, from 0 (nothing) to 1 (the same tokens)"""
    a = set(_token_map(first))
    b = set(_token_map(second))
    if not a and not b:
        return 1
    shared = len(a & b)
    return _round(shared / (len(a) + len(b) - shared))


def _file_name(name: str) -> str:
    name = re.sub(r"^.*[\\/]", "", name, flags=re.S)
    return re.sub(r"\.(?:safetensors|ckpt|pt|pth|bin|gguf|sft)$", "", name, flags=re.I)


def _lora_key(lora: Lora) -> str:
    return normalize_tag(_file_name(lora.name))


def _same_name(a: Any, b: Any) -> bool:
    return isinstance(a, str) and isinstance(b, str) and normalize_tag(_file_name(a)) == normalize_tag(_file_name(b))


def _differs(a: Any, b: Any) -> bool:
    if type(a) is bool or type(b) is bool:
        return a is not b
    return a != b


def compare_metadata(first: PromptInfo, second: PromptInfo) -> MetadataComparison:
    """Compare the generation data of two images: prompt tokens added, removed and reweighted,
    settings that differ, LoRA changes and how similar the prompts are"""
    a = get_generation_settings(first)
    b = get_generation_settings(second)
    settings: Dict[str, Tuple[Any, Any]] = {}
    for name, key in _SETTING_KEYS:
        value_a, value_b = getattr(a, name), getattr(b, name)
        if _differs(value_a, value_b) and not (name == "model" and _same_name(value_a, value_b)):
            settings[key] = (value_a, value_b)

    before = {_lora_key(lora): lora for lora in a.loras}
    after = {_lora_key(lora): lora for lora in b.loras}
    loras = LoraDiff()
    for key, lora in after.items():
        old = before.get(key)
        if old is None:
            loras.added.append(lora)
        elif old.weight != lora.weight:
            loras.reweighted.append(LoraChange(lora.name, old.weight, lora.weight))
    for key, lora in before.items():
        if key not in after:
            loras.removed.append(lora)

    return MetadataComparison(
        prompt=diff_prompts(a.prompt, b.prompt),
        negative_prompt=diff_prompts(a.negative_prompt, b.negative_prompt),
        settings=settings,
        loras=loras,
        prompt_similarity=prompt_similarity(a.prompt, b.prompt),
    )


# the order of ASCII punctuation and symbols in the Unicode collation algorithm's root collation
_PUNCTUATION = "_-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$"


def _collation_key(text: str) -> tuple:
    """Sort key close to JavaScript's `localeCompare`: punctuation, then digits, then letters
    without regard to case or accents; accents, then case, only break ties"""
    primary = []
    secondary = []
    tertiary = []
    for char in text:
        base = unicodedata.normalize("NFD", char)
        marks = base[1:]
        base = base[0]
        if base.isspace():
            weight = (0, 0, 0)
        elif base in _PUNCTUATION:
            weight = (0, 1, _PUNCTUATION.index(base))
        elif base.isdigit():
            weight = (1, unicodedata.digit(base, 0), 0)
        elif base.isalpha() and base.lower() < "\u0250":
            weight = (2, ord(base.lower()), 0)
        else:
            weight = (3, ord(base.lower()), 0)
        primary.append(weight)
        secondary.append(marks)
        tertiary.append(1 if base.isupper() else 0)
    return (primary, secondary, tertiary, text)


def _locale_compare(x: str, y: str) -> int:
    kx, ky = _collation_key(x), _collation_key(y)
    return (kx > ky) - (kx < ky)


class _Counter:
    def __init__(self) -> None:
        self.counts: Dict[str, int] = {}
        self.labels: Dict[str, str] = {}

    def add(self, value: Optional[str], key: Optional[str] = None) -> None:
        """Count `value`, grouped by `key` and shown as the first value seen for it"""
        if key is None:
            key = value
        if not value or not key:
            return
        self.counts[key] = self.counts.get(key, 0) + 1
        self.labels.setdefault(key, value)

    def sorted(self) -> List[Count]:
        counts = [Count(self.labels[key], count) for key, count in self.counts.items()]
        return sorted(counts, key=functools.cmp_to_key(lambda x, y: (y.count - x.count) or _locale_compare(x.value, y.value)))


def _range(values: List[float]) -> Optional[Range]:
    if not values:
        return None
    return Range(min(values), max(values), _round(sum(values) / len(values)))


def analyze_collection(prompt_infos: Iterable[Optional[PromptInfo]]) -> CollectionStats:
    """Count what a set of parsed images use: generators, tools, models, samplers, schedulers,
    sizes, LoRAs and prompt tokens (each counted once per image), and the range of steps and CFG
    scales. Handy to see what a folder of images was made with."""
    counters = {name: _Counter() for name in ("generators", "software", "models", "samplers", "schedulers", "sizes", "loras", "tags", "negative_tags")}
    steps: List[float] = []
    cfg_scales: List[float] = []
    count = 0

    for prompt_info in prompt_infos:
        if not prompt_info:
            continue
        count += 1
        settings = get_generation_settings(prompt_info)
        counters["generators"].add(settings.generator)
        counters["software"].add(settings.software)
        if settings.model:
            counters["models"].add(_file_name(settings.model), normalize_tag(_file_name(settings.model)))
        counters["samplers"].add(settings.sampler if isinstance(settings.sampler, str) else None)
        counters["schedulers"].add(settings.scheduler)
        if settings.width and settings.height:
            counters["sizes"].add(f"{settings.width}x{settings.height}")
        loras = {_lora_key(lora): _file_name(lora.name) for lora in settings.loras}
        for key, name in loras.items():
            counters["loras"].add(name, key)
        tags = dict.fromkeys(t.normalized for t in _token_map(settings.prompt).values() if t.kind == "tag")
        for tag in tags:
            counters["tags"].add(tag)
        negative_tags = dict.fromkeys(t.normalized for t in _token_map(settings.negative_prompt).values() if t.kind == "tag")
        for tag in negative_tags:
            counters["negative_tags"].add(tag)
        if settings.steps is not None:
            steps.append(settings.steps)
        if settings.cfg_scale is not None:
            cfg_scales.append(settings.cfg_scale)

    return CollectionStats(
        count=count,
        generators=counters["generators"].sorted(),
        software=counters["software"].sorted(),
        models=counters["models"].sorted(),
        samplers=counters["samplers"].sorted(),
        schedulers=counters["schedulers"].sorted(),
        sizes=counters["sizes"].sorted(),
        loras=counters["loras"].sorted(),
        tags=counters["tags"].sorted(),
        negative_tags=counters["negative_tags"].sorted(),
        steps=_range(steps),
        cfg_scale=_range(cfg_scales),
    )
