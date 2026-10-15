// Inicia o Cortex sem janela (usado pela Inicialização do Windows) e, se pedido, abre o modo TV quando ele estiver pronto.
// Uso: node scripts/autostart.js [--tv]
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);
const port = +(process.env.PORT || 3210);
const base = `http://localhost:${port}`;
const openTv = process.argv.includes('--tv');

// Log em data/cortex.log (recomeça quando passa de 5 MB)
const logDir = process.env.CORTEX_DATA_DIR || path.join(root, 'data');
fs.mkdirSync(logDir, { recursive: true });
const logFile = path.join(logDir, 'cortex.log');
try { if (fs.statSync(logFile).size > 5e6) fs.writeFileSync(logFile, ''); } catch { /* ainda não existe */ }
const log = (m) => fs.appendFileSync(logFile, `[${new Date().toLocaleString('pt-BR')}] ${m}\n`);

async function alive() {
  try { const r = await fetch(`${base}/api/public/org?slug=__ping__`, { signal: AbortSignal.timeout(1500) }); return r.status === 404 || r.ok; } catch { return false; }
}
async function waitReady(seconds) {
  for (let i = 0; i < seconds; i++) { if (await alive()) return true; await new Promise((r) => setTimeout(r, 1000)); }
  return false;
}
const tv = () => spawn(process.execPath, [path.join(root, 'scripts', 'open-tv.js'), `${base}/tv`], { detached: true, stdio: 'ignore' }).unref();

if (await alive()) {
  // Já está rodando (ex.: alguém abriu antes): só abre a TV, se pedido.
  log('Cortex já estava rodando.');
  if (openTv) tv();
  process.exit(0);
}

log('Iniciando o Cortex…');
const build = spawnSync(process.execPath, [path.join(root, 'scripts', 'ensure-build.js')], { cwd: root, encoding: 'utf8' });
if (build.status !== 0) log(`Falha ao compilar a interface:\n${build.stdout || ''}${build.stderr || ''}`);

const out = fs.openSync(logFile, 'a');
const server = spawn(process.execPath, [path.join(root, 'server', 'index.js')], { cwd: root, stdio: ['ignore', out, out], windowsHide: true });
server.on('exit', (code) => { log(`Servidor encerrado (código ${code}).`); process.exit(code || 0); });

if (await waitReady(90)) {
  log(`Cortex no ar em ${base}`);
  if (openTv) tv();
} else {
  log('O servidor não respondeu em 90 segundos. Veja as mensagens acima.');
}
