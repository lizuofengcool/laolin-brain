"use client";

import React, { useState } from "react";
import { ImageEditor } from "@/components/media/ImageEditor";
import { PdfViewer } from "@/components/media/PdfViewer";
import { AudioPlayer, AudioTrack } from "@/components/media/AudioPlayer";
import { VideoPlayer, VideoTrack } from "@/components/media/VideoPlayer";

// ==================== 示例数据 ====================

// 示例音频列表
const sampleAudioTracks: AudioTrack[] = [
  {
    id: "1",
    title: "示例音乐 1",
    artist: "未知艺术家",
    album: "示例专辑",
    src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    duration: 372,
  },
  {
    id: "2",
    title: "示例音乐 2",
    artist: "未知艺术家",
    src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    duration: 425,
  },
  {
    id: "3",
    title: "示例音乐 3",
    artist: "未知艺术家",
    src: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
    duration: 398,
  },
];

// 示例视频列表
const sampleVideoTracks: VideoTrack[] = [
  {
    id: "1",
    title: "示例视频 1",
    description: "Big Buck Bunny - 开源动画短片",
    thumbnail: "https://peach.blender.org/wp-content/uploads/title_anouncement.jpg?x11217",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
    duration: 596,
    resolution: "1080p",
  },
  {
    id: "2",
    title: "示例视频 2",
    description: "Elephant Dream - 开源动画短片",
    src: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
    duration: 653,
    resolution: "1080p",
  },
];

// 示例图片
const sampleImage = "https://picsum.photos/800/600";

// 示例PDF
const samplePdf = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

// ==================== 页面组件 ====================

export default function MediaPreviewPage() {
  const [activeTab, setActiveTab] = useState<"image" | "pdf" | "audio" | "video">("image");

  const tabs = [
    { id: "image", label: "图片编辑器", icon: "🖼️" },
    { id: "pdf", label: "PDF查看器", icon: "📄" },
    { id: "audio", label: "音频播放器", icon: "🎵" },
    { id: "video", label: "视频播放器", icon: "🎬" },
  ] as const;

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* 页面标题 */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          多媒体预览
        </h1>
        <p className="text-gray-500 dark:text-gray-400">
          图片编辑、PDF查看、音频播放、视频播放 - 一站式多媒体处理
        </p>
      </div>

      {/* 标签页切换 */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap
              ${activeTab === tab.id
                ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-500 -mb-px"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
              }
            `}
          >
            <span className="mr-1.5">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="space-y-6">
        {/* 图片编辑器 */}
        {activeTab === "image" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                在线图片编辑器
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                支持裁剪、旋转、滤镜、调整等功能
              </div>
            </div>

            <ImageEditor
              src={sampleImage}
              height="600px"
              onSave={(blob, fileName) => {
                console.log("Save image:", fileName, blob.size);
                alert(`图片已保存: ${fileName} (${Math.round(blob.size / 1024)} KB)`);
              }}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FeatureCard
                icon="🎨"
                title="10种滤镜"
                desc="黑白、复古、冷色调等"
              />
              <FeatureCard
                icon="🎛️"
                title="8项调整"
                desc="亮度、对比度、饱和度等"
              />
              <FeatureCard
                icon="🔄"
                title="变换操作"
                desc="旋转、翻转、缩放"
              />
              <FeatureCard
                icon="💾"
                title="多格式导出"
                desc="PNG、JPEG、WebP"
              />
            </div>
          </div>
        )}

        {/* PDF查看器 */}
        {activeTab === "pdf" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                在线PDF查看器
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                支持翻页、缩放、打印、下载等功能
              </div>
            </div>

            <PdfViewer
              src={samplePdf}
              fileName="示例文档.pdf"
              height="600px"
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FeatureCard
                icon="📖"
                title="多页支持"
                desc="翻页、跳转、页码"
              />
              <FeatureCard
                icon="🔍"
                title="缩放控制"
                desc="放大、缩小、适应宽度"
              />
              <FeatureCard
                icon="🖨️"
                title="打印下载"
                desc="一键打印、下载"
              />
              <FeatureCard
                icon="📱"
                title="全屏模式"
                desc="沉浸式阅读"
              />
            </div>
          </div>
        )}

        {/* 音频播放器 */}
        {activeTab === "audio" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                在线音频播放器
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                支持播放列表、播放模式、音频可视化
              </div>
            </div>

            <AudioPlayer
              tracks={sampleAudioTracks}
              height="500px"
              showPlaylist={true}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FeatureCard
                icon="🎵"
                title="播放列表"
                desc="多曲目管理"
              />
              <FeatureCard
                icon="🔀"
                title="4种模式"
                desc="顺序、循环、随机、单曲"
              />
              <FeatureCard
                icon="📊"
                title="音频可视化"
                desc="动态波形动画"
              />
              <FeatureCard
                icon="📱"
                title="迷你模式"
                desc="紧凑播放器"
              />
            </div>
          </div>
        )}

        {/* 视频播放器 */}
        {activeTab === "video" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                在线视频播放器
              </h2>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                支持全屏、画中画、截图、播放速度
              </div>
            </div>

            <VideoPlayer
              tracks={sampleVideoTracks}
              height="500px"
              showPlaylist={true}
            />

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <FeatureCard
                icon="🎬"
                title="播放列表"
                desc="多视频管理"
              />
              <FeatureCard
                icon="📺"
                title="画中画"
                desc="悬浮小窗播放"
              />
              <FeatureCard
                icon="📸"
                title="一键截图"
                desc="保存精彩瞬间"
              />
              <FeatureCard
                icon="⚡"
                title="倍速播放"
                desc="0.25x - 2x"
              />
            </div>
          </div>
        )}
      </div>

      {/* 底部说明 */}
      <div className="mt-8 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          功能说明
        </h3>
        <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          <li>• 所有组件均使用原生HTML API实现，无需额外依赖</li>
          <li>• 支持深色/浅色主题自动切换</li>
          <li>• 响应式设计，适配桌面和移动端</li>
          <li>• 完整的TypeScript类型支持</li>
          <li>• 可直接集成到文件预览功能中</li>
        </ul>
      </div>
    </div>
  );
}

// ==================== 子组件 ====================

interface FeatureCardProps {
  icon: string;
  title: string;
  desc: string;
}

function FeatureCard({ icon, title, desc }: FeatureCardProps) {
  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <div className="text-2xl mb-2">{icon}</div>
      <div className="text-sm font-medium text-gray-900 dark:text-white mb-1">
        {title}
      </div>
      <div className="text-xs text-gray-500 dark:text-gray-400">
        {desc}
      </div>
    </div>
  );
}
