import { useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import { BrandMark, Icon, Spinner } from '../components/ui.jsx';

const COLORS = ['#F87171', '#FBBF24', '#A78BFA', '#34D399'];

/** Tela obrigatória quando a pessoa entra com uma senha temporária (convite ou senha redefinida). */
export default function FirstAccess() {
  const { me, refresh, logout } = useAuth();
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rules = [[pw.length >= 8, 'Pelo menos 8 caracteres'], [/[a-zA-Z]/.test(pw) && /\d/.test(pw), 'Letras e números'], [pw.length > 0 && pw === pw2, 'As duas senhas são iguais']];
  const ok = rules.every(([v]) => v);
  const score = [pw.length >= 8, /[a-zA-Z]/.test(pw) && /\d/.test(pw), pw.length >= 12, /[^a-zA-Z0-9]/.test(pw)].filter(Boolean).length;

  const submit = async (e) => {
    e.preventDefault();
    if (!ok) return;
    setBusy(true); setError('');
    try { await api('/auth/password', { method: 'POST', body: { next: pw } }); await refresh(); }
    catch (err) { setError(err.message); setBusy(false); }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <form onSubmit={submit} className="rise card" aria-labelledby="fa-title" style={{ width: '100%', maxWidth: 440, padding: 32, gap: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><BrandMark size={32} /><span style={{ fontWeight: 600 }}>{me.org.name}</span></div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h1 id="fa-title" style={{ fontSize: 24, fontWeight: 600 }}>Bem-vindo, {me.user.name.split(' ')[0]}</h1>
          <p className="muted" style={{ fontSize: 15, lineHeight: 1.5 }}>Você entrou com uma senha temporária. Crie a sua senha para continuar.</p>
        </div>
        {error && <div className="alert err" role="alert"><Icon name="alert" color="var(--red)" /><span>{error}</span></div>}
        <label className="field">Nova senha
          <span style={{ position: 'relative', display: 'flex' }}>
            <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus style={{ flex: 1, paddingRight: 44 }} />
            <button type="button" className="btn icon sm ghost" aria-label={show ? 'Ocultar senha' : 'Mostrar senha'} onClick={() => setShow(!show)} style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)' }}><Icon name="eye" size={16} color="var(--muted)" /></button>
          </span>
        </label>
        <div aria-hidden="true" style={{ display: 'flex', gap: 6, marginTop: -10 }}>
          {[0, 1, 2, 3].map((i) => <span key={i} style={{ flex: 1, height: 4, borderRadius: 2, background: i < score ? COLORS[score - 1] : 'var(--line-2)', transition: 'background .2s' }} />)}
        </div>
        <label className="field">Confirmar senha
          <input className="input" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </label>
        <ul aria-label="Requisitos da senha" style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8, fontSize: 13 }}>
          {rules.map(([v, t]) => <li key={t} style={{ display: 'flex', alignItems: 'center', gap: 8, color: v ? 'var(--green-text)' : 'var(--muted)' }}><Icon name={v ? 'check' : 'dots'} size={14} width={2.2} />{t}<span className="sr">{v ? ' — atendido' : ' — pendente'}</span></li>)}
        </ul>
        <button className="btn primary" disabled={!ok || busy} style={{ minHeight: 46 }}>{busy ? <Spinner color="#fff" /> : 'Salvar e entrar'}</button>
        <button type="button" className="btn ghost sm" onClick={logout} style={{ alignSelf: 'center' }}>Sair</button>
      </form>
    </div>
  );
}
