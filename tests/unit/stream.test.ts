import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync, createReadStream } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Readable } from 'stream';
import { ParserManager, Eagerness, readMetadataBytes, readImageSize, readVideoMetadata, readProvenance, UnidentifiedImageError } from '../../src';

const SAMPLES = join(__dirname, '..', 'resources', 'samples');
const files = ['png', 'jpg', 'webp', 'mp4', 'mov', 'mkv', 'webm', 'vendor/png', 'vendor/jpg', 'vendor/webp', 'vendor/mp4'].flatMap(folder =>
  readdirSync(join(SAMPLES, folder)).map(file => join(SAMPLES, folder, file)),
);

/** Yields the bytes in small chunks, like a network stream */
async function* chunked(bytes: Uint8Array, size = 37): AsyncGenerator<Uint8Array> {
  for (let offset = 0; offset < bytes.length; offset += size) yield bytes.slice(offset, offset + size);
}

function webStream(bytes: Uint8Array, size = 101): ReadableStream<Uint8Array> {
  let offset = 0;
  return new ReadableStream({
    pull(controller) {
      if (offset >= bytes.length) return controller.close();
      controller.enqueue(bytes.slice(offset, offset + size));
      offset += size;
    },
  });
}

const parserManager = new ParserManager();

describe('readMetadataBytes', () => {
  it.each(files.map(file => [file.slice(SAMPLES.length + 1), file]))('keeps all metadata of %s', async (_, file) => {
    const bytes = new Uint8Array(readFileSync(file));
    const expected = await parserManager.parse(bytes);
    const skeleton = await readMetadataBytes(file);
    expect(skeleton.length).toBeLessThanOrEqual(bytes.length + 8);

    expect(await parserManager.parse(skeleton)).toEqual(expected);
    expect(await parserManager.parse(file)).toEqual(expected);
    expect(await readMetadataBytes(chunked(bytes))).toEqual(skeleton);
    expect(await readMetadataBytes(webStream(bytes))).toEqual(skeleton);
    expect(await readMetadataBytes(new Blob([bytes]))).toEqual(skeleton);
    expect(readImageSize(skeleton)).toEqual(readImageSize(bytes));
    expect(readVideoMetadata(skeleton)).toEqual(readVideoMetadata(bytes));
    expect(JSON.stringify(readProvenance(skeleton))).toEqual(JSON.stringify(readProvenance(bytes)));
  });

  describe('large files', () => {
    let dir: string;
    beforeAll(() => {
      dir = mkdtempSync(join(tmpdir(), 'sd-parsers-stream-'));
    });
    afterAll(() => rmSync(dir, { recursive: true, force: true }));

    /** A PNG with 16 MB of image data between its text chunks */
    function bigPng(): string {
      const source = readFileSync(join(SAMPLES, 'png', 'forge-neo.png'));
      const iend = source.lastIndexOf(Buffer.from('IEND')) - 4;
      const idat = Buffer.alloc(12 + (16 << 20));
      idat.writeUInt32BE(16 << 20, 0);
      idat.write('IDAT', 4, 'latin1');
      const path = join(dir, 'big.png');
      writeFileSync(path, Buffer.concat([source.subarray(0, iend), idat, source.subarray(iend)]));
      return path;
    }

    it('reads only the metadata of a file', async () => {
      const path = bigPng();
      expect(statSync(path).size).toBeGreaterThan(16 << 20);
      const skeleton = await readMetadataBytes(path);
      expect(skeleton.length).toBeLessThan(10_000);
      const result = await parserManager.parse(path);
      expect(result).toMatchObject({ software: 'Forge Neo', width: 1024, height: 1024 });
    });

    it('drops skipped data of a stream as it arrives', async () => {
      const path = bigPng();
      let largest = 0;
      const stream = Readable.from(
        (async function* () {
          for await (const chunk of createReadStream(path, { highWaterMark: 1 << 16 })) {
            largest = Math.max(largest, (chunk as Buffer).length);
            yield chunk as Buffer;
          }
        })(),
      );
      const result = await parserManager.parse(stream);
      expect(result).toMatchObject({ software: 'Forge Neo' });
      expect(largest).toBeLessThanOrEqual(1 << 16);
    });

    it('stops reading a JPEG stream at the image data', async () => {
      const bytes = new Uint8Array(readFileSync(join(SAMPLES, 'jpg', 'forge-neo.jpeg')));
      let pulled = 0;
      async function* source() {
        for (let offset = 0; offset < bytes.length; offset += 16) {
          pulled += 16;
          yield bytes.slice(offset, offset + 16);
        }
        // never reached: the reader stops at the start of scan
        for (;;) {
          pulled += 1 << 20;
          yield new Uint8Array(1 << 20);
        }
      }
      expect(await parserManager.parse(source())).toMatchObject({ software: 'Forge Neo' });
      expect(pulled).toBeLessThanOrEqual(bytes.length + 16);
    });
  });

  it('reads the whole stream when the pixels are needed for stealth metadata', async () => {
    const bytes = new Uint8Array(readFileSync(join(__dirname, '..', 'resources', 'parsers', 'AUTOMATIC1111', 'automatic1111_stealth.png')));
    expect(await parserManager.parse(chunked(bytes, 4096))).toBeNull();
    expect(await parserManager.parse(chunked(bytes, 4096), Eagerness.EAGER)).toMatchObject({ samplers: [expect.anything()] });
    expect(await parserManager.parse(webStream(bytes, 4096), Eagerness.EAGER)).toMatchObject({ samplers: [expect.anything()] });
    expect(await parserManager.parse(new Blob([bytes]), Eagerness.EAGER)).toMatchObject({ samplers: [expect.anything()] });
  });

  it('rejects streams that are not images', async () => {
    await expect(parserManager.parse(chunked(new TextEncoder().encode('hello world, not an image')))).rejects.toThrow(UnidentifiedImageError);
    await expect(readMetadataBytes(42 as never)).rejects.toThrow(TypeError);
  });

  it('cannot read a stream backwards', async () => {
    // a truncated file still gives what was there
    const bytes = new Uint8Array(readFileSync(join(SAMPLES, 'png', 'forge-neo.png'))).subarray(0, 200);
    const skeleton = await readMetadataBytes(chunked(bytes));
    expect(skeleton.length).toBeLessThanOrEqual(200);
  });
});
