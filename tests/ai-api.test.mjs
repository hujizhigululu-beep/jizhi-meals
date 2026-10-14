import test from 'node:test';
import assert from 'node:assert/strict';
import { AI_TEST_MESSAGE, AIConnectionError, chatCompletionsURL, httpConnectionError, redactAIText, testAIConnection } from '../ai-api.js';

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
