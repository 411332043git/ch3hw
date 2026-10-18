/* 錄語音：長按藍色鈕說話，最長 60 秒；放開後不會直接送出，會先試聽，再選刪除、重錄或送出 */
import { config } from '../config.js';
import { openOverlay } from './modal.js';
import { mmss } from '../utils/time.js';
import { toast } from './toast.js';
import { insecureMedia } from '../utils/dom.js';

function pickMime() {
  const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
  if (!window.MediaRecorder) return '';
  return list.find((t) => MediaRecorder.isTypeSupported(t)) || '';
}

async function startRecorder() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) {
    const e = new Error('unsupported');
    e.name = 'NotSupportedError';
    throw e;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mime = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = [];
  const t0 = Date.now();
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  rec.start(250);
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop() {
      return new Promise((resolve) => {
        const done = () => {
          release();
          const type = rec.mimeType || mime || 'audio/webm';
          resolve({ blob: new Blob(chunks, { type }), duration: (Date.now() - t0) / 1000 });
        };
        if (rec.state === 'inactive') { done(); return; }
        rec.onstop = done;
        rec.stop();
      });
    },
    cancel() { try { rec.state !== 'inactive' && rec.stop(); } catch { /* 忽略 */ } release(); },
    elapsed: () => (Date.now() - t0) / 1000,
  };
}

const BARS = Array.from({ length: 22 }, (_, i) => 10 + ((i * 17) % 30));

/* 開始錄音。mode: 'hold'（按住說話，放開就停）或 'tap'（用「停止」鈕停止）
   回傳 Promise<{ blob, duration } | null>（null 代表刪除或取消）；send 由呼叫端處理 */
export function recordVoice({ mode = 'hold', releaseTarget = window, isHeld = null, preset = null, onRedo = null } = {}) {
  return new Promise(async (resolve) => {
    let rec;
    try {
      if (!preset) rec = await startRecorder();
    } catch (e) {
      toast(insecureMedia() ? '這個網址不能直接錄音，請輕點藍色鈕選「錄語音」' : e && e.name === 'NotSupportedError' ? '這個瀏覽器不能錄音' : '沒有允許使用麥克風', { soft: true, icon: 'i-mic', ms: 6000 });
      resolve(null);
      return;
    }
    const max = config.limits.voiceMaxSeconds;
    let tick = null;
    let state = 'recording';
    let result = null;
    let audioUrl = null;

    const ov = openOverlay(`<div class="sheet voice-sheet" role="dialog" aria-label="錄語音"></div>`, {
      sheet: true,
      onClose: () => { clearInterval(tick); if (state === 'recording') rec.cancel(); if (audioUrl) URL.revokeObjectURL(audioUrl); resolve(null); },
    });
    const sheet = ov.el.querySelector('.sheet');

    function renderRecording() {
      sheet.innerHTML = `
        <span class="grab"></span>
        <div class="row gap8"><span class="rec-dot"></span><span class="bold">錄音中</span><span class="grow"></span>
          <span class="bold timer" style="font-variant-numeric:tabular-nums;">0:00 <span class="muted">/ ${mmss(max)}</span></span></div>
        <div class="progress" role="progressbar" aria-valuemin="0" aria-valuemax="${max}" aria-valuenow="0"><i style="width:0%;"></i></div>
        <div class="wave rec-wave" style="height:44px;justify-content:space-between;gap:2px;" aria-hidden="true">${BARS.map((h, i) => `<i style="height:${h}px;width:4px;opacity:.7;background:#6FA8D9;animation-delay:${(i % 7) * 0.1}s"></i>`).join('')}</div>
        <div class="col" style="align-items:center;gap:12px;padding:6px 0 2px;">
          <span class="rec-mic"><span class="ico lg i-mic" style="width:40px;height:40px;"></span></span>
          ${mode === 'hold' ? '<span class="small bold">放開後，可以先聽聽看再決定</span>' : '<button class="btn" data-act="stop"><span class="ico sm i-pause"></span>停止</button>'}
        </div>
        <p class="p tiny muted hint-left" style="text-align:center;">語音最長 ${max} 秒，錄滿會自動停止</p>`;
      tick = setInterval(() => {
        const s = rec.elapsed();
        sheet.querySelector('.timer').innerHTML = `${mmss(s)} <span class="muted">/ ${mmss(max)}</span>`;
        sheet.querySelector('.progress i').style.width = Math.min(100, (s / max) * 100) + '%';
        const left = Math.ceil(max - s);
        if (left <= 15) sheet.querySelector('.hint-left').textContent = `再 ${left} 秒就會自動停止錄音`;
        if (s >= max) { stopRecording(true); }
      }, 200);
    }

    async function stopRecording(auto) {
      if (state !== 'recording') return;
      clearInterval(tick);
      state = 'review';
      result = await rec.stop();
      if (auto) toast('語音最長 60 秒，已自動停止錄音', { icon: 'i-mic' });
      if (result.duration < 0.6) { toast('錄音太短了，再試一次', { soft: true, icon: 'i-mic' }); state = 'done'; ov.close(); return; }
      audioUrl = URL.createObjectURL(result.blob);
      renderReview();
    }

    function renderReview() {
      sheet.innerHTML = `
        <span class="grab"></span>
        <div class="row gap8"><span class="ico sm i-mic"></span><span class="bold">錄好了，先聽聽看</span><span class="grow"></span><span class="tiny muted">共 ${mmss(result.duration)}</span></div>
        <div class="bubble voice" style="align-self:stretch;">
          <button class="vplay" data-act="play" aria-label="播放試聽"><span class="ico sm i-play"></span></button>
          <span class="wave" style="height:44px;" aria-hidden="true">${BARS.map((h) => `<i style="height:${h}px;width:4px;"></i>`).join('')}</span>
          <span class="vtime">0:00 / ${mmss(result.duration)}</span>
        </div>
        <div class="row gap8" style="gap:10px;">
          <button class="btn ghost grow" data-act="del" style="min-height:50px;"><span class="ico sm i-trash"></span>刪除</button>
          <button class="btn grow" data-act="redo" style="min-height:50px;background:#CFE6FA;"><span class="ico sm i-mic"></span>重錄</button>
          <button class="btn pink grow" data-act="send" style="min-height:50px;"><span class="ico sm i-send"></span>送出</button>
        </div>
        <p class="p tiny muted" style="text-align:center;">按「送出」之前，對方都聽不到</p>`;
      const a = new Audio(audioUrl);
      const bars = sheet.querySelectorAll('.wave i');
      const icon = sheet.querySelector('[data-act="play"] .ico');
      a.addEventListener('play', () => { icon.className = 'ico sm i-pause'; });
      a.addEventListener('pause', () => { icon.className = 'ico sm i-play'; });
      a.addEventListener('timeupdate', () => {
        const n = Math.floor((a.currentTime / (result.duration || 1)) * bars.length);
        bars.forEach((b, i) => b.classList.toggle('done', i < n));
        sheet.querySelector('.vtime').textContent = `${mmss(a.currentTime)} / ${mmss(result.duration)}`;
      });
      a.addEventListener('ended', () => { bars.forEach((b) => b.classList.remove('done')); });
      sheet.__audio = a;
    }

    sheet.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act;
      if (act === 'stop') stopRecording(false);
      else if (act === 'play') { const a = sheet.__audio; if (a.paused) a.play(); else a.pause(); }
      else if (act === 'del') { state = 'done'; sheet.__audio && sheet.__audio.pause(); ov.close(); }
      else if (act === 'redo') {
        sheet.__audio && sheet.__audio.pause();
        if (preset) { state = 'done'; ov.close(); onRedo && onRedo(); return; }
        if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
        try { rec = await startRecorder(); } catch { toast('沒有允許使用麥克風', { soft: true, icon: 'i-mic' }); state = 'done'; ov.close(); return; }
        state = 'recording'; mode = 'tap'; renderRecording();
      } else if (act === 'send') {
        sheet.__audio && sheet.__audio.pause();
        const r = result;
        state = 'done';
        clearInterval(tick);
        resolve({ blob: r.blob, duration: r.duration });
        ov.close();
      }
    });

    if (preset) {
      // 用手機的錄音程式錄好的檔案：直接進入試聽
      result = preset;
      state = 'review';
      audioUrl = URL.createObjectURL(result.blob);
      renderReview();
      return;
    }
    renderRecording();
    if (mode === 'hold') {
      const up = () => { releaseTarget.removeEventListener('pointerup', up); releaseTarget.removeEventListener('pointercancel', up); stopRecording(false); };
      releaseTarget.addEventListener('pointerup', up);
      releaseTarget.addEventListener('pointercancel', up);
      // 在等待麥克風權限時就已經放開手了：直接進入試聽
      if (isHeld && !isHeld()) up();
    }
  });
}
