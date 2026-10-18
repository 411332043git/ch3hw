/* 記住暱稱、頭像、主題等小東西。所有讀寫都包 try/catch：瀏覽器擋住儲存時，網站仍然能用（只是不記得）。
   local = 長期記得；session = 只在這個分頁。 */

const PREFIX = 'ch3hw.';

function safe(store) {
  return {
    get(key, fallback = null) {
      try {
        const v = store.getItem(PREFIX + key);
        return v == null ? fallback : JSON.parse(v);
      } catch { return fallback; }
    },
    set(key, value) {
      try { store.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch { return false; }
    },
    remove(key) {
      try { store.removeItem(PREFIX + key); } catch { /* 忽略 */ }
    },
  };
}

function pick(name) {
  try { return window[name]; } catch { return null; }
}

const memory = new Map();
const memStore = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, v),
  removeItem: (k) => memory.delete(k),
};

export const local = safe(pick('localStorage') || memStore);
export const session = safe(pick('sessionStorage') || memStore);

/* 主題 */
export function getTheme() {
  return local.get('theme', 'macaron') === 'night' ? 'night' : 'macaron';
}
export function setTheme(theme) {
  local.set('theme', theme);
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.className = 'theme-' + theme;
}
