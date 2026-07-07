/**
 * 知识图谱增强模块
 * 支持实体识别、关系提取、图谱可视化增强等功能
 */

import { db } from "@/lib/db";

// 实体类型
export type EntityType =
  | "person" // 人物
  | "organization" // 组织
  | "location" // 地点
  | "concept" // 概念
  | "technology" // 技术
  | "product" // 产品
  | "event" // 事件
  | "date" // 日期
  | "other"; // 其他

// 关系类型
export type RelationType =
  | "related_to" // 相关
  | "belongs_to" // 属于
  | "part_of" // 部分
  | "created_by" // 由...创建
  | "located_in" // 位于
  | "works_for" // 为...工作
  | "uses" // 使用
  | "mentions" // 提到
  | "similar_to" // 相似
  | "other"; // 其他

// 实体
export interface Entity {
  id: string;
  name: string;
  type: EntityType;
  description?: string;
  fileIds: string[]; // 出现在哪些文件中
  occurrenceCount: number; // 出现次数
  properties?: Record<string, string>; // 属性
}

// 关系
export interface Relation {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationType;
  label?: string;
  weight: number; // 关系强度
  fileIds: string[]; // 出现在哪些文件中
}

// 知识图谱
export interface KnowledgeGraph {
  entities: Entity[];
  relations: Relation[];
  stats: {
    totalEntities: number;
    totalRelations: number;
    entityTypes: Record<EntityType, number>;
    relationTypes: Record<RelationType, number>;
  };
}

// 图谱布局选项
export interface GraphLayoutOptions {
  width?: number;
  height?: number;
  iterations?: number;
  repulsion?: number;
  attraction?: number;
  damping?: number;
}

// 节点位置
export interface NodePosition {
  id: string;
  x: number;
  y: number;
}

/**
 * 从文件中提取实体和关系
 */
export async function extractGraphFromFiles(
  fileIds: string[],
  userId: string,
  tenantId: string
): Promise<KnowledgeGraph> {
  const entities = new Map<string, Entity>();
  const relations = new Map<string, Relation>();

  // 获取文件内容
  const files = await db.file.findMany({
    where: {
      id: { in: fileIds },
      tenantId,
      userId,
      isDeleted: false,
    },
    select: {
      id: true,
      fileName: true,
      fileType: true,
      summary: true,
      keyPoints: true,
      tags: true,
      textContent: true,
    },
  });

  for (const file of files) {
    // 从文件名、标签、摘要中提取实体
    const textToAnalyze = [
      file.fileName,
      file.summary || "",
      ...(file.keyPoints ? JSON.parse(file.keyPoints) : []),
      ...(file.tags ? JSON.parse(file.tags) : []),
    ].join(" ");

    // 提取实体
    const fileEntities = extractEntities(textToAnalyze, file.id);
    for (const entity of fileEntities) {
      const existing = entities.get(entity.id);
      if (existing) {
        existing.occurrenceCount++;
        if (!existing.fileIds.includes(file.id)) {
          existing.fileIds.push(file.id);
        }
      } else {
        entities.set(entity.id, entity);
      }
    }

    // 提取关系（基于共现）
    const fileEntityIds = fileEntities.map((e) => e.id);
    for (let i = 0; i < fileEntityIds.length; i++) {
      for (let j = i + 1; j < fileEntityIds.length; j++) {
        const sourceId = fileEntityIds[i];
        const targetId = fileEntityIds[j];
        const relationId = `${sourceId}-${targetId}`;
        const reverseId = `${targetId}-${sourceId}`;

        const existing =
          relations.get(relationId) || relations.get(reverseId);

        if (existing) {
          existing.weight += 0.1;
          if (!existing.fileIds.includes(file.id)) {
            existing.fileIds.push(file.id);
          }
        } else {
          relations.set(relationId, {
            id: relationId,
            sourceId,
            targetId,
            type: "related_to",
            weight: 0.5,
            fileIds: [file.id],
          });
        }
      }
    }
  }

  // 构建统计信息
  const entityTypes = {} as Record<EntityType, number>;
  const relationTypes = {} as Record<RelationType, number>;

  for (const entity of entities.values()) {
    entityTypes[entity.type] = (entityTypes[entity.type] || 0) + 1;
  }

  for (const relation of relations.values()) {
    relationTypes[relation.type] = (relationTypes[relation.type] || 0) + 1;
  }

  return {
    entities: Array.from(entities.values()),
    relations: Array.from(relations.values()),
    stats: {
      totalEntities: entities.size,
      totalRelations: relations.size,
      entityTypes,
      relationTypes,
    },
  };
}

/**
 * 从文本中提取实体
 */
function extractEntities(text: string, fileId: string): Entity[] {
  const entities: Entity[] = [];
  const seen = new Set<string>();

  // 简单的实体提取规则
  // 实际项目中应该使用NLP模型

  // 1. 提取标签式实体（用括号或特殊标记的）
  const tagPattern = /【([^】]+)】/g;
  let match;
  while ((match = tagPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length >= 2 && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      entities.push({
        id: generateEntityId(name),
        name,
        type: "concept",
        fileIds: [fileId],
        occurrenceCount: 1,
      });
    }
  }

  // 2. 提取大写开头的词（可能是专有名词）
  const properNounPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
  while ((match = properNounPattern.exec(text)) !== null) {
    const name = match[1].trim();
    if (name.length >= 3 && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      entities.push({
        id: generateEntityId(name),
        name,
        type: guessEntityType(name),
        fileIds: [fileId],
        occurrenceCount: 1,
      });
    }
  }

  // 3. 提取技术术语（包含常见技术词的）
  const techTerms = [
    "AI", "ML", "NLP", "API", "SDK", "UI", "UX", "DB", "SQL",
    "JavaScript", "TypeScript", "Python", "Java", "Go", "Rust",
    "React", "Vue", "Angular", "Node.js", "Next.js",
    "Docker", "Kubernetes", "云原生", "微服务",
  ];

  for (const term of techTerms) {
    if (text.includes(term) && !seen.has(term.toLowerCase())) {
      seen.add(term.toLowerCase());
      entities.push({
        id: generateEntityId(term),
        name: term,
        type: "technology",
        fileIds: [fileId],
        occurrenceCount: 1,
      });
    }
  }

  return entities;
}

/**
 * 猜测实体类型
 */
function guessEntityType(name: string): EntityType {
  // 简单的类型猜测规则
  const techKeywords = [
    "技术", "系统", "平台", "框架", "算法", "模型",
    "AI", "ML", "NLP", "API", "SDK", "数据库",
  ];

  const orgKeywords = [
    "公司", "集团", "大学", "学院", "研究院", "实验室",
    "Inc", "Ltd", "Corp", "Co",
  ];

  const personKeywords = [
    "先生", "女士", "博士", "教授", "工程师",
  ];

  const nameLower = name.toLowerCase();

  if (techKeywords.some((k) => nameLower.includes(k.toLowerCase()))) {
    return "technology";
  }

  if (orgKeywords.some((k) => nameLower.includes(k.toLowerCase()))) {
    return "organization";
  }

  if (personKeywords.some((k) => nameLower.includes(k.toLowerCase()))) {
    return "person";
  }

  // 默认概念
  return "concept";
}

/**
 * 生成实体ID
 */
function generateEntityId(name: string): string {
  // 简单的基于名称的ID
  return "entity_" + name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "_");
}

/**
 * 力导向布局算法
 */
export function forceDirectedLayout(
  entities: Entity[],
  relations: Relation[],
  options: GraphLayoutOptions = {}
): NodePosition[] {
  const {
    width = 800,
    height = 600,
    iterations = 100,
    repulsion = 5000,
    attraction = 0.01,
    damping = 0.9,
  } = options;

  // 初始化节点位置（随机分布）
  const positions: NodePosition[] = entities.map((entity) => ({
    id: entity.id,
    x: Math.random() * width,
    y: Math.random() * height,
  }));

  // 速度
  const velocities = entities.map(() => ({ vx: 0, vy: 0 }));

  // 位置索引
  const positionMap = new Map<string, { x: number; y: number }>();
  positions.forEach((p, i) => {
    positionMap.set(entities[i].id, p);
  });

  // 迭代
  for (let iter = 0; iter < iterations; iter++) {
    // 计算斥力
    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        const dx = positions[j].x - positions[i].x;
        const dy = positions[j].y - positions[i].y;
        const distance = Math.sqrt(dx * dx + dy * dy) || 1;

        const force = repulsion / (distance * distance);
        const fx = (dx / distance) * force;
        const fy = (dy / distance) * force;

        velocities[i].vx -= fx;
        velocities[i].vy -= fy;
        velocities[j].vx += fx;
        velocities[j].vy += fy;
      }
    }

    // 计算引力（基于关系）
    for (const relation of relations) {
      const sourcePos = positionMap.get(relation.sourceId);
      const targetPos = positionMap.get(relation.targetId);

      if (!sourcePos || !targetPos) continue;

      const dx = targetPos.x - sourcePos.x;
      const dy = targetPos.y - sourcePos.y;
      const distance = Math.sqrt(dx * dx + dy * dy) || 1;

      const force = attraction * distance * relation.weight;
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;

      const sourceIndex = entities.findIndex((e) => e.id === relation.sourceId);
      const targetIndex = entities.findIndex((e) => e.id === relation.targetId);

      if (sourceIndex >= 0 && targetIndex >= 0) {
        velocities[sourceIndex].vx += fx;
        velocities[sourceIndex].vy += fy;
        velocities[targetIndex].vx -= fx;
        velocities[targetIndex].vy -= fy;
      }
    }

    // 中心引力
    const centerX = width / 2;
    const centerY = height / 2;
    for (let i = 0; i < positions.length; i++) {
      const dx = centerX - positions[i].x;
      const dy = centerY - positions[i].y;
      velocities[i].vx += dx * 0.001;
      velocities[i].vy += dy * 0.001;
    }

    // 更新位置
    for (let i = 0; i < positions.length; i++) {
      velocities[i].vx *= damping;
      velocities[i].vy *= damping;

      positions[i].x += velocities[i].vx;
      positions[i].y += velocities[i].vy;

      // 边界限制
      positions[i].x = Math.max(20, Math.min(width - 20, positions[i].x));
      positions[i].y = Math.max(20, Math.min(height - 20, positions[i].y));

      positionMap.set(entities[i].id, positions[i]);
    }
  }

  return positions;
}

/**
 * 查找实体的邻居
 */
export function findNeighbors(
  entityId: string,
  relations: Relation[],
  depth: number = 1
): string[] {
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [{ id: entityId, depth: 0 }];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current.id)) continue;
    visited.add(current.id);

    if (current.depth >= depth) continue;

    // 查找相邻实体
    for (const relation of relations) {
      let neighborId: string | null = null;

      if (relation.sourceId === current.id) {
        neighborId = relation.targetId;
      } else if (relation.targetId === current.id) {
        neighborId = relation.sourceId;
      }

      if (neighborId && !visited.has(neighborId)) {
        queue.push({ id: neighborId, depth: current.depth + 1 });
      }
    }
  }

  visited.delete(entityId); // 不包含自身
  return Array.from(visited);
}

/**
 * 查找两个实体之间的路径
 */
export function findPath(
  sourceId: string,
  targetId: string,
  relations: Relation[],
  maxDepth: number = 5
): string[] | null {
  if (sourceId === targetId) return [sourceId];

  const visited = new Map<string, string | null>(); // id -> 前驱id
  const queue: string[] = [sourceId];
  visited.set(sourceId, null);

  while (queue.length > 0) {
    const current = queue.shift()!;

    // 查找相邻实体
    const neighbors: string[] = [];
    for (const relation of relations) {
      if (relation.sourceId === current) {
        neighbors.push(relation.targetId);
      } else if (relation.targetId === current) {
        neighbors.push(relation.sourceId);
      }
    }

    for (const neighbor of neighbors) {
      if (visited.has(neighbor)) continue;
      visited.set(neighbor, current);

      if (neighbor === targetId) {
        // 重建路径
        const path: string[] = [];
        let node: string | null = targetId;
        while (node) {
          path.unshift(node);
          node = visited.get(node) || null;
        }
        return path;
      }

      // 检查深度（depth 计算为从 source 到 neighbor 的节点数，含两端 = 边数 + 1；
      // 入队条件 depth <= maxDepth 使 maxDepth=N 可命中 N 边路径）
      let depth = 0;
      let n: string | null = neighbor;
      while (n) {
        depth++;
        n = visited.get(n) || null;
      }

      if (depth <= maxDepth) {
        queue.push(neighbor);
      }
    }
  }

  return null; // 没有找到路径
}

/**
 * 社区发现（简单的基于连通分量的实现）
 */
export function detectCommunities(
  entities: Entity[],
  relations: Relation[]
): Array<{ id: string; name: string; entities: string[] }> {
  const visited = new Set<string>();
  const communities: Array<{ id: string; name: string; entities: string[] }> = [];

  for (const entity of entities) {
    if (visited.has(entity.id)) continue;

    // BFS找到所有连通的实体
    const community: string[] = [];
    const queue: string[] = [entity.id];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (visited.has(current)) continue;
      visited.add(current);
      community.push(current);

      // 查找相邻实体
      for (const relation of relations) {
        let neighborId: string | null = null;

        if (relation.sourceId === current) {
          neighborId = relation.targetId;
        } else if (relation.targetId === current) {
          neighborId = relation.sourceId;
        }

        if (neighborId && !visited.has(neighborId)) {
          queue.push(neighborId);
        }
      }
    }

    // 用社区中出现次数最多的实体命名
    let maxOccurrence = 0;
    let communityName = `社区 ${communities.length + 1}`;
    for (const eid of community) {
      const e = entities.find((ent) => ent.id === eid);
      if (e && e.occurrenceCount > maxOccurrence) {
        maxOccurrence = e.occurrenceCount;
        communityName = e.name;
      }
    }

    communities.push({
      id: `community_${communities.length}`,
      name: communityName,
      entities: community,
    });
  }

  return communities;
}

/**
 * 获取实体颜色（根据类型）
 */
export function getEntityColor(type: EntityType): string {
  const colors: Record<EntityType, string> = {
    person: "#3b82f6", // 蓝色
    organization: "#8b5cf6", // 紫色
    location: "#10b981", // 绿色
    concept: "#f59e0b", // 橙色
    technology: "#ef4444", // 红色
    product: "#ec4899", // 粉色
    event: "#06b6d4", // 青色
    date: "#6b7280", // 灰色
    other: "#6b7280", // 灰色
  };

  return colors[type] || colors.other;
}

/**
 * 获取实体图标（根据类型）
 */
export function getEntityIcon(type: EntityType): string {
  const icons: Record<EntityType, string> = {
    person: "👤",
    organization: "🏢",
    location: "📍",
    concept: "💡",
    technology: "⚙️",
    product: "📦",
    event: "📅",
    date: "🕐",
    other: "📄",
  };

  return icons[type] || icons.other;
}
