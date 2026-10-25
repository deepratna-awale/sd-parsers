import { inflate } from './zlib';
import { latin1 } from '../utils/bytes';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const EMPTY = new Uint8Array(0);

export interface PngTextData {
  /** Text chunks found before the image data (equivalent of PIL's `Image.info`) */
  info: Record<string, any>;
  /** All text chunks of the file (equivalent of PIL's `PngImageFile.text`) */
  text: Record<string, any>;
  /** PNG color type from the IHDR chunk */
  colorType?: number;
}

function splitNull(data: Uint8Array): [Uint8Array, Uint8Array] | null {
  const index = data.indexOf(0);
  return index === -1 ? null : [data.subarray(0, index), data.subarray(index + 1)];
}

function decodeUtf8Strict(data: Uint8Array): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

/**
 * Read a tEXt, zTXt or iTXt chunk the same way PIL's PngImagePlugin does
 *
 * Returns the keyword, the value for `Image.info` and the value for `Image.text`.
 */
function readTextChunk(type: string, data: Uint8Array): [string, any, string] | null {
  if (type === 'tEXt') {
    const [key, value] = splitNull(data) ?? [data, EMPTY];
    if (key.length === 0) return null;

    const keyword = latin1(key);
    const text = latin1(value);
    return [keyword, keyword === 'exif' ? value : text, text];
  }

  if (type === 'zTXt') {
    const [key, value] = splitNull(data) ?? [data, EMPTY];
    const compressionMethod = value.length > 0 ? value[0] : 0;
    if (compressionMethod !== 0 || key.length === 0) return null;

    let text: string;
    try {
      text = latin1(inflate(value.subarray(1)));
    } catch {
      text = '';
    }
    return [latin1(key), text, text];
  }

  if (type === 'iTXt') {
    const keySplit = splitNull(data);
    if (!keySplit) return null;
    const [key, rest] = keySplit;
    if (rest.length < 2) return null;

    const compressionFlag = rest[0];
    const compressionMethod = rest[1];
    const langSplit = splitNull(rest.subarray(2));
    const translatedSplit = langSplit && splitNull(langSplit[1]);
    if (!langSplit || !translatedSplit) return null;

    const [lang, translatedKeyword] = [langSplit[0], translatedSplit[0]];
    let value = translatedSplit[1];

    if (compressionFlag !== 0) {
      if (compressionMethod !== 0) return null;
      try {
        value = inflate(value);
      } catch {
        return null;
      }
    }

    try {
      decodeUtf8Strict(lang);
      decodeUtf8Strict(translatedKeyword);
      const text = decodeUtf8Strict(value);
      return [latin1(key), text, text];
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Read the text chunks of a PNG file
 */
export function readPngText(buffer: Uint8Array): PngTextData {
  const result: PngTextData = { info: {}, text: {} };

  if (buffer.length < 8 || PNG_SIGNATURE.some((byte, i) => buffer[i] !== byte)) {
    return result;
  }

  const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

  let offset = 8;
  let seenImageData = false;

  while (offset + 8 <= buffer.length) {
    const length = view.getUint32(offset);
    const type = latin1(buffer, offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;

    if (dataEnd > buffer.length) {
      break;
    }

    const data = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR' && data.length >= 10) {
      result.colorType = data[9];
    } else if (type === 'IDAT') {
      seenImageData = true;
    } else if (type === 'IEND') {
      break;
    } else {
      const entry = readTextChunk(type, data);
      if (entry) {
        const [keyword, infoValue, textValue] = entry;
        if (!seenImageData) {
          result.info[keyword] = infoValue;
        }
        result.text[keyword] = textValue;
      }
    }

    // skip chunk data and crc
    offset = dataEnd + 4;
  }

  return result;
}
