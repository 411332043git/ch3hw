/* 啟動點：讀設定、挑選 mock 或 supabase、啟動畫面 */
import { config } from './config.js';
import { store } from './state/store.js';
import { getTheme, setTheme as saveTheme } from './utils/storage.js';
import { startMediaHydration } from './utils/mediaStore.js';
import { ERROR_TEXT } from './services/chatService.js';
import { toast } from './ui/toast.js';
import { landingScreen, visitorScreen } from './ui/landingScreen.js';
import { joinScreen } from './ui/joinScreen.js';
import { dmEnterScreen, dmNewScreen } from './ui/dmJoinScreen.js';
import { ownerLoginScreen } from './ui/ownerLogin.js';
import { ownerSettingsScreen } from './ui/ownerSettings.js';
import { chatScreen } from './ui/chatScreen.js';
import { profileScreen } from './ui/profileScreen.js';
import { startOwnerNotify } from './ui/ownerNotify.js';
import { startHaptics } from './utils/haptics.js';

const root = document.getElementById('root');

async function createService() {
  if (config.backend === 'supabase') {
    const m = await import('./services/supabaseService.js');
    const svc = new m.SupabaseService();
    await svc.init();
    return svc;
  }
  const m = await import('./services/mockService.js');
  return new m.MockService();
}

function applyTheme(t) {
  document.documentElement.className = 'theme-' + t;
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = t === 'night' ? '#2F2B3F' : '#FFF8EE';
}

let current = null;
let stopNotify = null;
let joined = false;

const ctx = {
  service: null,
  store,
  root,
  toast,
  toastError(err) {
    const msg = (err && (err.message || ERROR_TEXT[err.code])) || '發生了一點問題，再試一次看看';
    toast(msg, { soft: true });
  },
  setTheme(t) { saveTheme(t); applyTheme(t); },

  mount(screen) {
    if (current && current.destroy) current.destroy();
    current = screen;
    root.replaceChildren(screen.el);
    const first = screen.el.querySelector('input, button');
    if (first && screen.el.classList.contains('landing') === false) { /* 不自動聚焦，避免手機一直跳出鍵盤 */ }
  },

  go(name, params) {
    const map = {
      landing: () => landingScreen(ctx),
      visitor: () => visitorScreen(ctx),
      join: () => joinScreen(ctx),
      dmEnter: () => dmEnterScreen(ctx),
      dmNew: () => dmNewScreen(ctx),
      ownerLogin: () => ownerLoginScreen(ctx),
      ownerSettings: () => ownerSettingsScreen(ctx),
      dmProfile: () => profileScreen(ctx, { mode: 'visitor' }),
      ownerProfile: () => profileScreen(ctx, { mode: 'owner' }),
    };
    ctx.mount((map[name] || map.landing)(params));
    window.scrollTo(0, 0);
  },

  /* 進入「好多人」：還沒join過就先join（用記住的暱稱與頭像），失敗就回到入口畫面 */
  async ensureGroup() {
    if (joined) return true;
    if (!store.profile) return false;
    try {
      const { user } = await ctx.service.join({ nickname: store.profile.nickname, avatar: store.profile.avatar });
      store.userId = user.userId;
      store.setProfile({ nickname: user.nickname, avatar: user.avatar });
      joined = true;
      return true;
    } catch (e) {
      ctx.toastError(e);
      return false;
    }
  },
  markJoined() { joined = true; },

  async enterGroup() {
    if (await ctx.ensureGroup()) ctx.openChat('group'); else ctx.go('join');
  },
  enterDm() {
    if (store.dmSession) ctx.openChat('dm'); else ctx.go('dmEnter');
  },

  async openChat(tab) {
    if (tab === 'group' && !joined) {
      joined = true; // 剛從入口畫面進來
    }
    store.lastTab = tab;
    ctx.mount(chatScreen(ctx, { tab }));
  },

  async changeNick() {
    try { await ctx.service.leave(); } catch { /* 忽略 */ }
    joined = false;
    ctx.go('join');
  },

  async refreshSession() {
    const s = await ctx.service.getSession();
    store.userId = s.userId;
    store.role = s.role;
    store.ownerRemembered = !!(s.owner && s.owner.remembered);
    store.dmSession = s.dm && s.dm.unlocked ? { roomId: s.dm.roomId, name: s.dm.name, avatar: s.dm.avatar, remembered: s.dm.remembered } : null;
    if (s.dm && !store.dmProfile) store.setDmProfile({ name: s.dm.loginName || s.dm.name, avatar: s.dm.avatar });
    if (s.role === 'owner') { try { store.ownerProfile = (await ctx.service.getOwnerProfile()).profile; } catch { /* 用預設 */ } }
    if (s.role === 'owner' && !stopNotify) stopNotify = startOwnerNotify();
    if (s.role !== 'owner' && stopNotify) { stopNotify(); stopNotify = null; }
    return s;
  },

  async afterOwnerLogin() {
    await ctx.refreshSession();
    joined = false;
    ctx.openChat('dm');
  },
};

window.addEventListener('error', (e) => console.error('[error]', e.error || e.message));

/* 手機打開鍵盤時，讓整個畫面縮到鍵盤上方，輸入框不會被擋住 */
if (window.visualViewport) {
  const fit = () => document.documentElement.style.setProperty('--app-h', window.visualViewport.height + 'px');
  window.visualViewport.addEventListener('resize', fit);
  fit();
}

async function boot() {
  applyTheme(getTheme());
  startMediaHydration();
  startHaptics();
  const service = await createService();
  ctx.service = service;
  window.__ch3hw = { ctx, store, service }; // 方便在開發者工具裡看狀態
  store.attach(service);
  const s = await ctx.refreshSession();

  if (s.role === 'owner') {
    if (store.lastTab === 'group' && store.profile && await ctx.ensureGroup()) return ctx.openChat('group');
    return ctx.openChat('dm');
  }
  if (store.lastTab === 'group' && store.profile) {
    if (await ctx.ensureGroup()) return ctx.openChat('group');
  } else if (store.lastTab === 'dm' && store.dmSession) {
    return ctx.openChat('dm');
  }
  ctx.go('landing');
}

boot().catch((e) => {
  console.error(e);
  root.innerHTML = '<div style="padding:24px;font-family:sans-serif;">網站啟動失敗，請重新整理看看。<br><small>' + String(e && e.message || e) + '</small></div>';
});
