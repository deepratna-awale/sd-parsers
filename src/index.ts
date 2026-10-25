/**
 * A library to read metadata from images created with Stable Diffusion.
 * 
 * Basic usage:
 * ```typescript
 * import { ParserManager } from 'sd-parsers';
 * 
 * const parserManager = new ParserManager();
 * 
 * async function main() {
 *   const promptInfo = await parserManager.parse('image.png');
 *   if (promptInfo) {
 *     console.log(promptInfo);
 *   }
 * }
 * ```
 */

export { ParserManager, type ParseInput, type ParseOptions } from './parserManager';
export {
  Eagerness,
  detectFormat,
  type ImageFormat,
  type ImageSource,
  type DecodedPixels,
  type PixelDecoder,
} from './extractors';
export * from './data';
export * from './parsers';
export * from './exceptions';
