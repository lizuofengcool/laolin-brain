/**
 * 笔记类型定义
 */

// 笔记状态
export type NoteStatus = 'active' | 'archived' | 'deleted';

// 笔记格式
export type NoteFormat = 'markdown' | 'html' | 'plaintext';

// 笔记本
export interface Notebook {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  coverImage?: string;
  noteCount: number;
  sortOrder: number;
  isDefault: boolean;
  isFavorite: boolean;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  userId: string;
}

// 笔记标签
export interface NoteTag {
  id: string;
  name: string;
  color?: string;
  noteCount: number;
  createdAt: Date;
  tenantId: string;
  userId: string;
}

// 笔记
export interface Note {
  id: string;
  title: string;
  content: string;
  summary?: string;
  format: NoteFormat;
  status: NoteStatus;
  notebookId?: string;
  tags: string[];
  wordCount: number;
  readingTime: number; // 分钟
  isFavorite: boolean;
  isPinned: boolean;
  coverImage?: string;
  attachments: string[];
  relatedNotes: string[];
  createdAt: Date;
  updatedAt: Date;
  lastAccessedAt?: Date;
  tenantId: string;
  userId: string;
}

// 笔记版本
export interface NoteVersion {
  id: string;
  noteId: string;
  version: number;
  title: string;
  content: string;
  format: NoteFormat;
  changeLog?: string;
  createdBy: string;
  createdAt: Date;
  tenantId: string;
}

// 笔记搜索结果
export interface NoteSearchResult {
  notes: Note[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  highlights?: Record<string, string[]>;
}

// 笔记统计
export interface NoteStats {
  totalNotes: number;
  totalNotebooks: number;
  totalTags: number;
  totalWords: number;
  totalReadingTime: number;
  favoriteNotes: number;
  pinnedNotes: number;
  archivedNotes: number;
  thisWeekNew: number;
  thisMonthNew: number;
  topNotebooks: { id: string; name: string; count: number }[];
  topTags: { id: string; name: string; count: number }[];
}

// 创建笔记本参数
export interface CreateNotebookParams {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  coverImage?: string;
}

// 创建笔记参数
export interface CreateNoteParams {
  title: string;
  content: string;
  format?: NoteFormat;
  summary?: string;
  notebookId?: string;
  tags?: string[];
  coverImage?: string;
  attachments?: string[];
  relatedNotes?: string[];
  isFavorite?: boolean;
  isPinned?: boolean;
}

// 更新笔记参数
export interface UpdateNoteParams {
  title?: string;
  content?: string;
  summary?: string;
  format?: NoteFormat;
  status?: NoteStatus;
  notebookId?: string;
  tags?: string[];
  coverImage?: string;
  attachments?: string[];
  relatedNotes?: string[];
  isFavorite?: boolean;
  isPinned?: boolean;
  changeLog?: string;
}

// 笔记搜索参数
export interface NoteSearchParams {
  query?: string;
  notebookId?: string;
  tags?: string[];
  status?: NoteStatus;
  isFavorite?: boolean;
  isPinned?: boolean;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'title' | 'wordCount';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  searchMode?: 'keyword' | 'semantic' | 'hybrid';
}

// 笔记导入导出格式
export type NoteExportFormat = 'markdown' | 'json' | 'html' | 'pdf';

// 笔记分享
export interface NoteShare {
  id: string;
  noteId: string;
  token: string;
  password?: string;
  expiresAt?: Date;
  viewCount: number;
  isEnabled: boolean;
  createdAt: Date;
  tenantId: string;
  userId: string;
}
