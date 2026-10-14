/* Two paper compositions. Prepared sharing data remains read-only; all
 * personal words enter the painter's plain Canvas text operation. */
const BODY_FONT = '"PingFang SC", "Noto Sans CJK SC", -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif';
export const CAFE_THEME = Object.freeze({
  bg: '#ffebee', paper: '#fffdf1', ink: '#775649', muted: '#a18174',
  accent: '#eda4b8', line: '#e6c5b1', tape: '#f5cd94',
  titleFont: '"Songti SC", "Noto Serif CJK SC", Georgia, serif', bodyFont: BODY_FONT,
});
export const TICKET_THEME = Object.freeze({
  bg: '#fce5ed', paper: '#fffdf2', ink: '#567267', muted: '#829588',
  accent: '#aaceba', line: '#c6d9c5', tape: '#f2bfd0',
  titleFont: 'Georgia, "Songti SC", "Noto Serif CJK SC", serif', bodyFont: BODY_FONT,
});

const mealMeta = (row, isRange) => isRange ? String(row.meta || '')
  : String(row.meta || '').split(' · ')
    .filter((part, index) => !(index === 0 && /^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日$/.test(part)) && part !== row.groupLabel)
    .join(' · ');
function exerciseMeta(row, isRange) {
  let meta = String(row.meta || '');
  const suffix = row.minutesKnown ? ` · ${row.minutes} 分钟` : '';
  if (suffix && meta.endsWith(suffix)) meta = meta.slice(0, -suffix.length);
  if (!isRange && /^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日$/.test(meta)) meta = '';
  return meta;
}
const lifeRows = d => Array.isArray(d.lifeRows) && d.lifeRows.length
  ? d.lifeRows.filter(row => row.note)
  : d.caption ? [{ title: '小故事', meta: '', note: d.caption }] : [];
const tilt = (angle, height, s) => Math.sign(angle)
  * Math.min(Math.abs(angle), Math.atan(5 * s / Math.max(1, height)) * 180 / Math.PI);

/** A little cream cafe: an illustrated feature plate, printed menu sections,
 * small serrated order slips and a personal note held by washi. */
export function drawCafe(p, d, t = CAFE_THEME) {
  const w = p.width, s = Math.min(1.35, w / 600);
  const m = 43 * s, inner = w - 2 * m, gap = 17 * s;
  const records = Array.isArray(d.meals) ? d.meals : [];
  const main = records[0], remaining = records.slice(1);
  const titleO = { size: 29 * s, lineHeight: 39 * s, weight: '700', font: 'title', color: t.ink };
  const rowO = { size: 22 * s, lineHeight: 31 * s, weight: '600', color: t.ink };
  const metaO = { size: 14 * s, lineHeight: 21 * s, color: t.muted };
  const noteO = { size: 18 * s, lineHeight: 28 * s, color: t.ink };
  const dateO = { size: 17 * s, lineHeight: 26 * s, weight: '600', color: '#9b7067', align: 'center' };
  const dateH = p.measure(d.dateLabel || '', inner - 42 * s, dateO);
  const startY = 205 * s + dateH;
  const featureW = inner - 164 * s;
  const featureTextH = main ? p.measure(main.title || '', featureW, titleO)
    + (mealMeta(main, d.isRange) ? 8 * s + p.measure(mealMeta(main, d.isRange), featureW, metaO) : 0) : 57 * s;
  const mainNoteH = main?.note ? p.measure(main.note, inner - 38 * s, noteO) + 16 * s : 0;
  // The illustration reserves just its own height; a one-line meal need not
  // fill the much taller feature plate used by the original composition.
  const featureTop = 54 * s, featureArtH = 76 * s;
  const mainH = featureTop + Math.max(featureTextH, featureArtH) + mainNoteH + 16 * s;
  const groups = [];
  for (const record of remaining) {
    const label = record.groupLabel || '餐食小记';
    let group = groups.find(item => item.label === label);
    if (!group) { group = { label, rows: [] }; groups.push(group); }
    group.rows.push(record);
  }
  const panelPlans = [];
  let cursor = startY + mainH + 22 * s;
  const panelHeight = (group, width) => 65 * s + group.rows.reduce((total, row, index) => total
    + p.measure(row.title || '', width - 34 * s, rowO)
    + (mealMeta(row, d.isRange) ? 6 * s + p.measure(mealMeta(row, d.isRange), width - 34 * s, metaO) : 0)
    + (row.note ? 9 * s + p.measure(row.note, width - 34 * s, noteO) : 0)
    + (index ? 20 * s : 0), 0) + 15 * s;
  for (let i = 0; i < groups.length; i += 2) {
    const pair = groups.slice(i, i + 2), cw = pair.length > 1 ? (inner - gap) / 2 : inner;
    const measured = pair.map(group => ({ group, height: panelHeight(group, cw) }));
    const pairH = Math.max(...measured.map(item => item.height));
    measured.forEach((item, index) => panelPlans.push({ ...item, width: cw, x: m + index * (cw + gap), y: cursor + index * 5 * s }));
    cursor += pairH + (pair.length > 1 ? 5 * s : 0) + 19 * s;
  }
  const notes = lifeRows(d);
  const lifePlans = [];
  const lifeW = inner - 42 * s;
  let notesHeight = notes.length ? 43 * s : 0;
  for (const row of notes) {
    const metaH = d.isRange && row.meta ? p.measure(row.meta, lifeW, metaO) + 6 * s : 0;
    const noteH = p.measure(row.note, lifeW, noteO);
    const height = 26 * s + metaH + noteH + 17 * s;
    lifePlans.push({ row, y: notesHeight, metaH, height });
    notesHeight += height;
  }
  if (notesHeight) notesHeight += 9 * s;
  const notesY = cursor;
  if (notesHeight) cursor += notesHeight + 22 * s;
  const footerY = cursor;
  const selected = Array.isArray(d.stickerIds) ? d.stickerIds.length : 0;
  const footerW = selected ? inner - 192 * s : inner - 108 * s;
  const footerO = { size: 15 * s, lineHeight: 23 * s, font: 'title', color: '#916b61' };
  const footerText = '每一顿的小滋味，都收好啦 ♡';
  const footerH = Math.max(96 * s, p.measure(footerText, footerW, footerO) + 52 * s);
  const height = Math.max(footerY + footerH + 24 * s, p.frameHeight || 0);

  p.rect(0, 0, w, height, { fill: t.bg });
  p.dots(9 * s, 11 * s, w, height, { color: '#eeb8c4', step: 20 * s, radius: 1.2 * s });
  p.rect(25 * s, 21 * s, w - 50 * s, height - 41 * s, { fill: t.paper, stroke: '#e7c6b4', radius: 18 * s, shadow: true });
  p.rect(33 * s, 29 * s, w - 66 * s, height - 57 * s, { stroke: '#e6c8a3', radius: 13 * s, dash: [2 * s, 4 * s] });
  p.art('cafe-awning', 35 * s, 32 * s, w - 70 * s, 34 * s);
  p.text('机智定食  /  THE CREAM CAFE', m + 5 * s, 78 * s, inner - 116 * s,
    { size: 11 * s, lineHeight: 17 * s, weight: '600', color: '#b58478' });
  p.text('奶油早餐店', m + 4 * s, 104 * s, inner - 120 * s,
    { size: 36 * s, lineHeight: 45 * s, font: 'title', weight: '700', color: '#886252' });
  p.text('把日常，点成甜甜的一份 (˶ᵔ ᵕ ᵔ˶)', m + 5 * s, 153 * s, inner - 116 * s,
    { size: 12 * s, lineHeight: 19 * s, color: '#a98a76' });
  p.art('cafe-breakfast', w - m - 114 * s, 74 * s, 110 * s, 102 * s);
  p.rect(m + 7 * s, 182 * s, inner - 14 * s, dateH + 13 * s,
    { fill: '#fff2d7', stroke: '#e3c9a8', radius: 4 * s });
  p.text(d.dateLabel || '', m + 21 * s, 189 * s, inner - 42 * s, dateO);
  p.circle(m + 17 * s, 182 * s + (dateH + 13 * s) / 2, 2.1 * s, { fill: '#cda78c' });
  p.circle(w - m - 17 * s, 182 * s + (dateH + 13 * s) / 2, 2.1 * s, { fill: '#cda78c' });

  p.group(m, startY, inner, mainH, tilt(-.35, mainH, s), () => {
    p.rect(0, 0, inner, mainH, { fill: '#fff3ce', stroke: '#dabc92', radius: 8 * s, shadow: true });
    p.dots(11 * s, 10 * s, inner - 22 * s, 38 * s, { color: '#ecd4a9', step: 13 * s, radius: .9 * s });
    p.rect(16 * s, 16 * s, inner - 32 * s, 29 * s, { fill: '#fffbef', stroke: '#e6cda6', radius: 3 * s });
    p.text('MAIN PLATE  ·  ' + (main?.groupLabel || '餐桌小记'), 28 * s, 21 * s, inner - 56 * s,
      { size: 12 * s, lineHeight: 19 * s, weight: '700', color: '#ad8167' });
    let y = featureTop;
    if (main) {
      y += p.text(main.title || '', 19 * s, y, featureW, titleO);
      const meta = mealMeta(main, d.isRange);
      if (meta) y += 8 * s + p.text(meta, 19 * s, y + 8 * s, featureW, metaO);
    } else {
      p.text('这段日期还没有餐食记录', 19 * s, y, featureW,
        { size: 19 * s, lineHeight: 28 * s, color: t.muted });
    }
    p.art('cafe-place-setting', inner - 107 * s, 48 * s, 88 * s, featureArtH);
    if (main?.note) {
      y = featureTop + Math.max(featureTextH, featureArtH) + 10 * s;
      p.line(19 * s, y - 2 * s, inner - 19 * s, y - 2 * s, { color: '#e4c99c', dash: [2 * s, 5 * s] });
      p.text(main.note, 19 * s, y + 6 * s, inner - 38 * s, noteO);
    }
  });
  p.tape(m + inner / 2 - 39 * s, startY - 7 * s, 78 * s, { fill: '#f3b6c8', angle: -2 });

  const sections = { 早餐: ['MORNING', '#fff3d9'], 午餐: ['LUNCH', '#eef2df'], 晚餐: ['SUPPER', '#ffebea'], '零食 / 加餐': ['SWEET SIDE', '#f4edfa'] };
  for (const block of panelPlans) {
    const { group, width: cw, height: ch, x, y } = block;
    const [english, fill] = sections[group.label] || ['LITTLE ORDER', '#fff3d9'];
    p.group(x, y, cw, ch, tilt(x > m ? .65 : -.45, ch, s), () => {
      p.rect(0, 0, cw, ch, { fill: '#fffef8', stroke: '#dec7b4', radius: 3 * s, shadow: true });
      p.rect(0, 0, cw, 48 * s, { fill, radius: 3 * s });
      p.text(group.label, 17 * s, 10 * s, cw - 65 * s,
        { size: 19 * s, lineHeight: 27 * s, weight: '700', font: 'title', color: '#92675c' });
      p.text(english, 17 * s, 39 * s, cw - 34 * s,
        { size: 9 * s, lineHeight: 14 * s, weight: '700', color: '#b19884' });
      p.art('cafe-cutlery', cw - 47 * s, 7 * s, 30 * s, 37 * s);
      p.line(16 * s, 58 * s, cw - 16 * s, 58 * s, { color: '#e1cfba', dash: [3 * s, 4 * s] });
      let ry = 65 * s;
      group.rows.forEach((row, index) => {
        if (index) {
          p.line(17 * s, ry + 6 * s, cw - 17 * s, ry + 6 * s, { color: '#ead9cc', dash: [1 * s, 4 * s] });
          ry += 20 * s;
        }
        ry += p.text(row.title || '', 17 * s, ry, cw - 34 * s, rowO);
        const meta = mealMeta(row, d.isRange);
        if (meta) ry += 6 * s + p.text(meta, 17 * s, ry + 6 * s, cw - 34 * s, metaO);
        if (row.note) ry += 9 * s + p.text(row.note, 17 * s, ry + 9 * s, cw - 34 * s, noteO);
      });
      for (let sx = 5 * s; sx < cw - 4 * s; sx += 13 * s) {
        p.line(sx, ch, Math.min(sx + 6.5 * s, cw), ch - 6 * s, { color: '#dec7b4' });
        p.line(Math.min(sx + 6.5 * s, cw), ch - 6 * s, Math.min(sx + 13 * s, cw), ch, { color: '#dec7b4' });
      }
    });
  }
  if (notesHeight) {
    p.group(m + 2 * s, notesY, inner - 4 * s, notesHeight, tilt(.4, notesHeight, s), () => {
      const nw = inner - 4 * s;
      p.rect(0, 0, nw, notesHeight, { fill: '#fff8e5', stroke: '#e2cda9', radius: 3 * s, shadow: true });
      for (let ly = 70 * s; ly < notesHeight - 8 * s; ly += 28 * s) p.line(17 * s, ly, nw - 17 * s, ly, { color: '#f0e4ca' });
      p.text('给生活，留张小笺  /  CAFE NOTES', 21 * s, 16 * s, lifeW,
        { size: 12 * s, lineHeight: 19 * s, weight: '600', color: '#ad8d6d' });
      for (const item of lifePlans) {
        let y = item.y;
        p.text(item.row.title || '', 21 * s, y, lifeW, { size: 12 * s, lineHeight: 19 * s, weight: '700', color: '#b37d80' });
        y += 26 * s;
        if (item.metaH) y += p.text(item.row.meta, 21 * s, y, lifeW, metaO) + 6 * s;
        p.text(item.row.note, 21 * s, y, lifeW, noteO);
      }
    });
    p.tape(m + 26 * s, notesY - 7 * s, 67 * s, { fill: '#c7dccc', angle: 3 });
  }
  p.line(m, footerY + 7 * s, w - m, footerY + 7 * s, { color: '#dabc9e', dash: [3 * s, 5 * s] });
  p.text(footerText, m + 3 * s, footerY + 25 * s, footerW, footerO);
  p.text(`${d.counts?.mealCount ?? records.length} 份餐食小记  ·  ${d.counts?.mealDays ?? 0} 天生活`, m + 3 * s,
    footerY + 25 * s + p.measure(footerText, footerW, footerO) + 7 * s, footerW,
    { size: 11 * s, lineHeight: 18 * s, color: '#ad907c' });
  if (!selected) p.art('cafe-seal', w - m - 91 * s, footerY + 13 * s, 80 * s, 77 * s);
  for (let i = 0; i < 3; i++) {
    const x = w - m - 175 * s + i * 59 * s;
    if (i < selected) p.rect(x - 4 * s, footerY + 21 * s, 55 * s, 55 * s, { fill: '#fff9ef', stroke: '#e9cbbf', radius: 5 * s });
    p.slot(x, footerY + 25 * s, 47 * s);
  }
  return height;
}

/** A mint journey ticket. The dotted line links recorded activities, never
 * an invented distance, route, score or achievement. */
export function drawTicket(p, d, t = TICKET_THEME) {
  const w = p.width, s = Math.min(1.35, w / 600);
  const m = 54 * s, inner = w - 2 * m;
  const records = Array.isArray(d.exercises) ? d.exercises : [];
  const rowO = { size: 24 * s, lineHeight: 33 * s, weight: '600', color: t.ink };
  const metaO = { size: 14 * s, lineHeight: 22 * s, color: t.muted };
  const noteO = { size: 18 * s, lineHeight: 28 * s, color: '#697c71' };
  const dateO = { size: 17 * s, lineHeight: 26 * s, color: '#879585' };
  const dateH = p.measure(d.dateLabel || '', inner - 50 * s, dateO);
  const statsY = 172 * s + dateH;
  const hasMinutes = records.some(row => row.minutesKnown === true);
  const days = d.counts?.exerciseDays ?? 0;
  const minutes = d.counts?.exerciseMinutes ?? 0;
  const metricValueO = { size: 31 * s, lineHeight: 41 * s, weight: '700', font: 'title', color: '#618770', align: 'center' };
  const metricW = (inner - 30 * s) / 2;
  const minutesValue = hasMinutes ? String(minutes) : '随心记';
  const metricH = Math.max(p.measure(String(days), metricW - 24 * s, metricValueO), p.measure(minutesValue, metricW - 24 * s, metricValueO));
  const statsH = metricH + 42 * s;
  const routeY = statsY + statsH + 31 * s;
  const cardX = m + 67 * s, cardW = inner - 82 * s;
  const rowPlans = [];
  let cursor = routeY;
  records.forEach((row, index) => {
    const meta = exerciseMeta(row, d.isRange);
    const titleW = cardW - (row.minutesKnown ? 98 : 34) * s;
    const titleH = p.measure(row.title || '', titleW, rowO);
    const metaH = meta ? p.measure(meta, cardW - 34 * s, metaO) + 7 * s : 0;
    const noteH = row.note ? p.measure(row.note, cardW - 34 * s, noteO) + 11 * s : 0;
    const height = 18 * s + Math.max(titleH, row.minutesKnown ? 43 * s : 0) + metaH + noteH + 16 * s;
    rowPlans.push({ row, index, meta, titleW, titleH, height, y: cursor });
    cursor += height + 17 * s;
  });
  if (!records.length) cursor += 75 * s;
  const routeEnd = cursor;
  const notes = lifeRows(d);
  const lifePlans = [];
  const lifeW = inner - 42 * s;
  for (const row of notes) {
    const metaH = d.isRange && row.meta ? p.measure(row.meta, lifeW, metaO) + 5 * s : 0;
    const height = 38 * s + metaH + p.measure(row.note, lifeW, noteO) + 14 * s;
    lifePlans.push({ row, metaH, height, y: cursor + 14 * s });
    cursor += height + 28 * s;
  }
  const footerY = cursor + 9 * s;
  const selected = Array.isArray(d.stickerIds) ? d.stickerIds.length : 0;
  const footerW = inner - (selected ? 215 : 117) * s;
  const footerO = { size: 15 * s, lineHeight: 24 * s, font: 'title', color: '#688a73' };
  const footerText = '一点点活力，悄悄收进今天 ♡';
  const footerH = Math.max(106 * s, p.measure(footerText, footerW, footerO) + 56 * s);
  const height = Math.max(footerY + footerH + 31 * s, p.frameHeight || 0);

  p.rect(0, 0, w, height, { fill: t.bg });
  p.dots(11 * s, 10 * s, w - 22 * s, height - 20 * s, { color: '#eebaca', step: 20 * s, radius: 1.1 * s });
  p.rect(m + 5 * s, 24 * s, inner, height - 50 * s, { fill: '#edcbd3', radius: 10 * s });
  p.rect(m, 20 * s, inner, height - 50 * s, { fill: t.paper, stroke: '#bfcfbb', radius: 10 * s, shadow: true });
  p.rect(m + 7 * s, 27 * s, inner - 14 * s, height - 64 * s, { stroke: '#d9dfca', radius: 6 * s, dash: [2 * s, 4 * s] });
  // Ticket punches stay in the margin, away from every text column.
  for (let y = 49 * s; y < height - 51 * s; y += 29 * s) {
    p.circle(m + 2 * s, y, 3.5 * s, { fill: t.bg, stroke: '#d5c7be' });
    p.circle(w - m - 2 * s, y, 3.5 * s, { fill: t.bg, stroke: '#d5c7be' });
  }
  p.tape(m + inner / 2 - 44 * s, 16 * s, 88 * s, { fill: '#c5dfcb', angle: -2 });
  p.rect(m + 19 * s, 45 * s, 153 * s, 23 * s, { fill: '#f5d7e1', radius: 3 * s });
  p.text('机智定食  /  JOURNEY', m + 27 * s, 49 * s, 139 * s,
    { size: 10 * s, lineHeight: 16 * s, weight: '700', color: '#b2798b' });
  p.text('暴走小票', m + 22 * s, 84 * s, inner - 121 * s,
    { size: 41 * s, lineHeight: 50 * s, weight: '700', font: 'title', color: '#577866' });
  p.text('LITTLE ENERGY TRIP  ·  收集轻快日常', m + 24 * s, 137 * s, inner - 48 * s,
    { size: 11 * s, lineHeight: 18 * s, color: '#91a18e' });
  p.art('ticket-sneaker', w - m - 101 * s, 67 * s, 89 * s, 75 * s);
  p.text(d.dateLabel || '', m + 24 * s, 161 * s, inner - 50 * s, dateO);
  p.line(m + 17 * s, statsY - 8 * s, w - m - 17 * s, statsY - 8 * s, { color: '#c4d5bf', dash: [6 * s, 4 * s] });
  p.circle(m, statsY - 8 * s, 7 * s, { fill: t.bg, stroke: '#c5d4c0' });
  p.circle(w - m, statsY - 8 * s, 7 * s, { fill: t.bg, stroke: '#c5d4c0' });
  p.rect(m + 15 * s, statsY, inner - 30 * s, statsH, { fill: '#edf4df', stroke: '#d3dfbd', radius: 5 * s });
  p.line(m + inner / 2, statsY + 12 * s, m + inner / 2, statsY + statsH - 11 * s, { color: '#c8d7b8', dash: [2 * s, 5 * s] });
  p.text(String(days), m + 27 * s, statsY + 10 * s, metricW - 24 * s, metricValueO);
  p.text(minutesValue, m + 15 * s + metricW + 12 * s, statsY + 10 * s, metricW - 24 * s, metricValueO);
  p.text('动一动的日子', m + 20 * s, statsY + 15 * s + metricH, metricW - 10 * s,
    { size: 11 * s, lineHeight: 18 * s, color: '#879775', align: 'center' });
  p.text(hasMinutes ? '已填时长  /  MIN' : '时长可以留白', m + 15 * s + metricW + 5 * s,
    statsY + 15 * s + metricH, metricW - 10 * s,
    { size: 11 * s, lineHeight: 18 * s, color: '#879775', align: 'center' });
  const lineX = m + 40 * s;
  if (rowPlans.length) {
    const last = rowPlans.at(-1);
    p.line(lineX, routeY + 28 * s, lineX, last.y + 28 * s,
      { color: '#afc7b3', width: 2 * s, dash: [4 * s, 5 * s] });
    for (const item of rowPlans) {
      const { row, index, y, height: ch, titleW, titleH, meta } = item;
      const even = index % 2 === 0;
      p.group(m + 21 * s, y + 10 * s, 37 * s, 37 * s, even ? -3 : 3, () => {
        p.rect(0, 0, 37 * s, 37 * s, { fill: even ? '#f9dbe6' : '#e4efda', stroke: even ? '#d9aebb' : '#b7cba4', radius: 6 * s });
        p.rect(4 * s, 4 * s, 29 * s, 29 * s, { stroke: even ? '#e6bdcc' : '#c4d6b3', radius: 3 * s, dash: [1 * s, 2 * s] });
        p.text(String(index + 1).padStart(2, '0'), 4 * s, 8 * s, 29 * s,
          { size: 18 * s, lineHeight: 23 * s, weight: '700', font: 'title', color: even ? '#ae708a' : '#729262', align: 'center' });
      });
      p.line(lineX + 19 * s, y + 29 * s, cardX, y + 29 * s, { color: '#c0cbb7', dash: [2 * s, 3 * s] });
      p.rect(cardX, y, cardW, ch, { fill: even ? '#fff8ec' : '#f4f7ed', stroke: '#d1d9c2', radius: 6 * s, shadow: true });
      p.rect(cardX, y + 10 * s, 3 * s, ch - 20 * s, { fill: even ? '#e4b8c7' : '#b9d3af', radius: 1.5 * s });
      let ty = y + 18 * s;
      p.text(row.title || '', cardX + 17 * s, ty, titleW, rowO);
      if (row.minutesKnown) {
        const badgeX = cardX + cardW - 76 * s;
        p.rect(badgeX, y + 12 * s, 60 * s, 49 * s, { fill: '#f4dbe3', stroke: '#e2bac8', radius: 5 * s });
        p.text(String(row.minutes), badgeX + 5 * s, y + 17 * s, 50 * s,
          { size: 22 * s, lineHeight: 27 * s, font: 'title', weight: '700', color: '#aa6d87', align: 'center' });
        p.text('MIN', badgeX + 5 * s, y + 43 * s, 50 * s,
          { size: 9 * s, lineHeight: 13 * s, weight: '700', color: '#ba8f9e', align: 'center' });
      }
      ty += Math.max(titleH, row.minutesKnown ? 43 * s : 0);
      if (meta) ty += 7 * s + p.text(meta, cardX + 17 * s, ty + 7 * s, cardW - 34 * s, metaO);
      if (row.note) p.text(row.note, cardX + 17 * s, ty + 11 * s, cardW - 34 * s, noteO);
    }
    p.circle(lineX, routeEnd - 6 * s, 4 * s, { fill: '#f4bbce', stroke: '#bb899b' });
    p.line(lineX, last.y + 45 * s, lineX, routeEnd - 13 * s, { color: '#b8c9ae', dash: [3 * s, 5 * s] });
  } else {
    p.art('ticket-signpost', m + 27 * s, routeY + 2 * s, 45 * s, 60 * s);
    p.text('这段日期还没有运动打卡', m + 90 * s, routeY + 19 * s, inner - 115 * s, metaO);
  }
  for (const item of lifePlans) {
    const { row, y, height: ch, metaH } = item;
    p.group(m + 13 * s, y, inner - 26 * s, ch, tilt(-.45, ch, s), () => {
      const nw = inner - 26 * s;
      p.rect(0, 0, nw, ch, { fill: '#fff3dc', stroke: '#e0cd9e', radius: 2 * s, shadow: true });
      for (let ly = 63 * s; ly < ch - 9 * s; ly += 28 * s) p.line(8 * s, ly, nw - 8 * s, ly, { color: '#eaddbc' });
      p.text('ALONG THE DAY  ·  ' + (row.title || '沿途小记'), 8 * s, 15 * s, lifeW,
        { size: 11 * s, lineHeight: 18 * s, weight: '700', color: '#ae956d' });
      let ty = 38 * s;
      if (metaH) ty += p.text(row.meta, 8 * s, ty, lifeW, metaO) + 5 * s;
      p.text(row.note, 8 * s, ty, lifeW, noteO);
    });
    p.tape(m + 42 * s, y - 7 * s, 66 * s, { fill: '#d9cee9', angle: -2 });
  }
  p.line(m + 18 * s, footerY, w - m - 18 * s, footerY, { color: '#c4d0b6', dash: [5 * s, 5 * s] });
  p.text(footerText, m + 24 * s, footerY + 21 * s, footerW, footerO);
  p.text('机智定食  ·  沿途的小快乐', m + 24 * s,
    footerY + 21 * s + p.measure(footerText, footerW, footerO) + 9 * s, footerW,
    { size: 10 * s, lineHeight: 17 * s, color: '#a1a98e' });
  if (!selected) p.art('ticket-signpost', w - m - 85 * s, footerY + 17 * s, 58 * s, 78 * s);
  for (let i = 0; i < 3; i++) {
    const x = w - m - 171 * s + i * 54 * s;
    if (i < selected) p.rect(x - 3 * s, footerY + 21 * s, 51 * s, 51 * s, { fill: '#fff8ec', stroke: '#cad6bd', radius: 6 * s });
    p.slot(x, footerY + 24 * s, 45 * s);
  }
  return height;
}
