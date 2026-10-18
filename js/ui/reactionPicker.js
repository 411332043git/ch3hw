/* 表情回應選擇器（按訊息下方的「＋」）：放大鏡＋分類，按了放大鏡才出現搜尋框 */
import { CATEGORIES, searchEmoji } from '../data/emoji.js';
import { local } from '../utils/storage.js';
import { openOverlay } from './modal.js';

const RECENT_KEY = 'reactionRecents';

export function pushRecent(e) {
  const list = [e, ...local.get(RECENT_KEY, []).filter((x) => x !== e)].slice(0, 16);
  local.set(RECENT_KEY, list);
}

export function openReactionPicker({ onPick }) {
  let cat = 'recent';
  let searching = false;
  let query = '';
  const recents = () => local.get(RECENT_KEY, []);

  const ov = openOverlay(`
    <div class="sheet picker-sheet" role="dialog" aria-label="選一個表情回應" style="max-height:78vh;">
      <span class="grab"></span>
      <div class="row">
        <span class="h2 grow">選一個表情回應</span>
        <button class="btn-ico flat" data-close aria-label="關閉"><span class="ico i-x"></span></button>
      </div>
      <div class="search-box" style="display:none;">
        <div class="row gap8 input" style="min-height:46px;padding:0 14px;">
          <span class="ico sm i-search"></span>
          <input type="search" class="q" placeholder="搜尋，例如「愛心」「cat」" style="border:none;outline:none;background:none;flex:1;min-width:0;font:inherit;color:inherit;">
        </div>
      </div>
      <div class="cat-tabs" role="tablist" style="overflow-x:auto;scrollbar-width:none;"></div>
      <div class="grid-wrap" style="overflow-y:auto;min-height:150px;max-height:40vh;"></div>
    </div>`, { sheet: true });
  const root = ov.el;
  const tabs = root.querySelector('.cat-tabs');
  const grid = root.querySelector('.grid-wrap');
  const sb = root.querySelector('.search-box');
  const q = root.querySelector('.q');

  function renderTabs() {
    tabs.innerHTML = `<button class="cat srch" data-search aria-label="搜尋表情"><span class="ico sm i-search"></span></button>`
      + [['recent', '最近使用'], ...CATEGORIES.map((c) => [c.id, c.label])]
        .map(([id, l]) => `<button class="cat ${!searching && cat === id ? 'on' : ''}" data-cat="${id}" role="tab">${l}</button>`).join('');
  }
  function renderGrid() {
    let items = [];
    let title = '';
    if (searching) {
      items = searchEmoji(query);
      title = query ? (items.length ? '搜尋結果' : '找不到這個，換個關鍵字試試') : '輸入關鍵字，例如「愛心」或 cat';
    } else if (cat === 'recent') {
      items = recents();
      title = items.length ? '最近使用' : '還沒有最近使用的，先選一個吧';
    } else {
      const c = CATEGORIES.find((x) => x.id === cat);
      items = c.items.map((i) => i[0]);
      title = c.label;
    }
    grid.innerHTML = `<div class="tiny muted bold" style="padding:4px 2px 6px;">${title}</div>
      <div class="emoji-grid eight">${items.map((e) => `<button class="emo" data-e="${e}" aria-label="${e}">${e}</button>`).join('')}</div>`;
  }
  renderTabs();
  renderGrid();
  root.addEventListener('click', (e) => {
    const s = e.target.closest('[data-search]');
    if (s) {
      searching = !searching;
      sb.style.display = searching ? 'block' : 'none';
      if (searching) q.focus();
      renderTabs(); renderGrid();
      return;
    }
    const c = e.target.closest('[data-cat]');
    if (c) { cat = c.dataset.cat; searching = false; sb.style.display = 'none'; renderTabs(); renderGrid(); return; }
    const em = e.target.closest('[data-e]');
    if (em) { pushRecent(em.dataset.e); ov.close(); onPick(em.dataset.e); }
  });
  q.addEventListener('input', () => { query = q.value; renderGrid(); });
  return ov;
}
