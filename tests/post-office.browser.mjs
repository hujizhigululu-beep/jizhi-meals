import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { freshState } from '../model.js';
import { STORAGE_KEY, AI_PHASE2_BACKUP_KEY } from '../storage.js';

// Temporary browser profiles, synthetic records and intercepted mock API only.
// Never attach a user browser, read personal records, or use a real credential.
const require = createRequire(import.meta.url);
let playwright;
try { playwright = require('playwright'); }
catch { playwright = require('C:/Users/witty hu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'); }
const root = resolve('.');
const output = resolve(root, 'tests/ui-previews/phase2');
const engine = process.env.UI_ENGINE || 'chromium';
const phase = process.env.POST_BROWSER_PHASE || 'all';
const fakeKey = 'clearly-invalid-post-office-qa-credential';
const date = '2026-10-14', previousDate = '2026-10-13';
const model = 'synthetic-letter-model';
const endpoint = 'https://www.jiemomo.com/v1/chat/completions';
const modelsEndpoint = 'https://www.jiemomo.com/v1/models';
const officialKey = 'jizhi-meals-v1';
const formalSentinel = JSON.stringify({ syntheticFormalRecord: 'never overwrite this fixture' });
const malicious = '<img src=x onerror="globalThis.postExecuted=true">';
const fixture = freshState();
fixture.inventory = [{ id: 'rice-fixture', name: '库存不可发送标记', quantity: 12, perMeal: 1, unit: '份', category: '碳水', note: '库存隐私标记', expires: '' }];
fixture.meals = [date, previousDate].map((d, i) => ({ id: `meal-${i}`, date: d, slot: 'breakfast', name: `人工餐食-${d}`, type: '自制便当', protein: '', note: `餐食备注-${d}`, resources: [], completed: true, completedAt: '2026-10-14T00:00:00.000Z' }));
fixture.diaries = [date, previousDate].map(d => ({ date: d, mood: '开心', text: `人工日记-${d}`, joy: `小确幸-${d}`, updatedAt: '2026-10-14T01:00:00.000Z' }));
fixture.dayRecords = [date, previousDate].map((d, i) => ({ date: d, study: { checked: true, manualChecked: true, categoryIds: [], items: [{ id: `study-${i}`, content: `人工学习-${d}`, minutes: 35, note: `学习备注-${d}` }] }, exercise: { checked: true, manualChecked: true, categoryIds: [], items: [{ id: `exercise-${i}`, content: `人工运动-${d}`, minutes: 25, note: `运动备注-${d}`, distanceKm: 2 }] }, stickerIds: [] }));
// Start from an actual phase-1 schema4 shape so the first phase-2 save must
// create an exact original-document migration backup before adding AI data.
delete fixture.postOffice;
const report = { engine, phase, generatedAt: new Date().toISOString(), scope: 'Temporary mobile browser profiles, artificial life records, mock API. No real API or real phone.', checks: [], failures: [], skipped: [], layouts: [], pageErrors: [], liveAPI: 'Not tested by this mocked UI regression.' };
const redact = value => String(value).split(fakeKey).join('[redacted synthetic credential]');
await mkdir(output, { recursive: true });
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (request, response) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
  catch { response.writeHead(400).end(); return; }
  if (!pathname.startsWith('/ai-test/')) { response.writeHead(404).end(); return; }
  if (pathname === '/ai-test/__fixture.html') { response.setHeader('Content-Type', 'text/html'); response.end('<!doctype html><title>Synthetic cache setup</title>'); return; }
  const file = resolve(root, '.' + pathname.replace(/^\/ai-test/, '').replace(/\/$/, '/index.html'));
  if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream'); response.end(await readFile(file)); }
  catch { response.writeHead(404).end(); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`, base = `${origin}/ai-test/`;
let browser, page, responseMode = 'success', modelMode = 'success';
const requests = [], modelRequests = [], pendingRoutes = [], consoleMessages = [];
let savedExport, defaultPrompts;

async function check(name, run) {
  try { await run(); report.checks.push(name); console.log(`PASS ${name}`); }
  catch (error) { const message = redact(error.message); report.failures.push({ name, message }); console.error(`FAIL ${name}: ${message}`); }
}
const nav = target => page.locator(`.bottom-nav [data-page="${target}"]`).click();
const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY);
const keyInput = () => page.locator('#ai-api-key');
const post = () => page.locator('[data-post-office]');
const prompt = field => page.locator(`[data-post-prompt="${field}"]`);
const category = field => page.locator(`[data-post-select="${field}"]`);
const action = name => page.locator(`[data-post-action="${name}"]`).first();
const status = state => page.waitForFunction(wanted => document.querySelector('[data-post-status]')?.dataset.postStatus === wanted, state);
const modelStatus = state => page.waitForFunction(wanted => document.querySelector('[data-ai-models-status]')?.dataset.status === wanted, state);
async function openLab() {
  await nav('settings');
  const details = page.locator('#ai-lab-slot details');
  if (await details.getAttribute('open') === null) await details.locator('summary').click();
  await keyInput().waitFor();
}
async function openPost() {
  await nav('settings');
  await page.locator('.settings-page [data-page="postoffice"]').click();
  const details = post();
  await details.waitFor();
  if (await details.evaluate(el => el.tagName) === 'DETAILS' && await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  await page.locator('#post-record-preview').waitFor();
  const editors = page.locator('[data-post-editors]');
  if (await editors.getAttribute('open') === null) await editors.locator(':scope > summary').click();
}
async function generate() {
  await action('generate').click();
  if (await page.locator('#confirm-yes').isVisible()) await page.locator('#confirm-yes').click();
}
async function confirmIfAsked() {
  if (await page.locator('#confirm-yes').isVisible()) await page.locator('#confirm-yes').click();
}
async function viewArchivedLetter() {
  const history = page.locator('[data-post-history]');
  if (await history.getAttribute('open') === null) await history.locator(':scope > summary').click();
  await action('view-letter').click();
}
async function credentials() {
  await openLab(); await keyInput().fill(fakeKey);
  await modelStatus('success');
  await page.locator('#ai-model-id').fill(model);
}
async function cleanStorage() {
  const values = await page.evaluate(() => JSON.stringify({ local: Object.entries(localStorage), session: Object.entries(sessionStorage) }));
  assert.ok(!values.includes(fakeKey), 'Credential must never enter browser storage');
  assert.equal(await page.evaluate(key => localStorage.getItem(key), officialKey), formalSentinel);
  assert.ok(!consoleMessages.some(text => text.includes(fakeKey)), 'Credential must never be logged');
}
async function abortPending() {
  for (const route of pendingRoutes.splice(0)) await route.abort().catch(() => {});
}
async function exportJSON() {
  await nav('settings');
  const pending = page.waitForEvent('download'); await page.locator('[data-action="export"]').click(); const download = await pending;
  const stream = await download.createReadStream(); let bytes = ''; for await (const chunk of stream) bytes += chunk;
  assert.ok(!bytes.includes(fakeKey), 'Backup must exclude the credential');
  return JSON.parse(bytes);
}
async function importJSON(value, name = 'synthetic-backup.json') {
  await page.locator('#import-file').setInputFiles({ name, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) });
  await page.locator('#restore-confirm').waitFor(); await page.locator('#restore-confirm').click();
  await page.waitForFunction(() => !document.querySelector('#sheet').open);
}
async function setSelections(kinds) {
  for (const kind of ['diary', 'meals', 'study', 'exercise']) await category(kind).setChecked(kinds.includes(kind));
}
try {
  const options = { headless: true };
  if (process.env.CHROMIUM_PATH && engine === 'chromium') options.executablePath = process.env.CHROMIUM_PATH;
  browser = await playwright[engine].launch(options);
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', acceptDownloads: true, serviceWorkers: 'block' });
  page = await context.newPage(); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push(redact(error.message)));
  page.on('console', message => consoleMessages.push(message.text()));
  await page.clock.setFixedTime(new Date('2026-10-14T04:00:00.000Z'));
  await page.addInitScript(({ storageKey, book, formalKey, formal }) => {
    if (localStorage.getItem(storageKey) === null) localStorage.setItem(storageKey, JSON.stringify(book));
    if (localStorage.getItem(formalKey) === null) localStorage.setItem(formalKey, formal);
  }, { storageKey: STORAGE_KEY, book: fixture, formalKey: officialKey, formal: formalSentinel });
  await context.route('https://**/*', async route => {
    const request = route.request(), url = request.url();
    if (![endpoint, modelsEndpoint, 'https://synthetic-change.example/v1/models', 'https://synthetic-change.example/v1/chat/completions'].includes(url)) { await route.abort(); return; }
    if (request.method() === 'OPTIONS') { await route.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization,content-type', 'Access-Control-Allow-Methods': 'POST,GET' } }); return; }
    const isModels = url.endsWith('/models');
    if (isModels) modelRequests.push({ url, method: request.method() });
    else requests.push({ url, method: request.method(), body: request.postDataJSON() });
    const mode = isModels ? modelMode : responseMode;
    if (mode === 'pending') { pendingRoutes.push(route); return; }
    if (mode === 'network') { await route.abort('failed'); return; }
    const statusCode = mode === 'auth' ? 401 : mode === 'model' ? 404 : 200;
    const body = statusCode !== 200 ? { error: { message: `Unsafe upstream ${fakeKey}` } } : isModels ? { data: [{ id: model }, { id: 'synthetic-secondary-model' }, { id: malicious }, { id: fakeKey }, { id: model }] } : { choices: [{ message: { content: `亲爱的你：\n\n这是一封人工测试来信，今天好好吃饭。\n${malicious}\n${fakeKey}\n\n最原终一` } }] };
    await route.fulfill({ status: statusCode, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': origin }, body: JSON.stringify(body) });
  });
  await page.goto(base); await page.locator('.calendar-page').waitFor();

  if (!['sw', 'preview', 'bookreset'].includes(phase)) {
    await check('First letter defaults to no categories, no life transmission and isolated AI branding', async () => {
      await openPost(); assert.equal(requests.length, 0);
      assert.equal(await page.title(), '机智定食-ai测试版本');
      for (const kind of ['diary', 'meals', 'study', 'exercise']) assert.equal(await category(kind).isChecked(), false);
      const preview = await page.locator('#post-record-preview').inputValue();
      assert.ok(!preview.includes('人工')); assert.ok(!preview.includes('库存隐私'));
      defaultPrompts = Object.fromEntries(await Promise.all(['userPersona', 'characterPersona', 'writingPreset', 'letterTask'].map(async field => [field, await prompt(field).inputValue()])));
      await generate(); await status('error'); assert.equal(requests.length, 0);
      await cleanStorage();
    });
    await check('Key/base automatic GET models contains no life payload and selection keeps manual fallback', async () => {
      await credentials(); assert.equal(modelRequests.length, 1);
      assert.deepEqual(modelRequests[0], { url: modelsEndpoint, method: 'GET' });
      const options = await page.locator('#ai-model-list option').allTextContents();
      assert.ok(options.some(text => text.includes(model))); assert.equal(options.filter(text => text === model).length, 1);
      assert.ok(!options.includes(fakeKey)); assert.ok(options.includes(malicious));
      assert.equal(await page.evaluate(() => Boolean(globalThis.postExecuted)), false);
      await page.locator('#ai-model-list').selectOption('synthetic-secondary-model'); assert.equal(await page.locator('#ai-model-id').inputValue(), 'synthetic-secondary-model');
      await page.locator('#ai-model-filter').fill('secondary'); assert.equal(await page.locator('#ai-model-list option').count(), 2);
      await page.locator('#ai-model-filter').fill('');
      await page.locator('#ai-model-id').fill(model); assert.equal(requests.length, 0); await cleanStorage();
    });
    await check('Model discovery auth failure allows manual model and never shows server error body', async () => {
      modelMode = 'auth'; await page.locator('[data-ai-action="read-models"]').click(); await modelStatus('error');
      assert.match(await page.locator('[data-ai-models-status]').textContent(), /401/);
      assert.ok(!(await page.locator('[data-ai-models-status]').textContent()).includes('Unsafe upstream'));
      assert.equal(await page.locator('#ai-model-id').isDisabled(), false); await page.locator('#ai-model-id').fill(model);
      modelMode = 'success'; await page.locator('[data-ai-action="read-models"]').click(); await modelStatus('success');
    });
    await check('Model key/base edits cancel stale discovery and do not accept old catalog', async () => {
      modelMode = 'pending'; await page.locator('[data-ai-action="read-models"]').click(); await modelStatus('loading');
      await page.locator('#ai-base-url').fill('https://synthetic-change.example/v1');
      assert.equal(await page.locator('#ai-model-list option').count(), 1);
      await abortPending(); modelMode = 'success';
      await page.locator('#ai-base-url').fill('https://www.jiemomo.com/v1');
      await modelStatus('success'); await page.locator('#ai-model-id').fill(model);
    });
    await check('Only selected date/categories enter preview; excluded inventory and other days stay private', async () => {
      await openPost(); await page.locator('#post-date').fill(previousDate); await setSelections(['diary', 'study']);
      const preview = await page.locator('#post-record-preview').inputValue();
      assert.ok(preview.includes(`人工日记-${previousDate}`)); assert.ok(preview.includes(`人工学习-${previousDate}`));
      for (const excluded of [`人工日记-${date}`, `人工餐食-${previousDate}`, `人工运动-${previousDate}`, '库存隐私标记']) assert.ok(!preview.includes(excluded));
      assert.equal(requests.length, 0);
      await page.locator('#post-date').fill(date); await setSelections(['meals', 'exercise']);
      const second = await page.locator('#post-record-preview').inputValue();
      assert.ok(second.includes(`人工餐食-${date}`)); assert.ok(second.includes(`人工运动-${date}`));
      for (const excluded of [`人工日记-${date}`, `人工学习-${date}`, previousDate, '库存隐私标记']) assert.ok(!second.includes(excluded));
    });
    await check('All four long Tavo fields save independently and keep original text; reset one leaves others', async () => {
      const values = { userPersona: '\n用户设定开头\n' + '人工用户长Tavo设定。'.repeat(2500) + '\n用户设定结尾\n', characterPersona: '\n人工角色设定唯一标记\n' + malicious, writingPreset: '\n人工写作预设唯一标记\n保持段落与空行。\n', letterTask: '\n人工邮局任务唯一标记\n只写正文。\n' };
      for (const [field, text] of Object.entries(values)) await prompt(field).fill(text);
      await page.locator('[data-post-prompt-save="userPersona"]').click();
      const firstSave = (await stored()).postOffice;
      assert.equal(firstSave.userPersona, values.userPersona); assert.equal(firstSave.writingPreset, defaultPrompts.writingPreset); assert.equal(firstSave.letterTask, defaultPrompts.letterTask);
      assert.equal(firstSave.characters.find(character => character.id === 'saihara').persona, defaultPrompts.characterPersona);
      assert.equal(await page.evaluate(key => localStorage.getItem(key), AI_PHASE2_BACKUP_KEY), JSON.stringify(fixture));
      for (const field of ['characterPersona', 'writingPreset', 'letterTask']) { assert.equal(await prompt(field).inputValue(), values[field]); await page.locator(`[data-post-prompt-save="${field}"]`).click(); }
      await nav('calendar'); await openPost();
      for (const [field, text] of Object.entries(values)) assert.equal(await prompt(field).inputValue(), text);
      await page.locator('[data-post-prompt-reset="writingPreset"]').click(); await confirmIfAsked();
      assert.equal(await prompt('writingPreset').inputValue(), defaultPrompts.writingPreset);
      for (const field of ['userPersona', 'characterPersona', 'letterTask']) assert.equal(await prompt(field).inputValue(), values[field]);
      await prompt('writingPreset').fill(values.writingPreset); await page.locator('[data-post-prompt-save="writingPreset"]').click();
      await cleanStorage();
    });
    await check('Most-original and little-tt character presets remain separate, including unsaved editing draft', async () => {
      const mainPersona = await prompt('characterPersona').inputValue();
      await page.locator('#post-character').selectOption('little-tt');
      assert.ok(!(await prompt('characterPersona').inputValue()).includes('人工角色设定唯一标记'));
      await prompt('characterPersona').fill('小tt人工独立设定与独立称呼'); await page.locator('[data-post-prompt-save="characterPersona"]').click();
      await page.locator('#post-character').selectOption('saihara'); assert.equal(await prompt('characterPersona').inputValue(), mainPersona);
      await page.locator('#post-character').selectOption('little-tt'); assert.equal(await prompt('characterPersona').inputValue(), '小tt人工独立设定与独立称呼');
      await prompt('characterPersona').fill('小tt尚未保存的人工草稿'); await page.locator('#post-character').selectOption('saihara'); assert.equal(await prompt('characterPersona').inputValue(), mainPersona);
      await page.locator('#post-character').selectOption('little-tt'); assert.equal(await prompt('characterPersona').inputValue(), '小tt尚未保存的人工草稿');
      assert.equal((await stored()).postOffice.characters.find(character => character.id === 'little-tt').persona, '小tt人工独立设定与独立称呼');
      await page.locator('#post-character').selectOption('saihara'); assert.equal(requests.length, 0);
    });
    await check('Changing record categories asks before replacing manually edited preview; cancel preserves it', async () => {
      const manual = '人工手写发送草稿，尚未提交。'; await page.locator('#post-record-preview').fill(manual);
      await category('diary').setChecked(true); await page.locator('#confirm-no').waitFor(); await page.locator('#confirm-no').click();
      assert.equal(await page.locator('#post-record-preview').inputValue(), manual); assert.equal(await category('diary').isChecked(), false); assert.equal(requests.length, 0);
    });
    await check('Manual preview and editable length are sent intact only on explicit generate; natural letter text is XSS/key safe', async () => {
      const manual = `  人工手动修改正文，只发送这段。\n${malicious}\n手动正文结尾  `;
      await page.locator('#post-record-preview').fill(manual); await page.locator('#post-length').fill('约 750 字，保留三段');
      const before = requests.length, original = await stored();
      await generate(); await status('success');
      assert.equal(requests.length, before + 1);
      const payload = requests.at(-1).body; assert.equal(payload.model, model); assert.equal(payload.stream, false);
      assert.ok(payload.messages.every(message => typeof message.content === 'string'));
      const combined = payload.messages.map(message => message.content).join('\n');
      const needles = ['用户设定开头', '人工角色设定唯一标记', '人工写作预设唯一标记', '人工邮局任务唯一标记', manual];
      for (const needle of needles) assert.ok(combined.includes(needle));
      assert.ok(needles.every((needle, i) => i === 0 || combined.indexOf(needle) > combined.indexOf(needles[i - 1])));
      assert.ok(combined.includes('750')); assert.ok(!combined.includes('人工日记-')); assert.ok(!combined.includes('人工餐食-')); assert.ok(!combined.includes('库存隐私标记')); assert.ok(!combined.includes(fakeKey));
      assert.ok(combined.includes('用户设定结尾')); assert.ok(combined.length > 25000);
      const letter = await page.locator('[data-post-letter-body]').textContent();
      assert.ok(letter.includes(malicious)); assert.ok(letter.includes('【密钥已隐藏】')); assert.ok(!letter.includes(fakeKey));
      assert.equal(await page.locator('[data-post-letter-body] img,[data-post-letter-body] script').count(), 0);
      assert.equal(await page.evaluate(() => Boolean(globalThis.postExecuted)), false);
      assert.deepEqual((await stored()).diaries, original.diaries); assert.equal((await stored()).postOffice.letters.length, 0); await cleanStorage();
    });
    await check('Collection is explicit, preserves original diary and stores date/role/body/time; history is readable', async () => {
      const original = await stored(); await action('save-letter').click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).postOffice.letters.length === 1, STORAGE_KEY);
      const next = await stored(), letter = next.postOffice.letters[0];
      assert.equal(letter.date, date); assert.ok(letter.characterName); assert.ok(letter.body.includes('人工测试来信')); assert.ok(letter.generatedAt); assert.ok(!JSON.stringify(letter).includes(fakeKey));
      assert.deepEqual(next.diaries, original.diaries); await viewArchivedLetter();
      assert.match(await page.locator('[data-post-saved-body]').textContent(), /人工测试来信/); await cleanStorage();
    });
    await check('Deleting the preview collection unlocks explicit collection again without duplicate request or diary changes', async () => {
      const original = await stored(), beforeRequests = requests.length;
      assert.equal(await action('save-letter').isDisabled(), true);
      await action('delete-letter').click(); await confirmIfAsked(); await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).postOffice.letters.length === 0, STORAGE_KEY);
      assert.equal(await action('save-letter').isDisabled(), false); await action('save-letter').click();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).postOffice.letters.length === 1, STORAGE_KEY);
      assert.equal(await action('save-letter').isDisabled(), true); assert.equal(requests.length, beforeRequests); assert.deepEqual((await stored()).diaries, original.diaries);
    });
    await check('Regeneration requires another explicit click, and cancellation/errors preserve life records', async () => {
      const baseline = await stored(); const before = requests.length;
      await generate(); await status('success'); assert.equal(requests.length, before + 1);
      assert.equal((await stored()).postOffice.letters.length, baseline.postOffice.letters.length);
      responseMode = 'pending'; await generate(); await status('loading'); await action('cancel').click(); await status('cancelled'); await abortPending();
      responseMode = 'auth'; await generate(); await status('error');
      assert.match(await page.locator('[data-post-status]').textContent(), /401/); assert.ok(!(await post().textContent()).includes('Unsafe upstream'));
      responseMode = 'network'; await generate(); await status('error'); assert.match(await page.locator('[data-post-status]').textContent(), /CORS/);
      const after = await stored(); for (const field of ['inventory', 'meals', 'diaries', 'dayRecords']) assert.deepEqual(after[field], baseline[field]);
      responseMode = 'success'; await cleanStorage();
    });
    await check('120-second timeout, provider edit and leaving post office abort pending generation without retry', async () => {
      const baseline = await stored(); responseMode = 'pending';
      await generate(); await status('loading'); await page.clock.fastForward(121000); await status('error'); assert.match(await page.locator('[data-post-status]').textContent(), /超时/); await abortPending();
      await generate(); await status('loading'); await page.locator('#ai-base-url').fill('https://synthetic-change.example/v1'); await status('cancelled'); await abortPending();
      await page.locator('#ai-base-url').fill('https://www.jiemomo.com/v1'); await modelStatus('success'); await page.locator('#ai-model-id').fill(model);
      await generate(); await status('loading'); const beforeLeaving = requests.length; await nav('settings'); await abortPending(); await openPost();
      assert.equal(requests.length, beforeLeaving); await status('cancelled');
      const after = await stored(); for (const field of ['inventory', 'meals', 'diaries', 'dayRecords']) assert.deepEqual(after[field], baseline[field]);
      responseMode = 'success'; await cleanStorage();
    });
    await check('JSON export/restore includes separate prompts and letter archive, never API credential or connection configuration', async () => {
      savedExport = await exportJSON();
      assert.ok(savedExport.postOffice.userPersona.length > 25000); assert.equal(savedExport.postOffice.letters.length, 1);
      const encoded = JSON.stringify(savedExport); for (const omitted of [fakeKey, 'jiemomo', model, 'apiKey']) assert.ok(!encoded.includes(omitted));
      await importJSON(savedExport); assert.deepEqual((await stored()).postOffice, savedExport.postOffice); await openPost();
      assert.equal(await prompt('userPersona').inputValue(), savedExport.postOffice.userPersona); await cleanStorage();
    });
    await check('Old phase-1 schema4 JSON imports safely with blank letter archive and default editable presets', async () => {
      const old = structuredClone(fixture); delete old.postOffice;
      await importJSON(old, 'synthetic-old-schema4.json'); const next = await stored();
      assert.equal(next.schemaVersion, 4); assert.equal(next.postOffice.letters.length, 0); assert.deepEqual(next.diaries, fixture.diaries);
      assert.ok(next.postOffice.characters.some(character => character.name === '最原终一')); assert.ok(next.postOffice.characters.some(character => character.name === '小tt'));
      await importJSON(savedExport); await openPost(); await cleanStorage();
    });
    await check('History deletion is deliberate and does not delete the original diary', async () => {
      const previous = await stored(); await action('delete-letter').first().click();
      const confirm = page.locator('[data-post-action="confirm-delete"]'); if (await confirm.count()) await confirm.click();
      await confirmIfAsked();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).postOffice.letters.length === 0, STORAGE_KEY);
      assert.deepEqual((await stored()).diaries, previous.diaries); await importJSON(savedExport); await openPost();
    });
    await check('AI errors do not block ordinary meal, diary, inventory and study/exercise editing', async () => {
      await nav('calendar'); await page.locator('[data-add="lunch"]').click(); await page.locator('#meal-form [name="name"]').fill('新增人工午餐'); await page.locator('#meal-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#sheet').open);
      assert.ok((await stored()).meals.some(meal => meal.name === '新增人工午餐'));
      await page.locator('[data-action="edit-diary"]').click(); await page.locator('#diary-form [name="text"]').fill('人工日记更新'); await page.locator('#diary-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#sheet').open);
      assert.equal((await stored()).diaries.find(row => row.date === date).text, '人工日记更新');
      for (const kind of ['study', 'exercise']) await page.locator(`[data-activity-category][data-kind="${kind}"]`).first().click();
      await nav('inventory'); await page.locator('[data-action="add-ingredient"]').first().click(); await page.locator('#ingredient-form [name="name"]').fill('新增人工水果'); await page.locator('#ingredient-form [name="quantity"]').fill('5'); await page.locator('#ingredient-form [type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('#sheet').open);
      assert.ok((await stored()).inventory.some(item => item.name === '新增人工水果')); await cleanStorage();
    });
    await check('Reload clears API key but keeps independently saved presets and collected letters', async () => {
      await page.reload(); await openLab(); assert.equal(await keyInput().inputValue(), '');
      await openPost(); assert.ok((await prompt('userPersona').inputValue()).includes('用户设定结尾')); assert.equal((await stored()).postOffice.letters.length, 1); await cleanStorage();
    });
    await check('320/390/430 mobile editors and letter reading have no overflow, touch targets and at least 16px input text', async () => {
      await openLab(); await page.locator('[data-ai-action="clear-key"]').click(); assert.equal(await keyInput().inputValue(), ''); await openPost();
      await viewArchivedLetter();
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 }); await post().scrollIntoViewIfNeeded();
        const metrics = await page.evaluate(() => ({ width: innerWidth, overflow: document.documentElement.scrollWidth - innerWidth, inputSizes: [...document.querySelectorAll('[data-post-office] input:not([type="checkbox"]),[data-post-office] textarea,[data-post-office] select')].map(input => parseFloat(getComputedStyle(input).fontSize)), buttons: [...document.querySelectorAll('[data-post-office] button')].filter(button => button.getClientRects().length).map(button => ({ text: button.textContent.trim(), height: button.getBoundingClientRect().height })) }));
        report.layouts.push(metrics); assert.ok(metrics.overflow <= 1, `Horizontal overflow at ${width}px`); assert.ok(metrics.inputSizes.every(size => size >= 16)); assert.ok(metrics.buttons.every(size => size.height >= 40));
        await page.screenshot({ path: resolve(output, `post-office-${engine}-${width}.png`), fullPage: true });
      }
      await page.setViewportSize({ width: 390, height: 844 }); await page.locator('[data-post-saved-body]').scrollIntoViewIfNeeded();
      await page.screenshot({ path: resolve(output, `post-office-${engine}-390-letter.png`), fullPage: false });
    });
    await check('No uncaught JavaScript errors or API key logs during all operations', async () => { assert.deepEqual(report.pageErrors, []); await cleanStorage(); });
  }
  if (phase === 'bookreset') {
    await check('Restore replaces dirty unsaved persona and old letter preview with the restored book configuration', async () => {
      await credentials(); await openPost(); await prompt('userPersona').fill('旧书尚未保存的人工Persona草稿'); await setSelections(['diary']); await generate(); await status('success');
      assert.equal(await page.locator('[data-post-preview]').isVisible(), true); assert.ok((await page.locator('[data-post-request]').textContent()).includes('旧书尚未保存'));
      const restored = { ...structuredClone(fixture), postOffice: { ...freshState().postOffice, userPersona: '新备份已保存的人工Persona设定' } };
      await nav('settings'); await importJSON(restored, 'synthetic-new-book.json'); await openPost();
      assert.equal(await prompt('userPersona').inputValue(), '新备份已保存的人工Persona设定'); assert.equal(await page.locator('[data-post-preview]').isVisible(), false);
      assert.equal(await page.locator('[data-post-letter-body]').textContent(), ''); assert.equal(await page.locator('#post-record-preview').inputValue(), '');
      assert.ok(!(await post().textContent()).includes('旧书尚未保存')); assert.deepEqual((await stored()).diaries, fixture.diaries); await cleanStorage();
    });
    await check('Clear discards dirty drafts, old preview and selection while leaving formal namespace untouched', async () => {
      await prompt('userPersona').fill('清空前尚未保存的人工Persona草稿'); await setSelections(['diary']); await generate(); await status('success');
      assert.equal(await page.locator('[data-post-preview]').isVisible(), true);
      await nav('settings'); await page.locator('[data-action="clear"]').click(); await page.locator('#confirm-yes').click(); await openPost();
      assert.equal(await prompt('userPersona').inputValue(), ''); assert.equal(await page.locator('[data-post-preview]').isVisible(), false); assert.equal(await page.locator('[data-post-letter-body]').textContent(), '');
      assert.equal(await page.locator('#post-record-preview').inputValue(), ''); for (const kind of ['diary', 'meals', 'study', 'exercise']) assert.equal(await category(kind).isChecked(), false);
      const book = await stored(); for (const field of ['inventory', 'meals', 'diaries', 'dayRecords']) assert.equal(book[field].length, 0); assert.equal(book.postOffice.letters.length, 0);
      assert.ok(!(await post().textContent()).includes('清空前尚未保存')); await cleanStorage();
    });
    await check('Unselecting every life category erases previous private record from full-request preview and sends nothing', async () => {
      await nav('settings'); await importJSON(fixture, 'synthetic-privacy-fixture.json'); await openPost(); await setSelections(['diary', 'meals']);
      await page.waitForFunction(() => document.querySelector('[data-post-request]').textContent.includes('人工日记-2026-10-14'));
      const before = requests.length; await setSelections([]);
      assert.equal(await page.locator('#post-record-preview').inputValue(), '');
      await page.waitForFunction(() => document.querySelector('[data-post-request]').textContent === '');
      const full = await page.locator('[data-post-request]').textContent(); assert.ok(!full.includes('人工日记')); assert.ok(!full.includes('人工餐食'));
      await generate(); await status('error'); assert.equal(requests.length, before); await cleanStorage(); assert.deepEqual(report.pageErrors, []);
    });
  }
  await context.close();
  if (phase === 'preview') await check('Clean letter screenshot uses artificial archived example, no API key or personal data', async () => {
    const showcaseContext = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', serviceWorkers: 'block' });
    const showcase = await showcaseContext.newPage();
    const sample = { ...structuredClone(fixture), postOffice: { ...freshState().postOffice, letters: [{ id: 'synthetic-showcase-letter', date, characterName: '最原终一', generatedAt: '2026-10-14T04:00:00.000Z', body: '亲爱的你：\n\n读到你今天认真准备早餐，又抽出一点时间学习，我想告诉你：这些平常的小事，也很值得被温柔地记住。\n\n如果今天有一点累，就允许自己慢一点吧。把没完成的事留给明天，给自己倒一杯温热的牛奶，今晚先好好休息。\n\n谢谢你愿意把这一天寄给我。我会认真读完，也会期待你的下一封日常。\n\n愿今晚的你，被生活轻轻照顾。\n\n最原终一\n\n（人工示例来信，用于界面预览）' }] } };
    await showcase.addInitScript(({ key, book }) => localStorage.setItem(key, JSON.stringify(book)), { key: STORAGE_KEY, book: sample });
    await showcaseContext.route('https://**/*', route => route.abort());
    await showcase.goto(base + '#postoffice'); await showcase.locator('[data-post-office]').waitFor();
    assert.equal(await showcase.locator('#ai-api-key').inputValue(), '');
    await showcase.locator('[data-post-history] > summary').click(); await showcase.locator('[data-post-action="view-letter"]').click();
    await showcase.locator('[data-post-history]').screenshot({ path: resolve(output, 'phase2-letter-preview.png') });
    assert.ok(!(await showcase.locator('[data-post-history]').textContent()).includes(malicious));
    await showcaseContext.close();
  });
  if (engine === 'chromium' && !['preview', 'bookreset'].includes(phase)) await check('AI Service Worker cache/scope is isolated; offline prompts, archive and core journal continue to work', async () => {
    const offline = await browser.newContext({ viewport: { width: 390, height: 844 }, timezoneId: 'Asia/Shanghai', serviceWorkers: 'allow' });
    const offlinePage = await offline.newPage(); await offlinePage.goto(base + '__fixture.html');
    await offlinePage.evaluate(async ({ storageKey, book, formalKey, formal }) => { await caches.open('jizhi-shell-formal-sentinel'); await caches.open('jizhi-ai-test-shell-stale'); await caches.open('unrelated-sentinel'); localStorage.setItem(storageKey, JSON.stringify(book)); localStorage.setItem(formalKey, formal); }, { storageKey: STORAGE_KEY, book: fixture, formalKey: officialKey, formal: formalSentinel });
    await offlinePage.goto(base); await offlinePage.locator('.calendar-page').waitFor();
    await offlinePage.evaluate(async () => {
      await Promise.race([(async () => { const registration = await navigator.serviceWorker.ready; if (registration.active.state !== 'activated') await new Promise(done => registration.active.addEventListener('statechange', function changed() { if (this.state === 'activated') { this.removeEventListener('statechange', changed); done(); } })); if (!navigator.serviceWorker.controller) await new Promise(done => navigator.serviceWorker.addEventListener('controllerchange', done, { once: true })); })(), new Promise((_, reject) => setTimeout(() => reject(new Error('Service Worker activation timed out')), 20000))]);
    });
    const cacheInfo = await offlinePage.evaluate(async () => ({ names: await caches.keys(), scopes: (await navigator.serviceWorker.getRegistrations()).map(registration => registration.scope), paths: (await Promise.all((await caches.keys()).filter(key => key.startsWith('jizhi-ai-test-shell-')).map(async key => (await (await caches.open(key)).keys()).map(request => new URL(request.url).pathname)))).flat() }));
    assert.ok(cacheInfo.names.includes('jizhi-shell-formal-sentinel')); assert.ok(cacheInfo.names.includes('unrelated-sentinel')); assert.ok(!cacheInfo.names.includes('jizhi-ai-test-shell-stale')); assert.deepEqual(cacheInfo.scopes, [base]);
    for (const module of ['post-office.js', 'post-office-entry.js', 'post-office-view.js', 'ai-session.js']) assert.ok(cacheInfo.paths.includes(`/ai-test/${module}`), `Offline cache missing ${module}`);
    await offline.setOffline(true); await offlinePage.reload(); await offlinePage.locator('.calendar-page').waitFor();
    await offlinePage.locator('.bottom-nav [data-page="settings"]').click(); await offlinePage.locator('.settings-page [data-page="postoffice"]').click(); const office = offlinePage.locator('[data-post-office]'); if (await office.evaluate(el => el.tagName) === 'DETAILS' && await office.getAttribute('open') === null) await office.locator(':scope > summary').click();
    await offlinePage.locator('[data-post-editors] > summary').click();
    await offlinePage.locator('[data-post-prompt="userPersona"]').fill('离线人工用户设定'); await offlinePage.locator('[data-post-prompt-save="userPersona"]').click();
    assert.equal((await offlinePage.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)).postOffice.userPersona, '离线人工用户设定');
    await offlinePage.locator('.bottom-nav [data-page="calendar"]').click(); await offlinePage.locator('[data-add="lunch"]').click(); await offlinePage.locator('#meal-form [name="name"]').fill('离线人工午餐'); await offlinePage.locator('#meal-form [type="submit"]').click(); await offlinePage.waitForFunction(() => !document.querySelector('#sheet').open);
    assert.ok((await offlinePage.evaluate(key => JSON.parse(localStorage.getItem(key)), STORAGE_KEY)).meals.some(meal => meal.name === '离线人工午餐'));
    assert.equal(await offlinePage.evaluate(key => localStorage.getItem(key), officialKey), formalSentinel); await offline.close();
  });
  else if (engine !== 'chromium') report.skipped.push('Playwright WebKit Service Worker runtime is unavailable; isolated cache/offline path is tested in Chromium.');
} finally {
  await abortPending(); await browser?.close(); await new Promise(done => server.close(done));
  // Deliberately omit request headers, request payloads, credentials, and upstream errors.
  await writeFile(resolve(output, `post-office-${engine}-${phase}-report.json`), redact(JSON.stringify(report, null, 2)));
}
console.log(JSON.stringify({ engine, phase, passed: report.checks.length, failures: report.failures.length, report: resolve(output, `post-office-${engine}-${phase}-report.json`) }));
if (report.failures.length) process.exitCode = 1;
