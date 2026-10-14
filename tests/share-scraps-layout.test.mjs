import test from 'node:test';
import assert from 'node:assert/strict';
import { drawCollage } from '../share-art-collage.js';
import { drawReport } from '../share-art-report.js';
import { drawStrawberry } from '../share-art-strawberry.js';

// Layout assertions complement real-font PNG/browser checks: short scraps may
// not inherit a neighbor's height, and every user paragraph must fit its paper.
function painter() {
  const p = {width: 600, groups: [], texts: [], stack: []};
  p.measure = (value, width, opts = {}) => {
    if (!value) return 0;
    const size = opts.size || 20, lineHeight = opts.lineHeight || 28;
    return String(value).split('\n').reduce((sum, line) => sum + Math.max(1, Math.ceil([...line].reduce((n, c) => n + (/^[\x00-\x7f]$/.test(c) ? .55 : 1) * size, 0) / Math.max(1, width))), 0) * lineHeight;
  };
  p.text = (value, x, y, width, opts = {}) => {
    const height = p.measure(value, width, opts);
    if (height) p.texts.push({text: value, x, y, width, height, paper: p.stack.at(-1)});
    return height;
  };
  p.group = (x, y, width, height, angle, draw) => {
    const group = {x, y, width, height, angle};
    p.groups.push(group); p.stack.push(group); draw(); p.stack.pop();
  };
  for (const method of ['rect', 'line', 'circle', 'dots', 'tape', 'art', 'slot']) p[method] = () => {};
  return p;
}
const row = (title, note = '', meta = '') => ({title, note, meta});
const data = extra => ({dateLabel: '2026年10月17日', groups: [], meals: [], lifeRows: [], highlights: [], counts: {}, stickerIds: [], ...extra});
const paperFor = (p, value) => p.texts.find(item => item.text === value)?.paper;
function contained(p) {
  // The collage's tiny postmark heart intentionally crosses its date stamp.
  for (const item of p.texts.filter(item => item.paper && item.text !== '♡')) {
    assert.ok(item.x >= 0 && item.x + item.width <= item.paper.width + .01, `text width: ${item.text}`);
    assert.ok(item.y >= 0 && item.y + item.height <= item.paper.height + .01, `text height: ${item.text}`);
  }
}

test('collage short study and joy scraps are measured without old minimum heights', () => {
  const p = painter(), study = row('读书'), joy = row('小确幸', '喝到热牛奶');
  drawCollage(p, data({groups: [{kind: 'study', rows: [study]}], lifeRows: [joy]}));
  assert.ok(paperFor(p, study.title).height < 110);
  assert.ok(paperFor(p, joy.note).height < 110);
  contained(p);
});

for (const [name, draw] of [['collage', drawCollage], ['report', drawReport], ['strawberry', drawStrawberry]]) {
  test(`${name} renders a single emoji as a compact stamp and preserves a long diary`, () => {
    const mood = row('心情', '🍓'), diary = row('小故事', '慢慢写下今天的日记。'.repeat(90) + '【日记完整末尾】');
    const p = painter();
    draw(p, data({lifeRows: [mood, diary]}));
    const stamp = paperFor(p, mood.note), story = paperFor(p, diary.note);
    assert.ok(stamp.width <= 170 && stamp.height <= 110, 'emoji stamp must stay compact');
    assert.ok(story.height > stamp.height * 4, 'long diary grows independently');
    assert.equal(p.texts.filter(item => item.text === diary.note).length, 1);
    contained(p);
  });
}

test('report hides missing statistics and includes all records without known minutes', () => {
  const first = row('翻两页书'), second = row('画一片叶子');
  const p = painter();
  drawReport(p, data({groups: [{kind: 'study', rows: [first, second]}], counts: {studyDays: 1}}));
  assert.ok(p.texts.some(item => item.text === first.title));
  assert.ok(p.texts.some(item => item.text === second.title));
  assert.equal(p.texts.some(item => item.text === '好好吃饭的小记' || item.text === '运动小积累'), false);
  contained(p);
});

test('report large meal count is measured before sizing its compact statistics strip', () => {
  const p = painter();
  drawReport(p, data({counts: {mealCount: 1234, mealDays: 300}, groups: [{kind: 'meal', rows: [row('寿司')]}]}));
  assert.ok(p.texts.some(item => item.text === '1234'));
  contained(p);
});

test('wide square reports add columns while preserving all rich-day content and font sizes', () => {
  const records = Array.from({length: 9}, (_, index) => row(`第${index + 1}条日常记录`, '今天的小片段', '已记录'));
  const content = data({counts: {mealCount: 4, mealDays: 1, exerciseDays: 1, studyDays: 1}, groups: [{kind: 'meal', rows: records}]});
  const square = painter(), portrait = painter();
  square.width = portrait.width = 1200;
  square.format = 'square'; portrait.format = 'portrait';
  const squareHeight = drawReport(square, content), portraitHeight = drawReport(portrait, content);
  assert.ok(squareHeight < portraitHeight - 250, 'columns must materially reduce a rich square report height');
  const papers = records.map(record => paperFor(square, record.title));
  assert.ok(new Set(papers.slice(0, 3).map(paper => paper.x)).size === 3);
  assert.equal(square.texts.filter(item => records.some(record => record.title === item.text)).length, records.length);
  contained(square);
});

test('strawberry short meal gets a compact header; a long meal uses full width', () => {
  const short = {...row('吐司', '', '10月17日 · 早餐 · 已吃'), groupLabel: '早餐'};
  const long = {...row('午饭', '蔬菜和饭团的详细餐食记录。'.repeat(45)), groupLabel: '午餐'};
  const p = painter();
  drawStrawberry(p, data({meals: [short, long]}));
  assert.ok(paperFor(p, short.title).height < 140);
  assert.ok(paperFor(p, long.note).width > 490);
  assert.ok(paperFor(p, long.note).y >= paperFor(p, short.title).y + paperFor(p, short.title).height);
  contained(p);
});
