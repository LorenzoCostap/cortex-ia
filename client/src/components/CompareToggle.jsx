import { useState } from 'react';

const KEY = 'cortex.cmp';

/** Comparação dos indicadores: período anterior ou mesmo período do ano anterior (lembrado neste navegador). */
export function useCompare() {
  const [cmp, setState] = useState(() => { try { return localStorage.getItem(KEY) === 'ano' ? 'ano' : 'anterior'; } catch { return 'anterior'; } });
  const set = (v) => { setState(v); try { localStorage.setItem(KEY, v); } catch { /* sem storage */ } };
  return [cmp, set];
}

export default function CompareToggle({ value, onChange, prevLabel = 'Mês anterior' }) {
  return (
    <div className="seg" role="group" aria-label="Comparar com">
      <button type="button" aria-pressed={value === 'anterior'} onClick={() => onChange('anterior')}>vs {prevLabel.toLowerCase()}</button>
      <button type="button" aria-pressed={value === 'ano'} onClick={() => onChange('ano')}>vs ano anterior</button>
    </div>
  );
}
