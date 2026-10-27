import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import { Icon, Spinner, ErrorBox, Switch, Check, SelectBar, useSelection, useAsync, useToast } from '../components/ui.jsx';
import { relTime, brl, brDate } from '../format.js';

const SEV = { alta: ['Alta', 'err', '#F87171'], media: ['Média', 'warn', '#FBBF24'], info: ['Info', 'violet', '#B9A3FF'] };
const ICON = { cliente: 'eye', meta: 'target', caixa: 'wallet', conta: 'calendar', produto: 'trend' };
const TABS = [['all', 'Todos'], ['unread', 'Não lidos'], ['clientes', 'Clientes'], ['vendas', 'Vendas'], ['financeiro', 'Financeiro']];
const ping = () => window.dispatchEvent(new Event('cortex:alerts'));

function AlertCard({ a, onRead }) {
  const [label, cls, color] = SEV[a.severity] || SEV.info;
  return (
    <article className={`alert-card rise${a.readAt ? ' read' : ''}`}>
      <span style={{ width: 36, height: 36, flex: 'none', borderRadius: 10, background: 'var(--card-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name={ICON[a.rule] || 'bell'} size={18} color={color} /></span>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          <span className="alert-title" style={{ fontWeight: 600, fontSize: 15 }}>{a.title}</span>
          <span className={`badge ${cls}`} style={{ fontSize: 11 }}>{label}</span>
          <span className="dim" style={{ fontSize: 12, marginLeft: 'auto' }}>{relTime(a.createdAt)}</span>
        </div>
        <p className="muted" style={{ fontSize: 14, lineHeight: 1.55 }}>{a.text}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {a.link && <Link to={a.link} className="btn sm" onClick={() => !a.readAt && onRead(a, true)}>{a.cta || 'Abrir'}<Icon name="arrow" size={14} /></Link>}
          <button className="btn sm ghost" onClick={() => onRead(a, !a.readAt)}>{a.readAt ? 'Marcar como não lido' : 'Marcar como lido'}</button>
        </div>
      </div>
    </article>
  );
}

function EmailCard({ canEdit }) {
  const toast = useToast();
  const { me } = useAuth();
  const q = useAsync(() => api('/email'), []);
  const [f, setF] = useState(null);
  const [pw, setPw] = useState('');
  const [add, setAdd] = useState('');
  const [busy, setBusy] = useState('');
  useEffect(() => { if (q.data) setF({ enabled: q.data.enabled, time: q.data.time, days: q.data.days, to: q.data.to, user: q.data.user }); }, [q.data]);
  if (q.error) return <ErrorBox error={q.error} onRetry={q.reload} />;
  if (!f) return <div className="card"><div className="skel" style={{ height: 260 }} /></div>;
  const dirty = JSON.stringify(f) !== JSON.stringify({ enabled: q.data.enabled, time: q.data.time, days: q.data.days, to: q.data.to, user: q.data.user }) || !!pw;
  const addTo = () => {
    const v = add.trim().toLowerCase().replace(/[,;]$/, '');
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return toast('E-mail inválido', { kind: 'err', text: v });
    if (!f.to.includes(v)) setF({ ...f, to: [...f.to, v] });
    setAdd('');
  };
  const save = async () => {
    setBusy('save');
    try {
      await api('/email', { method: 'PUT', body: { ...f, appPassword: pw } });
      setPw(''); toast('Resumo diário salvo', { text: f.enabled ? `Envio às ${f.time}, ${f.days === 'uteis' ? 'de segunda a sexta' : 'todos os dias'}.` : 'Envio desligado.' });
      q.reload();
    } catch (e) { toast('Não foi possível salvar', { kind: 'err', text: e.message }); }
    setBusy('');
  };
  const test = async () => {
    setBusy('test');
    try {
      if (dirty) await api('/email', { method: 'PUT', body: { ...f, appPassword: pw } });
      const r = await api('/email/test', { method: 'POST', body: {} });
      setPw(''); q.reload();
      toast('E-mail de teste enviado', { text: `Para ${r.to.join(', ')}. Confira também a caixa de spam.` });
    } catch (e) { toast('Falha no envio', { kind: 'err', text: e.message }); }
    setBusy('');
  };
  const ro = !canEdit;
  return (
    <>
      <section className="card" aria-labelledby="mail" style={{ gap: 16 }}>
        <div className="card-head" style={{ alignItems: 'center' }}>
          <div><h2 id="mail" className="card-title">Resumo diário por e-mail</h2><p className="card-sub">Enviado pelo Gmail da empresa{q.data.lastSent ? ` · último envio ${brDate(q.data.lastSent)}` : ''}</p></div>
          <Switch checked={f.enabled} onChange={(v) => !ro && setF({ ...f, enabled: v })} label="Enviar resumo diário" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <label className="field">Horário<input className="input" type="time" value={f.time} disabled={ro} onChange={(e) => setF({ ...f, time: e.target.value })} /></label>
          <label className="field">Dias<select className="select" value={f.days} disabled={ro} onChange={(e) => setF({ ...f, days: e.target.value })}><option value="uteis">Segunda a sexta</option><option value="todos">Todos os dias</option></select></label>
        </div>
        <div className="field">
          <span>Destinatários</span>
          <div className="chips">
            {f.to.map((t) => <span key={t} className="chip">{t}{!ro && <button type="button" aria-label={`Remover ${t}`} onClick={() => setF({ ...f, to: f.to.filter((x) => x !== t) })}><Icon name="x" size={12} /></button>}</span>)}
            {!ro && <input type="email" aria-label="Adicionar destinatário" placeholder={f.to.length ? 'adicionar e-mail' : me.user.email} value={add} onChange={(e) => setAdd(e.target.value)} onBlur={addTo} onKeyDown={(e) => { if (['Enter', ',', ';'].includes(e.key)) { e.preventDefault(); addTo(); } }} />}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, padding: 16, borderRadius: 12, background: 'var(--side)', border: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>Conexão com o Gmail (SMTP)</span>
          <label className="field">Conta Gmail<input className="input" type="email" value={f.user} disabled={ro} placeholder="cortex.suaempresa@gmail.com" onChange={(e) => setF({ ...f, user: e.target.value })} /></label>
          <label className="field">Senha de app (16 letras)<input className="input mono" type="password" autoComplete="new-password" value={pw} disabled={ro} placeholder={q.data.hasPassword ? '•••• salva — digite para trocar' : 'abcd efgh ijkl mnop'} onChange={(e) => setPw(e.target.value)} /></label>
          <p className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>Crie em Conta Google › Segurança › Verificação em duas etapas › Senhas de app. A senha fica guardada só neste computador e nunca aparece de volta na tela.</p>
          {canEdit && (
            <div className="toolbar">
              <button className="btn" onClick={test} disabled={!!busy || !f.user || (!pw && !q.data.hasPassword)}>{busy === 'test' ? <><Spinner />Enviando…</> : 'Enviar e-mail de teste'}</button>
              <button className="btn primary" onClick={save} disabled={!!busy || !dirty}>{busy === 'save' ? <Spinner color="#fff" /> : dirty ? 'Salvar' : 'Salvo'}</button>
            </div>
          )}
          {ro && <p className="dim" style={{ fontSize: 12 }}>Só administradores alteram o envio.</p>}
        </div>
      </section>
      <section className="card" aria-label="Prévia do e-mail" style={{ gap: 10, padding: 0, overflow: 'hidden' }}>
        <div style={{ padding: '14px 18px 0', fontSize: 12, color: 'var(--dim)' }}>Prévia · Assunto: {q.data.preview.subject}</div>
        <iframe title="Prévia do resumo diário" srcDoc={q.data.preview.html} sandbox="" style={{ width: '100%', height: 470, border: 0, background: '#111113' }} />
      </section>
    </>
  );
}

function RulesCard({ data, onSaved }) {
  const toast = useToast();
  const [cfg, setCfg] = useState(data.config);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(cfg) !== JSON.stringify(data.config);
  const desc = { meta: `Previsão de fechamento abaixo de ${cfg.metaPct}%`, caixa: data.cashMinimum ? `Mínimo de segurança: ${brl(data.cashMinimum)}` : 'Informe o saldo e o mínimo em Fluxo de caixa', produto: `Últimas 2 semanas ${cfg.productDrop}% abaixo da média das 8 anteriores` };
  const save = async () => {
    setSaving(true);
    try { await api('/alerts/config', { method: 'PUT', body: cfg }); toast('Regras salvas', { text: 'Os alertas foram recalculados.' }); onSaved(); }
    catch (e) { toast('Não foi possível salvar', { kind: 'err', text: e.message }); }
    setSaving(false);
  };
  return (
    <section className="card" aria-labelledby="rules" style={{ gap: 4 }}>
      <h2 id="rules" className="card-title" style={{ marginBottom: 8 }}>O que gera alerta</h2>
      {data.rules.map((r) => (
        <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
          <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>{r.title}</span>
            <span className="dim" style={{ fontSize: 12, lineHeight: 1.45 }}>{desc[r.key] || r.text}</span>
            {data.canEdit && r.key === 'meta' && cfg.rules.meta && <label className="dim" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>Avisar abaixo de<input className="input mono" type="number" min="50" max="100" value={cfg.metaPct} onChange={(e) => setCfg({ ...cfg, metaPct: +e.target.value })} style={{ width: 70, minHeight: 30, fontSize: 12 }} />%</label>}
            {data.canEdit && r.key === 'produto' && cfg.rules.produto && <label className="dim" style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>Queda mínima<input className="input mono" type="number" min="10" max="90" value={cfg.productDrop} onChange={(e) => setCfg({ ...cfg, productDrop: +e.target.value })} style={{ width: 70, minHeight: 30, fontSize: 12 }} />%</label>}
          </span>
          <Switch checked={cfg.rules[r.key]} onChange={(v) => data.canEdit && setCfg({ ...cfg, rules: { ...cfg.rules, [r.key]: v } })} label={r.title} />
        </div>
      ))}
      {data.canEdit && dirty && <button className="btn primary" onClick={save} disabled={saving} style={{ marginTop: 10, alignSelf: 'flex-end' }}>{saving ? <Spinner color="#fff" /> : 'Salvar regras'}</button>}
    </section>
  );
}

export default function Alerts() {
  const toast = useToast();
  const [refresh, setRefresh] = useState(0);
  const q = useAsync(() => api(`/alerts${refresh ? '?refresh=1' : ''}`), [refresh]);
  const [tab, setTab] = useState('all');
  const [list, setList] = useState([]);
  useEffect(() => { if (q.data) { setList(q.data.alerts); ping(); } }, [q.data]);

  const match = (a, t) => t === 'all' || (t === 'unread' ? !a.readAt : a.category === t);
  const shown = list.filter((a) => match(a, tab));
  const read = async (a, isRead) => {
    setList((l) => l.map((x) => (x.id === a.id ? { ...x, readAt: isRead ? new Date().toISOString() : null } : x)));
    try { await api(`/alerts/${a.id}/read`, { method: 'POST', body: { unread: !isRead } }); ping(); } catch (e) { toast('Erro', { kind: 'err', text: e.message }); }
  };
  const selection = useSelection();
  const remove = async (body, n) => {
    if (!window.confirm(`Apagar ${n} alerta(s)? Eles só voltam se a situação se resolver e acontecer de novo.`)) return;
    try {
      const r = await api('/alerts/delete', { method: 'POST', body });
      setList((l) => l.filter((a) => (body.ids ? !body.ids.includes(a.id) : !a.readAt)));
      selection.clear(); ping();
      toast(`${r.deleted} alerta(s) apagado(s)`);
    } catch (e) { toast('Erro', { kind: 'err', text: e.message }); }
  };
  const readAll = async () => {
    setList((l) => l.map((x) => ({ ...x, readAt: x.readAt || new Date().toISOString() })));
    try { await api('/alerts/read-all', { method: 'POST' }); ping(); } catch (e) { toast('Erro', { kind: 'err', text: e.message }); }
  };

  return (
    <>
      <PageHead eyebrow="O Cortex vigia os dados e avisa quando algo foge do normal" title="Alertas e resumo diário">
        <button className="btn" onClick={() => setRefresh((n) => n + 1)} disabled={q.loading}>{q.loading ? <Spinner /> : <Icon name="refresh" size={16} color="var(--muted)" />}Verificar agora</button>
        <button className="btn" onClick={readAll} disabled={!list.some((a) => !a.readAt)}>Marcar todos como lidos</button>
      </PageHead>
      {q.error && <ErrorBox error={q.error} onRetry={q.reload} />}
      <div className="row" style={{ alignItems: 'flex-start' }}>
        <section aria-label="Alertas" style={{ flex: '2 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="tabs" role="tablist" aria-label="Filtrar alertas">
            {TABS.map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>{l} <span className="dim" style={{ fontSize: 12, marginLeft: 4 }}>{list.filter((a) => match(a, k)).length}</span></button>)}
          </div>
          {!q.data && !q.error && [0, 1, 2].map((i) => <div key={i} className="skel" style={{ height: 120, borderRadius: 12 }} />)}
          <SelectBar selection={selection} ids={shown.map((a) => a.id)}>
            <button className="btn sm" onClick={() => remove({ scope: 'read' }, list.filter((a) => a.readAt).length)} disabled={!list.some((a) => a.readAt)}><Icon name="trash" size={14} />Apagar todos os lidos</button>
            <button className="btn sm danger" onClick={() => remove({ ids: [...selection.sel] }, selection.size)}><Icon name="trash" size={14} />Apagar selecionados</button>
          </SelectBar>
          {shown.map((a) => (
            <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <span style={{ paddingTop: 14 }}><Check checked={selection.has(a.id)} onChange={(v) => selection.toggle(a.id, v)} label={`Selecionar ${a.title}`} /></span>
              <div style={{ flex: 1, minWidth: 0 }}><AlertCard a={a} onRead={read} /></div>
            </div>
          ))}
          {q.data && !shown.length && (
            <div className="empty rise" style={{ padding: 32 }}>
              <span className="empty-icon"><Icon name="check" size={24} /></span>
              <h2 style={{ fontSize: 16, fontWeight: 600 }}>Tudo em dia</h2>
              <p>Nenhum alerta {tab === 'unread' ? 'não lido' : 'nesta categoria'}.</p>
            </div>
          )}
          <p className="dim" style={{ fontSize: 12 }}>Os alertas são recalculados a cada 15 minutos e somem sozinhos quando a situação se resolve.</p>
        </section>
        <div style={{ flex: '1 1 360px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <EmailCard canEdit={!!q.data?.canEdit} />
          {q.data && <RulesCard key={JSON.stringify(q.data.config)} data={q.data} onSaved={() => setRefresh((n) => n + 1)} />}
        </div>
      </div>
    </>
  );
}
