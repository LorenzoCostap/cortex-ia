// Todas as contas do Cortex ficam aqui. A IA nunca calcula nada: ela chama estas funções e interpreta o resultado.
import { db } from './db.js';
import { todayStr, addDays, addMonths, monthStart, monthEnd, monthKey, monthLabel, daysBetween, refMonth, weekRange, isoWeek, brDate } from './dates.js';

const r2 = (v) => Math.round((v || 0) * 100) / 100;
const pctChange = (a, b) => (b ? r2(((a - b) / b) * 100) : null);

/**
 * Despesas operacionais do período. Despesas mensais (aluguel, salários…) são rateadas pelos dias
 * do mês cobertos pelo período, para que semanas e intervalos curtos não fiquem distorcidos.
 */
export function operatingExpenses(org, from, to) {
  let total = 0;
  const q = db.prepare('SELECT COALESCE(SUM(amount),0) v FROM expenses WHERE org_id = ? AND date BETWEEN ? AND ?');
  for (let m = monthStart(from); m <= to; m = addMonths(m, 1)) {
    const ms = m, me = monthEnd(m);
    const a = from > ms ? from : ms, b = to < me ? to : me;
    const covered = daysBetween(a, b) + 1, days = daysBetween(ms, me) + 1;
    let month = q.get(org, ms, me).v;
    // Mês em andamento: nem todas as despesas foram lançadas ainda; usa o mês anterior como referência.
    if (me > todayStr()) { const pm = addMonths(ms, -1); month = Math.max(month, q.get(org, pm, monthEnd(pm)).v); }
    total += covered >= days ? month : (month * covered) / days;
  }
  return total;
}

export function periodSummary(org, from, to) {
  const o = db.prepare(`
    SELECT COUNT(*) orders, COALESCE(SUM(total),0) revenue, COUNT(DISTINCT customer_id) customers
    FROM orders WHERE org_id = ? AND date BETWEEN ? AND ?`).get(org, from, to);
  const it = db.prepare(`
    SELECT COALESCE(SUM(i.qty*i.unit_cost),0) cogs, COUNT(i.id) items
    FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.org_id = ? AND o.date BETWEEN ? AND ?`).get(org, from, to);
  const revenue = r2(o.revenue), cogs = r2(it.cogs), opex = r2(operatingExpenses(org, from, to));
  const expenses = r2(cogs + opex), profit = r2(revenue - expenses);
  return {
    from, to, revenue, cogs, opex, expenses, profit,
    orders: o.orders, activeCustomers: o.customers,
    avgTicket: o.orders ? r2(revenue / o.orders) : 0,
    itemsPerOrder: o.orders ? r2(it.items / o.orders) : 0,
    grossMargin: revenue ? r2(((revenue - cogs) / revenue) * 100) : 0,
    netMargin: revenue ? r2((profit / revenue) * 100) : 0
  };
}

export function previousPeriod(from, to) {
  // Mês fechado -> mês anterior inteiro; senão, mesmo número de dias imediatamente antes.
  if (from === monthStart(from) && to === monthEnd(from)) {
    const p = addMonths(from, -1);
    return { from: p, to: monthEnd(p) };
  }
  const len = daysBetween(from, to);
  return { from: addDays(from, -len - 1), to: addDays(from, -1) };
}

export function withDeltas(cur, prev) {
  const keys = ['revenue', 'expenses', 'profit', 'orders', 'avgTicket', 'activeCustomers', 'opex', 'cogs'];
  const deltas = Object.fromEntries(keys.map((k) => [k, pctChange(cur[k], prev[k])]));
  deltas.netMarginPp = r2(cur.netMargin - prev.netMargin);
  deltas.grossMarginPp = r2(cur.grossMargin - prev.grossMargin);
  return deltas;
}

export function monthlySeries(org, endMonth, n = 12) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const m = addMonths(endMonth, -i);
    const s = periodSummary(org, m, monthEnd(m));
    const g = db.prepare('SELECT revenue_target FROM goals WHERE org_id = ? AND month = ?').get(org, monthKey(m));
    out.push({ month: monthKey(m), label: monthLabel(m, true), full: monthLabel(m), revenue: s.revenue, expenses: s.expenses, profit: s.profit, goal: g ? g.revenue_target : null });
  }
  return out;
}

function productRows(org, from, to) {
  return db.prepare(`
    SELECT p.id, p.name, p.category, SUM(i.qty) qty, SUM(i.qty*i.unit_price) revenue, SUM(i.qty*i.unit_cost) cost
    FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
    WHERE o.org_id = ? AND o.date BETWEEN ? AND ? GROUP BY p.id`).all(org, from, to);
}

export function productTable(org, from, to) {
  const prev = previousPeriod(from, to);
  const cur = productRows(org, from, to);
  const before = Object.fromEntries(productRows(org, prev.from, prev.to).map((r) => [r.id, r]));
  const total = cur.reduce((s, r) => s + r.revenue, 0);
  cur.sort((a, b) => b.revenue - a.revenue);
  let acc = 0;
  return cur.map((r) => {
    acc += r.revenue;
    const share = total ? (acc / total) * 100 : 0;
    return {
      name: r.name, category: r.category, qty: r.qty, revenue: r2(r.revenue),
      share: total ? r2((r.revenue / total) * 100) : 0,
      margin: r.revenue ? r2(((r.revenue - r.cost) / r.revenue) * 100) : 0,
      change: before[r.id] ? pctChange(r.revenue, before[r.id].revenue) : null,
      abc: share <= 80 ? 'A' : share <= 95 ? 'B' : 'C'
    };
  });
}

export function topProducts(org, from, to, limit = 5) {
  return productTable(org, from, to).slice(0, limit);
}

export function categoryBreakdown(org, from, to) {
  const rows = db.prepare(`
    SELECT p.category, SUM(i.qty*i.unit_price) revenue
    FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
    WHERE o.org_id = ? AND o.date BETWEEN ? AND ? GROUP BY p.category ORDER BY revenue DESC`).all(org, from, to);
  const total = rows.reduce((s, r) => s + r.revenue, 0);
  return rows.map((r) => ({ category: r.category, revenue: r2(r.revenue), share: total ? r2((r.revenue / total) * 100) : 0 }));
}

export function dailySeries(org, from, to) {
  // Comparação alinhada por dia da semana: cada dia é comparado ao mesmo dia N semanas antes.
  const span = daysBetween(from, to) + 1;
  const step = 7 * Math.ceil(span / 7);
  const q = db.prepare('SELECT date, SUM(total) revenue FROM orders WHERE org_id = ? AND date BETWEEN ? AND ? GROUP BY date');
  const rev = Object.fromEntries(q.all(org, addDays(from, -step), to).map((r) => [r.date, r.revenue]));
  const out = [];
  if (span <= 62) {
    for (let d = from; d <= to; d = addDays(d, 1)) {
      const p = addDays(d, -step);
      if (new Date(d + 'T00:00:00Z').getUTCDay() === 0 && !rev[d] && !rev[p]) continue; // domingo sem expediente
      out.push({ date: d, revenue: r2(rev[d] || 0), previous: r2(rev[p] || 0) });
    }
    return out;
  }
  let cur = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wk = weekRange(d).start;
    if (!cur || cur.date !== wk) { cur = { date: wk < from ? from : wk, key: wk, revenue: 0, previous: 0, unit: 'semana' }; out.push(cur); }
    cur.revenue += rev[d] || 0;
    cur.previous += rev[addDays(d, -step)] || 0;
  }
  return out.map((b) => ({ date: b.date, revenue: r2(b.revenue), previous: r2(b.previous), unit: 'semana' }));
}

export function customersDeclining(org, from, to, limit = 5) {
  const days = daysBetween(from, to) + 1;
  const baseFrom = addMonths(from, -3), baseTo = addDays(from, -1);
  const baseDays = daysBetween(baseFrom, baseTo) + 1;
  const rows = db.prepare(`
    SELECT c.id, c.name,
      SUM(CASE WHEN o.date BETWEEN ? AND ? THEN o.total ELSE 0 END) cur,
      SUM(CASE WHEN o.date BETWEEN ? AND ? THEN o.total ELSE 0 END) base,
      MAX(o.date) last_order
    FROM customers c JOIN orders o ON o.customer_id = c.id
    WHERE c.org_id = ? AND o.date BETWEEN ? AND ?
    GROUP BY c.id`).all(from, to, baseFrom, baseTo, org, baseFrom, to);
  const today = todayStr();
  const lastAny = db.prepare('SELECT MAX(date) d FROM orders WHERE customer_id = ?');
  return rows
    .map((r) => {
      const expected = (r.base / baseDays) * days;
      return { name: r.name, revenue: r2(r.cur), expected: r2(expected), change: expected ? r2(((r.cur - expected) / expected) * 100) : null, lost: r2(expected - r.cur), lastOrder: lastAny.get(r.id).d };
    })
    .filter((r) => r.expected > 3000 && r.change !== null && r.change < -10)
    .sort((a, b) => b.lost - a.lost)
    .slice(0, limit)
    .map((r) => ({ ...r, daysSinceLastOrder: daysBetween(r.lastOrder, today) }));
}

function customerDiff(org, a, b) {
  const q = db.prepare('SELECT c.name, SUM(o.total) v FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.org_id = ? AND o.date BETWEEN ? AND ? GROUP BY c.id');
  const A = Object.fromEntries(q.all(org, a.from, a.to).map((r) => [r.name, r.v]));
  const B = Object.fromEntries(q.all(org, b.from, b.to).map((r) => [r.name, r.v]));
  const names = new Set([...Object.keys(A), ...Object.keys(B)]);
  return [...names].map((n) => ({ name: n, current: r2(A[n] || 0), previous: r2(B[n] || 0), diff: r2((A[n] || 0) - (B[n] || 0)) }));
}

function productDiff(org, a, b) {
  const A = Object.fromEntries(productRows(org, a.from, a.to).map((r) => [r.name, r.revenue]));
  const B = Object.fromEntries(productRows(org, b.from, b.to).map((r) => [r.name, r.revenue]));
  const names = new Set([...Object.keys(A), ...Object.keys(B)]);
  return [...names].map((n) => ({ name: n, current: r2(A[n] || 0), previous: r2(B[n] || 0), diff: r2((A[n] || 0) - (B[n] || 0)) }));
}

export function stockouts(org, from, to) {
  // Produtos com 5+ dias úteis seguidos sem nenhuma venda dentro do período.
  const prods = db.prepare('SELECT id, name, price FROM products WHERE org_id = ?').all(org);
  const q = db.prepare('SELECT DISTINCT o.date FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.org_id = ? AND i.product_id = ? AND o.date BETWEEN ? AND ?');
  const avgQ = db.prepare('SELECT SUM(i.qty*i.unit_price) v FROM order_items i JOIN orders o ON o.id = i.order_id WHERE o.org_id = ? AND i.product_id = ? AND o.date BETWEEN ? AND ?');
  const out = [];
  for (const p of prods) {
    const sold = new Set(q.all(org, p.id, from, to).map((r) => r.date));
    let run = 0, best = 0, start = null, bestStart = null, bestEnd = null;
    for (let d = from; d <= to; d = addDays(d, 1)) {
      if (new Date(d + 'T00:00:00Z').getUTCDay() === 0) continue;
      if (sold.has(d)) { run = 0; start = null; } else { if (!run) start = d; run++; if (run > best) { best = run; bestStart = start; bestEnd = d; } }
    }
    if (best >= 5 && sold.size > 0) {
      const prev = previousPeriod(from, to);
      const prevDaily = (avgQ.get(org, p.id, prev.from, prev.to).v || 0) / 26;
      out.push({ name: p.name, from: bestStart, to: bestEnd, days: best, estimatedLoss: r2(prevDaily * best) });
    }
  }
  return out.sort((a, b) => b.estimatedLoss - a.estimatedLoss);
}

export function comparePeriods(org, a, b) {
  const cur = periodSummary(org, a.from, a.to);
  const prev = periodSummary(org, b.from, b.to);
  const cust = customerDiff(org, a, b).sort((x, y) => x.diff - y.diff);
  const prod = productDiff(org, a, b).sort((x, y) => x.diff - y.diff);
  const drop = r2(prev.revenue - cur.revenue);
  return {
    current: cur, previous: prev, deltas: withDeltas(cur, prev),
    revenueDiff: r2(cur.revenue - prev.revenue),
    biggestCustomerDrops: cust.filter((c) => c.diff < 0).slice(0, 5).map((c) => ({ ...c, shareOfDrop: drop > 0 ? r2((-c.diff / drop) * 100) : null })),
    biggestCustomerGains: cust.filter((c) => c.diff > 0).slice(-3).reverse(),
    biggestProductDrops: prod.filter((p) => p.diff < 0).slice(0, 5),
    biggestProductGains: prod.filter((p) => p.diff > 0).slice(-3).reverse(),
    stockouts: stockouts(org, a.from, a.to).slice(0, 3)
  };
}

export function expensesByCategory(org, from, to) {
  return db.prepare('SELECT category, ROUND(SUM(amount),2) amount FROM expenses WHERE org_id = ? AND date BETWEEN ? AND ? GROUP BY category ORDER BY amount DESC').all(org, from, to);
}

export function bills(org, kind, { days = 7, includeOverdue = true } = {}) {
  const today = todayStr();
  const rows = db.prepare(`SELECT party, due_date, amount FROM bills WHERE org_id = ? AND kind = ? AND paid_at IS NULL AND due_date <= ? ${includeOverdue ? '' : 'AND due_date >= ?'} ORDER BY due_date`)
    .all(...[org, kind, addDays(today, days)].concat(includeOverdue ? [] : [today]));
  return rows.map((r) => {
    const d = daysBetween(today, r.due_date);
    return { party: r.party, dueDate: r.due_date, amount: r.amount, daysToDue: d, status: d < 0 ? 'vencida' : d === 0 ? 'hoje' : 'a vencer' };
  });
}

export function receivablesSummary(org) {
  const today = todayStr();
  const r = db.prepare("SELECT COALESCE(SUM(amount),0) total, COUNT(*) n, SUM(CASE WHEN due_date < ? THEN 1 ELSE 0 END) overdue, COALESCE(SUM(CASE WHEN due_date < ? THEN amount ELSE 0 END),0) overdueAmount FROM bills WHERE org_id = ? AND kind = 'receber' AND paid_at IS NULL").get(today, today, org);
  return { total: r2(r.total), count: r.n, overdue: r.overdue || 0, overdueAmount: r2(r.overdueAmount) };
}

export function goalProgress(org, month = todayStr()) {
  const today = todayStr();
  const from = monthStart(month), end = monthEnd(month);
  const to = end < today ? end : today;
  const g = db.prepare('SELECT revenue_target FROM goals WHERE org_id = ? AND month = ?').get(org, monthKey(month));
  const s = periodSummary(org, from, to);
  const elapsed = daysBetween(from, to) + 1, total = daysBetween(from, end) + 1;
  const target = g ? g.revenue_target : null;
  return { month: monthKey(month), label: monthLabel(month), target, revenue: s.revenue, achieved: target ? r2((s.revenue / target) * 100) : null, expectedByNow: target ? r2(target * (elapsed / total)) : null, onPace: target ? s.revenue >= target * (elapsed / total) * 0.97 : null, elapsedDays: elapsed, totalDays: total };
}

export function weeklyReport(org, refDate = todayStr()) {
  const thisWeek = weekRange(refDate);
  const last = weekRange(addDays(thisWeek.start, -1)); // última semana completa
  const before = weekRange(addDays(last.start, -1));
  const cmp = comparePeriods(org, { from: last.start, to: last.end }, { from: before.start, to: before.end });
  return {
    week: isoWeek(last.start), from: last.start, to: last.end, label: `Semana ${isoWeek(last.start)} · ${brDate(last.start).slice(0, 5)} a ${brDate(last.end).slice(0, 5)}`,
    summary: cmp.current, previous: cmp.previous, deltas: cmp.deltas,
    highlights: { customersUp: cmp.biggestCustomerGains, productsUp: cmp.biggestProductGains },
    concerns: { customersDown: cmp.biggestCustomerDrops.slice(0, 3), productsDown: cmp.biggestProductDrops.slice(0, 3) },
    attention: attentionIndicators(org)
  };
}

export function attentionIndicators(org) {
  const today = todayStr();
  const items = [];
  const overdue = bills(org, 'pagar', { days: 0 }).filter((b) => b.status === 'vencida');
  if (overdue.length) items.push({ severity: 'alta', title: 'Contas a pagar vencidas', detail: `${overdue.length} conta(s) vencida(s)`, value: r2(overdue.reduce((s, b) => s + b.amount, 0)), items: overdue });
  const rec = receivablesSummary(org);
  if (rec.overdue) items.push({ severity: 'media', title: 'Recebimentos atrasados', detail: `${rec.overdue} título(s) de clientes vencidos`, value: rec.overdueAmount });
  const top = db.prepare(`SELECT c.name, MAX(o.date) last, SUM(o.total) v FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.org_id = ? AND o.date >= ? GROUP BY c.id ORDER BY v DESC LIMIT 20`).all(org, addMonths(today, -3));
  for (const c of top) {
    const d = daysBetween(c.last, today);
    if (d >= 14) items.push({ severity: 'alta', title: `${c.name} sem pedidos`, detail: `Último pedido há ${d} dias — é um dos 20 maiores clientes`, value: d, unit: 'dias' });
  }
  const recent = previousPeriod(addDays(today, -20), today);
  const pd = productDiff(org, { from: addDays(today, -20), to: today }, recent).filter((p) => p.previous > 2000 && p.diff / p.previous < -0.25);
  for (const p of pd.slice(0, 2)) items.push({ severity: 'media', title: `${p.name} em queda`, detail: `Vendas ${Math.round((p.diff / p.previous) * 100)}% nas últimas 3 semanas`, value: r2(p.diff) });
  const gp = goalProgress(org);
  if (gp.target && !gp.onPace) items.push({ severity: 'media', title: 'Meta do mês em risco', detail: `${gp.achieved}% da meta com ${gp.elapsedDays} de ${gp.totalDays} dias`, value: r2(gp.expectedByNow - gp.revenue) });
  const ref = refMonth(today);
  const cm = periodSummary(org, ref, monthEnd(ref)), pm = periodSummary(org, addMonths(ref, -1), monthEnd(addMonths(ref, -1)));
  if (cm.netMargin < pm.netMargin - 2) items.push({ severity: 'media', title: 'Margem líquida caiu', detail: `${cm.netMargin.toFixed(1)}% em ${monthLabel(ref)} contra ${pm.netMargin.toFixed(1)}% no mês anterior`, value: r2(cm.netMargin - pm.netMargin), unit: 'p.p.' });
  const order = { alta: 0, media: 1, info: 2 };
  return items.sort((a, b) => order[a.severity] - order[b.severity]);
}

export function dashboard(org, month) {
  const m = month || refMonth();
  const from = monthStart(m), to = monthEnd(m);
  const prev = previousPeriod(from, to);
  const cur = periodSummary(org, from, to), before = periodSummary(org, prev.from, prev.to);
  return {
    month: monthKey(m), label: monthLabel(m), previousLabel: monthLabel(prev.from),
    kpis: cur, previous: before, deltas: withDeltas(cur, before),
    receivables: receivablesSummary(org),
    series: monthlySeries(org, m, 12),
    topProducts: topProducts(org, from, to, 5),
    decliningCustomers: customersDeclining(org, from, to, 4),
    billsDue: bills(org, 'pagar', { days: 7 }).slice(0, 5),
    goal: goalProgress(org)
  };
}

export function salesView(org, from, to) {
  const prev = previousPeriod(from, to);
  const cur = periodSummary(org, from, to), before = periodSummary(org, prev.from, prev.to);
  return { from, to, previous: prev, kpis: cur, before, deltas: withDeltas(cur, before), daily: dailySeries(org, from, to), categories: categoryBreakdown(org, from, to), products: productTable(org, from, to) };
}

/**
 * Receita × meta em blocos: dias (até 62 dias), semanas (até ~6 meses) ou meses.
 * A meta diária é a meta do mês dividida pelos dias do mês.
 */
export function goalSeries(org, from, to) {
  const span = daysBetween(from, to) + 1;
  const unit = span <= 31 ? 'dia' : span <= 190 ? 'semana' : 'mes';
  const revQ = db.prepare('SELECT date, SUM(total) v FROM orders WHERE org_id = ? AND date BETWEEN ? AND ? GROUP BY date').all(org, from, to);
  const rev = Object.fromEntries(revQ.map((r) => [r.date, r.v]));
  const goals = Object.fromEntries(db.prepare('SELECT month, revenue_target FROM goals WHERE org_id = ?').all(org).map((g) => [g.month, g.revenue_target]));
  // A meta do mês é distribuída pelos dias úteis (sábado conta 30%, domingo não conta).
  const wDay = (d) => [0, 1, 1, 1, 1, 1, 0.3][new Date(d + 'T00:00:00Z').getUTCDay()];
  const monthW = {};
  const monthWeight = (d) => {
    const k = monthKey(d);
    if (monthW[k] === undefined) { let w = 0; for (let x = monthStart(d); x <= monthEnd(d); x = addDays(x, 1)) w += wDay(x); monthW[k] = w; }
    return monthW[k];
  };
  const dayGoal = (d) => { const g = goals[monthKey(d)]; return g ? (g * wDay(d)) / monthWeight(d) : 0; };
  const today = todayStr();
  const buckets = [];
  let cur = null;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    let key, label, full;
    if (unit === 'dia') { key = d; label = brDate(d).slice(0, 5); full = brDate(d); }
    else if (unit === 'semana') { const w = weekRange(d); key = w.start; label = brDate(w.start).slice(0, 5); full = `Semana de ${brDate(w.start).slice(0, 5)} a ${brDate(w.end).slice(0, 5)}`; }
    else { key = monthKey(d); label = monthLabel(d, true); full = monthLabel(d); }
    if (!cur || cur.key !== key) { cur = { key, label, full, revenue: 0, goal: 0, partial: false, from: d, to: d }; buckets.push(cur); }
    cur.to = d;
    cur.revenue += rev[d] || 0;
    cur.goal += dayGoal(d);
  }
  for (const b of buckets) {
    if (unit !== 'dia' && b.to >= today) b.partial = true;
    b.weekend = unit === 'dia' && wDay(b.from) === 0;
    // Mês/semana cortados pelo filtro: a meta acompanha só os dias dentro do filtro.
    b.revenue = r2(b.revenue); b.goal = Math.round(b.goal);
  }
  const totalRevenue = r2(buckets.reduce((s, b) => s + b.revenue, 0)), totalGoal = Math.round(buckets.reduce((s, b) => s + b.goal, 0));
  return { from, to, unit, buckets, totalRevenue, totalGoal, achieved: totalGoal ? r2((totalRevenue / totalGoal) * 100) : null, hits: buckets.filter((b) => b.goal && b.revenue >= b.goal).length };
}
