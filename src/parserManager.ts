import { PromptInfo } from './data';
import { MetadataError, ParserError, UnidentifiedImageError } from './exceptions';
import {
  METADATA_EXTRACTORS,
  Eagerness,
  getImageFormat,
  isSharp,
  isOtherImageFormat,
  detectFormat,
  ExtractorImage,
  PixelDecoder,
  SharpInstance,
} from './extractors';
import { Parser, MANAGED_PARSERS } from './parsers';

/**
 * Input types that can be parsed: a file path (Node.js only), the encoded image data,
 * a `Blob` / `File` or a sharp instance
 */
export type ParseInput = string | Uint8Array | ArrayBuffer | Blob | SharpInstance;

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

async function readImage(input: ParseInput, decodePixels?: PixelDecoder): Promise<ExtractorImage> {
  if (isSharp(input)) {
    return input;
  }

  let bytes: Uint8Array;
  if (typeof input === 'string') {
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new TypeError('file paths can only be parsed in Node.js, pass the file contents instead');
    }
    // loaded on demand, so the library can be bundled for browsers
    const { readFile } = require('fs/promises') as typeof import('fs/promises');
    bytes = await readFile(input);
  } else if (input instanceof Uint8Array) {
    bytes = input;
  } else if (input instanceof ArrayBuffer) {
    bytes = new Uint8Array(input);
  } else if (typeof Blob !== 'undefined' && input instanceof Blob) {
    bytes = new Uint8Array(await input.arrayBuffer());
  } else {
    throw new TypeError('unsupported input type');
  }

  if (!detectFormat(bytes) && !isOtherImageFormat(bytes)) {
    throw new UnidentifiedImageError('cannot identify image file');
  }

  return { bytes, decodePixels };
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

    const image = await readImage(input, decodePixels);
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
            return await parser.parse(parameters);
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
