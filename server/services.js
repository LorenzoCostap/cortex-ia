// Insights automáticos, relatórios, agendamentos e o canal ao vivo da TV.
import { db, getSettings, logEvent } from './db.js';
import * as M from './metrics.js';
import { QUESTIONS, answerIntent, brl, pct } from './answers.js';
import { ollamaStatus, rephrase } from './ai.js';
import { todayStr, refMonth, monthEnd, monthLabel, addMonths, monthStart, isIso, brDate, weekRange, addDays, isoWeek, weekday } from './dates.js';

/* ---------------- Canal ao vivo (Server-Sent Events) ---------------- */
const clients = new Map(); // orgId -> Set(res)

export function subscribe(orgId, res) {
  if (!clients.has(orgId)) clients.set(orgId, new Set());
  clients.get(orgId).add(res);
  return () => clients.get(orgId)?.delete(res);
}

export function broadcast(orgId, event, data) {
  for (const res of clients.get(orgId) || []) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const tvCount = (orgId) => (clients.get(orgId)?.size || 0);

/* ---------------- Insights ---------------- */
const running = new Set();

export async function refreshInsights(orgId, { force = false } = {}) {
  if (running.has(orgId)) return;
  const last = db.prepare('SELECT MAX(created_at) t FROM insights WHERE org_id = ?').get(orgId).t;
  if (!force && last && Date.now() - new Date(last + 'Z').getTime() < 55 * 60e3) return;
  running.add(orgId);
  try {
    const settings = getSettings(orgId);
    const st = settings.ai.autoInsights ? await ollamaStatus(settings.ai) : { online: false };
    const rows = [];
    for (const q of QUESTIONS) {
      const a = answerIntent(orgId, q.key);
      let text = a.short || a.answer.replace(/\*\*/g, '');
      let source = 'auto';
      if (st.online && st.hasModel) {
        try {
          const r = await rephrase(settings.ai, q.text, a.answer.replace(/\*\*/g, ''));
          if (r && r.length < 400) { text = r; source = 'ia'; }
        } catch { /* mantém a versão automática */ }
      }
      rows.push([orgId, q.key, q.text, text, JSON.stringify(a.rows || []), a.severity || 'info', source]);
    }
    db.transaction(() => {
      db.prepare('DELETE FROM insights WHERE org_id = ?').run(orgId);
      const ins = db.prepare('INSERT INTO insights (org_id, qkey, question, answer, rows_json, severity, source) VALUES (?, ?, ?, ?, ?, ?, ?)');
      rows.forEach((r) => ins.run(...r));
    })();
    broadcast(orgId, 'insights', { updatedAt: new Date().toISOString() });
  } finally {
    running.delete(orgId);
  }
}

export function getInsights(orgId) {
  return db.prepare('SELECT qkey, question, answer, rows_json, severity, source, created_at FROM insights WHERE org_id = ? ORDER BY id').all(orgId)
    .map((r) => ({ key: r.qkey, question: r.question, answer: r.answer, rows: JSON.parse(r.rows_json), severity: r.severity, source: r.source, createdAt: r.created_at }));
}

/* ---------------- Relatórios ---------------- */
export const REPORT_TYPES = {
  executivo: 'Executivo semanal',
  dre: 'DRE mensal',
  produtos: 'Vendas por produto',
  clientes: 'Clientes em risco',
  caixa: 'Contas e fluxo de caixa'
};

function resolvePeriod(type, period) {
  const today = todayStr();
  if (period?.from && period?.to && isIso(period.from) && isIso(period.to) && period.from <= period.to) return { from: period.from, to: period.to, label: `${brDate(period.from)} a ${brDate(period.to)}` };
  if (type === 'executivo') {
    const w = weekRange(addDays(weekRange(today).start, -1));
    return { from: w.start, to: w.end, label: `Semana ${isoWeek(w.start)} · ${brDate(w.start).slice(0, 5)} a ${brDate(w.end).slice(0, 5)}` };
  }
  const r = refMonth(today);
  return { from: r, to: monthEnd(r), label: monthLabel(r) };
}

export function buildReport(orgId, type, period) {
  const p = resolvePeriod(type, period);
  const prev = M.previousPeriod(p.from, p.to);
  const cur = M.periodSummary(orgId, p.from, p.to), before = M.periodSummary(orgId, prev.from, prev.to);
  const deltas = M.withDeltas(cur, before);
  const kpis = [
    { label: 'Faturamento', value: brl(cur.revenue), delta: pct(deltas.revenue), tone: deltas.revenue >= 0 ? 'pos' : 'neg' },
    { label: 'Lucro', value: brl(cur.profit), delta: pct(deltas.profit), tone: deltas.profit >= 0 ? 'pos' : 'neg' },
    { label: 'Margem líquida', value: `${cur.netMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, delta: `${deltas.netMarginPp >= 0 ? '+' : '−'}${Math.abs(deltas.netMarginPp).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p.`, tone: deltas.netMarginPp >= 0 ? 'pos' : 'neg' },
    { label: 'Pedidos', value: cur.orders.toLocaleString('pt-BR'), delta: pct(deltas.orders), tone: deltas.orders >= 0 ? 'pos' : 'neg' }
  ];
  const cmp = M.comparePeriods(orgId, { from: p.from, to: p.to }, prev);
  const content = { period: p, kpis, sections: [] };
  const up = deltas.revenue >= 0;
  content.summary = `${up ? 'Período de crescimento' : 'Período de queda'}: o faturamento ${up ? 'subiu' : 'caiu'} ${pct(Math.abs(deltas.revenue), false)} em relação ao período anterior${cmp.biggestCustomerDrops[0] && !up ? `, puxado principalmente por ${cmp.biggestCustomerDrops[0].name}` : ''}. A margem líquida ficou em ${cur.netMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%.`;

  if (type === 'executivo' || type === 'dre' || type === 'clientes' || type === 'produtos') {
    content.highlights = [
      ...cmp.biggestCustomerGains.slice(0, 2).map((c) => `${c.name} comprou ${brl(c.diff)} a mais`),
      ...cmp.biggestProductGains.slice(0, 1).map((c) => `${c.name}: +${brl(c.diff)} em vendas`)
    ];
    content.concerns = [
      ...cmp.biggestCustomerDrops.slice(0, 2).map((c) => `${c.name} comprou ${brl(-c.diff)} a menos`),
      ...cmp.stockouts.slice(0, 1).map((s) => `${s.name} ficou ${s.days} dias sem vender`),
      ...M.attentionIndicators(orgId).filter((a) => a.severity === 'alta').slice(0, 2).map((a) => a.title)
    ];
  }
  if (type === 'dre') {
    content.sections.push({ title: 'Demonstrativo de resultado', table: { head: ['Linha', 'Valor', '% da receita'], rows: [
      ['Receita bruta', brl(cur.revenue), '100%'],
      ['(−) Custo das mercadorias', brl(-cur.cogs), `${((cur.cogs / cur.revenue) * 100 || 0).toFixed(1).replace('.', ',')}%`],
      ['= Lucro bruto', brl(cur.revenue - cur.cogs), `${cur.grossMargin.toFixed(1).replace('.', ',')}%`],
      ...M.expensesByCategory(orgId, p.from, p.to).map((e) => [`(−) ${e.category}`, brl(-e.amount), `${((e.amount / cur.revenue) * 100 || 0).toFixed(1).replace('.', ',')}%`]),
      ['= Lucro líquido', brl(cur.profit), `${cur.netMargin.toFixed(1).replace('.', ',')}%`]
    ] } });
  }
  if (type === 'produtos' || type === 'executivo') {
    content.sections.push({ title: 'Produtos com mais receita', table: { head: ['Produto', 'Receita', 'Var.', 'Classe'], rows: M.topProducts(orgId, p.from, p.to, type === 'produtos' ? 15 : 5).map((x) => [x.name, brl(x.revenue), pct(x.change), x.abc]) } });
  }
  if (type === 'clientes' || type === 'executivo') {
    content.sections.push({ title: 'Clientes comprando menos', table: { head: ['Cliente', 'Variação', 'Perda estimada', 'Último pedido'], rows: M.customersDeclining(orgId, p.from, p.to, type === 'clientes' ? 10 : 4).map((x) => [x.name, pct(x.change), brl(x.lost), `há ${x.daysSinceLastOrder} dias`]) } });
  }
  if (type === 'caixa') {
    const pagar = M.bills(orgId, 'pagar', { days: 30 }), receber = M.bills(orgId, 'receber', { days: 30 });
    const tp = pagar.reduce((s, b) => s + b.amount, 0), tr = receber.reduce((s, b) => s + b.amount, 0);
    content.summary = `Nos próximos 30 dias há ${brl(tr)} a receber e ${brl(tp)} a pagar (saldo previsto de ${brl(tr - tp)}).`;
    content.sections.push({ title: 'A pagar', table: { head: ['Fornecedor', 'Vencimento', 'Valor', 'Situação'], rows: pagar.map((b) => [b.party, brDate(b.dueDate), brl(b.amount), b.status]) } });
    content.sections.push({ title: 'A receber', table: { head: ['Cliente', 'Vencimento', 'Valor', 'Situação'], rows: receber.map((b) => [b.party, brDate(b.dueDate), brl(b.amount), b.status]) } });
  }
  return { type, typeLabel: REPORT_TYPES[type] || type, title: `${REPORT_TYPES[type] || 'Relatório'} · ${p.label}`, periodLabel: p.label, content };
}

export function saveReport(orgId, userId, report, mode = 'manual') {
  const id = db.prepare('INSERT INTO reports (org_id, type, title, period_label, mode, content_json, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(orgId, report.type, report.title, report.periodLabel, mode, JSON.stringify(report.content), userId ?? null).lastInsertRowid;
  logEvent(orgId, userId, 'report', report.title, 'ok', { reportId: id, mode });
  return id;
}

/* ---------------- Agendador (roda a cada minuto) ---------------- */
function runSchedules(orgId) {
  const s = getSettings(orgId).schedules;
  const now = new Date();
  const today = todayStr();
  const exists = (type, since) => db.prepare("SELECT 1 FROM reports WHERE org_id = ? AND type = ? AND mode = 'agendado' AND created_at >= ?").get(orgId, type, since);
  if (s.weekly?.enabled && weekday(today) === s.weekly.weekday && now.getHours() >= s.weekly.hour) {
    if (!exists('executivo', today)) {
      const id = saveReport(orgId, null, buildReport(orgId, 'executivo'), 'agendado');
      broadcast(orgId, 'report', { id });
    }
  }
  if (s.monthly?.enabled && +today.slice(8) === s.monthly.day && now.getHours() >= s.monthly.hour) {
    if (!exists('dre', today)) saveReport(orgId, null, buildReport(orgId, 'dre'), 'agendado');
  }
}

export function startScheduler() {
  const tick = async () => {
    for (const { id } of db.prepare('SELECT id FROM organizations').all()) {
      try { runSchedules(id); await refreshInsights(id); } catch (e) { console.error('[agendador]', e.message); }
    }
  };
  tick();
  return setInterval(tick, 60e3);
}

export { monthStart, addMonths };
