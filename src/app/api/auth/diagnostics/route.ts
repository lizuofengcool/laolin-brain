import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  // 诊断端点会暴露 DATABASE_URL/TOKEN_SECRET 是否配置、cwd、Prisma 客户端文件清单等
  // 侦察价值高的信息，必须限平台管理员访问（未配置 ADMIN_EMAILS 时 fail-closed）
  const auth = await requirePlatformAdmin(request);
  if (auth instanceof NextResponse) return auth;

  const diagnostics: Record<string, unknown> = {};

  // 1. Test database connection
  try {
    const { db } = await import("@/lib/db");
    await db.$connect();
    diagnostics.db = "connected";

    // Check if User table exists by counting
    try {
      const userCount = await db.user.count();
      diagnostics.userCount = userCount;
    } catch (e) {
      diagnostics.userTableError = e instanceof Error ? e.message : String(e);
    }

    await db.$disconnect();
  } catch (e) {
    diagnostics.dbError = e instanceof Error ? e.message : String(e);
    diagnostics.dbErrorStack = e instanceof Error ? e.stack : undefined;
  }

  // 2. Test bcryptjs
  try {
    const bcrypt = await import("bcryptjs");
    const hash = await bcrypt.hash("test", 4);
    const valid = await bcrypt.compare("test", hash);
    diagnostics.bcryptjs = valid ? "working" : "compare failed";
  } catch (e) {
    diagnostics.bcryptjsError = e instanceof Error ? e.message : String(e);
  }

  // 3. Check environment
  diagnostics.databaseUrl = process.env.DATABASE_URL || "not set";
  diagnostics.tokenSecret = process.env.TOKEN_SECRET ? "set" : "not set";
  diagnostics.nodeEnv = process.env.NODE_ENV;
  diagnostics.cwd = process.cwd();

  // 4. Check Prisma client files
  try {
    const fs = await import("fs");
    const path = await import("path");
    const prismaClientPath = path.join(process.cwd(), "node_modules", ".prisma", "client");
    diagnostics.prismaClientDir = fs.existsSync(prismaClientPath) ? "exists" : "missing";

    if (fs.existsSync(prismaClientPath)) {
      const files = fs.readdirSync(prismaClientPath);
      diagnostics.prismaClientFiles = files;
    }

    // Check schema.prisma
    const schemaPath = path.join(process.cwd(), "prisma", "schema.prisma");
    diagnostics.schemaPrisma = fs.existsSync(schemaPath) ? "exists" : "missing";

    // Check db directory
    const dbPath = path.join(process.cwd(), "db");
    diagnostics.dbDir = fs.existsSync(dbPath) ? "exists" : "missing";
  } catch (e) {
    diagnostics.fsError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json(diagnostics, { status: 200 });
}
