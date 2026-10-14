import { AIConnectionError, listAIModels, modelsURL, redactAIText, testAIConnection } from './ai-api.js';
import { getAIConfig, setAIConfig, subscribeAIConfig, clearAIKey } from './ai-session.js';

// UI state and model IDs stay in this page's memory, separate from all backups.
const session = {
  open: false, showKey: false, busy: false, status: 'idle',
  message: '只发送一句连接测试消息，等待你的测试。', reply: '',
  models: [], modelFilter: '', modelsBusy: false, modelsStatus: 'idle',
  modelsMessage: '填写接口与 Key 后自动读取可用模型；也可点击「读取模型」。'
};
const subscribers = new Set();
let activeController = null;
let requestNumber = 0;
let modelsController = null;
let modelsRequestNumber = 0;
let modelTimer = null;
let discoveryStamp = '';
let previousConfig = getAIConfig();
const update = () => { for (const paint of subscribers) { try { paint(); } catch {} } };

function cancelModels() {
  clearTimeout(modelTimer);
  modelTimer = null;
  ++modelsRequestNumber;
  modelsController?.abort();
  modelsController = null;
  session.modelsBusy = false;
}

function resetModels() {
  cancelModels();
  discoveryStamp = '';
  session.models = [];
  session.modelFilter = '';
  session.modelsStatus = 'idle';
  session.modelsMessage = '填写接口与 Key 后自动读取可用模型；也可点击「读取模型」。';
}

function scheduleModels() {
  clearTimeout(modelTimer);
  const config = getAIConfig();
  if (!config.apiKey.trim() || /[\u0000-\u001f\u007f]/.test(config.apiKey.trim())) return;
  try { modelsURL(config.baseURL); } catch { return; }
  const stamp = `${config.baseURL}\u0000${config.apiKey}`;
  if (discoveryStamp === stamp || session.modelsBusy) return;
  session.modelsMessage = '即将自动读取模型 ID；不会发送任何生活记录。';
  modelTimer = setTimeout(() => { modelTimer = null; void startModels(); }, 750);
}

subscribeAIConfig(config => {
  const providerChanged = config.baseURL !== previousConfig.baseURL || config.apiKey !== previousConfig.apiKey;
  previousConfig = config;
  if (providerChanged) {
    resetModels();
    // Changing or clearing credentials must also discard an in-flight old reply.
    ++requestNumber;
    activeController?.abort();
    activeController = null;
    session.busy = false;
    session.showKey = false;
    session.reply = '';
    session.status = 'idle';
    session.message = '接口或密钥已更新，连接测试尚未开始。';
    scheduleModels();
  }
  update();
});

export function renderAILab() {
  // Credentials and model IDs are never interpolated into markup/attributes.
  return `<details class="settings-card settings-group ai-lab" data-ai-lab${session.open ? ' open' : ''}>
    <summary class="ai-lab-summary"><span class="ai-lab-heading">🍓 草莓邮局 · AI 连接实验室<small>AI 测试版 · 连接与模型选择</small></span><span class="ai-lab-disclosure" aria-hidden="true"></span></summary>
    <div class="ai-lab-content">
      <p class="ai-lab-intro">接口与 Key 填好后，邮局会自动读取模型 ID。选择模型即可测试连接或生成来信；不支持模型列表的中转站仍可手动填写。</p>
      <form class="ai-lab-form" data-ai-form autocomplete="off" novalidate>
        <label class="ai-lab-field" for="ai-base-url">API Base URL<input id="ai-base-url" data-ai-field="baseURL" type="url" inputmode="url" spellcheck="false" autocapitalize="none" autocomplete="off" placeholder="https://www.jiemomo.com/v1"><span class="ai-lab-hint">仅 HTTPS；已有 /v1 不会重复添加，也可填写完整 /chat/completions 地址。</span></label>
        <div class="ai-lab-field"><label for="ai-api-key">API Key · 本次页面内存</label><div class="ai-lab-key-row"><input id="ai-api-key" data-ai-field="apiKey" type="password" spellcheck="false" autocapitalize="none" autocomplete="off" data-lpignore="true" data-1p-ignore="true" placeholder="在这里手动填写测试 Key"><button type="button" class="ai-lab-key-toggle" data-ai-action="show-key" aria-controls="ai-api-key" aria-pressed="false">显示</button></div></div>
        <div class="ai-lab-model-tools">
          <div class="ai-lab-actions"><button type="button" class="ai-lab-clear" data-ai-action="read-models">读取模型</button><button type="button" class="ai-lab-cancel" data-ai-action="cancel-models" hidden>取消读取</button></div>
          <p class="ai-lab-hint" data-ai-models-status data-status="idle" role="status" aria-live="polite"></p>
          <div data-ai-model-catalog hidden><label class="ai-lab-field" for="ai-model-filter">搜索模型<input id="ai-model-filter" data-ai-model-filter type="search" autocomplete="off" spellcheck="false" placeholder="输入模型名称筛选"></label><label class="ai-lab-field" for="ai-model-list">选择可用模型<select id="ai-model-list" data-ai-models aria-describedby="ai-model-count"></select></label><span class="ai-lab-hint" id="ai-model-count" data-ai-model-count></span></div>
        </div>
        <label class="ai-lab-field" for="ai-model-id">当前模型 ID · 可手动填写<input id="ai-model-id" data-ai-field="model" type="text" maxlength="200" spellcheck="false" autocapitalize="none" autocomplete="off" placeholder="自动选择模型，或手动填写模型 ID"><span class="ai-lab-hint">模型列表仅代表服务提供的 ID，不保证每个模型支持文字来信。读取失败不会清除已填模型。</span></label>
        <div class="ai-lab-actions"><button type="submit" class="ai-lab-test" data-ai-test>测试连接</button><button type="button" class="ai-lab-cancel" data-ai-action="cancel" hidden>取消请求</button><button type="button" class="ai-lab-clear" data-ai-action="clear-key">清除本次密钥</button></div>
      </form>
      <div class="ai-lab-result" data-ai-result data-status="idle" role="status" aria-live="polite" aria-atomic="true"><p class="ai-lab-status" data-ai-status></p><p class="ai-lab-message" data-ai-message></p><div class="ai-lab-reply-wrap" data-ai-reply-wrap hidden><strong>模型实际返回</strong><pre class="ai-lab-reply" data-ai-reply></pre></div></div>
      <aside class="ai-lab-privacy"><strong>一张安心小纸条 ♡</strong><p>前端直连 API 存在密钥风险，请使用独立、低额度测试 Key。Key 仅保留在当前页面内存，刷新后重新填写，不写入手账备份或图片分享。浏览器可能提示保存密码，请选择不保存。</p><p>「读取模型」只读取模型 ID；「测试连接」只发送固定测试消息，不读取生活记录。在草莓邮局点击生成来信时，才会发送你确认的提示词和本次记录预览。不会使用额外代理；跨域与网络失败会如实提示。</p></aside>
    </div>
  </details>`;
}

async function startModels() {
  if (session.modelsBusy || session.busy) return;
  clearTimeout(modelTimer);
  modelTimer = null;
  const config = getAIConfig();
  discoveryStamp = `${config.baseURL}\u0000${config.apiKey}`;
  const number = ++modelsRequestNumber;
  const controller = new AbortController();
  modelsController = controller;
  session.modelsBusy = true;
  session.modelsStatus = 'loading';
  session.modelsMessage = '正在读取模型列表，最多等待 30 秒；只读取模型 ID。';
  update();
  try {
    const result = await listAIModels({ ...config, signal: controller.signal });
    if (number !== modelsRequestNumber) return;
    session.models = result.models;
    session.modelsStatus = 'success';
    session.modelsMessage = `已读取 ${result.models.length} 个模型（HTTP ${result.status}）。可搜索后选择。`;
    const current = getAIConfig();
    // Preserve a model changed by the user while the list was loading.
    if (!current.model.trim() || (current.model === config.model && !result.models.includes(current.model.trim()))) setAIConfig({ model: result.models[0] });
  } catch (error) {
    if (number !== modelsRequestNumber) return;
    session.modelsStatus = error instanceof AIConnectionError && error.code === 'cancelled' ? 'cancelled' : 'error';
    session.modelsMessage = `${error instanceof AIConnectionError ? error.message : '模型列表暂时无法读取。'} 已填模型仍可使用，也可手动填写模型 ID。`;
  } finally {
    if (number === modelsRequestNumber) {
      modelsController = null;
      session.modelsBusy = false;
      update();
    }
  }
}

async function startTest() {
  if (session.busy) return;
  // A fixed connection probe gets priority over a delayed metadata read.
  clearTimeout(modelTimer);
  modelTimer = null;
  const number = ++requestNumber;
  const controller = new AbortController();
  activeController = controller;
  session.busy = true;
  session.status = 'loading';
  session.message = '正在寄出测试纸条，最多等待 30 秒；你可以随时取消。';
  session.reply = '';
  update();
  try {
    const result = await testAIConnection({ ...getAIConfig(), signal: controller.signal });
    if (number !== requestNumber) return;
    session.status = 'success';
    session.message = `连接成功（HTTP ${result.status}）。下方是模型实际返回的文本。`;
    session.reply = result.text;
  } catch (error) {
    if (number !== requestNumber) return;
    session.status = error instanceof AIConnectionError && error.code === 'cancelled' ? 'cancelled' : 'error';
    session.message = error instanceof AIConnectionError ? error.message : '实验模块暂时无法完成测试，请刷新后重试。';
    session.reply = '';
  } finally {
    if (number === requestNumber) {
      session.busy = false;
      activeController = null;
      update();
    }
  }
}

function clearKey() {
  ++requestNumber;
  activeController?.abort();
  activeController = null;
  resetModels();
  clearAIKey();
  session.showKey = false;
  session.busy = false;
  session.status = 'idle';
  session.message = '本次密钥、模型列表与测试回显已清除；重新填写后再测试。';
  session.reply = '';
  update();
}

export function mountAILab(root) {
  const lab = root?.matches?.('[data-ai-lab]') ? root : root?.querySelector?.('[data-ai-lab]');
  if (!lab) return () => {};
  const fields = {
    baseURL: lab.querySelector('[data-ai-field="baseURL"]'),
    apiKey: lab.querySelector('[data-ai-field="apiKey"]'),
    model: lab.querySelector('[data-ai-field="model"]')
  };
  const form = lab.querySelector('[data-ai-form]');
  const status = lab.querySelector('[data-ai-status]');
  const message = lab.querySelector('[data-ai-message]');
  const reply = lab.querySelector('[data-ai-reply]');
  const replyWrap = lab.querySelector('[data-ai-reply-wrap]');
  const result = lab.querySelector('[data-ai-result]');
  const testButton = lab.querySelector('[data-ai-test]');
  const cancelButton = lab.querySelector('[data-ai-action="cancel"]');
  const showButton = lab.querySelector('[data-ai-action="show-key"]');
  const readButton = lab.querySelector('[data-ai-action="read-models"]');
  const cancelModelsButton = lab.querySelector('[data-ai-action="cancel-models"]');
  const modelsStatus = lab.querySelector('[data-ai-models-status]');
  const modelCatalog = lab.querySelector('[data-ai-model-catalog]');
  const filter = lab.querySelector('[data-ai-model-filter]');
  const modelSelect = lab.querySelector('[data-ai-models]');
  const modelCount = lab.querySelector('[data-ai-model-count]');
  const labels = { idle: '待测试', loading: '连接中…', success: '✓ 草莓邮局已连接', cancelled: '已取消', error: '连接未成功' };
  let optionStamp = '';
  const paint = () => {
    const config = getAIConfig();
    for (const [name, input] of Object.entries(fields)) {
      if (input.value !== config[name]) input.value = config[name];
      input.disabled = session.busy;
    }
    fields.apiKey.type = session.showKey ? 'text' : 'password';
    showButton.textContent = session.showKey ? '隐藏' : '显示';
    showButton.setAttribute('aria-pressed', String(session.showKey));
    testButton.disabled = session.busy;
    testButton.textContent = session.busy ? '连接中…' : '测试连接';
    cancelButton.hidden = !session.busy;
    result.dataset.status = session.status;
    result.setAttribute('aria-busy', String(session.busy));
    status.textContent = labels[session.status];
    message.textContent = redactAIText(session.message, config.apiKey.trim());
    reply.textContent = redactAIText(session.reply, config.apiKey.trim());
    replyWrap.hidden = !session.reply;
    readButton.disabled = session.modelsBusy || session.busy;
    readButton.textContent = session.modelsBusy ? '读取中…' : '读取模型';
    cancelModelsButton.hidden = !session.modelsBusy;
    modelsStatus.dataset.status = session.modelsStatus;
    modelsStatus.textContent = redactAIText(session.modelsMessage, config.apiKey.trim());
    modelCatalog.hidden = !session.models.length;
    if (filter.value !== session.modelFilter) filter.value = session.modelFilter;
    filter.disabled = session.busy;
    modelSelect.disabled = session.busy;
    const visible = session.models.filter(id => id.toLocaleLowerCase().includes(session.modelFilter.trim().toLocaleLowerCase()));
    const stamp = JSON.stringify([visible, config.model]);
    if (optionStamp !== stamp) {
      optionStamp = stamp;
      modelSelect.replaceChildren();
      const prompt = lab.ownerDocument.createElement('option');
      prompt.value = '';
      prompt.textContent = visible.length ? '选择模型' : '没有匹配的模型';
      modelSelect.append(prompt);
      for (const id of visible) {
        const option = lab.ownerDocument.createElement('option');
        option.value = id;
        option.textContent = id;
        modelSelect.append(option);
      }
      modelSelect.value = visible.includes(config.model.trim()) ? config.model.trim() : '';
    }
    modelCount.textContent = `显示 ${visible.length} / ${session.models.length} 个模型；当前模型见下方输入框。`;
  };
  const onInput = event => {
    const name = event.target?.dataset?.aiField;
    if (Object.hasOwn(fields, name) && event.target === fields[name]) setAIConfig({ [name]: event.target.value });
    if (event.target === filter) { session.modelFilter = filter.value; paint(); }
    if (event.target === modelSelect && modelSelect.value) setAIConfig({ model: modelSelect.value });
  };
  const onToggle = () => { session.open = lab.open; };
  const onSubmit = event => { event.preventDefault(); event.stopPropagation(); void startTest(); };
  const onClick = event => {
    const button = event.target.closest?.('[data-ai-action]');
    if (!button || !lab.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.aiAction === 'show-key') { session.showKey = !session.showKey; paint(); }
    if (button.dataset.aiAction === 'cancel') activeController?.abort();
    if (button.dataset.aiAction === 'clear-key') clearKey();
    if (button.dataset.aiAction === 'read-models') void startModels();
    if (button.dataset.aiAction === 'cancel-models') {
      cancelModels();
      session.modelsStatus = 'cancelled';
      session.modelsMessage = '模型读取已取消，已填模型仍可使用。';
      update();
    }
  };
  lab.addEventListener('input', onInput, true);
  lab.addEventListener('change', onInput, true);
  lab.addEventListener('toggle', onToggle);
  lab.addEventListener('click', onClick, true);
  form.addEventListener('submit', onSubmit);
  subscribers.add(paint);
  scheduleModels();
  paint();
  return () => {
    subscribers.delete(paint);
    lab.removeEventListener('input', onInput, true);
    lab.removeEventListener('change', onInput, true);
    lab.removeEventListener('toggle', onToggle);
    lab.removeEventListener('click', onClick, true);
    form.removeEventListener('submit', onSubmit);
    // Normal navigation retains the shared in-memory configuration.
    fields.apiKey.value = '';
  };
}

if (typeof window !== 'undefined') window.addEventListener('pagehide', clearKey);
