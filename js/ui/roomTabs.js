/* 「好多人」「兩個人」分頁列（最左邊是展開／收起標題列的小箭頭）與選單裡共用的項目 */
import { store } from '../state/store.js';
import { getTheme } from '../utils/storage.js';

/* 分頁列。state: { tab, headerOpen }；callbacks: onTab(tab)、onToggle() */
export function createTabs({ onTab, onToggle }) {
  const el = document.createElement('div');
  el.setAttribute('role', 'tablist');
  el.setAttribute('aria-label', '聊天室');
  const pips = { group: false, dm: false };
  let state = { tab: 'group', headerOpen: false };

  function unreadTotal() { return store.role === 'owner' ? store.dms.filter((d) => !d.muted).reduce((n, d) => n + (d.unreadCount || 0), 0) : 0; }

  function render() {
    const dm = state.tab === 'dm';
    el.className = 'tabs' + (dm ? ' dm' : '');
    const total = unreadTotal();
    el.innerHTML = `
      <button type="button" class="tab-toggle ${state.headerOpen ? 'open' : ''}" data-act="toggle" aria-expanded="${state.headerOpen}" aria-label="${state.headerOpen ? '收起標題列' : '展開標題列'}"><span class="ico sm ${state.headerOpen ? 'i-up' : 'i-down'}"></span></button>
      <button type="button" class="tab ${state.tab === 'group' ? 'on' : ''}" role="tab" aria-selected="${state.tab === 'group'}" data-tab="group"><span class="ico sm i-users"></span>好多人${pips.group && state.tab !== 'group' ? '<span class="pip"></span>' : ''}</button>
      <button type="button" class="tab ${dm ? 'on dm' : ''}" role="tab" aria-selected="${dm}" data-tab="dm"><span class="ico sm i-lock"></span>兩個人${total ? `<span class="count" style="margin-left:2px;">${total}</span>` : ''}${pips.dm && state.tab !== 'dm' && !total ? '<span class="pip"></span>' : ''}</button>`;
  }
  el.addEventListener('click', (e) => {
    const t = e.target.closest('[data-tab]');
    if (t) { pips[t.dataset.tab] = false; onTab(t.dataset.tab); return; }
    if (e.target.closest('[data-act="toggle"]')) onToggle();
  });
  const offs = [store.on('dms', render)];
  render();
  return {
    el,
    set(next) { state = { ...state, ...next }; if (next.tab) pips[next.tab] = false; render(); },
    pip(tab) { if (tab !== state.tab) { pips[tab] = true; render(); } },
    destroy() { offs.forEach((f) => f()); },
  };
}

/* 選單裡的「換主題」：前面是調色盤，右邊兩顆小色塊（左邊馬卡龍、右邊星夜），目前的有外圈 */
export function themeItem(ctx) {
  const cur = getTheme();
  return {
    html: `<span class="ico sm i-palette"></span>換主題<span class="thm"><i class="p ${cur === 'macaron' ? 'on' : ''}" data-theme="macaron" title="馬卡龍" role="button" aria-label="馬卡龍"></i><i class="n ${cur === 'night' ? 'on' : ''}" data-theme="night" title="星夜" role="button" aria-label="星夜"></i></span>`,
    onClick: (e) => {
      const sw = e.target.closest('[data-theme]');
      ctx.setTheme(sw ? sw.dataset.theme : (cur === 'night' ? 'macaron' : 'night'));
    },
  };
}
