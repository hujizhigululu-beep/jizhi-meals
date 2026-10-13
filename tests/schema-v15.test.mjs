import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA, freshState, normalize, putMeal, completeMeal, undoComplete } from '../model.js';
import { defaultActivityCategories, MEAL_SCENES } from '../schema-extra.js';
import { STORAGE_KEY, MIGRATION_BACKUP_KEY, V13_BACKUP_KEY, V14_BACKUP_KEY, V15_BACKUP_KEY, load, persist } from '../storage.js';

class MemoryStorage {
  constructor(raw = null) { this.data = new Map(raw === null ? [] : [[STORAGE_KEY, raw]]); this.writes = []; this.failKey = null; }
  getItem(key) { return this.data.get(key) ?? null; }
  setItem(key, value) { if (key === this.failKey) throw new Error('quota'); this.writes.push(key); this.data.set(key, value); }
}
function newState() {
  const state = freshState();
  state.inventory.push({ id: 'beef', name: '牛肉丸', category: '蛋白质', quantity: 3.5, unit: '份', perMeal: 0.5, note: '', expires: '' });
  state.mealTemplates.push({ id: 'lunch-template', name: '常吃的丸子便当', scene: '自制便当', mealName: '丸子便当', note: '多加蔬菜', resources: [{ ingredientId: 'beef', name: '牛肉丸', amount: 0.5, unit: '份' }, { ingredientId: 'deleted-veg', name: '旧青菜', amount: 1, unit: '份' }] });
  state.activityCategories.study.push({ id: 'study-archived', name: '旧学习项', active: false });
  state.dayRecords.push({ date: '2026-10-13', study: { checked: true, manualChecked: false, categoryIds: ['study-japanese', 'study-archived'], items: [{ id: 'study-entry', content: '温习五十音', minutes: 20, note: '慢慢学', categoryId: 'study-archived', categoryName: '旧学习项' }] }, exercise: { checked: true, manualChecked: true, categoryIds: [], items: [{ id: 'exercise-entry', content: '散步', minutes: null, note: '', categoryId: 'exercise-hiking', categoryName: '徒步', distanceKm: 1.234 }] }, stickerIds: ['milk', 'book'] });
  state.recentStickerIds = ['book', 'milk'];
  return state;
}
function legacyState(version) {
  const state = newState();
  state.schemaVersion = version;
  delete state.mealTemplates; delete state.activityCategories; delete state.recentStickerIds;
  if (version < 3) delete state.dayRecords;
  else state.dayRecords = [{ date: '2026-10-13', study: { checked: true, items: [{ id: 'old-study', content: '画线条', minutes: null, note: '旧笔记' }] }, exercise: { checked: false, items: [{ id: 'old-exercise', content: '散步', minutes: 10, note: '' }] }, stickerIds: ['milk'] }];
  state.meals = [{ id: 'old-lunch', date: '2026-10-13', slot: 'lunch', name: '丸子便当', type: '自制便当', protein: '', note: '已有记录', completed: true, completedAt: '2026-10-13T12:00:00.000Z', photoId: 'photo-safe-reference', ...(version === 1 ? { resource: { ingredientId: 'beef', name: '牛肉丸', unit: '份', amount: 0.5 } } : { resources: [{ ingredientId: 'beef', name: '牛肉丸', unit: '份', amount: 0.5 }] }) }];
  if (version === 1) delete state.diaries;
  return state;
}

test('新默认类别有固定 ID、顺序和独立副本，面包卡为独立场景', () => {
  assert.equal(SCHEMA, 4);
  const first = defaultActivityCategories(), second = defaultActivityCategories();
  assert.deepEqual(first.study.map(row => [row.id, row.name]), [['study-japanese', '日语'], ['study-drawing', '画画'], ['study-3d', '3D建模']]);
  assert.deepEqual(first.exercise.map(row => row.id), ['exercise-strength', 'exercise-hiking', 'exercise-cardio']);
  first.study[0].name = '不会污染默认项'; first.exercise.pop();
  assert.equal(second.study[0].name, '日语'); assert.equal(second.exercise.length, 3);
  assert.ok(MEAL_SCENES.includes('面包卡消耗')); assert.ok(!MEAL_SCENES.includes('早餐'));
});

test('schema4 JSON往返保留缺货模板、停用类别、名称快照、可选距离与最近贴纸', () => {
  const state = newState(), result = normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(result.locked, false);
  assert.deepEqual(result.state, state);
  const storage = new MemoryStorage();
  persist(storage, state);
  const restored = load(storage);
  assert.equal(restored.locked, false);
  assert.deepEqual(restored.state.mealTemplates, state.mealTemplates);
  assert.deepEqual(restored.state.dayRecords, state.dayRecords);
  assert.deepEqual(restored.state.activityCategories, state.activityCategories);
  assert.deepEqual(restored.state.recentStickerIds, state.recentStickerIds);
});

test('schema1/2/3只在内存兼容迁移且反复归一化不扣库存、不丢照片引用', () => {
  for (const version of [1, 2, 3]) {
    const raw = JSON.stringify(legacyState(version), null, 2), storage = new MemoryStorage(raw);
    const result = load(storage);
    assert.equal(result.locked, false, result.warnings.join(';'));
    assert.equal(result.state.inventory[0].quantity, 3.5);
    assert.equal(result.state.meals[0].photoId, 'photo-safe-reference');
    assert.equal(storage.getItem(STORAGE_KEY), raw); assert.deepEqual(storage.writes, []);
    const again = normalize(result.state);
    assert.equal(again.locked, false); assert.deepEqual(again.state, result.state);
    assert.equal(again.state.inventory[0].quantity, 3.5);
    if (version === 3) {
      const day = result.state.dayRecords[0];
      assert.equal(day.study.manualChecked, true); assert.deepEqual(day.study.categoryIds, []);
      assert.equal(day.exercise.manualChecked, false); assert.equal(day.exercise.items[0].minutes, 10);
      assert.ok(!Object.hasOwn(day.exercise.items[0], 'distanceKm'));
    }
  }
});

test('新字段不干扰实际扣减、重复已吃与撤销，模板快照本身不预留库存', () => {
  const state = newState(), before = structuredClone(state.mealTemplates);
  putMeal(state, { id: 'new-meal', date: '2026-10-14', slot: 'lunch', name: '午餐', type: '面包卡消耗', resources: [{ ingredientId: 'beef', amount: 0.5 }] });
  assert.equal(state.inventory[0].quantity, 3.5);
  assert.equal(completeMeal(state, 'new-meal'), true); assert.equal(completeMeal(state, 'new-meal'), false);
  assert.equal(state.inventory[0].quantity, 3);
  assert.equal(undoComplete(state, 'new-meal'), true); assert.equal(undoComplete(state, 'new-meal'), false);
  assert.equal(state.inventory[0].quantity, 3.5); assert.deepEqual(state.mealTemplates, before);
});

test('重命名及停用保持历史类别归属，删除被引用类别会保护数据', () => {
  const state = newState();
  const category = state.activityCategories.study.find(row => row.id === 'study-archived');
  category.name = '更改后的名字'; category.active = false;
  const result = normalize(state);
  assert.equal(result.locked, false);
  assert.equal(result.state.dayRecords[0].study.items[0].categoryName, '旧学习项');
  state.activityCategories.study = state.activityCategories.study.filter(row => row.id !== category.id);
  assert.equal(normalize(state).locked, true);
});

test('未知或损坏新字段拒绝覆盖原JSON，未知模板食材仅保留快照', () => {
  const mutations = [
    s => { s.mealTemplates[0].secret = '不可丢弃'; },
    s => { s.mealTemplates[0].resources.push({ ...s.mealTemplates[0].resources[0] }); },
    s => { s.mealTemplates[0].resources[0].amount = 0; },
    s => { s.mealTemplates[0].name = '超'.repeat(61); },
    s => { s.mealTemplates[0].scene = '未来场景'; },
    s => { s.activityCategories.study[0].active = 'true'; },
    s => { s.activityCategories.study.push({ ...s.activityCategories.study[0] }); },
    s => { s.activityCategories.exercise[0].unknown = '归档原文'; },
    s => { s.dayRecords[0].study.categoryIds.push('study-japanese'); },
    s => { s.dayRecords[0].study.categoryIds = ['unknown-id']; },
    s => { s.dayRecords[0].study.categoryIds = []; },
    s => { s.dayRecords[0].exercise.checked = false; },
    s => { delete s.dayRecords[0].exercise.manualChecked; },
    s => { s.dayRecords[0].study.items[0].distanceKm = 3; },
    s => { s.dayRecords[0].exercise.items[0].categoryId = 'study-japanese'; },
    s => { s.recentStickerIds = ['milk', 'milk']; },
    s => { s.recentStickerIds.push('future-sticker'); },
    s => { delete s.mealTemplates; },
    s => { delete s.activityCategories; },
    s => { delete s.recentStickerIds; },
    s => { delete s.dayRecords; },
  ];
  for (const mutate of mutations) {
    const state = newState(); mutate(state);
    const raw = JSON.stringify(state), storage = new MemoryStorage(raw), result = load(storage);
    assert.equal(result.locked, true); assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.throws(() => persist(storage, result.state)); assert.deepEqual(storage.writes, []);
  }
});

test('运动距离只接受可选null或有限非负公里数，不默填0', () => {
  for (const distance of [-1, 100000.01, Infinity, NaN, '12', {}, false]) {
    const state = newState(); state.dayRecords[0].exercise.items[0].distanceKm = distance;
    assert.equal(normalize(state).locked, true, String(distance));
  }
  for (const distance of [null, 0, 1.2344, 100000]) {
    const state = newState(); state.dayRecords[0].exercise.items[0].distanceKm = distance;
    const result = normalize(state); assert.equal(result.locked, false);
    assert.equal(result.state.dayRecords[0].exercise.items[0].distanceKm, distance === 1.2344 ? 1.234 : distance);
  }
  const state = newState(); delete state.dayRecords[0].exercise.items[0].distanceKm;
  assert.ok(!Object.hasOwn(normalize(state).state.dayRecords[0].exercise.items[0], 'distanceKm'));
});

test('总开关暂停保留类别及详情，恢复后仍有原历史归属且不改变库存', () => {
  const state = newState(), study = state.dayRecords[0].study;
  const ids = [...study.categoryIds], details = structuredClone(study.items), stock = state.inventory[0].quantity;
  study.checked = false; study.manualChecked = false;
  const paused = normalize(state);
  assert.equal(paused.locked, false);
  assert.equal(paused.state.dayRecords[0].study.checked, false);
  assert.deepEqual(paused.state.dayRecords[0].study.categoryIds, ids);
  assert.deepEqual(paused.state.dayRecords[0].study.items, details);
  paused.state.dayRecords[0].study.checked = true; paused.state.dayRecords[0].study.manualChecked = true;
  const restored = normalize(paused.state);
  assert.equal(restored.locked, false);
  assert.equal(restored.state.dayRecords[0].study.checked, true);
  assert.deepEqual(restored.state.dayRecords[0].study.categoryIds, ids);
  assert.deepEqual(restored.state.dayRecords[0].study.items, details);
  assert.equal(restored.state.inventory[0].quantity, stock);
});

test('V1.5升级备份保存完整旧原文且只写一次，保留原所有升级备份', () => {
  for (const version of [1, 2, 3]) {
    const raw = JSON.stringify(legacyState(version), null, 2), storage = new MemoryStorage(raw);
    for (const key of [MIGRATION_BACKUP_KEY, V13_BACKUP_KEY, V14_BACKUP_KEY]) storage.data.set(key, `原有备份 ${key}`);
    persist(storage, load(storage).state);
    assert.equal(storage.getItem(V15_BACKUP_KEY), raw); assert.equal(storage.writes[0], V15_BACKUP_KEY);
    assert.equal(JSON.parse(storage.getItem(STORAGE_KEY)).schemaVersion, 4);
    persist(storage, load(storage).state);
    assert.equal(storage.writes.filter(key => key === V15_BACKUP_KEY).length, 1);
    for (const key of [MIGRATION_BACKUP_KEY, V13_BACKUP_KEY, V14_BACKUP_KEY]) assert.equal(storage.getItem(key), `原有备份 ${key}`);
  }
});

test('升级备份写入失败阻止正式写入，原状态与JSON保留；重试可继续', () => {
  for (const version of [1, 2, 3]) {
    const raw = JSON.stringify(legacyState(version)), storage = new MemoryStorage(raw), state = load(storage).state;
    const before = structuredClone(state); storage.failKey = V15_BACKUP_KEY;
    assert.throws(() => persist(storage, state), /V1\.5/);
    assert.equal(storage.getItem(STORAGE_KEY), raw); assert.deepEqual(state, before); assert.deepEqual(storage.writes, []);
    storage.failKey = null; persist(storage, state);
    assert.equal(storage.getItem(V15_BACKUP_KEY), raw); assert.equal(load(storage).state.inventory[0].quantity, 3.5);
  }
});

test('再次导入另一份旧版本时不会覆盖先前V1.5升级备份', () => {
  const original = JSON.stringify(legacyState(3), null, 2), incoming = legacyState(2);
  incoming.diaries.push({ date: '2026-10-12', mood: '开心', text: '另一份旧备份的故事', joy: '' });
  const raw = JSON.stringify(incoming), storage = new MemoryStorage(raw);
  storage.data.set(V15_BACKUP_KEY, original);
  persist(storage, load(storage).state);
  assert.equal(storage.getItem(V15_BACKUP_KEY), original);
  assert.equal(storage.writes.includes(V15_BACKUP_KEY), false);
  assert.equal(load(storage).state.diaries[0].text, '另一份旧备份的故事');
});

test('未来schema和缺失schema3日常记录保持只读原文，不能被新鲜状态覆盖', () => {
  const missing = legacyState(3); delete missing.dayRecords;
  for (const state of [{ ...freshState(), schemaVersion: 5 }, missing]) {
    const raw = JSON.stringify(state), storage = new MemoryStorage(raw), result = load(storage);
    assert.equal(result.locked, true); assert.equal(result.raw, raw);
    assert.throws(() => persist(storage, freshState()));
    assert.equal(storage.getItem(STORAGE_KEY), raw); assert.deepEqual(storage.writes, []);
  }
});
