import { ComfyUIParser, Generators, ParserError } from '../../../src';

// checkpoint (4) -> positive (6) / negative (7) -> sampler (3), saved by (9)
const PROMPT = {
  '9': { class_type: 'SaveImage', inputs: { filename_prefix: 'ComfyUI', images: ['8', 0] } },
  '3': {
    class_type: 'KSampler',
    inputs: {
      seed: 1,
      steps: 20,
      cfg: 7.5,
      sampler_name: 'euler',
      scheduler: 'normal',
      model: ['4', 0],
      positive: ['6', 0],
      negative: ['7', 0],
    },
  },
  '4': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'model.safetensors' } },
  '6': { class_type: 'CLIPTextEncode', inputs: { text: ' a cat\n', clip: ['4', 1] } },
  '7': { class_type: 'CLIPTextEncode', inputs: { text: 'blurry', clip: ['4', 1] } },
};

// [link_id, origin_id, origin_slot, target_id, target_slot, type]
const WORKFLOW = {
  links: [
    [1, 4, 0, 3, 0, 'MODEL'],
    [2, 4, 1, 6, 0, 'CLIP'],
    [3, 4, 1, 7, 0, 'CLIP'],
    [4, 6, 0, 3, 1, 'CONDITIONING'],
    [5, 7, 0, 3, 2, 'CONDITIONING'],
  ],
};

describe('ComfyUIParser', () => {
  const parser = new ComfyUIParser();

  it('has the correct generator', () => {
    expect(parser.generator).toBe(Generators.COMFYUI);
  });

  it('follows the node graph from the sampler', async () => {
    const result = await parser.parse({ prompt: JSON.stringify(PROMPT), workflow: JSON.stringify(WORKFLOW) });

    expect(result.samplers).toHaveLength(1);
    const [sampler] = result.samplers;
    expect(sampler.samplerId).toBe('3');
    expect(sampler.name).toBe('euler');
    expect(sampler.parameters).toEqual({ cfg_scale: 7.5, seed: 1, steps: 20, scheduler: 'normal' });
    expect(sampler.model).toEqual({ name: 'model.safetensors', hash: undefined, modelId: '4', metadata: {} });
    expect(sampler.prompts).toEqual([{ value: 'a cat', promptId: '6', metadata: {} }]);
    expect(sampler.negativePrompts).toEqual([{ value: 'blurry', promptId: '7', metadata: {} }]);
    expect(result.metadata).toEqual({ SaveImage: [{ id: '9', filename_prefix: 'ComfyUI' }] });
  });

  it('keeps the node order of the prompt', async () => {
    const prompt = '{"10": ' + JSON.stringify(PROMPT['3']) + ', "2": ' + JSON.stringify({ ...PROMPT['3'], inputs: { ...PROMPT['3'].inputs, sampler_name: 'dpmpp_2m' } }) + '}';
    const result = await parser.parse({ prompt, workflow: WORKFLOW });

    expect(result.samplers.map(s => s.samplerId)).toEqual(['10', '2']);
  });

  it('accepts NaN values in the workflow', async () => {
    const workflow = JSON.stringify(WORKFLOW).replace('{', '{"extra": NaN, ');
    const result = await parser.parse({ prompt: PROMPT, workflow });
    expect(result.samplers).toHaveLength(1);
  });

  it('follows the links of the prompt without a workflow', async () => {
    const result = await parser.parse({ prompt: JSON.stringify(PROMPT) });
    const [sampler] = result.samplers;
    expect(sampler.model?.name).toBe('model.safetensors');
    expect(sampler.prompts.map(p => p.value)).toEqual(['a cat']);
    expect(sampler.negativePrompts.map(p => p.value)).toEqual(['blurry']);
  });

  it('reads custom samplers and text nodes of other node packs', async () => {
    const prompt = {
      '1': { class_type: 'SamplerCustomAdvanced', inputs: { noise: ['2', 0], guider: ['3', 0], sampler: ['4', 0], sigmas: ['5', 0] } },
      '2': { class_type: 'RandomNoise', inputs: { noise_seed: 42 } },
      '3': { class_type: 'CFGGuider', inputs: { cfg: 5, model: ['6', 0], positive: ['7', 0], negative: ['8', 0] } },
      '4': { class_type: 'KSamplerSelect', inputs: { sampler_name: 'euler' } },
      '5': { class_type: 'BasicScheduler', inputs: { scheduler: 'beta', steps: 24, denoise: 1, model: ['6', 0] } },
      '6': { class_type: 'UNETLoader', inputs: { unet_name: 'unet.safetensors' } },
      '7': { class_type: 'CLIPTextEncode', inputs: { text: ['9', 0], clip: ['10', 0] } },
      '8': { class_type: 'CLIPTextEncode', inputs: { text: 'ugly', clip: ['10', 0] } },
      '9': { class_type: 'DF_Text_Box', inputs: { Text: 'a dog' } },
      '10': { class_type: 'CLIPLoader', inputs: { clip_name: 'clip.safetensors' } },
    };
    const result = await parser.parse({ prompt });
    expect(result.samplers).toHaveLength(1);
    const [sampler] = result.samplers;
    expect(sampler.name).toBe('euler');
    expect(sampler.parameters).toMatchObject({ seed: 42, cfg_scale: 5, steps: 24, scheduler: 'beta' });
    expect(sampler.prompts.map(p => p.value)).toEqual(['a dog']);
    expect(sampler.negativePrompts.map(p => p.value)).toEqual(['ugly']);
  });

  it.each([
    ['a prompt without nodes', { prompt: '{"extra": {}}' }],
    ['missing prompt', { workflow: JSON.stringify(WORKFLOW) }],
    ['invalid prompt JSON', { prompt: 'not json', workflow: WORKFLOW }],
    ['workflow without links', { prompt: PROMPT, workflow: {} }],
    ['malformed links', { prompt: PROMPT, workflow: { links: [[1, 2, 3]] } }],
  ])('rejects %s', async (_name, parameters) => {
    await expect(parser.parse(parameters)).rejects.toThrow(ParserError);
  });
});
