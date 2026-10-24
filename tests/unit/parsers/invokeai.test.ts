import { InvokeAIParser, Generators, ParserError } from '../../../src';

describe('InvokeAIParser', () => {
  const parser = new InvokeAIParser();

  it('has the correct generator', () => {
    expect(parser.generator).toBe(Generators.INVOKEAI);
  });

  it('parses the invokeai_metadata format', async () => {
    const result = await parser.parse({
      invokeai_metadata: JSON.stringify({
        positive_prompt: 'a cat',
        negative_prompt: '',
        scheduler: 'euler',
        cfg_scale: 7,
        steps: 30,
        seed: 1,
        width: 512,
        model: { model_name: 'sdxl', base_model: 'sdxl' },
      }),
    });

    const [sampler] = result.samplers;
    expect(sampler.name).toBe('euler');
    expect(sampler.parameters).toEqual({ cfg_scale: 7, steps: 30, seed: 1 });
    expect(sampler.model).toMatchObject({ name: 'sdxl', metadata: { base_model: 'sdxl' } });
    expect(sampler.prompts.map(p => p.value)).toEqual(['a cat']);
    expect(sampler.negativePrompts).toEqual([]);
    expect(result.metadata).toEqual({ width: 512 });
  });

  it('parses the legacy Dream format', async () => {
    const result = await parser.parse({ Dream: '"a cat [blurry] on a mat" -s 50 -S 42 -W 512 -H 768 -C 7.5 -A k_lms -x y' });

    const [sampler] = result.samplers;
    expect(sampler.name).toBe('k_lms');
    expect(sampler.parameters).toEqual({ steps: 50, seed: 42, cfg_scale: 7.5 });
    expect(sampler.prompts.map(p => [p.promptId, p.value])).toEqual([
      ['1', 'a cat'],
      ['2', 'on a mat'],
    ]);
    expect(sampler.negativePrompts.map(p => [p.promptId, p.value])).toEqual([['1', 'blurry']]);
    expect(result.metadata).toEqual({ width: 512, height: 768, x: 'y' });
  });

  it('prefers sd-metadata over Dream', async () => {
    const result = await parser.parse({
      Dream: '"ignored" -A k_lms',
      'sd-metadata': JSON.stringify({
        model_weights: 'stable-diffusion-1.5',
        model_hash: 'abc',
        app_version: '2.0',
        image: { prompt: [{ prompt: 'a cat [blurry]', weight: 1 }], sampler: 'k_euler', steps: 20, width: 512 },
      }),
    });

    const [sampler] = result.samplers;
    expect(sampler.name).toBe('k_euler');
    expect(sampler.model).toMatchObject({ name: 'stable-diffusion-1.5', hash: 'abc' });
    expect(sampler.prompts).toEqual([{ value: 'a cat', promptId: '1', metadata: { weight: 1 } }]);
    expect(sampler.negativePrompts).toEqual([{ value: 'blurry', promptId: '1', metadata: { weight: 1 } }]);
    expect(result.metadata).toEqual({ app_version: '2.0', width: 512 });
    expect(Object.keys(result.rawParameters)).toEqual(['sd-metadata']);
  });

  it.each([
    ['no supported format', { parameters: 'something' }],
    ['invalid invokeai_metadata', { invokeai_metadata: 'not json' }],
    ['Dream without quoted prompt', { Dream: 'a cat -s 50' }],
    ['Dream without sampler', { Dream: '"a cat" -s 50' }],
    ['sd-metadata without image', { 'sd-metadata': '{}' }],
  ])('rejects %s', async (_name, parameters) => {
    await expect(parser.parse(parameters)).rejects.toThrow(ParserError);
  });
});
