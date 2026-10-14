import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { createHash } from 'node:crypto';

// Synthetic records, a fresh origin and fresh browser storage: no personal data.
const { chromium } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const output = resolve(process.env.ADAPTIVE_SHARE_OUTPUT || 'tests/ui-previews/adaptive-share');
const date = '2026-10-17';
const templates = [
  { id: 'meal-cafe', kind: 'meal' },
  { id: 'exercise-ticket', kind: 'exercise' },
  { id: 'study-notebook', kind: 'study' },
  { id: 'study-library', kind: 'study' },
  { id: 'life-collage', kind: 'life' },
  { id: 'life-report', kind: 'life' },
  { id: 'meal-strawberry', kind: 'meal' },
];
const baseBook = {
  schemaVersion: 2, inventoryVersion: 1, updatedAt: '2026-10-17T04:00:00.000Z',
  inventory: [{ id: 'kept-food', name: '原有食材', category: '蛋白质', quantity: 9,
    perMeal: 1, unit: '份', expires: '', note: '库存和关联保持原样' }],
  meals: [], dayRecords: [], diaries: [],
};
const meals = ['breakfast', 'lunch', 'dinner'].map((slot, index) => ({
  id: `meal-${index}`, date, slot, name: ['牛奶吐司', '寿司郎一份', '番茄面'][index],
  type: '外食', completed: index !== 2, note: '', resources: [],
}));
const record = (study = [], exercise = []) => ({ date,
  study: { checked: study.length > 0, items: study },
  exercise: { checked: exercise.length > 0, items: exercise }, stickerIds: [],
});
const study = { id: 'short-study', content: '读了两页', minutes: 5, note: '' };
const exercise = { id: 'short-exercise', content: '河边散步', minutes: 10, note: '' };
const diary = { date, mood: '🍓', joy: '发现小花', text: '把普通的小日子收好。' };
const fixtures = {};
const makeFixture = (name, updates) => fixtures[name] = { ...structuredClone(baseBook), ...updates };
makeFixture('three-meal-names', { meals: structuredClone(meals) });
makeFixture('short-study', { dayRecords: [record([study])] });
makeFixture('short-exercise', { dayRecords: [record([], [exercise])] });
makeFixture('emoji-only', { diaries: [{ date, mood: '🍓', joy: '', text: '' }] });
makeFixture('short-joy', { diaries: [{ date, mood: '', joy: '发现小花', text: '' }] });
makeFixture('one-each', { meals: structuredClone(meals), dayRecords: [record([study], [exercise])], diaries: [diary] });
makeFixture('rich', {
  meals: Array.from({ length: 8 }, (_, index) => ({ ...meals[index % 3], id: `rich-meal-${index}`,
    slot: index < 3 ? meals[index].slot : 'snack', name: `餐桌小记${index + 1}：草莓牛奶和热饭【餐末${index + 1}】` })),
  dayRecords: [record(
    Array.from({ length: 6 }, (_, index) => ({ id: `study-${index}`, content: `学习${index + 1}：慢慢读一本书【学末${index + 1}】`, minutes: 10 + index,
      note: `把喜欢的句子抄在页角，今天又记住了一点点。【学注${index + 1}】` })),
    Array.from({ length: 5 }, (_, index) => ({ id: `exercise-${index}`, content: `运动${index + 1}：河边散步和拉伸【动末${index + 1}】`, minutes: 15 + index,
      note: `走过软软的晚风，肩膀也慢慢松开啦。【动注${index + 1}】` })))],
  diaries: [{ ...diary, text: '把一天的小小记录写下来，吃饭学习和散步都收好了。\n睡前给自己留一句温柔的话。【丰富末尾】' }],
});
makeFixture('long-diary', {
  ...structuredClone(fixtures['one-each']),
  diaries: [{ ...diary, text: Array.from({ length: 12 }, (_, index) =>
    `第${index + 1}段：今天煮了一碗热面，听着歌慢慢整理小桌子。树叶间的风很轻，普通的小事也值得认真记下来。👩‍🎨`).join('\n') + '\n【日记末尾完整】' }],
});
makeFixture('long-record', {
  meals: [{ ...meals[0], name: '草莓牛奶与热乎乎的早餐，认真吃好每一餐。'.repeat(6) + '【餐标题末尾】' }],
  dayRecords: [record(
    [{ ...study, content: '认真读书学一点点。'.repeat(9) + '【学标题末尾】', note: '学习摘记保留中文、组合表情👩‍🎨和换行。\n'.repeat(10) + '【学习备注末尾】' }],
    [{ ...exercise, content: '河边散步和睡前拉伸。'.repeat(8) + '【动标题末尾】', note: '让肩膀慢慢放松，走过熟悉的小路。\n'.repeat(10) + '【运动备注末尾】' }])],
});
const scenarios = template => [
  ...(template.kind === 'meal' || template.kind === 'life' ? ['three-meal-names'] : []),
  ...(template.kind === 'study' || template.kind === 'life' ? ['short-study'] : []),
  ...(template.kind === 'exercise' || template.kind === 'life' ? ['short-exercise'] : []),
  ...(template.kind === 'life' ? ['emoji-only', 'short-joy'] : []),
  'one-each', 'rich', 'long-diary', 'long-record',
];
const report = { generatedAt: new Date().toISOString(), engine: 'chromium', results: [],
  comparisons: [], editor: [], failures: [], browserErrors: [] };
const check = async (name, operation) => {
  try { await operation(); }
  catch (error) { report.failures.push({ name, message: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
};
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  const url = new URL(request.url, 'http://localhost');
  if (url.pathname === '/__adaptive.html') {
    response.setHeader('Content-Type', mime['.html']);
    response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>内容自适应分享验证</title><style>html,body{margin:0;width:100%;background:#fff7fa}#preview{display:block;width:100%;height:auto}</style><body></body></html>');
    return;
  }
  const path = resolve(root, '.' + decodeURIComponent(url.pathname).replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 },
    timezoneId: 'Asia/Shanghai', serviceWorkers: 'block', acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => report.browserErrors.push(error.message));
  await page.goto(`${origin}/__adaptive.html`);
  await page.evaluate(async ({ fixtures, initialBook }) => {
    window.shareModule = await import('./share-journal.js');
    window.fixtures = fixtures;
    localStorage.setItem('jizhi-meals-v1', initialBook);
    localStorage.setItem('adaptive-keep', '原有备份标记');
    window.storageSnapshot = () => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)]));
    window.originalStorage = storageSnapshot();
    window.originalFixtures = JSON.stringify(fixtures);
    window.glyphs = []; window.papers = [];
    const proto = CanvasRenderingContext2D.prototype;
    const transform = (context, points) => {
      const m = context.getTransform();
      return points.map(([x, y]) => ({ x: m.a * x + m.c * y + m.e, y: m.b * x + m.d * y + m.f }));
    };
    const bounds = quad => ({ left: Math.min(...quad.map(p => p.x)), right: Math.max(...quad.map(p => p.x)),
      top: Math.min(...quad.map(p => p.y)), bottom: Math.max(...quad.map(p => p.y)) });
    const actualText = proto.fillText;
    proto.fillText = function (value, x, y, maxWidth) {
      const text = String(value), metrics = this.measureText(text);
      const compression = typeof maxWidth === 'number' && maxWidth > 0 && metrics.width > maxWidth ? maxWidth / metrics.width : 1;
      const left = x - metrics.actualBoundingBoxLeft * compression, right = x + metrics.actualBoundingBoxRight * compression;
      const top = y - metrics.actualBoundingBoxAscent, bottom = y + metrics.actualBoundingBoxDescent;
      const quad = transform(this, [[left, top], [right, top], [right, bottom], [left, bottom]]);
      glyphs.push({ text, quad, ...bounds(quad), width: this.canvas.width, height: this.canvas.height });
      return maxWidth === undefined ? actualText.call(this, value, x, y) : actualText.call(this, value, x, y, maxWidth);
    };
    // Capture actual painted rounded paper surfaces, independent of layout code.
    // Four quadratic corners identify the painter's rectangles; circles and
    // decorative strokes are intentionally excluded from panel measurements.
    const paths = new WeakMap();
    for (const name of ['beginPath', 'moveTo', 'lineTo', 'quadraticCurveTo', 'fill']) {
      const actual = proto[name];
      proto[name] = function (...args) {
        if (name === 'beginPath') paths.set(this, { points: [], curves: 0 });
        const path = paths.get(this);
        if (path && ['moveTo', 'lineTo'].includes(name)) path.points.push(args.slice(0, 2));
        if (path && name === 'quadraticCurveTo') { path.curves++; path.points.push(args.slice(0, 2), args.slice(2, 4)); }
        if (name === 'fill' && path?.curves === 4 && path.points.length) {
          const xs = path.points.map(p => p[0]), ys = path.points.map(p => p[1]);
          const x = Math.min(...xs), y = Math.min(...ys), w = Math.max(...xs) - x, h = Math.max(...ys) - y;
          const quad = transform(this, [[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);
          papers.push({ quad, ...bounds(quad), localWidth: w, localHeight: h, area: w * h, fill: this.fillStyle });
        }
        return actual.apply(this, args);
      };
    }
    window.glyphOverlap = (a, b) => {
      // Separating axes on real rotated glyph quads, with a two-pixel tolerance
      // for glyph bearing/font rasterization. Axis-aligned boxes alone create
      // false positives on the deliberately tilted hand-journal papers.
      for (const quad of [a.quad, b.quad]) for (let index = 0; index < 4; index++) {
        const next = quad[(index + 1) % 4], current = quad[index];
        const dx = next.x - current.x, dy = next.y - current.y, length = Math.hypot(dx, dy);
        if (!length) continue;
        const axis = { x: -dy / length, y: dx / length };
        const project = points => points.map(p => p.x * axis.x + p.y * axis.y);
        const p = project(a.quad), q = project(b.quad);
        if (Math.min(Math.max(...p), Math.max(...q)) - Math.max(Math.min(...p), Math.min(...q)) <= 2) return false;
      }
      return true;
    };
  }, { fixtures, initialBook: JSON.stringify(fixtures['one-each']) });

  const generate = (template, scenario, format) => page.evaluate(async ({ template, scenario, format }) => {
    const state = structuredClone(fixtures[scenario]), before = JSON.stringify(state);
    glyphs.length = 0; papers.length = 0;
    const card = await shareModule.generateJournalShareCard(state, { ...template, template: template.id, date: '2026-10-17',
      format, notes: true, mood: true, joy: true, diary: true, stickerIds: [] });
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = reject; reader.onload = () => resolve(reader.result); reader.readAsDataURL(card.blob);
    });
    const image = new Image(); image.src = dataUrl; await image.decode();
    document.querySelector('#preview')?.remove(); image.id = 'preview'; document.body.append(image);
    const escaped = glyphs.filter(row => row.left < -2 || row.right > row.width + 2 || row.top < -2 || row.bottom > row.height + 2);
    const overlap = [];
    for (let a = 0; a < glyphs.length; a++) for (let b = a + 1; b < glyphs.length; b++) {
      if (glyphs[a].text.trim() && glyphs[b].text.trim() && glyphOverlap(glyphs[a], glyphs[b])) overlap.push([glyphs[a].text, glyphs[b].text]);
    }
    const shortPanels = {};
    for (const marker of ['🍓', '发现小花', '读了两页', '河边散步', '牛奶吐司']) {
      const glyph = glyphs.find(row => row.text === marker); if (!glyph) continue;
      const matches = papers.filter(p => p.localWidth > 40 && p.localHeight > 20 && p.left <= glyph.left + 2 && p.right >= glyph.right - 2 && p.top <= glyph.top + 2 && p.bottom >= glyph.bottom - 2)
        .sort((a, b) => a.area - b.area);
      if (matches[0]) shortPanels[marker] = { width: matches[0].localWidth, height: matches[0].localHeight, fill: matches[0].fill };
    }
    return { dataUrl, width: card.width, height: card.height, naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight,
      type: card.blob.type, bytes: card.blob.size, text: card.text, painted: glyphs.map(row => row.text).join(''),
      counts: card.data.counts, escaped, overlap, shortPanels, glyphs,
      unchanged: JSON.stringify(state) === before && JSON.stringify(fixtures) === originalFixtures && storageSnapshot() === originalStorage };
  }, { template, scenario, format });

  for (const template of templates) {
    for (const scenario of scenarios(template)) for (const format of ['portrait', 'long']) {
      await check(`${template.id}/${scenario}/${format}`, async () => {
        const result = await generate(template, scenario, format);
        const png = Buffer.from(result.dataUrl.split(',')[1], 'base64');
        const filename = `${template.id}-${scenario}-${format}.png`;
        await writeFile(resolve(output, filename), png);
        const { dataUrl, glyphs, ...details } = result;
        report.results.push({ template: template.id, kind: template.kind, scenario, format, filename,
          ...details, hash: createHash('sha256').update(png).digest('hex') });
        // Keep full real glyph quads for diagnosing rotations or clipping.
        await writeFile(resolve(output, filename.replace('.png', '-glyphs.json')), JSON.stringify(glyphs));
        assert.deepEqual([...png.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.equal(result.type, 'image/png'); assert.ok(result.bytes > 5000);
        assert.equal(png.readUInt32BE(16), result.width); assert.equal(png.readUInt32BE(20), result.height);
        assert.equal(result.naturalWidth, result.width); assert.equal(result.naturalHeight, result.height);
        assert.equal(result.unchanged, true, 'rendering must preserve source records and all storage');
        assert.deepEqual(result.escaped, [], 'actual glyphs must stay inside the PNG');
        assert.deepEqual(result.overlap, [], 'actual text must not overlap text on adjacent papers');
        if (scenario === 'three-meal-names') for (const name of meals.map(meal => meal.name)) {
          assert.ok(result.painted.includes(name), `${name} must actually be painted`);
        }
        if (scenario === 'short-study') assert.ok(result.painted.includes('读了两页'));
        if (scenario === 'emoji-only') assert.ok(result.painted.includes('🍓'));
        if (scenario === 'short-joy') assert.ok(result.painted.includes('发现小花'));
        if (scenario === 'long-diary') assert.ok(result.painted.includes('【日记末尾完整】'), 'long diary tail must actually be painted');
        if (scenario === 'rich') {
          if (template.kind === 'meal' || template.kind === 'life') assert.ok(result.painted.includes('【餐末8】'));
          if (template.kind === 'exercise' || template.kind === 'life') assert.ok(result.painted.includes('【动末5】'));
          if (template.kind === 'study' || template.kind === 'life') assert.ok(result.painted.includes('【学末6】'));
        }
        if (scenario === 'long-record') {
          if (template.kind === 'meal' || template.kind === 'life') assert.ok(result.painted.includes('【餐标题末尾】'));
          if (template.kind === 'exercise' || template.kind === 'life') assert.ok(result.painted.includes('【动标题末尾】'));
          if (template.kind === 'study' || template.kind === 'life') assert.ok(result.painted.includes('【学标题末尾】'));
          if (template.kind === 'exercise' || template.kind === 'life') assert.ok(result.painted.includes('【运动备注末尾】'));
          if (template.kind === 'study' || template.kind === 'life') assert.ok(result.painted.includes('【学习备注末尾】'));
        }
      });
    }
    await check(`${template.id}: content-driven canvas and independent small papers`, async () => {
      const rows = report.results.filter(row => row.template === template.id);
      const sparseName = template.kind === 'meal' ? 'three-meal-names' : template.kind === 'exercise' ? 'short-exercise' : template.kind === 'study' ? 'short-study' : 'emoji-only';
      const sparse = rows.find(row => row.scenario === sparseName && row.format === 'portrait');
      const sparseLong = rows.find(row => row.scenario === sparseName && row.format === 'long');
      const rich = rows.find(row => row.scenario === 'rich' && row.format === 'portrait');
      const shortDay = rows.find(row => row.scenario === 'one-each' && row.format === 'portrait');
      const longDay = rows.find(row => row.scenario === 'long-diary' && row.format === 'portrait');
      assert.ok(sparse && sparseLong && rich && shortDay && longDay, 'all comparison fixtures must render');
      assert.ok(sparse.height < rich.height * .85, 'sparse records must be materially shorter than a rich day');
      assert.ok(shortDay.height < longDay.height * .85, 'a long diary should grow naturally');
      assert.equal(sparseLong.height, sparse.height, 'long format must not pad a sparse card to a minimum canvas height');
      // At 1200px export width, fewer than three lines of optional content
      // should fit in a compact card. Covers retain their authored decoration.
      const sparseBudget = template.kind === 'life' ? 1600 : template.kind === 'meal' ? 1600 : 1400;
      assert.ok(sparse.height <= sparseBudget, `sparse card has excessive canvas height (${sparse.height}px)`);
      const panels = [];
      if (template.kind === 'life') for (const marker of ['🍓', '发现小花', '读了两页', '牛奶吐司']) {
        const before = shortDay.shortPanels[marker], after = longDay.shortPanels[marker];
        assert.ok(before && after, `measure the actual painted paper for ${marker}`);
        assert.ok(after.height <= before.height * 1.15 + 3, `${marker} must not stretch alongside the diary`);
        panels.push({ marker, short: before, alongsideLongDiary: after });
      }
      report.comparisons.push({ template: template.id, sparse: sparse.height, rich: rich.height,
        shortDay: shortDay.height, longDiary: longDay.height, shortPanels: panels });
    });
  }

  // Use the actual application, actual share editor, object URL and download
  // gesture. Byte equality is stronger than comparing only image dimensions.
  const appPage = await context.newPage();
  appPage.on('pageerror', error => report.browserErrors.push(error.message));
  const appRaw = JSON.stringify(fixtures['one-each']);
  await appPage.addInitScript(raw => {
    if (!localStorage.getItem('adaptive-app-seeded')) {
      localStorage.clear(); localStorage.setItem('jizhi-meals-v1', raw);
      localStorage.setItem('adaptive-app-seeded', 'true'); localStorage.setItem('adaptive-keep', '原有备份标记');
    }
  }, appRaw);
  await appPage.clock.setFixedTime(new Date('2026-10-17T04:00:00.000Z'));
  await appPage.goto(`${origin}/#calendar`);
  await appPage.locator('.calendar-page').waitFor();
  const appStorage = await appPage.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
  assert.equal(await appPage.evaluate(() => localStorage.getItem('jizhi-meals-v1')), appRaw, 'opening the app must preserve schema 2 fixture');
  await appPage.locator('[data-action="share-day"]').click();
  const waitPreview = () => appPage.waitForFunction(() => {
    const image = document.querySelector('.share-preview img'), download = document.querySelector('#download-card');
    return image && !image.hidden && image.complete && image.naturalWidth > 0 && download && !download.disabled;
  });
  await waitPreview();
  await appPage.locator('.journal-share-extras summary').click();
  for (const key of ['notes', 'mood', 'joy', 'diary']) await appPage.locator(`#share-form [name="${key}"]`).check();
  await waitPreview();
  for (const template of templates.filter(template => template.id !== 'meal-strawberry')) {
    await check(`${template.id}: actual editor/download and four mobile widths`, async () => {
      await appPage.locator(`[data-share-kind="${template.kind}"]`).click();
      await waitPreview();
      await appPage.locator(`[data-share-template="${template.id}"]`).click();
      await waitPreview();
      assert.equal(await appPage.locator(`[data-share-template="${template.id}"]`).getAttribute('aria-pressed'), 'true');
      const preview = await appPage.locator('.share-preview img').evaluate(async image => {
        const blob = await (await fetch(image.src)).blob();
        const dataUrl = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.readAsDataURL(blob); });
        return { dataUrl, width: image.naturalWidth, height: image.naturalHeight, src: image.src };
      });
      const previewBytes = Buffer.from(preview.dataUrl.split(',')[1], 'base64');
      const downloading = appPage.waitForEvent('download');
      await appPage.locator('#download-card').click(); const download = await downloading;
      const filename = `${template.id}-editor-download.png`; await download.saveAs(resolve(output, filename));
      const downloadedBytes = await readFile(resolve(output, filename));
      assert.deepEqual(downloadedBytes, previewBytes, 'downloaded PNG must be exactly the preview PNG');
      const rows = [];
      for (const width of [320, 375, 390, 430]) {
        await appPage.setViewportSize({ width, height: 844 });
        await appPage.locator('.share-preview').scrollIntoViewIfNeeded();
        const metrics = await appPage.locator('.share-preview img').evaluate(image => {
          const box = image.getBoundingClientRect(), parent = image.parentElement.getBoundingClientRect();
          return { viewport: innerWidth, documentOverflow: document.documentElement.scrollWidth - innerWidth,
            left: box.left, right: box.right, width: box.width, parentWidth: parent.width,
            naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, src: image.src };
        });
        assert.ok(metrics.documentOverflow <= 1, `mobile page overflow at ${width}px`);
        assert.ok(metrics.width > 0 && metrics.width <= metrics.parentWidth + 1 && metrics.left >= -1 && metrics.right <= width + 1,
          `mobile image preview exceeds its container at ${width}px`);
        assert.equal(metrics.naturalWidth, preview.width); assert.equal(metrics.naturalHeight, preview.height);
        assert.equal(metrics.src, preview.src, 'resizing must not silently replace the exported image');
        await appPage.locator('.share-preview').screenshot({ path: resolve(output, `${template.id}-mobile-${width}.png`) });
        rows.push(metrics);
      }
      const storage = await appPage.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
      assert.equal(storage, appStorage, 'editor controls and download must preserve all original data and storage');
      report.editor.push({ template: template.id, filename, width: preview.width, height: preview.height,
        hash: createHash('sha256').update(downloadedBytes).digest('hex'), byteIdentical: true, widths: rows });
    });
  }
  await check('fast template changes cannot export a stale generation', async () => {
    const oldSource = await appPage.locator('.share-preview img').getAttribute('src');
    await appPage.evaluate(() => {
      document.querySelector('[data-share-kind="life"]').click();
      document.querySelector('[data-share-template="life-report"]').click();
      document.querySelector('[data-share-template="life-collage"]').click();
      document.querySelector('[data-share-template="life-report"]').click();
    });
    await waitPreview();
    assert.match(await appPage.locator('.journal-share-status').textContent(), /机智一日小报|月末生活月报/);
    assert.equal(await appPage.locator('[data-share-template="life-report"]').getAttribute('aria-pressed'), 'true');
    assert.notEqual(await appPage.locator('.share-preview img').getAttribute('src'), oldSource);
    const reference = report.editor.find(row => row.template === 'life-report');
    const hash = await appPage.locator('.share-preview img').evaluate(async image => {
      const buffer = await (await fetch(image.src)).arrayBuffer();
      const digest = await crypto.subtle.digest('SHA-256', buffer);
      return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('');
    });
    assert.equal(hash, reference.hash, 'last selected template must own the final preview');
  });
  await check('browser execution', async () => assert.deepEqual(report.browserErrors, []));
} catch (error) {
  report.failures.push({ name: 'browser setup or application setup', message: error.message });
} finally {
  await browser?.close();
  await new Promise(resolve => server.close(resolve));
  report.passed = report.failures.length === 0;
  await writeFile(resolve(output, 'results.json'), JSON.stringify(report, null, 2));
  const summary = `${report.results.length} adaptive PNG scenarios; ${report.editor.length} actual preview/download pairs; ${report.failures.length} failures.\n` +
    'Sparse meals, short study/exercise, emoji-only mood, short joy, rich day, long diary and long records; portrait/long, real glyph bounds and overlaps, independent paper heights, storage protection, mobile 320/375/390/430px.\n' +
    report.failures.map(row => `FAIL ${row.name}: ${row.message}`).join('\n') + '\n';
  await writeFile(resolve(output, 'verification.txt'), summary);
  console.log(summary);
  if (!report.passed) process.exitCode = 1;
}
