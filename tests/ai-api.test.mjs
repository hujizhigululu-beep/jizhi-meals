import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TEST_MESSAGE, AIConnectionError, chatCompletionsURL, modelsURL, chatCompletions, listAIModels, httpConnectionError, redactAIText, testAIConnection } from '../ai-api.js';
import { getAIConfig, setAIConfig, subscribeAIConfig, clearAIKey } from '../ai-session.js';

const fakeKey = 'unit-test-placeholder';
const options = { baseURL: 'https://example.test/v1', apiKey: fakeKey, model: 'manual-model' };
const success = text => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: text } }] }) });

test('AI 地址保留用户配置的版本路径；不重复添加 /v1 或请求路径', () => {
  for (const base of ['https://example.test/v1', 'https://example.test/v1/', ' https://example.test/v1/ ']) assert.equal(chatCompletionsURL(base), 'https://example.test/v1/chat/completions');
  for (const base of ['https://example.test/v1/chat/completions', 'https://example.test/v1/chat/completions/']) assert.equal(chatCompletionsURL(base), 'https://example.test/v1/chat/completions');
  assert.equal(chatCompletionsURL('https://example.test/custom/api'), 'https://example.test/custom/api/chat/completions');
  assert.equal(chatCompletionsURL('https://example.test'), 'https://example.test/chat/completions');
});

test('AI 只接受 HTTPS，不接受地址内的凭据、参数或片段', () => {
  for (const value of ['http://example.test/v1', 'ftp://example.test/v1', '//example.test/v1', 'invalid', 'https://user:secret@example.test/v1', 'https://example.test/v1?key=secret', 'https://example.test/v1#secret', 'https://example.test/v1?', 'https://example.test/v1#']) assert.throws(() => chatCompletionsURL(value), error => error instanceof AIConnectionError && error.code === 'config');
});

test('AI 请求仅包含固定测试消息和手动模型；省略凭据、引用来源、缓存并拒绝重定向', async () => {
  let calls = 0;
  const result = await testAIConnection({ ...options, fetchImpl: async (url, init) => {
    calls += 1;
    assert.equal(url, 'https://example.test/v1/chat/completions');
    assert.equal(init.method, 'POST');
    assert.deepEqual(init.headers, { 'Content-Type': 'application/json', Authorization: `Bearer ${fakeKey}` });
    assert.deepEqual(JSON.parse(init.body), { model: 'manual-model', messages: [{ role: 'user', content: AI_TEST_MESSAGE }], stream: false });
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.referrerPolicy, 'no-referrer'); assert.equal(init.cache, 'no-store');
    assert.ok(init.signal instanceof AbortSignal);
    return success('草莓邮局连接成功');
  } });
  assert.equal(calls, 1); assert.deepEqual(result, { text: '草莓邮局连接成功', status: 200 });
  assert.ok(!JSON.stringify(result).includes(fakeKey));
});

test('AI 拒绝空模型和无效密钥，不发出请求', async () => {
  const fetchImpl = async () => assert.fail('invalid configuration must not send a request');
  for (const change of [{ model: '' }, { model: '  ' }, { apiKey: '' }, { apiKey: 'placeholder\ninvalid' }, { model: 'm'.repeat(201) }]) await assert.rejects(testAIConnection({ ...options, ...change, fetchImpl }), error => error.code === 'config');
});

test('AI 按 HTTP 状态给出可理解的提示，不读或原样回显错误响应', async () => {
  const expected = new Map([[401, 'auth'], [403, 'auth'], [400, 'model'], [422, 'model'], [404, 'model'], [429, 'limit'], [500, 'server'], [503, 'server'], [418, 'http']]);
  for (const [status, code] of expected) {
    assert.equal(httpConnectionError(status).code, code);
    await assert.rejects(testAIConnection({ ...options, fetchImpl: async () => ({ ok: false, status, json: () => assert.fail('must not read error body'), text: () => assert.fail('must not read error body') }) }), error => error.code === code && error.status === status && !error.message.includes(fakeKey));
  }
});

test('AI 将网络与 CORS 可能原因如实提示，不暴露原始异常或密钥', async () => {
  await assert.rejects(testAIConnection({ ...options, fetchImpl: async () => { throw new TypeError(`<script>${fakeKey}</script>`); } }), error => error.code === 'network' && error.message.includes('CORS') && error.message.includes('无法准确区分') && !error.message.includes(fakeKey) && !error.message.includes('<script>'));
});

test('AI 对成功响应中的密钥进行屏蔽，保留普通文本供 textContent 显示', async () => {
  const reply = `<img src=x onerror=alert(1)> ${fakeKey} ${fakeKey}`;
  const result = await testAIConnection({ ...options, fetchImpl: async () => success(reply) });
  assert.ok(!result.text.includes(fakeKey)); assert.equal(result.text, '<img src=x onerror=alert(1)> 【密钥已隐藏】 【密钥已隐藏】');
  assert.equal(redactAIText('a+b? a+b?', 'a+b?'), '【密钥已隐藏】 【密钥已隐藏】');
});

test('AI 验证成功响应协议，隐藏 JSON 解析异常', async () => {
  for (const response of [success(''), { ok: true, status: 200, json: async () => { throw new Error(fakeKey); } }, { ok: true, status: 200, json: async () => ({ error: { message: fakeKey } }) }]) await assert.rejects(testAIConnection({ ...options, fetchImpl: async () => response }), error => error.code === 'protocol' && !error.message.includes(fakeKey));
});

test('AI 支持取消，包括请求前取消；取消不会继续显示结果', async () => {
  const already = new AbortController(); already.abort();
  await assert.rejects(testAIConnection({ ...options, signal: already.signal, fetchImpl: () => assert.fail('already aborted') }), error => error.code === 'cancelled');
  const cancel = new AbortController();
  let internal;
  const pending = testAIConnection({ ...options, signal: cancel.signal, fetchImpl: async (_, init) => { internal = init.signal; return new Promise(() => {}); } });
  cancel.abort();
  await assert.rejects(pending, error => error.code === 'cancelled'); assert.equal(internal.aborted, true);
});

test('AI 30 秒机制可终止连接及响应体等待，超时与手动取消可区分', async () => {
  let internal;
  await assert.rejects(testAIConnection({ ...options, timeoutMs: 12, fetchImpl: async (_, init) => { internal = init.signal; return new Promise(() => {}); } }), error => error.code === 'timeout');
  assert.equal(internal.aborted, true);
  await assert.rejects(testAIConnection({ ...options, timeoutMs: 12, fetchImpl: async () => ({ ok: true, status: 200, json: () => new Promise(() => {}) }) }), error => error.code === 'timeout');
});

test('模型地址共用 HTTPS 验证并从完整 chat 地址准确切换，不重复版本路径', () => {
  for (const base of ['https://example.test/v1', 'https://example.test/v1/', 'https://example.test/v1/chat/completions', 'https://example.test/v1/chat/completions/', 'https://example.test/v1/models/']) assert.equal(modelsURL(base), 'https://example.test/v1/models');
  assert.equal(modelsURL('https://example.test/custom/api'), 'https://example.test/custom/api/models');
  assert.equal(chatCompletionsURL('https://example.test/v1/models/'), 'https://example.test/v1/chat/completions');
  for (const base of ['http://example.test/v1', 'https://user:pw@example.test/v1', 'https://example.test/v1?secret=x', 'https://example.test/v1#x']) assert.throws(() => modelsURL(base), error => error.code === 'config');
});

test('模型读取只 GET 已配置接口，去重保留中文特殊 ID，并丢弃密钥回显及元数据', async () => {
  const special = '[芦兰]gemini-3.8-flash②';
  const malicious = '<img src=x onerror=alert(1)>';
  const result = await listAIModels({ ...options, fetchImpl: async (url, init) => {
    assert.equal(url, 'https://example.test/v1/models');
    assert.equal(init.method, 'GET');
    assert.equal(init.body, undefined);
    assert.deepEqual(init.headers, { Authorization: `Bearer ${fakeKey}` });
    assert.equal(init.credentials, 'omit'); assert.equal(init.redirect, 'error'); assert.equal(init.referrerPolicy, 'no-referrer'); assert.equal(init.cache, 'no-store');
    return { ok: true, status: 200, json: async () => ({ data: [{ id: special, owner: fakeKey }, { id: special }, { id: ' second ' }, { id: malicious }, { id: `${fakeKey}-echo` }, { id: '' }, { id: 1 }, { id: 'bad\nline' }, { id: 'x'.repeat(201) }] }) };
  } });
  assert.deepEqual(result, { models: [special, 'second', malicious], status: 200 });
  assert.ok(!JSON.stringify(result).includes(fakeKey));
});

test('模型读取不回显错误响应、无效协议、网络异常，并支持取消及超时', async () => {
  for (const status of [401, 403, 404, 429, 500]) await assert.rejects(listAIModels({ ...options, fetchImpl: async () => ({ ok: false, status, json: () => assert.fail('no upstream error body') }) }), error => error.status === status && !error.message.includes(fakeKey));
  for (const payload of [null, {}, { data: [] }, { data: [{ id: fakeKey }] }]) await assert.rejects(listAIModels({ ...options, fetchImpl: async () => ({ ok: true, status: 200, json: async () => payload }) }), error => ['protocol', 'model'].includes(error.code) && !error.message.includes(fakeKey));
  await assert.rejects(listAIModels({ ...options, fetchImpl: async () => { throw new Error(fakeKey); } }), error => error.code === 'network' && error.message.includes('CORS') && !error.message.includes(fakeKey));
  const controller = new AbortController();
  const pending = listAIModels({ ...options, signal: controller.signal, fetchImpl: async () => new Promise(() => {}) });
  controller.abort();
  await assert.rejects(pending, error => error.code === 'cancelled');
  await assert.rejects(listAIModels({ ...options, timeoutMs: 12, fetchImpl: async () => ({ ok: true, status: 200, json: async () => new Promise(() => {}) }) }), error => error.code === 'timeout');
});

test('来信调用完整保留长预设和长回复，不要求 JSON 或添加生活记录', async () => {
  const persona = `  现有长预设\n${'用户自己的设定。'.repeat(5000)}\n  `;
  const content = '本次勾选的日记。\n手工补充。';
  const text = '完整信件正文'.repeat(5000);
  const messages = [{ role: 'system', content: persona }, { role: 'user', content }];
  const before = structuredClone(messages);
  const result = await chatCompletions({ ...options, messages, fetchImpl: async (_, init) => {
    assert.deepEqual(JSON.parse(init.body), { model: options.model, messages: before, stream: false });
    return success(text);
  } });
  assert.deepEqual(messages, before);
  assert.deepEqual(result, { text, status: 200, incomplete: false });
  assert.ok(result.text.length > 12000);
});

test('来信报告上游长度截断并完整保留已返回正文，密钥回显被屏蔽', async () => {
  const result = await chatCompletions({ ...options, messages: [{ role: 'user', content: '请写一封信' }], fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'length', message: { content: `未完信件 ${fakeKey}` } }] }) }) });
  assert.deepEqual(result, { text: '未完信件 【密钥已隐藏】', status: 200, incomplete: true });
});

test('来信在无效消息时不请求，错误和取消仍沿用安全处理', async () => {
  for (const messages of [undefined, [], [{ role: 'tool', content: 'x' }], [{ role: 'user', content: null }], [{ role: 'user', content: '  ' }]]) await assert.rejects(chatCompletions({ ...options, messages, fetchImpl: async () => assert.fail('invalid messages must not send') }), error => error.code === 'config');
  await assert.rejects(chatCompletions({ ...options, messages: [{ role: 'user', content: 'x' }], fetchImpl: async () => ({ ok: false, status: 401, text: () => assert.fail('must not read error body') }) }), error => error.code === 'auth');
  const controller = new AbortController();
  const request = chatCompletions({ ...options, messages: [{ role: 'user', content: 'x' }], signal: controller.signal, fetchImpl: async () => new Promise(() => {}) });
  controller.abort();
  await assert.rejects(request, error => error.code === 'cancelled');
});

test('共享配置仅保留明确的内存字段，返回副本，清 Key 通知订阅者且不影响其他字段', () => {
  const original = getAIConfig();
  let notifications = 0;
  const unsubscribe = subscribeAIConfig(config => { notifications++; assert.equal(config.apiKey, getAIConfig().apiKey); config.model = 'must not mutate'; });
  const unsubscribeBroken = subscribeAIConfig(() => { throw new Error('subscriber should not disrupt journal'); });
  try {
    setAIConfig({ baseURL: options.baseURL, apiKey: fakeKey, model: options.model, arbitrary: 'ignored' });
    assert.deepEqual(getAIConfig(), options);
    const copy = getAIConfig(); copy.apiKey = 'changed externally';
    assert.equal(getAIConfig().apiKey, fakeKey);
    clearAIKey();
    assert.equal(getAIConfig().apiKey, '');
    assert.equal(getAIConfig().model, options.model);
    assert.equal(getAIConfig().baseURL, options.baseURL);
    assert.equal(notifications, 2);
  } finally { unsubscribe(); unsubscribeBroken(); setAIConfig(original); }
});
