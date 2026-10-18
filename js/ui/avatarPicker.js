/* 入口畫面的頭像選擇：內建小動物、相簿照片、拍照、（兩個人才有）沿用群組的頭像、刪除我的照片 */
import { AVATARS, AVATAR_NAMES, avatarHtml, isPhotoAvatar } from '../utils/sanitize.js';
import { local } from '../utils/storage.js';
import { validateAvatarFile } from '../utils/validators.js';
import { openCropper } from './avatarCropper.js';
import { openCamera } from './avatarCamera.js';
import { openFull } from './fullscreen.js';
import { insecureMedia } from '../utils/dom.js';
import { confirmDialog } from './modal.js';
import { toast, toastError } from './toast.js';

/* opts: { initial, ctx, big (預覽放大), groupAvatar (有的話顯示「沿用群組的頭像」), showPreview } */
export function createAvatarPicker({ initial, ctx, big = true, groupAvatar = null, includeMm = false, onChange = () => {} }) {
  const LIST = includeMm ? ['mm', ...AVATARS] : AVATARS; // 縵縵限定的蝴蝶結小兔子只有縵選得到
  let sel = { value: initial || LIST[0], blob: null, url: null };
  const wrap = document.createElement('div');
  wrap.className = 'col gap12 avatar-picker';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = 'image/jpeg,image/png,image/webp';
  fileInput.hidden = true;
  /* 手機的「拍照」：直接開手機的相機（跟相簿一樣用檔案選擇，不需要 https） */
  const captureInput = document.createElement('input');
  captureInput.type = 'file';
  captureInput.accept = 'image/*';
  captureInput.setAttribute('capture', 'user');
  captureInput.hidden = true;
  const isTouch = () => window.matchMedia && window.matchMedia('(hover: none)').matches;

  function currentAvatarString() {
    return sel.blob ? sel.url : sel.value;
  }

  function hasPhotoBefore() { return !!local.get('hasPhoto') || (isPhotoAvatar(sel.value) && !sel.blob); }

  function render() {
    const prevRow = wrap.querySelector('.ap-row');
    const keepLeft = prevRow ? prevRow.scrollLeft : 0;
    const cur = currentAvatarString();
    const isPhoto = !!sel.blob || isPhotoAvatar(sel.value);
    wrap.innerHTML = `
      <div class="card sky row gap16" style="padding:12px 16px;">
        ${avatarHtml(cur, 'xl', 'ap-preview')}
        <div class="col grow gap4">
          <span class="tiny muted bold">你的樣子</span>
          <span class="h2 nowrap ap-name">${isPhoto ? '我的照片' : AVATAR_NAMES[sel.value] || ''}</span>
          ${isPhoto ? '<button class="link" data-act="builtin" style="text-align:left;padding:0;min-height:28px;font-size:13px;">改回內建頭像</button>' : ''}
        </div>
      </div>
      <div class="field">
        <span class="label">選一個頭像</span>
        <div class="ap-scroll">
          <button type="button" class="btn-ico sm ap-arrow l" data-scroll="-1" aria-label="往左看更多頭像"><span class="ico sm i-left"></span></button>
          <div class="row gap8 ap-row" role="listbox" aria-label="內建頭像">
          ${LIST.map((a) => `<button type="button" class="av-pick ${!isPhoto && a === sel.value ? 'on' : ''}" data-code="${a}" role="option" aria-selected="${!isPhoto && a === sel.value}" aria-label="${AVATAR_NAMES[a]}">${avatarHtml(a, 'pick')}</button>`).join('')}
          </div>
          <button type="button" class="btn-ico sm ap-arrow r" data-scroll="1" aria-label="往右看更多頭像"><span class="ico sm i-right"></span></button>
        </div>
        <div class="row gap8">
          <button type="button" class="btn sm ghost grow" data-act="album"><span class="ico sm i-image"></span>相簿</button>
          <button type="button" class="btn sm ghost grow" data-act="camera"><span class="ico sm i-camera"></span>拍照</button>
          <button type="button" class="btn sm ghost grow" data-act="all"><span class="ico sm i-pig"></span>全部小動物</button>
        </div>
        <div class="row gap8">
          ${groupAvatar ? '<button type="button" class="btn sm blue grow" data-act="group"><span class="ico sm i-users"></span>沿用群組的頭像</button>' : ''}
          ${hasPhotoBefore() ? '<button type="button" class="btn sm yellow grow" data-act="delphotos"><span class="ico sm i-trash"></span>刪除我的照片</button>' : ''}
        </div>
      </div>`;
    wrap.appendChild(fileInput);
    wrap.appendChild(captureInput);
    // 選了後面的頭像，列表不要跳回最前面
    const row = wrap.querySelector('.ap-row');
    if (row) row.scrollLeft = keepLeft;
  }

  /* 全部小動物：一頁看完，點一隻就選它 */
  function openAll() {
    const isPhoto = !!sel.blob || isPhotoAvatar(sel.value);
    const scr = openFull(`
      <div style="padding:22px 16px 6px;text-align:center;position:relative;">
        <button class="btn-ico" data-act="close" aria-label="關閉" style="position:absolute;left:16px;top:14px;"><span class="ico i-x"></span></button>
        <h1 class="h2" style="margin-top:6px;">所有可選的小動物</h1>
      </div>
      <div class="all-grid">
        ${(includeMm ? LIST : [...LIST, 'mm']).map((a) => `<button type="button" class="all-item ${!isPhoto && a === sel.value ? 'on' : ''}" data-code="${a}" aria-label="${AVATAR_NAMES[a]}">${avatarHtml(a, 'xl')}<span class="small bold">${AVATAR_NAMES[a]}</span></button>`).join('')}
      </div>`, { cls: 'all-avatars' });
    scr.el.addEventListener('click', (e) => {
      if (e.target.closest('[data-act="close"]')) { scr.close(); return; }
      const b = e.target.closest('[data-code]');
      if (!b) return;
      if (b.dataset.code === 'mm' && !includeMm) { ctx.toast('這是只有縵縵能選的小兔兔', { icon: 'i-heart' }); return; }
      scr.closeWith(() => {
        set({ value: b.dataset.code });
        const on = wrap.querySelector('.av-pick.on');
        if (on) on.scrollIntoView({ inline: 'center', block: 'nearest' });
      });
    });
    const cur = scr.el.querySelector('.all-item.on');
    if (cur) cur.scrollIntoView({ block: 'center' });
  }

  function set(next) {
    if (sel.url) { try { URL.revokeObjectURL(sel.url); } catch { /* 忽略 */ } }
    sel = { value: '', blob: null, url: null, ...next };
    render();
    onChange(api.getValue());
  }

  async function handleFile(file) {
    const v = validateAvatarFile(file);
    if (!v.ok) { toast(v.reason, { soft: true }); return; }
    let r = await openCropper(file);
    while (r && r.reselect) { fileInput.value = ''; fileInput.click(); return; }
    if (r instanceof Blob) set({ blob: r, url: URL.createObjectURL(r) });
  }

  fileInput.addEventListener('change', () => {
    const f = fileInput.files && fileInput.files[0];
    fileInput.value = '';
    if (f) handleFile(f);
  });
  captureInput.addEventListener('change', () => {
    const f = captureInput.files && captureInput.files[0];
    captureInput.value = '';
    if (f) handleFile(f);
  });

  wrap.addEventListener('click', async (e) => {
    const sc = e.target.closest('[data-scroll]');
    if (sc) {
      const row = wrap.querySelector('.ap-row');
      row.scrollBy({ left: Number(sc.dataset.scroll) * row.clientWidth * 0.8, behavior: 'smooth' });
      return;
    }
    const pick = e.target.closest('[data-code]');
    if (pick) { set({ value: pick.dataset.code }); return; }
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'builtin') set({ value: LIST[0] });
    else if (act === 'album') fileInput.click();
    else if (act === 'group') {
      if (groupAvatar) {
        if (isPhotoAvatar(groupAvatar)) set({ value: groupAvatar });
        else set({ value: groupAvatar });
      }
    } else if (act === 'all') {
      openAll();
    } else if (act === 'camera') {
      if (isTouch() || insecureMedia()) { captureInput.click(); return; }
      const r = await openCamera();
      if (!r) return;
      if (r.album) { fileInput.click(); return; }
      let c = await openCropper(r.blob);
      if (c && c.reselect) { const again = await openCamera(); if (again && again.blob) c = await openCropper(again.blob); else if (again && again.album) fileInput.click(); }
      if (c instanceof Blob) set({ blob: c, url: URL.createObjectURL(c) });
    } else if (act === 'delphotos') {
      const ok = await confirmDialog({
        chip: '刪除我的照片', chipStyle: 'background:#CDF0E1;', icon: 'i-image', iconBg: '#FFD9BF',
        title: '刪除我的照片？', text: '刪除後無法復原，而且舊訊息裡你的頭像也會變成預設頭像。',
        okText: '確定刪除', okStyle: 'background:#CFE6FA;', cancelText: '先不要',
      });
      if (!ok) return;
      try {
        await ctx.service.deleteMyAvatars();
        local.remove('hasPhoto');
        if (sel.blob || isPhotoAvatar(sel.value)) set({ value: LIST[0] }); else render();
        toast('照片已刪除', { icon: 'i-check' });
      } catch (err) { toastError(err); }
    }
  });

  wrap.addEventListener('wheel', (e) => {
    const row = e.target.closest('.ap-row');
    if (row && Math.abs(e.deltaY) > Math.abs(e.deltaX)) { row.scrollLeft += e.deltaY; e.preventDefault(); }
  }, { passive: false });

  const api = {
    el: wrap,
    fileInput,
    /* 回傳內建頭像代號（字串）、舊照片（media:…）或新照片（Blob） */
    getValue() { return sel.blob ? sel.blob : sel.value; },
    isNewPhoto() { return !!sel.blob; },
    preview() { return currentAvatarString(); },
    setValue(v) { set({ value: v }); },
  };
  render();
  return api;
}
