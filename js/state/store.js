/* 目前的訊息、在線名單、連線狀態、斷線暫存訊息。
   畫面只讀這裡的資料、聽這裡發出的事件；資料怎麼來，由 ChatService 決定。 */
import { Emitter } from '../utils/dom.js';
import { local } from '../utils/storage.js';
import { config } from '../config.js';
import { uuid, nowIso } from '../utils/time.js';
import { ServiceError } from '../services/chatService.js';

const DEFAULT_AVATAR = 'crab';

function newRoom(id) {
  return {
    id, messages: [], loaded: false, hasMore: false, segments: [], activeSegment: null,
    announcements: [], notes: [], newCount: 0, loading: false,
  };
}

class Store extends Emitter {
  constructor() {
    super();
    this.service = null;
    this.userId = null;
    this.role = 'visitor';
    this.connection = 'connected';
    this.profile = local.get('profile'); // { nickname, avatar }  好多人
    this.dmProfile = local.get('dmProfile'); // { name, avatar }  兩個人
    this.rooms = {};
    this.presence = [];
    this.dmSession = null; // { roomId, name, avatar, remembered }
    this.ownerStatus = { visible: false, online: false };
    this.ownerReadAt = {};
    this.dms = [];
    this.lastSendAt = 0;
    this.unreadTab = { group: false, dm: false };
    this.openDmId = null; // 縵目前打開的對話
    this.ownerProfile = { name: '縵', avatar: 'mm' }; // 縵在一對一對話裡顯示的名字與頭像
  }

  room(id) {
    return (this.rooms[id] ||= newRoom(id));
  }

  /* ───────── 接上 ChatService ───────── */
  attach(service) {
    this.service = service;
    const on = (ev, fn) => service.on(ev, fn);

    on('connection:changed', ({ status }) => { this.connection = status; this.emit('connection'); });
    on('presence:sync', ({ users }) => { this.presence = users; this.emit('presence'); });
    on('presence:joined', ({ user }) => {
      if (user.userId === this.userId) return;
      if (!this.presence.some((u) => u.userId === user.userId)) this.presence.push(user);
      this.addNote('group', `🌸 ${user.nickname} 進來了`);
      this.emit('presence');
    });
    on('presence:left', ({ user }) => {
      this.presence = this.presence.filter((u) => u.userId !== user.userId);
      this.addNote('group', `🍃 ${user.nickname} 離開了`);
      this.emit('presence');
    });
    on('avatar:removed', ({ userId }) => {
      const fix = (o) => { if (o.userId === userId && String(o.avatar).startsWith('media:')) o.avatar = DEFAULT_AVATAR; };
      Object.values(this.rooms).forEach((r) => r.messages.forEach(fix));
      this.presence.forEach(fix);
      if (userId === this.userId) {
        if (this.profile && String(this.profile.avatar).startsWith('media:')) this.setProfile({ ...this.profile, avatar: DEFAULT_AVATAR });
        if (this.dmProfile && String(this.dmProfile.avatar).startsWith('media:')) this.setDmProfile({ ...this.dmProfile, avatar: DEFAULT_AVATAR });
      }
      this.emit('avatars');
    });
    on('message:new', ({ message }) => this.addMessage(message));
    on('message:recalled', ({ roomId, messageId }) => {
      const m = this.findMessage(roomId, messageId);
      if (m) { m.recalled = true; m.reactions = {}; this.emit('message:updated', roomId, messageId); }
    });
    on('message:restored', ({ roomId, message }) => {
      const r = this.room(roomId);
      const i = r.messages.findIndex((x) => x.id === message.id);
      if (i >= 0) { r.messages[i] = message; this.emit('message:updated', roomId, message.id); }
    });
    on('reaction:added', ({ roomId, messageId, emoji, user }) => {
      const m = this.findMessage(roomId, messageId);
      if (!m) return;
      const list = (m.reactions[emoji] ||= []);
      if (!list.some((x) => x.userId === user.userId)) list.push(user);
      this.emit('message:updated', roomId, messageId);
    });
    on('reaction:removed', ({ roomId, messageId, emoji, userId }) => {
      const m = this.findMessage(roomId, messageId);
      if (!m || !m.reactions[emoji]) return;
      m.reactions[emoji] = m.reactions[emoji].filter((x) => x.userId !== userId);
      if (!m.reactions[emoji].length) delete m.reactions[emoji];
      this.emit('message:updated', roomId, messageId);
    });
    on('secret:started', ({ roomId, segment }) => {
      const r = this.room(roomId);
      if (!r.segments.some((s) => s.id === segment.id)) r.segments.push(segment);
      r.activeSegment = segment;
      this.emit('secret', roomId);
    });
    on('secret:ended', ({ roomId, segmentId, endedAt }) => {
      const r = this.room(roomId);
      const s = r.segments.find((x) => x.id === segmentId);
      if (s) s.endedAt = endedAt;
      r.messages = r.messages.filter((m) => m.segmentId !== segmentId);
      if (r.activeSegment && r.activeSegment.id === segmentId) r.activeSegment = null;
      this.emit('secret', roomId);
      this.emit('messages:reset', roomId);
    });
    on('announcement:changed', ({ roomId, items }) => { this.room(roomId).announcements = items; this.emit('announcements', roomId); });
    on('owner:status', ({ online, visible }) => { this.ownerStatus = { online: !!online, visible: visible !== false }; this.emit('owner'); });
    on('owner:readAt', ({ roomId, readAt }) => {
      if (roomId === null) this.ownerReadAt = {}; else this.ownerReadAt[roomId] = readAt;
      this.emit('owner');
    });
    on('dm:summary', ({ dm }) => {
      const i = this.dms.findIndex((x) => x.roomId === dm.roomId);
      if (i >= 0) this.dms[i] = dm; else this.dms.push(dm);
      this.sortDms();
      this.emit('dms');
    });
    on('dm:removed', ({ roomId }) => {
      this.dms = this.dms.filter((x) => x.roomId !== roomId);
      delete this.rooms[roomId];
      if (this.dmSession && this.dmSession.roomId === roomId) { this.dmSession = null; this.emit('dm:removed', roomId); }
      if (this.openDmId === roomId) { this.openDmId = null; }
      this.emit('dms');
      this.emit('dm:removed', roomId);
    });
    on('auth:changed', ({ role }) => { this.role = role; this.emit('auth'); });
    on('media:expired', () => this.emit('media'));
    on('owner:profile', ({ profile }) => { this.ownerProfile = profile; this.emit('ownerprofile'); });
    /* 「刪除」只有我這邊：訊息或悄悄話結束的小字，key 是訊息編號或 seg:分段編號 */
    const target = (roomId, key) => {
      const r = this.room(roomId);
      return key.startsWith('seg:')
        ? { r, seg: r.segments.find((s) => 'seg:' + s.id === key) }
        : { r, m: r.messages.find((x) => x.id === key) };
    };
    on('item:hidden', ({ roomId, key, at }) => {
      const t = target(roomId, key);
      const o = t.m || t.seg;
      if (o) o.hiddenAt = at;
      this.emit('items', roomId);
    });
    on('item:unhidden', ({ roomId, key }) => {
      const t = target(roomId, key);
      const o = t.m || t.seg;
      if (o) delete o.hiddenAt;
      this.emit('items', roomId);
    });
    on('item:purged', ({ roomId, key }) => {
      const t = target(roomId, key);
      if (t.m) t.r.messages = t.r.messages.filter((x) => x.id !== key);
      if (t.seg) t.r.segments = t.r.segments.filter((s) => s !== t.seg);
      this.emit('items', roomId);
    });
  }

  sortDms() {
    // 已封鎖的排最下面，其次置頂的在前，最後依最新訊息時間
    this.dms.sort((a, b) => (Number(!!a.blocked) - Number(!!b.blocked)) || (Number(!!b.pinned) - Number(!!a.pinned)) || String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
  }

  /* ───────── 訊息 ───────── */
  findMessage(roomId, id) {
    return this.room(roomId).messages.find((m) => m.id === id);
  }

  addMessage(message) {
    const r = this.room(message.roomId);
    if (r.messages.some((m) => m.id === message.id)) return;
    if (!r.loaded && message.roomId !== 'group' && this.role !== 'owner') { /* 還沒打開的房間：只記未讀 */ }
    r.messages.push(message);
    r.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    this.emit('message:added', message.roomId, message);
    const mine = message.userId === this.userId;
    if (!mine) {
      const tab = message.roomId === 'group' ? 'group' : 'dm';
      this.emit('incoming', message.roomId, message, tab);
    }
  }

  async loadRoom(roomId) {
    const r = this.room(roomId);
    r.loading = true;
    try {
      const res = await this.service.loadRecent({ roomId });
      r.messages = res.messages;
      r.hasMore = res.hasMore;
      r.segments = res.segments || [];
      r.activeSegment = res.activeSegment || null;
      r.announcements = res.announcements || [];
      if (res.ownerProfile) { this.ownerProfile = res.ownerProfile; this.emit('ownerprofile'); }
      r.loaded = true;
      r.newCount = 0;
    } finally {
      r.loading = false;
    }
    this.emit('room:loaded', roomId);
    return r;
  }

  async loadOlder(roomId) {
    const r = this.room(roomId);
    if (r.loading || !r.hasMore) return;
    const first = r.messages.find((m) => !m.segmentId);
    if (!first) return;
    r.loading = true;
    try {
      const res = await this.service.loadOlder({ roomId, beforeCreatedAt: first.createdAt, beforeId: first.id });
      const ids = new Set(r.messages.map((m) => m.id));
      r.messages = [...res.messages.filter((m) => !ids.has(m.id)), ...r.messages];
      r.hasMore = res.hasMore;
    } finally { r.loading = false; }
    this.emit('older:loaded', roomId);
  }

  /* ───────── 送出與斷線暫存 ───────── */
  cooldownLeft() {
    const left = this.lastSendAt + config.limits.cooldownSeconds * 1000 - Date.now();
    return Math.max(0, left / 1000); // 回傳還剩幾秒（可以是小數，例如 0.3）
  }

  /* 回傳 { queued: true } 表示斷線中，文字已存進暫存列 */
  async send(roomId, payload) {
    if (this.connection !== 'connected') {
      if (payload.images?.length || payload.file || payload.voice || payload.video) throw new ServiceError('offline');
      if (!String(payload.text || '').trim()) return { queued: false };
      const ok = this.addDraft(roomId, payload.text);
      if (!ok) throw new ServiceError('network', `暫存訊息最多 ${config.limits.draftsMax} 則，請先處理舊的`);
      return { queued: true };
    }
    const id = uuid();
    const res = await this.service.sendMessage({ roomId, id, ...payload });
    this.lastSendAt = Date.now();
    this.emit('cooldown');
    return { queued: false, message: res && res.message };
  }

  draftsKey(roomId) { return 'drafts.' + roomId; }
  getDrafts(roomId) { return local.get(this.draftsKey(roomId), []); }
  setDrafts(roomId, list) {
    local.set(this.draftsKey(roomId), list);
    this.emit('drafts', roomId, list);
  }
  addDraft(roomId, text) {
    const list = this.getDrafts(roomId);
    if (list.length >= config.limits.draftsMax) return false;
    list.push({ id: uuid(), text, savedAt: nowIso() });
    this.setDrafts(roomId, list);
    return true;
  }
  removeDraft(roomId, id) {
    this.setDrafts(roomId, this.getDrafts(roomId).filter((d) => d.id !== id));
  }

  /* ───────── 進出提示等置中的小字（不會存起來）───────── */
  addNote(roomId, text) {
    const r = this.room(roomId);
    const note = { id: uuid(), text, at: nowIso() };
    r.notes.push(note);
    if (r.notes.length > 60) r.notes.shift();
    this.emit('note', roomId, note);
  }

  /* ───────── 記住的資料 ───────── */
  setProfile(p) { this.profile = p; if (p) local.set('profile', p); else local.remove('profile'); }
  setDmProfile(p) { this.dmProfile = p; if (p) local.set('dmProfile', p); else local.remove('dmProfile'); }
  get lastTab() { return local.get('lastTab', null); }
  set lastTab(v) { local.set('lastTab', v); }
}

export const store = new Store();
