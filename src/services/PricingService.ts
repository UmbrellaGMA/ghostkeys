import type { PricingStrategy, Product } from "@/types";

/**
 * Regras de precificação (funções puras, testáveis).
 *
 * Três possibilidades:
 *  1. Margem percentual global  -> custo × (1 + margem%)
 *  2. Acréscimo fixo em reais    -> custo + acréscimo
 *  3. Preço personalizado        -> produto.pricing_mode = 'custom'
 * Também é possível combinar 1 + 2 ("percent_plus_fixed").
 */

export interface GlobalPricingConfig {
  pricing_strategy: PricingStrategy;
  margin_percent: number;
  fixed_markup_cents: number;
  min_price_cents: number;
  round_to_90: boolean;
  /** Usado pela estratégia "flat" (preço padrão igual para todos os jogos). */
  default_sale_price_cents?: number;
}

export function calculateSalePrice(costCents: number, cfg: GlobalPricingConfig): number {
  if (!Number.isFinite(costCents) || costCents < 0) throw new Error("Custo inválido");
  const margin = Number(cfg.margin_percent) || 0;
  let price: number;
  switch (cfg.pricing_strategy) {
    case "flat":
      price = cfg.default_sale_price_cents ?? 2990;
      break;
    case "fixed":
      price = costCents + cfg.fixed_markup_cents;
      break;
    case "percent_plus_fixed":
      price = costCents * (1 + margin / 100) + cfg.fixed_markup_cents;
      break;
    case "percent":
    default:
      price = costCents * (1 + margin / 100);
  }
  // Arredonda para cima ao centavo: nunca vender abaixo da margem configurada
  price = Math.ceil(Math.round(price * 1000) / 1000);
  if (cfg.round_to_90) {
    // Próximo valor terminado em ,90 (>= preço calculado)
    const reais = Math.floor(price / 100);
    let candidate = reais * 100 + 90;
    if (candidate < price) candidate += 100;
    price = candidate;
  }
  return Math.max(price, cfg.min_price_cents);
}

/** Preço de venda do produto conforme o modo (global ou personalizado). */
export function resolveProductSalePrice(
  product: Pick<Product, "pricing_mode" | "custom_price_cents" | "supplier_cost_cents">,
  cfg: GlobalPricingConfig,
): number | null {
  if (product.pricing_mode === "custom" && product.custom_price_cents) return product.custom_price_cents;
  if (product.supplier_cost_cents === null || product.supplier_cost_cents === undefined) return null;
  return calculateSalePrice(product.supplier_cost_cents, cfg);
}

/** Preço efetivo (promoção vigente, se houver). */
export function effectivePrice(
  product: Pick<Product, "sale_price_cents" | "promo_price_cents" | "promo_ends_at">,
  now: Date = new Date(),
): number {
  if (
    product.promo_price_cents &&
    product.promo_price_cents < product.sale_price_cents &&
    (!product.promo_ends_at || new Date(product.promo_ends_at) > now)
  ) {
    return product.promo_price_cents;
  }
  return product.sale_price_cents;
}

/** Preço "de" exibido riscado: original definido pelo admin, ou o preço cheio quando há promoção. */
export function listPrice(
  product: Pick<Product, "sale_price_cents" | "promo_price_cents" | "promo_ends_at" | "original_price_cents">,
  now: Date = new Date(),
): number | null {
  const eff = effectivePrice(product, now);
  const candidates = [product.original_price_cents, product.sale_price_cents].filter(
    (v): v is number => typeof v === "number" && v > eff,
  );
  return candidates.length ? Math.max(...candidates) : null;
}

export function isOnSale(product: Pick<Product, "sale_price_cents" | "promo_price_cents" | "promo_ends_at" | "original_price_cents">) {
  return listPrice(product) !== null;
}

export interface CouponLike {
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_order_cents: number;
}

export function couponDiscount(subtotalCents: number, coupon: CouponLike): number {
  if (subtotalCents < coupon.min_order_cents) return 0;
  const raw =
    coupon.discount_type === "percent" ? Math.floor((subtotalCents * coupon.discount_value) / 100) : coupon.discount_value;
  // O total precisa permanecer >= R$ 1,00 (exigência mínima de pagamento)
  return Math.max(0, Math.min(raw, subtotalCents - 100));
}

export interface ComboConfig {
  combo_enabled: boolean;
  combo_size: number; // ex.: 3
  combo_free: number; // ex.: 1  → "Leve 3, pague 2"
}

/**
 * Promoção por quantidade ("Leve 3, pague 2").
 * Todas as unidades do carrinho são ordenadas do maior para o menor preço e agrupadas de `size` em `size`;
 * em cada grupo completo, as `free` unidades mais baratas saem de graça. Unidades de grupos incompletos pagam normalmente.
 */
export function comboDiscount(lines: Array<{ unit_price_cents: number; quantity: number }>, cfg: ComboConfig): number {
  if (!cfg.combo_enabled || cfg.combo_size < 2 || cfg.combo_free < 1 || cfg.combo_free >= cfg.combo_size) return 0;
  const units = lines.flatMap((l) => Array.from({ length: l.quantity }, () => l.unit_price_cents)).sort((a, b) => b - a);
  const groups = Math.floor(units.length / cfg.combo_size);
  let discount = 0;
  for (let g = 0; g < groups; g++) {
    const group = units.slice(g * cfg.combo_size, (g + 1) * cfg.combo_size);
    discount += group.slice(cfg.combo_size - cfg.combo_free).reduce((s, v) => s + v, 0);
  }
  return discount;
}

/** Quantos jogos faltam para completar o próximo combo (0 = combo completo ou desativado). */
export function comboMissing(totalUnits: number, cfg: ComboConfig): number {
  if (!cfg.combo_enabled || totalUnits === 0) return 0;
  const rest = totalUnits % cfg.combo_size;
  return rest === 0 ? 0 : cfg.combo_size - rest;
}

/** Lucro de um item vendido (usa custo e preço CONGELADOS no pedido). */
export function itemProfit(item: { unit_price_cents: number; supplier_cost_cents: number; quantity: number }): number {
  return (item.unit_price_cents - item.supplier_cost_cents) * item.quantity;
}
