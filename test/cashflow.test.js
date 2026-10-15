// Fluxo de caixa projetado.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.CORTEX_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-cf-'));
const { db, saveSettings } = await import('../server/db.js');
const { createOrganization } = await import('../server/seed.js');
const { cashflow } = await import('../server/cashflow.js');
const { todayStr, addDays } = await import('../server/dates.js');
const { answerIntent, detectIntent } = await import('../server/answers.js');

const org = createOrganization({ slug: 'caixa', name: 'Caixa', adminName: 'A', adminEmail: 'c@c.com', password: 'senha1234' });
const today = todayStr();
const bill = (kind, party, d, v) => db.prepare('INSERT INTO bills (org_id, kind, party, due_date, amount, paid_at) VALUES (?, ?, ?, ?, ?, NULL)').run(org, kind, party, addDays(today, d), v);

test('sem saldo informado: só entradas e saídas', () => {
  bill('pagar', 'Fornecedor', 3, 5000);
  bill('receber', 'Cliente A', 5, 2000);
  bill('receber', 'Cliente vencido', -4, 900);
  const c = cashflow(org, 30);
  assert.equal(c.hasBalance, false);
  assert.equal(c.weeks.length, 5);
  assert.equal(c.totals.out, 5000);
  assert.equal(c.totals.in, 2000);
  assert.deepEqual(c.overdueReceivables, { count: 1, amount: 900 });
});

test('saldo, mínimo e primeiro dia abaixo do mínimo', () => {
  saveSettings(org, { cash: { balance: 6000, date: today, minimum: 2000 } });
  const c = cashflow(org, 30);
  assert.equal(c.balance, 6000);
  assert.equal(c.firstBelow, addDays(today, 3));
  assert.equal(c.minBalance, 1000);
  assert.deepEqual(c.culprits, ['Fornecedor']);
  assert.equal(c.endBalance, 3000);
  assert.equal(c.weeks.at(-1).balance, 3000);
});

test('estimativa pela média de vendas desconta o já lançado', () => {
  const cust = db.prepare('INSERT INTO customers (org_id, name) VALUES (?, ?)').run(org, 'Cliente').lastInsertRowid;
  const ins = db.prepare('INSERT INTO orders (org_id, customer_id, date, total) VALUES (?, ?, ?, ?)');
  for (let d = 1; d <= 84; d++) ins.run(org, cust, addDays(today, -d), 1000);
  const c = cashflow(org, 30);
  assert.equal(Math.round(c.averages.weeklyIn), 7000);
  assert.equal(Math.round(c.totals.in), 30000); // 30 dias × 1.000, já incluindo os 2.000 lançados
  assert.ok(c.moves.some((m) => m.estimate));
  assert.equal(detectIntent('Como está meu saldo de caixa?'), 'caixa');
  assert.match(answerIntent(org, 'caixa').answer, /Saldo de hoje/);
});
