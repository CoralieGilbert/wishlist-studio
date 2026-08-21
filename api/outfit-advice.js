// Route /api/outfit-advice (POST) : suggestions pour améliorer une tenue
// existante. Toujours grounded dans de vraies pièces (celles de la tenue,
// + un nombre limité de pièces de vestiaire/wishlist réelles, choisi par
// des curseurs côté client) — jamais d'article inventé.
import { getUserFromRequest, supabaseAdmin } from './_lib/supabase-admin.mjs';
import { buildWardrobeCandidates, buildShoppingCandidates } from './_lib/wishlist-summary.mjs';

const MAX_CANDIDATES = 100;

function formatItem(x) { return `${x.name || 'Sans nom'}${x.brand ? ` (${x.brand})` : ''} — ${[x.category, x.color || x.color_family].filter(Boolean).join(', ')}`; }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }

  const { outfitName = '', outfitItems = [], wardrobeItemLimit = 10, wishlistItemLimit = 10 } = req.body || {};
  if (!Array.isArray(outfitItems) || !outfitItems.length) { res.status(400).json({ error: 'Tenue vide.' }); return; }
  const wLimit = Math.max(0, Math.min(MAX_CANDIDATES, Number(wardrobeItemLimit) || 0));
  const wishLimit = Math.max(0, Math.min(MAX_CANDIDATES, Number(wishlistItemLimit) || 0));

  const { data: settings } = await supabaseAdmin.from('user_settings').select('openai_api_key,style_text').eq('user_id', user.id).single();
  const apiKey = settings?.openai_api_key;
  if (!apiKey) { res.status(400).json({ error: "Aucune clé API enregistrée. Ajoute ta clé OpenAI dans Données & réglages." }); return; }

  const [wardrobeCandidates, wishlistCandidates] = await Promise.all([
    wLimit ? buildWardrobeCandidates(supabaseAdmin, user.id, outfitItems.map(i => i.uid), wLimit) : [],
    wishLimit ? buildShoppingCandidates(supabaseAdmin, user.id, wishLimit) : [],
  ]);

  const prompt = `Tu conseilles une amélioration pour la tenue "${outfitName || 'sans titre'}", composée de :
${outfitItems.map(formatItem).join('\n')}
${settings.style_text ? `\nStyle personnel de la personne :\n${settings.style_text}\n` : ''}
${wardrobeCandidates.length ? `\nAutres pièces qu'elle possède déjà (candidates pour un remplacement) :\n${wardrobeCandidates.map(formatItem).join('\n')}\n` : ''}
${wishlistCandidates.length ? `\nPièces de sa wishlist (candidates pour un achat qui compléterait la tenue) :\n${wishlistCandidates.map(formatItem).join('\n')}\n` : ''}
Réponds en français, en deux temps :
1. **Ton avis d'abord** : ce que tu aurais fait différemment — quelle pièce ajouter, quoi enlever, ce qui ne fonctionne pas selon toi (silhouette, couleur, proportions...). Si la tenue est déjà réussie et fidèle à son style, dis-le franchement plutôt que d'inventer un défaut.
2. **Propositions concrètes** : si tu vois un vrai axe d'amélioration, propose 1 à 3 pièces précises qui fonctionneraient mieux, prises UNIQUEMENT dans les listes ci-dessus (vestiaire ou wishlist) — n'invente jamais une pièce absente des listes. Si rien ne sert vraiment la tenue, dis-le plutôt que de forcer une suggestion.
Format : deux courts paragraphes, pas de liste à puces, pas de préambule.`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 500 }),
    });
    if (!openaiRes.ok) {
      const t = await openaiRes.text().catch(() => '');
      const err = new Error(t.slice(0, 300)); err.status = openaiRes.status; throw err;
    }
    const data = await openaiRes.json();
    const advice = data.choices?.[0]?.message?.content?.trim();
    if (!advice) throw new Error('Réponse vide');
    res.status(200).json({ advice });
  } catch (e) {
    console.error('outfit-advice error:', e.message);
    const msg = e.status === 401 ? 'Clé API invalide ou expirée.' : e.status === 429 ? 'Limite ou quota OpenAI atteint.' : 'Erreur pendant la génération. Réessaie.';
    res.status(502).json({ error: msg });
  }
}
