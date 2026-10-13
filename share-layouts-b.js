/* One shared record model; these templates only arrange the supplied content. */
const definitions = (() => {
  const pad = 36;
  const body = (t, extra = {}) => ({size: 21, lineHeight: 30, color: t.ink, ...extra});
  const title = (t, extra = {}) => ({size: 34, lineHeight: 45, weight: '700', font: 'title', color: t.ink, ...extra});
  const dateText = d => d.isRange ? d.rangeLabel : d.dateLabel;
  const footer = (p, t, y, label, stickerCorners = false) => {
    const inset = stickerCorners ? 58 : 0;
    p.line(pad + inset, y, p.width - pad - inset, y, {color: t.line, dash: [3, 5]});
    p.text(label, pad + inset, y + 17, p.width - pad * 2 - inset * 2, {size: 15, lineHeight: 21, color: t.muted, align: 'center'});
    if (stickerCorners) {
      p.slot(pad, y + 2, 44);
      p.slot(p.width - pad - 44, y + 2, 44);
    }
    return y + 60;
  };
  const optionalCaption = (p, d, t, y, x, w, options = {}) => {
    if (!d.caption) return y;
    const captionHeight = p.measure(d.caption, w - 40, body(t));
    p.rect(x, y, w, captionHeight + 74, {fill: options.fill || t.paper, stroke: t.line, radius: options.radius || 0});
    p.text('本日摘记', x + 20, y + 15, w - 40, {size: 15, lineHeight: 22, weight: '600', color: t.muted});
    p.text(d.caption, x + 20, y + 44, w - 40, body(t));
    return y + captionHeight + 92;
  };

  const notebook = {
    id: 'study-notebook', kind: 'study', name: '自习室笔记页',
    theme: {bg: '#F8F1F8', paper: '#FFFCF4', ink: '#4F424C', muted: '#867684', accent: '#B89BCE', line: '#DCD3E4', tape: '#E7DEF1', titleFont: 'Georgia, "KaiTi", "Kaiti SC", serif'},
    draw(p, d, t) {
      const w = p.width, contentW = w - 126, x = 86;
      const rows = d.studies || [];
      const rowOpts = body(t, {gap: 20, metaColor: t.muted});
      const titleH = p.measure('自习室笔记', contentW - 82, title(t));
      let y = 50 + titleH;
      const dateH = p.measure(dateText(d), contentW, {size: 17, lineHeight: 25, color: t.muted});
      y += dateH + 46;
      const metricText = [d.counts.studyDays + ' 个学习打卡日', d.counts.studyMinutes > 0 ? '已记录 ' + d.counts.studyMinutes + ' 分钟' : ''].filter(Boolean).join('  ·  ');
      const metricH = p.measure(metricText, contentW - 28, {size: 18, lineHeight: 27, weight: '600'});
      const rowsH = rows.length ? p.rowsHeight(rows, contentW, rowOpts) : p.measure('这段日期还没有学习打卡。', contentW, body(t));
      const captionH = d.caption ? p.measure(d.caption, contentW - 40, body(t)) + 92 : 0;
      const height = y + metricH + rowsH + captionH + 166;

      p.rect(0, 0, w, height, {fill: t.bg});
      p.rect(24, 24, w - 48, height - 48, {fill: t.paper, stroke: t.line, radius: 5});
      p.line(69, 38, 69, height - 42, {color: '#DFB6C6', width: 1.5});
      // Writing rules remain faint; the foreground text always draws afterwards.
      for (let ly = y + metricH + 53; ly < height - 92; ly += 30) p.line(79, ly, w - 43, ly, {color: '#E8E1ED', width: 1});
      for (let hy = 74; hy < height - 58; hy += 140) p.circle(45, hy, 5, {fill: '#F8F1F8', stroke: '#D9CEDD'});
      p.tape(w - 162, 31, 106, {fill: t.tape, angle: 3.5});
      p.text('自习室笔记', x, 50, contentW - 82, title(t));
      p.slot(w - 118, 62, 54);
      p.slot(28, height - 148, 33);
      p.slot(27, height - 83, 35);
      p.text(dateText(d), x, 50 + titleH + 12, contentW, {size: 17, lineHeight: 25, color: t.muted});
      p.rect(x - 4, y - 4, contentW + 8, metricH + 17, {fill: '#F5EDC8', radius: 2});
      p.text(metricText, x + 10, y + 3, contentW - 28, {size: 18, lineHeight: 27, weight: '600', color: t.ink});
      y += metricH + 45;
      if (rows.length) y += p.rows(rows, x, y, contentW, rowOpts);
      else y += p.text('这段日期还没有学习打卡。', x, y, contentW, body(t, {color: t.muted}));
      y += 26;
      y = optionalCaption(p, d, t, y, x, contentW, {fill: '#F0EAF6'});
      return footer(p, t, y + 12, '机智定食  ·  今天认真生活了一点点');
    }
  };

  const library = {
    id: 'study-library', kind: 'study', name: '图书借阅卡',
    theme: {bg: '#EBE4DA', paper: '#FBF4E6', ink: '#514739', muted: '#8E7F6B', accent: '#B98E94', line: '#CFC3AF', tape: '#D8E3D1', titleFont: 'Georgia, "Songti SC", "SimSun", serif'},
    draw(p, d, t) {
      const w = p.width, x = 40, cardW = w - 80, innerX = x + 24, innerW = cardW - 48;
      const rows = d.studies || [];
      const rowW = innerW - 68;
      const rowSizing = rows.map(row => {
        const nameH = p.measure(row.title || '', rowW - 28, {size: 23, lineHeight: 32, weight: '600'});
        const metaH = row.meta ? p.measure(row.meta, rowW - 28, {size: 17, lineHeight: 25}) + 7 : 0;
        const noteH = row.note ? p.measure(row.note, rowW - 28, body(t, {size: 19, lineHeight: 28})) + 10 : 0;
        return Math.max(74, nameH + metaH + noteH + 32);
      });
      const titleH = p.measure('图书借阅卡', innerW - 66, title(t, {size: 38, lineHeight: 47}));
      const dateH = p.measure(dateText(d), innerW, {size: 18, lineHeight: 27});
      let startY = 61 + titleH + 16 + dateH + 30;
      const metric = '学习打卡 ' + d.counts.studyDays + ' 天' + (d.counts.studyMinutes > 0 ? '  /  记录时长 ' + d.counts.studyMinutes + ' 分钟' : '');
      const metricH = p.measure(metric, innerW - 24, {size: 18, lineHeight: 27});
      startY += metricH + 72;
      const totalRowsH = rows.length ? rowSizing.reduce((sum, h) => sum + h, 0) : 86;
      const captionH = d.caption ? p.measure(d.caption, innerW - 40, body(t)) + 92 : 0;
      const height = startY + totalRowsH + captionH + 112;
      p.rect(0, 0, w, height, {fill: t.bg});
      p.rect(x, 32, cardW, height - 64, {fill: t.paper, stroke: t.line, radius: 4});
      p.rect(x + 26, 19, 124, 28, {fill: '#D8E3D1', stroke: t.line, radius: 3});
      p.text('学习 · 生活索引', x + 33, 24, 110, {size: 14, lineHeight: 18, weight: '600', color: t.ink, align: 'center'});
      p.text('图书借阅卡', innerX, 61, innerW - 66, title(t, {size: 38, lineHeight: 47}));
      p.slot(w - 121, 61, 52);
      p.text(dateText(d), innerX, 61 + titleH + 16, innerW, {size: 18, lineHeight: 27, color: t.muted});
      let y = 61 + titleH + 16 + dateH + 30;
      p.rect(innerX, y, innerW, metricH + 22, {fill: '#F3E3D5', stroke: t.line});
      p.text(metric, innerX + 12, y + 11, innerW - 24, {size: 18, lineHeight: 27, weight: '600', color: t.ink});
      y += metricH + 42;
      p.rect(innerX, y, innerW, 30, {fill: '#EEE5D5', stroke: t.line});
      p.text('序', innerX, y + 5, 68, {size: 14, lineHeight: 20, color: t.muted, align: 'center'});
      p.text('内容 / 实际记录', innerX + 81, y + 5, rowW - 20, {size: 14, lineHeight: 20, color: t.muted});
      y += 30;
      if (!rows.length) {
        p.rect(innerX, y, innerW, 86, {fill: t.paper, stroke: t.line});
        p.text('这段日期还没有学习打卡。', innerX + 20, y + 27, innerW - 40, body(t, {color: t.muted}));
        y += 86;
      }
      rows.forEach((row, i) => {
        const rh = rowSizing[i];
        p.rect(innerX, y, innerW, rh, {fill: t.paper, stroke: t.line});
        p.line(innerX + 68, y, innerX + 68, y + rh, {color: t.line});
        p.text(String(i + 1).padStart(2, '0'), innerX + 6, y + 18, 56, {size: 18, lineHeight: 25, font: 'title', color: t.muted, align: 'center'});
        let ty = y + 15;
        ty += p.text(row.title || '', innerX + 82, ty, rowW - 28, {size: 23, lineHeight: 32, weight: '600', color: t.ink});
        if (row.meta) ty += 7 + p.text(row.meta, innerX + 82, ty + 7, rowW - 28, {size: 17, lineHeight: 25, color: t.muted});
        if (row.note) p.text(row.note, innerX + 82, ty + 10, rowW - 28, body(t, {size: 19, lineHeight: 28}));
        y += rh;
      });
      y += 24;
      y = optionalCaption(p, d, t, y, innerX, innerW, {fill: '#F7EDDD'});
      return footer(p, t, y + 12, '机智定食  ·  为今天留下一个索引', true);
    }
  };

  const collage = {
    id: 'life-collage', kind: 'life', name: '一天生活拼贴',
    theme: {bg: '#FFF5F7', paper: '#FFFDFA', ink: '#644A53', muted: '#A08791', accent: '#DC8FAB', line: '#E6CAD5', tape: '#F4C6D7', titleFont: 'Georgia, "KaiTi", "Kaiti SC", serif'},
    draw(p, d, t) {
      const w = p.width, contentW = w - pad * 2;
      const groups = d.groups || [];
      const paperStyles = {
        meal: {fill: '#FFF9EF', tab: '#F4C6D7', label: '吃饭的小日常'},
        exercise: {fill: '#F0F6ED', tab: '#DCEAD8', label: '动一动的时刻'},
        study: {fill: '#F2EDF8', tab: '#E9E1F4', label: '认真学习了一点'}
      };
      const titleH = p.measure(dateText(d), contentW - 64, title(t, {size: 39, lineHeight: 50}));
      let y = 62 + titleH + 48;
      const blocks = groups.map((group, i) => {
        const blockW = i % 2 ? contentW - 26 : contentW - 18;
        const blockX = i % 2 ? pad + 26 : pad;
        const rowOpts = body(t, {size: 21, lineHeight: 30, gap: 14, metaColor: t.muted});
        const textH = p.rowsHeight(group.rows || [], blockW - 44, rowOpts);
        const blockH = textH + 87;
        const result = {group, x: blockX, y, w: blockW, h: blockH, rowOpts, paper: paperStyles[group.kind] || {fill: t.paper, tab: t.tape, label: group.label}};
        y += blockH + 33;
        return result;
      });
      const lifeRows = d.lifeRows || [];
      const diaryH = lifeRows.length ? p.rowsHeight(lifeRows, contentW - 50, body(t, {gap: 16, metaColor: t.muted})) + 83 : 0;
      const emptyH = !blocks.length && !lifeRows.length ? 86 : 0;
      const captionH = d.caption ? p.measure(d.caption, contentW - 40, body(t)) + 92 : 0;
      const height = y + diaryH + (diaryH ? 27 : 0) + emptyH + captionH + 72;
      p.rect(0, 0, w, height, {fill: t.bg});
      p.dots(0, 0, w, height, {color: '#EDCEDB', step: 24});
      p.rect(pad, 31, 151, 22, {fill: '#FFF0D3', radius: 2});
      p.text(d.isRange ? '生活碎片 · 一起翻看' : '今天的小拼贴', pad + 9, 34, 135, {size: 13, lineHeight: 18, color: t.muted});
      p.text(dateText(d), pad, 62, contentW - 64, title(t, {size: 39, lineHeight: 50}));
      p.slot(w - 102, 64, 52);
      blocks.forEach(block => {
        p.rect(block.x + 3, block.y + 4, block.w, block.h, {fill: '#EBDDE2', radius: 4});
        p.rect(block.x, block.y, block.w, block.h, {fill: block.paper.fill, stroke: t.line, radius: 4});
        p.tape(block.x + block.w - 133, block.y - 10, 92, {fill: block.paper.tab, angle: block.group.kind === 'exercise' ? -4.5 : 3});
        p.headerTag(block.group.label || block.paper.label, block.x + 17, block.y + 15, Math.min(block.w - 45, 205), {fill: block.paper.tab, color: t.ink});
        p.rows(block.group.rows || [], block.x + 22, block.y + 61, block.w - 44, block.rowOpts);
      });
      if (diaryH) {
        p.rect(pad + 8, y, contentW - 8, diaryH, {fill: '#FFF8DA', stroke: '#E9DDBA', radius: 1});
        p.text('心情 / 今日小故事', pad + 29, y + 17, contentW - 50, {size: 16, lineHeight: 24, weight: '600', color: '#A58C55'});
        p.rows(lifeRows, pad + 29, y + 55, contentW - 50, body(t, {gap: 16, metaColor: t.muted}));
        y += diaryH + 27;
      }
      if (emptyH) {
        p.text('这段日期没有可分享的记录。', pad + 16, y + 12, contentW - 32, body(t, {color: t.muted}));
        y += emptyH;
      }
      y = optionalCaption(p, d, t, y, pad, contentW, {fill: t.paper, radius: 3});
      return footer(p, t, y + 12, '机智定食  ·  小小日常，也值得留存', true);
    }
  };

  const report = {
    id: 'life-report', kind: 'life', name: '月末生活月报',
    theme: {bg: '#F7F0E9', paper: '#FFFDF7', ink: '#66504D', muted: '#9A827B', accent: '#D899AE', line: '#E1D3C9', tape: '#ECD1DC', titleFont: 'Georgia, "Songti SC", "SimSun", serif'},
    draw(p, d, t) {
      const w = p.width, x = pad, innerW = w - pad * 2;
      const heading = d.scope === 'month' ? '机智生活月报' : d.isRange ? '机智生活回顾' : '机智一日小报';
      const titleH = p.measure(heading, innerW - 62, title(t, {size: 38, lineHeight: 48}));
      const dateH = p.measure(dateText(d), innerW, {size: 18, lineHeight: 27});
      let y = 56 + titleH + 14 + dateH + 29;
      const countHeight = 121;
      y += countHeight + 31;
      const highlights = d.highlights || [];
      const rowOpts = body(t, {size: 20, lineHeight: 29, gap: 14, metaColor: t.muted});
      const highlightH = highlights.length ? p.rowsHeight(highlights, innerW - 46, rowOpts) + 81 : 0;
      const diaryRows = d.lifeRows || [];
      const diaryH = diaryRows.length ? p.rowsHeight(diaryRows, innerW - 44, rowOpts) + 70 : 0;
      const captionH = d.caption ? p.measure(d.caption, innerW - 40, body(t)) + 92 : 0;
      const height = y + highlightH + (highlightH ? 25 : 0) + diaryH + (diaryH ? 20 : 0) + captionH + 75;
      p.rect(0, 0, w, height, {fill: t.bg});
      p.rect(20, 21, w - 40, height - 42, {fill: t.paper, stroke: t.line, radius: 6});
      p.text(heading, x, 56, innerW - 62, title(t, {size: 38, lineHeight: 48}));
      p.slot(w - 103, 56, 50);
      p.text(dateText(d), x, 56 + titleH + 14, innerW, {size: 18, lineHeight: 27, color: t.muted});
      y = 56 + titleH + 14 + dateH + 29;
      const cellW = innerW / 3;
      const metrics = [
        {value: d.counts.mealCount, label: '餐食记录', fill: '#F8E0E9'},
        {value: d.counts.exerciseDays, label: '运动打卡天数', fill: '#EAF2E4'},
        {value: d.counts.studyDays, label: '学习打卡天数', fill: '#F0EAF7'}
      ];
      metrics.forEach((metric, i) => {
        p.rect(x + i * cellW, y, cellW, countHeight, {fill: metric.fill, stroke: t.line});
        p.text(String(metric.value), x + i * cellW + 8, y + 18, cellW - 16, {size: 42, lineHeight: 52, weight: '700', font: 'title', color: t.ink, align: 'center'});
        p.text(metric.label, x + i * cellW + 10, y + 78, cellW - 20, {size: 15, lineHeight: 21, color: t.muted, align: 'center'});
      });
      y += countHeight + 31;
      if (highlightH) {
        p.rect(x, y, innerW, highlightH, {fill: '#FFF3D9', stroke: '#EADDBF', radius: 2});
        p.tape(x + 24, y - 9, 88, {fill: '#EFDAB3', angle: -2.5});
        p.text('记录里的小亮点', x + 23, y + 21, innerW - 46, {size: 18, lineHeight: 26, weight: '600', font: 'title', color: t.ink});
        p.rows(highlights, x + 23, y + 61, innerW - 46, rowOpts);
        y += highlightH + 25;
      }
      if (diaryH) {
        p.rect(x, y, innerW, diaryH, {fill: '#F8F1EE', stroke: t.line, radius: 2});
        p.text('生活摘录', x + 22, y + 16, innerW - 44, {size: 16, lineHeight: 23, weight: '600', color: t.muted});
        p.rows(diaryRows, x + 22, y + 48, innerW - 44, rowOpts);
        y += diaryH + 20;
      }
      y = optionalCaption(p, d, t, y, x, innerW, {fill: '#FFF4E4'});
      return footer(p, t, y + 12, '机智定食  ·  收藏这一段生活', true);
    }
  };
  return [notebook, library, collage, report];
})();


// Themes describe paint; layouts describe composition and never read application state.
export const SHARE_THEMES_B = Object.freeze(Object.fromEntries(definitions.map(item => [item.id, Object.freeze({...item.theme})])));
export const SHARE_LAYOUTS_B = Object.freeze(definitions.map(({theme, ...layout}) => Object.freeze({...layout, themeId: layout.id})));
