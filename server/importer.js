// Importação de planilhas (CSV e Excel): leitura, detecção do tipo, mapeamento de colunas, validação e gravação.
import ExcelJS from 'exceljs';
import { db, logEvent } from './db.js';
import { clearOrgData } from './seed.js';
import { isIso } from './dates.js';
import { detect as detectSentus, parseSentus, splitRecords } from './sentus.js';

/* ---------------- Tipos de planilha ---------------- */
export const TYPES = {
  vendas: {
    label: 'Vendas',
    fields: [
      { key: 'data', label: 'Data da venda', required: true, kind: 'date', aliases: ['data', 'data venda', 'data da venda', 'data pedido', 'dt', 'emissao', 'data emissao', 'dt emissao'] },
      { key: 'pedido', label: 'Nº do pedido / nota', kind: 'text', aliases: ['pedido', 'nf', 'nota', 'numero', 'num pedido', 'n pedido', 'documento', 'nota fiscal'] },
      { key: 'cliente', label: 'Cliente', kind: 'text', aliases: ['cliente', 'razao social', 'nome cliente', 'cod cliente', 'nome'] },
      { key: 'produto', label: 'Produto', kind: 'text', aliases: ['produto', 'descricao', 'item', 'descricao produto', 'nome produto'] },
      { key: 'categoria', label: 'Categoria', kind: 'text', aliases: ['categoria', 'grupo', 'familia', 'linha', 'departamento'] },
      { key: 'quantidade', label: 'Quantidade', kind: 'number', aliases: ['quantidade', 'qtd', 'qtde', 'quant', 'qt'] },
      { key: 'valor_unitario', label: 'Valor unitário', kind: 'number', aliases: ['valor unitario', 'vl unit', 'preco', 'preco unitario', 'vlr unit', 'unitario'] },
      { key: 'valor_total', label: 'Valor total', kind: 'number', aliases: ['valor total', 'vl total', 'total', 'valor', 'vlr total'] },
      { key: 'custo_unitario', label: 'Custo unitário', kind: 'number', aliases: ['custo unitario', 'custo', 'vl custo', 'cmv', 'custo medio'] },
      { key: 'vendedor', label: 'Vendedor', kind: 'text', aliases: ['vendedor', 'representante', 'rca', 'consultor'] },
      { key: 'regiao', label: 'Região', kind: 'text', aliases: ['regiao', 'cidade', 'rota', 'praca'] }
    ]
  },
  despesas: {
    label: 'Despesas',
    fields: [
      { key: 'data', label: 'Data', required: true, kind: 'date', aliases: ['data', 'data pagamento', 'competencia', 'dt', 'vencimento'] },
      { key: 'categoria', label: 'Categoria', kind: 'text', aliases: ['categoria', 'conta', 'plano de contas', 'grupo', 'centro de custo'] },
      { key: 'descricao', label: 'Descrição', kind: 'text', aliases: ['descricao', 'historico', 'fornecedor', 'detalhe'] },
      { key: 'valor', label: 'Valor', required: true, kind: 'number', aliases: ['valor', 'vl', 'montante', 'total', 'valor pago'] }
    ]
  },
  contas: {
    label: 'Contas a pagar e receber',
    fields: [
      { key: 'tipo', label: 'Tipo (pagar/receber)', required: true, kind: 'text', aliases: ['tipo', 'natureza', 'pagar receber', 'operacao'] },
      { key: 'parceiro', label: 'Fornecedor / cliente', required: true, kind: 'text', aliases: ['parceiro', 'fornecedor', 'cliente', 'nome', 'favorecido'] },
      { key: 'vencimento', label: 'Vencimento', required: true, kind: 'date', aliases: ['vencimento', 'data vencimento', 'dt vencimento', 'vence em'] },
      { key: 'valor', label: 'Valor', required: true, kind: 'number', aliases: ['valor', 'vl', 'montante', 'total'] },
      { key: 'pago_em', label: 'Pago/recebido em', kind: 'date', aliases: ['pago em', 'pagamento', 'data pagamento', 'baixa', 'recebido em', 'quitado em'] }
    ]
  },
  metas: {
    label: 'Metas',
    fields: [
      { key: 'mes', label: 'Mês', kind: 'month', aliases: ['mes', 'periodo', 'competencia', 'mes ano'] },
      { key: 'meta', label: 'Meta de faturamento', required: true, kind: 'number', aliases: ['meta', 'meta faturamento', 'meta receita', 'valor', 'objetivo'] },
      { key: 'vendedor', label: 'Vendedor (opcional)', kind: 'text', aliases: ['vendedor', 'representante'] },
      { key: 'categoria', label: 'Categoria (opcional)', kind: 'text', aliases: ['categoria', 'grupo', 'linha'] }
    ]
  }
};

export const norm = (s) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

/* ---------------- Leitura ---------------- */
function parseCsv(text) {
  text = text.replace(/^﻿/, '');
  const firstLine = text.slice(0, text.indexOf('\n') > 0 ? text.indexOf('\n') : text.length);
  const delim = [';', ',', '\t'].map((d) => [d, firstLine.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = [];
  let row = [], field = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === delim) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

function cellValue(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    if ('result' in v) return cellValue(v.result);
    if ('richText' in v) return v.richText.map((t) => t.text).join('');
    if ('text' in v) return v.text;
    return '';
  }
  return v;
}

// Linha do cabeçalho: relatórios costumam ter título, filtros e linhas em branco antes das colunas.
// Escolhe, entre as 20 primeiras, a que tem mais nomes de coluna conhecidos.
let KNOWN = null;
function headerScore(row) {
  if (!KNOWN) KNOWN = new Set(Object.values(TYPES).flatMap((t) => t.fields.flatMap((f) => [norm(f.key), ...f.aliases])));
  let n = 0;
  for (const c of row) {
    const h = norm(c);
    if (!h || h.length > 40) continue;
    if (KNOWN.has(h) || monthHeader(c)) n++;
    else if ([...KNOWN].some((a) => a.length > 3 && h.includes(a))) n += 0.5;
  }
  return n;
}
function findHeader(rows) {
  let best = 0, score = -1;
  rows.slice(0, 20).forEach((r, i) => { const s = headerScore(r); if (s > score) { score = s; best = i; } });
  return score >= 2 ? best : 0;
}

// Cabeçalho que é um mês ("Jan", "janeiro", "out/26", "10/2026", data do Excel) → "AAAA-MM"
const MES_NOMES = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export function monthHeader(h) {
  if (h === '' || h === null || h === undefined || typeof h === 'number') return null;
  const s = norm(h);
  const i = MES_NOMES.findIndex((m) => s === m || s === m.slice(0, 3));
  if (i >= 0) return `${new Date().getFullYear()}-${String(i + 1).padStart(2, '0')}`;
  return /[a-z]{3}|\d{1,2} \d{2,4}|\d{4} \d{1,2}|^\d{4} \d{2} \d{2}/.test(s) ? parseMonth(h) : null;
}

// Metas "largas" (um mês por coluna) viram uma linha por mês: Mês | Meta | Vendedor/Categoria
function unpivotMonths(headers, rows) {
  const months = headers.map(monthHeader);
  const mesField = TYPES.metas.fields.find((f) => f.key === 'mes');
  if (months.filter(Boolean).length < 3 || headers.some((h) => mesField.aliases.includes(norm(h)))) return null;
  const labelIdx = headers.findIndex((_, i) => !months[i] && rows.some((r) => typeof r[i] === 'string' && r[i].trim() && parseNumber(r[i]) === null));
  const lh = labelIdx >= 0 ? norm(headers[labelIdx]) : '';
  const cat = TYPES.metas.fields.find((f) => f.key === 'categoria').aliases;
  const dim = cat.includes(lh) || lh.includes('categ') ? 'Categoria' : 'Vendedor';
  const out = [];
  for (const r of rows) {
    const label = labelIdx >= 0 ? String(r[labelIdx] ?? '').trim() : '';
    months.forEach((m, i) => {
      const v = parseNumber(r[i]);
      if (m && v !== null) out.push([m, v, /^(total|soma|geral)/.test(norm(label)) ? '' : label]);
    });
  }
  return { headers: ['Mês', 'Meta', dim], rows: out, reshaped: true };
}

function splitRows(rows) {
  const hi = findHeader(rows);
  const head = rows[hi];
  const width = Math.max(head.length, 1);
  const headers = Array.from({ length: width }, (_, i) => String(head[i] ?? '').trim() || `Coluna ${i + 1}`);
  const data = rows.slice(hi + 1).map((r) => headers.map((_, i) => (r[i] === undefined ? '' : r[i])));
  return unpivotMonths(headers, data) || { headers, rows: data, ...(hi ? { skippedTop: hi } : {}) };
}

// Abas cujo tipo foi detectado com todas as colunas obrigatórias (uma por tipo)
function recognizedSheets(list) {
  const out = [], used = new Set();
  for (const { name, rows } of list) {
    if (rows.length < 2) continue;
    const { headers, rows: data } = splitRows(rows);
    const type = detectType(headers);
    const mapping = autoMap(type, headers);
    if (used.has(type) || validate(type, [], mapping).missing.length) continue;
    used.add(type);
    out.push({ name, type, headers, rows: data, mapping });
  }
  return out;
}

export async function readFile(buffer, filename) {
  const ext = String(filename).toLowerCase().split('.').pop();
  let rows;
  const extra = {};
  if (ext === 'csv' || ext === 'txt') {
    let text = buffer.toString('utf8');
    if (text.includes('�')) text = buffer.toString('latin1'); // planilhas antigas do Excel em ANSI
    // Relatórios do ERP SENTUS: sem cabeçalho e sem aspas, reconhecidos pela estrutura das linhas
    const plain = splitRecords(text);
    const kind = detectSentus(plain, filename);
    if (kind) return { sentus: parseSentus(kind, plain), headers: [], rows: [] };
    rows = parseCsv(text);
  } else if (ext === 'xlsx' || ext === 'xlsm') {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    // Lê só até a última coluna do cabeçalho: planilhas reais costumam ter células "fantasma"
    // (formatação, espaço) lá na coluna XFD, e ler 16 mil colunas por linha travava o servidor.
    const MAX_COLS = 200;
    const sheetRows = (ws) => {
      const out = [];
      ws.eachRow({ includeEmpty: false }, (r) => {
        const raw = r.values || [];
        const limit = Math.min(raw.length - 1, MAX_COLS);
        const vals = [];
        for (let i = 1; i <= limit; i++) vals.push(cellValue(raw[i]));
        while (vals.length && String(vals[vals.length - 1]).trim() === '') vals.pop();
        if (vals.length) out.push(vals);
      });
      return out;
    };
    const ws = wb.worksheets.find((w) => w.actualRowCount > 1) || wb.worksheets[0];
    if (!ws) throw new Error('A planilha está vazia.');
    rows = sheetRows(ws);
    // Arquivo com várias abas (vendas, despesas, contas, metas): guarda as que foram reconhecidas
    const sheets = recognizedSheets(wb.worksheets.filter((w) => w.actualRowCount > 1).map((w) => ({ name: w.name, rows: w === ws ? rows : sheetRows(w) })));
    if (sheets.length > 1) extra.sheets = sheets;
  } else if (ext === 'xls') {
    throw new Error('Arquivos .xls (Excel 97-2003) não são suportados. Abra no Excel e salve como .xlsx ou .csv.');
  } else {
    throw new Error('Formato não suportado. Use .xlsx ou .csv.');
  }
  if (rows.length < 2) throw new Error('A planilha precisa ter uma linha de cabeçalho e pelo menos uma linha de dados.');
  return { ...splitRows(rows), ...extra };
}

/* ---------------- Detecção e mapeamento ---------------- */
export function autoMap(type, headers) {
  const nh = headers.map(norm);
  const used = new Set();
  const map = {};
  for (const f of TYPES[type].fields) {
    let idx = nh.findIndex((h, i) => !used.has(i) && (h === norm(f.key) || f.aliases.includes(h)));
    if (idx < 0) idx = nh.findIndex((h, i) => !used.has(i) && f.aliases.some((a) => a.length > 3 && h.includes(a)));
    if (idx >= 0) { map[f.key] = idx; used.add(idx); }
  }
  return map;
}

const SIGNATURE = { vendas: ['cliente', 'produto', 'quantidade', 'vendedor', 'regiao', 'pedido'], despesas: ['categoria', 'descricao'], contas: ['tipo', 'parceiro', 'vencimento'], metas: ['mes'] };
export function detectType(headers) {
  let best = 'vendas', score = -1;
  for (const t of Object.keys(TYPES)) {
    const m = autoMap(t, headers);
    const req = TYPES[t].fields.filter((f) => f.required);
    let s = req.filter((f) => m[f.key] !== undefined).length / req.length + Object.keys(m).length * 0.01;
    if (t === 'vendas') s = (s + (m.valor_unitario !== undefined || m.valor_total !== undefined ? 1 : 0)) / 2 + Object.keys(m).length * 0.005;
    // colunas típicas de cada tipo desempatam (ex.: Data | Categoria | Valor é despesa, Data | Vendedor | Valor é venda)
    s += (SIGNATURE[t] || []).filter((k) => m[k] !== undefined).length * 0.1;
    // Metas só com uma coluna "Valor" é pouco: exige o mês ou a palavra meta/objetivo no cabeçalho
    if (t === 'metas' && m.mes === undefined && !headers.some((h) => /meta|objetivo/.test(norm(h)))) s *= 0.4;
    if (s > score) { score = s; best = t; }
  }
  return best;
}

/* ---------------- Conversão de valores ---------------- */
function excelSerialToIso(n) {
  const d = new Date(Date.UTC(1899, 11, 30) + Math.round(n) * 864e5);
  return d.toISOString().slice(0, 10);
}

export function parseDate(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v > 20000 && v < 80000 ? excelSerialToIso(v) : null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return isIso(`${m[1]}-${m[2]}-${m[3]}`) ? `${m[1]}-${m[2]}-${m[3]}` : null;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const iso = `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    return isIso(iso) ? iso : null;
  }
  if (/^\d{5}$/.test(s)) return excelSerialToIso(+s);
  return null;
}

const MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
export function parseMonth(v) {
  if (v === '' || v === null || v === undefined) return null;
  const d = parseDate(v);
  if (d) return d.slice(0, 7);
  const s = norm(v);
  let m = s.match(/^(\d{1,2}) (\d{4})$/);
  if (m && +m[1] >= 1 && +m[1] <= 12) return `${m[2]}-${m[1].padStart(2, '0')}`;
  m = s.match(/^(\d{4}) (\d{1,2})$/);
  if (m && +m[2] >= 1 && +m[2] <= 12) return `${m[1]}-${m[2].padStart(2, '0')}`;
  m = s.match(/^([a-z]{3})[a-z]* (\d{2,4})$/);
  if (m && MESES[m[1]]) return `${m[2].length === 2 ? `20${m[2]}` : m[2]}-${String(MESES[m[1]]).padStart(2, '0')}`;
  return null;
}

export function parseNumber(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  let s = String(v).trim().replace(/[R$\s ]/g, '');
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  s = s.replace(/[()-]/g, '');
  if (!s) return null;
  const lastComma = s.lastIndexOf(','), lastDot = s.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) s = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  else if (lastComma >= 0) s = s.replace(/\./g, '').replace(',', '.');
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) ? (neg ? -n : n) : null;
}

/* ---------------- Validação ---------------- */
export function validate(type, rows, mapping) {
  const def = TYPES[type];
  if (!def) throw new Error('Tipo de planilha inválido.');
  const missing = def.fields.filter((f) => f.required && (mapping[f.key] === undefined || mapping[f.key] === null || mapping[f.key] === ''));
  if (type === 'vendas' && mapping.valor_unitario === undefined && mapping.valor_total === undefined) missing.push({ label: 'Valor unitário ou Valor total' });
  if (missing.length) return { ok: false, missing: missing.map((f) => f.label), errors: [], valid: [], total: rows.length };

  const errors = [], valid = [];
  const filled = { cliente: 0, produto: 0, quantidade: 0, categoria: 0, mes: 0 };
  let totals = 0;
  rows.forEach((r, i) => {
    const out = {}, rowErr = [];
    const fill = [];
    for (const f of def.fields) {
      const idx = mapping[f.key];
      if (idx === undefined || idx === null || idx === '') continue;
      const raw = r[+idx];
      let v;
      if (f.kind === 'date') v = parseDate(raw);
      else if (f.kind === 'month') v = parseMonth(raw);
      else if (f.kind === 'number') v = parseNumber(raw);
      else v = String(raw ?? '').trim() || null;
      if (v === null && raw !== '' && raw !== null && raw !== undefined) rowErr.push(`${f.label}: "${String(raw).slice(0, 30)}" não é ${f.kind === 'number' ? 'um número' : f.kind === 'date' ? 'uma data válida' : 'um mês válido'}`);
      else if (v === null && f.required) rowErr.push(`${f.label} vazio`);
      out[f.key] = v;
    }
    if (type === 'vendas') {
      if (!out.cliente) { out.cliente = 'Cliente não informado'; fill.push('cliente'); }
      if (!out.produto) { out.produto = 'Produto não informado'; fill.push('produto'); }
      if (out.quantidade == null) { out.quantidade = 1; fill.push('quantidade'); }
      if (out.quantidade !== null && out.quantidade <= 0) rowErr.push('Quantidade precisa ser maior que zero');
      if (out.valor_unitario == null && out.valor_total == null) rowErr.push('Sem valor unitário nem total');
    }
    if (type === 'despesas' && !out.categoria) { out.categoria = 'Sem categoria'; fill.push('categoria'); }
    if (type === 'metas' && !out.mes) { out.mes = new Date().toISOString().slice(0, 7); fill.push('mes'); }
    if (type === 'contas' && out.tipo) {
      const t = norm(out.tipo);
      out.tipo = /pag|desp|forn|saida|deb/.test(t) ? 'pagar' : /rec|cli|entrada|cred/.test(t) ? 'receber' : null;
      if (!out.tipo) rowErr.push('Tipo precisa ser "pagar" ou "receber"');
    }
    // Linha de total/subtotal do relatório (que não passa na validação): ignora sem contar como erro.
    // Um cliente chamado "Total Distribuidora" numa linha válida continua sendo importado.
    const firstText = r.find((c) => typeof c === 'string' && c.trim());
    if (rowErr.length && firstText && /^(total|subtotal|soma|totais)\b/.test(norm(firstText))) totals++;
    else if (rowErr.length) errors.push({ row: i + 2, messages: rowErr });
    else { valid.push(out); fill.forEach((k) => filled[k]++); }
  });

  const summary = { };
  const dates = valid.map((v) => v.data || v.vencimento).filter(Boolean).sort();
  if (dates.length) { summary.from = dates[0]; summary.to = dates[dates.length - 1]; }
  if (type === 'vendas') {
    summary.revenue = valid.reduce((s, v) => s + (v.valor_total ?? v.quantidade * v.valor_unitario), 0);
    summary.customers = new Set(valid.map((v) => v.cliente)).size;
    summary.products = new Set(valid.map((v) => v.produto)).size;
    summary.missingCost = valid.filter((v) => v.custo_unitario == null).length;
  }
  if (type === 'despesas' || type === 'contas') summary.amount = valid.reduce((s, v) => s + Math.abs(v.valor), 0);
  const NOTE = {
    cliente: (n) => `${n} linha(s) sem cliente: entram como "Cliente não informado".`,
    produto: (n) => `${n} linha(s) sem produto: entram como "Produto não informado".`,
    quantidade: (n) => `${n} linha(s) sem quantidade: considerada quantidade 1.`,
    categoria: (n) => `${n} despesa(s) sem categoria: entram como "Sem categoria".`,
    mes: (n) => `${n} meta(s) sem mês: consideradas para o mês atual (${new Date().toISOString().slice(5, 7)}/${new Date().getFullYear()}).`
  };
  summary.notes = Object.entries(filled).filter(([, n]) => n).map(([k, n]) => NOTE[k](n));
  if (totals) summary.notes.push(`${totals} linha(s) de total ignorada(s).`);
  return { ok: errors.length === 0 || valid.length > 0, missing: [], errors: errors.slice(0, 50), errorCount: errors.length, valid, total: rows.length, summary };
}

/* ---------------- Gravação ---------------- */
const DEFAULT_COST_RATIO = 0.7; // sem custo na planilha: estima margem bruta de 30%

export function commit(orgId, userId, type, valid, { mode = 'append', filename = '' } = {}) {
  const org = db.prepare('SELECT is_demo FROM organizations WHERE id = ?').get(orgId);
  const result = { type, inserted: 0, skipped: 0, replacedDemo: false };

  db.transaction(() => {
    if (org.is_demo) {
      clearOrgData(orgId);
      db.prepare('UPDATE organizations SET is_demo = 0 WHERE id = ?').run(orgId);
      result.replacedDemo = true;
    }
    if (type === 'vendas') {
      if (mode === 'replace' && !result.replacedDemo) db.prepare('DELETE FROM orders WHERE org_id = ?').run(orgId);
      const findC = db.prepare('SELECT id FROM customers WHERE org_id = ? AND name = ?');
      const insC = db.prepare('INSERT INTO customers (org_id, name, seller, region) VALUES (?, ?, ?, ?)');
      const updC = db.prepare('UPDATE customers SET seller = COALESCE(?, seller), region = COALESCE(?, region) WHERE id = ?');
      const findP = db.prepare('SELECT id, cost FROM products WHERE org_id = ? AND name = ?');
      const insP = db.prepare('INSERT INTO products (org_id, name, category, price, cost) VALUES (?, ?, ?, ?, ?)');
      const updP = db.prepare('UPDATE products SET category = COALESCE(?, category), price = ?, cost = ? WHERE id = ?');
      const findO = db.prepare('SELECT id FROM orders WHERE org_id = ? AND external_id = ?');
      const insO = db.prepare('INSERT INTO orders (org_id, customer_id, date, total, seller, external_id) VALUES (?, ?, ?, 0, ?, ?)');
      const insI = db.prepare('INSERT INTO order_items (order_id, product_id, qty, unit_price, unit_cost) VALUES (?, ?, ?, ?, ?)');
      const updO = db.prepare('UPDATE orders SET total = total + ? WHERE id = ?');
      const customers = new Map(), products = new Map(), orders = new Map();
      for (const v of valid) {
        let cid = customers.get(v.cliente);
        if (!cid) {
          cid = findC.get(orgId, v.cliente)?.id ?? insC.run(orgId, v.cliente, v.vendedor, v.regiao).lastInsertRowid;
          if (v.vendedor || v.regiao) updC.run(v.vendedor, v.regiao, cid);
          customers.set(v.cliente, cid);
        }
        const unit = v.valor_unitario ?? v.valor_total / v.quantidade;
        const cost = v.custo_unitario ?? unit * DEFAULT_COST_RATIO;
        let pid = products.get(v.produto);
        if (!pid) {
          const p = findP.get(orgId, v.produto);
          pid = p ? p.id : insP.run(orgId, v.produto, v.categoria || 'Sem categoria', unit, cost).lastInsertRowid;
          if (p) updP.run(v.categoria, unit, cost, pid);
          products.set(v.produto, pid);
        }
        const okey = v.pedido ? `p:${v.pedido}` : `d:${v.data}|${v.cliente}`;
        let oid = orders.get(okey);
        if (oid === undefined) {
          const ext = v.pedido ? String(v.pedido) : null;
          if (ext && mode === 'append' && findO.get(orgId, ext)) { orders.set(okey, null); result.skipped++; continue; }
          oid = insO.run(orgId, cid, v.data, v.vendedor, ext).lastInsertRowid;
          orders.set(okey, oid);
        }
        if (oid === null) { result.skipped++; continue; }
        insI.run(oid, pid, v.quantidade, unit, cost);
        updO.run(v.quantidade * unit, oid);
        result.inserted++;
      }
      result.orders = [...orders.values()].filter(Boolean).length;
    } else if (type === 'despesas') {
      if (mode === 'replace' && !result.replacedDemo) db.prepare('DELETE FROM expenses WHERE org_id = ?').run(orgId);
      const ins = db.prepare('INSERT INTO expenses (org_id, date, category, description, amount) VALUES (?, ?, ?, ?, ?)');
      for (const v of valid) { ins.run(orgId, v.data, v.categoria, v.descricao, Math.abs(v.valor)); result.inserted++; }
    } else if (type === 'contas') {
      if (mode === 'replace' && !result.replacedDemo) db.prepare('DELETE FROM bills WHERE org_id = ?').run(orgId);
      const ins = db.prepare('INSERT INTO bills (org_id, kind, party, due_date, amount, paid_at) VALUES (?, ?, ?, ?, ?, ?)');
      for (const v of valid) { ins.run(orgId, v.tipo, v.parceiro, v.vencimento, Math.abs(v.valor), v.pago_em); result.inserted++; }
    } else if (type === 'metas') {
      const g = db.prepare('INSERT INTO goals (org_id, month, revenue_target) VALUES (?, ?, ?) ON CONFLICT(org_id, month) DO UPDATE SET revenue_target = excluded.revenue_target');
      const gi = db.prepare('INSERT INTO goal_items (org_id, month, dim, key, target) VALUES (?, ?, ?, ?, ?) ON CONFLICT(org_id, month, dim, key) DO UPDATE SET target = excluded.target');
      for (const v of valid) {
        if (v.vendedor) gi.run(orgId, v.mes, 'vendedor', v.vendedor, v.meta);
        else if (v.categoria) gi.run(orgId, v.mes, 'categoria', v.categoria, v.meta);
        else g.run(orgId, v.mes, v.meta);
        result.inserted++;
      }
    }
  })();

  logEvent(orgId, userId, 'import', `${filename || TYPES[type].label}: ${result.inserted} linha(s) importada(s)${result.skipped ? `, ${result.skipped} repetida(s) ignorada(s)` : ''}`, 'ok', result);
  return result;
}

// Importa todas as abas reconhecidas de um arquivo, na ordem vendas → despesas → contas → metas
export function importAll(orgId, userId, sheets, { filename = '' } = {}) {
  const order = Object.keys(TYPES);
  const results = [];
  for (const sh of [...sheets].sort((a, b) => order.indexOf(a.type) - order.indexOf(b.type))) {
    const v = validate(sh.type, sh.rows, sh.mapping);
    if (v.missing.length || !v.valid.length) { results.push({ sheet: sh.name, type: sh.type, inserted: 0, errorCount: v.errorCount || 0, error: 'Nenhuma linha válida' }); continue; }
    const r = commit(orgId, userId, sh.type, v.valid, { mode: 'append', filename: `${filename} · aba ${sh.name}` });
    results.push({ sheet: sh.name, ...r, errorCount: v.errorCount, notes: v.summary.notes });
  }
  return { results, replacedDemo: results.some((r) => r.replacedDemo) };
}

/* ---------------- Sessões de importação (entre prévia e confirmação) ---------------- */
const pending = new Map();
export function stash(orgId, filename, parsed) {
  const token = Math.random().toString(36).slice(2) + Date.now().toString(36);
  pending.set(token, { orgId, filename, ...parsed, at: Date.now() });
  for (const [k, v] of pending) if (Date.now() - v.at > 3600e3) pending.delete(k);
  return token;
}
export function unstash(orgId, token) {
  const p = pending.get(token);
  if (!p || p.orgId !== orgId) throw new Error('A prévia expirou. Envie o arquivo de novo.');
  return p;
}
export function drop(token) { pending.delete(token); }
