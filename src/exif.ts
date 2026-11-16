import { detectFormat } from './extractors/image';
import { findExif } from './extractors/exif';
import { decodeUserComment } from './extractors/entries';
import { latin1 } from './utils/bytes';

/**
 * A decoded EXIF value: text for ASCII tags and text-like UNDEFINED tags, a number for a
 * single integer or rational, a number array for several, and the raw bytes otherwise.
 * Rationals with a zero denominator are `NaN`.
 */
export type ExifValue = string | number | number[] | Uint8Array;

export type ExifTags = Record<string, ExifValue>;

/**
 * All tags of an EXIF block, by IFD, under their EXIF names (`Make`, `FNumber`,
 * `GPSLatitude`, ...). Tags without a known name are keyed by their id (`0xc4a5`).
 */
export interface ExifData {
  /** Byte order of the TIFF structure: `II` little endian, `MM` big endian */
  byteOrder: 'II' | 'MM';
  /** IFD0: the main image */
  image: ExifTags;
  /** Exif IFD: capture settings */
  photo: ExifTags;
  gps: ExifTags;
  interoperability: ExifTags;
  /** IFD1: the embedded thumbnail */
  thumbnail: ExifTags;
}

/** The commonly wanted EXIF values, decoded to plain numbers and strings */
export interface ExifSummary {
  make?: string;
  model?: string;
  lensMake?: string;
  lens?: string;
  software?: string;
  artist?: string;
  copyright?: string;
  description?: string;
  /** Capture time as ISO 8601 (`2024-05-01T13:45:10.120+02:00`), without an offset when none was recorded */
  dateTaken?: string;
  /** Exposure time in seconds */
  exposureTime?: number;
  /** Exposure time as photographers write it (`1/250`, `2.5`) */
  shutterSpeed?: string;
  fNumber?: number;
  iso?: number;
  /** Focal length in mm */
  focalLength?: number;
  focalLength35mm?: number;
  exposureBias?: number;
  flash?: boolean;
  /** TIFF orientation, 1 (upright) to 8 */
  orientation?: number;
  width?: number;
  height?: number;
  gps?: { latitude: number; longitude: number; altitude?: number };
  /** Rating in stars (0 to 5), as Windows and Lightroom write it */
  rating?: number;
  title?: string;
  comment?: string;
  keywords?: string[];
}

const TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8, 13: 4 };

const IMAGE_TAGS: Record<number, string> = {
  0x00fe: 'NewSubfileType',
  0x0100: 'ImageWidth',
  0x0101: 'ImageLength',
  0x0102: 'BitsPerSample',
  0x0103: 'Compression',
  0x0106: 'PhotometricInterpretation',
  0x010d: 'DocumentName',
  0x010e: 'ImageDescription',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0111: 'StripOffsets',
  0x0112: 'Orientation',
  0x0115: 'SamplesPerPixel',
  0x0116: 'RowsPerStrip',
  0x0117: 'StripByteCounts',
  0x011a: 'XResolution',
  0x011b: 'YResolution',
  0x011c: 'PlanarConfiguration',
  0x0128: 'ResolutionUnit',
  0x012d: 'TransferFunction',
  0x0131: 'Software',
  0x0132: 'DateTime',
  0x013b: 'Artist',
  0x013c: 'HostComputer',
  0x013e: 'WhitePoint',
  0x013f: 'PrimaryChromaticities',
  0x0201: 'JPEGInterchangeFormat',
  0x0202: 'JPEGInterchangeFormatLength',
  0x0211: 'YCbCrCoefficients',
  0x0212: 'YCbCrSubSampling',
  0x0213: 'YCbCrPositioning',
  0x0214: 'ReferenceBlackWhite',
  0x02bc: 'XMLPacket',
  0x4746: 'Rating',
  0x4749: 'RatingPercent',
  0x8298: 'Copyright',
  0x8769: 'ExifIFDPointer',
  0x8825: 'GPSInfoIFDPointer',
  0x9c9b: 'XPTitle',
  0x9c9c: 'XPComment',
  0x9c9d: 'XPAuthor',
  0x9c9e: 'XPKeywords',
  0x9c9f: 'XPSubject',
  0xc4a5: 'PrintImageMatching',
};

const PHOTO_TAGS: Record<number, string> = {
  0x829a: 'ExposureTime',
  0x829d: 'FNumber',
  0x8822: 'ExposureProgram',
  0x8824: 'SpectralSensitivity',
  0x8827: 'ISOSpeedRatings',
  0x8830: 'SensitivityType',
  0x8832: 'RecommendedExposureIndex',
  0x9000: 'ExifVersion',
  0x9003: 'DateTimeOriginal',
  0x9004: 'DateTimeDigitized',
  0x9010: 'OffsetTime',
  0x9011: 'OffsetTimeOriginal',
  0x9012: 'OffsetTimeDigitized',
  0x9101: 'ComponentsConfiguration',
  0x9102: 'CompressedBitsPerPixel',
  0x9201: 'ShutterSpeedValue',
  0x9202: 'ApertureValue',
  0x9203: 'BrightnessValue',
  0x9204: 'ExposureBiasValue',
  0x9205: 'MaxApertureValue',
  0x9206: 'SubjectDistance',
  0x9207: 'MeteringMode',
  0x9208: 'LightSource',
  0x9209: 'Flash',
  0x920a: 'FocalLength',
  0x9214: 'SubjectArea',
  0x927c: 'MakerNote',
  0x9286: 'UserComment',
  0x9290: 'SubSecTime',
  0x9291: 'SubSecTimeOriginal',
  0x9292: 'SubSecTimeDigitized',
  0xa000: 'FlashpixVersion',
  0xa001: 'ColorSpace',
  0xa002: 'PixelXDimension',
  0xa003: 'PixelYDimension',
  0xa004: 'RelatedSoundFile',
  0xa005: 'InteroperabilityIFDPointer',
  0xa20e: 'FocalPlaneXResolution',
  0xa20f: 'FocalPlaneYResolution',
  0xa210: 'FocalPlaneResolutionUnit',
  0xa215: 'ExposureIndex',
  0xa217: 'SensingMethod',
  0xa300: 'FileSource',
  0xa301: 'SceneType',
  0xa302: 'CFAPattern',
  0xa401: 'CustomRendered',
  0xa402: 'ExposureMode',
  0xa403: 'WhiteBalance',
  0xa404: 'DigitalZoomRatio',
  0xa405: 'FocalLengthIn35mmFilm',
  0xa406: 'SceneCaptureType',
  0xa407: 'GainControl',
  0xa408: 'Contrast',
  0xa409: 'Saturation',
  0xa40a: 'Sharpness',
  0xa40c: 'SubjectDistanceRange',
  0xa420: 'ImageUniqueID',
  0xa430: 'CameraOwnerName',
  0xa431: 'BodySerialNumber',
  0xa432: 'LensSpecification',
  0xa433: 'LensMake',
  0xa434: 'LensModel',
  0xa435: 'LensSerialNumber',
  0xa460: 'CompositeImage',
};

const GPS_TAGS: Record<number, string> = {
  0x00: 'GPSVersionID',
  0x01: 'GPSLatitudeRef',
  0x02: 'GPSLatitude',
  0x03: 'GPSLongitudeRef',
  0x04: 'GPSLongitude',
  0x05: 'GPSAltitudeRef',
  0x06: 'GPSAltitude',
  0x07: 'GPSTimeStamp',
  0x08: 'GPSSatellites',
  0x09: 'GPSStatus',
  0x0a: 'GPSMeasureMode',
  0x0b: 'GPSDOP',
  0x0c: 'GPSSpeedRef',
  0x0d: 'GPSSpeed',
  0x0e: 'GPSTrackRef',
  0x0f: 'GPSTrack',
  0x10: 'GPSImgDirectionRef',
  0x11: 'GPSImgDirection',
  0x12: 'GPSMapDatum',
  0x13: 'GPSDestLatitudeRef',
  0x14: 'GPSDestLatitude',
  0x15: 'GPSDestLongitudeRef',
  0x16: 'GPSDestLongitude',
  0x17: 'GPSDestBearingRef',
  0x18: 'GPSDestBearing',
  0x19: 'GPSDestDistanceRef',
  0x1a: 'GPSDestDistance',
  0x1b: 'GPSProcessingMethod',
  0x1c: 'GPSAreaInformation',
  0x1d: 'GPSDateStamp',
  0x1e: 'GPSDifferential',
  0x1f: 'GPSHPositioningError',
};

const INTEROPERABILITY_TAGS: Record<number, string> = {
  0x0001: 'InteroperabilityIndex',
  0x0002: 'InteroperabilityVersion',
};

const POINTERS = { exif: 0x8769, gps: 0x8825, interoperability: 0xa005 };

/** UNDEFINED tags that hold a character code followed by text */
const CODED_TEXT = new Set(['UserComment', 'GPSProcessingMethod', 'GPSAreaInformation']);
/** UNDEFINED tags that hold a 4 character version (`0232`) */
const VERSIONS = new Set(['ExifVersion', 'FlashpixVersion', 'InteroperabilityVersion']);
/** Windows tags: UTF-16LE text stored as BYTE */
const XP_TAGS = new Set(['XPTitle', 'XPComment', 'XPAuthor', 'XPKeywords', 'XPSubject']);

const EXIF_HEADER = 'Exif\u0000\u0000';
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function decodeText(data: Uint8Array): string {
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    text = latin1(data);
  }
  return text.replace(/\u0000+$/, '');
}

function isText(data: Uint8Array): boolean {
  if (data.length === 0) return false;
  let end = data.length;
  while (end > 0 && data[end - 1] === 0) end--;
  if (end === 0) return false;
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(data.subarray(0, end));
    return !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text);
  } catch {
    return false;
  }
}

function findPngExif(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = latin1(bytes, offset + 4, offset + 8);
    if (type === 'eXIf') return bytes.subarray(offset + 8, Math.min(offset + 8 + length, bytes.length));
    if (type === 'IEND') break;
    offset += 12 + length;
  }
  return null;
}

function isTiff(data: Uint8Array): boolean {
  const order = latin1(data, 0, Math.min(2, data.length));
  return order === 'II' || order === 'MM';
}

/**
 * Find the EXIF block of an image: the APP1 segment of a JPEG, the `EXIF` chunk of a WEBP
 * or the `eXIf` chunk of a PNG
 */
export function extractExif(bytes: Uint8Array): Uint8Array | null {
  switch (detectFormat(bytes)) {
    case 'PNG':
      return findPngExif(bytes);
    case 'JPEG':
      return findExif(bytes, 'JPEG');
    case 'WEBP':
      return findExif(bytes, 'WEBP');
    default:
      return null;
  }
}

/**
 * Decode every tag of an EXIF block (TIFF structure, with or without the `Exif\0\0` header)
 */
export function parseExif(block: Uint8Array): ExifData | null {
  const tiff = latin1(block, 0, Math.min(6, block.length)) === EXIF_HEADER ? block.subarray(6) : block;
  if (tiff.length < 8 || !isTiff(tiff)) return null;
  const littleEndian = tiff[0] === 0x49;
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, littleEndian);
  const u32 = (offset: number) => view.getUint32(offset, littleEndian);

  const readValue = (name: string, type: number, count: number, data: Uint8Array): ExifValue => {
    const values = (read: (offset: number) => number, size: number) => {
      const list: number[] = [];
      for (let i = 0; i < count; i++) list.push(read(i * size));
      return list.length === 1 ? list[0] : list;
    };
    const local = new DataView(data.buffer, data.byteOffset, data.byteLength);
    switch (type) {
      case 2:
        return decodeText(data);
      case 1:
        if (XP_TAGS.has(name)) return new TextDecoder('utf-16le').decode(data.subarray(0, data.length - (data.length % 2))).replace(/\u0000+$/, '');
        return values(offset => local.getUint8(offset), 1);
      case 6:
        return values(offset => local.getInt8(offset), 1);
      case 3:
        return values(offset => local.getUint16(offset, littleEndian), 2);
      case 8:
        return values(offset => local.getInt16(offset, littleEndian), 2);
      case 4:
      case 13:
        return values(offset => local.getUint32(offset, littleEndian), 4);
      case 9:
        return values(offset => local.getInt32(offset, littleEndian), 4);
      case 5:
        return values(offset => {
          const denominator = local.getUint32(offset + 4, littleEndian);
          return denominator === 0 ? NaN : local.getUint32(offset, littleEndian) / denominator;
        }, 8);
      case 10:
        return values(offset => {
          const denominator = local.getInt32(offset + 4, littleEndian);
          return denominator === 0 ? NaN : local.getInt32(offset, littleEndian) / denominator;
        }, 8);
      case 11:
        return values(offset => local.getFloat32(offset, littleEndian), 4);
      case 12:
        return values(offset => local.getFloat64(offset, littleEndian), 8);
      default:
        if (CODED_TEXT.has(name)) return decodeUserComment(data, littleEndian);
        if (VERSIONS.has(name)) return latin1(data);
        return isText(data) ? decodeText(data) : data;
    }
  };

  const visited = new Set<number>();
  const pointers: Record<string, number> = {};
  const readIfd = (offset: number, names: Record<number, string>, tags: ExifTags): number => {
    if (visited.has(offset) || offset < 8 || offset + 2 > tiff.length) return 0;
    visited.add(offset);
    const count = u16(offset);
    for (let i = 0; i < count; i++) {
      const entry = offset + 2 + i * 12;
      if (entry + 12 > tiff.length) return 0;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const items = u32(entry + 4);
      const size = (TYPE_SIZES[type] ?? 1) * items;
      if (size > tiff.length) continue;
      const valueOffset = size <= 4 ? entry + 8 : u32(entry + 8);
      if (valueOffset + size > tiff.length) continue;

      if (names === IMAGE_TAGS && (tag === POINTERS.exif || tag === POINTERS.gps)) {
        pointers[tag === POINTERS.exif ? 'exif' : 'gps'] = u32(entry + 8);
        continue;
      }
      if (names === PHOTO_TAGS && tag === POINTERS.interoperability) {
        pointers.interoperability = u32(entry + 8);
        continue;
      }
      const name = names[tag] ?? `0x${tag.toString(16).padStart(4, '0')}`;
      if (name in tags) continue;
      tags[name] = readValue(name, type, items, tiff.subarray(valueOffset, valueOffset + size));
    }
    const next = offset + 2 + count * 12;
    return next + 4 <= tiff.length ? u32(next) : 0;
  };

  const data: ExifData = { byteOrder: littleEndian ? 'II' : 'MM', image: {}, photo: {}, gps: {}, interoperability: {}, thumbnail: {} };
  const ifd1 = readIfd(u32(4), IMAGE_TAGS, data.image);
  if (pointers.exif) readIfd(pointers.exif, PHOTO_TAGS, data.photo);
  if (pointers.gps) readIfd(pointers.gps, GPS_TAGS, data.gps);
  if (pointers.interoperability) readIfd(pointers.interoperability, INTEROPERABILITY_TAGS, data.interoperability);
  if (ifd1) readIfd(ifd1, IMAGE_TAGS, data.thumbnail);
  return data;
}

/**
 * Read and decode the EXIF metadata of a PNG, JPEG or WEBP file (or of an EXIF block).
 * Returns `null` when there is none.
 */
export function readExif(bytes: Uint8Array): ExifData | null {
  const block = detectFormat(bytes) ? extractExif(bytes) : bytes;
  return block ? parseExif(block) : null;
}

function str(value: ExifValue | undefined): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function num(value: ExifValue | undefined): number | undefined {
  const first = Array.isArray(value) ? value[0] : value;
  return typeof first === 'number' && Number.isFinite(first) ? first : undefined;
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function shutterSpeed(seconds: number): string {
  if (seconds >= 1 || seconds <= 0) return String(round(seconds, 1));
  const denominator = Math.round(1 / seconds);
  return Math.abs(1 / denominator - seconds) / seconds < 0.05 ? `1/${denominator}` : String(round(seconds, 4));
}

function isoDate(date: string | undefined, subSeconds: string | undefined, offset: string | undefined): string | undefined {
  const match = date && /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(date);
  if (!match || match[1] === '0000') return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const fraction = subSeconds && /^\d+$/.test(subSeconds) ? `.${subSeconds}` : '';
  const zone = offset && /^[+-]\d{2}:\d{2}$/.test(offset) ? offset : '';
  return `${year}-${month}-${day}T${hour}:${minute}:${second}${fraction}${zone}`;
}

function coordinate(value: ExifValue | undefined, ref: ExifValue | undefined, negative: string): number | undefined {
  if (!Array.isArray(value) || value.length < 1 || value.some(part => !Number.isFinite(part))) return undefined;
  const [degrees, minutes = 0, seconds = 0] = value;
  const decimal = degrees + minutes / 60 + seconds / 3600;
  return round(str(ref)?.toUpperCase() === negative ? -decimal : decimal, 7);
}

/**
 * Pick the commonly wanted values out of decoded EXIF data: camera, lens, capture settings,
 * capture time, GPS position and the Windows / Lightroom title, comment, keywords and rating
 */
export function summarizeExif(exif: ExifData): ExifSummary {
  const { image, photo, gps } = exif;
  const summary: ExifSummary = {
    make: str(image.Make),
    model: str(image.Model),
    lensMake: str(photo.LensMake),
    lens: str(photo.LensModel),
    software: str(image.Software),
    artist: str(image.Artist) ?? str(image.XPAuthor),
    copyright: str(image.Copyright),
    description: str(image.ImageDescription),
    dateTaken:
      isoDate(str(photo.DateTimeOriginal), str(photo.SubSecTimeOriginal), str(photo.OffsetTimeOriginal)) ??
      isoDate(str(photo.DateTimeDigitized), str(photo.SubSecTimeDigitized), str(photo.OffsetTimeDigitized)) ??
      isoDate(str(image.DateTime), str(photo.SubSecTime), str(photo.OffsetTime)),
    exposureTime: num(photo.ExposureTime),
    fNumber: num(photo.FNumber),
    iso: num(photo.ISOSpeedRatings),
    focalLength: num(photo.FocalLength),
    focalLength35mm: num(photo.FocalLengthIn35mmFilm),
    exposureBias: num(photo.ExposureBiasValue),
    orientation: num(image.Orientation),
    width: num(photo.PixelXDimension) ?? num(image.ImageWidth),
    height: num(photo.PixelYDimension) ?? num(image.ImageLength),
    rating: num(image.Rating),
    title: str(image.XPTitle),
    comment: str(image.XPComment) ?? (typeof photo.UserComment === 'string' ? str(photo.UserComment) : undefined),
  };

  if (summary.exposureTime !== undefined) summary.shutterSpeed = shutterSpeed(summary.exposureTime);
  if (summary.fNumber !== undefined) summary.fNumber = round(summary.fNumber, 1);
  if (summary.focalLength !== undefined) summary.focalLength = round(summary.focalLength, 1);
  if (summary.exposureBias !== undefined) summary.exposureBias = round(summary.exposureBias, 2);
  const flash = num(photo.Flash);
  if (flash !== undefined) summary.flash = (flash & 1) === 1;
  const keywords = str(image.XPKeywords);
  if (keywords) summary.keywords = keywords.split(';').map(keyword => keyword.trim()).filter(Boolean);

  const latitude = coordinate(gps.GPSLatitude, gps.GPSLatitudeRef, 'S');
  const longitude = coordinate(gps.GPSLongitude, gps.GPSLongitudeRef, 'W');
  if (latitude !== undefined && longitude !== undefined) {
    summary.gps = { latitude, longitude };
    const altitude = num(gps.GPSAltitude);
    if (altitude !== undefined) summary.gps.altitude = round(num(gps.GPSAltitudeRef) === 1 ? -altitude : altitude, 2);
  }

  for (const key of Object.keys(summary) as (keyof ExifSummary)[]) {
    if (summary[key] === undefined) delete summary[key];
  }
  return summary;
}
