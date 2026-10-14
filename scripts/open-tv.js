// Abre o modo TV em tela cheia (quiosque) no Chrome ou Edge.
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const url = process.argv[2] || `http://localhost:${process.env.PORT || 3210}/tv`;
const candidates = {
  win32: [
    `${process.env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${process.env.PROGRAMFILES}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
  ],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge'],
  linux: ['/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/microsoft-edge']
}[process.platform] || [];

const bin = candidates.find((p) => p && fs.existsSync(p));
if (!bin) {
  console.log(`Não encontrei Chrome nem Edge. Abra manualmente em tela cheia (F11): ${url}`);
  process.exit(0);
}
spawn(bin, ['--kiosk', '--noerrdialogs', '--disable-infobars', '--autoplay-policy=no-user-gesture-required', url], { detached: true, stdio: 'ignore' }).unref();
console.log(`Modo TV aberto: ${url}  (para sair: Alt+F4)`);
