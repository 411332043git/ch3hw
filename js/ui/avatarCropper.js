/* 頭像裁切視窗：拖曳、縮放，取景框內就是最後的頭像（約 256×256，重新編碼） */
import { decodeImage, renderAvatar } from '../utils/image.js';
import { validateAvatarFile } from '../utils/validators.js';
import { openFull } from './fullscreen.js';

/* 回傳 Promise<Blob | null | { reselect: true }> */
export function openCropper(file) {
  return new Promise(async (resolve) => {
    const v = validateAvatarFile(file);
    let bmp = null;
    let errText = '';
    if (!v.ok) errText = v.reason;
    else {
      try { bmp = await decodeImage(file); } catch { errText = '這張圖片讀不出來，換一張試試'; }
    }

    const S = Math.min(360, Math.max(260, window.innerWidth - 32)); // 取景區大小
    const D = Math.round(S * 0.74);                                    // 圓形取景框直徑
    const off = (S - D) / 2;

    const screen = openFull(`
      <div class="row gap8" style="padding:14px 16px 0;">
        <button class="btn-ico" data-act="cancel" aria-label="取消"><span class="ico i-x"></span></button>
        <h1 class="h2 grow" style="text-align:center;">調整你的頭像</h1>
        <span style="width:46px;"></span>
      </div>
      <div class="crop-stage cam" style="width:${S}px;height:${S}px;margin:26px auto 0;background:#E8D5C4;touch-action:none;" role="img" aria-label="照片，可以拖曳和縮放">
        <canvas width="${S}" height="${S}" style="width:100%;height:100%;display:block;"></canvas>
        <span class="ring" style="width:${D}px;height:${D}px;pointer-events:none;"></span>
        <span class="chip" style="pointer-events:none;position:absolute;left:12px;top:12px;background:rgba(255,253,249,.92);"><span class="ico sm i-up"></span>拖曳移動</span>
      </div>
      <div class="col gap8" style="padding:16px 22px 0;">
        <div class="row gap12">
          <span class="ico sm i-image"></span>
          <input type="range" class="range grow" min="0" max="100" value="0" aria-label="縮放">
          <span class="ico lg i-image"></span>
        </div>
        <p class="p tiny muted" style="text-align:center;">手機用手指拖曳、兩指縮放；電腦用滑鼠拖曳、滾輪或滑桿縮放</p>
      </div>
      <div class="card row gap12" style="margin:12px 16px 0;padding:12px 16px;">
        <div class="col gap8 grow" style="min-width:0;">
          <span class="tiny muted bold">頭像會長這樣</span>
          <span class="chip mint" style="align-self:flex-start;"><span class="ico sm i-check"></span>會縮成小圖</span>
        </div>
        <div class="row gap12" style="align-items:flex-end;flex:none;">
          <canvas class="pv" width="60" height="60" style="width:60px;height:60px;border-radius:50%;border:3px solid #fff;box-shadow:var(--shadow-soft)"></canvas>
          <canvas class="pv" width="44" height="44" style="width:44px;height:44px;border-radius:50%;border:3px solid #fff;box-shadow:var(--shadow-soft)"></canvas>
          <canvas class="pv" width="32" height="32" style="width:32px;height:32px;border-radius:50%;border:2px solid #fff;box-shadow:var(--shadow-soft)"></canvas>
        </div>
      </div>
      <div class="bar pink err-bar" style="margin:12px 16px 0;font-size:12.5px;font-weight:700;display:${errText ? 'flex' : 'none'};">
        <span class="ico sm i-info"></span><span class="err-text">${errText}</span>
      </div>
      <div class="grow"></div>
      <div class="row gap12" style="padding:0 16px 20px;">
        <button class="btn ghost grow" data-act="reselect"><span class="ico sm i-refresh"></span>重選</button>
        <button class="btn grow" data-act="use" ${bmp ? '' : 'disabled'}><span class="ico sm i-check"></span>使用這張</button>
      </div>`, { onClose: () => resolve(null) });

    const root = screen.el;
    const canvas = root.querySelector('.crop-stage canvas');
    const ctx = canvas.getContext('2d');
    const range = root.querySelector('.range');
    const pvs = [...root.querySelectorAll('canvas.pv')];
    const view = { x: 0, y: 0, scale: 1 };
    let minScale = 1, maxScale = 4;

    function clamp() {
      const w = bmp.width * view.scale, h = bmp.height * view.scale;
      view.x = Math.min(0, Math.max(D - w, view.x));
      view.y = Math.min(0, Math.max(D - h, view.y));
    }
    function draw() {
      ctx.clearRect(0, 0, S, S);
      ctx.fillStyle = '#E8D5C4';
      ctx.fillRect(0, 0, S, S);
      if (!bmp) return;
      ctx.drawImage(bmp, off + view.x, off + view.y, bmp.width * view.scale, bmp.height * view.scale);
      pvs.forEach((c) => {
        const k = c.width / D;
        const cx = c.getContext('2d');
        cx.clearRect(0, 0, c.width, c.height);
        cx.drawImage(bmp, view.x * k, view.y * k, bmp.width * view.scale * k, bmp.height * view.scale * k);
      });
    }
    function setScale(s, cx = D / 2, cy = D / 2) {
      s = Math.min(maxScale, Math.max(minScale, s));
      const k = s / view.scale;
      view.x = cx - (cx - view.x) * k;
      view.y = cy - (cy - view.y) * k;
      view.scale = s;
      clamp();
      range.value = String(((s - minScale) / (maxScale - minScale || 1)) * 100);
      draw();
    }
    if (bmp) {
      minScale = D / Math.min(bmp.width, bmp.height);
      maxScale = minScale * 4;
      view.scale = minScale;
      view.x = (D - bmp.width * minScale) / 2;
      view.y = (D - bmp.height * minScale) / 2;
      draw();
    }
    range.addEventListener('input', () => setScale(minScale + (maxScale - minScale) * (Number(range.value) / 100)));
    canvas.addEventListener('wheel', (e) => { e.preventDefault(); setScale(view.scale * (e.deltaY < 0 ? 1.08 : 0.92)); }, { passive: false });

    // 拖曳與兩指縮放
    const pts = new Map();
    let lastDist = 0;
    canvas.addEventListener('pointerdown', (e) => { canvas.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); lastDist = 0; });
    canvas.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId) || !bmp) return;
      const prev = pts.get(e.pointerId);
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 1) {
        view.x += e.clientX - prev.x;
        view.y += e.clientY - prev.y;
        clamp(); draw();
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastDist) setScale(view.scale * (d / lastDist));
        lastDist = d;
      }
    });
    const up = (e) => { pts.delete(e.pointerId); lastDist = 0; };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);

    root.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'cancel') { screen.close(); return; }
      if (b.dataset.act === 'reselect') { screen.closeWith(() => resolve({ reselect: true })); return; }
      if (b.dataset.act === 'use' && bmp) {
        const blob = await renderAvatar(bmp, view, D);
        screen.closeWith(() => resolve(blob));
      }
    });
  });
}
