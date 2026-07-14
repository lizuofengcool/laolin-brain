import { PrismaClient } from '@prisma/client'
import path from 'path'
import fs from 'fs'

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Ensure the database directory exists.
 * For SQLite, Prisma needs the parent directory to exist before creating the database file.
 * This is critical for cloud function environments where the directory might not exist.
 */
function ensureDbDir(): void {
  const dbUrl = process.env.DATABASE_URL || 'file:./db/custom.db'
  // Extract file path from DATABASE_URL (format: "file:/path/to/db" or "file:./db/custom.db")
  const filePath = dbUrl.replace(/^file:/, '')
  const dbDir = path.dirname(filePath)
  if (dbDir && !fs.existsSync(dbDir)) {
    try {
      fs.mkdirSync(dbDir, { recursive: true })
    } catch {
      // Ignore mkdir errors (e.g., read-only filesystem in serverless)
    }
  }
}

ensureDbDir()

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query'] : [],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db

// 导出租户数据访问层（rawDb 已移除：无审计的原始客户端导出，需跨租户访问请用 TenantDb.raw）
export { TenantDb, createTenantDb } from './tenant-db';
export {
  getTenantIdFromRequest,
  getTenantIdOr401,
  getTenantDbFromRequest,
  getTenantIdFromUserId,
  getTenantDbFromUserId,
} from './tenant-context';
