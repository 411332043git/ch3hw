/* 全螢幕的小視窗（相機、裁切、放大檢視等）。回傳 { el, close, closeWith } */
export function openFull(content, { onClose, cls = '' } = {}) {
  const host = document.createElement('div');
  host.className = 'fullscreen ' + cls;
  host.innerHTML = `<div class="fs-inner">${content}</div>`;
  document.body.appendChild(host);
  document.body.classList.add('modal-open');
  let done = false;
  const finish = () => {
    if (done) return;
    done = true;
    document.removeEventListener('keydown', onKey);
    host.remove();
    if (!document.querySelector('.fullscreen')) document.body.classList.remove('modal-open');
  };
  const close = () => { const was = done; finish(); if (!was) onClose && onClose(); };
  /* 先執行 fn（例如回傳結果）再關閉，不會觸發 onClose 的 null */
  const closeWith = (fn) => { finish(); fn && fn(); };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  return { el: host.firstElementChild, host, close, closeWith };
}
