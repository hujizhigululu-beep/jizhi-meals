import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, renderSummary, shiftSummaryMonth, summaryMonthDate } from '../summary.js';
import { freshState, putDiary, normalize } from '../model.js';
import { persist, load, STORAGE_KEY } from '../storage.js';

const meal = (id, date, slot = 'lunch', completed = false, completedAt = null) => ({ id, date, slot, name: id, completed, completedAt });
const empty = () => ({ schemaVersion: 2, meals: [], inventory: [], diaries: [] });

test('补写较早日期的日记，保存和重新加载后仍列在最近写过的日记首位', () => {
  const state = freshState();
  state.diaries = ['2026-10-12', '2026-10-13', '2026-10-14'].map(date => ({ date, text: '之前写的故事', mood: '', joy: '', updatedAt: '2000-01-01T00:00:00.000Z' }));
  putDiary(state, { date: '1999-12-31', text: '今天补写的回忆', mood: '🍓', joy: '' });
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  persist(storage, state);
  assert.ok(JSON.parse(storage.getItem(STORAGE_KEY)).diaries.find(d => d.date === '1999-12-31').updatedAt);
  const restored = load(storage);
  assert.equal(restored.locked, false);
  assert.equal(summarize(restored.state, '2026-10-12').recentDiaries[0].date, '1999-12-31');
});

test('异常日记编辑时间保护原记录；没有旧编辑时间的有效日记仍可导入', () => {
  const state = freshState();
  state.diaries = [{ date: '2026-10-12', mood: '', text: '保留旧日记', joy: '' }];
  assert.equal(normalize(state).locked, false);
  state.diaries[0].updatedAt = 'invalid-timestamp';
  assert.equal(normalize(state).locked, true);
});

test('counts unique days, all snack entries and slots across a year boundary without mutating data', () => {
  const state = empty();
  state.meals = [meal('a', '2025-12-29', 'breakfast'), meal('b', '2026-01-01'), meal('c', '2026-01-01', 'snack'), meal('d', '2026-01-01', 'snack'), meal('e', '2026-01-04', 'dinner'), meal('f', '2026-01-05'), meal('outside', '2025-12-28')];
  state.diaries = [{ date: '2026-01-01', text: '新年快乐' }, { date: '2026-01-02', mood: '轻松' }, { date: '2026-01-03', text: '', joy: '  ' }];
  const before = structuredClone(state);
  const summary = summarize(state, '2026-01-01');
  assert.deepEqual(summary.week, { start: '2025-12-29', end: '2026-01-04', mealDays: 3, mealCount: 5, counts: { breakfast: 1, lunch: 1, dinner: 1, snack: 2 }, diaryDays: 2, completedCount: 0 });
  assert.equal(summary.month.start, '2026-01-01');
  assert.equal(summary.month.end, '2026-01-31');
  assert.equal(summary.month.mealDays, 3);
  assert.deepEqual(state, before);
});

test('February boundaries respect leap years', () => {
  const state = empty();
  state.meals = [meal('leap', '2024-02-29'), meal('march', '2024-03-01')];
  assert.equal(summarize(state, '2024-02-28').month.end, '2024-02-29');
  assert.equal(summarize(state, '2024-02-28').month.mealDays, 1);
  assert.equal(summarize(state, '2025-02-28').month.end, '2025-02-28');
});

test('recent meals include only completed rows, ordered by completion time with date fallback and capped at five', () => {
  const state = empty();
  state.meals = [
    meal('planned', '2026-10-13', 'dinner', false, '2026-10-13T12:00:00Z'),
    meal('backfilled', '2026-09-01', 'lunch', true, '2026-10-12T14:00:00Z'),
    meal('no-time', '2026-10-11', 'snack', true),
    meal('invalid-time', '2026-10-10', 'breakfast', true, 'invalid'),
    ...['09', '08', '07', '06'].map(day => meal(`older-${day}`, `2026-10-${day}`, 'lunch', true)),
  ];
  assert.deepEqual(summarize(state, '2026-10-12').recentMeals.map(row => row.id), ['backfilled', 'no-time', 'invalid-time', 'older-09', 'older-08']);
});

test('recent diaries use editing time, skip empty entries and cap at three', () => {
  const state = empty();
  state.diaries = [
    { date: '2026-09-01', text: '补写的故事', updatedAt: '2026-10-12T13:00:00Z' },
    { date: '2026-10-11', mood: '开心' },
    { date: '2026-10-10', joy: '一杯奶茶', updatedAt: 'invalid' },
    { date: '2026-10-09', text: '昨天' },
    { date: '2026-10-12', text: ' ', joy: '', mood: '' },
  ];
  assert.deepEqual(summarize(state, '2026-10-12').recentDiaries.map(row => row.date), ['2026-09-01', '2026-10-11', '2026-10-10']);
});

test('summary rendering escapes stored text and provides date/range buttons', () => {
  const state = empty();
  state.meals = [{ ...meal('x', '2026-10-12', 'snack', true), name: '<img src=x onerror="alert(1)">', time: '"><script>bad</script>' }];
  state.diaries = [{ date: '2026-10-12', text: '<script>private</script>', mood: '" onclick="bad' }];
  const html = renderSummary(state, '2026-10-12', 'month', '2026-10-12');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('data-review-date="2026-10-12"'));
  assert.ok(html.includes('data-summary-range="month" aria-pressed="true"'));
  assert.ok(html.includes('零食 / 加餐'));
});

test('历史月份导航跨年、跨闰月且不溢出支持的年份', () => {
  assert.equal(shiftSummaryMonth('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftSummaryMonth('2027-01-01', -1), '2026-12-01');
  assert.equal(shiftSummaryMonth('2024-03-31', -1), '2024-02-01');
  assert.equal(shiftSummaryMonth('0001-01-01', -1), null);
  assert.equal(shiftSummaryMonth('9999-12-31', 1), null);
  assert.equal(shiftSummaryMonth('2026-02-30', 1), null);
  assert.equal(shiftSummaryMonth('2026-12-31', .5), null);
  assert.equal(summaryMonthDate('2024-02'), '2024-02-01');
  for (const invalid of ['2026-2', '2026-13', '0000-01', '', null]) assert.equal(summaryMonthDate(invalid), null);
});

test('历史月统计、餐食和日记预览全部跟随选择范围，其他年月只被隐藏', () => {
  const state = empty();
  state.meals = [meal('去年十二月', '2026-12-31', 'dinner', true), meal('新年早餐', '2027-01-01', 'breakfast'), meal('新年加餐', '2027-01-01', 'snack'), meal('第二天加餐', '2027-01-02', 'snack')];
  state.diaries = [{ date: '2026-12-31', text: '旧年的故事' }, { date: '2027-01-02', text: '新年的故事' }];
  const raw = JSON.stringify(state);
  const december = renderSummary(state, '2026-12-01', 'month', '2027-01-10');
  assert.ok(december.includes('2026年 12月'));
  assert.ok(december.includes('去年十二月') && december.includes('旧年的故事'));
  assert.ok(!december.includes('新年早餐') && !december.includes('新年的故事'));
  const january = renderSummary(state, shiftSummaryMonth('2026-12-01', 1), 'month', '2027-01-10');
  assert.ok(january.includes('新年早餐') && january.includes('新年的故事'));
  assert.ok(!january.includes('去年十二月') && !january.includes('旧年的故事'));
  const stats = summarize(state, '2027-01-01').month;
  assert.equal(stats.mealDays, 2);
  assert.equal(stats.mealCount, 3);
  assert.equal(stats.diaryDays, 1);
  assert.equal(stats.counts.snack, 2);
  assert.equal(JSON.stringify(state), raw);
});

test('多年份记录经过保存、反复筛选和重载仍完整存在', () => {
  const state = freshState();
  state.meals = [meal('旧便当', '2024-02-29', 'lunch', true), meal('年底计划', '2026-12-31', 'dinner'), meal('新年计划', '2027-01-01', 'breakfast')];
  state.diaries = [{ date: '2024-02-29', mood: '🍓', text: '老日记', joy: '' }, { date: '2027-01-01', mood: '', text: '新日记', joy: '' }];
  const values = new Map();
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  persist(storage, state);
  const before = storage.getItem(STORAGE_KEY);
  const loaded = load(storage);
  for (let i = 0; i < 20; i++) {
    for (const date of ['2024-02-01', '2026-12-01', '2027-01-01']) renderSummary(loaded.state, date, 'month');
  }
  assert.equal(storage.getItem(STORAGE_KEY), before);
  assert.deepEqual(load(storage).state.meals.map(m => m.id), ['旧便当', '年底计划', '新年计划']);
  assert.equal(load(storage).state.diaries.length, 2);
});

test('本周可以跨年份统计，支持年份边界的部分周', () => {
  const state = empty();
  state.meals = [meal('year-end', '2026-12-31'), meal('year-start', '2027-01-01'), meal('last-supported-day', '9999-12-31')];
  assert.equal(summarize(state, '2027-01-01').week.mealCount, 2);
  assert.equal(summarize(state, '9999-12-31').week.end, '9999-12-31');
  assert.equal(summarize(state, '9999-12-31').week.mealCount, 1);
});

test('empty state stays gentle and invalid dates do not enter the calendar', () => {
  const html = renderSummary(empty(), '2026-10-12');
  assert.ok(html.includes('吃过的好味道，会在这里收好'));
  assert.ok(!html.includes('未完成'));
  assert.throws(() => summarize(empty(), '2026-02-30'), /有效日期/);
  const state = empty();
  state.meals = [meal('invalid', '2026-02-30'), meal('unknown', '2026-10-12', 'cost')];
  assert.equal(summarize(state, '2026-10-12').week.mealCount, 0);
});
