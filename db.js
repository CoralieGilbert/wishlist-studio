// Couche d'accès aux données : tout ce qui parle à Supabase vit ici.
// app.js ne connaît que window.Auth et window.DB — jamais supabase-js
// directement — pour rester facile à faire évoluer (cf. discussion sur
// séparer front / back).
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// Valeurs publiques (safe à exposer au navigateur, protégées par RLS).
const SUPABASE_URL = 'https://tnkjerfcfzhtfaiwoqql.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_0dmRIRxr_Z2R-e78eAi81g_MqqT_HCG';
const BUCKET = 'wishlist-photos';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// --- Colonnes réellement présentes dans chaque table (pour ne jamais
//     envoyer un champ inconnu à Supabase). ------------------------------
const ARTICLE_COLUMNS = ['uid','legacy_id','name','brand','store','supercategory','category','subcategory','color','color_family','price','price_num','original','discount','currency','sale','url','note','file','image_url','item_group','multi','tags','purchase_type','status','priority','desire_score','utility_score','date_added','in_cart','is_favorite','is_trashed','purchased','paid_price_num','purchase_date'];
const WARDROBE_COLUMNS = ['uid','name','brand','store','supercategory','category','subcategory','color','color_family','size','price','price_num','original','discount','currency','sale','url','note','image_url','tags','purchase_type','status','priority','desire_score','utility_score','date_added','owned','ownership_origin','wardrobe_active','wardrobe_status','in_cart','is_favorite','is_trashed','purchased','paid_price_num','purchase_date'];
const OUTFIT_COLUMNS = ['uid','name','note','tags','date_added'];
const COLLECTION_COLUMNS = ['id','name','emoji','description'];

function pick(obj, keys) { const o = {}; keys.forEach(k => { if (obj[k] !== undefined) o[k] = obj[k]; }); return o; }
function clone(x) { return JSON.parse(JSON.stringify(x)); }

// === AUTHENTIFICATION ======================================================
window.Auth = {
  async login() {
    const email = document.getElementById('authEmail').value.trim();
    const password = document.getElementById('authPassword').value;
    const errEl = document.getElementById('authError');
    const btn = document.getElementById('authSubmit');
    errEl.style.display = 'none';
    btn.disabled = true; btn.textContent = 'Connexion…';
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    btn.disabled = false; btn.textContent = 'Se connecter';
    if (error) { errEl.textContent = 'Connexion refusée : ' + error.message; errEl.style.display = 'block'; }
  },
  async logout() {
    await supabase.auth.signOut();
    location.reload();
  },
  onReady(callback) {
    supabase.auth.getSession().then(({ data }) => callback(data.session));
    supabase.auth.onAuthStateChange((_event, session) => callback(session));
  },
};

// === LECTURE : reconstruit le même "state" que l'app utilisait avant,
//     à partir des 7 tables Supabase. =======================================
async function fetchAll(table) {
  const { data, error } = await supabase.from(table).select('*');
  if (error) throw error;
  return data || [];
}

async function loadState() {
  const [articles, wardrobeItems, outfits, outfitItems, collections, collectionItems, photos] = await Promise.all(
    ['articles', 'wardrobe_items', 'outfits', 'outfit_items', 'collections', 'collection_items', 'photos'].map(fetchAll)
  );
  const photosFor = (type, uid) => photos.filter(p => p.owner_type === type && p.owner_uid === uid)
    .sort((a, b) => a.position - b.position).map(p => p.url);

  articles.forEach(a => { a.images = photosFor('article', a.uid); a.owned = false; a.group = a.item_group; a.id = a.legacy_id; });
  wardrobeItems.forEach(w => { w.images = photosFor('wardrobe_item', w.uid); });
  outfits.forEach(o => {
    o.id = o.uid;
    o.photos = photosFor('outfit', o.uid);
    o.itemIds = outfitItems.filter(oi => oi.outfit_uid === o.uid).sort((a, b) => a.position - b.position).map(oi => oi.wardrobe_item_uid);
  });
  collections.forEach(c => {
    c.items = collectionItems.filter(ci => ci.collection_id === c.id).sort((a, b) => a.position - b.position).map(ci => ci.article_uid);
  });

  const flagged = (col) => articles.filter(a => a[col]).map(a => a.uid).concat(wardrobeItems.filter(w => w[col]).map(w => w.uid));
  return {
    articles, wardrobeItems, outfits, collections,
    cart: flagged('in_cart'), trash: flagged('is_trashed'), favorites: flagged('is_favorite'),
    settings: JSON.parse(localStorage.getItem('wishlistStudioSettings') || '{"groupDuplicates":false}'),
  };
}

function snapshot(state) {
  return clone({ articles: state.articles, wardrobeItems: state.wardrobeItems, outfits: state.outfits, collections: state.collections, cart: state.cart, trash: state.trash, favorites: state.favorites });
}

// === ÉCRITURE : upload des photos en attente, puis synchronisation par
//     différence (compare l'état actuel au dernier état synchronisé, et ne
//     pousse que ce qui a changé). ==========================================
async function uploadDataUri(dataUri, folder) {
  const res = await fetch(dataUri);
  const blob = await res.blob();
  const ext = blob.type.includes('webp') ? 'webp' : blob.type.includes('png') ? 'png' : blob.type.includes('gif') ? 'gif' : 'jpg';
  const path = `${folder}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw error;
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

async function uploadPendingImages(state) {
  const jobs = [];
  const field = (obj, key) => { if (typeof obj[key] === 'string' && obj[key].startsWith('data:')) jobs.push((async () => { obj[key] = await uploadDataUri(obj[key], 'uploads'); })()); };
  const arrayField = (obj, key) => { (obj[key] || []).forEach((v, i) => { if (typeof v === 'string' && v.startsWith('data:')) jobs.push((async () => { obj[key][i] = await uploadDataUri(v, 'uploads'); })()); }); };
  [...state.articles, ...state.wardrobeItems].forEach(x => { field(x, 'image_url'); arrayField(x, 'images'); });
  state.outfits.forEach(o => arrayField(o, 'photos'));
  await Promise.all(jobs);
}

async function syncEntityTable(table, idCol, columns, current, previous) {
  const curByKey = new Map(current.map(x => [x[idCol], x]));
  const prevByKey = new Map(previous.map(x => [x[idCol], x]));
  const toUpsert = [];
  for (const [key, item] of curByKey) {
    const prev = prevByKey.get(key);
    const nowPicked = pick(item, columns);
    if (!prev || JSON.stringify(pick(prev, columns)) !== JSON.stringify(nowPicked)) toUpsert.push(nowPicked);
  }
  const toDelete = [...prevByKey.keys()].filter(key => !curByKey.has(key));
  if (toUpsert.length) { const { error } = await supabase.from(table).upsert(toUpsert, { onConflict: idCol }); if (error) throw error; }
  if (toDelete.length) { const { error } = await supabase.from(table).delete().in(idCol, toDelete); if (error) throw error; }
}

async function syncPhotos(ownerType, current, previous, getPhotos) {
  const curByUid = new Map(current.map(x => [x.uid, x]));
  const prevByUid = new Map(previous.map(x => [x.uid, x]));
  for (const [uid, item] of curByUid) {
    const prev = prevByUid.get(uid);
    const curPhotos = getPhotos(item) || [];
    const prevPhotos = prev ? (getPhotos(prev) || []) : [];
    if (JSON.stringify(curPhotos) === JSON.stringify(prevPhotos)) continue;
    await supabase.from('photos').delete().eq('owner_type', ownerType).eq('owner_uid', uid);
    if (curPhotos.length) {
      const rows = curPhotos.map((url, i) => ({ owner_type: ownerType, owner_uid: uid, url, position: i }));
      const { error } = await supabase.from('photos').insert(rows); if (error) throw error;
    }
  }
  for (const uid of prevByUid.keys()) if (!curByUid.has(uid)) await supabase.from('photos').delete().eq('owner_type', ownerType).eq('owner_uid', uid);
}

async function syncRelation(table, parentCol, childCol, current, previous, getChildIds) {
  const curByUid = new Map(current.map(x => [x.uid, x]));
  const prevByUid = new Map(previous.map(x => [x.uid, x]));
  for (const [uid, item] of curByUid) {
    const prev = prevByUid.get(uid);
    const curIds = getChildIds(item) || [];
    const prevIds = prev ? (getChildIds(prev) || []) : [];
    if (JSON.stringify(curIds) === JSON.stringify(prevIds)) continue;
    await supabase.from(table).delete().eq(parentCol, uid);
    if (curIds.length) {
      const rows = curIds.map((childId, i) => ({ [parentCol]: uid, [childCol]: childId, position: i }));
      const { error } = await supabase.from(table).insert(rows); if (error) throw error;
    }
  }
  for (const uid of prevByUid.keys()) if (!curByUid.has(uid)) await supabase.from(table).delete().eq(parentCol, uid);
}

async function syncFlags(column, current, previous, state) {
  const added = current.filter(uid => !previous.includes(uid));
  const removed = previous.filter(uid => !current.includes(uid));
  if (!added.length && !removed.length) return;
  const tableOf = new Map([...state.articles.map(a => [a.uid, 'articles']), ...state.wardrobeItems.map(w => [w.uid, 'wardrobe_items'])]);
  for (const uid of added) { const t = tableOf.get(uid); if (t) await supabase.from(t).update({ [column]: true }).eq('uid', uid); }
  for (const uid of removed) { const t = tableOf.get(uid); if (t) await supabase.from(t).update({ [column]: false }).eq('uid', uid); }
}

async function persistState(state, previous) {
  localStorage.setItem('wishlistStudioSettings', JSON.stringify(state.settings));
  await uploadPendingImages(state);
  await syncEntityTable('articles', 'uid', ARTICLE_COLUMNS, state.articles.map(a => ({ ...a, item_group: a.group })), previous.articles);
  await syncEntityTable('wardrobe_items', 'uid', WARDROBE_COLUMNS, state.wardrobeItems, previous.wardrobeItems);
  await syncEntityTable('outfits', 'uid', OUTFIT_COLUMNS, state.outfits, previous.outfits);
  await syncEntityTable('collections', 'id', COLLECTION_COLUMNS, state.collections, previous.collections);
  await syncRelation('outfit_items', 'outfit_uid', 'wardrobe_item_uid', state.outfits, previous.outfits, o => o.itemIds);
  await syncRelation('collection_items', 'collection_id', 'article_uid', state.collections, previous.collections, c => c.items);
  await syncPhotos('article', state.articles, previous.articles, a => a.images);
  await syncPhotos('wardrobe_item', state.wardrobeItems, previous.wardrobeItems, w => w.images);
  await syncPhotos('outfit', state.outfits, previous.outfits, o => o.photos);
  await syncFlags('in_cart', state.cart, previous.cart, state);
  await syncFlags('is_trashed', state.trash, previous.trash, state);
  await syncFlags('is_favorite', state.favorites, previous.favorites, state);
  return snapshot(state);
}

window.DB = { loadState, persistState, snapshot, uploadDataUri };
