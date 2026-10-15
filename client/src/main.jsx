import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './styles.css';
import { AuthProvider, useAuth } from './auth.jsx';
import { ToastProvider, Empty, Spinner } from './components/ui.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Assistant from './pages/Assistant.jsx';
import Sales from './pages/Sales.jsx';
import Import from './pages/Import.jsx';
import Goals from './pages/Goals.jsx';
import CashFlow from './pages/CashFlow.jsx';
import Customer from './pages/Customer.jsx';
import Alerts from './pages/Alerts.jsx';
import Team from './pages/Team.jsx';
import FirstAccess from './pages/FirstAccess.jsx';
import Reports from './pages/Reports.jsx';
import History from './pages/History.jsx';
import Settings from './pages/Settings.jsx';
import Admin from './pages/Admin.jsx';
import TV from './pages/TV.jsx';

function Guard({ perm, children }) {
  const { me } = useAuth();
  if (perm && !me.permissions[perm]) {
    return <Layout><Empty icon="shield" title="Sem acesso a esta área" text="Seu papel não tem permissão para abrir esta página. Fale com o administrador da organização." /></Layout>;
  }
  return <Layout>{children}</Layout>;
}

function AppRoutes() {
  const { me } = useAuth();
  const loc = useLocation();
  if (me === undefined) return <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Spinner size={28} /></div>;
  if (!me) return loc.pathname === '/login' ? <Login /> : <Navigate to={`/login?next=${encodeURIComponent(loc.pathname)}`} replace />;
  if (me.user.mustChangePassword) return <FirstAccess />;
  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/tv" element={<TV />} />
      <Route path="/" element={<Guard perm="dashboard"><Dashboard /></Guard>} />
      <Route path="/assistente" element={<Guard perm="assistente"><Assistant /></Guard>} />
      <Route path="/vendas" element={<Guard perm="vendas"><Sales /></Guard>} />
      <Route path="/clientes/:id" element={<Guard perm="vendas"><Customer /></Guard>} />
      <Route path="/equipe" element={<Guard perm="equipe"><Team /></Guard>} />
      <Route path="/metas" element={<Guard perm="metas"><Goals /></Guard>} />
      <Route path="/fluxo-de-caixa" element={<Guard perm="fluxo"><CashFlow /></Guard>} />
      <Route path="/alertas" element={<Guard perm="alertas"><Alerts /></Guard>} />
      <Route path="/importacao" element={<Guard perm="importacao"><Import /></Guard>} />
      <Route path="/relatorios" element={<Guard perm="relatorios"><Reports /></Guard>} />
      <Route path="/relatorios/:id" element={<Guard perm="relatorios"><Reports /></Guard>} />
      <Route path="/historico" element={<Guard perm="historico"><History /></Guard>} />
      <Route path="/configuracoes" element={<Guard perm="configuracoes"><Settings /></Guard>} />
      <Route path="/administracao" element={<Guard perm="administracao"><Admin /></Guard>} />
      <Route path="*" element={<Guard><Empty icon="search" title="Página não encontrada" text="O endereço não existe. Use o menu para navegar." /></Guard>} />
    </Routes>
  );
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
