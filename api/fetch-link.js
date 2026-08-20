// Fonction serveur Vercel (route /api/fetch-link) : reçoit un lien produit,
// renvoie titre + jusqu'à 2 photos. Aucune clé API, aucun secret ici — la
// logique vit dans _lib/link-preview.mjs pour rester testable seule.
import { extractLinkPreview } from './_lib/link-preview.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Méthode non autorisée' }); return; }
  const { url } = req.body || {};
  if (!url || !/^https?:\/\//i.test(url)) { res.status(400).json({ error: 'Lien invalide' }); return; }
  try {
    const preview = await extractLinkPreview(url);
    res.status(200).json(preview);
  } catch (e) {
    console.error('fetch-link error:', e.message);
    res.status(502).json({ error: "Impossible de lire cette page. Essaie une capture d'écran à la place." });
  }
}
