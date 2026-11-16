const decoder = new TextDecoder();

/** A CBOR tag that has no plain JavaScript equivalent */
export interface CborTagged {
  tag: number;
  value: unknown;
}

const BREAK = Symbol('break');

/**
 * Decode one CBOR item (RFC 8949). Byte strings become `Uint8Array`, maps become plain
 * objects with string keys, and tags other than date/time keep their tag number.
 */
export function decodeCbor(data: Uint8Array): unknown {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  const need = (length: number) => {
    if (offset + length > data.length) throw new RangeError('CBOR data ends early');
  };

  const readLength = (info: number): number | null => {
    if (info < 24) return info;
    if (info === 24) {
      need(1);
      return data[offset++];
    }
    if (info === 25) {
      need(2);
      offset += 2;
      return view.getUint16(offset - 2);
    }
    if (info === 26) {
      need(4);
      offset += 4;
      return view.getUint32(offset - 4);
    }
    if (info === 27) {
      need(8);
      offset += 8;
      const value = view.getBigUint64(offset - 8);
      return Number(value);
    }
    if (info === 31) return null;
    throw new RangeError(`Invalid CBOR length ${info}`);
  };

  const readHalf = (bits: number) => {
    const exponent = (bits >> 10) & 0x1f;
    const fraction = bits & 0x3ff;
    const sign = bits & 0x8000 ? -1 : 1;
    if (exponent === 0) return sign * 2 ** -14 * (fraction / 1024);
    if (exponent === 31) return fraction ? NaN : sign * Infinity;
    return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
  };

  const readBytes = (length: number) => {
    need(length);
    offset += length;
    return data.subarray(offset - length, offset);
  };

  const readChunks = (major: number): Uint8Array[] => {
    const chunks: Uint8Array[] = [];
    for (;;) {
      const item = readItem();
      if (item === BREAK) return chunks;
      chunks.push(major === 2 ? (item as Uint8Array) : new TextEncoder().encode(item as string));
    }
  };

  const join = (chunks: Uint8Array[]) => {
    const result = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let position = 0;
    for (const chunk of chunks) {
      result.set(chunk, position);
      position += chunk.length;
    }
    return result;
  };

  const readItem = (): unknown => {
    need(1);
    const initial = data[offset++];
    const major = initial >> 5;
    const info = initial & 0x1f;

    if (major === 7) {
      if (info === 20) return false;
      if (info === 21) return true;
      if (info === 22) return null;
      if (info === 23) return undefined;
      if (info === 25) {
        need(2);
        offset += 2;
        return readHalf(view.getUint16(offset - 2));
      }
      if (info === 26) {
        need(4);
        offset += 4;
        return view.getFloat32(offset - 4);
      }
      if (info === 27) {
        need(8);
        offset += 8;
        return view.getFloat64(offset - 8);
      }
      if (info === 31) return BREAK;
      if (info === 24) {
        need(1);
        offset++;
      }
      return undefined;
    }

    const length = readLength(info);
    switch (major) {
      case 0:
        return length;
      case 1:
        return -1 - (length ?? 0);
      case 2:
        return length === null ? join(readChunks(2)) : readBytes(length);
      case 3:
        return decoder.decode(length === null ? join(readChunks(3)) : readBytes(length));
      case 4: {
        const items: unknown[] = [];
        for (let i = 0; length === null || i < length; i++) {
          const item = readItem();
          if (item === BREAK) break;
          items.push(item);
        }
        return items;
      }
      case 5: {
        const map: Record<string, unknown> = {};
        for (let i = 0; length === null || i < length; i++) {
          const key = readItem();
          if (key === BREAK) break;
          map[String(key)] = readItem();
        }
        return map;
      }
      default: {
        const value = readItem();
        // 0: date/time string, 1: epoch seconds
        if (length === 0 || length === 1) return value;
        return { tag: length, value } as CborTagged;
      }
    }
  };

  return readItem();
}
