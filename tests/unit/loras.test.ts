import { lorasFromA1111, lorasFromComfyGraph, lorasFromPromptTags } from '../../src';
import { loraTagName } from '../../src/loras';

describe('lorasFromPromptTags', () => {
  it('reads weights, separate text encoder weights and lyco tags', () => {
    expect(lorasFromPromptTags('a cat <lora:detail:0.6>, <lora:style:0.4:0.8> <lyco:old>')).toEqual([
      { name: 'detail', weight: 0.6 },
      { name: 'style', weight: 0.4, clipWeight: 0.8 },
      { name: 'old', weight: 1 },
    ]);
  });

  it('keeps colons that belong to the name', () => {
    expect(lorasFromPromptTags('<lora:a:b:0.5>')).toEqual([{ name: 'a:b', weight: 0.5 }]);
  });
});

describe('loraTagName', () => {
  it('drops the folder and the file extension', () => {
    expect(loraTagName('styles\\anime/detail.safetensors')).toBe('detail');
    expect(loraTagName('detail.v2')).toBe('detail.v2');
  });
});

describe('lorasFromA1111', () => {
  it('adds the hashes of the Lora hashes field to the prompt tags', () => {
    const text = 'a cat <lora:detail:0.6>\nNegative prompt: ugly\nSteps: 20, Seed: 1, Lora hashes: "detail: abc123"';
    expect(lorasFromA1111(text)).toEqual([{ name: 'detail', weight: 0.6, hash: 'abc123' }]);
  });

  it('ignores tags in the negative prompt', () => {
    expect(lorasFromA1111('a cat\nNegative prompt: <lora:bad:1>\nSteps: 20')).toEqual([]);
  });
});

describe('lorasFromComfyGraph', () => {
  it('follows the model links from the sampler to the LoRA loaders', () => {
    const graph = {
      '1': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
      '2': { class_type: 'LoraLoader', inputs: { model: ['1', 0], clip: ['1', 1], lora_name: 'a.safetensors', strength_model: 0.7, strength_clip: 0.7 } },
      '3': { class_type: 'LoraLoaderModelOnly', inputs: { model: ['2', 0], lora_name: 'b.safetensors', strength_model: 0.5 } },
      '4': { class_type: 'KSampler', inputs: { model: ['3', 0], seed: 1 } },
      '5': { class_type: 'LoraLoader', inputs: { model: ['1', 0], lora_name: 'unused.safetensors', strength_model: 1, strength_clip: 1 } },
    };
    expect(lorasFromComfyGraph(graph, ['4'])).toEqual([
      { name: 'a.safetensors', weight: 0.7 },
      { name: 'b.safetensors', weight: 0.5 },
    ]);
  });

  it('reads the entries of rgthree Power Lora Loader nodes', () => {
    const graph = {
      '1': {
        class_type: 'Power Lora Loader (rgthree)',
        inputs: {
          lora_1: { on: true, lora: 'a.safetensors', strength: 0.4 },
          lora_2: { on: false, lora: 'off.safetensors', strength: 1 },
        },
      },
    };
    expect(lorasFromComfyGraph(graph)).toEqual([{ name: 'a.safetensors', weight: 0.4 }]);
  });
});
