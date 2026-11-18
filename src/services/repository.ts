import type { Coupon, Order, OrderItem, OrderStatus, Payment, Product, StoreSettings } from "@/types";

/**
 * Contrato de persistência usado pelos serviços de pedido/pagamento/entrega.
 * Implementação real: SupabaseRepository (SupabaseService.ts).
 * Implementação em memória: tests/helpers/memory-repository.ts (testes automatizados).
 */

export type OrderItemWithDelivery = OrderItem & { delivered_count: number };

export interface NewDigitalKey {
  order_item_id: string;
  supplier_key_id: string | null;
  encrypted_key: string;
  key_hash: string;
  key_last4: string;
  is_test: boolean;
}

export type InsertKeyResult = "inserted" | "duplicate" | "quantity_exceeded";

export interface StoredKey {
  id: string;
  order_item_id: string;
  encrypted_key: string;
  supplier_key_id: string | null;
  delivery_status: "delivered" | "revoked";
  is_test: boolean;
}

export interface OrderDraftItem {
  product_id: string;
  product_name: string;
  product_slug: string;
  product_image_url: string | null;
  supplier_product_id: string;
  supplier_cost_cents: number;
  unit_price_cents: number;
  quantity: number;
  platform: string;
  activation_region: string | null;
}

export interface OrderDraft {
  user_id: string;
  customer_name: string;
  customer_email: string;
  subtotal_cents: number;
  discount_cents: number;
  combo_discount_cents: number;
  total_cents: number;
  coupon_id: string | null;
  coupon_code: string | null;
  expires_at: string;
  items: OrderDraftItem[];
}

export interface NewPayment {
  order_id: string;
  idempotency_key: string;
  payment_method: "pix" | "card";
  amount_cents: number;
}

export interface StoreRepository {
  getSettings(): Promise<StoreSettings>;

  getProductsByIds(ids: string[]): Promise<Product[]>;
  updateProduct(id: string, patch: Partial<Product>): Promise<void>;
  getCouponByCode(code: string): Promise<Coupon | null>;
  /** Usos do cupom pelo cliente (pedidos pagos/entregues ou aguardando pagamento no prazo). */
  countCouponUsesByUser(couponId: string, userId: string): Promise<number>;

  createOrder(draft: OrderDraft): Promise<string>;
  getOrder(id: string): Promise<Order | null>;
  getOrderItems(orderId: string): Promise<OrderItemWithDelivery[]>;
  updateOrder(id: string, patch: Partial<Pick<Order, "payment_method" | "last_delivery_error" | "next_delivery_attempt_at">>): Promise<void>;
  transition(orderId: string, from: OrderStatus[], to: OrderStatus, message: string, actor: string): Promise<boolean>;
  addOrderEvent(orderId: string, message: string, actor: string): Promise<void>;

  createPayment(p: NewPayment): Promise<Payment>;
  updatePayment(id: string, patch: Partial<Payment>): Promise<void>;
  findPaymentByExternalId(externalId: string): Promise<Payment | null>;
  listPayments(orderId: string): Promise<Payment[]>;

  claimOrderForDelivery(orderId: string, triggeredBy: string): Promise<string | null>;
  finishDeliveryAttempt(
    attemptId: string,
    patch: { status: "success" | "partial" | "failed"; keys_generated: number; error_code?: string | null; error_message?: string | null },
  ): Promise<void>;
  insertDigitalKey(row: NewDigitalKey): Promise<InsertKeyResult>;
  listOrderKeys(orderId: string): Promise<StoredKey[]>;
  markKeyRevoked(keyId: string): Promise<void>;
}
