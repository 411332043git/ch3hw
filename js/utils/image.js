/* 圖片縮小與重新編碼。重新編碼會一併移除照片裡的拍攝位置等資料。 */
import { config } from '../config.js';

export async function decodeImage(fileOrBlob) {
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(fileOrBlob, { imageOrientation: 'from-image' }); } catch { /* 改用 <img> */ }
  }
  const url = URL.createObjectURL(fileOrBlob);
  try {
    const img = await new Promise((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('decode'));
      i.src = url;
    });
    return img;
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((res) => canvas.toBlob((b) => res(b), type, quality));
}

let webpOk = null;
async function pickType() {
  if (webpOk === null) {
    const c = document.createElement('canvas');
    c.width = c.height = 2;
    const b = await canvasToBlob(c, 'image/webp', 0.8);
    webpOk = !!b && b.type === 'image/webp';
  }
  return webpOk ? 'image/webp' : 'image/jpeg';
}

/* 訊息附圖：最長邊縮到 maxEdge，重新編碼。GIF 保留原樣（動畫）但不能超過 2MB */
export async function prepareMessageImage(file, maxEdge = config.limits.imageMaxEdge) {
  if (file.type === 'image/gif') {
    if (file.size > 2 * 1024 * 1024) { const e = new Error('GIF 超過 2MB'); e.code = 'image_too_large'; throw e; }
    const bmp = await decodeImage(file);
    return { blob: file, width: bmp.width, height: bmp.height };
  }
  const bmp = await decodeImage(file);
  const scale = Math.min(1, maxEdge / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const type = await pickType();
  const blob = await canvasToBlob(canvas, type, 0.82);
  return { blob, width: w, height: h };
}

/* 頭像裁切：view = { scale, offsetX, offsetY }（相對於取景框的畫面座標），輸出正方形 */
export async function renderAvatar(bmp, view, frame, size = config.limits.avatarSize) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  const k = size / frame;
  ctx.fillStyle = '#FFF8EE';
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(bmp, view.x * k, view.y * k, bmp.width * view.scale * k, bmp.height * view.scale * k);
  const type = await pickType();
  return canvasToBlob(canvas, type, 0.85);
}

export function blobToDataUrl(blob) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

/* 影片縮圖：取第 0.5 秒的畫面 */
export async function videoPoster(file) {
  const url = URL.createObjectURL(file);
  try {
    const v = document.createElement('video');
    v.muted = true;
    v.preload = 'metadata';
    v.src = url;
    await new Promise((res, rej) => { v.onloadedmetadata = res; v.onerror = rej; });
    const duration = v.duration || 0;
    try {
      v.currentTime = Math.min(0.5, duration / 2);
      await new Promise((res) => { v.onseeked = res; setTimeout(res, 1500); });
    } catch { /* 取不到縮圖就算了 */ }
    let poster = null;
    if (v.videoWidth) {
      const scale = Math.min(1, 480 / v.videoWidth);
      const c = document.createElement('canvas');
      c.width = Math.round(v.videoWidth * scale);
      c.height = Math.round(v.videoHeight * scale);
      c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
      poster = await canvasToBlob(c, 'image/jpeg', 0.7);
    }
    return { duration, poster };
  } finally {
    URL.revokeObjectURL(url);
  }
}
