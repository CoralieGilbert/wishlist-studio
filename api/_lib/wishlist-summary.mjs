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
  const n = Math.max(0, Math.min(50, Number(limit) || 0));
  if (!n) return '';
  const { data } = await supabaseAdmin.from('articles')
    .select('name,brand,category,subcategory,color,price,tags')
    .eq('user_id', userId).eq('is_trashed', false).eq('purchased', false)
    .order('date_added', { ascending: false }).limit(n);
  if (!data?.length) return '';
  const lines = data.map(a => `- ${a.name || 'Sans nom'}${a.brand ? ` (${a.brand})` : ''} — ${[a.category, a.color, a.price].filter(Boolean).join(', ')}${a.tags?.length ? ` [${a.tags.join(', ')}]` : ''}`);
  return `Dernières pièces activement envisagées à l'achat :\n${lines.join('\n')}`;
}
