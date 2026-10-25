// Browser stand-in for the parts of Node's `zlib` module the library uses.
import { Buffer } from "buffer";
import { Unzlib, gunzipSync as fflateGunzipSync } from "fflate";

export const constants = { Z_SYNC_FLUSH: 2 } as const;

/**
 * Mirrors `zlib.inflateSync`. With `finishFlush: Z_SYNC_FLUSH` the stream is not
 * finalized, so truncated data returns whatever could be decompressed.
 */
export function inflateSync(data: Uint8Array, options?: { finishFlush?: number }): Buffer {
  const chunks: Uint8Array[] = [];
  const stream = new Unzlib((chunk) => chunks.push(chunk));
  stream.push(data, options?.finishFlush !== constants.Z_SYNC_FLUSH);
  return Buffer.concat(chunks);
}

export function gunzipSync(data: Uint8Array): Buffer {
  return Buffer.from(fflateGunzipSync(data));
}
