import { dateKey, parseDate, weekDates } from './model.js';

const LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食 / 加餐' };
const SLOT_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const shortDate = key => `${Number(key.slice(5, 7))}月${Number(key.slice(8, 10))}日`;

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
  const week = weekDates(date);
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
    week: period(meals, diaries, week[0], week[6]),
    month: period(meals, diaries, monthStart, monthEnd),
    recentMeals, recentDiaries,
  };
}

/** Buttons are handled by app.js: data-summary-range and data-review-date. */
export function renderSummary(state, date, range = 'week') {
  const summary = summarize(state, date);
  const selectedRange = range === 'month' ? 'month' : 'week';
  const selected = summary[selectedRange];
  const rangeName = selectedRange === 'week' ? '本周' : '本月';
  return `<section class="page summary-page">
    <div class="section-heading"><div><div class="eyebrow">THE LITTLE STORIES OF MY LIFE</div><h1>我的生活汇总</h1><p class="subheading">翻翻小纸条，回顾那些甜甜的日子 ♡</p></div></div>
    <div class="summary-range" role="group" aria-label="汇总时间范围"><button type="button" class="pill ${selectedRange === 'week' ? 'pink' : ''}" data-summary-range="week" aria-pressed="${selectedRange === 'week'}">本周</button><button type="button" class="pill ${selectedRange === 'month' ? 'pink' : ''}" data-summary-range="month" aria-pressed="${selectedRange === 'month'}">本月</button></div>
    <p class="summary-period">${escape(selected.start)} — ${escape(selected.end)} · 跟随日历所选日期</p>
    <div class="summary-stats"><div class="summary-stat"><span>${rangeName}留下餐食的日子</span><strong>${selected.mealDays}</strong><small>天</small></div><div class="summary-stat"><span>${rangeName}写下生活的日子</span><strong>${selected.diaryDays}</strong><small>天</small></div></div>
    <div class="summary-slot-counts" aria-label="${rangeName}餐食记录数量">${SLOT_ORDER.map(slot => `<div class="summary-slot-count"><span>${LABELS[slot]}</span><strong>${selected.counts[slot]} <small>条</small></strong></div>`).join('')}</div>
    <p class="summary-empty">餐食数量包含小计划和已吃记录。每一页留白，都可以慢慢写。</p>
    <section class="summary-section settings-card"><h2>最近好好吃过的餐食</h2>${summary.recentMeals.length ? `<div class="summary-list">${summary.recentMeals.map(meal => `<button type="button" class="summary-entry" data-review-date="${escape(meal.date)}"><span class="summary-entry-title">${escape(meal.name)}</span><span class="summary-entry-meta">${shortDate(meal.date)} · ${LABELS[meal.slot]}${meal.time ? ` · ${escape(meal.time)}` : ''} ↗</span></button>`).join('')}</div>` : '<p class="summary-empty">吃过的好味道，会在这里收好 ♡</p>'}</section>
    <section class="summary-section settings-card"><h2>最近写过的生活日记</h2>${summary.recentDiaries.length ? `<div class="summary-list">${summary.recentDiaries.map(diary => {
      const preview = String(diary.text || diary.joy || '').replace(/\s+/g, ' ').trim();
      const excerpt = Array.from(preview).slice(0, 70).join('');
      return `<button type="button" class="summary-entry" data-review-date="${escape(diary.date)}"><span class="summary-entry-title">${shortDate(diary.date)}${diary.mood ? ` · ${escape(diary.mood)}` : ''}</span>${excerpt ? `<span class="summary-entry-preview">${escape(excerpt)}${Array.from(preview).length > 70 ? '…' : ''}</span>` : ''}<span class="summary-entry-meta">翻开这一天的小故事 ↗</span></button>`;
    }).join('')}</div>` : '<p class="summary-empty">想写的时候，留下一句就很好 ✎</p>'}</section>
    <p class="footer-note">好好吃饭，好好生活。<br>这是回忆的小抽屉，每天都有自己的节奏 ♡</p>
  </section>`;
}
