// Client Supabase côté serveur (clé service_role — jamais envoyée au
// navigateur). Sert à vérifier qui appelle une fonction, et à lire ses
// réglages privés (ex. sa clé API IA) en contournant les RLS en toute
// confiance, puisque c'est du code qui tourne chez Vercel, pas chez l'utilisateur.
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tnkjerfcfzhtfaiwoqql.supabase.co';

export const supabaseAdmin = createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Vérifie le jeton envoyé par le navigateur (Authorization: Bearer ...) et
// renvoie l'utilisateur correspondant, ou null si le jeton est invalide.
export async function getUserFromRequest(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error) return null;
  return data.user;
}
