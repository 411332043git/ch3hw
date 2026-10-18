/* 在線名單（只有「好多人」用）：自己標「（我）」並排最上面，其他人依進來先後排列；同一個人開多分頁只算一列 */
import { store } from '../state/store.js';
import { avatarHtml, esc } from '../utils/sanitize.js';

export function onlineUsers() {
  const seen = new Set();
  const others = [];
  let me = null;
  store.presence.forEach((u) => {
    if (seen.has(u.userId)) return;
    seen.add(u.userId);
    if (u.userId === store.userId) me = u; else others.push(u);
  });
  others.sort((a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)));
  if (!me && store.profile) me = { userId: store.userId, nickname: store.profile.nickname, avatar: store.profile.avatar };
  return { me, others, count: others.length + (me ? 1 : 0) };
}

/* variant: 'card'（手機展開用）或 'side'（電腦左欄用） */
export function createOnlineList({ variant = 'card' } = {}) {
  const el = document.createElement('div');
  el.className = variant === 'side' ? 'col online-list side-list' : 'card col grp online-list';
  el.setAttribute('role', 'list');
  el.setAttribute('aria-label', '在線名單');
  const render = () => {
    const { me, others, count } = onlineUsers();
    const row = (u, isMe) => `<div class="row" style="min-height:42px;gap:10px;${isMe ? 'background:var(--accent-soft);border-radius:18px;padding:0 8px;' : 'padding:0 8px;'}" role="listitem">
      ${avatarHtml(u.avatar, 'sm', isMe ? 'me-ring' : '')}<span class="bold grow nowrap">${esc(u.nickname)}${isMe ? '（我）' : ''}</span>${isMe ? '<span class="chip mint" style="height:24px;font-size:12px;">在線</span>' : '<span class="dot"></span>'}</div>`;
    el.innerHTML = (variant === 'side' ? `<div class="row gap8" style="padding:2px 4px 6px;"><span class="h2 grow">在線名單</span><span class="chip mint"><span class="dot"></span>${count} 人</span><button class="btn-ico flat sm" data-act="collapse" aria-label="收起在線名單"><span class="ico sm i-left"></span></button></div>` : '')
      + (me ? row(me, true) : '') + others.map((u) => row(u, false)).join('');
  };
  render();
  const off = store.on('presence', render);
  const off2 = store.on('avatars', render);
  return { el, destroy() { off(); off2(); } };
}
