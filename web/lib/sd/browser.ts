import { toInfotext } from "sd-parsers/infotext";
import { readMetadataBytes } from "sd-parsers/stream";
import { parseImageBytes, type ParseResult } from "./parse";

export interface BrowserParseResult extends ParseResult {
  /** The generation data as AUTOMATIC1111 style text, for images that have generation data */
  infotext?: string;
}

const LABEL_ONLY = ["C2PA", "IPTC"];

/**
 * Parse an image or video file entirely in the browser. Only the parts of the file that hold
 * metadata are read, so large videos load instantly; the whole image is read only for a deep
 * scan of the pixels, when nothing else was found.
 */
export async function parseFile(file: Blob, { deepScan = true } = {}): Promise<BrowserParseResult> {
  let result = await parseImageBytes(await readMetadataBytes(file));
  if (!result.promptInfo && deepScan && result.format === "PNG") {
    result = await parseImageBytes(new Uint8Array(await file.arrayBuffer()), { deepScan });
  }
  const info = result.promptInfo;
  return info && !LABEL_ONLY.includes(info.generator) ? { ...result, infotext: toInfotext(info) } : result;
}
