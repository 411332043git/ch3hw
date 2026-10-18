/* 「兩個人」的換暱稱與頭像（整頁，跟「好多人」入口畫面一樣）。
   mode 'visitor'：訪客換自己在「兩個人」的暱稱與頭像（只改縵看到的；登入用的名字和數字不變）
   mode 'owner'：縵換自己在一對一對話裡的名字與頭像（頭像可以選蝴蝶結小兔子） */
import { esc } from '../utils/sanitize.js';
import { validateNickname, charLength } from '../utils/validators.js';
import { createAvatarPicker } from './avatarPicker.js';
import { local } from '../utils/storage.js';
import { config } from '../config.js';
import { store } from '../state/store.js';

export function profileScreen(ctx, { mode = 'visitor' } = {}) {
  const owner = mode === 'owner';
  const sess = store.dmSession;
  const cur = owner ? (store.ownerProfile || { name: '縵', avatar: 'mm' }) : { name: sess ? sess.name : '', avatar: sess ? sess.avatar : null };
  const el = document.createElement('div');
  el.className = 'app page';
  const picker = createAvatarPicker({ initial: cur.avatar, ctx, includeMm: owner, groupAvatar: !owner && store.profile ? store.profile.avatar : null });
  el.innerHTML = `
    <div class="row gap8" style="padding:14px 16px 0;">
      <button class="btn-ico" data-act="back" aria-label="回上一頁"><span class="ico i-left"></span></button>
      <span class="grow"></span>
    </div>
    <div class="col gap4" style="padding:8px 20px 0;">
      <h1 class="title">換暱稱與頭像</h1>
      <p class="p muted small">${owner ? '這是你在一對一對話裡顯示的名字和頭像，訪客看到的就是這個' : '只會換成縵看到的名字和頭像。登入用的名字和數字不變'}</p>
    </div>
    <form class="col gap12" style="padding:14px 16px 0;" autocomplete="off" novalidate>
      <div class="field">
        <label class="label" for="pn">暱稱<span class="tiny muted pn-count">0 / ${config.limits.nicknameMax}</span></label>
        <input class="input" id="pn" value="${esc(cur.name)}" maxlength="40" autocomplete="off">
        <span class="msg-err" id="pn-err" role="alert" style="display:none;"></span>
        <span class="hint">可以用中文、英文、數字、emoji 和空格</span>
      </div>
      <div class="ap-slot"></div>
      <div class="grow"></div>
      <div style="padding:6px 0 20px;">
        <button class="btn block go" type="submit"><span class="ico sm i-check"></span><span class="go-text">儲存</span></button>
      </div>
    </form>`;
  el.querySelector('.ap-slot').appendChild(picker.el);
  const input = el.querySelector('#pn');
  const err = el.querySelector('#pn-err');
  const count = el.querySelector('.pn-count');
  const go = el.querySelector('.go');
  function check() {
    count.textContent = `${charLength(input.value.trim())} / ${config.limits.nicknameMax}`;
    const v = validateNickname(input.value, { allowReserved: owner });
    const bad = !v.ok && input.value.trim();
    err.style.display = bad ? 'flex' : 'none';
    err.innerHTML = bad ? `<span class="ico sm i-info"></span>${esc(v.reason)}` : '';
    input.classList.toggle('err', !!bad);
    go.disabled = !v.ok;
    return v;
  }
  input.addEventListener('input', check);
  check();
  el.addEventListener('click', (e) => { if (e.target.closest('[data-act="back"]')) ctx.openChat('dm'); });
  el.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = check();
    if (!v.ok) return;
    go.disabled = true;
    el.querySelector('.go-text').textContent = '儲存中…';
    try {
      if (owner) {
        const { profile } = await ctx.service.updateOwnerProfile({ name: v.value, avatar: picker.getValue() });
        store.ownerProfile = profile;
      } else {
        const { room } = await ctx.service.updateDmProfile({ roomId: sess.roomId, name: v.value, avatar: picker.getValue() });
        store.dmSession.name = room.displayName;
        store.dmSession.avatar = room.visitorAvatar;
      }
      if (picker.isNewPhoto()) local.set('hasPhoto', true);
      ctx.toast('已換成新的暱稱與頭像', { icon: 'i-check' });
      ctx.openChat('dm');
    } catch (e2) {
      ctx.toastError(e2);
      go.disabled = false;
      el.querySelector('.go-text').textContent = '儲存';
    }
  });
  return { el };
}
