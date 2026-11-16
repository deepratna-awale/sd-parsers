#!/usr/bin/env node
// Drop the media data of an MP4 / MOV / WebM / MKV file while keeping every metadata box and
// element byte for byte, so real generator output can be checked in as a small test fixture.
// The result is not playable.
//
// Usage: node scripts/shrink-video.mjs <input> <output>
import { readFileSync, writeFileSync } from 'fs';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/shrink-video.mjs <input> <output>');
  process.exit(1);
}

const bytes = readFileSync(input);

function shrinkMp4() {
  const parts = [];
  for (let offset = 0; offset + 8 <= bytes.length; ) {
    let size = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    if (size === 1) size = Number(bytes.readBigUInt64BE(offset + 8));
    if (size === 0) size = bytes.length - offset;
    if (type === 'mdat') {
      const empty = Buffer.alloc(8);
      empty.writeUInt32BE(8);
      empty.write('mdat', 4, 'latin1');
      parts.push(empty);
    } else {
      parts.push(bytes.subarray(offset, offset + size));
    }
    offset += size;
  }
  return Buffer.concat(parts);
}

function readVint(offset, keepMarker) {
  const first = bytes[offset];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  let value = BigInt(keepMarker ? first : first & (0xff >> length));
  for (let i = 1; i < length; i++) value = (value << 8n) | BigInt(bytes[offset + i]);
  const unknown = !keepMarker && value === (1n << BigInt(7 * length)) - 1n;
  return { value, length, unknown };
}

function shrinkMatroska() {
  const SEGMENT = 0x18538067n;
  const DROPPED = new Set([0x1f43b675n, 0x1c53bb6bn, 0x114d9b74n]); // Cluster, Cues, SeekHead
  const parts = [];
  let offset = 0;
  while (offset < bytes.length) {
    const id = readVint(offset, true);
    const size = readVint(offset + id.length, false);
    const start = offset + id.length + size.length;
    const end = size.unknown ? bytes.length : start + Number(size.value);
    if (id.value !== SEGMENT) {
      parts.push(bytes.subarray(offset, end));
      offset = end;
      continue;
    }
    const children = [];
    for (let child = start; child < end; ) {
      const childId = readVint(child, true);
      const childSize = readVint(child + childId.length, false);
      if (childSize.unknown) break;
      const childEnd = child + childId.length + childSize.length + Number(childSize.value);
      if (!DROPPED.has(childId.value)) children.push(bytes.subarray(child, childEnd));
      child = childEnd;
    }
    const body = Buffer.concat(children);
    const header = Buffer.alloc(12);
    bytes.copy(header, 0, offset, offset + 4);
    header[4] = 0x01;
    header.writeUIntBE(0, 5, 1);
    header.writeUIntBE(Math.floor(body.length / 2 ** 32), 6, 2);
    header.writeUInt32BE(body.length % 2 ** 32, 8);
    parts.push(header, body);
    offset = end;
  }
  return Buffer.concat(parts);
}

const isMatroska = bytes.readUInt32BE(0) === 0x1a45dfa3;
const result = isMatroska ? shrinkMatroska() : shrinkMp4();
writeFileSync(output, result);
console.log(`${input}: ${bytes.length} -> ${result.length} bytes`);
