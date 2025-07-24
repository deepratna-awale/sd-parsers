import { 
  Generators, 
  Eagerness,
  createModel,
  createPrompt,
  createSampler,
  modelToString,
  promptToString,
  getFullPrompt,
  getFullNegativePrompt,
  getModels
} from '../../../src';

describe('Data Types', () => {
  describe('Enums', () => {
    it('should have correct generator enum values', () => {
      expect(Generators.AUTOMATIC1111).toBe('AUTOMATIC1111');
      expect(Generators.FOOOCUS).toBe('Fooocus');
      expect(Generators.COMFYUI).toBe('ComfyUI');
      expect(Generators.INVOKEAI).toBe('InvokeAI');
      expect(Generators.NOVELAI).toBe('NovelAI');
    });

    it('should have correct eagerness enum values', () => {
      expect(Eagerness.FAST).toBe(1);
      expect(Eagerness.DEFAULT).toBe(2);
      expect(Eagerness.EAGER).toBe(3);
    });
  });

  describe('Model functions', () => {
    it('should create model with name only', () => {
      const model = createModel({ name: 'test_model' });
      expect(model.name).toBe('test_model');
      expect(model.hash).toBeUndefined();
    });

    it('should create model with name and hash', () => {
      const model = createModel({ name: 'test_model', hash: 'abc123' });
      expect(model.name).toBe('test_model');
      expect(model.hash).toBe('abc123');
    });

    it('should convert model to string correctly', () => {
      const model = createModel({ name: 'test_model', hash: 'abc123' });
      const str = modelToString(model);
      expect(str).toBe('test_model (abc123)');
    });

    it('should convert model without hash to string', () => {
      const model = createModel({ name: 'test_model' });
      const str = modelToString(model);
      expect(str).toBe('test_model');
    });

    it('should throw error when neither name nor hash provided', () => {
      expect(() => createModel({})).toThrow('Either name or hash need to be given.');
    });
  });

  describe('Prompt functions', () => {
    it('should create prompt with value only', () => {
      const prompt = createPrompt('test prompt');
      expect(prompt.value).toBe('test prompt');
      expect(prompt.metadata).toEqual({});
    });

    it('should create prompt with metadata', () => {
      const prompt = createPrompt('test prompt', { promptId: '123', metadata: { weight: 1.2 } });
      expect(prompt.value).toBe('test prompt');
      expect(prompt.promptId).toBe('123');
      expect(prompt.metadata.weight).toBe(1.2);
    });

    it('should convert prompt to string', () => {
      const prompt = createPrompt('test prompt');
      const str = promptToString(prompt);
      expect(str).toBe('test prompt');
    });
  });

  describe('Sampler functions', () => {
    it('should create sampler with name only', () => {
      const sampler = createSampler('Euler');
      expect(sampler.name).toBe('Euler');
      expect(sampler.parameters).toEqual({});
    });

    it('should create sampler with parameters', () => {
      const params = { steps: 20, cfg_scale: 7 };
      const sampler = createSampler('Euler', params);
      expect(sampler.name).toBe('Euler');
      expect(sampler.parameters).toEqual(params);
    });
  });

  describe('Helper functions', () => {
    const mockPromptInfo = {
      generator: Generators.AUTOMATIC1111,
      samplers: [createSampler('Euler', { steps: 20 })],
      metadata: {
        full_prompt: 'positive prompt',
        full_negative_prompt: 'negative prompt'
      },
      rawParameters: {}
    };

    it('should get full prompt from metadata', () => {
      const prompt = getFullPrompt(mockPromptInfo);
      expect(prompt).toBe('positive prompt');
    });

    it('should get full negative prompt from metadata', () => {
      const negativePrompt = getFullNegativePrompt(mockPromptInfo);
      expect(negativePrompt).toBe('negative prompt');
    });

    it('should get models from metadata', () => {
      const testModel = createModel({ name: 'test_model', hash: 'abc123' });
      const samplerWithModel = createSampler('Euler', { steps: 20 }, { model: testModel });
      const promptInfoWithModels = {
        ...mockPromptInfo,
        samplers: [samplerWithModel]
      };
      
      const models = getModels(promptInfoWithModels);
      expect(models).toHaveLength(1);
      expect(models[0].name).toBe('test_model');
    });

    it('should handle empty metadata', () => {
      const emptyPromptInfo = {
        generator: Generators.AUTOMATIC1111,
        samplers: [],
        metadata: {},
        rawParameters: {}
      };
      
      const prompt = getFullPrompt(emptyPromptInfo);
      const negativePrompt = getFullNegativePrompt(emptyPromptInfo);
      
      expect(prompt).toBe('');
      expect(negativePrompt).toBe('');
    });
  });
});
