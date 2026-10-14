import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import { Icon, Modal, Spinner, Switch, ErrorBox, useAsync, useToast } from '../components/ui.jsx';
import { brl, num, brDate, relTime } from '../format.js';

const TEMPLATES = {
  vendas: ['data;pedido;cliente;produto;categoria;quantidade;valor_unitario;custo_unitario;vendedor;regiao', '02/09/2026;4521;Mercado Exemplo;Café torrado 500 g;Mercearia;24;18,90;12,40;Juliana;Serra Gaúcha', '02/09/2026;4521;Mercado Exemplo;Arroz 5 kg;Mercearia;10;27,50;19,10;Juliana;Serra Gaúcha'],
  despesas: ['data;categoria;descricao;valor', '05/09/2026;Pessoal;Salários e encargos;34000,00', '10/09/2026;Ocupação;Aluguel do galpão;12000,00'],
  contas: ['tipo;parceiro;vencimento;valor;pago_em', 'pagar;Fornecedor Exemplo;20/10/2026;5000,00;', 'receber;Cliente Exemplo;25/10/2026;3200,00;'],
  metas: ['mes;meta;vendedor;categoria', '10/2026;450000;;', '10/2026;120000;Juliana;', '10/2026;170000;;Mercearia']
};
const TYPE_LABEL = { vendas: 'Vendas', despesas: 'Despesas', contas: 'Contas a pagar e receber', metas: 'Metas' };

function download(type) {
  const blob = new Blob(['\ufeff' + TEMPLATES[type].join('\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `modelo_${type}.csv`; a.click();
}

function Steps({ step }) {
  const steps = ['Enviar arquivo', 'Mapear colunas', 'Validar', 'Importar'];
  return (
    <ol aria-label="Etapas da importação" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
      {steps.map((s, i) => {
        const done = i < step, cur = i === step;
        return (
          <li key={s} aria-current={cur ? 'step' : undefined} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, background: cur ? 'var(--violet-soft)' : 'var(--card)', border: `1px solid ${cur ? 'var(--violet-line)' : 'var(--line)'}` }}>
            <span style={{ width: 28, height: 28, borderRadius: '50%', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 600, background: done ? 'var(--green-bg)' : cur ? 'var(--violet)' : 'var(--card-3)', color: done ? 'var(--green)' : cur ? '#fff' : 'var(--muted)' }}>
              {done ? <Icon name="check" size={14} width={2.6} /> : i + 1}
            </span>
            <span style={{ fontSize: 14, fontWeight: cur ? 500 : 400, color: cur || done ? 'var(--text)' : 'var(--muted)' }}>{s}</span>
          </li>
        );
      })}
    </ol>
  );
}

function Wizard({ isDemo, onDone }) {
  const toast = useToast();
  const types = useAsync(() => api('/import/types'), []);
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [type, setType] = useState('vendas');
  const [mapping, setMapping] = useState({});
  const [check, setCheck] = useState(null);
  const [mode, setMode] = useState('append');
  const [result, setResult] = useState(null);
  const [drag, setDrag] = useState(false);
  const input = useRef(null);

  const reset = () => { setStep(0); setPreview(null); setCheck(null); setResult(null); setError(''); setMode('append'); };

  const upload = async (file) => {
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const res = await fetch('/api/import/preview', { method: 'POST', headers: { 'x-filename': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' }, body: file });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Não foi possível ler o arquivo.');
      setPreview(d); setType(d.type); setMapping(d.mapping); setStep(1);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const runCheck = async () => {
    setBusy(true); setError('');
    try { setCheck(await api('/import/validate', { method: 'POST', body: { token: preview.token, type, mapping } })); setStep(2); }
    catch (e) { setError(e.message); }
    setBusy(false);
  };

  const runImport = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('/import/commit', { method: 'POST', body: { token: preview.token, type, mapping, mode } });
      setResult(r); setStep(3); onDone?.();
      toast('Importação concluída', { text: `${num(r.inserted)} linha(s) importada(s).` });
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  const fields = types.data?.[type]?.fields || [];
  const sampleOf = (idx) => (idx === undefined || idx === '' ? '' : preview?.sample?.map((r) => r[idx]).filter((x) => x !== '').slice(0, 2).join(' · '));

  return (
    <section className="card" aria-label="Importar planilha" style={{ gap: 20 }}>
      <Steps step={step} />
      {error && <div className="alert err" role="alert"><Icon name="alert" color="var(--red)" /><span>{error}</span></div>}

      {step === 0 && (
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); upload(e.dataTransfer.files[0]); }}
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '48px 24px', borderRadius: 14, border: `1.5px dashed ${drag ? 'var(--violet)' : 'var(--line-2)'}`, background: drag ? 'var(--violet-soft)' : 'var(--side)', textAlign: 'center', cursor: 'pointer', transition: 'background .2s, border-color .2s' }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--violet-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{busy ? <Spinner size={24} /> : <Icon name="upload" size={24} color="var(--violet-text)" />}</span>
          <span style={{ fontSize: 16, fontWeight: 500 }}>{busy ? 'Lendo a planilha…' : 'Arraste uma planilha aqui'}</span>
          <span className="dim" style={{ fontSize: 13 }}>.xlsx ou .csv · vendas, despesas, contas ou metas · até 60 MB</span>
          <span className="btn primary" style={{ pointerEvents: 'none' }}>Selecionar arquivo</span>
          <input ref={input} type="file" accept=".xlsx,.csv" disabled={busy} onChange={(e) => { upload(e.target.files[0]); e.target.value = ''; }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Selecionar planilha" />
        </label>
      )}

      {step === 1 && preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card-head">
            <div><h2 className="card-title">Mapear colunas · {preview.filename}</h2><p className="card-sub">{num(preview.rowCount)} linhas · o Cortex sugeriu o mapeamento, confira antes de continuar.</p></div>
            <label className="field" style={{ minWidth: 240 }}>Tipo de planilha
              <select className="select" value={type} onChange={(e) => { setType(e.target.value); setMapping(preview.mappings[e.target.value] || {}); }}>
                {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}{k === preview.type ? ' (detectado)' : ''}</option>)}
              </select>
            </label>
          </div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 640 }}>
              <thead><tr><th>Campo do Cortex</th><th>Coluna da planilha</th><th>Exemplo</th></tr></thead>
              <tbody>
                {fields.map((f) => (
                  <tr key={f.key}>
                    <td>{f.label}{f.required && <span style={{ color: 'var(--red-text)' }}> *</span>}</td>
                    <td style={{ width: 260 }}>
                      <label className="sr" htmlFor={`map-${f.key}`}>Coluna para {f.label}</label>
                      <select id={`map-${f.key}`} className="select" style={{ minHeight: 38, borderColor: f.required && mapping[f.key] === undefined ? '#6b5418' : undefined }} value={mapping[f.key] ?? ''} onChange={(e) => setMapping((m) => { const n = { ...m }; if (e.target.value === '') delete n[f.key]; else n[f.key] = +e.target.value; return n; })}>
                        <option value="">— não usar —</option>
                        {preview.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                      </select>
                    </td>
                    <td className="muted" style={{ fontSize: 13 }}>{sampleOf(mapping[f.key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {type === 'vendas' && <p className="dim" style={{ fontSize: 12 }}>Informe o valor unitário ou o valor total. Sem custo unitário, o Cortex estima uma margem bruta de 30%.</p>}
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={reset}>Voltar</button>
            <button className="btn primary" onClick={runCheck} disabled={busy}>{busy ? <><Spinner color="#fff" />Validando…</> : 'Validar dados'}</button>
          </div>
        </div>
      )}

      {step === 2 && check && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {check.missing.length > 0 ? (
            <div className="alert err"><Icon name="alert" color="var(--red)" /><span>Faltam colunas obrigatórias: <strong>{check.missing.join(', ')}</strong>. Volte e ajuste o mapeamento.</span></div>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12 }}>
                <div className="kpi" style={{ padding: 16 }}><span className="kpi-label">Linhas válidas</span><span className="kpi-value pos" style={{ fontSize: 22 }}>{num(check.validCount)}</span></div>
                <div className="kpi" style={{ padding: 16 }}><span className="kpi-label">Com erro (serão ignoradas)</span><span className={`kpi-value ${check.errorCount ? 'neg' : ''}`} style={{ fontSize: 22 }}>{num(check.errorCount || 0)}</span></div>
                {check.summary.from && <div className="kpi" style={{ padding: 16 }}><span className="kpi-label">Período</span><span className="kpi-value" style={{ fontSize: 16 }}>{brDate(check.summary.from)} a {brDate(check.summary.to)}</span></div>}
                {check.summary.revenue !== undefined && <div className="kpi" style={{ padding: 16 }}><span className="kpi-label">Receita no arquivo</span><span className="kpi-value" style={{ fontSize: 22 }}>{brl(check.summary.revenue)}</span></div>}
                {check.summary.amount !== undefined && <div className="kpi" style={{ padding: 16 }}><span className="kpi-label">Valor total</span><span className="kpi-value" style={{ fontSize: 22 }}>{brl(check.summary.amount)}</span></div>}
              </div>
              {check.summary.missingCost > 0 && <div className="alert warn"><Icon name="info" color="var(--amber)" /><span>{num(check.summary.missingCost)} linha(s) sem custo unitário: o custo será estimado (margem bruta de 30%).</span></div>}
              {check.errors.length > 0 && (
                <details style={{ background: 'var(--side)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px 14px' }}>
                  <summary style={{ cursor: 'pointer', fontSize: 14 }}>Ver linhas com erro ({num(check.errorCount)})</summary>
                  <ul style={{ margin: '10px 0 0', paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: 'var(--red-text)' }}>
                    {check.errors.map((e) => <li key={e.row}>Linha {e.row}: {e.messages.join('; ')}</li>)}
                  </ul>
                </details>
              )}
              <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <legend style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 6 }}>Como importar</legend>
                <label className="check"><input type="radio" name="mode" checked={mode === 'append'} onChange={() => setMode('append')} />Adicionar aos dados existentes <span className="dim" style={{ fontSize: 12 }}>— pedidos com o mesmo número são ignorados</span></label>
                {type !== 'metas' && <label className="check"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')} />Substituir tudo de {TYPE_LABEL[type].toLowerCase()}</label>}
              </fieldset>
              {isDemo && <div className="alert warn"><Icon name="info" color="var(--amber)" /><span>Esta é a primeira importação: <strong>todos os dados de demonstração serão apagados</strong> (vendas, despesas, contas e metas fictícias). Usuários e configurações continuam.</span></div>}
            </>
          )}
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setStep(1)}>Voltar ao mapeamento</button>
            <button className="btn primary" onClick={runImport} disabled={busy || check.missing.length > 0 || !check.validCount}>{busy ? <><Spinner color="#fff" />Importando…</> : `Importar ${num(check.validCount)} linha(s)`}</button>
          </div>
        </div>
      )}

      {step === 3 && result && (
        <div className="rise" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, padding: '24px 0', textAlign: 'center' }}>
          <span style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="check" size={26} color="var(--green)" width={2.6} /></span>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Importação concluída</h2>
          <p className="muted" style={{ lineHeight: 1.6 }}>
            {num(result.inserted)} linha(s) de {TYPE_LABEL[result.type].toLowerCase()} importada(s){result.orders ? ` em ${num(result.orders)} pedido(s)` : ''}.
            {result.skipped ? ` ${num(result.skipped)} repetida(s) ignorada(s).` : ''}{result.errorCount ? ` ${num(result.errorCount)} com erro ignorada(s).` : ''}
            {result.replacedDemo ? ' Os dados de demonstração foram removidos.' : ''}
          </p>
          <div className="toolbar" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={reset}>Importar outra planilha</button>
            <Link className="btn primary" to="/">Ver dashboard</Link>
          </div>
        </div>
      )}
    </section>
  );
}

function WatchCard() {
  const toast = useToast();
  const w = useAsync(() => api('/import/watch'), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (w.data) setForm(w.data.settings); }, [w.data]);
  if (!form) return <section className="card"><div className="skel" style={{ height: 160 }} /></section>;
  const save = async (patch) => {
    const next = { ...form, ...patch };
    setBusy(true);
    try { await api('/import/settings', { method: 'PUT', body: { watch: next } }); setForm(next); toast('Pasta monitorada salva'); w.reload(); }
    catch (e) { toast('Não foi possível salvar', { kind: 'err', text: e.message }); }
    setBusy(false);
  };
  const scan = async () => {
    setBusy(true);
    try {
      const r = await api('/import/watch/scan', { method: 'POST' });
      const n = (r.results || []).filter((x) => x.inserted).length;
      toast(r.error ? 'Pasta não encontrada' : n ? `${n} arquivo(s) importado(s)` : 'Nenhum arquivo novo', { kind: r.error ? 'err' : n ? 'ok' : 'info' });
      w.reload();
    } catch (e) { toast('Erro', { kind: 'err', text: e.message }); }
    setBusy(false);
  };
  return (
    <section className="card" aria-labelledby="pasta" style={{ gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--violet-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="folder" size={20} color="var(--violet-text)" /></span>
        <div style={{ flex: 1 }}><h2 id="pasta" className="card-title">Importação automática</h2><p className="card-sub" style={{ marginTop: 2 }}>O Cortex observa uma pasta e importa sozinho os arquivos novos</p></div>
        <Switch label="Importação automática" checked={form.enabled} onChange={(v) => save({ enabled: v })} />
      </div>
      <label className="field">Pasta neste computador
        <span style={{ display: 'flex', gap: 8 }}>
          <input className="input mono" style={{ fontSize: 13 }} value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="C:\ERP\Exportacoes\Cortex" />
          <button className="btn" disabled={busy} onClick={() => save({})}>Salvar</button>
        </span>
      </label>
      <label className="field">Verificar a cada
        <select className="select" value={form.intervalMin} onChange={(e) => save({ intervalMin: +e.target.value })}>
          {[[15, '15 minutos'], [30, '30 minutos'], [60, '1 hora'], [180, '3 horas'], [720, '12 horas'], [1440, '1 dia']].map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </label>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 13 }}>
        {(w.data?.last || []).slice(0, 4).map((f, i) => (
          <span key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <span className="mono" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }} title={f.path}>{f.path.split(/[\\/]/).pop()}</span>
            <span style={{ color: f.status === 'ok' ? 'var(--green-text)' : 'var(--red-text)', whiteSpace: 'nowrap' }}>{f.status === 'ok' ? `${num(f.rows)} linhas · ${relTime(f.created_at)}` : f.message}</span>
          </span>
        ))}
        {!w.data?.last?.length && <span className="dim">Nenhum arquivo importado da pasta ainda.</span>}
      </div>
      <p className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>Arquivos .xlsx e .csv novos ou alterados são importados como “adicionar” (pedidos repetidos são ignorados). Se ainda houver dados de demonstração, o primeiro arquivo os substitui.</p>
      <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={scan} disabled={busy || !form.enabled || !form.path}>{busy ? <Spinner /> : <Icon name="refresh" size={14} />}Verificar agora</button>
    </section>
  );
}

function BackupCard() {
  const { me, logout } = useAuth();
  const toast = useToast();
  const b = useAsync(() => api('/backup'), []);
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [restore, setRestore] = useState(null);
  useEffect(() => { if (b.data) setForm(b.data.settings); }, [b.data]);
  if (!form) return <section className="card"><div className="skel" style={{ height: 160 }} /></section>;
  const save = async (patch) => {
    const next = { ...form, ...patch };
    try { await api('/import/settings', { method: 'PUT', body: { backup: next } }); setForm(next); toast('Backup configurado'); b.reload(); }
    catch (e) { toast('Não foi possível salvar', { kind: 'err', text: e.message }); }
  };
  const run = async () => {
    setBusy(true);
    try { const r = await api('/backup/run', { method: 'POST' }); toast('Backup concluído', { text: r.file }); b.reload(); }
    catch (e) { toast('Backup falhou', { kind: 'err', text: e.message }); }
    setBusy(false);
  };
  const doRestore = async () => {
    setBusy(true);
    try {
      await api('/backup/restore', { method: 'POST', body: { file: restore } });
      toast('Backup restaurado', { text: 'Entre novamente para continuar.' });
      setTimeout(logout, 1200);
    } catch (e) { toast('Não foi possível restaurar', { kind: 'err', text: e.message }); setBusy(false); }
  };
  const last = b.data?.backups?.[0];
  return (
    <section className="card" aria-labelledby="bkp" style={{ gap: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}><Icon name="database" size={20} color="var(--green-text)" /></span>
        <div style={{ flex: 1 }}><h2 id="bkp" className="card-title">Backup do banco de dados</h2><p className="card-sub" style={{ marginTop: 2, color: last ? 'var(--green-text)' : 'var(--amber-text)' }}>{last ? `Último: ${new Date(last.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })} · ${(last.size / 1048576).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB` : 'Nenhum backup ainda'}</p></div>
        <Switch label="Backup automático" checked={form.enabled} onChange={(v) => save({ enabled: v })} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
        <label className="field">Todo dia às
          <select className="select" value={form.hour} onChange={(e) => save({ hour: +e.target.value })}>{Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>)}</select>
        </label>
        <label className="field">Guardar
          <select className="select" value={form.keep} onChange={(e) => save({ keep: +e.target.value })}>{[7, 14, 30, 90].map((k) => <option key={k} value={k}>últimos {k}</option>)}</select>
        </label>
      </div>
      <label className="field">Pasta de destino (ex.: um pendrive ou HD externo)
        <span style={{ display: 'flex', gap: 8 }}>
          <input className="input mono" style={{ fontSize: 13 }} value={form.dir} onChange={(e) => setForm({ ...form, dir: e.target.value })} placeholder={b.data?.defaultDir} />
          <button className="btn" onClick={() => save({})}>Salvar</button>
        </span>
      </label>
      <div className="toolbar">
        <button className="btn primary" onClick={run} disabled={busy}>{busy ? <><Spinner color="#fff" />Copiando…</> : 'Fazer backup agora'}</button>
        {me.permissions.administracao && b.data?.backups?.length > 0 && (
          <select className="select" style={{ width: 'auto', minHeight: 42 }} value="" onChange={(e) => e.target.value && setRestore(e.target.value)} aria-label="Restaurar um backup">
            <option value="">Restaurar um backup…</option>
            {b.data.backups.map((x) => <option key={x.file} value={x.file}>{new Date(x.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}{x.file.includes('antes-de-restaurar') ? ' (segurança)' : ''}</option>)}
          </select>
        )}
      </div>
      {restore && (
        <Modal title="Restaurar backup?" onClose={() => !busy && setRestore(null)}>
          <p className="muted" style={{ lineHeight: 1.6 }}>Todos os dados do Cortex (todas as organizações) voltam para o estado de <strong style={{ color: 'var(--text)' }}>{restore}</strong>. Antes, o Cortex salva um backup de segurança do estado atual. Depois será preciso entrar de novo.</p>
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setRestore(null)} disabled={busy}>Cancelar</button>
            <button className="btn primary" onClick={doRestore} disabled={busy}>{busy ? <><Spinner color="#fff" />Restaurando…</> : 'Restaurar'}</button>
          </div>
        </Modal>
      )}
    </section>
  );
}

export default function Import() {
  const { me, refresh } = useAuth();
  const toast = useToast();
  const st = useAsync(() => api('/data/status'), []);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const resetDemo = async () => {
    setBusy(true);
    try { await api('/data/reset-demo', { method: 'POST' }); toast('Dados de demonstração gerados'); setConfirm(false); st.reload(); refresh(); }
    catch (e) { toast('Não foi possível gerar os dados', { kind: 'err', text: e.message }); }
    setBusy(false);
  };

  return (
    <>
      <PageHead eyebrow="Planilhas Excel e CSV, pasta automática e backup" title="Importação e backup" />
      {me.org.isDemo && <div className="alert warn"><Icon name="info" color="var(--amber)" /><span>Você está usando <strong>dados de demonstração</strong>. Na primeira importação eles são apagados e substituídos pelos seus.</span></div>}

      <div className="row" style={{ alignItems: 'flex-start' }}>
        <div style={{ flex: '2 1 560px', minWidth: 0 }}>
          <Wizard isDemo={me.org.isDemo} onDone={() => { st.reload(); refresh(); }} />
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card tight" aria-labelledby="mod">
            <h2 id="mod" className="card-title">Modelos de planilha</h2>
            <p className="dim" style={{ fontSize: 13, lineHeight: 1.5 }}>Use os nomes de coluna dos modelos para o mapeamento ser automático. Os nomes do seu ERP também funcionam — você ajusta na etapa 2.</p>
            <div className="toolbar" style={{ gap: 8 }}>{Object.keys(TEMPLATES).map((t) => <button key={t} className="btn sm" onClick={() => download(t)}><Icon name="download" size={14} color="var(--muted)" />{TYPE_LABEL[t].split(' ')[0]}</button>)}</div>
          </section>
          <section className="card tight" aria-labelledby="base">
            <h2 id="base" className="card-title">Base atual</h2>
            {st.error ? <ErrorBox error={st.error} /> : !st.data ? <div className="skel" style={{ height: 100 }} /> : (
              <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: '1fr auto', gap: '10px 14px', fontSize: 14 }}>
                <dt className="muted">Pedidos</dt><dd className="mono" style={{ margin: 0 }}>{num(st.data.orders)}</dd>
                <dt className="muted">Clientes</dt><dd className="mono" style={{ margin: 0 }}>{num(st.data.customers)}</dd>
                <dt className="muted">Produtos</dt><dd className="mono" style={{ margin: 0 }}>{num(st.data.products)}</dd>
                <dt className="muted">Despesas</dt><dd className="mono" style={{ margin: 0 }}>{num(st.data.expenses)}</dd>
                <dt className="muted">Origem</dt><dd style={{ margin: 0, color: st.data.isDemo ? 'var(--amber-text)' : 'var(--green-text)' }}>{st.data.isDemo ? 'Demonstração' : 'Importada'}</dd>
              </dl>
            )}
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}><Icon name="refresh" size={14} color="var(--muted)" />Voltar aos dados de demonstração</button>
          </section>
        </div>
      </div>

      <div className="grid-2">
        <WatchCard />
        <BackupCard />
      </div>

      {confirm && (
        <Modal title="Voltar aos dados de demonstração?" onClose={() => !busy && setConfirm(false)}>
          <p className="muted" style={{ lineHeight: 1.6 }}>Vendas, clientes, produtos, despesas, contas, metas e relatórios desta organização serão <strong style={{ color: 'var(--text)' }}>apagados</strong> e trocados por dados fictícios. Faça um backup antes se tiver dados importados.</p>
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={() => setConfirm(false)} disabled={busy}>Cancelar</button>
            <button className="btn primary" onClick={resetDemo} disabled={busy}>{busy ? <><Spinner color="#fff" />Gerando…</> : 'Apagar e gerar'}</button>
          </div>
        </Modal>
      )}
    </>
  );
}
