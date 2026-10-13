import { addDays, parseDate, SLOTS } from './model.js';
import { getSticker } from './stickers.js';

const LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
const SHORT_LABELS = { breakfast: '早', lunch: '午', dinner: '晚' };
const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
const INITIAL_RADIUS = 28;
const PAGE_SIZE = 14;
const MAX_ROWS = 180;
const controllers = new WeakMap();
const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const text = value => typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
const excerpt = (value, max = 42) => {
  const chars = Array.from(text(value));
  return chars.length > max ? `${chars.slice(0, max).join('')}…` : chars.join('');
};

function indexDays(state) {
  const meals = new Map();
  const diaries = new Map();
  const dayRecords = new Map();
  for (const meal of state?.meals || []) {
    if (!meal || !parseDate(meal.date) || ![...SLOTS, 'snack'].includes(meal.slot) || !text(meal.name)) continue;
    if (!meals.has(meal.date)) meals.set(meal.date, []);
    meals.get(meal.date).push(meal);
  }
  for (const diary of state?.diaries || []) {
    if (!diary || !parseDate(diary.date) || ![diary.mood, diary.text, diary.joy].some(value => text(value))) continue;
    if (!diaries.has(diary.date)) diaries.set(diary.date, diary);
  }
  for (const record of state?.dayRecords || []) {
    if (!record || !parseDate(record.date) || dayRecords.has(record.date)) continue;
    // Index in one pass, rather than searching the complete journal for every date.
    const day = structuredClone(record);
    const hasActivity = ['study', 'exercise'].some(kind => day[kind]?.checked === true || day[kind]?.items?.some(item => text(item?.content) || text(item?.note) || typeof item?.minutes === 'number' && Number.isFinite(item.minutes)));
    const stickerIds = (day.stickerIds || []).filter(id => getSticker(id));
    if (hasActivity || stickerIds.length) dayRecords.set(record.date, { ...day, stickerIds });
  }
  return { meals, diaries, dayRecords };
}

function daySummary(index, date) {
  if (!parseDate(date)) throw new Error('请选择有效日期，再翻翻这页小日子。');
  const meals = index.meals.get(date) || [];
  const mainMeals = SLOTS.flatMap(slot => {
    const meal = meals.find(row => row.slot === slot);
    return meal ? [{ slot, label: LABELS[slot], name: text(meal.name), completed: meal.completed === true }] : [];
  });
  const snacks = meals.filter(meal => meal.slot === 'snack').map(meal => ({ name: text(meal.name), time: text(meal.time), completed: meal.completed === true }));
  const entry = index.diaries.get(date);
  const diary = entry ? { mood: text(entry.mood), text: text(entry.text), joy: text(entry.joy), excerpt: excerpt(text(entry.text) || text(entry.joy)) } : null;
  const record = index.dayRecords.get(date);
  return {
    date, mainMeals, snacks, snackCount: snacks.length,
    mealCount: mainMeals.length + snacks.length,
    completedCount: [...mainMeals, ...snacks].filter(meal => meal.completed).length,
    diary, ...(record ? { study: record.study, exercise: record.exercise, stickerIds: record.stickerIds } : {}),
    hasRecords: mainMeals.length > 0 || snacks.length > 0 || diary !== null || !!record,
  };
}

/** Read-only raw text preview. Rendering escapes these values; inventory is never touched. */
export function summarizeDay(state, date) {
  return daySummary(indexDays(state), date);
}

/** A continuous date window, clipped safely at 0001-01-01 and 9999-12-31. */
export function timelineDates(center, before = INITIAL_RADIUS, after = INITIAL_RADIUS) {
  if (!parseDate(center)) throw new Error('请选择有效日期，再翻翻这页小日子。');
  if (![before, after].every(value => Number.isInteger(value) && value >= 0 && value <= MAX_ROWS)) throw new Error('日期范围不太对，请重新选择。');
  const dates = [center];
  let earlier = center, later = center;
  for (let i = 0; i < before; i++) {
    earlier = addDays(earlier, -1);
    if (!earlier) break;
    dates.unshift(earlier);
  }
  for (let i = 0; i < after; i++) {
    later = addDays(later, 1);
    if (!later) break;
    dates.push(later);
  }
  return dates;
}

function renderExpandedSections(preview, entry) {
  const meals = preview.mealCount ? `<section class="timeline-record-section timeline-food-section" aria-label="餐食">
    <h3 class="timeline-section-title">餐食</h3>
    ${preview.mainMeals.length ? `<div class="timeline-meals">${preview.mainMeals.map(meal => `<div class="timeline-meal${meal.completed ? ' is-eaten' : ''}" data-slot="${meal.slot}"><small class="timeline-meal-label">${meal.label}</small><span class="timeline-meal-name">${escape(meal.name)}</span>${meal.completed ? '<small class="timeline-meal-state">已吃</small>' : ''}</div>`).join('')}</div>` : ''}
    ${preview.snackCount ? `<div class="timeline-snacks"><p class="timeline-snack-label">加餐 ${preview.snackCount} 条</p><ul class="timeline-snack-list">${preview.snacks.map(snack => `<li class="timeline-snack-item${snack.completed ? ' is-eaten' : ''}">${snack.time ? `<small class="timeline-snack-time">${escape(snack.time)}</small>` : ''}<span class="timeline-meal-name">${escape(snack.name)}</span>${snack.completed ? '<small class="timeline-meal-state">已吃</small>' : ''}</li>`).join('')}</ul></div>` : ''}
  </section>` : '';
  const diary = preview.diary;
  // Summaries stay normalized; an opened page reads the original diary, including line breaks.
  const storyText = typeof entry?.text === 'string' ? entry.text : diary?.text || '';
  const joyText = typeof entry?.joy === 'string' ? entry.joy : diary?.joy || '';
  const feelings = diary && (diary.mood || diary.joy) ? `<section class="timeline-record-section timeline-feelings-section timeline-diary" aria-label="心情与小确幸">
    <h3 class="timeline-section-title">心情 · 小确幸</h3>
    ${diary.mood ? `<p class="timeline-feeling-row"><small>心情</small><span>${escape(diary.mood)}</span></p>` : ''}
    ${diary.joy ? `<p class="timeline-feeling-row"><small>小确幸</small><span class="timeline-full-note">${escape(joyText)}</span></p>` : ''}
  </section>` : '';
  const story = diary?.text ? `<section class="timeline-record-section timeline-story-section timeline-diary" aria-label="今日小故事">
    <h3 class="timeline-section-title">今日小故事</h3><p class="timeline-story-text">${escape(storyText)}</p>
  </section>` : '';
  const activities = ['study', 'exercise'].map(kind => {
    const activity = preview[kind];
    if (!activity || !activity.checked && !activity.items?.length) return '';
    const label = kind === 'study' ? '学习' : '运动';
    return `<section class="timeline-record-section timeline-activity-section" data-kind="${kind}" aria-label="${label}"><h3 class="timeline-section-title">${label}</h3><span class="timeline-activity-state${activity.checked ? '' : ' is-unchecked'}">${activity.checked ? '已打卡' : '未打卡 · 保留详情'}</span>${activity.items?.length ? `<ul class="timeline-activity-items">${activity.items.map(item => `<li class="timeline-activity-item">${text(item.content) ? `<span>${escape(item.content)}</span>` : ''}${typeof item.minutes === 'number' && Number.isFinite(item.minutes) ? ` <small>${escape(item.minutes)} 分钟</small>` : ''}${text(item.note) ? `<p>${escape(item.note)}</p>` : ''}</li>`).join('')}</ul>` : ''}</section>`;
  }).join('');
  const stickers = preview.stickerIds?.length ? `<div class="timeline-sticker-strip" aria-label="当天的小贴纸">${preview.stickerIds.map(id => { const sticker = getSticker(id); return `<img src="${escape(sticker.src)}" alt="${escape(sticker.name)}" width="35" height="35" loading="lazy">`; }).join('')}</div>` : '';
  return meals + activities + feelings + story + stickers;
}

function renderRows(index, dates, { selectedDate, today, expandedDates = new Set() } = {}) {
  return dates.map(date => {
    const day = parseDate(date);
    if (!day) throw new Error('时间轴包含无效日期，请重新选择日期。');
    const preview = daySummary(index, date);
    const dateLabel = `${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日 ${WEEKDAYS[day.getDay()]}`;
    const emptyMessages = ['今天的故事，慢慢写 (｡･ω･｡)ﾉ♡', '留一页给小日子 (˶ᵔ ᵕ ᵔ˶)', '想记的时候再来呀 (´｡• ᵕ •｡`) ♡'];
    const activitySummary = ['study', 'exercise'].flatMap(kind => {
      const activity = preview[kind];
      if (!activity || !activity.checked && !activity.items?.length) return [];
      const label = kind === 'study' ? '学习' : '运动';
      const content = activity.items?.map(item => text(item.content)).filter(Boolean).join('、');
      return [`${label}${content ? (activity.checked ? ' · ' : '详情 · ') + content : activity.checked ? '已打卡' : '详情已保留'}`];
    }).join('  ');
    const compact = preview.diary?.excerpt || preview.diary?.mood || preview.mainMeals.map(meal => SHORT_LABELS[meal.slot] + ' · ' + meal.name).join('  ') || (preview.snackCount ? '🍓 ' + preview.snacks[0].name : '') || activitySummary || (preview.stickerIds?.length ? '当天的小贴纸' : '');
    const recordMarks = [preview.mealCount || preview.diary ? preview.mealCount + ' 餐' : '', preview.study?.checked ? '学习' : preview.study?.items?.length ? '学习未打卡' : '', preview.exercise?.checked ? '运动' : preview.exercise?.items?.length ? '运动未打卡' : '', preview.diary?.text ? '✎ 小故事' : preview.diary ? '✎ 小记' : '', preview.stickerIds?.length ? '小贴纸' : ''].filter(Boolean).join(' · ');
    return `<article class="timeline-row${date === selectedDate ? ' is-selected' : ''}${date === today ? ' is-today' : ''}${preview.hasRecords ? ' has-records' : ''}${day.getDay() === 0 || day.getDay() === 6 ? ' is-weekend' : ''}${day.getDate() === 1 ? ' is-month-start' : ''}" data-timeline-date="${date}">
      <details class="timeline-day-details" ${expandedDates.has(date) ? 'open' : ''}><summary class="timeline-day-summary" aria-label="${escape(dateLabel + (date === today ? '，今天' : '') + (preview.hasRecords ? '，' + excerpt(compact, 64) : '，留白') + '，展开或收起当天摘要')}">
      <span class="timeline-date"><span class="timeline-calendar-date"><span class="timeline-month">${day.getMonth() + 1}月</span><strong class="timeline-day-number">${day.getDate()}</strong></span><span class="timeline-weekday">${WEEKDAYS[day.getDay()]}</span></span>
      <span class="timeline-preview"><span class="${preview.hasRecords ? 'timeline-compact-line' : 'timeline-empty'}">${escape(preview.hasRecords ? excerpt(compact, 64) : emptyMessages[day.getDate() % emptyMessages.length])}</span><span class="timeline-record-mark">${preview.hasRecords ? recordMarks : '留白'}</span></span><span class="timeline-chevron" aria-hidden="true">⌄</span></summary>
      <div class="timeline-expanded">${renderExpandedSections(preview, index.diaries.get(date))}<button type="button" class="text-button timeline-open" data-timeline-open="${date}" aria-label="${escape(dateLabel + '，翻开当天记录')}">${preview.hasRecords ? '翻开这一天 ↗' : '写下这一天 ↗'}</button></div>
      </details></article>`;
  }).join('');
}

/** Public HTML renderer for review/tests; every string from a user's records is escaped. */
export function renderTimelineRows(state, dates, options = {}) {
  return renderRows(indexDays(state), dates, options);
}

/**
 * Mount a native vertical scroller. The caller owns its height and the surrounding toolbar.
 * anchorDate, if present, restores the centered day when returning from date details.
 * onAnchorChange receives the centered date; onSelect receives a tapped valid date.
 * jumpToDate can reposition to any supported date. Nothing writes to persistent storage.
 */
export function mountTimeline(container, state, options = {}) {
  if (!container || typeof container.querySelectorAll !== 'function') throw new Error('时间轴暂时无法打开，请刷新页面。');
  controllers.get(container)?.destroy();
  const selectedDate = parseDate(options.selectedDate) ? options.selectedDate : options.today;
  if (!parseDate(selectedDate)) throw new Error('请选择有效日期，再翻翻这页小日子。');
  const initialDate = parseDate(options.anchorDate) ? options.anchorDate : selectedDate;
  const index = indexDays(state);
  let dates = timelineDates(initialDate), anchorDate = initialDate;
  const expandedDates = options.expandedDates || new Set();
  let destroyed = false, frame = null, restoreFrame = null;
  const requestFrame = globalThis.requestAnimationFrame?.bind(globalThis) || (callback => setTimeout(callback, 0));
  const cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis) || clearTimeout;
  container.classList.add('timeline-scroll');
  container.setAttribute('aria-label', '日期时间轴，上下滑动查看小日子');
  container.setAttribute('tabindex', '0');
  const render = () => { container.innerHTML = renderRows(index, dates, { selectedDate, today: options.today, expandedDates }); };
  const rowFor = date => container.querySelector(`[data-timeline-date="${date}"]`);
  const rowTop = row => row.getBoundingClientRect().top - container.getBoundingClientRect().top + container.scrollTop;
  const centeredDate = () => {
    const rows = [...container.querySelectorAll('[data-timeline-date]')];
    if (!rows.length || !container.clientHeight) return anchorDate;
    const middle = container.scrollTop + container.clientHeight / 2;
    let closest = rows[0], distance = Infinity;
    for (const row of rows) {
      const difference = Math.abs(rowTop(row) + row.getBoundingClientRect().height / 2 - middle);
      if (difference < distance) { closest = row; distance = difference; }
      else if (difference > distance) break;
    }
    return closest.dataset.timelineDate;
  };
  const reportAnchor = () => {
    const next = centeredDate();
    if (parseDate(next)) { anchorDate = next; options.onAnchorChange?.(next); }
  };
  const center = date => {
    const row = rowFor(date);
    if (row) container.scrollTop = Math.max(0, rowTop(row) - (container.clientHeight - row.getBoundingClientRect().height) / 2);
  };
  const extend = direction => {
    const additions = [];
    let edge = direction < 0 ? dates[0] : dates.at(-1);
    for (let i = 0; i < PAGE_SIZE; i++) {
      edge = addDays(edge, direction);
      if (!edge) break;
      direction < 0 ? additions.unshift(edge) : additions.push(edge);
    }
    if (!additions.length) return false;
    // Keep the day at the viewport center at the same pixel while prepending/trimming rows.
    const visibleDate = centeredDate();
    const visibleRow = rowFor(visibleDate);
    const pixelTop = visibleRow ? visibleRow.getBoundingClientRect().top : null;
    const previousScrollTop = container.scrollTop;
    dates = direction < 0 ? [...additions, ...dates] : [...dates, ...additions];
    if (dates.length > MAX_ROWS) dates = direction < 0 ? dates.slice(0, MAX_ROWS) : dates.slice(-MAX_ROWS);
    render();
    const restoredRow = rowFor(visibleDate);
    container.scrollTop = restoredRow && pixelTop !== null ? previousScrollTop + restoredRow.getBoundingClientRect().top - pixelTop : previousScrollTop;
    return true;
  };
  const onScroll = () => {
    if (destroyed || frame !== null) return;
    frame = requestFrame(() => {
      frame = null;
      if (destroyed || container.isConnected === false || !container.clientHeight) return;
      const first = container.querySelector('.timeline-row');
      const threshold = Math.max(100, (first?.getBoundingClientRect().height || 60) * 2);
      if (container.scrollTop < threshold) extend(-1);
      if (container.scrollHeight - container.scrollTop - container.clientHeight < threshold) extend(1);
      reportAnchor();
    });
  };
  const onClick = event => {
    const action = event.target.closest?.('[data-timeline-open]');
    if (!action) return;
    const row = action.closest?.('[data-timeline-date]');
    if (!row || !container.contains(row) || !parseDate(row.dataset.timelineDate)) return;
    reportAnchor();
    options.onSelect?.(row.dataset.timelineDate);
  };
  const onToggle = event => {
    if (!event.target.classList?.contains('timeline-day-details')) return;
    const row = event.target.closest('[data-timeline-date]');
    if (event.target.open) expandedDates.add(row.dataset.timelineDate); else expandedDates.delete(row.dataset.timelineDate);
    if (event.target.open) {
      const bounds = row.getBoundingClientRect(), viewport = container.getBoundingClientRect();
      if (bounds.height > container.clientHeight || bounds.top < viewport.top) container.scrollTop += bounds.top - viewport.top;
      else if (bounds.bottom > viewport.bottom) container.scrollTop += bounds.bottom - viewport.bottom;
    }
    reportAnchor();
  };
  render();
  container.addEventListener('scroll', onScroll, { passive: true });
  container.addEventListener('click', onClick);
  container.addEventListener('toggle', onToggle, true);
  center(initialDate);
  restoreFrame = requestFrame(() => {
    restoreFrame = null;
    if (!destroyed && container.isConnected !== false) { center(initialDate); reportAnchor(); }
  });
  const controller = {
    destroy() {
      destroyed = true;
      if (frame !== null) cancelFrame(frame);
      if (restoreFrame !== null) cancelFrame(restoreFrame);
      container.removeEventListener('scroll', onScroll);
      container.removeEventListener('click', onClick);
      container.removeEventListener('toggle', onToggle, true);
      if (controllers.get(container) === controller) controllers.delete(container);
    },
    jumpToDate(date) {
      if (destroyed || !parseDate(date)) throw new Error('请选择有效日期，再翻翻这页小日子。');
      if (restoreFrame !== null) { cancelFrame(restoreFrame); restoreFrame = null; }
      dates = timelineDates(date); anchorDate = date; render(); center(date); reportAnchor();
    },
    getAnchorDate: () => centeredDate(),
    getRange: () => ({ start: dates[0], end: dates.at(-1), count: dates.length }),
  };
  controllers.set(container, controller);
  return controller;
}
