import { parseImageBytes, type ParseResult } from "./parse";

/** Parse an image file entirely in the browser */
export async function parseFile(file: Blob, { deepScan = true } = {}): Promise<ParseResult> {
  return parseImageBytes(new Uint8Array(await file.arrayBuffer()), { deepScan });
}
