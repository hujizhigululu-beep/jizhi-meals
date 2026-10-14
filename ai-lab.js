import { DEFAULT_AI_BASE_URL, AIConnectionError, redactAIText, testAIConnection } from './ai-api.js';

// Deliberately disconnected from app state, JSON backup, and every storage API.
const session = {
  baseURL: DEFAULT_AI_BASE_URL, apiKey: '', model: '', open: false, showKey: false,
  busy: false, status: 'idle', message: '只发送一句连接测试消息，等待你的测试。', reply: ''
};
const subscribers = new Set();
let activeController = null;
let requestNumber = 0;
const update = () => { for (const paint of subscribers) paint(); };

export function renderAILab() {
  // A key is never interpolated into markup, attributes, or the app renderer.
  return `<details class="settings-card settings-group ai-lab" data-ai-lab${session.open ? ' open' : ''}>
    <summary class="ai-lab-summary"><span class="ai-lab-heading">🍓 草莓邮局 · AI 连接实验室<small>AI 测试版 · 仅连通性测试</small></span><span class="ai-lab-disclosure" aria-hidden="true"></span></summary>
    <div class="ai-lab-content">
      <p class="ai-lab-intro">给草莓邮局寄一张测试纸条。API 由你配置，模型 ID 手动填写。</p>
      <form class="ai-lab-form" data-ai-form autocomplete="off" novalidate>
        <label class="ai-lab-field" for="ai-base-url">API Base URL<input id="ai-base-url" data-ai-field="baseURL" type="url" inputmode="url" spellcheck="false" autocapitalize="none" autocomplete="off" placeholder="https://www.jiemomo.com/v1"><span class="ai-lab-hint">仅 HTTPS；已有 /v1 不会重复添加，也可填写完整 /chat/completions 地址。</span></label>
        <div class="ai-lab-field"><label for="ai-api-key">API Key · 本次页面内存</label><div class="ai-lab-key-row"><input id="ai-api-key" data-ai-field="apiKey" type="password" spellcheck="false" autocapitalize="none" autocomplete="off" data-lpignore="true" data-1p-ignore="true" placeholder="在这里手动填写测试 Key"><button type="button" class="ai-lab-key-toggle" data-ai-action="show-key" aria-controls="ai-api-key" aria-pressed="false">显示</button></div></div>
        <label class="ai-lab-field" for="ai-model-id">模型 ID<input id="ai-model-id" data-ai-field="model" type="text" maxlength="200" spellcheck="false" autocapitalize="none" autocomplete="off" placeholder="填写中转站支持的模型 ID"></label>
        <div class="ai-lab-actions"><button type="submit" class="ai-lab-test" data-ai-test>测试连接</button><button type="button" class="ai-lab-cancel" data-ai-action="cancel" hidden>取消请求</button><button type="button" class="ai-lab-clear" data-ai-action="clear-key">清除本次密钥</button></div>
      </form>
      <div class="ai-lab-result" data-ai-result data-status="idle" role="status" aria-live="polite" aria-atomic="true"><p class="ai-lab-status" data-ai-status></p><p class="ai-lab-message" data-ai-message></p><div class="ai-lab-reply-wrap" data-ai-reply-wrap hidden><strong>模型实际返回</strong><pre class="ai-lab-reply" data-ai-reply></pre></div></div>
      <aside class="ai-lab-privacy"><strong>一张安心小纸条 ♡</strong><p>前端直连 API 存在密钥风险，请使用独立、低额度测试 Key。Key 仅保留在当前页面内存，刷新后重新填写，不写入手账备份或图片分享。浏览器可能提示保存密码，请选择不保存。</p><p>这里只发送固定连接测试消息，不读取或上传餐食、库存、日记、学习运动等生活记录。不会使用额外代理；若中转站不支持浏览器 CORS 跨域，此版本会如实提示可能原因。</p></aside>
    </div>
  </details>`;
}

async function startTest() {
  if (session.busy) return;
  const number = ++requestNumber;
  const controller = new AbortController();
  activeController = controller;
  session.busy = true;
  session.status = 'loading';
  session.message = '正在寄出测试纸条，最多等待 30 秒；你可以随时取消。';
  session.reply = '';
  update();
  try {
    const result = await testAIConnection({ baseURL: session.baseURL, apiKey: session.apiKey, model: session.model, signal: controller.signal });
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
  session.apiKey = '';
  session.showKey = false;
  session.busy = false;
  session.status = 'idle';
  session.message = '本次密钥与测试回显已清除；重新填写后再测试。';
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
  const labels = { idle: '待测试', loading: '连接中…', success: '✓ 草莓邮局已连接', cancelled: '已取消', error: '连接未成功' };
  const paint = () => {
    for (const [name, input] of Object.entries(fields)) {
      if (input.value !== session[name]) input.value = session[name];
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
    message.textContent = redactAIText(session.message, session.apiKey.trim());
    reply.textContent = redactAIText(session.reply, session.apiKey.trim());
    replyWrap.hidden = !session.reply;
  };
  const onInput = event => {
    const name = event.target?.dataset?.aiField;
    if (Object.hasOwn(fields, name) && event.target === fields[name]) session[name] = event.target.value;
  };
  const onToggle = () => { session.open = lab.open; };
  const onSubmit = event => { event.preventDefault(); event.stopPropagation(); void startTest(); };
  const onClick = event => {
    const button = event.target.closest?.('[data-ai-action]');
    if (!button || !lab.contains(button)) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.aiAction === 'show-key') { session.showKey = !session.showKey; paint(); }
    if (button.dataset.aiAction === 'cancel') { activeController?.abort(); }
    if (button.dataset.aiAction === 'clear-key') clearKey();
  };
  // Capture input before the host app's delegated handlers can re-render it.
  lab.addEventListener('input', onInput, true);
  lab.addEventListener('change', onInput, true);
  lab.addEventListener('toggle', onToggle);
  lab.addEventListener('click', onClick, true);
  form.addEventListener('submit', onSubmit);
  subscribers.add(paint);
  paint();
  return () => {
    subscribers.delete(paint);
    lab.removeEventListener('input', onInput, true);
    lab.removeEventListener('change', onInput, true);
    lab.removeEventListener('toggle', onToggle);
    lab.removeEventListener('click', onClick, true);
    form.removeEventListener('submit', onSubmit);
    // A normal host render keeps the session and any pending probe alive.
    fields.apiKey.value = '';
  };
}

// Clear credentials before a page can be retained in the browser's back cache.
if (typeof window !== 'undefined') window.addEventListener('pagehide', clearKey);
