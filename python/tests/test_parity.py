"""Check that the Python package gives exactly the output of the npm package, which is built from
the same repository. Needs Node.js and `npm run build`; skipped otherwise."""

import hashlib
import json
import shutil
import subprocess

import pytest

from sd_parse import ParserManager, copy_metadata, strip_metadata, to_infotext, write_metadata
from sd_parse.cli import main

from .conftest import RESOURCES, ROOT, SAMPLES, media_files

NODE = shutil.which("node")
CLI = ROOT / "bin" / "cli.js"

pytestmark = pytest.mark.skipif(
    not NODE or not (ROOT / "dist" / "index.js").is_file() or not RESOURCES.is_dir(),
    reason="needs Node.js and the npm package built with `npm run build`",
)

FILES = [str(path.relative_to(ROOT)) for path in media_files()]
IMAGES = [file for file in FILES if file.lower().endswith((".png", ".jpg", ".jpeg", ".webp"))]
WRITER_TARGETS = [str((RESOURCES / "writer" / name).relative_to(ROOT)) for name in ("plain.png", "plain.jpg", "lossless.webp", "lossy.webp")]


def node(*args):
    return subprocess.run([NODE, *args], cwd=ROOT, capture_output=True).stdout.decode("utf-8")


def python(capsys, monkeypatch, *args):
    monkeypatch.chdir(ROOT)
    capsys.readouterr()
    main(list(args))
    return capsys.readouterr().out


@pytest.mark.parametrize(
    "options",
    [["--json"], ["--infotext"], [], ["stats", "--json"], ["stats"]],
    ids=["json", "infotext", "text", "stats-json", "stats"],
)
def test_cli_output(capsys, monkeypatch, options):
    command = options[:1] if options[:1] == ["stats"] else []
    flags = options[len(command) :]
    args = [*command, *flags, *FILES]
    assert python(capsys, monkeypatch, *args) == node(str(CLI), *args)


def test_eager(capsys, monkeypatch):
    pytest.importorskip("PIL")
    file = str((RESOURCES / "parsers/AUTOMATIC1111/automatic1111_stealth.png").relative_to(ROOT))
    assert python(capsys, monkeypatch, "--eager", "--json", file) == node(str(CLI), "--eager", "--json", file)


@pytest.mark.parametrize(
    "pair",
    [
        ("png/comfyui.png", "png/comfyui-lora.png"),
        ("png/forge.png", "png/forge-neo.png"),
        ("png/novelai-full.png", "png/novelai-v3.png"),
        ("png/sd-next.png", "jpg/sd-next.jpg"),
        ("png/swarmui.png", "png/fooocus.png"),
    ],
)
@pytest.mark.parametrize("json_output", [False, True])
def test_diff(capsys, monkeypatch, pair, json_output):
    files = [str((SAMPLES / name).relative_to(ROOT)) for name in pair]
    args = ["diff", *files, *(["--json"] if json_output else [])]
    assert python(capsys, monkeypatch, *args) == node(str(CLI), *args)


def _hash(make):
    try:
        return hashlib.sha256(make()).hexdigest()
    except Exception as error:  # noqa: BLE001
        return f"error: {type(error).__name__}"


def test_writer():
    expected = json.loads(node(str(ROOT / "python" / "tests" / "parity.cjs"), ",".join(WRITER_TARGETS), *IMAGES))
    targets = {target: (ROOT / target).read_bytes() for target in WRITER_TARGETS}
    manager = ParserManager()
    mismatches = []
    for file in IMAGES:
        data = (ROOT / file).read_bytes()
        try:
            prompt_info = manager.parse(data)
        except Exception:  # noqa: BLE001
            prompt_info = None
        actual = {
            "strip": _hash(lambda: strip_metadata(data)),
            "copy": {target: _hash(lambda: copy_metadata(data, image)) for target, image in targets.items()},
            "a1111": _hash(lambda: write_metadata(data, to_infotext(prompt_info))) if prompt_info else None,
        }
        if _normalize(actual) != _normalize(expected[file]):
            mismatches.append(file)
    assert not mismatches


def _normalize(part):
    def fix(value):
        return "error" if isinstance(value, str) and value.startswith("error") else value

    return {key: {t: fix(v) for t, v in value.items()} if isinstance(value, dict) else fix(value) for key, value in part.items()}

