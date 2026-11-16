#!/usr/bin/env node
// Replace the pixels of an image with a tiny placeholder while keeping every metadata
// segment byte for byte, so real generator output can be checked in as a small test fixture.
//
// Usage: node scripts/shrink-sample.mjs <input> <output>
import { readFileSync, writeFileSync } from 'fs';
import sharp from 'sharp';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: node scripts/shrink-sample.mjs <input> <output>');
  process.exit(1);
}

const bytes = readFileSync(input);
const ascii = (start, end) => bytes.toString('latin1', start, end);

function pngChunks(buffer) {
  const chunks = [];
  for (let offset = 8; offset + 8 <= buffer.length; ) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('latin1', offset + 4, offset + 8);
    chunks.push({ type, raw: buffer.subarray(offset, offset + 12 + length) });
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return chunks;
}

async function shrinkPng() {
  const chunks = pngChunks(bytes);
  const colorType = chunks[0].raw[8 + 9];
  const channels = colorType === 6 || colorType === 4 ? 4 : 3;
  const tiny = await sharp({ create: { width: 1, height: 1, channels, background: '#808080' } }).png().toBuffer();
  const tinyChunks = pngChunks(tiny);
  const keep = chunks.filter(c => !['IHDR', 'IDAT', 'IEND', 'PLTE', 'tRNS', 'iCCP', 'sBIT'].includes(c.type));
  const firstData = chunks.findIndex(c => c.type === 'IDAT');
  const before = keep.filter(c => chunks.indexOf(c) < firstData);
  const after = keep.filter(c => chunks.indexOf(c) > firstData);
  const pick = type => tinyChunks.filter(c => c.type === type).map(c => c.raw);
  return Buffer.concat([tiny.subarray(0, 8), ...pick('IHDR'), ...before.map(c => c.raw), ...pick('IDAT'), ...after.map(c => c.raw), ...pick('IEND')]);
}

async function shrinkJpeg() {
  const segments = [];
  for (let offset = 2; offset + 4 <= bytes.length; ) {
    const marker = bytes[offset + 1];
    if (marker === 0xda) break;
    const length = bytes.readUInt16BE(offset + 2);
    if ((marker >= 0xe1 && marker <= 0xef) || marker === 0xfe) {
      segments.push(bytes.subarray(offset, offset + 2 + length));
    }
    offset += 2 + length;
  }
  const tiny = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#808080' } }).jpeg().toBuffer();
  // keep the tiny image's APP0 (JFIF) segment first, if any
  let insertAt = 2;
  if (tiny[3] === 0xe0) insertAt = 4 + tiny.readUInt16BE(4);
  return Buffer.concat([tiny.subarray(0, insertAt), ...segments, tiny.subarray(insertAt)]);
}

async function shrinkWebp() {
  const chunks = [];
  for (let offset = 12; offset + 8 <= bytes.length; ) {
    const type = ascii(offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    chunks.push({ type, raw: bytes.subarray(offset, offset + 8 + size + (size % 2)) });
    offset += 8 + size + (size % 2);
  }
  const meta = chunks.filter(c => c.type === 'EXIF' || c.type === 'XMP ');
  const tiny = await sharp({ create: { width: 1, height: 1, channels: 3, background: '#808080' } }).webp({ lossless: true }).toBuffer();
  const image = tiny.subarray(12);
  const vp8x = Buffer.alloc(18);
  vp8x.write('VP8X', 0, 'latin1');
  vp8x.writeUInt32LE(10, 4);
  vp8x[8] = (meta.some(c => c.type === 'EXIF') ? 0x08 : 0) | (meta.some(c => c.type === 'XMP ') ? 0x04 : 0);
  const body = Buffer.concat([vp8x, image, ...meta.map(c => c.raw)]);
  const header = Buffer.alloc(12);
  header.write('RIFF', 0, 'latin1');
  header.writeUInt32LE(body.length + 4, 4);
  header.write('WEBP', 8, 'latin1');
  return Buffer.concat([header, body]);
}

let result;
if (ascii(1, 4) === 'PNG') result = await shrinkPng();
else if (bytes[0] === 0xff && bytes[1] === 0xd8) result = await shrinkJpeg();
else if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') result = await shrinkWebp();
else throw new Error('unsupported image format');

writeFileSync(output, result);
