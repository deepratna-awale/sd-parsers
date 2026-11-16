import { Eagerness } from './eagerness';
import { ExtractorFunction, pngImageInfo, pngImageText, pngStenographicAlpha, jpegUserComment, exifImageEntries, provenanceLabels, videoEntries } from './extractors';

/**
 * Metadata extractors organized by image format and eagerness level
 */
export const METADATA_EXTRACTORS: Record<string, Partial<Record<Eagerness, ExtractorFunction[]>>> = {
  PNG: {
    [Eagerness.FAST]: [pngImageInfo],
    [Eagerness.DEFAULT]: [pngImageText, provenanceLabels],
    [Eagerness.EAGER]: [pngStenographicAlpha],
  },
  JPEG: {
    [Eagerness.FAST]: [jpegUserComment, exifImageEntries, provenanceLabels],
  },
  WEBP: {
    [Eagerness.FAST]: [jpegUserComment, exifImageEntries, provenanceLabels],
  },
  MP4: { [Eagerness.FAST]: [videoEntries, provenanceLabels] },
  MOV: { [Eagerness.FAST]: [videoEntries, provenanceLabels] },
  WEBM: { [Eagerness.FAST]: [videoEntries, provenanceLabels] },
  MKV: { [Eagerness.FAST]: [videoEntries, provenanceLabels] },
};

export { Eagerness } from './eagerness';
export {
  type ExtractorFunction,
  registerImageBuffer,
  pngImageInfo,
  pngImageText,
  pngStenographicAlpha,
  jpegUserComment,
  exifImageEntries,
  provenanceLabels,
  videoEntries,
  getProvenance,
  getImageFormat,
  getImageSize,
} from './extractors';
export {
  type ImageFormat,
  type MediaFormat,
  type ImageSource,
  type ExtractorImage,
  type DecodedPixels,
  type PixelDecoder,
  type SharpInstance,
  detectFormat,
  isSharp,
  isOtherImageFormat,
} from './image';
export { readPngText, type PngTextData } from './png';
export { getExifValue, decodeUtf16BE, findExif, EXIF_TAGS } from './exif';
export { readStealthText } from './stealth';
export {
  type MetadataEntries,
  readExifEntries,
  readExifImageEntries,
  readJpegSegments,
  readWebpChunks,
  readXmpEntries,
  getXmpProperty,
  decodeUserComment,
} from './entries';
