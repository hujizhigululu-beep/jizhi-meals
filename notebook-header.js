// Static brand compositions. Nothing from a record is interpolated into this markup.
const HEADERS = Object.freeze({
  day: {
    english: 'PRIVATE FOOD JOURNAL', line: '把日常，收得甜甜一点 ♡', label: '今日小餐桌',
    primary: './assets/milk-carton.svg', secondary: './assets/share-art/strawberry-stamp.svg',
  },
  month: {
    english: 'LITTLE CALENDAR', line: '每一天，都攒一点小积累', label: '日子收藏册',
    primary: './assets/notebook-ui/month-card.svg', secondary: './assets/share-art/collage-flower.svg',
  },
  timeline: {
    english: 'LITTLE MOMENTS', line: '翻一翻，温柔的小日常 (˶ᵔ ᵕ ᵔ˶)', label: '时光小邮局',
    primary: './assets/share-art/collage-camera.svg', secondary: './assets/share-art/badges-envelope.svg',
  },
  inventory: {
    english: 'MY LITTLE FRIDGE', line: '给下一顿，留一点小期待', label: '小冰箱来信',
    primary: './assets/notebook-ui/little-fridge.svg', secondary: './assets/share-art/strawberry-pudding.svg',
  },
  summary: {
    english: 'LITTLE LIFE COLLECTION', line: '平凡的小事，也值得收藏 ♡', label: '生活收藏夹',
    primary: './assets/notebook-ui/memory-book.svg', secondary: './assets/share-art/badges-mint-medal.svg',
  },
  settings: {
    english: 'PRIVATE LITTLE SPACE', line: '把自己的小世界，妥妥收好', label: '私人小角落',
    primary: './assets/notebook-ui/private-letter.svg', secondary: './assets/share-art/badges-bow-pin.svg',
  },
});

export function renderNotebookHeader(page, view = 'day') {
  const theme = page === 'calendar' ? (['day', 'month', 'timeline'].includes(view) ? view : 'day') : (Object.prototype.hasOwnProperty.call(HEADERS, page) ? page : 'day');
  const item = HEADERS[theme];
  return `<div class="notebook-heading notebook-heading-${theme}" data-theme="${theme}">
    <span class="notebook-cover-tape" aria-hidden="true"></span>
    <div class="notebook-brand-copy">
      <span class="notebook-edition cover-edition">AI 测试版 · 独立手账</span>
      <a class="brand" href="#calendar" aria-label="机智定食-ai测试版本首页"><span>机智定食-ai测试版本<small>${item.line}</small></span></a>
    </div>
    <div class="notebook-cover-art" aria-hidden="true">
      <span class="notebook-art-paper"></span>
      <img class="notebook-art-primary" src="${item.primary}" width="78" height="78" alt="">
      <img class="notebook-art-secondary" src="${item.secondary}" width="45" height="45" alt="">
      <span class="notebook-art-spark">✧</span>
    </div>
    <span class="notebook-cover-label cover-label" aria-hidden="true">${item.label} ♡</span>
  </div>`;
}
