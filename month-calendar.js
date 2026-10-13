import { parseDate, ALL_SLOTS } from './model.js';
import { monthStats } from './activity.js';

export const MONTH_MODES = Object.freeze({ all: '总月历', meal: '吃饭', exercise: '运动', study: '学习' });
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const LABELS = { meal: '有餐食记录', exercise: '运动已打卡', study: '学习已打卡' };
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

/** Local dates only: never parse a date-only ISO string through UTC. */
export function monthDate(month, day = 1) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month) || !Number.isInteger(day) || day < 1 || day > 31) return null;
  const value = `${month}-${String(day).padStart(2, '0')}`;
  return parseDate(value) ? value : null;
}

/** Return null when paging beyond the supported 0001..9999 years. */
export function shiftMonth(month, amount) {
  if (!monthDate(month) || !Number.isInteger(amount)) return null;
  const [year, number] = month.split('-').map(Number);
  const index = (year - 1) * 12 + number - 1 + amount;
  if (index < 0 || index >= 9999 * 12) return null;
  return `${String(Math.floor(index / 12) + 1).padStart(4, '0')}-${String(index % 12 + 1).padStart(2, '0')}`;
}

/** Monday-first, complete dashed rows including the empty page corners. */
export function monthCells(month) {
  const first = parseDate(monthDate(month));
  if (!first) throw new Error('请选择有效月份。');
  const cells = Array((first.getDay() + 6) % 7).fill(null);
  for (let day = 1; day <= 31; day++) {
    const date = monthDate(month, day);
    if (!date) break;
    cells.push(date);
  }
  while (cells.length % 7) cells.push(null);
  return cells;
}

function recordMarks(state) {
  const marks = new Map();
  const day = date => {
    if (!marks.has(date)) marks.set(date, { meal: false, exercise: false, study: false });
    return marks.get(date);
  };
  for (const meal of state?.meals || []) {
    if (parseDate(meal?.date) && ALL_SLOTS.includes(meal.slot) && typeof meal.name === 'string' && meal.name.trim()) day(meal.date).meal = true;
  }
  for (const record of state?.dayRecords || []) {
    if (!parseDate(record?.date)) continue;
    const mark = day(record.date);
    mark.exercise ||= record.exercise?.checked === true;
    mark.study ||= record.study?.checked === true;
  }
  return marks;
}

/** Read-only presentation; the app handles the data-month-* controls. */
export function renderMonthCalendar(state, { month, mode = 'all', selectedDate, today } = {}) {
  if (!monthDate(month)) throw new Error('请选择有效月份。');
  if (!Object.hasOwn(MONTH_MODES, mode)) mode = 'all';
  const [year, number] = month.split('-').map(Number);
  const title = `${String(year).padStart(4, '0')}年${number}月`;
  const marks = recordMarks(state);
  const stats = monthStats(state, month);
  const kinds = mode === 'all' ? ['meal', 'exercise', 'study'] : [mode];
  const cells = monthCells(month).map(date => {
    if (!date) return '<span class="month-empty-cell" aria-hidden="true"></span>';
    const parsed = parseDate(date);
    const flags = marks.get(date) || {};
    const labels = kinds.filter(kind => flags[kind]).map(kind => LABELS[kind]);
    const label = `${title}${parsed.getDate()}日 ${WEEKDAYS[parsed.getDay()]}${date === today ? '，今天' : ''}${labels.length ? '，' + labels.join('，') : '，暂无对应记录'}`;
    return `<button type="button" class="month-day${date === today ? ' is-today' : ''}" data-month-date="${date}" aria-label="${escape(label)}" aria-pressed="${date === selectedDate}"><span class="month-day-number">${parsed.getDate()}</span><span class="month-dots" aria-hidden="true">${kinds.filter(kind => flags[kind]).map(kind => `<span class="month-dot" data-kind="${kind}"></span>`).join('')}</span></button>`;
  }).join('');
  return `<section class="month-calendar" aria-label="${title}生活月历">
    <div class="month-paper-binding" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span><span></span></div>
    <div class="month-paper-tag" aria-hidden="true"><span>LITTLE CALENDAR</span><span>把每一天，轻轻收好 ♡</span></div>
    <div class="month-toolbar"><button type="button" data-month-step="-1" aria-label="上个月" ${shiftMonth(month, -1) ? '' : 'disabled'}>‹</button><label class="month-selector"><input type="month" id="calendar-month" min="0001-01" max="9999-12" value="${month}" aria-label="查看月份"></label><button type="button" data-month-step="1" aria-label="下个月" ${shiftMonth(month, 1) ? '' : 'disabled'}>›</button></div>
    <div class="month-modes" aria-label="月历显示类型">${Object.entries(MONTH_MODES).map(([id, name]) => `<button type="button" data-month-mode="${id}" aria-pressed="${id === mode}">${name}</button>`).join('')}</div>
    <div class="month-weekdays" aria-hidden="true">${['一', '二', '三', '四', '五', '六', '日'].map(label => `<span>${label}</span>`).join('')}</div>
    <div class="month-grid" role="group" aria-label="${title}日期">${cells}</div>
    <div class="month-legend" aria-label="圆点图例">${['meal', 'exercise', 'study'].map(kind => `<span><i class="month-dot" data-kind="${kind}" aria-hidden="true"></i>${kind === 'meal' ? '吃饭' : kind === 'exercise' ? '运动' : '学习'}</span>`).join('')}</div>
    <div class="month-stats" aria-label="${title}累计天数">${[['meal', '餐食记录', stats.mealDays], ['exercise', '运动打卡', stats.exerciseDays], ['study', '学习打卡', stats.studyDays]].map(([kind, label, count]) => `<div class="month-stat" data-kind="${kind}"><span>${label}</span><p><strong>${count}</strong><small>天</small></p>${stats[`${kind}Minutes`] ? `<span class="month-stat-minutes">${stats[`${kind}Minutes`]} 分钟</span>` : ''}</div>`).join('')}</div>
  </section>`;
}
