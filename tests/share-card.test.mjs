import test from 'node:test';
import assert from 'node:assert/strict';
import { generateShareCard, graphemes, prepareShareCardContent, shareImageFile, wrapCanvasText } from '../share-card.js';

const stateFor = () => ({
  schemaVersion: 2,
  meals: [
    { id: 'a', date: '2026-10-12', slot: 'breakfast', name: '草莓吐司', note: 'PRIVATE_MEAL_NOTE', completed: true },
    { id: 'b', date: '2026-10-12', slot: 'snack', name: '草莓牛奶', time: '15:30', completed: true },
    { id: 'c', date: '2026-10-12', slot: 'snack', name: '小蛋糕', completed: false },
    { id: 'other', date: '2026-10-11', slot: 'lunch', name: 'OTHER_DAY_SECRET' },
  ],
  diaries: [{ date: '2026-10-12', mood: 'PRIVATE_MOOD', text: 'PRIVATE_DIARY', joy: 'PRIVATE_JOY' }],
});

test('default card content excludes private diary, mood, joy and meal notes completely', () => {
  const state = stateFor();
  const before = structuredClone(state);
  const content = prepareShareCardContent(state, '2026-10-12');
  assert.equal(content.weekday, '星期一');
  const serialized = JSON.stringify(content);
  for (const secret of ['PRIVATE_MOOD', 'PRIVATE_DIARY', 'PRIVATE_JOY', 'PRIVATE_MEAL_NOTE', 'OTHER_DAY_SECRET']) assert.ok(!serialized.includes(secret));
  assert.deepEqual(content.sections.find(section => section.slot === 'snack').meals.map(row => row.name), ['草莓牛奶', '小蛋糕']);
  assert.deepEqual(state, before);
});

test('each privacy field requires an explicit selection and excluded meal slots disappear', () => {
  const state = stateFor();
  const content = prepareShareCardContent(state, '2026-10-12', { breakfast: false, lunch: false, dinner: false, snacks: true, mood: true, diary: false, joy: true });
  assert.deepEqual(content.sections.map(section => section.slot), ['snack']);
  assert.equal(content.mood, 'PRIVATE_MOOD');
  assert.equal(content.joy, 'PRIVATE_JOY');
  assert.equal(content.diary, '');
  assert.ok(!JSON.stringify(content).includes('PRIVATE_DIARY'));
  const chosenDiary = prepareShareCardContent(state, '2026-10-12', { diary: true });
  assert.equal(chosenDiary.diary, 'PRIVATE_DIARY');
  assert.equal(chosenDiary.mood, '');
  assert.equal(chosenDiary.joy, '');
});

test('long diary excerpts state that they are excerpts and never split composed emoji', () => {
  const state = stateFor();
  state.diaries[0].text = '👩🏽‍🍳'.repeat(5000);
  const content = prepareShareCardContent(state, '2026-10-12', { diary: true });
  assert.equal(content.diary, '👩🏽‍🍳'.repeat(320) + '…（日记摘录）');
  assert.deepEqual(graphemes('👩🏽‍🍳🇨🇳e\u0301❤️'), ['👩🏽‍🍳', '🇨🇳', 'e\u0301', '❤️']);
});

test('wrapping retains all text and newlines without breaking Unicode graphemes', () => {
  const context = { measureText: text => ({ width: graphemes(text).length * 10 }) };
  const text = '好好吃饭👩🏽‍🍳🇨🇳e\u0301草莓牛奶❤️';
  const lines = wrapCanvasText(context, text, 30);
  assert.equal(lines.join(''), text);
  assert.ok(lines.every(line => graphemes(line).length <= 3));
  assert.deepEqual(wrapCanvasText(context, '一\n\n二', 30), ['一', '', '二']);
  assert.deepEqual(wrapCanvasText(context, '👩🏽‍🍳', 1), ['👩🏽‍🍳']);
});

test('all selected snack records survive content preparation with no fixed record cap', () => {
  const state = stateFor();
  state.meals = Array.from({ length: 250 }, (_, index) => ({ date: '2026-10-12', slot: 'snack', name: `甜甜的小点心 ${index}` }));
  const content = prepareShareCardContent(state, '2026-10-12');
  assert.equal(content.sections.find(section => section.slot === 'snack').meals.length, 250);
  assert.equal(content.sections.find(section => section.slot === 'snack').meals.at(-1).name, '甜甜的小点心 249');
});

test('oversized cards fail clearly instead of silently dropping meals', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'document');
  const state = stateFor();
  state.meals = Array.from({ length: 120 }, (_, index) => ({ date: '2026-10-12', slot: 'snack', name: '草莓'.repeat(40) + index }));
  const context = { measureText: text => ({ width: graphemes(text).length * 20 }) };
  Object.defineProperty(globalThis, 'document', { configurable: true, value: { fonts: { ready: Promise.resolve() }, createElement: () => ({ getContext: () => context, toBlob: () => assert.fail('Oversized cards must not export a truncated PNG') }) } });
  try { await assert.rejects(generateShareCard(state, '2026-10-12'), /餐食没有被截掉/); }
  finally { if (descriptor) Object.defineProperty(globalThis, 'document', descriptor); else delete globalThis.document; }
});

test('native file share checks support and treats cancellation as a normal outcome', async () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
  const blob = new Blob(['PNG'], { type: 'image/png' });
  const calls = [];
  Object.defineProperty(globalThis, 'navigator', { configurable: true, value: {
    canShare: payload => { calls.push(['support', payload]); return true; },
    share: async payload => { calls.push(['share', payload]); },
  } });
  try {
    assert.equal(await shareImageFile(blob, '生活.png'), 'shared');
    assert.equal(calls[0][1].files[0].name, '生活.png');
    assert.equal(calls[1][1].files[0].type, 'image/png');
    navigator.share = async () => { throw Object.assign(new Error('Cancelled'), { name: 'AbortError' }); };
    assert.equal(await shareImageFile(blob, '生活.png'), 'cancelled');
    navigator.canShare = () => false;
    navigator.share = async () => assert.fail('Unsupported files must not call the share sheet');
    assert.equal(await shareImageFile(blob, '生活.png'), 'unsupported');
  } finally { if (descriptor) Object.defineProperty(globalThis, 'navigator', descriptor); else delete globalThis.navigator; }
});

test('invalid dates are rejected before reading private content', () => {
  assert.throws(() => prepareShareCardContent(stateFor(), '2026-02-30'), /有效日期/);
});
