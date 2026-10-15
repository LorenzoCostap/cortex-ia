import crypto from 'node:crypto';
import { db, getSettings } from './db.js';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const test = crypto.scryptSync(password, salt, 64);
  const ref = Buffer.from(hash, 'hex');
  return ref.length === test.length && crypto.timingSafeEqual(ref, test);
}

export function passwordProblem(password, strong) {
  if (!password || password.length < 8) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (strong && !(/[a-zA-Z]/.test(password) && /\d/.test(password))) return 'A senha precisa ter letras e números.';
  return null;
}

const COOKIE = 'cortex_session';

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map((p) => p.trim().split('=')).filter((p) => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}

export function createSession(res, user, remember) {
  const settings = getSettings(user.org_id);
  const hours = remember ? 24 * 30 : settings.security.sessionHours || 12;
  const token = crypto.randomBytes(32).toString('hex');
  const expires = new Date(Date.now() + hours * 3600e3);
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, user.id, expires.toISOString());
  db.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").run(user.id);
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Path=/; Expires=${expires.toUTCString()}`);
}

export function destroySession(req, res) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

export function loadUser(req, _res, next) {
  const token = parseCookies(req.headers.cookie)[COOKIE];
  if (token) {
    const row = db.prepare(`
      SELECT u.id, u.org_id, u.name, u.email, u.role, u.status, u.must_change_password, s.expires_at,
             o.slug AS org_slug, o.name AS org_name, o.segment AS org_segment, o.is_demo
      FROM sessions s JOIN users u ON u.id = s.user_id JOIN organizations o ON o.id = u.org_id
      WHERE s.token = ?`).get(token);
    if (row && new Date(row.expires_at) > new Date() && row.status === 'ativo') req.user = row;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
  next();
}

export function can(user, module) {
  const perms = getSettings(user.org_id).permissions;
  return !!perms[module]?.[user.role];
}

export function requirePerm(module) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Sessão expirada. Entre novamente.' });
    if (req.user.must_change_password) return res.status(403).json({ error: 'Crie a sua senha antes de continuar.', code: 'must_change_password' });
    if (!can(req.user, module)) return res.status(403).json({ error: 'Seu papel não tem acesso a esta área.' });
    next();
  };
}
