import { STICKER_IDS } from './stickers.js';

export const MEAL_SCENES = Object.freeze(['自制便当', '公司食堂', '面包卡消耗', '外食', '外卖']);
const CATEGORY_DEFAULTS = Object.freeze({
  study: Object.freeze([
    { id: 'study-japanese', name: '日语', active: true },
    { id: 'study-drawing', name: '画画', active: true },
    { id: 'study-3d', name: '3D建模', active: true },
  ]),
  exercise: Object.freeze([
    { id: 'exercise-strength', name: '力量训练', active: true },
    { id: 'exercise-hiking', name: '徒步', active: true },
    { id: 'exercise-cardio', name: '有氧训练', active: true },
  ]),
});
export const defaultActivityCategories = () => ({
  study: CATEGORY_DEFAULTS.study.map(category => ({ ...category })),
  exercise: CATEGORY_DEFAULTS.exercise.map(category => ({ ...category })),
});

const objectOK = value => value && typeof value === 'object' && !Array.isArray(value);
const knownFields = (value, fields) => Object.keys(value).every(key => fields.includes(key));
const idOK = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && value === value.trim();
const textOK = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const round = value => Math.round((value + Number.EPSILON) * 1000) / 1000;
const warn = (warnings, message) => warnings.push(`${message}，已保护原文件`);

/** New fields stay independent of inventory transactions and never write storage. */
export function normalizeExtras(raw, warnings = []) {
  const result = { mealTemplates: [], activityCategories: defaultActivityCategories(), recentStickerIds: [] };
  const required = raw.schemaVersion >= 4;
  if (raw.mealTemplates === undefined && !required) {
    // Old versions have no quick templates; add their empty defaults in memory.
  } else if (!Array.isArray(raw.mealTemplates)) warn(warnings, '常用餐食模板列表缺失或格式异常');
  else {
    const ids = new Set();
    for (const template of raw.mealTemplates) {
      if (!objectOK(template) || !idOK(template.id) || ids.has(template.id) || !textOK(template.name, 60, true) || !MEAL_SCENES.includes(template.scene) || !textOK(template.mealName, 80) || !textOK(template.note, 200) || !Array.isArray(template.resources)) {
        warn(warnings, '一条常用餐食模板异常或重复'); continue;
      }
      ids.add(template.id);
      if (!knownFields(template, ['id', 'name', 'scene', 'mealName', 'note', 'resources'])) warn(warnings, '常用餐食模板含有本版本不认识的内容');
      const resourceIds = new Set(), resources = [];
      for (const resource of template.resources) {
        if (!objectOK(resource) || !idOK(resource.ingredientId) || resourceIds.has(resource.ingredientId) || !textOK(resource.name, 60, true) || !textOK(resource.unit, 12, true) || typeof resource.amount !== 'number' || !Number.isFinite(resource.amount) || resource.amount > 1e9 || round(resource.amount) <= 0) {
          warn(warnings, '常用餐食模板的食材关联异常或重复'); continue;
        }
        resourceIds.add(resource.ingredientId);
        if (!knownFields(resource, ['ingredientId', 'name', 'amount', 'unit'])) warn(warnings, '常用餐食模板的食材关联含有本版本不认识的内容');
        // Templates intentionally retain snapshots of deleted/out-of-stock ingredients.
        resources.push({ ingredientId: resource.ingredientId, name: resource.name.trim(), amount: round(resource.amount), unit: resource.unit.trim() });
      }
      result.mealTemplates.push({ id: template.id, name: template.name.trim(), scene: template.scene, mealName: template.mealName.trim(), note: template.note.trim(), resources });
    }
  }
  if (raw.activityCategories === undefined && !required) {
    // IDs are deterministic so repeated old-data migration has the same result.
  } else if (!objectOK(raw.activityCategories)) warn(warnings, '学习运动快捷类别缺失或格式异常');
  else {
    if (!knownFields(raw.activityCategories, ['study', 'exercise'])) warn(warnings, '学习运动快捷类别含有本版本不认识的内容');
    for (const kind of ['study', 'exercise']) {
      const categories = raw.activityCategories[kind];
      if (!Array.isArray(categories)) { warn(warnings, '学习或运动类别列表缺失或格式异常'); continue; }
      result.activityCategories[kind] = [];
      const ids = new Set();
      for (const category of categories) {
        if (!objectOK(category) || !idOK(category.id) || ids.has(category.id) || !textOK(category.name, 40, true) || typeof category.active !== 'boolean') {
          warn(warnings, '一条学习或运动类别异常或重复'); continue;
        }
        ids.add(category.id);
        if (!knownFields(category, ['id', 'name', 'active'])) warn(warnings, '学习或运动类别含有本版本不认识的内容');
        result.activityCategories[kind].push({ id: category.id, name: category.name.trim(), active: category.active });
      }
    }
  }
  if (raw.recentStickerIds === undefined && !required) {
    // Opening the sticker picker must not manufacture recently-used records.
  } else if (!Array.isArray(raw.recentStickerIds) || raw.recentStickerIds.length > 12 || new Set(raw.recentStickerIds).size !== raw.recentStickerIds.length || raw.recentStickerIds.some(id => !STICKER_IDS.includes(id))) {
    warn(warnings, '最近使用贴纸含有未知、重复或超量的贴纸');
    result.recentStickerIds = Array.isArray(raw.recentStickerIds) ? [...new Set(raw.recentStickerIds.filter(id => STICKER_IDS.includes(id)))].slice(0, 12) : [];
  } else result.recentStickerIds = [...raw.recentStickerIds];
  return result;
}
