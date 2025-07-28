"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DummyParser = void 0;
const parser_1 = require("./parser");
const data_1 = require("../data");
/**
 * Example stub for additional parsers
 */
class DummyParser extends parser_1.Parser {
    constructor() {
        super(...arguments);
        this.generator = data_1.Generators.UNKNOWN;
    }
    async parse(parameters) {
        // Create a dummy sampler with the provided parameters
        const sampler = (0, data_1.createSampler)('dummy_sampler', {});
        // Return basic prompt info with the dummy sampler
        return (0, data_1.createPromptInfo)(this.generator, [sampler], { 'some other': 'metadata' }, parameters);
    }
}
exports.DummyParser = DummyParser;
//# sourceMappingURL=dummy.js.map