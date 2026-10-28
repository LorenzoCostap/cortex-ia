// Relatórios do ERP SENTUS exportados em CSV (sem cabeçalho, separados por ";", ponto decimal e "null" no vazio).
// Cada relatório é reconhecido pela estrutura das linhas e gravado nas tabelas que o Cortex já usa.
import { db, logEvent, getSettings, saveSettings } from './db.js';
import { clearOrgData } from './seed.js';
import { clearProductCache } from './metrics.js';
import { isIso } from './dates.js';

export const SENTUS = {
  itens: { label: 'Vendas por item', code: '26M', type: 'vendas' },
  periodo: { label: 'Vendas por período (descontos)', code: '80M', type: 'conferencia' },
  titulos: { label: 'Títulos por vencimento', code: '6M', type: 'contas' },
  estoque: { label: 'Estoque (posição)', code: '17M', type: 'estoque' },
  grupos: { label: 'Visão financeira por grupo', code: '126M', type: 'despesas' }
};
export const UNIT_LABEL = { matriz: 'Matriz', filial: 'Filial' };
const DOC_TYPES = ['NFC-e', 'NFe', 'NF-e', 'Pedido'];
const COST_RATIO = 0.7; // sem custo em lugar nenhum: margem bruta estimada de 30%
const EXP_DESC = 'SENTUS · Visão financeira por grupo';

/* ---------- valores ---------- */
const blank = (v) => v === undefined || v === null || v === '' || v === 'null';
export function num(v) {
  if (blank(v)) return null;
  const s = String(v).trim();
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s); // padrão do SENTUS: 1079.33 / 3.000 (= 3)
  const br = s.replace(/[R$\s]/g, '').replace(/\./g, '').replace(',', '.'); // se vier no padrão brasileiro
  return /^-?\d+(\.\d+)?$/.test(br) ? Number(br) : null;
}
export function date(v) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim());
  if (!m) return null;
  const iso = `${m[3]}-${m[2]}-${m[1]}`;
  return isIso(iso) ? iso : null;
}
const txt = (v) => (blank(v) ? '' : String(v).trim());

/**
 * Divide o CSV em registros. Algumas notas trazem quebra de linha dentro do campo de observação
 * (ex.: a chave da NF-e), e o registro sai em 2 ou 3 linhas: elas são juntadas de volta até o
 * registro ter o número de campos mais comum do arquivo.
 */
export function splitRecords(text) {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const counts = {};
  for (const l of lines) if (l.trim()) { const n = l.split(';').length; counts[n] = (counts[n] || 0) + 1; }
  const width = +Object.entries(counts).sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] || 0; // o mais comum (no empate, o maior)
  const out = [];
  let buf = null, joined = 0;
  for (const l of lines) {
    if (buf === null && !l.trim()) continue;
    const parts = l.split(';');
    if (buf === null) buf = parts;
    else { buf[buf.length - 1] += `\n${parts[0]}`; buf.push(...parts.slice(1)); joined++; }
    if (buf.length >= width) { out.push(buf); buf = null; }
  }
  if (buf) out.push(buf);
  out.joined = joined;
  return out;
}

/* ---------- reconhecimento ---------- */
const share = (rows, fn) => rows.filter(fn).length / Math.max(rows.length, 1);
export function detect(rows, filename = '') {
  const body = rows.filter((r) => r.length > 1).slice(0, 300);
  if (!body.length) return null;
  const n = (k) => share(body, (r) => r.length === k);
  if (n(26) > 0.8 && share(body, (r) => date(r[2]) && DOC_TYPES.includes(r[4]) && num(r[9]) !== null) > 0.8) return 'itens';
  if (n(8) > 0.8 && share(body, (r) => /^\d+\/\d+$/.test(r[0]) && date(r[1]) && num(r[6]) !== null) > 0.8) return 'periodo';
  const titleRows = body.filter((r) => /\S/.test(r[1] || '')); // as linhas de pagamento (sem número do título) não contam
  if (n(10) > 0.8 && titleRows.length && share(titleRows, (r) => (date(r[3]) || date(r[2])) && num(r[5]) !== null && /\S/.test(r[0])) > 0.8) return 'titulos';
  if (n(9) > 0.8 && share(body, (r) => /^\d+$/.test(r[1]) && num(r[5]) !== null && num(r[6]) !== null && Math.abs(num(r[5]) * num(r[6]) - num(r[7])) < 0.05) > 0.8) return 'estoque';
  if (body.some((r) => /==TOTAL/.test(r[1] || '')) && n(15) > 0.8) return 'grupos';
  return null;
}

/* ---------- leitura de cada relatório ---------- */
function parseItens(rows) {
  const out = [], skipped = { status: 0, invalid: 0 };
  for (const r of rows) {
    if (r.length < 22) continue;
    const d = date(r[2]), qty = num(r[7]), price = num(r[8]), total = num(r[9]);
    if (!d || qty === null || total === null) { skipped.invalid++; continue; }
    if (r[4] === 'Pedido' && txt(r[16]) && txt(r[16]) !== 'Encerrado') { skipped.status++; continue; } // pedido que virou nota não conta duas vezes
    const empresa = txt(r[18]);
    out.push({
      tipo: r[4], doc: txt(r[1]), date: d, cliente: txt(r[5]), consumer: txt(r[5]) === empresa,
      qty, price: price ?? (qty ? total / qty : total), total, code: txt(r[12]) || txt(r[0]).split(' - ')[0], product: txt(r[13]) || txt(r[0]),
      category: txt(r[15]) || txt(r[14]) || 'Sem categoria', cost: num(r[20]) || 0, city: txt(r[22]), empresa
    });
  }
  return { rows: out, skipped };
}
function parsePeriodo(rows) {
  return { rows: rows.filter((r) => r.length >= 7 && date(r[1])).map((r) => ({ doc: txt(r[0]), date: date(r[1]), tipo: txt(r[2]), bruto: num(r[4]) ?? 0, desconto: num(r[5]) ?? 0, total: num(r[6]) ?? num(r[4]) ?? 0 })) };
}
function parseTitulos(rows) {
  return {
    rows: rows.filter((r) => r.length >= 8 && num(r[5]) !== null).map((r) => ({
      party: txt(r[0]).replace(/\s+-\s+[\d./-]{11,18}$/, '') || 'Sem nome', doc: txt(r[1]), emissao: date(r[2]), venc: date(r[3]),
      pago_em: date(r[4]), valor: num(r[5]), saldo: num(r[7]), id: txt(r[8])
    }))
  };
}
function parseEstoque(rows) {
  return { rows: rows.filter((r) => r.length >= 8 && /\S/.test(r[1] || '') && num(r[5]) !== null).map((r) => ({ grp: txt(r[0]), code: txt(r[1]), product: txt(r[2]), un: txt(r[3]), qty: num(r[5]), unitCost: num(r[6]) ?? 0, value: num(r[7]) ?? 0 })) };
}
function parseGrupos(rows) {
  let section = '';
  const out = [];
  for (const r of rows) {
    if (txt(r[0])) section = txt(r[0]).toUpperCase();
    const cat = txt(r[1]);
    if (!cat || /==/.test(cat)) continue; // cabeçalho do grupo ou linha de total
    const months = r.slice(2, 14).map((v) => num(v) || 0);
    out.push({ section, category: cat, months });
  }
  return { rows: out };
}

/* ---------- prévia: resumo e avisos antes de importar ---------- */
const sum = (a, f) => a.reduce((s, x) => s + (f(x) || 0), 0);
const brl = (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const range = (ds) => { const s = ds.filter(Boolean).sort(); return s.length ? { from: s[0], to: s[s.length - 1] } : {}; };
const isProd = (g) => /PRODU[ÇC][ÃA]O PR[ÓO]PRIA/i.test(g || '');

export function parseSentus(kind, rows) {
  const parsed = { itens: parseItens, periodo: parsePeriodo, titulos: parseTitulos, estoque: parseEstoque, grupos: parseGrupos }[kind](rows);
  const R = parsed.rows, warnings = [];
  let summary = { count: R.length };
  if (kind === 'itens') {
    const names = {};
    for (const x of R) if (x.empresa) names[x.empresa] = (names[x.empresa] || 0) + 1;
    const [empresa] = Object.entries(names).sort((a, b) => b[1] - a[1])[0] || [''];
    summary = { ...summary, ...range(R.map((x) => x.date)), total: sum(R, (x) => x.total), docs: new Set(R.map((x) => x.tipo + x.doc)).size, empresa };
    const other = R.filter((x) => x.empresa && x.empresa !== empresa).length;
    if (other) warnings.push(`${other} item(ns) com outra empresa na coluna do relatório: entram na unidade escolhida.`);
    if (rows.joined) warnings.push(`${rows.joined} linha(s) quebrada(s) no arquivo (observação com quebra de linha) foram juntadas de volta.`);
    warnings.push('O 26M traz o valor dos itens sem o desconto da nota: importe também o 80M do mesmo período para o faturamento ficar líquido.');
    const noCost = R.filter((x) => !x.cost).length;
    if (noCost) warnings.push(`${noCost} de ${R.length} itens vieram com custo zerado: o custo será estimado pelo estoque (17M) e, sem estoque, por margem de 30%.`);
    if (parsed.skipped.status) warnings.push(`${parsed.skipped.status} item(ns) de pedido que não está "Encerrado" foram ignorados (viraram nota fiscal).`);
    if (parsed.skipped.invalid) warnings.push(`${parsed.skipped.invalid} linha(s) sem data ou valor foram ignoradas.`);
    const cons = R.filter((x) => x.consumer).length;
    if (cons) warnings.push(`${cons} item(ns) sem cliente identificado entram como "Consumidor final".`);
    warnings.push('O relatório não traz vendedor: a tela Equipe comercial fica sem ranking para estes dados.');
  } else if (kind === 'periodo') {
    summary = { ...summary, ...range(R.map((x) => x.date)), total: sum(R, (x) => x.total) };
    summary.discount = sum(R, (x) => x.desconto);
    warnings.push('Este relatório ajusta as vendas por item (26M) já importadas para o total líquido de cada nota (desconto, frete ou acréscimo) e confere os totais; ele não cria vendas novas.');
  } else if (kind === 'titulos') {
    const openOf = (x) => x.saldo ?? (x.pago_em ? 0 : x.valor);
    summary = { ...summary, ...range(R.map((x) => x.venc || x.emissao)), total: sum(R, (x) => x.valor), open: sum(R.filter((x) => openOf(x) > 0), openOf) };
    const partial = R.filter((x) => x.saldo > 0 && x.valor - x.saldo > 0.009).length;
    if (partial) warnings.push(`${partial} título(s) pago(s) em parte: ficam em aberto pelo saldo que falta.`);
    const noDue = R.filter((x) => !x.venc).length;
    if (noDue) warnings.push(`${noDue} título(s) sem vencimento: será usada a data de emissão.`);
  } else if (kind === 'estoque') {
    summary = { ...summary, total: sum(R.filter((x) => x.value > 0), (x) => x.value) };
    const neg = R.filter((x) => x.qty < 0).length;
    if (neg) warnings.push(`${neg} produto(s) com saldo negativo no estoque.`);
    const prod = R.filter((x) => isProd(x.grp)).length;
    if (prod) warnings.push(`${prod} produto(s) de Produção Própria: o valor do estoque é só uma estimativa (70% do maior preço de venda), então o custo deles é aproximado.`);
  } else if (kind === 'grupos') {
    const exp = R.filter((x) => /DESPESA/.test(x.section));
    summary = { ...summary, total: -sum(exp, (x) => sum(x.months, (v) => v)) };
    const noGroup = exp.filter((x) => /N[ÃA]O CLASSIFICADO/i.test(x.category));
    const ng = -sum(noGroup, (x) => sum(x.months, (v) => v));
    if (ng) warnings.push(`${brl(ng)} em despesas sem grupo financeiro ("NAO CLASSIFICADO"): entram como "Sem grupo financeiro".`);
    const rec = sum(R.filter((x) => /RECEITA/.test(x.section)), (x) => sum(x.months, (v) => Math.abs(v)));
    if (rec) warnings.push('As receitas deste relatório são ignoradas: o faturamento vem das vendas (26M).');
  }
  return { kind, label: SENTUS[kind].label, code: SENTUS[kind].code, rows: R, summary, warnings };
}

/* ---------- gravação ---------- */
function replaceDemo(orgId) {
  const o = db.prepare('SELECT is_demo FROM organizations WHERE id = ?').get(orgId);
  if (!o?.is_demo) return false;
  clearOrgData(orgId);
  db.prepare('UPDATE organizations SET is_demo = 0 WHERE id = ?').run(orgId);
  return true;
}

// Custo do produto pelo estoque da mesma empresa (ou da outra, se só ela tiver o item)
function stockCost(orgId, unit) {
  const q = db.prepare("SELECT unit_cost, grp FROM stock WHERE org_id = ? AND code = ? AND unit_cost > 0 ORDER BY (unit = ?) DESC LIMIT 1");
  return (code) => { const s = q.get(orgId, code, unit); return s ? { cost: s.unit_cost, src: isProd(s.grp) ? 'estoque-estimado' : 'estoque' } : null; };
}

// Nome da empresa no 26M → unidade (a filial não vem marcada no arquivo; o Cortex lembra a escolha)
export function rememberedUnit(orgId, empresa) { return (empresa && getSettings(orgId).sentusUnits?.[empresa]) || null; }

function commitItens(orgId, p, unit, notes) {
  if (p.summary.empresa) saveSettings(orgId, { sentusUnits: { [p.summary.empresa]: unit } });
  const fromStock = stockCost(orgId, unit);
  const findC = db.prepare('SELECT id FROM customers WHERE org_id = ? AND name = ?');
  const insC = db.prepare('INSERT INTO customers (org_id, name, region) VALUES (?, ?, ?)');
  const findP = db.prepare('SELECT id FROM products WHERE org_id = ? AND sku = ?');
  const insP = db.prepare('INSERT INTO products (org_id, sku, name, category, price, cost) VALUES (?, ?, ?, ?, ?, ?)');
  const updP = db.prepare('UPDATE products SET name = ?, category = ?, price = ?, cost = ? WHERE id = ?');
  const findO = db.prepare('SELECT id FROM orders WHERE org_id = ? AND external_id = ?');
  const insO = db.prepare('INSERT INTO orders (org_id, customer_id, date, total, external_id, unit) VALUES (?, ?, ?, 0, ?, ?)');
  const insI = db.prepare('INSERT INTO order_items (order_id, product_id, qty, unit_price, unit_cost, cost_src) VALUES (?, ?, ?, ?, ?, ?)');
  const updO = db.prepare('UPDATE orders SET total = total + ? WHERE id = ?');
  const cust = new Map(), prod = new Map(), orders = new Map(), src = {};
  let inserted = 0, skipped = 0;
  for (const x of p.rows) {
    const ext = `sentus:${unit}:${x.tipo}:${x.doc}`;
    let oid = orders.get(ext);
    if (oid === undefined) {
      if (findO.get(orgId, ext)) { orders.set(ext, null); skipped++; continue; } // já importado antes
      const name = x.consumer ? 'Consumidor final' : x.cliente || 'Cliente não informado';
      let cid = cust.get(name);
      if (!cid) { cid = findC.get(orgId, name)?.id ?? insC.run(orgId, name, x.consumer ? null : x.city || null).lastInsertRowid; cust.set(name, cid); }
      oid = insO.run(orgId, cid, x.date, ext, unit).lastInsertRowid;
      orders.set(ext, oid);
    }
    if (oid === null) { skipped++; continue; }
    let c = x.cost > 0 ? { cost: x.cost, src: 'arquivo' } : fromStock(x.code);
    if (!c) c = { cost: x.price * COST_RATIO, src: 'margem' };
    src[c.src] = (src[c.src] || 0) + 1;
    let pid = prod.get(x.code);
    if (!pid) {
      const found = findP.get(orgId, x.code);
      pid = found ? found.id : insP.run(orgId, x.code, x.product, x.category, x.price, c.cost).lastInsertRowid;
      if (found) updP.run(x.product, x.category, x.price, c.cost, pid);
      prod.set(x.code, pid);
    }
    insI.run(oid, pid, x.qty, x.price, c.cost, c.src);
    updO.run(x.total, oid);
    inserted++;
  }
  if (src.estoque) notes.push(`Custo estimado pelo estoque (custo de inventário) em ${src.estoque} item(ns).`);
  if (src['estoque-estimado']) notes.push(`Custo estimado pelo estoque em ${src['estoque-estimado']} item(ns) de Produção Própria: lá o valor é só uma estimativa (70% do maior preço de venda).`);
  const hasStock = db.prepare('SELECT 1 FROM stock WHERE org_id = ? LIMIT 1').get(orgId);
  if (src.margem) notes.push(`${src.margem} item(ns) sem custo e ${hasStock ? 'que não estão no estoque' : 'sem estoque importado'}: custo estimado com margem de 30%.${hasStock ? '' : ' Importe o estoque (17M) antes das vendas para usar o custo de inventário.'}`);
  if (skipped) notes.push(`${skipped} item(ns) de documentos já importados foram ignorados.`);
  return { inserted, orders: [...orders.values()].filter(Boolean).length, unit };
}

function commitTitulos(orgId, p, unit, kind) {
  const find = db.prepare('SELECT id FROM bills WHERE org_id = ? AND unit = ? AND kind = ? AND external_id = ?');
  const ins = db.prepare('INSERT INTO bills (org_id, kind, party, due_date, amount, paid_at, unit, external_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const upd = db.prepare('UPDATE bills SET party = ?, due_date = ?, amount = ?, paid_at = ? WHERE id = ?');
  let inserted = 0, updated = 0;
  for (const x of p.rows) {
    const due = x.venc || x.emissao;
    if (!due) continue;
    const ext = x.id || `${x.doc}|${x.party}`;
    const open = x.saldo > 0 || (x.saldo === null && !x.pago_em); // com saldo: continua em aberto pelo que falta
    const paid = open ? null : x.pago_em || due;
    const amount = Math.abs(x.saldo > 0 ? x.saldo : x.valor);
    const cur = find.get(orgId, unit, kind, ext);
    if (cur) { upd.run(x.party, due, amount, paid, cur.id); updated++; } else { ins.run(orgId, kind, x.party, due, amount, paid, unit, ext); inserted++; }
  }
  return { inserted, updated };
}

function commitEstoque(orgId, p, unit, notes) {
  db.prepare('DELETE FROM stock WHERE org_id = ? AND unit = ?').run(orgId, unit); // é uma fotografia: troca a anterior
  const ins = db.prepare('INSERT OR REPLACE INTO stock (org_id, unit, code, product, grp, un, qty, unit_cost, value) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
  for (const x of p.rows) ins.run(orgId, unit, x.code, x.product, x.grp, x.un, x.qty, x.unitCost, x.value);
  // Vendas que ficaram com custo estimado pela margem passam a usar o custo do estoque
  const fix = db.prepare(`
    UPDATE order_items SET
      unit_cost = (SELECT s.unit_cost FROM stock s JOIN products p ON p.sku = s.code WHERE p.id = order_items.product_id AND s.org_id = ? AND s.unit = ? AND s.unit_cost > 0),
      cost_src = (SELECT CASE WHEN s.grp LIKE 'PRODU%PR%PRIA' THEN 'estoque-estimado' ELSE 'estoque' END FROM stock s JOIN products p ON p.sku = s.code WHERE p.id = order_items.product_id AND s.org_id = ? AND s.unit = ? AND s.unit_cost > 0)
    WHERE cost_src = 'margem' AND order_id IN (SELECT id FROM orders WHERE org_id = ? AND unit = ?)
      AND EXISTS (SELECT 1 FROM stock s JOIN products p ON p.sku = s.code WHERE p.id = order_items.product_id AND s.org_id = ? AND s.unit = ? AND s.unit_cost > 0)`)
    .run(orgId, unit, orgId, unit, orgId, unit, orgId, unit);
  if (fix.changes) { notes.push(`${fix.changes} item(ns) de vendas já importadas passaram a usar o custo do estoque.`); clearProductCache(); }
  return { inserted: p.rows.length };
}

function commitGrupos(orgId, p, unit, year, notes, ungroupedInProfit) {
  db.prepare(`DELETE FROM expenses WHERE org_id = ? AND unit = ? AND description = ? AND date LIKE ?`).run(orgId, unit, EXP_DESC, `${year}-%`);
  const ins = db.prepare('INSERT INTO expenses (org_id, date, category, description, amount, unit, in_profit) VALUES (?, ?, ?, ?, ?, ?, ?)');
  let inserted = 0, outside = 0;
  for (const x of p.rows.filter((r) => /DESPESA/.test(r.section))) {
    const noGroup = /N[ÃA]O CLASSIFICADO/i.test(x.category);
    const cat = noGroup ? (ungroupedInProfit ? 'Sem grupo financeiro' : 'Sem grupo financeiro (fora do lucro)') : x.category;
    const inProfit = noGroup && !ungroupedInProfit ? 0 : 1;
    x.months.forEach((v, i) => { if (v) { ins.run(orgId, `${year}-${String(i + 1).padStart(2, '0')}-01`, cat, EXP_DESC, -v, unit, inProfit); inserted++; if (!inProfit) outside -= v; } });
  }
  if (outside) notes.push(`${brl(outside)} em despesas sem grupo foram gravadas, mas não entram no cálculo do lucro (provavelmente incluem compras de mercadoria, que já entram como custo das vendas).`);
  notes.push(`Despesas gravadas por mês de ${year} (dia 1 de cada mês). Importar de novo o mesmo ano substitui os valores.`);
  return { inserted };
}

function applyDiscounts(orgId, p, unit, notes) {
  const find = db.prepare('SELECT id, total FROM orders WHERE org_id = ? AND external_id = ?');
  const scaleItems = db.prepare('UPDATE order_items SET unit_price = unit_price * ? WHERE order_id = ?');
  const setTotal = db.prepare('UPDATE orders SET total = ? WHERE id = ?');
  let applied = 0, amount = 0, other = 0, otherAmount = 0, missing = 0, mismatch = 0;
  for (const x of p.rows) {
    const o = find.get(orgId, `sentus:${unit}:${x.tipo}:${x.doc}`);
    if (!o) { missing++; continue; }
    if (Math.abs(o.total - x.total) < 0.01) continue; // já está líquido (ou importado de novo)
    // o total líquido da nota (80M) é o valor final: desconto, frete ou acréscimo entram no faturamento
    if (o.total <= 0) { mismatch++; continue; }
    scaleItems.run(x.total / o.total, o.id); setTotal.run(x.total, o.id);
    if (x.desconto > 0 && Math.abs(o.total - x.bruto) < 0.02) { applied++; amount += o.total - x.total; } else { other++; otherAmount += x.total - o.total; }
  }
  if (applied || other) clearProductCache();
  if (applied) notes.push(`Desconto aplicado em ${applied} nota(s): ${brl(amount)} a menos no faturamento, que agora está líquido.`);
  if (other) notes.push(`${other} nota(s) com outra diferença (ex.: frete ou acréscimo) passaram a usar o total líquido da nota: ${brl(otherAmount)} de ajuste no faturamento.`);
  if (mismatch) notes.push(`${mismatch} nota(s) sem valor nos itens não puderam ser ajustadas.`);
  if (missing) notes.push(`${missing} nota(s) do 80M ainda não têm as vendas por item (26M) da ${UNIT_LABEL[unit]} no Cortex: importe o 26M e depois o 80M de novo para aplicar os descontos.`);
}

function checkPeriodo(orgId, p, unit, notes) {
  applyDiscounts(orgId, p, unit, notes);
  const { from, to } = p.summary;
  const r = db.prepare("SELECT COALESCE(SUM(total),0) v, COUNT(*) n FROM orders WHERE org_id = ? AND unit = ? AND date BETWEEN ? AND ? AND external_id LIKE 'sentus:%'").get(orgId, unit, from, to);
  if (!r.n) notes.push(`Ainda não há vendas por item (26M) da ${UNIT_LABEL[unit]} neste período para conferir.`);
  else {
    const diff = p.summary.total - r.v;
    notes.push(Math.abs(diff) < 1 ? `Conferido: o total por período bate com as vendas por item (${brl(r.v)}).` : `Diferença de ${brl(diff)} entre o relatório por período (${brl(p.summary.total)}) e as vendas por item (${brl(r.v)}).`);
  }
  return { inserted: 0 };
}

export function commitSentus(orgId, userId, p, { unit = 'matriz', titleKind = 'pagar', year = new Date().getFullYear(), filename = '', ungrouped = 'fora' } = {}) {
  unit = UNIT_LABEL[unit] ? unit : 'matriz';
  titleKind = titleKind === 'receber' ? 'receber' : 'pagar';
  year = Math.min(2100, Math.max(2000, +year || new Date().getFullYear()));
  const notes = [];
  let result, replacedDemo = false;
  db.transaction(() => {
    if (p.kind !== 'periodo') replacedDemo = replaceDemo(orgId);
    result = p.kind === 'itens' ? commitItens(orgId, p, unit, notes)
      : p.kind === 'titulos' ? commitTitulos(orgId, p, unit, titleKind)
      : p.kind === 'estoque' ? commitEstoque(orgId, p, unit, notes)
      : p.kind === 'grupos' ? commitGrupos(orgId, p, unit, year, notes, ungrouped === 'dentro')
      : checkPeriodo(orgId, p, unit, notes);
  })();
  const u = UNIT_LABEL[result.unit || unit];
  const type = p.kind === 'titulos' ? 'contas' : SENTUS[p.kind].type;
  logEvent(orgId, userId, 'import', `${filename || p.label}: ${p.label} · ${u}${p.kind === 'titulos' ? ` (${titleKind === 'pagar' ? 'a pagar' : 'a receber'})` : ''} · ${result.inserted} linha(s)`, 'ok', { type, unit: result.unit || unit, sentus: p.code });
  return { ...result, kind: p.kind, label: p.label, unitLabel: u, replacedDemo, notes: [...p.warnings.filter((w) => !/não cria vendas novas/.test(w)), ...notes] };
}
