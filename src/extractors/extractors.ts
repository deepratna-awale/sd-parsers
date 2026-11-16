import { Generators } from '../data';
import { MetadataError } from '../exceptions';
import { readPngText, PngTextData } from './png';
import { MetadataEntries, readExifEntries, readExifImageEntries, unpackJsonEntries } from './entries';
import { readStealthText } from './stealth';
import {
  ExtractorImage,
  ImageFormat,
  PixelDecoder,
  SharpInstance,
  defaultPixelDecoder,
  decodeWithSharp,
  detectFormat,
  isSharp,
} from './image';
import { loadJson } from '../utils/json';
import { readImageSize } from '../size';
import { Provenance, readProvenance } from '../provenance';

/**
 * Type definition for metadata extractor functions
 */
export type ExtractorFunction = (
  image: ExtractorImage,
  generator: Generators
) => Promise<Record<string, any> | null>;

const imageBuffers = new WeakMap<SharpInstance, Uint8Array>();

/**
 * Associate a sharp instance with the encoded image data it was created from.
 *
 * SharpInstance does not expose the original file contents, which are needed to read
 * text chunks in the same way as the Python library does.
 */
export function registerImageBuffer(image: SharpInstance, buffer: Uint8Array): void {
  imageBuffers.set(image, buffer);
}

/**
 * Cache a value per image instance, preventing multiple extractions for the same image
 */
function cached<T>(compute: (image: ExtractorImage) => Promise<T>): (image: ExtractorImage) => Promise<T> {
  const cache = new WeakMap<ExtractorImage, Promise<T>>();
  return image => {
    let result = cache.get(image);
    if (!result) {
      result = compute(image);
      cache.set(image, result);
    }
    return result;
  };
}

interface ResolvedImage {
  format: ImageFormat | null;
  bytes?: Uint8Array;
  sharp?: SharpInstance;
  decodePixels?: PixelDecoder;
}

/**
 * Work out what is known about an image: its format, its file contents and how to decode its pixels
 */
const resolveImage = cached(async (image): Promise<ResolvedImage> => {
  if (isSharp(image)) {
    const bytes = imageBuffers.get(image);
    const format = bytes ? detectFormat(bytes) : ((await image.metadata()).format?.toUpperCase() as ImageFormat);
    return { format, bytes, sharp: image, decodePixels: () => decodeWithSharp(image) };
  }

  const { bytes, decodePixels } = image;
  return {
    format: image.format ?? (bytes ? detectFormat(bytes) : null),
    bytes,
    decodePixels: decodePixels ?? (bytes && defaultPixelDecoder(bytes)),
  };
});

/**
 * Detect the format of an image passed to the extractors
 */
export async function getImageFormat(image: ExtractorImage): Promise<ImageFormat | null> {
  return (await resolveImage(image)).format;
}

const getPngText = cached(async (image): Promise<PngTextData> => {
  const { bytes, sharp } = await resolveImage(image);
  if (bytes) {
    return readPngText(bytes);
  }
  if (!sharp) {
    return { info: {}, text: {} };
  }

  // no access to the original file contents, fall back to the text chunks reported by sharp
  const metadata = await sharp.metadata();
  const text = Object.fromEntries((metadata.comments ?? []).map(({ keyword, text }) => [keyword, text]));
  // `paletteBitDepth` is reported at runtime but missing from sharp's type definitions
  const isPalette = (metadata as { paletteBitDepth?: number }).paletteBitDepth !== undefined;
  return { info: text, text, colorType: metadata.channels === 4 && !isPalette ? 6 : undefined };
});

/**
 * Extract metadata from the PNG text chunks preceding the image data (PIL's `Image.info`)
 */
export async function pngImageInfo(image: ExtractorImage, _: Generators): Promise<Record<string, any> | null> {
  return (await getPngText(image)).info;
}

/**
 * Extract metadata from all PNG text chunks
 * (iTXt, tEXt and zTXt chunks may appear at the end of the file)
 */
export async function pngImageText(image: ExtractorImage, _: Generators): Promise<Record<string, any> | null> {
  return (await getPngText(image)).text;
}

const getStealthData = cached(async (image): Promise<{ text?: string; json?: any; error?: unknown }> => {
  try {
    const { decodePixels } = await resolveImage(image);
    if (!decodePixels) {
      throw new Error('no pixel decoder available (install sharp or pass `decodePixels`)');
    }
    const { data, width, height, channels } = await decodePixels();
    const text = readStealthText(data, width, height, channels);
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
export async function pngStenographicAlpha(image: ExtractorImage, generator: Generators): Promise<Record<string, any> | null> {
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

const getExifImageEntries = cached(async (image): Promise<MetadataEntries | null> => {
  const { format, bytes, sharp } = await resolveImage(image);
  if (format !== 'JPEG' && format !== 'WEBP') {
    return null;
  }
  if (bytes) {
    return readExifImageEntries(bytes, format);
  }
  const metadata = await sharp?.metadata();
  const entries = metadata?.exif ? readExifEntries(metadata.exif) : {};
  unpackJsonEntries(entries, entries.UserComment);
  return entries;
});

/**
 * Extract metadata from the JPEG / WEBP UserComment EXIF field
 */
export async function jpegUserComment(image: ExtractorImage, generator: Generators): Promise<Record<string, any> | null> {
  const entries = await getExifImageEntries(image);
  const value = entries?.UserComment;
  if (!value) {
    throw new MetadataError('error reading UserComment: no exif data');
  }

  if (generator === Generators.AUTOMATIC1111 || generator === Generators.FOOOCUS) {
    return { parameters: value };
  }

  return null;
}

/**
 * Extract all text metadata of a JPEG / WEBP image: EXIF text tags, JPEG comments and XMP properties.
 *
 * JSON objects holding PNG chunk names (as written by NovelAI and some ComfyUI save nodes)
 * are unpacked, so parsers find the same keys as in PNG files.
 */
export async function exifImageEntries(image: ExtractorImage, _: Generators): Promise<Record<string, any> | null> {
  const entries = await getExifImageEntries(image);
  return entries && Object.keys(entries).length > 0 ? entries : null;
}

/**
 * Read the C2PA manifests or XMP digital source type of an image, when its bytes are at hand
 */
export const getProvenance = cached(async (image): Promise<Provenance | null> => {
  const { bytes } = await resolveImage(image);
  return bytes ? readProvenance(bytes) : null;
});

/**
 * Provenance labels for the provenance parser, as `{ provenance }`
 */
export async function provenanceLabels(image: ExtractorImage, generator: Generators): Promise<Record<string, any> | null> {
  if (generator !== Generators.C2PA) return null;
  const provenance = await getProvenance(image);
  return provenance ? { provenance } : null;
}

/**
 * Read the size of an image from its header (or from sharp)
 */
export async function getImageSize(image: ExtractorImage): Promise<{ width: number; height: number } | null> {
  const { bytes, sharp } = await resolveImage(image);
  if (bytes) {
    return readImageSize(bytes);
  }
  const metadata = await sharp?.metadata();
  return metadata?.width && metadata.height ? { width: metadata.width, height: metadata.height } : null;
}
