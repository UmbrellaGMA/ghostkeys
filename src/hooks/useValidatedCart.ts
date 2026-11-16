"use client";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "./useCart";
import { comboDiscount, comboMissing, couponDiscount, type ComboConfig } from "@/services/PricingService";

export interface ValidatedLine {
  productId: string;
  found: boolean;
  available: boolean;
  name?: string;
  slug?: string;
  image_url?: string | null;
  platform?: string;
  activation_region?: string | null;
  price_cents?: number;
  list_price_cents?: number | null;
}

type CouponPreview = { code: string; discount_type: "percent" | "fixed"; discount_value: number; min_order_cents: number } | { error: string } | null;

/** Carrinho + preços atuais do servidor + totais. */
export function useValidatedCart(couponCode?: string) {
  // Limite real vem do servidor (maxQuantity); a UI aplica esse limite nos controles
  const cart = useCart(100);
  const [lines, setLines] = useState<Record<string, ValidatedLine>>({});
  const [maxQuantity, setMaxQuantity] = useState(5);
  const [coupon, setCoupon] = useState<CouponPreview>(null);
  const [loading, setLoading] = useState(true);
  const [combo, setCombo] = useState<ComboConfig | null>(null);
  const key = cart.items.map((i) => `${i.productId}:${i.quantity}`).join("|") + `#${couponCode ?? ""}`;

  useEffect(() => {
    if (!cart.items.length) {
      setLoading(false);
      setLines({});
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    fetch("/api/cart/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: cart.items.map((i) => ({ productId: i.productId, quantity: i.quantity })), couponCode }),
      signal: ctrl.signal,
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setLines(Object.fromEntries((d.items as ValidatedLine[]).map((l) => [l.productId, l])));
        setMaxQuantity(d.maxQuantity ?? 5);
        setCoupon(d.coupon ?? null);
        setCombo(d.combo ?? null);
        // Atualiza dados de exibição salvos localmente
        cart.sync((items) =>
          items.map((i) => {
            const l = (d.items as ValidatedLine[]).find((x) => x.productId === i.productId);
            return l?.found ? { ...i, name: l.name ?? i.name, slug: l.slug ?? i.slug, imageUrl: l.image_url ?? i.imageUrl, priceCents: l.price_cents ?? i.priceCents } : i;
          }),
        );
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => ctrl.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const totals = useMemo(() => {
    let subtotal = 0;
    let listTotal = 0;
    let units = 0;
    let hasUnavailable = false;
    const priced: Array<{ unit_price_cents: number; quantity: number }> = [];
    for (const i of cart.items) {
      const l = lines[i.productId];
      if (!l || !l.available || !l.price_cents) {
        if (l) hasUnavailable = true;
        continue;
      }
      subtotal += l.price_cents * i.quantity;
      listTotal += (l.list_price_cents ?? l.price_cents) * i.quantity;
      units += i.quantity;
      priced.push({ unit_price_cents: l.price_cents, quantity: i.quantity });
    }
    // Prévia — o servidor recalcula ao criar o pedido
    const comboCents = combo ? comboDiscount(priced, combo) : 0;
    const comboMissingUnits = combo ? comboMissing(units, combo) : 0;
    const couponOk = coupon && !("error" in coupon) ? coupon : null;
    const couponCents = couponOk ? couponDiscount(subtotal - comboCents, couponOk) : 0;
    return {
      subtotal,
      savings: listTotal - subtotal,
      comboCents,
      comboMissingUnits,
      couponCents,
      total: subtotal - comboCents - couponCents,
      hasUnavailable,
    };
  }, [cart.items, lines, coupon, combo]);

  return { ...cart, lines, maxQuantity, coupon, combo, loading, totals };
}
