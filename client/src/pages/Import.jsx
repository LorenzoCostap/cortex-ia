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

const ORDER = ['vendas', 'despesas', 'contas', 'metas'];
const isSheet = (f) => /\.(xlsx|csv)$/i.test(f.name) && !f.name.startsWith('~$');

// Arquivos soltos ou pastas arrastadas (lê as subpastas)
async function filesFromDrop(dt) {
  const entries = [...(dt.items || [])].map((i) => i.webkitGetAsEntry?.()).filter(Boolean);
  if (!entries.some((e) => e.isDirectory)) return [...dt.files];
  const out = [];
  const walk = async (entry) => {
    if (entry.isFile) out.push(await new Promise((res, rej) => entry.file(res, rej)));
    else if (entry.isDirectory) {
      const reader = entry.createReader();
      let chunk;
      do { chunk = await new Promise((res, rej) => reader.readEntries(res, rej)); for (const e of chunk) await walk(e); } while (chunk.length);
    }
  };
  for (const e of entries) await walk(e);
  return out;
}

async function previewFile(file) {
  let res;
  try {
    res = await fetch('/api/import/preview', { method: 'POST', headers: { 'x-filename': encodeURIComponent(file.name), 'content-type': 'application/octet-stream' }, body: file, signal: AbortSignal.timeout(180e3) });
  } catch (e) {
    throw new Error(e.name === 'TimeoutError' ? `${file.name}: a leitura passou de 3 minutos. Tente salvar a planilha como .csv.` : `${file.name}: sem conexão com o Cortex. Confira se ele está aberto.`);
  }
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Não foi possível ler o arquivo.');
  return d;
}

function MapTable({ fields, headers, sample, mapping, onChange }) {
  const ex = (idx) => (idx === undefined ? '' : sample?.map((r) => r[idx]).filter((x) => x !== '').slice(0, 2).join(' · '));
  return (
    <div className="table-wrap">
      <table className="table" style={{ minWidth: 520 }}>
        <thead><tr><th>Campo do Cortex</th><th>Coluna da planilha</th><th>Exemplo</th></tr></thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.key}>
              <td>{f.label}{f.required && <span style={{ color: 'var(--red-text)' }}> *</span>}</td>
              <td style={{ width: 220 }}>
                <select className="select" style={{ minHeight: 36 }} aria-label={`Coluna para ${f.label}`} value={mapping[f.key] ?? ''}
                  onChange={(e) => { const n = { ...mapping }; if (e.target.value === '') delete n[f.key]; else n[f.key] = +e.target.value; onChange(n); }}>
                  <option value="">— não usar —</option>
                  {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                </select>
              </td>
              <td className="muted" style={{ fontSize: 13 }}>{ex(mapping[f.key])}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
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
  const [batch, setBatch] = useState(null);

  const reset = () => { setStep(0); setPreview(null); setBatch(null); setCheck(null); setResult(null); setError(''); setMode('append'); };

  const upload = async (file) => {
    if (!file) return;
    setError(''); setBusy(true);
    try {
      const d = await previewFile(file);
      setPreview(d); setType(d.type); setMapping(d.mapping); setStep(1);
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  // Colunas obrigatórias que ainda não foram indicadas
  const missingFor = (t, m) => {
    const miss = (types.data?.[t]?.fields || []).filter((f) => f.required && m[f.key] === undefined).map((f) => f.label);
    if (t === 'vendas' && m.valor_unitario === undefined && m.valor_total === undefined) miss.push('Valor (unitário ou total)');
    return miss;
  };
  const readyToImport = (d) => d.sheets?.length > 1 || !missingFor(d.type, d.mapping).length;
  const [edit, setEdit] = useState(null);
  const updateBatch = (i, patch) => setBatch((list) => list.map((b, j) => { if (j !== i) return b; const n = { ...b, ...patch }; return { ...n, ready: readyToImport(n) }; }));

  // Vários arquivos ou uma pasta: lê todos e mostra o que foi reconhecido
  const uploadMany = async (list) => {
    const files = [...(list || [])].filter(isSheet);
    if (!files.length) { setError('Nenhuma planilha .xlsx ou .csv encontrada.'); return; }
    if (files.length === 1) return upload(files[0]);
    setError(''); setBusy(true);
    const out = [];
    for (const file of files) {
      try { const d = await previewFile(file); out.push({ name: file.name, ...d, ready: readyToImport(d) }); }
      catch (e) { out.push({ name: file.name, error: e.message }); }
    }
    setBatch(out); setStep(1); setBusy(false);
  };

  const runBatch = async () => {
    setBusy(true); setError('');
    const rank = (b) => (b.sheets?.length > 1 ? -1 : ORDER.indexOf(b.type));
    const results = [];
    for (const b of batch.filter((x) => x.ready).sort((a, c) => rank(a) - rank(c))) {
      try {
        if (b.sheets?.length > 1) {
          const r = await api('/import/commit-all', { method: 'POST', body: { token: b.token } });
          r.results.forEach((x) => results.push({ ...x, source: `${b.name} · aba ${x.sheet}` }));
        } else {
          const r = await api('/import/commit', { method: 'POST', body: { token: b.token, type: b.type, mapping: b.mapping, mode: 'append' } });
          results.push({ ...r, source: b.name });
        }
      } catch (e) { results.push({ type: b.type, source: b.name, error: e.message }); }
    }
    setResult({ all: true, results, replacedDemo: results.some((r) => r.replacedDemo) }); setStep(3); onDone?.();
    toast('Importação concluída', { text: `${num(results.reduce((n, x) => n + (x.inserted || 0), 0))} linha(s) importada(s).` });
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

  const runImportAll = async () => {
    setBusy(true); setError('');
    try {
      const r = await api('/import/commit-all', { method: 'POST', body: { token: preview.token } });
      setResult({ ...r, all: true }); setStep(3); onDone?.();
      toast('Importação concluída', { text: `${num(r.results.reduce((n, x) => n + (x.inserted || 0), 0))} linha(s) importada(s) de ${r.results.length} aba(s).` });
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
        <label onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); const dt = e.dataTransfer; filesFromDrop(dt).then(uploadMany).catch(() => uploadMany(dt.files)); }}
          style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '48px 24px', borderRadius: 14, border: `1.5px dashed ${drag ? 'var(--violet)' : 'var(--line-2)'}`, background: drag ? 'var(--violet-soft)' : 'var(--side)', textAlign: 'center', cursor: 'pointer', transition: 'background .2s, border-color .2s' }}>
          <span style={{ width: 52, height: 52, borderRadius: 14, background: 'var(--violet-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{busy ? <Spinner size={24} /> : <Icon name="upload" size={24} color="var(--violet-text)" />}</span>
          <span style={{ fontSize: 16, fontWeight: 500 }}>{busy ? 'Lendo as planilhas…' : 'Arraste as planilhas ou uma pasta aqui'}</span>
          <span className="dim" style={{ fontSize: 13 }}>.xlsx ou .csv · um arquivo com todas as abas, vários arquivos ou uma pasta inteira</span>
          <span className="btn primary" style={{ pointerEvents: 'none' }}>Selecionar arquivos</span>
          <input ref={input} type="file" accept=".xlsx,.csv" multiple disabled={busy} onChange={(e) => { uploadMany(e.target.files); e.target.value = ''; }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Selecionar planilha" />
        </label>
      )}
      {step === 0 && (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: -8 }}>
          <label className="btn" style={{ position: 'relative', cursor: 'pointer' }}>
            <Icon name="folder" />Selecionar uma pasta
            <input type="file" multiple disabled={busy} {...{ webkitdirectory: '', directory: '' }} onChange={(e) => { uploadMany(e.target.files); e.target.value = ''; }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Selecionar pasta com planilhas" />
          </label>
        </div>
      )}

      {step === 1 && batch && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div><h2 className="card-title">{batch.length} arquivos selecionados</h2><p className="card-sub">O Cortex reconheceu o conteúdo de cada um. Confira e importe tudo de uma vez.</p></div>
          <div className="table-wrap">
            <table className="table" style={{ minWidth: 560 }}>
              <thead><tr><th>Arquivo</th><th>Conteúdo</th><th className="num">Linhas</th><th>Situação</th><th></th></tr></thead>
              <tbody>
                {batch.map((b, i) => (
                  <tr key={b.name}>
                    <td>{b.name}</td>
                    <td className="muted">{b.error ? '—' : b.sheets?.length > 1 ? b.sheets.map((x) => x.label).join(', ') : (
                      <select className="select" style={{ minHeight: 34, minWidth: 170 }} aria-label={`Tipo de ${b.name}`} value={b.type}
                        onChange={(e) => updateBatch(i, { type: e.target.value, mapping: b.mappings[e.target.value] || {} })}>
                        {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                      </select>
                    )}</td>
                    <td className="num">{b.error ? '—' : num(b.sheets?.length > 1 ? b.sheets.reduce((n, x) => n + x.rowCount, 0) : b.rowCount)}</td>
                    <td style={{ color: b.ready ? 'var(--green)' : 'var(--red-text)', fontSize: 13 }}>{b.error || (b.ready ? 'Pronto' : `Falta indicar: ${missingFor(b.type, b.mapping).join(', ')}`)}</td>
                    <td>{!b.error && !(b.sheets?.length > 1) && <button className={`btn sm ${b.ready ? '' : 'primary'}`} onClick={() => setEdit(i)}>Ajustar colunas</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {batch.some((b) => b.info?.length) && <div className="alert info"><Icon name="info" color="var(--violet-text)" /><span>{batch.filter((b) => b.info?.length).map((b) => `${b.name}: ${b.info.join(' ')}`).join(' · ')}</span></div>}
          {isDemo && <div className="alert warn"><Icon name="info" color="var(--amber)" /><span>Esta é a primeira importação: <strong>todos os dados de demonstração serão apagados</strong>. Usuários e configurações continuam.</span></div>}
          {edit !== null && batch[edit] && (
            <Modal title={`Ajustar colunas · ${batch[edit].name}`} onClose={() => setEdit(null)}>
              <label className="field">Tipo de planilha
                <select className="select" value={batch[edit].type} onChange={(e) => updateBatch(edit, { type: e.target.value, mapping: batch[edit].mappings[e.target.value] || {} })}>
                  {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </label>
              <MapTable fields={types.data?.[batch[edit].type]?.fields || []} headers={batch[edit].headers} sample={batch[edit].sample} mapping={batch[edit].mapping} onChange={(m) => updateBatch(edit, { mapping: m })} />
              <p className="dim" style={{ fontSize: 12, margin: 0 }}>* obrigatório. O que não existir na planilha é completado e avisado na importação (ex.: sem cliente → “Cliente não informado”).</p>
              <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
                <span style={{ color: batch[edit].ready ? 'var(--green)' : 'var(--red-text)', fontSize: 13, marginRight: 'auto' }}>{batch[edit].ready ? 'Pronto para importar' : `Falta indicar: ${missingFor(batch[edit].type, batch[edit].mapping).join(', ')}`}</span>
                <button className="btn primary" onClick={() => setEdit(null)}>Concluir</button>
              </div>
            </Modal>
          )}
          <div className="toolbar" style={{ justifyContent: 'flex-end' }}>
            <button className="btn" onClick={reset}>Voltar</button>
            <button className="btn primary" onClick={runBatch} disabled={busy || !batch.some((b) => b.ready)}>{busy ? <><Spinner color="#fff" />Importando…</> : `Importar ${batch.filter((b) => b.ready).length} arquivo(s)`}</button>
          </div>
        </div>
      )}

      {step === 1 && preview && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {preview.sheets?.length > 1 && (
            <div className="alert info" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <Icon name="info" color="var(--violet-text)" />
              <span style={{ flex: 1, minWidth: 240, lineHeight: 1.6 }}>
                Este arquivo tem <strong>{preview.sheets.length} abas</strong> com dados: {preview.sheets.map((sh) => `${sh.label} (${num(sh.rowCount)})`).join(' · ')}.
                {' '}Importe tudo de uma vez ou continue abaixo para importar só a primeira aba.
                {isDemo && <><br /><strong>Os dados de demonstração serão apagados.</strong></>}
              </span>
              <button className="btn primary" onClick={runImportAll} disabled={busy}>{busy ? <><Spinner color="#fff" />Importando…</> : 'Importar todas as abas'}</button>
            </div>
          )}
          {preview.info?.map((n) => <div key={n} className="alert info"><Icon name="info" color="var(--violet-text)" /><span>{n}</span></div>)}
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
              {check.summary.notes?.map((n) => <div key={n} className="alert warn"><Icon name="info" color="var(--amber)" /><span>{n}</span></div>)}
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
          {result.all ? (
            <ul className="muted" style={{ margin: 0, padding: 0, listStyle: 'none', lineHeight: 1.8 }}>
              {result.results.map((r, i) => <li key={i}><strong style={{ color: 'var(--text)' }}>{TYPE_LABEL[r.type] || 'Arquivo'}</strong> ({r.source || `aba ${r.sheet}`}): {r.error ? r.error : `${num(r.inserted)} linha(s)${r.orders ? ` em ${num(r.orders)} pedido(s)` : ''}${r.skipped ? `, ${num(r.skipped)} repetida(s) ignorada(s)` : ''}${r.errorCount ? `, ${num(r.errorCount)} com erro` : ''}`}{r.notes?.length ? <span className="dim" style={{ display: 'block', fontSize: 12 }}>{r.notes.join(' ')}</span> : null}</li>)}
              {result.replacedDemo && <li>Os dados de demonstração foram removidos.</li>}
            </ul>
          ) : (
          <p className="muted" style={{ lineHeight: 1.6 }}>
            {num(result.inserted)} linha(s) de {TYPE_LABEL[result.type].toLowerCase()} importada(s){result.orders ? ` em ${num(result.orders)} pedido(s)` : ''}.
            {result.skipped ? ` ${num(result.skipped)} repetida(s) ignorada(s).` : ''}{result.errorCount ? ` ${num(result.errorCount)} com erro ignorada(s).` : ''}
            {result.replacedDemo ? ' Os dados de demonstração foram removidos.' : ''}
            {result.notes?.length ? <span className="dim" style={{ display: 'block', fontSize: 13, marginTop: 6 }}>{result.notes.join(' ')}</span> : null}
          </p>
          )}
          <div className="toolbar" style={{ justifyContent: 'center' }}>
            <button className="btn" onClick={reset}>Importar outra planilha</button>
            <Link className="btn primary" to="/">Ver dashboard</Link>
          </div>
        </div>
      )}
    </section>
  );
}

const TYPE_HINT = {
  vendas: 'Sem ela não há faturamento, clientes nem produtos',
  despesas: 'Sem ela, lucro e fluxo de caixa ficam incompletos',
  contas: 'Usada no fluxo de caixa e nos alertas de vencimento',
  metas: 'Usada nas metas, na equipe e na previsão do mês'
};
const monthLabel = (m) => (m ? `${m.slice(5, 7)}/${m.slice(0, 4)}` : '');

function DataStatus({ st }) {
  if (st.error) return <ErrorBox error={st.error} />;
  if (!st.data) return <div className="skel" style={{ height: 220 }} />;
  const T = st.data.types || {};
  const demo = st.data.isDemo;
  const done = Object.values(T).filter((t) => t.count > 0).length;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <h2 id="base" className="card-title">Dados da empresa</h2>
        <span className="dim" style={{ fontSize: 12 }}>{demo ? 'demonstração' : `${done} de 4 completos`}</span>
      </div>
      <div style={{ height: 6, borderRadius: 99, background: 'var(--card-3)', overflow: 'hidden' }}><div style={{ width: `${demo ? 0 : done * 25}%`, height: '100%', background: 'var(--violet)', transition: 'width .4s' }} /></div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {Object.keys(TYPE_LABEL).map((k) => {
          const t = T[k] || {};
          const has = t.count > 0;
          const period = k === 'metas' ? (t.from === t.to ? monthLabel(t.from) : `${monthLabel(t.from)} a ${monthLabel(t.to)}`) : t.from ? `${brDate(t.from)} a ${brDate(t.to)}` : '';
          const amount = k === 'vendas' ? `${num(t.count)} linhas · ${num(t.orders)} pedidos` : k === 'metas' ? `${num(t.count)} metas` : `${num(t.count)} lançamentos`;
          return (
            <li key={k} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: '1px solid var(--line)' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginTop: 1, background: has ? 'var(--green-bg)' : 'var(--amber-bg)', border: has ? 0 : '1px solid var(--amber-line)', color: 'var(--amber-text)', fontWeight: 700, fontSize: 13 }}>
                {has ? <Icon name="check" size={12} color="var(--green)" width={3} /> : '!'}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <strong style={{ fontSize: 14, fontWeight: 500 }}>{TYPE_LABEL[k]}</strong>
                  {has ? (demo ? <span className="badge demo">Demonstração</span> : t.stale ? <span className="badge demo">Desatualizado</span> : <span className="badge ok">Em dia</span>)
                    : <button className="btn sm" onClick={() => download(k)}><Icon name="download" size={14} color="var(--muted)" />Modelo</button>}
                </div>
                <div className="muted" style={{ fontSize: 13, marginTop: 2 }}>{has ? `${amount}${period ? ` · ${period}` : ''}` : 'Nenhum arquivo enviado'}</div>
                <div className="dim" style={{ fontSize: 12, marginTop: 2 }}>{has ? (t.last ? `Último arquivo: ${t.last.file} · ${relTime(t.last.at)}` : demo ? 'Dados fictícios' : '') : TYPE_HINT[k]}</div>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function WatchCard({ onImported }) {
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
      w.reload(); if (n) onImported?.();
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
      {w.data?.files ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', fontSize: 13 }}>
            <span className="muted">{w.data.files.length ? `${w.data.files.length} arquivo(s) na pasta` : 'A pasta está vazia'}</span>
            {w.data.nextScanAt && <span className="dim">próxima leitura às {new Date(w.data.nextScanAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
          {w.data.files.length > 0 && (
            <div className="table-wrap">
              <table className="table" style={{ minWidth: 460 }}>
                <thead><tr><th>Arquivo</th><th>Conteúdo</th><th>Situação</th></tr></thead>
                <tbody>
                  {w.data.files.map((f) => (
                    <tr key={f.name}>
                      <td><span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Icon name="file" size={15} color="var(--muted)" /><span className="mono" style={{ fontSize: 12 }}>{f.name}</span></span></td>
                      <td className="muted">{f.type === 'varias' ? 'Várias abas' : TYPE_LABEL[f.type]?.split(' ')[0] || '—'}</td>
                      <td style={{ fontSize: 13 }}>
                        {f.status === 'ok' && <span style={{ color: 'var(--green-text)', whiteSpace: 'nowrap' }}>✓ Importado <span className="dim">· {relTime(f.at)} · {num(f.rows)} linhas</span></span>}
                        {f.status === 'erro' && <span style={{ color: 'var(--red-text)' }} title="Envie este arquivo pelo quadro acima para ajustar as colunas">⚠ {f.message}</span>}
                        {f.status === 'novo' && <span style={{ color: 'var(--violet-text)', whiteSpace: 'nowrap' }}>● Novo <span className="dim">· será lido na próxima verificação</span></span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {w.data.files.some((f) => f.status === 'erro') && <p className="dim" style={{ fontSize: 12, margin: 0 }}>Arquivo com erro: envie ele pelo quadro de importação acima para ajustar as colunas.</p>}
        </div>
      ) : form.path && w.data && !w.data.folderFound ? (
        <div className="alert warn"><Icon name="alert" color="var(--amber)" /><span>Pasta não encontrada neste computador.</span></div>
      ) : <span className="dim" style={{ fontSize: 13 }}>Escolha uma pasta para ver os arquivos dela aqui.</span>}
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <Wizard isDemo={me.org.isDemo} onDone={() => { st.reload(); refresh(); }} />
            <WatchCard onImported={() => { st.reload(); refresh(); }} />
          </div>
        </div>
        <div style={{ flex: '1 1 300px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <section className="card tight" aria-labelledby="mod">
            <h2 id="mod" className="card-title">Modelos de planilha</h2>
            <p className="dim" style={{ fontSize: 13, lineHeight: 1.5 }}>Use os nomes de coluna dos modelos para o mapeamento ser automático. Os nomes do seu ERP também funcionam — você ajusta na etapa 2.</p>
            <div className="toolbar" style={{ gap: 8 }}>{Object.keys(TEMPLATES).map((t) => <button key={t} className="btn sm" onClick={() => download(t)}><Icon name="download" size={14} color="var(--muted)" />{TYPE_LABEL[t].split(' ')[0]}</button>)}</div>
          </section>
          <section className="card tight" aria-labelledby="base">
            <DataStatus st={st} />
            <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={() => setConfirm(true)}><Icon name="refresh" size={14} color="var(--muted)" />Voltar aos dados de demonstração</button>
          </section>
          <BackupCard />
        </div>
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
