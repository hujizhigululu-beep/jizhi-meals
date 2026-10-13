import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STICKERS, STICKER_IDS, STICKER_GROUPS, getSticker, stickerById, stickerPath } from '../stickers.js';
import { renderStickerPicker } from '../sticker-picker.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const oldIds = ['milk', 'strawberry', 'book', 'shoe', 'star', 'heart', 'bow', 'fork'];
const buttons = (html, context = 'day') => [...html.matchAll(new RegExp(`data-${context}-sticker="([^"]+)"`, 'g'))].map(match => match[1]);

test('扩容保留旧贴纸ID/API/来源授权，全部ID和分类稳定且唯一', () => {
  assert.ok(STICKERS.length >= 24 && STICKERS.length <= 30);
  assert.deepEqual(STICKER_IDS.slice(0, 8), oldIds);
  assert.equal(new Set(STICKER_IDS).size, STICKERS.length);
  assert.deepEqual(STICKER_GROUPS.map(group => group.id), ['food', 'study', 'motion', 'mood', 'life', 'decor']);
  for (const group of STICKER_GROUPS) assert.ok(STICKERS.filter(sticker => sticker.category === group.id).length >= 2);
  for (const id of oldIds) {
    assert.equal(stickerPath(id), `./assets/stickers/${id}.svg`);
    assert.equal(stickerById(id), getSticker(id));
  }
  const berry = getSticker('strawberry');
  assert.equal(berry.credit, 'OpenMoji contributors · CC BY-SA 4.0');
  assert.equal(berry.source, 'https://openmoji.org/');
  assert.equal(berry.license, 'https://creativecommons.org/licenses/by-sa/4.0/');
  assert.equal(getSticker('milk').source, './assets/milk-carton.svg');
  assert.equal(getSticker('milk').credit, '机智定食原创插画');
  assert.ok(Object.isFrozen(STICKERS) && Object.isFrozen(STICKER_IDS) && Object.isFrozen(STICKER_GROUPS));
});

test('目录与runtime映射一致，所有固定SVG真实存在而且不含脚本或外部资源', () => {
  const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/stickers/catalog.json'), 'utf8'));
  assert.deepEqual(catalog.map(row => row.id), STICKER_IDS);
  for (const sticker of STICKERS) {
    assert.match(sticker.src, /^\.\/assets\/(?:stickers|share-art|notebook-ui)\/[a-z-]+\.svg$/);
    assert.ok(STICKER_GROUPS.some(group => group.id === sticker.category));
    const fromCatalog = catalog.find(row => row.id === sticker.id);
    for (const key of ['id', 'name', 'category', 'file', 'credit', 'src', 'license']) assert.equal(fromCatalog[key], sticker[key]);
    assert.equal(path.resolve(root, sticker.src), path.resolve(root, 'assets/stickers', sticker.file));
    const svg = fs.readFileSync(path.resolve(root, sticker.src), 'utf8');
    assert.match(svg, /<svg\b/);
    assert.doesNotMatch(svg, /<script\b|<foreignObject\b|\bonload\s*=|\bonerror\s*=|(?:href|src)\s*=\s*["'](?:https?:|javascript:)/i);
  }
  for (const value of ['../milk.svg', 'javascript:alert(1)', '<img onerror=evil>', 'unknown', null]) assert.equal(stickerPath(value), null);
});

test('最近列表空时显示真实常用推荐，选择器渲染不修改任何输入', () => {
  const options = { selectedIds: [], recentIds: [], group: 'recent', context: 'day' };
  const before = JSON.stringify(options), html = renderStickerPicker(options);
  assert.match(html, /最近还没有使用记录/);
  assert.deepEqual(buttons(html), oldIds);
  assert.equal(JSON.stringify(options), before);
  assert.match(html, /data-day-sticker-group="food"/);
  assert.match(html, /data-sticker-group="study"/);
  assert.match(html, /最多 3 枚/);
});

test('最近白名单去重、保留顺序并截断12枚；已选3枚单独可移除不产生重复按钮', () => {
  const options = { selectedIds: ['milk', 'milk', 'life-shopping', 'mood-cat', 'star'], recentIds: ['unknown', 'mood-cat', 'mood-cat', ...STICKER_IDS], group: 'recent' };
  const before = JSON.stringify(options), html = renderStickerPicker(options), ids = buttons(html);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /今天贴好的小可爱<\/span><small>3\/3/);
  assert.match(html, /data-day-sticker="milk" aria-pressed="true" aria-label="移除草莓奶盒贴纸"/);
  assert.match(html, /data-day-sticker="life-shopping" aria-pressed="true"/);
  assert.deepEqual(ids.slice(0, 3), ['milk', 'life-shopping', 'mood-cat']);
  const recent = ['mood-cat', ...STICKER_IDS.filter(id => id !== 'mood-cat')].slice(0, 12);
  assert.deepEqual(ids.slice(3), recent.filter(id => !['milk', 'life-shopping', 'mood-cat'].includes(id)));
  assert.equal(JSON.stringify(options), before);
});

test('分类筛选和分享上下文事件隔离，常用推荐可由白名单覆盖', () => {
  for (const group of STICKER_GROUPS) {
    const html = renderStickerPicker({ group: group.id, context: 'share' });
    assert.deepEqual(buttons(html, 'share'), STICKERS.filter(sticker => sticker.category === group.id).map(sticker => sticker.id));
    assert.doesNotMatch(html, /data-day-sticker[= -]/);
    assert.match(html, new RegExp(`data-share-sticker-group="${group.id}" aria-pressed="true"`));
  }
  const html = renderStickerPicker({ group: 'common', frequentIds: ['life-headphones', 'unknown', 'mood-happy', 'life-headphones'] });
  assert.deepEqual(buttons(html), ['life-headphones', 'mood-happy']);
  assert.deepEqual(buttons(renderStickerPicker({ group: 'all' })), STICKER_IDS);
});

test('用户传入ID/分组/context不能注入HTML或图片路径，原草莓署名继续展示', () => {
  const payload = '"><img src=x onerror="evil()"><script>alert(1)</script>';
  const html = renderStickerPicker({ selectedIds: [payload, 'strawberry'], recentIds: [payload], frequentIds: [payload], group: payload, context: payload });
  assert.doesNotMatch(html, /<script\b|onerror|src=x|data-.*evil/);
  assert.match(html, /data-sticker-context="day"/);
  assert.match(html, /OpenMoji · CC BY-SA 4\.0/);
  assert.match(html, /href="\.\/assets\/credits\.html"/);
  assert.equal(buttons(html).filter(id => id === 'strawberry').length, 1);
  assert.doesNotThrow(() => renderStickerPicker({ selectedIds: null, recentIds: '<svg>', frequentIds: {} }));
});
