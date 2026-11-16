import { toInfotext } from "sd-parsers/infotext";
import { parseImageBytes, type ParseResult } from "./parse";

export interface BrowserParseResult extends ParseResult {
  /** The generation data as AUTOMATIC1111 style text, for images that have generation data */
  infotext?: string;
}

const LABEL_ONLY = ["C2PA", "IPTC"];

/** Parse an image or video file entirely in the browser */
export async function parseFile(file: Blob, { deepScan = true } = {}): Promise<BrowserParseResult> {
  const result = await parseImageBytes(new Uint8Array(await file.arrayBuffer()), { deepScan });
  const info = result.promptInfo;
  return info && !LABEL_ONLY.includes(info.generator) ? { ...result, infotext: toInfotext(info) } : result;
}
