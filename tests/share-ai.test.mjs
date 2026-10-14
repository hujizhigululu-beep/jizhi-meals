import test from 'node:test';
import assert from 'node:assert/strict';
import { listShareAIContent, selectShareAIContent, planAIShareAppendix, appendAIShareCard } from '../share-ai.js';
import { normalizeJournalShareOptions, prepareJournalShare } from '../share-journal.js';

const entry = (id, type, date = '2026-10-14') => ({ id, type, date, characterId: 'saihara', characterName: '生成时角色', avatarId: 'saved-avatar', avatarMode: 'sticker', avatarFallback: 'magnifier', body: `${id} 的已保存正文`, generatedAt: '2026-10-14T05:00:00.000Z', recordsText: '不可直接分享的记录快照', recordIds: ['private-record'], persona: '不可分享的人设' });
const fixture = () => ({ postOffice: { comments: [entry('meal', 'meals'), entry('exercise', 'exercise'), entry('study', 'study'), entry('inventory', 'inventory'), entry('old', 'meals', '2026-10-13')], letters: [entry('letter', 'letter')] } });
const settings = { start: '2026-10-14', end: '2026-10-14', kind: 'life' };

test('AI sharing defaults to excluded even if saved replies exist', () => {
  const book = fixture();
  assert.deepEqual(selectShareAIContent(book, settings), []);
  assert.deepEqual(normalizeJournalShareOptions({ date: '2026-10-14' }).aiIds, []);
  assert.doesNotMatch(JSON.stringify(prepareJournalShare(book, { date: '2026-10-14' })), /已保存正文|不可分享的人设|记录快照/);
});

test('candidates follow date and type bounds without prompting or changing data', () => {
  const book = fixture(), before = JSON.stringify(book);
  assert.deepEqual(listShareAIContent(book, settings).map(item => item.id), ['exercise', 'letter', 'meal', 'study']);
  assert.deepEqual(listShareAIContent(book, { ...settings, kind: 'meal' }).map(item => item.id), ['meal']);
  assert.deepEqual(listShareAIContent(book, { ...settings, kind: 'exercise' }).map(item => item.id), ['exercise']);
  assert.deepEqual(listShareAIContent(book, { ...settings, kind: 'study' }).map(item => item.id), ['study']);
  assert.equal(JSON.stringify(book), before);
});

test('explicit inventory context shares saved snapshot body rather than current stock', () => {
  const book = fixture(); book.inventory = [{ name: '新的库存不能代替已保存快照', quantity: 4 }];
  assert.equal(listShareAIContent(book, settings).some(item => item.type === 'inventory'), false);
  const selected = selectShareAIContent(book, { ...settings, inventoryAI: true, aiIds: ['inventory'] });
  assert.equal(selected.length, 1); assert.equal(selected[0].body, 'inventory 的已保存正文');
  assert.doesNotMatch(JSON.stringify(selected), /新的库存|不可直接分享|private-record|不可分享的人设/);
  assert.equal(selectShareAIContent(book, { ...settings, kind: 'meal', inventoryAI: true, aiIds: ['inventory'] }).length, 0);
});

test('unselected, irrelevant and unknown IDs never reach the renderer', () => {
  const book = fixture();
  assert.deepEqual(selectShareAIContent(book, { ...settings, kind: 'study', aiIds: ['study', 'old', 'letter', 'unknown'] }).map(item => item.id), ['study']);
  const result = selectShareAIContent(book, { ...settings, aiIds: ['letter'] })[0];
  assert.equal(result.characterName, '生成时角色'); assert.equal(result.avatarId, 'saved-avatar');
  assert.doesNotMatch(JSON.stringify(result), /persona|recordsText|recordIds|不可/);
});

test('legacy letters remain selectable with their original role name and complete body', () => {
  const book = { postOffice: { letters: [{ id: 'legacy', date: '2026-10-14', characterName: '旧来信署名', body: '正文\n第二行 👩‍🎨', generatedAt: '2026-10-14T05:00:00.000Z' }] } };
  const result = selectShareAIContent(book, { ...settings, aiIds: ['legacy'] });
  assert.equal(result[0].body, '正文\n第二行 👩‍🎨'); assert.equal(result[0].characterName, '旧来信署名');
});

test('measured appendix retains every line of long letters and full role names', () => {
  const context = { measureText(value) { return { width: [...value].length * 10 }; } };
  const original = entry('long', 'letter'); original.body = '完整的长信👩‍🎨\n'.repeat(100) + '【末尾必须可见】'; original.characterName = '非常长的角色显示名称'.repeat(8);
  const plan = planAIShareAppendix(context, [original], 600);
  assert.equal(plan.rows[0].lines.at(-1), '【末尾必须可见】');
  assert.equal(plan.rows[0].lines.join('').replace(/\n/g, ''), original.body.replace(/\n/g, ''));
  assert.equal(plan.rows[0].titleLines.join(''), `${original.characterName} · 日记回信`);
  assert.ok(plan.height > 3000); assert.equal(original.body.endsWith('【末尾必须可见】'), true);
});

test('without selected AI the original card object is returned untouched', async () => {
  const card = { blob: {}, width: 1200, height: 1500, filename: 'original.png', text: ['原图'] };
  assert.equal(await appendAIShareCard(card, [], { format: 'square' }), card);
  await assert.rejects(appendAIShareCard(card, [entry('letter', 'letter')], { format: 'square' }), /完整保留正文/);
});
