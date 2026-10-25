import sharp from 'sharp';
import { Generators } from '../data';
import { MetadataError } from '../exceptions';
import { readPngText, PngTextData } from './png';
import { getExifValue, decodeUtf16BE, EXIF_TAGS } from './exif';
import { readStealthText } from './stealth';
import { loadJson } from '../utils/json';

/**
 * Type definition for metadata extractor functions
 */
export type ExtractorFunction = (
  image: sharp.Sharp,
  generator: Generators
) => Promise<Record<string, any> | null>;

const imageBuffers = new WeakMap<sharp.Sharp, Buffer>();

/**
 * Associate a sharp instance with the encoded image data it was created from.
 *
 * Sharp does not expose the original file contents, which are needed to read
 * text chunks in the same way as the Python library does.
 */
export function registerImageBuffer(image: sharp.Sharp, buffer: Buffer): void {
  imageBuffers.set(image, buffer);
}

/**
 * Cache a value per image instance, preventing multiple extractions for the same image
 */
function cached<T>(compute: (image: sharp.Sharp) => Promise<T>): (image: sharp.Sharp) => Promise<T> {
  const cache = new WeakMap<sharp.Sharp, Promise<T>>();
  return image => {
    let result = cache.get(image);
    if (!result) {
      result = compute(image);
      cache.set(image, result);
    }
    return result;
  };
}

const getPngText = cached(async (image): Promise<PngTextData> => {
  const buffer = imageBuffers.get(image);
  if (buffer) {
    return readPngText(buffer);
  }

  // no access to the original file contents, fall back to the text chunks reported by sharp
  const metadata = await image.metadata();
  const text = Object.fromEntries((metadata.comments ?? []).map(({ keyword, text }) => [keyword, text]));
  // `paletteBitDepth` is reported at runtime but missing from sharp's type definitions
  const isPalette = (metadata as { paletteBitDepth?: number }).paletteBitDepth !== undefined;
  return { info: text, text, colorType: metadata.channels === 4 && !isPalette ? 6 : undefined };
});

/**
 * Extract metadata from the PNG text chunks preceding the image data (PIL's `Image.info`)
 */
export async function pngImageInfo(image: sharp.Sharp, _: Generators): Promise<Record<string, any> | null> {
  return (await getPngText(image)).info;
}

/**
 * Extract metadata from all PNG text chunks
 * (iTXt, tEXt and zTXt chunks may appear at the end of the file)
 */
export async function pngImageText(image: sharp.Sharp, _: Generators): Promise<Record<string, any> | null> {
  return (await getPngText(image)).text;
}

const getStealthData = cached(async (image): Promise<{ text?: string; json?: any; error?: unknown }> => {
  try {
    const { data, info } = await image.clone().raw().toBuffer({ resolveWithObject: true });
    const text = readStealthText(data, info.width, info.height, info.channels);
    let json: any;
    try {
      json = loadJson(text);
    } catch {
      json = undefined;
    }
    return { text, json };
  } catch (error) {
    return { error };
  }
});

/**
 * Try to read stealth metadata from the alpha channel of a PNG image
 */
export async function pngStenographicAlpha(image: sharp.Sharp, generator: Generators): Promise<Record<string, any> | null> {
  if ((await getPngText(image)).colorType !== 6) {
    throw new MetadataError('image mode is not RGBA');
  }

  const { text, json, error } = await getStealthData(image);
  if (error !== undefined) {
    throw new MetadataError(`error reading metadata: ${error}`);
  }

  if (generator === Generators.NOVELAI) {
    return json ?? null;
  }

  if (generator === Generators.AUTOMATIC1111) {
    return text ? { parameters: text } : null;
  }

  return null;
}

const getUserComment = cached(async (image): Promise<{ value?: string; error?: unknown }> => {
  try {
    const { exif } = await image.metadata();
    if (!exif) {
      throw new Error('no exif data');
    }

    const value = getExifValue(exif, EXIF_TAGS.UserComment);
    const prefixLength = 8;
    if (value.length <= prefixLength) {
      throw new Error('exif value too short');
    }
    return { value: decodeUtf16BE(value.subarray(prefixLength)) };
  } catch (error) {
    return { error };
  }
});

/**
 * Extract metadata from the JPEG / WEBP UserComment EXIF field
 */
export async function jpegUserComment(image: sharp.Sharp, generator: Generators): Promise<Record<string, any> | null> {
  const { value, error } = await getUserComment(image);
  if (error !== undefined) {
    throw new MetadataError(`error reading UserComment: ${error}`);
  }

  if (generator === Generators.AUTOMATIC1111 || generator === Generators.FOOOCUS) {
    return { parameters: value };
  }

  return null;
}
