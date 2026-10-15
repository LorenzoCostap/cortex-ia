// Mini gráficos para as respostas do assistente.
// Formatos: bars (barras horizontais), line (linha) e pair (dois períodos lado a lado).
import * as M from './metrics.js';
import { cashflow } from './cashflow.js';
import { refMonth, monthEnd, addMonths, monthLabel, brDate } from './dates.js';

const rng = (p) => `${brDate(p.from).slice(0, 5)} a ${brDate(p.to).slice(0, 5)}`;
const short = (s, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Gráfico a partir do resultado de uma ferramenta (usado com a IA local). */
export function chartFromTool(name, result) {
  if (!result || result.erro) return null;
  switch (name) {
    case 'top_produtos':
      return Array.isArray(result) && result.length ? { type: 'bars', title: 'Receita por produto', unit: 'brl', items: result.slice(0, 6).map((p) => ({ label: short(p.name), value: p.revenue })) } : null;
    case 'clientes_em_queda':
      return Array.isArray(result) && result.length ? { type: 'bars', title: 'Quanto cada cliente deixou de comprar', unit: 'brl', items: result.slice(0, 6).map((c) => ({ label: short(c.name), value: -Math.abs(c.lost), tone: 'neg' })) } : null;
    case 'vendas_por_categoria':
      return Array.isArray(result) && result.length ? { type: 'bars', title: 'Receita por categoria', unit: 'brl', items: result.slice(0, 6).map((c) => ({ label: c.category, value: c.revenue })) } : null;
    case 'serie_mensal':
      return Array.isArray(result) && result.length > 1 ? { type: 'line', title: 'Faturamento por mês', unit: 'brl', points: result.map((m) => ({ label: m.label, value: m.revenue })) } : null;
    case 'comparar_periodos': {
      const a = result.current, b = result.previous;
      if (!a || !b) return null;
      return { type: 'pair', title: 'Comparação entre os períodos', unit: 'brl', series: [result.labelA || rng(a), result.labelB || rng(b)], items: [['Faturamento', 'revenue'], ['Despesas', 'expenses'], ['Lucro', 'profit']].map(([label, k]) => ({ label, a: a[k], b: b[k] })) };
    }
    case 'margem_periodo':
    case 'resumo_periodo':
      return result.revenue ? { type: 'bars', title: 'Para onde vai a receita', unit: 'brl', items: [{ label: 'Receita', value: result.revenue }, { label: 'Custo das mercadorias', value: -result.cogs, tone: 'neg' }, { label: 'Despesas operacionais', value: -result.opex, tone: 'neg' }, { label: 'Lucro', value: result.profit, tone: result.profit >= 0 ? 'pos' : 'neg' }] } : null;
    case 'fluxo_de_caixa':
      return result.hasBalance ? { type: 'line', title: 'Saldo projetado por semana', unit: 'brl', points: [{ label: 'hoje', value: result.balance }, ...result.weeks.map((w) => ({ label: w.label, value: w.balance }))], ref: result.minimum ? { value: result.minimum, label: 'mínimo' } : null } : null;
    default:
      return null;
  }
}

/** Gráfico para as respostas automáticas (sem IA). */
export function chartForIntent(org, key) {
  const r = refMonth(), p = addMonths(r, -1);
  const a = { from: r, to: monthEnd(r), label: monthLabel(r) }, b = { from: p, to: monthEnd(p), label: monthLabel(p) };
  try {
    switch (key) {
      case 'queda': {
        const c = M.comparePeriods(org, a, b);
        const items = [...c.biggestCustomerDrops.slice(0, 3).map((x) => ({ label: short(x.name), value: x.diff, tone: 'neg' })), ...c.stockouts.slice(0, 1).map((s) => ({ label: short(`Ruptura: ${s.name}`), value: -s.estimatedLoss, tone: 'neg' }))];
        return c.revenueDiff < 0 && items.length ? { type: 'bars', title: `O que puxou a queda de ${a.label.split(' ')[0].toLowerCase()}`, unit: 'brl', items } : chartFromTool('serie_mensal', M.monthlySeries(org, r, 6));
      }
      case 'produtos': return chartFromTool('top_produtos', M.topProducts(org, a.from, a.to, 6));
      case 'clientes': return chartFromTool('clientes_em_queda', M.customersDeclining(org, a.from, a.to, 5));
      case 'margem': {
        const s = M.monthlySeries(org, r, 6);
        return { type: 'line', title: 'Margem líquida por mês', unit: 'pct', points: s.map((m) => ({ label: m.label, value: m.revenue ? Math.round((m.profit / m.revenue) * 1000) / 10 : 0 })) };
      }
      case 'comparar': {
        const c = M.comparePeriods(org, a, b);
        return chartFromTool('comparar_periodos', { ...c, labelA: a.label.split(' ')[0], labelB: b.label.split(' ')[0] });
      }
      case 'semanal': return chartFromTool('serie_mensal', M.monthlySeries(org, r, 6));
      case 'caixa': return chartFromTool('fluxo_de_caixa', cashflow(org, 90));
      default: return null;
    }
  } catch { return null; }
}
