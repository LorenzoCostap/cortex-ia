import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Icon, BrandMark, Spinner } from '../components/ui.jsx';

export default function Login() {
  const { refresh } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const [form, setForm] = useState({ org: localStorage.getItem('cortex.org') || '', email: '', password: '', remember: true });
  const [orgName, setOrgName] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const checkOrg = async () => {
    if (!form.org.trim()) return setOrgName('');
    try { setOrgName((await api(`/public/org?slug=${encodeURIComponent(form.org)}`)).name); } catch { setOrgName(''); }
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.org.trim() || !form.email.trim() || !form.password) return setError('Preencha organização, e-mail e senha.');
    setLoading(true);
    try {
      await api('/auth/login', { method: 'POST', body: form });
      try { localStorage.setItem('cortex.org', form.org.trim().toLowerCase()); } catch { /* ignora */ }
      await refresh();
      nav(params.get('next') || '/', { replace: true });
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  const field = { width: '100%', height: 48, borderRadius: 10, background: 'var(--card)', border: `1px solid ${error ? '#7a2e35' : 'var(--line-2)'}`, fontSize: 15, padding: '0 16px' };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexWrap: 'wrap' }}>
      <section className="login-brand" style={{ flex: '1 1 520px', minHeight: '100vh', padding: '48px 56px', background: 'var(--side)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', gap: 40, position: 'relative', overflow: 'hidden' }}>
        <svg aria-hidden="true" viewBox="0 0 600 600" style={{ position: 'absolute', right: -120, top: 80, width: 640, height: 640, opacity: 0.55 }}>
          <path d="M80 300L220 180L360 240L500 120M220 180L260 360L360 240L470 380L360 480L260 360L120 450L80 300M360 240L470 380M500 120L470 380" stroke="#3A2F63" fill="none" />
          {[[80, 300, 4], [220, 180, 5], [360, 240, 7], [500, 120, 4], [260, 360, 4], [470, 380, 5], [360, 480, 3], [120, 450, 3]].map(([x, y, r], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill="#8B6CF0" style={{ animation: `glow 4s ease-in-out ${i * 0.6}s infinite` }} />
          ))}
        </svg>
        <div className="brand" style={{ position: 'relative', padding: 0 }}><BrandMark size={36} /><span className="brand-name" style={{ fontSize: 16 }}>CORTEX <span>IA</span></span></div>
        <div className="rise" style={{ position: 'relative', maxWidth: 460, display: 'flex', flexDirection: 'column', gap: 20 }}>
          <h1 style={{ fontSize: 44, lineHeight: 1.1, fontWeight: 600, letterSpacing: '-0.025em' }}>A inteligência da sua empresa, em uma só tela.</h1>
          <p style={{ fontSize: 17, lineHeight: 1.6 }} className="muted">Indicadores financeiros, vendas e clientes — e um assistente que explica o que os números querem dizer.</p>
          <ul className="login-extra" style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 15, color: 'var(--text-2)' }}>
            <li style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Icon name="shield" color="var(--violet-text)" />Roda no seu computador — nenhum dado sai da empresa</li>
            <li style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Icon name="sparkle" color="var(--violet-text)" />IA local que responde em português</li>
            <li style={{ display: 'flex', gap: 12, alignItems: 'center' }}><Icon name="tv" color="var(--violet-text)" />Modo TV para o escritório</li>
          </ul>
        </div>
        <p className="dim login-extra" style={{ fontSize: 13, position: 'relative' }}>v0.1 · Ambiente local</p>
      </section>

      <section style={{ flex: '1 1 440px', padding: '48px 24px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <form onSubmit={submit} className="rise" style={{ width: '100%', maxWidth: 400, display: 'flex', flexDirection: 'column', gap: 22 }} aria-labelledby="login-title" noValidate>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <h2 id="login-title" style={{ fontSize: 28, fontWeight: 600 }}>Entrar</h2>
            <p className="muted" style={{ fontSize: 15 }}>{orgName ? <>Acesse o painel de <strong style={{ color: 'var(--text)' }}>{orgName}</strong>.</> : 'Acesse o painel da sua organização.'}</p>
          </div>
          {error && <div className="alert err" role="alert"><Icon name="alert" color="var(--red)" /><span>{error}</span></div>}
          <div className="field">
            <label htmlFor="org">Organização</label>
            <input id="org" value={form.org} onChange={set('org')} onBlur={checkOrg} autoComplete="organization" placeholder="ex.: grupo-valmar" style={field} className="input" />
          </div>
          <div className="field">
            <label htmlFor="email">E-mail</label>
            <input id="email" type="email" value={form.email} onChange={set('email')} autoComplete="email" style={field} className="input" />
          </div>
          <div className="field">
            <label htmlFor="senha">Senha</label>
            <div style={{ position: 'relative' }}>
              <input id="senha" type={showPw ? 'text' : 'password'} value={form.password} onChange={set('password')} autoComplete="current-password" style={{ ...field, paddingRight: 52 }} className="input" />
              <button type="button" onClick={() => setShowPw(!showPw)} aria-label={showPw ? 'Ocultar senha' : 'Mostrar senha'} className="btn icon ghost" style={{ position: 'absolute', right: 2, top: 2, width: 44, minHeight: 44 }}><Icon name="eye" color="var(--muted)" /></button>
            </div>
          </div>
          <label className="check" style={{ color: 'var(--text-2)' }}><input type="checkbox" checked={form.remember} onChange={set('remember')} />Manter conectado neste computador</label>
          <button type="submit" className="btn primary" disabled={loading} style={{ height: 50, fontSize: 15 }}>
            {loading ? <><Spinner color="#E4DCFF" size={18} />Entrando…</> : <>Entrar <Icon name="arrow" color="#fff" /></>}
          </button>
          <p className="dim" style={{ fontSize: 13, textAlign: 'center', lineHeight: 1.6 }}>Primeiro acesso? Peça um convite ao administrador da sua organização.</p>
        </form>
      </section>
      <style>{'@media (max-width:820px){.login-brand{min-height:auto !important;padding:32px 20px !important}.login-extra{display:none !important}}'}</style>
    </div>
  );
}
