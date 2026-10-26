import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { cashflow } from './cashflow.js';
import { customerDetail } from './customers.js';
import { contextMiddleware } from './context.js';
import { teamView } from './team.js';
import { RULES, refreshAlerts, listAlerts, unreadCount, maybeRefreshAlerts } from './alerts.js';
import { buildSummary, sendSummary } from './mailer.js';
import { db, getSettings, saveSettings, logEvent, MODULES, ROLES } from './db.js';
import { loadUser, requireAuth, requirePerm, can, createSession, destroySession, verifyPassword, hashPassword, passwordProblem } from './auth.js';
import * as M from './metrics.js';
import { ask, ollamaStatus, ollamaSpeed } from './ai.js';
import { QUESTIONS } from './answers.js';
import { subscribe, broadcast, tvCount, refreshInsights, getInsights, buildReport, saveReport, REPORT_TYPES, startScheduler, scanWatchFolder, watchStatus } from './services.js';
import { TYPES, readFile, detectType, autoMap, validate, commit, importAll, stash, unstash, drop } from './importer.js';
import { runBackup, listBackups, restoreBackup, defaultBackupDir } from './backup.js';
import { seedDemo, generateDemoData } from './seed.js';
import { isIso, refMonth, monthStart, monthEnd, todayStr, addMonths } from './dates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(contextMiddleware);
app.use('/api/import/preview', express.raw({ type: '*/*', limit: '60mb' }));
app.use(express.json({ limit: '1mb' }));
app.use(loadUser);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const org = (req) => req.user.org_id;

/* ---------- Autenticação ---------- */
app.get('/api/public/org', (req, res) => {
  const o = db.prepare('SELECT name, segment FROM organizations WHERE slug = ?').get(String(req.query.slug || '').toLowerCase().trim());
  if (!o) return res.status(404).json({ error: 'Organização não encontrada.' });
  res.json({ ...o, aiEnabled: getSettings(db.prepare('SELECT id FROM organizations WHERE slug = ?').get(String(req.query.slug || '').toLowerCase().trim()).id).ai.enabled !== false });
});

app.post('/api/auth/login', (req, res) => {
  const { org: slug, email, password, remember } = req.body || {};
  const o = db.prepare('SELECT id FROM organizations WHERE slug = ?').get(String(slug || '').toLowerCase().trim());
  const u = o && db.prepare('SELECT * FROM users WHERE org_id = ? AND email = ?').get(o.id, String(email || '').toLowerCase().trim());
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) {
    if (o) logEvent(o.id, u?.id ?? null, 'auth', `Tentativa de login falhou (${String(email || '').slice(0, 60)})`, 'erro');
    return res.status(401).json({ error: 'Organização, e-mail ou senha incorretos. Verifique os dados e tente novamente.' });
  }
  if (u.status === 'desativado') return res.status(403).json({ error: 'Este usuário foi desativado. Fale com o administrador.' });
  if (u.status === 'pendente') db.prepare("UPDATE users SET status = 'ativo' WHERE id = ?").run(u.id);
  createSession(res, u, !!remember);
  logEvent(o.id, u.id, 'auth', u.must_change_password ? 'Primeiro acesso (senha temporária)' : 'Entrou no sistema');
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => { if (req.user) logEvent(req.user.org_id, req.user.id, 'auth', 'Saiu do sistema'); destroySession(req, res); res.json({ ok: true }); });

app.get('/api/auth/me', requireAuth, (req, res) => {
  const s = getSettings(org(req));
  const permissions = Object.fromEntries(MODULES.map((m) => [m, can(req.user, m)]));
  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role, mustChangePassword: !!req.user.must_change_password },
    org: { slug: req.user.org_slug, name: req.user.org_name, segment: req.user.org_segment, isDemo: !!req.user.is_demo },
    permissions, tv: s.tv, appearance: s.appearance, showTools: s.ai.showTools, today: todayStr(), refMonth: refMonth(), aiEnabled: s.ai.enabled !== false
  });
});

app.post('/api/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT password_hash, must_change_password FROM users WHERE id = ?').get(req.user.id);
  // No primeiro acesso a pessoa acabou de entrar com a senha temporária: não pedimos de novo.
  if (!u.must_change_password && !verifyPassword(String(current || ''), u.password_hash)) return res.status(400).json({ error: 'Senha atual incorreta.' });
  const p = passwordProblem(next, getSettings(org(req)).security.strongPassword);
  if (p) return res.status(400).json({ error: p });
  if (verifyPassword(String(next), u.password_hash)) return res.status(400).json({ error: 'A nova senha precisa ser diferente da atual.' });
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?').run(hashPassword(next), req.user.id);
  logEvent(org(req), req.user.id, 'auth', u.must_change_password ? 'Criou a própria senha no primeiro acesso' : 'Trocou a senha');
  res.json({ ok: true });
});

/* ---------- Painéis ---------- */
app.get('/api/dashboard', requirePerm('dashboard'), (req, res) => {
  const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? `${req.query.month}-01` : undefined;
  res.json({ ...M.dashboard(org(req), m, req.query.cmp), forecast: M.forecast(org(req)), insights: getInsights(org(req)) });
});

app.get('/api/goal-series', requirePerm('dashboard'), (req, res) => {
  let { from, to } = req.query;
  if (!isIso(from) || !isIso(to) || from > to) { const r = refMonth(); from = addMonths(r, -11); to = monthEnd(r); }
  res.json(M.goalSeries(org(req), from, to));
});

app.get('/api/sales', requirePerm('vendas'), (req, res) => {
  let { from, to } = req.query;
  if (!isIso(from) || !isIso(to) || from > to) { const r = refMonth(); from = r; to = monthEnd(r); }
  res.json(M.salesView(org(req), from, to, req.query.cmp));
});

app.get('/api/insights', requireAuth, (req, res) => res.json({ questions: QUESTIONS, insights: getInsights(org(req)) }));
app.post('/api/insights/refresh', requirePerm('assistente'), wrap(async (req, res) => { await refreshInsights(org(req), { force: true }); res.json({ insights: getInsights(org(req)) }); }));

/* ---------- Assistente ---------- */
app.get('/api/ai/status', requireAuth, wrap(async (req, res) => res.json(await ollamaStatus(getSettings(org(req)).ai))));

app.get('/api/ai/recent', requirePerm('assistente'), (req, res) => {
  const rows = db.prepare("SELECT id, title, meta_json, created_at FROM events WHERE org_id = ? AND kind = 'ai' AND user_id = ? ORDER BY id DESC LIMIT 6").all(org(req), req.user.id);
  res.json(rows.map((r) => ({ id: r.id, question: r.title, createdAt: r.created_at, ...(r.meta_json ? JSON.parse(r.meta_json) : {}) })));
});

app.post('/api/ai/ask', requirePerm('assistente'), wrap(async (req, res) => {
  const question = String(req.body?.question || '').trim().slice(0, 1000);
  if (!question) return res.status(400).json({ error: 'Escreva uma pergunta.' });
  const history = (Array.isArray(req.body?.history) ? req.body.history : [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string').map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }));
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);
  const started = Date.now();
  try {
    const out = await ask({ org: org(req), orgName: req.user.org_name, ai: getSettings(org(req)).ai, question, history }, send);
    const ms = Date.now() - started;
    logEvent(org(req), req.user.id, 'ai', question, 'ok', { answer: out.answer, tools: out.tools, mode: out.mode, chart: out.chart || null, ms });
    send({ type: 'answer', ...out, ms });
  } catch (e) {
    logEvent(org(req), req.user.id, 'ai', question, 'erro', { error: e.message });
    send({ type: 'error', error: e.name === 'AbortError' ? 'A IA demorou demais para responder. Tente de novo ou use um modelo menor.' : `Erro ao falar com a IA: ${e.message}` });
  }
  res.end();
}));

/* ---------- TV ---------- */
app.get('/api/tv/stream', requireAuth, (req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.write('event: hello\ndata: {}\n\n');
  const off = subscribe(org(req), res);
  const ping = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => { clearInterval(ping); off(); });
});

app.get('/api/tv/data', requireAuth, (req, res) => {
  const o = org(req);
  const r = refMonth(), from = monthStart(r), to = monthEnd(r);
  const insights = getInsights(o);
  if (!insights.length) refreshInsights(o).catch(() => {});
  res.json({
    dashboard: M.dashboard(o, r), insights, settings: getSettings(o).tv,
    categories: M.categoryBreakdown(o, from, to), topCustomers: M.customersDeclining(o, from, to, 5),
    expenses: M.expensesByCategory(o, from, to), receivables: M.bills(o, 'receber', { days: 15 }).slice(0, 6), payables: M.bills(o, 'pagar', { days: 15 }).slice(0, 6),
    payables7: M.bills(o, 'pagar', { days: 7 }).reduce((s, b) => s + b.amount, 0),
    forecast: M.forecast(o), targets: getSettings(o).targets, ranking: teamView(o), budget: M.budgetSummary(o, r), aiEnabled: getSettings(o).ai.enabled !== false,
    cashflow: (() => { const c = cashflow(o, 90); return c.hasBalance ? { balance: c.balance, minimum: c.minimum, endBalance: c.endBalance, minBalance: c.minBalance, firstBelow: c.firstBelow, weeks: c.weeks.map((w) => ({ label: w.label, balance: w.balance })) } : null; })()
  });
});

app.post('/api/tv/push', requirePerm('assistente'), (req, res) => {
  const { question, answer, rows } = req.body || {};
  if (!question || !answer) return res.status(400).json({ error: 'Nada para enviar.' });
  broadcast(org(req), 'push', { question: String(question).slice(0, 500), answer: String(answer).slice(0, 3000), rows: Array.isArray(rows) ? rows.slice(0, 4) : [], by: req.user.name, at: new Date().toISOString() });
  logEvent(org(req), req.user.id, 'tv', `Enviado para a TV: ${String(question).slice(0, 120)}`, 'tv');
  res.json({ ok: true, screens: tvCount(org(req)) });
});

/* ---------- Relatórios ---------- */
app.get('/api/reports', requirePerm('relatorios'), (req, res) => {
  res.json({ types: REPORT_TYPES, schedules: getSettings(org(req)).schedules, reports: db.prepare('SELECT id, type, title, period_label, mode, created_at FROM reports WHERE org_id = ? ORDER BY id DESC LIMIT 50').all(org(req)) });
});
app.get('/api/reports/:id', requirePerm('relatorios'), (req, res) => {
  const r = db.prepare('SELECT * FROM reports WHERE org_id = ? AND id = ?').get(org(req), +req.params.id);
  if (!r) return res.status(404).json({ error: 'Relatório não encontrado.' });
  res.json({ ...r, content: JSON.parse(r.content_json), content_json: undefined });
});
app.post('/api/reports', requirePerm('relatorios'), (req, res) => {
  const { type, from, to } = req.body || {};
  if (!REPORT_TYPES[type]) return res.status(400).json({ error: 'Tipo de relatório inválido.' });
  const id = saveReport(org(req), req.user.id, buildReport(org(req), type, { from, to }));
  res.json({ id });
});
app.delete('/api/reports/:id', requirePerm('relatorios'), (req, res) => {
  db.prepare('DELETE FROM reports WHERE org_id = ? AND id = ?').run(org(req), +req.params.id);
  res.json({ ok: true });
});
app.put('/api/reports/schedules', requirePerm('relatorios'), (req, res) => {
  const s = req.body || {};
  const clean = {};
  if (s.weekly) clean.weekly = { enabled: !!s.weekly.enabled };
  if (s.monthly) clean.monthly = { enabled: !!s.monthly.enabled };
  res.json(saveSettings(org(req), { schedules: clean }).schedules);
});

/* ---------- Histórico ---------- */
app.get('/api/history', requirePerm('historico'), (req, res) => {
  const kinds = { ai: ['ai'], report: ['report'], import: ['import'], config: ['config', 'auth', 'tv', 'admin'], auditoria: ['auth', 'admin', 'config', 'tv', 'import'] };
  const k = kinds[req.query.kind];
  const q = `%${String(req.query.q || '').trim()}%`;
  const user = +req.query.user || null;
  const limit = Math.min(5000, Math.max(1, +req.query.limit || 200));
  const rows = db.prepare(`
    SELECT e.id, e.kind, e.title, e.status, e.meta_json, e.created_at, e.ip, e.user_id, u.name user_name, u.email user_email
    FROM events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.org_id = ? ${k ? `AND e.kind IN (${k.map(() => '?').join(',')})` : ''} ${user ? 'AND e.user_id = ?' : ''} AND e.title LIKE ?
    ORDER BY e.id DESC LIMIT ?`).all(org(req), ...(k || []), ...(user ? [user] : []), q, limit);
  const counts = Object.fromEntries(db.prepare('SELECT kind, COUNT(*) n FROM events WHERE org_id = ? GROUP BY kind').all(org(req)).map((r) => [r.kind, r.n]));
  const failed = db.prepare("SELECT COUNT(*) n FROM events WHERE org_id = ? AND kind = 'auth' AND status = 'erro' AND created_at >= datetime('now', '-7 days')").get(org(req)).n;
  const users = db.prepare('SELECT id, name FROM users WHERE org_id = ? ORDER BY name').all(org(req));
  res.json({ events: rows.map((r) => ({ ...r, meta: r.meta_json ? JSON.parse(r.meta_json) : null, meta_json: undefined })), counts, users, failedLogins7d: failed });
});

/* ---------- Configurações ---------- */
app.get('/api/settings', requirePerm('configuracoes'), (req, res) => {
  const o = db.prepare('SELECT slug, name, segment, cnpj FROM organizations WHERE id = ?').get(org(req));
  const settings = getSettings(org(req));
  settings.email = { ...settings.email, appPassword: settings.email.appPassword ? '••••' : '' }; // a senha de app nunca sai do servidor
  res.json({ org: o, settings });
});

app.put('/api/settings', requirePerm('configuracoes'), (req, res) => {
  const { org: o, ai, tv, appearance } = req.body || {};
  if (o) {
    const slug = String(o.slug || '').toLowerCase().trim();
    if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) return res.status(400).json({ error: 'Identificador de login inválido: use letras minúsculas, números e hífen.' });
    if (db.prepare('SELECT 1 FROM organizations WHERE slug = ? AND id != ?').get(slug, org(req))) return res.status(400).json({ error: 'Esse identificador já é usado por outra organização.' });
    if (!String(o.name || '').trim()) return res.status(400).json({ error: 'Informe o nome da organização.' });
    db.prepare('UPDATE organizations SET slug = ?, name = ?, segment = ?, cnpj = ? WHERE id = ?').run(slug, String(o.name).trim(), o.segment || null, o.cnpj || null, org(req));
  }
  const patch = {};
  if (ai) patch.ai = { enabled: ai.enabled !== false, url: String(ai.url || '').trim() || 'http://localhost:11434', model: String(ai.model || '').trim() || 'qwen2.5:7b', autoInsights: !!ai.autoInsights, showTools: !!ai.showTools };
  if (tv) patch.tv = { interval: Math.min(300, Math.max(30, +tv.interval || 30)), questionInterval: Math.min(30, Math.max(5, +tv.questionInterval || 10)), goalPeriod: ['7d', '30d', 'tri', '12m'].includes(tv.goalPeriod) ? tv.goalPeriod : '12m', screens: tv.screens, hideMoney: !!tv.hideMoney, devices: cleanDevices(tv.devices) };
  const imp = req.body?.import, bk = req.body?.backup;
  if (imp?.watch) patch.import = { watch: { enabled: !!imp.watch.enabled, path: String(imp.watch.path || '').trim(), intervalMin: [15, 30, 60, 180, 720, 1440].includes(+imp.watch.intervalMin) ? +imp.watch.intervalMin : 60 } };
  if (bk) patch.backup = { enabled: !!bk.enabled, hour: Math.min(23, Math.max(0, +bk.hour || 0)), dir: String(bk.dir || '').trim(), keep: Math.min(365, Math.max(1, +bk.keep || 30)) };
  if (appearance) patch.appearance = { theme: ['dark', 'light', 'system'].includes(appearance.theme) ? appearance.theme : 'dark', animations: !!appearance.animations };
  const s = saveSettings(org(req), patch);
  logEvent(org(req), req.user.id, 'config', 'Configurações da organização atualizadas');
  broadcast(org(req), 'settings', { tv: s.tv });
  res.json({ settings: s });
});

app.post('/api/settings/test-ai', requirePerm('configuracoes'), wrap(async (req, res) => {
  const ai = { ...getSettings(org(req)).ai, ...(req.body || {}) };
  if (ai.enabled === false) return res.status(400).json({ error: 'A IA está desligada nesta organização.' });
  const st = await ollamaStatus(ai);
  if (!st.online) return res.json(st);
  if (!st.hasModel) return res.json({ ...st, error: `O modelo "${ai.model}" não está instalado. Rode: ollama pull ${ai.model}` });
  try { res.json({ ...st, ...(await ollamaSpeed(ai)) }); } catch (e) { res.json({ ...st, error: e.message }); }
}));

/* ---------- Administração ---------- */
app.get('/api/users', requirePerm('administracao'), (req, res) => {
  const s = getSettings(org(req));
  res.json({
    users: db.prepare('SELECT id, name, email, role, status, last_login, created_at FROM users WHERE org_id = ? ORDER BY id').all(org(req)),
    permissions: s.permissions, security: { ...s.security, hideMoney: s.tv.hideMoney }, modules: MODULES, roles: ROLES, me: req.user.id, tvScreens: tvCount(org(req))
  });
});

const tempPassword = () => `cortex-${Math.random().toString(36).slice(2, 6)}${Math.floor(10 + Math.random() * 89)}`;

app.post('/api/users', requirePerm('administracao'), (req, res) => {
  const { name, email, role } = req.body || {};
  const e = String(email || '').toLowerCase().trim();
  if (!String(name || '').trim() || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return res.status(400).json({ error: 'Informe nome e um e-mail válido.' });
  if (!ROLES.includes(role)) return res.status(400).json({ error: 'Papel inválido.' });
  if (db.prepare('SELECT 1 FROM users WHERE org_id = ? AND email = ?').get(org(req), e)) return res.status(400).json({ error: 'Já existe um usuário com esse e-mail.' });
  const pw = tempPassword();
  db.prepare('INSERT INTO users (org_id, name, email, password_hash, role, status, must_change_password) VALUES (?, ?, ?, ?, ?, ?, 1)').run(org(req), String(name).trim(), e, hashPassword(pw), role, 'pendente');
  logEvent(org(req), req.user.id, 'admin', `Usuário convidado: ${String(name).trim()}`, 'ok', { email: e, papel: role });
  res.json({ ok: true, tempPassword: pw });
});

app.patch('/api/users/:id', requirePerm('administracao'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE org_id = ? AND id = ?').get(org(req), +req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const { role, status, name } = req.body || {};
  if (u.id === req.user.id && ((role && role !== 'admin') || status === 'desativado')) return res.status(400).json({ error: 'Você não pode rebaixar ou desativar a si mesmo.' });
  if (role && !ROLES.includes(role)) return res.status(400).json({ error: 'Papel inválido.' });
  if (status && !['ativo', 'pendente', 'desativado'].includes(status)) return res.status(400).json({ error: 'Status inválido.' });
  db.prepare('UPDATE users SET role = COALESCE(?, role), status = COALESCE(?, status), name = COALESCE(?, name) WHERE id = ?').run(role || null, status || null, name || null, u.id);
  if (status === 'desativado') db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  const changes = {};
  if (role && role !== u.role) changes.papel = [u.role, role];
  if (status && status !== u.status) changes.status = [u.status, status];
  if (name && name !== u.name) changes.nome = [u.name, name];
  logEvent(org(req), req.user.id, 'admin', `Usuário atualizado: ${u.name}`, 'ok', Object.keys(changes).length ? { alteracoes: changes } : null);
  res.json({ ok: true });
});

app.post('/api/users/:id/reset-password', requirePerm('administracao'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE org_id = ? AND id = ?').get(org(req), +req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const pw = tempPassword();
  db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1 WHERE id = ?').run(hashPassword(pw), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  logEvent(org(req), req.user.id, 'admin', `Senha redefinida: ${u.name}`);
  res.json({ ok: true, tempPassword: pw });
});

app.put('/api/permissions', requirePerm('administracao'), (req, res) => {
  const m = req.body?.permissions || {};
  const clean = Object.fromEntries(MODULES.map((mod) => [mod, Object.fromEntries(ROLES.map((r) => [r, r === 'admin' ? true : !!m[mod]?.[r]]))]));
  const sec = req.body?.security;
  const before = getSettings(org(req)).permissions;
  const diff = [];
  for (const mod of MODULES) for (const r of ROLES) if (!!before[mod]?.[r] !== clean[mod][r]) diff.push(`${mod}/${r}: ${clean[mod][r] ? 'liberado' : 'bloqueado'}`);
  const s = saveSettings(org(req), { permissions: clean, ...(sec ? { security: { strongPassword: !!sec.strongPassword, sessionHours: [8, 12, 24, 72].includes(+sec.sessionHours) ? +sec.sessionHours : 12 }, tv: { hideMoney: !!sec.hideMoney } } : {}) });
  logEvent(org(req), req.user.id, 'admin', 'Permissões atualizadas', 'ok', diff.length ? { alteracoes: diff } : null);
  res.json({ permissions: s.permissions, security: s.security });
});

/* ---------- Importação ---------- */
app.get('/api/import/types', requirePerm('importacao'), (req, res) => {
  res.json(Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { label: t.label, fields: t.fields.map(({ key, label, required }) => ({ key, label, required: !!required })) }])));
});

app.post('/api/import/preview', requirePerm('importacao'), wrap(async (req, res) => {
  const filename = decodeURIComponent(String(req.headers['x-filename'] || 'planilha.csv'));
  if (!req.body?.length) return res.status(400).json({ error: 'Arquivo vazio.' });
  let parsed;
  try { parsed = await readFile(req.body, filename); } catch (e) { return res.status(400).json({ error: e.message }); }
  const type = detectType(parsed.headers);
  const token = stash(org(req), filename, parsed);
  res.json({ token, filename, type, headers: parsed.headers, sample: parsed.rows.slice(0, 5), rowCount: parsed.rows.length, mapping: autoMap(type, parsed.headers), mappings: Object.fromEntries(Object.keys(TYPES).map((t) => [t, autoMap(t, parsed.headers)])), sheets: parsed.sheets?.map((sh) => ({ name: sh.name, type: sh.type, label: TYPES[sh.type].label, rowCount: sh.rows.length })) });
}));

const cleanMapping = (m) => Object.fromEntries(Object.entries(m || {}).filter(([, v]) => v !== '' && v !== null && v !== undefined).map(([k, v]) => [k, +v]));

app.post('/api/import/validate', requirePerm('importacao'), (req, res) => {
  try {
    const p = unstash(org(req), req.body?.token);
    const v = validate(req.body.type, p.rows, cleanMapping(req.body.mapping));
    res.json({ ...v, valid: undefined, validCount: v.valid.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/import/commit', requirePerm('importacao'), (req, res) => {
  try {
    const p = unstash(org(req), req.body?.token);
    const v = validate(req.body.type, p.rows, cleanMapping(req.body.mapping));
    if (v.missing.length) return res.status(400).json({ error: `Faltam colunas obrigatórias: ${v.missing.join(', ')}` });
    if (!v.valid.length) return res.status(400).json({ error: 'Nenhuma linha válida para importar.' });
    const r = commit(org(req), req.user.id, req.body.type, v.valid, { mode: req.body.mode === 'replace' ? 'replace' : 'append', filename: p.filename });
    drop(req.body.token);
    refreshInsights(org(req), { force: true }).catch(() => {});
    try { refreshAlerts(org(req)); } catch { /* alertas são recalculados depois pelo agendador */ }
    res.json({ ...r, errorCount: v.errorCount });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/import/commit-all', requirePerm('importacao'), (req, res) => {
  try {
    const p = unstash(org(req), req.body?.token);
    if (!p.sheets?.length) return res.status(400).json({ error: 'Este arquivo não tem várias abas reconhecidas.' });
    const r = importAll(org(req), req.user.id, p.sheets, { filename: p.filename });
    drop(req.body.token);
    refreshInsights(org(req), { force: true }).catch(() => {});
    try { refreshAlerts(org(req)); } catch { /* alertas são recalculados depois pelo agendador */ }
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.put('/api/import/settings', requirePerm('importacao'), (req, res) => {
  const { watch, backup } = req.body || {};
  const patch = {};
  if (watch) patch.import = { watch: { enabled: !!watch.enabled, path: String(watch.path || '').trim(), intervalMin: [15, 30, 60, 180, 720, 1440].includes(+watch.intervalMin) ? +watch.intervalMin : 60 } };
  if (backup) patch.backup = { enabled: !!backup.enabled, hour: Math.min(23, Math.max(0, +backup.hour || 0)), dir: String(backup.dir || '').trim(), keep: Math.min(365, Math.max(1, +backup.keep || 30)) };
  if (patch.import?.watch.enabled && patch.import.watch.path && !fs.existsSync(patch.import.watch.path)) return res.status(400).json({ error: 'Essa pasta não existe neste computador.' });
  const s = saveSettings(org(req), patch);
  logEvent(org(req), req.user.id, 'config', watch ? 'Pasta monitorada atualizada' : 'Configuração de backup atualizada');
  res.json({ import: s.import, backup: s.backup });
});

app.get('/api/import/watch', requirePerm('importacao'), (req, res) => res.json({ settings: getSettings(org(req)).import.watch, ...watchStatus(org(req)) }));
app.post('/api/import/watch/scan', requirePerm('importacao'), wrap(async (req, res) => res.json(await scanWatchFolder(org(req), { force: true }))));

/* ---------- Backup ---------- */
app.get('/api/backup', requirePerm('importacao'), (req, res) => {
  const b = getSettings(org(req)).backup;
  res.json({ settings: b, defaultDir: defaultBackupDir(), backups: listBackups(b.dir).slice(0, 20) });
});
app.post('/api/backup/run', requirePerm('importacao'), wrap(async (req, res) => {
  const b = getSettings(org(req)).backup;
  try {
    const r = await runBackup(b.dir, b.keep);
    logEvent(org(req), req.user.id, 'config', `Backup manual criado: ${r.file}`);
    res.json(r);
  } catch (e) { res.status(400).json({ error: `Não foi possível salvar o backup: ${e.message}` }); }
}));
app.post('/api/backup/restore', requirePerm('administracao'), wrap(async (req, res) => {
  const b = getSettings(org(req)).backup;
  try {
    const r = await restoreBackup(b.dir, String(req.body?.file || ''));
    try { logEvent(org(req), req.user.id, 'config', `Backup restaurado: ${r.restored}`); } catch { /* a organização pode não existir no backup */ }
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

/* ---------- Metas ---------- */
app.get('/api/goals', requirePerm('metas'), (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : todayStr().slice(0, 7);
  res.json({ month, months: M.goalsOverview(org(req)), forecast: M.forecast(org(req), `${month}-01`), vendedor: M.goalItems(org(req), month, 'vendedor'), categoria: M.goalItems(org(req), month, 'categoria'), despesa: M.goalItems(org(req), month, 'despesa') });
});

app.put('/api/goals', requirePerm('metas'), (req, res) => {
  const { months = [], items = [] } = req.body || {};
  const ok = (m) => /^\d{4}-\d{2}$/.test(m);
  db.transaction(() => {
    for (const g of months) {
      if (!ok(g.month)) continue;
      if (g.target === null || g.target === '' || g.target === undefined) db.prepare('DELETE FROM goals WHERE org_id = ? AND month = ?').run(org(req), g.month);
      else if (+g.target >= 0) db.prepare('INSERT INTO goals (org_id, month, revenue_target) VALUES (?, ?, ?) ON CONFLICT(org_id, month) DO UPDATE SET revenue_target = excluded.revenue_target').run(org(req), g.month, +g.target);
    }
    for (const it of items) {
      if (!ok(it.month) || !['vendedor', 'categoria', 'despesa'].includes(it.dim) || !it.key) continue;
      if (it.target === null || it.target === '') db.prepare('DELETE FROM goal_items WHERE org_id = ? AND month = ? AND dim = ? AND key = ?').run(org(req), it.month, it.dim, it.key);
      else db.prepare('INSERT INTO goal_items (org_id, month, dim, key, target) VALUES (?, ?, ?, ?, ?) ON CONFLICT(org_id, month, dim, key) DO UPDATE SET target = excluded.target').run(org(req), it.month, it.dim, String(it.key), +it.target);
    }
  })();
  logEvent(org(req), req.user.id, 'config', 'Metas atualizadas');
  res.json({ ok: true });
});

app.post('/api/goals/copy-last-year', requirePerm('metas'), (req, res) => {
  const pct = Math.max(-50, Math.min(100, +req.body?.percent || 0));
  const out = [];
  for (const g of M.goalsOverview(org(req)).filter((m) => m.status !== 'fechado')) {
    const ly = `${+g.month.slice(0, 4) - 1}${g.month.slice(4)}`;
    const base = db.prepare('SELECT COALESCE(SUM(total),0) v FROM orders WHERE org_id = ? AND substr(date,1,7) = ?').get(org(req), ly).v;
    if (base > 0) out.push({ month: g.month, target: Math.round((base * (1 + pct / 100)) / 1000) * 1000 });
  }
  res.json({ suggestions: out });
});

/* ---------- Equipe ---------- */
app.get('/api/team', requirePerm('equipe'), (req, res) => {
  const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? `${req.query.month}-01` : undefined;
  res.json(teamView(org(req), m));
});

/* ---------- Aviso fixo nas TVs ---------- */
const SCREEN_KEYS = ['overview', 'ranking', 'vendas', 'clientes', 'financeiro', 'insights'];
function cleanDevices(list) {
  if (!Array.isArray(list)) return [];
  return list.slice(0, 20).map((d) => ({
    id: /^[a-z0-9-]{2,40}$/.test(d.id || '') ? d.id : String(d.name || 'tv').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `tv-${Math.random().toString(36).slice(2, 7)}`,
    name: String(d.name || 'TV').trim().slice(0, 40),
    screens: Object.fromEntries(SCREEN_KEYS.map((k) => [k, !!d.screens?.[k]]))
  })).filter((d, i, a) => a.findIndex((x) => x.id === d.id) === i);
}
app.put('/api/tv/notice', requirePerm('avisos'), (req, res) => {
  const text = String(req.body?.text || '').trim().slice(0, 160);
  if (!text) return res.status(400).json({ error: 'Escreva o aviso.' });
  const minutes = +req.body?.minutes || 0;
  let until = null;
  if (minutes > 0) until = new Date(Date.now() + Math.min(minutes, 7 * 24 * 60) * 60e3).toISOString();
  if (req.body?.endOfDay) { const d = new Date(); d.setHours(23, 59, 0, 0); until = d.toISOString(); }
  const devices = Array.isArray(req.body?.devices) ? req.body.devices.map(String).slice(0, 20) : [];
  const notice = { text, until, by: req.user.name, at: new Date().toISOString(), devices };
  saveSettings(org(req), { tv: { notice } });
  broadcast(org(req), 'notice', notice);
  logEvent(org(req), req.user.id, 'tv', `Aviso na TV: ${text}`, 'tv', { ate: until, telas: devices.length ? devices : 'todas' });
  res.json(notice);
});
app.delete('/api/tv/notice', requirePerm('avisos'), (req, res) => {
  saveSettings(org(req), { tv: { notice: null } });
  broadcast(org(req), 'notice', null);
  logEvent(org(req), req.user.id, 'tv', 'Aviso da TV removido', 'tv');
  res.json({ ok: true });
});
app.get('/api/tv/notice', requireAuth, (req, res) => {
  const s = getSettings(org(req)).tv;
  res.json({ notice: s.notice, devices: s.devices.map(({ id, name }) => ({ id, name })), screens: tvCount(org(req)) });
});

/* ---------- Alertas e resumo diário ---------- */
app.get('/api/alerts', requirePerm('alertas'), (req, res) => {
  if (req.query.refresh) refreshAlerts(org(req)); else maybeRefreshAlerts(org(req));
  const s = getSettings(org(req));
  res.json({ alerts: listAlerts(org(req)), unread: unreadCount(org(req)), rules: RULES, config: s.alerts, cashMinimum: s.cash.minimum, canEdit: can(req.user, 'configuracoes') });
});
app.get('/api/alerts/count', requireAuth, (req, res) => {
  if (!can(req.user, 'alertas')) return res.json({ unread: 0 });
  maybeRefreshAlerts(org(req));
  res.json({ unread: unreadCount(org(req)) });
});
app.post('/api/alerts/read-all', requirePerm('alertas'), (req, res) => {
  db.prepare("UPDATE alerts SET read_at = datetime('now') WHERE org_id = ? AND read_at IS NULL AND resolved_at IS NULL").run(org(req));
  res.json({ ok: true });
});
app.post('/api/alerts/:id/read', requirePerm('alertas'), (req, res) => {
  db.prepare("UPDATE alerts SET read_at = CASE WHEN ? THEN NULL ELSE datetime('now') END WHERE id = ? AND org_id = ?").run(req.body?.unread ? 1 : 0, +req.params.id, org(req));
  res.json({ ok: true });
});
app.put('/api/alerts/config', requirePerm('configuracoes'), (req, res) => {
  const b = req.body || {};
  const rules = Object.fromEntries(RULES.map((r) => [r.key, b.rules?.[r.key] !== false]));
  const clamp = (v, lo, hi, d) => (Number.isFinite(+v) ? Math.min(hi, Math.max(lo, +v)) : d);
  saveSettings(org(req), { alerts: { rules, metaPct: clamp(b.metaPct, 50, 100, 95), productDrop: clamp(b.productDrop, 10, 90, 35) } });
  refreshAlerts(org(req));
  logEvent(org(req), req.user.id, 'config', 'Regras de alerta atualizadas');
  res.json({ ok: true });
});

const publicEmail = (e) => ({ enabled: e.enabled, time: e.time, days: e.days, to: e.to, user: e.user, hasPassword: !!e.appPassword, lastSent: e.lastSent });
const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
app.get('/api/email', requirePerm('alertas'), (req, res) => {
  res.json({ ...publicEmail(getSettings(org(req)).email), preview: buildSummary(org(req), { name: req.user.name, baseUrl: baseUrl(req) }) });
});
app.put('/api/email', requirePerm('configuracoes'), (req, res) => {
  const b = req.body || {};
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const to = (Array.isArray(b.to) ? b.to : []).map((x) => String(x).trim().toLowerCase()).filter(Boolean);
  const bad = to.find((x) => !emailRe.test(x)) || (b.user && !emailRe.test(b.user) ? b.user : null);
  if (bad) return res.status(400).json({ error: `E-mail inválido: ${bad}` });
  if (b.time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(b.time)) return res.status(400).json({ error: 'Horário inválido.' });
  const patch = { enabled: !!b.enabled, time: b.time || '08:00', days: b.days === 'todos' ? 'todos' : 'uteis', to: [...new Set(to)], user: String(b.user || '').trim() };
  if (typeof b.appPassword === 'string' && b.appPassword.trim()) patch.appPassword = b.appPassword.replace(/\s/g, '');
  if (b.clearPassword) patch.appPassword = '';
  const s = saveSettings(org(req), { email: patch });
  logEvent(org(req), req.user.id, 'config', `Resumo diário ${patch.enabled ? 'ligado' : 'desligado'}`);
  res.json(publicEmail(s.email));
});
app.post('/api/email/test', requirePerm('configuracoes'), wrap(async (req, res) => {
  const to = String(req.body?.to || req.user.email);
  try {
    const r = await sendSummary(org(req), to, { name: req.user.name, baseUrl: baseUrl(req) });
    logEvent(org(req), req.user.id, 'report', `E-mail de teste enviado para ${to}`);
    res.json(r);
  } catch (e) { res.status(400).json({ error: e.message }); }
}));

/* ---------- Clientes ---------- */
app.get('/api/customers/:id', requirePerm('vendas'), (req, res) => {
  const c = customerDetail(org(req), req.params.id);
  if (!c) return res.status(404).json({ error: 'Cliente não encontrado.' });
  res.json(c);
});

/* ---------- Fluxo de caixa ---------- */
app.get('/api/cashflow', requirePerm('fluxo'), (req, res) => res.json(cashflow(org(req), req.query.h)));

app.put('/api/cashflow/settings', requirePerm('fluxo'), (req, res) => {
  const { balance, minimum } = req.body || {};
  const num = (v) => (v === null || v === '' || v === undefined ? null : Number(v));
  const b = num(balance), m = num(minimum);
  if ((b !== null && !Number.isFinite(b)) || (m !== null && (!Number.isFinite(m) || m < 0))) return res.status(400).json({ error: 'Valores inválidos.' });
  saveSettings(org(req), { cash: { balance: b, date: b === null ? null : todayStr(), minimum: m ?? 0 } });
  logEvent(org(req), req.user.id, 'config', b === null ? 'Saldo de caixa removido' : `Saldo de caixa atualizado para R$ ${Math.round(b).toLocaleString('pt-BR')}`);
  res.json(cashflow(org(req), req.query.h));
});

app.post('/api/bills/:id/pay', requirePerm('fluxo'), (req, res) => {
  const b = db.prepare('SELECT * FROM bills WHERE id = ? AND org_id = ? AND paid_at IS NULL').get(+req.params.id, org(req));
  if (!b) return res.status(404).json({ error: 'Conta não encontrada ou já baixada.' });
  db.prepare('UPDATE bills SET paid_at = ? WHERE id = ?').run(todayStr(), b.id);
  // Pagar ou receber mexe no saldo informado.
  const cash = getSettings(org(req)).cash;
  if (typeof cash.balance === 'number') saveSettings(org(req), { cash: { balance: cash.balance + (b.kind === 'pagar' ? -b.amount : b.amount), date: todayStr() } });
  logEvent(org(req), req.user.id, 'config', `${b.kind === 'pagar' ? 'Pagamento' : 'Recebimento'} baixado: ${b.party} (R$ ${Math.round(b.amount).toLocaleString('pt-BR')})`);
  res.json({ ok: true });
});

/* ---------- Dados ---------- */
app.get('/api/data/status', requireAuth, (req, res) => {
  const c = (t) => db.prepare(`SELECT COUNT(*) n FROM ${t} WHERE org_id = ?`).get(org(req)).n;
  res.json({ isDemo: !!req.user.is_demo, orders: c('orders'), customers: c('customers'), products: c('products'), expenses: c('expenses') });
});

app.post('/api/data/reset-demo', requirePerm('importacao'), wrap(async (req, res) => {
  generateDemoData(org(req));
  for (const t of ['dre', 'executivo']) saveReport(org(req), null, buildReport(org(req), t), 'agendado');
  db.prepare('UPDATE organizations SET is_demo = 1 WHERE id = ?').run(org(req));
  logEvent(org(req), req.user.id, 'import', 'Dados de demonstração gerados novamente', 'ok');
  refreshInsights(org(req), { force: true }).catch(() => {});
  try { refreshAlerts(org(req)); } catch { /* idem */ }
  res.json({ ok: true });
}));

/* ---------- Erros e frontend ---------- */
app.use('/api', (req, res) => res.status(404).json({ error: 'Rota não encontrada.' }));
app.use((err, req, res, _next) => {
  console.error(err);
  if (res.headersSent) return res.end();
  res.status(500).json({ error: 'Erro interno. Veja o terminal do servidor.' });
});

const dist = path.join(__dirname, '..', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist, { index: false }));
  app.get('*', (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

if (!db.prepare('SELECT 1 FROM organizations LIMIT 1').get()) {
  console.log('Primeira execução: criando a empresa de demonstração…');
  const id = seedDemo();
  for (const t of ['dre', 'executivo']) saveReport(id, null, buildReport(id, t), 'agendado');
}

const PORT = +process.env.PORT || 3210;
const HOST = process.env.HOST || '0.0.0.0';
app.listen(PORT, HOST, () => {
  const lan = Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i.address);
  console.log(`\n  CORTEX IA rodando`);
  console.log(`  Neste computador:  http://localhost:${PORT}`);
  lan.forEach((ip) => console.log(`  Na rede (TVs):     http://${ip}:${PORT}`));
  console.log(`  Modo TV:           http://localhost:${PORT}/tv\n`);
  if (process.env.NO_SCHEDULER !== '1') startScheduler();
});
