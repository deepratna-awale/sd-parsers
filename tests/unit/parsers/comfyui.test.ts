import { ComfyUIParser } from '../../../src/parsers/comfyui';
import { Generators } from '../../../src/data';

describe('ComfyUIParser', () => {
  let parser: ComfyUIParser;

  beforeEach(() => {
    parser = new ComfyUIParser();
  });

  describe('Basic functionality', () => {
    it('should have correct generator', () => {
      expect(parser.generator).toBe(Generators.COMFYUI);
    });

    it('should be an instance of ComfyUIParser', () => {
      expect(parser).toBeInstanceOf(ComfyUIParser);
    });
  });

  describe('Workflow parsing', () => {
    it('should parse basic ComfyUI parameters', async () => {
      const parameters = {
        prompt: JSON.stringify({
          "1": {
            "class_type": "KSampler",
            "inputs": {
              "sampler_name": "euler",
              "steps": 20,
              "cfg": 7.5
            }
          }
        }),
        workflow: JSON.stringify({
          links: []
        })
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.COMFYUI);
      expect(result.samplers).toHaveLength(1);
      
      const sampler = result.samplers[0];
      expect(sampler.name).toBe('euler');
      expect(sampler.parameters.steps).toBe(20);
      expect(sampler.parameters.cfg).toBe(7.5);
    });

    it('should handle missing workflow', async () => {
      const parameters = {
        prompt: JSON.stringify({
          "1": {
            "class_type": "KSampler",
            "inputs": {
              "sampler_name": "dpmpp_2m",
              "steps": 25
            }
          }
        })
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.COMFYUI);
    });
  });

  describe('Error handling', () => {
    it('should throw error when prompt field is missing', async () => {
      const parameters = {};
      
      await expect(parser.parse(parameters)).rejects.toThrow();
    });

    it('should throw error when prompt is not valid JSON', async () => {
      const parameters = {
        prompt: 'invalid json'
      };
      
      await expect(parser.parse(parameters)).rejects.toThrow();
    });
  });
});
