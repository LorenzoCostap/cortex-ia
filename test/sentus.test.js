// Relatórios do ERP SENTUS (CSV sem cabeçalho). Tudo aqui é fictício: só o formato imita os arquivos do SENTUS.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';

process.env.CORTEX_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'cortex-sentus-'));
const { db } = await import('../server/db.js');
const { createOrganization } = await import('../server/seed.js');
const I = await import('../server/importer.js');
const S = await import('../server/sentus.js');
const M = await import('../server/metrics.js');
const { contextMiddleware } = await import('../server/context.js');

const org = createOrganization({ slug: 'loja-teste', name: 'Loja Teste', adminName: 'A', adminEmail: 'a@loja.com', password: 'senha1234' });
const EMP = 'LOJA FICTICIA LTDA', FIL = 'LOJA FICTICIA LTDA [FILIAL]';
const csv = (rows) => Buffer.from(rows.map((r) => r.join(';')).join('\r\n') + '\r\n');
// mesma posição das colunas do "Vendas por item" (26 colunas)
const item = (doc, d, tipo, cli, code, name, qty, price, emp = EMP, status = '') =>
  [`${code} - ${name}`, doc, d, 'null', tipo, cli, 'UND', qty.toFixed(3), price.toFixed(4), (qty * price).toFixed(2), '', '', code, name, 'Diversos', 'Diversos', status, 'VENDA', emp, 'UND', '0.0000', '0.00', 'Cidade A', 'RS', 'CONSUMIDOR', 'null'];
// faz uma "requisição" com a empresa escolhida, como o seletor da tela faz
const asUnit = (unit, fn) => { let out; contextMiddleware({ headers: unit ? { 'x-cortex-empresa': unit } : {}, path: '/api/dashboard', socket: {} }, null, () => { out = fn(); }); return out; };

test('reconhece cada relatório do SENTUS pela estrutura', async () => {
  const files = {
    itens: csv([item('1/2', '01/09/2026', 'NFC-e', EMP, '100', 'CAMISETA', 2, 50)]),
    periodo: csv([['1/2', '01/09/2026', 'NFC-e', EMP, '100.00', '0.00', '100.00', '100.00']]),
    titulos: csv([['FORNECEDOR A - 11222333000144', '10-1/2', '01/09/2026', '30/09/2026', 'null', '300.00', 'null', '300.00', '900', 'null']]),
    estoque: csv([['Diversos', '100', 'CAMISETA', 'UND', '0.00', '5.00', '20.0000', '100.00', 'null']]),
    grupos: csv([['DESPESAS', '', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00'],
      ['', 'ALUGUEL', '-100.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '-100.00'],
      ['', '==TOTAL DESPESAS==', 'null', 'null', 'null', 'null', 'null', 'null', 'null', 'null', 'null', 'null', 'null', 'null', 'null']])
  };
  for (const [kind, buf] of Object.entries(files)) assert.equal((await I.readFile(buf, 'Report.csv')).sentus?.kind, kind, kind);
  assert.equal(S.num('3.000'), 3); // ponto decimal do SENTUS: 3.000 = 3 unidades
  assert.equal(S.num('1.234,56'), 1234.56);
});

test('vendas por item + títulos: totais batem no dashboard, separados e somados', async () => {
  // estoque antes, para o custo das vendas sair do estoque
  const est = await I.readFile(csv([['Diversos', '100', 'CAMISETA', 'UND', '0.00', '5.00', '20.0000', '100.00', 'null']]), 'Report_17M.csv');
  S.commitSentus(org, null, est.sentus, { unit: 'matriz' });
  const matriz = await I.readFile(csv([
    item('1/2', '01/09/2026', 'NFC-e', EMP, '100', 'CAMISETA', 2, 50),
    item('1/2', '01/09/2026', 'NFC-e', EMP, '200', 'BONE', 1, 30),
    item('7/2', '02/09/2026', 'Pedido', 'CLIENTE B', '100', 'CAMISETA', 1, 50, EMP, 'Encerrado'),
    item('8/2', '02/09/2026', 'Pedido', 'CLIENTE C', '100', 'CAMISETA', 9, 50, EMP, 'Autorizado') // virou NFC-e: não conta
  ]), 'Report_26M.csv');
  assert.equal(matriz.sentus.summary.empresa, EMP);
  const r1 = S.commitSentus(org, null, matriz.sentus, { unit: 'matriz' });
  assert.equal(r1.inserted, 3);
  assert.ok(r1.notes.some((n) => /estoque/.test(n)));
  const filial = await I.readFile(csv([item('5/3', '03/09/2026', 'NFC-e', FIL, '100', 'CAMISETA', 4, 50, FIL)]), 'Report_26M.csv');
  S.commitSentus(org, null, filial.sentus, { unit: 'filial' });
  assert.equal(S.rememberedUnit(org, FIL), 'filial'); // na próxima vez já vem selecionada
  const tit = await I.readFile(csv([
    ['FORNECEDOR A - 11222333000144', '10-1/2', '01/09/2026', '20/12/2026', 'null', '300.00', 'null', '300.00', '900', 'null'],
    ['FORNECEDOR A - 11222333000144', '10-2/2', '01/09/2026', '20/09/2026', '20/09/2026', '300.00', '300.00', '0.00', '901', '300.0000'],
    ['FORNECEDOR A - 11222333000144', '', 'null', 'null', '20/09/2026', 'null', '300.00', 'null', '901', '0.0000'] // linha do pagamento
  ]), 'Report_6M.csv');
  S.commitSentus(org, null, tit.sentus, { unit: 'matriz', titleKind: 'pagar' });

  const rev = (u) => asUnit(u, () => M.dashboard(org, '2026-09').kpis.revenue);
  assert.equal(rev('matriz'), 180); // 100 + 30 + 50 (o pedido autorizado ficou de fora)
  assert.equal(rev('filial'), 200);
  assert.equal(rev(null), 380);
  const cost = asUnit('matriz', () => M.periodSummary(org, '2026-09-01', '2026-09-30').cogs);
  assert.equal(cost, 3 * 20 + 30 * 0.7); // camiseta pelo custo do estoque; boné fora do estoque: margem de 30%
  const open = asUnit(null, () => M.bills(org, 'pagar', { days: 3650, includeOverdue: true }));
  assert.equal(open.length, 1); // a parcela paga não fica em aberto
  assert.equal(open[0].amount, 300);
  // importar de novo não duplica
  S.commitSentus(org, null, matriz.sentus, { unit: 'matriz' });
  S.commitSentus(org, null, tit.sentus, { unit: 'matriz', titleKind: 'pagar' });
  assert.equal(rev(null), 380);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM bills WHERE org_id = ? AND kind = 'pagar'").get(org).n, 2);
});

test('linhas quebradas, desconto do 80M, título pago em parte e despesa sem grupo fora do lucro', async () => {
  // registro com observação quebrada em 3 linhas (como a chave da NF-e)
  const broken = item('9/1', '10/09/2026', 'NFe', 'CLIENTE D', '100', 'CAMISETA', 10, 50);
  const text = [item('8/1', '10/09/2026', 'NFC-e', EMP, '100', 'CAMISETA', 1, 50).join(';'),
    broken.slice(0, 12).join(';').replace(/;$/, ';Origem: 1'), '42240300000000000000550010000000091000000000', 'fim da observação' + ';' + broken.slice(12).join(';')].join('\r\n');
  const it = await I.readFile(Buffer.from(text + '\r\n'), 'Report_26M.csv');
  assert.equal(it.sentus.rows.length, 2);
  S.commitSentus(org, null, it.sentus, { unit: 'filial' });
  const per = await I.readFile(csv([['8/1', '10/09/2026', 'NFC-e', EMP, '50.00', '0.00', '50.00', '50.00'], ['9/1', '10/09/2026', 'NFe', 'CLIENTE D', '500.00', '60.00', '440.00', '500.00']]), 'Report_80M.csv');
  const r = S.commitSentus(org, null, per.sentus, { unit: 'filial' });
  assert.ok(r.notes.some((n) => /Desconto aplicado em 1 nota/.test(n)));
  const rev = asUnit('filial', () => M.periodSummary(org, '2026-09-10', '2026-09-10').revenue);
  assert.equal(rev, 490); // 50 + (500 - 60)
  S.commitSentus(org, null, per.sentus, { unit: 'filial' }); // de novo: não desconta duas vezes
  assert.equal(asUnit('filial', () => M.periodSummary(org, '2026-09-10', '2026-09-10').revenue), 490);

  const tit = await I.readFile(csv([['FORNECEDOR B - 11222333000155', '20-1/1', '01/09/2026', '15/09/2026', '10/09/2026', '1000.00', '400.00', '600.00', '950', '400.0000']]), 'Report_6M.csv');
  S.commitSentus(org, null, tit.sentus, { unit: 'filial', titleKind: 'pagar' });
  const b = db.prepare("SELECT amount, paid_at FROM bills WHERE org_id = ? AND external_id = '950'").get(org);
  assert.deepEqual(b, { amount: 600, paid_at: null }); // pago em parte: em aberto pelo saldo

  const gr = await I.readFile(csv([['DESPESAS', '', ...Array(13).fill('0.00')],
    ['', 'NAO CLASSIFICADO', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '-900.00', '0.00', '0.00', '0.00', '-900.00'],
    ['', 'LUZ', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '0.00', '-100.00', '0.00', '0.00', '0.00', '-100.00'],
    ['', '==TOTAL DESPESAS==', ...Array(13).fill('null')]]), 'Report_126M.csv');
  S.commitSentus(org, null, gr.sentus, { unit: 'filial', year: 2026, ungrouped: 'fora' });
  assert.equal(asUnit('filial', () => M.periodSummary(org, '2026-09-01', '2026-09-30').opex), 100); // só a luz entra no lucro
});
