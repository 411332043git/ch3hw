/* 很小的 DOM 工具：用 HTML 字串做畫面，所有使用者文字一律先 esc() */

export function html(strings, ...vals) {
  let out = '';
  strings.forEach((s, i) => { out += s + (i < vals.length ? vals[i] : ''); });
  return out;
}

export function el(htmlString) {
  const t = document.createElement('template');
  t.innerHTML = htmlString.trim();
  return t.content.firstElementChild;
}

export function qs(root, sel) { return root.querySelector(sel); }
export function qsa(root, sel) { return [...root.querySelectorAll(sel)]; }

/* 事件代理：root 底下符合 selector 的元素被點到時呼叫 fn(e, target) */
export function delegate(root, type, selector, fn) {
  root.addEventListener(type, (e) => {
    const t = e.target.closest(selector);
    if (t && root.contains(t)) fn(e, t);
  });
}

/* 長按：按住 ms 毫秒後觸發 onLong；一般點一下觸發 onTap（長按後不會再觸發 onTap） */
export function longPress(node, { onLong, onTap, onEnd, ms = 500, moveTolerance = 12 }) {
  let timer = null;
  let fired = false;
  let sx = 0, sy = 0;
  let active = false;
  const cancel = () => { clearTimeout(timer); timer = null; };
  node.addEventListener('pointerdown', (e) => {
    if (e.button && e.button !== 0) return;
    fired = false;
    active = true;
    sx = e.clientX; sy = e.clientY;
    cancel();
    timer = setTimeout(() => { fired = true; onLong && onLong(e); }, ms);
  });
  node.addEventListener('pointermove', (e) => {
    if (!timer) return;
    if (Math.hypot(e.clientX - sx, e.clientY - sy) > moveTolerance) cancel();
  });
  const up = (e) => {
    if (!active) return;
    active = false;
    cancel();
    if (fired) { onEnd && onEnd(e, false); }
    else if (e.type === 'pointerup') { onTap && onTap(e); }
  };
  node.addEventListener('pointerup', up);
  node.addEventListener('pointercancel', (e) => { active = false; cancel(); if (fired) onEnd && onEnd(e, true); });
  node.addEventListener('pointerleave', (e) => { if (!fired) cancel(); });
  node.addEventListener('contextmenu', (e) => { e.preventDefault(); });
}

export function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
export function rand(min, max) { return Math.floor(min + Math.random() * (max - min)); }
export function pickOne(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

/* 簡單的事件發射器 */
export class Emitter {
  constructor() { this._l = new Map(); }
  on(ev, fn) {
    if (!this._l.has(ev)) this._l.set(ev, new Set());
    this._l.get(ev).add(fn);
    return () => this._l.get(ev).delete(fn);
  }
  emit(ev, ...args) {
    const set = this._l.get(ev);
    if (!set) return;
    [...set].forEach((fn) => { try { fn(...args); } catch (e) { console.error(`[${ev}]`, e); } });
  }
}

/* 相機與麥克風只能在 https（或本機 localhost）使用；用區域網路的 http 網址在手機上會被瀏覽器擋住 */
export function insecureMedia() {
  return typeof window.isSecureContext === 'boolean' && !window.isSecureContext;
}
