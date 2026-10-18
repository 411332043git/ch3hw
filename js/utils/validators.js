/* 輸入檢查：暱稱、訊息、代碼、圖片、檔案。兩個階段共用，標準只放這一個地方。 */
import { config } from '../config.js';
import { isBlockedFile, extOf } from './sanitize.js';

const L = config.limits;

export function charLength(s) {
  return [...String(s ?? '')].length;
}

/* 整理暱稱：前後空白拿掉、連續空白縮成一個 */
export function normalizeName(s) {
  return String(s ?? '').replace(/\s+/g, ' ').trim();
}

const NAME_OK = /^[\p{L}\p{N}\p{M}\p{Extended_Pictographic}‍️⃣ ]+$/u;

/* 回傳 { ok, value, reason, code } */
export function validateNickname(raw, { allowTaken = false, allowReserved = false } = {}) {
  const value = normalizeName(raw);
  if (!value) return { ok: false, value, code: 'nickname_invalid', reason: '請輸入名稱' };
  if (charLength(value) > L.nicknameMax) {
    return { ok: false, value, code: 'nickname_invalid', reason: `最多 ${L.nicknameMax} 個字` };
  }
  if (!NAME_OK.test(value)) {
    return { ok: false, value, code: 'nickname_invalid', reason: '只能用文字、數字和 emoji' };
  }
  if (!allowReserved && config.reservedNames.includes(value.toLowerCase())) {
    return { ok: false, value, code: 'nickname_invalid', reason: '這個名字不能用，換一個吧' };
  }
  return { ok: true, value };
}

export function validateMessageText(text) {
  const n = charLength(text);
  if (n > L.messageMax) return { ok: false, code: 'message_invalid', reason: `最多 ${L.messageMax} 個字` };
  return { ok: true };
}

export function hasContent({ text, images, file, voice, video }) {
  return !!(String(text ?? '').trim() || (images && images.length) || file || voice || video);
}

export function validateCode(code, length) {
  if (!/^\d+$/.test(code || '')) return { ok: false, reason: '只能輸入數字' };
  if (length && code.length !== length) return { ok: false, reason: `需要 ${length} 位數` };
  if (!length && !L.dmCodeLengths.includes(code.length)) return { ok: false, reason: '需要 4 位或 6 位數' };
  return { ok: true };
}

export function validateEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || '').trim());
}

const IMG_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/* 訊息附圖：JPG、PNG、GIF、WebP */
export function validateMessageImage(file) {
  if (!file || !IMG_TYPES.includes(file.type)) return { ok: false, code: 'image_invalid', reason: '只能附 JPG、PNG、GIF、WebP 的圖片' };
  return { ok: true };
}

/* 頭像照片：JPG、PNG、WebP，原檔 10MB 內 */
export function validateAvatarFile(file) {
  if (!file || !['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    return { ok: false, code: 'avatar_invalid', reason: '只能用 JPG、PNG、WebP 的照片' };
  }
  if (file.size > L.avatarMaxBytesIn) return { ok: false, code: 'image_too_large', reason: '照片太大了（超過 10 MB）' };
  return { ok: true };
}

export function validateFile(file) {
  if (!file) return { ok: false, code: 'file_invalid', reason: '沒有選到檔案' };
  if (file.size > L.fileMaxBytes) return { ok: false, code: 'file_too_large', reason: '檔案太大了（超過 50MB）' };
  if (isBlockedFile(file.name)) return { ok: false, code: 'file_type_blocked', reason: '不能傳程式或可執行的檔案' };
  return { ok: true };
}

export function validateVideoDuration(sec) {
  if (sec > L.videoMaxSeconds) return { ok: false, code: 'file_too_large', reason: '影片太長了（最多 5 分鐘）' };
  return { ok: true };
}

export function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function fileBadge(name) {
  const e = extOf(name);
  if (!e) return 'FILE';
  if (['doc', 'docx'].includes(e)) return 'DOC';
  if (['xls', 'xlsx', 'csv'].includes(e)) return 'XLS';
  if (['ppt', 'pptx'].includes(e)) return 'PPT';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(e)) return 'ZIP';
  return e.slice(0, 4).toUpperCase();
}
