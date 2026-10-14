// Testa o ciclo de "tool calling" com um Ollama falso, sem precisar de modelo instalado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.CORTEX_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-test-'));
const { seedDemo } = await import('../server/seed.js');
const { ask } = await import('../server/ai.js');
const { answerIntent, QUESTIONS, detectIntent } = await import('../server/answers.js');

const orgId = seedDemo();
const calls = [];
const mock = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    if (req.url === '/api/tags') return res.end(JSON.stringify({ models: [{ name: 'qwen2.5:7b' }] }));
    const b = JSON.parse(body);
    calls.push(b);
    const toolMsg = b.messages.find((m) => m.role === 'tool');
    if (!toolMsg) {
      return res.end(JSON.stringify({ message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'comparar_periodos', arguments: { inicio_a: '2026-09-01', fim_a: '2026-09-30', inicio_b: '2026-08-01', fim_b: '2026-08-31' } } }] } }));
    }
    const data = JSON.parse(toolMsg.content);
    res.end(JSON.stringify({ message: { role: 'assistant', content: `Receita atual ${data.current.revenue}` } }));
  });
});
await new Promise((r) => mock.listen(0, r));
const ai = { url: `http://127.0.0.1:${mock.address().port}`, model: 'qwen2.5:7b' };

test('IA chama a ferramenta e responde com o dado calculado', async () => {
  const events = [];
  const out = await ask({ org: orgId, orgName: 'Teste', ai, question: 'Por que caiu?' }, (e) => events.push(e));
  assert.equal(out.mode, 'ia');
  assert.deepEqual(out.tools, ['comparar_periodos']);
  assert.match(out.answer, /Receita atual \d+/);
  assert.ok(calls[0].tools.length >= 10, 'ferramentas enviadas ao modelo');
  assert.ok(events.some((e) => e.type === 'tool'));
});

test('sem Ollama, cai para respostas automáticas', async () => {
  const out = await ask({ org: orgId, orgName: 'Teste', ai: { url: 'http://127.0.0.1:9', model: 'x' }, question: 'Quais clientes estão comprando menos?' });
  assert.equal(out.mode, 'automatico');
  assert.match(out.answer, /Mercado Bom Preço/);
});

test('todas as perguntas frequentes têm resposta automática', () => {
  for (const q of QUESTIONS) {
    assert.equal(detectIntent(q.text), q.key, q.text);
    const a = answerIntent(orgId, q.key);
    assert.ok(a.answer.length > 20, q.key);
  }
});

test.after(() => mock.close());
