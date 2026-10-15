// Instala/remove o Cortex na Inicialização do Windows e cria atalhos na Área de trabalho.
// Uso:
//   npm run windows:instalar              -> inicia com o Windows + atalhos
//   npm run windows:instalar -- --tv      -> idem, e abre o modo TV em tela cheia ao ligar (PC da TV)
//   npm run windows:remover               -> desfaz tudo
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const action = process.argv[2];
const withTv = process.argv.includes('--tv');
const port = +(process.env.PORT || 3210);

if (process.platform !== 'win32' && !process.env.CORTEX_FORCE_WINDOWS) {
  console.log('Este comando é só para Windows. No Linux/macOS, use o agendador do sistema (systemd, launchd) para rodar "npm start".');
  process.exit(0);
}

function desktopDir() {
  // Respeita a Área de trabalho do OneDrive, quando existir
  if (process.platform === 'win32') {
    const r = spawnSync('powershell', ['-NoProfile', '-Command', "[Environment]::GetFolderPath('Desktop')"], { encoding: 'utf8' });
    const p = (r.stdout || '').trim();
    if (p && fs.existsSync(p)) return p;
  }
  return path.join(process.env.USERPROFILE || process.env.HOME || root, 'Desktop');
}
const startupDir = path.join(process.env.APPDATA || path.join(root, '.appdata'), 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const files = {
  startup: path.join(startupDir, 'Cortex IA.vbs'),
  painel: path.join(desktopDir(), 'Cortex IA.url'),
  tv: path.join(desktopDir(), 'Cortex IA - Modo TV.url'),
  iniciar: path.join(desktopDir(), 'Iniciar Cortex IA.vbs')
};

// VBScript roda o Node sem abrir janela de prompt
const vbs = (args) => [
  "' Inicia o Cortex IA sem janela. Criado por: npm run windows:instalar",
  'Set sh = CreateObject("WScript.Shell")',
  `sh.CurrentDirectory = "${root}"`,
  `sh.Run """${process.execPath}"" ""${path.join(root, 'scripts', 'autostart.js')}""${args ? ' ' + args : ''}", 0, False`
].join('\r\n') + '\r\n';
const url = (u) => `[InternetShortcut]\r\nURL=${u}\r\n`;

if (action === 'instalar') {
  fs.mkdirSync(startupDir, { recursive: true });
  fs.mkdirSync(path.dirname(files.painel), { recursive: true });
  fs.writeFileSync(files.startup, vbs(withTv ? '--tv' : ''), 'latin1');
  fs.writeFileSync(files.iniciar, vbs(''), 'latin1');
  fs.writeFileSync(files.painel, url(`http://localhost:${port}`));
  fs.writeFileSync(files.tv, url(`http://localhost:${port}/tv`));
  console.log('Pronto!');
  console.log(`  • O Cortex inicia sozinho quando o Windows liga${withTv ? ' e abre o modo TV em tela cheia' : ''}.`);
  console.log('  • Na Área de trabalho: "Cortex IA" (painel), "Cortex IA - Modo TV" e "Iniciar Cortex IA" (caso tenha fechado).');
  console.log(`  • Registro de funcionamento: ${path.join(root, 'data', 'cortex.log')}`);
  console.log('Para desfazer: npm run windows:remover');
} else if (action === 'remover') {
  let n = 0;
  for (const f of Object.values(files)) if (fs.existsSync(f)) { fs.rmSync(f); n++; }
  console.log(n ? `Removido (${n} arquivo(s)). O Cortex não inicia mais com o Windows.` : 'Nada para remover.');
} else {
  console.log('Use: npm run windows:instalar  |  npm run windows:instalar -- --tv  |  npm run windows:remover');
}
