import { describe, it, expect } from 'vitest';
import { detectFileType } from '@/lib/file-type';

describe('detectFileType', () => {
  describe('image types', () => {
    it('detects jpg', () => {
      expect(detectFileType('photo.jpg')).toEqual({ type: 'jpg', category: 'image' });
    });

    it('detects jpeg', () => {
      expect(detectFileType('photo.jpeg')).toEqual({ type: 'jpeg', category: 'image' });
    });

    it('detects png', () => {
      expect(detectFileType('screenshot.png')).toEqual({ type: 'png', category: 'image' });
    });

    it('detects gif', () => {
      expect(detectFileType('animation.gif')).toEqual({ type: 'gif', category: 'image' });
    });

    it('detects webp', () => {
      expect(detectFileType('image.webp')).toEqual({ type: 'webp', category: 'image' });
    });

    it('detects svg', () => {
      expect(detectFileType('icon.svg')).toEqual({ type: 'svg', category: 'image' });
    });

    it('uses mimeType for image detection', () => {
      expect(detectFileType('file.dat', 'image/png')).toEqual({ type: 'png', category: 'image' });
    });

    it('prioritizes extension over mimeType', () => {
      const result = detectFileType('photo.jpg', 'application/octet-stream');
      expect(result.category).toBe('image');
    });
  });

  describe('document types', () => {
    it('detects pdf', () => {
      expect(detectFileType('document.pdf')).toEqual({ type: 'pdf', category: 'document' });
    });

    it('detects docx', () => {
      expect(detectFileType('report.docx')).toEqual({ type: 'docx', category: 'document' });
    });

    it('detects xlsx', () => {
      expect(detectFileType('data.xlsx')).toEqual({ type: 'xlsx', category: 'document' });
    });

    it('detects pptx', () => {
      expect(detectFileType('slides.pptx')).toEqual({ type: 'pptx', category: 'document' });
    });

    it('detects txt', () => {
      expect(detectFileType('notes.txt')).toEqual({ type: 'txt', category: 'document' });
    });

    it('detects md', () => {
      expect(detectFileType('readme.md')).toEqual({ type: 'md', category: 'document' });
    });

    it('uses mimeType for document detection', () => {
      const result = detectFileType('file.dat', 'application/pdf');
      expect(result.category).toBe('document');
    });
  });

  describe('video types', () => {
    it('detects mp4', () => {
      expect(detectFileType('video.mp4')).toEqual({ type: 'mp4', category: 'video' });
    });

    it('detects webm', () => {
      expect(detectFileType('clip.webm')).toEqual({ type: 'webm', category: 'video' });
    });
  });

  describe('audio types', () => {
    it('detects mp3', () => {
      expect(detectFileType('song.mp3')).toEqual({ type: 'mp3', category: 'audio' });
    });

    it('detects wav', () => {
      expect(detectFileType('recording.wav')).toEqual({ type: 'wav', category: 'audio' });
    });
  });

  describe('unknown types', () => {
    it('returns other for unknown extension', () => {
      expect(detectFileType('file.xyz')).toEqual({ type: 'xyz', category: 'other' });
    });

    it('handles no extension', () => {
      const result = detectFileType('file');
      expect(result.category).toBe('other');
    });

    it('handles empty filename', () => {
      expect(detectFileType('')).toEqual({ type: 'unknown', category: 'other' });
    });

    it('handles multiple dots', () => {
      expect(detectFileType('archive.tar.gz')).toEqual({ type: 'gz', category: 'other' });
    });

    it('is case insensitive', () => {
      expect(detectFileType('photo.JPG')).toEqual({ type: 'jpg', category: 'image' });
      expect(detectFileType('Document.PDF')).toEqual({ type: 'pdf', category: 'document' });
    });
  });
});
