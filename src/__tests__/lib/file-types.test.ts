import { describe, it, expect } from 'vitest';

// utils/file-types.ts：纯文件格式工具模块（零 import 依赖）。
// 导出 FileCategory/FileTypeInfo 类型、FILE_TYPES 大表（92 项）、13 个纯函数：
//   getFileTypeInfo / getFileExtension / getDoubleExtension / getFileCategory /
//   isPreviewable / isSearchable / isAiProcessable / getFileCategories /
//   formatFileSize / getMimeType / isImage / isVideo / isAudio / isDocument / isCode /
//   getSupportedImageFormats / getSupportedVideoFormats / getSupportedAudioFormats
// 关键控制流：
//   · getFileTypeInfo 先查双扩展名（.tar.gz）再查单扩展名，命中返回表项「引用」；未命中返回默认项（extension=ext，无 previewType/searchable/aiProcessable）
//   · getFileExtension lastDot===-1 或 lastDot===0（dotfile）均返回 ""；只取最后一个点之后
//   · getDoubleExtension 需 split 后 parts.length>=3，取最后两段拼 ".x.y"；否则 ""
//   · isSearchable/isAiProcessable 对 undefined 用 ?? false 兜底
//   · formatFileSize 仅 bytes===0 早返回 "0 B"；其余走 Math.log/Math.pow，负数无守卫（行为锁定见下）
//   · getSupportedXxxFormats 过滤 category 匹配且 previewable=true，map 出 extension
import {
  FILE_TYPES,
  getFileTypeInfo,
  getFileExtension,
  getDoubleExtension,
  getFileCategory,
  isPreviewable,
  isSearchable,
  isAiProcessable,
  getFileCategories,
  formatFileSize,
  getMimeType,
  isImage,
  isVideo,
  isAudio,
  isDocument,
  isCode,
  getSupportedImageFormats,
  getSupportedVideoFormats,
  getSupportedAudioFormats,
} from '@/lib/utils/file-types';
import type { FileCategory } from '@/lib/utils/file-types';

describe('utils/file-types', () => {
  describe('FILE_TYPES 大表不变量', () => {
    it('共 92 个条目', () => {
      expect(Object.keys(FILE_TYPES).length).toBe(92);
    });

    it('每个 key 与条目 extension 字段一致（全表扫描）', () => {
      for (const [key, info] of Object.entries(FILE_TYPES)) {
        expect(info.extension).toBe(key);
      }
    });

    it('每个条目含必填字段且 category 落在枚举内', () => {
      const validCats: FileCategory[] = [
        'document', 'image', 'video', 'audio', 'archive',
        'code', 'data', 'ebook', 'font', 'presentation', 'spreadsheet', 'other',
      ];
      for (const info of Object.values(FILE_TYPES)) {
        expect(typeof info.extension).toBe('string');
        expect(typeof info.mimeType).toBe('string');
        expect(info.mimeType.length).toBeGreaterThan(0);
        expect(validCats).toContain(info.category);
        expect(typeof info.name).toBe('string');
        expect(typeof info.icon).toBe('string');
        expect(typeof info.color).toBe('string');
        expect(info.color).toMatch(/^#[0-9a-f]{6}$/i);
        expect(typeof info.previewable).toBe('boolean');
      }
    });

    it('previewable=true 的条目必带 previewType', () => {
      for (const info of Object.values(FILE_TYPES)) {
        if (info.previewable) {
          expect(info.previewType).toBeDefined();
        }
      }
    });

    it('category 分布计数（document 8 / spreadsheet 5 / presentation 3 / image 14 / video 10 / audio 10 / archive 8 / code 20 / data 4 / ebook 5 / font 5）', () => {
      const countBy = (cat: FileCategory) =>
        Object.values(FILE_TYPES).filter((f) => f.category === cat).length;
      expect(countBy('document')).toBe(8);
      expect(countBy('spreadsheet')).toBe(5);
      expect(countBy('presentation')).toBe(3);
      expect(countBy('image')).toBe(14);
      expect(countBy('video')).toBe(10);
      expect(countBy('audio')).toBe(10);
      expect(countBy('archive')).toBe(8);
      expect(countBy('code')).toBe(20);
      expect(countBy('data')).toBe(4);
      expect(countBy('ebook')).toBe(5);
      expect(countBy('font')).toBe(5);
      expect(countBy('other')).toBe(0); // 表内无 other，仅默认项
    });

    it('.tar.gz 双扩展名条目存在且 category=archive', () => {
      expect(FILE_TYPES['.tar.gz']).toBeDefined();
      expect(FILE_TYPES['.tar.gz'].category).toBe('archive');
      expect(FILE_TYPES['.tar.gz'].name).toBe('TAR.GZ压缩包');
    });
  });

  describe('getFileExtension', () => {
    it('普通文件取最后一个点之后（含点）', () => {
      expect(getFileExtension('readme.txt')).toBe('.txt');
      expect(getFileExtension('a.b.c')).toBe('.c');
    });

    it('无扩展名（无点）返回空串', () => {
      expect(getFileExtension('README')).toBe('');
      expect(getFileExtension('Makefile')).toBe('');
    });

    it('dotfile（点在第 0 位）返回空串', () => {
      expect(getFileExtension('.gitignore')).toBe('');
      expect(getFileExtension('.env')).toBe('');
    });

    it('保留原始大小写（不做 lowercase）', () => {
      expect(getFileExtension('photo.JPG')).toBe('.JPG');
      expect(getFileExtension('photo.TAR.GZ')).toBe('.GZ');
    });

    it('路径分隔符不影响（仅按点切分）', () => {
      expect(getFileExtension('/a/b/c/file.ts')).toBe('.ts');
      expect(getFileExtension('C:\\Users\\file.json')).toBe('.json');
    });
  });

  describe('getDoubleExtension', () => {
    it('三段及以上取最后两段拼 .x.y', () => {
      expect(getDoubleExtension('archive.tar.gz')).toBe('.tar.gz');
      expect(getDoubleExtension('a.b.c.d')).toBe('.c.d');
    });

    it('仅两段（普通单扩展名）返回空串', () => {
      expect(getDoubleExtension('file.txt')).toBe('');
    });

    it('单段（无扩展名）返回空串', () => {
      expect(getDoubleExtension('README')).toBe('');
    });

    it('dotfile 视为两段返回空串', () => {
      expect(getDoubleExtension('.gitignore')).toBe('');
    });

    it('保留原始大小写', () => {
      expect(getDoubleExtension('ARCHIVE.TAR.GZ')).toBe('.TAR.GZ');
    });
  });

  describe('getFileTypeInfo', () => {
    it('命中单扩展名返回表项「引用」', () => {
      const info = getFileTypeInfo('readme.txt');
      expect(info).toBe(FILE_TYPES['.txt']);
      expect(info.category).toBe('document');
      expect(info.mimeType).toBe('text/plain');
      expect(info.previewType).toBe('text');
      expect(info.searchable).toBe(true);
      expect(info.aiProcessable).toBe(true);
    });

    it('双扩展名优先于单扩展名（.tar.gz 命中 archive 而非 .gz 的 GZIP）', () => {
      const info = getFileTypeInfo('backup.tar.gz');
      expect(info).toBe(FILE_TYPES['.tar.gz']);
      expect(info.name).toBe('TAR.GZ压缩包');
      // 对比：仅取单扩展名 .gz 会得到 GZIP压缩，证明双扩展名优先
      expect(FILE_TYPES['.gz'].name).toBe('GZIP压缩');
      expect(info.name).not.toBe(FILE_TYPES['.gz'].name);
    });

    it('双扩展名未命中时回退单扩展名', () => {
      // .config.json 的双扩展名 .config.json 不在表中，回退到 .json
      const info = getFileTypeInfo('app.config.json');
      expect(info).toBe(FILE_TYPES['.json']);
      expect(info.category).toBe('data');
    });

    it('大小写不敏感（内部 lowercased 查表）', () => {
      expect(getFileTypeInfo('PHOTO.JPG')).toBe(FILE_TYPES['.jpg']);
      expect(getFileTypeInfo('ARCHIVE.TAR.GZ')).toBe(FILE_TYPES['.tar.gz']);
      expect(getFileTypeInfo('Index.MD')).toBe(FILE_TYPES['.md']);
    });

    it('未知扩展名返回默认项（other / octet-stream / previewable=false）', () => {
      const info = getFileTypeInfo('data.xyz');
      expect(info.extension).toBe('.xyz');
      expect(info.mimeType).toBe('application/octet-stream');
      expect(info.category).toBe('other');
      expect(info.name).toBe('未知文件');
      expect(info.icon).toBe('file');
      expect(info.color).toBe('#6b7280');
      expect(info.previewable).toBe(false);
      // 默认项不含 previewType / searchable / aiProcessable
      expect(info.previewType).toBeUndefined();
      expect(info.searchable).toBeUndefined();
      expect(info.aiProcessable).toBeUndefined();
    });

    it('无扩展名返回默认项且 extension 为空串', () => {
      const info = getFileTypeInfo('README');
      expect(info.extension).toBe('');
      expect(info.category).toBe('other');
      expect(info.mimeType).toBe('application/octet-stream');
    });

    it('dotfile 返回默认项（extension 空串）', () => {
      const info = getFileTypeInfo('.gitignore');
      expect(info.extension).toBe('');
      expect(info.category).toBe('other');
    });

    it('跨分类抽样：document/image/video/audio/code/data/ebook/font/archive/presentation/spreadsheet', () => {
      expect(getFileTypeInfo('a.pdf').category).toBe('document');
      expect(getFileTypeInfo('a.png').category).toBe('image');
      expect(getFileTypeInfo('a.mp4').category).toBe('video');
      expect(getFileTypeInfo('a.mp3').category).toBe('audio');
      expect(getFileTypeInfo('a.ts').category).toBe('code');
      expect(getFileTypeInfo('a.json').category).toBe('data');
      expect(getFileTypeInfo('a.epub').category).toBe('ebook');
      expect(getFileTypeInfo('a.woff2').category).toBe('font');
      expect(getFileTypeInfo('a.zip').category).toBe('archive');
      expect(getFileTypeInfo('a.pptx').category).toBe('presentation');
      expect(getFileTypeInfo('a.xlsx').category).toBe('spreadsheet');
    });
  });

  describe('getFileCategory', () => {
    it('委托 getFileTypeInfo().category', () => {
      expect(getFileCategory('song.mp3')).toBe('audio');
      expect(getFileCategory('clip.mp4')).toBe('video');
      expect(getFileCategory('note.txt')).toBe('document');
    });

    it('未知文件返回 other', () => {
      expect(getFileCategory('unknown.zzz')).toBe('other');
    });
  });

  describe('isPreviewable', () => {
    it('previewable=true 的文件返回 true', () => {
      expect(isPreviewable('photo.png')).toBe(true);
      expect(isPreviewable('clip.mp4')).toBe(true);
      expect(isPreviewable('note.txt')).toBe(true);
    });

    it('previewable=false 的已知文件返回 false', () => {
      expect(isPreviewable('doc.docx')).toBe(false);
      expect(isPreviewable('clip.avi')).toBe(false);
      expect(isPreviewable('song.flac')).toBe(false);
      expect(isPreviewable('arch.7z')).toBe(false);
    });

    it('未知文件返回 false（默认项 previewable=false）', () => {
      expect(isPreviewable('unknown.zzz')).toBe(false);
    });
  });

  describe('isSearchable（undefined → ?? false 兜底）', () => {
    it('searchable=true 返回 true', () => {
      expect(isSearchable('note.txt')).toBe(true);
      expect(isSearchable('code.ts')).toBe(true);
    });

    it('searchable 未定义的已知文件返回 false（.gif 无 searchable 字段）', () => {
      expect(FILE_TYPES['.gif'].searchable).toBeUndefined();
      expect(isSearchable('anim.gif')).toBe(false);
    });

    it('未知文件返回 false（默认项无 searchable）', () => {
      expect(isSearchable('unknown.zzz')).toBe(false);
    });
  });

  describe('isAiProcessable（undefined → ?? false 兜底）', () => {
    it('aiProcessable=true 返回 true', () => {
      expect(isAiProcessable('note.txt')).toBe(true);
      expect(isAiProcessable('photo.png')).toBe(true);
    });

    it('aiProcessable 未定义的已知文件返回 false（.gif 无 aiProcessable）', () => {
      expect(FILE_TYPES['.gif'].aiProcessable).toBeUndefined();
      expect(isAiProcessable('anim.gif')).toBe(false);
    });

    it('未知文件返回 false', () => {
      expect(isAiProcessable('unknown.zzz')).toBe(false);
    });
  });

  describe('getFileCategories', () => {
    it('返回 12 个分类，顺序固定', () => {
      const cats = getFileCategories();
      expect(cats).toHaveLength(12);
      expect(cats.map((c) => c.id)).toEqual([
        'document', 'spreadsheet', 'presentation', 'image', 'video', 'audio',
        'archive', 'code', 'data', 'ebook', 'font', 'other',
      ]);
    });

    it('每项含 id/name/icon', () => {
      for (const c of getFileCategories()) {
        expect(typeof c.id).toBe('string');
        expect(typeof c.name).toBe('string');
        expect(typeof c.icon).toBe('string');
      }
    });
  });

  describe('formatFileSize', () => {
    it('0 早返回 "0 B"', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });

    it('小于 1KB 保持 B 单位', () => {
      expect(formatFileSize(1)).toBe('1 B');
      expect(formatFileSize(512)).toBe('512 B');
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('1024 边界进入 KB', () => {
      expect(formatFileSize(1024)).toBe('1 KB');
    });

    it('小数保留两位（parseFloat 去尾零）', () => {
      expect(formatFileSize(1536)).toBe('1.5 KB'); // 1.50 → parseFloat → 1.5
      expect(formatFileSize(1500)).toBe('1.46 KB'); // 1500/1024=1.46484 → 1.46
    });

    it('MB / GB / TB / PB 边界', () => {
      expect(formatFileSize(1024 ** 2)).toBe('1 MB');
      expect(formatFileSize(1024 ** 3)).toBe('1 GB');
      expect(formatFileSize(1024 ** 4)).toBe('1 TB');
      expect(formatFileSize(1024 ** 5)).toBe('1 PB');
    });

    it('sizes 数组上限为 PB（6 个单位 B/KB/MB/GB/TB/PB）', () => {
      // 2 * 1024^5 仍在 PB 区间（i=5）
      expect(formatFileSize(2 * 1024 ** 5)).toBe('2 PB');
    });

    it('负数无守卫：Math.log(-1)=NaN → "NaN undefined"（锁定当前行为）', () => {
      // 已知未守护分支：bytes===0 早返回之外，负数走 Math.log 产生 NaN，
      // sizes[NaN]=undefined，结果为 "NaN undefined"。此用例锁定当前行为，
      // 若后续加负数守卫需同步更新。
      expect(formatFileSize(-1)).toBe('NaN undefined');
      expect(formatFileSize(-1024)).toBe('NaN undefined');
    });
  });

  describe('getMimeType', () => {
    it('委托 getFileTypeInfo().mimeType', () => {
      expect(getMimeType('note.txt')).toBe('text/plain');
      expect(getMimeType('photo.png')).toBe('image/png');
      expect(getMimeType('clip.mp4')).toBe('video/mp4');
    });

    it('未知文件返回 application/octet-stream', () => {
      expect(getMimeType('unknown.zzz')).toBe('application/octet-stream');
    });
  });

  describe('isImage / isVideo / isAudio / isDocument / isCode', () => {
    it('isImage：image 分类为 true，其余 false', () => {
      expect(isImage('photo.png')).toBe(true);
      expect(isImage('clip.mp4')).toBe(false);
      expect(isImage('note.txt')).toBe(false);
    });

    it('isVideo：video 分类为 true，其余 false', () => {
      expect(isVideo('clip.mp4')).toBe(true);
      expect(isVideo('photo.png')).toBe(false);
      expect(isVideo('song.mp3')).toBe(false);
    });

    it('isAudio：audio 分类为 true，其余 false', () => {
      expect(isAudio('song.mp3')).toBe(true);
      expect(isAudio('clip.mp4')).toBe(false);
    });

    it('isDocument：document 分类为 true（.md 也算 document）', () => {
      expect(isDocument('note.txt')).toBe(true);
      expect(isDocument('readme.md')).toBe(true);
      expect(isDocument('code.ts')).toBe(false);
    });

    it('isCode：code 分类为 true（.json 属 data 不算 code）', () => {
      expect(isCode('app.ts')).toBe(true);
      expect(isCode('app.py')).toBe(true);
      expect(isCode('data.json')).toBe(false);
      expect(isCode('note.txt')).toBe(false);
    });

    it('未知文件这些判断均为 false（category=other）', () => {
      expect(isImage('x.zzz')).toBe(false);
      expect(isVideo('x.zzz')).toBe(false);
      expect(isAudio('x.zzz')).toBe(false);
      expect(isDocument('x.zzz')).toBe(false);
      expect(isCode('x.zzz')).toBe(false);
    });
  });

  describe('getSupportedImageFormats', () => {
    it('返回 image 且 previewable 的扩展名（9 项）', () => {
      const fmts = getSupportedImageFormats();
      expect(fmts).toEqual(
        expect.arrayContaining([
          '.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico', '.avif',
        ]),
      );
      expect(fmts).toHaveLength(9);
    });

    it('排除 previewable=false 的图片（heic/heif/tiff/tif/raw）', () => {
      const fmts = getSupportedImageFormats();
      expect(fmts).not.toContain('.heic');
      expect(fmts).not.toContain('.heif');
      expect(fmts).not.toContain('.tiff');
      expect(fmts).not.toContain('.tif');
      expect(fmts).not.toContain('.raw');
    });
  });

  describe('getSupportedVideoFormats', () => {
    it('返回 video 且 previewable 的扩展名（仅 mp4/webm）', () => {
      expect(getSupportedVideoFormats()).toEqual(['.mp4', '.webm']);
      expect(getSupportedVideoFormats()).toHaveLength(2);
    });
  });

  describe('getSupportedAudioFormats', () => {
    it('返回 audio 且 previewable 的扩展名（mp3/wav/ogg）', () => {
      expect(getSupportedAudioFormats()).toEqual(
        expect.arrayContaining(['.mp3', '.wav', '.ogg']),
      );
      expect(getSupportedAudioFormats()).toHaveLength(3);
    });
  });
});
