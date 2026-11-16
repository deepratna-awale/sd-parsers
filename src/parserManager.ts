import { PromptInfo } from './data';
import { MetadataError, ParserError, UnidentifiedImageError } from './exceptions';
import {
  METADATA_EXTRACTORS,
  Eagerness,
  getImageFormat,
  getImageSize,
  getProvenance,
  isSharp,
  isOtherImageFormat,
  detectFormat,
  ExtractorImage,
  PixelDecoder,
  SharpInstance,
} from './extractors';
import { Parser, MANAGED_PARSERS } from './parsers';
import { detectVideoFormat } from './video';
import { detectSoftware } from './software';
import { getLoras } from './loras';
import { getGenerationSize } from './size';
import { readMetadataBytes, toAsyncIterable } from './stream';

/**
 * Input types that can be parsed: a file path (Node.js only), the encoded image data,
 * a `Blob` / `File`, a web `ReadableStream` or async iterable of byte chunks (such as a
 * Node.js stream), or a sharp instance
 */
export type ParseInput = string | Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array> | SharpInstance;

/**
 * Options for a single `parse()` call
 */
export interface ParseOptions {
  /** Overrides the eagerness the ParserManager was created with */
  eagerness?: Eagerness;
  /**
   * Decodes the image to raw pixels, needed for stealth metadata (`Eagerness.EAGER`).
   * Defaults to sharp when it is installed, or a canvas in browsers.
   */
  decodePixels?: PixelDecoder;
}

async function readAll(input: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const chunks: Uint8Array[] = [];
  for await (const chunk of toAsyncIterable(input)) chunks.push(chunk);
  const bytes = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * Get the bytes to parse. Files, Blobs and streams are read without their image and media
 * data, unless the pixels are needed for stealth metadata.
 */
async function readImage(input: ParseInput, decodePixels: PixelDecoder | undefined, needsPixels: boolean): Promise<ExtractorImage> {
  if (isSharp(input)) {
    return input;
  }

  let bytes: Uint8Array;
  if (input instanceof Uint8Array) {
    bytes = input;
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (typeof input === 'string' && needsPixels) {
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new TypeError('file paths can only be parsed in Node.js, pass the file contents instead');
    }
    // loaded on demand, so the library can be bundled for browsers
    const { readFile } = require('fs/promises') as typeof import('fs/promises');
    bytes = await readFile(input);
  } else if (typeof Blob !== 'undefined' && input instanceof Blob && needsPixels) {
    bytes = new Uint8Array(await input.arrayBuffer());
  } else if (needsPixels && typeof input === 'object' && input !== null) {
    bytes = await readAll(input as ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>);
  } else {
    bytes = await readMetadataBytes(input as string | Blob | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>);
  }

  if (!detectFormat(bytes) && !detectVideoFormat(bytes) && !isOtherImageFormat(bytes)) {
    throw new UnidentifiedImageError('cannot identify image file');
  }

  return { bytes, decodePixels };
}

/**
 * Fill in the fields that are worked out from the parsed data: software, LoRAs and size
 */
async function addDerivedFields(promptInfo: PromptInfo, image: ExtractorImage): Promise<void> {
  promptInfo.software ??= detectSoftware(promptInfo);
  if (!promptInfo.loras) {
    const loras = getLoras(promptInfo);
    if (loras.length > 0) promptInfo.loras = loras;
  }
  if (!promptInfo.provenance) {
    const provenance = await getProvenance(image).catch(() => null);
    if (provenance) promptInfo.provenance = provenance;
  }
  if (!promptInfo.width || !promptInfo.height) {
    const size = getGenerationSize(promptInfo) ?? (await getImageSize(image).catch(() => null));
    if (size) {
      promptInfo.width = size.width;
      promptInfo.height = size.height;
    }
  }
}

/**
 * Provides a simple way of testing multiple parser modules against a given image
 */
export class ParserManager {
  private eagerness: Eagerness;
  private debug: boolean;
  private managedParsers: Parser[];

  constructor(options: {
    debug?: boolean;
    eagerness?: Eagerness;
    managedParsers?: (new (normalizeParameters?: boolean, debug?: boolean) => Parser)[];
    normalizeParameters?: boolean;
  } = {}) {
    const {
      debug = false,
      eagerness = Eagerness.DEFAULT,
      managedParsers,
      normalizeParameters = true
    } = options;

    this.eagerness = eagerness;
    this.debug = debug;

    const parsersToUse = managedParsers || MANAGED_PARSERS;
    this.managedParsers = parsersToUse.map(ParserClass => 
      new ParserClass(normalizeParameters, debug)
    );
  }

  /**
   * Try to extract image generation parameters from the given image.
   */
  async parse(
    input: ParseInput,
    options?: Eagerness | ParseOptions
  ): Promise<PromptInfo | null> {
    const { eagerness, decodePixels } = typeof options === 'object' ? options : { eagerness: options };
    const targetEagerness = eagerness || this.eagerness;

    const image = await readImage(input, decodePixels, targetEagerness >= Eagerness.EAGER);
    const format = await getImageFormat(image);

    if (!format) {
      if (this.debug) {
        console.log('Unknown image format');
      }
      return null;
    }

    // Get extractors for this format
    const extractors = METADATA_EXTRACTORS[format];
    if (!extractors) {
      if (this.debug) {
        console.log(`Unsupported image format: ${format}`);
      }
      return null;
    }

    // Try extractors in order of eagerness
    for (const eagernessLevel of [Eagerness.FAST, Eagerness.DEFAULT, Eagerness.EAGER]) {
      if (eagernessLevel > targetEagerness) {
        break;
      }

      const levelExtractors = extractors[eagernessLevel];
      if (!levelExtractors) {
        continue;
      }

      for (const extractor of levelExtractors) {
        for (const parser of this.managedParsers) {
          let parameters: Record<string, any> | null;
          try {
            parameters = await extractor(image, parser.generator);
          } catch (error) {
            if (!(error instanceof MetadataError)) {
              throw error;
            }
            if (this.debug) {
              console.error('Error reading metadata:', error.message);
            }
            break; // try next extractor
          }

          if (parameters == null) {
            continue;
          }

          try {
            const promptInfo = await parser.parse(parameters);
            await addDerivedFields(promptInfo, image);
            return promptInfo;
          } catch (error) {
            if (!(error instanceof ParserError)) {
              throw error;
            }
            if (this.debug) {
              console.error(`Error in parser[${parser.constructor.name}]: ${error.message}`);
            }
          }
        }
      }
    }

    return null;
  }
}
