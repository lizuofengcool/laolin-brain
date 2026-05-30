// Offline operation queue with IndexedDB persistence

export interface OfflineOperation {
  id: string;
  type: 'rename' | 'delete' | 'favorite' | 'updateTags' | 'moveToFolder';
  fileId: string;
  userId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

const DB_NAME = 'knowledge-base-db';
const STORE_NAME = 'offline_queue';
const DB_VERSION = 3; // Match the main DB version

async function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function addToOfflineQueue(op: Omit<OfflineOperation, 'id' | 'createdAt'>): Promise<void> {
  const db = await getDB();
  const entry: OfflineOperation = {
    ...op,
    id: `op_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    createdAt: new Date().toISOString(),
  };
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getOfflineQueue(): Promise<OfflineOperation[]> {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function removeFromOfflineQueue(id: string): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function clearOfflineQueue(): Promise<void> {
  const db = await getDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function processOfflineQueue(): Promise<{ processed: number; failed: number }> {
  const operations = await getOfflineQueue();
  if (operations.length === 0) return { processed: 0, failed: 0 };

  let processed = 0;
  let failed = 0;

  for (const op of operations) {
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('kb_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const response = await fetch(`/api/files/${op.fileId}`, {
        method: op.type === 'delete' ? 'DELETE' : 'PATCH',
        headers,
        body: op.type !== 'delete' ? JSON.stringify(op.payload) : undefined,
      });

      if (response.ok) {
        processed++;
        await removeFromOfflineQueue(op.id);
      } else {
        failed++;
      }
    } catch {
      failed++;
    }
  }

  return { processed, failed };
}

export async function getOfflineQueueCount(): Promise<number> {
  const operations = await getOfflineQueue();
  return operations.length;
}
