import { describe, expect, it } from "vitest";
import { calculateSalePrice, couponDiscount, effectivePrice, itemProfit, listPrice, resolveProductSalePrice, type GlobalPricingConfig } from "@/services/PricingService";

const cfg = (o: Partial<GlobalPricingConfig> = {}): GlobalPricingConfig => ({
  pricing_strategy: "percent",
  margin_percent: 30,
  fixed_markup_cents: 0,
  min_price_cents: 100,
  round_to_90: false,
  ...o,
});

describe("Cálculo de preços", () => {
  it("aplica a margem percentual global (exemplo do enunciado: R$ 20,00 + 30% = R$ 26,00)", () => {
    expect(calculateSalePrice(2000, cfg())).toBe(2600);
  });

  it("aplica acréscimo fixo em reais", () => {
    expect(calculateSalePrice(2000, cfg({ pricing_strategy: "fixed", fixed_markup_cents: 500 }))).toBe(2500);
  });

  it("combina percentual + acréscimo fixo", () => {
    expect(calculateSalePrice(2000, cfg({ pricing_strategy: "percent_plus_fixed", fixed_markup_cents: 100 }))).toBe(2700);
  });

  it("arredonda para cima ao centavo (nunca abaixo da margem)", () => {
    expect(calculateSalePrice(333, cfg({ margin_percent: 10 }))).toBe(367); // 366,3 → 367
  });

  it("evita erros de ponto flutuante", () => {
    expect(calculateSalePrice(1000, cfg({ margin_percent: 15 }))).toBe(1150);
  });

  it("respeita o preço mínimo", () => {
    expect(calculateSalePrice(10, cfg({ min_price_cents: 199 }))).toBe(199);
  });

  it("arredonda para ,90 quando configurado", () => {
    expect(calculateSalePrice(2000, cfg({ round_to_90: true }))).toBe(2690);
    expect(calculateSalePrice(2070, cfg({ margin_percent: 0, round_to_90: true }))).toBe(2090);
    expect(calculateSalePrice(2095, cfg({ margin_percent: 0, round_to_90: true }))).toBe(2190);
  });

  it("usa preço personalizado por produto", () => {
    expect(resolveProductSalePrice({ pricing_mode: "custom", custom_price_cents: 4990, supplier_cost_cents: 2000 }, cfg())).toBe(4990);
    expect(resolveProductSalePrice({ pricing_mode: "global", custom_price_cents: null, supplier_cost_cents: 2000 }, cfg())).toBe(2600);
    expect(resolveProductSalePrice({ pricing_mode: "global", custom_price_cents: null, supplier_cost_cents: null }, cfg())).toBeNull();
  });

  it("rejeita custo inválido", () => {
    expect(() => calculateSalePrice(-1, cfg())).toThrow();
  });
});

describe("Promoções", () => {
  const base = { sale_price_cents: 2600, promo_price_cents: 1990, promo_ends_at: null as string | null, original_price_cents: null as number | null };

  it("usa o preço promocional vigente", () => {
    expect(effectivePrice(base)).toBe(1990);
    expect(listPrice(base)).toBe(2600);
  });

  it("ignora promoção expirada", () => {
    const expired = { ...base, promo_ends_at: new Date(Date.now() - 1000).toISOString() };
    expect(effectivePrice(expired)).toBe(2600);
    expect(listPrice(expired)).toBeNull();
  });

  it("ignora promoção maior que o preço de venda", () => {
    expect(effectivePrice({ ...base, promo_price_cents: 3000 })).toBe(2600);
  });
});

describe("Cupons e lucro", () => {
  it("calcula desconto percentual e fixo", () => {
    expect(couponDiscount(10000, { discount_type: "percent", discount_value: 10, min_order_cents: 0 })).toBe(1000);
    expect(couponDiscount(10000, { discount_type: "fixed", discount_value: 1500, min_order_cents: 0 })).toBe(1500);
  });

  it("respeita o valor mínimo do pedido", () => {
    expect(couponDiscount(1000, { discount_type: "percent", discount_value: 10, min_order_cents: 5000 })).toBe(0);
  });

  it("nunca deixa o total abaixo de R$ 1,00", () => {
    expect(couponDiscount(1000, { discount_type: "fixed", discount_value: 5000, min_order_cents: 0 })).toBe(900);
  });

  it("calcula lucro com custo congelado", () => {
    expect(itemProfit({ unit_price_cents: 2600, supplier_cost_cents: 2000, quantity: 2 })).toBe(1200);
  });
});
