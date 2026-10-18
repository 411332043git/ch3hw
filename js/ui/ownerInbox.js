/* 站長：對話列表（搜尋、置頂、靜音、未讀數、已封鎖標記）。最新有訊息的排最上面。
   長按某個人，或把他往右滑，會出現「置頂／靜音／封鎖」。 */
import { store } from '../state/store.js';
import { avatarHtml, esc } from '../utils/sanitize.js';
import { listTime } from '../utils/time.js';
import { longPress } from '../utils/dom.js';
import { enableSwipe, closeAllSwipes } from '../utils/swipe.js';
import { popMenu } from './modal.js';
import { toast, toastError } from './toast.js';
import { confirmAndDeleteDm } from './ownerDmMenu.js';

const DONE = { 置頂: '已置頂', 取消置頂: '已取消置頂', 靜音: '已靜音：不會有提示音和通知', 取消靜音: '已取消靜音', 封鎖: '已封鎖', 解除封鎖: '已解除封鎖' };

export function createOwnerInbox(ctx, { onOpen }) {
  const el = document.createElement('div');
  el.className = 'col gap8 owner-inbox';
  el.innerHTML = `
    <label class="row gap8 input" style="min-height:46px;padding:0 14px;">
      <span class="ico sm i-search"></span>
      <input type="search" class="q" placeholder="用名字找對話" aria-label="用名字找對話" style="border:none;outline:none;background:none;flex:1;min-width:0;font:inherit;color:inherit;font-weight:600;">
    </label>
    <div class="col gap8 list" role="list" aria-label="對話列表"></div>`;
  const list = el.querySelector('.list');
  const q = el.querySelector('.q');
  let selected = null;
  const swipes = [];

  /* 三個選項：置頂、靜音、封鎖（目前的狀態決定文字） */
  function options(d) {
    return [
      { key: 'pin', icon: 'i-pin', text: d.pinned ? '取消置頂' : '置頂', cls: 'a-pin', run: () => ctx.service.pinDm({ roomId: d.roomId, pinned: !d.pinned }) },
      { key: 'mute', icon: 'i-bell-off', text: d.muted ? '取消靜音' : '靜音', cls: 'a-mute', run: () => ctx.service.muteDm({ roomId: d.roomId, muted: !d.muted }) },
      d.blocked
        ? { key: 'block', icon: 'i-undo', text: '解除封鎖', cls: 'a-block', run: () => ctx.service.unblockDm({ roomId: d.roomId }) }
        : { key: 'block', icon: 'i-ban', text: '封鎖', cls: 'a-block', run: () => ctx.service.blockDm({ roomId: d.roomId }) },
      { key: 'delete', icon: 'i-trash', text: '刪除這個人和他的訊息', cls: 'a-del', danger: true, run: () => confirmAndDeleteDm(ctx, d.roomId, () => { if (store.openDmId === d.roomId) store.openDmId = null; }) },
    ];
  }

  function row(d) {
    const sel = selected === d.roomId ? ' sel' : '';
    const unread = d.unreadCount > 0 ? `<span class="count ${d.muted ? 'muted-count' : ''}" aria-label="${d.unreadCount} 則未讀">${d.unreadCount}</span>` : '';
    const when = d.lastMessageAt ? listTime(d.lastMessageAt) : '';
    const second = d.blocked
      ? '<span class="small nowrap muted">（只有你看得到這個標記）</span>'
      : `<span class="small nowrap ${d.lastMessagePreview ? '' : 'muted'}">${esc(d.lastMessagePreview || '還沒有訊息')}</span>`;
    const icons = `${d.muted ? '<span class="ico sm i-bell-off" role="img" aria-label="已靜音"></span>' : ''}${d.pinned ? '<span class="ico sm i-pin" role="img" aria-label="已置頂"></span>' : ''}`;
    const top = d.blocked
      ? `<div class="row gap6"><b class="nowrap grow">${esc(d.visitorName)}</b>${d.muted ? icons : ''}<span class="chip" style="height:24px;font-size:12px;background:#E3D2C2;"><span class="ico sm i-ban"></span>已封鎖</span></div>`
      : `<div class="row gap6"><b class="nowrap grow">${esc(d.visitorName)}</b>${icons}<span class="tiny muted">${when}</span></div>`;
    const acts = options(d).map((o) => `<button type="button" class="swipe-act ${o.cls}" data-act="${o.key}" data-id="${d.roomId}" aria-label="${o.text}" title="${o.text}"><span class="ico ${o.icon}"></span></button>`).join('');
    return `<div class="swipe-wrap" data-id="${d.roomId}">
      <div class="swipe-actions">${acts}</div>
      <button class="dm-row swipe-body${sel}${d.blocked ? ' blocked' : ''}" role="listitem" data-open="${d.roomId}" style="text-align:left;">
        <span ${d.blocked ? 'style="filter:grayscale(.6);display:inline-flex;"' : 'style="display:inline-flex;"'}>${avatarHtml(d.visitorAvatar)}</span>
        <div class="col grow" style="min-width:0;">${top}${second}</div>${unread}</button>
    </div>`;
  }

  function render() {
    closeAllSwipes();
    const term = q.value.trim().toLowerCase();
    const all = store.dms.filter((d) => !term || d.visitorName.toLowerCase().includes(term));
    // 已封鎖的一律排最下面（就算有置頂也一樣）
    const pinned = all.filter((d) => d.pinned && !d.blocked);
    const rest = all.filter((d) => !(d.pinned && !d.blocked));
    list.innerHTML = (pinned.length ? `<span class="pin-label"><span class="ico sm i-pin"></span>置頂</span>${pinned.map(row).join('')}` : '')
      + (pinned.length && rest.length ? '<span class="pin-label" style="padding-top:8px;">其他對話</span>' : '')
      + rest.map(row).join('');
    swipes.length = 0;
    list.querySelectorAll('.swipe-wrap').forEach((w) => {
      const id = w.dataset.id;
      const body = w.querySelector('.swipe-body');
      const sw = enableSwipe(w, { dir: 'right' });
      swipes.push(sw);
      // 長按：跳出同樣的三個選項
      let longFired = false;
      longPress(body, {
        ms: 500,
        onLong: () => {
          longFired = true;
          const d = store.dms.find((x) => x.roomId === id);
          if (!d) return;
          body.classList.add('pressed');
          popMenu(body, options(d).map((o) => ({ icon: o.icon, text: o.text, danger: !!o.danger, onClick: () => doRun(o) })), { align: 'left', onClose: () => body.classList.remove('pressed') });
        },
      });
      body.addEventListener('click', (e) => {
        if (longFired) { longFired = false; e.preventDefault(); return; }
        if (sw.justDragged) { e.preventDefault(); return; }
        if (sw.isOpen()) { sw.close(); return; }
        onOpen(id);
      }, true);
    });
  }

  async function doRun(o) {
    try {
      await o.run();
    } catch (e) { toastError(e); }
  }

  q.addEventListener('input', render);
  list.addEventListener('click', (e) => {
    const a = e.target.closest('.swipe-act');
    if (!a) return;
    const d = store.dms.find((x) => x.roomId === a.dataset.id);
    const o = d && options(d).find((x) => x.key === a.dataset.act);
    if (o) doRun(o).then(() => { const m = DONE[o.text]; if (m) toast(m, { icon: 'i-check' }); });
  });
  const offs = [store.on('dms', render)];

  async function refresh() {
    const res = await ctx.service.listDms();
    store.dms = res.dms;
    store.sortDms();
    render();
    store.emit('dms');
  }
  refresh();

  return {
    el,
    select(id) { selected = id; render(); },
    destroy() { offs.forEach((f) => f()); },
  };
}
