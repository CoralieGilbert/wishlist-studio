// Appelle l'API vision d'OpenAI pour transformer une capture produit en
// fiche structurée. N'invente jamais un champ incertain (consigne donnée
// au modèle) : mieux vaut un champ vide qu'une donnée fausse.
const CATEGORIES = ['Vêtements', 'Chaussures', 'Bijoux', 'Accessoires', 'Technologies', 'Jeux', 'Livres', 'Maison', 'Beauté', 'Autre'];
const COLOR_FAMILIES = ['Noir', 'Blanc / écru', 'Brun / beige', 'Bleu', 'Rouge', 'Orange', 'Rose / violet', 'Vert / olive', 'Jaune', 'Gris / métallisé', 'Motifs / multicolore', 'Autre'];

const SCHEMA = {
  type: 'object',
  properties: {
    brand: { type: ['string', 'null'] },
    name: { type: ['string', 'null'] },
    price_num: { type: ['number', 'null'] },
    original_price_num: { type: ['number', 'null'] },
    currency: { type: ['string', 'null'] },
    sale: { type: 'boolean' },
    category: { type: ['string', 'null'], enum: [...CATEGORIES, null] },
    subcategory: { type: ['string', 'null'] },
    color: { type: ['string', 'null'] },
    color_family: { type: ['string', 'null'], enum: [...COLOR_FAMILIES, null] },
    store: { type: ['string', 'null'] },
    url: { type: ['string', 'null'] },
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['brand', 'name', 'price_num', 'original_price_num', 'currency', 'sale', 'category', 'subcategory', 'color', 'color_family', 'store', 'url', 'tags'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Tu analyses une capture d'écran ou une photo d'un article (vêtement, chaussure, bijou, accessoire...) trouvé en ligne.
Extrais les informations visibles sur l'image. N'invente jamais une donnée incertaine : mets null plutôt que de deviner.
"sale" = true seulement si un prix barré ou une mention de solde est clairement visible.
"url" : identifie la marque/le magasin et le nom du produit depuis l'image, puis CHERCHE SUR LE WEB la page produit officielle correspondante et mets son URL exacte. Si aucune correspondance fiable n'est trouvée, mets null — ne devine jamais une URL et n'en invente jamais une à partir d'un fragment partiellement visible dans l'image.
"tags" : 2 à 6 mots-clés descriptifs courts en français, seulement si évidents depuis l'image (matière, style, motif...).`;

// Utilise la Responses API (pas Chat Completions) : c'est la seule qui
// expose l'outil hébergé "web_search", nécessaire pour que l'IA cherche
// réellement le lien produit sur le web plutôt que de lire un fragment
// d'URL dans l'image (ce qui donnait des liens tronqués/inutilisables).
export async function analyzeImage(dataUri, apiKey) {
  const res = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      input: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [
          { type: 'input_text', text: 'Analyse cette image et remplis la fiche, en cherchant le lien produit sur le web si tu identifies la marque et le nom du produit.' },
          { type: 'input_image', image_url: dataUri },
        ] },
      ],
      tools: [{ type: 'web_search' }],
      text: { format: { type: 'json_schema', name: 'article_fiche', strict: true, schema: SCHEMA } },
      max_output_tokens: 3500,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const message = (data.output || []).find(o => o.type === 'message');
  const content = message?.content?.find(c => c.type === 'output_text')?.text;
  if (!content) throw new Error('Réponse vide de l\'IA');
  return JSON.parse(content);
}
