import { getUserFromRequest } from './_lib/supabase-admin.mjs';
import { estimateCartAdvice } from './_lib/cost-estimate.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const user = await getUserFromRequest(req);
  if (!user) { res.status(401).json({ error: 'Non connectée.' }); return; }
  const { itemCount = 0, wardrobeItemCount = 0, wishlistItemCount = 0, queryChars = 0 } = req.body || {};
  res.status(200).json(estimateCartAdvice({ itemCount, wardrobeItemCount, wishlistItemCount, queryChars }));
}
