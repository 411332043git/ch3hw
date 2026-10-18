/* 左右滑動露出下面的按鈕（像手機的訊息列表）。手機用手指、電腦用滑鼠拖都可以。
   wrap 裡面有兩層：.swipe-actions（藏在下面的按鈕）和 .swipe-body（滑動的那一層）。
   dir: 'right' = 往右滑露出左邊的按鈕；'left' = 往左滑露出右邊的按鈕 */

const openOnes = new Set();

export function closeAllSwipes(except = null) {
  openOnes.forEach((s) => { if (s !== except) s.close(); });
}

export function enableSwipe(wrap, { dir = 'right', onSwipeStart = null } = {}) {
  const body = wrap.querySelector('.swipe-body');
  const actions = wrap.querySelector('.swipe-actions');
  const sign = dir === 'right' ? 1 : -1;
  let reveal = 0;
  let x = 0;
  let start = null;
  let dragging = false;
  const api = { open, close, isOpen: () => x !== 0, justDragged: false };

  function set(v, animate) {
    x = v;
    body.style.transition = animate ? 'transform .18s ease' : 'none';
    body.style.transform = x ? `translateX(${x}px)` : '';
    wrap.classList.toggle('swiped', x !== 0);
  }
  function measure() { reveal = actions ? actions.offsetWidth + 8 : 150; }
  function open() { measure(); set(sign * reveal, true); openOnes.add(api); }
  function close() { set(0, true); openOnes.delete(api); }

  body.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    closeAllSwipes(api);
    measure();
    start = { px: e.clientX, py: e.clientY, x0: x };
    dragging = false;
  });
  body.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.px;
    const dy = e.clientY - start.py;
    if (!dragging) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(dy)) return;
      dragging = true;
      onSwipeStart && onSwipeStart();
      try { body.setPointerCapture(e.pointerId); } catch { /* 忽略 */ }
    }
    const v = start.x0 + dx;
    // 只能往露出按鈕的方向滑，最多滑到按鈕全部露出再多一點點
    const lo = sign > 0 ? 0 : -reveal - 12;
    const hi = sign > 0 ? reveal + 12 : 0;
    set(Math.min(hi, Math.max(lo, v)), false);
  });
  const end = () => {
    if (!start) return;
    if (dragging) {
      api.justDragged = true;
      setTimeout(() => { api.justDragged = false; }, 60);
      if (Math.abs(x) > reveal / 2) open(); else close();
    }
    start = null;
    dragging = false;
  };
  body.addEventListener('pointerup', end);
  body.addEventListener('pointercancel', end);
  return api;
}

/* 點了別的地方就收起來 */
document.addEventListener('pointerdown', (e) => {
  if (!e.target.closest('.swipe-wrap')) closeAllSwipes();
}, true);
