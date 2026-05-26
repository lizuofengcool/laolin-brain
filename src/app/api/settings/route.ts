import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { userId, storageMode } = body;

    if (!userId || !storageMode) {
      return NextResponse.json(
        { error: "userId and storageMode are required" },
        { status: 400 }
      );
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { storageMode },
    });

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
