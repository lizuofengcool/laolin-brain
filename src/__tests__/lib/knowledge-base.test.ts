import { describe, it, expect, beforeEach } from "vitest";
import { KnowledgeBaseManager } from "@/lib/knowledge-base/knowledge-base-manager";
import type { KnowledgeBase, KnowledgeItem, KnowledgeDirectory } from "@/lib/knowledge-base/types";

describe("知识库模块测试", () => {
  let manager: KnowledgeBaseManager;
  const tenantId = "test-tenant-1";
  const userId = "test-user-1";

  beforeEach(() => {
    manager = new KnowledgeBaseManager();
  });

  describe("知识库管理", () => {
    it("应该创建知识库", async () => {
      const kb = await manager.createKnowledgeBase(tenantId, userId, {
        name: "测试知识库",
        description: "这是一个测试知识库",
      });

      expect(kb).toBeDefined();
      expect(kb.id).toBeDefined();
      expect(kb.name).toBe("测试知识库");
      expect(kb.tenantId).toBe(tenantId);
      expect(kb.userId).toBe(userId);
    });

    it("应该获取知识库列表", async () => {
      await manager.createKnowledgeBase(tenantId, userId, { name: "知识库1" });
      await manager.createKnowledgeBase(tenantId, userId, { name: "知识库2" });

      const result = await manager.getKnowledgeBaseList(tenantId, userId);
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("应该更新知识库", async () => {
      const kb = await manager.createKnowledgeBase(tenantId, userId, {
        name: "原始名称",
      });

      const updated = await manager.updateKnowledgeBase(tenantId, userId, kb.id, {
        name: "更新后的名称",
      });

      expect(updated.name).toBe("更新后的名称");
    });

    it("应该删除知识库", async () => {
      const kb = await manager.createKnowledgeBase(tenantId, userId, {
        name: "待删除",
      });

      const result = await manager.deleteKnowledgeBase(tenantId, userId, kb.id);
      expect(result).toBe(true);
    });
  });

  describe("目录管理", () => {
    let kbId: string;

    beforeEach(async () => {
      const kb = await manager.createKnowledgeBase(tenantId, userId, {
        name: "测试知识库",
      });
      kbId = kb.id;
    });

    it("应该创建目录", async () => {
      const dir = await manager.createDirectory(tenantId, userId, kbId, {
        name: "测试目录",
      });

      expect(dir).toBeDefined();
      expect(dir.id).toBeDefined();
      expect(dir.name).toBe("测试目录");
    });

    it("应该创建子目录", async () => {
      const parentDir = await manager.createDirectory(tenantId, userId, kbId, {
        name: "父目录",
      });

      const childDir = await manager.createDirectory(tenantId, userId, kbId, {
        name: "子目录",
        parentId: parentDir.id,
      });

      expect(childDir.parentId).toBe(parentDir.id);
    });

    it("应该获取目录树", async () => {
      await manager.createDirectory(tenantId, userId, kbId, { name: "目录1" });
      await manager.createDirectory(tenantId, userId, kbId, { name: "目录2" });

      const tree = await manager.getDirectoryTree(tenantId, userId, kbId);
      expect(tree.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("知识条目管理", () => {
    let kbId: string;
    let dirId: string;

    beforeEach(async () => {
      const kb = await manager.createKnowledgeBase(tenantId, userId, {
        name: "测试知识库",
      });
      kbId = kb.id;

      const dir = await manager.createDirectory(tenantId, userId, kbId, {
        name: "测试目录",
      });
      dirId = dir.id;
    });

    it("应该创建知识条目", async () => {
      const item = await manager.createItem(tenantId, userId, kbId, {
        title: "测试条目",
        content: "这是测试内容",
        directoryId: dirId,
      });

      expect(item).toBeDefined();
      expect(item.id).toBeDefined();
      expect(item.title).toBe("测试条目");
    });

    it("应该获取知识条目", async () => {
      const created = await manager.createItem(tenantId, userId, kbId, {
        title: "测试条目",
        content: "内容",
        directoryId: dirId,
      });

      const item = await manager.getItem(tenantId, userId, created.id);
      expect(item).toBeDefined();
      expect(item?.title).toBe("测试条目");
    });

    it("应该更新知识条目", async () => {
      const item = await manager.createItem(tenantId, userId, kbId, {
        title: "原始标题",
        content: "原始内容",
        directoryId: dirId,
      });

      const updated = await manager.updateItem(tenantId, userId, item.id, {
        title: "更新后的标题",
        content: "更新后的内容",
      });

      expect(updated.title).toBe("更新后的标题");
      expect(updated.content).toBe("更新后的内容");
    });

    it("应该删除知识条目", async () => {
      const item = await manager.createItem(tenantId, userId, kbId, {
        title: "待删除",
        content: "内容",
        directoryId: dirId,
      });

      const result = await manager.deleteItem(tenantId, userId, item.id);
      expect(result).toBe(true);
    });

    it("应该搜索知识条目", async () => {
      await manager.createItem(tenantId, userId, kbId, {
        title: "苹果",
        content: "苹果是一种水果",
        directoryId: dirId,
      });
      await manager.createItem(tenantId, userId, kbId, {
        title: "香蕉",
        content: "香蕉是一种水果",
        directoryId: dirId,
      });

      const result = await manager.searchItems(tenantId, userId, kbId, "水果");
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("标签功能", () => {
    let kbId: string;
    let dirId: string;

    beforeEach(async () => {
      const kb = await manager.createKnowledgeBase(tenantId, userId, {
        name: "测试知识库",
      });
      kbId = kb.id;

      const dir = await manager.createDirectory(tenantId, userId, kbId, {
        name: "测试目录",
      });
      dirId = dir.id;
    });

    it("应该为条目添加标签", async () => {
      const item = await manager.createItem(tenantId, userId, kbId, {
        title: "测试条目",
        content: "内容",
        directoryId: dirId,
        tags: ["标签1", "标签2"],
      });

      expect(item.tags).toContain("标签1");
      expect(item.tags).toContain("标签2");
    });

    it("应该按标签筛选条目", async () => {
      await manager.createItem(tenantId, userId, kbId, {
        title: "条目1",
        content: "内容1",
        directoryId: dirId,
        tags: ["重要"],
      });
      await manager.createItem(tenantId, userId, kbId, {
        title: "条目2",
        content: "内容2",
        directoryId: dirId,
        tags: ["普通"],
      });

      const result = await manager.getItemsByTag(tenantId, userId, kbId, "重要");
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe("条目1");
    });
  });

  describe("多租户隔离", () => {
    it("不同租户的数据应该隔离", async () => {
      const tenant1Id = "tenant-1";
      const tenant2Id = "tenant-2";

      const kb1 = await manager.createKnowledgeBase(tenant1Id, "user-1", {
        name: "租户1的知识库",
      });

      const kb2 = await manager.createKnowledgeBase(tenant2Id, "user-2", {
        name: "租户2的知识库",
      });

      const result1 = await manager.getKnowledgeBaseList(tenant1Id, "user-1");
      const result2 = await manager.getKnowledgeBaseList(tenant2Id, "user-2");

      // 租户1看不到租户2的数据
      const tenant1Kbs = result1.items.filter((kb) => kb.name === "租户2的知识库");
      expect(tenant1Kbs.length).toBe(0);

      // 租户2看不到租户1的数据
      const tenant2Kbs = result2.items.filter((kb) => kb.name === "租户1的知识库");
      expect(tenant2Kbs.length).toBe(0);
    });
  });
});
