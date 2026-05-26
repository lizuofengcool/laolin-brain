import type { StorageAdapter } from "./base";
import { IndexedDBAdapter } from "./indexeddb";
import { ServerStorageAdapter } from "./server";

let _adapter: StorageAdapter | null = null;

export function getStorageAdapter(mode: string): StorageAdapter {
  if (_adapter) return _adapter;

  switch (mode) {
    case "local":
      _adapter = new IndexedDBAdapter();
      break;
    case "cloud":
      _adapter = new ServerStorageAdapter();
      break;
    default:
      _adapter = new IndexedDBAdapter();
  }

  return _adapter;
}

export function resetAdapter(): void {
  _adapter = null;
}
