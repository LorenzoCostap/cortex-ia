import { createPortal } from 'react-dom';
import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const ICONS = {
  dashboard: 'M3 3h7v9H3zM14 3h7v5h-7zM14 12h7v9h-7zM3 16h7v5H3z',
  sparkle: 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  upload: 'M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4',
  file: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5',
  clock: 'M12 7v5l3 2M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  building: 'M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16M16 9h2a2 2 0 0 1 2 2v10M8 7h4M8 11h4M8 15h4M2 21h20',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4',
  tv: 'M5 4h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2zM8 20h8M12 16v4',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3',
  calendar: 'M5 5h14a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM3 10h18M8 3v4M16 3v4',
  bell: 'M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  up: 'M12 19V5M5 12l7-7 7 7',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12l5 5 9-10',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M12 8v5M12 16h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  info: 'M12 8h.01M11 12h1v5h1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
  copy: 'M11 9h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2zM5 15V5a2 2 0 0 1 2-2h10',
  download: 'M12 3v12M7 10l5 5 5-5M4 21h16',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z',
  refresh: 'M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5',
  trash: 'M4 7h16M10 11v6M14 11v6M5 7l1 13a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-13M9 7V4h6v3',
  dots: 'M5 12h.01M12 12h.01M19 12h.01',
  key: 'M15 7a4 4 0 1 1-3.9 4.9L3 20v-3h3v-3h3l1.1-1.1A4 4 0 0 1 15 7z',
  printer: 'M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z',
  database: 'M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  chevrons: 'M8 9l4-4 4 4M8 15l4 4 4-4',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 12h.01',
  folder: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
  wallet: 'M3 7a2 2 0 0 1 2-2h14v14H5a2 2 0 0 1-2-2zM3 9h18M16 14h2',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8',
  megaphone: 'M3 11v2a1 1 0 0 0 1 1h3l6 4V6L7 10H4a1 1 0 0 0-1 1zM17 8a5 5 0 0 1 0 8',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM19 11a7 7 0 0 1-14 0M12 18v3',
  volume: 'M11 5 6 9H3v6h3l5 4zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13',
  stop: 'M7 7h10v10H7z'
};

export function Icon({ name, size = 18, color = 'currentColor', width = 1.8, className, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className} style={style}>
      <path d={ICONS[name]} />
    </svg>
  );
}

export function BrandMark({ size = 32 }) {
  return (
    <span className="brand-mark" style={{ width: size, height: size, borderRadius: size * 0.28 }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8" /></svg>
    </span>
  );
}

export function Spinner({ size = 16, color = 'var(--violet-text)' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.4" strokeLinecap="round" className="spin" aria-hidden="true"><path d="M21 12a9 9 0 1 1-9-9" /></svg>;
}

export function Kpi({ label, value, delta, tone, note, delay = 0 }) {
  return (
    <article className="kpi rise" style={{ animationDelay: `${delay}s` }}>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value" title={value}>{value}</span>
      <span className={`kpi-delta ${tone || ''}`}>{delta} {note && <span>{note}</span>}</span>
    </article>
  );
}

export function KpiSkeleton({ n = 5 }) {
  return (
    <div className="grid-kpi" aria-busy="true">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="kpi"><div className="skel" style={{ width: '50%', height: 12 }} /><div className="skel" style={{ width: '75%', height: 26 }} /><div className="skel" style={{ width: '40%', height: 12 }} /></div>
      ))}
    </div>
  );
}

export function CardSkeleton({ height = 260 }) {
  return (
    <div className="card" aria-busy="true">
      <div className="skel" style={{ width: '35%', height: 14 }} />
      <div style={{ height, display: 'flex', alignItems: 'flex-end', gap: 8 }}>
        {[40, 65, 50, 80, 60, 90, 70, 55].map((h, i) => <div key={i} className="skel" style={{ flex: 1, height: `${h}%` }} />)}
      </div>
    </div>
  );
}

export function ErrorBox({ error, onRetry }) {
  return (
    <div className="alert err" role="alert">
      <Icon name="alert" color="var(--red)" />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span>{error?.message || String(error)}</span>
        {onRetry && <button className="btn sm" style={{ alignSelf: 'flex-start' }} onClick={onRetry}>Tentar novamente</button>}
      </div>
    </div>
  );
}

export function Empty({ icon = 'database', title, text, children }) {
  return (
    <section className="empty rise">
      <span className="empty-icon"><Icon name={icon} size={26} width={1.6} /></span>
      <h2 style={{ fontSize: 17, fontWeight: 600 }}>{title}</h2>
      {text && <p>{text}</p>}
      {children}
    </section>
  );
}

export function Switch({ checked, onChange, label }) {
  return (
    <label className="switch">
      <input type="checkbox" role="switch" checked={!!checked} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
      <span />
    </label>
  );
}

/** Caixinha de seleção (lista com apagar em lote). */
export function Check({ checked, onChange, label, disabled, title }) {
  return (
    <label className="sel-check" title={title} onClick={(e) => e.stopPropagation()}>
      <input type="checkbox" checked={!!checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} aria-label={label} />
    </label>
  );
}

/** Seleção de vários itens de uma lista. */
export function useSelection() {
  const [sel, setSel] = useState(() => new Set());
  return {
    sel, size: sel.size, has: (id) => sel.has(id),
    toggle: (id, on) => setSel((s) => { const n = new Set(s); (on ?? !n.has(id)) ? n.add(id) : n.delete(id); return n; }),
    setAll: (ids) => setSel(new Set(ids)), clear: () => setSel(new Set())
  };
}

/** Barra que aparece só quando há itens selecionados. */
export function SelectBar({ selection, ids, children, compact }) {
  if (!selection.size) return null;
  const all = ids.length > 0 && ids.every((id) => selection.has(id));
  return (
    <div className={`sel-bar rise${compact ? ' compact' : ''}`} role="toolbar" aria-label="Itens selecionados">
      <label className="sel-all"><input type="checkbox" checked={all} onChange={(e) => (e.target.checked ? selection.setAll(ids) : selection.clear())} />Selecionar todos</label>
      <span className="dim" style={{ fontSize: 13 }}>{selection.size} selecionado(s)</span>
      <button className="btn sm ghost" onClick={selection.clear}>Cancelar</button>
      <span style={{ flex: 1 }} />
      {children}
    </div>
  );
}

export function Modal({ title, children, onClose }) {
  useEffect(() => {
    const k = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onClose]);
  // Portal: a janela vai direto para o <body>, para nunca ficar atrás de outro conteúdo (ex.: aberta pelo menu lateral)
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="card-head"><h2 className="card-title">{title}</h2><button className="btn icon sm ghost" aria-label="Fechar" onClick={onClose}><Icon name="x" size={16} /></button></div>
        {children}
      </div>
    </div>,
    document.body
  );
}

/** Markdown mínimo: parágrafos, listas, **negrito** e `código`. */
export function Markdown({ text }) {
  const inline = (s, k) => s.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((p, i) =>
    p.startsWith('**') ? <strong key={`${k}-${i}`}>{p.slice(2, -2)}</strong> : p.startsWith('`') ? <code key={`${k}-${i}`}>{p.slice(1, -1)}</code> : p);
  const blocks = [];
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trim();
    const ol = line.match(/^\d+[.)]\s+(.*)/), ul = line.match(/^[-•*]\s+(.*)/);
    if (ol || ul) {
      const type = ol ? 'ol' : 'ul';
      if (!list || list.type !== type) { list = { type, items: [] }; blocks.push(list); }
      list.items.push((ol || ul)[1]);
    } else {
      list = null;
      if (line) blocks.push({ type: 'p', text: line });
    }
  }
  return (
    <div className="md">
      {blocks.map((b, i) => b.type === 'p' ? <p key={i}>{inline(b.text, i)}</p> : b.type === 'ol'
        ? <ol key={i}>{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ol>
        : <ul key={i}>{b.items.map((t, j) => <li key={j}>{inline(t, `${i}-${j}`)}</li>)}</ul>)}
    </div>
  );
}

/* ---------- Avisos (toasts) ---------- */
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const push = useCallback((title, { text, kind = 'ok' } = {}) => {
    const id = Math.random();
    setItems((x) => [...x, { id, title, text, kind }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), kind === 'err' ? 7000 : 4500);
  }, []);
  const colors = { ok: ['var(--green-bg)', 'var(--green)', 'check'], err: ['var(--red-bg)', 'var(--red)', 'alert'], info: ['var(--violet-soft)', 'var(--violet-text)', 'info'] };
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {items.map((t) => {
          const [bg, fg, ic] = colors[t.kind] || colors.ok;
          return (
            <div key={t.id} className="toast">
              <span className="toast-icon" style={{ background: bg }}><Icon name={ic} size={13} color={fg} width={2.6} /></span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 3 }}><strong style={{ fontSize: 14, fontWeight: 500 }}>{t.title}</strong>{t.text && <span className="muted" style={{ fontSize: 13 }}>{t.text}</span>}</span>
              <button className="btn icon sm ghost" style={{ width: 28, minHeight: 28 }} aria-label="Fechar aviso" onClick={() => setItems((x) => x.filter((y) => y.id !== t.id))}><Icon name="x" size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

/* ---------- Dados assíncronos ---------- */
export function useAsync(fn, deps) {
  const [state, setState] = useState({ loading: true, data: null, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    fn().then((data) => alive && setState({ loading: false, data, error: null }), (error) => alive && setState({ loading: false, data: null, error }));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, n]);
  return { ...state, reload: () => setN((x) => x + 1), setData: (d) => setState((s) => ({ ...s, data: typeof d === 'function' ? d(s.data) : d })) };
}
