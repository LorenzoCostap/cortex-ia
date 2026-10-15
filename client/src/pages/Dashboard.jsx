import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import { Icon, Kpi, KpiSkeleton, CardSkeleton, ErrorBox, useAsync } from '../components/ui.jsx';
import PeriodPicker, { periodLabel, loadSavedPeriod, savePeriod } from '../components/PeriodPicker.jsx';
import RevenueGoalChart, { GoalLegend } from '../components/RevenueGoalChart.jsx';
import CompareToggle, { useCompare } from '../components/CompareToggle.jsx';
import IncomeExpenseChart, { IncomeLegend } from '../components/IncomeExpenseChart.jsx';
import { brl, brlK, delta, toneOf, num, initials } from '../format.js';

const SEV = { alta: '#F87171', media: '#FBBF24', info: '#8B6CF0', pos: '#34D399' };

function GoalCard({ today, fallback, cmp }) {
  const [period, setPeriodState] = useState(() => loadSavedPeriod(today, fallback));
  const setPeriod = (v) => { setPeriodState(v); savePeriod(v); };
  const g = useAsync(() => api(`/goal-series?from=${period.from}&to=${period.to}`), [period.from, period.to]);
  const unit = { dia: 'por dia', semana: 'por semana', mes: 'por mês' }[g.data?.unit] || '';
  const [view, setViewState] = useState(() => { try { return localStorage.getItem('cortex.dash.view') || 'meta'; } catch { return 'meta'; } });
  const setView = (v) => { setViewState(v); try { localStorage.setItem('cortex.dash.view', v); } catch { /* sem storage */ } };
  const tot = (g.data?.buckets || []).reduce((a, b) => ({ rev: a.rev + b.revenue, exp: a.exp + b.expenses }), { rev: 0, exp: 0 });

  return (
    <section className="card" aria-labelledby="goal-title" style={{ flex: '2 1 560px' }}>
      <div className="card-head">
        <div>
          <h2 id="goal-title" className="card-title">{view === 'meta' ? 'Receita × meta' : 'Receitas × despesas'}</h2>
          <p className="card-sub">{periodLabel(period)} {unit && `· ${unit}`} · passe o mouse sobre as barras · o modo TV usa este mesmo período</p>
        </div>
        <div className="seg" role="group" aria-label="Visão do gráfico">
          <button type="button" aria-pressed={view === 'meta'} onClick={() => setView('meta')}>Receita × meta</button>
          <button type="button" aria-pressed={view === 'despesas'} onClick={() => setView('despesas')}>Receitas × despesas</button>
        </div>
        {g.data && view === 'despesas' && (
          <span className="badge" style={{ padding: '6px 12px', fontSize: 13 }}>
            Lucro <strong style={{ color: tot.rev - tot.exp >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>{brlK(tot.rev - tot.exp)}</strong> · margem {num(tot.rev ? ((tot.rev - tot.exp) / tot.rev) * 100 : 0, 1)}%
          </span>
        )}
        {g.data && view === 'meta' && (
          <span className="badge" style={{ padding: '6px 12px', fontSize: 13 }}>
            <strong style={{ color: 'var(--text)' }}>{num(g.data.achieved, 1)}%</strong> da meta · {g.data.hits} de {g.data.buckets.filter((b) => b.goal).length} {g.data.unit === 'mes' ? 'meses' : g.data.unit === 'semana' ? 'semanas' : 'dias'} batidos
          </span>
        )}
      </div>
      <PeriodPicker value={period} onChange={setPeriod} today={today} id="dash-periodo" />
      {view === 'meta' ? <GoalLegend lastYear={cmp === 'ano'} /> : <IncomeLegend />}
      {g.error ? <ErrorBox error={g.error} onRetry={g.reload} /> : !g.data ? <div className="skel" style={{ height: 290 }} /> : (
        <div style={{ opacity: g.loading ? 0.5 : 1, transition: 'opacity .2s' }}>
          {view === 'meta' ? <RevenueGoalChart buckets={g.data.buckets} lastYear={cmp === 'ano'} /> : <IncomeExpenseChart buckets={g.data.buckets} />}
        </div>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { me } = useAuth();
  const [cmp, setCmp] = useCompare();
  const d = useAsync(() => api(`/dashboard?cmp=${cmp}`), [cmp]);
  const hour = new Date().getHours();
  const hello = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const k = d.data?.kpis, dl = d.data?.deltas, prevShort = d.data?.compareShort;

  return (
    <>
      <PageHead eyebrow={`${hello}, ${me.user.name.split(' ')[0]}`} title="Dashboard">
        {me.org.isDemo && <span className="badge demo">Dados de demonstração</span>}
        {d.data && <span className="badge" style={{ padding: '8px 12px', fontSize: 13 }}><Icon name="calendar" size={15} color="var(--muted)" />{d.data.label} <span className="dim">vs {prevShort}</span></span>}
        <CompareToggle value={cmp} onChange={setCmp} />
      </PageHead>

      {d.error && <ErrorBox error={d.error} onRetry={d.reload} />}
      {!d.data && !d.error && <KpiSkeleton />}
      {k && (
        <section aria-label="Indicadores principais" className="grid-kpi">
          <Kpi label="Faturamento" value={brl(k.revenue)} delta={delta(dl.revenue)} tone={toneOf(dl.revenue)} note={`vs ${prevShort}`} />
          <Kpi label="Lucro líquido" value={brl(k.profit)} delta={delta(dl.profit)} tone={toneOf(dl.profit)} note={`vs ${prevShort}`} delay={0.05} />
          <Kpi label="Margem líquida" value={`${num(k.netMargin, 1)}%`} delta={delta(dl.netMarginPp, { pp: true })} tone={toneOf(dl.netMarginPp)} note={`vs ${prevShort}`} delay={0.1} />
          <Kpi label="Despesas" value={brl(k.expenses)} delta={delta(dl.expenses)} tone={toneOf(dl.expenses, false)} note={`vs ${prevShort}`} delay={0.15} />
          <Kpi label="A receber" value={brl(d.data.receivables.total)} delta={d.data.receivables.overdue ? `${d.data.receivables.overdue} títulos vencidos` : 'Nenhum vencido'} tone={d.data.receivables.overdue ? 'warn' : 'pos'} delay={0.2} />
          {d.data.forecast?.target && !d.data.forecast.closed && (
            <Link to="/metas" style={{ color: 'inherit' }} aria-label="Ver metas">
              <Kpi label={`Previsão de ${d.data.forecast.label.split(' ')[0].toLowerCase()}`} value={brl(d.data.forecast.projection)} delta={`${num(d.data.forecast.projectionPct, 1)}% da meta no ritmo atual`} tone={d.data.forecast.projectionPct >= 100 ? 'pos' : 'warn'} delay={0.25} />
            </Link>
          )}
        </section>
      )}

      <div className="row">
        <GoalCard today={me.today} fallback={me.tv?.goalPeriod} cmp={cmp} />
        <section className="card" aria-labelledby="ai-title" style={{ flex: '1 1 320px' }}>
          <div>
            <h2 id="ai-title" className="card-title"><Icon name="sparkle" size={16} color="var(--violet-text)" />{me.aiEnabled === false ? 'Destaques automáticos' : 'Insights do Cortex'}</h2>
            <p className="card-sub">{d.data?.insights?.[0] ? `Atualizado ${new Date(d.data.insights[0].createdAt.replace(' ', 'T') + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} · ${d.data.insights[0].source === 'ia' ? 'IA local' : 'automático'}` : 'Gerando os primeiros insights…'}</p>
          </div>
          {!d.data ? <div className="skel" style={{ height: 220 }} /> : (
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {(d.data.insights || []).filter((i) => ['queda', 'clientes', 'atencao', 'margem'].includes(i.key)).slice(0, 3).map((i) => (
                <li key={i.key} style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', display: 'flex', gap: 12 }}>
                  <span className="pill-dot" style={{ marginTop: 6, background: SEV[i.severity] || SEV.info }} />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>{i.question}</span>
                    <span style={{ fontSize: 14, lineHeight: 1.5 }}>{i.answer}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          <Link to="/assistente" className="btn soft" style={{ marginTop: 'auto' }}>{me.aiEnabled === false ? 'Ver perguntas rápidas' : 'Perguntar ao Cortex'}<Icon name="arrow" size={16} /></Link>
        </section>
      </div>

      {!d.data && !d.error && <div className="grid-3"><CardSkeleton height={160} /><CardSkeleton height={160} /><CardSkeleton height={160} /></div>}
      {d.data && (
        <div className="grid-3">
          <section className="card" aria-labelledby="tp">
            <div className="card-head"><h2 id="tp" className="card-title">Produtos com mais receita</h2><Link to="/vendas" style={{ fontSize: 13 }}>Ver todos</Link></div>
            <ul className="list" style={{ gap: 14 }}>
              {d.data.topProducts.map((p) => (
                <li key={p.name} style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6, padding: 0, border: 0 }}>
                  <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{p.name}</span><span className="mono" style={{ fontSize: 13, color: 'var(--text-2)' }}>{brlK(p.revenue)}</span></span>
                  <span className="bar-track"><span className="bar-fill" style={{ width: `${(p.revenue / d.data.topProducts[0].revenue) * 100}%` }} /></span>
                </li>
              ))}
            </ul>
          </section>
          <section className="card" aria-labelledby="cq">
            <div className="card-head"><h2 id="cq" className="card-title">Clientes comprando menos</h2><span className="dim" style={{ fontSize: 12 }}>vs média de 3 meses</span></div>
            {d.data.decliningCustomers.length ? (
              <ul className="list">
                {d.data.decliningCustomers.map((c) => (
                  <li key={c.name}>
                    <span className="avatar sq">{initials(c.name)}</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>{me.permissions.vendas ? <Link to={`/clientes/${c.id}`} style={{ color: 'var(--text)' }}>{c.name}</Link> : <span>{c.name}</span>}<span className="dim" style={{ fontSize: 12 }}>Último pedido {c.daysSinceLastOrder === 0 ? 'hoje' : `há ${c.daysSinceLastOrder} dias`}</span></span>
                    <span className="mono neg" style={{ fontSize: 13 }}>{delta(c.change).replace('▼ ', '−')}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Nenhum cliente relevante em queda.</p>}
          </section>
          <section className="card" aria-labelledby="cv">
            <div className="card-head"><h2 id="cv" className="card-title">Contas a pagar</h2><span className="dim" style={{ fontSize: 12 }}>próximos 7 dias</span></div>
            {d.data.billsDue.length ? (
              <ul className="list">
                {d.data.billsDue.map((b) => (
                  <li key={b.party + b.dueDate}>
                    <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2 }}><span>{b.party}</span><span className="dim" style={{ fontSize: 12 }}>{b.dueDate.split('-').reverse().join('/')}</span></span>
                    <span className="mono" style={{ fontSize: 13 }}>{brl(b.amount)}</span>
                    <span className={`badge ${b.status === 'vencida' ? 'err' : b.status === 'hoje' ? 'warn' : ''}`} style={{ fontSize: 11 }}>{b.status === 'vencida' ? 'Vencida' : b.status === 'hoje' ? 'Hoje' : `${b.daysToDue} dias`}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="muted">Nada vencendo nos próximos 7 dias.</p>}
          </section>
        </div>
      )}
    </>
  );
}
