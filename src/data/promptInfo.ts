import { Generators } from './generators';
import { Model } from './model';
import { Prompt, promptToString } from './prompt';
import { Sampler } from './sampler';

/**
 * Contains structured image generation parameters
 */
export interface PromptInfo {
  /** Image generator which might have produced the parsed image */
  generator: Generators;
  
  /** Samplers used in generating the parsed image */
  samplers: Sampler[];
  
  /** Additional parameters which are found in the image metadata. Highly dependent on the respective image generator. */
  metadata: Record<string, any>;
  
  /** Unprocessed parameters as found in the parsed image */
  rawParameters: Record<string, any>;
}

/**
 * Creates a new PromptInfo instance
 */
export function createPromptInfo(
  generator: Generators,
  samplers: Sampler[],
  metadata: Record<string, any> = {},
  rawParameters: Record<string, any> = {}
): PromptInfo {
  return {
    generator,
    samplers,
    metadata,
    rawParameters
  };
}

/**
 * Gets the full prompt if present in the image metadata.
 * Otherwise, returns a simple concatenation of all prompts found in the generation data.
 * 
 * Reproducibility of the source image using this data is not guaranteed (=rather unlikely).
 */
export function getFullPrompt(promptInfo: PromptInfo): string {
  if (promptInfo.metadata.full_prompt) {
    return promptInfo.metadata.full_prompt;
  }
  
  const prompts = getPrompts(promptInfo);
  return prompts.map(promptToString).join(', ');
}

/**
 * Gets the full negative prompt if present in the image metadata.
 * Otherwise, returns a simple concatenation of all negative prompts found in the generation data.
 * 
 * Reproducibility of the source image using this data is not guaranteed (=rather unlikely).
 */
export function getFullNegativePrompt(promptInfo: PromptInfo): string {
  if (promptInfo.metadata.full_negative_prompt) {
    return promptInfo.metadata.full_negative_prompt;
  }
  
  const negativePrompts = getNegativePrompts(promptInfo);
  return negativePrompts.map(promptToString).join(', ');
}

/**
 * Gets unique prompts used in generating the parsed image
 */
export function getPrompts(promptInfo: PromptInfo): Prompt[] {
  const uniquePrompts = new Set<string>();
  const prompts: Prompt[] = [];
  
  for (const sampler of promptInfo.samplers) {
    for (const prompt of sampler.prompts) {
      const promptKey = `${prompt.promptId || ''}:${prompt.value}`;
      if (!uniquePrompts.has(promptKey)) {
        uniquePrompts.add(promptKey);
        prompts.push(prompt);
      }
    }
  }
  
  return prompts;
}

/**
 * Gets unique negative prompts used in generating the parsed image
 */
export function getNegativePrompts(promptInfo: PromptInfo): Prompt[] {
  const uniquePrompts = new Set<string>();
  const prompts: Prompt[] = [];
  
  for (const sampler of promptInfo.samplers) {
    for (const prompt of sampler.negativePrompts) {
      const promptKey = `${prompt.promptId || ''}:${prompt.value}`;
      if (!uniquePrompts.has(promptKey)) {
        uniquePrompts.add(promptKey);
        prompts.push(prompt);
      }
    }
  }
  
  return prompts;
}

/**
 * Gets unique models used in generating the parsed image
 */
export function getModels(promptInfo: PromptInfo): Model[] {
  const uniqueModels = new Set<string>();
  const models: Model[] = [];
  
  for (const sampler of promptInfo.samplers) {
    if (sampler.model) {
      const modelKey = `${sampler.model.modelId || ''}:${sampler.model.name || ''}:${sampler.model.hash || ''}`;
      if (!uniqueModels.has(modelKey)) {
        uniqueModels.add(modelKey);
        models.push(sampler.model);
      }
    }
  }
  
  return models;
}

/**
 * Converts PromptInfo to a dictionary representation
 */
export function promptInfoToDict(promptInfo: PromptInfo): Record<string, any> {
  return {
    full_prompt: getFullPrompt(promptInfo),
    full_negative_prompt: getFullNegativePrompt(promptInfo),
    generator: promptInfo.generator,
    samplers: promptInfo.samplers,
    metadata: promptInfo.metadata,
    rawParameters: promptInfo.rawParameters
  };
}

/**
 * Converts PromptInfo to JSON string
 */
export function promptInfoToJSON(promptInfo: PromptInfo): string {
  return JSON.stringify(promptInfoToDict(promptInfo));
}
