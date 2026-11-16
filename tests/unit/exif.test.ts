import { readFileSync } from 'fs';
import { join } from 'path';
import { readExif, parseExif, extractExif, summarizeExif, writeMetadata } from '../../src';

const resource = (...parts: string[]) => new Uint8Array(readFileSync(join(__dirname, '..', 'resources', ...parts)));

const expectedSummary = {
  make: 'Canon',
  model: 'Canon EOS R5',
  lensMake: 'Canon',
  lens: 'RF50mm F1.2 L USM',
  software: 'Adobe Lightroom 7.0',
  artist: 'Jane Doe',
  copyright: '(c) Jane Doe',
  description: 'A lake at dawn',
  dateTaken: '2024-05-01T06:12:30.120+02:00',
  exposureTime: 0.004,
  shutterSpeed: '1/250',
  fNumber: 2.8,
  iso: 400,
  focalLength: 50,
  focalLength35mm: 50,
  exposureBias: -0.33,
  flash: false,
  orientation: 6,
  width: 8192,
  height: 5464,
  rating: 4,
  title: 'Dawn',
  comment: 'Shot from the pier',
  keywords: ['lake', 'dawn', 'mist'],
  gps: { latitude: -33.8559833, longitude: 151.2144, altitude: 58.5 },
};

describe('readExif', () => {
  it.each([
    ['camera.jpg', 'II'],
    ['camera.png', 'II'],
    ['camera-big-endian.webp', 'MM'],
  ])('reads every IFD of %s', (file, byteOrder) => {
    const exif = readExif(resource('exif', file))!;
    expect(exif.byteOrder).toBe(byteOrder);
    expect(exif.image).toMatchObject({ Make: 'Canon', Model: 'Canon EOS R5', Orientation: 6, XPKeywords: 'lake; dawn;mist' });
    expect(exif.photo).toMatchObject({
      ExposureTime: 0.004,
      FNumber: 2.8,
      ISOSpeedRatings: 400,
      ExifVersion: '0232',
      Flash: 16,
      UserComment: 'Morning light',
      LensModel: 'RF50mm F1.2 L USM',
    });
    expect(exif.photo.ExposureBiasValue).toBeCloseTo(-1 / 3);
    expect(exif.gps).toEqual({
      GPSVersionID: [2, 3, 0, 0],
      GPSLatitudeRef: 'S',
      GPSLatitude: [33, 51, 21.54],
      GPSLongitudeRef: 'E',
      GPSLongitude: [151, 12, 51.84],
      GPSAltitudeRef: 0,
      GPSAltitude: 58.5,
    });
    expect(summarizeExif(exif)).toEqual(expectedSummary);
  });

  it('accepts an EXIF block as well as a file', () => {
    const block = extractExif(resource('exif', 'camera.jpg'))!;
    expect(new TextDecoder().decode(block.subarray(0, 4))).toBe('Exif');
    expect(readExif(block)).toEqual(readExif(resource('exif', 'camera.jpg')));
    expect(parseExif(block.subarray(6))).toEqual(parseExif(block));
  });

  it('returns null for images without EXIF and for garbage', () => {
    expect(readExif(resource('samples', 'png', 'forge.png'))).toBeNull();
    expect(readExif(resource('writer', 'plain.jpg'))).toBeNull();
    expect(readExif(new Uint8Array([1, 2, 3]))).toBeNull();
  });

  it('reads the generation data that AI tools keep in EXIF', () => {
    const exif = readExif(resource('samples', 'jpg', 'civitai.jpeg'))!;
    expect(exif.image.Artist).toBe('ai');
    expect(exif.photo.UserComment).toMatch(/^general, masterpiece/);
    expect(exif.photo.UserComment).toContain('Steps: 25, Sampler: Euler a');
  });

  it('reads the EXIF that writeMetadata() writes', () => {
    const jpeg = writeMetadata(resource('writer', 'plain.jpg'), { UserComment: 'a cat\nSteps: 20', Software: 'test' });
    const exif = readExif(jpeg)!;
    expect(exif.image.Software).toBe('test');
    expect(exif.photo.UserComment).toBe('a cat\nSteps: 20');
  });

  it('survives truncated and looping IFDs', () => {
    const block = extractExif(resource('exif', 'camera.jpg'))!.slice(6);
    expect(parseExif(block.subarray(0, 40))).toMatchObject({ byteOrder: 'II' });
    const looping = block.slice();
    const view = new DataView(looping.buffer);
    const count = view.getUint16(8, true);
    view.setUint32(8 + 2 + count * 12, 8, true);
    expect(parseExif(looping)!.image.Make).toBe('Canon');
  });

  it('names unknown tags by id and keeps binary UNDEFINED values as bytes', () => {
    const tiff = new Uint8Array([
      0x49, 0x49, 42, 0, 8, 0, 0, 0,
      2, 0,
      0x34, 0x12, 7, 0, 4, 0, 0, 0, 1, 2, 3, 4,
      0x00, 0x01, 3, 0, 1, 0, 0, 0, 64, 0, 0, 0,
      0, 0, 0, 0,
    ]);
    const exif = parseExif(tiff)!;
    expect(exif.image['0x1234']).toEqual(new Uint8Array([1, 2, 3, 4]));
    expect(exif.image.ImageWidth).toBe(64);
    expect(summarizeExif(exif)).toEqual({ width: 64 });
  });
});

describe('summarizeExif', () => {
  const data = (image = {}, photo = {}, gps = {}) => ({ byteOrder: 'II' as const, image, photo, gps, interoperability: {}, thumbnail: {} });

  it('formats long exposures and odd shutter speeds', () => {
    expect(summarizeExif(data({}, { ExposureTime: 2.5 })).shutterSpeed).toBe('2.5');
    expect(summarizeExif(data({}, { ExposureTime: 1 / 3.2 })).shutterSpeed).toBe('0.3125');
  });

  it('falls back to the digitized and file time, and skips empty dates', () => {
    expect(summarizeExif(data({ DateTime: '2020:01:02 03:04:05' })).dateTaken).toBe('2020-01-02T03:04:05');
    expect(summarizeExif(data({}, { DateTimeOriginal: '0000:00:00 00:00:00', DateTimeDigitized: '2021:06:07 08:09:10', OffsetTimeDigitized: '-05:00' })).dateTaken).toBe(
      '2021-06-07T08:09:10-05:00',
    );
  });

  it('reads western longitudes, altitudes below sea level and a fired flash', () => {
    const summary = summarizeExif(
      data({}, { Flash: 0x19 }, { GPSLatitude: [40, 26, 46], GPSLatitudeRef: 'N', GPSLongitude: [79, 58, 56], GPSLongitudeRef: 'W', GPSAltitude: 10, GPSAltitudeRef: 1 }),
    );
    expect(summary.flash).toBe(true);
    expect(summary.gps).toEqual({ latitude: 40.4461111, longitude: -79.9822222, altitude: -10 });
  });

  it('ignores missing and invalid values', () => {
    expect(summarizeExif(data({ Make: '  ' }, { FNumber: NaN, ISOSpeedRatings: [100, 200] }, { GPSLatitude: [NaN] }))).toEqual({ iso: 100 });
  });
});
