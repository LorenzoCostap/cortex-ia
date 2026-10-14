import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { PageHead } from '../components/Layout.jsx';
import { Icon, ErrorBox, Empty, Markdown, useAsync } from '../components/ui.jsx';
import { dayGroup, relTime } from '../format.js';

const TABS = [['', 'Tudo'], ['ai', 'Perguntas à IA'], ['report', 'Relatórios'], ['import', 'Importações'], ['config', 'Configurações e acesso']];
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

export default function History() {
  const [tab, setTab] = useState('');
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [open, setOpen] = useState(null);
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 300); return () => clearTimeout(t); }, [q]);
  const h = useAsync(() => api(`/history?kind=${tab}&q=${encodeURIComponent(debounced)}`), [tab, debounced]);
  const counts = h.data?.counts || {};
  const count = (k) => (k === '' ? Object.values(counts).reduce((a, b) => a + b, 0) : k === 'config' ? (counts.config || 0) + (counts.auth || 0) + (counts.tv || 0) + (counts.admin || 0) : counts[k] || 0);

  let lastDay = null;
  return (
    <>
      <PageHead eyebrow="Tudo o que aconteceu na organização" title="Histórico">
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 42, padding: '0 12px', borderRadius: 10, border: '1px solid var(--line-2)', background: 'var(--card)' }}>
          <Icon name="search" size={16} color="var(--dim)" /><span className="sr">Buscar no histórico</span>
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar perguntas, relatórios…" style={{ border: 0, outline: 'none', background: 'transparent', width: 240, maxWidth: '60vw' }} />
        </label>
      </PageHead>
      <div className="tabs" role="tablist" aria-label="Filtrar por tipo">
        {TABS.map(([k, label]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{label} <span className="mono dim" style={{ fontSize: 12 }}>{h.data ? count(k) : ''}</span></button>)}
      </div>
      {h.error && <ErrorBox error={h.error} onRetry={h.reload} />}
      {!h.data && !h.error && <div className="card"><div className="skel" style={{ height: 300 }} /></div>}
      {h.data && !h.data.events.length && (
        <Empty icon="clock" title={q ? 'Nada encontrado' : 'Nenhum registro ainda'} text={q ? `Nenhum evento contém “${q}”.` : 'Quando alguém usar o Cortex, gerar relatórios ou mudar configurações, o registro aparece aqui.'} />
      )}
      {h.data?.events.length > 0 && (
        <section className="card" style={{ padding: 0, gap: 0, overflow: 'hidden', opacity: h.loading ? 0.6 : 1 }} aria-label="Eventos">
          {h.data.events.map((e) => {
            const [kindLabel, icon, bg, fg] = KIND[e.kind] || KIND.config;
            const day = dayGroup(e.created_at);
            const showDay = day !== lastDay; lastDay = day;
            const [stLabel, stClass] = STATUS[e.status] || STATUS.ok;
            const expandable = e.kind === 'ai' && e.meta?.answer;
            return (
              <div key={e.id}>
                {showDay && <div style={{ padding: '14px 22px 8px', fontSize: 12, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase', color: 'var(--dim)', background: 'var(--side)', borderBottom: '1px solid var(--line-soft)' }}>{day}</div>}
                <div style={{ borderBottom: '1px solid var(--line-soft)' }}>
                  <button disabled={!expandable} onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={expandable ? open === e.id : undefined}
                    style={{ width: '100%', display: 'flex', gap: 14, alignItems: 'center', padding: '16px 22px', border: 0, background: 'transparent', textAlign: 'left', cursor: expandable ? 'pointer' : 'default', opacity: 1 }}>
                    <span style={{ flex: 'none', width: 36, height: 36, borderRadius: 10, background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={icon} size={17} color={fg} /></span>
                    <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <span style={{ fontWeight: 500 }}>{e.title}</span>
                      <span className="dim" style={{ fontSize: 13 }}>{e.user_name || 'Sistema'} · {kindLabel}{e.meta?.mode === 'automatico' ? ' · resposta automática' : ''}</span>
                    </span>
                    <span className={`badge ${stClass}`} style={{ fontSize: 11 }}>{stLabel}</span>
                    <span className="mono dim" style={{ fontSize: 12, minWidth: 70, textAlign: 'right' }}>{relTime(e.created_at).replace(/^(Hoje|Ontem), /, '')}</span>
                  </button>
                  {open === e.id && <div style={{ padding: '0 22px 18px 72px', color: 'var(--text-2)', fontSize: 14 }}><Markdown text={e.meta.answer} /></div>}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}
