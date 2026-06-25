"use client";

import React, { useState } from "react";
import { MindMap, Whiteboard, Flowchart, GanttChart } from "@/components/visualization";

type TabType = "mindmap" | "whiteboard" | "flowchart" | "gantt";

export default function VisualizationDemoPage() {
  const [activeTab, setActiveTab] = useState<TabType>("mindmap");

  const tabs: { id: TabType; label: string; icon: string; desc: string }[] = [
    { id: "mindmap", label: "思维导图", icon: "🧠", desc: "发散思维，整理想法" },
    { id: "whiteboard", label: "在线白板", icon: "🎨", desc: "自由绘制，创意无限" },
    { id: "flowchart", label: "流程图", icon: "📊", desc: "流程梳理，逻辑清晰" },
    { id: "gantt", label: "甘特图", icon: "📅", desc: "项目管理，进度跟踪" },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-900 dark:to-gray-800">
      {/* 头部 */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-800 dark:text-white mb-2">
            可视化工具库
          </h1>
          <p className="text-gray-500 dark:text-gray-400">
            思维导图 · 在线白板 · 流程图 · 甘特图 — 一站式可视化解决方案
          </p>
        </div>

        {/* 标签页 */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex bg-white dark:bg-gray-800 rounded-xl p-1 shadow-sm border border-gray-200 dark:border-gray-700">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  px-4 py-2.5 rounded-lg text-sm font-medium transition-all
                  ${activeTab === tab.id
                    ? "bg-blue-500 text-white shadow-sm"
                    : "text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                  }
                `}
              >
                <span className="mr-1.5">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* 工具描述 */}
        <div className="text-center mb-6">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {tabs.find((t) => t.id === activeTab)?.desc}
          </p>
        </div>

        {/* 组件展示区 */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          <div className="h-[650px]">
            {activeTab === "mindmap" && <MindMap height="100%" />}
            {activeTab === "whiteboard" && <Whiteboard height="100%" />}
            {activeTab === "flowchart" && <Flowchart height="100%" />}
            {activeTab === "gantt" && <GanttChart height="100%" />}
          </div>
        </div>

        {/* 功能特性 */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { icon: "🎯", title: "交互丰富", desc: "拖拽、缩放、平移，操作流畅" },
            { icon: "⚡", title: "性能优异", desc: "SVG/Canvas渲染，大数据量不卡顿" },
            { icon: "📱", title: "响应式设计", desc: "适配桌面和移动端" },
            { icon: "🎨", title: "样式美观", desc: "现代化设计，支持深色模式" },
          ].map((feature, i) => (
            <div
              key={i}
              className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm"
            >
              <div className="text-2xl mb-2">{feature.icon}</div>
              <h3 className="font-medium text-gray-800 dark:text-white mb-1">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {feature.desc}
              </p>
            </div>
          ))}
        </div>

        {/* 使用说明 */}
        <div className="mt-8 bg-white dark:bg-gray-800 rounded-2xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
            快速上手
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                思维导图
              </h3>
              <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <li>• 双击节点编辑文字</li>
                <li>• 点击 + 添加子节点</li>
                <li>• 点击 × 删除节点</li>
                <li>• 拖拽节点调整位置</li>
                <li>• 滚轮缩放，拖拽空白平移</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                在线白板
              </h3>
              <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <li>• 选择工具后拖拽绘制</li>
                <li>• 支持画笔、直线、矩形、圆形、箭头</li>
                <li>• 文字工具点击画布输入</li>
                <li>• Ctrl+Z 撤销，Ctrl+Shift+Z 重做</li>
                <li>• 支持导出为PNG图片</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                流程图
              </h3>
              <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <li>• 点击工具栏添加节点</li>
                <li>• 拖拽节点移动位置</li>
                <li>• 选中节点后点击连接点创建连线</li>
                <li>• 选中节点后可编辑文字和删除</li>
                <li>• Alt+拖拽平移视图</li>
              </ul>
            </div>
            <div>
              <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
                甘特图
              </h3>
              <ul className="text-sm text-gray-500 dark:text-gray-400 space-y-1">
                <li>• 拖拽任务条整体移动</li>
                <li>• 拖拽左右边缘调整时间</li>
                <li>• 拖拽进度条调整完成度</li>
                <li>• Ctrl+滚轮缩放时间轴</li>
                <li>• 红色虚线标记今日位置</li>
              </ul>
            </div>
          </div>
        </div>

        {/* 页脚 */}
        <div className="mt-8 text-center text-sm text-gray-400 dark:text-gray-500">
          可视化工具组件库 · laolin-brain
        </div>
      </div>
    </div>
  );
}
