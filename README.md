# SD-Parsers


Read structured metadata from images created with stable diffusion.

A TypeScript package for extracting prompt information and generation parameters for AI-generated images. You need images that are already embedded with generation data to use this library, it does not "predict" anything.

Website & API: https://sd-parsers.vercel.app/ (drop an image to read its metadata; parsing happens in your browser). Source in [`web/`](web/README.md).

> **Note**: This started as a TypeScript port of the Python [sd-parsers](https://github.com/d3x-at/sd-parsers) library. It keeps output parity with the Python version (checked by tests) and adds async/await, full TypeScript types and a few parsing improvements.

![sd-parsers: read prompts and generation settings embedded in Stable Diffusion images](.github/social-preview.png)

## Features

Prompts, models, samplers and other well-known generation parameters are provided as easily accessible properties.

Supports reading metadata from images generated with:

| Generator | Parser |
| --- | --- |
| Automatic1111's Stable Diffusion web UI and the tools that write its format: Forge, Forge Classic, Forge Neo, reForge, EasyReforge, SD.Next, CivitAI (AUTOMATIC1111 style), Fooocus (A1111 scheme), ComfyUI save nodes | `AUTOMATIC1111Parser` |
| Fooocus | `FooocusParser` |
| ComfyUI (including JPEG / WEBP save nodes, group nodes, custom samplers and popular node packs) | `ComfyUIParser` |
| InvokeAI | `InvokeAIParser` |
| NovelAI (PNG and WEBP) | `NovelAIParser` |
| SwarmUI | `SwarmUIParser` |
| Easy Diffusion | `EasyDiffusionParser` |
| Draw Things | `DrawThingsParser` |
| RuinedFooocus | `RuinedFooocusParser` |
| Stability Matrix | `StabilityMatrixParser` |
| TensorArt | `TensorArtParser` |
| CivitAI (node graph format) | `CivitaiParser` |
| Hugging Face Spaces (Stable Diffusion XL spaces) | `HFSpaceParser` |
| Dezgo | `DezgoParser` |
| KusArt | `KusArtParser` |
| ChatGPT, Gemini, Grok Imagine, Meta AI and other services that label their images with C2PA manifests (Content Credentials) or an IPTC digital source type | `ProvenanceParser` |

`PromptInfo.generator` names the metadata format, and `PromptInfo.software` the tool that actually made the image when it can be told apart, for example `Forge Neo`, `SD.Next` or `Civitai` for images in the AUTOMATIC1111 format.

Beyond the prompts and settings, every result also lists the LoRAs that were applied (with their weights and hashes when recorded, see `getLoras()`) and the image size, and `toInfotext()` writes the generation data of any supported tool as AUTOMATIC1111 style text, the format most tools and sites accept for pasting settings.

Images that are labelled as AI made but carry no generation data, like those from ChatGPT or Gemini, are reported with `Generators.C2PA` or `Generators.IPTC` and the tool's name in `software`. Every result also gets `PromptInfo.provenance` when the image has C2PA manifests or an XMP digital source type, see `readProvenance()`. Signatures are not verified, so treat these labels as claims.

Metadata is read from:

* **PNG**: `tEXt`, `zTXt` and `iTXt` chunks, including text stored after the image data, the `eXIf` chunk (CivitAI) and XMP packets. `tEXt` chunks holding UTF-8 text are decoded as UTF-8
* **JPEG / WEBP**: the EXIF `UserComment` (in either UTF-16 byte order, or as ASCII / UTF-8 text), the `ImageDescription`, `Make`, `Model`, `Software` and `MakerNote` tags, JPEG comments (`COM` segments) and XMP packets. Values that ComfyUI save nodes label with a chunk name (`prompt:{...}`, `Workflow: {...}`) and JSON objects holding PNG chunk names (NovelAI, ComfyUI) are read like the PNG chunks they stand for
* **PNG alpha channel**: "stealth" metadata (NovelAI and the A1111 stealth-pnginfo extension), at `Eagerness.EAGER`

## Installation

```bash
npm install sd-parsers
```

Requires Node.js 22 or newer (use 22.23.4, 24.22.1, 26.12.1 or later, which fix CVE-2026-111497), or any modern browser / JavaScript runtime (Deno, Bun, edge functions).

The metadata is read straight from the file contents, without decoding the image. [sharp](https://sharp.pixelplumbing.com/) is an optional dependency, only used in Node.js to decode pixels for stealth metadata (`Eagerness.EAGER`). Install with `npm install sd-parsers --omit=optional` to skip it; everything else keeps working.

## Command Line Usage

You can use sd-parsers from the command line to quickly print the metadata of one or more images:

```bash
npx sd-parsers image1.png image2.jpg
```

For each image this prints the models, samplers with their parameters, the prompt, the negative prompt and any other metadata found.

For scripts, `--json` prints a JSON array with one entry per file, in the same shape as `promptInfoToDict()` plus `file`, `format` and `found` (or `file` and `error` when a file can't be read):

```bash
npx sd-parsers --json image1.png image2.jpg | jq '.[].full_prompt'
```

`--infotext` prints AUTOMATIC1111 style text instead, ready to paste into the PNG Info tab of a web UI or a prompt sharing site:

```bash
npx sd-parsers --infotext comfyui.png
```

Commands write a new image file (`-o` may name the input to change it in place):

```bash
npx sd-parsers strip image.png -o clean.png                 # remove all metadata
npx sd-parsers copy original.png edited.jpg -o edited.jpg   # carry metadata over to another file, in its format
npx sd-parsers to-a1111 comfyui.png -o comfyui.png          # rewrite the generation data as AUTOMATIC1111 text
```

Add `--eager` to also read stealth metadata from the PNG alpha channel (needs sharp). The command exits with 1 when any file can't be read. This runs locally, so prefer it over the website's `/api/parse` endpoint for batch jobs.

## Usage

### Basic usage

Import `ParserManager` from `sd-parsers` and call its `parse()` method. It accepts a file path (Node.js only), the file contents as a `Buffer`, `Uint8Array` or `ArrayBuffer`, a `Blob` / `File`, or a `sharp` instance, and resolves to a `PromptInfo` object, or `null` when no known metadata is found.

#### Read prompt information from a file:

```typescript
import { ParserManager, getFullPrompt, getFullNegativePrompt, getModels } from 'sd-parsers';

const parserManager = new ParserManager();

async function main() {
  const promptInfo = await parserManager.parse('image.png');

  if (promptInfo) {
    console.log(`Generator: ${promptInfo.generator}`);
    console.log(`Prompt: ${getFullPrompt(promptInfo)}`);
    console.log(`Negative prompt: ${getFullNegativePrompt(promptInfo)}`);

    for (const model of getModels(promptInfo)) {
      console.log(`Model: ${model.name ?? model.hash}`);
    }

    for (const sampler of promptInfo.samplers) {
      console.log(`Sampler: ${sampler.name}`, sampler.parameters);
    }
  }
}
```

#### Read prompt information from a Buffer:

```typescript
import { ParserManager } from 'sd-parsers';
import { readFile } from 'fs/promises';

const parserManager = new ParserManager();

async function main() {
  const imageBuffer = await readFile('image.png');
  const promptInfo = await parserManager.parse(imageBuffer);

  if (promptInfo) {
    console.log(promptInfo);
  }
}
```

#### Read prompt information in the browser:

```typescript
import { ParserManager, Eagerness } from 'sd-parsers';

const parserManager = new ParserManager();

input.addEventListener('change', async () => {
  const promptInfo = await parserManager.parse(input.files[0], Eagerness.EAGER);
  console.log(promptInfo);
});
```

In browsers, stealth metadata is decoded with a canvas (`createImageBitmap` and `OffscreenCanvas`). To use another decoder, or when neither sharp nor a canvas is available, pass `decodePixels`, which resolves to raw, interleaved pixels:

```typescript
const promptInfo = await parserManager.parse(bytes, {
  eagerness: Eagerness.EAGER,
  decodePixels: async () => ({ data, width, height, channels: 4 }),
});
```

Without a pixel decoder, stealth metadata is skipped and the other metadata is still read.

Pass a file path or the file contents to get all metadata. When a `sharp` instance is passed, the original file contents are not available, so text chunks stored after the image data cannot be told apart from the ones before it.

### Parsing options

#### Configure metadata extraction:

```typescript
import { ParserManager, Eagerness } from 'sd-parsers';

const parserManager = new ParserManager({ eagerness: Eagerness.EAGER });

// or per call
const promptInfo = await parserManager.parse('image.png', Eagerness.FAST);
```

`Eagerness` sets the metadata searching effort:

- **FAST**: cut some corners to save some time (PNG text chunks before the image data, JPEG / WEBP `UserComment`)
- **DEFAULT**: try to ensure all metadata is read (all PNG text chunks; default)
- **EAGER**: include additional methods to try and retrieve metadata, such as stealth metadata in the alpha channel (computationally expensive!)

#### Only use specific parser modules:

```typescript
import { ParserManager, AUTOMATIC1111Parser } from 'sd-parsers';

const parserManager = new ParserManager({
  managedParsers: [AUTOMATIC1111Parser]
});
```

#### Keep the original parameter names:

By default, parameter names are normalized (for example `cfg_scale`, `steps`, `seed`). Turn this off to get the names as the generator wrote them:

```typescript
const parserManager = new ParserManager({ normalizeParameters: false });
```

#### Debug mode:

```typescript
const parserManager = new ParserManager({ debug: true });
```

Prints the errors that individual parsers ran into while trying an image.

### Output

`parse()` returns a `PromptInfo` object:

```typescript
interface PromptInfo {
  generator: Generators;              // metadata format, e.g. Generators.COMFYUI
  software?: string;                  // the tool that made the image, e.g. 'Forge Neo'
  samplers: Sampler[];                // samplers with their model, prompts and parameters
  loras?: Lora[];                     // { name, weight?, clipWeight?, hash? }
  width?: number;                     // generation size, or the size in the image header
  height?: number;
  metadata: Record<string, any>;      // other generator-specific parameters
  rawParameters: Record<string, any>; // unprocessed metadata as found in the image
}

interface Sampler {
  name: string;
  parameters: Record<string, any>;    // cfg_scale, steps, seed, scheduler, ...
  samplerId?: string;
  model?: Model;                      // { name?, hash?, modelId?, metadata }
  prompts: Prompt[];                  // { value, promptId?, metadata }
  negativePrompts: Prompt[];
}
```

Helper functions for common lookups:

```typescript
import {
  getFullPrompt,
  getFullNegativePrompt,
  getPrompts,
  getNegativePrompts,
  getModels,
  promptInfoToDict,
  promptInfoToJSON,
  toInfotext,
  getLoras,
  readImageSize
} from 'sd-parsers';

const prompt = getFullPrompt(promptInfo);              // whole prompt as a string
const negativePrompt = getFullNegativePrompt(promptInfo);
const prompts = getPrompts(promptInfo);                // unique Prompt objects across samplers
const models = getModels(promptInfo);                  // unique Model objects across samplers
const json = promptInfoToJSON(promptInfo);             // serializable summary
const infotext = toInfotext(promptInfo);               // "a cat\nNegative prompt: ...\nSteps: 20, Sampler: ..."
const size = readImageSize(bytes);                     // { width, height } from a PNG, JPEG or WEBP header
```

### Writing metadata

`writeMetadata`, `stripMetadata` and `copyMetadata` take the bytes of a PNG, JPEG or WEBP file and return new bytes, without re-encoding the image:

```typescript
import { readFileSync, writeFileSync } from 'fs';
import { ParserManager, toInfotext, writeMetadata, stripMetadata, copyMetadata, readMetadataEntries } from 'sd-parsers';

const image = new Uint8Array(readFileSync('comfyui.png'));

// make the image readable by tools that only know the AUTOMATIC1111 format
const promptInfo = await new ParserManager().parse(image);
writeFileSync('a1111.png', writeMetadata(image, toInfotext(promptInfo!)));

// write raw entries: PNG text chunks, or EXIF tags and a JSON UserComment in JPEG / WEBP files
writeFileSync('copy.png', writeMetadata(image, { prompt: '{...}', workflow: '{...}' }));

// move metadata to a file in another format, for example after converting the image
const jpeg = new Uint8Array(readFileSync('converted.jpg'));
writeFileSync('converted.jpg', copyMetadata(image, jpeg));

// remove it before sharing
writeFileSync('clean.png', stripMetadata(image));

const entries = readMetadataEntries(image); // { prompt: '...', workflow: '...' }
```

### Provenance

```typescript
import { readProvenance, readC2pa } from 'sd-parsers';

const provenance = readProvenance(bytes);
// { source: 'C2PA', aiGenerated: true, digitalSourceType: 'trainedAlgorithmicMedia',
//   vendor: 'OpenAI', software: 'ChatGPT', c2pa: { manifests: [...] } }

const store = readC2pa(bytes); // every manifest: claim generator, actions, signers, decoded assertions
```

JPEG files hold at most 64 KB of metadata. Larger generation data is written as UTF-8 instead of UTF-16, and `writeMetadata` throws a `RangeError` when even that doesn't fit. `stripMetadata` leaves the image data alone, so stealth metadata hidden in the alpha channel stays.

### Errors

Images without known metadata, and images in formats other than PNG, JPEG and WEBP, resolve to `null`. When a parser cannot read the metadata it raises a `ParserError` internally, and `ParserManager` moves on to the next parser instead of crashing. Turn on `debug` to see these errors. Errors unrelated to metadata, such as a missing file, are thrown as usual, and input that is not an image at all is rejected with an `UnidentifiedImageError`.

## API Reference

### Classes

- `ParserManager`: Main class for parsing images
- `AUTOMATIC1111Parser`: Parser for AUTOMATIC1111 webui images
- `FooocusParser`: Parser for Fooocus images
- `ComfyUIParser`: Parser for ComfyUI images
- `InvokeAIParser`: Parser for InvokeAI images
- `NovelAIParser`: Parser for NovelAI images
- `ParserError`, `MetadataError`: Errors raised while parsing
- `UnidentifiedImageError`: Raised when the input is not an image

### Types

- `PromptInfo`: Contains structured image generation parameters
- `Sampler`: Represents a sampler used during image generation
- `Model`: Represents a checkpoint model
- `Prompt`: Represents an image generation prompt
- `Lora`: A LoRA applied to the image, with its weights and hash
- `ImageSize`: Width and height of an image
- `Provenance`, `C2paManifestStore`, `C2paManifest`, `C2paAction`: C2PA and XMP provenance labels
- `ParseInput`, `ParseOptions`: Inputs and per-call options of `ParserManager.parse()`
- `DecodedPixels`, `PixelDecoder`: Raw pixel data for stealth metadata

### Enums

- `Generators`: Supported image generators (`AUTOMATIC1111`, `ComfyUI`, `Fooocus`, `InvokeAI`, `NovelAI`, `Unknown`)
- `Eagerness`: Metadata extraction effort levels

## Development

### Building

```bash
npm run build
```

### Testing

```bash
npm test
```

### Watch mode

```bash
npm run dev
```

## Differences from Python Version

This TypeScript port has some differences from the original Python version:

1. **Image Processing**: Metadata is read from the file contents directly; pixels are only decoded (with sharp or a canvas) for stealth metadata
2. **Async/Await**: All parsing operations are asynchronous
3. **Type Safety**: Full TypeScript type definitions
4. **Field Names**: Data fields use camelCase (`rawParameters`, `negativePrompts`, `samplerId`, ...)
5. **Module System**: Uses ES modules/CommonJS instead of Python imports
6. **More Metadata Sources**: JPEG / WEBP files written by ComfyUI and NovelAI, CivitAI images and UTF-8 text in PNG `tEXt` chunks are read
7. **More Lenient Parsing**: Malformed metadata is rejected with a `ParserError` instead of crashing, JSON containing `NaN` / `Infinity` is accepted and Fooocus images without a model hash or negative prompt are still parsed

### Checking against the Python library

`tests/resources/upstream-expected.json` holds the output of the Python library for every test image, and `tests/integration/upstream-parity.test.ts` checks that this package produces the same results. To refresh it after upstream changes:

```bash
git clone https://github.com/d3x-at/sd-parsers /tmp/sd-parsers-upstream
pip install /tmp/sd-parsers-upstream
python scripts/generate-upstream-fixtures.py /tmp/sd-parsers-upstream
```

## Contributing

Contributions are welcome! If you find issues or want to add support for additional image generators, please open an issue or pull request.

## License

MIT License, same as the original Python version.

## Credits

- Original Python library: [sd-parsers](https://github.com/d3x-at/sd-parsers)
- Image processing: [Sharp](https://sharp.pixelplumbing.com/)
