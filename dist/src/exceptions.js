"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetadataError = exports.ParserError = void 0;
/**
 * Base error class for parser-related errors
 */
class ParserError extends Error {
    constructor(message) {
        super(message);
        this.name = 'ParserError';
    }
}
exports.ParserError = ParserError;
/**
 * Error thrown when metadata did not match our expectations - can be safely ignored
 */
class MetadataError extends ParserError {
    constructor(message) {
        super(message);
        this.name = 'MetadataError';
    }
}
exports.MetadataError = MetadataError;
//# sourceMappingURL=exceptions.js.map