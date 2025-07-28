"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPrompt = createPrompt;
exports.promptToString = promptToString;
/**
 * Creates a new Prompt instance
 */
function createPrompt(value, options = {}) {
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
function promptToString(prompt) {
    return prompt.value;
}
//# sourceMappingURL=prompt.js.map