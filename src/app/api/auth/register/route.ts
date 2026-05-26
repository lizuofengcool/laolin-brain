import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// Simple hash function for passwords
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password, name } = body;

    if (!email || !password || !name) {
      return NextResponse.json(
        { error: "All fields are required" },
        { status: 400 }
      );
    }

    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { error: "Email already exists" },
        { status: 409 }
      );
    }

    const user = await db.user.create({
      data: {
        email,
        name,
        password: simpleHash(password),
      },
    });

    // Simple token
    const token = Buffer.from(`${user.id}:${user.email}`).toString("base64");

    return NextResponse.json({
      user: { id: user.id, name: user.name, email: user.email, storageMode: user.storageMode },
      token,
    });
  } catch {
    return NextResponse.json(
      { error: "Registration failed" },
      { status: 500 }
    );
  }
}
