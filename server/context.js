// Contexto da requisição atual (IP e navegador) para a auditoria, sem precisar passar por parâmetro.
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

export function contextMiddleware(req, res, next) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim().replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
  store.run({ ip, ua: String(req.headers['user-agent'] || '').slice(0, 200) }, next);
}

export const requestContext = () => store.getStore() || null;
