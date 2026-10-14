/* A strawberry stationery spread. Drawing consumes only the prepared share data. */
export const STRAWBERRY_THEME = Object.freeze({
  bg: '#ffe8f0', paper: '#fffdf4', ink: '#71484f', muted: '#a3777d',
  accent: '#ee99b3', line: '#ebc2cc', tape: '#ffc4d7',
  titleFont: '"Songti SC", "SimSun", "Noto Serif CJK SC", Georgia, serif',
  bodyFont: '"PingFang SC", "Noto Sans CJK SC", -apple-system, "Apple Color Emoji", "Segoe UI Emoji", sans-serif'
});
const emojiMood = row => row.title === '心情' && Boolean(row.note?.trim())
  && [...row.note.trim()].length <= 16
  && /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f\s]+$/u.test(row.note.trim());

export function drawStrawberry(p, d, t = STRAWBERRY_THEME) {
  const w = p.width, s = Math.min(1.35, w / 600);
  const m = 48 * s, inner = w - 2 * m, gap = 18 * s;
  const rows = Array.isArray(d.meals) ? d.meals : [];
  const defs = [
    { label: '早餐', number: '01', color: '#fff4d8', art: 'strawberry-croissant', subtitle: '早安，小餐桌' },
    { label: '午餐', number: '02', color: '#f0f4df', art: 'strawberry-bento', subtitle: '午间的好滋味' },
    { label: '晚餐', number: '03', color: '#ffeaf0', art: 'strawberry-soup', subtitle: '把一天慢慢收好' },
    { label: '零食 / 加餐', number: '04', color: '#f0eafa', art: 'strawberry-pudding', subtitle: '日常里的甜一点' },
  ];
  const groups = defs.map(def => ({ ...def, rows: rows.filter(row => row.groupLabel === def.label) })).filter(group => group.rows.length);
  const others = rows.filter(row => !defs.some(def => def.label === row.groupLabel));
  if (others.length) groups.push({ label: '餐食小记', number: '♡', color: '#fff4d8', art: 'strawberry-croissant', subtitle: '记住这些好滋味', rows: others });
  const titleOpts = { size: 23 * s, lineHeight: 31 * s, weight: '600', color: t.ink };
  const metaOpts = { size: 15 * s, lineHeight: 22 * s, color: t.muted };
  const noteOpts = { size: 19 * s, lineHeight: 28 * s, color: t.ink };
  const captionOpts = { size: 20 * s, lineHeight: 30 * s, color: t.ink };
  const dateOpts = { size: 19 * s, weight: '600', lineHeight: 28 * s, color: '#946270' };
  // A single-day spread already names its date and meal categories in the page
  // furniture. Keep time/status on the little cards; ranges retain every date.
  const mealMeta = row => d.isRange ? (row.meta || '') : (row.meta || '').split(' · ').slice(1).filter(part => part !== row.groupLabel).join(' · ');
  const rowHeight = (row, width) => p.measure(row.title || '', width, titleOpts)
    + (mealMeta(row) ? 5 * s + p.measure(mealMeta(row), width, metaOpts) : 0)
    + (row.note ? 8 * s + p.measure(row.note, width, noteOpts) : 0);
  const compactPanel = (group, width) => group.rows.length === 1 && rowHeight(group.rows[0], width - 36 * s) <= 72 * s;
  const panelHeight = (group, width) => (compactPanel(group, width) ? 54 : 73) * s
    + group.rows.reduce((sum, row, index) => sum + rowHeight(row, width - 36 * s) + (index ? 19 * s : 0), 0)
    + (compactPanel(group, width) ? 16 : 20) * s;
  const dateHeight = p.measure(d.dateLabel || '', inner - 42 * s, dateOpts);
  const startY = 152 * s + dateHeight + 23 * s;
  const paperAngle = (angle, height) => Math.sign(angle) * Math.min(Math.abs(angle), Math.atan(7 * s / Math.max(1, height)) * 180 / Math.PI);
  const blocks = [];
  let cursor = startY;
  // Short notes keep separate heights; a long meal uses the whole sheet rather
  // than leaving a tall empty column beside its neighboring breakfast scrap.
  for (let i = 0; i < groups.length;) {
    const a = groups[i], b = groups[i + 1], cw = (inner - gap) / 2;
    const ah = panelHeight(a, cw);
    if (b && ah <= 300 * s && panelHeight(b, cw) <= 300 * s) {
      const bh = panelHeight(b, cw);
      blocks.push({ group: a, x: m, y: cursor, width: cw, height: ah, angle: i ? .65 : -.7 });
      blocks.push({ group: b, x: m + cw + gap, y: cursor + 7 * s, width: cw, height: bh, angle: i ? -.7 : .7 });
      cursor += Math.max(ah, bh + 7 * s) + 22 * s;
      i += 2;
    } else {
      const pw = ah > 300 * s ? inner : Math.min(inner, 330 * s), ph = panelHeight(a, pw);
      blocks.push({ group: a, x: m, y: cursor, width: pw, height: ph, angle: i ? .65 : -.7 });
      cursor += ph + 22 * s;
      i++;
    }
  }
  const emptyHeight = rows.length ? 0 : 144 * s;
  if (emptyHeight) cursor += emptyHeight + 22 * s;
  const lifeRows = Array.isArray(d.lifeRows) ? d.lifeRows.filter(row => row.note) : [];
  const littleRows = lifeRows.filter(row => row.title !== '小故事');
  const storyRows = lifeRows.filter(row => row.title === '小故事');
  const lifeMetaOpts = { size: 13 * s, lineHeight: 20 * s, color: '#ab8a7b' };
  const lifeWidth = (inner - 14 * s) / 2;
  const lifeNoteOpts = row => emojiMood(row) ? {...captionOpts, size: 29 * s, lineHeight: 38 * s, align: 'center'} : captionOpts;
  const lifeHeight = (row, width) => 36 * s + p.measure(row.note, width - 30 * s, lifeNoteOpts(row))
    + (d.isRange && row.meta ? p.measure(row.meta, width - 30 * s, lifeMetaOpts) + 6 * s : 0) + 17 * s;
  const littleBlocks = [];
  let lifeCursor = 0;
  for (let i = 0; i < littleRows.length; i += 2) {
    const a = littleRows[i], b = littleRows[i + 1], cw = b ? lifeWidth : Math.min(inner, 330 * s);
    const aw = emojiMood(a) ? Math.min(cw, 164 * s) : cw, ah = lifeHeight(a, aw);
    littleBlocks.push({ row: a, x: 0, y: lifeCursor, width: aw, height: ah, stamp: emojiMood(a) });
    if (b) {
      const bw = emojiMood(b) ? Math.min(cw, 164 * s) : cw, bh = lifeHeight(b, bw);
      littleBlocks.push({ row: b, x: cw + 14 * s, y: lifeCursor + 4 * s, width: bw, height: bh, stamp: emojiMood(b) });
      lifeCursor += Math.max(ah, bh + 4 * s) + 13 * s;
    } else lifeCursor += ah + 13 * s;
  }
  const storyBlocks = storyRows.map(row => {
    const height = lifeHeight(row, inner);
    const block = { row, y: lifeCursor, height };
    lifeCursor += height + 13 * s;
    return block;
  });
  // Older prepared objects can still carry just caption; render all of it.
  const legacyCaption = d.caption && !lifeRows.length ? d.caption : '';
  const captionHeight = lifeRows.length ? Math.max(0, lifeCursor - 13 * s)
    : legacyCaption ? 57 * s + p.measure(legacyCaption, inner - 40 * s, captionOpts) + 19 * s : 0;
  const captionY = cursor;
  if (captionHeight) cursor += captionHeight + 23 * s;
  const footerY = cursor;
  const stickerCount = Array.isArray(d.stickerIds) ? d.stickerIds.length : 0;
  const footerHeight = stickerCount ? 110 * s : 58 * s;
  const height = footerY + footerHeight + 30 * s;
  p.rect(0, 0, w, height, { fill: t.bg });
  p.dots(9 * s, 9 * s, w, height, { color: '#eeaec0', step: 19 * s });
  p.rect(30 * s, 19 * s, w - 51 * s, height - 40 * s, { fill: '#f4c9d6', radius: 15 * s });
  p.rect(25 * s, 15 * s, w - 51 * s, height - 40 * s, { fill: t.paper, stroke: '#e7b4c3', radius: 15 * s, shadow: true });
  // A stitched inner frame and small punched holes make this a stationery page.
  p.rect(39 * s, 28 * s, w - 79 * s, height - 67 * s, { stroke: '#f0d4d7', radius: 8 * s, dash: [3 * s, 5 * s] });
  for (let y = 74 * s; y < height - 48 * s; y += 69 * s) {
    p.circle(29 * s, y, 4.3 * s, { fill: '#edc0ce', stroke: '#d7a7b6' });
    p.circle(28 * s, y - .9 * s, 2.8 * s, { fill: '#fff6fa' });
  }
  // An editorial title, a real illustrated strawberry stamp, and a little washi tab.
  p.tape(m + 7 * s, 18 * s, 100 * s, { fill: '#f5afc6', angle: -3 });
  p.text('PRIVATE FOOD JOURNAL', m + 4 * s, 42 * s, inner - 105 * s,
    { size: 10.5 * s, lineHeight: 17 * s, weight: '700', color: '#af7283' });
  p.text('机智定食', m + 2 * s, 65 * s, inner - 117 * s,
    { size: 40 * s, lineHeight: 50 * s, weight: '700', font: 'title', color: '#834451' });
  p.text('好好吃饭，把日常收得甜甜一点 ♡', m + 4 * s, 117 * s, inner - 111 * s,
    { size: 13.5 * s, lineHeight: 21 * s, color: '#a4777b' });
  p.art('strawberry-stamp', w - m - 103 * s, 38 * s, 106 * s, 106 * s);
  p.rect(m, 148 * s, inner, dateHeight + 17 * s, { fill: '#fce0e8', radius: 5 * s });
  p.circle(m + 12 * s, 148 * s + (dateHeight + 17 * s) / 2, 2.3 * s, { fill: '#cc7f98' });
  p.text(d.dateLabel || '', m + 23 * s, 155 * s, inner - 42 * s, dateOpts);

  function renderPanel(block) {
    const { group, x, y, width: pw, height: ph, angle } = block;
    const compact = compactPanel(group, pw), headerH = (compact ? 42 : 60) * s;
    p.group(x, y, pw, ph, paperAngle(angle, ph), () => {
      const isEvening = group.label === '晚餐', isSnack = group.label === '零食 / 加餐';
      p.rect(0, 0, pw, ph, { fill: isEvening ? '#fff2f5' : isSnack ? '#fcf5ff' : '#fffef9', stroke: '#e8c5cb', radius: isSnack ? 3 * s : 7 * s, shadow: true });
      if (isEvening) {
        p.rect(6 * s, 7 * s, pw - 12 * s, ph - 14 * s, { stroke: '#ecc0cc', radius: 4 * s, dash: [2 * s, 4 * s] });
        p.rect(0, 6 * s, 4 * s, ph - 12 * s, { fill: '#eaa6bb', radius: 2 * s });
      } else {
        p.rect(0, 0, pw, headerH, { fill: group.color, radius: isSnack ? 3 * s : 7 * s });
        if (isSnack) p.dots(8 * s, 8 * s, pw - 16 * s, headerH - 12 * s, { color: '#dfc6e8', step: 14 * s });
      }
      // Paper folds and label tabs leave room for the actual meal, even when it is long.
      p.rect(11 * s, (compact ? 8 : 13) * s, 30 * s, (compact ? 26 : 29) * s, { fill: '#fffef9', stroke: '#e3c3c8', radius: 5 * s });
      p.text(group.number, 13 * s, (compact ? 10 : 17) * s, 26 * s,
        { size: 15 * s, lineHeight: 22 * s, font: 'title', weight: '700', color: '#bd7e90', align: 'center' });
      p.text(group.label, 50 * s, (compact ? 9 : 13) * s, pw - (compact ? 100 : 118) * s,
        { size: group.label === '零食 / 加餐' ? 16 * s : 18 * s, lineHeight: 24 * s, weight: '700', color: '#8c5966' });
      // The subtitle is fixed stationery copy, kept separate from the user record area.
      if (!compact) p.text(group.subtitle, 50 * s, 39 * s, pw - 106 * s,
        { size: 10 * s, lineHeight: 15 * s, color: '#a4807b' });
      p.art(group.art, pw - (compact ? 48 : 63) * s, (compact ? 0 : 5) * s, (compact ? 44 : 57) * s, (compact ? 44 : 57) * s);
      p.line(15 * s, headerH + (compact ? 0 : 1) * s, pw - 15 * s, headerH + (compact ? 0 : 1) * s, { color: '#edcdd3', dash: [3 * s, 4 * s] });
      let ry = (compact ? 54 : 73) * s;
      group.rows.forEach((row, index) => {
        if (index) {
          p.line(18 * s, ry + 4 * s, pw - 18 * s, ry + 4 * s, { color: '#f0d8dd', dash: [2 * s, 5 * s] });
          ry += 19 * s;
        }
        ry += p.text(row.title || '', 18 * s, ry, pw - 36 * s, titleOpts);
        if (mealMeta(row)) ry += 5 * s + p.text(mealMeta(row), 18 * s, ry + 5 * s, pw - 36 * s, metaOpts);
        if (row.note) ry += 8 * s + p.text(row.note, 18 * s, ry + 8 * s, pw - 36 * s, noteOpts);
      });
    });
    p.tape(x + pw / 2 - 34 * s, y - 7 * s, 68 * s, { fill: group.label === '午餐' ? '#cce1c4' : '#f8bfd0', angle: -angle * 3 });
  }
  blocks.forEach(renderPanel);
  if (emptyHeight) {
    const y = startY;
    p.rect(m, y, inner, emptyHeight, { fill: '#fff1dd', stroke: '#edd3bd', radius: 7 * s });
    p.art('strawberry-croissant', m + 13 * s, y + 21 * s, 93 * s, 93 * s);
    p.text('餐桌小记', m + 121 * s, y + 31 * s, inner - 138 * s, { size: 22 * s, lineHeight: 31 * s, weight: '600', color: t.ink });
    p.text('这段日期还没有餐食记录', m + 121 * s, y + 76 * s, inner - 138 * s, { size: 16 * s, lineHeight: 25 * s, color: t.muted });
  }
  for (const block of littleBlocks) {
    const { row, x, y, width: cw, height: ch, stamp } = block;
    p.group(m + x, captionY + y, cw, ch, paperAngle(x ? .6 : -.5, ch), () => {
      const mood = row.title === '心情';
      p.rect(0, 0, cw, ch, { fill: mood ? '#ffe1ed' : '#fff2cd', stroke: mood ? '#e6b4c6' : '#e6d1a5', radius: 4 * s, shadow: true });
      if (stamp) {
        for (let sy = 10 * s; sy < ch; sy += 14 * s) {
          p.circle(0, sy, 3 * s, {fill: t.paper});
          p.circle(cw, sy, 3 * s, {fill: t.paper});
        }
        p.rect(6 * s, 6 * s, cw - 12 * s, ch - 12 * s, {stroke: '#e6b4c6', radius: 2 * s});
      }
      p.text((mood ? '♡ ' : '✧ ') + row.title, 15 * s, 10 * s, cw - 30 * s, { size: 12 * s, lineHeight: 19 * s, weight: '700', color: mood ? '#b76b8a' : '#a58955' });
      let cy = 36 * s;
      if (d.isRange && row.meta) cy += p.text(row.meta, 15 * s, cy, cw - 30 * s, lifeMetaOpts) + 6 * s;
      p.text(row.note, 15 * s, cy, cw - 30 * s, lifeNoteOpts(row));
    });
  }
  for (const block of storyBlocks) {
    const { row, y, height: ch } = block;
    p.group(m + 2 * s, captionY + y, inner - 4 * s, ch, paperAngle(-.35, ch), () => {
      p.rect(0, 0, inner - 4 * s, ch, { fill: '#fff7df', stroke: '#e8d4ae', radius: 3 * s, shadow: true });
      for (let ly = 59 * s; ly < ch - 8 * s; ly += 30 * s) p.line(13 * s, ly, inner - 17 * s, ly, { color: '#efdfbe' });
      p.text('✎ ' + row.title, 15 * s, 10 * s, inner - 30 * s, { size: 12 * s, lineHeight: 19 * s, weight: '700', color: '#a58966' });
      let cy = 36 * s;
      if (d.isRange && row.meta) cy += p.text(row.meta, 15 * s, cy, inner - 30 * s, lifeMetaOpts) + 6 * s;
      p.text(row.note, 15 * s, cy, inner - 30 * s, captionOpts);
    });
    p.tape(m + inner - 98 * s, captionY + y - 7 * s, 67 * s, { fill: '#cddfc8', angle: 2 });
  }
  if (legacyCaption) {
    p.group(m + 3 * s, captionY, inner - 6 * s, captionHeight, paperAngle(-.45, captionHeight), () => {
      const cw = inner - 6 * s;
      p.rect(0, 0, cw, captionHeight, { fill: '#fff3cc', stroke: '#e8d4a4', radius: 3 * s, shadow: true });
      for (let ly = 52 * s; ly < captionHeight - 10 * s; ly += 30 * s) p.line(13 * s, ly, cw - 13 * s, ly, { color: '#efdfb5' });
      p.text('页角小记  /  LITTLE MOMENTS', 20 * s, 14 * s, cw - 40 * s,
        { size: 12 * s, lineHeight: 20 * s, weight: '700', color: '#a58259' });
      p.text(legacyCaption, 20 * s, 49 * s, inner - 40 * s, captionOpts);
    });
    p.tape(m + 32 * s, captionY - 8 * s, 72 * s, { fill: '#d9ddf1', angle: -3 });
  }
  p.line(m, footerY + 7 * s, w - m, footerY + 7 * s, { color: '#e9c6ce', dash: [2 * s, 5 * s] });
  p.text('把每一顿的小滋味收好 (˶ᵔ ᵕ ᵔ˶)', m, footerY + 20 * s,
    stickerCount ? inner - 189 * s : inner, { size: 13 * s, lineHeight: 21 * s, color: '#a16b7d' });
  const stickerSize = 47 * s, stickerY = footerY + 19 * s;
  for (let i = 0; i < 3; i++) {
    const sx = w - m - 174 * s + i * 59 * s;
    if (i < stickerCount) p.rect(sx - 3 * s, stickerY - 2 * s, stickerSize + 6 * s, stickerSize + 6 * s, { fill: '#fff8ed', stroke: '#f0d8d8', radius: 7 * s });
    p.slot(sx, stickerY, stickerSize);
  }
  if (stickerCount) p.text('小贴纸，也一起收好', m, footerY + 51 * s, inner - 189 * s, { size: 11 * s, lineHeight: 18 * s, color: '#b3958b' });
  return height;
}
