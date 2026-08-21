# Wishlist Studio — recap technique et fonctionnel

> Écrit le 2026-08-21 pour éviter de re-explorer tout le repo à chaque
> nouvelle session. Si ce fichier contredit le code, c'est le code qui a
> raison — mets ce recap à jour plutôt que de le laisser dériver.

## 0. Où est quoi

- **App en ligne (réelle, à jour) :** https://wishlist-studio-sable.vercel.app/
  Connectée avec ceanecoane@gmail.com. Auto-déployée depuis GitHub → Vercel.
- **Code source :** `C:\Users\ceane\Projects\wishlist-studio` — repo git,
  remote `https://github.com/CoralieGilbert/wishlist-studio.git`, branche
  `main`. **C'est ici qu'il faut travailler.**
- **Archive (ne pas modifier) :** `C:\Users\ceane\OneDrive\Documents\Wishlist Studio`
  contient l'ancien fichier HTML monolithique (v5.2, localStorage,
  photos en base64 inline) + un export JSON + `wishlist_studio_cahier_des_charges_v6.md`
  (le cahier des charges d'origine — **obsolète sur l'archi** : décrit une
  migration qui est maintenant terminée, mais reste utile pour l'intention
  fonctionnelle/UX d'origine).
- **Données réelles :** nulle part dans le code. Tout vit dans Supabase
  (Postgres + Storage + Auth), projet `tnkjerfcfzhtfaiwoqql`.

## 1. Stack

- **Front-end :** HTML/CSS/JS vanilla, zéro framework, zéro build step.
  `index.html` + `styles.css` + `app.js` (~620 lignes denses, un peu comme
  du React sans JSX : re-render complet de `#view` en `innerHTML` à chaque
  navigation via `render()`/`go(page, filter)`).
- **Data layer :** `db.js` (module ES, chargé en `<script type="module">`).
  C'est la SEULE chose qui importe `@supabase/supabase-js` et parle à
  Supabase. `app.js` n'appelle jamais supabase-js directement — seulement
  `window.Auth` et `window.DB`. Objectif explicite (commentaire en tête du
  fichier) : garder la possibilité de changer de backend plus tard sans
  toucher à `app.js`.
- **Backend :** Supabase (Postgres + Row Level Security + Storage bucket
  `wishlist-photos` + Auth email/mot de passe).
- **Fonctions serveur (IA) :** `api/*.js`, déployées comme Vercel Serverless
  Functions. Utilisent la clé `service_role` de Supabase (jamais exposée au
  navigateur) pour vérifier le jeton d'auth de l'appelant et lire ses
  réglages privés.
- **IA :** OpenAI `gpt-5-mini`, appelée uniquement côté serveur, avec la
  clé API **personnelle** de chaque utilisateur (bring-your-own-key, stockée
  dans `user_settings.openai_api_key`, jamais codée en dur, jamais vue par
  le front). Toutes les réponses IA structurées utilisent
  `response_format: json_schema` en mode `strict` (pas de parsing fragile).
- **Hébergement :** Vercel (gratuit), déploiement auto sur push vers `main`.
- **Polices :** Fraunces (titres, `--serif`) + Inter (corps, `--sans`), via
  Google Fonts. Thème sombre, accent rouge/cramoisi (`--dark:#c8283d`).

## 2. Structure du repo

```
index.html          coquille HTML : nav, tous les <div class="modalback"> (modals), gate d'auth
styles.css           tout le CSS (thème sombre, variables --paper/--ink/--dark/--accent...)
app.js                logique appli : routing, rendu de chaque page, formulaires, IA (appels via DB.*)
db.js                 (type="module") auth Supabase + sync état ↔ 7 tables + upload photos + appels /api/*
api/
  analyze-image.js        POST — photo → fiche article structurée (IA)
  fetch-link.js            POST — URL produit → titre + 1-2 photos (og:image/JSON-LD, PAS d'IA, gratuit)
  generate-style.js        POST — génère/améliore le texte "Mon Style" (texte + wishlist + Pinterest)
  estimate-style-cost.js   POST — estimation $ avant generate-style (server-side, miroir du calcul client)
  shopping-assistant.js    POST — "Personal Shopper" : compose un panier réel sous budget
  estimate-shopping-cost.js
  outfit-advice.js         POST — conseils IA sur une tenue existante (grounded style + Pinterest)
  estimate-outfit-cost.js
  cart-advice.js           POST — avis IA sur une sélection libre du panier (tenues possibles + ajouts/retraits)
  estimate-cart-advice-cost.js
  _lib/
    supabase-admin.mjs      client Supabase service_role + vérif du jeton Authorization
    analyze.mjs              prompt + schema JSON pour analyze-image
    link-preview.mjs         parsing HTML (og:image, twitter:image, JSON-LD) sans IA
    wishlist-summary.mjs     construit des résumés COMPACTS (jamais les fiches complètes) pour limiter les tokens
    cost-estimate.mjs        formules d'estimation de coût (tarifs gpt-5-mini codés en dur, à date)
supabase/schema.sql    schéma complet + RLS + policies storage (source de vérité du schéma DB)
scripts/                scripts Node ponctuels (migration monolithe → Supabase). Pas utilisés à l'exécution.
migration-output/       généré localement par les scripts, gitignored, étape intermédiaire jetable
.env / .env.example     secrets Supabase locaux (jamais commités)
```

## 3. Modèle de données (Supabase Postgres)

Toutes les tables ont `user_id uuid` + RLS (`auth.uid() = user_id`) — prêt
pour plusieurs comptes même si un seul est utilisé aujourd'hui.

- **`articles`** — la wishlist. Clé primaire `uid` (text). Prix affiché
  (`price`, texte libre type "$275.00") + `price_num` (numeric, pour
  tri/filtre) séparés. Champs de statut/score : `status`, `purchase_type`,
  `priority`, `desire_score`, `utility_score`. Flags `in_cart`,
  `is_favorite`, `is_trashed`, `purchased`.
- **`wardrobe_items`** — pièces déjà possédées. Même forme que `articles`
  + `size`, `owned`, `ownership_origin`, `wardrobe_active`,
  `wardrobe_status` (À trier / Garder / Peut-être / Donner-vendre /
  Réparer-retoucher).
- **`outfits`** + **`outfit_items`** (relation N-N vers `wardrobe_items`,
  avec `position` pour l'ordre).
- **`collections`** + **`collection_items`** (relation N-N vers
  `articles`, avec `position`).
- **`photos`** — table commune aux 4 types de propriétaire
  (`owner_type`: `article` / `wardrobe_item` / `outfit` / `style_profile`,
  `owner_uid` + `position`). Une seule table plutôt que 4 quasi-identiques.
- **`user_settings`** — `openai_api_key` (BYOK) + `style_text` (profil
  "Mon Style" texte).
- **`shopping_generations`** — historique des paniers générés par le
  Personal Shopper. `result` (jsonb) contient la réponse complète de l'IA
  (picks/note/totaux) telle que reçue ; `query`/`budget`/`currency`
  dupliqués en colonnes pour un affichage rapide dans le carrousel
  d'historique sans avoir à reparser le jsonb.
- **`outfit_advice_generations`** — historique des Conseils IA, scopé par
  tenue (`outfit_uid`). `result` (jsonb) = `{advice, additions, removals}`.
- **`cart_advice_generations`** — historique des Avis IA sur une sélection
  libre du panier (pas scopé à un objet précis, juste `item_uids`).
  `result` (jsonb) = `{advice, outfit_ideas, additions, removals}`.
- **Storage** — bucket `wishlist-photos` ; upload/delete réservés aux
  utilisateurs authentifiés, lecture publique (URLs non répertoriées).

`db.js::loadState()` reconstruit un objet `state` unique à partir des 7
tables (même forme que l'ancien état localStorage, pour minimiser les
changements dans `app.js`). `persistState()` fait une **sync par diff** :
compare l'état courant au dernier état synchronisé (`lastSynced`) et ne
pousse que ce qui a changé (upsert/delete ciblés par table), plutôt que de
tout ré-écrire à chaque sauvegarde.

## 4. Pages / navigation

Menu principal (4 items) + sous-menu contextuel sous "Wishlist" :

- **Accueil** (`home`) — pièce vedette (dernier ajout), 3 KPI (articles
  actifs / pièces vestiaire / collections), derniers ajouts, collections,
  explorateur par catégorie/magasin.
- **Wishlist**
  - **Catalogue** (`catalog`) — grille type Pinterest (colonnes en
    masonry), recherche, filtres (marque/magasin/sous-catégorie/statut/
    type d'achat/prix/devise/couleur), tris, favoris, panneau de filtres
    repliable.
  - **Personal Shopper** (`shopping`) — assistant IA (§5).
  - **Achats** (`purchases`) — historique des achats + totaux par devise.
- **Vestiaire** (`wardrobe`) — pièces possédées + tenues, statistiques
  (pièces / à trier / tenues), filtres par décision vestiaire. Chaque
  tenue a sa propre page (`outfit`, route dédiée — pas une modal), avec
  bouton "Conseils IA" (§5) ; l'icône ✦ sur une carte de tenue ouvre les
  Conseils IA en raccourci direct sans passer par la page.
- **Collections** (`collections`) — boards thématiques (+ "Favoris" en
  collection virtuelle toujours présente).
- **Panier** (`cart`, accessible via icône) — sélection multiple (cases à
  cocher) → achat groupé ou **Avis IA** (§5) ; filtres marque/magasin/
  type + tri (ordre d'ajout panier/wishlist, prix) + regroupement
  (magasin/catégorie/marque) ; survol d'une miniature = aperçu agrandi au
  centre de l'écran ; lien direct vers Personal Shopper.
- **Corbeille** (`trash`, icône) — restauration ou suppression définitive.
- **Mon Style** (icône palette) — page dédiée, profil de style (§5).
- Modals transverses : fiche article (édition — icône corbeille en haut à
  droite pour supprimer directement, capture photo depuis mobile),
  Conseils IA / Avis IA panier, galerie photo (carrousel), sélecteur de
  collection, "Données & sauvegarde" (export JSON + clé API +
  déconnexion).

## 5. Fonctionnalités IA (toutes en `gpt-5-mini`, BYOK, coût affiché avant appel)

- **Analyse d'image → fiche préremplie** (`analyze-image`) : depuis le
  Quick Add, bouton "Analyser avec l'IA" sur une image collée/déposée.
  Renvoie marque/nom/prix/devise/solde/catégorie/couleur/tags/url en JSON
  strict ; ne devine jamais un champ incertain (consigne explicite dans le
  prompt : `null` plutôt qu'une valeur inventée). Seul endpoint IA à
  utiliser la **Responses API** (`/v1/responses`, pas Chat Completions) :
  c'est la seule qui expose l'outil hébergé `web_search`, nécessaire pour
  que l'IA identifie la marque/le nom puis cherche réellement le lien
  produit sur le web (lire un fragment d'URL dans l'image ne donnait que
  des liens tronqués/inutilisables). Coût réel mesuré : ~0,006-0,04 $ par
  analyse selon le nombre de requêtes de recherche effectuées (tarif
  `web_search` : 10 $/1000 appels pour un modèle de raisonnement comme
  gpt-5-mini, tokens de recherche facturés en plus au tarif normal du
  modèle).
- **Ajout par lien** (`fetch-link`) : PAS de l'IA — parse le HTML public de
  la page produit (og:image, twitter:image, JSON-LD) pour récupérer titre +
  jusqu'à 2 photos. Gratuit, pas de clé API requise.
- **Mon Style** (`generate-style`) : génère/améliore un texte de style
  personnel à partir d'une combinaison choisie par l'utilisatrice : texte
  existant, résumé statistique de la wishlist, détail de N pièces
  récentes, et/ou jusqu'à 20 captures Pinterest. Curseurs client pour
  doser le contexte envoyé (donc le coût) ; estimation affichée avant
  envoi, avec confirmation obligatoire au-delà de ~0.003 $.
- **Personal Shopper** (`shopping-assistant`) : compose un panier qui
  respecte un budget, en piochant **uniquement** parmi les vraies pièces
  de la wishlist (uid réels transmis en candidats — jamais de produit
  inventé). Les totaux par devise sont recalculés côté serveur après coup
  (jamais fait confiance au calcul de l'IA, qui peut additionner des
  devises différentes par erreur). Chaque génération réussie est
  sauvegardée dans `shopping_generations` (table dédiée, pas d'appel
  serveur — écriture directe via `db.js`/RLS) et réapparaît dans un
  carrousel d'historique sous le formulaire, avec vue détail (modal
  `galleryModal` réutilisée) et suppression individuelle.
- **Conseils de tenue** (`outfit-advice`, page dédiée `outfit` + modal
  `outfitAdviceModal`) : avis + suggestions d'ajout (vestiaire/wishlist,
  boutons d'action directe) et de retrait ancrées dans de vrais uid,
  explicitement ancré sur le texte de style et les images Pinterest de
  l'utilisatrice (pas de règles de mode génériques) ; formulaire avec
  source (vestiaire/wishlist/les deux), occasion, budget. Historique
  scopé à la tenue (`outfit_advice_generations`), carrousel + détail.
- **Avis IA panier** (`cart-advice`) : à partir d'une sélection libre de
  pièces du panier (cases à cocher déjà utilisées pour l'achat groupé),
  avis de cohérence avec le style + jusqu'à 4 idées de tenues réalisables
  (sélection + vestiaire, bouton "Créer cette tenue") + suggestions
  d'ajout wishlist / de retrait du panier (doublon vestiaire ou hors
  style). Mêmes garde-fous que les autres endpoints (uid réels
  uniquement, revalidés côté serveur). Historique **global** (pas scopé à
  une sélection précise, pattern Personal Shopper) dans
  `cart_advice_generations`.

Pattern commun à toutes : vérif du jeton Supabase → lecture de la clé
OpenAI perso → construction d'un contexte **minimal** (résumés comptés,
jamais les fiches complètes, cf. `wishlist-summary.mjs`) → appel OpenAI
avec schema JSON strict quand la réponse doit être structurée → erreurs
401/429 traduites en messages clairs ("clé invalide", "quota atteint").

## 6. Ce qui manque encore (vs. cahier des charges v6, Phase 4)

Déjà fait et au-delà du cahier des charges d'origine : BYOK IA, Personal
Shopper budget-aware, profil de style, conseils de tenue groundés
Pinterest, ajout par lien, avis IA panier, réimport d'un backup JSON
(`importDataFile()` dans `app.js` — restauration complète via le même
mécanisme de sync par diff que `persist()`, pas une fusion), PWA
installable (`manifest.json` + `sw.js` — service worker minimal, sert
juste l'installabilité/le shell statique, pas d'ambition hors-ligne réelle
puisque l'app dépend entièrement de Supabase/OpenAI).

Pas encore fait, à checker si besoin :
- Détection automatique de doublons wishlist/vestiaire.
- Suggestion automatique de tags/catégorie cohérents avec le reste de la
  base (au-delà de ce que `analyze-image` propose déjà par photo).

## 7. Notes utiles pour bosser dessus

- Pas de build : toute modif de `app.js`/`styles.css`/`index.html` est
  visible directement, Vercel redéploie sur push vers `main`.
- **Cache-busting** : `index.html` charge `db.js?v=N`/`app.js?v=N`.
  Incrémenter `N` à CHAQUE modif de ces deux fichiers avant de pousser,
  sinon des navigateurs (surtout mobile, onglet resté ouvert) peuvent
  continuer à servir l'ancien JS après un déploiement — vécu plusieurs
  fois pendant les sessions de dev (hard-reload/`cache:'no-store'`
  nécessaire pour voir le nouveau code sans ce paramètre).
- `app.js` et `styles.css` ont des lignes très longues (CSS minifié à la
  main, JS avec du template-string HTML inline) — normal, pas un bug de
  formatage.
- `state` est un objet global unique reconstruit au chargement
  (`Auth.onReady` → `DB.loadState()`) puis muté directement par les
  handlers, avec `persist()` (async, débounce implicite via diff) appelé
  après chaque mutation.
- Toujours régénérer/vérifier `supabase/schema.sql` si une nouvelle
  colonne est ajoutée côté `app.js`/`db.js` — les listes `ARTICLE_COLUMNS`
  / `WARDROBE_COLUMNS` / `OUTFIT_COLUMNS` / `COLLECTION_COLUMNS` dans
  `db.js` doivent rester synchronisées avec les colonnes réelles, sinon
  `pick()` les ignore silencieusement à la sauvegarde.
