"""Value helpers that keep results identical to the JavaScript package."""

from __future__ import annotations

import json
import math
import re
from typing import Any, Iterable

_ARRAY_INDEX = re.compile(r"0|[1-9][0-9]*")
_JS_NUMBER = re.compile(
    r"[+-]?(?:Infinity|(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?)"
)
_JS_WHITESPACE = " \t\n\v\f\r                 　﻿"


def is_number(value: Any) -> bool:
    """`typeof value === 'number'`"""
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def is_dict(value: Any) -> bool:
    return isinstance(value, dict)


def js_trim(text: str) -> str:
    return text.strip(_JS_WHITESPACE)


def js_trim_start(text: str) -> str:
    return text.lstrip(_JS_WHITESPACE)


def js_number(value: Any) -> Any:
    """`Number(value)`: integers stay `int`, NaN when the value is not numeric"""
    if value is None:
        return 0
    if isinstance(value, bool):
        return 1 if value else 0
    if is_number(value):
        return value
    if isinstance(value, str):
        text = js_trim(value)
        if text == "":
            return 0
        lowered = text.lower()
        if lowered.startswith(("0x", "0o", "0b")) and "." not in text:
            try:
                return int(text, 0)
            except ValueError:
                return math.nan
        if not _JS_NUMBER.fullmatch(text):
            return math.nan
        if "Infinity" in text:
            return -math.inf if text.startswith("-") else math.inf
        if re.fullmatch(r"[+-]?[0-9]+", text) and abs(int(text)) <= 2**53:
            return int(text)
        number = float(text)
        if number.is_integer() and abs(number) < 2**53 and "e" not in lowered:
            return int(number)
        return number
    if isinstance(value, list):
        if not value:
            return 0
        if len(value) == 1:
            return js_number(js_str(value[0]))
        return math.nan
    return math.nan


def is_nan(value: Any) -> bool:
    return isinstance(value, float) and math.isnan(value)


def is_finite_number(value: Any) -> bool:
    return is_number(value) and math.isfinite(value)


def to_number(value: Any) -> Any:
    """Turn a numeric string into a number, leaving other values as they are"""
    if isinstance(value, str) and js_trim(value) != "":
        number = js_number(value)
        if not is_nan(number):
            return number
    return value


def num_str(value: float) -> str:
    """JavaScript's `String(number)`"""
    if isinstance(value, int):
        return str(value)
    if math.isnan(value):
        return "NaN"
    if math.isinf(value):
        return "Infinity" if value > 0 else "-Infinity"
    if value == 0:
        return "0"
    if value.is_integer() and abs(value) <= 2**53:
        return str(int(value))
    text = repr(value)
    sign = "-" if text.startswith("-") else ""
    text = text.lstrip("-")
    mantissa, _, exponent = text.partition("e")
    digits = mantissa.replace(".", "")
    point = mantissa.index(".") if "." in mantissa else len(mantissa)
    exp = int(exponent) if exponent else 0
    # decimal exponent of the first significant digit
    stripped = digits.lstrip("0")
    leading_zeros = len(digits) - len(stripped)
    digits = stripped.rstrip("0") or "0"
    n = point + exp - leading_zeros
    k = len(digits)
    if k <= n <= 21:
        result = digits + "0" * (n - k)
    elif 0 < n <= 21:
        result = digits[:n] + "." + digits[n:]
    elif -6 < n <= 0:
        result = "0." + "0" * (-n) + digits
    else:
        e = n - 1
        result = digits[0] + ("." + digits[1:] if k > 1 else "") + "e" + ("+" if e >= 0 else "-") + str(abs(e))
    return sign + result


def js_str(value: Any) -> str:
    """JavaScript's `String(value)`"""
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if is_number(value):
        return num_str(value)
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ",".join("" if item is None else js_str(item) for item in value)
    if isinstance(value, dict):
        return "[object Object]"
    return str(value)


def _canonical_index(key: Any) -> bool:
    return isinstance(key, str) and _ARRAY_INDEX.fullmatch(key) is not None and int(key) < 2**32 - 1


def js_keys(obj: dict) -> list:
    """Keys in the order a JavaScript object enumerates them: array indices first, ascending"""
    keys = list(obj.keys())
    indices = sorted((key for key in keys if _canonical_index(key)), key=int)
    if not indices:
        return keys
    return indices + [key for key in keys if not _canonical_index(key)]


def js_items(obj: dict) -> list:
    return [(key, obj[key]) for key in js_keys(obj)]


def js_values(obj: dict) -> list:
    return [obj[key] for key in js_keys(obj)]


def _non_finite(token: str) -> float:
    return {"NaN": math.nan, "Infinity": math.inf, "-Infinity": -math.inf}[token]


def load_json(text: Any) -> Any:
    """`json.loads`, also accepting `NaN`, `Infinity` and `-Infinity`"""
    if isinstance(text, (bytes, bytearray, memoryview)):
        text = bytes(text).decode("utf-8", errors="replace")
    if not isinstance(text, str):
        raise TypeError(f"the JSON object must be str or bytes, not {type(text).__name__}")
    return json.loads(text, parse_constant=_non_finite)


def dumps(value: Any, indent: int = 0) -> str:
    """`JSON.stringify(value, null, indent)`, with numbers written the way JavaScript writes them"""
    return _stringify(to_json(value), indent, "")


def _stringify(value: Any, indent: int, current: str) -> str:
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if is_number(value):
        return num_str(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    inner = current + " " * indent
    if isinstance(value, list):
        if not value:
            return "[]"
        items = [_stringify(item, indent, inner) for item in value]
        if not indent:
            return "[" + ",".join(items) + "]"
        return "[\n" + inner + (",\n" + inner).join(items) + "\n" + current + "]"
    if isinstance(value, dict):
        if not value:
            return "{}"
        separator = ": " if indent else ":"
        items = [json.dumps(str(key), ensure_ascii=False) + separator + _stringify(item, indent, inner) for key, item in value.items()]
        if not indent:
            return "{" + ",".join(items) + "}"
        return "{\n" + inner + (",\n" + inner).join(items) + "\n" + current + "}"
    return json.dumps(str(value), ensure_ascii=False)


def to_json(value: Any) -> Any:
    """Turn a value into what `JSON.stringify` would write: non-finite numbers become null"""
    if hasattr(value, "to_dict") and callable(value.to_dict):
        return to_json(value.to_dict())
    if isinstance(value, dict):
        return {str(key): to_json(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [to_json(item) for item in value]
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {str(i): byte for i, byte in enumerate(bytes(value))}
    return value


def first(values: Iterable[Any], predicate) -> Any:
    for value in values:
        if predicate(value):
            return value
    return None


def latin1(data: bytes) -> str:
    return data.decode("latin-1")


def decode_utf8(data: bytes) -> str | None:
    try:
        return bytes(data).decode("utf-8")
    except UnicodeDecodeError:
        return None


def utf8_lenient(data: bytes) -> str:
    """`new TextDecoder().decode(data)`: invalid sequences become U+FFFD, a BOM is dropped"""
    text = bytes(data).decode("utf-8", errors="replace")
    return text[1:] if text.startswith("﻿") else text
