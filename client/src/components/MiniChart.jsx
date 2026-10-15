import { brlK, num } from '../format.js';

const fmt = (v, unit) => (unit === 'pct' ? `${num(v, 1)}%` : `${v < 0 ? '−' : ''}${brlK(Math.abs(v))}`);
const TONE = { neg: '#E46A72', pos: '#34D399' };

function Bars({ c }) {
  const max = Math.max(...c.items.map((i) => Math.abs(i.value)), 1);
  const hasNeg = c.items.some((i) => i.value < 0) && c.items.some((i) => i.value > 0);
  return (
    <div role="img" aria-label={`${c.title}: ${c.items.map((i) => `${i.label} ${fmt(i.value, c.unit)}`).join('; ')}`} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {c.items.map((i, k) => {
        const w = (Math.abs(i.value) / max) * (hasNeg ? 50 : 100);
        const color = TONE[i.tone] || (i.value < 0 ? TONE.neg : '#8B6CF0');
        return (
          <div key={k} aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 38%) 1fr auto', alignItems: 'center', gap: 10, fontSize: 13 }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{i.label}</span>
            <span style={{ position: 'relative', height: 12, borderRadius: 4, background: 'var(--card-3)' }}>
              {hasNeg && <span style={{ position: 'absolute', left: '50%', top: -3, bottom: -3, borderLeft: '1px solid var(--line-2)' }} />}
              <span style={{ position: 'absolute', top: 0, bottom: 0, borderRadius: 4, background: color, width: `${Math.max(w, 1)}%`, ...(hasNeg ? (i.value < 0 ? { right: '50%' } : { left: '50%' }) : { left: 0 }), transformOrigin: i.value < 0 && hasNeg ? 'right' : 'left', animation: `growx .6s cubic-bezier(.2,.8,.2,1) ${k * 0.05}s both` }} />
            </span>
            <span className="mono" style={{ fontSize: 12, minWidth: 72, textAlign: 'right', color: i.value < 0 ? 'var(--red-text)' : 'var(--text)' }}>{fmt(i.value, c.unit)}</span>
          </div>
        );
      })}
    </div>
  );
}

function Line({ c }) {
  const vals = c.points.map((p) => p.value).concat(c.ref ? [c.ref.value] : []);
  const max = Math.max(...vals), min = Math.min(...vals);
  const pad = (max - min) * 0.12 || Math.abs(max) * 0.1 || 1;
  const hi = max + pad, lo = min - pad;
  const W = 600, H = 150;
  const x = (i) => (c.points.length === 1 ? W / 2 : 16 + (i / (c.points.length - 1)) * (W - 32));
  const y = (v) => 8 + (1 - (v - lo) / (hi - lo)) * (H - 16);
  const pts = c.points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const every = c.points.length > 8 ? Math.ceil(c.points.length / 6) : 1;
  const last = c.points.length - 1;
  return (
    <div>
      <svg role="img" aria-label={`${c.title}: de ${fmt(c.points[0].value, c.unit)} (${c.points[0].label}) a ${fmt(c.points[last].value, c.unit)} (${c.points[last].label})`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 150, display: 'block', overflow: 'visible' }}>
        {c.ref && <line x1="0" x2={W} y1={y(c.ref.value)} y2={y(c.ref.value)} stroke="#FBBF24" strokeDasharray="5 5" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />}
        <polygon points={`${x(0)},${H} ${pts} ${x(last)},${H}`} fill="#8B6CF0" opacity="0.1" />
        <polyline points={pts} fill="none" stroke="#A78BFA" strokeWidth="2.4" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      </svg>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--dim)', marginTop: 6, gap: 4 }}>
        {c.points.map((p, i) => <span key={i} style={{ flex: 1, textAlign: i === 0 ? 'left' : i === last ? 'right' : 'center', whiteSpace: 'nowrap' }}>{i % every === 0 || i === last ? p.label : ''}</span>)}
      </div>
      <div aria-hidden="true" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 6 }}>
        <span className="muted">{c.points[0].label}: <span className="mono" style={{ color: 'var(--text)' }}>{fmt(c.points[0].value, c.unit)}</span></span>
        {c.ref && <span style={{ color: 'var(--amber-text)' }}>{c.ref.label}: <span className="mono">{fmt(c.ref.value, c.unit)}</span></span>}
        <span className="muted">{c.points[last].label}: <span className="mono" style={{ color: 'var(--text)' }}>{fmt(c.points[last].value, c.unit)}</span></span>
      </div>
    </div>
  );
}

function Pair({ c }) {
  const max = Math.max(...c.items.flatMap((i) => [Math.abs(i.a), Math.abs(i.b)]), 1);
  return (
    <div role="img" aria-label={`${c.title}: ${c.items.map((i) => `${i.label} ${fmt(i.a, c.unit)} contra ${fmt(i.b, c.unit)}`).join('; ')}`} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div aria-hidden="true" style={{ display: 'flex', gap: 16, fontSize: 12, color: 'var(--muted)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#8B6CF0' }} />{c.series[0]}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#4A4A58' }} />{c.series[1]}</span>
      </div>
      {c.items.map((i) => {
        const d = i.b ? ((i.a - i.b) / Math.abs(i.b)) * 100 : null;
        return (
          <div key={i.label} aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: '96px 1fr auto', gap: 10, alignItems: 'center', fontSize: 13 }}>
            <span style={{ color: 'var(--text-2)' }}>{i.label}</span>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ height: 9, borderRadius: 3, background: '#8B6CF0', width: `${(Math.abs(i.a) / max) * 100}%` }} />
              <span style={{ height: 9, borderRadius: 3, background: '#4A4A58', width: `${(Math.abs(i.b) / max) * 100}%` }} />
            </span>
            <span className="mono" style={{ fontSize: 12, minWidth: 64, textAlign: 'right', color: d === null ? 'var(--dim)' : (d >= 0) === (i.label !== 'Despesas') ? 'var(--green-text)' : 'var(--red-text)' }}>{d === null ? '—' : `${d >= 0 ? '+' : '−'}${num(Math.abs(d), 1)}%`}</span>
          </div>
        );
      })}
    </div>
  );
}

export default function MiniChart({ chart }) {
  if (!chart) return null;
  const Body = { bars: Bars, line: Line, pair: Pair }[chart.type];
  if (!Body || !(chart.items?.length || chart.points?.length)) return null;
  return (
    <figure style={{ margin: 0, padding: '14px 16px', borderRadius: 12, background: 'var(--side)', border: '1px solid var(--line)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <figcaption style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{chart.title}</figcaption>
      <Body c={chart} />
    </figure>
  );
}
