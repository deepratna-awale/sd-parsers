import fs from 'fs';
import path from 'path';
import { ParserManager, PromptInfo, detectVideoFormat, getFullPrompt, readProvenance, readVideoMetadata } from '../../src';

const samples = path.join(__dirname, '../resources/samples');
const load = (file: string) => new Uint8Array(fs.readFileSync(path.join(samples, file)));

describe('detectVideoFormat', () => {
  it('tells the containers apart', () => {
    expect(detectVideoFormat(load('mp4/comfyui-wan2.2.mp4'))).toBe('MP4');
    expect(detectVideoFormat(load('mov/comfyui-mmh3.mov'))).toBe('MOV');
    expect(detectVideoFormat(load('webm/comfyui-mmh3.webm'))).toBe('WEBM');
    expect(detectVideoFormat(load('mkv/comfyui-wan2.2.mkv'))).toBe('MKV');
  });

  it('leaves AVIF / HEIF images and other files alone', () => {
    const avif = new Uint8Array([0, 0, 0, 0x1c, ...Buffer.from('ftypavif'), 0, 0, 0, 0]);
    expect(detectVideoFormat(avif)).toBeNull();
    expect(detectVideoFormat(load('png/comfyui.png'))).toBeNull();
  });
});

describe('readVideoMetadata', () => {
  it('reads ffmpeg metadata tags from MP4 keys lists', () => {
    const { entries, width, height } = readVideoMetadata(load('mp4/comfyui-wan2.2.mp4'))!;
    expect(Object.keys(entries)).toEqual(['workflow', 'prompt', 'encoder']);
    expect([width, height]).toEqual([512, 512]);
  });

  it('reads iTunes style items and names A1111 text as parameters', () => {
    const { entries } = readVideoMetadata(load('mp4/forge-neo-wan2.2.mp4'))!;
    expect(entries.description).toMatch(/^A girl looks/);
    expect(entries.parameters).toBe(entries.description);
  });

  it('reads file level Matroska tags, not those of single tracks', () => {
    const { entries, width } = readVideoMetadata(load('webm/comfyui-mmh3.webm'))!;
    expect(entries.encoder).toBe('Lavf61.7.100');
    expect(entries.prompt).toMatch(/^\{"115"/);
    expect(width).toBe(736);
  });

  it('finds XMP and C2PA boxes', () => {
    expect(readVideoMetadata(load('vendor/mp4/muse.mp4'))?.xmp).toContain('DigitalSourceType');
    expect(readVideoMetadata(load('vendor/mp4/grok-imagine2.mp4'))?.c2pa).toBeDefined();
  });

  it('returns null for images', () => {
    expect(readVideoMetadata(load('png/comfyui.png'))).toBeNull();
  });
});

describe('videos in parse results', () => {
  const parserManager = new ParserManager();

  it('reads ComfyUI custom samplers with a basic guider', async () => {
    const result = (await parserManager.parse(load('mp4/comfyui-mmh3.mp4'))) as PromptInfo;
    expect(result.samplers[0]).toMatchObject({ name: 'euler', parameters: { steps: 8, scheduler: 'beta' } });
    expect(getFullPrompt(result)).toMatch(/^For the target video/);
    expect([result.width, result.height]).toEqual([736, 736]);
  });

  it('reports the provenance of AI videos', () => {
    expect(readProvenance(load('vendor/mp4/gemini-veo3.1-lite.mp4'))).toMatchObject({ source: 'C2PA', vendor: 'Google' });
    expect(readProvenance(load('vendor/mp4/muse.mp4'))).toMatchObject({ source: 'XMP', vendor: 'Meta' });
  });
});
