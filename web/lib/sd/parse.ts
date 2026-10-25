// Parses image bytes with the sd-parsers library without sharp, so the same code
// runs in the browser and in the API route.
import { MANAGED_PARSERS } from "sd-parsers/parsers";
import { Generators, type PromptInfo } from "sd-parsers/data";
import { MetadataError, ParserError } from "sd-parsers/exceptions";
import { readPngText, type PngTextData } from "sd-parsers/extractors/png";
import { EXIF_TAGS, decodeUtf16BE, getExifValue } from "sd-parsers/extractors/exif";
import { readStealthText } from "sd-parsers/extractors/stealth";
import { loadJson } from "sd-parsers/utils/json";

export type ImageFormat = "PNG" | "JPEG" | "WEBP";

export interface DecodedPixels {
  data: Uint8Array;
  width: number;
  height: number;
  channels: number;
}

export interface ParseOptions {
  /** Decodes the image to raw pixels; enables the stealth (alpha channel) extractor */
  decodePixels?: () => Promise<DecodedPixels>;
}

export interface ParseResult {
  format: ImageFormat | null;
  promptInfo: PromptInfo | null;
}

type Extractor = (generator: Generators) => Promise<Record<string, unknown> | null>;

const ascii = (bytes: Uint8Array, start: number, end: number) =>
  String.fromCharCode(...bytes.subarray(start, end));

export function detectFormat(bytes: Uint8Array): ImageFormat | null {
  if (bytes.length >= 8 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === "PNG") return "PNG";
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "JPEG";
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return "WEBP";
  return null;
}

/** Find the exif block of a JPEG (APP1 segment) */
function jpegExif(bytes: Buffer): Buffer | null {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    // start of scan: no more metadata segments
    if (marker === 0xda || marker === 0xd9) return null;
    const length = bytes.readUInt16BE(offset + 2);
    const segment = bytes.subarray(offset + 4, offset + 2 + length);
    if (marker === 0xe1 && segment.subarray(0, 6).toString("latin1") === "Exif\u0000\u0000") {
      return segment;
    }
    offset += 2 + length;
  }
  return null;
}

/** Find the exif block of a WEBP (EXIF chunk) */
function webpExif(bytes: Buffer): Buffer | null {
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString("latin1", offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    if (type === "EXIF") return bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size % 2);
  }
  return null;
}

function once<T>(compute: () => Promise<T>): () => Promise<T> {
  let result: Promise<T> | undefined;
  return () => (result ??= compute());
}

function pngExtractors(bytes: Buffer, options: ParseOptions): Extractor[][] {
  const text = once(async (): Promise<PngTextData> => readPngText(bytes));
  const stealth = once(async () => {
    if (!options.decodePixels) return { error: "pixel decoding unavailable" };
    try {
      const { data, width, height, channels } = await options.decodePixels();
      const value = readStealthText(data, width, height, channels);
      let json: Record<string, unknown> | undefined;
      try {
        json = loadJson(value);
      } catch {
        json = undefined;
      }
      return { text: value, json };
    } catch (error) {
      return { error };
    }
  });

  const stealthExtractor: Extractor = async (generator) => {
    if ((await text()).colorType !== 6) throw new MetadataError("image mode is not RGBA");
    const { text: value, json, error } = await stealth();
    if (error !== undefined) throw new MetadataError(`error reading metadata: ${error}`);
    if (generator === Generators.NOVELAI) return json ?? null;
    if (generator === Generators.AUTOMATIC1111) return value ? { parameters: value } : null;
    return null;
  };

  return [
    [async () => (await text()).info],
    [async () => (await text()).text],
    options.decodePixels ? [stealthExtractor] : [],
  ];
}

function exifExtractors(exif: Buffer | null): Extractor[][] {
  const userComment = once(async () => {
    try {
      if (!exif) throw new Error("no exif data");
      const value = getExifValue(exif, EXIF_TAGS.UserComment);
      if (value.length <= 8) throw new Error("exif value too short");
      return { value: decodeUtf16BE(value.subarray(8)) };
    } catch (error) {
      return { error };
    }
  });

  return [
    [
      async (generator) => {
        const { value, error } = await userComment();
        if (error !== undefined) throw new MetadataError(`error reading UserComment: ${error}`);
        if (generator === Generators.AUTOMATIC1111 || generator === Generators.FOOOCUS) {
          return { parameters: value };
        }
        return null;
      },
    ],
  ];
}

/**
 * Try to extract image generation parameters from encoded image data.
 * Follows the same extractor/parser order as the library's ParserManager.
 */
export async function parseImageBytes(input: Uint8Array, options: ParseOptions = {}): Promise<ParseResult> {
  const bytes = Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const format = detectFormat(bytes);
  if (!format) return { format, promptInfo: null };

  const levels =
    format === "PNG"
      ? pngExtractors(bytes, options)
      : exifExtractors(format === "JPEG" ? jpegExif(bytes) : webpExif(bytes));
  const parsers = MANAGED_PARSERS.map((ParserClass) => new ParserClass(true, false));

  for (const extractors of levels) {
    for (const extractor of extractors) {
      for (const parser of parsers) {
        let parameters: Record<string, unknown> | null;
        try {
          parameters = await extractor(parser.generator);
        } catch (error) {
          if (!(error instanceof MetadataError)) throw error;
          break; // try next extractor
        }
        if (parameters == null) continue;

        try {
          return { format, promptInfo: await parser.parse(parameters) };
        } catch (error) {
          if (!(error instanceof ParserError)) throw error;
        }
      }
    }
  }

  return { format, promptInfo: null };
}
