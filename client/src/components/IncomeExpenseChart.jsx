import { useEffect, useState } from 'react';
import { brlK, num } from '../format.js';

const C = { rev: '#8B6CF0', exp: '#E46A72', profit: '#FBBF24' };

function niceStep(range, n) {
  const raw = range / n, p = 10 ** Math.floor(Math.log10(raw || 1));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].map((m) => m * p).find((s) => s >= raw) || p * 10;
}

/** Receita para cima, despesas para baixo, linha de lucro — mesma escala. */
export default function IncomeExpenseChart({ buckets, height = 280 }) {
  const [sel, setSel] = useState(null);
  useEffect(() => setSel(null), [buckets]);
  const n = buckets.length;
  const top = Math.max(...buckets.map((b) => Math.max(b.revenue, b.profit)), 1);
  const bottom = Math.min(...buckets.map((b) => Math.min(-b.expenses, b.profit)), -1);
  const step = niceStep(top - bottom, 4);
  const hi = Math.ceil(top / step) * step, lo = Math.floor(bottom / step) * step;
  const y = (v) => ((hi - v) / (hi - lo)) * 100;
  const x = (i) => ((i + 0.5) / n) * 100;
  const ticks = []; for (let v = hi; v >= lo - 1e-6; v -= step) ticks.push(Math.round(v));
  const every = n > 16 ? Math.ceil(n / 10) : 1;
  const pts = buckets.map((b, i) => `${(x(i) * 10).toFixed(1)},${y(b.profit).toFixed(2)}`).join(' ');
  const last = n - 1;

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div aria-hidden="true" className="mono" style={{ position: 'relative', width: 58, height, flex: 'none', fontSize: 11, color: 'var(--dim)', whiteSpace: 'nowrap' }}>
        {ticks.map((t) => <span key={t} style={{ position: 'absolute', right: 0, top: `${y(t)}%`, transform: 'translateY(-50%)' }}>{t === 0 ? '0' : `${t < 0 ? '−' : ''}${brlK(Math.abs(t)).replace('R$ ', '')}`}</span>)}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="group" aria-label="Receitas, despesas e lucro por período" style={{ position: 'relative', height, display: 'flex' }} onMouseLeave={() => setSel(null)}>
          {ticks.map((t) => <span key={t} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: `${y(t)}%`, borderTop: `1px solid ${t === 0 ? 'var(--line-2)' : 'var(--line-soft)'}` }} />)}
          {buckets.map((b, i) => {
            const on = i === sel;
            const margin = b.revenue ? (b.profit / b.revenue) * 100 : null;
            const left = i < n * 0.6;
            return (
              <div key={b.key} style={{ position: 'relative', flex: 1, height: '100%', minWidth: 0 }}>
                {on && <span aria-hidden="true" style={{ position: 'absolute', inset: '0 2px', background: 'var(--violet-soft)', opacity: 0.6, borderRadius: 6 }} />}
                <span aria-hidden="true" style={{ position: 'absolute', left: '50%', marginLeft: 'calc(min(24px, 62%) / -2)', width: 'min(24px, 62%)', bottom: `${100 - y(0)}%`, height: `${y(0) - y(b.revenue)}%`, background: C.rev, borderRadius: '4px 4px 0 0', opacity: b.partial ? 0.7 : 1 }} />
                <span aria-hidden="true" style={{ position: 'absolute', left: '50%', marginLeft: 'calc(min(24px, 62%) / -2)', width: 'min(24px, 62%)', top: `${y(0)}%`, height: `${y(-b.expenses) - y(0)}%`, background: C.exp, borderRadius: '0 0 4px 4px', opacity: b.partial ? 0.7 : 1 }} />
                <button type="button" onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onBlur={() => setSel(null)} onClick={() => setSel(i)}
                  aria-label={`${b.full}: receita ${brlK(b.revenue)}, despesas ${brlK(b.expenses)}, lucro ${brlK(b.profit)}`}
                  style={{ position: 'absolute', inset: 0, border: 0, background: 'transparent', padding: 0, cursor: 'pointer', zIndex: 1 }} />
                {on && (
                  <div aria-hidden="true" style={{ position: 'absolute', top: 0, [left ? 'left' : 'right']: 'calc(100% - 4px)', width: 214, zIndex: 3, pointerEvents: 'none', padding: 14, borderRadius: 12, background: 'var(--card-3)', border: '1px solid var(--line-2)', boxShadow: '0 12px 32px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <strong style={{ fontSize: 13, fontWeight: 600 }}>{b.full}{b.partial ? ' (parcial)' : ''}</strong>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">Receita</span><span className="mono">{brlK(b.revenue)}</span></span>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">Despesas</span><span className="mono">{brlK(b.expenses)}</span></span>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, paddingTop: 6, borderTop: '1px solid var(--line)' }}><span className="muted">Lucro</span><span className="mono" style={{ color: b.profit >= 0 ? 'var(--green-text)' : 'var(--red-text)' }}>{b.profit < 0 ? '−' : ''}{brlK(Math.abs(b.profit))}</span></span>
                    {margin !== null && <span className="dim" style={{ fontSize: 12 }}>Margem líquida {num(margin, 1)}%</span>}
                  </div>
                )}
              </div>
            );
          })}
          <svg aria-hidden="true" viewBox="0 0 1000 100" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', pointerEvents: 'none' }}>
            <polyline points={pts} fill="none" stroke={C.profit} strokeWidth="2.2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          </svg>
        </div>
        <div aria-hidden="true" style={{ display: 'flex' }}>
          {buckets.map((b, i) => <span key={b.key} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: 11, color: i === (sel ?? last) ? 'var(--text)' : 'var(--dim)', fontWeight: i === (sel ?? last) ? 600 : 400, whiteSpace: 'nowrap' }}>{i % every === 0 || i === last ? b.label : ''}</span>)}
        </div>
      </div>
    </div>
  );
}

export function IncomeLegend() {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 13, color: 'var(--muted)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: C.rev }} />Receita</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: C.exp }} />Despesas</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 3, background: C.profit }} />Lucro</span>
    </div>
  );
}
