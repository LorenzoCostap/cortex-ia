import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead } from '../components/Layout.jsx';
import { Icon, Spinner, Switch, ErrorBox, useAsync, useToast } from '../components/ui.jsx';
import { initials } from '../format.js';

const SCREENS = [['overview', 'Visão geral'], ['ranking', 'Ranking da equipe'], ['vendas', 'Vendas e produtos'], ['clientes', 'Clientes'], ['financeiro', 'Financeiro', 'contém valores sensíveis'], ['insights', 'Insights / destaques']];
const secsLabel = (s) => { const m = Math.floor(s / 60), r = s % 60; return m === 0 ? `${s} s` : r ? `${m} min ${r} s` : `${m} min`; };

// Reduz a imagem para 256×256 (corte central) antes de enviar: fica leve e quadrada
function shrinkImage(file) {
  return new Promise((resolve, reject) => {
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return reject(new Error('Use uma imagem PNG, JPG ou WebP.'));
    if (file.size > 10e6) return reject(new Error('A imagem passa de 10 MB.'));
    const img = new Image();
    img.onload = () => {
      const S = 256, side = Math.min(img.width, img.height);
      const c = document.createElement('canvas'); c.width = c.height = S;
      c.getContext('2d').drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, S, S);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL(file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png', 0.9));
    };
    img.onerror = () => reject(new Error('Não foi possível abrir a imagem.'));
    img.src = URL.createObjectURL(file);
  });
}

function OrgLogo({ name, logo, onChange }) {
  const toast = useToast();
  const { refresh } = useAuth();
  const [busy, setBusy] = useState(false);
  const save = async (dataUrl) => {
    setBusy(true);
    try { const r = await api('/org/logo', { method: 'PUT', body: { dataUrl } }); onChange(r.logo); await refresh(); toast(dataUrl ? 'Foto atualizada' : 'Foto removida'); }
    catch (e) { toast('Não foi possível salvar a foto', { kind: 'err', text: e.message }); }
    setBusy(false);
  };
  const pick = async (file) => { if (!file) return; try { await save(await shrinkImage(file)); } catch (e) { toast('Foto inválida', { kind: 'err', text: e.message }); } };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {logo ? <img src={logo} alt="" style={{ width: 64, height: 64, borderRadius: 16, objectFit: 'cover', flex: 'none' }} />
        : <span className="avatar sq" style={{ width: 64, height: 64, borderRadius: 16, fontSize: 22, flex: 'none' }}>{initials(name)}</span>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <label className="btn sm" style={{ position: 'relative', cursor: 'pointer' }}>{busy ? <Spinner /> : <Icon name="upload" size={14} />}{logo ? 'Trocar foto' : 'Enviar foto'}
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(e) => { pick(e.target.files[0]); e.target.value = ''; }} style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} aria-label="Escolher foto da organização" />
          </label>
          {logo && <button type="button" className="btn sm ghost" style={{ color: 'var(--red-text)' }} disabled={busy} onClick={() => save(null)}>Remover</button>}
        </div>
        <span className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>PNG, JPG ou WebP, de preferência quadrada. Aparece no menu, no login e na TV.</span>
      </div>
    </div>
  );
}

const slug = (t) => t.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'tv';

/** TVs com nome e telas próprias. Cada TV abre pelo link /tv?tela=<id>. */
function TvDevices({ devices, defaults, onChange }) {
  const toast = useToast();
  const upd = (i, patch) => onChange(devices.map((d, k) => (k === i ? { ...d, ...patch } : d)));
  const add = () => {
    const name = `TV ${devices.length + 1}`;
    onChange([...devices, { id: `${slug(name)}-${Math.random().toString(36).slice(2, 6)}`, name, screens: { ...defaults } }]);
  };
  const link = (d) => `${window.location.origin}/tv?tela=${d.id}`;
  return (
    <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
      <legend style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>TVs cadastradas</legend>
      <p className="dim" style={{ fontSize: 12, lineHeight: 1.5, marginTop: -4 }}>Dê um nome a cada TV e escolha o que ela mostra. Abra o link da TV no navegador dela uma vez — depois ela lembra sozinha. Na rede, troque “localhost” pelo endereço que aparece no terminal.</p>
      {devices.map((d, i) => (
        <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 14, borderRadius: 12, border: '1px solid var(--line)', background: 'var(--side)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Icon name="tv" size={16} color="var(--violet-text)" />
            <input className="input" aria-label="Nome da TV" value={d.name} maxLength={40} onChange={(e) => upd(i, { name: e.target.value })} style={{ flex: 1, minHeight: 36 }} />
            <button type="button" className="btn icon sm ghost" aria-label={`Remover ${d.name}`} onClick={() => onChange(devices.filter((_, k) => k !== i))}><Icon name="trash" size={15} color="var(--muted)" /></button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 14px' }}>
            {SCREENS.map(([k, label]) => <label key={k} className="check" style={{ fontSize: 13 }}><input type="checkbox" checked={!!d.screens?.[k]} onChange={(e) => upd(i, { screens: { ...d.screens, [k]: e.target.checked } })} />{label}</label>)}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code className="mono dim" style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/tv?tela={d.id}</code>
            <button type="button" className="btn sm" onClick={() => { navigator.clipboard?.writeText(link(d)); toast('Link copiado', { text: link(d) }); }}><Icon name="copy" size={14} />Copiar link</button>
            <a className="btn sm" href={`/tv?tela=${d.id}`} target="_blank" rel="noreferrer">Abrir</a>
          </div>
        </div>
      ))}
      <button type="button" className="btn sm" onClick={add} style={{ alignSelf: 'flex-start' }}><Icon name="plus" size={14} />Adicionar TV</button>
    </fieldset>
  );
}

export default function Settings() {
  const { refresh } = useAuth();
  const toast = useToast();
  const res = useAsync(() => api('/settings'), []);
  const [form, setForm] = useState(null);
  const [orig, setOrig] = useState('');
  const [saving, setSaving] = useState(false);
  const [test, setTest] = useState(null);
  const [logo, setLogo] = useState(null);

  useEffect(() => {
    if (!res.data) return;
    const { logo: lg, ...o } = res.data.org;
    setLogo(lg || null);
    const f = { org: { ...o, cnpj: o.cnpj || '', segment: o.segment || '' }, ai: res.data.settings.ai, tv: res.data.settings.tv, appearance: res.data.settings.appearance };
    setForm(f); setOrig(JSON.stringify(f));
  }, [res.data]);

  if (res.error) return <><PageHead eyebrow="Organização" title="Configurações da organização" /><ErrorBox error={res.error} onRetry={res.reload} /></>;
  if (!form) return <><PageHead eyebrow="Organização" title="Configurações da organização" /><div className="grid-2"><div className="card"><div className="skel" style={{ height: 300 }} /></div><div className="card"><div className="skel" style={{ height: 300 }} /></div></div></>;

  const dirty = JSON.stringify(form) !== orig;
  const set = (sec, k) => (v) => setForm((f) => ({ ...f, [sec]: { ...f[sec], [k]: v?.target ? (v.target.type === 'checkbox' ? v.target.checked : v.target.value) : v } }));

  const save = async () => {
    setSaving(true);
    try {
      await api('/settings', { method: 'PUT', body: form });
      setOrig(JSON.stringify(form));
      await refresh();
      toast('Configurações salvas');
    } catch (e) { toast('Não foi possível salvar', { kind: 'err', text: e.message }); }
    setSaving(false);
  };
  const testAi = async () => {
    setTest({ loading: true });
    try { setTest(await api('/settings/test-ai', { method: 'POST', body: { url: form.ai.url, model: form.ai.model } })); }
    catch (e) { setTest({ online: false, error: e.message }); }
  };

  return (
    <>
      <PageHead eyebrow={form.org.name} title="Configurações da organização" />
      <div className="grid-2">
        <section className="card" aria-labelledby="org">
          <div><h2 id="org" className="card-title">Organização</h2><p className="card-sub">Aparece no login, nos relatórios e na TV.</p></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <OrgLogo name={form.org.name} logo={logo} onChange={setLogo} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <label className="field">Nome fantasia<input className="input" value={form.org.name} onChange={set('org', 'name')} /></label>
            <label className="field">CNPJ<input className="input" value={form.org.cnpj} onChange={set('org', 'cnpj')} placeholder="00.000.000/0000-00" /></label>
            <label className="field">Segmento<input className="input" value={form.org.segment} onChange={set('org', 'segment')} placeholder="Ex.: Distribuidora de alimentos" /></label>
            <label className="field">Identificador de login<input className="input mono" value={form.org.slug} onChange={(e) => set('org', 'slug')(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))} /></label>
          </div>
        </section>

        <section className="card" aria-labelledby="ia">
          <div><h2 id="ia" className="card-title"><Icon name="sparkle" size={16} color="var(--violet-text)" />Cortex AI</h2><p className="card-sub">Modelo de linguagem rodando localmente com Ollama.</p></div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, background: 'var(--side)', border: '1px solid var(--line)' }}>
            <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 14, fontWeight: 500 }}>Usar inteligência artificial</span>
              <span className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>{form.ai.enabled === false ? 'Desligada: o Cortex não conecta ao Ollama, o Assistente vira “Perguntas rápidas” (respostas automáticas) e o microfone some.' : 'Ligada: perguntas livres são respondidas pelo modelo local.'}</span>
            </span>
            <Switch checked={form.ai.enabled !== false} onChange={(v) => set('ai', 'enabled')(v)} label="Usar inteligência artificial" />
          </div>
          {form.ai.enabled !== false && <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
            <label className="field">Endereço do Ollama<input className="input mono" style={{ fontSize: 13 }} value={form.ai.url} onChange={set('ai', 'url')} /></label>
            <label className="field">Modelo
              <input className="input mono" style={{ fontSize: 13 }} list="models" value={form.ai.model} onChange={set('ai', 'model')} />
              <datalist id="models">{['qwen2.5:7b', 'qwen2.5:14b', 'llama3.1:8b', 'qwen2.5:3b', ...(test?.models || [])].map((m) => <option key={m} value={m} />)}</datalist>
            </label>
          </div>
          <div className="toolbar">
            <button className="btn" onClick={testAi} disabled={test?.loading}>Testar conexão</button>
            {test?.loading && <span role="status" className="muted" style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}><Spinner />Conectando e medindo velocidade…</span>}
            {test && !test.loading && (test.online && !test.error
              ? <span role="status" className="badge ok rise" style={{ padding: '6px 12px', fontSize: 13 }}><Icon name="check" size={14} width={2.6} />Conectado{test.tokensPerSecond ? ` · ${test.tokensPerSecond} tokens/s` : ''}</span>
              : <span role="status" className="badge err rise" style={{ padding: '6px 12px', fontSize: 13, whiteSpace: 'normal' }}><Icon name="alert" size={14} />{test.error || 'Não conectou'}</span>)}
          </div>
          </>}
          <div>
            {form.ai.enabled !== false && <div className="setting-row"><div><span>Insights automáticos</span><small>A IA reescreve os alertas da TV a cada hora</small></div><Switch label="Insights automáticos" checked={form.ai.autoInsights} onChange={set('ai', 'autoInsights')} /></div>}
            <div className="setting-row"><div><span>Mostrar ferramentas usadas</span><small>Exibe quais cálculos embasaram cada resposta</small></div><Switch label="Mostrar ferramentas usadas" checked={form.ai.showTools} onChange={set('ai', 'showTools')} /></div>
          </div>
        </section>

        <section className="card" aria-labelledby="tv">
          <div><h2 id="tv" className="card-title">Modo TV</h2><p className="card-sub">O que aparece nas telas do escritório.</p></div>
          <label className="field">
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>Tempo por tela<span className="mono" style={{ color: 'var(--text)' }}>{secsLabel(form.tv.interval)}</span></span>
            <input type="range" min="30" max="300" step="15" value={form.tv.interval} onChange={(e) => set('tv', 'interval')(+e.target.value)} aria-valuetext={secsLabel(form.tv.interval)} style={{ accentColor: 'var(--violet-h)' }} />
            <span className="dim" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}><span>30 s</span><span>5 min</span></span>
          </label>
          <label className="field">
            <span style={{ display: 'flex', justifyContent: 'space-between' }}>Tempo por pergunta no widget do Cortex<span className="mono" style={{ color: 'var(--text)' }}>{form.tv.questionInterval} s</span></span>
            <input type="range" min="5" max="30" step="1" value={form.tv.questionInterval} onChange={(e) => set('tv', 'questionInterval')(+e.target.value)} style={{ accentColor: 'var(--violet-h)' }} />
          </label>
          <label className="field">Período padrão do gráfico Receita × meta
            <select className="select" value={form.tv.goalPeriod || '12m'} onChange={(e) => set('tv', 'goalPeriod')(e.target.value)}>
              <option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="tri">Últimos 3 meses</option><option value="12m">Últimos 12 meses</option>
            </select>
            <span className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>Num computador onde o Dashboard já foi aberto, a TV usa o período escolhido lá. Este padrão vale para TVs em outros aparelhos.</span>
          </label>
          <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
            <legend style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 8 }}>Telas na rotação{(form.tv.devices || []).length ? ' (TVs sem cadastro)' : ''}</legend>
            {SCREENS.map(([k, label, note]) => (
              <label key={k} className="check"><input type="checkbox" checked={!!form.tv.screens[k]} onChange={(e) => set('tv', 'screens')({ ...form.tv.screens, [k]: e.target.checked })} />{label}{note && <span className="dim" style={{ fontSize: 12 }}>— {note}</span>}</label>
            ))}
          </fieldset>
          <TvDevices devices={form.tv.devices || []} defaults={form.tv.screens} onChange={set('tv', 'devices')} />
        </section>

        <section className="card" aria-labelledby="ap">
          <div><h2 id="ap" className="card-title">Aparência</h2><p className="card-sub">Vale para todos os usuários da organização.</p></div>
          <fieldset style={{ margin: 0, padding: 0, border: 0 }}>
            <legend style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10 }}>Tema</legend>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
              {[['dark', 'Escuro', '#111113', '#1C1C21'], ['light', 'Claro', '#F4F4F6', '#FFFFFF'], ['system', 'Sistema']].map(([k, label, a, b]) => (
                <label key={k} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 12, borderRadius: 12, border: `1px solid ${form.appearance.theme === k ? 'var(--violet)' : 'var(--line-2)'}`, background: form.appearance.theme === k ? 'var(--violet-soft)' : 'transparent', cursor: 'pointer', fontSize: 13 }}>
                  <span aria-hidden="true" style={{ height: 54, borderRadius: 8, overflow: 'hidden', display: 'flex', border: '1px solid var(--line-2)' }}>
                    {a ? <><span style={{ width: 16, background: a }} /><span style={{ flex: 1, background: b }} /></> : <><span style={{ flex: 1, background: '#111113' }} /><span style={{ flex: 1, background: '#F4F4F6' }} /></>}
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><input type="radio" name="theme" checked={form.appearance.theme === k} onChange={() => set('appearance', 'theme')(k)} style={{ accentColor: 'var(--violet-h)', margin: 0 }} />{label}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="setting-row"><div><span>Animações</span><small>Transições suaves nos gráficos e cards</small></div><Switch label="Animações" checked={form.appearance.animations} onChange={set('appearance', 'animations')} /></div>
        </section>
      </div>

      <div style={{ position: 'sticky', bottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line)', boxShadow: dirty ? '0 12px 32px rgba(0,0,0,.35)' : 'none' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: dirty ? 'var(--amber-text)' : 'var(--dim)' }}><span className="pill-dot" style={{ background: dirty ? 'var(--amber)' : 'var(--green)' }} />{dirty ? 'Alterações não salvas' : 'Tudo salvo'}</span>
        <div className="toolbar">
          <button className="btn" disabled={!dirty || saving} onClick={() => setForm(JSON.parse(orig))}>Descartar</button>
          <button className="btn primary" disabled={!dirty || saving} onClick={save}>{saving ? <><Spinner color="#fff" />Salvando…</> : 'Salvar alterações'}</button>
        </div>
      </div>
    </>
  );
}
