import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { buildOrderDraft, CheckoutError, OrderService } from "@/services/OrderService";
import { MemoryRepository, defaultSettings } from "./helpers/memory-repository";
import { recordingNotifier } from "./helpers/fakes";
import type { Coupon } from "@/types";

const user = { id: randomUUID(), email: "cliente@example.com", name: "Cliente Teste" };

describe("Criação de pedidos (buildOrderDraft)", () => {
  let repo: MemoryRepository;
  beforeEach(() => {
    repo = new MemoryRepository();
  });

  it("usa preços do banco e congela custo/preço/região no item", () => {
    const p = repo.addProduct({ sale_price_cents: 2600, supplier_cost_cents: 2000, activation_region: null });
    const d = buildOrderDraft({ user, lines: [{ productId: p.id, quantity: 2 }], products: [p], settings: defaultSettings(), coupon: null });
    expect(d.subtotal_cents).toBe(5200);
    expect(d.total_cents).toBe(5200);
    expect(d.items[0]).toMatchObject({ unit_price_cents: 2600, supplier_cost_cents: 2000, quantity: 2, activation_region: "Brasil" });
  });

  it("agrupa linhas repetidas do mesmo produto", () => {
    const p = repo.addProduct();
    const d = buildOrderDraft({ user, lines: [{ productId: p.id, quantity: 1 }, { productId: p.id, quantity: 2 }], products: [p], settings: defaultSettings(), coupon: null });
    expect(d.items).toHaveLength(1);
    expect(d.items[0]!.quantity).toBe(3);
  });

  it("rejeita produto indisponível, inativo ou inexistente", () => {
    const off = repo.addProduct({ available: false });
    const inactive = repo.addProduct({ active: false });
    expect(() =>
      buildOrderDraft({ user, lines: [{ productId: off.id, quantity: 1 }, { productId: inactive.id, quantity: 1 }, { productId: randomUUID(), quantity: 1 }], products: [off, inactive], settings: defaultSettings(), coupon: null }),
    ).toThrowError(CheckoutError);
  });

  it("rejeita quantidade acima do limite", () => {
    const p = repo.addProduct();
    try {
      buildOrderDraft({ user, lines: [{ productId: p.id, quantity: 6 }], products: [p], settings: defaultSettings(), coupon: null });
      expect.unreachable();
    } catch (e) {
      expect((e as CheckoutError).code).toBe("CART_INVALID");
      expect(JSON.stringify((e as CheckoutError).details)).toMatch(/Quantidade máxima por jogo: 5/);
    }
  });

  it("nunca vende abaixo do custo do fornecedor", () => {
    const p = repo.addProduct({ supplier_cost_cents: 3000, sale_price_cents: 2600 });
    expect(() => buildOrderDraft({ user, lines: [{ productId: p.id, quantity: 1 }], products: [p], settings: defaultSettings(), coupon: null })).toThrow(CheckoutError);
  });

  it("aplica cupom válido e rejeita expirado/esgotado", () => {
    const p = repo.addProduct();
    const coupon: Coupon = { id: randomUUID(), code: "DEZ", discount_type: "percent", discount_value: 10, min_order_cents: 0, max_uses: 1, used_count: 0, expires_at: null, active: true };
    const d = buildOrderDraft({ user, lines: [{ productId: p.id, quantity: 1 }], products: [p], settings: defaultSettings(), coupon, couponCode: "DEZ" });
    expect(d.discount_cents).toBe(260);
    expect(d.total_cents).toBe(2340);
    expect(() => buildOrderDraft({ user, lines: [{ productId: p.id, quantity: 1 }], products: [p], settings: defaultSettings(), coupon: { ...coupon, used_count: 1 }, couponCode: "DEZ" })).toThrow(/esgotado/);
    expect(() =>
      buildOrderDraft({ user, lines: [{ productId: p.id, quantity: 1 }], products: [p], settings: defaultSettings(), coupon: { ...coupon, expires_at: new Date(Date.now() - 1000).toISOString() }, couponCode: "DEZ" }),
    ).toThrow(/expirado/);
  });

  it("rejeita carrinho vazio", () => {
    expect(() => buildOrderDraft({ user, lines: [], products: [], settings: defaultSettings(), coupon: null })).toThrow(/vazio/);
  });
});

describe("OrderService.createOrder", () => {
  it("cria pedido pending_payment e preserva os valores mesmo se o preço mudar depois", async () => {
    const repo = new MemoryRepository();
    const p = repo.addProduct({ sale_price_cents: 2600 });
    const service = new OrderService({ repo, notifier: recordingNotifier().notifier });
    const { orderId } = await service.createOrder({ user, lines: [{ productId: p.id, quantity: 1 }] });

    await repo.updateProduct(p.id, { sale_price_cents: 9900, supplier_cost_cents: 8000 });
    const order = await repo.getOrder(orderId);
    const [item] = await repo.getOrderItems(orderId);
    expect(order!.status).toBe("pending_payment");
    expect(order!.total_cents).toBe(2600);
    expect(item!.unit_price_cents).toBe(2600);
    expect(item!.supplier_cost_cents).toBe(2000);
  });

  it("bloqueia o pedido quando o custo no fornecedor mudou (revalidação ao vivo)", async () => {
    const repo = new MemoryRepository();
    const p = repo.addProduct({ supplier_cost_cents: 2000, sale_price_cents: 2600 });
    const service = new OrderService({
      repo,
      notifier: recordingNotifier().notifier,
      priceChecker: { currentCost: async () => 2500 },
      calculatePrice: (c) => Math.ceil(c * 1.3),
    });
    await expect(service.createOrder({ user, lines: [{ productId: p.id, quantity: 1 }] })).rejects.toMatchObject({ code: "PRICE_CHANGED" });
    expect(repo.products.get(p.id)!.sale_price_cents).toBe(3250);
    expect(repo.orders.size).toBe(0);
  });

  it("marca indisponível quando o jogo saiu do fornecedor", async () => {
    const repo = new MemoryRepository();
    const p = repo.addProduct();
    const service = new OrderService({
      repo,
      notifier: recordingNotifier().notifier,
      priceChecker: {
        currentCost: async () => {
          throw Object.assign(new Error("not found"), { status: 404 });
        },
      },
    });
    await expect(service.createOrder({ user, lines: [{ productId: p.id, quantity: 1 }] })).rejects.toBeInstanceOf(CheckoutError);
    expect(repo.products.get(p.id)!.available).toBe(false);
  });
});
