export { IndexedDBAdapter } from "./indexeddb";
export { ServerStorageAdapter } from "./server";
export { TauriStorageAdapter, isTauriEnvironment } from "./tauri";
export { getStorageAdapter, getStorageAdapterAsync, resetAdapter } from "./factory";
export type { StorageAdapter, FileData } from "./base";
