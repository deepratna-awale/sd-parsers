# sd-image-parsers

Read the prompts and generation settings embedded in images made with Stable Diffusion and other AI image tools.

This is the Python release of [sd-parsers](https://github.com/deepratna-awale/sd-parsers), published with the same version numbers as the [npm package](https://www.npmjs.com/package/sd-parsers) and giving the same results for every image. It does not "predict" anything: images must already carry their generation data.

Website: https://sd-parsers.vercel.app/ (drop an image to read its metadata in your browser).

## Installation

```bash
pip install sd-image-parsers
```

Requires Python 3.10 or newer and has no dependencies. Stealth metadata hidden in the PNG alpha channel is read with Pillow, which comes with the `stealth` extra:

```bash
pip install "sd-image-parsers[stealth]"
```

## Supported tools

AUTOMATIC1111 and the tools that write its format (Forge, Forge Classic, Forge Neo, reForge, SD.Next, CivitAI), Fooocus, ComfyUI (including JPEG / WEBP save nodes and popular node packs), InvokeAI, NovelAI, SwarmUI, Easy Diffusion, Draw Things, RuinedFooocus, Stability Matrix, TensorArt, CivitAI node graphs, Hugging Face Spaces, Dezgo and KusArt. Images from ChatGPT, Gemini, Grok Imagine, Meta AI and other services that label them with C2PA manifests or an IPTC digital source type are reported with the service's name.

Metadata is read from PNG text chunks, JPEG / WEBP EXIF, comments and XMP, MP4 / MOV / WebM / MKV video tags, and the PNG alpha channel. Only the metadata is read, so the image is never decoded (except for stealth metadata).

## Command line

```bash
sd-image-parsers image1.png image2.jpg             # models, samplers, prompts and other metadata
sd-image-parsers --json image1.png | jq '.[0].full_prompt'
sd-image-parsers --infotext comfyui.png            # AUTOMATIC1111 style text, ready to paste
sd-image-parsers strip image.png -o clean.png      # remove all metadata
sd-image-parsers copy original.png edited.jpg -o edited.jpg
sd-image-parsers to-a1111 comfyui.png -o comfyui.png
sd-image-parsers diff first.png second.png         # settings, prompt tokens and LoRAs that differ
sd-image-parsers stats outputs/*.png               # software, models, samplers, sizes, LoRAs and tags
```

`python -m sd_image_parsers` works too. Add `--eager` to read stealth metadata (needs Pillow). The command exits with 1 when any file can't be read.

## Usage

```python
from sd_image_parsers import ParserManager

prompt_info = ParserManager().parse("image.png")
if prompt_info:
    print(prompt_info.generator, prompt_info.software)
    print(prompt_info.full_prompt)
    print(prompt_info.full_negative_prompt)
    for model in prompt_info.models:
        print(model.name, model.hash)
    for sampler in prompt_info.samplers:
        print(sampler.name, sampler.parameters)
```

`parse()` takes a file path, the file contents as `bytes`, or a binary file object (also non-seekable streams, of which only the metadata is read). It returns a `PromptInfo`, or `None` when no known metadata is found. Pass `eagerness=Eagerness.EAGER` to `ParserManager` to also look for stealth metadata.

### Output

`prompt_info_to_dict()` and `prompt_info_to_json()` give the same JSON as the npm package and the `--json` option (`full_prompt`, `samplers`, `negativePrompts`, `rawParameters` and so on):

```python
from sd_image_parsers import prompt_info_to_json

print(prompt_info_to_json(prompt_info, indent=2))
```

### Helpers

```python
from sd_image_parsers import (
    get_generation_settings,  # model, sampler, steps, CFG scale, seed, size, LoRAs and prompts as plain values
    get_loras,                # LoRAs with their weights and hashes
    to_infotext,              # the generation data as AUTOMATIC1111 text
    compare_metadata,         # what differs between two images
    analyze_collection,       # a summary of many images
    parse_prompt_tokens,      # a prompt split into weighted tokens
    read_provenance,          # C2PA and XMP labels of AI made images
)
```

### Writing metadata

```python
from sd_image_parsers import copy_metadata, strip_metadata, to_infotext, write_metadata

with open("image.png", "rb") as file:
    image = file.read()

clean = strip_metadata(image)
a1111 = write_metadata(image, to_infotext(prompt_info))
edited = copy_metadata(image, edited_jpeg_bytes)
```

PNG, JPEG and WEBP images are supported.

## License

MIT
