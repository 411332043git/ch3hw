/* 「兩個人」的進入畫面（名字＋數字）與第一次設定畫面（名字＋頭像＋數字） */
import { esc } from '../utils/sanitize.js';
import { validateNickname, validateCode, charLength } from '../utils/validators.js';
import { createAvatarPicker } from './avatarPicker.js';
import { confirmDialog } from './modal.js';
import { local, session } from '../utils/storage.js';
import { config } from '../config.js';
import { store } from '../state/store.js';
import { avatarHtml } from '../utils/sanitize.js';

function setSession(room, remembered) {
  store.dmSession = { roomId: room.id, name: room.displayName || room.visitorName, avatar: room.visitorAvatar, remembered };
  // 登入用的名字（進入畫面預先填入）和顯示的暱稱是分開的
  store.setDmProfile({ name: room.visitorName, avatar: room.visitorAvatar });
}

/* ───────── 進入畫面：兩個框，先名字、再數字 ───────── */
export function dmEnterScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'app page';
  const prof = store.dmProfile;
  el.innerHTML = `
    <div class="row gap8" style="padding:14px 16px 0;">
      <button class="btn-ico" data-act="back" aria-label="回上一頁"><span class="ico i-left"></span></button>
      <span class="grow"></span>
    </div>
    <div class="col" style="align-items:center;gap:10px;padding:14px 24px 0;text-align:center;">
      <div class="row" style="position:relative;height:96px;width:190px;justify-content:center;">
        <span style="position:absolute;left:8px;top:2px;">${avatarHtml(prof?.avatar || 'pig', 'xl')}</span>
        <span style="position:absolute;right:8px;top:2px;">${avatarHtml('mm', 'xl')}</span>
      </div>
      <h1 class="title" style="margin-top:8px;">進入「兩個人」</h1>
      <p class="p muted small">輸入名字和自己預設的數字</p>
    </div>
    <form class="card col gap16" style="margin:18px 16px 0;padding:20px 18px;" autocomplete="off" novalidate>
      <div class="field">
        <label class="label" for="nm">名字<span class="chip pink" style="height:24px;font-size:12px;">輸入自己的名字</span></label>
        <input class="input" id="nm" value="${esc(prof?.name || '')}" autocomplete="off" maxlength="40">
      </div>
      <div class="field">
        <label class="label" for="pw">數字<button type="button" class="link" data-act="eye" style="min-height:28px;padding:0 2px;font-size:13px;"><span class="ico sm i-eye" style="vertical-align:-3px;"></span> 顯示</button></label>
        <input class="input" id="pw" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" style="letter-spacing:.3em;">
        <span class="msg-err" id="pw-err" role="alert" style="display:none;"></span>
        <span class="hint">這就是你第一次進來時自己設的那組數字（4 或 6 位數）</span>
      </div>
      <label class="row gap12" style="min-height:48px;cursor:pointer;">
        <input type="checkbox" id="remember" class="sr-only">
        <span class="check"></span>
        <span class="col grow">
          <span class="bold" style="font-size:15px;">記得這個裝置</span>
          <span class="tiny muted">下次這台裝置不用再輸入數字</span>
        </span>
      </label>
      <button class="btn block go" type="submit"><span class="go-text">進入</span><span class="ico sm i-right"></span></button>
    </form>
    <div class="bar yellow lock-bar" style="margin:14px 16px 0;font-size:12.5px;font-weight:700;line-height:1.45;display:none;">
      <span class="ico sm i-lock"></span><span>連續輸錯太多次，這個名字暫時鎖住一段時間，請晚一點再試</span>
    </div>
    <div class="grow"></div>
    <div class="col" style="align-items:center;padding:0 16px 20px;">
      <button class="link" data-act="new">第一次來？設定我的名字和數字</button>
    </div>`;
  const form = el.querySelector('form');
  const nm = el.querySelector('#nm');
  const pw = el.querySelector('#pw');
  const rem = el.querySelector('#remember');
  const check = el.querySelector('.check');
  const perr = el.querySelector('#pw-err');
  const go = el.querySelector('.go');

  function showErr(t) {
    perr.style.display = t ? 'flex' : 'none';
    perr.innerHTML = t ? `<span class="ico sm i-info"></span>${esc(t)}` : '';
    pw.classList.toggle('err', !!t);
  }
  rem.addEventListener('change', () => check.classList.toggle('on', rem.checked));
  pw.addEventListener('input', () => { pw.value = pw.value.replace(/\D/g, ''); showErr(''); });
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'back') ctx.go('visitor');
    else if (b.dataset.act === 'new') ctx.go('dmNew');
    else if (b.dataset.act === 'eye') {
      const show = pw.type === 'password';
      pw.type = show ? 'text' : 'password';
      b.innerHTML = `<span class="ico sm ${show ? 'i-eye' : 'i-eye'}" style="vertical-align:-3px;"></span> ${show ? '隱藏' : '顯示'}`;
    }
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = validateNickname(nm.value);
    const cv = validateCode(pw.value);
    if (!v.ok || !cv.ok) { showErr('名字或代碼不對'); return; }
    go.disabled = true;
    el.querySelector('.go-text').textContent = '進入中…';
    try {
      const r = await ctx.service.unlockDm({ name: v.value, code: pw.value, rememberDevice: rem.checked });
      setSession(r.room, r.remembered);
      ctx.openChat('dm');
    } catch (err) {
      if (err.code === 'code_locked') { el.querySelector('.lock-bar').style.display = 'flex'; showErr('輸入錯誤太多次，請晚一點再試'); }
      else if (err.code === 'code_wrong') showErr('名字或代碼不對');
      else ctx.toastError(err);
      go.disabled = false;
      el.querySelector('.go-text').textContent = '進入';
    }
  });
  return { el };
}

/* ───────── 第一次設定 ───────── */
export function dmNewScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'app page';
  const prof = store.dmProfile;
  const groupAvatar = store.profile?.avatar || null;
  const picker = createAvatarPicker({ initial: prof?.avatar || groupAvatar, ctx, big: false, groupAvatar });
  let length = 4;
  el.innerHTML = `
    <div class="row gap8" style="padding:12px 16px 0;">
      <button class="btn-ico sm" data-act="back" aria-label="回上一頁"><span class="ico i-left"></span></button>
      <span class="grow"></span>
    </div>
    <div class="col gap4" style="padding:6px 20px 0;">
      <h1 class="title" style="font-size:24px;">只跟 縵 聊</h1>
      <p class="p muted small">第一次來，先設定名字、頭像和你的數字</p>
    </div>
    <form class="col gap12" style="padding:12px 16px 0;" autocomplete="off" novalidate>
      <div class="field">
        <label class="label" for="nm">名字<span class="chip pink" style="height:24px;font-size:12px;">輸入自己的名字</span></label>
        <input class="input" id="nm" value="${esc(prof?.name || '')}" maxlength="40" style="min-height:48px;" autocomplete="off">
        <span class="msg-err" id="nm-err" role="alert" style="display:none;"></span>
        <span class="hint nm-count">0 / ${config.limits.nicknameMax} 字</span>
      </div>
      <div class="ap-slot"></div>
      <div class="field">
        <span class="label">數字有幾位？</span>
        <div class="seg-tabs" role="group" aria-label="代碼長度">
          <button type="button" class="seg-tab on" data-len="4">四位數</button>
          <button type="button" class="seg-tab" data-len="6">六位數</button>
        </div>
        <span class="hint len-hint" style="display:none;">比較不容易被猜到</span>
      </div>
      <div class="field">
        <label class="label" for="code">你的數字<button type="button" class="link" data-act="eye" style="min-height:28px;padding:0 2px;font-size:13px;"><span class="ico sm i-eye" style="vertical-align:-3px;"></span> 顯示</button></label>
        <input class="input" id="code" type="password" inputmode="numeric" pattern="[0-9]*" maxlength="4" autocomplete="off" style="letter-spacing:.3em;min-height:48px;">
        <span class="msg-err" id="code-err" role="alert" style="display:none;"></span>
        <span class="hint">這組代碼用來日後換手機或清除資料後，找回你跟 縵 的對話。請選一組你記得住、別人猜不到的數字，不建議用生日。</span>
        <span class="tiny" style="font-weight:700;color:var(--ink);">忘記代碼又換了裝置，就找不回這個對話了</span>
      </div>
      <div class="col gap4" style="padding:6px 0 12px;align-items:center;">
        <button class="btn block go" type="submit" disabled><span class="go-text">開始聊天</span><span class="ico sm i-right"></span></button>
        <button type="button" class="link" data-act="enter">我已經設定過了</button>
      </div>
    </form>`;
  el.querySelector('.ap-slot').appendChild(picker.el);
  const nm = el.querySelector('#nm');
  const code = el.querySelector('#code');
  const go = el.querySelector('.go');
  const nmErr = el.querySelector('#nm-err');
  const codeErr = el.querySelector('#code-err');

  function setErr(node, input, text, extraHtml = '') {
    node.style.display = text ? 'flex' : 'none';
    node.innerHTML = text ? `<span class="ico sm i-info"></span><span>${esc(text)}${extraHtml}</span>` : '';
    input.classList.toggle('err', !!text);
  }
  function validate() {
    el.querySelector('.nm-count').textContent = `${charLength(nm.value.trim())} / ${config.limits.nicknameMax} 字`;
    const v = validateNickname(nm.value);
    const cv = validateCode(code.value, length);
    setErr(nmErr, nm, nm.value.trim() && !v.ok ? v.reason : '');
    go.disabled = !(v.ok && cv.ok);
    return v.ok && cv.ok;
  }
  nm.addEventListener('input', validate);
  code.addEventListener('input', () => { code.value = code.value.replace(/\D/g, ''); setErr(codeErr, code, ''); validate(); });
  el.addEventListener('click', (e) => {
    const len = e.target.closest('[data-len]');
    if (len) {
      length = Number(len.dataset.len);
      el.querySelectorAll('[data-len]').forEach((b) => b.classList.toggle('on', b === len));
      code.maxLength = length;
      code.value = code.value.slice(0, length);
      el.querySelector('.len-hint').style.display = length === 6 ? 'block' : 'none';
      validate();
      return;
    }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'back' || b.dataset.act === 'enter') ctx.go('dmEnter');
    else if (b.dataset.act === 'eye') {
      const show = code.type === 'password';
      code.type = show ? 'text' : 'password';
      b.innerHTML = `<span class="ico sm i-eye" style="vertical-align:-3px;"></span> ${show ? '隱藏' : '顯示'}`;
    }
  });
  validate();

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validate()) return;
    go.disabled = true;
    el.querySelector('.go-text').textContent = '建立中…';
    try {
      const v = validateNickname(nm.value);
      const r = await ctx.service.createDm({ name: v.value, avatar: picker.getValue(), code: code.value, codeLength: length, rememberDevice: false });
      if (picker.isNewPhoto()) local.set('hasPhoto', true);
      setSession(r.room, false);
      // 立刻問：要記得這個裝置嗎？（沒回答前不記得）
      const ok = await confirmDialog({
        chip: '進入「兩個人」後', chipClass: 'mint', icon: 'i-lock', iconBg: '#FFB27A',
        title: '要記得這個裝置嗎？',
        text: '記得之後，這台裝置進「兩個人」不用再輸入數字。之後可以在選單更改。',
        okText: '記得', okStyle: 'background:#E6D7F5;', cancelText: '這次先不要',
      });
      if (ok) {
        await ctx.service.setDmRemember({ roomId: r.room.id, remember: true });
        store.dmSession.remembered = true;
      }
      ctx.openChat('dm');
    } catch (err) {
      if (err.code === 'dm_exists') {
        setErr(nmErr, nm, '你已經有一個跟 縵 的聊天室了。');
        nmErr.insertAdjacentHTML('beforeend', ' <button type="button" class="link" data-act="enter" style="padding:0;min-height:0;">直接進入</button>');
      } else if (err.code === 'name_code_taken') setErr(codeErr, code, '這組代碼已經有人用了，換一組吧');
      else ctx.toastError(err);
      go.disabled = false;
      el.querySelector('.go-text').textContent = '開始聊天';
    }
  });
  return { el };
}
