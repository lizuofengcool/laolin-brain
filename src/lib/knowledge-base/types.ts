/**
 * 知识库类型定义
 */

// 知识库状态
export type KnowledgeBaseStatus = 'active' | 'archived' | 'deleted';

// 知识条目类型
export type KnowledgeItemType = 'article' | 'note' | 'document' | 'link' | 'image';

// 知识条目状态
export type KnowledgeItemStatus = 'draft' | 'published' | 'archived';

// 知识分类
export interface KnowledgeCategory {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  sortOrder: number;
  icon?: string;
  color?: string;
  itemCount: number;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
  knowledgeBaseId: string;
}

// 知识标签
export interface KnowledgeTag {
  id: string;
  name: string;
  color?: string;
  itemCount: number;
  createdAt: Date;
  tenantId: string;
  knowledgeBaseId: string;
}

// 知识条目
export interface KnowledgeItem {
  id: string;
  title: string;
  summary?: string;
  content: string;
  type: KnowledgeItemType;
  status: KnowledgeItemStatus;
  categoryId?: string;
  tags: string[];
  authorId: string;
  views: number;
  likes: number;
  bookmarks: number;
  wordCount: number;
  readingTime: number; // 分钟
  coverImage?: string;
  attachments: string[];
  relatedItems: string[];
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
  tenantId: string;
  knowledgeBaseId: string;
}

// 知识库
export interface KnowledgeBase {
  id: string;
  name: string;
  description?: string;
  icon?: string;
  coverImage?: string;
  status: KnowledgeBaseStatus;
  itemCount: number;
  categoryCount: number;
  tagCount: number;
  ownerId: string;
  settings: KnowledgeBaseSettings;
  createdAt: Date;
  updatedAt: Date;
  tenantId: string;
}

// 知识库设置
export interface KnowledgeBaseSettings {
  allowComments: boolean;
  allowRating: boolean;
  requireReview: boolean;
  defaultCategory?: string;
  defaultTags: string[];
  versioning: boolean;
  maxVersions: number;
}

// 知识版本
export interface KnowledgeVersion {
  id: string;
  itemId: string;
  version: number;
  title: string;
  content: string;
  summary?: string;
  changeLog?: string;
  createdBy: string;
  createdAt: Date;
  tenantId: string;
}

// 知识搜索结果
export interface KnowledgeSearchResult {
  items: KnowledgeItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
  highlights?: Record<string, string[]>;
}

// 知识统计
export interface KnowledgeStats {
  totalItems: number;
  totalCategories: number;
  totalTags: number;
  totalViews: number;
  totalLikes: number;
  totalBookmarks: number;
  publishedItems: number;
  draftItems: number;
  archivedItems: number;
  thisWeekNew: number;
  thisMonthNew: number;
  topCategories: { id: string; name: string; count: number }[];
  topTags: { id: string; name: string; count: number }[];
  topAuthors: { id: string; name: string; count: number }[];
}

// 知识图谱节点
export interface KnowledgeGraphNode {
  id: string;
  label: string;
  type: 'item' | 'category' | 'tag' | 'keyword';
  size: number;
  color?: string;
  data?: Record<string, unknown>;
}

// 知识图谱边
export interface KnowledgeGraphEdge {
  id: string;
  source: string;
  target: string;
  type: 'related' | 'category' | 'tag' | 'reference';
  weight: number;
  label?: string;
}

// 知识图谱
export interface KnowledgeGraph {
  nodes: KnowledgeGraphNode[];
  edges: KnowledgeGraphEdge[];
  stats: {
    nodeCount: number;
    edgeCount: number;
    density: number;
  };
}

// 创建知识库参数
export interface CreateKnowledgeBaseParams {
  name: string;
  description?: string;
  icon?: string;
  coverImage?: string;
  settings?: Partial<KnowledgeBaseSettings>;
}

// 创建知识条目参数
export interface CreateKnowledgeItemParams {
  title: string;
  summary?: string;
  content: string;
  type?: KnowledgeItemType;
  status?: KnowledgeItemStatus;
  categoryId?: string;
  tags?: string[];
  coverImage?: string;
  attachments?: string[];
  relatedItems?: string[];
}

// 更新知识条目参数
export interface UpdateKnowledgeItemParams {
  title?: string;
  summary?: string;
  content?: string;
  status?: KnowledgeItemStatus;
  categoryId?: string;
  tags?: string[];
  coverImage?: string;
  attachments?: string[];
  relatedItems?: string[];
  changeLog?: string;
}

// 知识搜索参数
export interface KnowledgeSearchParams {
  query?: string;
  type?: KnowledgeItemType;
  status?: KnowledgeItemStatus;
  categoryId?: string;
  tags?: string[];
  authorId?: string;
  dateFrom?: Date;
  dateTo?: Date;
  sortBy?: 'createdAt' | 'updatedAt' | 'views' | 'likes' | 'title';
  sortOrder?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
  searchMode?: 'keyword' | 'semantic' | 'hybrid';
}
