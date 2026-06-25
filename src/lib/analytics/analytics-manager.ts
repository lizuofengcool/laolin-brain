/**
 * 数据分析管理器
 * 负责执行各种数据分析任务
 */

import type {
  AnalysisType,
  BasicStatistics,
  TrendAnalysis,
  ComparisonResult,
  CorrelationResult,
  AnomalyResult,
  ForecastResult,
  ClusteringResult,
  DataInsight,
  AnalysisReport,
  AnalysisTask,
  AnalysisConfig,
} from './types';
import { statsUtils } from '../visualization';

export class AnalyticsManager {
  private static instance: AnalyticsManager;
  private tasks: Map<string, AnalysisTask> = new Map();
  private reports: Map<string, AnalysisReport> = new Map();

  private constructor() {}

  /**
   * 获取单例实例
   */
  public static getInstance(): AnalyticsManager {
    if (!AnalyticsManager.instance) {
      AnalyticsManager.instance = new AnalyticsManager();
    }
    return AnalyticsManager.instance;
  }

  // ==================== 基础统计分析 ====================

  /**
   * 计算基础统计信息
   */
  public calculateBasicStatistics(data: number[]): BasicStatistics {
    if (data.length === 0) {
      return {
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
      };
    }

    const sorted = [...data].sort((a, b) => a - b);
    const count = data.length;
    const sum = data.reduce((a, b) => a + b, 0);
    const mean = sum / count;
    const median = statsUtils.median(data);
    const mode = statsUtils.mode(data);
    const stdDev = statsUtils.standardDeviation(data);
    const variance = stdDev * stdDev;
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    const range = max - min;
    const q1 = statsUtils.quantile(data, 0.25);
    const q3 = statsUtils.quantile(data, 0.75);
    const iqr = q3 - q1;

    return {
      count,
      sum,
      mean,
      median,
      mode,
      stdDev,
      variance,
      min,
      max,
      range,
      q1,
      q3,
      iqr,
    };
  }

  // ==================== 趋势分析 ====================

  /**
   * 线性回归趋势分析
   */
  public analyzeTrend(xValues: number[], yValues: number[]): TrendAnalysis {
    if (xValues.length !== yValues.length || xValues.length < 2) {
      return {
        trend: 'stable',
        slope: 0,
        intercept: 0,
        rSquared: 0,
        growthRate: 0,
        confidence: 0,
        points: [],
      };
    }

    const n = xValues.length;
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((acc, x, i) => acc + x * yValues[i], 0);
    const sumX2 = xValues.reduce((acc, x) => acc + x * x, 0);
    const sumY2 = yValues.reduce((acc, y) => acc + y * y, 0);

    // 计算斜率和截距
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // 计算R平方（拟合优度）
    const meanY = sumY / n;
    const ssTotal = yValues.reduce((acc, y) => acc + (y - meanY) ** 2, 0);
    const ssResidual = yValues.reduce((acc, y, i) => {
      const predicted = slope * xValues[i] + intercept;
      return acc + (y - predicted) ** 2;
    }, 0);
    const rSquared = ssTotal === 0 ? 0 : 1 - ssResidual / ssTotal;

    // 计算增长率
    const firstY = yValues[0];
    const lastY = yValues[yValues.length - 1];
    const growthRate = firstY === 0 ? 0 : (lastY - firstY) / Math.abs(firstY);

    // 判断趋势
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (Math.abs(growthRate) > 0.05) {
      trend = growthRate > 0 ? 'up' : 'down';
    }

    // 生成预测点
    const points = xValues.map((x, i) => ({
      x,
      y: yValues[i],
      predicted: slope * x + intercept,
    }));

    // 置信度（基于R平方）
    const confidence = Math.max(0, Math.min(1, rSquared));

    return {
      trend,
      slope,
      intercept,
      rSquared,
      growthRate,
      confidence,
      points,
    };
  }

  // ==================== 对比分析 ====================

  /**
   * 对比分析
   */
  public analyzeComparison(
    groups: string[],
    data: Record<string, number[]>
  ): ComparisonResult {
    const metrics: ComparisonResult['metrics'] = {};
    let biggestChange = '';
    let changeDirection: 'up' | 'down' = 'up';
    let changeAmount = 0;
    let changePercent = 0;

    // 假设只有一个指标进行对比
    const metricName = 'value';
    const values = groups.map(g => {
      const groupData = data[g] || [];
      return groupData.length > 0 ? groupData.reduce((a, b) => a + b, 0) / groupData.length : 0;
    });

    const differences: number[] = [];
    const percentages: number[] = [];

    for (let i = 0; i < values.length; i++) {
      const diff = i === 0 ? 0 : values[i] - values[0];
      const pct = values[0] === 0 ? 0 : diff / Math.abs(values[0]);
      differences.push(diff);
      percentages.push(pct);

      if (Math.abs(diff) > Math.abs(changeAmount)) {
        changeAmount = diff;
        changePercent = pct;
        biggestChange = groups[i];
        changeDirection = diff > 0 ? 'up' : 'down';
      }
    }

    metrics[metricName] = {
      values,
      differences,
      percentages,
      isSignificant: Math.abs(changePercent) > 0.1,
    };

    return {
      groups,
      metrics,
      summary: {
        biggestChange,
        changeDirection,
        changeAmount,
        changePercent,
      },
    };
  }

  // ==================== 相关性分析 ====================

  /**
   * 相关性分析
   */
  public analyzeCorrelation(
    xValues: number[],
    yValues: number[],
    varNames: [string, string]
  ): CorrelationResult {
    const correlation = statsUtils.correlation(xValues, yValues);

    // 计算P值（简化版本）
    const n = xValues.length;
    const t = correlation * Math.sqrt((n - 2) / (1 - correlation * correlation));
    const pValue = this.approximatePValue(t, n - 2);

    // 判断相关性强度
    const absCorr = Math.abs(correlation);
    let strength: 'none' | 'weak' | 'moderate' | 'strong' = 'none';
    if (absCorr >= 0.7) strength = 'strong';
    else if (absCorr >= 0.4) strength = 'moderate';
    else if (absCorr >= 0.2) strength = 'weak';

    // 判断方向
    let direction: 'positive' | 'negative' | 'none' = 'none';
    if (correlation > 0.1) direction = 'positive';
    else if (correlation < -0.1) direction = 'negative';

    return {
      variables: varNames,
      correlation,
      pValue,
      isSignificant: pValue < 0.05,
      strength,
      direction,
    };
  }

  /**
   * 近似计算P值（简化的t分布近似）
   */
  private approximatePValue(t: number, df: number): number {
    // 简化的正态近似
    const z = Math.abs(t) * (1 - 1 / (4 * df));
    return 2 * (1 - this.normalCDF(z));
  }

  /**
   * 标准正态分布CDF
   */
  private normalCDF(x: number): number {
    const t = 1 / (1 + 0.2316419 * Math.abs(x));
    const d = 0.3989423 * Math.exp(-x * x / 2);
    const prob =
      d *
      t *
      (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
    return x > 0 ? 1 - prob : prob;
  }

  // ==================== 异常检测 ====================

  /**
   * 异常检测（Z-score方法）
   */
  public detectAnomalies(
    data: number[],
    threshold = 3,
    method: 'zscore' | 'iqr' = 'zscore'
  ): AnomalyResult {
    const anomalies: AnomalyResult['anomalies'] = [];

    if (data.length === 0) {
      return {
        totalCount: 0,
        anomalyCount: 0,
        anomalies: [],
        threshold,
        method,
      };
    }

    if (method === 'zscore') {
      const mean = data.reduce((a, b) => a + b, 0) / data.length;
      const std = statsUtils.standardDeviation(data);

      if (std === 0) {
        return {
          totalCount: data.length,
          anomalyCount: 0,
          anomalies: [],
          threshold,
          method,
        };
      }

      data.forEach((value, index) => {
        const zScore = (value - mean) / std;
        if (Math.abs(zScore) > threshold) {
          const deviation = Math.abs(value - mean);
          let severity: 'low' | 'medium' | 'high' = 'low';
          if (Math.abs(zScore) > threshold * 2) severity = 'high';
          else if (Math.abs(zScore) > threshold * 1.5) severity = 'medium';

          anomalies.push({
            index,
            value,
            expected: mean,
            deviation,
            severity,
            zScore,
          });
        }
      });
    } else if (method === 'iqr') {
      const stats = this.calculateBasicStatistics(data);
      const lowerBound = stats.q1 - threshold * stats.iqr;
      const upperBound = stats.q3 + threshold * stats.iqr;

      data.forEach((value, index) => {
        if (value < lowerBound || value > upperBound) {
          const expected = value < lowerBound ? lowerBound : upperBound;
          const deviation = Math.abs(value - expected);
          const iqrRatio = deviation / stats.iqr;
          let severity: 'low' | 'medium' | 'high' = 'low';
          if (iqrRatio > threshold * 2) severity = 'high';
          else if (iqrRatio > threshold * 1.5) severity = 'medium';

          anomalies.push({
            index,
            value,
            expected,
            deviation,
            severity,
          });
        }
      });
    }

    return {
      totalCount: data.length,
      anomalyCount: anomalies.length,
      anomalies,
      threshold,
      method,
    };
  }

  // ==================== 预测分析 ====================

  /**
   * 简单线性预测
   */
  public forecast(
    historicalData: number[],
    periods: number,
    method = 'linear'
  ): ForecastResult {
    const predictions: ForecastResult['predictions'] = [];
    const n = historicalData.length;

    if (n < 2) {
      return {
        method,
        periods,
        predictions: [],
        accuracy: {
          mae: 0,
          mse: 0,
          rmse: 0,
          mape: 0,
        },
      };
    }

    // 使用线性回归进行预测
    const xValues = Array.from({ length: n }, (_, i) => i);
    const trend = this.analyzeTrend(xValues, historicalData);

    // 计算历史数据的标准差用于置信区间
    const historicalStdDev = statsUtils.standardDeviation(historicalData);

    // 计算预测值
    for (let i = 0; i < periods; i++) {
      const period = n + i;
      const value = trend.slope * period + trend.intercept;
      const confidence = 0.95 - i * 0.05; // 置信度随时间递减
      const margin = historicalStdDev ? historicalStdDev * 1.96 : value * 0.1; // 95%置信区间

      predictions.push({
        period,
        value,
        lower: value - margin,
        upper: value + margin,
        confidence: Math.max(0.5, confidence),
      });
    }

    // 计算准确度（使用历史数据的拟合误差）
    const errors = historicalData.map((y, i) => {
      const predicted = trend.slope * i + trend.intercept;
      return y - predicted;
    });

    const mae = errors.reduce((a, b) => a + Math.abs(b), 0) / n;
    const mse = errors.reduce((a, b) => a + b * b, 0) / n;
    const rmse = Math.sqrt(mse);
    const mape =
      historicalData.reduce((acc, y, i) => {
        const predicted = trend.slope * i + trend.intercept;
        return acc + (y === 0 ? 0 : Math.abs((y - predicted) / y));
      }, 0) / n;

    return {
      method,
      periods,
      predictions,
      accuracy: {
        mae,
        mse,
        rmse,
        mape,
      },
    };
  }

  // ==================== 聚类分析 ====================

  /**
   * K-Means聚类（简化版）
   */
  public cluster(data: number[][], k: number): ClusteringResult {
    if (data.length === 0 || k <= 0) {
      return {
        method: 'kmeans',
        clusterCount: 0,
        clusters: [],
        silhouetteScore: 0,
      };
    }

    const dimensions = data[0].length;
    const actualK = Math.min(k, data.length);

    // 初始化质心（随机选择k个点）
    const shuffled = [...data].sort(() => Math.random() - 0.5);
    let centroids = shuffled.slice(0, actualK).map(p => [...p]);

    // 迭代
    const maxIterations = 100;
    let assignments: number[] = new Array(data.length).fill(0);

    for (let iter = 0; iter < maxIterations; iter++) {
      // 分配每个点到最近的质心
      let changed = false;
      for (let i = 0; i < data.length; i++) {
        let minDist = Infinity;
        let closest = 0;

        for (let j = 0; j < actualK; j++) {
          const dist = this.euclideanDistance(data[i], centroids[j]);
          if (dist < minDist) {
            minDist = dist;
            closest = j;
          }
        }

        if (assignments[i] !== closest) {
          assignments[i] = closest;
          changed = true;
        }
      }

      if (!changed) break;

      // 更新质心
      const newCentroids: number[][] = Array.from({ length: actualK }, () =>
        new Array(dimensions).fill(0)
      );
      const counts: number[] = new Array(actualK).fill(0);

      for (let i = 0; i < data.length; i++) {
        const cluster = assignments[i];
        counts[cluster]++;
        for (let d = 0; d < dimensions; d++) {
          newCentroids[cluster][d] += data[i][d];
        }
      }

      for (let j = 0; j < actualK; j++) {
        if (counts[j] > 0) {
          for (let d = 0; d < dimensions; d++) {
            newCentroids[j][d] /= counts[j];
          }
        }
      }

      centroids = newCentroids;
    }

    // 构建聚类结果
    const clusters: ClusteringResult['clusters'] = [];
    for (let j = 0; j < actualK; j++) {
      const members = assignments
        .map((a, i) => (a === j ? i : -1))
        .filter(i => i >= 0);

      clusters.push({
        id: j,
        name: `聚类 ${j + 1}`,
        size: members.length,
        center: centroids[j],
        members,
        characteristics: {
          size: members.length,
          center: centroids[j],
        },
      });
    }

    // 计算轮廓系数（简化版）
    const silhouetteScore = this.calculateSilhouetteScore(data, assignments, actualK);

    return {
      method: 'kmeans',
      clusterCount: actualK,
      clusters,
      silhouetteScore,
    };
  }

  /**
   * 欧几里得距离
   */
  private euclideanDistance(a: number[], b: number[]): number {
    let sum = 0;
    for (let i = 0; i < a.length; i++) {
      sum += (a[i] - b[i]) ** 2;
    }
    return Math.sqrt(sum);
  }

  /**
   * 计算轮廓系数（简化版）
   */
  private calculateSilhouetteScore(
    data: number[][],
    assignments: number[],
    k: number
  ): number {
    if (data.length <= 1) return 0;

    let totalScore = 0;
    let count = 0;

    for (let i = 0; i < data.length; i++) {
      const cluster = assignments[i];

      // 计算a(i)：同簇内平均距离
      let aSum = 0;
      let aCount = 0;
      for (let j = 0; j < data.length; j++) {
        if (i !== j && assignments[j] === cluster) {
          aSum += this.euclideanDistance(data[i], data[j]);
          aCount++;
        }
      }
      const a = aCount > 0 ? aSum / aCount : 0;

      // 计算b(i)：到最近其他簇的平均距离
      let minB = Infinity;
      for (let c = 0; c < k; c++) {
        if (c === cluster) continue;

        let bSum = 0;
        let bCount = 0;
        for (let j = 0; j < data.length; j++) {
          if (assignments[j] === c) {
            bSum += this.euclideanDistance(data[i], data[j]);
            bCount++;
          }
        }
        if (bCount > 0) {
          const bAvg = bSum / bCount;
          if (bAvg < minB) {
            minB = bAvg;
          }
        }
      }

      const b = minB === Infinity ? 0 : minB;
      const maxAB = Math.max(a, b);
      const s = maxAB === 0 ? 0 : (b - a) / maxAB;

      totalScore += s;
      count++;
    }

    return count > 0 ? totalScore / count : 0;
  }

  // ==================== 数据洞察生成 ====================

  /**
   * 自动生成数据洞察
   */
  public generateInsights(
    data: number[],
    labels: string[]
  ): DataInsight[] {
    const insights: DataInsight[] = [];
    const stats = this.calculateBasicStatistics(data);
    const anomalies = this.detectAnomalies(data);

    // 趋势洞察
    if (data.length >= 2) {
      const xValues = Array.from({ length: data.length }, (_, i) => i);
      const trend = this.analyzeTrend(xValues, data);

      if (trend.trend !== 'stable' && trend.confidence > 0.5) {
        insights.push({
          id: `insight_trend_${Date.now()}`,
          type: 'trend',
          title: trend.trend === 'up' ? '数据呈上升趋势' : '数据呈下降趋势',
          description: `数据整体呈${trend.trend === 'up' ? '上升' : '下降'}趋势，增长率约为${(trend.growthRate * 100).toFixed(1)}%，拟合优度为${(trend.rSquared * 100).toFixed(1)}%。`,
          severity: trend.trend === 'up' ? 'success' : 'warning',
          confidence: trend.confidence,
          data: {
            trend: trend.trend,
            growthRate: trend.growthRate,
            rSquared: trend.rSquared,
          },
          suggestions: [
            trend.trend === 'up'
              ? '持续关注增长趋势，分析增长原因'
              : '关注下降原因，及时采取措施',
          ],
          timestamp: new Date(),
        });
      }
    }

    // 异常洞察
    if (anomalies.anomalyCount > 0) {
      const highSeverity = anomalies.anomalies.filter(a => a.severity === 'high').length;

      insights.push({
        id: `insight_anomaly_${Date.now()}`,
        type: 'anomaly',
        title: `检测到 ${anomalies.anomalyCount} 个异常值`,
        description: `在数据中检测到 ${anomalies.anomalyCount} 个异常值，其中 ${highSeverity} 个为高度异常。建议检查这些数据点是否正确。`,
        severity: highSeverity > 0 ? 'error' : 'warning',
        confidence: 0.9,
        data: {
          anomalyCount: anomalies.anomalyCount,
          highSeverityCount: highSeverity,
          anomalies: anomalies.anomalies.slice(0, 5),
        },
        suggestions: [
          '检查数据采集是否正确',
          '确认这些异常值是否为真实数据',
          '考虑是否需要剔除异常值',
        ],
        timestamp: new Date(),
      });
    }

    // 分布洞察
    if (stats.count > 0) {
      insights.push({
        id: `insight_summary_${Date.now()}`,
        type: 'summary',
        title: '数据统计摘要',
        description: `共 ${stats.count} 条数据，平均值为 ${stats.mean.toFixed(2)}，中位数为 ${stats.median.toFixed(2)}，标准差为 ${stats.stdDev.toFixed(2)}。数据范围从 ${stats.min.toFixed(2)} 到 ${stats.max.toFixed(2)}。`,
        severity: 'info',
        confidence: 1,
        data: {
          statistics: stats,
        },
        timestamp: new Date(),
      });
    }

    return insights;
  }

  // ==================== 分析任务管理 ====================

  /**
   * 创建分析任务
   */
  public createTask(
    config: AnalysisConfig,
    name: string,
    userId: string,
    tenantId: string
  ): AnalysisTask {
    const task: AnalysisTask = {
      id: `analysis_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: config.type,
      name,
      dataSource: config.dataSource,
      parameters: config.parameters || {},
      status: 'pending',
      progress: 0,
      createdAt: new Date(),
      tenantId,
      createdBy: userId,
    };

    this.tasks.set(task.id, task);

    // 异步执行分析
    this.executeTask(task.id).catch(console.error);

    return task;
  }

  /**
   * 执行分析任务
   */
  private async executeTask(taskId: string): Promise<void> {
    const task = this.tasks.get(taskId);
    if (!task) return;

    try {
      task.status = 'running';
      task.startedAt = new Date();
      task.progress = 10;

      // 模拟分析过程
      await new Promise(resolve => setTimeout(resolve, 100));
      task.progress = 50;

      await new Promise(resolve => setTimeout(resolve, 100));
      task.progress = 90;

      // 生成分析报告
      const report: AnalysisReport = {
        id: `report_${Date.now()}`,
        title: task.name,
        type: task.type,
        dataSource: task.dataSource,
        dimensions: [],
        metrics: [],
        parameters: task.parameters,
        results: {},
        insights: [],
        createdAt: new Date(),
        completedAt: new Date(),
        status: 'completed',
        tenantId: task.tenantId,
        createdBy: task.createdBy,
      };

      this.reports.set(report.id, report);
      task.result = report;
      task.status = 'completed';
      task.progress = 100;
      task.completedAt = new Date();
    } catch (error) {
      task.status = 'failed';
      task.error = (error as Error).message;
      task.completedAt = new Date();
    }
  }

  /**
   * 获取分析任务
   */
  public getTask(taskId: string, tenantId: string): AnalysisTask | null {
    const task = this.tasks.get(taskId);
    if (!task || task.tenantId !== tenantId) return null;
    return task;
  }

  /**
   * 获取分析任务列表
   */
  public getTasks(tenantId: string, limit = 20): AnalysisTask[] {
    return Array.from(this.tasks.values())
      .filter(t => t.tenantId === tenantId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit);
  }

  /**
   * 获取分析报告
   */
  public getReport(reportId: string, tenantId: string): AnalysisReport | null {
    const report = this.reports.get(reportId);
    if (!report || report.tenantId !== tenantId) return null;
    return report;
  }
}

// 导出单例实例
export const analyticsManager = AnalyticsManager.getInstance();
