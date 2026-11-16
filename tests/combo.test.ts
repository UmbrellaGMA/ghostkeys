import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { calculateSalePrice, comboDiscount, comboMissing } from "@/services/PricingService";
import { buildOrderDraft } from "@/services/OrderService";
import { MemoryRepository, defaultSettings } from "./helpers/memory-repository";
import type { Coupon } from "@/types";

const cfg = { combo_enabled: true, combo_size: 3, combo_free: 1 };
const user = { id: randomUUID(), email: "c@example.com", name: "Cliente" };

describe("Promoção Leve 3, pague 2", () => {
  it("3 jogos: o mais barato sai de graça", () => {
    expect(comboDiscount([{ unit_price_cents: 3490, quantity: 1 }, { unit_price_cents: 2990, quantity: 1 }, { unit_price_cents: 2490, quantity: 1 }], cfg)).toBe(2490);
  });

  it("menos de 3 jogos: sem desconto", () => {
    expect(comboDiscount([{ unit_price_cents: 2990, quantity: 2 }], cfg)).toBe(0);
  });

  it("6 jogos: 2 grátis (o mais barato de cada grupo, ordenado do mais caro ao mais barato)", () => {
    const lines = [3500, 3400, 3300, 3200, 3100, 3000].map((p) => ({ unit_price_cents: p, quantity: 1 }));
    expect(comboDiscount(lines, cfg)).toBe(3300 + 3000);
  });

  it("5 jogos: só um combo completo", () => {
    const lines = [3500, 3000, 2500, 2500, 2500].map((p) => ({ unit_price_cents: p, quantity: 1 }));
    expect(comboDiscount(lines, cfg)).toBe(2500);
  });

  it("conta unidades (quantidade) e respeita o desligamento", () => {
    expect(comboDiscount([{ unit_price_cents: 2990, quantity: 3 }], cfg)).toBe(2990);
    expect(comboDiscount([{ unit_price_cents: 2990, quantity: 3 }], { ...cfg, combo_enabled: false })).toBe(0);
  });

  it("quanto falta para o próximo combo", () => {
    expect(comboMissing(1, cfg)).toBe(2);
    expect(comboMissing(2, cfg)).toBe(1);
    expect(comboMissing(3, cfg)).toBe(0);
    expect(comboMissing(4, cfg)).toBe(2);
  });

  it("pedido aplica o combo no servidor e registra separadamente", () => {
    const repo = new MemoryRepository();
    const ps = [3490, 2990, 2490].map((p) => repo.addProduct({ sale_price_cents: p, supplier_cost_cents: 300 }));
    const d = buildOrderDraft({
      user,
      lines: ps.map((p) => ({ productId: p.id, quantity: 1 })),
      products: ps,
      settings: { ...defaultSettings(), ...cfg },
      coupon: null,
    });
    expect(d.subtotal_cents).toBe(8970);
    expect(d.combo_discount_cents).toBe(2490);
    expect(d.discount_cents).toBe(2490);
    expect(d.total_cents).toBe(6480);
  });

  it("combo nunca faz o pedido ficar abaixo do custo", () => {
    const repo = new MemoryRepository();
    const ps = [400, 400, 400].map((p) => repo.addProduct({ sale_price_cents: p, supplier_cost_cents: 300 }));
    const d = buildOrderDraft({ user, lines: ps.map((p) => ({ productId: p.id, quantity: 1 })), products: ps, settings: { ...defaultSettings(), ...cfg }, coupon: null });
    expect(d.total_cents).toBeGreaterThanOrEqual(900);
  });

  it("cupom é aplicado sobre o valor já com o combo", () => {
    const repo = new MemoryRepository();
    const ps = [3000, 3000, 3000].map((p) => repo.addProduct({ sale_price_cents: p, supplier_cost_cents: 300 }));
    const coupon: Coupon = { id: randomUUID(), code: "DEZ", discount_type: "percent", discount_value: 10, min_order_cents: 0, max_uses: null, used_count: 0, expires_at: null, active: true };
    const d = buildOrderDraft({ user, lines: ps.map((p) => ({ productId: p.id, quantity: 1 })), products: ps, settings: { ...defaultSettings(), ...cfg }, coupon, couponCode: "DEZ" });
    expect(d.combo_discount_cents).toBe(3000);
    expect(d.discount_cents).toBe(3000 + 600);
    expect(d.total_cents).toBe(5400);
  });
});

describe("Preço padrão (estratégia flat)", () => {
  it("todos os jogos no modo global custam o preço padrão, independente do custo", () => {
    const c = { pricing_strategy: "flat" as const, margin_percent: 0, fixed_markup_cents: 0, min_price_cents: 100, round_to_90: false, default_sale_price_cents: 2990 };
    expect(calculateSalePrice(300, c)).toBe(2990);
    expect(calculateSalePrice(500, c)).toBe(2990);
  });
});
