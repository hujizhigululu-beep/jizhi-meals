import { normalize, parseDate, uid, round } from './model.js';
import { MEAL_SCENES, normalizeExtras } from './schema-extra.js';

export { MEAL_SCENES } from './schema-extra.js';
const objectOK = value => value && typeof value === 'object' && !Array.isArray(value);
const idOK = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && value === value.trim();
const resourceFields = ['ingredientId', 'name', 'amount', 'unit'];
const templateFields = ['id', 'name', 'scene', 'mealName', 'note', 'resources'];
const sceneType = scene => scene === '外食' ? '外出就餐' : scene;
const copyResource = resource => ({ ingredientId: resource.ingredientId, name: resource.name, amount: resource.amount, unit: resource.unit });
const copyTemplate = template => ({ ...template, resources: template.resources.map(copyResource) });
function protectedError(message = '原数据已保护，请先保存原文件并恢复有效备份。') {
  const error = new Error(message); error.code = 'PROTECTED_DATA'; return error;
}
function assertMutable(state) {
  if (!objectOK(state) || state._readOnly) throw protectedError();
  const checked = normalize(state);
  if (checked.locked) throw protectedError('当前记录或模板格式异常，已停止修改；请保留原文件并恢复有效备份。');
}
function validatedTemplate(candidate) {
  const warnings = [];
  // Version 3 avoids requiring unrelated schema-4 arrays in this local check.
  const extras = normalizeExtras({ schemaVersion: 3, mealTemplates: [candidate] }, warnings);
  if (warnings.length || extras.mealTemplates.length !== 1) throw new Error('请填好模板名称、餐食场景和有效用量；名称最多 60 字，同一食材只选一次。');
  return extras.mealTemplates[0];
}

/** Recommendations only change button order. They never create a meal, a plan
 * or a stock reservation, and work for every valid date and meal slot. */
export function orderedMealScenes(date, slot) {
  const day = parseDate(date);
  if (!day || !['breakfast', 'lunch', 'dinner', 'snack'].includes(slot)) throw new Error('请选择有效日期和餐次。');
  const weekend = day.getDay() === 0 || day.getDay() === 6;
  const first = weekend ? ['外食', '外卖']
    : slot === 'lunch' ? ['自制便当']
    : slot === 'dinner' ? ['公司食堂', '面包卡消耗'] : [];
  return [...first, ...MEAL_SCENES.filter(scene => !first.includes(scene))];
}

/** Read-only editor draft. It keeps template quantities even when inventory's
 * default per-meal quantity changes. Missing/changed-unit links are explained,
 * never guessed and never silently passed to stock deduction. */
export function prefillMealTemplate(state, idOrScene) {
  const templates = Array.isArray(state?.mealTemplates) ? state.mealTemplates : [];
  const stored = templates.find(template => template.id === idOrScene);
  if (!stored) {
    if (!MEAL_SCENES.includes(idOrScene)) throw new Error('这张餐食模板已经不在了，请重新选择。');
    return { name: idOrScene === '自制便当' ? '' : idOrScene, type: sceneType(idOrScene), note: '', resources: [], notices: [] };
  }
  const template = validatedTemplate(stored);
  const inventory = Array.isArray(state?.inventory) ? state.inventory : [];
  const resources = [], notices = [];
  for (const resource of template.resources) {
    const item = inventory.find(ingredient => ingredient.id === resource.ingredientId);
    if (!item) {
      notices.push(`「${resource.name}」已不在小冰箱里，这次先跳过；可以另选食材。`);
    } else if (item.unit !== resource.unit) {
      notices.push(`「${resource.name}」的单位从「${resource.unit}」变成了「${item.unit}」，这次先跳过；请重新选择并核对用量。`);
    } else {
      resources.push({ ingredientId: item.id, name: item.name, amount: resource.amount, unit: item.unit });
    }
  }
  return { name: template.mealName, type: sceneType(template.scene), note: template.note, resources, notices };
}

/** Explicit save only. Minimal editor rows get current name/unit snapshots;
 * full snapshots can retain an ingredient that no longer exists in inventory.
 * Validation finishes before the one assignment, leaving all meals, diary and
 * actual/forecast stock untouched on both successful and failed template edits. */
export function upsertMealTemplate(state, input) {
  assertMutable(state);
  if (!objectOK(input) || Object.keys(input).some(key => !templateFields.includes(key))
    || input.id !== undefined && !idOK(input.id)
    || input.resources !== undefined && !Array.isArray(input.resources)) {
    throw new Error('餐食模板格式不太对，请重新整理后保存。');
  }
  const resources = (input.resources || []).map(resource => {
    if (!objectOK(resource) || Object.keys(resource).some(key => !resourceFields.includes(key))
      || !idOK(resource.ingredientId) || typeof resource.amount !== 'number'
      || !Number.isFinite(resource.amount) || resource.amount > 1e9 || round(resource.amount) <= 0) {
      throw new Error('请为每种模板食材填写有效用量，同一食材只需关联一次。');
    }
    const item = state.inventory.find(ingredient => ingredient.id === resource.ingredientId);
    return { ingredientId: resource.ingredientId,
      name: resource.name === undefined ? item?.name : resource.name,
      amount: round(resource.amount), unit: resource.unit === undefined ? item?.unit : resource.unit };
  });
  const candidate = validatedTemplate({
    id: input.id || uid(), name: input.name, scene: input.scene,
    mealName: input.mealName === undefined ? '' : input.mealName,
    note: input.note === undefined ? '' : input.note, resources,
  });
  const previous = Array.isArray(state.mealTemplates) ? state.mealTemplates : [];
  const exists = previous.some(template => template.id === candidate.id);
  const next = exists ? previous.map(template => template.id === candidate.id ? candidate : template) : [...previous, candidate];
  const checked = normalize({ ...state, mealTemplates: next });
  if (checked.locked) throw protectedError('这次模板修改没有保存，请先核对记录或备份中的异常内容。');
  state.mealTemplates = next;
  return copyTemplate(candidate);
}

export function removeMealTemplate(state, id) {
  assertMutable(state);
  if (!idOK(id)) throw new Error('请选择要删除的餐食模板。');
  const previous = Array.isArray(state.mealTemplates) ? state.mealTemplates : [];
  if (!previous.some(template => template.id === id)) return false;
  const next = previous.filter(template => template.id !== id);
  if (normalize({ ...state, mealTemplates: next }).locked) throw protectedError();
  state.mealTemplates = next;
  return true;
}
