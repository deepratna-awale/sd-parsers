import sharp from 'sharp';
import { readFile } from 'fs/promises';
import { PromptInfo } from './data';
import { MetadataError, ParserError } from './exceptions';
import { METADATA_EXTRACTORS, Eagerness, registerImageBuffer } from './extractors';
import { Parser, MANAGED_PARSERS } from './parsers';

/**
 * Input types that can be parsed
 */
export type ParseInput = string | Buffer | sharp.Sharp;

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
    eagerness?: Eagerness
  ): Promise<PromptInfo | null> {
    const targetEagerness = eagerness || this.eagerness;
    
    let image: sharp.Sharp;

    if (typeof input === 'string' || Buffer.isBuffer(input)) {
      const buffer = typeof input === 'string' ? await readFile(input) : input;
      image = sharp(buffer);
      registerImageBuffer(image, buffer);
    } else {
      // Already a Sharp instance
      image = input;
    }

    // Get image metadata to determine format
    const metadata = await image.metadata();
    const format = metadata.format?.toUpperCase();
    
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
