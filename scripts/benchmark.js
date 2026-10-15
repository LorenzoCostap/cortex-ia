// Teste de carga: cria uma empresa grande num banco separado e mede o tempo das telas principais.
// Uso: npm run benchmark   (não mexe no seu banco: usa data-benchmark/)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'data-benchmark');
const fresh = !process.argv.includes('--reuse');
if (fresh) fs.rmSync(dir, { recursive: true, force: true });
process.env.CORTEX_DATA_DIR = dir;

const { db, saveSettings } = await import('../server/db.js');
const { createOrganization, SELLERS } = await import('../server/seed.js');
const { todayStr, addDays, addMonths, monthStart, monthEnd, refMonth } = await import('../server/dates.js');
const M = await import('../server/metrics.js');
const { teamView } = await import('../server/team.js');
const { cashflow } = await import('../server/cashflow.js');
const { customerDetail, customerTable } = await import('../server/customers.js');
const A = await import('../server/alerts.js');
const { refreshInsights } = await import('../server/services.js');
const { answerIntent } = await import('../server/answers.js');

const YEARS = +(process.env.ANOS || 5), CUSTOMERS = +(process.env.CLIENTES || 1500), PRODUCTS = +(process.env.PRODUTOS || 400), PER_DAY = +(process.env.PEDIDOS_DIA || 250);
let rnd = 42;
const rand = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);

let org = db.prepare("SELECT id FROM organizations WHERE slug = 'carga'").get()?.id;
if (!org) {
  console.log(`Gerando ${YEARS} anos · ${CUSTOMERS} clientes · ${PRODUCTS} produtos · ~${PER_DAY} pedidos por dia útil…`);
  const t0 = Date.now();
  org = createOrganization({ slug: 'carga', name: 'Empresa Grande (teste de carga)', adminName: 'Admin', adminEmail: 'admin@carga.com', password: 'carga2026' });
  const today = todayStr();
  db.transaction(() => {
    const insP = db.prepare('INSERT INTO products (org_id, sku, name, category, price, cost) VALUES (?, ?, ?, ?, ?, ?)');
    const cats = ['Mercearia', 'Bebidas', 'Frios e laticínios', 'Limpeza', 'Higiene', 'Outros'];
    const products = Array.from({ length: PRODUCTS }, (_, i) => { const price = +(3 + rand() * 80).toFixed(2), cost = +(price * (0.6 + rand() * 0.15)).toFixed(2); return { id: insP.run(org, `P${i}`, `Produto ${i + 1}`, cats[i % cats.length], price, cost).lastInsertRowid, price, cost, w: 1 / (1 + i * 0.03) }; });
    const insC = db.prepare('INSERT INTO customers (org_id, code, name, seller, region) VALUES (?, ?, ?, ?, ?)');
    const customers = Array.from({ length: CUSTOMERS }, (_, i) => { const [s, r] = SELLERS[i % SELLERS.length]; return { id: insC.run(org, `C${i}`, `Cliente ${i + 1}`, s, r).lastInsertRowid, seller: s, w: 1 / (1 + i * 0.01) }; });
    const cum = (arr) => { let a = 0; const c = arr.map((x) => (a += x.w)); return (r) => { const t = r * a; let lo = 0, hi = c.length - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (c[m] < t) lo = m + 1; else hi = m; } return arr[lo]; }; };
    const pickP = cum(products), pickC = cum(customers);
    const insO = db.prepare('INSERT INTO orders (org_id, customer_id, date, total, seller) VALUES (?, ?, ?, ?, ?)');
    const insI = db.prepare('INSERT INTO order_items (order_id, product_id, qty, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?)');
    const updO = db.prepare('UPDATE orders SET total = ? WHERE id = ?');
    const insE = db.prepare('INSERT INTO expenses (org_id, date, category, description, amount) VALUES (?, ?, ?, ?, ?)');
    const insG = db.prepare('INSERT INTO goals (org_id, month, revenue_target) VALUES (?, ?, ?)');
    const monthRev = {};
    for (let d = addMonths(today, -12 * YEARS); d <= today; d = addDays(d, 1)) {
      const wd = new Date(d + 'T00:00:00Z').getUTCDay();
      if (wd === 0) continue;
      const n = Math.round(PER_DAY * (wd === 6 ? 0.3 : 1) * (0.8 + rand() * 0.4));
      for (let k = 0; k < n; k++) {
        const c = pickC(rand());
        const oid = insO.run(org, c.id, d, 0, c.seller).lastInsertRowid;
        let total = 0;
        const items = 3 + Math.floor(rand() * 7);
        for (let j = 0; j < items; j++) { const p = pickP(rand()); const q = 1 + Math.floor(rand() * 6); insI.run(oid, p.id, q, p.price, p.cost); total += q * p.price; }
        updO.run(+total.toFixed(2), oid);
        monthRev[d.slice(0, 7)] = (monthRev[d.slice(0, 7)] || 0) + total;
      }
    }
    for (const [m, v] of Object.entries(monthRev)) {
      insE.run(org, `${m}-05`, 'Pessoal', 'Folha', v * 0.12); insE.run(org, `${m}-10`, 'Ocupação', 'Aluguel', 60000); insE.run(org, `${m}-20`, 'Logística', 'Frete', v * 0.04);
      insG.run(org, m, Math.round(v * 1.05 / 1000) * 1000);
    }
    insG.run(org, addMonths(today, 1).slice(0, 7), Math.round((monthRev[addMonths(today, -1).slice(0, 7)] || 0) * 1.05));
    const insB = db.prepare('INSERT INTO bills (org_id, kind, party, due_date, amount, paid_at) VALUES (?, ?, ?, ?, ?, NULL)');
    for (let i = 0; i < 400; i++) insB.run(org, i % 2 ? 'pagar' : 'receber', `Parte ${i}`, addDays(today, Math.floor(rand() * 100) - 10), Math.round(1000 + rand() * 40000));
  })();
  saveSettings(org, { cash: { balance: 500000, date: todayStr(), minimum: 200000 } });
  db.exec('ANALYZE');
  const n = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE ${t === 'order_items' ? 'order_id IN (SELECT id FROM orders WHERE org_id = ' + org + ')' : 'org_id = ' + org}`).get().n;
  console.log(`Gerado em ${((Date.now() - t0) / 1000).toFixed(1)} s: ${n('orders').toLocaleString('pt-BR')} pedidos, ${n('order_items').toLocaleString('pt-BR')} itens. Banco: ${(fs.statSync(path.join(dir, 'cortex.db')).size / 1e6).toFixed(0)} MB`);
}

const today = todayStr(), r = refMonth(), from12 = addMonths(r, -11);
const topCustomer = db.prepare('SELECT customer_id id FROM orders WHERE org_id = ? GROUP BY customer_id ORDER BY SUM(total) DESC LIMIT 1').get(org).id;
const cases = [
  ['Dashboard', () => M.dashboard(org)],
  ['Previsão do mês', () => M.forecast(org)],
  ['Receita × meta · 12 meses', () => M.goalSeries(org, from12, monthEnd(r))],
  ['Receita × meta · 30 dias', () => M.goalSeries(org, addDays(today, -29), today)],
  ['Vendas · 30 dias', () => M.salesView(org, addDays(today, -29), today)],
  ['Vendas · 12 meses vs ano anterior', () => M.salesView(org, from12, monthEnd(r), 'ano')],
  ['Clientes do período', () => customerTable(org, monthStart(r), monthEnd(r))],
  ['Detalhe do cliente', () => customerDetail(org, topCustomer)],
  ['Equipe comercial', () => teamView(org)],
  ['Fluxo de caixa · 90 dias', () => cashflow(org, 90)],
  ['Alertas (recalcular tudo)', () => A.evaluate(org)],
  ['Pergunta: por que caiu', () => answerIntent(org, 'queda')],
  ['Pergunta: atenção', () => answerIntent(org, 'atencao')],
  ['Relatório semanal', () => M.weeklyReport(org)]
];
console.log('\nTempo de cada tela (média de 3 execuções):');
const rows = [];
for (const [name, fn] of cases) {
  fn();
  const t = process.hrtime.bigint();
  for (let i = 0; i < 3; i++) fn();
  const ms = Number(process.hrtime.bigint() - t) / 3e6;
  rows.push([name, ms]);
  console.log(`${ms > 1000 ? '[LENTO]' : ms > 300 ? '[ok-]  ' : '[ok]   '} ${name.padEnd(36)} ${ms.toFixed(0).padStart(6)} ms`);
}
const t = Date.now(); await refreshInsights(org, { force: true }); console.log(`        ${'Insights da TV (todas as perguntas)'.padEnd(36)} ${String(Date.now() - t).padStart(6)} ms`);
console.log('\n[ok] até 300 ms · [ok-] até 1 s · [LENTO] acima de 1 s');
db.close();
