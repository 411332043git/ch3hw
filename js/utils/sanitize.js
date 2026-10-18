/* 文字與網址的安全處理：所有使用者輸入一律當純文字顯示 */

const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
}

/* 內建頭像代號（訪客可選，順序固定），mm 是縵縵限定 */
export const AVATARS = [
  'crab', 'duck', 'chick', 'polarbear', 'cat', 'shark', 'rabbit', 'koala', 'elephant', 'dog',
  'pig', 'fish', 'unicorn', 'giraffe', 'tiger', 'whale', 'bear', 'monkey', 'hamster', 'frog',
];
export const AVATAR_NAMES = {
  crab: '小螃蟹', duck: '小鴨', chick: '小雞', polarbear: '北極熊', cat: '貓', shark: '鯊魚',
  rabbit: '兔子', koala: '無尾熊', elephant: '大象', dog: '狗狗', pig: '小豬', fish: '小魚',
  unicorn: '獨角獸', giraffe: '長頸鹿', tiger: '老虎', whale: '鯨魚', bear: '熊', monkey: '猴子',
  hamster: '倉鼠', frog: '青蛙', mm: '縵縵限定',
};
const TONES = 7;

export function isPhotoAvatar(avatar) {
  return typeof avatar === 'string' && /^(https:\/\/|blob:|data:image\/|media:)/.test(avatar);
}

/* 頭像底色：依代號固定一個，7 種粉彩輪流 */
export function toneOf(avatar) {
  if (avatar === 'mm') return 'mm';
  const i = Math.max(0, AVATARS.indexOf(avatar));
  return 'a' + ((i % TONES) + 1);
}

/* 頭像的 HTML（內建動物或照片）。size: '', 'sm', 'lg', 'xl' */
export function avatarHtml(avatar, size = '', extra = '') {
  const cls = `av ${size} ${toneOf(avatar)} ${extra}`.replace(/\s+/g, ' ').trim();
  if (isPhotoAvatar(avatar)) {
    const attr = avatar.startsWith('media:') ? `data-media-src="${esc(avatar.slice(6))}" data-media-keep="1"` : `src="${esc(avatar)}"`;
    return `<span class="${cls} photo-av"><img ${attr} alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'an an-crab'}))"></span>`;
  }
  const name = /^[a-z]+$/.test(avatar || '') ? avatar : 'bear';
  return `<span class="${cls}"><i class="an an-${name}"></i></span>`;
}

/* 只接受 http(s) 開頭的網址（用來檢查網址是否安全；訊息文字裡的網址由 messageList.js 的 textHtml 轉成連結） */
export function isSafeHttpUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:';
  } catch { return false; }
}

/* 副檔名黑名單：程式、可執行檔一律不收 */
const BLOCKED_EXT = new Set([
  'exe', 'bat', 'cmd', 'com', 'msi', 'scr', 'pif', 'apk', 'ipa', 'app', 'dmg', 'pkg', 'deb', 'rpm',
  'sh', 'bash', 'zsh', 'ps1', 'psm1', 'vbs', 'vbe', 'js', 'jse', 'mjs', 'wsf', 'wsh', 'jar', 'jnlp',
  'lnk', 'reg', 'dll', 'sys', 'cpl', 'hta', 'msc', 'gadget', 'html', 'htm', 'svg', 'xhtml', 'php', 'py', 'rb', 'pl',
]);
export function extOf(name) {
  const m = /\.([A-Za-z0-9]{1,8})$/.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}
export function isBlockedFile(name) {
  const parts = String(name || '').toLowerCase().split('.');
  // 檢查每一段副檔名，避免 a.exe.pdf 這類組合
  return parts.slice(1).some((p) => BLOCKED_EXT.has(p));
}
/* 讀檔案開頭幾個位元組，擋掉偽裝成文件的可執行檔（MZ、ELF、Mach-O、#!） */
export async function looksExecutable(file) {
  const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  const s = String.fromCharCode(...head);
  if (s.startsWith('MZ') || s.startsWith('\x7fELF') || s.startsWith('#!')) return true;
  const hex = [...head].map((b) => b.toString(16).padStart(2, '0')).join('');
  return ['cafebabe', 'feedface', 'feedfacf', 'cefaedfe', 'cffaedfe'].includes(hex);
}
