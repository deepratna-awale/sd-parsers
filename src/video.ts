import { MetadataEntries, readXmpEntries } from './extractors/entries';
import { latin1 } from './utils/bytes';

export type VideoFormat = 'MP4' | 'MOV' | 'WEBM' | 'MKV';

/** AVIF and HEIF images share the MP4 container */
const STILL_IMAGE_BRANDS = new Set(['avif', 'avis', 'heic', 'heix', 'heim', 'heis', 'hevc', 'hevx', 'mif1', 'msf1']);

const utf8 = new TextDecoder();

/** UUID of the box that holds an XMP packet in MP4 files */
const XMP_UUID = 'be7acfcb97a942e89c71999491e3afac';
/** UUID of the box that holds C2PA manifests in MP4 files */
const C2PA_UUID = 'd8fec3d61b0e483c92975828877ec481';

/**
 * Tell MP4 / MOV (ISO base media) and WebM / MKV (Matroska) files apart
 */
export function detectVideoFormat(bytes: Uint8Array): VideoFormat | null {
  if (bytes.length >= 12 && latin1(bytes, 4, 8) === 'ftyp') {
    const brand = latin1(bytes, 8, 12);
    if (STILL_IMAGE_BRANDS.has(brand)) return null;
    return brand === 'qt  ' ? 'MOV' : 'MP4';
  }
  if (bytes.length >= 4 && bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3) {
    const head = latin1(bytes, 0, Math.min(64, bytes.length));
    return head.includes('webm') ? 'WEBM' : 'MKV';
  }
  return null;
}

/* ---------- MP4 / MOV ---------- */

interface Mp4Box {
  type: string;
  data: Uint8Array;
}

function readMp4Boxes(data: Uint8Array): Mp4Box[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const boxes: Mp4Box[] = [];
  let offset = 0;
  while (offset + 8 <= data.length) {
    let size = view.getUint32(offset);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > data.length) break;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = data.length - offset;
    }
    if (size < header) break;
    const end = Math.min(offset + size, data.length);
    boxes.push({ type: latin1(data, offset + 4, offset + 8), data: data.subarray(offset + header, end) });
    offset += size;
  }
  return boxes;
}

const child = (boxes: Mp4Box[], type: string) => boxes.find(box => box.type === type);

/** `meta` is a full box in MP4 files (version and flags first) but not always in QuickTime files */
function metaChildren(meta: Uint8Array): Mp4Box[] {
  const plain = readMp4Boxes(meta);
  return plain.some(box => box.type === 'hdlr') ? plain : readMp4Boxes(meta.subarray(4));
}

/** Names of iTunes style metadata items, as ffmpeg calls them */
const ILST_NAMES: Record<string, string> = {
  '©cmt': 'comment',
  desc: 'description',
  ldes: 'synopsis',
  '©nam': 'title',
  '©too': 'encoder',
  '©swr': 'encoder',
  '©ART': 'artist',
  '©day': 'date',
  '©gen': 'genre',
  '©inf': 'information',
  cprt: 'copyright',
};

function decodeDataAtom(box: Mp4Box): string | undefined {
  const data = child(readMp4Boxes(box.data), 'data');
  if (!data || data.data.length < 8) return undefined;
  const type = new DataView(data.data.buffer, data.data.byteOffset).getUint32(0) & 0xffffff;
  // 1: UTF-8, 2: UTF-16 BE
  if (type !== 1 && type !== 2) return undefined;
  const value = data.data.subarray(8);
  return type === 1 ? utf8.decode(value) : new TextDecoder('utf-16be').decode(value);
}

function readIlst(ilst: Mp4Box, keys: string[] = []): MetadataEntries {
  const entries: MetadataEntries = {};
  for (const item of readMp4Boxes(ilst.data)) {
    const value = decodeDataAtom(item);
    if (value === undefined) continue;
    // items of a `keys` list are numbered from 1 instead of named
    const index = Array.from(item.type).reduce((total, char) => total * 256 + char.charCodeAt(0), 0);
    const raw = item.type.charCodeAt(0) === 0 ? keys[index - 1] : undefined;
    const name = raw?.replace(/^com\.apple\.quicktime\./, '') ?? ILST_NAMES[item.type] ?? item.type;
    entries[name] ??= value;
  }
  return entries;
}

function readKeys(keys: Mp4Box): string[] {
  const view = new DataView(keys.data.buffer, keys.data.byteOffset, keys.data.byteLength);
  const names: string[] = [];
  let offset = 8; // version, flags and entry count
  while (offset + 8 <= keys.data.length) {
    const size = view.getUint32(offset);
    if (size < 8) break;
    names.push(utf8.decode(keys.data.subarray(offset + 8, offset + size)));
    offset += size;
  }
  return names;
}

/** QuickTime user data text: 16 bit length, language code, text */
function readUdtaText(box: Mp4Box): string | undefined {
  if (box.data.length < 4) return undefined;
  const length = (box.data[0] << 8) | box.data[1];
  if (length === 0 || 4 + length > box.data.length) return undefined;
  return utf8.decode(box.data.subarray(4, 4 + length));
}

function uuidOf(box: Mp4Box): string {
  return Array.from(box.data.subarray(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
}

interface Mp4Metadata {
  entries: MetadataEntries;
  xmp?: string;
  c2pa?: Uint8Array;
  width?: number;
  height?: number;
}

function readMp4(bytes: Uint8Array): Mp4Metadata {
  const top = readMp4Boxes(bytes);
  const result: Mp4Metadata = { entries: {} };
  const add = (entries: MetadataEntries) => {
    for (const [key, value] of Object.entries(entries)) result.entries[key] ??= value;
  };

  const moov = child(top, 'moov');
  const moovChildren = moov ? readMp4Boxes(moov.data) : [];

  // iTunes style items, named or (ffmpeg -movflags use_metadata_tags) numbered with a keys list
  const readMeta = (meta: Mp4Box) => {
    const metaBoxes = metaChildren(meta.data);
    const keys = child(metaBoxes, 'keys');
    const ilst = child(metaBoxes, 'ilst');
    if (ilst) add(readIlst(ilst, keys ? readKeys(keys) : []));
  };
  const meta = child(moovChildren, 'meta');
  if (meta) readMeta(meta);

  const udta = child(moovChildren, 'udta');
  if (udta) {
    for (const box of readMp4Boxes(udta.data)) {
      if (box.type === 'meta') {
        readMeta(box);
      } else if (box.type === 'XMP_') {
        result.xmp ??= utf8.decode(box.data);
      } else if (box.type.charCodeAt(0) === 0xa9) {
        const text = readUdtaText(box);
        if (text) add({ [ILST_NAMES[box.type] ?? box.type]: text });
      }
    }
  }

  for (const box of top) {
    if (box.type !== 'uuid' || box.data.length < 16) continue;
    const uuid = uuidOf(box);
    if (uuid === XMP_UUID) {
      result.xmp ??= utf8.decode(box.data.subarray(16));
    } else if (uuid === C2PA_UUID && !result.c2pa) {
      // version and flags, a purpose string, and for manifests a 64 bit offset before the JUMBF data
      const body = box.data.subarray(20);
      const end = body.indexOf(0);
      const purpose = latin1(body, 0, end === -1 ? 0 : end);
      if (purpose === 'manifest') result.c2pa = body.subarray(end + 1 + 8);
    }
  }

  // size of the first video track, from its track header (16.16 fixed point)
  for (const trak of moovChildren.filter(box => box.type === 'trak')) {
    const trakBoxes = readMp4Boxes(trak.data);
    const mdia = child(trakBoxes, 'mdia');
    const hdlr = mdia && child(readMp4Boxes(mdia.data), 'hdlr');
    const tkhd = child(trakBoxes, 'tkhd');
    if (!tkhd || !hdlr || latin1(hdlr.data, 8, 12) !== 'vide') continue;
    const view = new DataView(tkhd.data.buffer, tkhd.data.byteOffset, tkhd.data.byteLength);
    const offset = tkhd.data[0] === 1 ? 88 : 76;
    if (offset + 8 > tkhd.data.length) continue;
    result.width = view.getUint32(offset) >>> 16;
    result.height = view.getUint32(offset + 4) >>> 16;
    break;
  }
  return result;
}

/* ---------- Matroska / WebM ---------- */

const EBML = {
  segment: 0x18538067,
  info: 0x1549a966,
  title: 0x7ba9,
  tracks: 0x1654ae6b,
  trackEntry: 0xae,
  video: 0xe0,
  pixelWidth: 0xb0,
  pixelHeight: 0xba,
  tags: 0x1254c367,
  tag: 0x7373,
  targets: 0x63c0,
  simpleTag: 0x67c8,
  tagName: 0x45a3,
  tagString: 0x4487,
};

/** Track, edition, chapter and attachment UIDs: tags that describe one part of the file */
const PART_TARGETS = new Set([0x63c5, 0x63c9, 0x63c4, 0x63c6]);

interface EbmlElement {
  id: number;
  data: Uint8Array;
}

function readVint(data: Uint8Array, offset: number, keepMarker: boolean): { value: number; length: number; unknown: boolean } | null {
  const first = data[offset];
  if (first === undefined || first === 0) return null;
  const length = Math.clz32(first) - 23;
  if (offset + length > data.length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + data[offset + i];
    if (data[offset + i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes };
}

function readEbml(data: Uint8Array): EbmlElement[] {
  const elements: EbmlElement[] = [];
  let offset = 0;
  while (offset < data.length) {
    const id = readVint(data, offset, true);
    const size = id && readVint(data, offset + id.length, false);
    if (!id || !size) break;
    const start = offset + id.length + size.length;
    // an element of unknown size runs to the end of its parent
    const end = size.unknown ? data.length : Math.min(start + size.value, data.length);
    elements.push({ id: id.value, data: data.subarray(start, end) });
    offset = end;
  }
  return elements;
}

function readUint(data: Uint8Array): number {
  return data.reduce((value, byte) => value * 256 + byte, 0);
}

function readSimpleTags(data: Uint8Array, entries: MetadataEntries): void {
  for (const simpleTag of readEbml(data).filter(element => element.id === EBML.simpleTag)) {
    const children = readEbml(simpleTag.data);
    const name = children.find(element => element.id === EBML.tagName);
    const value = children.find(element => element.id === EBML.tagString);
    if (name && value) entries[utf8.decode(name.data)] ??= utf8.decode(value.data);
    readSimpleTags(simpleTag.data, entries);
  }
}

function readMatroska(bytes: Uint8Array): { entries: MetadataEntries; width?: number; height?: number } {
  const segment = readEbml(bytes).find(element => element.id === EBML.segment);
  const result: { entries: MetadataEntries; width?: number; height?: number } = { entries: {} };
  if (!segment) return result;

  for (const element of readEbml(segment.data)) {
    if (element.id === EBML.tags) {
      for (const tag of readEbml(element.data).filter(child => child.id === EBML.tag)) {
        const targets = readEbml(tag.data).find(child => child.id === EBML.targets);
        if (targets && readEbml(targets.data).some(target => PART_TARGETS.has(target.id))) continue;
        readSimpleTags(tag.data, result.entries);
      }
    } else if (element.id === EBML.info) {
      const title = readEbml(element.data).find(child => child.id === EBML.title);
      if (title) result.entries.TITLE ??= utf8.decode(title.data);
    } else if (element.id === EBML.tracks && result.width === undefined) {
      for (const entry of readEbml(element.data).filter(child => child.id === EBML.trackEntry)) {
        const video = readEbml(entry.data).find(child => child.id === EBML.video);
        if (!video) continue;
        const fields = readEbml(video.data);
        const width = fields.find(field => field.id === EBML.pixelWidth);
        const height = fields.find(field => field.id === EBML.pixelHeight);
        if (width && height) {
          result.width = readUint(width.data);
          result.height = readUint(height.data);
          break;
        }
      }
    }
  }
  return result;
}

/* ---------- public API ---------- */

export interface VideoMetadata {
  format: VideoFormat;
  /**
   * Text metadata under lower-case names (`prompt`, `workflow`, `comment`, `description`, ...).
   * AUTOMATIC1111 style parameters, which Forge writes to the description, are also found under `parameters`.
   */
  entries: MetadataEntries;
  /** XMP packet (MP4 / MOV) */
  xmp?: string;
  /** C2PA manifest store as JUMBF (MP4 / MOV) */
  c2pa?: Uint8Array;
  /** Size of the first video track */
  width?: number;
  height?: number;
}

/**
 * Read the metadata of an MP4, MOV, WebM or MKV file: ffmpeg metadata tags (which ComfyUI
 * and Forge use for their generation data), XMP and C2PA boxes, and the video size. Media data
 * is skipped without being decoded. Pass the whole file: MP4 files may keep their metadata
 * after the media data.
 */
export function readVideoMetadata(bytes: Uint8Array): VideoMetadata | null {
  const format = detectVideoFormat(bytes);
  if (!format) return null;

  const raw = format === 'MP4' || format === 'MOV' ? readMp4(bytes) : { ...readMatroska(bytes), xmp: undefined, c2pa: undefined };
  const entries: MetadataEntries = {};
  for (const [key, value] of Object.entries(raw.entries)) {
    entries[key.toLowerCase()] ??= value;
  }
  const parameters = [entries.parameters, entries.description, entries.comment].find(value => value && /(?:^|\n)Steps: \d/.test(value));
  if (parameters) entries.parameters = parameters;
  if (raw.xmp) {
    for (const [key, value] of Object.entries(readXmpEntries(raw.xmp))) entries[key] ??= value;
  }

  return { format, entries, xmp: raw.xmp, c2pa: raw.c2pa, width: raw.width, height: raw.height };
}
