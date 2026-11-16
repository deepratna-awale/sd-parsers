import {
  SwarmUIParser,
  RuinedFooocusParser,
  HFSpaceParser,
  EasyDiffusionParser,
  DrawThingsParser,
  DezgoParser,
  KusArtParser,
  TensorArtParser,
  StabilityMatrixParser,
  CivitaiParser,
  ParserError,
  Generators,
  getFullPrompt,
  getFullNegativePrompt,
} from '../../../src';
import { parseSimpleYaml } from '../../../src/parsers/helpers';

describe('SwarmUIParser', () => {
  const parser = new SwarmUIParser();
  const params = {
    sui_image_params: {
      prompt: 'a cat',
      negativeprompt: 'blurry',
      model: 'sdxl',
      seed: 1,
      steps: 20,
      cfgscale: 7,
      sampler: 'euler',
      scheduler: 'karras',
      width: 1024,
    },
    sui_models: [{ name: 'sdxl.safetensors', param: 'model', hash: '0xabc' }],
  };

  it('reads the parameters chunk and the UserComment', async () => {
    for (const parameters of [{ parameters: JSON.stringify(params) }, { UserComment: JSON.stringify(params) }]) {
      const result = await parser.parse(parameters);
      expect(result.generator).toBe(Generators.SWARMUI);
      const [sampler] = result.samplers;
      expect(sampler.name).toBe('euler');
      expect(sampler.parameters).toEqual({ seed: 1, steps: 20, cfg_scale: 7, scheduler: 'karras' });
      expect(sampler.model).toMatchObject({ name: 'sdxl', hash: '0xabc' });
      expect(getFullPrompt(result)).toBe('a cat');
      expect(getFullNegativePrompt(result)).toBe('blurry');
      expect(result.metadata).toMatchObject({ width: 1024 });
    }
  });

  it('rejects other JSON', async () => {
    await expect(parser.parse({ parameters: '{"prompt": "x"}' })).rejects.toThrow(ParserError);
  });
});

describe('RuinedFooocusParser', () => {
  it('reads the parameters', async () => {
    const result = await new RuinedFooocusParser().parse({
      parameters: JSON.stringify({
        Prompt: 'a cat\n',
        Negative: 'blurry',
        steps: 30,
        cfg: 8,
        seed: 2,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        base_model_name: 'model.safetensors',
        base_model_hash: null,
        denoise: null,
        software: 'RuinedFooocus',
      }),
    });
    expect(result.samplers[0]).toMatchObject({
      name: 'dpmpp_2m',
      parameters: { seed: 2, steps: 30, cfg_scale: 8, scheduler: 'karras' },
      model: { name: 'model.safetensors' },
    });
    expect(getFullPrompt(result)).toBe('a cat');
  });

  it('rejects Fooocus parameters', async () => {
    await expect(new RuinedFooocusParser().parse({ parameters: '{"prompt": "a"}' })).rejects.toThrow(ParserError);
  });
});

describe('HFSpaceParser', () => {
  it('reads the parameters', async () => {
    const result = await new HFSpaceParser().parse({
      parameters: JSON.stringify({
        prompt: 'a cat',
        negative_prompt: 'blurry',
        resolution: '1024 x 1024',
        guidance_scale: 5.5,
        num_inference_steps: 24,
        seed: 3,
        sampler: 'DPM++ 2M Karras',
        Model: 'Animagine',
        'Model hash': 'ABC',
        use_upscaler: null,
      }),
    });
    expect(result.samplers[0]).toMatchObject({
      name: 'DPM++ 2M Karras',
      parameters: { seed: 3, steps: 24, cfg_scale: 5.5 },
      model: { name: 'Animagine', hash: 'ABC' },
    });
    expect(result.metadata).toEqual({ resolution: '1024 x 1024' });
  });
});

describe('EasyDiffusionParser', () => {
  const parser = new EasyDiffusionParser();

  it('reads one text chunk per setting', async () => {
    const result = await parser.parse({
      prompt: 'a cat',
      negative_prompt: 'blurry',
      seed: '5',
      use_stable_diffusion_model: 'sd15',
      sampler_name: 'euler_a',
      num_inference_steps: '21',
      guidance_scale: '5.1',
      scheduler_name: 'None',
      clip_skip: 'False',
      use_lora_model: "['a', 'b']",
    });
    expect(result.samplers[0]).toMatchObject({
      name: 'euler_a',
      parameters: { seed: 5, steps: 21, cfg_scale: 5.1 },
      model: { name: 'sd15' },
    });
    expect(result.metadata).toEqual({ clip_skip: false, use_lora_model: ['a', 'b'] });
  });

  it('reads the JSON of JPEG and WEBP files', async () => {
    const result = await parser.parse({
      UserComment: JSON.stringify({ prompt: 'a cat', use_stable_diffusion_model: 'sd15', sampler_name: 'euler', seed: 1 }),
    });
    expect(getFullPrompt(result)).toBe('a cat');
  });
});

describe('DrawThingsParser', () => {
  it('reads the XMP UserComment', async () => {
    const result = await new DrawThingsParser().parse({
      CreatorTool: 'Draw Things',
      UserComment: JSON.stringify({ c: 'a cat', uc: '', sampler: 'LCM', scale: 1.4, seed: 7, steps: 8, model: 'animagine.ckpt', v2: {} }),
    });
    expect(result.generator).toBe(Generators.DRAWTHINGS);
    expect(result.samplers[0]).toMatchObject({ name: 'LCM', parameters: { cfg_scale: 1.4, seed: 7, steps: 8 }, model: { name: 'animagine.ckpt' } });
    expect(result.samplers[0].negativePrompts).toEqual([]);
    expect(result.metadata).toEqual({});
  });

  it('needs the Draw Things creator tool', async () => {
    await expect(new DrawThingsParser().parse({ UserComment: '{"c": "a"}' })).rejects.toThrow(ParserError);
  });
});

describe('DezgoParser', () => {
  const input = { prompt: 'a cat', model: 'hassaku', negative_prompt: '', guidance: 5, steps: 20, sampler: 'euler_a', seed: 9 };

  it('reads the GenInfo JSON of PNG files', async () => {
    const result = await new DezgoParser().parse({ GenInfo: JSON.stringify({ JobId: 'x', Function: 'text2image', Input: input }) });
    expect(result.samplers[0]).toMatchObject({ name: 'euler_a', parameters: { seed: 9, steps: 20, cfg_scale: 5 }, model: { name: 'hassaku' } });
    expect(result.metadata).toMatchObject({ job_id: 'x', function: 'text2image' });
  });

  it('reads the YAML of JPEG and WEBP files', async () => {
    const yaml = "\nJobId: x\nFunction: text2image\nInput:\n  prompt: >-\n    a cat,\n\n    sitting\n  negative_prompt: ''\n  steps: 20\n  sampler: ddim\n";
    const result = await new DezgoParser().parse({ UserComment: yaml });
    expect(getFullPrompt(result)).toBe('a cat,\nsitting');
    expect(result.samplers[0]).toMatchObject({ name: 'ddim', parameters: { steps: 20 } });
  });
});

describe('parseSimpleYaml', () => {
  it('reads nested mappings, scalars and block scalars', () => {
    expect(parseSimpleYaml("a: 1\nb: 'it''s'\nc:\n  d: true\n  e: |\n    x\n    y\nf: \"q\\n\"\n")).toEqual({
      a: 1,
      b: "it's",
      c: { d: true, e: 'x\ny\n' },
      f: 'q\n',
    });
  });
});

describe('KusArtParser', () => {
  it('reads the extra chunk', async () => {
    const result = await new KusArtParser().parse({
      Copyright: 'Generated by KusArt',
      extra: JSON.stringify({ prompt: 'a cat', negative_prompt: 'blurry', size: { width: 1024, height: 1024 }, task_type: 'text_to_image' }),
    });
    expect(getFullPrompt(result)).toBe('a cat');
    expect(getFullNegativePrompt(result)).toBe('blurry');
    expect(result.metadata).toEqual({ size: { width: 1024, height: 1024 }, task_type: 'text_to_image' });
  });

  it('needs the KusArt copyright notice', async () => {
    await expect(new KusArtParser().parse({ extra: '{"prompt": "a"}' })).rejects.toThrow(ParserError);
  });
});

describe('TensorArtParser', () => {
  it('reads generation_data and takes a random seed from the node graph', async () => {
    const result = await new TensorArtParser().parse({
      generation_data:
        JSON.stringify({
          prompt: 'a cat',
          negativePrompt: 'blurry',
          steps: 25,
          cfgScale: 7,
          seed: '-1',
          clipSkip: 2,
          ksamplerName: 'euler_ancestral',
          schedule: 'karras',
          baseModel: { modelFileName: 'WAI', hash: 'A5F5', modelId: '94', label: 'v16' },
        }) + '\u0000',
      prompt: JSON.stringify({ '1': { class_type: 'KSampler', inputs: { seed: 1234 } } }),
    });
    expect(result.samplers[0]).toMatchObject({
      name: 'euler_ancestral',
      parameters: { seed: 1234, steps: 25, cfg_scale: 7, scheduler: 'karras', clip_skip: 2 },
      model: { name: 'WAI', hash: 'A5F5', modelId: '94', metadata: { label: 'v16' } },
    });
  });
});

describe('StabilityMatrixParser', () => {
  it('reads parameters-json', async () => {
    const result = await new StabilityMatrixParser().parse({
      'parameters-json': JSON.stringify({
        PositivePrompt: 'a cat\r\n',
        NegativePrompt: 'blurry',
        Steps: 20,
        Sampler: 'Euler Ancestral Karras',
        CfgScale: 5,
        Seed: 3,
        Width: 1024,
        ModelName: 'model.safetensors',
        ModelHash: 'F116',
        FrameCount: 0,
        Lossless: false,
      }),
    });
    expect(result.samplers[0]).toMatchObject({
      name: 'Euler Ancestral Karras',
      parameters: { seed: 3, steps: 20, cfg_scale: 5 },
      model: { name: 'model.safetensors', hash: 'F116' },
    });
    expect(getFullPrompt(result)).toBe('a cat');
    expect(result.metadata).toEqual({ Width: 1024 });
  });
});

describe('CivitaiParser', () => {
  it('reads the extraMetadata of the node graph', async () => {
    const graph = {
      'resource-stack': { class_type: 'CheckpointLoaderSimple', inputs: { ckpt_name: 'urn:air:sdxl:checkpoint:civitai:1@2' } },
      extra: { airs: ['urn:air:sdxl:checkpoint:civitai:1@2'] },
      extraMetadata: JSON.stringify({
        prompt: 'a cat',
        negativePrompt: 'blurry',
        sampler: 'Euler a',
        cfgScale: 4.5,
        steps: 20,
        seed: 1,
        resources: [{ modelVersionId: 2, strength: 1, type: 'Checkpoint' }],
      }),
    };
    const result = await new CivitaiParser().parse({ UserComment: JSON.stringify(graph) });
    expect(result.samplers[0]).toMatchObject({
      name: 'Euler a',
      parameters: { seed: 1, steps: 20, cfg_scale: 4.5 },
      model: { name: 'urn:air:sdxl:checkpoint:civitai:1@2', metadata: { modelVersionId: 2 } },
    });
    expect(result.metadata.airs).toEqual(['urn:air:sdxl:checkpoint:civitai:1@2']);
  });
});
