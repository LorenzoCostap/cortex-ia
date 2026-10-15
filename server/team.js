// Equipe comercial: ranking de vendedores contra a meta individual, regiões e destaques da semana.
import { db } from './db.js';
import * as M from './metrics.js';
import { todayStr, addDays, addMonths, monthStart, monthEnd, monthKey, monthLabel, daysBetween } from './dates.js';

const r2 = (v) => Math.round(v * 100) / 100;
const first = (n) => (n || '').split(' ')[0];

export function teamView(org, month) {
  const today = todayStr();
  const ms = monthStart(month || today), me = monthEnd(ms);
  const to = me < today ? me : today;
  const prev = addMonths(ms, -1);
  const sameDay = addDays(prev, daysBetween(ms, to)); // mesmo pedaço do mês anterior
  const prevTo = me < today || sameDay > monthEnd(prev) ? monthEnd(prev) : sameDay;
  const f = M.forecast(org, ms);
  // Onde a equipe deveria estar hoje (dias úteis decorridos / dias úteis do mês)
  const expectedPct = f.closed ? 100 : f.businessDaysTotal ? r2(((f.businessDaysTotal - f.businessDaysLeft) / f.businessDaysTotal) * 100) : null;

  const targets = Object.fromEntries(db.prepare("SELECT key, target FROM goal_items WHERE org_id = ? AND month = ? AND dim = 'vendedor'").all(org, monthKey(ms)).map((r) => [r.key, r.target]));
  const rows = db.prepare(`SELECT COALESCE(o.seller, 'Sem vendedor') seller, SUM(o.total) revenue, COUNT(*) orders, COUNT(DISTINCT o.customer_id) customers, MAX(o.total) biggest
    FROM orders o WHERE o.org_id = ? AND o.date BETWEEN ? AND ? GROUP BY o.seller`).all(org, ms, to);
  const prevRows = Object.fromEntries(db.prepare("SELECT COALESCE(seller, 'Sem vendedor') seller, SUM(total) v FROM orders WHERE org_id = ? AND date BETWEEN ? AND ? GROUP BY seller").all(org, prev, prevTo).map((r) => [r.seller, r.v]));
  const regionOf = Object.fromEntries(db.prepare('SELECT seller, region, COUNT(*) n FROM customers WHERE org_id = ? AND seller IS NOT NULL GROUP BY seller, region ORDER BY n DESC').all(org).reverse().map((r) => [r.seller, r.region]));
  // Clientes da carteira sem pedido há mais de 30 dias
  const idle = Object.fromEntries(db.prepare(`SELECT c.seller, COUNT(*) n FROM customers c
    WHERE c.org_id = ? AND c.seller IS NOT NULL AND EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.date >= ?)
      AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.date > ?) GROUP BY c.seller`).all(org, addDays(today, -180), addDays(today, -30)).map((r) => [r.seller, r.n]));

  const names = new Set([...rows.map((r) => r.seller), ...Object.keys(targets)]);
  const sellers = [...names].map((name) => {
    const r = rows.find((x) => x.seller === name) || { revenue: 0, orders: 0, customers: 0, biggest: 0 };
    const target = targets[name] ?? null;
    const p = prevRows[name] || 0;
    return {
      name, region: regionOf[name] || null, revenue: r2(r.revenue), orders: r.orders, customers: r.customers, avgTicket: r.orders ? r2(r.revenue / r.orders) : 0,
      target, pct: target ? r2((r.revenue / target) * 100) : null, onPace: target && expectedPct !== null ? (r.revenue / target) * 100 >= expectedPct * 0.97 : null,
      change: p ? r2(((r.revenue - p) / p) * 100) : null, idleCustomers: idle[name] || 0
    };
  }).sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1) || b.revenue - a.revenue);

  // Regiões (pela região do cliente)
  const reg = db.prepare(`SELECT COALESCE(c.region, 'Sem região') region, SUM(CASE WHEN o.date BETWEEN ? AND ? THEN o.total ELSE 0 END) cur, SUM(CASE WHEN o.date BETWEEN ? AND ? THEN o.total ELSE 0 END) prev,
      COUNT(DISTINCT CASE WHEN o.date BETWEEN ? AND ? THEN o.customer_id END) customers
    FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.org_id = ? AND o.date BETWEEN ? AND ? GROUP BY c.region ORDER BY cur DESC`).all(ms, to, prev, prevTo, ms, to, org, prev, to);
  const totalReg = reg.reduce((s, r) => s + r.cur, 0) || 1;
  const regions = reg.map((r) => ({ region: r.region, revenue: r2(r.cur), share: r2((r.cur / totalReg) * 100), customers: r.customers, change: r.prev ? r2(((r.cur - r.prev) / r.prev) * 100) : null, sellers: Object.entries(regionOf).filter(([, v]) => v === r.region).map(([k]) => k) }));

  return {
    month: monthKey(ms), label: monthLabel(ms), closed: f.closed, until: to, expectedPct,
    team: { target: f.target, realized: f.realized, pct: f.achievedPct, projection: f.projection, projectionPct: f.projectionPct, requiredPerDay: f.requiredPerDay, businessDaysLeft: f.businessDaysLeft },
    sellers, regions, highlights: weekHighlights(org, today)
  };
}

/** Destaques dos últimos 7 dias: maior pedido, mais pedidos e clientes recuperados (voltaram depois de 30+ dias parados). */
export function weekHighlights(org, today = todayStr()) {
  const from = addDays(today, -6);
  const big = db.prepare('SELECT o.seller, o.total, c.name customer FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.org_id = ? AND o.date BETWEEN ? AND ? ORDER BY o.total DESC LIMIT 1').get(org, from, today);
  const most = db.prepare('SELECT seller, COUNT(*) n FROM orders WHERE org_id = ? AND date BETWEEN ? AND ? AND seller IS NOT NULL GROUP BY seller ORDER BY n DESC LIMIT 1').get(org, from, today);
  const rec = db.prepare(`SELECT o.seller, COUNT(DISTINCT o.customer_id) n FROM orders o
    WHERE o.org_id = ? AND o.date BETWEEN ? AND ? AND o.seller IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM orders p WHERE p.customer_id = o.customer_id AND p.date BETWEEN ? AND ?)
      AND EXISTS (SELECT 1 FROM orders q WHERE q.customer_id = o.customer_id AND q.date < ?)
    GROUP BY o.seller ORDER BY n DESC LIMIT 1`).get(org, from, today, addDays(from, -30), addDays(from, -1), addDays(from, -30));
  const out = [];
  if (big) out.push({ label: 'Maior pedido', who: first(big.seller) || '—', value: big.total, detail: big.customer, kind: 'money' });
  if (rec?.n) out.push({ label: 'Clientes recuperados', who: first(rec.seller), value: rec.n, detail: 'voltaram a comprar após 30 dias', kind: 'count', unit: rec.n === 1 ? 'cliente' : 'clientes' });
  if (most) out.push({ label: 'Mais pedidos', who: first(most.seller), value: most.n, detail: 'nos últimos 7 dias', kind: 'count', unit: 'pedidos' });
  return out;
}

export const daysSince = (d) => daysBetween(d, todayStr());
