import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import PrintButton from '../components/PrintButton.jsx';
import { PageHead } from '../components/Layout.jsx';
import { Icon, ErrorBox, KpiSkeleton, useAsync } from '../components/ui.jsx';
import { brl, brlK, num, initials } from '../format.js';

const MEDAL = [['#FBBF24', '#1A1405'], ['#C9C9D1', '#16161A'], ['#C08457', '#1A0F07']];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function monthOptions(today) {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    return [key, `${MONTHS[d.getUTCMonth()][0].toUpperCase()}${MONTHS[d.getUTCMonth()].slice(1)} ${d.getUTCFullYear()}${i === 0 ? ' (até hoje)' : ''}`];
  });
}

function SellerRow({ s, i, expected }) {
  const [bg, fg] = MEDAL[i] || ['var(--card-3)', 'var(--muted)'];
  const pct = s.pct ?? 0;
  const color = s.pct === null ? 'var(--dim)' : expected === null || pct >= expected * 0.97 ? 'var(--violet-bar)' : 'var(--violet-dark)';
  return (
    <li style={{ display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) 76px', gap: 14, alignItems: 'center', padding: '14px 0', borderTop: i ? '1px solid var(--line)' : 0 }}>
      <span aria-label={`${i + 1}º lugar`} style={{ width: 32, height: 32, borderRadius: '50%', background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700 }}>{i + 1}</span>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
        <span style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', gap: '4px 10px' }}>
          <strong style={{ fontSize: 15, fontWeight: 600 }}>{s.name}</strong>
          <span className="dim" style={{ fontSize: 12 }}>{s.region || 'sem região'}</span>
          <span className="mono" style={{ marginLeft: 'auto', fontSize: 13, color: 'var(--text-2)' }}>{brlK(s.revenue)}{s.target ? <span className="dim"> de {brlK(s.target)}</span> : ''}</span>
        </span>
        <span style={{ position: 'relative', height: 10, borderRadius: 5, background: 'var(--card-3)' }}>
          <span style={{ position: 'absolute', inset: '0 auto 0 0', width: `${Math.min(pct, 100)}%`, background: color, borderRadius: 5, transformOrigin: 'left', animation: `growx .8s cubic-bezier(.2,.8,.2,1) ${i * 0.08}s both` }} />
          {expected !== null && expected < 100 && <span aria-hidden="true" title={`Esperado hoje: ${num(expected, 0)}%`} style={{ position: 'absolute', left: `${expected}%`, top: -4, bottom: -4, width: 2, background: 'var(--text)', borderRadius: 1 }} />}
        </span>
        <span className="dim" style={{ fontSize: 12, display: 'flex', flexWrap: 'wrap', gap: '2px 14px' }}>
          <span>{num(s.orders)} pedidos · ticket {brl(s.avgTicket)}</span>
          <span>{num(s.customers)} clientes atendidos</span>
          {s.change !== null && <span style={{ color: s.change >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>{s.change >= 0 ? '▲' : '▼'} {num(Math.abs(s.change), 1)}% vs mesmo período do mês anterior</span>}
          {s.idleCustomers > 0 && <span style={{ color: 'var(--amber-text)' }}>{s.idleCustomers} cliente(s) parado(s) há 30+ dias</span>}
        </span>
      </div>
      <span className="mono" style={{ fontSize: 18, textAlign: 'right', color: s.pct === null ? 'var(--dim)' : s.onPace ? 'var(--green-text)' : 'var(--red-text)' }}>{s.pct === null ? '—' : `${num(pct, 0)}%`}</span>
    </li>
  );
}

export default function Team() {
  const { me } = useAuth();
  const [month, setMonth] = useState(me.today.slice(0, 7));
  const q = useAsync(() => api(`/team?month=${month}`), [month]);
  const t = q.data;
  const maxReg = Math.max(...(t?.regions || []).map((r) => r.revenue), 1);
  return (
    <>
      <PageHead eyebrow="Vendedores, metas individuais e regiões" title="Equipe comercial">
        <label className="sr" htmlFor="team-month">Mês</label>
        <select id="team-month" className="select" style={{ width: 'auto', minHeight: 42 }} value={month} onChange={(e) => setMonth(e.target.value)}>
          {monthOptions(me.today).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <PrintButton />
        {me.permissions.metas && <Link to="/metas" className="btn"><Icon name="target" size={16} color="var(--muted)" />Metas por vendedor</Link>}
      </PageHead>
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {!t && !q.error && <KpiSkeleton n={4} />}
      {t && !t.closed && !t.team.realized && t.dataUntil && (
        <div className="alert warn"><Icon name="info" color="var(--amber)" /><span>Ainda não há vendas de {t.label.split(' ')[0].toLowerCase()} no sistema — os últimos dados importados vão até {t.dataUntil.split('-').reverse().join('/')}. Importe as vendas mais recentes ou escolha um mês anterior.</span></div>
      )}
      {t && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, opacity: q.loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          <section className="grid-kpi" aria-label="Meta da equipe">
            <article className="kpi rise"><span className="kpi-label">Meta da equipe</span><span className="kpi-value">{t.team.target ? `${num(t.team.pct, 1)}%` : '—'}</span><span className="kpi-delta"><span>{brlK(t.team.realized)}{t.team.target ? ` de ${brlK(t.team.target)}` : ' · sem meta'}</span></span></article>
            {!t.closed && <article className="kpi rise" style={{ animationDelay: '.05s' }}><span className="kpi-label">Esperado até hoje</span><span className="kpi-value">{t.expectedPct === null ? '—' : `${num(t.expectedPct, 0)}%`}</span><span className="kpi-delta"><span>dias úteis já passados no mês</span></span></article>}
            <article className="kpi rise" style={{ animationDelay: '.1s', ...(!t.closed && t.team.projectionPct !== null && t.team.projectionPct < 100 ? { background: 'var(--amber-bg)', borderColor: 'var(--amber-line)' } : {}) }}><span className="kpi-label">{t.closed ? 'Fechamento' : 'Previsão de fechamento'}</span><span className="kpi-value">{brlK(t.team.projection)}</span><span className={`kpi-delta ${t.team.projectionPct === null ? '' : t.team.projectionPct >= 100 ? 'pos' : 'warn'}`}>{t.team.projectionPct === null ? 'sem meta' : `${num(t.team.projectionPct, 1)}% da meta`}</span></article>
            {!t.closed && t.team.requiredPerDay !== null && <article className="kpi rise" style={{ animationDelay: '.15s' }}><span className="kpi-label">Ritmo necessário</span><span className="kpi-value">{brlK(t.team.requiredPerDay)}</span><span className="kpi-delta"><span>por dia útil · faltam {num(t.team.businessDaysLeft, 1)} dias úteis</span></span></article>}
          </section>

          <div className="row" style={{ alignItems: 'flex-start' }}>
            <section className="card" aria-labelledby="rk" style={{ flex: '2 1 520px' }}>
              <div className="card-head">
                <div><h2 id="rk" className="card-title">Ranking de vendedores</h2><p className="card-sub">% da meta individual{t.expectedPct !== null && t.expectedPct < 100 ? ` · o traço mostra onde deveria estar hoje (${num(t.expectedPct, 0)}%)` : ''}</p></div>
              </div>
              <ol style={{ margin: 0, padding: 0, listStyle: 'none' }}>
                {t.sellers.map((s, i) => <SellerRow key={s.name} s={s} i={i} expected={t.closed ? null : t.expectedPct} />)}
              </ol>
              {!t.sellers.length && <p className="muted">Nenhuma venda com vendedor neste mês. Importe vendas com a coluna “vendedor”.</p>}
              {t.sellers.some((s) => s.target === null) && <p className="dim" style={{ fontSize: 12 }}>Vendedores sem meta aparecem com “—”. Defina em Metas › Por vendedor.</p>}
            </section>

            <div style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 24 }}>
              <section className="card" aria-labelledby="rg">
                <div><h2 id="rg" className="card-title">Regiões</h2><p className="card-sub">Pela região do cliente · variação contra o mesmo período do mês anterior</p></div>
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14 }}>
                  {t.regions.map((r) => (
                    <li key={r.region} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14 }}><span>{r.region}</span><span className="mono" style={{ fontSize: 13 }}>{brlK(r.revenue)} <span className="dim">· {num(r.share, 0)}%</span></span></span>
                      <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.revenue / maxReg) * 100}%` }} /></span>
                      <span className="dim" style={{ fontSize: 12, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                        <span>{r.sellers.length ? r.sellers.map((x) => x.split(' ')[0]).join(', ') : '—'} · {num(r.customers)} clientes</span>
                        {r.change !== null && <span style={{ color: r.change >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>{r.change >= 0 ? '+' : '−'}{num(Math.abs(r.change), 1)}%</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className="card" aria-labelledby="hl">
                <h2 id="hl" className="card-title"><Icon name="sparkle" size={16} color="var(--violet-text)" />Destaques da semana</h2>
                <ul className="list">
                  {t.highlights.map((h) => (
                    <li key={h.label}>
                      <span className="avatar">{initials(h.who)}</span>
                      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span>{h.label}</span><span className="dim" style={{ fontSize: 12 }}>{h.detail}</span></span>
                      <span style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}><strong style={{ fontSize: 14 }}>{h.who}</strong><span className="mono dim" style={{ fontSize: 12 }}>{h.kind === 'money' ? brl(h.value) : `${num(h.value)} ${h.unit}`}</span></span>
                    </li>
                  ))}
                  {!t.highlights.length && <li className="muted">Sem vendas nos últimos 7 dias.</li>}
                </ul>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
