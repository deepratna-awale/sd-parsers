import { PromptInfo } from './data';
import { isDict } from './parsers/parser';

export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Read the size of a PNG, JPEG or WEBP image from its header
 */
export function readImageSize(bytes: Uint8Array): ImageSize | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.subarray(start, end));

  try {
    // PNG: IHDR is always the first chunk
    if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(12, 16) === 'IHDR') {
      return { width: view.getUint32(16), height: view.getUint32(20) };
    }

    // JPEG: the first start-of-frame segment
    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) return null;
        const marker = bytes[offset + 1];
        if (marker === 0xff) {
          offset++;
          continue;
        }
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          offset += 2;
          continue;
        }
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { width: view.getUint16(offset + 7), height: view.getUint16(offset + 5) };
        }
        if (marker === 0xda || marker === 0xd9) return null;
        offset += 2 + view.getUint16(offset + 2);
      }
      return null;
    }

    // WEBP: VP8X, VP8L or VP8 chunk
    if (bytes.length >= 30 && ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') {
      const type = ascii(12, 16);
      if (type === 'VP8X') {
        const width = 1 + (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16));
        const height = 1 + (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16));
        return { width, height };
      }
      if (type === 'VP8L' && bytes[20] === 0x2f) {
        const bits = view.getUint32(21, true);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
      }
      if (type === 'VP8 ' && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
        return { width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
      }
    }
  } catch {
    // truncated header
  }

  return null;
}

function parseSize(value: unknown): ImageSize | null {
  if (isDict(value)) {
    const width = Number(value.width);
    const height = Number(value.height);
    return width > 0 && height > 0 ? { width, height } : null;
  }
  if (typeof value !== 'string') return null;
  const match = /^\s*\(?\s*(\d+)\s*[x×,]\s*(\d+)\s*\)?/i.exec(value);
  return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
}

/**
 * Find the image size recorded in the generation data (`Size: 1024x1024`, `width` / `height`, ...)
 */
export function getGenerationSize(promptInfo: PromptInfo): ImageSize | null {
  const sources: Record<string, any>[] = [promptInfo.metadata ?? {}, ...promptInfo.samplers.map(sampler => sampler.parameters)];
  for (const source of sources) {
    for (const key of ['Size', 'size', 'resolution', 'Resolution']) {
      const size = parseSize(source[key]);
      if (size) return size;
    }
    for (const [w, h] of [
      ['width', 'height'],
      ['Width', 'Height'],
    ]) {
      const width = Number(source[w]);
      const height = Number(source[h]);
      if (width > 0 && height > 0) return { width, height };
    }
  }

  // ComfyUI: the size of the latent image node
  for (const value of Object.values(promptInfo.metadata ?? {})) {
    for (const entry of Array.isArray(value) ? value : []) {
      if (isDict(entry) && Number(entry.width) > 0 && Number(entry.height) > 0) {
        return { width: Number(entry.width), height: Number(entry.height) };
      }
      // rgthree's SDXL Empty Latent Image: "1024 x 1024  (square)"
      const size = isDict(entry) ? parseSize(entry.dimensions) : null;
      if (size) return size;
    }
  }
  return null;
}
