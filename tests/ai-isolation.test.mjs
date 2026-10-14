import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import * as storageApi from '../storage.js';
import { freshState, putDiary } from '../model.js';
import { renderNotebookHeader } from '../notebook-header.js';
import { renderSettingsView } from '../settings-view.js';

const APP_NAME = '机智定食-ai测试版本';
const FORMAL_KEYS = [
  'jizhi-meals-v1', 'jizhi-meals-v1-migration-backup',
  'jizhi-meals-v1.3-upgrade-backup', 'jizhi-meals-v1.4-upgrade-backup',
  'jizhi-meals-v1.5-upgrade-backup', 'jizhi-last-export',
  'jizhi-fridge-view', 'jizhi-runway-daily', 'jizhi-runway-mode',
];
const [appSource, swSource, html, manifestSource] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../sw.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8'),
  readFile(new URL('../manifest.webmanifest', import.meta.url), 'utf8'),
]);
const aiStateKeys = Object.entries(storageApi)
  .filter(([name]) => name.endsWith('_KEY')).map(([, key]) => key);

class SharedOriginStorage {
  constructor(extraEntries = []) {
    const formal = freshState();
    putDiary(formal, { date: '2026-10-14', mood: '安心', text: '正式版私密记录哨兵', joy: '' });
    this.formal = FORMAL_KEYS.map(key => [key, key === FORMAL_KEYS[0] ? JSON.stringify(formal) : `formal:${key}`]);
    this.entries = new Map([...this.formal, ...extraEntries]);
    this.formal = FORMAL_KEYS.map(key => [key, this.entries.get(key)]);
    this.reads = [];
    this.writes = [];
  }
  getItem(key) { this.reads.push(key); return this.entries.get(key) ?? null; }
  setItem(key, value) { this.writes.push(key); this.entries.set(key, value); }
  assertFormalUntouched() {
    for (const [key, value] of this.formal) assert.equal(this.entries.get(key), value, key);
    assert.ok(this.reads.every(key => !FORMAL_KEYS.includes(key)), 'must not read formal records or preferences');
    assert.ok(this.writes.every(key => !FORMAL_KEYS.includes(key)), 'must not write formal records or preferences');
  }
}

test('same-origin formal records never become the test book; save, restore and clear leave all formal keys untouched', () => {
  const shared = new SharedOriginStorage();
  const empty = storageApi.load(shared);
  assert.deepEqual(empty.state, freshState());
  assert.equal(empty.raw, null);
  const draft = freshState();
  putDiary(draft, { date: '2026-10-14', mood: '轻松', text: '测试版独立记录', joy: '' });
  const saved = storageApi.persist(shared, draft);
  assert.equal(storageApi.load(shared).state.diaries[0].text, '测试版独立记录');
  const backup = JSON.stringify(saved);
  assert.ok(!backup.includes('正式版私密记录哨兵'));
  storageApi.persist(shared, freshState(), { replaceProtected: true });
  assert.deepEqual(storageApi.load(shared).state.diaries, []);
  storageApi.persist(shared, JSON.parse(backup), { replaceProtected: true });
  assert.equal(storageApi.load(shared).state.diaries[0].text, '测试版独立记录');
  shared.assertFormalUntouched();
  assert.deepEqual(new Set(shared.writes), new Set([storageApi.STORAGE_KEY]));
});

test('all state and preference keys are separate and preference initialization ignores formal values', () => {
  assert.equal(aiStateKeys.length, 5);
  assert.equal(new Set(aiStateKeys).size, 5);
  assert.ok(aiStateKeys.every(key => key.startsWith('jizhi-ai-test-') && !FORMAL_KEYS.includes(key)));
  // Exercise the actual startup reads without mounting the rest of the application.
  const initializers = ['backupTime', 'fridgeView'].map(name => {
    const block = appSource.match(new RegExp(`try \\{ ${name} = [^\\n]+?\\} catch \\{\\}`));
    assert.ok(block, `${name} initializer must remain covered`);
    return block[0];
  }).join('\n');
  const shared = new SharedOriginStorage([
    ['jizhi-fridge-view', 'cards'], ['jizhi-runway-daily', '1'], ['jizhi-runway-mode', 'main'],
  ]);
  const context = { storage: shared, backupTime: '', fridgeView: '', runwayDaily: 0, runwayMode: '' };
  vm.runInNewContext(initializers, context);
  assert.equal(context.backupTime, '');
  assert.equal(context.fridgeView, 'list');
  assert.equal(context.runwayDaily, 2);
  assert.equal(context.runwayMode, 'comprehensive');
  shared.entries.set('jizhi-ai-test-last-export', 'test-export');
  shared.entries.set('jizhi-ai-test-fridge-view', 'cards');
  shared.entries.set('jizhi-ai-test-runway-daily', '1');
  shared.entries.set('jizhi-ai-test-runway-mode', 'main');
  vm.runInNewContext(initializers, context);
  assert.equal(context.backupTime, 'test-export');
  assert.equal(context.fridgeView, 'cards');
  assert.equal(context.runwayDaily, 1);
  assert.equal(context.runwayMode, 'main');
  shared.assertFormalUntouched();
  for (const key of FORMAL_KEYS) {
    assert.ok(!appSource.includes(`'${key}'`) && !appSource.includes(`"${key}"`), `app must not use ${key}`);
  }
});

for (const schemaVersion of [1, 2, 3]) {
  test(`schema ${schemaVersion} migration backs up only the test namespace without overwriting prior backups`, () => {
    const legacy = { schemaVersion, inventory: [], meals: [], updatedAt: null };
    if (schemaVersion >= 2) legacy.diaries = [];
    if (schemaVersion >= 3) legacy.dayRecords = [];
    const raw = JSON.stringify(legacy, null, 2);
    const shared = new SharedOriginStorage([[storageApi.STORAGE_KEY, raw]]);
    const loaded = storageApi.load(shared);
    assert.equal(loaded.locked, false);
    assert.equal(shared.entries.get(storageApi.STORAGE_KEY), raw);
    assert.deepEqual(shared.writes, []);
    storageApi.persist(shared, loaded.state);
    const expected = [storageApi.V15_BACKUP_KEY];
    if (schemaVersion <= 2) expected.push(storageApi.V14_BACKUP_KEY);
    if (schemaVersion === 1) expected.push(storageApi.MIGRATION_BACKUP_KEY);
    if (schemaVersion === 2) expected.push(storageApi.V13_BACKUP_KEY);
    for (const key of expected) assert.equal(shared.entries.get(key), raw, key);
    assert.deepEqual(shared.writes, [...expected, storageApi.STORAGE_KEY]);
    storageApi.persist(shared, storageApi.load(shared).state);
    for (const key of expected) assert.equal(shared.entries.get(key), raw, key);
    assert.deepEqual(shared.writes, [...expected, storageApi.STORAGE_KEY, storageApi.STORAGE_KEY]);
    shared.assertFormalUntouched();
  });
}

function workerHarness({ online = true, hit } = {}) {
  const handlers = new Map();
  const deletions = [], fetches = [], opens = [], matches = [];
  const origin = 'https://hujizhigululu-beep.github.io';
  const scope = `${origin}/jizhi-dingshi-ai-test/`;
  const cachedResponse = { source: 'test-index' };
  let claims = 0;
  const context = vm.createContext({
    URL, Request, Response,
    self: { location: { origin }, registration: { scope }, clients: { claim() { claims++; } },
      addEventListener(type, handler) { handlers.set(type, handler); } },
    caches: {
      async keys() { return ['jizhi-meals-shell-v1.5-adaptive-ui-1', 'jizhi-ai-test-shell-old', 'another-app', 'jizhi-ai-test-shell-v1.5-ai-1']; },
      async delete(key) { deletions.push(key); return true; },
      async open(key) { opens.push(key); return { async match(request) {
        matches.push(request);
        if (request === './index.html') return cachedResponse;
        return hit;
      } }; },
    },
    async fetch(request) { fetches.push(request); if (!online) throw new TypeError('offline'); return { source: 'network' }; },
  });
  vm.runInContext(swSource, context, { filename: 'sw.js' });
  return { handlers, context, origin, scope, cachedResponse, deletions, fetches, opens, matches, claims: () => claims };
}

test('test worker activation removes only old test caches and preserves formal and unrelated caches', async () => {
  const harness = workerHarness();
  let activation;
  harness.handlers.get('activate')({ waitUntil(promise) { activation = promise; } });
  await activation;
  assert.deepEqual(harness.deletions, ['jizhi-ai-test-shell-old']);
  assert.equal(harness.claims(), 1);
  const cache = vm.runInContext('CACHE', harness.context);
  assert.ok(cache.startsWith('jizhi-ai-test-shell-'));
  assert.ok(!cache.startsWith('jizhi-meals-shell-'), 'formal worker must not remove test cache later');
  assert.ok(appSource.includes(`const APP_CACHE = '${cache}'`), 'offline status checks the same test cache');
});

test('test worker intercepts only same-origin GET requests inside its own scope', async () => {
  const harness = workerHarness();
  const handler = harness.handlers.get('fetch');
  const excluded = [
    { method: 'POST', url: `${harness.scope}chat/completions`, mode: 'cors' },
    { method: 'POST', url: 'https://www.jiemomo.com/v1/chat/completions', mode: 'cors' },
    { method: 'GET', url: 'https://www.jiemomo.com/v1/models', mode: 'cors' },
    { method: 'GET', url: `${harness.origin}/jizhi-meals/app.js`, mode: 'same-origin' },
    { method: 'GET', url: `${harness.origin}/jizhi-dingshi-ai-test-other/app.js`, mode: 'same-origin' },
    { method: 'GET', url: `${harness.origin}/jizhi-dingshi-ai-test/../jizhi-meals/index.html`, mode: 'navigate' },
    { method: 'HEAD', url: `${harness.scope}index.html`, mode: 'same-origin' },
  ];
  for (const request of excluded) handler({ request, respondWith() { assert.fail(`unexpected interception: ${request.url}`); } });
  assert.deepEqual(harness.opens, []);
  assert.deepEqual(harness.fetches, []);
  const request = { method: 'GET', url: `${harness.scope}app.js`, mode: 'same-origin' };
  let response;
  handler({ request, respondWith(promise) { response = promise; } });
  assert.deepEqual(await response, { source: 'network' });
  assert.deepEqual(harness.fetches, [request]);
});

test('offline navigation falls back to the test index while ordinary cached resources avoid the network', async () => {
  const offline = workerHarness({ online: false });
  let response;
  offline.handlers.get('fetch')({ request: { method: 'GET', url: `${offline.scope}not-found`, mode: 'navigate' }, respondWith(promise) { response = promise; } });
  assert.equal(await response, offline.cachedResponse);
  assert.equal(offline.matches.at(-1), './index.html');
  const cached = { source: 'test-cache' };
  const online = workerHarness({ hit: cached });
  online.handlers.get('fetch')({ request: { method: 'GET', url: `${online.scope}style.css`, mode: 'same-origin' }, respondWith(promise) { response = promise; } });
  assert.equal(await response, cached);
  assert.deepEqual(online.fetches, []);
});

test('every precached asset resolves inside the test project and exists locally', async () => {
  const harness = workerHarness();
  const files = Array.from(vm.runInContext('FILES', harness.context));
  assert.ok(files.includes('./ai-api.js') && files.includes('./ai-lab.js'));
  for (const path of files) {
    const resolved = new URL(path, harness.scope);
    assert.equal(resolved.origin, harness.origin);
    assert.ok(resolved.pathname.startsWith(new URL(harness.scope).pathname), path);
    await access(new URL(path === './' ? '../index.html' : `../${path.slice(2)}`, import.meta.url));
  }
});

test('manifest, HTML and rendered page identities distinguish the AI test app', () => {
  const manifest = JSON.parse(manifestSource);
  assert.equal(manifest.name, APP_NAME);
  assert.equal(manifest.short_name, APP_NAME);
  const testBase = 'https://hujizhigululu-beep.github.io/jizhi-dingshi-ai-test/';
  const formalId = 'https://hujizhigululu-beep.github.io/jizhi-meals/';
  const manifestId = new URL(manifest.id, testBase);
  assert.ok(manifestId.pathname.startsWith(new URL(testBase).pathname));
  assert.notEqual(manifestId.href, formalId);
  assert.equal(new URL(manifest.start_url, testBase).href, testBase);
  assert.equal(new URL(manifest.scope, testBase).href, testBase);
  for (const icon of manifest.icons) assert.ok(new URL(icon.src, testBase).pathname.startsWith(new URL(testBase).pathname));
  assert.match(html, new RegExp(`<title>${APP_NAME}</title>`));
  assert.match(html, new RegExp(`<meta name="apple-mobile-web-app-title" content="${APP_NAME}">`));
  for (const page of ['calendar', 'inventory', 'summary', 'settings']) {
    assert.ok(renderNotebookHeader(page).includes(APP_NAME));
    assert.ok(renderNotebookHeader(page).includes('AI 测试版'));
  }
  assert.ok(renderSettingsView().includes(`${APP_NAME} · V1.5.0-ai.1`));
});
