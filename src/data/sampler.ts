import { Model } from './model';
import { Prompt } from './prompt';

/**
 * Represents a sampler used during image generation
 */
export interface Sampler {
  /** The name of the sampler */
  name: string;
  
  /** Generation parameters, including cfg_scale, seed, steps and others */
  parameters: Record<string, any>;
  
  /** A unique id for this sampler (if present in the metadata) */
  samplerId?: string;
  
  /** The checkpoint model used */
  model?: Model;
  
  /** Positive prompts used by this sampler */
  prompts: Prompt[];
  
  /** Negative prompts used by this sampler */
  negativePrompts: Prompt[];
}

/**
 * Creates a new Sampler instance
 */
export function createSampler(
  name: string,
  parameters: Record<string, any> = {},
  options: Partial<Pick<Sampler, 'samplerId' | 'model' | 'prompts' | 'negativePrompts'>> = {}
): Sampler {
  const { samplerId, model, prompts = [], negativePrompts = [] } = options;
  
  return {
    name,
    parameters,
    samplerId,
    model,
    prompts,
    negativePrompts
  };
}
