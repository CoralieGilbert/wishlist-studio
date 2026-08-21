// Route /api/outfit-advice (POST) : avis sur une tenue existante + suggestions
// concrètes d'ajout (vestiaire/wishlist) et de retrait, ancrées dans de vrais
// uid (jamais un article inventé — même principe que shopping-assistant.js :
// l'IA ne peut piocher que dans les listes de candidats fournies, et tout est
// revalidé côté serveur après coup).
import { getUserFromRequest, supabaseAdmin } from './_lib/supabase-admin.mjs';
import { buildWardrobeCandidates, buildShoppingCandidates } from './_lib/wishlist-summary.mjs';

const MAX_CANDIDATES = 100;

const SCHEMA = {
  type: 'object',
  properties: {
    advice: { type: 'string' },
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
  required: ['advice', 'additions', 'removals'],
  additionalProperties: false,
};

function formatItem(x) { return `${x.uid} | ${x.name || 'Sans nom'}${x.brand ? ` (${x.brand})` : ''} — ${[x.category, x.color || x.color_family].filter(Boolean).join(', ')}`; }

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }

  const { outfitName = '', outfitItems = [], wardrobeItemLimit = 10, wishlistItemLimit = 10, query = '', occasion = '', budget = null, currency = 'CAD' } = req.body || {};
  if (!Array.isArray(outfitItems) || !outfitItems.length) { res.status(400).json({ error: 'Tenue vide.' }); return; }
  const wLimit = Math.max(0, Math.min(MAX_CANDIDATES, Number(wardrobeItemLimit) || 0));
  const wishLimit = Math.max(0, Math.min(MAX_CANDIDATES, Number(wishlistItemLimit) || 0));
  const budgetNum = Number(budget) > 0 ? Number(budget) : null;
  const outfitUids = outfitItems.map(i => i.uid);

  const { data: settings } = await supabaseAdmin.from('user_settings').select('openai_api_key,style_text').eq('user_id', user.id).single();
  const apiKey = settings?.openai_api_key;
  if (!apiKey) { res.status(400).json({ error: "Aucune clé API enregistrée. Ajoute ta clé OpenAI dans Données & réglages." }); return; }

  const [wardrobeCandidates, wishlistCandidates, { data: styleImages }] = await Promise.all([
    wLimit ? buildWardrobeCandidates(supabaseAdmin, user.id, outfitUids, wLimit) : [],
    wishLimit ? buildShoppingCandidates(supabaseAdmin, user.id, wishLimit) : [],
    supabaseAdmin.from('photos').select('url').eq('owner_type', 'style_profile').eq('owner_uid', user.id).order('position').limit(6),
  ]);
  const pinterestUrls = (styleImages || []).map(p => p.url);

  // Tagué par source pour que le front sache quel bouton d'action afficher
  // (jamais fait confiance à l'IA pour ce champ — reconstruit ici).
  const candidateMap = new Map([
    ...wardrobeCandidates.map(c => [c.uid, { ...c, source: 'wardrobe' }]),
    ...wishlistCandidates.map(c => [c.uid, { ...c, source: 'wishlist' }]),
  ]);

  const prompt = `Tu conseilles une amélioration pour la tenue "${outfitName || 'sans titre'}", composée de :
${outfitItems.map(formatItem).join('\n')}
${settings.style_text ? `\nStyle personnel de la personne (texte qu'elle a défini elle-même) :\n${settings.style_text}\n` : ''}
${pinterestUrls.length ? `\nDes captures de son board Pinterest / ses inspirations sont jointes en images.\n` : ''}
${occasion ? `\nOccasion / contexte visé : ${occasion}\n` : ''}
${query ? `\nDemande précise de la personne : ${query}\n` : ''}
${wardrobeCandidates.length ? `\nAutres pièces qu'elle possède déjà (candidats pour un AJOUT — format uid | nom (marque) — catégorie, couleur) :\n${wardrobeCandidates.map(formatItem).join('\n')}\n` : ''}
${wishlistCandidates.length ? `\nPièces de sa wishlist (candidats pour un AJOUT par achat — même format)${budgetNum ? `, budget max ${budgetNum} ${currency}` : ''} :\n${wishlistCandidates.map(formatItem).join('\n')}\n` : ''}
Règle importante : ton jugement sur ce qui fonctionne ou non doit s'appuyer UNIQUEMENT sur son style défini (texte) et ses références Pinterest (images) — pas sur des règles de mode génériques ou tes goûts personnels. Si aucun style/Pinterest n'est fourni, dis-le et reste très prudente dans ton avis.
Réponds en français.
"advice" : deux courts paragraphes, pas de liste à puces, pas de préambule — (1) ton avis d'abord : ce que tu aurais fait différemment par rapport à SON style/ses références ; (2) si un vrai axe d'amélioration existe, annonce-le, sinon dis franchement que la tenue est déjà fidèle à son style plutôt que d'inventer un défaut.
"additions" : 0 à 3 pièces précises prises UNIQUEMENT dans les listes de candidats ci-dessus (uid exact), qui rapprocheraient la tenue de son style/ses références. Vide si rien ne sert vraiment la tenue.
"removals" : 0 à 2 pièces UNIQUEMENT parmi celles de la tenue actuelle (uid exact ci-dessus) qui s'éloignent de son style et gagneraient à être retirées/remplacées. Ne jamais proposer de vider toute la tenue. Vide si tout va bien.
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
        response_format: { type: 'json_schema', json_schema: { name: 'conseils_tenue', strict: true, schema: SCHEMA } },
        max_completion_tokens: 3000,
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

    parsed.additions = (parsed.additions || [])
      .filter(a => candidateMap.has(a.uid))
      .map(a => ({ ...a, source: candidateMap.get(a.uid).source }));
    parsed.removals = (parsed.removals || []).filter(r => outfitUids.includes(r.uid));

    res.status(200).json(parsed);
  } catch (e) {
    console.error('outfit-advice error:', e.message);
    const msg = e.status === 401 ? 'Clé API invalide ou expirée.' : e.status === 429 ? 'Limite ou quota OpenAI atteint.' : 'Erreur pendant la génération. Réessaie.';
    res.status(502).json({ error: msg });
  }
}
