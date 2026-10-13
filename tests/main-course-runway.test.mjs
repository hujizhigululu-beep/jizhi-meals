import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, completeMeal, undoComplete, forecast } from '../model.js';
import { predictMainCourseRunway, predictRunway, stockSummary } from '../runway.js';

const DAY = '2026-10-13';
const food = (id, category, quantity, extras = {}) => ({ id, category, name: id, quantity, perMeal: 1, unit: '份', note: '', expires: '', ...extras });
const pantry = (...inventory) => ({ ...freshState(), inventory });
const resource = (ingredientId, amount = 1, extras = {}) => ({ ingredientId, name: ingredientId, unit: '份', amount, ...extras });
const plan = (date, slot, resources = [], extras = {}) => ({ id: `${date}-${slot}`, date, slot, name: '便当', type: '自制便当', completed: false, completedAt: null, resources, ...extras });
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const expectCounts = (prediction, proteinMeals, readyMeals) => {
  assert.equal(prediction.proteinMeals, proteinMeals);
  assert.equal(prediction.readyMeals, readyMeals);
  assert.equal(prediction.covered, proteinMeals + readyMeals);
};

test('主菜不受蔬菜、碳水限制，综合预测和原统计保持原样', () => {
  const state = pantry(food('beef', '蛋白质', 4), food('bento', '整套食物', 2), food('greens', '蔬菜', 0), food('rice', '碳水', 0), food('bread', '早餐', 99));
  const comprehensiveBefore = predictRunway(state, DAY);
  const stockBefore = stockSummary(state.inventory, DAY);
  const main = predictMainCourseRunway(state, DAY);
  expectCounts(main, 4, 2);
  assert.deepEqual(main.last, { date: '2026-10-15', slot: 'dinner' });
  assert.deepEqual(main.shortage.date, '2026-10-16');
  assert.equal(comprehensiveBefore.covered, 2);
  assert.deepEqual(predictRunway(state, DAY), comprehensiveBefore);
  assert.deepEqual(stockSummary(state.inventory, DAY), stockBefore);
});

test('未来计划优先预留，空白午餐不能抢走已安排的两份蛋白质', () => {
  const state = pantry(food('beef', '蛋白质', 2));
  state.meals = [plan(DAY, 'dinner', [resource('beef', 2)])];
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 0, 0);
  assert.equal(result.shortage.slot, 'lunch');
  const dinnerOnly = predictMainCourseRunway(state, DAY, 1);
  expectCounts(dinnerOnly, 1, 0);
  assert.deepEqual(dinnerOnly.last, { date: DAY, slot: 'dinner' });
});

test('实际计划用量决定覆盖顿数，蛋白质两份的一餐仍只算一顿', () => {
  const state = pantry(food('beef', '蛋白质', 3), food('bento', '整套食物', 1));
  state.meals = [plan(DAY, 'dinner', [resource('beef', 2)])];
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 2, 1);
  assert.deepEqual(result.last, { date: '2026-10-14', slot: 'lunch' });
});

test('过去未吃计划遵循当前预计库存口径保留用量，不重播历史扣减', () => {
  const state = pantry(food('beef', '蛋白质', 4));
  state.meals = [plan('2026-10-12', 'dinner', [resource('beef', 2)])];
  assert.equal(forecast(state, 'beef'), 2);
  const before = structuredClone(state);
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 2, 0);
  assert.deepEqual(result.last, { date: DAY, slot: 'dinner' });
  assert.deepEqual(state, before);
});

test('早餐库存独立，早餐与加餐显式用主菜会消耗但不贡献午晚餐数', () => {
  const state = pantry(food('beef', '蛋白质', 4), food('bread', '早餐', 100));
  state.meals = [plan(DAY, 'breakfast', [resource('beef')]), plan(DAY, 'snack', [resource('beef')], { time: '20:00' })];
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 2, 0);
  assert.deepEqual(result.last, { date: DAY, slot: 'dinner' });
  assert.equal(predictMainCourseRunway(pantry(food('bread', '早餐', 100)), DAY).covered, 0);
});

test('同餐两种蛋白质按实际用量扣减，只计一顿', () => {
  const state = pantry(food('beef', '蛋白质', 0.5), food('shrimp', '蛋白质', 0.5));
  state.meals = [plan(DAY, 'lunch', [resource('beef', 0.5), resource('shrimp', 0.5)])];
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 1, 0);
  assert.equal(result.shortage.slot, 'dinner');
});

test('同餐整套食物加蛋白质不重复计数，归入整套餐食', () => {
  const state = pantry(food('beef', '蛋白质', 1), food('bento', '整套食物', 1));
  state.meals = [plan(DAY, 'lunch', [resource('beef'), resource('bento')])];
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 0, 1);
  assert.equal(result.shortage.slot, 'dinner');
});

test('空白餐次可以按默认用量拼合不同蛋白质的小数份数', () => {
  const state = pantry(food('beef', '蛋白质', 0.3, { perMeal: 0.5 }), food('shrimp', '蛋白质', 0.2, { perMeal: 0.5 }));
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 1, 0);
  assert.equal(result.shortage.slot, 'dinner');
  assert.equal(predictMainCourseRunway(pantry(food('beef', '蛋白质', 0.999)), DAY).covered, 0);
});

test('明确计划可使用小于默认用量的小数；分类数字来自模拟而非库存取整', () => {
  const state = pantry(food('beef', '蛋白质', 0.375, { perMeal: 0.5 }));
  state.meals = [plan(DAY, 'lunch', [resource('beef', 0.125)]), plan(DAY, 'dinner', [resource('beef', 0.125)]), plan('2026-10-14', 'lunch', [resource('beef', 0.125)])];
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 3, 0);
  assert.deepEqual(result.last, { date: '2026-10-14', slot: 'lunch' });
});

test('非主菜库存不足或过期不限制有主菜的计划，只有非主菜的午晚餐跳过', () => {
  const state = pantry(food('beef', '蛋白质', 2), food('greens', '蔬菜', 0, { expires: '2026-10-01' }));
  state.meals = [plan(DAY, 'lunch', [resource('beef'), resource('greens', 5)])];
  expectCounts(predictMainCourseRunway(state, DAY), 2, 0);
  state.meals = [plan(DAY, 'lunch', [resource('greens', 5)])];
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 2, 0);
  assert.equal(result.skipped, 1);
  assert.deepEqual(result.last, { date: '2026-10-14', slot: 'lunch' });
});

test('已吃餐食只占日期槽位，不再预留或重扣已消耗主菜', () => {
  const state = pantry(food('beef', '蛋白质', 2));
  state.meals = [plan(DAY, 'lunch', [resource('beef', 99)], { completed: true })];
  const before = structuredClone(state);
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 2, 0);
  assert.deepEqual(result.last, { date: '2026-10-14', slot: 'lunch' });
  assert.deepEqual(state, before);
});

test('库存完成与撤销后立即反映主菜结果，预测本身不会再次扣减', () => {
  const state = pantry(food('beef', '蛋白质', 2));
  state.meals = [plan(DAY, 'dinner', [resource('beef')])];
  completeMeal(state, `${DAY}-dinner`);
  assert.equal(state.inventory[0].quantity, 1);
  expectCounts(predictMainCourseRunway(state, DAY), 1, 0);
  assert.equal(state.inventory[0].quantity, 1);
  undoComplete(state, `${DAY}-dinner`);
  expectCounts(predictMainCourseRunway(state, DAY), 2, 0);
  assert.equal(state.inventory[0].quantity, 2);
});

test('保质期当天可用，之后不再贡献；优先使用先过期的同类主菜', () => {
  const state = pantry(food('far', '蛋白质', 1, { expires: '2026-10-20' }), food('soon', '蛋白质', 1, { expires: DAY }));
  const result = predictMainCourseRunway(state, DAY, 1);
  expectCounts(result, 2, 0);
  assert.deepEqual(result.last, { date: '2026-10-14', slot: 'dinner' });
  const todayOnly = predictMainCourseRunway(pantry(food('beef', '蛋白质', 3, { expires: DAY })), DAY);
  expectCounts(todayOnly, 2, 0);
  assert.equal(todayOnly.shortage.date, '2026-10-14');
});

test('显式计划主菜不足和过期会清楚失败，不挪用别种主菜替代', () => {
  const state = pantry(food('beef', '蛋白质', 1, { expires: '2026-10-12' }), food('bento', '整套食物', 10));
  state.meals = [plan(DAY, 'lunch', [resource('beef')])];
  assert.match(predictMainCourseRunway(state, DAY).shortage.reason, /beef.*不足或已过保质期/);
  state.inventory[0].expires = '';
  state.meals[0].resources[0].amount = 2;
  assert.match(predictMainCourseRunway(state, DAY).shortage.reason, /不足/);
});

test('用尽、负库存和未知分类不贡献主菜，不出现非有限结果', () => {
  const state = pantry(food('empty', '蛋白质', 0), food('negative', '整套食物', -5), food('legacy', '旧分类', 100), food('bread', '早餐', 100));
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 0, 0);
  assert.equal(result.last, null);
  assert.equal(result.capped, false);
});

test('每日一顿仍默认晚餐，并尊重显式午餐，日期可跨年与闰日', () => {
  const state = pantry(food('beef', '蛋白质', 3));
  assert.deepEqual(predictMainCourseRunway(state, '2026-12-31', 1).last, { date: '2027-01-02', slot: 'dinner' });
  assert.deepEqual(predictMainCourseRunway(state, '2028-02-28', 1).last, { date: '2028-03-01', slot: 'dinner' });
  state.meals = [plan(DAY, 'lunch', [resource('beef')])];
  const result = predictMainCourseRunway(state, DAY, 1);
  expectCounts(result, 3, 0);
  assert.deepEqual(result.last, { date: '2026-10-14', slot: 'dinner' });
});

test('范围上限清楚返回 capped，最大只模拟 3660 天', () => {
  const state = pantry(food('beef', '蛋白质', 20000));
  const oneDay = predictMainCourseRunway(state, DAY, 2, 1);
  expectCounts(oneDay, 2, 0);
  assert.equal(oneDay.capped, true);
  assert.equal(oneDay.shortage, null);
  expectCounts(predictMainCourseRunway(state, DAY, 2, 10000), 7320, 0);
  const nearCalendarEnd = predictMainCourseRunway(state, '9999-12-31');
  expectCounts(nearCalendarEnd, 2, 0);
  assert.equal(nearCalendarEnd.capped, true);
});

test('缺失、单位不匹配、重复和无效用量的关联都停止安全预测', () => {
  const invalid = [
    { resources: [resource('missing')], reason: /不存在|编号异常/ },
    { resources: [resource('beef', 1, { unit: '克' })], reason: /单位.*不一致/ },
    { resources: [resource('beef'), resource('beef')], reason: /关联重复/ },
    { resources: [resource('beef', NaN)], reason: /用量异常/ },
    { resources: [resource('beef', 0)], reason: /用量异常/ },
    { resources: [resource('beef', 0.0001)], reason: /用量异常/ },
    { resources: [resource('greens', 0)], reason: /用量异常/ },
    { resources: [null], reason: /不存在|编号异常/ },
    { resources: null, reason: /关联格式异常/ },
  ];
  for (const { resources, reason } of invalid) {
    const state = pantry(food('beef', '蛋白质', 2), food('greens', '蔬菜', 0));
    state.meals = [plan(DAY, 'lunch', resources)];
    const result = predictMainCourseRunway(state, DAY);
    expectCounts(result, 0, 0);
    assert.match(result.shortage.reason, reason);
  }
});

test('旧单食材关联兼容，重复库存与无效每餐用量不能产生虚假主菜', () => {
  const state = pantry(food('beef', '蛋白质', 1));
  state.meals = [plan(DAY, 'lunch', undefined, { resource: resource('beef') })];
  delete state.meals[0].resources;
  expectCounts(predictMainCourseRunway(state, DAY), 1, 0);
  state.inventory.push(food('beef', '蛋白质', 1));
  assert.match(predictMainCourseRunway(state, DAY).shortage.reason, /编号.*重复/);
  state.inventory.pop();
  state.inventory[0].perMeal = 0;
  assert.match(predictMainCourseRunway(state, DAY).shortage.reason, /每餐用量异常/);
  state.inventory[0].perMeal = 0.0001;
  assert.match(predictMainCourseRunway(state, DAY).shortage.reason, /每餐用量异常/);
  state.inventory[0].perMeal = 1;
  state.meals = [null];
  assert.match(predictMainCourseRunway(state, DAY).shortage.reason, /条目格式异常/);
});

test('深度冻结、只读状态和连续切换预测模式均不改变记录或库存', () => {
  const state = pantry(food('beef', '蛋白质', 4), food('bento', '整套食物', 2));
  state.meals = [plan(DAY, 'lunch', [resource('beef', 0.5)])];
  state._readOnly = true;
  const before = JSON.stringify(state);
  freeze(state);
  const first = predictMainCourseRunway(state, DAY);
  predictRunway(state, DAY);
  assert.deepEqual(predictMainCourseRunway(state, DAY), first);
  assert.equal(JSON.stringify(state), before);
});

test('日期、每日餐次与模拟范围参数必须有效', () => {
  const state = pantry();
  assert.throws(() => predictMainCourseRunway(state, '2026-02-30'), /有效日期/);
  assert.throws(() => predictMainCourseRunway(state, DAY, 3), /每日/);
  assert.throws(() => predictMainCourseRunway(state, DAY, 2, NaN), /预测天数/);
  assert.throws(() => predictMainCourseRunway(state, DAY, 2, -1), /预测天数/);
});

test('不同默认用量混合的小数中间余额不四舍五入制造或丢失主菜', () => {
  const state = pantry(food('a', '蛋白质', 0.019, { perMeal: 0.007 }), food('b', '蛋白质', 0.019, { perMeal: 0.001 }));
  expectCounts(predictMainCourseRunway(state, DAY), 21, 0);
  const smaller = pantry(food('a', '蛋白质', 0.017, { perMeal: 0.003 }), food('b', '蛋白质', 0.004, { perMeal: 0.004 }), food('c', '蛋白质', 0.005, { perMeal: 0.002 }), food('d', '蛋白质', 0.014, { perMeal: 0.009 }));
  expectCounts(predictMainCourseRunway(smaller, DAY), 10, 0);
  state.meals = [plan(DAY, 'dinner', [resource('b', 0.005)])];
  expectCounts(predictMainCourseRunway(state, DAY), 17, 0);
});

test('确定性小数库存回归：模拟顿数等于各主菜类别的完整份数', () => {
  let seed = 31;
  const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 2 ** 32; };
  for (let trial = 0; trial < 600; trial++) {
    const inventory = Array.from({ length: 2 + Math.floor(random() * 4) }, (_, i) => food(`food-${i}`, random() > 0.35 ? '蛋白质' : '整套食物', Math.ceil(random() * 20) / 1000, { perMeal: Math.ceil(random() * 10) / 1000 }));
    const sum = category => inventory.filter(item => item.category === category).reduce((n, item) => n + item.quantity / item.perMeal, 0);
    const result = predictMainCourseRunway(pantry(...inventory), DAY, 2, 100);
    assert.equal(result.proteinMeals, Math.floor(sum('蛋白质') + 1e-9), `protein trial ${trial}: ${JSON.stringify(inventory)}`);
    assert.equal(result.readyMeals, Math.floor(sum('整套食物') + 1e-9), `ready trial ${trial}: ${JSON.stringify(inventory)}`);
    assert.equal(result.covered, result.proteinMeals + result.readyMeals);
  }
});

test('过量预留不会为自动餐次制造可用主菜，但其他整套餐食仍可用', () => {
  const state = pantry(food('beef', '蛋白质', 2), food('bento', '整套食物', 2));
  state.meals = [plan('2026-10-12', 'dinner', [resource('beef', 3)])];
  assert.equal(forecast(state, 'beef'), -1);
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 0, 2);
  assert.deepEqual(result.last, { date: DAY, slot: 'dinner' });
  state.meals = [plan(DAY, 'lunch', []), plan(DAY, 'dinner', [resource('beef')]), plan('2026-10-14', 'lunch', []), plan('2026-10-14', 'dinner', [resource('beef', 2)])];
  const oversubscribedPlans = predictMainCourseRunway(state, DAY);
  expectCounts(oversubscribedPlans, 1, 0);
  assert.deepEqual(oversubscribedPlans.shortage, { date: '2026-10-14', slot: 'dinner', reason: 'beef不足或已过保质期（已有计划用量已优先预留）' });
});

test('已吃与外食日历槽位跳过可延后覆盖日期，不新增自动餐次或重复计数', () => {
  const state = pantry(food('beef', '蛋白质', 1));
  state.meals = [plan(DAY, 'lunch', [resource('beef')], { completed: true }), plan(DAY, 'dinner', []), plan('2026-10-14', 'lunch', []), plan('2026-10-14', 'dinner', [])];
  const result = predictMainCourseRunway(state, DAY);
  expectCounts(result, 1, 0);
  assert.equal(result.skipped, 3);
  assert.deepEqual(result.last, { date: '2026-10-15', slot: 'lunch' });
});
