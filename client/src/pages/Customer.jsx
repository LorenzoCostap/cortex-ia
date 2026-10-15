import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon, ErrorBox, KpiSkeleton, Markdown, useAsync } from '../components/ui.jsx';
import { brl, brlK, num, initials, brDate } from '../format.js';

const STATUS = {
  risco: ['Em risco', 'err'],
  queda: ['Comprando menos', 'warn'],
  crescendo: ['Crescendo', 'ok'],
  estavel: ['Estável', '']
};

function MonthsChart({ months }) {
  const [sel, setSel] = useState(null);
  const max = Math.max(...months.flatMap((m) => [m.value, m.lastYear]), 1) * 1.08;
  const hasLy = months.some((m) => m.lastYear > 0);
  const last = months.length - 1;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div role="group" aria-label="Compras por mês" style={{ position: 'relative', height: 220, display: 'flex', gap: 6, borderBottom: '1px solid var(--line-2)' }} onMouseLeave={() => setSel(null)}>
        {months.map((m, i) => {
          const on = sel === i;
          const ch = m.lastYear ? ((m.value - m.lastYear) / m.lastYear) * 100 : null;
          return (
            <div key={m.key} style={{ flex: 1, position: 'relative', minWidth: 0, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: 3, borderRadius: 6, background: on ? 'var(--violet-soft)' : 'transparent' }}>
              {hasLy && <span aria-hidden="true" style={{ width: '30%', maxWidth: 16, height: `${(m.lastYear / max) * 100}%`, background: '#3A3A46', borderRadius: '3px 3px 0 0' }} />}
              <span aria-hidden="true" style={{ width: hasLy ? '30%' : '50%', maxWidth: 22, height: `${(m.value / max) * 100}%`, background: i === last ? '#8B6CF0' : 'var(--violet-dark)', borderRadius: '3px 3px 0 0' }} />
              <button type="button" onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onBlur={() => setSel(null)} aria-label={`${m.full}: ${brlK(m.value)}${hasLy ? `, ano anterior ${brlK(m.lastYear)}` : ''}`} style={{ position: 'absolute', inset: 0, border: 0, background: 'transparent', cursor: 'pointer' }} />
              {on && (
                <div aria-hidden="true" style={{ position: 'absolute', bottom: '100%', [i < months.length / 2 ? 'left' : 'right']: 0, marginBottom: 6, width: 190, zIndex: 3, pointerEvents: 'none', padding: 12, borderRadius: 10, background: 'var(--card-3)', border: '1px solid var(--line-2)', boxShadow: '0 12px 32px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
                  <strong>{m.full}</strong>
                  <span style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Compras</span><span className="mono">{brl(m.value)}</span></span>
                  {hasLy && <span style={{ display: 'flex', justifyContent: 'space-between' }}><span className="muted">Ano anterior</span><span className="mono">{brl(m.lastYear)}</span></span>}
                  {ch !== null && <span style={{ color: ch >= 0 ? 'var(--green-text)' : 'var(--red-text)', fontSize: 12 }}>{ch >= 0 ? '+' : '−'}{num(Math.abs(ch), 1)}% vs ano anterior</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', gap: 6 }}>
        {months.map((m, i) => <span key={m.key} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: i === (sel ?? last) ? 'var(--text)' : 'var(--dim)', fontWeight: i === (sel ?? last) ? 600 : 400 }}>{m.label}</span>)}
      </div>
    </div>
  );
}

function exportCsv(c) {
  const rows = [['Mês', 'Compras', 'Ano anterior'], ...c.months.map((m) => [m.full, m.value.toFixed(2).replace('.', ','), m.lastYear.toFixed(2).replace('.', ',')]), [], ['Pedido', 'Data', 'Itens', 'Total'], ...c.orders.map((o) => [o.number || o.id, brDate(o.date), o.items, o.total.toFixed(2).replace('.', ',')])];
  const csv = '﻿' + rows.map((r) => r.map((x) => `"${String(x).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `cliente-${(c.code || c.id)}.csv`;
  a.click();
}

export default function Customer() {
  const { me } = useAuth();
  const { id } = useParams();
  const q = useAsync(() => api(`/customers/${id}`), [id]);
  const c = q.data;
  const [label, tone] = STATUS[c?.status] || STATUS.estavel;
  const ask = c ? `/assistente?q=${encodeURIComponent(`Por que o cliente ${c.name} está comprando menos?`)}` : '/assistente';

  return (
    <>
      <nav aria-label="Caminho" style={{ display: 'flex', gap: 8, fontSize: 13, color: 'var(--dim)', flexWrap: 'wrap' }}>
        <Link to="/vendas">Vendas e indicadores</Link><span aria-hidden="true">/</span><span>Clientes</span>
        {c && <><span aria-hidden="true">/</span><span style={{ color: 'var(--text-2)' }}>{c.name}</span></>}
      </nav>

      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {!c && !q.error && <KpiSkeleton n={4} />}
      {c && (
        <>
          <header className="page-head" style={{ alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span className="avatar sq" style={{ width: 48, height: 48, fontSize: 16 }}>{initials(c.name)}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <h1 className="page-title">{c.name}</h1>
                <span className="muted" style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {[c.code, c.region, c.seller && `vendedor(a) ${c.seller}`].filter(Boolean).join(' · ')}
                  <span className={`badge ${tone}`}>{label}</span>
                </span>
              </div>
            </div>
            <div className="toolbar">
              <button className="btn" onClick={() => exportCsv(c)}><Icon name="download" size={16} color="var(--muted)" />Exportar</button>
              {me.aiEnabled !== false && <Link to={ask} className="btn primary"><Icon name="sparkle" size={16} />Perguntar sobre este cliente</Link>}
            </div>
          </header>

          <section className="grid-kpi" aria-label="Indicadores do cliente">
            <article className="kpi rise"><span className="kpi-label">Compras em 12 meses</span><span className="kpi-value">{brl(c.total12)}</span><span className="kpi-delta"><span>{c.rank ? `${c.rank}º maior de ${c.customers} clientes` : 'sem compras no período'}</span></span></article>
            <article className="kpi rise" style={{ animationDelay: '.05s' }}><span className="kpi-label">{c.month.label.split(' ')[0]}</span><span className="kpi-value">{brl(c.month.value)}</span>
              <span className={`kpi-delta ${c.month.change === null ? '' : c.month.change >= 0 ? 'pos' : 'neg'}`}>{c.month.change === null ? 'sem compras no mês anterior' : `${c.month.change >= 0 ? '▲' : '▼'} ${num(Math.abs(c.month.change), 1)}%`} {c.month.change !== null && <span>vs {c.month.prevLabel.split(' ')[0].toLowerCase()}</span>}</span></article>
            <article className="kpi rise" style={{ animationDelay: '.1s' }}><span className="kpi-label">Frequência normal</span><span className="kpi-value">{c.frequencyDays ? (c.frequencyDays < 1.5 ? 'quase diária' : `a cada ${Math.round(c.frequencyDays)} dias`) : '—'}</span>
              <span className={`kpi-delta ${c.status === 'risco' ? 'neg' : ''}`}><span>{c.daysSinceLastOrder === null ? 'nenhum pedido' : c.daysSinceLastOrder === 0 ? 'último pedido hoje' : `último pedido há ${c.daysSinceLastOrder} dias`}</span></span></article>
            <article className="kpi rise" style={{ animationDelay: '.15s', ...(c.receivables.overdueDays ? { background: 'var(--amber-bg)', borderColor: 'var(--amber-line)' } : {}) }}><span className="kpi-label">A receber</span><span className="kpi-value">{brl(c.receivables.total)}</span>
              <span className={`kpi-delta ${c.receivables.overdueDays ? 'warn' : ''}`}><span>{c.receivables.overdueDays ? `vencido há ${c.receivables.overdueDays} dias` : c.receivables.nextDue ? `próximo vencimento ${brDate(c.receivables.nextDue).slice(0, 5)}` : 'nada em aberto'}</span></span></article>
          </section>

          <div className="row">
            <section className="card" aria-labelledby="hist" style={{ flex: '2 1 520px' }}>
              <div className="card-head">
                <div><h2 id="hist" className="card-title">Compras por mês</h2><p className="card-sub">Últimos 12 meses comparados ao mesmo mês do ano anterior</p></div>
                <div style={{ display: 'flex', gap: 14, fontSize: 13, color: 'var(--muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--violet-dark)' }} />Últimos 12 meses</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: '#3A3A46' }} />Ano anterior</span>
                </div>
              </div>
              <MonthsChart months={c.months} />
            </section>
            <section className="card" aria-labelledby="ia" style={{ flex: '1 1 300px', background: 'var(--violet-soft)', borderColor: 'var(--violet-line)' }}>
              <h2 id="ia" className="card-title"><Icon name="sparkle" size={16} color="var(--violet-text)" />{me.aiEnabled === false ? 'Leitura automática' : 'Leitura do Cortex'}</h2>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}><Markdown text={c.reading} /></div>
              {c.suggestion && <p style={{ fontSize: 14, lineHeight: 1.6 }}><strong>Sugestão:</strong> {c.suggestion}</p>}
              {me.aiEnabled !== false && <Link to={ask} className="btn soft" style={{ marginTop: 'auto' }}>Aprofundar com o Cortex<Icon name="arrow" size={16} /></Link>}
            </section>
          </div>

          <div className="row">
            <section className="card" aria-labelledby="pr" style={{ flex: '1 1 420px' }}>
              <div className="card-head"><h2 id="pr" className="card-title">Produtos: média × {c.month.label.split(' ')[0].toLowerCase()}</h2><span className="dim" style={{ fontSize: 12 }}>média dos 3 meses anteriores</span></div>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>Produto</th><th style={{ textAlign: 'right' }}>Média/mês</th><th style={{ textAlign: 'right' }}>{c.month.label.split(' ')[0]}</th></tr></thead>
                  <tbody>
                    {c.products.map((p) => (
                      <tr key={p.name}><td>{p.name}</td><td className="num" style={{ color: 'var(--text-2)' }}>{brl(p.avg)}</td><td className={`num ${p.diff < -0.2 * p.avg ? 'neg' : p.diff > 0.2 * p.avg ? 'pos' : ''}`}>{brl(p.current)}</td></tr>
                    ))}
                    {!c.products.length && <tr><td colSpan={3} className="muted" style={{ textAlign: 'center', padding: 20 }}>Sem compras nos últimos 4 meses.</td></tr>}
                  </tbody>
                </table>
              </div>
            </section>
            <section className="card" aria-labelledby="ped" style={{ flex: '1 1 360px' }}>
              <h2 id="ped" className="card-title">Últimos pedidos</h2>
              <ul className="list">
                {c.orders.map((o) => (
                  <li key={o.id}>
                    <span className="mono dim" style={{ fontSize: 12, width: 44 }}>{brDate(o.date).slice(0, 5)}</span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}><span>{o.number ? `Pedido ${o.number}` : `${o.items} ite${o.items === 1 ? 'm' : 'ns'}`}</span><span className="dim" style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.summary}</span></span>
                    <span className="mono" style={{ fontSize: 13 }}>{brl(o.total)}</span>
                  </li>
                ))}
                {!c.orders.length && <li className="muted">Nenhum pedido.</li>}
              </ul>
            </section>
          </div>
        </>
      )}
    </>
  );
}
