// Resumo diário por e-mail (Gmail via SMTP com senha de app).
import nodemailer from 'nodemailer';
import { db, getSettings, saveSettings, logEvent } from './db.js';
import * as M from './metrics.js';
import { listAlerts } from './alerts.js';
import { todayStr, addDays, brDate } from './dates.js';

const WEEKDAYS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
const brl = (v) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
const kfmt = (v) => `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`;
const pct = (v) => `${(v ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Monta o resumo do dia (assunto, texto e HTML). */
export function buildSummary(org, { name = '', baseUrl = 'http://localhost:3210' } = {}) {
  const today = todayStr(), y = addDays(today, -1);
  const o = db.prepare('SELECT name FROM organizations WHERE id = ?').get(org);
  const day = M.goalSeries(org, y, y).buckets[0] || { revenue: 0, goal: 0 };
  const f = M.forecast(org);
  const alerts = listAlerts(org).slice(0, 5);
  const wd = WEEKDAYS[new Date(today + 'T12:00:00Z').getUTCDay()];
  const hour = new Date().getHours();
  const hello = `${hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'}${name ? `, ${name.split(' ')[0]}` : ''}`;

  const lines = [];
  lines.push(`Ontem a empresa vendeu ${brl(day.revenue)}${day.goal ? ` (${pct((day.revenue / day.goal) * 100)} da meta do dia)` : ''}.`);
  if (f.target) lines.push(`O mês está em ${pct(f.achievedPct)} da meta, com previsão de fechar em ${kfmt(f.projection)} (${pct(f.projectionPct)}).`);
  const subject = `Cortex · Resumo de ${wd}, ${brDate(today).slice(0, 5)} · ${o.name}`;
  const text = [`${hello}.`, '', ...lines, '', alerts.length ? 'Pontos de atenção:' : 'Nenhum alerta aberto.', ...alerts.map((a) => `- ${a.title}`), '', `Abrir o Cortex: ${baseUrl}`].join('\n');

  const sev = { alta: '#F87171', media: '#FBBF24', info: '#A78BFA' };
  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#111113;font-family:Segoe UI,Arial,sans-serif;color:#ECECF1">
<div style="max-width:560px;margin:0 auto;background:#18181C;border:1px solid #26262E;border-radius:14px;padding:28px">
  <div style="font-size:12px;letter-spacing:.12em;font-weight:700;color:#B9A3FF;margin-bottom:18px">CORTEX IA · ${esc(o.name.toUpperCase())}</div>
  <div style="font-size:20px;font-weight:600;margin-bottom:14px">${esc(hello)}</div>
  ${lines.map((l) => `<p style="margin:0 0 10px;font-size:15px;line-height:1.6;color:#C9C9D1">${esc(l).replace(/(R\$ [\d.,]+( mil)?|[\d,]+%)/g, '<strong style="color:#ECECF1">$1</strong>')}</p>`).join('')}
  ${alerts.length ? `<div style="margin:20px 0 8px;font-size:13px;color:#8E8E99">Pontos de atenção</div>
  <table role="presentation" style="width:100%;border-collapse:collapse">${alerts.map((a) => `<tr><td style="padding:8px 0;border-top:1px solid #26262E;width:14px;vertical-align:top"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${sev[a.severity]};margin-top:6px"></span></td><td style="padding:8px 0;border-top:1px solid #26262E;font-size:14px;line-height:1.5"><strong>${esc(a.title)}</strong><br><span style="color:#A6A6B0">${esc(a.text)}</span></td></tr>`).join('')}</table>`
    : '<p style="margin:16px 0 0;font-size:14px;color:#6EE7B7">Nenhum alerta aberto. Tudo em dia.</p>'}
  <a href="${esc(baseUrl)}" style="display:inline-block;margin-top:22px;padding:12px 20px;border-radius:10px;background:#6D3FE0;color:#fff;text-decoration:none;font-weight:600;font-size:14px">Abrir o Cortex</a>
  <p style="margin:22px 0 0;font-size:12px;color:#6B6B78">Resumo automático gerado neste computador. Para parar de receber, desligue em Alertas › Resumo diário.</p>
</div></body></html>`;
  return { subject, text, html };
}

function transport(email) {
  if (process.env.CORTEX_MAIL_TRANSPORT === 'json') return nodemailer.createTransport({ jsonTransport: true }); // testes
  if (!email.user || !email.appPassword) throw new Error('Informe a conta Gmail e a senha de app.');
  return nodemailer.createTransport({ host: 'smtp.gmail.com', port: 465, secure: true, auth: { user: email.user, pass: email.appPassword.replace(/\s/g, '') }, connectionTimeout: 15000 });
}

const friendly = (e) => {
  const m = String(e?.message || e);
  if (/535|Username and Password not accepted|Invalid login/i.test(m)) return 'O Gmail recusou o login. Confira a conta e use uma senha de app (16 letras), não a senha normal.';
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|timeout/i.test(m)) return 'Não foi possível conectar ao Gmail. Verifique a internet deste computador.';
  return m;
};

export async function sendSummary(org, to, opts = {}) {
  const email = getSettings(org).email;
  const list = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (!list.length) throw new Error('Adicione pelo menos um destinatário.');
  const s = buildSummary(org, opts);
  try {
    const info = await transport(email).sendMail({ from: `"Cortex IA" <${email.user || 'cortex@localhost'}>`, to: list.join(', '), subject: s.subject, text: s.text, html: s.html });
    return { ok: true, to: list, subject: s.subject, messageId: info.messageId };
  } catch (e) { throw new Error(friendly(e)); }
}

const sameMinuteOrLater = (now, hhmm) => { const [h, m] = hhmm.split(':').map(Number); return now.getHours() * 60 + now.getMinutes() >= h * 60 + m; };

/** Chamado pelo agendador a cada minuto. */
export async function runDailyEmail(org, now = new Date()) {
  const email = getSettings(org).email;
  if (!email.enabled || !email.to?.length || !email.user || !email.appPassword) return null;
  const today = todayStr();
  if (email.lastSent === today || !sameMinuteOrLater(now, email.time || '08:00')) return null;
  const wd = new Date(today + 'T12:00:00Z').getUTCDay();
  if (email.days === 'uteis' && (wd === 0 || wd === 6)) return null;
  saveSettings(org, { email: { lastSent: today } }); // marca antes para não repetir em caso de erro
  try {
    const r = await sendSummary(org, email.to, { name: '' });
    logEvent(org, null, 'report', `Resumo diário enviado para ${email.to.length} destinatário(s)`, 'ok');
    return r;
  } catch (e) {
    logEvent(org, null, 'report', 'Falha ao enviar o resumo diário', 'erro', { error: e.message });
    return null;
  }
}
