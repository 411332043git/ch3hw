/* 「一般聊天 / 悄悄話」模式切換（只在「兩個人」）：太陽＝一般聊天，流星＝悄悄話。
   按了之後下面冒出小提示，約 10 秒後自己消失；兩顆按鈕有幾秒冷卻。 */
import { store } from '../state/store.js';
import { config } from '../config.js';
import { confirmDialog } from './modal.js';
import { toastError } from './toast.js';
import { showModeTip } from './secretBanner.js';

export function createModeSwitch(ctx, roomId) {
  const el = document.createElement('div');
  el.className = 'tt mode';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', '聊天模式');
  el.innerHTML = `
    <button type="button" class="tt-pink" data-m="normal" aria-label="一般聊天"><span class="icc sun-c"></span></button>
    <button type="button" class="tt-blue" data-m="secret" aria-label="悄悄話"><span class="icc meteor-c"></span></button>`;
  const sun = el.querySelector('[data-m="normal"]');
  const meteor = el.querySelector('[data-m="secret"]');
  const offs = [];
  let coolUntil = 0;
  let coolTimer = null;
  let first = true;

  const active = () => !!store.room(roomId).activeSegment;

  function render() {
    const a = active();
    sun.classList.toggle('on', !a);
    meteor.classList.toggle('on', a);
    sun.setAttribute('aria-pressed', String(!a));
    meteor.setAttribute('aria-pressed', String(a));
    // 冷卻很短（不到 1 秒）時不用讓按鈕變灰，也不用等提示消失，可以直接切過去
    const left = Math.ceil((coolUntil - Date.now()) / 1000);
    const cooling = left > 0 && config.limits.secretCooldownSeconds >= 1;
    sun.disabled = meteor.disabled = cooling;
    el.classList.toggle('cooling', cooling);
    el.title = cooling ? `${left} 秒後可以再切換` : '';
  }
  function cool() {
    coolUntil = Date.now() + config.limits.secretCooldownSeconds * 1000;
    clearInterval(coolTimer);
    coolTimer = setInterval(() => { render(); if (Date.now() >= coolUntil) clearInterval(coolTimer); }, 500);
    render();
  }

  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-m]');
    if (!b || b.disabled) return;
    try {
      if (b.dataset.m === 'secret') {
        if (active()) return;
        await ctx.service.startSecret({ roomId });
      } else {
        if (!active()) { showModeTip(el, 'normal'); return; }
        const ok = await confirmDialog({
          chip: '結束悄悄話', chipStyle: 'background:#CBEFF0;', icon: 'i-whisper', iconBg: '#FFE3EA',
          title: '要結束悄悄話嗎？', text: '結束後，這一段悄悄話的所有訊息和圖片會對雙方清除，無法復原。確定要結束嗎？',
          okText: '確定結束', okStyle: 'background:var(--yellow);', cancelText: '再聊一下',
        });
        if (!ok) return;
        await ctx.service.endSecret({ roomId });
      }
    } catch (err) { toastError(err); }
  });

  /* 雙方看到的模式一致：開始或結束（不管是誰按的）都更新並冒出提示 */
  offs.push(store.on('secret', (rid) => {
    if (rid !== roomId) return;
    cool();
    showModeTip(el, active() ? 'secret' : 'normal');
  }));
  render();
  // 進來時已經有進行中的悄悄話：提醒一次
  if (active()) { showModeTip(el, 'secret', { midway: true }); }
  first = false;

  return { el, destroy() { offs.forEach((f) => f()); clearInterval(coolTimer); } };
}
