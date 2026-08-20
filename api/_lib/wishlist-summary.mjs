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
