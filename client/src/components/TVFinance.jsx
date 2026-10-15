// Tela "Visão geral" do modo TV: indicadores, margem, receitas × despesas, orçamentos, lucro acumulado e DRE.
import { brl, brlK, num, delta, toneOf } from '../format.js';

const C = { card: '#17171B', line: '#24242B', muted: '#A6A6B0', dim: '#8E8E99', text: '#ECECF1', rev: '#8B6CF0', exp: '#E46A72', profit: '#FBBF24', pos: '#34D399', neg: '#F87171', warn: '#FBBF24' };
const box = { borderRadius: 16, background: C.card, border: `1px solid ${C.line}`, minWidth: 0, minHeight: 0 };
const toneColor = (t) => (t === 'pos' ? C.pos : t === 'neg' ? C.neg : t === 'warn' ? C.warn : C.muted);

function Kpi({ label, value, sub, tone, valueColor }) {
  return (
    <div style={{ ...box, padding: '16px 22px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 6 }}>
      <span style={{ fontSize: 18, color: C.muted }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 38, lineHeight: 1.15, fontWeight: 500, letterSpacing: '-0.02em', whiteSpace: 'nowrap', color: valueColor || C.text }}>{value}</span>
      <span style={{ fontSize: 16, color: toneColor(tone) }}>{sub}</span>
    </div>
  );
}

function Ring({ pct, color, size, stroke = 12, children, label, marker }) {
  const r = 50, c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(pct || 0, 100));
  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 120 120" role="img" aria-label={label}>
        <circle cx="60" cy="60" r={r} fill="none" stroke={C.line} strokeWidth={stroke} />
        <circle cx="60" cy="60" r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} transform="rotate(-90 60 60)" style={{ transition: 'stroke-dasharray 1s ease' }} />
        {marker !== undefined && <line x1="60" y1="3" x2="60" y2="17" stroke={C.text} strokeWidth="2.2" transform={`rotate(${(Math.min(marker, 100) / 100) * 360} 60 60)`} />}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2 }}>{children}</div>
    </div>
  );
}

const niceStep = (top, parts) => { const raw = top / parts; const p = 10 ** Math.floor(Math.log10(raw || 1)); return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => raw <= x * p) || 10) * p; };

function DivergingChart({ buckets, hide }) {
  const top = Math.max(...buckets.map((b) => Math.max(b.revenue, b.expenses)), 1) * 1.08;
  const step = niceStep(top, 2);
  const M = Math.ceil(top / step) * step;
  const y = (v) => 50 - (v / M) * 50;
  const n = buckets.length;
  const every = n > 16 ? Math.ceil(n / 10) : 1;
  const ticks = [M, M / 2, 0, -M / 2, -M];
  const pts = buckets.map((b, i) => `${(((i + 0.5) / n) * 1000).toFixed(1)},${y(b.revenue - b.expenses).toFixed(2)}`).join(' ');
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 12 }}>
      <div aria-hidden="true" style={{ position: 'relative', width: 70, flex: 'none', fontFamily: 'var(--mono)', fontSize: 14, color: C.dim, marginBottom: 28 }}>
        {!hide && ticks.map((t) => <span key={t} style={{ position: 'absolute', right: 0, top: `${y(t)}%`, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}>{t === 0 ? '0' : brlK(t).replace('R$ ', '')}</span>)}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="img" aria-label="Receitas para cima, despesas para baixo e lucro em linha" style={{ flex: 1, position: 'relative' }}>
          {ticks.map((t) => <span key={t} style={{ position: 'absolute', left: 0, right: 0, top: `${y(t)}%`, borderTop: `1px solid ${t === 0 ? '#3A3A45' : '#222229'}` }} />)}
          <div style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {buckets.map((b, i) => (
              <div key={b.key} style={{ flex: 1, position: 'relative', minWidth: 0 }} title={`${b.full}: receita ${brl(b.revenue)}, despesas ${brl(b.expenses)}, lucro ${brl(b.revenue - b.expenses)}`}>
                <span style={{ position: 'absolute', left: n > 20 ? '18%' : '24%', right: n > 20 ? '18%' : '24%', bottom: '50%', height: `${(b.revenue / M) * 50}%`, background: C.rev, borderRadius: '4px 4px 0 0', transformOrigin: 'bottom', animation: `grow .8s cubic-bezier(.2,.8,.2,1) ${(i / n) * 0.4}s both` }} />
                <span style={{ position: 'absolute', left: n > 20 ? '18%' : '24%', right: n > 20 ? '18%' : '24%', top: '50%', height: `${(b.expenses / M) * 50}%`, background: C.exp, borderRadius: '0 0 4px 4px' }} />
              </div>
            ))}
          </div>
          <svg aria-hidden="true" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible' }}>
            <polyline points={pts} fill="none" stroke={C.profit} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div aria-hidden="true" style={{ display: 'flex' }}>
          {buckets.map((b, i) => <span key={b.key} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 15, whiteSpace: 'nowrap', color: i === n - 1 ? C.text : C.dim, fontWeight: i === n - 1 ? 600 : 400 }}>{i % every === 0 || i === n - 1 ? b.label : ''}</span>)}
        </div>
      </div>
    </div>
  );
}

function LineChart({ points, labels, color, floor }) {
  const max = Math.max(...points, floor || 0, 1), min = Math.min(...points, 0);
  const step = niceStep(max - min, 3);
  const hi = Math.ceil(max / step) * step, lo = Math.floor(min / step) * step;
  const y = (v) => 100 - ((v - lo) / (hi - lo || 1)) * 100;
  const x = (i) => ((i + 0.5) / points.length) * 100;
  const pts = points.map((v, i) => `${(x(i) * 10).toFixed(1)},${y(v).toFixed(2)}`).join(' ');
  const ticks = []; for (let v = hi; v >= lo - 1e-6; v -= step) ticks.push(v);
  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 10 }}>
      <div aria-hidden="true" style={{ position: 'relative', width: 64, flex: 'none', fontFamily: 'var(--mono)', fontSize: 14, color: C.dim, marginBottom: 26 }}>
        {ticks.map((t) => <span key={t} style={{ position: 'absolute', right: 0, top: `${y(t)}%`, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}>{t === 0 ? '0' : brlK(t).replace('R$ ', '')}</span>)}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ flex: 1, position: 'relative' }}>
          {ticks.map((t) => <span key={t} style={{ position: 'absolute', left: 0, right: 0, top: `${y(t)}%`, borderTop: '1px solid #222229' }} />)}
          <svg aria-hidden="true" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <path d={`M${(x(0) * 10).toFixed(1)},100 L${pts.replace(/ /g, ' L')} L${(x(points.length - 1) * 10).toFixed(1)},100 Z`} fill={color} opacity="0.08" />
            <polyline points={pts} fill="none" stroke={color} strokeWidth="3" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {floor > 0 && <line x1="0" x2="1000" y1={y(floor)} y2={y(floor)} stroke="#FBBF24" strokeWidth="2" strokeDasharray="8 8" vectorEffect="non-scaling-stroke" />}
          </svg>
          {points.map((v, i) => <span key={i} style={{ position: 'absolute', left: `${x(i)}%`, top: `${y(v)}%`, width: 10, height: 10, margin: '-5px 0 0 -5px', borderRadius: '50%', background: '#0E0E10', border: `2px solid ${color}` }} />)}
        </div>
        <div aria-hidden="true" style={{ display: 'flex' }}>{labels.map((l, i) => <span key={i} style={{ flex: 1, textAlign: 'center', fontSize: 14, color: C.dim }}>{l}</span>)}</div>
      </div>
    </div>
  );
}

export default function TVFinance({ data, goal, periodText, hide, widget }) {
  const d = data.dashboard, k = d.kpis, dl = d.deltas;
  const vs = `vs ${d.previousLabel.split(' ')[0].toLowerCase()}`;
  const money = (v) => (hide ? '•••' : brl(v));
  const fc = data.forecast;
  const cf = data.cashflow;
  const targetMargin = data.targets?.netMargin ?? 18;
  const last = d.series[d.series.length - 1];
  const revGoal = last?.goal || 0;
  // Orçamento cadastrado (despesas operacionais) quando existir; senão, estimado pela margem-alvo (despesas totais)
  const bud = data.budget;
  const expBudget = bud ? bud.budget : revGoal * (1 - targetMargin / 100);
  const expSpent = bud ? k.opex : k.expenses;
  const revPct = revGoal ? (k.revenue / revGoal) * 100 : null;
  const expPct = expBudget ? (expSpent / expBudget) * 100 : null;
  const buckets = goal?.buckets?.length ? goal.buckets : d.series.map((s) => ({ key: s.month, label: s.label, full: s.full, revenue: s.revenue, expenses: s.expenses }));
  let acc = 0;
  const cumulative = d.series.map((s) => (acc += s.profit));
  const gross = k.revenue - k.cogs;
  const pct = (v) => (k.revenue ? `${num((v / k.revenue) * 100, 0)}%` : '—');

  return (
    <>
      <section aria-label="Indicadores" style={{ height: 268, flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr)) 320px repeat(2, minmax(0, 1fr))', gridTemplateRows: 'repeat(2, minmax(0, 1fr))', gap: 16 }}>
        <Kpi label="Faturamento" value={money(k.revenue)} sub={`${delta(dl.revenue)} ${vs}`} tone={toneOf(dl.revenue)} />
        <Kpi label="Despesas totais" value={money(k.expenses)} sub={`${delta(dl.expenses)} ${vs}`} tone={toneOf(dl.expenses, false)} />
        <div style={{ ...box, gridColumn: 3, gridRow: '1 / span 2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Ring pct={(k.netMargin / Math.max(targetMargin * 1.25, 1)) * 100} marker={(targetMargin / Math.max(targetMargin * 1.25, 1)) * 100} color="#A78BFA" size={250} stroke={11} label={`Margem líquida de ${num(k.netMargin, 1)}%, objetivo ${targetMargin}%`}>
            <span style={{ fontSize: 16, color: C.muted }}>Margem líquida</span>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 46, fontWeight: 500 }}>{num(k.netMargin, 1)}%</span>
            <span style={{ fontSize: 15, color: C.muted }}>objetivo {targetMargin}% · <span style={{ color: toneColor(toneOf(dl.netMarginPp)) }}>{delta(dl.netMarginPp, { pp: true })}</span></span>
          </Ring>
        </div>
        <Kpi label="A receber" value={money(data.dashboard.receivables.total)} sub={d.receivables.overdue ? `${d.receivables.overdue} título(s) vencido(s)` : 'nenhum vencido'} tone={d.receivables.overdue ? 'warn' : 'pos'} />
        <Kpi label="A pagar · 7 dias" value={money(data.payables7 || 0)} sub={d.billsDue.some((b) => b.status === 'vencida') ? 'há conta vencida' : 'nada vencido'} tone={d.billsDue.some((b) => b.status === 'vencida') ? 'warn' : 'pos'} />
        <Kpi label="Lucro líquido" value={money(k.profit)} sub={`${delta(dl.profit)} ${vs}`} tone={toneOf(dl.profit)} />
        <Kpi label="Ticket médio" value={money(k.avgTicket)} sub={`${delta(dl.avgTicket)} ${vs}`} tone={toneOf(dl.avgTicket)} />
        <Kpi label="Pedidos no mês" value={num(k.orders)} sub={`${delta(dl.orders)} ${vs}`} tone={toneOf(dl.orders)} />
        {fc?.target && !fc.closed
          ? <Kpi label={`Previsão de ${fc.label.split(' ')[0].toLowerCase()}`} value={money(fc.projection)} sub={`${num(fc.projectionPct, 1)}% da meta`} tone={fc.projectionPct >= 100 ? 'pos' : 'warn'} valueColor={fc.projectionPct >= 100 ? undefined : '#FCD34D'} />
          : <Kpi label="Clientes ativos" value={num(k.activeCustomers)} sub={`${delta(dl.activeCustomers)} ${vs}`} tone={toneOf(dl.activeCustomers)} />}
      </section>

      <div style={{ height: 318, flex: 'none', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 300px 300px', gap: 16 }}>
        <section style={{ ...box, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 16 }}>
            <h2 style={{ fontSize: 22, fontWeight: 600 }}>Receitas e despesas</h2>
            <div style={{ display: 'flex', gap: 20, fontSize: 15, color: C.muted, alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: C.rev }} />Receita</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 14, height: 14, borderRadius: 4, background: C.exp }} />Despesas</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ width: 20, height: 3, background: C.profit }} />Lucro</span>
              <span style={{ color: C.dim }}>· {periodText}</span>
            </div>
          </div>
          <DivergingChart buckets={buckets} hide={hide} />
        </section>
        {[
          { title: '% da meta de receita', pct: revPct, color: C.rev, l1: 'Meta', v1: revGoal, l2: revPct >= 100 ? 'Superou' : 'Faltaram', v2: k.revenue - revGoal, good: revPct >= 100 },
          { title: bud ? '% do orçamento de despesas' : '% do orçamento estimado', pct: expPct, color: C.exp, l1: bud ? 'Orçamento' : 'Estimado', v1: expBudget, l2: expPct <= 100 ? 'Economia' : 'Estouro', v2: expBudget - expSpent, good: expPct <= 100 }
        ].map((g) => (
          <section key={g.title} style={{ ...box, padding: '18px 22px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <h2 style={{ fontSize: 18, fontWeight: 600, textAlign: 'center' }}>{g.title}</h2>
            <Ring pct={g.pct} color={g.color} size={170} stroke={14} label={`${g.title}: ${g.pct === null ? 'sem meta' : `${num(g.pct, 0)}%`}`}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 38, fontWeight: 500 }}>{g.pct === null ? '—' : `${num(g.pct, 0)}%`}</span>
            </Ring>
            {g.pct === null ? <span style={{ fontSize: 15, color: C.dim, textAlign: 'center' }}>Cadastre a meta do mês em Metas</span> : (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 4, fontSize: 15 }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: C.muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.l1}</span><span style={{ fontFamily: 'var(--mono)' }}>{money(g.v1)}</span></span>
                <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><span style={{ color: C.muted }}>{g.l2}</span><span style={{ fontFamily: 'var(--mono)', color: g.good ? C.pos : C.neg }}>{hide ? '•••' : `${g.v2 >= 0 ? '+' : '−'}${brl(Math.abs(g.v2))}`}</span></span>
              </div>
            )}
          </section>
        ))}
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.05fr)', gap: 16 }}>
        <section style={{ ...box, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <h2 style={{ fontSize: 22, fontWeight: 600 }}>{cf ? 'Saldo em caixa · próximos 90 dias' : 'Lucro acumulado · 12 meses'}</h2>
            <span style={{ fontFamily: 'var(--mono)', fontSize: 20, color: cf?.firstBelow ? '#FCD34D' : '#6EE7B7' }}>{hide ? '•••' : brlK(cf ? cf.balance : cumulative[cumulative.length - 1] || 0)}</span>
          </div>
          {hide ? <p style={{ fontSize: 18, color: C.dim }}>Valores ocultos nesta TV.</p>
            : cf ? <LineChart points={[cf.balance, ...cf.weeks.map((w) => w.balance)]} labels={['hoje', ...cf.weeks.map((w, i) => (i % 3 === 2 ? w.label : ''))]} color={cf.firstBelow ? '#FBBF24' : C.pos} floor={cf.minimum} />
            : <LineChart points={cumulative} labels={d.series.map((s) => s.label)} color={C.pos} />}
        </section>

        <section style={{ ...box, padding: '18px 24px', display: 'flex', flexDirection: 'column', gap: 4 }} aria-labelledby="tv-dre">
          <h2 id="tv-dre" style={{ fontSize: 22, fontWeight: 600, marginBottom: 6 }}>Demonstração de resultados · {d.label.split(' ')[0].toLowerCase()}</h2>
          {[
            ['Receita bruta', k.revenue, '100%', false],
            ['Custo das mercadorias', k.cogs, pct(k.cogs), false],
            ['Lucro bruto', gross, pct(gross), true],
            ['Despesas operacionais', k.opex, pct(k.opex), false],
            ['Lucro líquido', k.profit, pct(k.profit), true]
          ].map(([l, v, p, strong], i, arr) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '8px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${strong ? '#3A3A45' : C.line}`, fontSize: 18, fontWeight: strong ? 600 : 400 }}>
              <span style={{ flex: 1 }}>{l}</span>
              <span style={{ fontFamily: 'var(--mono)', color: l === 'Lucro líquido' && v < 0 ? C.neg : C.text }}>{money(v)}</span>
              <span style={{ width: 60, textAlign: 'right', fontFamily: 'var(--mono)', color: C.muted }}>{p}</span>
            </div>
          ))}
        </section>

        {widget}
      </div>
    </>
  );
}
