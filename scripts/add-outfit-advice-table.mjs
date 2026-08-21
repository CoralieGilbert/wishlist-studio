// Script ponctuel : ajoute la table outfit_advice_generations (historique
// des Conseils IA par tenue) sans rejouer tout supabase/schema.sql — un
// rejeu complet échouerait sur les "create policy" déjà existants (pas
// idempotents en SQL standard). Sans danger de le laisser (create table if
// not exists + policy avec nom inédit gardée derrière un check d'existence).
import 'dotenv/config';
import pg from 'pg';

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) { console.error('SUPABASE_DB_URL manquant dans .env'); process.exit(1); }

const sql = `
create table if not exists outfit_advice_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  outfit_uid text not null references outfits(uid) on delete cascade,
  query text,
  source text,
  occasion text,
  budget numeric,
  currency text,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists outfit_advice_generations_outfit_idx on outfit_advice_generations(outfit_uid, created_at desc);
alter table outfit_advice_generations enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'outfit_advice_generations' and policyname = 'own rows only') then
    create policy "own rows only" on outfit_advice_generations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;
`;

const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(sql);
  console.log('✅ Table outfit_advice_generations créée/vérifiée.');
} finally {
  await client.end();
}
