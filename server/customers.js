// Detalhe de um cliente e tabela de clientes do período.
import { db } from './db.js';
import { todayStr, addDays, addMonths, monthStart, monthEnd, monthKey, monthLabel, daysBetween, refMonth, brDate } from './dates.js';

const r2 = (v) => Math.round(v * 100) / 100;
const SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const kfmt = (v) => `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`;

export function customerTable(org, from, to, prev, limit = 50) {
  const days = daysBetween(from, to) + 1;
  const pFrom = prev?.from || addDays(from, -days), pTo = prev?.to || addDays(from, -1);
  const rows = db.prepare(`
    SELECT c.id, c.name, c.seller, c.region,
      SUM(CASE WHEN o.date BETWEEN ? AND ? THEN o.total ELSE 0 END) cur,
      SUM(CASE WHEN o.date BETWEEN ? AND ? THEN 1 ELSE 0 END) orders,
      SUM(CASE WHEN o.date BETWEEN ? AND ? THEN o.total ELSE 0 END) prev,
      MAX(o.date) last
    FROM customers c JOIN orders o ON o.customer_id = c.id
    WHERE c.org_id = ? AND (o.date BETWEEN ? AND ? OR o.date BETWEEN ? AND ?)
    GROUP BY c.id HAVING cur > 0 OR prev > 0
    ORDER BY cur DESC LIMIT ?`).all(from, to, from, to, pFrom, pTo, org, from, to, pFrom, pTo, limit);
  const total = rows.reduce((s, r) => s + r.cur, 0) || 1;
  return rows.map((r) => ({ id: r.id, name: r.name, seller: r.seller, region: r.region, revenue: r2(r.cur), orders: r.orders, share: r2((r.cur / total) * 100), change: r.prev ? r2(((r.cur - r.prev) / r.prev) * 100) : null, lastOrder: r.last }));
}

export function customerDetail(org, id) {
  const c = db.prepare('SELECT id, code, name, seller, region FROM customers WHERE id = ? AND org_id = ?').get(+id, org);
  if (!c) return null;
  const today = todayStr(), ref = refMonth(today);
  const sumQ = db.prepare('SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM orders WHERE customer_id = ? AND date BETWEEN ? AND ?');

  // 12 meses até o mês de referência, com o mesmo mês do ano anterior
  const months = [];
  for (let i = 11; i >= 0; i--) {
    const m = addMonths(ref, -i), ly = addMonths(m, -12);
    months.push({ key: monthKey(m), label: SHORT[+m.slice(5, 7) - 1], full: monthLabel(m), value: r2(sumQ.get(c.id, m, monthEnd(m)).v), lastYear: r2(sumQ.get(c.id, ly, monthEnd(ly)).v) });
  }
  const total12 = months.reduce((s, m) => s + m.value, 0);
  const from12 = addMonths(ref, -11), to12 = monthEnd(ref);
  const ranks = db.prepare('SELECT customer_id id, SUM(total) v FROM orders WHERE org_id = ? AND date BETWEEN ? AND ? GROUP BY customer_id ORDER BY v DESC').all(org, from12, to12);
  const rank = ranks.findIndex((r) => r.id === c.id) + 1;

  const cur = months[11], prev = months[10];
  const base3 = (months[8].value + months[9].value + months[10].value) / 3;

  // Frequência: intervalo médio entre dias com pedido nos 6 meses antes do mês de referência
  const dates = db.prepare('SELECT DISTINCT date FROM orders WHERE customer_id = ? AND date BETWEEN ? AND ? ORDER BY date').all(c.id, addMonths(ref, -6), addDays(ref, -1)).map((r) => r.date);
  const freq = dates.length > 1 ? daysBetween(dates[0], dates[dates.length - 1]) / (dates.length - 1) : null;
  const last = db.prepare('SELECT MAX(date) d FROM orders WHERE customer_id = ?').get(c.id).d;
  const sinceLast = last ? daysBetween(last, today) : null;

  const bills = db.prepare("SELECT due_date, amount FROM bills WHERE org_id = ? AND kind = 'receber' AND paid_at IS NULL AND party = ? ORDER BY due_date").all(org, c.name);
  const recv = { total: r2(bills.reduce((s, b) => s + b.amount, 0)), count: bills.length, overdueDays: bills.length && bills[0].due_date < today ? daysBetween(bills[0].due_date, today) : 0, nextDue: bills.find((b) => b.due_date >= today)?.due_date || null };

  const change = base3 ? ((cur.value - base3) / base3) * 100 : null;
  const late = freq && sinceLast !== null && sinceLast > Math.max(freq * 3, 10);
  const status = late || (change !== null && change < -40) ? 'risco' : change !== null && change < -15 ? 'queda' : change !== null && change > 15 ? 'crescendo' : 'estavel';

  // Produtos: média mensal dos 3 meses anteriores × mês de referência
  const prodQ = db.prepare(`SELECT p.name, SUM(CASE WHEN o.date BETWEEN ? AND ? THEN i.qty*i.unit_price ELSE 0 END) cur, SUM(CASE WHEN o.date BETWEEN ? AND ? THEN i.qty*i.unit_price ELSE 0 END) base
    FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
    WHERE o.customer_id = ? AND o.date BETWEEN ? AND ? GROUP BY p.id`);
  const products = prodQ.all(ref, monthEnd(ref), addMonths(ref, -3), addDays(ref, -1), c.id, addMonths(ref, -3), monthEnd(ref))
    .map((p) => ({ name: p.name, avg: r2(p.base / 3), current: r2(p.cur), diff: r2(p.cur - p.base / 3) }))
    .filter((p) => p.avg > 0 || p.current > 0)
    .sort((a, b) => a.diff - b.diff);

  const orders = db.prepare('SELECT id, date, total, external_id FROM orders WHERE customer_id = ? ORDER BY date DESC, id DESC LIMIT 8').all(c.id).map((o) => {
    const items = db.prepare('SELECT p.name, i.qty FROM order_items i JOIN products p ON p.id = i.product_id WHERE i.order_id = ? ORDER BY i.qty*i.unit_price DESC').all(o.id);
    return { id: o.id, number: o.external_id, date: o.date, total: r2(o.total), items: items.length, summary: items.slice(0, 2).map((x) => x.name).join(', ') + (items.length > 2 ? ` e mais ${items.length - 2}` : '') };
  });

  // Leitura automática (sem IA): números que já estão na tela, em texto.
  const reading = [];
  reading.push(`${c.name} comprava em média **${kfmt(base3)} por mês** nos três meses anteriores${freq ? (freq < 1.5 ? ', com pedidos quase diários' : `, com pedidos a cada ${Math.round(freq)} dias`) : ''}.`);
  if (change !== null) reading.push(`Em ${cur.full.split(' ')[0].toLowerCase()} foram ${kfmt(cur.value)} (${change >= 0 ? '+' : '−'}${Math.abs(Math.round(change))}% contra essa média).`);
  if (late) reading.push(`O último pedido foi em ${brDate(last)}, há ${sinceLast} dias — bem acima do intervalo normal.`);
  const drops = products.filter((p) => p.diff < -500).slice(0, 2);
  if (drops.length && change !== null && change < 0) reading.push(`A maior queda está em ${drops.map((p) => p.name).join(' e ')}.`);
  let suggestion = null;
  if (status === 'risco' || status === 'queda') suggestion = `${c.seller ? `Contato de ${c.seller.split(' ')[0]}` : 'Contato comercial'} esta semana${drops.length ? `, com condição para ${drops.map((p) => p.name.split(' ')[0].toLowerCase()).join(' e ')}` : ''}${recv.overdueDays ? ', e cobrança do título vencido no mesmo contato' : ''}.`;
  else if (recv.overdueDays) suggestion = `Cobrar o título vencido há ${recv.overdueDays} dias.`;

  return {
    id: c.id, code: c.code, name: c.name, seller: c.seller, region: c.region, status,
    total12: r2(total12), rank, customers: ranks.length,
    month: { label: cur.full, value: cur.value, prevLabel: prev.full, prev: prev.value, change: prev.value ? r2(((cur.value - prev.value) / prev.value) * 100) : null },
    frequencyDays: freq ? r2(freq) : null, lastOrder: last, daysSinceLastOrder: sinceLast,
    receivables: recv, months, products: products.slice(0, 8), orders,
    reading: reading.join(' '), suggestion
  };
}
