# SD-Parsers-Web

> **⚠️ DEPRECATED**: This package has been deprecated and is no longer maintained. Please use [`@enslo/sd-metadata`](https://www.npmjs.com/package/@enslo/sd-metadata) instead.

Read structured metadata from images created with stable diffusion - **Browser Edition**.

A TypeScript package for extracting prompt information and generation parameters from AI-generated images in the browser. You need images that are already embedded with generation data to use this library, it does not "predict" anything.

Website & API: https://sd-parsers.vercel.app/

> **Note**: This is a browser-only fork of sd-parsers, designed specifically for use in web applications without Node.js dependencies.

![Example Output](example_output.png)

## Features

Prompts as well as some well-known generation parameters are provided as easily accessible properties.

Supports reading metadata from images generated with:
* Automatic1111's Stable Diffusion web UI ✅
* Fooocus ✅
* ComfyUI ✅
* InvokeAI ✅
* NovelAI ✅

## Installation

```bash
npm install sd-parsers-web
```

## Usage

### Basic usage:

For a simple query, import `ParserManager` from `sd-parsers-web` and use its `parse()` method to parse an image.

#### Read prompt information from a File object with `parse()`:

```typescript
import { ParserManager } from 'sd-parsers-web';

const parserManager = new ParserManager();

async function handleFileInput(file: File) {
  const promptInfo = await parserManager.parse(file);
  
  if (promptInfo) {
    for (const prompt of promptInfo.prompts) {
      console.log(`Prompt: ${prompt.value}`);
    }
  }
}
```

#### Read prompt information from an ArrayBuffer:

```typescript
import { ParserManager } from 'sd-parsers-web';

const parserManager = new ParserManager();

async function handleDrop(event: DragEvent) {
  const file = event.dataTransfer?.files[0];
  if (file) {
    const arrayBuffer = await file.arrayBuffer();
    const promptInfo = await parserManager.parse(arrayBuffer);
    
    if (promptInfo) {
      console.log(promptInfo);
    }
  }
}
```

#### Parse a remote image:

```typescript
import { ParserManager } from 'sd-parsers-web';

const parserManager = new ParserManager();

async function parseRemoteImage(url: string) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  const promptInfo = await parserManager.parse(arrayBuffer);
  
  if (promptInfo) {
    console.log(promptInfo);
  }
}
```

### Parsing options:

#### Configure metadata extraction:

```typescript
import { ParserManager, Eagerness } from 'sd-parsers-web';

const parserManager = new ParserManager({ eagerness: Eagerness.EAGER });
```

`Eagerness` sets the metadata searching effort:

- **FAST**: cut some corners to save some time
- **DEFAULT**: try to ensure all metadata is read (default)
- **EAGER**: include additional methods to try and retrieve metadata (computationally expensive!)

> **Browser Version Note**: Due to browser environment constraints, FAST and EAGER modes have limited functionality. DEFAULT mode (the default setting) is recommended for best results in the browser version.

#### Only use specific parser modules:

```typescript
import { ParserManager, AUTOMATIC1111Parser } from 'sd-parsers-web';

const parserManager = new ParserManager({
  managedParsers: [AUTOMATIC1111Parser]
});
```

#### Debug mode:

```typescript
import { ParserManager } from 'sd-parsers-web';

const parserManager = new ParserManager({ debug: true });
```

### Output

The parser returns a `PromptInfo` object with the following structure:

```typescript
interface PromptInfo {
  generator: Generators;
  samplers: Sampler[];
  metadata: Record<string, any>;
  rawParameters: Record<string, any>;
}
```

Access parsed data using helper functions:

```typescript
import { getFullPrompt, getFullNegativePrompt, getModels } from 'sd-parsers-web';

const prompt = getFullPrompt(promptInfo);
const negativePrompt = getFullNegativePrompt(promptInfo);
const models = getModels(promptInfo);
```

## API Reference

### Classes

- `ParserManager`: Main class for parsing images
- `AUTOMATIC1111Parser`: Parser for AUTOMATIC1111 webui images ✅
- `FooocusParser`: Parser for Fooocus images ✅
- `ComfyUIParser`: Parser for ComfyUI images ✅
- `InvokeAIParser`: Parser for InvokeAI images ✅
- `NovelAIParser`: Parser for NovelAI images ✅

### Types

- `PromptInfo`: Contains structured image generation parameters
- `Sampler`: Represents a sampler used during image generation
- `Model`: Represents a checkpoint model
- `Prompt`: Represents an image generation prompt

### Enums

- `Generators`: Supported image generators
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

## Differences from Original sd-parsers

This browser-only fork has the following differences:

1. **Designed for Browsers**: Optimized for browser environments; Node.js compatibility not tested or supported
2. **Input Types**: Accepts `Blob | ArrayBuffer | Uint8Array` instead of file paths
3. **No CLI**: Command-line interface removed
4. **Image Processing**: Uses browser APIs instead of Sharp
5. **EXIF Parsing**: Uses exifr library for JPEG EXIF data
6. **Limited Eagerness Modes**: 
   - FAST mode: PNG IHDR parsing not implemented (returns null)
   - EAGER mode: Stenographic analysis not available in browsers
   - DEFAULT mode: Fully functional (recommended)

## Contributing

Contributions are welcome! This is a browser-focused fork of the original sd-parsers library. If you find issues or want to add support for additional image generators, please open an issue or pull request.

## License

MIT License - same as the original version.

## Credits

- Original library: [sd-parsers](https://github.com/d3x-at/sd-parsers) by d3x-at
- TypeScript port: [sd-parsers](https://github.com/deepratna-awale/sd-parsers) by Deepratna Awale
- Browser adaptation: Ernest Croft
