import { NovelAIParser, Generators, ParserError } from '../../../src';

const PARAMETERS = {
  Title: 'AI generated image',
  Description: ' a cat ',
  Software: 'NovelAI',
  Source: 'Stable Diffusion 1D44365E',
  Comment: JSON.stringify({ steps: 28, sampler: 'k_euler', seed: 1, strength: 0.7, noise: 0, scale: 11, uc: 'blurry' }),
};

describe('NovelAIParser', () => {
  const parser = new NovelAIParser();

  it('has the correct generator', () => {
    expect(parser.generator).toBe(Generators.NOVELAI);
  });

  it('parses the image metadata', async () => {
    const result = await parser.parse(PARAMETERS);

    const [sampler] = result.samplers;
    expect(sampler.name).toBe('k_euler');
    expect(sampler.parameters).toEqual({ seed: 1, strength: 0.7, noise: 0, cfg_scale: 11 });
    expect(sampler.model).toMatchObject({ name: 'Stable Diffusion', hash: '1D44365E' });
    expect(sampler.prompts.map(p => p.value)).toEqual(['a cat']);
    expect(sampler.negativePrompts.map(p => p.value)).toEqual(['blurry']);
    expect(result.metadata).toEqual({ steps: 28 });
  });

  it.each([
    ['missing Comment', { ...PARAMETERS, Comment: undefined }],
    ['invalid Comment', { ...PARAMETERS, Comment: 'not json' }],
    ['missing Source', { Description: 'a cat', Comment: PARAMETERS.Comment }],
    ['missing sampler', { ...PARAMETERS, Comment: '{"seed": 1}' }],
  ])('rejects %s', async (_name, parameters) => {
    await expect(parser.parse(parameters)).rejects.toThrow(ParserError);
  });
});
