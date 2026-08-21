// Construit un résumé compact (quelques centaines de tokens, jamais les
// fiches complètes) de la wishlist + du vestiaire d'une personne, pour
// donner du contexte à l'IA sans faire exploser la facture.
function topEntries(list, key, n = 8) {
  const counts = {};
  list.forEach(x => { const v = x[key]; if (v) counts[v] = (counts[v] || 0) + 1; });
  return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, n]) => `${k} (${n})`).join(', ');
}

export async function buildWishlistSummary(supabaseAdmin, userId) {
  const [{ data: articles }, { data: wardrobe }] = await Promise.all([
    supabaseAdmin.from('articles').select('brand,category,subcategory,color_family,tags,status,purchase_type').eq('user_id', userId),
    supabaseAdmin.from('wardrobe_items').select('brand,category,subcategory,color_family,tags').eq('user_id', userId),
  ]);
  const a = articles || [], w = wardrobe || [];
  const allTags = [...a, ...w].flatMap(x => x.tags || []);
  const tagCounts = {};
  allTags.forEach(t => tagCounts[t] = (tagCounts[t] || 0) + 1);
  const topTags = Object.entries(tagCounts).sort((x, y) => y[1] - x[1]).slice(0, 15).map(([t]) => t).join(', ');

  return [
    `Wishlist : ${a.length} articles souhaités. Marques fréquentes : ${topEntries(a, 'brand')}.`,
    `Catégories les plus présentes (wishlist) : ${topEntries(a, 'category')}.`,
    `Couleurs les plus présentes (wishlist) : ${topEntries(a, 'color_family')}.`,
    `Vestiaire actuel : ${w.length} pièces possédées. Catégories : ${topEntries(w, 'category')}. Couleurs : ${topEntries(w, 'color_family')}.`,
    `Tags les plus utilisés (wishlist + vestiaire) : ${topTags}.`,
  ].join('\n');
}

// Détail des N dernières pièces activement envisagées à l'achat (pas
// achetées, pas à la corbeille). Contrairement au résumé ci-dessus, celui-ci
// grandit avec N — d'où le curseur côté interface pour garder la main sur
// le coût.
export async function buildWishlistDetail(supabaseAdmin, userId, limit) {
  const n = Math.max(0, Math.min(100, Number(limit) || 0));
  if (!n) return '';
  const { data } = await supabaseAdmin.from('articles')
    .select('name,brand,category,subcategory,color,price,tags')
    .eq('user_id', userId).eq('is_trashed', false).eq('purchased', false)
    .order('date_added', { ascending: false }).limit(n);
  if (!data?.length) return '';
  const lines = data.map(a => `- ${a.name || 'Sans nom'}${a.brand ? ` (${a.brand})` : ''} — ${[a.category, a.color, a.price].filter(Boolean).join(', ')}${a.tags?.length ? ` [${a.tags.join(', ')}]` : ''}`);
  return `Dernières pièces activement envisagées à l'achat :\n${lines.join('\n')}`;
}

// Candidats "achetables" pour l'assistant shopping : uniquement des pièces
// réelles de la wishlist (jamais inventées), avec leur prix, pour que l'IA
// puisse composer un panier qui respecte un budget.
export async function buildShoppingCandidates(supabaseAdmin, userId, limit) {
  const n = Math.max(0, Math.min(150, Number(limit) || 0));
  if (!n) return [];
  const { data } = await supabaseAdmin.from('articles')
    .select('uid,name,brand,category,subcategory,color,color_family,price_num,currency,tags')
    .eq('user_id', userId).eq('is_trashed', false).eq('purchased', false)
    .order('date_added', { ascending: false }).limit(n);
  return data || [];
}

// Pièces de vestiaire (hors celles déjà dans la tenue), candidates pour un
// éventuel remplacement suggéré par l'IA.
export async function buildWardrobeCandidates(supabaseAdmin, userId, excludeUids, limit) {
  const n = Math.max(0, Math.min(100, Number(limit) || 0));
  if (!n) return [];
  const { data } = await supabaseAdmin.from('wardrobe_items')
    .select('uid,name,brand,category,subcategory,color,color_family,tags')
    .eq('user_id', userId).eq('wardrobe_active', true).limit(n + excludeUids.length);
  return (data || []).filter(w => !excludeUids.includes(w.uid)).slice(0, n);
}

// Vestiaire complet (nom/catégorie/couleur) + tenues existantes déjà
// composées, pour que l'assistant shopping puisse dire concrètement avec
// quoi une pièce achetée irait, ou quelle tenue elle améliorerait.
export async function buildWardrobeAndOutfits(supabaseAdmin, userId) {
  const [{ data: wardrobe }, { data: outfits }, { data: links }] = await Promise.all([
    supabaseAdmin.from('wardrobe_items').select('uid,name,brand,category,color,color_family').eq('user_id', userId).eq('wardrobe_active', true),
    supabaseAdmin.from('outfits').select('uid,name').eq('user_id', userId),
    supabaseAdmin.from('outfit_items').select('outfit_uid,wardrobe_item_uid').eq('user_id', userId),
  ]);
  const w = wardrobe || [], byUid = new Map(w.map(x => [x.uid, x]));
  const wardrobeText = w.map(x => `- ${x.name}${x.brand ? ` (${x.brand})` : ''} — ${x.category || ''}${x.color || x.color_family ? ', ' + (x.color || x.color_family) : ''}`).join('\n');
  const outfitsText = (outfits || []).map(o => {
    const pieces = (links || []).filter(l => l.outfit_uid === o.uid).map(l => byUid.get(l.wardrobe_item_uid)?.name).filter(Boolean);
    return `- "${o.name || 'Tenue sans titre'}" : ${pieces.join(', ') || 'aucune pièce'}`;
  }).join('\n');
  return { wardrobeText, outfitsText };
}
