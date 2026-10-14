import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const output = resolve(process.env.SHARE_SCREENSHOTS || 'tests/ui-previews/v14-share');
await mkdir(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  if (req.url === '/__share-test.html') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>分享图片验证</title>'); return; }
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'text/plain'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browserName = process.env.SHARE_ENGINE === 'webkit' ? 'webkit' : 'chrome';
const browser = await (browserName === 'webkit' ? webkit : chromium).launch({ headless: true, ...(browserName === 'chrome' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const results = [];
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai' });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
  await page.goto(`http://127.0.0.1:${server.address().port}/__share-test.html`);
  const templates = await page.evaluate(async () => {
    window.module = await import('./share-journal.js');
    window.book = {
      inventory: [{ id: 'a', name: '保留的食材', quantity: 9 }],
      meals: ['breakfast', 'lunch', 'dinner', 'snack'].map((slot, i) => ({ date: '2026-10-13', slot, name: ['牛奶吐司', '牛肉丸蔬菜便当', '番茄鸡蛋面', '小苹果'][i], completed: i !== 2, note: '不分享的私密餐食备注', time: slot === 'snack' ? '15:30' : '' })),
      dayRecords: [{ date: '2026-10-13', study: { checked: true, items: [{ content: '日语动词变化👩‍🎨', minutes: 60, note: '第一行学习摘记\n第二行保留换行' }] }, exercise: { checked: true, items: [{ content: '散步', minutes: null, note: '看见路边开了一朵小花🌼' }, { content: '拉伸', minutes: 10, note: '' }] }, stickerIds: ['milk', 'strawberry', 'heart'] }],
      diaries: [{ date: '2026-10-13', mood: '开心', joy: '看见小花', text: '今天把真实的生活收在手账里。\n第二行👩‍🎨🧑🏽‍🍳' }],
    };
    localStorage.setItem('jizhi-ai-test-book-v1', JSON.stringify(book)); window.savedBook = JSON.stringify(book);
    const actual = CanvasRenderingContext2D.prototype.fillText;
    window.drawn = [];
    CanvasRenderingContext2D.prototype.fillText = function (text, x, y, ...args) {
      // Group rotations change all six affine components. Compare actual glyph
      // bounds in pixel space so every layout keeps the same full-image check.
      const matrix = this.getTransform(), metrics = this.measureText(text);
      const maxWidth = args[0], compression = typeof maxWidth === 'number' && maxWidth > 0 && metrics.width > maxWidth ? maxWidth / metrics.width : 1;
      const left = x - metrics.actualBoundingBoxLeft * compression, right = x + metrics.actualBoundingBoxRight * compression;
      const top = y - metrics.actualBoundingBoxAscent, bottom = y + metrics.actualBoundingBoxDescent;
      const points = [[left, top], [right, top], [right, bottom], [left, bottom]].map(([px, py]) => ({
        x: matrix.a * px + matrix.c * py + matrix.e,
        y: matrix.b * px + matrix.d * py + matrix.f,
      }));
      window.drawn.push({ text, left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)),
        y: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)), width: this.canvas.width, height: this.canvas.height });
      return actual.call(this, text, x, y, ...args);
    };
    return module.SHARE_TEMPLATES.map(({ id, kind }) => ({ id, kind }));
  });
  for (const template of templates) for (const format of ['portrait', 'long', 'square']) {
    const result = await page.evaluate(async ({ id, kind, format }) => {
      drawn.length = 0;
      let card;
      try { card = await module.generateJournalShareCard(book, { kind, template: id, date: '2026-10-13', format, notes: true, diary: true, mood: true, joy: true }); }
      catch (error) { throw new Error(`${id}/${format}: ${error.message}`); }
      const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(card.blob); });
      const image = new Image(); image.src = dataUrl; await image.decode();
      const escaped = drawn.filter(row => row.left < -.1 || row.right > row.width + .1 || row.y < 0 || row.bottom > row.height);
      return { dataUrl, width: card.width, height: card.height, imageWidth: image.naturalWidth, imageHeight: image.naturalHeight, type: card.blob.type, size: card.blob.size, stickerCount: card.stickerCount, text: card.text, escaped, unchanged: JSON.stringify(book) === savedBook && localStorage.getItem('jizhi-ai-test-book-v1') === savedBook };
    }, { ...template, format });
    assert.equal(result.type, 'image/png'); assert.ok(result.size > 5000);
    assert.equal(result.width, result.imageWidth); assert.equal(result.height, result.imageHeight);
    assert.equal(result.stickerCount, 3); assert.equal(result.unchanged, true);
    assert.deepEqual(result.escaped, [], `${template.id}/${format} text crossed image bounds: ${JSON.stringify(result.escaped)}`);
    assert.doesNotMatch(result.text.join(' '), /私密餐食备注|步数|距离|热量/);
    if (template.kind === 'meal') assert.match(result.text.join(' '), /已安排/);
    if (format === 'square') assert.equal(result.width, result.height);
    const png = Buffer.from(result.dataUrl.split(',')[1], 'base64');
    const hash = createHash('sha256').update(png).digest('hex');
    if (format === 'portrait') await writeFile(resolve(output, `${browserName}-${template.id}.png`), png);
    results.push({ engine: browserName, template: template.id, format, width: result.width, height: result.height, bytes: result.size, hash, stickerCount: result.stickerCount });
  }
  assert.equal(new Set(results.filter(result => result.format === 'portrait').map(result => result.hash)).size, 8, 'all eight compositions should generate distinct images');
  const boundaryResults = await page.evaluate(async () => {
    const options = { date: '2026-10-13', kind: 'study', template: 'study-notebook', notes: true, stickerIds: [] };
    const longBook = structuredClone(book);
    longBook.dayRecords[0].study.items[0].content = '中文长学习题目👩‍🎨'.repeat(20);
    longBook.dayRecords[0].study.items[0].note = '保留整段长文字与组合emoji👩‍🎨🧑🏽‍🍳\n'.repeat(20) + '末尾必须完整';
    const card = await module.generateJournalShareCard(longBook, { ...options, format: 'long' });
    const complete = card.text.some(text => text.endsWith('末尾必须完整'));
    const hugeBook = structuredClone(longBook);
    hugeBook.dayRecords[0].study.items = Array.from({ length: 200 }, () => ({ ...longBook.dayRecords[0].study.items[0] }));
    let hugeError, squareError;
    try { await module.generateJournalShareCard(hugeBook, { ...options, format: 'long' }); } catch (error) { hugeError = error.message; }
    try { await module.generateJournalShareCard(hugeBook, { ...options, format: 'square' }); } catch (error) { squareError = error.message; }
    const before = JSON.stringify(book);
    const empty = module.prepareJournalShare(book, { kind: 'exercise', date: '2026-10-14' });
    const monthlyReport = await module.generateJournalShareCard(book, { scope: 'month', month: '2026-10', kind: 'life', template: 'life-report', stickerIds: [] });
    return { complete, stickerCount: card.stickerCount, hugeError, squareError, empty: empty.hasRecords, unchanged: JSON.stringify(book) === before,
      monthlyReport: { text: monthlyReport.text, counts: monthlyReport.data.counts } };
  });
  assert.equal(boundaryResults.complete, true); assert.equal(boundaryResults.stickerCount, 0);
  assert.match(boundaryResults.hugeError, /没有被截掉/); assert.match(boundaryResults.squareError, /方图容量/);
  assert.equal(boundaryResults.empty, false); assert.equal(boundaryResults.unchanged, true);
  assert.ok(boundaryResults.monthlyReport.text.includes('机智生活月报'));
  assert.ok(boundaryResults.monthlyReport.text.includes('2026.10'));
  assert.equal(boundaryResults.monthlyReport.counts.studyDays, 1);
  assert.deepEqual(errors, []);
  await writeFile(resolve(output, `${browserName}-results.json`), JSON.stringify({ results, boundaryResults }, null, 2));
  console.log(`${browserName}: 24 real PNG outputs; 8 layouts, 3 formats, SVG assets, full text and data protection passed.`);
} finally { await browser.close(); server.close(); }
