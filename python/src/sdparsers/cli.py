"""Command line interface, the same as the npm package's `sd-parsers` command."""

from __future__ import annotations

import sys
from pathlib import Path
from typing import Any, List, Optional, Sequence, Tuple

from ._util import dumps, js_str
from .analysis import analyze_collection, compare_metadata
from .data import PromptInfo, get_full_negative_prompt, get_full_prompt, get_models, prompt_info_to_dict
from .extractors import Eagerness
from .extractors.image import detect_format
from .infotext import to_infotext
from .parser_manager import ParserManager
from .stream import read_metadata_bytes
from .video import detect_video_format
from .writer import copy_metadata, strip_metadata, write_metadata

PROG = "sdparsers"

USAGE = f"""Usage: {PROG} [options] <image-files...>
       {PROG} strip <image> -o <output>
       {PROG} copy <source> <target> -o <output>
       {PROG} to-a1111 <image> -o <output>
       {PROG} diff <image-a> <image-b> [--json]
       {PROG} stats <image-files...> [--json]

Reads Stable Diffusion metadata from PNG, JPEG and WEBP images and MP4, MOV, WebM and MKV videos.

Commands:
  strip     Save the image without its metadata
  copy      Save <target> with the metadata of <source>, converted to the format of <target>
  to-a1111  Save the image with its generation data rewritten as AUTOMATIC1111 parameters
  diff      Show how the generation data of two images differs: prompt tokens, settings, LoRAs
  stats     Count the generators, models, samplers, sizes, LoRAs and prompt tags of many images

Options:
  --json      Print a JSON array with one result per file
  --infotext  Print the generation data as AUTOMATIC1111 style parameters
  --eager     Also read stealth metadata from the alpha channel (needs Pillow)
  -h, --help  Show this help

The output may be the input file, to change it in place.

Exit codes: 0 when every file was read, 1 when any file failed or no files were given."""

COMMANDS = {"strip": 1, "copy": 2, "to-a1111": 1}


class UsageError(Exception):
    pass


def _out(text: str = "") -> None:
    sys.stdout.write(text + "\n")


def _err(text: str) -> None:
    sys.stderr.write(text + "\n")


def _error_message(error: BaseException) -> str:
    if isinstance(error, OSError) and error.strerror:
        return f"{error.strerror}: {error.filename}" if error.filename else error.strerror
    return str(error)


def _parse_file(manager: ParserManager, filename: str, eagerness: Eagerness) -> Tuple[Optional[str], Optional[PromptInfo]]:
    # only stealth metadata needs the pixels; otherwise skip the image and media data
    data = Path(filename).read_bytes() if eagerness >= Eagerness.EAGER else read_metadata_bytes(filename)
    format_ = detect_format(data) or detect_video_format(data)
    if not format_:
        return None, None
    return format_, manager.parse(data, eagerness)


def _print_text(prompt_info: PromptInfo) -> None:
    generator = prompt_info.generator.value if hasattr(prompt_info.generator, "value") else prompt_info.generator
    software = prompt_info.software or generator
    _out(f"Generator: {software}" if software == generator else f"Generator: {software} ({generator} format)")
    provenance = prompt_info.provenance
    if provenance:
        details = ", ".join(value for value in (provenance.vendor, provenance.digital_source_type) if value)
        label = "labelled as AI made" if provenance.ai_generated else "labelled"
        _out(f"Provenance: {label} ({provenance.source}{': ' + details if details else ''})")

    for model in get_models(prompt_info):
        _out(f"Model: {model.name or 'Unknown'}")
        if model.hash:
            _out(f"Model Hash: {model.hash}")

    for sampler in prompt_info.samplers:
        _out(f"Sampler: {js_str(sampler.name)}")
        params = ", ".join(f"{key}: {js_str(value)}" for key, value in sampler.parameters.items())
        if params:
            _out(f"Parameters: {params}")

    if prompt_info.width and prompt_info.height:
        _out(f"Size: {js_str(prompt_info.width)}x{js_str(prompt_info.height)}")
    for lora in prompt_info.loras or []:
        weights = " / ".join(js_str(w) for w in (lora.weight, lora.clip_weight) if w is not None)
        _out(f"LoRA: {lora.name}{f' ({weights})' if weights else ''}")

    prompt = get_full_prompt(prompt_info)
    if prompt:
        _out(f"\nPrompt: {js_str(prompt)}")
    negative_prompt = get_full_negative_prompt(prompt_info)
    if negative_prompt:
        _out(f"Negative Prompt: {js_str(negative_prompt)}")

    if prompt_info.metadata:
        _out("\nOther Metadata:")
        for key, value in prompt_info.metadata.items():
            _out(f"  {key}: {dumps(value) if value is None or isinstance(value, (dict, list)) else js_str(value)}")


def _parse_command(argv: Sequence[str]) -> Tuple[str, List[str], str]:
    command, rest = argv[0], list(argv[1:])
    files: List[str] = []
    output: Optional[str] = None
    i = 0
    while i < len(rest):
        if rest[i] in ("-o", "--output"):
            i += 1
            output = rest[i] if i < len(rest) else None
        elif rest[i].startswith("-") and rest[i] != "-":
            raise UsageError(f"Unknown option: {rest[i]}")
        else:
            files.append(rest[i])
        i += 1
    if len(files) != COMMANDS[command]:
        raise UsageError(f"{command} takes {'one image' if COMMANDS[command] == 1 else 'a source and a target image'}")
    if not output:
        raise UsageError(f"{command} needs an output file: -o <output>")
    return command, files, output


def _run_command(command: str, files: List[str], output: str) -> None:
    contents = [Path(file).read_bytes() for file in files]
    if command == "strip":
        result = strip_metadata(contents[0])
    elif command == "copy":
        result = copy_metadata(contents[0], contents[1])
    else:
        prompt_info = ParserManager().parse(contents[0])
        if not prompt_info:
            raise UsageError(f"No generation data found in {files[0]}")
        result = write_metadata(contents[0], to_infotext(prompt_info))
    Path(output).write_bytes(result)
    _out(f"Saved {output}")


def _format_value(value: Any) -> str:
    return "(none)" if value is None else js_str(value)


def _print_prompt_diff(label: str, diff: Any) -> None:
    lines = [f"  + {t.text}{f' ({js_str(t.weight)})' if t.weight != 1 else ''}" for t in diff.added]
    lines += [f"  - {t.text}{f' ({js_str(t.weight)})' if t.weight != 1 else ''}" for t in diff.removed]
    lines += [f"  ~ {r.token}: {js_str(r.from_)} -> {js_str(r.to)}" for r in diff.reweighted]
    if lines:
        _out(f"{label}:")
        for line in lines:
            _out(line)


def _run_analysis(command: str, argv: Sequence[str]) -> int:
    json_output = "--json" in argv
    files = [arg for arg in argv if arg != "--json"]
    unknown = next((arg for arg in files if arg.startswith("-") and arg != "-"), None)
    if unknown:
        raise UsageError(f"Unknown option: {unknown}")
    if command == "diff" and len(files) != 2:
        raise UsageError("diff takes two images")
    if command == "stats" and not files:
        raise UsageError("stats takes one or more images")

    manager = ParserManager()
    prompt_infos: List[Optional[PromptInfo]] = []
    failed = False
    for file in files:
        try:
            _, prompt_info = _parse_file(manager, file, Eagerness.DEFAULT)
            if not prompt_info and command == "diff":
                raise UsageError("no generation data found")
            prompt_infos.append(prompt_info)
        except Exception as error:  # noqa: BLE001
            if command == "diff":
                raise UsageError(f"{file}: {_error_message(error)}") from error
            failed = True
            _err(f"Error processing {file}: {_error_message(error)}")

    if command == "diff":
        comparison = compare_metadata(prompt_infos[0], prompt_infos[1])
        if json_output:
            _out(dumps(comparison, 2))
            return 0
        _out(f"Prompt similarity: {js_str(round_half_up(comparison.prompt_similarity * 100))}%")
        for key, (first, second) in comparison.settings.items():
            _out(f"{key}: {_format_value(first)} -> {_format_value(second)}")
        _print_prompt_diff("Prompt", comparison.prompt)
        _print_prompt_diff("Negative prompt", comparison.negative_prompt)
        loras = comparison.loras
        if loras.added or loras.removed or loras.reweighted:
            _out("LoRAs:")
            for lora in loras.added:
                _out(f"  + {lora.name}{f' ({js_str(lora.weight)})' if lora.weight is not None else ''}")
            for lora in loras.removed:
                _out(f"  - {lora.name}{f' ({js_str(lora.weight)})' if lora.weight is not None else ''}")
            for change in loras.reweighted:
                _out(f"  ~ {change.name}: {_format_value(change.from_)} -> {_format_value(change.to)}")
        return 0

    stats = analyze_collection(prompt_infos)
    if json_output:
        _out(dumps({"files": len(files), **stats.to_dict()}, 2))
        return 1 if failed else 0
    _out(f"{len(files)} files, {stats.count} with generation data")
    sections = [
        ("Software", stats.software),
        ("Models", stats.models),
        ("Samplers", stats.samplers),
        ("Schedulers", stats.schedulers),
        ("Sizes", stats.sizes),
        ("LoRAs", stats.loras),
        ("Prompt tags", stats.tags),
        ("Negative prompt tags", stats.negative_tags),
    ]
    for label, counts in sections:
        if not counts:
            continue
        _out(f"\n{label}:")
        for count in counts[:10]:
            _out(f"  {str(count.count).rjust(5)}  {count.value}")
        if len(counts) > 10:
            _out(f"         ... {len(counts) - 10} more")
    if stats.steps:
        _out(f"\nSteps: {js_str(stats.steps.min)} to {js_str(stats.steps.max)} (mean {js_str(stats.steps.mean)})")
    if stats.cfg_scale:
        _out(f"CFG scale: {js_str(stats.cfg_scale.min)} to {js_str(stats.cfg_scale.max)} (mean {js_str(stats.cfg_scale.mean)})")
    return 1 if failed else 0


def round_half_up(value: float) -> int:
    import math

    return int(math.floor(value + 0.5))


def main(argv: Optional[Sequence[str]] = None) -> int:
    args = list(sys.argv[1:] if argv is None else argv)
    if args and args[0] in ("diff", "stats"):
        try:
            return _run_analysis(args[0], args[1:])
        except Exception as error:  # noqa: BLE001
            _err(_error_message(error))
            return 1
    if args and args[0] in COMMANDS:
        try:
            _run_command(*_parse_command(args))
            return 0
        except Exception as error:  # noqa: BLE001
            _err(_error_message(error))
            return 1

    options = {"json": False, "infotext": False, "eager": False, "help": False}
    files: List[str] = []
    only_files = False
    for arg in args:
        if only_files or not arg.startswith("-") or arg == "-":
            files.append(arg)
        elif arg == "--":
            only_files = True
        elif arg in ("--json", "--infotext", "--eager"):
            options[arg[2:]] = True
        elif arg in ("-h", "--help"):
            options["help"] = True
        else:
            _err(f"Unknown option: {arg}\n\n{USAGE}")
            return 1

    if options["help"]:
        _out(USAGE)
        return 0
    if not files:
        _err(USAGE)
        return 1

    manager = ParserManager()
    eagerness = Eagerness.EAGER if options["eager"] else Eagerness.DEFAULT
    results: List[Any] = []
    failed = False
    for file in files:
        if not options["json"]:
            _out(f"\n=== {file} ===")
        try:
            format_, prompt_info = _parse_file(manager, file, eagerness)
            if options["json"]:
                result = {"file": file, "format": format_, "found": prompt_info is not None}
                if prompt_info:
                    result.update(prompt_info_to_dict(prompt_info))
                results.append(result)
            elif not format_:
                _out("Not a PNG, JPEG, WEBP, MP4, MOV, WebM or MKV file")
            elif prompt_info and options["infotext"]:
                _out(to_infotext(prompt_info))
            elif prompt_info:
                _print_text(prompt_info)
            else:
                _out("No metadata found")
        except Exception as error:  # noqa: BLE001
            failed = True
            if options["json"]:
                results.append({"file": file, "error": _error_message(error)})
            else:
                _err(f"Error processing {file}: {_error_message(error)}")

    if options["json"]:
        _out(dumps(results, 2))
    return 1 if failed else 0


def run() -> None:
    sys.exit(main())


if __name__ == "__main__":
    run()
