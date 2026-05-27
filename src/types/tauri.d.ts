/**
 * Tauri 全局类型声明
 * 声明 window.__TAURI__ 对象的类型，供 TypeScript 使用
 * 注意：Tauri npm 包未安装时，这些类型声明提供基本的类型安全保障
 */

declare global {
  interface Window {
    /** Tauri 注入的全局对象（仅在 Tauri 桌面环境中存在） */
    __TAURI__?: {
      core: {
        invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
      };
      event: {
        listen<T>(
          event: string,
          handler: (event: { payload: T }) => void
        ): Promise<() => void>;
        emit(event: string, payload?: unknown): Promise<void>;
      };
      path: {
        appDataDir(): Promise<string>;
        homeDir(): Promise<string>;
        documentDir(): Promise<string>;
      };
    };
  }
}

/** 声明 @tauri-apps/api/core 模块，避免动态导入时的 TypeScript 错误 */
declare module "@tauri-apps/api/core" {
  export function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
}

export {};
