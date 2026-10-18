/* 圖片與影片放大檢視：背景是模糊的聊天室，右下角「儲存」。點外面、✕、Esc 都能關閉 */
import { openFull } from './fullscreen.js';
import { avatarHtml, esc } from '../utils/sanitize.js';
import { hhmm } from '../utils/time.js';
import { mediaUrl } from '../utils/mediaStore.js';
import { toast } from './toast.js';

/* items: [{ kind: 'image' | 'video', id, posterId?, name? }]，msg: 發話的訊息（取頭像、名字、時間） */
export function openLightbox({ items, index = 0, msg }) {
  let i = index;
  const scr = openFull(`
    <div class="row gap8 lb-head">
      <div class="row gap8 grow" style="min-width:0;">
        ${avatarHtml(msg.avatar, 'sm')}
        <div class="col" style="min-width:0;">
          <span class="bold nowrap" style="color:#FFF8EE;">${esc(msg.nickname)}</span>
          <span class="tiny" style="color:#E9D8C8;">${hhmm(msg.createdAt)}</span>
        </div>
      </div>
      <button class="btn-ico" data-act="close" aria-label="關閉（也可以按 Esc 或點圖片外面）"><span class="ico i-x"></span></button>
    </div>
    <div class="lb-body grow">
      <button class="btn-ico lb-nav prev" data-act="prev" aria-label="上一張"><span class="ico i-left"></span></button>
      <div class="lb-media"></div>
      <button class="btn-ico lb-nav next" data-act="next" aria-label="下一張"><span class="ico i-right"></span></button>
    </div>
    <div class="row lb-foot">
      <span class="tiny lb-hint" style="color:#E9D8C8;">點外面或按 ✕ 關閉</span>
      <button class="btn sm" data-act="save" aria-label="儲存到裝置"><span class="ico sm i-download"></span>儲存</button>
    </div>`, { cls: 'lightbox' });
  const root = scr.el;
  const media = root.querySelector('.lb-media');
  const hint = root.querySelector('.lb-hint');

  async function show() {
    const it = items[i];
    root.querySelector('.prev').style.visibility = items.length > 1 && i > 0 ? 'visible' : 'hidden';
    root.querySelector('.next').style.visibility = items.length > 1 && i < items.length - 1 ? 'visible' : 'hidden';
    hint.textContent = (it.kind === 'video' ? '點影片外面或按 ✕ 關閉' : '點圖片外面或按 ✕ 關閉') + (items.length > 1 ? `（${i + 1} / ${items.length}）` : '');
    const url = await mediaUrl(it.id);
    if (!url) { media.innerHTML = `<span class="chip">${it.kind === 'video' ? '影片無法播放' : '圖片無法顯示'}</span>`; return; }
    media.innerHTML = it.kind === 'video'
      ? `<video src="${url}" controls playsinline autoplay class="lb-el"></video>`
      : `<img src="${url}" alt="放大的圖片" class="lb-el">`;
  }

  async function save() {
    const it = items[i];
    const url = await mediaUrl(it.id);
    if (!url) { toast('這個檔案已經不在了', { soft: true }); return; }
    const a = document.createElement('a');
    a.href = url;
    a.download = it.name || (it.kind === 'video' ? '影片.mp4' : '圖片.jpg');
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b) {
      const a = b.dataset.act;
      if (a === 'close') scr.close();
      else if (a === 'save') save();
      else if (a === 'prev' && i > 0) { i -= 1; show(); }
      else if (a === 'next' && i < items.length - 1) { i += 1; show(); }
      return;
    }
    if (!e.target.closest('.lb-el') && !e.target.closest('.lb-foot') && !e.target.closest('.lb-head')) scr.close();
  });
  show();
  return scr;
}
