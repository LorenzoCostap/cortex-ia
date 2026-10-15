import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import { Icon, Spinner, ErrorBox, KpiSkeleton, useAsync, useToast } from '../components/ui.jsx';
import { brl, num } from '../format.js';

const parseMoney = (s) => {
  const t = String(s ?? '').replace(/[R$\s.]/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
};
const fmtInput = (v) => (v === null || v === undefined ? '' : Math.round(v).toLocaleString('pt-BR'));

function Bar({ pct, partial, inverse = false }) {
  const hit = inverse ? pct !== null && pct <= 100 : pct >= 100;
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span className="bar-track" style={{ flex: 1 }}><span className="bar-fill" style={{ width: `${Math.min(pct || 0, 100)}%`, background: pct === null ? 'transparent' : inverse ? (pct > 100 ? '#E46A72' : pct > 90 ? '#FBBF24' : 'var(--violet-bar)') : hit ? 'var(--violet-bar)' : partial ? '#8B6CF0' : 'var(--violet-dark)' }} /></span>
      <span className="mono" style={{ fontSize: 13, width: 56, textAlign: 'right', color: pct === null ? 'var(--dim)' : inverse ? (pct > 100 ? 'var(--red-text)' : 'var(--text-2)') : hit ? 'var(--green-text)' : partial ? 'var(--text-2)' : 'var(--red-text)' }}>{pct === null ? '—' : `${num(pct, 1)}%`}</span>
    </span>
  );
}

function MoneyInput({ value, onChange, label }) {
  const [text, setText] = useState(fmtInput(value));
  useEffect(() => setText(fmtInput(value)), [value]);
  const n = parseMoney(text);
  return (
    <input className={`input mono${Number.isNaN(n) ? ' invalid' : ''}`} aria-label={label} inputMode="numeric" value={text} placeholder="sem meta"
      onChange={(e) => setText(e.target.value)} onBlur={() => { if (!Number.isNaN(n)) { onChange(n); setText(fmtInput(n)); } }}
      style={{ minHeight: 38, textAlign: 'right', fontSize: 13 }} />
  );
}

export default function Goals() {
  const toast = useToast();
  const [month, setMonth] = useState('');
  const [tab, setTab] = useState(() => (new URLSearchParams(window.location.search).get('aba') === 'despesa' ? 'despesa' : 'mes'));
  const g = useAsync(() => api(`/goals${month ? `?month=${month}` : ''}`), [month]);
  const [edits, setEdits] = useState({ months: {}, items: {} });
  const [saving, setSaving] = useState(false);
  const [suggest, setSuggest] = useState(5);

  useEffect(() => { if (g.data && !month) setMonth(g.data.month); }, [g.data, month]);
  const dirty = Object.keys(edits.months).length + Object.keys(edits.items).length > 0;

  const months = useMemo(() => (g.data?.months || []).map((m) => ({ ...m, target: m.month in edits.months ? edits.months[m.month] : m.target })), [g.data, edits]);
  const items = useMemo(() => {
    if (!g.data || tab === 'mes') return [];
    return g.data[tab].map((it) => {
      const k = `${tab}|${it.key}`;
      const target = k in edits.items ? edits.items[k] : it.target;
      return { ...it, target, pct: target ? (it.realized / target) * 100 : null };
    });
  }, [g.data, tab, edits]);
  const itemsSum = items.reduce((s, i) => s + (i.target || 0), 0);
  const monthTarget = months.find((m) => m.month === g.data?.month)?.target;

  const save = async () => {
    setSaving(true);
    try {
      await api('/goals', { method: 'PUT', body: {
        months: Object.entries(edits.months).map(([m, target]) => ({ month: m, target })),
        items: Object.entries(edits.items).map(([k, target]) => { const [dim, key] = k.split('|'); return { month: g.data.month, dim, key, target }; })
      } });
      setEdits({ months: {}, items: {} });
      toast('Metas salvas');
      g.reload();
    } catch (e) { toast('Não foi possível salvar', { kind: 'err', text: e.message }); }
    setSaving(false);
  };
  const suggestLastYear = async () => {
    try {
      const r = await api('/goals/copy-last-year', { method: 'POST', body: { percent: suggest } });
      if (!r.suggestions.length) return toast('Sem dados do ano anterior', { kind: 'info', text: 'Importe as vendas do ano passado para usar esta sugestão.' });
      setEdits((e) => ({ ...e, months: { ...e.months, ...Object.fromEntries(r.suggestions.map((s) => [s.month, s.target])) } }));
      toast(`${r.suggestions.length} meta(s) sugerida(s)`, { kind: 'info', text: 'Revise e clique em Salvar metas.' });
    } catch (e) { toast('Erro', { kind: 'err', text: e.message }); }
  };
  const suggestBudget = () => setEdits((e) => ({ ...e, items: { ...e.items, ...Object.fromEntries(items.filter((i) => i.average).map((i) => [`despesa|${i.key}`, Math.ceil((i.average * 1.03) / 500) * 500])) } }));
  const distribute = () => {
    if (!monthTarget || !items.length) return;
    const base = items.reduce((s, i) => s + i.realized, 0) || items.length;
    setEdits((e) => ({ ...e, items: { ...e.items, ...Object.fromEntries(items.map((i) => [`${tab}|${i.key}`, Math.round((monthTarget * (base === items.length ? 1 : i.realized) / base) / 500) * 500])) } }));
  };

  const f = g.data?.forecast;
  return (
    <>
      <PageHead eyebrow="Planejamento comercial" title="Metas">
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button className="btn" onClick={suggestLastYear}><Icon name="copy" size={16} color="var(--muted)" />Ano anterior +</button>
          <label className="sr" htmlFor="pct">Percentual sobre o ano anterior</label>
          <select id="pct" className="select" style={{ width: 'auto', minHeight: 42 }} value={suggest} onChange={(e) => setSuggest(+e.target.value)}>{[0, 3, 5, 8, 10, 15, 20].map((p) => <option key={p} value={p}>{p}%</option>)}</select>
        </span>
        <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? <><Spinner color="#fff" />Salvando…</> : dirty ? 'Salvar metas' : 'Metas salvas'}</button>
      </PageHead>

      {g.error && <ErrorBox error={g.error} onRetry={g.reload} />}
      {!f && !g.error && <KpiSkeleton n={4} />}
      {f && (
        <section className="grid-kpi" aria-label={`Meta de ${f.label}`}>
          <article className="kpi rise"><span className="kpi-label">Meta de {f.label.split(' ')[0].toLowerCase()}</span><span className="kpi-value">{f.target ? brl(f.target) : '—'}</span><span className="kpi-delta"><span>{f.target ? `${num(f.businessDaysTotal, 1)} dias úteis` : 'Defina a meta na tabela abaixo'}</span></span></article>
          <article className="kpi rise" style={{ animationDelay: '.05s' }}><span className="kpi-label">Realizado {f.closed ? '' : 'até hoje'}</span><span className="kpi-value">{brl(f.realized)}</span><Bar pct={f.achievedPct} partial={!f.closed} /></article>
          <article className="kpi rise" style={{ animationDelay: '.1s', ...(f.projectionPct !== null && f.projectionPct < 100 && !f.closed ? { background: 'var(--amber-bg)', borderColor: 'var(--amber-line)' } : {}) }}>
            <span className="kpi-label">{f.closed ? 'Fechamento' : 'Previsão de fechamento'}</span><span className="kpi-value">{brl(f.projection)}</span>
            <span className={`kpi-delta ${f.projectionPct === null ? '' : f.projectionPct >= 100 ? 'pos' : 'warn'}`}>{f.projectionPct === null ? 'sem meta' : `${num(f.projectionPct, 1)}% da meta${f.closed ? '' : ' no ritmo atual'}`}</span>
          </article>
          {!f.closed && <article className="kpi rise" style={{ animationDelay: '.15s' }}><span className="kpi-label">Ritmo necessário</span><span className="kpi-value">{f.requiredPerDay !== null ? brl(f.requiredPerDay) : '—'}<span style={{ fontSize: 14, color: 'var(--dim)' }}> /dia útil</span></span><span className="kpi-delta"><span>Média atual: {brl(f.currentPerDay)} · faltam {num(f.businessDaysLeft, 1)} dias úteis</span></span></article>}
        </section>
      )}

      {g.data && (
        <section className="card" style={{ paddingTop: 8, gap: 12, opacity: g.loading ? 0.6 : 1 }} aria-label="Metas">
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderBottom: '1px solid var(--line)' }}>
            <div className="tabs" role="tablist" style={{ border: 0 }}>
              {[['mes', 'Por mês'], ['vendedor', 'Por vendedor'], ['categoria', 'Por categoria'], ['despesa', 'Orçamento de despesas']].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l}</button>)}
            </div>
            {tab !== 'mes' && (
              <div className="toolbar" style={{ paddingBottom: 6 }}>
                <label className="sr" htmlFor="mes">Mês</label>
                <select id="mes" className="select" style={{ width: 'auto', minHeight: 38 }} value={month} onChange={(e) => { if (dirty && !window.confirm('Há alterações não salvas. Trocar de mês mesmo assim?')) return; setEdits({ months: {}, items: {} }); setMonth(e.target.value); }}>
                  {months.map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}
                </select>
                {tab === 'despesa'
                  ? <button className="btn sm" onClick={suggestBudget} disabled={!items.some((i) => i.average)}>Sugerir pela média de 3 meses</button>
                  : <button className="btn sm" onClick={distribute} disabled={!monthTarget}>Distribuir a meta do mês</button>}
              </div>
            )}
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead><tr><th>{tab === 'mes' ? 'Mês' : tab === 'vendedor' ? 'Vendedor' : tab === 'despesa' ? 'Categoria de despesa' : 'Categoria'}</th><th style={{ width: 180 }}>{tab === 'despesa' ? 'Orçamento (R$)' : 'Meta (R$)'}</th><th style={{ textAlign: 'right' }}>{tab === 'despesa' ? 'Gasto' : 'Realizado'}</th><th style={{ width: 220 }}>{tab === 'despesa' ? 'Uso do orçamento' : 'Atingimento'}</th></tr></thead>
              <tbody>
                {tab === 'mes' && months.map((m) => (
                  <tr key={m.month}>
                    <td><span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span>{m.label}</span><span className="dim" style={{ fontSize: 12 }}>{m.status}</span></span></td>
                    <td><MoneyInput label={`Meta de ${m.label}`} value={m.target} onChange={(v) => setEdits((e) => ({ ...e, months: { ...e.months, [m.month]: v } }))} /></td>
                    <td className="num" style={{ color: 'var(--text-2)' }}>{m.realized === null ? '—' : brl(m.realized)}</td>
                    <td><Bar pct={m.target && m.realized !== null ? (m.realized / m.target) * 100 : null} partial={m.status === 'em andamento'} /></td>
                  </tr>
                ))}
                {tab !== 'mes' && items.map((it) => (
                  <tr key={it.key}>
                    <td><span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}><span>{it.key}</span>{it.customers !== undefined && <span className="dim" style={{ fontSize: 12 }}>{num(it.customers || 0)} cliente(s) atendido(s) no mês</span>}{tab === 'despesa' && <span className="dim" style={{ fontSize: 12 }}>média dos 3 meses anteriores: {brl(it.average)}</span>}</span></td>
                    <td><MoneyInput label={`Meta de ${it.key}`} value={it.target} onChange={(v) => setEdits((e) => ({ ...e, items: { ...e.items, [`${tab}|${it.key}`]: v } }))} /></td>
                    <td className="num" style={{ color: 'var(--text-2)' }}>{brl(it.realized)}</td>
                    <td><Bar pct={it.pct} partial={g.data.month >= new Date().toISOString().slice(0, 7)} inverse={tab === 'despesa'} /></td>
                  </tr>
                ))}
                {tab !== 'mes' && !items.length && <tr><td colSpan={4} className="muted" style={{ textAlign: 'center', padding: 24 }}>{tab === 'vendedor' ? 'Nenhum vendedor encontrado. Importe vendas com a coluna "vendedor".' : tab === 'despesa' ? 'Nenhuma despesa lançada. Importe a planilha de despesas para orçar por categoria.' : 'Nenhuma categoria com vendas neste mês.'}</td></tr>}
              </tbody>
            </table>
          </div>
          {tab === 'despesa' && items.length > 0 && (
            <p className="dim" style={{ fontSize: 13 }}>
              Orçamento total: <strong style={{ color: 'var(--text)' }}>{brl(itemsSum)}</strong> · gasto até agora: {brl(items.reduce((s, i) => s + i.realized, 0))}
              {items.some((i) => i.target && i.realized > i.target) && <span className="warn"> · {items.filter((i) => i.target && i.realized > i.target).length} categoria(s) acima do orçado</span>}
            </p>
          )}
          {tab !== 'mes' && tab !== 'despesa' && items.length > 0 && (
            <p className="dim" style={{ fontSize: 13 }}>
              Soma das metas: <strong style={{ color: 'var(--text)' }}>{brl(itemsSum)}</strong>
              {monthTarget ? <> · meta do mês: {brl(monthTarget)} {Math.abs(itemsSum - monthTarget) > 1 && <span className="warn">({itemsSum > monthTarget ? '+' : '−'}{brl(Math.abs(itemsSum - monthTarget))})</span>}</> : null}
            </p>
          )}
          <p className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>{tab === 'despesa' ? 'O orçamento vale para as despesas operacionais (folha, aluguel, frete…), sem o custo das mercadorias. Categoria acima do orçado gera alerta, e a TV passa a comparar as despesas com este orçamento.' : 'A meta do mês é distribuída pelos dias úteis (sábado vale 30% de um dia, domingo não conta) para montar as metas diárias e semanais dos gráficos.'}</p>
        </section>
      )}
    </>
  );
}
