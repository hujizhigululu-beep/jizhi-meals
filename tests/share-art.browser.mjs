import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

// Real, local PNG samples for art review. Fixtures never use personal records.
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const output = resolve(process.env.SHARE_ART_OUTPUT || '/workspace/artifacts/jizhi-share-art');
const engine = process.env.SHARE_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const templates = [
  { id: 'meal-strawberry', kind: 'meal', file: 'strawberry' },
  { id: 'exercise-badges', kind: 'exercise', file: 'badges' },
  { id: 'life-collage', kind: 'life', file: 'collage' },
];
const formats = ['portrait', 'long', 'square'];
const report = { engine, viewport: { width: 390, height: 844 }, generatedAt: new Date().toISOString(), results: [], failures: [], browserErrors: [] };
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.svg': 'image/svg+xml', '.png': 'image/png', '.css': 'text/css' };
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/__share-art.html') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>分享美术样板验证</title><style>html,body{margin:0;width:100%;background:#fff7fa}#preview{display:block;width:100%;height:auto}</style><body></body></html>');
    return;
  }
  const path = resolve(root, '.' + decodeURIComponent(url.pathname));
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
    response.end(await readFile(path));
  } catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
const check = async (name, operation) => {
  try { await operation(); }
  catch (error) {
    report.failures.push({ name, message: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
};
try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}) });
  const page = await browser.newPage({ viewport: report.viewport, timezoneId: 'Asia/Shanghai' });
  page.on('pageerror', error => report.browserErrors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.browserErrors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/__share-art.html`);
  await page.evaluate(async () => {
    window.shareModule = await import('./share-journal.js');
    window.book = {
      schemaVersion: 2,
      inventory: [{ id: 'food-1', name: '牛肉丸', quantity: 8, perMeal: 1 }],
      meals: [
        { id: 'b', date: '2026-10-13', slot: 'breakfast', name: '牛奶可颂', completed: true, note: '这段餐食备注仍然私密' },
        { id: 'l', date: '2026-10-13', slot: 'lunch', name: '牛肉丸蔬菜便当', completed: true, note: '' },
        { id: 'd', date: '2026-10-13', slot: 'dinner', name: '番茄鸡蛋乌冬', completed: false, note: '' },
        { id: 's', date: '2026-10-13', slot: 'snack', name: '草莓小蛋糕', time: '15:30', completed: true, note: '' },
      ],
      dayRecords: [{ date: '2026-10-13',
        exercise: { checked: true, items: [
          { id: 'walk', content: '河边散步', minutes: 35, note: '晚风软软的，走过一小段落日。' },
          { id: 'stretch', content: '睡前拉伸', minutes: 15, note: '肩膀松开啦 (˶ᵔ ᵕ ᵔ˶)' },
          { id: 'bike', content: '轻松骑行', minutes: 20, note: '沿着熟悉的小路慢慢骑。' },
        ] },
        study: { checked: true, items: [
          { id: 'japanese', content: '日语 · 日常问候', minutes: 25, note: '把喜欢的句子抄在页角。' },
          { id: 'reading', content: '读《小王子》', minutes: 20, note: '读到一朵特别的小玫瑰。' },
        ] }, stickerIds: ['milk', 'strawberry', 'book'] }],
      diaries: [{ date: '2026-10-13', mood: '甜甜的平静 ♡', joy: '路边的小花也在认真开呀。', text: '把晚饭煮得热乎乎的，听着歌收拾小桌子。\n今天的普通小事，也想好好收起来。' }],
    };
    window.initialBook = JSON.stringify(book);
    localStorage.setItem('jizhi-meals-v1', initialBook);
    localStorage.setItem('share-art-keep', '原有备份标记');
    window.storageSnapshot = () => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
    window.initialStorage = storageSnapshot();
    window.drawnText = [];
    // Use the complete affine transform. Rotated paper groups must be checked
    // in pixel coordinates rather than treating matrix.a as a simple scale.
    const originalFillText = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function(value, x, y, maxWidth) {
      const text = String(value), metrics = this.measureText(text), matrix = this.getTransform();
      const fontSize = Number(this.font.match(/([\d.]+)px/)?.[1] || 0);
      const measuredWidth = metrics.width;
      const compression = typeof maxWidth === 'number' && maxWidth > 0 && measuredWidth > maxWidth ? maxWidth / measuredWidth : 1;
      const left = x - metrics.actualBoundingBoxLeft * compression;
      const right = x + metrics.actualBoundingBoxRight * compression;
      const top = y - metrics.actualBoundingBoxAscent;
      const bottom = y + metrics.actualBoundingBoxDescent;
      const points = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([px, py]) => ({
        x: matrix.a * px + matrix.c * py + matrix.e,
        y: matrix.b * px + matrix.d * py + matrix.f,
      }));
      drawnText.push({ text, fontSize, left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
        top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)), width: this.canvas.width, height: this.canvas.height });
      return maxWidth === undefined ? originalFillText.call(this, value, x, y) : originalFillText.call(this, value, x, y, maxWidth);
    };
    window.makeBook = variant => {
      const state = structuredClone(book);
      if (variant === 'sparse') {
        state.meals = [state.meals[0]];
        state.dayRecords[0].exercise.items = [];
        state.dayRecords[0].study.checked = false;
        state.dayRecords[0].study.items = [];
        state.diaries = [];
      } else if (variant === 'long') {
        const title = '草莓牛奶手账里的超长中文记录👩‍🎨🧑🏽‍🍳'.repeat(8) + '【标题末尾完整】';
        const note = ['第一行：听风经过树叶 🍃。'.repeat(5), '第二行：慢慢走，慢慢记，今天也很可爱。'.repeat(5), '第三行：组合 Emoji 👩‍🎨🧑🏽‍🍳 与中文一起好好保存。【备注末尾完整】'].join('\n');
        state.meals = [{ ...state.meals[0], name: title }];
        state.dayRecords[0].exercise.items = [{ content: title, minutes: 35, note }];
        state.dayRecords[0].study.items = [{ content: '读一本很长很长的故事书', minutes: 20, note: '书页里的小确幸。' }];
        state.diaries[0] = { ...state.diaries[0], text: note + '\n【日记末尾完整】' };
      } else if (variant === 'range') {
        state.meals = ['2026-12-31', '2027-01-01'].flatMap((date, day) => state.meals.slice(0, 2).map((meal, index) => ({ ...meal, id: `${day}-${index}`, date, name: `${day ? '新年' : '年末'}·${meal.name}` })));
        state.dayRecords = ['2026-12-31', '2027-01-01'].map(date => ({ ...structuredClone(book.dayRecords[0]), date, exercise: { checked: true, items: book.dayRecords[0].exercise.items.slice(0, 2) }, study: { checked: true, items: book.dayRecords[0].study.items.slice(0, 1) } }));
        state.diaries = ['2026-12-31', '2027-01-01'].map(date => ({ date, mood: '新年快乐 ♡', joy: '看见了第一缕阳光', text: `${date} 的小故事也收好啦。` }));
      } else if (variant === 'hostile') {
        const html = '<img src=x onerror="globalThis.shareArtExecuted=true"><script>globalThis.shareArtExecuted=true</script> & <b>纯文本</b>';
        state.meals = [{ ...state.meals[0], name: html }];
        state.dayRecords[0].exercise.items = [{ content: html, minutes: 10, note: html }];
        state.dayRecords[0].study.items = [];
        state.diaries[0] = { ...state.diaries[0], mood: html, joy: html, text: html };
      } else if (variant === 'privacy') {
        state.diaries[0] = { date: '2026-10-13', mood: '私密心情不得导出', joy: '私密小确幸不得导出', text: '私密日记不得导出' };
        state.dayRecords[0].exercise.items[0].note = '私密运动备注不得导出';
        state.dayRecords[0].study.items[0].note = '私密学习备注不得导出';
      } else if (variant === 'empty') {
        state.meals = []; state.dayRecords = []; state.diaries = [];
      }
      return state;
    };
  });

  const generate = async (template, variant, format) => page.evaluate(async ({ template, variant, format }) => {
    const state = makeBook(variant), before = JSON.stringify(state);
    const options = { kind: template.kind, template: template.id, date: '2026-10-13', format, notes: true, diary: true, mood: true, joy: true, stickerIds: [] };
    if (variant === 'range') Object.assign(options, { scope: 'range', start: '2026-12-31', end: '2027-01-01' });
    if (variant === 'privacy') Object.assign(options, { notes: false, diary: false, mood: false, joy: false });
    drawnText.length = 0;
    try {
      const card = await shareModule.generateJournalShareCard(state, options);
      const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result); reader.readAsDataURL(card.blob); });
      const image = new Image(); image.src = dataUrl; await image.decode();
      const escaped = drawnText.filter(row => row.left < -2 || row.right > row.width + 2 || row.top < -2 || row.bottom > row.height + 2);
      const existingPreview = document.getElementById('preview'); existingPreview?.remove();
      image.id = 'preview'; document.body.append(image);
      const box = image.getBoundingClientRect();
      return { dataUrl, width: card.width, height: card.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
        type: card.blob.type, bytes: card.blob.size, text: card.text, painted: drawnText.map(row => row.text).join(''), data: card.data, stickerCount: card.stickerCount, escaped,
        visibleWidth: box.width, mobileOverflow: document.documentElement.scrollWidth > innerWidth,
        unchanged: JSON.stringify(state) === before && JSON.stringify(book) === initialBook && storageSnapshot() === initialStorage,
        executed: globalThis.shareArtExecuted === true, injectedNode: Boolean(document.querySelector('script,img[src="x"]')) };
    } catch (error) {
      return { error: error.message, unchanged: JSON.stringify(state) === before && JSON.stringify(book) === initialBook && storageSnapshot() === initialStorage };
    }
  }, { template, variant, format });

  const verifyPNG = async (template, variant, format, filename) => {
    const result = await generate(template, variant, format);
    assert.equal(result.error, undefined, `${template.id}/${variant}/${format}: ${result.error}`);
    const { dataUrl, text, data, escaped, ...details } = result;
    const png = Buffer.from(dataUrl.split(',')[1], 'base64');
    const imageHash = createHash('sha256').update(png).digest('hex');
    // Save generated images even on a subsequent assertion failure, for review.
    if (filename) await writeFile(resolve(output, filename), png);
    report.results.push({ template: template.id, variant, format, filename, ...details, escaped, text, counts: data.counts, hash: imageHash });
    assert.equal(result.type, 'image/png'); assert.ok(result.bytes > 5000);
    assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(result.width, result.naturalWidth); assert.equal(result.height, result.naturalHeight);
    assert.equal(result.stickerCount, 0); assert.equal(result.unchanged, true);
    assert.equal(result.mobileOverflow, false); assert.equal(result.visibleWidth, 390);
    assert.equal(result.executed, false); assert.equal(result.injectedNode, false);
    assert.deepEqual(escaped, [], `painted text escaped PNG: ${JSON.stringify(escaped)}`);
    assert.doesNotMatch(text.join(' '), /这段餐食备注仍然私密/);
    if (format === 'square') assert.equal(result.width, result.height);
    if (variant === 'normal') {
      assert.equal(data.counts.mealCount, 4); assert.equal(data.counts.exerciseMinutes, 70); assert.equal(data.counts.studyMinutes, 45);
    }
    if (variant === 'long') {
      assert.ok(text.some(part => part.includes('【标题末尾完整】')), 'complete long title should remain');
      assert.ok(text.some(part => part.includes('【日记末尾完整】')), 'complete multiline diary should remain');
      if (template.kind !== 'meal') assert.ok(text.some(part => part.includes('【备注末尾完整】')), 'complete multiline notes should remain');
      assert.match(result.painted, /【标题末尾完整】/, 'long title tail must actually reach Canvas');
      assert.match(result.painted, /【日记末尾完整】/, 'multiline diary tail must actually reach Canvas');
      if (template.kind !== 'meal') assert.match(result.painted, /【备注末尾完整】/, 'note tail must actually reach Canvas');
    }
    if (variant === 'range') {
      assert.equal(data.counts.mealDays, 2); assert.equal(data.counts.mealCount, 4);
      assert.equal(data.counts.exerciseDays, 2); assert.equal(data.counts.studyDays, 2);
      assert.equal(data.counts.exerciseMinutes, 100); assert.equal(data.counts.studyMinutes, 50);
      assert.equal(data.start, '2026-12-31'); assert.equal(data.end, '2027-01-01');
      assert.match(JSON.stringify(data), /2026年12月31日/); assert.match(JSON.stringify(data), /2027年1月1日/);
    }
    if (variant === 'privacy') assert.doesNotMatch(JSON.stringify({ text, data }), /私密.*不得导出/);
    if (variant === 'hostile') assert.ok(text.some(part => part.includes('<script>globalThis.shareArtExecuted=true</script>')), 'HTML-looking input remains literal text');
    return result;
  };

  for (const template of templates) {
    for (const format of formats) await check(`${template.id}: normal ${format}`, () => verifyPNG(template, 'normal', format, format === 'portrait' ? `${template.file}.png` : `${template.file}-${format}.png`));
    await check(`${template.id}: sparse portrait`, () => verifyPNG(template, 'sparse', 'portrait', `${template.file}-sparse.png`));
    await check(`${template.id}: long text`, () => verifyPNG(template, 'long', 'long', `${template.file}-long-text.png`));
    await check(`${template.id}: cross-year range`, () => verifyPNG(template, 'range', 'long', `${template.file}-range.png`));
    await check(`${template.id}: hidden personal fields`, () => verifyPNG(template, 'privacy', 'portrait'));
    await check(`${template.id}: literal HTML`, () => verifyPNG(template, 'hostile', 'long'));
    await check(`${template.id}: empty refusal`, async () => {
      const result = await generate(template, 'empty', 'portrait');
      assert.match(result.error, /没有可分享/); assert.equal(result.unchanged, true);
      report.results.push({ template: template.id, variant: 'empty', format: 'portrait', error: result.error, unchanged: result.unchanged });
    });
  }
  await check('three distinct compositions', async () => {
    const normals = report.results.filter(row => row.variant === 'normal' && row.format === 'portrait');
    assert.equal(normals.length, 3); assert.equal(new Set(normals.map(row => row.hash)).size, 3);
  });
  await check('browser assets and execution', async () => { assert.deepEqual(report.browserErrors, []); });
} catch (error) {
  report.failures.push({ name: 'browser setup', message: error.message });
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  report.passed = report.failures.length === 0;
  await writeFile(resolve(output, `${engine}-art-results.json`), JSON.stringify(report, null, 2));
  const summary = `${engine}: ${report.results.filter(row => row.bytes).length} real PNG validations; ${report.failures.length} failures.\n` +
    `390×844 mobile viewport; three compositions × portrait/long/square; sparse and long Chinese/Emoji previews; cross-year ranges, privacy, plain text and unchanged records.\n` +
    report.failures.map(failure => `FAIL ${failure.name}: ${failure.message}`).join('\n') + '\n';
  await writeFile(resolve(output, 'verification.txt'), summary);
  console.log(summary);
  if (!report.passed) process.exitCode = 1;
}
