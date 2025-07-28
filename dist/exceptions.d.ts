/**
 * Base error class for parser-related errors
 */
export declare class ParserError extends Error {
    constructor(message: string);
}
/**
 * Error thrown when metadata did not match our expectations - can be safely ignored
 */
export declare class MetadataError extends ParserError {
    constructor(message: string);
}
//# sourceMappingURL=exceptions.d.ts.map