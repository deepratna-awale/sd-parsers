from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
RESOURCES = ROOT / "tests" / "resources"
SAMPLES = RESOURCES / "samples"


def media_files():
    """Every image and video the npm package's tests use"""
    if not RESOURCES.is_dir():
        return []
    extensions = {".png", ".jpg", ".jpeg", ".webp", ".mp4", ".mov", ".mkv", ".webm"}
    return sorted(path for path in RESOURCES.rglob("*") if path.suffix.lower() in extensions)


@pytest.fixture(scope="session")
def resources():
    if not RESOURCES.is_dir():
        pytest.skip("the test images live in the repository's tests/resources folder")
    return RESOURCES
