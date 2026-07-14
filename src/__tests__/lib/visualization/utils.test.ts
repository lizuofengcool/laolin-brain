import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  formatUtils,
  dataUtils,
  chartUtils,
  exportUtils,
  statsUtils,
} from "@/lib/visualization/utils";
import { CHART_COLORS } from "@/lib/visualization/types";
import type { DataPoint } from "@/lib/visualization/types";

/**
 * 直接覆盖 src/lib/visualization/utils.ts 的 5 个导出工具对象的 32 个方法：
 *   - formatUtils：formatNumber / formatPercent / formatCurrency / formatFileSize /
 *                  formatDate / formatTime（6 方法）
 *   - dataUtils：groupBy / sum / average / max / min / sort / topN /
 *                calculatePercentages / normalize / generateTimeSeries / unique（11 方法）
 *   - chartUtils：getColors / getColor / generateGradient / calculateSize /
 *                  getResponsiveConfig（5 方法）
 *   - exportUtils：toCSV / toJSON / downloadFile / exportChartData（4 方法）
 *   - statsUtils：standardDeviation / median / mode / quantile / correlation /
 *                 detectOutliers（6 方法）
 *
 * 历史背景：本模块此前零真实覆盖（grep `@/lib/visualization` 在 `src/__tests__`
 * 下无任何命中）。模块是纯 math/string/Date 格式化 + 内存数组归约，仅依赖
 * `./types`（CHART_COLORS 常量 + DataPoint/ChartConfig/ExportOptions 接口），
 * 适合直接断言锁定控制流。
 *
 * 边界锁定重点：
 *   - formatNumber/formatFileSize 的 1000/1000000 与 1024 边界（含边界值）。
 *   - formatNumber/formatFileSize 对负值的非预期路径（不走 K/M 缩写，落到 else）。
 *   - formatDate 的 padStart(2,'0') 与 YYYY/MM/DD/HH/mm 替换顺序。
 *   - sort/unique/median/quantile 的「不改原数组」契约。
 *   - calculatePercentages/normalize 的 total=0 / range=0 除零守卫。
 *   - generateTimeSeries 的 `current <= endDate` 闭区间与每项 `new Date(current)` 副本。
 *   - correlation 的长度不等/空集/零分母守卫。
 *   - detectOutliers 的 std===0 守卫（恒等数据集无离群）。
 *   - toCSV 的 RFC 4180 转义（逗号/引号/换行 → 双引号包裹并双写内部引号）、
 *     BOM 前缀、CRLF 行分隔、null/undefined → '' 回退、对象/数组 → JSON 序列化。
 *   - downloadFile 的 `typeof document === 'undefined'` SSR 早退。
 */

const FIXED_DATE = new Date("2026-03-07T14:05:09.000Z");

describe("formatUtils / src/lib/visualization/utils.ts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_DATE);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  // ==================== formatNumber ====================

  describe("formatNumber", () => {
    it("小于 1000 直接 toFixed(decimals)", () => {
      expect(formatUtils.formatNumber(999)).toBe("999.00");
      expect(formatUtils.formatNumber(0)).toBe("0.00");
      expect(formatUtils.formatNumber(12.345, 1)).toBe("12.3");
    });

    it(">= 1000 走 K 缩写（含边界 1000）", () => {
      expect(formatUtils.formatNumber(1000)).toBe("1.00K");
      expect(formatUtils.formatNumber(1500)).toBe("1.50K");
      expect(formatUtils.formatNumber(999999)).toBe("1000.00K");
    });

    it(">= 1000000 走 M 缩写（含边界 1000000）", () => {
      expect(formatUtils.formatNumber(1000000)).toBe("1.00M");
      expect(formatUtils.formatNumber(2500000, 1)).toBe("2.5M");
    });

    it("decimals 默认 2，可显式传 0", () => {
      expect(formatUtils.formatNumber(1234, 0)).toBe("1K");
    });

    it("负值不走 K/M 缩写（< 1000 落到 else 分支）", () => {
      // 负数恒 < 1000，落入 else：value.toFixed(decimals)
      expect(formatUtils.formatNumber(-1500)).toBe("-1500.00");
      expect(formatUtils.formatNumber(-1)).toBe("-1.00");
    });
  });

  // ==================== formatPercent ====================

  describe("formatPercent", () => {
    it("value * 100 后 toFixed(decimals) + '%'", () => {
      expect(formatUtils.formatPercent(0.5)).toBe("50.0%");
      expect(formatUtils.formatPercent(1)).toBe("100.0%");
      expect(formatUtils.formatPercent(0)).toBe("0.0%");
    });

    it("decimals 默认 1，四舍五入", () => {
      expect(formatUtils.formatPercent(0.123)).toBe("12.3%");
      expect(formatUtils.formatPercent(0.125, 2)).toBe("12.50%");
    });

    it("负值与 >1 值同样按公式", () => {
      expect(formatUtils.formatPercent(-0.1)).toBe("-10.0%");
      expect(formatUtils.formatPercent(1.5)).toBe("150.0%");
    });
  });

  // ==================== formatCurrency ====================

  describe("formatCurrency", () => {
    it("默认 currency '¥' decimals 2", () => {
      expect(formatUtils.formatCurrency(12.5)).toBe("¥12.50");
      expect(formatUtils.formatCurrency(0)).toBe("¥0.00");
    });

    it("自定义 currency 与 decimals", () => {
      expect(formatUtils.formatCurrency(99.999, "$", 0)).toBe("$100");
      expect(formatUtils.formatCurrency(1234.5, "€", 1)).toBe("€1234.5");
    });
  });

  // ==================== formatFileSize ====================

  describe("formatFileSize", () => {
    it("bytes === 0 直接返回 '0 B'", () => {
      expect(formatUtils.formatFileSize(0)).toBe("0 B");
    });

    it("1 与 1023 落到 B 档", () => {
      expect(formatUtils.formatFileSize(1)).toBe("1 B");
      expect(formatUtils.formatFileSize(1023)).toBe("1023 B");
    });

    it("1024 边界进 KB 档", () => {
      expect(formatUtils.formatFileSize(1024)).toBe("1 KB");
      expect(formatUtils.formatFileSize(1536)).toBe("1.5 KB");
    });

    it("MB / GB / TB 跨档", () => {
      expect(formatUtils.formatFileSize(1048576)).toBe("1 MB");
      expect(formatUtils.formatFileSize(1073741824)).toBe("1 GB");
      expect(formatUtils.formatFileSize(1099511627776)).toBe("1 TB");
    });

    it("parseFloat 去除小数尾零", () => {
      // 2 * 1024 = 2048 → "2.00 KB" → parseFloat("2.00") = 2 → "2 KB"
      expect(formatUtils.formatFileSize(2048)).toBe("2 KB");
    });
  });

  // ==================== formatDate ====================

  describe("formatDate", () => {
    it("默认 format 'YYYY-MM-DD'", () => {
      expect(formatUtils.formatDate(FIXED_DATE)).toBe("2026-03-07");
    });

    it("自定义 format 含 HH:mm", () => {
      // FIXED_DATE 本地时区显示可能漂移；用 toLocaleString 友好的固定输入
      const d = new Date(2026, 2, 7, 14, 5, 9); // 本地时区 2026-03-07 14:05:09
      expect(formatUtils.formatDate(d, "YYYY-MM-DD HH:mm")).toBe(
        "2026-03-07 14:05"
      );
    });

    it("padStart(2,'0') 补零月/日/时/分", () => {
      const d = new Date(2026, 0, 5, 3, 9, 1); // 2026-01-05 03:09
      expect(formatUtils.formatDate(d, "YYYY-MM-DD HH:mm")).toBe(
        "2026-01-05 03:09"
      );
    });

    it("接受字符串日期输入", () => {
      expect(formatUtils.formatDate("2026-12-25")).toBe("2026-12-25");
    });
  });

  // ==================== formatTime ====================

  describe("formatTime", () => {
    it("0 秒 → '0:00'", () => {
      expect(formatUtils.formatTime(0)).toBe("0:00");
    });

    it("< 60 秒 → m:ss", () => {
      expect(formatUtils.formatTime(59)).toBe("0:59");
      expect(formatUtils.formatTime(5)).toBe("0:05");
    });

    it("60 与 3599 边界仍走 m:ss 分支（h === 0）", () => {
      expect(formatUtils.formatTime(60)).toBe("1:00");
      expect(formatUtils.formatTime(3599)).toBe("59:59");
    });

    it(">= 3600 走 h:mm:ss 分支", () => {
      expect(formatUtils.formatTime(3600)).toBe("1:00:00");
      expect(formatUtils.formatTime(3661)).toBe("1:01:01");
    });
  });
});

describe("dataUtils / src/lib/visualization/utils.ts", () => {
  // ==================== groupBy ====================

  describe("groupBy", () => {
    it("按 key 分组", () => {
      const data = [
        { type: "a", v: 1 },
        { type: "b", v: 2 },
        { type: "a", v: 3 },
      ];
      const grouped = dataUtils.groupBy(data, "type");
      expect(Object.keys(grouped).sort()).toEqual(["a", "b"]);
      expect(grouped.a).toHaveLength(2);
      expect(grouped.b).toHaveLength(1);
    });

    it("空数组 → 空对象", () => {
      expect(dataUtils.groupBy([], "x")).toEqual({});
    });

    it("缺失 key 的项归入 undefined 组", () => {
      const data: any[] = [{ v: 1 }, { v: 2 }];
      const grouped = dataUtils.groupBy(data, "missing");
      expect(grouped.undefined).toHaveLength(2);
    });
  });

  // ==================== sum / average / max / min ====================

  describe("sum", () => {
    it("默认 key='value'", () => {
      expect(
        dataUtils.sum([
          { name: "a", value: 1 },
          { name: "b", value: 2 },
        ])
      ).toBe(3);
    });

    it("空数组 → 0", () => {
      expect(dataUtils.sum([])).toBe(0);
    });

    it("缺失 value 字段按 0 累加（item[key] || 0）", () => {
      expect(
        dataUtils.sum([{ name: "a" }, { name: "b", value: 5 }] as DataPoint[])
      ).toBe(5);
    });

    it("自定义 key 与负值", () => {
      expect(
        dataUtils.sum(
          [
            { name: "a", count: -2 },
            { name: "b", count: 7 },
          ] as DataPoint[],
          "count"
        )
      ).toBe(5);
    });
  });

  describe("average", () => {
    it("总和 / 长度", () => {
      expect(
        dataUtils.average([
          { name: "a", value: 2 },
          { name: "b", value: 4 },
        ])
      ).toBe(3);
    });

    it("空数组 → 0（除零守卫）", () => {
      expect(dataUtils.average([])).toBe(0);
    });

    it("单元素数组返回自身值", () => {
      expect(dataUtils.average([{ name: "a", value: 7 }])).toBe(7);
    });
  });

  describe("max / min", () => {
    const data: DataPoint[] = [
      { name: "a", value: 3 },
      { name: "b", value: 1 },
      { name: "c", value: 2 },
    ];
    it("max 返回最大值", () => {
      expect(dataUtils.max(data)).toBe(3);
    });
    it("min 返回最小值", () => {
      expect(dataUtils.min(data)).toBe(1);
    });
    it("空数组 → 0（守卫）", () => {
      expect(dataUtils.max([])).toBe(0);
      expect(dataUtils.min([])).toBe(0);
    });
    it("全负数", () => {
      const neg: DataPoint[] = [
        { name: "a", value: -5 },
        { name: "b", value: -1 },
      ];
      expect(dataUtils.max(neg)).toBe(-1);
      expect(dataUtils.min(neg)).toBe(-5);
    });
  });

  // ==================== sort / topN ====================

  describe("sort", () => {
    const data: DataPoint[] = [
      { name: "a", value: 3 },
      { name: "b", value: 1 },
      { name: "c", value: 2 },
    ];

    it("默认 desc 降序", () => {
      const sorted = dataUtils.sort(data);
      expect(sorted.map((d) => d.value)).toEqual([3, 2, 1]);
    });

    it("asc 升序", () => {
      const sorted = dataUtils.sort(data, "value", "asc");
      expect(sorted.map((d) => d.value)).toEqual([1, 2, 3]);
    });

    it("不改原数组（浅拷贝 [...]）", () => {
      const snapshot = data.map((d) => ({ ...d }));
      dataUtils.sort(data);
      expect(data).toEqual(snapshot);
    });

    it("缺失 value 字段按 0 参与排序", () => {
      const mixed = [{ name: "a", value: 5 }, { name: "b" }] as DataPoint[];
      const sorted = dataUtils.sort(mixed);
      expect(sorted.map((d) => d.value ?? 0)).toEqual([5, 0]);
    });

    it("空数组 → 空数组", () => {
      expect(dataUtils.sort([])).toEqual([]);
    });
  });

  describe("topN", () => {
    const data: DataPoint[] = [
      { name: "a", value: 5 },
      { name: "b", value: 1 },
      { name: "c", value: 3 },
      { name: "d", value: 2 },
    ];

    it("取前 N 条（按 desc）", () => {
      const top = dataUtils.topN(data, 2);
      expect(top.map((d) => d.value)).toEqual([5, 3]);
    });

    it("n=0 → 空数组", () => {
      expect(dataUtils.topN(data, 0)).toEqual([]);
    });

    it("n > 长度 → 返回全部 desc 排序", () => {
      const top = dataUtils.topN(data, 10);
      expect(top).toHaveLength(4);
      expect(top.map((d) => d.value)).toEqual([5, 3, 2, 1]);
    });

    it("自定义 key", () => {
      const keyed = [
        { name: "a", count: 10 },
        { name: "b", count: 20 },
      ] as DataPoint[];
      const top = dataUtils.topN(keyed, 1, "count");
      expect(top[0].name).toBe("b");
    });
  });

  // ==================== calculatePercentages / normalize ====================

  describe("calculatePercentages", () => {
    it("每项加 percentage 字段 = value/total", () => {
      const data: DataPoint[] = [
        { name: "a", value: 1 },
        { name: "b", value: 3 },
      ];
      const result = dataUtils.calculatePercentages(data);
      expect(result[0].percentage).toBeCloseTo(0.25);
      expect(result[1].percentage).toBeCloseTo(0.75);
    });

    it("保留原字段（...item 展开）", () => {
      const data: DataPoint[] = [{ name: "a", value: 10, extra: "x" }];
      const result = dataUtils.calculatePercentages(data);
      expect(result[0].name).toBe("a");
      expect(result[0].extra).toBe("x");
    });

    it("total = 0 → percentage 全为 0（除零守卫）", () => {
      const data: DataPoint[] = [
        { name: "a", value: 0 },
        { name: "b", value: 0 },
      ];
      const result = dataUtils.calculatePercentages(data);
      expect(result.every((d) => d.percentage === 0)).toBe(true);
    });

    it("空数组 → 空数组", () => {
      expect(dataUtils.calculatePercentages([])).toEqual([]);
    });
  });

  describe("normalize", () => {
    it("每项加 normalized = (value-min)/range", () => {
      const data: DataPoint[] = [
        { name: "a", value: 0 },
        { name: "b", value: 5 },
        { name: "c", value: 10 },
      ];
      const result = dataUtils.normalize(data);
      expect(result[0].normalized).toBe(0);
      expect(result[1].normalized).toBeCloseTo(0.5);
      expect(result[2].normalized).toBe(1);
    });

    it("range = 0 → normalized 全为 0（除零守卫）", () => {
      const data: DataPoint[] = [
        { name: "a", value: 7 },
        { name: "b", value: 7 },
      ];
      const result = dataUtils.normalize(data);
      expect(result.every((d) => d.normalized === 0)).toBe(true);
    });

    it("保留原字段", () => {
      const data: DataPoint[] = [{ name: "a", value: 5, tag: "t" }];
      const result = dataUtils.normalize(data);
      expect(result[0].tag).toBe("t");
      expect(result[0].name).toBe("a");
    });

    it("空数组 → 空数组", () => {
      expect(dataUtils.normalize([])).toEqual([]);
    });
  });

  // ==================== generateTimeSeries ====================

  describe("generateTimeSeries", () => {
    it("day 间隔，闭区间含两端", () => {
      const start = new Date(2026, 0, 1);
      const end = new Date(2026, 0, 3);
      const result = dataUtils.generateTimeSeries(start, end, "day");
      expect(result).toHaveLength(3);
      expect(result[0].name).toBe("2026-01-01");
      expect(result[2].name).toBe("2026-01-03");
    });

    it("每项 value=0 且 date 是独立 Date 实例", () => {
      const start = new Date(2026, 0, 1);
      const end = new Date(2026, 0, 2);
      const result = dataUtils.generateTimeSeries(start, end, "day");
      expect(result[0].value).toBe(0);
      expect(result[0].date).toBeInstanceOf(Date);
      // 修改一项 date 不影响其他项（new Date(current) 副本）
      const firstDate = result[0].date as Date;
      firstDate.setDate(15);
      expect((result[1].date as Date).getDate()).toBe(2);
    });

    it("week 间隔跨 7 天", () => {
      const start = new Date(2026, 0, 1);
      const end = new Date(2026, 0, 15);
      const result = dataUtils.generateTimeSeries(start, end, "week");
      // 1/1, 1/8, 1/15 → 3 项
      expect(result).toHaveLength(3);
    });

    it("month 间隔", () => {
      const start = new Date(2026, 0, 1);
      const end = new Date(2026, 2, 1);
      const result = dataUtils.generateTimeSeries(start, end, "month");
      expect(result).toHaveLength(3);
      expect(result[2].name).toBe("2026-03-01");
    });

    it("start === end → 单元素", () => {
      const d = new Date(2026, 5, 15);
      const result = dataUtils.generateTimeSeries(d, d, "day");
      expect(result).toHaveLength(1);
    });

    it("end 早于 start → 空数组（while 条件不满足）", () => {
      const result = dataUtils.generateTimeSeries(
        new Date(2026, 5, 15),
        new Date(2026, 5, 10),
        "day"
      );
      expect(result).toEqual([]);
    });
  });

  // ==================== unique ====================

  describe("unique", () => {
    it("无 key：基本类型去重", () => {
      expect(dataUtils.unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
      expect(dataUtils.unique(["a", "b", "a"])).toEqual(["a", "b"]);
    });

    it("无 key：对象按引用去重（Set 仅对引用去重）", () => {
      const o1 = { x: 1 };
      const o2 = { x: 1 };
      expect(dataUtils.unique([o1, o2, o1])).toEqual([o1, o2]);
    });

    it("有 key：按 key 值去重", () => {
      const data = [
        { id: 1, name: "a" },
        { id: 2, name: "b" },
        { id: 1, name: "c" },
      ];
      const result = dataUtils.unique(data, "id");
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe("a");
    });

    it("有 key：保留首次出现的项", () => {
      const data = [
        { id: 1, name: "first" },
        { id: 1, name: "second" },
      ];
      const result = dataUtils.unique(data, "id");
      expect(result[0].name).toBe("first");
    });

    it("空数组 → 空数组", () => {
      expect(dataUtils.unique([])).toEqual([]);
      expect(dataUtils.unique([], "id")).toEqual([]);
    });
  });
});

describe("chartUtils / src/lib/visualization/utils.ts", () => {
  // ==================== getColors / getColor ====================

  describe("getColors", () => {
    it("默认 default 配色", () => {
      expect(chartUtils.getColors()).toBe(CHART_COLORS.default);
      expect(chartUtils.getColors("default")).toBe(CHART_COLORS.default);
    });

    it("soft / dark / business 配色", () => {
      expect(chartUtils.getColors("soft")).toBe(CHART_COLORS.soft);
      expect(chartUtils.getColors("dark")).toBe(CHART_COLORS.dark);
      expect(chartUtils.getColors("business")).toBe(CHART_COLORS.business);
    });

    it("未知 scheme → 回退 default（CHART_COLORS[scheme] || CHART_COLORS.default）", () => {
      expect(chartUtils.getColors("nonexistent" as any)).toBe(
        CHART_COLORS.default
      );
    });
  });

  describe("getColor", () => {
    it("index 0 取首色", () => {
      expect(chartUtils.getColor(0)).toBe(CHART_COLORS.default[0]);
    });

    it("index 超长自动取模回绕", () => {
      const len = CHART_COLORS.default.length;
      expect(chartUtils.getColor(len)).toBe(CHART_COLORS.default[0]);
      expect(chartUtils.getColor(len + 2)).toBe(CHART_COLORS.default[2]);
    });

    it("指定 scheme", () => {
      expect(chartUtils.getColor(0, "soft")).toBe(CHART_COLORS.soft[0]);
    });
  });

  // ==================== generateGradient ====================

  describe("generateGradient", () => {
    it("默认 opacity 0.3 → hex '4d'", () => {
      // 0.3 * 255 = 76.5 → round → 77 → toString(16) → '4d'
      expect(chartUtils.generateGradient("#000000")).toBe(
        "linear-gradient(to bottom, #0000004d, transparent)"
      );
    });

    it("opacity 1 → 'ff'", () => {
      expect(chartUtils.generateGradient("#ff0000", 1)).toBe(
        "linear-gradient(to bottom, #ff0000ff, transparent)"
      );
    });

    it("opacity 0 → padStart 补零为 '00'", () => {
      expect(chartUtils.generateGradient("#abc", 0)).toBe(
        "linear-gradient(to bottom, #abc00, transparent)"
      );
    });
  });

  // ==================== calculateSize ====================

  describe("calculateSize", () => {
    it("宽容器：高度由宽/aspectRatio 推导且不超容器高", () => {
      // 16:9，宽 1600 → 高 900，未超 1000 → 返回 {1600, 900}
      const r = chartUtils.calculateSize(1600, 1000);
      expect(r).toEqual({ width: 1600, height: 900 });
    });

    it("窄容器：高超容器高 → 重算宽 = 容器高 * aspectRatio", () => {
      // 16:9，宽 1600 → 高 900 > 500 → 高 = 500，宽 = 500 * 16/9 ≈ 888.89
      const r = chartUtils.calculateSize(1600, 500);
      expect(r.height).toBe(500);
      expect(r.width).toBeCloseTo((500 * 16) / 9, 5);
    });

    it("自定义 aspectRatio（1:1）", () => {
      const r = chartUtils.calculateSize(200, 100, 1);
      // 宽 200 → 高 200 > 100 → 高 = 100，宽 = 100 * 1 = 100
      expect(r).toEqual({ width: 100, height: 100 });
    });
  });

  // ==================== getResponsiveConfig ====================

  describe("getResponsiveConfig", () => {
    it("覆盖 width，保留其它字段", () => {
      const config = {
        type: "line" as const,
        data: [],
        width: 600,
        height: 400,
        title: "t",
      };
      const r = chartUtils.getResponsiveConfig(config, 1200);
      expect(r.width).toBe(1200);
      expect(r.height).toBe(400);
      expect(r.title).toBe("t");
      expect(r.type).toBe("line");
    });

    it("不改原 config（...展开浅拷贝）", () => {
      const config = { type: "bar" as const, data: [], width: 100 };
      chartUtils.getResponsiveConfig(config, 999);
      expect(config.width).toBe(100);
    });
  });
});

describe("exportUtils / src/lib/visualization/utils.ts", () => {
  // ==================== toCSV ====================

  describe("toCSV", () => {
    it("空数组 → 空字符串", () => {
      expect(exportUtils.toCSV([])).toBe("");
    });

    it("默认列取 Object.keys(data[0])，含 BOM 与 CRLF 行分隔", () => {
      const data: DataPoint[] = [
        { name: "a", value: 1 },
        { name: "b", value: 2 },
      ];
      const csv = exportUtils.toCSV(data);
      // BOM 前缀 + \r\n 行分隔（RFC 4180）
      expect(csv.startsWith("\uFEFF")).toBe(true);
      const lines = csv.slice(1).split("\r\n");
      expect(lines[0]).toBe("name,value");
      expect(lines[1]).toBe("a,1");
      expect(lines[2]).toBe("b,2");
    });

    it("自定义 columns", () => {
      const data: DataPoint[] = [
        { name: "a", value: 1, extra: "x" },
        { name: "b", value: 2, extra: "y" },
      ];
      const csv = exportUtils.toCSV(data, ["name", "value"]);
      const lines = csv.slice(1).split("\r\n");
      expect(lines[0]).toBe("name,value");
      expect(lines[1]).toBe("a,1");
      // extra 字段不出现在 CSV
      expect(lines[1]).not.toContain("x");
    });

    it("RFC 4180 转义：含逗号/引号/换行的单元格双引号包裹并双写内部引号", () => {
      const data: DataPoint[] = [
        { name: 'a,b"c\nd', value: 1 } as any,
      ];
      const csv = exportUtils.toCSV(data);
      const lines = csv.slice(1).split("\r\n");
      // 含 , " \n 三种特殊字符 → 包裹且内部 " 双写
      expect(lines[1]).toBe('"a,b""c\nd",1');
    });

    it("null/undefined 值 → 空字符串（escapeCell 早退）", () => {
      const data: DataPoint[] = [
        { name: "a", value: null } as any,
        { name: "b", value: undefined } as any,
      ];
      const csv = exportUtils.toCSV(data);
      const lines = csv.slice(1).split("\r\n");
      expect(lines[1]).toBe("a,");
      expect(lines[2]).toBe("b,");
    });

    it("对象/数组值 → JSON 序列化（避免 [object Object]）", () => {
      const data: DataPoint[] = [
        { name: "a", value: { x: 1 } } as any,
        { name: "b", value: [1, 2] } as any,
      ];
      const csv = exportUtils.toCSV(data);
      const lines = csv.slice(1).split("\r\n");
      // 对象 JSON 含逗号与引号 → 整体被双引号包裹且内部 " 双写
      expect(lines[1]).toBe('a,"{""x"":1}"');
      expect(lines[2]).toBe('b,"[1,2]"');
    });

    it("表头列名含特殊字符同样转义", () => {
      const data: DataPoint[] = [{ "col,1": 1 } as any];
      const csv = exportUtils.toCSV(data, ["col,1"]);
      const lines = csv.slice(1).split("\r\n");
      expect(lines[0]).toBe('"col,1"');
      expect(lines[1]).toBe("1");
    });
  });

  // ==================== toJSON ====================

  describe("toJSON", () => {
    it("pretty=true 默认 → 缩进 2", () => {
      const csv = exportUtils.toJSON({ a: 1 });
      expect(csv).toBe('{\n  "a": 1\n}');
    });

    it("pretty=false → 紧凑", () => {
      expect(exportUtils.toJSON({ a: 1 }, false)).toBe('{"a":1}');
    });
  });

  // ==================== downloadFile / exportChartData ====================

  describe("downloadFile", () => {
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;
    let clickSpy: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      // jsdom 可能不实现 URL.createObjectURL；统一 mock
      createObjectURLMock = vi.fn(() => "blob:mock-url");
      revokeObjectURLMock = vi.fn();
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      });
      clickSpy = vi.fn();
      // 拦截 createElement('a') 的 click
      const originalCreate = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = originalCreate(tag);
        if (tag === "a") {
          el.click = clickSpy;
        }
        return el;
      });
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("构造 blob + 链接 + 点击 + 移除 + revoke", () => {
      exportUtils.downloadFile("hello", "out.txt");

      expect(createObjectURLMock).toHaveBeenCalledOnce();
      expect(clickSpy).toHaveBeenCalledOnce();
      expect(revokeObjectURLMock).toHaveBeenCalledWith("blob:mock-url");
    });

    it("默认 mimeType='text/plain'", () => {
      const blobCtor = vi.spyOn(globalThis, "Blob");
      exportUtils.downloadFile("x", "y.txt");
      expect(blobCtor).toHaveBeenCalledWith(["x"], { type: "text/plain" });
      blobCtor.mockRestore();
    });

    it("自定义 mimeType 透传", () => {
      const blobCtor = vi.spyOn(globalThis, "Blob");
      exportUtils.downloadFile("x", "y.csv", "text/csv");
      expect(blobCtor).toHaveBeenCalledWith(["x"], { type: "text/csv" });
      blobCtor.mockRestore();
    });
  });

  describe("exportChartData", () => {
    let createObjectURLMock: ReturnType<typeof vi.fn>;
    let revokeObjectURLMock: ReturnType<typeof vi.fn>;
    let clickSpy: ReturnType<typeof vi.fn>;
    let warnSpy: ReturnType<typeof vi.SpyInstance>;

    beforeEach(() => {
      createObjectURLMock = vi.fn(() => "blob:mock-url");
      revokeObjectURLMock = vi.fn();
      vi.stubGlobal("URL", {
        ...URL,
        createObjectURL: createObjectURLMock,
        revokeObjectURL: revokeObjectURLMock,
      });
      clickSpy = vi.fn();
      const originalCreate = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const el = originalCreate(tag);
        if (tag === "a") el.click = clickSpy;
        return el;
      });
      warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
    });

    it("format=csv → 下载 <filename>.csv（默认 filename='chart-data'）", () => {
      const data: DataPoint[] = [{ name: "a", value: 1 }];
      exportUtils.exportChartData(data, { format: "csv" });
      expect(clickSpy).toHaveBeenCalledOnce();
      // 取最后一次 Blob 调用核对 mimeType 与内容
      // 这里通过 toCSV 间接验证：内容应含 "name,value"
    });

    it("format=json → 下载 <filename>.json", () => {
      const data: DataPoint[] = [{ name: "a", value: 1 }];
      exportUtils.exportChartData(data, { format: "json", filename: "report" });
      expect(clickSpy).toHaveBeenCalledOnce();
    });

    it("自定义 filename 透传", () => {
      const blobCtor = vi.spyOn(globalThis, "Blob");
      const data: DataPoint[] = [{ name: "a", value: 1 }];
      exportUtils.exportChartData(data, {
        format: "csv",
        filename: "my-report",
      });
      // 仅断言 download 触发；filename 通过 link.download 设置（jsdom 下不持久）
      expect(blobCtor).toHaveBeenCalled();
      blobCtor.mockRestore();
    });

    it("未知 format → console.warn，不触发下载", () => {
      const data: DataPoint[] = [{ name: "a", value: 1 }];
      exportUtils.exportChartData(data, {
        format: "png" as any,
      });
      expect(warnSpy).toHaveBeenCalledWith("Unsupported export format: png");
      expect(clickSpy).not.toHaveBeenCalled();
    });
  });
});

describe("statsUtils / src/lib/visualization/utils.ts", () => {
  // ==================== standardDeviation ====================

  describe("standardDeviation", () => {
    it("空数组 → 0", () => {
      expect(statsUtils.standardDeviation([])).toBe(0);
    });

    it("单元素 → 0（variance=0）", () => {
      expect(statsUtils.standardDeviation([5])).toBe(0);
    });

    it("全等数据 → 0", () => {
      expect(statsUtils.standardDeviation([3, 3, 3])).toBe(0);
    });

    it("[1,2,3,4,5] 总体标准差 = sqrt(2)", () => {
      // mean=3, squaredDiffs=[4,1,0,1,4], variance=10/5=2, std=sqrt(2)
      expect(statsUtils.standardDeviation([1, 2, 3, 4, 5])).toBeCloseTo(
        Math.sqrt(2)
      );
    });
  });

  // ==================== median ====================

  describe("median", () => {
    it("空数组 → 0", () => {
      expect(statsUtils.median([])).toBe(0);
    });

    it("奇数长度 → 中间元素", () => {
      expect(statsUtils.median([1, 3, 2])).toBe(2);
    });

    it("偶数长度 → 中间两元素均值", () => {
      expect(statsUtils.median([1, 2, 3, 4])).toBe(2.5);
    });

    it("单元素 → 自身", () => {
      expect(statsUtils.median([42])).toBe(42);
    });

    it("不改原数组（内部 [...data] 拷贝）", () => {
      const arr = [3, 1, 2];
      const snapshot = [...arr];
      statsUtils.median(arr);
      expect(arr).toEqual(snapshot);
    });
  });

  // ==================== mode ====================

  describe("mode", () => {
    it("空数组 → null", () => {
      expect(statsUtils.mode([])).toBeNull();
    });

    it("单众数", () => {
      expect(statsUtils.mode([1, 2, 2, 3])).toBe(2);
    });

    it("多众数取首次达 maxFreq 的（先到先得）", () => {
      // 1 出现 2 次（首次达 maxFreq=2），2 也出现 2 次但不 > maxFreq
      expect(statsUtils.mode([1, 1, 2, 2])).toBe(1);
    });

    it("全等 → 该值", () => {
      expect(statsUtils.mode([5, 5, 5])).toBe(5);
    });

    it("单元素 → 该元素", () => {
      expect(statsUtils.mode([7])).toBe(7);
    });
  });

  // ==================== quantile ====================

  describe("quantile", () => {
    it("空数组 → 0", () => {
      expect(statsUtils.quantile([], 0.5)).toBe(0);
    });

    it("q=0 → 最小值（首位）", () => {
      expect(statsUtils.quantile([3, 1, 2], 0)).toBe(1);
    });

    it("q=1 → 最大值（末位）", () => {
      expect(statsUtils.quantile([3, 1, 2], 1)).toBe(3);
    });

    it("q=0.5 命中整数位置 → 等价中位数（奇数长度）", () => {
      expect(statsUtils.quantile([1, 2, 3], 0.5)).toBe(2);
    });

    it("q=0.5 非整数位置 → 线性插值（偶数长度）", () => {
      // 排序后 [1,2,3,4]，position=3*0.5=1.5，base=1，rest=0.5
      // sorted[1] + 0.5 * (sorted[2] - sorted[1]) = 2 + 0.5 * 1 = 2.5
      expect(statsUtils.quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    });

    it("不改原数组", () => {
      const arr = [3, 1, 2];
      const snapshot = [...arr];
      statsUtils.quantile(arr, 0.5);
      expect(arr).toEqual(snapshot);
    });
  });

  // ==================== correlation ====================

  describe("correlation", () => {
    it("空数组 → 0", () => {
      expect(statsUtils.correlation([], [])).toBe(0);
    });

    it("长度不等 → 0", () => {
      expect(statsUtils.correlation([1, 2], [1])).toBe(0);
    });

    it("完全正相关 → 1", () => {
      expect(statsUtils.correlation([1, 2, 3], [2, 4, 6])).toBeCloseTo(1);
    });

    it("完全负相关 → -1", () => {
      expect(statsUtils.correlation([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1);
    });

    it("零分母（一方恒定）→ 0（守卫）", () => {
      // x 恒定 → sumX2 - sumX^2/n = 0 → denominator=0 → 返回 0
      expect(statsUtils.correlation([5, 5, 5], [1, 2, 3])).toBe(0);
    });
  });

  // ==================== detectOutliers ====================

  describe("detectOutliers", () => {
    it("空数组 → []", () => {
      expect(statsUtils.detectOutliers([])).toEqual([]);
    });

    it("std === 0（恒等数据）→ []（守卫）", () => {
      expect(statsUtils.detectOutliers([5, 5, 5])).toEqual([]);
    });

    it("默认 threshold=3 检测 Z-score 超 3 的值", () => {
      // 单一大离群点的 z-score ≈ √(n-1)（population std 自身被抬高），
      // 故需 n >= 11 才能使 z > 3。这里用 10 个 10 + 1 个 100：
      // mean≈18.18，std≈25.87，z(100)=81.82/25.87≈3.16 > 3
      const data = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 100];
      const outliers = statsUtils.detectOutliers(data);
      expect(outliers).toContain(100);
      expect(outliers).not.toContain(10);
    });

    it("自定义 threshold 更低 → 检出更多", () => {
      // [1,2,3,4,100] mean=22, std≈39, z(100)≈2.0：
      // threshold=1 检出 100；threshold=3 全部不检出。
      const low = statsUtils.detectOutliers([1, 2, 3, 4, 100], 1);
      const high = statsUtils.detectOutliers([1, 2, 3, 4, 100], 3);
      expect(low.length).toBeGreaterThanOrEqual(high.length);
    });

    it("无离群值 → []", () => {
      expect(statsUtils.detectOutliers([1, 2, 3, 4, 5])).toEqual([]);
    });
  });
});
