import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import os from 'os';

/**
 * 系统健康检查API
 * GET /api/health - 系统健康状态
 * GET /api/health/system - 系统信息
 * GET /api/health/stats - 统计指标
 */

// 记录启动时间
const startTime = new Date();

// ─── GET /api/health — 系统健康状态 ─────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'basic';

    let result: any = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };

    if (type === 'full' || type === 'detailed') {
      // 检查数据库连接
      try {
        await db.$queryRaw`SELECT 1`;
        result.database = { status: 'healthy' };
      } catch (dbError) {
        result.database = { status: 'unhealthy', error: String(dbError) };
        result.status = 'degraded';
      }

      // 系统信息
      result.system = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        nodeVersion: process.version,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        memoryUsage: process.memoryUsage(),
        cpuCount: os.cpus().length,
        loadAvg: os.loadavg(),
        uptime: os.uptime(),
      };

      // 运行时间
      result.appUptime = Date.now() - startTime.getTime();
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      {
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: String(error),
      },
      { status: 503 }
    );
  }
}
