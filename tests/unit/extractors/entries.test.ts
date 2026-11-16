import {
  decodeUserComment,
  getXmpProperty,
  readExifEntries,
  readExifImageEntries,
  readPngText,
} from '../../../src/extractors';

type Tag = { tag: number; type: number; value: Buffer };

/**
 * Build a minimal TIFF structure with the given IFD0 tags and an optional Exif IFD
 */
function tiff(ifd0: Tag[], exifIfd: Tag[] = [], littleEndian = false): Buffer {
  const u16 = (v: number) => {
    const b = Buffer.alloc(2);
    littleEndian ? b.writeUInt16LE(v) : b.writeUInt16BE(v);
    return b;
  };
  const u32 = (v: number) => {
    const b = Buffer.alloc(4);
    littleEndian ? b.writeUInt32LE(v) : b.writeUInt32BE(v);
    return b;
  };

  const ifd0Tags = exifIfd.length ? [...ifd0, { tag: 0x8769, type: 4, value: Buffer.alloc(4) }] : ifd0;
  const ifdSize = (count: number) => 2 + count * 12 + 4;
  const ifd0Offset = 8;
  const exifOffset = ifd0Offset + ifdSize(ifd0Tags.length);
  let dataOffset = exifOffset + (exifIfd.length ? ifdSize(exifIfd.length) : 0);
  const data: Buffer[] = [];

  const writeIfd = (tags: Tag[]) => {
    const parts: Buffer[] = [u16(tags.length)];
    for (const { tag, type, value } of tags) {
      let field: Buffer;
      if (tag === 0x8769) {
        field = u32(exifOffset);
      } else if (value.length <= 4) {
        field = Buffer.concat([value, Buffer.alloc(4 - value.length)]);
      } else {
        field = u32(dataOffset);
        data.push(value);
        dataOffset += value.length;
      }
      parts.push(u16(tag), u16(type), u32(tag === 0x8769 ? 1 : value.length), field);
    }
    parts.push(u32(0));
    return Buffer.concat(parts);
  };

  const header = Buffer.concat([Buffer.from(littleEndian ? 'II' : 'MM', 'latin1'), u16(42), u32(ifd0Offset)]);
  const ifd0Bytes = writeIfd(ifd0Tags);
  const exifBytes = exifIfd.length ? writeIfd(exifIfd) : Buffer.alloc(0);
  return Buffer.concat([header, ifd0Bytes, exifBytes, ...data]);
}

const ascii = (text: string) => Buffer.from(text + '\0', 'utf-8');
const utf16 = (text: string, littleEndian: boolean) => {
  const le = Buffer.from(text, 'utf16le');
  return littleEndian ? le : Buffer.from(le.map((_, i) => le[i ^ 1]));
};
const unicodeComment = (text: string, littleEndian: boolean) =>
  Buffer.concat([Buffer.from('UNICODE\0', 'latin1'), utf16(text, littleEndian)]);

function jpeg(segments: [number, Buffer][]): Buffer {
  const parts = segments.map(([marker, data]) => {
    const head = Buffer.alloc(4);
    head[0] = 0xff;
    head[1] = marker;
    head.writeUInt16BE(data.length + 2, 2);
    return Buffer.concat([head, data]);
  });
  return Buffer.concat([Buffer.from([0xff, 0xd8]), ...parts, Buffer.from([0xff, 0xd9])]);
}

describe('decodeUserComment', () => {
  it('decodes UTF-16 in either byte order', () => {
    expect(decodeUserComment(unicodeComment('Steps: 20, テスト', false))).toBe('Steps: 20, テスト');
    expect(decodeUserComment(unicodeComment('Steps: 20, テスト', true))).toBe('Steps: 20, テスト');
    expect(decodeUserComment(unicodeComment('Steps: 20', true), false)).toBe('Steps: 20');
    expect(decodeUserComment(unicodeComment('Steps: 20', false), true)).toBe('Steps: 20');
  });

  it('keeps CJK text in the hinted byte order', () => {
    expect(decodeUserComment(unicodeComment('一二三四', true), true)).toBe('一二三四');
    expect(decodeUserComment(unicodeComment('一二三四', false), false)).toBe('一二三四');
  });

  it('decodes ASCII and unprefixed UTF-8', () => {
    expect(decodeUserComment(Buffer.from('ASCII\0\0\0{"a": "é"}\0', 'utf-8'))).toBe('{"a": "é"}');
    expect(decodeUserComment(Buffer.from('{"prompt": {}}', 'utf-8'))).toBe('{"prompt": {}}');
  });
});

describe('readExifEntries', () => {
  it('reads text tags from IFD0 and the Exif IFD', () => {
    const exif = tiff(
      [
        { tag: 0x0131, type: 2, value: ascii('Fooocus v2.5.5') },
        { tag: 0x927c, type: 2, value: ascii('fooocus') },
      ],
      [{ tag: 0x9286, type: 7, value: unicodeComment('a prompt', false) }]
    );
    expect(readExifEntries(exif)).toEqual({ Software: 'Fooocus v2.5.5', MakerNote: 'fooocus', UserComment: 'a prompt' });
  });

  it('reads a UserComment stored in IFD0', () => {
    const exif = tiff([{ tag: 0x9286, type: 2, value: ascii('{"prompt": {}}') }], [], true);
    expect(readExifEntries(Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exif]))).toEqual({ UserComment: '{"prompt": {}}' });
  });

  it('stores labelled values under the chunk name they stand for', () => {
    const exif = tiff([
      { tag: 0x010e, type: 2, value: ascii('Workflow: {"nodes": []}') },
      { tag: 0x010f, type: 2, value: ascii('Prompt: {"1": {}}') },
      { tag: 0x0110, type: 2, value: ascii('http://example.com') },
    ]);
    expect(readExifEntries(exif)).toEqual({ workflow: '{"nodes": []}', prompt: '{"1": {}}', Model: 'http://example.com' });
  });

  it('ignores truncated or invalid data', () => {
    expect(readExifEntries(Buffer.from('nope'))).toEqual({});
    expect(readExifEntries(tiff([{ tag: 0x010e, type: 2, value: ascii('long enough value') }]).subarray(0, 30))).toEqual({});
  });
});

describe('readExifImageEntries', () => {
  it('reads EXIF, comments and XMP from a JPEG and unpacks JSON chunk containers', () => {
    const exif = tiff([], [
      {
        tag: 0x9286,
        type: 7,
        value: unicodeComment(JSON.stringify({ Comment: '{"sampler": "k_euler"}', Description: 'a cat', Software: 'NovelAI' }), true),
      },
    ], true);
    const xmp =
      '<x:xmpmeta><rdf:RDF><rdf:Description xmp:CreatorTool="Draw Things"><dc:description><rdf:Alt>' +
      '<rdf:li xml:lang="x-default">a &amp; b&#xA;Steps: 8</rdf:li></rdf:Alt></dc:description></rdf:Description></rdf:RDF></x:xmpmeta>';
    const file = jpeg([
      [0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exif])],
      [0xe1, Buffer.concat([Buffer.from('http://ns.adobe.com/xap/1.0/\0', 'latin1'), Buffer.from(xmp)])],
      [0xfe, Buffer.from('a comment')],
    ]);

    const entries = readExifImageEntries(file, 'JPEG');
    expect(entries.Comment).toBe('a comment');
    expect(entries.Description).toBe('a & b\nSteps: 8');
    expect(entries.CreatorTool).toBe('Draw Things');
    expect(entries.Software).toBe('NovelAI');
    expect(entries.XMP).toBe(xmp);
  });
});

describe('getXmpProperty', () => {
  it('reads attributes and elements', () => {
    const xmp = `<rdf:Description xmp:CreatorTool='Tool'><exif:UserComment><rdf:Alt><rdf:li>x</rdf:li></rdf:Alt></exif:UserComment><a:b>plain</a:b></rdf:Description>`;
    expect(getXmpProperty(xmp, 'xmp:CreatorTool')).toBe('Tool');
    expect(getXmpProperty(xmp, 'exif:UserComment')).toBe('x');
    expect(getXmpProperty(xmp, 'a:b')).toBe('plain');
    expect(getXmpProperty(xmp, 'missing')).toBeUndefined();
  });
});

describe('readPngText', () => {
  function png(chunks: [string, Buffer][]): Buffer {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(640, 0);
    ihdr.writeUInt32BE(480, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const all: [string, Buffer][] = [['IHDR', ihdr], ...chunks, ['IEND', Buffer.alloc(0)]];
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      ...all.map(([type, data]) => {
        const head = Buffer.alloc(8);
        head.writeUInt32BE(data.length);
        head.write(type, 4, 'latin1');
        return Buffer.concat([head, data, Buffer.alloc(4)]);
      }),
    ]);
  }

  it('decodes UTF-8 in tEXt chunks and keeps latin-1 otherwise', () => {
    const result = readPngText(
      png([
        ['tEXt', Buffer.concat([Buffer.from('generation_data\0'), Buffer.from('{"prompt": "テスト"}')])],
        ['tEXt', Buffer.from('parameters\0caf\xe9', 'latin1')],
      ])
    );
    expect(result.text.generation_data).toBe('{"prompt": "テスト"}');
    expect(result.text.parameters).toBe('café');
    expect(result).toMatchObject({ width: 640, height: 480, colorType: 6 });
  });

  it('reads the eXIf chunk and XMP packets', () => {
    const exif = tiff([{ tag: 0x0131, type: 2, value: ascii('uuid') }], [{ tag: 0x9286, type: 7, value: unicodeComment('Steps: 20', false) }], true);
    const xmp = '<x:xmpmeta><rdf:Description xmp:CreatorTool="Draw Things"/></x:xmpmeta>';
    const result = readPngText(
      png([
        ['eXIf', exif],
        ['iTXt', Buffer.concat([Buffer.from('XML:com.adobe.xmp\0\0\0\0\0'), Buffer.from(xmp)])],
      ])
    );
    expect(result.info).toMatchObject({ UserComment: 'Steps: 20', Software: 'uuid', CreatorTool: 'Draw Things' });
  });
});
