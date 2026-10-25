import { Unzlib, gunzipSync } from 'fflate';

function concat(chunks: Uint8Array[]): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const result = new Uint8Array(chunks.reduce((length, chunk) => length + chunk.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

/**
 * Decompress zlib data, returning whatever could be decompressed from truncated streams
 * (like Python's `zlib.decompressobj().decompress()`).
 */
export function inflate(data: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = [];
  const stream = new Unzlib(chunk => chunks.push(chunk));
  stream.push(data, false);
  return concat(chunks);
}

/**
 * Decompress gzip data
 */
export function gunzip(data: Uint8Array): Uint8Array {
  return gunzipSync(data);
}
