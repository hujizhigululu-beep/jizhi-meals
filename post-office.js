// AI test book only. This module owns prompt settings and explicitly saved letters;
// API credentials and network requests never enter this data model.
export const POST_OFFICE_VERSION = 1;
export const POST_OFFICE_FIELD_LIMIT = 300000;
export const POST_OFFICE_TOTAL_LIMIT = 1500000;
export const POST_OFFICE_LETTER_LIMIT = 1000;
const CHARACTER_IDS = ['saihara', 'little-tt'];
const CONFIG_FIELDS = ['version', 'userPersona', 'writingPreset', 'letterTask', 'characters', 'letters'];
const CHARACTER_FIELDS = ['id', 'name', 'persona'];
const LETTER_FIELDS = ['id', 'date', 'characterName', 'body', 'generatedAt'];
const objectOK = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const knownFields = (value, fields) => Object.keys(value).every(key => fields.includes(key));
const idOK = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && value === value.trim();
const dateOK = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCHours(12, 0, 0, 0); date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const timestampOK = value => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && dateOK(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const uuid = () => globalThis.crypto?.randomUUID?.() || `letter-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function protectedError(message) {
  const error = new Error(message); error.code = 'PROTECTED_DATA'; return error;
}
function textOK(value, max = POST_OFFICE_FIELD_LIMIT, required = false) {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
}
function contentSize(config) {
  return config.userPersona.length + config.writingPreset.length + config.letterTask.length
    + config.characters.reduce((sum, character) => sum + character.name.length + character.persona.length, 0)
    + config.letters.reduce((sum, letter) => sum + letter.characterName.length + letter.body.length, 0);
}
export function defaultPostOffice() {
  return {
    version: POST_OFFICE_VERSION,
    userPersona: '',
    writingPreset: '请用自然、细腻的中文写信。尊重角色设定，结合我本次提供的记录，不编造未提供的生活经历。',
    letterTask: '请以选定角色的身份，给我写一封关于这一天的来信。直接输出完整信件正文，不输出 JSON 或提示词解释。',
    characters: [
      { id: 'saihara', name: '最原终一', persona: '这是可编辑的角色示例，请在这里粘贴你自己的最原终一角色设定。' },
      { id: 'little-tt', name: '小tt', persona: '这是可编辑的角色示例，请在这里填写小tt的身份、性格、说话方式和与你的关系。' },
    ],
    letters: [],
  };
}
/** Unknown/invalid content locks the book, retaining its original JSON in storage.
 * Valid text is copied verbatim: no trimming, slicing or replacement of presets. */
export function normalizePostOffice(raw, warnings = []) {
  if (raw === undefined) return defaultPostOffice();
  const next = defaultPostOffice();
  if (!objectOK(raw)) { warnings.push('草莓邮局数据格式异常，已保护原文件'); return next; }
  if (!knownFields(raw, CONFIG_FIELDS)) warnings.push('草莓邮局含有未知或禁止保存的字段，已保护原文件');
  if (raw.version !== POST_OFFICE_VERSION) warnings.push('草莓邮局数据版本异常，已保护原文件');
  for (const field of ['userPersona', 'writingPreset', 'letterTask']) {
    if (!textOK(raw[field])) warnings.push('草莓邮局预设缺失、格式异常或超过 300000 字符，已保护原文件');
    else next[field] = raw[field];
  }
  if (!Array.isArray(raw.characters) || raw.characters.length !== CHARACTER_IDS.length) warnings.push('草莓邮局角色列表缺失或格式异常，已保护原文件');
  if (Array.isArray(raw.characters)) {
    const used = new Set();
    for (const character of raw.characters) {
      if (!objectOK(character) || !CHARACTER_IDS.includes(character.id) || used.has(character.id) || !textOK(character.name, 100, true) || !textOK(character.persona)) {
        warnings.push('草莓邮局角色缺失、重复、格式异常或预设超长，已保护原文件'); continue;
      }
      used.add(character.id);
      if (!knownFields(character, CHARACTER_FIELDS)) warnings.push('草莓邮局角色含有未知或禁止保存的字段，已保护原文件');
      const index = next.characters.findIndex(row => row.id === character.id);
      next.characters[index] = { id: character.id, name: character.name, persona: character.persona };
    }
    if (used.size !== CHARACTER_IDS.length) warnings.push('草莓邮局角色配置不完整，已保护原文件');
  }
  if (!Array.isArray(raw.letters) || raw.letters.length > POST_OFFICE_LETTER_LIMIT) warnings.push('草莓邮局收藏列表缺失、格式异常或超过 1000 封，已保护原文件');
  if (Array.isArray(raw.letters)) {
    const ids = new Set();
    for (const letter of raw.letters) {
      if (!objectOK(letter) || !idOK(letter.id) || ids.has(letter.id) || !dateOK(letter.date) || !textOK(letter.characterName, 100, true) || !textOK(letter.body, POST_OFFICE_FIELD_LIMIT, true) || !timestampOK(letter.generatedAt)) {
        warnings.push('草莓邮局来信重复、格式异常或超过 300000 字符，已保护原文件'); continue;
      }
      ids.add(letter.id);
      if (!knownFields(letter, LETTER_FIELDS)) warnings.push('草莓邮局来信含有未知或禁止保存的字段，已保护原文件');
      next.letters.push({ id: letter.id, date: letter.date, characterName: letter.characterName, body: letter.body, generatedAt: letter.generatedAt });
    }
  }
  if (contentSize(next) > POST_OFFICE_TOTAL_LIMIT) warnings.push('草莓邮局总内容超过 1500000 字符，已保护原文件，请保留原备份');
  return next;
}
function currentConfig(state) {
  if (!objectOK(state) || state._readOnly) throw protectedError('原数据已保护，请先导出原文件并恢复有效备份。');
  const warnings = [];
  const config = normalizePostOffice(state.postOffice, warnings);
  if (warnings.length) throw protectedError('草莓邮局数据异常，已停止修改，请保留原文件。');
  return config;
}
function assertCapacity(config) {
  if (contentSize(config) > POST_OFFICE_TOTAL_LIMIT) throw new Error('草莓邮局总内容已超过 1500000 字符，未保存。请先导出备份，再清理部分预设或来信。');
}
/** Atomic independent-field edit. No other prompt or life-record field changes. */
export function savePostOfficeField(state, field, value, characterId) {
  if (!textOK(value)) throw new Error('每项预设最多保存 300000 字符，未保存；请保留原文并自行调整。');
  const config = currentConfig(state);
  if (field === 'characterPersona' || field === 'persona') {
    const character = config.characters.find(row => row.id === characterId);
    if (!character) throw new Error('请选择有效的角色。');
    character.persona = value;
  } else if (['userPersona', 'writingPreset', 'letterTask'].includes(field)) config[field] = value;
  else throw new Error('这项草莓邮局设置不支持保存。');
  assertCapacity(config);
  state.postOffice = config;
  return value;
}
export function resetPostOfficeField(state, field, characterId) {
  const defaults = defaultPostOffice();
  if (field === 'characterPersona' || field === 'persona') {
    const character = defaults.characters.find(row => row.id === characterId);
    if (!character) throw new Error('请选择有效的角色。');
    return savePostOfficeField(state, field, character.persona, characterId);
  }
  if (!['userPersona', 'writingPreset', 'letterTask'].includes(field)) throw new Error('这项草莓邮局设置不支持恢复。');
  return savePostOfficeField(state, field, defaults[field]);
}
export function putSavedLetter(state, letter) {
  const config = currentConfig(state);
  if (!objectOK(letter) || !knownFields(letter, LETTER_FIELDS)) throw new Error('来信包含未知字段，未收藏。');
  const next = { ...letter, id: letter.id ?? uuid(), generatedAt: letter.generatedAt ?? new Date().toISOString() };
  if (!idOK(next.id) || !dateOK(next.date) || !textOK(next.characterName, 100, true) || !textOK(next.body, POST_OFFICE_FIELD_LIMIT, true) || !timestampOK(next.generatedAt)) throw new Error('来信格式异常或正文超过 300000 字符，未收藏；请保留完整正文。');
  if (config.letters.some(row => row.id === next.id)) throw new Error('这封来信已收藏，不会覆盖已有来信。');
  if (config.letters.length >= POST_OFFICE_LETTER_LIMIT) throw new Error('草莓邮局最多收藏 1000 封信，请先导出备份再清理。');
  config.letters.push(next);
  assertCapacity(config);
  state.postOffice = config;
  return { ...next };
}
export function removeSavedLetter(state, id) {
  if (!idOK(id)) throw new Error('来信编号异常。');
  const config = currentConfig(state);
  const index = config.letters.findIndex(row => row.id === id);
  if (index < 0) return false;
  config.letters.splice(index, 1);
  state.postOffice = config;
  return true;
}
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function activityLines(state, day, kind) {
  const title = kind === 'study' ? '学习' : '运动';
  const activity = day?.[kind];
  if (!activity) return [`【${title}】`, '当天没有此项记录。'];
  const lines = [`【${title}】`, `打卡状态：${activity.checked ? '已打卡' : '未打卡（下方若有详情，仅代表已记录的内容）'}`];
  const categories = (activity.categoryIds || []).map(id => (state.activityCategories?.[kind] || []).find(row => row.id === id)?.name).filter(Boolean);
  if (categories.length) lines.push(`已选择类别：${categories.join('、')}`);
  for (const item of activity.items || []) {
    let row = `- ${item.content}`;
    if (nonempty(item.categoryName)) row += `（${item.categoryName}）`;
    if (item.minutes != null) row += `；时长 ${item.minutes} 分钟`;
    if (kind === 'exercise' && item.distanceKm != null) row += `；距离 ${item.distanceKm} 公里`;
    lines.push(row);
    if (nonempty(item.note)) lines.push(`  备注：${item.note}`);
  }
  if (!(activity.items || []).length) lines.push('没有填写详情。');
  return lines;
}
/** Builds only the explicit date/checkbox selection; never includes stock,
 * saved letters, other dates, photos, settings, or hidden record categories. */
export function selectedDayText(state, date, selection = {}) {
  if (!dateOK(date)) throw new Error('请选择有效的生活记录日期。');
  const sections = [];
  if (selection.diary === true) {
    const diary = (state.diaries || []).find(row => row.date === date);
    const lines = ['【日记】'];
    if (!diary) lines.push('当天没有填写日记。');
    else {
      if (nonempty(diary.mood)) lines.push(`心情：${diary.mood}`);
      if (nonempty(diary.text)) lines.push(diary.text);
      if (nonempty(diary.joy)) lines.push(`今日小确幸：${diary.joy}`);
      if (lines.length === 1) lines.push('当天日记为空。');
    }
    sections.push(lines.join('\n'));
  }
  if (selection.meals === true) {
    const slots = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' };
    const order = ['breakfast', 'lunch', 'dinner', 'snack'];
    const meals = (state.meals || []).filter(row => row.date === date).sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot) || (a.time || '').localeCompare(b.time || ''));
    const lines = ['【餐食】'];
    for (const meal of meals) {
      lines.push(`- ${slots[meal.slot] || meal.slot}${nonempty(meal.time) ? ` ${meal.time}` : ''}：${meal.name}（${meal.completed ? '已吃' : '计划，未标记已吃'}）`);
      if (nonempty(meal.type)) lines.push(`  类型：${meal.type}`);
      if (nonempty(meal.protein)) lines.push(`  蛋白质备注：${meal.protein}`);
      if (nonempty(meal.note)) lines.push(`  备注：${meal.note}`);
    }
    if (!meals.length) lines.push('当天没有餐食记录。');
    sections.push(lines.join('\n'));
  }
  if (selection.exercise === true || selection.study === true) {
    const day = (state.dayRecords || []).find(row => row.date === date);
    if (selection.exercise === true) sections.push(activityLines(state, day, 'exercise').join('\n'));
    if (selection.study === true) sections.push(activityLines(state, day, 'study').join('\n'));
  }
  return sections.length ? `生活记录日期：${date}\n\n${sections.join('\n\n')}` : '';
}
/** All four raw presets stay intact and in the requested order. The date and
 * explicitly reviewed record text are a separate user message. */
export function composeLetterMessages({ config, characterId, date, recordsText, lengthHint = '' }) {
  const warnings = [];
  const normalized = normalizePostOffice(config, warnings);
  if (warnings.length) throw protectedError('草莓邮局预设异常，请核对后再生成。');
  const character = normalized.characters.find(row => row.id === characterId);
  if (!character) throw new Error('请选择有效的写信角色。');
  if (!dateOK(date)) throw new Error('请选择有效的生活记录日期。');
  if (!textOK(recordsText, POST_OFFICE_FIELD_LIMIT, true)) throw new Error('请先预览本次发送内容；每次记录文本最多 300000 字符，未删减任何原文。');
  if (!textOK(lengthHint, 500)) throw new Error('篇幅要求最多填写 500 字符。');
  const system = [
    '【用户设定 / User Persona】\n' + normalized.userPersona,
    `【角色设定 / Character Persona：${character.name}】\n` + character.persona,
    '【写作预设 / Writing Preset】\n' + normalized.writingPreset,
    '【邮局任务指令 / Letter Task】\n' + normalized.letterTask,
    ...(lengthHint.length ? ['【本次大致篇幅】\n' + lengthHint] : []),
  ].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: `【所选日期】\n${date}\n\n【本次已确认发送的生活记录】\n${recordsText}` }];
}
