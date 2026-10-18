/* Emoji 面板（輸入區用，只有電腦與筆電會跳出；手機按笑臉改用手機鍵盤的 Emoji） */
import { QUICK } from '../data/emoji.js';

export function isDesktopPointer() {
  return window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches;
}

/* host: 輸入區元素（要 position: relative）。回傳 { close, el } */
export function openEmojiPanel(host, { onPick, onClose }) {
  const p = document.createElement('div');
  p.className = 'emoji-panel card pop';
  p.setAttribute('role', 'dialog');
  p.setAttribute('aria-label', 'Emoji 面板');
  p.innerHTML = `<div class="emoji-grid eight">${QUICK.map((e) => `<button type="button" class="emo" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`;
  host.appendChild(p);
  const close = () => {
    document.removeEventListener('pointerdown', away, true);
    document.removeEventListener('keydown', onKey);
    p.remove();
    onClose && onClose();
  };
  const away = (e) => { if (!p.contains(e.target) && !e.target.closest('.in-emoji')) close(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
  document.addEventListener('keydown', onKey);
  p.addEventListener('click', (e) => {
    const b = e.target.closest('[data-e]');
    if (!b) return;
    onPick(b.dataset.e);
    close();
  });
  return { close, el: p };
}
