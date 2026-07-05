/**
 * analytics/analytics-manager AnalyticsManager 直接单测
 *
 * 覆盖目标：src/lib/analytics/analytics-manager.ts。该模块为数据分析单例管理器，提供
 * 基础统计 / 趋势分析 / 对比分析 / 相关性分析 / 异常检测 / 预测 / K-Means 聚类 /
 * 数据洞察 / 分析任务管理 9 大类能力。唯一运行时外部 import 为 statsUtils（来自
 * ../visualization/utils，纯 math，无外部依赖），直接真实调用，不 vi.mock。
 *
 * 历史背景：本模块此前零真实覆盖（grep `@/lib/analytics` 在 `src/__tests__` 下无任何
 * 命中）。模块以确定性数学 + 内存 Map 单例为主，适合直接断言锁定控制流。
 *
 * 关键控制流与边界：
 * - 单例：private constructor + static getInstance；模块导出 analyticsManager = getInstance()
 * - calculateBasicStatistics：空集全零 + mode=null；依赖 statsUtils 的 median/mode/stdDev/quantile
 *   （注意 statsUtils.mode 对全集等频数据返回首个值，非 null）
 * - analyzeTrend：长度不等 / n<2 早退；firstY===0 时 growthRate 强制归零（即便明显递增也判 stable）；
 *   ssTotal===0 时 rSquared=0；trend 阈值 |growthRate|>0.05
 * - analyzeComparison：differences/percentages 均相对 values[0]；values[0]===0 时 percentages 全 0；
 *   biggestChange 初值 ''，仅 |diff| 严格大于才更新；isSignificant 阈值 |changePercent|>0.1
 * - analyzeCorrelation：correlation 来自 statsUtils（长度不等返回 0）；strength 阈值
 *   0.2/0.4/0.7；direction 阈值 ±0.1；pValue 经 approximatePValue（正态近似）
 * - detectAnomalies：zscore std===0 早退；severity 阈值 threshold*1.5 / threshold*2；
 *   iqr 方法 expected 取越界边界（非均值），iqrRatio = deviation / iqr
 * - forecast：n<2 早退；置信度 0.95 - i*0.05 且 max(0.5, ...) 兜底；margin 在 stdDev=0 时
 *   回退 value*0.1；mape 对 y===0 项贡献 0
 * - cluster：Math.random 仅用于初始化洗牌（mock 0.5 使 sort 比较器恒 0 → 稳定不变序）；
 *   空簇保留旧质心（已修 bug：原代码将空簇质心置零向量）；actualK = min(k, data.length)；
 *   data.length<=1 时 silhouetteScore=0
 * - generateInsights：依赖 Date.now() 生成 id（fake timer 固定）；trend 洞察需 confidence>0.5；
 *   anomaly 洞察 severity 由 highSeverityCount 决定（>0→error 否则 warning）
 * - createTask：fire-and-forget executeTask，同步阶段已将 status 置 'running' / progress=10；
 *   executeTask 用 setTimeout(100)×2 推进；getTask/getReport 按 tenantId 隔离
 *
 * 状态策略：每个用例前 vi.resetModules() + await import 取全新单例（fresh tasks/reports Maps）；
 * 依赖 Date.now()/new Date() 的用例用 vi.useFakeTimers() + vi.setSystemTime(NOW) 固定时刻；
 * cluster 用例用 vi.spyOn(Math, 'random').mockReturnValue(0.5) 固定初始化顺序。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type {
  AnalysisConfig,
  AnalysisReport,
  AnalysisTask,
} from "@/lib/analytics/types";

// 基准时刻：2026-07-01 10:00:00 UTC
const NOW = new Date("2026-07-01T10:00:00Z");
const NOW_TS = NOW.getTime();

let AnalyticsManager: typeof import("@/lib/analytics/analytics-manager")["AnalyticsManager"];
let analyticsManager: import("@/lib/analytics/analytics-manager")["AnalyticsManager"];

beforeEach(async () => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.resetModules();
  const mod = await import("@/lib/analytics/analytics-manager");
  AnalyticsManager = mod.AnalyticsManager;
  analyticsManager = mod.analyticsManager;
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ==================== 单例 ====================

describe("单例", () => {
  it("getInstance 返回同一实例", () => {
    expect(AnalyticsManager.getInstance()).toBe(analyticsManager);
  });

  it("导出的 analyticsManager 是 getInstance 结果", () => {
    expect(analyticsManager).toBe(AnalyticsManager.getInstance());
  });
});

// ==================== calculateBasicStatistics ====================

describe("calculateBasicStatistics", () => {
  it("空数组返回全零统计 + mode=null", () => {
    const stats = analyticsManager.calculateBasicStatistics([]);
    expect(stats).toEqual({
      count: 0,
      sum: 0,
      mean: 0,
      median: 0,
      mode: null,
      stdDev: 0,
      variance: 0,
      min: 0,
      max: 0,
      range: 0,
      q1: 0,
      q3: 0,
      iqr: 0,
    });
  });

  it("单元素数组", () => {
    const stats = analyticsManager.calculateBasicStatistics([7]);
    expect(stats.count).toBe(1);
    expect(stats.sum).toBe(7);
    expect(stats.mean).toBe(7);
    expect(stats.median).toBe(7);
    expect(stats.mode).toBe(7);
    expect(stats.stdDev).toBe(0);
    expect(stats.variance).toBe(0);
    expect(stats.min).toBe(7);
    expect(stats.max).toBe(7);
    expect(stats.range).toBe(0);
    expect(stats.q1).toBe(7);
    expect(stats.q3).toBe(7);
    expect(stats.iqr).toBe(0);
  });

  it("[1,2,3,4,5] 全字段精确", () => {
    const stats = analyticsManager.calculateBasicStatistics([1, 2, 3, 4, 5]);
    expect(stats.count).toBe(5);
    expect(stats.sum).toBe(15);
    expect(stats.mean).toBe(3);
    expect(stats.median).toBe(3);
    // statsUtils.mode 等频时返回首个出现的值（1 先将 maxFreq 从 0 提到 1）
    expect(stats.mode).toBe(1);
    expect(stats.stdDev).toBeCloseTo(Math.sqrt(2), 10);
    expect(stats.variance).toBeCloseTo(2, 10);
    expect(stats.min).toBe(1);
    expect(stats.max).toBe(5);
    expect(stats.range).toBe(4);
    expect(stats.q1).toBe(2);
    expect(stats.q3).toBe(4);
    expect(stats.iqr).toBe(2);
  });

  it("[1,1,2,2,3] 众数取首个达最大频次者", () => {
    const stats = analyticsManager.calculateBasicStatistics([1, 1, 2, 2, 3]);
    expect(stats.mode).toBe(1);
    expect(stats.mean).toBe(1.8);
    expect(stats.median).toBe(2);
    expect(stats.q1).toBe(1);
    expect(stats.q3).toBe(2);
    expect(stats.iqr).toBe(1);
  });

  it("不改原数组", () => {
    const input = [5, 3, 1, 4, 2];
    const snapshot = [...input];
    analyticsManager.calculateBasicStatistics(input);
    expect(input).toEqual(snapshot);
  });
});

// ==================== analyzeTrend ====================

describe("analyzeTrend", () => {
  it("长度不等返回 stable 零值空点", () => {
    const result = analyticsManager.analyzeTrend([1, 2], [1]);
    expect(result).toEqual({
      trend: "stable",
      slope: 0,
      intercept: 0,
      rSquared: 0,
      growthRate: 0,
      confidence: 0,
      points: [],
    });
  });

  it("n<2 返回 stable 零值空点", () => {
    const result = analyticsManager.analyzeTrend([1], [1]);
    expect(result.trend).toBe("stable");
    expect(result.points).toEqual([]);
  });

  it("完美线性 y=2x+2", () => {
    const result = analyticsManager.analyzeTrend([0, 1, 2, 3], [2, 4, 6, 8]);
    expect(result.slope).toBe(2);
    expect(result.intercept).toBe(2);
    expect(result.rSquared).toBe(1);
    expect(result.growthRate).toBe(3);
    expect(result.trend).toBe("up");
    expect(result.confidence).toBe(1);
    expect(result.points).toHaveLength(4);
    expect(result.points[0]).toEqual({ x: 0, y: 2, predicted: 2 });
    expect(result.points[3]).toEqual({ x: 3, y: 8, predicted: 8 });
  });

  it("下降趋势 y=-2x+10", () => {
    const result = analyticsManager.analyzeTrend([0, 1, 2, 3], [10, 8, 6, 4]);
    expect(result.slope).toBe(-2);
    expect(result.intercept).toBe(10);
    expect(result.growthRate).toBe(-0.6);
    expect(result.trend).toBe("down");
  });

  it("常数数据 trend=stable + rSquared=0（ssTotal 守卫）", () => {
    const result = analyticsManager.analyzeTrend([0, 1, 2], [5, 5, 5]);
    expect(result.slope).toBe(0);
    expect(result.intercept).toBe(5);
    expect(result.rSquared).toBe(0);
    expect(result.growthRate).toBe(0);
    expect(result.trend).toBe("stable");
    expect(result.confidence).toBe(0);
    expect(result.points).toHaveLength(3);
    expect(result.points[1].predicted).toBe(5);
  });

  it("firstY=0 时 growthRate 强制归零（即便明显递增也判 stable）", () => {
    // y=[0,5,10] 明显递增，但 firstY===0 守卫使 growthRate=0 → |0|>0.05 false → stable
    const result = analyticsManager.analyzeTrend([0, 1, 2], [0, 5, 10]);
    expect(result.growthRate).toBe(0);
    expect(result.trend).toBe("stable");
    expect(result.slope).toBe(5);
    expect(result.intercept).toBe(0);
  });

  it("增长率恰为 0.05 时不判为趋势（边界严格大于）", () => {
    // growthRate = (lastY - firstY) / |firstY| = 0.05 → |0.05| > 0.05 false → stable
    const result = analyticsManager.analyzeTrend([0, 1], [100, 105]);
    expect(result.growthRate).toBe(0.05);
    expect(result.trend).toBe("stable");
  });
});

// ==================== analyzeComparison ====================

describe("analyzeComparison", () => {
  it("三组递增对比", () => {
    const result = analyticsManager.analyzeComparison(
      ["A", "B", "C"],
      { A: [10, 20], B: [20, 40], C: [30, 60] }
    );
    expect(result.metrics.value.values).toEqual([15, 30, 45]);
    expect(result.metrics.value.differences).toEqual([0, 15, 30]);
    expect(result.metrics.value.percentages).toEqual([0, 1, 2]);
    expect(result.metrics.value.isSignificant).toBe(true);
    expect(result.summary.biggestChange).toBe("C");
    expect(result.summary.changeDirection).toBe("up");
    expect(result.summary.changeAmount).toBe(30);
    expect(result.summary.changePercent).toBe(2);
  });

  it("空组按 0 计算", () => {
    const result = analyticsManager.analyzeComparison(
      ["A", "B"],
      { A: [10], B: [] }
    );
    expect(result.metrics.value.values).toEqual([10, 0]);
    expect(result.metrics.value.differences).toEqual([0, -10]);
    expect(result.metrics.value.percentages).toEqual([0, -1]);
    expect(result.summary.biggestChange).toBe("B");
    expect(result.summary.changeDirection).toBe("down");
    expect(result.summary.changeAmount).toBe(-10);
    expect(result.summary.changePercent).toBe(-1);
    expect(result.metrics.value.isSignificant).toBe(true);
  });

  it("values[0]=0 时 percentages 全 0（除零守卫）", () => {
    const result = analyticsManager.analyzeComparison(
      ["A", "B"],
      { A: [0, 0], B: [5, 5] }
    );
    expect(result.metrics.value.values).toEqual([0, 5]);
    expect(result.metrics.value.differences).toEqual([0, 5]);
    expect(result.metrics.value.percentages).toEqual([0, 0]);
    expect(result.summary.biggestChange).toBe("B");
    expect(result.summary.changeAmount).toBe(5);
    expect(result.summary.changePercent).toBe(0);
    expect(result.metrics.value.isSignificant).toBe(false);
  });

  it("所有组相等 → biggestChange 保持 ''（|0|>|0| false）", () => {
    const result = analyticsManager.analyzeComparison(
      ["A", "B"],
      { A: [5, 5], B: [5, 5] }
    );
    expect(result.metrics.value.values).toEqual([5, 5]);
    expect(result.metrics.value.differences).toEqual([0, 0]);
    expect(result.summary.biggestChange).toBe("");
    expect(result.summary.changeDirection).toBe("up"); // 初值
    expect(result.summary.changeAmount).toBe(0);
    expect(result.metrics.value.isSignificant).toBe(false);
  });
});

// ==================== analyzeCorrelation ====================

describe("analyzeCorrelation", () => {
  it("完美正相关", () => {
    const result = analyticsManager.analyzeCorrelation(
      [1, 2, 3, 4, 5],
      [2, 4, 6, 8, 10],
      ["x", "y"]
    );
    expect(result.correlation).toBe(1);
    expect(result.strength).toBe("strong");
    expect(result.direction).toBe("positive");
    expect(result.pValue).toBe(0);
    expect(result.isSignificant).toBe(true);
    expect(result.variables).toEqual(["x", "y"]);
  });

  it("完美负相关", () => {
    const result = analyticsManager.analyzeCorrelation(
      [1, 2, 3, 4, 5],
      [10, 8, 6, 4, 2],
      ["x", "y"]
    );
    expect(result.correlation).toBe(-1);
    expect(result.strength).toBe("strong");
    expect(result.direction).toBe("negative");
    expect(result.pValue).toBe(0);
    expect(result.isSignificant).toBe(true);
  });

  it("中等正相关 correlation=0.5", () => {
    // x=[1,2,3,4,5], y=[1,4,2,5,3] → correlation = 0.5
    const result = analyticsManager.analyzeCorrelation(
      [1, 2, 3, 4, 5],
      [1, 4, 2, 5, 3],
      ["x", "y"]
    );
    expect(result.correlation).toBeCloseTo(0.5, 10);
    expect(result.strength).toBe("moderate");
    expect(result.direction).toBe("positive");
  });

  it("弱负相关 correlation≈-0.316", () => {
    // x=[1,2,3,4,5], y=[3,1,2,3,1] → correlation ≈ -0.316
    const result = analyticsManager.analyzeCorrelation(
      [1, 2, 3, 4, 5],
      [3, 1, 2, 3, 1],
      ["x", "y"]
    );
    expect(result.correlation).toBeCloseTo(-0.3162, 3);
    expect(result.strength).toBe("weak");
    expect(result.direction).toBe("negative");
  });

  it("长度不等 → correlation=0 → strength=none / direction=none / 不显著", () => {
    const result = analyticsManager.analyzeCorrelation(
      [1, 2, 3],
      [1, 2],
      ["x", "y"]
    );
    expect(result.correlation).toBe(0);
    expect(result.strength).toBe("none");
    expect(result.direction).toBe("none");
    // normalCDF 多项式系数在 x=0 处浮点误差，pValue≈1.0000003（非精确 1）
    expect(result.pValue).toBeCloseTo(1, 5);
    expect(result.isSignificant).toBe(false);
  });
});

// ==================== detectAnomalies ====================

describe("detectAnomalies", () => {
  it("空数组", () => {
    const result = analyticsManager.detectAnomalies([]);
    expect(result.totalCount).toBe(0);
    expect(result.anomalyCount).toBe(0);
    expect(result.anomalies).toEqual([]);
    expect(result.threshold).toBe(3);
    expect(result.method).toBe("zscore");
  });

  it("zscore std=0 早退（常数列）", () => {
    const result = analyticsManager.detectAnomalies([5, 5, 5, 5]);
    expect(result.totalCount).toBe(4);
    expect(result.anomalyCount).toBe(0);
    expect(result.anomalies).toEqual([]);
  });

  it("zscore low 严重度（n=3, z≈1.414, threshold=1）", () => {
    const result = analyticsManager.detectAnomalies([10, 10, 100], 1);
    expect(result.anomalyCount).toBe(1);
    expect(result.anomalies[0].index).toBe(2);
    expect(result.anomalies[0].value).toBe(100);
    expect(result.anomalies[0].expected).toBe(40);
    expect(result.anomalies[0].deviation).toBe(60);
    expect(result.anomalies[0].severity).toBe("low");
    expect(result.anomalies[0].zScore).toBeCloseTo(Math.SQRT2, 10);
  });

  it("zscore medium 严重度（n=4, z≈1.732, threshold=1）", () => {
    const result = analyticsManager.detectAnomalies([10, 10, 10, 100], 1);
    expect(result.anomalyCount).toBe(1);
    expect(result.anomalies[0].severity).toBe("medium");
    expect(result.anomalies[0].zScore).toBeCloseTo(Math.sqrt(3), 10);
  });

  it("zscore high 严重度（n=6, z≈2.236, threshold=1）", () => {
    const result = analyticsManager.detectAnomalies([10, 10, 10, 10, 10, 100], 1);
    expect(result.anomalyCount).toBe(1);
    expect(result.anomalies[0].severity).toBe("high");
    expect(result.anomalies[0].zScore).toBeCloseTo(Math.sqrt(5), 10);
  });

  it("zscore 默认 threshold=3 需 n=11 才触发（z=√10≈3.162）", () => {
    const data = Array(10).fill(10).concat([100]);
    const result = analyticsManager.detectAnomalies(data);
    expect(result.anomalyCount).toBe(1);
    expect(result.anomalies[0].index).toBe(10);
    expect(result.anomalies[0].severity).toBe("low");
    expect(result.threshold).toBe(3);
  });

  it("iqr 方法检出高端异常（high 严重度）", () => {
    const data = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 100];
    const result = analyticsManager.detectAnomalies(data, 1.5, "iqr");
    expect(result.method).toBe("iqr");
    expect(result.threshold).toBe(1.5);
    expect(result.anomalyCount).toBe(1);
    expect(result.anomalies[0].index).toBe(10);
    expect(result.anomalies[0].value).toBe(100);
    // expected 取越界边界 upperBound = q3 + threshold*iqr = 8.5 + 1.5*5 = 16
    expect(result.anomalies[0].expected).toBe(16);
    expect(result.anomalies[0].deviation).toBe(84);
    expect(result.anomalies[0].severity).toBe("high");
    // iqr 分支不设置 zScore
    expect(result.anomalies[0].zScore).toBeUndefined();
  });

  it("iqr 无异常", () => {
    const result = analyticsManager.detectAnomalies([1, 2, 3, 4, 5], 1.5, "iqr");
    expect(result.anomalyCount).toBe(0);
    expect(result.totalCount).toBe(5);
  });
});

// ==================== forecast ====================

describe("forecast", () => {
  it("n<2 返回空预测 + 零准确度", () => {
    const result = analyticsManager.forecast([5], 3);
    expect(result.method).toBe("linear");
    expect(result.periods).toBe(3);
    expect(result.predictions).toEqual([]);
    expect(result.accuracy).toEqual({ mae: 0, mse: 0, rmse: 0, mape: 0 });
  });

  it("完美线性 [2,4,6,8] 预测 2 期", () => {
    const result = analyticsManager.forecast([2, 4, 6, 8], 2);
    expect(result.predictions).toHaveLength(2);
    expect(result.predictions[0].period).toBe(4);
    expect(result.predictions[0].value).toBe(10);
    expect(result.predictions[0].confidence).toBe(0.95);
    expect(result.predictions[1].period).toBe(5);
    expect(result.predictions[1].value).toBe(12);
    // 0.95 - 1*0.05 在 IEEE 754 浮点下 = 0.8999999999999999，非精确 0.9
    expect(result.predictions[1].confidence).toBeCloseTo(0.9, 10);
    // 完美拟合 → 准确度全 0
    expect(result.accuracy.mae).toBe(0);
    expect(result.accuracy.mse).toBe(0);
    expect(result.accuracy.rmse).toBe(0);
    expect(result.accuracy.mape).toBe(0);
  });

  it("置信区间含 stdDev*1.96 margin", () => {
    const result = analyticsManager.forecast([2, 4, 6, 8], 1);
    const pred = result.predictions[0];
    const stdDev = Math.sqrt(5); // statsUtils.population std
    const margin = stdDev * 1.96;
    expect(pred.lower).toBeCloseTo(10 - margin, 6);
    expect(pred.upper).toBeCloseTo(10 + margin, 6);
  });

  it("置信度兜底 0.5（periods 足够多时）", () => {
    const result = analyticsManager.forecast([1, 2, 3], 12);
    // i=10: 0.95-0.5=0.45 → max(0.5,0.45)=0.5
    expect(result.predictions[10].confidence).toBe(0.5);
    expect(result.predictions[11].confidence).toBe(0.5);
  });

  it("常数数据 stdDev=0 时 margin 回退 value*0.1", () => {
    const result = analyticsManager.forecast([5, 5, 5, 5], 1);
    expect(result.predictions[0].value).toBe(5);
    expect(result.predictions[0].lower).toBeCloseTo(4.5, 10);
    expect(result.predictions[0].upper).toBeCloseTo(5.5, 10);
    expect(result.accuracy.mae).toBe(0);
  });

  it("mape 对 y===0 项贡献 0（完美拟合）", () => {
    // y=2x，i=0 时 y=0；完美拟合 → mape=0
    const result = analyticsManager.forecast([0, 2, 4], 1);
    expect(result.accuracy.mape).toBe(0);
    expect(result.predictions[0].value).toBe(6);
  });
});

// ==================== cluster ====================

describe("cluster", () => {
  beforeEach(() => {
    // Math.random 仅用于初始化洗牌；mock 0.5 使比较器恒 0 → sort 稳定不变序
    vi.spyOn(Math, "random").mockReturnValue(0.5);
  });

  it("空数据", () => {
    const result = analyticsManager.cluster([], 3);
    expect(result.method).toBe("kmeans");
    expect(result.clusterCount).toBe(0);
    expect(result.clusters).toEqual([]);
    expect(result.silhouetteScore).toBe(0);
  });

  it("k<=0 返回空", () => {
    const result = analyticsManager.cluster([[1, 2]], 0);
    expect(result.clusterCount).toBe(0);
    expect(result.clusters).toEqual([]);
  });

  it("actualK 受 data.length 限制（k>length）", () => {
    const result = analyticsManager.cluster([[0, 0], [5, 5]], 5);
    expect(result.clusterCount).toBe(2);
    expect(result.clusters).toHaveLength(2);
  });

  it("单点 k=1 → silhouette=0（data.length<=1 守卫）", () => {
    const result = analyticsManager.cluster([[5, 5]], 1);
    expect(result.clusterCount).toBe(1);
    expect(result.clusters[0].size).toBe(1);
    expect(result.clusters[0].members).toEqual([0]);
    expect(result.clusters[0].center).toEqual([5, 5]);
    expect(result.silhouetteScore).toBe(0);
  });

  it("well-separated 两簇收敛到稳定划分", () => {
    const result = analyticsManager.cluster(
      [[0, 0], [0, 1], [10, 0], [10, 1]],
      2
    );
    expect(result.clusterCount).toBe(2);
    expect(result.clusters).toHaveLength(2);
    // 总成员数等于数据量
    const totalMembers = result.clusters.reduce((s, c) => s + c.size, 0);
    expect(totalMembers).toBe(4);
    // 收敛后 c0={members:[0,2],center:[5,0]}, c1={members:[1,3],center:[5,1]}
    const c0 = result.clusters.find((c) => c.id === 0)!;
    const c1 = result.clusters.find((c) => c.id === 1)!;
    expect(c0.members).toEqual([0, 2]);
    expect(c0.center).toEqual([5, 0]);
    expect(c1.members).toEqual([1, 3]);
    expect(c1.center).toEqual([5, 1]);
    expect(result.silhouetteScore).toBeGreaterThanOrEqual(-1);
    expect(result.silhouetteScore).toBeLessThanOrEqual(1);
  });

  it("空簇保留旧质心（回归：原代码将空簇质心置零向量）", () => {
    // data=[[0,0],[5,5],[5,5]], k=3, 洗牌不变序 → 初始质心 [[0,0],[5,5],[5,5]]
    // [0,0]→c0, [5,5]→c1, [5,5]→c1 → c2 空。
    // 修复前：空簇 c2 质心被重置为 [0,0]（fill(0) 残留）。
    // 修复后：空簇 c2 保留旧质心 [5,5]。
    const result = analyticsManager.cluster([[0, 0], [5, 5], [5, 5]], 3);
    expect(result.clusterCount).toBe(3);
    const c2 = result.clusters.find((c) => c.id === 2)!;
    expect(c2.size).toBe(0);
    expect(c2.members).toEqual([]);
    // 关键回归断言：空簇质心保留为旧值 [5,5]，而非被置零
    expect(c2.center).toEqual([5, 5]);
    // 完美聚类（c0 单点自成一簇，c1 两点重合）→ silhouette=1
    expect(result.silhouetteScore).toBe(1);
  });

  it("聚类名称格式为「聚类 N」", () => {
    const result = analyticsManager.cluster([[0, 0], [5, 5]], 2);
    expect(result.clusters[0].name).toBe("聚类 1");
    expect(result.clusters[1].name).toBe("聚类 2");
  });

  it("characteristics 包含 size 与 center", () => {
    const result = analyticsManager.cluster([[0, 0], [5, 5]], 2);
    const c = result.clusters[0];
    expect(c.characteristics.size).toBe(c.size);
    expect(c.characteristics.center).toEqual(c.center);
  });
});

// ==================== generateInsights ====================

describe("generateInsights", () => {
  it("空数据无洞察", () => {
    const insights = analyticsManager.generateInsights([], []);
    expect(insights).toEqual([]);
  });

  it("常数列仅生成 summary 洞察（无趋势 / 无异常）", () => {
    const insights = analyticsManager.generateInsights([5, 5, 5, 5], ["a", "b", "c", "d"]);
    expect(insights).toHaveLength(1);
    expect(insights[0].type).toBe("summary");
    expect(insights[0].severity).toBe("info");
    expect(insights[0].confidence).toBe(1);
    expect(insights[0].id).toBe(`insight_summary_${NOW_TS}`);
  });

  it("上升趋势生成 trend + summary 洞察", () => {
    const insights = analyticsManager.generateInsights([1, 2, 3, 4, 5], [
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    const trend = insights.find((i) => i.type === "trend");
    const summary = insights.find((i) => i.type === "summary");
    expect(trend).toBeDefined();
    expect(trend!.severity).toBe("success");
    expect(trend!.confidence).toBe(1);
    expect(trend!.id).toBe(`insight_trend_${NOW_TS}`);
    expect(trend!.suggestions).toHaveLength(1);
    expect(summary).toBeDefined();
  });

  it("异常生成 anomaly 洞察（无 high 时 severity=warning）", () => {
    // n=11, z=√10≈3.16 → 仅 low 严重度 → highSeverityCount=0 → warning
    const data = Array(10).fill(10).concat([100]);
    const insights = analyticsManager.generateInsights(data, data.map((_, i) => `p${i}`));
    const anomaly = insights.find((i) => i.type === "anomaly");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("warning");
    expect(anomaly!.confidence).toBe(0.9);
    expect(anomaly!.data.anomalyCount).toBe(1);
    expect(anomaly!.data.highSeverityCount).toBe(0);
    expect(anomaly!.suggestions).toHaveLength(3);
  });

  it("高度异常生成 anomaly 洞察（有 high 时 severity=error）", () => {
    // n=38, z=√37≈6.08 > threshold*2=6 → high 严重度 → error
    const data = Array(37).fill(10).concat([1000]);
    const insights = analyticsManager.generateInsights(data, data.map((_, i) => `p${i}`));
    const anomaly = insights.find((i) => i.type === "anomaly");
    expect(anomaly).toBeDefined();
    expect(anomaly!.severity).toBe("error");
    expect(anomaly!.data.highSeverityCount).toBe(1);
  });

  it("summary 洞察 data.statistics 与 calculateBasicStatistics 一致", () => {
    const insights = analyticsManager.generateInsights([1, 2, 3, 4, 5], [
      "a",
      "b",
      "c",
      "d",
      "e",
    ]);
    const summary = insights.find((i) => i.type === "summary")!;
    const stats = analyticsManager.calculateBasicStatistics([1, 2, 3, 4, 5]);
    expect(summary.data.statistics).toEqual(stats);
  });

  it("timestamp 为 new Date()（fake timer 固定）", () => {
    const insights = analyticsManager.generateInsights([5, 5, 5], ["a", "b", "c"]);
    expect(insights[0].timestamp).toEqual(NOW);
  });
});

// ==================== 任务管理 ====================

describe("createTask / getTask / getTasks / getReport", () => {
  it("createTask 同步阶段已置 running / progress=10，并写 startedAt", () => {
    const config: AnalysisConfig = {
      type: "statistics",
      dataSource: "test-source",
      parameters: { dim: "x" },
    };
    const task = analyticsManager.createTask(config, "My Task", "u1", "t1");
    // fire-and-forget executeTask 同步执行到首个 await，已将 status 置 running
    expect(task.id).toMatch(/^analysis_\d+_[a-z0-9]+$/);
    expect(task.name).toBe("My Task");
    expect(task.type).toBe("statistics");
    expect(task.dataSource).toBe("test-source");
    expect(task.parameters).toEqual({ dim: "x" });
    expect(task.status).toBe("running");
    expect(task.progress).toBe(10);
    expect(task.tenantId).toBe("t1");
    expect(task.createdBy).toBe("u1");
    expect(task.createdAt).toEqual(NOW);
    expect(task.startedAt).toEqual(NOW);
  });

  it("executeTask 完成后 task=completed / progress=100 / report 生成", async () => {
    const task = analyticsManager.createTask(
      { type: "trend", dataSource: "ds" },
      "T",
      "u1",
      "t1"
    );
    await vi.runAllTimersAsync();
    const completed = analyticsManager.getTask(task.id, "t1");
    expect(completed!.status).toBe("completed");
    expect(completed!.progress).toBe(100);
    // executeTask 用两个 setTimeout(100) 推进，fake timer 推进 200ms
    expect(completed!.completedAt).toEqual(new Date(NOW_TS + 200));
    expect(completed!.result).toBeDefined();
    const report = completed!.result!;
    expect(report.id).toMatch(/^report_\d+$/);
    expect(report.title).toBe("T");
    expect(report.type).toBe("trend");
    expect(report.dataSource).toBe("ds");
    expect(report.status).toBe("completed");
    expect(report.tenantId).toBe("t1");
    expect(report.createdBy).toBe("u1");
    expect(report.dimensions).toEqual([]);
    expect(report.metrics).toEqual([]);
    expect(report.insights).toEqual([]);
  });

  it("getTask 跨租户隔离返回 null", async () => {
    const task = analyticsManager.createTask(
      { type: "statistics", dataSource: "ds" },
      "T",
      "u1",
      "t1"
    );
    await vi.runAllTimersAsync();
    expect(analyticsManager.getTask(task.id, "t1")).not.toBeNull();
    expect(analyticsManager.getTask(task.id, "other")).toBeNull();
    expect(analyticsManager.getTask("nonexistent", "t1")).toBeNull();
  });

  it("getReport 跨租户隔离返回 null", async () => {
    const task = analyticsManager.createTask(
      { type: "statistics", dataSource: "ds" },
      "T",
      "u1",
      "t1"
    );
    await vi.runAllTimersAsync();
    const reportId = analyticsManager.getTask(task.id, "t1")!.result!.id;
    expect(analyticsManager.getReport(reportId, "t1")).not.toBeNull();
    expect(analyticsManager.getReport(reportId, "other")).toBeNull();
    expect(analyticsManager.getReport("nonexistent", "t1")).toBeNull();
  });

  it("getTasks 按租户过滤 + createdAt 降序 + limit", () => {
    // 不同时刻创建 3 个任务（t1 ×2, t2 ×1），不推进 timer 保持 running 态
    vi.setSystemTime(new Date(NOW_TS + 1000));
    analyticsManager.createTask(
      { type: "statistics", dataSource: "d1" },
      "Task1",
      "u1",
      "t1"
    );
    vi.setSystemTime(new Date(NOW_TS + 2000));
    analyticsManager.createTask(
      { type: "trend", dataSource: "d2" },
      "Task2",
      "u1",
      "t1"
    );
    vi.setSystemTime(new Date(NOW_TS + 3000));
    analyticsManager.createTask(
      { type: "anomaly", dataSource: "d3" },
      "Task3",
      "u2",
      "t2"
    );

    const t1Tasks = analyticsManager.getTasks("t1");
    expect(t1Tasks).toHaveLength(2);
    expect(t1Tasks[0].name).toBe("Task2"); // 降序：晚创建在前
    expect(t1Tasks[1].name).toBe("Task1");

    const t2Tasks = analyticsManager.getTasks("t2");
    expect(t2Tasks).toHaveLength(1);
    expect(t2Tasks[0].name).toBe("Task3");

    const limited = analyticsManager.getTasks("t1", 1);
    expect(limited).toHaveLength(1);
    expect(limited[0].name).toBe("Task2");

    // 不存在租户返回空数组
    expect(analyticsManager.getTasks("none")).toEqual([]);
  });
});

// ==================== 类型导出回归 ====================

describe("模块导出", () => {
  it("AnalysisTask / AnalysisReport 类型可被引用（编译期断言）", () => {
    const task: AnalysisTask = {
      id: "x",
      type: "statistics",
      name: "n",
      dataSource: "ds",
      parameters: {},
      status: "pending",
      progress: 0,
      createdAt: new Date(),
      tenantId: "t",
      createdBy: "u",
    };
    const report: AnalysisReport = {
      id: "r",
      title: "t",
      type: "statistics",
      dataSource: "ds",
      dimensions: [],
      metrics: [],
      parameters: {},
      results: {},
      insights: [],
      createdAt: new Date(),
      status: "completed",
      tenantId: "t",
      createdBy: "u",
    };
    expect(task).toBeDefined();
    expect(report).toBeDefined();
  });
});
