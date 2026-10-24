const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

const EXIF_IFD_POINTER = 0x8769;

export const EXIF_TAGS = {
  UserComment: 0x9286,
} as const;

/**
 * Read the raw value of a tag of the given IFD (default: Exif IFD) out of an exif block.
 *
 * Throws when the exif data, the IFD or the tag is missing.
 */
export function getExifValue(exif: Buffer, tag: number, ifdTag: number = EXIF_IFD_POINTER): Buffer {
  let tiff = exif;
  if (tiff.subarray(0, 6).toString('latin1') === 'Exif\u0000\u0000') {
    tiff = tiff.subarray(6);
  }

  const byteOrder = tiff.toString('latin1', 0, 2);
  if (byteOrder !== 'II' && byteOrder !== 'MM') {
    throw new Error('invalid exif header');
  }
  const littleEndian = byteOrder === 'II';
  const u16 = (offset: number) => (littleEndian ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset));
  const u32 = (offset: number) => (littleEndian ? tiff.readUInt32LE(offset) : tiff.readUInt32BE(offset));

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
export function decodeUtf16BE(data: Buffer): string {
  if (data.length % 2 !== 0) {
    throw new Error('truncated utf-16 data');
  }
  const swapped = Buffer.from(data);
  swapped.swap16();
  return new TextDecoder('utf-16le', { fatal: true, ignoreBOM: true }).decode(swapped);
}
