import { InvokeAIParser } from '../../../src/parsers/invokeai';
import { Generators } from '../../../src/data';

describe('InvokeAIParser', () => {
  let parser: InvokeAIParser;

  beforeEach(() => {
    parser = new InvokeAIParser();
  });

  describe('Basic functionality', () => {
    it('should have correct generator', () => {
      expect(parser.generator).toBe(Generators.INVOKEAI);
    });

    it('should be an instance of InvokeAIParser', () => {
      expect(parser).toBeInstanceOf(InvokeAIParser);
    });
  });

  describe('Format parsing', () => {
    it('should parse sd-metadata format', async () => {
      const parameters = {
        'sd-metadata': JSON.stringify({
          model: {
            model_name: 'test_model',
            model_hash: 'abc123'
          },
          image: {
            sampler: 'k_euler_a',
            steps: 20,
            cfg_scale: 7.5,
            width: 512,
            height: 768
          }
        })
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.INVOKEAI);
      expect(result.samplers).toHaveLength(1);
      
      const sampler = result.samplers[0];
      expect(sampler.name).toBe('k_euler_a');
      expect(sampler.parameters.steps).toBe(20);
      expect(sampler.parameters.cfg_scale).toBe(7.5);
    });

    it('should parse Dream format', async () => {
      const parameters = {
        Dream: 'beautiful landscape -s 20 -S 123456789 -W 512 -H 768 -C 7.5 -A k_euler_a'
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.INVOKEAI);
      expect(result.samplers).toHaveLength(1);
      
      const sampler = result.samplers[0];
      expect(sampler.name).toBe('k_euler_a');
      expect(sampler.parameters.steps).toBe('20');
      expect(sampler.parameters.cfg_scale).toBe('7.5');
    });
  });

  describe('Error handling', () => {
    it('should throw error when no supported format found', async () => {
      const parameters = {
        unsupported: 'data'
      };
      
      await expect(parser.parse(parameters)).rejects.toThrow('No supported InvokeAI metadata format found');
    });
  });
});
