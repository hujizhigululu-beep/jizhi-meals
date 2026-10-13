import { normalize, uid } from './model.js';
import { defaultActivityCategories } from './schema-extra.js';

const KINDS = ['study', 'exercise'];
const own = (value, key) => Object.hasOwn(value, key);
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 100 && id === id.trim();
function validKind(kind) {
  if (!KINDS.includes(kind)) throw new Error('请选择学习或运动类别。');
}
function assertMutable(state) {
  if (state?._readOnly || normalize(state).locked) {
    const error = new Error('原数据已保护，请先保存原文件并恢复有效备份。');
    error.code = 'PROTECTED_DATA'; throw error;
  }
}
function lists(state) { return state.activityCategories || defaultActivityCategories(); }

/** Independent, sorted read views. Archived categories remain available to managers. */
export function getActivityCategories(state, kind, { includeInactive = true } = {}) {
  validKind(kind);
  return structuredClone((lists(state)[kind] || []).filter(category => includeInactive || category.active));
}
export function getActivityCategory(state, kind, id) {
  validKind(kind);
  return structuredClone((lists(state)[kind] || []).find(category => category.id === id) || null);
}

/** Names change in place; IDs and historical content/snapshots never change. */
export function upsertActivityCategory(state, kind, input) {
  assertMutable(state); validKind(kind);
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.keys(input).some(key => !['id', 'name', 'active'].includes(key))) throw new Error('请核对类别名称和状态。');
  if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 40) throw new Error('类别名称请填写 1 至 40 个字。');
  if (own(input, 'active') && typeof input.active !== 'boolean') throw new Error('类别状态请使用启用或停用。');
  const id = input.id ?? uid();
  if (!validId(id)) throw new Error('类别编号格式异常，请重新打开编辑。');
  const categories = structuredClone(lists(state));
  const previous = categories[kind].find(category => category.id === id);
  const next = { id, name: input.name.trim(), active: own(input, 'active') ? input.active : previous?.active ?? true };
  if (previous) categories[kind] = categories[kind].map(category => category.id === id ? next : category);
  else categories[kind].push(next);
  state.activityCategories = categories;
  return structuredClone(next);
}

/** Archive instead of deleting: past records keep their category relationship. */
export function setActivityCategoryActive(state, kind, id, active) {
  assertMutable(state); validKind(kind);
  if (!validId(id) || typeof active !== 'boolean') throw new Error('请核对类别和启用状态。');
  const categories = structuredClone(lists(state));
  const previous = categories[kind].find(category => category.id === id);
  if (!previous) throw new Error('这个类别暂时找不到了，请重新打开列表。');
  previous.active = active;
  state.activityCategories = categories;
  return structuredClone(previous);
}

/** Accept 'up'/'down', or a zero-based destination index. No record is rewritten. */
export function moveActivityCategory(state, kind, id, destination) {
  assertMutable(state); validKind(kind);
  if (!validId(id)) throw new Error('类别编号格式异常，请重新打开列表。');
  const categories = structuredClone(lists(state));
  const list = categories[kind], from = list.findIndex(category => category.id === id);
  if (from < 0) throw new Error('这个类别暂时找不到了，请重新打开列表。');
  const to = destination === 'up' ? from - 1 : destination === 'down' ? from + 1 : destination;
  if (!Number.isInteger(to)) throw new Error('请选择有效的类别排序位置。');
  if ((destination === 'up' || destination === 'down') && (to < 0 || to >= list.length)) return false;
  if (to < 0 || to >= list.length) throw new Error('类别排序位置超出了列表范围。');
  if (to === from) return false;
  const [category] = list.splice(from, 1); list.splice(to, 0, category);
  state.activityCategories = categories;
  return true;
}
