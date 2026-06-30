/**
 * ai-usage 内存版用量追踪直接单测
 *
 * 覆盖目标：src/lib/ai-usage.ts。该模块按用户维度统计每日 AI 调用次数，
 * 内存态（无任何 import），含以下关键控制流：
 * - checkAiUsage：原子性 check + increment（allowed = count < limit；allowed 时 count++）
 * - 限额边界：到达 limit 时 allowed=false 且不递增 count；remaining 永不为负（Math.max(0, ...)）
 * - 自定义 dailyLimit 覆盖默认 AI_DAILY_LIMIT（=200）
 * - resetTime = todayStart(UTC 零点) + 24h，跨 UTC 日边界计算
 * - getAiUsageStatus 只读：不递增 count；过期条目（entry.dayStart !== todayStart）视为 used=0
 * - 跨天重置：checkAiUsage 遇到 entry.dayStart !== todayStart 时重新初始化 count=0
 * - 跨用户隔离：usageStore 按 userId 键独立计数
 * - cleanupIfNeeded：每小时清理一次非当天条目（gate: now - lastCleanup < 1h 早返回）
 *
 * 状态策略：模块持有 module-level 的 usageStore（Map）与 lastCleanup。每个用例前
 * vi.resetModules() + await import() 重新求值模块，得到全新 usageStore/lastCleanup；
 * 配合 vi.useFakeTimers() + vi.setSystemTime() 固定 now，使 lastCleanup 初始化与
 * getTodayStart() 的 UTC 日期计算完全可断言。
 *
 * 注意：cleanupIfNeeded 的删除效果对外不可观察——过期条目无论是否被 cleanup 删除，
 * getAiUsageStatus 均返回 used=0、checkAiUsage 均重新初始化 count。故 cleanup 的删除
 * 行为通过"跨天重置"用例间接锁定，此处 cleanup 用例 exercise 路径确保不抛错与结果正确。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// 固定基准时刻：2026-07-01 10:00:00 UTC（对应 UTC 日 2026-07-01）
const NOW = new Date('2026-07-01T10:00:00Z');
// todayStart = Date.UTC(2026, 6, 1) = 2026-07-01T00:00:00Z
const TODAY_START = Date.UTC(2026, 6, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
// 次日零点 UTC（resetTime 基准）
const TOMORROW_START = TODAY_START + DAY_MS; // 2026-07-02T00:00:00Z

type CheckAiUsage = typeof import('@/lib/ai-usage').checkAiUsage;
type GetAiUsageStatus = typeof import('@/lib/ai-usage').getAiUsageStatus;

describe('ai-usage', () => {
  let checkAiUsage: CheckAiUsage;
  let getAiUsageStatus: GetAiUsageStatus;
  let AI_DAILY_LIMIT: number;

  beforeEach(async () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.resetModules();
    const mod = await import('@/lib/ai-usage');
    checkAiUsage = mod.checkAiUsage;
    getAiUsageStatus = mod.getAiUsageStatus;
    AI_DAILY_LIMIT = mod.AI_DAILY_LIMIT;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─── 常量导出 ──────────────────────────────────────────────

  describe('AI_DAILY_LIMIT 常量', () => {
    it('导出默认每日限额 200', () => {
      expect(AI_DAILY_LIMIT).toBe(200);
    });
  });

  // ─── checkAiUsage：基础递增与限额 ─────────────────────────

  describe('checkAiUsage 基础递增与限额', () => {
    it('首次调用：allowed=true、remaining=limit-1、resetTime=次日 UTC 零点', () => {
      const r = checkAiUsage('user-a');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(AI_DAILY_LIMIT - 1);
      expect(r.resetTime).toBe(TOMORROW_START);
    });

    it('连续调用递增 count、递减 remaining（5 次 → remaining=195）', () => {
      for (let i = 1; i <= 5; i++) {
        const r = checkAiUsage('user-a');
        expect(r.allowed).toBe(true);
        expect(r.remaining).toBe(AI_DAILY_LIMIT - i);
      }
      // 第 5 次后状态：used=5
      expect(getAiUsageStatus('user-a').used).toBe(5);
    });

    it('限额边界：到达 limit 的那次调用 allowed=true 并触达 remaining=0', () => {
      const limit = 3;
      // count: 0→1 (allowed, remaining=2)
      expect(checkAiUsage('user-a', limit)).toEqual({
        allowed: true,
        remaining: 2,
        resetTime: TOMORROW_START,
      });
      // count: 1→2 (allowed, remaining=1)
      expect(checkAiUsage('user-a', limit)).toEqual({
        allowed: true,
        remaining: 1,
        resetTime: TOMORROW_START,
      });
      // count: 2→3 (allowed，因 count(2) < limit(3)，remaining=0)
      expect(checkAiUsage('user-a', limit)).toEqual({
        allowed: true,
        remaining: 0,
        resetTime: TOMORROW_START,
      });
    });

    it('超限：count >= limit 时 allowed=false 且不递增 count、remaining=0', () => {
      const limit = 3;
      // 填满至 count=3
      for (let i = 0; i < limit; i++) checkAiUsage('user-a', limit);
      // 第 4 次：count(3) < limit(3) 为 false → allowed=false、count 不递增
      const r = checkAiUsage('user-a', limit);
      expect(r.allowed).toBe(false);
      expect(r.remaining).toBe(0);
      expect(getAiUsageStatus('user-a', limit).used).toBe(3);
      // 第 5 次仍 false、count 仍 3
      expect(checkAiUsage('user-a', limit).allowed).toBe(false);
      expect(getAiUsageStatus('user-a', limit).used).toBe(3);
    });

    it('remaining 永不为负（limit=1 时多次调用恒为 0）', () => {
      const r1 = checkAiUsage('user-a', 1);
      expect(r1.allowed).toBe(true);
      expect(r1.remaining).toBe(0);
      const r2 = checkAiUsage('user-a', 1);
      expect(r2.allowed).toBe(false);
      expect(r2.remaining).toBe(0); // Math.max(0, 1-1) = 0，非 -1
    });

    it('自定义 dailyLimit 覆盖默认 AI_DAILY_LIMIT（默认 200 下 limit=5 仍只在 5 次后拒绝）', () => {
      // 用自定义 limit=5，验证不依赖默认 200
      for (let i = 0; i < 5; i++) {
        expect(checkAiUsage('user-a', 5).allowed).toBe(true);
      }
      expect(checkAiUsage('user-a', 5).allowed).toBe(false);
      // 默认 limit 下同一 user 应仍受默认 200 约束（独立 limit 参数）
      expect(checkAiUsage('user-a').allowed).toBe(true);
    });
  });

  // ─── checkAiUsage：原子性 ─────────────────────────────────

  describe('checkAiUsage 原子性（allowed=false 不递增）', () => {
    it('填满后再次调用：count 不变、getAiUsageStatus 反映真实 used', () => {
      const limit = 2;
      checkAiUsage('user-a', limit); // count→1
      checkAiUsage('user-a', limit); // count→2
      // 超限调用：不应使 used 变成 3
      checkAiUsage('user-a', limit);
      checkAiUsage('user-a', limit);
      expect(getAiUsageStatus('user-a', limit).used).toBe(2);
    });
  });

  // ─── checkAiUsage：resetTime 计算（UTC 日边界） ───────────

  describe('checkAiUsage resetTime 计算（UTC 日边界）', () => {
    it('同一 UTC 日内任意时刻 resetTime 相同（次日 UTC 零点）', () => {
      vi.setSystemTime(new Date('2026-07-01T10:00:00Z'));
      expect(checkAiUsage('user-a').resetTime).toBe(TOMORROW_START);
      vi.setSystemTime(new Date('2026-07-01T23:59:59Z'));
      expect(checkAiUsage('user-b').resetTime).toBe(TOMORROW_START);
    });

    it('跨 UTC 日：00:01 UTC 的 resetTime 为后日 UTC 零点', () => {
      vi.setSystemTime(new Date('2026-07-02T00:01:00Z'));
      const day2Start = Date.UTC(2026, 6, 2); // 2026-07-02T00:00:00Z
      const expectedReset = day2Start + DAY_MS; // 2026-07-03T00:00:00Z
      expect(checkAiUsage('user-a').resetTime).toBe(expectedReset);
    });
  });

  // ─── getAiUsageStatus：只读 ───────────────────────────────

  describe('getAiUsageStatus 只读', () => {
    it('无条目：used=0、limit=AI_DAILY_LIMIT、remaining=limit', () => {
      expect(getAiUsageStatus('user-a')).toEqual({
        used: 0,
        limit: AI_DAILY_LIMIT,
        remaining: AI_DAILY_LIMIT,
      });
    });

    it('有条目：used=count、remaining=limit-count', () => {
      for (let i = 0; i < 3; i++) checkAiUsage('user-a');
      expect(getAiUsageStatus('user-a')).toEqual({
        used: 3,
        limit: AI_DAILY_LIMIT,
        remaining: AI_DAILY_LIMIT - 3,
      });
    });

    it('只读不递增：连续 getAiUsageStatus 不改变后续 checkAiUsage 的 count', () => {
      checkAiUsage('user-a'); // count→1
      // 连续只读查询多次
      getAiUsageStatus('user-a');
      getAiUsageStatus('user-a');
      // 下一次 checkAiUsage 应使 count→2（而非 3 或 4）
      const r = checkAiUsage('user-a');
      expect(r.remaining).toBe(AI_DAILY_LIMIT - 2);
      expect(getAiUsageStatus('user-a').used).toBe(2);
    });

    it('自定义 dailyLimit：limit 字段反映自定义值', () => {
      checkAiUsage('user-a', 50);
      checkAiUsage('user-a', 50);
      expect(getAiUsageStatus('user-a', 50)).toEqual({
        used: 2,
        limit: 50,
        remaining: 48,
      });
    });
  });

  // ─── getAiUsageStatus：过期条目（跨天） ───────────────────

  describe('getAiUsageStatus 过期条目（跨天）', () => {
    it('day1 累计后 day2 读取：used=0（entry.dayStart !== todayStart）', () => {
      // day1：累计 5 次
      for (let i = 0; i < 5; i++) checkAiUsage('user-a');
      expect(getAiUsageStatus('user-a').used).toBe(5);
      // 推进到 day2（同一 UTC 日内推进不影响；跨日才过期）
      vi.setSystemTime(new Date('2026-07-02T10:00:00Z'));
      // day2 读取：entry.dayStart=day1 !== todayStart=day2 → used=0
      expect(getAiUsageStatus('user-a')).toEqual({
        used: 0,
        limit: AI_DAILY_LIMIT,
        remaining: AI_DAILY_LIMIT,
      });
    });
  });

  // ─── checkAiUsage：跨天重置（重新初始化） ─────────────────

  describe('checkAiUsage 跨天重置（重新初始化）', () => {
    it('day1 累计后 day2 调用：count 重置为 1、resetTime=day2+24h', () => {
      // day1：累计 5 次
      for (let i = 0; i < 5; i++) checkAiUsage('user-a');
      expect(getAiUsageStatus('user-a').used).toBe(5);
      // 推进到 day2
      vi.setSystemTime(new Date('2026-07-02T10:00:00Z'));
      const day2Start = Date.UTC(2026, 6, 2);
      // day2 首次调用：entry.dayStart=day1 !== todayStart=day2 → 重新初始化 count=0，再递增为 1
      const r = checkAiUsage('user-a');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(AI_DAILY_LIMIT - 1);
      expect(r.resetTime).toBe(day2Start + DAY_MS); // 2026-07-03T00:00:00Z
      expect(getAiUsageStatus('user-a').used).toBe(1);
    });

    it('跨天后仍受当日限额约束（day1 耗尽不影响 day2 配额）', () => {
      const limit = 3;
      // day1 耗尽配额
      for (let i = 0; i < limit; i++) checkAiUsage('user-a', limit);
      expect(checkAiUsage('user-a', limit).allowed).toBe(false);
      // day2 应有全新配额
      vi.setSystemTime(new Date('2026-07-02T10:00:00Z'));
      expect(checkAiUsage('user-a', limit).allowed).toBe(true);
      expect(getAiUsageStatus('user-a', limit).used).toBe(1);
    });
  });

  // ─── 跨用户隔离 ──────────────────────────────────────────

  describe('跨用户隔离', () => {
    it('user-a 与 user-b 独立计数', () => {
      checkAiUsage('user-a');
      checkAiUsage('user-a');
      checkAiUsage('user-a');
      checkAiUsage('user-b');
      expect(getAiUsageStatus('user-a').used).toBe(3);
      expect(getAiUsageStatus('user-b').used).toBe(1);
      // user-b 不影响 user-a
      checkAiUsage('user-b');
      expect(getAiUsageStatus('user-a').used).toBe(3);
      expect(getAiUsageStatus('user-b').used).toBe(2);
    });

    it('一用户耗尽配额不影响另一用户', () => {
      const limit = 2;
      checkAiUsage('user-a', limit);
      checkAiUsage('user-a', limit);
      expect(checkAiUsage('user-a', limit).allowed).toBe(false);
      // user-b 仍可调用
      expect(checkAiUsage('user-b', limit).allowed).toBe(true);
    });
  });

  // ─── cleanupIfNeeded：清理节奏（路径 exercise） ───────────
  //
  // cleanupIfNeeded 删除非当天条目，但该删除对外不可观察（过期条目无论是否被删，
  // getAiUsageStatus 均 used=0、checkAiUsage 均重新初始化）。此处 exercise 两条
  // 路径（gate 早返回 / gate 通过）确保不抛错与结果正确；删除行为由"跨天重置"用例
  // 间接锁定（过期条目被当作新条目重新初始化）。

  describe('cleanupIfNeeded 清理节奏', () => {
    it('1 小时间隔内调用不抛错、结果正确（gate 早返回路径）', () => {
      // 模块加载时刻 lastCleanup=NOW（10:00）
      checkAiUsage('user-a'); // 触发 cleanupIfNeeded：now(10:00)-lastCleanup(10:00)=0 < 1h → 早返回
      // 推进 30 分钟（仍在 1 小时内）
      vi.setSystemTime(new Date('2026-07-01T10:30:00Z'));
      // 再次调用：gate 早返回，不抛错
      const r = getAiUsageStatus('user-a');
      expect(r.used).toBe(1);
      expect(() => checkAiUsage('user-a')).not.toThrow();
    });

    it('超过 1 小时调用不抛错、结果正确（gate 通过路径，无过期条目）', () => {
      checkAiUsage('user-a'); // 10:00
      // 推进 61 分钟（超过 1 小时阈值，仍同一天）
      vi.setSystemTime(new Date('2026-07-01T11:01:00Z'));
      // gate 通过：lastCleanup 更新，遍历无过期条目（同一天）→ 不删除
      const r = checkAiUsage('user-a');
      expect(r.allowed).toBe(true);
      expect(getAiUsageStatus('user-a').used).toBe(2);
    });

    it('超过 1 小时且有跨天过期条目：cleanup 后跨天重置仍生效（间接锁定删除路径）', () => {
      // day1 10:00 累计
      for (let i = 0; i < 5; i++) checkAiUsage('user-a');
      expect(getAiUsageStatus('user-a').used).toBe(5);
      // 推进到 day2 11:01（>1h 且跨天）：cleanup gate 通过，遍历删除 user-a 的过期条目
      vi.setSystemTime(new Date('2026-07-02T11:01:00Z'));
      // 删除后 checkAiUsage 重新初始化 count=0 → 1（与"跨天重置"用例一致，间接证明
      // 过期条目已不影响当日计数）
      const r = checkAiUsage('user-a');
      expect(r.allowed).toBe(true);
      expect(r.remaining).toBe(AI_DAILY_LIMIT - 1);
      expect(getAiUsageStatus('user-a').used).toBe(1);
    });

    it('cleanup 不删除当天条目（同日跨小时仍保留计数）', () => {
      checkAiUsage('user-a');
      checkAiUsage('user-a');
      // 推进 2 小时（同一天）：cleanup gate 通过但 entry.dayStart===todayStart → 不删除
      vi.setSystemTime(new Date('2026-07-01T12:00:00Z'));
      expect(getAiUsageStatus('user-a').used).toBe(2);
      checkAiUsage('user-a');
      expect(getAiUsageStatus('user-a').used).toBe(3);
    });
  });
});
