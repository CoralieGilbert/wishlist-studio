// Estimation approximative de tokens/coût avant de lancer un appel IA plus
// gros que la normale (garde-fou demandé pour le "balayage complet").
// Tarifs gpt-4o-mini au 2026-08 : 0.15 $/1M tokens entrée, 0.60 $/1M sortie.
const PRICE_IN_PER_M = 0.15;
const PRICE_OUT_PER_M = 0.60;
const TOKENS_PER_IMAGE = 850; // ordre de grandeur pour une image compressée en detail "auto"
const OUTPUT_TOKENS_STYLE = 400;

export function estimateStyleGeneration({ textChars = 0, imageCount = 0, wishlistDetail = 'none' }) {
  const textTokens = Math.ceil(textChars / 4);
  const imageTokens = imageCount * TOKENS_PER_IMAGE;
  const wishlistTokens = wishlistDetail === 'summary' ? 500 : wishlistDetail === 'full' ? 6000 : 0;
  const promptOverhead = 300;
  const inputTokens = textTokens + imageTokens + wishlistTokens + promptOverhead;
  const outputTokens = OUTPUT_TOKENS_STYLE;
  const costUSD = (inputTokens / 1e6) * PRICE_IN_PER_M + (outputTokens / 1e6) * PRICE_OUT_PER_M;
  return { inputTokens, outputTokens, costUSD: Math.round(costUSD * 10000) / 10000 };
}
