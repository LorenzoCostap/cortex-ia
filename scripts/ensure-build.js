// Garante que a interface compilada (dist/) esteja atualizada antes do "npm start".
// Recompila quando dist/ não existe ou quando algum arquivo de client/ é mais novo que a última compilação.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const built = path.join(root, 'dist', 'index.html');

function newest(dir) {
  let t = 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    t = Math.max(t, e.isDirectory() ? newest(p) : fs.statSync(p).mtimeMs);
  }
  return t;
}

const sources = Math.max(newest(path.join(root, 'client')), fs.statSync(path.join(root, 'vite.config.js')).mtimeMs, fs.statSync(path.join(root, 'package.json')).mtimeMs);
if (!fs.existsSync(built) || fs.statSync(built).mtimeMs < sources) {
  console.log(fs.existsSync(built) ? 'Interface desatualizada — compilando de novo…' : 'Compilando a interface (só na primeira vez)…');
  execSync('npx vite build', { stdio: 'inherit', cwd: root });
}
