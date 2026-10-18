/* 階段一：圖片、語音、影片、檔案的內容放在瀏覽器的 IndexedDB（localStorage 容量太小）。
   訊息裡只記「檔案編號」。階段二會換成 Supabase Storage 的網址，畫面不用改（畫面只呼叫 mediaUrl）。 */

const DB_NAME = 'ch3hw-media';
const STORE = 'blobs';
let dbPromise = null;
const memory = new Map();
const urlCache = new Map();

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (!('indexedDB' in window)) return resolve(null);
    let req;
    try { req = indexedDB.open(DB_NAME, 1); } catch { return resolve(null); }
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
  return dbPromise;
}

function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const r = fn(t.objectStore(STORE));
    t.oncomplete = () => resolve(r && r.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function putMedia(id, blob) {
  memory.set(id, blob);
  const db = await openDb();
  if (db) { try { await tx(db, 'readwrite', (s) => s.put(blob, id)); } catch { /* 容量不夠時，只留在記憶體 */ } }
  return id;
}

export async function getMedia(id) {
  if (memory.has(id)) return memory.get(id);
  const db = await openDb();
  if (!db) return null;
  try {
    const b = await tx(db, 'readonly', (s) => s.get(id));
    if (b) memory.set(id, b);
    return b || null;
  } catch { return null; }
}

export async function deleteMedia(id) {
  memory.delete(id);
  const u = urlCache.get(id);
  if (u) { URL.revokeObjectURL(u); urlCache.delete(id); }
  const db = await openDb();
  if (db) { try { await tx(db, 'readwrite', (s) => s.delete(id)); } catch { /* 忽略 */ } }
}

/* 取得可以放進 <img>、<video>、<audio> 的網址；找不到檔案回傳 null */
export async function mediaUrl(id) {
  if (!id) return null;
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await getMedia(id);
  if (!b) return null;
  const u = URL.createObjectURL(b);
  urlCache.set(id, u);
  return u;
}

/* 畫面上有 data-media-src="檔案編號" 的 <img>、<video>、<audio>，自動換成真正的網址。
   階段二換成 Supabase 網址時，只要改這個函式。 */
async function hydrateOne(node) {
  if (node.dataset.hydrated) return;
  node.dataset.hydrated = '1';
  const id = node.dataset.mediaSrc;
  const url = await mediaUrl(id);
  if (!url) { missing(node); return; }
  node.src = url;
  node.addEventListener('error', () => missing(node), { once: true });
}
function missing(node) {
  if (!node.isConnected) return;
  const label = node.dataset.mediaMissing || '圖片無法顯示';
  if (node.dataset.mediaKeep) { node.classList.add('is-missing'); return; }
  const s = document.createElement('span');
  s.className = 'media-missing tiny muted';
  s.textContent = label;
  node.replaceWith(s);
}
async function hydratePoster(node) {
  if (node.dataset.posterDone) return;
  node.dataset.posterDone = '1';
  const url = await mediaUrl(node.dataset.mediaPoster);
  if (url) node.poster = url;
}

export function startMediaHydration() {
  const scan = (root) => {
    if (root.nodeType !== 1) return;
    if (root.matches && root.matches('[data-media-src]')) hydrateOne(root);
    if (root.matches && root.matches('[data-media-poster]')) hydratePoster(root);
    root.querySelectorAll && root.querySelectorAll('[data-media-src]').forEach(hydrateOne);
    root.querySelectorAll && root.querySelectorAll('[data-media-poster]').forEach(hydratePoster);
  };
  new MutationObserver((list) => list.forEach((r) => r.addedNodes.forEach(scan))).observe(document.body, { childList: true, subtree: true });
  scan(document.body);
}
