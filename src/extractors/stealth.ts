import { gunzip } from './zlib';

const STEALTH_HEADER = 'stealth_pngcomp';

/**
 * Reads the least significant bits of the alpha channel, column by column
 */
class LSBExtractor {
  private row = 0;
  private col = 0;

  constructor(
    private readonly data: Uint8Array,
    private readonly width: number,
    private readonly height: number,
    private readonly channels: number
  ) {}

  private extractNextBit(): number {
    if (this.row >= this.height || this.col >= this.width) {
      throw new Error('no more image data');
    }
    const bit = this.data[(this.row * this.width + this.col) * this.channels + this.channels - 1] & 1;
    this.row++;
    if (this.row === this.height) {
      this.row = 0;
      this.col++;
    }
    return bit;
  }

  getNextNBytes(n: number): Uint8Array {
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        byte = (byte << 1) | this.extractNextBit();
      }
      bytes[i] = byte;
    }
    return bytes;
  }

  read32BitInteger(): number {
    return new DataView(this.getNextNBytes(4).buffer).getUint32(0);
  }
}

/**
 * Decode the stealth metadata hidden in the alpha channel of raw, interleaved pixel data.
 *
 * Only depends on the decoded pixels, so it works with any image decoder
 * (sharp in Node.js, a canvas in the browser).
 */
export function readStealthText(data: Uint8Array, width: number, height: number, channels: number): string {
  const extractor = new LSBExtractor(data, width, height, channels);

  const readMagic = new TextDecoder('utf-8', { fatal: true }).decode(extractor.getNextNBytes(STEALTH_HEADER.length));
  if (readMagic !== STEALTH_HEADER) {
    throw new Error(`Header "${readMagic}" does not match the expected value of "${STEALTH_HEADER}"`);
  }

  const readLength = Math.floor(extractor.read32BitInteger() / 8);
  const rawBytes = extractor.getNextNBytes(readLength);

  return new TextDecoder('utf-8', { fatal: true }).decode(gunzip(rawBytes));
}
