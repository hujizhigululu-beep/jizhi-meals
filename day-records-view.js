import { getDayRecord, monthStats, activeActivityItems } from './activity.js';
import { getActivityCategories } from './activity-shortcuts.js';
import { getSticker } from './stickers.js';
import { renderStickerPicker } from './sticker-picker.js';

const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const CHECKIN_NAMES = {study:'学习', exercise:'运动'};

export function renderDayRecords(state, date, ui = {}) {
  const day = getDayRecord(state, date);
  const cumulative = monthStats(state, date.slice(0, 7));
  const details = Object.entries(CHECKIN_NAMES).map(([kind,name]) => {
    const record = day[kind], draft = ui[kind] || {};
    const activeItems = activeActivityItems(record);
    const minutes = activeItems.reduce((sum,item)=>sum+(item.minutes||0),0);
    const hasMinutes = activeItems.some(item => item.minutes != null);
    const categories = getActivityCategories(state, kind);
    const draftCategoryId = draft.categoryId ?? '';
    const categoryOptions = categories.filter(category => category.active || category.id === draftCategoryId).map(category => `<option value="${escape(category.id)}" ${category.id === draftCategoryId ? 'selected' : ''}>${escape(category.name)}${category.active ? '' : '（已停用）'}</option>`).join('');
    const categoryField = `<label>类别 · 选填<select name="categoryId" aria-label="${name}详情类别"><option value="">不分类</option>${categoryOptions}</select></label>`;
    const preview = record.items.find(item => item.content)?.content;
    const entries = record.items.map(item => {
      const category = item.categoryId ? categories.find(category => category.id === item.categoryId) : null;
      const retained = item.categoryId && (!record.checked || !record.categoryIds.includes(item.categoryId));
      const categoryLabel = item.categoryId ? `<span class="activity-entry-category">${escape(item.categoryName || category?.name || '原类别')}${category?.active === false ? ' · 已停用' : ''}</span>` : '';
      return `<div class="activity-entry${retained ? ' is-retained' : ''}"><div class="activity-entry-text">${categoryLabel}<strong>${escape(item.content || `${name}记录`)}</strong>${item.minutes != null ? `<span> · ${escape(item.minutes)} 分钟</span>` : ''}${kind === 'exercise' && item.distanceKm != null ? `<span class="activity-distance"> · ${escape(item.distanceKm)} 公里</span>` : ''}${retained ? '<small class="activity-entry-retained">详情已保留，暂不计入统计</small>' : ''}${item.note ? `<small>${escape(item.note)}</small>` : ''}</div><div class="activity-entry-actions"><button type="button" class="text-button" data-activity-edit="${escape(item.id)}" data-kind="${kind}" aria-label="修改这项${name}详情">修改</button><button type="button" class="text-button" data-activity-delete="${escape(item.id)}" data-kind="${kind}" aria-label="删除这项${name}详情">删除</button></div></div>`;
    }).join('');
    return `<details class="activity-details" data-kind="${kind}" ${draft.open ? 'open':''}><summary><span class="activity-summary-title">${name}详情 <span class="activity-summary-optional">（选填）</span></span><span class="activity-summary-meta">${record.checked?'已打卡':record.items.length?'未打卡':''}${record.items.length ? ` · ${record.items.length} 项${hasMinutes ? ` / ${minutes} 分钟`:''}`:''}</span>${preview?`<span class="activity-summary-preview">${escape(preview)}</span>`:''}</summary><div class="activity-ticket-body">${!record.checked&&record.items.length?'<p class="activity-help">未打卡 · 详情仍保留，不计入打卡天数</p>':''}${entries}${draft.conflict?'<p class="activity-help activity-conflict" role="status">另一窗口改了这项详情，草稿已保留。请核对后作为新详情添加。</p>':''}<form class="activity-form" data-kind="${kind}" data-date="${escape(date)}"><div class="activity-fields"><label>${kind==='study'?'学习内容':'运动项目'} · 选填<input name="content" maxlength="200" value="${escape(draft.content||'')}" placeholder="${kind==='study'?'日语、画画…':'力量训练、徒步…'}"></label><label>分钟 · 选填<input name="minutes" type="number" inputmode="numeric" min="0" max="1440" step="1" value="${escape(draft.minutes??'')}" placeholder="留空"></label></div><div class="activity-category-fields">${categoryField}${kind === 'exercise' ? `<label>公里 · 选填<input name="distanceKm" type="number" inputmode="decimal" min="0" max="100000" step="0.001" value="${escape(draft.distanceKm ?? '')}" placeholder="留空"></label>` : ''}</div><label>备注 · 选填<textarea name="note" maxlength="1000" rows="2" placeholder="想留下一点什么…">${escape(draft.note||'')}</textarea></label><div class="activity-form-actions"><button class="pill" type="submit">${draft.editing?'保存修改':'添加详情'}</button>${draft.editing?`<button class="text-button" type="button" data-activity-cancel="${kind}">取消修改</button>`:''}</div><p class="form-error" role="alert" hidden></p></form></div><div data-ai-daily-slot data-ai-kind="${kind}" data-ai-date="${escape(date)}"></div></details>`;
  }).join('');
  const shortcutGroups = Object.entries(CHECKIN_NAMES).map(([kind, name]) => {
    const categories = getActivityCategories(state, kind, {includeInactive:false});
    return `<div class="activity-shortcut-group" data-kind="${kind}" aria-label="${name}常用类别"><span class="activity-shortcut-label">${name}</span><div class="activity-shortcut-chips">${categories.map(category => `<button type="button" class="activity-shortcut-chip" data-activity-category="${escape(category.id)}" data-kind="${kind}" aria-pressed="${day[kind].checked && day[kind].categoryIds.includes(category.id)}" aria-label="${name}类别：${escape(category.name)}">${escape(category.name)}</button>`).join('')}<button type="button" class="activity-shortcut-manage" data-manage-activity-categories="${kind}" aria-label="管理${name}常用类别">＋</button></div></div>`;
  }).join('');
  const ids = day.stickerIds || [];
  const strip = ids.map(id=>{const sticker=getSticker(id);return sticker?`<img src="${escape(sticker.src)}" alt="${escape(sticker.name)}贴纸" width="34" height="34">`:'';}).join('');
  const usesStrawberry = ids.includes('strawberry');
  return `<section class="day-checkins" data-record-date="${escape(date)}" aria-label="学习运动与今日贴纸"><div class="checkin-heading"><h2>今天的小积累</h2><small>轻轻记下，按自己的节奏</small></div><div class="checkin-buttons">${Object.entries(CHECKIN_NAMES).map(([kind,name])=>{
    const label = `${name}${day[kind].checked?'已打卡 ✓':'打卡 ＋'}`;
    const art = kind === 'study' ? './assets/stickers/book.svg' : './assets/share-art/badges-sneaker.svg';
    const days = cumulative[`${kind}Days`], totalMinutes = cumulative[`${kind}Minutes`];
    return `<button type="button" class="pill checkin-button" data-checkin="${kind}" aria-pressed="${day[kind].checked}" aria-label="${label}"><img class="checkin-badge-art" src="${art}" alt="" width="32" height="32"><span class="checkin-button-copy"><span>${label}</span><small aria-hidden="true">本月 ${days} 天${totalMinutes ? ` · ${totalMinutes} 分钟`:''}</small></span></button>`;
  }).join('')}</div><div class="activity-shortcut-groups">${shortcutGroups}</div>${details}${strip?`<div class="day-sticker-strip" aria-label="今日贴纸">${strip}</div>`:''}<details class="day-sticker-picker" ${ui.stickerOpen?'open':''}><summary>今日贴纸 · 选填 <span>${ids.length}/3</span></summary>${renderStickerPicker({selectedIds:ids,group:ui.stickerGroup||'recent',recentIds:state.recentStickerIds,context:'day'})}</details>${usesStrawberry?'<p class="sticker-credit">草莓图：<a href="./assets/credits.html" target="_blank" rel="noopener">OpenMoji · CC BY-SA 4.0</a></p>':''}</section>`;
}
