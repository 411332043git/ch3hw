/* 第一個畫面：選身分（訪客 / 縵），以及訪客的兩個選項（好多人 / 兩個人） */
import { avatarHtml } from '../utils/sanitize.js';
import { store } from '../state/store.js';

const demoBar = `<div class="demo-bar" role="note"><span class="ico sm i-info"></span>示範模式：訊息只存在你的瀏覽器</div>`;

export function landingScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'app page landing';
  el.innerHTML = `
    ${demoBar}
    <div class="hero" aria-hidden="true">
      <div class="blob" style="left:6px;top:70px;width:64px;height:64px;background:var(--yellow);opacity:.9;"></div>
      <div class="blob" style="right:10px;top:14px;width:46px;height:46px;background:var(--mint);"></div>
      <div class="blob" style="right:40px;bottom:6px;width:28px;height:28px;background:var(--peach);"></div>
      <div class="blob" style="left:12px;top:14px;width:34px;height:34px;background:var(--accent);"></div>
      <div class="blob" style="right:76px;top:6px;width:30px;height:30px;background:var(--second);"></div>
      <span class="abs" style="left:34px;top:66px;">${avatarHtml('dog', 'xl')}</span>
      <span class="abs" style="left:120px;top:20px;">${avatarHtml('rabbit', 'xl', 'big')}</span>
      <span class="abs" style="left:236px;top:74px;">${avatarHtml('cat', 'xl')}</span>
      <span class="abs" style="left:82px;top:148px;">${avatarHtml('bear', 'lg')}</span>
      <span class="abs" style="left:168px;top:140px;">${avatarHtml('fish', 'lg')}</span>
      <span class="abs" style="left:270px;top:168px;">${avatarHtml('pig', 'sm')}</span>
    </div>
    <div class="col gap16 choices">
      <button class="card sky press col gap12 choice" data-go="visitor">
        <span class="row">
          <span class="row" style="flex:none;">
            ${avatarHtml('duck', 'lg')}
            <span style="margin-left:-14px;display:inline-flex;">${avatarHtml('giraffe', 'lg')}</span>
            <span style="margin-left:-14px;display:inline-flex;">${avatarHtml('crab', 'lg')}</span>
          </span>
          <span class="grow"></span>
          <span class="ico i-right"></span>
        </span>
        <span class="col gap4">
          <span class="h2">訪客</span>
          <span class="row gap6" style="margin-top:4px;"><span class="chip mint">好多人</span><span class="chip yellow">兩個人</span></span>
        </span>
      </button>
      <button class="card yellow press row gap12 choice" data-go="owner">
        ${avatarHtml('mm', 'xl', 'owner-av')}
        <span class="col grow gap4">
          <span class="h2">縵</span>
          <span class="row gap6" style="margin-top:4px;"><span class="chip line"><span class="ico sm i-lock"></span>需要登入</span></span>
        </span>
        <span class="ico i-right"></span>
      </button>
    </div>
    <div class="grow"></div>
    <p class="p tiny muted center" style="padding:0 24px 22px;">隨時可以從選單回到這裡</p>`;
  el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    if (b.dataset.go === 'visitor') {
      // 選了訪客，這個分頁就是訪客（就算這台裝置之前記得縵）
      try { await ctx.service.useVisitor(); await ctx.refreshSession(); } catch { /* 忽略 */ }
      ctx.go('visitor');
    } else if (store.ownerRemembered) {
      // 這台裝置有被記得：直接以縵的身分進去
      try { await ctx.service.resumeOwner(); await ctx.afterOwnerLogin(); return; } catch { /* 失敗就改走登入 */ }
      ctx.go('ownerLogin');
    } else ctx.go('ownerLogin');
  });
  return { el };
}

export function visitorScreen(ctx) {
  const el = document.createElement('div');
  el.className = 'app page landing';
  const online = 12;
  el.innerHTML = `
    ${demoBar}
    <div class="row gap8" style="padding:16px 16px 0;">
      <button class="btn-ico" data-go="landing" aria-label="回上一頁"><span class="ico i-left"></span></button>
      <span class="grow"></span>
    </div>
    <div class="col gap20 choices" style="padding-top:28px;">
      <button class="card yellow press col gap12 choice" data-go="group">
        <div class="row gap12">
          <span class="row" style="flex:none;">
            ${avatarHtml('dog', 'lg')}
            <span style="margin-left:-16px;display:inline-flex;">${avatarHtml('rabbit', 'lg')}</span>
            <span style="margin-left:-16px;display:inline-flex;">${avatarHtml('cat', 'lg')}</span>
          </span>
          <span class="grow"></span>
          <span class="chip mint"><span class="dot"></span>${online} 人在線</span>
        </div>
        <div class="col gap4">
          <span class="title" style="font-size:26px;">好多人</span>
          <span class="p">大家一起聊，全部匿名，只要輸入一個名稱就能進去。</span>
        </div>
        <div class="row gap8">
          <span class="chip line">匿名</span>
          <span class="grow"></span>
          <span class="btn sm">進去<span class="ico sm i-right"></span></span>
        </div>
      </button>
      <button class="card rose press col gap12 choice" data-go="dm">
        <div class="row gap12">
          <span class="row" style="flex:none;">
            ${avatarHtml('pig', 'lg')}
            <span style="margin-left:-16px;display:inline-flex;">${avatarHtml('mm', 'lg')}</span>
          </span>
          <span class="grow"></span>
          <span class="chip yellow"><span class="ico sm i-lock"></span>要輸入數字</span>
        </div>
        <div class="col gap4">
          <span class="title" style="font-size:26px;">兩個人</span>
          <span class="p">只有你和 縵 兩個人。需要輸入自己的名字，和你預設的數字。</span>
        </div>
        <div class="row gap8">
          <span class="chip line">一對一</span>
          <span class="grow"></span>
          <span class="btn sm blue">進去<span class="ico sm i-right"></span></span>
        </div>
      </button>
    </div>
    <div class="grow"></div>
    <p class="p tiny muted center" style="padding:0 24px 22px;">兩個地方，你可以隨時來回切換</p>`;
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    const g = b.dataset.go;
    if (g === 'landing') ctx.go('landing');
    else if (g === 'group') ctx.enterGroup();
    else if (g === 'dm') ctx.enterDm();
  });
  return { el };
}
