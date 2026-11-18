import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { commissionCents, weekRange, weekStartOf } from "@/lib/weeks";
import type { Coupon, OrderStatus } from "@/types";

/**
 * Cupons de afiliado: vendas e comissão por semana (segunda a domingo, horário de Brasília).
 * Conta pedidos pagos/entregues pela data do pagamento. Reembolsados e cancelados não geram comissão.
 */

export const COMMISSION_STATUSES: OrderStatus[] = ["paid", "processing", "delivered", "delivery_failed"];

export interface AffiliateOrderRow {
  id: string;
  order_number: number;
  customer_name: string;
  status: OrderStatus;
  total_cents: number;
  paid_at: string;
  percent: number;
  commission_cents: number;
  counts: boolean;
}

export interface AffiliateWeek {
  weekStart: string;
  orders: AffiliateOrderRow[];
  sales: number;
  revenueCents: number;
  commissionCents: number;
  payout: { amount_cents: number; paid_at: string } | null;
}

export type AffiliateCoupon = Pick<
  Coupon,
  "id" | "code" | "discount_type" | "discount_value" | "active" | "affiliate_name" | "commission_percent" | "affiliate_token" | "expires_at"
>;

const COUPON_FIELDS = "id, code, discount_type, discount_value, active, affiliate_name, commission_percent, affiliate_token, expires_at";

export async function listAffiliateCoupons(): Promise<AffiliateCoupon[]> {
  const { data } = await createAdminClient()
    .from("coupons")
    .select(COUPON_FIELDS)
    .not("commission_percent", "is", null)
    .order("affiliate_name");
  return (data ?? []) as AffiliateCoupon[];
}

export async function getAffiliateCoupon(id: string): Promise<AffiliateCoupon | null> {
  const { data } = await createAdminClient().from("coupons").select(COUPON_FIELDS).eq("id", id).not("commission_percent", "is", null).maybeSingle();
  return (data as AffiliateCoupon | null) ?? null;
}

export async function getAffiliateCouponByToken(token: string): Promise<AffiliateCoupon | null> {
  if (!/^[A-Za-z0-9_-]{24,64}$/.test(token)) return null;
  const { data } = await createAdminClient().from("coupons").select(COUPON_FIELDS).eq("affiliate_token", token).not("commission_percent", "is", null).maybeSingle();
  return (data as AffiliateCoupon | null) ?? null;
}

interface RawOrder {
  id: string;
  order_number: number;
  customer_name: string;
  status: OrderStatus;
  total_cents: number;
  paid_at: string;
  affiliate_commission_percent: number | string | null;
}

function toRow(o: RawOrder, fallbackPercent: number | null): AffiliateOrderRow {
  const percent = Number(o.affiliate_commission_percent ?? fallbackPercent ?? 0);
  const counts = COMMISSION_STATUSES.includes(o.status);
  return {
    id: o.id,
    order_number: o.order_number,
    customer_name: o.customer_name,
    status: o.status,
    total_cents: o.total_cents,
    paid_at: o.paid_at,
    percent,
    commission_cents: counts ? commissionCents(o.total_cents, percent) : 0,
    counts,
  };
}

/** Relatório de uma semana: pedidos pagos no período (inclui reembolsados, marcados como "não conta"). */
export async function affiliateWeek(coupon: AffiliateCoupon, weekStart: string): Promise<AffiliateWeek> {
  const db = createAdminClient();
  const { from, to } = weekRange(weekStart);
  const [{ data: orders }, { data: payout }] = await Promise.all([
    db
      .from("orders")
      .select("id, order_number, customer_name, status, total_cents, paid_at, affiliate_commission_percent")
      .eq("coupon_id", coupon.id)
      .not("paid_at", "is", null)
      .gte("paid_at", from)
      .lt("paid_at", to)
      .order("paid_at", { ascending: true })
      .limit(2000),
    db.from("affiliate_payouts").select("amount_cents, paid_at").eq("coupon_id", coupon.id).eq("week_start", weekStart).maybeSingle(),
  ]);
  const rows = ((orders ?? []) as RawOrder[]).map((o) => toRow(o, coupon.commission_percent));
  const valid = rows.filter((r) => r.counts);
  return {
    weekStart,
    orders: rows,
    sales: valid.length,
    revenueCents: valid.reduce((s, r) => s + r.total_cents, 0),
    commissionCents: valid.reduce((s, r) => s + r.commission_cents, 0),
    payout: (payout as AffiliateWeek["payout"]) ?? null,
  };
}

export interface WeekSummary {
  weekStart: string;
  sales: number;
  commissionCents: number;
  paid: boolean;
}

/** Semanas com vendas (mais recentes primeiro) para o seletor de semanas e o total a pagar. */
export async function affiliateWeeks(coupon: AffiliateCoupon): Promise<WeekSummary[]> {
  const db = createAdminClient();
  const [{ data: orders }, { data: payouts }] = await Promise.all([
    db
      .from("orders")
      .select("id, order_number, customer_name, status, total_cents, paid_at, affiliate_commission_percent")
      .eq("coupon_id", coupon.id)
      .in("status", COMMISSION_STATUSES)
      .not("paid_at", "is", null)
      .order("paid_at", { ascending: false })
      .limit(5000),
    db.from("affiliate_payouts").select("week_start").eq("coupon_id", coupon.id),
  ]);
  const paid = new Set(((payouts ?? []) as { week_start: string }[]).map((p) => p.week_start));
  const weeks = new Map<string, WeekSummary>();
  for (const o of (orders ?? []) as RawOrder[]) {
    const w = weekStartOf(o.paid_at);
    const row = toRow(o, coupon.commission_percent);
    const cur = weeks.get(w) ?? { weekStart: w, sales: 0, commissionCents: 0, paid: paid.has(w) };
    cur.sales += 1;
    cur.commissionCents += row.commission_cents;
    weeks.set(w, cur);
  }
  return [...weeks.values()].sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}

/** Registra a comissão da semana como paga (valor calculado aqui, nunca vindo do navegador). */
export async function markWeekPaid(coupon: AffiliateCoupon, weekStart: string, adminId: string): Promise<number> {
  if (weekStart >= weekStartOf()) throw new Error("Só dá para dar baixa em semanas já encerradas.");
  const week = await affiliateWeek(coupon, weekStart);
  const { error } = await createAdminClient()
    .from("affiliate_payouts")
    .upsert({ coupon_id: coupon.id, week_start: weekStart, amount_cents: week.commissionCents, paid_by: adminId, paid_at: new Date().toISOString() }, { onConflict: "coupon_id,week_start" });
  if (error) throw error;
  return week.commissionCents;
}

export async function unmarkWeekPaid(couponId: string, weekStart: string): Promise<void> {
  const { error } = await createAdminClient().from("affiliate_payouts").delete().eq("coupon_id", couponId).eq("week_start", weekStart);
  if (error) throw error;
}
