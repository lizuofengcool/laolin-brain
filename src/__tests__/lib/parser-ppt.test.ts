import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deflateRawSync } from 'zlib';

import { parsePptx } from '@/lib/parser/ppt';

/**
 * Build a raw buffer with Local File Headers only.
 * The parser scans byte-by-byte for LFH signatures (PK\x03\x04).
 */
function buildSlideBuffer(
  slideXml: Buffer,
  options?: { compressionMethod?: number; extraEntries?: Array<{ name: string; data: Buffer }> }
): Buffer {
  const entries = [...(options?.extraEntries ?? [])];

  // CRC-32 helper
  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  // Add the main slide entry
  entries.push({
    name: 'ppt/slides/slide1.xml',
    data: slideXml,
    compressionMethod: options?.compressionMethod ?? 0,
  });

  const parts: Buffer[] = [];
  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, 'utf-8');
    const cm = entry.compressionMethod ?? 0;
    let compressedData = entry.data;
    if (cm === 8) {
      compressedData = deflateRawSync(entry.data);
    }
    const crc = crc32(entry.data);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(cm, 8);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressedData.length, 18);
    lfh.writeUInt32LE(entry.data.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    parts.push(lfh, nameBuf, compressedData);
  }

  return Buffer.concat(parts);
}

/** Build a buffer with two slides (for multi-slide testing) */
function buildMultiSlideBuffer(
  slides: Array<{ num: number; text: string }>,
  compressed?: boolean
): Buffer {
  function crc32(buf: Buffer): number {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
      crc ^= buf[i];
      for (let j = 0; j < 8; j++) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
  const nsP = 'http://schemas.openxmlformats.org/presentationml/2006/main';

  // Build each slide entry independently with its own LFH
  const parts: Buffer[] = [];
  for (const slide of slides) {
    const xml = Buffer.from(
      `<p:sld xmlns:a="${ns}" xmlns:p="${nsP}"><p:sp><p:txBody><a:p><a:r><a:t>${slide.text}</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`
    );
    const nameBuf = Buffer.from(`ppt/slides/slide${slide.num}.xml`, 'utf-8');
    const cm = compressed ? 8 : 0;
    let compressedData = xml;
    if (cm === 8) compressedData = deflateRawSync(xml);
    const crc = crc32(xml);

    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt16LE(cm, 8);
    lfh.writeUInt32LE(crc, 14);
    lfh.writeUInt32LE(compressedData.length, 18);
    lfh.writeUInt32LE(xml.length, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);

    parts.push(lfh, nameBuf, compressedData);
  }

  return Buffer.concat(parts);
}

describe('parsePptx', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─── Error / edge cases ────────────────────────────────────

  it('returns fallback message when no valid PPTX content', async () => {
    const buffer = Buffer.from('fake pptx content');
    const result = await parsePptx(buffer);
    expect(result).toBe('（PPT 文件内容无法提取）');
  });

  it('returns fallback message when buffer is empty', async () => {
    const buffer = Buffer.from('');
    const result = await parsePptx(buffer);
    expect(result).toBe('（PPT 文件内容无法提取）');
  });

  it('does not throw for any input', async () => {
    const buffer = Buffer.from('anything');
    await expect(parsePptx(buffer)).resolves.toBeDefined();
  });

  it('returns string type', async () => {
    const buffer = Buffer.from('fake pptx');
    const result = await parsePptx(buffer);
    expect(typeof result).toBe('string');
  });

  it('handles large input without crashing', async () => {
    const buffer = Buffer.alloc(1024 * 1024, 'A');
    const result = await parsePptx(buffer);
    expect(typeof result).toBe('string');
  });

  it('always returns a string even on error', async () => {
    const promises = [
      parsePptx(Buffer.from('')),
      parsePptx(Buffer.from('corrupt')),
      parsePptx(Buffer.alloc(0)),
    ];
    const results = await Promise.all(promises);
    for (const result of results) {
      expect(typeof result).toBe('string');
    }
  });

  // ─── Valid PPTX parsing ───────────────────────────────────

  it('extracts text from a single-slide stored PPTX', async () => {
    const slideXml = Buffer.from(
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sp><p:txBody><a:p><a:r><a:t>Hello World</a:t></a:r></a:p></p:txBody></p:sp>' +
      '</p:sld>'
    );
    const buffer = buildSlideBuffer(slideXml);
    const result = await parsePptx(buffer);
    expect(result).toContain('Hello World');
    expect(result).toContain('第 1 页');
  });

  it('extracts text from a single-slide compressed PPTX', async () => {
    const slideXml = Buffer.from(
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sp><p:txBody><a:p><a:r><a:t>Compressed content</a:t></a:r></a:p></p:txBody></p:sp>' +
      '</p:sld>'
    );
    const buffer = buildSlideBuffer(slideXml, { compressionMethod: 8 });
    const result = await parsePptx(buffer);
    expect(result).toContain('Compressed content');
    expect(result).toContain('第 1 页');
  });

  it('extracts text from multiple stored slides', async () => {
    const buffer = buildMultiSlideBuffer([
      { num: 1, text: 'Slide One' },
      { num: 2, text: 'Slide Two' },
    ]);
    const result = await parsePptx(buffer);
    expect(result).toContain('Slide One');
    expect(result).toContain('Slide Two');
    expect(result).toContain('第 1 页');
    expect(result).toContain('第 2 页');
  });

  it('extracts text from multiple compressed slides', async () => {
    const buffer = buildMultiSlideBuffer(
      [{ num: 1, text: 'Alpha' }, { num: 2, text: 'Beta' }],
      true
    );
    const result = await parsePptx(buffer);
    expect(result).toContain('Alpha');
    expect(result).toContain('Beta');
  });

  it('extracts text from three slides', async () => {
    const buffer = buildMultiSlideBuffer([
      { num: 1, text: 'First' },
      { num: 2, text: 'Second' },
      { num: 3, text: 'Third' },
    ]);
    const result = await parsePptx(buffer);
    expect(result).toContain('First');
    expect(result).toContain('Second');
    expect(result).toContain('Third');
    expect(result).toContain('第 3 页');
  });

  it('returns fallback when PPTX has no slide XML files', async () => {
    const buffer = buildSlideBuffer(
      Buffer.from('<Types/>'),
      { extraEntries: [{ name: '[Content_Types].xml', data: Buffer.from('<Types/>') }] }
    );
    // Need a buffer with entries but no slides
    const parts: Buffer[] = [];
    const nameBuf = Buffer.from('[Content_Types].xml', 'utf-8');
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);
    lfh.writeUInt16LE(20, 4);
    lfh.writeUInt32LE(0, 8); // compression method: stored
    lfh.writeUInt32LE(0x32eb4b78, 14); // CRC
    lfh.writeUInt32LE(7, 18);
    lfh.writeUInt32LE(7, 22);
    lfh.writeUInt16LE(nameBuf.length, 26);
    parts.push(lfh, nameBuf, Buffer.from('<Types/>'));

    const result = await parsePptx(Buffer.concat(parts));
    expect(result).toBe('（PPT 文件内容无法提取）');
  });

  it('handles slides with empty text content', async () => {
    const slideXml = Buffer.from(
      '<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main">' +
      '<p:sp><p:txBody><a:p><a:r><a:t></a:t></a:r></a:p></p:txBody></p:sp>' +
      '</p:sld>'
    );
    const buffer = buildSlideBuffer(slideXml);
    const result = await parsePptx(buffer);
    // Empty a:t tags produce no text
    expect(result).toBe('（PPT 文件内容无法提取）');
  });

  it('skips entries with unknown compression method', async () => {
    // Build a buffer with one stored slide and one unknown compression
    function crc32(buf: Buffer): number {
      let crc = 0xffffffff;
      for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
          crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
        }
      }
      return (crc ^ 0xffffffff) >>> 0;
    }

    const ns = 'http://schemas.openxmlformats.org/drawingml/2006/main';
    const nsP = 'http://schemas.openxmlformats.org/presentationml/2006/main';
    const goodXml = Buffer.from(
      `<p:sld xmlns:a="${ns}" xmlns:p="${nsP}"><p:sp><p:txBody><a:p><a:r><a:t>Stored</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`
    );
    const goodName = Buffer.from('ppt/slides/slide1.xml', 'utf-8');
    const goodLfh = Buffer.alloc(30);
    goodLfh.writeUInt32LE(0x04034b50, 0);
    goodLfh.writeUInt16LE(20, 4);
    goodLfh.writeUInt32LE(0, 8);
    goodLfh.writeUInt32LE(crc32(goodXml), 14);
    goodLfh.writeUInt32LE(goodXml.length, 18);
    goodLfh.writeUInt32LE(goodXml.length, 22);
    goodLfh.writeUInt16LE(goodName.length, 26);

    const badData = Buffer.from('some data');
    const badName = Buffer.from('ppt/slides/slide2.xml', 'utf-8');
    const badLfh = Buffer.alloc(30);
    badLfh.writeUInt32LE(0x04034b50, 0);
    badLfh.writeUInt16LE(20, 4);
    badLfh.writeUInt32LE(99, 8); // Unknown compression
    badLfh.writeUInt32LE(crc32(badData), 14);
    badLfh.writeUInt32LE(badData.length, 18);
    badLfh.writeUInt32LE(badData.length, 22);
    badLfh.writeUInt16LE(badName.length, 26);

    const buffer = Buffer.concat([
      goodLfh, goodName, goodXml,
      badLfh, badName, badData,
    ]);
    const result = await parsePptx(buffer);
    expect(result).toContain('Stored');
    expect(result).toContain('第 1 页');
  });

  it('extracts Chinese text from slides', async () => {
    const buffer = buildMultiSlideBuffer([
      { num: 1, text: '你好世界' },
    ]);
    const result = await parsePptx(buffer);
    expect(result).toContain('你好世界');
    expect(result).toContain('第 1 页');
  });
});
