import { Parser } from './parser';
import { Generators, createPromptInfo, createSampler, PromptInfo } from '../data';

/**
 * Example stub for additional parsers
 */
export class DummyParser extends Parser {
  public readonly generator = Generators.UNKNOWN;

  async parse(parameters: Record<string, any>): Promise<PromptInfo> {
    // Create a dummy sampler with the provided parameters
    const sampler = createSampler('dummy_sampler', {});
    
    // Return basic prompt info with the dummy sampler
    return createPromptInfo(this.generator, [sampler], { 'some other': 'metadata' }, parameters);
  }
}
