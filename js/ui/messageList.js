/* 訊息列表：訊息、表情回應、收回與復原、公告、長按選單、語音／影片／檔案、悄悄話分段、進出提示、載入更早、新訊息按鈕 */
import { store } from '../state/store.js';
import { config } from '../config.js';
import { esc, avatarHtml } from '../utils/sanitize.js';
import { hhmm, dayKey, dayLabel, mmss, expireLabel } from '../utils/time.js';
import { formatBytes, fileBadge } from '../utils/validators.js';
import { mediaUrl } from '../utils/mediaStore.js';
import { longPress } from '../utils/dom.js';
import { popMenu } from './modal.js';
import { openLightbox } from './lightbox.js';
import { openReactionPicker } from './reactionPicker.js';
import { toast, toastError } from './toast.js';

const DAY = 86400000;
const hiddenLive = (x) => !!x.hiddenAt && Date.now() - Date.parse(x.hiddenAt) < DAY;

export function hasMedia(m) {
  return !!((m.images && m.images.length) || m.file || m.voice || m.video);
}
export function expiresAt(m, kind) {
  const days = kind === 'group' ? config.expireDays.group : config.expireDays.dm;
  return new Date(Date.parse(m.createdAt) + days * DAY).toISOString();
}
export function isExpired(m, kind) {
  if (!hasMedia(m)) return false;
  if (m.expired) return true;
  if (m.announced) return false;
  return Date.now() > Date.parse(expiresAt(m, kind));
}

const flower = '<span class="flower line" style="width:18px;height:18px;"></span>';

export function createMessageList(ctx, { roomId, kind }) {
  const room = () => store.room(roomId);
  const el = document.createElement('div');
  el.className = 'msgs-wrap';
  el.innerHTML = `
    <div class="msgs scrolly" tabindex="-1" aria-live="polite"></div>
    <button class="btn sm newbtn" style="display:none;"><span class="ico sm i-down"></span><span class="nb-text"></span></button>`;
  const box = el.querySelector('.msgs');
  const newBtn = el.querySelector('.newbtn');
  const offs = [];
  let newCount = 0;
  let audio = null;
  let audioBtn = null;

  const atBottom = () => box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const toBottom = () => { box.scrollTop = box.scrollHeight; };

  /* ───────── 組出畫面 ───────── */
  function items() {
    const r = room();
    const list = [];
    // 刪除過的：一天內顯示「這邊刪除過」的痕跡，超過一天就完全消失
    const shown = (x) => !x.hiddenAt || hiddenLive(x);
    r.messages.filter((m) => !m.segmentId && shown(m)).forEach((m) => list.push({ t: m.createdAt, kind: 'msg', m }));
    if (kind === 'group') r.notes.forEach((n) => list.push({ t: n.at, kind: 'note', n }));
    r.segments.forEach((s) => {
      if (!shown(s)) return;
      if (s.endedAt) list.push({ t: s.startedAt, kind: 'secretEnd', s });
      else list.push({ t: s.startedAt, kind: 'seg', s, msgs: r.messages.filter((m) => m.segmentId === s.id && shown(m)) });
    });
    list.sort((a, b) => a.t.localeCompare(b.t));
    return list;
  }

  function reactionsHtml(m, mine) {
    const entries = Object.entries(m.reactions || {});
    const stack = entries.map(([e, list]) => {
      const on = list.some((x) => x.userId === store.userId);
      return `<button class="rxe ${on ? 'on' : ''}" data-act="rx" data-id="${m.id}" data-emoji="${esc(e)}" aria-pressed="${on}" aria-label="${esc(e)} ${list.length} 人"><span class="e">${esc(e)}</span></button>`;
    }).join('');
    return `<div class="rx-row">${entries.length ? `<span class="rx-stack" role="group" aria-label="表情回應">${stack}</span>` : ''}<button class="rx-add" data-act="rx-add" data-id="${m.id}" aria-label="選別的表情"><span class="ico sm i-plus"></span></button></div>`;
  }

  /* 文字一律先跳脫（不會執行任何網頁語法）；只有 http、https 開頭的網址會變成可以點的連結，點了在新分頁開啟 */
  function textHtml(m) {
    const safe = esc(m.text);
    // 網址只含英數字與常見的網址符號（遇到中文、空白就結束）；文字已經跳脫過，所以 & 是 &amp;
    const linked = safe.replace(/https?:\/\/[A-Za-z0-9\-._~:/?#[\]@!$&'()*+,;=%]+/g, (u) => {
      let url = u;
      // 跳脫出來的引號、角括號不算網址的一部分
      const cut = url.search(/&quot;|&lt;|&gt;|&#39;/);
      if (cut >= 0) url = url.slice(0, cut);
      let tail = u.slice(url.length);
      // 句尾的標點不算網址的一部分
      let end = url.length;
      while (end > 0) {
        const ch = url[end - 1];
        const head = url.slice(0, end);
        if ('.,;:!?]'.includes(ch)) end -= 1;
        else if (ch === ')' && head.split('(').length < head.split(')').length) end -= 1; // 括號沒成對才不算
        else break;
      }
      tail = url.slice(end) + tail;
      url = url.slice(0, end);
      if (!/^https?:\/\/[^/]+/.test(url)) return u;
      return `<a class="msg-link" href="${url}" target="_blank" rel="noopener noreferrer nofollow">${url}</a>${tail}`;
    });
    return linked.replace(/\n/g, '<br>');
  }

  function mediaHtml(m, expired) {
    const parts = [];
    if (m.images && m.images.length) {
      if (expired) parts.push(`<div class="bubble gone"><span class="gbox"><span class="ico i-image"></span></span>${m.images.length > 1 ? `${m.images.length} 張圖片已過期` : '圖片已過期'}</div>`);
      else {
        const n = m.images.length;
        const imgs = m.images.map((im, i) => `<img class="chat-img" data-media-src="${esc(im.id)}" data-lb="${i}" data-act="lb" data-id="${m.id}" alt="圖片" ${n === 1 && im.w ? `width="${Math.min(220, im.w)}"` : ''}>`).join('');
        parts.push({ grid: n === 1 ? `<span class="pic one">${imgs}</span>` : `<span class="img-grid g${n >= 3 ? 3 : 2}">${imgs}</span>` });
      }
    }
    if (m.video) {
      if (expired) parts.push(`<div class="bubble gone"><span class="gbox"><span class="ico i-play"></span></span>影片已過期</div>`);
      else parts.push({ grid: `<span class="pic vid" data-act="lbv" data-id="${m.id}" role="button" aria-label="播放影片"><img ${m.video.posterId ? `data-media-src="${esc(m.video.posterId)}"` : ''} alt="" class="vposter"><span class="vplaybadge"><span class="ico i-play"></span></span><span class="vdur">${mmss(m.video.duration || 0)}</span></span>` });
    }
    return parts;
  }

  function msgHtml(m) {
    const mine = m.userId === store.userId;
    if (m.hiddenAt) return `<div class="recall-row"><button type="button" class="sys recall deleted" data-hkey="${esc(m.id)}" aria-label="這邊刪除過，輕點或長按可以復原">這邊刪除過</button></div>`;
    const time = hhmm(m.createdAt);
    const nm = esc(m.nickname);
    const mark = m.announced ? '<span class="flower" style="width:14px;height:14px;display:inline-block;vertical-align:-2px;" title="公告"></span>' : '';
    if (m.recalled) {
      return mine
        ? `<div class="recall-row"><button class="sys recall" data-mine="1" data-id="${m.id}" aria-label="收回的訊息，輕點或長按可以復原">收回</button></div>`
        : `<div class="recall-row"><span class="sys recall" style="pointer-events:none;">收回</span></div>`;
    }
    const expired = isExpired(m, kind);
    let bubbles = '';
    const media = mediaHtml(m, expired);
    const gridParts = media.filter((x) => typeof x === 'object').map((x) => x.grid).join('');
    const goneParts = media.filter((x) => typeof x === 'string').join('');
    const hasText = !!m.text;
    if (hasText || gridParts) {
      bubbles += `<div class="bubble ${!hasText ? 'imgonly' : ''}" data-bubble data-id="${m.id}">${hasText ? textHtml(m) : ''}${gridParts}</div>`;
    }
    bubbles += goneParts;
    if (m.voice) {
      bubbles += expired || !m.voice.id
        ? `<div class="bubble voice expired" data-bubble data-id="${m.id}"><button class="vplay" disabled aria-label="語音已過期"><span class="ico sm i-play"></span></button><span class="wave" aria-hidden="true">${waveBars(0)}</span><span class="vtime">已過期</span></div>`
        : `<div class="bubble voice" data-bubble data-id="${m.id}"><button class="vplay" data-act="voice" data-id="${m.id}" aria-label="播放語音，${Math.round(m.voice.duration || 0)} 秒"><span class="ico sm i-play"></span></button><span class="wave" aria-hidden="true">${waveBars(0)}</span><span class="vtime">${mmss(m.voice.duration || 0)}</span></div>`;
    }
    if (m.file) {
      bubbles += expired
        ? `<div class="bubble file gone" data-bubble data-id="${m.id}"><span class="fileicon"><span class="ico i-file"></span></span><div class="col grow" style="min-width:0;"><span class="fname">${esc(m.file.name)}</span><span class="fmeta">已過期</span></div></div>`
        : `<div class="bubble file" data-bubble data-id="${m.id}"><span class="fileicon">${esc(fileBadge(m.file.name))}</span><div class="col grow" style="min-width:0;"><span class="fname">${esc(m.file.name)}</span><span class="fmeta">${formatBytes(m.file.size || 0)}${m.announced ? '' : ' · ' + expireLabel(expiresAt(m, kind))}</span></div><button class="btn-ico sm" data-act="dl" data-id="${m.id}" aria-label="下載"><span class="ico sm i-download"></span></button></div>`;
    }
    const meta = mine ? `<span>${time}</span>${mark}<b>${nm}</b>` : `<b>${nm}</b>${mark}<span>${time}</span>`;
    return `<div class="msg ${mine ? 'me' : ''}" data-id="${m.id}">
      ${mine ? '' : avatarHtml(m.avatar, 'sm')}
      <div class="stack" style="position:relative;">
        <div class="meta">${meta}</div>
        ${bubbles}
        ${reactionsHtml(m, mine)}
        ${readMark(m, mine)}
      </div>
      ${mine ? avatarHtml(m.avatar, 'sm') : ''}
    </div>`;
  }

  function readMark(m, mine) {
    if (!mine || kind !== 'dm' || store.role === 'owner') return '';
    const at = store.ownerReadAt[roomId];
    if (!at) return '';
    const mineMsgs = room().messages.filter((x) => x.userId === store.userId && !x.recalled && !x.segmentId);
    const last = mineMsgs.filter((x) => x.createdAt <= at).pop();
    return last && last.id === m.id ? '<div class="row gap8" style="margin-top:4px;padding:0 6px;"><span class="tiny muted bold">已讀</span></div>' : '';
  }

  function waveBars(done) {
    const hs = [8, 14, 10, 18, 12, 22, 16, 10, 20, 14, 8, 18, 12, 16, 10, 14, 8, 12];
    return hs.map((h, i) => `<i class="${i < done ? 'done' : ''}" style="height:${h}px;"></i>`).join('');
  }

  function renderAll({ keep = true } = {}) {
    const r = room();
    const wasBottom = atBottom();
    const prevTop = box.scrollTop;
    let html = '';
    if (r.loaded && r.messages.length && !r.hasMore) html += '<span class="sys top-note">已經到最早囉</span>';
    if (r.loading && r.hasMore) html += '<span class="sys top-note">載入中…</span>';
    let lastDay = '';
    items().forEach((it) => {
      const dk = dayKey(it.t);
      if (dk !== lastDay && it.kind !== 'note') {
        lastDay = dk;
        html += `<span class="sys date">${dayLabel(it.t)}</span>`;
      }
      if (it.kind === 'msg') html += msgHtml(it.m);
      else if (it.kind === 'note') html += `<span class="sys">${esc(it.n.text)}</span>`;
      else if (it.kind === 'secretEnd') html += it.s.hiddenAt
        ? `<button type="button" class="sys recall deleted" data-hkey="seg:${esc(it.s.id)}" aria-label="這邊刪除過，輕點或長按可以復原">這邊刪除過</button>`
        : `<button type="button" class="sys end" data-seg="seg:${esc(it.s.id)}" aria-label="悄悄話已結束，長按可以刪除">🫧 一段悄悄話已結束並清除</button>`;
      else if (it.kind === 'seg') {
        html += `<div class="seg" role="group" aria-label="悄悄話分段"><span class="seg-label"><span class="ico sm i-whisper"></span>悄悄話開始</span>${it.msgs.map(msgHtml).join('')}</div>`;
      }
    });
    box.innerHTML = html;
    bind();
    if (!keep || wasBottom) toBottom(); else box.scrollTop = prevTop;
  }

  /* ───────── 事件：長按、點擊 ───────── */
  function bind() {
    box.querySelectorAll('[data-bubble]').forEach((b) => {
      const open = (e) => openMsgMenu(b, b.dataset.id);
      b.tabIndex = 0;
      longPress(b, { onLong: open });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); open(e); });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ' || (e.shiftKey && e.key === 'F10')) { e.preventDefault(); open(e); } });
    });
    // 悄悄話結束的小字：長按（或右鍵、Enter）可以刪除
    box.querySelectorAll('.sys.end[data-seg]').forEach((b) => {
      const open = () => openSegMenu(b, b.dataset.seg);
      longPress(b, { onLong: open });
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); open(); });
      b.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } });
    });
    // 「這邊刪除過」的痕跡：輕點或長按，可以復原或直接刪除
    box.querySelectorAll('.sys.deleted[data-hkey]').forEach((b) => {
      const open = () => openDeletedMenu(b, b.dataset.hkey);
      b.addEventListener('click', open);
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); open(); });
    });
    box.querySelectorAll('.sys.recall[data-mine]').forEach((b) => {
      // 輕點、長按或按 Enter 都會跳出「復原」
      b.addEventListener('click', () => openRestoreMenu(b, b.dataset.id));
      b.addEventListener('contextmenu', (e) => { e.preventDefault(); openRestoreMenu(b, b.dataset.id); });
    });
  }

  function msgOf(id) { return room().messages.find((m) => m.id === id); }

  function openMsgMenu(anchor, id) {
    const m = msgOf(id);
    if (!m || m.recalled) return;
    const mine = m.userId === store.userId;
    const expired = isExpired(m, kind);
    const items = [];
    if (mine) items.push({ icon: 'i-trash', text: '收回', onClick: () => doRecall(m) });
    items.push({ html: `${flower}設為公告`, onClick: () => doAnnounce(m) });
    items.push({ icon: 'i-trash', text: '刪除（只有我這邊）', onClick: () => doHide(m.id) });
    if ((mine || store.role === 'owner') && hasMedia(m) && !expired) items.push({ icon: 'i-trash', text: '刪除檔案', danger: true, onClick: () => doDeleteMedia(m) });
    anchor.classList.add('pressed');
    popMenu(anchor, items, { align: mine ? 'right' : 'left', onClose: () => anchor.classList.remove('pressed') });
  }
  function openSegMenu(anchor, key) {
    anchor.classList.add('pressed');
    popMenu(anchor, [{ icon: 'i-trash', text: '刪除（只有我這邊）', onClick: () => doHide(key) }], { align: 'left', onClose: () => anchor.classList.remove('pressed') });
  }
  function openDeletedMenu(anchor, key) {
    anchor.classList.add('pressed');
    popMenu(anchor, [
      { icon: 'i-undo', text: '復原', onClick: async () => { try { await ctx.service.unhideItem({ roomId, key }); } catch (e) { toastError(e); } } },
      { icon: 'i-trash', text: '直接刪除', danger: true, onClick: async () => { try { await ctx.service.purgeItem({ roomId, key }); } catch (e) { toastError(e); } } },
    ], { align: 'left', onClose: () => anchor.classList.remove('pressed') });
  }
  async function doHide(key) {
    try {
      await ctx.service.hideItem({ roomId, key });
      toast('已刪除，只有你這邊看不到，對方不會知道。一天內可以復原', { icon: 'i-check', ms: 4500 });
    } catch (e) { toastError(e); }
  }
  function openRestoreMenu(anchor, id) {
    anchor.classList.add('pressed');
    popMenu(anchor, [{ icon: 'i-undo', text: '復原', onClick: () => doRestore(id) }], { align: 'left', onClose: () => anchor.classList.remove('pressed') });
  }

  async function doRecall(m) { try { await ctx.service.recallMessage({ roomId, messageId: m.id }); } catch (e) { toastError(e); } }
  async function doRestore(id) { try { await ctx.service.restoreMessage({ roomId, messageId: id }); } catch (e) { toastError(e); } }
  async function doAnnounce(m) {
    try { await ctx.service.setAnnouncement({ roomId, messageId: m.id }); toast('已設為公告', { icon: 'i-check' }); } catch (e) { toastError(e); }
  }
  async function doDeleteMedia(m) {
    try { await ctx.service.deleteMedia({ roomId, messageId: m.id }); m.expired = true; renderAll(); toast('檔案已刪除', { icon: 'i-check' }); } catch (e) { toastError(e); }
  }

  async function toggleReaction(id, emoji) {
    try { await ctx.service.toggleReaction({ roomId, messageId: id, emoji }); } catch (e) { toastError(e); }
  }

  function showReactTip(id, emoji) {
    box.querySelectorAll('.tip.under').forEach((t) => t.remove());
    const m = msgOf(id);
    const list = (m && m.reactions[emoji]) || [];
    const node = box.querySelector(`.msg[data-id="${CSS.escape(id)}"] .stack`);
    if (!node || !list.length) return;
    const names = list.slice(0, 3).map((x) => esc(x.nickname)).join('、') + (list.length > 3 ? `…等 ${list.length} 人` : '');
    const t = document.createElement('div');
    t.className = 'tip under';
    t.setAttribute('role', 'tooltip');
    t.innerHTML = `<span class="bold">按了 ${esc(emoji)} 的人</span><span>${names}</span>`;
    node.appendChild(t);
    setTimeout(() => t.remove(), 3000);
  }

  async function playVoice(btn, id) {
    const m = msgOf(id);
    if (!m || !m.voice) return;
    if (audio && audioBtn === btn) { if (audio.paused) audio.play(); else audio.pause(); return; }
    if (audio) { audio.pause(); resetAudioUi(); }
    const url = await mediaUrl(m.voice.id);
    if (!url) { toast('這則語音已經不在了', { soft: true }); return; }
    audio = new Audio(url);
    audioBtn = btn;
    const bars = btn.parentElement.querySelectorAll('.wave i');
    const time = btn.parentElement.querySelector('.vtime');
    const icon = btn.querySelector('.ico');
    audio.addEventListener('play', () => { icon.className = 'ico sm i-pause'; });
    audio.addEventListener('pause', () => { icon.className = 'ico sm i-play'; });
    audio.addEventListener('timeupdate', () => {
      const dur = audio.duration || m.voice.duration || 1;
      const n = Math.floor((audio.currentTime / dur) * bars.length);
      bars.forEach((b, i) => b.classList.toggle('done', i < n));
      time.textContent = `${mmss(audio.currentTime)} / ${mmss(dur)}`;
    });
    audio.addEventListener('ended', () => { resetAudioUi(); audio = null; audioBtn = null; });
    audio.play().catch(() => toast('沒辦法播放這則語音', { soft: true }));
  }
  function resetAudioUi() {
    if (!audioBtn) return;
    const m = msgOf(audioBtn.dataset.id);
    audioBtn.querySelector('.ico').className = 'ico sm i-play';
    audioBtn.parentElement.querySelectorAll('.wave i').forEach((b) => b.classList.remove('done'));
    if (m && m.voice) audioBtn.parentElement.querySelector('.vtime').textContent = mmss(m.voice.duration || 0);
  }

  async function download(id) {
    const m = msgOf(id);
    if (!m || !m.file) return;
    const url = await mediaUrl(m.file.id);
    if (!url) { toast('這個檔案已經不在了', { soft: true }); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = m.file.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  box.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    const id = b.dataset.id;
    if (act === 'rx') { toggleReaction(id, b.dataset.emoji).then(() => setTimeout(() => showReactTip(id, b.dataset.emoji), 80)); }
    else if (act === 'rx-add') openReactionPicker({ onPick: (em) => toggleReaction(id, em) });
    else if (act === 'voice') playVoice(b, id);
    else if (act === 'dl') download(id);
    else if (act === 'lb') {
      const m = msgOf(id);
      if (m) openLightbox({ items: m.images.map((im, i) => ({ kind: 'image', id: im.id, name: `圖片-${i + 1}.jpg` })), index: Number(b.dataset.lb), msg: m });
    } else if (act === 'lbv') {
      const m = msgOf(id);
      if (m && m.video) openLightbox({ items: [{ kind: 'video', id: m.video.id, name: m.video.name || '影片.mp4' }], index: 0, msg: m });
    }
  });

  /* ───────── 捲動、新訊息按鈕、載入更早 ───────── */
  function updateNewBtn() {
    newBtn.style.display = newCount > 0 && !atBottom() ? 'inline-flex' : 'none';
    el.querySelector('.nb-text').textContent = `${newCount} 則新訊息`;
  }
  box.addEventListener('scroll', () => {
    if (atBottom()) { newCount = 0; updateNewBtn(); }
    const r = room();
    if (box.scrollTop < 50 && r.loaded && r.hasMore && !r.loading) {
      const prevH = box.scrollHeight;
      store.loadOlder(roomId).then(() => { renderAll({ keep: true }); box.scrollTop = box.scrollHeight - prevH + 50; });
    }
  });
  newBtn.addEventListener('click', () => { toBottom(); newCount = 0; updateNewBtn(); });

  /* ───────── 聽 store 的變動 ───────── */
  const on = (ev, fn) => offs.push(store.on(ev, fn));
  on('room:loaded', (rid) => { if (rid === roomId) { renderAll({ keep: false }); } });
  on('messages:reset', (rid) => { if (rid === roomId) renderAll(); });
  on('message:added', (rid, m) => {
    if (rid !== roomId) return;
    const mine = m.userId === store.userId;
    const was = atBottom();
    renderAll({ keep: true });
    if (mine || was) toBottom();
    else if (!m.segmentId || true) { newCount += 1; updateNewBtn(); }
  });
  on('message:updated', (rid) => { if (rid === roomId) renderAll(); });
  on('secret', (rid) => { if (rid === roomId) renderAll(); });
  on('note', (rid) => { if (rid === roomId) { const was = atBottom(); renderAll(); if (was) toBottom(); } });
  on('avatars', () => renderAll());
  on('media', () => renderAll());
  on('items', (rid) => { if (rid === roomId) renderAll(); });
  // 刪除的痕跡過了一天就消失
  const sweep = setInterval(() => {
    const r = room();
    if (r.messages.some((m) => m.hiddenAt && !hiddenLive(m)) || r.segments.some((s) => s.hiddenAt && !hiddenLive(s))) renderAll();
  }, 60000);
  on('owner', () => renderAll());

  if (room().loaded) renderAll({ keep: false });

  return {
    el,
    renderAll,
    toBottom,
    jumpTo(id) {
      const n = box.querySelector(`.msg[data-id="${CSS.escape(id)}"]`);
      if (!n) { toast('這則訊息太舊了，往上滑可以載入更早的', { soft: true }); return; }
      n.scrollIntoView({ block: 'center', behavior: 'smooth' });
      n.classList.add('flash');
      setTimeout(() => n.classList.remove('flash'), 1800);
    },
    destroy() { offs.forEach((f) => f()); clearInterval(sweep); if (audio) audio.pause(); },
  };
}
