// Datas tratadas como strings 'YYYY-MM-DD' e aritmética em UTC para evitar surpresas com fuso/horário de verão.

export const MONTHS_PT = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function todayStr() {
  if (process.env.CORTEX_TODAY) return process.env.CORTEX_TODAY;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export const toDate = (s) => new Date(s + 'T00:00:00Z');
export const fmt = (d) => d.toISOString().slice(0, 10);
export const addDays = (s, n) => { const d = toDate(s); d.setUTCDate(d.getUTCDate() + n); return fmt(d); };
export const monthKey = (s) => s.slice(0, 7);
export const monthStart = (s) => s.slice(0, 7) + '-01';
export function monthEnd(s) { const d = toDate(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return fmt(d); }
export function addMonths(s, n) { const d = toDate(monthStart(s)); d.setUTCMonth(d.getUTCMonth() + n); return fmt(d); }
export const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / 864e5);
export const weekday = (s) => toDate(s).getUTCDay();

export function monthLabel(s, short = false) {
  const d = toDate(monthStart(s));
  const m = d.getUTCMonth();
  return short ? MONTHS_SHORT[m] : `${MONTHS_PT[m][0].toUpperCase()}${MONTHS_PT[m].slice(1)} ${d.getUTCFullYear()}`;
}

export function brDate(s) { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; }

/** Último mês completo (o mês de referência padrão do dashboard). */
export function refMonth(today = todayStr()) { return addMonths(today, -1); }

/** Semana ISO (segunda a domingo) que contém a data. */
export function weekRange(s) {
  const wd = (weekday(s) + 6) % 7;
  const start = addDays(s, -wd);
  return { start, end: addDays(start, 6) };
}

export function isoWeek(s) {
  const d = toDate(s);
  const day = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - day + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((d - firstThursday) / 864e5 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
}

export function parseBr(s) {
  const m = String(s || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return fmt(toDate(iso)) === iso ? iso : null;
}

export function isIso(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && fmt(toDate(s)) === s; }
