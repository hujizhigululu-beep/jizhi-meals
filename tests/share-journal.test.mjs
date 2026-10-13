import test from 'node:test';
import assert from 'node:assert/strict';
import { SHARE_TEMPLATES, SHARE_THEMES, normalizeJournalShareOptions, prepareJournalShare, journalShareBounds, generateJournalShareCard } from '../share-journal.js';

const fixture = () => ({
  inventory: [{ id: 'food', stock: 4, image: 'keep' }],
  meals: [
    { id: 'a', date: '2026-10-02', slot: 'lunch', name: '番茄鸡蛋', completed: true, note: '私密餐食备注' },
    { id: 'b', date: '2026-10-13', slot: 'breakfast', name: '牛奶吐司', completed: true },
    { id: 'c', date: '2026-10-13', slot: 'dinner', name: '蘑菇面', completed: false },
    { id: 'd', date: '2026-10-13', slot: 'snack', time: '15:30', name: '苹果', completed: true },
    { id: 'e', date: '2026-09-30', slot: 'lunch', name: '排除上个月', completed: true },
    { id: 'f', date: '2026-10-13', slot: 'lunch', name: '  ' },
  ],
  diaries: [{ date: '2026-10-13', mood: '心情仅本人看', joy: '私密小确幸', text: '私密故事\n第二行🌸👩‍🎨' }],
  dayRecords: [
    { date: '2026-10-03', study: { checked: true, items: [{ content: '画画', minutes: 30, note: '私密学习备注' }] }, exercise: { checked: false, items: [{ content: '已取消徒步', minutes: 60 }] }, stickerIds: ['book'] },
    { date: '2026-10-13', study: { checked: true, items: [{ content: '日语', minutes: 60 }, { content: '英语', minutes: 20 }] }, exercise: { checked: true, items: [{ content: '散步', minutes: null, note: '私密运动备注', steps: 8000, distance: 5, calories: 200 }] }, stickerIds: ['milk', 'heart', 'book'] },
  ],
});

test('eight templates are two per kind with distinct layout functions and separated themes', () => {
  assert.equal(SHARE_TEMPLATES.length, 8);
  for (const kind of ['meal', 'exercise', 'study', 'life']) {
    const pair = SHARE_TEMPLATES.filter(item => item.kind === kind);
    assert.equal(pair.length, 2); assert.notEqual(pair[0].draw, pair[1].draw);
    for (const template of pair) { assert.ok(SHARE_THEMES[template.themeId]); assert.equal(template.theme, undefined); }
  }
});

test('monthly statistics count unique real days, multiple activities sum recorded minutes', () => {
  const data = prepareJournalShare(fixture(), { kind: 'life', scope: 'month', month: '2026-10' });
  assert.deepEqual(data.counts, { mealDays: 2, mealCount: 4, exerciseDays: 1, studyDays: 2, exerciseMinutes: 0, studyMinutes: 110 });
  assert.equal(data.exercises.length, 1); assert.equal(data.exercises[0].minutesKnown, false);
  assert.equal(data.meals.some(row => row.title === '排除上个月'), false);
  assert.equal(data.meals.some(row => row.meta.includes('已安排')), true);
  assert.equal(data.meals.some(row => row.meta.includes('15:30')), true);
});

test('private notes, mood, joy and diary are absent until individually enabled', () => {
  const state = fixture(), defaultData = prepareJournalShare(state, { date: '2026-10-13' });
  assert.doesNotMatch(JSON.stringify(defaultData), /私密|仅本人|8000|calories|distance/);
  const diary = prepareJournalShare(state, { date: '2026-10-13', diary: true, mood: false, joy: false });
  assert.equal(diary.lifeRows.length, 1); assert.equal(diary.lifeRows[0].title, '小故事');
  const mood = prepareJournalShare(state, { date: '2026-10-13', mood: true });
  assert.deepEqual(mood.lifeRows.map(row => row.title), ['心情']);
  const notes = prepareJournalShare(state, { date: '2026-10-13', kind: 'exercise', notes: true });
  assert.equal(notes.exercises[0].note, '私密运动备注');
  assert.doesNotMatch(JSON.stringify(notes), /私密餐食备注/);
});

test('existing meal slot visibility flags keep independent control', () => {
  const data = prepareJournalShare(fixture(), { date: '2026-10-13', kind: 'meal', breakfast: false, snacks: false });
  assert.deepEqual(data.meals.map(row => row.title), ['蘑菇面']);
});

test('stickers inherit date IDs but explicit sharing array never changes saved stickers', () => {
  const state = fixture(), before = JSON.stringify(state);
  assert.deepEqual(prepareJournalShare(state, { date: '2026-10-13' }).stickerIds, ['milk', 'heart', 'book']);
  assert.deepEqual(prepareJournalShare(state, { date: '2026-10-13', stickerIds: [] }).stickerIds, []);
  assert.deepEqual(prepareJournalShare(state, { date: '2026-10-13', stickerIds: ['shoe', 'shoe', 'unknown', 'star', 'bow', 'milk'] }).stickerIds, ['shoe', 'star', 'bow']);
  assert.equal(JSON.stringify(state), before);
});

test('cancelled and unknown activity fields do not enter sharing records', () => {
  const data = prepareJournalShare(fixture(), { kind: 'exercise', scope: 'range', start: '2026-10-01', end: '2026-10-31' });
  assert.deepEqual(data.exercises.map(row => row.title), ['散步']);
  assert.doesNotMatch(data.exercises[0].meta, /分钟/);
  assert.doesNotMatch(JSON.stringify(data), /徒步|步数|距离|热量|calories|steps/);
});

test('one-click check-in without details renders only a checked record', () => {
  const data = prepareJournalShare({ dayRecords: [{ date: '2026-10-13', study: { checked: true, items: [] } }] }, { date: '2026-10-13', kind: 'study' });
  assert.equal(data.hasRecords, true); assert.equal(data.studies[0].title, '学习已打卡');
  assert.equal(data.studies[0].minutesKnown, false); assert.doesNotMatch(data.studies[0].meta, /分钟/);
});

test('known zero and unknown minutes remain distinguishable', () => {
  const data = prepareJournalShare({ dayRecords: [{ date: '2026-10-13', study: { checked: true, items: [{ content: '书', minutes: 0 }, { content: '画画', minutes: null }] } }] }, { date: '2026-10-13', kind: 'study' });
  assert.match(data.studies[0].meta, /0 分钟/); assert.equal(data.studies[0].minutesKnown, true);
  assert.doesNotMatch(data.studies[1].meta, /分钟/); assert.equal(data.studies[1].minutesKnown, false);
});

test('empty share type stays empty, no filler data and no empty image generation', async () => {
  const state = { meals: [{ date: '2026-10-13', slot: 'lunch', name: '米饭' }] };
  assert.equal(prepareJournalShare(state, { date: '2026-10-13', kind: 'exercise' }).hasRecords, false);
  await assert.rejects(generateJournalShareCard(state, { date: '2026-10-13', kind: 'exercise' }), /没有可分享/);
});

test('local month bounds handle leap years, small years and maximum year', () => {
  assert.deepEqual(journalShareBounds({ scope: 'month', month: '2024-02' }), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(journalShareBounds({ scope: 'month', month: '0001-02' }), { start: '0001-02-01', end: '0001-02-28' });
  assert.deepEqual(journalShareBounds({ scope: 'month', month: '9999-12' }), { start: '9999-12-01', end: '9999-12-31' });
  for (const options of [{ date: '0000-01-01' }, { date: '2026-02-29' }, { scope: 'month', month: '2026-13' }, { scope: 'range', start: '2026-10-14', end: '2026-10-13' }]) assert.throws(() => journalShareBounds(options), /有效/);
});

test('cross-year ranges label each recorded date with its year', () => {
  const data = prepareJournalShare({ meals: [{ date: '2025-12-31', slot: 'dinner', name: '年末饭' }, { date: '2026-01-01', slot: 'lunch', name: '年初饭' }] }, { scope: 'range', start: '2025-12-31', end: '2026-01-01' });
  assert.match(data.meals[0].meta, /2025年/); assert.match(data.meals[1].meta, /2026年/);
});

test('unsupported settings choose an available template without mutating options', () => {
  const options = { kind: 'study', template: 'meal-cafe', format: 'nonsense', scope: 'nonsense' };
  const result = normalizeJournalShareOptions(options);
  assert.equal(result.template, 'study-notebook'); assert.equal(result.format, 'portrait'); assert.equal(result.scope, 'day');
  assert.equal(options.template, 'meal-cafe');
});
