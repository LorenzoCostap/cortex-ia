// Garante que o frontend esteja compilado antes de "npm start".
import fs from 'node:fs';
import { execSync } from 'node:child_process';
if (!fs.existsSync(new URL('../dist/index.html', import.meta.url))) {
  console.log('Compilando a interface (só na primeira vez)…');
  execSync('npx vite build', { stdio: 'inherit' });
}
