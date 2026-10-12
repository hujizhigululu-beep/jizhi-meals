import { freshState, uid, round, dateKey, parseDate, addDays, weekDates, SLOTS, ALL_SLOTS, TYPES, forecast, reserved, putMeal, removeMeal, completeMeal, undoComplete, transferMeal, normalize, putDiary, removeDiary } from './model.js';
import { load, persist, STORAGE_KEY, MIGRATION_BACKUP_KEY } from './storage.js';
import { renderSummary, shiftSummaryMonth, summaryMonthDate } from './summary.js';
import { generateShareCard, shareImageFile } from './share-card.js';
import { mountTimeline } from './timeline.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => dateKey(new Date());
const labels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食 / 加餐' };
const mealArt = { breakfast: 'croissant', lunch: 'bento', dinner: 'stew', snack: 'strawberry' };
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
let timelineAnchorDate = null;
let timelineController = null;
let offlineReady = false;
let swUpdateReady = false;
const APP_CACHE = 'jizhi-meals-shell-v1.2-compact-1';
let cardAsset = null;
let cardPreviewUrl = null;
let shareGeneration = 0;
let installPrompt = null;
let backupTime = '';
try { backupTime = storage?.getItem('jizhi-last-export') || ''; } catch {}
let toastTimer;
const sheet = $('#sheet');
const sheetContent = $('#sheet-content');
function releaseCard() { if (cardPreviewUrl) URL.revokeObjectURL(cardPreviewUrl); cardPreviewUrl = null; cardAsset = null; }
sheet.addEventListener('close', () => { shareGeneration++; releaseCard(); });

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
  try { const result = load(storage); state = result.state; savedRaw = result.raw; locked = result.locked; warnings = result.warnings; render(); }
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

function render() {
  timelineController?.destroy(); timelineController = null;
  document.body.classList.toggle('timeline-mode', page === 'calendar' && calendarView === 'timeline');
  document.body.classList.toggle('day-mode', page === 'calendar' && calendarView === 'day');
  for (const name of ['inventory', 'summary', 'settings']) document.body.classList.toggle(`${name}-mode`, page === name);
  document.querySelectorAll('[data-page]').forEach(b => { b.classList.toggle('active', b.dataset.page === page); b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'); });
  const notice = $('#data-notice'); notice.hidden = !warnings.length;
  notice.innerHTML = warnings.length ? `${escape(locked ? '原数据暂时无法读取，已保护原文件，尚未覆盖。' : `发现 ${warnings.length} 项数据异常，正常记录仍可查看。`)}<button data-action="original">保存原文件</button><button data-page="settings">去恢复</button>` : '';
  $('#main').innerHTML = page === 'calendar' ? (calendarView === 'timeline' ? renderTimelinePage() : renderCalendar()) : page === 'inventory' ? renderInventory() : page === 'summary' ? renderSummary(state, summaryDate, summaryRange, today()) : renderSettings();
  if (page === 'calendar' && calendarView === 'timeline') {
    sizeTimeline();
    timelineController = mountTimeline($('#date-timeline'), state, {
      selectedDate, today: today(), anchorDate: timelineAnchorDate,
      onSelect: openDay,
      onAnchorChange: date => {
        timelineAnchorDate = date;
        const period = $('#timeline-period'), d = parseDate(date);
        if (period && d) period.textContent = `${d.getFullYear()}年 ${d.getMonth() + 1}月`;
      }
    });
  } else if (page === 'calendar') {
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
  return `<section class="page timeline-page"><div class="timeline-heading"><h1>日期时间轴</h1><span id="timeline-period">${d.getFullYear()}年 ${d.getMonth() + 1}月</span></div><p class="timeline-intro">把甜甜的日子串起来 (˶ᵔ ᵕ ᵔ˶)</p><div class="timeline-toolbar"><button class="pill" data-action="timeline-today">♡ 回到今天</button><button class="pill" data-action="jump">跳到某一天 ↗</button><span>上下滑 · 点日期翻开</span></div><div id="date-timeline" class="timeline-scroll" role="region" aria-label="上下滑动查看每日餐食和日记预览"></div></section>`;
}
function openDay(date) {
  selectedDate = date; calendarView = 'day'; page = 'calendar';
  if (location.hash !== '#calendar') location.hash = 'calendar';
  render(); window.scrollTo(0, 0);
}
function renderCalendar() {
  const dates = weekDates(selectedDate).filter(Boolean); const d = parseDate(selectedDate);
  const first = parseDate(dates[0]); const last = parseDate(dates.at(-1));
  const span = `${first.getMonth() + 1}.${first.getDate()} — ${last.getMonth() + 1}.${last.getDate()}`;
  const weekMeals = state.meals.filter(m => dates.includes(m.date));
  return `<section class="page calendar-page">
    <div class="calendar-topline"><button class="pill" data-action="timeline">↶ 时间轴</button><span class="calendar-month">${d.getFullYear()}年 ${d.getMonth() + 1}月</span><button class="pill pink" data-action="today">回到今天</button></div>
    <div class="week-toolbar"><div class="week-pager"><button class="icon-button" data-action="prev" aria-label="上一周">‹</button><span class="week-label">${span}${first.getFullYear() !== last.getFullYear() ? ' · 跨年' : ''}</span><button class="icon-button" data-action="next" aria-label="下一周">›</button></div><button class="pill jump-button" data-action="jump">跳转日期 <span aria-hidden="true">⌁</span></button></div>
    <div class="date-strip" role="group" aria-label="本周七天">${dates.map((key, index) => { const day = parseDate(key); return `<button class="date-tab ${index > 4 ? 'weekend' : ''} ${key === today() ? 'today' : ''} ${key === selectedDate ? 'active' : ''}" data-date="${key}" aria-pressed="${key === selectedDate}" aria-label="${dateLabel(key, true)}${key === today() ? '，今天' : ''}">${key === today() ? '<span class="today-heart" aria-hidden="true">♥</span>' : ''}<span class="weekday">${weekdays[day.getDay()]}</span><span class="date-number">${day.getDate()}</span>${(state.meals.some(m => m.date === key) || state.diaries.some(d => d.date === key)) ? '<span class="date-dot" aria-hidden="true"></span>' : ''}</button>`; }).join('')}</div>
    <div class="day-heading"><h1>${dateLabel(selectedDate)}</h1><span class="tiny-heart">${selectedDate === today() ? '♡ 就是今天' : '♡ 我的小计划'}</span></div>
    <div class="day-tools"><span class="day-record-label">✎ 今日记录</span><button class="pill" data-action="share-day">🍓 分享卡片</button></div>
    <div class="meals">${SLOTS.map(slot => mealCard(slot)).join('')}</div>
    ${renderSnacks()}
    ${renderDiary()}
    <p class="footer-note">一口一口，好好生活 ♡ · 本周 ${weekMeals.length} 条小纸条</p>
  </section>`;
}
function mealCard(slot, snack = null) {
  const meal = slot === 'snack' ? snack : state.meals.find(m => m.date === selectedDate && m.slot === slot);
  const content = meal ? `<button class="meal-details" data-detail="${escape(meal.id)}" aria-label="查看${escape(meal.name)}详情"><div class="meal-name-line"><span class="meal-name">${escape(meal.name)}</span>${meal.completed ? '<span class="done-stamp">已吃</span>' : ''}</div>${meal.resources.length ? `<span class="meal-resource-list">${meal.resources.map(r => `<span class="meal-resource-chip">${escape(r.name)} ${r.amount}${escape(r.unit)}</span>`).join('')}</span>` : meal.protein ? `<span class="protein-line">${escape(meal.protein)}</span>` : ''}${meal.note ? `<span class="meal-note">${escape(meal.note)}</span>` : `<span class="meal-caption">${times[slot]}</span>`}</button>` : `<span class="empty-label">今天想吃什么捏？(｡•ᴗ•｡)</span>`;
  const controls = meal ? `<button class="meal-edit" data-edit-meal="${escape(meal.id)}" aria-label="查看或编辑${escape(meal.name)}">编辑</button>${meal.completed ? `<button class="meal-undo" data-undo="${escape(meal.id)}" aria-label="撤销${escape(meal.name)}已吃并返还库存">撤销</button>` : `<button class="meal-complete" data-complete="${escape(meal.id)}" aria-label="标记${escape(meal.name)}已吃">吃过</button>`}` : `<button class="meal-add" data-add="${slot}" aria-label="添加${labels[slot]}">＋</button>`;
  return `<article class="meal-card ${slot} ${slot === 'snack' ? 'snack-card' : ''} ${meal ? 'has-meal' : 'is-empty'} ${meal?.completed ? 'done' : ''}"><div class="meal-category"><span class="slot-icon" aria-hidden="true">${illustration(mealArt[slot])}</span><strong>${labels[slot]}</strong>${meal?.time ? `<small class="meal-time">${escape(meal.time)}</small>` : ''}</div><div class="meal-content">${content}</div><div class="meal-card-controls">${controls}</div></article>`;
}
function renderSnacks() {
  const snacks = state.meals.filter(m => m.date === selectedDate && m.slot === 'snack').sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
  return `<section class="snack-section" aria-label="零食和加餐"><div class="snack-heading"><h2>零食 / 加餐 🍓</h2><button class="pill" data-action="add-snack">＋ 添一张小纸条</button></div>${snacks.map(m => mealCard('snack', m)).join('')}${snacks.length ? '' : '<p class="muted">水果、下午茶，小甜点也有自己的小纸条 (｡•ᴗ•｡)</p>'}</section>`;
}
function renderDiary() {
  const diary = state.diaries.find(d => d.date === selectedDate);
  return `<section class="diary-card" aria-label="今日日记"><div class="diary-heading"><h2>今天的小故事 (˶ᵔ ᵕ ᵔ˶)</h2><button class="text-button" data-action="edit-diary">${diary ? '编辑小纸条' : '写点什么'}</button></div>${diary?.mood ? `<p class="diary-mood">${escape(diary.mood)}</p>` : ''}${diary?.text ? `<p class="diary-text">${escape(diary.text)}</p>` : ''}${diary?.joy ? `<p class="diary-joy">今日小确幸 ♡<br>${escape(diary.joy)}</p>` : ''}${diary ? '' : '<p class="muted">心情、小确幸，慢慢写就好 (｡•ᴗ•｡)</p>'}</section>`;
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
  releaseCard(); shareGeneration++;
  const date = selectedDate;
  const choices = [['breakfast', '早餐', true], ['lunch', '午餐', true], ['dinner', '晚餐', true], ['snacks', '零食 / 加餐', true], ['mood', '今日心情', false], ['diary', '日记摘录', false], ['joy', '今日小确幸', false]];
  showSheet('做一张甜甜的分享卡片 🍓', dateLabel(date, true), `<form id="share-form"><p class="share-note">只在你的设备上生成 PNG。默认隐藏心情、日记、小确幸和餐食备注；勾选私人内容前记得核对哦。</p><div class="share-options"><fieldset><legend>卡片上想放些什么</legend>${choices.map(([key, text, checked]) => `<label><input type="checkbox" name="${key}" ${checked ? 'checked' : ''}>${text}${key === 'diary' ? '（最多 320 个字素，长日记显示摘录）' : ''}</label>`).join('')}</fieldset></div><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary" data-close>再想想</button><button type="submit" class="primary">生成 PNG 卡片</button></div></form>`);
  const form = $('#share-form');
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true; button.textContent = '小纸条制作中…';
    const request = ++shareGeneration;
    try {
      const options = Object.fromEntries(choices.map(([key]) => [key, form.elements[key].checked]));
      const image = await generateShareCard(structuredClone(state), date, options);
      if (request !== shareGeneration || !form.isConnected || !sheet.open) return;
      cardAsset = image; cardPreviewUrl = URL.createObjectURL(image.blob);
      showSheet('小纸条做好啦 ♡', `${dateLabel(date, true)} · PNG ${image.width} × ${image.height}`, `<div class="share-preview"><img src="${cardPreviewUrl}" alt="${escape(dateLabel(date, true))} 的分享卡片预览"></div><div class="share-actions"><button class="pill pink" id="native-share-card" data-action="native-share-card">分享 / 保存图片</button><button class="pill" id="download-card" data-action="download-card">下载 PNG</button></div><p class="share-note" id="share-result" role="status">在 iPhone 上点「分享 / 保存图片」，可从系统菜单选择存储图像或存储到文件。也可以长按上方预览图片保存；请先检查卡片中的私人内容。</p><button class="text-button" data-action="share-day">重新选择内容</button>`);
    } catch (error) { if (form.isConnected) formError(form, error.message || '图片没能生成，请稍后再试。'); }
    finally { if (button.isConnected) { button.disabled = false; button.textContent = '生成 PNG 卡片'; } }
  };
}
function downloadCard() {
  if (!cardAsset || !cardPreviewUrl) return;
  const a = document.createElement('a'); a.href = cardPreviewUrl; a.download = cardAsset.filename; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove();
  $('#share-result').textContent = 'PNG 已交给浏览器，请确认保存到「文件」。想存到相册可用系统分享，或长按预览图片。';
}
async function nativeShareCard(button) {
  if (!cardAsset) return;
  button.disabled = true;
  try {
    // Use a fresh gesture after generation; do not await rendering before navigator.share.
    const result = await shareImageFile(cardAsset.blob, cardAsset.filename);
    const status = $('#share-result'); if (!status) return;
    if (result === 'shared') status.textContent = '卡片已交给系统分享，请确认保存位置 ♡';
    else if (result === 'unsupported') status.textContent = '这个浏览器暂不支持图片文件分享。请点「下载 PNG」，或长按预览图片保存。';
    else status.textContent = '分享已取消，图片还在这里，想保存时再点就好。';
  } catch (error) { const status = $('#share-result'); if (status) status.textContent = `系统分享没有完成：${error.message || '请重试或使用下载 PNG。'}`; }
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
function renderInventory() {
  return `<section class="page"><div class="section-heading"><div><div class="eyebrow">A LITTLE FRIDGE OF HAPPINESS</div><h1>我的食材小冰箱</h1><p class="subheading">${state.inventory.length ? `收好 ${state.inventory.length} 种食材，慢慢安排` : '把喜欢的食材，一份份收好'}</p></div><button class="pill pink" data-action="add-ingredient">＋ 添加</button></div><div class="info-card soft"><strong>当前库存</strong>是实际剩余；<strong>预计剩余</strong>会减去所有日期尚未吃的计划，包括过去和未来。安排餐食不会真正扣库存哦。</div>${state.inventory.length ? `<div class="inventory-list">${state.inventory.map(item => { const predicted = forecast(state, item.id); const planned = reserved(state, item.id); return `<article class="ingredient-card"><div class="ingredient-header"><h2 class="ingredient-name">${escape(item.name)}</h2><span class="ingredient-emoji" aria-hidden="true">${illustration(ingredientArt(item.name))}</span></div><div class="stock-numbers"><div><small>当前库存</small><strong>${item.quantity}</strong><span class="unit">${escape(item.unit)}</span></div><div><small>预计剩余</small><strong class="forecast ${predicted < 0 ? 'low' : ''}">${predicted}</strong><span class="unit">${escape(item.unit)}</span></div></div><div class="ingredient-meta">每餐 ${item.perMeal} ${escape(item.unit)} · 已计划 ${planned} ${escape(item.unit)}${item.note ? `<br>${escape(item.note)}` : ''}${item.expires ? `<br>${item.expires < today() ? '保质期已过，请核对' : '保质期'} · ${escape(item.expires)}` : ''}</div><div class="inventory-actions"><span class="warning-label">${predicted < 0 ? '♡ 计划用量超出库存' : '♡ 慢慢吃，不着急'}</span><button class="text-button" data-ingredient="${escape(item.id)}">编辑 ↗</button></div></article>`; }).join('')}</div>` : `<div class="empty-state"><span class="illustration" aria-hidden="true">${illustration('basket')}</span><h2>小冰箱还空着呢 (｡•ᴗ•｡)</h2><p>虾仁、鸡腿、牛肉饼……<br>先收好食材，再安排喜欢的一餐。</p><button class="pill pink" data-action="add-ingredient">＋ 添加第一份食材</button></div>`}<p class="footer-note">预计不足也可以安排，补货后修改当前库存就好。</p></section>`;
}
function renderSettings() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return `<section class="page"><div class="section-heading"><div><div class="eyebrow">MY PRIVATE LITTLE SPACE</div><h1>我的手账小角落</h1><p class="subheading">不需要登录，计划只留在你的设备里 ♡</p></div></div>
    <div class="settings-card"><h3>📦 给手账留一份备份</h3><p>餐食和库存默认保存在此浏览器本地，历史和未来记录都不会每周清空。<strong>清理网站数据、卸载浏览器或设备故障可能导致数据丢失，本地保存不能当作永久可靠备份。</strong>请定期导出 JSON 到文件或自己的网盘。</p><div class="settings-actions"><button class="pill pink" data-action="export">导出 JSON 备份</button><button class="pill" data-action="import">导入 / 恢复</button></div><div class="backup-status">${backupTime ? `最近发起导出：${escape(backupTime)}（请确认文件已保存）` : '还没有导出过备份，记得偶尔存一份哦。'}<br>导入会替换整本手账，确认前会显示内容摘要。</div></div>
    <div class="settings-card"><h3>🍓 装进手机，随时打开</h3><p id="offline-status">${offlineReady ? '✓ 离线资源已缓存；此浏览器断网后也能打开手账。' : '离线缓存尚未就绪，请联网打开 HTTPS 地址，等待缓存成功。'}</p>${swUpdateReady ? '<p>新版本已准备好。请先导出备份，再关闭此网站的所有窗口和主屏幕应用后重新打开。</p>' : ''}<ul><li>安卓：用 Chrome 打开，选择菜单中的「安装应用」或「添加到主屏幕」。</li><li>iPhone：用 Safari 打开，点分享 →「添加到主屏幕」。</li><li>第一次打开需要网络；缓存成功后排餐、库存、备份均可离线操作。</li></ul>${installPrompt ? '<button class="pill pink" data-action="install">安装到主屏幕</button>' : `<p>${ios ? 'iPhone 请通过 Safari 分享菜单安装。' : '若没有安装按钮，可从浏览器菜单添加到主屏幕。'}</p>`}<p style="margin-top:10px">不同设备、浏览器和网站地址不会自动同步。切换前请导出，在新位置导入。iPhone 安装后也请核对记录，必要时重新导入。</p></div>
    <div class="settings-card"><h3>♡ 手账的小约定</h3><p>日期按设备当地时间显示。一周从周一开始，跨月、跨年都按真实日期保存。未吃计划可以编辑、删除、复制、移动；已吃记录修改会重新计算用量，删除或撤销会返还全部食材。每餐可以关联多种库存食材，同一种食材只记一次。</p><p style="margin-top:10px">每次数量最多三位小数。食材数量表示份、个、包或克，不计算营养或热量；发现实际用量不同，请在标记已吃前修改。</p></div>
    <div class="settings-card"><h3>本地数据管理</h3><p>当前保存 ${state.meals.length} 餐记录、${state.inventory.length} 种食材、${state.diaries.length} 篇日记。${locked ? '原文件已保护，请先保存原文件再恢复。' : '所有操作保存成功后才更新界面。'}</p><div class="settings-actions">${savedRaw ? '<button class="pill" data-action="original">保存当前原文件</button>' : ''}${migrationBackup() ? '<button class="pill" data-action="migration-backup">保存 V1 原始备份</button>' : ''}<button class="pill danger" data-action="clear">清空手账</button></div></div><div class="credits">食物插画：<a href="https://openmoji.org/" target="_blank" rel="noopener">OpenMoji</a> · <a href="./assets/credits.html" target="_blank" rel="noopener">作者、来源与 CC BY-SA 4.0 授权</a><br>食物插画保留 OpenMoji 官方原图；牛奶纸盒、装订、胶带与导航线稿为本项目原创。</div><p class="footer-note">机智定食 V1.2 · 私人生活手账<br>今天也要，好好吃饭 ♡</p></section>`;
}

function mealEditor(slot, id = null) {
  if (readOnlyGuard()) return;
  const existing = state.meals.find(m => m.id === id);
  const meal = existing || { id: uid(), date: selectedDate, slot, name: '', type: slot === 'snack' ? '零食 / 加餐' : '自制便当', protein: '', note: '', resources: [], ...(slot === 'snack' ? { time: '' } : {}) };
  let rows = structuredClone(meal.resources || []);
  showSheet(existing ? '整理这张餐食小纸条' : '今天又有好吃的啦 🍓', `${dateLabel(meal.date, true)} · ${labels[meal.slot]} ♡`, `<form id="meal-form"><label class="form-field">菜名<input name="name" required maxlength="80" placeholder="例如：牛肉丸便当" value="${escape(meal.name)}" autocomplete="off"></label>${slot === 'snack' ? `<label class="form-field">时间 <span class="muted">（可选）</span><input name="time" type="time" value="${escape(meal.time || '')}"></label>` : ''}<label class="form-field">这餐的类型<select name="type">${TYPES.map(t => `<option ${meal.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><fieldset class="resource-controls"><legend>这餐用到的库存食材 <span class="muted">（可选）</span></legend><p class="field-hint">每份食材独立填写用量；安排时预留，吃过才扣库存。配菜也可以直接写在备注里。</p><div class="resource-list" id="resource-list"></div><button type="button" class="pill" id="add-resource" data-action="add-resource" ${state.inventory.length ? '' : 'disabled'}>＋ 添一种食材</button>${state.inventory.length ? '' : '<p class="resource-empty">小冰箱还空着，可以先保存菜名，再去库存添食材。</p>'}</fieldset><label class="form-field">蛋白质来源 <span class="muted">（可选，不扣库存）</span><input name="protein" maxlength="60" value="${escape(meal.protein)}" placeholder="例如：鸡蛋 / 牛肉"></label><label class="form-field">一点小备注 <span class="muted">（可选）</span><textarea name="note" maxlength="200" placeholder="例如：配菜、解冻提醒">${escape(meal.note)}</textarea></label>${existing?.completed ? '<p class="info-card soft">这餐已吃过。调整食材时会先返还原用量，再扣减新用量，仍保留已吃记录。</p>' : ''}<p class="form-error" role="alert" hidden></p><div class="form-buttons"><button class="secondary" type="button" data-close>再想想</button><button class="primary" type="submit">收进手账 ♡</button></div></form>`);
  const form = $('#meal-form');
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
      const remaining = item ? round(forecast(state, item.id, id) + prior - (Number.isFinite(rows[index].amount) ? rows[index].amount : 0)) : null;
      row.querySelector('.resource-hint').textContent = item ? `保存后预计剩余 ${remaining} ${item.unit}${remaining < 0 ? ' · 小冰箱快见底啦，记得补货捏 ♡' : ''}` : '不关联这一项库存';
    });
    $('#add-resource').disabled = !state.inventory.some(i => !used.includes(i.id));
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
  renderRows();
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

function ingredientEditor(id = null) {
  if (readOnlyGuard()) return;
  const original = state.inventory.find(i => i.id === id);
  const item = original || { id: uid(), name: '', quantity: 1, unit: '份', perMeal: 1, note: '', expires: '' };
  const linked = state.meals.some(m => m.resources.some(r => r.ingredientId === id));
  showSheet(original ? '整理这份食材' : '给小冰箱添一份', '当前库存填写实际剩余数量；补货时修改这里就好。', `<form id="ingredient-form"><label class="form-field">食材名字<input name="name" value="${escape(item.name)}" required maxlength="60" placeholder="例如：虾仁 / 鸡腿" autocomplete="off"></label><div class="form-row"><label class="form-field">当前库存<input name="quantity" type="number" required min="${original && item.quantity < 0 ? '-1000000000' : '0'}" max="1000000000" step="0.001" inputmode="decimal" value="${item.quantity}"></label><label class="form-field">单位<input name="unit" required maxlength="12" value="${escape(item.unit)}" placeholder="份 / 个 / 包 / 克" ${linked ? 'readonly' : ''}></label></div>${linked ? '<p class="field-hint">这份食材已关联餐食，单位保持不变，避免历史用量变乱。需要新单位请新建食材。</p>' : ''}<label class="form-field">每餐默认用量<input name="perMeal" type="number" required min="0.001" max="1000000000" step="0.001" inputmode="decimal" value="${item.perMeal}"><span class="field-hint">只作为新计划的默认值，不改变已安排餐食。</span></label><label class="form-field">保质期 <span class="muted">（可选）</span><input name="expires" type="date" value="${escape(item.expires)}"></label><label class="form-field">小备注 <span class="muted">（可选）</span><input name="note" maxlength="200" value="${escape(item.note)}" placeholder="冷冻 / 已腌制 / 尽快吃"></label><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button class="secondary" type="button" data-close>再想想</button><button class="primary" type="submit">收好这份食材 ♡</button></div>${original ? '<button type="button" class="text-button danger" id="delete-ingredient" style="display:block;margin:12px auto 0">删除这份食材</button>' : ''}</form>`);
  const form = $('#ingredient-form');
  form.onsubmit = e => {
    e.preventDefault();
    const next = { id: item.id, name: form.elements.name.value.trim(), quantity: round(Number(form.elements.quantity.value)), unit: form.elements.unit.value.trim(), perMeal: round(Number(form.elements.perMeal.value)), expires: form.elements.expires.value, note: form.elements.note.value.trim() };
    if (!next.name || !next.unit || !Number.isFinite(next.quantity) || !Number.isFinite(next.perMeal) || next.perMeal <= 0) { formError(form, '请填好食材名字、数量和单位 ♡'); return; }
    if (next.expires && !parseDate(next.expires)) { formError(form, '保质期日期不太对，请重新选一下。'); return; }
    if (commit(s => { const index = s.inventory.findIndex(i => i.id === item.id); if (index < 0) s.inventory.push(next); else s.inventory[index] = next; }, '小冰箱整理好啦 ♡')) closeSheet();
  };
  if (original) $('#delete-ingredient').onclick = async () => {
    if (linked) { formError(form, '这份食材关联了餐食记录，暂时保留它哦。吃完可把当前库存设为 0。'); return; }
    if (await ask('移出小冰箱', `删除「${item.name}」？`, '删除食材') && commit(s => { s.inventory = s.inventory.filter(i => i.id !== id); }, '这份食材已移出小冰箱。')) closeSheet();
  };
}
function jumpDate() {
  showSheet('翻到那一天', '无论过去还是未来，计划都留在真实的日期里。', `<form id="jump-form"><label class="form-field">想看哪一天<input class="jump-input" name="date" type="date" required value="${calendarView === 'timeline' ? timelineAnchorDate || selectedDate : selectedDate}"></label><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary" data-close>再想想</button><button type="submit" class="primary">翻到这一天 ♡</button></div></form>`);
  const form = $('#jump-form'); form.onsubmit = e => {
    e.preventDefault(); const key = form.elements.date.value;
    if (!parseDate(key)) { formError(form, '这个日期不太对，重新选一下吧。'); return; }
    try { const dates = weekDates(key); if (dates.some(d => !d)) throw new Error(); } catch { formError(form, '请选择公元 0001 至 9999 年内完整的一周。'); return; }
    selectedDate = key; timelineAnchorDate = key; render(); closeSheet();
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
  const dates = [...result.state.meals.map(m => m.date), ...result.state.diaries.map(d => d.date)].sort();
  showSheet('把这本手账恢复回来？', '导入会完整替换当前餐食与库存，包含所有历史和未来餐食、零食、日记。', `<div class="import-summary">文件：${escape(file.name)}<br>${result.state.meals.length} 餐记录 · ${result.state.inventory.length} 种食材 · ${result.state.diaries.length} 篇日记${dates.length ? `<br>日期：${dates[0]} 至 ${dates.at(-1)}` : ''}${result.warnings.length ? `<br><strong class="danger">有 ${result.warnings.length} 项异常：</strong><br>${[...new Set(result.warnings)].map(escape).join('<br>')}` : ''}</div><p class="sheet-subtitle">建议先导出当前数据。恢复后的当前库存直接采用备份数值，不会再次扣减已吃记录。</p><p class="form-error" id="import-error" role="alert" hidden></p><div class="form-buttons"><button class="secondary" data-close>取消</button><button class="primary" id="restore-confirm">确认替换并恢复</button></div>`);
  $('#restore-confirm').onclick = () => {
    try {
      if (!storage) throw new Error('浏览器不允许本地保存，请先开启网站存储。');
      if (storage.getItem(STORAGE_KEY) !== savedRaw) { refreshFromStorage(); closeSheet(); toast('另一窗口刚更新了手账，请重新选择备份。'); return; }
      const saved = persist(storage, result.state, { replaceProtected: true }); state = saved; savedRaw = JSON.stringify(saved); locked = false; warnings = result.warnings; render(); closeSheet(); toast('手账恢复好啦 (๑•̀ㅂ•́)و✧' + (warnings.length ? ' 部分异常已提示，请保留原备份。' : ''));
    } catch { $('#import-error').textContent = '没能写入本地存储，请检查存储权限或剩余空间；原数据未改变。'; $('#import-error').hidden = false; }
  };
};
async function clearData() {
  if (!await ask('确定清空整本手账？', '全部餐食、零食、未来计划、库存、心情和日记都会被删除。升级前自动保留的 V1 原始备份仍会留下。此操作不能撤销，请先导出备份。', '确认清空全部')) return;
  try {
    if (!storage) throw new Error();
    if (storage.getItem(STORAGE_KEY) !== savedRaw) { refreshFromStorage(); toast('另一窗口刚修改了手账，请检查后重试。'); return; }
    const next = persist(storage, freshState(), { replaceProtected: true }); state = next; savedRaw = JSON.stringify(next); locked = false; warnings = []; render(); toast('手账已清空，可以开始新的小计划。');
  } catch { toast('暂时没能清空，请检查浏览器存储权限。'); }
}
function navigate(nextPage) { if (page !== nextPage || nextPage === 'calendar') { if (nextPage === 'calendar') { calendarView = 'day'; selectedDate = today(); } page = nextPage; location.hash = nextPage; render(); window.scrollTo(0, 0); } }
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (PAGES.includes(next)) { if (next === 'calendar' && page !== 'calendar') { calendarView = 'day'; selectedDate = today(); } page = next; render(); } });
document.addEventListener('change', e => {
  if (e.target.id !== 'summary-month') return;
  const date = summaryMonthDate(e.target.value);
  if (!date) { toast('请选择有效月份，例如 2026 年 12 月。'); return; }
  summaryDate = date; summaryRange = 'month'; render();
});
document.addEventListener('click', async e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.page) return navigate(button.dataset.page);
  if (button.dataset.summaryRange) { summaryRange = button.dataset.summaryRange === 'month' ? 'month' : 'week'; summaryDate = today(); render(); return; }
  if (button.dataset.reviewDate) { openDay(button.dataset.reviewDate); return; }
  if (button.dataset.date) { selectedDate = button.dataset.date; render(); return; }
  if (button.dataset.add) return mealEditor(button.dataset.add);
  if (button.dataset.detail) return mealDetail(button.dataset.detail);
  if (button.dataset.editMeal) { const meal = state.meals.find(m => m.id === button.dataset.editMeal); if (meal) return mealEditor(meal.slot, meal.id); return; }
  if (button.dataset.ingredient) return ingredientEditor(button.dataset.ingredient);
  if (button.dataset.complete) { button.disabled = true; await markComplete(button.dataset.complete); if (button.isConnected) button.disabled = false; return; }
  if (button.dataset.undo) { button.disabled = true; await undoMeal(button.dataset.undo); if (button.isConnected) button.disabled = false; return; }
  switch (button.dataset.action) {
    case 'today': selectedDate = today(); render(); break;
    case 'timeline': calendarView = 'timeline'; render(); window.scrollTo(0, 0); break;
    case 'timeline-today': selectedDate = today(); timelineAnchorDate = selectedDate; render(); break;
    case 'summary-prev-month': case 'summary-next-month': {
      const next = shiftSummaryMonth(summaryDate, button.dataset.action === 'summary-prev-month' ? -1 : 1);
      if (next) { summaryDate = next; summaryRange = 'month'; render(); }
      break;
    }
    case 'prev': case 'next': { const next = addDays(selectedDate, button.dataset.action === 'prev' ? -7 : 7); if (next) { try { if (weekDates(next).some(d => !d)) throw new Error(); selectedDate = next; render(); } catch { toast('已到日期边界啦。'); } } else toast('已到日期边界啦。'); break; }
    case 'jump': jumpDate(); break;
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
      offlineReady = !!(await cache.match('./index.html')) && !!(await cache.match('./share-card.js'));
    }
    if (page === 'settings') render();
  }).catch(() => { offlineReady = false; if (page === 'settings') render(); });
}
