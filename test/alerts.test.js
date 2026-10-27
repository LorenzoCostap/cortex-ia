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

test('alerta apagado não volta enquanto a situação continua', () => {
  const a = A.listAlerts(org).find((x) => /Mercado Bom Preço parou de comprar/.test(x.title));
  const before = A.unreadCount(org);
  db.prepare("UPDATE alerts SET dismissed_at = datetime('now') WHERE id = ?").run(a.id);
  A.refreshAlerts(org);
  assert.ok(!A.listAlerts(org).some((x) => x.id === a.id));
  assert.equal(A.unreadCount(org), before - 1);
  db.prepare('UPDATE alerts SET dismissed_at = NULL WHERE id = ?').run(a.id); // devolve para os próximos testes
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

test('orçamento de despesas por categoria', async () => {
  const M = await import('../server/metrics.js');
  const month = new Date().toISOString().slice(0, 7);
  db.prepare("DELETE FROM goal_items WHERE org_id = ? AND dim = 'despesa'").run(org);
  assert.equal(M.budgetSummary(org, `${month}-01`), null, 'sem orçamento cadastrado');
  const spent = db.prepare("SELECT category, SUM(amount) v FROM expenses WHERE org_id = ? AND substr(date,1,7) = ? GROUP BY category ORDER BY v DESC LIMIT 1").get(org, month);
  db.prepare("INSERT INTO goal_items (org_id, month, dim, key, target) VALUES (?, ?, 'despesa', ?, ?)").run(org, month, spent.category, Math.floor(spent.v / 2));
  const b = M.budgetSummary(org, `${month}-01`);
  assert.equal(b.over.length, 1);
  saveSettings(org, { alerts: { rules: { orcamento: true } } });
  A.refreshAlerts(org);
  assert.ok(A.listAlerts(org).some((a) => a.rule === 'orcamento' && a.title.startsWith(spent.category)));
});

test('dados importados atrasados não viram "todo mundo parou de comprar"', async () => {
  const M = await import('../server/metrics.js');
  const { addDays, todayStr } = await import('../server/dates.js');
  const last = M.lastSaleDate(org);
  assert.equal(M.activityDate(org), todayStr(), 'demonstração está em dia');
  // Simula que as vendas importadas acabaram há 20 dias
  db.prepare('UPDATE orders SET date = ? WHERE org_id = ? AND date > ?').run(addDays(todayStr(), -40), org, addDays(todayStr(), -20));
  assert.equal(M.activityDate(org), addDays(M.lastSaleDate(org), 1));
  const al = A.evaluate(org).filter((a) => a.rule === 'cliente');
  assert.ok(al.length <= 2, `poucos clientes "parados" (veio ${al.length})`);
  assert.ok(al.every((a) => a.text.includes('vendas importadas até')));
  assert.ok(M.weeklyReport(org).stale);
  assert.ok(last);
});
