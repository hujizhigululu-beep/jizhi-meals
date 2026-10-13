import { addDays, parseDate, round } from './model.js';

export const CATEGORIES = ['蛋白质', '蔬菜', '碳水', '整套食物', '早餐'];
const COMPONENTS = CATEGORIES.slice(0, 3);
export const portions = item => Math.max(0, item.quantity / item.perMeal);
const whole = n => Math.floor(n + 1e-9);
const expired = (item, date) => item.expires && item.expires < date;

export function stockSummary(inventory, date) {
  const totals = Object.fromEntries(CATEGORIES.map(c => [c, 0]));
  for (const item of inventory) if (CATEGORIES.includes(item.category) && !expired(item, date)) totals[item.category] += portions(item);
  const minimum = Math.min(...COMPONENTS.map(c => totals[c]));
  const combined = whole(minimum), ready = whole(totals['整套食物']);
  return { totals, combined, ready, total: combined + ready, breakfast: whole(totals['早餐']), bottlenecks: COMPONENTS.filter(c => totals[c] === minimum) };
}

/** Pure simulation. Existing plans have priority over blank slots; completed use is never replayed. */
export function predictRunway(state, start, daily = 2, maxDays = 3660) {
  if (!parseDate(start) || ![1, 2].includes(daily)) throw new Error('请选择有效日期和每日 1 / 2 顿。');
  const inventory = state.inventory.map(i => ({ ...i }));
  const plans = state.meals.filter(m => !m.completed && m.date >= start);
  const remaining = new Map();
  for (const meal of plans) for (const r of meal.resources || []) remaining.set(r.ingredientId, round((remaining.get(r.ingredientId) || 0) + r.amount));
  const byDate = new Map();
  for (const meal of state.meals) {
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date).push(meal);
  }
  let last = null, covered = 0, skipped = 0;
  const failure = (date, slot, reason) => ({ last, covered, skipped, shortage: { date, slot, reason }, capped: false });
  const allocate = (category, date, changes) => {
    let needed = 1;
    for (const item of inventory.filter(i => i.category === category && !expired(i, date)).sort((a,b) => (a.expires || '9999').localeCompare(b.expires || '9999'))) {
      const available = Math.max(0, (item.quantity - (remaining.get(item.id) || 0)) / item.perMeal);
      const used = Math.min(needed, available);
      changes.push([item, used * item.perMeal]); needed = Math.max(0, needed - used);
      if (needed < 1e-9) return true;
    }
    return false;
  };
  for (let day = 0; day < maxDays; day++) {
    const date = addDays(start, day);
    if (!date) return { last, covered, skipped, shortage: null, capped: true };
    const rows = byDate.get(date) || [];
    // One default meal means dinner; explicit plans are honored at every slot.
    const events = ['breakfast', 'lunch', 'dinner', 'snack'].flatMap(slot => {
      const matches = rows.filter(m => m.slot === slot).sort((a,b) => (a.time || '').localeCompare(b.time || ''));
      return matches.length ? matches : (slot === 'dinner' || daily === 2 && slot === 'lunch') ? [{ date, slot, resources: null }] : [];
    });
    for (const meal of events) {
      if (meal.completed) continue;
      const isMain = ['lunch', 'dinner'].includes(meal.slot);
      if (meal.resources !== null) {
        const resources = meal.resources || [];
        if (!resources.length) { if (isMain) skipped++; continue; }
        const changes = [];
        for (const r of resources) {
          const item = inventory.find(i => i.id === r.ingredientId);
          if (!item || item.unit !== r.unit || item.quantity < r.amount || expired(item, date)) return failure(date, meal.slot, `${r.name}不足或已过保质期`);
          changes.push([item, r.amount]);
        }
        for (const [item, amount] of changes) {
          item.quantity = round(item.quantity - amount);
          remaining.set(item.id, round((remaining.get(item.id) || 0) - amount));
        }
      } else {
        let changes = [];
        if (!COMPONENTS.every(c => allocate(c, date, changes))) {
          changes = [];
          if (!allocate('整套食物', date, changes)) return failure(date, meal.slot, '余下库存无法组成完整餐食（已有计划用量已优先预留）');
        }
        for (const [item, amount] of changes) item.quantity = round(item.quantity - amount);
      }
      if (isMain) { last = { date, slot: meal.slot }; covered++; }
    }
  }
  return { last, covered, skipped, shortage: null, capped: true };
}

/**
 * Main-course-only forecast. Quantities remain local to this simulation: choosing
 * a mode never changes inventory, reservations, plans, or completed records.
 * The breakdown counts meals actually covered, rather than ingredient portions,
 * so a planned meal using two proteins still contributes exactly one meal.
 */
export function predictMainCourseRunway(state, start, daily = 2, maxDays = 3660) {
  if (!parseDate(start) || ![1, 2].includes(daily)) throw new Error('请选择有效日期和每日 1 / 2 顿。');
  if (!Number.isInteger(maxDays) || maxDays < 0) throw new Error('预测天数需要是有效的非负整数。');
  const limit = Math.min(maxDays, 3660);
  const mainCategories = ['蛋白质', '整套食物'];
  const slots = ['breakfast', 'lunch', 'dinner', 'snack'];
  let last = null, covered = 0, skipped = 0, proteinMeals = 0, readyMeals = 0;
  const result = (shortage = null, capped = false) => ({ last, covered, skipped, shortage, capped, proteinMeals, readyMeals });
  const failure = (date, slot, reason) => result({ date, slot, reason });
  const firstSlot = daily === 1 ? 'dinner' : 'lunch';
  if (!Array.isArray(state?.inventory) || !Array.isArray(state?.meals)) return failure(start, firstSlot, '库存或餐食列表格式异常，无法安全预测。');
  const inventory = state.inventory.map(item => ({ ...item }));
  const items = new Map();
  for (const item of inventory) {
    if (typeof item.id !== 'string' || !item.id || items.has(item.id)) return failure(start, firstSlot, '库存食材编号缺失或重复，无法安全预测。');
    if (mainCategories.includes(item.category) && (!Number.isFinite(item.quantity) || !Number.isFinite(item.perMeal) || round(item.perMeal) <= 0 || typeof item.unit !== 'string' || !item.unit)) {
      return failure(start, firstSlot, `${item.name || '主菜食材'}的库存或每餐用量异常，无法安全预测。`);
    }
    items.set(item.id, item);
  }
  const remaining = new Map();
  const resourcesByMeal = new Map();
  const byDate = new Map();
  if (state.meals.some(meal => !meal || typeof meal !== 'object' || Array.isArray(meal))) return failure(start, firstSlot, '餐食条目格式异常，无法安全预测。');
  // Match inventory's forecast reservation scope: even an older uneaten plan
  // keeps its stock reserved. Only future events release their own reservation.
  const plans = state.meals.filter(meal => !meal.completed).sort((a, b) => String(a.date).localeCompare(String(b.date)) || slots.indexOf(a.slot) - slots.indexOf(b.slot));
  for (const meal of plans) {
    const date = parseDate(meal.date) ? meal.date : start;
    const slot = slots.includes(meal.slot) ? meal.slot : firstSlot;
    if (!parseDate(meal.date) || !slots.includes(meal.slot)) return failure(date, slot, '未吃餐食的日期或餐次异常，无法安全预测。');
    const raw = meal.resources === undefined ? (meal.resource == null ? [] : [meal.resource]) : meal.resources;
    if (!Array.isArray(raw) || meal.resources !== undefined && meal.resource != null) return failure(date, slot, '餐食的食材关联格式异常，无法安全预测。');
    const used = new Set();
    const tracked = [];
    for (const resource of raw) {
      const item = resource && items.get(resource.ingredientId);
      if (!resource || typeof resource.ingredientId !== 'string' || !resource.ingredientId || !item) return failure(date, slot, '餐食关联的食材已不存在或编号异常，请检查这餐的食材。');
      if (used.has(resource.ingredientId)) return failure(date, slot, `${item.name || '食材'}在同一餐中关联重复，无法安全预测。`);
      used.add(resource.ingredientId);
      if (resource.unit !== item.unit) return failure(date, slot, `${resource.name || item.name || '食材'}的关联单位与当前库存不一致，请重新选择食材。`);
      if (!Number.isFinite(resource.amount) || round(resource.amount) <= 0) return failure(date, slot, `${resource.name || item.name || '食材'}的关联用量异常，无法安全预测。`);
      // Vegetables, carbs, breakfast stock, and legacy categories never limit
      // this mode. Their relation must still be structurally valid.
      if (!mainCategories.includes(item.category)) continue;
      tracked.push({ item, amount: resource.amount, name: resource.name || item.name });
      remaining.set(item.id, (remaining.get(item.id) || 0) + resource.amount);
    }
    resourcesByMeal.set(meal, tracked);
  }
  for (const meal of state.meals) {
    if (!byDate.has(meal.date)) byDate.set(meal.date, []);
    byDate.get(meal.date).push(meal);
  }
  const allocate = (category, date) => {
    let needed = 1;
    const changes = [];
    const candidates = inventory.filter(item => item.category === category && !expired(item, date)).sort((a, b) => (a.expires || '9999').localeCompare(b.expires || '9999'));
    for (const item of candidates) {
      const available = Math.max(0, (item.quantity - (remaining.get(item.id) || 0)) / item.perMeal);
      const used = Math.min(needed, available);
      if (used > 0) changes.push([item, used * item.perMeal]);
      needed = Math.max(0, needed - used);
      if (needed < 1e-9) return changes;
    }
    return null;
  };
  for (let day = 0; day < limit; day++) {
    const date = addDays(start, day);
    if (!date) return result(null, true);
    const rows = byDate.get(date) || [];
    const events = slots.flatMap(slot => {
      const matches = rows.filter(meal => meal.slot === slot).sort((a, b) => (a.time || '').localeCompare(b.time || ''));
      return matches.length ? matches.map(meal => ({ meal, automatic: false })) : (slot === 'dinner' || daily === 2 && slot === 'lunch') ? [{ meal: { date, slot }, automatic: true }] : [];
    });
    for (const { meal, automatic } of events) {
      if (meal.completed) continue;
      const isMain = meal.slot === 'lunch' || meal.slot === 'dinner';
      let category;
      if (!automatic) {
        const resources = resourcesByMeal.get(meal);
        if (!resources.length) { if (isMain) skipped++; continue; }
        for (const { item, amount, name } of resources) {
          const tolerance = Number.EPSILON * Math.max(1, Math.abs(item.quantity), amount) * 16;
          if (item.quantity < amount && amount - item.quantity > tolerance || expired(item, date)) return failure(date, meal.slot, `${name}不足或已过保质期（已有计划用量已优先预留）`);
        }
        for (const { item, amount } of resources) {
          item.quantity = Math.max(0, item.quantity - amount);
          remaining.set(item.id, Math.max(0, (remaining.get(item.id) || 0) - amount));
        }
        category = resources.some(resource => resource.item.category === '整套食物') ? '整套食物' : '蛋白质';
      } else {
        category = '蛋白质';
        let changes = allocate(category, date);
        if (!changes) { category = '整套食物'; changes = allocate(category, date); }
        if (!changes) return failure(date, meal.slot, '余下蛋白质与整套食物无法组成一顿主菜（已有计划用量已优先预留）');
        // Mixed protein portions can consume a fraction smaller than the stored
        // .001 unit. Rounding this local balance creates or discards food; keep
        // its precision until the simulation ends. Nothing is persisted here.
        for (const [item, amount] of changes) item.quantity = Math.max(0, item.quantity - amount);
      }
      if (isMain) {
        last = { date, slot: meal.slot }; covered++;
        if (category === '整套食物') readyMeals++; else proteinMeals++;
      }
    }
  }
  return result(null, true);
}
