import Database from 'better-sqlite3';
import { requestContext } from './context.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.CORTEX_DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(path.join(DATA_DIR, 'cortex.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  segment TEXT,
  cnpj TEXT,
  settings_json TEXT NOT NULL DEFAULT '{}',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'visualizador',
  status TEXT NOT NULL DEFAULT 'ativo',
  last_login TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, email)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  code TEXT,
  name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sku TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  price REAL NOT NULL,
  cost REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  total REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_orders_org_date ON orders(org_id, date);
CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  qty REAL NOT NULL,
  unit_price REAL NOT NULL,
  unit_cost REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_items_order ON order_items(order_id);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_expenses_org_date ON expenses(org_id, date);
CREATE TABLE IF NOT EXISTS bills (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  party TEXT NOT NULL,
  due_date TEXT NOT NULL,
  amount REAL NOT NULL,
  paid_at TEXT
);
CREATE TABLE IF NOT EXISTS goals (
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  revenue_target REAL NOT NULL,
  PRIMARY KEY (org_id, month)
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  period_label TEXT,
  mode TEXT NOT NULL DEFAULT 'manual',
  content_json TEXT NOT NULL,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ok',
  meta_json TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_org ON events(org_id, created_at);
CREATE TABLE IF NOT EXISTS insights (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  qkey TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  rows_json TEXT NOT NULL DEFAULT '[]',
  severity TEXT NOT NULL DEFAULT 'info',
  source TEXT NOT NULL DEFAULT 'auto',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  rule TEXT NOT NULL,
  category TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  text TEXT NOT NULL,
  link TEXT,
  cta TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  read_at TEXT,
  resolved_at TEXT,
  UNIQUE (org_id, key)
);
`);

// Migrações simples: colunas e tabelas adicionadas depois da primeira versão
function addColumn(table, column, type) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  if (!cols.includes(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
addColumn('customers', 'seller', 'TEXT');
addColumn('customers', 'region', 'TEXT');
addColumn('orders', 'seller', 'TEXT');
addColumn('orders', 'external_id', 'TEXT');
addColumn('users', 'must_change_password', 'INTEGER NOT NULL DEFAULT 0');
addColumn('events', 'ip', 'TEXT');
db.exec(`
CREATE TABLE IF NOT EXISTS goal_items (
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  month TEXT NOT NULL,
  dim TEXT NOT NULL,
  key TEXT NOT NULL,
  target REAL NOT NULL,
  PRIMARY KEY (org_id, month, dim, key)
);
CREATE TABLE IF NOT EXISTS imported_files (
  id INTEGER PRIMARY KEY,
  org_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  mtime INTEGER NOT NULL,
  status TEXT NOT NULL,
  rows INTEGER,
  message TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(org_id, path, mtime)
);
CREATE INDEX IF NOT EXISTS idx_orders_seller ON orders(org_id, seller);
`);

export const MODULES = ['dashboard', 'assistente', 'vendas', 'equipe', 'metas', 'fluxo', 'alertas', 'avisos', 'importacao', 'relatorios', 'historico', 'configuracoes', 'administracao'];
export const ROLES = ['admin', 'gestor', 'analista', 'visualizador'];

export const DEFAULT_SETTINGS = {
  ai: { url: 'http://localhost:11434', model: 'qwen2.5:7b', autoInsights: true, showTools: true },
  tv: { interval: 30, questionInterval: 10, goalPeriod: '12m', screens: { overview: true, ranking: true, vendas: true, clientes: true, financeiro: false, insights: true }, hideMoney: false, devices: [], notice: null },
  appearance: { theme: 'dark', animations: true },
  targets: { netMargin: 18 },
  cash: { balance: null, date: null, minimum: 0 },
  alerts: { rules: { cliente: true, meta: true, caixa: true, conta: true, produto: true }, metaPct: 95, productDrop: 35 },
  email: { enabled: false, time: '08:00', days: 'uteis', to: [], user: '', appPassword: '', lastSent: null },
  org: { currency: 'BRL', timezone: 'America/Sao_Paulo' },
  schedules: { weekly: { enabled: true, weekday: 1, hour: 8 }, monthly: { enabled: true, day: 1, hour: 9 } },
  security: { strongPassword: true, sessionHours: 12 },
  import: { watch: { enabled: false, path: '', intervalMin: 60 } },
  backup: { enabled: true, hour: 3, dir: '', keep: 30 },
  permissions: {
    dashboard: { admin: true, gestor: true, analista: true, visualizador: true },
    assistente: { admin: true, gestor: true, analista: true, visualizador: false },
    vendas: { admin: true, gestor: true, analista: true, visualizador: true },
    equipe: { admin: true, gestor: true, analista: true, visualizador: false },
    metas: { admin: true, gestor: true, analista: true, visualizador: false },
    fluxo: { admin: true, gestor: true, analista: false, visualizador: false },
    alertas: { admin: true, gestor: true, analista: true, visualizador: false },
    avisos: { admin: true, gestor: true, analista: false, visualizador: false },
    importacao: { admin: true, gestor: true, analista: false, visualizador: false },
    relatorios: { admin: true, gestor: true, analista: true, visualizador: false },
    historico: { admin: true, gestor: true, analista: false, visualizador: false },
    configuracoes: { admin: true, gestor: false, analista: false, visualizador: false },
    administracao: { admin: true, gestor: false, analista: false, visualizador: false }
  }
};

function deepMerge(base, extra) {
  if (Array.isArray(base) || typeof base !== 'object' || base === null) return extra === undefined ? base : extra;
  const out = { ...base };
  for (const k of Object.keys(extra || {})) {
    out[k] = extra[k] !== null && typeof base[k] === 'object' && base[k] !== null && !Array.isArray(base[k]) ? deepMerge(base[k], extra[k]) : extra[k];
  }
  return out;
}

export function getSettings(orgId) {
  const row = db.prepare('SELECT settings_json FROM organizations WHERE id = ?').get(orgId);
  return deepMerge(DEFAULT_SETTINGS, row ? JSON.parse(row.settings_json || '{}') : {});
}

export function saveSettings(orgId, patch) {
  const merged = deepMerge(getSettings(orgId), patch);
  merged.permissions.administracao.admin = true; // nunca trancar o admin para fora
  merged.permissions.configuracoes.admin = true;
  db.prepare('UPDATE organizations SET settings_json = ? WHERE id = ?').run(JSON.stringify(merged), orgId);
  return merged;
}

export function logEvent(orgId, userId, kind, title, status = 'ok', meta = null) {
  const ctx = requestContext();
  db.prepare('INSERT INTO events (org_id, user_id, kind, title, status, meta_json, ip) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(orgId, userId ?? null, kind, title, status, meta ? JSON.stringify(meta) : null, ctx?.ip || null);
}
