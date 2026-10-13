/* Original paper collage. Content is supplied by the existing privacy boundary. */
export const COLLAGE_THEME = Object.freeze({
  bg: '#FFF2F4', paper: '#FFFCF1', ink: '#72513F', muted: '#A47A70',
  accent: '#E981A6', line: '#EAC2CA', tape: '#FFD3DE',
  titleFont: '"Noto Serif CJK SC", "Songti SC", "SimSun", Georgia, serif',
  bodyFont: '-apple-system, BlinkMacSystemFont, "PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", "Apple Color Emoji", "Segoe UI Emoji", sans-serif',
});

const titleStyle = {size: 21, lineHeight: 29, weight: '700'};
const metaStyle = {size: 14, lineHeight: 21};
const noteStyle = {size: 18, lineHeight: 27};
const paperByKind = {
  meal: {fill: '#FFFDF5', trim: '#F5BAD0', line: '#ECD6BC', label: '好好吃饭', mark: 'TASTY LITTLE MOMENT'},
  exercise: {fill: '#F0F7DF', trim: '#BCD9B1', line: '#C3D3A9', label: '动一动', mark: 'A LITTLE ADVENTURE'},
  study: {fill: '#F1EEFF', trim: '#D0C3EC', line: '#DAD0EB', label: '学一点', mark: 'NOTES FROM TODAY'},
  mood: {fill: '#FFE6EE', trim: '#F5A8C1', line: '#E6AFBF', label: '心情邮票', mark: 'DEAR LITTLE SELF'},
  joy: {fill: '#FFF1BE', trim: '#F4D391', line: '#E7D4A1', label: '小确幸', mark: 'A TINY HAPPY THING'},
  story: {fill: '#FFFCED', trim: '#F1BBCA', line: '#ECDCCA', label: '今天的小故事', mark: 'KEEP THIS MOMENT'},
};

function paperRow(row, kind, isRange) {
  if (isRange || !row.meta) return row;
  const pieces = String(row.meta).split(' · ');
  if (/^(?:\d{4}年)?\d{1,2}月\d{1,2}日$/.test(pieces[0] || '')) pieces.shift();
  if (kind === 'meal') {
    const slot = row.groupLabel;
    if (slot && pieces[0] === slot) pieces.shift();
  }
  return {...row, meta: pieces.join(' · ')};
}

function gapCluster(p, panel) {
  const {x, y, w, h} = panel;
  const clusterW = Math.min(185, w - 25), inset = (w - clusterW) / 2;
  if (h < 136) {
    p.group(x + inset, y + (h - 92) / 2, clusterW, 92, -3, () => {
      p.art('collage-camera', 7, 3, 62, 75);
      p.art('collage-heart-post', 91, 0, 31, 39);
      p.art('collage-flower', 136, 17, 27, 34);
      p.text('(˶ᵔ ᵕ ᵔ˶)', 83, 48, clusterW - 83, {size: 12, lineHeight: 17, color: '#C58D9A', align: 'center'});
      p.text('小快乐，收好啦 ♡', 77, 71, clusterW - 77, {size: 10, lineHeight: 15, color: '#B18387', align: 'center'});
    });
    return;
  }
  p.group(x + inset, y + Math.max(0, (h - 126) / 2), clusterW, 126, -3, () => {
    p.art('collage-camera', 1, 6, 78, 95);
    p.art('collage-heart-post', 102, 4, 42, 52);
    p.art('collage-flower', 140, 27, 35, 43);
    p.text('收好小小的快乐 ♡', 86, 70, clusterW - 86, {size: 11, lineHeight: 17, color: '#B18387', weight: '600'});
    p.text('(˶ᵔ ᵕ ᵔ˶)', 85, 107, clusterW - 85, {size: 13, lineHeight: 18, color: '#C58D9A', align: 'center'});
  });
}

function smallPaper(p, card, t) {
  const {x, y, w, h, row, kind, index} = card;
  const paper = paperByKind[kind] || paperByKind.meal;
  // A tall paragraph stays straight; a short scrap has a slight real paper tilt.
  const angle = h > 280 ? 0 : (index % 3 === 0 ? -1.6 : index % 3 === 1 ? 1.25 : -.55);
  p.group(x, y, w, h, angle, () => {
    p.rect(0, 0, w, h, {fill: paper.fill, stroke: paper.line, shadow: true, radius: kind === 'mood' ? 3 : 1});
    if (kind === 'study' || kind === 'story') {
      for (let ly = 42; ly < h - 14; ly += 23) p.line(13, ly, w - 13, ly, {color: kind === 'study' ? '#E1DAF0' : '#F0E5D6', width: .7});
      if (kind === 'study') for (let lx = 16; lx < w - 12; lx += 23) p.line(lx, 39, lx, h - 14, {color: '#E5DFF3', width: .65});
      if (kind === 'story') p.line(29, 43, 29, h - 16, {color: '#EDC6D0', width: 1});
    }
    if (kind === 'meal') {
      p.rect(0, 0, w, 9, {fill: paper.trim});
      p.dots(7, 3, w - 14, 4, {color: '#FFFAF5', step: 12, radius: 1.35});
      p.tape(w / 2 - 39, -8, 78, {fill: '#FBD0B8', angle: 3});
    } else if (kind === 'exercise') {
      p.rect(0, 0, 7, h, {fill: paper.trim});
      p.line(17, h - 22, w - 17, h - 22, {color: '#B5C99C', dash: [3, 4]});
      for (let cy = 42; cy < h - 26; cy += 16) p.circle(0, cy, 3.7, {fill: t.bg});
      p.text('GO', w - 48, 18, 28, {size: 11, lineHeight: 16, weight: '700', color: '#779560', align: 'center'});
      p.circle(w - 34, 26, 16, {stroke: '#A1B889', width: 1});
    } else if (kind === 'study') {
      p.tape(25, -8, 69, {fill: '#DAC8ED', angle: -3});
      p.art('collage-clips', w - 48, -12, 34, 50);
    } else if (kind === 'mood') {
      for (let lx = 8; lx < w; lx += 14) {
        p.circle(lx, 0, 3.5, {fill: t.bg});
        p.circle(lx, h, 3.5, {fill: t.bg});
      }
      p.rect(8, 8, w - 16, h - 16, {stroke: '#DB91AC', radius: 1});
      p.art('collage-heart-post', w - 51, 14, 31, 38);
    } else if (kind === 'joy') {
      p.rect(0, 0, w, 12, {fill: '#F4D894'});
      p.tape(w / 2 - 34, -8, 68, {fill: '#BADDC5', angle: 3});
      p.art('collage-flower', w - 52, 10, 36, 44);
    } else {
      p.tape(w - 139, -7, 91, {fill: '#F4B8CB', angle: 2});
      p.art('collage-clips', 6, -12, 27, 40);
    }
    const inset = kind === 'story' ? 40 : 17;
    const usable = w - inset - 17;
    const label = kind === 'mood' ? '心情邮票' : kind === 'joy' ? '今日的小确幸' : kind === 'story' ? row.title || paper.label : row.groupLabel || paper.label;
    p.text(label, inset, 19, usable - 42, {size: 13, lineHeight: 20, weight: '700', color: kind === 'exercise' ? '#708B55' : kind === 'study' ? '#9580B8' : '#BA7788'});
    if (!['mood', 'joy', 'story'].includes(kind)) p.text(String(index + 1).padStart(2, '0'), 17, h - 18, w - 34, {size: 9, lineHeight: 12, color: '#B29A86', align: 'right'});
    let ty = 49;
    if (['mood', 'joy', 'story'].includes(kind)) {
      if (row.meta) ty += p.text(row.meta, inset, ty, usable, {...metaStyle, color: t.muted}) + 9;
      if (row.note) ty += p.text(row.note, inset, ty, usable, {...noteStyle, size: kind === 'mood' ? 22 : 18, lineHeight: kind === 'mood' ? 31 : 27, color: t.ink});
      // Imported/custom labels remain visible even if they do not match the standard diary names.
      if (kind !== 'story' && row.title && !['心情', '小确幸'].includes(row.title)) p.text(row.title, inset, ty + 8, usable, {...metaStyle, color: t.muted});
    } else {
      ty += p.text(row.title || '', inset, ty, usable, {...titleStyle, color: t.ink});
      if (row.meta) ty += 8 + p.text(row.meta, inset, ty + 8, usable, {...metaStyle, color: t.muted});
      if (row.note) ty += 8 + p.text(row.note, inset, ty + 8, usable, {...noteStyle, color: t.ink});
    }
  });
}

function cardHeight(p, row, kind, w) {
  const inset = kind === 'story' ? 40 : 17;
  const usable = w - inset - 17;
  if (['mood', 'joy', 'story'].includes(kind)) {
    const note = {...noteStyle, size: kind === 'mood' ? 22 : 18, lineHeight: kind === 'mood' ? 31 : 27};
    const customLabelH = kind !== 'story' && row.title && !['心情', '小确幸'].includes(row.title) ? p.measure(row.title, usable, metaStyle) + 8 : 0;
    return Math.max(kind === 'mood' ? 137 : 130, 49 + (row.meta ? p.measure(row.meta, usable, metaStyle) + 9 : 0) + p.measure(row.note || '', usable, note) + customLabelH + 24);
  }
  return Math.max(131, 49 + p.measure(row.title || '', usable, titleStyle)
    + (row.meta ? p.measure(row.meta, usable, metaStyle) + 8 : 0)
    + (row.note ? p.measure(row.note, usable, noteStyle) + 8 : 0)
    + (kind === 'exercise' ? 34 : 25));
}

export function drawCollage(p, d, t = COLLAGE_THEME) {
  const w = p.width;
  const outer = 36, gap = 23, available = w - outer * 2;
  const date = d.isRange ? d.rangeLabel : d.dateLabel;
  const stampW = Math.min(172, available * .32);
  const stampX = w - outer - stampW;
  const stampH = p.measure(date || '', stampW - 28, {size: 15, lineHeight: 23, weight: '600'}) + 46;
  const heading = d.isRange ? '把日子贴进手账' : '把今天贴进手账';
  const headingH = p.measure(heading, available - stampW - 20, {size: 35, lineHeight: 48, weight: '700', font: 'title'});
  const headerBottom = Math.max(64 + headingH + 47, 32 + stampH + 17);
  const startY = headerBottom + 16;
  const ordinary = (d.groups || []).flatMap(group => (group.rows || []).map(row => ({row: paperRow(row, group.kind, d.isRange), kind: group.kind})));
  const diary = (d.lifeRows || []).map(row => ({row: paperRow(row, 'life', d.isRange), kind: row.title === '心情' ? 'mood' : row.title === '小确幸' ? 'joy' : 'story'}));
  const papers = [...ordinary, ...diary];
  if (d.caption) papers.push({kind: 'story', row: {title: '本日摘记', meta: '', note: d.caption}});

  const cards = [], gapPanels = [];
  let contentBottom = startY;
  if (papers.length === 1) {
    const one = papers[0];
    const singleW = Math.min(available - 32, Math.max(360, available * .82));
    const h = cardHeight(p, one.row, one.kind, singleW);
    cards.push({...one, x: outer + 13, y: startY + 9, w: singleW, h, index: 0});
    contentBottom = startY + h + 24;
  } else if (papers.length) {
    const leftW = Math.round((available - gap) * .52), rightW = available - gap - leftW;
    const cols = [startY + 5, startY + 27];
    const collectGap = () => {
      const shorter = cols[0] <= cols[1] ? 0 : 1;
      const emptyH = Math.abs(cols[0] - cols[1]) - 12;
      if (emptyH >= 112) gapPanels.push({x: shorter ? outer + leftW + gap : outer, y: cols[shorter] + 2, w: shorter ? rightW : leftW, h: emptyH});
    };
    papers.forEach((paper, index) => {
      const wide = paper.kind === 'story'
        || cardHeight(p, paper.row, paper.kind, Math.min(leftW, rightW)) > 320;
      if (wide) {
        collectGap();
        const y = Math.max(...cols) + 2, pw = available - 9;
        const h = cardHeight(p, paper.row, paper.kind, pw);
        cards.push({...paper, x: outer + 5, y, w: pw, h, index});
        cols[0] = cols[1] = y + h + 25;
      } else {
        const col = cols[0] <= cols[1] ? 0 : 1;
        const pw = col ? rightW : leftW, h = cardHeight(p, paper.row, paper.kind, pw);
        cards.push({...paper, x: col ? outer + leftW + gap : outer, y: cols[col], w: pw, h, index});
        cols[col] += h + 25;
      }
    });
    collectGap();
    contentBottom = Math.max(...cols) - 11;
  } else {
    contentBottom = startY + 132;
  }
  const footerY = contentBottom + 20;
  const height = Math.max(footerY + 79, p.frameHeight || 0);
  const finalFooterY = height - 79;

  p.rect(0, 0, w, height, {fill: t.bg});
  p.dots(9, 9, w, height, {color: '#EDB5C6', step: 18, radius: 1.1});
  p.rect(13, 13, w - 26, height - 26, {fill: '#FFF8F2', stroke: '#F0CFCC', radius: 6});
  // Quiet paper weave: ornaments live at the edges rather than behind long paragraphs.
  for (let y = 22; y < height - 20; y += 4) p.line(23, y, w - 23, y, {color: '#FAEFE7', width: .45});
  p.rect(28, 27, 204, 24, {fill: '#F8C5D6', radius: 2});
  p.dots(34, 32, 196, 14, {color: '#FFF6F4', step: 14, radius: 1.25});
  p.text('机智定食  /  LITTLE MOMENTS', 38, 32, 187, {size: 11, lineHeight: 16, weight: '700', color: '#A3566C'});
  p.text(heading, outer, 64, available - stampW - 20, {size: 35, lineHeight: 48, weight: '700', font: 'title', color: t.ink});
  p.text('小纸片，大日常。 (˶ᵔ ᵕ ᵔ˶)', outer + 2, 64 + headingH + 8, available - stampW - 10, {size: 14, lineHeight: 21, color: '#B57C87'});
  p.group(stampX, 32, stampW, stampH, 3, () => {
    p.rect(0, 0, stampW, stampH, {fill: '#FFF4D9', stroke: '#DDA9A9', shadow: true, radius: 3});
    p.rect(5, 5, stampW - 10, stampH - 10, {stroke: '#E8BEB0', radius: 1});
    for (let sy = 14; sy < stampH - 8; sy += 14) {
      p.circle(0, sy, 2.6, {fill: '#FFF8F2'});
      p.circle(stampW, sy, 2.6, {fill: '#FFF8F2'});
    }
    p.text('DATE OF THIS MEMORY', 9, 12, stampW - 18, {size: 8, lineHeight: 12, color: '#BE798A', align: 'center', weight: '600'});
    p.text(date || '', 14, 31, stampW - 28, {size: 15, lineHeight: 23, weight: '600', color: '#A76778', align: 'center'});
    p.line(stampW - 31, stampH - 15, stampW - 11, stampH - 15, {color: '#D99AA9', dash: [2, 3]});
    p.circle(stampW + 2, 8, 17, {stroke: '#D38B9A', width: 1});
    p.circle(stampW + 2, 8, 13, {stroke: '#D38B9A', width: .7});
    p.text('♡', stampW - 7, -3, 18, {size: 15, lineHeight: 21, color: '#C58191', align: 'center'});
  });
  p.line(outer + 2, headerBottom, w - outer - 3, headerBottom, {color: '#E6BCBE', dash: [2, 5], width: 1});
  p.art('collage-flower', w - 77, headerBottom - 22, 39, 45);

  // The card surfaces themselves vary: receipt, graph note, postage and lined letter.
  cards.forEach(card => smallPaper(p, card, t));
  gapPanels.forEach(panel => gapCluster(p, panel));
  if (papers.length === 1) {
    const card = cards[0];
    p.art('collage-camera', w - 101, card.y + Math.min(67, card.h * .25), 64, 76);
    p.art('collage-heart-post', w - 83, card.y + Math.min(140, card.h * .61), 39, 49);
  }
  if (!papers.length) {
    p.art('collage-camera', outer + 9, startY + 8, 93, 108);
    p.text('小小日常，也值得收藏。', outer + 133, startY + 43, available - 156, {size: 22, lineHeight: 32, weight: '600', color: t.ink});
  }
  p.line(outer, finalFooterY, w - outer, finalFooterY, {color: '#E6C1C6', dash: [3, 5]});
  [outer + 5, outer + 44, outer + 83].forEach((x, index) => {
    p.circle(x + 16, finalFooterY + 30, 17, {fill: ['#FDE2EA', '#FFF0CD', '#E8EDDF'][index]});
    p.slot(x, finalFooterY + 14, 33);
  });
  p.text('把普通的一天，收进甜甜的生活里 ♡', outer + 132, finalFooterY + 16, available - 140, {size: 14, lineHeight: 21, weight: '600', color: '#A77577'});
  p.text('STRAWBERRY MILK  ·  PRIVATE JOURNAL', outer + 132, finalFooterY + 42, available - 140, {size: 8, lineHeight: 13, color: '#BD9990'});
  return height;
}
