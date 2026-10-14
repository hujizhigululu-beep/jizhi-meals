import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalize, putDiary, putMeal } from '../model.js';
import { load, persist, STORAGE_KEY, AI_PHASE2_BACKUP_KEY } from '../storage.js';
import { defaultPostOffice, normalizePostOffice, savePostOfficeField, resetPostOfficeField, putSavedLetter, removeSavedLetter, selectedDayText, composeLetterMessages, POST_OFFICE_FIELD_LIMIT, POST_OFFICE_TOTAL_LIMIT } from '../post-office.js';

const DATE = '2026-10-14';
const TIME = '2026-10-14T03:00:00.000Z';
class MemoryStorage {
  constructor(raw = null) { this.entries = new Map(raw === null ? [] : [[STORAGE_KEY, raw]]); this.writes = []; this.failKey = null; }
  getItem(key) { return this.entries.get(key) ?? null; }
  setItem(key, value) { if (key === this.failKey) throw new Error('quota'); this.entries.set(key, value); this.writes.push(key); }
}
function letter(overrides = {}) { return { id: 'first-letter', date: DATE, characterName: '最原终一', body: '亲爱的你：\n\n今天辛苦了。\n最原终一', generatedAt: TIME, ...overrides }; }
function records() {
  const state = freshState();
  state.inventory.push({ id: 'private-stock', name: '库存隐私哨兵', quantity: 9, perMeal: 1, unit: '份', note: '库存隐藏备注', expires: '' });
  putDiary(state, { date: DATE, mood: '安心', text: '当天日记哨兵\n保留换行。', joy: '收到草莓牛奶' });
  putDiary(state, { date: '2026-10-13', mood: '秘密', text: '其他日期隐私哨兵', joy: '昨日小确幸' });
  putMeal(state, { id: 'lunch', date: DATE, slot: 'lunch', name: '餐食哨兵', type: '自制便当', protein: '鸡蛋', note: '好吃', resources: [{ ingredientId: 'private-stock', amount: 1 }] });
  putMeal(state, { id: 'yesterday', date: '2026-10-13', slot: 'dinner', name: '昨日餐食隐私哨兵', type: '其他', resources: [] });
  state.dayRecords.push({ date: DATE, exercise: { checked: false, items: [{ id: 'walk', content: '运动详情哨兵', minutes: 20, note: '散步备注', distanceKm: 1.5 }], categoryIds: [], manualChecked: false }, study: { checked: true, items: [{ id: 'study', content: '学习详情哨兵', minutes: 30, note: '学习备注' }], categoryIds: [], manualChecked: true }, stickerIds: [] });
  state.dayRecords.push({ date: '2026-10-13', exercise: { checked: true, items: [{ id: 'old', content: '昨日运动隐私哨兵', minutes: 50, note: '' }], categoryIds: [], manualChecked: true }, study: { checked: false, items: [], categoryIds: [], manualChecked: false }, stickerIds: [] });
  return state;
}

test('default settings are independent copies with editable short examples and no credential field', () => {
  const first = defaultPostOffice(), second = defaultPostOffice();
  assert.equal(first.userPersona, '');
  assert.deepEqual(first.characters.map(row => [row.id, row.name]), [['saihara', '最原终一'], ['little-tt', '小tt']]);
  first.characters[0].persona = '我的角色';
  first.letters.push(letter());
  assert.notEqual(second.characters[0].persona, first.characters[0].persona);
  assert.deepEqual(second.letters, []);
  assert.ok(!JSON.stringify(second).match(/apiKey|authorization/i));
});

for (const schemaVersion of [1, 2, 3, 4]) {
  test(`historical schema ${schemaVersion} backups missing postOffice upgrade without losing records or locking`, () => {
    const original = { schemaVersion, inventory: [], meals: [], updatedAt: null };
    if (schemaVersion >= 2) original.diaries = [];
    if (schemaVersion >= 3) original.dayRecords = [];
    if (schemaVersion === 4) Object.assign(original, { mealTemplates: [], activityCategories: freshState().activityCategories, recentStickerIds: [] });
    const before = structuredClone(original);
    const result = normalize(original);
    assert.equal(result.locked, false);
    assert.deepEqual(result.state.postOffice, defaultPostOffice());
    assert.deepEqual(original, before);
    assert.equal(normalize(result.state).locked, false);
  });
}

test('four settings save separately and both character presets survive changing the other', () => {
  const state = freshState();
  savePostOfficeField(state, 'userPersona', '\n user original \n');
  savePostOfficeField(state, 'characterPersona', '最原原文', 'saihara');
  savePostOfficeField(state, 'characterPersona', 'tt原文', 'little-tt');
  savePostOfficeField(state, 'writingPreset', '\n写作原文  ');
  savePostOfficeField(state, 'letterTask', '任务原文\n');
  assert.equal(state.postOffice.userPersona, '\n user original \n');
  assert.equal(state.postOffice.characters[0].persona, '最原原文');
  assert.equal(state.postOffice.characters[1].persona, 'tt原文');
  assert.equal(state.postOffice.writingPreset, '\n写作原文  ');
  assert.equal(state.postOffice.letterTask, '任务原文\n');
  const before = structuredClone(state.postOffice);
  resetPostOfficeField(state, 'writingPreset');
  assert.equal(state.postOffice.writingPreset, defaultPostOffice().writingPreset);
  assert.equal(state.postOffice.userPersona, before.userPersona);
  assert.deepEqual(state.postOffice.characters, before.characters);
  assert.equal(state.postOffice.letterTask, before.letterTask);
  resetPostOfficeField(state, 'characterPersona', 'saihara');
  assert.equal(state.postOffice.characters[1].persona, 'tt原文');
});

test('300000-character long presets retain every character through save, normalize, JSON restore and message composition', () => {
  const state = freshState();
  const long = '\n首\n' + '长预设 abc<>\n'.repeat(29999) + '  尾原文  ';
  assert.equal(long.length, POST_OFFICE_FIELD_LIMIT);
  savePostOfficeField(state, 'userPersona', long);
  savePostOfficeField(state, 'characterPersona', long, 'saihara');
  savePostOfficeField(state, 'writingPreset', long);
  savePostOfficeField(state, 'letterTask', long);
  const restored = normalize(JSON.parse(JSON.stringify(state)));
  assert.equal(restored.locked, false);
  for (const field of ['userPersona', 'writingPreset', 'letterTask']) assert.equal(restored.state.postOffice[field], long);
  assert.equal(restored.state.postOffice.characters[0].persona, long);
  const messages = composeLetterMessages({ config: restored.state.postOffice, characterId: 'saihara', date: DATE, recordsText: '当天记录' });
  assert.equal(messages[0].content.split(long).length - 1, 4);
});

test('field and total capacity errors leave all data untouched instead of truncating', () => {
  const state = freshState();
  const before = structuredClone(state);
  assert.throws(() => savePostOfficeField(state, 'userPersona', '文'.repeat(POST_OFFICE_FIELD_LIMIT + 1)), /300000/);
  assert.deepEqual(state, before);
  for (const field of ['userPersona', 'writingPreset', 'letterTask']) savePostOfficeField(state, field, '字'.repeat(299000));
  savePostOfficeField(state, 'characterPersona', '字'.repeat(299000), 'saihara');
  savePostOfficeField(state, 'characterPersona', '字'.repeat(299000), 'little-tt');
  assert.ok(POST_OFFICE_TOTAL_LIMIT < 1501000);
  const atCapacity = structuredClone(state);
  assert.throws(() => putSavedLetter(state, letter({ body: '信'.repeat(6000) })), /1500000/);
  assert.deepEqual(state, atCapacity);
});

test('unsupported fields and unknown characters cannot alter prompts or save credentials', () => {
  const state = freshState();
  const before = structuredClone(state);
  assert.throws(() => savePostOfficeField(state, 'apiKey', 'synthetic-test-value'));
  assert.throws(() => savePostOfficeField(state, 'characterPersona', '角色', 'unknown'));
  assert.throws(() => resetPostOfficeField(state, 'apiKey'));
  assert.deepEqual(state, before);
});

for (const corrupt of [
  config => { config.apiKey = 'synthetic-only-sentinel'; },
  config => { config.characters[0].apiKey = 'synthetic-only-sentinel'; },
  config => { config.letters = [letter({ apiKey: 'synthetic-only-sentinel' })]; },
  config => { config.userPersona = 'x'.repeat(POST_OFFICE_FIELD_LIMIT + 1); },
  config => { config.characters[0].persona = 12; },
  config => { config.characters[1].id = 'saihara'; },
  config => { config.version = 99; },
  config => { config.letters = [letter(), letter()]; },
  config => { config.letters = [letter({ generatedAt: '2026-02-30T01:00:00Z' })]; },
]) {
  test(`corrupt post office remains protected in its original storage: ${corrupt.toString().slice(10, 65)}`, () => {
    const state = freshState(); corrupt(state.postOffice);
    const raw = JSON.stringify(state);
    const storage = new MemoryStorage(raw);
    const loaded = load(storage);
    assert.equal(loaded.locked, true);
    assert.equal(loaded.raw, raw);
    assert.equal(storage.getItem(STORAGE_KEY), raw);
    assert.throws(() => persist(storage, loaded.state));
    assert.throws(() => persist(storage, state));
    assert.throws(() => savePostOfficeField(loaded.state, 'userPersona', '新内容'), error => error.code === 'PROTECTED_DATA');
    assert.deepEqual(storage.writes, []);
    assert.ok(loaded.warnings.every(warning => !warning.includes('synthetic-only-sentinel')));
  });
}

test('null postOffice is invalid; absent postOffice is the only historical default case', () => {
  const warnings = [];
  normalizePostOffice(null, warnings);
  assert.ok(warnings.length);
  const cleanWarnings = [];
  normalizePostOffice(undefined, cleanWarnings);
  assert.deepEqual(cleanWarnings, []);
});

test('saved letters are explicit, independently deletable, and never change original life records', () => {
  const state = records();
  const original = structuredClone({ inventory: state.inventory, meals: state.meals, diaries: state.diaries, dayRecords: state.dayRecords });
  assert.deepEqual(state.postOffice.letters, []);
  const saved = putSavedLetter(state, letter());
  assert.equal(state.postOffice.letters[0].body, letter().body);
  saved.body = '调用者改变';
  assert.equal(state.postOffice.letters[0].body, letter().body);
  const beforeDuplicate = structuredClone(state);
  assert.throws(() => putSavedLetter(state, letter()), /已收藏/);
  assert.deepEqual(state, beforeDuplicate);
  putSavedLetter(state, letter({ id: 'second', characterName: '小tt' }));
  assert.equal(removeSavedLetter(state, 'first-letter'), true);
  assert.equal(removeSavedLetter(state, 'missing'), false);
  assert.deepEqual(state.postOffice.letters.map(row => row.id), ['second']);
  assert.deepEqual({ inventory: state.inventory, meals: state.meals, diaries: state.diaries, dayRecords: state.dayRecords }, original);
});

test('optional generated id/time are validated and backup round trips include prompts and letters', () => {
  const state = records();
  savePostOfficeField(state, 'userPersona', '自定用户');
  const saved = putSavedLetter(state, { date: DATE, characterName: '小tt', body: '完整信件\n  保留空格 ' });
  assert.ok(saved.id);
  assert.ok(Number.isFinite(Date.parse(saved.generatedAt)));
  const storage = new MemoryStorage();
  const persisted = persist(storage, state);
  const exported = JSON.stringify(persisted, null, 2);
  assert.ok(!/apiKey|authorization/i.test(exported));
  const imported = normalize(JSON.parse(exported));
  assert.equal(imported.locked, false);
  assert.deepEqual(imported.state, persisted);
  assert.equal(imported.state.postOffice.letters[0].body, '完整信件\n  保留空格 ');
});

test('schema4 first-phase original JSON is backed up exactly once before a postOffice write', () => {
  const original = records(); delete original.postOffice;
  const raw = JSON.stringify(original, null, 2);
  const storage = new MemoryStorage(raw);
  const loaded = load(storage);
  assert.equal(loaded.locked, false);
  assert.deepEqual(storage.writes, []);
  persist(storage, loaded.state);
  assert.equal(storage.getItem(AI_PHASE2_BACKUP_KEY), raw);
  assert.deepEqual(storage.writes, [AI_PHASE2_BACKUP_KEY, STORAGE_KEY]);
  persist(storage, load(storage).state);
  assert.equal(storage.getItem(AI_PHASE2_BACKUP_KEY), raw);
  assert.deepEqual(storage.writes, [AI_PHASE2_BACKUP_KEY, STORAGE_KEY, STORAGE_KEY]);
});

test('failing phase2 upgrade backup preserves original book and leaves in-memory caller untouched', () => {
  const original = records(); delete original.postOffice;
  const raw = JSON.stringify(original);
  const storage = new MemoryStorage(raw); storage.failKey = AI_PHASE2_BACKUP_KEY;
  const state = load(storage).state, before = structuredClone(state);
  assert.throws(() => persist(storage, state), /升级前/);
  assert.equal(storage.getItem(STORAGE_KEY), raw);
  assert.deepEqual(state, before);
  assert.deepEqual(storage.writes, []);
});

test('only the selected date and selected categories enter the editable day text', () => {
  const state = records();
  assert.equal(selectedDayText(state, DATE, {}), '');
  for (const kind of ['diary', 'meals', 'exercise', 'study']) {
    const text = selectedDayText(state, DATE, { [kind]: true });
    assert.ok(text.includes({ diary: '当天日记哨兵', meals: '餐食哨兵', exercise: '运动详情哨兵', study: '学习详情哨兵' }[kind]));
    for (const other of ['diary', 'meals', 'exercise', 'study'].filter(value => value !== kind)) assert.ok(!text.includes({ diary: '当天日记哨兵', meals: '餐食哨兵', exercise: '运动详情哨兵', study: '学习详情哨兵' }[other]));
    assert.ok(!text.includes('其他日期隐私哨兵'));
    assert.ok(!text.includes('昨日餐食隐私哨兵'));
    assert.ok(!text.includes('昨日运动隐私哨兵'));
    assert.ok(!text.includes('库存隐私哨兵'));
    assert.ok(!text.includes('库存隐藏备注'));
  }
  assert.throws(() => selectedDayText(state, '2026-02-30', { diary: true }));
});

test('unselected properties are never read; disabled activity details and planned meals keep truthful status', () => {
  const onlyDiary = { diaries: [{ date: DATE, text: '日记' }] };
  for (const key of ['meals', 'dayRecords', 'inventory', 'postOffice']) Object.defineProperty(onlyDiary, key, { get() { assert.fail(`private ${key} was read`); } });
  assert.match(selectedDayText(onlyDiary, DATE, { diary: true }), /日记/);
  const state = records();
  const text = selectedDayText(state, DATE, { meals: true, exercise: true, study: true });
  assert.match(text, /未打卡/);
  assert.match(text, /运动详情哨兵/);
  assert.match(text, /时长 20 分钟/);
  assert.match(text, /距离 1.5 公里/);
  assert.match(text, /计划，未标记已吃/);
  assert.match(text, /学习】\n打卡状态：已打卡/);
});

test('composed natural-language messages keep configuration order and exact reviewed record text', () => {
  const config = defaultPostOffice();
  config.userPersona = ' USER\n'; config.characters[0].persona = ' CHARACTER\n'; config.writingPreset = ' WRITE\n'; config.letterTask = ' TASK\n';
  const recordsText = ' 用户手动修改\n及补充，完全保留。 ';
  const messages = composeLetterMessages({ config, characterId: 'saihara', date: DATE, recordsText, lengthHint: '约800字' });
  assert.deepEqual(messages.map(row => row.role), ['system', 'user']);
  const system = messages[0].content;
  const ordered = [' USER\n', ' CHARACTER\n', ' WRITE\n', ' TASK\n', '约800字'];
  assert.ok(ordered.every((text, index) => system.includes(text) && (index === 0 || system.indexOf(text) > system.indexOf(ordered[index - 1]))));
  assert.ok(messages[1].content.endsWith(recordsText));
  assert.ok(!system.includes(config.characters[1].persona));
  assert.throws(() => composeLetterMessages({ config, characterId: 'saihara', date: DATE, recordsText: '' }), /预览/);
  assert.throws(() => composeLetterMessages({ config, characterId: 'unknown', date: DATE, recordsText }), /角色/);
});
