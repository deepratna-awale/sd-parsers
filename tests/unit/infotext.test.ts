import { Generators, PromptInfo, toInfotext } from '../../src';

function info(overrides: Partial<PromptInfo>): PromptInfo {
  return { generator: Generators.COMFYUI, samplers: [], metadata: {}, rawParameters: {}, ...overrides };
}

const prompt = (value: string) => ({ value, metadata: {} });

describe('toInfotext', () => {
  it('returns the original text of AUTOMATIC1111 images', () => {
    const parameters = 'a cat\r\nNegative prompt: ugly\r\nSteps: 20, Seed: 1';
    const promptInfo = info({ generator: Generators.AUTOMATIC1111, rawParameters: { parameters } });
    expect(toInfotext(promptInfo)).toBe('a cat\nNegative prompt: ugly\nSteps: 20, Seed: 1');
  });

  it('writes the prompts, LoRA tags and settings of other images', () => {
    const promptInfo = info({
      samplers: [
        {
          name: 'euler',
          parameters: { steps: 20, cfg_scale: 1.399999976158142, seed: 7, denoise: 1, scheduler: 'karras' },
          model: { name: 'checkpoints/base.safetensors', hash: 'abc', metadata: {} },
          prompts: [prompt('a cat, <lora:fur:0.5>')],
          negativePrompts: [prompt('ugly')],
        },
      ],
      loras: [{ name: 'fur.safetensors', weight: 0.5 }, { name: 'eyes.safetensors', weight: 0.8, clipWeight: 0.6, hash: 'def' }],
      width: 512,
      height: 768,
    });
    expect(toInfotext(promptInfo)).toBe(
      'a cat, <lora:fur:0.5>\n<lora:eyes:0.8:0.6>\n' +
        'Negative prompt: ugly\n' +
        'Steps: 20, Sampler: euler, Schedule type: karras, CFG scale: 1.4, Seed: 7, Size: 512x768, ' +
        'Model hash: abc, Model: base, Lora hashes: "eyes: def"',
    );
  });

  it('quotes values that hold separators and leaves out unset fields', () => {
    const promptInfo = info({
      samplers: [{ name: 'unknown', parameters: { scheduler: 'a, b', clip_skip: false }, prompts: [prompt('a dog')], negativePrompts: [] }],
    });
    expect(toInfotext(promptInfo)).toBe('a dog\nSchedule type: "a, b"');
  });
});
