/* 底部輸入區：藍色鈕（長按說話／輕點選語音或檔案）、黃色鈕（相簿）、輸入框（右邊淡紫色小笑臉）、送出（送出後短暫冷卻 0.5 秒）、
   已附檔案預覽、斷線暫存訊息列 */
import { store } from '../state/store.js';
import { config } from '../config.js';
import { esc } from '../utils/sanitize.js';
import { hhmm, mmss } from '../utils/time.js';
import { charLength, validateMessageImage, validateFile, validateVideoDuration, formatBytes, fileBadge, hasContent } from '../utils/validators.js';
import { isBlockedFile, looksExecutable } from '../utils/sanitize.js';
import { prepareMessageImage, videoPoster } from '../utils/image.js';
import { putMedia } from '../utils/mediaStore.js';
import { uuid } from '../utils/time.js';
import { longPress } from '../utils/dom.js';
import { toast, toastError } from './toast.js';
import { confirmDialog, popMenu } from './modal.js';
import { openEmojiPanel, isDesktopPointer } from './emojiPanel.js';
import { recordVoice } from './voiceRecorder.js';
import { insecureMedia } from '../utils/dom.js';

export function createComposer(ctx, { roomId, kind }) {
  const el = document.createElement('div');
  el.className = 'composer';
  el.innerHTML = `
    <div class="drafts-slot"></div>
    <div class="attach-slot"></div>
    <span class="counter" style="display:none;"></span>
    <div class="line">
      <button type="button" class="btn-ico c-blue mic" aria-label="長按說話，最長 60 秒；輕點可以選語音或檔案"><span class="ico i-mic"></span></button>
      <button type="button" class="btn-ico c-yellow img" aria-label="傳圖片或影片"><span class="ico i-image"></span></button>
      <div class="textarea">
        <textarea class="ta" rows="1" placeholder="說話！" aria-label="訊息" enterkeyhint="send"></textarea>
        <button type="button" class="in-emoji" aria-label="Emoji 表情"><span class="ico sm i-smile"></span></button>
      </div>
      <button type="button" class="btn-ico c-pink send" aria-label="送出"><span class="ico i-send"></span></button>
    </div>
    <input type="file" class="album-input" accept="image/*,video/*" multiple hidden>
    <input type="file" class="doc-input" hidden>
    <input type="file" class="audio-input" accept="audio/*" hidden>`;
  const ta = el.querySelector('.ta');
  const sendBtn = el.querySelector('.send');
  const micBtn = el.querySelector('.mic');
  const imgBtn = el.querySelector('.img');
  const emojiBtn = el.querySelector('.in-emoji');
  const counter = el.querySelector('.counter');
  const attachSlot = el.querySelector('.attach-slot');
  const draftsSlot = el.querySelector('.drafts-slot');
  const album = el.querySelector('.album-input');
  const doc = el.querySelector('.doc-input');
  const audioIn = el.querySelector('.audio-input');
  const offs = [];
  const L = config.limits;
  let att = { images: [], video: null, file: null };
  let sending = false;
  let cdTimer = null;
  let panel = null;

  /* ───────── 輸入框 ───────── */
  function autosize() {
    ta.style.height = 'auto';
    ta.style.height = Math.min(ta.scrollHeight, 130) + 'px';
  }
  function updateState() {
    const n = charLength(ta.value);
    if (n > L.messageMax) ta.value = [...ta.value].slice(0, L.messageMax).join('');
    const left = L.messageMax - charLength(ta.value);
    counter.style.display = left <= 200 ? 'block' : 'none';
    counter.textContent = `剩 ${left} 字`;
    const empty = !hasContent({ text: ta.value, images: att.images, file: att.file, video: att.video });
    const cd = store.cooldownLeft();
    sendBtn.disabled = empty || cd > 0;
    sendBtn.classList.toggle('cooling', cd > 0);
    // 冷卻很短（不到 1 秒）時不顯示數字，只讓按鈕短暫變灰；超過 1 秒才顯示倒數
    const showNum = cd > 0 && L.cooldownSeconds >= 1;
    sendBtn.innerHTML = showNum ? `<span class="cd">${Math.ceil(cd)}</span>` : '<span class="ico i-send"></span>';
    sendBtn.setAttribute('aria-label', cd > 0 ? '剛送出，馬上可以再送' : '送出');
  }
  ta.addEventListener('input', () => { autosize(); updateState(); });
  ta.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && isDesktopPointer()) { e.preventDefault(); send(); }
  });
  function startCooldownTicker() {
    clearInterval(cdTimer);
    updateState();
    cdTimer = setInterval(() => { updateState(); if (store.cooldownLeft() <= 0) clearInterval(cdTimer); }, 100);
  }
  offs.push(store.on('cooldown', startCooldownTicker));

  /* ───────── Emoji ───────── */
  emojiBtn.addEventListener('click', () => {
    if (!isDesktopPointer()) return; // 手機沒有這顆笑臉（CSS 已隱藏）
    if (panel) { panel.close(); return; }
    emojiBtn.classList.add('open');
    panel = openEmojiPanel(el, {
      onPick: (e) => {
        const s = ta.selectionStart ?? ta.value.length;
        const t = ta.selectionEnd ?? s;
        ta.value = ta.value.slice(0, s) + e + ta.value.slice(t);
        ta.focus();
        ta.setSelectionRange(s + e.length, s + e.length);
        autosize(); updateState();
      },
      onClose: () => { panel = null; emojiBtn.classList.remove('open'); ta.focus(); },
    });
  });

  /* ───────── 附件預覽 ───────── */
  function renderAttach() {
    const { images, video, file } = att;
    if (!images.length && !video && !file) { attachSlot.innerHTML = ''; updateState(); return; }
    if (images.length) {
      attachSlot.innerHTML = `<div class="attach multi">
        <div class="row"><span class="bold small grow">已選 ${images.length} 張照片（最多 ${L.imagesPerMessage} 張）</span><button type="button" class="btn xs ghost" data-act="clear">全部取消</button></div>
        <div class="thumbs">${images.map((im, i) => `<div class="th"><span class="pic"><img src="${im.url}" alt=""></span><button type="button" class="x" data-act="rm" data-i="${i}" aria-label="取消這張"><span class="ico sm i-x" style="width:12px;height:12px;"></span></button></div>`).join('')}
          ${images.length < L.imagesPerMessage ? '<button type="button" class="th add" data-act="add" aria-label="再加照片"><span class="ico sm i-plus"></span></button>' : ''}</div>
      </div>`;
    } else if (video) {
      attachSlot.innerHTML = `<div class="attach multi">
        <div class="row"><span class="bold small grow">已選 1 支影片（最長 5 分鐘、50MB 以內）</span></div>
        <div class="row gap8"><span class="th" style="position:relative;"><span class="pic vid" style="width:56px;height:56px;border-radius:14px;">${video.posterUrl ? `<img src="${video.posterUrl}" alt="" class="vposter">` : ''}<span class="ico sm i-play" style="position:absolute;left:50%;top:50%;margin:-8px 0 0 -8px;"></span></span><button type="button" class="x" data-act="clear" aria-label="取消這支影片"><span class="ico sm i-x" style="width:12px;height:12px;"></span></button></span>
        <div class="col"><span class="small bold">${esc(video.name)}</span><span class="tiny muted">${mmss(video.duration)} · ${formatBytes(video.size)}</span></div></div>
      </div>`;
    } else if (file) {
      attachSlot.innerHTML = `<div class="attach multi">
        <div class="row"><span class="bold small grow">已選 1 個檔案（50MB 以內）</span></div>
        <div class="row gap8"><span class="th" style="position:relative;"><span class="fileicon" style="width:44px;height:44px;border-radius:14px;background:var(--peach);border:2px solid rgba(91,66,52,.14);display:inline-flex;align-items:center;justify-content:center;font-size:11px;font-weight:800;color:#5B4234;">${esc(fileBadge(file.name))}</span><button type="button" class="x" data-act="clear" aria-label="取消這個檔案"><span class="ico sm i-x" style="width:12px;height:12px;"></span></button></span>
        <div class="col" style="min-width:0;"><span class="small bold nowrap">${esc(file.name)}</span><span class="tiny muted">${formatBytes(file.size)}</span></div></div>
      </div>`;
    }
    updateState();
  }
  attachSlot.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'clear') clearAtt();
    else if (b.dataset.act === 'rm') { const i = Number(b.dataset.i); URL.revokeObjectURL(att.images[i].url); att.images.splice(i, 1); renderAttach(); }
    else if (b.dataset.act === 'add') album.click();
  });
  function clearAtt() {
    att.images.forEach((i) => URL.revokeObjectURL(i.url));
    if (att.video && att.video.posterUrl) URL.revokeObjectURL(att.video.posterUrl);
    att = { images: [], video: null, file: null };
    renderAttach();
  }

  /* 相簿：照片最多 10 張，或 1 支影片 */
  imgBtn.addEventListener('click', () => {
    if (store.connection !== 'connected') { toast('需要連線才能送圖片', { soft: true, icon: 'i-wifioff' }); return; }
    album.click();
  });
  album.addEventListener('change', async () => {
    const files = [...album.files];
    album.value = '';
    if (!files.length) return;
    const vid = files.find((f) => f.type.startsWith('video/'));
    try {
      if (vid) {
        if (vid.size > L.fileMaxBytes) { toast('影片太大了（最多 50MB），請剪短一點或選小一點的', { soft: true }); return; }
        const { duration, poster } = await videoPoster(vid);
        const v = validateVideoDuration(duration);
        if (!v.ok) { toast(v.reason, { soft: true }); return; }
        clearAtt();
        att.video = { blob: vid, name: vid.name, size: vid.size, duration, poster, posterUrl: poster ? URL.createObjectURL(poster) : null };
      } else {
        if (att.video || att.file) clearAtt();
        for (const f of files) {
          if (att.images.length >= L.imagesPerMessage) { toast(`一則訊息最多 ${L.imagesPerMessage} 張照片`, { soft: true }); break; }
          const v = validateMessageImage(f);
          if (!v.ok) { toast(v.reason, { soft: true }); continue; }
          try {
            const p = await prepareMessageImage(f);
            att.images.push({ ...p, url: URL.createObjectURL(p.blob) });
          } catch (err) {
            toast(err.code === 'image_too_large' ? 'GIF 太大了（最多 2MB）' : '這張圖片讀不出來', { soft: true });
          }
        }
      }
    } catch { toast('這個檔案讀不出來，換一個試試', { soft: true }); }
    renderAttach();
  });

  /* 檔案：文件與壓縮檔，不能傳程式 */
  doc.addEventListener('change', async () => {
    const f = doc.files && doc.files[0];
    doc.value = '';
    if (!f) return;
    const v = validateFile(f);
    if (!v.ok) { toast(v.reason, { soft: true }); return; }
    if (await looksExecutable(f)) { toast('不能傳程式或可執行的檔案', { soft: true }); return; }
    clearAtt();
    att.file = { blob: f, name: f.name, size: f.size };
    renderAttach();
  });

  /* ───────── 藍色鈕：長按錄音、輕點選單 ───────── */
  /* 這個網址不能直接錄音（例如手機用區域網路的 http 網址）：改用手機自己的錄音程式 */
  const canRecordHere = () => !insecureMedia() && !!window.MediaRecorder && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);

  async function sendVoice(r) {
    try {
      const id = 'vo-' + uuid();
      await putMedia(id, r.blob);
      await store.send(roomId, { text: '', voice: { id, duration: Math.round(r.duration) } });
    } catch (e) { toastError(e); }
  }

  audioIn.addEventListener('change', async () => {
    const f = audioIn.files && audioIn.files[0];
    audioIn.value = '';
    if (!f) return;
    const url = URL.createObjectURL(f);
    const dur = await new Promise((res) => {
      const a = new Audio();
      a.preload = 'metadata';
      a.onloadedmetadata = () => res(Number.isFinite(a.duration) ? a.duration : 0);
      a.onerror = () => res(-1);
      a.src = url;
    });
    URL.revokeObjectURL(url);
    if (dur < 0) { toast('這個檔案不是聲音，換一個試試', { soft: true, icon: 'i-mic' }); return; }
    if (dur > L.voiceMaxSeconds + 0.5) { toast(`語音最長 ${L.voiceMaxSeconds} 秒`, { soft: true, icon: 'i-mic' }); return; }
    const r = await recordVoice({ preset: { blob: f, duration: dur || 1 }, onRedo: () => audioIn.click() });
    if (r) sendVoice(r);
  });

  async function voiceFlow(mode) {
    if (store.connection !== 'connected') { toast('需要連線才能送語音', { soft: true, icon: 'i-wifioff' }); return; }
    if (!canRecordHere()) {
      if (mode === 'tap') audioIn.click();
      else toast('這個網址不能直接錄音。輕點藍色鈕，選「錄語音」，會用手機的錄音程式', { soft: true, icon: 'i-mic', ms: 6000 });
      return;
    }
    let held = true;
    if (mode === 'hold') window.addEventListener('pointerup', () => { held = false; }, { once: true });
    const r = await recordVoice({ mode, isHeld: () => held });
    if (r) sendVoice(r);
  }
  /* 手機（觸控裝置）：這顆鈕直接變成「傳檔案」，沒有長按錄音，也沒有選單；點一下就選檔案 */
  const touchDevice = !!(window.matchMedia && window.matchMedia('(hover: none)').matches);
  if (touchDevice) {
    micBtn.classList.remove('c-blue');
    micBtn.classList.add('c-file');
    micBtn.innerHTML = '<span class="ico i-file"></span>';
    micBtn.setAttribute('aria-label', '傳檔案');
    micBtn.addEventListener('click', () => {
      if (store.connection !== 'connected') { toast('需要連線才能傳檔案', { soft: true, icon: 'i-wifioff' }); return; }
      doc.click();
    });
  } else longPress(micBtn, {
    ms: 450,
    onLong: () => voiceFlow('hold'),
    onTap: () => {
      popMenu(micBtn, [
        { html: '<span class="ico sm i-mic"></span>錄語音', onClick: () => voiceFlow('tap'), style: 'background:#CFE6FA;' },
        { html: '<span class="ico sm i-file"></span>傳檔案', onClick: () => { if (store.connection !== 'connected') { toast('需要連線才能傳檔案', { soft: true, icon: 'i-wifioff' }); return; } doc.click(); } },
      ], { align: 'left', cls: 'pickmenu' });
      // 小選單顏色：錄語音藍、傳檔案橘
      const items = document.querySelectorAll('.pickmenu .it');
      if (items[0]) items[0].style.background = '#CFE6FA';
      if (items[1]) items[1].style.background = '#FFC7A3';
      const hint = document.createElement('div');
      hint.className = 'hint';
      hint.textContent = '文件和壓縮檔，50MB 以內';
      document.querySelector('.pickmenu') && document.querySelector('.pickmenu').appendChild(hint);
    },
  });

  /* ───────── 送出 ───────── */
  async function buildPayload() {
    const payload = { text: ta.value };
    if (att.images.length) {
      payload.images = [];
      for (const im of att.images) {
        const id = 'im-' + uuid();
        await putMedia(id, im.blob);
        payload.images.push({ id, w: im.width, h: im.height });
      }
    }
    if (att.video) {
      const id = 'vd-' + uuid();
      await putMedia(id, att.video.blob);
      let posterId = null;
      if (att.video.poster) { posterId = 'vp-' + uuid(); await putMedia(posterId, att.video.poster); }
      payload.video = { id, posterId, duration: att.video.duration, name: att.video.name, size: att.video.size };
    }
    if (att.file) {
      const id = 'fl-' + uuid();
      await putMedia(id, att.file.blob);
      payload.file = { id, name: att.file.name, size: att.file.size };
    }
    return payload;
  }

  async function send() {
    if (sending) return;
    if (!hasContent({ text: ta.value, images: att.images, file: att.file, video: att.video })) return;
    if (store.cooldownLeft() > 0) { toast('慢一點喔～', { soft: true }); return; }
    sending = true;
    sendBtn.disabled = true;
    try {
      const hasMediaAtt = att.images.length || att.video || att.file;
      if (hasMediaAtt && store.connection !== 'connected') throw Object.assign(new Error('需要連線才能送圖片'), { code: 'offline' });
      const payload = await buildPayload();
      const res = await store.send(roomId, payload);
      if (res.queued) toast('目前沒有網路，已先幫你存起來', { icon: 'i-wifioff' });
      ta.value = '';
      autosize();
      clearAtt();
      ta.focus();
    } catch (e) {
      toastError(e);
    } finally {
      sending = false;
      updateState();
    }
  }
  sendBtn.addEventListener('click', send);

  /* ───────── 斷線暫存訊息列 ───────── */
  function renderDrafts() {
    const list = store.getDrafts(roomId);
    if (!list.length) { draftsSlot.innerHTML = ''; return; }
    const online = store.connection === 'connected';
    draftsSlot.innerHTML = `<div class="card col drafts" style="padding:10px 12px;border-radius:24px;">
      <div class="row gap6" style="padding-bottom:6px;"><span class="ico sm i-refresh"></span><span class="bold small">斷線時你打的訊息</span><span class="grow"></span><span class="tiny muted">${list.length} / ${L.draftsMax}</span></div>
      <div class="col" style="gap:8px;">
        ${list.map((d) => `<div class="col gap6" style="padding:8px 10px;border-radius:18px;background:var(--cream);border:2px solid var(--line);">
          <span class="small" style="overflow-wrap:anywhere;">${esc(d.text)}</span>
          <div class="row gap6"><span class="tiny muted grow">${hhmm(d.savedAt)} 存起來</span>
            <button type="button" class="btn xs" data-d="send" data-id="${d.id}" ${online ? '' : 'disabled'}>送出</button>
            <button type="button" class="btn xs ghost" data-d="put" data-id="${d.id}">放回輸入框</button>
            <button type="button" class="btn xs ghost" data-d="del" data-id="${d.id}">刪除</button></div></div>`).join('')}
      </div></div>`;
  }
  draftsSlot.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-d]');
    if (!b) return;
    const id = b.dataset.id;
    const d = store.getDrafts(roomId).find((x) => x.id === id);
    if (!d) return;
    if (b.dataset.d === 'del') store.removeDraft(roomId, id);
    else if (b.dataset.d === 'put') {
      if (ta.value.trim()) {
        const ok = await confirmDialog({ chip: '暫存訊息', icon: 'i-refresh', iconBg: '#FFE6D4', title: '輸入框已經有字了', text: '要用這則暫存的訊息取代輸入框裡的字嗎？', okText: '取代', cancelText: '先不要' });
        if (!ok) return;
      }
      ta.value = d.text; autosize(); updateState(); store.removeDraft(roomId, id); ta.focus();
    } else if (b.dataset.d === 'send') {
      try {
        if (store.cooldownLeft() > 0) { toast('慢一點喔～', { soft: true }); return; }
        await store.send(roomId, { text: d.text });
        store.removeDraft(roomId, id);
      } catch (err) { toastError(err); }
    }
  });
  offs.push(store.on('drafts', (rid) => { if (rid === roomId) renderDrafts(); }));
  offs.push(store.on('connection', () => { renderDrafts(); }));
  renderDrafts();
  updateState();

  return {
    el,
    setPlaceholder(t) { ta.placeholder = t; },
    focus() { ta.focus(); },
    destroy() { offs.forEach((f) => f()); clearInterval(cdTimer); if (panel) panel.close(); clearAtt(); },
  };
}
