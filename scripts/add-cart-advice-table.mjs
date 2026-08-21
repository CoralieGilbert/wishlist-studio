// Script ponctuel : ajoute la table cart_advice_generations (historique des
// Avis IA sur une sélection du panier) sans rejouer tout supabase/schema.sql
// — un rejeu complet échouerait sur les "create policy" déjà existants (pas
// idempotents en SQL standard). Sans danger de le laisser (create table if
// not exists + policy avec nom inédit gardée derrière un check d'existence).
import 'dotenv/config';
import pg from 'pg';

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) { console.error('SUPABASE_DB_URL manquant dans .env'); process.exit(1); }

const sql = `
create table if not exists cart_advice_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  item_uids text[] not null,
  query text,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists cart_advice_generations_user_idx on cart_advice_generations(user_id, created_at desc);
alter table cart_advice_generations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'cart_advice_generations' and policyname = 'own rows only') then
    create policy "own rows only" on cart_advice_generations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
`;

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log('✅ Table cart_advice_generations créée/vérifiée.');
} finally {
  await client.end();
}
