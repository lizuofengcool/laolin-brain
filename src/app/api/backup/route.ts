import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { simpleHash, verifyChecksum } from "@/lib/checksum";
import { randomUUID } from "crypto";

const VALID_FILE_TYPES = ["image", "pdf", "word", "pptx", "markdown", "txt", "other"];

// ─── TypeScript types ───────────────────────────────────────────────

interface BackupFile {
  id: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  filePath: string | null;
  textContent: string | null;
  thumbnailUrl: string | null;
  folderId: string | null;
  tags: string;
  isFavorite: boolean;
  isDeleted: boolean;
  deletedAt: string | null;
  fileHash: string | null;
  summary: string | null;
  keyPoints: string;
  createdAt: string;
  updatedAt: string;
}

interface BackupFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface BackupExportData {
  files: BackupFile[];
  folders: BackupFolder[];
}

interface BackupExport {
  version: string;
  exportDate: string;
  user: { name: string; email: string };
  data: BackupExportData;
  checksum: string;
}

interface ImportRequestBody {
  data: BackupExportData;
  checksum?: string;
}

// ─── GET /api/backup — Export all user data as JSON ────────────────

export async function GET(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });
    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }
    const { tenantId } = tenantUser;

    // Fetch user info
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { name: true, email: true },
    });

    if (!user) {
      return NextResponse.json(
        { error: "用户不存在" },
        { status: 404 }
      );
    }

    // Fetch all files for this user (including soft-deleted, for complete backup)
    const files = await db.file.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: "asc" },
    });

    // Fetch all folders for this user
    const folders = await db.folder.findMany({
      where: { userId, tenantId },
      orderBy: { createdAt: "asc" },
    });

    // Build the export data (metadata only, no binary content)
    const data: BackupExportData = {
      files: files.map((f) => ({
        id: f.id,
        fileName: f.fileName,
        fileType: f.fileType,
        fileSize: f.fileSize,
        filePath: f.filePath,
        textContent: f.textContent,
        thumbnailUrl: f.thumbnailUrl,
        folderId: f.folderId,
        tags: f.tags,
        isFavorite: f.isFavorite,
        isDeleted: f.isDeleted,
        deletedAt: f.deletedAt?.toISOString() ?? null,
        fileHash: f.fileHash,
        summary: f.summary,
        keyPoints: f.keyPoints,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
      folders: folders.map((f) => ({
        id: f.id,
        name: f.name,
        parentId: f.parentId,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
    };

    const exportPayload: BackupExport = {
      version: "2.0",
      exportDate: new Date().toISOString(),
      user: { name: user.name, email: user.email },
      data,
      checksum: "", // computed below
    };

    // Compute checksum over the data portion only
    const dataJson = JSON.stringify(data);
    exportPayload.checksum = simpleHash(dataJson);

    return NextResponse.json(exportPayload);
  } catch (error) {
    console.error("Backup export failed:", error);
    return NextResponse.json(
      { error: "备份导出失败" },
      { status: 500 }
    );
  }
}

// ─── POST /api/backup — Import/restore data ───────────────────────

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    // 查询用户的租户
    const tenantUser = await db.tenantUser.findFirst({
      where: { userId },
      select: { tenantId: true },
    });
    if (!tenantUser) {
      return NextResponse.json(
        { error: "Tenant not found" },
        { status: 404 }
      );
    }
    const { tenantId } = tenantUser;

    // Parse request body
    let body: ImportRequestBody;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "请求体格式无效，需要有效的 JSON" },
        { status: 400 }
      );
    }

    if (!body.data || typeof body.data !== "object") {
      return NextResponse.json(
        { error: "缺少 data 字段或格式不正确" },
        { status: 400 }
      );
    }

    const { data } = body;

    // Validate data structure
    if (!Array.isArray(data.files) || !Array.isArray(data.folders)) {
      return NextResponse.json(
        { error: "data 中必须包含 files 和 folders 数组" },
        { status: 400 }
      );
    }

    // File/folder count limits to prevent abuse
    const MAX_IMPORT_FILES = 10000;
    if (data.files && data.files.length > MAX_IMPORT_FILES) {
      return NextResponse.json({ error: `备份数据文件数超过限制（最大 ${MAX_IMPORT_FILES}）` }, { status: 400 });
    }
    if (data.folders && data.folders.length > MAX_IMPORT_FILES) {
      return NextResponse.json({ error: `备份数据文件夹数超过限制（最大 ${MAX_IMPORT_FILES}）` }, { status: 400 });
    }

    // ── Checksum verification (mandatory) ──
    if (!body.checksum) {
      return NextResponse.json(
        { error: "缺少 checksum 字段，备份数据完整性校验为必填项" },
        { status: 400 }
      );
    }

    const isValid = verifyChecksum(data, body.checksum);
    if (!isValid) {
      return NextResponse.json(
        { error: "备份数据完整性校验失败，数据可能已被篡改" },
        { status: 400 }
      );
    }

    // ── Import within a Prisma transaction for safety ──
    const result = await db.$transaction(async (tx) => {
      let imported = 0;
      let skipped = 0;

      // 1. Insert folders with new IDs (prevent ID conflicts on re-import)
      const folderIdMap = new Map<string, string>();
      for (const folder of data.folders) {
        const newId = randomUUID();
        folderIdMap.set(folder.id, newId);

        // Also skip if the unique constraint [userId, name, parentId] would conflict
        const conflict = await tx.folder.findFirst({
          where: {
            userId,
            tenantId,
            name: folder.name,
            parentId: folder.parentId ? folderIdMap.get(folder.parentId) || null : null,
          },
        });

        if (conflict) {
          skipped++;
          continue;
        }

        await tx.folder.create({
          data: {
            id: newId,
            tenantId,
            userId,
            name: folder.name,
            parentId: folder.parentId ? folderIdMap.get(folder.parentId) || null : null,
            createdAt: new Date(folder.createdAt),
            updatedAt: new Date(folder.updatedAt),
          },
        });
        imported++;
      }

      // 2. Insert files with new IDs (prevent ID conflicts on re-import)
      for (const file of data.files) {
        const newId = randomUUID();

        await tx.file.create({
          data: {
            id: newId,
            tenantId,
            userId,
            fileName: file.fileName,
            fileType: VALID_FILE_TYPES.includes(file.fileType) ? file.fileType : 'other',
            fileSize: file.fileSize,
            filePath: file.filePath ?? null,
            textContent: typeof file.textContent === 'string' && file.textContent.length <= 1 * 1024 * 1024 ? file.textContent : null,
            thumbnailUrl: typeof file.thumbnailUrl === 'string' && file.thumbnailUrl.length <= 1024 ? file.thumbnailUrl : null,
            folderId: file.folderId ? folderIdMap.get(file.folderId) || null : null,
            tags: file.tags ?? "",
            isFavorite: file.isFavorite ?? false,
            isDeleted: file.isDeleted ?? false,
            deletedAt: file.deletedAt ? new Date(file.deletedAt) : null,
            fileHash: file.fileHash ?? null,
            summary: typeof file.summary === 'string' && file.summary.length <= 2000 ? file.summary : null,
            keyPoints: typeof file.keyPoints === 'string' && file.keyPoints.length <= 5000 ? file.keyPoints : "",
            createdAt: new Date(file.createdAt),
            updatedAt: new Date(file.updatedAt),
          },
        });
        imported++;
      }

      return { imported, skipped };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Backup import failed:", error);
    return NextResponse.json(
      { error: "备份导入失败" },
      { status: 500 }
    );
  }
}
