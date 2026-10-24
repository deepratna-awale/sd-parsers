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

  it.each([
    ['missing workflow', { prompt: JSON.stringify(PROMPT) }],
    ['missing prompt', { workflow: JSON.stringify(WORKFLOW) }],
    ['invalid prompt JSON', { prompt: 'not json', workflow: WORKFLOW }],
    ['workflow without links', { prompt: PROMPT, workflow: {} }],
    ['malformed links', { prompt: PROMPT, workflow: { links: [[1, 2, 3]] } }],
  ])('rejects %s', async (_name, parameters) => {
    await expect(parser.parse(parameters)).rejects.toThrow(ParserError);
  });
});
