import { useEffect, useState } from 'react';
import { Icon } from './ui.jsx';

const iso = (d) => d.toISOString().slice(0, 10);
const D = (s) => new Date(s + 'T00:00:00Z');
const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
const monthStart = (s, delta = 0) => { const d = D(s.slice(0, 7) + '-01'); d.setUTCMonth(d.getUTCMonth() + delta); return iso(d); };
const monthEnd = (s) => { const d = D(s.slice(0, 7) + '-01'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return iso(d); };
const br = (s) => s.split('-').reverse().join('/');

export const PRESETS = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: 'tri', label: 'Trimestre' },
  { id: '12m', label: '12 meses' }
];

export function presetRange(id, today) {
  switch (id) {
    case '7d': return { from: addDays(today, -6), to: today };
    case '30d': return { from: addDays(today, -29), to: today };
    case 'tri': return { from: addDays(today, -89), to: today };
    case 'mes': { const s = monthStart(today, -1); return { from: s, to: monthEnd(s) }; }
    default: { const end = monthStart(today, -1); return { from: monthStart(end, -11), to: monthEnd(end) }; }
  }
}

function mask(raw) {
  const d = raw.replace(/\D/g, '').slice(0, 16);
  const part = (s) => (s.length > 4 ? `${s.slice(0, 2)}/${s.slice(2, 4)}/${s.slice(4)}` : s.length > 2 ? `${s.slice(0, 2)}/${s.slice(2)}` : s);
  return d.length > 8 ? `${part(d.slice(0, 8))} - ${part(d.slice(8))}` : part(d);
}

function parse(v) {
  const m = v.match(/^(\d{2})\/(\d{2})\/(\d{4}) - (\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return { state: v ? 'incompleto' : 'vazio' };
  const mk = (d, mo, y) => { const s = `${y}-${mo}-${d}`; return iso(D(s)) === s ? s : null; };
  const a = mk(m[1], m[2], m[3]), b = mk(m[4], m[5], m[6]);
  if (!a || !b) return { state: 'data' };
  if (b < a) return { state: 'ordem' };
  if ((D(b) - D(a)) / 864e5 > 731) return { state: 'longo' };
  return { state: 'ok', from: a, to: b };
}

const MSG = { vazio: 'Ou digite um período', incompleto: 'Continue digitando…', data: 'Data inválida', ordem: 'A data final é anterior à inicial', longo: 'Escolha no máximo 2 anos', ok: 'Período personalizado aplicado' };

/** Botões 7 dias / 30 dias / Trimestre / 12 meses + campo "dd/mm/aaaa - dd/mm/aaaa". */
export default function PeriodPicker({ value, onChange, today, id = 'periodo' }) {
  const [text, setText] = useState(value.preset === 'custom' ? `${br(value.from)} - ${br(value.to)}` : '');
  const [state, setState] = useState(value.preset === 'custom' ? 'ok' : 'vazio');
  useEffect(() => { if (value.preset !== 'custom') { setState('vazio'); } }, [value.preset]);

  const onType = (e) => {
    const v = mask(e.target.value);
    setText(v);
    const p = parse(v);
    setState(p.state);
    if (p.state === 'ok') onChange({ preset: 'custom', from: p.from, to: p.to });
  };
  const bad = state === 'data' || state === 'ordem' || state === 'longo';
  const custom = value.preset === 'custom';

  return (
    <div className="toolbar" style={{ alignItems: 'flex-start' }}>
      <div className="seg" role="group" aria-label="Período">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" aria-pressed={value.preset === p.id} onClick={() => { setText(''); onChange({ preset: p.id, ...presetRange(p.id, today) }); }}>{p.label}</button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 12px', borderRadius: 10, background: 'var(--card)', border: `1px solid ${bad ? '#a3343e' : custom ? 'var(--violet)' : 'var(--line-2)'}` }}>
          <Icon name="calendar" size={16} color={custom ? 'var(--violet-text)' : 'var(--muted)'} />
          <span className="sr">Período personalizado, de dd/mm/aaaa até dd/mm/aaaa</span>
          <input id={id} type="text" inputMode="numeric" value={text} onChange={onType} placeholder="dd/mm/aaaa - dd/mm/aaaa" aria-invalid={bad} aria-describedby={`${id}-msg`} style={{ border: 0, outline: 'none', background: 'transparent', fontFamily: 'var(--mono)', fontSize: 13, width: 196 }} />
        </label>
        <span id={`${id}-msg`} style={{ fontSize: 12, minHeight: 16, paddingLeft: 4, color: bad ? 'var(--red-text)' : custom ? 'var(--violet-text)' : 'var(--dim)' }}>{custom && state === 'vazio' ? MSG.ok : MSG[state]}</span>
      </div>
    </div>
  );
}

export function periodLabel(v) {
  const p = PRESETS.find((x) => x.id === v.preset);
  return p ? `Últimos ${p.label.toLowerCase().replace('trimestre', '3 meses')}` : `${br(v.from)} a ${br(v.to)}`;
}

const KEY = 'cortex.dash.period';

/**
 * Período do gráfico Receita × meta. Ordem de prioridade:
 * 1) o que foi escolhido no Dashboard neste navegador; 2) o padrão da organização (Configurações › Modo TV); 3) 12 meses.
 * Os períodos prontos ("7 dias", "30 dias"…) são recalculados a cada dia, então a TV sempre mostra os dias mais recentes.
 */
export function loadSavedPeriod(today, fallback = '12m') {
  try {
    const v = JSON.parse(localStorage.getItem(KEY));
    if (v?.preset === 'custom' && v.from && v.to) return v;
    if (v?.preset && PRESETS.some((p) => p.id === v.preset)) return { preset: v.preset, ...presetRange(v.preset, today) };
  } catch { /* ignora */ }
  const id = PRESETS.some((p) => p.id === fallback) ? fallback : '12m';
  return { preset: id, ...presetRange(id, today) };
}

export function savePeriod(v) {
  try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* ignora */ }
}
