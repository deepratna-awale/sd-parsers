/**
 * Parses real images from many generators (see tests/resources/samples/README.md).
 */
import path from 'path';
import { ParserManager, Generators, PromptInfo, getFullPrompt } from '../../src';

const SAMPLES = path.join(__dirname, '../resources/samples');

const EXPECTED: Record<string, Generators | null> = {
  'png/civitai-lora.png': Generators.AUTOMATIC1111,
  'png/empty.png': null,
  'png/gimp.png': null,
  'jpg/civitai.jpeg': Generators.AUTOMATIC1111,
  'jpg/civitai-lora.jpg': Generators.AUTOMATIC1111,
  'jpg/comfyui-save-image-extended.jpeg': Generators.COMFYUI,
  'jpg/comfyui-saveimage-plus.jpg': Generators.COMFYUI,
  'jpg/fooocus.jpg': Generators.FOOOCUS,
  'jpg/fooocus-a1111.jpg': Generators.AUTOMATIC1111,
  'jpg/empty.jpg': null,
  'jpg/gimp.jpg': null,
  'webp/comfyui-animated-webp.webp': Generators.COMFYUI,
  'webp/comfyui-save-image-extended.webp': Generators.COMFYUI,
  'webp/comfyui-saveimage-plus.webp': Generators.COMFYUI,
  'webp/fooocus.webp': Generators.FOOOCUS,
  'webp/novelai-curated.webp': Generators.NOVELAI,
  'webp/novelai-full-3char.webp': Generators.NOVELAI,
  'webp/novelai-v3.webp': Generators.NOVELAI,
  'webp/novelai-v5-full.webp': Generators.NOVELAI,
  'webp/empty.webp': null,
  'webp/gimp.webp': null,
};

describe('Sample images', () => {
  const parserManager = new ParserManager();

  it.each(Object.entries(EXPECTED))('%s', async (file, generator) => {
    const result = await parserManager.parse(path.join(SAMPLES, file));
    expect(result?.generator ?? null).toBe(generator);
    if (result) {
      expect(getFullPrompt(result)).toBeTruthy();
    }
  });

  it('reads UTF-8 text from NovelAI WEBP files without stray characters', async () => {
    const result = (await parserManager.parse(path.join(SAMPLES, 'webp/novelai-curated.webp'))) as PromptInfo;
    expect(getFullPrompt(result)).toMatch(/^1girl, solo, hatsune miku, #テスト/);
  });

  it('reads the little-endian UserComment of CivitAI files', async () => {
    const result = (await parserManager.parse(path.join(SAMPLES, 'jpg/civitai-lora.jpg'))) as PromptInfo;
    expect(result.samplers[0].name).toBe('Euler a');
    expect(getFullPrompt(result)).toMatch(/^perfect eyes, 1girl/);
  });
});
