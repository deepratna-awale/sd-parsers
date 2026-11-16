import { detectFormat } from '../extractors/image';
import { latin1 } from '../utils/bytes';
import { CborTagged, decodeCbor } from './cbor';
import { readVideoMetadata } from '../video';

const utf8 = new TextDecoder();

/** A JUMBF superbox: its label and the boxes inside it */
export interface JumbfBox {
  label?: string;
  /** Content type UUID of the description box, as hex */
  contentType: string;
  /** Content boxes (`cbor`, `json`, `bidb`, ...) */
  content: { type: string; data: Uint8Array }[];
  children: JumbfBox[];
}

function readBoxes(data: Uint8Array): { type: string; data: Uint8Array }[] {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const boxes: { type: string; data: Uint8Array }[] = [];
  let offset = 0;
  while (offset + 8 <= data.length) {
    let size = view.getUint32(offset);
    const type = latin1(data, offset + 4, offset + 8);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > data.length) break;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = data.length - offset;
    }
    if (size < header || offset + size > data.length) break;
    boxes.push({ type, data: data.subarray(offset + header, offset + size) });
    offset += size;
  }
  return boxes;
}

function readSuperbox(data: Uint8Array): JumbfBox | null {
  const [description, ...rest] = readBoxes(data);
  if (!description || description.type !== 'jumd' || description.data.length < 17) return null;
  const jumd = description.data;
  const contentType = Array.from(jumd.subarray(0, 16), byte => byte.toString(16).padStart(2, '0')).join('');
  const toggles = jumd[16];
  let label: string | undefined;
  if (toggles & 0x02) {
    const end = jumd.indexOf(0, 17);
    label = utf8.decode(jumd.subarray(17, end === -1 ? jumd.length : end));
  }

  const box: JumbfBox = { label, contentType, content: [], children: [] };
  for (const child of rest) {
    if (child.type === 'jumb') {
      const superbox = readSuperbox(child.data);
      if (superbox) box.children.push(superbox);
    } else {
      box.content.push(child);
    }
  }
  return box;
}

/**
 * Read a JUMBF superbox (`jumb`) and the superboxes nested in it
 */
export function readJumbf(data: Uint8Array): JumbfBox | null {
  const [first] = readBoxes(data);
  return first?.type === 'jumb' ? readSuperbox(first.data) : null;
}

function readJpegC2pa(bytes: Uint8Array): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // APP11 segments: "JP", box instance number, sequence number, then the box, whose
  // header is repeated in every segment after the first
  const parts = new Map<number, { sequence: number; data: Uint8Array }[]>();
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || marker === 0xd9) break;
    const length = view.getUint16(offset + 2);
    const segment = bytes.subarray(offset + 4, Math.min(offset + 2 + length, bytes.length));
    if (marker === 0xeb && segment.length > 16 && segment[0] === 0x4a && segment[1] === 0x50) {
      const instance = (segment[2] << 8) | segment[3];
      const sequence = new DataView(segment.buffer, segment.byteOffset).getUint32(4);
      const list = parts.get(instance) ?? [];
      list.push({ sequence, data: segment.subarray(8) });
      parts.set(instance, list);
    }
    offset += 2 + length;
  }

  for (const list of parts.values()) {
    list.sort((a, b) => a.sequence - b.sequence);
    const [first, ...others] = list;
    if (latin1(first.data, 4, 8) !== 'jumb') continue;
    const header = new DataView(first.data.buffer, first.data.byteOffset).getUint32(0) === 1 ? 16 : 8;
    const chunks = [first.data, ...others.map(part => part.data.subarray(header))];
    const joined = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.length, 0));
    let position = 0;
    for (const chunk of chunks) {
      joined.set(chunk, position);
      position += chunk.length;
    }
    return joined;
  }
  return null;
}

function findChunk(bytes: Uint8Array, start: number, littleEndian: boolean, wanted: string, sizeExtra: number, pad: boolean): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = start;
  while (offset + 8 <= bytes.length) {
    const lengthFirst = !littleEndian;
    const size = lengthFirst ? view.getUint32(offset) : view.getUint32(offset + 4, true);
    const type = lengthFirst ? latin1(bytes, offset + 4, offset + 8) : latin1(bytes, offset, offset + 4);
    if (type === wanted) return bytes.subarray(offset + 8, Math.min(offset + 8 + size, bytes.length));
    if (type === 'IEND') break;
    offset += 8 + size + sizeExtra + (pad ? size % 2 : 0);
  }
  return null;
}

/**
 * Find the C2PA manifest store (JUMBF) of a PNG (`caBX` chunk), JPEG (APP11 segments),
 * WEBP (`C2PA` chunk) or MP4 / MOV (`uuid` box) file
 */
export function extractC2pa(bytes: Uint8Array): Uint8Array | null {
  switch (detectFormat(bytes)) {
    case 'PNG':
      return findChunk(bytes, 8, false, 'caBX', 4, false);
    case 'JPEG':
      return readJpegC2pa(bytes);
    case 'WEBP':
      return findChunk(bytes, 12, true, 'C2PA', 0, true);
    default:
      return readVideoMetadata(bytes)?.c2pa ?? null;
  }
}

export interface C2paAction {
  action: string;
  when?: string;
  softwareAgent?: string;
  digitalSourceType?: string;
}

export interface C2paManifest {
  label?: string;
  /** Name (and version) of the tool that made the claim */
  claimGenerator?: string;
  title?: string;
  actions: C2paAction[];
  /** Organization names in the signing certificates, signer first */
  signers: string[];
  /** Decoded assertions by label */
  assertions: Record<string, unknown>;
}

export interface C2paManifestStore {
  /** The manifest that describes the file as it is: the last one in the store */
  activeManifest?: C2paManifest;
  manifests: C2paManifest[];
}

function decodeContent(box: JumbfBox): unknown {
  for (const { type, data } of box.content) {
    try {
      if (type === 'cbor') return decodeCbor(data);
      if (type === 'json') return JSON.parse(utf8.decode(data));
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function str(value: unknown): string | undefined {
  return typeof value === 'string' && value ? value : undefined;
}

function agentName(value: unknown): string | undefined {
  if (typeof value === 'string') return value || undefined;
  if (value && typeof value === 'object') {
    const { name, version } = value as Record<string, unknown>;
    if (typeof name === 'string' && name) return typeof version === 'string' && version ? `${name} ${version}` : name;
  }
  return undefined;
}

/** Organization names (OID 2.5.4.10) in DER encoded certificates, in order of appearance */
function organizationNames(der: Uint8Array): string[] {
  const names: string[] = [];
  for (let i = 0; i + 7 < der.length; i++) {
    if (der[i] === 0x06 && der[i + 1] === 0x03 && der[i + 2] === 0x55 && der[i + 3] === 0x04 && der[i + 4] === 0x0a) {
      const length = der[i + 6];
      if (length < 0x80 && i + 7 + length <= der.length) {
        const name = utf8.decode(der.subarray(i + 7, i + 7 + length));
        if (!names.includes(name)) names.push(name);
      }
    }
  }
  return names;
}

/** The leaf certificate comes first, and its issuer before its subject */
function signerNames(signature: unknown): string[] {
  const certificates: Uint8Array[] = [];
  const collect = (value: unknown) => {
    if (value instanceof Uint8Array) certificates.push(value);
    else if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if ('tag' in record) collect(record.value);
      else for (const [key, entry] of Object.entries(record)) if (key === '33' || key === 'x5chain') collect(entry);
    }
  };
  // COSE_Sign1: [protected header, unprotected header, payload, signature]
  const cose = signature && typeof signature === 'object' && 'tag' in signature ? (signature as unknown as CborTagged).value : signature;
  if (Array.isArray(cose)) {
    if (cose[0] instanceof Uint8Array) {
      try {
        collect(decodeCbor(cose[0]));
      } catch {
        // unreadable protected header
      }
    }
    collect(cose[1]);
  }
  if (certificates.length === 0) return [];
  const [leaf, ...chain] = certificates;
  const leafNames = organizationNames(leaf);
  const subject = leafNames[leafNames.length - 1];
  const others = [...leafNames, ...chain.flatMap(organizationNames)].filter(name => name !== subject);
  return [...(subject ? [subject] : []), ...others.filter((name, i) => others.indexOf(name) === i)];
}

function readManifest(box: JumbfBox): C2paManifest {
  const manifest: C2paManifest = { label: box.label, actions: [], signers: [], assertions: {} };

  for (const child of box.children) {
    const label = child.label ?? '';
    if (label === 'c2pa.assertions') {
      for (const assertion of child.children) {
        if (assertion.label) manifest.assertions[assertion.label] = decodeContent(assertion);
      }
    } else if (label.startsWith('c2pa.claim')) {
      const claim = decodeContent(child) as Record<string, any> | undefined;
      if (claim && typeof claim === 'object') {
        const info = Array.isArray(claim.claim_generator_info) ? claim.claim_generator_info[0] : claim.claim_generator_info;
        manifest.claimGenerator = agentName(info) ?? str(claim.claim_generator);
        manifest.title = str(claim['dc:title']) ?? str(claim.title);
      }
    } else if (label === 'c2pa.signature') {
      manifest.signers = signerNames(decodeContent(child));
    }
  }

  for (const [label, value] of Object.entries(manifest.assertions)) {
    if (!label.startsWith('c2pa.actions') || !value || typeof value !== 'object') continue;
    const actions = (value as Record<string, unknown>).actions;
    if (!Array.isArray(actions)) continue;
    for (const entry of actions) {
      if (!entry || typeof entry !== 'object') continue;
      const action = entry as Record<string, any>;
      manifest.actions.push({
        action: String(action.action),
        when: str(action.when),
        softwareAgent: agentName(action.softwareAgent),
        digitalSourceType: str(action.digitalSourceType) ?? str(action.parameters?.digitalSourceType),
      });
    }
  }
  return manifest;
}

/**
 * Read the C2PA (Content Credentials) manifests of an image. The signature is not verified:
 * this tells what the file claims, not whether the claim is authentic.
 */
export function readC2pa(bytes: Uint8Array): C2paManifestStore | null {
  const data = extractC2pa(bytes);
  const store = data && readJumbf(data);
  if (!store || store.label !== 'c2pa') return null;
  const manifests = store.children.map(readManifest);
  return { activeManifest: manifests[manifests.length - 1], manifests };
}
