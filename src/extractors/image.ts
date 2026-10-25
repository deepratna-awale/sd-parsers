import { latin1 } from '../utils/bytes';

export type ImageFormat = 'PNG' | 'JPEG' | 'WEBP';

/**
 * Raw, interleaved pixel data
 */
export interface DecodedPixels {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

/**
 * Decodes an image to raw pixels; needed for stealth (alpha channel) metadata only
 */
export type PixelDecoder = () => Promise<DecodedPixels>;

/**
 * An encoded image, as read by the metadata extractors
 */
export interface ImageSource {
  /** Image format, detected from `bytes` when missing */
  format?: ImageFormat;
  /** Encoded image data (the file contents) */
  bytes?: Uint8Array;
  /** Pixel decoder, defaults to sharp (Node.js) or a canvas (browsers) */
  decodePixels?: PixelDecoder;
}

/**
 * The parts of a sharp instance the extractors use. Declared here, so the
 * library's types do not depend on sharp, which is an optional dependency.
 */
export interface SharpInstance {
  metadata(): Promise<{
    format?: string;
    exif?: Uint8Array;
    comments?: { keyword: string; text: string }[];
    channels?: number;
  }>;
  clone(): SharpInstance;
  raw(): SharpInstance;
  toBuffer(options: { resolveWithObject: true }): Promise<{
    data: Uint8Array;
    info: { width: number; height: number; channels: number };
  }>;
}

/**
 * Image accepted by the metadata extractors: an encoded image or a sharp instance
 */
export type ExtractorImage = ImageSource | SharpInstance;

/**
 * Detect the image format from the file signature
 */
export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && latin1(bytes, 1, 4) === 'PNG') return 'PNG';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'JPEG';
  if (bytes.length >= 12 && latin1(bytes, 0, 4) === 'RIFF' && latin1(bytes, 8, 12) === 'WEBP') return 'WEBP';
  return null;
}

/**
 * Check for image formats that are recognized, but carry no supported metadata
 */
export function isOtherImageFormat(bytes: Uint8Array): boolean {
  const head = latin1(bytes, 0, Math.min(12, bytes.length));
  return (
    head.startsWith('GIF8') ||
    head.startsWith('BM') ||
    head.startsWith('II*\u0000') ||
    head.startsWith('MM\u0000*') ||
    head.slice(4, 8) === 'ftyp' || // AVIF, HEIF
    head.startsWith('\u0000\u0000\u0001\u0000') || // ICO
    head.startsWith('\u00ff\u000a') || // JPEG XL codestream
    head === '\u0000\u0000\u0000\u000cJXL \u000d\u000a\u0087\u000a' // JPEG XL container
  );
}

export function isSharp(image: unknown): image is SharpInstance {
  return typeof (image as SharpInstance | undefined)?.metadata === 'function' && typeof (image as SharpInstance).raw === 'function';
}

type SharpModule = (input: Uint8Array) => SharpInstance;
let sharpModule: SharpModule | null | undefined;

/**
 * Load sharp if it is installed. It is an optional dependency, only used to decode pixels.
 */
export function loadSharp(): SharpModule | null {
  if (sharpModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require('sharp');
      const sharp = typeof loaded === 'function' ? loaded : loaded?.default;
      sharpModule = typeof sharp === 'function' ? (sharp as SharpModule) : null;
    } catch {
      sharpModule = null;
    }
  }
  return sharpModule;
}

export async function decodeWithSharp(image: SharpInstance): Promise<DecodedPixels> {
  const { data, info } = await image.clone().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

async function decodeWithCanvas(bytes: Uint8Array): Promise<DecodedPixels> {
  // keep the alpha channel untouched: the stealth metadata lives in its lowest bits
  const bitmap = await createImageBitmap(new Blob([bytes as BlobPart]), {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext('2d', { colorSpace: 'srgb', willReadFrequently: true });
    if (!context) throw new Error('canvas unavailable');
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: new Uint8Array(data.buffer), width: bitmap.width, height: bitmap.height, channels: 4 };
  } finally {
    bitmap.close();
  }
}

/**
 * Pick a pixel decoder for encoded image data: sharp when installed, otherwise a canvas when available
 */
export function defaultPixelDecoder(bytes: Uint8Array): PixelDecoder | undefined {
  const sharp = loadSharp();
  if (sharp) {
    return () => decodeWithSharp(sharp(bytes));
  }
  if (typeof createImageBitmap === 'function' && typeof OffscreenCanvas === 'function') {
    return () => decodeWithCanvas(bytes);
  }
  return undefined;
}
