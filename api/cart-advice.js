// Route /api/cart-advice (POST) : avis sur une sélection libre de pièces du
// panier (wishlist, pas encore achetées) + tenues possibles avec le vestiaire
// + suggestions d'ajout (wishlist) et de retrait (redondant/pas dans le
// style) — même principe que outfit-advice.js : l'IA ne peut piocher que
// dans les listes de candidats fournies, tout est revalidé côté serveur.
import { getUserFromRequest, supabaseAdmin } from './_lib/supabase-admin.mjs';
import { buildWardrobeCandidates, buildShoppingCandidates } from './_lib/wishlist-summary.mjs';

const MAX_ITEMS = 60;
const MAX_CANDIDATES = 100;

const SCHEMA = {
  type: 'object',
  properties: {
    advice: { type: 'string' },
    outfit_ideas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          uids: { type: 'array', items: { type: 'string' } },
          note: { type: 'string' },
        },
        required: ['title', 'uids', 'note'],
        additionalProperties: false,
      },
    },
    additions: {
      type: 'array',
      items: {
        type: 'object',
        properties: { uid: { type: 'string' }, reason: { type: 'string' } },
        required: ['uid', 'reason'],
        additionalProperties: false,
      },
    },
    removals: {
      type: 'array',
      items: {
        type: 'object',
        properties: { uid: { type: 'string' }, reason: { type: 'string' } },
        required: ['uid', 'reason'],
        additionalProperties: false,
      },
    },
  },
  required: ['advice', 'outfit_ideas', 'additions', 'removals'],
  additionalProperties: false,
};

function formatItem(x) { return `${x.uid} | ${x.name || 'Sans nom'}${x.brand ? ` (${x.brand})` : ''} — ${[x.category, x.color || x.color_family].filter(Boolean).join(', ')}`; }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }

  const { itemUids = [], wardrobeItemLimit = 25, wishlistItemLimit = 15, query = '' } = req.body || {};
  if (!Array.isArray(itemUids) || !itemUids.length) { res.status(400).json({ error: 'Sélection vide.' }); return; }
  const uids = itemUids.slice(0, MAX_ITEMS);
  const wLimit = Math.max(0, Math.min(MAX_CANDIDATES, Number(wardrobeItemLimit) || 0));
  const wishLimit = Math.max(0, Math.min(MAX_CANDIDATES, Number(wishlistItemLimit) || 0));

  const { data: settings } = await supabaseAdmin.from('user_settings').select('openai_api_key,style_text').eq('user_id', user.id).single();
  const apiKey = settings?.openai_api_key;
  if (!apiKey) { res.status(400).json({ error: "Aucune clé API enregistrée. Ajoute ta clé OpenAI dans Données & réglages." }); return; }

  const { data: selectedArticles } = await supabaseAdmin.from('articles')
    .select('uid,name,brand,category,subcategory,color,color_family,price_num,currency')
    .eq('user_id', user.id).in('uid', uids);
  if (!selectedArticles?.length) { res.status(400).json({ error: "Aucune des pièces sélectionnées n'a été trouvée." }); return; }
  const selectedUids = selectedArticles.map(a => a.uid);

  const [wardrobeCandidates, wishlistCandidatesRaw, { data: styleImages }] = await Promise.all([
    wLimit ? buildWardrobeCandidates(supabaseAdmin, user.id, [], wLimit) : [],
    wishLimit ? buildShoppingCandidates(supabaseAdmin, user.id, wishLimit + selectedUids.length) : [],
    supabaseAdmin.from('photos').select('url').eq('owner_type', 'style_profile').eq('owner_uid', user.id).order('position').limit(6),
  ]);
  const wishlistCandidates = wishlistCandidatesRaw.filter(c => !selectedUids.includes(c.uid)).slice(0, wishLimit);
  const pinterestUrls = (styleImages || []).map(p => p.url);

  const outfitIdeaUidPool = new Set([...selectedUids, ...wardrobeCandidates.map(c => c.uid)]);
  const additionCandidateMap = new Map(wishlistCandidates.map(c => [c.uid, c]));

  const prompt = `Tu donnes un avis sur une sélection de ${selectedArticles.length} pièce(s) actuellement dans le panier (wishlist, pas encore achetées) de cette personne :
${selectedArticles.map(formatItem).join('\n')}
${settings.style_text ? `\nStyle personnel de la personne (texte qu'elle a défini elle-même) :\n${settings.style_text}\n` : ''}
${pinterestUrls.length ? `\nDes captures de son board Pinterest / ses inspirations sont jointes en images.\n` : ''}
${query ? `\nDemande précise de la personne : ${query}\n` : ''}
${wardrobeCandidates.length ? `\nPièces qu'elle possède déjà (vestiaire — pour composer des tenues avec la sélection, format uid | nom (marque) — catégorie, couleur) :\n${wardrobeCandidates.map(formatItem).join('\n')}\n` : ''}
${wishlistCandidates.length ? `\nAutres pièces de sa wishlist, pas dans cette sélection (candidats pour un AJOUT au panier, même format) :\n${wishlistCandidates.map(formatItem).join('\n')}\n` : ''}
Règle importante : ton jugement doit s'appuyer UNIQUEMENT sur son style défini (texte) et ses références Pinterest (images) — pas sur des règles de mode génériques ou tes goûts personnels. Si aucun style/Pinterest n'est fourni, dis-le et reste très prudente dans ton avis.
Réponds en français.
"advice" : deux courts paragraphes, pas de liste à puces, pas de préambule — (1) avis global sur la cohérence de cette sélection avec son style ; (2) si elle fait doublon avec des pièces déjà possédées (vestiaire) ou si elle s'éloigne de son style, dis-le franchement ; sinon dis que la sélection est cohérente plutôt que d'inventer un défaut.
"outfit_ideas" : 0 à 4 combinaisons concrètes de tenues réalisables, chacune avec un "title" court, une liste "uids" (2 à 5 pièces prises UNIQUEMENT parmi la sélection ci-dessus et/ou le vestiaire listé, au moins une pièce DOIT venir de la sélection du panier) et une "note" expliquant l'occasion/le style de la combinaison. Vide si rien de cohérent ne se dégage.
"additions" : 0 à 3 pièces prises UNIQUEMENT dans la liste "wishlist, pas dans cette sélection" ci-dessus (uid exact), qui complèteraient bien la sélection. Vide si rien ne s'impose.
"removals" : 0 à 3 pièces UNIQUEMENT parmi la sélection actuelle (uid exact ci-dessus) qui font doublon avec le vestiaire ou s'éloignent de son style et gagneraient à être retirées du panier. Ne jamais proposer de tout retirer. Vide si tout va bien.
Pour chaque élément de "additions"/"removals", "reason" doit être concrète (nommer des pièces précises), jamais une généralité. N'invente jamais un uid absent des listes fournies.`;

  const content = [{ type: 'text', text: prompt }];
  pinterestUrls.forEach(url => content.push({ type: 'image_url', image_url: { url } }));

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content }],
        response_format: { type: 'json_schema', json_schema: { name: 'avis_panier', strict: true, schema: SCHEMA } },
        max_completion_tokens: 5000,
      }),
    });
    if (!openaiRes.ok) {
      const t = await openaiRes.text().catch(() => '');
      const err = new Error(t.slice(0, 300)); err.status = openaiRes.status; throw err;
    }
    const data = await openaiRes.json();
    const rawContent = data.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error('Réponse vide');
    const parsed = JSON.parse(rawContent);

    parsed.outfit_ideas = (parsed.outfit_ideas || [])
      .map(idea => ({ ...idea, uids: (idea.uids || []).filter(u => outfitIdeaUidPool.has(u)) }))
      .filter(idea => idea.uids.length >= 2 && idea.uids.some(u => selectedUids.includes(u)));
    parsed.additions = (parsed.additions || []).filter(a => additionCandidateMap.has(a.uid));
    parsed.removals = (parsed.removals || []).filter(r => selectedUids.includes(r.uid));

    res.status(200).json(parsed);
  } catch (e) {
    console.error('cart-advice error:', e.message);
    const msg = e.status === 401 ? 'Clé API invalide ou expirée.' : e.status === 429 ? 'Limite ou quota OpenAI atteint.' : 'Erreur pendant la génération. Réessaie.';
    res.status(502).json({ error: msg });
  }
}
