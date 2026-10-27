import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import { Icon, ErrorBox, Empty, Markdown, useAsync, useToast, Check, SelectBar, useSelection } from '../components/ui.jsx';
import { dayGroup, relTime } from '../format.js';

const TABS = [['', 'Tudo'], ['ai', 'Perguntas à IA'], ['report', 'Relatórios'], ['import', 'Importações'], ['config', 'Configurações e acesso'], ['auditoria', 'Auditoria']];
const KIND = {
  ai: ['Pergunta à IA', 'sparkle', 'var(--violet-soft)', 'var(--violet-text)'],
  report: ['Relatório', 'file', 'var(--card-2)', 'var(--text-2)'],
  import: ['Dados', 'upload', 'var(--card-2)', 'var(--text-2)'],
  config: ['Configuração', 'building', 'var(--card-2)', 'var(--text-2)'],
  admin: ['Administração', 'shield', 'var(--card-2)', 'var(--text-2)'],
  auth: ['Acesso', 'key', 'var(--card-2)', 'var(--text-2)'],
  tv: ['Modo TV', 'tv', 'var(--violet-soft)', 'var(--violet-text)']
};
const STATUS = { ok: ['Concluído', 'ok'], erro: ['Erro', 'err'], tv: ['Na TV', 'violet'] };

const fmtVal = (v) => (Array.isArray(v) && v.length === 2 && typeof v[0] !== 'object' ? `${v[0]} → ${v[1]}` : Array.isArray(v) ? v.join(', ') : typeof v === 'object' && v !== null ? Object.entries(v).map(([k, x]) => `${k}: ${fmtVal(x)}`).join('; ') : String(v));

/** Detalhes de um evento de auditoria (o que mudou). */
function MetaDetails({ meta }) {
  return (
    <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 14px', fontSize: 13 }}>
      {Object.entries(meta).map(([k, v]) => (
        <div key={k} style={{ display: 'contents' }}>
          <dt className="dim" style={{ textTransform: 'capitalize' }}>{k}</dt>
          <dd style={{ margin: 0 }}>{Array.isArray(v) && v.every((x) => typeof x === 'string') && v.length > 2 ? <ul style={{ margin: 0, paddingLeft: 18 }}>{v.map((x) => <li key={x}>{x}</li>)}</ul> : fmtVal(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

export default function History() {
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(null);
  const [user, setUser] = useState('');
  const toast = useToast();
  const { me } = useAuth();
  const isAdmin = me.user.role === 'admin';
  const selection = useSelection();
  const PROTECTED = ['auth', 'admin']; // login e permissões: auditoria, nunca apagados
  const deletable = (h_) => (h_?.events || []).filter((e) => !PROTECTED.includes(e.kind)).map((e) => e.id);
  const removeMany = async (body, label) => {
    if (!window.confirm(`Apagar ${label}? Acessos e mudanças de permissão não são apagados, e a exclusão fica registrada na Auditoria.`)) return;
    try { const r = await api('/history/delete', { method: 'POST', body }); selection.clear(); h.reload(); toast(`${r.deleted} registro(s) apagado(s)`); }
    catch (err) { toast('Erro', { kind: 'err', text: err.message }); }
  };
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  const h = useAsync(() => api(`/history?kind=${tab}&q=${encodeURIComponent(debounced)}&user=${user}`), [tab, debounced, user]);
  const audit = tab === 'auditoria';
  const counts = h.data?.counts || {};
  const count = (k) => (k === '' ? Object.values(counts).reduce((a, b) => a + b, 0) : k === 'config' ? (counts.config || 0) + (counts.auth || 0) + (counts.tv || 0) + (counts.admin || 0) : k === 'auditoria' ? (counts.config || 0) + (counts.auth || 0) + (counts.tv || 0) + (counts.admin || 0) + (counts.import || 0) : counts[k] || 0);
  const exportCsv = async () => {
    try {
      const r = await api(`/history?kind=${tab}&q=${encodeURIComponent(debounced)}&user=${user}&limit=5000`);
      const rows = [['Data e hora', 'Usuário', 'E-mail', 'Tipo', 'Evento', 'Status', 'IP', 'Detalhes'], ...r.events.map((e) => [new Date(e.created_at.replace(' ', 'T') + 'Z').toLocaleString('pt-BR'), e.user_name || 'Sistema', e.user_email || '', (KIND[e.kind] || KIND.config)[0], e.title, e.status, e.ip || '', e.meta && e.kind !== 'ai' ? JSON.stringify(e.meta) : ''])];
      const csv = '\ufeff' + rows.map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `${audit ? 'auditoria' : 'historico'}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    } catch (err) { toast('Não foi possível exportar', { kind: 'err', text: err.message }); }
  };

  let lastDay = null;
  return (
    <>
      <PageHead eyebrow="Tudo o que aconteceu na organização" title="Histórico">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--card)' }}>
          <Icon name="search" size={16} color="var(--dim)" /><span className="sr">Buscar no histórico</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar perguntas, relatórios…" style={{ border: 0, outline: 'none', background: 'transparent', width: 240, maxWidth: '60vw' }} />
        </label>
        <label className="sr" htmlFor="hist-user">Filtrar por usuário</label>
        <select id="hist-user" className="select" style={{ width: 'auto', minHeight: 42 }} value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="">Todos os usuários</option>
          {(h.data?.users || []).map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </select>
        <button className="btn" onClick={exportCsv} disabled={!h.data?.events.length}><Icon name="download" size={16} color="var(--muted)" />Exportar CSV</button>
      </PageHead>
      <div className="tabs" role="tablist" aria-label="Filtrar por tipo">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label} <span className="mono dim" style={{ fontSize: 12 }}>{h.data ? count(k) : ''}</span></button>)}
      </div>
      {audit && h.data && (
        <div className={`alert ${h.data.failedLogins7d >= 5 ? 'warn' : 'info'}`}>
          <Icon name={h.data.failedLogins7d >= 5 ? 'alert' : 'shield'} color={h.data.failedLogins7d >= 5 ? 'var(--amber)' : 'var(--violet-text)'} />
          <span>Acessos, mudanças de usuários e permissões, configurações, importações e avisos na TV, com o endereço (IP) de onde veio cada ação. {h.data.failedLogins7d ? <strong>{h.data.failedLogins7d} tentativa(s) de login com senha errada nos últimos 7 dias.</strong> : 'Nenhuma tentativa de login falha nos últimos 7 dias.'}</span>
        </div>
      )}
      {h.error && <ErrorBox error={h.error} onRetry={h.reload} />}
      {!h.data && !h.error && <div className="card"><div className="skel" style={{ height: 300 }} /></div>}
      {h.data && !h.data.events.length && (
        <Empty icon="clock" title={q ? 'Nada encontrado' : 'Nenhum registro ainda'} text={q ? `Nenhum evento contém “${q}”.` : 'Quando alguém usar o Cortex, gerar relatórios ou mudar configurações, o registro aparece aqui.'} />
      )}
      {isAdmin && <SelectBar selection={selection} ids={deletable(h.data)}>
        <button className="btn sm" onClick={() => removeMany({ olderThanDays: 90 }, 'os registros com mais de 90 dias')}><Icon name="trash" size={14} />Apagar mais antigos que 90 dias</button>
        <button className="btn sm danger" onClick={() => removeMany({ ids: [...selection.sel] }, `${selection.size} registro(s)`)}><Icon name="trash" size={14} />Apagar selecionados</button>
      </SelectBar>}
      {h.data?.events.length > 0 && (
        <section className="card" style={{ padding: 0, gap: 0, overflow: 'hidden', opacity: h.loading ? 0.6 : 1 }} aria-label="Eventos">
          {h.data.events.map((e) => {
            const [kindLabel, icon, bg, fg] = KIND[e.kind] || KIND.config;
            const day = dayGroup(e.created_at);
            const showDay = day !== lastDay; lastDay = day;
            const [stLabel, stClass] = STATUS[e.status] || STATUS.ok;
            const expandable = (e.kind === 'ai' && e.meta?.answer) || (e.kind !== 'ai' && e.meta && Object.keys(e.meta).length > 0);
            return (
              <div key={e.id}>
                {showDay && <div style={{ padding: '14px 22px 8px', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', background: 'var(--side)', borderBottom: '1px solid var(--line-soft)' }}>{day}</div>}
                <div style={{ borderBottom: '1px solid var(--line-soft)', display: 'flex', alignItems: 'flex-start' }}>
                  {isAdmin && <span style={{ padding: '20px 0 0 14px' }}><Check checked={selection.has(e.id)} onChange={(v) => selection.toggle(e.id, v)} disabled={PROTECTED.includes(e.kind)} title={PROTECTED.includes(e.kind) ? 'Acessos e permissões ficam guardados para auditoria' : undefined} label={`Selecionar ${e.title}`} /></span>}
                  <div style={{ flex: 1, minWidth: 0 }}>
                  <button disabled={!expandable} onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={expandable ? open === e.id : undefined}
                    style={{ width: '100%', display: 'flex', gap: 14, alignItems: 'center', padding: '16px 22px', border: 0, background: 'transparent', textAlign: 'left', cursor: expandable ? 'pointer' : 'default', opacity: 1 }}>
                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={17} color={fg} /></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontWeight: 500 }}>{e.title}</span>
                      <span className="dim" style={{ fontSize: 13 }}>{e.user_name || 'Sistema'} · {kindLabel}{e.meta?.mode === 'automatico' ? ' · resposta automática' : ''}{(audit || e.kind === 'auth') && e.ip ? <> · <span className="mono">{e.ip}</span></> : ''}{audit ? ` · ${new Date(e.created_at.replace(' ', 'T') + 'Z').toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : ''}</span>
                    </span>
                    <span className={`badge ${stClass}`} style={{ fontSize: 11 }}>{stLabel}</span>
                    <span className="mono dim" style={{ fontSize: 12, minWidth: 70, textAlign: 'right' }}>{relTime(e.created_at).replace(/^(Hoje|Ontem), /, '')}</span>
                  </button>
                  {open === e.id && <div style={{ padding: '0 22px 18px 72px', color: 'var(--text-2)', fontSize: 14 }}>{e.kind === 'ai' ? <Markdown text={e.meta.answer} /> : <MetaDetails meta={e.meta} />}</div>}
                  </div>
                </div>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
