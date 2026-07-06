/**
 * 知识库管理器
 * 负责知识的组织、管理和检索
 */

import type {
  KnowledgeBase,
  KnowledgeBaseSettings,
  KnowledgeItem,
  KnowledgeCategory,
  KnowledgeTag,
  KnowledgeVersion,
  KnowledgeSearchResult,
  KnowledgeStats,
  KnowledgeGraph,
  CreateKnowledgeBaseParams,
  CreateKnowledgeItemParams,
  UpdateKnowledgeItemParams,
  KnowledgeSearchParams,
} from './types';

export class KnowledgeBaseManager {
  private static instance: KnowledgeBaseManager;
  private knowledgeBases: Map<string, KnowledgeBase> = new Map();
  private items: Map<string, KnowledgeItem> = new Map();
  private categories: Map<string, KnowledgeCategory> = new Map();
  private tags: Map<string, KnowledgeTag> = new Map();
  private versions: Map<string, KnowledgeVersion[]> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): KnowledgeBaseManager {
    if (!KnowledgeBaseManager.instance) {
      KnowledgeBaseManager.instance = new KnowledgeBaseManager();
    }
    return KnowledgeBaseManager.instance;
  }

  // ==================== 知识库管理 ====================

  /**
   * 创建知识库
   */
  public createKnowledgeBase(
    params: CreateKnowledgeBaseParams,
    ownerId: string,
    tenantId: string
  ): KnowledgeBase {
    const id = `kb_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const defaultSettings: KnowledgeBaseSettings = {
      allowComments: true,
      allowRating: true,
      requireReview: false,
      defaultTags: [],
      versioning: true,
      maxVersions: 10,
    };

    const kb: KnowledgeBase = {
      id,
      name: params.name,
      description: params.description,
      icon: params.icon,
      coverImage: params.coverImage,
      status: 'active',
      itemCount: 0,
      categoryCount: 0,
      tagCount: 0,
      ownerId,
      settings: { ...defaultSettings, ...params.settings },
      createdAt: now,
      updatedAt: now,
      tenantId,
    };

    this.knowledgeBases.set(id, kb);
    return kb;
  }

  /**
   * 获取知识库
   */
  public getKnowledgeBase(id: string, tenantId: string): KnowledgeBase | null {
    const kb = this.knowledgeBases.get(id);
    if (!kb || kb.tenantId !== tenantId) return null;
    return kb;
  }

  /**
   * 获取知识库列表
   */
  public getKnowledgeBaseList(
    tenantId: string,
    options?: { page?: number; pageSize?: number; search?: string }
  ): { items: KnowledgeBase[]; total: number } {
    let list = Array.from(this.knowledgeBases.values()).filter(
      (kb) => kb.tenantId === tenantId && kb.status !== 'deleted'
    );

    if (options?.search) {
      const query = options.search.toLowerCase();
      list = list.filter(
        (kb) =>
          kb.name.toLowerCase().includes(query) ||
          kb.description?.toLowerCase().includes(query)
      );
    }

    const total = list.length;
    const page = options?.page || 1;
    const pageSize = options?.pageSize || 20;
    const start = (page - 1) * pageSize;
    const items = list.slice(start, start + pageSize);

    return { items, total };
  }

  /**
   * 更新知识库
   */
  public updateKnowledgeBase(
    id: string,
    updates: Partial<KnowledgeBase>,
    tenantId: string
  ): KnowledgeBase | null {
    const kb = this.knowledgeBases.get(id);
    if (!kb || kb.tenantId !== tenantId) return null;

    Object.assign(kb, updates, { updatedAt: new Date() });
    return kb;
  }

  /**
   * 删除知识库
   */
  public deleteKnowledgeBase(id: string, tenantId: string): boolean {
    const kb = this.knowledgeBases.get(id);
    if (!kb || kb.tenantId !== tenantId) return false;

    kb.status = 'deleted';
    kb.updatedAt = new Date();
    return true;
  }

  // ==================== 知识条目管理 ====================

  /**
   * 创建知识条目
   */
  public createItem(
    knowledgeBaseId: string,
    params: CreateKnowledgeItemParams,
    authorId: string,
    tenantId: string
  ): KnowledgeItem | null {
    const kb = this.knowledgeBases.get(knowledgeBaseId);
    if (!kb || kb.tenantId !== tenantId) return null;

    const id = `ki_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    // 计算字数和阅读时间
    const wordCount = this.calculateWordCount(params.content);
    const readingTime = Math.max(1, Math.ceil(wordCount / 300)); // 按每分钟300字计算

    const item: KnowledgeItem = {
      id,
      title: params.title,
      summary: params.summary,
      content: params.content,
      type: params.type || 'article',
      status: params.status || 'draft',
      categoryId: params.categoryId,
      tags: params.tags || [],
      authorId,
      views: 0,
      likes: 0,
      bookmarks: 0,
      wordCount,
      readingTime,
      coverImage: params.coverImage,
      attachments: params.attachments || [],
      relatedItems: params.relatedItems || [],
      createdAt: now,
      updatedAt: now,
      publishedAt: params.status === 'published' ? now : undefined,
      tenantId,
      knowledgeBaseId,
    };

    this.items.set(id, item);
    kb.itemCount++;
    kb.updatedAt = now;

    // 创建初始版本
    if (kb.settings.versioning) {
      this.createVersion(item, 1, authorId, '初始版本');
    }

    return item;
  }

  /**
   * 获取知识条目
   */
  public getItem(id: string, tenantId: string): KnowledgeItem | null {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;
    return item;
  }

  /**
   * 获取知识条目列表
   */
  public getItemList(
    knowledgeBaseId: string,
    tenantId: string,
    options?: {
      categoryId?: string;
      tags?: string[];
      status?: string;
      sortBy?: string;
      sortOrder?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    }
  ): { items: KnowledgeItem[]; total: number } {
    let list = Array.from(this.items.values()).filter(
      (item) =>
        item.knowledgeBaseId === knowledgeBaseId &&
        item.tenantId === tenantId &&
        item.status !== 'archived'
    );

    if (options?.categoryId) {
      list = list.filter((item) => item.categoryId === options.categoryId);
    }

    if (options?.tags && options.tags.length > 0) {
      list = list.filter((item) =>
        options.tags!.every((tag) => item.tags.includes(tag))
      );
    }

    if (options?.status) {
      list = list.filter((item) => item.status === options.status);
    }

    // 排序
    const sortBy = options?.sortBy || 'updatedAt';
    const sortOrder = options?.sortOrder || 'desc';
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof KnowledgeItem];
      const bVal = b[sortBy as keyof KnowledgeItem];
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
    const items = list.slice(start, start + pageSize);

    return { items, total };
  }

  /**
   * 更新知识条目
   */
  public updateItem(
    id: string,
    updates: UpdateKnowledgeItemParams,
    userId: string,
    tenantId: string
  ): KnowledgeItem | null {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return null;

    const kb = this.knowledgeBases.get(item.knowledgeBaseId);
    const now = new Date();

    // 重新计算字数和阅读时间（与版本创建条件一致：content !== undefined，
    // 此前用 if (updates.content) 真值判断，空串 '' 会跳过重算但仍创建版本，致 wordCount 漂移）
    if (updates.content !== undefined) {
      const wordCount = this.calculateWordCount(updates.content);
      const readingTime = Math.max(1, Math.ceil(wordCount / 300));
      (item as any).wordCount = wordCount;
      (item as any).readingTime = readingTime;
    }

    Object.assign(item, updates, { updatedAt: now });

    if (updates.status === 'published' && !item.publishedAt) {
      (item as any).publishedAt = now;
    }

    // 创建新版本：须在 Object.assign 之后调用，createVersion 快照 item.title/content/summary，
    // 此前在赋值前调用导致新版本记录的是更新前的旧内容，与版本 1 重复，更新后的内容从未入版本史。
    if (kb?.settings.versioning && updates.content !== undefined) {
      const currentVersions = this.versions.get(id) || [];
      const newVersion = currentVersions.length + 1;
      this.createVersion(item, newVersion, userId, updates.changeLog || '更新内容');
    }

    return item;
  }

  /**
   * 删除知识条目
   */
  public deleteItem(id: string, tenantId: string): boolean {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;

    const kb = this.knowledgeBases.get(item.knowledgeBaseId);
    if (kb) {
      kb.itemCount--;
      kb.updatedAt = new Date();
    }

    this.items.delete(id);
    return true;
  }

  /**
   * 增加浏览量
   */
  public incrementViews(id: string, tenantId: string): boolean {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;

    item.views++;
    return true;
  }

  /**
   * 点赞
   */
  public likeItem(id: string, tenantId: string): boolean {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;

    item.likes++;
    return true;
  }

  /**
   * 取消点赞
   */
  public unlikeItem(id: string, tenantId: string): boolean {
    const item = this.items.get(id);
    if (!item || item.tenantId !== tenantId) return false;

    item.likes = Math.max(0, item.likes - 1);
    return true;
  }

  // ==================== 分类管理 ====================

  /**
   * 创建分类
   */
  public createCategory(
    knowledgeBaseId: string,
    name: string,
    tenantId: string,
    options?: { description?: string; parentId?: string; icon?: string; color?: string }
  ): KnowledgeCategory | null {
    const kb = this.knowledgeBases.get(knowledgeBaseId);
    if (!kb || kb.tenantId !== tenantId) return null;

    const id = `kc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const category: KnowledgeCategory = {
      id,
      name,
      description: options?.description,
      parentId: options?.parentId,
      sortOrder: 0,
      icon: options?.icon,
      color: options?.color,
      itemCount: 0,
      createdAt: now,
      updatedAt: now,
      tenantId,
      knowledgeBaseId,
    };

    this.categories.set(id, category);
    kb.categoryCount++;
    kb.updatedAt = now;

    return category;
  }

  /**
   * 获取分类列表
   */
  public getCategoryList(
    knowledgeBaseId: string,
    tenantId: string
  ): KnowledgeCategory[] {
    return Array.from(this.categories.values())
      .filter(
        (cat) =>
          cat.knowledgeBaseId === knowledgeBaseId && cat.tenantId === tenantId
      )
      .sort((a, b) => a.sortOrder - b.sortOrder);
  }

  /**
   * 获取分类树
   */
  public getCategoryTree(
    knowledgeBaseId: string,
    tenantId: string
  ): (KnowledgeCategory & { children?: KnowledgeCategory[] })[] {
    const categories = this.getCategoryList(knowledgeBaseId, tenantId);

    const buildTree = (parentId?: string): (KnowledgeCategory & { children?: KnowledgeCategory[] })[] => {
      return categories
        .filter((cat) => cat.parentId === parentId)
        .map((cat) => ({
          ...cat,
          children: buildTree(cat.id),
        }));
    };

    return buildTree(undefined);
  }

  // ==================== 标签管理 ====================

  /**
   * 创建标签
   */
  public createTag(
    knowledgeBaseId: string,
    name: string,
    tenantId: string,
    options?: { color?: string }
  ): KnowledgeTag | null {
    const kb = this.knowledgeBases.get(knowledgeBaseId);
    if (!kb || kb.tenantId !== tenantId) return null;

    // 检查标签是否已存在
    const existing = Array.from(this.tags.values()).find(
      (t) =>
        t.knowledgeBaseId === knowledgeBaseId &&
        t.tenantId === tenantId &&
        t.name.toLowerCase() === name.toLowerCase()
    );

    if (existing) return existing;

    const id = `kt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date();

    const tag: KnowledgeTag = {
      id,
      name,
      color: options?.color,
      itemCount: 0,
      createdAt: now,
      tenantId,
      knowledgeBaseId,
    };

    this.tags.set(id, tag);
    kb.tagCount++;
    kb.updatedAt = now;

    return tag;
  }

  /**
   * 获取标签列表
   */
  public getTagList(
    knowledgeBaseId: string,
    tenantId: string,
    options?: { limit?: number; sortBy?: 'name' | 'count' }
  ): KnowledgeTag[] {
    let list = Array.from(this.tags.values()).filter(
      (t) =>
        t.knowledgeBaseId === knowledgeBaseId && t.tenantId === tenantId
    );

    const sortBy = options?.sortBy || 'count';
    if (sortBy === 'count') {
      list.sort((a, b) => b.itemCount - a.itemCount);
    } else {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    if (options?.limit) {
      list = list.slice(0, options.limit);
    }

    return list;
  }

  // ==================== 搜索功能 ====================

  /**
   * 搜索知识条目
   */
  public search(
    knowledgeBaseId: string,
    params: KnowledgeSearchParams,
    tenantId: string
  ): KnowledgeSearchResult {
    let list = Array.from(this.items.values()).filter(
      (item) =>
        item.knowledgeBaseId === knowledgeBaseId &&
        item.tenantId === tenantId &&
        item.status === 'published'
    );

    // 关键词搜索
    if (params.query) {
      const query = params.query.toLowerCase();
      list = list.filter(
        (item) =>
          item.title.toLowerCase().includes(query) ||
          item.summary?.toLowerCase().includes(query) ||
          item.content.toLowerCase().includes(query) ||
          item.tags.some((tag) => tag.toLowerCase().includes(query))
      );
    }

    // 类型筛选
    if (params.type) {
      list = list.filter((item) => item.type === params.type);
    }

    // 状态筛选
    if (params.status) {
      list = list.filter((item) => item.status === params.status);
    }

    // 分类筛选
    if (params.categoryId) {
      list = list.filter((item) => item.categoryId === params.categoryId);
    }

    // 标签筛选
    if (params.tags && params.tags.length > 0) {
      list = list.filter((item) =>
        params.tags!.every((tag) => item.tags.includes(tag))
      );
    }

    // 作者筛选
    if (params.authorId) {
      list = list.filter((item) => item.authorId === params.authorId);
    }

    // 时间范围筛选
    if (params.dateFrom) {
      list = list.filter((item) => item.createdAt >= params.dateFrom!);
    }

    if (params.dateTo) {
      list = list.filter((item) => item.createdAt <= params.dateTo!);
    }

    // 排序
    const sortBy = params.sortBy || 'updatedAt';
    const sortOrder = params.sortOrder || 'desc';
    list.sort((a, b) => {
      const aVal = a[sortBy as keyof KnowledgeItem];
      const bVal = b[sortBy as keyof KnowledgeItem];
      if (aVal instanceof Date && bVal instanceof Date) {
        return sortOrder === 'asc'
          ? aVal.getTime() - bVal.getTime()
          : bVal.getTime() - aVal.getTime();
      }
      // 此前缺失字符串分支，致 sortBy='title'（KnowledgeSearchParams 合法值）始终返回 0 不排序。
      // getItemList 的排序已含字符串分支，此处对齐。
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
    const items = list.slice(start, start + pageSize);
    const hasMore = page < totalPages;

    return {
      items,
      total,
      page,
      pageSize,
      totalPages,
      hasMore,
    };
  }

  // ==================== 统计功能 ====================

  /**
   * 获取知识库统计
   */
  public getStats(knowledgeBaseId: string, tenantId: string): KnowledgeStats | null {
    const kb = this.knowledgeBases.get(knowledgeBaseId);
    if (!kb || kb.tenantId !== tenantId) return null;

    const items = Array.from(this.items.values()).filter(
      (item) =>
        item.knowledgeBaseId === knowledgeBaseId && item.tenantId === tenantId
    );

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const publishedItems = items.filter((i) => i.status === 'published').length;
    const draftItems = items.filter((i) => i.status === 'draft').length;
    const archivedItems = items.filter((i) => i.status === 'archived').length;
    const thisWeekNew = items.filter((i) => i.createdAt >= weekAgo).length;
    const thisMonthNew = items.filter((i) => i.createdAt >= monthAgo).length;

    const totalViews = items.reduce((sum, i) => sum + i.views, 0);
    const totalLikes = items.reduce((sum, i) => sum + i.likes, 0);
    const totalBookmarks = items.reduce((sum, i) => sum + i.bookmarks, 0);

    // 热门分类
    const categoryCounts = new Map<string, number>();
    items.forEach((item) => {
      if (item.categoryId) {
        categoryCounts.set(
          item.categoryId,
          (categoryCounts.get(item.categoryId) || 0) + 1
        );
      }
    });
    const topCategories = Array.from(categoryCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => {
        const cat = this.categories.get(id);
        return { id, name: cat?.name || '未知', count };
      });

    // 热门标签
    const tagCounts = new Map<string, number>();
    items.forEach((item) => {
      item.tags.forEach((tag) => {
        tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      });
    });
    const topTags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ id: name, name, count }));

    // 热门作者
    const authorCounts = new Map<string, number>();
    items.forEach((item) => {
      authorCounts.set(
        item.authorId,
        (authorCounts.get(item.authorId) || 0) + 1
      );
    });
    const topAuthors = Array.from(authorCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([id, count]) => ({ id, name: id, count }));

    return {
      totalItems: items.length,
      totalCategories: kb.categoryCount,
      totalTags: kb.tagCount,
      totalViews,
      totalLikes,
      totalBookmarks,
      publishedItems,
      draftItems,
      archivedItems,
      thisWeekNew,
      thisMonthNew,
      topCategories,
      topTags,
      topAuthors,
    };
  }

  // ==================== 知识图谱 ====================

  /**
   * 生成知识图谱
   */
  public generateKnowledgeGraph(
    knowledgeBaseId: string,
    tenantId: string,
    options?: { maxNodes?: number }
  ): KnowledgeGraph | null {
    const kb = this.knowledgeBases.get(knowledgeBaseId);
    if (!kb || kb.tenantId !== tenantId) return null;

    const items = Array.from(this.items.values())
      .filter(
        (item) =>
          item.knowledgeBaseId === knowledgeBaseId &&
          item.tenantId === tenantId &&
          item.status === 'published'
      )
      .slice(0, options?.maxNodes || 100);

    const nodes: KnowledgeGraph['nodes'] = [];
    const edges: KnowledgeGraph['edges'] = [];
    const nodeSet = new Set<string>();

    // 添加知识条目节点
    items.forEach((item) => {
      if (!nodeSet.has(item.id)) {
        nodes.push({
          id: item.id,
          label: item.title,
          type: 'item',
          size: 20 + Math.min(item.views / 100, 30),
          data: { type: item.type, views: item.views },
        });
        nodeSet.add(item.id);
      }
    });

    // 添加标签节点和边
    const tagSet = new Set<string>();
    items.forEach((item) => {
      item.tags.forEach((tag) => {
        if (!tagSet.has(tag)) {
          nodes.push({
            id: `tag_${tag}`,
            label: tag,
            type: 'tag',
            size: 15,
          });
          tagSet.add(tag);
        }

        edges.push({
          id: `${item.id}_tag_${tag}`,
          source: item.id,
          target: `tag_${tag}`,
          type: 'tag',
          weight: 1,
        });
      });
    });

    // 添加相关条目边
    items.forEach((item) => {
      item.relatedItems.forEach((relatedId) => {
        if (nodeSet.has(relatedId)) {
          edges.push({
            id: `${item.id}_related_${relatedId}`,
            source: item.id,
            target: relatedId,
            type: 'related',
            weight: 2,
          });
        }
      });
    });

    const density =
      nodes.length > 1 ? (2 * edges.length) / (nodes.length * (nodes.length - 1)) : 0;

    return {
      nodes,
      edges,
      stats: {
        nodeCount: nodes.length,
        edgeCount: edges.length,
        density,
      },
    };
  }

  // ==================== 版本管理 ====================

  /**
   * 创建版本
   */
  private createVersion(
    item: KnowledgeItem,
    version: number,
    createdBy: string,
    changeLog?: string
  ): void {
    const versionRecord: KnowledgeVersion = {
      id: `kv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      itemId: item.id,
      version,
      title: item.title,
      content: item.content,
      summary: item.summary,
      changeLog,
      createdBy,
      createdAt: new Date(),
      tenantId: item.tenantId,
    };

    const versions = this.versions.get(item.id) || [];
    versions.push(versionRecord);
    this.versions.set(item.id, versions);
  }

  /**
   * 获取版本列表
   */
  public getVersions(
    itemId: string,
    tenantId: string
  ): KnowledgeVersion[] {
    const versions = this.versions.get(itemId) || [];
    return versions
      .filter((v) => v.tenantId === tenantId)
      .sort((a, b) => b.version - a.version);
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
export const knowledgeBaseManager = KnowledgeBaseManager.getInstance();
