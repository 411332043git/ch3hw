/* 一個聊天室的畫面：標題列（可收起）、公告小花、訊息列表、輸入區。「好多人」「兩個人」與縵的一對一對話共用。 */
import { store } from '../state/store.js';
import { avatarHtml, esc } from '../utils/sanitize.js';
import { createMessageList } from './messageList.js';
import { createComposer } from './composer.js';
import { createModeSwitch } from './modeSwitch.js';
import { createOnlineList, onlineUsers } from './onlinePanel.js';
import { createAnnounce } from './announce.js';

/* opts: { roomId, kind: 'group' | 'dm', owner: boolean, headerOpen, onMenu(anchor), onBack, onNick } */
export function createRoomView(ctx, opts) {
  const { roomId, kind, owner = false } = opts;
  const el = document.createElement('div');
  el.className = 'room-view';
  const offs = [];
  const parts = [];

  /* ───────── 標題列 ───────── */
  const header = document.createElement('div');
  header.className = 'room-header';
  header.hidden = !opts.headerOpen;
  const dmInfo = owner ? store.dms.find((d) => d.roomId === roomId) : null;
  let mode = null;
  let onlineList = null;

  if (kind === 'group') {
    header.innerHTML = `
      <div class="topbar grp" style="margin-top:8px;">
        <div class="col grow" style="min-width:0;">
          <h1 class="h2" style="font-size:21px;">好多人</h1>
          <button type="button" class="row gap6 online-btn" aria-expanded="false" style="appearance:none;background:none;border:none;padding:0;min-height:30px;cursor:pointer;color:inherit;font-size:13px;font-weight:800;">
            <span class="dot"></span><span class="online-count"></span><span class="ico sm i-down"></span>
          </button>
        </div>
        <button type="button" class="btn xs ghost" data-act="nick">換暱稱</button>
        <button type="button" class="btn-ico sm" data-act="menu" aria-label="選單"><span class="ico i-more"></span></button>
      </div>
      <div class="online-slot"></div>`;
    const slot = header.querySelector('.online-slot');
    const btn = header.querySelector('.online-btn');
    const count = header.querySelector('.online-count');
    const upd = () => { count.textContent = `${onlineUsers().count} 人在線`; };
    upd();
    offs.push(store.on('presence', upd));
    btn.addEventListener('click', () => {
      const open = btn.getAttribute('aria-expanded') !== 'true';
      btn.setAttribute('aria-expanded', String(open));
      btn.querySelector('.ico').className = 'ico sm ' + (open ? 'i-up' : 'i-down');
      if (open) {
        onlineList = createOnlineList({ variant: 'card' });
        onlineList.el.classList.add('in-header');
        slot.appendChild(onlineList.el);
      } else if (onlineList) { onlineList.destroy(); onlineList.el.remove(); onlineList = null; }
    });
  } else if (!owner) {
    header.innerHTML = `
      <div class="topbar dm" style="margin-top:8px;">
        <span class="owner-face">${avatarHtml(store.ownerProfile.avatar)}</span>
        <div class="col grow" style="min-width:0;">
          <h1 class="h2" style="font-size:20px;">兩個人</h1>
          <span class="row gap6 small bold owner-status"></span>
        </div>
        <span class="mode-slot" style="display:contents;"></span>
        <button type="button" class="btn-ico sm" data-act="menu" aria-label="選單"><span class="ico i-more"></span></button>
      </div>`;
    mode = createModeSwitch(ctx, roomId);
    header.querySelector('.mode-slot').appendChild(mode.el);
    const st = header.querySelector('.owner-status');
    const updSt = () => {
      const s = store.ownerStatus;
      st.innerHTML = s.visible ? (s.online ? '<span class="dot"></span>縵 在線上' : '縵 目前不在線') : '';
      st.style.display = s.visible ? '' : 'none';
    };
    updSt();
    offs.push(store.on('owner', updSt));
    ctx.service.watchOwnerStatus && ctx.service.watchOwnerStatus();
    const face = header.querySelector('.owner-face');
    offs.push(store.on('ownerprofile', () => { face.innerHTML = avatarHtml(store.ownerProfile.avatar); }));
  } else {
    header.innerHTML = `
      <div class="topbar dm" style="margin-top:8px;">
        <button type="button" class="btn-ico sm back-btn" data-act="back" aria-label="回對話列表"><span class="ico i-left"></span></button>
        <span class="owner-av">${avatarHtml(dmInfo ? dmInfo.visitorAvatar : 'bear')}</span>
        <div class="col grow" style="min-width:0;">
          <h1 class="h2 nowrap" style="font-size:20px;">${esc(dmInfo ? dmInfo.visitorName : '')}</h1>
          <span class="tiny bold">一對一對話</span>
        </div>
        <span class="mode-slot" style="display:contents;"></span>
        <button type="button" class="btn-ico sm" data-act="menu" aria-label="選單"><span class="ico i-more"></span></button>
      </div>`;
    mode = createModeSwitch(ctx, roomId);
    header.querySelector('.mode-slot').appendChild(mode.el);
  }
  header.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'menu') opts.onMenu && opts.onMenu(b);
    else if (b.dataset.act === 'nick') opts.onNick && opts.onNick();
    else if (b.dataset.act === 'back') opts.onBack && opts.onBack();
  });

  /* ───────── 公告、訊息、輸入區 ───────── */
  const list = createMessageList(ctx, { roomId, kind });
  const composer = createComposer(ctx, { roomId, kind });
  const announce = createAnnounce(ctx, { roomId, onJump: (id) => list.jumpTo(id) });
  el.appendChild(header);
  el.appendChild(announce.el);
  el.appendChild(list.el);
  el.appendChild(composer.el);

  const setPh = () => composer.setPlaceholder(kind === 'dm' && store.room(roomId).activeSegment ? '說點悄悄話…' : '說話！');
  offs.push(store.on('secret', (rid) => { if (rid === roomId) setPh(); }));
  offs.push(store.on('room:loaded', (rid) => { if (rid === roomId) setPh(); }));

  /* 載入歷史 */
  store.loadRoom(roomId).then(() => {
    setPh();
    if (owner && kind === 'dm') ctx.service.markRead({ roomId });
  }).catch((e) => ctx.toastError(e));

  /* 縵打開著這個對話時，訪客傳來的新訊息也算已讀 */
  if (owner && kind === 'dm') {
    offs.push(store.on('message:added', (rid, m) => {
      if (rid === roomId && m.userId !== store.userId && store.role === 'owner') ctx.service.markRead({ roomId });
    }));
  }

  return {
    el,
    list,
    composer,
    setHeaderOpen(b) { header.hidden = !b; },
    destroy() {
      offs.forEach((f) => f());
      list.destroy(); composer.destroy(); announce.destroy();
      mode && mode.destroy();
      onlineList && onlineList.destroy();
    },
  };
}
