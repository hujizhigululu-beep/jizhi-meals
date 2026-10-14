import { STICKER_IDS } from './stickers.js';
import { defaultActivityCategories, normalizeExtras } from './schema-extra.js';
import { defaultPostOffice, normalizePostOffice } from './post-office.js';
export const SCHEMA = 4;
export const SLOTS = ['breakfast', 'lunch', 'dinner'];
export const ALL_SLOTS = [...SLOTS, 'snack'];
export const TYPES = ['自制便当', '公司食堂', '面包卡消耗', '外出就餐', '外卖', '零食 / 加餐', '其他'];
export const freshState = () => ({ schemaVersion: SCHEMA, inventory: [], meals: [], diaries: [], dayRecords: [], mealTemplates: [], activityCategories: defaultActivityCategories(), recentStickerIds: [], postOffice: defaultPostOffice(), updatedAt: null });
export const uid = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
export const round = n => Math.round((n + Number.EPSILON) * 1000) / 1000;
// Optional future IndexedDB reference; never store image content in localStorage.
const photoReference = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value) ? value : null;
export function dateKey(d) {
  return `${String(d.getFullYear()).padStart(4, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s) || s.startsWith('0000')) return null;
  const [y, m, day] = s.split('-').map(Number);
  const d = new Date(0);
  d.setHours(12, 0, 0, 0);
  d.setFullYear(y, m - 1, day);
  return dateKey(d) === s ? d : null;
}
export function addDays(s, n) {
  const d = parseDate(s);
  if (!d) throw new Error('请选择有效日期。');
  d.setDate(d.getDate() + n);
  const key = dateKey(d);
  return parseDate(key) ? key : null;
}
export function weekDates(s) {
  const d = parseDate(s);
  if (!d) throw new Error('请选择有效日期。');
  const monday = addDays(s, -((d.getDay() + 6) % 7));
  if (!monday) throw new Error('这个日期超出了日历范围。');
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}
const shortText = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : '';
const numberOK = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e9;
const idOK = id => typeof id === 'string' && id.length > 0 && id.length <= 100 && id === id.trim();
const timeOK = time => time === '' || time == null || typeof time === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(time);
function protectedError(message) {
  const error = new Error(message);
  error.code = 'PROTECTED_DATA';
  return error;
}
function rawResources(meal) {
  if (meal.resources !== undefined) {
    if (!Array.isArray(meal.resources)) throw new Error('餐食的食材列表格式异常，请保留原文件。');
    if (meal.resource != null) throw new Error('餐食同时包含新旧食材关联，无法安全判断用量，请保留原文件。');
    return meal.resources;
  }
  return meal.resource == null ? [] : [meal.resource];
}
function storedResources(meal) {
  const ids = new Set();
  return rawResources(meal).map(resource => {
    if (!resource || !idOK(resource.ingredientId) || !shortText(resource.name, 60) || !shortText(resource.unit, 12) || !numberOK(resource.amount) || round(resource.amount) <= 0) {
      throw protectedError('餐食的库存关联异常，不能安全扣减或返还；请保留原文件并恢复有效备份。');
    }
    if (ids.has(resource.ingredientId)) throw protectedError('同一餐的食材关联重复，不能安全扣减或返还；请保留原文件。');
    ids.add(resource.ingredientId);
    return { ingredientId: resource.ingredientId, name: shortText(resource.name, 60), unit: shortText(resource.unit, 12), amount: round(resource.amount) };
  });
}
const objectOK = value => value && typeof value === 'object' && !Array.isArray(value);
const knownFields = (value, fields) => Object.keys(value).every(key => fields.includes(key));
/** Strict validation keeps unknown activity/sticker content in the original protected JSON. */
export function normalizeDayRecords(raw, warnings = [], activityCategories = defaultActivityCategories(), schemaVersion = SCHEMA) {
  const records = [];
  if (!Array.isArray(raw)) { warnings.push('学习、运动与贴纸记录缺失或格式异常，已保护原文件'); return records; }
  const dates = new Set();
  for (const record of raw) {
    if (!objectOK(record) || !parseDate(record.date) || dates.has(record.date)) {
      warnings.push('日常打卡的日期异常或重复，已保护原文件'); continue;
    }
    dates.add(record.date);
    if (!knownFields(record, ['date', 'study', 'exercise', 'stickerIds'])) warnings.push('日常打卡含有本版本不认识的内容，已保护原文件');
    const next = { date: record.date };
    for (const kind of ['study', 'exercise']) {
      const activity = record[kind];
      if (!objectOK(activity) || typeof activity.checked !== 'boolean' || !Array.isArray(activity.items)) {
        warnings.push('学习或运动的打卡状态、详情格式异常，已保护原文件');
        next[kind] = { checked: false, items: [], categoryIds: [], manualChecked: false }; continue;
      }
      if (!knownFields(activity, ['checked', 'items', 'categoryIds', 'manualChecked'])) warnings.push('学习或运动含有本版本不认识的内容，已保护原文件');
      const categoryIdSet = new Set((activityCategories[kind] || []).map(category => category.id));
      const hasCategories = activity.categoryIds !== undefined;
      const hasManual = activity.manualChecked !== undefined;
      const legacy = schemaVersion < 4 && !hasCategories && !hasManual;
      let categoryIds = [], manualChecked = legacy ? activity.checked : activity.manualChecked === true;
      if (!legacy) {
        if (!Array.isArray(activity.categoryIds) || new Set(activity.categoryIds).size !== activity.categoryIds.length || activity.categoryIds.some(id => !categoryIdSet.has(id))) {
          warnings.push('学习或运动打卡引用未知、重复或缺失的类别，已保护原文件');
          categoryIds = Array.isArray(activity.categoryIds) ? [...new Set(activity.categoryIds.filter(id => categoryIdSet.has(id)))] : [];
        } else categoryIds = [...activity.categoryIds];
        if (typeof activity.manualChecked !== 'boolean') warnings.push('学习或运动手动打卡状态缺失或格式异常，已保护原文件');
        if (activity.checked && !manualChecked && !categoryIds.length || !activity.checked && manualChecked) warnings.push('学习或运动打卡状态与类别不一致，已保护原文件');
      }
      const itemIds = new Set();
      const items = [];
      for (const item of activity.items) {
        if (!objectOK(item) || !idOK(item.id) || itemIds.has(item.id) || typeof item.content !== 'string' || item.content.length > 200 || typeof item.note !== 'string' || item.note.length > 1000 || !(item.minutes === null || Number.isInteger(item.minutes) && item.minutes >= 0 && item.minutes <= 1440)) {
          warnings.push('一条学习或运动详情异常或重复，已保护原文件'); continue;
        }
        itemIds.add(item.id);
        if (!knownFields(item, ['id', 'content', 'minutes', 'note', 'categoryId', 'categoryName', ...(kind === 'exercise' ? ['distanceKm'] : [])])) warnings.push('学习或运动详情含有本版本不认识的内容，已保护原文件');
        const nextItem = { id: item.id, content: item.content, minutes: item.minutes, note: item.note };
        if (item.categoryId !== undefined) {
          if (!idOK(item.categoryId) || !categoryIdSet.has(item.categoryId)) warnings.push('学习或运动详情引用未知的类别，已保护原文件');
          else nextItem.categoryId = item.categoryId;
        }
        if (item.categoryName !== undefined) {
          if (item.categoryId === undefined || typeof item.categoryName !== 'string' || !item.categoryName.trim() || item.categoryName.length > 40) warnings.push('学习或运动详情的类别名称快照异常，已保护原文件');
          else nextItem.categoryName = item.categoryName;
        }
        if (kind === 'exercise' && item.distanceKm !== undefined) {
          if (!(item.distanceKm === null || typeof item.distanceKm === 'number' && Number.isFinite(item.distanceKm) && item.distanceKm >= 0 && item.distanceKm <= 100000)) warnings.push('运动距离异常，请使用0至100000公里或留空，已保护原文件');
          else nextItem.distanceKm = item.distanceKm === null ? null : round(item.distanceKm);
        }
        items.push(nextItem);
      }
      // A master switch can pause check-ins while retaining category selections and details.
      next[kind] = { checked: activity.checked, items, categoryIds, manualChecked };
    }
    if (!Array.isArray(record.stickerIds) || record.stickerIds.length > 3 || new Set(record.stickerIds).size !== record.stickerIds.length || record.stickerIds.some(id => !STICKER_IDS.includes(id))) {
      warnings.push('贴纸记录含有未知、重复或超量的贴纸，已保护原文件');
      next.stickerIds = Array.isArray(record.stickerIds) ? [...new Set(record.stickerIds.filter(id => STICKER_IDS.includes(id)))].slice(0, 3) : [];
    } else next.stickerIds = [...record.stickerIds];
    records.push(next);
  }
  return records;
}
/** Normalize only: inventory quantities already include completed meals. Never replay deductions. */
export function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || ![1, 2, 3, SCHEMA].includes(raw.schemaVersion) || !Array.isArray(raw.inventory) || !Array.isArray(raw.meals)) {
    throw new Error('这份文件不是支持的机智定食 V1—V1.5 备份，或属于更新版本；原有数据没有改变。');
  }
  const state = freshState();
  const warnings = [];
  if (!knownFields(raw, ['schemaVersion', 'inventory', 'meals', 'diaries', 'dayRecords', 'mealTemplates', 'activityCategories', 'recentStickerIds', 'postOffice', 'inventoryVersion', 'updatedAt', '_readOnly'])) warnings.push('备份含有本版本不认识的新内容，已保护原文件');
  if (raw._readOnly) warnings.push('这份数据已处于保护状态，请保留原文件并恢复有效备份。');
  // Any lossy normalization makes the entire view read-only, even for planned rows.
  const text = (value, max, field) => {
    if (value != null && typeof value !== 'string') warnings.push(`${field}格式异常，已保护原文件`);
    if (typeof value === 'string' && value.trim().length > max) warnings.push(`${field}超出长度限制，已保护原文件`);
    return shortText(value, max);
  };
  const ids = new Set();
  for (const item of raw.inventory) {
    if (!item || !idOK(item.id) || ids.has(item.id) || !shortText(item.name, 60) || !numberOK(item.quantity) || !numberOK(item.perMeal) || round(item.perMeal) <= 0 || !shortText(item.unit, 12)) {
      warnings.push('一条食材数据格式异常或重复，已保护原文件'); continue;
    }
    ids.add(item.id);
    if (item.expires && !parseDate(item.expires)) warnings.push('一条食材的保质期格式异常，已保护原文件');
    state.inventory.push({ ...item, ...(item.category != null ? { category: text(item.category, 60, '食材分类') } : {}), id: item.id, name: text(item.name, 60, '食材名称'), quantity: round(item.quantity), perMeal: round(item.perMeal), unit: text(item.unit, 12, '食材单位'), note: text(item.note, 200, '食材备注'), expires: parseDate(item.expires) ? item.expires : '' });
  }
  const mealIds = new Set();
  const positions = new Set();
  for (const meal of raw.meals) {
    const position = `${meal?.date}/${meal?.slot}`;
    if (!meal || !idOK(meal.id) || mealIds.has(meal.id) || !parseDate(meal.date) || !ALL_SLOTS.includes(meal.slot) || !shortText(meal.name, 80) || meal.slot !== 'snack' && positions.has(position)) {
      warnings.push('一条餐食数据格式异常或重复，已保护原文件'); continue;
    }
    let resources;
    try { resources = storedResources(meal); }
    catch (error) { warnings.push(error.message); continue; }
    if (!knownFields(meal, ['id', 'date', 'slot', 'name', 'type', 'protein', 'note', 'resource', 'resources', 'completed', 'completedAt', 'time', 'photoId'])) warnings.push('餐食记录含有本版本不认识的新内容，已保护原文件');
    if (meal.slot !== 'snack' && meal.time != null && meal.time !== '') warnings.push('餐食的时间记录不属于加餐，已保护原文件');
    for (const resource of resources) {
      const source = rawResources(meal).find(r => r.ingredientId === resource.ingredientId);
      if (!knownFields(source, ['ingredientId', 'name', 'unit', 'amount'])) warnings.push('餐食关联含有本版本不认识的新内容，已保护原文件');
      text(source.name, 60, '关联食材名称'); text(source.unit, 12, '关联食材单位');
      const item = state.inventory.find(i => i.id === resource.ingredientId);
      if (!item) warnings.push('有餐食关联的食材已缺失，已保护原文件');
      else if (item.unit !== resource.unit) warnings.push('关联食材的库存单位已改变，无法安全返还，已保护原文件');
    }
    if (meal.completed != null && typeof meal.completed !== 'boolean') warnings.push('一条餐食的已吃状态格式异常，已保护原文件');
    if (meal.completedAt != null && typeof meal.completedAt !== 'string') warnings.push('一条餐食的完成时间格式异常，已保护原文件');
    if (!timeOK(meal.time)) warnings.push('一条加餐的时间格式异常，已保护原文件');
    if (meal.type != null && !TYPES.includes(meal.type)) warnings.push('一条餐食的类型异常，已保护原文件');
    if (meal.photoId != null && !photoReference(meal.photoId)) warnings.push('一条餐食的照片引用异常，已保护原文件');
    mealIds.add(meal.id); if (meal.slot !== 'snack') positions.add(position);
    state.meals.push({ id: meal.id, date: meal.date, slot: meal.slot, name: text(meal.name, 80, '餐食名称'), type: TYPES.includes(meal.type) ? meal.type : '其他', protein: text(meal.protein, 60, '蛋白质备注'), note: text(meal.note, 200, '餐食备注'), resources, completed: meal.completed === true, completedAt: typeof meal.completedAt === 'string' ? meal.completedAt : null, ...(meal.slot === 'snack' ? { time: timeOK(meal.time) ? meal.time || '' : '' } : {}), ...(photoReference(meal.photoId) ? { photoId: meal.photoId } : {}) });
  }
  if ((raw.schemaVersion >= 2 || raw.diaries !== undefined) && !Array.isArray(raw.diaries)) warnings.push('日记列表缺失或格式异常，已保护原文件');
  const diaryDates = new Set();
  for (const diary of Array.isArray(raw.diaries) ? raw.diaries : []) {
    if (!diary || !parseDate(diary.date) || diaryDates.has(diary.date)) { warnings.push('一条日记的日期异常或重复，已保护原文件'); continue; }
    diaryDates.add(diary.date);
    if (!knownFields(diary, ['date', 'mood', 'text', 'joy', 'updatedAt', 'photoIds'])) warnings.push('日记含有本版本不认识的新内容，已保护原文件');
    if (diary.photoIds != null) warnings.push('本版本尚不支持日记照片，请保留原文件');
    if (diary.updatedAt != null && (typeof diary.updatedAt !== 'string' || !Number.isFinite(Date.parse(diary.updatedAt)))) warnings.push('日记的编辑时间格式异常，已保护原文件');
    state.diaries.push({ date: diary.date, mood: text(diary.mood, 100, '日记心情'), text: text(diary.text, 5000, '日记正文'), joy: text(diary.joy, 500, '今日小确幸'), ...(typeof diary.updatedAt === 'string' ? { updatedAt: diary.updatedAt } : {}) });
  }
  if (raw.updatedAt != null && typeof raw.updatedAt !== 'string') warnings.push('保存时间格式异常，已保护原文件');
  if (raw.inventoryVersion != null && raw.inventoryVersion !== 1) warnings.push('食材数据属于未知版本，已保护原文件');
  if (raw.inventoryVersion === 1) state.inventoryVersion = 1;
  Object.assign(state, normalizeExtras(raw, warnings));
  state.postOffice = normalizePostOffice(raw.postOffice, warnings);
  if (raw.schemaVersion >= 3 || raw.dayRecords !== undefined) state.dayRecords = normalizeDayRecords(raw.dayRecords, warnings, state.activityCategories, raw.schemaVersion);
  state.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  const locked = warnings.length > 0;
  if (locked) state._readOnly = true;
  return { state, warnings, locked };
}
function assertMutable(state) {
  if (state._readOnly) throw protectedError('原数据已保护，请先保存原文件并恢复有效备份。');
  const recordWarnings = [];
  const extras = normalizeExtras(state, recordWarnings);
  normalizeDayRecords(state.dayRecords === undefined && state.schemaVersion < 3 ? [] : state.dayRecords, recordWarnings, extras.activityCategories, state.schemaVersion);
  if (recordWarnings.length) throw protectedError('日常打卡或贴纸数据异常，已停止修改，请保留原文件。');
  const inventoryIds = new Set();
  for (const item of state.inventory) {
    if (!item || !idOK(item.id) || inventoryIds.has(item.id) || !numberOK(item.quantity) || !shortText(item.name, 60) || !shortText(item.unit, 12) || !numberOK(item.perMeal) || round(item.perMeal) <= 0) throw protectedError('库存数据异常或重复，已停止修改，请保留原文件。');
    inventoryIds.add(item.id);
  }
  const mealIds = new Set();
  const positions = new Set();
  for (const meal of state.meals) {
    const position = `${meal?.date}/${meal?.slot}`;
    if (!meal || !idOK(meal.id) || mealIds.has(meal.id) || !parseDate(meal.date) || !ALL_SLOTS.includes(meal.slot) || typeof meal.completed !== 'boolean' || meal.slot !== 'snack' && positions.has(position)) throw protectedError('餐食记录异常或重复，已停止修改，请保留原文件。');
    mealIds.add(meal.id); if (meal.slot !== 'snack') positions.add(position);
    storedResources(meal);
  }
}
export function reserved(state, ingredientId, excludeId = null) {
  return round(state.meals.filter(meal => !meal.completed && meal.id !== excludeId).reduce((sum, meal) => sum + rawResources(meal).filter(r => r.ingredientId === ingredientId).reduce((n, r) => n + r.amount, 0), 0));
}
export function forecast(state, ingredientId, excludeId = null) {
  const item = state.inventory.find(i => i.id === ingredientId);
  return item ? round(item.quantity - reserved(state, ingredientId, excludeId)) : null;
}
function selectedResources(state, meal, existing) {
  const used = new Set();
  const old = existing?.completed ? storedResources(existing) : [];
  return rawResources(meal).map(resource => {
    if (!resource || !idOK(resource.ingredientId)) throw new Error('食材或用量不太对，请重新选择。');
    if (used.has(resource.ingredientId)) throw new Error('这份食材已经选过啦，每餐只需关联一次。');
    used.add(resource.ingredientId);
    const item = state.inventory.find(i => i.id === resource.ingredientId);
    const amount = resource.amount == null || resource.amount === '' ? item?.perMeal : resource.amount;
    if (!item || !numberOK(amount) || round(amount) <= 0) throw new Error('食材或用量不太对，请重新选择。');
    const snapshot = old.find(r => r.ingredientId === item.id);
    return { ingredientId: item.id, name: snapshot?.name || item.name, unit: snapshot?.unit || item.unit, amount: round(amount) };
  });
}
/** Prepare a full inventory transaction before writing even one quantity. */
function stockChanges(state, returns, consumes, allowNegative) {
  const changes = new Map();
  for (const [resources, direction] of [[returns, 1], [consumes, -1]]) {
    for (const resource of resources) {
      const item = state.inventory.find(i => i.id === resource.ingredientId);
      if (!item) throw new Error('关联食材找不到了，无法安全扣减或返还；请先恢复包含该食材的备份。');
      if (item.unit !== resource.unit) throw new Error('关联食材的单位已经改变，无法安全扣减或返还；请先核对库存单位。');
      changes.set(item.id, round((changes.get(item.id) || 0) + direction * resource.amount));
    }
  }
  const next = [];
  const insufficient = [];
  for (const [id, difference] of changes) {
    const item = state.inventory.find(i => i.id === id);
    const quantity = round(item.quantity + difference);
    if (!numberOK(quantity)) throw new Error('库存数量超出可保存范围，请核对数量。');
    // A neutral edit of a previously authorized negative stock requires no new permission.
    if (quantity < 0 && difference < 0 && !allowNegative) insufficient.push({ ingredientId: id, name: item.name, unit: item.unit, quantity: item.quantity, remaining: quantity });
    next.push({ item, quantity });
  }
  if (insufficient.length) {
    const error = new Error(`实际库存不足：${insufficient.map(i => i.name).join('、')}。小冰箱快见底啦，请核对用量或确认继续扣减。`);
    error.code = 'INSUFFICIENT_STOCK'; error.ingredients = insufficient;
    throw error;
  }
  return next;
}
const applyStock = changes => { for (const { item, quantity } of changes) item.quantity = quantity; };
export function putMeal(state, meal, replace = false, allowNegative = false) {
  assertMutable(state);
  if (!meal || !parseDate(meal.date) || !ALL_SLOTS.includes(meal.slot) || !shortText(meal.name, 80)) throw new Error('填好菜名和日期，就可以存下这餐啦。');
  if (!timeOK(meal.time)) throw new Error('加餐时间请填写为 HH:MM，例如 15:30。');
  const id = meal.id ?? uid();
  if (!idOK(id)) throw new Error('餐食编号格式异常，请重新打开编辑。');
  const existing = state.meals.find(m => m.id === id);
  if (existing?.completed && (existing.date !== meal.date || existing.slot !== meal.slot)) throw new Error('已吃记录不能移动；可以复制为新计划。');
  const target = meal.slot === 'snack' ? null : state.meals.find(m => m.date === meal.date && m.slot === meal.slot && m.id !== id);
  if (target?.completed) throw new Error('目标位置已有已吃记录，请选择另一餐。');
  if (target && !replace) throw new Error('目标位置已经安排了餐食。');
  const resources = selectedResources(state, meal, existing);
  const changes = existing?.completed ? stockChanges(state, storedResources(existing), resources, allowNegative) : [];
  const next = { id, date: meal.date, slot: meal.slot, name: shortText(meal.name, 80), type: TYPES.includes(meal.type) ? meal.type : '其他', protein: shortText(meal.protein, 60), note: shortText(meal.note), resources, completed: existing?.completed === true, completedAt: existing?.completed ? existing.completedAt : null, ...(meal.slot === 'snack' ? { time: meal.time || '' } : {}), ...(photoReference(meal.photoId) ? { photoId: meal.photoId } : {}) };
  const meals = state.meals.filter(m => m.id !== id && m.id !== target?.id);
  meals.push(next);
  applyStock(changes); state.meals = meals;
  return next;
}
export function removeMeal(state, id) {
  assertMutable(state);
  const meal = state.meals.find(m => m.id === id);
  if (!meal) return false;
  const changes = meal.completed ? stockChanges(state, storedResources(meal), [], true) : [];
  applyStock(changes); state.meals = state.meals.filter(m => m.id !== id);
  return true;
}
export function completeMeal(state, id, allowNegative = false) {
  assertMutable(state);
  const meal = state.meals.find(m => m.id === id);
  if (!meal || meal.completed) return false;
  const changes = stockChanges(state, [], storedResources(meal), allowNegative);
  applyStock(changes); meal.completed = true; meal.completedAt = new Date().toISOString();
  return true;
}
export function undoComplete(state, id) {
  assertMutable(state);
  const meal = state.meals.find(m => m.id === id);
  if (!meal?.completed) return false;
  const changes = stockChanges(state, storedResources(meal), [], true);
  applyStock(changes); meal.completed = false; meal.completedAt = null;
  return true;
}
export function transferMeal(state, id, date, slot, move, replace = false) {
  assertMutable(state);
  const source = state.meals.find(m => m.id === id);
  if (!source) throw new Error('找不到这餐啦。');
  if (move && source.completed) throw new Error('已吃记录不能移动；可以复制为新计划。');
  if (source.date === date && source.slot === slot && (move || slot !== 'snack')) throw new Error('请选择另一个日期或餐次。');
  const resources = storedResources(source);
  for (const resource of resources) {
    const item = state.inventory.find(i => i.id === resource.ingredientId);
    if (!item || item.unit !== resource.unit) throw new Error('原关联食材缺失或单位已改变，请核对库存后再复制或移动。');
  }
  const next = structuredClone(source);
  next.id = move ? source.id : uid(); next.date = date; next.slot = slot;
  next.completed = false; next.completedAt = null;
  const saved = putMeal(state, next, replace);
  // Carry the complete association snapshots, including historical ingredient names.
  saved.resources = resources;
  return saved;
}
export function putDiary(state, diary) {
  assertMutable(state);
  if (!diary || !parseDate(diary.date)) throw new Error('请选择有效日期，再收好今天的故事。');
  for (const [key, max, label] of [['mood', 100, '心情'], ['text', 5000, '日记'], ['joy', 500, '小确幸']]) {
    if (diary[key] != null && typeof diary[key] !== 'string') throw new Error(`${label}请使用文字填写。`);
    if (typeof diary[key] === 'string' && diary[key].length > max) throw new Error(`${label}最多可以保存 ${max} 个字符。`);
  }
  const next = { date: diary.date, mood: shortText(diary.mood, 100), text: shortText(diary.text, 5000), joy: shortText(diary.joy, 500), updatedAt: new Date().toISOString() };
  state.diaries = (state.diaries || []).filter(d => d.date !== diary.date);
  if (next.mood || next.text || next.joy) state.diaries.push(next);
  return next;
}
export function removeDiary(state, date) {
  assertMutable(state);
  if (!parseDate(date)) throw new Error('请选择有效日期。');
  const previous = (state.diaries || []).length;
  state.diaries = (state.diaries || []).filter(d => d.date !== date);
  return state.diaries.length !== previous;
}
