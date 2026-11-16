import fs from 'fs';
import path from 'path';
import { Generators, PromptInfo, getGenerationSize, readImageSize } from '../../src';

function info(overrides: Partial<PromptInfo>): PromptInfo {
  return { generator: Generators.AUTOMATIC1111, samplers: [], metadata: {}, rawParameters: {}, ...overrides };
}

function png(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

describe('readImageSize', () => {
  it('reads PNG headers', () => {
    expect(readImageSize(png(832, 1216))).toEqual({ width: 832, height: 1216 });
  });

  it('reads JPEG and WEBP files', () => {
    const samples = path.join(__dirname, '../resources/samples');
    expect(readImageSize(fs.readFileSync(path.join(samples, 'jpg/civitai-lora.jpg')))).toEqual({ width: 1, height: 1 });
    expect(readImageSize(fs.readFileSync(path.join(samples, 'webp/swarmui.webp')))).toEqual({ width: 1, height: 1 });
  });

  it('returns null for other data', () => {
    expect(readImageSize(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});

describe('getGenerationSize', () => {
  it('reads A1111 style Size values', () => {
    expect(getGenerationSize(info({ metadata: { Size: '512x768' } }))).toEqual({ width: 512, height: 768 });
  });

  it('reads separate width and height parameters', () => {
    const promptInfo = info({ samplers: [{ name: 'euler', parameters: { width: 1024, height: 576 }, prompts: [], negativePrompts: [] }] });
    expect(getGenerationSize(promptInfo)).toEqual({ width: 1024, height: 576 });
  });

  it('returns null without size data', () => {
    expect(getGenerationSize(info({}))).toBeNull();
  });
});
