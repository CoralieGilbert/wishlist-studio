// Estimation approximative de tokens/coût avant de lancer un appel IA plus
// gros que la normale (garde-fou demandé pour le "balayage complet").
// Tarifs gpt-4o-mini au 2026-08 : 0.15 $/1M tokens entrée, 0.60 $/1M sortie.
const PRICE_IN_PER_M = 0.15;
const PRICE_OUT_PER_M = 0.60;
const TOKENS_PER_IMAGE = 850; // ordre de grandeur pour une image compressée en detail "auto"
const OUTPUT_TOKENS_STYLE = 950;

const TOKENS_PER_WISHLIST_ITEM = 45; // ~une ligne "nom (marque) — catégorie, couleur, prix [tags]"

function priceUSD(inputTokens, outputTokens) {
  const costUSD = (inputTokens / 1e6) * PRICE_IN_PER_M + (outputTokens / 1e6) * PRICE_OUT_PER_M;
  return Math.round(costUSD * 100000) / 100000;
}

export function estimateStyleGeneration({ textChars = 0, imageCount = 0, useWishlistSummary = false, wishlistItemCount = 0 }) {
  const textTokens = Math.ceil(textChars / 4);
  const imageTokens = imageCount * TOKENS_PER_IMAGE;
  const summaryTokens = useWishlistSummary ? 500 : 0;
  const itemTokens = wishlistItemCount * TOKENS_PER_WISHLIST_ITEM;
  const promptOverhead = 300;
  const inputTokens = textTokens + imageTokens + summaryTokens + itemTokens + promptOverhead;
  const outputTokens = OUTPUT_TOKENS_STYLE;
  return { inputTokens, outputTokens, costUSD: priceUSD(inputTokens, outputTokens) };
}

const OUTPUT_TOKENS_SHOPPING = 1300;
export function estimateShoppingAssistant({ candidateCount = 0 }) {
  const candidateTokens = candidateCount * TOKENS_PER_WISHLIST_ITEM;
  const wardrobeSummaryTokens = 500;
  const wardrobeAndOutfitsTokens = 400;
  const styleTokens = 250;
  const promptOverhead = 300;
  const inputTokens = candidateTokens + wardrobeSummaryTokens + wardrobeAndOutfitsTokens + styleTokens + promptOverhead;
  const outputTokens = OUTPUT_TOKENS_SHOPPING;
  return { inputTokens, outputTokens, costUSD: priceUSD(inputTokens, outputTokens) };
}

const OUTPUT_TOKENS_OUTFIT = 400;
export function estimateOutfitAdvice({ outfitItemCount = 0, wardrobeItemCount = 0, wishlistItemCount = 0 }) {
  const outfitTokens = outfitItemCount * TOKENS_PER_WISHLIST_ITEM;
  const wardrobeTokens = wardrobeItemCount * TOKENS_PER_WISHLIST_ITEM;
  const wishlistTokens = wishlistItemCount * TOKENS_PER_WISHLIST_ITEM;
  const styleTokens = 250;
  const promptOverhead = 300;
  const inputTokens = outfitTokens + wardrobeTokens + wishlistTokens + styleTokens + promptOverhead;
  const outputTokens = OUTPUT_TOKENS_OUTFIT;
  return { inputTokens, outputTokens, costUSD: priceUSD(inputTokens, outputTokens) };
}
