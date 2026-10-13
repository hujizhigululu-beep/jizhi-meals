import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../model.js';
import { toggleCategoryCheckin, toggleCheckin, putActivity, removeActivity, getDayRecord } from '../activity.js';
import { upsertActivityCategory, setActivityCategoryActive } from '../activity-shortcuts.js';
import { prepareJournalShare } from '../share-journal.js';
import { renderTimelineRows, summarizeDay } from '../timeline.js';

const DATE = '2026-10-13';
const share = (state, options = {}) => prepareJournalShare(state, { date: DATE, ...options });
const selectedItem = (state, kind, id) => getDayRecord(state, DATE)[kind].items.find(item => item.categoryId === id);
const edit = (state, kind, categoryId, input) => putActivity(state, DATE, kind, { ...selectedItem(state, kind, categoryId), ...input });

test('取消一项类别保留详情，但分享只统计仍选中的活动，不重复计算自然日', () => {
  const state = freshState();
  toggleCategoryCheckin(state, DATE, 'study', 'study-japanese');
  toggleCategoryCheckin(state, DATE, 'study', 'study-drawing');
  edit(state, 'study', 'study-japanese', { content: '日语句子小抄', minutes: 25, note: '日语私人备注' });
  edit(state, 'study', 'study-drawing', { content: '画了一只小猫', minutes: 40, note: '画画私人备注' });
  toggleCategoryCheckin(state, DATE, 'study', 'study-drawing');
  const before = structuredClone(state), result = share(state, { kind: 'study', notes: true });
  assert.deepEqual(result.studies.map(row => row.title), ['日语句子小抄']);
  assert.equal(result.counts.studyDays, 1); assert.equal(result.counts.studyMinutes, 25);
  assert.doesNotMatch(JSON.stringify(result), /画了一只小猫|画画私人备注/);
  assert.equal(getDayRecord(state, DATE).study.items.length, 2);
  assert.deepEqual(state, before);
});

test('整项打卡取消后分享排除全部保留详情，时间轴仍能翻开查看', () => {
  const state = freshState();
  toggleCategoryCheckin(state, DATE, 'exercise', 'exercise-hiking');
  edit(state, 'exercise', 'exercise-hiking', { content: '去河边徒步', minutes: 35, distanceKm: 2.4, note: '有一朵小花' });
  toggleCheckin(state, DATE, 'exercise');
  const result = share(state, { kind: 'exercise', notes: true });
  assert.equal(result.hasRecords, false);
  assert.equal(result.counts.exerciseDays, 0); assert.equal(result.counts.exerciseMinutes, 0);
  assert.deepEqual(result.exercises, []);
  const html = renderTimelineRows(state, [DATE]);
  const compact = html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)[1];
  assert.doesNotMatch(compact, /去河边徒步|有一朵小花|2\.4 公里/);
  assert.match(html, /去河边徒步/); assert.match(html, /2\.4 公里/);
  assert.match(html, /未打卡 · 详情保留/);
  assert.equal(summarizeDay(state, DATE).hasRecords, true);
});

test('多个已选类别即使没有详情也逐项分享名称，单日只计一天，不虚构时长', () => {
  const state = freshState();
  for (const id of ['study-japanese', 'study-drawing']) {
    toggleCategoryCheckin(state, DATE, 'study', id);
    removeActivity(state, DATE, 'study', selectedItem(state, 'study', id).id);
  }
  const before = structuredClone(state), result = share(state, { kind: 'study' });
  assert.deepEqual(result.studies.map(row => row.title), ['日语', '画画']);
  assert.equal(result.hasRecords, true); assert.equal(result.counts.studyDays, 1);
  assert.equal(result.counts.studyMinutes, 0);
  for (const row of result.studies) { assert.equal(row.minutesKnown, false); assert.doesNotMatch(row.meta, /分钟/); }
  const html = renderTimelineRows(state, [DATE]);
  assert.match(html, /学习 · 日语、画画/); assert.match(html, /已选类别 · 日语、画画/);
  assert.deepEqual(state, before);
});

test('历史类别快照优先且归属不随改名/停用改变，无详情时显示当前名', () => {
  const state = freshState();
  toggleCategoryCheckin(state, DATE, 'study', 'study-japanese');
  edit(state, 'study', 'study-japanese', { content: '', minutes: 10 });
  upsertActivityCategory(state, 'study', { id: 'study-japanese', name: '日语阅读' });
  setActivityCategoryActive(state, 'study', 'study-japanese', false);
  const before = structuredClone(state), historic = share(state, { kind: 'study' });
  assert.equal(historic.studies[0].title, '日语'); assert.equal(historic.counts.studyMinutes, 10);
  assert.match(renderTimelineRows(state, [DATE]), /日语 · 已停用/);
  assert.deepEqual(state, before);
  removeActivity(state, DATE, 'study', selectedItem(state, 'study', 'study-japanese').id);
  assert.equal(share(state, { kind: 'study' }).studies[0].title, '日语阅读');
});

test('距离和私人备注仅在notes=true进入分享，零距离与留空可区分', () => {
  const state = freshState();
  toggleCategoryCheckin(state, DATE, 'exercise', 'exercise-hiking');
  edit(state, 'exercise', 'exercise-hiking', { content: '河边走走', minutes: 20, distanceKm: 3.25, note: '私人路线备注' });
  putActivity(state, DATE, 'exercise', { content: '伸展一下', minutes: 0, distanceKm: 0, note: '' });
  putActivity(state, DATE, 'exercise', { content: '轻轻活动', minutes: null, distanceKm: null, note: '' });
  const hidden = share(state, { kind: 'exercise' });
  assert.doesNotMatch(JSON.stringify(hidden), /distanceKm|公里|私人路线备注/);
  const visible = share(state, { kind: 'exercise', notes: true });
  assert.match(visible.exercises[0].meta, /3\.25 公里/);
  assert.equal(visible.exercises[0].note, '私人路线备注');
  assert.match(visible.exercises[1].meta, /0 分钟 · 0 公里/);
  assert.doesNotMatch(visible.exercises[2].meta, /分钟|公里/);
  assert.equal(visible.counts.exerciseDays, 1); assert.equal(visible.counts.exerciseMinutes, 20);
});

test('取消类别后的timeline收起摘要只看active项目，展开明确保留未选项目', () => {
  const state = freshState();
  toggleCategoryCheckin(state, DATE, 'study', 'study-japanese');
  toggleCategoryCheckin(state, DATE, 'study', 'study-drawing');
  edit(state, 'study', 'study-japanese', { content: '句子小抄', minutes: 25 });
  edit(state, 'study', 'study-drawing', { content: '画画暂停项目', minutes: 40, note: '保留的小草稿' });
  toggleCategoryCheckin(state, DATE, 'study', 'study-drawing');
  const before = structuredClone(state), html = renderTimelineRows(state, [DATE]);
  const compact = html.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/)[1];
  assert.match(compact, /句子小抄/); assert.doesNotMatch(compact, /画画暂停项目|保留的小草稿/);
  assert.match(html, /画画暂停项目/); assert.match(html, /保留的小草稿/);
  assert.match(html, /未选类别 · 详情保留/); assert.match(html, /暂不计入统计/);
  assert.deepEqual(state, before);
});

test('legacy/manual已打卡无active详情保留fallback，旧未分类详情继续统计', () => {
  const state = { dayRecords: [{ date: DATE, study: { checked: true, manualChecked: true, categoryIds: [], items: [{ id: 'paused', content: '不再选的项目', categoryId: 'study-japanese', categoryName: '日语', minutes: 60, note: '不应泄露' }] }, exercise: { checked: true, items: [{ content: '旧版散步', minutes: 15 }] } }] };
  const result = share(state);
  assert.equal(result.studies[0].title, '学习已打卡');
  assert.equal(result.counts.studyDays, 1); assert.equal(result.counts.studyMinutes, 0);
  assert.equal(result.exercises[0].title, '旧版散步'); assert.equal(result.counts.exerciseMinutes, 15);
  assert.doesNotMatch(JSON.stringify(result), /不再选的项目|不应泄露/);
});

test('自定义类别名和快照在timeline安全转义，分享仅保留文本不修改输入', () => {
  const state = freshState(), name = '<script>草莓</script>';
  upsertActivityCategory(state, 'study', { id: 'custom-study', name });
  toggleCategoryCheckin(state, DATE, 'study', 'custom-study');
  edit(state, 'study', 'custom-study', { content: '', note: '<img src=x onerror=evil>' });
  const before = structuredClone(state), html = renderTimelineRows(state, [DATE]);
  assert.doesNotMatch(html, /<script|<img src=x/);
  assert.match(html, /&lt;script&gt;草莓&lt;\/script&gt;/);
  assert.match(html, /&lt;img src=x onerror=evil&gt;/);
  const result = share(state, { kind: 'study' });
  assert.equal(result.studies[0].title, name); assert.equal(result.studies[0].note, '');
  assert.deepEqual(state, before);
});
