/* A little life magazine, using only the existing read-only share model. */
export const REPORT_THEME = Object.freeze({
  bg: '#FFEAF0', paper: '#FFFDF3', ink: '#79545E', muted: '#AA8187',
  accent: '#EA96B0', line: '#E8BFCB', tape: '#F4C4D4',
  titleFont: '"Noto Serif CJK SC", "Songti SC", "SimSun", Georgia, serif',
  bodyFont: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
});

const rows = value => Array.isArray(value) ? value : [];
const tilt = (angle, height, s) => Math.sign(angle) * Math.min(Math.abs(angle), Math.atan(4 * s / Math.max(1, height)) * 180 / Math.PI);
const emojiMood = row => row.title === '心情' && Boolean(row.note?.trim())
  && [...row.note.trim()].length <= 16
  && /^[\p{Extended_Pictographic}\p{Regional_Indicator}\p{Emoji_Modifier}\u200d\ufe0e\ufe0f\s]+$/u.test(row.note.trim());
function paperRow(row, d) {
  if (d.isRange || !row.meta) return row;
  const parts = String(row.meta).split(' · ');
  if (/^(?:\d{1,4}年)?\d{1,2}月\d{1,2}日$/.test(parts[0] || '')) parts.shift();
  return {...row, meta: parts.join(' · ')};
}
const FIELDS = [
  {fill: '#FFF2D2', edge: '#E3CC9B', ink: '#A5834B', tag: 'TASTY LITTLE MEMORY', art: 'report-bento'},
  {fill: '#EAF4E5', edge: '#BED5B6', ink: '#7C986C', tag: 'A LITTLE ENERGY', art: 'report-flower'},
  {fill: '#F1EAF9', edge: '#D6C4E5', ink: '#9B7DB3', tag: 'A PAGE OF GROWTH', art: 'report-envelope'},
];

/** Counts and stories weave into a cover spread, rather than a vertical report. */
export function drawReport(p, d, t = REPORT_THEME) {
  const w = p.width, s = Math.min(1.3, w / 600), x = 39 * s, inner = w - 78 * s, gap = 21 * s;
  const month = d.scope === 'month', heading = month ? '机智生活月报' : d.isRange ? '机智生活回顾' : '机智一日小报';
  const period = month ? d.rangeLabel : d.dateLabel;
  const headingO = {size: 36 * s, lineHeight: 48 * s, font: 'title', weight: '700', color: '#8F5069'};
  const dateO = {size: 15 * s, lineHeight: 23 * s, weight: '600', color: '#AA7384'};
  const headingW = inner - 128 * s, headingH = p.measure(heading, headingW, headingO);
  const headerBottom = Math.max(78 * s + headingH + 39 * s, 191 * s);
  const dateY = headerBottom + 11 * s, dateH = p.measure(period || '', inner - 30 * s, dateO);
  const metricY = dateY + dateH + 34 * s;
  const hasMeal = Number(d.counts?.mealCount) > 0;
  const activeKinds = ['exercise', 'study'].filter(kind => Number(d.counts?.[kind + 'Days']) > 0);
  const mealOnly = hasMeal && !activeKinds.length;
  const majorW = mealOnly ? inner : Math.round(inner * .435);
  const sideW = hasMeal ? inner - majorW - gap : activeKinds.length > 1 ? (inner - gap) / 2 : inner;
  const numberO = {size: 61 * s, lineHeight: 72 * s, weight: '700', font: 'title', color: '#BE6E8F'};
  const numberH = p.measure(String(d.counts?.mealCount ?? 0), mealOnly ? 90 * s : majorW - 35 * s, numberO);
  const mealSummary = `在 ${d.counts?.mealDays ?? 0} 天里，留下好滋味`;
  const majorH = mealOnly ? Math.max(106 * s, numberH + 36 * s, 73 * s + p.measure(mealSummary, majorW - 137 * s, {size: 11.5 * s, lineHeight: 18 * s}) + 15 * s)
    : 91 * s + numberH + p.measure(mealSummary, majorW - 32 * s, {size: 11.5 * s, lineHeight: 18 * s});
  const smallMetric = (kind, label, fill, edge, ink) => {
    const number = String(d.counts?.[kind + 'Days'] ?? 0), minutes = d.counts?.[kind + 'Minutes'];
    const valueO = {size: 35 * s, lineHeight: 44 * s, font: 'title', weight: '700', color: ink};
    const labelO = {size: 14 * s, lineHeight: 22 * s, weight: '600', color: ink};
    const subO = {size: 11 * s, lineHeight: 17 * s, color: ink};
    const note = Number(minutes) > 0 ? `已填 ${minutes} 分钟` : '记下一点日常';
    const textW = sideW - 110 * s;
    const height = Math.max(75 * s, Math.max(p.measure(number, 71 * s, valueO), p.measure(label, textW, labelO) + 3 * s + p.measure(note, textW, subO)) + 28 * s);
    return {number, note, label, fill, edge, ink, textW, valueO, labelO, subO, height};
  };
  const metricPlans = activeKinds.map(kind => kind === 'exercise'
    ? smallMetric(kind, '运动小积累', '#EBF5E8', '#C4D9BE', '#7E9C70')
    : smallMetric(kind, '学习小积累', '#F0E9FA', '#D6C6E8', '#9A7BB0'));
  const sideH = hasMeal ? metricPlans.reduce((sum, plan, i) => sum + plan.height + (i ? 11 * s : 0), 0)
    : Math.max(0, ...metricPlans.map(plan => plan.height));
  const metricH = Math.max(hasMeal ? majorH : 0, sideH);
  let cursor = metricY + metricH + (metricH ? 28 * s : 0);
  const titleO = {size: 18 * s, lineHeight: 27 * s, weight: '600', color: t.ink, font: 'title'};
  const metaO = {size: 13 * s, lineHeight: 20 * s, color: t.muted};
  const noteO = {size: 19 * s, lineHeight: 28 * s, color: t.ink};
  // A daily report keeps every selected record, including activities without
  // minutes. Summary-only prepared objects retain their original fallback.
  const records = rows(d.groups).flatMap(group => rows(group.rows).map(row => ({...paperRow(row, d), kind: group.kind})));
  const highlights = records.length ? records : rows(d.highlights).map(row => paperRow(row, d)), highlightBlocks = [];
  const highlightPlan = (row, width, index) => ({row, width, index,
    height: 54 * s + p.measure(row.title || '', width - 32 * s, titleO)
      + (row.meta ? p.measure(row.meta, width - 32 * s, metaO) + 7 * s : 0)
      + (row.note ? p.measure(row.note, width - 32 * s, noteO) + 10 * s : 0)});
  // Wider square sheets can hold more scraps per row. Their typography and
  // paper padding stay the same; adding columns prevents rich days from
  // becoming a tall strip that never fits the square's capacity.
  const columns = p.format === 'square' ? Math.min(4, Math.max(2, Math.floor((inner + gap) / (240 * s + gap)))) : 2;
  const columnW = (inner - gap * (columns - 1)) / columns;
  // Short memories keep independent heights. Long memories receive a sheet
  // across the columns, so every selected title and paragraph remains visible.
  for (let i = 0; i < highlights.length;) {
    const first = highlightPlan(highlights[i], columnW, i);
    const plans = [];
    if (first.height <= 290 * s) {
      for (let j = i; j < Math.min(highlights.length, i + columns); j++) {
        const plan = highlightPlan(highlights[j], columnW, j);
        if (plan.height > 290 * s) break;
        plans.push(plan);
      }
    }
    if (plans.length > 1) {
      plans.forEach((plan, column) => highlightBlocks.push({...plan, x: x + column * (columnW + gap), y: cursor + (column % 2 ? 0 : 6 * s)}));
      cursor += Math.max(...plans.map((plan, column) => plan.height + (column % 2 ? 0 : 6 * s))) + 24 * s;
      i += plans.length;
    } else {
      const plan = highlightPlan(highlights[i], inner, i);
      highlightBlocks.push({...plan, x, y: cursor});
      cursor += plan.height + 24 * s;
      i++;
    }
  }
  const diaries = rows(d.lifeRows).filter(row => row.note).map(row => paperRow(row, d));
  const lifeRows = diaries.length ? diaries : d.caption ? [{title: '生活摘记', meta: '', note: d.caption}] : [];
  const lifeBlocks = [];
  const lifeColumnW = (inner - gap) / 2;
  const lifePlan = (row, width, index) => {
    const stamp = emojiMood(row), pw = stamp ? Math.min(width, 164 * s) : width;
    const titleStyle = stamp ? {size: 12 * s, lineHeight: 18 * s, weight: '600'} : titleO;
    const noteStyle = stamp ? {size: 29 * s, lineHeight: 38 * s} : noteO;
    return {row, width: pw, index, stamp,
      height: (stamp ? 26 : 33) * s + p.measure(row.title || '', pw - 36 * s, titleStyle)
        + (row.meta ? p.measure(row.meta, pw - 36 * s, metaO) + 6 * s : 0)
        + (row.note ? p.measure(row.note, pw - 36 * s, noteStyle) + (stamp ? 6 : 8) * s : 0)};
  };
  for (let i = 0; i < lifeRows.length;) {
    const first = lifePlan(lifeRows[i], lifeColumnW, i);
    const second = lifeRows[i + 1] && lifePlan(lifeRows[i + 1], lifeColumnW, i + 1);
    const short = row => ['心情', '小确幸'].includes(row.title);
    if (second && short(first.row) && short(second.row) && first.height <= 245 * s && second.height <= 245 * s) {
      lifeBlocks.push({...first, x, y: cursor}, {...second, x: x + lifeColumnW + gap, y: cursor + 7 * s});
      cursor += Math.max(first.height, second.height + 7 * s) + 23 * s;
      i += 2;
    } else {
      const soloW = ['心情', '小确幸'].includes(lifeRows[i].title) ? Math.min(inner, 330 * s) : inner;
      const plan = lifePlan(lifeRows[i], soloW, i);
      lifeBlocks.push({...plan, x, y: cursor});
      cursor += plan.height + 23 * s;
      i++;
    }
  }
  if (!highlights.length && !lifeRows.length) cursor += 92 * s;
  const height = Math.max(cursor + 89 * s, p.frameHeight || 0), footerY = height - 83 * s;

  p.rect(0, 0, w, height, {fill: t.bg});
  p.dots(8 * s, 9 * s, w, height, {color: '#EDB7C9', step: 19 * s, radius: 1.1 * s});
  p.rect(23 * s, 20 * s, w - 46 * s, height - 40 * s, {fill: t.paper, stroke: '#E5B4C5', radius: 6 * s, shadow: true});
  p.rect(30 * s, 27 * s, w - 60 * s, height - 54 * s, {stroke: '#F0D6DC', radius: 3 * s, dash: [3 * s, 5 * s]});
  // A pink masthead, folded label and binding holes form a tiny magazine cover.
  p.rect(x, 36 * s, inner, 24 * s, {fill: '#F2B6CE', radius: 2 * s});
  p.dots(x + 5 * s, 40 * s, inner - 10 * s, 16 * s, {color: '#FCE6EF', step: 14 * s, radius: 1.2 * s});
  p.text('机智定食  /  LITTLE MOMENTS MAGAZINE', x + 11 * s, 41 * s, inner - 22 * s,
    {size: 10.5 * s, lineHeight: 16 * s, weight: '700', color: '#A45F7A'});
  for (let y = 96 * s; y < height - 67 * s; y += 88 * s) {
    p.circle(28 * s, y, 3.5 * s, {fill: '#EBC4D2'});
    p.circle(28 * s, y - .7 * s, 2.2 * s, {fill: '#FFF8FA'});
  }
  p.text(heading, x, 78 * s, headingW, headingO);
  p.text('小日子，值得认真收藏。 (˶ᵔ ᵕ ᵔ˶)', x + 2 * s, 78 * s + headingH + 8 * s, headingW,
    {size: 12 * s, lineHeight: 19 * s, font: 'title', color: '#B77E90'});
  const issueX = w - x - 109 * s;
  p.circle(issueX + 55 * s, 128 * s, 52 * s, {fill: '#FFF1CC', stroke: '#E8CB98', width: 1.2 * s});
  p.circle(issueX + 55 * s, 128 * s, 46 * s, {stroke: '#EDDBB0', dash: [2 * s, 4 * s]});
  p.text(month && typeof d.start === 'string' ? String(Number(d.start.slice(5, 7))).padStart(2, '0') : '♡', issueX + 11 * s, 92 * s, 88 * s,
    {size: (month ? 43 : 40) * s, lineHeight: 53 * s, weight: '700', font: 'title', color: '#C79466', align: 'center'});
  p.text(month ? '月 的 小 日 子' : '生 活 小 片 段', issueX + 9 * s, 148 * s, 92 * s,
    {size: 10 * s, lineHeight: 15 * s, color: '#BE9475', align: 'center'});
  p.art('report-calendar', issueX + 72 * s, 62 * s, 39 * s, 40 * s);
  p.tape(issueX + 21 * s, 74 * s, 59 * s, {fill: '#D8DCC6', angle: 5});
  p.line(x, headerBottom, w - x, headerBottom, {color: '#E0BCC7', width: 1 * s});
  p.rect(x, dateY - 2 * s, inner, dateH + 18 * s, {fill: '#FCEBF0', radius: 3 * s});
  p.text(period || '', x + 15 * s, dateY + 7 * s, inner - 30 * s, dateO);

  if (hasMeal) p.group(x, metricY, majorW, majorH, tilt(-.6, majorH, s), () => {
    p.rect(0, 0, majorW, majorH, {fill: '#FBE1EB', stroke: '#E7B8CB', radius: 5 * s, shadow: true});
    p.rect(7 * s, 7 * s, majorW - 14 * s, majorH - 14 * s, {stroke: '#ECC4D3', radius: 2 * s, dash: [2 * s, 4 * s]});
    p.text('好好吃饭的小记', (mealOnly ? 121 : 16) * s, 16 * s, majorW - (mealOnly ? 137 : 32) * s, {size: 13 * s, lineHeight: 20 * s, weight: '600', color: '#BC8097'});
    p.text(String(d.counts?.mealCount ?? 0), 16 * s, (mealOnly ? 18 : 45) * s, mealOnly ? 90 * s : majorW - 35 * s, numberO);
    p.text('餐食记录', (mealOnly ? 121 : 19) * s, mealOnly ? 45 * s : 48 * s + numberH, majorW - (mealOnly ? 137 : 38) * s, {size: 13 * s, lineHeight: 20 * s, weight: '600', color: '#B27691'});
    p.text(mealSummary, (mealOnly ? 121 : 16) * s, mealOnly ? 73 * s : 73 * s + numberH, majorW - (mealOnly ? 137 : 32) * s, {size: 11.5 * s, lineHeight: 18 * s, color: '#B58A8A'});
  });
  function drawSmallMetric(plan, mx, y) {
    p.rect(mx, y, sideW, plan.height, {fill: plan.fill, stroke: plan.edge, radius: 7 * s, shadow: true});
    p.circle(mx + 48 * s, y + plan.height / 2, 32 * s, {fill: '#FFFDF3', stroke: plan.edge, width: .8 * s});
    const numberH = p.measure(plan.number, 71 * s, plan.valueO);
    p.text(plan.number, mx + 13 * s, y + (plan.height - numberH) / 2 - 2 * s, 71 * s, {...plan.valueO, align: 'center'});
    const labelH = p.measure(plan.label, plan.textW, plan.labelO);
    const subH = p.measure(plan.note, plan.textW, plan.subO);
    let ty = y + (plan.height - labelH - subH - 3 * s) / 2;
    ty += p.text(plan.label, mx + 96 * s, ty, plan.textW, plan.labelO);
    p.text(plan.note, mx + 96 * s, ty + 3 * s, plan.textW, plan.subO);
  }
  let sideY = metricY;
  metricPlans.forEach((plan, index) => {
    drawSmallMetric(plan, hasMeal ? x + majorW + gap : x + index * (sideW + gap), sideY);
    if (hasMeal) sideY += plan.height + 11 * s;
  });

  highlightBlocks.forEach(block => {
    const {row, width: pw, height: ph, index} = block, c = FIELDS[row.kind ? ['meal', 'exercise', 'study'].indexOf(row.kind) : index % FIELDS.length] || FIELDS[0];
    p.group(block.x, block.y, pw, ph, tilt(index % 2 ? .6 : -.5, ph, s), () => {
      p.rect(0, 0, pw, ph, {fill: c.fill, stroke: c.edge, radius: 2 * s, shadow: true});
      p.rect(0, 0, pw, 8 * s, {fill: c.edge});
      p.text(c.tag, 15 * s, 18 * s, pw - 58 * s, {size: 8.5 * s, lineHeight: 14 * s, weight: '700', color: c.ink});
      p.art(c.art, pw - 40 * s, 14 * s, 25 * s, 25 * s);
      let ty = 39 * s;
      ty += p.text(row.title || '', 16 * s, ty, pw - 32 * s, titleO);
      if (row.meta) ty += 7 * s + p.text(row.meta, 16 * s, ty + 7 * s, pw - 32 * s, metaO);
      if (row.note) p.text(row.note, 16 * s, ty + 10 * s, pw - 32 * s, noteO);
    });
    p.tape(block.x + pw / 2 - 31 * s, block.y - 7 * s, 62 * s, {fill: index % 2 ? '#E4C9E7' : '#F2C8D7', angle: index % 2 ? -3 : 3});
  });

  lifeBlocks.forEach(block => {
    const {row, width: pw, height: ph, index, stamp} = block, story = !['心情', '小确幸'].includes(row.title);
    const fill = row.title === '心情' ? '#FFE8EF' : row.title === '小确幸' ? '#FFF2CD' : '#FFF6E8';
    const edge = row.title === '心情' ? '#EAC1D0' : row.title === '小确幸' ? '#E5D0A2' : '#E5CFB9';
    p.group(block.x, block.y, pw, ph, tilt(index % 2 ? .45 : -.4, ph, s), () => {
      p.rect(0, 0, pw, ph, {fill, stroke: edge, radius: story ? 2 * s : 8 * s, shadow: true});
      if (stamp) {
        for (let sy = 10 * s; sy < ph; sy += 14 * s) {
          p.circle(0, sy, 3 * s, {fill: t.paper});
          p.circle(pw, sy, 3 * s, {fill: t.paper});
        }
        p.rect(6 * s, 6 * s, pw - 12 * s, ph - 12 * s, {stroke: edge, radius: 2 * s});
      }
      if (story) {
        p.line(10 * s, 18 * s, 10 * s, ph - 14 * s, {color: '#E7BFC8', width: 1 * s});
        for (let ly = 60 * s; ly < ph - 12 * s; ly += 28 * s) p.line(17 * s, ly, pw - 17 * s, ly, {color: '#EEE0CE', width: .7 * s});
      }
      let ty = (stamp ? 12 : 17) * s;
      ty += p.text(row.title || '', 18 * s, ty, pw - 36 * s, stamp ? {...titleO, size: 12 * s, lineHeight: 18 * s, align: 'center'} : titleO);
      if (row.meta) ty += 6 * s + p.text(row.meta, 18 * s, ty + 6 * s, pw - 36 * s, metaO);
      if (row.note) p.text(row.note, 18 * s, ty + (stamp ? 6 : 8) * s, pw - 36 * s, stamp ? {...noteO, size: 29 * s, lineHeight: 38 * s, align: 'center'} : noteO);
    });
    if (story) p.art('report-envelope', block.x + pw - 56 * s, block.y - 16 * s, 41 * s, 32 * s);
  });
  if (!highlights.length && !lifeRows.length) {
    p.art('report-flower', x + 10 * s, metricY + metricH + 31 * s, 53 * s, 59 * s);
    p.text('普通的小日子，也值得留一页。', x + 87 * s, metricY + metricH + 48 * s, inner - 100 * s,
      {size: 20 * s, lineHeight: 29 * s, font: 'title', color: t.muted});
  }
  p.line(x, footerY, w - x, footerY, {color: '#E0BBC8', dash: [3 * s, 5 * s]});
  p.text('收藏日常的甜甜碎片 ♡', x + 3 * s, footerY + 18 * s, inner - 176 * s,
    {size: 15 * s, lineHeight: 22 * s, font: 'title', color: '#A96E86'});
  p.text('机智定食  /  A LITTLE LIFE TO KEEP', x + 3 * s, footerY + 45 * s, inner - 176 * s,
    {size: 9 * s, lineHeight: 15 * s, color: '#B48C8C'});
  for (let i = 0; i < 3; i++) {
    const sx = w - x - 162 * s + i * 56 * s;
    p.rect(sx - 3 * s, footerY + 12 * s, 45 * s, 45 * s, {fill: ['#F7E9F9', '#FFF1D6', '#EAF3E3'][i], stroke: '#E6C9CE', radius: 5 * s});
    p.slot(sx, footerY + 15 * s, 39 * s);
  }
  return height;
}
