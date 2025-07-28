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
export declare function createPrompt(value: string, options?: Partial<Pick<Prompt, 'promptId' | 'metadata'>>): Prompt;
/**
 * Returns string representation of the prompt
 */
export declare function promptToString(prompt: Prompt): string;
//# sourceMappingURL=prompt.d.ts.map