/* 「好多人」入口畫面：只要輸入一個匿名名稱就能進去 */
import { esc } from '../utils/sanitize.js';
import { validateNickname, charLength } from '../utils/validators.js';
import { createAvatarPicker } from './avatarPicker.js';
import { local } from '../utils/storage.js';
import { config } from '../config.js';
import { store } from '../state/store.js';

export function joinScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'app page';
  const prof = store.profile;
  const picker = createAvatarPicker({ initial: prof?.avatar, ctx });
  el.innerHTML = `
    <div class="row gap8" style="padding:14px 16px 0;">
      <button class="btn-ico" data-act="back" aria-label="回上一頁"><span class="ico i-left"></span></button>
      <span class="grow"></span>
    </div>
    <div class="col gap4" style="padding:8px 20px 0;">
      <h1 class="title">進入「好多人」</h1>
      <p class="p muted small">只要輸入一個匿名名稱，就能進去囉</p>
    </div>
    <form class="col gap12" style="padding:14px 16px 0;" autocomplete="off" novalidate>
      <div class="field">
        <label class="label" for="nick">匿名名稱<span class="tiny muted nick-count">0 / ${config.limits.nicknameMax}</span></label>
        <input class="input" id="nick" name="nick" maxlength="40" value="${esc(prof?.nickname || '')}" aria-describedby="nick-err" autocomplete="off" enterkeyhint="go">
        <span class="msg-err" id="nick-err" role="alert" style="display:none;"></span>
        <span class="hint">可以用中文、英文、數字、emoji 和空格</span>
      </div>
      <div class="ap-slot"></div>
      <div class="grow"></div>
      <div style="padding:6px 0 20px;">
        <button class="btn block go" type="submit"><span class="go-text">進入聊天室</span><span class="ico sm i-right"></span></button>
      </div>
    </form>`;
  el.querySelector('.ap-slot').appendChild(picker.el);

  const input = el.querySelector('#nick');
  const err = el.querySelector('#nick-err');
  const count = el.querySelector('.nick-count');
  const go = el.querySelector('.go');
  let serverErr = '';

  function showErr(text) {
    err.style.display = text ? 'flex' : 'none';
    err.innerHTML = text ? `<span class="ico sm i-info"></span>${esc(text)}` : '';
    input.classList.toggle('err', !!text);
  }
  function check() {
    const n = charLength(input.value.trim());
    count.textContent = `${n} / ${config.limits.nicknameMax}`;
    const v = validateNickname(input.value);
    if (!input.value.trim()) { showErr(''); go.disabled = true; return false; }
    if (!v.ok) { showErr(v.reason); go.disabled = true; return false; }
    showErr(serverErr);
    go.disabled = false;
    return true;
  }
  input.addEventListener('input', () => { serverErr = ''; check(); });
  check();

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-act="back"]')) ctx.go('visitor');
  });

  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!check()) return;
    go.disabled = true;
    el.querySelector('.go-text').textContent = '進入中…';
    try {
      const nickname = validateNickname(input.value).value;
      const { user } = await ctx.service.join({ nickname, avatar: picker.getValue() });
      if (picker.isNewPhoto()) local.set('hasPhoto', true);
      store.userId = user.userId;
      store.setProfile({ nickname: user.nickname, avatar: user.avatar });
      ctx.markJoined();
      ctx.openChat('group');
    } catch (err2) {
      if (err2.code === 'nickname_taken') { serverErr = '這個名字已經有人用囉，換一個吧'; showErr(serverErr); input.focus(); }
      else ctx.toastError(err2);
      go.disabled = false;
      el.querySelector('.go-text').textContent = '進入聊天室';
    }
  });
  return { el };
}
