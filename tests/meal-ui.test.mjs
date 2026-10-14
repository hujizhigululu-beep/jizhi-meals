import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, TYPES, normalize, putMeal, completeMeal } from '../model.js';
import { MEAL_SCENES, prefillBreakfastMeal } from '../meal-templates.js';
import { renderMealShortcuts, renderTemplateIngredients } from '../meal-shortcuts-view.js';

test('早餐快捷草稿使用早餐餐次与既有其他类型，不添加数据枚举或预扣库存', () => {
  const state = freshState();
  state.inventory.push({ id: 'toast', name: '吐司', category: '早餐', unit: '片', quantity: 4, perMeal: 1, note: '', expires: '' });
  const before = structuredClone(state), draft = prefillBreakfastMeal();
  assert.equal(draft.slot, 'breakfast');
  assert.equal(draft.type, '其他');
  assert.ok(TYPES.includes(draft.type));
  assert.ok(!TYPES.includes('早餐'));
  assert.ok(!MEAL_SCENES.includes('早餐'));
  assert.deepEqual(draft.resources, []);
  assert.deepEqual(state, before);
  draft.resources.push({ ingredientId: 'toast', amount: 1 });
  putMeal(state, { ...draft, id: 'breakfast', date: '2026-10-14', name: '我的早餐', protein: '' });
  assert.equal(state.inventory[0].quantity, 4);
  assert.equal(state.meals[0].slot, 'breakfast');
  completeMeal(state, 'breakfast');
  completeMeal(state, 'breakfast');
  assert.equal(state.inventory[0].quantity, 3);
  assert.equal(normalize(state).locked, false);
  assert.deepEqual(prefillBreakfastMeal().resources, [], '每次打开返回独立草稿');
});

test('早餐纸条独立于餐食场景显示，可在既有午晚餐编辑器隐藏', () => {
  const state = freshState();
  for (const slot of ['breakfast', 'lunch', 'dinner', 'snack']) {
    const html = renderMealShortcuts(state, '2026-10-14', slot, { breakfastSelected: true });
    assert.match(html, /data-meal-breakfast aria-pressed="true"/);
    assert.ok(!html.includes('data-meal-scene="早餐"'));
    for (const scene of MEAL_SCENES) assert.ok(html.includes(`data-meal-scene="${scene}"`));
  }
  assert.ok(!renderMealShortcuts(state, '2026-10-14', 'lunch', { showBreakfast: false }).includes('data-meal-breakfast'));
  assert.deepEqual(state, freshState());
});

test('早餐库存选择仅提供早餐分类，自制便当继续使用原三类搭配', () => {
  const inventory = [
    { id: 'toast', name: '早餐吐司', category: '早餐', unit: '片', perMeal: 2 },
    { id: 'beef', name: '牛肉', category: '蛋白质', unit: '份', perMeal: 1 },
  ];
  const html = renderTemplateIngredients(inventory, '早餐', ['toast']);
  assert.match(html, /可选的早餐库存/);
  assert.match(html, /data-template-ingredient="toast" value="toast" checked/);
  assert.ok(!html.includes('data-template-ingredient="beef"'));
  const bento = renderTemplateIngredients(inventory, '自制便当');
  assert.ok(bento.includes('data-template-ingredient="beef"'));
  assert.ok(!bento.includes('data-template-ingredient="toast"'));
  assert.match(renderTemplateIngredients([], '早餐'), /也可以先写喜欢的早餐/);
});
