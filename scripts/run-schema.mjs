// Exécute supabase/schema.sql sur la base de données pointée par
// SUPABASE_DB_URL (dans .env). Script à usage ponctuel (étape 3 de la
// migration) — sans danger à relancer plusieurs fois grâce aux
// "create table if not exists" / "create policy" protégés.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import pg from 'pg';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error('SUPABASE_DB_URL manquant dans .env');
  process.exit(1);
}

const sql = readFileSync(join(ROOT, 'supabase', 'schema.sql'), 'utf8');

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log('✅ Schéma appliqué avec succès.');

  const { rows } = await client.query(`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name;
  `);
  console.log('Tables présentes dans le schéma "public" :', rows.map(r => r.table_name).join(', '));
} finally {
  await client.end();
}
