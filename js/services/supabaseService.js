/* 階段二：Supabase 版 ChatService。
   指令與事件和 mockService 一模一樣（見 chatService.js），畫面不用改。
   兩個連線（client）：
     vc（訪客）：匿名登入。「好多人」永遠用它，訪客的「兩個人」也用它。縵在「好多人」裡也是用它的匿名身分，
                 所以資料庫看不出誰是縵。
     oc（縵）  ：Email＋密碼登入。縵的一對一對話與管理都用它。
   房間編號：畫面上「好多人」叫 'group'，資料庫裡是固定的 uuid，這裡負責轉換。 */
import { ChatService, ServiceError, ERROR_TEXT } from './chatService.js';
import { config } from '../config.js';
import { nowIso, uuid } from '../utils/time.js';
import { local, session } from '../utils/storage.js';
import { getMedia } from '../utils/mediaStore.js';
import { validateNickname, hasContent, validateMessageText, validateCode } from '../utils/validators.js';
import { isBlockedFile } from '../utils/sanitize.js';

const GROUP_UI = config.groupRoomId; // 'group'
const GROUP_DB = '00000000-0000-4000-8000-000000000001';
const DEFAULT_AVATAR = 'crab';
const DAY = 86400000;
const BUCKET = 'chat-images';
const OWNER_FLAG = 'ownerRemember'; // 這台裝置是否「記得」站長登入（決定憑證放長期還是只放這個分頁）

/* ───────── 小工具 ───────── */
function deviceName() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '瀏覽器';
  const o = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '電腦';
  return `${b} · ${o}`;
}
const iso = (s) => (s ? new Date(s).toISOString() : null);
const isUrl = (a) => typeof a === 'string' && /^https:\/\//.test(a);

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.supabase && window.supabase.createClient) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new ServiceError('network', '連線元件載入失敗'));
    document.head.appendChild(s);
  });
}

/* 把 Supabase 的錯誤翻成合約裡的錯誤代碼 */
function toError(e) {
  if (!e) return new ServiceError('network');
  if (e instanceof ServiceError) return e;
  const msg = String(e.message || e);
  if (/^[a-z_]+$/.test(msg) && ERROR_TEXT[msg]) return new ServiceError(msg);
  if (/row-level security|permission denied/i.test(msg)) return new ServiceError('cannot_send');
  if (/exceeded the maximum allowed size|too large/i.test(msg)) return new ServiceError('file_too_large');
  if (/mime type|not supported|invalid_mime/i.test(msg)) return new ServiceError('file_type_blocked');
  if (/Invalid login credentials/i.test(msg)) return new ServiceError('login_failed');
  if (/already registered|already been registered/i.test(msg)) return new ServiceError('claim_closed');
  if (/password/i.test(msg) && /(short|least|weak|characters)/i.test(msg)) return new ServiceError('password_mismatch');
  if (/fetch|network|Failed to/i.test(msg)) return new ServiceError('network');
  return new ServiceError('network', msg);
}

/* 縵的登入憑證放哪裡：記得這台裝置 → 長期（localStorage）；沒記得 → 只在這個分頁（sessionStorage） */
function ownerStorage() {
  const pick = () => (local.get(OWNER_FLAG) ? window.localStorage : window.sessionStorage);
  return {
    getItem: (k) => { try { return pick().getItem(k); } catch { return null; } },
    setItem: (k, v) => { try { pick().setItem(k, v); } catch { /* 忽略 */ } },
    removeItem: (k) => { try { window.localStorage.removeItem(k); window.sessionStorage.removeItem(k); } catch { /* 忽略 */ } },
  };
}
const OWNER_KEY = 'ch3hw-owner-auth';
const VISITOR_KEY = 'ch3hw-visitor-auth';

export class SupabaseService extends ChatService {
  constructor() {
    super();
    this.s = {
      role: 'visitor', nickname: '', avatar: DEFAULT_AVATAR, inGroup: false,
      dm: null,                 // { roomId, name, avatar, unlocked, remembered }
      secretFrom: nowIso(), joinedAt: null,
    };
    this.vc = null; this.oc = null;
    this.vUid = null; this.oUid = null;
    this.ownerProfile = { name: '縵', avatar: 'mm' };
    this.activeSeg = {};        // roomId(ui) → 進行中的分段編號
    this.reactionCache = {};    // messageId → { userId → emoji }
    this.channels = [];
    this.presence = null;
    this.timers = {};
    this.connection = 'connected';
    this.summaryCache = {};
    this.annIds = {};           // roomId → Set(messageId)
    this.ownerReadTimer = null;
  }

  /* ───────── 啟動 ───────── */
  async init() {
    const { url, publishableKey } = config.supabase;
    if (!url || !publishableKey) throw new ServiceError('network', '還沒填 Supabase 的 Project URL 與 Publishable key');
    await loadScript(new URL('./js/vendor/supabase.umd.js', document.baseURI).href);
    const { createClient } = window.supabase;
    this.vc = createClient(url, publishableKey, {
      auth: { storageKey: VISITOR_KEY, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    this.oc = createClient(url, publishableKey, {
      auth: { storageKey: OWNER_KEY, storage: ownerStorage(), persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    // 訪客一定要有身分（匿名登入）
    let { data } = await this.vc.auth.getSession();
    if (!data.session) {
      const r = await this.vc.auth.signInAnonymously();
      if (r.error) throw toError(r.error);
      data = r.data;
    }
    this.vUid = data.session.user.id;
    // 縵：有憑證而且這台裝置沒被忘記，才算登入
    const os = await this.oc.auth.getSession();
    if (os.data.session) {
      this.oUid = os.data.session.user.id;
      const ok = await this.oc.rpc('owner_device_ok');
      if (!ok.data) { this.oUid = null; await this.oc.auth.signOut().catch(() => {}); }
    }
    this._wireNetwork();
    this._ensurePresence();
    this._startSubscriptions();
    setInterval(() => this.emit('media:expired', {}), 60000);
    return this;
  }

  /* ───────── 內部：身分與房間 ───────── */
  get isOwner() { return this.s.role === 'owner'; }
  get myId() { return this.isOwner ? this.oUid : this.vUid; }
  /* 縵的「好多人」匿名身分，在畫面上也算縵自己（訊息才會靠右） */
  nu(id) { return this.isOwner && id === this.vUid ? this.oUid : id; }
  rid(roomId) { return roomId === GROUP_UI ? GROUP_DB : roomId; }
  uid(dbId) { return dbId === GROUP_DB ? GROUP_UI : dbId; }
  /* 這個房間的指令要用哪個連線 */
  cl(roomId) { return roomId === GROUP_UI ? this.vc : this.isOwner ? this.oc : this.vc; }
  dmName() { return this.isOwner ? this.ownerProfile.name : (this.s.dm && this.s.dm.name) || this.s.nickname; }
  dmAvatar() { return this.isOwner ? this.ownerProfile.avatar : (this.s.dm && this.s.dm.avatar) || DEFAULT_AVATAR; }
  need(roomId) {
    if (roomId === GROUP_UI) return;
    if (this.isOwner) return;
    if (!this.s.dm || this.s.dm.roomId !== roomId || !this.s.dm.unlocked) throw new ServiceError('cannot_send');
  }
  async rpc(client, fn, args) {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw toError(error);
    return data;
  }

  /* ───────── 訊息與資料的轉換 ───────── */
  _view(row, reactions) {
    const media = row.media || {};
    const rid = this.uid(row.room_id);
    const days = rid === GROUP_UI ? config.expireDays.group : config.expireDays.dm;
    const createdAt = iso(row.created_at);
    const hasMedia = (media.images && media.images.length) || media.file || media.voice || media.video;
    const announced = !!(this.annIds[rid] && this.annIds[rid].has(row.id));
    return {
      id: row.id, roomId: rid, userId: this.nu(row.user_id), nickname: row.nickname, avatar: row.avatar,
      text: row.content ?? null, images: media.images || [], file: media.file || null,
      voice: media.voice || null, video: media.video || null,
      createdAt, recalled: !!row.recalled, segmentId: row.segment_id || null,
      reactions: reactions || {}, announced,
      expired: !!(hasMedia && !announced && !row.recalled && Date.now() - Date.parse(createdAt) > days * DAY),
    };
  }

  async _reactionsFor(ids) {
    const out = {};
    if (!ids.length) return out;
    const { data, error } = await this.vc.from('reactions').select('message_id,user_id,emoji,nickname').in('message_id', ids);
    const d2 = this.isOwner ? await this.oc.from('reactions').select('message_id,user_id,emoji,nickname').in('message_id', ids) : null;
    const rows = [...(error ? [] : data || []), ...(d2 && !d2.error ? d2.data || [] : [])];
    const seen = new Set();
    rows.forEach((r) => {
      const k = r.message_id + r.user_id;
      if (seen.has(k)) return;
      seen.add(k);
      ((out[r.message_id] ||= {})[r.emoji] ||= []).push({ userId: this.nu(r.user_id), nickname: r.nickname });
      (this.reactionCache[r.message_id] ||= {})[r.user_id] = r.emoji;
    });
    return out;
  }

  async _hiddenMap(roomId) {
    const c = this.cl(roomId);
    const { data } = await c.from('hidden_items').select('key,hidden_at,purged').eq('room_id', this.rid(roomId));
    const map = {};
    (data || []).forEach((h) => { map[h.key] = { at: iso(h.hidden_at), purged: h.purged }; });
    return map;
  }
  _hiddenLive(h) { return h && !h.purged && Date.now() - Date.parse(h.at) < DAY; }

  async _annList(roomId) {
    const c = this.cl(roomId);
    const { data: anns } = await c.from('announcements').select('message_id,created_at').eq('room_id', this.rid(roomId)).order('created_at', { ascending: false });
    const list = anns || [];
    this.annIds[roomId] = new Set(list.map((a) => a.message_id));
    if (!list.length) return [];
    const { data: msgs } = await c.from('messages').select('*').in('id', list.map((a) => a.message_id));
    const byId = new Map((msgs || []).map((m) => [m.id, m]));
    return list.map((a) => {
      const m = byId.get(a.message_id);
      return m ? { messageId: a.message_id, announcedAt: iso(a.created_at), message: this._view(m, {}) } : null;
    }).filter(Boolean);
  }

  /* ───────── 網路狀態 ───────── */
  _wireNetwork() {
    const set = (status) => {
      if (this.connection === status) return;
      this.connection = status;
      this.emit('connection:changed', { status });
    };
    window.addEventListener('offline', () => set('offline'));
    window.addEventListener('online', () => { set('reconnecting'); setTimeout(() => { if (this.connection === 'reconnecting' && navigator.onLine) set('connected'); }, 4000); });
    this._setConn = set;
  }

  /* ───────── 即時推播 ───────── */
  _startSubscriptions() {
    this._hook(this.vc, 'db-visitor', true);
    if (this.oUid) this._hook(this.oc, 'db-owner', false);
    this.vc.auth.onAuthStateChange((ev) => { if (ev === 'TOKEN_REFRESHED') this.vc.realtime.setAuth(); });
  }
  _hook(client, name, isV) {
    const ch = client.channel(name)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (p) => this._onMsgInsert(p.new, isV))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => this._onMsgUpdate(p.new, isV))
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, () => this._onMsgDelete(isV))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'reactions' }, (p) => this._onReaction(p, isV))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'secret_sessions' }, (p) => this._onSecret(p, isV))
      .on('postgres_changes', { event: '*', schema: 'public', table: 'announcements' }, (p) => this._onAnnouncement(p, isV))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') { if (this.connection !== 'connected') this._setConn('connected'); }
        else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') this._setConn(navigator.onLine ? 'reconnecting' : 'offline');
      });
    this.channels.push(ch);
  }

  /* 這個連線收到的事件，要不要處理：縵的連線不管「好多人」（那是訪客連線的事），避免重複 */
  _mine(dbRoom, isVisitorClient) {
    if (this.isOwner) return isVisitorClient ? dbRoom === GROUP_DB : dbRoom !== GROUP_DB;
    return isVisitorClient;
  }

  async _onMsgInsert(row, isV) {
    if (!this._mine(row.room_id, isV)) return;
    this.msgRoom = this.msgRoom || {};
    this.msgRoom[row.id] = this.uid(row.room_id);
    const v = this._view(row, {});
    if (row.segment_id && this.uid(row.room_id) !== GROUP_UI && row.created_at && iso(row.created_at) < this.s.secretFrom) return;
    this.emit('message:new', { message: v });
    if (this.isOwner && row.room_id !== GROUP_DB) this._refreshSummaries();
  }
  async _onMsgUpdate(row, isV) {
    if (!this._mine(row.room_id, isV)) return;
    const rid = this.uid(row.room_id);
    if (row.recalled) { this.emit('message:recalled', { roomId: rid, messageId: row.id }); }
    else {
      const reactions = await this._reactionsFor([row.id]);
      this.emit('message:restored', { roomId: rid, message: this._view(row, reactions[row.id] || {}) });
    }
    if (this.isOwner && rid !== GROUP_UI) this._refreshSummaries();
  }
  _onMsgDelete(isV) {
    // 悄悄話結束或對話被刪：訪客確認自己的聊天室還在不在
    if (isV && !this.isOwner && this.s.dm) {
      clearTimeout(this.timers.dmCheck);
      this.timers.dmCheck = setTimeout(async () => {
        const d = await this.vc.rpc('get_dm_session');
        if (!d.error && !d.data && this.s.dm) {
          const roomId = this.s.dm.roomId;
          this.s.dm = null;
          this._stopDmTimers();
          this.emit('dm:removed', { roomId });
        }
      }, 800);
    }
    if (!isV && this.isOwner) this._refreshSummaries();
  }
  _onReaction(p, isV) {
    const row = p.eventType === 'DELETE' ? p.old : p.new;
    if (!row || !row.message_id) return;
    const cache = (this.reactionCache[row.message_id] ||= {});
    const roomDb = row.room_id; // 刪除事件只有主鍵，沒有 room_id
    if (roomDb && !this._mine(roomDb, isV)) return;
    const rid = roomDb ? this.uid(roomDb) : this._roomOfMessage(row.message_id);
    if (!rid) return;
    const user = { userId: this.nu(row.user_id), nickname: row.nickname };
    const old = cache[row.user_id];
    if (p.eventType === 'DELETE') {
      if (old) { this.emit('reaction:removed', { roomId: rid, messageId: row.message_id, emoji: old, userId: user.userId }); delete cache[row.user_id]; }
      return;
    }
    if (old && old !== row.emoji) this.emit('reaction:removed', { roomId: rid, messageId: row.message_id, emoji: old, userId: user.userId });
    cache[row.user_id] = row.emoji;
    this.emit('reaction:added', { roomId: rid, messageId: row.message_id, emoji: row.emoji, user });
  }
  _roomOfMessage(messageId) { return (this.msgRoom && this.msgRoom[messageId]) || null; }
  _onSecret(p, isV) {
    const row = p.new;
    if (!row || !this._mine(row.room_id, isV)) return;
    const rid = this.uid(row.room_id);
    if (p.eventType === 'INSERT') {
      this.activeSeg[rid] = row.id;
      this._startSecretTimer(rid);
      this.emit('secret:started', { roomId: rid, segment: { id: row.id, roomId: rid, startedAt: iso(row.started_at), endedAt: null } });
    } else if (row.ended_at) {
      delete this.activeSeg[rid];
      this._stopSecretTimer();
      this.emit('secret:ended', { roomId: rid, segmentId: row.id, endedAt: iso(row.ended_at) });
      this._cleanSecretFiles(rid, row.id);
    }
    if (this.isOwner) this._refreshSummaries();
  }
  async _onAnnouncement(p, isV) {
    const row = p.new || p.old;
    if (row && row.room_id && !this._mine(row.room_id, isV)) return;
    const rooms = row && row.room_id ? [this.uid(row.room_id)] : Object.keys(this.annIds);
    for (const rid of rooms) {
      if (!this._mine(this.rid(rid), isV)) continue;
      this.emit('announcement:changed', { roomId: rid, items: await this._annList(rid) });
    }
  }
  /* ───────── 共用指令 ───────── */
  async getSession() {
    const out = { role: this.s.role, userId: this.myId, deviceId: 'web', dm: null, owner: { claimed: true, remembered: !!local.get(OWNER_FLAG) } };
    // 訪客的一對一聊天室
    try {
      const d = await this.rpc(this.vc, 'get_dm_session');
      if (d) {
        out.dm = { roomId: d.roomId, name: d.name, loginName: d.name, avatar: d.avatar, remembered: d.remembered, unlocked: d.unlocked };
        this.s.dm = d.unlocked ? { roomId: d.roomId, name: d.name, avatar: d.avatar, unlocked: true, remembered: d.remembered } : null;
        if (d.unlocked) this._startDmTimers();
      } else this.s.dm = null;
    } catch { /* 網路問題：先當作沒有聊天室 */ }
    // 縵：這個分頁有縵的憑證，而且沒有選過「我是訪客」
    const asVisitor = !!session.get('asVisitor');
    if (!asVisitor && this.oUid) {
      this.s.role = 'owner';
      out.role = 'owner';
      this.oc.rpc('owner_device_ok');
      this._announceOwnerOnline();
    }
    out.userId = this.myId;
    return out;
  }

  async join({ nickname, avatar }) {
    const v = validateNickname(nickname);
    if (!v.ok) throw new ServiceError(v.code, v.reason);
    const av = await this._normalizeAvatar(avatar, this.vc, this.vUid);
    // 暱稱撞名：跟現在在線的人比（Presence）
    await this._ensurePresence();
    const taken = Object.entries(this.presence.presenceState()).some(([key, metas]) => key !== this.vUid
      && metas.some((m) => String(m.nickname).toLowerCase().replace(/\s+/g, '') === v.value.toLowerCase().replace(/\s+/g, '')));
    if (taken) throw new ServiceError('nickname_taken');
    this.s.nickname = v.value;
    this.s.avatar = av;
    this.s.inGroup = true;
    this.s.joinedAt = nowIso();
    await this.presence.track({ userId: this.vUid, nickname: v.value, avatar: av, joinedAt: this.s.joinedAt });
    this.emit('presence:sync', { users: this._presenceUsers() });
    return { user: { userId: this.nu(this.vUid), nickname: v.value, avatar: av, joinedAt: this.s.joinedAt } };
  }

  async leave() {
    this.s.inGroup = false;
    if (this.presence) { try { await this.presence.untrack(); } catch { /* 忽略 */ } }
  }

  _presenceUsers() {
    const st = this.presence.presenceState();
    return Object.values(st).map((metas) => metas[0]).filter(Boolean)
      .map((m) => ({ userId: this.nu(m.userId), nickname: m.nickname, avatar: m.avatar, joinedAt: m.joinedAt }));
  }

  _ensurePresence() {
    // 一開始就在背景連好在線名單，使用者按「進入」時撞名檢查才有完整資料
    return (this._presP ||= this._openPresence());
  }
  async _openPresence() {
    this.presence = this.vc.channel('group-presence', { config: { presence: { key: this.vUid }, broadcast: { self: true } } });
    const knownBefore = new Set();
    this.presence
      .on('presence', { event: 'sync' }, () => {
        if (!this.s.inGroup) return;
        const users = this._presenceUsers();
        users.forEach((u) => knownBefore.add(u.userId));
        this.emit('presence:sync', { users });
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        if (!this.s.inGroup || key === this.vUid) return;
        const m = newPresences[0];
        if (m) this.emit('presence:joined', { user: { userId: this.nu(m.userId), nickname: m.nickname, avatar: m.avatar, joinedAt: m.joinedAt } });
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        if (!this.s.inGroup || key === this.vUid) return;
        const m = leftPresences[0];
        if (m) this.emit('presence:left', { user: { userId: this.nu(m.userId), nickname: m.nickname, avatar: m.avatar, joinedAt: m.joinedAt } });
      })
      .on('broadcast', { event: 'avatar-removed' }, ({ payload }) => this.emit('avatar:removed', { userId: this.nu(payload.userId) }));
    // 等第一次拿到在線名單，撞名檢查才準
    await new Promise((resolve) => {
      let done = false;
      const fin = () => { if (!done) { done = true; setTimeout(resolve, 900); } }; // 第一次通知常常還是空的，多等一下才拿得到完整名單
      this.presence.on('presence', { event: 'sync' }, fin);
      this.presence.subscribe();
      setTimeout(fin, 3000);
    });
  }

  /* 頭像：內建代號直接用；新照片（Blob）傳到 avatars 資料夾，回傳網址 */
  async _normalizeAvatar(avatar, client, uid) {
    if (avatar instanceof Blob) {
      const ext = avatar.type === 'image/jpeg' ? 'jpg' : 'webp';
      const path = `${uid}/${uuid()}.${ext}`;
      const { error } = await client.storage.from('avatars').upload(path, avatar, { contentType: avatar.type || 'image/webp', cacheControl: '31536000' });
      if (error) throw new ServiceError('avatar_invalid');
      return client.storage.from('avatars').getPublicUrl(path).data.publicUrl;
    }
    if (typeof avatar === 'string' && avatar.startsWith('media:')) return DEFAULT_AVATAR; // 示範模式留下來的舊資料
    return avatar || DEFAULT_AVATAR;
  }

  async deleteMyAvatars() {
    for (const [client, uid] of [[this.vc, this.vUid], [this.oc, this.oUid]]) {
      if (!uid) continue;
      const { data } = await client.storage.from('avatars').list(uid, { limit: 1000 });
      if (data && data.length) await client.storage.from('avatars').remove(data.map((f) => `${uid}/${f.name}`));
    }
    this.emit('avatar:removed', { userId: this.myId });
    if (this.presence) this.presence.send({ type: 'broadcast', event: 'avatar-removed', payload: { userId: this.vUid } });
  }

  /* ───────── 載入歷史 ───────── */
  async loadRecent({ roomId }) {
    this.need(roomId);
    const c = this.cl(roomId);
    const db = this.rid(roomId);
    const limit = config.limits.messageLoadCount;
    this.msgRoom = this.msgRoom || {};
    const isDm = roomId !== GROUP_UI;

    const gen = await c.from('messages').select('*').eq('room_id', db).is('segment_id', null)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
    if (gen.error) throw toError(gen.error);
    const hasMore = gen.data.length > limit;
    const general = gen.data.slice(0, limit).reverse();
    const cutoff = general.length ? iso(general[0].created_at) : '';

    let segments = [];
    let activeSegment = null;
    let secret = [];
    if (isDm) {
      const sg = await c.from('secret_sessions').select('id,started_at,ended_at').eq('room_id', db).order('started_at');
      segments = (sg.data || []).map((s) => ({ id: s.id, roomId, startedAt: iso(s.started_at), endedAt: iso(s.ended_at) }));
      activeSegment = segments.find((s) => !s.endedAt) || null;
      if (activeSegment) { this.activeSeg[roomId] = activeSegment.id; this._startSecretTimer(roomId); } else delete this.activeSeg[roomId];
      // 悄悄話：只看得到「進來之後」的
      const sm = await c.from('messages').select('*').eq('room_id', db).not('segment_id', 'is', null).gte('created_at', this.s.secretFrom).order('created_at');
      secret = sm.data || [];
      this._pendingCleanup(roomId);
    }
    const rows = [...general, ...secret];
    rows.forEach((r) => { this.msgRoom[r.id] = roomId; });
    const reactions = await this._reactionsFor(rows.map((r) => r.id));
    const announcements = await this._annList(roomId);
    const hidden = await this._hiddenMap(roomId);
    const views = [];
    rows.forEach((r) => {
      const v = this._view(r, reactions[r.id] || {});
      const h = hidden[r.id];
      if (h) { if (!this._hiddenLive(h)) return; v.hiddenAt = h.at; }
      views.push(v);
    });
    segments = segments.filter((s) => {
      const h = hidden['seg:' + s.id];
      if (!h) return true;
      if (!this._hiddenLive(h)) return false;
      s.hiddenAt = h.at;
      return true;
    });
    let ownerProfile = this.ownerProfile;
    if (isDm) { try { ownerProfile = this.ownerProfile = await this._fetchOwnerProfile(); } catch { /* 用舊的 */ } }
    return { messages: views, hasMore, segments, activeSegment, announcements, ownerProfile, cutoff };
  }

  async loadOlder({ roomId, beforeCreatedAt, beforeId }) {
    this.need(roomId);
    const c = this.cl(roomId);
    const limit = config.limits.messageLoadCount;
    const res = await c.from('messages').select('*').eq('room_id', this.rid(roomId)).is('segment_id', null)
      .or(`created_at.lt.${beforeCreatedAt},and(created_at.eq.${beforeCreatedAt},id.lt.${beforeId})`)
      .order('created_at', { ascending: false }).order('id', { ascending: false }).limit(limit + 1);
    if (res.error) throw toError(res.error);
    const hasMore = res.data.length > limit;
    const rows = res.data.slice(0, limit).reverse();
    this.msgRoom = this.msgRoom || {};
    rows.forEach((r) => { this.msgRoom[r.id] = roomId; });
    const reactions = await this._reactionsFor(rows.map((r) => r.id));
    const hidden = await this._hiddenMap(roomId);
    const views = [];
    rows.forEach((r) => {
      const v = this._view(r, reactions[r.id] || {});
      const h = hidden[r.id];
      if (h) { if (!this._hiddenLive(h)) return; v.hiddenAt = h.at; }
      views.push(v);
    });
    return { messages: views, hasMore };
  }

  /* ───────── 送出 ───────── */
  async _upload(client, path, blob, tooLargeCode) {
    const { error } = await client.storage.from(BUCKET).upload(path, blob, { contentType: blob.type || 'application/octet-stream', cacheControl: '3600' });
    if (error) {
      if (/exceeded|too large/i.test(error.message)) throw new ServiceError(tooLargeCode);
      if (/mime|not supported/i.test(error.message)) throw new ServiceError(tooLargeCode === 'file_too_large' ? 'file_type_blocked' : 'image_invalid');
      throw toError(error);
    }
    return path;
  }
  _ext(blob, name) {
    const fromName = name && /\.([A-Za-z0-9]{1,8})$/.exec(name);
    if (fromName) return fromName[1].toLowerCase();
    const t = (blob.type || '').split('/')[1] || 'bin';
    return t.replace(/[^a-z0-9]/gi, '').slice(0, 6) || 'bin';
  }

  async sendMessage({ roomId, id, text, images, file, voice, video }) {
    this.need(roomId);
    if (this.connection === 'offline') throw new ServiceError('offline');
    if (!hasContent({ text, images, file, voice, video })) throw new ServiceError('message_invalid');
    const tv = validateMessageText(text);
    if (!tv.ok) throw new ServiceError(tv.code, tv.reason);
    if (images && images.length > config.limits.imagesPerMessage) throw new ServiceError('too_many_images');
    if (file) {
      if (file.size > config.limits.fileMaxBytes) throw new ServiceError('file_too_large');
      if (isBlockedFile(file.name)) throw new ServiceError('file_type_blocked');
    }
    const c = this.cl(roomId);
    const uid = c === this.oc ? this.oUid : this.vUid;
    const isDm = roomId !== GROUP_UI;

    // 檔案放哪個資料夾（悄悄話進行中，放進悄悄話資料夾，結束時一起清掉）
    let folder = uid;
    if (isDm) {
      let seg = this.activeSeg[roomId];
      if (seg === undefined) {
        const r = await c.from('secret_sessions').select('id').eq('room_id', roomId).is('ended_at', null).maybeSingle();
        seg = r.data ? r.data.id : null;
      }
      folder = seg ? `dm/${roomId}/secret/${seg}/${uid}` : `dm/${roomId}/${uid}`;
    }
    const up = async (localId, name, tooLarge) => {
      const blob = await getMedia(localId);
      if (!blob) throw new ServiceError('image_invalid');
      return this._upload(c, `${folder}/${uuid()}.${this._ext(blob, name)}`, blob, tooLarge);
    };

    const media = {};
    if (images && images.length) media.images = await Promise.all(images.map(async (im) => ({ id: await up(im.id, null, 'image_too_large'), w: im.w, h: im.h })));
    if (file) media.file = { id: await up(file.id, file.name, 'file_too_large'), name: file.name, size: file.size };
    if (voice) media.voice = { id: await up(voice.id, 'voice.webm', 'file_too_large'), duration: voice.duration };
    if (video) {
      const vid = await up(video.id, video.name, 'file_too_large');
      const poster = video.posterId ? await up(video.posterId, 'poster.jpg', 'image_too_large') : null;
      media.video = { id: vid, posterId: poster, duration: video.duration, name: video.name, size: video.size };
    }
    const row = {
      id: id || uuid(), room_id: this.rid(roomId), user_id: uid,
      nickname: isDm ? this.dmName() : this.s.nickname, avatar: isDm ? this.dmAvatar() : this.s.avatar,
      content: String(text ?? '').trim() ? String(text) : null,
      media: Object.keys(media).length ? media : null,
    };
    const ins = await c.from('messages').insert(row).select('*').single();
    if (ins.error) throw toError(ins.error);
    this.msgRoom = this.msgRoom || {};
    this.msgRoom[row.id] = roomId;
    const v = this._view(ins.data, {});
    this.emit('message:new', { message: v });
    if (this.isOwner && isDm) this._refreshSummaries();
    return { message: v };
  }

  async recallMessage({ roomId, messageId }) {
    this.need(roomId);
    await this.rpc(this.cl(roomId), 'recall_message', { p_id: messageId });
    this.emit('message:recalled', { roomId, messageId });
  }

  async restoreMessage({ roomId, messageId }) {
    this.need(roomId);
    const c = this.cl(roomId);
    await this.rpc(c, 'restore_message', { p_id: messageId });
    const r = await c.from('messages').select('*').eq('id', messageId).single();
    if (r.error) throw toError(r.error);
    const reactions = await this._reactionsFor([messageId]);
    this.emit('message:restored', { roomId, message: this._view(r.data, reactions[messageId] || {}) });
  }

  async toggleReaction({ roomId, messageId, emoji }) {
    this.need(roomId);
    if (!emoji || [...emoji].length > 12) return;
    const c = this.cl(roomId);
    const uid = c === this.oc ? this.oUid : this.vUid;
    const nick = roomId === GROUP_UI ? this.s.nickname : this.dmName();
    const cache = (this.reactionCache[messageId] ||= {});
    const old = cache[uid];
    const how = await this.rpc(c, 'toggle_reaction', { p_message: messageId, p_emoji: emoji, p_nickname: nick });
    const user = { userId: this.myId, nickname: nick };
    if (how === 'removed') {
      delete cache[uid];
      this.emit('reaction:removed', { roomId, messageId, emoji: old || emoji, userId: user.userId });
    } else {
      if (how === 'changed' && old) this.emit('reaction:removed', { roomId, messageId, emoji: old, userId: user.userId });
      cache[uid] = emoji;
      this.emit('reaction:added', { roomId, messageId, emoji, user });
    }
  }

  /* ───────── 悄悄話 ───────── */
  async startSecret({ roomId }) {
    if (roomId === GROUP_UI) throw new ServiceError('secret_not_allowed');
    this.need(roomId);
    const seg = await this.rpc(this.cl(roomId), 'start_secret', { p_room: roomId });
    const segment = { id: seg.id, roomId, startedAt: iso(seg.startedAt), endedAt: null };
    if (this.s.secretFrom > segment.startedAt) this.s.secretFrom = segment.startedAt;
    this.activeSeg[roomId] = seg.id;
    this._startSecretTimer(roomId);
    this.emit('secret:started', { roomId, segment });
    return { segment };
  }

  async endSecret({ roomId }) {
    if (roomId === GROUP_UI) throw new ServiceError('secret_not_allowed');
    this.need(roomId);
    const segId = this.activeSeg[roomId];
    await this.rpc(this.cl(roomId), 'end_secret', { p_room: roomId });
    delete this.activeSeg[roomId];
    this._stopSecretTimer();
    this.emit('secret:ended', { roomId, segmentId: segId, endedAt: nowIso() });
    if (segId) this._cleanSecretFiles(roomId, segId);
  }

  /* 悄悄話進行中，每約 30 秒告訴資料庫「我還在」 */
  _startSecretTimer(roomId) {
    clearInterval(this.timers.secret);
    const ping = () => { const c = this.cl(roomId); c.rpc('touch_secret', { p_room: roomId }); };
    ping();
    this.timers.secret = setInterval(ping, 30000);
  }
  _stopSecretTimer() { clearInterval(this.timers.secret); }

  /* 刪掉這一段悄悄話的圖片與檔案（資料庫刪不了 Storage 的檔案，所以由瀏覽器補上） */
  async _cleanSecretFiles(roomId, segId) {
    try {
      const c = this.cl(roomId);
      await this._removeFolder(c, `dm/${roomId}/secret/${segId}`);
      await c.rpc('mark_secret_files_cleaned', { p_segment: segId });
    } catch { /* 下次進來再補 */ }
  }
  async _pendingCleanup(roomId) {
    try {
      const c = this.cl(roomId);
      const { data } = await c.rpc('secret_pending_cleanup', { p_room: roomId });
      for (const segId of data || []) await this._cleanSecretFiles(roomId, segId);
    } catch { /* 忽略 */ }
  }
  async _removeFolder(client, prefix) {
    const st = client.storage.from(BUCKET);
    const { data } = await st.list(prefix, { limit: 1000 });
    const files = [];
    for (const it of data || []) {
      if (it.id) files.push(`${prefix}/${it.name}`);
      else await this._removeFolder(client, `${prefix}/${it.name}`);
    }
    if (files.length) await st.remove(files);
  }

  /* ───────── 刪除（只有我這邊）───────── */
  async hideItem({ roomId, key }) { return this._hide(roomId, key, 'hide_item', 'item:hidden'); }
  async unhideItem({ roomId, key }) { return this._hide(roomId, key, 'unhide_item', 'item:unhidden'); }
  async purgeItem({ roomId, key }) { return this._hide(roomId, key, 'purge_item', 'item:purged'); }
  async _hide(roomId, key, fn, ev) {
    this.need(roomId);
    await this.rpc(this.cl(roomId), fn, { p_room: this.rid(roomId), p_key: key });
    this.emit(ev, { roomId, key, at: nowIso() });
  }

  /* ───────── 公告、刪除檔案 ───────── */
  async setAnnouncement({ roomId, messageId }) {
    this.need(roomId);
    await this.rpc(this.cl(roomId), 'set_announcement', { p_room: this.rid(roomId), p_message: messageId });
    this.emit('announcement:changed', { roomId, items: await this._annList(roomId) });
  }
  async removeAnnouncement({ roomId, messageId }) {
    this.need(roomId);
    await this.rpc(this.cl(roomId), 'remove_announcement', { p_room: this.rid(roomId), p_message: messageId });
    this.emit('announcement:changed', { roomId, items: await this._annList(roomId) });
  }
  async listAnnouncements({ roomId }) { this.need(roomId); return { items: await this._annList(roomId) }; }

  /* 手動刪除自己訊息裡的圖片、影片、語音或檔案（設為公告的圖片不會自動過期，只能手動刪） */
  async deleteMedia({ roomId, messageId }) {
    this.need(roomId);
    const c = this.cl(roomId);
    const r = await c.from('messages').select('media').eq('id', messageId).single();
    if (r.error) throw toError(r.error);
    const m = r.data.media || {};
    const paths = [];
    for (const im of m.images || []) { await this.rpc(c, 'delete_media', { p_message: messageId, p_kind: 'images', p_ref: im.id }); paths.push(im.id); }
    for (const k of ['file', 'voice', 'video']) {
      if (m[k]) { await this.rpc(c, 'delete_media', { p_message: messageId, p_kind: k }); paths.push(m[k].id); if (m[k].posterId) paths.push(m[k].posterId); }
    }
    if (paths.length) await c.storage.from(BUCKET).remove(paths);
    this.emit('media:expired', { roomId, messageId });
  }

  setConnection() { /* 只有示範模式用 */ }

  /* ───────── 兩個人（訪客）───────── */
  _dmResult(d, remembered) {
    this.s.dm = { roomId: d.roomId, name: d.name, avatar: d.avatar, unlocked: true, remembered: !!remembered };
    this.s.nickname = d.name;
    this._startDmTimers();
    return { room: { id: d.roomId, kind: 'dm', visitorName: d.name, displayName: d.name, visitorAvatar: d.avatar }, remembered: !!remembered };
  }

  async createDm({ name, avatar, code, codeLength, rememberDevice }) {
    const v = validateNickname(name);
    if (!v.ok) throw new ServiceError(v.code, v.reason);
    const cv = validateCode(code, codeLength);
    if (!cv.ok) throw new ServiceError('code_wrong', cv.reason);
    const av = await this._normalizeAvatar(avatar, this.vc, this.vUid);
    const d = await this.rpc(this.vc, 'create_dm', { p_name: v.value, p_avatar: av, p_code: code, p_remember: !!rememberDevice, p_label: deviceName() });
    return this._dmResult(d, rememberDevice);
  }

  async unlockDm({ name, code, rememberDevice }) {
    const d = await this.rpc(this.vc, 'unlock_dm', { p_name: name, p_code: code, p_remember: !!rememberDevice, p_label: deviceName() });
    if (d && d.error) throw new ServiceError(d.error);
    return this._dmResult(d, rememberDevice);
  }

  async updateDmProfile({ roomId, name, avatar }) {
    this.need(roomId);
    const v = validateNickname(name);
    if (!v.ok) throw new ServiceError(v.code, v.reason);
    const av = await this._normalizeAvatar(avatar, this.vc, this.vUid);
    const d = await this.rpc(this.vc, 'update_dm_profile', { p_room: roomId, p_name: v.value, p_avatar: av });
    if (this.s.dm) { this.s.dm.name = d.name; this.s.dm.avatar = d.avatar; }
    this.s.nickname = d.name;
    return { room: { id: roomId, kind: 'dm', visitorName: d.name, displayName: d.name, visitorAvatar: d.avatar } };
  }

  async _fetchOwnerProfile() {
    const d = await this.rpc(this.isOwner ? this.oc : this.vc, 'get_owner_profile');
    return d || { name: '縵', avatar: 'mm' };
  }
  async getOwnerProfile() { this.ownerProfile = await this._fetchOwnerProfile(); return { profile: this.ownerProfile }; }
  async updateOwnerProfile({ name, avatar }) {
    if (!this.isOwner) throw new ServiceError('not_owner');
    const v = validateNickname(name, { allowReserved: true });
    if (!v.ok) throw new ServiceError(v.code, v.reason);
    const av = await this._normalizeAvatar(avatar, this.oc, this.oUid);
    const p = await this.rpc(this.oc, 'update_owner_profile', { p_name: v.value, p_avatar: av });
    this.ownerProfile = p;
    if (this.ownerCh) this.ownerCh.send({ type: 'broadcast', event: 'profile', payload: p });
    return { profile: p };
  }

  async setDmRemember({ roomId, remember }) {
    await this.rpc(this.vc, 'set_dm_remember', { p_room: roomId, p_remember: !!remember });
    if (this.s.dm) this.s.dm.remembered = !!remember;
  }
  async forgetMyDevices({ roomId }) { await this.rpc(this.vc, 'forget_my_devices', { p_room: roomId }); }
  async touchDm({ roomId }) { await this.vc.rpc('touch_dm', { p_room: roomId }); }
  async clearMyView({ roomId }) { await this.rpc(this.vc, 'clear_my_view', { p_room: roomId }); }

  /* 解鎖期間，約每 5 分鐘延長一次；縵公開的已讀每 20 秒看一次 */
  _startDmTimers() {
    clearInterval(this.timers.touch);
    this.timers.touch = setInterval(() => { if (this.s.dm) this.vc.rpc('touch_dm', { p_room: this.s.dm.roomId }); }, 5 * 60000);
  }
  _stopDmTimers() { clearInterval(this.timers.touch); clearInterval(this.ownerReadTimer); }

  async watchOwnerStatus() {
    if (this.isOwner) return;
    try {
      const vis = await this.rpc(this.vc, 'get_owner_online_visible');
      if (!this.ownerWatch) {
        this.ownerWatch = this.vc.channel('owner-online');
        const upd = () => {
          const online = Object.keys(this.ownerWatch.presenceState()).length > 0;
          this.emit('owner:status', { online, visible: this.ownerVisible !== false });
        };
        this.ownerWatch
          .on('presence', { event: 'sync' }, upd)
          .on('broadcast', { event: 'visible' }, ({ payload }) => { this.ownerVisible = !!payload.visible; upd(); })
          .on('broadcast', { event: 'profile' }, ({ payload }) => { this.ownerProfile = payload; this.emit('owner:profile', { profile: payload }); })
          .subscribe();
      }
      this.ownerVisible = !!vis;
      if (vis) this.emit('owner:status', { online: Object.keys(this.ownerWatch.presenceState()).length > 0, visible: true });
      // 已讀：每 20 秒問一次（縵沒公開就是空的）
      const poll = async () => {
        if (!this.s.dm) return;
        const { data } = await this.vc.rpc('get_owner_read_at', { p_room: this.s.dm.roomId });
        if (data) this.emit('owner:readAt', { roomId: this.s.dm.roomId, readAt: iso(data) });
      };
      poll();
      clearInterval(this.ownerReadTimer);
      this.ownerReadTimer = setInterval(poll, 20000);
    } catch { /* 沒有網路就算了 */ }
  }

  /* ───────── 縵 ───────── */
  _setRemember(remember) {
    const had = !!local.get(OWNER_FLAG);
    if (!!remember === had) return;
    // 憑證換地方放：長期 ↔ 只在這個分頁
    let v = null;
    try { v = (had ? window.localStorage : window.sessionStorage).getItem(OWNER_KEY); } catch { /* 忽略 */ }
    if (remember) local.set(OWNER_FLAG, 1); else local.remove(OWNER_FLAG);
    try {
      window.localStorage.removeItem(OWNER_KEY); window.sessionStorage.removeItem(OWNER_KEY);
      if (v) (remember ? window.localStorage : window.sessionStorage).setItem(OWNER_KEY, v);
    } catch { /* 忽略 */ }
  }

  async _becomeOwner(rememberDevice) {
    const uid = (await this.oc.auth.getUser()).data.user.id;
    this.oUid = uid;
    try {
      await this.rpc(this.oc, 'register_owner_device', { p_label: deviceName(), p_remember: !!rememberDevice });
    } catch (e) {
      this.oUid = null;
      await this.oc.auth.signOut().catch(() => {});
      throw e.code === 'device_revoked' ? e : new ServiceError('login_failed');
    }
    session.remove('asVisitor');
    this.s.role = 'owner';
    this.ownerProfile = await this._fetchOwnerProfile().catch(() => this.ownerProfile);
    if (!this.channels.some((ch) => ch.topic === 'realtime:db-owner')) this._startOwnerChannel();
    this._announceOwnerOnline();
    this.emit('auth:changed', { role: 'owner' });
  }
  _startOwnerChannel() { this._hook(this.oc, 'db-owner', false); }

  /* 縵公開了「在線」時，才在專用頻道登記在線 */
  async _announceOwnerOnline() {
    try {
      const { data } = await this.oc.from('owner_settings').select('show_online').maybeSingle();
      const on = !!(data && data.show_online);
      if (!this.ownerCh) {
        this.ownerCh = this.oc.channel('owner-online', { config: { presence: { key: this.oUid } } });
        await new Promise((resolve) => this.ownerCh.subscribe((st) => { if (st === 'SUBSCRIBED') resolve(); }));
      }
      if (on) await this.ownerCh.track({ online: true }); else await this.ownerCh.untrack();
      this.ownerCh.send({ type: 'broadcast', event: 'visible', payload: { visible: on } });
    } catch { /* 忽略 */ }
  }

  async useVisitor() {
    session.set('asVisitor', 1);
    this.s.role = 'visitor';
    this.emit('auth:changed', { role: 'visitor' });
  }
  async resumeOwner() {
    if (!this.oUid || !local.get(OWNER_FLAG)) throw new ServiceError('device_revoked');
    const ok = await this.oc.rpc('owner_device_ok');
    if (!ok.data) { this.oUid = null; throw new ServiceError('device_revoked'); }
    session.remove('asVisitor');
    this.s.role = 'owner';
    this.ownerProfile = await this._fetchOwnerProfile().catch(() => this.ownerProfile);
    this._announceOwnerOnline();
    this.emit('auth:changed', { role: 'owner' });
  }

  async ownerClaim({ email, password, rememberDevice }) {
    if (!email || !password || password.length < 8) throw new ServiceError('password_mismatch');
    this._setRemember(rememberDevice);
    const su = await this.oc.auth.signUp({ email: String(email).trim(), password });
    if (su.error) throw toError(su.error);
    if (!su.data.session) {
      // 這個 Email 已經註冊過（或後台沒關 Confirm email）：改用登入試試看
      const si = await this.oc.auth.signInWithPassword({ email: String(email).trim(), password });
      if (si.error) throw new ServiceError('claim_closed');
    }
    try {
      await this.rpc(this.oc, 'claim_owner');
    } catch (e) {
      await this.oc.auth.signOut().catch(() => {});
      throw e;
    }
    await this._becomeOwner(rememberDevice);
    return { role: 'owner' };
  }

  async ownerLogin({ email, password, rememberDevice }) {
    this._setRemember(rememberDevice);
    const si = await this.oc.auth.signInWithPassword({ email: String(email || '').trim(), password: password || '' });
    if (si.error) throw new ServiceError('login_failed');
    await this._becomeOwner(rememberDevice);
    return { role: 'owner' };
  }

  async ownerLogout() {
    try { await this.oc.rpc('owner_sign_out_this_device'); } catch { /* 忽略 */ }
    await this.oc.auth.signOut().catch(() => {});
    local.remove(OWNER_FLAG);
    this.oUid = null;
    session.remove('asVisitor');
    if (this.ownerCh) { try { await this.ownerCh.untrack(); } catch { /* 忽略 */ } }
    this.s.role = 'visitor';
    this.emit('auth:changed', { role: 'visitor' });
  }

  async listOwnerDevices() {
    const { data, error } = await this.oc.from('owner_devices').select('session_id,label,remembered,last_used_at')
      .is('revoked_at', null).order('last_used_at', { ascending: false });
    if (error) throw toError(error);
    const cur = this._sessionId();
    return { devices: (data || []).map((d) => ({ id: d.session_id, name: d.label || '裝置', lastUsed: iso(d.last_used_at), remembered: d.remembered, current: d.session_id === cur })) };
  }
  _sessionId() {
    try {
      const raw = (local.get(OWNER_FLAG) ? window.localStorage : window.sessionStorage).getItem(OWNER_KEY);
      const tok = JSON.parse(raw).access_token.split('.')[1];
      return JSON.parse(atob(tok.replace(/-/g, '+').replace(/_/g, '/'))).session_id;
    } catch { return null; }
  }
  async setRememberThisDevice({ remember }) {
    await this.rpc(this.oc, 'set_remember_this_device', { p_remember: !!remember });
    this._setRemember(remember);
  }
  async forgetDevice({ deviceId }) {
    if (deviceId === this._sessionId()) { await this.ownerLogout(); return; }
    await this.rpc(this.oc, 'forget_device', { p_session: deviceId });
  }
  async signOutOtherDevices() { await this.rpc(this.oc, 'sign_out_other_devices'); }

  async _fetchDms() {
    const list = await this.rpc(this.oc, 'list_dms');
    return (list || []).map((d) => ({ ...d, lastMessageAt: iso(d.lastMessageAt) }));
  }
  async listDms() {
    const dms = await this._fetchDms();
    dms.forEach((d) => { this.summaryCache[d.roomId] = JSON.stringify(d); });
    return { dms };
  }
  /* 對話有變動時，重新取列表，只把有變的那幾列通知畫面 */
  _refreshSummaries() {
    clearTimeout(this.timers.sum);
    this.timers.sum = setTimeout(async () => {
      try {
        (await this._fetchDms()).forEach((d) => {
          const s = JSON.stringify(d);
          if (this.summaryCache[d.roomId] !== s) { this.summaryCache[d.roomId] = s; this.emit('dm:summary', { dm: d }); }
        });
      } catch { /* 下次再說 */ }
    }, 300);
  }
  async markRead({ roomId }) { await this.rpc(this.oc, 'mark_read', { p_room: roomId }); this._refreshSummaries(); }
  async _flag(roomId, flag, value) {
    await this.rpc(this.oc, 'set_dm_flag', { p_room: roomId, p_flag: flag, p_value: !!value });
    this._refreshSummaries();
  }
  async blockDm({ roomId }) { return this._flag(roomId, 'blocked', true); }
  async unblockDm({ roomId }) { return this._flag(roomId, 'blocked', false); }
  async muteDm({ roomId, muted }) { return this._flag(roomId, 'muted', muted); }
  async pinDm({ roomId, pinned }) { return this._flag(roomId, 'pinned', pinned); }
  async deleteDm({ roomId }) {
    await this.rpc(this.oc, 'delete_dm', { p_room: roomId });
    try { await this._removeFolder(this.oc, `dm/${roomId}`); } catch { /* 殘留的檔案要知道網址才打得開 */ }
    delete this.summaryCache[roomId];
    this.emit('dm:removed', { roomId });
  }

  async getOwnerPrivacy() {
    const { data, error } = await this.oc.from('owner_settings').select('show_online,show_read').maybeSingle();
    if (error) throw toError(error);
    return { showOnline: !!(data && data.show_online), showRead: !!(data && data.show_read) };
  }
  async setOwnerPrivacy({ showOnline, showRead }) {
    await this.rpc(this.oc, 'set_owner_privacy', { p_show_online: !!showOnline, p_show_read: !!showRead });
    this._announceOwnerOnline();
  }
}
