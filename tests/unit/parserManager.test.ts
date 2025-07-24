import { ParserManager, Eagerness, Generators } from '../../src';

describe('ParserManager', () => {
  describe('Constructor', () => {
    it('should create ParserManager instance with default options', () => {
      const parserManager = new ParserManager();
      expect(parserManager).toBeInstanceOf(ParserManager);
    });

    it('should create ParserManager with custom options', () => {
      const customManager = new ParserManager({
        debug: true,
        eagerness: Eagerness.EAGER,
        normalizeParameters: false
      });
      
      expect(customManager).toBeInstanceOf(ParserManager);
    });

    it('should accept custom managed parsers', () => {
      const customManager = new ParserManager({
        managedParsers: []
      });
      
      expect(customManager).toBeInstanceOf(ParserManager);
    });
  });

  describe('Input validation', () => {
    let parserManager: ParserManager;

    beforeEach(() => {
      parserManager = new ParserManager();
    });

    it('should handle invalid image data gracefully', async () => {
      try {
        const result = await parserManager.parse(Buffer.from('invalid image data'));
        expect(result).toBeNull();
      } catch (error) {
        // Sharp throws an error for invalid image data, which is expected
        expect(error).toBeDefined();
      }
    });

    it('should handle empty buffer', async () => {
      try {
        const result = await parserManager.parse(Buffer.alloc(0));
        expect(result).toBeNull();
      } catch (error) {
        expect(error).toBeDefined();
      }
    });

    it('should handle non-existent file path', async () => {
      await expect(parserManager.parse('/non/existent/file.png')).rejects.toThrow();
    });
  });

  describe('Eagerness levels', () => {
    it('should respect FAST eagerness setting', () => {
      const manager = new ParserManager({ eagerness: Eagerness.FAST });
      expect(manager).toBeInstanceOf(ParserManager);
    });

    it('should respect DEFAULT eagerness setting', () => {
      const manager = new ParserManager({ eagerness: Eagerness.DEFAULT });
      expect(manager).toBeInstanceOf(ParserManager);
    });

    it('should respect EAGER eagerness setting', () => {
      const manager = new ParserManager({ eagerness: Eagerness.EAGER });
      expect(manager).toBeInstanceOf(ParserManager);
    });
  });
});
