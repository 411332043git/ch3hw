/* ChatService 合約（architecture.md 第 5 章）。
   畫面只跟這個介面說話，從不直接碰 Supabase。
   mockService（階段一）與 supabaseService（階段二）都要提供一模一樣的指令與事件。 */
import { Emitter } from '../utils/dom.js';

/* 指令（畫面 → ChatService）。所有跟訊息有關的指令都帶 roomId */
export const COMMANDS = [
  // 訪客與縵共用
  'join', 'leave', 'deleteMyAvatars', 'loadRecent', 'loadOlder', 'sendMessage',
  'recallMessage', 'restoreMessage', 'startSecret', 'endSecret', 'toggleReaction',
  // 訪客：兩個人
  'createDm', 'unlockDm', 'setDmRemember', 'forgetMyDevices', 'touchDm', 'clearMyView', 'watchOwnerStatus',
  // 縵
  'ownerClaim', 'ownerLogin', 'ownerLogout', 'listOwnerDevices', 'setRememberThisDevice', 'forgetDevice',
  'signOutOtherDevices', 'listDms', 'markRead', 'blockDm', 'unblockDm', 'deleteDm', 'setOwnerPrivacy',
  // 設計稿多出來的功能（公告、置頂、刪除自己的檔案、模擬斷線），階段二也要實作
  'setAnnouncement', 'listAnnouncements', 'pinDm', 'deleteMedia', 'setConnection', 'getSession', 'getOwnerPrivacy', 'hideItem', 'unhideItem', 'purgeItem', 'muteDm', 'removeAnnouncement', 'useVisitor', 'resumeOwner', 'updateDmProfile', 'getOwnerProfile', 'updateOwnerProfile',
];

/* 事件（ChatService → 畫面） */
export const EVENTS = [
  'connection:changed', 'presence:sync', 'presence:joined', 'presence:left', 'avatar:removed',
  'message:new', 'message:recalled', 'message:restored', 'reaction:added', 'reaction:removed',
  'secret:started', 'secret:ended', 'owner:status', 'owner:readAt', 'dm:summary', 'dm:removed',
  'auth:changed', 'error:occurred', 'announcement:changed', 'media:expired', 'item:hidden', 'item:unhidden', 'item:purged', 'owner:profile',
];

/* 錯誤代碼 → 給使用者看的話（不透露不該透露的原因） */
export const ERROR_TEXT = {
  nickname_taken: '這個名字已經有人用囉，換一個吧',
  nickname_invalid: '這個名字不能用，換一個吧',
  message_invalid: '訊息是空的，或超過 2000 字',
  rate_limited: '慢一點喔～',
  image_too_large: '圖片太大了',
  too_many_images: '一則訊息最多 10 張照片',
  file_too_large: '檔案太大了（最多 50MB）',
  file_type_blocked: '不能傳程式或可執行的檔案',
  avatar_invalid: '這張照片沒辦法當頭像',
  image_invalid: '只能附 JPG、PNG、GIF、WebP 的圖片',
  not_owner: '只能動自己的訊息',
  login_failed: '帳號或密碼不對',
  claim_closed: '無法建立站長帳號',
  password_mismatch: '兩次密碼不一樣，或密碼少於 8 個字元',
  device_revoked: '這個裝置需要重新登入',
  dm_exists: '你已經有一個跟 縵 的聊天室了',
  name_code_taken: '這組代碼已經有人用了，換一組吧',
  code_wrong: '名字或代碼不對',
  code_locked: '輸入錯誤太多次，請晚一點再試',
  cannot_send: '目前無法傳送訊息',
  secret_not_allowed: '這裡沒有悄悄話',
  secret_cooldown: '切換太快了，等一下再試',
  secret_already_active: '悄悄話已經開始了',
  secret_not_active: '悄悄話已經結束了',
  network: '網路好像有問題，等一下再試',
  offline: '需要連線才能做這件事',
};

export class ServiceError extends Error {
  constructor(code, message) {
    super(message || ERROR_TEXT[code] || code);
    this.code = code;
  }
}

/* 共用基底：事件發射器，加上「還沒實作」的預設指令 */
export class ChatService extends Emitter {
  constructor() {
    super();
    COMMANDS.forEach((name) => {
      if (typeof this[name] !== 'function') {
        this[name] = async () => { throw new ServiceError('network', `${name} 尚未實作`); };
      }
    });
  }
}
