import { ALL_SLOTS, parseDate, uid, normalize, round } from './model.js';
import { STICKER_IDS } from './stickers.js';
import { getActivityCategory } from './activity-shortcuts.js';

export const ACTIVITY_KINDS = Object.freeze(['study', 'exercise']);
const emptyActivity = () => ({ checked: false, items: [], categoryIds: [], manualChecked: false });
const emptyRecord = date => ({ date, study: emptyActivity(), exercise: emptyActivity(), stickerIds: [] });
const own = (value, key) => Object.hasOwn(value, key);
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 100 && id === id.trim();
function validDate(date) { if (!parseDate(date)) throw new Error('请选择有效日期，再收好这一天。'); }
function validKind(kind) { if (!ACTIVITY_KINDS.includes(kind)) throw new Error('请选择学习或运动打卡。'); }
function assertMutable(state) {
  if (state?._readOnly || normalize(state).locked) {
    const error = new Error('原数据已保护，请先保存原文件并恢复有效备份。'); error.code = 'PROTECTED_DATA'; throw error;
  }
}
function writeRecord(state, record) {
  // No empty date is created simply by opening it; empty results need no stored row.
  state.dayRecords = (state.dayRecords || []).filter(row => row.date !== record.date);
  if (record.study.checked || record.exercise.checked || record.study.items.length || record.exercise.items.length || record.study.categoryIds.length || record.exercise.categoryIds.length || record.stickerIds.length) state.dayRecords.push(record);
  return record;
}
/** Return an independent read view; inspecting a blank date never creates data. */
export function getDayRecord(state, date) {
  validDate(date);
  const day = structuredClone(state.dayRecords?.find(row => row.date === date) || emptyRecord(date));
  for (const kind of ACTIVITY_KINDS) {
    const activity = day[kind] || emptyActivity();
    // A legacy check-in remains a manual check-in; reading never persists a migration.
    if (!Array.isArray(activity.categoryIds)) activity.categoryIds = [];
    if (typeof activity.manualChecked !== 'boolean') activity.manualChecked = activity.checked === true;
    day[kind] = activity;
  }
  return day;
}
export function toggleCheckin(state, date, kind) {
  assertMutable(state); validDate(date); validKind(kind);
  const record = getDayRecord(state, date);
  const activity = record[kind];
  if (activity.checked) {
    activity.manualChecked = false; activity.checked = false;
  } else {
    activity.manualChecked = true; activity.checked = true;
  }
  writeRecord(state, record);
  return record[kind].checked;
}

/** Category chips check in immediately; deselection keeps all optional details. */
export function toggleCategoryCheckin(state, date, kind, categoryId) {
  assertMutable(state); validDate(date); validKind(kind);
  if (!validId(categoryId)) throw new Error('请选择有效的学习或运动类别。');
  const category = getActivityCategory(state, kind, categoryId);
  if (!category) throw new Error('这个类别暂时找不到了，请重新打开列表。');
  const record = getDayRecord(state, date), activity = record[kind];
  const selected = activity.checked && activity.categoryIds.includes(categoryId);
  if (!activity.checked) activity.categoryIds = [];
  if (selected) activity.categoryIds = activity.categoryIds.filter(id => id !== categoryId);
  else {
    if (!category.active) throw new Error('这个类别已停用，可以先在类别管理中重新启用。');
    activity.categoryIds.push(categoryId);
    if (!activity.items.some(item => item.categoryId === categoryId)) activity.items.push({ id: uid(), content: category.name, minutes: null, note: '', categoryId, categoryName: category.name });
  }
  activity.checked = activity.manualChecked || activity.categoryIds.length > 0;
  writeRecord(state, record);
  return !selected;
}

/** Only checked days and their selected category details count in statistics/share. */
export function activeActivityItems(activity) {
  if (activity?.checked !== true) return [];
  const selected = new Set(activity.categoryIds || []);
  return (activity.items || []).filter(item => !item.categoryId || selected.has(item.categoryId));
}

export function putActivity(state, date, kind, item) {
  assertMutable(state); validDate(date); validKind(kind);
  if (!item || typeof item !== 'object' || Array.isArray(item) || Object.keys(item).some(key => !['id', 'content', 'minutes', 'note', 'categoryId', 'categoryName', 'distanceKm'].includes(key))) throw new Error('请核对学习或运动详情。');
  const content = item.content ?? '', note = item.note ?? '';
  if (typeof content !== 'string' || content.length > 200 || typeof note !== 'string' || note.length > 1000) throw new Error('内容最多200字，备注最多1000字，请使用文字填写。');
  const minutes = item.minutes == null || item.minutes === '' ? null : item.minutes;
  if (!(minutes === null || Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440)) throw new Error('时长请填写0至1440的整数分钟，也可以留空。');
  const id = item.id ?? uid();
  if (!validId(id)) throw new Error('记录编号格式异常，请重新打开编辑。');
  const record = getDayRecord(state, date);
  const previous = record[kind].items.find(row => row.id === id);
  const next = { id, content: content.trim(), minutes, note: note.trim() };
  const categoryId = own(item, 'categoryId') && item.categoryId !== undefined ? item.categoryId : previous?.categoryId;
  if (own(item, 'categoryName') && item.categoryName != null && (typeof item.categoryName !== 'string' || !item.categoryName.trim() || item.categoryName.trim().length > 40)) throw new Error('类别名称快照请使用 1 至 40 个字。');
  if (categoryId != null && categoryId !== '') {
    if (!validId(categoryId)) throw new Error('请选择有效的学习或运动类别。');
    const category = getActivityCategory(state, kind, categoryId);
    if (!category) throw new Error('这个类别暂时找不到了，请重新打开列表。');
    if (!category.active && previous?.categoryId !== categoryId) throw new Error('这个类别已停用，新增详情请选其他类别。');
    next.categoryId = categoryId;
    next.categoryName = previous?.categoryId === categoryId ? previous.categoryName || category.name : category.name;
  } else if (item.categoryName != null) throw new Error('请先选择类别，再保存类别名称。');
  if (kind !== 'exercise' && own(item, 'distanceKm')) throw new Error('公里数只用于运动记录。');
  if (kind === 'exercise' && (own(item, 'distanceKm') && item.distanceKm !== undefined || previous && own(previous, 'distanceKm'))) {
    const supplied = own(item, 'distanceKm') && item.distanceKm !== undefined ? item.distanceKm : previous.distanceKm;
    const distance = supplied == null || supplied === '' ? null : supplied;
    if (!(distance === null || typeof distance === 'number' && Number.isFinite(distance) && distance >= 0 && distance <= 100000)) throw new Error('公里数请填写 0 至 100000 的数字，也可以留空。');
    next.distanceKm = distance === null ? null : round(distance);
  }
  record[kind].items = record[kind].items.filter(row => row.id !== id);
  record[kind].items.push(next);
  writeRecord(state, record);
  return next;
}
export function removeActivity(state, date, kind, id) {
  assertMutable(state); validDate(date); validKind(kind);
  const record = getDayRecord(state, date);
  const before = record[kind].items.length;
  record[kind].items = record[kind].items.filter(row => row.id !== id);
  if (before === record[kind].items.length) return false;
  writeRecord(state, record); return true;
}
export function setDayStickers(state, date, ids) {
  assertMutable(state); validDate(date);
  if (!Array.isArray(ids) || ids.length > 3 || ids.some(id => !STICKER_IDS.includes(id)) || new Set(ids).size !== ids.length) throw new Error('每天可以收好最多3张不同的内置贴纸。');
  const record = getDayRecord(state, date);
  const added = ids.filter(id => !record.stickerIds.includes(id));
  record.stickerIds = [...ids];
  writeRecord(state, record);
  if (added.length) state.recentStickerIds = [...added, ...(state.recentStickerIds || []).filter(id => !added.includes(id))].slice(0, 12);
  return [...ids];
}
/** Local calendar month, unique dates; duration is separate from checked-day count. */
export function monthStats(state, month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month) || !parseDate(`${month}-01`)) throw new Error('请选择有效月份。');
  const mealDays = new Set((state.meals || []).filter(meal => parseDate(meal.date) && meal.date.startsWith(`${month}-`) && ALL_SLOTS.includes(meal.slot) && typeof meal.name === 'string' && meal.name.trim()).map(meal => meal.date)).size;
  const result = { month, mealDays, studyDays: 0, exerciseDays: 0, studyMinutes: 0, exerciseMinutes: 0 };
  const dates = { study: new Set(), exercise: new Set() };
  for (const record of state.dayRecords || []) {
    if (!parseDate(record.date) || !record.date.startsWith(`${month}-`)) continue;
    for (const kind of ACTIVITY_KINDS) {
      if (!record[kind]?.checked || dates[kind].has(record.date)) continue;
      dates[kind].add(record.date); result[`${kind}Days`]++;
      result[`${kind}Minutes`] += activeActivityItems(record[kind]).reduce((sum, item) => sum + (Number.isInteger(item.minutes) && item.minutes >= 0 && item.minutes <= 1440 ? item.minutes : 0), 0);
    }
  }
  return result;
}
