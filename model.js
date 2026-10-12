export const SCHEMA = 1;
export const SLOTS = ['breakfast', 'lunch', 'dinner'];
export const TYPES = ['自制便当', '公司食堂', '外出就餐', '外卖', '零食 / 加餐', '其他'];
export const freshState = () => ({ schemaVersion: SCHEMA, inventory: [], meals: [], updatedAt: null });
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
export function normalize(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || raw.schemaVersion !== SCHEMA || !Array.isArray(raw.inventory) || !Array.isArray(raw.meals)) {
    throw new Error('这份文件不是支持的机智定食 V1 备份，原有数据没有改变。');
  }
  const state = freshState();
  const warnings = [];
  const ids = new Set();
  for (const item of raw.inventory) {
    if (!item || !shortText(item.id, 100) || ids.has(item.id) || !shortText(item.name, 60) || !numberOK(item.quantity) || !numberOK(item.perMeal) || round(item.perMeal) <= 0 || !shortText(item.unit, 12)) {
      warnings.push('一条食材数据格式异常，已跳过'); continue;
    }
    ids.add(item.id);
    state.inventory.push({ id: item.id, name: shortText(item.name, 60), quantity: round(item.quantity), perMeal: round(item.perMeal), unit: shortText(item.unit, 12), note: shortText(item.note), expires: parseDate(item.expires) ? item.expires : '' });
  }
  const mealIds = new Set();
  const positions = new Set();
  for (const meal of raw.meals) {
    if (!meal || !shortText(meal.id, 100) || mealIds.has(meal.id) || !parseDate(meal.date) || !SLOTS.includes(meal.slot) || !shortText(meal.name, 80) || positions.has(`${meal.date}/${meal.slot}`)) {
      warnings.push('一条餐食数据格式异常或重复，已跳过'); continue;
    }
    let resource = null;
    if (meal.resource) {
      const r = meal.resource;
      if (shortText(r.ingredientId, 100) && shortText(r.name, 60) && shortText(r.unit, 12) && numberOK(r.amount) && r.amount > 0 && round(r.amount) > 0) {
        resource = { ingredientId: r.ingredientId, name: shortText(r.name, 60), unit: shortText(r.unit, 12), amount: round(r.amount) };
        if (!ids.has(r.ingredientId)) warnings.push('有餐食关联的食材已缺失，仍保留餐食记录');
      } else {
        // Skip a broken completed row so it cannot return an unknown stock amount.
        if (meal.completed === true) { warnings.push('一条已吃餐食的库存记录异常，已跳过；请保留原文件'); continue; }
        warnings.push('一条餐食的食材用量异常，已保留菜名并移除关联');
      }
    }
    mealIds.add(meal.id); positions.add(`${meal.date}/${meal.slot}`);
    state.meals.push({ id: meal.id, date: meal.date, slot: meal.slot, name: shortText(meal.name, 80), type: TYPES.includes(meal.type) ? meal.type : '其他', protein: shortText(meal.protein, 60), note: shortText(meal.note), resource, completed: meal.completed === true, completedAt: typeof meal.completedAt === 'string' ? meal.completedAt : null, ...(photoReference(meal.photoId) ? { photoId: meal.photoId } : {}) });
  }
  state.updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : null;
  return { state, warnings };
}
export function reserved(state, ingredientId, excludeId = null) {
  return round(state.meals.filter(m => !m.completed && m.id !== excludeId && m.resource?.ingredientId === ingredientId).reduce((n, m) => n + m.resource.amount, 0));
}
export function forecast(state, ingredientId, excludeId = null) {
  const item = state.inventory.find(i => i.id === ingredientId);
  return item ? round(item.quantity - reserved(state, ingredientId, excludeId)) : null;
}
export function putMeal(state, meal, replace = false) {
  if (!parseDate(meal.date) || !SLOTS.includes(meal.slot) || !shortText(meal.name, 80)) throw new Error('填好菜名和日期，就可以存下这餐啦。');
  const existing = state.meals.find(m => m.id === meal.id);
  if (existing?.completed) throw new Error('这餐已经吃过啦，请先撤销已吃再修改。');
  const target = state.meals.find(m => m.date === meal.date && m.slot === meal.slot && m.id !== meal.id);
  if (target?.completed) throw new Error('目标位置已有已吃记录，请选择另一餐。');
  if (target && !replace) throw new Error('目标位置已经安排了餐食。');
  if (meal.resource) {
    const item = state.inventory.find(i => i.id === meal.resource.ingredientId);
    if (!item || !numberOK(meal.resource.amount) || round(meal.resource.amount) <= 0) throw new Error('食材或用量不太对，请重新选择。');
    meal.resource = { ingredientId: item.id, name: item.name, unit: item.unit, amount: round(meal.resource.amount) };
  }
  state.meals = state.meals.filter(m => m.id !== meal.id && m.id !== target?.id);
  state.meals.push({ ...meal, name: shortText(meal.name, 80), note: shortText(meal.note), protein: shortText(meal.protein, 60), completed: false, completedAt: null });
}
export function removeMeal(state, id) {
  if (state.meals.find(m => m.id === id)?.completed) throw new Error('先撤销已吃，才能删除这餐哦。');
  state.meals = state.meals.filter(m => m.id !== id);
}
export function completeMeal(state, id, allowNegative = false) {
  const meal = state.meals.find(m => m.id === id);
  if (!meal || meal.completed) return false;
  if (meal.resource) {
    const item = state.inventory.find(i => i.id === meal.resource.ingredientId);
    if (!item) throw new Error('关联食材找不到了，请先编辑这餐并重新选择食材。');
    if (item.quantity < meal.resource.amount && !allowNegative) throw new Error('实际库存不足，请核对用量。');
    item.quantity = round(item.quantity - meal.resource.amount);
  }
  meal.completed = true;
  meal.completedAt = new Date().toISOString();
  return true;
}
export function undoComplete(state, id) {
  const meal = state.meals.find(m => m.id === id);
  if (!meal?.completed) return false;
  if (meal.resource) {
    const item = state.inventory.find(i => i.id === meal.resource.ingredientId);
    if (!item) throw new Error('原食材缺失，无法安全返还库存；请先恢复包含该食材的备份。');
    item.quantity = round(item.quantity + meal.resource.amount);
  }
  meal.completed = false; meal.completedAt = null;
  return true;
}
export function transferMeal(state, id, date, slot, move, replace = false) {
  const source = state.meals.find(m => m.id === id);
  if (!source) throw new Error('找不到这餐啦。');
  if (move && source.completed) throw new Error('已吃记录不能移动；可以复制为新计划。');
  if (source.date === date && source.slot === slot) throw new Error('请选择另一个日期或餐次。');
  const next = structuredClone(source);
  next.id = move ? source.id : uid(); next.date = date; next.slot = slot;
  next.completed = false; next.completedAt = null;
  putMeal(state, next, replace);
  return next;
}
