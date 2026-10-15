// Equipe comercial, primeiro acesso e auditoria (sobre os dados de demonstração).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.CORTEX_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-team-'));
const { db, logEvent, getSettings, saveSettings } = await import('../server/db.js');
const { seedDemo } = await import('../server/seed.js');
const { teamView, weekHighlights } = await import('../server/team.js');
const { contextMiddleware } = await import('../server/context.js');
const org = seedDemo({ reset: true });

test('ranking da equipe', () => {
  const t = teamView(org, '2026-09-01');
  assert.equal(t.closed, true);
  assert.equal(t.expectedPct, 100);
  assert.equal(t.sellers.length, 5);
  assert.ok(t.sellers.every((s) => s.target > 0 && s.pct > 0));
  for (let i = 1; i < t.sellers.length; i++) assert.ok(t.sellers[i - 1].pct >= t.sellers[i].pct, 'ordenado por % da meta');
  const total = t.sellers.reduce((s, x) => s + x.revenue, 0);
  assert.ok(Math.abs(total - t.team.realized) < 1, 'soma dos vendedores = realizado da equipe');
  assert.ok(Math.abs(t.regions.reduce((s, r) => s + r.share, 0) - 100) < 0.1);
  const cur = teamView(org);
  assert.ok(cur.expectedPct > 0 && cur.expectedPct < 100);
  assert.ok(weekHighlights(org).some((h) => h.label === 'Maior pedido'));
});

test('usuário pendente precisa criar a senha', () => {
  const b = db.prepare("SELECT must_change_password m FROM users WHERE email = 'bruno@grupovalmar.com.br'").get();
  assert.equal(b.m, 1);
  const m = db.prepare("SELECT must_change_password m FROM users WHERE email = 'marina@grupovalmar.com.br'").get();
  assert.equal(m.m, 0);
});

test('auditoria grava o IP da requisição', async () => {
  const req = { headers: { 'x-forwarded-for': '192.168.0.42', 'user-agent': 'teste' }, socket: {} };
  await new Promise((resolve) => contextMiddleware(req, {}, () => { logEvent(org, null, 'auth', 'teste de auditoria'); resolve(); }));
  const e = db.prepare("SELECT ip FROM events WHERE title = 'teste de auditoria'").get();
  assert.equal(e.ip, '192.168.0.42');
});

test('aviso na TV pode ser removido (null substitui o objeto)', () => {
  saveSettings(org, { tv: { notice: { text: 'oi', until: null, devices: [] } } });
  assert.equal(getSettings(org).tv.notice.text, 'oi');
  saveSettings(org, { tv: { notice: null } });
  assert.equal(getSettings(org).tv.notice, null);
});
