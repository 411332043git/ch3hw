/* 時間格式：一律用 UTC 的 ISO 字串傳遞，畫面再轉成當地時間 */

const pad = (n) => String(n).padStart(2, '0');

export function hhmm(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dayKey(iso) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayLabel(iso, now = new Date()) {
  const d = new Date(iso);
  const k = dayKey(d.toISOString());
  if (k === dayKey(now.toISOString())) return '今天';
  const y = new Date(now);
  y.setDate(y.getDate() - 1);
  if (k === dayKey(y.toISOString())) return '昨天';
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/* 對話列表用：今天顯示時:分，昨天顯示「昨天」，更早顯示月/日 */
export function listTime(iso, now = new Date()) {
  const k = dayKey(iso);
  if (k === dayKey(now.toISOString())) return hhmm(iso);
  return dayLabel(iso, now);
}

export function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
}

/* 「明天 09:31 過期」這種說法 */
export function expireLabel(expiresAtIso, now = new Date()) {
  const d = new Date(expiresAtIso);
  const diff = d - now;
  if (diff <= 0) return '已過期';
  const day = dayLabel(d.toISOString(), now);
  if (day === '今天') return `今天 ${hhmm(expiresAtIso)} 過期`;
  if (day === '昨天') return `昨天 ${hhmm(expiresAtIso)} 過期`;
  const days = Math.round(diff / 86400000);
  if (days <= 1) return `明天 ${hhmm(expiresAtIso)} 過期`;
  return `${d.getMonth() + 1}/${d.getDate()} ${hhmm(expiresAtIso)} 過期`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function uuid() {
  if (crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
