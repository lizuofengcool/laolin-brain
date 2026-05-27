import type { StorageAdapter } from "./base";
import { IndexedDBAdapter } from "./indexeddb";
import { ServerStorageAdapter } from "./server";
import { isTauriEnvironment } from "./tauri";

let _adapter: StorageAdapter | null = null;

/**
 * 获取存储适配器（异步版本）
 * 
 * 优先级：
 * 1. 如果已经创建了适配器实例，直接返回（单例模式）
 * 2. local 模式 + Tauri 环境 → 使用 TauriStorageAdapter（通过 Rust 后端操作本地文件系统）
 * 3. local 模式 → 使用 IndexedDBAdapter（浏览器端 IndexedDB）
 * 4. cloud 模式 → 使用 ServerStorageAdapter（服务器端 API）
 */
export async function getStorageAdapterAsync(
  mode: string
): Promise<StorageAdapter> {
  if (_adapter) return _adapter;

  switch (mode) {
    case "local": {
      // 桌面端优先使用 Tauri 本地存储（通过 Rust 后端）
      if (isTauriEnvironment()) {
        // 动态导入避免在非 Tauri 环境中加载额外依赖
        const { TauriStorageAdapter } = await import("./tauri");
        _adapter = new TauriStorageAdapter();
        break;
      }
      // 浏览器端使用 IndexedDB
      _adapter = new IndexedDBAdapter();
      break;
    }
    case "cloud":
      _adapter = new ServerStorageAdapter();
      break;
    default:
      _adapter = new IndexedDBAdapter();
  }

  return _adapter!;
}

/**
 * 同步版本：获取存储适配器
 * 注意：此版本无法在 Tauri 环境中使用动态导入，如果需要 Tauri 支持，请使用 getStorageAdapterAsync()
 */
export function getStorageAdapter(mode: string): StorageAdapter {
  if (_adapter) return _adapter;

  switch (mode) {
    case "local": {
      _adapter = new IndexedDBAdapter();
      break;
    }
    case "cloud":
      _adapter = new ServerStorageAdapter();
      break;
    default:
      _adapter = new IndexedDBAdapter();
  }

  return _adapter!;
}

export function resetAdapter(): void {
  _adapter = null;
}
