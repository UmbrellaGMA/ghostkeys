import { NextResponse } from "next/server";
import { isCronAuthorized } from "../_auth";
import { getDeliveryService, getOrderService, getRepository } from "@/services/container";
import type { Order, Payment } from "@/types";

export const maxDuration = 300;

/**
 * Tarefas periódicas de pedidos:
 *  1. Re-tenta entregas pendentes (status 'paid' com next_delivery_attempt_at vencido).
 *  2. Recupera entregas presas em 'processing' há mais de 10 minutos.
 *  3. Reconsulta no Mercado Pago pedidos aguardando pagamento (webhook perdido) e cancela os expirados.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const repo = getRepository();
  const db = repo.client;
  const now = new Date().toISOString();
  const report = { retried: 0, recovered: 0, synced: 0, expired: 0, errors: [] as string[] };
  const delivery = getDeliveryService(repo);
  const orders = getOrderService();

  // 1 e 2: entregas
  const { data: toDeliver } = await db
    .from("orders")
    .select("id, status, next_delivery_attempt_at, updated_at")
    .or(`and(status.eq.paid,or(next_delivery_attempt_at.is.null,next_delivery_attempt_at.lte.${now})),and(status.eq.processing,updated_at.lt.${new Date(Date.now() - 10 * 60_000).toISOString()})`)
    .limit(20);
  for (const o of (toDeliver ?? []) as Order[]) {
    try {
      const r = await delivery.deliverOrder(o.id, "cron");
      if (o.status === "processing") report.recovered++;
      else report.retried++;
      if (r.status === "failed") report.errors.push(`${o.id}: ${r.error}`);
    } catch (e) {
      report.errors.push(`${o.id}: ${(e as Error).message}`);
    }
  }

  // 3: pagamentos pendentes
  const { data: pending } = await db
    .from("orders")
    .select("id, expires_at, payments(external_payment_id, status)")
    .eq("status", "pending_payment")
    .order("created_at")
    .limit(50);
  for (const o of (pending ?? []) as Array<Order & { payments: Payment[] }>) {
    try {
      for (const p of o.payments ?? []) {
        if (!p.external_payment_id || !["pending", "in_process", "authorized"].includes(p.status)) continue;
        const res = await orders.syncPaymentFromProvider(p.external_payment_id, "cron");
        report.synced++;
        if (res.shouldDeliver) await delivery.deliverOrder(o.id, "cron");
      }
      const fresh = await repo.getOrder(o.id);
      // Margem de 5 minutos após a expiração para pagamentos em compensação
      if (fresh?.status === "pending_payment" && fresh.expires_at && new Date(fresh.expires_at).getTime() < Date.now() - 5 * 60_000) {
        await orders.cancelOrder(o.id, "cron");
        report.expired++;
      }
    } catch (e) {
      report.errors.push(`${o.id}: ${(e as Error).message}`);
    }
  }

  return NextResponse.json({ ok: true, ...report });
}
