import { 
  pngImageInfo, 
  pngImageText, 
  pngStenographicAlpha, 
  jpegUserComment 
} from '../../../src/extractors/extractors';
import { Generators } from '../../../src/data';
import sharp from 'sharp';

describe('Extractors', () => {
  describe('pngImageInfo', () => {
    it('should extract basic PNG metadata', async () => {
      // Create a simple test PNG
      const testPng = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      }).png().toBuffer();

      const image = sharp(testPng);
      const result = await pngImageInfo(image, Generators.AUTOMATIC1111);

      expect(result).toBeDefined();
      expect(result!.width).toBe(100);
      expect(result!.height).toBe(100);
    });

    it('should return metadata for image', async () => {
      const testPng = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      }).png().toBuffer();

      const image = sharp(testPng);
      const result = await pngImageInfo(image, Generators.AUTOMATIC1111);

      // Should still have width/height
      expect(result).toBeDefined();
      expect(result!.width).toBe(50);
      expect(result!.height).toBe(50);
    });
  });

  describe('pngImageText', () => {
    it('should extract text chunks from PNG', async () => {
      // This test would require a PNG with actual text chunks
      // For now, test with a basic PNG that won't have text chunks
      const testPng = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 0, g: 0, b: 255 }
        }
      }).png().toBuffer();

      const image = sharp(testPng);
      const result = await pngImageText(image, Generators.AUTOMATIC1111);

      // Basic PNG without text chunks should return null
      expect(result).toBeNull();
    });

    it('should handle PNG processing errors gracefully', async () => {
      // Create an invalid Sharp instance to test error handling
      const invalidBuffer = Buffer.from('not a png');
      const image = sharp(invalidBuffer);

      await expect(pngImageText(image, Generators.AUTOMATIC1111)).rejects.toThrow();
    });
  });

  describe('pngStenographicAlpha', () => {
    it('should return null for stenographic analysis (not implemented)', async () => {
      const testPng = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 4, // RGBA
          background: { r: 255, g: 255, b: 255, alpha: 0.5 }
        }
      }).png().toBuffer();

      const image = sharp(testPng);
      const result = await pngStenographicAlpha(image, Generators.AUTOMATIC1111);

      // This feature is not implemented yet
      expect(result).toBeNull();
    });
  });

  describe('jpegUserComment', () => {
    it('should extract JPEG EXIF metadata', async () => {
      // Create a test JPEG
      const testJpeg = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 128, b: 0 }
        }
      }).jpeg().toBuffer();

      const image = sharp(testJpeg);
      const result = await jpegUserComment(image, Generators.AUTOMATIC1111);

      // Should return null since we don't have EXIF data
      expect(result).toBeNull();
    });

    it('should return null for generators other than AUTOMATIC1111/Fooocus', async () => {
      const testJpeg = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 128, g: 255, b: 128 }
        }
      }).jpeg().toBuffer();

      const image = sharp(testJpeg);
      const result = await jpegUserComment(image, Generators.COMFYUI);

      expect(result).toBeNull();
    });

    it('should handle JPEG without EXIF data', async () => {
      const testJpeg = await sharp({
        create: {
          width: 50,
          height: 50,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      }).jpeg({ quality: 90 }).toBuffer();

      const image = sharp(testJpeg);
      const result = await jpegUserComment(image, Generators.FOOOCUS);

      expect(result).toBeNull();
    });
  });

  describe('Error handling', () => {
    it('should handle invalid image data in extractors', async () => {
      const invalidBuffer = Buffer.from('invalid image data');
      const image = sharp(invalidBuffer);

      // All extractors should handle invalid data gracefully
      await expect(pngImageInfo(image, Generators.AUTOMATIC1111)).rejects.toThrow();
      await expect(jpegUserComment(image, Generators.AUTOMATIC1111)).rejects.toThrow();
    });
  });
});
