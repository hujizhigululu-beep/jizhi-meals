/** Lightweight OpenAI-compatible requests. No app state or persistent storage. */
export const DEFAULT_AI_BASE_URL = 'https://www.jiemomo.com/v1';
export const AI_TEST_MESSAGE = '你好，请用一句话回复：草莓邮局连接成功';

export class AIConnectionError extends Error {
  constructor(code, message, status = null) {
    super(message);
    this.name = 'AIConnectionError';
    this.code = code;
    this.status = status;
  }
}

function apiURL(baseURL, target) {
  const value = String(baseURL ?? '').trim();
  let url;
  try { url = new URL(value); }
  catch { throw new AIConnectionError('config', '请填写完整的 HTTPS API Base URL。'); }
  if (url.protocol !== 'https:') throw new AIConnectionError('config', '为保护密钥，仅允许 HTTPS 接口地址。');
  if (url.username || url.password || value.includes('?') || value.includes('#')) {
    throw new AIConnectionError('config', '接口地址不能包含账号、密码、查询参数或片段。密钥请只填写在密钥框。');
  }
  // The supplied base owns the version prefix; never add another /v1.
  const path = url.pathname.replace(/\/+$/, '').replace(/\/(?:chat\/completions|models)$/, '');
  url.pathname = `${path}/${target}`;
  return url.href;
}

export const chatCompletionsURL = baseURL => apiURL(baseURL, 'chat/completions');
export const modelsURL = baseURL => apiURL(baseURL, 'models');

export function redactAIText(value, apiKey = '') {
  let text = String(value ?? '');
  if (apiKey) text = text.split(apiKey).join('【密钥已隐藏】');
  return text;
}

export function httpConnectionError(status) {
  const suffix = `（HTTP ${status}）`;
  if (status === 401 || status === 403) return new AIConnectionError('auth', `鉴权未通过：请检查测试密钥、权限或中转站访问限制。${suffix}`, status);
  if (status === 400 || status === 422) return new AIConnectionError('model', `接口未接受请求：请检查模型 ID 是否完整、该密钥是否有模型权限，以及接口是否支持 Chat Completions。${suffix}`, status);
  if (status === 404) return new AIConnectionError('model', `找不到接口或模型：请检查 API Base URL 和模型 ID。${suffix}`, status);
  if (status === 429) return new AIConnectionError('limit', `请求受限：可能是额度不足或请求过于频繁，请到中转站检查。${suffix}`, status);
  if (status >= 500) return new AIConnectionError('server', `中转站或上游模型暂时不可用，请稍后重试。${suffix}`, status);
  return new AIConnectionError('http', `接口返回未成功的状态，请检查服务配置。${suffix}`, status);
}

function validateKey(apiKey) {
  const key = String(apiKey ?? '').trim();
  if (!key || /[\u0000-\u001f\u007f]/.test(key)) throw new AIConnectionError('config', '请填写有效的测试 API Key。');
  return key;
}

function validateModel(model) {
  const id = String(model ?? '').trim();
  if (!id || id.length > 200 || /[\u0000-\u001f\u007f]/.test(id)) throw new AIConnectionError('config', '请选择或填写有效的模型 ID（最多 200 个字符）。');
  return id;
}

function replyText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter(part => part?.type === 'text' && typeof part.text === 'string').map(part => part.text).join('\n');
  return '';
}

async function requestJSON({ endpoint, apiKey, method, body, signal, timeoutMs, fetchImpl }) {
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new AIConnectionError('config', '请求超时设置无效。');
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  const cancellationError = () => new AIConnectionError(timedOut ? 'timeout' : 'cancelled', timedOut ? '请求超时，已停止本次请求。请检查网络或稍后重试。' : '本次 AI 请求已取消。');
  if (signal?.aborted) throw cancellationError();
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => { timedOut = true; abort(); }, timeoutMs);
  let onAbort;
  const aborted = new Promise((_, reject) => {
    onAbort = () => reject(cancellationError());
    controller.signal.addEventListener('abort', onAbort, { once: true });
  });
  try {
    const request = async () => {
      const headers = { Authorization: `Bearer ${apiKey}` };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      const init = { method, headers, signal: controller.signal, credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', cache: 'no-store' };
      if (body !== undefined) init.body = JSON.stringify(body);
      const response = await fetchImpl(endpoint, init);
      // Error bodies can contain credentials or HTML. Never read or echo them.
      if (!response.ok) throw httpConnectionError(response.status);
      let payload;
      try { payload = await response.json(); }
      catch { throw new AIConnectionError('protocol', '接口已响应，但返回内容不是有效的 OpenAI 兼容 JSON。'); }
      return { payload, status: response.status };
    };
    return await Promise.race([request(), aborted]);
  } catch (error) {
    if (controller.signal.aborted) throw cancellationError();
    if (error instanceof AIConnectionError) throw error;
    // Browsers hide details of many cross-origin failures; never expose raw errors.
    throw new AIConnectionError('network', '浏览器未能完成请求：可能是中转站的 CORS 跨域限制、网络或 TLS 故障、接口重定向或服务不可达。浏览器无法准确区分这些原因；请检查网络，并向中转站确认是否允许此测试网站直连。');
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
    controller.signal.removeEventListener('abort', onAbort);
  }
}

/** Full natural-language reply. Long prompts and replies are never sliced. */
export async function chatCompletions({ baseURL, apiKey, model, messages, signal, timeoutMs = 120000, fetchImpl = globalThis.fetch } = {}) {
  const endpoint = chatCompletionsURL(baseURL);
  const key = validateKey(apiKey);
  const modelID = validateModel(model);
  if (!Array.isArray(messages) || !messages.length || messages.some(row => !row || !['system', 'user', 'assistant'].includes(row.role) || typeof row.content !== 'string') || !messages.some(row => row.content.trim())) {
    throw new AIConnectionError('config', '请准备有效的提示词和本次发送内容。');
  }
  const { payload, status } = await requestJSON({ endpoint, apiKey: key, method: 'POST', body: { model: modelID, messages: messages.map(({ role, content }) => ({ role, content })), stream: false }, signal, timeoutMs, fetchImpl });
  const rawReply = replyText(payload).trim();
  if (!rawReply) throw new AIConnectionError('protocol', '接口已响应，但没有可显示的模型文本。请确认模型支持 Chat Completions 文本回复。');
  return { text: redactAIText(rawReply, key), status, incomplete: payload?.choices?.[0]?.finish_reason === 'length' };
}

/** Fixed probe never receives journal data; kept separate from letter generation. */
export async function testAIConnection({ baseURL, apiKey, model, signal, timeoutMs = 30000, fetchImpl = globalThis.fetch } = {}) {
  const result = await chatCompletions({ baseURL, apiKey, model, signal, timeoutMs, fetchImpl, messages: [{ role: 'user', content: AI_TEST_MESSAGE }] });
  return { text: result.text, status: result.status };
}

/** Reads model IDs only. Drops credential echoes and other upstream fields. */
export async function listAIModels({ baseURL, apiKey, signal, timeoutMs = 30000, fetchImpl = globalThis.fetch } = {}) {
  const endpoint = modelsURL(baseURL);
  const key = validateKey(apiKey);
  const { payload, status } = await requestJSON({ endpoint, apiKey: key, method: 'GET', signal, timeoutMs, fetchImpl });
  if (!Array.isArray(payload?.data)) throw new AIConnectionError('protocol', '接口已响应，但没有标准的模型列表。你仍可以手动填写模型 ID。');
  const models = [...new Set(payload.data.map(row => typeof row?.id === 'string' ? row.id.trim() : '').filter(id => id && id.length <= 200 && !/[\u0000-\u001f\u007f]/.test(id) && !id.includes(key)))];
  if (!models.length) throw new AIConnectionError('model', '接口返回的模型列表为空或不可用。你仍可以手动填写模型 ID。');
  return { models, status };
}
