import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Icon, BrandMark } from './ui.jsx';
import NoticeButton from './NoticeButton.jsx';
import { initials, ROLE_LABEL } from '../format.js';

export const NAV = [
  { to: '/', key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/assistente', key: 'assistente', label: 'Assistente Cortex AI', icon: 'sparkle' },
  { to: '/vendas', key: 'vendas', label: 'Vendas e indicadores', icon: 'trend' },
  { to: '/equipe', key: 'equipe', label: 'Equipe comercial', icon: 'users' },
  { to: '/metas', key: 'metas', label: 'Metas', icon: 'target' },
  { to: '/fluxo-de-caixa', key: 'fluxo', label: 'Fluxo de caixa', icon: 'wallet' },
  { to: '/alertas', key: 'alertas', label: 'Alertas', icon: 'bell' },
  { to: '/importacao', key: 'importacao', label: 'Importação e backup', icon: 'upload' },
  { to: '/relatorios', key: 'relatorios', label: 'Relatórios', icon: 'file' },
  { to: '/historico', key: 'historico', label: 'Histórico', icon: 'clock' },
  { to: '/configuracoes', key: 'configuracoes', label: 'Configurações', icon: 'building' },
  { to: '/administracao', key: 'administracao', label: 'Administração', icon: 'shield' }
];

export default function Layout({ children }) {
  const { me, logout } = useAuth();
  const [unread, setUnread] = useState(0);
  useEffect(() => {
    if (!me.permissions.alertas) return undefined;
    let alive = true;
    const load = () => api('/alerts/count').then((r) => alive && setUnread(r.unread)).catch(() => {});
    load();
    const t = setInterval(load, 60e3);
    window.addEventListener('cortex:alerts', load);
    return () => { alive = false; clearInterval(t); window.removeEventListener('cortex:alerts', load); };
  }, [me.permissions.alertas]);
  return (
    <div className="app">
      <aside className="side">
        <Link to="/" className="brand"><BrandMark /><span className="brand-name">CORTEX <span>IA</span></span></Link>
        <div className="org-chip">
          {me.org.logo ? <img className="avatar sq" src={me.org.logo} alt="" style={{ objectFit: 'cover', padding: 0, background: 'transparent' }} /> : <span className="avatar sq">{initials(me.org.name)}</span>}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.org.name}</span>
            <span className="dim" style={{ fontSize: 12 }}>{me.org.segment || 'Organização'}</span>
          </span>
        </div>
        <nav className="nav" aria-label="Navegação principal">
          {NAV.filter((n) => me.permissions[n.key]).map((n) => (n.key === 'assistente' && me.aiEnabled === false ? { ...n, label: 'Perguntas rápidas', icon: 'search' } : n)).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name={n.icon} />{n.label}
              {n.key === 'alertas' && unread > 0 && <span className="nav-count" aria-label={`${unread} não lidos`}>{unread}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <a className="btn" href="/tv" target="_blank" rel="noreferrer"><Icon name="tv" size={16} color="var(--violet-text)" />Abrir modo TV</a>
          {me.permissions.avisos && <NoticeButton />}
          <div className="user-row">
            <span className="avatar">{initials(me.user.name)}</span>
            <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{me.user.name}</span>
              <span className="dim" style={{ fontSize: 12 }}>{ROLE_LABEL[me.user.role]}</span>
            </span>
            <button className="btn icon sm ghost" aria-label="Sair" title="Sair" onClick={logout}><Icon name="logout" size={16} color="var(--dim)" /></button>
          </div>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function PageHead({ eyebrow, title, children }) {
  const { me } = useAuth();
  return (
    <header className="page-head">
      <div>
        <p className="print-only" style={{ fontSize: 12, color: '#6b6b76', marginBottom: 6 }}>{me?.org?.name} · gerado pelo Cortex em {new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</p>
        <p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1>
      </div>
      {children && <div className="toolbar">{children}</div>}
    </header>
  );
}
