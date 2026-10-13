import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalize } from '../model.js';
import { defaultActivityCategories } from '../schema-extra.js';
import { getActivityCategories, getActivityCategory, upsertActivityCategory, setActivityCategoryActive, moveActivityCategory } from '../activity-shortcuts.js';
import { getDayRecord, toggleCheckin, toggleCategoryCheckin, putActivity, removeActivity, setDayStickers, activeActivityItems, monthStats } from '../activity.js';
import { STICKER_IDS } from '../stickers.js';
import { renderDayRecords } from '../day-records-view.js';

const DAY = '2026-10-13', STUDY = 'study-japanese', DRAW = 'study-drawing', HIKE = 'exercise-hiking';
const clone = value => structuredClone(value);
const beforeError = (state, callback, pattern) => { const before = clone(state); assert.throws(callback, pattern); assert.deepEqual(state, before); };
const activity = (state, kind = 'study', date = DAY) => getDayRecord(state, date)[kind];

test('默认类别编号稳定且独立；读取空日期、旧记录和类别不会写入状态', () => {
  const defaults = defaultActivityCategories();
  assert.deepEqual(defaults.study.map(row => [row.id, row.name]), [[STUDY, '日语'], [DRAW, '画画'], ['study-3d', '3D建模']]);
  assert.deepEqual(defaults.exercise.map(row => row.name), ['力量训练', '徒步', '有氧训练']);
  defaults.study[0].name = '只改副本'; assert.equal(defaultActivityCategories().study[0].name, '日语');
  const state = freshState(), before = clone(state);
  const view = getDayRecord(state, DAY); view.study.categoryIds.push(STUDY);
  const categories = getActivityCategories(state, 'study'); categories[0].name = '副本';
  assert.deepEqual(state, before);
  assert.equal(getActivityCategory(state, 'study', STUDY).name, '日语');
  const legacy = {dayRecords:[{date:DAY,study:{checked:true,items:[]},exercise:{checked:false,items:[]},stickerIds:[]}]};
  const original = clone(legacy);
  assert.equal(getDayRecord(legacy, DAY).study.manualChecked, true);
  assert.deepEqual(getDayRecord(legacy, DAY).study.categoryIds, []);
  assert.deepEqual(legacy, original);
});

test('一键类别建立无虚构时长的详情，同日多类别只累计一天', () => {
  const state = freshState();
  assert.equal(toggleCategoryCheckin(state, DAY, 'study', STUDY), true);
  const row = activity(state).items[0];
  assert.deepEqual({...row,id:'stable'}, {id:'stable',content:'日语',minutes:null,note:'',categoryId:STUDY,categoryName:'日语'});
  assert.equal(activity(state).manualChecked, false);
  assert.equal(toggleCategoryCheckin(state, DAY, 'study', DRAW), true);
  assert.equal(activity(state).items.length, 2);
  assert.deepEqual(activity(state).categoryIds, [STUDY,DRAW]);
  assert.equal(monthStats(state, '2026-10').studyDays, 1);
  assert.equal(monthStats(state, '2026-10').studyMinutes, 0);
  assert.equal(normalize(state).locked, false);
});

test('类别取消保留详情，分钟只累计选中类别；再次启用复用原行', () => {
  const state = freshState();
  toggleCategoryCheckin(state, DAY, 'study', STUDY); toggleCategoryCheckin(state, DAY, 'study', DRAW);
  const first = activity(state).items.find(row => row.categoryId === STUDY), second = activity(state).items.find(row => row.categoryId === DRAW);
  putActivity(state, DAY, 'study', {...first, minutes:60}); putActivity(state, DAY, 'study', {...second, minutes:20});
  assert.equal(monthStats(state, '2026-10').studyMinutes, 80);
  assert.equal(toggleCategoryCheckin(state, DAY, 'study', STUDY), false);
  assert.equal(activity(state).items.length, 2);
  assert.equal(monthStats(state, '2026-10').studyMinutes, 20);
  assert.deepEqual(activeActivityItems(activity(state)).map(row => row.id), [second.id]);
  toggleCategoryCheckin(state, DAY, 'study', STUDY);
  assert.equal(activity(state).items.length, 2); assert.equal(monthStats(state, '2026-10').studyMinutes, 80);
  toggleCategoryCheckin(state, DAY, 'study', DRAW); toggleCategoryCheckin(state, DAY, 'study', STUDY);
  assert.equal(activity(state).checked, false); assert.equal(monthStats(state, '2026-10').studyMinutes, 0);
  assert.equal(activity(state).items.find(row => row.id === first.id).minutes, 60);
});

test('原有手动打卡独立保留，取消最后一个快捷类别不会误取消手动记录', () => {
  const state = freshState(); toggleCheckin(state, DAY, 'study');
  putActivity(state, DAY, 'study', {id:'legacy-detail',content:'旧学习',minutes:15,note:''});
  toggleCategoryCheckin(state, DAY, 'study', STUDY); toggleCategoryCheckin(state, DAY, 'study', STUDY);
  assert.equal(activity(state).manualChecked, true); assert.equal(activity(state).checked, true);
  assert.equal(monthStats(state, '2026-10').studyMinutes, 15);
  assert.equal(activity(state).items.length, 2);
});

test('总开关暂停保留已选ID与详情，重开恢复有效分钟而不会复活已取消类别', () => {
  const state = freshState();
  toggleCategoryCheckin(state, DAY, 'study', STUDY); toggleCategoryCheckin(state, DAY, 'study', DRAW);
  for (const row of activity(state).items) putActivity(state,DAY,'study',{...row,minutes:row.categoryId === STUDY ? 30 : 20});
  toggleCategoryCheckin(state, DAY, 'study', DRAW);
  const keptItems = clone(activity(state).items);
  assert.equal(toggleCheckin(state, DAY, 'study'), false);
  assert.deepEqual(activity(state).categoryIds, [STUDY]); assert.equal(activity(state).manualChecked, false);
  assert.deepEqual(activity(state).items, keptItems);
  assert.deepEqual(activeActivityItems(activity(state)), []);
  assert.equal(monthStats(state, '2026-10').studyDays, 0); assert.equal(monthStats(state, '2026-10').studyMinutes, 0);
  assert.equal(normalize(state).locked, false);
  assert.equal(toggleCheckin(state, DAY, 'study'), true);
  assert.equal(monthStats(state, '2026-10').studyMinutes, 30);
  assert.deepEqual(activity(state).categoryIds, [STUDY]); assert.equal(activity(state).manualChecked, true);
});

test('暂停后点具体类别只启用本次类别，不恢复暂停前的其他选项', () => {
  const state = freshState(); toggleCategoryCheckin(state,DAY,'study',STUDY); toggleCheckin(state,DAY,'study');
  assert.equal(toggleCategoryCheckin(state, DAY, 'study', DRAW), true);
  assert.deepEqual(activity(state).categoryIds, [DRAW]); assert.equal(activity(state).manualChecked, false);
  assert.equal(activity(state).items.length, 2);
  toggleCheckin(state,DAY,'study');
  assert.equal(toggleCategoryCheckin(state, DAY, 'study', DRAW), true);
  assert.equal(activity(state).items.length, 2);
});

test('详情删空后暂停仍保留选择；类别取消后真正空记录才移除', () => {
  const state = freshState(); toggleCategoryCheckin(state,DAY,'study',STUDY);
  removeActivity(state,DAY,'study',activity(state).items[0].id);
  toggleCheckin(state,DAY,'study');
  assert.equal(state.dayRecords.length,1); assert.deepEqual(activity(state).categoryIds,[STUDY]);
  toggleCheckin(state,DAY,'study'); toggleCategoryCheckin(state,DAY,'study',STUDY);
  // The manual master check-in remains until explicitly cancelled.
  assert.equal(activity(state).checked,true); toggleCheckin(state,DAY,'study');
  assert.deepEqual(state.dayRecords,[]);
});

test('重命名不改历史归属与快照；停用可编辑既有详情但不能新增归属', () => {
  const state = freshState(); toggleCategoryCheckin(state,DAY,'study',STUDY);
  const old = activity(state).items[0], records = clone(state.dayRecords);
  upsertActivityCategory(state,'study',{id:STUDY,name:'日语复习'});
  assert.deepEqual(state.dayRecords,records);
  const updated = putActivity(state,DAY,'study',{...old,content:'语法课',minutes:40});
  assert.equal(updated.categoryName,'日语'); assert.equal(updated.categoryId,STUDY);
  setActivityCategoryActive(state,'study',STUDY,false);
  assert.equal(putActivity(state,DAY,'study',{...updated,note:'历史仍可编辑'}).categoryName,'日语');
  beforeError(state,()=>putActivity(state,DAY,'study',{content:'新一条',categoryId:STUDY}),/停用/);
  beforeError(state,()=>toggleCategoryCheckin(state,'2026-10-14','study',STUDY),/停用/);
  assert.equal(toggleCategoryCheckin(state,DAY,'study',STUDY),false);
  assert.equal(getActivityCategories(state,'study',{includeInactive:false}).some(row=>row.id===STUDY),false);
  assert.equal(getActivityCategory(state,'study',STUDY).active,false);
});

test('类别新增、排序与重新启用使用稳定ID，任何管理操作不改历史数据', () => {
  const state = freshState(); toggleCategoryCheckin(state,DAY,'exercise',HIKE);
  const records = clone(state.dayRecords), id = upsertActivityCategory(state,'exercise',{name:'  跑步 ♡  '}).id;
  assert.equal(getActivityCategory(state,'exercise',id).name,'跑步 ♡');
  moveActivityCategory(state,'exercise',id,'up'); assert.equal(state.activityCategories.exercise[2].id,id);
  moveActivityCategory(state,'exercise',id,0); assert.equal(state.activityCategories.exercise[0].id,id);
  assert.equal(moveActivityCategory(state,'exercise',id,'up'),false);
  setActivityCategoryActive(state,'exercise',id,false); setActivityCategoryActive(state,'exercise',id,true);
  upsertActivityCategory(state,'exercise',{id,name:'晨跑'});
  assert.equal(getActivityCategory(state,'exercise',id).name,'晨跑'); assert.equal(getActivityCategory(state,'exercise',id).active,true);
  assert.deepEqual(state.dayRecords,records); assert.equal(normalize(state).locked,false);
});

test('类别非法输入、日期、种类与排序原子拒绝', () => {
  const state = freshState();
  for (const input of [{name:''},{name:' '.repeat(4)},{name:'字'.repeat(41)},{name:4},{id:' bad ',name:'有效'},{name:'有效',active:'yes'},{name:'有效',delete:true}]) beforeError(state,()=>upsertActivityCategory(state,'study',input));
  beforeError(state,()=>setActivityCategoryActive(state,'study','missing',false));
  beforeError(state,()=>setActivityCategoryActive(state,'study',STUDY,'false'));
  for (const destination of [-1,100,1.5,'wrong']) beforeError(state,()=>moveActivityCategory(state,'study',STUDY,destination));
  beforeError(state,()=>toggleCategoryCheckin(state,'2026-02-29','study',STUDY));
  beforeError(state,()=>toggleCategoryCheckin(state,DAY,'study',HIKE));
  beforeError(state,()=>toggleCategoryCheckin(state,DAY,'other',STUDY));
});

test('可选公里数保留、三位小数与明确清空，保存详情不会暗自打卡', () => {
  const state = freshState();
  const row = putActivity(state,DAY,'exercise',{id:'walk',content:'散步',minutes:null,note:'',distanceKm:1.23456,categoryId:HIKE});
  assert.equal(row.distanceKm,1.235); assert.equal(activity(state,'exercise').checked,false);
  assert.equal(monthStats(state,'2026-10').exerciseMinutes,0);
  const edited = putActivity(state,DAY,'exercise',{id:'walk',content:'长一点',minutes:20,note:'编辑'});
  assert.equal(edited.distanceKm,1.235); assert.equal(edited.categoryId,HIKE); assert.equal(edited.categoryName,'徒步');
  assert.equal(putActivity(state,DAY,'exercise',{...edited,distanceKm:0}).distanceKm,0);
  assert.equal(putActivity(state,DAY,'exercise',{...edited,distanceKm:''}).distanceKm,null);
  const cleared = putActivity(state,DAY,'exercise',{id:'walk',content:'自由记录',categoryId:null});
  assert.equal(Object.hasOwn(cleared,'categoryId'),false); assert.equal(Object.hasOwn(cleared,'categoryName'),false);
  for (const distanceKm of [-1,100001,Infinity,NaN,'2.3',{},true]) beforeError(state,()=>putActivity(state,DAY,'exercise',{id:'walk',distanceKm}));
  beforeError(state,()=>putActivity(state,DAY,'study',{content:'学习',distanceKm:2}));
  beforeError(state,()=>putActivity(state,DAY,'study',{categoryId:HIKE}));
  beforeError(state,()=>putActivity(state,DAY,'study',{categoryName:'没有ID'}));
});

test('多日期各算一天，未分类旧详情与当前分类时长累加，不计未选分类或暂停日', () => {
  const state = freshState();
  toggleCategoryCheckin(state,DAY,'study',STUDY); toggleCategoryCheckin(state,DAY,'study',DRAW);
  const first = activity(state).items.find(row=>row.categoryId===STUDY), second = activity(state).items.find(row=>row.categoryId===DRAW);
  putActivity(state,DAY,'study',{...first,minutes:10}); putActivity(state,DAY,'study',{...second,minutes:20});
  putActivity(state,DAY,'study',{id:'free',content:'旧详情',minutes:5});
  toggleCategoryCheckin(state,DAY,'study',DRAW);
  toggleCategoryCheckin(state,'2026-10-14','study',STUDY);
  putActivity(state,'2026-10-14','study',{...activity(state,'study','2026-10-14').items[0],minutes:30});
  toggleCategoryCheckin(state,'2026-09-30','study',STUDY);
  assert.equal(monthStats(state,'2026-10').studyDays,2); assert.equal(monthStats(state,'2026-10').studyMinutes,45);
  toggleCheckin(state,DAY,'study');
  assert.equal(monthStats(state,'2026-10').studyDays,1); assert.equal(monthStats(state,'2026-10').studyMinutes,30);
});

test('schema4往返保持暂停类别、可选公里和快照，旧手动日迁移不重写原数据', () => {
  const state = freshState(); toggleCategoryCheckin(state,DAY,'exercise',HIKE);
  putActivity(state,DAY,'exercise',{...activity(state,'exercise').items[0],distanceKm:3.5,minutes:45});
  toggleCheckin(state,DAY,'exercise');
  const restored = normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.locked,false); assert.deepEqual(restored.state.dayRecords,state.dayRecords);
  const old = freshState(); old.schemaVersion=3; delete old.mealTemplates; delete old.activityCategories; delete old.recentStickerIds;
  old.dayRecords=[{date:DAY,study:{checked:true,items:[{id:'old',content:'旧日语',minutes:10,note:''}]},exercise:{checked:false,items:[]},stickerIds:[]}];
  const raw=clone(old), migrated=normalize(old);
  assert.equal(migrated.locked,false); assert.equal(migrated.state.dayRecords[0].study.manualChecked,true);
  assert.deepEqual(migrated.state.dayRecords[0].study.categoryIds,[]); assert.deepEqual(old,raw);
});

test('快捷类别和新增表单安全渲染文字、归档快照、公里与草稿，并保留原控件', () => {
  const state = freshState();
  const custom = upsertActivityCategory(state,'exercise',{id:'safe-id',name:'<img onerror="bad()">'});
  toggleCategoryCheckin(state,DAY,'exercise',custom.id);
  const row = activity(state,'exercise').items[0]; putActivity(state,DAY,'exercise',{...row,minutes:30,distanceKm:2,note:'<script>私人</script>'});
  setActivityCategoryActive(state,'exercise',custom.id,false); toggleCheckin(state,DAY,'exercise');
  const before=clone(state);
  const html=renderDayRecords(state,DAY,{study:{content:'"><script>草稿</script>'},exercise:{editing:row.id,open:true,categoryId:custom.id,distanceKm:2,note:'<&> 草稿'}});
  assert.deepEqual(state,before);
  assert.doesNotMatch(html,/<script>|<img onerror=/);
  assert.match(html,/&lt;img onerror=&quot;bad\(\)&quot;&gt;/);
  assert.match(html,/&lt;script&gt;草稿&lt;\/script&gt;/);
  assert.match(html,/已停用/); assert.match(html,/暂不计入统计/); assert.match(html,/2 公里/);
  assert.match(html,/value="safe-id" selected/); assert.match(html,/name="distanceKm"[^>]*value="2"/);
  assert.equal((html.match(/name="categoryId"/g)||[]).length,2);
  assert.equal((html.match(/name="distanceKm"/g)||[]).length,1);
  assert.equal((html.match(/class="activity-form"/g)||[]).length,2);
  assert.equal((html.match(/data-manage-activity-categories=/g)||[]).length,2);
  assert.match(html,/data-activity-cancel="exercise"/);
  for (const selector of ['data-checkin="study"','data-checkin="exercise"','name="content"','name="minutes"','name="note"','class="day-sticker-picker"']) assert.ok(html.includes(selector));
  const pausedChipHtml = renderDayRecords(state,DAY);
  const chips = pausedChipHtml.match(/<button[^>]*data-activity-category=[\s\S]*?<\/button>/g)||[];
  assert.ok(chips.every(chip=>chip.includes('aria-pressed="false"')));
});

test('保护状态拒绝所有类别和打卡写入，并保留完整原文', () => {
  const state = freshState(); state._readOnly=true;
  for (const callback of [()=>upsertActivityCategory(state,'study',{name:'新类'}),()=>setActivityCategoryActive(state,'study',STUDY,false),()=>moveActivityCategory(state,'study',STUDY,'down'),()=>toggleCategoryCheckin(state,DAY,'study',STUDY),()=>putActivity(state,DAY,'study',{content:'不写入'})]) beforeError(state,callback,/保护/);
});

test('最近贴纸只在实际新增选择时更新，取消与打开不加历史，最多保留12个安全ID', () => {
  const state = freshState();
  setDayStickers(state,DAY,['milk','book']); assert.deepEqual(state.recentStickerIds,['milk','book']);
  setDayStickers(state,DAY,['milk','shoe']); assert.deepEqual(state.recentStickerIds,['shoe','milk','book']);
  setDayStickers(state,DAY,['milk']); assert.deepEqual(state.recentStickerIds,['shoe','milk','book']);
  setDayStickers(state,DAY,[]); assert.deepEqual(state.recentStickerIds,['shoe','milk','book']);
  const before = clone(state); renderDayRecords(state,DAY,{stickerOpen:true,stickerGroup:'food'}); assert.deepEqual(state,before);
  for (const id of STICKER_IDS.slice(0,15)) setDayStickers(state,DAY,[id]);
  assert.deepEqual(state.recentStickerIds,[...STICKER_IDS.slice(3,15)].reverse());
  assert.equal(normalize(state).locked,false);
  beforeError(state,()=>setDayStickers(state,DAY,['../unknown']));
});
