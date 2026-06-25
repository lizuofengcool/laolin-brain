import { describe, it, expect, beforeEach } from "vitest";
import { TodosManager } from "@/lib/todos/todos-manager";
import type { Todo, TodoList } from "@/lib/todos/types";

describe("待办事项模块测试", () => {
  let manager: TodosManager;
  const tenantId = "test-tenant-1";
  const userId = "test-user-1";

  beforeEach(() => {
    manager = new TodosManager();
  });

  describe("任务列表管理", () => {
    it("应该创建任务列表", async () => {
      const list = await manager.createList(tenantId, userId, {
        name: "测试任务列表",
        description: "这是一个测试任务列表",
      });

      expect(list).toBeDefined();
      expect(list.id).toBeDefined();
      expect(list.name).toBe("测试任务列表");
      expect(list.tenantId).toBe(tenantId);
      expect(list.userId).toBe(userId);
    });

    it("应该获取任务列表", async () => {
      await manager.createList(tenantId, userId, { name: "列表1" });
      await manager.createList(tenantId, userId, { name: "列表2" });

      const result = await manager.getLists(tenantId, userId);
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("应该更新任务列表", async () => {
      const list = await manager.createList(tenantId, userId, {
        name: "原始名称",
      });

      const updated = await manager.updateList(tenantId, userId, list.id, {
        name: "更新后的名称",
      });

      expect(updated.name).toBe("更新后的名称");
    });

    it("应该删除任务列表", async () => {
      const list = await manager.createList(tenantId, userId, {
        name: "待删除",
      });

      const result = await manager.deleteList(tenantId, userId, list.id);
      expect(result).toBe(true);
    });
  });

  describe("任务管理", () => {
    let listId: string;

    beforeEach(async () => {
      const list = await manager.createList(tenantId, userId, {
        name: "测试任务列表",
      });
      listId = list.id;
    });

    it("应该创建任务", async () => {
      const todo = await manager.createTodo(tenantId, userId, {
        title: "测试任务",
        description: "这是测试任务描述",
        listId,
      });

      expect(todo).toBeDefined();
      expect(todo.id).toBeDefined();
      expect(todo.title).toBe("测试任务");
      expect(todo.completed).toBe(false);
    });

    it("应该获取任务列表", async () => {
      await manager.createTodo(tenantId, userId, {
        title: "任务1",
        listId,
      });
      await manager.createTodo(tenantId, userId, {
        title: "任务2",
        listId,
      });

      const result = await manager.getTodos(tenantId, userId, { listId });
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });

    it("应该获取单个任务", async () => {
      const created = await manager.createTodo(tenantId, userId, {
        title: "测试任务",
        listId,
      });

      const todo = await manager.getTodo(tenantId, userId, created.id);
      expect(todo).toBeDefined();
      expect(todo?.title).toBe("测试任务");
    });

    it("应该更新任务", async () => {
      const todo = await manager.createTodo(tenantId, userId, {
        title: "原始标题",
        description: "原始描述",
        listId,
      });

      const updated = await manager.updateTodo(tenantId, userId, todo.id, {
        title: "更新后的标题",
        description: "更新后的描述",
      });

      expect(updated.title).toBe("更新后的标题");
      expect(updated.description).toBe("更新后的描述");
    });

    it("应该删除任务", async () => {
      const todo = await manager.createTodo(tenantId, userId, {
        title: "待删除",
        listId,
      });

      const result = await manager.deleteTodo(tenantId, userId, todo.id);
      expect(result).toBe(true);
    });

    it("应该完成任务", async () => {
      const todo = await manager.createTodo(tenantId, userId, {
        title: "测试任务",
        listId,
      });

      const completed = await manager.completeTodo(tenantId, userId, todo.id);
      expect(completed.completed).toBe(true);
      expect(completed.completedAt).toBeDefined();
    });

    it("应该恢复任务", async () => {
      const todo = await manager.createTodo(tenantId, userId, {
        title: "测试任务",
        listId,
        completed: true,
      });

      const uncompleted = await manager.uncompleteTodo(tenantId, userId, todo.id);
      expect(uncompleted.completed).toBe(false);
      expect(uncompleted.completedAt).toBeNull();
    });

    it("应该搜索任务", async () => {
      await manager.createTodo(tenantId, userId, {
        title: "买苹果",
        description: "去超市买苹果",
        listId,
      });
      await manager.createTodo(tenantId, userId, {
        title: "买香蕉",
        description: "去超市买香蕉",
        listId,
      });

      const result = await manager.searchTodos(tenantId, userId, "超市");
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("任务优先级", () => {
    let listId: string;

    beforeEach(async () => {
      const list = await manager.createList(tenantId, userId, {
        name: "测试任务列表",
      });
      listId = list.id;
    });

    it("应该设置任务优先级", async () => {
      const todo = await manager.createTodo(tenantId, userId, {
        title: "高优先级任务",
        listId,
        priority: "high",
      });

      expect(todo.priority).toBe("high");
    });

    it("应该按优先级筛选任务", async () => {
      await manager.createTodo(tenantId, userId, {
        title: "高优先级",
        listId,
        priority: "high",
      });
      await manager.createTodo(tenantId, userId, {
        title: "低优先级",
        listId,
        priority: "low",
      });

      const result = await manager.getTodos(tenantId, userId, {
        listId,
        priority: "high",
      });

      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe("高优先级");
    });
  });

  describe("任务标签", () => {
    let listId: string;

    beforeEach(async () => {
      const list = await manager.createList(tenantId, userId, {
        name: "测试任务列表",
      });
      listId = list.id;
    });

    it("应该为任务添加标签", async () => {
      const todo = await manager.createTodo(tenantId, userId, {
        title: "测试任务",
        listId,
        tags: ["工作", "重要"],
      });

      expect(todo.tags).toContain("工作");
      expect(todo.tags).toContain("重要");
    });

    it("应该按标签筛选任务", async () => {
      await manager.createTodo(tenantId, userId, {
        title: "工作任务",
        listId,
        tags: ["工作"],
      });
      await manager.createTodo(tenantId, userId, {
        title: "个人任务",
        listId,
        tags: ["个人"],
      });

      const result = await manager.getTodosByTag(tenantId, userId, "工作");
      expect(result.items.length).toBe(1);
      expect(result.items[0].title).toBe("工作任务");
    });
  });

  describe("子任务", () => {
    let listId: string;
    let parentTodoId: string;

    beforeEach(async () => {
      const list = await manager.createList(tenantId, userId, {
        name: "测试任务列表",
      });
      listId = list.id;

      const parentTodo = await manager.createTodo(tenantId, userId, {
        title: "父任务",
        listId,
      });
      parentTodoId = parentTodo.id;
    });

    it("应该创建子任务", async () => {
      const subTodo = await manager.createTodo(tenantId, userId, {
        title: "子任务",
        listId,
        parentId: parentTodoId,
      });

      expect(subTodo.parentId).toBe(parentTodoId);
    });

    it("应该获取子任务列表", async () => {
      await manager.createTodo(tenantId, userId, {
        title: "子任务1",
        listId,
        parentId: parentTodoId,
      });
      await manager.createTodo(tenantId, userId, {
        title: "子任务2",
        listId,
        parentId: parentTodoId,
      });

      const result = await manager.getSubTodos(tenantId, userId, parentTodoId);
      expect(result.items.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("多租户隔离", () => {
    it("不同租户的数据应该隔离", async () => {
      const tenant1Id = "tenant-1";
      const tenant2Id = "tenant-2";

      const list1 = await manager.createList(tenant1Id, "user-1", {
        name: "租户1的任务列表",
      });

      const list2 = await manager.createList(tenant2Id, "user-2", {
        name: "租户2的任务列表",
      });

      const result1 = await manager.getLists(tenant1Id, "user-1");
      const result2 = await manager.getLists(tenant2Id, "user-2");

      // 租户1看不到租户2的数据
      const tenant1Lists = result1.items.filter((l) => l.name === "租户2的任务列表");
      expect(tenant1Lists.length).toBe(0);

      // 租户2看不到租户1的数据
      const tenant2Lists = result2.items.filter((l) => l.name === "租户1的任务列表");
      expect(tenant2Lists.length).toBe(0);
    });
  });
});
