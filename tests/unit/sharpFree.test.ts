import path from 'path';
import { readFileSync } from 'fs';
import { deflateSync, inflateSync, constants } from 'zlib';
import { ParserManager, Eagerness, Generators, UnidentifiedImageError, detectFormat } from '../../src';
import { findExif } from '../../src/extractors';
import { inflate } from '../../src/extractors/zlib';
import { loadSharp } from '../../src/extractors/image';

const RESOURCES = path.join(__dirname, '../resources');
const IMAGES = [
  'parsers/AUTOMATIC1111/automatic1111_cropped.png',
  'parsers/AUTOMATIC1111/automatic1111_cropped.jpg',
  'parsers/AUTOMATIC1111/automatic1111_stealth.png',
  'parsers/ComfyUI/img2img_cropped.png',
  'parsers/Fooocus/fooocus1_cropped.png',
  'parsers/InvokeAI/invokeai_dream1.png',
  'parsers/NovelAI/novelai1_cropped.png',
  'bad_images/empty_image.png',
  'bad_images/text_after_idat.png',
];
const STEALTH = path.join(RESOURCES, 'parsers/AUTOMATIC1111/automatic1111_stealth.png');
const JPEG = path.join(RESOURCES, 'parsers/AUTOMATIC1111/automatic1111_cropped.jpg');

/**
 * Load the library as if sharp was not installed
 */
function withoutSharp(): typeof import('../../src') {
  // sharp is loaded on first use, make sure the regular copy of the library has found it
  expect(loadSharp()).not.toBeNull();

  let library: typeof import('../../src') | undefined;
  jest.isolateModules(() => {
    jest.doMock('sharp', () => {
      throw new Error("Cannot find module 'sharp'");
    });
    library = require('../../src');
    expect(require('../../src/extractors/image').loadSharp()).toBeNull();
  });
  jest.dontMock('sharp');
  return library!;
}

/**
 * Decode pixels with the real sharp module, the way a custom decoder would
 */
async function decodeWithSharp(file: string) {
  const sharp = jest.requireActual('sharp');
  const { data, info } = await sharp(readFileSync(file)).raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height, channels: info.channels };
}

describe('parsing without sharp', () => {
  const library = withoutSharp();
  const withSharp = new ParserManager();

  it.each(IMAGES)('reads %s like the sharp-based parser', async file => {
    const manager = new library.ParserManager();
    const bytes = readFileSync(path.join(RESOURCES, file));
    for (const eagerness of [Eagerness.FAST, Eagerness.DEFAULT]) {
      expect(await manager.parse(bytes, eagerness)).toEqual(await withSharp.parse(bytes, eagerness));
    }
  });

  it('skips stealth metadata when no pixel decoder is available', async () => {
    const manager = new library.ParserManager({ eagerness: Eagerness.EAGER });
    expect(await manager.parse(readFileSync(STEALTH))).toBeNull();
  });

  it('reads stealth metadata with a custom pixel decoder', async () => {
    const manager = new library.ParserManager();
    const result = await manager.parse(readFileSync(STEALTH), {
      eagerness: Eagerness.EAGER,
      decodePixels: () => decodeWithSharp(STEALTH),
    });
    expect(result?.generator).toBe(library.Generators.AUTOMATIC1111);
    expect(result).toEqual(await withSharp.parse(STEALTH, Eagerness.EAGER));
  });
});

describe('ParserManager inputs', () => {
  const manager = new ParserManager();

  it('accepts a Uint8Array, an ArrayBuffer and a Blob', async () => {
    const buffer = readFileSync(JPEG);
    const expected = await manager.parse(JPEG);
    expect(expected?.generator).toBe(Generators.AUTOMATIC1111);

    const bytes = new Uint8Array(buffer);
    expect(await manager.parse(bytes)).toEqual(expected);
    expect(await manager.parse(bytes.buffer)).toEqual(expected);
    expect(await manager.parse(new Blob([bytes]))).toEqual(expected);
  });

  it('reads stealth metadata from bytes with sharp installed', async () => {
    const result = await manager.parse(new Uint8Array(readFileSync(STEALTH)), { eagerness: Eagerness.EAGER });
    expect(result?.generator).toBe(Generators.AUTOMATIC1111);
  });

  it('respects the eagerness passed in the options', async () => {
    expect(await manager.parse(STEALTH, { eagerness: Eagerness.DEFAULT })).toBeNull();
  });

  it('rejects data that is not an image', async () => {
    await expect(manager.parse(Buffer.from('invalid image data'))).rejects.toThrow(UnidentifiedImageError);
    await expect(manager.parse(new Uint8Array(0))).rejects.toThrow(UnidentifiedImageError);
  });

  it('resolves to null for other image formats', async () => {
    expect(await manager.parse(Buffer.from('GIF89a\x01\x00\x01\x00\x00\x00\x00;', 'latin1'))).toBeNull();
  });

  it('reads the exif data of WEBP images', async () => {
    const sharp = jest.requireActual('sharp');
    const webp: Buffer = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#fff' } }).webp().toBuffer();
    const exif = findExif(readFileSync(JPEG), 'JPEG')!.subarray(6);

    const header = Buffer.alloc(8);
    header.write('EXIF', 0, 'latin1');
    header.writeUInt32LE(exif.length, 4);
    const padding = Buffer.alloc(exif.length % 2);
    const file = Buffer.concat([webp, header, exif, padding]);
    file.writeUInt32LE(file.length - 8, 4);

    expect(detectFormat(file)).toBe('WEBP');
    expect(await manager.parse(file)).toEqual(await manager.parse(JPEG));
  });
});

describe('inflate', () => {
  const data = deflateSync(Buffer.from('a'.repeat(1000) + 'ünïcode'.repeat(500)));

  it('decompresses complete streams', () => {
    expect(Buffer.from(inflate(data))).toEqual(inflateSync(data));
  });

  it('returns what it can from truncated streams, like zlib', () => {
    const truncated = data.subarray(0, Math.floor(data.length / 2));
    expect(Buffer.from(inflate(truncated))).toEqual(inflateSync(truncated, { finishFlush: constants.Z_SYNC_FLUSH }));
  });
});
