import { defaultPostOffice, selectedDayText, composeLetterMessages, savePostOfficeField, resetPostOfficeField, putSavedLetter, removeSavedLetter } from './post-office.js';
import { getAIConfig, subscribeAIConfig } from './ai-session.js';
import { renderAILab, mountAILab } from './ai-lab.js';
import { chatCompletions, AIConnectionError, redactAIText } from './ai-api.js';
import { parseDate } from './model.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fields = [
  ['userPersona', '用户设定 · User Persona', '关于你，以及你希望角色怎样称呼你。'],
  ['characterPersona', '角色设定 · Character Persona', '当前角色的人物设定、说话方式与关系。'],
  ['writingPreset', '写作预设 · Writing Preset', '可粘贴 Tavo 的长预设；全文保留，不自动删减。'],
  ['letterTask', '邮局任务指令 · Letter Task', '这封信的任务、语气和写作要求。'],
];
const ui = {
  entry: null, bookEpoch: null, date: '', characterId: 'saihara', drafts: new Map(),
  selection: { diary: false, meals: false, exercise: false, study: false },
  records: '', edited: false, length: '约 800～1200 字',
  busy: false, status: 'idle', message: '先挑一天，再决定寄出哪些日常。',
  preview: null, selectedLetter: null, editorsOpen: false, historyOpen: false,
};
let request = 0;
let activeController;
const painters = new Set();
const update = () => { for (const paint of painters) paint(); };
const getBook = host => host.getState().postOffice || defaultPostOffice();
const character = book => book.characters.find(row => row.id === ui.characterId) || book.characters[0];
const draftKey = field => field === 'characterPersona' ? `${field}:${ui.characterId}` : field;
const savedValue = (book, field) => field === 'characterPersona' ? character(book).persona : book[field];
function draft(book, field) {
  const key = draftKey(field), saved = savedValue(book, field);
  if (!ui.drafts.has(key)) ui.drafts.set(key, { value: saved, dirty: false });
  const item = ui.drafts.get(key);
  if (!item.dirty) item.value = saved;
  return item;
}
function currentConfig(book) {
  const chosen = character(book);
  return { ...book, userPersona: draft(book, 'userPersona').value,
    writingPreset: draft(book, 'writingPreset').value, letterTask: draft(book, 'letterTask').value,
    characters: book.characters.map(row => row.id === chosen.id ? { ...row, persona: draft(book, 'characterPersona').value } : row) };
}
function messages(host) {
  return composeLetterMessages({ config: currentConfig(getBook(host)), characterId: ui.characterId,
    date: ui.date, recordsText: ui.records, lengthHint: ui.length });
}
function totalCharacters(host) { return messages(host).reduce((n, row) => n + row.content.length, 0); }
function setStatus(status, message) { ui.status = status; ui.message = message; update(); }

async function generate(host) {
  if (ui.busy) return;
  if (!parseDate(ui.date)) { setStatus('error', '请选择有效日期。'); return; }
  if (!ui.records.trim()) { setStatus('error', '请勾选本次生活内容，或在发送预览里手动写一点日常。'); return; }
  const config = getAIConfig();
  if (!config.apiKey || !config.model) { setStatus('error', '请先展开 API 连接设置，填写本次密钥并读取 / 选择模型。'); return; }
  let payload;
  try {
    payload = messages(host);
    const count = payload.reduce((n, row) => n + row.content.length, 0);
    if (count >= 30000 && !await host.ask('这封信带着较长的预设', `本次共有 ${count.toLocaleString()} 个字符。中转站模型的上下文容量未知，可能超限。不会删除或截短任何内容；可以返回调整，或保持全文发送。`, '保持全文并发送')) return;
    // A confirmation can outlive a changed date, draft, or API configuration.
    if (JSON.stringify(payload) !== JSON.stringify(messages(host)) || Object.keys(config).some(key => config[key] !== getAIConfig()[key])) {
      setStatus('error', '发送内容或连接配置刚刚变化，请重新确认后再生成。'); return;
    }
  } catch (error) { setStatus('error', error.message || '提示词配置暂时无法使用。'); return; }
  const snapshot = { date: ui.date, characterName: character(getBook(host)).name };
  const number = ++request;
  const controller = new AbortController(); activeController = controller;
  ui.busy = true;
  setStatus('loading', '正在等第一封来信，最多等待 120 秒。可以随时取消。');
  try {
    const result = await chatCompletions({ ...config, messages: payload, signal: controller.signal, timeoutMs: 120000 });
    if (number !== request) return;
    ui.preview = { ...snapshot, body: result.text, generatedAt: new Date().toISOString(), incomplete: result.incomplete, saved: false, savedId: null };
    setStatus(result.incomplete ? 'incomplete' : 'success', result.incomplete ? '模型因长度限制停止，来信尚未完整。请调整篇幅或上下文后重新生成；正文没有被网页裁切。' : '来信到了。先读一读，喜欢的话再收藏；现在还没有写入本地。');
  } catch (error) {
    if (number !== request) return;
    setStatus(error instanceof AIConnectionError && error.code === 'cancelled' ? 'cancelled' : 'error', error instanceof AIConnectionError ? error.message : '这次来信暂时没能送达，手账记录没有改变。');
  } finally {
    if (number === request) { ui.busy = false; activeController = null; update(); }
  }
}

export function mountPostOffice(slot, host) {
  const book = getBook(host);
  const epoch = host.getBookEpoch();
  if (ui.bookEpoch !== epoch) {
    ++request; activeController?.abort(); activeController = null;
    ui.bookEpoch = epoch; ui.entry = null; ui.drafts.clear();
    ui.preview = null; ui.selectedLetter = null; ui.records = ''; ui.edited = false;
    ui.busy = false; ui.status = 'idle'; ui.message = '先挑一天，再决定寄出哪些日常。';
  }
  if (ui.entry !== slot.dataset.entry) {
    ui.entry = slot.dataset.entry; ui.date = host.getSelectedDate();
    ui.selection = { diary: false, meals: false, exercise: false, study: false };
    ui.records = ''; ui.edited = false;
  }
  if (!book.characters.some(row => row.id === ui.characterId)) ui.characterId = book.characters[0].id;
  const promptHTML = fields.map(([name, title, hint]) => `<section class="post-prompt-card"><label for="post-${name}">${title}</label><p>${hint}</p><textarea id="post-${name}" data-post-prompt="${name}" rows="7" spellcheck="false" autocomplete="off"></textarea><div class="post-prompt-tools"><span data-post-field-status="${name}"></span><button type="button" class="pill" data-post-prompt-save="${name}">保存这项</button><button type="button" class="text-button" data-post-prompt-reset="${name}">恢复默认</button></div></section>`).join('');
  slot.innerHTML = `<section class="page post-office-page" data-post-office>
    <div class="section-heading"><div><div class="eyebrow">STRAWBERRY POST OFFICE · AI 测试版</div><h1>🍓 草莓邮局</h1><p class="subheading">第一封来信 · 把想寄出的日常，放进信封里。</p></div></div>
    <div class="post-page-links"><button class="pill" data-page="calendar">回到餐食日记录</button><button class="pill" data-page="settings">备份与我的设置</button></div>
    <section class="post-paper post-envelope"><div class="post-stamp" aria-hidden="true">🍓<small>第一封来信</small></div><div class="post-choices"><label for="post-date">来信对应的日期<input id="post-date" type="date" min="0001-01-01" max="9999-12-31"></label><label for="post-character">由谁写这封信<select id="post-character">${book.characters.map(row => `<option value="${esc(row.id)}">${esc(row.name)}</option>`).join('')}</select></label></div><p class="post-small">两位角色提供简要示例，人物设定与关系由你完善。切换角色会保留各自已保存的设定。</p><div data-post-ai-connection></div><p class="post-connection-summary" data-post-connection></p></section>
    <details class="post-paper post-config" data-post-editors${ui.editorsOpen ? ' open' : ''}><summary>✎ 四张独立的提示词纸条</summary><p class="post-small">每项分别保存。生成时使用当前编辑内容；未保存的草稿刷新后会丢失。长预设保持全文，Key 不会混在这里。</p>${promptHTML}</details>
    <section class="post-paper"><h2>这次想寄出什么</h2><p class="post-small">默认全部不选；只读取所选日期。手动补充的内容也会随预览发送。</p><div class="post-record-choices">${[['diary','日记（含心情、小确幸）'],['meals','餐食'],['exercise','运动'],['study','学习']].map(([id,label]) => `<label><input type="checkbox" data-post-select="${id}">${label}</label>`).join('')}</div><label class="post-field" for="post-record-preview">本次要发送的生活记录 · 可以直接修改<textarea id="post-record-preview" rows="9" spellcheck="false" autocomplete="off" placeholder="勾选想分享的记录，或自己补充一段日常。"></textarea></label><p data-post-record-summary class="post-small"></p><label class="post-field" for="post-length">大致来信长度<input id="post-length" type="text" maxlength="200" placeholder="例如：约 800～1200 字"></label><p class="post-small" data-post-context></p><details class="post-full-request"><summary>查看本次完整提示词顺序</summary><pre data-post-request></pre></details><p class="post-privacy">点击生成后，四项提示词、所选日期和这里的发送草稿将交给你配置的第三方 API。未选记录和库存不会自动上传；模型列表读取只发送鉴权信息。</p><div class="post-send-tools"><button type="button" class="primary" data-post-action="generate">🍓 请寄来一封信</button><button type="button" class="secondary" data-post-action="cancel" hidden>取消等待</button></div><div class="post-status" role="status" aria-live="polite" data-post-status="idle"></div></section>
    <section class="post-paper post-letter-preview" data-post-preview hidden><div class="post-letter-heading"><h2>一封尚未收藏的来信</h2><span data-post-preview-meta></span></div><pre class="post-letter-body" data-post-letter-body></pre><div class="post-send-tools"><button type="button" class="primary" data-post-action="save-letter">收藏这封信</button><button type="button" class="secondary" data-post-action="generate">重新生成</button></div><p class="post-small">只有点收藏才保存；重新生成也需要你主动点击。</p></section>
    <details class="post-paper post-history" data-post-history${ui.historyOpen ? ' open' : ''}><summary>✉ 来信收藏 · ${book.letters.length} 封</summary><p class="post-small">收藏保存在当前浏览器，并进入 JSON 备份。删除来信不修改原始日记。</p><div class="post-history-list">${book.letters.length ? [...book.letters].sort((a,b) => b.generatedAt.localeCompare(a.generatedAt)).map(row => `<article><span><strong>${esc(row.characterName)}</strong><small>${esc(row.date)} · ${esc(new Date(row.generatedAt).toLocaleString('zh-CN', { hour12: false }))}</small></span><div><button type="button" class="pill" data-post-action="view-letter" data-letter-id="${esc(row.id)}">读信</button><button type="button" class="text-button danger" data-post-action="delete-letter" data-letter-id="${esc(row.id)}">删除</button></div></article>`).join('') : '<p class="post-empty">还没有收藏。第一封信可以慢慢等，慢慢挑 ♡</p>'}</div><div data-post-saved-view hidden><h3 data-post-saved-title></h3><pre class="post-letter-body" data-post-saved-body></pre></div></details>
    <p class="footer-note">机智定食-ai测试版本 · 草莓邮局第二期<br>这一封，先认真写给今天。</p>
  </section>`;
  const root = slot.querySelector('[data-post-office]');
  const connection = root.querySelector('[data-post-ai-connection]');
  connection.innerHTML = renderAILab();
  const destroyLab = mountAILab(connection);
  const dateInput = root.querySelector('#post-date'), roleInput = root.querySelector('#post-character');
  const recordInput = root.querySelector('#post-record-preview'), lengthInput = root.querySelector('#post-length');
  dateInput.value = ui.date; roleInput.value = ui.characterId; recordInput.value = ui.records; lengthInput.value = ui.length;
  const promptInputs = Object.fromEntries(fields.map(([name]) => [name, root.querySelector(`[data-post-prompt="${name}"]`)]));
  const paintPrompts = () => { const current = getBook(host); for (const [name, input] of Object.entries(promptInputs)) {
    const item = draft(current, name); if (input.value !== item.value) input.value = item.value;
    root.querySelector(`[data-post-field-status="${name}"]`).textContent = item.dirty ? '这项有未保存的编辑' : '本地已保存 / 默认示例';
  } };
  function paint() {
    const config = getAIConfig();
    if (ui.preview?.savedId) {
      const exists = getBook(host).letters.some(row => row.id === ui.preview.savedId &&
        ['body','date','characterName','generatedAt'].every(field => row[field] === ui.preview[field]));
      if (ui.preview.saved && !exists) ui.message = '这封预览的收藏已移除，仍可以重新收藏。';
      ui.preview.saved = exists;
    }
    root.querySelector('[data-post-connection]').textContent = config.model ? `本次模型：${redactAIText(config.model, config.apiKey)} · 密钥${config.apiKey ? '已在页面内存' : '尚未填写'}` : '尚未选择模型。展开连接设置填写 Key，模型列表会自动读取。';
    root.querySelectorAll('[data-post-select]').forEach(input => { input.checked = ui.selection[input.dataset.postSelect]; input.disabled = ui.busy; });
    for (const input of [dateInput, roleInput, recordInput, lengthInput, ...Object.values(promptInputs)]) input.disabled = ui.busy;
    root.querySelectorAll('[data-post-prompt-save],[data-post-prompt-reset]').forEach(button => { button.disabled = ui.busy; });
    root.querySelectorAll('[data-post-action="generate"]').forEach(button => { button.disabled = ui.busy; });
    root.querySelector('[data-post-action="cancel"]').hidden = !ui.busy;
    const status = root.querySelector('[data-post-status]'); status.dataset.postStatus = ui.status; status.textContent = ui.message; status.setAttribute('aria-busy', String(ui.busy));
    root.querySelector('[data-post-record-summary]').textContent = `${ui.records.length.toLocaleString()} 字符 · ${ui.edited ? '含你的手动编辑，以此框全文为准' : '来自已勾选的当日记录'} · 未勾选项不自动读取。`;
    try {
      const count = totalCharacters(host);
      root.querySelector('[data-post-context]').textContent = `完整输入共 ${count.toLocaleString()} 个字符。${count >= 30000 ? '预设较长，可能超出模型上下文；发送前会提醒，绝不自动删减。' : '模型上下文容量由中转站决定；网页不删减提示词。'}`;
      root.querySelector('[data-post-request]').textContent = messages(host).map(row => `[${row.role}]\n${row.content}`).join('\n\n');
    } catch (error) {
      root.querySelector('[data-post-context]').textContent = error.message;
      root.querySelector('[data-post-request]').textContent = '';
    }
    const preview = root.querySelector('[data-post-preview]'); preview.hidden = !ui.preview;
    if (ui.preview) {
      preview.querySelector('h2').textContent = ui.preview.saved ? '已收藏的来信' : '一封尚未收藏的来信';
      root.querySelector('[data-post-preview-meta]').textContent = `${ui.preview.date} · ${ui.preview.characterName}`;
      root.querySelector('[data-post-letter-body]').textContent = ui.preview.body;
      const save = root.querySelector('[data-post-action="save-letter"]'); save.disabled = ui.busy || ui.preview.saved; save.textContent = ui.preview.saved ? '这封信已收藏 ♡' : '收藏这封信';
    }
    const saved = getBook(host).letters.find(row => row.id === ui.selectedLetter);
    root.querySelector('[data-post-saved-view]').hidden = !saved;
    if (saved) { root.querySelector('[data-post-saved-title]').textContent = `${saved.date} · ${saved.characterName}`; root.querySelector('[data-post-saved-body]').textContent = saved.body; }
    paintPrompts();
  }
  let repaintTimer;
  const onInput = event => {
    const field = event.target.dataset.postPrompt;
    if (field && promptInputs[field] === event.target) { Object.assign(draft(getBook(host), field), { value: event.target.value, dirty: true }); }
    if (event.target === recordInput) { ui.records = recordInput.value; ui.edited = true; }
    if (event.target === lengthInput) ui.length = lengthInput.value;
    clearTimeout(repaintTimer); repaintTimer = setTimeout(paint, 160);
  };
  const changeRecords = async (nextDate, nextSelection) => {
    if (ui.busy) return;
    if (!parseDate(nextDate)) { dateInput.value = ui.date; host.toast('请选择有效日期。'); return; }
    if (ui.edited && !await host.ask('重新整理发送草稿？', '这会按新日期和勾选内容重新生成预览，替换当前手动补充。取消可以保留原草稿。', '重新整理')) { dateInput.value = ui.date; paint(); return; }
    ui.date = nextDate; ui.selection = nextSelection; ui.edited = false;
    ui.records = Object.values(nextSelection).some(Boolean) ? selectedDayText(host.getState(), ui.date, nextSelection) : '';
    recordInput.value = ui.records; dateInput.value = ui.date; paint();
  };
  const onChange = event => {
    if (event.target === roleInput) { ui.characterId = roleInput.value; paintPrompts(); paint(); }
    else if (event.target === dateInput) void changeRecords(dateInput.value, { ...ui.selection });
    else if (event.target.dataset.postSelect) void changeRecords(ui.date, { ...ui.selection, [event.target.dataset.postSelect]: event.target.checked });
  };
  const onClick = async event => {
    const button = event.target.closest('button'); if (!button || !root.contains(button)) return;
    const saveField = button.dataset.postPromptSave, resetField = button.dataset.postPromptReset, action = button.dataset.postAction;
    if (!saveField && !resetField && !action) return;
    event.preventDefault(); event.stopPropagation();
    try {
      if (saveField) {
        const item = draft(getBook(host), saveField);
        if (host.commit(state => savePostOfficeField(state, saveField, item.value, ui.characterId), '这项提示词已单独收好 ♡')) item.dirty = false;
      } else if (resetField) {
        if (!await host.ask('恢复这一项默认值？', '只替换这项提示词。其他三项、其他角色和历史来信都保留。', '恢复这一项')) return;
        if (host.commit(state => resetPostOfficeField(state, resetField, ui.characterId), '这一项已恢复默认。')) ui.drafts.delete(draftKey(resetField));
      } else if (action === 'generate') { void generate(host); }
      else if (action === 'cancel') { activeController?.abort(); }
      else if (action === 'save-letter') {
        const letter = ui.preview; if (!letter || letter.saved || ui.busy) return;
        if (letter.incomplete && !await host.ask('这封来信尚未完整', '模型因长度限制停止。仍要收藏目前显示的这部分正文吗？', '收藏当前正文')) return;
        if (ui.preview !== letter) { host.toast('来信预览刚刚变化，请重新确认。'); return; }
        let savedLetter;
        if (host.commit(state => { savedLetter = putSavedLetter(state, { date: letter.date, characterName: letter.characterName, body: letter.body, generatedAt: letter.generatedAt }); }, '来信已收藏，原日记没有改变 ♡')) { letter.saved = true; letter.savedId = savedLetter.id; ui.historyOpen = true; ui.message = '这封来信已收藏，并会进入 JSON 备份。原日记没有改变。'; }
      } else if (action === 'view-letter') { ui.selectedLetter = button.dataset.letterId; paint(); }
      else if (action === 'delete-letter') {
        const id = button.dataset.letterId;
        if (!await host.ask('删除这封收藏的来信？', '只删除来信，不修改原日记。若想保留，请先导出 JSON 备份。', '删除来信')) return;
        if (host.commit(state => removeSavedLetter(state, id), '这封来信已从收藏移除。') && ui.selectedLetter === id) ui.selectedLetter = null;
      }
    } catch (error) { host.toast(error.message || '这次操作没有保存，请检查本地存储。'); }
  };
  const onToggle = event => {
    if (event.target.matches('[data-post-editors]')) ui.editorsOpen = event.target.open;
    if (event.target.matches('[data-post-history]')) ui.historyOpen = event.target.open;
  };
  let previous = getAIConfig();
  const unsubscribe = subscribeAIConfig(() => {
    const current = getAIConfig();
    if (ui.busy && ['baseURL','apiKey','model'].some(key => current[key] !== previous[key])) {
      ++request; activeController?.abort(); activeController = null; ui.busy = false;
      setStatus('cancelled', '连接配置或密钥已变化，本次来信生成已取消。请重新确认后再寄出。');
    }
    previous = current; paint();
  });
  root.addEventListener('input', onInput); root.addEventListener('change', onChange);
  root.addEventListener('click', onClick); root.addEventListener('toggle', onToggle, true);
  painters.add(paint); paint();
  return () => {
    clearTimeout(repaintTimer); painters.delete(paint); unsubscribe(); destroyLab?.();
    root.removeEventListener('input', onInput); root.removeEventListener('change', onChange);
    root.removeEventListener('click', onClick); root.removeEventListener('toggle', onToggle, true);
    // A pending request is cancelled when leaving the page, not retried in background.
    if (ui.busy) { ++request; activeController?.abort(); activeController = null; ui.busy = false; ui.status = 'cancelled'; ui.message = '已离开邮局，本次生成取消。'; }
  };
}
if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { ++request; activeController?.abort(); ui.preview = null; ui.records = ''; });
