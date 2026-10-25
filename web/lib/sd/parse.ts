// Parses image bytes with the sd-parsers library. Runs in the browser and in the API route.
import { ParserManager } from "sd-parsers/parserManager";
import { Eagerness, detectFormat, type ImageFormat } from "sd-parsers/extractors";
import type { PromptInfo } from "sd-parsers/data";

export type { ImageFormat };

export interface ParseOptions {
  /** Also read stealth (alpha channel) metadata; needs a canvas, so browsers only */
  deepScan?: boolean;
}

export interface ParseResult {
  format: ImageFormat | null;
  promptInfo: PromptInfo | null;
}

const parserManager = new ParserManager();

/** Try to extract image generation parameters from encoded image data */
export async function parseImageBytes(bytes: Uint8Array, { deepScan = false }: ParseOptions = {}): Promise<ParseResult> {
  const format = detectFormat(bytes);
  if (!format) return { format, promptInfo: null };

  const eagerness = deepScan ? Eagerness.EAGER : Eagerness.DEFAULT;
  return { format, promptInfo: await parserManager.parse(bytes, eagerness) };
}
