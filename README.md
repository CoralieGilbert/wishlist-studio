# Wishlist Studio

Application personnelle pour centraliser wishlist, vestiaire, tenues et
collections. Voir `wishlist_studio_cahier_des_charges_v6.md` (dans le dossier
d'origine) pour le cahier des charges complet.

## Structure du projet

- `index.html`, `styles.css`, `app.js` — l'application elle-même (ce que le
  navigateur charge). C'est la suite du fichier HTML unique d'origine, mais
  séparé en trois fichiers propres.
- `scripts/` — petits scripts Node.js utilisés **une seule fois** pour migrer
  les données de l'ancien fichier HTML vers Supabase. Pas utilisés par
  l'application en ligne.
- `supabase/schema.sql` — la structure de la base de données (tables), à
  exécuter dans le projet Supabase.
- `migration-output/` — dossier généré localement par les scripts de
  migration (données JSON + photos extraites). Non versionné dans Git : ce
  n'est qu'une étape intermédiaire, pas une source de vérité.
- `.env` — clés secrètes locales (jamais commitées, voir `.gitignore`).

## Où sont les données ?

Nulle part dans ce dépôt de code. Une fois la migration faite, toutes les
données (articles, vestiaire, tenues, collections, photos) vivent dans
Supabase (base Postgres + Storage), pas dans le code source. Le code source
ne fait qu'afficher et modifier ces données via `supabase-js`.
