import { FooocusParser, Generators, ParserError } from '../../../src';
import { createMockFooocusParameters } from '../../test-utils';

describe('FooocusParser', () => {
  const parser = new FooocusParser();

  it('has the correct generator', () => {
    expect(parser.generator).toBe(Generators.FOOOCUS);
  });

  it('parses the JSON parameters', async () => {
    const parameters = createMockFooocusParameters('a cat', 'blurry');
    const result = await parser.parse(parameters);

    const [sampler] = result.samplers;
    expect(sampler.name).toBe('dpmpp_2m_sde_gpu');
    expect(sampler.parameters).toEqual({ cfg_scale: 4, seed: 123456789, steps: 30 });
    expect(sampler.model).toMatchObject({ name: 'test_model', hash: 'abc123' });
    expect(sampler.prompts.map(p => p.value)).toEqual(['a cat']);
    expect(sampler.negativePrompts.map(p => p.value)).toEqual(['blurry']);
    expect(result.metadata).toEqual({ resolution: [512, 768] });
    expect(result.rawParameters).toBe(parameters);
  });

  it('accepts parameters without model hash or negative prompt', async () => {
    const result = await parser.parse({
      parameters: JSON.stringify({ base_model: 'model', sampler: 'euler', prompt: 'a cat' }),
    });

    expect(result.samplers[0].model).toMatchObject({ name: 'model', hash: undefined });
    expect(result.samplers[0].negativePrompts).toEqual([]);
  });

  it.each([
    ['missing parameters', {}],
    ['invalid JSON', { parameters: 'Steps: 20, Sampler: Euler' }],
    ['non-object JSON', { parameters: '[1, 2]' }],
    ['missing sampler', { parameters: JSON.stringify({ prompt: 'a cat' }) }],
    ['missing prompt', { parameters: JSON.stringify({ sampler: 'euler' }) }],
  ])('rejects %s', async (_name, parameters) => {
    await expect(parser.parse(parameters)).rejects.toThrow(ParserError);
  });
});
