// Alertas, resumo diário por e-mail e mini gráficos (sobre os dados de demonstração).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.CORTEX_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-al-'));
process.env.CORTEX_MAIL_TRANSPORT = 'json';
const { db, saveSettings, getSettings } = await import('../server/db.js');
const { seedDemo } = await import('../server/seed.js');
const A = await import('../server/alerts.js');
const { buildSummary, sendSummary, runDailyEmail } = await import('../server/mailer.js');
const { chartForIntent, chartFromTool } = await import('../server/charts.js');
const org = seedDemo({ reset: true });

test('alertas da demonstração', () => {
  const created = A.refreshAlerts(org);
  const titles = A.listAlerts(org).map((a) => a.title);
  assert.ok(created.length >= 5);
  assert.ok(titles.some((t) => /Mercado Bom Preço parou de comprar/.test(t)));
  assert.ok(titles.some((t) => /Saldo abaixo do mínimo/.test(t)));
  assert.ok(titles.some((t) => /Torrefação Serra Alta/.test(t)));
  assert.equal(A.refreshAlerts(org).length, 0, 'não duplica');
  assert.equal(A.unreadCount(org), titles.length);
});

test('alerta some quando a situação se resolve', () => {
  const bill = db.prepare("SELECT id FROM bills WHERE org_id = ? AND party = 'Torrefação Serra Alta' AND paid_at IS NULL").get(org);
  db.prepare("UPDATE bills SET paid_at = date('now') WHERE id = ?").run(bill.id);
  A.refreshAlerts(org);
  assert.ok(!A.listAlerts(org).some((a) => a.title === 'Conta vencida: Torrefação Serra Alta'));
  saveSettings(org, { alerts: { rules: { cliente: false } } });
  A.refreshAlerts(org);
  assert.ok(!A.listAlerts(org).some((a) => a.rule === 'cliente'));
});

test('resumo diário', async () => {
  const s = buildSummary(org, { name: 'Marina Duarte' });
  assert.match(s.subject, /Cortex · Resumo de/);
  assert.match(s.text, /Ontem a empresa vendeu R\$/);
  assert.match(s.html, /Pontos de atenção/);
  const r = await sendSummary(org, 'marina@grupovalmar.com.br');
  assert.equal(r.ok, true);
  saveSettings(org, { email: { enabled: true, to: ['a@b.com'], user: 'x@gmail.com', appPassword: 'abcdabcdabcdabcd', time: '00:00', days: 'todos' } });
  assert.ok(await runDailyEmail(org));
  assert.equal(await runDailyEmail(org), null, 'só uma vez por dia');
  assert.ok(getSettings(org).email.lastSent);
});

test('mini gráficos', () => {
  assert.equal(chartForIntent(org, 'queda').type, 'bars');
  assert.equal(chartForIntent(org, 'comparar').type, 'pair');
  assert.equal(chartForIntent(org, 'margem').points.length, 6);
  assert.equal(chartForIntent(org, 'caixa').type, 'line');
  assert.equal(chartFromTool('top_produtos', []), null);
  assert.equal(chartFromTool('contas', [{ party: 'x' }]), null);
});

test('modo sem IA não conecta ao Ollama e responde por regras', async () => {
  const { ask, ollamaStatus } = await import('../server/ai.js');
  const realFetch = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (...a) => { called++; return realFetch(...a); };
  const ai = { ...getSettings(org).ai, enabled: false };
  assert.equal((await ollamaStatus(ai)).disabled, true);
  const r = await ask({ org, orgName: 'Teste', ai, question: 'qual vendedor está mais perto da meta?' });
  assert.equal(r.mode, 'automatico');
  assert.equal(r.notice, null);
  assert.match(r.answer, /mais perto da meta/);
  assert.equal(r.chart.type, 'bars');
  const h = await ask({ org, orgName: 'Teste', ai, question: 'qual a previsão do tempo?' });
  assert.match(h.answer, /Não encontrei essa pergunta/);
  assert.equal(called, 0, 'nenhuma chamada de rede');
  globalThis.fetch = realFetch;
});
