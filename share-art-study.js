/* Original study stationery. Only the prepared, privacy-filtered text is drawn. */
const BODY_FONT = '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", "Apple Color Emoji", "Segoe UI Emoji", sans-serif';

export const NOTEBOOK_THEME = Object.freeze({
  bg: '#F1EAFB', paper: '#FFFDF1', ink: '#65546F', muted: '#9D879F',
  accent: '#BEA6DB', line: '#D9C8E5', tape: '#E0CAE9',
  titleFont: '"Kaiti SC", "KaiTi", "Noto Serif CJK SC", "Songti SC", Georgia, serif',
  bodyFont: BODY_FONT,
});

export const LIBRARY_THEME = Object.freeze({
  bg: '#F5EADD', paper: '#FFFAE9', ink: '#735A50', muted: '#A08472',
  accent: '#D89BA6', line: '#DEC7B0', tape: '#CBE0CB',
  titleFont: '"Noto Serif CJK SC", "Songti SC", "SimSun", Georgia, serif',
  bodyFont: BODY_FONT,
});

const array = value => Array.isArray(value) ? value : [];
const safeTilt = (angle, h, s) => Math.sign(angle) * Math.min(Math.abs(angle), Math.atan(4 * s / Math.max(h, 1)) * 180 / Math.PI);
function paperRow(row, d, duration = false) {
  let meta = String(row.meta || '');
  // Only remove generated metadata already printed on this same piece of paper.
  if (duration && row.minutesKnown) {
    const suffix = ` · ${row.minutes} 分钟`;
    if (meta.endsWith(suffix)) meta = meta.slice(0, -suffix.length);
  }
  if (!d.isRange) {
    const parts = meta.split(' · ');
    if (/^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日$/.test(parts[0] || '')) parts.shift();
    meta = parts.join(' · ');
  }
  return {...row, meta};
}
const diaryRows = d => array(d.lifeRows).length ? d.lifeRows.map(row => paperRow(row, d)) : d.caption ? [{title: '页角小记', meta: '', note: d.caption}] : [];
const totalLabel = (d, kind) => {
  const days = d.counts?.[kind + 'Days'] ?? 0, minutes = d.counts?.[kind + 'Minutes'];
  return [`${days} 天的学习小积累`, ...(Number(minutes) > 0 ? [`已填 ${minutes} 分钟`] : [])].join('  ·  ');
};

function memoPlan(p, row, width, s, t) {
  const stamp = row.title === '心情'
    && /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200D\uFE0F]*$/u.test(String(row.note || '').trim())
    && [...new Intl.Segmenter('zh', {granularity: 'grapheme'}).segment(String(row.note).trim())].length <= 2;
  if (stamp) width = Math.min(width, 110 * s);
  const titleO = {size: 13 * s, lineHeight: 20 * s, weight: '700', color: t.muted, ...(stamp ? {align: 'center'} : {})};
  const metaO = {size: 13 * s, lineHeight: 20 * s, color: t.muted};
  const noteO = {size: (stamp ? 26 : 18) * s, lineHeight: (stamp ? 32 : 27) * s, color: t.ink, font: 'title', ...(stamp ? {align: 'center'} : {})};
  const textW = width - 32 * s;
  return {row, width, textW, titleO, metaO, noteO, stamp,
    height: (stamp ? 22 : 26) * s + p.measure(row.title || '', textW, titleO)
      + (row.meta ? p.measure(row.meta, textW, metaO) + 6 * s : 0)
      + (row.note ? p.measure(row.note, textW, noteO) + (stamp ? 5 : 8) * s : 0)};
}

function drawMemo(p, plan, x, y, s, t, index = 0) {
  const {row, width, height, textW, titleO, metaO, noteO, stamp} = plan;
  const mood = row.title === '心情', joy = row.title === '小确幸';
  const fill = mood ? '#FDEAF0' : joy ? '#FFF0C5' : '#FFF4E4';
  const edge = mood ? '#EAC2D0' : joy ? '#E8D5A4' : '#E8CEB6';
  p.group(x, y, width, height, safeTilt(index % 2 ? .65 : -.45, height, s), () => {
    p.rect(0, 0, width, height, {fill, stroke: edge, radius: 3 * s, shadow: true});
    if (stamp) p.rect(5 * s, 5 * s, width - 10 * s, height - 10 * s, {stroke: edge, dash: [2 * s, 3 * s], radius: 2 * s});
    else p.rect(0, 0, 5 * s, height, {fill: mood ? '#E8ABC1' : joy ? '#EBD392' : '#E1BBA7', radius: 2 * s});
    let ty = (stamp ? 11 : 13) * s;
    ty += p.text(row.title || '', 16 * s, ty, textW, titleO);
    if (row.meta) ty += 6 * s + p.text(row.meta, 16 * s, ty + 6 * s, textW, metaO);
    if (row.note) p.text(row.note, 16 * s, ty + (stamp ? 5 : 8) * s, textW, noteO);
  });
  const tapeW = (stamp ? 34 : 62) * s;
  p.tape(x + width / 2 - tapeW / 2, y - 6 * s, tapeW, {fill: index % 2 ? '#CAE0CB' : '#E3C8E8', angle: index % 2 ? 3 : -3});
}

function planMemos(p, d, x, width, y, s, t) {
  const records = diaryRows(d), plans = [], gap = 17 * s, columnW = (width - gap) / 2;
  const small = row => ['心情', '小确幸'].includes(row.title);
  for (let i = 0; i < records.length;) {
    const a = memoPlan(p, records[i], columnW, s, t);
    const b = records[i + 1] && memoPlan(p, records[i + 1], columnW, s, t);
    if (b && small(a.row) && small(b.row) && a.height <= 205 * s && b.height <= 205 * s) {
      // A mood stamp keeps its compact width. Its neighbour receives the spare
      // space instead of stretching the stamp to the diary's row dimensions.
      const rightX = x + a.width + gap;
      const right = a.stamp ? memoPlan(p, b.row, width - a.width - gap, s, t) : b;
      plans.push({...a, x, y, index: i}, {...right, x: rightX, y: y + 4 * s, index: i + 1});
      y += Math.max(a.height, right.height + 4 * s) + 19 * s;
      i += 2;
    } else {
      const plan = memoPlan(p, records[i], width, s, t);
      plans.push({...plan, x, y, index: i});
      y += plan.height + 19 * s;
      i++;
    }
  }
  return {plans, end: y};
}

function footer(p, t, x, y, width, s, text) {
  p.line(x, y, x + width, y, {color: t.line, dash: [3 * s, 5 * s]});
  p.text(text, x + 2 * s, y + 16 * s, width - 185 * s,
    {size: 14 * s, lineHeight: 21 * s, font: 'title', color: t.ink});
  p.text('机智定食  ·  PRIVATE LITTLE JOURNAL', x + 2 * s, y + 44 * s, width - 185 * s,
    {size: 9 * s, lineHeight: 15 * s, color: t.muted});
  for (let i = 0; i < 3; i++) {
    const sx = x + width - 164 * s + i * 57 * s;
    p.circle(sx + 20 * s, y + 36 * s, 24 * s, {fill: ['#F5E7F8', '#FBE2EB', '#EDF3DE'][i]});
    // Slots stay in page coordinates: the user's actual sticker choice is preserved.
    p.slot(sx, y + 16 * s, 41 * s);
  }
}

/** Lavender chapter notes, a margin index, and softly tilted diary scraps. */
export function drawNotebook(p, d, t = NOTEBOOK_THEME) {
  const w = p.width, s = Math.min(1.3, w / 600);
  const x = 76 * s, inner = w - x - 39 * s, gap = 18 * s;
  const studies = array(d.studies).map(row => paperRow(row, d, true));
  const headingO = {size: 36 * s, lineHeight: 48 * s, font: 'title', weight: '700', color: '#765F91'};
  const dateO = {size: 16 * s, lineHeight: 24 * s, weight: '600', color: '#977B9B'};
  const headingH = p.measure('自习室笔记', inner - 100 * s, headingO);
  const titleY = 69 * s, dateY = titleY + headingH + 31 * s;
  const dateH = p.measure(d.dateLabel || '', inner - 28 * s, dateO);
  const statsY = dateY + dateH + 23 * s;
  const statsO = {size: 15 * s, lineHeight: 23 * s, weight: '600', color: '#917BA6'};
  const stats = totalLabel(d, 'study'), statsH = p.measure(stats, inner - 42 * s, statsO) + 24 * s;
  const startY = statsY + statsH + 29 * s;
  const titleO = {size: 22 * s, lineHeight: 31 * s, weight: '600', font: 'title', color: t.ink};
  const metaO = {size: 14 * s, lineHeight: 21 * s, color: t.muted};
  const noteO = {size: 18 * s, lineHeight: 27 * s, color: t.ink};
  const chapter = (row, width, index) => ({row, width, index,
    height: 55 * s + p.measure(row.title || '', width - 32 * s, titleO)
      + (row.meta ? p.measure(row.meta, width - 32 * s, metaO) + 7 * s : 0)
      + (row.note ? p.measure(row.note, width - 32 * s, noteO) + 12 * s : 0)});
  const blocks = [];
  let cursor = startY;
  const columns = inner >= 435 * s && studies.length > 1 ? 2 : 1;
  const colW = columns === 2 ? (inner - gap) / 2 : inner;
  const lanes = [cursor, cursor];
  studies.forEach((row, index) => {
    const small = chapter(row, colW, index);
    if (columns === 2 && small.height < 320 * s) {
      const lane = lanes[0] <= lanes[1] ? 0 : 1;
      blocks.push({...small, x: x + lane * (colW + gap), y: lanes[lane]});
      lanes[lane] += small.height + 22 * s;
    } else {
      const block = chapter(row, inner, index), y = Math.max(...lanes);
      blocks.push({...block, x, y});
      lanes.fill(y + block.height + 22 * s);
    }
  });
  cursor = Math.max(...lanes);
  if (!studies.length) cursor += 72 * s;
  const memoLayout = planMemos(p, d, x, inner, cursor + 5 * s, s, t);
  const memoBlocks = memoLayout.plans;
  cursor = memoLayout.end;
  const contentH = cursor + 88 * s, height = Math.max(contentH, p.frameHeight || 0), footerY = height - 82 * s;

  p.rect(0, 0, w, height, {fill: t.bg});
  p.dots(10 * s, 8 * s, w, height, {color: '#DACCE8', step: 19 * s, radius: 1.1 * s});
  p.rect(29 * s, 21 * s, w - 52 * s, height - 41 * s, {fill: '#DBCEE9', radius: 7 * s});
  p.rect(24 * s, 17 * s, w - 52 * s, height - 41 * s, {fill: t.paper, stroke: '#D8C3E2', radius: 7 * s, shadow: true});
  p.rect(32 * s, 25 * s, 30 * s, height - 60 * s, {fill: '#F2E7F4', radius: 3 * s});
  p.line(66 * s, 32 * s, 66 * s, height - 31 * s, {color: '#E8BACA', width: 1.1 * s});
  for (let y = 79 * s; y < height - 51 * s; y += 71 * s) {
    p.circle(47 * s, y, 5 * s, {fill: '#D7C1E2', stroke: '#BEA9CB', width: .8 * s});
    p.circle(47 * s, y - .6 * s, 3.4 * s, {fill: '#FAF3F8'});
  }
  // The notebook's graph ruling is quiet enough to remain paper, not a chart.
  for (let gx = x - 3 * s; gx < w - 34 * s; gx += 23 * s) p.line(gx, 31 * s, gx, footerY - 14 * s, {color: '#F0EBE2', width: .55 * s});
  for (let gy = 35 * s; gy < footerY - 14 * s; gy += 23 * s) p.line(x - 3 * s, gy, w - 34 * s, gy, {color: '#EEE6E8', width: .65 * s});
  p.tape(x + 12 * s, 19 * s, 91 * s, {fill: '#C9DDCD', angle: -4});
  p.text('机智定食  /  LITTLE STUDY ROOM', x, 42 * s, inner - 80 * s, {size: 10.5 * s, lineHeight: 17 * s, weight: '600', color: '#AB86A8'});
  p.text('自习室笔记', x, titleY, inner - 100 * s, headingO);
  p.text('认真一点点，也甜甜地记下来 ♡', x + 2 * s, titleY + headingH + 5 * s, inner - 98 * s,
    {size: 12.5 * s, lineHeight: 19 * s, font: 'title', color: '#AB879B'});
  p.art('study-pencil', w - 121 * s, 46 * s, 72 * s, 98 * s);
  p.art('study-clip', w - 83 * s, 20 * s, 27 * s, 44 * s);
  p.rect(x - 2 * s, dateY - 5 * s, inner + 2 * s, dateH + 13 * s, {fill: '#F8E2EE', radius: 3 * s});
  p.text(d.dateLabel || '', x + 12 * s, dateY + 1 * s, inner - 28 * s, dateO);
  p.rect(x + 3 * s, statsY, inner - 6 * s, statsH, {fill: '#EEE8F9', stroke: '#DFD0EC', radius: 5 * s});
  p.text(stats, x + 21 * s, statsY + 12 * s, inner - 42 * s, statsO);
  p.art('study-spark', x - 16 * s, statsY + 12 * s, 26 * s, 29 * s);

  for (const block of blocks) {
    const {row, width: pw, height: ph, index} = block;
    p.group(block.x, block.y, pw, ph, safeTilt(index % 2 ? .55 : -.55, ph, s), () => {
      p.rect(0, 0, pw, ph, {fill: index % 2 ? '#FFF5DA' : '#FAF6FF', stroke: index % 2 ? '#E7D8AE' : '#DCCCE9', radius: 3 * s, shadow: true});
      for (let ly = 68 * s; ly < ph - 13 * s; ly += 27 * s) p.line(13 * s, ly, pw - 13 * s, ly, {color: index % 2 ? '#F0E5C5' : '#EBE0F1', width: .8 * s});
      p.rect(13 * s, 12 * s, 34 * s, 23 * s, {fill: index % 2 ? '#F7E5B6' : '#E4D2F0', radius: 3 * s});
      p.text(String(index + 1).padStart(2, '0'), 15 * s, 14 * s, 30 * s, {size: 13 * s, lineHeight: 19 * s, weight: '700', align: 'center', color: '#9C7B9D'});
      p.text(row.minutesKnown ? `${row.minutes} 分钟` : '学习小记', 55 * s, 15 * s, pw - 70 * s,
        {size: 12 * s, lineHeight: 18 * s, color: '#AC8A9F', align: 'right'});
      let ty = 41 * s;
      ty += p.text(row.title || '', 16 * s, ty, pw - 32 * s, titleO);
      if (row.meta) ty += 7 * s + p.text(row.meta, 16 * s, ty + 7 * s, pw - 32 * s, metaO);
      if (row.note) {
        ty += 12 * s;
        p.line(16 * s, ty - 4 * s, 57 * s, ty - 4 * s, {color: index % 2 ? '#E4C992' : '#C7AEDC', width: 2 * s});
        p.text(row.note, 16 * s, ty, pw - 32 * s, noteO);
      }
    });
    p.tape(block.x + pw / 2 - 29 * s, block.y - 6 * s, 58 * s, {fill: index % 2 ? '#D0DDBE' : '#EDC2D7', angle: index % 2 ? 3 : -2});
  }
  if (!studies.length) {
    p.art('study-book', x + 7 * s, startY + 8 * s, 51 * s, 49 * s);
    p.text('留一页，给慢慢来的自己。', x + 77 * s, startY + 15 * s, inner - 95 * s, {size: 19 * s, lineHeight: 29 * s, font: 'title', color: t.ink});
  }
  memoBlocks.forEach(plan => drawMemo(p, plan, plan.x, plan.y, s, t, plan.index));
  footer(p, t, x, footerY, inner, s, '今天又学到一点点啦 (˶ᵔ ᵕ ᵔ˶)');
  return height;
}

/** An actual-content index card: no invented titles, dates, or borrowing status. */
export function drawLibrary(p, d, t = LIBRARY_THEME) {
  const w = p.width, s = Math.min(1.3, w / 600), x = 44 * s, inner = w - 88 * s;
  const studies = array(d.studies).map(row => paperRow(row, d, true));
  const headingO = {size: 36 * s, lineHeight: 47 * s, weight: '700', font: 'title', color: '#84605E'};
  const dateO = {size: 16 * s, lineHeight: 24 * s, weight: '600', color: '#AA7779'};
  const titleH = p.measure('图书借阅卡', inner - 112 * s, headingO);
  const dateY = 74 * s + titleH + 25 * s;
  const dateH = p.measure(d.dateLabel || '', inner - 26 * s, dateO);
  const statsY = dateY + dateH + 28 * s;
  const metricO = {size: 15 * s, lineHeight: 23 * s, color: '#8B8F70', weight: '600'};
  const metric = totalLabel(d, 'study'), metricH = p.measure(metric, inner - 34 * s, metricO) + 23 * s;
  const tableY = statsY + metricH + 21 * s, tableStart = tableY + 35 * s;
  const numberW = 46 * s, minutesW = 72 * s, textW = inner - numberW - minutesW - 28 * s;
  const titleO = {size: 21 * s, lineHeight: 30 * s, weight: '600', font: 'title', color: t.ink};
  const metaO = {size: 13.5 * s, lineHeight: 21 * s, color: t.muted};
  const noteO = {size: 17 * s, lineHeight: 26 * s, color: t.ink};
  const blocks = [];
  let cursor = tableStart;
  studies.forEach((row, index) => {
    // Only the actual duration stamp sets a lower bound, never an empty row.
    const height = Math.max((row.minutesKnown ? 84 : 60) * s, 32 * s + p.measure(row.title || '', textW, titleO)
      + (row.meta ? p.measure(row.meta, textW, metaO) + 7 * s : 0)
      + (row.note ? p.measure(row.note, textW, noteO) + 10 * s : 0));
    blocks.push({row, index, y: cursor, height});
    cursor += height;
  });
  if (!studies.length) cursor += 59 * s;
  const tableEnd = cursor;
  cursor += 29 * s;
  const memoLayout = planMemos(p, d, x + 3 * s, inner - 6 * s, cursor, s, t);
  const memos = memoLayout.plans;
  cursor = memoLayout.end;
  const height = Math.max(cursor + 96 * s, p.frameHeight || 0), footerY = height - 83 * s;

  p.rect(0, 0, w, height, {fill: t.bg});
  p.dots(7 * s, 7 * s, w, height, {color: '#E5C9C0', step: 19 * s, radius: 1 * s});
  // Two offset index sheets make a little file, rather than a table on a webpage.
  p.rect(29 * s, 34 * s, w - 55 * s, height - 58 * s, {fill: '#DDE8D1', stroke: '#BDCCA9', radius: 4 * s});
  p.rect(23 * s, 29 * s, w - 55 * s, height - 57 * s, {fill: t.paper, stroke: '#DBBFAA', radius: 4 * s, shadow: true});
  p.rect(x, 18 * s, 136 * s, 27 * s, {fill: '#E6B9C2', stroke: '#C6919A', radius: 4 * s});
  p.text('学习生活 · 索引卡', x + 9 * s, 23 * s, 118 * s, {size: 12 * s, lineHeight: 18 * s, weight: '700', align: 'center', color: '#996873'});
  p.tape(w - 179 * s, 24 * s, 94 * s, {fill: '#E8D4A5', angle: 4});
  for (let cx = x + 17 * s; cx < w - x; cx += 47 * s) p.circle(cx, 48 * s, 2.5 * s, {fill: '#E8D8C5'});
  p.text('机智定食  /  MY LITTLE LIBRARY', x, 54 * s, inner - 98 * s, {size: 10 * s, lineHeight: 16 * s, weight: '600', color: '#B79181'});
  p.text('图书借阅卡', x, 76 * s, inner - 112 * s, headingO);
  p.text('给读过、学过的小片段，一个索引。', x + 2 * s, 77 * s + titleH + 5 * s, inner - 95 * s,
    {size: 12 * s, lineHeight: 18 * s, color: '#AA8A76', font: 'title'});
  p.art('study-book', w - 132 * s, 57 * s, 92 * s, 87 * s);
  p.rect(x - 1 * s, dateY - 1 * s, inner + 2 * s, dateH + 19 * s, {stroke: '#DDB3B8', fill: '#FBEDE6', radius: 2 * s});
  p.rect(x + 4 * s, dateY + 4 * s, inner - 8 * s, dateH + 9 * s, {stroke: '#E6C2BD', radius: 1 * s, dash: [2 * s, 4 * s]});
  p.text(d.dateLabel || '', x + 13 * s, dateY + 8 * s, inner - 26 * s, dateO);
  p.rect(x, statsY, inner, metricH, {fill: '#EDF2DF', stroke: '#D1DDBE', radius: 3 * s});
  p.text(metric, x + 17 * s, statsY + 11 * s, inner - 34 * s, metricO);
  p.rect(x, tableY, inner, 35 * s, {fill: '#EFE0C7', stroke: '#D8BEA0'});
  p.text('索引', x + 4 * s, tableY + 8 * s, numberW - 8 * s, {size: 11 * s, lineHeight: 17 * s, align: 'center', color: '#9F8065'});
  p.text('学习内容 / 摘记', x + numberW + 13 * s, tableY + 8 * s, textW, {size: 12 * s, lineHeight: 18 * s, weight: '600', color: '#957763'});
  p.text('时长', w - x - minutesW, tableY + 8 * s, minutesW, {size: 11 * s, lineHeight: 17 * s, align: 'center', color: '#9F8065'});
  blocks.forEach(({row, index, y, height: rh}) => {
    p.rect(x, y, inner, rh, {fill: index % 2 ? '#FFF4DE' : '#FFFBEE', stroke: '#DCC4A9'});
    p.line(x + numberW, y, x + numberW, y + rh, {color: '#DDC5AE'});
    p.line(w - x - minutesW, y, w - x - minutesW, y + rh, {color: '#DDC5AE'});
    p.text(String(index + 1).padStart(2, '0'), x + 4 * s, y + 19 * s, numberW - 8 * s,
      {size: 17 * s, lineHeight: 25 * s, font: 'title', color: '#B28881', align: 'center'});
    let ty = y + 16 * s;
    ty += p.text(row.title || '', x + numberW + 13 * s, ty, textW, titleO);
    if (row.meta) ty += 7 * s + p.text(row.meta, x + numberW + 13 * s, ty + 7 * s, textW, metaO);
    if (row.note) {
      ty += 10 * s;
      p.text(row.note, x + numberW + 13 * s, ty, textW, noteO);
    }
    const durationX = w - x - minutesW + 5 * s;
    p.rect(durationX, y + 17 * s, minutesW - 10 * s, row.minutesKnown ? 55 * s : 31 * s, {stroke: '#CEA2A8', radius: 3 * s});
    p.text(row.minutesKnown ? String(row.minutes) : '已记录', durationX + 3 * s, y + 22 * s, minutesW - 16 * s,
      {size: (row.minutesKnown ? 23 : 12) * s, lineHeight: (row.minutesKnown ? 29 : 19) * s, font: 'title', weight: '600', color: '#B07385', align: 'center'});
    if (row.minutesKnown) p.text('分钟', durationX + 3 * s, y + 51 * s, minutesW - 16 * s, {size: 9 * s, lineHeight: 14 * s, color: '#BD9297', align: 'center'});
  });
  if (!studies.length) {
    p.rect(x, tableStart, inner, 59 * s, {fill: '#FFFAE9', stroke: '#DCC4A9'});
    p.text('这一格，留给下一次的小收获。', x + 24 * s, tableStart + 16 * s, inner - 48 * s, {size: 18 * s, lineHeight: 27 * s, color: t.muted, font: 'title'});
  }
  // The closing stamp describes a real saved record, never a fictitious loan.
  p.text('学习内容登记  /  PERSONAL INDEX', x + 2 * s, tableEnd + 8 * s, inner, {size: 9 * s, lineHeight: 14 * s, color: '#B29682', align: 'right'});
  memos.forEach(plan => drawMemo(p, plan, plan.x, plan.y, s, t, plan.index));
  footer(p, t, x, footerY, inner, s, '把今天，夹在喜欢的书页里 ♡');
  return height;
}
