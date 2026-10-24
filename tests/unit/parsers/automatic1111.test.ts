import { AUTOMATIC1111Parser, Generators, ParserError } from '../../../src';
import { createMockA1111Parameters } from '../../test-utils';

describe('AUTOMATIC1111Parser', () => {
  const parser = new AUTOMATIC1111Parser();

  it('has the correct generator', () => {
    expect(parser.generator).toBe(Generators.AUTOMATIC1111);
  });

  it('parses prompts, sampler, model and metadata', async () => {
    const result = await parser.parse(createMockA1111Parameters('a cat', 'blurry'));

    expect(result.generator).toBe(Generators.AUTOMATIC1111);
    expect(result.samplers).toHaveLength(1);

    const [sampler] = result.samplers;
    expect(sampler.name).toBe('Euler');
    expect(sampler.parameters).toEqual({ steps: '20', cfg_scale: '7', seed: '123456789' });
    expect(sampler.model).toMatchObject({ name: 'test_model', hash: 'abc123' });
    expect(sampler.prompts.map(p => p.value)).toEqual(['a cat']);
    expect(sampler.negativePrompts.map(p => p.value)).toEqual(['blurry']);
    expect(result.metadata).toEqual({ Size: '512x512' });
  });

  it('keeps multiline prompts and renames the schedule type', async () => {
    const result = await parser.parse({
      parameters:
        'line one\nline two\nNegative prompt: bad\nhands\n' +
        'Steps: 30, Sampler: DPM++ 2M, Schedule type: Karras, CFG scale: 8, Seed: 1, Denoising strength: 0.7, ' +
        'Hashes: {"model": "abc123"}',
    });

    const [sampler] = result.samplers;
    expect(sampler.prompts[0].value).toBe('line one\nline two');
    expect(sampler.negativePrompts[0].value).toBe('bad\nhands');
    expect(sampler.parameters).toEqual({ steps: '30', scheduler: 'Karras', cfg_scale: '8', seed: '1' });
    expect(result.metadata).toEqual({ 'Denoising strength': '0.7', Hashes: { model: 'abc123' } });
  });

  it('omits empty negative prompts', async () => {
    const result = await parser.parse({ parameters: 'a cat\nSteps: 20, Sampler: Euler, CFG scale: 7' });
    expect(result.samplers[0].negativePrompts).toEqual([]);
    expect(result.samplers[0].model).toBeUndefined();
  });

  it.each([
    ['missing parameters', {}],
    ['non-string parameters', { parameters: 123 }],
    ['prompt without sampler information', { parameters: 'just a prompt' }],
    ['sampler information without sampler', { parameters: 'prompt\nSteps: 20, CFG scale: 7, Seed: 1' }],
  ])('rejects %s', async (_name, parameters) => {
    await expect(parser.parse(parameters)).rejects.toThrow(ParserError);
  });
});
