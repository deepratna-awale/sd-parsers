import io
import math

import pytest

from sd_image_parsers import (
    Eagerness,
    Generators,
    ParserManager,
    compare_metadata,
    copy_metadata,
    get_generation_settings,
    parse_prompt_tokens,
    read_metadata_bytes,
    read_metadata_entries,
    strip_metadata,
    to_infotext,
    write_metadata,
)
from sd_image_parsers._util import js_number, num_str

from .conftest import RESOURCES, SAMPLES

manager = ParserManager()


class OneWayStream(io.RawIOBase):
    """A stream that can only be read forwards, in small chunks"""

    def __init__(self, data):
        self.data = data
        self.position = 0

    def readable(self):
        return True

    def seekable(self):
        return False

    def read(self, size=-1):
        size = min(size if size >= 0 else len(self.data), 1000)
        chunk = self.data[self.position : self.position + size]
        self.position += len(chunk)
        return chunk


@pytest.mark.parametrize(
    "name",
    ["png/forge.png", "jpg/forge-neo.jpeg", "webp/sd-next.webp", "mp4/comfyui-wan2.2.mp4", "webm/comfyui-mmh3.webm", "mkv/forge-neo-wan2.2.mkv"],
)
def test_metadata_bytes_skip_media_data(resources, name):
    path = SAMPLES / name
    data = path.read_bytes()
    skeleton = read_metadata_bytes(path)
    assert len(skeleton) <= len(data)
    assert read_metadata_bytes(OneWayStream(data)) == skeleton
    assert read_metadata_bytes(io.BytesIO(data)) == skeleton
    assert manager.parse(skeleton).to_dict() == manager.parse(data).to_dict()


def test_stealth_metadata(resources):
    pytest.importorskip("PIL")
    path = RESOURCES / "parsers/AUTOMATIC1111/automatic1111_stealth.png"
    assert manager.parse(path) is None
    result = manager.parse(path, Eagerness.EAGER)
    assert result.generator == Generators.AUTOMATIC1111


def test_write_and_read_back(resources):
    source = manager.parse(SAMPLES / "png/comfyui.png")
    text = to_infotext(source)
    for name in ("plain.png", "plain.jpg", "lossless.webp", "lossy.webp"):
        image = (RESOURCES / "writer" / name).read_bytes()
        written = write_metadata(image, text)
        result = manager.parse(written)
        assert result.generator == Generators.AUTOMATIC1111
        assert result.full_prompt == source.full_prompt.strip()
        assert manager.parse(strip_metadata(written)) is None


def test_copy_between_formats(resources):
    original = (SAMPLES / "png/comfyui.png").read_bytes()
    expected = manager.parse(original)
    for name in ("plain.jpg", "lossless.webp"):
        copied = copy_metadata(original, (RESOURCES / "writer" / name).read_bytes())
        result = manager.parse(copied)
        assert result.generator == expected.generator
        assert result.full_prompt == expected.full_prompt
        assert set(read_metadata_entries(copied)) >= {"prompt", "workflow"}


def test_prompt_tokens():
    tokens = parse_prompt_tokens("(blue sky:1.2), [cloud], {{star}}, <lora:detail:0.5>, embedding:bad.pt, BREAK, plain_tag")
    assert [(t.text, t.weight, t.kind) for t in tokens] == [
        ("blue sky", 1.2, "tag"),
        ("cloud", 0.9091, "tag"),
        ("star", 1.1025, "tag"),
        ("detail", 0.5, "lora"),
        ("bad", 1, "embedding"),
        ("BREAK", 1, "break"),
        ("plain_tag", 1, "tag"),
    ]
    assert tokens[-1].normalized == "plain tag"


def test_compare(resources):
    first = manager.parse(SAMPLES / "png/comfyui.png")
    second = manager.parse(SAMPLES / "png/comfyui-lora.png")
    comparison = compare_metadata(first, second)
    assert 0 <= comparison.prompt_similarity <= 1
    assert get_generation_settings(first).generator == "ComfyUI"
    assert compare_metadata(first, first).settings == {}


@pytest.mark.parametrize(
    "value,expected",
    [(1.0, "1"), (0.1, "0.1"), (1e-7, "1e-7"), (1.5e-6, "0.0000015"), (1e21, "1e+21"), (123456789.5, "123456789.5"), (-0.25, "-0.25")],
)
def test_numbers_are_written_like_javascript(value, expected):
    assert num_str(value) == expected


def test_numbers_are_read_like_javascript():
    assert js_number(" 12 ") == 12
    assert js_number("0x10") == 16
    assert js_number("") == 0
    assert math.isnan(js_number("12px"))
