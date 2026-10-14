// AI test book only. Credentials and network requests never enter this model.
export const POST_OFFICE_VERSION = 2;
export const POST_OFFICE_FIELD_LIMIT = 300000;
export const POST_OFFICE_TOTAL_LIMIT = 1500000;
export const POST_OFFICE_LETTER_LIMIT = 1000;
export const POST_OFFICE_COMMENT_LIMIT = 2000;
export const POST_OFFICE_CHARACTER_LIMIT = 100;
export const AI_CONTENT_TYPES = ['meals', 'exercise', 'study', 'inventory', 'letter'];
const BUILTIN_IDS = ['saihara', 'little-tt'];
const SHORT_TYPES = AI_CONTENT_TYPES.filter(type => type !== 'letter');
const CONFIG_V1_FIELDS = ['version', 'userPersona', 'writingPreset', 'letterTask', 'characters', 'letters'];
const CONFIG_FIELDS = [...CONFIG_V1_FIELDS, 'user', 'defaultCharacterId', 'tasks', 'comments'];
const USER_FIELDS = ['name', 'avatarId', 'avatarMode'];
const CHARACTER_V1_FIELDS = ['id', 'name', 'persona'];
const CHARACTER_FIELDS = [...CHARACTER_V1_FIELDS, 'writingPreset', 'enabled', 'builtin', 'avatarId', 'avatarMode'];
const LETTER_V1_FIELDS = ['id', 'date', 'characterName', 'body', 'generatedAt'];
const CONTENT_FIELDS = [...LETTER_V1_FIELDS, 'type', 'characterId', 'avatarId', 'avatarMode', 'avatarFallback', 'recordsText', 'recordIds', 'snapshotId'];
const objectOK = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const knownFields = (value, fields) => Object.keys(value).every(key => fields.includes(key));
const idOK = value => typeof value === 'string' && value.length > 0 && value.length <= 100 && value === value.trim();
const referenceOK = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const avatarOK = value => value === '' || referenceOK(value);
const modeOK = value => ['sticker', 'circle'].includes(value);
const fallbackOK = value => ['saihara', 'little-tt', 'jizhi', 'generic'].includes(value);
const dateOK = value => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(0); date.setUTCHours(12, 0, 0, 0); date.setUTCFullYear(year, month - 1, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
};
const timestampOK = value => typeof value === 'string' && value.length <= 40 && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && dateOK(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
const uuid = prefix => globalThis.crypto?.randomUUID?.() || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function protectedError(message) { const error = new Error(message); error.code = 'PROTECTED_DATA'; return error; }
function textOK(value, max = POST_OFFICE_FIELD_LIMIT, required = false) {
  return typeof value === 'string' && value.length <= max && (!required || value.trim().length > 0);
}
function contentSize(config) {
  return config.user.name.length + config.userPersona.length + config.writingPreset.length + config.letterTask.length
    + Object.values(config.tasks).reduce((sum, text) => sum + text.length, 0)
    + config.characters.reduce((sum, row) => sum + row.name.length + row.persona.length + row.writingPreset.length, 0)
    + [...config.letters, ...config.comments].reduce((sum, row) => sum + row.characterName.length + row.body.length + row.recordsText.length, 0);
}
export function defaultPostOffice() {
  return {
    version: POST_OFFICE_VERSION,
    user: { name: '机智', avatarId: '', avatarMode: 'sticker' },
    userPersona: '',
    writingPreset: '请用自然、细腻的中文写作。尊重角色设定，结合我本次提供的记录，不编造未提供的生活经历。',
    letterTask: '请以选定角色的身份，给我写一封关于这一天的私人来信。直接输出完整信件正文，不输出 JSON、标题或提示词解释。',
    defaultCharacterId: 'saihara',
    tasks: {
      meals: '根据我本次明确提供的当天餐食，以你的角色身份写一句亲近而有个性的短评，约 20—60 个汉字。只输出一句正文，不要标题、多条建议、营养评估或管理报告。',
      exercise: '根据我本次明确提供的当天运动，以你的角色身份写一句亲近而有个性的短评，约 20—60 个汉字。只输出一句正文，不要标题、多条建议、运动指导或训练报告。',
      study: '根据我本次明确提供的当天学习，以你的角色身份写一句亲近而有个性的短评，约 20—60 个汉字。只输出一句正文，不要标题、多条建议、学习督促或分析报告。',
      inventory: '根据我本次明确提供的食材库存快照，以你的角色身份写一句亲近而有个性的短评，约 20—60 个汉字。只输出一句正文，不要标题、多条建议或库存管理报告。',
    },
    characters: [
      { id: 'saihara', name: '最原终一', persona: '你是最原终一，一位温柔、细心的年轻侦探。认真倾听机智的日常，留意具体的小细节，表达克制而真诚的关心。遇到未知的事诚实承认，不凭空替她补写经历。这是简要示例，可自由替换成自己的角色设定。', writingPreset: '语气柔和而略带羞涩，观察细腻，用具体的小事表达在意。避免训话、夸张承诺和空泛的安慰。', enabled: true, builtin: 'saihara', avatarId: '', avatarMode: 'sticker' },
      { id: 'little-tt', name: '小tt', persona: '你是小tt，机智身边一只会说话的猫咪伙伴。性格活泼、机灵，喜欢草莓牛奶和一起度过的普通日子。用轻巧的玩笑与亲昵回应她的真实记录，不假装了解没有提供的事。这是简要示例，可自由替换成自己的角色设定。', writingPreset: '文字轻快、俏皮而温暖，偶尔使用自然的猫咪语气。少说大道理，避免固定套路、过多表情和催促。', enabled: true, builtin: 'little-tt', avatarId: '', avatarMode: 'sticker' },
    ],
    letters: [], comments: [],
  };
}
function characterValid(row, legacy = false) {
  return objectOK(row) && referenceOK(row.id) && textOK(row.name, 100, true) && textOK(row.persona)
    && (legacy || textOK(row.writingPreset) && typeof row.enabled === 'boolean' && avatarOK(row.avatarId) && modeOK(row.avatarMode)
      && (row.builtin === '' || BUILTIN_IDS.includes(row.builtin) && row.builtin === row.id));
}
function inferRole(config, name) {
  const matches = config.characters.filter(row => row.name === name);
  return matches.length === 1 ? matches[0] : null;
}
function normalizeContent(raw, type, config, legacy = false) {
  if (!objectOK(raw) || !idOK(raw.id) || !textOK(raw.characterName, 100, true) || !textOK(raw.body, POST_OFFICE_FIELD_LIMIT, true) || !timestampOK(raw.generatedAt)) return null;
  if (!knownFields(raw, legacy ? LETTER_V1_FIELDS : CONTENT_FIELDS)) return null;
  const role = inferRole(config, raw.characterName);
  const next = {
    ...raw, type: raw.type ?? type, date: raw.date ?? '', characterId: raw.characterId ?? role?.id ?? 'legacy',
    avatarId: raw.avatarId ?? '', avatarMode: raw.avatarMode ?? 'sticker',
    avatarFallback: raw.avatarFallback ?? (role?.builtin || (BUILTIN_IDS.includes(raw.characterId) ? raw.characterId : 'generic')),
    recordsText: raw.recordsText ?? '', recordIds: raw.recordIds === undefined ? [] : [...(Array.isArray(raw.recordIds) ? raw.recordIds : [])], snapshotId: raw.snapshotId ?? '',
  };
  if (next.type !== type || !referenceOK(next.characterId) || !avatarOK(next.avatarId) || !modeOK(next.avatarMode) || !fallbackOK(next.avatarFallback)
    || !textOK(next.recordsText) || !avatarOK(next.snapshotId) || !Array.isArray(raw.recordIds ?? [])
    || next.recordIds.length > 10000 || new Set(next.recordIds).size !== next.recordIds.length || next.recordIds.some(id => !idOK(id))
    || (type === 'inventory' ? !(next.date === '' || dateOK(next.date)) || !referenceOK(next.snapshotId) : !dateOK(next.date))) return null;
  return next;
}
/** Version 1 migrates without rewriting any saved text. Invalid/unknown fields
 * protect the original JSON; normalization never persists by itself. */
export function normalizePostOffice(raw, warnings = []) {
  if (raw === undefined) return defaultPostOffice();
  const next = defaultPostOffice();
  if (!objectOK(raw)) { warnings.push('草莓邮局数据格式异常，已保护原文件'); return next; }
  const legacy = raw.version === 1;
  if (!knownFields(raw, legacy ? CONFIG_V1_FIELDS : CONFIG_FIELDS)) warnings.push('草莓邮局含有未知或禁止保存的字段，已保护原文件');
  if (![1, POST_OFFICE_VERSION].includes(raw.version)) warnings.push('草莓邮局数据版本异常，已保护原文件');
  for (const field of ['userPersona', 'writingPreset', 'letterTask']) {
    if (!textOK(raw[field])) warnings.push('草莓邮局预设缺失、格式异常或超过 300000 字符，已保护原文件');
    else next[field] = raw[field];
  }
  if (!legacy) {
    if (!objectOK(raw.user) || !knownFields(raw.user, USER_FIELDS) || !textOK(raw.user.name, 100, true) || !avatarOK(raw.user.avatarId) || !modeOK(raw.user.avatarMode)) warnings.push('用户资料格式异常，已保护原文件');
    else next.user = { ...raw.user };
    if (!avatarOK(raw.defaultCharacterId)) warnings.push('默认角色编号异常，已保护原文件');
    else next.defaultCharacterId = raw.defaultCharacterId;
    if (!objectOK(raw.tasks) || !knownFields(raw.tasks, SHORT_TYPES) || SHORT_TYPES.some(type => !textOK(raw.tasks[type]))) warnings.push('AI 任务预设缺失或格式异常，已保护原文件');
    else next.tasks = { ...raw.tasks };
  }
  if (!Array.isArray(raw.characters) || raw.characters.length > POST_OFFICE_CHARACTER_LIMIT || legacy && raw.characters.length !== 2) warnings.push('草莓邮局角色列表缺失、格式异常或超过 100 个，已保护原文件');
  if (Array.isArray(raw.characters)) {
    next.characters = [];
    const used = new Set();
    for (const row of raw.characters) {
      if (!characterValid(row, legacy) || used.has(row.id) || legacy && !BUILTIN_IDS.includes(row.id) || !knownFields(row, legacy ? CHARACTER_V1_FIELDS : CHARACTER_FIELDS)) {
        warnings.push('草莓邮局角色重复、含有未知字段、格式异常或预设超长，已保护原文件'); continue;
      }
      used.add(row.id);
      // Existing phase-2 personas remain verbatim; no new role-specific preset
      // is inserted into an existing user's previously general writing setup.
      next.characters.push(legacy ? { ...row, writingPreset: '', enabled: true, builtin: row.id, avatarId: '', avatarMode: 'sticker' } : { ...row });
    }
    if (legacy && used.size !== 2) warnings.push('草莓邮局旧版角色配置不完整，已保护原文件');
    if (!legacy && next.characters.some(row => BUILTIN_IDS.includes(row.id) && row.builtin !== row.id)) warnings.push('内置角色标识异常，已保护原文件');
  }
  const ids = new Set();
  for (const [field, limit] of [['letters', POST_OFFICE_LETTER_LIMIT], ['comments', POST_OFFICE_COMMENT_LIMIT]]) {
    if (legacy && field === 'comments') continue;
    if (!Array.isArray(raw[field]) || raw[field].length > limit) warnings.push(`草莓邮局${field === 'letters' ? '来信' : '点评'}列表缺失、格式异常或超量，已保护原文件`);
    for (const rawContent of Array.isArray(raw[field]) ? raw[field] : []) {
      const type = field === 'letters' ? 'letter' : rawContent?.type;
      const row = AI_CONTENT_TYPES.includes(type) && (field === 'letters' || type !== 'letter') ? normalizeContent(rawContent, type, next, legacy) : null;
      if (!row || ids.has(row.id)) { warnings.push('草莓邮局来信或点评重复、含有未知字段、格式异常或超长，已保护原文件'); continue; }
      ids.add(row.id); next[field].push(row);
    }
  }
  if (contentSize(next) > POST_OFFICE_TOTAL_LIMIT) warnings.push('草莓邮局总内容超过 1500000 字符，已保护原文件，请保留原备份');
  return next;
}
function currentConfig(state) {
  if (!objectOK(state) || state._readOnly) throw protectedError('原数据已保护，请先导出原文件并恢复有效备份。');
  const warnings = [], config = normalizePostOffice(state.postOffice, warnings);
  if (warnings.length) throw protectedError('草莓邮局数据异常，已停止修改，请保留原文件。');
  return config;
}
function assertCapacity(config) {
  if (contentSize(config) > POST_OFFICE_TOTAL_LIMIT) throw new Error('草莓邮局总内容已超过 1500000 字符，未保存。请先导出备份，再清理部分预设或来信。');
}
function saveConfig(state, config) { assertCapacity(config); state.postOffice = config; }
export function savePostOfficeField(state, field, value, characterId) {
  if (!textOK(value)) throw new Error('每项预设最多保存 300000 字符，未保存；请保留原文并自行调整。');
  const config = currentConfig(state);
  if (field === 'characterPersona' || field === 'persona' || field === 'characterWritingPreset') {
    const role = config.characters.find(row => row.id === characterId);
    if (!role) throw new Error('请选择有效的角色。');
    role[field === 'characterWritingPreset' ? 'writingPreset' : 'persona'] = value;
  } else if (['userPersona', 'writingPreset', 'letterTask'].includes(field)) config[field] = value;
  else throw new Error('这项草莓邮局设置不支持保存。');
  saveConfig(state, config); return value;
}
export function resetPostOfficeField(state, field, characterId) {
  const defaults = defaultPostOffice();
  if (field === 'characterPersona' || field === 'persona' || field === 'characterWritingPreset') {
    const role = defaults.characters.find(row => row.id === characterId);
    if (!role) throw new Error('这个自定义角色没有内置默认设定。');
    return savePostOfficeField(state, field, role[field === 'characterWritingPreset' ? 'writingPreset' : 'persona'], characterId);
  }
  if (!['userPersona', 'writingPreset', 'letterTask'].includes(field)) throw new Error('这项草莓邮局设置不支持恢复。');
  return savePostOfficeField(state, field, defaults[field]);
}
export function saveUserProfile(state, input) {
  if (!objectOK(input) || !knownFields(input, [...USER_FIELDS, 'userPersona'])) throw new Error('用户资料包含未知字段，未保存。');
  const config = currentConfig(state), user = { ...config.user, ...Object.fromEntries(USER_FIELDS.filter(field => input[field] !== undefined).map(field => [field, input[field]])) };
  if (!textOK(user.name, 100, true) || !avatarOK(user.avatarId) || !modeOK(user.avatarMode) || input.userPersona !== undefined && !textOK(input.userPersona)) throw new Error('用户名称、头像或预设格式异常，未保存；预设最多 300000 字符。');
  config.user = user;
  if (input.userPersona !== undefined) config.userPersona = input.userPersona;
  saveConfig(state, config); return { ...user };
}
export function saveTaskPrompt(state, type, value) {
  if (type === 'letter') return savePostOfficeField(state, 'letterTask', value);
  if (!SHORT_TYPES.includes(type) || !textOK(value)) throw new Error('请选择有效的 AI 任务；每项预设最多 300000 字符。');
  const config = currentConfig(state); config.tasks[type] = value; saveConfig(state, config); return value;
}
export function upsertCharacter(state, input) {
  if (!objectOK(input) || !knownFields(input, CHARACTER_FIELDS)) throw new Error('角色资料包含未知字段，未保存。');
  const config = currentConfig(state), index = input.id === undefined ? -1 : config.characters.findIndex(row => row.id === input.id);
  const previous = index < 0 ? null : config.characters[index];
  const next = { id: uuid('character'), name: '新角色', persona: '', writingPreset: '', enabled: true, builtin: '', avatarId: '', avatarMode: 'sticker', ...(previous || {}), ...input };
  if (!characterValid(next) || previous && previous.builtin !== next.builtin || !previous && next.builtin !== '' || BUILTIN_IDS.includes(next.id) && next.builtin !== next.id) throw new Error('角色资料或稳定编号异常，未保存；名称最多 100 字符，预设最多 300000 字符。');
  if (index < 0) {
    if (config.characters.length >= POST_OFFICE_CHARACTER_LIMIT) throw new Error('最多保存 100 个角色，请先备份并清理不再使用的自定义角色。');
    config.characters.push(next);
  } else config.characters[index] = next;
  saveConfig(state, config); return { ...next };
}
export function copyCharacter(state, id) {
  const config = currentConfig(state), original = config.characters.find(row => row.id === id);
  if (!original) throw new Error('请选择有效的角色。');
  return upsertCharacter(state, { ...original, id: uuid('character'), builtin: '', name: original.name.length <= 97 ? `${original.name} 副本` : original.name });
}
export function removeCharacter(state, id) {
  const config = currentConfig(state), index = config.characters.findIndex(row => row.id === id);
  if (index < 0) return false;
  if (config.characters[index].builtin) throw new Error('内置角色可以编辑或停用；仅能删除自定义角色。');
  config.characters.splice(index, 1);
  // Keep an invalid default reference deliberately: the UI asks for another
  // default explicitly, rather than silently selecting a different character.
  saveConfig(state, config); return true;
}
export function resetCharacter(state, id) {
  const config = currentConfig(state), index = config.characters.findIndex(row => row.id === id), original = defaultPostOffice().characters.find(row => row.id === id);
  if (index < 0 || !original || config.characters[index].builtin !== id) throw new Error('这个角色没有内置默认设定。');
  config.characters[index] = original; saveConfig(state, config); return { ...original };
}
export function setDefaultCharacter(state, id) {
  const config = currentConfig(state), role = config.characters.find(row => row.id === id && row.enabled);
  if (!role) throw new Error('请选择一个已启用的角色作为默认角色。');
  config.defaultCharacterId = id; saveConfig(state, config); return id;
}
export function putAIContent(state, input) {
  if (!objectOK(input) || !knownFields(input, CONTENT_FIELDS) || !AI_CONTENT_TYPES.includes(input.type)) throw new Error('AI 内容包含未知字段或类型，未保存。');
  const config = currentConfig(state), role = config.characters.find(row => row.id === input.characterId) || inferRole(config, input.characterName);
  const raw = {
    ...input, id: input.id ?? uuid('ai-content'), generatedAt: input.generatedAt ?? new Date().toISOString(),
    characterId: input.characterId ?? role?.id ?? 'legacy', characterName: input.characterName ?? role?.name,
    avatarId: input.avatarId ?? role?.avatarId ?? '', avatarMode: input.avatarMode ?? role?.avatarMode ?? 'sticker',
    avatarFallback: input.avatarFallback ?? role?.builtin ?? 'generic',
  };
  // Empty builtin markers are not fallback kinds.
  if (raw.avatarFallback === '') raw.avatarFallback = 'generic';
  const next = normalizeContent(raw, input.type, config);
  if (!next) throw new Error('AI 内容格式异常或正文超过 300000 字符，未保存；请保留完整正文。');
  if ([...config.letters, ...config.comments].some(row => row.id === next.id)) throw new Error('这条内容已收藏，不会覆盖已有内容。');
  const field = next.type === 'letter' ? 'letters' : 'comments', limit = field === 'letters' ? POST_OFFICE_LETTER_LIMIT : POST_OFFICE_COMMENT_LIMIT;
  if (config[field].length >= limit) throw new Error(`草莓邮局最多保存 ${limit} ${field === 'letters' ? '封信' : '条点评'}，请先导出备份再清理。`);
  config[field].push(next); saveConfig(state, config); return { ...next, recordIds: [...next.recordIds] };
}
export function putSavedLetter(state, letter) { return putAIContent(state, { ...letter, type: 'letter' }); }
export function removeAIContent(state, id, type) {
  if (!idOK(id) || type !== undefined && !AI_CONTENT_TYPES.includes(type)) throw new Error('AI 内容编号或类型异常。');
  const config = currentConfig(state);
  for (const field of ['letters', 'comments']) {
    const index = config[field].findIndex(row => row.id === id && (type === undefined || row.type === type));
    if (index >= 0) { config[field].splice(index, 1); saveConfig(state, config); return true; }
  }
  return false;
}
export function removeSavedLetter(state, id) { return removeAIContent(state, id, 'letter'); }
export function selectAIContents(state, { type, date, snapshotId } = {}) {
  // History may still be read when an unrelated life record protects the book.
  // This selector never mutates state or resolves avatars over the network.
  const warnings = [], config = normalizePostOffice(state?.postOffice, warnings);
  if (warnings.length) throw protectedError('草莓邮局数据异常，请保留原文件。');
  if (type !== undefined && !AI_CONTENT_TYPES.includes(type)) throw new Error('AI 内容类型异常。');
  return [...config.letters, ...config.comments].filter(row => (type === undefined || row.type === type) && (date === undefined || row.date === date) && (snapshotId === undefined || row.snapshotId === snapshotId))
    .sort((a, b) => a.generatedAt.localeCompare(b.generatedAt) || a.id.localeCompare(b.id)).map(row => ({ ...row, recordIds: [...row.recordIds] }));
}
function nonempty(value) { return typeof value === 'string' && value.trim().length > 0; }
function activityLines(state, day, kind) {
  const title = kind === 'study' ? '学习' : '运动', activity = day?.[kind];
  if (!activity) return [`【${title}】`, '当天没有此项记录。'];
  const lines = [`【${title}】`, `打卡状态：${activity.checked ? '已打卡' : '未打卡（下方若有详情，仅代表已记录的内容）'}`];
  const categories = (activity.categoryIds || []).map(id => (state.activityCategories?.[kind] || []).find(row => row.id === id)?.name).filter(Boolean);
  if (categories.length) lines.push(`已选择类别：${categories.join('、')}`);
  for (const item of activity.items || []) {
    let row = `- ${item.content}`;
    if (nonempty(item.categoryName)) row += `（${item.categoryName}）`;
    if (item.minutes != null) row += `；时长 ${item.minutes} 分钟`;
    if (kind === 'exercise' && item.distanceKm != null) row += `；距离 ${item.distanceKm} 公里`;
    lines.push(row); if (nonempty(item.note)) lines.push(`  备注：${item.note}`);
  }
  if (!(activity.items || []).length) lines.push('没有填写详情。');
  return lines;
}
/** Only explicit date/category selections are read. Never scan the whole book. */
export function selectedDayText(state, date, selection = {}) {
  if (!dateOK(date)) throw new Error('请选择有效的生活记录日期。');
  const sections = [];
  if (selection.diary === true) {
    const diary = (state.diaries || []).find(row => row.date === date), lines = ['【日记】'];
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
    const slots = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }, order = ['breakfast', 'lunch', 'dinner', 'snack'];
    const meals = (state.meals || []).filter(row => row.date === date).sort((a, b) => order.indexOf(a.slot) - order.indexOf(b.slot) || (a.time || '').localeCompare(b.time || ''));
    const lines = ['【餐食】'];
    for (const meal of meals) {
      lines.push(`- ${slots[meal.slot] || meal.slot}${nonempty(meal.time) ? ` ${meal.time}` : ''}：${meal.name}（${meal.completed ? '已吃' : '计划，未标记已吃'}）`);
      if (nonempty(meal.type)) lines.push(`  类型：${meal.type}`);
      if (nonempty(meal.protein)) lines.push(`  蛋白质备注：${meal.protein}`);
      if (nonempty(meal.note)) lines.push(`  备注：${meal.note}`);
    }
    if (!meals.length) lines.push('当天没有餐食记录。'); sections.push(lines.join('\n'));
  }
  if (selection.exercise === true || selection.study === true) {
    const day = (state.dayRecords || []).find(row => row.date === date);
    if (selection.exercise === true) sections.push(activityLines(state, day, 'exercise').join('\n'));
    if (selection.study === true) sections.push(activityLines(state, day, 'study').join('\n'));
  }
  return sections.length ? `生活记录日期：${date}\n\n${sections.join('\n\n')}` : '';
}
/** Immutable text for a user-approved inventory snapshot. No meals/diary read. */
export function inventoryText(state) {
  const lines = ['【当前食材库存快照】'];
  for (const item of state.inventory || []) {
    lines.push(`- ${item.name}：${item.quantity} ${item.unit}`);
    if (nonempty(item.category)) lines.push(`  分类：${item.category}`);
    if (nonempty(item.expires)) lines.push(`  保质期：${item.expires}`);
    if (nonempty(item.note)) lines.push(`  备注：${item.note}`);
  }
  if (!(state.inventory || []).length) lines.push('当前没有食材库存。');
  return lines.join('\n');
}
/** Full raw presets in order; approved records stay in a separate user message. */
export function composeAIMessages({ config, characterId, type, date = '', recordsText, lengthHint = '' }) {
  const warnings = [], normalized = normalizePostOffice(config, warnings);
  if (warnings.length) throw protectedError('草莓邮局预设异常，请核对后再生成。');
  if (!AI_CONTENT_TYPES.includes(type)) throw new Error('请选择有效的 AI 任务。');
  const selectedId = characterId === undefined ? normalized.defaultCharacterId : characterId;
  const role = normalized.characters.find(row => row.id === selectedId && row.enabled);
  if (!role) throw new Error('默认或临时角色已停用或不存在，请在角色管理中重新指定已启用的角色。');
  if (type === 'inventory' ? date !== '' && !dateOK(date) : !dateOK(date)) throw new Error('请选择有效的生活记录日期。');
  if (!textOK(recordsText, POST_OFFICE_FIELD_LIMIT, true)) throw new Error('请先预览本次发送内容；每次记录文本最多 300000 字符，未删减任何原文。');
  if (!textOK(lengthHint, 500)) throw new Error('篇幅要求最多填写 500 字符。');
  const literature = role.writingPreset.trim().length ? role.writingPreset : normalized.writingPreset;
  const system = [
    `【用户设定 / User Persona】\n用户显示名称：${normalized.user.name}\n` + normalized.userPersona,
    `【角色设定 / Character Persona：${role.name}】\n` + role.persona,
    '【写作预设 / Writing Preset】\n' + literature,
    (type === 'letter' ? '【邮局任务指令 / Letter Task】\n' + normalized.letterTask : `【本次任务 / ${type}】\n` + normalized.tasks[type]),
    ...(lengthHint.length ? ['【本次大致篇幅】\n' + lengthHint] : []),
  ].join('\n\n');
  return [{ role: 'system', content: system }, { role: 'user', content: (date ? `【所选日期】\n${date}\n\n` : '') + '【本次已确认发送的生活记录】\n' + recordsText }];
}
export function composeLetterMessages(options) { return composeAIMessages({ ...options, type: 'letter' }); }
