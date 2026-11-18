import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { enforceRateLimit, handleApiError } from "@/lib/api";
import { cartValidateSchema } from "@/validations/schemas";
import { effectivePrice, listPrice } from "@/services/PricingService";
import { getRepository } from "@/services/container";
import { getCurrentUser } from "@/lib/auth";
import { COUPON_USER_LIMIT_MESSAGE } from "@/services/OrderService";
import type { Product, StoreSettings } from "@/types";

/** Devolve preços e disponibilidade ATUAIS dos itens do carrinho (o carrinho local nunca define preço). */
export async function POST(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "cart", 60, 60);
    if (limited) return limited;
    const { items, couponCode } = cartValidateSchema.parse(await req.json());
    if (!items.length) return NextResponse.json({ items: [], maxQuantity: 5 });

    // Prévia do cupom (o desconto definitivo é recalculado ao criar o pedido)
    let coupon: { code: string; discount_type: "percent" | "fixed"; discount_value: number; min_order_cents: number } | { error: string } | null = null;
    if (couponCode?.trim()) {
      const c = await getRepository().getCouponByCode(couponCode).catch(() => null);
      const valid = c && c.active && (!c.expires_at || new Date(c.expires_at) > new Date()) && (c.max_uses === null || c.used_count < c.max_uses);
      // Limite por cliente: avisa já no carrinho (o pedido valida de novo ao ser criado)
      let overLimit = false;
      if (valid && c.max_uses_per_user) {
        const u = await getCurrentUser().catch(() => null);
        if (u) overLimit = (await getRepository().countCouponUsesByUser(c.id, u.id).catch(() => 0)) >= c.max_uses_per_user;
      }
      coupon = !valid
        ? { error: "Cupom inválido ou expirado" }
        : overLimit
          ? { error: COUPON_USER_LIMIT_MESSAGE }
          : { code: c.code, discount_type: c.discount_type, discount_value: c.discount_value, min_order_cents: c.min_order_cents };
    }

    const supabase = await createPublicClient();
    const [{ data: products }, { data: settings }] = await Promise.all([
      supabase
        .from("products")
        .select("id, name, slug, image_url, sale_price_cents, promo_price_cents, promo_ends_at, original_price_cents, available, active, platform, activation_region, supplier_cost_cents")
        .in("id", items.map((i) => i.productId)),
      supabase.from("store_settings").select("max_quantity_per_item, default_activation_region, combo_enabled, combo_size, combo_free").eq("id", 1).single(),
    ]);
    const cfg = settings as Pick<StoreSettings, "max_quantity_per_item" | "default_activation_region" | "combo_enabled" | "combo_size" | "combo_free"> | null;
    const map = new Map(((products ?? []) as Product[]).map((p) => [p.id, p]));

    return NextResponse.json({
      coupon,
      combo: cfg ? { combo_enabled: cfg.combo_enabled, combo_size: cfg.combo_size, combo_free: cfg.combo_free } : null,
      maxQuantity: cfg?.max_quantity_per_item ?? 5,
      items: items.map((i) => {
        const p = map.get(i.productId);
        if (!p) return { productId: i.productId, found: false, available: false };
        const price = effectivePrice(p);
        return {
          productId: p.id,
          found: true,
          name: p.name,
          slug: p.slug,
          image_url: p.image_url,
          platform: p.platform,
          activation_region: p.activation_region ?? cfg?.default_activation_region ?? null,
          price_cents: price,
          list_price_cents: listPrice(p),
          available: p.active && p.available && price > 0,
        };
      }),
    });
  } catch (e) {
    return handleApiError(e);
  }
}
