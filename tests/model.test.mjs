import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { defaultPostOffice } from '../post-office.js';
import * as model from '../model.js';
import { defaultActivityCategories } from '../schema-extra.js';

const DAY = '2026-10-12';
const clone = value => structuredClone(value);
const food = (id, quantity, perMeal = 1) => ({ id, name: id === 'beef' ? '牛肉丸' : '虾丸', quantity, perMeal, unit: '份', note: '', expires: '' });
const ingredient = (ingredientId, amount) => ({ ingredientId, amount });
const meal = (id, resources = [], overrides = {}) => ({ id, date: DAY, slot: 'lunch', name: '牛肉丸便当 🍓', type: '自制便当', note: '配菜写在这里', protein: '', resources, ...overrides });
function pantry() {
  const state = model.freshState();
  state.inventory.push(food('beef', 5, 0.75), food('shrimp', 4, 1.25));
  return state;
}
function addLunch(state, overrides = {}) {
  model.putMeal(state, meal('lunch', [ingredient('beef', 2), ingredient('shrimp', 1)], overrides));
  return state.meals.find(row => row.id === 'lunch');
}
const quantity = (state, id) => state.inventory.find(row => row.id === id)?.quantity;
function unchangedOnError(state, callback, check = undefined) {
  const before = clone(state);
  assert.throws(callback, check);
  assert.deepEqual(state, before, '失败操作必须保留整个 state，不允许部分扣减、返还或替换记录');
}
function legacyState() {
  return {
    schemaVersion: 1,
    inventory: [food('beef', 3), food('shrimp', 4)],
    meals: [
      { id: 'old-eaten', date: '2026-10-11', slot: 'dinner', name: '旧版便当', type: '自制便当', note: '保留旧备注', protein: '', resource: { ingredientId: 'beef', name: '历史牛肉丸', unit: '份', amount: 2 }, completed: true, completedAt: '2026-10-11T10:00:00.000Z', photoId: 'old_photo' },
      { id: 'old-plan', date: DAY, slot: 'lunch', name: '明日便当', type: '自制便当', note: '', protein: '', resource: { ingredientId: 'shrimp', name: '虾丸', unit: '份', amount: 1.5 }, completed: false, completedAt: null },
      { id: 'old-plain', date: DAY, slot: 'breakfast', name: '饭堂早餐', type: '公司食堂', note: '不用库存', protein: '', resource: null, completed: false, completedAt: null },
    ],
    updatedAt: '2026-10-11T11:00:00.000Z',
  };
}

describe('V1.5 schema 与旧版记录安全迁移', () => {
  test('新状态使用 schema 4，主餐与 snack 槽位分别导出且提供快捷记录默认值', () => {
    assert.equal(model.SCHEMA, 4);
    assert.deepEqual(model.SLOTS, ['breakfast', 'lunch', 'dinner']);
    assert.deepEqual(model.ALL_SLOTS, ['breakfast', 'lunch', 'dinner', 'snack']);
    assert.deepEqual(model.freshState(), { schemaVersion: 4, inventory: [], meals: [], diaries: [], dayRecords: [], mealTemplates: [], activityCategories: defaultActivityCategories(), recentStickerIds: [], postOffice: defaultPostOffice(), updatedAt: null });
  });

  test('旧已吃记录和未来计划迁移时保留原库存、快照、备注与照片引用', () => {
    const raw = legacyState();
    const before = clone(raw);
    const result = model.normalize(raw);
    assert.equal(result.locked, false);
    assert.deepEqual(result.warnings, []);
    assert.deepEqual(raw, before, '读取和迁移不能改动传入的旧备份对象');
    assert.equal(result.state.schemaVersion, model.SCHEMA);
    assert.deepEqual(result.state.diaries, []);
    assert.deepEqual(result.state.inventory, raw.inventory);
    const eaten = result.state.meals.find(row => row.id === 'old-eaten');
    assert.deepEqual(eaten.resources, [raw.meals[0].resource]);
    assert.equal(eaten.completed, true);
    assert.equal(eaten.completedAt, raw.meals[0].completedAt);
    assert.equal(eaten.photoId, 'old_photo');
    assert.equal(eaten.note, '保留旧备注');
    assert.deepEqual(result.state.meals.find(row => row.id === 'old-plain').resources, []);
    assert.equal(model.reserved(result.state, 'beef'), 0);
    assert.equal(model.reserved(result.state, 'shrimp'), 1.5);
    assert.equal(model.forecast(result.state, 'shrimp'), 2.5);
  });

  test('重复迁移和 JSON 备份往返幂等，不再次扣减已吃用量', () => {
    const migrated = model.normalize(legacyState()).state;
    const repeated = model.normalize(JSON.parse(JSON.stringify(migrated)));
    assert.equal(repeated.locked, false);
    assert.deepEqual(repeated.state, migrated);
    assert.equal(quantity(repeated.state, 'beef'), 3);
    model.undoComplete(repeated.state, 'old-eaten');
    assert.equal(quantity(repeated.state, 'beef'), 5, '迁移后的撤销只返还原来扣过的一次');
    assert.equal(model.undoComplete(repeated.state, 'old-eaten'), false);
    assert.equal(quantity(repeated.state, 'beef'), 5);
  });

  test('完整 V1.1 备份保留多食材、零食时间及独立日记', () => {
    const state = pantry();
    addLunch(state);
    model.completeMeal(state, 'lunch');
    model.putMeal(state, meal('tea', [ingredient('shrimp', 0.5)], { slot: 'snack', name: '下午茶 🍓', time: '15:30' }));
    model.putDiary(state, { date: DAY, mood: '开心 😊', text: '好好吃饭，好好生活。', joy: '收到一束花 ♡' });
    const restored = model.normalize(JSON.parse(JSON.stringify(state)));
    assert.equal(restored.locked, false);
    assert.deepEqual(restored.state, state);
    assert.equal(restored.state.meals.find(row => row.id === 'tea').time, '15:30');
    assert.equal(quantity(restored.state, 'beef'), 3);
    assert.equal(model.forecast(restored.state, 'shrimp'), 2.5);
  });

  test('有损或危险备份显式锁定，不能静默当作安全迁移', () => {
    const cases = [
      raw => { raw.inventory[1].quantity = NaN; },
      raw => { raw.meals[0].resource.amount = -1; },
      raw => { raw.meals[1].resource.ingredientId = 'missing'; },
      raw => { raw.meals.push({ ...clone(raw.meals[1]), id: 'duplicate-position' }); },
    ];
    for (const damage of cases) {
      const raw = legacyState();
      damage(raw);
      const result = model.normalize(raw);
      assert.equal(result.locked, true);
      assert.equal(result.state._readOnly, true);
      assert.ok(result.warnings.length > 0, '锁定原因需要可读的提示');
    }
  });

  test('V2 重复食材关联不会被归一化后重复扣库存', () => {
    const state = pantry();
    const saved = meal('duplicate', [
      { ingredientId: 'beef', name: '牛肉丸', unit: '份', amount: 1 },
      { ingredientId: 'beef', name: '牛肉丸', unit: '份', amount: 2 },
    ], { completed: true, completedAt: '2026-10-12T12:00:00.000Z' });
    state.meals.push(saved);
    const before = clone(state);
    const result = model.normalize(state);
    assert.equal(result.locked, true);
    assert.deepEqual(state, before);
    assert.deepEqual(result.state.inventory, before.inventory);
  });

  test('未知未来 schema、非备份对象拒绝解析', () => {
    for (const raw of [null, [], {}, { ...legacyState(), schemaVersion: 5 }, { ...legacyState(), schemaVersion: 99 }]) {
      assert.throws(() => model.normalize(raw));
    }
  });

  test('V2 缺失日记列表属于有损数据并锁定，V1 缺失日记正常迁移', () => {
    const v2 = model.freshState();
    v2.schemaVersion = 2;
    delete v2.dayRecords; delete v2.mealTemplates; delete v2.activityCategories; delete v2.recentStickerIds;
    delete v2.diaries;
    const raw = clone(v2);
    const result = model.normalize(v2);
    assert.equal(result.locked, true);
    assert.equal(result.state._readOnly, true);
    assert.ok(result.warnings.length > 0);
    assert.deepEqual(v2, raw);
    const legacy = model.normalize(legacyState());
    assert.equal(legacy.locked, false);
    assert.deepEqual(legacy.state.diaries, []);
  });
});

describe('多食材计划、实际库存与原子扣减', () => {
  test('一餐多个独立用量，计划仅影响预计剩余，完成只扣一次', () => {
    const state = pantry();
    addLunch(state);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
    assert.equal(model.reserved(state, 'beef'), 2);
    assert.equal(model.reserved(state, 'shrimp'), 1);
    assert.equal(model.forecast(state, 'beef'), 3);
    assert.equal(model.forecast(state, 'shrimp'), 3);
    assert.equal(model.reserved(state, 'beef', 'lunch'), 0);
    assert.equal(model.forecast(state, 'beef', 'lunch'), 5);
    assert.equal(model.forecast(state, 'unknown'), null);
    assert.equal(model.completeMeal(state, 'lunch'), true);
    assert.deepEqual(state.inventory.map(row => row.quantity), [3, 3]);
    assert.equal(model.reserved(state, 'beef'), 0);
    assert.equal(model.forecast(state, 'beef'), 3);
    const completed = clone(state);
    assert.equal(model.completeMeal(state, 'lunch'), false);
    assert.deepEqual(state, completed);
    assert.equal(model.undoComplete(state, 'lunch'), true);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
    assert.equal(model.undoComplete(state, 'lunch'), false);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
  });

  test('每种关联缺省数量使用各自 perMeal；有明确数量时只使用该数量', () => {
    const state = pantry();
    model.putMeal(state, meal('defaults', [{ ingredientId: 'beef' }, { ingredientId: 'shrimp', amount: '' }]));
    assert.deepEqual(state.meals[0].resources.map(row => row.amount), [0.75, 1.25]);
    model.putMeal(state, meal('defaults', [ingredient('beef', 0.5), ingredient('shrimp', 2)]));
    assert.deepEqual(state.meals[0].resources.map(row => row.amount), [0.5, 2]);
  });

  test('计划用量超过库存允许安排；完成需显式确认才允许负库存', () => {
    const state = pantry();
    model.putMeal(state, meal('large', [ingredient('beef', 1), ingredient('shrimp', 6)]));
    assert.equal(model.forecast(state, 'shrimp'), -2);
    assert.equal(quantity(state, 'shrimp'), 4);
    unchangedOnError(state, () => model.completeMeal(state, 'large'), error => error.code === 'INSUFFICIENT_STOCK');
    model.completeMeal(state, 'large', true);
    assert.deepEqual(state.inventory.map(row => row.quantity), [4, -2]);
    model.undoComplete(state, 'large');
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
  });

  test('第二个食材缺失时完成不扣第一个，撤销和删除不返还第一个', () => {
    const planned = pantry();
    addLunch(planned);
    planned.inventory = planned.inventory.filter(row => row.id !== 'shrimp');
    unchangedOnError(planned, () => model.completeMeal(planned, 'lunch'));
    const completed = pantry();
    addLunch(completed);
    model.completeMeal(completed, 'lunch');
    completed.inventory = completed.inventory.filter(row => row.id !== 'shrimp');
    unchangedOnError(completed, () => model.undoComplete(completed, 'lunch'));
    unchangedOnError(completed, () => model.removeMeal(completed, 'lunch'));
    unchangedOnError(completed, () => model.putMeal(completed, meal('lunch', [ingredient('beef', 1)])));
  });

  test('同一餐重复 ingredientId 拒绝，失败不替换已有餐食', () => {
    const state = pantry();
    addLunch(state);
    unchangedOnError(state, () => model.putMeal(state, meal('lunch', [ingredient('beef', 1), ingredient('beef', 2)])));
    model.completeMeal(state, 'lunch');
    unchangedOnError(state, () => model.putMeal(state, meal('lunch', [ingredient('beef', 1), ingredient('beef', 2)])));
  });

  test('异常已存计划重复关联或第二项无效时也不能部分扣减', () => {
    for (const damage of [
      row => { row.resources.push(clone(row.resources[0])); },
      row => { row.resources[1].amount = NaN; },
      row => { row.resources[1].amount = -1; },
    ]) {
      const state = pantry();
      const saved = addLunch(state);
      damage(saved);
      unchangedOnError(state, () => model.completeMeal(state, 'lunch'));
    }
  });

  test('增加、删除、调整计划关联不会改变其他关联或实际库存', () => {
    const state = pantry();
    model.putMeal(state, meal('lunch', [ingredient('beef', 1)]));
    model.putMeal(state, meal('lunch', [ingredient('beef', 1), ingredient('shrimp', 0.5)]));
    model.putMeal(state, meal('lunch', [ingredient('beef', 1), ingredient('shrimp', 1.25)]));
    assert.equal(model.reserved(state, 'beef'), 1);
    assert.equal(model.reserved(state, 'shrimp'), 1.25);
    model.putMeal(state, meal('lunch', [ingredient('shrimp', 1.25)]));
    assert.equal(model.reserved(state, 'beef'), 0);
    assert.equal(model.reserved(state, 'shrimp'), 1.25);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
  });

  test('小数库存三位精度无浮点残差，完成撤销多轮无漂移', () => {
    const state = pantry();
    state.inventory[0].quantity = 0.3;
    model.putMeal(state, meal('fraction', [ingredient('beef', 0.1), ingredient('shrimp', 0.23456)]));
    assert.equal(state.meals[0].resources[1].amount, 0.235);
    for (let i = 0; i < 20; i++) {
      model.completeMeal(state, 'fraction');
      assert.equal(quantity(state, 'beef'), 0.2);
      assert.equal(quantity(state, 'shrimp'), 3.765);
      model.undoComplete(state, 'fraction');
      assert.equal(quantity(state, 'beef'), 0.3);
      assert.equal(quantity(state, 'shrimp'), 4);
    }
    assert.equal(model.round(1.23456), 1.235);
  });

  test('负数、零、NaN、Infinity、超范围和舍入成零的用量均原子拒绝', () => {
    const invalid = [-1, 0, NaN, Infinity, -Infinity, 1e9 + 1, 0.0001, true, {}];
    for (const amount of invalid) {
      const state = pantry();
      addLunch(state);
      unchangedOnError(state, () => model.putMeal(state, meal('lunch', [ingredient('beef', 1), ingredient('shrimp', amount)])));
    }
  });

  test('没有库存关联的餐食可以完成、撤销、删除', () => {
    const state = pantry();
    model.putMeal(state, meal('plain'));
    assert.equal(model.completeMeal(state, 'plain'), true);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
    assert.equal(model.undoComplete(state, 'plain'), true);
    model.completeMeal(state, 'plain');
    model.removeMeal(state, 'plain');
    assert.deepEqual(state.meals, []);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
  });
});

describe('编辑、删除已吃记录的库存补偿', () => {
  test('编辑已吃餐食按差量返还旧关联并扣新关联，保持已吃状态', () => {
    const state = pantry();
    addLunch(state);
    model.completeMeal(state, 'lunch');
    const completedAt = state.meals[0].completedAt;
    model.putMeal(state, meal('lunch', [ingredient('beef', 3), ingredient('shrimp', 0.5)], { name: '升级版便当' }));
    assert.deepEqual(state.inventory.map(row => row.quantity), [2, 3.5]);
    assert.equal(state.meals[0].completed, true);
    assert.equal(state.meals[0].completedAt, completedAt);
    assert.equal(model.reserved(state, 'beef'), 0);
    const unchangedQuantities = state.inventory.map(row => row.quantity);
    model.putMeal(state, clone(state.meals[0]));
    assert.deepEqual(state.inventory.map(row => row.quantity), unchangedQuantities);
    model.undoComplete(state, 'lunch');
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
  });

  test('已吃编辑删除一种食材、增加另一种食材，库存各自补偿', () => {
    const state = pantry();
    state.inventory.push({ ...food('milk', 3), name: '草莓牛奶', unit: '盒' });
    addLunch(state);
    model.completeMeal(state, 'lunch');
    model.putMeal(state, meal('lunch', [ingredient('shrimp', 1), ingredient('milk', 2)]));
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 3, 1]);
    model.removeMeal(state, 'lunch');
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4, 3]);
    assert.deepEqual(state.meals, []);
    model.removeMeal(state, 'lunch');
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4, 3]);
  });

  test('已吃编辑库存不足或第二项无效时没有部分返还；明确确认可负库存', () => {
    const state = pantry();
    addLunch(state);
    model.completeMeal(state, 'lunch');
    unchangedOnError(state, () => model.putMeal(state, meal('lunch', [ingredient('beef', 1), ingredient('shrimp', 6)])), error => error.code === 'INSUFFICIENT_STOCK');
    unchangedOnError(state, () => model.putMeal(state, meal('lunch', [ingredient('beef', 1), ingredient('missing', 1)])));
    model.putMeal(state, meal('lunch', [ingredient('beef', 1), ingredient('shrimp', 6)]), false, true);
    assert.deepEqual(state.inventory.map(row => row.quantity), [4, -2]);
    model.removeMeal(state, 'lunch');
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
  });

  test('历史名称和单位快照不受库存改名影响，撤销按 id 返还', () => {
    const state = pantry();
    addLunch(state);
    model.completeMeal(state, 'lunch');
    state.inventory[0].name = '新名字';
    state.inventory[0].perMeal = 2;
    const oldResources = clone(state.meals[0].resources);
    const edited = { ...clone(state.meals[0]), note: '只改备注' };
    model.putMeal(state, edited);
    assert.deepEqual(state.meals[0].resources, oldResources);
    model.undoComplete(state, 'lunch');
    assert.equal(quantity(state, 'beef'), 5);
    assert.equal(state.inventory[0].name, '新名字');
    assert.equal(state.inventory[0].perMeal, 2);
    assert.equal(state.inventory[0].unit, '份');
  });

  test('已吃历史单位与现库存单位不一致时原子拒绝返还，避免份数混用', () => {
    const state = pantry();
    addLunch(state);
    model.completeMeal(state, 'lunch');
    state.inventory[1].unit = '盒';
    unchangedOnError(state, () => model.undoComplete(state, 'lunch'));
    unchangedOnError(state, () => model.removeMeal(state, 'lunch'));
    unchangedOnError(state, () => model.putMeal(state, meal('lunch', [ingredient('beef', 1)])));
  });

  test('旧版已吃迁移后可以直接修改和删除，不造成二次扣减', () => {
    const state = model.normalize(legacyState()).state;
    model.putMeal(state, meal('old-eaten', [ingredient('beef', 1.5)], { date: '2026-10-11', slot: 'dinner' }));
    assert.equal(quantity(state, 'beef'), 3.5);
    assert.equal(state.meals.find(row => row.id === 'old-eaten').completed, true);
    model.removeMeal(state, 'old-eaten');
    assert.equal(quantity(state, 'beef'), 5);
    assert.equal(quantity(state, 'shrimp'), 4);
  });
});

describe('餐食位置、复制和移动', () => {
  test('主餐每日唯一；替换计划需显式允许且失败保留来源与目标', () => {
    const state = pantry();
    addLunch(state);
    unchangedOnError(state, () => model.putMeal(state, meal('another', [ingredient('shrimp', 0.5)])));
    model.putMeal(state, meal('another', [ingredient('shrimp', 0.5)]), true);
    assert.equal(state.meals.length, 1);
    assert.equal(state.meals[0].id, 'another');
    assert.equal(model.reserved(state, 'beef'), 0);
    assert.equal(model.reserved(state, 'shrimp'), 0.5);
    model.completeMeal(state, 'another');
    unchangedOnError(state, () => model.putMeal(state, meal('overwrite'), true));
  });

  test('跨月移动完整关联；复制独立关联且不扣实际库存', () => {
    const state = pantry();
    const original = addLunch(state);
    const resources = clone(original.resources);
    const moved = model.transferMeal(state, 'lunch', '2026-11-01', 'dinner', true);
    assert.equal(moved.id, 'lunch');
    assert.equal(state.meals.length, 1);
    assert.deepEqual(state.meals[0].resources, resources);
    assert.equal(state.meals[0].date, '2026-11-01');
    const copy = model.transferMeal(state, 'lunch', '2026-11-02', 'lunch', false);
    assert.notEqual(copy.id, 'lunch');
    assert.deepEqual(copy.resources, resources);
    assert.equal(copy.completed, false);
    assert.equal(copy.completedAt, null);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
    assert.equal(model.reserved(state, 'beef'), 4);
    model.putMeal(state, { ...copy, resources: [ingredient('beef', 0.5)] });
    assert.deepEqual(state.meals.find(row => row.id === 'lunch').resources, resources);
  });

  test('复制已吃餐食变成计划，原已吃扣减和日期不变；移动已吃拒绝', () => {
    const state = pantry();
    addLunch(state);
    model.completeMeal(state, 'lunch');
    const eaten = clone(state.meals[0]);
    const copy = model.transferMeal(state, 'lunch', '2026-10-13', 'lunch', false);
    assert.deepEqual(state.meals.find(row => row.id === 'lunch'), eaten);
    assert.equal(copy.completed, false);
    assert.deepEqual(copy.resources, eaten.resources);
    assert.deepEqual(state.inventory.map(row => row.quantity), [3, 3]);
    unchangedOnError(state, () => model.transferMeal(state, 'lunch', '2026-10-14', 'lunch', true));
  });

  test('目标冲突与非法日期不丢掉移动来源', () => {
    const state = pantry();
    addLunch(state);
    model.putMeal(state, meal('dinner', [], { slot: 'dinner' }));
    unchangedOnError(state, () => model.transferMeal(state, 'lunch', DAY, 'dinner', true));
    unchangedOnError(state, () => model.transferMeal(state, 'lunch', '2026-02-30', 'dinner', true));
    unchangedOnError(state, () => model.transferMeal(state, 'lunch', DAY, 'unknown', true));
    model.transferMeal(state, 'lunch', DAY, 'dinner', true, true);
    assert.equal(state.meals.length, 1);
    assert.equal(state.meals[0].id, 'lunch');
    assert.equal(state.meals[0].slot, 'dinner');
  });

  test('库存改名后移动和复制保留全部历史名称、单位和用量快照', () => {
    const state = pantry();
    const original = addLunch(state);
    const resources = clone(original.resources);
    state.inventory[0].name = '改名后的牛肉丸';
    state.inventory[1].name = '改名后的虾丸';
    state.inventory[0].perMeal = 3;
    state.inventory[1].perMeal = 2;
    const moved = model.transferMeal(state, 'lunch', '2026-10-13', 'dinner', true);
    assert.deepEqual(moved.resources, resources);
    const planCopy = model.transferMeal(state, 'lunch', '2026-10-14', 'lunch', false);
    assert.deepEqual(planCopy.resources, resources);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
    model.completeMeal(state, 'lunch');
    const eatenCopy = model.transferMeal(state, 'lunch', '2026-10-15', 'lunch', false);
    assert.deepEqual(eatenCopy.resources, resources);
    assert.equal(eatenCopy.completed, false);
    assert.equal(state.meals.find(row => row.id === 'lunch').completed, true);
    assert.deepEqual(state.inventory.map(row => row.quantity), [3, 3]);
    const restored = model.normalize(JSON.parse(JSON.stringify(state)));
    assert.equal(restored.locked, false);
    assert.deepEqual(restored.state.meals.map(row => row.resources), [resources, resources, resources]);
  });
});

describe('零食与每日文字日记', () => {
  test('同一天允许多条零食和同日复制，每条各自库存且可选时间', () => {
    const state = pantry();
    model.putMeal(state, meal('tea', [ingredient('beef', 0.5), ingredient('shrimp', 0.25)], { slot: 'snack', name: '下午茶 🍓', time: '15:30' }));
    model.putMeal(state, meal('dessert', [], { slot: 'snack', name: '饭后小蛋糕 ♡' }));
    const copy = model.transferMeal(state, 'tea', DAY, 'snack', false);
    assert.equal(state.meals.length, 3);
    assert.notEqual(copy.id, 'tea');
    assert.equal(copy.time, '15:30');
    assert.deepEqual(copy.resources, state.meals.find(row => row.id === 'tea').resources);
    assert.equal(model.reserved(state, 'beef'), 1);
    model.completeMeal(state, 'tea');
    assert.equal(quantity(state, 'beef'), 4.5);
    assert.equal(model.reserved(state, 'beef'), 0.5);
    model.removeMeal(state, 'dessert');
    assert.equal(state.meals.length, 2);
  });

  test('日记按日期保存、更新、删除，餐食编辑删除不影响日记', () => {
    const state = pantry();
    model.putDiary(state, { date: DAY, mood: '😊', text: '午后看见好看的云。', joy: '草莓很甜 ♡' });
    model.putDiary(state, { date: '2026-10-13', mood: '', text: '第二天的故事', joy: '' });
    assert.equal(state.diaries.length, 2);
    addLunch(state);
    model.completeMeal(state, 'lunch');
    const diaries = clone(state.diaries);
    model.putMeal(state, meal('lunch', []));
    model.removeMeal(state, 'lunch');
    assert.deepEqual(state.diaries, diaries);
    model.putDiary(state, { date: DAY, mood: '满足', text: '更新今天的日记', joy: '' });
    assert.equal(state.diaries.length, 2);
    assert.equal(state.diaries.find(row => row.date === DAY).text, '更新今天的日记');
    model.removeDiary(state, DAY);
    assert.deepEqual(state.diaries.map(row => row.date), ['2026-10-13']);
    model.removeDiary(state, DAY);
    assert.equal(state.diaries.length, 1);
    assert.deepEqual(state.inventory.map(row => row.quantity), [5, 4]);
  });

  test('非法日记日期拒绝且不损坏已保存内容', () => {
    const state = pantry();
    model.putDiary(state, { date: DAY, text: '保留这条', mood: '', joy: '' });
    unchangedOnError(state, () => model.putDiary(state, { date: '2026-02-30', text: '无效', mood: '', joy: '' }));
  });

  test('日期切换覆盖月末、年末与闰日，周列表从周一开始', () => {
    assert.equal(model.addDays('2026-10-31', 1), '2026-11-01');
    assert.equal(model.addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(model.addDays('2024-02-28', 1), '2024-02-29');
    assert.equal(model.addDays('2024-03-01', -1), '2024-02-29');
    assert.equal(model.parseDate('2026-02-29'), null);
    assert.equal(model.parseDate('2026-13-01'), null);
    assert.deepEqual(model.weekDates('2026-11-01'), ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01']);
  });
});
