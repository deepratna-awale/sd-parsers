"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createModel = createModel;
exports.modelToString = modelToString;
/**
 * Creates a new Model instance
 */
function createModel(options) {
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
function modelToString(model) {
    if (model.name && model.hash) {
        return `${model.name} (${model.hash})`;
    }
    return model.name || model.hash || '';
}
//# sourceMappingURL=model.js.map