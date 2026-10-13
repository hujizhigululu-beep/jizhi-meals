/* A wall of little, real activities: SVG medals + fully measured paper tags. */
export const BADGES_THEME = Object.freeze({
  bg: '#ffe8ef', paper: '#fffdf3', ink: '#684d58', muted: '#9a7681',
  accent: '#f29fbd', line: '#dfbcc8', tape: '#bfe2ce',
  titleFont: '"Songti SC", "Noto Serif CJK SC", Georgia, serif',
  bodyFont: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
});

const COLORS = [
  { art: 'badges-rose-medal', paper: '#fff1f5', edge: '#e9b1c5', ink: '#b75e83', tape: '#f4bcd0' },
  { art: 'badges-mint-medal', paper: '#eff8ed', edge: '#b7d4bd', ink: '#5d8b73', tape: '#c7e4cb' },
  { art: 'badges-lilac-medal', paper: '#f6f0fc', edge: '#d2bfe7', ink: '#8f71af', tape: '#decbed' },
  { art: 'badges-lemon-medal', paper: '#fff9df', edge: '#dfd29b', ink: '#9c8143', tape: '#f3e5a4' },
];

/** Every field enters p.text, never SVG markup, HTML, or an interpolated asset URL. */
export function drawBadges(p, d, t = BADGES_THEME) {
  const w = p.width, s = Math.min(1.35, w / 600);
  const m = 38 * s, inner = w - m * 2, gap = 22 * s;
  // The same day and the medal's minutes are already visible elsewhere. Only
  // known generated metadata is omitted; unexpected plain-text metadata stays.
  const records = (Array.isArray(d.exercises) ? d.exercises : []).map(row => {
    let meta = String(row.meta || '');
    const minutesSuffix = row.minutesKnown ? ` · ${row.minutes} 分钟` : '';
    if (minutesSuffix && meta.endsWith(minutesSuffix)) meta = meta.slice(0, -minutesSuffix.length);
    if (!d.isRange && /^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日$/.test(meta)) meta = '';
    return { ...row, meta };
  });
  const selectedStickers = Array.isArray(d.stickerIds) ? d.stickerIds.length : 0;
  const titleO = { size: 23 * s, lineHeight: 31 * s, weight: '700', color: t.ink };
  const metaO = { size: 15 * s, lineHeight: 22 * s, color: t.muted };
  const noteO = { size: 18 * s, lineHeight: 27 * s, color: t.ink };
  const dateO = { size: 17 * s, lineHeight: 25 * s, color: '#966d7b' };
  const dateH = p.measure(d.dateLabel, inner - 36 * s, dateO);
  const headerH = 152 * s + dateH;
  const gridY = headerH + 32 * s;
  const columns = w >= 1100 && records.length >= 4 ? 3 : 2;
  const cardW = (inner - (columns - 1) * gap) / columns;
  const plans = [];
  let cursor = gridY;

  const plan = (row, index, width, horizontal) => {
    const compact = horizontal && !row.minutesKnown && !row.note && !row.meta
      && p.measure(row.title, width - 166 * s, titleO) <= 62 * s;
    const textW = width - (horizontal ? (compact ? 166 : 197) * s : 36 * s);
    const titleH = p.measure(row.title, textW, titleO);
    const metaH = p.measure(row.meta, textW, metaO);
    const noteH = p.measure(row.note, textW, noteO);
    const textH = titleH + (metaH ? 7 * s + metaH : 0) + (noteH ? 11 * s + noteH : 0);
    return { row, index, width, horizontal, compact, textW,
      height: horizontal ? Math.max((compact ? 140 : 174) * s, textH + 54 * s) : 157 * s + textH + 24 * s };
  };
  for (let i = 0; i < records.length;) {
    const remaining = records.length - i;
    if (remaining === 1) {
      const item = plan(records[i], i, inner, true);
      plans.push({ ...item, x: m, y: cursor });
      cursor += item.height + 22 * s;
      i++;
    } else {
      const rowItems = records.slice(i, i + Math.min(columns, remaining)).map((row, offset) => plan(row, i + offset, cardW, false));
      const rowH = Math.max(...rowItems.map(item => item.height));
      rowItems.forEach((item, offset) => plans.push({ ...item, x: m + offset * (cardW + gap), y: cursor, height: rowH }));
      cursor += rowH + 22 * s;
      i += rowItems.length;
    }
  }
  if (!records.length) cursor += 158 * s;
  const boardEnd = cursor - 6 * s;
  const lifeRows = Array.isArray(d.lifeRows) ? d.lifeRows : (d.caption ? [{ title: '小故事', note: d.caption, meta: '' }] : []);
  const lifePlans = [];
  if (lifeRows.length) cursor += 20 * s;
  for (const row of lifeRows) {
    const kind = row.title === '心情' ? 'mood' : row.title === '小确幸' ? 'joy' : 'story';
    const bodyO = kind === 'story'
      ? { size: 19 * s, lineHeight: 29 * s, color: '#806673', font: 'title' }
      : { size: 18 * s, lineHeight: 27 * s, color: kind === 'mood' ? '#6e8c77' : '#907853' };
    const textW = inner - (kind === 'story' ? 44 : 116) * s;
    const noteH = p.measure(row.note, textW, bodyO);
    const metaH = d.isRange ? p.measure(row.meta, textW, metaO) : 0;
    const panelH = (kind === 'story' ? 65 : 26) * s + noteH + (metaH ? metaH + 5 * s : 0);
    lifePlans.push({ row, kind, y: cursor, height: panelH, bodyO, textW, metaH });
    cursor += panelH + 13 * s;
  }
  const footerY = cursor + 9 * s;
  const height = footerY + 87 * s;

  // Pink woven cover, cream frame, and a little mint pegboard.
  p.rect(0, 0, w, height, { fill: t.bg });
  p.dots(12 * s, 10 * s, w - 24 * s, height - 20 * s, { color: '#edb5c8', step: 17 * s, radius: 1.2 * s });
  p.rect(22 * s, 24 * s, w - 44 * s, height - 46 * s, { fill: t.paper, stroke: '#e9b8c8', width: 1.5 * s, radius: 22 * s, shadow: true });
  p.rect(29 * s, 31 * s, w - 58 * s, height - 60 * s, { stroke: '#f0d2dc', radius: 18 * s, dash: [3 * s, 4 * s] });
  p.tape(w / 2 - 45 * s, 18 * s, 90 * s, { fill: '#f4bfd0', angle: -3 });
  p.text('机智定食  /  LITTLE ENERGY CLUB', m + 4 * s, 47 * s, inner - 104 * s,
    { size: 12 * s, lineHeight: 19 * s, weight: '600', color: '#a9798b' });
  p.text('小小活力 · 收集板', m + 2 * s, 77 * s, inner - 95 * s,
    { size: 33 * s, lineHeight: 43 * s, weight: '700', font: 'title', color: '#87586d' });
  const stats = [`记录了 ${d.counts?.exerciseDays ?? 0} 天运动`, ...(Number(d.counts?.exerciseMinutes) > 0 ? [`已填 ${d.counts.exerciseMinutes} 分钟`] : [])].join('  ·  ');
  p.text(stats, m + 4 * s, 125 * s, inner - 74 * s,
    { size: 15 * s, lineHeight: 23 * s, color: '#ad7e8e' });
  p.text(d.dateLabel, m + 4 * s, 154 * s, inner - 36 * s, dateO);
  if (!selectedStickers) p.art('badges-sneaker', w - m - 88 * s, 60 * s, 93 * s, 84 * s);
  p.slot(w - m - 79 * s, 61 * s, 76 * s);

  p.rect(m - 11 * s, gridY - 13 * s, inner + 22 * s, boardEnd - gridY + 24 * s,
    { fill: '#f4f3e5', stroke: '#dad3b9', width: 1.1 * s, radius: 12 * s });
  p.dots(m - 1 * s, gridY - 4 * s, inner, boardEnd - gridY + 4 * s,
    { color: '#d8d1bc', step: 19 * s, radius: 1.3 * s });
  for (const x of [m - 2 * s, w - m + 2 * s]) {
    for (const y of [gridY - 4 * s, boardEnd + 2 * s]) {
      p.circle(x, y, 3.6 * s, { fill: '#fff9ec', stroke: '#cfc5a9', width: 1 * s });
      p.line(x - 2 * s, y, x + 2 * s, y, { color: '#cfc5a9', width: 1 * s });
    }
  }

  const drawDuration = (row, x, y, width, compact = false) => {
    const number = row.minutesKnown ? String(row.minutes) : '已记录';
    p.text(number, x, y, width, { size: (compact ? 14 : row.minutesKnown ? 28 : 18) * s, lineHeight: (compact ? 22 : 33) * s, weight: '700', align: 'center', color: '#795e6c', font: 'title' });
    p.text(row.minutesKnown ? '分钟' : '动一动', x, y + (compact ? 22 : 32) * s, width,
      { size: (compact ? 10 : 11) * s, lineHeight: (compact ? 15 : 17) * s, weight: '600', align: 'center', color: '#997786' });
  };

  plans.forEach(item => {
    const { row, index, width: pw, height: ph, horizontal, compact, textW } = item;
    const c = COLORS[index % COLORS.length];
    const tilt = Math.min(1.05, Math.atan(5 * s / ph) * 180 / Math.PI);
    p.group(item.x, item.y, pw, ph, index % 2 ? tilt : -tilt, () => {
      if (horizontal) {
        p.rect(0, 5 * s, pw, ph - 5 * s, { fill: c.paper, stroke: c.edge, radius: 14 * s, shadow: true });
        p.rect(7 * s, 12 * s, pw - 14 * s, ph - 19 * s, { stroke: c.edge, radius: 10 * s, dash: [3 * s, 4 * s] });
        p.art(c.art, (compact ? 16 : 9) * s, (compact ? 12 : 9) * s, (compact ? 110 : 147) * s, (compact ? 110 : 147) * s);
        drawDuration(row, (compact ? 40 : 43) * s, (compact ? 42 : 48) * s, (compact ? 62 : 80) * s, compact);
        const dividerX = (compact ? 133 : 158) * s, textX = (compact ? 145 : 175) * s;
        p.line(dividerX, 24 * s, dividerX, ph - 20 * s, { color: c.edge, dash: [3 * s, 4 * s] });
        let ty = compact ? (ph - p.measure(row.title, textW, titleO)) / 2 : 26 * s;
        ty += p.text(row.title, textX, ty, textW, titleO);
        if (row.meta) ty += 7 * s + p.text(row.meta, textX, ty + 7 * s, textW, metaO);
        if (row.note) p.text(row.note, textX, ty + 11 * s, textW, noteO);
        p.tape(pw - 74 * s, -2 * s, 60 * s, { fill: c.tape, angle: 5 });
      } else {
        p.rect(0, 45 * s, pw, ph - 45 * s, { fill: c.paper, stroke: c.edge, radius: 14 * s, shadow: true });
        p.rect(7 * s, 53 * s, pw - 14 * s, ph - 61 * s, { stroke: c.edge, radius: 10 * s, dash: [3 * s, 4 * s] });
        p.art(c.art, pw / 2 - 78 * s, 0, 156 * s, 156 * s);
        drawDuration(row, pw / 2 - 43 * s, 42 * s, 86 * s);
        p.circle(pw / 2, 4 * s, 4 * s, { fill: '#eadcc4', stroke: '#c8b392', width: 1 * s });
        p.text(String(index + 1).padStart(2, '0'), pw - 40 * s, 64 * s, 23 * s,
          { size: 12 * s, lineHeight: 18 * s, weight: '700', align: 'center', color: c.ink });
        let ty = 157 * s;
        ty += p.text(row.title, 18 * s, ty, textW, titleO);
        if (row.meta) ty += 7 * s + p.text(row.meta, 18 * s, ty + 7 * s, textW, metaO);
        if (row.note) p.text(row.note, 18 * s, ty + 11 * s, textW, noteO);
      }
    });
  });

  if (!records.length) {
    p.art('badges-sneaker', m + 20 * s, gridY + 23 * s, 97 * s, 88 * s);
    p.text('先留一枚小小空位', m + 137 * s, gridY + 39 * s, inner - 157 * s,
      { size: 23 * s, lineHeight: 31 * s, weight: '700', color: '#88667a' });
    p.text('想动的时候，再慢慢记下。', m + 137 * s, gridY + 78 * s, inner - 157 * s,
      { size: 16 * s, lineHeight: 25 * s, color: t.muted });
  }

  lifePlans.forEach(({ row, kind, y, height: ph, bodyO, textW, metaH }) => {
    if (kind === 'story') {
      p.rect(m, y, inner, ph, { fill: '#fff1f5', stroke: '#edc4d4', radius: 8 * s, shadow: true });
      p.line(m + 15 * s, y + 11 * s, m + 15 * s, y + ph - 12 * s, { color: '#f1bfd2', width: 1 * s });
      for (let ly = y + 71 * s; ly < y + ph - 13 * s; ly += 29 * s) p.line(m + 22 * s, ly, w - m - 22 * s, ly, { color: '#f4dce6', width: .7 * s });
      p.tape(m + 21 * s, y - 6 * s, 55 * s, { fill: '#d4dfed', angle: -4 });
      p.art('badges-envelope', w - m - 72 * s, y + 8 * s, 55 * s, 35 * s);
      p.text(row.title === '小故事' ? '留在信纸上的小故事' : row.title, m + 25 * s, y + 18 * s, inner - 115 * s,
        { size: 14 * s, lineHeight: 22 * s, weight: '600', color: '#b47a94' });
      let ty = y + 48 * s;
      if (metaH) ty += p.text(row.meta, m + 22 * s, ty, textW, metaO) + 5 * s;
      p.text(row.note, m + 22 * s, ty, textW, bodyO);
    } else {
      const isMood = kind === 'mood', x = m + (isMood ? 0 : 6) * s;
      const pw = inner - (isMood ? 0 : 6) * s;
      p.rect(x, y, pw, ph, { fill: isMood ? '#eff6ec' : '#fff9e6', stroke: isMood ? '#d1dfc9' : '#e7dabb', radius: isMood ? 15 * s : 4 * s });
      p.line(x + 91 * s, y + 11 * s, x + 91 * s, y + ph - 11 * s, { color: isMood ? '#c9dac1' : '#e4d8b8', dash: [2 * s, 3 * s] });
      p.text(isMood ? '♡  心情' : '✧  小确幸', x + 15 * s, y + 14 * s, 70 * s,
        { size: 13 * s, lineHeight: 22 * s, weight: '600', color: isMood ? '#83a078' : '#b2945f' });
      let ty = y + 13 * s;
      ty += p.text(row.note, x + 102 * s, ty, textW, bodyO);
      if (metaH) p.text(row.meta, x + 102 * s, ty + 5 * s, textW, metaO);
    }
  });
  p.line(m + 4 * s, footerY + 2 * s, w - m - 156 * s, footerY + 2 * s,
    { color: '#dfbac6', dash: [3 * s, 4 * s] });
  p.text('今天也有好好生活呀', m + 4 * s, footerY + 14 * s, inner - 150 * s,
    { size: 17 * s, lineHeight: 25 * s, font: 'title', color: '#9c6a80' });
  p.text('(˶ᵔ ᵕ ᵔ˶)  ·  机智定食', m + 4 * s, footerY + 43 * s, inner - 150 * s,
    { size: 13 * s, lineHeight: 22 * s, color: '#b18495' });
  if (selectedStickers < 2) p.art('badges-bow-pin', w - m - 107 * s, footerY + 10 * s, 72 * s, 62 * s);
  p.slot(w - m - 134 * s, footerY + 7 * s, 55 * s);
  p.slot(w - m - 62 * s, footerY + 7 * s, 55 * s);
  return height;
}
