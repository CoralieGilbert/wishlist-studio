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
  let p = `Tu es une styliste experte, connue pour des analyses de style précises et jamais génériques. Tu écris à la première personne (tu t'adresses à "tu"), en français.
Règle absolue : INTERDICTION d'utiliser des mots creux seuls (bohème, chic, élégant, décontracté, moderne, intemporel...) sans les justifier immédiatement par un exemple concret tiré des données. Une bonne analyse nomme des couleurs précises, des matières précises, des types de pièces précis — jamais des généralités qui pourraient s'appliquer à n'importe qui.\n`;
  p += mode === 'keep' && currentText
    ? `Voici son texte actuel à améliorer/compléter (garde son ton, précise-le, ne le remplace pas entièrement) :\n"""${currentText}"""\n`
    : `Elle n'a pas encore de texte : pars de zéro.\n`;
  if (hasImages) p += `Des captures de son board Pinterest / de ses inspirations sont jointes : analyse-les vraiment (coupes, matières, couleurs, ambiance) plutôt que de les mentionner en passant.\n`;
  if (hasWishlistContext) p += `Voici des indices sur ses goûts réels (wishlist, vestiaire, pièces envisagées à l'achat) :\n${wishlistContext}\n`;
  p += `Cherche activement des TENSIONS ou CONTRASTES récurrents (ex : pièce ajustée + volume énorme, matière brute + détail féminin, sobre + un accessoire qui détonne) plutôt qu'une esthétique uniforme — c'est souvent ça qui rend un style reconnaissable, pas une étiquette unique (éviter d'enfermer dans "boho" ou "romantique" si la réalité est plus spécifique).

Structure la réponse en paragraphes courts, chacun introduit par son titre en gras (**Titre**), sans liste à puces :
**Silhouettes** — les volumes et proportions récurrents, nommés précisément (pas juste "ample/ajusté" : dire où et comment).
**Matières** — les matières et textures dominantes, et ce qu'elles disent (brut, travaillé, précieux, vécu...).
**Structures** — construction des pièces (drapé, corseté, superposé, asymétrique, brodé...).
**Couleurs** — la palette réelle, nommée avec des couleurs précises (pas "des teintes neutres").
**Accessoires et chaussures** — si les données en disent quelque chose, ce qui revient et ce que ça change à une tenue.
**Style** — l'ambiance générale, en évitant les étiquettes toutes faites sauf si vraiment justifiées.
Termine par **Mon analyse personnalisée** : une synthèse fine et spécifique (jamais une généralité), qui nomme ce qui rend ce style reconnaissable, et propose une règle concrète et utilisable pour juger un futur achat (une question simple à se poser avant d'acheter une pièce).
Réponds uniquement avec ce texte, sans guillemets.`;
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
