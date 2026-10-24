import sharp from 'sharp';
import path from 'path';
import { readFileSync } from 'fs';
import { deflateSync, gzipSync } from 'zlib';
import {
  pngImageInfo,
  pngImageText,
  pngStenographicAlpha,
  jpegUserComment,
  registerImageBuffer,
} from '../../../src/extractors';
import { Generators, MetadataError } from '../../../src';
import { createTestJpeg } from '../../test-utils';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function chunk(type: string, data: Buffer): Buffer {
  const typeAndData = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  let crc = 0xffffffff;
  for (const byte of typeAndData) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);

  const result = Buffer.alloc(typeAndData.length + 8);
  result.writeUInt32BE(data.length, 0);
  typeAndData.copy(result, 4);
  result.writeUInt32BE((crc ^ 0xffffffff) >>> 0, result.length - 4);
  return result;
}

/**
 * Insert chunks into an encoded PNG, before the first IDAT and before IEND
 */
function insertChunks(png: Buffer, beforeData: Buffer[], afterData: Buffer[] = []): Buffer {
  const idat = png.indexOf('IDAT', 8, 'latin1') - 4;
  const iend = png.indexOf('IEND', 8, 'latin1') - 4;
  return Buffer.concat([png.subarray(0, idat), ...beforeData, png.subarray(idat, iend), ...afterData, png.subarray(iend)]);
}

async function testPng(channels: 3 | 4 = 3, width = 64, height = 64) {
  return sharp({ create: { width, height, channels, background: { r: 255, g: 0, b: 0, alpha: 1 } } })
    .png()
    .toBuffer();
}

function load(buffer: Buffer) {
  const image = sharp(buffer);
  registerImageBuffer(image, buffer);
  return image;
}

describe('PNG text extractors', () => {
  it('reads tEXt, zTXt and iTXt chunks', async () => {
    const png = insertChunks(await testPng(), [
      chunk('tEXt', Buffer.from('parameters\0caf\xe9', 'latin1')),
      chunk('zTXt', Buffer.concat([Buffer.from('prompt\0\0'), deflateSync('{"1": {}}')])),
      chunk('iTXt', Buffer.concat([Buffer.from('workflow\0\x01\x00en\0\0'), deflateSync('ünïcode')])),
      chunk('iTXt', Buffer.from('plain\0\0\0\0\0text')),
    ]);

    const expected = { parameters: 'café', prompt: '{"1": {}}', workflow: 'ünïcode', plain: 'text' };
    expect(await pngImageInfo(load(png), Generators.UNKNOWN)).toEqual(expected);
    expect(await pngImageText(load(png), Generators.UNKNOWN)).toEqual(expected);
  });

  it('only reads chunks after the image data at higher eagerness', async () => {
    const png = insertChunks(await testPng(), [chunk('tEXt', Buffer.from('a\0before'))], [chunk('tEXt', Buffer.from('b\0after'))]);
    const image = load(png);

    expect(await pngImageInfo(image, Generators.UNKNOWN)).toEqual({ a: 'before' });
    expect(await pngImageText(image, Generators.UNKNOWN)).toEqual({ a: 'before', b: 'after' });
  });

  it('returns an empty dictionary for images without text', async () => {
    expect(await pngImageText(load(await testPng()), Generators.UNKNOWN)).toEqual({});
  });

  it('falls back to the text reported by sharp without the original data', async () => {
    const png = insertChunks(await testPng(), [chunk('tEXt', Buffer.from('parameters\0value'))]);
    expect(await pngImageInfo(sharp(png), Generators.UNKNOWN)).toEqual({ parameters: 'value' });
  });
});

describe('pngStenographicAlpha', () => {
  async function stealthPng(payload: string, width = 64, height = 64) {
    const compressed = gzipSync(payload);
    const length = Buffer.alloc(4);
    length.writeUInt32BE(compressed.length * 8);
    const bytes = Buffer.concat([Buffer.from('stealth_pngcomp'), length, compressed]);

    const pixels = Buffer.alloc(width * height * 4, 255);
    let bitIndex = 0;
    // bits are stored column by column in the least significant bit of the alpha channel
    for (const byte of bytes) {
      for (let bit = 7; bit >= 0; bit--, bitIndex++) {
        const x = Math.floor(bitIndex / height);
        const y = bitIndex % height;
        pixels[(y * width + x) * 4 + 3] = 254 | ((byte >> bit) & 1);
      }
    }
    return sharp(pixels, { raw: { width, height, channels: 4 } }).png().toBuffer();
  }

  it('reads AUTOMATIC1111 parameters', async () => {
    const image = load(await stealthPng('a cat\nSteps: 20, Sampler: Euler, CFG scale: 7'));
    expect(await pngStenographicAlpha(image, Generators.AUTOMATIC1111)).toEqual({
      parameters: 'a cat\nSteps: 20, Sampler: Euler, CFG scale: 7',
    });
    expect(await pngStenographicAlpha(image, Generators.NOVELAI)).toBeNull();
  });

  it('reads NovelAI JSON data', async () => {
    const image = load(await stealthPng('{"Comment": "{}"}'));
    expect(await pngStenographicAlpha(image, Generators.NOVELAI)).toEqual({ Comment: '{}' });
  });

  it('rejects images without alpha channel', async () => {
    await expect(pngStenographicAlpha(load(await testPng(3)), Generators.AUTOMATIC1111)).rejects.toThrow(MetadataError);
  });

  it('rejects images without stealth header', async () => {
    await expect(pngStenographicAlpha(load(await testPng(4)), Generators.AUTOMATIC1111)).rejects.toThrow(MetadataError);
  });
});

describe('jpegUserComment', () => {
  const jpeg = path.join(__dirname, '../../resources/parsers/AUTOMATIC1111/automatic1111_cropped.jpg');

  it('reads the UserComment for AUTOMATIC1111 and Fooocus', async () => {
    const image = load(readFileSync(jpeg));
    const result = await jpegUserComment(image, Generators.AUTOMATIC1111);
    expect(result!.parameters).toMatch(/^photo of a duck\nNegative prompt: monochrome\nSteps: 15/);
    expect(await jpegUserComment(image, Generators.FOOOCUS)).toEqual(result);
    expect(await jpegUserComment(image, Generators.COMFYUI)).toBeNull();
  });

  it('rejects images without exif data', async () => {
    await expect(jpegUserComment(load(await createTestJpeg()), Generators.AUTOMATIC1111)).rejects.toThrow(MetadataError);
  });
});
