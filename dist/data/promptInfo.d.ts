import { Generators } from './generators';
import { Model } from './model';
import { Prompt } from './prompt';
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
export declare function createPromptInfo(generator: Generators, samplers: Sampler[], metadata?: Record<string, any>, rawParameters?: Record<string, any>): PromptInfo;
/**
 * Gets the full prompt if present in the image metadata.
 * Otherwise, returns a simple concatenation of all prompts found in the generation data.
 *
 * Reproducibility of the source image using this data is not guaranteed (=rather unlikely).
 */
export declare function getFullPrompt(promptInfo: PromptInfo): string;
/**
 * Gets the full negative prompt if present in the image metadata.
 * Otherwise, returns a simple concatenation of all negative prompts found in the generation data.
 *
 * Reproducibility of the source image using this data is not guaranteed (=rather unlikely).
 */
export declare function getFullNegativePrompt(promptInfo: PromptInfo): string;
/**
 * Gets unique prompts used in generating the parsed image
 */
export declare function getPrompts(promptInfo: PromptInfo): Prompt[];
/**
 * Gets unique negative prompts used in generating the parsed image
 */
export declare function getNegativePrompts(promptInfo: PromptInfo): Prompt[];
/**
 * Gets unique models used in generating the parsed image
 */
export declare function getModels(promptInfo: PromptInfo): Model[];
/**
 * Converts PromptInfo to a dictionary representation
 */
export declare function promptInfoToDict(promptInfo: PromptInfo): Record<string, any>;
/**
 * Converts PromptInfo to JSON string
 */
export declare function promptInfoToJSON(promptInfo: PromptInfo): string;
//# sourceMappingURL=promptInfo.d.ts.map