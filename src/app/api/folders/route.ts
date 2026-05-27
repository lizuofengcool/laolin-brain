import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";

export async function POST(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
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

    const folder = await db.folder.create({
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
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const folders = await db.folder.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });

    return NextResponse.json(folders);
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch folders" },
      { status: 500 }
    );
  }
}
