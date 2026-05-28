"use client";

export function EmptyDashboard() {
  return (
    <div className="text-center py-16 text-muted-foreground">
      <svg className="h-20 w-20 mx-auto mb-4 opacity-20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
        <polyline points="9 22 9 12 15 12 15 22" />
      </svg>
      <p className="text-sm font-medium">欢迎使用知识库</p>
      <p className="text-xs mt-1">上传你的第一个文件开始使用</p>
    </div>
  );
}
