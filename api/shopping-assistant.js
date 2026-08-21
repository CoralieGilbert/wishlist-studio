// Route /api/shopping-assistant (POST) : propose un panier qui respecte un
// budget, choisi UNIQUEMENT parmi les vraies pièces de la wishlist (jamais
// d'article inventé — l'IA reçoit une liste de candidats réels avec leur
// uid, et ne peut que piocher dedans). Grâce à ça, aucun risque
// d'hallucination de prix ou de produit qui n'existe pas.
import { getUserFromRequest, supabaseAdmin } from './_lib/supabase-admin.mjs';
import { buildWishlistSummary, buildShoppingCandidates, buildWardrobeAndOutfits } from './_lib/wishlist-summary.mjs';

const MAX_CANDIDATES = 150;

const SCHEMA = {
  type: 'object',
  properties: {
    picks: {
      type: 'array',
      items: {
        type: 'object',
        properties: { uid: { type: 'string' }, reason: { type: 'string' }, outfit_note: { type: 'string' } },
        required: ['uid', 'reason', 'outfit_note'],
        additionalProperties: false,
      },
    },
    note: { type: 'string' },
  },
  required: ['picks', 'note'],
  additionalProperties: false,
};

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }

  const { budget, currency = 'CAD', itemLimit = 40, query = '' } = req.body || {};
  const budgetNum = Number(budget) > 0 ? Number(budget) : null;
  const limit = Math.max(1, Math.min(MAX_CANDIDATES, Number(itemLimit) || 40));

  const { data: settings } = await supabaseAdmin.from('user_settings').select('openai_api_key,style_text').eq('user_id', user.id).single();
  const apiKey = settings?.openai_api_key;
  if (!apiKey) { res.status(400).json({ error: "Aucune clé API enregistrée. Ajoute ta clé OpenAI dans Données & réglages." }); return; }

  const [wardrobeSummary, candidates, { wardrobeText, outfitsText }] = await Promise.all([
    buildWishlistSummary(supabaseAdmin, user.id),
    buildShoppingCandidates(supabaseAdmin, user.id, limit),
    buildWardrobeAndOutfits(supabaseAdmin, user.id),
  ]);
  if (!candidates.length) { res.status(400).json({ error: 'Aucune pièce dans la wishlist à proposer.' }); return; }

  const candidateLines = candidates.map(c => `${c.uid} | ${c.name || 'Sans nom'} | ${c.brand || ''} | ${c.category || ''} | ${c.color || c.color_family || ''} | ${c.price_num ?? '?'} ${c.currency || ''} | ${(c.tags || []).join(', ')}`).join('\n');

  const prompt = `Tu es une assistante personal shopper. Objectif : proposer les meilleures pièces à acheter, en piochant UNIQUEMENT dans la liste de candidats fournie ci-dessous (jamais d'article hors de cette liste).
${settings.style_text ? `Style personnel de la cliente :\n${settings.style_text}\n` : ''}
${query ? `Ce qu'elle recherche précisément : ${query}\n` : ''}
Contexte (vestiaire et goûts, statistiques) :
${wardrobeSummary}

Vestiaire actuel, pièce par pièce :
${wardrobeText || '(aucune pièce enregistrée)'}

Tenues déjà composées :
${outfitsText || '(aucune tenue enregistrée)'}

Candidats disponibles (format : uid | nom | marque | catégorie | couleur | prix devise | tags) :
${candidateLines}

Consignes :
${budgetNum ? `- Privilégie fortement les pièces dont la devise est ${currency} : ne compte JAMAIS ensemble des prix de devises différentes (ce serait faux). Une pièce dans une autre devise ne peut être choisie que si tu le signales explicitement comme "hors budget principal, devise différente".\n- Choisis une combinaison de pièces en ${currency} dont la somme ne dépasse pas ${budgetNum} ${currency}.\n` : '- Aucun budget strict fourni : propose une sélection raisonnable (pas besoin de tout dépenser).\n'}- Privilégie les pièces qui comblent un vrai manque ou complètent des pièces déjà possédées, pas des doublons.
- Si une recherche précise est donnée, priorise les candidats qui y correspondent le mieux.
- Pour chaque pièce choisie, donne "reason" (une phrase : pourquoi ce choix) ET "outfit_note", en ADAPTANT son contenu à la nature de la demande :
  · Si la demande vise à COMPLÉTER/AMÉLIORER des tenues existantes (ex : "spice up mes outfits") : "outfit_note" doit à chaque fois relier la pièce à des pièces précises déjà possédées et/ou une tenue existante nommée ci-dessus ("irait avec ton [pièce du vestiaire]", "améliorerait la tenue [nom]").
  · Si la demande vise une DIRECTION NOUVELLE ou une réinvention (ex : "garde-robe d'hiver", "renouveler mon style") : ne force PAS de lien avec le vestiaire existant sauf si une pièce précise s'y prête vraiment bien ; concentre "outfit_note" sur comment cette pièce se combine avec LES AUTRES PIÈCES DU PANIER (les autres candidats que tu choisis en même temps), en décrivant un début de tenue concrète entre nouveaux achats.
  · Dans tous les cas, "outfit_note" doit être concret (nommer des pièces précises), jamais une généralité.
- "note" : un court résumé (2-3 phrases) de la logique du panier, qui peut inclure une idée de tenue complète combinant plusieurs pièces achetées (ne donne pas de total chiffré, il sera calculé automatiquement).
- N'invente aucune pièce : le champ "uid" doit correspondre exactement à un uid de la liste.`;

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_schema', json_schema: { name: 'panier', strict: true, schema: SCHEMA } },
        max_completion_tokens: 6000,
      }),
    });
    if (!openaiRes.ok) {
      const t = await openaiRes.text().catch(() => '');
      const err = new Error(t.slice(0, 300)); err.status = openaiRes.status; throw err;
    }
    const data = await openaiRes.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new Error('Réponse vide');
    const parsed = JSON.parse(content);
    const byUid = new Map(candidates.map(c => [c.uid, c]));
    parsed.picks = (parsed.picks || []).filter(p => byUid.has(p.uid));
    // Le total est calculé ici, jamais par l'IA (elle additionne parfois des
    // devises différentes entre elles, ce qui n'a pas de sens).
    const totalsByCurrency = {};
    parsed.picks.forEach(p => {
      const c = byUid.get(p.uid);
      if (c.price_num != null) {
        const cur = c.currency || '?';
        totalsByCurrency[cur] = (totalsByCurrency[cur] || 0) + Number(c.price_num);
      }
    });
    parsed.totalsByCurrency = totalsByCurrency;
    parsed.budget = { amount: budgetNum, currency };
    res.status(200).json(parsed);
  } catch (e) {
    console.error('shopping-assistant error:', e.message);
    const msg = e.status === 401 ? 'Clé API invalide ou expirée.' : e.status === 429 ? 'Limite ou quota OpenAI atteint.' : 'Erreur pendant la génération. Réessaie.';
    res.status(502).json({ error: msg });
  }
}
