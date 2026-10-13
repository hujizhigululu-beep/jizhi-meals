import { renderSettingsView } from './settings-view.js';
import { CATEGORIES, portions, stockSummary, predictRunway, predictMainCourseRunway } from './runway.js';
import { freshState, uid, round, dateKey, parseDate, addDays, weekDates, SLOTS, ALL_SLOTS, TYPES, forecast, reserved, putMeal, removeMeal, completeMeal, undoComplete, transferMeal, normalize, putDiary, removeDiary } from './model.js';
import { load, persist, STORAGE_KEY, MIGRATION_BACKUP_KEY, V13_BACKUP_KEY, V14_BACKUP_KEY, V15_BACKUP_KEY } from './storage.js';
import { renderSummary, shiftSummaryMonth, summaryMonthDate } from './summary.js';
import { shareImageFile } from './share-card.js';
import { mountTimeline } from './timeline.js';
import { renderMonthCalendar, shiftMonth } from './month-calendar.js';
import { getDayRecord, toggleCheckin, toggleCategoryCheckin, putActivity, removeActivity, setDayStickers } from './activity.js';
import { renderDayRecords, CHECKIN_NAMES } from './day-records-view.js';
import { mountShareEditor } from './share-editor.js';
import { getActivityCategories, upsertActivityCategory, setActivityCategoryActive, moveActivityCategory } from './activity-shortcuts.js';
import { MEAL_SCENES, prefillMealTemplate, upsertMealTemplate, removeMealTemplate } from './meal-templates.js';
import { renderMealShortcuts, renderTemplateIngredients } from './meal-shortcuts-view.js';
import { renderNotebookHeader } from './notebook-header.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => dateKey(new Date());
const labels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食 / 加餐' };
const mealArt = { breakfast: 'croissant', lunch: 'bento', dinner: 'stew', snack: 'strawberry' };
const mealPaperArt = { breakfast: 'strawberry-croissant', lunch: 'strawberry-bento', dinner: 'strawberry-soup', snack: 'strawberry-pudding' };
const slotEnglish = { breakfast: '01 · BREAKFAST', lunch: '02 · LUNCH', dinner: '03 · DINNER', snack: '04 · LITTLE TREATS' };
const illustration = (name, className = '') => `<img src="./assets/food/${name}.svg" alt="" aria-hidden="true" class="${className}" width="48" height="48">`;
const resourceText = meal => (meal.resources || []).map(r => `${r.name} · ${r.amount} ${r.unit}`).join('、');
function migrationBackup() { try { return storage?.getItem(MIGRATION_BACKUP_KEY) || ''; } catch { return ''; } }
const times = { breakfast: '开启甜甜的一天 (๑´ڡ`๑)', lunch: '好好吃饭，好好生活 ♡', dinner: '给今天一个温柔收尾 (˶ᵔ ᵕ ᵔ˶)', snack: '一点甜甜的小补充 (｡•ᴗ•｡)' };
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
let storage;
let loaded;
try { storage = window.localStorage; loaded = load(storage); }
catch { loaded = { state: freshState(), locked: true, raw: null, warnings: ['浏览器暂时不允许本地保存，请开启网站存储后重新打开。'] }; }
let state = loaded.state;
let locked = loaded.locked;
let savedRaw = loaded.raw;
let dataRevision = 0;
let warnings = loaded.warnings;
const PAGES = ['calendar', 'inventory', 'summary', 'settings'];
let page = PAGES.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'calendar';
let summaryRange = 'month';
let summaryDate = today();
let selectedDate = today();
let calendarView = 'day';
let calendarMonth = selectedDate.slice(0, 7), calendarMode = 'all';
const dayUI = new Map();
function recordUI(date) {
  if (!dayUI.has(date)) dayUI.set(date, {study:{content:'',minutes:'',note:'',categoryId:'',distanceKm:'',editing:null,open:false},exercise:{content:'',minutes:'',note:'',categoryId:'',distanceKm:'',editing:null,open:false},stickerOpen:false,stickerGroup:'recent'});
  return dayUI.get(date);
}
function captureDayUI() {
  const section = document.querySelector('.day-checkins'); if (!section) return;
  const ui = recordUI(section.dataset.recordDate);
  section.querySelectorAll('.activity-details').forEach(details => {
    const kind = details.dataset.kind; ui[kind].open = details.open;
    const form = details.querySelector('form');
    for (const name of ['content','minutes','note','categoryId','distanceKm']) if(form.elements[name])ui[kind][name] = form.elements[name].value;
  });
  ui.stickerOpen = section.querySelector('.day-sticker-picker').open;
}
function restoreActivityDraft(draft,previous,originalItem,date,kind){
  const current=state.dayRecords?.find(row=>row.date===date)?.[kind]?.items.find(item=>item.id===previous.editing);
  const conflict=draft.conflict||previous.editing&&(!originalItem||JSON.stringify(originalItem)!==JSON.stringify(current));
  Object.assign(draft,previous,...(conflict?[{editing:null,conflict:true}]:[]));
}
let timelineAnchorDate = null;
let timelineController = null;
const timelineExpandedDates = new Set();
const mealExpandedIds = new Set();
const diaryExpandedDates = new Set();
let offlineReady = false;
let swUpdateReady = false;
const APP_CACHE = 'jizhi-meals-shell-v1.5-shortcuts-1';
let cardAsset = null;
let cardPreviewUrl = null;
let shareGeneration = 0;
let shareController = null;
let installPrompt = null;
let backupTime = '';
try { backupTime = storage?.getItem('jizhi-last-export') || ''; } catch {}
let fridgeView = 'list', runwayDaily = 2, runwayMode = 'comprehensive';
try { fridgeView = storage?.getItem('jizhi-fridge-view') === 'cards' ? 'cards' : 'list'; runwayDaily = storage?.getItem('jizhi-runway-daily') === '1' ? 1 : 2; runwayMode = storage?.getItem('jizhi-runway-mode') === 'main' ? 'main' : 'comprehensive'; } catch {}
function preference(key, value) {
  try { storage.setItem(key, String(value)); return true; }
  catch { toast('查看偏好没能保存，请检查浏览器存储空间。'); return false; }
}
let toastTimer;
const sheet = $('#sheet');
const sheetContent = $('#sheet-content');
function releaseCard() { if (cardPreviewUrl) URL.revokeObjectURL(cardPreviewUrl); cardPreviewUrl = null; cardAsset = null; }
sheet.addEventListener('close', () => { shareGeneration++; shareController?.destroy(); shareController=null; releaseCard(); });

function toast(message) {
  clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').classList.add('visible');
  toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4200);
}
function dateLabel(key, full = false) {
  const d = parseDate(key);
  return d ? `${full ? d.getFullYear() + '年' : ''}${d.getMonth() + 1}月${d.getDate()}日 ${weekdays[d.getDay()]}` : '';
}
function readOnlyGuard() {
  if (!locked) return false;
  toast('本地数据需要先恢复，请到「我的设置」保留原文件并导入备份。'); return true;
}
function commit(change, success = '') {
  if (readOnlyGuard()) return false;
  try {
    if (storage.getItem(STORAGE_KEY) !== savedRaw) {
      refreshFromStorage(); closeSheet(); toast('另一窗口刚更新了手账，已刷新，请再操作一次。'); return false;
    }
    const next = structuredClone(state);
    change(next);
    const saved = persist(storage, next);
    state = saved; savedRaw = JSON.stringify(saved); warnings = [];
    render(); if (success) toast(success); return true;
  } catch (error) {
    const text = error.name === 'QuotaExceededError' ? '设备存储空间不足，这次修改没有保存。请先导出备份并释放空间。' : error.message || '暂时没能保存，请检查浏览器是否允许网站存储。';
    toast(text); return false;
  }
}
function refreshFromStorage() {
  dataRevision++;
  captureDayUI();
  try {
    const result=load(storage);
    for(const [date,ui]of dayUI)for(const kind of ['study','exercise']){
      const draft=ui[kind];if(!draft.editing)continue;
      const before=state.dayRecords?.find(row=>row.date===date)?.[kind]?.items.find(item=>item.id===draft.editing);
      const after=result.state.dayRecords?.find(row=>row.date===date)?.[kind]?.items.find(item=>item.id===draft.editing);
      if(JSON.stringify(before)!==JSON.stringify(after)){draft.editing=null;draft.conflict=true;}
    }
    state = result.state; savedRaw = result.raw; locked = result.locked; warnings = result.warnings; render();
  }
  catch { locked = true; warnings = ['暂时无法读取本地数据，请检查浏览器存储权限。']; render(); }
}
window.addEventListener('storage', e => {
  if (e.key === STORAGE_KEY || e.key === null) { closeSheet(); refreshFromStorage(); toast('手账已同步另一个窗口的本地修改。'); }
});
function showSheet(title, subtitle, body) {
  sheetContent.innerHTML = `<div class="sheet-head"><h2 id="sheet-title">${escape(title)}</h2><button type="button" class="close-button" data-close aria-label="关闭面板">×</button></div>${subtitle ? `<p class="sheet-subtitle">${escape(subtitle)}</p>` : ''}${body}`;
  sheet.oncancel = () => {};
  if (!sheet.open) sheet.showModal();
  sheet.scrollTop = 0;
}
function closeSheet() { sheet.close(); }
sheet.addEventListener('click', e => { if (e.target.closest('[data-close]')) sheet.close(); });
async function ask(title, message, yes = '确认') {
  const revisionAtStart = dataRevision;
  const wasOpen = sheet.open;
  const nodes = Array.from(sheetContent.childNodes);
  const previousCancel = sheet.oncancel;
  const previousFocus = document.activeElement;
  showSheet(title, '', `<p class="confirm-message">${escape(message)}</p><div class="form-buttons"><button class="secondary" id="confirm-no">再想想</button><button class="primary" id="confirm-yes">${escape(yes)}</button></div>`);
  return new Promise(resolve => {
    let resolved = false;
    const finish = value => {
      if (resolved) return; resolved = true;
      sheet.removeEventListener('close', cancel);
      if (dataRevision !== revisionAtStart) {
        sheetContent.replaceChildren(); sheet.oncancel = null;
        if (sheet.open) sheet.close();
        resolve(false); return;
      }
      sheetContent.replaceChildren(...nodes); sheet.oncancel = previousCancel;
      if (!wasOpen) sheet.close();
      else if (!sheet.open) sheet.showModal();
      if (wasOpen) previousFocus?.focus();
      resolve(value);
    };
    const cancel = () => finish(false);
    $('#confirm-no').onclick = () => finish(false);
    $('#confirm-yes').onclick = () => finish(true);
    sheet.oncancel = e => { e.preventDefault(); finish(false); };
    sheet.addEventListener('close', cancel);
  });
}
function formError(form, message) { const el = form.querySelector('.form-error'); el.textContent = message; el.hidden = false; el.scrollIntoView({ block: 'nearest' }); }

function render({captureDrafts=true}={}) {
  if(captureDrafts)captureDayUI();
  timelineController?.destroy(); timelineController = null;
  const chapter = page === 'calendar' ? calendarView : page;
  const header = $('.brand-header');
  header.innerHTML = renderNotebookHeader(page, calendarView);
  header.dataset.chapter = chapter;
  document.body.classList.toggle('timeline-mode', page === 'calendar' && calendarView === 'timeline');
  document.body.classList.toggle('day-mode', page === 'calendar' && calendarView === 'day');
  document.body.classList.toggle('month-mode', page === 'calendar' && calendarView === 'month');
  for (const name of ['inventory', 'summary', 'settings']) document.body.classList.toggle(`${name}-mode`, page === name);
  document.querySelectorAll('[data-page]').forEach(b => { b.classList.toggle('active', b.dataset.page === page); b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'); });
  const notice = $('#data-notice'); notice.hidden = !warnings.length;
  notice.innerHTML = warnings.length ? `${escape(locked ? '原数据暂时无法读取，已保护原文件，尚未覆盖。' : `发现 ${warnings.length} 项数据异常，正常记录仍可查看。`)}<button data-action="original">保存原文件</button><button data-page="settings">去恢复</button>` : '';
  $('#main').innerHTML = page === 'calendar' ? (calendarView === 'timeline' ? renderTimelinePage() : calendarView === 'month' ? renderMonthPage() : renderCalendar()) : page === 'inventory' ? renderInventory() : page === 'summary' ? renderSummary(state, summaryDate, summaryRange, today()) : renderSettings();
  if (page === 'calendar' && calendarView === 'timeline') {
    sizeTimeline();
    timelineController = mountTimeline($('#date-timeline'), state, {
      selectedDate, today: today(), anchorDate: timelineAnchorDate, expandedDates: timelineExpandedDates,
      onSelect: openDay,
      onAnchorChange: date => {
        timelineAnchorDate = date;
        const period = $('#timeline-period'), d = parseDate(date);
        if (period && d) period.textContent = `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
      }
    });
  } else if (page === 'calendar' && calendarView === 'day') {
    const strip = $('.date-strip'), active = $('.date-tab.active');
    if (active && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2);
  }
}
function sizeTimeline() {
  const scroller = $('#date-timeline'), nav = $('.bottom-nav');
  if (!scroller || !nav) return false;
  const height = Math.round(Math.max(220, Math.min(660, nav.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 12)));
  const previous = scroller.clientHeight;
  scroller.style.setProperty('--timeline-height', `${height}px`);
  return Math.abs(previous - height) > 1;
}
let timelineResizeFrame = null;
function resizeTimeline() {
  if (timelineResizeFrame !== null) return;
  timelineResizeFrame = requestAnimationFrame(() => {
    timelineResizeFrame = null;
    if (page !== 'calendar' || calendarView !== 'timeline') return;
    const anchor = timelineController?.getAnchorDate() || timelineAnchorDate || selectedDate;
    if (sizeTimeline()) timelineController?.jumpToDate(anchor);
  });
}
window.addEventListener('resize', resizeTimeline);
window.visualViewport?.addEventListener('resize', resizeTimeline);
function renderTimelinePage() {
  const d = parseDate(timelineAnchorDate || selectedDate);
  return `<section class="page timeline-page"><div class="section-heading timeline-heading"><div><div class="eyebrow">MY LITTLE DAYS</div><h1>日期时间轴</h1><p class="subheading">把甜甜的日子串起来 (˶ᵔ ᵕ ᵔ˶)</p></div><span id="timeline-period">${d.getFullYear()}年 ${d.getMonth() + 1}月</span></div>${calendarTabs()}<div class="timeline-toolbar"><button class="pill" data-action="timeline-today">♡ 回到今天</button><button class="pill" data-action="jump">跳到某一天 ↗</button><span>点日期展开摘要</span></div><div id="date-timeline" class="timeline-scroll" role="region" aria-label="上下滑动查看每日餐食、学习、运动与日记预览"></div></section>`;
}
function calendarTabs() {
  return `<div class="calendar-view-switch" role="group" aria-label="生活记录视图">${[['day','日记录'],['month','月历'],['timeline','时间轴']].map(([view,label])=>`<button type="button" data-calendar-view="${view}" ${view==='timeline'?'data-action="timeline"':''} aria-pressed="${calendarView===view}">${label}</button>`).join('')}</div>`;
}
function renderMonthPage() {
  const meals = state.meals.filter(meal=>meal.date===selectedDate);
  return `<section class="page month-page"><div class="section-heading chapter-heading"><div><div class="eyebrow">MY LITTLE CALENDAR</div><h1>每天，都有一点小积累</h1><p class="subheading">轻轻记下，回头看见生活 ♡</p></div></div>${calendarTabs()}${renderMonthCalendar(state,{month:calendarMonth,mode:calendarMode,selectedDate,today:today()})}<div class="month-selected-heading"><h2>${dateLabel(selectedDate)}</h2><button class="pill" data-action="share-day">分享卡片</button></div><p class="month-meal-status">${meals.length?`${meals.length} 餐记录 · ${meals.filter(meal=>meal.completed).length} 餐已吃`:'这一天还没有餐食记录'} <button class="text-button" data-action="open-selected-day">翻开这一天 ↗</button></p>${renderDayRecords(state,selectedDate,recordUI(selectedDate))}<p class="footer-note">积累一点点，也值得被记住 ♡</p></section>`;
}
function selectCalendarMonth(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || !parseDate(month+'-01')) { toast('请选择有效月份。'); return; }
  const [year,number]=month.split('-').map(Number), last=new Date(0);
  last.setHours(12,0,0,0);last.setFullYear(year,number,0);
  selectedDate=month+'-'+String(Math.min(parseDate(selectedDate).getDate(),last.getDate())).padStart(2,'0');
  calendarMonth=month;render();
}
function openDay(date) {
  if (!parseDate(date)) return;
  selectedDate = date; calendarView = 'day'; page = 'calendar';
  if (location.hash !== '#calendar') location.hash = 'calendar';
  render(); window.scrollTo(0, 0);
}
function renderCalendar() {
  const d = parseDate(selectedDate), offset=(d.getDay()+6)%7;
  const dates = Array.from({length:7},(_,i)=>addDays(selectedDate,i-offset)).filter(Boolean);
  const first = parseDate(dates[0]); const last = parseDate(dates.at(-1));
  const span = `${first.getMonth() + 1}.${first.getDate()} — ${last.getMonth() + 1}.${last.getDate()}`;
  const weekMeals = state.meals.filter(m => dates.includes(m.date));
  return `<section class="page calendar-page"><div class="section-heading chapter-heading"><div><div class="eyebrow">MY DAILY MEAL NOTES</div><h1>我的餐食手账</h1><p class="subheading">把今天的好味道，贴进这一页 ♡</p></div></div>
    ${calendarTabs()}<div class="calendar-topline"><span class="calendar-month">${d.getFullYear()}年 ${d.getMonth() + 1}月</span><button class="pill pink" data-action="today">回到今天</button></div>
    <div class="week-toolbar"><div class="week-pager"><button class="icon-button" data-action="prev" aria-label="上一周">‹</button><span class="week-label">${span}${first.getFullYear() !== last.getFullYear() ? ' · 跨年' : ''}</span><button class="icon-button" data-action="next" aria-label="下一周">›</button></div><button class="pill jump-button" data-action="jump">跳转日期 <span aria-hidden="true">⌁</span></button></div>
    <div class="date-strip" role="group" aria-label="本周七天">${dates.map((key, index) => { const day = parseDate(key); return `<button class="date-tab ${index > 4 ? 'weekend' : ''} ${key === today() ? 'today' : ''} ${key === selectedDate ? 'active' : ''}" data-date="${key}" aria-pressed="${key === selectedDate}" aria-label="${dateLabel(key, true)}${key === today() ? '，今天' : ''}">${key === today() ? '<span class="today-heart" aria-hidden="true">♥</span>' : ''}<span class="weekday">${weekdays[day.getDay()]}</span><span class="date-number">${day.getDate()}</span>${(state.meals.some(m => m.date === key) || state.diaries.some(d => d.date === key)) ? '<span class="date-dot" aria-hidden="true"></span>' : ''}</button>`; }).join('')}</div>
    <div class="day-heading"><h2>${dateLabel(selectedDate)}</h2><span class="tiny-heart">${selectedDate === today() ? '♡ 就是今天' : '♡ 我的小计划'}</span></div>
    <div class="day-tools"><span class="day-record-label">✎ 今日记录</span><button class="pill" data-action="share-day">🍓 分享卡片</button></div>
    <div class="meals">${SLOTS.map(slot => mealCard(slot)).join('')}</div>
    ${renderSnacks()}
    ${renderDayRecords(state,selectedDate,recordUI(selectedDate))}
    ${renderDiary()}
    <p class="footer-note">一口一口，好好生活 ♡ · 本周 ${weekMeals.length} 条小纸条</p>
  </section>`;
}
function mealCard(slot, snack = null) {
  const meal = slot === 'snack' ? snack : state.meals.find(m => m.date === selectedDate && m.slot === slot);
  const category = `<div class="meal-category"><span class="slot-icon" aria-hidden="true"><img src="./assets/share-art/${mealPaperArt[slot]}.svg" alt="" width="32" height="32"></span><strong>${labels[slot]}</strong>${meal?.time ? `<small class="meal-time">${escape(meal.time)}</small>` : ''}</div>`;
  const classes = `meal-card ${slot} ${slot === 'snack' ? 'snack-card' : ''} ${meal ? 'has-meal' : 'is-empty'} ${meal?.completed ? 'done' : ''}`;
  if (!meal) return `<article class="${classes}">${category}<div class="meal-content"><span class="empty-label">今天想吃什么捏？(｡•ᴗ•｡)</span></div><div class="meal-card-controls"><button class="meal-add" data-add="${slot}" aria-label="添加${labels[slot]}">＋</button></div></article>`;
  const brief = meal.note || resourceText(meal) || meal.protein || times[slot];
  const resources = meal.resources.length ? `<span class="meal-resource-list">${meal.resources.map(r => `<span class="meal-resource-chip">${escape(r.name)} ${r.amount}${escape(r.unit)}</span>`).join('')}</span>` : '';
  const quick = meal.completed
    ? `<button class="meal-undo" data-undo="${escape(meal.id)}" aria-label="撤销${escape(meal.name)}已吃并返还库存">撤销</button>`
    : `<button class="meal-complete" data-complete="${escape(meal.id)}" aria-label="标记${escape(meal.name)}已吃">吃过</button>`;
  return `<article class="${classes}"><details class="meal-record" data-meal-fold="${escape(meal.id)}" ${mealExpandedIds.has(meal.id) ? 'open' : ''}><summary class="meal-record-summary">${category}<div class="meal-inline-summary"><div class="meal-name-line"><span class="meal-name">${escape(meal.name)}</span><span class="${meal.completed ? 'done-stamp' : 'planned-stamp'}">${meal.completed ? '已吃' : '小计划'}</span></div><span class="meal-brief">${escape(brief)}</span></div><span class="meal-fold-toggle" aria-hidden="true">⌄</span></summary><div class="meal-record-body"><button class="meal-details" data-detail="${escape(meal.id)}" aria-label="查看${escape(meal.name)}详情"><span class="meal-name">${escape(meal.name)}</span><span aria-hidden="true">详情 ↗</span></button>${resources}<p class="meal-kind">${escape(meal.type)}${meal.protein ? ' · ' + escape(meal.protein) : ''}</p>${meal.note ? `<p class="meal-note">${escape(meal.note)}</p>` : ''}<div class="meal-card-controls"><button class="meal-edit" data-edit-meal="${escape(meal.id)}" aria-label="查看或编辑${escape(meal.name)}">编辑这餐</button><button class="text-button" data-detail="${escape(meal.id)}">复制 / 移动 / 删除</button></div></div></details><div class="meal-quick-controls">${quick}</div></article>`;
}
function renderSnacks() {
  const snacks = state.meals.filter(m => m.date === selectedDate && m.slot === 'snack').sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  return `<section class="snack-section" aria-label="零食和加餐"><div class="snack-heading"><h2>零食 / 加餐 🍓</h2><button class="pill" data-action="add-snack">＋ 添一张小纸条</button></div>${snacks.map(m => mealCard('snack', m)).join('')}${snacks.length ? '' : '<p class="muted">水果、下午茶，小甜点也有自己的小纸条 (｡•ᴗ•｡)</p>'}</section>`;
}
function renderDiary() {
  const diary = state.diaries.find(d => d.date === selectedDate);
  const heading = `<div class="diary-heading"><h2>今天的小故事 (˶ᵔ ᵕ ᵔ˶)</h2><button class="text-button" data-action="edit-diary">${diary ? '编辑小纸条' : '写点什么'}</button></div>`;
  if (!diary) return `<section class="diary-card" aria-label="今日日记">${heading}<p class="muted">心情、小确幸，慢慢写就好 (｡•ᴗ•｡)</p></section>`;
  return `<section class="diary-card" aria-label="今日日记">${heading}<details class="diary-disclosure" data-diary-date="${selectedDate}" ${diaryExpandedDates.has(selectedDate) ? 'open' : ''}><summary class="diary-summary">${diary.mood ? `<span class="diary-mood">${escape(diary.mood)}</span>` : ''}<span class="diary-preview">${escape(diary.text || diary.joy || '这一页的小心情 ♡')}</span><span class="diary-fold-toggle" aria-hidden="true">⌄</span></summary><div class="diary-body">${diary.mood ? `<p class="diary-mood">${escape(diary.mood)}</p>` : ''}${diary.text ? `<p class="diary-text">${escape(diary.text)}</p>` : ''}${diary.joy ? `<p class="diary-joy">今日小确幸 ♡<br>${escape(diary.joy)}</p>` : ''}</div></details></section>`;
}
function diaryEditor() {
  if (readOnlyGuard()) return;
  const date = selectedDate;
  const original = state.diaries.find(d => d.date === date);
  showSheet('留住今天的小故事 (˶ᵔ ᵕ ᵔ˶)', dateLabel(date, true), `<form id="diary-form"><label class="form-field">今日心情 <span class="muted">（可选）</span><input name="mood" maxlength="100" value="${escape(original?.mood || '')}" placeholder="一个表情，或一句自己的话"></label><div class="day-tools" aria-label="心情表情">${['😊', '🍓', '😌', '🌧️', '🥱', '✨'].map(m => `<button type="button" class="pill" data-mood="${m}" aria-label="心情 ${m}">${m}</button>`).join('')}</div><label class="form-field">今日日记 <span class="muted">（可选）</span><textarea name="text" maxlength="5000" rows="8" placeholder="今天想记住些什么呢？">${escape(original?.text || '')}</textarea><span class="field-hint">最多 5000 个字符，内容只留在此设备中。</span></label><label class="form-field">今日小确幸 <span class="muted">（可选）</span><textarea name="joy" maxlength="500" rows="2" placeholder="例如：吃到喜欢的草莓 ♡">${escape(original?.joy || '')}</textarea></label><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary" data-close>再想想</button><button type="submit" class="primary">收好今天 ♡</button></div>${original ? '<button type="button" id="delete-diary" class="text-button danger">删除这一天的日记</button>' : ''}</form>`);
  const form = $('#diary-form');
  form.querySelectorAll('[data-mood]').forEach(button => { button.onclick = () => { form.elements.mood.value = button.dataset.mood; }; });
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const entry = { date, mood: form.elements.mood.value.trim(), text: form.elements.text.value.trim(), joy: form.elements.joy.value.trim() };
      if (!entry.mood && !entry.text && !entry.joy) {
        if (!original) { closeSheet(); return; }
        if (!await ask('收起今天的日记？', '三个内容都为空，保存会删除这一天的日记。餐食和其他日期的日记保持完整。', '确认删除日记')) return;
      }
      if (commit(s => putDiary(s, entry), '收好啦！(๑•̀ㅂ•́)و✧')) closeSheet();
    } catch (error) { formError(form, error.message); }
    finally { button.disabled = false; }
  };
  if (original) $('#delete-diary').onclick = async () => {
    if (await ask('真的要把这张小纸条收起来吗？🥺', '这一天的心情、日记和小确幸会被删除，无法撤销。餐食及其他日期的日记不受影响。建议先导出备份。', '确认删除日记') && commit(s => removeDiary(s, date), '日记小纸条已收起来。')) closeSheet();
  };
}

function shareEditor() {
  shareController?.destroy(); releaseCard(); shareGeneration++;
  const date = selectedDate;
  showSheet('给记录换件手账衣服 🍓', dateLabel(date, true), '<div id="journal-share-editor"></div>');
  shareController=mountShareEditor($('#journal-share-editor'),structuredClone(state),date,{
    onPending:releaseCard,
    onImage:image=>{releaseCard();cardAsset=image;cardPreviewUrl=URL.createObjectURL(image.blob);return cardPreviewUrl;}
  });
}
function downloadCard() {
  if (!cardAsset || !cardPreviewUrl) return;
  const a = document.createElement('a'); a.href = cardPreviewUrl; a.download = cardAsset.filename; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  $('#share-result').textContent = 'PNG 已交给浏览器，请确认保存到「文件」。想存到相册可用系统分享，或长按预览图片。';
}
async function nativeShareCard(button) {
  if (!cardAsset) return;
  const asset=cardAsset;
  button.disabled = true;
  try {
    // Use a fresh gesture after generation; do not await rendering before navigator.share.
    const result = await shareImageFile(asset.blob, asset.filename);
    if(cardAsset!==asset)return;
    const status = $('#share-result'); if (!status) return;
    if (result === 'shared') status.textContent = '卡片已交给系统分享，请确认保存位置 ♡';
    else if (result === 'unsupported') status.textContent = '这个浏览器暂不支持图片文件分享。请点「下载 PNG」，或长按预览图片保存。';
    else status.textContent = '分享已取消，图片还在这里，想保存时再点就好。';
  } catch (error) { if(cardAsset!==asset)return;const status = $('#share-result'); if (status) status.textContent = `系统分享没有完成：${error.message || '请重试或使用下载 PNG。'}`; }
  finally { if (button.isConnected) button.disabled = false; }
}

function ingredientArt(name) {
  if (/虾|鱼|蟹|海鲜/.test(name)) return 'shrimp';
  if (/鸡蛋|蛋/.test(name)) return 'egg';
  if (/鸡|鸭/.test(name)) return 'chicken';
  if (/豆/.test(name)) return 'beans';
  if (/奶|乳/.test(name)) return 'milk';
  return 'meat';
}
function runwayPanel() {
  const summary = stockSummary(state.inventory, today());
  const main = runwayMode === 'main';
  const prediction = (main ? predictMainCourseRunway : predictRunway)(state, today(), runwayDaily);
  const unclassified = state.inventory.filter(item => !CATEGORIES.includes(item.category)).length;
  const coverage = prediction.last ? dateLabel(prediction.last.date, true).replace(/ 周[日一二三四五六]/, '') + ' · ' + labels[prediction.last.slot] : '尚不能覆盖下一餐';
  return `<aside class="runway-note"><span class="runway-background-art" aria-hidden="true"></span><h2>餐食续航 <span aria-hidden="true">♡</span></h2><div class="runway-mode-switch" role="group" aria-label="餐食续航预测模式">${[['comprehensive','综合预测'],['main','主菜续航']].map(([mode,label])=>`<button type="button" data-runway-mode="${mode}" data-mode="${mode}" aria-pressed="${runwayMode===mode}">${label}</button>`).join('')}</div><p class="runway-total">${main?'主菜还能吃':'当前还能吃'} <strong>${main?prediction.covered:summary.total}</strong> 顿${prediction.capped?' <small>预测范围内</small>':''}</p><p class="runway-coverage"><small>按当前计划覆盖至</small><strong>${coverage}</strong></p>${main?`<div class="runway-counts"><span>蛋白质搭配 <b>${prediction.proteinMeals}</b> 顿</span><span>整套餐食 <b>${prediction.readyMeals}</b> 顿</span></div>`:`<p class="runway-bottleneck">最先不足 <strong>${summary.bottlenecks.join('、')}</strong></p>`}<details class="runway-details"><summary>展开说明与设置</summary><div class="runway-counts">${main?'':`<span>自己搭配 <b>${summary.combined}</b> 顿</span><span>整套食物 <b>${summary.ready}</b> 顿</span>`}<span>早餐 <b>${summary.breakfast}</b> 次 · 单独统计</span></div><label class="runway-default">未安排餐次<select id="runway-daily" aria-label="未安排餐次默认消耗"><option value="1" ${runwayDaily === 1 ? 'selected' : ''}>每天 1 顿 · 晚餐</option><option value="2" ${runwayDaily === 2 ? 'selected' : ''}>每天 2 顿 · 午餐和晚餐</option></select></label>${unclassified ? `<p>${unclassified} 种食材尚未归入五类，编辑确认分类后计入组合。</p>` : ''}${prediction.shortage ? `<p class="runway-shortage">下一次不足：${dateLabel(prediction.shortage.date, true)} · ${labels[prediction.shortage.slot]}<br>${escape(prediction.shortage.reason)}</p>` : '<p>超过 10 年预测范围，请结合实际计划查看。</p>'}<p>${main?'主菜仅用蛋白质与整套食物。蛋白质按当前数量 ÷ 每餐用量组成主菜；同一已安排餐次的多种蛋白质只计一顿，蛋白质与整套同时使用也只计一顿。蔬菜和碳水不限制主菜续航；早餐分类不算午晚餐。':'每份 = 当前数量 ÷ 每餐默认用量。蛋白质、蔬菜、碳水各 1 份组成一餐；整套食物独立计餐，结果向下取整。'}负库存按 0 计，保质期当天可用。</p><p>从今天开始，已吃餐次跳过；所有未吃计划优先预留具体用量，包括过去日期的预留。早餐和加餐按实际用量消耗，不增加午晚餐顿数。空白午晚餐使用余下库存，先搭配、再用整套食物。没有本模式库存关联的计划跳过。切换模式与预测均不修改库存或计划。</p><button class="text-button" data-action="export">存一份 JSON 备份 ↗</button></details></aside>`;
}
function renderIngredient(item) {
  const predicted = forecast(state, item.id), planned = reserved(state, item.id);
  const category = `<span class="ingredient-category"><span class="category-chip" data-category="${escape(item.category || '')}">${escape(item.category || '未分类')}</span><span>可吃 ${Math.floor(Math.max(0, predicted) / item.perMeal + 1e-9)} 顿</span></span>`;
  const numbers = `<div class="stock-numbers"><div><small>当前库存</small><strong>${item.quantity}</strong><span class="unit">${escape(item.unit)}</span></div><div><small>预计剩余</small><strong class="forecast ${predicted < 0 ? 'low' : ''}">${predicted}</strong><span class="unit">${escape(item.unit)}</span></div></div>`;
  const meta = `<div class="ingredient-meta">每餐 ${item.perMeal}${escape(item.unit)}${planned ? ' · 预留 ' + planned + escape(item.unit) : ''}${item.note ? '<br>' + escape(item.note) : ''}${item.expires ? '<br>' + (item.expires < today() ? '保质期已过，请核对' : '保质期') + ' · ' + escape(item.expires) : ''}</div>`;
  const actions = `<div class="inventory-actions">${predicted < 0 ? '<span class="warning-label">计划超出库存</span>' : '<span></span>'}<button class="text-button" data-ingredient="${escape(item.id)}" aria-label="编辑${escape(item.name)}">编辑 ↗</button></div>`;
  if (fridgeView === 'list') return `<details class="ingredient-row" data-inventory-id="${escape(item.id)}"><summary class="ingredient-row-summary" aria-label="${escape(item.name)}，当前 ${item.quantity}${escape(item.unit)}，预计 ${predicted}${escape(item.unit)}，展开或收起详情"><span class="ingredient-row-heading"><span class="ingredient-name" title="${escape(item.name)}">${escape(item.name)}</span>${category}</span>${numbers.replaceAll('<div', '<span').replaceAll('</div>', '</span>')}<span class="ingredient-row-chevron" aria-hidden="true">⌄</span></summary><div class="ingredient-row-detail"><span class="ingredient-full-name">${escape(item.name)}</span>${meta}${actions}</div></details>`;
  return `<article class="ingredient-card"><div class="ingredient-header"><h2 class="ingredient-name">${escape(item.name)}</h2><span class="ingredient-emoji" aria-hidden="true">${illustration(ingredientArt(item.name))}</span></div>${numbers}${category}${meta}${actions}</article>`;
}
function renderInventory() {
  return `<section class="page inventory-page"><div class="section-heading"><div><div class="eyebrow">MY LITTLE FRIDGE</div><h1>我的食材小冰箱</h1><p class="subheading">${state.inventory.length ? '收好 ' + state.inventory.length + ' 种食材，慢慢安排' : '把喜欢的食材，一份份收好'}</p></div></div>${runwayPanel()}<div class="fridge-toolbar" id="inventory-add-zone"><h2>冰箱里的小储备</h2><button class="pill pink inventory-add-button" data-action="add-ingredient">＋ 添加食材</button><div class="fridge-switch" role="group" aria-label="食材查看模式"><button class="pill" data-fridge-view="list" aria-pressed="${fridgeView === 'list'}">列表</button><button class="pill" data-fridge-view="cards" aria-pressed="${fridgeView === 'cards'}">卡片</button></div></div>${state.inventory.length ? `<div class="inventory-list ${fridgeView === 'list' ? 'fridge-rows' : ''}">${fridgeView === 'list' ? '<div class="inventory-column-head" aria-hidden="true"><span>食材 · 可吃顿数</span><span class="inventory-column-numbers"><span>当前</span><span>预计</span></span><span></span></div>' : ''}${state.inventory.map(renderIngredient).join('')}</div>` : `<div class="empty-state"><span class="illustration" aria-hidden="true">${illustration('basket')}</span><h2>小冰箱还空着呢 (｡•ᴗ•｡)</h2><p>先收好食材，再安排喜欢的一餐。</p><button class="pill pink" data-action="add-ingredient">＋ 添加第一份食材</button></div>`}<button class="pill inventory-add-button inventory-add-again" data-action="add-ingredient">＋ 再添一份食材</button><details class="inventory-explanation"><summary>当前库存与预计剩余</summary><p>当前库存是实际剩余；预计剩余减去所有日期尚未吃的计划，包括过去和未来。安排餐食只预留，吃过才扣库存。</p></details><div class="journal-whitespace" aria-hidden="true"></div></section>`;
}
function renderSettings() {
  let hasV13Backup = false; try { hasV13Backup = !!storage?.getItem(V13_BACKUP_KEY); } catch {}
  let hasV15Backup = false; try { hasV15Backup = !!storage?.getItem(V15_BACKUP_KEY); } catch {}
  let hasV14Backup = false; try { hasV14Backup = !!storage?.getItem(V14_BACKUP_KEY); } catch {}
  return renderSettingsView({ ios: /iPad|iPhone|iPod/.test(navigator.userAgent), offlineReady, swUpdateReady, installPrompt: !!installPrompt, backupTime, locked, savedRaw: !!savedRaw, hasMigrationBackup: !!migrationBackup(), hasV13Backup, hasV14Backup, hasV15Backup, mealTemplateCount:state.mealTemplates.length,studyCategoryCount:state.activityCategories.study.filter(c=>c.active).length,exerciseCategoryCount:state.activityCategories.exercise.filter(c=>c.active).length, mealCount: state.meals.length, inventoryCount: state.inventory.length, diaryCount: state.diaries.length, dayRecordCount:state.dayRecords.length });
}

function mealEditor(slot, id = null) {
  if (readOnlyGuard()) return;
  const existing = state.meals.find(m => m.id === id);
  const meal = existing || { id: uid(), date: selectedDate, slot, name: '', type: slot === 'snack' ? '零食 / 加餐' : '自制便当', protein: '', note: '', resources: [], ...(slot === 'snack' ? { time: '' } : {}) };
  let rows = structuredClone(meal.resources || []);
  let scene = MEAL_SCENES.includes(meal.type) ? meal.type : meal.type==='外出就餐'?'外食':'',selectedTemplateId='';
  showSheet(existing ? '整理这张餐食小纸条' : '今天又有好吃的啦 🍓', `${dateLabel(meal.date, true)} · ${labels[meal.slot]} ♡`, `<form id="meal-form"><div id="meal-shortcuts-host"></div><p id="meal-template-notices" class="field-hint" hidden></p><label class="form-field">菜名<input name="name" required maxlength="80" placeholder="例如：牛肉丸便当" value="${escape(meal.name)}" autocomplete="off"></label>${slot === 'snack' ? `<label class="form-field">时间 <span class="muted">（可选）</span><input name="time" type="time" value="${escape(meal.time || '')}"></label>` : ''}<label class="form-field">这餐的类型<select name="type">${TYPES.map(t => `<option ${meal.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><div id="meal-component-host"></div><fieldset class="resource-controls"><legend>这餐用到的库存食材 <span class="muted">（可选）</span></legend><p class="field-hint">每份食材独立填写用量；安排时预留，吃过才扣库存。配菜也可以直接写在备注里。</p><div class="resource-list" id="resource-list"></div><button type="button" class="pill" id="add-resource" data-action="add-resource" ${state.inventory.length ? '' : 'disabled'}>＋ 添一种食材</button>${state.inventory.length ? '' : '<p class="resource-empty">小冰箱还空着，可以先保存菜名，再去库存添食材。</p>'}</fieldset><label class="form-field">蛋白质来源 <span class="muted">（可选，不扣库存）</span><input name="protein" maxlength="60" value="${escape(meal.protein)}" placeholder="例如：鸡蛋 / 牛肉"></label><label class="form-field">一点小备注 <span class="muted">（可选）</span><textarea name="note" maxlength="200" placeholder="例如：配菜、解冻提醒">${escape(meal.note)}</textarea></label>${existing?.completed ? '<p class="info-card soft">这餐已吃过。调整食材时会先返还原用量，再扣减新用量，仍保留已吃记录。</p>' : ''}<p class="form-error" role="alert" hidden></p><div class="form-buttons"><button class="secondary" type="button" data-close>再想想</button><button class="primary" type="submit">收进手账 ♡</button></div></form>`);
  const form = $('#meal-form');
  function shortcutControls() {
    const fold=form.querySelector('.meal-template-fold'),templateName=form.elements.mealTemplateName?.value||'';
    form.querySelector('#meal-shortcuts-host').innerHTML=renderMealShortcuts(state,meal.date,meal.slot,{scene,selectedTemplateId,templatesOpen:fold?.open,templateName});
    componentControls();
  }
  function componentControls() {
    const opened=Array.from(form.querySelectorAll('.meal-component-group[open]')).map(el=>el.dataset.component);
    form.querySelector('#meal-component-host').innerHTML=renderTemplateIngredients(state.inventory,scene,rows.map(row=>row.ingredientId));
    form.querySelectorAll('.meal-component-group').forEach(el=>el.open=opened.includes(el.dataset.component));
  }
  form.addEventListener('click',event=>{
    const button=event.target.closest('button');if(!button)return;
    if(button.hasAttribute('data-meal-scene')||button.hasAttribute('data-meal-template')) {
      const key=button.dataset.mealTemplate||button.dataset.mealScene;
      try {
        const draft=prefillMealTemplate(state,key);selectedTemplateId=button.dataset.mealTemplate||'';scene=selectedTemplateId?state.mealTemplates.find(t=>t.id===key).scene:key;
        form.elements.name.value=draft.name;form.elements.type.value=draft.type;form.elements.note.value=draft.note;form.elements.protein.value='';rows=draft.resources;
        const notices=form.querySelector('#meal-template-notices');notices.textContent=draft.notices.join(' ');notices.hidden=!draft.notices.length;
        renderRows();shortcutControls();
      } catch(error){formError(form,error.message);}return;
    }
    if(button.hasAttribute('data-save-meal-template')){
      try {
        if(!scene)throw new Error('请先选一种餐食场景，再收为常用组合。');
        const template={name:form.elements.mealTemplateName.value.trim(),scene,mealName:form.elements.name.value.trim(),note:form.elements.note.value.trim(),resources:readRows()};
        if(commit(book=>upsertMealTemplate(book,template),'常吃组合收好啦，下次少写几笔 ♡'))shortcutControls();
      }catch(error){formError(form,error.message);}return;
    }
    if(button.hasAttribute('data-manage-meal-templates')){event.stopPropagation();const restore=sheetReturn();mealTemplateManager(button.dataset.manageMealTemplates,()=>{restore();shortcutControls();});}
  });
  form.addEventListener('change',event=>{
    if(event.target.name==='type'){readRows();scene=MEAL_SCENES.includes(event.target.value)?event.target.value:event.target.value==='外出就餐'?'外食':'';selectedTemplateId='';shortcutControls();}
    if(event.target.hasAttribute('data-template-ingredient')) {
      readRows();const id=event.target.dataset.templateIngredient,item=state.inventory.find(i=>i.id===id);
      if(event.target.checked&&item&&!rows.some(r=>r.ingredientId===id))rows.push({ingredientId:id,amount:item.perMeal});
      if(!event.target.checked)rows=rows.filter(r=>r.ingredientId!==id);
      renderRows();componentControls();
    }
  });
  function readRows() {
    rows = Array.from(form.querySelectorAll('.resource-row')).map(row => ({ ingredientId: row.querySelector('select').value, amount: Number(row.querySelector('input').value) }));
    return rows.filter(r => r.ingredientId);
  }
  function updateHints() {
    readRows();
    const used = rows.map(r => r.ingredientId);
    form.querySelectorAll('.resource-row').forEach((row, index) => {
      const select = row.querySelector('select'), input = row.querySelector('input');
      for (const option of select.options) option.disabled = !!option.value && option.value !== select.value && used.includes(option.value);
      input.disabled = !select.value; input.required = !!select.value;
      const item = state.inventory.find(i => i.id === select.value);
      const prior = existing?.completed ? (existing.resources || []).find(r => r.ingredientId === select.value)?.amount || 0 : 0;
      const remaining = item ? round(forecast(state, item.id, id) + prior - (Number.isFinite(Number(input.value)) ? Number(input.value) : 0)) : null;
      row.querySelector('.resource-hint').textContent = item ? `保存后预计剩余 ${remaining} ${item.unit}${remaining < 0 ? ' · 小冰箱快见底啦，记得补货捏 ♡' : ''}` : '不关联这一项库存';
    });
    $('#add-resource').disabled = !state.inventory.some(i => !used.includes(i.id));
    form.querySelectorAll('[data-template-ingredient]').forEach(input=>input.checked=used.includes(input.dataset.templateIngredient));
  }
  function renderRows() {
    $('#resource-list').innerHTML = rows.map((r, index) => `<div class="resource-row" data-resource-index="${index}"><label class="form-field" for="resource-${index}">食材 ${index + 1}<select id="resource-${index}" class="resource-select" name="ingredient-${index}"><option value="">不关联库存</option>${state.inventory.map(i => `<option value="${escape(i.id)}" ${r.ingredientId === i.id ? 'selected' : ''}>${escape(i.name)} · 当前 ${i.quantity} ${escape(i.unit)}</option>`).join('')}</select></label><label class="form-field" for="amount-${index}">使用数量<input id="amount-${index}" class="resource-amount-input" name="amount-${index}" type="number" min="0.001" max="1000000000" step="0.001" inputmode="decimal" value="${r.amount}"></label><button type="button" class="resource-remove text-button" data-remove-resource="${index}" aria-label="移除食材 ${index + 1}">移除</button><p class="resource-hint field-hint"></p></div>`).join('');
    updateHints();
  }
  $('#add-resource').onclick = () => {
    readRows(); const item = state.inventory.find(i => !rows.some(r => r.ingredientId === i.id));
    if (!item) return;
    rows.push({ ingredientId: item.id, amount: item.perMeal }); renderRows();
    $('#resource-list').lastElementChild.querySelector('select').focus();
  };
  $('#resource-list').addEventListener('change', e => {
    if (e.target.tagName === 'SELECT') {
      const item = state.inventory.find(i => i.id === e.target.value);
      if (item) e.target.closest('.resource-row').querySelector('input').value = item.perMeal;
    }
    updateHints();
  });
  $('#resource-list').addEventListener('input', updateHints);
  $('#resource-list').addEventListener('click', e => {
    const button = e.target.closest('[data-remove-resource]'); if (!button) return;
    readRows(); rows.splice(Number(button.dataset.removeResource), 1); renderRows();
  });
  renderRows();shortcutControls();
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const next = { ...meal, name: form.elements.name.value.trim(), type: form.elements.type.value, protein: form.elements.protein.value.trim(), note: form.elements.note.value.trim(), resources: readRows(), ...(meal.slot === 'snack' ? { time: form.elements.time.value } : {}) };
      const preview = structuredClone(state); putMeal(preview, next, false, true);
      const shortages = next.resources.map(r => ({ item: preview.inventory.find(i => i.id === r.ingredientId), predicted: forecast(preview, r.ingredientId) })).filter(r => r.predicted < 0);
      const changedUse = existing?.completed && JSON.stringify((existing.resources || []).map(r => [r.ingredientId, r.amount])) !== JSON.stringify(next.resources.map(r => [r.ingredientId, r.amount]));
      if ((shortages.length || changedUse) && !await ask(shortages.length ? '小冰箱快见底啦 ♡' : '调整已吃记录的用量', `${existing?.completed ? '保存会返还原食材用量，再按新用量扣减实际库存；这餐仍为已吃记录。\n' : ''}${shortages.map(r => `「${r.item.name}」保存后当前 ${r.item.quantity} ${r.item.unit}，预计 ${r.predicted} ${r.item.unit}`).join('\n')}${shortages.length ? '\n可以继续保存，也可以返回核对用量或补货。' : ''}`, '确认保存')) return;
      if (commit(s => putMeal(s, next, false, !!shortages.length), existing ? '收好啦！(๑•̀ㅂ•́)و✧' : '今天又有好吃的啦 🍓')) closeSheet();
    } catch (error) { formError(form, error.message); }
    finally { button.disabled = false; }
  };
}

function mealDetail(id) {
  const meal = state.meals.find(m => m.id === id); if (!meal) return;
  showSheet(meal.name, `${dateLabel(meal.date, true)} · ${labels[meal.slot]}${meal.time ? ' · ' + escape(meal.time) : ''} · ${escape(meal.type)}`, `<div class="detail-note">${escape(resourceText(meal) || (meal.protein ? `蛋白质：${meal.protein}` : '这餐没有关联库存食材'))}${meal.note ? '\n' + escape(meal.note) : ''}</div>${meal.completed ? '<div class="info-card soft">✓ 好好吃过啦，库存已扣减。编辑会重新计算用量，删除会返还库存。复制会生成未吃计划。</div>' : '<div class="info-card soft">♡ 这是未吃计划，实际库存还没有扣减。</div>'}<div class="action-grid"><button class="pink" id="detail-edit">编辑餐食</button>${meal.completed ? `<button data-undo="${escape(id)}">撤销已吃 / 返还库存</button>` : '<button id="detail-move">移动到其他日期</button>'}<button id="detail-copy">复制到其他日期</button><button class="danger" id="detail-delete">删除这餐</button></div>`);
  $('#detail-edit').onclick = () => mealEditor(meal.slot, id);
  if (!meal.completed) $('#detail-move').onclick = () => transferEditor(id, true);
  $('#detail-delete').onclick = async () => {
    if (await ask('真的要把这张小纸条收起来吗？🥺', `删除「${meal.name}」后无法撤销。${meal.completed && meal.resources.length ? `将返还：${resourceText(meal)}。` : '未吃计划不会扣减实际库存。'}建议先导出备份。`, '确认删除') && commit(s => removeMeal(s, id), '这张餐食纸条已收起来，库存已重新计算。')) closeSheet();
  };
  $('#detail-copy').onclick = () => transferEditor(id, false);
}

function transferEditor(id, move) {
  const meal = state.meals.find(m => m.id === id); if (!meal || readOnlyGuard()) return;
  showSheet(move ? '把这餐挪一下' : '再安排一次喜欢的餐', `${meal.name} · 原日期 ${dateLabel(meal.date, true)}`, `<form id="transfer-form"><label class="form-field">放在哪一天<input name="date" type="date" required value="${meal.date}"></label><label class="form-field">哪一餐<select name="slot">${ALL_SLOTS.map(s => `<option value="${s}" ${meal.slot === s ? 'selected' : ''}>${labels[s]}</option>`).join('')}</select></label><p class="field-hint">${move ? '移动后原位置留空，预计用量不会重复计算。' : '复制保留全部食材，生成未吃计划，不重复扣实际库存。'}</p><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary" data-close>再想想</button><button type="submit" class="primary">${move ? '移动到这一天' : '复制到这一天'}</button></div></form>`);
  const form = $('#transfer-form');
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const date = form.elements.date.value, slot = form.elements.slot.value;
      const target = slot === 'snack' ? null : state.meals.find(m => m.date === date && m.slot === slot && m.id !== id);
      if (target?.completed) { formError(form, '这里已有已吃记录，请选择另一餐，保留这份回忆。'); return; }
      if (target && !await ask('这里已经有小计划', `用「${meal.name}」替换「${target.name}」？原未吃计划会被取消。`, '替换计划')) return;
      const next = structuredClone(state); transferMeal(next, id, date, slot, move, !!target);
      const shortages = (meal.resources || []).map(r => ({ ...r, remaining: forecast(next, r.ingredientId) })).filter(r => r.remaining < 0);
      if (shortages.length && !await ask('小冰箱快见底啦 ♡', `${shortages.map(r => `「${r.name}」预计剩余 ${r.remaining} ${r.unit}`).join('\n')}。可以先排好，再慢慢补货；继续吗？`, '继续安排')) return;
      if (commit(s => transferMeal(s, id, date, slot, move, !!target), move ? '小计划挪好啦 ♡' : '喜欢的餐，又安排上啦 ♡')) { selectedDate = date; page = 'calendar'; render(); closeSheet(); }
    } catch (error) { formError(form, error.message); }
    finally { button.disabled = false; }
  };
}

async function markComplete(id) {
  if (readOnlyGuard()) return;
  const meal = state.meals.find(m => m.id === id); if (!meal || meal.completed) return;
  const shortages = (meal.resources || []).map(r => ({ ...r, item: state.inventory.find(i => i.id === r.ingredientId) })).filter(r => r.item && r.item.quantity < r.amount);
  if (shortages.length && !await ask('核对一下实际用量', `${shortages.map(r => `「${r.name}」当前 ${r.item.quantity} ${r.unit}，这餐使用 ${r.amount} ${r.unit}，继续后当前库存为 ${round(r.item.quantity-r.amount)} ${r.unit}`).join('\n')}。可以继续，也可以返回修改用量。`, '确认吃过，继续扣减')) return;
  if (commit(s => completeMeal(s, id, !!shortages.length), '今天也有好好生活呀 (˶ᵔ ᵕ ᵔ˶)')) closeSheet();
}
async function undoMeal(id) {
  if (readOnlyGuard()) return;
  const meal = state.meals.find(m => m.id === id); if (!meal?.completed) return;
  if (await ask('撤销这枚小印章', `将「${meal.name}」恢复为未吃计划${meal.resources.length ? `，并返还：${resourceText(meal)}` : ''}。确定撤销吗？`, '撤销并返还') && commit(s => undoComplete(s, id), '已返还全部用量，这餐恢复为未吃计划。')) closeSheet();
}

// Temporarily keep the existing editor DOM and listeners while managing shortcuts.
function sheetReturn() {
  const nodes=Array.from(sheetContent.childNodes),scroll=sheet.scrollTop,focus=document.activeElement;
  return ()=>{sheetContent.replaceChildren(...nodes);sheet.scrollTop=scroll;if(!sheet.open)sheet.showModal();if(focus?.isConnected)focus.focus({preventScroll:true});};
}
function mealTemplateManager(selectedId='',back=null) {
  if(readOnlyGuard())return;
  const templates=state.mealTemplates;
  showSheet('我的常吃小纸条','模板只做预填，不会安排餐食或扣减库存。新增组合可以从餐食编辑页收为常用。',`<div class="meal-template-manager">${templates.length?templates.map(t=>`<details class="meal-template-edit" ${t.id===selectedId?'open':''}><summary>${escape(t.name)} <small>${escape(t.scene)} · ${t.resources.length} 种食材</small></summary><form data-template-edit="${escape(t.id)}"><label class="form-field">模板名<input name="templateName" required maxlength="60" value="${escape(t.name)}"></label><label class="form-field">场景<select name="scene">${MEAL_SCENES.map(scene=>`<option ${t.scene===scene?'selected':''}>${scene}</option>`).join('')}</select></label><label class="form-field">餐食名称 · 可选<input name="mealName" maxlength="80" value="${escape(t.mealName)}"></label>${t.resources.map((r,index)=>`<label class="form-field">${escape(r.name)} · ${escape(r.unit)}${state.inventory.some(i=>i.id===r.ingredientId)?'':'（库存已移出，预填会跳过）'}<input name="resource-${index}" type="number" min="0.001" max="1000000000" step="0.001" inputmode="decimal" required value="${r.amount}"></label>`).join('')}<label class="form-field">备注<textarea name="note" maxlength="200">${escape(t.note)}</textarea></label><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary danger" data-delete-template="${escape(t.id)}">删除模板</button><button type="submit" class="primary">保存修改</button></div></form></details>`).join(''):'<p class="info-card soft">喜欢的组合可以从餐食编辑页收好，下次就能直接选啦 ♡</p>'}</div>${back?'<button type="button" class="pill" id="shortcut-back">返回餐食草稿</button>':''}`);
  if(back)$('#shortcut-back').onclick=back;
  sheetContent.querySelectorAll('[data-template-edit]').forEach(form=>{
    form.onsubmit=event=>{event.preventDefault();const t=state.mealTemplates.find(row=>row.id===form.dataset.templateEdit);if(!t)return;
      try {const input={...t,name:form.elements.templateName.value.trim(),scene:form.elements.scene.value,mealName:form.elements.mealName.value.trim(),note:form.elements.note.value.trim(),resources:t.resources.map((r,index)=>({...r,amount:Number(form.elements[`resource-${index}`].value)}))};
        if(commit(book=>upsertMealTemplate(book,input),'常吃小纸条整理好啦 ♡'))mealTemplateManager(t.id,back);
      }catch(error){formError(form,error.message);}
    };
    form.querySelector('[data-delete-template]').onclick=async()=>{const id=form.dataset.templateEdit;if(await ask('删除这张快捷模板？','仅删除快捷模板，已有餐食、库存和历史记录都保留。','删除模板')&&commit(book=>removeMealTemplate(book,id),'模板已收起来，已有餐食都保留。'))mealTemplateManager('',back);};
  });
}
function activityCategoryManager(kind,draftName='') {
  if(!Object.hasOwn(CHECKIN_NAMES,kind)||readOnlyGuard())return;
  const categories=getActivityCategories(state,kind),name=CHECKIN_NAMES[kind];
  showSheet(`${name}的小标签`,'可以改名、排序或停用。停用只隐藏快捷入口，历史归属和统计都会保留。',`<div class="activity-category-manager" data-kind="${kind}">${categories.map((c,index)=>`<div class="activity-category-row" data-category-row="${escape(c.id)}"><span class="activity-category-name">${escape(c.name)}${c.active?'':' · 已停用'}</span><div class="activity-category-actions"><button class="text-button" type="button" data-category-rename="${escape(c.id)}">改名</button><button class="text-button" type="button" data-category-move="${escape(c.id)}" data-direction="up" aria-label="上移${escape(c.name)}" ${index===0?'disabled':''}>↑</button><button class="text-button" type="button" data-category-move="${escape(c.id)}" data-direction="down" aria-label="下移${escape(c.name)}" ${index===categories.length-1?'disabled':''}>↓</button><button class="text-button" type="button" data-category-active="${escape(c.id)}" data-active="${!c.active}">${c.active?'停用':'启用'}</button></div></div>`).join('')}<form id="category-form"><label class="form-field">新增${name}标签<input name="categoryName" required maxlength="40" placeholder="给常做的小事取个名字" autocomplete="off" value="${escape(draftName)}"></label><p class="form-error" role="alert" hidden></p><button class="primary" type="submit">＋ 收好新标签</button></form></div>`);
  const form=$('#category-form');form.elements.categoryName.oninput=()=>draftName=form.elements.categoryName.value;form.onsubmit=e=>{e.preventDefault();try{if(commit(book=>upsertActivityCategory(book,kind,{name:form.elements.categoryName.value.trim()}),'新标签收好啦 ♡'))activityCategoryManager(kind);}catch(error){formError(form,error.message);}};
  sheetContent.querySelectorAll('[data-category-move]').forEach(b=>b.onclick=()=>{if(commit(book=>moveActivityCategory(book,kind,b.dataset.categoryMove,b.dataset.direction)))activityCategoryManager(kind,draftName);});
  sheetContent.querySelectorAll('[data-category-active]').forEach(b=>b.onclick=()=>{if(commit(book=>setActivityCategoryActive(book,kind,b.dataset.categoryActive,b.dataset.active==='true'),'类别设置已收好，历史记录保留。'))activityCategoryManager(kind,draftName);});
  sheetContent.querySelectorAll('[data-category-rename]').forEach(b=>b.onclick=()=>{
    const c=categories.find(c=>c.id===b.dataset.categoryRename);
    showSheet('给标签换个名字','稳定编号保持不变，之前记录的内容和归属都会保留。',`<form id="rename-category-form"><label class="form-field">标签名称<input name="categoryName" required maxlength="40" value="${escape(c.name)}"></label><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary" id="category-back">返回标签列表</button><button type="submit" class="primary">保存名称</button></div></form>`);
    $('#category-back').onclick=()=>activityCategoryManager(kind,draftName);const f=$('#rename-category-form');f.onsubmit=e=>{e.preventDefault();try{if(commit(book=>upsertActivityCategory(book,kind,{id:c.id,name:f.elements.categoryName.value.trim()}),'标签名字换好啦 ♡'))activityCategoryManager(kind,draftName);}catch(error){formError(f,error.message);}};
  });
}

function ingredientEditor(id = null) {
  if (readOnlyGuard()) return;
  const original = state.inventory.find(i => i.id === id);
  const item = original || { id: uid(), name: '', quantity: 1, unit: '份', perMeal: 1, note: '', expires: '' };
  const linked = state.meals.some(m => m.resources.some(r => r.ingredientId === id));
  showSheet(original ? '整理这份食材' : '给小冰箱添一份', '当前库存填写实际剩余数量；补货时修改这里就好。', `<form id="ingredient-form"><label class="form-field">食材名字<input name="name" value="${escape(item.name)}" required maxlength="60" placeholder="例如：虾仁 / 鸡腿" autocomplete="off"></label><div class="form-row"><label class="form-field">当前库存<input name="quantity" type="number" required min="${original && item.quantity < 0 ? '-1000000000' : '0'}" max="1000000000" step="0.001" inputmode="decimal" value="${item.quantity}"></label><label class="form-field">单位<input name="unit" required maxlength="12" value="${escape(item.unit)}" placeholder="份 / 个 / 包 / 克" ${linked ? 'readonly' : ''}></label></div>${linked ? '<p class="field-hint">这份食材已关联餐食，单位保持不变，避免历史用量变乱。需要新单位请新建食材。</p>' : ''}<label class="form-field">食材分类<select name="category"><option value="">未分类（暂不参与组合）</option>${item.category && !CATEGORIES.includes(item.category) ? `<option selected>${escape(item.category)}</option>` : ''}${CATEGORIES.map(c => `<option ${item.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select><span class="field-hint">${original?'旧分类保留原文；确认后可以重新分类。':'分类会用于餐食续航，也可以之后再补。'}</span></label><details class="ingredient-more-settings"><summary><span class="more-closed">展开更多设置</span><span class="more-open">收起更多设置</span> <small>选填</small></summary><div class="ingredient-more-fields"><label class="form-field">每餐默认用量<input name="perMeal" type="number" required min="0.001" max="1000000000" step="0.001" inputmode="decimal" value="${item.perMeal}"><span class="field-hint">只作为新计划的默认值，不改变已安排餐食。</span></label><label class="form-field">保质期 <span class="muted">（可选）</span><input name="expires" type="date" value="${escape(item.expires)}"></label><label class="form-field">小备注 <span class="muted">（可选）</span><input name="note" maxlength="200" value="${escape(item.note)}" placeholder="冷冻 / 已腌制 / 尽快吃"></label></div></details><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button class="secondary" type="button" data-close>再想想</button><button class="primary" type="submit">收好这份食材 ♡</button></div>${original ? '<button type="button" class="text-button danger" id="delete-ingredient" style="display:block;margin:12px auto 0">删除这份食材</button>' : ''}</form>`);
  const form = $('#ingredient-form');
  const returnScroll = window.scrollY;
  const anchorId = original?.id;
  const anchorTop = anchorId ? document.querySelector(`[data-inventory-id="${CSS.escape(anchorId)}"]`)?.getBoundingClientRect().top : null;
  function returnToInventory() { closeSheet(); requestAnimationFrame(()=> { const row=anchorId?document.querySelector(`[data-inventory-id="${CSS.escape(anchorId)}"]`):null; if(row&&anchorTop!=null)window.scrollBy(0,row.getBoundingClientRect().top-anchorTop);else window.scrollTo(0,returnScroll); }); }
  form.onsubmit = e => {
    e.preventDefault();
    const next = { ...item, category: form.elements.category.value, id: item.id, name: form.elements.name.value.trim(), quantity: round(Number(form.elements.quantity.value)), unit: form.elements.unit.value.trim(), perMeal: round(Number(form.elements.perMeal.value)), expires: form.elements.expires.value, note: form.elements.note.value.trim() };
    if (!next.name || !next.unit || !Number.isFinite(next.quantity) || !Number.isFinite(next.perMeal) || next.perMeal <= 0) { formError(form, '请填好食材名字、数量和单位 ♡'); return; }
    if (next.expires && !parseDate(next.expires)) { formError(form, '保质期日期不太对，请重新选一下。'); return; }
    if (commit(s => { const index = s.inventory.findIndex(i => i.id === item.id); if (index < 0) s.inventory.push(next); else s.inventory[index] = next; }, '小冰箱整理好啦 ♡')) returnToInventory();
  };
  if (original) $('#delete-ingredient').onclick = async () => {
    if (linked) { formError(form, '这份食材关联了餐食记录，暂时保留它哦。吃完可把当前库存设为 0。'); return; }
    if (await ask('移出小冰箱', `删除「${item.name}」？`, '删除食材') && commit(s => { s.inventory = s.inventory.filter(i => i.id !== id); }, '这份食材已移出小冰箱。')) closeSheet();
  };
}
function jumpDate() {
  showSheet('翻到那一天', '无论过去还是未来，计划都留在真实的日期里。', `<form id="jump-form"><label class="form-field">想看哪一天<input class="jump-input" name="date" type="date" min="0001-01-01" max="9999-12-31" required value="${calendarView === 'timeline' ? timelineAnchorDate || selectedDate : selectedDate}"></label><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary" data-close>再想想</button><button type="submit" class="primary">翻到这一天 ♡</button></div></form>`);
  const form = $('#jump-form'); form.onsubmit = e => {
    e.preventDefault(); const key = form.elements.date.value;
    if (!parseDate(key)) { formError(form, '这个日期不太对，重新选一下吧。'); return; }
    selectedDate = key; calendarMonth=key.slice(0,7); timelineAnchorDate = key; render(); closeSheet();
  };
}
function download(content, filename) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function exportBackup(original = false) {
  if (original && savedRaw) { download(savedRaw, `机智定食-原文件-${today()}.json`); toast('原文件已交给浏览器，请确认保存位置。'); return; }
  if (locked) { toast('请先保存原文件，或导入有效备份。'); return; }
  download(JSON.stringify(state, null, 2), `机智定食-备份-${today()}.json`);
  backupTime = new Date().toLocaleString('zh-CN', { hour12: false });
  try { storage.setItem('jizhi-last-export', backupTime); } catch {}
  if (page === 'settings') render(); toast('备份已交给浏览器，请确认文件已保存 ♡');
}
$('#import-file').onchange = async e => {
  const file = e.target.files[0]; e.target.value = ''; if (!file) return;
  if (file.size > 10 * 1024 * 1024) { toast('这份备份大于 10 MB，请先核对文件。原数据未改变。'); return; }
  let result;
  try { result = normalize(JSON.parse(await file.text())); } catch (error) { toast(error instanceof SyntaxError ? 'JSON 文件没能读懂，请核对备份。原数据没有改变。' : error.message); return; }
  if (result.locked) { toast('备份含有异常记录，未导入也未改变原数据。请保留原文件并核对内容。'); return; }
  const dates = [...result.state.meals.map(m => m.date), ...result.state.diaries.map(d => d.date), ...result.state.dayRecords.map(d=>d.date)].sort();
  showSheet('把这本手账恢复回来？', '导入会完整替换餐食、库存、日记、学习运动打卡、模板、快捷类别和贴纸。', `<div class="import-summary">文件：${escape(file.name)}<br>${result.state.meals.length} 餐记录 · ${result.state.inventory.length} 种食材 · ${result.state.diaries.length} 篇日记<br>${result.state.dayRecords.length} 天生活打卡 / 贴纸${dates.length ? `<br>日期：${dates[0]} 至 ${dates.at(-1)}` : ''}${result.warnings.length ? `<br><strong class="danger">有 ${result.warnings.length} 项异常：</strong><br>${[...new Set(result.warnings)].map(escape).join('<br>')}` : ''}</div><p class="sheet-subtitle">建议先导出当前数据。恢复后的当前库存直接采用备份数值，不会再次扣减已吃记录。</p><p class="form-error" id="import-error" role="alert" hidden></p><div class="form-buttons"><button class="secondary" data-close>取消</button><button class="primary" id="restore-confirm">确认替换并恢复</button></div>`);
  $('#restore-confirm').onclick = () => {
    try {
      if (!storage) throw new Error('浏览器不允许本地保存，请先开启网站存储。');
      if (storage.getItem(STORAGE_KEY) !== savedRaw) { refreshFromStorage(); closeSheet(); toast('另一窗口刚更新了手账，请重新选择备份。'); return; }
      const saved = persist(storage, result.state, { replaceProtected: true }); state = saved; savedRaw = JSON.stringify(saved); locked = false; warnings = result.warnings; dayUI.clear();$('#main').replaceChildren();render(); closeSheet(); toast('手账恢复好啦 (๑•̀ㅂ•́)و✧' + (warnings.length ? ' 部分异常已提示，请保留原备份。' : ''));
    } catch { $('#import-error').textContent = '没能写入本地存储，请检查存储权限或剩余空间；原数据未改变。'; $('#import-error').hidden = false; }
  };
};
async function clearData() {
  if (!await ask('确定清空整本手账？', '全部餐食、未来计划、库存、日记、学习运动和贴纸都会被删除。升级前原始备份仍会留下。此操作不能撤销，请先导出备份。', '确认清空全部')) return;
  try {
    if (!storage) throw new Error();
    if (storage.getItem(STORAGE_KEY) !== savedRaw) { refreshFromStorage(); toast('另一窗口刚修改了手账，请检查后重试。'); return; }
    const next = persist(storage, freshState(), { replaceProtected: true }); state = next; savedRaw = JSON.stringify(next); locked = false; warnings = []; dayUI.clear();$('#main').replaceChildren();render(); toast('手账已清空，可以开始新的小计划。');
  } catch { toast('暂时没能清空，请检查浏览器存储权限。'); }
}
function navigate(nextPage) { if (page !== nextPage || nextPage === 'calendar') { if (nextPage === 'calendar') { calendarView = 'day'; selectedDate = today(); } page = nextPage; location.hash = nextPage; render(); window.scrollTo(0, 0); } }
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (PAGES.includes(next)) { if (next === 'calendar' && page !== 'calendar') { calendarView = 'day'; selectedDate = today(); } page = next; render(); } });
// Reading a paper only changes this session's fold state, never saved records.
document.addEventListener('toggle', event => {
  const details = event.target;
  if (details.matches?.('.meal-record[data-meal-fold]')) {
    if (details.open) mealExpandedIds.add(details.dataset.mealFold);
    else mealExpandedIds.delete(details.dataset.mealFold);
  }
  if (details.matches?.('.diary-disclosure[data-diary-date]')) {
    if (details.open) diaryExpandedDates.add(details.dataset.diaryDate);
    else diaryExpandedDates.delete(details.dataset.diaryDate);
  }
}, true);
document.addEventListener('change', e => {
  if(e.target.id==='calendar-month'){selectCalendarMonth(e.target.value);return;}
  if (e.target.id !== 'summary-month') return;
  const date = summaryMonthDate(e.target.value);
  if (!date) { toast('请选择有效月份，例如 2026 年 12 月。'); return; }
  summaryDate = date; summaryRange = 'month'; render();
});
document.addEventListener('click', async e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.page) return navigate(button.dataset.page);
  if(button.dataset.calendarView){
    const next=button.dataset.calendarView;if(!['day','month','timeline'].includes(next))return;
    if(next==='month')calendarMonth=selectedDate.slice(0,7);
    if(next==='timeline'&&calendarView==='month')timelineAnchorDate=selectedDate;
    calendarView=next;render();window.scrollTo(0,0);return;
  }
  if(button.dataset.monthDate){selectedDate=button.dataset.monthDate;render();return;}
  if(button.dataset.monthMode){calendarMode=button.dataset.monthMode;render();return;}
  if(button.dataset.monthStep){const next=shiftMonth(calendarMonth,Number(button.dataset.monthStep));if(next)selectCalendarMonth(next);return;}
  if(button.dataset.checkin){
    const kind=button.dataset.checkin;if(!Object.hasOwn(CHECKIN_NAMES,kind))return;
    commit(s=>toggleCheckin(s,selectedDate,kind),`${CHECKIN_NAMES[kind]}${getDayRecord(state,selectedDate)[kind].checked?'打卡已取消，详情仍保留。':'已记下 ♡'}`);return;
  }
  if(button.dataset.activityCategory){const kind=button.dataset.kind,id=button.dataset.activityCategory;if(Object.hasOwn(CHECKIN_NAMES,kind))commit(book=>toggleCategoryCheckin(book,selectedDate,kind,id),'今天的小积累收好啦 ♡');return;}
  if(button.dataset.manageActivityCategories){activityCategoryManager(button.dataset.manageActivityCategories);return;}
  if(button.dataset.dayStickerGroup){recordUI(selectedDate).stickerGroup=button.dataset.dayStickerGroup;render();return;}
  if(button.dataset.daySticker){
    const ids=getDayRecord(state,selectedDate).stickerIds,id=button.dataset.daySticker;
    if(!ids.includes(id)&&ids.length>=3){toast('这一页最多 3 枚，点已选贴纸可移除。');return;}
    commit(s=>setDayStickers(s,selectedDate,ids.includes(id)?ids.filter(v=>v!==id):[...ids,id]));return;
  }
  if(button.dataset.activityEdit){
    const kind=button.dataset.kind,item=getDayRecord(state,selectedDate)[kind]?.items.find(row=>row.id===button.dataset.activityEdit);if(!item)return;
    captureDayUI();Object.assign(recordUI(selectedDate)[kind],{editing:item.id,content:item.content,minutes:item.minutes??'',note:item.note,categoryId:item.categoryId||'',distanceKm:item.distanceKm??'',open:true,conflict:false});render({captureDrafts:false});return;
  }
  if(button.dataset.activityCancel){
    captureDayUI();Object.assign(recordUI(selectedDate)[button.dataset.activityCancel],{editing:null,content:'',minutes:'',note:'',categoryId:'',distanceKm:'',conflict:false});render({captureDrafts:false});return;
  }
  if(button.dataset.activityDelete){
    const kind=button.dataset.kind,date=selectedDate,id=button.dataset.activityDelete;
    if(!Object.hasOwn(CHECKIN_NAMES,kind)||readOnlyGuard())return;
    if(await ask('收起这项详细记录？','仅删除这项详情，当天打卡状态和其他记录会保留。','删除详情')){
      captureDayUI();const draft=recordUI(date)[kind],previous={...draft},originalItem=getDayRecord(state,date)[kind].items.find(item=>item.id===previous.editing);
      if(draft.editing===id){Object.assign(draft,{editing:null,content:'',minutes:'',note:'',categoryId:'',distanceKm:'',conflict:false});const form=document.querySelector(`.activity-form[data-kind="${kind}"]`);if(form)for(const name of ['content','minutes','note','categoryId','distanceKm'])if(form.elements[name])form.elements[name].value='';}
      if(!commit(s=>removeActivity(s,date,kind,id),'这项详情已收起。')){restoreActivityDraft(draft,previous,originalItem,date,kind);render({captureDrafts:false});}
    }return;
  }
  if (button.dataset.summaryRange) { summaryRange = button.dataset.summaryRange === 'month' ? 'month' : 'week'; summaryDate = today(); render(); return; }
  if (button.dataset.reviewDate) { openDay(button.dataset.reviewDate); return; }
  if (button.dataset.date) { selectedDate = button.dataset.date; render(); return; }
  if (button.dataset.add) return mealEditor(button.dataset.add);
  if (button.dataset.detail) return mealDetail(button.dataset.detail);
  if (button.dataset.editMeal) { const meal = state.meals.find(m => m.id === button.dataset.editMeal); if (meal) return mealEditor(meal.slot, meal.id); return; }
  if (button.dataset.runwayMode) { if(['comprehensive','main'].includes(button.dataset.runwayMode)&&preference('jizhi-runway-mode',button.dataset.runwayMode)){runwayMode=button.dataset.runwayMode;render();}return; }
  if (button.dataset.fridgeView) { if (preference('jizhi-fridge-view', button.dataset.fridgeView)) { fridgeView = button.dataset.fridgeView; render(); } return; }
  if (button.dataset.ingredient) return ingredientEditor(button.dataset.ingredient);
  if (button.dataset.complete) { button.disabled = true; await markComplete(button.dataset.complete); if (button.isConnected) button.disabled = false; return; }
  if (button.dataset.undo) { button.disabled = true; await undoMeal(button.dataset.undo); if (button.isConnected) button.disabled = false; return; }
  switch (button.dataset.action) {
    case 'manage-meal-templates': mealTemplateManager();break;
    case 'manage-study-categories': activityCategoryManager('study');break;
    case 'manage-exercise-categories': activityCategoryManager('exercise');break;
    case 'today': selectedDate = today(); calendarMonth=selectedDate.slice(0,7); render(); break;
    case 'open-selected-day': openDay(selectedDate);break;
    case 'timeline': calendarView = 'timeline'; render(); window.scrollTo(0, 0); break;
    case 'timeline-today': selectedDate = today(); timelineAnchorDate = selectedDate; render(); break;
    case 'summary-prev-month': case 'summary-next-month': {
      const next = shiftSummaryMonth(summaryDate, button.dataset.action === 'summary-prev-month' ? -1 : 1);
      if (next) { summaryDate = next; summaryRange = 'month'; render(); }
      break;
    }
    case 'prev': case 'next': { const next = addDays(selectedDate, button.dataset.action === 'prev' ? -7 : 7); if (next) {selectedDate=next;render();}else toast('已到日期边界啦。');break;}
    case 'jump': jumpDate(); break;
    case 'v13-backup': download(storage.getItem(V13_BACKUP_KEY), '机智定食-V1.3升级前备份.json'); break;
    case 'v15-backup': {const raw=storage.getItem(V15_BACKUP_KEY);if(raw)download(raw,'机智定食-V1.5升级前备份.json');break;}
    case 'v14-backup': {const raw=storage.getItem(V14_BACKUP_KEY);if(raw)download(raw,'机智定食-V1.4升级前备份.json');break;}
    case 'add-ingredient': ingredientEditor(); break;
    case 'add-snack': mealEditor('snack'); break;
    case 'edit-diary': diaryEditor(); break;
    case 'share-day': shareEditor(); break;
    case 'download-card': downloadCard(); break;
    case 'native-share-card': await nativeShareCard(button); break;
    case 'export': exportBackup(); break;
    case 'original': exportBackup(true); break;
    case 'migration-backup': { const raw = migrationBackup(); if (raw) download(raw, '机智定食-V1原始备份.json'); break; }
    case 'import': $('#import-file').click(); break;
    case 'clear': await clearData(); break;
    case 'install': if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); } break;
  }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (page === 'settings') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('手账装进手机啦 🍓'); if (page === 'settings') render(); });
render();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then(registration => {
    const waiting = () => { if (registration.waiting) { swUpdateReady = true; if (page === 'settings') render(); } };
    waiting();
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => { if (worker.state === 'installed') waiting(); });
    });
    return navigator.serviceWorker.ready;
  }).then(async () => {
    if (await caches.has(APP_CACHE)) {
      const cache = await caches.open(APP_CACHE);
      offlineReady = !!(await cache.match('./index.html')) && !!(await cache.match('./share-journal.js')) && !!(await cache.match('./month-calendar.js')) && !!(await cache.match('./assets/stickers/book.svg'));
    }
    if (page === 'settings') render();
  }).catch(() => { offlineReady = false; if (page === 'settings') render(); });
}

document.addEventListener('change', event => { if (event.target.id === 'runway-daily' && preference('jizhi-runway-daily', event.target.value)) { runwayDaily = Number(event.target.value); render(); } });

document.addEventListener('input',event=>{
  const form=event.target.closest('.activity-form');if(!form||!['content','minutes','note','categoryId','distanceKm'].includes(event.target.name))return;
  recordUI(form.dataset.date)[form.dataset.kind][event.target.name]=event.target.value;
});
document.addEventListener('toggle',event=>{
  if(!event.target.isConnected)return;const section=event.target.closest('.day-checkins');if(!section)return;
  const ui=recordUI(section.dataset.recordDate);
  if(event.target.matches('.activity-details'))ui[event.target.dataset.kind].open=event.target.open;
  if(event.target.matches('.day-sticker-picker'))ui.stickerOpen=event.target.open;
},true);
document.addEventListener('submit',event=>{
  const form=event.target.closest('.activity-form');if(!form)return;event.preventDefault();
  if(readOnlyGuard())return;
  const date=form.dataset.date,kind=form.dataset.kind,ui=recordUI(date)[kind];
  const content=form.elements.content.value.trim(),note=form.elements.note.value.trim(),value=form.elements.minutes.value.trim();
  const minutes=value===''?null:Number(value);
  const categoryId=form.elements.categoryId.value, distanceValue=kind==='exercise'?form.elements.distanceKm.value.trim():'',distanceKm=distanceValue===''?null:Number(distanceValue);
  if(kind==='exercise'&&distanceKm!==null&&(!Number.isFinite(distanceKm)||distanceKm<0||distanceKm>100000)){formError(form,'公里数请填 0–100000 的数字，也可以留空。');return;}
  if(minutes!==null&&(!Number.isInteger(minutes)||minutes<0||minutes>1440)){formError(form,'分钟请填 0–1440 的整数，也可以留空。');return;}
  if(!content&&!note&&minutes===null&&!categoryId&&distanceKm===null&&!ui.editing){formError(form,'详情可以不填，直接一键打卡就好。');return;}
  if(content.length>200||note.length>1000){formError(form,'内容最多 200 字，备注最多 1000 字。');return;}
  captureDayUI();const previous={...ui},originalItem=getDayRecord(state,date)[kind].items.find(item=>item.id===previous.editing),item={...(ui.editing?{id:ui.editing}:{}),content,minutes,note,categoryId,...(kind==='exercise'?{distanceKm}:{})};
  Object.assign(ui,{content:'',minutes:'',note:'',categoryId:'',distanceKm:'',editing:null,conflict:false});for(const key of ['content','minutes','note','categoryId','distanceKm'])if(form.elements[key])form.elements[key].value='';
  const checked=getDayRecord(state,date)[kind].checked;
  if(!commit(s=>putActivity(s,date,kind,item),checked?'详情已收好 ♡':'详情已保存，今天仍未打卡。')){restoreActivityDraft(ui,previous,originalItem,date,kind);render({captureDrafts:false});}
});
