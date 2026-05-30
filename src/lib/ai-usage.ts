/**
 * AI 调用用量追踪（内存版）
 * 按用户维度统计每日 AI 调用次数，防止滥用
 * - 每用户每日限额可配置（默认 200 次）
 * - 自动清理过期条目，防止内存泄漏
 * - 每 60 分钟执行一次全量清理
 */

/** 每用户每日 AI 调用上限 */
export const AI_DAILY_LIMIT = 200;

/** 单条用量记录 */
interface AiUsageEntry {
  count: number;
  /** 当天零点的 UTC 毫秒时间戳，用于判断是否跨天重置 */
  dayStart: number;
}

// userId → 用量记录
const usageStore = new Map<string, AiUsageEntry>();

/** 上次清理时间 */
let lastCleanup = Date.now();

/** 清理间隔：每小时 */
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * 获取今天零点的时间戳（本地时区无关，使用 UTC 日期）
 */
function getTodayStart(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

/**
 * 清理过期条目（调用间隔超过 1 小时时触发）
 */
function cleanupIfNeeded(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;

  const todayStart = getTodayStart();
  for (const [key, entry] of usageStore.entries()) {
    // 清除非当天的条目
    if (entry.dayStart !== todayStart) {
      usageStore.delete(key);
    }
  }
}

/**
 * 检查 AI 用量并原子性递增计数
 * @returns { allowed, remaining, resetTime } — resetTime 为下次重置的 UTC 毫秒
 */
export function checkAiUsage(
  userId: string,
  dailyLimit: number = AI_DAILY_LIMIT,
): { allowed: boolean; remaining: number; resetTime: number } {
  cleanupIfNeeded();

  const todayStart = getTodayStart();
  let entry = usageStore.get(userId);

  // 如果条目不存在或已过期（跨天），重新初始化
  if (!entry || entry.dayStart !== todayStart) {
    entry = { count: 0, dayStart: todayStart };
    usageStore.set(userId, entry);
  }

  const allowed = entry.count < dailyLimit;
  if (allowed) {
    entry.count++;
  }

  // 重置时间：今天结束（即明天零点 UTC）
  const resetTime = todayStart + 24 * 60 * 60 * 1000;

  return {
    allowed,
    remaining: Math.max(0, dailyLimit - entry.count),
    resetTime,
  };
}

/**
 * 获取当前用量状态（只读，不递增计数）
 */
export function getAiUsageStatus(
  userId: string,
  dailyLimit: number = AI_DAILY_LIMIT,
): { used: number; limit: number; remaining: number } {
  cleanupIfNeeded();

  const todayStart = getTodayStart();
  const entry = usageStore.get(userId);

  const used = entry?.dayStart === todayStart ? entry.count : 0;

  return {
    used,
    limit: dailyLimit,
    remaining: Math.max(0, dailyLimit - used),
  };
}
