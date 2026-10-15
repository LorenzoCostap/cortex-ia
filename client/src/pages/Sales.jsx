import { Link } from 'react-router-dom';
import { useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import PrintButton from '../components/PrintButton.jsx';
import { PageHead } from '../components/Layout.jsx';
import CompareToggle, { useCompare } from '../components/CompareToggle.jsx';
import { Icon, Kpi, KpiSkeleton, ErrorBox, Empty, useAsync } from '../components/ui.jsx';
import PeriodPicker, { presetRange, periodLabel } from '../components/PeriodPicker.jsx';
import { brl, brlK, delta, toneOf, num, brDate } from '../format.js';

const CAT_COLORS = ['#A78BFA', '#7C63D8', '#5A4A9E', '#4A4A56', '#33333C'];

function DailyChart({ daily, yoy = false }) {
  const [hover, setHover] = useState(null);
  const W = 800, H = 240;
  const vals = daily.flatMap((d) => [d.revenue, d.previous || 0]);
  const max = Math.max(...vals, 1) * 1.1;
  const x = (i) => (daily.length === 1 ? W / 2 : (i / (daily.length - 1)) * W);
  const y = (v) => H - (v / max) * H;
  const cur = daily.map((d, i) => `${x(i).toFixed(1)},${y(d.revenue).toFixed(1)}`).join(' ');
  const prev = daily.filter((d) => d.previous !== null).map((d, i) => `${x(i).toFixed(1)},${y(d.previous).toFixed(1)}`).join(' ');
  const area = `M0,${H} L${cur.replace(/ /g, ' L')} L${W},${H} Z`;
  const ticks = daily.length <= 1 ? [0] : [0, Math.round((daily.length - 1) / 4), Math.round((daily.length - 1) / 2), Math.round(((daily.length - 1) * 3) / 4), daily.length - 1];
  const h = hover !== null ? daily[hover] : null;
  return (
    <div style={{ position: 'relative' }}>
      <svg role="img" aria-label="Faturamento diário do período comparado ao período anterior" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 240, display: 'block' }}
        onMouseMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setHover(Math.max(0, Math.min(daily.length - 1, Math.round(((e.clientX - r.left) / r.width) * (daily.length - 1))))); }}
        onMouseLeave={() => setHover(null)}>
        {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} x1="0" x2={W} y1={H * f} y2={H * f} stroke="var(--line)" vectorEffect="non-scaling-stroke" />)}
        <path d={area} fill="#8B6CF0" opacity="0.12" />
        {prev && <polyline points={prev} fill="none" stroke="#6B6B78" strokeWidth="1.6" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />}
        <polyline points={cur} fill="none" stroke="var(--violet-bar)" strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1="0" y2={H} stroke="var(--line-2)" vectorEffect="non-scaling-stroke" />}
      </svg>
      {h && (
        <div style={{ position: 'absolute', top: 8, [hover < daily.length / 2 ? 'left' : 'right']: `calc(${hover < daily.length / 2 ? (x(hover) / W) * 100 : 100 - (x(hover) / W) * 100}% + 12px)`, padding: '10px 12px', borderRadius: 10, background: 'var(--card-3)', border: '1px solid var(--line-2)', fontSize: 12, pointerEvents: 'none', display: 'flex', flexDirection: 'column', gap: 4, minWidth: 150 }}>
          <strong style={{ fontSize: 13 }}>{h.unit === 'semana' ? `Semana de ${brDate(h.date)}` : brDate(h.date)}</strong>
          <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="muted">Período</span><span className="mono">{brl(h.revenue)}</span></span>
          {h.previous !== null && <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span className="muted">{yoy ? (h.unit === 'semana' ? 'Mesma semana do ano anterior' : 'Mesmo dia do ano anterior') : h.unit === 'semana' ? 'Mesma semana antes' : 'Mesmo dia da semana antes'}</span><span className="mono">{brl(h.previous)}</span></span>}
        </div>
      )}
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--dim)', paddingTop: 8 }}>
        {ticks.map((t, i) => <span key={i}>{brDate(daily[t].date).slice(0, 5)}</span>)}
      </div>
    </div>
  );
}

export default function Sales() {
  const { me } = useAuth();
  const [period, setPeriod] = useState(() => ({ preset: '30d', ...presetRange('30d', me.today) }));
  const [q, setQ] = useState('');
  const [allCustomers, setAllCustomers] = useState(false);
  const [cmp, setCmp] = useCompare();
  const s = useAsync(() => api(`/sales?from=${period.from}&to=${period.to}&cmp=${cmp}`), [period.from, period.to, cmp]);
  const vsNote = cmp === 'ano' ? 'vs ano anterior' : 'vs anterior';
  const d = s.data;
  const rows = useMemo(() => (d?.products || []).filter((p) => p.name.toLowerCase().includes(q.toLowerCase())), [d, q]);
  const exportCsv = () => {
    const lines = [['Produto', 'Categoria', 'Quantidade', 'Receita', 'Variação %', 'Margem %', 'Classe'], ...d.products.map((p) => [p.name, p.category, p.qty, p.revenue.toFixed(2).replace('.', ','), p.change ?? '', p.margin, p.abc])];
    const blob = new Blob(['﻿' + lines.map((l) => l.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `vendas_${period.from}_${period.to}.csv`; a.click();
  };

  return (
    <>
      <PageHead eyebrow="Análise comercial" title="Vendas e indicadores">
        <CompareToggle value={cmp} onChange={setCmp} prevLabel="Período anterior" />
        <PrintButton />
        <button className="btn" onClick={exportCsv} disabled={!d}><Icon name="download" size={16} color="var(--muted)" />Exportar CSV</button>
      </PageHead>
      <PeriodPicker value={period} onChange={setPeriod} today={me.today} id="vendas-periodo" />

      {s.error && <ErrorBox error={s.error} onRetry={s.reload} />}
      {!d && !s.error && <KpiSkeleton n={4} />}
      {d && d.kpis.orders === 0 && <Empty icon="trend" title="Nenhuma venda neste período" text="Escolha outro período ou importe suas planilhas de vendas." />}
      {d && d.kpis.orders > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, opacity: s.loading ? 0.55 : 1, transition: 'opacity .2s' }}>
          <section className="grid-kpi" aria-label="Indicadores de vendas">
            <Kpi label="Faturamento" value={brl(d.kpis.revenue)} delta={delta(d.deltas.revenue)} tone={toneOf(d.deltas.revenue)} note={vsNote} />
            <Kpi label="Pedidos" value={num(d.kpis.orders)} delta={delta(d.deltas.orders)} tone={toneOf(d.deltas.orders)} note={vsNote} delay={0.05} />
            <Kpi label="Ticket médio" value={brl(d.kpis.avgTicket)} delta={delta(d.deltas.avgTicket)} tone={toneOf(d.deltas.avgTicket)} note={vsNote} delay={0.1} />
            <Kpi label="Clientes ativos" value={num(d.kpis.activeCustomers)} delta={delta(d.deltas.activeCustomers)} tone={toneOf(d.deltas.activeCustomers)} note={vsNote} delay={0.15} />
            <Kpi label="Margem bruta" value={`${num(d.kpis.grossMargin, 1)}%`} delta={delta(d.deltas.grossMarginPp, { pp: true })} tone={toneOf(d.deltas.grossMarginPp)} note={vsNote} delay={0.2} />
          </section>

          <div className="row">
            <section className="card" style={{ flex: '2 1 560px' }} aria-labelledby="fd">
              <div className="card-head">
                <div><h2 id="fd" className="card-title">{d.daily[0]?.unit === 'semana' ? 'Faturamento semanal' : 'Faturamento diário'}</h2><p className="card-sub">{periodLabel(period)} · {brDate(d.from)} a {brDate(d.to)}</p></div>
                <div style={{ display: 'flex', gap: 16, fontSize: 13, color: 'var(--muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, height: 2, background: 'var(--violet-bar)' }} />Período</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 14, borderTop: '2px dashed #6B6B78' }} />{cmp === 'ano' ? 'Ano anterior (mesmo dia da semana)' : 'Período anterior (mesmo dia da semana)'}</span>
                </div>
              </div>
              <DailyChart daily={d.daily} yoy={cmp === 'ano'} />
            </section>
            <section className="card" style={{ flex: '1 1 300px' }} aria-labelledby="cat">
              <h2 id="cat" className="card-title">Receita por categoria</h2>
              <div aria-hidden="true" style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
                {d.categories.map((c, i) => <span key={c.category} style={{ flex: c.share, background: CAT_COLORS[i % CAT_COLORS.length] }} />)}
              </div>
              <ul className="list">
                {d.categories.map((c, i) => (
                  <li key={c.category}><span style={{ width: 10, height: 10, borderRadius: 3, background: CAT_COLORS[i % CAT_COLORS.length], border: i === 4 ? '1px solid #4A4A56' : 0 }} /><span style={{ flex: 1 }}>{c.category}</span><span className="mono dim" style={{ fontSize: 13 }}>{brlK(c.revenue)}</span><span className="mono" style={{ width: 48, textAlign: 'right' }}>{num(c.share, 0)}%</span></li>
                ))}
              </ul>
            </section>
          </div>

          <section className="card" aria-labelledby="abc" style={{ paddingBottom: 12 }}>
            <div className="card-head">
              <div><h2 id="abc" className="card-title">Produtos — curva ABC</h2><p className="card-sub">Classe A: 80% da receita · variação contra {cmp === 'ano' ? 'o mesmo período do ano anterior' : 'o período anterior'}</p></div>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 40, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--side)' }}>
                <Icon name="search" size={16} color="var(--dim)" /><span className="sr">Buscar produto</span>
                <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar produto" style={{ border: 0, outline: 'none', background: 'transparent', width: 180 }} />
              </label>
            </div>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 720 }}>
                <thead><tr><th>Produto</th><th>Categoria</th><th style={{ textAlign: 'right' }}>Qtd.</th><th style={{ textAlign: 'right' }}>Receita</th><th style={{ textAlign: 'right' }}>Var.</th><th style={{ textAlign: 'right' }}>Margem</th><th style={{ textAlign: 'center' }}>Classe</th></tr></thead>
                <tbody>
                  {rows.map((p) => (
                    <tr key={p.name}>
                      <td>{p.name}</td><td className="muted">{p.category}</td>
                      <td className="num">{num(p.qty)}</td><td className="num">{brl(p.revenue)}</td>
                      <td className={`num ${toneOf(p.change)}`}>{p.change === null ? '—' : `${p.change > 0 ? '+' : '−'}${num(Math.abs(p.change), 1)}%`}</td>
                      <td className="num" style={{ color: 'var(--text-2)' }}>{num(p.margin, 1)}%</td>
                      <td style={{ textAlign: 'center' }}><span className={`badge ${p.abc === 'A' ? 'violet' : ''}`} style={{ fontWeight: 600, padding: '3px 8px' }}>{p.abc}</span></td>
                    </tr>
                  ))}
                  {!rows.length && <tr><td colSpan={7} className="muted" style={{ textAlign: 'center', padding: 24 }}>Nenhum produto encontrado para “{q}”.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          <section className="card" aria-labelledby="cli" style={{ paddingBottom: 12 }}>
            <div className="card-head">
              <div><h2 id="cli" className="card-title">Clientes</h2><p className="card-sub">Maiores compradores do período · clique para ver o histórico</p></div>
              {d.customers.length > 12 && <button className="btn sm" onClick={() => setAllCustomers((v) => !v)}>{allCustomers ? 'Mostrar menos' : `Mostrar ${d.customers.length}`}</button>}
            </div>
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 720 }}>
                <thead><tr><th>Cliente</th><th>Vendedor</th><th style={{ textAlign: 'right' }}>Pedidos</th><th style={{ textAlign: 'right' }}>Receita</th><th style={{ textAlign: 'right' }}>Part.</th><th style={{ textAlign: 'right' }}>Var.</th><th style={{ textAlign: 'right' }}>Último pedido</th></tr></thead>
                <tbody>
                  {d.customers.slice(0, allCustomers ? undefined : 12).map((c) => (
                    <tr key={c.id}>
                      <td><Link to={`/clientes/${c.id}`} style={{ color: 'var(--text)' }}>{c.name}</Link></td>
                      <td className="muted">{c.seller || '—'}</td>
                      <td className="num">{num(c.orders)}</td><td className="num">{brl(c.revenue)}</td>
                      <td className="num" style={{ color: 'var(--text-2)' }}>{num(c.share, 1)}%</td>
                      <td className={`num ${toneOf(c.change)}`}>{c.change === null ? 'novo' : `${c.change > 0 ? '+' : '−'}${num(Math.abs(c.change), 1)}%`}</td>
                      <td className="num" style={{ color: 'var(--text-2)' }}>{brDate(c.lastOrder)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
