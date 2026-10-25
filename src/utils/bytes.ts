/**
 * Decode bytes as latin-1, one character per byte
 */
export function latin1(data: Uint8Array, start = 0, end = data.length): string {
  let result = '';
  for (let i = start; i < end; i += 0x8000) {
    result += String.fromCharCode(...data.subarray(i, Math.min(i + 0x8000, end)));
  }
  return result;
}
