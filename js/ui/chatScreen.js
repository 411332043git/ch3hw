/* 聊天室主畫面（兩個房間共用）：分頁列、標題列、訊息、輸入區；電腦寬度時左邊多一欄（在線名單或站長的對話列表）。 */
import { config } from '../config.js';
import { store } from '../state/store.js';
import { local } from '../utils/storage.js';
import { createTabs, themeItem } from './roomTabs.js';
import { createRoomView } from './roomView.js';
import { createOnlineList, onlineUsers } from './onlinePanel.js';
import { createOwnerInbox } from './ownerInbox.js';
import { ownerDmMenuItems } from './ownerDmMenu.js';
import { popMenu } from './modal.js';
import { confirmDialog } from './modal.js';
import { toast, toastError } from './toast.js';
import { avatarHtml } from '../utils/sanitize.js';

const WIDE = '(min-width: 900px)';

export function chatScreen(ctx, { tab = 'group' } = {}) {
  const owner = store.role === 'owner';
  const el = document.createElement('div');
  el.className = 'app chat';
  el.innerHTML = `
    <aside class="side" aria-label=""></aside>
    <section class="main">
      ${config.backend === 'mock' ? '<div class="demo-bar" role="note"><span class="ico sm i-info"></span>示範模式：訊息只存在你的瀏覽器</div>' : ''}
      <div class="bar peach conn-bar" role="status" style="display:none;margin:6px 12px 0;font-size:13px;"><span class="ico sm i-wifioff"></span><span class="grow conn-text">連線中斷，重新連線中…</span></div>
      <div class="tabs-slot"></div>
      <div class="view-slot"></div>
    </section>`;
  const side = el.querySelector('.side');
  const tabsSlot = el.querySelector('.tabs-slot');
  const viewSlot = el.querySelector('.view-slot');
  const connBar = el.querySelector('.conn-bar');

  const S = {
    tab,
    headerOpen: { group: false, dm: true },
    ownerRoom: null,
    sideCollapsed: local.get('sideCollapsed', { group: false, dm: false }),
  };
  let view = null;
  let inbox = null;
  let sideComp = null;
  const offs = [];
  const mq = window.matchMedia(WIDE);

  const tabs = createTabs({
    onTab: (t) => switchTab(t),
    onToggle: () => {
      S.headerOpen[S.tab] = !S.headerOpen[S.tab];
      tabs.set({ headerOpen: S.headerOpen[S.tab] });
      applyHeader();
    },
  });
  tabsSlot.appendChild(tabs.el);

  function applyHeader() {
    const open = S.headerOpen[S.tab];
    view && view.setHeaderOpen(open);
    el.querySelectorAll('.inbox-header').forEach((h) => { h.hidden = !open; });
  }

  /* ───────── 換分頁 ───────── */
  async function switchTab(t) {
    if (t === S.tab) return;
    if (!owner && t === 'dm' && !store.dmSession) { ctx.go('dmEnter'); return; }
    if (t === 'group' && !(await ctx.ensureGroup())) { ctx.go('join'); return; }
    S.tab = t;
    S.ownerRoom = null;
    store.lastTab = t;
    build();
  }

  /* ───────── 選單 ───────── */
  function visitorGroupMenu(anchor) {
    popMenu(anchor, [
      { icon: 'i-user', text: '換暱稱與頭像', onClick: () => ctx.changeNick() },
      ...(owner ? [{ icon: 'i-gear', text: '設定', onClick: () => ctx.go('ownerSettings') }] : []),
      themeItem(ctx),
      { icon: 'i-left', text: '回到選身分畫面', onClick: () => ctx.go('landing') },
    ]);
  }
  function dmVisitorMenu(anchor) {
    const sess = store.dmSession;
    popMenu(anchor, [
      { icon: 'i-user', text: '換暱稱與頭像', onClick: () => ctx.go('dmProfile') },
      {
        icon: 'i-trash', text: '清空我這邊的畫面',
        onClick: async () => {
          const ok = await confirmDialog({ chip: '只清空我這邊', icon: 'i-trash', iconBg: '#E6D7F5', title: '清空我這邊的畫面？', text: '只有你這邊會變空，縵那邊的對話還在。之後的新訊息仍然會出現。', okText: '清空', cancelText: '先不要' });
          if (!ok) return;
          try {
            await ctx.service.clearMyView({ roomId: sess.roomId });
            await store.loadRoom(sess.roomId);
          } catch (e) { toastError(e); }
        },
      },
      {
        icon: 'i-phone', text: sess && sess.remembered ? '不要記得這個裝置' : '記得這個裝置',
        onClick: async () => {
          try {
            await ctx.service.setDmRemember({ roomId: sess.roomId, remember: !sess.remembered });
            sess.remembered = !sess.remembered;
            toast(sess.remembered ? '這台裝置之後不用再輸入數字' : '之後進「兩個人」要重新輸入數字', { icon: 'i-check' });
          } catch (e) { toastError(e); }
        },
      },
      {
        icon: 'i-logout', text: '忘記我所有的裝置',
        onClick: async () => {
          const ok = await confirmDialog({ chip: '忘記裝置', icon: 'i-logout', iconBg: '#FFD3DF', title: '忘記所有裝置？', text: '所有裝置之後進「兩個人」都要重新輸入名字和數字。', okText: '忘記', okStyle: 'background:#CBEFF0;', cancelText: '先不要' });
          if (!ok) return;
          try { await ctx.service.forgetMyDevices({ roomId: sess.roomId }); sess.remembered = false; toast('已忘記所有裝置', { icon: 'i-check' }); } catch (e) { toastError(e); }
        },
      },
      themeItem(ctx),
      ...(owner ? [{ icon: 'i-gear', text: '設定', onClick: () => ctx.go('ownerSettings') }] : []),
      { icon: 'i-left', text: '回到選身分畫面', onClick: () => ctx.go('landing') },
    ]);
  }

  /* ───────── 建立畫面 ───────── */
  function destroyViews() {
    view && view.destroy(); view = null;
    inbox && inbox.destroy(); inbox = null;
    sideComp && sideComp.destroy && sideComp.destroy(); sideComp = null;
    viewSlot.innerHTML = '';
    side.innerHTML = '';
  }

  function build() {
    destroyViews();
    const wide = mq.matches;
    el.classList.toggle('dm-tab', S.tab === 'dm');
    tabs.set({ tab: S.tab, headerOpen: S.headerOpen[S.tab] });
    store.lastTab = S.tab;

    if (S.tab === 'group') buildGroup(wide);
    else if (owner) buildOwnerDm(wide);
    else buildVisitorDm();
    applyHeader();
    renderSideCollapse();
  }

  function buildGroup(wide) {
    side.setAttribute('aria-label', '在線名單');
    side.dataset.kind = 'group';
    sideComp = createOnlineList({ variant: 'side' });
    side.appendChild(sideComp.el);
    view = createRoomView(ctx, {
      roomId: 'group', kind: 'group', owner: false, headerOpen: S.headerOpen.group,
      onMenu: visitorGroupMenu, onNick: () => ctx.changeNick(),
    });
    viewSlot.appendChild(view.el);
  }

  function buildVisitorDm() {
    side.dataset.kind = 'none';
    view = createRoomView(ctx, {
      roomId: store.dmSession.roomId, kind: 'dm', owner: false, headerOpen: S.headerOpen.dm,
      onMenu: dmVisitorMenu,
    });
    viewSlot.appendChild(view.el);
  }

  function buildOwnerDm(wide) {
    side.dataset.kind = 'inbox';
    side.setAttribute('aria-label', '對話列表');
    const makeInbox = (host) => {
      inbox = createOwnerInbox(ctx, { onOpen: openOwnerRoom });
      host.appendChild(inbox.el);
      inbox.select(S.ownerRoom);
    };
    const inboxHeader = () => {
      const h = document.createElement('div');
      h.className = 'inbox-header';
      h.hidden = !S.headerOpen.dm;
      h.innerHTML = `<div class="topbar dm" style="margin-top:8px;">
        ${avatarHtml(store.ownerProfile.avatar)}
        <div class="col grow" style="min-width:0;"><h1 class="h2" style="font-size:20px;">所有對話</h1></div>
        <button type="button" class="btn-ico sm" data-act="settings" aria-label="設定"><span class="ico i-gear"></span></button>
        <button type="button" class="btn-ico sm" data-act="menu" aria-label="選單"><span class="ico i-more"></span></button></div>`;
      h.addEventListener('click', (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        if (b.dataset.act === 'settings') ctx.go('ownerSettings');
        else popMenu(b, [
          { icon: 'i-user', text: '換暱稱與頭像', onClick: () => ctx.go('ownerProfile') },
          { icon: 'i-gear', text: '設定', onClick: () => ctx.go('ownerSettings') },
          themeItem(ctx),
          { icon: 'i-left', text: '回到選身分畫面', onClick: () => ctx.go('landing') },
        ]);
      });
      return h;
    };
    if (wide) {
      // 左欄：對話列表；右邊：選到的對話
      side.appendChild(inboxHeader());
      const host = document.createElement('div');
      host.style.cssText = 'padding:12px 4px 0;overflow:auto;flex:1;min-height:0;';
      side.appendChild(host);
      makeInbox(host);
      if (S.ownerRoom) mountOwnerRoom(S.ownerRoom); else viewSlot.innerHTML = '<div class="empty-pane"></div>';
    } else if (S.ownerRoom) {
      mountOwnerRoom(S.ownerRoom);
    } else {
      viewSlot.appendChild(inboxHeader());
      const host = document.createElement('div');
      host.style.cssText = 'padding:12px 14px 0;overflow:auto;flex:1;min-height:0;';
      viewSlot.appendChild(host);
      makeInbox(host);
    }
  }

  function mountOwnerRoom(id) {
    view && view.destroy();
    const slot = viewSlot;
    // 手機：整個畫面就是這個對話；電腦：右邊
    slot.innerHTML = '';
    view = createRoomView(ctx, {
      roomId: id, kind: 'dm', owner: true, headerOpen: true,
      onBack: () => { S.ownerRoom = null; store.openDmId = null; build(); },
      onMenu: (anchor) => popMenu(anchor, [{ icon: 'i-user', text: '換暱稱與頭像', onClick: () => ctx.go('ownerProfile') }, ...ownerDmMenuItems(ctx, id, { afterDelete: () => { S.ownerRoom = null; store.openDmId = null; build(); } })]),
    });
    slot.appendChild(view.el);
  }

  function openOwnerRoom(id) {
    S.ownerRoom = id;
    store.openDmId = id;
    if (mq.matches) { inbox && inbox.select(id); mountOwnerRoom(id); } else build();
  }

  /* 電腦版左欄可以收起，只剩一條窄窄的欄 */
  function renderSideCollapse() {
    const kind = side.dataset.kind;
    const collapsed = !!S.sideCollapsed[S.tab] && kind !== 'none';
    el.classList.toggle('side-collapsed', collapsed);
    el.classList.toggle('no-side', kind === 'none');
    side.querySelectorAll('.rail').forEach((r) => r.remove());
    if (collapsed) {
      const rail = document.createElement('div');
      rail.className = 'rail';
      const count = S.tab === 'group' ? onlineUsers().count : store.dms.reduce((n, d) => n + (d.unreadCount || 0), 0);
      rail.innerHTML = `<button class="btn-ico" data-act="expand" aria-label="${S.tab === 'group' ? '展開在線名單' : '展開對話列表'}"><span class="ico ${S.tab === 'group' ? 'i-users' : 'i-chat'}"></span></button>${count ? (S.tab === 'group' ? `<span class="chip mint" style="height:24px;font-size:12px;"><span class="dot"></span>${count}</span>` : `<span class="count">${count}</span>`) : ''}`;
      side.appendChild(rail);
    } else if (kind === 'inbox' && mq.matches) {
      // 對話列表上方補一顆收起鈕
      const h = side.querySelector('.inbox-header .topbar');
      if (h && !h.querySelector('[data-act="collapse"]')) h.insertAdjacentHTML('afterbegin', '<button type="button" class="btn-ico flat sm" data-act="collapse" aria-label="收起對話列表"><span class="ico sm i-left"></span></button>');
    }
  }
  side.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act="collapse"], [data-act="expand"]');
    if (!b) return;
    S.sideCollapsed[S.tab] = b.dataset.act === 'collapse';
    local.set('sideCollapsed', S.sideCollapsed);
    renderSideCollapse();
  });

  /* ───────── 連線狀態條、未讀小圓點 ───────── */
  function updateConn() {
    const off = store.connection !== 'connected';
    connBar.style.display = off ? 'flex' : 'none';
    const n = store.getDrafts(S.tab === 'group' ? 'group' : (store.dmSession ? store.dmSession.roomId : '')).length;
    el.querySelector('.conn-text').textContent = '連線中斷，重新連線中…' + (n ? `（有 ${n} 則暫存訊息）` : '');
  }
  offs.push(store.on('connection', updateConn));
  offs.push(store.on('drafts', updateConn));
  updateConn();

  offs.push(store.on('incoming', (rid, m, t) => {
    if (owner && rid !== 'group') return; // 站長的兩個人分頁用列表上的數字
    const shown = (t === 'group' && S.tab === 'group') || (t === 'dm' && S.tab === 'dm');
    if (!shown) tabs.pip(t);
  }));

  offs.push(store.on('dm:removed', (rid) => {
    if (!owner && store.dmSession === null && S.tab === 'dm') { ctx.go('dmEnter'); }
    else if (owner && S.ownerRoom === rid) { S.ownerRoom = null; build(); }
  }));

  /* 視窗寬度跨過 900 像素：整個重排，不用重新整理 */
  const onMq = () => build();
  mq.addEventListener('change', onMq);

  build();

  return {
    el,
    destroy() {
      destroyViews();
      offs.forEach((f) => f());
      mq.removeEventListener('change', onMq);
      tabs.destroy();
    },
  };
}
