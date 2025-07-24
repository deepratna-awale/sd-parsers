/**
 * Represents a checkpoint model used during image generation
 */
export interface Model {
  /** Name of the checkpoint model (if found) */
  name?: string;
  
  /** Hash value of the checkpoint model (if found) */
  hash?: string;
  
  /** Model id */
  modelId?: string;
  
  /** Additional generator-specific information. Highly dependent on the respective image generator. */
  metadata: Record<string, any>;
}

/**
 * Creates a new Model instance
 */
export function createModel(options: Partial<Model> & { name?: string; hash?: string }): Model {
  const { name, hash, modelId, metadata = {} } = options;
  
  if (!name && !hash) {
    throw new Error('Either name or hash need to be given.');
  }
  
  return {
    name,
    hash,
    modelId,
    metadata
  };
}

/**
 * Returns string representation of the model
 */
export function modelToString(model: Model): string {
  if (model.name && model.hash) {
    return `${model.name} (${model.hash})`;
  }
  return model.name || model.hash || '';
}
