import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalize, putMeal, completeMeal, reserved, forecast, TYPES } from '../model.js';
import { MEAL_SCENES, orderedMealScenes, prefillMealTemplate, upsertMealTemplate, removeMealTemplate } from '../meal-templates.js';
import { renderMealShortcuts, renderTemplateIngredients } from '../meal-shortcuts-view.js';

const DAY = '2026-10-13';
const clone = value => structuredClone(value);
const item = (id, name, category, quantity = 3, perMeal = 1, unit = '份') => ({ id, name, category, quantity, perMeal, unit, note: '', expires: '' });
function pantry() {
  const state = freshState();
  state.inventory.push(
    item('beef', '牛肉丸', '蛋白质', 3, .75), item('shrimp', '虾丸', '蛋白质', 4, 1.25),
    item('greens', '小青菜', '蔬菜', .5), item('rice', '米饭', '碳水', 2),
    item('toast', '早餐吐司', '早餐'), item('ready', '冷冻便当', '整套食物'), item('other', '未分类食材', ''),
  );
  return state;
}
const input = (overrides = {}) => ({ id: 'my-bento', name: '牛肉丸双拼便当', scene: '自制便当', mealName: '牛肉丸便当', note: '配一份青菜 ♡', resources: [{ ingredientId: 'beef', amount: 1.5 }, { ingredientId: 'shrimp', amount: .25 }], ...overrides });
function unchangedOnError(state, action, match) {
  const before = clone(state); assert.throws(action, match); assert.deepEqual(state, before);
}
function freeze(value) {
  for (const entry of Object.values(value)) if (entry && typeof entry === 'object') freeze(entry);
  return Object.freeze(value);
}

describe('餐食场景与草稿只读预填', () => {
  test('工作日与周末只改变推荐顺序，任意餐次保持全部五个场景', () => {
    assert.equal(orderedMealScenes(DAY, 'lunch')[0], '自制便当');
    assert.deepEqual(orderedMealScenes(DAY, 'dinner').slice(0, 2), ['公司食堂', '面包卡消耗']);
    assert.deepEqual(orderedMealScenes('2026-10-17', 'lunch').slice(0, 2), ['外食', '外卖']);
    for (const date of ['2026-12-31', '2027-01-01', '2027-01-02']) for (const slot of ['breakfast', 'lunch', 'dinner', 'snack']) {
      assert.deepEqual([...orderedMealScenes(date, slot)].sort(), [...MEAL_SCENES].sort());
    }
    assert.throws(() => orderedMealScenes('2026-02-30', 'lunch'), /有效日期/);
    assert.throws(() => orderedMealScenes(DAY, 'unknown'), /餐次/);
  });

  test('五种预设不自动选择食材、生成餐食或预留库存，外食与面包卡类型正确', () => {
    const state = freeze(pantry()), before = clone(state);
    for (const scene of MEAL_SCENES) {
      const draft = prefillMealTemplate(state, scene);
      assert.deepEqual(draft.resources, []);
      assert.deepEqual(draft.notices, []);
      assert.ok(TYPES.includes(draft.type));
    }
    assert.equal(prefillMealTemplate(state, '外食').type, '外出就餐');
    assert.equal(prefillMealTemplate(state, '面包卡消耗').type, '面包卡消耗');
    assert.equal(prefillMealTemplate(state, '自制便当').name, '');
    assert.deepEqual(state, before);
    assert.equal(reserved(state, 'beef'), 0);
  });

  test('自定义组合保留独立用量；食材默认用量和名称变化不修改模板', () => {
    const state = pantry(); upsertMealTemplate(state, input());
    state.inventory[0].perMeal = .5; state.inventory[0].name = '新名字牛肉丸';
    const before = clone(state), draft = prefillMealTemplate(freeze(state), 'my-bento');
    assert.equal(draft.name, '牛肉丸便当'); assert.equal(draft.note, '配一份青菜 ♡');
    assert.deepEqual(draft.resources.map(resource => resource.amount), [1.5, .25]);
    assert.equal(draft.resources[0].name, '新名字牛肉丸');
    draft.name = '本次修改'; draft.resources[0].amount = 9; draft.resources.push({ ingredientId: 'other' });
    assert.deepEqual(state, before);
    assert.equal(state.mealTemplates[0].resources[0].name, '牛肉丸');
  });

  test('缺失食材或改变单位逐项跳过，提示原因且完整保留原模板', () => {
    const state = pantry(); upsertMealTemplate(state, input());
    state.inventory = state.inventory.filter(ingredient => ingredient.id !== 'beef');
    state.inventory.find(ingredient => ingredient.id === 'shrimp').unit = '包';
    const before = clone(state), draft = prefillMealTemplate(state, 'my-bento');
    assert.deepEqual(draft.resources, []);
    assert.equal(draft.notices.length, 2);
    assert.match(draft.notices[0], /牛肉丸.*先跳过/);
    assert.match(draft.notices[1], /虾丸.*份.*包.*核对用量/);
    assert.deepEqual(state, before);
    assert.equal(normalize(state).locked, false, '模板快照失效不锁定既有记录');
  });

  test('库存不足仍能预填，不自动增加计划、不扣库存、不改变已有餐食', () => {
    const state = pantry(); upsertMealTemplate(state, input());
    state.inventory[0].quantity = 0;
    const before = clone(state), draft = prefillMealTemplate(state, 'my-bento');
    assert.equal(draft.resources[0].amount, 1.5);
    assert.deepEqual(state, before);
    assert.equal(state.meals.length, 0); assert.equal(forecast(state, 'beef'), 0);
    assert.throws(() => prefillMealTemplate(state, 'gone-template'), /已经不在/);
  });
});

describe('显式保存和整理模板不影响记录与库存', () => {
  test('从现有餐食资源行保存快照，返回值独立；CRUD只改mealTemplates', () => {
    const state = pantry();
    putMeal(state, { id: 'meal', date: DAY, slot: 'lunch', name: '旧便当', type: '自制便当', note: '旧备注', protein: '', resources: [{ ingredientId: 'beef', amount: .75 }] });
    completeMeal(state, 'meal');
    state.diaries.push({ date: DAY, mood: '开心', text: '原来的故事', joy: '' });
    const before = clone(state), saved = upsertMealTemplate(state, input());
    assert.deepEqual(saved.resources[0], { ingredientId: 'beef', name: '牛肉丸', amount: 1.5, unit: '份' });
    const { mealTemplates: ignored, ...currentRest } = state;
    const { mealTemplates: oldIgnored, ...beforeRest } = before;
    assert.deepEqual(currentRest, beforeRest);
    saved.resources[0].amount = 100;
    assert.equal(state.mealTemplates[0].resources[0].amount, 1.5);
    upsertMealTemplate(state, input({ name: '整理后的便当', resources: [{ ingredientId: 'beef', amount: .33334 }] }));
    assert.equal(state.mealTemplates.length, 1); assert.equal(state.mealTemplates[0].resources[0].amount, .333);
    assert.equal(removeMealTemplate(state, 'my-bento'), true);
    assert.equal(removeMealTemplate(state, 'my-bento'), false);
    assert.deepEqual(state, before, '删模板不能返还或扣减餐食库存');
  });

  test('空餐名组合模板、无库存场景以及已缺失的完整快照可保存并重新整理', () => {
    const state = pantry();
    upsertMealTemplate(state, input({ mealName: '', resources: [] }));
    assert.equal(prefillMealTemplate(state, 'my-bento').name, '');
    const ghost = { ingredientId: 'old-stock', name: '旧库存食材', unit: '份', amount: 2 };
    upsertMealTemplate(state, input({ id: 'ghost', name: '留着的小纸条', scene: '外食', resources: [ghost] }));
    assert.equal(prefillMealTemplate(state, 'ghost').resources.length, 0);
    upsertMealTemplate(state, { ...clone(state.mealTemplates.find(template => template.id === 'ghost')), name: '重新起个名字' });
    assert.deepEqual(state.mealTemplates.find(template => template.id === 'ghost').resources, [ghost]);
    assert.equal(prefillMealTemplate(state, 'ghost').type, '外出就餐');
    assert.equal(normalize(state).locked, false);
  });

  test('无ID显式保存才创建模板；导入导出往返保留新字段和原始库存', () => {
    const state = pantry(), template = input(); delete template.id;
    const saved = upsertMealTemplate(state, template);
    assert.ok(saved.id.length > 0);
    const restored = normalize(JSON.parse(JSON.stringify(state)));
    assert.equal(restored.locked, false); assert.deepEqual(restored.state, state);
    assert.equal(restored.state.inventory[0].quantity, 3);
  });

  test('非法用量、重复食材、未知字段、超长字段等失败全部原子化', () => {
    const state = pantry(); upsertMealTemplate(state, input());
    const cases = [
      input({ name: '' }), input({ name: '长'.repeat(61) }), input({ mealName: '长'.repeat(81) }),
      input({ note: '长'.repeat(201) }), input({ note: null }), input({ mealName: null }),
      input({ scene: '强制打卡' }), input({ id: ' whitespace ' }),
      input({ unexpected: true }), input({ resources: null }),
      input({ resources: [{ ingredientId: 'beef', amount: 0 }] }),
      input({ resources: [{ ingredientId: 'beef', amount: .00001 }] }),
      input({ resources: [{ ingredientId: 'beef', amount: -1 }] }),
      input({ resources: [{ ingredientId: 'beef', amount: NaN }] }),
      input({ resources: [{ ingredientId: 'beef', amount: Infinity }] }),
      input({ resources: [{ ingredientId: 'beef', amount: 1e10 }] }),
      input({ resources: [{ ingredientId: 'beef' }] }),
      input({ resources: [{ ingredientId: 'beef', amount: 1, unsafe: true }] }),
      input({ resources: [{ ingredientId: 'ghost', amount: 1 }] }),
      input({ resources: [{ ingredientId: 'beef', amount: 1 }, { ingredientId: 'beef', amount: 2 }] }),
    ];
    for (const candidate of cases) unchangedOnError(state, () => upsertMealTemplate(state, candidate));
  });

  test('保护状态或已损坏模板禁止CRUD，不能覆盖原有本地内容', () => {
    const state = pantry(); upsertMealTemplate(state, input()); state._readOnly = true;
    unchangedOnError(state, () => upsertMealTemplate(state, input({ name: '替换' })), error => error.code === 'PROTECTED_DATA');
    unchangedOnError(state, () => removeMealTemplate(state, 'my-bento'), error => error.code === 'PROTECTED_DATA');
    const broken = pantry(); upsertMealTemplate(broken, input()); broken.mealTemplates[0].resources[0].amount = -5;
    unchangedOnError(broken, () => upsertMealTemplate(broken, input()));
    unchangedOnError(broken, () => removeMealTemplate(broken, 'my-bento'));
  });
});

describe('紧凑餐食纸条的安全视图', () => {
  test('模板名称、ID、保存草稿和库存字段全部按纯文本转义', () => {
    const evil = '<img src=x onerror="alert(1)"> & \'便当\'';
    const state = pantry(); upsertMealTemplate(state, input({ id: 'quote"<&', name: evil, resources: [] }));
    const before = clone(state), html = renderMealShortcuts(freeze(state), DAY, 'lunch', { selectedTemplateId: 'quote"<&', templateName: evil });
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt; &amp; &#39;便当&#39;'));
    assert.ok(html.includes('data-meal-template="quote&quot;&lt;&amp;"'));
    assert.ok(!html.includes('<img src=x'));
    assert.match(html, /name="mealTemplateName" maxlength="60"/);
    assert.match(html, /type="button" class="pill" data-save-meal-template/);
    assert.deepEqual(state, before);
    const inventory = [item('quote"<&', evil, '蛋白质', 2, 1, '份<&')];
    const picker = renderTemplateIngredients(inventory, '自制便当', ['quote"<&']);
    assert.ok(picker.includes('data-template-ingredient="quote&quot;&lt;&amp;"'));
    assert.ok(picker.includes('value="quote&quot;&lt;&amp;" checked'));
    assert.ok(!picker.includes('<img src=x'));
    assert.ok(picker.includes('份&lt;&amp;'));
  });

  test('便当三组可多选且不混入早餐或整套食物；其他场景只推荐可选整套库存', () => {
    const inventory = freeze(pantry().inventory);
    const html = renderTemplateIngredients(inventory, '自制便当', new Set(['beef', 'shrimp']));
    assert.equal((html.match(/class="meal-component-group"/g) || []).length, 3);
    assert.ok(html.includes('data-template-ingredient="beef" value="beef" checked'));
    assert.ok(html.includes('data-template-ingredient="shrimp" value="shrimp" checked'));
    assert.ok(!html.includes('data-template-ingredient="toast"'));
    assert.ok(!html.includes('data-template-ingredient="ready"'));
    assert.ok(!html.includes(' required'));
    for (const scene of MEAL_SCENES.filter(scene => scene !== '自制便当')) {
      const ready = renderTemplateIngredients(inventory, scene, []);
      assert.ok(ready.includes('data-template-ingredient="ready"'));
      assert.ok(!ready.includes('data-template-ingredient="toast"'));
      assert.ok(!ready.includes('data-template-ingredient="beef"'));
    }
  });

  test('缺分类不阻止保存；高级内容默认折叠，所有显式动作都是普通按钮', () => {
    const state = freshState(), html = renderMealShortcuts(state, DAY, 'dinner');
    assert.ok(html.includes('data-meal-scene="公司食堂"'));
    assert.ok(html.includes('data-manage-meal-templates'));
    assert.ok(!html.includes('class="meal-template-fold" open'));
    const picker = renderTemplateIngredients([], '自制便当', []);
    assert.ok(picker.includes('不影响保存'));
    assert.ok(picker.includes('也可以留空'));
    assert.ok(!picker.includes(' required'));
    assert.equal(renderTemplateIngredients([], '无效场景'), '');
    assert.deepEqual(state, freshState());
  });
});
