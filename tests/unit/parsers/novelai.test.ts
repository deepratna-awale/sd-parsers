import { NovelAIParser } from '../../../src/parsers/novelai';
import { Generators } from '../../../src/data';

describe('NovelAIParser', () => {
  let parser: NovelAIParser;

  beforeEach(() => {
    parser = new NovelAIParser();
  });

  describe('Basic functionality', () => {
    it('should have correct generator', () => {
      expect(parser.generator).toBe(Generators.NOVELAI);
    });

    it('should be an instance of NovelAIParser', () => {
      expect(parser).toBeInstanceOf(NovelAIParser);
    });
  });

  describe('Parameter parsing', () => {
    it('should parse NovelAI parameters', async () => {
      const parameters = {
        parameters: JSON.stringify({
          prompt: 'anime artwork, detailed',
          steps: 28,
          scale: 12,
          sampler: 'k_euler_ancestral',
          width: 832,
          height: 1216,
          seed: 987654321
        })
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.NOVELAI);
      expect(result.samplers).toHaveLength(1);
      
      const sampler = result.samplers[0];
      expect(sampler.name).toBe('k_euler_ancestral');
      expect(sampler.parameters.steps).toBe(28);
      expect(sampler.parameters.scale).toBe(12);
      expect(sampler.prompts[0].value).toBe('anime artwork, detailed');
    });
  });

  describe('Error handling', () => {
    it('should throw error when parameters field is missing', async () => {
      const parameters = {};
      
      await expect(parser.parse(parameters)).rejects.toThrow();
    });

    it('should throw error when parameters is not valid JSON', async () => {
      const parameters = {
        parameters: 'invalid json'
      };
      
      await expect(parser.parse(parameters)).rejects.toThrow('Error reading parameter values');
    });
  });
});
