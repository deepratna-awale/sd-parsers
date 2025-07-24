import { AUTOMATIC1111Parser } from '../../../src/parsers/automatic1111';
import { Generators } from '../../../src/data';

describe('AUTOMATIC1111Parser', () => {
  let parser: AUTOMATIC1111Parser;

  beforeEach(() => {
    parser = new AUTOMATIC1111Parser();
  });

  describe('Basic functionality', () => {
    it('should have correct generator', () => {
      expect(parser.generator).toBe(Generators.AUTOMATIC1111);
    });

    it('should be an instance of AUTOMATIC1111Parser', () => {
      expect(parser).toBeInstanceOf(AUTOMATIC1111Parser);
    });
  });

  describe('Parameter parsing', () => {
    it('should parse parameters with prompt and negative prompt', async () => {
      const parameters = {
        parameters: `a beautiful landscape
Negative prompt: blur, low quality
Steps: 20, Sampler: Euler, CFG scale: 7, Seed: 123456789, Size: 512x512, Model: model_name, Model hash: abc123`
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.AUTOMATIC1111);
      expect(result.samplers).toHaveLength(1);
      
      const sampler = result.samplers[0];
      expect(sampler.name).toBe('Euler');
      expect(sampler.parameters.steps).toBe('20');
      expect(sampler.parameters.cfg_scale).toBe('7');
      expect(sampler.prompts).toHaveLength(1);
      expect(sampler.prompts[0].value).toBe('a beautiful landscape');
      expect(sampler.negativePrompts).toHaveLength(1);
      expect(sampler.negativePrompts[0].value).toBe('blur, low quality');
    });

    it('should parse parameters without negative prompt', async () => {
      const parameters = {
        parameters: `a beautiful landscape
Steps: 20, Sampler: Euler a, CFG scale: 7.5`
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.AUTOMATIC1111);
      expect(result.samplers).toHaveLength(1);
      
      const sampler = result.samplers[0];
      expect(sampler.name).toBe('Euler a');
      expect(sampler.prompts).toHaveLength(1);
      expect(sampler.prompts[0].value).toBe('a beautiful landscape');
      expect(sampler.negativePrompts).toHaveLength(0);
    });

    it('should parse complex parameters with multiple fields', async () => {
      const parameters = {
        parameters: `masterpiece, best quality, 1girl, anime
Negative prompt: (worst quality, low quality:1.4), blurry
Steps: 30, Sampler: DPM++ 2M Karras, CFG scale: 8, Seed: 987654321, Size: 768x1024, Model hash: def456, Model: animeMix_v1, Denoising strength: 0.7, Clip skip: 2, ENSD: 31337`
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.samplers).toHaveLength(1);
      
      const sampler = result.samplers[0];
      expect(sampler.name).toBe('DPM++ 2M Karras');
      expect(sampler.parameters.steps).toBe('30');
      expect(sampler.parameters.cfg_scale).toBe('8');
      expect(sampler.parameters.seed).toBe('987654321');
      expect(sampler.parameters.denoising_strength).toBe('0.7');
      expect(sampler.parameters.clip_skip).toBe('2');
    });
  });

  describe('Error handling', () => {
    it('should throw error when parameters field is missing', async () => {
      const parameters = {};
      
      await expect(parser.parse(parameters)).rejects.toThrow('parameters field is missing or not a string');
    });

    it('should throw error when parameters field is not a string', async () => {
      const parameters = {
        parameters: 123
      };
      
      await expect(parser.parse(parameters)).rejects.toThrow('parameters field is missing or not a string');
    });

    it('should handle empty parameters string', async () => {
      const parameters = {
        parameters: ''
      };
      
      await expect(parser.parse(parameters)).rejects.toThrow();
    });
  });

  describe('Edge cases', () => {
    it('should handle parameters with only prompt', async () => {
      const parameters = {
        parameters: 'simple prompt'
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.samplers).toHaveLength(1);
      expect(result.samplers[0].prompts[0].value).toBe('simple prompt');
    });

    it('should handle multiline prompts', async () => {
      const parameters = {
        parameters: `first line of prompt,
second line of prompt,
third line
Negative prompt: negative content
Steps: 20, Sampler: Euler`
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      const prompt = result.samplers[0].prompts[0].value;
      expect(prompt).toContain('first line of prompt');
      expect(prompt).toContain('second line of prompt');
      expect(prompt).toContain('third line');
    });
  });
});
