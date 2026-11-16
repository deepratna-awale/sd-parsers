import { latin1 } from '../utils/bytes';
import { loadJson } from '../utils/json';
import { isDict } from '../parsers/parser';

/**
 * Text metadata found in an image, keyed by the name of the PNG chunk, EXIF tag or
 * JPEG segment it was read from
 */
export type MetadataEntries = Record<string, string>;

const TIFF_TYPE_SIZES: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

const EXIF_HEADER = 'Exif\u0000\u0000';
const XMP_HEADER = 'http://ns.adobe.com/xap/1.0/\u0000';

const EXIF_IFD_POINTER = 0x8769;

/** Text tags that tools write generation data to, by tag id */
const TEXT_TAGS: Record<number, string> = {
  0x010e: 'ImageDescription',
  0x010f: 'Make',
  0x0110: 'Model',
  0x0131: 'Software',
  0x013b: 'Artist',
  0x8298: 'Copyright',
  0x927c: 'MakerNote',
  0x9286: 'UserComment',
};

/**
 * PNG chunk names that tools pack into one JSON object when they write JPEG or WEBP files
 * (NovelAI, ComfyUI save nodes). Their values are added as entries of their own.
 */
const PACKED_KEYS = [
  'prompt',
  'workflow',
  'parameters',
  'Comment',
  'Description',
  'Software',
  'Source',
  'Title',
  'Generation time',
  'generation_data',
  'invokeai_metadata',
  'smproj',
  'parameters-json',
  'Copyright',
  'extra',
];

function decodeUtf8(data: Uint8Array): string | null {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(data);
  } catch {
    return null;
  }
}

function stripTrailingNulls(text: string): string {
  return text.replace(/\u0000+$/, '');
}

function countAscii(text: string): number {
  let count = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if ((code >= 0x20 && code < 0x7f) || code === 0x0a || code === 0x0d || code === 0x09) count++;
  }
  return count;
}

function decodeUtf16(data: Uint8Array, littleEndian: boolean): string {
  const even = data.length - (data.length % 2);
  return new TextDecoder(littleEndian ? 'utf-16le' : 'utf-16be').decode(data.subarray(0, even));
}

/**
 * Decode UTF-16 text whose byte order is not reliably known
 *
 * The EXIF standard says the byte order of the TIFF header applies, yet tools write
 * both orders regardless of it (A1111 always writes big endian). Generation data is
 * mostly ASCII, so the order that yields far more ASCII characters is the right one.
 */
export function decodeUtf16Guess(data: Uint8Array, littleEndianHint = false): string {
  const preferred = decodeUtf16(data, littleEndianHint);
  const other = decodeUtf16(data, !littleEndianHint);
  const preferredAscii = countAscii(preferred);
  const otherAscii = countAscii(other);
  const text = otherAscii > preferredAscii * 2 && otherAscii * 2 > other.length ? other : preferred;
  return stripTrailingNulls(text.replace(/^﻿/, ''));
}

/**
 * Decode an EXIF UserComment value: an 8 byte character code followed by the text
 */
export function decodeUserComment(value: Uint8Array, littleEndianHint = false): string {
  const code = latin1(value, 0, Math.min(8, value.length));
  const body = value.subarray(8);
  if (code === 'UNICODE\u0000') {
    return decodeUtf16Guess(body, littleEndianHint);
  }
  if (code === 'ASCII\u0000\u0000\u0000' || code === '\u0000'.repeat(8)) {
    return stripTrailingNulls(decodeUtf8(body) ?? latin1(body));
  }
  // no character code: some ComfyUI save nodes write plain UTF-8
  return stripTrailingNulls(decodeUtf8(value) ?? latin1(value));
}

function decodeAsciiTag(value: Uint8Array): string {
  return stripTrailingNulls(decodeUtf8(value) ?? latin1(value));
}

/**
 * Read the text tags of an EXIF block (TIFF structure, with or without the `Exif\0\0` header)
 *
 * Values labelled with the PNG chunk they stand in for, like `prompt:{...}` or
 * `Workflow: {...}` (ComfyUI save nodes), are stored under the lower-cased label.
 */
export function readExifEntries(exif: Uint8Array): MetadataEntries {
  let tiff = exif;
  if (latin1(tiff, 0, Math.min(6, tiff.length)) === EXIF_HEADER) {
    tiff = tiff.subarray(6);
  }
  const entries: MetadataEntries = {};
  if (tiff.length < 8) return entries;

  const byteOrder = latin1(tiff, 0, 2);
  if (byteOrder !== 'II' && byteOrder !== 'MM') return entries;
  const littleEndian = byteOrder === 'II';
  const view = new DataView(tiff.buffer, tiff.byteOffset, tiff.byteLength);
  const u16 = (offset: number) => view.getUint16(offset, littleEndian);
  const u32 = (offset: number) => view.getUint32(offset, littleEndian);

  const visited = new Set<number>();
  const readIfd = (ifdOffset: number) => {
    if (visited.has(ifdOffset) || ifdOffset + 2 > tiff.length) return;
    visited.add(ifdOffset);

    const count = u16(ifdOffset);
    for (let i = 0; i < count; i++) {
      const entry = ifdOffset + 2 + i * 12;
      if (entry + 12 > tiff.length) return;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const size = (TIFF_TYPE_SIZES[type] ?? 1) * u32(entry + 4);

      if (tag === EXIF_IFD_POINTER) {
        readIfd(u32(entry + 8));
        continue;
      }

      const name = TEXT_TAGS[tag];
      if (!name || size > tiff.length) continue;
      const valueOffset = size <= 4 ? entry + 8 : u32(entry + 8);
      if (valueOffset + size > tiff.length) continue;
      const value = tiff.subarray(valueOffset, valueOffset + size);

      let text: string;
      if (name === 'UserComment') {
        text = decodeUserComment(value, littleEndian);
      } else if (type === 2 || type === 7 || type === 1) {
        text = decodeAsciiTag(value);
      } else {
        continue;
      }
      if (!text) continue;

      const label = /^([A-Za-z]+):(?:\s|(?=[{[]))/.exec(text);
      if (label && name !== 'UserComment' && PACKED_KEYS.includes(label[1].toLowerCase())) {
        entries[label[1].toLowerCase()] ??= text.slice(label[0].length);
      } else {
        entries[name] ??= text;
      }
    }
  };

  readIfd(u32(4));
  return entries;
}

/**
 * Add the values of a JSON object holding PNG chunk names (`{"prompt": ..., "workflow": ...}`)
 * as entries of their own, without replacing existing ones
 */
export function unpackJsonEntries(entries: MetadataEntries, text: string | undefined): void {
  if (!text || !text.trimStart().startsWith('{')) return;
  let value: unknown;
  try {
    value = loadJson(text);
  } catch {
    return;
  }
  if (!isDict(value)) return;

  for (const key of PACKED_KEYS) {
    const packed = value[key];
    if (packed == null || key in entries) continue;
    entries[key] = typeof packed === 'string' ? packed : JSON.stringify(packed);
  }
}

/**
 * Find the APP1 EXIF block, XMP packet and COM segments of a JPEG file
 */
export function readJpegSegments(bytes: Uint8Array): { exif?: Uint8Array; xmp?: string; comments: string[] } {
  const result: { exif?: Uint8Array; xmp?: string; comments: string[] } = { comments: [] };
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) break;
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset++;
      continue;
    }
    if (marker === 0xda || marker === 0xd9) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    const length = view.getUint16(offset + 2);
    const segment = bytes.subarray(offset + 4, Math.min(offset + 2 + length, bytes.length));

    if (marker === 0xe1) {
      const head = latin1(segment, 0, Math.min(XMP_HEADER.length, segment.length));
      if (!result.exif && head.startsWith(EXIF_HEADER)) {
        result.exif = segment;
      } else if (result.xmp === undefined && head === XMP_HEADER) {
        result.xmp = decodeUtf8(segment.subarray(XMP_HEADER.length)) ?? undefined;
      }
    } else if (marker === 0xfe) {
      const text = stripTrailingNulls(decodeUtf8(segment) ?? latin1(segment));
      if (text) result.comments.push(text);
    }
    offset += 2 + length;
  }
  return result;
}

/**
 * Find the EXIF and XMP chunks of a WEBP file
 */
export function readWebpChunks(bytes: Uint8Array): { exif?: Uint8Array; xmp?: string } {
  const result: { exif?: Uint8Array; xmp?: string } = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 12;
  while (offset + 8 <= bytes.length) {
    const type = latin1(bytes, offset, offset + 4);
    const size = view.getUint32(offset + 4, true);
    const data = bytes.subarray(offset + 8, Math.min(offset + 8 + size, bytes.length));
    if (type === 'EXIF' && !result.exif) {
      result.exif = data;
    } else if (type === 'XMP ' && result.xmp === undefined) {
      result.xmp = decodeUtf8(data) ?? undefined;
    }
    offset += 8 + size + (size % 2);
  }
  return result;
}

function decodeXmlText(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Read a simple property of an XMP packet, written either as an attribute or as an element
 * (for language alternatives and lists, the first item)
 */
export function getXmpProperty(xmp: string, name: string): string | undefined {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const attribute = new RegExp(`\\s${escaped}\\s*=\\s*"([^"]*)"`).exec(xmp) ?? new RegExp(`\\s${escaped}\\s*=\\s*'([^']*)'`).exec(xmp);
  if (attribute) return decodeXmlText(attribute[1]);

  const element = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`).exec(xmp);
  if (!element) return undefined;
  const item = /<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/.exec(element[1]);
  return decodeXmlText((item ? item[1] : element[1]).trim());
}

/**
 * Collect the XMP properties that carry generation data
 */
export function readXmpEntries(xmp: string): MetadataEntries {
  const entries: MetadataEntries = {};
  const properties: [string, string][] = [
    ['dc:description', 'Description'],
    ['exif:UserComment', 'UserComment'],
    ['xmp:CreatorTool', 'CreatorTool'],
    ['Iptc4xmpExt:DigitalSourceType', 'DigitalSourceType'],
  ];
  for (const [property, key] of properties) {
    const value = getXmpProperty(xmp, property);
    if (value) entries[key] = value;
  }
  return entries;
}

/**
 * Read the text metadata of a JPEG or WEBP file: EXIF text tags, JPEG comments and XMP properties
 */
export function readExifImageEntries(bytes: Uint8Array, format: 'JPEG' | 'WEBP'): MetadataEntries {
  const { exif, xmp, comments = [] } = format === 'JPEG' ? readJpegSegments(bytes) : { ...readWebpChunks(bytes), comments: [] };
  const entries: MetadataEntries = exif ? readExifEntries(exif) : {};
  if (comments.length > 0) {
    entries.Comment ??= comments.join('\n');
  }
  if (xmp) {
    entries.XMP = xmp;
    for (const [key, value] of Object.entries(readXmpEntries(xmp))) {
      entries[key] ??= value;
    }
  }
  unpackJsonEntries(entries, entries.UserComment);
  unpackJsonEntries(entries, entries.Comment);
  return entries;
}
