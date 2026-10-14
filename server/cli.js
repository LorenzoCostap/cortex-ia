// Uso: npm run org:create -- --slug minha-empresa --name "Minha Empresa" --admin "Fulano" --email fulano@empresa.com --password senha1234
import { createOrganization } from './seed.js';
import { db } from './db.js';

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean).map((p) => { const [k, ...v] = p.trim().split(' '); return [k, v.join(' ').replace(/^"|"$/g, '')]; }));
const cmd = process.argv[2];
if (cmd !== 'create-org' && !args.slug) { console.log('Comando desconhecido. Use: npm run org:create -- --slug ... --name ... --admin ... --email ... --password ...'); process.exit(1); }
const { slug, name, admin, email, password, segment } = args;
if (!slug || !name || !email || !password) {
  console.log('Faltam dados. Exemplo:\n  npm run org:create -- --slug minha-empresa --name "Minha Empresa" --admin "Fulano" --email fulano@empresa.com --password senha1234');
  process.exit(1);
}
if (db.prepare('SELECT 1 FROM organizations WHERE slug = ?').get(slug)) { console.log(`Já existe uma organização "${slug}".`); process.exit(1); }
createOrganization({ slug, name, segment, adminName: admin || 'Administrador', adminEmail: email, password });
console.log(`Organização "${name}" criada. Entre com: organização "${slug}" · ${email}`);
console.log('Ela começa sem dados: importe planilhas ou use "Gerar dados de demonstração" na tela de Importação.');
