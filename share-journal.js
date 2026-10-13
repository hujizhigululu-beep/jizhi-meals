import { parseDate } from './model.js';
import { wrapCanvasText } from './share-card.js';
import { STICKER_IDS, getSticker, stickerPath } from './stickers.js';
import { activeActivityItems } from './activity.js';
import { getActivityCategory } from './activity-shortcuts.js';
import { SHARE_THEMES_A, SHARE_LAYOUTS_A } from './share-layouts-a.js';
import { SHARE_THEMES_B, SHARE_LAYOUTS_B } from './share-layouts-b.js';

export const SHARE_TYPES = Object.freeze({ meal: '吃饭', exercise: '运动', study: '学习', life: '综合生活' });
export const SHARE_THEMES = Object.freeze({ ...SHARE_THEMES_A, ...SHARE_THEMES_B });
export const SHARE_TEMPLATES = Object.freeze([...SHARE_LAYOUTS_A, ...SHARE_LAYOUTS_B]);
const SLOTS = Object.freeze({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食 / 加餐' });
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const TITLE = '"Songti SC", "SimSun", Georgia, serif';
const SCALE = 2;
const MAX_PIXEL_HEIGHT = 10000;
const MAX_PIXEL_AREA = 16000000;
const validDate = value => typeof value === 'string' && Boolean(parseDate(value));
const validMonth = value => typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && validDate(value + '-01');
const dateKey = date => `${String(date.getFullYear()).padStart(4, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateLabel = date => `${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
const shortDate = date => `${Number(date.slice(5, 7))}月${Number(date.slice(8))}日`;
const text = value => typeof value === 'string' ? value.trim() : '';
const knownMinutes = value => Number.isInteger(value) && value >= 0 && value <= 1440;
const knownDistance = value => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100000;
const stickerSet = new Set(STICKER_IDS);

/** Explicit [] clears sharing stickers; null/omission inherits date record IDs. */
export function normalizeJournalShareOptions(options = {}) {
  const kind = Object.hasOwn(SHARE_TYPES, options.kind) ? options.kind : 'life';
  const template = SHARE_TEMPLATES.find(item => item.kind === kind && item.id === options.template)?.id
    || SHARE_TEMPLATES.find(item => item.kind === kind).id;
  return {
    ...options, kind, template,
    scope: ['day', 'range', 'month'].includes(options.scope) ? options.scope : 'day',
    format: ['portrait', 'long', 'square'].includes(options.format) ? options.format : 'portrait',
    notes: options.notes === true, diary: options.diary === true,
    mood: options.mood === true || options.diary === true && options.mood !== false,
    joy: options.joy === true || options.diary === true && options.joy !== false,
    breakfast: options.breakfast !== false, lunch: options.lunch !== false,
    dinner: options.dinner !== false, snacks: options.snacks !== false,
    stickerIds: Array.isArray(options.stickerIds)
      ? [...new Set(options.stickerIds)].filter(id => stickerSet.has(id)).slice(0, 3) : null,
  };
}

export function journalShareBounds(options = {}) {
  const settings = normalizeJournalShareOptions(options);
  let start, end;
  if (settings.scope === 'month') {
    if (!validMonth(settings.month)) throw new Error('请选择有效的分享月份。');
    start = settings.month + '-01';
    const date = parseDate(start);
    // Local calendar math retains years 0001–0099 and the end of 9999.
    date.setMonth(date.getMonth() + 1, 0);
    end = dateKey(date);
  } else if (settings.scope === 'range') { start = settings.start; end = settings.end; }
  else { start = settings.date; end = settings.date; }
  if (!validDate(start) || !validDate(end) || start > end) throw new Error('请选择有效日期，日期范围应从较早的一天到较晚的一天。');
  return { start, end };
}

/** Read-only privacy boundary. Neither drawing nor templates see excluded fields. */
export function prepareJournalShare(state, options = {}) {
  const settings = normalizeJournalShareOptions(options);
  const { start, end } = journalShareBounds(settings);
  const included = date => validDate(date) && date >= start && date <= end;
  const label = date => start.slice(0, 4) === end.slice(0, 4) ? shortDate(date) : dateLabel(date);
  const records = (Array.isArray(state.dayRecords) ? state.dayRecords : []).filter(record => included(record.date)).slice().sort((a, b) => a.date.localeCompare(b.date));
  const meals = (Array.isArray(state.meals) ? state.meals : [])
    .filter(meal => included(meal.date) && Object.hasOwn(SLOTS, meal.slot) && settings[meal.slot === 'snack' ? 'snacks' : meal.slot] && text(meal.name))
    .slice().sort((a, b) => a.date.localeCompare(b.date) || Object.keys(SLOTS).indexOf(a.slot) - Object.keys(SLOTS).indexOf(b.slot) || String(a.time || '').localeCompare(String(b.time || '')))
    .map(meal => ({ title: text(meal.name), meta: [label(meal.date), SLOTS[meal.slot], meal.slot === 'snack' ? text(meal.time) : '', meal.completed === true ? '已吃' : '已安排'].filter(Boolean).join(' · '), note: '', date: meal.date, groupLabel: SLOTS[meal.slot] }));
  const checkRows = kind => records.filter(record => record[kind]?.checked === true).flatMap(record => {
    const activity = record[kind];
    const entries = activeActivityItems(activity);
    const fallback = (kind === 'study' ? '学习' : '运动') + '已打卡';
    const categoryName = id => text((activity.items || []).find(item => item.categoryId === id && text(item.categoryName))?.categoryName) || text(getActivityCategory(state, kind, id)?.name) || (kind === 'study' ? '学习类别' : '运动类别');
    const selected = [...new Set(Array.isArray(activity.categoryIds) ? activity.categoryIds : [])];
    // A category chip is a real check-in even when optional details have been removed.
    const missingCategories = selected.filter(id => !entries.some(item => item.categoryId === id));
    const rows = entries.map(item => ({ title: text(item.content) || (item.categoryId ? categoryName(item.categoryId) : fallback),
      meta: [label(record.date), knownMinutes(item.minutes) ? item.minutes + ' 分钟' : '', settings.notes && kind === 'exercise' && knownDistance(item.distanceKm) ? item.distanceKm + ' 公里' : ''].filter(Boolean).join(' · '),
      note: settings.notes ? text(item.note) : '', date: record.date,
      minutes: knownMinutes(item.minutes) ? item.minutes : 0, minutesKnown: knownMinutes(item.minutes) }));
    rows.push(...missingCategories.map(id => ({ title: categoryName(id), meta: label(record.date), note: '', date: record.date, minutes: 0, minutesKnown: false })));
    return rows.length ? rows : [{ title: fallback, meta: label(record.date), note: '', date: record.date, minutes: 0, minutesKnown: false }];
  });
  const exercises = checkRows('exercise'), studies = checkRows('study');
  const unique = rows => new Set(rows.map(row => row.date)).size;
  const counts = { mealDays: unique(meals), mealCount: meals.length, exerciseDays: unique(exercises), studyDays: unique(studies),
    exerciseMinutes: exercises.reduce((sum, row) => sum + row.minutes, 0), studyMinutes: studies.reduce((sum, row) => sum + row.minutes, 0) };
  const lifeRows = (Array.isArray(state.diaries) ? state.diaries : []).filter(record => included(record.date)).slice().sort((a, b) => a.date.localeCompare(b.date))
    .flatMap(record => [['心情', settings.mood ? record.mood : ''], ['小确幸', settings.joy ? record.joy : ''], ['小故事', settings.diary ? record.text : '']]
      .filter(([, value]) => text(value)).map(([title, value]) => ({ title, meta: label(record.date), note: text(value), date: record.date })));
  const groups = [{ kind: 'meal', label: '好好吃饭', rows: meals }, { kind: 'exercise', label: '动一动', rows: exercises }, { kind: 'study', label: '学一点', rows: studies }].filter(group => group.rows.length);
  const highlights = [];
  if (meals.length) highlights.push({ title: '记住的一餐', meta: meals.at(-1).meta, note: meals.at(-1).title });
  const longest = exercises.filter(row => row.minutesKnown).slice().sort((a, b) => b.minutes - a.minutes)[0];
  if (longest) highlights.push({ title: '运动最长的一项', meta: longest.meta, note: longest.title });
  const studyDaily = new Map();
  for (const row of studies) if (row.minutesKnown) studyDaily.set(row.date, (studyDaily.get(row.date) || 0) + row.minutes);
  const mostStudy = [...studyDaily].sort((a, b) => b[1] - a[1])[0];
  if (mostStudy) highlights.push({ title: '学习投入最多的一天', meta: `${label(mostStudy[0])} · ${mostStudy[1]} 分钟`, note: studies.filter(row => row.date === mostStudy[0]).map(row => row.title).join('、') });
  const inherited = records.flatMap(record => Array.isArray(record.stickerIds) ? record.stickerIds : []);
  const stickerIds = [...new Set(settings.stickerIds === null ? inherited : settings.stickerIds)].filter(id => stickerSet.has(id)).slice(0, 3);
  const title = start === end ? dateLabel(start) : dateLabel(start) + ' — ' + (start.slice(0, 4) === end.slice(0, 4) ? shortDate(end) : dateLabel(end));
  const count = settings.kind === 'meal' ? meals.length : settings.kind === 'exercise' ? exercises.length : settings.kind === 'study' ? studies.length : meals.length + exercises.length + studies.length + lifeRows.length;
  return { kind: settings.kind, scope: settings.scope, dateLabel: title,
    rangeLabel: settings.scope === 'month' ? `${Number(start.slice(0, 4))}.${start.slice(5, 7)}` : title,
    isRange: start !== end, start, end, counts, meals, exercises, studies, groups, lifeRows, highlights,
    caption: settings.kind === 'life' ? '' : lifeRows.map(row => `${row.title} · ${row.meta}\n${row.note}`).join('\n'),
    stickerIds, hasRecords: count > 0 };
}

  class Painter {
    constructor(width,format,theme){this.width=width;this.format=format;this.theme=theme;this.ops=[];this.slots=[];this.context=document.createElement('canvas').getContext('2d');if(!this.context)throw new Error('此浏览器暂时无法生成图片，请使用 Safari 或 Chrome 重新打开。');}
    style(opts={}){return {size:20,weight:'400',font:'body',color:this.theme.ink,lineHeight:28,align:'left',...opts};}
    font(opts){return `${opts.weight} ${opts.size}px ${opts.font==='title'?(this.theme.titleFont||TITLE):(this.theme.bodyFont||FONT)}`;}
    wrap(text,width,opts){const c=this.context;c.font=this.font(opts);return wrapCanvasText(c, text, width);}
    measure(text,width,opts={}){if(!String(text??'').length)return 0;const o=this.style(opts);return this.wrap(text,Math.max(1,width),o).length*o.lineHeight;}
    text(text,x,y,width,opts={}){if(!String(text??'').length)return 0;const o=this.style(opts),lines=this.wrap(text,Math.max(1,width),o),height=lines.length*o.lineHeight;this.ops.push({type:'text',text:String(text),lines,x,y,width,height,opts:o});return height;}
    rect(x,y,width,height,opts={}){this.ops.push({type:'rect',x,y,width,height,opts});}
    line(x1,y1,x2,y2,opts={}){this.ops.push({type:'line',x1,y1,x2,y2,opts});}
    circle(x,y,radius,opts={}){this.ops.push({type:'circle',x,y,radius,opts});}
    dots(x,y,width,height,opts={}){this.ops.push({type:'dots',x,y,width,height,opts});}
    tape(x,y,width,opts={}){this.ops.push({type:'tape',x,y,width,opts});}
    // Decoration IDs are authored assets; user text only ever enters text().
    art(id,x,y,width,height){if(!/^(strawberry|badges|collage|cafe|ticket|study|report)-[a-z0-9-]+$/.test(id))throw new Error('分享装饰名称无效。');this.ops.push({type:'art',id,x,y,width,height});}
    group(x,y,width,height,angle,draw){this.ops.push({type:'group-start',x,y,width,height,angle});draw(this);this.ops.push({type:'group-end'});}
    slot(x,y,size){this.slots.push({x,y,size});}
    headerTag(label,x,y,width,opts={}){this.rect(x,y,width,36,{fill:opts.fill||this.theme.accent,radius:4});this.text(label,x+10,y+4,width-20,{size:18,lineHeight:27,weight:'600',color:opts.color||this.theme.ink});return 36;}
    rowParts(row,opts){const base={size:21,lineHeight:29,gap:12,color:this.theme.ink,metaColor:this.theme.muted,...opts};return [{text:row.title,opts:{size:base.size,lineHeight:base.lineHeight,weight:'600',color:base.color}},{text:row.meta,opts:{size:Math.max(17,base.size-3),lineHeight:25,color:base.metaColor}},{text:row.note,opts:{size:Math.max(18,base.size-2),lineHeight:27,color:base.color}}];}
    rowsHeight(rows,width,opts={}){return rows.reduce((sum,row)=>sum+this.rowParts(row,opts).reduce((height,part)=>height+this.measure(part.text||'',width,part.opts),0)+(opts.gap??12),0);}
    rows(rows,x,y,width,opts={}){let cursor=y;for(const row of rows){for(const part of this.rowParts(row,opts))cursor+=this.text(part.text||'',x,cursor,width,part.opts);cursor+=opts.gap??12;}return cursor-y;}
  }
  function rounded(c,x,y,w,h,r){r=Math.min(r,w/2,h/2);c.beginPath();c.moveTo(x+r,y);c.lineTo(x+w-r,y);c.quadraticCurveTo(x+w,y,x+w,y+r);c.lineTo(x+w,y+h-r);c.quadraticCurveTo(x+w,y+h,x+w-r,y+h);c.lineTo(x+r,y+h);c.quadraticCurveTo(x,y+h,x,y+h-r);c.lineTo(x,y+r);c.quadraticCurveTo(x,y,x+r,y);c.closePath();}
  function paint(c,p,H,artImages){
    c.fillStyle=p.theme.bg;c.fillRect(0,0,p.width,H);
    for(const op of p.ops){
      if(op.type==='group-start'){c.save();c.translate(op.x+op.width/2,op.y+op.height/2);c.rotate(op.angle*Math.PI/180);c.translate(-op.width/2,-op.height/2);continue;}
      if(op.type==='group-end'){c.restore();continue;}
      c.save();const o=op.opts||{};c.lineWidth=o.width||1;c.setLineDash(o.dash||[]);
      if(o.shadow){const shadow=typeof o.shadow==='object'?o.shadow:{};c.shadowColor=shadow.color||'#9d607326';c.shadowBlur=shadow.blur??8;c.shadowOffsetX=shadow.x??1;c.shadowOffsetY=shadow.y??3;}
      if(op.type==='text'){c.font=p.font(o);c.fillStyle=o.color;c.textBaseline='top';c.textAlign=o.align;const x=op.x+(o.align==='center'?op.width/2:o.align==='right'?op.width:0);op.lines.forEach((line,i)=>c.fillText(line,x,op.y+i*o.lineHeight));}
      else if(op.type==='rect'){rounded(c,op.x,op.y,op.width,op.height,o.radius||0);if(o.fill){c.fillStyle=o.fill;c.fill();}if(o.stroke){c.strokeStyle=o.stroke;c.stroke();}}
      else if(op.type==='line'){c.beginPath();c.moveTo(op.x1,op.y1);c.lineTo(op.x2,op.y2);c.strokeStyle=o.color||p.theme.line;c.stroke();}
      else if(op.type==='circle'){c.beginPath();c.arc(op.x,op.y,op.radius,0,Math.PI*2);if(o.fill){c.fillStyle=o.fill;c.fill();}if(o.stroke){c.strokeStyle=o.stroke;c.stroke();}}
      else if(op.type==='dots'){c.fillStyle=o.color||p.theme.line;const step=o.step||16;for(let x=op.x;x<op.x+op.width;x+=step)for(let y=op.y;y<op.y+op.height;y+=step){c.beginPath();c.arc(x,y,o.radius??.9,0,Math.PI*2);c.fill();}}
      else if(op.type==='art'){c.drawImage(artImages.get(op.id),op.x,op.y,op.width,op.height);}
      else if(op.type==='tape'){c.translate(op.x+op.width/2,op.y+9);c.rotate((o.angle||0)*Math.PI/180);c.globalAlpha=.72;c.fillStyle=o.fill||p.theme.tape;c.fillRect(-op.width/2,-9,op.width,18);c.globalAlpha=.35;c.strokeStyle=p.theme.paper;for(let x=-op.width/2;x<op.width/2;x+=8){c.beginPath();c.moveTo(x,-9);c.lineTo(x,9);c.stroke();}}
      c.restore();
    }
  }

// Only bundled, same-origin SVG resources enter the canvas. No remote uploads.
const stickerImages = new Map();
const decorationImages = new Map();
async function loadDecoration(id) {
  if (!decorationImages.has(id)) {
    const pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = async () => {
        try {
          if (typeof image.decode === 'function') await image.decode();
          if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('装饰尺寸无效');
          resolve(image);
        } catch { reject(new Error('分享装饰没有加载成功，请重新打开后再试。')); }
      };
      image.onerror = () => reject(new Error('分享装饰没有加载成功，请重新打开后再试。'));
      image.src = new URL(`./assets/share-art/${id}.svg`, import.meta.url).href;
    });
    decorationImages.set(id, pending);
    pending.catch(() => decorationImages.delete(id));
  }
  return decorationImages.get(id);
}
async function loadSticker(id) {
  if (!stickerImages.has(id)) {
    const path = stickerPath(id);
    if (!path) throw new Error('这枚贴纸暂时不可用，请重新选择。');
    const pending = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = async () => {
        try {
          if (typeof image.decode === 'function') await image.decode();
          if (!(image.naturalWidth > 0 && image.naturalHeight > 0)) throw new Error('贴纸尺寸无效。');
          resolve(image);
        } catch { reject(new Error('贴纸没有加载成功，请重新打开后再试。')); }
      };
      image.onerror = () => reject(new Error('贴纸没有加载成功，请重新打开后再试。'));
      image.src = new URL(path, import.meta.url).href;
    });
    stickerImages.set(id, pending);
    pending.catch(() => stickerImages.delete(id));
  }
  return stickerImages.get(id);
}

/** Two-pass layout: all text is measured first; too-large output is never cut. */
export async function generateJournalShareCard(state, options = {}) {
  const settings = normalizeJournalShareOptions(options);
  const data = prepareJournalShare(state, settings);
  if (!data.hasRecords) throw new Error(`这段日期还没有可分享的${SHARE_TYPES[data.kind]}记录。`);
  if (typeof document === 'undefined') throw new Error('请在浏览器中生成分享卡片。');
  if (document.fonts?.ready) await document.fonts.ready;
  const images = await Promise.all(data.stickerIds.map(loadSticker));
  const template = SHARE_TEMPLATES.find(item => item.id === settings.template);
  const theme = SHARE_THEMES[template.themeId];
  const credit = data.stickerIds.some(id => Boolean(getSticker(id)?.license));
  const creditHeight = credit ? 24 : 0;
  let width = settings.format === 'square' ? 700 : 600, painter, height;
  for (let attempt = 0; attempt < 7; attempt++) {
    painter = new Painter(width, settings.format, theme);
    // A square's paper ends above optional sticker attribution, not below it.
    painter.frameHeight = settings.format === 'square' ? width - creditHeight : 0;
    height = Math.ceil(template.draw(painter, data, theme)) + creditHeight;
    if (!(Number.isFinite(height) && height > 0)) throw new Error('卡片尺寸没有生成成功，请重试。');
    if (settings.format !== 'square' || height <= width) break;
    const nextWidth = Math.min(2000, Math.max(width + 100, height));
    if (nextWidth === width || attempt === 6) break;
    width = nextWidth;
  }
  if (settings.format === 'square') {
    if (height > width) throw new Error('内容超出方图容量，请缩小日期范围或选择分享长图；记录没有被截掉。');
    height = width;
  } else if (!template.contentSized) height = Math.max(settings.format === 'long' ? 1000 : 750, height);
  if (height * SCALE > MAX_PIXEL_HEIGHT || width * height * SCALE * SCALE > MAX_PIXEL_AREA) {
    throw new Error('这段记录太长，请缩小日期范围后导出；内容没有被截掉。');
  }
  if (painter.slots.length < images.length) throw new Error('这个版式暂时无法容纳所选贴纸，请减少贴纸后重试。');
  const artIds = [...new Set(painter.ops.filter(op => op.type === 'art').map(op => op.id))];
  const artImages = new Map(await Promise.all(artIds.map(async id => [id, await loadDecoration(id)])));
  const canvas = document.createElement('canvas');
  try {
    canvas.width = Math.round(width * SCALE); canvas.height = Math.ceil(height * SCALE);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('此浏览器暂时无法生成图片，请使用 Safari 或 Chrome 重新打开。');
    context.scale(SCALE, SCALE);
    paint(context, painter, height, artImages);
    images.forEach((image, index) => {
      const slot = painter.slots[index], ratio = image.naturalWidth / image.naturalHeight;
      const imageWidth = ratio >= 1 ? slot.size : slot.size * ratio;
      const imageHeight = ratio >= 1 ? slot.size / ratio : slot.size;
      context.drawImage(image, slot.x + (slot.size - imageWidth) / 2, slot.y + (slot.size - imageHeight) / 2, imageWidth, imageHeight);
    });
    if (credit) {
      context.font = `12px ${FONT}`; context.fillStyle = theme.ink;
      context.textBaseline = 'top'; context.textAlign = 'center';
      context.fillText('草莓插画：OpenMoji · CC BY-SA 4.0', width / 2, height - 20);
    }
    const blob = await new Promise((resolve, reject) => canvas.toBlob(value => value ? resolve(value) : reject(new Error('图片没有生成成功，请缩小日期范围后重试。')), 'image/png'));
    return { blob, filename: `机智定食-${template.name}-${data.start}${data.end !== data.start ? '至' + data.end : ''}-${settings.format}.png`,
      width: canvas.width, height: canvas.height, data, template: template.id, stickerCount: images.length,
      text: painter.ops.filter(op => op.type === 'text').map(op => op.text) };
  } finally {
    // The independent Blob owns the image now; release the large pixel buffer.
    canvas.width = 1; canvas.height = 1;
  }
}
