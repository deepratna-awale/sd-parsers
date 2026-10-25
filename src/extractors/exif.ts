import { latin1 } from '../utils/bytes';

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

const EXIF_IFD_POINTER = 0x8769;

const EXIF_HEADER = 'Exif\u0000\u0000';

export const EXIF_TAGS = {
  UserComment: 0x9286,
} as const;

/**
 * Read the raw value of a tag of the given IFD (default: Exif IFD) out of an exif block.
 *
 * Throws when the exif data, the IFD or the tag is missing.
 */
export function getExifValue(exif: Uint8Array, tag: number, ifdTag: number = EXIF_IFD_POINTER): Uint8Array {
  let tiff = exif;
  if (latin1(tiff, 0, Math.min(6, tiff.length)) === EXIF_HEADER) {
    tiff = tiff.subarray(6);
  }

  const byteOrder = latin1(tiff, 0, Math.min(2, tiff.length));
  if (byteOrder !== 'II' && byteOrder !== 'MM') {
    throw new Error('invalid exif header');
  }
  const littleEndian = byteOrder === 'II';
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, littleEndian);
  const u32 = (offset: number) => view.getUint32(offset, littleEndian);

  const findEntry = (ifdOffset: number, wanted: number) => {
    const count = u16(ifdOffset);
    for (let i = 0; i < count; i++) {
      const entry = ifdOffset + 2 + i * 12;
      if (u16(entry) === wanted) {
        const type = u16(entry + 2);
        const size = (TYPE_SIZES[type] ?? 1) * u32(entry + 4);
        const valueOffset = size <= 4 ? entry + 8 : u32(entry + 8);
        if (valueOffset + size > tiff.length) {
          throw new Error('exif value out of bounds');
        }
        return { valueOffset, size };
      }
    }
    return null;
  };

  const ifdPointer = findEntry(u32(4), ifdTag);
  if (!ifdPointer) {
    throw new Error(`exif ifd ${ifdTag} not found`);
  }

  const entry = findEntry(u32(ifdPointer.valueOffset), tag);
  if (!entry) {
    throw new Error(`exif tag ${tag} not found`);
  }

  return tiff.subarray(entry.valueOffset, entry.valueOffset + entry.size);
}

/**
 * Decode UTF-16 big endian text, throwing on invalid data like Python's `bytes.decode("utf_16_be")`
 */
export function decodeUtf16BE(data: Uint8Array): string {
  if (data.length % 2 !== 0) {
    throw new Error('truncated utf-16 data');
  }
  const swapped = new Uint8Array(data.length);
  for (let i = 0; i < data.length; i += 2) {
    swapped[i] = data[i + 1];
    swapped[i + 1] = data[i];
  }
  return new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(swapped);
}

/**
 * Find the exif block of a JPEG (APP1 segment) or WEBP (EXIF chunk) file
 */
export function findExif(bytes: Uint8Array, format: 'JPEG' | 'WEBP'): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (format === 'WEBP') {
    let offset = 12;
    while (offset + 8 <= bytes.length) {
      const type = latin1(bytes, offset, offset + 4);
      const size = view.getUint32(offset + 4, true);
      if (type === 'EXIF') {
        return bytes.subarray(offset + 8, offset + 8 + size);
      }
      offset += 8 + size + (size % 2);
    }
    return null;
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      // fill byte
      offset++;
      continue;
    }
    // start of scan / end of image: no more metadata segments
    if (marker === 0xda || marker === 0xd9) return null;
    const length = view.getUint16(offset + 2);
    const segment = bytes.subarray(offset + 4, offset + 2 + length);
    if (marker === 0xe1 && latin1(segment, 0, Math.min(6, segment.length)) === EXIF_HEADER) {
      return segment;
    }
    offset += 2 + length;
  }
  return null;
}
