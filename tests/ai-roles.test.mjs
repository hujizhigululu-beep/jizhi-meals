import test from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalize } from '../model.js';
import { defaultPostOffice, normalizePostOffice, upsertCharacter, copyCharacter, removeCharacter, resetCharacter, setDefaultCharacter, saveUserProfile, saveTaskPrompt, putAIContent, removeAIContent, selectAIContents, composeAIMessages, inventoryText } from '../post-office.js';

const date = '2026-10-14', time = '2026-10-14T03:00:00.000Z';
const content = (type = 'meals', extra = {}) => ({ type, date, characterId: 'saihara', body: '这顿饭像一张温柔的小便签，我已经认真收到了。', generatedAt: time, recordsText: '明确选择的测试记录', recordIds: ['diary:2026-10-14'], ...extra });

test('phase-2 migration preserves edited raw prompts and historical names without inserting character-specific literature', () => {
  const legacy = { version: 1, userPersona: '\n用户原文  ', writingPreset: ' 通用原文\n', letterTask: '任务原文', characters: [{ id: 'saihara', name: '用户改名', persona: '最原原文\n ' }, { id: 'little-tt', name: '小tt', persona: '\n小tt原文' }], letters: [{ id: 'old-letter', date, characterName: '最原终一', body: '完整旧信\n末尾  ', generatedAt: time }] };
  const warnings = [], before = structuredClone(legacy), result = normalizePostOffice(legacy, warnings);
  assert.deepEqual(warnings, []); assert.deepEqual(legacy, before); assert.equal(result.version, 2);
  for (const field of ['userPersona', 'writingPreset', 'letterTask']) assert.equal(result[field], legacy[field]);
  assert.equal(result.characters[0].name, '用户改名'); assert.equal(result.characters[0].persona, legacy.characters[0].persona); assert.equal(result.characters[0].writingPreset, '');
  assert.equal(result.letters[0].characterName, '最原终一'); assert.equal(result.letters[0].characterId, 'legacy'); assert.equal(result.letters[0].body, legacy.letters[0].body);
  assert.deepEqual(normalizePostOffice(result, []).letters, result.letters);
});

test('custom role stable identity, duplication, default invalidation and deletion leave stored snapshots unchanged', () => {
  const state = freshState(), role = upsertCharacter(state, { name: '自定义角色', persona: '独立人设', avatarId: 'avatar-before', writingPreset: '文学预设' });
  setDefaultCharacter(state, role.id); const saved = putAIContent(state, content('letter', { characterId: role.id }));
  const copied = copyCharacter(state, role.id); assert.notEqual(copied.id, role.id); assert.equal(copied.persona, role.persona); assert.equal(copied.builtin, '');
  upsertCharacter(state, { id: role.id, name: '后来改名', avatarId: 'avatar-after', enabled: false });
  assert.equal(state.postOffice.defaultCharacterId, role.id);
  assert.throws(() => composeAIMessages({ config: state.postOffice, type: 'letter', date, recordsText: '记录' }), /停用/);
  assert.equal(removeCharacter(state, role.id), true); assert.equal(state.postOffice.defaultCharacterId, role.id);
  assert.deepEqual(selectAIContents(state, { type: 'letter' }), [saved]); assert.equal(saved.characterName, '自定义角色'); assert.equal(saved.avatarId, 'avatar-before');
  assert.equal(normalize(state).locked, false); assert.throws(() => removeCharacter(state, 'saihara'), /内置/);
});

test('user profile is separate and default reset changes no custom role, history or user prompts', () => {
  const state = freshState(); saveUserProfile(state, { name: '自定用户', avatarId: 'user-image', avatarMode: 'circle', userPersona: '我的长人设\n ' });
  const role = upsertCharacter(state, { name: '独立角色', persona: '独立文本' });
  upsertCharacter(state, { id: 'saihara', name: '修改名称', persona: '修改人设', avatarId: 'role-image', enabled: false });
  const saved = putAIContent(state, content()), userBefore = structuredClone(state.postOffice.user);
  resetCharacter(state, 'saihara'); assert.deepEqual(state.postOffice.characters[0], defaultPostOffice().characters[0]);
  assert.deepEqual(state.postOffice.user, userBefore); assert.equal(state.postOffice.userPersona, '我的长人设\n ');
  assert.equal(state.postOffice.characters.find(row => row.id === role.id).persona, '独立文本'); assert.deepEqual(state.postOffice.comments[0], saved);
  assert.throws(() => resetCharacter(state, role.id), /默认设定/);
});

test('every task combines actual selected persona, chosen literature and exact reviewed records in order', () => {
  const state = freshState(); saveUserProfile(state, { userPersona: ' USER ORIGINAL\n' });
  const first = upsertCharacter(state, { name: '甲', persona: ' CHARACTER A\n', writingPreset: ' LITERATURE A\n' });
  const second = upsertCharacter(state, { name: '乙', persona: ' CHARACTER B\n', writingPreset: '' });
  state.postOffice.writingPreset = ' GENERAL LITERATURE\n';
  for (const type of ['meals', 'exercise', 'study', 'inventory', 'letter']) {
    saveTaskPrompt(state, type, ` TASK ${type}\n`);
    const recordsText = ' 人工修改记录\n尾部  ', messages = composeAIMessages({ config: state.postOffice, characterId: first.id, type, date, recordsText });
    const ordered = [' USER ORIGINAL\n', ' CHARACTER A\n', ' LITERATURE A\n', ` TASK ${type}\n`];
    assert.ok(ordered.every((part, index) => messages[0].content.includes(part) && (!index || messages[0].content.indexOf(part) > messages[0].content.indexOf(ordered[index - 1]))));
    assert.ok(!messages[0].content.includes(second.persona)); assert.ok(!messages[0].content.includes(state.postOffice.writingPreset)); assert.ok(messages[1].content.endsWith(recordsText));
    assert.ok(composeAIMessages({ config: state.postOffice, characterId: second.id, type, date, recordsText })[0].content.includes(state.postOffice.writingPreset));
  }
});

test('inventory snapshot is independent and historical content is never rebuilt from changed stock', () => {
  const state = freshState(); state.inventory = [{ id: 'stock', name: '草莓', quantity: 2, unit: '盒', note: '库存备注', expires: '2026-10-20' }];
  Object.defineProperty(state, 'diaries', { get() { assert.fail('diaries must not be read'); } });
  const snapshot = inventoryText(state), saved = putAIContent(state, content('inventory', { snapshotId: 'stock-snapshot-1', recordsText: snapshot, recordIds: ['stock'] }));
  state.inventory[0].quantity = 0; state.inventory[0].name = '牛奶';
  assert.equal(selectAIContents(state, { type: 'inventory', snapshotId: 'stock-snapshot-1' })[0].recordsText, snapshot);
  assert.ok(saved.recordsText.includes('草莓：2 盒')); assert.equal(removeAIContent(state, saved.id, 'meals'), false); assert.equal(removeAIContent(state, saved.id, 'inventory'), true);
});

test('role/user/content references and unknown credential fields fail atomically', () => {
  const state = freshState(), before = structuredClone(state);
  for (const input of [{ name: 'x', avatarId: 'https://example.com/a.png' }, { name: 'x', builtin: 'saihara' }, { name: 'x', apiKey: 'synthetic-invalid-marker' }]) assert.throws(() => upsertCharacter(state, input));
  assert.throws(() => saveUserProfile(state, { name: 'x', apiKey: 'synthetic-invalid-marker' }));
  assert.throws(() => putAIContent(state, content('inventory', { snapshotId: '' })));
  assert.throws(() => putAIContent(state, content('meals', { avatarId: 'data:image/png;base64,AAAA' })));
  assert.deepEqual(state, before);
});

test('JSON round trip includes profiles, prompts and five kinds of saved content with IDs but no credentials', () => {
  const state = freshState(); saveUserProfile(state, { name: '测试用户', avatarId: 'test-user-avatar', userPersona: '用户人设' });
  for (const type of ['meals', 'exercise', 'study', 'inventory', 'letter']) putAIContent(state, content(type, { snapshotId: type === 'inventory' ? 'inventory-snapshot' : '' }));
  const json = JSON.stringify(state), restored = normalize(JSON.parse(json));
  assert.equal(restored.locked, false); assert.deepEqual(restored.state, state); assert.ok(!/apiKey|authorization/i.test(json));
  const detached = selectAIContents(state); detached[0].recordIds.push('caller-edit'); assert.equal(state.postOffice.comments.some(row => row.recordIds.includes('caller-edit')), false);
  assert.equal(selectAIContents({ ...state, _readOnly: true }).length, 5);
});
