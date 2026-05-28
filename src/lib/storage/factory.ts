import type { StorageAdapter } from "./base";
import { IndexedDBAdapter } from "./indexeddb";
import { ServerStorageAdapter } from "./server";
import { isTauriEnvironment } from "./tauri";

let _adapter: StorageAdapter | null = null;
let _pendingPromise: Promise<StorageAdapter> | null = null;
let _generation = 0;

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
  // Return existing adapter if still valid (generation hasn't changed)
  if (_adapter) return _adapter;

  // If an async creation is already in progress, await it
  if (_pendingPromise) return _pendingPromise;

  const gen = ++_generation;

  // Start async creation and store the promise to guard against concurrent calls
  _pendingPromise = (async () => {
    switch (mode) {
      case "local": {
        if (isTauriEnvironment()) {
          const { TauriStorageAdapter } = await import("./tauri");
          _adapter = new TauriStorageAdapter();
          break;
        }
        _adapter = new IndexedDBAdapter();
        break;
      }
      case "cloud":
        _adapter = new ServerStorageAdapter();
        break;
      default:
        _adapter = new IndexedDBAdapter();
    }
    _pendingPromise = null;
    // If adapter was reset during creation, discard and retry
    if (gen !== _generation) {
      _adapter = null;
      return getStorageAdapterAsync(mode);
    }
    return _adapter!;
  })();

  return _pendingPromise;
}

/**
 * 同步版本：获取存储适配器
 * 注意：Tauri 适配器需要异步动态导入，因此同步版本无法在首次调用时使用 Tauri。
 * 如果在 Tauri 环境中需要使用 Tauri 适配器，请使用 getStorageAdapterAsync()。
 * 此版本在 Tauri 环境中会返回 IndexedDB 作为即时降级方案，
 * 后续调用（若适配器已由异步版本初始化）会正确返回 Tauri 适配器。
 */
export function getStorageAdapter(mode: string): StorageAdapter {
  if (_adapter) return _adapter;

  switch (mode) {
    case "local": {
      // Tauri 环境下同步版本无法动态导入，返回 IndexedDB 作为即时降级
      // 提示：首次初始化时应使用 getStorageAdapterAsync() 以获得 Tauri 支持
      if (isTauriEnvironment()) {
        console.warn(
          '[Storage] 同步 getStorageAdapter() 在 Tauri 环境中无法使用 Tauri 适配器。' +
          '请改用 getStorageAdapterAsync() 以获得完整的本地文件系统支持。' +
          '当前降级为 IndexedDB 适配器。'
        );
      }
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
  _generation++;
  _adapter = null;
  _pendingPromise = null;
}
