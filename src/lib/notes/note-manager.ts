/**
 * 笔记管理器
 * 负责笔记的创建、编辑、管理和检索
 */

import type {
  Note,
  Notebook,
  NoteTag,
  NoteVersion,
  NoteSearchResult,
  NoteStats,
  CreateNotebookParams,
  CreateNoteParams,
  UpdateNoteParams,
  NoteSearchParams,
  NoteExportFormat,
} from './types';

export class NoteManager {
  private static instance: NoteManager;
  private notes: Map<string, Note> = new Map();
  private notebooks: Map<string, Notebook> = new Map();
  private tags: Map<string, NoteTag> = new Map();
  private versions: Map<string, NoteVersion[]> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): NoteManager {
    if (!NoteManager.instance) {
      NoteManager.instance = new NoteManager();
    }
    return NoteManager.instance;
  }

  // ==================== 笔记本管理 ====================

  /**
   * 创建笔记本
   */
  public createNotebook(
    params: CreateNotebookParams,
    userId: string,
    tenantId: string
  ): Notebook {
    const id = `nb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const notebook: Notebook = {
      id,
      name: params.name,
      description: params.description,
      icon: params.icon,
      color: params.color,
      coverImage: params.coverImage,
      noteCount: 0,
      sortOrder: 0,
      isDefault: false,
      isFavorite: false,
      createdAt: now,
      updatedAt: now,
      tenantId,
      userId,
    };

    this.notebooks.set(id, notebook);
    return notebook;
  }

  /**
   * 获取笔记本
   */
  public getNotebook(id: string, userId: string, tenantId: string): Notebook | null {
    const notebook = this.notebooks.get(id);
    if (!notebook || notebook.userId !== userId || notebook.tenantId !== tenantId) return null;
    return notebook;
  }

  /**
   * 获取笔记本列表
   */
  public getNotebookList(
    userId: string,
    tenantId: string,
    options?: { sortBy?: string; sortOrder?: 'asc' | 'desc' }
  ): Notebook[] {
    let list = Array.from(this.notebooks.values()).filter(
      (nb) => nb.userId === userId && nb.tenantId === tenantId
    );

    const sortBy = options?.sortBy || 'updatedAt';
    const sortOrder = options?.sortOrder || 'desc';
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof Notebook];
      const bVal = b[sortBy as keyof Notebook];
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    return list;
  }

  /**
   * 更新笔记本
   */
  public updateNotebook(
    id: string,
    updates: Partial<Notebook>,
    userId: string,
    tenantId: string
  ): Notebook | null {
    const notebook = this.notebooks.get(id);
    if (!notebook || notebook.userId !== userId || notebook.tenantId !== tenantId) return null;

    Object.assign(notebook, updates, { updatedAt: new Date() });
    return notebook;
  }

  /**
   * 删除笔记本
   */
  public deleteNotebook(id: string, userId: string, tenantId: string): boolean {
    const notebook = this.notebooks.get(id);
    if (!notebook || notebook.userId !== userId || notebook.tenantId !== tenantId) return false;

    // 将笔记本中的笔记移到默认笔记本
    const notesInNotebook = Array.from(this.notes.values()).filter(
      (n) => n.notebookId === id && n.userId === userId && n.tenantId === tenantId
    );
    notesInNotebook.forEach((note) => {
      (note as any).notebookId = undefined;
    });

    this.notebooks.delete(id);
    return true;
  }

  // ==================== 笔记管理 ====================

  /**
   * 创建笔记
   */
  public createNote(
    params: CreateNoteParams,
    userId: string,
    tenantId: string
  ): Note {
    const id = `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    // 计算字数和阅读时间
    const wordCount = this.calculateWordCount(params.content);
    const readingTime = Math.max(1, Math.ceil(wordCount / 300));

    const note: Note = {
      id,
      title: params.title,
      content: params.content,
      summary: params.summary,
      format: params.format || 'markdown',
      status: 'active',
      notebookId: params.notebookId,
      tags: params.tags || [],
      wordCount,
      readingTime,
      isFavorite: params.isFavorite || false,
      isPinned: params.isPinned || false,
      coverImage: params.coverImage,
      attachments: params.attachments || [],
      relatedNotes: params.relatedNotes || [],
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      tenantId,
      userId,
    };

    this.notes.set(id, note);

    // 更新笔记本计数
    if (params.notebookId) {
      const notebook = this.notebooks.get(params.notebookId);
      if (notebook && notebook.userId === userId && notebook.tenantId === tenantId) {
        notebook.noteCount++;
        notebook.updatedAt = now;
      }
    }

    // 同步标签使用计数（已通过 createTag 注册的同名标签 noteCount++）
    this.applyTagCountDelta(note.tags, userId, tenantId, 1);

    // 创建初始版本
    this.createVersion(note, 1, userId, '初始版本');

    return note;
  }

  /**
   * 获取笔记
   */
  public getNote(id: string, userId: string, tenantId: string): Note | null {
    const note = this.notes.get(id);
    if (!note || note.userId !== userId || note.tenantId !== tenantId) return null;

    // 更新最后访问时间
    note.lastAccessedAt = new Date();
    return note;
  }

  /**
   * 获取笔记列表
   */
  public getNoteList(
    userId: string,
    tenantId: string,
    options?: {
      notebookId?: string;
      tags?: string[];
      status?: string;
      isFavorite?: boolean;
      isPinned?: boolean;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }
  ): { notes: Note[]; total: number } {
    let list = Array.from(this.notes.values()).filter(
      (note) =>
        note.userId === userId &&
        note.tenantId === tenantId &&
        note.status !== 'deleted'
    );

    if (options?.notebookId) {
      list = list.filter((note) => note.notebookId === options.notebookId);
    }

    if (options?.tags && options.tags.length > 0) {
      list = list.filter((note) =>
        options.tags!.every((tag) => note.tags.includes(tag))
      );
    }

    if (options?.status) {
      list = list.filter((note) => note.status === options.status);
    }

    if (options?.isFavorite !== undefined) {
      list = list.filter((note) => note.isFavorite === options.isFavorite);
    }

    if (options?.isPinned !== undefined) {
      list = list.filter((note) => note.isPinned === options.isPinned);
    }

    // 排序：置顶的优先
    list.sort((a, b) => {
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }

      const sortBy = options?.sortBy || 'updatedAt';
      const sortOrder = options?.sortOrder || 'desc';
      const aVal = a[sortBy as keyof Note];
      const bVal = b[sortBy as keyof Note];

      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    const total = list.length;
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const notes = list.slice(start, start + pageSize);

    return { notes, total };
  }

  /**
   * 更新笔记
   */
  public updateNote(
    id: string,
    updates: UpdateNoteParams,
    userId: string,
    tenantId: string
  ): Note | null {
    const note = this.notes.get(id);
    if (!note || note.userId !== userId || note.tenantId !== tenantId) return null;

    const now = new Date();

    // 重新计算字数和阅读时间
    if (updates.content) {
      const wordCount = this.calculateWordCount(updates.content);
      const readingTime = Math.max(1, Math.ceil(wordCount / 300));
      (note as any).wordCount = wordCount;
      (note as any).readingTime = readingTime;
    }

    // 处理笔记本变更（须在 Object.assign 之前读取 note.notebookId 旧值）
    // 用 'notebookId' in updates 而非 !== undefined 判定：调用方传 notebookId: undefined
    // 表示显式移出笔记本，此时应递减旧笔记本计数。!== undefined 会把"显式移出"与
    // "未传该字段"混为一谈，导致移出笔记本时旧计数不递减（计数漂移）。
    if ('notebookId' in updates && updates.notebookId !== note.notebookId) {
      // 从旧笔记本移除
      if (note.notebookId) {
        const oldNotebook = this.notebooks.get(note.notebookId);
        if (oldNotebook && oldNotebook.userId === userId && oldNotebook.tenantId === tenantId) {
          oldNotebook.noteCount = Math.max(0, oldNotebook.noteCount - 1);
        }
      }
      // 添加到新笔记本（updates.notebookId 为 undefined/falsy 时跳过，即移出笔记本）
      if (updates.notebookId) {
        const newNotebook = this.notebooks.get(updates.notebookId);
        if (newNotebook && newNotebook.userId === userId && newNotebook.tenantId === tenantId) {
          newNotebook.noteCount++;
        }
      }
    }

    // 标签计数同步：先快照旧标签集（Object.assign 后 note.tags 即被覆盖为新数组）
    const oldTagsSnapshot = note.tags;
    const oldTagsLower = new Set(oldTagsSnapshot.map((t) => t.toLowerCase()));

    Object.assign(note, updates, { updatedAt: now });

    // 标签计数同步：仅 updates.tags 显式提供时按集合差集同步（旧-新减 / 新-旧加 / 共同不变），
    // 避免无关更新（如改 content/notebookId/status）误触标签计数。与 todo/calendar-manager 同型。
    if (updates.tags) {
      const newTags = updates.tags;
      const newTagsLower = new Set(newTags.map((t) => t.toLowerCase()));
      const removed = oldTagsSnapshot.filter((t) => !newTagsLower.has(t.toLowerCase()));
      const added = newTags.filter((t) => !oldTagsLower.has(t.toLowerCase()));
      this.applyTagCountDelta(removed, userId, tenantId, -1);
      this.applyTagCountDelta(added, userId, tenantId, 1);
    }

    // 创建新版本：须在 Object.assign 之后调用，使版本 N 快照记录更新后的内容。
    // 此前 createVersion 在赋值前调用，会把更新前的旧内容当作新版本快照，
    // 致使版本历史永远捕获不到更新后的内容（version N 始终等于 version N-1 的内容）。
    if (updates.content !== undefined) {
      const currentVersions = this.versions.get(id) || [];
      const newVersion = currentVersions.length + 1;
      this.createVersion(note, newVersion, userId, updates.changeLog || '更新内容');
    }

    return note;
  }

  /**
   * 删除笔记
   */
  public deleteNote(id: string, userId: string, tenantId: string): boolean {
    const note = this.notes.get(id);
    if (!note || note.userId !== userId || note.tenantId !== tenantId) return false;

    // 软删除
    note.status = 'deleted';
    note.updatedAt = new Date();

    // 更新笔记本计数
    if (note.notebookId) {
      const notebook = this.notebooks.get(note.notebookId);
      if (notebook && notebook.userId === userId && notebook.tenantId === tenantId) {
        notebook.noteCount = Math.max(0, notebook.noteCount - 1);
      }
    }

    // 同步标签使用计数（与 createNote 的 ++ 对称）
    this.applyTagCountDelta(note.tags, userId, tenantId, -1);

    return true;
  }

  /**
   * 永久删除笔记
   */
  public permanentlyDeleteNote(id: string, userId: string, tenantId: string): boolean {
    const note = this.notes.get(id);
    if (!note || note.userId !== userId || note.tenantId !== tenantId) return false;

    // 仅当笔记未被软删除时调整笔记本计数：deleteNote 已对软删除笔记 --，
    // 此处对未软删除的活跃笔记做物理删除时须 --，避免计数漂移；对已软删除笔记
    // 不再重复 --（否则同一笔记删除两次会导致计数双重递减）。
    if (note.status !== 'deleted' && note.notebookId) {
      const notebook = this.notebooks.get(note.notebookId);
      if (notebook && notebook.userId === userId && notebook.tenantId === tenantId) {
        notebook.noteCount = Math.max(0, notebook.noteCount - 1);
      }
    }

    // 同步标签使用计数：仅活跃笔记（未软删除）须 --，已软删除笔记 deleteNote 已 --
    // （否则同一笔记删除两次会导致标签计数双重递减，与笔记本计数对称）。
    if (note.status !== 'deleted') {
      this.applyTagCountDelta(note.tags, userId, tenantId, -1);
    }

    this.notes.delete(id);
    this.versions.delete(id);
    return true;
  }

  /**
   * 恢复笔记
   */
  public restoreNote(id: string, userId: string, tenantId: string): boolean {
    const note = this.notes.get(id);
    if (!note || note.userId !== userId || note.tenantId !== tenantId) return false;

    note.status = 'active';
    note.updatedAt = new Date();

    // 回补笔记本计数：deleteNote 软删除时已 --，restore 须对称 ++ 以保持计数一致。
    if (note.notebookId) {
      const notebook = this.notebooks.get(note.notebookId);
      if (notebook && notebook.userId === userId && notebook.tenantId === tenantId) {
        notebook.noteCount++;
      }
    }

    // 回补标签使用计数（与 deleteNote 的 -- 对称）
    this.applyTagCountDelta(note.tags, userId, tenantId, 1);

    return true;
  }

  // ==================== 标签管理 ====================

  /**
   * 创建标签
   */
  public createTag(
    name: string,
    userId: string,
    tenantId: string,
    options?: { color?: string }
  ): NoteTag {
    // 检查标签是否已存在
    const existing = Array.from(this.tags.values()).find(
      (t) =>
        t.userId === userId &&
        t.tenantId === tenantId &&
        t.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) return existing;

    const id = `nt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const tag: NoteTag = {
      id,
      name,
      color: options?.color,
      noteCount: 0,
      createdAt: now,
      tenantId,
      userId,
    };

    this.tags.set(id, tag);
    return tag;
  }

  /**
   * 获取标签列表
   */
  public getTagList(
    userId: string,
    tenantId: string,
    options?: { limit?: number; sortBy?: 'name' | 'count' }
  ): NoteTag[] {
    let list = Array.from(this.tags.values()).filter(
      (t) => t.userId === userId && t.tenantId === tenantId
    );

    const sortBy = options?.sortBy || 'count';
    if (sortBy === 'count') {
      list.sort((a, b) => b.noteCount - a.noteCount);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (options?.limit) {
      list = list.slice(0, options.limit);
    }

    return list;
  }

  // ==================== 标签计数同步（私有） ====================

  /**
   * 调整标签使用计数：按 name 大小写不敏感 + userId + tenantId 匹配已注册的 NoteTag，
   * 命中则 noteCount += delta（max 0 保护，避免负数）。未注册的标签名静默跳过——
   * note.tags 为自由 string[]，仅当用户显式 createTag 后才有 NoteTag 实体可计数。
   * 同一标签名在一次调用中按唯一计（去重，避免 note.tags 含重复名时双重计数）。
   */
  private applyTagCountDelta(
    tagNames: string[],
    userId: string,
    tenantId: string,
    delta: 1 | -1
  ): void {
    const seen = new Set<string>();
    for (const name of tagNames) {
      if (!name) continue;
      const lower = name.toLowerCase();
      if (seen.has(lower)) continue;
      seen.add(lower);

      const tag = Array.from(this.tags.values()).find(
        (t) =>
          t.userId === userId &&
          t.tenantId === tenantId &&
          t.name.toLowerCase() === lower
      );
      if (!tag) continue;

      tag.noteCount = Math.max(0, tag.noteCount + delta);
    }
  }

  // ==================== 搜索功能 ====================

  /**
   * 搜索笔记
   */
  public search(
    params: NoteSearchParams,
    userId: string,
    tenantId: string
  ): NoteSearchResult {
    let list = Array.from(this.notes.values()).filter(
      (note) =>
        note.userId === userId &&
        note.tenantId === tenantId &&
        note.status === 'active'
    );

    // 关键词搜索
    if (params.query) {
      const query = params.query.toLowerCase();
      list = list.filter(
        (note) =>
          note.title.toLowerCase().includes(query) ||
          note.summary?.toLowerCase().includes(query) ||
          note.content.toLowerCase().includes(query) ||
          note.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // 笔记本筛选
    if (params.notebookId) {
      list = list.filter((note) => note.notebookId === params.notebookId);
    }

    // 标签筛选
    if (params.tags && params.tags.length > 0) {
      list = list.filter((note) =>
        params.tags!.every((tag) => note.tags.includes(tag))
      );
    }

    // 状态筛选
    if (params.status) {
      list = list.filter((note) => note.status === params.status);
    }

    // 收藏筛选
    if (params.isFavorite !== undefined) {
      list = list.filter((note) => note.isFavorite === params.isFavorite);
    }

    // 置顶筛选
    if (params.isPinned !== undefined) {
      list = list.filter((note) => note.isPinned === params.isPinned);
    }

    // 时间范围筛选
    if (params.dateFrom) {
      list = list.filter((note) => note.createdAt >= params.dateFrom!);
    }

    if (params.dateTo) {
      list = list.filter((note) => note.createdAt <= params.dateTo!);
    }

    // 排序
    const sortBy = params.sortBy || 'updatedAt';
    const sortOrder = params.sortOrder || 'desc';
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof Note];
      const bVal = b[sortBy as keyof Note];
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sortOrder === 'asc'
          ? aVal.localeCompare(bVal)
          : bVal.localeCompare(aVal);
      }
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
      }
      return 0;
    });

    const total = list.length;
    const page = params.page || 1;
    const pageSize = params.pageSize || 20;
    const totalPages = Math.ceil(total / pageSize);
    const start = (page - 1) * pageSize;
    const notes = list.slice(start, start + pageSize);
    const hasMore = page < totalPages;

    return {
      notes,
      total,
      page,
      pageSize,
      totalPages,
      hasMore,
    };
  }

  // ==================== 统计功能 ====================

  /**
   * 获取笔记统计
   */
  public getStats(userId: string, tenantId: string): NoteStats {
    const notes = Array.from(this.notes.values()).filter(
      (note) => note.userId === userId && note.tenantId === tenantId
    );

    const notebooks = Array.from(this.notebooks.values()).filter(
      (nb) => nb.userId === userId && nb.tenantId === tenantId
    );

    const tags = Array.from(this.tags.values()).filter(
      (t) => t.userId === userId && t.tenantId === tenantId
    );

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const totalWords = notes.reduce((sum, n) => sum + n.wordCount, 0);
    const totalReadingTime = notes.reduce((sum, n) => sum + n.readingTime, 0);
    const favoriteNotes = notes.filter((n) => n.isFavorite).length;
    const pinnedNotes = notes.filter((n) => n.isPinned).length;
    const archivedNotes = notes.filter((n) => n.status === 'archived').length;
    const thisWeekNew = notes.filter((n) => n.createdAt >= weekAgo).length;
    const thisMonthNew = notes.filter((n) => n.createdAt >= monthAgo).length;

    // 热门笔记本
    const topNotebooks = notebooks
      .sort((a, b) => b.noteCount - a.noteCount)
      .slice(0, 5)
      .map((nb) => ({ id: nb.id, name: nb.name, count: nb.noteCount }));

    // 热门标签
    const topTags = tags
      .sort((a, b) => b.noteCount - a.noteCount)
      .slice(0, 10)
      .map((t) => ({ id: t.id, name: t.name, count: t.noteCount }));

    return {
      totalNotes: notes.length,
      totalNotebooks: notebooks.length,
      totalTags: tags.length,
      totalWords,
      totalReadingTime,
      favoriteNotes,
      pinnedNotes,
      archivedNotes,
      thisWeekNew,
      thisMonthNew,
      topNotebooks,
      topTags,
    };
  }

  // ==================== 版本管理 ====================

  /**
   * 创建版本
   */
  private createVersion(
    note: Note,
    version: number,
    createdBy: string,
    changeLog?: string
  ): void {
    const versionRecord: NoteVersion = {
      id: `nv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      noteId: note.id,
      version,
      title: note.title,
      content: note.content,
      format: note.format,
      changeLog,
      createdBy,
      createdAt: new Date(),
      tenantId: note.tenantId,
    };

    const versions = this.versions.get(note.id) || [];
    versions.push(versionRecord);
    this.versions.set(note.id, versions);
  }

  /**
   * 获取版本列表
   */
  public getVersions(
    noteId: string,
    userId: string,
    tenantId: string
  ): NoteVersion[] {
    const note = this.notes.get(noteId);
    if (!note || note.userId !== userId || note.tenantId !== tenantId) return [];

    const versions = this.versions.get(noteId) || [];
    return versions
      .filter((v) => v.tenantId === tenantId)
      .sort((a, b) => b.version - a.version);
  }

  // ==================== 导入导出 ====================

  /**
   * 导出笔记
   */
  public exportNote(
    noteId: string,
    format: NoteExportFormat,
    userId: string,
    tenantId: string
  ): string | null {
    const note = this.getNote(noteId, userId, tenantId);
    if (!note) return null;

    switch (format) {
      case 'markdown':
        return `# ${note.title}\n\n${note.content}`;

      case 'json':
        return JSON.stringify(note, null, 2);

      case 'html':
        return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${note.title}</title>
</head>
<body>
  <h1>${note.title}</h1>
  <div class="content">${note.content}</div>
</body>
</html>`;

      default:
        return null;
    }
  }

  // ==================== 工具函数 ====================

  /**
   * 计算字数
   */
  private calculateWordCount(content: string): number {
    if (!content) return 0;
    // 中文字符 + 英文单词
    const chineseChars = (content.match(/[\u4e00-\u9fa5]/g) || []).length;
    const englishWords = (content.match(/[a-zA-Z]+/g) || []).length;
    return chineseChars + englishWords;
  }
}

// 导出单例实例
export const noteManager = NoteManager.getInstance();
