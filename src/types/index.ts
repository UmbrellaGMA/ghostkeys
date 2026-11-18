export type UserRole = "customer" | "admin";

export type OrderStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "delivered"
  | "delivery_failed"
  | "cancelled"
  | "refunded";

export type PricingStrategy = "flat" | "percent" | "fixed" | "percent_plus_fixed";

export interface Profile {
  id: string;
  full_name: string | null;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Category {
  id: string;
  name: string;
  slug: string;
  supplier_tags: string[];
  sort_order: number;
}

export interface Product {
  id: string;
  supplier: string;
  supplier_product_id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  image_url: string | null;
  background_url: string | null;
  developer: string | null;
  publisher: string | null;
  release_date: string | null;
  tags: string[];
  nsfw: boolean;
  supplier_cost_cents: number | null;
  original_price_cents: number | null;
  sale_price_cents: number;
  promo_price_cents: number | null;
  promo_ends_at: string | null;
  pricing_mode: "global" | "custom";
  custom_price_cents: number | null;
  category_id: string | null;
  platform: string;
  activation_region: string | null;
  available: boolean;
  active: boolean;
  featured: boolean;
  sales_count: number;
  supplier_synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface StoreSettings {
  id: 1;
  store_name: string;
  store_legal_name: string | null;
  store_document: string | null;
  support_email: string | null;
  support_whatsapp: string | null;
  support_hours: string | null;
  pricing_strategy: PricingStrategy;
  margin_percent: number;
  fixed_markup_cents: number;
  min_price_cents: number;
  round_to_90: boolean;
  default_sale_price_cents: number;
  combo_enabled: boolean;
  combo_size: number;
  combo_free: number;
  default_platform: string;
  default_activation_region: string | null;
  activation_instructions: string | null;
  import_nsfw: boolean;
  auto_deactivate_missing: boolean;
  max_quantity_per_item: number;
  pix_enabled: boolean;
  card_enabled: boolean;
  pix_expiration_minutes: number;
  max_installments: number;
  auto_delivery_enabled: boolean;
  delivery_max_attempts: number;
  key_code_length: "15" | "20" | "25" | "random";
  emails_enabled: boolean;
  email_reply_to: string | null;
  updated_at: string;
}

export interface ActivationTutorial {
  id: string;
  platform: string;
  title: string;
  intro: string | null;
  steps: string[];
  activation_url: string | null;
  video_url: string | null;
  notes: string | null;
  is_default: boolean;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_number: number;
  user_id: string;
  customer_name: string;
  customer_email: string;
  subtotal_cents: number;
  discount_cents: number;
  combo_discount_cents: number;
  total_cents: number;
  coupon_id: string | null;
  coupon_code: string | null;
  status: OrderStatus;
  payment_method: "pix" | "card" | null;
  expires_at: string | null;
  paid_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  refunded_at: string | null;
  delivery_attempts: number;
  next_delivery_attempt_at: string | null;
  last_delivery_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_slug: string | null;
  product_image_url: string | null;
  supplier_product_id: string;
  supplier_cost_cents: number;
  unit_price_cents: number;
  quantity: number;
  platform: string;
  activation_region: string | null;
}

export interface Payment {
  id: string;
  order_id: string;
  provider: string;
  external_payment_id: string | null;
  idempotency_key: string;
  payment_method: "pix" | "card";
  payment_method_id: string | null;
  amount_cents: number;
  currency: string;
  status: string;
  status_detail: string | null;
  installments: number | null;
  pix_qr_code: string | null;
  pix_qr_code_base64: string | null;
  pix_ticket_url: string | null;
  expires_at: string | null;
  approved_at: string | null;
  refunded_amount_cents: number;
  created_at: string;
  updated_at: string;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_order_cents: number;
  max_uses: number | null;
  /** Quantas vezes cada cliente pode usar (null = sem limite por cliente). */
  max_uses_per_user: number | null;
  used_count: number;
  expires_at: string | null;
  active: boolean;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: "Aguardando pagamento",
  paid: "Pago — entrega pendente",
  processing: "Processando entrega",
  delivered: "Entregue",
  delivery_failed: "Falha na entrega",
  cancelled: "Cancelado",
  refunded: "Reembolsado",
};
