import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, renderSummary } from '../summary.js';
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
  const html = renderSummary(state, '2026-10-12', 'month');
  assert.ok(!html.includes('<script>'));
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  assert.ok(html.includes('data-review-date="2026-10-12"'));
  assert.ok(html.includes('data-summary-range="month" aria-pressed="true"'));
  assert.ok(html.includes('零食 / 加餐'));
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
