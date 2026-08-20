// Route /api/generate-style (POST) : rédige/améliore la description de
// style personnel, à partir d'une combinaison choisie par la personne :
// texte existant, résumé de sa wishlist, et/ou captures Pinterest.
// Garde-fou : au-delà de 6 images ou d'un résumé wishlist complet, le
// front-end doit avoir montré une estimation de coût avant d'appeler ceci
// (voir /api/estimate-style-cost) — ici on applique en plus un plafond dur
// pour ne jamais dépendre uniquement de la discipline du client.
import { getUserFromRequest, supabaseAdmin } from './_lib/supabase-admin.mjs';
import { buildWishlistSummary, buildWishlistDetail } from './_lib/wishlist-summary.mjs';

const MAX_IMAGES = 20;
const MAX_WISHLIST_ITEMS = 100;

function buildPrompt({ currentText, mode, hasWishlistContext, wishlistContext, hasImages }) {
  let p = `Tu aides une personne à rédiger la description de son style vestimentaire personnel, à la première personne, en français, en un seul paragraphe (100 à 200 mots).\n`;
  p += mode === 'keep' && currentText
    ? `Voici son texte actuel à améliorer/compléter (garde son ton, précise-le, ne le remplace pas entièrement) :\n"""${currentText}"""\n`
    : `Elle n'a pas encore de texte : pars de zéro.\n`;
  if (hasImages) p += `Des captures de son board Pinterest / de ses inspirations sont jointes : identifie les tendances visuelles communes (couleurs, coupes, matières, ambiance générale).\n`;
  if (hasWishlistContext) p += `Voici des indices sur ses goûts réels (wishlist, vestiaire, pièces envisagées à l'achat) :\n${wishlistContext}\n`;
  p += `Réponds uniquement avec le texte du style, sans titre ni guillemets ni liste à puces.`;
  return p;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }

  const { currentText = '', mode = 'keep', images = [], useWishlistSummary = false, wishlistItemCount = 0 } = req.body || {};
  if (!Array.isArray(images) || images.length > MAX_IMAGES) { res.status(400).json({ error: `Maximum ${MAX_IMAGES} images par génération.` }); return; }
  if (images.some(img => typeof img !== 'string' || !(img.startsWith('data:image/') || img.startsWith('https://')))) { res.status(400).json({ error: 'Image invalide.' }); return; }
  const itemCount = Math.max(0, Math.min(MAX_WISHLIST_ITEMS, Number(wishlistItemCount) || 0));

  const { data: settings } = await supabaseAdmin.from('user_settings').select('openai_api_key').eq('user_id', user.id).single();
  const apiKey = settings?.openai_api_key;
  if (!apiKey) { res.status(400).json({ error: "Aucune clé API enregistrée. Ajoute ta clé OpenAI dans Données & réglages." }); return; }

  const parts = [];
  if (useWishlistSummary) parts.push(await buildWishlistSummary(supabaseAdmin, user.id));
  if (itemCount) parts.push(await buildWishlistDetail(supabaseAdmin, user.id, itemCount));
  const wishlistContext = parts.filter(Boolean).join('\n\n');

  const content = [{ type: 'text', text: buildPrompt({ currentText, mode, hasWishlistContext: !!wishlistContext, wishlistContext, hasImages: images.length > 0 }) }];
  images.forEach(img => content.push({ type: 'image_url', image_url: { url: img } }));

  try {
    const openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content }], max_tokens: 500 }),
    });
    if (!openaiRes.ok) {
      const t = await openaiRes.text().catch(() => '');
      const err = new Error(t.slice(0, 300)); err.status = openaiRes.status; throw err;
    }
    const data = await openaiRes.json();
    const styleText = data.choices?.[0]?.message?.content?.trim();
    if (!styleText) throw new Error('Réponse vide');
    res.status(200).json({ styleText });
  } catch (e) {
    console.error('generate-style error:', e.message);
    const msg = e.status === 401 ? 'Clé API invalide ou expirée.' : e.status === 429 ? 'Limite ou quota OpenAI atteint.' : 'Erreur pendant la génération. Réessaie.';
    res.status(502).json({ error: msg });
  }
}
