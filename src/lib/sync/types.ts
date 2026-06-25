/**
 * 数据同步增强类型定义
 */

// 同步策略类型
export type SyncStrategy =
  | "full" // 全量同步
  | "incremental" // 增量同步
  | "real_time" // 实时同步
  | "scheduled" // 定时同步
  | "manual" // 手动同步
  | "bidirectional"; // 双向同步

// 冲突解决策略
export type ConflictResolutionStrategy =
  | "last_write_wins" // 最后写入胜出
  | "local_wins" // 本地胜出
  | "remote_wins" // 云端胜出
  | "keep_both" // 保留双方版本
  | "manual" // 手动解决
  | "auto_merge"; // 自动合并（文本文件）

// 同步状态
export type SyncStatus =
  | "idle" // 空闲
  | "syncing" // 同步中
  | "paused" // 已暂停
  | "error" // 错误
  | "conflict" // 有冲突
  | "completed"; // 已完成

// 同步项状态
export type SyncItemStatus =
  | "pending" // 待同步
  | "syncing" // 同步中
  | "synced" // 已同步
  | "failed" // 失败
  | "conflict" // 冲突
  | "skipped"; // 跳过

// 同步方向
export type SyncDirection = "upload" | "download" | "bidirectional";

// 同步项
export interface SyncItem {
  id: string;
  fileId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  fileHash?: string;
  direction: SyncDirection;
  status: SyncItemStatus;
  progress: number; // 0-100
  localModifiedAt?: Date;
  remoteModifiedAt?: Date;
  errorMessage?: string;
  conflictType?: string;
  startedAt?: Date;
  completedAt?: Date;
}

// 同步统计
export interface SyncStatistics {
  totalFiles: number;
  totalSize: number;
  syncedFiles: number;
  syncedSize: number;
  failedFiles: number;
  conflictFiles: number;
  skippedFiles: number;
  uploadSpeed: number; // 字节/秒
  downloadSpeed: number; // 字节/秒
  estimatedTimeRemaining: number; // 秒
}

// 同步配置
export interface SyncConfig {
  strategy: SyncStrategy;
  direction: SyncDirection;
  conflictResolution: ConflictResolutionStrategy;
  autoSync: boolean;
  syncInterval: number; // 分钟
  maxConcurrentUploads: number;
  maxConcurrentDownloads: number;
  chunkSize: number; // 字节
  enableCompression: boolean;
  enableDeduplication: boolean;
  bandwidthLimit?: number; // 字节/秒
  excludePatterns: string[]; // 排除模式
  includePatterns: string[]; // 包含模式
}

// 同步冲突
export interface SyncConflict {
  id: string;
  fileId: string;
  fileName: string;
  filePath: string;
  conflictType: "content" | "metadata" | "delete" | "rename";
  localVersion: {
    modifiedAt: Date;
    size: number;
    hash?: string;
  };
  remoteVersion: {
    modifiedAt: Date;
    size: number;
    hash?: string;
  };
  resolution?: ConflictResolutionStrategy;
  resolvedAt?: Date;
  createdAt: Date;
}

// 同步会话
export interface SyncSession {
  id: string;
  tenantId: string;
  userId: string;
  strategy: SyncStrategy;
  direction: SyncDirection;
  status: SyncStatus;
  items: SyncItem[];
  statistics: SyncStatistics;
  config: SyncConfig;
  startedAt: Date;
  completedAt?: Date;
  errorMessage?: string;
  pausedAt?: Date;
}

// 同步日志
export interface SyncLog {
  id: string;
  sessionId: string;
  fileId: string;
  fileName: string;
  action: "upload" | "download" | "delete" | "update" | "skip" | "conflict";
  status: "success" | "failed" | "skipped";
  size: number;
  duration: number; // 毫秒
  errorMessage?: string;
  timestamp: Date;
}

// 断点续传信息
export interface ResumeInfo {
  fileId: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  uploadedBytes: number;
  uploadId?: string;
  chunkSize: number;
  chunks: {
    index: number;
    status: "pending" | "uploading" | "completed" | "failed";
    etag?: string;
  }[];
  lastModifiedAt: Date;
}

// 默认同步配置
export const DEFAULT_SYNC_CONFIG: SyncConfig = {
  strategy: "incremental",
  direction: "bidirectional",
  conflictResolution: "last_write_wins",
  autoSync: true,
  syncInterval: 5, // 5分钟
  maxConcurrentUploads: 3,
  maxConcurrentDownloads: 3,
  chunkSize: 5 * 1024 * 1024, // 5MB
  enableCompression: true,
  enableDeduplication: true,
  excludePatterns: [
    "**/.DS_Store",
    "**/Thumbs.db",
    "**/node_modules/**",
    "**/.git/**",
  ],
  includePatterns: [],
};

// 同步策略说明
export const SYNC_STRATEGY_INFO = {
  full: {
    name: "全量同步",
    description: "同步所有文件，适合首次同步或完整备份",
    pros: ["数据完整", "简单可靠"],
    cons: ["速度慢", "流量大"],
  },
  incremental: {
    name: "增量同步",
    description: "只同步变更的文件，速度快",
    pros: ["速度快", "流量小"],
    cons: ["需要记录变更"],
  },
  real_time: {
    name: "实时同步",
    description: "文件变更后立即同步",
    pros: ["实时性高", "数据最新"],
    cons: ["资源消耗大"],
  },
  scheduled: {
    name: "定时同步",
    description: "按固定时间间隔同步",
    pros: ["节省资源", "可预测"],
    cons: ["有延迟"],
  },
  manual: {
    name: "手动同步",
    description: "用户手动触发同步",
    pros: ["完全可控", "节省资源"],
    cons: ["需要手动操作"],
  },
  bidirectional: {
    name: "双向同步",
    description: "本地和云端双向同步",
    pros: ["数据一致", "多设备同步"],
    cons: ["冲突处理复杂"],
  },
};

// 冲突解决策略说明
export const CONFLICT_RESOLUTION_INFO = {
  last_write_wins: {
    name: "最后写入胜出",
    description: "最后修改的版本保留",
  },
  local_wins: {
    name: "本地胜出",
    description: "本地版本保留，覆盖云端",
  },
  remote_wins: {
    name: "云端胜出",
    description: "云端版本保留，覆盖本地",
  },
  keep_both: {
    name: "保留双方",
    description: "两个版本都保留，重命名冲突文件",
  },
  manual: {
    name: "手动解决",
    description: "用户手动选择保留哪个版本",
  },
  auto_merge: {
    name: "自动合并",
    description: "自动合并文本文件的内容",
  },
};
