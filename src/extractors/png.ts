import { inflateSync, constants } from 'zlib';

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export interface PngTextData {
  /** Text chunks found before the image data (equivalent of PIL's `Image.info`) */
  info: Record<string, any>;
  /** All text chunks of the file (equivalent of PIL's `PngImageFile.text`) */
  text: Record<string, any>;
  /** PNG color type from the IHDR chunk */
  colorType?: number;
}

/**
 * Decompress zlib data, returning whatever could be decompressed from truncated streams
 */
function decompress(data: Buffer): Buffer {
  return inflateSync(data, { finishFlush: constants.Z_SYNC_FLUSH });
}

function splitNull(data: Buffer): [Buffer, Buffer] | null {
  const index = data.indexOf(0);
  return index === -1 ? null : [data.subarray(0, index), data.subarray(index + 1)];
}

function decodeUtf8Strict(data: Buffer): string {
  return new TextDecoder('utf-8', { fatal: true }).decode(data);
}

/**
 * Read a tEXt, zTXt or iTXt chunk the same way PIL's PngImagePlugin does
 *
 * Returns the keyword, the value for `Image.info` and the value for `Image.text`.
 */
function readTextChunk(type: string, data: Buffer): [string, any, string] | null {
  if (type === 'tEXt') {
    const [key, value] = splitNull(data) ?? [data, Buffer.alloc(0)];
    if (key.length === 0) return null;

    const keyword = key.toString('latin1');
    const text = value.toString('latin1');
    return [keyword, keyword === 'exif' ? value : text, text];
  }

  if (type === 'zTXt') {
    const [key, value] = splitNull(data) ?? [data, Buffer.alloc(0)];
    const compressionMethod = value.length > 0 ? value[0] : 0;
    if (compressionMethod !== 0 || key.length === 0) return null;

    let text: string;
    try {
      text = decompress(value.subarray(1)).toString('latin1');
    } catch {
      text = '';
    }
    return [key.toString('latin1'), text, text];
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
        value = decompress(value);
      } catch {
        return null;
      }
    }

    try {
      decodeUtf8Strict(lang);
      decodeUtf8Strict(translatedKeyword);
      const text = decodeUtf8Strict(value);
      return [key.toString('latin1'), text, text];
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Read the text chunks of a PNG file
 */
export function readPngText(buffer: Buffer): PngTextData {
  const result: PngTextData = { info: {}, text: {} };

  if (buffer.length < 8 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    return result;
  }

  let offset = 8;
  let seenImageData = false;

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
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
