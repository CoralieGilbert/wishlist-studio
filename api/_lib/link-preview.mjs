// Récupère les infos "aperçu" d'une page produit (comme la carte qui
// apparaît quand tu colles un lien sur WhatsApp/iMessage) : image(s) et
// titre, à partir des balises que la quasi-totalité des boutiques en ligne
// exposent pour les réseaux sociaux. Aucune clé API, aucun coût — juste de
// la lecture de HTML public.

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1_500_000; // évite de lire des pages démesurées

function extractMetaContent(html, propNames) {
  const results = [];
  const metaRegex = /<meta\s+[^>]*>/gi;
  let m;
  while ((m = metaRegex.exec(html))) {
    const tag = m[0];
    const propMatch = /(?:property|name)\s*=\s*["']([^"']+)["']/i.exec(tag);
    const contentMatch = /content\s*=\s*["']([^"']*)["']/i.exec(tag);
    if (propMatch && contentMatch && propNames.includes(propMatch[1].toLowerCase()) && contentMatch[1]) {
      results.push(contentMatch[1]);
    }
  }
  return results;
}

function extractJsonLdImages(html) {
  const scripts = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const s of scripts) {
    try {
      const data = JSON.parse(s[1]);
      const items = Array.isArray(data) ? data : [data];
      for (const item of items) {
        if (item && item.image) return Array.isArray(item.image) ? item.image : [item.image];
      }
    } catch { /* JSON-LD invalide ou absent : on ignore */ }
  }
  return [];
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; WishlistStudioBot/1.0)' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const reader = res.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      chunks.push(value);
      if (total >= MAX_HTML_BYTES) { reader.cancel(); break; }
    }
    return Buffer.concat(chunks.map(c => Buffer.from(c))).toString('utf8');
  } finally {
    clearTimeout(timer);
  }
}

export async function extractLinkPreview(pageUrl) {
  const html = await fetchHtml(pageUrl);
  const ogImages = extractMetaContent(html, ['og:image', 'og:image:secure_url']);
  const twitterImages = extractMetaContent(html, ['twitter:image', 'twitter:image:src']);
  let images = [...ogImages, ...twitterImages];
  if (!images.length) images = extractJsonLdImages(html);
  // Dédoublonne en ignorant http/https (souvent la même image citée deux
  // fois, une fois par balise "sécurisée") et préfère la version https.
  const seen = new Map();
  for (const src of images) {
    let href; try { href = new URL(src, pageUrl).href; } catch { continue; }
    const key = href.replace(/^https?:/i, '');
    if (!seen.has(key) || href.startsWith('https:')) seen.set(key, href);
  }
  images = [...seen.values()].slice(0, 2);

  const title = extractMetaContent(html, ['og:title'])[0]
    || /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim()
    || '';

  return { title, images };
}
