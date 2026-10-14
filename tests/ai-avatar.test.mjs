import test from 'node:test';
import assert from 'node:assert/strict';
import { avatarMarkup, avatarFallback, rasterMetadata, inspectAvatarDataURL, AVATAR_ASSET_LIMIT, AVATAR_DB_NAME } from '../ai-avatar.js';

const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('avatar markup escapes user names, refuses URL IDs and never creates a remote image source', () => {
  const html = avatarMarkup({ name: '<img src=x onerror="alert(1)">', avatarId: 'https://example.com/avatar.png', avatarMode: 'circle' });
  assert.ok(html.includes('&lt;img'));
  assert.ok(!html.includes('<img '));
  assert.ok(!html.includes('<img src='));
  assert.ok(html.includes('ai-avatar-circle'));
  const local = avatarMarkup({ avatarId: 'avatar-local-test', builtin: 'saihara' });
  assert.ok(local.includes('data-avatar-id="avatar-local-test"'));
  assert.ok(!local.includes('src='));
});
test('default character and user stickers remain distinct', () => {
  assert.equal(avatarFallback({ builtin: 'saihara' }), '🔎');
  assert.equal(avatarFallback({ characterId: 'little-tt' }), '🐈');
  assert.equal(avatarFallback({ avatarFallback: 'jizhi' }), '🍓');
  assert.ok(avatarMarkup({ avatarFallback: 'jizhi' }).includes('ai-avatar-crown'));
  assert.equal(AVATAR_DB_NAME, 'jizhi-ai-test-avatars-v1');
});
test('backup raster validation rejects remote URLs, SVG, wrong MIME, oversized data and dimensions', () => {
  const metadata = inspectAvatarDataURL(png);
  assert.deepEqual([metadata.mime, metadata.width, metadata.height], ['image/png', 1, 1]);
  for (const input of ['https://example.com/photo.png', 'data:image/svg+xml;base64,PHN2Zy8+', png.replace('image/png', 'image/jpeg'), 'data:image/png;base64,!!!', 'data:image/png;base64,' + 'A'.repeat(AVATAR_ASSET_LIMIT * 2)]) assert.throws(() => inspectAvatarDataURL(input));
  const bytes = metadata.bytes.slice();
  new DataView(bytes.buffer).setUint32(16, 513);
  assert.throws(() => inspectAvatarDataURL('data:image/png;base64,' + Buffer.from(bytes).toString('base64')), /512/);
  assert.throws(() => rasterMetadata(new TextEncoder().encode('<svg><script>bad()</script></svg>')), /PNG/);
});
