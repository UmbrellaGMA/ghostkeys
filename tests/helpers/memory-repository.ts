import { randomUUID } from "node:crypto";
import type { Coupon, Order, OrderItem, OrderStatus, Payment, Product, StoreSettings } from "@/types";
import type {
  InsertKeyResult,
  NewDigitalKey,
  NewPayment,
  OrderDraft,
  OrderItemWithDelivery,
  StoreRepository,
  StoredKey,
} from "@/services/repository";

/**
 * Repositório em memória que reproduz as garantias do banco:
 *  - transition(): troca de status condicional e atômica (como transition_order_status)
 *  - claimOrderForDelivery(): lock exclusivo (como claim_order_for_delivery)
 *  - insertDigitalKey(): UNIQUE(key_hash, supplier_key_id) + trigger de quantidade
 */
export class MemoryRepository implements StoreRepository {
  settings: StoreSettings = defaultSettings();
  products = new Map<string, Product>();
  coupons = new Map<string, Coupon>();
  orders = new Map<string, Order>();
  items = new Map<string, OrderItem>();
  payments = new Map<string, Payment>();
  keys: Array<NewDigitalKey & { id: string; delivery_status: "delivered" | "revoked" }> = [];
  events: Array<{ order_id: string; message: string; actor: string; to?: OrderStatus }> = [];
  attempts = new Map<string, { order_id: string; status: string; keys_generated: number; error_code?: string | null }>();
  private orderSeq = 1000;

  async getSettings() {
    return this.settings;
  }
  async getProductsByIds(ids: string[]) {
    return ids.map((id) => this.products.get(id)).filter(Boolean) as Product[];
  }
  async updateProduct(id: string, patch: Partial<Product>) {
    const p = this.products.get(id);
    if (p) this.products.set(id, { ...p, ...patch });
  }
  async getCouponByCode(code: string) {
    return [...this.coupons.values()].find((c) => c.code === code.toUpperCase()) ?? null;
  }

  async createOrder(draft: OrderDraft) {
    const id = randomUUID();
    const now = new Date().toISOString();
    const { items, ...o } = draft;
    this.orders.set(id, {
      ...o,
      id,
      order_number: ++this.orderSeq,
      status: "pending_payment",
      payment_method: null,
      paid_at: null,
      delivered_at: null,
      cancelled_at: null,
      refunded_at: null,
      delivery_attempts: 0,
      next_delivery_attempt_at: null,
      last_delivery_error: null,
      created_at: now,
      updated_at: now,
    });
    for (const i of items) {
      const itemId = randomUUID();
      this.items.set(itemId, { ...i, id: itemId, order_id: id });
    }
    return id;
  }
  async getOrder(id: string) {
    const o = this.orders.get(id);
    return o ? { ...o } : null;
  }
  async getOrderItems(orderId: string): Promise<OrderItemWithDelivery[]> {
    return [...this.items.values()]
      .filter((i) => i.order_id === orderId)
      .map((i) => ({ ...i, delivered_count: this.keys.filter((k) => k.order_item_id === i.id).length }));
  }
  async updateOrder(id: string, patch: Partial<Order>) {
    const o = this.orders.get(id);
    if (o) this.orders.set(id, { ...o, ...patch, updated_at: new Date().toISOString() });
  }
  async transition(orderId: string, from: OrderStatus[], to: OrderStatus, message: string, actor: string) {
    const o = this.orders.get(orderId);
    if (!o || !from.includes(o.status)) return false;
    this.orders.set(orderId, {
      ...o,
      status: to,
      paid_at: to === "paid" && !o.paid_at ? new Date().toISOString() : o.paid_at,
      updated_at: new Date().toISOString(),
    });
    this.events.push({ order_id: orderId, message, actor, to });
    if (to === "paid" && o.status === "pending_payment" && o.coupon_id) {
      const c = this.coupons.get(o.coupon_id);
      if (c) c.used_count++;
    }
    return true;
  }
  async addOrderEvent(orderId: string, message: string, actor: string) {
    this.events.push({ order_id: orderId, message, actor });
  }

  async createPayment(p: NewPayment): Promise<Payment> {
    const id = randomUUID();
    const now = new Date().toISOString();
    const row: Payment = {
      ...p,
      id,
      provider: "mercadopago",
      external_payment_id: null,
      payment_method_id: null,
      currency: "BRL",
      status: "creating",
      status_detail: null,
      installments: null,
      pix_qr_code: null,
      pix_qr_code_base64: null,
      pix_ticket_url: null,
      expires_at: null,
      approved_at: null,
      refunded_amount_cents: 0,
      created_at: now,
      updated_at: now,
    };
    this.payments.set(id, row);
    return row;
  }
  async updatePayment(id: string, patch: Partial<Payment>) {
    const p = this.payments.get(id);
    if (p) this.payments.set(id, { ...p, ...patch });
  }
  async findPaymentByExternalId(externalId: string) {
    return [...this.payments.values()].find((p) => p.external_payment_id === externalId) ?? null;
  }
  async listPayments(orderId: string) {
    return [...this.payments.values()].filter((p) => p.order_id === orderId);
  }

  async claimOrderForDelivery(orderId: string, triggeredBy: string) {
    const o = this.orders.get(orderId);
    if (!o || !["paid", "delivery_failed"].includes(o.status)) return null;
    // Operação síncrona: equivalente ao UPDATE ... WHERE status IN (...) com lock de linha
    this.orders.set(orderId, { ...o, status: "processing", delivery_attempts: o.delivery_attempts + 1, next_delivery_attempt_at: null });
    const id = randomUUID();
    this.attempts.set(id, { order_id: orderId, status: "started", keys_generated: 0 });
    this.events.push({ order_id: orderId, message: "claim", actor: triggeredBy, to: "processing" });
    return id;
  }
  async finishDeliveryAttempt(attemptId: string, patch: { status: string; keys_generated: number; error_code?: string | null }) {
    const a = this.attempts.get(attemptId);
    if (a) this.attempts.set(attemptId, { ...a, ...patch });
  }
  async insertDigitalKey(row: NewDigitalKey): Promise<InsertKeyResult> {
    if (this.keys.some((k) => k.key_hash === row.key_hash || (row.supplier_key_id && k.supplier_key_id === row.supplier_key_id))) return "duplicate";
    const item = this.items.get(row.order_item_id)!;
    if (this.keys.filter((k) => k.order_item_id === row.order_item_id).length >= item.quantity) return "quantity_exceeded";
    this.keys.push({ ...row, id: randomUUID(), delivery_status: "delivered" });
    return "inserted";
  }
  async listOrderKeys(orderId: string): Promise<StoredKey[]> {
    const itemIds = new Set([...this.items.values()].filter((i) => i.order_id === orderId).map((i) => i.id));
    return this.keys.filter((k) => itemIds.has(k.order_item_id));
  }
  async markKeyRevoked(keyId: string) {
    const k = this.keys.find((x) => x.id === keyId);
    if (k) k.delivery_status = "revoked";
  }

  // ───── helpers de teste ─────
  addProduct(overrides: Partial<Product> = {}): Product {
    const id = overrides.id ?? randomUUID();
    const p: Product = {
      id,
      supplier: "shadowkeys",
      supplier_product_id: "1245620",
      name: "Jogo de Teste",
      slug: `jogo-${id.slice(0, 6)}`,
      description: null,
      short_description: null,
      image_url: null,
      background_url: null,
      developer: null,
      publisher: null,
      release_date: null,
      tags: [],
      nsfw: false,
      supplier_cost_cents: 2000,
      original_price_cents: null,
      sale_price_cents: 2600,
      promo_price_cents: null,
      promo_ends_at: null,
      pricing_mode: "global",
      custom_price_cents: null,
      category_id: null,
      platform: "Steam",
      activation_region: "Brasil",
      available: true,
      active: true,
      featured: false,
      sales_count: 0,
      supplier_synced_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      ...overrides,
    };
    this.products.set(id, p);
    return p;
  }

  /** Cria um pedido pago diretamente (para testes de entrega). */
  async seedPaidOrder(quantity = 1, appId = "1245620") {
    const product = this.addProduct({ supplier_product_id: appId });
    const orderId = await this.createOrder({
      user_id: randomUUID(),
      customer_name: "Cliente Teste",
      customer_email: "cliente@example.com",
      subtotal_cents: 2600 * quantity,
      discount_cents: 0,
      combo_discount_cents: 0,
      total_cents: 2600 * quantity,
      coupon_id: null,
      coupon_code: null,
      expires_at: new Date(Date.now() + 1800_000).toISOString(),
      items: [
        {
          product_id: product.id,
          product_name: product.name,
          product_slug: product.slug,
          product_image_url: null,
          supplier_product_id: appId,
          supplier_cost_cents: 2000,
          unit_price_cents: 2600,
          quantity,
          platform: "Steam",
          activation_region: "Brasil",
        },
      ],
    });
    await this.transition(orderId, ["pending_payment"], "paid", "seed", "test");
    return orderId;
  }
}

export function defaultSettings(): StoreSettings {
  return {
    id: 1,
    store_name: "Loja Teste",
    store_legal_name: null,
    store_document: null,
    support_email: null,
    support_whatsapp: null,
    support_hours: null,
    pricing_strategy: "percent",
    margin_percent: 30,
    fixed_markup_cents: 0,
    min_price_cents: 100,
    round_to_90: false,
    default_sale_price_cents: 2990,
    // Desligado por padrão nos testes; os testes da promoção ligam explicitamente
    combo_enabled: false,
    combo_size: 3,
    combo_free: 1,
    default_platform: "Steam",
    default_activation_region: "Brasil",
    activation_instructions: null,
    import_nsfw: false,
    auto_deactivate_missing: true,
    max_quantity_per_item: 5,
    pix_enabled: true,
    card_enabled: true,
    pix_expiration_minutes: 30,
    max_installments: 3,
    auto_delivery_enabled: true,
    delivery_max_attempts: 3,
    key_code_length: "20",
    emails_enabled: true,
    email_reply_to: null,
    updated_at: new Date().toISOString(),
  };
}
