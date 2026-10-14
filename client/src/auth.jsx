import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api } from './api.js';

const AuthCtx = createContext(null);
export const useAuth = () => useContext(AuthCtx);

function applyAppearance(a) {
  const root = document.documentElement;
  const theme = a?.theme === 'system' ? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark') : a?.theme || 'dark';
  root.dataset.theme = theme;
  root.dataset.motion = a?.animations === false ? 'off' : 'on';
}

export function AuthProvider({ children }) {
  const [me, setMe] = useState(undefined); // undefined = carregando, null = deslogado
  const refresh = useCallback(() => api('/auth/me').then((d) => { setMe(d); applyAppearance(d.appearance); return d; }).catch(() => { setMe(null); return null; }), []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const out = () => setMe(null);
    window.addEventListener('cortex:logout', out);
    return () => window.removeEventListener('cortex:logout', out);
  }, []);
  const logout = async () => { await api('/auth/logout', { method: 'POST' }).catch(() => {}); setMe(null); };
  return <AuthCtx.Provider value={{ me, refresh, logout }}>{children}</AuthCtx.Provider>;
}
