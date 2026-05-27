import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { hashPassword, generateToken } from "@/lib/auth";

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

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { error: "邮箱格式不正确" },
        { status: 400 }
      );
    }

    // Password strength validation: minimum 8 chars, at least one letter and one number
    if (password.length < 8) {
      return NextResponse.json(
        { error: "密码至少需要8个字符" },
        { status: 400 }
      );
    }
    if (!/[a-zA-Z]/.test(password)) {
      return NextResponse.json(
        { error: "密码至少需要包含一个字母" },
        { status: 400 }
      );
    }
    if (!/[0-9]/.test(password)) {
      return NextResponse.json(
        { error: "密码至少需要包含一个数字" },
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

    const hashedPassword = await hashPassword(password);

    const user = await db.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
    });

    // Generate secure token
    const token = generateToken({ id: user.id, email: user.email });

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
