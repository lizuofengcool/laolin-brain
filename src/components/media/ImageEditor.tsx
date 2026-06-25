"use client";

import React, { useState, useRef, useEffect, useCallback, useMemo } from "react";

// ==================== 类型定义 ====================

export interface ImageEditorProps {
  src: string;
  onSave?: (blob: Blob, fileName: string) => void;
  readOnly?: boolean;
  height?: string | number;
  className?: string;
}

interface FilterState {
  brightness: number; // 0-200, 100为正常
  contrast: number; // 0-200, 100为正常
  saturation: number; // 0-200, 100为正常
  hueRotate: number; // 0-360, 0为正常
  blur: number; // 0-20, 0为正常
  sepia: number; // 0-100, 0为正常
  grayscale: number; // 0-100, 0为正常
  invert: number; // 0-100, 0为正常
}

interface TransformState {
  rotate: number; // 0, 90, 180, 270
  flipH: boolean;
  flipV: boolean;
  scale: number; // 0.1-5, 1为正常
}

interface HistoryState {
  filters: FilterState;
  transform: TransformState;
}

// ==================== 默认值 ====================

const defaultFilters: FilterState = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
  hueRotate: 0,
  blur: 0,
  sepia: 0,
  grayscale: 0,
  invert: 0,
};

const defaultTransform: TransformState = {
  rotate: 0,
  flipH: false,
  flipV: false,
  scale: 1,
};

// ==================== 预设滤镜 ====================

const presetFilters = [
  { name: "原图", filters: { ...defaultFilters } },
  { name: "黑白", filters: { ...defaultFilters, grayscale: 100 } },
  { name: "复古", filters: { ...defaultFilters, sepia: 80, contrast: 110 } },
  { name: "冷色调", filters: { ...defaultFilters, hueRotate: 200, saturation: 80 } },
  { name: "暖色调", filters: { ...defaultFilters, sepia: 30, hueRotate: -10 } },
  { name: "鲜艳", filters: { ...defaultFilters, saturation: 150, contrast: 110 } },
  { name: "柔和", filters: { ...defaultFilters, brightness: 110, contrast: 90, saturation: 90 } },
  { name: "戏剧", filters: { ...defaultFilters, contrast: 140, brightness: 90, saturation: 120 } },
  { name: "胶片", filters: { ...defaultFilters, sepia: 20, contrast: 105, brightness: 105 } },
  { name: "反色", filters: { ...defaultFilters, invert: 100 } },
];

// ==================== 主组件 ====================

export function ImageEditor({
  src,
  onSave,
  readOnly = false,
  height = "600px",
  className = "",
}: ImageEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);

  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageInfo, setImageInfo] = useState<{
    width: number;
    height: number;
    size?: number;
    type?: string;
  } | null>(null);

  const [filters, setFilters] = useState<FilterState>(defaultFilters);
  const [transform, setTransform] = useState<TransformState>(defaultTransform);

  const [history, setHistory] = useState<HistoryState[]>([
    { filters: defaultFilters, transform: defaultTransform },
  ]);
  const [historyIndex, setHistoryIndex] = useState(0);

  const [activeTab, setActiveTab] = useState<"adjust" | "filters" | "transform" | "info">("adjust");
  const [outputFormat, setOutputFormat] = useState<"image/png" | "image/jpeg" | "image/webp">("image/png");
  const [quality, setQuality] = useState(0.92);
  const [isSaving, setIsSaving] = useState(false);

  // ==================== 加载图片 ====================

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imageRef.current = img;
      setImageInfo({
        width: img.width,
        height: img.height,
      });
      setImageLoaded(true);
    };
    img.onerror = () => {
      console.error("Failed to load image");
    };
    img.src = src;
  }, [src]);

  // ==================== 绘制Canvas ====================

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const img = imageRef.current;

    if (!canvas || !ctx || !img || !imageInfo) return;

    // 根据旋转计算画布尺寸
    const isRotated = transform.rotate === 90 || transform.rotate === 270;
    const canvasWidth = isRotated ? imageInfo.height : imageInfo.width;
    const canvasHeight = isRotated ? imageInfo.width : imageInfo.height;

    canvas.width = canvasWidth;
    canvas.height = canvasHeight;

    // 清除画布
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);

    // 保存状态
    ctx.save();

    // 移动到中心
    ctx.translate(canvasWidth / 2, canvasHeight / 2);

    // 旋转
    ctx.rotate((transform.rotate * Math.PI) / 180);

    // 翻转
    ctx.scale(
      transform.flipH ? -transform.scale : transform.scale,
      transform.flipV ? -transform.scale : transform.scale
    );

    // 应用滤镜
    ctx.filter = `
      brightness(${filters.brightness}%)
      contrast(${filters.contrast}%)
      saturate(${filters.saturation}%)
      hue-rotate(${filters.hueRotate}deg)
      blur(${filters.blur}px)
      sepia(${filters.sepia}%)
      grayscale(${filters.grayscale}%)
      invert(${filters.invert}%)
    `;

    // 绘制图片
    ctx.drawImage(img, -img.width / 2, -img.height / 2);

    // 恢复状态
    ctx.restore();
  }, [filters, transform, imageInfo]);

  useEffect(() => {
    if (imageLoaded) {
      drawCanvas();
    }
  }, [imageLoaded, drawCanvas]);

  // ==================== 历史记录 ====================

  const pushHistory = useCallback(
    (newFilters: FilterState, newTransform: TransformState) => {
      const newHistory = history.slice(0, historyIndex + 1);
      newHistory.push({ filters: newFilters, transform: newTransform });
      setHistory(newHistory);
      setHistoryIndex(newHistory.length - 1);
    },
    [history, historyIndex]
  );

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  const undo = useCallback(() => {
    if (!canUndo) return;
    const newIndex = historyIndex - 1;
    setHistoryIndex(newIndex);
    setFilters(history[newIndex].filters);
    setTransform(history[newIndex].transform);
  }, [canUndo, historyIndex, history]);

  const redo = useCallback(() => {
    if (!canRedo) return;
    const newIndex = historyIndex + 1;
    setHistoryIndex(newIndex);
    setFilters(history[newIndex].filters);
    setTransform(history[newIndex].transform);
  }, [canRedo, historyIndex, history]);

  // ==================== 滤镜调整 ====================

  const updateFilter = useCallback(
    (key: keyof FilterState, value: number) => {
      const newFilters = { ...filters, [key]: value };
      setFilters(newFilters);
    },
    [filters]
  );

  const applyFilterPreset = useCallback(
    (preset: typeof presetFilters[0]) => {
      const newFilters = { ...preset.filters };
      setFilters(newFilters);
      pushHistory(newFilters, transform);
    },
    [transform, pushHistory]
  );

  // ==================== 变换操作 ====================

  const rotate = useCallback(
    (degrees: number) => {
      const newTransform = {
        ...transform,
        rotate: (transform.rotate + degrees + 360) % 360,
      };
      setTransform(newTransform);
      pushHistory(filters, newTransform);
    },
    [transform, filters, pushHistory]
  );

  const flipHorizontal = useCallback(() => {
    const newTransform = { ...transform, flipH: !transform.flipH };
    setTransform(newTransform);
    pushHistory(filters, newTransform);
  }, [transform, filters, pushHistory]);

  const flipVertical = useCallback(() => {
    const newTransform = { ...transform, flipV: !transform.flipV };
    setTransform(newTransform);
    pushHistory(filters, newTransform);
  }, [transform, filters, pushHistory]);

  const setScale = useCallback(
    (scale: number) => {
      const newTransform = { ...transform, scale: Math.max(0.1, Math.min(5, scale)) };
      setTransform(newTransform);
    },
    [transform]
  );

  // ==================== 重置 ====================

  const resetAll = useCallback(() => {
    setFilters(defaultFilters);
    setTransform(defaultTransform);
    pushHistory(defaultFilters, defaultTransform);
  }, [pushHistory]);

  // ==================== 保存/下载 ====================

  const handleSave = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onSave) return;

    setIsSaving(true);

    try {
      canvas.toBlob(
        (blob) => {
          if (blob) {
            const ext = outputFormat === "image/png" ? "png" : outputFormat === "image/jpeg" ? "jpg" : "webp";
            const fileName = `edited-image.${ext}`;
            onSave(blob, fileName);
          }
          setIsSaving(false);
        },
        outputFormat,
        quality
      );
    } catch (e) {
      console.error("Save failed:", e);
      setIsSaving(false);
    }
  }, [outputFormat, quality, onSave]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.toBlob(
      (blob) => {
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          const ext = outputFormat === "image/png" ? "png" : outputFormat === "image/jpeg" ? "jpg" : "webp";
          a.href = url;
          a.download = `edited-image.${ext}`;
          a.click();
          URL.revokeObjectURL(url);
        }
      },
      outputFormat,
      quality
    );
  }, [outputFormat, quality]);

  // ==================== 计算CSS滤镜字符串 ====================

  const filterStyle = useMemo(() => {
    return `
      brightness(${filters.brightness}%)
      contrast(${filters.contrast}%)
      saturate(${filters.saturation}%)
      hue-rotate(${filters.hueRotate}deg)
      blur(${filters.blur}px)
      sepia(${filters.sepia}%)
      grayscale(${filters.grayscale}%)
      invert(${filters.invert}%)
    `;
  }, [filters]);

  // ==================== 渲染 ====================

  const tabs = [
    { id: "adjust", label: "调整", icon: "🎛️" },
    { id: "filters", label: "滤镜", icon: "🎨" },
    { id: "transform", label: "变换", icon: "🔄" },
    { id: "info", label: "信息", icon: "ℹ️" },
  ] as const;

  return (
    <div
      className={`flex flex-col lg:flex-row border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900 ${className}`}
      style={{ height }}
    >
      {/* 左侧：画布区域 */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center bg-gray-100 dark:bg-gray-800 overflow-auto p-4 relative"
      >
        {!imageLoaded ? (
          <div className="text-gray-500 dark:text-gray-400">加载中...</div>
        ) : (
          <div className="relative" style={{ maxWidth: "100%", maxHeight: "100%" }}>
            <canvas
              ref={canvasRef}
              className="max-w-full max-h-full shadow-lg"
              style={{
                transform: `scale(${transform.scale})`,
                transformOrigin: "center center",
              }}
            />
          </div>
        )}

        {/* 缩放控制 */}
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-white dark:bg-gray-800 rounded-lg shadow-lg px-3 py-2">
          <button
            onClick={() => setScale(transform.scale - 0.1)}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            −
          </button>
          <span className="text-sm text-gray-600 dark:text-gray-400 w-16 text-center">
            {Math.round(transform.scale * 100)}%
          </span>
          <button
            onClick={() => setScale(transform.scale + 0.1)}
            className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            +
          </button>
          <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
          <button
            onClick={() => setScale(1)}
            className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2"
          >
            重置
          </button>
        </div>
      </div>

      {/* 右侧：控制面板 */}
      <div className="w-full lg:w-80 flex flex-col border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
        {/* 工具栏 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-1">
            <button
              onClick={undo}
              disabled={!canUndo || readOnly}
              title="撤销 (Ctrl+Z)"
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↶
            </button>
            <button
              onClick={redo}
              disabled={!canRedo || readOnly}
              title="重做 (Ctrl+Y)"
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ↷
            </button>
            <button
              onClick={resetAll}
              disabled={readOnly}
              title="重置"
              className="w-8 h-8 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded disabled:opacity-40 disabled:cursor-not-allowed text-sm"
            >
              ⟲
            </button>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleDownload}
              title="下载"
              className="px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
            >
              ⬇ 下载
            </button>
            {onSave && (
              <button
                onClick={handleSave}
                disabled={isSaving || readOnly}
                className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? "保存中..." : "保存"}
              </button>
            )}
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                flex-1 px-2 py-2.5 text-xs font-medium transition-colors
                ${activeTab === tab.id
                  ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }
              `}
            >
              <span className="mr-0.5">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 面板内容 */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* 调整面板 */}
          {activeTab === "adjust" && (
            <div className="space-y-5">
              <SliderControl
                label="亮度"
                value={filters.brightness}
                min={0}
                max={200}
                unit="%"
                onChange={(v) => updateFilter("brightness", v)}
                disabled={readOnly}
              />
              <SliderControl
                label="对比度"
                value={filters.contrast}
                min={0}
                max={200}
                unit="%"
                onChange={(v) => updateFilter("contrast", v)}
                disabled={readOnly}
              />
              <SliderControl
                label="饱和度"
                value={filters.saturation}
                min={0}
                max={200}
                unit="%"
                onChange={(v) => updateFilter("saturation", v)}
                disabled={readOnly}
              />
              <SliderControl
                label="色相"
                value={filters.hueRotate}
                min={-180}
                max={180}
                unit="°"
                onChange={(v) => updateFilter("hueRotate", v)}
                disabled={readOnly}
              />
              <SliderControl
                label="模糊"
                value={filters.blur}
                min={0}
                max={20}
                unit="px"
                onChange={(v) => updateFilter("blur", v)}
                disabled={readOnly}
              />
              <SliderControl
                label="复古"
                value={filters.sepia}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateFilter("sepia", v)}
                disabled={readOnly}
              />
              <SliderControl
                label="黑白"
                value={filters.grayscale}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateFilter("grayscale", v)}
                disabled={readOnly}
              />
              <SliderControl
                label="反色"
                value={filters.invert}
                min={0}
                max={100}
                unit="%"
                onChange={(v) => updateFilter("invert", v)}
                disabled={readOnly}
              />
            </div>
          )}

          {/* 滤镜面板 */}
          {activeTab === "filters" && (
            <div className="grid grid-cols-2 gap-2">
              {presetFilters.map((preset, index) => (
                <button
                  key={index}
                  onClick={() => applyFilterPreset(preset)}
                  disabled={readOnly}
                  className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-400 transition-colors disabled:cursor-not-allowed"
                >
                  {imageLoaded && imageInfo && (
                    <div
                      className="absolute inset-0 bg-cover bg-center"
                      style={{
                        backgroundImage: `url(${src})`,
                        filter: `
                          brightness(${preset.filters.brightness}%)
                          contrast(${preset.filters.contrast}%)
                          saturate(${preset.filters.saturation}%)
                          hue-rotate(${preset.filters.hueRotate}deg)
                          blur(${preset.filters.blur}px)
                          sepia(${preset.filters.sepia}%)
                          grayscale(${preset.filters.grayscale}%)
                          invert(${preset.filters.invert}%)
                        `,
                      }}
                    />
                  )}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors" />
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-xs text-white drop-shadow-lg font-medium">
                    {preset.name}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* 变换面板 */}
          {activeTab === "transform" && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  旋转
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => rotate(-90)}
                    disabled={readOnly}
                    className="flex-1 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ↺ 左90°
                  </button>
                  <button
                    onClick={() => rotate(90)}
                    disabled={readOnly}
                    className="flex-1 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    ↻ 右90°
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  翻转
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={flipHorizontal}
                    disabled={readOnly}
                    className={`flex-1 py-2 text-sm border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      transform.flipH
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    ⇆ 水平
                  </button>
                  <button
                    onClick={flipVertical}
                    disabled={readOnly}
                    className={`flex-1 py-2 text-sm border rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      transform.flipV
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400"
                        : "border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-800"
                    }`}
                  >
                    ⇅ 垂直
                  </button>
                </div>
              </div>

              <SliderControl
                label="缩放"
                value={Math.round(transform.scale * 100)}
                min={10}
                max={500}
                unit="%"
                onChange={(v) => setScale(v / 100)}
                disabled={readOnly}
              />

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  输出格式
                </label>
                <select
                  value={outputFormat}
                  onChange={(e) => setOutputFormat(e.target.value as any)}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  <option value="image/png">PNG (无损)</option>
                  <option value="image/jpeg">JPEG (有损)</option>
                  <option value="image/webp">WebP (推荐)</option>
                </select>
              </div>

              {outputFormat !== "image/png" && (
                <SliderControl
                  label="质量"
                  value={Math.round(quality * 100)}
                  min={10}
                  max={100}
                  unit="%"
                  onChange={(v) => setQuality(v / 100)}
                  disabled={readOnly}
                />
              )}
            </div>
          )}

          {/* 信息面板 */}
          {activeTab === "info" && imageInfo && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <InfoItem label="宽度" value={`${imageInfo.width} px`} />
                <InfoItem label="高度" value={`${imageInfo.height} px`} />
                <InfoItem label="旋转" value={`${transform.rotate}°`} />
                <InfoItem label="缩放" value={`${Math.round(transform.scale * 100)}%`} />
              </div>

              <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                  当前滤镜参数
                </h4>
                <div className="space-y-2 text-xs text-gray-500 dark:text-gray-400">
                  <div className="flex justify-between">
                    <span>亮度</span>
                    <span>{filters.brightness}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>对比度</span>
                    <span>{filters.contrast}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>饱和度</span>
                    <span>{filters.saturation}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>色相</span>
                    <span>{filters.hueRotate}°</span>
                  </div>
                  <div className="flex justify-between">
                    <span>模糊</span>
                    <span>{filters.blur}px</span>
                  </div>
                  <div className="flex justify-between">
                    <span>复古</span>
                    <span>{filters.sepia}%</span>
                  </div>
                  <div className="flex justify-between">
                    <span>黑白</span>
                    <span>{filters.grayscale}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 子组件 ====================

interface SliderControlProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}

function SliderControl({
  label,
  value,
  min,
  max,
  unit = "",
  onChange,
  disabled = false,
}: SliderControlProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        <span className="text-xs text-gray-500 dark:text-gray-400 tabular-nums">
          {value}{unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value))}
        disabled={disabled}
        className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed accent-blue-500"
      />
    </div>
  );
}

interface InfoItemProps {
  label: string;
  value: string;
}

function InfoItem({ label, value }: InfoItemProps) {
  return (
    <div>
      <div className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">{label}</div>
      <div className="text-sm font-medium text-gray-900 dark:text-white">{value}</div>
    </div>
  );
}

export default ImageEditor;
