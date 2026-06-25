"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";

// ==================== 类型定义 ====================

export interface PdfViewerProps {
  src: string;
  fileName?: string;
  height?: string | number;
  className?: string;
  showToolbar?: boolean;
  showDownload?: boolean;
  showPrint?: boolean;
  showFullscreen?: boolean;
}

// ==================== 主组件 ====================

export function PdfViewer({
  src,
  fileName = "document.pdf",
  height = "600px",
  className = "",
  showToolbar = true,
  showDownload = true,
  showPrint = true,
  showFullscreen = true,
}: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [zoom, setZoom] = useState(100); // 百分比
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [sidebarTab, setSidebarTab] = useState<"thumbnails" | "outline">("thumbnails");

  // 缩放级别
  const zoomLevels = [50, 75, 100, 125, 150, 200, 300, 400];

  // ==================== 加载状态 ====================

  const handleLoad = useCallback(() => {
    setIsLoading(false);
    setLoadError(false);
  }, []);

  const handleError = useCallback(() => {
    setIsLoading(false);
    setLoadError(true);
  }, []);

  // ==================== 缩放控制 ====================

  const zoomIn = useCallback(() => {
    const currentIndex = zoomLevels.indexOf(zoom);
    if (currentIndex < zoomLevels.length - 1) {
      setZoom(zoomLevels[currentIndex + 1]);
    } else {
      setZoom(Math.min(zoom + 50, 500));
    }
  }, [zoom]);

  const zoomOut = useCallback(() => {
    const currentIndex = zoomLevels.indexOf(zoom);
    if (currentIndex > 0) {
      setZoom(zoomLevels[currentIndex - 1]);
    } else {
      setZoom(Math.max(zoom - 25, 25));
    }
  }, [zoom]);

  const setZoomFitWidth = useCallback(() => {
    // 模拟适应宽度
    setZoom(100);
  }, []);

  const setZoomFitPage = useCallback(() => {
    // 模拟适应页面
    setZoom(100);
  }, []);

  // ==================== 翻页控制 ====================

  const goToPage = useCallback((page: number) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages || page)));
  }, [totalPages]);

  const nextPage = useCallback(() => {
    goToPage(currentPage + 1);
  }, [currentPage, goToPage]);

  const prevPage = useCallback(() => {
    goToPage(currentPage - 1);
  }, [currentPage, goToPage]);

  // ==================== 全屏控制 ====================

  const toggleFullscreen = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;

    if (!document.fullscreenElement) {
      container.requestFullscreen?.().then(() => {
        setIsFullscreen(true);
      }).catch(() => {
        setIsFullscreen(false);
      });
    } else {
      document.exitFullscreen?.().then(() => {
        setIsFullscreen(false);
      });
    }
  }, []);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => {
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
    };
  }, []);

  // ==================== 下载 ====================

  const handleDownload = useCallback(() => {
    const a = document.createElement("a");
    a.href = src;
    a.download = fileName;
    a.click();
  }, [src, fileName]);

  // ==================== 打印 ====================

  const handlePrint = useCallback(() => {
    // 尝试通过iframe打印
    const iframe = iframeRef.current;
    if (iframe?.contentWindow) {
      try {
        iframe.contentWindow.print();
      } catch (e) {
        // 跨域时无法直接打印，打开新窗口
        window.open(src, "_blank");
      }
    } else {
      window.open(src, "_blank");
    }
  }, [src]);

  // ==================== 键盘快捷键 ====================

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // 如果焦点在输入框中，不处理快捷键
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.key) {
        case "+":
        case "=":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomIn();
          }
          break;
        case "-":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            zoomOut();
          }
          break;
        case "ArrowRight":
          if (!e.ctrlKey && !e.metaKey) {
            nextPage();
          }
          break;
        case "ArrowLeft":
          if (!e.ctrlKey && !e.metaKey) {
            prevPage();
          }
          break;
        case "f":
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            toggleFullscreen();
          }
          break;
        case "Escape":
          if (isFullscreen) {
            document.exitFullscreen?.();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [zoomIn, zoomOut, nextPage, prevPage, toggleFullscreen, isFullscreen]);

  // ==================== 渲染 ====================

  return (
    <div
      ref={containerRef}
      className={`
        flex flex-col border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-white dark:bg-gray-900
        ${isFullscreen ? "fixed inset-0 z-50 rounded-none" : ""}
        ${className}
      `}
      style={{ height: isFullscreen ? "100vh" : height }}
    >
      {/* 顶部工具栏 */}
      {showToolbar && (
        <div className="flex items-center justify-between px-3 py-2 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          {/* 左侧：文件名和侧边栏 */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${
                showSidebar ? "bg-gray-200 dark:bg-gray-700" : ""
              }`}
              title="侧边栏"
            >
              <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
              </svg>
            </button>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate max-w-[200px]">
              {fileName}
            </span>
          </div>

          {/* 中间：翻页和缩放 */}
          <div className="flex items-center gap-1">
            {/* 翻页控制 */}
            <div className="flex items-center gap-1 mr-2">
              <button
                onClick={prevPage}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="上一页"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>

              <div className="flex items-center gap-1">
                <input
                  type="number"
                  value={currentPage}
                  onChange={(e) => goToPage(parseInt(e.target.value) || 1)}
                  className="w-10 px-1.5 py-1 text-xs text-center border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  min={1}
                />
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  / {totalPages || "?"}
                </span>
              </div>

              <button
                onClick={nextPage}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="下一页"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />

            {/* 缩放控制 */}
            <div className="flex items-center gap-1">
              <button
                onClick={zoomOut}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="缩小"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </button>

              <select
                value={zoom}
                onChange={(e) => setZoom(parseInt(e.target.value))}
                className="px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {zoomLevels.map((level) => (
                  <option key={level} value={level}>
                    {level}%
                  </option>
                ))}
              </select>

              <button
                onClick={zoomIn}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="放大"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>

              <button
                onClick={setZoomFitWidth}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="适应宽度"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </div>

          {/* 右侧：操作按钮 */}
          <div className="flex items-center gap-1">
            {showPrint && (
              <button
                onClick={handlePrint}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="打印"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </button>
            )}

            {showDownload && (
              <button
                onClick={handleDownload}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="下载"
              >
                <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              </button>
            )}

            {showFullscreen && (
              <button
                onClick={toggleFullscreen}
                className="p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title={isFullscreen ? "退出全屏" : "全屏"}
              >
                {isFullscreen ? (
                  <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                  </svg>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 主内容区 */}
      <div className="flex-1 flex overflow-hidden">
        {/* 侧边栏 */}
        {showSidebar && showToolbar && (
          <div className="w-48 border-r border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex flex-col">
            {/* 侧边栏标签 */}
            <div className="flex border-b border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setSidebarTab("thumbnails")}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  sidebarTab === "thumbnails"
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                缩略图
              </button>
              <button
                onClick={() => setSidebarTab("outline")}
                className={`flex-1 py-2 text-xs font-medium transition-colors ${
                  sidebarTab === "outline"
                    ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px"
                    : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                }`}
              >
                目录
              </button>
            </div>

            {/* 侧边栏内容 */}
            <div className="flex-1 overflow-y-auto p-2">
              {sidebarTab === "thumbnails" && (
                <div className="space-y-2">
                  <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                    缩略图预览
                    <br />
                    <span className="text-[10px]">(需集成pdf.js)</span>
                  </div>
                  {/* 缩略图占位 */}
                  {[1, 2, 3, 4, 5].map((page) => (
                    <div
                      key={page}
                      onClick={() => goToPage(page)}
                      className={`
                        aspect-[3/4] border rounded cursor-pointer overflow-hidden
                        ${currentPage === page
                          ? "border-blue-500 ring-1 ring-blue-500"
                          : "border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500"
                        }
                      `}
                    >
                      <div className="w-full h-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                        <span className="text-xs text-gray-400 dark:text-gray-500">第{page}页</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {sidebarTab === "outline" && (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-center py-4">
                  目录导航
                  <br />
                  <span className="text-[10px]">(需集成pdf.js)</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* PDF内容区 */}
        <div className="flex-1 relative bg-gray-100 dark:bg-gray-800 overflow-auto">
          {/* 加载状态 */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 z-10">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-gray-300 dark:border-gray-600 border-t-blue-500 rounded-full animate-spin mx-auto mb-2" />
                <div className="text-sm text-gray-500 dark:text-gray-400">加载中...</div>
              </div>
            </div>
          )}

          {/* 错误状态 */}
          {loadError && (
            <div className="absolute inset-0 flex items-center justify-center bg-gray-100 dark:bg-gray-800 z-10">
              <div className="text-center">
                <div className="text-4xl mb-2">📄</div>
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  PDF加载失败
                </div>
                <button
                  onClick={() => {
                    setLoadError(false);
                    setIsLoading(true);
                    // 强制重新加载
                    if (iframeRef.current) {
                      iframeRef.current.src = src;
                    }
                  }}
                  className="px-3 py-1.5 text-sm bg-blue-500 text-white rounded hover:bg-blue-600"
                >
                  重新加载
                </button>
              </div>
            </div>
          )}

          {/* PDF iframe */}
          <iframe
            ref={iframeRef}
            src={src}
            title={fileName}
            onLoad={handleLoad}
            onError={handleError}
            className="w-full h-full border-0"
            style={{
              transform: `scale(${zoom / 100})`,
              transformOrigin: "top left",
              width: `${100 * (100 / zoom)}%`,
              height: `${100 * (100 / zoom)}%`,
            }}
          />
        </div>
      </div>

      {/* 底部状态栏 */}
      {showToolbar && (
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            第 {currentPage} 页
          </div>
          <div className="text-xs text-gray-500 dark:text-gray-400">
            {zoom}%
          </div>
        </div>
      )}
    </div>
  );
}

export default PdfViewer;
