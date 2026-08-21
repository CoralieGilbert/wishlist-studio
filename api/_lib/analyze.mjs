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
    tags: { type: 'array', items: { type: 'string' } },
  },
  required: ['brand', 'name', 'price_num', 'original_price_num', 'currency', 'sale', 'category', 'subcategory', 'color', 'color_family', 'store', 'tags'],
  additionalProperties: false,
};

const SYSTEM_PROMPT = `Tu analyses une capture d'écran ou une photo d'un article (vêtement, chaussure, bijou, accessoire...) trouvé en ligne.
Extrais uniquement les informations clairement visibles sur l'image. N'invente jamais une donnée incertaine : mets null plutôt que de deviner.
"sale" = true seulement si un prix barré ou une mention de solde est clairement visible.
"tags" : 2 à 6 mots-clés descriptifs courts en français, seulement si évidents depuis l'image (matière, style, motif...).`;

export async function analyzeImage(dataUri, apiKey) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: 'gpt-5-mini',
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: [
          { type: 'text', text: 'Analyse cette image et remplis la fiche.' },
          { type: 'image_url', image_url: { url: dataUri } },
        ] },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'article_fiche', strict: true, schema: SCHEMA } },
      max_completion_tokens: 800,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    const err = new Error(`OpenAI ${res.status}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Réponse vide de l\'IA');
  return JSON.parse(content);
}
