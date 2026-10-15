// Comparação com o ano anterior e detalhe do cliente (sobre os dados de demonstração).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.CORTEX_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-cmp-'));
const { db } = await import('../server/db.js');
const { seedDemo } = await import('../server/seed.js');
const M = await import('../server/metrics.js');
const { customerDetail } = await import('../server/customers.js');
const org = seedDemo({ reset: true });
const sum = (a, b) => db.prepare('SELECT COALESCE(SUM(total),0) v FROM orders WHERE org_id = ? AND date BETWEEN ? AND ?').get(org, a, b).v;

test('período de comparação', () => {
  assert.deepEqual(M.comparisonPeriod('2026-09-01', '2026-09-30', 'ano'), { from: '2025-09-01', to: '2025-09-30' });
  assert.deepEqual(M.comparisonPeriod('2026-09-01', '2026-09-30'), { from: '2026-08-01', to: '2026-08-31' });
  assert.deepEqual(M.comparisonPeriod('2026-10-07', '2026-10-13', 'ano'), { from: '2025-10-08', to: '2025-10-14' }); // mesmo dia da semana
});

test('dashboard e série com o ano anterior', () => {
  const d = M.dashboard(org, '2026-09-01', 'ano');
  assert.equal(d.compareShort, 'set/25');
  assert.ok(Math.abs(d.previous.revenue - sum('2025-09-01', '2025-09-30')) < 0.01);
  const g = M.goalSeries(org, '2025-10-01', '2026-09-30');
  const sep = g.buckets.at(-1);
  assert.ok(Math.abs(sep.lastYear - sum('2025-09-01', '2025-09-30')) < 0.01, 'mês inteiro do ano anterior');
});

test('detalhe do cliente', () => {
  const id = db.prepare("SELECT id FROM customers WHERE org_id = ? AND name = 'Mercado Bom Preço'").get(org).id;
  const c = customerDetail(org, id);
  assert.equal(c.status, 'risco');
  assert.equal(c.months.length, 12);
  assert.ok(c.months.every((m) => m.lastYear > 0));
  assert.equal(c.receivables.total, 8420);
  assert.match(c.reading, /Mercado Bom Preço/);
  assert.equal(customerDetail(org, 999999), null);
});
