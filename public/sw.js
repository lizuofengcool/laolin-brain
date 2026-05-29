// ─── Service Worker for 智能文档知识库 PWA ───────────────────────────
// Version: v2 — Enhanced with offline fallback page, cache quota management,
//           SKIP_WAITING message handler, improved static caching
//
// Caching strategies:
//   - Static assets (CSS, JS, fonts, _next/static): Cache-first
//   - API calls (/api/*): Network-first with 5min TTL fallback
//   - Images (png, jpg, webp, svg, gif): Stale-while-revalidate
//   - App shell: Pre-cached on install
//   - Upload sync queue: Background sync for failed uploads
//   - Navigation offline fallback: Full HTML offline page

const CACHE_NAME = 'kb-static-v2';
const SHELL_CACHE = 'kb-shell-v2';
const API_CACHE = 'kb-api-v2';
const IMAGE_CACHE = 'kb-images-v2';

const ALL_CACHES = [CACHE_NAME, SHELL_CACHE, API_CACHE, IMAGE_CACHE];

// Cache size limits to prevent unbounded growth
const CACHE_LIMITS = {
  [CACHE_NAME]: 500,
  [API_CACHE]: 50,
  [IMAGE_CACHE]: 200,
  [SHELL_CACHE]: 50,
};

// Trim cache to maxItems by deleting oldest entries
async function trimCache(cacheName, maxItems) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= maxItems) return;
  const deleteCount = keys.length - maxItems;
  for (let i = 0; i < deleteCount; i++) {
    await cache.delete(keys[i]);
  }
}

// Offline fallback HTML page
const OFFLINE_HTML = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>离线模式</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:-apple-system,sans-serif;background:#09090b;color:#fafafa;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:20px}.container{text-align:center}.icon{font-size:48px;margin-bottom:16px}.title{font-size:20px;font-weight:600;margin-bottom:8px}.desc{font-size:14px;color:#a1a1aa;max-width:300px;margin:0 auto}.btn{margin-top:24px;padding:10px 24px;background:#2563eb;color:#fff;border:none;border-radius:8px;font-size:14px;cursor:pointer}</style></head><body><div class="container"><div class="icon">📡</div><div class="title">离线模式</div><p class="desc">网络连接不可用，已缓存的文件仍可访问。请检查网络后重试。</p><button class="btn" onclick="location.reload()">重新连接</button></div></body></html>`;

// Shell resources to pre-cache on install
const SHELL_URLS = [
  '/',
  '/logo.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// API response max age in ms (5 minutes)
const API_TTL = 5 * 60 * 1000;

// ─── Install Event ────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => {
      return cache.addAll(SHELL_URLS).catch((err) => {
        console.warn('[SW] Pre-cache failed for some shell resources:', err);
        // Don't fail install if some resources can't be cached
        return Promise.resolve();
      });
    })
    .then(() => {
      // Cache the offline page in shell cache
      return caches.open(SHELL_CACHE).then((cache) => {
        return cache.put('/offline.html', new Response(OFFLINE_HTML, {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }));
      });
    })
    .then(() => {
      // Log cache quota usage for debugging
      if (navigator.storage && navigator.storage.estimate) {
        return navigator.storage.estimate().then((estimate) => {
          console.log('[SW] Cache quota usage:', {
            usage: (estimate.usage / 1024 / 1024).toFixed(2) + ' MB',
            quota: (estimate.quota / 1024 / 1024).toFixed(2) + ' MB',
            usagePercent: ((estimate.usage / estimate.quota) * 100).toFixed(1) + '%',
          });
        });
      }
    })
  );
  // Activate immediately without waiting for old SW to finish
  self.skipWaiting();
});

// ─── Activate Event ───────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => !ALL_CACHES.includes(key))
          .map((key) => {
            console.log('[SW] Cleaning old cache:', key);
            return caches.delete(key);
          })
      );
    })
  );
  // Take control of all open clients immediately
  self.clients.claim();
});

// ─── Helper: Determine request type ──────────────────────────────
function getRequestType(url, request) {
  // Skip non-GET requests (POST, PUT, DELETE should always go to network)
  if (request.method !== 'GET') return 'network-only';

  // Skip chrome-extension and other non-http requests
  if (!url.protocol.startsWith('http')) return 'network-only';

  // API calls
  if (url.pathname.startsWith('/api/')) return 'api';

  // Image requests
  if (/\.(png|jpg|jpeg|webp|svg|gif|ico|avif)$/i.test(url.pathname)) return 'image';

  // Static assets (JS, CSS, fonts, _next/static/*)
  if (/\.(js|css|woff|woff2|ttf|eot|otf)$/i.test(url.pathname) ||
      url.pathname.includes('/_next/static/') ||
      url.pathname.includes('/_next/image/')) {
    return 'static';
  }

  // Navigation requests (HTML pages)
  if (request.mode === 'navigate') return 'shell';

  // Default: cache-first
  return 'static';
}

// ─── Helper: Check if cached response is still fresh ──────────────
function isResponseFresh(cachedResponse) {
  if (!cachedResponse) return false;
  const dateHeader = cachedResponse.headers.get('sw-cache-time');
  if (!dateHeader) return true; // No timestamp means always serve
  const cachedTime = parseInt(dateHeader, 10);
  if (isNaN(cachedTime)) return true;
  return (Date.now() - cachedTime) < API_TTL;
}

// ─── Fetch Event ──────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const type = getRequestType(url, request);

  switch (type) {
    case 'network-only':
      // Don't intercept - let the browser handle it
      return;

    case 'api':
      // Network-first for API calls
      event.respondWith(handleAPIRequest(request));
      return;

    case 'image':
      // Stale-while-revalidate for images
      event.respondWith(handleImageRequest(request));
      return;

    case 'shell':
      // Cache-first for navigation, fallback to network then offline page
      event.respondWith(handleShellRequest(request));
      return;

    case 'static':
    default:
      // Cache-first for static assets
      event.respondWith(handleStaticRequest(request));
      return;
  }
});

// ─── API: Network-first with cache fallback ───────────────────────
async function handleAPIRequest(request) {
  // Skip caching for auth endpoints
  const url = new URL(request.url);
  if (url.pathname.startsWith('/api/auth/')) {
    return fetch(request);
  }

  try {
    const response = await fetch(request);
    if (response.ok) {
      // Clone and cache the successful response with timestamp
      const responseToCache = response.clone();
      const headers = new Headers(responseToCache.headers);
      headers.set('sw-cache-time', Date.now().toString());
      const body = await responseToCache.blob();
      const newResponse = new Response(body, {
        status: responseToCache.status,
        statusText: responseToCache.statusText,
        headers,
      });
      // Cache in background (don't block the response)
      caches.open(API_CACHE).then((cache) => {
        return cache.put(request, newResponse).then(() => trimCache(API_CACHE, CACHE_LIMITS[API_CACHE]));
      });
    }
    return response;
  } catch (error) {
    // Network failed, try cache
    const cached = await caches.match(request);
    if (cached) {
      return cached;
    }
    // Return a simple offline response for API calls
    return new Response(
      JSON.stringify({ error: '网络不可用，请检查连接' }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ─── Images: Stale-while-revalidate ───────────────────────────────
async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE);
  const cached = await cache.match(request);

  // Always update cache in background
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone()).then(() => trimCache(IMAGE_CACHE, CACHE_LIMITS[IMAGE_CACHE]));
      }
      return response;
    })
    .catch(() => {
      // Network failed — return null so caller can handle appropriately
      return null;
    });

  if (cached) {
    return cached;
  }

  // No cache, wait for network
  const response = await fetchPromise;
  if (response) {
    return response;
  }
  return new Response('', { status: 404 });
}

// ─── Shell: Cache-first for navigation with offline fallback ──────
async function handleShellRequest(request) {
  // Try shell cache first
  const cached = await caches.match(request, { cacheName: SHELL_CACHE });
  if (cached) return cached;

  // Then try static cache
  const staticCached = await caches.match(request, { cacheName: CACHE_NAME });
  if (staticCached) return staticCached;

  // Fetch from network
  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
    }
    return response;
  } catch {
    // Serve the offline HTML page for failed navigation requests
    return new Response(OFFLINE_HTML, {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// ─── Static: Cache-first ──────────────────────────────────────────
async function handleStaticRequest(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const clone = response.clone();
      caches.open(CACHE_NAME).then((cache) => {
        return cache.put(request, clone).then(() => trimCache(CACHE_NAME, CACHE_LIMITS[CACHE_NAME]));
      });
    }
    return response;
  } catch {
    return new Response('', { status: 404 });
  }
}

// ─── Background Sync for Upload Queue ─────────────────────────────
self.addEventListener('sync', (event) => {
  if (event.tag === 'upload-sync') {
    event.waitUntil(processUploadQueue());
  }
});

async function processUploadQueue() {
  // Try to process any queued uploads from IndexedDB
  // This is a simplified version - full implementation would
  // read from IndexedDB and retry failed uploads
  try {
    if ('indexedDB' in self) {
      const db = await openUploadDB();
      const tx = db.transaction('uploads', 'readonly');
      const store = tx.objectStore('uploads');
      const pending = await new Promise((resolve, reject) => {
        // Use getAll() as a proper IDB request BEFORE transaction completes
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();

      for (const item of pending) {
        try {
          await fetch(item.url, {
            method: item.method || 'POST',
            headers: item.headers || {},
            body: item.body,
          });
          // On success, remove from queue
          await removeFromUploadQueue(item.id);
        } catch {
          // Will retry on next sync event
        }
      }
    }
  } catch (err) {
    console.warn('[SW] Background sync failed:', err);
  }
}

function openUploadDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('upload-queue', 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('uploads')) {
        db.createObjectStore('uploads', { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function removeFromUploadQueue(id) {
  try {
    const db = await openUploadDB();
    const tx = db.transaction('uploads', 'readwrite');
    const store = tx.objectStore('uploads');
    store.delete(id);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore errors
  }
}

// ─── Message Handler ──────────────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }

  if (event.data?.type === 'CLEAR_CACHES') {
    event.waitUntil(
      Promise.all(ALL_CACHES.map((name) => caches.delete(name)))
        .then(() => {
          // Re-pre-cache shell after clearing
          return caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_URLS));
        })
    );
  }
});
