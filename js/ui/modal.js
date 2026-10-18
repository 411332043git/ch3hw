/* 確認視窗、底部面板、小選單：共用的彈出元件 */
import { esc } from '../utils/sanitize.js';

function overlay() {
  const o = document.createElement('div');
  o.className = 'overlay';
  document.body.appendChild(o);
  return o;
}

/* 確認視窗。回傳 Promise<boolean>（按主要按鈕才是 true）
   opts: { chip, chipStyle, icon, iconBg, title, text, okText, okStyle, cancelText, single } */
export function confirmDialog(opts) {
  return new Promise((resolve) => {
    const o = overlay();
    const chip = opts.chip ? `<span class="chip ${opts.chipClass || ''}" style="align-self:center;${opts.chipStyle || ''}">${esc(opts.chip)}</span>` : '';
    o.innerHTML = `
      <section class="modal" role="dialog" aria-modal="true" aria-label="${esc(opts.title)}">
        ${chip}
        <span class="mascot" style="background:${opts.iconBg || 'var(--second)'}"><span class="ico lg ${opts.icon || 'i-info'}"></span></span>
        <h2 class="h2">${esc(opts.title)}</h2>
        <p class="p small muted">${esc(opts.text || '')}</p>
        <div class="col gap8">
          <button class="btn block" data-ok style="${opts.okStyle || ''}">${esc(opts.okText || '好')}</button>
          ${opts.single ? '' : `<button class="btn block ghost" data-cancel>${esc(opts.cancelText || '取消')}</button>`}
        </div>
      </section>`;
    const close = (v) => { document.removeEventListener('keydown', onKey); o.remove(); resolve(v); };
    const onKey = (e) => { if (e.key === 'Escape') close(false); };
    document.addEventListener('keydown', onKey);
    o.addEventListener('click', (e) => { if (e.target === o) close(false); });
    o.querySelector('[data-ok]').addEventListener('click', () => close(true));
    const c = o.querySelector('[data-cancel]');
    if (c) c.addEventListener('click', () => close(false));
    o.querySelector('[data-ok]').focus();
  });
}

/* 通用的浮層：回傳 { el, close }。content 是 HTML 字串；cls 是外框 class（sheet 或 modal） */
export function openOverlay(content, { sheet = false, onClose, label = '' } = {}) {
  const o = overlay();
  if (sheet) o.classList.add('sheet-host');
  o.innerHTML = content;
  const close = () => { document.removeEventListener('keydown', onKey); o.remove(); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  o.addEventListener('click', (e) => { if (e.target === o) close(); });
  o.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  if (label) o.setAttribute('aria-label', label);
  return { el: o, close };
}

/* 在某個元素旁邊跳出小選單（點外面關掉）。items: [{ icon, text, danger, onClick, html }] */
export function popMenu(anchor, items, { align = 'right', cls = 'menu', onClose = null } = {}) {
  closeMenus();
  const m = document.createElement('div');
  m.className = cls + ' pop-menu';
  m.setAttribute('role', 'menu');
  m.innerHTML = items.map((it, i) => it.html
    ? `<div class="it" data-i="${i}" role="menuitem">${it.html}</div>`
    : `<button class="it ${it.danger ? 'danger' : ''}" role="menuitem" data-i="${i}" ${it.disabled ? 'disabled style="opacity:.5"' : ''}><span class="ico sm ${it.icon}"></span>${esc(it.text)}</button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  const mw = m.offsetWidth;
  const left = align === 'right' ? Math.max(8, Math.min(window.innerWidth - mw - 8, r.right - mw)) : Math.max(8, Math.min(window.innerWidth - mw - 8, r.left));
  let top = r.bottom + 8;
  if (top + m.offsetHeight > window.innerHeight - 8) top = Math.max(8, r.top - m.offsetHeight - 8);
  m.style.left = left + 'px';
  m.style.top = top + 'px';
  const back = document.createElement('div');
  back.className = 'menu-back';
  document.body.insertBefore(back, m);
  let closed = false;
  const close = () => { if (closed) return; closed = true; m.remove(); back.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', close);
  m.addEventListener('click', (e) => {
    const b = e.target.closest('[data-i]');
    if (!b) return;
    const it = items[Number(b.dataset.i)];
    if (it.keepOpen) { it.onClick && it.onClick(e, b, close); return; }
    close();
    it.onClick && it.onClick(e, b);
  });
  m._close = close;
  return { el: m, close };
}

export function closeMenus() {
  document.querySelectorAll('.pop-menu').forEach((m) => m._close && m._close());
}
