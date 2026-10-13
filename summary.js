import { dateKey, parseDate, weekDates } from './model.js';

const LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食 / 加餐' };
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const shortDate = key => `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;
const entryDate = key => `<time class="summary-entry-date" datetime="${escape(key)}" aria-label="${shortDate(key)}"><span class="summary-entry-month">${Number(key.slice(5, 7))}月</span><span class="summary-entry-day">${Number(key.slice(8, 10))}<small>日</small></span></time>`;
export function summaryMonthDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return null;
  return parseDate(`${value}-01`) ? `${value}-01` : null;
}
export function shiftSummaryMonth(date, offset) {
  const day = parseDate(date);
  if (!day || !Number.isInteger(offset)) return null;
  const index = (day.getFullYear() - 1) * 12 + day.getMonth() + offset;
  if (index < 0 || index >= 9999 * 12) return null;
  return `${String(Math.floor(index / 12) + 1).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}-01`;
}

function period(meals, diaries, start, end) {
  const included = meals.filter(meal => meal.date >= start && meal.date <= end);
  const counts = Object.fromEntries(SLOT_ORDER.map(slot => [slot, included.filter(meal => meal.slot === slot).length]));
  return {
    start, end, mealDays: new Set(included.map(meal => meal.date)).size,
    mealCount: included.length, counts,
    diaryDays: new Set(diaries.filter(diary => diary.date >= start && diary.date <= end).map(diary => diary.date)).size,
    completedCount: included.filter(meal => meal.completed === true).length,
  };
}

const timestamp = (value, fallback) => {
  const parsed = typeof value === 'string' ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.parse(`${fallback}T12:00:00`);
};

/** A read-only view: counts include plans and meals eaten; recentMeals includes only meals eaten. */
export function summarize(state, date) {
  const selected = parseDate(date);
  if (!selected) throw new Error('请选择有效日期，再回顾这页生活。');
  const meals = (state.meals || []).filter(meal => meal && parseDate(meal.date) && SLOT_ORDER.includes(meal.slot));
  const diaries = (state.diaries || []).filter(diary => diary && parseDate(diary.date) && [diary.mood, diary.text, diary.joy].some(value => typeof value === 'string' && value.trim()));
  const week = weekDates(date).filter(Boolean);
  const monthStart = `${date.slice(0, 7)}-01`;
  const monthLast = parseDate(monthStart);
  monthLast.setMonth(monthLast.getMonth() + 1);
  monthLast.setDate(0);
  const monthEnd = dateKey(monthLast);
  const recentMeals = meals.filter(meal => meal.completed === true).slice().sort((a, b) =>
    timestamp(b.completedAt, b.date) - timestamp(a.completedAt, a.date) || b.date.localeCompare(a.date) || String(a.id).localeCompare(String(b.id)),
  ).slice(0, 5);
  const recentDiaries = diaries.slice().sort((a, b) =>
    timestamp(b.updatedAt, b.date) - timestamp(a.updatedAt, a.date) || b.date.localeCompare(a.date),
  ).slice(0, 3);
  return {
    date,
    week: period(meals, diaries, week[0], week.at(-1)),
    month: period(meals, diaries, monthStart, monthEnd),
    recentMeals, recentDiaries,
  };
}

/** Buttons are handled by app.js: data-summary-range and data-review-date. */
export function renderSummary(state, date, range = 'week', currentDate = dateKey(new Date())) {
  const summary = summarize(state, date);
  const selectedRange = range === 'month' ? 'month' : 'week';
  const selected = summary[selectedRange];
  const rangeName = selectedRange === 'week' ? '所选一周' : `${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月`;
  const thisWeek = weekDates(currentDate).filter(Boolean);
  const weekActive = selectedRange === 'week' && selected.start === thisWeek[0];
  const monthActive = selectedRange === 'month' && date.slice(0, 7) === currentDate.slice(0, 7);
  const recentMeals = (state.meals || []).filter(meal => meal && parseDate(meal.date) && SLOT_ORDER.includes(meal.slot) && meal.date >= selected.start && meal.date <= selected.end).slice().sort((a, b) => b.date.localeCompare(a.date) || String(b.time || '').localeCompare(String(a.time || '')) || timestamp(b.completedAt, b.date) - timestamp(a.completedAt, a.date)).slice(0, 5);
  const recentDiaries = (state.diaries || []).filter(diary => diary && parseDate(diary.date) && diary.date >= selected.start && diary.date <= selected.end && [diary.mood, diary.text, diary.joy].some(value => typeof value === 'string' && value.trim())).slice().sort((a, b) => timestamp(b.updatedAt, b.date) - timestamp(a.updatedAt, a.date)).slice(0, 3);
  return `<section class="page summary-page">
    <div class="section-heading"><div><div class="eyebrow">THE LITTLE STORIES OF MY LIFE</div><h1>我的生活汇总</h1><p class="subheading">把好好吃饭与生活，收进这一页 ♡</p></div></div>
    <div class="summary-overview">
      <div class="summary-month-nav" role="group" aria-label="历史月份导航"><button type="button" class="icon-button" data-action="summary-prev-month" aria-label="上个月" ${shiftSummaryMonth(date, -1) ? '' : 'disabled'}>‹</button><label for="summary-month"><span class="summary-month-caption">翻到这一月</span><span class="summary-month-title">${Number(date.slice(0, 4))}年 ${Number(date.slice(5, 7))}月 <span aria-hidden="true">⌄</span></span><input id="summary-month" type="month" min="0001-01" max="9999-12" value="${date.slice(0, 7)}" aria-label="选择历史月份"></label><button type="button" class="icon-button" data-action="summary-next-month" aria-label="下个月" ${shiftSummaryMonth(date, 1) ? '' : 'disabled'}>›</button></div>
      <div class="summary-range" role="group" aria-label="汇总时间范围"><button type="button" class="pill ${weekActive ? 'pink' : ''}" data-summary-range="week" aria-pressed="${weekActive}">本周</button><button type="button" class="pill ${monthActive ? 'pink' : ''}" data-summary-range="month" aria-pressed="${monthActive}">本月</button><span>${selectedRange === 'week' ? '一周的小回顾' : '这一月的小回顾'}</span></div>
      <p class="summary-period"><time datetime="${escape(selected.start)}">${escape(selected.start)}</time><span aria-hidden="true"> — </span><time datetime="${escape(selected.end)}">${escape(selected.end)}</time></p>
    </div>
    <div class="summary-stats"><div class="summary-stat"><span>记过餐食的日子</span><div class="summary-stat-value"><strong>${selected.mealDays}</strong><small>天</small></div></div><div class="summary-stat"><span>写过日记的日子</span><div class="summary-stat-value"><strong>${selected.diaryDays}</strong><small>天</small></div></div></div>
    <div class="summary-slot-counts" aria-label="${rangeName}餐食记录数量">${SLOT_ORDER.map(slot => `<div class="summary-slot-count"><span>${LABELS[slot]}</span><strong>${selected.counts[slot]} <small>条</small></strong></div>`).join('')}</div>
    <p class="summary-count-note">餐食数量包含小计划和已吃记录。</p>
    <section class="summary-section summary-meal-catalog settings-card"><div class="summary-section-heading"><h2>这段时间的餐食</h2><span aria-hidden="true">MEAL NOTES</span></div>${recentMeals.length ? `<div class="summary-list">${recentMeals.map(meal => `<button type="button" class="summary-entry summary-entry--meal" data-review-date="${escape(meal.date)}" aria-label="${escape(`${shortDate(meal.date)} ${LABELS[meal.slot]}：${meal.name}，翻开这一天`)}">${entryDate(meal.date)}<span class="summary-entry-content"><span class="summary-entry-title">${escape(meal.name)}</span><span class="summary-entry-meta">${LABELS[meal.slot]} · ${meal.completed ? '已吃' : '小计划'}${meal.time ? ` · ${escape(meal.time)}` : ''}</span></span><span class="summary-entry-link" aria-hidden="true">翻开 ↗</span></button>`).join('')}</div>` : '<div class="summary-placeholder"><img src="./assets/food/strawberry.svg" alt="" aria-hidden="true" width="40" height="40"><p class="summary-empty">吃过的好味道，会在这里收好。<br>先去记一顿饭吧 ♡</p></div>'}</section>
    <section class="summary-section summary-story-catalog settings-card"><div class="summary-section-heading"><h2>这段时间的小故事</h2><span aria-hidden="true">LITTLE STORIES</span></div>${recentDiaries.length ? `<div class="summary-list">${recentDiaries.map(diary => {
      const preview = String(diary.text || diary.joy || '').replace(/\s+/g, ' ').trim();
      const mood = diary.mood || '';
      return `<button type="button" class="summary-entry summary-entry--story" data-review-date="${escape(diary.date)}" aria-label="${escape(`${shortDate(diary.date)}，翻开这一天的小故事`)}">${entryDate(diary.date)}<span class="summary-entry-content summary-story-line">${mood ? `<span class="summary-entry-mood">${escape(mood)}</span>` : ''}${mood && preview ? '<span class="summary-entry-divider" aria-hidden="true">·</span>' : ''}${preview ? `<span class="summary-entry-preview">${escape(preview)}</span>` : ''}${!mood && !preview ? '<span class="summary-entry-title">这一天的小故事</span>' : ''}</span><span class="summary-entry-link" aria-hidden="true">翻开 ↗</span></button>`;
    }).join('')}</div>` : '<div class="summary-placeholder"><img src="./assets/food/strawberry.svg" alt="" aria-hidden="true" width="40" height="40"><p class="summary-empty">这段时间还没有写下故事。<br>想写的时候，留下一句就很好 ♡</p></div>'}</section>
    <p class="footer-note">好好吃饭，好好生活 ♡</p>
  </section>`;
}
