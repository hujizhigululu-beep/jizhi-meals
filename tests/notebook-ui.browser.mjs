import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';

// Temporary test origin and browser context. No personal records or profile.
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const output = resolve(process.env.NOTEBOOK_UI_OUTPUT || '/workspace/artifacts/jizhi-notebook-ui');
const engine = process.env.UI_ENGINE === 'webkit' ? 'webkit' : 'chromium';
const fixture = {
  schemaVersion: 3, inventoryVersion: 1, updatedAt: '2026-10-13T04:00:00.000Z',
  inventory: ['蛋白质', '蔬菜', '碳水', '早餐', '整套食物'].map((category, i) => ({
    id: `food-${i}`, name: ['牛肉丸', '洗好的青菜', '米饭', '牛奶可颂', '番茄鸡蛋便当'][i], category,
    quantity: [9, 8, 12, 4, 3][i], perMeal: 1, unit: '份', expires: '',
    note: i === 1 ? '放在冷藏第二格。\n下次煮一碗热乎乎的小面。' : '',
  })),
  meals: [
    ['2026-10-13', 'breakfast', '牛奶可颂', true],
    ['2026-10-13', 'lunch', '牛肉丸蔬菜便当', true],
    ['2026-10-13', 'dinner', '番茄鸡蛋乌冬', false],
    ['2026-10-13', 'snack', '草莓小蛋糕', true],
    ['2026-10-12', 'lunch', '暖暖的南瓜饭', true],
    ['2026-10-14', 'dinner', '明天的小便当', false],
    ['2026-12-31', 'dinner', '年末的热汤', true],
    ['2027-01-01', 'breakfast', '新年的第一份早餐', true],
  ].map(([date, slot, name, completed], i) => ({
    id: `meal-${i}`, date, slot, name, completed, type: slot === 'snack' ? '零食 / 加餐' : '自制便当',
    protein: '', note: i === 1 ? '配一点清甜的青菜。\n今天也有好好吃饭呀 ♡' : '',
    resources: i === 1 ? [{ ingredientId: 'food-0', name: '牛肉丸', amount: 1, unit: '份' }, { ingredientId: 'food-1', name: '洗好的青菜', amount: 1, unit: '份' }] : [],
    completedAt: completed ? `${date}T04:00:00.000Z` : null,
    ...(slot === 'snack' ? { time: '15:30' } : {}),
  })),
  diaries: [
    { date: '2026-10-13', mood: '甜甜的平静 (˶ᵔ ᵕ ᵔ˶)', joy: '路边的小花也在认真开呀。', text: '把晚饭煮得热乎乎的，听着歌收拾小桌子。\n今天的普通小事，也想好好收起来。', updatedAt: '2026-10-13T04:00:00.000Z' },
    { date: '2026-12-31', mood: '感谢这一年 ♡', joy: '', text: '年末的小故事，还留在这里。', updatedAt: '2026-12-31T04:00:00.000Z' },
    { date: '2027-01-01', mood: '新年快乐', joy: '看见第一缕阳光。', text: '新年的第一页，慢慢写。', updatedAt: '2027-01-01T04:00:00.000Z' },
  ],
  dayRecords: [
    { date: '2026-10-13', study: { checked: true, items: [{ id: 'study-1', content: '日语 · 日常问候', minutes: 25, note: '把喜欢的句子抄在页角。\n一个小小的新收获。' }, { id: 'study-2', content: '读《小王子》', minutes: 20, note: '读到一朵特别的小玫瑰。' }] }, exercise: { checked: true, items: [{ id: 'exercise-1', content: '河边散步', minutes: 35, note: '晚风软软的，走过一小段落日。' }, { id: 'exercise-2', content: '睡前拉伸', minutes: 15, note: '肩膀松开啦 (˶ᵔ ᵕ ᵔ˶)' }] }, stickerIds: ['milk', 'book', 'shoe'] },
    { date: '2026-10-12', study: { checked: true, items: [] }, exercise: { checked: false, items: [] }, stickerIds: [] },
  ],
};
const report = { engine, generatedAt: new Date().toISOString(), checks: [], layouts: [], touchTargets: [], images: [], errors: [], failures: [] };
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
await mkdir(output, { recursive: true });
const server = createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  const path = resolve(root, '.' + pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream'); response.end(await readFile(path)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
let activePage;
const check = async (name, run) => {
  try { await run(); report.checks.push(name); console.log(`PASS ${name}`); }
  catch (error) {
    report.failures.push({ name, message: error.message }); console.error(`FAIL ${name}: ${error.message}`);
    // A failed form assertion must not leave a modal intercepting the next
    // scenario's navigation. Closing also runs the production cleanup listener.
    await activePage?.evaluate(() => {
      const dialog = document.querySelector('#sheet'); if (dialog?.open) dialog.close();
      window.scrollTo(0, 0);
    }).catch(() => {});
  }
};

try {
  browser = await (engine === 'webkit' ? webkit : chromium).launch({ headless: true,
    ...(engine === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || '/usr/bin/chromium' } : {}) });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', acceptDownloads: true });
  const page = await context.newPage();
  activePage = page;
  page.setDefaultTimeout(12000);
  page.on('pageerror', error => report.errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) report.errors.push(`${response.status()} ${response.url()}`); });
  await page.clock.setFixedTime(new Date('2026-10-13T04:00:00.000Z'));
  await page.addInitScript(book => {
    if (!localStorage.getItem('jizhi-ai-test-book-v1')) localStorage.setItem('jizhi-ai-test-book-v1', JSON.stringify(book));
    if (!localStorage.getItem('notebook-keep-marker')) localStorage.setItem('notebook-keep-marker', '原有备份标记，请保留');
  }, fixture);
  const url = `http://127.0.0.1:${server.address().port}/`;
  const raw = () => page.evaluate(() => localStorage.getItem('jizhi-ai-test-book-v1'));
  const snapshot = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(key => [key, localStorage.getItem(key)])));
  const nav = target => page.locator(`.bottom-nav [data-page="${target}"]`).click();
  const view = target => page.locator(`[data-calendar-view="${target}"]`).click();
  const enter = async target => { await nav(['day', 'month', 'timeline'].includes(target) ? 'calendar' : target); if (target === 'month' || target === 'timeline') await view(target); };
  const screenshot = async name => { await page.setViewportSize({ width: 390, height: 844 }); await page.screenshot({ path: resolve(output, `${name}.png`), fullPage: false }); };
  const fillDate = async (locator, value) => { await locator.fill(value); await locator.evaluate(input => { input.dispatchEvent(new Event('change', { bubbles: true })); input.blur(); }); };
  const inputs = async label => {
    const small = await page.locator('input:not([type="checkbox"]):not([type="file"]), textarea, select').evaluateAll(elements => elements.filter(element => typeof element.checkVisibility === 'function' ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden').map(element => ({ name: element.name || element.id, size: parseFloat(getComputedStyle(element).fontSize) })).filter(element => element.size < 16));
    assert.deepEqual(small, [], `${label}: iOS inputs require readable 16px text`);
  };
  const touch = async (selector, label, minimum = 40) => {
    const sizes = await page.locator(selector).evaluateAll(elements => elements.filter(element => element.getClientRects().length).map(element => { const r = element.getBoundingClientRect(); return { label: element.getAttribute('aria-label') || element.textContent.trim().slice(0, 30), width: r.width, height: r.height }; }));
    assert.ok(sizes.length, `${label}: touch targets exist`);
    assert.ok(sizes.every(size => size.width >= minimum - .5 && size.height >= minimum - .5), `${label}: ${JSON.stringify(sizes)}`);
    report.touchTargets.push({ label, minimum, sizes });
  };
  const layout = async (label, timeline = false) => {
    for (const width of [320, 390, 736]) {
      await page.setViewportSize({ width, height: 844 });
      for (const extraSafeArea of [0, 34]) {
        const original = await page.evaluate(extra => {
          const shell = document.querySelector('.app-shell'), nav = document.querySelector('.bottom-nav');
          const styles = [shell.getAttribute('style'), nav.getAttribute('style')];
          if (extra) { shell.style.paddingBottom = `${parseFloat(getComputedStyle(shell).paddingBottom) + extra}px`; nav.style.paddingBottom = `${parseFloat(getComputedStyle(nav).paddingBottom) + extra}px`; }
          window.dispatchEvent(new Event('resize')); return styles;
        }, extraSafeArea);
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        if (timeline) await page.locator('#date-timeline').evaluate(element => element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight));
        await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
        const metrics = await page.evaluate(isTimeline => {
          const nav = document.querySelector('.bottom-nav').getBoundingClientRect();
          const content = document.querySelector(isTimeline ? '#date-timeline' : '.page').getBoundingClientRect();
          return { width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, clearance: nav.top - content.bottom };
        }, timeline);
        report.layouts.push({ label, extraSafeArea, ...metrics });
        assert.ok(metrics.overflow <= 1, `${label}: horizontal overflow ${JSON.stringify(metrics)}`);
        assert.ok(metrics.clearance >= 8, `${label}: content hidden under bottom navigation ${JSON.stringify(metrics)}`);
        await page.evaluate(styles => {
          for (const [selector, style] of [['.app-shell', styles[0]], ['.bottom-nav', styles[1]]]) {
            const element = document.querySelector(selector); if (style === null) element.removeAttribute('style'); else element.setAttribute('style', style);
          }
          window.dispatchEvent(new Event('resize')); window.scrollTo(0, 0);
        }, original);
      }
    }
    await page.setViewportSize({ width: 390, height: 844 });
  };
  const waitPreview = () => page.waitForFunction(() => { const image = document.querySelector('.share-preview img'), button = document.querySelector('#download-card'); return image && !image.hidden && image.complete && image.naturalWidth > 0 && button && !button.disabled; });
  const download = async (selector, filename) => { const pending = page.waitForEvent('download'); await page.locator(selector).click(); const file = await pending; const path = resolve(output, filename); await file.saveAs(path); return { file, path, bytes: await readFile(path) }; };

  await page.goto(url);
  await page.locator('.calendar-page').waitFor();
  await page.evaluate(() => navigator.serviceWorker.ready);
  const initial = await snapshot();
  const originalRaw = await raw();
  await check('today opens directly; six themed headers and navigation preserve every stored byte', async () => {
    assert.equal(await page.locator('.date-tab.active').getAttribute('data-date'), '2026-10-13');
    const headers = [];
    for (const target of ['day', 'month', 'timeline', 'inventory', 'summary', 'settings']) {
      await enter(target);
      if (target === 'settings') await page.waitForFunction(() => document.querySelector('#offline-status')?.textContent.includes('已缓存'));
      assert.match(await page.locator('.brand').textContent(), /机智定食/);
      assert.equal(await page.locator('.brand-header').getAttribute('data-chapter'), target);
      headers.push(await page.locator('.cover-edition').textContent());
      assert.equal(await page.locator('.bottom-nav [aria-current="page"]').count(), 1);
      assert.equal(await page.locator('.bottom-nav [aria-current="page"]').getAttribute('data-page'), ['day', 'month', 'timeline'].includes(target) ? 'calendar' : target);
      await touch('.bottom-nav button', `${target} bottom navigation`, 44);
      await layout(target, target === 'timeline');
      await inputs(target);
      await page.evaluate(() => window.scrollTo(0, 0));
      if (target === 'timeline') await page.locator('[data-action="timeline-today"]').click();
      await screenshot(target);
    }
    assert.equal(new Set(headers).size, 6, 'Each chapter has its own subtitle');
    assert.equal(await snapshot(), initial, 'Read-only page changes must not write storage');
  });

  await check('meal, diary and inventory folds reveal full details; editors remain reachable without data writes', async () => {
    await enter('day');
    const meals = page.locator('details.meal-record');
    assert.equal(await meals.count(), 4);
    assert.equal(await page.locator('details.meal-record[open]').count(), 0);
    const lunch = page.locator('[data-meal-fold="meal-1"]');
    assert.equal(await lunch.locator('.meal-record-body').isVisible(), false);
    await lunch.locator('summary').click();
    assert.ok((await lunch.locator('.meal-record-body').textContent()).includes(fixture.meals[1].note));
    assert.match(await lunch.locator('.meal-record-body').textContent(), /牛肉丸.*1.*份/s);
    assert.match(await lunch.locator('.meal-record-body').textContent(), /洗好的青菜.*1.*份/s);
    await touch('[data-meal-fold="meal-1"] [data-edit-meal]', 'expanded meal editor');
    await lunch.locator('[data-edit-meal]').click();
    await page.locator('#meal-form').waitFor(); await inputs('meal editor');
    await page.locator('.close-button[data-close]').click();
    assert.notEqual(await lunch.getAttribute('open'), null);
    const diary = page.locator('.diary-disclosure');
    assert.equal(await diary.getAttribute('open'), null);
    assert.equal(await diary.locator('.diary-text').isVisible(), false);
    await diary.locator('summary').click();
    assert.equal(await diary.locator('.diary-text').textContent(), fixture.diaries[0].text);
    await screenshot('day-expanded');
    await page.locator('[data-action="edit-diary"]').click();
    await page.locator('#diary-form').waitFor(); await inputs('diary editor');
    await page.locator('.close-button[data-close]').click();
    await nav('inventory');
    if (await page.locator('.runway-fold').getAttribute('open') === null) await page.locator('.runway-fold > summary').click();
    const runway = page.locator('.runway-details');
    if (await runway.getAttribute('open') === null) await runway.locator('summary').click();
    await inputs('expanded runway settings');
    await runway.locator('summary').click();
    const ingredient = page.locator('[data-inventory-id="food-1"]');
    assert.equal(await page.locator('.ingredient-row[open]').count(), 0);
    assert.equal(await ingredient.locator('.ingredient-meta').isVisible(), false);
    await ingredient.locator('summary').click();
    assert.ok((await ingredient.locator('.ingredient-meta').textContent()).includes(fixture.inventory[1].note));
    await ingredient.locator('[data-ingredient]').click();
    await page.locator('#ingredient-form').waitFor(); await inputs('ingredient editor');
    await page.locator('.close-button[data-close]').click();
    assert.notEqual(await ingredient.getAttribute('open'), null);
    await layout('inventory-expanded');
    assert.equal(await snapshot(), initial);
  });

  await check('timeline expands text safely and returns to the same date', async () => {
    await enter('timeline');
    const row = page.locator('[data-timeline-date="2026-10-13"]');
    assert.equal(await row.locator('details').getAttribute('open'), null);
    await row.locator('summary').click();
    assert.equal(await row.locator('.timeline-story-text').textContent(), fixture.diaries[0].text);
    assert.equal(await row.locator('.timeline-activity-item').count(), 4);
    await screenshot('timeline-expanded');
    await layout('timeline-expanded', true);
    await row.locator('[data-timeline-open]').click();
    assert.equal(await page.locator('.date-tab.active').getAttribute('data-date'), '2026-10-13');
    await view('timeline');
    assert.notEqual(await row.locator('details').getAttribute('open'), null);
    await row.locator('summary').click();
    assert.equal(await snapshot(), initial);
  });

  await check('all four month modes and cross-year summary filtering keep historical records', async () => {
    await enter('month');
    for (const [mode, dots] of [['all', 6], ['meal', 3], ['exercise', 1], ['study', 2]]) {
      await page.locator(`[data-month-mode="${mode}"]`).click();
      assert.equal(await page.locator('.month-grid .month-dot').count(), dots);
    }
    await page.locator('[data-month-mode="all"]').click();
    await nav('summary');
    await fillDate(page.locator('#summary-month'), '2026-12');
    assert.deepEqual(await page.locator('.summary-stat-value strong').allTextContents(), ['1', '1']);
    assert.match(await page.locator('.summary-meal-catalog').textContent(), /年末的热汤/);
    assert.doesNotMatch(await page.locator('.summary-meal-catalog').textContent(), /新年的第一份早餐/);
    await page.locator('[data-action="summary-next-month"]').click();
    assert.equal(await page.locator('#summary-month').inputValue(), '2027-01');
    assert.deepEqual(await page.locator('.summary-stat-value strong').allTextContents(), ['1', '1']);
    assert.match(await page.locator('.summary-meal-catalog').textContent(), /新年的第一份早餐/);
    await page.locator('[data-action="summary-prev-month"]').click();
    assert.equal(await page.locator('#summary-month').inputValue(), '2026-12');
    assert.equal(await snapshot(), initial);
  });

  await check('activity drafts follow their date; canceled check-ins keep details and unrelated records', async () => {
    await enter('day');
    const study = page.locator('.activity-details[data-kind="study"]');
    if (await study.getAttribute('open') === null) await study.locator('summary').click();
    const form = page.locator('.activity-form[data-kind="study"]');
    await form.locator('[name="content"]').fill('还没收好的学习小纸条');
    await form.locator('[name="minutes"]').fill('15');
    await form.locator('[name="note"]').fill('第一行草稿。\n第二行继续留着。');
    await page.locator('[data-date="2026-10-14"]').click();
    const other = page.locator('.activity-details[data-kind="study"]');
    if (await other.getAttribute('open') === null) await other.locator('summary').click();
    assert.equal(await form.locator('[name="content"]').inputValue(), '');
    await page.locator('[data-date="2026-10-13"]').click();
    assert.equal(await form.locator('[name="content"]').inputValue(), '还没收好的学习小纸条');
    assert.equal(await form.locator('[name="note"]').inputValue(), '第一行草稿。\n第二行继续留着。');
    assert.equal(await snapshot(), initial, 'Typing and changing dates must not save drafts as records');
    await page.locator('[data-checkin="study"]').click();
    const after = JSON.parse(await raw());
    assert.equal(after.dayRecords.find(row => row.date === '2026-10-13').study.checked, false);
    assert.deepEqual(after.dayRecords.find(row => row.date === '2026-10-13').study.items, fixture.dayRecords.find(row => row.date === '2026-10-13').study.items);
    for (const key of ['inventory', 'meals', 'diaries']) assert.deepEqual(after[key], fixture[key]);
    assert.equal(await form.locator('[name="content"]').inputValue(), '还没收好的学习小纸条');
    await page.locator('[data-checkin="study"]').click();
    await inputs('activity form');
    await touch('[data-checkin]', 'study and exercise checks', 44);
    await study.scrollIntoViewIfNeeded(); await screenshot('checkins');
  });

  await check('eight selectable templates produce real downloaded PNGs without changing journal records', async () => {
    await enter('day');
    const before = await snapshot();
    await page.locator('[data-action="share-day"]').click(); await waitPreview();
    for (const name of ['notes', 'mood', 'diary', 'joy']) assert.equal(await page.locator(`#share-form [name="${name}"]`).isChecked(), false);
    await inputs('share editor');
    await touch('#download-card, #native-share-card', 'PNG and native share buttons', 44);
    for (const kind of ['meal', 'exercise', 'study', 'life']) {
      await page.locator(`[data-share-kind="${kind}"]`).click(); await waitPreview();
      const ids = await page.locator('[data-share-template]').evaluateAll(buttons => buttons.map(button => button.dataset.shareTemplate));
      assert.equal(ids.length, 2);
      for (const id of ids) {
        await page.locator(`[data-share-template="${id}"]`).click(); await waitPreview();
        const { bytes, file } = await download('#download-card', `${id}.png`);
        assert.match(file.suggestedFilename(), /\.png$/);
        assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
        assert.ok(bytes.length > 5000);
        report.images.push({ template: id, width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20), bytes: bytes.length });
      }
    }
    for (const width of [320, 390, 736]) {
      await page.setViewportSize({ width, height: 844 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.querySelector('#sheet').scrollWidth <= document.querySelector('#sheet').clientWidth + 1), `share sheet overflow at ${width}`);
    }
    await page.setViewportSize({ width: 390, height: 844 });
    await page.locator('.share-preview').scrollIntoViewIfNeeded(); await screenshot('share');
    await page.locator('.close-button[data-close]').click();
    assert.equal(await snapshot(), before);
    await nav('settings');
    const beforeBackup = await raw();
    const backup = await download('[data-action="export"]', 'review-backup.json');
    const saved = JSON.parse(backup.bytes.toString());
    for (const key of ['inventory', 'meals', 'diaries', 'dayRecords']) assert.deepEqual(saved[key], JSON.parse(beforeBackup)[key]);
    assert.equal(await raw(), beforeBackup, 'Export may update last-export preference only');
    assert.ok(await page.evaluate(() => localStorage.getItem('jizhi-ai-test-last-export')));
  });

  await check('80-character names, multiline notes and 5000-character diary stay literal and available after expansion', async () => {
    const boundary = structuredClone(fixture);
    const hostile = '<img src=x onerror="globalThis.uiInjected=1">';
    boundary.meals[1].name = (hostile + '草莓牛奶便当'.repeat(8)).slice(0, 77) + '末尾♡';
    boundary.meals[1].note = '第一行配菜。\n第二行纯文本 <b>可爱</b>。\n' + '慢慢记下今天。'.repeat(18) + '【备注尾】';
    boundary.inventory[1].name = '青菜'.repeat(28) + '完整尾♡';
    boundary.inventory[1].note = '食材备注第一行。\n' + hostile + '\n最后一行仍完整。';
    const tail = '【5000字尾部完整】';
    boundary.diaries[0].text = (hostile + '\n今天慢慢写，把生活轻轻收好。'.repeat(400)).slice(0, 5000 - tail.length) + tail;
    boundary.diaries[0].mood = '<b>这个心情也按纯文本显示</b>';
    boundary.dayRecords[0].study.items[0].content = hostile;
    boundary.dayRecords[0].study.items[0].note = hostile + '\n没有 HTML 节点，只有我的原话。';
    assert.equal(boundary.meals[1].name.length, 80); assert.equal(boundary.diaries[0].text.length, 5000);
    await page.evaluate(book => { localStorage.setItem('jizhi-ai-test-book-v1', JSON.stringify(book)); }, boundary);
    await page.goto(url + '#calendar'); await page.reload(); await page.locator('.calendar-page').waitFor();
    const before = await snapshot();
    const lunch = page.locator('[data-meal-fold="meal-1"]');
    assert.equal(await lunch.getAttribute('open'), null);
    await lunch.locator('summary').click();
    assert.ok((await lunch.textContent()).includes(boundary.meals[1].name));
    assert.ok((await lunch.locator('.meal-record-body').textContent()).includes(boundary.meals[1].note));
    const diary = page.locator('.diary-disclosure');
    await diary.locator('summary').click();
    assert.equal(await diary.locator('.diary-text').textContent(), boundary.diaries[0].text);
    await layout('long-meal-and-diary');
    await diary.locator('summary').click(); await lunch.locator('summary').click();
    await nav('inventory');
    const ingredient = page.locator('[data-inventory-id="food-1"]');
    await ingredient.locator('summary').click();
    assert.equal(await ingredient.locator('.ingredient-full-name').textContent(), boundary.inventory[1].name);
    assert.ok((await ingredient.locator('.ingredient-meta').textContent()).includes(boundary.inventory[1].note));
    await layout('long-inventory');
    await enter('timeline');
    const row = page.locator('[data-timeline-date="2026-10-13"]');
    await row.locator('summary').click();
    assert.equal(await row.locator('.timeline-story-text').textContent(), boundary.diaries[0].text);
    assert.ok((await row.locator('.timeline-expanded').textContent()).includes(boundary.dayRecords[0].study.items[0].note));
    await layout('long-timeline', true);
    await nav('summary'); await layout('long-summary');
    assert.equal(await page.evaluate(() => globalThis.uiInjected === 1), false);
    assert.equal(await page.locator('#main img[src="x"], #main script').count(), 0, 'HTML-looking user text cannot create elements');
    assert.equal(await page.locator('#main b').evaluateAll(elements => elements.some(element => ['可爱', '这个心情也按纯文本显示'].includes(element.textContent))), false, 'User emphasis tags stay literal, while authored markup remains allowed');
    assert.equal(await snapshot(), before);
    assert.equal(await page.evaluate(() => localStorage.getItem('notebook-keep-marker')), '原有备份标记，请保留');
  });

  await check('missing records remain editable without incomplete or failure prompts', async () => {
    const empty = { schemaVersion: 3, inventoryVersion: 1, inventory: [], meals: [], diaries: [], dayRecords: [], updatedAt: null };
    await page.evaluate(book => localStorage.setItem('jizhi-ai-test-book-v1', JSON.stringify(book)), empty);
    await page.goto(url + '#calendar'); await page.reload(); await page.locator('.calendar-page').waitFor();
    const before = await snapshot();
    assert.equal(await page.locator('.meals [data-add]').count(), 3);
    assert.equal(await page.locator('[data-action="edit-diary"]').isVisible(), true);
    await layout('empty-day');
    await nav('inventory'); await layout('empty-inventory');
    await nav('summary'); await layout('empty-summary');
    await enter('month'); await layout('empty-month');
    await enter('timeline'); await layout('empty-timeline', true);
    assert.equal(await snapshot(), before);
  });
  await check('all assets load and browser execution is error-free', async () => assert.deepEqual(report.errors, []));
  assert.equal(JSON.parse(originalRaw).schemaVersion, 3);
  await context.close();
} catch (error) { report.failures.push({ name: 'browser setup or navigation', message: error.message }); }
finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
  report.passed = report.failures.length === 0;
  await writeFile(resolve(output, `${engine}-notebook-results.json`), JSON.stringify(report, null, 2));
  console.log(`${engine}: ${report.checks.length} notebook scenarios, ${report.layouts.length} mobile/safe-area layouts, ${report.images.length} downloaded PNGs; ${report.failures.length} failures.`);
  if (!report.passed) process.exitCode = 1;
}
