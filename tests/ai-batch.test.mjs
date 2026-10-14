import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, putDiary, putMeal } from '../model.js';
import { defaultPostOffice, POST_OFFICE_FIELD_LIMIT } from '../post-office.js';
import { batchRecordsText, composeBatchAIMessages, parseBatchAIResponse } from '../ai-batch.js';

const DATE = '2026-10-14';
const TYPES = ['meals', 'exercise', 'study', 'inventory', 'letter'];
const options = (extra = {}) => ({ config: defaultPostOffice(), date: DATE, types: TYPES, recordsText: '本次记录原文\n  保留空白  ', ...extra });
const count = (source, token) => source.split(token).length - 1;

test('all five outputs share personas and chosen long preset exactly once in one message pair', () => {
  const config = defaultPostOffice();
  config.userPersona = '用户独有人设\n' + '人设长文本。'.repeat(4000);
  config.characters[0].persona = '角色独有人设\n' + '角色长文本。'.repeat(4000);
  config.characters[0].writingPreset = '角色独有写作预设\n' + '写作长文本。'.repeat(4000);
  config.writingPreset = '未选择的通用写作预设';
  config.letterTask = '独有长信任务';
  for (const type of TYPES.filter(type => type !== 'letter')) config.tasks[type] = '独有任务-' + type;
  const before = structuredClone(config);
  const messages = composeBatchAIMessages(options({ config, shortLengthHint: '短评独有篇幅', letterLengthHint: '回信独有篇幅' }));
  assert.deepEqual(messages.map(row => row.role), ['system', 'user']);
  const full = messages.map(row => row.content).join('\n');
  for (const text of [config.userPersona, config.characters[0].persona, config.characters[0].writingPreset, config.letterTask, ...Object.values(config.tasks), '短评独有篇幅', '回信独有篇幅']) assert.equal(count(full, text), 1);
  assert.ok(!full.includes(config.writingPreset));
  assert.ok(!full.includes(config.characters[1].persona));
  assert.ok(!messages[0].content.includes('本次记录原文'));
  assert.equal(count(messages[1].content, '本次记录原文\n  保留空白  '), 1);
  assert.match(messages[0].content, /一个有效 JSON 对象/);
  assert.deepEqual(config, before);
});

test('only selected tasks and relevant length hints enter prompts, with preset fallback', () => {
  const config = defaultPostOffice();
  config.characters[0].writingPreset = ' \n ';
  config.writingPreset = '通用写作哨兵';
  config.letterTask = '未选回信隐私哨兵';
  for (const type of TYPES.filter(type => type !== 'letter')) config.tasks[type] = `${type}任务隐私哨兵`;
  const messages = composeBatchAIMessages(options({ config, types: ['study'], shortLengthHint: '短评篇幅哨兵', letterLengthHint: '未选回信篇幅哨兵' }));
  const system = messages[0].content;
  assert.equal(count(system, config.writingPreset), 1);
  assert.equal(count(system, config.tasks.study), 1);
  assert.ok(system.includes('短评篇幅哨兵'));
  for (const text of [config.letterTask, config.tasks.meals, config.tasks.exercise, config.tasks.inventory, '未选回信篇幅哨兵']) assert.ok(!system.includes(text));
  const letterOnly = composeBatchAIMessages(options({ config, types: ['letter'], shortLengthHint: '未选短评篇幅哨兵', letterLengthHint: '回信篇幅哨兵' }))[0].content;
  assert.ok(letterOnly.includes('回信篇幅哨兵'));
  assert.ok(!letterOnly.includes('未选短评篇幅哨兵'));
  for (const task of Object.values(config.tasks)) assert.ok(!letterOnly.includes(task));
});

test('batch validation rejects unsupported, empty or duplicate selections and protected config', () => {
  for (const types of [[], ['other'], ['meals', 'meals'], 'meals', null, undefined, [null], Array(1)]) {
    assert.throws(() => composeBatchAIMessages(options({ types })), /勾选/);
    assert.throws(() => parseBatchAIResponse('{}', types), /勾选/);
  }
  for (const corrupt of [config => { config.apiKey = 'must-never-send'; }, config => { config.characters[0].persona = 12; }, config => { config.tasks.meals = 'x'.repeat(POST_OFFICE_FIELD_LIMIT + 1); }]) {
    const config = defaultPostOffice(); corrupt(config);
    assert.throws(() => composeBatchAIMessages(options({ config })), error => error.code === 'PROTECTED_DATA');
  }
  for (const config of [null, [], 'config', undefined]) assert.throws(() => composeBatchAIMessages(options({ config })), /预设异常/);
});

test('role, dates, records and length validation never silently changes or trims prompts', () => {
  const config = defaultPostOffice(); config.characters[0].enabled = false;
  assert.throws(() => composeBatchAIMessages(options({ config })), /角色/);
  assert.throws(() => composeBatchAIMessages(options({ characterId: 'unknown' })), /角色/);
  const customDefault = defaultPostOffice(); customDefault.defaultCharacterId = 'little-tt';
  assert.ok(composeBatchAIMessages(options({ config: customDefault }))[0].content.includes(customDefault.characters[1].persona));
  assert.ok(composeBatchAIMessages(options({ config: customDefault, characterId: 'saihara' }))[0].content.includes(customDefault.characters[0].persona));
  for (const date of ['', '2026-02-30', '2026-13-01', '0000-01-01', null]) assert.throws(() => composeBatchAIMessages(options({ date })), /日期/);
  assert.doesNotThrow(() => composeBatchAIMessages(options({ types: ['inventory'], date: '' })));
  assert.throws(() => composeBatchAIMessages(options({ types: ['inventory'], date: 'wrong' })), /日期/);
  for (const recordsText of ['', ' \n ', null, 'x'.repeat(POST_OFFICE_FIELD_LIMIT + 1)]) assert.throws(() => composeBatchAIMessages(options({ recordsText })), /300000/);
  const recordsText = 'x'.repeat(POST_OFFICE_FIELD_LIMIT);
  assert.ok(composeBatchAIMessages(options({ recordsText }))[1].content.endsWith(recordsText));
  for (const field of ['shortLengthHint', 'letterLengthHint']) {
    assert.throws(() => composeBatchAIMessages(options({ [field]: 'x'.repeat(501) })), /500/);
    assert.throws(() => composeBatchAIMessages(options({ [field]: null })), /500/);
    assert.doesNotThrow(() => composeBatchAIMessages(options({ [field]: 'x'.repeat(500) })));
  }
});

function records() {
  const state = freshState();
  putDiary(state, { date: DATE, mood: '当天心情', text: '当天日记哨兵\n日记换行', joy: '当天小确幸' });
  putDiary(state, { date: '2026-10-13', mood: '秘密', text: '其他日期日记哨兵', joy: '' });
  putMeal(state, { id: 'meal', date: DATE, slot: 'lunch', name: '当天餐食哨兵', type: '自制便当', protein: '蛋', note: '餐食备注', resources: [] });
  putMeal(state, { id: 'other', date: '2026-10-13', slot: 'lunch', name: '其他日期餐食哨兵', type: '其他', resources: [] });
  state.dayRecords.push({ date: DATE, exercise: { checked: true, items: [{ id: 'walk', content: '当天运动哨兵', minutes: 20, distanceKm: 2, note: '运动备注' }], categoryIds: [] }, study: { checked: false, items: [{ id: 'study', content: '当天学习哨兵', minutes: 30, note: '学习备注' }], categoryIds: [] } });
  state.dayRecords.push({ date: '2026-10-13', exercise: { items: [{ content: '其他日期运动哨兵' }] }, study: { items: [{ content: '其他日期学习哨兵' }] } });
  state.inventory.push({ id: 'stock', name: '库存哨兵', quantity: 2, unit: '个', note: '库存备注', expires: '' });
  return state;
}

test('selected day and current inventory are included once, with source text preserved', () => {
  const state = records(), before = structuredClone(state);
  const text = batchRecordsText(state, DATE, { diary: true, meals: true, exercise: true, study: true, inventory: true });
  for (const sentinel of ['当天日记哨兵\n日记换行', '当天餐食哨兵', '当天运动哨兵', '当天学习哨兵', '库存哨兵']) assert.equal(count(text, sentinel), 1);
  for (const sentinel of ['其他日期日记哨兵', '其他日期餐食哨兵', '其他日期运动哨兵', '其他日期学习哨兵']) assert.ok(!text.includes(sentinel));
  assert.equal(count(text, '【当前食材库存快照】'), 1);
  assert.equal(count(text, '生活记录日期：'), 1);
  assert.deepEqual(state, before);
});

test('unselected records are never read, including the other activity or inventory', () => {
  const fail = () => { throw new Error('private category was read'); };
  const state = records();
  for (const key of ['diaries', 'meals', 'inventory']) Object.defineProperty(state, key, { get: fail });
  Object.defineProperty(state.dayRecords[0], 'study', { get: fail });
  const text = batchRecordsText(state, DATE, { exercise: true, diary: false, study: false, meals: false, inventory: false });
  assert.ok(text.includes('当天运动哨兵'));
  const inventoryOnly = records();
  for (const key of ['diaries', 'meals', 'dayRecords', 'activityCategories']) Object.defineProperty(inventoryOnly, key, { get: fail });
  assert.ok(batchRecordsText(inventoryOnly, DATE, { inventory: true }).includes('库存哨兵'));
  const empty = {};
  for (const key of ['diaries', 'meals', 'dayRecords', 'inventory', 'activityCategories']) Object.defineProperty(empty, key, { get: fail });
  assert.equal(batchRecordsText(empty, DATE, {}), '');
  assert.equal(batchRecordsText(empty, DATE, Object.create({ diary: true, inventory: true })), '');
});

test('invalid records selection and invalid dates are rejected', () => {
  for (const selection of [{ diary: 'true' }, { inventory: 1 }, { private: true }, { letter: true }, null, []]) assert.throws(() => batchRecordsText(records(), DATE, selection), /类别/);
  assert.throws(() => batchRecordsText(records(), '2026-02-30', { inventory: true }), /日期/);
  assert.throws(() => batchRecordsText(null, DATE, {}), /格式/);
});

test('complete JSON and one surrounding fence preserve exact long strings and requested order', () => {
  const letter = '\n 首行 \n' + '正文\n"引号"\\路径💌'.repeat(5000) + '\n 尾行  ';
  assert.ok(letter.length > 12000);
  const body = { inventory: '  库存 \n ', meals: '  餐食\n正文  ', letter, study: '未选学习', unexpected: '额外字段' };
  for (const text of [JSON.stringify(body), ' \n```json\r\n' + JSON.stringify(body) + '\r\n```\n ', '```JSON\n' + JSON.stringify(body) + '\n```']) {
    assert.deepEqual(parseBatchAIResponse(text, ['letter', 'meals', 'inventory']), {
      items: [{ type: 'letter', body: letter }, { type: 'meals', body: body.meals }, { type: 'inventory', body: body.inventory }], missingTypes: [], rawText: text,
    });
  }
});

test('missing, whitespace-only or non-string fields return valid parts without invented bodies', () => {
  const body = { meals: '\n 有效餐食  ', exercise: ' \n\t', study: 12, inventory: { text: '不能猜出正文' } };
  const text = JSON.stringify(body);
  assert.deepEqual(parseBatchAIResponse(text, TYPES), { items: [{ type: 'meals', body: body.meals }], missingTypes: ['exercise', 'study', 'inventory', 'letter'], rawText: text });
  for (const field of [null, false, [], {}, 0]) assert.deepEqual(parseBatchAIResponse(JSON.stringify({ letter: field }), ['letter']).missingTypes, ['letter']);
});

test('malformed or truncated JSON retains only syntactically complete root members', () => {
  const meals = ' \n 完整正文"带引号"\\尾巴  ';
  const prefix = '{"meals":' + JSON.stringify(meals);
  for (const text of [prefix, prefix + ',"letter":"尚未闭合', prefix + ',"exercise":null,"letter":"断在\\', prefix + ', BAD', prefix + ',}']) {
    const result = parseBatchAIResponse(text, ['meals', 'exercise', 'letter']);
    assert.deepEqual(result.items, [{ type: 'meals', body: meals }]);
    assert.deepEqual(result.missingTypes, ['exercise', 'letter']);
    assert.equal(result.rawText, text);
  }
  const nested = prefix + ',"exercise":{"nested":"未选内容"},"study":"完整学习","letter":"未闭合';
  assert.deepEqual(parseBatchAIResponse(nested, ['meals', 'study']).items, [{ type: 'meals', body: meals }, { type: 'study', body: '完整学习' }]);
  for (const text of ['这是正文', '解释 {"meals":"不能从散文中猜出"}', '{"letter":"invalid\\q"}', '```json\n{}\n```\n```json\n{}\n```', '[{"meals":"数组不接受"}]', 'null', '"正文"', '{"meals":"有效"}额外说明', undefined, null, 12]) {
    assert.deepEqual(parseBatchAIResponse(text, ['meals', 'letter']), { items: [], missingTypes: ['meals', 'letter'], rawText: text });
  }
});

test('protocol helpers remain local and never make recovery or automatic retry requests', () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = () => { calls++; throw new Error('unexpected request'); };
  try {
    const text = batchRecordsText(records(), DATE, { diary: true, inventory: true });
    composeBatchAIMessages(options({ recordsText: text }));
    parseBatchAIResponse('{"meals":"已完成","letter":"未完成', TYPES);
    parseBatchAIResponse('malformed', TYPES);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
