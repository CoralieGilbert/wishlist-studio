// Crée le compte utilisateur unique de l'app (usage ponctuel — étape 4).
// Utilise la service_role key (droits admin), jamais exposée au navigateur.
import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = process.argv[2];
if (!url || !serviceKey || !email) {
  console.error('Usage: node scripts/create-user.mjs <email>');
  process.exit(1);
}

const supabase = createClient(url, serviceKey);
const password = randomBytes(9).toString('base64').replace(/[+/=]/g, c => ({ '+': '9', '/': '8', '=': '7' }[c]));

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
});

if (error) {
  console.error('Erreur:', error.message);
  process.exit(1);
}

console.log('✅ Compte créé.');
console.log('user_id :', data.user.id);
console.log('email   :', email);
console.log('mot de passe (à changer plus tard si tu veux) :', password);
