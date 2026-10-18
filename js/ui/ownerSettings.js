/* 站長：設定（兩個公開開關、提示音、通知、已登入的裝置清單與忘記裝置、登出） */
import { esc } from '../utils/sanitize.js';
import { local } from '../utils/storage.js';
import { listTime } from '../utils/time.js';
import { confirmDialog } from './modal.js';
import { toast, toastError } from './toast.js';
import { store } from '../state/store.js';
import { deviceIconsHtml } from '../utils/deviceIcons.js';

export function ownerSettingsScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'app page';
  el.innerHTML = `
    <div class="topbar">
      <button class="btn-ico sm" data-act="back" aria-label="回對話列表"><span class="ico i-left"></span></button>
      <h1 class="h2 grow" style="font-size:21px;">設定</h1>
    </div>
    <div class="col gap12 settings-body" style="padding:12px 14px 20px;"></div>`;
  const body = el.querySelector('.settings-body');
  let privacy = { showOnline: false, showRead: false };
  let devices = [];

  const sw = (id, on, label) => `<button type="button" class="sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${label}" data-sw="${id}"></button>`;

  function notifBlock() {
    const sup = 'Notification' in window;
    const perm = sup ? Notification.permission : 'denied';
    return `<div class="set-row">
        <span class="ico-bg peach"><span class="ico i-bell"></span></span>
        <div class="col grow"><span class="bold">瀏覽器通知</span><span class="tiny muted">只顯示名字，不顯示訊息內容</span></div>
        ${perm === 'granted' ? '<span class="chip mint">已允許</span>' : perm === 'denied' ? '<span class="chip">已拒絕</span>' : '<button class="btn xs" data-act="notif">允許</button>'}
      </div>
      ${perm === 'denied' ? '<div class="bar peach" style="margin:0 14px 12px;font-size:12.5px;font-weight:700;"><span class="ico sm i-info"></span><span>通知只在網頁開著時有效；如果想允許，請到瀏覽器網址列左邊的鎖頭，把「通知」改成允許。</span></div>' : '<div class="bar peach" style="margin:0 14px 12px;font-size:12.5px;font-weight:700;"><span class="ico sm i-info"></span><span>通知只在網頁開著時有效</span></div>'}`;
  }

  function render() {
    body.innerHTML = `
      <div class="card col" style="border-radius:26px;">
        <div class="set-row"><span class="ico-bg mint"><span class="ico i-eye"></span></span>
          <div class="col grow"><span class="bold">公開我的在線狀態</span><span class="tiny muted">打開後，訪客看得到「縵 在線上」</span></div>${sw('showOnline', privacy.showOnline, '公開我的在線狀態')}</div>
        <div class="set-row"><span class="ico-bg blue"><span class="ico i-check"></span></span>
          <div class="col grow"><span class="bold">公開已讀</span><span class="tiny muted">打開後，訪客看得到你已讀到哪裡</span></div>${sw('showRead', privacy.showRead, '公開已讀')}</div>
        <p class="p tiny muted" style="padding:0 16px 12px;">兩個開關預設都是關的，也就是都不公開</p>
      </div>
      <div class="card col" style="border-radius:26px;">
        <div class="set-row"><span class="ico-bg yellow"><span class="ico i-volume"></span></span>
          <div class="col grow"><span class="bold">提示音</span><span class="tiny muted">只影響自己</span></div>${sw('sound', local.get('ownerSound', true), '提示音')}</div>
        ${notifBlock()}
      </div>
      <div class="card col" style="border-radius:26px;">
        <div class="row" style="padding:12px 16px 6px;"><span class="h2 grow" style="font-size:17px;">已登入的裝置</span><span class="tiny muted">30 天沒用會自動忘記</span></div>
        ${devices.map((d) => d.current
          ? `<div class="set-row" style="border-top:none;"><span class="ico-bg pink dev-bg">${deviceIconsHtml(d.name)}</span>
              <div class="col grow"><span class="bold">${esc(d.name)} <span class="chip mint" style="height:22px;font-size:11.5px;">這台</span></span><span class="tiny muted">現在 · ${d.remembered ? '已記得' : '這次不記得'}</span></div>
              ${sw('remember', d.remembered, '記得這個裝置')}</div>`
          : `<div class="dev"><span class="ico-bg blue dev-bg">${deviceIconsHtml(d.name)}</span>
              <div class="col grow"><span class="bold">${esc(d.name)}</span><span class="tiny muted">${listTime(d.lastUsed)} · ${d.remembered ? '已記得' : '這次不記得'}</span></div>
              <button class="btn xs ghost" data-forget="${esc(d.id)}">忘記此裝置</button></div>`).join('')}
      </div>
      <div class="row gap8">
        <button class="btn sm ghost grow" data-act="others"><span class="ico sm i-logout"></span>登出所有其他裝置</button>
        <button class="btn sm grow" data-act="logout"><span class="ico sm i-logout"></span>登出</button>
      </div>`;
  }

  async function load() {
    try {
      privacy = await ctx.service.getOwnerPrivacy();
      devices = (await ctx.service.listOwnerDevices()).devices;
    } catch (e) { toastError(e); }
    render();
  }

  el.addEventListener('click', async (e) => {
    const s = e.target.closest('[data-sw]');
    if (s) {
      const id = s.dataset.sw;
      const on = s.getAttribute('aria-checked') !== 'true';
      try {
        if (id === 'showOnline' || id === 'showRead') {
          privacy = { ...privacy, [id]: on };
          await ctx.service.setOwnerPrivacy(privacy);
        } else if (id === 'sound') local.set('ownerSound', on);
        else if (id === 'remember') {
          await ctx.service.setRememberThisDevice({ remember: on });
          devices = (await ctx.service.listOwnerDevices()).devices;
        }
        render();
      } catch (err) { toastError(err); }
      return;
    }
    const f = e.target.closest('[data-forget]');
    if (f) {
      const ok = await confirmDialog({ chip: '縵縵已登入的裝置', chipStyle: 'background:#E6D7F5;', icon: 'i-logout', iconBg: '#FFD3DF', title: '忘記這個裝置？', text: '那個裝置會立刻失去站長權限，要重新輸入密碼才能再進來。', okText: '忘記此裝置', okStyle: 'background:#CBEFF0;', cancelText: '先不要' });
      if (!ok) return;
      try { await ctx.service.forgetDevice({ deviceId: f.dataset.forget }); await load(); toast('已忘記那個裝置', { icon: 'i-check' }); } catch (err) { toastError(err); }
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'back') ctx.openChat('dm');
    else if (act === 'notif') {
      if ('Notification' in window) { await Notification.requestPermission(); render(); }
    } else if (act === 'others') {
      const ok = await confirmDialog({ chip: '縵縵登出', icon: 'i-logout', iconBg: '#FFD3DF', title: '登出所有其他裝置？', text: '除了這台，其他裝置都會失去站長權限。', okText: '登出其他裝置', okStyle: 'background:#CBEFF0;', cancelText: '先不要' });
      if (!ok) return;
      try { await ctx.service.signOutOtherDevices(); await load(); toast('已登出其他裝置', { icon: 'i-check' }); } catch (err) { toastError(err); }
    } else if (act === 'logout') {
      try { await ctx.service.ownerLogout(); store.role = 'visitor'; await ctx.refreshSession(); ctx.go('landing'); } catch (err) { toastError(err); }
    }
  });
  load();
  return { el };
}
