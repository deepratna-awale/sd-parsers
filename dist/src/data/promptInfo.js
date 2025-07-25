"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPromptInfo = createPromptInfo;
exports.getFullPrompt = getFullPrompt;
exports.getFullNegativePrompt = getFullNegativePrompt;
exports.getPrompts = getPrompts;
exports.getNegativePrompts = getNegativePrompts;
exports.getModels = getModels;
exports.promptInfoToDict = promptInfoToDict;
exports.promptInfoToJSON = promptInfoToJSON;
const prompt_1 = require("./prompt");
/**
 * Creates a new PromptInfo instance
 */
function createPromptInfo(generator, samplers, metadata = {}, rawParameters = {}) {
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
function getFullPrompt(promptInfo) {
    if (promptInfo.metadata.full_prompt) {
        return promptInfo.metadata.full_prompt;
    }
    const prompts = getPrompts(promptInfo);
    return prompts.map(prompt_1.promptToString).join(', ');
}
/**
 * Gets the full negative prompt if present in the image metadata.
 * Otherwise, returns a simple concatenation of all negative prompts found in the generation data.
 *
 * Reproducibility of the source image using this data is not guaranteed (=rather unlikely).
 */
function getFullNegativePrompt(promptInfo) {
    if (promptInfo.metadata.full_negative_prompt) {
        return promptInfo.metadata.full_negative_prompt;
    }
    const negativePrompts = getNegativePrompts(promptInfo);
    return negativePrompts.map(prompt_1.promptToString).join(', ');
}
/**
 * Gets unique prompts used in generating the parsed image
 */
function getPrompts(promptInfo) {
    const uniquePrompts = new Set();
    const prompts = [];
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
function getNegativePrompts(promptInfo) {
    const uniquePrompts = new Set();
    const prompts = [];
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
function getModels(promptInfo) {
    const uniqueModels = new Set();
    const models = [];
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
function promptInfoToDict(promptInfo) {
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
function promptInfoToJSON(promptInfo) {
    return JSON.stringify(promptInfoToDict(promptInfo));
}
//# sourceMappingURL=promptInfo.js.map