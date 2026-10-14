import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon, BrandMark, Spinner } from '../components/ui.jsx';
import { loadSavedPeriod, periodLabel } from '../components/PeriodPicker.jsx';
import TVFinance from '../components/TVFinance.jsx';
import { brlK, num, delta, toneOf } from '../format.js';

const W = 1920, H = 1080;
const SCREEN_LABEL = { overview: 'Visão geral', vendas: 'Vendas e produtos', clientes: 'Clientes', financeiro: 'Financeiro', insights: 'Insights do Cortex' };
const TONE = { pos: '#34D399', neg: '#F87171', neutral: '#ECECF1' };

function useStageScale() {
  const [s, setS] = useState(1);
  useEffect(() => {
    const f = () => setS(Math.min(window.innerWidth / W, window.innerHeight / H));
    f(); window.addEventListener('resize', f);
    return () => window.removeEventListener('resize', f);
  }, []);
  return s;
}

function useClock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000 * 15); return () => clearInterval(t); }, []);
  return now;
}

const panel = { padding: 36, borderRadius: 20, background: '#17171B', border: '1px solid #24242B', display: 'flex', flexDirection: 'column', gap: 24, minWidth: 0, minHeight: 0 };

function CortexWidget({ insights, seconds, push, compact = false }) {
  const [i, setI] = useState(0);
  useEffect(() => { setI(0); }, [insights.length]);
  useEffect(() => {
    if (push || !insights.length) return undefined;
    const t = setInterval(() => setI((x) => (x + 1) % insights.length), seconds * 1000);
    return () => clearInterval(t);
  }, [insights.length, seconds, push]);
  const item = push ? { question: push.question, answer: push.answer, rows: push.rows || [] } : insights[i];
  return (
    <section style={{ ...panel, background: '#19162A', border: '1px solid #3A3158', ...(compact ? { padding: '18px 24px', gap: 12, borderRadius: 16 } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0, fontSize: compact ? 22 : 26, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 12 }}><Icon name="sparkle" size={compact ? 22 : 26} color="#B9A3FF" />Cortex AI</h2>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 16, color: '#D6C9FF' }}>
          <span style={{ width: 10, height: 10, borderRadius: '50%', background: push ? '#34D399' : '#A78BFA', animation: 'glow 2s ease-in-out infinite' }} />
          {push ? `Enviado por ${push.by}` : insights.length ? `Pergunta ${i + 1} de ${insights.length}` : 'Preparando'}
        </span>
      </div>
      {!item ? <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={32} /></div> : (
        <div key={push ? push.at : i} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 22, animation: 'rise .6s ease both' }}>
          <p style={{ fontSize: compact ? 18 : 24, color: '#C9C9D1', lineHeight: 1.4 }}>“{item.question}”</p>
          <p style={{ fontSize: compact ? (push ? 19 : 21) : (push ? 25 : 28), lineHeight: 1.4, fontWeight: 500, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: compact ? 2 : push ? 8 : 6, flexShrink: 0, WebkitBoxOrient: 'vertical', whiteSpace: 'pre-line' }}>{item.answer}</p>
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: compact ? 8 : 14, fontSize: compact ? 17 : 20 }}>
            {item.rows.slice(0, compact ? 2 : 3).map((r) => <span key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span><span style={{ fontFamily: 'var(--mono)', whiteSpace: 'nowrap', color: TONE[r.tone] || TONE.neutral }}>{r.value}</span></span>)}
          </div>
        </div>
      )}
      {!push && insights.length > 0 && (
        <div aria-hidden="true" style={{ display: 'flex', gap: 8 }}>
          {insights.map((_, k) => <span key={k} style={{ flex: 1, height: 4, borderRadius: 2, background: k === i ? '#A78BFA' : k < i ? '#5B4A9C' : '#2E2A40' }} />)}
        </div>
      )}
    </section>
  );
}

function BigKpi({ label, value, d, tone }) {
  return (
    <div style={{ padding: 32, borderRadius: 20, background: '#17171B', border: '1px solid #24242B', display: 'flex', flexDirection: 'column', gap: 14, minWidth: 0 }}>
      <span style={{ fontSize: 22, color: '#A6A6B0' }}>{label}</span>
      <span style={{ fontFamily: 'var(--mono)', fontSize: 56, fontWeight: 500, letterSpacing: '-0.03em', whiteSpace: 'nowrap' }}>{value}</span>
      <span style={{ fontSize: 22, color: tone === 'pos' ? '#34D399' : tone === 'neg' ? '#F87171' : '#A6A6B0' }}>{d}</span>
    </div>
  );
}

const moneyNode = (v, hide) => {
  if (hide) return '•••';
  const s = brlK(v);
  const m = s.match(/^(.*?)( mil| mi)$/);
  return m ? <>{m[1]}<span style={{ fontSize: '0.5em', color: '#A6A6B0', letterSpacing: 0, marginLeft: 8 }}>{m[2].trim()}</span></> : s;
};

function BarList({ items, hide }) {
  const max = Math.max(...items.map((x) => x.value), 1);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
      {items.map((x) => (
        <div key={x.label} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 24 }}><span>{x.label}</span><span style={{ fontFamily: 'var(--mono)', color: x.color || '#C9C9D1' }}>{x.text ?? (hide ? '•••' : brlK(x.value))}</span></span>
          <span style={{ height: 12, borderRadius: 6, background: '#24242B', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', width: `${(x.value / max) * 100}%`, background: x.bar || '#8B6CF0', borderRadius: 6, transition: 'width .8s ease' }} /></span>
        </div>
      ))}
    </div>
  );
}

export default function TV() {
  const { me } = useAuth();
  const scale = useStageScale();
  const now = useClock();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [screen, setScreen] = useState(0);
  const [push, setPush] = useState(null);
  const pushTimer = useRef(null);

  const load = () => api('/tv/data').then((d) => { setData(d); setError(null); }).catch((e) => { setError(e); setTimeout(load, 15000); });
  useEffect(() => { load(); const t = setInterval(load, 5 * 60e3); return () => clearInterval(t); }, []);

  useEffect(() => {
    const es = new EventSource('/api/tv/stream');
    es.addEventListener('push', (e) => {
      setPush(JSON.parse(e.data));
      clearTimeout(pushTimer.current);
      pushTimer.current = setTimeout(() => setPush(null), 90e3);
    });
    es.addEventListener('insights', load);
    es.addEventListener('settings', load);
    es.addEventListener('report', load);
    return () => { es.close(); clearTimeout(pushTimer.current); };
  }, []);

  const tv = data?.settings;

  // Receita × meta: mesmo período escolhido no Dashboard (ou o padrão da organização)
  const [goal, setGoal] = useState(null);
  const goalPeriodSetting = tv?.goalPeriod;
  useEffect(() => {
    if (!tv) return undefined;
    const fetchGoal = () => {
      const n = new Date();
      const today = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
      const p = loadSavedPeriod(today, goalPeriodSetting);
      api(`/goal-series?from=${p.from}&to=${p.to}`).then((g) => setGoal({ ...g, period: p })).catch(() => {});
    };
    fetchGoal();
    const t = setInterval(fetchGoal, 5 * 60e3);
    const onStorage = (e) => e.key === 'cortex.dash.period' && fetchGoal();
    window.addEventListener('storage', onStorage);
    return () => { clearInterval(t); window.removeEventListener('storage', onStorage); };
  }, [tv, goalPeriodSetting, me.today]);
  const screens = useMemo(() => (tv ? Object.keys(SCREEN_LABEL).filter((k) => tv.screens[k]) : ['overview']), [tv]);
  const safeScreens = screens.length ? screens : ['overview'];
  const current = safeScreens[screen % safeScreens.length];
  const interval = tv?.interval || 30;
  useEffect(() => {
    const t = setInterval(() => setScreen((s) => s + 1), interval * 1000);
    return () => clearInterval(t);
  }, [interval, safeScreens.length]);

  const hide = !!tv?.hideMoney;
  const d = data?.dashboard;
  const insights = data?.insights || [];
  const buckets = goal?.buckets || (d?.series || []).map((s) => ({ key: s.month, label: s.label, full: s.full, revenue: s.revenue, goal: s.goal || 0 }));

  let content = null;
  if (d) {
    const k = d.kpis, dl = d.deltas, vs = `vs ${d.previousLabel.split(' ')[0].toLowerCase()}`;
    const kpis = (
      <section style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 24 }}>
        <BigKpi label="Faturamento" value={moneyNode(k.revenue, hide)} d={`${delta(dl.revenue)} ${vs}`} tone={toneOf(dl.revenue)} />
        <BigKpi label="Lucro líquido" value={moneyNode(k.profit, hide)} d={`${delta(dl.profit)} ${vs}`} tone={toneOf(dl.profit)} />
        <BigKpi label="Margem líquida" value={`${num(k.netMargin, 1)}%`} d={delta(dl.netMarginPp, { pp: true })} tone={toneOf(dl.netMarginPp)} />
        <BigKpi label="Pedidos no mês" value={num(k.orders)} d={`${delta(dl.orders)} ${vs}`} tone={toneOf(dl.orders)} />
      </section>
    );
    const widget = <CortexWidget insights={insights} seconds={tv.questionInterval || 10} push={push} />;
    const two = (left) => <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 24 }}>{left}{widget}</div>;

    if (current === 'overview') {
      const periodText = goal ? `${periodLabel(goal.period).toLowerCase()} · por ${goal.unit.replace('mes', 'mês')}` : 'últimos 12 meses · por mês';
      content = <TVFinance data={data} goal={goal} periodText={periodText} hide={hide} widget={<CortexWidget insights={insights} seconds={tv.questionInterval || 10} push={push} compact />} />;
    } else if (current === 'vendas') {
      content = <>{kpis}{two(
        <section style={{ ...panel, display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 48 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}><h2 style={{ fontSize: 26, fontWeight: 600 }}>Produtos com mais receita</h2><BarList hide={hide} items={d.topProducts.map((p) => ({ label: p.name, value: p.revenue }))} /></div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}><h2 style={{ fontSize: 26, fontWeight: 600 }}>Por categoria</h2><BarList items={data.categories.map((c) => ({ label: c.category, value: c.share, text: `${num(c.share, 0)}%`, bar: '#5A4A9E' }))} /></div>
        </section>
      )}</>;
    } else if (current === 'clientes') {
      content = <>{kpis}{two(
        <section style={panel}>
          <h2 style={{ fontSize: 26, fontWeight: 600 }}>Clientes comprando menos <span style={{ fontSize: 18, color: '#8E8E99', fontWeight: 400 }}>· comparado à média dos 3 meses anteriores</span></h2>
          {data.topCustomers.length ? (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {data.topCustomers.map((c) => (
                <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '22px 0', borderBottom: '1px solid #24242B', fontSize: 24 }}>
                  <span style={{ flex: 1 }}>{c.name}<span style={{ display: 'block', fontSize: 18, color: '#8E8E99', marginTop: 4 }}>Último pedido {c.daysSinceLastOrder === 0 ? 'hoje' : `há ${c.daysSinceLastOrder} dias`}</span></span>
                  {!hide && <span style={{ fontFamily: 'var(--mono)', color: '#A6A6B0' }}>{brlK(-c.lost)}</span>}
                  <span style={{ fontFamily: 'var(--mono)', color: '#F87171', width: 120, textAlign: 'right' }}>{num(c.change, 0)}%</span>
                </div>
              ))}
            </div>
          ) : <p style={{ fontSize: 24, color: '#A6A6B0' }}>Nenhum cliente relevante comprando abaixo da média.</p>}
        </section>
      )}</>;
    } else if (current === 'financeiro') {
      const list = (title, rows) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h2 style={{ fontSize: 26, fontWeight: 600 }}>{title}</h2>
          {rows.length ? rows.map((b) => (
            <div key={b.party + b.dueDate} style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 21, padding: '12px 0', borderBottom: '1px solid #24242B' }}>
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.party}</span>
              <span style={{ fontFamily: 'var(--mono)' }}>{hide ? '•••' : brlK(b.amount)}</span>
              <span style={{ width: 110, textAlign: 'right', fontSize: 17, color: b.status === 'vencida' ? '#FCA5A5' : b.status === 'hoje' ? '#FCD34D' : '#A6A6B0' }}>{b.status === 'vencida' ? 'vencida' : b.status === 'hoje' ? 'hoje' : `${b.daysToDue} dias`}</span>
            </div>
          )) : <p style={{ fontSize: 20, color: '#8E8E99' }}>Nada nos próximos 15 dias.</p>}
        </div>
      );
      content = <>{kpis}{two(<section style={{ ...panel, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>{list('A pagar', data.payables)}{list('A receber', data.receivables)}</section>)}</>;
    } else {
      content = (
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gridAutoRows: '1fr', gap: 24 }}>
          {insights.slice(0, 6).map((it) => (
            <section key={it.key} style={{ ...panel, gap: 16, padding: 30 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 18, color: '#A6A6B0' }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: { alta: '#F87171', media: '#FBBF24', pos: '#34D399' }[it.severity] || '#8B6CF0' }} />{it.question}</span>
              <p style={{ fontSize: 24, lineHeight: 1.45, fontWeight: 500 }}>{it.answer}</p>
              <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 18 }}>
                {it.rows.slice(0, 2).map((r) => <span key={r.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}><span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span><span style={{ fontFamily: 'var(--mono)', color: TONE[r.tone] || TONE.neutral }}>{r.value}</span></span>)}
              </div>
            </section>
          ))}
        </div>
      );
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0E0E10', overflow: 'hidden', cursor: 'none' }} onMouseMove={(e) => { e.currentTarget.style.cursor = 'default'; }}>
      <div style={{ width: W, height: H, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: (window.innerWidth - W * scale) / 2, top: (window.innerHeight - H * scale) / 2, padding: '36px 48px 40px', boxSizing: 'border-box', color: '#ECECF1', display: 'flex', flexDirection: 'column', gap: 20 }}>
        <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <BrandMark size={48} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontSize: 28, fontWeight: 600 }}>{me.org.name}</span>
              <span style={{ fontSize: 20, color: '#A6A6B0' }}>{SCREEN_LABEL[current]}{d && current !== 'insights' ? ` · ${d.label}` : ''}</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 40 }}>
            <div aria-label={`Tela ${(screen % safeScreens.length) + 1} de ${safeScreens.length}`} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              {safeScreens.map((s, i) => i === screen % safeScreens.length
                ? <span key={`${s}-${screen}`} style={{ width: 64, height: 6, borderRadius: 3, background: '#2A2A32', overflow: 'hidden' }}><span style={{ display: 'block', height: '100%', background: '#A78BFA', animation: `fill ${interval}s linear both` }} /></span>
                : <span key={s} style={{ width: 20, height: 6, borderRadius: 3, background: '#2A2A32' }} />)}
            </div>
            <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 38, fontWeight: 500 }}>{now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
              <span style={{ fontSize: 18, color: '#A6A6B0' }}>{now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.())} aria-label="Tela cheia" style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #2E2E37', background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="tv" size={20} color="#8E8E99" /></button>
              <Link to="/" aria-label="Sair do modo TV" style={{ width: 48, height: 48, borderRadius: 12, border: '1px solid #2E2E37', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={20} color="#8E8E99" /></Link>
            </div>
          </div>
        </header>
        {error && !data && <div style={{ ...panel, alignItems: 'center', justifyContent: 'center', flex: 1, fontSize: 28, color: '#FCA5A5' }}>Sem conexão com o Cortex. Tentando de novo…</div>}
        {!data && !error && <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={48} /></div>}
        {content}
      </div>
    </div>
  );
}
