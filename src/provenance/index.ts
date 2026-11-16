import { readJpegSegments, readWebpChunks, readXmpEntries } from '../extractors/entries';
import { detectFormat } from '../extractors/image';
import { readPngText } from '../extractors/png';
import { C2paManifest, C2paManifestStore, readC2pa } from './c2pa';
import { readVideoMetadata } from '../video';

export { decodeCbor, type CborTagged } from './cbor';
export { readC2pa, readJumbf, extractC2pa, type C2paManifest, type C2paManifestStore, type C2paAction, type JumbfBox } from './c2pa';

const IPTC_SOURCE_TYPES = 'http://cv.iptc.org/newscodes/digitalsourcetype/';
const AI_SOURCE_TYPES = new Set(['trainedAlgorithmicMedia', 'compositeWithTrainedAlgorithmicMedia', 'compositeSynthetic']);

/**
 * What an image says about where it came from, from its C2PA manifests (Content Credentials)
 * or the IPTC digital source type in its XMP metadata. Nothing here is verified: signatures
 * are not checked, and the labels are easy to remove or fake.
 */
export interface Provenance {
  /** Where the information was found */
  source: 'C2PA' | 'XMP';
  /** The image is labelled as made, or partly made, by generative AI */
  aiGenerated: boolean;
  /** IPTC digital source type of the original image, without the vocabulary URL (`trainedAlgorithmicMedia`) */
  digitalSourceType?: string;
  /** Company behind the tool, from the signing certificate or publisher (`OpenAI`, `Google`, ...) */
  vendor?: string;
  /** Tool that made the image, when the metadata names it (`ChatGPT`, `Gemini`, `Grok Imagine`, ...) */
  software?: string;
  /** All C2PA manifests, oldest first */
  c2pa?: C2paManifestStore;
}

const VENDORS: [RegExp, string][] = [
  [/openai/i, 'OpenAI'],
  [/google/i, 'Google'],
  [/adobe/i, 'Adobe'],
  [/microsoft/i, 'Microsoft'],
  [/\bxai\b|spacexai|grok/i, 'xAI'],
  [/\bmeta\b|facebook|instagram/i, 'Meta'],
  [/stability/i, 'Stability AI'],
  [/midjourney/i, 'Midjourney'],
  [/runway/i, 'Runway'],
  [/black forest labs/i, 'Black Forest Labs'],
];

function vendorOf(...names: (string | undefined)[]): string | undefined {
  for (const name of names) {
    if (!name) continue;
    const match = VENDORS.find(([pattern]) => pattern.test(name));
    if (match) return match[1];
  }
  return undefined;
}

function sourceType(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.startsWith(IPTC_SOURCE_TYPES) ? value.slice(IPTC_SOURCE_TYPES.length) : value;
}

function creativeWorkAuthor(manifest: C2paManifest): string | undefined {
  const work = manifest.assertions['c2pa.creative_work'] ?? manifest.assertions['stds.schema-org.CreativeWork'];
  const authors = work && typeof work === 'object' ? (work as Record<string, unknown>).author : undefined;
  const list = Array.isArray(authors) ? authors : authors ? [authors] : [];
  for (const author of list) {
    if (author && typeof author === 'object' && typeof (author as Record<string, unknown>).name === 'string') {
      return (author as Record<string, string>).name;
    }
  }
  return undefined;
}

/** Product names for agents that only name a model, and for vendors that don't name one */
function softwareName(agent: string | undefined, vendor: string | undefined, aiGenerated: boolean): string | undefined {
  if (agent) {
    if (/^chatgpt\b/i.test(agent)) return 'ChatGPT';
    if (/^(?:gpt-image|dall-e)/i.test(agent)) return 'ChatGPT';
    return agent.replace(/\s+\d+(?:\.\d+)*$/, '');
  }
  if (!aiGenerated) return undefined;
  if (vendor === 'Google') return 'Gemini';
  if (vendor === 'Meta') return 'Meta AI';
  return undefined;
}

function fromC2pa(store: C2paManifestStore): Provenance {
  // the first manifest describes how the image was made, later ones how it was edited
  const actions = store.manifests.flatMap(manifest => manifest.actions);
  const created = actions.find(action => action.action === 'c2pa.created') ?? actions.find(action => action.digitalSourceType);
  const digitalSourceType = sourceType(created?.digitalSourceType);
  const aiGenerated = actions.some(action => AI_SOURCE_TYPES.has(sourceType(action.digitalSourceType) ?? ''));
  const origin = store.manifests[0];
  const agent = created?.softwareAgent ?? actions.find(action => action.softwareAgent)?.softwareAgent;
  const vendor = vendorOf(origin?.signers[0], origin && creativeWorkAuthor(origin), origin?.claimGenerator, agent);
  return { source: 'C2PA', aiGenerated, digitalSourceType, vendor, software: softwareName(agent, vendor, aiGenerated), c2pa: store };
}

function readXmp(bytes: Uint8Array): string | undefined {
  switch (detectFormat(bytes)) {
    case 'PNG': {
      const xmp = readPngText(bytes).text['XML:com.adobe.xmp'];
      return typeof xmp === 'string' ? xmp : undefined;
    }
    case 'JPEG':
      return readJpegSegments(bytes).xmp;
    case 'WEBP':
      return readWebpChunks(bytes).xmp;
    default:
      return readVideoMetadata(bytes)?.xmp;
  }
}

/**
 * Read the provenance labels of a PNG, JPEG, WEBP, MP4 or MOV file: C2PA manifests, or else the IPTC
 * digital source type in its XMP metadata. Returns `null` when the image has neither.
 */
export function readProvenance(bytes: Uint8Array): Provenance | null {
  const store = readC2pa(bytes);
  if (store && store.manifests.length > 0) return fromC2pa(store);

  const xmp = readXmp(bytes);
  if (!xmp) return null;
  const { DigitalSourceType, Publisher, CreatorTool } = readXmpEntries(xmp);
  const digitalSourceType = sourceType(DigitalSourceType);
  if (!digitalSourceType) return null;
  const aiGenerated = AI_SOURCE_TYPES.has(digitalSourceType);
  const vendor = vendorOf(Publisher, CreatorTool);
  return { source: 'XMP', aiGenerated, digitalSourceType, vendor, software: CreatorTool ?? softwareName(undefined, vendor, aiGenerated) };
}
