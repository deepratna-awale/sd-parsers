from importlib.metadata import PackageNotFoundError, version

try:
    __version__ = version("sd-parse")
except PackageNotFoundError:  # running from a source checkout
    __version__ = "0.0.0"
