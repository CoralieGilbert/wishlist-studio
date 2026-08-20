// Migration ponctuelle (étape 4) : uploade les photos extraites vers
// Supabase Storage, puis insère articles / vestiaire / tenues / collections
// dans les tables créées à l'étape 3. Utilise la service_role key (bypass
// RLS), donc on associe explicitement chaque ligne à OWNER_USER_ID.
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const DATA_DIR = join(ROOT, 'migration-output', 'data');
const IMAGES_DIR = join(ROOT, 'migration-output', 'images');
const BUCKET = 'wishlist-photos';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ownerId = process.env.OWNER_USER_ID;
if (!url || !serviceKey || !ownerId) {
  console.error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / OWNER_USER_ID manquant dans .env');
  process.exit(1);
}
const supabase = createClient(url, serviceKey);

const CONTENT_TYPES = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.gif': 'image/gif' };

// --- 0. Créer le bucket s'il n'existe pas -----------------------------
async function ensureBucket() {
  const { data: buckets } = await supabase.storage.listBuckets();
  if (!buckets.some(b => b.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
    if (error) throw error;
    console.log(`Bucket "${BUCKET}" créé.`);
  } else {
    console.log(`Bucket "${BUCKET}" déjà présent.`);
  }
}

// --- 1. Uploader toutes les images d'un dossier, retourner path -> URL --
async function uploadFolder(folder) {
  const dir = join(IMAGES_DIR, folder);
  let files;
  try { files = readdirSync(dir); } catch { return {}; }
  const map = {};
  for (const file of files) {
    const localPath = join(dir, file);
    const storagePath = `${folder}/${file}`;
    const bytes = readFileSync(localPath);
    const contentType = CONTENT_TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, bytes, { contentType, upsert: true });
    if (error) { console.error('Upload échoué:', storagePath, error.message); continue; }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    map[`images/${folder}/${file}`] = data.publicUrl;
  }
  return map;
}

function resolveImage(value, urlMap) {
  if (typeof value === 'string' && urlMap[value]) return urlMap[value];
  return value || null;
}

// Les JSON sources utilisent "" pour "pas de valeur" sur des champs
// numériques/dates, ce que Postgres refuse (il attend null).
function n(v) { return v === '' || v === undefined ? null : v; }

async function main() {
  await ensureBucket();

  console.log('Upload des photos...');
  const urlMaps = {
    articles: await uploadFolder('articles'),
    wardrobe: await uploadFolder('wardrobe'),
    outfits: await uploadFolder('outfits'),
    collections: await uploadFolder('collections'),
  };
  const totalUploaded = Object.values(urlMaps).reduce((n, m) => n + Object.keys(m).length, 0);
  console.log(`${totalUploaded} photos uploadées.`);

  // --- 2. Articles -------------------------------------------------------
  const articles = JSON.parse(readFileSync(join(DATA_DIR, 'articles.json'), 'utf8'));
  const articleRows = articles.map(a => ({
    uid: a.uid,
    user_id: ownerId,
    legacy_id: a.id ?? null,
    name: a.name ?? null,
    brand: a.brand ?? null,
    store: a.store ?? null,
    supercategory: a.supercategory ?? null,
    category: a.category ?? null,
    subcategory: a.subcategory ?? null,
    color: a.color ?? null,
    color_family: a.color_family ?? null,
    price: a.price ?? null,
    price_num: n(a.price_num),
    original: a.original ?? null,
    discount: a.discount ?? null,
    currency: a.currency ?? null,
    sale: a.sale ?? null,
    url: a.url ?? null,
    note: a.note ?? null,
    file: a.file ?? null,
    image_url: resolveImage(a.img_data, urlMaps.articles),
    item_group: a.group ?? null,
    multi: !!a.multi,
    tags: a.tags ?? [],
    purchase_type: a.purchase_type ?? null,
    status: a.status ?? null,
    priority: a.priority ?? null,
    desire_score: n(a.desire_score),
    utility_score: n(a.utility_score),
    date_added: n(a.date_added),
    purchased: !!a.purchased,
    paid_price_num: n(a.paid_price_num),
    purchase_date: n(a.purchase_date),
  }));
  let { error: e1 } = await supabase.from('articles').upsert(articleRows, { onConflict: 'uid' });
  if (e1) throw e1;
  console.log(`${articleRows.length} articles importés.`);

  // --- 3. Vestiaire --------------------------------------------------------
  const wardrobe = JSON.parse(readFileSync(join(DATA_DIR, 'wardrobe_items.json'), 'utf8'));
  const wardrobeRows = wardrobe.map(w => ({
    uid: w.uid,
    user_id: ownerId,
    name: w.name ?? null,
    brand: w.brand ?? null,
    store: w.store ?? null,
    supercategory: w.supercategory ?? null,
    category: w.category ?? null,
    subcategory: w.subcategory ?? null,
    color: w.color ?? null,
    color_family: w.color_family ?? null,
    size: w.size ?? null,
    price: w.price ?? null,
    price_num: n(w.price_num),
    original: w.original ?? null,
    discount: w.discount ?? null,
    currency: w.currency ?? null,
    sale: w.sale ?? null,
    url: w.url ?? null,
    note: w.note ?? null,
    image_url: resolveImage(w.image, urlMaps.wardrobe),
    tags: w.tags ?? [],
    purchase_type: w.purchase_type ?? null,
    status: w.status ?? null,
    priority: w.priority ?? null,
    desire_score: n(w.desire_score),
    utility_score: n(w.utility_score),
    date_added: n(w.date_added),
    owned: w.owned !== false,
    ownership_origin: w.ownership_origin ?? null,
    wardrobe_active: w.wardrobe_active !== false,
    wardrobe_status: w.wardrobe_status ?? null,
    purchased: !!w.purchased,
    paid_price_num: n(w.paid_price_num),
    purchase_date: n(w.purchase_date),
  }));
  let { error: e2 } = await supabase.from('wardrobe_items').upsert(wardrobeRows, { onConflict: 'uid' });
  if (e2) throw e2;
  console.log(`${wardrobeRows.length} pièces de vestiaire importées.`);

  // Photos additionnelles (tableau "images") des pièces de vestiaire -> table photos
  const wardrobePhotoRows = [];
  wardrobe.forEach(w => {
    (w.images || []).forEach((img, i) => {
      const resolved = resolveImage(img, urlMaps.wardrobe);
      if (resolved) wardrobePhotoRows.push({ user_id: ownerId, owner_type: 'wardrobe_item', owner_uid: w.uid, url: resolved, position: i });
    });
  });

  // --- 4. Tenues -----------------------------------------------------------
  const outfits = JSON.parse(readFileSync(join(DATA_DIR, 'outfits.json'), 'utf8'));
  const outfitRows = outfits.map(o => ({
    uid: o.uid,
    user_id: ownerId,
    name: o.name ?? null,
    note: o.note ?? null,
    tags: o.tags ?? [],
    date_added: n(o.date_added),
  }));
  let { error: e3 } = await supabase.from('outfits').upsert(outfitRows, { onConflict: 'uid' });
  if (e3) throw e3;
  console.log(`${outfitRows.length} tenues importées.`);

  const outfitItemRows = [];
  const outfitPhotoRows = [];
  outfits.forEach(o => {
    (o.itemIds || []).forEach((wardrobeUid, i) => {
      outfitItemRows.push({ outfit_uid: o.uid, wardrobe_item_uid: wardrobeUid, position: i, user_id: ownerId });
    });
    (o.photos || []).forEach((img, i) => {
      const resolved = resolveImage(img, urlMaps.outfits);
      if (resolved) outfitPhotoRows.push({ user_id: ownerId, owner_type: 'outfit', owner_uid: o.uid, url: resolved, position: i });
    });
  });
  if (outfitItemRows.length) {
    const { error } = await supabase.from('outfit_items').upsert(outfitItemRows, { onConflict: 'outfit_uid,wardrobe_item_uid' });
    if (error) throw error;
  }
  console.log(`${outfitItemRows.length} relations tenue↔pièce importées.`);

  // --- 5. Collections --------------------------------------------------------
  const collections = JSON.parse(readFileSync(join(DATA_DIR, 'collections.json'), 'utf8'));
  const collectionRows = collections.map(c => ({
    id: c.id,
    user_id: ownerId,
    name: c.name ?? null,
    emoji: c.emoji ?? null,
    description: c.description ?? null,
  }));
  let { error: e4 } = await supabase.from('collections').upsert(collectionRows, { onConflict: 'id' });
  if (e4) throw e4;
  console.log(`${collectionRows.length} collections importées.`);

  const collectionItemRows = [];
  collections.forEach(c => {
    (c.items || []).forEach((articleUid, i) => {
      collectionItemRows.push({ collection_id: c.id, article_uid: articleUid, position: i, user_id: ownerId });
    });
  });
  if (collectionItemRows.length) {
    const { error } = await supabase.from('collection_items').upsert(collectionItemRows, { onConflict: 'collection_id,article_uid' });
    if (error) throw error;
  }
  console.log(`${collectionItemRows.length} relations collection↔article importées.`);

  // --- 6. Table photos (galeries) --------------------------------------------
  const allPhotoRows = [...wardrobePhotoRows, ...outfitPhotoRows];
  if (allPhotoRows.length) {
    const { error } = await supabase.from('photos').insert(allPhotoRows);
    if (error) throw error;
  }
  console.log(`${allPhotoRows.length} photos de galerie enregistrées dans la table "photos".`);

  console.log('\n✅ Migration terminée.');
}

main().catch(err => { console.error('❌ Erreur migration:', err); process.exit(1); });
