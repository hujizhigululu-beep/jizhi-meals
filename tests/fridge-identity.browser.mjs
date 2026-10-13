import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import assert from 'node:assert/strict';
const { chromium, webkit, devices } = createRequire(import.meta.url)('playwright');
const root = resolve('.');
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.png':'image/png', '.webmanifest':'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = resolve(root, '.' + new URL(req.url, 'http://localhost').pathname.replace(/\/$/, '/index.html'));
  if (!path.startsWith(root + sep)) { res.writeHead(403).end(); return; }
  try { res.setHeader('Content-Type', mime[extname(path)] || 'text/plain'); res.end(await readFile(path)); }
  catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const output = resolve(process.env.IDENTITY_SCREENSHOTS || 'tests/ui-previews/fridge-identity');
await mkdir(output, { recursive:true });
try {
  for (const [name, engine, device] of [['chrome',chromium,devices['Pixel 7']],['webkit',webkit,devices['iPhone 13']]]) {
    const browser = await engine.launch({ headless:true, ...(name==='chrome' && process.env.CHROMIUM_PATH ? { executablePath:process.env.CHROMIUM_PATH } : {}) });
    try {
      const page = await browser.newPage({ ...device, viewport:{width:390,height:844}, deviceScaleFactor:1, timezoneId:'Asia/Shanghai' });
      const errors = []; page.on('pageerror', error => errors.push(error.message));
      await page.addInitScript(() => {
        localStorage.setItem('jizhi-meals-v1', JSON.stringify({ schemaVersion:2, inventory:['蛋白质','蔬菜','碳水','整套食物','早餐'].map((category,i) => ({ id:'food-'+i, name:['牛肉丸','绿叶蔬菜','米饭','完整便当','早餐面包'][i], category,quantity:[9,8,12,3,5][i],perMeal:1,unit:'份',note:i===1?'洗好收在冷藏格':'',expires:'' })), meals:[],diaries:[] }));
      });
      await page.goto(`http://127.0.0.1:${server.address().port}/#inventory`); await page.locator('.fridge-rows').waitFor();
      const raw = await page.evaluate(() => localStorage.getItem('jizhi-meals-v1'));
      const toggleStyle = enabled => page.evaluate(enabled => { document.querySelector('#strawberry-identity-style').disabled = !enabled; }, enabled);
      await toggleStyle(false);
      await page.screenshot({ path:resolve(output,`before-${name}.png`) });
      await toggleStyle(true);
      await page.screenshot({ path:resolve(output,`after-${name}.png`) });
      const hideNavigation = await page.addStyleTag({content:'.bottom-nav { visibility:hidden !important; }'});
      await page.locator('.inventory-list').screenshot({ path:resolve(output,`list-${name}.png`) });
      await hideNavigation.evaluate(node => node.remove());
      assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor),'rgb(255, 248, 250)');
      assert.equal(await page.locator('.runway-details').getAttribute('open'),null);
      for (const width of [320,375,390]) {
        await page.setViewportSize({width,height:844});
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`${name} overflow ${width}`);
        for (const row of await page.locator('.ingredient-row').all()) {
          if (await row.getAttribute('open') === null) await row.locator('summary').click();
          const button = row.locator('[data-ingredient]');
          await button.evaluate(node => node.scrollIntoView({block:'center'}));
          assert.ok(await button.evaluate(node => { const r=node.getBoundingClientRect(); return node.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); }),`${name} edit button covered`);
        }
      }
      await page.locator('.runway-details > summary').click();
      await page.locator('#runway-daily').selectOption('1');
      assert.equal(await page.locator('.runway-total strong').innerText(),'11');
      await page.locator('[data-fridge-view="cards"]').click();
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),true,`${name} cards overflow`);
      await page.locator('[data-ingredient="food-0"]').click(); await page.locator('#ingredient-form').waitFor();
      await page.locator('.close-button[data-close]').click();
      await page.locator('[data-page="settings"]').click(); await page.locator('.settings-page').waitFor();
      const styled = await page.evaluate(() => ({body:getComputedStyle(document.body).backgroundColor,header:getComputedStyle(document.querySelector('.brand-header')).backgroundImage}));
      await toggleStyle(false);
      assert.notDeepEqual(await page.evaluate(() => ({body:getComputedStyle(document.body).backgroundColor,header:getComputedStyle(document.querySelector('.brand-header')).backgroundImage})),styled,'brand should be shared across pages');
      assert.equal(await page.evaluate(() => localStorage.getItem('jizhi-meals-v1')),raw,'visual sample must not change data');
      assert.deepEqual(errors,[]);
      console.log(`${name}: mobile layouts, clear edit targets, list/cards, fold, editor, unchanged raw data and shared brand styling passed.`);
    } finally { await browser.close(); }
  }
} finally { await new Promise(r => server.close(r)); }
