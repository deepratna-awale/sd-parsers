/**
 * Represents an image generation prompt
 */
export interface Prompt {
  /** The value of the prompt */
  value: string;
  
  /** Prompt id */
  promptId?: string;
  
  /** Additional generator-specific information. Highly dependent on the respective image generator. */
  metadata: Record<string, any>;
}

/**
 * Creates a new Prompt instance
 */
export function createPrompt(value: string, options: Partial<Pick<Prompt, 'promptId' | 'metadata'>> = {}): Prompt {
  const { promptId, metadata = {} } = options;
  
  return {
    value,
    promptId,
    metadata
  };
}

/**
 * Returns string representation of the prompt
 */
export function promptToString(prompt: Prompt): string {
  return prompt.value;
}
