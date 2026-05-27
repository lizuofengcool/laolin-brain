import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { FileText, File, Image as ImageIcon, Presentation, FileCode } from 'lucide-react';
import { formatSize, getFileIcon, getFileColor, formatTime } from '@/lib/file-utils';

describe('formatSize', () => {
  it('returns "0 B" for 0 bytes', () => {
    expect(formatSize(0)).toBe('0 B');
  });

  it('returns bytes for values under 1024', () => {
    expect(formatSize(500)).toBe('500 B');
  });

  it('returns KB for 1024 bytes', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
  });

  it('returns KB for values between 1024 and 1048575', () => {
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('returns MB for 1048576 bytes', () => {
    expect(formatSize(1048576)).toBe('1.0 MB');
  });

  it('returns MB for 1073741824 bytes (1 GB shown as MB)', () => {
    expect(formatSize(1073741824)).toBe('1024.0 MB');
  });
});

describe('getFileIcon', () => {
  const fileTypes = ['word', 'pdf', 'image', 'pptx', 'markdown', 'txt', 'other'];

  it.each(fileTypes)('returns a valid LucideIcon for fileType "%s"', (fileType) => {
    const icon = getFileIcon(fileType);
    // In React 19, lucide icons are objects (forwardRef), not plain functions
    expect(icon).toBeDefined();
    expect(icon).not.toBeNull();
    // Check it has the render/displayName properties of a React component
    expect(typeof icon === 'function' || typeof icon === 'object').toBe(true);
  });

  it('returns FileText for "word"', () => {
    expect(getFileIcon('word')).toBe(FileText);
  });

  it('returns File for "pdf"', () => {
    expect(getFileIcon('pdf')).toBe(File);
  });

  it('returns ImageIcon for "image"', () => {
    expect(getFileIcon('image')).toBe(ImageIcon);
  });

  it('returns Presentation for "pptx"', () => {
    expect(getFileIcon('pptx')).toBe(Presentation);
  });

  it('returns FileCode for "markdown"', () => {
    expect(getFileIcon('markdown')).toBe(FileCode);
  });

  it('returns FileCode for "txt"', () => {
    expect(getFileIcon('txt')).toBe(FileCode);
  });

  it('returns File for unknown types', () => {
    expect(getFileIcon('other')).toBe(File);
    expect(getFileIcon('unknown')).toBe(File);
  });
});

describe('getFileColor', () => {
  it('returns a string for each known fileType', () => {
    const types = ['word', 'pdf', 'image', 'pptx', 'markdown', 'txt', 'other'];
    for (const t of types) {
      const result = getFileColor(t);
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    }
  });

  it('returns Tailwind classes for word', () => {
    expect(getFileColor('word')).toContain('text-blue-600');
    expect(getFileColor('word')).toContain('bg-blue-50');
  });

  it('returns Tailwind classes for pdf', () => {
    expect(getFileColor('pdf')).toContain('text-red-600');
    expect(getFileColor('pdf')).toContain('bg-red-50');
  });

  it('returns Tailwind classes for image', () => {
    expect(getFileColor('image')).toContain('text-green-600');
    expect(getFileColor('image')).toContain('bg-green-50');
  });

  it('returns Tailwind classes for pptx', () => {
    expect(getFileColor('pptx')).toContain('text-orange-600');
    expect(getFileColor('pptx')).toContain('bg-orange-50');
  });

  it('returns Tailwind classes for markdown/txt', () => {
    expect(getFileColor('markdown')).toContain('text-purple-600');
    expect(getFileColor('txt')).toContain('text-purple-600');
  });

  it('returns gray Tailwind classes for unknown types', () => {
    expect(getFileColor('other')).toContain('text-gray-600');
    expect(getFileColor('other')).toContain('bg-gray-50');
  });
});

describe('formatTime', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "刚刚" for just now', () => {
    const now = new Date();
    expect(formatTime(now)).toBe('刚刚');
  });

  it('returns "X 分钟前" for minutes ago', () => {
    const fiveMinAgo = new Date('2025-01-15T11:55:00Z');
    expect(formatTime(fiveMinAgo)).toBe('5 分钟前');
  });

  it('returns "X 小时前" for hours ago', () => {
    const twoHoursAgo = new Date('2025-01-15T10:00:00Z');
    expect(formatTime(twoHoursAgo)).toBe('2 小时前');
  });

  it('returns "X 天前" for days ago', () => {
    const threeDaysAgo = new Date('2025-01-12T12:00:00Z');
    expect(formatTime(threeDaysAgo)).toBe('3 天前');
  });

  it('returns formatted date string for dates > 7 days ago', () => {
    const tenDaysAgo = new Date('2025-01-05T12:00:00Z');
    const result = formatTime(tenDaysAgo);
    // Should be a formatted date, not "刚刚" or "X ... 前"
    expect(result).not.toContain('刚刚');
    expect(result).not.toContain('分钟前');
    expect(result).not.toContain('小时前');
    expect(result).not.toContain('天前');
    // Should contain date-like characters (e.g. "2025/1/5")
    expect(result).toMatch(/\d{4}/);
  });

  it('handles string date input', () => {
    const fiveMinAgoStr = '2025-01-15T11:55:00Z';
    expect(formatTime(fiveMinAgoStr)).toBe('5 分钟前');
  });
});
