import { MEAL_SCENES, orderedMealScenes } from './meal-templates.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const SCENE_ART = Object.freeze({
  '自制便当': './assets/share-art/strawberry-bento.svg',
  '公司食堂': './assets/share-art/strawberry-soup.svg',
  '面包卡消耗': './assets/share-art/strawberry-croissant.svg',
  '外食': './assets/share-art/cafe-place-setting.svg',
  '外卖': './assets/food/bento.svg',
});
const COMPONENTS = Object.freeze([
  { label: '蛋白质', english: 'PROTEIN', empty: '这里暂时没有蛋白质食材，也可以先写菜名。' },
  { label: '蔬菜', english: 'VEGGIES', empty: '蔬菜可以先写进备注，不影响保存。' },
  { label: '碳水', english: 'LITTLE STAPLES', empty: '米饭、面条之类，也可以写进备注。' },
]);

/** View-only: selecting a paper slip is a draft action. App wiring decides
 * when to prefill or explicitly save it; rendering never touches state. */
export function renderMealShortcuts(state, date, slot, options = {}) {
  const templates = Array.isArray(state?.mealTemplates) ? state.mealTemplates : [];
  const selectedTemplate = templates.find(template => template.id === options.selectedTemplateId);
  const scene = MEAL_SCENES.includes(options.scene) ? options.scene : selectedTemplate?.scene || '';
  const scenes = orderedMealScenes(date, slot);
  const breakfast = options.showBreakfast === false ? '' : `<button type="button" class="meal-scene-slip" data-meal-breakfast aria-pressed="${!!options.breakfastSelected}"><img src="./assets/share-art/strawberry-croissant.svg" alt="" width="25" height="25"><span>早餐</span></button>`;
  const cards = breakfast + scenes.map(name => `<button type="button" class="meal-scene-slip" data-meal-scene="${escape(name)}" aria-pressed="${scene === name && !selectedTemplate && !options.breakfastSelected}"><img src="${SCENE_ART[name]}" alt="" width="25" height="25"><span>${escape(name)}</span></button>`).join('');
  const saved = templates.map(template => `<li class="meal-template-item"><button type="button" class="meal-template-select" data-meal-template="${escape(template.id)}" aria-pressed="${options.selectedTemplateId === template.id}"><span class="meal-template-name">${escape(template.name)}</span><small>${escape(template.scene)}${template.resources.length ? ` · ${template.resources.length} 种食材` : ' · 随心记录'}</small></button><button class="text-button meal-template-manage" type="button" data-manage-meal-templates="${escape(template.id)}" aria-label="整理模板${escape(template.name)}">整理</button></li>`).join('');
  return `<section class="meal-shortcuts" aria-label="餐食快捷纸条"><div class="meal-shortcuts-heading"><span>先挑一张餐食纸条 ♡</span><small>MEAL SHORTCUTS</small></div><div class="meal-scene-slips" role="group" aria-label="餐食纸条">${cards}</div><details class="meal-template-fold" ${options.templatesOpen ? 'open' : ''}><summary><span>我的常用组合</span><small>${templates.length ? `${templates.length} 张小纸条` : '把喜欢的搭配收好'}</small></summary><div class="meal-template-body">${saved ? `<ul class="meal-template-list">${saved}</ul>` : '<p class="meal-template-empty">满意的组合可以收成小纸条，下次再用 (｡•ᴗ•｡)</p>'}<div class="meal-template-save"><label for="meal-template-name">给这份组合起个名字<input id="meal-template-name" name="mealTemplateName" maxlength="60" autocomplete="off" placeholder="例如：牛肉丸蔬菜便当" value="${escape(options.templateName || '')}"></label><button type="button" class="pill" data-save-meal-template>收为常用组合</button></div><p class="meal-template-help">这里只保存模板；餐食与库存会在收进手账时按原来的规则处理。</p><button type="button" class="text-button meal-template-library" data-manage-meal-templates>整理全部小纸条 ↗</button></div></details></section>`;
}

function ingredientPills(items, selectedIds) {
  const selected = new Set(selectedIds instanceof Set ? selectedIds : Array.isArray(selectedIds) ? selectedIds : []);
  return items.map(item => `<label class="meal-template-ingredient"><input type="checkbox" data-template-ingredient="${escape(item.id)}" value="${escape(item.id)}" ${selected.has(item.id) ? 'checked' : ''}><span><strong>${escape(item.name)}</strong><small>每餐 ${escape(item.perMeal)} ${escape(item.unit)}</small></span></label>`).join('');
}

/** Bento components never borrow the breakfast inventory category. Ready meals
 * remain optional in the other scenes; uncategorized items can still be chosen
 * from the existing inventory editor below this compact picker. */
export function renderTemplateIngredients(inventory, scene, selectedIds = []) {
  const items = Array.isArray(inventory) ? inventory : [];
  if (!MEAL_SCENES.includes(scene) && scene !== '早餐') return '';
  const groups = scene === '早餐' ? [{ label: '早餐', english: 'A LITTLE BREAKFAST', empty: '早餐库存还没收好，也可以先写喜欢的早餐。' }]
    : scene === '自制便当' ? COMPONENTS
    : [{ label: '整套食物', english: 'READY TO EAT', empty: '没有整套库存也没关系，可以直接写这餐吃了什么。' }];
  return `<section class="meal-template-ingredients" aria-label="${scene === '早餐' ? '可选的早餐库存' : scene === '自制便当' ? '便当组合食材' : '可选的整套库存'}">${groups.map(group => {
    const choices = items.filter(item => item.category === group.label);
    return `<details class="meal-component-group" data-component="${escape(group.label)}"><summary><span>${escape(group.label)}</span><small>${choices.length ? `${choices.length} 种可选` : '随心搭配'}</small></summary><div class="meal-component-body"><span class="meal-component-label">${group.english}</span>${choices.length ? `<div class="meal-component-choices">${ingredientPills(choices, selectedIds)}</div>` : `<p>${group.empty}</p>`}</div></details>`;
  }).join('')}<p class="meal-template-help">每组都能多选，也可以留空；用量还能在下方调整。其他食材可从库存继续添加。</p></section>`;
}
