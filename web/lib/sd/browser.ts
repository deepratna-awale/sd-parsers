import "./buffer-global";
import { parseImageBytes, type DecodedPixels, type ParseResult } from "./parse";

async function decodePixels(file: Blob): Promise<DecodedPixels> {
  // keep the alpha channel untouched: the stealth metadata lives in its lowest bits
  const bitmap = await createImageBitmap(file, {
    premultiplyAlpha: "none",
    colorSpaceConversion: "none",
  });
  try {
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d", { colorSpace: "srgb", willReadFrequently: true });
    if (!context) throw new Error("canvas unavailable");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
    return { data: new Uint8Array(data.buffer), width: bitmap.width, height: bitmap.height, channels: 4 };
  } finally {
    bitmap.close();
  }
}

/** Parse an image file entirely in the browser */
export async function parseFile(file: Blob, { deepScan = true } = {}): Promise<ParseResult> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  return parseImageBytes(bytes, deepScan ? { decodePixels: () => decodePixels(file) } : {});
}
