import test from 'node:test';
import assert from 'node:assert/strict';
import { monthDate, shiftMonth, monthCells, renderMonthCalendar } from '../month-calendar.js';
import { summarizeDay, renderTimelineRows } from '../timeline.js';

const state = () => ({ meals: [], diaries: [], inventory: [], dayRecords: [] });
const activity = (checked, items = []) => ({ checked, items });
const item = (content, minutes = null, note = '') => ({ id: content || 'empty', content, minutes, note });

test('月历使用本地日期，含闰月且安全分页0001至9999年', () => {
  assert.equal(monthDate('0001-01'), '0001-01-01');
  assert.equal(monthDate('9999-12', 31), '9999-12-31');
  assert.equal(monthDate('2024-02', 29), '2024-02-29');
  for (const value of ['0000-01', '10000-01', '2026-13', '2026-2', '<script>']) assert.equal(monthDate(value), null);
  assert.equal(monthDate('2025-02', 29), null);
  assert.equal(monthDate('2026-01', 0), null);
  assert.equal(monthDate('2026-01', 1.5), null);
  assert.equal(shiftMonth('0001-01', -1), null);
  assert.equal(shiftMonth('9999-12', 1), null);
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('0001-12', 1), '0002-01');
  assert.equal(shiftMonth('2026-10', -21), '2025-01');
  assert.equal(shiftMonth('2026-10', .5), null);
});

test('连续七列补齐月初月末空格，不制造其他月份日期', () => {
  const october = monthCells('2026-10');
  assert.equal(october.length, 35);
  assert.deepEqual(october.slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(october.filter(Boolean).length, 31);
  assert.equal(october.at(-1), null);
  const february = monthCells('2021-02');
  assert.equal(february.length, 28);
  assert.equal(february[0], '2021-02-01');
  assert.equal(monthCells('2024-02').filter(Boolean).length, 29);
  for (const month of ['0001-01', '9999-12']) {
    const cells = monthCells(month);
    assert.equal(cells.length % 7, 0);
    assert.equal(cells.filter(Boolean).length, 31);
    assert.ok(cells.every(date => date === null || date.startsWith(month)));
  }
  assert.throws(() => monthCells('2025-13'), /有效月份/);
});

test('月历圆点源自有效真实餐食与checked，统计去重且取消不删除活动详情', () => {
  const data = state();
  data.meals = [{ date: '2026-10-13', slot: 'breakfast', name: '吐司' }, { date: '2026-10-13', slot: 'lunch', name: '饭' }, { date: '2026-10-14', slot: 'dinner', name: '计划的面', completed: false }, { date: '2026-10-15', slot: 'lunch', name: '  ' }, { date: '2026-10-16', slot: 'unknown', name: '无效餐次' }, { date: '2026-09-01', slot: 'lunch', name: '上个月' }];
  data.dayRecords = [{ date: '2026-10-13', study: activity(true, [item('日语', 60), item('画画', 30)]), exercise: activity(true, [item('徒步', 45)]), stickerIds: ['milk'] }, { date: '2026-10-14', study: activity(false, [item('保留学习详情', 20)]), exercise: activity(false), stickerIds: [] }, { date: '2026-09-01', study: activity(true), exercise: activity(true), stickerIds: [] }];
  const before = structuredClone(data);
  const html = renderMonthCalendar(data, { month: '2026-10', selectedDate: '2026-10-13', today: '2026-10-13' });
  const day = date => html.match(new RegExp(`<button[^>]*data-month-date="${date}"[\\s\\S]*?</button>`))[0];
  for (const kind of ['meal', 'exercise', 'study']) assert.match(day('2026-10-13'), new RegExp(`data-kind="${kind}"`));
  assert.match(day('2026-10-14'), /data-kind="meal"/);
  assert.doesNotMatch(day('2026-10-14'), /data-kind="study"|data-kind="exercise"/);
  for (const date of ['2026-10-15', '2026-10-16', '2026-10-01']) assert.doesNotMatch(day(date), /data-kind=/);
  assert.match(html, /data-kind="meal"><span>餐食记录<\/span><p><strong>2<\/strong>/);
  assert.match(html, /data-kind="study"><span>学习打卡<\/span><p><strong>1<\/strong>/);
  assert.match(html, /data-kind="exercise"><span>运动打卡<\/span><p><strong>1<\/strong>/);
  assert.match(day('2026-10-13'), /is-today/);
  assert.match(day('2026-10-13'), /aria-pressed="true"/);
  assert.deepEqual(data, before);
});

test('单分类月历只显示对应圆点，三类统计始终按当前月份计算', () => {
  const data = state();
  data.meals = [{ date: '2026-10-13', slot: 'lunch', name: '饭' }];
  data.dayRecords = [{ date: '2026-10-13', study: activity(true), exercise: activity(true), stickerIds: [] }];
  for (const mode of ['meal', 'exercise', 'study']) {
    const html = renderMonthCalendar(data, { month: '2026-10', mode });
    const grid = html.match(/<div class="month-grid"[\s\S]*?<\/div>/)[0];
    assert.equal((grid.match(/data-kind=/g) || []).length, 1);
    assert.match(grid, new RegExp(`data-kind="${mode}"`));
    assert.match(html, new RegExp(`data-month-mode="${mode}" aria-pressed="true"`));
  }
  const empty = renderMonthCalendar(data, { month: '2026-09', mode: 'study' });
  assert.doesNotMatch(empty.match(/<div class="month-grid"[\s\S]*?<\/div>/)[0], /data-kind=/);
  assert.equal((empty.match(/<strong>0<\/strong>/g) || []).length, 3);
  assert.match(renderMonthCalendar(data, { month: '0001-01' }), /data-month-step="-1"[^>]*disabled/);
  assert.match(renderMonthCalendar(data, { month: '9999-12' }), /data-month-step="1"[^>]*disabled/);
  assert.match(renderMonthCalendar(data, { month: '2026-10', mode: '<svg>' }), /data-month-mode="all" aria-pressed="true"/);
});

test('学习运动独立日期进入时间轴摘要，未填时长不会被凭空添加', () => {
  const data = state();
  data.dayRecords = [{ date: '2026-10-13', study: activity(true), exercise: activity(true, [item('力量', 25, '今天练了背。\n慢慢来。')]), stickerIds: ['book', 'shoe'] }];
  const before = structuredClone(data);
  const summary = summarizeDay(data, '2026-10-13');
  assert.equal(summary.hasRecords, true);
  assert.equal(summary.mealCount, 0);
  const html = renderTimelineRows(data, ['2026-10-13']);
  assert.match(html, /timeline-compact-line/);
  assert.match(html, /学习已打卡/);
  assert.match(html, /学习 · 运动 · 小贴纸/);
  assert.doesNotMatch(html, /0 餐/);
  assert.match(html, /25 分钟/);
  assert.equal((html.match(/ 分钟/g) || []).length, 1);
  assert.match(html, /今天练了背。\n慢慢来。/);
  assert.match(html, /assets\/stickers\/book.svg/);
  assert.match(html, /assets\/stickers\/shoe.svg/);
  assert.deepEqual(data, before);
});

test('取消打卡后详情仍可在时间轴阅读，贴纸只读取安全内置ID', () => {
  const data = state();
  data.dayRecords = [{ date: '2026-10-13', study: activity(false, [item('<img onerror="evil()">', 0, '<script>恶意\n内容</script>')]), exercise: activity(false), stickerIds: ['milk', '../../evil', '<svg>'] }];
  const before = structuredClone(data);
  const html = renderTimelineRows(data, ['2026-10-13']);
  assert.match(html, /未打卡 · 保留详情/);
  assert.match(html, /学习未打卡/);
  assert.match(html, /0 分钟/);
  assert.match(html, /&lt;img onerror=&quot;evil\(\)&quot;&gt;/);
  assert.match(html, /&lt;script&gt;恶意\n内容&lt;\/script&gt;/);
  assert.match(html, /assets\/stickers\/milk.svg/);
  assert.doesNotMatch(html, /\.\.\/|<script>|<svg>|src="[^\"]*evil/);
  assert.equal((html.match(/<img /g) || []).length, 1);
  assert.deepEqual(data, before);
});
