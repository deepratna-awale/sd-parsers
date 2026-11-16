import { MetadataEntries, readExifEntries, readExifImageEntries, readJpegSegments, readWebpChunks, readXmpEntries } from './extractors/entries';
import { detectFormat } from './extractors/image';
import { readPngText } from './extractors/png';
import { UnidentifiedImageError } from './exceptions';
import { latin1 } from './utils/bytes';
import { loadJson } from './utils/json';

const PNG_TEXT_CHUNKS = new Set(['tEXt', 'zTXt', 'iTXt', 'eXIf']);
const EXIF_HEADER = 'Exif\u0000\u0000';
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\u0000';
const MAX_JPEG_SEGMENT = 0xffff - 2;
const MAX_JPEG_EXIF = MAX_JPEG_SEGMENT - EXIF_HEADER.length;

/** Packed keys that tools never use inside their own JSON parameters */
const PACKING_MARKERS = new Set(['workflow', 'parameters', 'Comment', 'Description', 'Title', 'Source', 'Generation time', 'generation_data', 'invokeai_metadata', 'smproj', 'parameters-json']);

const encoder = new TextEncoder();

let crcTable: Uint32Array | undefined;

function crc32(data: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let crc = 0xffffffff;
  for (const byte of data) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function concat(parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function latin1Bytes(text: string): Uint8Array {
  return Uint8Array.from(text, char => char.charCodeAt(0));
}

function requireFormat(image: Uint8Array) {
  const format = detectFormat(image);
  if (!format) throw new UnidentifiedImageError('Not a PNG, JPEG or WEBP image');
  return format;
}

function normalizeEntries(metadata: string | MetadataEntries): MetadataEntries {
  const entries = typeof metadata === 'string' ? { parameters: metadata } : metadata;
  return Object.fromEntries(
    Object.entries(entries)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, typeof value === 'string' ? value : JSON.stringify(value)]),
  );
}

/* ---------- PNG ---------- */

interface PngChunk {
  type: string;
  data: Uint8Array;
  raw: Uint8Array;
}

function readPngChunks(image: Uint8Array): PngChunk[] {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const chunks: PngChunk[] = [];
  let offset = 8;
  while (offset + 12 <= image.length) {
    const length = view.getUint32(offset);
    const end = offset + 12 + length;
    if (end > image.length) break;
    const type = latin1(image, offset + 4, offset + 8);
    chunks.push({ type, data: image.subarray(offset + 8, offset + 8 + length), raw: image.subarray(offset, end) });
    offset = end;
    if (type === 'IEND') break;
  }
  return chunks;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(latin1Bytes(type), 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(chunk.subarray(4, 8 + data.length)));
  return chunk;
}

function pngTextChunk(keyword: string, text: string): Uint8Array {
  const key = latin1Bytes(keyword.replace(/[^\x20-\x7e\xa1-\xff]/g, '').slice(0, 79) || 'Comment');
  if (/^[\x00-\xff]*$/.test(text) && !text.includes('\u0000')) {
    return pngChunk('tEXt', concat([key, new Uint8Array([0]), latin1Bytes(text)]));
  }
  // iTXt: keyword, NUL, compression flag, method, empty language tag and translated keyword, UTF-8 text
  return pngChunk('iTXt', concat([key, new Uint8Array([0, 0, 0, 0, 0]), encoder.encode(text)]));
}

function rebuildPng(image: Uint8Array, entries: MetadataEntries): Uint8Array {
  const chunks = readPngChunks(image);
  const parts: Uint8Array[] = [image.subarray(0, 8)];
  for (const chunk of chunks) {
    if (PNG_TEXT_CHUNKS.has(chunk.type)) continue;
    parts.push(chunk.raw);
    if (chunk.type === 'IHDR') {
      for (const [key, value] of Object.entries(entries)) parts.push(pngTextChunk(key, value));
    }
  }
  return concat(parts);
}

/* ---------- EXIF ---------- */

/** Text tags written to IFD0 (ASCII) and the Exif IFD (UNDEFINED) */
const IFD0_TAGS: Record<string, number> = { ImageDescription: 0x10e, Make: 0x10f, Model: 0x110, Software: 0x131, Artist: 0x13b, Copyright: 0x8298 };
const EXIF_IFD_TAGS: Record<string, number> = { MakerNote: 0x927c, UserComment: 0x9286 };
const XMP_KEYS = ['XML:com.adobe.xmp', 'XMP'];

interface TiffTag {
  tag: number;
  type: number;
  value: Uint8Array;
}

function encodeUserComment(text: string): Uint8Array {
  const utf16 = new Uint8Array(8 + text.length * 2);
  utf16.set(latin1Bytes('UNICODE\u0000'));
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    utf16[8 + i * 2] = code >> 8;
    utf16[9 + i * 2] = code & 0xff;
  }
  return utf16;
}

/**
 * Build a big-endian TIFF block from IFD0 tags and Exif IFD tags
 */
function buildTiff(ifd0: TiffTag[], exifIfd: TiffTag[]): Uint8Array {
  const pointer: TiffTag = { tag: 0x8769, type: 4, value: new Uint8Array(4) };
  const first = [...ifd0, ...(exifIfd.length > 0 ? [pointer] : [])].sort((a, b) => a.tag - b.tag);
  const second = [...exifIfd].sort((a, b) => a.tag - b.tag);
  const ifdSize = (tags: TiffTag[]) => 2 + tags.length * 12 + 4;
  const dataSize = (tags: TiffTag[]) => tags.reduce((total, t) => total + (t.value.length > 4 ? t.value.length + (t.value.length % 2) : 0), 0);

  const firstOffset = 8;
  const secondOffset = firstOffset + ifdSize(first) + dataSize(first);
  const tiff = new Uint8Array(secondOffset + (second.length > 0 ? ifdSize(second) + dataSize(second) : 0));
  const view = new DataView(tiff.buffer);
  tiff.set(latin1Bytes('MM'));
  view.setUint16(2, 42);
  view.setUint32(4, firstOffset);
  new DataView(pointer.value.buffer).setUint32(0, secondOffset);

  const writeIfd = (tags: TiffTag[], offset: number) => {
    view.setUint16(offset, tags.length);
    let data = offset + ifdSize(tags);
    tags.forEach((t, i) => {
      const entry = offset + 2 + i * 12;
      view.setUint16(entry, t.tag);
      view.setUint16(entry + 2, t.type);
      view.setUint32(entry + 4, t.value.length);
      if (t.value.length <= 4) {
        tiff.set(t.value, entry + 8);
      } else {
        view.setUint32(entry + 8, data);
        tiff.set(t.value, data);
        data += t.value.length + (t.value.length % 2);
      }
    });
    view.setUint32(offset + 2 + tags.length * 12, 0);
  };
  writeIfd(first, firstOffset);
  if (second.length > 0) writeIfd(second, secondOffset);
  return tiff;
}

interface ExifMetadata {
  exif?: Uint8Array;
  xmp?: string;
}

/**
 * Lay out entries the way JPEG and WEBP files hold them: EXIF text tags under their own
 * names, an XMP packet, and the generation data in the UserComment. Entries named after PNG
 * chunks (`parameters`, or `prompt` and `workflow`, ...) go into the UserComment, as plain
 * text for a lone `parameters` entry and as a JSON object otherwise.
 */
function layoutExif(entries: MetadataEntries, maxExif = Infinity): ExifMetadata {
  const rest: MetadataEntries = { ...entries };
  const take = (key: string) => {
    const value = rest[key];
    delete rest[key];
    return value;
  };

  const xmp = XMP_KEYS.map(take).find(value => value !== undefined);
  const tags: MetadataEntries = {};
  for (const key of [...Object.keys(IFD0_TAGS), ...Object.keys(EXIF_IFD_TAGS)]) {
    const value = take(key);
    if (value !== undefined) tags[key] = value;
  }
  const parameters = take('parameters');
  if (tags.UserComment === undefined) {
    if (parameters !== undefined && Object.keys(rest).length === 0) tags.UserComment = parameters;
    else if (parameters !== undefined || Object.keys(rest).length > 0) {
      tags.UserComment = JSON.stringify(parameters === undefined ? rest : { parameters, ...rest });
    }
  }

  const build = (utf8Comment: boolean) => {
    const ifd0: TiffTag[] = [];
    const exifIfd: TiffTag[] = [];
    for (const [key, value] of Object.entries(tags)) {
      if (key === 'UserComment') {
        // UTF-8 is about half the size of UTF-16 for mostly ASCII text such as JSON
        const comment = utf8Comment ? concat([new Uint8Array(8), encoder.encode(value)]) : encodeUserComment(value);
        exifIfd.push({ tag: EXIF_IFD_TAGS.UserComment, type: 7, value: comment });
      } else if (key in EXIF_IFD_TAGS) {
        exifIfd.push({ tag: EXIF_IFD_TAGS[key], type: 7, value: encoder.encode(value) });
      } else {
        ifd0.push({ tag: IFD0_TAGS[key], type: 2, value: concat([encoder.encode(value), new Uint8Array(1)]) });
      }
    }
    return ifd0.length + exifIfd.length > 0 ? buildTiff(ifd0, exifIfd) : undefined;
  };

  let exif = build(false);
  if (exif && exif.length > maxExif) exif = build(true);
  return { exif, xmp };
}

function xmpPacket(xmp: string): Uint8Array {
  return encoder.encode(xmp);
}

/* ---------- JPEG ---------- */

interface JpegSegment {
  marker: number;
  raw: Uint8Array;
  data: Uint8Array;
}

/** Split a JPEG file into the segments before the image data and the rest */
function readJpegHeader(image: Uint8Array): { segments: JpegSegment[]; rest: Uint8Array } {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const segments: JpegSegment[] = [];
  let offset = 2;
  while (offset + 4 <= image.length && image[offset] === 0xff) {
    const marker = image[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset + 2);
    const end = Math.min(offset + 2 + length, image.length);
    segments.push({ marker, raw: image.subarray(offset, end), data: image.subarray(offset + 4, end) });
    offset = end;
  }
  return { segments, rest: image.subarray(offset) };
}

function isMetadataSegment(segment: JpegSegment): boolean {
  if (segment.marker === 0xfe || segment.marker === 0xed) return true;
  if (segment.marker !== 0xe1) return false;
  const head = latin1(segment.data, 0, Math.min(XMP_HEADER.length, segment.data.length));
  return head.startsWith(EXIF_HEADER) || head === XMP_HEADER || head.startsWith('http://ns.adobe.com/xmp/extension/');
}

function jpegSegment(marker: number, data: Uint8Array): Uint8Array {
  if (data.length > MAX_JPEG_SEGMENT) {
    throw new RangeError(`The metadata is ${data.length} bytes, more than the ${MAX_JPEG_SEGMENT} that fit in a JPEG segment`);
  }
  const segment = new Uint8Array(4 + data.length);
  segment[0] = 0xff;
  segment[1] = marker;
  new DataView(segment.buffer).setUint16(2, data.length + 2);
  segment.set(data, 4);
  return segment;
}

function rebuildJpeg(image: Uint8Array, { exif, xmp }: ExifMetadata = {}): Uint8Array {
  const { segments, rest } = readJpegHeader(image);
  const kept = segments.filter(segment => !isMetadataSegment(segment));
  // EXIF goes right after SOI, or after a JFIF APP0 segment
  const jfif = kept.length > 0 && kept[0].marker === 0xe0 ? 1 : 0;
  const parts = [image.subarray(0, 2), ...kept.slice(0, jfif).map(s => s.raw)];
  if (exif) parts.push(jpegSegment(0xe1, concat([latin1Bytes(EXIF_HEADER), exif])));
  if (xmp) parts.push(jpegSegment(0xe1, concat([latin1Bytes(XMP_HEADER), xmpPacket(xmp)])));
  parts.push(...kept.slice(jfif).map(s => s.raw), rest);
  return concat(parts);
}

/* ---------- WEBP ---------- */

interface RiffChunk {
  type: string;
  data: Uint8Array;
}

function readRiffChunks(image: Uint8Array): RiffChunk[] {
  const view = new DataView(image.buffer, image.byteOffset, image.byteLength);
  const chunks: RiffChunk[] = [];
  let offset = 12;
  while (offset + 8 <= image.length) {
    const size = view.getUint32(offset + 4, true);
    const type = latin1(image, offset, offset + 4);
    chunks.push({ type, data: image.subarray(offset + 8, Math.min(offset + 8 + size, image.length)) });
    offset += 8 + size + (size % 2);
  }
  return chunks;
}

function riffChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(8 + data.length + (data.length % 2));
  chunk.set(latin1Bytes(type));
  new DataView(chunk.buffer).setUint32(4, data.length, true);
  chunk.set(data, 8);
  return chunk;
}

function webpCanvas(chunks: RiffChunk[]): { width: number; height: number; alpha: boolean } | null {
  for (const { type, data } of chunks) {
    if (type === 'VP8 ' && data.length >= 10) {
      const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
      return { width: view.getUint16(6, true) & 0x3fff, height: view.getUint16(8, true) & 0x3fff, alpha: false };
    }
    if (type === 'VP8L' && data.length >= 5) {
      const bits = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(1, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1, alpha: ((bits >> 28) & 1) === 1 };
    }
  }
  return null;
}

function rebuildWebp(image: Uint8Array, { exif, xmp }: ExifMetadata = {}): Uint8Array {
  const chunks = readRiffChunks(image).filter(chunk => chunk.type !== 'EXIF' && chunk.type !== 'XMP ');
  let vp8x = chunks.find(chunk => chunk.type === 'VP8X')?.data;

  if (vp8x) {
    vp8x = Uint8Array.from(vp8x);
    vp8x[0] = (vp8x[0] & ~0x0c) | (exif ? 0x08 : 0) | (xmp ? 0x04 : 0);
  } else if (exif || xmp) {
    // simple WEBP files have no room for metadata until they get an extended header
    const canvas = webpCanvas(chunks);
    if (!canvas) throw new UnidentifiedImageError('Unsupported WEBP image data');
    vp8x = new Uint8Array(10);
    vp8x[0] = (exif ? 0x08 : 0) | (xmp ? 0x04 : 0) | (canvas.alpha ? 0x10 : 0);
    vp8x.set([(canvas.width - 1) & 0xff, ((canvas.width - 1) >> 8) & 0xff, ((canvas.width - 1) >> 16) & 0xff], 4);
    vp8x.set([(canvas.height - 1) & 0xff, ((canvas.height - 1) >> 8) & 0xff, ((canvas.height - 1) >> 16) & 0xff], 7);
  }

  const parts: Uint8Array[] = [];
  if (vp8x) parts.push(riffChunk('VP8X', vp8x));
  for (const chunk of chunks) {
    if (chunk.type !== 'VP8X') parts.push(riffChunk(chunk.type, chunk.data));
  }
  if (exif) parts.push(riffChunk('EXIF', exif));
  if (xmp) parts.push(riffChunk('XMP ', xmpPacket(xmp)));

  const body = concat(parts);
  const header = new Uint8Array(12);
  header.set(latin1Bytes('RIFF'));
  new DataView(header.buffer).setUint32(4, body.length + 4, true);
  header.set(latin1Bytes('WEBP'), 8);
  return concat([header, body]);
}

/* ---------- public API ---------- */

/**
 * Remove the text metadata of an image: PNG text and `eXIf` chunks, JPEG EXIF / XMP / IPTC
 * segments and comments, and WEBP `EXIF` / `XMP` chunks. The image data and color profiles
 * are left untouched. Stealth metadata hidden in the alpha channel is image data, and stays.
 */
export function stripMetadata(image: Uint8Array): Uint8Array {
  const format = requireFormat(image);
  if (format === 'PNG') return rebuildPng(image, {});
  if (format === 'JPEG') return rebuildJpeg(image);
  return rebuildWebp(image);
}

/**
 * Replace the metadata of an image.
 *
 * A string is written the way AUTOMATIC1111 writes its parameters: as the PNG `parameters`
 * chunk, or as the EXIF UserComment of JPEG and WEBP files. Pass `toInfotext(promptInfo)` to
 * make any image readable by tools that only know the AUTOMATIC1111 format.
 *
 * Entries become PNG text chunks. In JPEG and WEBP files, EXIF tag names (`Software`,
 * `UserComment`, `MakerNote`, ...) become those tags, `XML:com.adobe.xmp` an XMP packet, and
 * the other entries (`{ prompt, workflow }`, `{ Title, Description, Comment, ... }`) a JSON
 * UserComment holding them, the way ComfyUI and NovelAI save their JPEG / WEBP images.
 *
 * Throws a `RangeError` when the metadata does not fit in a JPEG segment (64 KB).
 */
export function writeMetadata(image: Uint8Array, metadata: string | MetadataEntries): Uint8Array {
  const format = requireFormat(image);
  const entries = normalizeEntries(metadata);
  if (format === 'PNG') return rebuildPng(image, entries);
  if (format === 'JPEG') return rebuildJpeg(image, layoutExif(entries, MAX_JPEG_EXIF));
  return rebuildWebp(image, layoutExif(entries));
}

function parseJsonObject(text: string | undefined): Record<string, unknown> | null {
  if (!text || !text.trimStart().startsWith('{')) return null;
  try {
    const value = loadJson(text);
    return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * A JSON object of PNG chunks, as ComfyUI and NovelAI pack them into JPEG / WEBP files. Other
 * tools also write a `prompt` key, but as text rather than as a ComfyUI node graph.
 */
function isPackedJson(text: string | undefined): boolean {
  const value = parseJsonObject(text);
  if (!value) return false;
  return Object.keys(value).some(key => PACKING_MARKERS.has(key)) || typeof value.prompt === 'object';
}

/** Entries that `readExifImageEntries()` copied out of a JSON UserComment that is kept whole */
function unpackedFrom(userComment: string | undefined): Record<string, unknown> {
  return isPackedJson(userComment) ? {} : parseJsonObject(userComment) ?? {};
}

function isA1111Text(text: string): boolean {
  return !text.trimStart().startsWith('{') && /(?:^|\n)Steps: \d/.test(text);
}

/**
 * Read the metadata entries of an image in the shape that `writeMetadata()` takes: the PNG
 * text chunks, or the EXIF text tags, XMP packet and comments of JPEG and WEBP files. A JSON
 * UserComment holding PNG chunks is unpacked into those chunks, and AUTOMATIC1111 text is
 * named `parameters`, as in PNG files.
 */
export function readMetadataEntries(image: Uint8Array): MetadataEntries {
  const format = requireFormat(image);
  if (format === 'PNG') {
    const { text } = readPngText(image);
    const entries = Object.fromEntries(Object.entries(text).filter(([, value]) => typeof value === 'string')) as MetadataEntries;
    if (entries.parameters === undefined && entries.UserComment !== undefined && isA1111Text(entries.UserComment)) {
      entries.parameters = entries.UserComment;
      delete entries.UserComment;
    }
    return entries;
  }

  const raw = readExifImageEntries(image, format);
  const { exif, xmp } = format === 'JPEG' ? readJpegSegments(image) : readWebpChunks(image);
  const tagged = exif ? readExifEntries(exif) : {};
  const xmpValues = xmp ? readXmpEntries(xmp) : {};
  const entries: MetadataEntries = {};

  for (const [key, value] of Object.entries(raw)) {
    if (key === 'XMP') {
      entries['XML:com.adobe.xmp'] = value;
    } else if (key === 'UserComment') {
      if (isPackedJson(value)) continue;
      // JSON parameters (Fooocus, SwarmUI, ...) and A1111 text live in the PNG `parameters` chunk
      entries[isA1111Text(value) || parseJsonObject(value) ? 'parameters' : 'UserComment'] = value;
    } else if (key in unpackedFrom(raw.UserComment) && !(key in tagged)) {
      continue;
    } else if (key === 'Comment' && isPackedJson(value)) {
      continue;
    } else if (!(key in tagged) && xmpValues[key] === value && key !== 'Description') {
      // read from the XMP packet, which is kept as a whole
      continue;
    } else {
      entries[key] = value;
    }
  }
  return entries;
}

/**
 * Copy the metadata of one image into another, converting it to the container format of the
 * target: PNG text chunks become EXIF tags and a UserComment in JPEG / WEBP files and the other
 * way around.
 */
export function copyMetadata(source: Uint8Array, target: Uint8Array): Uint8Array {
  return writeMetadata(target, readMetadataEntries(source));
}
