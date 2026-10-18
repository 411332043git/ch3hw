/* 手機點按鈕時的觸覺回饋（短短震一下）。
   Android 的 Chrome 等瀏覽器可以；iPhone 的 Safari 不開放這個功能，網頁沒辦法讓 iPhone 震動。 */
const CLICKABLE = 'button, a[href], [role="button"], [role="tab"], [role="menuitem"], [role="switch"], .btn, .btn-ico, .tab, .tab-toggle, .seg-tab, .av-pick, .rxe, .rx-add, .emo, .cat, .dm-row, .card.press, .flower-btn, label.row';

export function startHaptics() {
  if (!('vibrate' in navigator)) return;
  const touch = window.matchMedia && window.matchMedia('(hover: none)').matches;
  if (!touch) return;
  // 用 click（手指抬起、算一次點擊）而不是按下去的瞬間：瀏覽器要求先有一次點擊，才准網頁震動
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || e.pointerType === 'mouse') return;
    const t = e.target.closest && e.target.closest(CLICKABLE);
    if (!t || t.disabled || t.getAttribute('aria-disabled') === 'true') return;
    try { navigator.vibrate(10); } catch { /* 忽略 */ }
  }, { passive: true });
}
