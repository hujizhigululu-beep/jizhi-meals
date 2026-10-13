import { STICKERS, STICKER_GROUPS, getSticker } from './stickers.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const DEFAULT_FREQUENT = Object.freeze(['milk', 'strawberry', 'book', 'shoe', 'star', 'heart', 'bow', 'fork']);
const TABS = Object.freeze([{ id: 'recent', name: '最近' }, { id: 'common', name: '常用' }, ...STICKER_GROUPS, { id: 'all', name: '全部' }]);

function knownIds(ids, limit) {
  const result = [];
  if (!Array.isArray(ids)) return result;
  for (const id of ids) {
    if (typeof id === 'string' && getSticker(id) && !result.includes(id)) result.push(id);
    if (result.length === limit) break;
  }
  return result;
}

// A read-only view: opening a drawer or changing a category never creates usage history.
export function renderStickerPicker({ selectedIds = [], group = 'recent', recentIds = [], frequentIds = DEFAULT_FREQUENT, context = 'day' } = {}) {
  const safeContext = context === 'share' ? 'share' : 'day';
  const current = TABS.some(tab => tab.id === group) ? group : 'recent';
  const selected = knownIds(selectedIds, 3);
  const recent = knownIds(recentIds, 12);
  const frequent = knownIds(frequentIds, 12);
  const recommended = frequent.length ? frequent : [...DEFAULT_FREQUENT];
  let candidates, title, description;
  if (current === 'recent') {
    candidates = (recent.length ? recent : recommended).map(getSticker);
    title = recent.length ? '最近用过的小贴纸' : '先看看常用小贴纸';
    description = recent.length ? '喜欢的小图案，再贴一次 ♡' : '最近还没有使用记录，先从这些小图案里挑挑吧。';
  } else if (current === 'common') {
    candidates = recommended.map(getSticker); title = '常用小贴纸'; description = '几枚熟悉的小可爱，随时陪你。';
  } else if (current === 'all') {
    candidates = STICKERS; title = '整本贴纸小册'; description = '按分类慢慢挑，每一天都有小表情。';
  } else {
    const category = STICKER_GROUPS.find(item => item.id === current);
    candidates = STICKERS.filter(sticker => sticker.category === current);
    title = `${category.name}小贴纸`; description = category.caption;
  }
  const candidateIds = candidates.filter(sticker => !selected.includes(sticker.id));
  const button = (sticker, picked) => `<button type="button" class="sticker-picker-item${picked ? ' is-picked' : ''}" data-${safeContext}-sticker="${escape(sticker.id)}" aria-pressed="${picked}" aria-label="${picked ? '移除' : '选择'}${escape(sticker.name)}贴纸"><img src="${escape(sticker.src)}" width="38" height="38" alt=""><span>${escape(sticker.name)}</span>${picked ? '<i aria-hidden="true">×</i>' : ''}</button>`;
  return `<div class="sticker-library sticker-library-${safeContext}" data-sticker-context="${safeContext}">
    <div class="sticker-library-selected"><div class="sticker-library-selected-title"><span>${safeContext === 'share' ? '这张卡片的贴纸' : '今天贴好的小可爱'}</span><small>${selected.length}/3</small></div>${selected.length ? `<div class="sticker-library-selected-strip">${selected.map(id => button(getSticker(id), true)).join('')}</div>` : '<p class="sticker-library-selected-empty">选几枚，把日常贴得更可爱 ♡</p>'}</div>
    <div class="sticker-library-tabs" role="group" aria-label="贴纸分类">${TABS.map(tab => `<button type="button" data-sticker-group="${escape(tab.id)}" data-${safeContext}-sticker-group="${escape(tab.id)}" aria-pressed="${tab.id === current}">${escape(tab.name)}</button>`).join('')}</div>
    <div class="sticker-library-caption"><strong>${escape(title)}</strong><small>${escape(description)}</small></div>
    <div class="sticker-library-grid">${candidateIds.map(sticker => button(sticker, false)).join('') || '<p class="sticker-library-empty">这组小贴纸已经在上面啦 ♡</p>'}</div>
    <p class="sticker-library-help">最多 3 枚，点上面的已选贴纸即可移除。</p>
    ${selected.includes('strawberry') || candidates.some(sticker => sticker.id === 'strawberry') ? '<p class="sticker-library-credit">草莓图：<a href="./assets/credits.html" target="_blank" rel="noopener">OpenMoji · CC BY-SA 4.0</a></p>' : ''}
  </div>`;
}
