// Contexto da requisição atual (IP e navegador) para a auditoria, sem precisar passar por parâmetro.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function contextMiddleware(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
  // Empresa escolhida (matriz/filial) — só vale nas telas que mostram os dados separados
  const u = String(req.headers['x-cortex-empresa'] || '');
  const unit = ['matriz', 'filial'].includes(u) && UNIT_PATHS.test(req.path) ? u : null;
  store.run({ ip, ua: String(req.headers['user-agent'] || '').slice(0, 200), unit }, next);
}

// Dashboard, Vendas e indicadores, Relatórios e Assistente; o resto (TV, alertas, equipe, caixa) fica somado
const UNIT_PATHS = /^\/api\/(dashboard|sales|reports|ai\/ask|customers)(\/|$)/;
/** Empresa selecionada nesta requisição: 'matriz', 'filial' ou null (as duas somadas). */
export const currentUnit = () => store.getStore()?.unit || null;

export const requestContext = () => store.getStore() || null;
