/**
 * Base error class for parser-related errors
 */
export class ParserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ParserError';
  }
}

/**
 * Error thrown when metadata did not match our expectations - can be safely ignored
 */
export class MetadataError extends ParserError {
  constructor(message: string) {
    super(message);
    this.name = 'MetadataError';
  }
}

/**
 * Error thrown when the input is not an image (the equivalent of PIL's `UnidentifiedImageError`)
 */
export class UnidentifiedImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UnidentifiedImageError';
  }
}
