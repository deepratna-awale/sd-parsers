import { detectFormat } from './extractors/image';
import { detectVideoFormat } from './video';
import { latin1 } from './utils/bytes';

/**
 * Where `readMetadataBytes()` can read a file from: a file path (Node.js), a `Blob` / `File`,
 * a web `ReadableStream`, or any async iterable of byte chunks such as a Node.js stream
 */
export type StreamInput = string | Blob | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>;

/** Reads byte ranges of a file. Offsets of a stream must not go backwards. */
interface ByteReader {
  read(offset: number, length: number): Promise<Uint8Array>;
  close(): Promise<void>;
}

/** Bytes kept of a WEBP image data chunk: enough for the size in its header */
const WEBP_IMAGE_HEADER = 32;
/** Read when the format is unknown, for format detection */
const HEAD_SIZE = 64;

function fileReader(path: string): ByteReader {
  // loaded on demand, so the library can be bundled for browsers
  const { open } = require('fs/promises') as typeof import('fs/promises');
  const handle = open(path, 'r');
  return {
    async read(offset, length) {
      const file = await handle;
      const buffer = new Uint8Array(length);
      let filled = 0;
      while (filled < length) {
        const { bytesRead } = await file.read(buffer, filled, length - filled, offset + filled);
        if (bytesRead === 0) break;
        filled += bytesRead;
      }
      return buffer.subarray(0, filled);
    },
    async close() {
      await (await handle).close();
    },
  };
}

function blobReader(blob: Blob): ByteReader {
  return {
    async read(offset, length) {
      return new Uint8Array(await blob.slice(offset, offset + length).arrayBuffer());
    },
    async close() {},
  };
}

async function* iterateWebStream(stream: ReadableStream<Uint8Array>): AsyncGenerator<Uint8Array> {
  const reader = stream.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return;
      yield value;
    }
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

/** Chunks of a web stream or an async iterable */
export function toAsyncIterable(input: ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>): AsyncIterable<Uint8Array> {
  return typeof ReadableStream !== 'undefined' && input instanceof ReadableStream ? iterateWebStream(input) : (input as AsyncIterable<Uint8Array>);
}

/** Reads a stream forwards, keeping only the bytes that are still wanted */
function streamReader(source: AsyncIterable<Uint8Array>): ByteReader {
  const iterator = source[Symbol.asyncIterator]();
  // unread chunks, starting at byte `position` of the stream
  let chunks: Uint8Array[] = [];
  let buffered = 0;
  let position = 0;
  let done = false;

  /** Forget everything before `offset`, so skipped media data is never held */
  const dropUntil = (offset: number) => {
    while (chunks.length > 0 && position + chunks[0].length <= offset) {
      position += chunks[0].length;
      buffered -= chunks[0].length;
      chunks.shift();
    }
    if (chunks.length > 0 && position < offset) {
      chunks[0] = chunks[0].subarray(offset - position);
      buffered -= offset - position;
      position = offset;
    }
  };

  return {
    async read(offset, length) {
      if (offset < position) throw new RangeError('a stream cannot be read backwards');
      dropUntil(offset);
      while (!done && position + buffered < offset + length) {
        const next = await iterator.next();
        if (next.done) {
          done = true;
          break;
        }
        const chunk = next.value instanceof Uint8Array ? next.value : new Uint8Array(next.value);
        chunks.push(chunk);
        buffered += chunk.length;
        dropUntil(offset);
      }
      if (position < offset) return new Uint8Array(0);
      const wanted = Math.min(length, buffered);
      const result = new Uint8Array(wanted);
      let filled = 0;
      for (const chunk of chunks) {
        if (filled >= wanted) break;
        const part = chunk.subarray(0, wanted - filled);
        result.set(part, filled);
        filled += part.length;
      }
      return result;
    },
    async close() {
      chunks = [];
      if (!done) await iterator.return?.();
    },
  };
}

function toReader(input: StreamInput): ByteReader {
  if (typeof input === 'string') {
    if (typeof process === 'undefined' || !process.versions?.node) {
      throw new TypeError('file paths can only be read in Node.js, pass a Blob or a stream instead');
    }
    return fileReader(input);
  }
  if (typeof Blob !== 'undefined' && input instanceof Blob) return blobReader(input);
  if (
    (typeof ReadableStream !== 'undefined' && input instanceof ReadableStream) ||
    (input && typeof (input as AsyncIterable<Uint8Array>)[Symbol.asyncIterator] === 'function')
  ) {
    return streamReader(toAsyncIterable(input as ReadableStream<Uint8Array>));
  }
  throw new TypeError('unsupported input type');
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

const u32be = (data: Uint8Array, offset: number) => new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset);

/** An empty IDAT chunk, so readers still see where the image data was */
const EMPTY_IDAT = new Uint8Array([0, 0, 0, 0, 0x49, 0x44, 0x41, 0x54, 0x35, 0xaf, 0x06, 0x1e]);

async function pngSkeleton(reader: ByteReader): Promise<Uint8Array> {
  const parts = [await reader.read(0, 8)];
  let offset = 8;
  let wroteImageData = false;
  for (;;) {
    const header = await reader.read(offset, 8);
    if (header.length < 8) break;
    const length = u32be(header, 0);
    const type = latin1(header, 4, 8);
    if (type === 'IDAT' || type === 'fdAT') {
      if (!wroteImageData) parts.push(EMPTY_IDAT);
      wroteImageData = true;
    } else {
      parts.push(header, await reader.read(offset + 8, length + 4));
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return concat(parts);
}

async function jpegSkeleton(reader: ByteReader): Promise<Uint8Array> {
  const parts = [await reader.read(0, 2)];
  let offset = 2;
  for (;;) {
    const marker = await reader.read(offset, 2);
    if (marker.length < 2 || marker[0] !== 0xff) break;
    if (marker[1] === 0xff) {
      offset++;
      continue;
    }
    // start of scan: the image data follows, and no metadata comes before it ends
    if (marker[1] === 0xda || marker[1] === 0xd9) break;
    if (marker[1] === 0x01 || (marker[1] >= 0xd0 && marker[1] <= 0xd7)) {
      parts.push(marker);
      offset += 2;
      continue;
    }
    const lengthBytes = await reader.read(offset + 2, 2);
    if (lengthBytes.length < 2) break;
    const length = (lengthBytes[0] << 8) | lengthBytes[1];
    parts.push(marker, lengthBytes, await reader.read(offset + 4, length - 2));
    offset += 2 + length;
  }
  parts.push(new Uint8Array([0xff, 0xd9]));
  return concat(parts);
}

async function webpSkeleton(reader: ByteReader): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let offset = 12;
  for (;;) {
    const header = await reader.read(offset, 8);
    if (header.length < 8) break;
    const type = latin1(header, 0, 4);
    const size = new DataView(header.buffer, header.byteOffset).getUint32(4, true);
    const padded = size + (size % 2);
    if (type === 'VP8 ' || type === 'VP8L') {
      const kept = Math.min(size, WEBP_IMAGE_HEADER);
      const chunk = new Uint8Array(8 + kept + (kept % 2));
      chunk.set(header);
      new DataView(chunk.buffer).setUint32(4, kept, true);
      chunk.set(await reader.read(offset + 8, kept), 8);
      parts.push(chunk);
    } else if (type !== 'ALPH' && type !== 'ANMF') {
      parts.push(header, await reader.read(offset + 8, padded));
    }
    offset += 8 + padded;
  }
  const body = concat(parts);
  const head = new Uint8Array(12);
  head.set([0x52, 0x49, 0x46, 0x46]);
  new DataView(head.buffer).setUint32(4, body.length + 4, true);
  head.set([0x57, 0x45, 0x42, 0x50], 8);
  return concat([head, body]);
}

async function mp4Skeleton(reader: ByteReader): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (;;) {
    const header = await reader.read(offset, 16);
    if (header.length < 8) break;
    const type = latin1(header, 4, 8);
    let size = u32be(header, 0);
    if (size === 1 && header.length >= 16) {
      size = Number(new DataView(header.buffer, header.byteOffset).getBigUint64(8));
    }
    if (type === 'mdat') {
      parts.push(new Uint8Array([0, 0, 0, 8, 0x6d, 0x64, 0x61, 0x74]));
      if (size === 0) break;
    } else if (size === 0) {
      // the box runs to the end of the file
      const rest: Uint8Array[] = [];
      for (let position = offset; ; position += 1 << 20) {
        const chunk = await reader.read(position, 1 << 20);
        rest.push(chunk);
        if (chunk.length < 1 << 20) break;
      }
      parts.push(...rest);
      break;
    } else {
      if (size < 8) break;
      parts.push(await reader.read(offset, size));
    }
    offset += size;
  }
  return concat(parts);
}

async function readVint(reader: ByteReader, offset: number, keepMarker: boolean): Promise<{ value: number; length: number; unknown: boolean; bytes: Uint8Array } | null> {
  const [first] = await reader.read(offset, 1);
  if (!first) return null;
  const length = Math.clz32(first) - 23;
  const bytes = await reader.read(offset, length);
  if (bytes.length < length) return null;
  let value = keepMarker ? first : first & (0xff >> length);
  let allOnes = value === 0xff >> length;
  for (let i = 1; i < length; i++) {
    value = value * 256 + bytes[i];
    if (bytes[i] !== 0xff) allOnes = false;
  }
  return { value, length, unknown: !keepMarker && allOnes, bytes };
}

const SEGMENT = 0x18538067;
/** Cluster and Cues hold the media data and its index; SeekHead positions go stale without them */
const MEDIA_ELEMENTS = new Set([0x1f43b675, 0x1c53bb6b, 0x114d9b74]);
const UNKNOWN_SIZE = new Uint8Array([0x01, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]);

async function matroskaSkeleton(reader: ByteReader): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  let offset = 0;
  for (;;) {
    const id = await readVint(reader, offset, true);
    const size = id && (await readVint(reader, offset + id.length, false));
    if (!id || !size) break;
    const start = offset + id.length + size.length;
    if (id.value !== SEGMENT) {
      if (size.unknown) break;
      parts.push(id.bytes, size.bytes, await reader.read(start, size.value));
      offset = start + size.value;
      continue;
    }

    // the segment: keep its children but the media data, under an unknown size
    parts.push(id.bytes, UNKNOWN_SIZE);
    const end = size.unknown ? Infinity : start + size.value;
    for (let child = start; child < end; ) {
      const childId = await readVint(reader, child, true);
      const childSize = childId && (await readVint(reader, child + childId.length, false));
      // a cluster of unknown size (live recording) can only be skipped by reading it: stop there
      if (!childId || !childSize || childSize.unknown) break;
      const childStart = child + childId.length + childSize.length;
      if (!MEDIA_ELEMENTS.has(childId.value)) {
        parts.push(childId.bytes, childSize.bytes, await reader.read(childStart, childSize.value));
      }
      child = childStart + childSize.value;
    }
    break;
  }
  return concat(parts);
}

/**
 * Read the parts of an image or video file that hold metadata, skipping the image and
 * media data: PNG chunks but the image data, JPEG segments up to the image data, WEBP chunks
 * with only the header of the image data, MP4 / MOV boxes but `mdat`, and Matroska elements
 * but clusters and cues.
 *
 * Files and `Blob`s are read in parts, without loading them whole; streams are read to the end
 * of their last metadata, and skipped data is dropped as it arrives. The result is much
 * smaller than the file and can be passed to `parse()` and the other readers of this library,
 * but it is not a valid image: the pixels, and so stealth metadata, are gone.
 */
export async function readMetadataBytes(input: StreamInput): Promise<Uint8Array> {
  const reader = toReader(input);
  try {
    const head = await reader.read(0, HEAD_SIZE);
    const format = detectFormat(head) ?? detectVideoFormat(head);
    switch (format) {
      case 'PNG':
        return await pngSkeleton(reader);
      case 'JPEG':
        return await jpegSkeleton(reader);
      case 'WEBP':
        return await webpSkeleton(reader);
      case 'MP4':
      case 'MOV':
        return await mp4Skeleton(reader);
      case 'WEBM':
      case 'MKV':
        return await matroskaSkeleton(reader);
      default:
        return head;
    }
  } finally {
    await reader.close();
  }
}
