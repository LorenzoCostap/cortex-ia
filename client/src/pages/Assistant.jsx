import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, askStream } from '../api.js';
import { useAuth } from '../auth.jsx';
import { PageHead, UnitSelect } from '../components/Layout.jsx';
import { Icon, Markdown, Spinner, useAsync, useToast } from '../components/ui.jsx';
import { relTime } from '../format.js';
import MiniChart from '../components/MiniChart.jsx';
import { canListen, canSpeak, useDictation, speak, stopSpeaking } from '../voice.js';

const SUGGESTIONS = [
  'Por que meu faturamento caiu neste mês?',
  'Quais produtos geraram mais receita?',
  'Quais clientes estão comprando menos?',
  'Qual foi minha margem de lucro no período?',
  'Compare o desempenho deste mês com o anterior.',
  'Gere um relatório executivo da semana.',
  'Quais indicadores merecem minha atenção?',
  'Como está meu fluxo de caixa?',
  'Qual vendedor está mais perto da meta?'
];

function AiAvatar() {
  return <span style={{ flex: 'none', width: 34, height: 34, borderRadius: 10, background: 'var(--violet)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="sparkle" color="#fff" /></span>;
}

function AssistantMessage({ m, question, showTools }) {
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const [talking, setTalking] = useState(false);
  if (m.status === 'thinking') {
    return (
      <article className="rise" aria-live="polite" style={{ display: 'flex', gap: 14 }}>
        <AiAvatar />
        <div className="card tight" style={{ borderRadius: '4px 16px 16px 16px', fontSize: 14, gap: 10, flex: '0 1 auto' }}>
          <span style={{ color: 'var(--text-2)' }}>Analisando<span className="dot">.</span><span className="dot" style={{ animationDelay: '.2s' }}>.</span><span className="dot" style={{ animationDelay: '.4s' }}>.</span></span>
          {m.steps.map((s, i) => (
            <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, color: i === m.steps.length - 1 ? 'var(--text-2)' : 'var(--dim)' }}>
              {i === m.steps.length - 1 ? <Spinner size={14} /> : <Icon name="check" size={14} color="var(--green)" width={2.4} />}{s}
            </span>
          ))}
        </div>
      </article>
    );
  }
  if (m.status === 'error') {
    return (
      <article style={{ display: 'flex', gap: 14 }}>
        <AiAvatar />
        <div className="alert err" role="alert" style={{ flex: 1 }}><Icon name="alert" color="var(--red)" /><span>{m.content}</span></div>
      </article>
    );
  }
  const toTv = async () => {
    try {
      const r = await api('/tv/push', { method: 'POST', body: { question, answer: m.content.replace(/\*\*/g, ''), rows: m.rows } });
      setSent(true);
      toast(r.screens ? `Enviado para ${r.screens} tela(s)` : 'Enviado — nenhuma TV conectada agora', { kind: r.screens ? 'ok' : 'info', text: r.screens ? 'A resposta aparece em destaque no modo TV.' : 'Abra o modo TV em outra tela para ver.' });
    } catch (e) { toast('Não foi possível enviar', { kind: 'err', text: e.message }); }
  };
  return (
    <article className="rise" style={{ display: 'flex', gap: 14 }}>
      <AiAvatar />
      <div className="card" style={{ flex: 1, borderRadius: '4px 16px 16px 16px', padding: '20px 22px', gap: 14, fontSize: 15, color: 'var(--text-2)' }}>
        {m.notice && <div className="alert warn" style={{ fontSize: 13, padding: '10px 12px' }}><Icon name="info" size={16} color="var(--amber)" /><span>Resposta automática — a IA local não está disponível.</span></div>}
        <Markdown text={m.content} />
        <MiniChart chart={m.chart} />
        {showTools && m.tools?.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', fontSize: 12, color: 'var(--dim)' }}>
            <span>Dados consultados:</span>
            {m.tools.map((t, i) => <span key={i} className="mono" style={{ padding: '4px 8px', borderRadius: 6, background: 'var(--card-3)', color: 'var(--text-2)' }}>{t}</span>)}
            {m.ms >= 500 && <span>· {(m.ms / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} s</span>}
          </div>
        )}
        <div className="toolbar" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 14, gap: 8 }}>
          <button className="btn sm" onClick={toTv} disabled={sent}><Icon name="tv" size={15} color="var(--violet-text)" />{sent ? 'Exibindo na TV' : 'Enviar para a TV'}</button>
          {canSpeak && <button className="btn sm" onClick={() => { if (talking) { stopSpeaking(); setTalking(false); } else { setTalking(true); speak(m.content, { onEnd: () => setTalking(false) }); } }}><Icon name={talking ? 'stop' : 'volume'} size={15} color="var(--muted)" />{talking ? 'Parar' : 'Ouvir'}</button>}
          <Link className="btn sm" to="/relatorios"><Icon name="file" size={15} color="var(--muted)" />Gerar relatório</Link>
          <button className="btn sm icon" style={{ width: 36 }} aria-label="Copiar resposta" title="Copiar" onClick={() => { navigator.clipboard?.writeText(m.content.replace(/\*\*/g, '')); toast('Resposta copiada'); }}><Icon name="copy" size={15} color="var(--muted)" /></button>
        </div>
      </div>
    </article>
  );
}

export default function Assistant() {
  const { me } = useAuth();
  const [messages, setMessages] = useState([]);
  const [params] = useSearchParams();
  const [draft, setDraft] = useState(() => params.get('q') || '');
  const [busy, setBusy] = useState(false);
  const status = useAsync(() => api('/ai/status'), []);
  const recent = useAsync(() => api('/ai/recent'), []);
  const endRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [messages]);
  useEffect(() => () => { abortRef.current?.abort(); stopSpeaking(); }, []);
  const [autoSpeak, setAutoSpeakState] = useState(() => { try { return localStorage.getItem('cortex.voice') === '1'; } catch { return false; } });
  const autoRef = useRef(autoSpeak); autoRef.current = autoSpeak;
  const setAutoSpeak = (v) => { setAutoSpeakState(v); if (!v) stopSpeaking(); try { localStorage.setItem('cortex.voice', v ? '1' : '0'); } catch { /* sem storage */ } };
  const dict = useDictation({ onText: (t) => setDraft(t), onFinal: (t) => send(t) });

  const send = async (text) => {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    setDraft('');
    setBusy(true);
    const history = messages.filter((m) => m.status !== 'thinking' && m.status !== 'error').map((m) => ({ role: m.role, content: m.content }));
    setMessages((ms) => [...ms, { role: 'user', content: q }, { role: 'assistant', status: 'thinking', steps: [], content: '' }]);
    const update = (fn) => setMessages((ms) => { const c = [...ms]; c[c.length - 1] = fn(c[c.length - 1]); return c; });
    abortRef.current = new AbortController();
    try {
      await askStream(q, history, (ev) => {
        if (ev.type === 'step') update((m) => ({ ...m, steps: [...m.steps, ev.text] }));
        if (ev.type === 'tool') update((m) => ({ ...m, steps: [...m.steps, `Consultando ${ev.name.replace(/_/g, ' ')}`] }));
        if (ev.type === 'answer') { update(() => ({ role: 'assistant', status: 'done', content: ev.answer, tools: ev.tools, rows: ev.rows, chart: ev.chart, notice: ev.notice, ms: ev.ms, mode: ev.mode })); if (autoRef.current) speak(ev.answer); }
        if (ev.type === 'error') update(() => ({ role: 'assistant', status: 'error', content: ev.error }));
      }, abortRef.current.signal);
      recent.reload();
    } catch (e) {
      if (e.name !== 'AbortError') update(() => ({ role: 'assistant', status: 'error', content: e.message }));
    } finally {
      setBusy(false);
    }
  };

  const st = status.data;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
      <div style={{ flex: '999 1 520px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <PageHead eyebrow={me.aiEnabled === false ? 'Respostas automáticas com os números da empresa' : 'Pergunte em linguagem natural'} title={me.aiEnabled === false ? 'Perguntas rápidas' : 'Assistente Cortex AI'}>
        <UnitSelect />
          {me.aiEnabled !== false && <span className="badge" style={{ padding: '8px 12px', fontSize: 13 }}>
            <span className="pill-dot" style={{ background: !st ? 'var(--dim)' : st.online && st.hasModel ? 'var(--green)' : 'var(--amber)' }} />
            {!st ? 'Verificando IA…' : st.online && st.hasModel ? `Ollama · ${st.model} · local` : st.online ? `Modelo ${st.model} não instalado` : 'IA offline · respostas automáticas'}
          </span>}
          {canSpeak && <button className="btn" aria-pressed={autoSpeak} onClick={() => setAutoSpeak(!autoSpeak)} title="Ler as respostas em voz alta automaticamente" style={autoSpeak ? { borderColor: 'var(--violet-line)', background: 'var(--violet-soft)', color: 'var(--violet-text-2)' } : undefined}><Icon name="volume" size={16} color={autoSpeak ? 'var(--violet-text)' : 'var(--muted)'} />{autoSpeak ? 'Leitura em voz ligada' : 'Ler respostas'}</button>}
          <button className="btn" onClick={() => { abortRef.current?.abort(); stopSpeaking(); setMessages([]); setBusy(false); }}><Icon name="plus" size={16} color="var(--muted)" />Nova conversa</button>
        </PageHead>

        {st && !st.online && !st.disabled && (
          <div className="alert warn"><Icon name="info" color="var(--amber)" /><span>O Ollama não está rodando neste computador. As perguntas frequentes continuam funcionando com respostas automáticas. Para perguntas livres: instale o Ollama (gratuito, em <a href="https://ollama.com/download" target="_blank" rel="noreferrer">ollama.com/download</a>), rode <code className="mono">ollama pull {st.model}</code> uma vez e deixe o Ollama aberto. Se a empresa não usa IA, desligue em Configurações › Cortex AI.</span></div>
        )}

        <section aria-label="Conversa" style={{ display: 'flex', flexDirection: 'column', gap: 20, minHeight: 200 }}>
          {messages.length === 0 && (
            <div className="empty" style={{ padding: '40px 24px' }}>
              <span className="empty-icon" style={{ background: 'var(--violet-soft)' }}><Icon name="sparkle" size={26} color="var(--violet-text)" /></span>
              <h2 style={{ fontSize: 17, fontWeight: 600 }}>O que você quer saber sobre a {me.org.name}?</h2>
              <p>Escolha uma pergunta abaixo ou escreva a sua. O Cortex consulta os dados e explica o resultado.</p>
            </div>
          )}
          {messages.map((m, i) => m.role === 'user'
            ? <div key={i} className="rise" style={{ alignSelf: 'flex-end', maxWidth: 520, padding: '14px 18px', borderRadius: '16px 16px 4px 16px', background: '#2A2440', color: '#F1EDFF', fontSize: 15, lineHeight: 1.5 }}>{m.content}</div>
            : <AssistantMessage key={i} m={m} question={messages[i - 1]?.content} showTools={me.showTools} />)}
          <div ref={endRef} />
        </section>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {SUGGESTIONS.map((q) => (
              <button key={q} type="button" className="btn sm" disabled={busy} style={{ borderRadius: 999, background: 'var(--side)', color: 'var(--muted)', fontWeight: 400 }} onClick={() => send(q)}>{q}</button>
            ))}
          </div>
          <form onSubmit={(e) => { e.preventDefault(); send(); }} style={{ display: 'flex', alignItems: 'flex-end', gap: 10, padding: '10px 10px 10px 18px', borderRadius: 14, background: 'var(--card)', border: '1px solid var(--line-2)' }}>
            <label htmlFor="ask" className="sr">Pergunte ao Cortex</label>
            <textarea id="ask" rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder={dict.listening ? 'Ouvindo… fale sua pergunta' : 'Pergunte sobre vendas, clientes, despesas… (Enter envia)'} style={{ flex: 1, resize: 'none', border: 0, outline: 'none', background: 'transparent', fontSize: 15, lineHeight: 1.5, padding: '6px 0' }} />
            {canListen && me.aiEnabled !== false && <button type="button" className={`btn icon${dict.listening ? ' mic-on' : ''}`} aria-label={dict.listening ? 'Parar ditado' : 'Falar a pergunta'} title={dict.listening ? 'Ouvindo… clique para parar' : 'Falar a pergunta (o áudio é transcrito pelo navegador)'} disabled={busy} onClick={() => (dict.listening ? dict.stop() : dict.start())} style={{ width: 44, minHeight: 44 }}><Icon name={dict.listening ? 'stop' : 'mic'} color={dict.listening ? 'var(--red-text)' : 'var(--muted)'} /></button>}
            <button type="submit" className="btn primary icon" aria-label="Enviar pergunta" disabled={busy || !draft.trim()} style={{ width: 44, minHeight: 44 }}>{busy ? <Spinner color="#fff" /> : <Icon name="up" color="#fff" width={2} />}</button>
          </form>
          {dict.error && <p role="status" style={{ fontSize: 12, color: 'var(--amber-text)' }}>{dict.error}</p>}
          <p className="dim" style={{ fontSize: 12 }}>{me.aiEnabled === false ? 'As contas são feitas pelo sistema.' : 'As contas são feitas pelo sistema; a IA apenas interpreta os resultados.'} Dados e respostas ficam no seu computador{canListen && me.aiEnabled !== false ? ' — só o áudio do ditado (microfone) é transcrito pelo serviço do navegador' : ''}.</p>
        </div>
      </div>

      <aside aria-label="Contexto" style={{ flex: '1 1 280px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {me.aiEnabled !== false && (
        <section className="card tight">
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>IA local</h2>
          {!st ? <div className="skel" style={{ height: 60 }} /> : (
            <dl style={{ margin: 0, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px 14px', fontSize: 13 }}>
              <dt className="dim">Status</dt><dd style={{ margin: 0, textAlign: 'right', color: st.online ? 'var(--green-text)' : 'var(--amber-text)' }}>{st.online ? 'Conectada' : 'Offline'}</dd>
              <dt className="dim">Modelo</dt><dd className="mono" style={{ margin: 0, textAlign: 'right' }}>{st.model}</dd>
              {st.online && <><dt className="dim">Instalados</dt><dd style={{ margin: 0, textAlign: 'right' }}>{st.models.length}</dd></>}
            </dl>
          )}
          {me.permissions.configuracoes && <Link to="/configuracoes" style={{ fontSize: 13 }}>Configurar IA</Link>}
        </section>
        )}
        <section className="card tight">
          <h2 style={{ fontSize: 14, fontWeight: 600 }}>Perguntas recentes</h2>
          {recent.data?.length ? recent.data.map((r) => (
            <button key={r.id} className="btn ghost" style={{ justifyContent: 'flex-start', textAlign: 'left', whiteSpace: 'normal', padding: '6px 0', minHeight: 0, flexDirection: 'column', alignItems: 'flex-start', gap: 2, fontWeight: 400 }} onClick={() => send(r.question)} disabled={busy}>
              <span style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.45 }}>{r.question}</span>
              <span className="dim" style={{ fontSize: 12 }}>{relTime(r.createdAt)}</span>
            </button>
          )) : <p className="dim" style={{ fontSize: 13 }}>Suas perguntas aparecem aqui.</p>}
        </section>
        <section style={{ border: '1px dashed var(--line-2)', borderRadius: 14, padding: '18px 20px', display: 'flex', gap: 12, fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
          <Icon name="shield" color="var(--violet-text)" style={{ flex: 'none', marginTop: 1 }} />
          <span>{me.aiEnabled === false ? 'Sem IA: as respostas são montadas por regras fixas a partir dos números do sistema. Nada é enviado para a internet.' : `Processamento 100% local via Ollama. Perguntas e dados não são enviados para a internet${canListen ? ' (exceto o áudio, se você usar o microfone)' : ''}.`}</span>
        </section>
      </aside>
    </div>
  );
}
