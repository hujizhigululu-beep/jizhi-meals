// Pure batch protocol. Sending, retries and persistence belong to the caller.
import { AI_CONTENT_TYPES, POST_OFFICE_FIELD_LIMIT, normalizePostOffice, selectedDayText, inventoryText } from './post-office.js';

const recordTypes = ['diary', 'meals', 'exercise', 'study', 'inventory'];
const names = { meals: '餐食短评', exercise: '运动短评', study: '学习短评', inventory: '库存短评', letter: '日记回信' };
const objectOK = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const textOK = (value, max, required = false) => typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
const dateOK = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCHours(12, 0, 0, 0); date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};

function selectedTypes(types) {
  if (!Array.isArray(types) || !types.length || types.length > AI_CONTENT_TYPES.length
    || new Set(types).size !== types.length || [...types].some(type => !AI_CONTENT_TYPES.includes(type))) {
    throw new Error('请至少勾选一项有效的 AI 内容；同一项只能选择一次。');
  }
  return [...types];
}

/** Selected records are combined once; unselected categories are never read. */
export function batchRecordsText(state, date, selection = {}) {
  if (!objectOK(state)) throw new Error('生活记录格式异常，请先恢复有效数据。');
  if (!objectOK(selection) || Object.keys(selection).some(key => !recordTypes.includes(key) || typeof selection[key] !== 'boolean')) {
    throw new Error('请选择有效的发送记录类别。');
  }
  const approved = Object.fromEntries(recordTypes.map(type => [type, Object.hasOwn(selection, type) && selection[type] === true]));
  const day = selectedDayText(state, date, approved);
  const sections = day ? [day] : [];
  if (approved.inventory) sections.push(inventoryText(state));
  return sections.join('\n\n');
}

/** One shared persona/preset and one selected-task list for one API request. */
export function composeBatchAIMessages({ config, characterId, date = '', types, recordsText, shortLengthHint = '', letterLengthHint = '' }) {
  const selected = selectedTypes(types), warnings = [];
  if (!objectOK(config)) throw new Error('草莓邮局预设异常，请核对后再生成。');
  const normalized = normalizePostOffice(config, warnings);
  if (warnings.length) {
    const error = new Error('草莓邮局预设异常，请核对后再生成。'); error.code = 'PROTECTED_DATA'; throw error;
  }
  const id = characterId === undefined ? normalized.defaultCharacterId : characterId;
  const role = normalized.characters.find(row => row.id === id && row.enabled);
  if (!role) throw new Error('默认或临时角色已停用或不存在，请在角色管理中重新指定已启用的角色。');
  if (!(selected.length === 1 && selected[0] === 'inventory' && date === '') && !dateOK(date)) {
    throw new Error('请选择有效的生活记录日期。');
  }
  if (!textOK(recordsText, POST_OFFICE_FIELD_LIMIT, true)) {
    throw new Error('请先预览本次发送内容；每次记录文本最多 300000 字符，未删减任何原文。');
  }
  if (!textOK(shortLengthHint, 500) || !textOK(letterLengthHint, 500)) throw new Error('每项篇幅要求最多填写 500 字符。');
  const literature = role.writingPreset.trim().length ? role.writingPreset : normalized.writingPreset;
  const tasks = selected.map(type => `【本次任务 / ${type}：${names[type]}】\n${type === 'letter' ? normalized.letterTask : normalized.tasks[type]}`);
  const shape = Object.fromEntries(selected.map(type => [type, `${names[type]}的完整正文`]));
  const system = [
    `【用户设定 / User Persona】\n用户显示名称：${normalized.user.name}\n${normalized.userPersona}`,
    `【角色设定 / Character Persona：${role.name}】\n${role.persona}`,
    `【写作预设 / Writing Preset】\n${literature}`,
    ...tasks,
    ...(selected.some(type => type !== 'letter') && shortLengthHint.length ? ['【短评大致篇幅】\n' + shortLengthHint] : []),
    ...(selected.includes('letter') && letterLengthHint.length ? ['【回信大致篇幅】\n' + letterLengthHint] : []),
    '【本次统一输出格式】\n在一次回复中完成以上所有已选任务。只输出一个有效 JSON 对象，键仅为本次已选任务，所有值均为完整正文字符串。不要 Markdown 围栏、说明、额外键或嵌套对象。正文中的换行、双引号等须按 JSON 正确转义。各任务中“只输出正文”“不输出 JSON”等表述仅适用于各字段正文；整次回复以本统一 JSON 格式为准。不要补写未提供的经历。\n结构：' + JSON.stringify(shape),
  ].join('\n\n');
  const user = (date ? `【所选日期】\n${date}\n\n` : '') + '【本次已确认发送的生活记录】\n' + recordsText;
  return [{ role: 'system', content: system }, { role: 'user', content: user }];
}

function stringAt(source, start) {
  if (source[start] !== '"') return null;
  for (let index = start + 1; index < source.length; index++) {
    if (source[index] === '\\') { index++; continue; }
    if (source[index] === '"') {
      try { return { value: JSON.parse(source.slice(start, index + 1)), end: index + 1 }; }
      catch { return null; }
    }
  }
  return null;
}

function valueAt(source, start) {
  if (source[start] === '"') return stringAt(source, start);
  let end = start;
  if (source[start] === '{' || source[start] === '[') {
    const stack = [];
    for (; end < source.length; end++) {
      const char = source[end];
      if (char === '"') { const token = stringAt(source, end); if (!token) return null; end = token.end - 1; }
      else if (char === '{' || char === '[') stack.push(char);
      else if (char === '}' || char === ']') {
        if (stack.pop() !== (char === '}' ? '{' : '[')) return null;
        if (!stack.length) { end++; break; }
      }
    }
    if (stack.length) return null;
  } else {
    while (end < source.length && !/[\s,}]/.test(source[end])) end++;
  }
  try { return { value: JSON.parse(source.slice(start, end)), end }; }
  catch { return null; }
}

/** Recover only complete JSON members from a truncated/malformed root object.
 * No searching through prose, closing quotes, or fabricating missing text. */
function completeMembers(source) {
  const values = Object.create(null);
  if (source[0] !== '{') return values;
  let position = 1;
  const whitespace = () => { while (/\s/.test(source[position] || '') && position < source.length) position++; };
  while (position < source.length) {
    whitespace();
    if (source[position] === '}') return source.slice(position + 1).trim() ? Object.create(null) : values;
    const key = stringAt(source, position);
    if (!key) break;
    position = key.end; whitespace();
    if (source[position++] !== ':') break;
    whitespace();
    const token = valueAt(source, position);
    if (!token) break;
    position = token.end; whitespace();
    if (position < source.length && source[position] !== ',' && source[position] !== '}') break;
    values[key.value] = token.value;
    if (source[position] !== ',') {
      if (source[position] === '}' && source.slice(position + 1).trim()) return Object.create(null);
      break;
    }
    position++;
  }
  return values;
}

/** Full returned text stays available even when individual outputs are missing. */
export function parseBatchAIResponse(text, types) {
  const selected = selectedTypes(types);
  let values = Object.create(null);
  if (typeof text === 'string') {
    let source = text.trim();
    const fenced = /^```(?:json)?[ \t]*\r?\n([\s\S]*?)\r?\n?```$/i.exec(source);
    if (fenced) source = fenced[1].trim();
    try { const parsed = JSON.parse(source); if (objectOK(parsed)) values = parsed; }
    catch { values = completeMembers(source); }
  }
  const items = [], missingTypes = [];
  for (const type of selected) {
    if (Object.hasOwn(values, type) && typeof values[type] === 'string' && values[type].trim().length) items.push({ type, body: values[type] });
    else missingTypes.push(type);
  }
  return { items, missingTypes, rawText: text };
}
