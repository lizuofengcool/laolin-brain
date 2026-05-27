import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateRequest } from "@/lib/api-auth";
import { resetAdapter } from "@/lib/storage/factory";

export async function PUT(request: NextRequest) {
  const auth = authenticateRequest(request);
  if (auth instanceof NextResponse) return auth;
  const { userId } = auth;

  try {
    const body = await request.json();
    let { storageMode } = body;

    if (!storageMode) {
      return NextResponse.json(
        { error: "storageMode is required" },
        { status: 400 }
      );
    }

    // Validate storageMode against allowed values
    const allowedModes = ["cloud", "local"];
    if (!allowedModes.includes(storageMode)) {
      return NextResponse.json(
        { error: "无效的存储模式" },
        { status: 400 }
      );
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { storageMode },
    });

    // Reset the cached storage adapter so the new mode takes effect
    resetAdapter();

    return NextResponse.json({
      id: user.id,
      name: user.name,
      email: user.email,
      storageMode: user.storageMode,
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    );
  }
}
