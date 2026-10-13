/* Four independent compositions. The painter owns wrapping, fonts and stickers. */
const definitions = [
  {
    id: 'meal-strawberry',
    kind: 'meal',
    name: '草莓牛奶手账',
    theme: {
      bg: '#fff7fa', paper: '#fffdf7', ink: '#684c50', muted: '#997582',
      accent: '#f6b8cc', line: '#e8c7d2', tape: '#f5c5d7',
      titleFont: 'Georgia, "Songti SC", "SimSun", serif'
    },
    draw(p, d, t) {
      const w = p.width, s = Math.max(.84, Math.min(1.4, w / 720));
      const m = Math.max(36, Math.round(40 * s)), inner = w - m * 2;
      const rows = Array.isArray(d.meals) ? d.meals : [];
      const groups = [];
      for (const row of rows) {
        const label = row.groupLabel || '餐食记录';
        let group = groups.find(item => item.label === label);
        if (!group) { group = { label, rows: [] }; groups.push(group); }
        group.rows.push(row);
      }
      const mealOrder = ['早餐', '午餐', '晚餐', '零食 / 加餐'];
      groups.sort((a,b)=>(mealOrder.includes(a.label)?mealOrder.indexOf(a.label):mealOrder.length)-(mealOrder.includes(b.label)?mealOrder.indexOf(b.label):mealOrder.length));
      const rowOpts = { size: 24 * s, lineHeight: 33 * s, gap: 18 * s,
        color: t.ink, metaColor: t.muted };
      const capOpts = { size: 21 * s, lineHeight: 31 * s, color: t.ink };
      const panels = groups.map((group, index) => ({ ...group,
        height: 74 * s + p.rowsHeight(group.rows, inner - (index % 2 ? 5 * s : 0) - 46 * s, rowOpts) + 24 * s }));
      const captionH = d.caption ? 64 * s + p.measure(d.caption, inner - 44 * s, capOpts) : 0;
      const emptyH = rows.length ? 0 : 118 * s;
      const titleOpts = { size: 37 * s, weight: '700', font: 'title', color: t.ink, lineHeight: 46 * s };
      const titleHeight = p.measure(d.dateLabel, inner - 80 * s, titleOpts);
      const startY = Math.max(164 * s, 100 * s + titleHeight) + 32 * s;
      const height = startY + panels.reduce((sum, panel) => sum + panel.height + 30 * s, 0)
        + (emptyH ? emptyH + 24 * s : 0) + (captionH ? captionH + 24 * s : 0) + 87 * s;
      p.rect(0, 0, w, height, { fill: t.bg });
      p.dots(0, 0, w, height, { color: '#eed3de', step: 22 * s });
      // Binding stays in the margin; it never passes through the record text.
      for (let y = 104 * s; y < height - 38 * s; y += 63 * s) {
        p.circle(m - 22 * s, y, 4.5 * s, { fill: '#fffefa', stroke: t.line });
      }
      p.headerTag('机智定食 · 吃饭小手账', m, 36 * s, Math.min(inner - 88 * s, 302 * s),
        { fill: '#fce0ea', color: '#99667d' });
      p.slot(w - m - 69 * s, 24 * s, 67 * s);
      p.text(d.dateLabel, m, 92 * s, inner - 80 * s, titleOpts);
      let y = startY;
      panels.forEach((panel, index) => {
        const shift = index % 2 ? 5 * s : 0;
        const x = m + shift, pw = inner - shift;
        p.rect(x + 3 * s, y + 4 * s, pw, panel.height,
          { fill: '#f5e4e9', radius: 10 * s });
        p.rect(x, y, pw, panel.height,
          { fill: t.paper, stroke: t.line, radius: 8 * s });
        p.tape(x + pw / 2 - 46 * s, y - 9 * s, 92 * s,
          { fill: t.tape, angle: index % 2 ? 3 : -3 });
        p.text(panel.label, x + 23 * s, y + 25 * s, pw - 46 * s,
          { size: 18 * s, weight: '700', color: '#a26b81', lineHeight: 26 * s });
        p.line(x + 23 * s, y + 59 * s, x + pw - 23 * s, y + 59 * s,
          { color: t.line, dash: [5 * s, 5 * s] });
        p.rows(panel.rows, x + 23 * s, y + 74 * s, pw - 46 * s, rowOpts);
        y += panel.height + 30 * s;
      });
      if (!rows.length) {
        p.rect(m, y, inner, emptyH, { fill: t.paper, stroke: t.line, radius: 9 * s });
        p.text('这段日期还没有餐食记录', m + 23 * s, y + 39 * s, inner - 46 * s,
          { size: 22 * s, color: t.muted, lineHeight: 31 * s });
        y += emptyH + 24 * s;
      }
      if (d.caption) {
        p.rect(m, y, inner, captionH, { fill: '#fff0d3', radius: 6 * s });
        p.text('留在页角的一句话', m + 22 * s, y + 16 * s, inner - 44 * s,
          { size: 16 * s, color: '#94715e', lineHeight: 24 * s });
        p.text(d.caption, m + 22 * s, y + 47 * s, inner - 44 * s, capOpts);
        y += captionH + 24 * s;
      }
      p.line(m, y + 17 * s, w - m - 156 * s, y + 17 * s,
        { color: t.line, dash: [4 * s, 5 * s] });
      p.text('机智定食 · 把真实的日常收好', m, y + 31 * s, inner - 156 * s,
        { size: 14 * s, color: t.muted, lineHeight: 22 * s });
      p.slot(w - m - 137 * s, y - 4 * s, 58 * s);
      p.slot(w - m - 65 * s, y - 6 * s, 60 * s);
      return Math.max(height, y + 87 * s);
    }
  },
  {
    id: 'meal-cafe',
    kind: 'meal',
    name: '奶油早餐店菜单',
    theme: {
      bg: '#faf1df', paper: '#fffdf5', ink: '#655046', muted: '#9a8372',
      accent: '#f6b8cc', line: '#dfcdb4', tape: '#fff0d3',
      titleFont: 'Georgia, "Songti SC", "SimSun", serif'
    },
    draw(p, d, t) {
      const w = p.width, s = Math.max(.84, Math.min(1.4, w / 720));
      const m = Math.max(36, Math.round(45 * s)), inner = w - 2 * m;
      const meals = Array.isArray(d.meals) ? d.meals : [];
      const main = meals[0], rest = meals.slice(1);
      const textW = inner - 52 * s;
      const mainTitleOpts = { size: 34 * s, weight: '700', font: 'title', color: t.ink, lineHeight: 44 * s };
      const metaOpts = { size: 18 * s, color: t.muted, lineHeight: 27 * s };
      const noteOpts = { size: 21 * s, color: t.ink, lineHeight: 31 * s };
      const listOpts = { size: 23 * s, lineHeight: 32 * s, gap: 19 * s,
        color: t.ink, metaColor: t.muted };
      const mainH = main ? 102 * s + p.measure(main.title, textW, mainTitleOpts)
        + (main.meta ? p.measure(main.meta, textW, metaOpts) + 16 * s : 0)
        + (main.note ? p.measure(main.note, textW, noteOpts) + 17 * s : 0) : 136 * s;
      const listH = rest.length ? 70 * s + p.rowsHeight(rest, textW, listOpts) : 0;
      const captionH = d.caption ? 56 * s + p.measure(d.caption, textW, noteOpts) : 0;
      const dateOpts = { size: 20 * s, color: t.ink, lineHeight: 29 * s, align: 'center' };
      const dateHeight = p.measure(d.dateLabel, inner, dateOpts);
      const startY = Math.max(203 * s, 174 * s + dateHeight) + 28 * s;
      const height = startY + mainH + 27 * s + (listH ? listH + 24 * s : 0)
        + (captionH ? captionH + 22 * s : 0) + 120 * s;
      p.rect(0, 0, w, height, { fill: t.bg });
      p.rect(m - 12 * s, 28 * s, inner + 24 * s, height - 56 * s,
        { fill: t.paper, stroke: t.line, radius: 3 * s });
      p.line(m, 45 * s, w - m, 45 * s, { color: t.ink, width: 2 * s });
      p.text('机智的小小早餐店', m + 71 * s, 69 * s, inner - 142 * s,
        { size: 31 * s, weight: '700', font: 'title', color: t.ink,
          lineHeight: 42 * s, align: 'center' });
      p.slot(m + 6 * s, 65 * s, 56 * s);
      p.slot(w - m - 62 * s, 65 * s, 56 * s);
      p.text('MENU  /  奶油味的生活记录', m, 121 * s, inner,
        { size: 14 * s, weight: '700', color: t.muted, lineHeight: 23 * s, align: 'center' });
      p.text(d.dateLabel, m, 158 * s, inner, dateOpts);
      let y = startY - 28 * s;
      p.line(m, y, w - m, y, { color: t.line, width: 1.5 * s });
      y += 28 * s;
      p.rect(m, y, inner, mainH, { fill: '#fff3dc', stroke: t.line, radius: 3 * s });
      p.headerTag(main ? (main.groupLabel || '主餐记录') : '餐食记录',
        m + 26 * s, y + 20 * s, 130 * s, { fill: '#f9d6d5', color: '#946268' });
      let cy = y + 73 * s;
      if (main) {
        cy += p.text(main.title, m + 26 * s, cy, textW, mainTitleOpts);
        if (main.meta) cy += 16 * s + p.text(main.meta, m + 26 * s, cy + 16 * s, textW, metaOpts);
        if (main.note) cy += 17 * s + p.text(main.note, m + 26 * s, cy + 17 * s, textW, noteOpts);
      } else {
        p.text('这段日期还没有餐食记录', m + 26 * s, cy, textW,
          { size: 22 * s, color: t.muted, lineHeight: 31 * s });
      }
      y += mainH + 27 * s;
      if (rest.length) {
        p.text('其余点单 · 每一顿都收在这里', m + 26 * s, y, textW,
          { size: 16 * s, weight: '700', color: t.muted, lineHeight: 25 * s });
        p.line(m + 26 * s, y + 35 * s, w - m - 26 * s, y + 35 * s,
          { color: t.line, dash: [3 * s, 4 * s] });
        p.rows(rest, m + 26 * s, y + 55 * s, textW, listOpts);
        y += listH + 24 * s;
      }
      if (d.caption) {
        p.line(m, y, w - m, y, { color: t.line, dash: [6 * s, 4 * s] });
        p.text('今日摘记', m + 26 * s, y + 16 * s, textW,
          { size: 15 * s, weight: '700', color: t.muted, lineHeight: 23 * s });
        p.text(d.caption, m + 26 * s, y + 48 * s, textW, noteOpts);
        y += captionH + 22 * s;
      }
      p.line(m, y + 14 * s, w - m, y + 14 * s, { color: t.ink, width: 1.5 * s });
      p.text('THANK YOU FOR A LITTLE EVERYDAY', m, y + 30 * s, inner,
        { size: 13 * s, weight: '700', color: t.muted, lineHeight: 21 * s, align: 'center' });
      p.text('机智定食 · 小店收好每一顿', m, y + 58 * s, inner - 66 * s,
        { size: 15 * s, font: 'title', color: t.ink, lineHeight: 24 * s, align: 'center' });
      p.slot(w - m - 54 * s, y + 56 * s, 48 * s);
      // The receipt edge is decoration; it carries no fabricated order data.
      for (let x = m - 8 * s; x < w - m + 8 * s; x += 16 * s) {
        p.line(x, height - 28 * s, x + 8 * s, height - 21 * s, { color: t.line });
        p.line(x + 8 * s, height - 21 * s, x + 16 * s, height - 28 * s, { color: t.line });
      }
      return Math.max(height, y + 120 * s);
    }
  },
  {
    id: 'exercise-ticket',
    kind: 'exercise',
    name: '暴走小票',
    theme: {
      bg: '#f8dfd7', paper: '#fffdf7', ink: '#62534b', muted: '#9c8879',
      accent: '#f6b8cc', line: '#e5cabd', tape: '#dcead8',
      titleFont: 'Georgia, "Songti SC", "SimSun", serif'
    },
    draw(p, d, t) {
      const w = p.width, s = Math.max(.84, Math.min(1.4, w / 720));
      const m = Math.max(36, Math.round(74 * s)), inner = w - 2 * m;
      const records = Array.isArray(d.exercises) ? d.exercises : [];
      const rowOpts = { size: 25 * s, lineHeight: 34 * s, gap: 24 * s,
        color: t.ink, metaColor: t.muted };
      const noteOpts = { size: 21 * s, color: t.ink, lineHeight: 31 * s };
      const textW = inner - 46 * s;
      const rowsH = records.length ? p.rowsHeight(records, textW, rowOpts) : 52 * s;
      const captionH = d.caption ? 65 * s + p.measure(d.caption, textW, noteOpts) : 0;
      const hasMinutes = Number(d.counts.exerciseMinutes) > 0;
      const titleOpts = { size: 43 * s, weight: '700', font: 'title', color: t.ink, lineHeight: 52 * s };
      const dateOpts = { size: 18 * s, color: t.muted, lineHeight: 27 * s };
      const dateHeight = p.measure(d.dateLabel, textW, dateOpts);
      const startY = 115 * s + p.measure('暴走小票', textW, titleOpts) + dateHeight + 19 * s;
      const height = startY + 21 * s + 100 * s + rowsH + 25 * s
        + (d.caption ? 50 * s + p.measure(d.caption, textW, noteOpts) : 0) + 28 * s + 181 * s;
      p.rect(0, 0, w, height, { fill: t.bg });
      p.rect(m + 5 * s, 37 * s, inner, height - 62 * s,
        { fill: '#ebcec5', radius: 4 * s });
      p.rect(m, 30 * s, inner, height - 62 * s,
        { fill: t.paper, stroke: t.line, radius: 3 * s });
      for (let y = 45 * s; y < height - 45 * s; y += 26 * s) {
        p.circle(m, y, 4 * s, { fill: t.bg });
        p.circle(w - m, y, 4 * s, { fill: t.bg });
      }
      p.text('机智的运动小票', m + 23 * s, 64 * s, textW - 73 * s,
        { size: 17 * s, weight: '700', color: t.muted, lineHeight: 26 * s });
      p.slot(w - m - 67 * s, 50 * s, 50 * s);
      const titleH = p.text('暴走小票', m + 23 * s, 105 * s, textW, titleOpts);
      let y = 115 * s + titleH;
      y += p.text(d.dateLabel, m + 23 * s, y, textW, dateOpts) + 19 * s;
      p.line(m + 23 * s, y, w - m - 23 * s, y, { color: t.line, dash: [6 * s, 5 * s] });
      y += 21 * s;
      p.rect(m + 23 * s, y, textW, 70 * s,
        { fill: '#eef4e7', radius: 3 * s });
      const countW = hasMinutes ? textW / 2 : textW;
      p.text(`${d.counts.exerciseDays} 天`, m + 31 * s, y + 10 * s, countW - 16 * s,
        { size: 30 * s, weight: '700', font: 'title', color: '#587257', lineHeight: 38 * s, align: 'center' });
      p.text('运动打卡', m + 31 * s, y + 46 * s, countW - 16 * s,
        { size: 13 * s, color: '#71836b', lineHeight: 20 * s, align: 'center' });
      if (hasMinutes) {
        p.line(m + 23 * s + countW, y + 13 * s, m + 23 * s + countW, y + 58 * s,
          { color: '#cbd9c3', dash: [3 * s, 4 * s] });
        p.text(`${d.counts.exerciseMinutes} 分钟`, m + 23 * s + countW, y + 10 * s, countW,
          { size: 27 * s, weight: '700', font: 'title', color: '#587257', lineHeight: 38 * s, align: 'center' });
        p.text('已填写的时长', m + 23 * s + countW, y + 46 * s, countW,
          { size: 13 * s, color: '#71836b', lineHeight: 20 * s, align: 'center' });
      }
      y += 100 * s;
      if (records.length) y += p.rows(records, m + 23 * s, y, textW, rowOpts);
      else y += p.text('这段日期还没有运动打卡', m + 23 * s, y, textW,
        { size: 22 * s, color: t.muted, lineHeight: 31 * s });
      y += 25 * s;
      if (d.caption) {
        p.line(m + 23 * s, y, w - m - 23 * s, y, { color: t.line, dash: [6 * s, 5 * s] });
        p.text('沿途摘记', m + 23 * s, y + 18 * s, textW,
          { size: 15 * s, weight: '700', color: t.muted, lineHeight: 22 * s });
        y += 50 * s + p.text(d.caption, m + 23 * s, y + 50 * s, textW, noteOpts);
      }
      y += 28 * s;
      p.line(m + 23 * s, y, w - m - 23 * s, y, { color: t.line, dash: [6 * s, 5 * s] });
      p.text('轻轻记下这份活力', m + 23 * s, y + 21 * s, textW - 71 * s,
        { size: 17 * s, font: 'title', color: t.ink, lineHeight: 27 * s });
      p.text('机智定食 · 运动记录', m + 23 * s, y + 61 * s, textW - 71 * s,
        { size: 13 * s, color: t.muted, lineHeight: 21 * s });
      p.slot(w - m - 72 * s, y + 22 * s, 54 * s);
      p.slot(m + 23 * s, y + 104 * s, 42 * s);
      p.text('运动小票 · 真实记录', m + 79 * s, y + 115 * s, textW - 56 * s,
        { size: 12 * s, color: t.muted, lineHeight: 19 * s });
      return Math.max(height, y + 181 * s);
    }
  },
  {
    id: 'exercise-badges',
    kind: 'exercise',
    name: '活力徽章板',
    theme: {
      bg: '#fff7f2', paper: '#fffdf8', ink: '#705456', muted: '#a28384',
      accent: '#f6b8cc', line: '#eacbcb', tape: '#fff0d3',
      titleFont: 'Georgia, "Songti SC", "SimSun", serif'
    },
    draw(p, d, t) {
      const w = p.width, s = Math.max(.84, Math.min(1.4, w / 720));
      const m = Math.max(36, Math.round(42 * s)), inner = w - 2 * m;
      const rows = Array.isArray(d.exercises) ? d.exercises : [];
      const rowOpts = { size: 23 * s, lineHeight: 32 * s, gap: 17 * s,
        color: t.ink, metaColor: t.muted };
      const noteOpts = { size: 21 * s, color: t.ink, lineHeight: 31 * s };
      const rowsH = rows.length ? p.rowsHeight(rows, inner - 46 * s, rowOpts) : 47 * s;
      const captionH = d.caption ? p.measure(d.caption, inner - 46 * s, noteOpts) + 69 * s : 0;
      const title = d.isRange ? '收好这份活力' : (Number(d.counts.exerciseDays) > 0 ? '今天也有动一动' : '我的运动小记');
      const titleOpts = { size: 35 * s, weight: '700', font: 'title', color: t.ink, lineHeight: 44 * s };
      const dateOpts = { size: 18 * s, color: t.muted, lineHeight: 27 * s };
      const startY = 105 * s + p.measure(title, inner, titleOpts) + p.measure(d.dateLabel, inner, dateOpts) + 25 * s;
      const height = startY + 214 * s + 25 * s + (Number(d.counts.exerciseMinutes) > 0 ? 46 * s : 0)
        + 58 * s + rowsH + 28 * s + (captionH ? captionH + 21 * s : 0) + 76 * s;
      p.rect(0, 0, w, height, { fill: t.bg });
      p.headerTag('轻轻积累 · 活力徽章板', m, 36 * s, 284 * s,
        { fill: '#fce0e6', color: '#a76f7b' });
      const titleH = p.text(title, m, 94 * s, inner, titleOpts);
      let y = 105 * s + titleH;
      y += p.text(d.dateLabel, m, y, inner, dateOpts) + 25 * s;
      const boardH = 214 * s, centerX = w / 2, centerY = y + 107 * s;
      p.rect(m, y, inner, boardH, { fill: '#fff2e5', stroke: '#eed9bc', radius: 21 * s });
      p.circle(centerX, centerY, 82 * s, { fill: '#fffdf8', stroke: '#eec6c8' });
      p.circle(centerX, centerY, 73 * s, { stroke: '#f0d5d5' });
      p.text(String(d.counts.exerciseDays), centerX - 65 * s, centerY - 53 * s, 130 * s,
        { size: 67 * s, weight: '700', font: 'title', color: '#bc7785', lineHeight: 77 * s, align: 'center' });
      p.text('运动打卡天数', centerX - 70 * s, centerY + 29 * s, 140 * s,
        { size: 16 * s, weight: '700', color: '#997076', lineHeight: 24 * s, align: 'center' });
      const r = 36 * s, leftX = m + 55 * s, rightX = w - m - 55 * s;
      p.circle(leftX, y + 74 * s, r, { fill: '#dcead8', stroke: '#c4d8bd' });
      p.circle(rightX, y + 132 * s, r, { fill: '#e9e1f4', stroke: '#d4c8e5' });
      p.slot(leftX - 28 * s, y + 46 * s, 56 * s);
      p.slot(rightX - 28 * s, y + 104 * s, 56 * s);
      p.tape(m + 17 * s, y - 6 * s, 71 * s, { fill: t.tape, angle: -5 });
      y += boardH + 25 * s;
      if (Number(d.counts.exerciseMinutes) > 0) {
        p.text(`已填写时长 · ${d.counts.exerciseMinutes} 分钟`, m, y, inner,
          { size: 18 * s, color: t.muted, lineHeight: 28 * s, align: 'center' });
        y += 46 * s;
      }
      p.text('活动小清单', m + 23 * s, y, inner - 46 * s,
        { size: 19 * s, weight: '700', font: 'title', color: t.ink, lineHeight: 29 * s });
      p.line(m + 23 * s, y + 38 * s, w - m - 23 * s, y + 38 * s,
        { color: t.line, dash: [5 * s, 5 * s] });
      y += 58 * s;
      if (rows.length) y += p.rows(rows, m + 23 * s, y, inner - 46 * s, rowOpts);
      else y += p.text('这段日期还没有运动打卡', m + 23 * s, y, inner - 46 * s,
        { size: 22 * s, color: t.muted, lineHeight: 31 * s });
      y += 28 * s;
      if (d.caption) {
        p.rect(m, y, inner, captionH, { fill: '#f9e8ef', radius: 12 * s });
        p.text('留给自己的一句话', m + 23 * s, y + 17 * s, inner - 46 * s,
          { size: 16 * s, color: t.muted, lineHeight: 24 * s });
        p.text(d.caption, m + 23 * s, y + 49 * s, inner - 46 * s, noteOpts);
        y += captionH + 21 * s;
      }
      p.text('机智定食 · 每一次都值得被收好', m, y + 15 * s, inner - 88 * s,
        { size: 15 * s, font: 'title', color: t.muted, lineHeight: 24 * s });
      p.slot(w - m - 65 * s, y - 2 * s, 58 * s);
      return Math.max(height, y + 76 * s);
    }
  }
];


// Themes describe paint; layouts describe composition and never read application state.
export const SHARE_THEMES_A = Object.freeze(Object.fromEntries(definitions.map(item => [item.id, Object.freeze({...item.theme})])));
export const SHARE_LAYOUTS_A = Object.freeze(definitions.map(({theme, ...layout}) => Object.freeze({...layout, themeId: layout.id})));
