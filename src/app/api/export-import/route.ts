import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { safeJsonParseArray } from "@/lib/safe-json-parse";
import { escapeCsvCell } from "@/lib/csv-utils";

/**
 * 导入导出API
 * GET /api/export - 导出数据
 * POST /api/import - 导入数据
 */

// ─── GET /api/export — 导出数据 ─────────────
export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json'; // json, csv
    const includeFiles = searchParams.get('includeFiles') !== 'false';
    const includeFolders = searchParams.get('includeFolders') !== 'false';
    const includeTags = searchParams.get('includeTags') !== 'false';
    const includeSettings = searchParams.get('includeSettings') === 'true';

    // 构建导出数据
    const exportData: any = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      userId,
      tenantId,
    };

    // 导出文件
    if (includeFiles) {
      const files = await db.file.findMany({
        where: {
          userId,
          tenantId,
          isDeleted: false,
        },
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
        orderBy: { createdAt: 'desc' },
      });

      // 解析tags字段
      exportData.files = files.map(file => ({
        ...file,
        tags: safeJsonParseArray(file.tags as any),
      }));
    }

    // 导出文件夹
    if (includeFolders) {
      const folders = await db.folder.findMany({
        where: {
          userId,
          tenantId,
        },
        select: {
          id: true,
          name: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      exportData.folders = folders;
    }

    // 导出标签统计
    if (includeTags) {
      const files = await db.file.findMany({
        where: {
          userId,
          tenantId,
          isDeleted: false,
        },
        select: { tags: true },
      });

      const tagCountMap = new Map<string, number>();
      for (const file of files) {
        const tags = safeJsonParseArray(file.tags as any);
        for (const tag of tags) {
          if (tag && typeof tag === 'string') {
            tagCountMap.set(tag, (tagCountMap.get(tag) || 0) + 1);
          }
        }
      }

      exportData.tags = Array.from(tagCountMap.entries()).map(([name, count]) => ({
        name,
        count,
      }));
    }

    // 返回导出数据
    if (format === 'csv') {
      // CSV格式（仅文件列表）
      const csvContent = generateCsv(exportData.files || []);
      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="laolin-brain-export-${Date.now()}.csv"`,
        },
      });
    }

    // JSON格式
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="laolin-brain-export-${Date.now()}.json"`,
      },
    });
  } catch (error) {
    console.error('Export failed:', error);
    return NextResponse.json(
      { error: '导出失败' },
      { status: 500 }
    );
  }
}

// ─── POST /api/import — 导入数据 ─────────────
export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;

  const { userId, tenantId, role } = auth;

  try {
    const body = await request.json();
    const { data, conflictStrategy = 'skip' } = body; // skip, overwrite, rename

    if (!data) {
      return NextResponse.json(
        { error: '导入数据不能为空' },
        { status: 400 }
      );
    }

    // 解析导入数据
    let importData: any;
    if (typeof data === 'string') {
      importData = JSON.parse(data);
    } else {
      importData = data;
    }

    // 验证数据格式
    if (!importData || typeof importData !== 'object') {
      return NextResponse.json(
        { error: '无效的导入数据格式' },
        { status: 400 }
      );
    }

    let importedFiles = 0;
    let skippedFiles = 0;
    let importedFolders = 0;
    let errors: string[] = [];

    // 使用事务导入
    await db.$transaction(async (tx) => {
      // 导入文件夹
      if (importData.folders && Array.isArray(importData.folders)) {
        for (const folder of importData.folders) {
          try {
            // 检查文件夹是否已存在
            const existingFolder = await tx.folder.findFirst({
              where: {
                name: folder.name,
                parentId: folder.parentId || null,
                userId,
                tenantId,
              },
            });

            if (existingFolder) {
              if (conflictStrategy === 'skip') {
                skippedFiles++;
                continue;
              }
              // 其他策略暂时跳过
              skippedFiles++;
              continue;
            }

            // 创建文件夹
            await tx.folder.create({
              data: {
                name: folder.name,
                parentId: folder.parentId || null,
                userId,
                tenantId,
              },
            });
            importedFolders++;
          } catch (err: any) {
            errors.push(`文件夹 ${folder.name}: ${err.message}`);
          }
        }
      }

      // 导入文件（仅元数据，不包含实际文件内容）
      if (importData.files && Array.isArray(importData.files)) {
        for (const file of importData.files) {
          try {
            // 检查文件是否已存在
            const existingFile = await tx.file.findFirst({
              where: {
                fileName: file.fileName,
                folderId: file.folderId || null,
                userId,
                tenantId,
                isDeleted: false,
              },
            });

            if (existingFile) {
              if (conflictStrategy === 'skip') {
                skippedFiles++;
                continue;
              } else if (conflictStrategy === 'overwrite') {
                // 更新文件
                await tx.file.update({
                  where: { id: existingFile.id },
                  data: {
                    tags: JSON.stringify(file.tags || []),
                    isFavorite: file.isFavorite || false,
                    summary: file.summary || null,
                    keyPoints: JSON.stringify(file.keyPoints || []),
                  },
                });
                importedFiles++;
                continue;
              } else if (conflictStrategy === 'rename') {
                // 重命名（添加后缀）
                const baseName = file.fileName.replace(/\.[^/.]+$/, '');
                const ext = file.fileName.match(/\.[^/.]+$/)?.[0] || '';
                let newName = `${baseName} (导入)${ext}`;
                let counter = 1;

                // 确保新名称不冲突
                while (await tx.file.findFirst({
                  where: {
                    fileName: newName,
                    folderId: file.folderId || null,
                    userId,
                    tenantId,
                    isDeleted: false,
                  },
                })) {
                  counter++;
                  newName = `${baseName} (导入 ${counter})${ext}`;
                }

                // 创建新文件记录（注意：没有实际文件内容）
                await tx.file.create({
                  data: {
                    fileName: newName,
                    fileType: file.fileType || 'other',
                    fileSize: file.fileSize || 0,
                    folderId: file.folderId || null,
                    tags: JSON.stringify(file.tags || []),
                    isFavorite: file.isFavorite || false,
                    summary: file.summary || null,
                    keyPoints: JSON.stringify(file.keyPoints || []),
                    userId,
                    tenantId,
                    storageMode: 'local',
                    syncStatus: 'local',
                  },
                });
                importedFiles++;
                continue;
              }
            }

            // 创建新文件记录（注意：没有实际文件内容）
            await tx.file.create({
              data: {
                fileName: file.fileName,
                fileType: file.fileType || 'other',
                fileSize: file.fileSize || 0,
                folderId: file.folderId || null,
                tags: JSON.stringify(file.tags || []),
                isFavorite: file.isFavorite || false,
                summary: file.summary || null,
                keyPoints: JSON.stringify(file.keyPoints || []),
                userId,
                tenantId,
                storageMode: 'local',
                syncStatus: 'local',
              },
            });
            importedFiles++;
          } catch (err: any) {
            errors.push(`文件 ${file.fileName}: ${err.message}`);
          }
        }
      }
    });

    return NextResponse.json({
      success: true,
      importedFiles,
      skippedFiles,
      importedFolders,
      errors,
      totalErrors: errors.length,
    });
  } catch (error: any) {
    console.error('Import failed:', error);
    return NextResponse.json(
      { error: error.message || '导入失败' },
      { status: 500 }
    );
  }
}

// ─── 生成CSV内容 ─────────────
// 与 src/lib/import-export/index.ts 的 generateCsv 近重复但列集不同（此处含「更新时间」、
// 不含「文件夹」），故保留本地实现，仅把转义统一交给共享 escapeCsvCell（RFC 4180）。
// 去重为独立关切，不在此混入。
function generateCsv(files: any[]): string {
  const headers = [
    '文件名',
    '文件类型',
    '文件大小',
    '标签',
    '是否收藏',
    '创建时间',
    '更新时间',
  ];

  const rows = files.map(file => [
    escapeCsvCell(file.fileName ?? ''),
    escapeCsvCell(file.fileType ?? ''),
    escapeCsvCell(file.fileSize ?? 0),
    // tags 保留既有「逗号连接成单格」表示，仅把转义交给 escapeCsvCell：
    // 此前 `"${tags.join(', ')}"` 未双写内部 " → 标签含引号会破坏 CSV。
    escapeCsvCell((file.tags || []).join(', ')),
    escapeCsvCell(file.isFavorite ? '是' : '否'),
    // createdAt/updatedAt 为 Prisma Date 对象时，escapeCsvCell 会经 JSON.stringify
    // 产生带外层引号的串进而被双包，先 toISOString 预 coercion 为裸 ISO 字符串。
    escapeCsvCell(
      file.createdAt instanceof Date
        ? file.createdAt.toISOString()
        : file.createdAt ?? ''
    ),
    escapeCsvCell(
      file.updatedAt instanceof Date
        ? file.updatedAt.toISOString()
        : file.updatedAt ?? ''
    ),
  ]);

  return [headers.map(escapeCsvCell).join(','), ...rows.map(row => row.join(','))].join('\n');
}
