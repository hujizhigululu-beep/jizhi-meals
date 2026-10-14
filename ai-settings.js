import { defaultPostOffice, saveUserProfile, upsertCharacter, copyCharacter, removeCharacter, resetCharacter, setDefaultCharacter, savePostOfficeField, resetPostOfficeField, saveTaskPrompt } from './post-office.js';
import { avatarMarkup, hydrateAvatars, storeAvatar } from './ai-avatar.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ui = { epoch: null, selected: 'saihara', drafts: new Map(), open: new Set(), uploading: false };
const painters = new Set();
const update = () => { for (const paint of painters) paint(); };
const taskNames = { meals: '餐食短评', exercise: '运动短评', study: '学习短评', inventory: '库存短评', letter: '日记回信' };
function valueOf(book, key) {
  if (key.startsWith('role:')) { const [, id, field] = key.split(':'); return book.characters.find(row => row.id === id)?.[field] ?? ''; }
  if (key === 'user:name' || key === 'user:avatarMode') return book.user[key.slice(5)];
  if (key === 'user:persona') return book.userPersona;
  if (key === 'writingPreset') return book.writingPreset;
  if (key.startsWith('task:')) return key === 'task:letter' ? book.letterTask : book.tasks[key.slice(5)];
  return '';
}
function draft(book, key) {
  const saved = valueOf(book, key);
  if (!ui.drafts.has(key)) ui.drafts.set(key, { value: saved, base: saved, dirty: false });
  const item = ui.drafts.get(key);
  if (!item.dirty) { item.value = saved; item.base = saved; }
  return item;
}
function clearDraft(keys) { for (const key of keys) ui.drafts.delete(key); }
function promptCard(book, key, title, hint = '') {
  const item = draft(book, key);
  return `<section class="ai-setting-prompt"><label>${esc(title)}<textarea data-ai-draft="${esc(key)}" rows="7" spellcheck="false" autocomplete="off">${esc(item.value)}</textarea></label>${hint ? `<p class="ai-setting-hint">${esc(hint)}</p>` : ''}<div class="ai-setting-tools"><span data-ai-draft-status="${esc(key)}">${item.dirty ? '有尚未保存的修改' : '已保存到本地'}</span><button type="button" class="pill" data-ai-setting-action="save-field" data-key="${esc(key)}">保存这项</button><button type="button" class="text-button" data-ai-setting-action="reset-field" data-key="${esc(key)}">恢复默认</button></div></section>`;
}
function avatarEditor(snapshot, owner) {
  return `<div class="ai-setting-avatar">${avatarMarkup(snapshot, 'large')}<div><label class="pill ai-avatar-upload">${snapshot.avatarId ? '替换头像' : '上传头像'}<input type="file" accept="image/png,image/webp,image/jpeg" data-ai-avatar-owner="${esc(owner)}" ${ui.uploading ? 'disabled' : ''}></label><button type="button" class="text-button" data-ai-setting-action="remove-avatar" data-owner="${esc(owner)}" ${snapshot.avatarId ? '' : 'disabled'}>移除头像</button></div></div>`;
}
function disclosure(id, title, content, intro) {
  return `<details class="settings-card ai-settings-section" data-ai-settings-section="${id}" ${ui.open.has(id) ? 'open' : ''}><summary>${title}</summary><p class="ai-setting-hint">${intro}</p>${content}</details>`;
}
function rememberOpenSections(slot) {
  for (const section of slot.querySelectorAll('[data-ai-settings-section]')) {
    const name = section.dataset.aiSettingsSection;
    section.open ? ui.open.add(name) : ui.open.delete(name);
  }
}
function render(slot, host) {
  // Native toggle events may run after another input event. Read the actual
  // fold state synchronously before replacing markup so editing never closes it.
  rememberOpenSections(slot);
  const book = host.getState().postOffice || defaultPostOffice();
  if (!book.characters.some(row => row.id === ui.selected)) ui.selected = book.characters[0]?.id || '';
  const role = book.characters.find(row => row.id === ui.selected);
  const activeDefault = book.characters.find(row => row.id === book.defaultCharacterId && row.enabled);
  const userName = draft(book, 'user:name'), userMode = draft(book, 'user:avatarMode');
  const user = `${avatarEditor({ ...book.user, avatarFallback: 'jizhi' }, 'user')}<label class="ai-setting-field">用户显示名称<input data-ai-draft="user:name" value="${esc(userName.value)}" maxlength="100" autocomplete="off"></label><label class="ai-setting-field">头像显示方式<select data-ai-draft="user:avatarMode"><option value="sticker" ${userMode.value === 'sticker' ? 'selected' : ''}>透明贴图 · 保留完整图片</option><option value="circle" ${userMode.value === 'circle' ? 'selected' : ''}>圆形头像</option></select></label><button type="button" class="pill" data-ai-setting-action="save-user">保存名称与显示方式</button>${promptCard(book, 'user:persona', '用户人设 · User Persona', '与你有关的背景与称呼；它独立于角色人设和文学预设。')}`;
  const defaultChoices = book.characters.filter(row => row.enabled).map(row => `<option value="${esc(row.id)}" ${row.id === book.defaultCharacterId ? 'selected' : ''}>${esc(row.name)}</option>`).join('');
  const defaultSection = `<label class="ai-setting-field">全局默认角色<select data-ai-default-role><option value="" ${activeDefault ? '' : 'selected'} disabled>请选择一个已启用角色</option>${defaultChoices}</select></label>${activeDefault ? `<p class="ai-setting-hint">所有生成入口默认使用 ${esc(activeDefault.name)}；入口旁的贴图可临时切换一次。</p>` : '<p class="ai-setting-warning" role="status">默认角色已停用或删除。请重新指定，生成入口不会偷偷换成其他角色。</p>'}`;
  const roleChoices = book.characters.map(row => `<option value="${esc(row.id)}" ${row.id === ui.selected ? 'selected' : ''}>${esc(row.name)}${row.enabled ? '' : '（已停用）'}</option>`).join('');
  let roleForm = '<p class="ai-setting-hint">还没有角色，请新增一个。</p>';
  if (role) {
    const k = field => `role:${role.id}:${field}`, name = draft(book, k('name')), mode = draft(book, k('avatarMode')), enabled = draft(book, k('enabled'));
    roleForm = `${avatarEditor(role, role.id)}<label class="ai-setting-field">角色显示名称<input data-ai-draft="${esc(k('name'))}" value="${esc(name.value)}" maxlength="100" autocomplete="off"></label><label class="ai-setting-field">头像显示方式<select data-ai-draft="${esc(k('avatarMode'))}"><option value="sticker" ${mode.value === 'sticker' ? 'selected' : ''}>透明贴图 · 保留完整图片</option><option value="circle" ${mode.value === 'circle' ? 'selected' : ''}>圆形头像</option></select></label><label class="ai-setting-check"><input type="checkbox" data-ai-draft="${esc(k('enabled'))}" ${enabled.value ? 'checked' : ''}>启用此角色</label><div class="ai-setting-tools"><button type="button" class="pill" data-ai-setting-action="save-role">保存名称与启用状态</button><button type="button" class="pill" data-ai-setting-action="copy-role">复制角色</button>${role.builtin ? '<button type="button" class="text-button" data-ai-setting-action="reset-role">恢复角色默认设定</button>' : '<button type="button" class="text-button" data-ai-setting-action="delete-role">删除自定义角色</button>'}</div>${promptCard(book, k('persona'), '角色人设 · Character Persona', '实际发送给模型的角色设定。可粘贴长预设；不自动删减。')}${promptCard(book, k('writingPreset'), '角色专属文学预设（可选）', '留空时使用通用文学预设；填写后，本角色使用这份原文。')}`;
  }
  const roles = `${defaultSection}<div class="ai-setting-role-picker"><label class="ai-setting-field">编辑角色<select data-ai-edit-role>${roleChoices}</select></label><button type="button" class="pill" data-ai-setting-action="add-role">＋ 新增角色</button></div>${roleForm}<p class="ai-setting-hint">修改、停用或删除角色，不会改变历史来信和短评的署名或头像。</p>`;
  const presets = `${promptCard(book, 'writingPreset', '通用文学预设 · Writing Preset', '角色未填写专属预设时使用这份原文。')}${Object.entries(taskNames).map(([type, name]) => promptCard(book, `task:${type}`, `${name} · 任务提示词`)).join('')}`;
  slot.innerHTML = `<div class="ai-settings" data-ai-settings>${disclosure('user', '🍓 用户设定', user, '机智的资料与角色资料分开保存。')}${disclosure('roles', '✉ 角色管理', roles, '选择默认寄信人，也可以保存更多不同的声音。')}${disclosure('presets', '📖 文学预设与任务提示词', presets, '每项独立编辑与保存；生成、阅读与分享在日常页面进行。')}<p class="ai-setting-hint" data-ai-upload-status role="status">${ui.uploading ? '正在处理头像，请稍候…' : '头像在本机缩小至最长边 512px、单张不超过 200 KiB，保留透明背景。原图需小于 5 MiB；图片与设定会进入 JSON 备份。'}</p></div>`;
  hydrateAvatars(slot);
}
export function mountAISettings(slot, host) {
  if (ui.epoch !== host.getBookEpoch()) { ui.epoch = host.getBookEpoch(); ui.selected = 'saihara'; ui.drafts.clear(); ui.open.clear(); }
  let disposed = false;
  render(slot, host);
  const book = () => host.getState().postOffice || defaultPostOffice();
  const paint = () => { if (!disposed && slot.isConnected) render(slot, host); };
  painters.add(paint);
  function updateDraft(element) {
    const key = element.dataset.aiDraft;
    if (!key) return;
    const item = draft(book(), key); item.value = element.type === 'checkbox' ? element.checked : element.value; item.dirty = item.value !== item.base;
    const status = [...slot.querySelectorAll('[data-ai-draft-status]')].find(node => node.dataset.aiDraftStatus === key);
    if (status) status.textContent = item.dirty ? '有尚未保存的修改' : '已保存到本地';
  }
  function save(keys, change, message) {
    if (keys.some(key => { const item = draft(book(), key); return item.dirty && valueOf(book(), key) !== item.base; })) { host.toast('另一处刚更新了这项设定。你的草稿仍保留，请先核对再保存。'); return false; }
    if (!host.commit(change, message)) return false;
    clearDraft(keys); update(); return true;
  }
  async function onClick(event) {
    const button = event.target.closest('[data-ai-setting-action]'); if (!button || !slot.contains(button)) return;
    const action = button.dataset.aiSettingAction, current = book(), role = current.characters.find(row => row.id === ui.selected), id = role?.id;
    const key = button.dataset.key;
    try {
      if (action === 'save-user') {
        const keys = ['user:name', 'user:avatarMode'], values = { name: draft(current, keys[0]).value, avatarMode: draft(current, keys[1]).value };
        save(keys, next => saveUserProfile(next, values), '用户名称与显示方式已保存。');
      } else if (action === 'save-role' && role) {
        const keys = ['name','avatarMode','enabled'].map(field => `role:${id}:${field}`), values = Object.fromEntries(keys.map(k => [k.split(':')[2], draft(current, k).value]));
        if (id === current.defaultCharacterId && values.enabled === false && !await host.ask('停用默认角色？', '历史内容会保留。停用后需要重新指定全局默认角色，才可继续生成。', '停用并重新选择')) return;
        save(keys, next => upsertCharacter(next, { id, ...values }), '角色资料已保存。');
      } else if (action === 'save-field') {
        const value = draft(current, key).value;
        save([key], next => {
          if (key === 'user:persona') savePostOfficeField(next, 'userPersona', value);
          else if (key === 'writingPreset') savePostOfficeField(next, 'writingPreset', value);
          else if (key.startsWith('task:')) saveTaskPrompt(next, key.slice(5), value);
          else { const [, roleID, field] = key.split(':'); upsertCharacter(next, { id: roleID, [field]: value }); }
        }, '这项预设已独立保存。');
      } else if (action === 'reset-field') {
        if (!await host.ask('恢复这项默认预设？', '只替换这一项；当前已保存内容和未保存草稿都会被默认值替换。', '恢复这项')) return;
        const defaults = defaultPostOffice();
        const success = host.commit(next => {
          if (key === 'user:persona') resetPostOfficeField(next, 'userPersona');
          else if (key === 'writingPreset') resetPostOfficeField(next, 'writingPreset');
          else if (key.startsWith('task:')) saveTaskPrompt(next, key.slice(5), key === 'task:letter' ? defaults.letterTask : defaults.tasks[key.slice(5)]);
          else { const [, roleID, field] = key.split(':'); const original = defaults.characters.find(row => row.id === roleID); upsertCharacter(next, { id: roleID, [field]: original?.[field] || '' }); }
        }, '已恢复这一项。');
        if (success) { clearDraft([key]); update(); }
      } else if (action === 'add-role') {
        let created;
        if (host.commit(next => { created = upsertCharacter(next, { name: '新角色', persona: '', writingPreset: '', enabled: true }); }, '新角色已添加，可以填写自己的设定。')) { ui.selected = created.id; ui.open.add('roles'); update(); }
      } else if (action === 'copy-role' && role) {
        let created;
        if (host.commit(next => { created = copyCharacter(next, id); }, '已复制保存的角色设定。')) { ui.selected = created.id; update(); }
      } else if (action === 'delete-role' && role) {
        if (!await host.ask('删除这个自定义角色？', `会删除「${role.name}」的角色设定；过去的短评、来信及其头像会保留。${id === current.defaultCharacterId ? '删除后需要重新指定默认角色。' : ''}`, '删除角色')) return;
        if (host.commit(next => removeCharacter(next, id), '角色已删除，历史内容保留。')) { clearDraft([...ui.drafts.keys()].filter(k => k.startsWith(`role:${id}:`))); update(); }
      } else if (action === 'reset-role' && role) {
        if (!await host.ask('恢复这个角色的全部默认设定？', '将替换名称、人设、专属文学预设、头像和启用状态，也会清除这个角色尚未保存的草稿。历史内容保持原样。', '恢复角色默认')) return;
        if (host.commit(next => resetCharacter(next, id), '已恢复角色默认设定。')) { clearDraft([...ui.drafts.keys()].filter(k => k.startsWith(`role:${id}:`))); update(); }
      } else if (action === 'remove-avatar') {
        const owner = button.dataset.owner;
        host.commit(next => owner === 'user' ? saveUserProfile(next, { avatarId: '' }) : upsertCharacter(next, { id: owner, avatarId: '' }), '已移除当前头像，历史内容仍保留原头像。');
      }
    } catch (error) { host.toast(error.message || '这项设定暂时无法保存，原资料没有改变。'); }
  }
  async function onChange(event) {
    const element = event.target;
    updateDraft(element);
    if (element.matches('[data-ai-edit-role]')) { ui.selected = element.value; update(); }
    else if (element.matches('[data-ai-default-role]')) { const id = element.value; host.commit(next => setDefaultCharacter(next, id), '全局默认角色已更新。'); update(); }
    else if (element.matches('[data-ai-avatar-owner]')) {
      const file = element.files?.[0], owner = element.dataset.aiAvatarOwner, epoch = host.getBookEpoch();
      if (!file || ui.uploading) return;
      ui.uploading = true; update();
      try {
        const avatarId = await storeAvatar(file);
        if (host.getBookEpoch() !== epoch) throw new Error('手账刚刚恢复或清空，本次头像未关联；请重新上传。');
        if (owner !== 'user' && !book().characters.some(row => row.id === owner)) throw new Error('这个角色刚刚被删除，本次头像未关联。');
        host.commit(next => owner === 'user' ? saveUserProfile(next, { avatarId }) : upsertCharacter(next, { id: owner, avatarId }), '头像已保存到本地，透明背景会保留。');
      } catch (error) { host.toast(error.message || '头像暂时无法保存，原头像没有改变。'); }
      finally { ui.uploading = false; update(); }
    }
  }
  const onToggle = event => { const name = event.target.dataset.aiSettingsSection; if (name) event.target.open ? ui.open.add(name) : ui.open.delete(name); };
  slot.addEventListener('input', eventInput); slot.addEventListener('change', onChange); slot.addEventListener('click', onClick); slot.addEventListener('toggle', onToggle, true);
  function eventInput(event) { updateDraft(event.target); }
  return () => { rememberOpenSections(slot); disposed = true; painters.delete(paint); slot.removeEventListener('input', eventInput); slot.removeEventListener('change', onChange); slot.removeEventListener('click', onClick); slot.removeEventListener('toggle', onToggle, true); };
}
