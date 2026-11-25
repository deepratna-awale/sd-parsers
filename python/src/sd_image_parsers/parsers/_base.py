"""Base class and helpers for the parsers."""

from __future__ import annotations

import json
import re
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple, Union

from .._util import is_dict, js_str, js_trim, load_json, to_number
from ..data import Generators, Prompt, PromptInfo
from ..exceptions import ParserError

#: `(old_key, new_key)` renames a field, `(key, ([value_keys], format_string))` formats one
ReplacementRule = Tuple[str, Union[str, Tuple[List[str], str]]]


class Parser:
    """Base class for parsers"""

    generator: Generators = Generators.UNKNOWN

    def __init__(self, normalize_parameters: bool = True, debug: bool = False) -> None:
        self.do_normalization_pass = normalize_parameters
        self.debug = debug

    def parse(self, parameters: Dict[str, Any]) -> PromptInfo:
        """Extract image generation information from the image metadata"""
        raise NotImplementedError

    def normalize_parameters(
        self,
        parameters: Union[Dict[str, Any], Iterable[Tuple[str, Any]]],
        replacement_rules: Optional[Sequence[ReplacementRule]] = None,
        to_lowercase: bool = True,
        replace_whitespace: bool = True,
    ) -> Dict[str, Any]:
        """Apply replacement rules and basic formatting to the keys of select metadata entries"""
        raw = dict(parameters)
        if not self.do_normalization_pass:
            return raw

        processed: Dict[str, Any] = {}
        for property_key, instruction in replacement_rules or []:
            if isinstance(instruction, str):
                if property_key in raw:
                    processed[instruction] = raw.pop(property_key)
            else:
                format_values, format_string = instruction
                if all(key in raw for key in format_values):
                    processed[property_key] = re.sub(
                        r"\{(\w+)\}",
                        lambda m: js_str(raw[m.group(1)]) if m.group(1) in format_values else m.group(0),
                        format_string,
                    )

        for key, value in raw.items():
            if to_lowercase:
                key = key.lower()
            if replace_whitespace:
                key = key.replace(" ", "_")
            processed[key] = value
        return processed


def pop_keys(keys: Iterable[str], dictionary: Dict[str, Any]) -> List[Tuple[str, Any]]:
    """Remove the given keys from a dict, returning the removed `(key, value)` pairs"""
    return [(key, dictionary.pop(key)) for key in keys if key in dictionary]


def take(dictionary: Dict[str, Any], key: str) -> Any:
    """Remove a key from a dict and return its value (None when missing)"""
    return dictionary.pop(key, None)


def read_json_object(value: Any, what: str = "parameters") -> Dict[str, Any]:
    """Decode a JSON object, from a string or as a dict already, or raise a ParserError"""
    decoded = value
    if isinstance(value, str):
        try:
            # TensorArt ends its JSON with a null character
            decoded = load_json(re.sub(r"[\x00\s]+$", "", value))
        except (ValueError, TypeError) as error:
            raise ParserError(f"error decoding {what}: {error}") from error
    if not is_dict(decoded):
        raise ParserError(f"error decoding {what}")
    return decoded


def prompt_list(value: Any) -> List[Prompt]:
    """A list holding one prompt for a non-empty string, or an empty list"""
    if isinstance(value, str) and js_trim(value):
        return [Prompt(js_trim(value))]
    return []


def _parse_yaml_scalar(value: str) -> Any:
    if len(value) >= 2 and value.startswith("'") and value.endswith("'"):
        return value[1:-1].replace("''", "'")
    if len(value) >= 2 and value.startswith('"') and value.endswith('"'):
        try:
            return json.loads(value)
        except ValueError:
            return value[1:-1]
    if value == "true":
        return True
    if value == "false":
        return False
    if value in ("null", "~"):
        return None
    return to_number(value)


def parse_simple_yaml(text: str) -> Dict[str, Any]:
    """Parse the small subset of YAML that tools use to write flat or nested `key: value` records"""
    root: Dict[str, Any] = {}
    stack: List[Tuple[int, Dict[str, Any]]] = [(-1, root)]
    lines = re.split(r"\r?\n", text)

    def indent_of(line: str) -> int:
        return len(line) - len(line.lstrip())

    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.lstrip().startswith("#"):
            i += 1
            continue
        indent = indent_of(line)
        match = re.match(r"^([^:]+?):(?:\s+(.*))?$", line.strip(), re.S)
        if not match:
            raise ParserError(f"unsupported YAML line: {line}")
        while len(stack) > 1 and indent <= stack[-1][0]:
            stack.pop()
        parent = stack[-1][1]
        key, raw_value = match.group(1), match.group(2)

        if raw_value is None or raw_value == "":
            child: Dict[str, Any] = {}
            parent[key] = child
            stack.append((indent, child))
            i += 1
            continue

        block = re.match(r"^([>|])([+-]?)$", raw_value)
        if not block:
            parent[key] = _parse_yaml_scalar(raw_value)
            i += 1
            continue

        # block scalar: the following lines that are indented deeper, or empty
        body: List[str] = []
        while i + 1 < len(lines) and (not lines[i + 1].strip() or indent_of(lines[i + 1]) > indent):
            i += 1
            body.append(lines[i])
        while body and not body[-1].strip():
            body.pop()
        filled = [indent_of(l) for l in body if l.strip()]
        body_indent = min(filled) if filled else 0
        content = [l[body_indent:] for l in body]
        if block.group(1) == "|":
            value = "\n".join(content)
        else:
            value = ""
            for j, part in enumerate(content):
                if part == "":
                    value += "\n"
                else:
                    value += (" " if j > 0 and content[j - 1] != "" else "") + part
        parent[key] = value if block.group(2) == "-" else value + "\n"
        i += 1
    return root
