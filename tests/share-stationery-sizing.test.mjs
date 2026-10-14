import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCafe, drawTicket } from '../share-art-tickets.js';
import { drawNotebook, drawLibrary } from '../share-art-study.js';

// Deterministic layout probe: browser coverage checks the real glyphs and PNG.
// Here we exercise mixed content lengths and paper bounds without a DOM.
class PaperProbe {
  constructor() { this.width = 600; this.frameHeight = 0; this.ops = []; this.groups = []; this.groupStack = []; }
  measure(value, width, options = {}) {
    if (!String(value || '')) return 0;
    const size = options.size || 20, lineHeight = options.lineHeight || 28;
    return String(value).split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].length * size / width)) * lineHeight, 0);
  }
  text(value, x, y, width, options = {}) {
    const height = this.measure(value, width, options);
    this.ops.push({ type: 'text', value: String(value || ''), x, y, width, height, group: this.groupStack.at(-1) });
    return height;
  }
  group(x, y, width, height, angle, draw) {
    const group = { x, y, width, height, angle, texts: [] };
    this.groups.push(group); this.groupStack.push(group); draw(); this.groupStack.pop();
    group.texts = this.ops.filter(op => op.group === group);
  }
  rect(x, y, width, height, options = {}) { this.ops.push({ type: 'rect', x, y, width, height, options }); }
  line() {}
  circle() {}
  dots() {}
  tape() {}
  art() {}
  slot() {}
}
const meal = (title, groupLabel = '早餐') => ({ title, groupLabel, meta: '10月13日 · ' + groupLabel + ' · 已吃', note: '' });
const study = (title, note = '', minutesKnown = false) => ({ title, note, meta: '', minutesKnown, minutes: 20 });
const data = overrides => ({ dateLabel: '2026年10月13日', isRange: false, meals: [], exercises: [], studies: [], lifeRows: [], stickerIds: [], counts: {}, ...overrides });
const render = (draw, input) => { const p = new PaperProbe(); const height = draw(p, input); return { p, height }; };
const paperFor = (p, text) => p.groups.find(group => group.texts.some(op => op.value === text));

test('cafe short main plate and independent menu slips stay compact, long text expands', () => {
  const input = data({ meals: [meal('牛奶吐司'), meal('三明治', '午餐'), meal('热汤', '晚餐')] });
  const before = structuredClone(input), { p, height } = render(drawCafe, input);
  assert.ok(paperFor(p, '牛奶吐司').height < 170);
  assert.ok(paperFor(p, '三明治').height < 155);
  const long = render(drawCafe, data({ meals: [{ ...meal('牛奶吐司'), note: '长餐食备注。'.repeat(100) + '备注末尾' }] }));
  assert.ok(long.height > height);
  assert.ok(long.p.ops.some(op => op.value?.endsWith('备注末尾')));
  assert.deepEqual(input, before);
});

test('ticket rows grow for content while short unknown-duration records reserve no badge space', () => {
  const short = render(drawTicket, data({ exercises: [study('散步')] }));
  const card = short.p.ops.find(op => op.type === 'rect' && op.options.fill === '#fff8ec' && op.options.shadow);
  assert.ok(card.height < 80);
  const long = render(drawTicket, data({ exercises: [study('散步', '沿途的小故事。'.repeat(80) + '运动末尾', true)] }));
  assert.ok(long.height > short.height + 300);
  assert.ok(long.p.ops.some(op => op.value?.endsWith('运动末尾')));
});

test('notebook fills independent columns and leaves short notes unstretched beside longer notes', () => {
  const { p } = render(drawNotebook, data({ studies: [study('稍长学习内容', '记下一点小收获。'.repeat(8)), study('短句'), study('下一张短句')] }));
  const longer = paperFor(p, '稍长学习内容'), short = paperFor(p, '短句'), next = paperFor(p, '下一张短句');
  assert.ok(short.height < 100);
  assert.ok(longer.height > short.height * 2);
  assert.equal(short.x, next.x);
  assert.ok(next.y < longer.y + longer.height);
});

for (const [name, draw] of [['notebook', drawNotebook], ['library', drawLibrary]]) {
  test(`${name} emoji mood is a small stamp, long diary expands independently`, () => {
    const input = data({ studies: [study('日语')], lifeRows: [
      { title: '心情', note: '🍓', meta: '' },
      { title: '小确幸', note: '喝到热牛奶', meta: '' },
      { title: '小故事', note: '今天的小故事。'.repeat(100) + '日记末尾', meta: '' },
    ] });
    const before = structuredClone(input), { p } = render(draw, input);
    const mood = paperFor(p, '🍓'), joy = paperFor(p, '喝到热牛奶'), diary = paperFor(p, input.lifeRows[2].note);
    assert.ok(mood.width <= 110); assert.ok(mood.height < 90);
    assert.ok(joy.height < 100); assert.ok(diary.height > mood.height * 3);
    for (const group of p.groups) for (const text of group.texts) {
      assert.ok(text.y >= 0 && text.y + text.height <= group.height, `${text.value.slice(0, 20)} stays inside its paper`);
    }
    assert.deepEqual(input, before);
  });
}

test('library removes the generic row floor but keeps a known-duration stamp within its row', () => {
  const unknown = render(drawLibrary, data({ studies: [study('读书')] }));
  const known = render(drawLibrary, data({ studies: [study('读书', '', true)] }));
  const row = p => p.ops.find(op => op.type === 'rect' && op.options.fill === '#FFFBEE' && op.options.stroke === '#DCC4A9');
  assert.ok(row(unknown.p).height < 80);
  assert.ok(row(known.p).height >= 72);
  assert.ok(row(known.p).height > row(unknown.p).height);
});
