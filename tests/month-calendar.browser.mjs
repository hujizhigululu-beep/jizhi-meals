import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const { chromium, webkit } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const styles = ['style.css', 'journal.css', 'v11.css', 'timeline.css', 'compact.css', 'fridge.css', 'summary-ui.css', 'settings-ui.css', 'soft-ui.css', 'strawberry-ui.css', 'timeline-story.css', 'meal-density.css', 'macaron-palette.css', 'month-calendar.css'];
const pageHtml = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${styles.map(file => `<link rel="stylesheet" href="/${file}">`).join('')}<body><main class="app-shell"><div id="calendar-test"></div><div class="timeline-page" id="timeline-test"></div></main><script type="module">
import { renderMonthCalendar, monthCells } from '/month-calendar.js';
import { renderTimelineRows } from '/timeline.js';
window.fixture={inventory:[],diaries:[],meals:[{date:'2026-10-13',slot:'lunch',name:'牛肉饭'}],dayRecords:[{date:'2026-10-13',study:{checked:true,items:[{id:'study',content:'日语',minutes:null,note:'看了两页笔记。'}]},exercise:{checked:true,items:[{id:'exercise',content:'徒步',minutes:30,note:'慢慢走了半小时。'}]},stickerIds:['milk','book','shoe']}]};
window.before=JSON.stringify(window.fixture);
window.render=(month='2026-10',mode='all')=>{document.getElementById('calendar-test').innerHTML=renderMonthCalendar(window.fixture,{month,mode,selectedDate:'2026-10-13',today:'2026-10-13'});document.getElementById('timeline-test').innerHTML=renderTimelineRows(window.fixture,['2026-10-13'],{expandedDates:new Set(['2026-10-13'])});};
window.render();window.ready=true;
</script></body></html>`;
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };
const server = createServer(async (req, res) => {
  if (req.url === '/__month-calendar-test') { res.setHeader('Content-Type', 'text/html'); res.end(pageHtml); return; }
  const pathname = new URL(req.url, 'http://localhost').pathname;
  const file = resolve(root, '.' + pathname);
  if (!file.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(file)] || 'text/plain'); res.end(await readFile(file)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const engineName = process.env.UI_ENGINE === 'webkit' ? 'webkit' : 'chrome';
const browser = await (engineName === 'webkit' ? webkit : chromium).launch({ headless: true, ...(engineName === 'chrome' && process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) });
const screenshots = process.env.MONTH_SCREENSHOTS;
if (screenshots) await mkdir(screenshots, { recursive: true });
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/__month-calendar-test`);
  await page.waitForFunction(() => window.ready);
  for (const width of [320, 390, 736]) {
    await page.setViewportSize({ width, height: 844 });
    await page.evaluate(() => window.render());
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth - innerWidth,
      count: document.querySelectorAll('[data-month-date]').length,
      totalCells: document.querySelector('.month-grid').children.length,
      styles: ['.month-grid', '.month-day', '.month-empty-cell'].map(selector => { const style = getComputedStyle(document.querySelector(selector)); return { borderTop: style.borderTopStyle, borderRight: style.borderRightStyle, borderBottom: style.borderBottomStyle, radius: style.borderRadius }; }),
      minHeight: Math.min(...[...document.querySelectorAll('.month-calendar button')].map(el => el.getBoundingClientRect().height)),
      dots: document.querySelector('[data-month-date="2026-10-13"]').querySelectorAll('.month-dot').length,
      loadedStickers: [...document.querySelectorAll('.timeline-sticker-strip img')].every(image => image.complete && image.naturalWidth > 0),
      unchanged: JSON.stringify(window.fixture) === window.before,
    }));
    assert.ok(metrics.overflow <= 1, `${engineName} ${width}px overflow: ${JSON.stringify(metrics)}`);
    assert.equal(metrics.count, 31); assert.equal(metrics.totalCells, 35);
    assert.equal(metrics.styles[0].borderTop, 'dashed');
    for (const cell of metrics.styles.slice(1)) { assert.equal(cell.borderRight, 'dashed'); assert.equal(cell.borderBottom, 'dashed'); assert.equal(cell.radius, '0px'); }
    assert.ok(metrics.minHeight >= 44); assert.equal(metrics.dots, 3); assert.ok(metrics.unchanged);
    await page.waitForFunction(() => [...document.querySelectorAll('.timeline-sticker-strip img')].every(image => image.complete && image.naturalWidth > 0));
    if (screenshots) await page.screenshot({ path: resolve(screenshots, `${engineName}-${width}.png`), fullPage: true });
  }
  for (const mode of ['meal', 'exercise', 'study']) {
    await page.evaluate(mode => window.render('2026-10', mode), mode);
    assert.equal(await page.locator('.month-grid .month-dot').count(), 1);
    assert.equal(await page.locator('.month-grid .month-dot').getAttribute('data-kind'), mode);
  }
  await page.evaluate(() => { window.fixture.dayRecords[0].study.checked = false; window.fixture.dayRecords[0].exercise.checked = false; window.render(); });
  assert.equal(await page.locator('.month-grid .month-dot').count(), 1);
  assert.equal(await page.locator('.timeline-activity-state.is-unchecked').count(), 2);
  assert.equal(await page.locator('.timeline-activity-items').count(), 2);
  await page.evaluate(() => window.render('0001-01'));
  assert.ok(await page.locator('[data-month-step="-1"]').isDisabled());
  await page.evaluate(() => window.render('9999-12'));
  assert.ok(await page.locator('[data-month-step="1"]').isDisabled());
  assert.equal(await page.locator('[data-month-date="9999-12-31"]').count(), 1);
  assert.deepEqual(errors, []);
  console.log(`${engineName}: 320/390/736px dashed month grid, single-kind dots, read-only rendering, retained cancelled details and loaded SVG stickers passed.`);
  await context.close();
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
