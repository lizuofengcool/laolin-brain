import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get("q") || "";
    const userId = searchParams.get("userId");

    if (!userId || !q) {
      return NextResponse.json([]);
    }

    const files = await db.file.findMany({
      where: {
        userId,
        storageMode: "cloud",
        OR: [
          { fileName: { contains: q } },
          { textContent: { contains: q } },
          { tags: { contains: q } },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return NextResponse.json(
      files.map((f) => ({
        ...f,
        tags: JSON.parse(f.tags || "[]"),
      }))
    );
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}
