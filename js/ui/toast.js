/* 短暫提示與狀態條 */
import { esc } from '../utils/sanitize.js';

let host = null;
function getHost() {
  if (host && host.isConnected) return host;
  host = document.createElement('div');
  host.className = 'toasts';
  host.setAttribute('role', 'status');
  host.setAttribute('aria-live', 'polite');
  document.body.appendChild(host);
  return host;
}

/* soft: 淺色提示；icon: 圖示 class，例如 i-info */
export function toast(text, { soft = false, icon = 'i-info', ms = 2200 } = {}) {
  const h = getHost();
  const t = document.createElement('span');
  t.className = 'toast' + (soft ? ' soft' : '') + ' pop';
  t.innerHTML = `<span class="ico sm ${icon}"></span>${esc(text)}`;
  h.appendChild(t);
  while (h.children.length > 3) h.firstChild.remove();
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, ms);
}

/* 按畫面上任何地方，提示就馬上消失（不用等它自己消失） */
document.addEventListener('pointerdown', () => {
  if (host && host.isConnected) host.querySelectorAll('.toast').forEach((t) => t.remove());
}, true);

export function toastError(err) {
  const msg = err && err.message ? err.message : '發生了一點問題，再試一次看看';
  toast(msg, { soft: true, icon: 'i-info' });
}
