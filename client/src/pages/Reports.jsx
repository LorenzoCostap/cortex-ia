import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { PageHead, UnitSelect } from '../components/Layout.jsx';
import { Icon, Spinner, Switch, ErrorBox, Empty, Check, SelectBar, useSelection, useAsync, useToast } from '../components/ui.jsx';
import { relTime } from '../format.js';

const MODE = { manual: 'Manual', agendado: 'Agendado', ia: 'Pela IA' };

function ReportView({ id, onDeleted }) {
  const toast = useToast();
  const r = useAsync(() => api(`/reports/${id}`), [id]);
  if (r.error) return <ErrorBox error={r.error} onRetry={r.reload} />;
  if (!r.data) return <div className="card"><div className="skel" style={{ height: 320 }} /></div>;
  const c = r.data.content;
  const toTv = async () => {
    try {
      const res = await api('/tv/push', { method: 'POST', body: { question: r.data.title, answer: c.summary, rows: c.kpis.slice(0, 3).map((k) => ({ label: k.label, value: k.delta, tone: k.tone })) } });
      toast(res.screens ? 'Resumo enviado para a TV' : 'Enviado — nenhuma TV conectada agora', { kind: res.screens ? 'ok' : 'info' });
    } catch (e) { toast('Não foi possível enviar', { kind: 'err', text: e.message }); }
  };
  const del = async () => {
    if (!window.confirm('Excluir este relatório?')) return;
    await api(`/reports/${id}`, { method: 'DELETE' });
    toast('Relatório excluído');
    onDeleted(id);
  };
  return (
    <article className="card rise" style={{ padding: 0, overflow: 'hidden', gap: 0 }} aria-labelledby="rep-title">
      <div className="no-print" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid var(--line)', background: 'var(--side)' }}>
        <span className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><span className="pill-dot" style={{ background: 'var(--green)' }} />{MODE[r.data.mode]} · {relTime(r.data.created_at)}</span>
        <div className="toolbar" style={{ gap: 8 }}>
          <button className="btn sm" onClick={() => window.print()}><Icon name="printer" size={15} color="var(--muted)" />Imprimir / PDF</button>
          <button className="btn sm" onClick={toTv}><Icon name="tv" size={15} color="var(--violet-text)" />Exibir na TV</button>
          <button className="btn sm icon danger" style={{ width: 36 }} aria-label="Excluir relatório" onClick={del}><Icon name="trash" size={15} /></button>
        </div>
      </div>
      <div style={{ padding: 28, display: 'flex', flexDirection: 'column', gap: 22 }}>
        <div>
          <span style={{ fontSize: 12, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--violet-text)', fontWeight: 600 }}>{r.data.title.split(' · ')[0]}</span>
          <h2 id="rep-title" style={{ fontSize: 24, fontWeight: 600, marginTop: 6 }}>{c.period.label}</h2>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
          {c.kpis.map((k) => (
            <div key={k.label} style={{ padding: 14, borderRadius: 10, background: 'var(--card-2)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span className="dim" style={{ fontSize: 12 }}>{k.label}</span>
              <span className="mono" style={{ fontSize: 18, whiteSpace: 'nowrap' }}>{k.value}</span>
              <span className={k.tone} style={{ fontSize: 12 }}>{k.delta}</span>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600 }}>Resumo</h3>
          <p style={{ fontSize: 15, lineHeight: 1.7, color: 'var(--text-2)' }}>{c.summary}</p>
        </div>
        {(c.highlights?.length > 0 || c.concerns?.length > 0) && (
          <div className="row">
            {c.highlights?.length > 0 && <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 8 }}><h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--green-text)' }}>Destaques</h3><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: 'var(--text-2)' }}>{c.highlights.map((h) => <li key={h}>{h}</li>)}</ul></div>}
            {c.concerns?.length > 0 && <div style={{ flex: '1 1 220px', display: 'flex', flexDirection: 'column', gap: 8 }}><h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--red-text)' }}>Pontos de atenção</h3><ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7, color: 'var(--text-2)' }}>{c.concerns.map((h) => <li key={h}>{h}</li>)}</ul></div>}
          </div>
        )}
        {c.sections.map((s) => (
          <div key={s.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h3 style={{ fontSize: 15, fontWeight: 600 }}>{s.title}</h3>
            <div className="table-wrap">
              <table className="table">
                <thead><tr>{s.table.head.map((h, i) => <th key={h} style={{ textAlign: i ? 'right' : 'left' }}>{h}</th>)}</tr></thead>
                <tbody>
                  {s.table.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j} className={j ? 'num' : ''} style={{ fontWeight: String(row[0]).startsWith('=') ? 600 : 400 }}>{cell}</td>)}</tr>)}
                  {!s.table.rows.length && <tr><td colSpan={s.table.head.length} className="muted">Nada a listar.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export default function Reports() {
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const list = useAsync(() => api('/reports'), []);
  const [form, setForm] = useState({ type: 'executivo', custom: false, from: '', to: '' });
  const [busy, setBusy] = useState(false);
  // Relatórios excluídos nesta sessão somem da lista na hora (sem esperar o recarregamento)
  const [deleted, setDeleted] = useState([]);
  const reports = (list.data?.reports || []).filter((r) => !deleted.includes(String(r.id)));
  const current = id || reports[0]?.id;
  const selection = useSelection();
  const removeMany = async (body, label) => {
    if (!window.confirm(`Apagar ${label}? Não dá para desfazer.`)) return;
    try {
      const r = await api('/reports/delete', { method: 'POST', body });
      const gone = body.ids ? body.ids.map(String) : null;
      if (gone) setDeleted((d) => [...d, ...gone]);
      selection.clear();
      await list.reload();
      if (!gone || gone.includes(String(current))) nav('/relatorios', { replace: true });
      toast(`${r.deleted} relatório(s) apagado(s)`);
    } catch (e) { toast('Erro', { kind: 'err', text: e.message }); }
  };

  useEffect(() => { if (!id && reports[0]) nav(`/relatorios/${reports[0].id}`, { replace: true }); }, [id, reports[0]?.id, nav]); // eslint-disable-line react-hooks/exhaustive-deps

  const generate = async (e) => {
    e.preventDefault();
    if (form.custom && (!form.from || !form.to || form.from > form.to)) return toast('Período inválido', { kind: 'err', text: 'Informe a data inicial e final (a final depois da inicial).' });
    setBusy(true);
    try {
      const r = await api('/reports', { method: 'POST', body: { type: form.type, ...(form.custom ? { from: form.from, to: form.to } : {}) } });
      toast('Relatório gerado');
      list.reload();
      nav(`/relatorios/${r.id}`);
    } catch (err) { toast('Não foi possível gerar', { kind: 'err', text: err.message }); }
    setBusy(false);
  };
  const setSchedule = async (k, enabled) => {
    try {
      const s = await api('/reports/schedules', { method: 'PUT', body: { [k]: { enabled } } });
      list.setData((d) => ({ ...d, schedules: s }));
      toast(enabled ? 'Agendamento ativado' : 'Agendamento desativado');
    } catch (err) { toast('Erro', { kind: 'err', text: err.message }); }
  };

  return (
    <>
      <PageHead eyebrow="Gerados a partir dos seus dados" title="Relatórios"><UnitSelect /></PageHead>
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div className="no-print" style={{ flex: '1 1 320px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <form className="card" onSubmit={generate} aria-labelledby="nr">
            <h2 id="nr" className="card-title">Novo relatório</h2>
            <label className="field">Tipo
              <select className="select" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
                {Object.entries(list.data?.types || { executivo: 'Executivo semanal' }).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <legend style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>Período</legend>
              <label className="check"><input type="radio" name="per" checked={!form.custom} onChange={() => setForm({ ...form, custom: false })} />{form.type === 'executivo' ? 'Última semana completa' : form.type === 'caixa' ? 'Próximos 30 dias' : 'Último mês fechado'}</label>
              <label className="check"><input type="radio" name="per" checked={form.custom} onChange={() => setForm({ ...form, custom: true })} />Escolher datas</label>
              {form.custom && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                  <label className="field">De<input className="input" type="date" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value })} /></label>
                  <label className="field">Até<input className="input" type="date" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value })} /></label>
                </div>
              )}
            </fieldset>
            <button className="btn primary" type="submit" disabled={busy}>{busy ? <><Spinner color="#fff" />Gerando…</> : <><Icon name="sparkle" size={16} color="#fff" />Gerar relatório</>}</button>
          </form>

          <section className="card" aria-labelledby="ag">
            <h2 id="ag" className="card-title">Agendamentos</h2>
            <div>
              <div className="setting-row"><div><span>Executivo semanal</span><small>Toda segunda, 08:00 · aparece na TV</small></div><Switch label="Executivo semanal" checked={list.data?.schedules?.weekly?.enabled} onChange={(v) => setSchedule('weekly', v)} /></div>
              <div className="setting-row"><div><span>DRE mensal</span><small>Dia 1, 09:00</small></div><Switch label="DRE mensal" checked={list.data?.schedules?.monthly?.enabled} onChange={(v) => setSchedule('monthly', v)} /></div>
            </div>
            <p className="dim" style={{ fontSize: 12 }}>Os agendamentos rodam enquanto o Cortex estiver aberto neste computador.</p>
          </section>

          <section className="card tight" aria-labelledby="rc">
            <h2 id="rc" className="card-title">Relatórios recentes</h2>
            <SelectBar selection={selection} ids={reports.slice(0, 12).map((r) => r.id)} compact>
              <button className="btn sm" onClick={() => removeMany({ olderThanDays: 90 }, 'os relatórios com mais de 90 dias')}><Icon name="trash" size={14} />Mais de 90 dias</button>
              <button className="btn sm danger" onClick={() => removeMany({ ids: [...selection.sel] }, `${selection.size} relatório(s)`)}><Icon name="trash" size={14} />Apagar</button>
            </SelectBar>
            {reports.length ? reports.slice(0, 12).map((r) => (
              <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <Check checked={selection.has(r.id)} onChange={(v) => selection.toggle(r.id, v)} label={`Selecionar ${r.title}`} />
              <button onClick={() => nav(`/relatorios/${r.id}`)} className="btn ghost" style={{ flex: 1, minWidth: 0, justifyContent: 'flex-start', flexDirection: 'column', alignItems: 'flex-start', gap: 3, minHeight: 0, padding: '10px 12px', whiteSpace: 'normal', textAlign: 'left', background: String(r.id) === String(current) ? 'var(--violet-soft)' : 'transparent', fontWeight: 400 }}>
                <span style={{ fontSize: 14 }}>{r.title}</span>
                <span className="dim" style={{ fontSize: 12 }}>{MODE[r.mode]} · {relTime(r.created_at)}</span>
              </button>
              </div>
            )) : <p className="dim" style={{ fontSize: 13 }}>Nenhum relatório ainda.</p>}
          </section>
        </div>
        <div style={{ flex: '2 1 520px', minWidth: 0 }}>
          {list.error ? <ErrorBox error={list.error} onRetry={list.reload} /> : current ? <ReportView id={current} onDeleted={(gone) => { setDeleted((d) => [...d, String(gone)]); const next = reports.find((r) => String(r.id) !== String(gone)); list.reload(); nav(next ? `/relatorios/${next.id}` : '/relatorios', { replace: true }); }} /> : list.data && <Empty icon="file" title="Nenhum relatório gerado" text="Escolha um tipo ao lado e clique em Gerar relatório." />}
        </div>
      </div>
    </>
  );
}
