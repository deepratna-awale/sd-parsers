// Parses image and video bytes with the sd-parsers library. Runs in the browser and in the API route.
import { ParserManager } from "sd-parsers/parserManager";
import { Eagerness, detectFormat, type MediaFormat } from "sd-parsers/extractors";
import { detectVideoFormat } from "sd-parsers/video";
import type { PromptInfo } from "sd-parsers/data";

export type { MediaFormat };

export interface ParseOptions {
  /** Also read stealth (alpha channel) metadata; needs a canvas, so browsers only */
  deepScan?: boolean;
}

export interface ParseResult {
  format: MediaFormat | null;
  promptInfo: PromptInfo | null;
}

const parserManager = new ParserManager();

/** Try to extract generation parameters from encoded image or video data */
export async function parseImageBytes(bytes: Uint8Array, { deepScan = false }: ParseOptions = {}): Promise<ParseResult> {
  const format = detectFormat(bytes) ?? detectVideoFormat(bytes);
  if (!format) return { format, promptInfo: null };

  const eagerness = deepScan ? Eagerness.EAGER : Eagerness.DEFAULT;
  return { format, promptInfo: await parserManager.parse(bytes, eagerness) };
}
