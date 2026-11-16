import { join } from 'path';
import {
  ParserManager,
  PromptInfo,
  Generators,
  createPromptInfo,
  createSampler,
  createModel,
  createPrompt,
  parsePromptTokens,
  normalizeTag,
  getGenerationSettings,
  diffPrompts,
  promptSimilarity,
  compareMetadata,
  analyzeCollection,
} from '../../src';

const sample = (...parts: string[]) => join(__dirname, '..', 'resources', 'samples', ...parts);

function info(prompt: string, options: { negative?: string; parameters?: Record<string, any>; model?: string; loras?: PromptInfo['loras']; size?: number } = {}): PromptInfo {
  const sampler = createSampler('Euler a', options.parameters ?? {}, {
    model: options.model ? createModel({ name: options.model }) : undefined,
    prompts: [createPrompt(prompt)],
    negativePrompts: options.negative ? [createPrompt(options.negative)] : [],
  });
  const result = createPromptInfo(Generators.AUTOMATIC1111, [sampler]);
  result.software = 'Forge';
  if (options.loras) result.loras = options.loras;
  if (options.size) result.width = result.height = options.size;
  return result;
}

describe('parsePromptTokens', () => {
  it('works out the weight of A1111 and NovelAI emphasis', () => {
    const tokens = parsePromptTokens('masterpiece, (best quality:1.2), ((detailed)), [blurry], {cute}, {{shiny}}, 1.3::cat ears::, (a, b:0.8)');
    expect(tokens.map(({ text, weight }) => [text, weight])).toEqual([
      ['masterpiece', 1],
      ['best quality', 1.2],
      ['detailed', 1.21],
      ['blurry', 0.9091],
      ['cute', 1.05],
      ['shiny', 1.1025],
      ['cat ears', 1.3],
      ['a, b', 0.8],
    ]);
  });

  it('recognizes LoRA tags, embeddings and BREAK', () => {
    expect(parsePromptTokens('1girl <lora:add_detail:0.6>, embedding:EasyNegative.pt, <lyco:style>\nsky BREAK sea')).toEqual([
      { text: 'add_detail', normalized: 'add detail', weight: 0.6, kind: 'lora' },
      { text: '1girl', normalized: '1girl', weight: 1, kind: 'tag' },
      { text: 'EasyNegative', normalized: 'easynegative', weight: 1, kind: 'embedding' },
      { text: 'style', normalized: 'style', weight: 1, kind: 'lora' },
      { text: 'sky', normalized: 'sky', weight: 1, kind: 'tag' },
      { text: 'BREAK', normalized: 'break', weight: 1, kind: 'break' },
      { text: 'sea', normalized: 'sea', weight: 1, kind: 'tag' },
    ]);
  });

  it('keeps escaped brackets as text', () => {
    expect(parsePromptTokens('hatsune_miku \\(vocaloid\\), (\\(smile\\):1.1)')).toEqual([
      { text: 'hatsune_miku \\(vocaloid\\)', normalized: 'hatsune miku (vocaloid)', weight: 1, kind: 'tag' },
      { text: '\\(smile\\)', normalized: '(smile)', weight: 1.1, kind: 'tag' },
    ]);
  });

  it('ignores empty parts', () => {
    expect(parsePromptTokens(' , ,\n')).toEqual([]);
    expect(normalizeTag('  Blue_Sky   at\tNight ')).toBe('blue sky at night');
  });
});

describe('getGenerationSettings', () => {
  it('turns the settings of a parsed image into plain values', async () => {
    const promptInfo = (await new ParserManager().parse(sample('png', 'forge-neo-hires.png')))!;
    expect(getGenerationSettings(promptInfo)).toMatchObject({
      generator: 'AUTOMATIC1111',
      software: 'Forge Neo',
      model: 'waiIllustriousSDXL_v160',
      sampler: 'Euler a',
      scheduler: 'Automatic',
      steps: 24,
      cfgScale: 6,
      seed: 449383496,
      loras: [],
    });
  });

  it('leaves out what was not recorded', () => {
    const settings = getGenerationSettings(info('a cat'));
    expect(settings).toEqual({ generator: 'AUTOMATIC1111', software: 'Forge', sampler: 'Euler a', loras: [], prompt: 'a cat', negativePrompt: '' });
  });
});

describe('comparing prompts', () => {
  it('lists added, removed and reweighted tokens', () => {
    expect(diffPrompts('a cat, (blue sky:1.2), sunset', 'A_Cat, (blue sky:1.4), night, <lora:x:1>')).toEqual({
      added: [
        { text: 'night', normalized: 'night', weight: 1, kind: 'tag' },
        { text: 'x', normalized: 'x', weight: 1, kind: 'lora' },
      ],
      removed: [{ text: 'sunset', normalized: 'sunset', weight: 1, kind: 'tag' }],
      reweighted: [{ token: 'blue sky', from: 1.2, to: 1.4 }],
    });
  });

  it('measures how many tokens two prompts share', () => {
    expect(promptSimilarity('a, b, c', 'c, b, a')).toBe(1);
    expect(promptSimilarity('a, b', 'b, c')).toBe(0.3333);
    expect(promptSimilarity('a', 'b')).toBe(0);
    expect(promptSimilarity('', '')).toBe(1);
  });
});

describe('compareMetadata', () => {
  it('reports the settings, prompts and LoRAs that changed', () => {
    const first = info('a cat, sunset', {
      negative: 'blurry',
      parameters: { steps: '20', cfg_scale: 7, seed: 1 },
      model: 'models/sdxl.safetensors',
      loras: [{ name: 'detail.safetensors', weight: 0.5 }, { name: 'old', weight: 1 }],
      size: 1024,
    });
    const second = info('a cat, night', {
      negative: 'blurry, lowres',
      parameters: { steps: 30, cfg_scale: 7, seed: 2 },
      model: 'sdxl',
      loras: [{ name: 'detail', weight: 0.8 }, { name: 'new', weight: 1 }],
      size: 1024,
    });
    const comparison = compareMetadata(first, second);
    expect(comparison.settings).toEqual({ steps: [20, 30], seed: [1, 2] });
    expect(comparison.prompt.added.map(token => token.text)).toEqual(['night']);
    expect(comparison.negativePrompt.added.map(token => token.text)).toEqual(['lowres']);
    expect(comparison.loras).toEqual({
      added: [{ name: 'new', weight: 1 }],
      removed: [{ name: 'old', weight: 1 }],
      reweighted: [{ name: 'detail', from: 0.5, to: 0.8 }],
    });
    expect(comparison.promptSimilarity).toBe(0.3333);
  });

  it('finds no differences between an image and itself', async () => {
    const promptInfo = (await new ParserManager().parse(sample('png', 'comfyui-lora.png')))!;
    expect(compareMetadata(promptInfo, promptInfo)).toEqual({
      prompt: { added: [], removed: [], reweighted: [] },
      negativePrompt: { added: [], removed: [], reweighted: [] },
      settings: {},
      loras: { added: [], removed: [], reweighted: [] },
      promptSimilarity: 1,
    });
  });
});

describe('analyzeCollection', () => {
  it('counts what a set of images uses, once per image', () => {
    const stats = analyzeCollection([
      info('a cat, a cat, sky', { negative: 'blurry', parameters: { steps: 20, cfg_scale: 5 }, model: 'a/sdxl.safetensors', size: 512, loras: [{ name: 'Detail.safetensors' }] }),
      info('A_Cat, sea', { parameters: { steps: 30, cfg_scale: 7, scheduler: 'karras' }, model: 'sdxl', size: 512, loras: [{ name: 'detail' }, { name: 'detail' }] }),
      null,
      info('dog', { model: 'flux', size: 1024 }),
    ]);
    expect(stats).toEqual({
      count: 3,
      generators: [{ value: 'AUTOMATIC1111', count: 3 }],
      software: [{ value: 'Forge', count: 3 }],
      models: [
        { value: 'sdxl', count: 2 },
        { value: 'flux', count: 1 },
      ],
      samplers: [{ value: 'Euler a', count: 3 }],
      schedulers: [{ value: 'karras', count: 1 }],
      sizes: [
        { value: '512x512', count: 2 },
        { value: '1024x1024', count: 1 },
      ],
      loras: [{ value: 'Detail', count: 2 }],
      tags: [
        { value: 'a cat', count: 2 },
        { value: 'dog', count: 1 },
        { value: 'sea', count: 1 },
        { value: 'sky', count: 1 },
      ],
      negativeTags: [{ value: 'blurry', count: 1 }],
      steps: { min: 20, max: 30, mean: 25 },
      cfgScale: { min: 5, max: 7, mean: 6 },
    });
  });

  it('handles an empty set', () => {
    expect(analyzeCollection([])).toMatchObject({ count: 0, tags: [] });
    expect(analyzeCollection([])).not.toHaveProperty('steps');
  });
});
