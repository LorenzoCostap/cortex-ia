// Backup e restauração do banco local (cortex.db).
import fs from 'node:fs';
import path from 'node:path';
import { db, DATA_DIR } from './db.js';

export const defaultBackupDir = () => path.join(DATA_DIR, 'backups');
const resolveDir = (dir) => (dir && dir.trim() ? dir.trim() : defaultBackupDir());

function stamp(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

export function listBackups(dir) {
  const d = resolveDir(dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d)
    .filter((f) => /^cortex-.*\.db$/.test(f))
    .map((f) => { const st = fs.statSync(path.join(d, f)); return { file: f, size: st.size, createdAt: st.mtime.toISOString() }; })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function runBackup(dir, keep = 30, label = '') {
  const d = resolveDir(dir);
  fs.mkdirSync(d, { recursive: true });
  const file = path.join(d, `cortex-${stamp()}${label ? `-${label}` : ''}.db`);
  await db.backup(file);
  const all = listBackups(d).filter((b) => !b.file.includes('-antes-de-restaurar'));
  for (const old of all.slice(Math.max(1, keep))) { try { fs.unlinkSync(path.join(d, old.file)); } catch { /* ignora */ } }
  const st = fs.statSync(file);
  return { file: path.basename(file), dir: d, size: st.size, createdAt: st.mtime.toISOString() };
}

/**
 * Restaura copiando as tabelas do arquivo de backup para o banco aberto (sem precisar reiniciar).
 * Antes, salva um backup de segurança do estado atual.
 */
export async function restoreBackup(dir, file) {
  const d = resolveDir(dir);
  const full = path.join(d, path.basename(file));
  if (!fs.existsSync(full)) throw new Error('Arquivo de backup não encontrado.');
  const safety = await runBackup(d, 1000, 'antes-de-restaurar');
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all().map((t) => t.name);
  db.pragma('foreign_keys = OFF');
  try {
    db.prepare('ATTACH DATABASE ? AS bk').run(full);
    try {
      const bkTables = new Set(db.prepare("SELECT name FROM bk.sqlite_master WHERE type = 'table'").all().map((t) => t.name));
      db.transaction(() => {
        for (const t of tables) {
          db.exec(`DELETE FROM main."${t}"`);
          if (!bkTables.has(t)) continue;
          const cols = db.prepare(`PRAGMA bk.table_info("${t}")`).all().map((c) => c.name);
          const mainCols = new Set(db.prepare(`PRAGMA main.table_info("${t}")`).all().map((c) => c.name));
          const shared = cols.filter((c) => mainCols.has(c)).map((c) => `"${c}"`).join(', ');
          db.exec(`INSERT INTO main."${t}" (${shared}) SELECT ${shared} FROM bk."${t}"`);
        }
      })();
    } finally {
      db.exec('DETACH DATABASE bk');
    }
  } finally {
    db.pragma('foreign_keys = ON');
  }
  return { restored: path.basename(full), safety: safety.file };
}
