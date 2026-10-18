/* 站長：新訊息的通知（只在網頁開著時有效）：對話列表未讀數、分頁標題「(N) 縵」、提示音、瀏覽器通知（只顯示名字） */
import { store } from '../state/store.js';
import { local } from '../utils/storage.js';

const BASE_TITLE = '好多人・兩個人';
let ctxAudio = null;

/* 瀏覽器要求「使用者按過畫面之後」才能發聲，所以第一次點畫面時才建立 */
function unlockAudio() {
  try {
    ctxAudio = ctxAudio || new (window.AudioContext || window.webkitAudioContext)();
    if (ctxAudio.state === 'suspended') ctxAudio.resume();
  } catch { /* 忽略 */ }
}

function beep() {
  if (!local.get('ownerSound', true) || !ctxAudio) return;
  try {
    const o = ctxAudio.createOscillator();
    const g = ctxAudio.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, ctxAudio.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, ctxAudio.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctxAudio.currentTime + 0.35);
    o.connect(g).connect(ctxAudio.destination);
    o.start();
    o.stop(ctxAudio.currentTime + 0.4);
  } catch { /* 不能發聲就算了 */ }
}

export function startOwnerNotify() {
  const updateTitle = () => {
    const n = store.dms.filter((d) => !d.muted).reduce((s, d) => s + (d.unreadCount || 0), 0);
    document.title = n > 0 ? `(${n}) 縵` : BASE_TITLE;
  };
  const offs = [
    store.on('dms', updateTitle),
    store.on('incoming', (rid, m) => {
      if (rid === 'group') return;
      if (store.openDmId === rid && document.visibilityState === 'visible') return;
      const d = store.dms.find((x) => x.roomId === rid);
      if (d && d.muted) return; // 靜音的對話：沒有提示音、沒有通知
      beep();
      if ('Notification' in window && Notification.permission === 'granted') {
        try { new Notification('縵', { body: `${m.nickname} 傳來新訊息`, tag: rid }); } catch { /* 忽略 */ }
      }
    }),
  ];
  document.addEventListener('click', unlockAudio, { once: true });
  updateTitle();
  return () => { offs.forEach((f) => f()); document.title = BASE_TITLE; };
}
