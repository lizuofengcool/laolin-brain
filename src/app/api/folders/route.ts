import { NextRequest, NextResponse } from "next/server";
import { createTenantDb } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // tenantId 由 authenticateRequest 已查证返回，直接复用，避免重复查 tenantUser
    const tenantDb = createTenantDb(tenantId);

    const body = await request.json();
    const { name, parentId } = body;

    if (!name) {
      return NextResponse.json(
        { error: "name is required" },
        { status: 400 }
      );
    }

    if (typeof name !== 'string') {
      return NextResponse.json(
        { error: "name 必须为字符串" },
        { status: 400 }
      );
    }

    // Name length validation
    if (name.length > 255) {
      return NextResponse.json(
        { error: "文件夹名称不能超过255个字符" },
        { status: 400 }
      );
    }

    // Validate parentId ownership if provided
    if (parentId !== null && parentId !== undefined) {
      if (typeof parentId !== 'string') {
        return NextResponse.json(
          { error: "parentId must be a string or null" },
          { status: 400 }
        );
      }
      // TenantDb 自动注入 tenantId 过滤，防止跨租户访问父文件夹
      const parentFolder = await tenantDb.folder.findFirst({ where: { id: parentId } });
      if (!parentFolder || parentFolder.userId !== userId) {
        return NextResponse.json(
          { error: "父文件夹不存在" },
          { status: 400 }
        );
      }
    }

    // 通过 TenantDb 创建，自动写入 tenantId 归属
    const folder = await tenantDb.folder.create({
      data: {
        userId,
        name,
        parentId: parentId || null,
      },
    });

    return NextResponse.json(folder);
  } catch {
    return NextResponse.json(
      { error: "Failed to create folder" },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId, tenantId, role } = auth;

  try {
    // TenantDb 自动注入 tenantId 过滤，防止跨租户列出他人目录
    const tenantDb = createTenantDb(tenantId);
    const folders = await tenantDb.folder.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
      take: 500,
    });

    return NextResponse.json(folders);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch folders" },
      { status: 500 }
    );
  }
}
