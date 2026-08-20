// Script de migration ponctuel : lit l'ancien fichier HTML monolithique et en
// extrait trois choses séparées : le CSS, la logique JS (app.js), et les
// données (JSON propre + photos décodées en vrais fichiers image).
//
// Usage : node scripts/extract-monolith.mjs <chemin-vers-le-fichier-html>
//
// Ne modifie jamais le fichier source. Écrit uniquement dans :
//   - index.html, styles.css, app.js (à la racine du projet)
//   - migration-output/data/*.json
//   - migration-output/images/**/*
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const srcPath = process.argv[2];
if (!srcPath) {
  console.error('Usage: node scripts/extract-monolith.mjs <chemin-vers-le-fichier-html>');
  process.exit(1);
}

const html = readFileSync(srcPath, 'utf8');

// --- 1. Extraire le CSS -----------------------------------------------
const styleStart = html.indexOf('<style>') + '<style>'.length;
const styleEnd = html.indexOf('</style>', styleStart);
if (styleStart < 0 || styleEnd < 0) throw new Error('Bloc <style> introuvable.');
const css = html.slice(styleStart, styleEnd).trim();

// --- 2. Extraire le bloc <script> --------------------------------------
const scriptStart = html.indexOf('<script>') + '<script>'.length;
const scriptEnd = html.indexOf('</script>', scriptStart);
if (scriptStart < 0 || scriptEnd < 0) throw new Error('Bloc <script> introuvable.');
const scriptText = html.slice(scriptStart, scriptEnd);

// --- 3. Repérer chaque `const NOM=...;` de données, au niveau racine ---
// On avance caractère par caractère en suivant la profondeur des
// {}/[]/() et l'état "dans une chaîne ou pas", pour trouver le `;` qui
// termine vraiment l'instruction (et pas un `;` caché dans un texte).
function findStatementEnd(text, fromIndex) {
  let depth = 0;
  let inString = null; // ' " ou `
  let escaped = false;
  for (let i = fromIndex; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escaped) { escaped = false; }
      else if (c === '\\') { escaped = true; }
      else if (c === inString) { inString = null; }
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inString = c; continue; }
    if (c === '{' || c === '[' || c === '(') { depth++; continue; }
    if (c === '}' || c === ']' || c === ')') { depth--; continue; }
    if (c === ';' && depth === 0) return i; // fin de l'instruction
  }
  throw new Error('Fin d\'instruction introuvable (structure inattendue).');
}

const DATA_CONST_NAMES = [
  'BASE_ITEMS',
  'WARDROBE_PHOTOS_20260819',
  'WARDROBE_PHOTOS_20260819_LOOK2',
  'SEED_WARDROBE_ITEMS',
  'SEED_WARDROBE_OUTFITS',
  'SEED_COLLECTIONS',
];

const statements = [];
for (const name of DATA_CONST_NAMES) {
  const marker = `const ${name}=`;
  const start = scriptText.indexOf(marker);
  if (start === -1) {
    console.warn(`⚠️  Constante "${name}" introuvable dans le script — ignorée.`);
    continue;
  }
  const end = findStatementEnd(scriptText, start + marker.length);
  statements.push({ name, code: scriptText.slice(start, end + 1) });
}

// --- 4. Exécuter uniquement ces déclarations de données dans un bac à
//        sable isolé (pas de `document`, pas de `localStorage`), pour
//        obtenir de vraies valeurs JS (et résoudre les références du
//        style `image:WARDROBE_PHOTOS_20260819.outfit_front`). ---------
const sandbox = {};
vm.createContext(sandbox);
const collectCode = statements.map(s => s.code).join('\n') +
  `\nglobalThis.__RESULT__ = { ${DATA_CONST_NAMES.filter(n => statements.some(s => s.name === n)).join(', ')} };`;
vm.runInContext(collectCode, sandbox);
const result = sandbox.__RESULT__;

// --- 5. Retirer ces mêmes instructions du script pour obtenir app.js ---
let appJs = scriptText;
// On retire en partant de la fin pour ne pas décaler les index des autres.
for (const s of [...statements].reverse()) {
  appJs = appJs.slice(0, appJs.indexOf(s.code)) + appJs.slice(appJs.indexOf(s.code) + s.code.length);
}
appJs = appJs.replace(/\n{3,}/g, '\n\n').trim() + '\n';

// --- 6. Extraire les images base64 (data:image/...) de chaque dataset --
const IMAGE_ROOT = join(ROOT, 'migration-output', 'images');
let imageCount = 0;
let imageBytes = 0;

function extForMime(mime) {
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('png')) return 'png';
  if (mime.includes('jpeg') || mime.includes('jpg')) return 'jpg';
  if (mime.includes('gif')) return 'gif';
  return 'bin';
}

function saveImage(dataUri, folder, baseName) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(dataUri);
  if (!match) return null; // pas une image encodée -> on laisse tel quel
  const [, mime, b64] = match;
  const ext = extForMime(mime);
  const fileName = `${baseName}.${ext}`;
  const dir = join(IMAGE_ROOT, folder);
  mkdirSync(dir, { recursive: true });
  const buffer = Buffer.from(b64, 'base64');
  writeFileSync(join(dir, fileName), buffer);
  imageCount++;
  imageBytes += buffer.length;
  return `images/${folder}/${fileName}`;
}

// Remplace, pour chaque champ d'un enregistrement, toute valeur qui est une
// image encodée (ou un tableau de telles valeurs) par un chemin de fichier
// relatif. Générique : fonctionne quel que soit le nom du champ.
function extractRecordImages(record, folder, baseName) {
  let counter = 0;
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (typeof value === 'string' && value.startsWith('data:image/')) {
      counter++;
      const suffix = counter > 1 ? `-${counter}` : '';
      const path = saveImage(value, folder, `${baseName}${suffix}`);
      if (path) record[key] = path;
    } else if (Array.isArray(value)) {
      record[key] = value.map((v, i) => {
        if (typeof v === 'string' && v.startsWith('data:image/')) {
          const path = saveImage(v, folder, `${baseName}-${key}-${i + 1}`);
          return path || v;
        }
        return v;
      });
    }
  }
}

const articles = (result.BASE_ITEMS || []).map(item => structuredCloneLike(item));
const wardrobeItems = (result.SEED_WARDROBE_ITEMS || []).map(structuredCloneLike);
const outfits = (result.SEED_WARDROBE_OUTFITS || []).map(structuredCloneLike);
const collections = (result.SEED_COLLECTIONS || []).map(structuredCloneLike);

function structuredCloneLike(x) { return JSON.parse(JSON.stringify(x)); }

for (const a of articles) extractRecordImages(a, 'articles', String(a.uid || a.id));
for (const w of wardrobeItems) extractRecordImages(w, 'wardrobe', String(w.uid || w.id));
for (const o of outfits) extractRecordImages(o, 'outfits', String(o.uid || o.id));
for (const c of collections) extractRecordImages(c, 'collections', String(c.id || c.uid || c.name));

// --- 7. Écrire les fichiers de sortie -----------------------------------
mkdirSync(join(ROOT, 'migration-output', 'data'), { recursive: true });
writeFileSync(join(ROOT, 'migration-output', 'data', 'articles.json'), JSON.stringify(articles, null, 2));
writeFileSync(join(ROOT, 'migration-output', 'data', 'wardrobe_items.json'), JSON.stringify(wardrobeItems, null, 2));
writeFileSync(join(ROOT, 'migration-output', 'data', 'outfits.json'), JSON.stringify(outfits, null, 2));
writeFileSync(join(ROOT, 'migration-output', 'data', 'collections.json'), JSON.stringify(collections, null, 2));

writeFileSync(join(ROOT, 'styles.css'), css + '\n');
writeFileSync(join(ROOT, 'app.js'), appJs);

const newHtml = html.slice(0, html.indexOf('<style>'))
  + '<link rel="stylesheet" href="styles.css">'
  + html.slice(html.indexOf('</style>') + '</style>'.length, html.indexOf('<script>'))
  + '<script src="app.js" defer></script>'
  + html.slice(html.indexOf('</script>') + '</script>'.length);
writeFileSync(join(ROOT, 'index.html'), newHtml);

// --- 8. Résumé lisible ---------------------------------------------------
console.log('--- Extraction terminée ---');
console.log(`Articles (wishlist)   : ${articles.length}`);
console.log(`Pièces de vestiaire   : ${wardrobeItems.length}`);
console.log(`Tenues                : ${outfits.length}`);
console.log(`Collections           : ${collections.length}`);
console.log(`Images extraites      : ${imageCount} (${(imageBytes / 1024 / 1024).toFixed(1)} Mo)`);
console.log('Fichiers écrits : index.html, styles.css, app.js, migration-output/data/*.json, migration-output/images/**');
console.log('\n⚠️  app.js contient encore des appels à localStorage et à des fonctions qui référençaient BASE_ITEMS/SEED_* : normal, on les reconnectera à Supabase à l\'étape 5.');
