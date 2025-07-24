import { Eagerness } from './eagerness';
import { ExtractorFunction, pngImageInfo, pngImageText, pngStenographicAlpha, jpegUserComment } from './extractors';

/**
 * Metadata extractors organized by image format and eagerness level
 */
export const METADATA_EXTRACTORS: Record<string, Record<Eagerness, ExtractorFunction[]>> = {
  PNG: {
    [Eagerness.FAST]: [pngImageInfo],
    [Eagerness.DEFAULT]: [pngImageText],
    [Eagerness.EAGER]: [pngStenographicAlpha],
  },
  JPEG: {
    [Eagerness.FAST]: [jpegUserComment],
    [Eagerness.DEFAULT]: [],
    [Eagerness.EAGER]: [],
  },
  WEBP: {
    [Eagerness.FAST]: [jpegUserComment],
    [Eagerness.DEFAULT]: [],
    [Eagerness.EAGER]: [],
  },
};

export { Eagerness } from './eagerness';
export { ExtractorFunction } from './extractors';
