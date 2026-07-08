/**
 * AI 工具定义（Function Calling）结构单测
 *
 * 覆盖目标：src/lib/ai/tools/definitions.ts。该模块为纯数据层（仅 import 类型
 * ToolDefinition，无运行时外部依赖），声明 AI 助手可调用的全部工具，供
 * src/app/api/chat/route.ts 作为 tools 参数透传给模型提供商。此前零覆盖
 * （无任何测试文件真实导入本模块，chat-route 测试以 vi.mock 隔离）。
 *
 * 本测试通过结构断言 + JSON Schema 不变量校验，覆盖：
 * - 数组级结构：类型/数量/命名唯一性/字段完整性
 * - JSON Schema 不变量：parameters.type==='object'、required ⊆ properties、
 *   每个属性 type/description 非空
 * - 逐工具断言：15 个工具各自的 name/required/properties 键集合
 * - 枚举字段：fileType（7 值，仅 search_files/list_files）、sortBy（6 值，仅 list_files）
 * - 属性类型映射：query/limit/fileType/favoriteOnly/tag/sortBy/fileId/tags/
 *   favorite/name/parentId/folderId/newName/fileIds 的 type 断言
 * - AiToolName 类型：编译期可赋值 + 运行时与 AI_TOOLS 名集合一致
 *
 * 纯结构断言、无副作用，无需 mock。
 */
import { describe, it, expect } from "vitest";
import { AI_TOOLS } from "@/lib/ai/tools/definitions";
import type { AiToolName } from "@/lib/ai/tools/definitions";
import type { ToolDefinition } from "@/lib/ai/providers/base";

/** 期望的工具名集合（与 definitions.ts 顺序一致） */
const EXPECTED_NAMES = [
  "search_files",
  "list_files",
  "add_tags",
  "toggle_favorite",
  "delete_file",
  "get_file_info",
  "get_analytics",
  "summarize_file",
  "create_folder",
  "list_folders",
  "move_file",
  "rename_file",
  "batch_tag",
  "batch_delete",
  "get_recent_files",
] as const;

const FILE_TYPE_ENUM = [
  "image",
  "document",
  "video",
  "audio",
  "archive",
  "code",
  "other",
];
const SORT_BY_ENUM = [
  "dateDesc",
  "dateAsc",
  "nameAsc",
  "nameDesc",
  "sizeDesc",
  "sizeAsc",
];

function getTool(name: string): ToolDefinition {
  const t = AI_TOOLS.find((t) => t.function.name === name);
  if (!t) throw new Error(`tool not found: ${name}`);
  return t;
}

describe("AI_TOOLS 数组级结构", () => {
  it("为数组", () => {
    expect(Array.isArray(AI_TOOLS)).toBe(true);
  });

  it("包含 15 个工具", () => {
    expect(AI_TOOLS).toHaveLength(15);
  });

  it("每个工具 type 均为 'function'", () => {
    for (const t of AI_TOOLS) {
      expect(t.type).toBe("function");
    }
  });

  it("每个工具都有 function 对象", () => {
    for (const t of AI_TOOLS) {
      expect(typeof t.function).toBe("object");
      expect(t.function).not.toBeNull();
    }
  });

  it("工具名唯一（无重复）", () => {
    const names = AI_TOOLS.map((t) => t.function.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("工具名集合与期望一致", () => {
    expect(AI_TOOLS.map((t) => t.function.name)).toEqual([...EXPECTED_NAMES]);
  });

  it("每个工具名均为非空字符串", () => {
    for (const t of AI_TOOLS) {
      expect(typeof t.function.name).toBe("string");
      expect(t.function.name.length).toBeGreaterThan(0);
    }
  });

  it("每个工具 description 均为非空字符串", () => {
    for (const t of AI_TOOLS) {
      expect(typeof t.function.description).toBe("string");
      expect(t.function.description.length).toBeGreaterThan(0);
    }
  });

  it("每个工具 parameters.type 均为 'object'", () => {
    for (const t of AI_TOOLS) {
      expect(t.function.parameters.type).toBe("object");
    }
  });

  it("每个工具 properties 均为对象", () => {
    for (const t of AI_TOOLS) {
      expect(typeof t.function.parameters.properties).toBe("object");
      expect(t.function.parameters.properties).not.toBeNull();
    }
  });

  it("每个工具 required 均为数组", () => {
    for (const t of AI_TOOLS) {
      expect(Array.isArray(t.function.parameters.required)).toBe(true);
    }
  });

  it("JSON Schema 不变量：required 中每个字段都存在于 properties", () => {
    for (const t of AI_TOOLS) {
      const propKeys = Object.keys(t.function.parameters.properties);
      for (const req of t.function.parameters.required) {
        expect(propKeys).toContain(req);
      }
    }
  });

  it("每个属性 type 均为非空字符串", () => {
    for (const t of AI_TOOLS) {
      for (const [, prop] of Object.entries(t.function.parameters.properties)) {
        expect(typeof prop.type).toBe("string");
        expect(prop.type.length).toBeGreaterThan(0);
      }
    }
  });

  it("每个属性 description 均为非空字符串", () => {
    for (const t of AI_TOOLS) {
      for (const [, prop] of Object.entries(t.function.parameters.properties)) {
        expect(typeof prop.description).toBe("string");
        expect(prop.description.length).toBeGreaterThan(0);
      }
    }
  });

  it("required 中无重复字段", () => {
    for (const t of AI_TOOLS) {
      const req = t.function.parameters.required;
      expect(new Set(req).size).toBe(req.length);
    }
  });
});

describe("逐工具断言（name / required / properties 键）", () => {
  it("search_files：required=[query]，props={query,fileType,limit}", () => {
    const t = getTool("search_files");
    expect(t.function.parameters.required).toEqual(["query"]);
    expect(Object.keys(t.function.parameters.properties).sort()).toEqual(
      ["fileType", "limit", "query"].sort(),
    );
  });

  it("list_files：required=[]，props={fileType,favoriteOnly,tag,sortBy,limit}", () => {
    const t = getTool("list_files");
    expect(t.function.parameters.required).toEqual([]);
    expect(Object.keys(t.function.parameters.properties).sort()).toEqual(
      ["favoriteOnly", "fileType", "limit", "sortBy", "tag"].sort(),
    );
  });

  it("add_tags：required=[fileId,tags]，props={fileId,tags}", () => {
    const t = getTool("add_tags");
    expect(t.function.parameters.required).toEqual(["fileId", "tags"]);
    expect(Object.keys(t.function.parameters.properties).sort()).toEqual(
      ["fileId", "tags"].sort(),
    );
  });

  it("toggle_favorite：required=[fileId,favorite]，props={fileId,favorite}", () => {
    const t = getTool("toggle_favorite");
    expect(t.function.parameters.required).toEqual(["fileId", "favorite"]);
    expect(Object.keys(t.function.parameters.properties).sort()).toEqual(
      ["favorite", "fileId"].sort(),
    );
  });

  it("delete_file：required=[fileId]，props={fileId}", () => {
    const t = getTool("delete_file");
    expect(t.function.parameters.required).toEqual(["fileId"]);
    expect(Object.keys(t.function.parameters.properties)).toEqual(["fileId"]);
  });

  it("get_file_info：required=[fileId]，props={fileId}", () => {
    const t = getTool("get_file_info");
    expect(t.function.parameters.required).toEqual(["fileId"]);
    expect(Object.keys(t.function.parameters.properties)).toEqual(["fileId"]);
  });

  it("get_analytics：required=[]，props={}（空参数无参工具）", () => {
    const t = getTool("get_analytics");
    expect(t.function.parameters.required).toEqual([]);
    expect(Object.keys(t.function.parameters.properties)).toEqual([]);
  });

  it("summarize_file：required=[fileId]，props={fileId}", () => {
    const t = getTool("summarize_file");
    expect(t.function.parameters.required).toEqual(["fileId"]);
    expect(Object.keys(t.function.parameters.properties)).toEqual(["fileId"]);
  });

  it("create_folder：required=[name]，props={name,parentId}", () => {
    const t = getTool("create_folder");
    expect(t.function.parameters.required).toEqual(["name"]);
    expect(Object.keys(t.function.parameters.properties).sort()).toEqual(
      ["name", "parentId"].sort(),
    );
  });

  it("list_folders：required=[]，props={parentId}", () => {
    const t = getTool("list_folders");
    expect(t.function.parameters.required).toEqual([]);
    expect(Object.keys(t.function.parameters.properties)).toEqual(["parentId"]);
  });

  it("move_file：required=[fileId,folderId]，props={fileId,folderId}", () => {
    const t = getTool("move_file");
    expect(t.function.parameters.required).toEqual(["fileId", "folderId"]);
    expect(Object.keys(t.function.parameters.properties).sort()).toEqual(
      ["fileId", "folderId"].sort(),
    );
  });

  it("rename_file：required=[fileId,newName]，props={fileId,newName}", () => {
    const t = getTool("rename_file");
    expect(t.function.parameters.required).toEqual(["fileId", "newName"]);
    expect(Object.keys(t.function.parameters.properties).sort()).toEqual(
      ["fileId", "newName"].sort(),
    );
  });

  it("batch_tag：required=[fileIds,tags]，props={fileIds,tags}", () => {
    const t = getTool("batch_tag");
    expect(t.function.parameters.required).toEqual(["fileIds", "tags"]);
    expect(Object.keys(t.function.parameters.properties).sort()).toEqual(
      ["fileIds", "tags"].sort(),
    );
  });

  it("batch_delete：required=[fileIds]，props={fileIds}", () => {
    const t = getTool("batch_delete");
    expect(t.function.parameters.required).toEqual(["fileIds"]);
    expect(Object.keys(t.function.parameters.properties)).toEqual(["fileIds"]);
  });

  it("get_recent_files：required=[]，props={limit}", () => {
    const t = getTool("get_recent_files");
    expect(t.function.parameters.required).toEqual([]);
    expect(Object.keys(t.function.parameters.properties)).toEqual(["limit"]);
  });
});

describe("枚举字段", () => {
  it("search_files.fileType 枚举为 7 个文件类型", () => {
    const prop = getTool("search_files").function.parameters.properties[
      "fileType"
    ];
    expect(prop?.enum).toEqual(FILE_TYPE_ENUM);
  });

  it("list_files.fileType 枚举为 7 个文件类型", () => {
    const prop = getTool("list_files").function.parameters.properties[
      "fileType"
    ];
    expect(prop?.enum).toEqual(FILE_TYPE_ENUM);
  });

  it("仅 search_files 与 list_files 含 fileType 枚举，其余工具不含", () => {
    for (const t of AI_TOOLS) {
      const ft = t.function.parameters.properties["fileType"];
      if (t.function.name === "search_files" || t.function.name === "list_files") {
        expect(ft).toBeDefined();
      } else {
        expect(ft).toBeUndefined();
      }
    }
  });

  it("list_files.sortBy 枚举为 6 个排序方式", () => {
    const prop = getTool("list_files").function.parameters.properties["sortBy"];
    expect(prop?.enum).toEqual(SORT_BY_ENUM);
  });

  it("仅 list_files 含 sortBy 枚举，其余工具不含", () => {
    for (const t of AI_TOOLS) {
      const sb = t.function.parameters.properties["sortBy"];
      if (t.function.name === "list_files") {
        expect(sb).toBeDefined();
      } else {
        expect(sb).toBeUndefined();
      }
    }
  });

  it("fileType 与 sortBy 之外无其它属性携带 enum", () => {
    for (const t of AI_TOOLS) {
      for (const [key, prop] of Object.entries(
        t.function.parameters.properties,
      )) {
        if (key === "fileType" || key === "sortBy") {
          expect(prop.enum).toBeDefined();
        } else {
          expect(prop.enum).toBeUndefined();
        }
      }
    }
  });
});

describe("属性类型映射", () => {
  it("query 为 string（search_files）", () => {
    expect(
      getTool("search_files").function.parameters.properties["query"]?.type,
    ).toBe("string");
  });

  it("limit 为 number（search_files / list_files / get_recent_files）", () => {
    expect(
      getTool("search_files").function.parameters.properties["limit"]?.type,
    ).toBe("number");
    expect(
      getTool("list_files").function.parameters.properties["limit"]?.type,
    ).toBe("number");
    expect(
      getTool("get_recent_files").function.parameters.properties["limit"]?.type,
    ).toBe("number");
  });

  it("fileType 为 string（search_files / list_files）", () => {
    expect(
      getTool("search_files").function.parameters.properties["fileType"]?.type,
    ).toBe("string");
    expect(
      getTool("list_files").function.parameters.properties["fileType"]?.type,
    ).toBe("string");
  });

  it("favoriteOnly 为 boolean（list_files）", () => {
    expect(
      getTool("list_files").function.parameters.properties["favoriteOnly"]?.type,
    ).toBe("boolean");
  });

  it("tag 为 string（list_files）", () => {
    expect(
      getTool("list_files").function.parameters.properties["tag"]?.type,
    ).toBe("string");
  });

  it("sortBy 为 string（list_files）", () => {
    expect(
      getTool("list_files").function.parameters.properties["sortBy"]?.type,
    ).toBe("string");
  });

  it("fileId 为 string（出现于 7 个工具：add_tags/toggle_favorite/delete_file/get_file_info/summarize_file/move_file/rename_file）", () => {
    const fileIdTools = [
      "add_tags",
      "toggle_favorite",
      "delete_file",
      "get_file_info",
      "summarize_file",
      "move_file",
      "rename_file",
    ];
    for (const name of fileIdTools) {
      expect(
        getTool(name).function.parameters.properties["fileId"]?.type,
      ).toBe("string");
    }
  });

  it("tags 为 string（add_tags）", () => {
    expect(
      getTool("add_tags").function.parameters.properties["tags"]?.type,
    ).toBe("string");
  });

  it("favorite 为 boolean（toggle_favorite）", () => {
    expect(
      getTool("toggle_favorite").function.parameters.properties["favorite"]
        ?.type,
    ).toBe("boolean");
  });

  it("name 为 string（create_folder）", () => {
    expect(
      getTool("create_folder").function.parameters.properties["name"]?.type,
    ).toBe("string");
  });

  it("parentId 为 string（create_folder / list_folders）", () => {
    expect(
      getTool("create_folder").function.parameters.properties["parentId"]?.type,
    ).toBe("string");
    expect(
      getTool("list_folders").function.parameters.properties["parentId"]?.type,
    ).toBe("string");
  });

  it("folderId 为 string（move_file）", () => {
    expect(
      getTool("move_file").function.parameters.properties["folderId"]?.type,
    ).toBe("string");
  });

  it("newName 为 string（rename_file）", () => {
    expect(
      getTool("rename_file").function.parameters.properties["newName"]?.type,
    ).toBe("string");
  });

  it("fileIds 为 string（batch_tag / batch_delete）", () => {
    expect(
      getTool("batch_tag").function.parameters.properties["fileIds"]?.type,
    ).toBe("string");
    expect(
      getTool("batch_delete").function.parameters.properties["fileIds"]?.type,
    ).toBe("string");
  });
});

describe("AiToolName 类型", () => {
  it("编译期：每个期望名均可赋值给 AiToolName", () => {
    // 若任一名称不在 AiToolName 联合中，此处编译失败
    const _check: AiToolName[] = [...EXPECTED_NAMES];
    expect(_check).toHaveLength(15);
  });

  it("运行时：AiToolName 名集合与 AI_TOOLS 运行时名一致", () => {
    // AiToolName 源自 (typeof AI_TOOLS)[number]['function']['name']，
    // 故运行时名集合即类型联合的真值
    const runtimeNames = AI_TOOLS.map((t) => t.function.name);
    expect(runtimeNames).toEqual([...EXPECTED_NAMES]);
  });

  it("AiToolName 联合大小为 15（与工具数一致）", () => {
    // 间接校验：唯一名数 === 工具数 === 期望数
    expect(new Set(AI_TOOLS.map((t) => t.function.name)).size).toBe(15);
    expect(EXPECTED_NAMES.length).toBe(15);
  });
});
