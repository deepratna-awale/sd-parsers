import fs from 'fs';
import path from 'path';
import { readWebpChunks } from '../../src/extractors/entries';
import { ParserManager, decodeCbor, promptInfoToDict, readC2pa, readJumbf, readProvenance, stripMetadata, writeMetadata } from '../../src';

const vendor = path.join(__dirname, '../resources/samples/vendor');
const load = (file: string) => new Uint8Array(fs.readFileSync(path.join(vendor, file)));

describe('decodeCbor', () => {
  it('decodes the major types', () => {
    const bytes = new Uint8Array([
      0xa5, // map of 5
      0x61, 0x61, 0x18, 0x64, // "a": 100
      0x61, 0x62, 0x82, 0x20, 0xf5, // "b": [-1, true]
      0x61, 0x63, 0x42, 0x01, 0x02, // "c": h'0102'
      0x61, 0x64, 0xf9, 0x3e, 0x00, // "d": 1.5 (half)
      0x61, 0x65, 0x7f, 0x61, 0x78, 0x61, 0x79, 0xff, // "e": indefinite "xy"
    ]);
    expect(decodeCbor(bytes)).toEqual({ a: 100, b: [-1, true], c: new Uint8Array([1, 2]), d: 1.5, e: 'xy' });
  });

  it('keeps tags other than dates', () => {
    expect(decodeCbor(new Uint8Array([0xd2, 0x80]))).toEqual({ tag: 18, value: [] });
    expect(decodeCbor(new Uint8Array([0xc0, 0x61, 0x7a]))).toBe('z');
  });

  it('rejects truncated data', () => {
    expect(() => decodeCbor(new Uint8Array([0x62, 0x61]))).toThrow(RangeError);
  });
});

describe('readJumbf', () => {
  it('reads labels and nested superboxes', () => {
    const box = (type: string, body: number[]) => [0, 0, 0, 8 + body.length, ...Buffer.from(type), ...body];
    const jumd = (label: string) => box('jumd', [...new Array(16).fill(0), 0x03, ...Buffer.from(label), 0]);
    const data = new Uint8Array(box('jumb', [...jumd('outer'), ...box('jumb', [...jumd('inner'), ...box('json', [...Buffer.from('{}')])])]));
    const result = readJumbf(data);
    expect(result?.label).toBe('outer');
    expect(result?.children[0].label).toBe('inner');
    expect(result?.children[0].content[0].type).toBe('json');
  });
});

describe('readC2pa', () => {
  it('reads the claim, actions and signer of a PNG manifest', () => {
    const store = readC2pa(load('png/chatgpt-image2.png'));
    expect(store?.manifests).toHaveLength(1);
    expect(store?.activeManifest).toMatchObject({
      claimGenerator: 'OpenAI Media Service API',
      signers: ['OpenAI OpCo, LLC', 'Trufo Inc.'],
      actions: expect.arrayContaining([expect.objectContaining({ action: 'c2pa.created', softwareAgent: 'gpt-image 2.0' })]),
    });
  });

  it('joins manifests split over several JPEG segments', () => {
    const store = readC2pa(load('jpg/gemini_3.1pro-latest.jpg'));
    expect(store?.manifests).toHaveLength(2);
    expect(store?.manifests[0].signers[0]).toBe('Google LLC');
  });

  it('returns null without a manifest', () => {
    expect(readC2pa(load('webp/muse.webp'))).toBeNull();
  });
});

describe('readProvenance', () => {
  it.each([
    ['png/chatgpt-image2-latest.png', { source: 'C2PA', aiGenerated: true, vendor: 'OpenAI', software: 'ChatGPT' }],
    ['png/gemini_unknown.png', { source: 'C2PA', aiGenerated: true, vendor: 'Google', software: 'Gemini' }],
    ['jpg/grok-imagine2.jpg', { source: 'C2PA', aiGenerated: true, vendor: 'xAI', software: 'Grok Imagine' }],
    ['webp/muse.webp', { source: 'XMP', aiGenerated: true, vendor: 'Meta', software: 'Meta AI' }],
    ['jpg/muse-free.jpg', { source: 'XMP', aiGenerated: true, digitalSourceType: 'trainedAlgorithmicMedia' }],
  ])('names the source of %s', (file, expected) => {
    expect(readProvenance(load(file))).toMatchObject(expected);
  });

  it('returns null for images without labels', () => {
    expect(readProvenance(new Uint8Array(fs.readFileSync(path.join(__dirname, '../resources/writer/plain.png'))))).toBeNull();
  });
});

describe('provenance in parse results', () => {
  const parserManager = new ParserManager();

  it('reports labelled AI images without generation data', async () => {
    const result = await parserManager.parse(load('png/chatgpt-image2.png'));
    expect(result).toMatchObject({ generator: 'C2PA', software: 'ChatGPT', metadata: { vendor: 'OpenAI' } });
    const dict = promptInfoToDict(result!);
    expect(dict.provenance.manifests[0].assertions).toContain('c2pa.actions.v2');
    expect(() => JSON.stringify(dict)).not.toThrow();
  });

  it('keeps the generator of images with generation data', async () => {
    const xmp = readWebpChunks(load('webp/muse.webp')).xmp!;
    const plain = new Uint8Array(fs.readFileSync(path.join(__dirname, '../resources/writer/plain.png')));
    const image = writeMetadata(plain, { parameters: 'a cat\nSteps: 20, Sampler: Euler, Seed: 1', 'XML:com.adobe.xmp': xmp });
    const result = await parserManager.parse(image);
    expect(result?.generator).toBe('AUTOMATIC1111');
    expect(result?.provenance).toMatchObject({ source: 'XMP', vendor: 'Meta' });
  });

  it('is removed by stripMetadata', async () => {
    for (const file of ['png/chatgpt-image2.png', 'jpg/gemini_3.1pro-latest.jpg', 'webp/muse.webp']) {
      expect(readProvenance(stripMetadata(load(file)))).toBeNull();
    }
  });
});
