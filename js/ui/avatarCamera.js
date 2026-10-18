/* 頭像相機視窗。關閉視窗時一定會把相機關掉。
   回傳 Promise<{ blob } | { album: true } | null> */
import { openFull } from './fullscreen.js';
import { insecureMedia } from '../utils/dom.js';

export function openCamera() {
  return new Promise((resolve) => {
    let stream = null;
    let facing = 'user';
    let devices = 0;
    const stop = () => { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } };

    const screen = openFull(`
      <div class="row gap8" style="padding:14px 16px 0;">
        <button class="btn-ico" data-act="cancel" aria-label="取消"><span class="ico i-x"></span></button>
        <h1 class="h2 grow" style="text-align:center;">拍一張頭像</h1>
        <span style="width:46px;"></span>
      </div>
      <div class="cam light cam-stage" style="margin:30px 16px 0;height:min(420px,52vh);" role="img" aria-label="相機即時預覽">
        <video playsinline autoplay muted style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;display:none;"></video>
        <span class="silh cam-ph"></span><span class="silh2 cam-ph"></span>
        <span class="ring cam-ring" style="width:min(270px,70%);aspect-ratio:1;height:auto;"></span>
        <span class="chip cam-chip" style="position:absolute;left:14px;top:14px;background:rgba(255,253,249,.92);"><span class="dot" style="background:#E8789A;"></span>相機開著</span>
        <div class="col cam-denied" style="position:absolute;inset:0;align-items:center;justify-content:center;gap:12px;padding:0 24px;text-align:center;display:none;overflow:auto;">
          <span class="ico lg i-camera" style="opacity:.55;"></span>
          <span class="bold den-title">你沒有允許使用相機</span>
          <span class="small muted den-text">網頁沒辦法直接幫你打開設定，要請你自己允許一下：</span>
          <ol class="small" style="text-align:left;margin:0;padding-left:20px;line-height:1.7;"><li>點網址列左邊的小鎖頭（或設定圖示）</li><li>找到「相機」，改成「允許」</li><li>回到這裡按「再試一次」</li></ol>
          <button class="btn sm" data-act="retry"><span class="ico sm i-camera"></span>再試一次</button>
        </div>
      </div>
      <div class="row" style="justify-content:space-between;padding:20px 34px 0;">
        <button class="btn-ico flip-btn" data-act="flip" aria-label="切換鏡頭" style="visibility:hidden;"><span class="ico i-flip"></span></button>
        <button class="shutter" data-act="shoot" aria-label="拍照"><span class="ico lg i-camera"></span></button>
        <span style="width:46px;" aria-hidden="true"></span>
      </div>
      <div style="padding:22px 16px 20px;">
        <button class="btn yellow block" data-act="album" style="min-height:60px;font-size:18px;"><span class="ico i-image"></span>選擇相簿</button>
      </div>`, { onClose: () => { stop(); resolve(null); } });

    const root = screen.el;
    const video = root.querySelector('video');
    const denied = root.querySelector('.cam-denied');
    const shutter = root.querySelector('.shutter');

    function showDenied(kind) {
      stop();
      video.style.display = 'none';
      root.querySelectorAll('.cam-ph, .cam-chip, .cam-ring').forEach((n) => { n.style.display = 'none'; });
      denied.style.display = 'flex';
      if (insecureMedia()) {
        root.querySelector('.den-title').textContent = '這個網址不能用相機';
        root.querySelector('.den-text').textContent = '這個網址不能直接開相機。手機請按「拍照」，會改用手機自己的相機；電腦請改用相簿。';
        root.querySelector('ol').style.display = 'none';
        root.querySelector('[data-act="retry"]').style.display = 'none';
      } else if (kind === 'none') {
        root.querySelector('.den-title').textContent = '這台裝置找不到相機';
        root.querySelector('.den-text').textContent = '可以改用相簿選一張照片。';
        root.querySelector('ol').style.display = 'none';
        root.querySelector('[data-act="retry"]').style.display = 'none';
      }
      shutter.disabled = true;
      shutter.style.opacity = '.45';
    }

    async function start() {
      stop();
      denied.style.display = 'none';
      root.querySelectorAll('.cam-ph, .cam-chip, .cam-ring').forEach((n) => { n.style.display = ''; });
      shutter.disabled = false;
      shutter.style.opacity = '';
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { showDenied('none'); return; }
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        // 視窗在等待權限期間被關掉了
        if (!document.body.contains(root)) { stop(); return; }
        video.srcObject = stream;
        video.style.display = 'block';
        video.style.transform = facing === 'user' ? 'scaleX(-1)' : '';
        root.querySelectorAll('.cam-ph').forEach((n) => { n.style.display = 'none'; });
        try {
          const list = await navigator.mediaDevices.enumerateDevices();
          devices = list.filter((d) => d.kind === 'videoinput').length;
          root.querySelector('.flip-btn').style.visibility = devices > 1 ? 'visible' : 'hidden';
        } catch { /* 不能列出就不顯示切換鈕 */ }
      } catch (e) {
        showDenied(e && (e.name === 'NotFoundError' || e.name === 'DevicesNotFoundError') ? 'none' : 'denied');
      }
    }

    root.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'cancel') screen.close();
      else if (act === 'retry') start();
      else if (act === 'flip') { facing = facing === 'user' ? 'environment' : 'user'; start(); }
      else if (act === 'album') { stop(); screen.closeWith(() => resolve({ album: true })); }
      else if (act === 'shoot') {
        if (!video.videoWidth) return;
        const c = document.createElement('canvas');
        c.width = video.videoWidth;
        c.height = video.videoHeight;
        const ctx = c.getContext('2d');
        if (facing === 'user') { ctx.translate(c.width, 0); ctx.scale(-1, 1); }
        ctx.drawImage(video, 0, 0);
        c.toBlob((blob) => { stop(); screen.closeWith(() => resolve(blob ? { blob } : null)); }, 'image/jpeg', 0.92);
      }
    });
    window.addEventListener('pagehide', stop, { once: true });
    start();
  });
}
