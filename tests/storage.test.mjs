import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import * as storageApi from '../storage.js';
import * as model from '../model.js';

class MemoryStorage {
  constructor(entries = []) {
    this.entries = new Map(entries);
    this.writes = [];
    this.failKey = null;
  }
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) {
    if (key === this.failKey) throw new Error('存储空间不足');
    this.writes.push({ key, value });
    this.entries.set(key, value);
  }
}
function legacyBackup() {
  return JSON.stringify({
    schemaVersion: 1,
    inventory: [{ id: 'rice', name: '米饭', quantity: 3, perMeal: 1, unit: '份', note: '', expires: '' }],
    meals: [{ id: 'meal', date: '2026-10-11', slot: 'lunch', name: '饭团', type: '自制便当', protein: '', note: '旧版记录', resource: { ingredientId: 'rice', name: '米饭', unit: '份', amount: 1 }, completed: true, completedAt: '2026-10-11T12:00:00.000Z' }],
    updatedAt: '2026-10-11T12:00:00.000Z',
  }, null, 2);
}
const withLegacy = raw => new MemoryStorage([[storageApi.STORAGE_KEY, raw ?? legacyBackup()]]);

describe('AI 测试版 localStorage key、只读加载与首次迁移保护', () => {
  test('使用 AI 测试版独立 key，空存储 load 不写入也不制造数据', () => {
    assert.equal(storageApi.STORAGE_KEY, 'jizhi-ai-test-book-v1');
    assert.ok(storageApi.MIGRATION_BACKUP_KEY);
    assert.notEqual(storageApi.MIGRATION_BACKUP_KEY, storageApi.STORAGE_KEY);
    const storage = new MemoryStorage();
    const loaded = storageApi.load(storage);
    assert.deepEqual(loaded.state, model.freshState());
    assert.deepEqual(loaded.warnings, []);
    assert.equal(loaded.raw, null);
    assert.equal(loaded.locked, false);
    assert.deepEqual(storage.writes, []);
  });

  test('读取旧记录在内存迁移，但原 JSON 一个字节都不修改', () => {
    const raw = legacyBackup();
    const storage = withLegacy(raw);
    const loaded = storageApi.load(storage);
    assert.equal(loaded.locked, false);
    assert.equal(loaded.state.schemaVersion, model.SCHEMA);
    assert.equal(loaded.raw, raw);
    assert.equal(loaded.state.inventory[0].quantity, 3);
    assert.equal(loaded.state.meals[0].completed, true);
    assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
    assert.equal(storage.getItem(storageApi.MIGRATION_BACKUP_KEY), null);
    assert.equal(storage.getItem(storageApi.V15_BACKUP_KEY), null);
    assert.deepEqual(storage.writes, []);
  });

  test('首次保存先独立备份完整旧 JSON，再写新 schema；后续保存不覆盖备份', () => {
    const raw = legacyBackup();
    const storage = withLegacy(raw);
    const state = storageApi.load(storage).state;
    const saved = storageApi.persist(storage, state);
    assert.equal(storage.writes.length, 4);
    assert.equal(storage.writes[0].key, storageApi.V15_BACKUP_KEY);
    assert.equal(storage.writes[0].value, raw);
    assert.equal(storage.writes[1].key, storageApi.V14_BACKUP_KEY);
    assert.equal(storage.writes[1].value, raw);
    assert.equal(storage.writes[2].key, storageApi.MIGRATION_BACKUP_KEY);
    assert.equal(storage.writes[2].value, raw);
    assert.equal(storage.writes[3].key, storageApi.STORAGE_KEY);
    assert.equal(JSON.parse(storage.writes[3].value).schemaVersion, model.SCHEMA);
    assert.equal(saved.inventory[0].quantity, 3);
    assert.ok(!Number.isNaN(Date.parse(saved.updatedAt)));
    assert.equal(storage.getItem(storageApi.MIGRATION_BACKUP_KEY), raw);
    const loaded = storageApi.load(storage);
    assert.equal(loaded.locked, false);
    assert.equal(loaded.state.inventory[0].quantity, 3);
    storageApi.persist(storage, loaded.state);
    assert.equal(storage.writes.length, 5);
    assert.equal(storage.writes[4].key, storageApi.STORAGE_KEY);
    assert.equal(storage.getItem(storageApi.MIGRATION_BACKUP_KEY), raw);
    assert.equal(storage.getItem(storageApi.V15_BACKUP_KEY), raw);
  });

  test('旧备份写入失败不得更新正式 key；重试成功仍可以迁移', () => {
    const raw = legacyBackup();
    const storage = withLegacy(raw);
    const state = storageApi.load(storage).state;
    const before = structuredClone(state);
    storage.failKey = storageApi.MIGRATION_BACKUP_KEY;
    assert.throws(() => storageApi.persist(storage, state));
    assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
    assert.deepEqual(storage.writes.map(write => write.key), [storageApi.V15_BACKUP_KEY, storageApi.V14_BACKUP_KEY]);
    assert.deepEqual(state, before);
    storage.failKey = null;
    storageApi.persist(storage, state);
    assert.equal(storage.getItem(storageApi.MIGRATION_BACKUP_KEY), raw);
    assert.equal(storage.getItem(storageApi.V15_BACKUP_KEY), raw);
    assert.equal(JSON.parse(storage.getItem(storageApi.STORAGE_KEY)).schemaVersion, model.SCHEMA);
  });

  test('新数据写入失败保留原 JSON 且留下可恢复旧备份', () => {
    const raw = legacyBackup();
    const storage = withLegacy(raw);
    const state = storageApi.load(storage).state;
    const before = structuredClone(state);
    storage.failKey = storageApi.STORAGE_KEY;
    assert.throws(() => storageApi.persist(storage, state));
    assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
    assert.equal(storage.getItem(storageApi.MIGRATION_BACKUP_KEY), raw);
    assert.equal(storage.getItem(storageApi.V15_BACKUP_KEY), raw);
    assert.deepEqual(state, before);
    storage.failKey = null;
    storageApi.persist(storage, state);
    assert.equal(storage.writes.filter(write => write.key === storageApi.MIGRATION_BACKUP_KEY).length, 1);
  });

  test('已存在迁移备份不会被第二份旧数据覆盖', () => {
    const storage = withLegacy();
    const original = '之前保留的原始备份';
    storage.entries.set(storageApi.MIGRATION_BACKUP_KEY, original);
    storageApi.persist(storage, storageApi.load(storage).state);
    assert.equal(storage.getItem(storageApi.MIGRATION_BACKUP_KEY), original);
    assert.deepEqual(storage.writes.map(write => write.key), [storageApi.V15_BACKUP_KEY, storageApi.V14_BACKUP_KEY, storageApi.STORAGE_KEY]);
  });
});

describe('损坏/未来版本数据与存储失败保护', () => {
  test('损坏 JSON 和未来 schema 只读锁定，保留原始文本以便恢复', () => {
    const raws = ['{"schemaVersion":1,', JSON.stringify({ schemaVersion: 5, inventory: [], meals: [], diaries: [] }), JSON.stringify({ schemaVersion: 99, inventory: [], meals: [], diaries: [] })];
    for (const raw of raws) {
      const storage = withLegacy(raw);
      const loaded = storageApi.load(storage);
      assert.equal(loaded.locked, true);
      assert.equal(loaded.raw, raw);
      assert.ok(loaded.warnings.length > 0);
      assert.deepEqual(storage.writes, []);
      assert.throws(() => storageApi.persist(storage, loaded.state));
      assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
      assert.deepEqual(storage.writes, []);
    }
  });

  test('部分异常旧记录即使能显示其他记录也锁定，禁止静默丢失后覆盖', () => {
    const rawObject = JSON.parse(legacyBackup());
    rawObject.meals[0].resource.amount = -1;
    const raw = JSON.stringify(rawObject);
    const storage = withLegacy(raw);
    const loaded = storageApi.load(storage);
    assert.equal(loaded.locked, true);
    assert.equal(loaded.state._readOnly, true);
    assert.ok(loaded.warnings.length > 0);
    assert.throws(() => storageApi.persist(storage, loaded.state));
    assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
    assert.deepEqual(storage.writes, []);
  });

  test('即使绕过 load，persist 也不得覆盖损坏或未来版本原始数据', () => {
    for (const raw of ['{broken', JSON.stringify({ schemaVersion: 5, inventory: [], meals: [], diaries: [] })]) {
      const storage = withLegacy(raw);
      assert.throws(() => storageApi.persist(storage, model.freshState()));
      assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
      assert.deepEqual(storage.writes, []);
    }
  });

  test('V2 缺少日记列表加载只读，原 JSON 不被覆盖；V1 没有日记不锁定', () => {
    const v2 = model.freshState();
    v2.schemaVersion = 2;
    delete v2.dayRecords; delete v2.mealTemplates; delete v2.activityCategories; delete v2.recentStickerIds;
    delete v2.diaries;
    const raw = JSON.stringify(v2);
    const storage = withLegacy(raw);
    const loaded = storageApi.load(storage);
    assert.equal(loaded.locked, true);
    assert.equal(loaded.state._readOnly, true);
    assert.equal(loaded.raw, raw);
    assert.throws(() => storageApi.persist(storage, loaded.state));
    assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
    assert.deepEqual(storage.writes, []);
    const legacy = storageApi.load(withLegacy());
    assert.equal(legacy.locked, false);
    assert.deepEqual(legacy.state.diaries, []);
  });

  test('明确确认恢复可替换保护原文件，但仍不允许保存只读或异常 state', () => {
    const raws = ['{broken', JSON.stringify({ schemaVersion: 5, inventory: [], meals: [], diaries: [] }), JSON.stringify({ schemaVersion: 99, inventory: [], meals: [], diaries: [] })];
    for (const raw of raws) {
      for (const action of ['import', 'clear']) {
        const storage = withLegacy(raw);
        const lockedState = storageApi.load(storage).state;
        assert.throws(() => storageApi.persist(storage, lockedState, { replaceProtected: true }));
        assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
        assert.deepEqual(storage.writes, []);
        const validState = model.freshState();
        if (action === 'import') model.putDiary(validState, { date: '2026-10-12', mood: '安心', text: '从有效备份恢复的日记', joy: '' });
        assert.throws(() => storageApi.persist(storage, validState));
        assert.equal(storage.getItem(storageApi.STORAGE_KEY), raw);
        const before = structuredClone(validState);
        const saved = storageApi.persist(storage, validState, { replaceProtected: true });
        assert.deepEqual(validState, before);
        assert.equal(saved.schemaVersion, model.SCHEMA);
        assert.equal(saved.diaries.length, action === 'import' ? 1 : 0);
        assert.equal(storageApi.load(storage).locked, false);
        assert.deepEqual(storageApi.load(storage).state, saved);
        assert.equal(storage.writes.length, 1);
      }
    }
    const storage = withLegacy('{broken');
    const badState = model.freshState();
    delete badState.diaries;
    assert.throws(() => storageApi.persist(storage, badState, { replaceProtected: true }));
    assert.equal(storage.getItem(storageApi.STORAGE_KEY), '{broken');
    assert.deepEqual(storage.writes, []);
  });

  test('不能保存包含损坏用量、重复关联的 state 覆盖健康数据', () => {
    const storage = new MemoryStorage();
    const good = model.freshState();
    storageApi.persist(storage, good);
    const savedRaw = storage.getItem(storageApi.STORAGE_KEY);
    const beforeWrites = storage.writes.length;
    const bad = structuredClone(good);
    bad.inventory.push({ id: 'rice', name: '米饭', quantity: 3, perMeal: 1, unit: '份', note: '', expires: '' });
    bad.meals.push({ id: 'bad', date: '2026-10-12', slot: 'lunch', name: '坏关联', type: '其他', note: '', protein: '', resources: [{ ingredientId: 'rice', name: '米饭', unit: '份', amount: 1 }, { ingredientId: 'rice', name: '米饭', unit: '份', amount: 2 }], completed: false, completedAt: null });
    assert.throws(() => storageApi.persist(storage, bad));
    assert.equal(storage.getItem(storageApi.STORAGE_KEY), savedRaw);
    assert.equal(storage.writes.length, beforeWrites);
  });

  test('新 state 保存配额失败不会假装成功或改动调用者数据', () => {
    const storage = new MemoryStorage();
    const state = model.freshState();
    model.putDiary(state, { date: '2026-10-12', mood: '😊', text: '值得保留的日记', joy: '' });
    const before = structuredClone(state);
    storage.failKey = storageApi.STORAGE_KEY;
    assert.throws(() => storageApi.persist(storage, state));
    assert.deepEqual(state, before);
    assert.equal(storage.getItem(storageApi.STORAGE_KEY), null);
  });

  test('餐食、零食、日记备份保存往返保持库存和独立内容', () => {
    const storage = withLegacy();
    const state = storageApi.load(storage).state;
    model.putMeal(state, { id: 'tea', date: '2026-10-12', slot: 'snack', name: '下午茶 ♡', type: '零食 / 加餐', protein: '', note: '开心', time: '15:00', resources: [{ ingredientId: 'rice', amount: 0.5 }] });
    model.putDiary(state, { date: '2026-10-12', mood: '满足', text: '今天也有好好生活呀', joy: '一杯草莓牛奶' });
    const saved = storageApi.persist(storage, state);
    const loaded = storageApi.load(storage);
    assert.equal(loaded.locked, false);
    assert.deepEqual(loaded.state, saved);
    assert.equal(loaded.state.inventory[0].quantity, 3);
    assert.equal(model.reserved(loaded.state, 'rice'), 0.5);
    assert.equal(loaded.state.diaries[0].text, '今天也有好好生活呀');
    const exported = JSON.stringify(loaded.state, null, 2);
    const imported = model.normalize(JSON.parse(exported));
    assert.equal(imported.locked, false);
    assert.deepEqual(imported.state, loaded.state);
  });
});
