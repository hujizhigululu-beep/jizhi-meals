import { ALL_SLOTS, parseDate, uid, normalize } from './model.js';
import { STICKER_IDS } from './stickers.js';

export const ACTIVITY_KINDS = Object.freeze(['study', 'exercise']);
const emptyRecord = date => ({ date, study: { checked: false, items: [] }, exercise: { checked: false, items: [] }, stickerIds: [] });
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
  if (record.study.checked || record.exercise.checked || record.study.items.length || record.exercise.items.length || record.stickerIds.length) state.dayRecords.push(record);
  return record;
}
/** Return an independent read view; inspecting a blank date never creates data. */
export function getDayRecord(state, date) {
  validDate(date);
  return structuredClone(state.dayRecords?.find(row => row.date === date) || emptyRecord(date));
}
export function toggleCheckin(state, date, kind) {
  assertMutable(state); validDate(date); validKind(kind);
  const record = getDayRecord(state, date);
  record[kind].checked = !record[kind].checked;
  writeRecord(state, record);
  return record[kind].checked;
}
export function putActivity(state, date, kind, item) {
  assertMutable(state); validDate(date); validKind(kind);
  if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('请核对学习或运动详情。');
  const content = item.content ?? '', note = item.note ?? '';
  if (typeof content !== 'string' || content.length > 200 || typeof note !== 'string' || note.length > 1000) throw new Error('内容最多200字，备注最多1000字，请使用文字填写。');
  const minutes = item.minutes == null || item.minutes === '' ? null : item.minutes;
  if (!(minutes === null || Number.isInteger(minutes) && minutes >= 0 && minutes <= 1440)) throw new Error('时长请填写0至1440的整数分钟，也可以留空。');
  const id = item.id ?? uid();
  if (typeof id !== 'string' || !id || id.length > 100 || id !== id.trim()) throw new Error('记录编号格式异常，请重新打开编辑。');
  const record = getDayRecord(state, date);
  const next = { id, content: content.trim(), minutes, note: note.trim() };
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
  record.stickerIds = [...ids];
  writeRecord(state, record); return [...ids];
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
      result[`${kind}Minutes`] += (record[kind].items || []).reduce((sum, item) => sum + (Number.isInteger(item.minutes) && item.minutes >= 0 && item.minutes <= 1440 ? item.minutes : 0), 0);
    }
  }
  return result;
}
