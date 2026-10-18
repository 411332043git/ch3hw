/* 站長登入、第一次建立帳號、「要記得這個裝置嗎」詢問（示範版：隨便輸入都能登入） */
import { config } from '../config.js';
import { esc, avatarHtml } from '../utils/sanitize.js';
import { validateEmail } from '../utils/validators.js';
import { confirmDialog } from './modal.js';
import { store } from '../state/store.js';

export function ownerLoginScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'app page';
  let mode = 'login';
  el.innerHTML = `
    ${config.backend === 'mock' ? '<div class="demo-bar" role="note"><span class="ico sm i-info"></span>示範模式：帳號密碼只記在這個瀏覽器裡</div>' : ''}
    <div class="row gap8" style="padding:14px 16px 0;">
      <button class="btn-ico" data-act="back" aria-label="回上一頁"><span class="ico i-left"></span></button>
      <span class="grow"></span>
    </div>
    <div class="col" style="align-items:center;gap:8px;padding:10px 24px 0;text-align:center;">
      ${avatarHtml('mm', 'xl')}
      <h1 class="title">縵縵登入</h1>
    </div>
    <form class="card col gap16" style="margin:16px 16px 0;padding:18px;" novalidate>
      <div class="field">
        <label class="label" for="em">帳號（Email）</label>
        <input class="input" id="em" type="email" autocomplete="username" inputmode="email">
      </div>
      <div class="field">
        <label class="label" for="pw">密碼<button type="button" class="link" data-act="eye" style="min-height:28px;padding:0 2px;font-size:13px;"><span class="ico sm i-eye" style="vertical-align:-3px;"></span> 顯示</button></label>
        <input class="input" id="pw" type="password" autocomplete="current-password">
      </div>
      <div class="field claim-only" style="display:none;">
        <label class="label" for="pw2">確認密碼</label>
        <input class="input" id="pw2" type="password" autocomplete="new-password">
        <span class="hint">密碼至少 8 個字元，兩次要一樣</span>
      </div>
      <span class="msg-err form-err" role="alert" style="display:none;"></span>
      <button class="btn block go c-pinkbtn" type="submit"><span class="ico sm i-key"></span><span class="go-text">登入</span></button>
    </form>
    <div class="grow"></div>
    <div class="row" style="justify-content:space-between;padding:0 24px 20px;">
      <button type="button" class="link" data-mode="claim">第一次登入</button>
      <button type="button" class="link" data-act="forgot">忘記密碼</button>
    </div>`;
  const form = el.querySelector('form');
  const err = el.querySelector('.form-err');
  const go = el.querySelector('.go');
  const em = el.querySelector('#em');
  const pw = el.querySelector('#pw');
  const pw2 = el.querySelector('#pw2');
  function showErr(t) { err.style.display = t ? 'flex' : 'none'; err.innerHTML = t ? `<span class="ico sm i-info"></span>${esc(t)}` : ''; }
  function setMode(m) {
    mode = m;
    const sw = el.querySelector('.row [data-mode]');
    sw.dataset.mode = m === 'claim' ? 'login' : 'claim';
    sw.textContent = m === 'claim' ? '回到登入' : '第一次登入';
    el.querySelector('.title').textContent = m === 'claim' ? '建立縵縵帳號' : '縵縵登入';
    el.querySelector('.claim-only').style.display = m === 'claim' ? 'flex' : 'none';
    el.querySelector('.go-text').textContent = m === 'claim' ? '建立站長帳號' : '登入';
    pw.autocomplete = m === 'claim' ? 'new-password' : 'current-password';
    showErr('');
  }
  el.addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]');
    if (m) { setMode(m.dataset.mode); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'back') ctx.go('landing');
    else if (b.dataset.act === 'forgot') ctx.toast('示範模式沒有寄信功能，正式版會寄重設連結到你的 Email', { icon: 'i-info' });
    else if (b.dataset.act === 'eye') {
      const show = pw.type === 'password';
      pw.type = pw2.type = show ? 'text' : 'password';
      b.innerHTML = `<span class="ico sm i-eye" style="vertical-align:-3px;"></span> ${show ? '隱藏' : '顯示'}`;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    showErr('');
    if (!validateEmail(em.value)) { showErr(mode === 'claim' ? '請輸入 Email 格式的帳號' : '帳號或密碼不對'); return; }
    if (mode === 'claim') {
      if (pw.value.length < 8) { showErr('密碼至少要 8 個字元'); return; }
      if (pw.value !== pw2.value) { showErr('兩次輸入的密碼不一樣'); return; }
    } else if (!pw.value) { showErr('帳號或密碼不對'); return; }
    go.disabled = true;
    try {
      const email = em.value.trim();
      if (mode === 'claim') await ctx.service.ownerClaim({ email, password: pw.value, rememberDevice: false });
      else await ctx.service.ownerLogin({ email, password: pw.value, rememberDevice: false });
      // 登入或建立成功後，立刻問「要記得這個裝置嗎？」
      const remember = await confirmDialog({
        chip: '縵縵登入後', chipClass: 'yellow', icon: 'i-phone', iconBg: 'var(--second)',
        title: '要記得這個裝置嗎？', text: '下次不用再輸入密碼。之後可以在設定裡更改。',
        okText: '記得', cancelText: '這次先不要',
      });
      if (remember) await ctx.service.setRememberThisDevice({ remember: true });
      store.role = 'owner';
      ctx.afterOwnerLogin();
    } catch (e2) {
      showErr(e2.code === 'claim_closed' ? '無法建立站長帳號' : e2.code === 'login_failed' ? '帳號或密碼不對' : e2.message);
      go.disabled = false;
    }
  });
  return { el };
}
