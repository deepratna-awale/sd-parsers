import sharp from 'sharp';
import { createModel, createPrompt, createSampler, Generators } from '../src';

/**
 * Test utilities for creating mock data and test images
 */

/**
 * Creates a simple test PNG buffer
 */
export async function createTestPng(width = 100, height = 100, color = { r: 255, g: 255, b: 255 }): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  }).png().toBuffer();
}

/**
 * Creates a simple test JPEG buffer
 */
export async function createTestJpeg(width = 100, height = 100, color = { r: 255, g: 255, b: 255 }): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: color
    }
  }).jpeg().toBuffer();
}

/**
 * Creates mock PromptInfo for testing
 */
export function createMockPromptInfo(generator: Generators = Generators.AUTOMATIC1111) {
  return {
    generator,
    samplers: [
      createSampler('Euler', {
        steps: 20,
        cfg_scale: 7,
        seed: 123456789
      })
    ],
    metadata: {
      full_prompt: 'test prompt',
      full_negative_prompt: 'test negative prompt',
      models: [createModel({ name: 'test_model', hash: 'abc123' })]
    },
    rawParameters: {
      parameters: 'test prompt\nNegative prompt: test negative prompt\nSteps: 20, Sampler: Euler, CFG scale: 7'
    }
  };
}

/**
 * Creates mock AUTOMATIC1111 parameters
 */
export function createMockA1111Parameters(prompt = 'test prompt', negativePrompt = 'test negative') {
  return {
    parameters: `${prompt}
Negative prompt: ${negativePrompt}
Steps: 20, Sampler: Euler, CFG scale: 7, Seed: 123456789, Size: 512x512, Model: test_model, Model hash: abc123`
  };
}

/**
 * Creates mock Fooocus parameters
 */
export function createMockFooocusParameters(prompt = 'test prompt', negativePrompt = 'test negative') {
  return {
    parameters: JSON.stringify({
      base_model: 'test_model',
      base_model_hash: 'abc123',
      sampler: 'dpmpp_2m_sde_gpu',
      cfg_scale: 4,
      steps: 30,
      full_prompt: prompt,
      full_negative_prompt: negativePrompt,
      seed: 123456789,
      resolution: [512, 768]
    })
  };
}

/**
 * Creates mock ComfyUI workflow parameters
 */
export function createMockComfyUIParameters() {
  return {
    prompt: JSON.stringify({
      "1": {
        "class_type": "KSampler",
        "inputs": {
          "sampler_name": "euler",
          "steps": 20,
          "cfg": 7.5,
          "seed": 123456789
        }
      },
      "2": {
        "class_type": "CLIPTextEncode",
        "inputs": {
          "text": "test prompt"
        }
      }
    }),
    workflow: JSON.stringify({
      links: [],
      nodes: []
    })
  };
}

/**
 * Assertion helpers for common test patterns
 */
export const testHelpers = {
  /**
   * Asserts that a PromptInfo object has the expected basic structure
   */
  assertValidPromptInfo(promptInfo: any, expectedGenerator: Generators) {
    expect(promptInfo).toBeDefined();
    expect(promptInfo.generator).toBe(expectedGenerator);
    expect(promptInfo.samplers).toBeDefined();
    expect(Array.isArray(promptInfo.samplers)).toBe(true);
    expect(promptInfo.metadata).toBeDefined();
    expect(promptInfo.rawParameters).toBeDefined();
  },

  /**
   * Asserts that a sampler has the expected basic structure
   */
  assertValidSampler(sampler: any, expectedName?: string) {
    expect(sampler).toBeDefined();
    expect(sampler.name).toBeDefined();
    expect(sampler.parameters).toBeDefined();
    expect(typeof sampler.parameters).toBe('object');
    
    if (expectedName) {
      expect(sampler.name).toBe(expectedName);
    }
  },

  /**
   * Asserts that a model has the expected basic structure
   */
  assertValidModel(model: any, expectedName?: string, expectedHash?: string) {
    expect(model).toBeDefined();
    expect(model.metadata).toBeDefined();
    
    if (expectedName) {
      expect(model.name).toBe(expectedName);
    }
    
    if (expectedHash) {
      expect(model.hash).toBe(expectedHash);
    }
  }
};
