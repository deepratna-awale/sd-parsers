"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSampler = createSampler;
/**
 * Creates a new Sampler instance
 */
function createSampler(name, parameters = {}, options = {}) {
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
//# sourceMappingURL=sampler.js.map