// Fluxo de caixa projetado.
// Saldo informado + contas a pagar/receber lançadas + estimativa pela média das últimas 12 semanas.
// A estimativa só cobre o que ainda não está lançado: no horizonte todo, estimado = max(0, média × dias − já lançado),
// distribuído por igual nos dias. Assim as semanas com folha, imposto e fornecedor grande aparecem como queda.
import { db, getSettings } from './db.js';
import { periodSummary } from './metrics.js';
import { todayStr, addDays, brDate } from './dates.js';

const r2 = (v) => Math.round(v * 100) / 100;
const BASE_DAYS = 84;
const kfmt = (v) => `R$ ${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;

export function cashflow(org, horizon = 90) {
  const H = [30, 60, 90].includes(+horizon) ? +horizon : 90;
  const today = todayStr();
  const end = addDays(today, H - 1);
  const cash = getSettings(org).cash || {};
  const hasBalance = typeof cash.balance === 'number';
  const start = hasBalance ? cash.balance : 0;
  const minimum = +cash.minimum || 0;

  const base = periodSummary(org, addDays(today, -BASE_DAYS), addDays(today, -1));
  const dailyIn = base.revenue / BASE_DAYS, dailyOut = base.expenses / BASE_DAYS;

  const rows = db.prepare('SELECT id, kind, party, due_date, amount FROM bills WHERE org_id = ? AND paid_at IS NULL AND due_date <= ? ORDER BY due_date, id').all(org, end);
  const overdueIn = rows.filter((b) => b.kind === 'receber' && b.due_date < today);
  // Recebíveis vencidos não entram (podem não chegar); contas a pagar vencidas entram hoje.
  const known = rows.filter((b) => !(b.kind === 'receber' && b.due_date < today)).map((b) => ({
    id: b.id, date: b.due_date < today ? today : b.due_date, due: b.due_date, overdue: b.due_date < today,
    desc: b.party, source: b.kind === 'pagar' ? 'A pagar' : 'A receber', value: b.kind === 'pagar' ? -b.amount : b.amount
  }));

  const sum = (f) => known.filter(f).reduce((s, m) => s + Math.abs(m.value), 0);
  const estInDay = Math.max(0, dailyIn * H - sum((m) => m.value > 0)) / H;
  const estOutDay = Math.max(0, dailyOut * H - sum((m) => m.value < 0)) / H;
  const weeks = [];
  const moves = [...known];
  for (let i = 0; i * 7 < H; i++) {
    const from = addDays(today, i * 7), days = Math.min(7, H - i * 7), to = addDays(from, days - 1);
    const inWeek = known.filter((m) => m.date >= from && m.date <= to);
    const kIn = inWeek.filter((m) => m.value > 0).reduce((s, m) => s + m.value, 0);
    const kOut = -inWeek.filter((m) => m.value < 0).reduce((s, m) => s + m.value, 0);
    const estIn = estInDay * days, estOut = estOutDay * days;
    const net = estIn - estOut;
    if (estIn > 0 || estOut > 0) moves.push({ date: to, desc: `Resultado previsto da semana (vendas ${kfmt(estIn)} − compras e despesas ${kfmt(estOut)})`, source: 'Estimativa', value: r2(net), estimate: true });
    weeks.push({ from, to, days, label: brDate(from).slice(0, 5), in: r2(kIn + estIn), out: r2(kOut + estOut), knownIn: r2(kIn), knownOut: r2(kOut) });
  }

  // Ordem: data, entradas antes das saídas; lançados antes das estimativas.
  moves.sort((a, b) => a.date.localeCompare(b.date) || (b.value > 0) - (a.value > 0) || !!a.estimate - !!b.estimate);
  let bal = start, minBal = start, minDate = today, firstBelow = null;
  for (const m of moves) {
    bal += m.value; m.balance = r2(bal);
    if (bal < minBal) { minBal = bal; minDate = m.date; }
    if (hasBalance && minimum && bal < minimum && !firstBelow) firstBelow = m.date;
  }
  let wb = start;
  for (const w of weeks) { wb += w.in - w.out; w.balance = r2(wb); }

  // Maiores contas a pagar na semana em que o saldo fura o mínimo (para o alerta).
  let culprits = [];
  if (firstBelow) {
    const w = weeks.find((x) => firstBelow >= x.from && firstBelow <= x.to);
    culprits = known.filter((m) => m.value < 0 && m.date >= w.from && m.date <= w.to).sort((a, b) => a.value - b.value).slice(0, 2).map((m) => m.desc);
  }

  return {
    horizon: H, today, end, hasBalance, balance: hasBalance ? cash.balance : null, balanceDate: cash.date || null, minimum,
    totals: { in: r2(weeks.reduce((s, w) => s + w.in, 0)), out: r2(weeks.reduce((s, w) => s + w.out, 0)) },
    endBalance: r2(bal), minBalance: r2(minBal), minDate, firstBelow, culprits,
    overdueReceivables: { count: overdueIn.length, amount: r2(overdueIn.reduce((s, b) => s + b.amount, 0)) },
    averages: { weeklyIn: r2(dailyIn * 7), weeklyOut: r2(dailyOut * 7) },
    weeks, moves
  };
}
