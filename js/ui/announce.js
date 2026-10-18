/* 公告小花：浮在訊息上面（不佔位置），可以左右拖動；點了看「曾經設為公告的訊息」，點一則跳回原位 */
import { store } from '../state/store.js';
import { avatarHtml, esc } from '../utils/sanitize.js';
import { hhmm, dayLabel } from '../utils/time.js';
import { session } from '../utils/storage.js';
import { enableSwipe } from '../utils/swipe.js';
import { longPress } from '../utils/dom.js';
import { popMenu } from './modal.js';
import { toast, toastError } from './toast.js';

function when(iso) {
  const d = dayLabel(iso);
  return d === '今天' ? hhmm(iso) : `${d} ${hhmm(iso)}`;
}

function preview(m) {
  if (m.text) return `<span class="small" style="overflow-wrap:anywhere;">${esc(m.text)}</span>`;
  if (m.images && m.images.length) return `<span class="small">📷 ${m.images.length > 1 ? m.images.length + ' 張圖片' : '圖片'}</span>`;
  if (m.video) return '<span class="small">🎬 影片</span>';
  if (m.voice) return '<span class="small">🎤 語音</span>';
  if (m.file) return `<span class="small">📎 ${esc(m.file.name)}</span>`;
  return '';
}

export function createAnnounce(ctx, { roomId, onJump }) {
  const row = document.createElement('div');
  row.className = 'announce-row';
  row.innerHTML = '<button class="flower-btn" aria-label="公告紀錄：曾經設為公告的訊息" aria-expanded="false"><span class="flower"></span></button>';
  const btn = row.querySelector('.flower-btn');
  const key = 'flowerX.' + roomId;
  let panel = null;

  /* 左右拖動：記在這個分頁 */
  let x = session.get(key, 0);
  const apply = () => { btn.style.transform = `translateX(${x}px)`; };
  apply();
  let drag = null;
  let moved = false;
  btn.addEventListener('pointerdown', (e) => {
    drag = { sx: e.clientX, x0: x };
    moved = false;
    btn.setPointerCapture(e.pointerId);
  });
  btn.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.sx;
    if (Math.abs(dx) > 4) moved = true;
    const max = Math.max(0, row.clientWidth - btn.offsetWidth - 38);
    x = Math.min(max, Math.max(0, drag.x0 + dx));
    apply();
  });
  const end = () => { if (drag) { session.set(key, x); drag = null; } };
  btn.addEventListener('pointerup', end);
  btn.addEventListener('pointercancel', end);
  btn.addEventListener('click', (e) => {
    if (moved) { moved = false; e.preventDefault(); return; }
    toggle();
  });

  const away = (e) => { if (panel && !panel.contains(e.target) && !btn.contains(e.target) && !e.target.closest('.pop-menu, .menu-back, .overlay')) close(); };
  function close() {
    document.removeEventListener('pointerdown', away, true);
    if (panel) { panel.remove(); panel = null; }
    btn.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
  }
  function toggle() {
    if (panel) { close(); return; }
    const items = store.room(roomId).announcements;
    panel = document.createElement('section');
    panel.className = 'card col announce-panel pop';
    panel.setAttribute('aria-label', '公告紀錄');
    panel.innerHTML = `
      <div class="row gap8"><span class="flower" style="width:26px;height:26px;"></span><h2 class="h2 grow" style="font-size:18px;">曾經設為公告的訊息</h2>
        <button class="btn-ico flat sm" data-act="close" aria-label="關閉"><span class="ico sm i-x"></span></button></div>
      <div class="col gap8 ann-list">
        ${items.length ? items.map((it, i) => `<div class="swipe-wrap ann-wrap" data-id="${esc(it.messageId)}"><div class="swipe-actions right"><button type="button" class="swipe-act a-del" data-del="${esc(it.messageId)}"><span class="ico i-trash"></span><span>刪除</span></button></div><button class="row gap10 ann-item swipe-body ${i === 0 ? 'cur' : ''}" data-id="${esc(it.messageId)}" style="gap:10px;align-items:flex-start;padding:10px 12px;border-radius:20px;text-align:left;">
          ${avatarHtml(it.message.avatar, 'sm')}
          <div class="col grow" style="min-width:0;gap:2px;">
            <div class="row gap6"><b class="nowrap">${esc(it.message.nickname)}</b>${i === 0 ? '<span class="chip mint" style="height:22px;font-size:11.5px;">現在的公告</span>' : ''}</div>
            ${preview(it.message)}
            <span class="tiny muted">訊息 ${when(it.message.createdAt)} · 設為公告 ${when(it.announcedAt)}</span>
          </div></button></div>`).join('') : '<p class="p small muted" style="text-align:center;padding:10px 0;">還沒有公告。長按任何一則訊息，選「設為公告」。</p>'}
      </div>
      ${items.length ? '<p class="p tiny muted" style="text-align:center;">點一則，就會跳到它原本的位置</p>' : ''}`;
    row.appendChild(panel);
    setTimeout(() => document.addEventListener('pointerdown', away, true), 0);
    btn.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    const remove = async (id) => {
      try { await ctx.service.removeAnnouncement({ roomId, messageId: id }); toast('已從公告紀錄刪除', { icon: 'i-check' }); } catch (e) { toastError(e); }
    };
    // 長按或往左滑，可以刪除公告
    const swipes = new Map();
    panel.querySelectorAll('.ann-wrap').forEach((w) => {
      const id = w.dataset.id;
      const body = w.querySelector('.swipe-body');
      const sw = enableSwipe(w, { dir: 'left' });
      swipes.set(id, sw);
      longPress(body, {
        ms: 500,
        onLong: () => {
          body._lp = true;
          body.classList.add('pressed');
          popMenu(body, [{ icon: 'i-trash', text: '刪除這則公告', danger: true, onClick: () => remove(id) }], { align: 'left', onClose: () => body.classList.remove('pressed') });
        },
      });
      body.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    panel.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close"]')) { close(); return; }
      const del = e.target.closest('[data-del]');
      if (del) { remove(del.dataset.del); return; }
      const it = e.target.closest('.ann-item');
      if (it) {
        const id = it.dataset.id;
        const sw = swipes.get(id);
        if (it._lp) { it._lp = false; return; }
        if (sw && sw.justDragged) return;
        if (sw && sw.isOpen()) { sw.close(); return; }
        close(); onJump(id);
      }
    });
  }

  const off = store.on('announcements', (rid) => { if (rid === roomId && panel) { close(); toggle(); } });
  return { el: row, close, destroy() { off(); close(); } };
}
