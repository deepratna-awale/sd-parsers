import sharp from 'sharp';
import { Generators } from '../data';
/**
 * Type definition for metadata extractor functions
 */
export type ExtractorFunction = (image: sharp.Sharp, generator: Generators) => Promise<Record<string, any> | null>;
/**
 * Extract metadata from PNG image info
 */
export declare function pngImageInfo(image: sharp.Sharp, _: Generators): Promise<Record<string, any> | null>;
/**
 * Extract metadata from PNG text chunks
 */
export declare function pngImageText(image: sharp.Sharp, _: Generators): Promise<Record<string, any> | null>;
/**
 * Extract metadata from PNG stenographic alpha channel
 */
export declare function pngStenographicAlpha(image: sharp.Sharp, _: Generators): Promise<Record<string, any> | null>;
/**
 * Extract metadata from JPEG UserComment EXIF field
 */
export declare function jpegUserComment(image: sharp.Sharp, generator: Generators): Promise<Record<string, any> | null>;
//# sourceMappingURL=extractors.d.ts.map