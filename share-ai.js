import { parseDate } from './model.js';
import { wrapCanvasText } from './share-card.js';

export const AI_SHARE_LABELS = Object.freeze({ meals: '餐食短评', exercise: '运动短评', study: '学习短评', inventory: '库存短评 · 生成时快照', letter: '日记回信' });
const TYPES = { meal: ['meals'], exercise: ['exercise'], study: ['study'], life: ['meals', 'exercise', 'study', 'letter'] };
const FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
const MAX_PIXEL_HEIGHT = 10000, MAX_PIXEL_AREA = 16000000, SCALE = 2;

/** Only saved, relevant content is offered. Prompt/record snapshots never enter sharing. */
export function listShareAIContent(state, { kind = 'life', start, end, inventoryAI = false } = {}) {
  const allowed = new Set(TYPES[kind] || []);
  if (kind === 'life' && inventoryAI === true) allowed.add('inventory');
  const entries = [...(Array.isArray(state.postOffice?.comments) ? state.postOffice.comments : []), ...(Array.isArray(state.postOffice?.letters) ? state.postOffice.letters : []).map(item => ({ ...item, type: 'letter' }))];
  return entries.filter(item => allowed.has(item.type) && typeof item.id === 'string' && typeof item.body === 'string' && item.body.trim()
    && (item.type === 'inventory' || Boolean(parseDate(item.date)) && item.date >= start && item.date <= end))
    .map(item => ({ id: item.id, type: item.type, date: item.date || '', characterId: item.characterId || '',
      characterName: typeof item.characterName === 'string' ? item.characterName : '草莓邮局', body: item.body,
      generatedAt: typeof item.generatedAt === 'string' ? item.generatedAt : '', avatarId: item.avatarId || '',
      avatarMode: item.avatarMode === 'circle' ? 'circle' : 'sticker', avatarFallback: item.avatarFallback || '', snapshotId: item.snapshotId || '' }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.generatedAt.localeCompare(b.generatedAt) || a.id.localeCompare(b.id));
}

/** Explicit IDs are the only way AI text can reach a generated picture. */
export function selectShareAIContent(state, settings) {
  const selected = new Set(Array.isArray(settings.aiIds) ? settings.aiIds.filter(id => typeof id === 'string') : []);
  return listShareAIContent(state, settings).filter(item => selected.has(item.id));
}

function rounded(context, x, y, width, height, radius) {
  context.beginPath(); context.moveTo(x + radius, y); context.lineTo(x + width - radius, y);
  context.quadraticCurveTo(x + width, y, x + width, y + radius); context.lineTo(x + width, y + height - radius);
  context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height); context.lineTo(x + radius, y + height);
  context.quadraticCurveTo(x, y + height, x, y + height - radius); context.lineTo(x, y + radius);
  context.quadraticCurveTo(x, y, x + radius, y); context.closePath();
}

/** Full text is measured before allocation; no excerpts or ellipses. */
export function planAIShareAppendix(context, entries, width) {
  if (!(width >= 300)) throw new Error('分享图片宽度不足，请选择竖版或分享长图。');
  const left = 118, right = 30, textWidth = width - left - right - 36;
  let y = 100;
  const rows = entries.map(entry => {
    context.font = `600 20px ${FONT}`;
    const title = `${entry.characterName} · ${AI_SHARE_LABELS[entry.type] || 'AI 手账'}`;
    const titleLines = wrapCanvasText(context, title, textWidth);
    const meta = entry.type === 'inventory' ? `${entry.generatedAt ? entry.generatedAt.slice(0, 10) : '库存'} · 已保存的库存快照` : entry.date;
    context.font = `18px ${FONT}`;
    const metaLines = wrapCanvasText(context, meta, textWidth);
    context.font = `21px ${FONT}`;
    const lines = wrapCanvasText(context, entry.body, textWidth);
    const height = Math.max(116, 40 + titleLines.length * 28 + metaLines.length * 24 + 12 + lines.length * 32);
    const row = { entry, y, height, title, titleLines, meta, metaLines, lines, left, textWidth };
    y += height + 30;
    return row;
  });
  return { rows, height: y + 16, width };
}

function loadLocalImage(source) {
  if (!/^data:image\/(?:png|webp|jpeg);base64,[A-Za-z0-9+/=]+$/.test(source)) throw new Error('头像图片格式不受支持，请重新上传头像后再分享。');
  return new Promise((resolve, reject) => {
    const image = new Image(); image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('头像没有加载成功，请重新上传或移除头像后再分享。'));
    image.src = source;
  });
}

function canvasBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('AI 分享图片没有生成成功，请减少内容后重试。')), 'image/png'));
}

function drawAppendix(context, plan, offset, avatars, fallback) {
  context.save(); context.translate(0, offset);
  context.fillStyle = '#fff7f9'; context.fillRect(0, 0, plan.width, plan.height);
  context.textBaseline = 'top'; context.textAlign = 'left'; context.fillStyle = '#976176'; context.font = `600 26px ${FONT}`;
  context.fillText('草莓邮局 · 我的 AI 手账', 30, 36);
  for (const row of plan.rows) {
    const { entry, y, height, left } = row;
    context.fillStyle = '#fffdf5'; context.strokeStyle = '#ebbacb'; context.lineWidth = 1.2;
    rounded(context, left, y, plan.width - left - 30, height, 15); context.fill(); context.stroke();
    context.save(); context.translate(left + 28, y - 7); context.rotate(-.04); context.globalAlpha = .72; context.fillStyle = '#f6d6e1'; context.fillRect(0, 0, 76, 16); context.restore();
    const image = avatars.get(entry.avatarId);
    const size = entry.type === 'letter' ? 82 : 68, x = (left - size) / 2, imageY = y + 8;
    if (image) {
      context.save();
      if (entry.avatarMode === 'circle') { context.beginPath(); context.arc(x + size / 2, imageY + size / 2, size / 2, 0, Math.PI * 2); context.clip(); }
      const fit = entry.avatarMode === 'circle' ? Math.max(size / image.naturalWidth, size / image.naturalHeight) : Math.min(size / image.naturalWidth, size / image.naturalHeight);
      const w = image.naturalWidth * fit, h = image.naturalHeight * fit;
      context.drawImage(image, x + (size - w) / 2, imageY + (size - h) / 2, w, h); context.restore();
    } else { context.font = `48px ${FONT}`; context.fillText(fallback(entry), x + 8, imageY + 5); }
    let cursor = y + 20;
    context.fillStyle = '#805569'; context.font = `600 20px ${FONT}`;
    for (const line of row.titleLines) { context.fillText(line, left + 18, cursor); cursor += 28; }
    context.fillStyle = '#ae8295'; context.font = `18px ${FONT}`;
    for (const line of row.metaLines) { context.fillText(line, left + 18, cursor); cursor += 24; }
    cursor += 12; context.fillStyle = '#66565a'; context.font = `21px ${FONT}`;
    for (const line of row.lines) { context.fillText(line, left + 18, cursor); cursor += 32; }
  }
  context.restore();
}

/** Untouched cards are returned as-is. Selected AI is appended at full readable size. */
export async function appendAIShareCard(card, entries, { format = 'long' } = {}) {
  if (!entries.length) return card;
  if (format === 'square') throw new Error('包含 AI 点评或回信时，请选择「分享长图」或「竖版卡片」，以完整保留正文。');
  if (typeof document === 'undefined') throw new Error('请在浏览器中生成分享图片。');
  if (document.fonts?.ready) await document.fonts.ready;
  const canvas = document.createElement('canvas'), context = canvas.getContext('2d');
  if (!context) throw new Error('此浏览器暂时无法生成图片，请使用 Safari 或 Chrome 重新打开。');
  const width = card ? card.width / SCALE : 600, offset = card ? card.height / SCALE : 0;
  const plan = planAIShareAppendix(context, entries, width), height = offset + plan.height;
  if (height * SCALE > MAX_PIXEL_HEIGHT || width * height * SCALE * SCALE > MAX_PIXEL_AREA) {
    throw new Error('所选 AI 内容过长，请取消部分来信或点评，或逐封分享；正文没有被截掉。');
  }
  const { getAvatarDataURL, avatarFallback } = await import('./ai-avatar.js');
  const ids = [...new Set(entries.map(entry => entry.avatarId).filter(Boolean))];
  const avatars = new Map(await Promise.all(ids.map(async id => [id, await loadLocalImage(await getAvatarDataURL(id))])));
  let source;
  try {
    if (card) source = await createImageBitmap(card.blob);
    canvas.width = width * SCALE; canvas.height = Math.ceil(height * SCALE);
    context.scale(SCALE, SCALE);
    if (source) context.drawImage(source, 0, 0, width, offset);
    drawAppendix(context, plan, offset, avatars, avatarFallback);
    const blob = await canvasBlob(canvas);
    return { ...(card || {}), blob, filename: card ? card.filename.replace(/\.png$/, '-含AI.png') : '机智定食-AI手账-分享长图.png',
      width: canvas.width, height: canvas.height, aiCount: entries.length,
      text: [...(card?.text || []), ...entries.flatMap(entry => [entry.characterName, entry.body])] };
  } finally { source?.close(); canvas.width = 1; canvas.height = 1; }
}
