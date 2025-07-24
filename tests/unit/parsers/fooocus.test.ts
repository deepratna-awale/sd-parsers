import { FooocusParser } from '../../../src/parsers/fooocus';
import { Generators } from '../../../src/data';

describe('FooocusParser', () => {
  let parser: FooocusParser;

  beforeEach(() => {
    parser = new FooocusParser();
  });

  describe('Basic functionality', () => {
    it('should have correct generator', () => {
      expect(parser.generator).toBe(Generators.FOOOCUS);
    });

    it('should be an instance of FooocusParser', () => {
      expect(parser).toBeInstanceOf(FooocusParser);
    });
  });

  describe('JSON parameter parsing', () => {
    it('should parse JSON parameters', async () => {
      const parameters = {
        parameters: JSON.stringify({
          base_model: 'test_model',
          base_model_hash: 'hash123',
          sampler: 'DPM++ 2M',
          guidance_scale: 7.5,
          steps: 30,
          prompt: 'beautiful artwork',
          negative_prompt: 'ugly, distorted'
        })
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.FOOOCUS);
      expect(result.samplers).toHaveLength(1);
      
      const sampler = result.samplers[0];
      expect(sampler.name).toBe('DPM++ 2M');
      expect(sampler.parameters.cfg_scale).toBe(7.5);
      expect(sampler.model?.name).toBe('test_model');
      expect(sampler.prompts[0].value).toBe('beautiful artwork');
      expect(sampler.negativePrompts[0].value).toBe('ugly, distorted');
    });

    it('should parse parameters with full prompts', async () => {
      const parameters = {
        parameters: JSON.stringify({
          base_model: 'realismEngineSDXL_v30VAE',
          full_prompt: 'masterpiece, best quality, detailed artwork',
          full_negative_prompt: 'worst quality, low quality, blurry',
          sampler: 'dpmpp_2m_sde_gpu',
          scheduler: 'karras',
          steps: 25,
          cfg_scale: 4.5,
          seed: 123456789,
          resolution: [1024, 1024]
        })
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.metadata.full_prompt).toBe('masterpiece, best quality, detailed artwork');
      expect(result.metadata.full_negative_prompt).toBe('worst quality, low quality, blurry');
      expect(result.samplers[0].parameters.cfg_scale).toBe(4.5);
      expect(result.samplers[0].parameters.steps).toBe(25);
    });

    it('should handle Fooocus-specific parameters', async () => {
      const parameters = {
        parameters: JSON.stringify({
          base_model: 'model_name',
          refiner_model: 'refiner_name',
          refiner_switch: 0.8,
          loras: [
            ['lora1', 0.5],
            ['lora2', 1.0]
          ],
          styles: ['Fooocus V2', 'Fooocus Enhance'],
          performance: 'Speed',
          version: 'Fooocus v2.4.0'
        })
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.metadata.refiner_model).toBe('refiner_name');
      expect(result.metadata.refiner_switch).toBe(0.8);
      expect(result.metadata.loras).toEqual([['lora1', 0.5], ['lora2', 1.0]]);
      expect(result.metadata.styles).toEqual(['Fooocus V2', 'Fooocus Enhance']);
      expect(result.metadata.performance).toBe('Speed');
      expect(result.metadata.version).toBe('Fooocus v2.4.0');
    });
  });

  describe('Error handling', () => {
    it('should throw error when parameters field is missing', async () => {
      const parameters = {};
      
      await expect(parser.parse(parameters)).rejects.toThrow('parameters field is missing');
    });

    it('should throw error when parameters is not valid JSON', async () => {
      const parameters = {
        parameters: 'invalid json string'
      };
      
      await expect(parser.parse(parameters)).rejects.toThrow('Error decoding parameter data');
    });

    it('should throw error when parameters is not a string', async () => {
      const parameters = {
        parameters: { not: 'a string' }
      };
      
      await expect(parser.parse(parameters)).rejects.toThrow('parameters field is missing');
    });
  });

  describe('Edge cases', () => {
    it('should handle minimal JSON parameters', async () => {
      const parameters = {
        parameters: JSON.stringify({
          base_model: 'minimal_model'
        })
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.FOOOCUS);
      expect(result.samplers).toHaveLength(1);
      expect(result.samplers[0].model?.name).toBe('minimal_model');
    });

    it('should handle empty JSON object', async () => {
      const parameters = {
        parameters: JSON.stringify({})
      };

      const result = await parser.parse(parameters);
      
      expect(result).toBeDefined();
      expect(result.generator).toBe(Generators.FOOOCUS);
    });
  });
});
