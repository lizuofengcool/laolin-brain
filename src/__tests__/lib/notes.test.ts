import { describe, it, expect, beforeEach } from "vitest";
import { NotesManager } from "@/lib/notes/notes-manager";
import type { Note, Notebook } from "@/lib/notes/types";

describe("笔记模块测试", () => {
  let manager: NotesManager;
  const tenantId = "test-tenant-1";
  const userId = "test-user-1";

  beforeEach(() => {
    manager = new NotesManager();
  });

  describe("笔记本管理", () => {
    it("应该创建笔记本", async () => {
      const notebook = await manager.createNotebook(tenantId, userId, {
        name: "测试笔记本",
        description: "这是一个测试笔记本",
      });

      expect(notebook).toBeDefined();
      expect(notebook.id).toBeDefined();
      expect(notebook.name).toBe("测试笔记本");
      expect(notebook.tenantId).toBe(tenantId);
      expect(notebook.userId).toBe(userId);
    });

    it("应该获取笔记本列表", async () => {
      await manager.createNotebook(tenantId, userId, { name: "笔记本1" });
      await manager.createNotebook(tenantId, userId, { name: "笔记本2" });

      const result = await manager.getNotebooks(tenantId, userId);
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("应该更新笔记本", async () => {
      const notebook = await manager.createNotebook(tenantId, userId, {
        name: "原始名称",
      });

      const updated = await manager.updateNotebook(tenantId, userId, notebook.id, {
        name: "更新后的名称",
      });

      expect(updated.name).toBe("更新后的名称");
    });

    it("应该删除笔记本", async () => {
      const notebook = await manager.createNotebook(tenantId, userId, {
        name: "待删除",
      });

      const result = await manager.deleteNotebook(tenantId, userId, notebook.id);
      expect(result).toBe(true);
    });
  });

  describe("笔记管理", () => {
    let notebookId: string;

    beforeEach(async () => {
      const notebook = await manager.createNotebook(tenantId, userId, {
        name: "测试笔记本",
      });
      notebookId = notebook.id;
    });

    it("应该创建笔记", async () => {
      const note = await manager.createNote(tenantId, userId, {
        title: "测试笔记",
        content: "这是测试内容",
        notebookId,
      });

      expect(note).toBeDefined();
      expect(note.id).toBeDefined();
      expect(note.title).toBe("测试笔记");
    });

    it("应该获取笔记列表", async () => {
      await manager.createNote(tenantId, userId, {
        title: "笔记1",
        content: "内容1",
        notebookId,
      });
      await manager.createNote(tenantId, userId, {
        title: "笔记2",
        content: "内容2",
        notebookId,
      });

      const result = await manager.getNotes(tenantId, userId, { notebookId });
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("应该获取单条笔记", async () => {
      const created = await manager.createNote(tenantId, userId, {
        title: "测试笔记",
        content: "内容",
        notebookId,
      });

      const note = await manager.getNote(tenantId, userId, created.id);
      expect(note).toBeDefined();
      expect(note?.title).toBe("测试笔记");
    });

    it("应该更新笔记", async () => {
      const note = await manager.createNote(tenantId, userId, {
        title: "原始标题",
        content: "原始内容",
        notebookId,
      });

      const updated = await manager.updateNote(tenantId, userId, note.id, {
        title: "更新后的标题",
        content: "更新后的内容",
      });

      expect(updated.title).toBe("更新后的标题");
      expect(updated.content).toBe("更新后的内容");
    });

    it("应该删除笔记", async () => {
      const note = await manager.createNote(tenantId, userId, {
        title: "待删除",
        content: "内容",
        notebookId,
      });

      const result = await manager.deleteNote(tenantId, userId, note.id);
      expect(result).toBe(true);
    });

    it("应该搜索笔记", async () => {
      await manager.createNote(tenantId, userId, {
        title: "苹果",
        content: "苹果是一种水果",
        notebookId,
      });
      await manager.createNote(tenantId, userId, {
        title: "香蕉",
        content: "香蕉是一种水果",
        notebookId,
      });

      const result = await manager.searchNotes(tenantId, userId, "水果");
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("笔记标签", () => {
    let notebookId: string;

    beforeEach(async () => {
      const notebook = await manager.createNotebook(tenantId, userId, {
        name: "测试笔记本",
      });
      notebookId = notebook.id;
    });

    it("应该为笔记添加标签", async () => {
      const note = await manager.createNote(tenantId, userId, {
        title: "测试笔记",
        content: "内容",
        notebookId,
        tags: ["标签1", "标签2"],
      });

      expect(note.tags).toContain("标签1");
      expect(note.tags).toContain("标签2");
    });

    it("应该按标签筛选笔记", async () => {
      await manager.createNote(tenantId, userId, {
        title: "笔记1",
        content: "内容1",
        notebookId,
        tags: ["重要"],
      });
      await manager.createNote(tenantId, userId, {
        title: "笔记2",
        content: "内容2",
        notebookId,
        tags: ["普通"],
      });

      const result = await manager.getNotesByTag(tenantId, userId, "重要");
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe("笔记1");
    });
  });

  describe("笔记收藏", () => {
    let notebookId: string;

    beforeEach(async () => {
      const notebook = await manager.createNotebook(tenantId, userId, {
        name: "测试笔记本",
      });
      notebookId = notebook.id;
    });

    it("应该收藏笔记", async () => {
      const note = await manager.createNote(tenantId, userId, {
        title: "测试笔记",
        content: "内容",
        notebookId,
      });

      const favorited = await manager.favoriteNote(tenantId, userId, note.id);
      expect(favorited.isFavorite).toBe(true);
    });

    it("应该取消收藏", async () => {
      const note = await manager.createNote(tenantId, userId, {
        title: "测试笔记",
        content: "内容",
        notebookId,
        isFavorite: true,
      });

      const unfavorited = await manager.unfavoriteNote(tenantId, userId, note.id);
      expect(unfavorited.isFavorite).toBe(false);
    });

    it("应该获取收藏的笔记列表", async () => {
      await manager.createNote(tenantId, userId, {
        title: "收藏笔记",
        content: "内容",
        notebookId,
        isFavorite: true,
      });
      await manager.createNote(tenantId, userId, {
        title: "普通笔记",
        content: "内容",
        notebookId,
        isFavorite: false,
      });

      const result = await manager.getFavoriteNotes(tenantId, userId);
      const favoriteNotes = result.items.filter((n) => n.title === "收藏笔记");
      expect(favoriteNotes.length).toBe(1);
    });
  });

  describe("多租户隔离", () => {
    it("不同租户的数据应该隔离", async () => {
      const tenant1Id = "tenant-1";
      const tenant2Id = "tenant-2";

      const notebook1 = await manager.createNotebook(tenant1Id, "user-1", {
        name: "租户1的笔记本",
      });

      const notebook2 = await manager.createNotebook(tenant2Id, "user-2", {
        name: "租户2的笔记本",
      });

      const result1 = await manager.getNotebooks(tenant1Id, "user-1");
      const result2 = await manager.getNotebooks(tenant2Id, "user-2");

      // 租户1看不到租户2的数据
      const tenant1Notebooks = result1.items.filter((nb) => nb.name === "租户2的笔记本");
      expect(tenant1Notebooks.length).toBe(0);

      // 租户2看不到租户1的数据
      const tenant2Notebooks = result2.items.filter((nb) => nb.name === "租户1的笔记本");
      expect(tenant2Notebooks.length).toBe(0);
    });
  });
});
