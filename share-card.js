import { parseDate } from './model.js';

const DEFAULTS = { breakfast: true, lunch: true, dinner: true, snacks: true, mood: false, diary: false, joy: false };
const LABELS = { breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '零食 / 加餐' };
const WEEKDAYS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const WIDTH = 600;
const SCALE = 1.5;
const MAX_PIXEL_HEIGHT = 10000;

/** Keep composed emoji, flags and combining accents together when wrapping. */
export function graphemes(text) {
  if (typeof Intl?.Segmenter === 'function') return Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(String(text)), part => part.segment);
  const result = [];
  let regionalCount = 0;
  for (const char of Array.from(String(text))) {
    const cp = char.codePointAt(0);
    const regional = cp >= 0x1f1e6 && cp <= 0x1f1ff;
    const extending = /\p{Mark}/u.test(char) || cp === 0xfe0f || cp === 0xfe0e || (cp >= 0x1f3fb && cp <= 0x1f3ff) || cp === 0x200d;
    const previous = result[result.length - 1];
    if (previous && (extending || previous.endsWith('\u200d') || (regional && regionalCount % 2 === 1))) result[result.length - 1] += char;
    else result.push(char);
    regionalCount = regional ? regionalCount + 1 : 0;
  }
  return result;
}

/** A pure privacy boundary: excluded fields never enter drawing content. Meal notes stay private. */
export function prepareShareCardContent(state, date, options = {}) {
  const day = parseDate(date);
  if (!day) throw new Error('请选择有效日期，再生成分享卡片。');
  const selected = { ...DEFAULTS, ...options };
  const diary = (state.diaries || []).find(entry => entry.date === date);
  const allMeals = (state.meals || []).filter(meal => meal.date === date);
  const excerptLength = 320;
  const diaryParts = selected.diary === true ? graphemes(String(diary?.text || '').trim()) : [];
  return {
    date,
    dateLabel: `${day.getFullYear()}年${day.getMonth() + 1}月${day.getDate()}日`,
    weekday: WEEKDAYS[day.getDay()],
    sections: ['breakfast', 'lunch', 'dinner', 'snack'].filter(slot => selected[slot === 'snack' ? 'snacks' : slot] === true).map(slot => ({
      slot, label: LABELS[slot],
      meals: allMeals.filter(meal => meal.slot === slot).map(meal => ({
        name: String(meal.name || ''), time: String(meal.time || ''), completed: meal.completed === true,
      })),
    })),
    mood: selected.mood === true ? String(diary?.mood || '').trim() : '',
    diary: diaryParts.slice(0, excerptLength).join('') + (diaryParts.length > excerptLength ? '…（日记摘录）' : ''),
    joy: selected.joy === true ? String(diary?.joy || '').trim() : '',
  };
}

/** Wrap text using the selected device font; hard newlines are retained. */
export function wrapCanvasText(context, text, maxWidth) {
  if (!(maxWidth > 0)) throw new Error('图片文字宽度无效。');
  const lines = [];
  for (const paragraph of String(text).replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const part of graphemes(paragraph)) {
      if (line && context.measureText(line + part).width > maxWidth) { lines.push(line); line = ''; }
      line += part;
    }
    lines.push(line);
  }
  return lines;
}

function setFont(context, size, weight = '400') { context.font = `${weight} ${size}px ${FONT}`; }
function rounded(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y); context.lineTo(x + width - r, y); context.quadraticCurveTo(x + width, y, x + width, y + r);
  context.lineTo(x + width, y + height - r); context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  context.lineTo(x + r, y + height); context.quadraticCurveTo(x, y + height, x, y + height - r);
  context.lineTo(x, y + r); context.quadraticCurveTo(x, y, x + r, y); context.closePath();
}
function strawberry(context, x, y, size) {
  context.save(); context.translate(x, y); context.scale(size / 40, size / 40);
  context.fillStyle = '#eaa0ab'; context.strokeStyle = '#af6c71'; context.lineWidth = 1.5;
  context.beginPath(); context.moveTo(0, -11); context.bezierCurveTo(-29, -26, -22, 8, 0, 25); context.bezierCurveTo(22, 8, 29, -26, 0, -11); context.fill(); context.stroke();
  context.fillStyle = '#c5c49e'; context.beginPath(); context.moveTo(0, -9); context.lineTo(-14, -17); context.lineTo(-5, -18); context.lineTo(-3, -26); context.lineTo(4, -18); context.lineTo(14, -17); context.closePath(); context.fill();
  context.fillStyle = '#fff6dc';
  for (const [sx, sy] of [[-9, -4], [7, -5], [-11, 4], [1, 4], [9, 6], [-3, 14]]) { context.beginPath(); context.ellipse(sx, sy, 1.1, 2, -0.2, 0, Math.PI * 2); context.fill(); }
  context.restore();
}
function milk(context, x, y) {
  context.save(); context.translate(x, y); context.rotate(0.07);
  context.lineWidth = 1.8; context.strokeStyle = '#bd9280'; context.fillStyle = '#fffbef';
  context.beginPath(); context.moveTo(-26, -34); context.lineTo(-14, -53); context.lineTo(15, -53); context.lineTo(28, -34); context.lineTo(28, 39); context.lineTo(-26, 39); context.closePath(); context.fill(); context.stroke();
  context.fillStyle = '#f3c8ce'; context.fillRect(-25, -31, 52, 53);
  context.strokeStyle = '#d09fa1'; context.beginPath(); context.moveTo(-26, -34); context.lineTo(28, -34); context.moveTo(-14, -53); context.lineTo(-14, -35); context.stroke();
  strawberry(context, 1, -4, 26);
  setFont(context, 10, '600'); context.fillStyle = '#926f60'; context.textAlign = 'center'; context.fillText('MILK', 1, 33);
  context.restore();
}

function planLayout(context, content) {
  const blocks = [];
  let y = 213;
  for (const section of content.sections) {
    const rows = [];
    let height = 52;
    for (const meal of section.meals) {
      setFont(context, 22, '600');
      const lines = wrapCanvasText(context, meal.name, 438);
      rows.push({ ...meal, lines, y: height });
      height += lines.length * 32 + 28 + 12;
    }
    if (!rows.length) height += 40;
    blocks.push({ kind: 'meals', ...section, rows, y, height });
    y += height + 18;
  }
  for (const [key, label] of [['mood', '今日心情'], ['joy', '今日小确幸'], ['diary', '今日日记']]) {
    if (!content[key]) continue;
    setFont(context, 18);
    const lines = wrapCanvasText(context, content[key], 468);
    const height = 56 + lines.length * 29;
    blocks.push({ kind: 'text', key, label, lines, y, height });
    y += height + 18;
  }
  if (!blocks.length) {
    blocks.push({ kind: 'text', label: '给今天留一页小纸条', lines: ['留白也很好，慢慢写下喜欢的日常。'], y, height: 98 });
    y += 116;
  }
  const height = Math.max(800, y + 115);
  if (Math.ceil(height * SCALE) > MAX_PIXEL_HEIGHT) throw new Error('这一天的内容太长，暂时无法放进一张图片。请取消部分分享内容后再试；餐食没有被截掉。');
  return { blocks, height };
}

function drawCard(context, content, layout) {
  context.textBaseline = 'top';
  context.fillStyle = '#fff5f3'; context.fillRect(0, 0, WIDTH, layout.height);
  context.fillStyle = '#fffcf2'; rounded(context, 22, 23, 556, layout.height - 46, 10); context.fill();
  context.strokeStyle = '#f2e6d9'; context.lineWidth = 1;
  for (let y = 45; y < layout.height - 25; y += 26) { context.beginPath(); context.moveTo(32, y); context.lineTo(568, y); context.stroke(); }
  context.save(); context.translate(381, 39); context.rotate(-0.04); context.fillStyle = 'rgba(239,185,190,.68)'; context.fillRect(-37, -10, 90, 23); context.restore();
  setFont(context, 32, '700'); context.fillStyle = '#926c59'; context.fillText('机智定食', 48, 55);
  setFont(context, 12, '500'); context.fillStyle = '#bd8d8d'; context.fillText('STRAWBERRY MILK · MY LITTLE JOURNAL', 50, 102);
  setFont(context, 26, '600'); context.fillStyle = '#9b735e'; context.fillText(content.dateLabel, 48, 134);
  setFont(context, 15); context.fillStyle = '#b08777'; context.fillText(`${content.weekday}  ·  把每天，都安排得甜一点 ♡`, 50, 173);
  milk(context, 504, 104); strawberry(context, 545, 172, 33);
  for (const block of layout.blocks) {
    context.fillStyle = block.kind === 'meals' && block.slot === 'snack' ? '#fff0f1' : '#fffdf8';
    rounded(context, 40, block.y, 520, block.height, 12); context.fill(); context.strokeStyle = '#ead6c9'; context.lineWidth = 1; context.stroke();
    context.fillStyle = '#c48b8e'; context.fillRect(58, block.y + 20, 4, 18);
    setFont(context, 17, '600'); context.fillStyle = '#a07866'; context.fillText(block.label, 72, block.y + 18);
    if (block.kind === 'meals') {
      if (!block.rows.length) { setFont(context, 15); context.fillStyle = '#b49c8b'; context.fillText('给这餐留一处小空白 ♡', 65, block.y + 53); }
      for (const row of block.rows) {
        let rowY = block.y + row.y;
        setFont(context, 22, '600'); context.fillStyle = '#8e6956';
        for (const line of row.lines) { context.fillText(line, 65, rowY); rowY += 32; }
        setFont(context, 12); context.fillStyle = '#ba8d8c'; context.fillText([row.time, row.completed ? '好好吃过啦' : '今天的小计划'].filter(Boolean).join(' · '), 66, rowY + 2);
      }
    } else {
      setFont(context, 18); context.fillStyle = '#967360';
      block.lines.forEach((line, index) => context.fillText(line, 65, block.y + 52 + index * 29));
    }
  }
  const footerY = layout.height - 78;
  strawberry(context, 191, footerY + 15, 22);
  setFont(context, 14); context.fillStyle = '#ad8375'; context.textAlign = 'center'; context.fillText('好好吃饭，好好生活 ♡', 323, footerY + 6);
  setFont(context, 10); context.fillStyle = '#c19f94'; context.fillText('我的私人生活手账 · 机智定食', 300, footerY + 34); context.textAlign = 'left';
}

/** Generate an actual, local PNG; no external images or private fields are fetched. */
export async function generateShareCard(state, date, options = {}) {
  const content = prepareShareCardContent(state, date, options);
  if (typeof document === 'undefined') throw new Error('请在浏览器中生成分享卡片。');
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas');
  let context = canvas.getContext('2d');
  if (!context) throw new Error('此浏览器暂时无法生成图片。请用 Safari 重新打开。');
  const layout = planLayout(context, content);
  canvas.width = Math.round(WIDTH * SCALE); canvas.height = Math.ceil(layout.height * SCALE);
  context = canvas.getContext('2d');
  context.scale(SCALE, SCALE);
  drawCard(context, content, layout);
  const blob = await new Promise((resolve, reject) => canvas.toBlob(result => result ? resolve(result) : reject(new Error('图片没有生成成功，请再试一次。')), 'image/png'));
  const result = { blob, filename: `机智定食-${date}.png`, width: canvas.width, height: canvas.height };
  // Release the large pixel buffer after the independent PNG blob is ready.
  canvas.width = 1; canvas.height = 1;
  return result;
}

/** Call from a fresh button gesture AFTER generation, so iOS retains share permission. */
export async function shareImageFile(blob, filename) {
  if (typeof navigator === 'undefined' || typeof File === 'undefined' || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function') return 'unsupported';
  const file = new File([blob], filename, { type: 'image/png' });
  let supported;
  try { supported = navigator.canShare({ files: [file] }); } catch { return 'unsupported'; }
  if (!supported) return 'unsupported';
  try { await navigator.share({ files: [file] }); return 'shared'; }
  catch (error) { if (error?.name === 'AbortError') return 'cancelled'; throw error; }
}
