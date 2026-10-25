import { Eagerness } from './eagerness';
import { ExtractorFunction, pngImageInfo, pngImageText, pngStenographicAlpha, jpegUserComment } from './extractors';

/**
 * Metadata extractors organized by image format and eagerness level
 */
export const METADATA_EXTRACTORS: Record<string, Partial<Record<Eagerness, ExtractorFunction[]>>> = {
  PNG: {
    [Eagerness.FAST]: [pngImageInfo],
    [Eagerness.DEFAULT]: [pngImageText],
    [Eagerness.EAGER]: [pngStenographicAlpha],
  },
  JPEG: {
    [Eagerness.FAST]: [jpegUserComment],
  },
  WEBP: {
    [Eagerness.FAST]: [jpegUserComment],
  },
};

export { Eagerness } from './eagerness';
export {
  type ExtractorFunction,
  registerImageBuffer,
  pngImageInfo,
  pngImageText,
  pngStenographicAlpha,
  jpegUserComment,
} from './extractors';
export { readPngText, type PngTextData } from './png';
export { getExifValue, decodeUtf16BE, EXIF_TAGS } from './exif';
export { readStealthText } from './stealth';
