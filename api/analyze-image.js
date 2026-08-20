// Route /api/analyze-image (POST). Reçoit une image, identifie qui appelle
// (via son jeton Supabase), utilise SA propre clé OpenAI enregistrée, et
// renvoie une fiche article structurée. Chaque personne paie/utilise sa
// propre clé — rien n'est mutualisé ni codé en dur ici.
import { getUserFromRequest, supabaseAdmin } from './_lib/supabase-admin.mjs';
import { analyzeImage } from './_lib/analyze.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }

  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }

  const { image } = req.body || {};
  if (!image || !image.startsWith('data:image/')) { res.status(400).json({ error: 'Image manquante ou invalide' }); return; }

  const { data: settings } = await supabaseAdmin.from('user_settings').select('openai_api_key').eq('user_id', user.id).single();
  const apiKey = settings?.openai_api_key;
  if (!apiKey) { res.status(400).json({ error: 'Aucune clé API enregistrée. Ajoute ta clé OpenAI dans Données & réglages.' }); return; }

  try {
    const fiche = await analyzeImage(image, apiKey);
    res.status(200).json(fiche);
  } catch (e) {
    console.error('analyze-image error:', e.message);
    const clientMsg = e.status === 401 ? 'Clé API invalide ou expirée.' : e.status === 429 ? 'Limite ou quota OpenAI atteint.' : "Erreur lors de l'analyse. Réessaie.";
    res.status(502).json({ error: clientMsg });
  }
}
