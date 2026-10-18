/* 階段一：示範版 ChatService。
   所有資料存在這個瀏覽器（localStorage 放文字，IndexedDB 放圖片／語音／影片／檔案）。
   同一個瀏覽器的多個分頁用 BroadcastChannel 互相同步，所以可以一個分頁當訪客、一個分頁當縵。
   階段二只要新寫 supabaseService.js，並把 config.js 的 backend 改成 'supabase'。 */
import { ChatService, ServiceError } from './chatService.js';
import { config } from '../config.js';
import { nowIso, uuid } from '../utils/time.js';
import { rand, pickOne } from '../utils/dom.js';
import { local, session } from '../utils/storage.js';
import { putMedia, deleteMedia } from '../utils/mediaStore.js';
import { validateNickname, hasContent, validateMessageText, validateCode, normalizeName } from '../utils/validators.js';
import { isBlockedFile } from '../utils/sanitize.js';

const DB_KEY = 'ch3hw.mock.db.v1';
const GROUP = config.groupRoomId;
const DAY = 86400000;
const OWNER_ID = 'owner';
const DEFAULT_AVATAR = 'crab';

const RESIDENTS = [
  { userId: 'res-yun', nickname: '小雲', avatar: 'giraffe' },
  { userId: 'res-mochi', nickname: '麻糬', avatar: 'rabbit' },
  { userId: 'res-pudding', nickname: '布丁', avatar: 'cat' },
  { userId: 'res-tuan', nickname: '阿團', avatar: 'hamster' },
  { userId: 'res-kui', nickname: '小葵', avatar: 'chick' },
  { userId: 'res-bubu', nickname: '噗噗', avatar: 'pig' },
];
const CHATTER = [
  '大家早安～今天天氣好好', '有人要一起吃午餐嗎？', '哈哈哈哈好好笑', '我剛剛看到一隻超可愛的貓',
  '週末有人想去海邊嗎？', '今天的晚霞好美🌇', '好想吃布丁🍮', '加油加油！💪', '晚安大家，明天見～',
  '有人在嗎？', '這首歌好好聽🎵', '下雨了，記得帶傘☔', '我家狗狗今天學會握手了', '咖啡還是奶茶？☕',
  '午安～吃飽了嗎？', '剛剛烤了餅乾，香香的🍪', '好睏喔……', '今天心情特別好✨',
];
const REPLY = ['哈哈對啊！', '真的嗎～', '好耶好耶', '我也這樣覺得', '歡迎歡迎🌸', '要不要一起？', '太可愛了吧'];
const OWNER_REPLY = [
  '收到囉～', '謝謝你告訴我 🌸', '我在看，等我一下喔', '好呀，我們慢慢聊', '今天過得怎麼樣？', '嗯嗯，我懂你的意思',
  '這樣啊，辛苦了☺️', '哈哈，好有趣',
];

/* ───────── 小工具 ───────── */
async function sha(text) {
  try {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    let h = 0;
    for (const c of text) h = (h * 31 + c.charCodeAt(0)) | 0;
    return 'x' + h;
  }
}
const keyOf = (name) => normalizeName(name).toLowerCase();
const clone = (o) => JSON.parse(JSON.stringify(o));

function deviceName() {
  const ua = navigator.userAgent;
  const b = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : /Firefox\//.test(ua) ? 'Firefox' : '瀏覽器';
  const o = /iPhone|iPad/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Mac/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : '電腦';
  return `${b} · ${o}`;
}

function getDeviceId() {
  let id = local.get('deviceId');
  if (!id) { id = 'dev-' + uuid().slice(0, 8); local.set('deviceId', id); }
  return id;
}
function getUserId() {
  let id = local.get('uid');
  if (!id) { id = uuid(); local.set('uid', id); }
  return id;
}

/* ───────── 資料庫（localStorage）───────── */
function blankDb() {
  return {
    v: 1,
    rooms: { dm: {} },
    group: { messages: [], announcements: [] },
    dmByVisitor: {},
    owner: { claimed: false, email: '' },
    devices: [],
    privacy: { showOnline: false, showRead: false },
    pinned: [],
    lock: {},
    residentsOnline: ['res-yun', 'res-mochi', 'res-pudding'],
    avatarPhotos: {},
    muted: [],
    ownerProfile: { name: '縵', avatar: 'mm' },
  };
}

function seedMessage(i, total, now) {
  const r = RESIDENTS[i % RESIDENTS.length];
  const t = new Date(now - (total - i) * 38 * 60000 - rand(0, 600000));
  return {
    id: uuid(), roomId: GROUP, userId: r.userId, nickname: r.nickname, avatar: r.avatar,
    text: CHATTER[(i * 7 + 3) % CHATTER.length], images: [], file: null, voice: null, video: null,
    createdAt: t.toISOString(), recalled: false, segmentId: null, reactions: {},
  };
}

function seedDb() {
  const db = blankDb();
  const now = Date.now();
  const total = 130;
  for (let i = 0; i < total; i++) db.group.messages.push(seedMessage(i, total, now));
  // 幾則示範反應
  [4, 20, 60, 100, 125].forEach((idx, k) => {
    const m = db.group.messages[idx];
    const em = ['❤️', '👍', '✨', '🎉', '🥺'][k];
    m.reactions[em] = [{ userId: RESIDENTS[(k + 1) % 6].userId, nickname: RESIDENTS[(k + 1) % 6].nickname }];
  });
  // 已經過期的示範（沒有真的檔案）
  const old = new Date(now - 1.2 * DAY).toISOString();
  db.group.messages.push(
    { id: uuid(), roomId: GROUP, userId: 'res-mochi', nickname: '麻糬', avatar: 'rabbit', text: null, images: [], file: null,
      voice: { id: null, duration: 12 }, video: null, createdAt: old, recalled: false, segmentId: null, reactions: {}, expired: true },
    { id: uuid(), roomId: GROUP, userId: 'res-pudding', nickname: '布丁', avatar: 'cat', text: '看我拍到的！', images: [{ id: null, w: 640, h: 400 }], file: null,
      voice: null, video: null, createdAt: old, recalled: false, segmentId: null, reactions: {}, expired: true },
  );
  db.group.messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  // 示範訪客的一對一聊天室
  const demos = [
    { name: '小雨', avatar: 'tiger', msgs: ['今天可以聊聊嗎', '我想跟你說最近的事'], unread: 2, pinned: true, ago: 30 },
    { name: '阿凱', avatar: 'dog', msgs: ['謝謝你！'], unread: 0, pinned: false, ago: 26 * 60 },
    { name: '小栗', avatar: 'koala', msgs: ['晚安～', '明天見'], unread: 1, pinned: false, ago: 3 * 60 },
    { name: '路人', avatar: 'frog', msgs: ['哈囉'], unread: 0, pinned: false, ago: 3 * 24 * 60, blocked: true },
  ];
  demos.forEach((d, i) => {
    const id = `demo-room-${i + 1}`;
    const room = {
      id, kind: 'dm', visitorId: `demo-visitor-${i + 1}`, visitorName: d.name, visitorAvatar: d.avatar,
      codeHash: null, codeLength: 4, members: [], rememberedDevices: [], messages: [], segments: [],
      blocked: !!d.blocked, unread: d.unread, ownerReadAt: null, lastSecretToggle: 0, visitorClearedAt: null,
      announcements: [], demoCode: '1234',
    };
    d.msgs.forEach((text, j) => {
      room.messages.push({
        id: uuid(), roomId: id, userId: room.visitorId, nickname: d.name, avatar: d.avatar, text,
        images: [], file: null, voice: null, video: null,
        createdAt: new Date(now - d.ago * 60000 + j * 60000).toISOString(), recalled: false, segmentId: null, reactions: {},
      });
    });
    db.rooms.dm[id] = room;
    db.dmByVisitor[room.visitorId] = id;
    if (d.pinned) db.pinned.push(id);
  });
  db.devices = [
    { id: 'dev-demo-iphone', name: 'Safari · iPhone', lastUsed: new Date(now - 3 * 3600000).toISOString(), remembered: true },
    { id: 'dev-demo-edge', name: 'Edge · Windows', lastUsed: new Date(now - 12 * DAY).toISOString(), remembered: false },
  ];
  return db;
}

function loadDb() {
  const d = local.get('mock.db.v1');
  if (d && d.v === 1) return d;
  const s = seedDb();
  saveDb(s);
  return s;
}
function saveDb(db) {
  const ok = local.set('mock.db.v1', db);
  if (!ok) console.warn('[mock] 儲存失敗（可能容量不夠）');
}

const normEmail = (s) => String(s || '').trim().toLowerCase();
/* 示範用的簡單雜湊（不是安全的做法，只是不把密碼明文放在瀏覽器裡） */
function hashPw(s) {
  let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
  for (const ch of String(s)) {
    const c = ch.codePointAt(0);
    h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export class MockService extends ChatService {
  constructor() {
    super();
    this.tabId = uuid();
    this.s = {
      role: 'visitor', userId: getUserId(), deviceId: getDeviceId(),
      nickname: '', avatar: DEFAULT_AVATAR, inGroup: false, dmRoomId: null,
      secretFrom: new Date().toISOString(), lastSend: 0,
    };
    this.remote = new Map();     // 其他分頁的真人（好多人在線名單）
    this.connection = 'connected';
    this.leader = false;
    this._nextChatter = Date.now() + rand(...config.demo.residentChatterMs);
    this._nextToggle = Date.now() + rand(30000, 60000);
    try {
      this.bc = new BroadcastChannel('ch3hw-mock');
      this.bc.onmessage = (e) => this._onRemote(e.data);
    } catch { this.bc = null; }
    window.addEventListener('beforeunload', () => {
      this._bye();
      if (this.s.role === 'owner') this._post('owner:status', { online: false, visible: true }, { visitor: true });
    });
    setInterval(() => this._tick(), 1000);
    this._tick();
    this._expireSweep();
    setInterval(() => this._expireSweep(), 60000);
  }

  /* ───────── 內部：資料、同步 ───────── */
  _db() { return loadDb(); }
  _mutate(fn) {
    const db = loadDb();
    const r = fn(db);
    saveDb(db);
    return r === undefined ? db : r;
  }
  _post(ev, data, scope) {
    if (this.bc) { try { this.bc.postMessage({ from: this.tabId, ev, data, scope }); } catch { /* 忽略 */ } }
  }
  _relevant(scope) {
    if (!scope || scope.all) return true;
    if (scope.group) return this.s.inGroup;
    if (scope.owner) return this.s.role === 'owner';
    if (scope.dm) return this.s.role === 'owner' || this.s.dmRoomId === scope.dm;
    if (scope.dmVisitor) return this.s.role !== 'owner' && this.s.dmRoomId === scope.dmVisitor;
    if (scope.user) return this.s.userId === scope.user;
    if (scope.visitor) return this.s.role !== 'owner' && !!this.s.dmRoomId;
    return true;
  }
  /* 對自己這個分頁發出事件，同時廣播給其他分頁 */
  _push(ev, data, scope) {
    if (this._relevant(scope)) this.emit(ev, data);
    this._post(ev, data, scope);
  }
  _onRemote(m) {
    if (!m || m.from === this.tabId) return;
    if (m.ev === '_who') { this._announcePresence(); return; }
    if (m.ev === '_here') { this._remoteHere(m.data); return; }
    if (m.ev === '_bye') { this._remoteBye(m.data); return; }
    if (m.ev === 'presence:joined' || m.ev === 'presence:left') return; // 由 _here/_bye 處理
    if (m.ev === 'owner:status' && this._relevant(m.scope)) { this._ownerLast = Date.now(); this._ownerOfflineSent = false; }
    if (this._relevant(m.scope)) this.emit(m.ev, m.data);
  }
  _me() {
    return { userId: this.s.userId, nickname: this.s.nickname, avatar: this.s.avatar, joinedAt: this.s.joinedAt || nowIso() };
  }
  _announcePresence() {
    if (this.s.inGroup) this._post('_here', this._me(), { all: true });
  }
  _remoteHere(u) {
    if (u.userId === this.s.userId) return; // 同一個瀏覽器的分頁（同一個身分）不重複列
    const known = this.remote.has(u.userId);
    this.remote.set(u.userId, u);
    if (!known && this.s.inGroup) this.emit('presence:joined', { user: u });
  }
  _remoteBye(u) {
    if (this.remote.delete(u.userId) && this.s.inGroup) this.emit('presence:left', { user: u });
  }
  _bye() {
    if (this.s.inGroup) this._post('_bye', this._me(), { all: true });
  }
  _groupUsers() {
    const db = this._db();
    const res = RESIDENTS.filter((r) => db.residentsOnline.includes(r.userId)).map((r) => ({ ...r, joinedAt: '2000-01-01T00:00:00.000Z' }));
    return [...res, ...this.remote.values()];
  }

  /* ───────── 定時：領頭分頁負責示範住戶 ───────── */
  _tick() {
    const now = Date.now();
    if (this.s.role === 'owner') {
      local.set('mock.ownerSeen', now);
      if (now - (this._lastOnlinePost || 0) > 4000 && this._db().privacy.showOnline) {
        this._lastOnlinePost = now;
        this._post('owner:status', { online: true, visible: true }, { visitor: true });
      }
    } else if (this._ownerLast && now - this._ownerLast > 12000 && !this._ownerOfflineSent) {
      this._ownerOfflineSent = true;
      this.emit('owner:status', { online: false, visible: true });
    }
    // 選出領頭的分頁（只有一個分頁負責模擬住戶說話，避免重複）
    const L = local.get('mock.leader');
    if (!L || L.id === this.tabId || now - L.ts > 6000) {
      local.set('mock.leader', { id: this.tabId, ts: now });
      this.leader = true;
    } else this.leader = false;
    if (!this.leader) return;
    if (now >= this._nextChatter) {
      this._nextChatter = now + rand(...config.demo.residentChatterMs);
      this._residentSay();
    }
    if (now >= this._nextToggle) {
      this._nextToggle = now + rand(30000, 70000);
      this._residentToggle();
    }
  }

  _residentSay(replyTo) {
    const db = this._db();
    const online = RESIDENTS.filter((r) => db.residentsOnline.includes(r.userId));
    if (!online.length) return;
    const r = pickOne(online);
    const m = {
      id: uuid(), roomId: GROUP, userId: r.userId, nickname: r.nickname, avatar: r.avatar,
      text: replyTo ? pickOne(REPLY) : pickOne(CHATTER), images: [], file: null, voice: null, video: null,
      createdAt: nowIso(), recalled: false, segmentId: null, reactions: {},
    };
    this._mutate((d) => { d.group.messages.push(m); });
    this._push('message:new', { message: this._view(m, null) }, { group: true });
    // 偶爾有人按表情
    if (Math.random() < 0.3) setTimeout(() => this._residentReact(), rand(2000, 6000));
  }

  _residentReact() {
    const db = this._db();
    const online = RESIDENTS.filter((r) => db.residentsOnline.includes(r.userId));
    const msgs = db.group.messages.filter((m) => !m.recalled).slice(-8);
    if (!online.length || !msgs.length) return;
    const r = pickOne(online);
    const m = pickOne(msgs);
    const emoji = pickOne(['❤️', '👍', '✨', '😂']);
    if (Object.values(m.reactions).some((a) => a.some((x) => x.userId === r.userId))) return;
    this._mutate((d) => {
      const mm = d.group.messages.find((x) => x.id === m.id);
      if (!mm) return;
      (mm.reactions[emoji] ||= []).push({ userId: r.userId, nickname: r.nickname });
    });
    this._push('reaction:added', { messageId: m.id, emoji, user: { userId: r.userId, nickname: r.nickname } }, { group: true });
  }

  _residentToggle() {
    const db = this._db();
    const on = db.residentsOnline;
    const r = pickOne(RESIDENTS);
    const isOn = on.includes(r.userId);
    if (isOn && on.length <= 2) return;
    this._mutate((d) => {
      d.residentsOnline = isOn ? d.residentsOnline.filter((x) => x !== r.userId) : [...d.residentsOnline, r.userId];
    });
    this._push(isOn ? 'presence:left' : 'presence:joined', { user: { ...r, joinedAt: nowIso() } }, { group: true });
  }

  /* 示範 縵 的回覆 */
  _ownerReply(roomId) {
    const seen = local.get('mock.ownerSeen', 0);
    if (Date.now() - seen < 20000) return; // 有真的「縵」分頁開著，就不用示範回覆
    setTimeout(() => {
      const db = this._db();
      const room = db.rooms.dm[roomId];
      if (!room) return;
      const seg = room.segments.find((s) => !s.endedAt);
      const m = {
        id: uuid(), roomId, userId: OWNER_ID, nickname: '縵', avatar: 'mm', text: pickOne(OWNER_REPLY),
        images: [], file: null, voice: null, video: null, createdAt: nowIso(), recalled: false,
        segmentId: seg ? seg.id : null, reactions: {},
      };
      this._mutate((d) => { d.rooms.dm[roomId].messages.push(m); });
      this._push('message:new', { message: this._view(m, null) }, { dmVisitor: roomId });
    }, rand(...config.demo.ownerReplyDelayMs));
  }

  /* 過期的圖片、語音、影片、檔案：真的把檔案刪掉（設為公告的不刪） */
  _expireSweep() {
    if (!this.leader && this.bc) return;
    const db = this._db();
    let changed = false;
    const now = Date.now();
    const check = (m, days) => {
      if (m.expired || m.announced) return;
      const hasMedia = (m.images && m.images.length) || m.file || m.voice || m.video;
      if (!hasMedia) return;
      if (now - Date.parse(m.createdAt) < days * DAY) return;
      [...(m.images || []).map((x) => x.id), m.file && m.file.id, m.voice && m.voice.id, m.video && m.video.id, m.video && m.video.posterId]
        .filter(Boolean).forEach((id) => deleteMedia(id));
      m.expired = true;
      changed = true;
    };
    db.group.messages.forEach((m) => check(m, config.expireDays.group));
    Object.values(db.rooms.dm).forEach((r) => r.messages.forEach((m) => check(m, config.expireDays.dm)));
    if (changed) { saveDb(db); this._post('media:expired', {}, { all: true }); this.emit('media:expired', {}); }
  }

  /* ───────── 訊息的對外樣子 ───────── */
  _view(m, viewerId) {
    const v = clone(m);
    delete v.archive;
    if (v.recalled) {
      if (viewerId !== m.userId) { v.text = null; v.images = []; v.file = null; v.voice = null; v.video = null; }
      v.reactions = {};
    }
    return v;
  }
  _roomOf(db, roomId) {
    if (roomId === GROUP) return { kind: 'group', messages: db.group.messages, announcements: db.group.announcements, hidden: db.group.hidden };
    const r = db.rooms.dm[roomId];
    if (!r) throw new ServiceError('cannot_send');
    return r;
  }
  /* 「刪除」只在我這邊：每個人各自記自己刪掉了哪些訊息（或悄悄話結束的小字），別人不會知道。
     刪除後留下「這邊刪除過」的痕跡，一天內可以復原，超過一天就真的消失 */
  _hiddenOf(room) { return (room.hidden && room.hidden[this.s.userId]) || {}; }
  _hiddenLive(h) { return h && !h.purged && Date.now() - Date.parse(h.at) < DAY; }
  _applyHidden(room, views) {
    const map = this._hiddenOf(room);
    return views.filter((v) => {
      const h = map[v.id];
      if (!h) return true;
      if (!this._hiddenLive(h)) return false;
      v.hiddenAt = h.at;
      return true;
    });
  }
  _requireAccess(roomId) {
    if (roomId === GROUP) return;
    if (this.s.role === 'owner') return;
    if (this.s.dmRoomId !== roomId) throw new ServiceError('cannot_send');
  }

  /* ───────── 共用指令 ───────── */
  async getSession() {
    const db = this._db();
    const out = { role: this.s.role, userId: this.s.userId, deviceId: this.s.deviceId, dm: null, owner: { claimed: db.owner.claimed, remembered: false } };
    // 訪客的一對一聊天室
    const roomId = db.dmByVisitor[this.s.userId] || Object.values(db.rooms.dm).find((r) => r.members.includes(this.s.userId))?.id;
    if (roomId && db.rooms.dm[roomId]) {
      const room = db.rooms.dm[roomId];
      const remembered = room.rememberedDevices.includes(this.s.deviceId);
      const unlocked = remembered || session.get('dmUnlocked') === roomId;
      if (unlocked) this.s.dmRoomId = roomId;
      out.dm = { roomId, name: room.displayName || room.visitorName, loginName: room.visitorName, avatar: room.visitorAvatar, remembered, unlocked };
    }
    // 站長：記得這個裝置就直接是登入狀態
    const dev = db.devices.find((d) => d.id === this.s.deviceId);
    const remembered = !!local.get('ownerRemembered') && dev && dev.remembered;
    const sessionOwner = session.get('ownerLoggedIn');
    out.owner.remembered = !!remembered;
    const asVisitor = !!session.get('asVisitor');
    if (!asVisitor && (remembered || sessionOwner)) {
      this.s.role = 'owner';
      this.s.userId = OWNER_ID;
      out.role = 'owner';
      this._touchDevice();
    }
    out.userId = this.s.userId; // 上面可能剛把這個分頁切成縵，要用切換後的身分編號
    return out;
  }

  async join({ nickname, avatar }) {
    const v = validateNickname(nickname);
    if (!v.ok) throw new ServiceError(v.code, v.reason);
    const taken = RESIDENTS.some((r) => keyOf(r.nickname) === keyOf(v.value))
      || [...this.remote.values()].some((u) => keyOf(u.nickname) === keyOf(v.value));
    if (taken) throw new ServiceError('nickname_taken');
    const av = await this._normalizeAvatar(avatar);
    this.s.nickname = v.value;
    this.s.avatar = av;
    this.s.inGroup = true;
    this.s.joinedAt = nowIso();
    this._post('_who', {}, { all: true });
    this.emit('presence:sync', { users: [...this._groupUsers(), this._me()] });
    this._announcePresence();
    this.emit('connection:changed', { status: this.connection });
    return { user: this._me() };
  }

  async leave() {
    if (this.s.inGroup) this._bye();
    this.s.inGroup = false;
  }

  async _normalizeAvatar(avatar) {
    if (avatar instanceof Blob) {
      const id = 'av-' + uuid();
      await putMedia(id, avatar);
      this._mutate((d) => { (d.avatarPhotos[this.s.userId] ||= []).push(id); });
      return 'media:' + id;
    }
    return avatar || DEFAULT_AVATAR;
  }

  async deleteMyAvatars() {
    const db = this._db();
    const ids = db.avatarPhotos[this.s.userId] || [];
    await Promise.all(ids.map((id) => deleteMedia(id)));
    this._mutate((d) => {
      delete d.avatarPhotos[this.s.userId];
      const fix = (m) => { if (m.userId === this.s.userId && String(m.avatar).startsWith('media:')) m.avatar = DEFAULT_AVATAR; };
      d.group.messages.forEach(fix);
      Object.values(d.rooms.dm).forEach((r) => {
        r.messages.forEach(fix);
        if (r.visitorId === this.s.userId || r.members.includes(this.s.userId)) r.visitorAvatar = DEFAULT_AVATAR;
      });
    });
    if (String(this.s.avatar).startsWith('media:')) this.s.avatar = DEFAULT_AVATAR;
    this._push('avatar:removed', { userId: this.s.userId }, { all: true });
  }

  async loadRecent({ roomId }) {
    this._requireAccess(roomId);
    const db = this._db();
    const room = this._roomOf(db, roomId);
    const limit = config.limits.messageLoadCount;
    let msgs = room.messages;
    let segments = [];
    let activeSegment = null;
    if (roomId !== GROUP) {
      segments = room.segments.map((s) => ({ id: s.id, roomId, startedAt: s.startedAt, endedAt: s.endedAt }));
      activeSegment = segments.find((s) => !s.endedAt) || null;
      // 悄悄話：只看得到「進來之後」的；一般訊息都看得到
      msgs = msgs.filter((m) => !m.segmentId || m.createdAt >= this.s.secretFrom);
      if (this.s.role !== 'owner' && room.visitorClearedAt) msgs = msgs.filter((m) => m.createdAt > room.visitorClearedAt);
    }
    const general = msgs.filter((m) => !m.segmentId);
    const lastGeneral = general.slice(-limit);
    const cutoff = lastGeneral.length ? lastGeneral[0].createdAt : '';
    const secret = msgs.filter((m) => m.segmentId);
    const picked = [...lastGeneral, ...secret].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const hasMore = general.length > lastGeneral.length;
    return {
      messages: this._applyHidden(room, picked.map((m) => this._view(m, this.s.userId))),
      hasMore,
      segments: segments.filter((s) => { const h = this._hiddenOf(room)['seg:' + s.id]; if (!h) return true; if (!this._hiddenLive(h)) return false; s.hiddenAt = h.at; return true; }),
      activeSegment,
      announcements: this._annList(room, roomId),
      ownerProfile: this._db().ownerProfile || { name: '縵', avatar: 'mm' },
      cutoff,
    };
  }

  async loadOlder({ roomId, beforeCreatedAt, beforeId }) {
    this._requireAccess(roomId);
    const db = this._db();
    const room = this._roomOf(db, roomId);
    const limit = config.limits.messageLoadCount;
    let msgs = room.messages.filter((m) => !m.segmentId && (m.createdAt < beforeCreatedAt || (m.createdAt === beforeCreatedAt && m.id < beforeId)));
    if (roomId !== GROUP && this.s.role !== 'owner' && room.visitorClearedAt) msgs = msgs.filter((m) => m.createdAt > room.visitorClearedAt);
    const picked = msgs.slice(-limit);
    return { messages: this._applyHidden(room, picked.map((m) => this._view(m, this.s.userId))), hasMore: msgs.length > picked.length };
  }

  async sendMessage({ roomId, id, text, images, file, voice, video }) {
    this._requireAccess(roomId);
    if (this.connection !== 'connected') throw new ServiceError('offline');
    if (!hasContent({ text, images, file, voice, video })) throw new ServiceError('message_invalid');
    const tv = validateMessageText(text);
    if (!tv.ok) throw new ServiceError(tv.code, tv.reason);
    if (images && images.length > config.limits.imagesPerMessage) throw new ServiceError('too_many_images');
    if (file) {
      if (file.size > config.limits.fileMaxBytes) throw new ServiceError('file_too_large');
      if (isBlockedFile(file.name)) throw new ServiceError('file_type_blocked');
    }
    const now = Date.now();
    if (now - this.s.lastSend < config.limits.cooldownSeconds * 1000 - 100) throw new ServiceError('rate_limited');

    const db = this._db();
    const room = this._roomOf(db, roomId);
    if (roomId !== GROUP && this.s.role !== 'owner' && room.blocked) throw new ServiceError('cannot_send');
    const seg = roomId !== GROUP ? room.segments.find((s) => !s.endedAt) : null;
    const isOwner = this.s.role === 'owner';
    const dmVisitor = roomId !== GROUP && !isOwner;
    const m = {
      id: id || uuid(), roomId, userId: this.s.userId,
      nickname: isOwner && roomId !== GROUP ? (db.ownerProfile || {}).name || '縵' : dmVisitor ? (room.displayName || room.visitorName) : this.s.nickname,
      avatar: isOwner && roomId !== GROUP ? (db.ownerProfile || {}).avatar || 'mm' : dmVisitor ? room.visitorAvatar : this.s.avatar,
      text: String(text ?? '').trim() ? String(text) : null,
      images: images || [], file: file || null, voice: voice || null, video: video || null,
      createdAt: nowIso(), recalled: false, segmentId: seg ? seg.id : null, reactions: {},
    };
    this.s.lastSend = now;
    this._mutate((d) => {
      if (roomId === GROUP) d.group.messages.push(m);
      else {
        const r = d.rooms.dm[roomId];
        r.messages.push(m);
        if (!isOwner) r.unread = (r.unread || 0) + 1;
      }
    });
    this._push('message:new', { message: this._view(m, null) }, roomId === GROUP ? { group: true } : { dm: roomId });
    if (roomId !== GROUP) {
      this._summaryPush(roomId);
      if (!isOwner) this._ownerReply(roomId);
    } else if (Math.random() < 0.35) {
      setTimeout(() => this.leader && this._residentSay(true), rand(3000, 7000));
    }
    return { message: this._view(m, this.s.userId) };
  }

  async recallMessage({ roomId, messageId }) {
    this._requireAccess(roomId);
    const done = this._mutate((d) => {
      const room = roomId === GROUP ? d.group : d.rooms.dm[roomId];
      const m = room && room.messages.find((x) => x.id === messageId);
      if (!m) return false;
      if (m.userId !== this.s.userId) throw new ServiceError('not_owner');
      m.recalled = true;
      return true;
    });
    if (done === false) return;
    this._push('message:recalled', { roomId, messageId }, roomId === GROUP ? { group: true } : { dm: roomId });
    if (roomId !== GROUP) this._summaryPush(roomId);
  }

  async restoreMessage({ roomId, messageId }) {
    this._requireAccess(roomId);
    let msg = null;
    this._mutate((d) => {
      const room = roomId === GROUP ? d.group : d.rooms.dm[roomId];
      const m = room && room.messages.find((x) => x.id === messageId);
      if (!m) return;
      if (m.userId !== this.s.userId) throw new ServiceError('not_owner');
      m.recalled = false;
      msg = clone(m);
    });
    if (!msg) return;
    this._push('message:restored', { roomId, message: this._view(msg, null) }, roomId === GROUP ? { group: true } : { dm: roomId });
    if (roomId !== GROUP) this._summaryPush(roomId);
  }

  async toggleReaction({ roomId, messageId, emoji }) {
    this._requireAccess(roomId);
    if (!emoji || [...emoji].length > 12) return;
    const events = [];
    this._mutate((d) => {
      const room = roomId === GROUP ? d.group : d.rooms.dm[roomId];
      const m = room && room.messages.find((x) => x.id === messageId);
      if (!m || m.recalled) return;
      const uid = this.s.userId;
      const who = { userId: uid, nickname: this.s.role === 'owner' && roomId !== GROUP ? '縵' : this.s.nickname };
      // 找出自己目前選的
      let current = null;
      for (const [e, list] of Object.entries(m.reactions)) if (list.some((x) => x.userId === uid)) current = e;
      const drop = (e) => {
        m.reactions[e] = m.reactions[e].filter((x) => x.userId !== uid);
        if (!m.reactions[e].length) delete m.reactions[e];
        events.push(['reaction:removed', { messageId, emoji: e, userId: uid }]);
      };
      if (current === emoji) { drop(current); return; }
      if (current) drop(current);
      (m.reactions[emoji] ||= []).push(who);
      events.push(['reaction:added', { messageId, emoji, user: who }]);
    });
    events.forEach(([ev, data]) => this._push(ev, { roomId, ...data }, roomId === GROUP ? { group: true } : { dm: roomId }));
  }

  /* ───────── 悄悄話（只有一對一聊天室）───────── */
  async startSecret({ roomId }) {
    if (roomId === GROUP) throw new ServiceError('secret_not_allowed');
    this._requireAccess(roomId);
    let seg = null;
    this._mutate((d) => {
      const r = d.rooms.dm[roomId];
      if (!r) throw new ServiceError('cannot_send');
      if (r.segments.some((s) => !s.endedAt)) throw new ServiceError('secret_already_active');
      if (Date.now() - (r.lastSecretToggle || 0) < config.limits.secretCooldownSeconds * 1000) throw new ServiceError('secret_cooldown');
      seg = { id: uuid(), startedAt: nowIso(), endedAt: null };
      r.segments.push(seg);
      r.lastSecretToggle = Date.now();
    });
    // 開始悄悄話的這一刻起，這個分頁看得到之後的悄悄話
    if (this.s.secretFrom > seg.startedAt) this.s.secretFrom = seg.startedAt;
    this._push('secret:started', { roomId, segment: { id: seg.id, roomId, startedAt: seg.startedAt, endedAt: null } }, { dm: roomId });
    this._summaryPush(roomId);
    return { segment: seg };
  }

  async endSecret({ roomId }) {
    if (roomId === GROUP) throw new ServiceError('secret_not_allowed');
    this._requireAccess(roomId);
    let seg = null;
    const ids = [];
    this._mutate((d) => {
      const r = d.rooms.dm[roomId];
      if (!r) throw new ServiceError('cannot_send');
      seg = r.segments.find((s) => !s.endedAt);
      if (!seg) throw new ServiceError('secret_not_active');
      if (Date.now() - (r.lastSecretToggle || 0) < config.limits.secretCooldownSeconds * 1000) throw new ServiceError('secret_cooldown');
      seg.endedAt = nowIso();
      r.lastSecretToggle = Date.now();
      r.messages.filter((m) => m.segmentId === seg.id).forEach((m) => {
        [...(m.images || []).map((x) => x.id), m.file && m.file.id, m.voice && m.voice.id, m.video && m.video.id].filter(Boolean).forEach((x) => ids.push(x));
      });
      r.messages = r.messages.filter((m) => m.segmentId !== seg.id);
    });
    ids.forEach((id) => deleteMedia(id));
    this._push('secret:ended', { roomId, segmentId: seg.id, endedAt: seg.endedAt }, { dm: roomId });
    this._summaryPush(roomId);
  }

  /* ───────── 刪除（只有我這邊）───────── */
  async hideItem({ roomId, key }) { return this._setHidden(roomId, key, 'hide'); }
  async unhideItem({ roomId, key }) { return this._setHidden(roomId, key, 'unhide'); }
  async purgeItem({ roomId, key }) { return this._setHidden(roomId, key, 'purge'); }
  _setHidden(roomId, key, how) {
    this._requireAccess(roomId);
    const at = nowIso();
    this._mutate((d) => {
      const room = roomId === GROUP ? d.group : d.rooms.dm[roomId];
      if (!room) throw new ServiceError('cannot_send');
      room.hidden = room.hidden || {};
      const mine = (room.hidden[this.s.userId] = room.hidden[this.s.userId] || {});
      if (how === 'hide') mine[key] = { at, purged: false };
      else if (how === 'unhide') delete mine[key];
      else if (mine[key]) mine[key] = { at: mine[key].at, purged: true };
    });
    const ev = how === 'hide' ? 'item:hidden' : how === 'unhide' ? 'item:unhidden' : 'item:purged';
    this._push(ev, { roomId, key, at }, { user: this.s.userId });
  }

  /* ───────── 公告、刪除檔案 ───────── */
  _annList(room, roomId) {
    const list = (room.announcements || []).slice().sort((a, b) => b.announcedAt.localeCompare(a.announcedAt));
    return list.map((a) => {
      const m = room.messages.find((x) => x.id === a.messageId);
      return m ? { messageId: a.messageId, announcedAt: a.announcedAt, message: this._view(m, null) } : null;
    }).filter(Boolean);
  }

  async setAnnouncement({ roomId, messageId }) {
    this._requireAccess(roomId);
    this._mutate((d) => {
      const room = roomId === GROUP ? d.group : d.rooms.dm[roomId];
      const m = room.messages.find((x) => x.id === messageId);
      if (!m || m.recalled) return;
      m.announced = true;
      room.announcements = (room.announcements || []).filter((a) => a.messageId !== messageId);
      room.announcements.push({ messageId, announcedAt: nowIso() });
    });
    const room = roomId === GROUP ? this._db().group : this._db().rooms.dm[roomId];
    this._push('announcement:changed', { roomId, items: this._annList(room, roomId) }, roomId === GROUP ? { group: true } : { dm: roomId });
  }

  /* 從公告紀錄刪除（訊息本身還在；它的圖片等檔案從此照一般規則過期） */
  async removeAnnouncement({ roomId, messageId }) {
    this._requireAccess(roomId);
    this._mutate((d) => {
      const room = roomId === GROUP ? d.group : d.rooms.dm[roomId];
      if (!room) return;
      room.announcements = (room.announcements || []).filter((a) => a.messageId !== messageId);
      const m = room.messages.find((x) => x.id === messageId);
      if (m) m.announced = false;
    });
    const room = roomId === GROUP ? this._db().group : this._db().rooms.dm[roomId];
    this._push('announcement:changed', { roomId, items: this._annList(room, roomId) }, roomId === GROUP ? { group: true } : { dm: roomId });
  }

  async listAnnouncements({ roomId }) {
    this._requireAccess(roomId);
    const db = this._db();
    return { items: this._annList(roomId === GROUP ? db.group : db.rooms.dm[roomId], roomId) };
  }

  /* 手動刪除自己訊息裡的圖片／檔案（設為公告的圖片不會自動過期，只能手動刪） */
  async deleteMedia({ roomId, messageId }) {
    this._requireAccess(roomId);
    const ids = [];
    this._mutate((d) => {
      const room = roomId === GROUP ? d.group : d.rooms.dm[roomId];
      const m = room.messages.find((x) => x.id === messageId);
      if (!m) return;
      if (m.userId !== this.s.userId && this.s.role !== 'owner') throw new ServiceError('not_owner');
      [...(m.images || []).map((x) => x.id), m.file && m.file.id, m.voice && m.voice.id, m.video && m.video.id, m.video && m.video.posterId]
        .filter(Boolean).forEach((x) => ids.push(x));
      m.expired = true;
    });
    ids.forEach((id) => deleteMedia(id));
    this._push('media:expired', { roomId, messageId }, roomId === GROUP ? { group: true } : { dm: roomId });
  }

  setConnection({ status }) {
    this.connection = status;
    this.emit('connection:changed', { status });
  }

  /* ───────── 兩個人（訪客）───────── */
  async createDm({ name, avatar, code, codeLength, rememberDevice }) {
    const v = validateNickname(name);
    if (!v.ok) throw new ServiceError(v.code, v.reason);
    const cv = validateCode(code, codeLength);
    if (!cv.ok) throw new ServiceError('code_wrong', cv.reason);
    const db = this._db();
    if (db.dmByVisitor[this.s.userId] && db.rooms.dm[db.dmByVisitor[this.s.userId]]) throw new ServiceError('dm_exists');
    const hash = await sha(keyOf(v.value) + ':' + code);
    if (Object.values(db.rooms.dm).some((r) => keyOf(r.visitorName) === keyOf(v.value) && r.codeHash === hash)) {
      throw new ServiceError('name_code_taken');
    }
    const av = await this._normalizeAvatar(avatar);
    const id = 'dm-' + uuid();
    const room = {
      id, kind: 'dm', visitorId: this.s.userId, visitorName: v.value, visitorAvatar: av, codeHash: hash,
      codeLength: code.length, members: [this.s.userId], rememberedDevices: rememberDevice ? [this.s.deviceId] : [],
      messages: [], segments: [], blocked: false, unread: 0, ownerReadAt: null, lastSecretToggle: 0,
      visitorClearedAt: null, announcements: [],
    };
    this._mutate((d) => { d.rooms.dm[id] = room; d.dmByVisitor[this.s.userId] = id; });
    this.s.dmRoomId = id;
    this.s.nickname = v.value;
    session.set('dmUnlocked', id);
    this._push('dm:summary', { dm: this._summary(room) }, { owner: true });
    return { room: { id, kind: 'dm', visitorName: v.value, displayName: v.value, visitorAvatar: av }, remembered: !!rememberDevice };
  }

  async unlockDm({ name, code, rememberDevice }) {
    const key = keyOf(name);
    const db = this._db();
    const L = db.lock[key] || { fails: 0, until: 0 };
    if (L.until > Date.now()) throw new ServiceError('code_locked');
    const hash = await sha(key + ':' + code);
    const room = Object.values(db.rooms.dm).find((r) => keyOf(r.visitorName) === key
      && (r.codeHash === hash || (r.demoCode && r.demoCode === code)));
    if (!room) {
      L.fails += 1;
      if (L.fails >= config.limits.codeWrongMax) { L.fails = 0; L.until = Date.now() + 5 * 60000; }
      this._mutate((d) => { d.lock[key] = L; });
      throw new ServiceError(L.until > Date.now() ? 'code_locked' : 'code_wrong');
    }
    this._mutate((d) => {
      delete d.lock[key];
      const r = d.rooms.dm[room.id];
      if (!r.members.includes(this.s.userId)) r.members.push(this.s.userId);
      if (rememberDevice && !r.rememberedDevices.includes(this.s.deviceId)) r.rememberedDevices.push(this.s.deviceId);
    });
    this.s.dmRoomId = room.id;
    this.s.nickname = room.visitorName;
    session.set('dmUnlocked', room.id);
    return { room: { id: room.id, kind: 'dm', visitorName: room.visitorName, displayName: room.displayName || room.visitorName, visitorAvatar: room.visitorAvatar }, remembered: !!rememberDevice };
  }

  /* 換暱稱與頭像：只改縵看到的名字與頭像，登入用的名字（和數字）不變 */
  async updateDmProfile({ roomId, name, avatar }) {
    this._requireAccess(roomId);
    const v = validateNickname(name);
    if (!v.ok) throw new ServiceError(v.code, v.reason);
    const av = await this._normalizeAvatar(avatar);
    let room = null;
    this._mutate((d) => {
      const r = d.rooms.dm[roomId];
      if (!r) throw new ServiceError('cannot_send');
      r.displayName = v.value;
      r.visitorAvatar = av;
      room = { id: r.id, kind: 'dm', visitorName: r.visitorName, displayName: r.displayName, visitorAvatar: r.visitorAvatar };
    });
    this.s.nickname = v.value;
    this._summaryPush(roomId);
    return { room };
  }

  /* 縵在一對一對話裡顯示的名字與頭像（頭像可以選蝴蝶結小兔子 mm） */
  async getOwnerProfile() { return { profile: this._db().ownerProfile || { name: '縵', avatar: 'mm' } }; }
  async updateOwnerProfile({ name, avatar }) {
    if (this.s.role !== 'owner') throw new ServiceError('not_owner');
    const v = validateNickname(name, { allowReserved: true });
    if (!v.ok) throw new ServiceError(v.code, v.reason);
    const av = await this._normalizeAvatar(avatar);
    const profile = { name: v.value, avatar: av };
    this._mutate((d) => { d.ownerProfile = profile; });
    // 訪客那邊的標題列頭像要馬上換
    this._post('owner:profile', { profile }, { visitor: true });
    return { profile };
  }

  async setDmRemember({ roomId, remember }) {
    this._mutate((d) => {
      const r = d.rooms.dm[roomId];
      if (!r) return;
      r.rememberedDevices = r.rememberedDevices.filter((x) => x !== this.s.deviceId);
      if (remember) r.rememberedDevices.push(this.s.deviceId);
    });
  }
  async forgetMyDevices({ roomId }) {
    this._mutate((d) => { const r = d.rooms.dm[roomId]; if (r) r.rememberedDevices = []; });
  }
  async touchDm() { /* 示範模式不需要延長解鎖時間 */ }
  async clearMyView({ roomId }) {
    this._mutate((d) => { const r = d.rooms.dm[roomId]; if (r) r.visitorClearedAt = nowIso(); });
  }
  async watchOwnerStatus() {
    const db = this._db();
    if (db.privacy.showOnline) { this._ownerLast = Date.now(); this.emit('owner:status', { online: Date.now() - local.get('mock.ownerSeen', 0) < 20000, visible: true }); }
    if (db.privacy.showRead && this.s.dmRoomId) {
      const r = db.rooms.dm[this.s.dmRoomId];
      if (r && r.ownerReadAt) this.emit('owner:readAt', { roomId: r.id, readAt: r.ownerReadAt });
    }
  }

  /* ───────── 縵 ───────── */
  _touchDevice() {
    this._mutate((d) => {
      const dev = d.devices.find((x) => x.id === this.s.deviceId);
      if (dev) dev.lastUsed = nowIso();
    });
  }
  _asOwner(rememberDevice) {
    session.remove('asVisitor');
    this.s.role = 'owner';
    this.s.userId = OWNER_ID;
    if (rememberDevice) { local.set('ownerRemembered', 1); session.remove('ownerLoggedIn'); }
    else { local.remove('ownerRemembered'); session.set('ownerLoggedIn', 1); }
    this._mutate((d) => {
      let dev = d.devices.find((x) => x.id === this.s.deviceId);
      if (!dev) { dev = { id: this.s.deviceId, name: deviceName() }; d.devices.unshift(dev); }
      dev.lastUsed = nowIso();
      dev.remembered = !!rememberDevice;
    });
    this.emit('auth:changed', { role: 'owner' });
  }

  /* 在選身分畫面按了「訪客」：這個分頁就是訪客，不管這台裝置有沒有記得縵 */
  async useVisitor() {
    session.set('asVisitor', 1);
    this.s.role = 'visitor';
    this.s.userId = getUserId();
    this.s.dmRoomId = null;
    this.emit('auth:changed', { role: 'visitor' });
  }
  /* 按了「縵」而且這台裝置有被記得：直接以縵的身分進去（不用再輸入密碼） */
  async resumeOwner() {
    const db = this._db();
    const dev = db.devices.find((d) => d.id === this.s.deviceId);
    if (!(local.get('ownerRemembered') && dev && dev.remembered)) throw new ServiceError('device_revoked');
    session.remove('asVisitor');
    this.s.role = 'owner';
    this.s.userId = OWNER_ID;
    this._touchDevice();
    this.emit('auth:changed', { role: 'owner' });
  }

  async ownerClaim({ email, password, rememberDevice }) {
    if (!email || !password || password.length < 8) throw new ServiceError('password_mismatch');
    const db = this._db();
    if (db.owner.claimed) throw new ServiceError('claim_closed');
    this._mutate((d) => { d.owner = { claimed: true, email: normEmail(email), pw: hashPw(password) }; });
    this._asOwner(rememberDevice);
    return { role: 'owner' };
  }
  async ownerLogin({ email, password, rememberDevice }) {
    // 示範模式：要輸入第一次設定的帳號和密碼才能登入（密碼只存簡單雜湊，正式版交給 Supabase Auth）
    const o = this._db().owner;
    if (o.claimed && !o.pw && normEmail(email) && password) { // 舊的示範資料沒有存密碼：這一次輸入的就當作設定
      this._mutate((d) => { d.owner = { claimed: true, email: normEmail(email), pw: hashPw(password) }; });
    } else
    if (!o.claimed || normEmail(email) !== o.email || !password || hashPw(password) !== o.pw) throw new ServiceError('login_failed');
    this._asOwner(rememberDevice);
    return { role: 'owner' };
  }
  async ownerLogout() {
    this._mutate((d) => { const dev = d.devices.find((x) => x.id === this.s.deviceId); if (dev) dev.remembered = false; });
    local.remove('ownerRemembered');
    session.remove('ownerLoggedIn');
    this.s.role = 'visitor';
    this.s.userId = getUserId();
    this.s.dmRoomId = null;
    this.emit('auth:changed', { role: 'visitor' });
  }
  async listOwnerDevices() {
    const db = this._db();
    return {
      devices: db.devices.slice().sort((a, b) => b.lastUsed.localeCompare(a.lastUsed))
        .map((d) => ({ ...d, current: d.id === this.s.deviceId })),
    };
  }
  async setRememberThisDevice({ remember }) {
    this._mutate((d) => { const dev = d.devices.find((x) => x.id === this.s.deviceId); if (dev) dev.remembered = !!remember; });
    if (remember) { local.set('ownerRemembered', 1); session.remove('ownerLoggedIn'); }
    else { local.remove('ownerRemembered'); session.set('ownerLoggedIn', 1); }
  }
  async forgetDevice({ deviceId }) {
    if (deviceId === this.s.deviceId) { await this.ownerLogout(); return; }
    this._mutate((d) => { d.devices = d.devices.filter((x) => x.id !== deviceId); });
  }
  async signOutOtherDevices() {
    this._mutate((d) => { d.devices = d.devices.filter((x) => x.id === this.s.deviceId); });
  }

  _preview(room) {
    const last = [...room.messages].filter((m) => !m.recalled).pop();
    if (!last) return '';
    if (last.segmentId) return '🫧 悄悄話';
    if (last.images && last.images.length) return '📷 圖片';
    if (last.voice) return '🎤 語音';
    if (last.video) return '🎬 影片';
    if (last.file) return '📎 ' + last.file.name;
    return String(last.text || '').slice(0, 24);
  }
  _summary(room) {
    const last = [...room.messages].pop();
    const pinned = this._db().pinned.includes(room.id);
    return {
      roomId: room.id, visitorName: room.displayName || room.visitorName, visitorAvatar: room.visitorAvatar,
      lastMessagePreview: this._preview(room), lastMessageAt: last ? last.createdAt : null,
      unreadCount: room.unread || 0, blocked: !!room.blocked, pinned, muted: (this._db().muted || []).includes(room.id),
    };
  }
  _summaryPush(roomId) {
    const room = this._db().rooms.dm[roomId];
    if (room) this._push('dm:summary', { dm: this._summary(room) }, { owner: true });
  }
  async listDms() {
    const db = this._db();
    const list = Object.values(db.rooms.dm).map((r) => this._summary(r));
    list.sort((a, b) => (Number(!!a.blocked) - Number(!!b.blocked)) || (Number(!!b.pinned) - Number(!!a.pinned)) || String(b.lastMessageAt || '').localeCompare(String(a.lastMessageAt || '')));
    return { dms: list };
  }
  async markRead({ roomId }) {
    let at = null;
    this._mutate((d) => {
      const r = d.rooms.dm[roomId];
      if (!r) return;
      r.unread = 0;
      at = r.messages.length ? r.messages[r.messages.length - 1].createdAt : nowIso();
      r.ownerReadAt = at;
    });
    this._summaryPush(roomId);
    const db = this._db();
    if (db.privacy.showRead && at) this._post('owner:readAt', { roomId, readAt: at }, { dmVisitor: roomId });
  }
  async blockDm({ roomId }) {
    this._mutate((d) => { const r = d.rooms.dm[roomId]; if (r) r.blocked = true; });
    this._summaryPush(roomId);
  }
  async unblockDm({ roomId }) {
    this._mutate((d) => { const r = d.rooms.dm[roomId]; if (r) r.blocked = false; });
    this._summaryPush(roomId);
  }
  /* 靜音：這個對話不會有提示音、瀏覽器通知，也不算進分頁標題的未讀數（列表上的數字還是會有） */
  async muteDm({ roomId, muted }) {
    this._mutate((d) => {
      d.muted = (d.muted || []).filter((x) => x !== roomId);
      if (muted) d.muted.push(roomId);
    });
    this._summaryPush(roomId);
  }
  async pinDm({ roomId, pinned }) {
    this._mutate((d) => {
      d.pinned = d.pinned.filter((x) => x !== roomId);
      if (pinned) d.pinned.push(roomId);
    });
    this._summaryPush(roomId);
  }
  async deleteDm({ roomId }) {
    const ids = [];
    this._mutate((d) => {
      const r = d.rooms.dm[roomId];
      if (!r) return;
      r.messages.forEach((m) => {
        [...(m.images || []).map((x) => x.id), m.file && m.file.id, m.voice && m.voice.id, m.video && m.video.id].filter(Boolean).forEach((x) => ids.push(x));
      });
      delete d.rooms.dm[roomId];
      Object.keys(d.dmByVisitor).forEach((k) => { if (d.dmByVisitor[k] === roomId) delete d.dmByVisitor[k]; });
      d.pinned = d.pinned.filter((x) => x !== roomId);
    });
    ids.forEach((id) => deleteMedia(id));
    this._push('dm:removed', { roomId }, { dm: roomId });
  }
  async setOwnerPrivacy({ showOnline, showRead }) {
    this._mutate((d) => { d.privacy = { showOnline: !!showOnline, showRead: !!showRead }; });
    // 訪客那邊要立刻出現或消失
    this._post('owner:status', { online: true, visible: !!showOnline }, { visitor: true });
    const db = this._db();
    if (showRead) {
      Object.values(db.rooms.dm).forEach((r) => this._post('owner:readAt', { roomId: r.id, readAt: r.ownerReadAt }, { dmVisitor: r.id }));
    } else {
      this._post('owner:readAt', { roomId: null, readAt: null }, { visitor: true });
    }
  }
  async getOwnerPrivacy() { return this._db().privacy; }
}
