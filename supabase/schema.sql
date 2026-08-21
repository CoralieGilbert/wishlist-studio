-- Wishlist Studio — schéma de base de données Supabase
-- Toutes les tables sont protégées par Row Level Security (RLS) :
-- chaque ligne appartient à un utilisateur (user_id) et n'est visible/
-- modifiable que par lui (auth.uid() = user_id). Pratique même pour un
-- usage personnel : une clé publique qui fuit ne donne accès à rien sans
-- être connectée avec le bon compte.

-- === ARTICLES (wishlist) ====================================================
create table if not exists articles (
  uid text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  legacy_id integer,          -- ancien "id" numérique du fichier d'origine, gardé pour référence
  name text,
  brand text,
  store text,
  supercategory text,
  category text,
  subcategory text,
  color text,
  color_family text,
  price text,                 -- affichage tel quel (ex: "$275.00")
  price_num numeric,          -- valeur numérique utilisée pour les tris/filtres
  original text,               -- ancien prix affiché (avant solde)
  discount text,
  currency text,
  sale text,
  url text,
  note text,
  file text,                  -- nom de fichier d'origine (capture), gardé pour référence
  image_url text,             -- photo principale (Supabase Storage)
  item_group text,            -- "group" est un mot réservé en SQL, renommé
  multi boolean default false,
  tags text[] default '{}',
  purchase_type text,         -- Besoin / Upgrade / Plaisir / Collection / Cadeau / À surveiller
  status text,                -- À compléter / À considérer / Favori / Attendre soldes / À essayer / Acheté / Écarté
  priority text,
  desire_score integer,
  utility_score integer,
  date_added date,
  in_cart boolean default false,
  is_favorite boolean default false,
  is_trashed boolean default false,
  purchased boolean default false,
  paid_price_num numeric,
  purchase_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- === PIÈCES DE VESTIAIRE ====================================================
create table if not exists wardrobe_items (
  uid text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text,
  brand text,
  store text,
  supercategory text,
  category text,
  subcategory text,
  color text,
  color_family text,
  size text,
  price text,
  price_num numeric,
  original text,
  discount text,
  currency text,
  sale text,
  url text,
  note text,
  image_url text,             -- photo principale
  tags text[] default '{}',
  purchase_type text,
  status text,
  priority text,
  desire_score integer,
  utility_score integer,
  date_added date,
  owned boolean default true,
  ownership_origin text,
  wardrobe_active boolean default true,
  wardrobe_status text,
  in_cart boolean default false,
  is_favorite boolean default false,
  is_trashed boolean default false,
  purchased boolean default false,
  paid_price_num numeric,
  purchase_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- === TENUES ==================================================================
create table if not exists outfits (
  uid text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text,
  note text,
  tags text[] default '{}',
  date_added date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Relation tenue <-> pièces de vestiaire qui la composent
create table if not exists outfit_items (
  outfit_uid text not null references outfits(uid) on delete cascade,
  wardrobe_item_uid text not null references wardrobe_items(uid) on delete cascade,
  position integer not null default 0,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (outfit_uid, wardrobe_item_uid)
);

-- === COLLECTIONS =============================================================
create table if not exists collections (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text,
  emoji text,
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Relation collection <-> articles qu'elle contient
create table if not exists collection_items (
  collection_id text not null references collections(id) on delete cascade,
  article_uid text not null references articles(uid) on delete cascade,
  position integer not null default 0,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  primary key (collection_id, article_uid)
);

-- === PHOTOS (galeries multi-photo) ==========================================
-- Table commune aux trois types d'entités (article / pièce de vestiaire /
-- tenue) plutôt que trois tables quasi identiques : plus simple à faire
-- évoluer si un nouveau type d'entité avec photos apparaît un jour.
create table if not exists photos (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  owner_type text not null check (owner_type in ('article', 'wardrobe_item', 'outfit', 'style_profile')),
  owner_uid text not null,
  url text not null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists photos_owner_idx on photos(owner_type, owner_uid);

-- === Row Level Security ======================================================
alter table articles enable row level security;
alter table wardrobe_items enable row level security;
alter table outfits enable row level security;
alter table outfit_items enable row level security;
alter table collections enable row level security;
alter table collection_items enable row level security;
alter table photos enable row level security;

create policy "own rows only" on articles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on wardrobe_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on outfits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on outfit_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on collections for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on collection_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own rows only" on photos for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- === updated_at automatique ==================================================
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger set_updated_at before update on articles for each row execute function set_updated_at();
create trigger set_updated_at before update on wardrobe_items for each row execute function set_updated_at();
create trigger set_updated_at before update on outfits for each row execute function set_updated_at();
create trigger set_updated_at before update on collections for each row execute function set_updated_at();

-- === RÉGLAGES PERSONNELS (clé API IA "bring your own key") ================
-- Chaque compte peut enregistrer sa propre clé OpenAI. Jamais exposée au
-- navigateur : uniquement lue côté serveur (fonction /api/analyze-image)
-- avec la clé service_role, en confirmant l'identité de l'appelant via son
-- jeton d'authentification Supabase.
create table if not exists user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  openai_api_key text,
  style_text text,
  updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
create policy "own settings only" on user_settings for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger set_updated_at before update on user_settings for each row execute function set_updated_at();

-- === HISTORIQUE PERSONAL SHOPPER ============================================
-- Chaque panier généré par l'IA est sauvegardé (résultat complet en jsonb :
-- picks, note, totaux) pour qu'il ne disparaisse plus en quittant la page.
-- Historique en lecture/écriture simple, pas besoin d'un schéma relationnel.
create table if not exists shopping_generations (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  query text,
  budget numeric,
  currency text,
  result jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists shopping_generations_user_idx on shopping_generations(user_id, created_at desc);
alter table shopping_generations enable row level security;
create policy "own rows only" on shopping_generations for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- === Stockage des photos (bucket "wishlist-photos") ========================
-- Lecture publique (URLs non répertoriées, cf. décision produit), mais
-- l'écriture (upload/suppression) nécessite d'être connectée. Sans cette
-- politique, Supabase Storage refuse tout upload par défaut (vécu : "new row
-- violates row-level security policy" tant qu'elle n'existe pas).
create policy "authenticated can manage own bucket files" on storage.objects
  for all
  using (bucket_id = 'wishlist-photos' and auth.role() = 'authenticated')
  with check (bucket_id = 'wishlist-photos' and auth.role() = 'authenticated');
