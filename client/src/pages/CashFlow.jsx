import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import PrintButton from '../components/PrintButton.jsx';
import { PageHead } from '../components/Layout.jsx';
import { Icon, Spinner, ErrorBox, KpiSkeleton, Modal, useAsync, useToast } from '../components/ui.jsx';
import { brl, brlK, brDate } from '../format.js';

const C = { in: '#2F6B57', out: '#7A3540', bal: '#A78BFA', min: '#FBBF24' };
const parseMoney = (s) => {
  const t = String(s ?? '').trim().replace(/[R$\s.]/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : NaN;
};
const fmtInput = (v) => (v === null || v === undefined ? '' : Math.round(v).toLocaleString('pt-BR'));
const dm = (s) => brDate(s).slice(0, 5);
const signed = (v) => `${v < 0 ? '−' : '+'}${brl(Math.abs(v))}`;

function niceStep(range, n) {
  const raw = range / n, p = 10 ** Math.floor(Math.log10(raw || 1));
  return ([1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s >= raw)) || p * 10;
}

function Chart({ data }) {
  const [hover, setHover] = useState(null);
  const W = data.weeks, n = W.length;
  // Uma escala só: entradas sobem do zero, saídas descem do zero, saldo na mesma régua.
  const bals = [data.hasBalance ? data.balance : 0, ...W.map((w) => w.balance)];
  const maxOut = Math.max(...W.map((w) => w.out), 0);
  const top = Math.max(...W.map((w) => w.in), ...(data.hasBalance ? bals : []), data.minimum || 0, 1);
  const bottom = Math.min(-maxOut, ...(data.hasBalance ? bals : [0]));
  const step = niceStep(top - bottom, 5);
  const lo = Math.floor(bottom / step) * step, hi = Math.ceil(top / step) * step;
  const y = (v) => 100 - ((v - lo) / (hi - lo || 1)) * 100;
  const x = (i) => ((i + 0.5) / n) * 100;
  const pts = W.map((w, i) => `${(x(i) * 10).toFixed(1)},${y(w.balance).toFixed(2)}`).join(' ');
  const ticks = []; for (let v = hi; v >= lo - 1e-6; v -= step) ticks.push(v);
  const h = hover !== null ? W[hover] : null;
  return (
    <div style={{ display: 'flex', gap: 10, height: 300 }}>
      <div aria-hidden="true" className="mono" style={{ position: 'relative', width: 58, flex: 'none', fontSize: 11, color: 'var(--dim)', marginBottom: 24 }}>
        {ticks.map((t) => <span key={t} style={{ position: 'absolute', right: 0, top: `${y(t)}%`, transform: 'translateY(-50%)', whiteSpace: 'nowrap' }}>{t === 0 ? '0' : `${t < 0 ? '−' : ''}${brlK(Math.abs(t)).replace('R$ ', '')}`}</span>)}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ flex: 1, position: 'relative' }} onMouseLeave={() => setHover(null)}>
          {ticks.map((t) => <span key={t} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: `${y(t)}%`, borderTop: '1px solid var(--line)' }} />)}
          <span aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: `${y(0)}%`, borderTop: '1px solid #4A4A55' }} />
          <div aria-hidden="true" style={{ position: 'absolute', inset: 0, display: 'flex' }}>
            {W.map((w, i) => (
              <div key={w.from} onMouseEnter={() => setHover(i)} style={{ flex: 1, position: 'relative', minWidth: 0, background: hover === i ? 'rgba(255,255,255,.03)' : 'transparent', borderRadius: 6 }}>
                <span style={{ position: 'absolute', left: '20%', width: '28%', bottom: `${100 - y(0)}%`, height: `${y(0) - y(w.in)}%`, background: C.in, borderRadius: '4px 4px 0 0' }} />
                <span style={{ position: 'absolute', right: '20%', width: '28%', top: `${y(0)}%`, height: `${y(-w.out) - y(0)}%`, background: C.out, borderRadius: '0 0 4px 4px' }} />
              </div>
            ))}
          </div>
          <svg role="img" aria-label={`Saldo projetado de ${brl(bals[0])} hoje até ${brl(data.endBalance)}; menor saldo ${brl(data.minBalance)} em ${dm(data.minDate)}`} viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
            {data.minimum > 0 && <line x1="0" x2="1000" y1={y(data.minimum)} y2={y(data.minimum)} stroke={C.min} strokeWidth="1.5" strokeDasharray="6 6" vectorEffect="non-scaling-stroke" />}
            {data.hasBalance && <polyline points={pts} fill="none" stroke={C.bal} strokeWidth="2.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />}
          </svg>
          {data.hasBalance && W.map((w, i) => <span key={w.from} aria-hidden="true" style={{ position: 'absolute', left: `${x(i)}%`, top: `${y(w.balance)}%`, width: 8, height: 8, margin: '-4px 0 0 -4px', borderRadius: '50%', background: 'var(--card)', border: `2px solid ${data.minimum && w.balance < data.minimum ? C.min : C.bal}`, pointerEvents: 'none' }} />)}
          {h && (
            <div role="status" style={{ position: 'absolute', top: 8, left: `${x(hover)}%`, transform: `translateX(${hover > n / 2 ? 'calc(-100% - 14px)' : '14px'})`, background: 'var(--card-2, #1f1f25)', border: '1px solid var(--line-2)', borderRadius: 10, padding: '10px 12px', fontSize: 12, display: 'flex', flexDirection: 'column', gap: 4, minWidth: 190, pointerEvents: 'none', boxShadow: '0 8px 24px rgba(0,0,0,.35)', zIndex: 2 }}>
              <strong style={{ fontSize: 13 }}>Semana de {dm(h.from)} a {dm(h.to)}</strong>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>Entradas<span className="mono" style={{ color: 'var(--green-text)' }}>{brl(h.in)}</span></span>
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>Saídas<span className="mono" style={{ color: 'var(--red-text)' }}>{brl(h.out)}</span></span>
              {data.hasBalance && <span style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>Saldo no fim<span className="mono">{brl(h.balance)}</span></span>}
              <span className="dim">Lançado: {brlK(h.knownIn)} a receber · {brlK(h.knownOut)} a pagar</span>
            </div>
          )}
        </div>
        <div aria-hidden="true" style={{ display: 'flex' }}>
          {W.map((w, i) => <span key={w.from} className="mono" style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 11, color: data.minimum && data.hasBalance && w.balance < data.minimum ? 'var(--amber-text)' : hover === i ? 'var(--text)' : 'var(--dim)' }}>{w.label}</span>)}
        </div>
      </div>
    </div>
  );
}

function BalanceModal({ data, onClose, onSaved }) {
  const toast = useToast();
  const [bal, setBal] = useState(fmtInput(data.balance));
  const [min, setMin] = useState(fmtInput(data.minimum || null));
  const [saving, setSaving] = useState(false);
  const b = parseMoney(bal), m = parseMoney(min);
  const invalid = Number.isNaN(b) || Number.isNaN(m) || (m !== null && m < 0);
  const submit = async (e) => {
    e.preventDefault();
    if (invalid) return;
    setSaving(true);
    try {
      const r = await api(`/cashflow/settings?h=${data.horizon}`, { method: 'PUT', body: { balance: b, minimum: m ?? 0 } });
      toast(b === null ? 'Saldo removido' : 'Saldo atualizado', { text: 'A projeção foi recalculada.' });
      onSaved(r);
    } catch (err) { toast('Não foi possível salvar', { kind: 'err', text: err.message }); setSaving(false); }
  };
  return (
    <Modal title="Saldo do caixa" onClose={onClose}>
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label className="field">Saldo de hoje (R$)<input className={`input mono${Number.isNaN(b) ? ' invalid' : ''}`} inputMode="decimal" value={bal} onChange={(e) => setBal(e.target.value)} placeholder="ex.: 120.000" autoFocus /></label>
        <p className="dim" style={{ fontSize: 12, lineHeight: 1.5, marginTop: -6 }}>Some as contas bancárias e aplicações de resgate rápido. Pode ser negativo (cheque especial).</p>
        <label className="field">Mínimo de segurança (R$)<input className={`input mono${Number.isNaN(m) || (m !== null && m < 0) ? ' invalid' : ''}`} inputMode="decimal" value={min} onChange={(e) => setMin(e.target.value)} placeholder="ex.: 60.000" /></label>
        <p className="dim" style={{ fontSize: 12, lineHeight: 1.5, marginTop: -6 }}>O Cortex avisa quando o saldo previsto ficar abaixo desse valor.</p>
        <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
          <button type="button" className="btn" onClick={onClose}>Cancelar</button>
          <button className="btn primary" disabled={saving || invalid}>{saving ? <Spinner color="#fff" /> : 'Salvar'}</button>
        </div>
      </form>
    </Modal>
  );
}

function exportCsv(d) {
  const rows = [['Data', 'Descrição', 'Origem', 'Valor', 'Saldo após'], ...d.moves.map((m) => [brDate(m.date), m.desc, m.source, m.value.toFixed(2).replace('.', ','), d.hasBalance ? m.balance.toFixed(2).replace('.', ',') : ''])];
  const csv = '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `fluxo-de-caixa-${d.horizon}-dias.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export default function CashFlow() {
  const { me } = useAuth();
  const toast = useToast();
  const [h, setH] = useState(() => { try { return +localStorage.getItem('cortex.cash.h') || 90; } catch { return 90; } });
  const q = useAsync(() => api(`/cashflow?h=${h}`), [h]);
  const [data, setData] = useState(null);
  const [edit, setEdit] = useState(false);
  const [paying, setPaying] = useState(null);
  const [showEst, setShowEst] = useState(true);
  useEffect(() => { if (q.data) setData(q.data); }, [q.data]);
  useEffect(() => { try { localStorage.setItem('cortex.cash.h', String(h)); } catch { /* sem storage */ } }, [h]);

  const pay = async (m) => {
    if (!window.confirm(`Dar baixa em "${m.desc}" (${brl(Math.abs(m.value))})? ${data.hasBalance ? 'O saldo de hoje será ajustado.' : ''}`)) return;
    setPaying(m.id);
    try {
      await api(`/bills/${m.id}/pay`, { method: 'POST' });
      toast(m.value < 0 ? 'Pagamento baixado' : 'Recebimento baixado', { text: m.desc });
      q.reload();
    } catch (e) { toast('Não foi possível dar baixa', { kind: 'err', text: e.message }); }
    setPaying(null);
  };

  const d = data;
  const moves = d ? d.moves.filter((m) => showEst || !m.estimate) : [];
  return (
    <>
      <PageHead eyebrow="Projeção a partir de contas a pagar, a receber e da média de vendas" title="Fluxo de caixa">
        <div className="seg" role="group" aria-label="Horizonte">
          {[30, 60, 90].map((x) => <button key={x} type="button" aria-pressed={h === x} onClick={() => setH(x)}>{x} dias</button>)}
        </div>
        <PrintButton />
        <button className="btn" onClick={() => setEdit(true)} disabled={!d}><Icon name="wallet" size={16} color="var(--muted)" />Atualizar saldo</button>
        <button className="btn" onClick={() => exportCsv(d)} disabled={!d}><Icon name="download" size={16} color="var(--muted)" />Exportar</button>
      </PageHead>

      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      {!d && !q.error && <KpiSkeleton n={4} />}

      {d && !d.hasBalance && (
        <div className="alert info" role="status">
          <Icon name="info" color="var(--violet-text)" />
          <span style={{ flex: 1 }}>Informe o saldo de hoje para ver o saldo projetado. Por enquanto a tela mostra só as entradas e saídas previstas.</span>
          <button className="btn sm primary" onClick={() => setEdit(true)}>Informar saldo</button>
        </div>
      )}
      {d?.firstBelow && (
        <div className="alert warn" role="alert" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
          <Icon name="alert" color="var(--amber)" />
          <span style={{ flex: '1 1 320px' }}>
            O saldo previsto fica abaixo do mínimo de segurança ({brl(d.minimum)}) {d.firstBelow === d.today ? <strong>hoje</strong> : <>em <strong>{dm(d.firstBelow)}</strong></>}
            {d.culprits.length ? `, semana do pagamento de ${d.culprits.join(' e ')}` : ''}. Menor saldo: <strong>{brl(d.minBalance)}</strong> em {dm(d.minDate)}.
          </span>
          {me.aiEnabled !== false && <Link to={`/assistente?q=${encodeURIComponent('Como está meu fluxo de caixa nos próximos 90 dias?')}`} style={{ fontSize: 13, color: 'var(--amber-text)' }}>Perguntar ao Cortex →</Link>}
        </div>
      )}

      {d && (
        <section className="grid-kpi" aria-label="Resumo do caixa" style={{ opacity: q.loading ? 0.6 : 1 }}>
          <article className="kpi rise"><span className="kpi-label">Saldo hoje</span><span className="kpi-value">{d.hasBalance ? brl(d.balance) : '—'}</span><span className="kpi-delta"><span>{d.hasBalance ? `informado em ${brDate(d.balanceDate)}` : 'não informado'}</span></span></article>
          <article className="kpi rise" style={{ animationDelay: '.05s' }}><span className="kpi-label">Entradas previstas</span><span className="kpi-value" style={{ color: 'var(--green-text)' }}>{brl(d.totals.in)}</span><span className="kpi-delta"><span>próximos {d.horizon} dias</span></span></article>
          <article className="kpi rise" style={{ animationDelay: '.1s' }}><span className="kpi-label">Saídas previstas</span><span className="kpi-value" style={{ color: 'var(--red-text)' }}>{brl(d.totals.out)}</span><span className="kpi-delta"><span>próximos {d.horizon} dias</span></span></article>
          <article className="kpi rise" style={{ animationDelay: '.15s', ...(d.firstBelow ? { background: 'var(--amber-bg)', borderColor: 'var(--amber-line)' } : {}) }}>
            <span className="kpi-label">{d.hasBalance ? 'Saldo no fim do período' : 'Resultado do período'}</span>
            <span className="kpi-value">{brl(d.hasBalance ? d.endBalance : d.totals.in - d.totals.out)}</span>
            <span className={`kpi-delta ${d.firstBelow ? 'warn' : ''}`}><span>{d.hasBalance ? `menor saldo: ${brl(d.minBalance)} em ${dm(d.minDate)}` : 'entradas − saídas'}</span></span>
          </article>
        </section>
      )}

      {d && (
        <section className="card" aria-labelledby="proj" style={{ gap: 18 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 id="proj" className="card-title">Saldo projetado por semana</h2>
              <span className="dim" style={{ fontSize: 13 }}>Barras: entradas e saídas · linha: saldo no fim da semana</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, fontSize: 13, color: 'var(--muted)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: C.in }} />Entradas</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: C.out }} />Saídas</span>
              {d.hasBalance && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 3, background: C.bal }} />Saldo</span>}
              {d.minimum > 0 && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, borderTop: `2px dashed ${C.min}` }} />Mínimo {brlK(d.minimum)}</span>}
            </div>
          </div>
          <Chart data={d} />
        </section>
      )}

      {d && (
        <section className="card" aria-labelledby="mov" style={{ gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
            <h2 id="mov" className="card-title">Próximos movimentos</h2>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--muted)' }}>
              <input type="checkbox" checked={showEst} onChange={(e) => setShowEst(e.target.checked)} />Mostrar estimativas
            </label>
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 720 }}>
              <thead><tr><th>Data</th><th>Descrição</th><th>Origem</th><th style={{ textAlign: 'right' }}>Valor</th>{d.hasBalance && <th style={{ textAlign: 'right' }}>Saldo após</th>}<th style={{ width: 90 }}><span className="sr">Ações</span></th></tr></thead>
              <tbody>
                {moves.map((m, i) => (
                  <tr key={m.id ?? `e${i}`} style={m.estimate ? { color: 'var(--muted)' } : undefined}>
                    <td className="mono" style={{ fontSize: 13 }}>{dm(m.date)}</td>
                    <td><span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{m.estimate ? <em style={{ fontStyle: 'normal' }}>{m.desc}</em> : m.desc}{m.overdue && <span className="badge err">venceu {dm(m.due)}</span>}</span></td>
                    <td><span className={`badge${m.estimate ? '' : m.value < 0 ? ' err' : ' ok'}`}>{m.source}</span></td>
                    <td className="num" style={{ color: m.value < 0 ? 'var(--red-text)' : 'var(--green-text)' }}>{signed(m.value)}</td>
                    {d.hasBalance && <td className="num" style={{ color: d.minimum && m.balance < d.minimum ? 'var(--amber-text)' : 'var(--text-2)' }}>{brl(m.balance)}</td>}
                    <td style={{ textAlign: 'right' }}>{m.id && <button className="btn sm ghost" onClick={() => pay(m)} disabled={paying === m.id} title={m.value < 0 ? 'Marcar como paga' : 'Marcar como recebida'}>{paying === m.id ? <Spinner /> : m.value < 0 ? 'Pagar' : 'Receber'}</button>}</td>
                  </tr>
                ))}
                {!moves.length && <tr><td colSpan={6} className="muted" style={{ textAlign: 'center', padding: 24 }}>Nenhum movimento previsto. Importe contas a pagar e a receber em Importação e backup.</td></tr>}
              </tbody>
            </table>
          </div>
          <p className="dim" style={{ fontSize: 12, lineHeight: 1.6 }}>
            Estimativas: média das últimas 12 semanas ({brlK(d.averages.weeklyIn)} de vendas e {brlK(d.averages.weeklyOut)} de compras e despesas por semana), descontando o que já está lançado em contas a pagar e a receber.
            {d.overdueReceivables.count > 0 && <> {d.overdueReceivables.count} recebimento(s) vencido(s) ({brl(d.overdueReceivables.amount)}) não entram na projeção.</>}
          </p>
        </section>
      )}

      {edit && d && <BalanceModal data={d} onClose={() => setEdit(false)} onSaved={(r) => { setData(r); setEdit(false); }} />}
    </>
  );
}
