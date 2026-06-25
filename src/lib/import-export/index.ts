/**
 * 数据导入导出工具
 * 支持多种格式和数据类型的导入导出
 */

import { db } from "@/lib/db";

// 导出选项
export interface ExportOptions {
  format: "json" | "csv";
  includeFiles: boolean;
  includeFolders: boolean;
  includeTags: boolean;
  includeShares: boolean;
  includeComments: boolean;
  includeAccessHistory: boolean;
  includeVersions: boolean;
  includeSettings: boolean;
}

// 导出结果
export interface ExportResult {
  version: string;
  exportedAt: string;
  userId: string;
  tenantId: string;
  stats: {
    files: number;
    folders: number;
    tags: number;
    shares: number;
    comments: number;
    accessHistory: number;
    versions: number;
  };
  data: any;
}

// 导入选项
export interface ImportOptions {
  conflictStrategy: "skip" | "overwrite" | "rename";
  importFiles: boolean;
  importFolders: boolean;
  importTags: boolean;
}

// 导入结果
export interface ImportResult {
  success: boolean;
  importedFiles: number;
  skippedFiles: number;
  importedFolders: number;
  skippedFolders: number;
  errors: string[];
  totalErrors: number;
}

// 默认导出选项
export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  format: "json",
  includeFiles: true,
  includeFolders: true,
  includeTags: true,
  includeShares: false,
  includeComments: false,
  includeAccessHistory: false,
  includeVersions: false,
  includeSettings: false,
};

// 默认导入选项
export const DEFAULT_IMPORT_OPTIONS: ImportOptions = {
  conflictStrategy: "skip",
  importFiles: true,
  importFolders: true,
  importTags: true,
};

// 导出数据
export async function exportData(
  userId: string,
  tenantId: string,
  options: Partial<ExportOptions> = {}
): Promise<ExportResult> {
  const opts = { ...DEFAULT_EXPORT_OPTIONS, ...options };
  const result: ExportResult = {
    version: "1.0",
    exportedAt: new Date().toISOString(),
    userId,
    tenantId,
    stats: {
      files: 0,
      folders: 0,
      tags: 0,
      shares: 0,
      comments: 0,
      accessHistory: 0,
      versions: 0,
    },
    data: {},
  };

  // 导出文件
  if (opts.includeFiles) {
    const files = await db.file.findMany({
      where: { userId, tenantId, isDeleted: false },
      select: {
        id: true,
        fileName: true,
        fileType: true,
        fileSize: true,
        folderId: true,
        tags: true,
        isFavorite: true,
        summary: true,
        keyPoints: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    result.data.files = files.map((file) => ({
      ...file,
      tags: file.tags ? JSON.parse(file.tags) : [],
      keyPoints: file.keyPoints ? JSON.parse(file.keyPoints) : [],
    }));
    result.stats.files = files.length;
  }

  // 导出文件夹
  if (opts.includeFolders) {
    const folders = await db.folder.findMany({
      where: { userId, tenantId },
      select: {
        id: true,
        name: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "asc" },
    });

    result.data.folders = folders;
    result.stats.folders = folders.length;
  }

  // 导出标签统计
  if (opts.includeTags) {
    const files = await db.file.findMany({
      where: { userId, tenantId, isDeleted: false },
      select: { tags: true },
    });

    const tagCountMap = new Map<string, number>();
    for (const file of files) {
      const tags = file.tags ? JSON.parse(file.tags) : [];
      for (const tag of tags) {
        if (tag && typeof tag === "string") {
          tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
        }
      }
    }

    result.data.tags = Array.from(tagCountMap.entries()).map(([name, count]) => ({
      name,
      count,
    }));
    result.stats.tags = tagCountMap.size;
  }

  // 导出分享记录
  if (opts.includeShares) {
    const shares = await db.fileShare.findMany({
      where: {
        file: { userId, tenantId },
      },
      select: {
        id: true,
        fileId: true,
        token: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    result.data.shares = shares;
    result.stats.shares = shares.length;
  }

  // 导出评论
  if (opts.includeComments) {
    const comments = await db.comment.findMany({
      where: { tenantId },
      select: {
        id: true,
        fileId: true,
        userId: true,
        content: true,
        parentId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    result.data.comments = comments;
    result.stats.comments = comments.length;
  }

  // 导出版本历史
  if (opts.includeVersions) {
    const versions = await db.fileVersion.findMany({
      where: {
        file: { userId, tenantId },
      },
      select: {
        id: true,
        fileId: true,
        fileName: true,
        fileSize: true,
        version: true,
        createdAt: true,
      },
    });

    result.data.versions = versions;
    result.stats.versions = versions.length;
  }

  return result;
}

// 导入数据
export async function importData(
  userId: string,
  tenantId: string,
  importData: any,
  options: Partial<ImportOptions> = {}
): Promise<ImportResult> {
  const opts = { ...DEFAULT_IMPORT_OPTIONS, ...options };
  const result: ImportResult = {
    success: true,
    importedFiles: 0,
    skippedFiles: 0,
    importedFolders: 0,
    skippedFolders: 0,
    errors: [],
    totalErrors: 0,
  };

  try {
    await db.$transaction(async (tx) => {
      // 导入文件夹
      if (opts.importFolders && importData.folders && Array.isArray(importData.folders)) {
        // 创建文件夹ID映射（旧ID -> 新ID）
        const folderIdMap = new Map<string, string>();

        // 先导入根文件夹
        const rootFolders = importData.folders.filter((f: any) => !f.parentId);
        for (const folder of rootFolders) {
          try {
            const existingFolder = await tx.folder.findFirst({
              where: {
                name: folder.name,
                parentId: null,
                userId,
                tenantId,
              },
            });

            if (existingFolder) {
              if (opts.conflictStrategy === "skip") {
                result.skippedFolders++;
                folderIdMap.set(folder.id, existingFolder.id);
                continue;
              }
            }

            const newFolder = await tx.folder.create({
              data: {
                name: folder.name,
                parentId: null,
                userId,
                tenantId,
              },
            });

            folderIdMap.set(folder.id, newFolder.id);
            result.importedFolders++;
          } catch (error) {
            result.errors.push(`导入文件夹失败: ${folder.name}`);
            result.totalErrors++;
          }
        }

        // 再导入子文件夹
        const childFolders = importData.folders.filter((f: any) => f.parentId);
        for (const folder of childFolders) {
          try {
            const newParentId = folderIdMap.get(folder.parentId) || folder.parentId;

            const existingFolder = await tx.folder.findFirst({
              where: {
                name: folder.name,
                parentId: newParentId,
                userId,
                tenantId,
              },
            });

            if (existingFolder) {
              if (opts.conflictStrategy === "skip") {
                result.skippedFolders++;
                folderIdMap.set(folder.id, existingFolder.id);
                continue;
              }
            }

            const newFolder = await tx.folder.create({
              data: {
                name: folder.name,
                parentId: newParentId,
                userId,
                tenantId,
              },
            });

            folderIdMap.set(folder.id, newFolder.id);
            result.importedFolders++;
          } catch (error) {
            result.errors.push(`导入文件夹失败: ${folder.name}`);
            result.totalErrors++;
          }
        }

        // 保存文件夹ID映射，供文件导入使用
        (result as any).folderIdMap = folderIdMap;
      }

      // 导入文件
      if (opts.importFiles && importData.files && Array.isArray(importData.files)) {
        const folderIdMap = (result as any).folderIdMap || new Map();

        for (const file of importData.files) {
          try {
            // 转换文件夹ID
            let newFolderId = file.folderId;
            if (file.folderId && folderIdMap.has(file.folderId)) {
              newFolderId = folderIdMap.get(file.folderId);
            }

            // 检查文件是否已存在（按文件名和文件夹）
            const existingFile = await tx.file.findFirst({
              where: {
                fileName: file.fileName,
                folderId: newFolderId || null,
                userId,
                tenantId,
                isDeleted: false,
              },
            });

            if (existingFile) {
              if (opts.conflictStrategy === "skip") {
                result.skippedFiles++;
                continue;
              } else if (opts.conflictStrategy === "rename") {
                // 重命名
                const ext = file.fileName.split(".").pop();
                const baseName = file.fileName.substring(
                  0,
                  file.fileName.length - (ext?.length || 0) - 1
                );
                file.fileName = `${baseName} (导入).${ext}`;
              }
            }

            // 创建文件记录（注意：不导入实际文件内容，只导入元数据）
            await tx.file.create({
              data: {
                fileName: file.fileName,
                fileType: file.fileType || "other",
                fileSize: file.fileSize || 0,
                folderId: newFolderId || null,
                tags: JSON.stringify(file.tags || []),
                isFavorite: file.isFavorite || false,
                summary: file.summary || null,
                keyPoints: JSON.stringify(file.keyPoints || []),
                userId,
                tenantId,
                storageMode: "local",
                syncStatus: "local",
              },
            });

            result.importedFiles++;
          } catch (error) {
            result.errors.push(`导入文件失败: ${file.fileName}`);
            result.totalErrors++;
          }
        }
      }
    });
  } catch (error) {
    result.success = false;
    result.errors.push("导入事务失败");
    result.totalErrors++;
  }

  return result;
}

// 生成CSV内容
export function generateCsv(files: any[]): string {
  if (!files || files.length === 0) {
    return "文件名,类型,大小,文件夹,标签,收藏,创建时间\n";
  }

  const headers = [
    "文件名",
    "类型",
    "大小",
    "文件夹",
    "标签",
    "收藏",
    "创建时间",
  ];

  const rows = files.map((file) => [
    `"${file.fileName?.replace(/"/g, '""') || ""}"`,
    file.fileType || "",
    file.fileSize || 0,
    file.folderId || "",
    `"${(file.tags || []).join(", ")}"`,
    file.isFavorite ? "是" : "否",
    file.createdAt || "",
  ]);

  return [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");
}

// 格式化文件大小
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
