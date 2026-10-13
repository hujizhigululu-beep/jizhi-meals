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
