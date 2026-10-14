import { SCHEMA, freshState, normalize } from './model.js';
export const STORAGE_KEY = 'jizhi-ai-test-book-v1';
export const MIGRATION_BACKUP_KEY = 'jizhi-ai-test-book-v1-migration-backup';
export const V13_BACKUP_KEY = 'jizhi-ai-test-book-v1.3-upgrade-backup';
export const V14_BACKUP_KEY = 'jizhi-ai-test-book-v1.4-upgrade-backup';
export const V15_BACKUP_KEY = 'jizhi-ai-test-book-v1.5-upgrade-backup';
export function load(storage) {
  const raw = storage.getItem(STORAGE_KEY);
  if (raw == null) return { state: freshState(), warnings: [], raw: null, locked: false };
  try { return { ...normalize(JSON.parse(raw)), raw }; }
  catch (error) { return { state: { ...freshState(), _readOnly: true }, warnings: [error.message], raw, locked: true }; }
}
export function persist(storage, state, { replaceProtected = false } = {}) {
  if (state?._readOnly) throw new Error('原数据已保护，不能覆盖；请先保存原文件并恢复有效备份。');
  const normalized = normalize(state);
  if (normalized.locked) throw new Error('数据中有异常记录，已停止保存，原文件没有改变。');
  const next = { ...normalized.state, inventoryVersion: 1, updatedAt: new Date().toISOString() };
  const encoded = JSON.stringify(next);
  const raw = storage.getItem(STORAGE_KEY);
  if (raw != null) {
    let previous;
    let protectedPrevious = false;
    try {
      previous = JSON.parse(raw);
      protectedPrevious = normalize(previous).locked;
    } catch { protectedPrevious = true; }
    if (protectedPrevious && !replaceProtected) throw new Error('原文件格式异常或属于更新版本，已保护原文件；请先导出，再明确确认恢复。');
    if (!protectedPrevious && [1, 2, 3].includes(previous?.schemaVersion) && storage.getItem(V15_BACKUP_KEY) == null) {
      try { storage.setItem(V15_BACKUP_KEY, raw); }
      catch { throw new Error('V1.5 升级备份没能保存，原数据没有改变。请先导出备份或腾出浏览器存储空间。'); }
    }
    if (!protectedPrevious && [1, 2].includes(previous?.schemaVersion) && storage.getItem(V14_BACKUP_KEY) == null) {
      try { storage.setItem(V14_BACKUP_KEY, raw); }
      catch { throw new Error('V1.4 升级备份没能保存，原数据没有改变。请先导出备份或腾出浏览器存储空间。'); }
    }
    if (previous?.schemaVersion === 1 && SCHEMA > 1 && storage.getItem(MIGRATION_BACKUP_KEY) == null) {
      try { storage.setItem(MIGRATION_BACKUP_KEY, raw); }
      catch { throw new Error('旧版数据的安全备份没能保存，原数据没有改变。请先导出备份或腾出浏览器存储空间。'); }
    }
    if (!protectedPrevious && previous?.schemaVersion === 2 && previous.inventoryVersion !== 1 && storage.getItem(V13_BACKUP_KEY) == null) {
      try { storage.setItem(V13_BACKUP_KEY, raw); }
      catch { throw new Error('V1.3 升级备份无法保存，原数据没有改变。请先导出备份。'); }
    }
  }
  storage.setItem(STORAGE_KEY, encoded);
  return next;
}
