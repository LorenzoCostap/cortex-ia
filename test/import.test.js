// Importação de planilhas, metas e backup.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import ExcelJS from 'exceljs';

process.env.CORTEX_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-imp-'));
const { db } = await import('../server/db.js');
const { createOrganization } = await import('../server/seed.js');
const I = await import('../server/importer.js');
const M = await import('../server/metrics.js');
const B = await import('../server/backup.js');

const org = createOrganization({ slug: 'teste', name: 'Teste', adminName: 'A', adminEmail: 'a@a.com', password: 'senha1234' });

test('números e datas no formato brasileiro', () => {
  assert.equal(I.parseNumber('1.234,56'), 1234.56);
  assert.equal(I.parseNumber('R$ 12.000'), 12000);
  assert.equal(I.parseNumber('18.90'), 18.9);
  assert.equal(I.parseNumber('(150,00)'), -150);
  assert.equal(I.parseNumber('abc'), null);
  assert.equal(I.parseDate('02/09/2026'), '2026-09-02');
  assert.equal(I.parseDate('2/9/26'), '2026-09-02');
  assert.equal(I.parseDate('31/02/2026'), null);
  assert.equal(I.parseDate(46267), '2026-09-02');
  assert.equal(I.parseMonth('10/2026'), '2026-10');
  assert.equal(I.parseMonth('out/2026'), '2026-10');
  assert.equal(I.parseMonth('2026-10'), '2026-10');
});

test('CSV com ponto e vírgula, aspas e acentos é lido e mapeado', async () => {
  const csv = '﻿Data Pedido;Pedido;Cliente;Descrição;Qtd;"Vl Unit"\n01/10/2026;1;"Mercado ""Bom""";Café;2;"1.018,90"\n';
  const p = await I.readFile(Buffer.from(csv), 'v.csv');
  assert.deepEqual(p.headers, ['Data Pedido', 'Pedido', 'Cliente', 'Descrição', 'Qtd', 'Vl Unit']);
  assert.equal(p.rows[0][2], 'Mercado "Bom"');
  assert.equal(I.detectType(p.headers), 'vendas');
  const m = I.autoMap('vendas', p.headers);
  assert.equal(m.produto, 3); assert.equal(m.quantidade, 4); assert.equal(m.valor_unitario, 5);
});

test('XLSX é lido com datas e números reais', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Despesas');
  ws.addRow(['Data', 'Categoria', 'Descrição', 'Valor']);
  ws.addRow([new Date(Date.UTC(2026, 8, 5)), 'Pessoal', 'Salários', 34000.5]);
  const p = await I.readFile(Buffer.from(await wb.xlsx.writeBuffer()), 'd.xlsx');
  assert.equal(I.detectType(p.headers), 'despesas');
  const v = I.validate('despesas', p.rows, I.autoMap('despesas', p.headers));
  assert.equal(v.valid[0].data, '2026-09-05');
  assert.equal(v.valid[0].valor, 34000.5);
});

test('XLSX com célula "fantasma" na última coluna é lido rápido e só até o cabeçalho', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Vendas');
  ws.addRow(['Data', 'Cliente', 'Produto', 'Quantidade', 'Valor total']);
  for (let i = 0; i < 2000; i++) ws.addRow(['01/09/2026', 'Cli', 'Prod', 1, 10]);
  ws.getCell('XFD1').value = ' ';
  const t = Date.now();
  const p = await I.readFile(Buffer.from(await wb.xlsx.writeBuffer()), 'fantasma.xlsx');
  assert.equal(p.headers.length, 5);
  assert.equal(p.rows.length, 2000);
  assert.ok(Date.now() - t < 10000);
});

test('relatório com título antes do cabeçalho: acha a linha das colunas', async () => {
  const csv = 'Relatório de faturamento\nEmpresa X;;;\n\nEmissão;Razão social;Qtde;Vl Total\n05/09/2026;Mercado A;2;100,00\n06/09/2026;Mercado B;1;50,00\n';
  const p = await I.readFile(Buffer.from(csv), 'fat.csv');
  assert.deepEqual(p.headers, ['Emissão', 'Razão social', 'Qtde', 'Vl Total']);
  assert.equal(p.rows.length, 2);
  assert.equal(I.detectType(p.headers), 'vendas');
});

test('vendas só com data, vendedor e valor: completa cliente, produto e quantidade', () => {
  const headers = ['Data', 'Vendedor', 'Valor'];
  const v = I.validate('vendas', [['01/09/2026', 'Ana', '1.000,00']], I.autoMap('vendas', headers));
  assert.equal(v.missing.length, 0);
  assert.equal(v.valid[0].cliente, 'Cliente não informado');
  assert.equal(v.valid[0].quantidade, 1);
  assert.ok(v.summary.notes.length >= 2);
});

test('metas com um mês por coluna viram uma linha por mês', async () => {
  const csv = 'Vendedor;Jan/26;Fev/26;Mar/26\nAna;100000;110000;120000\nTotal;300000;320000;340000\n';
  const p = await I.readFile(Buffer.from(csv), 'metas.csv');
  assert.deepEqual(p.headers, ['Mês', 'Meta', 'Vendedor']);
  assert.equal(I.detectType(p.headers), 'metas');
  const v = I.validate('metas', p.rows, I.autoMap('metas', p.headers));
  assert.equal(v.valid.length, 6);
  assert.deepEqual(v.valid[0], { mes: '2026-01', meta: 100000, vendedor: 'Ana' });
  assert.equal(v.valid.find((x) => x.meta === 300000).vendedor, null);
});

test('arquivo com várias abas importa vendas, despesas, contas e metas de uma vez', async () => {
  const p = await I.readFile(fs.readFileSync(new URL('../exemplos/cortex-exemplo-dados.xlsx', import.meta.url)), 'tudo.xlsx');
  assert.deepEqual(p.sheets.map((s) => s.type).sort(), ['contas', 'despesas', 'metas', 'vendas']);
  const orgId = createOrganization({ slug: 'abas-teste', name: 'Abas', adminName: 'A', adminEmail: 'abas@a.com', password: 'senha1234' });
  const r = I.importAll(orgId, null, p.sheets, { filename: 'tudo.xlsx' });
  assert.equal(r.results.length, 4);
  assert.ok(r.results.every((x) => x.inserted > 0));
  assert.ok(db.prepare('SELECT COUNT(*) n FROM expenses WHERE org_id = ?').get(orgId).n > 0);
  assert.ok(db.prepare('SELECT COUNT(*) n FROM bills WHERE org_id = ?').get(orgId).n > 0);
  // limpa para não interferir nos outros testes
  db.prepare('DELETE FROM order_items WHERE order_id IN (SELECT id FROM orders WHERE org_id = ?)').run(orgId);
  for (const t of ['orders', 'customers', 'products', 'expenses', 'bills', 'goals', 'goal_items']) db.prepare(`DELETE FROM ${t} WHERE org_id = ?`).run(orgId);
});

test('importa vendas agrupando pedidos e ignora repetidos', () => {
  const headers = ['data', 'pedido', 'cliente', 'produto', 'quantidade', 'valor_unitario', 'vendedor'];
  const rows = [['01/10/2026', 'A1', 'Cli 1', 'P1', '2', '10,00', 'Ana'], ['01/10/2026', 'A1', 'Cli 1', 'P2', '1', '5,00', 'Ana'], ['02/10/2026', 'A2', 'Cli 2', 'P1', 'x', '10', 'Bia']];
  const v = I.validate('vendas', rows, I.autoMap('vendas', headers));
  assert.equal(v.valid.length, 2);
  assert.equal(v.errorCount, 1);
  const r = I.commit(org, null, 'vendas', v.valid);
  assert.equal(r.inserted, 2); assert.equal(r.orders, 1);
  assert.equal(db.prepare('SELECT total FROM orders WHERE org_id = ?').get(org).total, 25);
  const again = I.commit(org, null, 'vendas', v.valid);
  assert.equal(again.inserted, 0); assert.equal(again.skipped, 2);
  assert.equal(db.prepare('SELECT seller FROM orders WHERE org_id = ?').get(org).seller, 'Ana');
});

test('metas por mês e por vendedor', () => {
  const headers = ['mes', 'meta', 'vendedor'];
  const v = I.validate('metas', [['10/2026', '1000', ''], ['10/2026', '400', 'Ana']], I.autoMap('metas', headers));
  I.commit(org, null, 'metas', v.valid);
  assert.equal(db.prepare("SELECT revenue_target t FROM goals WHERE org_id = ? AND month = '2026-10'").get(org).t, 1000);
  const items = M.goalItems(org, '2026-10', 'vendedor');
  assert.equal(items.find((i) => i.key === 'Ana').target, 400);
  assert.equal(items.find((i) => i.key === 'Ana').realized, 25);
});

test('backup e restauração', async () => {
  const b = await B.runBackup('', 5);
  assert.ok(fs.existsSync(path.join(B.defaultBackupDir(), b.file)));
  db.prepare('DELETE FROM orders WHERE org_id = ?').run(org);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 0);
  const r = await B.restoreBackup('', b.file);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n, 1);
  assert.ok(r.safety.includes('antes-de-restaurar'));
});

test('previsão de fechamento não quebra sem meta', () => {
  const f = M.forecast(org, '2026-11-01');
  assert.equal(typeof f.projection, 'number');
});
