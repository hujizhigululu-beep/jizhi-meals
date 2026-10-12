import { freshState, uid, round, dateKey, parseDate, addDays, weekDates, SLOTS, TYPES, forecast, reserved, putMeal, removeMeal, completeMeal, undoComplete, transferMeal, normalize } from './model.js';
import { load, persist, STORAGE_KEY } from './storage.js';

const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => dateKey(new Date());
const labels = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐' };
const mealArt = { breakfast: 'croissant', lunch: 'bento', dinner: 'stew' };
const slotEnglish = { breakfast: '01 · BREAKFAST', lunch: '02 · LUNCH', dinner: '03 · DINNER' };
const illustration = (name, className = '') => `<img src="./assets/food/${name}.svg" alt="" aria-hidden="true" class="${className}" width="48" height="48">`;
const times = { breakfast: '开启甜甜的一天', lunch: '好好吃饭，好好生活', dinner: '给今天一个温柔收尾' };
const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
let storage;
let loaded;
try { storage = window.localStorage; loaded = load(storage); }
catch { loaded = { state: freshState(), locked: true, raw: null, warnings: ['浏览器暂时不允许本地保存，请开启网站存储后重新打开。'] }; }
let state = loaded.state;
let locked = loaded.locked;
let savedRaw = loaded.raw;
let warnings = loaded.warnings;
let page = ['calendar', 'inventory', 'settings'].includes(location.hash.slice(1)) ? location.hash.slice(1) : 'calendar';
let selectedDate = today();
let offlineReady = false;
let installPrompt = null;
let backupTime = '';
try { backupTime = storage?.getItem('jizhi-last-export') || ''; } catch {}
let toastTimer;
const sheet = $('#sheet');
const sheetContent = $('#sheet-content');

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
  document.querySelectorAll('[data-page]').forEach(b => { b.classList.toggle('active', b.dataset.page === page); b.setAttribute('aria-current', b.dataset.page === page ? 'page' : 'false'); });
  const notice = $('#data-notice'); notice.hidden = !warnings.length;
  notice.innerHTML = warnings.length ? `${escape(locked ? '原数据暂时无法读取，已保护原文件，尚未覆盖。' : `发现 ${warnings.length} 项数据异常，正常记录仍可查看。`)}<button data-action="original">保存原文件</button><button data-page="settings">去恢复</button>` : '';
  $('#main').innerHTML = page === 'calendar' ? renderCalendar() : page === 'inventory' ? renderInventory() : renderSettings();
  if (page === 'calendar') {
    const strip = $('.date-strip'), active = $('.date-tab.active');
    if (active && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, active.offsetLeft - strip.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2);
  }
}
function renderCalendar() {
  const dates = weekDates(selectedDate); const d = parseDate(selectedDate);
  const first = parseDate(dates[0]); const last = parseDate(dates[6]);
  const span = `${first.getMonth() + 1}.${first.getDate()} — ${last.getMonth() + 1}.${last.getDate()}`;
  const weekMeals = state.meals.filter(m => dates.includes(m.date));
  return `<section class="page">
    <div class="section-heading"><div><div class="eyebrow">THE MENU OF MY DAYS</div><div class="month-title"><h1><span class="month-number">${String(d.getMonth() + 1).padStart(2, '0')}</span><span class="chapter-label"> 月 · 餐食手账</span></h1><span class="year">${d.getFullYear()}</span></div></div><button class="pill pink" data-action="today">回到本周</button></div>
    <div class="week-toolbar"><div class="week-pager"><button class="icon-button" data-action="prev" aria-label="上一周">‹</button><span class="week-label">${span}${first.getFullYear() !== last.getFullYear() ? ' · 跨年' : ''}</span><button class="icon-button" data-action="next" aria-label="下一周">›</button></div><button class="pill jump-button" data-action="jump">跳转日期 <span aria-hidden="true">⌁</span></button></div>
    <div class="date-strip" role="group" aria-label="本周七天">${dates.map((key, index) => { const day = parseDate(key); return `<button class="date-tab ${index > 4 ? 'weekend' : ''} ${key === today() ? 'today' : ''} ${key === selectedDate ? 'active' : ''}" data-date="${key}" aria-pressed="${key === selectedDate}" aria-label="${dateLabel(key, true)}${key === today() ? '，今天' : ''}">${key === today() ? '<span class="today-heart" aria-hidden="true">♥</span>' : ''}<span class="weekday">${weekdays[day.getDay()]}</span><span class="date-number">${day.getDate()}</span>${state.meals.some(m => m.date === key) ? '<span class="date-dot" aria-hidden="true"></span>' : ''}</button>`; }).join('')}</div>
    <div class="week-summary"><span>本周已安排 <strong>${weekMeals.length} 餐</strong> · 已吃 <strong>${weekMeals.filter(m => m.completed).length} 餐</strong></span><span>一口一口，好好生活 ♡</span></div>
    <div class="day-heading"><h2>${dateLabel(selectedDate)}</h2><span class="tiny-heart">${selectedDate === today() ? '♡ 就是今天' : '♡ 我的小计划'}</span></div>
    <div class="meals">${SLOTS.map(slot => mealCard(slot)).join('')}</div>
    <p class="footer-note">允许留白，也允许临时改变主意。<br>只有标记「已吃」，才会扣减实际库存 ♡</p>
  </section>`;
}
function mealCard(slot) {
  const meal = state.meals.find(m => m.date === selectedDate && m.slot === slot);
  return `<article class="meal-card ${slot} ${meal?.completed ? 'done' : ''}"><div class="meal-top"><div class="meal-slot"><span class="slot-icon" aria-hidden="true">${illustration(mealArt[slot])}</span><div><span class="slot-caption" aria-hidden="true">${slotEnglish[slot]}</span><strong>${labels[slot]}</strong><small class="meal-time" style="display:block;margin-top:4px">${times[slot]}</small></div></div>${meal ? meal.completed ? '<span class="done-stamp">✓ 好好吃过啦</span>' : `<span class="tag">${escape(meal.type)}</span>` : ''}</div>${meal ? `<button class="meal-details" data-detail="${escape(meal.id)}" aria-label="查看${escape(meal.name)}详情"><div class="meal-name">${escape(meal.name)}</div>${meal.resource || meal.protein ? `<div class="protein-line">蛋白质 · ${escape(meal.resource?.name || meal.protein)}${meal.resource ? ` <span>／ ${meal.resource.amount} ${escape(meal.resource.unit)}</span>` : ''}</div>` : ''}${meal.note ? `<p class="meal-note">${escape(meal.note)}</p>` : ''}</button><div class="meal-actions"><button class="text-button" data-detail="${escape(meal.id)}">${meal.completed ? '查看记录' : '编辑 / 调整'} ↗</button>${meal.completed ? `<button class="text-button" data-undo="${escape(meal.id)}">撤销已吃</button>` : `<button class="complete-button" data-complete="${escape(meal.id)}">✓ 标记已吃</button>`}</div>` : `<button class="empty-meal" data-add="${slot}"><span class="empty-label">今天想吃什么捏？♡</span><span class="plus-circle" aria-hidden="true">+</span></button>`}</article>`;
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
  return `<section class="page"><div class="section-heading"><div><div class="eyebrow">A LITTLE FRIDGE OF HAPPINESS</div><h1>我的食材小冰箱</h1><p class="subheading">${state.inventory.length ? `收好 ${state.inventory.length} 种食材，慢慢安排` : '把喜欢的食材，一份份收好'}</p></div><button class="pill pink" data-action="add-ingredient">＋ 添加</button></div><div class="info-card soft"><strong>当前库存</strong>是实际剩余；<strong>预计剩余</strong>会减去所有日期尚未吃的计划，包括过去和未来。安排餐食不会真正扣库存哦。</div>${state.inventory.length ? `<div class="inventory-list">${state.inventory.map(item => { const predicted = forecast(state, item.id); const planned = reserved(state, item.id); return `<article class="ingredient-card"><div class="ingredient-header"><h2 class="ingredient-name">${escape(item.name)}</h2><span class="ingredient-emoji" aria-hidden="true">${illustration(ingredientArt(item.name))}</span></div><div class="stock-numbers"><div><small>当前库存</small><strong>${item.quantity}</strong><span class="unit">${escape(item.unit)}</span></div><div><small>预计剩余</small><strong class="forecast ${predicted < 0 ? 'low' : ''}">${predicted}</strong><span class="unit">${escape(item.unit)}</span></div></div><div class="ingredient-meta">每餐 ${item.perMeal} ${escape(item.unit)} · 已计划 ${planned} ${escape(item.unit)}${item.note ? `<br>${escape(item.note)}` : ''}${item.expires ? `<br>${item.expires < today() ? '保质期已过，请核对' : '保质期'} · ${escape(item.expires)}` : ''}</div><div class="inventory-actions"><span class="warning-label">${predicted < 0 ? '♡ 计划用量超出库存' : '♡ 慢慢吃，不着急'}</span><button class="text-button" data-ingredient="${escape(item.id)}">编辑 ↗</button></div></article>`; }).join('')}</div>` : `<div class="empty-state"><span class="illustration" aria-hidden="true">${illustration('basket')}</span><h2>小冰箱还空着呢 ♡</h2><p>虾仁、鸡腿、牛肉饼……<br>先收好食材，再安排喜欢的一餐。</p><button class="pill pink" data-action="add-ingredient">＋ 添加第一份食材</button></div>`}<p class="footer-note">预计不足也可以安排，补货后修改当前库存就好。</p></section>`;
}
function renderSettings() {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent);
  return `<section class="page"><div class="section-heading"><div><div class="eyebrow">MY PRIVATE LITTLE SPACE</div><h1>我的手账小角落</h1><p class="subheading">不需要登录，计划只留在你的设备里 ♡</p></div></div>
    <div class="settings-card"><h3>📦 给手账留一份备份</h3><p>餐食和库存默认保存在此浏览器本地，历史和未来记录都不会每周清空。<strong>清理网站数据、卸载浏览器或设备故障可能导致数据丢失，本地保存不能当作永久可靠备份。</strong>请定期导出 JSON 到文件或自己的网盘。</p><div class="settings-actions"><button class="pill pink" data-action="export">导出 JSON 备份</button><button class="pill" data-action="import">导入 / 恢复</button></div><div class="backup-status">${backupTime ? `最近发起导出：${escape(backupTime)}（请确认文件已保存）` : '还没有导出过备份，记得偶尔存一份哦。'}<br>导入会替换整本手账，确认前会显示内容摘要。</div></div>
    <div class="settings-card"><h3>🍓 装进手机，随时打开</h3><p id="offline-status">${offlineReady ? '✓ 离线资源已缓存；此浏览器断网后也能打开手账。' : '离线缓存尚未就绪，请联网打开 HTTPS 地址，等待缓存成功。'}</p><ul><li>安卓：用 Chrome 打开，选择菜单中的「安装应用」或「添加到主屏幕」。</li><li>iPhone：用 Safari 打开，点分享 →「添加到主屏幕」。</li><li>第一次打开需要网络；缓存成功后排餐、库存、备份均可离线操作。</li></ul>${installPrompt ? '<button class="pill pink" data-action="install">安装到主屏幕</button>' : `<p>${ios ? 'iPhone 请通过 Safari 分享菜单安装。' : '若没有安装按钮，可从浏览器菜单添加到主屏幕。'}</p>`}<p style="margin-top:10px">不同设备、浏览器和网站地址不会自动同步。切换前请导出，在新位置导入。iPhone 安装后也请核对记录，必要时重新导入。</p></div>
    <div class="settings-card"><h3>♡ 手账的小约定</h3><p>日期按设备当地时间显示。一周从周一开始，跨月、跨年都按真实日期保存。未吃计划可以编辑、删除、复制、移动；已吃记录只有明确撤销后才能修改，撤销会返还原食材用量。每餐可关联一种主要库存食材。</p><p style="margin-top:10px">每次数量最多三位小数。食材数量表示份、个、包或克，不计算营养或热量；发现实际用量不同，请在标记已吃前修改。</p></div>
    <div class="settings-card"><h3>本地数据管理</h3><p>当前保存 ${state.meals.length} 餐记录、${state.inventory.length} 种食材。${locked ? '原文件已保护，请先保存原文件再恢复。' : '所有操作保存成功后才更新界面。'}</p><div class="settings-actions">${savedRaw ? '<button class="pill" data-action="original">保存当前原文件</button>' : ''}<button class="pill danger" data-action="clear">清空手账</button></div></div><div class="credits">食物插画：<a href="https://openmoji.org/" target="_blank" rel="noopener">OpenMoji</a> · <a href="./assets/credits.html" target="_blank" rel="noopener">作者、来源与 CC BY-SA 4.0 授权</a><br>食物插画保留 OpenMoji 官方原图；牛奶纸盒、装订、胶带与导航线稿为本项目原创。</div><p class="footer-note">机智定食 V1.0 · 私人餐食手账<br>今天也要，好好吃饭 ♡</p></section>`;
}

function mealEditor(slot, id = null) {
  if (readOnlyGuard()) return;
  const existing = state.meals.find(m => m.id === id);
  if (existing?.completed) return mealDetail(id);
  const meal = existing || { id: uid(), date: selectedDate, slot, name: '', type: '自制便当', protein: '', note: '', resource: null };
  showSheet(existing ? '编辑这份小计划' : '安排一份好好吃的', `${dateLabel(meal.date, true)} · ${labels[meal.slot]} ♡`, `<form id="meal-form"><label class="form-field">菜名<input name="name" required maxlength="80" placeholder="例如：牛肉丸便当" value="${escape(meal.name)}" autocomplete="off"></label><label class="form-field">这餐的类型<select name="type">${TYPES.map(t => `<option ${meal.type === t ? 'selected' : ''}>${t}</option>`).join('')}</select></label><label class="form-field">主要蛋白质食材<select name="ingredient"><option value="">不关联库存</option>${state.inventory.map(i => `<option value="${escape(i.id)}" ${meal.resource?.ingredientId === i.id ? 'selected' : ''}>${escape(i.name)} · 当前 ${i.quantity} ${escape(i.unit)}</option>`).join('')}</select><span class="field-hint">${state.inventory.length ? '选了食材后，只预留用量；吃过才实际扣减。' : '可先保存菜名，稍后去「食材库存」添加食材。'}</span></label><div id="resource-amount" ${meal.resource ? '' : 'hidden'}><label class="form-field">预计使用数量<input name="amount" type="number" min="0.001" max="1000000000" step="0.001" inputmode="decimal" value="${meal.resource?.amount || 1}"><span id="forecast-hint" class="field-hint"></span></label></div><label class="form-field" id="protein-field" ${meal.resource ? 'hidden' : ''}>蛋白质来源 <span class="muted">（可选，不扣库存）</span><input name="protein" maxlength="60" value="${escape(meal.protein)}" placeholder="例如：鸡蛋 / 牛肉"></label><label class="form-field">一点小备注 <span class="muted">（可选）</span><textarea name="note" maxlength="200" placeholder="例如：提前一晚解冻">${escape(meal.note)}</textarea></label><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button class="secondary" type="button" data-close>再想想</button><button class="primary" type="submit">收进手账 ♡</button></div></form>`);
  const form = $('#meal-form');
  const updateForecast = () => {
    const ingredient = state.inventory.find(i => i.id === form.elements.ingredient.value);
    $('#resource-amount').hidden = !ingredient; $('#protein-field').hidden = !!ingredient;
    form.elements.amount.required = !!ingredient; form.elements.amount.disabled = !ingredient;
    if (ingredient) { const amount = Number(form.elements.amount.value); const remaining = round(forecast(state, ingredient.id, id) - (Number.isFinite(amount) ? amount : 0)); $('#forecast-hint').textContent = `单位：${ingredient.unit} · 保存后预计剩余 ${remaining} ${ingredient.unit}${remaining < 0 ? '，库存不足也可以继续安排' : ''}（全部未吃计划）`; }
  };
  form.elements.ingredient.onchange = () => { const i = state.inventory.find(i => i.id === form.elements.ingredient.value); if (i) form.elements.amount.value = i.perMeal; updateForecast(); };
  form.elements.amount.oninput = updateForecast; updateForecast();
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const ingredient = state.inventory.find(i => i.id === form.elements.ingredient.value);
      const amount = Number(form.elements.amount.value);
      const next = { ...meal, name: form.elements.name.value.trim(), type: form.elements.type.value, protein: form.elements.protein.value.trim(), note: form.elements.note.value.trim(), resource: ingredient ? { ingredientId: ingredient.id, amount } : null };
      if (!next.name) { formError(form, '给这餐起个名字吧 ♡'); return; }
      if (ingredient && forecast(state, ingredient.id, id) - amount < 0 && !await ask('小冰箱提醒', `安排后「${ingredient.name}」预计剩余 ${round(forecast(state, ingredient.id, id) - amount)} ${ingredient.unit}。可以先排好，再补货；要继续吗？`, '继续安排')) return;
      if (commit(s => putMeal(s, next), '这餐收进手账啦 ♡')) closeSheet();
    } finally { button.disabled = false; }
  };
}
function mealDetail(id) {
  const meal = state.meals.find(m => m.id === id); if (!meal) return;
  showSheet(meal.name, `${dateLabel(meal.date, true)} · ${labels[meal.slot]} · ${meal.type}`, `<div class="detail-note">${escape(meal.resource ? `蛋白质：${meal.resource.name} · ${meal.resource.amount} ${meal.resource.unit}` : meal.protein ? `蛋白质：${meal.protein}` : '这餐没有关联库存食材')}${meal.note ? '\n' + escape(meal.note) : ''}</div>${meal.completed ? '<div class="info-card soft">✓ 好好吃过啦。库存已扣减，原记录保留。复制会生成新的未吃计划。</div>' : '<div class="info-card soft">♡ 这是未吃计划，实际库存还没有扣减。</div>'}<div class="action-grid">${meal.completed ? `<button data-undo="${escape(id)}">撤销已吃 / 返还库存</button>` : `<button class="pink" id="detail-edit">编辑餐食</button>`}<button id="detail-copy">复制到其他日期</button>${meal.completed ? '' : '<button id="detail-move">移动到其他日期</button><button class="danger" id="detail-delete">删除这餐</button>'}</div>`);
  if (!meal.completed) { $('#detail-edit').onclick = () => mealEditor(meal.slot, id); $('#detail-move').onclick = () => transferEditor(id, true); $('#detail-delete').onclick = async () => { if (await ask('留一处小空白', `删除「${meal.name}」？只会取消计划，不会扣减实际库存。`, '删除这餐') && commit(s => removeMeal(s, id), '这餐已取消，计划用量也释放啦。')) closeSheet(); }; }
  $('#detail-copy').onclick = () => transferEditor(id, false);
}
function transferEditor(id, move) {
  const meal = state.meals.find(m => m.id === id); if (!meal || readOnlyGuard()) return;
  showSheet(move ? '把这餐挪一下' : '再安排一次喜欢的餐', `${meal.name} · 原日期 ${dateLabel(meal.date, true)}`, `<form id="transfer-form"><label class="form-field">放在哪一天<input name="date" type="date" required value="${meal.date}"></label><label class="form-field">哪一餐<select name="slot">${SLOTS.map(s => `<option value="${s}" ${meal.slot === s ? 'selected' : ''}>${labels[s]}</option>`).join('')}</select></label><p class="field-hint">${move ? '移动后原位置留空，预计用量不会重复计算。' : '复制会生成新的未吃计划，原记录保留。'}</p><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary" data-close>再想想</button><button type="submit" class="primary">${move ? '移动到这一天' : '复制到这一天'}</button></div></form>`);
  const form = $('#transfer-form');
  form.onsubmit = async e => {
    e.preventDefault(); const button = form.querySelector('[type=submit]'); button.disabled = true;
    try {
      const date = form.elements.date.value, slot = form.elements.slot.value;
      if (!parseDate(date)) { formError(form, '请选择有效日期。'); return; }
      if (date === meal.date && slot === meal.slot) { formError(form, '选另一个日期或餐次吧 ♡'); return; }
      const target = state.meals.find(m => m.date === date && m.slot === slot);
      if (target?.completed) { formError(form, '这里已有已吃记录，请选择另一餐，保留这份回忆。'); return; }
      if (target && !await ask('这里已经有小计划', `用「${meal.name}」替换「${target.name}」？原位置的未吃计划会被取消。`, '替换计划')) return;
      const next = structuredClone(state);
      try { transferMeal(next, id, date, slot, move, !!target); } catch (error) { formError(form, error.message); return; }
      const ingredientId = meal.resource?.ingredientId;
      if (ingredientId && forecast(next, ingredientId) < 0 && !await ask('预计库存不足', `调整后「${meal.resource.name}」预计剩余 ${forecast(next, ingredientId)} ${meal.resource.unit}，要继续安排吗？`, '继续安排')) return;
      if (commit(s => transferMeal(s, id, date, slot, move, !!target), move ? '小计划挪好啦 ♡' : '喜欢的餐，又安排上啦 ♡')) { selectedDate = date; page = 'calendar'; render(); closeSheet(); }
    } finally { button.disabled = false; }
  };
}
async function markComplete(id) {
  if (readOnlyGuard()) return;
  const meal = state.meals.find(m => m.id === id); if (!meal || meal.completed) return;
  const ingredient = state.inventory.find(i => i.id === meal.resource?.ingredientId);
  const insufficient = ingredient && ingredient.quantity < meal.resource.amount;
  if (insufficient && !await ask('核对一下实际用量', `「${ingredient.name}」当前只有 ${ingredient.quantity} ${ingredient.unit}，这餐使用 ${meal.resource.amount} ${ingredient.unit}。继续会让当前库存变为 ${round(ingredient.quantity - meal.resource.amount)} ${ingredient.unit}；也可以返回修改用量。`, '确认吃过，继续扣减')) return;
  if (commit(s => completeMeal(s, id, !!insufficient), '✓ 好好吃过啦，库存已保存 ♡')) closeSheet();
}
async function undoMeal(id) {
  if (readOnlyGuard()) return;
  const meal = state.meals.find(m => m.id === id); if (!meal?.completed) return;
  if (await ask('撤销这枚小印章', `将「${meal.name}」恢复为未吃计划${meal.resource ? `，并返还 ${meal.resource.amount} ${meal.resource.unit} ${meal.resource.name}` : ''}。确定撤销吗？`, '撤销并返还') && commit(s => undoComplete(s, id), '已返还库存，这餐恢复为未吃计划。')) closeSheet();
}

function ingredientEditor(id = null) {
  if (readOnlyGuard()) return;
  const original = state.inventory.find(i => i.id === id);
  const item = original || { id: uid(), name: '', quantity: 1, unit: '份', perMeal: 1, note: '', expires: '' };
  const linked = state.meals.some(m => m.resource?.ingredientId === id);
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
  showSheet('翻到那一天', '无论过去还是未来，计划都留在真实的日期里。', `<form id="jump-form"><label class="form-field">想看哪一天<input class="jump-input" name="date" type="date" required value="${selectedDate}"></label><p class="form-error" role="alert" hidden></p><div class="form-buttons"><button type="button" class="secondary" data-close>再想想</button><button type="submit" class="primary">翻到这一天 ♡</button></div></form>`);
  const form = $('#jump-form'); form.onsubmit = e => {
    e.preventDefault(); const key = form.elements.date.value;
    if (!parseDate(key)) { formError(form, '这个日期不太对，重新选一下吧。'); return; }
    try { const dates = weekDates(key); if (dates.some(d => !d)) throw new Error(); } catch { formError(form, '请选择公元 0001 至 9999 年内完整的一周。'); return; }
    selectedDate = key; render(); closeSheet();
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
  const dates = result.state.meals.map(m => m.date).sort();
  showSheet('把这本手账恢复回来？', '导入会完整替换当前餐食与库存，包含所有历史和未来记录。', `<div class="import-summary">文件：${escape(file.name)}<br>${result.state.meals.length} 餐记录 · ${result.state.inventory.length} 种食材${dates.length ? `<br>日期：${dates[0]} 至 ${dates.at(-1)}` : ''}${result.warnings.length ? `<br><strong class="danger">有 ${result.warnings.length} 项异常：</strong><br>${[...new Set(result.warnings)].map(escape).join('<br>')}` : ''}</div><p class="sheet-subtitle">建议先导出当前数据。恢复后的当前库存直接采用备份数值，不会再次扣减已吃记录。</p><p class="form-error" id="import-error" role="alert" hidden></p><div class="form-buttons"><button class="secondary" data-close>取消</button><button class="primary" id="restore-confirm">确认替换并恢复</button></div>`);
  $('#restore-confirm').onclick = () => {
    try {
      if (!storage) throw new Error('浏览器不允许本地保存，请先开启网站存储。');
      if (storage.getItem(STORAGE_KEY) !== savedRaw) { refreshFromStorage(); closeSheet(); toast('另一窗口刚更新了手账，请重新选择备份。'); return; }
      const saved = persist(storage, result.state); state = saved; savedRaw = JSON.stringify(saved); locked = false; warnings = result.warnings; render(); closeSheet(); toast('手账恢复好啦 ♡' + (warnings.length ? ' 部分异常已提示，请保留原备份。' : ''));
    } catch { $('#import-error').textContent = '没能写入本地存储，请检查存储权限或剩余空间；原数据未改变。'; $('#import-error').hidden = false; }
  };
};
async function clearData() {
  if (!await ask('确定清空整本手账？', '全部历史餐食、未来计划和库存都会被删除。此操作不能撤销，请先导出备份。', '确认清空全部')) return;
  try {
    if (!storage) throw new Error();
    if (storage.getItem(STORAGE_KEY) !== savedRaw) { refreshFromStorage(); toast('另一窗口刚修改了手账，请检查后重试。'); return; }
    const next = persist(storage, freshState()); state = next; savedRaw = JSON.stringify(next); locked = false; warnings = []; render(); toast('手账已清空，可以开始新的小计划。');
  } catch { toast('暂时没能清空，请检查浏览器存储权限。'); }
}
function navigate(nextPage) { if (page !== nextPage) { page = nextPage; location.hash = nextPage; render(); window.scrollTo(0, 0); } }
window.addEventListener('hashchange', () => { const next = location.hash.slice(1); if (['calendar', 'inventory', 'settings'].includes(next)) { page = next; render(); } });
document.addEventListener('click', async e => {
  const button = e.target.closest('button'); if (!button) return;
  if (button.dataset.page) return navigate(button.dataset.page);
  if (button.dataset.date) { selectedDate = button.dataset.date; render(); return; }
  if (button.dataset.add) return mealEditor(button.dataset.add);
  if (button.dataset.detail) return mealDetail(button.dataset.detail);
  if (button.dataset.ingredient) return ingredientEditor(button.dataset.ingredient);
  if (button.dataset.complete) { button.disabled = true; await markComplete(button.dataset.complete); if (button.isConnected) button.disabled = false; return; }
  if (button.dataset.undo) { button.disabled = true; await undoMeal(button.dataset.undo); if (button.isConnected) button.disabled = false; return; }
  switch (button.dataset.action) {
    case 'today': selectedDate = today(); render(); break;
    case 'prev': case 'next': { const next = addDays(selectedDate, button.dataset.action === 'prev' ? -7 : 7); if (next) { try { if (weekDates(next).some(d => !d)) throw new Error(); selectedDate = next; render(); } catch { toast('已到日期边界啦。'); } } else toast('已到日期边界啦。'); break; }
    case 'jump': jumpDate(); break;
    case 'add-ingredient': ingredientEditor(); break;
    case 'export': exportBackup(); break;
    case 'original': exportBackup(true); break;
    case 'import': $('#import-file').click(); break;
    case 'clear': await clearData(); break;
    case 'install': if (installPrompt) { await installPrompt.prompt(); await installPrompt.userChoice; installPrompt = null; render(); } break;
  }
});
window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installPrompt = e; if (page === 'settings') render(); });
window.addEventListener('appinstalled', () => { installPrompt = null; toast('手账装进手机啦 🍓'); if (page === 'settings') render(); });
render();
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').then(() => navigator.serviceWorker.ready).then(async () => {
    const cached = await caches.has('jizhi-meals-shell-journal-3'); offlineReady = cached; if (page === 'settings') render();
  }).catch(() => { offlineReady = false; if (page === 'settings') render(); });
}
