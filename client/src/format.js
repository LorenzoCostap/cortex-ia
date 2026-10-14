export const brl = (v, digits = 0) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: digits, maximumFractionDigits: digits });
export const num = (v, d = 0) => (v ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d });
export function brlK(v) {
  const a = Math.abs(v || 0);
  const s = a >= 1e6 ? `${num(a / 1e6, 1)} mi` : a >= 1e3 ? `${num(a / 1e3, a >= 1e5 ? 0 : 1)} mil` : num(a);
  return `${v < 0 ? '−' : ''}R$ ${s}`;
}
export function delta(v, { pp = false, suffix = '' } = {}) {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  const arrow = v > 0 ? '▲' : v < 0 ? '▼' : '•';
  return `${arrow} ${num(Math.abs(v), 1)}${pp ? ' p.p.' : '%'}${suffix}`;
}
export const toneOf = (v, goodWhenUp = true) => (v === null || v === undefined || v === 0 ? '' : (v > 0) === goodWhenUp ? 'pos' : 'neg');
export const brDate = (s) => (s ? s.slice(0, 10).split('-').reverse().join('/') : '');
export function relTime(sqlUtc) {
  const d = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  const diff = (Date.now() - d) / 1000;
  if (diff < 60) return 'agora';
  if (diff < 3600) return `há ${Math.floor(diff / 60)} min`;
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  const hm = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === today.toDateString()) return `Hoje, ${hm}`;
  if (d.toDateString() === y.toDateString()) return `Ontem, ${hm}`;
  return `${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}, ${hm}`;
}
export function dayGroup(sqlUtc) {
  const d = new Date(sqlUtc.replace(' ', 'T') + 'Z');
  const today = new Date(); const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Hoje';
  if (d.toDateString() === y.toDateString()) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' });
}
export const initials = (name = '') => name.split(' ').filter(Boolean).slice(0, 2).map((p) => p[0]).join('').toUpperCase();
export const ROLE_LABEL = { admin: 'Administrador', gestor: 'Gestor', analista: 'Analista', visualizador: 'Visualizador' };
