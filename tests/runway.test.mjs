import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalize, completeMeal, undoComplete } from '../model.js';
import { stockSummary, predictRunway } from '../runway.js';
import { load, persist, STORAGE_KEY, V13_BACKUP_KEY } from '../storage.js';
const DAY = '2026-10-13';
const food = (category, quantity, extras = {}) => ({ id: category, category, name: category, quantity, perMeal: 1, unit: '份', note: '', expires: '', ...extras });
const pantry = (...items) => ({ ...freshState(), inventory: items });
const plan = (date, slot, resources = [], extras = {}) => ({ id: date + slot, date, slot, name: '餐食', type: '其他', completed: false, resources, ...extras });
const resource = (id, amount = 1) => ({ ingredientId: id, name: id, unit: '份', amount });

test('三类瓶颈 + 整套食物；早餐、未知分类、负数和过期排除', () => {
  const state = pantry(food('蛋白质', 9), food('蔬菜', 8), food('碳水', 12), food('整套食物', 3), food('早餐', 20), food('原分类', 99), food('蛋白质', -4, { id: 'negative' }), food('蔬菜', 99, { id: 'expired', expires: '2026-10-12' }));
  const s = stockSummary(state.inventory, DAY);
  assert.equal(s.total, 11); assert.equal(s.combined, 8); assert.equal(s.ready, 3); assert.equal(s.breakfast, 20); assert.deepEqual(s.bottlenecks, ['蔬菜']);
  const before = structuredClone(state);
  assert.deepEqual(predictRunway(state, DAY).last, { date: '2026-10-18', slot: 'lunch' });
  assert.deepEqual(state, before);
});
test('缺一类组合为零，整套独立；使用 perMeal，部分份数不能向上凑整', () => {
  assert.equal(stockSummary([food('蛋白质', 9), food('碳水', 5), food('整套食物', 2)], DAY).total, 2);
  const state = pantry(food('整套食物', 4999, { perMeal: 5000 }));
  assert.equal(stockSummary(state.inventory, DAY).total, 0);
  assert.equal(predictRunway(state, DAY).covered, 0);
  assert.equal(stockSummary([food('早餐', 4, { perMeal: 2 })], DAY).breakfast, 2);
});
test('计划用实际关联量，外食和已吃跳过，不重扣完成记录', () => {
  const state = pantry(food('整套食物', 3));
  state.meals = [plan(DAY, 'lunch', [], { type: '外出就餐' }), plan(DAY, 'dinner', [resource('整套食物', 2)]), plan('2026-10-14', 'lunch', [], { completed: true })];
  const r = predictRunway(state, DAY);
  assert.deepEqual(r.last, { date: '2026-10-14', slot: 'dinner' }); assert.equal(r.covered, 2);
});
test('优先预留未来计划，空白餐次不能抢走已有用量', () => {
  const state = pantry(food('整套食物', 2));
  state.meals = [plan(DAY, 'dinner', [resource('整套食物', 2)])];
  const r = predictRunway(state, DAY);
  assert.equal(r.covered, 0); assert.equal(r.shortage.slot, 'lunch');
  assert.deepEqual(predictRunway(state, DAY, 1).last, { date: DAY, slot: 'dinner' });
});
test('早餐独立而早餐、加餐计划实际消耗仍影响午晚餐', () => {
  const state = pantry(food('早餐', 10), food('整套食物', 3));
  state.meals = [plan(DAY, 'breakfast', [resource('整套食物')]), plan(DAY, 'snack', [resource('整套食物')])];
  assert.equal(stockSummary(state.inventory, DAY).total, 3);
  assert.deepEqual(predictRunway(state, DAY).last, { date: DAY, slot: 'lunch' });
});
test('计划缺货与保质期及时提示；保质期当天可吃', () => {
  const state = pantry(food('整套食物', 3, { expires: DAY }));
  assert.deepEqual(predictRunway(state, DAY).last, { date: DAY, slot: 'dinner' });
  state.meals = [plan(DAY, 'lunch', [resource('整套食物', 4)])];
  assert.match(predictRunway(state, DAY).shortage.reason, /不足/);
});
test('每日1顿默认晚餐，跨月跨年和闰日，无库存和范围上限', () => {
  const state = pantry(food('整套食物', 3));
  assert.deepEqual(predictRunway(state, '2026-12-31', 1).last, { date: '2027-01-02', slot: 'dinner' });
  assert.deepEqual(predictRunway(state, '2028-02-28', 1).last, { date: '2028-03-01', slot: 'dinner' });
  assert.equal(predictRunway(pantry(), DAY).last, null);
  assert.equal(predictRunway(state, DAY, 1, 1).capped, true);
});
test('库存扣减、撤销、重新分类即时改变预测', () => {
  const state = pantry(food('整套食物', 3)); state.meals = [plan(DAY, 'lunch', [resource('整套食物')])];
  completeMeal(state, DAY + 'lunch'); assert.equal(stockSummary(state.inventory, DAY).total, 2);
  undoComplete(state, DAY + 'lunch'); assert.equal(stockSummary(state.inventory, DAY).total, 3);
  state.inventory[0].category = '早餐'; assert.equal(stockSummary(state.inventory, DAY).total, 0);
});
test('旧分类、图片和历史原样保留，升级备份只写一次，备份失败不覆盖原数据', () => {
  const state = pantry(food('旧分类', 5, { photoId: 'photo', image: 'legacy-reference' }));
  state.schemaVersion = 2; delete state.dayRecords;
  const raw = JSON.stringify(state); const entries = new Map([[STORAGE_KEY, raw]]);
  const storage = { getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value) };
  const normalized = load(storage).state;
  assert.deepEqual(normalized.inventory, state.inventory); assert.equal(entries.size, 1);
  persist(storage, normalized); assert.equal(entries.get(V13_BACKUP_KEY), raw);
  const saved = entries.get(STORAGE_KEY); persist(storage, load(storage).state); assert.equal(entries.get(V13_BACKUP_KEY), raw);
  const broken = { getItem: key => key === STORAGE_KEY ? raw : null, setItem: () => { throw Error('quota'); } };
  assert.throws(() => persist(broken, normalized), /升级备份/); assert.equal(broken.getItem(STORAGE_KEY), raw);
  assert.equal(normalize(JSON.parse(saved)).state.inventory[0].photoId, 'photo');
});
