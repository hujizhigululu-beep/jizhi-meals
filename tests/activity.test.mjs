import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalize, putMeal, putDiary, completeMeal, undoComplete } from '../model.js';
import { getDayRecord, toggleCheckin, putActivity, removeActivity, setDayStickers, monthStats } from '../activity.js';
import { STICKERS, STICKER_IDS, getSticker, stickerPath } from '../stickers.js';
import { STORAGE_KEY, V14_BACKUP_KEY, persist, load } from '../storage.js';

const DAY = '2026-10-13';
const clone = value => structuredClone(value);
class MemoryStorage {
  constructor(raw = null) { this.entries = new Map(raw == null ? [] : [[STORAGE_KEY, raw]]); this.writes = []; this.failKey = null; }
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { if (this.failKey === key) throw Error('quota'); this.entries.set(key, value); this.writes.push(key); }
}
function pantry() {
  const state = freshState();
  state.inventory.push({ id: 'rice', name: '米饭', quantity: 7, perMeal: 1, unit: '份', note: '', expires: '', category: '碳水', photoId: 'legacy_photo', image: 'legacy-reference' });
  putMeal(state, { id: 'meal', date: DAY, slot: 'lunch', name: '便当', type: '自制便当', resources: [{ ingredientId: 'rice', amount: 1 }] });
  putDiary(state, { date: DAY, mood: '自在', text: '真实日记\n第二行', joy: '小花' });
  return state;
}
function unchangedOnError(state, callback) { const before = clone(state); assert.throws(callback); assert.deepEqual(state, before); }

test('空状态与查看历史日期不写演示或创建空记录，返回对象独立', () => {
  const state = freshState(), before = clone(state);
  const view = getDayRecord(state, '2020-02-29');
  view.study.checked = true; view.stickerIds.push('milk');
  assert.deepEqual(state, before);
  assert.deepEqual(getDayRecord(state, DAY), { date: DAY, study: { checked: false, items: [] }, exercise: { checked: false, items: [] }, stickerIds: [] });
  assert.equal(monthStats(state, '2026-10').mealDays, 0);
  unchangedOnError(state, () => getDayRecord(state, '2026-02-29'));
});

test('一键打卡无需详情；学习运动独立；同日多活动仅计一天与时长分别累计', () => {
  const state = pantry();
  assert.equal(toggleCheckin(state, DAY, 'study'), true);
  assert.equal(toggleCheckin(state, DAY, 'exercise'), true);
  putActivity(state, DAY, 'study', { id: 'jp', content: '日语', minutes: 60, note: '' });
  putActivity(state, DAY, 'study', { id: 'draw', content: '画画', minutes: 30, note: '练线条' });
  putActivity(state, DAY, 'exercise', { id: 'walk', content: '散步', minutes: null, note: '' });
  toggleCheckin(state, '2026-10-01', 'exercise');
  putActivity(state, '2026-10-01', 'exercise', { id: 'strength', minutes: 25 });
  toggleCheckin(state, '2026-09-30', 'study');
  putActivity(state, '2026-09-30', 'study', { minutes: 10 });
  assert.deepEqual(monthStats(state, '2026-10'), { month: '2026-10', mealDays: 1, studyDays: 1, exerciseDays: 2, studyMinutes: 90, exerciseMinutes: 25 });
  assert.equal(monthStats(state, '2026-09').studyMinutes, 10);
  assert.equal(monthStats(state, '2026-09').studyDays, 1);
});

test('取消保留可再启用的详情；编辑删除详情不暗自改打卡；最后空行不留下记录', () => {
  const state = freshState();
  putActivity(state, DAY, 'study', { id: 'reading', content: '读书', minutes: 0 });
  assert.equal(getDayRecord(state, DAY).study.checked, false);
  assert.equal(monthStats(state, '2026-10').studyDays, 0);
  toggleCheckin(state, DAY, 'study');
  putActivity(state, DAY, 'study', { id: 'reading', content: '更新读书', minutes: 20, note: '过去也能改' });
  assert.equal(getDayRecord(state, DAY).study.items.length, 1);
  assert.equal(toggleCheckin(state, DAY, 'study'), false);
  assert.equal(getDayRecord(state, DAY).study.items[0].minutes, 20);
  assert.equal(monthStats(state, '2026-10').studyMinutes, 0);
  assert.equal(toggleCheckin(state, DAY, 'study'), true);
  assert.equal(monthStats(state, '2026-10').studyMinutes, 20);
  assert.equal(removeActivity(state, DAY, 'study', 'reading'), true);
  assert.equal(removeActivity(state, DAY, 'study', 'missing'), false);
  assert.equal(getDayRecord(state, DAY).study.checked, true);
  toggleCheckin(state, DAY, 'study');
  assert.deepEqual(state.dayRecords, []);
});

test('分钟仅接受0..1440整数或明确留空，日期与类型错误均原子拒绝', () => {
  const state = pantry();
  for (const minutes of [-1, 1441, 1.5, NaN, Infinity, '60']) unchangedOnError(state, () => putActivity(state, DAY, 'study', { minutes }));
  for (const minutes of [0, 1440, null, '']) putActivity(state, DAY, 'study', { minutes });
  assert.deepEqual(getDayRecord(state, DAY).study.items.map(item => item.minutes), [0, 1440, null, null]);
  unchangedOnError(state, () => putActivity(state, DAY, 'study', { content: 'a'.repeat(201) }));
  unchangedOnError(state, () => putActivity(state, DAY, 'study', { note: 'a'.repeat(1001) }));
  unchangedOnError(state, () => toggleCheckin(state, '2026-02-29', 'exercise'));
  unchangedOnError(state, () => toggleCheckin(state, DAY, 'meal'));
  assert.throws(() => monthStats(state, '0000-01'));
  assert.throws(() => monthStats(state, '2026-13'));
});

test('贴纸只存最多3个白名单ID；安全资源映射拒绝路径与未知ID', () => {
  const state = pantry(), meals = clone(state.meals), inventory = clone(state.inventory), diaries = clone(state.diaries);
  setDayStickers(state, DAY, ['milk', 'book', 'bow']);
  assert.deepEqual(getDayRecord(state, DAY).stickerIds, ['milk', 'book', 'bow']);
  for (const ids of [['milk', 'milk'], ['milk', 'book', 'bow', 'heart'], ['new-sticker'], ['../milk.svg'], null]) unchangedOnError(state, () => setDayStickers(state, DAY, ids));
  assert.equal(STICKERS.length, 8); assert.equal(new Set(STICKER_IDS).size, 8);
  assert.equal(stickerPath('book'), './assets/stickers/book.svg');
  assert.equal(getSticker('javascript:alert(1)'), null);
  assert.equal(stickerPath('../milk.svg'), null);
  assert.deepEqual(state.inventory, inventory); assert.deepEqual(state.meals, meals); assert.deepEqual(state.diaries, diaries);
  setDayStickers(state, DAY, []); assert.deepEqual(state.dayRecords, []);
});

test('新JSON往返保留库存图片、餐食关联、日记、取消打卡详情和贴纸ID，不重扣库存', () => {
  const state = pantry(); completeMeal(state, 'meal');
  toggleCheckin(state, DAY, 'exercise');
  putActivity(state, DAY, 'exercise', { id: 'walk', content: '徒步 ♡', minutes: 60, note: '路边的小花\n开心' });
  toggleCheckin(state, DAY, 'exercise');
  setDayStickers(state, DAY, ['strawberry', 'shoe']);
  const storage = new MemoryStorage();
  const saved = persist(storage, state), restored = load(storage);
  assert.equal(restored.locked, false); assert.deepEqual(restored.state, saved);
  assert.deepEqual(normalize(JSON.parse(JSON.stringify(saved))).state, saved);
  assert.equal(restored.state.inventory[0].quantity, 6);
  assert.equal(restored.state.inventory[0].photoId, 'legacy_photo');
  assert.equal(restored.state.dayRecords[0].exercise.items[0].minutes, 60);
  assert.equal(restored.state.dayRecords[0].exercise.checked, false);
  assert.equal(JSON.stringify(saved.dayRecords).includes('<svg'), false);
  const records = clone(restored.state.dayRecords);
  undoComplete(restored.state, 'meal'); assert.equal(restored.state.inventory[0].quantity, 7);
  assert.deepEqual(restored.state.dayRecords, records);
});

test('schema1/2迁移添加空dayRecords且保持旧JSON与库存原文；schema3缺少列表保护', () => {
  for (const schemaVersion of [1, 2]) {
    const legacy = pantry(); legacy.schemaVersion = schemaVersion; delete legacy.dayRecords;
    const before = clone(legacy), result = normalize(legacy);
    assert.equal(result.locked, false); assert.equal(result.state.schemaVersion, 3);
    assert.deepEqual(result.state.dayRecords, []); assert.deepEqual(result.state.inventory, legacy.inventory);
    assert.deepEqual(legacy, before);
  }
  const broken = freshState(); delete broken.dayRecords;
  assert.equal(normalize(broken).locked, true);
});

test('日常记录未知字段、损坏、重复与新贴纸保护完整原文，任何业务修改或persist均拒绝', () => {
  const good = pantry(); toggleCheckin(good, DAY, 'study');
  putActivity(good, DAY, 'study', { id: 'jp', content: '日语', minutes: null }); setDayStickers(good, DAY, ['milk']);
  const damages = [
    state => { state.futureRecords = []; },
    state => { state.meals[0].futureHistory = '应该保留'; },
    state => { state.meals[0].resources[0].futureSnapshot = '旧关联'; },
    state => { state.diaries[0].futureText = '新版本内容'; },
    state => { state.dayRecords = null; },
    state => { state.dayRecords.push(clone(state.dayRecords[0])); },
    state => { state.dayRecords[0].futureFlag = true; },
    state => { state.dayRecords[0].stickerIds.push('new-sticker'); },
    state => { state.dayRecords[0].stickerIds.push('milk'); },
    state => { state.dayRecords[0].study.checked = 'true'; },
    state => { state.dayRecords[0].study.items.push(clone(state.dayRecords[0].study.items[0])); },
    state => { state.dayRecords[0].study.items[0].minutes = 1.5; },
    state => { state.dayRecords[0].study.items[0].steps = 999; },
    state => { state.dayRecords[0].study.items[0].content = 'a'.repeat(201); },
  ];
  for (const damage of damages) {
    const broken = clone(good); damage(broken); const before = clone(broken), raw = JSON.stringify(broken), storage = new MemoryStorage(raw);
    const loaded = load(storage); assert.equal(loaded.locked, true); assert.equal(loaded.raw, raw);
    assert.deepEqual(broken, before); assert.deepEqual(storage.writes, []);
    unchangedOnError(loaded.state, () => toggleCheckin(loaded.state, DAY, 'exercise'));
    unchangedOnError(loaded.state, () => completeMeal(loaded.state, 'meal'));
    assert.throws(() => persist(storage, loaded.state));
    assert.equal(storage.getItem(STORAGE_KEY), raw); assert.deepEqual(storage.writes, []);
  }
});

test('V1.4首次写入前备份schema2完整原文，备份失败不覆盖，重试不覆盖历史备份', () => {
  const legacy = pantry(); legacy.schemaVersion = 2; legacy.inventoryVersion = 1; delete legacy.dayRecords;
  const raw = JSON.stringify(legacy, null, 2), storage = new MemoryStorage(raw), loaded = load(storage);
  assert.equal(loaded.locked, false); assert.deepEqual(storage.writes, []);
  const state = loaded.state; toggleCheckin(state, DAY, 'study');
  const before = clone(state); storage.failKey = V14_BACKUP_KEY;
  assert.throws(() => persist(storage, state), /V1.4/); assert.deepEqual(state, before);
  assert.equal(storage.getItem(STORAGE_KEY), raw); assert.deepEqual(storage.writes, []);
  storage.failKey = null; const saved = persist(storage, state);
  assert.deepEqual(storage.writes, [V14_BACKUP_KEY, STORAGE_KEY]);
  assert.equal(storage.getItem(V14_BACKUP_KEY), raw); assert.equal(saved.dayRecords[0].study.checked, true);
  persist(storage, load(storage).state);
  assert.equal(storage.writes.filter(key => key === V14_BACKUP_KEY).length, 1);
  assert.equal(storage.getItem(V14_BACKUP_KEY), raw);
});

test('V1.4正式写入失败保留旧数据且备份可恢复；未来schema与明确异常原文默认不写', () => {
  const old = freshState(); old.schemaVersion = 2; old.inventoryVersion = 1; delete old.dayRecords;
  const raw = JSON.stringify(old), storage = new MemoryStorage(raw), state = load(storage).state;
  toggleCheckin(state, DAY, 'exercise'); storage.failKey = STORAGE_KEY;
  assert.throws(() => persist(storage, state));
  assert.equal(storage.getItem(STORAGE_KEY), raw); assert.equal(storage.getItem(V14_BACKUP_KEY), raw);
  const futureRaw = JSON.stringify({ ...freshState(), schemaVersion: 4 }), future = new MemoryStorage(futureRaw);
  assert.equal(load(future).locked, true); assert.throws(() => persist(future, freshState()));
  assert.equal(future.getItem(STORAGE_KEY), futureRaw); assert.deepEqual(future.writes, []);
});
