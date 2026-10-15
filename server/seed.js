// Gera uma empresa fictícia (Grupo Valmar) com ~2 anos de vendas, despesas, contas e metas.
// Os dados são relativos à data de hoje: o "mês de referência" é sempre o último mês completo,
// e ele tem uma queda proposital para a IA ter o que explicar.
import { db, logEvent, saveSettings } from './db.js';
import { hashPassword } from './auth.js';
import { todayStr, addDays, addMonths, monthStart, monthEnd, monthKey, weekday, refMonth } from './dates.js';
import { fileURLToPath } from 'node:url';

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PRODUCTS = [
  ['Café torrado 500 g', 'Mercearia', 18.9, 10], ['Azeite extra virgem 500 ml', 'Mercearia', 39.9, 6],
  ['Arroz parboilizado 5 kg', 'Mercearia', 27.5, 8], ['Massa grano duro 500 g', 'Mercearia', 8.9, 9],
  ['Chocolate 70% 100 g', 'Mercearia', 12.5, 6], ['Feijão carioca 1 kg', 'Mercearia', 8.4, 7],
  ['Farinha de trigo 5 kg', 'Mercearia', 22.9, 4], ['Açúcar cristal 5 kg', 'Mercearia', 21.5, 4],
  ['Molho de tomate 340 g', 'Mercearia', 4.6, 6], ['Suco integral de uva 1 L', 'Bebidas', 16.9, 6],
  ['Água mineral 1,5 L (fardo 6)', 'Bebidas', 14.4, 5], ['Refrigerante cola 2 L', 'Bebidas', 9.8, 6],
  ['Cerveja artesanal 500 ml', 'Bebidas', 14.9, 3], ['Vinho tinto seco 750 ml', 'Bebidas', 42.0, 2],
  ['Queijo colonial kg', 'Frios e laticínios', 49.9, 4], ['Salame tipo italiano kg', 'Frios e laticínios', 59.0, 2],
  ['Iogurte natural 170 g', 'Frios e laticínios', 3.9, 5], ['Manteiga 200 g', 'Frios e laticínios', 11.9, 4],
  ['Detergente neutro 500 ml', 'Limpeza', 2.9, 5], ['Sabão em pó 1 kg', 'Limpeza', 13.9, 3],
  ['Papel higiênico 12 rolos', 'Limpeza', 21.9, 3], ['Desinfetante 2 L', 'Limpeza', 9.5, 2],
  ['Biscoito amanteigado 300 g', 'Outros', 7.9, 4], ['Erva-mate 1 kg', 'Outros', 19.9, 4]
];

export const SELLERS = [['Juliana Mello', 'Serra Gaúcha'], ['Paulo Henrique', 'Vale do Taquari'], ['Renata Lopes', 'Porto Alegre e região'], ['Tiago Santos', 'Campos de Cima da Serra'], ['André Kunz', 'Serra Gaúcha']];
const KEY_SELLER = { 'Mercado Bom Preço': 0, 'Rede SuperSul': 2, 'Empório Central': 1, 'Padaria Trigo Fino': 0 };
const KEY_CUSTOMERS = [
  ['Mercado Bom Preço', 30, 2.6], ['Rede SuperSul', 26, 2.4], ['Empório Central', 14, 1.6], ['Padaria Trigo Fino', 10, 1.2]
];
const PREFIX = ['Mercado', 'Mini Mercado', 'Empório', 'Padaria', 'Restaurante', 'Lancheria', 'Armazém', 'Supermercado', 'Conveniência', 'Hortifruti', 'Cantina', 'Bar'];
const NAMES = ['São Jorge', 'Bela Vista', 'Serrano', 'do Vale', 'Primavera', 'Colonial', 'Nova Era', 'Boa Safra', 'Dois Irmãos', 'Ponte Alta', 'Cristal', 'Jardim', 'Estrela', 'Bom Gosto', 'Pinheiral', 'Santa Clara', 'Recanto', 'da Família', 'do Bairro', 'Sabor da Serra', 'Vitória', 'Três Marias', 'Imigrante', 'Belvedere'];
const SEASON = { 1: 0.82, 2: 0.86, 3: 0.95, 4: 0.98, 5: 1.0, 6: 0.98, 7: 1.03, 8: 1.08, 9: 1.07, 10: 0.97, 11: 1.0, 12: 1.15 };
const GOAL_FACTORS = [1.02, 0.99, 0.97, 1.04, 1.03, 0.98, 0.995, 0.98, 1.015, 0.985, 0.98, 1.09];

export function clearOrgData(orgId) {
  for (const t of ['orders', 'customers', 'products', 'expenses', 'bills', 'goals', 'goal_items', 'insights', 'reports', 'alerts']) {
    db.prepare(`DELETE FROM ${t} WHERE org_id = ?`).run(orgId);
  }
}

export function generateDemoData(orgId, today = todayStr()) {
  const rand = rng(20261014);
  const pick = (arr, wKey) => {
    const total = arr.reduce((s, x) => s + x[wKey], 0);
    let r = rand() * total;
    for (const x of arr) { r -= x[wKey]; if (r <= 0) return x; }
    return arr[arr.length - 1];
  };
  const REF = refMonth(today);
  const refStart = monthStart(REF), refEnd = monthEnd(REF);
  const firstDay = addMonths(REF, -23); // 2 anos: permite comparar com o ano anterior
  const goalStart = addMonths(REF, -11);

  const tx = db.transaction(() => {
    clearOrgData(orgId);

    const insP = db.prepare('INSERT INTO products (org_id, sku, name, category, price, cost) VALUES (?, ?, ?, ?, ?, ?)');
    const products = PRODUCTS.map(([name, category, price, w], i) => {
      const cost = +(price * (0.64 + rand() * 0.1)).toFixed(2);
      const id = insP.run(orgId, `P-${String(i + 1).padStart(3, '0')}`, name, category, price, cost).lastInsertRowid;
      return { id, name, price, cost, w };
    });

    const insC = db.prepare('INSERT INTO customers (org_id, code, name, seller, region) VALUES (?, ?, ?, ?, ?)');
    const sellerFor = (name) => SELLERS[KEY_SELLER[name] ?? [0, 0, 1, 1, 2, 2, 2, 3, 4][Math.floor(rand() * 9)]];
    const newCustomer = (code, name, w, size) => { const [seller, region] = sellerFor(name); return { id: insC.run(orgId, code, name, seller, region).lastInsertRowid, name, w, size, seller }; };
    const customers = KEY_CUSTOMERS.map(([name, w, size], i) => newCustomer(`C-${String(i + 1).padStart(4, '0')}`, name, w, size));
    const used = new Set(customers.map((c) => c.name));
    while (customers.length < 214) {
      const name = `${PREFIX[Math.floor(rand() * PREFIX.length)]} ${NAMES[Math.floor(rand() * NAMES.length)]}`;
      if (used.has(name)) continue;
      const full = name;
      used.add(full);
      customers.push(newCustomer(`C-${String(customers.length + 1).padStart(4, '0')}`, full, 1 + rand() * 5, 0.7 + rand() * 0.8));
    }
    const byName = Object.fromEntries(customers.map((c) => [c.name, c]));

    const insO = db.prepare('INSERT INTO orders (org_id, customer_id, date, total, seller) VALUES (?, ?, ?, 0, ?)');
    const insI = db.prepare('INSERT INTO order_items (order_id, product_id, qty, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?)');
    const updO = db.prepare('UPDATE orders SET total = ? WHERE id = ?');
    const monthlyRevenue = {};
    const bomPrecoLast = addDays(today, -19);

    for (let day = firstDay; day <= today; day = addDays(day, 1)) {
      const wd = weekday(day);
      if (wd === 0) continue;
      const month = +day.slice(5, 7);
      const monthsAgo = Math.round((new Date(REF) - new Date(monthStart(day))) / (30.4 * 864e5));
      const trend = 1 - monthsAgo * 0.008;
      const base = (wd === 6 ? 16 : 56) * SEASON[month] * trend * (0.85 + rand() * 0.3);
      const inRef = day >= refStart && day <= refEnd;
      const last21 = day > addDays(today, -21);

      const keep = (c) => {
        if (c.name === 'Mercado Bom Preço' && day > bomPrecoLast) return 0;
        if (!inRef) return 1;
        return { 'Mercado Bom Preço': 0.4, 'Rede SuperSul': 0.62, 'Empório Central': 0.75, 'Padaria Trigo Fino': 0.8 }[c.name] ?? 1;
      };
      const dayOfMonth = +day.slice(8, 10);
      const keepP = (p) => {
        if (inRef && p.name.startsWith('Azeite') && dayOfMonth >= 9 && dayOfMonth <= 18) return 0; // ruptura de estoque
        if (last21 && p.name.startsWith('Chocolate')) return 0.55;
        return 1;
      };

      const nOrders = Math.round(base);
      for (let k = 0; k < nOrders; k++) {
        const c = pick(customers, 'w');
        if (rand() >= keep(c)) continue; // pedido que deixou de acontecer
        const orderId = insO.run(orgId, c.id, day, c.seller).lastInsertRowid;
        const nItems = 4 + Math.floor(rand() * 8);
        const chosen = new Set();
        let total = 0;
        for (let j = 0; j < nItems; j++) {
          const p = pick(products, 'w');
          if (chosen.has(p.id) || rand() >= keepP(p)) continue;
          chosen.add(p.id);
          const qty = Math.max(1, Math.round((1 + rand() * 3) * c.size));
          insI.run(orderId, p.id, qty, p.price, p.cost);
          total += qty * p.price;
        }
        if (total === 0) { db.prepare('DELETE FROM orders WHERE id = ?').run(orderId); continue; }
        updO.run(+total.toFixed(2), orderId);
        monthlyRevenue[monthKey(day)] = (monthlyRevenue[monthKey(day)] || 0) + total;
      }
    }

    // Despesas operacionais (o custo da mercadoria vem dos itens vendidos)
    const insE = db.prepare('INSERT INTO expenses (org_id, date, category, description, amount) VALUES (?, ?, ?, ?, ?)');
    for (let m = firstDay; m <= today; m = addMonths(m, 1)) {
      const key = monthKey(m);
      const rev = monthlyRevenue[key] || 0;
      const isRefOrAfter = m >= refStart;
      const cap = (d) => { const s = `${key}-${String(d).padStart(2, '0')}`; return s <= today ? s : null; };
      const add = (d, cat, desc, val) => { const s = cap(d); if (s) insE.run(orgId, s, cat, desc, +val.toFixed(2)); };
      add(5, 'Pessoal', 'Salários e encargos', 34000 + rand() * 1500);
      add(10, 'Ocupação', 'Aluguel do galpão', 12000);
      add(15, 'Ocupação', 'Energia elétrica', 2100 + rand() * 500);
      add(12, 'Tecnologia', 'Sistemas e internet', 1480);
      add(18, 'Marketing', 'Campanhas e materiais', 2500 + rand() * 1500);
      add(20, 'Logística', 'Frete de entregas', rev * (isRefOrAfter ? 0.037 : 0.042));
      add(25, 'Comercial', 'Comissões de vendas', rev * 0.03);
      if (rand() > 0.4) add(22, 'Manutenção', 'Manutenção de veículos', 500 + rand() * 1800);
    }

    // Metas mensais
    const insG = db.prepare('INSERT INTO goals (org_id, month, revenue_target) VALUES (?, ?, ?)');
    for (let i = 0; i < 12; i++) {
      const key = monthKey(addMonths(goalStart, i));
      insG.run(orgId, key, Math.round(((monthlyRevenue[key] || 0) * GOAL_FACTORS[i]) / 1000) * 1000);
    }
    const refTarget = Math.round(((monthlyRevenue[monthKey(REF)] || 0) * 1.09) / 1000) * 1000;
    insG.run(orgId, monthKey(today), Math.round(refTarget * 1.02 / 1000) * 1000);
    insG.run(orgId, monthKey(addMonths(today, 1)), Math.round(refTarget * 1.04 / 1000) * 1000);
    // Metas por vendedor e por categoria: participação dos últimos 3 meses aplicada à meta do mês
    const insGI = db.prepare('INSERT OR REPLACE INTO goal_items (org_id, month, dim, key, target) VALUES (?, ?, ?, ?, ?)');
    const from3 = addMonths(REF, -2);
    const shares = {
      vendedor: db.prepare('SELECT seller k, SUM(total) v FROM orders WHERE org_id = ? AND date >= ? AND date <= ? GROUP BY seller').all(orgId, from3, refEnd),
      categoria: db.prepare('SELECT p.category k, SUM(i.qty*i.unit_price) v FROM order_items i JOIN orders o ON o.id = i.order_id JOIN products p ON p.id = i.product_id WHERE o.org_id = ? AND o.date >= ? AND o.date <= ? GROUP BY p.category').all(orgId, from3, refEnd)
    };
    for (const m of [REF, monthStart(today)]) {
      const target = db.prepare('SELECT revenue_target t FROM goals WHERE org_id = ? AND month = ?').get(orgId, monthKey(m))?.t || 0;
      for (const [dim, rows] of Object.entries(shares)) {
        const tot = rows.reduce((a, r) => a + r.v, 0) || 1;
        for (const r of rows) if (r.k) insGI.run(orgId, monthKey(m), dim, r.k, Math.round((target * r.v / tot) / 500) * 500);
      }
    }

    // Contas a pagar e a receber
    const insB = db.prepare('INSERT INTO bills (org_id, kind, party, due_date, amount, paid_at) VALUES (?, ?, ?, ?, ?, ?)');
    [['Torrefação Serra Alta', -4, 18400], ['Aluguel do galpão', 0, 12000], ['Transportadora Rota 116', 3, 6750], ['Energia elétrica', 6, 2310], ['Distribuidora Sul Grãos', 12, 23900], ['Laticínios Vale Verde', 17, 9870]]
      .forEach(([p, d, v]) => insB.run(orgId, 'pagar', p, addDays(today, d), v, null));
    [['Distribuidora Sul Grãos', -20, 21400], ['Torrefação Serra Alta', -34, 17650], ['Aluguel do galpão', -34, 12000]]
      .forEach(([p, d, v]) => insB.run(orgId, 'pagar', p, addDays(today, d), v, addDays(today, d)));
    const rec = [['Mercado Bom Preço', -9, 8420], ['Lancheria Bom Gosto', -6, 1960], ['Restaurante Colonial', -3, 2240], ['Rede SuperSul', 2, 14900], ['Empório Central', 4, 7310], ['Padaria Trigo Fino', 5, 4380], ['Supermercado Bela Vista', 7, 9150], ['Armazém Serrano', 9, 6020], ['Rede SuperSul', 16, 15200], ['Mercado São Jorge', 11, 3870], ['Hortifruti Primavera', 13, 2650], ['Empório Central', 19, 6700]];
    // Compromissos fixos dos próximos meses (folha, imposto) para o fluxo de caixa
    for (let k = 0; k < 3; k++) {
      const m = addMonths(monthStart(today), k + 1);
      insB.run(orgId, 'pagar', 'Folha de pagamento', addDays(m, 4), 34800, null);
      insB.run(orgId, 'pagar', 'Simples Nacional (DAS)', addDays(m, 19), 21600 + k * 900, null);
    }
    insB.run(orgId, 'pagar', 'Distribuidora Sul Grãos', addDays(today, 22), 31200, null);
    rec.forEach(([p, d, v]) => insB.run(orgId, 'receber', byName[p] ? p : p, addDays(today, d), v, null));
  });
  tx();
  saveSettings(orgId, { cash: { balance: 88000, date: today, minimum: 60000 } });
  return { ref: REF };
}

export function createOrganization({ slug, name, segment, adminName, adminEmail, password, demo = false }) {
  const settings = '{}';
  const orgId = db.prepare('INSERT INTO organizations (slug, name, segment, settings_json, is_demo) VALUES (?, ?, ?, ?, ?)')
    .run(slug, name, segment || null, settings, demo ? 1 : 0).lastInsertRowid;
  db.prepare('INSERT INTO users (org_id, name, email, password_hash, role, status) VALUES (?, ?, ?, ?, ?, ?)')
    .run(orgId, adminName, adminEmail.toLowerCase(), hashPassword(password), 'admin', 'ativo');
  return orgId;
}

export function seedDemo({ reset = false } = {}) {
  const existing = db.prepare("SELECT id FROM organizations WHERE slug = 'grupo-valmar'").get();
  if (existing && !reset) return existing.id;
  if (existing) db.prepare('DELETE FROM organizations WHERE id = ?').run(existing.id);

  const orgId = createOrganization({ slug: 'grupo-valmar', name: 'Grupo Valmar', segment: 'Distribuidora de alimentos', adminName: 'Marina Duarte', adminEmail: 'marina@grupovalmar.com.br', password: 'cortex2026', demo: true });
  const insU = db.prepare('INSERT INTO users (org_id, name, email, password_hash, role, status, last_login) VALUES (?, ?, ?, ?, ?, ?, ?)');
  const pw = hashPassword('cortex2026');
  [['Rafael Lima', 'rafael', 'gestor', 'ativo', 1], ['Camila Rocha', 'camila', 'gestor', 'ativo', 1], ['Diego Martins', 'diego', 'analista', 'ativo', 1], ['Bruno Alves', 'bruno', 'visualizador', 'pendente', 0], ['Luana Souza', 'luana', 'analista', 'desativado', 1]]
    .forEach(([n, e, r, s, l]) => insU.run(orgId, n, `${e}@grupovalmar.com.br`, pw, r, s, l ? new Date(Date.now() - Math.random() * 9 * 864e5).toISOString().slice(0, 19).replace('T', ' ') : null));

  generateDemoData(orgId);
  logEvent(orgId, null, 'import', 'Dados de demonstração gerados', 'ok');
  return orgId;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t = Date.now();
  seedDemo({ reset: process.argv.includes('--reset') });
  const n = db.prepare('SELECT COUNT(*) n FROM orders').get().n;
  console.log(`Dados de demonstração prontos: ${n} pedidos em ${((Date.now() - t) / 1000).toFixed(1)} s.`);
  console.log('Login: organização "grupo-valmar" · marina@grupovalmar.com.br · senha cortex2026');
}
