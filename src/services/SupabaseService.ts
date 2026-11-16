import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { redact } from "@/lib/utils";
import type { Coupon, Order, OrderStatus, Payment, Product, StoreSettings } from "@/types";
import type { ApiLogEntry, ApiLogger } from "@/services/shadowkeys/ShadowKeysService";
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
 * SupabaseService: acesso privilegiado (service role) ao banco, usado SOMENTE no servidor.
 * Implementa o StoreRepository e o registrador de chamadas de API (api_logs).
 */
export class SupabaseRepository implements StoreRepository, ApiLogger {
  constructor(private readonly db: SupabaseClient = createAdminClient()) {}

  get client() {
    return this.db;
  }

  async log(entry: ApiLogEntry): Promise<void> {
    await this.db.from("api_logs").insert({ ...entry, response_summary: entry.response_summary ? redact(entry.response_summary) : null });
  }

  async getSettings(): Promise<StoreSettings> {
    const { data, error } = await this.db.from("store_settings").select("*").eq("id", 1).single();
    if (error) throw error;
    return data as StoreSettings;
  }

  async getProductsByIds(ids: string[]): Promise<Product[]> {
    if (!ids.length) return [];
    const { data, error } = await this.db.from("products").select("*").in("id", ids);
    if (error) throw error;
    return (data ?? []) as Product[];
  }

  async updateProduct(id: string, patch: Partial<Product>): Promise<void> {
    const { error } = await this.db.from("products").update(patch).eq("id", id);
    if (error) throw error;
  }

  async getCouponByCode(code: string): Promise<Coupon | null> {
    const { data, error } = await this.db.from("coupons").select("*").eq("code", code.trim().toUpperCase()).maybeSingle();
    if (error) throw error;
    return (data as Coupon) ?? null;
  }

  async createOrder(draft: OrderDraft): Promise<string> {
    const { items, ...order } = draft;
    const { data, error } = await this.db.rpc("create_order_with_items", { p_order: order, p_items: items });
    if (error) throw error;
    return data as string;
  }

  async getOrder(id: string): Promise<Order | null> {
    const { data, error } = await this.db.from("orders").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return (data as Order) ?? null;
  }

  async getOrderItems(orderId: string): Promise<OrderItemWithDelivery[]> {
    const { data, error } = await this.db
      .from("order_items")
      .select("*, digital_keys(count)")
      .eq("order_id", orderId)
      .order("created_at");
    if (error) throw error;
    return (data ?? []).map((row: Record<string, unknown>) => {
      const { digital_keys, ...rest } = row as { digital_keys: Array<{ count: number }> } & Record<string, unknown>;
      return { ...(rest as unknown as OrderItemWithDelivery), delivered_count: digital_keys?.[0]?.count ?? 0 };
    });
  }

  async updateOrder(id: string, patch: Partial<Order>): Promise<void> {
    const { error } = await this.db.from("orders").update(patch).eq("id", id);
    if (error) throw error;
  }

  async transition(orderId: string, from: OrderStatus[], to: OrderStatus, message: string, actor: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("transition_order_status", {
      p_order_id: orderId,
      p_from: from,
      p_to: to,
      p_message: message,
      p_actor: actor,
    });
    if (error) throw error;
    return Boolean(data);
  }

  async addOrderEvent(orderId: string, message: string, actor: string): Promise<void> {
    await this.db.from("order_events").insert({ order_id: orderId, message, actor });
  }

  async createPayment(p: NewPayment): Promise<Payment> {
    const { data, error } = await this.db.from("payments").insert({ ...p, status: "creating" }).select("*").single();
    if (error) throw error;
    return data as Payment;
  }

  async updatePayment(id: string, patch: Partial<Payment>): Promise<void> {
    const { error } = await this.db.from("payments").update(patch).eq("id", id);
    if (error) throw error;
  }

  async findPaymentByExternalId(externalId: string): Promise<Payment | null> {
    const { data, error } = await this.db
      .from("payments")
      .select("*")
      .eq("provider", "mercadopago")
      .eq("external_payment_id", externalId)
      .maybeSingle();
    if (error) throw error;
    return (data as Payment) ?? null;
  }

  async listPayments(orderId: string): Promise<Payment[]> {
    const { data, error } = await this.db.from("payments").select("*").eq("order_id", orderId).order("created_at", { ascending: false });
    if (error) throw error;
    return (data ?? []) as Payment[];
  }

  async claimOrderForDelivery(orderId: string, triggeredBy: string): Promise<string | null> {
    const { data, error } = await this.db.rpc("claim_order_for_delivery", { p_order_id: orderId, p_triggered_by: triggeredBy });
    if (error) throw error;
    return (data as string) ?? null;
  }

  async finishDeliveryAttempt(
    attemptId: string,
    patch: { status: "success" | "partial" | "failed"; keys_generated: number; error_code?: string | null; error_message?: string | null },
  ): Promise<void> {
    await this.db
      .from("delivery_attempts")
      .update({ ...patch, error_message: patch.error_message ? redact(patch.error_message) : null, finished_at: new Date().toISOString() })
      .eq("id", attemptId);
  }

  async insertDigitalKey(row: NewDigitalKey): Promise<InsertKeyResult> {
    const { error } = await this.db.from("digital_keys").insert(row);
    if (!error) return "inserted";
    if (error.code === "23505") return "duplicate";
    if (error.message?.includes("KEY_QUANTITY_EXCEEDED")) return "quantity_exceeded";
    throw error;
  }

  async listOrderKeys(orderId: string): Promise<StoredKey[]> {
    const { data, error } = await this.db
      .from("digital_keys")
      .select("id, order_item_id, encrypted_key, supplier_key_id, delivery_status, is_test, order_items!inner(order_id)")
      .eq("order_items.order_id", orderId);
    if (error) throw error;
    return (data ?? []).map(({ order_items: _oi, ...k }: Record<string, unknown>) => k as unknown as StoredKey);
  }

  async markKeyRevoked(keyId: string): Promise<void> {
    await this.db.from("digital_keys").update({ delivery_status: "revoked", revoked_at: new Date().toISOString() }).eq("id", keyId);
  }
}
