import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { db, getSettings, saveSettings, logEvent, MODULES, ROLES } from './db.js';
import { loadUser, requireAuth, requirePerm, can, createSession, destroySession, verifyPassword, hashPassword, passwordProblem } from './auth.js';
import * as M from './metrics.js';
import { ask, ollamaStatus, ollamaSpeed } from './ai.js';
import { QUESTIONS } from './answers.js';
import { subscribe, broadcast, tvCount, refreshInsights, getInsights, buildReport, saveReport, REPORT_TYPES, startScheduler } from './services.js';
import { seedDemo, generateDemoData } from './seed.js';
import { isIso, refMonth, monthStart, monthEnd, todayStr, addMonths } from './dates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(loadUser);

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const org = (req) => req.user.org_id;

/* ---------- Autenticação ---------- */
app.get('/api/public/org', (req, res) => {
  const o = db.prepare('SELECT name, segment FROM organizations WHERE slug = ?').get(String(req.query.slug || '').toLowerCase().trim());
  if (!o) return res.status(404).json({ error: 'Organização não encontrada.' });
  res.json(o);
});

app.post('/api/auth/login', (req, res) => {
  const { org: slug, email, password, remember } = req.body || {};
  const o = db.prepare('SELECT id FROM organizations WHERE slug = ?').get(String(slug || '').toLowerCase().trim());
  const u = o && db.prepare('SELECT * FROM users WHERE org_id = ? AND email = ?').get(o.id, String(email || '').toLowerCase().trim());
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) {
    if (o) logEvent(o.id, null, 'auth', `Tentativa de login falhou (${String(email || '').slice(0, 60)})`, 'erro');
    return res.status(401).json({ error: 'Organização, e-mail ou senha incorretos. Verifique os dados e tente novamente.' });
  }
  if (u.status === 'desativado') return res.status(403).json({ error: 'Este usuário foi desativado. Fale com o administrador.' });
  if (u.status === 'pendente') db.prepare("UPDATE users SET status = 'ativo' WHERE id = ?").run(u.id);
  createSession(res, u, !!remember);
  res.json({ ok: true });
});

app.post('/api/auth/logout', (req, res) => { destroySession(req, res); res.json({ ok: true }); });

app.get('/api/auth/me', requireAuth, (req, res) => {
  const s = getSettings(org(req));
  const permissions = Object.fromEntries(MODULES.map((m) => [m, can(req.user, m)]));
  res.json({
    user: { id: req.user.id, name: req.user.name, email: req.user.email, role: req.user.role },
    org: { slug: req.user.org_slug, name: req.user.org_name, segment: req.user.org_segment, isDemo: !!req.user.is_demo },
    permissions, tv: s.tv, appearance: s.appearance, showTools: s.ai.showTools, today: todayStr(), refMonth: refMonth()
  });
});

app.post('/api/auth/password', requireAuth, (req, res) => {
  const { current, next } = req.body || {};
  const u = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
  if (!verifyPassword(String(current || ''), u.password_hash)) return res.status(400).json({ error: 'Senha atual incorreta.' });
  const p = passwordProblem(next, getSettings(org(req)).security.strongPassword);
  if (p) return res.status(400).json({ error: p });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(next), req.user.id);
  res.json({ ok: true });
});

/* ---------- Painéis ---------- */
app.get('/api/dashboard', requirePerm('dashboard'), (req, res) => {
  const m = /^\d{4}-\d{2}$/.test(req.query.month || '') ? `${req.query.month}-01` : undefined;
  res.json({ ...M.dashboard(org(req), m), insights: getInsights(org(req)) });
});

app.get('/api/goal-series', requirePerm('dashboard'), (req, res) => {
  let { from, to } = req.query;
  if (!isIso(from) || !isIso(to) || from > to) { const r = refMonth(); from = addMonths(r, -11); to = monthEnd(r); }
  res.json(M.goalSeries(org(req), from, to));
});

app.get('/api/sales', requirePerm('vendas'), (req, res) => {
  let { from, to } = req.query;
  if (!isIso(from) || !isIso(to) || from > to) { const r = refMonth(); from = r; to = monthEnd(r); }
  res.json(M.salesView(org(req), from, to));
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
    logEvent(org(req), req.user.id, 'ai', question, 'ok', { answer: out.answer, tools: out.tools, mode: out.mode, ms });
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
  res.json({
    dashboard: M.dashboard(o, r), insights: getInsights(o), settings: getSettings(o).tv,
    categories: M.categoryBreakdown(o, from, to), topCustomers: M.customersDeclining(o, from, to, 5),
    expenses: M.expensesByCategory(o, from, to), receivables: M.bills(o, 'receber', { days: 15 }).slice(0, 6), payables: M.bills(o, 'pagar', { days: 15 }).slice(0, 6)
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
  const kinds = { ai: ['ai'], report: ['report'], import: ['import'], config: ['config', 'auth', 'tv', 'admin'] };
  const k = kinds[req.query.kind];
  const q = `%${String(req.query.q || '').trim()}%`;
  const rows = db.prepare(`
    SELECT e.id, e.kind, e.title, e.status, e.meta_json, e.created_at, u.name user_name
    FROM events e LEFT JOIN users u ON u.id = e.user_id
    WHERE e.org_id = ? ${k ? `AND e.kind IN (${k.map(() => '?').join(',')})` : ''} AND e.title LIKE ?
    ORDER BY e.id DESC LIMIT 200`).all(org(req), ...(k || []), q);
  const counts = Object.fromEntries(db.prepare('SELECT kind, COUNT(*) n FROM events WHERE org_id = ? GROUP BY kind').all(org(req)).map((r) => [r.kind, r.n]));
  res.json({ events: rows.map((r) => ({ ...r, meta: r.meta_json ? JSON.parse(r.meta_json) : null, meta_json: undefined })), counts });
});

/* ---------- Configurações ---------- */
app.get('/api/settings', requirePerm('configuracoes'), (req, res) => {
  const o = db.prepare('SELECT slug, name, segment, cnpj FROM organizations WHERE id = ?').get(org(req));
  res.json({ org: o, settings: getSettings(org(req)) });
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
  if (ai) patch.ai = { url: String(ai.url || '').trim() || 'http://localhost:11434', model: String(ai.model || '').trim() || 'qwen2.5:7b', autoInsights: !!ai.autoInsights, showTools: !!ai.showTools };
  if (tv) patch.tv = { interval: Math.min(300, Math.max(30, +tv.interval || 30)), questionInterval: Math.min(30, Math.max(5, +tv.questionInterval || 10)), screens: tv.screens, hideMoney: !!tv.hideMoney };
  if (appearance) patch.appearance = { theme: ['dark', 'light', 'system'].includes(appearance.theme) ? appearance.theme : 'dark', animations: !!appearance.animations };
  const s = saveSettings(org(req), patch);
  logEvent(org(req), req.user.id, 'config', 'Configurações da organização atualizadas');
  broadcast(org(req), 'settings', { tv: s.tv });
  res.json({ settings: s });
});

app.post('/api/settings/test-ai', requirePerm('configuracoes'), wrap(async (req, res) => {
  const ai = { ...getSettings(org(req)).ai, ...(req.body || {}) };
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
  db.prepare('INSERT INTO users (org_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)').run(org(req), String(name).trim(), e, hashPassword(pw), role, 'pendente');
  logEvent(org(req), req.user.id, 'admin', `Usuário convidado: ${String(name).trim()}`);
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
  logEvent(org(req), req.user.id, 'admin', `Usuário atualizado: ${u.name}`);
  res.json({ ok: true });
});

app.post('/api/users/:id/reset-password', requirePerm('administracao'), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE org_id = ? AND id = ?').get(org(req), +req.params.id);
  if (!u) return res.status(404).json({ error: 'Usuário não encontrado.' });
  const pw = tempPassword();
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hashPassword(pw), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(u.id);
  logEvent(org(req), req.user.id, 'admin', `Senha redefinida: ${u.name}`);
  res.json({ ok: true, tempPassword: pw });
});

app.put('/api/permissions', requirePerm('administracao'), (req, res) => {
  const m = req.body?.permissions || {};
  const clean = Object.fromEntries(MODULES.map((mod) => [mod, Object.fromEntries(ROLES.map((r) => [r, r === 'admin' ? true : !!m[mod]?.[r]]))]));
  const sec = req.body?.security;
  const s = saveSettings(org(req), { permissions: clean, ...(sec ? { security: { strongPassword: !!sec.strongPassword, sessionHours: [8, 12, 24, 72].includes(+sec.sessionHours) ? +sec.sessionHours : 12 }, tv: { hideMoney: !!sec.hideMoney } } : {}) });
  logEvent(org(req), req.user.id, 'admin', 'Permissões atualizadas');
  res.json({ permissions: s.permissions, security: s.security });
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
