import { getUserFromRequest } from './_lib/supabase-admin.mjs';
import { estimateShoppingAssistant } from './_lib/cost-estimate.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }
  const { candidateCount = 0 } = req.body || {};
  res.status(200).json(estimateShoppingAssistant({ candidateCount }));
}
