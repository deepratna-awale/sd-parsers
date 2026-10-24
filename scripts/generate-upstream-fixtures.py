#!/usr/bin/env python3
"""
Generate the expected parser outputs used by tests/integration/upstream-parity.test.ts.

The outputs are produced by the original Python library (https://github.com/d3x-at/sd-parsers),
so the TypeScript port can be checked against it.

Usage:
    git clone https://github.com/d3x-at/sd-parsers /tmp/sd-parsers-upstream
    pip install /tmp/sd-parsers-upstream pytest
    python scripts/generate-upstream-fixtures.py /tmp/sd-parsers-upstream
"""

import json
import subprocess
import sys
from dataclasses import asdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
RESOURCES = ROOT / "tests" / "resources"
OUTPUT = RESOURCES / "upstream-expected.json"


def prompt_info_to_dict(prompt_info):
    if prompt_info is None:
        return None
    return {
        "full_prompt": prompt_info.full_prompt,
        "full_negative_prompt": prompt_info.full_negative_prompt,
        **asdict(prompt_info),
    }


def main(upstream: Path):
    sys.path.insert(0, str(upstream))  # make the upstream test resources importable

    from sd_parsers import Eagerness, ParserManager
    from sd_parsers.parsers import ComfyUIParser
    from tests.resources.parsers.ComfyUI import WanVideoWrapper

    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=upstream, capture_output=True, text=True, check=True
    ).stdout.strip()

    images = {}
    parser_manager = ParserManager()
    for path in sorted(RESOURCES.rglob("*")):
        if path.suffix.lower() not in (".png", ".jpg", ".jpeg", ".webp"):
            continue

        key = path.relative_to(RESOURCES).as_posix()
        results = {}
        for eagerness in Eagerness:
            try:
                prompt_info = parser_manager.parse(path, eagerness=eagerness)
            except Exception as error:  # pylint: disable=broad-except
                results[eagerness.name] = {"error": type(error).__name__}
                continue

            if eagerness == Eagerness.EAGER:
                results[eagerness.name] = prompt_info_to_dict(prompt_info)
            else:
                # keep the fixture small, the full output is checked at the highest eagerness
                results[eagerness.name] = prompt_info and {"generator": prompt_info.generator}
        images[key] = results

    wan_video_parameters = WanVideoWrapper.PARAM.values[0]
    parsers = {
        "ComfyUI/WanVideoWrapper": {
            "parser": "ComfyUIParser",
            "parameters": wan_video_parameters,
            "expected": prompt_info_to_dict(ComfyUIParser().parse(wan_video_parameters)),
        }
    }

    fixture = {"upstream_revision": revision, "images": images, "parsers": parsers}
    OUTPUT.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT.relative_to(ROOT)} (upstream {revision})")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(Path(sys.argv[1]).resolve())
