// Route /api/estimate-style-cost (POST) : calcule une estimation de coût
// AVANT de lancer une génération plus large que la normale (garde-fou pour
// le "balayage complet"). N'appelle aucune IA — juste un calcul.
import { getUserFromRequest } from './_lib/supabase-admin.mjs';
import { estimateStyleGeneration } from './_lib/cost-estimate.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }
  const { textChars = 0, imageCount = 0, wishlistDetail = 'none' } = req.body || {};
  res.status(200).json(estimateStyleGeneration({ textChars, imageCount, wishlistDetail }));
}
