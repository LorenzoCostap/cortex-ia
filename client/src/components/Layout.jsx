import { NavLink, Link } from 'react-router-dom';
import { useAuth } from '../auth.jsx';
import { Icon, BrandMark } from './ui.jsx';
import { initials, ROLE_LABEL } from '../format.js';

export const NAV = [
  { to: '/', key: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { to: '/assistente', key: 'assistente', label: 'Assistente Cortex AI', icon: 'sparkle' },
  { to: '/vendas', key: 'vendas', label: 'Vendas e indicadores', icon: 'trend' },
  { to: '/metas', key: 'metas', label: 'Metas', icon: 'target' },
  { to: '/importacao', key: 'importacao', label: 'Importação e backup', icon: 'upload' },
  { to: '/relatorios', key: 'relatorios', label: 'Relatórios', icon: 'file' },
  { to: '/historico', key: 'historico', label: 'Histórico', icon: 'clock' },
  { to: '/configuracoes', key: 'configuracoes', label: 'Configurações', icon: 'building' },
  { to: '/administracao', key: 'administracao', label: 'Administração', icon: 'shield' }
];

export default function Layout({ children }) {
  const { me, logout } = useAuth();
  return (
    <div className="app">
      <aside className="side">
        <Link to="/" className="brand"><BrandMark /><span className="brand-name">CORTEX <span>IA</span></span></Link>
        <div className="org-chip">
          <span className="avatar sq">{initials(me.org.name)}</span>
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.org.name}</span>
            <span className="dim" style={{ fontSize: 12 }}>{me.org.segment || 'Organização'}</span>
          </span>
        </div>
        <nav className="nav" aria-label="Navegação principal">
          {NAV.filter((n) => me.permissions[n.key]).map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name={n.icon} />{n.label}
            </NavLink>
          ))}
        </nav>
        <div className="side-foot">
          <a className="btn" href="/tv" target="_blank" rel="noreferrer"><Icon name="tv" size={16} color="var(--violet-text)" />Abrir modo TV</a>
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
  return (
    <header className="page-head">
      <div><p className="eyebrow">{eyebrow}</p><h1 className="page-title">{title}</h1></div>
      {children && <div className="toolbar">{children}</div>}
    </header>
  );
}
