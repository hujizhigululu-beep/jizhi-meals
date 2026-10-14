// AI test avatars are local, immutable assets. No API credentials or network calls.
export const AVATAR_DB_NAME = 'jizhi-ai-test-avatars-v1';
export const AVATAR_INPUT_LIMIT = 5 * 1024 * 1024;
export const AVATAR_ASSET_LIMIT = 200 * 1024;
export const AVATAR_EDGE_LIMIT = 512;
export const AVATAR_BACKUP_TOTAL_LIMIT = 30 * 1024 * 1024;
const cache = new Map();
let database;
const idOK = id => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id);
const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fail = message => { throw new Error(message); };

export function avatarFallback(snapshot = {}) {
  const hint = snapshot.avatarFallback || snapshot.builtin || snapshot.characterId || snapshot.id;
  if (hint === 'saihara') return '🔎';
  if (hint === 'little-tt') return '🐈';
  if (hint === 'jizhi' || hint === 'user') return '🍓';
  return '✉';
}
export function avatarMarkup(snapshot = {}, size = 'small') {
  const fallback = avatarFallback(snapshot), mode = snapshot.avatarMode === 'circle' ? 'circle' : 'sticker';
  const sizeClass = ['small', 'medium', 'large'].includes(size) ? size : 'small';
  const crown = fallback === '🍓' ? '<span class="ai-avatar-crown" aria-hidden="true">♛</span>' : '';
  return `<span class="ai-avatar ai-avatar-${sizeClass} ai-avatar-${mode}" role="img" aria-label="${esc(snapshot.name || snapshot.characterName || '角色贴图')}"><span class="ai-avatar-placeholder" aria-hidden="true">${crown}${fallback}</span>${idOK(snapshot.avatarId) ? `<img data-avatar-id="${esc(snapshot.avatarId)}" alt="" hidden decoding="async">` : ''}</span>`;
}

/** Recognise actual raster bytes and dimensions before decoding. SVG/URLs are rejected. */
export function rasterMetadata(bytes) {
  const a = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const view = new DataView(a.buffer, a.byteOffset, a.byteLength);
  if (a.length >= 24 && [137,80,78,71,13,10,26,10].every((b, i) => a[i] === b) && String.fromCharCode(...a.slice(12,16)) === 'IHDR') {
    return { mime: 'image/png', width: view.getUint32(16), height: view.getUint32(20) };
  }
  if (a.length >= 30 && String.fromCharCode(...a.slice(0,4)) === 'RIFF' && String.fromCharCode(...a.slice(8,12)) === 'WEBP') {
    const chunk = String.fromCharCode(...a.slice(12,16));
    const u24 = at => a[at] + (a[at+1] << 8) + (a[at+2] << 16);
    if (chunk === 'VP8X') return { mime: 'image/webp', width: u24(24) + 1, height: u24(27) + 1 };
    if (chunk === 'VP8 ' && a[23] === 157 && a[24] === 1 && a[25] === 42) return { mime: 'image/webp', width: view.getUint16(26, true) & 0x3fff, height: view.getUint16(28, true) & 0x3fff };
    if (chunk === 'VP8L' && a[20] === 47) return { mime: 'image/webp', width: 1 + ((a[22] & 0x3f) << 8 | a[21]), height: 1 + ((a[24] & 0xf) << 10 | a[23] << 2 | a[22] >> 6) };
  }
  if (a.length >= 4 && a[0] === 255 && a[1] === 216 && a[2] === 255) {
    let at = 2;
    while (at + 3 < a.length) {
      if (a[at] !== 255) break;
      while (a[at] === 255) at++;
      const marker = a[at++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 215) continue;
      if (at + 2 > a.length) break;
      const length = view.getUint16(at);
      if (length < 2 || at + length > a.length) break;
      if ([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker) && length >= 8) return { mime: 'image/jpeg', width: view.getUint16(at + 5), height: view.getUint16(at + 3) };
      at += length;
    }
  }
  fail('图片内容不是可识别的 PNG、WebP 或 JPG，请换一张图片。');
}
function bytesDataURL(bytes, mime) {
  let binary = '';
  for (let at = 0; at < bytes.length; at += 8192) binary += String.fromCharCode(...bytes.slice(at, at + 8192));
  return `data:${mime};base64,${btoa(binary)}`;
}
export function inspectAvatarDataURL(dataURL) {
  if (typeof dataURL !== 'string' || dataURL.length > Math.ceil(AVATAR_ASSET_LIMIT / 3) * 4 + 40) fail('头像图片超过 200 KiB，无法恢复。');
  const match = /^data:(image\/(?:png|webp|jpeg));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataURL);
  if (!match || match[2].length % 4 !== 0) fail('头像只允许本地 PNG、WebP 或 JPG 图片数据。');
  let binary;
  try { binary = atob(match[2]); } catch { fail('头像图片数据损坏，未恢复。'); }
  if (binary.length > AVATAR_ASSET_LIMIT) fail('头像图片超过 200 KiB，无法恢复。');
  const bytes = Uint8Array.from(binary, c => c.charCodeAt(0)), metadata = rasterMetadata(bytes);
  if (metadata.mime !== match[1]) fail('头像格式与图片内容不符，未恢复。');
  if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > AVATAR_EDGE_LIMIT) fail('备份头像最长边必须不超过 512 像素。');
  return { ...metadata, bytes };
}
async function decodedImage(dataURL) {
  const image = new Image();
  image.src = dataURL;
  try { await image.decode(); } catch { fail('图片无法解码，可能已损坏。'); }
  if (!image.naturalWidth || !image.naturalHeight) fail('图片尺寸无效。');
  return image;
}
async function validateAsset(entry) {
  if (!entry || Object.keys(entry).some(key => !['id', 'dataURL'].includes(key)) || !idOK(entry.id)) fail('备份头像编号或字段异常，未恢复。');
  const metadata = inspectAvatarDataURL(entry.dataURL), image = await decodedImage(entry.dataURL);
  if (image.naturalWidth !== metadata.width || image.naturalHeight !== metadata.height) fail('头像实际尺寸与图片数据不符，未恢复。');
  return { id: entry.id, dataURL: entry.dataURL };
}
function openDatabase() {
  if (!globalThis.indexedDB) return Promise.reject(new Error('此浏览器无法使用本地图片存储，请换用允许本地数据的浏览器。'));
  if (!database) database = new Promise((resolve, reject) => {
    const request = indexedDB.open(AVATAR_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore('avatars', { keyPath: 'id' });
    request.onsuccess = () => { const db = request.result; db.onversionchange = () => { db.close(); database = null; }; resolve(db); };
    request.onerror = () => { database = null; reject(new Error('头像本地存储无法打开，已有资料没有改变。')); };
    request.onblocked = () => { database = null; reject(new Error('请关闭其他测试版窗口后重试头像存储。')); };
  });
  return database;
}
export async function getAvatarDataURL(id) {
  if (!idOK(id)) fail('头像编号无效。');
  if (cache.has(id)) return cache.get(id);
  const db = await openDatabase();
  const result = await new Promise((resolve, reject) => {
    const request = db.transaction('avatars', 'readonly').objectStore('avatars').get(id);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('头像暂时无法读取，请稍后重试。'));
  });
  if (!result?.dataURL) fail('本地头像缺失，请恢复包含头像的 JSON 备份，或重新上传。');
  inspectAvatarDataURL(result.dataURL);
  cache.set(id, result.dataURL);
  return result.dataURL;
}
export async function hydrateAvatars(container) {
  await Promise.all([...container.querySelectorAll('img[data-avatar-id]')].map(async image => {
    try {
      const dataURL = await getAvatarDataURL(image.dataset.avatarId);
      if (!image.isConnected) return;
      image.src = dataURL;
      await image.decode();
      image.hidden = false;
      image.previousElementSibling.hidden = true;
    } catch { image.title = '本地头像暂时不可用，显示默认贴图。'; }
  }));
}
function referencedAvatarIDs(book) {
  const config = book?.postOffice || book || {}, ids = new Set();
  const add = value => { if (value?.avatarId) { if (!idOK(value.avatarId)) fail('手账头像编号异常，请先保留原数据。'); ids.add(value.avatarId); } };
  add(config.user);
  for (const row of config.characters || []) add(row);
  for (const row of [...config.letters || [], ...config.comments || []]) { add(row); add(row.characterSnapshot); }
  return [...ids];
}
export async function exportAvatarAssets(book) {
  const assets = await Promise.all(referencedAvatarIDs(book).map(async id => ({ id, dataURL: await getAvatarDataURL(id) })));
  if (assets.reduce((sum, row) => sum + inspectAvatarDataURL(row.dataURL).bytes.length, 0) > AVATAR_BACKUP_TOTAL_LIMIT) fail('备份中的头像总量超过 30 MiB，未导出不完整备份。请先保留原数据，再清理不再需要的历史内容或换用更小的头像。');
  return assets;
}
/** Only call after an explicitly confirmed, successful full test-book clear. */
export async function clearAvatarAssets() {
  const db = await openDatabase();
  await new Promise((resolve, reject) => {
    const tx = db.transaction('avatars', 'readwrite');
    tx.objectStore('avatars').clear();
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(new Error('手账已清空，但本地头像清理失败；可以在浏览器中清理此测试网站的数据。'));
  });
  cache.clear();
}
export async function importAvatarAssets(entries = [], book) {
  if (!Array.isArray(entries) || entries.length > 3101) fail('备份头像列表异常或数量超过 3101，未恢复。');
  const ids = new Set(), validated = []; let totalBytes = 0;
  // Validate the complete set before any write; never overwrite immutable history assets.
  for (const entry of entries) {
    if (ids.has(entry?.id)) fail('备份包含重复头像编号，未恢复。');
    totalBytes += inspectAvatarDataURL(entry?.dataURL).bytes.length;
    if (totalBytes > AVATAR_BACKUP_TOTAL_LIMIT) fail('备份头像总量超过 30 MiB，未恢复，请保留原备份。');
    ids.add(entry?.id); validated.push(await validateAsset(entry));
  }
  const refs = referencedAvatarIDs(book);
  if (!validated.length && !refs.length) return;
  const db = await openDatabase();
  const existing = await new Promise((resolve, reject) => {
    const tx = db.transaction('avatars', 'readonly'), store = tx.objectStore('avatars'), found = new Map();
    for (const id of new Set([...ids, ...refs])) { const request = store.get(id); request.onsuccess = () => { if (request.result) found.set(id, request.result.dataURL); }; }
    tx.oncomplete = () => resolve(found);
    tx.onerror = () => reject(new Error('本地头像读取失败，未恢复。'));
  });
  for (const entry of validated) if (existing.has(entry.id) && existing.get(entry.id) !== entry.dataURL) fail('头像编号与本地图片冲突，未恢复；请在新的浏览器中导入备份。');
  for (const id of refs) if (!ids.has(id) && !existing.has(id)) fail('备份缺少手账引用的头像，未恢复，请使用包含头像的完整 JSON 备份。');
  const additions = validated.filter(entry => !existing.has(entry.id));
  if (additions.length) await new Promise((resolve, reject) => {
    const tx = db.transaction('avatars', 'readwrite'), store = tx.objectStore('avatars');
    for (const entry of additions) store.add(entry);
    tx.oncomplete = resolve;
    tx.onerror = tx.onabort = () => reject(new Error('头像保存失败，可能是本地空间不足；原有头像与资料没有改变。'));
  });
  for (const entry of validated) cache.set(entry.id, entry.dataURL);
}
export async function storeAvatar(file) {
  if (!file || !['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) fail('请选择 PNG、WebP 或 JPG 图片。');
  if (!file.size || file.size > AVATAR_INPUT_LIMIT) fail('原始图片需小于 5 MiB，请先缩小图片。');
  const bytes = new Uint8Array(await file.arrayBuffer()), metadata = rasterMetadata(bytes);
  if (metadata.mime !== file.type) fail('图片扩展格式与内容不符，请重新导出图片后上传。');
  if (!metadata.width || !metadata.height || Math.max(metadata.width, metadata.height) > 12000 || metadata.width * metadata.height > 36000000) fail('原始图片尺寸过大，请先缩小图片。');
  const image = await decodedImage(bytesDataURL(bytes, metadata.mime));
  let edge = Math.min(AVATAR_EDGE_LIMIT, Math.max(image.naturalWidth, image.naturalHeight)), dataURL;
  while (edge >= Math.min(96, Math.max(image.naturalWidth, image.naturalHeight))) {
    const scale = edge / Math.max(image.naturalWidth, image.naturalHeight);
    const canvas = document.createElement('canvas'); canvas.width = Math.max(1, Math.round(image.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext('2d'); if (!ctx) fail('浏览器暂时无法处理图片，请稍后重试。');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.9, .75, .55, .4]) {
      const candidate = canvas.toDataURL('image/webp', quality);
      try { inspectAvatarDataURL(candidate); dataURL = candidate; break; } catch { /* Downscale if the browser only supports lossless PNG. */ }
    }
    if (dataURL) break;
    edge = Math.floor(edge * .8);
  }
  if (!dataURL) fail('压缩后的图片仍超过 200 KiB，请换一张较简单的图片。');
  const id = `avatar-${globalThis.crypto.randomUUID()}`;
  await importAvatarAssets([{ id, dataURL }]);
  return id;
}
