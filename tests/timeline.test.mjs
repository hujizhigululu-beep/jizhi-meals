import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeDay, timelineDates, renderTimelineRows, mountTimeline } from '../timeline.js';

const empty = () => ({ schemaVersion: 2, inventory: [], meals: [], diaries: [] });
const meal = (date, slot, name, completed = false) => ({ date, slot, name, completed });

test('时间轴连续展示跨月跨年日期，留白日期仍可点击', () => {
  const dates = timelineDates('2026-01-01', 3, 3);
  assert.deepEqual(dates, ['2025-12-29', '2025-12-30', '2025-12-31', '2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04']);
  const html = renderTimelineRows(empty(), dates, { selectedDate: '2026-01-01', today: '2026-01-02' });
  assert.equal((html.match(/data-timeline-date=/g) || []).length, 7);
  assert.match(html, /data-timeline-date="2025-12-31"/);
  assert.match(html, /is-month-start/);
  assert.match(html, /is-selected/);
  assert.match(html, /timeline-empty/);
  assert.match(html, /˶ᵔ ᵕ ᵔ˶|｡･ω･｡|｡• ᵕ •｡/);
});

test('按早午晚排序预览，统计同日全部加餐且不修改库存或状态', () => {
  const state = empty();
  state.inventory = [{ id: 'rice', quantity: 3 }];
  state.meals = [meal('2026-10-12', 'dinner', '番茄面'), meal('2026-10-12', 'snack', '草莓奶', true), meal('2026-10-12', 'breakfast', '鸡蛋吐司', true), meal('2026-10-12', 'snack', '小蛋糕'), meal('2026-10-12', 'lunch', '牛肉丸便当'), meal('2026-10-13', 'snack', '明天水果')];
  const previous = structuredClone(state);
  const summary = summarizeDay(state, '2026-10-12');
  assert.deepEqual(summary.mainMeals.map(row => row.name), ['鸡蛋吐司', '牛肉丸便当', '番茄面']);
  assert.equal(summary.snackCount, 2);
  assert.equal(summary.mealCount, 5);
  assert.equal(summary.completedCount, 2);
  assert.match(renderTimelineRows(state, ['2026-10-12']), /加餐 2 条/);
  assert.deepEqual(state, previous);
});

test('独立日记和心情也能显示预览，空白日记没有催促提示', () => {
  const state = empty();
  state.diaries = [{ date: '2026-10-12', mood: '(˶ᵔ ᵕ ᵔ˶)', text: '今天逛了公园\n看见小猫', joy: '晒太阳' }, { date: '2026-10-13', mood: '', text: '  ', joy: '' }, { date: '2026-10-14', mood: '', text: '', joy: '买到喜欢的草莓' }];
  const summary = summarizeDay(state, '2026-10-12');
  assert.equal(summary.hasRecords, true);
  assert.equal(summary.mealCount, 0);
  assert.equal(summary.diary.excerpt, '今天逛了公园 看见小猫');
  assert.equal(summarizeDay(state, '2026-10-13').hasRecords, false);
  assert.equal(summarizeDay(state, '2026-10-14').diary.excerpt, '买到喜欢的草莓');
  assert.match(renderTimelineRows(state, ['2026-10-12']), /timeline-diary/);
  assert.doesNotMatch(renderTimelineRows(state, ['2026-10-12']), /timeline-empty/);
});

test('用户输入只以文字渲染，名称、日记与aria标签均转义', () => {
  const state = empty();
  state.meals = [meal('2026-10-12', 'lunch', '<img src=x onerror="alert(1)"> & \'饭\'')];
  state.diaries = [{ date: '2026-10-12', mood: '<svg/onload=alert(1)>', text: '</span><script>alert(2)</script>', joy: '' }];
  const html = renderTimelineRows(state, ['2026-10-12']);
  assert.doesNotMatch(html, /<img|<svg|<script/);
  assert.match(html, /&lt;img/);
  assert.match(html, /&quot;alert\(1\)&quot;/);
  assert.match(html, /&amp; &#39;饭&#39;/);
  assert.match(html, /&lt;svg/);
  assert.match(html, /&lt;script&gt;/);
});

test('没有记录的日期保留完整纯预览，忽略无关或无效记录', () => {
  const state = empty();
  state.meals = [meal('2026-10-13', 'lunch', '便当'), meal('2026-10-12', 'unknown', '无效餐次'), meal('2026-02-30', 'lunch', '无效日期')];
  assert.deepEqual(summarizeDay(state, '2026-10-12'), { date: '2026-10-12', mainMeals: [], snacks: [], snackCount: 0, mealCount: 0, completedCount: 0, diary: null, hasRecords: false });
});

test('上下日期边界不越界，闰日连贯且无效日期明确报错', () => {
  assert.deepEqual(timelineDates('0001-01-01', 2, 2), ['0001-01-01', '0001-01-02', '0001-01-03']);
  assert.deepEqual(timelineDates('9999-12-31', 2, 2), ['9999-12-29', '9999-12-30', '9999-12-31']);
  assert.deepEqual(timelineDates('2024-02-29', 1, 1), ['2024-02-28', '2024-02-29', '2024-03-01']);
  assert.throws(() => timelineDates('2025-02-29'), /有效日期/);
  assert.throws(() => timelineDates('0000-01-01'), /有效日期/);
  assert.throws(() => summarizeDay(empty(), '2026-13-01'), /有效日期/);
  assert.throws(() => renderTimelineRows(empty(), ['<script>']), /无效日期/);
  assert.throws(() => timelineDates('2026-10-12', -1), /范围/);
});

test('Emoji 日记摘要不切断代理对且保持原文本不变', () => {
  const state = empty();
  state.diaries = [{ date: '2026-10-12', mood: '开心', text: '🍓'.repeat(50), joy: '' }];
  const summary = summarizeDay(state, '2026-10-12');
  assert.equal(summary.diary.excerpt, `${'🍓'.repeat(42)}…`);
  assert.equal(state.diaries[0].text, '🍓'.repeat(50));
});

// Geometry-only DOM double: seven visible 60px rows, with browser-like scroll clamping.
// It exercises date-window/position logic; actual touch and CSS remain browser checks.
function timelineContainer() {
  let scrollTop = 0, html = '', rows = [];
  const listeners = new Map();
  const container = {
    isConnected: true, clientHeight: 420,
    classList: { add() {} }, setAttribute() {},
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      rows = [...value.matchAll(/data-timeline-date="([\d-]+)"/g)].map((match, index) => ({
        dataset: { timelineDate: match[1] },
        getBoundingClientRect: () => ({ top: index * 60 - scrollTop, height: 60 }),
        closest() { return this; },
      }));
      scrollTop = Math.max(0, Math.min(scrollTop, rows.length * 60 - container.clientHeight));
    },
    get scrollTop() { return scrollTop; },
    set scrollTop(value) { scrollTop = Math.max(0, Math.min(value, rows.length * 60 - container.clientHeight)); },
    get scrollHeight() { return rows.length * 60; },
    getBoundingClientRect: () => ({ top: 0, height: 420 }),
    querySelectorAll: () => rows,
    querySelector(selector) {
      if (selector === '.timeline-row') return rows[0] || null;
      return rows.find(row => selector === `[data-timeline-date="${row.dataset.timelineDate}"]`) || null;
    },
    contains: row => rows.includes(row),
    addEventListener(type, callback) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(callback); },
    removeEventListener(type, callback) { listeners.get(type)?.delete(callback); },
    emit(type, event = {}) { for (const callback of listeners.get(type) || []) callback(event); },
    listenerCount: type => listeners.get(type)?.size || 0,
  };
  return container;
}

function withFrames(callback) {
  const originalRequest = globalThis.requestAnimationFrame;
  const originalCancel = globalThis.cancelAnimationFrame;
  const pending = new Map();
  let id = 0;
  globalThis.requestAnimationFrame = task => { pending.set(++id, task); return id; };
  globalThis.cancelAnimationFrame = key => pending.delete(key);
  const flush = () => { const tasks = [...pending.values()]; pending.clear(); tasks.forEach(task => task()); };
  try { callback(flush); }
  finally {
    if (originalRequest === undefined) delete globalThis.requestAnimationFrame; else globalThis.requestAnimationFrame = originalRequest;
    if (originalCancel === undefined) delete globalThis.cancelAnimationFrame; else globalThis.cancelAnimationFrame = originalCancel;
  }
}

test('原生滚动按14天扩充，上下裁剪始终至多180行并保留可见中心位置', () => withFrames(flush => {
  const container = timelineContainer();
  const datesSeen = [];
  const controller = mountTimeline(container, empty(), { selectedDate: '2026-10-12', today: '2026-10-12', onAnchorChange: date => datesSeen.push(date) });
  flush();
  assert.equal(controller.getAnchorDate(), '2026-10-12');
  assert.equal(controller.getRange().count, 57);
  for (const direction of [-1, 1]) {
    for (let i = 0; i < 20; i++) {
      container.scrollTop = direction < 0 ? 0 : container.scrollHeight;
      const before = controller.getAnchorDate();
      container.emit('scroll'); flush();
      assert.equal(controller.getAnchorDate(), before);
      assert.ok(controller.getRange().count <= 180);
      assert.equal(datesSeen.at(-1), before);
    }
  }
  assert.equal(controller.getRange().count, 180);
  controller.destroy();
  assert.equal(container.listenerCount('scroll'), 0);
}));

test('返回详情后恢复时间轴中心，同容器重挂载移除旧监听且日期可任意跳转', () => withFrames(flush => {
  const container = timelineContainer();
  let selected = null;
  const first = mountTimeline(container, empty(), { selectedDate: '2026-10-12', today: '2026-10-12', anchorDate: '2026-09-01' });
  flush();
  assert.equal(first.getAnchorDate(), '2026-09-01');
  const second = mountTimeline(container, empty(), { selectedDate: '2026-10-12', today: '2026-10-12', onSelect: date => { selected = date; } });
  flush();
  assert.equal(container.listenerCount('scroll'), 1);
  assert.equal(container.listenerCount('click'), 1);
  second.jumpToDate('2040-02-29');
  assert.equal(second.getAnchorDate(), '2040-02-29');
  container.emit('click', { target: container.querySelector('[data-timeline-date="2040-02-29"]') });
  assert.equal(selected, '2040-02-29');
  assert.throws(() => second.jumpToDate('2040-02-30'), /有效日期/);
  second.destroy();
  container.emit('click', { target: container.querySelector('[data-timeline-date="2040-03-01"]') });
  assert.equal(selected, '2040-02-29');
}));
