/**
 * 文件类型检测工具（共享版本）
 */

export interface FileTypeInfo {
  type: string;
  category: 'image' | 'document' | 'video' | 'audio' | 'other';
}

/**
 * 根据文件名/扩展名检测文件类型
 */
export function detectFileType(fileName: string, mimeType?: string): FileTypeInfo {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'ico', 'avif'];
  const docExts = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt', 'md', 'csv', 'json'];
  const videoExts = ['mp4', 'webm', 'avi', 'mov', 'mkv'];
  const audioExts = ['mp3', 'wav', 'ogg', 'flac', 'aac'];

  if (imageExts.includes(ext) || mimeType?.startsWith('image/')) {
    return { type: mimeType?.split('/')[1] || ext || 'unknown', category: 'image' };
  }
  if (docExts.includes(ext) || mimeType?.startsWith('application/') || mimeType === 'text/plain') {
    return { type: ext || 'unknown', category: 'document' };
  }
  if (videoExts.includes(ext) || mimeType?.startsWith('video/')) {
    return { type: ext || 'unknown', category: 'video' };
  }
  if (audioExts.includes(ext) || mimeType?.startsWith('audio/')) {
    return { type: ext || 'unknown', category: 'audio' };
  }
  return { type: ext || 'unknown', category: 'other' };
}
