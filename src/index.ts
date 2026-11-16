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
export { detectSoftware, detectA1111Software } from './software';
export { getLoras, lorasFromPromptTags, lorasFromA1111, lorasFromComfyGraph } from './loras';
export { readImageSize, getGenerationSize, type ImageSize } from './size';
export { toInfotext } from './infotext';
export { writeMetadata, stripMetadata, copyMetadata, readMetadataEntries } from './writer';
export {
  readProvenance,
  readC2pa,
  readJumbf,
  extractC2pa,
  decodeCbor,
  type Provenance,
  type C2paManifest,
  type C2paManifestStore,
  type C2paAction,
  type JumbfBox,
  type CborTagged,
} from './provenance';
