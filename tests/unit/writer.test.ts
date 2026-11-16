import fs from 'fs';
import path from 'path';
import {
  ParserManager,
  PromptInfo,
  UnidentifiedImageError,
  copyMetadata,
  getFullPrompt,
  readImageSize,
  readMetadataEntries,
  stripMetadata,
  toInfotext,
  writeMetadata,
} from '../../src';
import { readJpegSegments, readWebpChunks } from '../../src/extractors/entries';

const resources = path.join(__dirname, '../resources');
const load = (file: string) => new Uint8Array(fs.readFileSync(path.join(resources, file)));

const PARAMETERS = 'a cat, テスト\nNegative prompt: ugly\nSteps: 20, Sampler: Euler a, CFG scale: 7, Seed: 1, Size: 512x512';
const parserManager = new ParserManager();

describe('writeMetadata', () => {
  it.each(['writer/plain.png', 'writer/plain.jpg', 'writer/lossless.webp', 'writer/lossy.webp'])(
    'writes AUTOMATIC1111 parameters to %s',
    async file => {
      const image = load(file);
      const written = writeMetadata(image, PARAMETERS);
      const result = (await parserManager.parse(written)) as PromptInfo;
      expect(result.generator).toBe('AUTOMATIC1111');
      expect(getFullPrompt(result)).toBe('a cat, テスト');
      expect(readImageSize(written)).toEqual(readImageSize(image));
    },
  );

  it('adds an extended header to simple WEBP files and keeps their alpha flag', () => {
    const written = writeMetadata(load('writer/lossless.webp'), PARAMETERS);
    expect(Buffer.from(written.subarray(12, 16)).toString('latin1')).toBe('VP8X');
    expect(written[20] & 0x18).toBe(0x18);
    expect(new DataView(written.buffer).getUint32(4, true)).toBe(written.length - 8);
    expect(readWebpChunks(written).exif).toBeDefined();
  });

  it('replaces the metadata that was there', async () => {
    const comfy = load('samples/png/comfyui.png');
    const written = writeMetadata(comfy, PARAMETERS);
    expect(Object.keys(readMetadataEntries(written))).toEqual(['parameters']);
  });

  it('writes EXIF tags, XMP packets and packed chunks to JPEG files', () => {
    const xmp = '<x:xmpmeta xmlns:x="adobe:ns:meta/"></x:xmpmeta>';
    const written = writeMetadata(load('writer/plain.jpg'), { Software: 'Tool 1.0', 'XML:com.adobe.xmp': xmp, prompt: '{"1": {}}', workflow: '{}' });
    expect(readJpegSegments(written).xmp).toBe(xmp);
    expect(readMetadataEntries(written)).toEqual({ Software: 'Tool 1.0', 'XML:com.adobe.xmp': xmp, prompt: '{"1": {}}', workflow: '{}' });
  });

  it('falls back to UTF-8 when UTF-16 does not fit in a JPEG segment', () => {
    const text = 'x'.repeat(40000);
    expect(readMetadataEntries(writeMetadata(load('writer/plain.jpg'), { UserComment: text })).UserComment).toBe(text);
    expect(() => writeMetadata(load('writer/plain.jpg'), { UserComment: 'x'.repeat(70000) })).toThrow(RangeError);
    expect(readMetadataEntries(writeMetadata(load('writer/plain.png'), { UserComment: 'x'.repeat(70000) })).UserComment).toHaveLength(70000);
  });

  it('rejects other files', () => {
    expect(() => writeMetadata(new Uint8Array([1, 2, 3]), 'text')).toThrow(UnidentifiedImageError);
  });
});

describe('stripMetadata', () => {
  it.each(['samples/png/comfyui.png', 'samples/jpg/forge-neo.jpeg', 'samples/webp/novelai-v3.webp', 'samples/png/draw-things-lora.png'])(
    'removes the metadata of %s',
    async file => {
      const stripped = stripMetadata(load(file));
      expect(await parserManager.parse(stripped)).toBeNull();
      expect(readMetadataEntries(stripped)).toEqual({});
    },
  );
});

describe('copyMetadata', () => {
  it.each([
    ['samples/png/comfyui-lora.png', 'writer/plain.jpg'],
    ['samples/png/novelai-full.png', 'writer/lossy.webp'],
    ['samples/jpg/fooocus.jpg', 'writer/plain.png'],
    ['samples/webp/novelai-v3.webp', 'writer/plain.png'],
    ['samples/png/draw-things-lora.png', 'writer/plain.jpg'],
  ])('copies %s into %s', async (source, target) => {
    const original = (await parserManager.parse(load(source))) as PromptInfo;
    const copy = (await parserManager.parse(copyMetadata(load(source), load(target)))) as PromptInfo;
    expect([copy.generator, copy.software, getFullPrompt(copy)]).toEqual([original.generator, original.software, getFullPrompt(original)]);
  });

  it('can turn any image into one that AUTOMATIC1111 reads', async () => {
    const comfy = (await parserManager.parse(load('samples/png/comfyui-lora.png'))) as PromptInfo;
    const written = (await parserManager.parse(writeMetadata(load('writer/plain.jpg'), toInfotext(comfy)))) as PromptInfo;
    expect(written.generator).toBe('AUTOMATIC1111');
    expect(written.loras).toEqual(comfy.loras?.map(lora => expect.objectContaining({ weight: lora.weight })));
  });
});
