/* 悄悄話／一般聊天的小提示：冒在太陽或流星正下面，約 10 秒後自己消失 */
const TIP_MS = 10000;

/* kind: 'secret'（粉色）或 'normal'（黃色） */
export function showModeTip(host, kind, { midway = false } = {}) {
  host.querySelectorAll('.tip').forEach((t) => t.remove());
  const t = document.createElement('span');
  t.setAttribute('role', 'status');
  if (kind === 'secret') {
    t.className = 'tip under pink r m';
    t.style.whiteSpace = 'nowrap';
    t.textContent = midway ? '悄悄話進行中，你只看得到進來之後的悄悄話' : '悄悄話進行中，按太陽結束並清除';
  } else {
    t.className = 'tip under yellow r';
    t.textContent = '一般聊天';
  }
  host.appendChild(t);
  setTimeout(() => t.remove(), TIP_MS);
}
