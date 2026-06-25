/**
 * AI Function Calling 工具定义
 * 定义 AI 助手可以调用的所有工具
 */

import type { ToolDefinition } from "../providers/base";

export const AI_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "search_files",
      description: "搜索文件。支持按文件名、标签、文件类型搜索，也可进行语义搜索。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词或语义描述",
          },
          fileType: {
            type: "string",
            description: "文件类型筛选",
            enum: ["image", "document", "video", "audio", "archive", "code", "other"],
          },
          limit: {
            type: "number",
            description: "返回结果数量，默认10",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_files",
      description: "列出文件，支持按类型、收藏、标签筛选，支持排序。",
      parameters: {
        type: "object",
        properties: {
          fileType: {
            type: "string",
            description: "文件类型筛选",
            enum: ["image", "document", "video", "audio", "archive", "code", "other"],
          },
          favoriteOnly: {
            type: "boolean",
            description: "是否只显示收藏文件",
          },
          tag: {
            type: "string",
            description: "按标签筛选",
          },
          sortBy: {
            type: "string",
            description: "排序方式",
            enum: ["dateDesc", "dateAsc", "nameAsc", "nameDesc", "sizeDesc", "sizeAsc"],
          },
          limit: {
            type: "number",
            description: "返回数量，默认20",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "add_tags",
      description: "为文件添加标签。",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "文件ID",
          },
          tags: {
            type: "string",
            description: "要添加的标签，多个用逗号分隔",
          },
        },
        required: ["fileId", "tags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "toggle_favorite",
      description: "收藏或取消收藏文件。",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "文件ID",
          },
          favorite: {
            type: "boolean",
            description: "true为收藏，false为取消收藏",
          },
        },
        required: ["fileId", "favorite"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_file",
      description: "将文件移到回收站。",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "文件ID",
          },
        },
        required: ["fileId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_info",
      description: "获取文件详细信息，包括大小、类型、标签、摘要等。",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "文件ID",
          },
        },
        required: ["fileId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_analytics",
      description: "获取存储统计信息，包括文件数量、总大小、各类型占比等。",
      parameters: {
        type: "object",
        properties: {},
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "summarize_file",
      description: "使用AI生成文件内容摘要。适用于文档和图片文件。",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "文件ID",
          },
        },
        required: ["fileId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "create_folder",
      description: "创建文件夹。",
      parameters: {
        type: "object",
        properties: {
          name: {
            type: "string",
            description: "文件夹名称",
          },
          parentId: {
            type: "string",
            description: "父文件夹ID，不传则创建在根目录",
          },
        },
        required: ["name"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_folders",
      description: "列出文件夹结构。",
      parameters: {
        type: "object",
        properties: {
          parentId: {
            type: "string",
            description: "父文件夹ID，不传则列出根目录",
          },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description: "将文件移动到指定文件夹。",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "文件ID",
          },
          folderId: {
            type: "string",
            description: "目标文件夹ID，传null移到根目录",
          },
        },
        required: ["fileId", "folderId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "rename_file",
      description: "重命名文件。",
      parameters: {
        type: "object",
        properties: {
          fileId: {
            type: "string",
            description: "文件ID",
          },
          newName: {
            type: "string",
            description: "新文件名",
          },
        },
        required: ["fileId", "newName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_tag",
      description: "批量为多个文件添加标签。",
      parameters: {
        type: "object",
        properties: {
          fileIds: {
            type: "string",
            description: "文件ID列表，用逗号分隔",
          },
          tags: {
            type: "string",
            description: "要添加的标签，多个用逗号分隔",
          },
        },
        required: ["fileIds", "tags"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "batch_delete",
      description: "批量将文件移到回收站。",
      parameters: {
        type: "object",
        properties: {
          fileIds: {
            type: "string",
            description: "文件ID列表，用逗号分隔",
          },
        },
        required: ["fileIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_files",
      description: "获取最近更新的文件列表。",
      parameters: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "返回数量，默认10",
          },
        },
        required: [],
      },
    },
  },
];

/** 工具名称类型 */
export type AiToolName = (typeof AI_TOOLS)[number]["function"]["name"];
