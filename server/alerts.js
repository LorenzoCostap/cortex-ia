// Alertas: regras que vigiam os dados e avisam quando algo foge do normal.
// Cada alerta tem uma chave estável; se a situação some, o alerta é marcado como resolvido.
import { db, getSettings } from './db.js';
import * as M from './metrics.js';
import { cashflow } from './cashflow.js';
import { todayStr, addDays, refMonth, monthEnd, monthLabel, daysBetween, brDate } from './dates.js';

export const RULES = [
  { key: 'cliente', title: 'Cliente fora do ritmo de compra', text: 'Quando passa 2× o intervalo normal sem pedir, ou compra muito abaixo da média' },
  { key: 'meta', title: 'Meta do mês em risco', text: 'Previsão de fechamento abaixo do percentual definido' },
  { key: 'caixa', title: 'Saldo abaixo do mínimo', text: 'Quando a projeção do fluxo de caixa fura o mínimo de segurança' },
  { key: 'conta', title: 'Conta vencida', text: 'A pagar vencida, ou a receber vencida há mais de 7 dias' },
  { key: 'orcamento', title: 'Orçamento de despesa estourado', text: 'Quando uma categoria de despesa passa do valor orçado no mês' },
  { key: 'produto', title: 'Produto em queda', text: 'Vendas das últimas 2 semanas abaixo da média das 8 anteriores' }
];

const kfmt = (v) => `R$ ${(Math.abs(v) / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
const brl = (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const ord = (n) => `${n}º`;

function customerAlerts(org, today) {
  const out = [];
  const from180 = addDays(today, -180), from365 = addDays(today, -365);
  const rank = db.prepare('SELECT customer_id id, SUM(total) v FROM orders WHERE org_id = ? AND date >= ? GROUP BY customer_id ORDER BY v DESC').all(org, from365);
  const pos = Object.fromEntries(rank.map((r, i) => [r.id, i + 1]));
  const rows = db.prepare(`SELECT c.id, c.name, c.seller, COUNT(DISTINCT o.date) days, MIN(o.date) first, MAX(o.date) last, SUM(o.total) total
    FROM customers c JOIN orders o ON o.customer_id = c.id WHERE c.org_id = ? AND o.date >= ? GROUP BY c.id`).all(org, from180);
  for (const r of rows) {
    const monthly = r.total / 6;
    if (r.days < 6 || monthly < 5000) continue; // só clientes relevantes e recorrentes
    const freq = daysBetween(r.first, r.last) / (r.days - 1);
    const since = daysBetween(r.last, today);
    if (since > Math.max(2 * freq, 7)) {
      const p = pos[r.id];
      out.push({ key: `cliente:${r.id}`, rule: 'cliente', category: 'clientes', severity: p <= 10 || since > 4 * freq ? 'alta' : 'media', title: `${r.name} parou de comprar`,
        text: `Último pedido há ${since} dias. O normal deste cliente é comprar ${freq < 1.5 ? 'quase todo dia' : `a cada ${Math.round(freq)} dias`}${p ? ` — é o ${ord(p)} maior cliente da empresa` : ''}.${r.seller ? ` Vendedor(a): ${r.seller}.` : ''}`,
        link: `/clientes/${r.id}`, cta: 'Ver cliente', weight: monthly });
    }
  }
  // Abaixo do padrão no último mês fechado (sem ter parado)
  const ref = refMonth(today);
  for (const c of M.customersDeclining(org, ref, monthEnd(ref), 8)) {
    if (out.some((a) => a.key === `cliente:${c.id}`) || c.change > -25 || c.lost < 5000) continue;
    out.push({ key: `cliente:${c.id}`, rule: 'cliente', category: 'clientes', severity: 'media', title: `${c.name} abaixo do padrão`,
      text: `Comprou ${Math.abs(Math.round(c.change))}% menos em ${monthLabel(ref).split(' ')[0].toLowerCase()} do que a média dos 3 meses anteriores (${kfmt(c.lost)} a menos).`,
      link: `/clientes/${c.id}`, cta: 'Ver cliente', weight: c.lost });
  }
  return out.sort((a, b) => b.weight - a.weight).slice(0, 6);
}

function goalAlert(org, pctLimit, staleUntil = null) {
  const f = M.forecast(org);
  if (staleUntil && f.target && !f.closed && !f.realized) {
    return [{ key: `meta:${f.label}`, rule: 'meta', category: 'vendas', severity: 'info', title: `Sem vendas de ${f.label.split(' ')[0].toLowerCase()} no sistema`,
      text: `As vendas importadas vão até ${brDate(staleUntil)}. Importe as vendas recentes para acompanhar a meta de ${kfmt(f.target)}.`, link: '/importacao', cta: 'Importar vendas' }];
  }
  if (!f.target || f.closed || f.projectionPct === null || f.businessDaysTotal - f.businessDaysLeft < 3 || f.projectionPct >= pctLimit) return [];
  return [{ key: `meta:${f.label}`, rule: 'meta', category: 'vendas', severity: f.projectionPct < 85 ? 'alta' : 'media', title: `Meta de ${f.label.split(' ')[0].toLowerCase()} em risco`,
    text: `No ritmo atual o mês fecha em ${kfmt(f.projection)} (${f.projectionPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% da meta de ${kfmt(f.target)}). É preciso vender ${brl(f.requiredPerDay)} por dia útil.`,
    link: '/metas', cta: 'Ver metas' }];
}

function cashAlert(org) {
  const c = cashflow(org, 90);
  if (!c.hasBalance || !c.firstBelow) return [];
  const when = c.firstBelow === c.today ? 'hoje' : `em ${brDate(c.firstBelow).slice(0, 5)}`;
  return [{ key: 'caixa', rule: 'caixa', category: 'financeiro', severity: 'alta', title: `Saldo abaixo do mínimo ${when}`,
    text: `A projeção chega a ${kfmt(c.minBalance)} em ${brDate(c.minDate).slice(0, 5)}${c.culprits.length ? `, semana de ${c.culprits.join(' e ')}` : ''}. Mínimo definido: ${kfmt(c.minimum)}.`,
    link: '/fluxo-de-caixa', cta: 'Ver fluxo de caixa' }];
}

function billAlerts(org, today) {
  return db.prepare('SELECT id, kind, party, due_date, amount FROM bills WHERE org_id = ? AND paid_at IS NULL AND due_date < ? ORDER BY amount DESC').all(org, today)
    .filter((b) => b.kind === 'pagar' || daysBetween(b.due_date, today) > 7)
    .slice(0, 8)
    .map((b) => {
      const d = daysBetween(b.due_date, today);
      return b.kind === 'pagar'
        ? { key: `conta:${b.id}`, rule: 'conta', category: 'financeiro', severity: d > 15 ? 'alta' : 'info', title: `Conta vencida: ${b.party}`, text: `${brl(b.amount)} venceu em ${brDate(b.due_date)} e ainda não foi marcada como paga.`, link: '/fluxo-de-caixa', cta: 'Ver contas' }
        : { key: `conta:${b.id}`, rule: 'conta', category: 'financeiro', severity: d > 30 ? 'alta' : 'media', title: `Recebimento atrasado: ${b.party}`, text: `${brl(b.amount)} venceu em ${brDate(b.due_date)} (há ${d} dias). Vale cobrar no próximo contato.`, link: '/fluxo-de-caixa', cta: 'Ver contas' };
    });
}

function productAlerts(org, today, dropPct) {
  const end = addDays(today, -1), mid = addDays(today, -14), start = addDays(today, -70);
  const rows = db.prepare(`SELECT p.id, p.name,
      SUM(CASE WHEN o.date >= ? THEN i.qty*i.unit_price ELSE 0 END) recent,
      SUM(CASE WHEN o.date < ? THEN i.qty*i.unit_price ELSE 0 END) base,
      0 x
    FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id
    WHERE o.org_id = ? AND o.date BETWEEN ? AND ? GROUP BY p.id`).all(mid, mid, org, start, end);
  return rows
    .map((r) => ({ ...r, expected: r.base / 4, change: r.base ? ((r.recent - r.base / 4) / (r.base / 4)) * 100 : 0 }))
    .filter((r) => r.expected >= 2000 && r.change <= -dropPct)
    .sort((a, b) => (a.recent - a.expected) - (b.recent - b.expected))
    .slice(0, 4)
    .map((r) => ({ key: `produto:${r.id}`, rule: 'produto', category: 'vendas', severity: r.change <= -50 ? 'alta' : 'media', title: `${r.name} em queda`,
      text: `Vendas das últimas 2 semanas ${Math.abs(Math.round(r.change))}% abaixo da média (${kfmt(r.recent)} contra ${kfmt(r.expected)} esperados).`,
      link: '/vendas', cta: 'Ver vendas' }));
}

function budgetAlerts(org, today) {
  const month = today.slice(0, 7);
  const items = M.goalItems(org, month, 'despesa').filter((i) => i.target);
  const ms = `${month}-01`, me = monthEnd(ms);
  const mes = monthLabel(ms).split(' ')[0].toLowerCase();
  return items.flatMap((i) => {
    if (i.realized > i.target) return [{ key: `orcamento:${month}:${i.key}`, rule: 'orcamento', category: 'financeiro', severity: i.realized > i.target * 1.1 ? 'alta' : 'media', title: `${i.key}: orçamento de ${mes} estourado`,
      text: `Gasto de ${brl(i.realized)} contra ${brl(i.target)} orçados (${Math.round(i.pct)}%) — ${brl(i.realized - i.target)} acima.`, link: '/metas?aba=despesa', cta: 'Ver orçamento' }];
    return [];
  });
}

export function evaluate(org) {
  const today = todayStr();
  const cfg = getSettings(org).alerts;
  const on = cfg.rules || {};
  const act = M.activityDate(org, today); // clientes/produtos: a partir da última venda importada, se os dados estiverem atrasados
  const all = [];
  const safe = (fn) => { try { all.push(...fn()); } catch (e) { console.error('[alertas]', e.message); } };
  const note = act !== today ? ` (vendas importadas até ${brDate(addDays(act, -1))}.)` : '';
  const withNote = (fn) => () => fn().map((x) => ({ ...x, text: x.text + note }));
  if (on.cliente) safe(withNote(() => customerAlerts(org, act)));
  if (on.meta) safe(() => goalAlert(org, +cfg.metaPct || 95, act !== today ? addDays(act, -1) : null));
  if (on.caixa) safe(() => cashAlert(org));
  if (on.conta) safe(() => billAlerts(org, today));
  if (on.orcamento !== false) safe(() => budgetAlerts(org, today));
  if (on.produto) safe(withNote(() => productAlerts(org, act, +cfg.productDrop || 35)));
  return all;
}

/** Recalcula: cria os novos, atualiza o texto dos abertos e resolve os que sumiram. Retorna os novos. */
export function refreshAlerts(org) {
  const found = evaluate(org);
  const open = Object.fromEntries(db.prepare('SELECT key, id, title, text FROM alerts WHERE org_id = ? AND resolved_at IS NULL').all(org).map((r) => [r.key, r]));
  const created = [];
  db.transaction(() => {
    for (const a of found) {
      const cur = open[a.key];
      if (cur) {
        if (cur.title !== a.title || cur.text !== a.text) db.prepare("UPDATE alerts SET title = ?, text = ?, severity = ?, link = ?, cta = ?, updated_at = datetime('now') WHERE id = ?").run(a.title, a.text, a.severity, a.link, a.cta, cur.id);
        delete open[a.key];
      } else {
        // Reabre um alerta resolvido com a mesma chave (como novo), ou cria
        const r = db.prepare(`INSERT INTO alerts (org_id, key, rule, category, severity, title, text, link, cta) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(org_id, key) DO UPDATE SET rule = excluded.rule, category = excluded.category, severity = excluded.severity, title = excluded.title, text = excluded.text, link = excluded.link, cta = excluded.cta,
            created_at = datetime('now'), updated_at = datetime('now'), read_at = NULL, resolved_at = NULL`).run(org, a.key, a.rule, a.category, a.severity, a.title, a.text, a.link, a.cta);
        created.push({ ...a, id: r.lastInsertRowid });
      }
    }
    for (const r of Object.values(open)) db.prepare("UPDATE alerts SET resolved_at = datetime('now') WHERE id = ?").run(r.id);
  })();
  return created;
}

const SEV_ORDER = { alta: 0, media: 1, info: 2 };
export function listAlerts(org, { includeResolved = false } = {}) {
  return db.prepare(`SELECT id, rule, category, severity, title, text, link, cta, created_at createdAt, updated_at updatedAt, read_at readAt, resolved_at resolvedAt FROM alerts WHERE org_id = ? ${includeResolved ? '' : 'AND resolved_at IS NULL'} ORDER BY created_at DESC`).all(org)
    .sort((a, b) => !!a.readAt - !!b.readAt || SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || b.createdAt.localeCompare(a.createdAt));
}

const lastRun = new Map();
/** Recalcula no máximo a cada 5 minutos por organização. */
export function maybeRefreshAlerts(org, minutes = 5) {
  const t = lastRun.get(org) || 0;
  if (Date.now() - t < minutes * 60e3) return [];
  lastRun.set(org, Date.now());
  return refreshAlerts(org);
}

export const unreadCount = (org) => db.prepare('SELECT COUNT(*) n FROM alerts WHERE org_id = ? AND resolved_at IS NULL AND read_at IS NULL').get(org).n;
