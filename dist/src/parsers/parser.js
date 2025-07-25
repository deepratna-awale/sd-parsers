"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Parser = void 0;
exports.popKeys = popKeys;
const data_1 = require("../data");
/**
 * Abstract base class for parsers
 */
class Parser {
    constructor(normalizeParameters = true, debug = false) {
        this.generator = data_1.Generators.UNKNOWN;
        this.doNormalizationPass = normalizeParameters;
        this.debug = debug;
    }
    /**
     * Apply replacement rules and basic formatting to the keys of select image metadata entries.
     * Returns a dictionary with normalized parameter values.
     */
    normalizeParameters(parameters, replacementRules, toLowerCase = true, replaceWhitespace = true) {
        if (!this.doNormalizationPass) {
            return Array.isArray(parameters) ? Object.fromEntries(parameters) : parameters;
        }
        const rawProps = Array.isArray(parameters) ? Object.fromEntries(parameters) : { ...parameters };
        const processed = {};
        if (replacementRules) {
            for (const rule of replacementRules) {
                const [propertyKey, instruction] = rule;
                // rename field instruction
                if (typeof instruction === 'string') {
                    if (propertyKey in rawProps) {
                        processed[instruction] = rawProps[propertyKey];
                        delete rawProps[propertyKey];
                    }
                }
                else {
                    // format field instruction
                    const [formatValues, formatString] = instruction;
                    if (propertyKey in rawProps) {
                        const formatData = {};
                        for (const key of formatValues) {
                            if (key in rawProps) {
                                formatData[key] = rawProps[key];
                            }
                        }
                        // Simple string formatting (would need more sophisticated implementation for complex cases)
                        let formatted = formatString;
                        for (const [key, value] of Object.entries(formatData)) {
                            formatted = formatted.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
                        }
                        processed[propertyKey] = formatted;
                    }
                }
            }
        }
        for (let [key, value] of Object.entries(rawProps)) {
            if (toLowerCase) {
                key = key.toLowerCase();
            }
            if (replaceWhitespace) {
                key = key.replace(/\s+/g, '_');
            }
            processed[key] = value;
        }
        return processed;
    }
}
exports.Parser = Parser;
/**
 * Remove dictionary entries specified by keys from the given dictionary.
 * Ignores non-existing keys.
 * Returns an array of the actually removed keys and their corresponding values.
 */
function popKeys(keys, dictionary) {
    const result = [];
    for (const key of keys) {
        if (key in dictionary) {
            result.push([key, dictionary[key]]);
            delete dictionary[key];
        }
    }
    return result;
}
//# sourceMappingURL=parser.js.map