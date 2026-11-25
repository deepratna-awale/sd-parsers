"""Parse the sample images of the repository and check what the npm package's tests expect."""

import json
import re
from pathlib import Path

import pytest

from sd_image_parsers import ParserManager, UnidentifiedImageError, get_full_negative_prompt, get_full_prompt

from .conftest import ROOT, SAMPLES, media_files

SAMPLE_TEST = ROOT / "tests" / "integration" / "samples.test.ts"


def expected_samples():
    """The generator and software of each sample, read from the npm package's sample test"""
    if not SAMPLE_TEST.is_file():
        return []
    table = SAMPLE_TEST.read_text(encoding="utf-8").split("const EXPECTED", 1)[1].split("};", 1)[0]
    return [
        (path, json.loads(value))
        for path, value in re.findall(r'^\s*"([^"]+)":\s*(null|\[[^\]]*\]),?\s*$', table, re.M)
    ]


manager = ParserManager()


@pytest.mark.parametrize("path,expected", expected_samples())
def test_sample(path, expected):
    result = manager.parse(SAMPLES / path)
    assert (result and [result.generator.value, result.software]) == expected
    if result and not path.startswith("vendor/"):
        assert get_full_prompt(result)


def test_sample_table_is_found():
    if SAMPLE_TEST.is_file():
        assert len(expected_samples()) > 100


@pytest.mark.parametrize("path", media_files(), ids=lambda p: str(p.relative_to(ROOT)))
def test_parses_without_errors(path):
    try:
        manager.parse(path)
    except UnidentifiedImageError:
        assert path.stat().st_size < 100 or "bad_images" in str(path)


def test_utf8_novelai_webp(resources):
    result = manager.parse(SAMPLES / "webp/novelai-curated.webp")
    assert re.match(r"1girl, solo, hatsune miku, #テスト", get_full_prompt(result))


def test_little_endian_user_comment(resources):
    result = manager.parse(SAMPLES / "jpg/civitai-lora.jpg")
    assert result.samplers[0].name == "Euler a"
    assert get_full_prompt(result).startswith("perfect eyes, 1girl")


def test_custom_samplers_and_text_nodes(resources):
    anima = manager.parse(SAMPLES / "png/comfyui-anima.png")
    assert anima.samplers[0].parameters["cfg_scale"] == 5
    assert anima.samplers[0].parameters["seed"] == 662066908990052
    assert get_full_negative_prompt(anima).startswith("bad quality")
    assert manager.parse(SAMPLES / "png/comfyui-comfyroll.png").full_prompt.startswith("general, masterpiece")


def test_inputs(resources):
    path = SAMPLES / "png/forge.png"
    expected = manager.parse(path).to_dict()
    assert manager.parse(str(path)).to_dict() == expected
    assert manager.parse(path.read_bytes()).to_dict() == expected
    with open(path, "rb") as file:
        assert manager.parse(file).to_dict() == expected


def test_not_an_image():
    with pytest.raises(UnidentifiedImageError):
        manager.parse(b"not an image at all")
