// Respostas prontas para as perguntas frequentes. Usadas:
//  - quando o Ollama está desligado (modo automático), e
//  - como base dos insights que giram na TV.
import * as M from './metrics.js';
import { cashflow } from './cashflow.js';
import { todayStr, refMonth, monthEnd, addMonths, monthLabel, brDate } from './dates.js';

export const brl = (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
export const brlK = (v) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${(a / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi` : a >= 1e3 ? `${(a / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : a.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
  return `${v < 0 ? '−' : ''}R$ ${s}`;
};
export const pct = (v, signed = true) => (v === null || v === undefined ? '—' : `${signed && v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`);

export const QUESTIONS = [
  { key: 'queda', text: 'Por que meu faturamento caiu neste mês?' },
  { key: 'produtos', text: 'Quais produtos geraram mais receita?' },
  { key: 'clientes', text: 'Quais clientes estão comprando menos?' },
  { key: 'margem', text: 'Qual foi minha margem de lucro no período?' },
  { key: 'comparar', text: 'Compare o desempenho deste mês com o anterior.' },
  { key: 'semanal', text: 'Gere um relatório executivo da semana.' },
  { key: 'atencao', text: 'Quais indicadores merecem minha atenção?' }
];

export function detectIntent(q) {
  const s = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (/(caixa|saldo|fluxo)/.test(s)) return 'caixa';
  if (/(atenc|alerta|preocup|risco|indicadores? (que|merec))/.test(s)) return 'atencao';
  if (/(relatorio|semana|executiv)/.test(s)) return 'semanal';
  if (/(caiu|queda|diminu|caindo|baixou|por que .*fatur|porque .*fatur)/.test(s)) return 'queda';
  if (/(compar|anterior|versus| vs )/.test(s)) return 'comparar';
  if (/cliente/.test(s)) return 'clientes';
  if (/(produto|mais vend|item|itens)/.test(s)) return 'produtos';
  if (/(margem|lucro|rentab)/.test(s)) return 'margem';
  return null;
}

function refPeriods(today = todayStr()) {
  const r = refMonth(today), p = addMonths(r, -1);
  return { a: { from: r, to: monthEnd(r), label: monthLabel(r) }, b: { from: p, to: monthEnd(p), label: monthLabel(p) } };
}

const tone = (v, goodWhenUp = true) => (v === null || v === 0 ? 'neutral' : (v > 0) === goodWhenUp ? 'pos' : 'neg');

export function answerIntent(org, key) {
  const { a, b } = refPeriods();
  switch (key) {
    case 'caixa': {
      const c = cashflow(org, 90);
      if (!c.hasBalance) return { severity: 'neutral', tools: ['fluxo_de_caixa'], answer: 'Ainda não sei o saldo do caixa. Informe o saldo de hoje em **Fluxo de caixa › Atualizar saldo** e eu projeto os próximos 90 dias com as contas a pagar, a receber e a média de vendas.', rows: [] };
      const below = c.firstBelow ? ` Atenção: o saldo fica abaixo do mínimo de **${brl(c.minimum)}** em **${brDate(c.firstBelow).slice(0, 5)}**${c.culprits.length ? ` (${c.culprits.join(' e ')})` : ''}.` : c.minimum ? ` O saldo não fica abaixo do mínimo de ${brl(c.minimum)} no período.` : '';
      return { severity: c.firstBelow ? 'warn' : 'pos', tools: ['fluxo_de_caixa'],
        answer: `Saldo de hoje: **${brl(c.balance)}**. Nos próximos 90 dias entram **${brl(c.totals.in)}** e saem **${brl(c.totals.out)}**, fechando em **${brl(c.endBalance)}**. O menor saldo previsto é ${brl(c.minBalance)} em ${brDate(c.minDate).slice(0, 5)}.${below}`,
        rows: [{ label: 'Saldo em 90 dias', value: brlK(c.endBalance), tone: 'neutral' }, { label: 'Menor saldo', value: brlK(c.minBalance), tone: c.firstBelow ? 'neg' : 'neutral' }] };
    }
    case 'queda': {
      const c = M.comparePeriods(org, a, b);
      const diff = c.revenueDiff;
      if (diff >= 0) {
        return { severity: 'pos', tools: ['comparar_periodos'], answer: `O faturamento de **${a.label}** não caiu: foi **${brl(c.current.revenue)}**, ${brl(diff)} acima de ${b.label} (${pct(c.deltas.revenue)}).`,
          rows: c.biggestCustomerGains.slice(0, 3).map((x) => ({ label: x.name, value: `+${brlK(x.diff)}`.replace('+−', '−'), tone: 'pos' })) };
      }
      const causes = [];
      for (const x of c.biggestCustomerDrops.slice(0, 2)) causes.push({ label: x.name, value: brlK(x.diff), tone: 'neg', text: `**${x.name}** comprou ${brlK(-x.diff).replace('R$ ', 'R$ ')} a menos (${pct(((x.current - x.previous) / x.previous) * 100)})` });
      for (const s of c.stockouts.slice(0, 1)) causes.push({ label: `Ruptura: ${s.name.split(/ \d/)[0].toLowerCase()}`, value: brlK(-s.estimatedLoss), tone: 'neg', text: `**${s.name}** ficou ${s.days} dias sem vender (${brDate(s.from).slice(0, 5)} a ${brDate(s.to).slice(0, 5)}), perda estimada de ${brlK(s.estimatedLoss)}` });
      const explained = Math.min(100, Math.round(((c.biggestCustomerDrops.slice(0, 2).reduce((s, x) => s - x.diff, 0) + (c.stockouts[0]?.estimatedLoss || 0)) / -diff) * 100));
      return {
        severity: 'alta', tools: ['comparar_periodos', 'clientes_em_queda'],
        answer: `O faturamento de **${a.label}** foi **${brl(c.current.revenue)}**, ${brl(-diff)} abaixo de ${b.label} (${pct(c.deltas.revenue)}). ${explained >= 95 ? 'Os fatores abaixo concentram praticamente toda a queda' : `Os fatores abaixo explicam cerca de ${explained}% da queda`}:\n${causes.map((x, i) => `${i + 1}. ${x.text}`).join('\n')}`,
        short: `Faturamento ${pct(c.deltas.revenue)} vs ${b.label.split(' ')[0].toLowerCase()}. ${causes.map((x) => x.label).slice(0, 2).join(' e ')} concentram a maior parte da queda.`,
        rows: causes.map(({ label, value, tone }) => ({ label, value, tone }))
      };
    }
    case 'produtos': {
      const t = M.topProducts(org, a.from, a.to, 5);
      const share = t.slice(0, 3).reduce((s, x) => s + x.share, 0);
      return {
        severity: 'info', tools: ['top_produtos'],
        answer: `Em **${a.label}**, os produtos com mais receita foram:\n${t.map((x, i) => `${i + 1}. **${x.name}** — ${brl(x.revenue)} (${pct(x.change)} vs mês anterior)`).join('\n')}\n\nOs três primeiros somam **${share.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%** da receita do mês.`,
        short: `${t[0].name} lidera ${a.label.split(' ')[0].toLowerCase()}. Os três primeiros somam ${Math.round(share)}% da receita.`,
        rows: t.slice(0, 3).map((x) => ({ label: x.name, value: brlK(x.revenue), tone: 'neutral' }))
      };
    }
    case 'clientes': {
      const t = M.customersDeclining(org, a.from, a.to, 4);
      if (!t.length) return { severity: 'pos', tools: ['clientes_em_queda'], answer: `Nenhum cliente relevante comprou muito abaixo da média em **${a.label}**.`, rows: [] };
      return {
        severity: 'alta', tools: ['clientes_em_queda'],
        answer: `Comparando **${a.label}** com a média dos 3 meses anteriores, estes clientes compraram bem menos:\n${t.map((x, i) => `${i + 1}. **${x.name}** — ${pct(x.change)} (${brlK(-x.lost)}). Último pedido há ${x.daysSinceLastOrder} dia(s).`).join('\n')}`,
        short: `${t[0].name} comprou ${pct(Math.abs(t[0].change), false)} menos que a sua média${t[0].daysSinceLastOrder >= 10 ? ` e não faz pedido há ${t[0].daysSinceLastOrder} dias` : ''}.`,
        rows: t.slice(0, 3).map((x) => ({ label: x.name, value: pct(x.change), tone: 'neg' }))
      };
    }
    case 'margem': {
      const cur = M.periodSummary(org, a.from, a.to), prev = M.periodSummary(org, b.from, b.to);
      const d = cur.netMargin - prev.netMargin;
      const why = cur.grossMargin >= prev.grossMargin && d < 0 ? 'A margem bruta se manteve, então a queda vem do volume menor diluindo os custos fixos.' : d < 0 ? 'A margem bruta também caiu: vale revisar preços e custos de compra.' : 'Boa notícia: a margem melhorou em relação ao mês anterior.';
      return {
        severity: d < -1 ? 'media' : 'pos', tools: ['margem_periodo'],
        answer: `Em **${a.label}** a margem líquida foi **${cur.netMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%** (lucro de ${brl(cur.profit)} sobre ${brl(cur.revenue)} de receita), ${Math.abs(d).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} p.p. ${d < 0 ? 'abaixo' : 'acima'} de ${b.label}. A margem bruta ficou em ${cur.grossMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%. ${why}`,
        short: `Margem líquida de ${cur.netMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%. ${why}`,
        rows: [{ label: 'Margem bruta', value: `${cur.grossMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, tone: tone(cur.grossMargin - prev.grossMargin) }, { label: 'Margem líquida', value: `${cur.netMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, tone: tone(d) }, { label: `Margem líquida em ${b.label.split(' ')[0].toLowerCase()}`, value: `${prev.netMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, tone: 'neutral' }]
      };
    }
    case 'comparar': {
      const c = M.comparePeriods(org, a, b);
      const d = c.deltas;
      return {
        severity: d.revenue < 0 ? 'media' : 'pos', tools: ['comparar_periodos'],
        answer: `**${a.label} × ${b.label}**\n- Faturamento: ${brl(c.current.revenue)} (${pct(d.revenue)})\n- Pedidos: ${c.current.orders.toLocaleString('pt-BR')} (${pct(d.orders)})\n- Ticket médio: ${brl(c.current.avgTicket)} (${pct(d.avgTicket)})\n- Despesas totais: ${brl(c.current.expenses)} (${pct(d.expenses)})\n- Lucro: ${brl(c.current.profit)} (${pct(d.profit)})`,
        short: `${a.label.split(' ')[0]} teve faturamento ${pct(d.revenue)} e despesas ${pct(d.expenses)} em relação a ${b.label.split(' ')[0].toLowerCase()}.`,
        rows: [{ label: 'Faturamento', value: pct(d.revenue), tone: tone(d.revenue) }, { label: 'Pedidos', value: pct(d.orders), tone: tone(d.orders) }, { label: 'Despesas', value: pct(d.expenses), tone: tone(d.expenses, false) }]
      };
    }
    case 'semanal': {
      const w = M.weeklyReport(org);
      const d = w.deltas;
      return {
        severity: d.revenue < 0 ? 'media' : 'pos', tools: ['relatorio_semanal'],
        answer: `**Relatório executivo — ${w.label}**\n- Faturamento: ${brl(w.summary.revenue)} (${pct(d.revenue)} vs semana anterior)\n- Lucro: ${brl(w.summary.profit)} (${pct(d.profit)})\n- Margem líquida: ${w.summary.netMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%\n- Pedidos: ${w.summary.orders}\n\n**Destaques:** ${w.highlights.customersUp.slice(0, 2).map((x) => x.name).join(', ') || '—'} aumentaram as compras.\n**Atenção:** ${w.attention.slice(0, 2).map((x) => x.title.toLowerCase()).join('; ') || 'nada crítico'}.`,
        short: `${w.label}: faturamento ${pct(d.revenue)} e lucro ${pct(d.profit)} em relação à semana anterior.`,
        rows: [{ label: 'Faturamento da semana', value: pct(d.revenue), tone: tone(d.revenue) }, { label: 'Lucro da semana', value: pct(d.profit), tone: tone(d.profit) }, { label: 'Margem', value: `${w.summary.netMargin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`, tone: 'neutral' }]
      };
    }
    case 'atencao': {
      const t = M.attentionIndicators(org);
      const fmtVal = (x) => (x.unit === 'dias' ? `${x.value} dias` : x.unit === 'p.p.' ? `${x.value} p.p.` : brlK(x.value));
      return {
        severity: t.length ? 'alta' : 'pos', tools: ['indicadores_atencao'],
        answer: t.length ? `Estes pontos merecem atenção agora:\n${t.slice(0, 5).map((x, i) => `${i + 1}. **${x.title}** — ${x.detail}`).join('\n')}` : 'Nenhum indicador crítico no momento.',
        short: t.length ? `${t.length} pontos pedem ação: ${t.slice(0, 3).map((x) => x.title.toLowerCase()).join(', ')}.` : 'Nenhum indicador crítico no momento.',
        rows: t.slice(0, 3).map((x) => ({ label: x.title, value: fmtVal(x), tone: x.severity === 'alta' ? 'neg' : 'neutral' }))
      };
    }
    default:
      return null;
  }
}

export function helpAnswer() {
  return {
    severity: 'info', tools: [], rows: [],
    answer: `Sem a IA local ligada eu respondo apenas às perguntas frequentes:\n${QUESTIONS.map((q) => `- ${q.text}`).join('\n')}\n\nPara perguntas livres, inicie o Ollama neste computador (\`ollama serve\`) e confira o endereço em Configurações.`
  };
}
