import { useEffect, useState } from 'react';
import { brlK, num } from '../format.js';

const niceMax = (v) => {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return ([1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((x) => n <= x) || 10) * p;
};

/** Barras de receita com um traço de meta em cada período e um balão ao passar o mouse. */
export default function RevenueGoalChart({ buckets, height = 260, hideMoney = false, big = false, lastYear = false }) {
  const [sel, setSel] = useState(null);
  useEffect(() => setSel(null), [buckets]);
  const max = niceMax(Math.max(...buckets.map((b) => Math.max(b.revenue, b.goal, lastYear ? b.lastYear || 0 : 0)), 1) * 1.05);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f).reverse();
  const every = buckets.length > 16 ? Math.ceil(buckets.length / 10) : 1;
  const fs = big ? 18 : 11;
  const last = buckets.length - 1;

  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <div aria-hidden="true" style={{ position: 'relative', width: big ? 90 : 58, height, flex: 'none', whiteSpace: 'nowrap', fontFamily: 'var(--mono)', fontSize: fs, color: 'var(--dim)' }}>
        {!hideMoney && ticks.map((t) => <span key={t} style={{ position: 'absolute', right: 0, top: `${(1 - t / max) * 100}%`, transform: 'translateY(-50%)' }}>{t === 0 ? '0' : brlK(t).replace('R$ ', '')}</span>)}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div role="group" aria-label="Receita e meta por período" style={{ position: 'relative', height, display: 'flex' }} onMouseLeave={() => setSel(null)}>
          {ticks.map((t) => <span key={t} aria-hidden="true" style={{ position: 'absolute', left: 0, right: 0, top: `${(1 - t / max) * 100}%`, borderTop: `1px solid ${t === 0 ? 'var(--line-2)' : 'var(--line-soft)'}` }} />)}
          {buckets.map((b, i) => {
            const hit = b.goal > 0 && b.revenue >= b.goal;
            const on = i === sel;
            const pct = b.goal ? (b.revenue / b.goal) * 100 : null;
            const color = !b.goal ? '#6e55c8' : hit ? 'var(--violet-bar)' : 'var(--violet-dark)';
            const left = i < buckets.length * 0.6;
            return (
              <div key={b.key} style={{ position: 'relative', flex: 1, height: '100%', minWidth: 0 }}>
                {on && <span aria-hidden="true" style={{ position: 'absolute', inset: '0 2px', background: 'var(--violet-soft)', opacity: 0.6, borderRadius: 6 }} />}
                <span className="bar-v" aria-hidden="true" style={{ position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: `min(${big ? 40 : 24}px, 62%)`, height: `${(b.revenue / max) * 100}%`, background: color, borderRadius: '5px 5px 0 0', opacity: b.partial ? 0.75 : 1, transformOrigin: 'bottom', animation: `grow .7s cubic-bezier(.2,.8,.2,1) ${(i / buckets.length) * 0.4}s both` }} />
                {lastYear && b.lastYear > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: '50%', width: 9, height: 9, margin: '0 0 -4.5px -4.5px', bottom: `${(b.lastYear / max) * 100}%`, borderRadius: '50%', background: '#5EEAD4', border: '2px solid var(--card)', zIndex: 1 }} />}
                {b.goal > 0 && <span aria-hidden="true" style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', width: `min(${big ? 56 : 34}px, 90%)`, height: big ? 3 : 2, bottom: `${(b.goal / max) * 100}%`, background: 'var(--text)', borderRadius: 1 }} />}
                <button type="button" onMouseEnter={() => setSel(i)} onFocus={() => setSel(i)} onBlur={() => setSel(null)} onClick={() => setSel(i)}
                  aria-label={`${b.full}: receita ${brlK(b.revenue)}${b.goal ? `, meta ${brlK(b.goal)}, ${num(pct, 1)}% da meta` : ''}`}
                  style={{ position: 'absolute', inset: 0, border: 0, background: 'transparent', padding: 0, cursor: 'pointer' }} />
                {on && !big && (
                  <div aria-hidden="true" style={{ position: 'absolute', top: 0, [left ? 'left' : 'right']: 'calc(100% - 4px)', width: 214, zIndex: 3, pointerEvents: 'none', padding: 14, borderRadius: 12, background: 'var(--card-3)', border: '1px solid var(--line-2)', boxShadow: '0 12px 32px rgba(0,0,0,.45)', display: 'flex', flexDirection: 'column', gap: 9 }}>
                    <strong style={{ fontSize: 13, fontWeight: 600 }}>{b.full}{b.partial ? ' (parcial)' : ''}</strong>
                    <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">Realizado</span><span className="mono">{hideMoney ? '•••' : brlK(b.revenue)}</span></span>
                    {lastYear && b.lastYear !== null && b.lastYear !== undefined && (
                      <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">Ano anterior</span><span className="mono">{hideMoney ? '•••' : brlK(b.lastYear)}{b.lastYear > 0 && <span style={{ marginLeft: 6, color: b.revenue >= b.lastYear ? 'var(--green-text)' : 'var(--red-text)' }}>{b.revenue >= b.lastYear ? '+' : '−'}{num(Math.abs((b.revenue / b.lastYear - 1) * 100), 0)}%</span>}</span></span>
                    )}
                    {b.goal > 0 ? (
                      <>
                        <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}><span className="muted">Meta</span><span className="mono">{hideMoney ? '•••' : brlK(b.goal)}</span></span>
                        <span className="bar-track"><span className="bar-fill" style={{ width: `${Math.min(pct, 100)}%`, background: hit ? 'var(--violet-bar)' : 'var(--violet-dark)' }} /></span>
                        <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
                          <span style={{ color: hit ? 'var(--green-text)' : 'var(--red-text)', fontWeight: 600 }}>{num(pct, 1)}% da meta</span>
                          <span className="muted">{hideMoney ? '' : hit ? `+${brlK(b.revenue - b.goal)}` : `faltaram ${brlK(b.goal - b.revenue)}`}</span>
                        </span>
                      </>
                    ) : <span className="dim" style={{ fontSize: 12 }}>{b.weekend ? 'Domingo — sem expediente' : 'Sem meta cadastrada'}</span>}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div aria-hidden="true" style={{ display: 'flex' }}>
          {buckets.map((b, i) => <span key={b.key} style={{ flex: 1, minWidth: 0, textAlign: 'center', fontSize: fs, color: i === (sel ?? last) ? 'var(--text)' : 'var(--dim)', fontWeight: i === (sel ?? last) ? 600 : 400, whiteSpace: 'nowrap', overflow: 'visible' }}>{i % every === 0 || i === buckets.length - 1 ? b.label : ''}</span>)}
        </div>
      </div>
    </div>
  );
}

export function GoalLegend({ lastYear = false }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, fontSize: 13, color: 'var(--muted)' }}>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--violet-bar)' }} />Meta atingida</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'var(--violet-dark)' }} />Abaixo da meta</span>
      <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 16, height: 2, background: 'var(--text)' }} />Meta do período</span>
      {lastYear && <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: '#5EEAD4' }} />Mesmo período do ano anterior</span>}
    </div>
  );
}
