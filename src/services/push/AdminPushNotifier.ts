import "server-only";
import webpush from "web-push";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { formatBRL } from "@/lib/money";
import type { Order, OrderItem } from "@/types";
import type { Notifier } from "@/services/notifier";
import type { PushEventKey } from "@/lib/push-events";

export interface PushMessage {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

interface SubscriptionRow {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  failures: number;
}

export function pushConfigured(): boolean {
  return Boolean(optionalEnv("VAPID_PUBLIC_KEY") && optionalEnv("VAPID_PRIVATE_KEY"));
}

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  const pub = optionalEnv("VAPID_PUBLIC_KEY");
  const priv = optionalEnv("VAPID_PRIVATE_KEY");
  if (!pub || !priv) return false;
  webpush.setVapidDetails(optionalEnv("VAPID_SUBJECT") ?? "https://ghostkeys.online", pub, priv);
  vapidReady = true;
  return true;
}

/** Envia para as inscrições informadas. Remove aparelhos que não existem mais (404/410). */
export async function sendToSubscriptions(rows: SubscriptionRow[], msg: PushMessage): Promise<{ sent: number; failed: number }> {
  if (!rows.length || !ensureVapid()) return { sent: 0, failed: 0 };
  const db = createAdminClient();
  const payload = JSON.stringify(msg);
  let sent = 0;
  let failed = 0;
  await Promise.all(
    rows.map(async (r) => {
      try {
        await webpush.sendNotification({ endpoint: r.endpoint, keys: { p256dh: r.p256dh, auth: r.auth } }, payload, { TTL: 60 * 60 * 24, urgency: "high" });
        sent++;
        await db.from("push_subscriptions").update({ last_sent_at: new Date().toISOString(), failures: 0 }).eq("id", r.id);
      } catch (e) {
        failed++;
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410 || r.failures >= 9) await db.from("push_subscriptions").delete().eq("id", r.id);
        else await db.from("push_subscriptions").update({ failures: r.failures + 1 }).eq("id", r.id);
        console.error("[push] falha ao enviar", status ?? (e as Error).message);
      }
    }),
  );
  return { sent, failed };
}

/** Envia o evento para todos os aparelhos de administradores inscritos nele. */
export async function sendAdminPush(event: PushEventKey, msg: PushMessage): Promise<void> {
  if (!pushConfigured()) return;
  const { data } = await createAdminClient()
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth, failures, profiles!inner(role)")
    .contains("events", [event])
    .eq("profiles.role", "admin");
  await sendToSubscriptions((data ?? []) as unknown as SubscriptionRow[], msg);
}

/**
 * Agenda o envio para depois da resposta (a função serverless continua viva até terminar).
 * Fora de uma requisição (ex.: testes), envia na hora.
 */
export function schedule(task: () => Promise<void>): Promise<void> {
  const safe = () => task().catch((e) => console.error("[push]", (e as Error).message));
  try {
    after(safe);
    return Promise.resolve();
  } catch {
    return safe();
  }
}

const orderUrl = (o: Order) => `/admin/pedidos/${o.id}`;
const who = (o: Order) => o.customer_name?.split(/\s+/)[0] || o.customer_email;
const keysCount = (items: OrderItem[]) => items.reduce((s, i) => s + i.quantity, 0);

/** Mensagens das notificações (exportado para testes). */
export const pushMessages = {
  orderCreated: (o: Order, items: OrderItem[]): PushMessage => ({
    title: `🛒 Novo pedido #${o.order_number}`,
    body: `${who(o)} · ${formatBRL(o.total_cents)} · ${keysCount(items)} jogo(s) — aguardando pagamento`,
    url: orderUrl(o),
    tag: `order-${o.id}`,
  }),
  pixGenerated: (o: Order): PushMessage => ({
    title: `⏳ PIX gerado · #${o.order_number}`,
    body: `${who(o)} está pagando ${formatBRL(o.total_cents)}`,
    url: orderUrl(o),
    tag: `order-${o.id}`,
  }),
  paymentApproved: (o: Order): PushMessage => ({
    title: `💰 Pagamento aprovado · #${o.order_number}`,
    body: `${formatBRL(o.total_cents)} via ${o.payment_method === "card" ? "cartão" : "PIX"} — ${who(o)}`,
    url: orderUrl(o),
    tag: `order-${o.id}`,
  }),
  keysDelivered: (o: Order, items: OrderItem[]): PushMessage => ({
    title: `✅ Compra concluída · #${o.order_number}`,
    body: `${keysCount(items)} key(s) entregue(s) para ${who(o)} · ${formatBRL(o.total_cents)}`,
    url: orderUrl(o),
    tag: `order-${o.id}`,
  }),
  deliveryFailed: (o: Order, reason: string): PushMessage => ({
    title: `⚠️ Falha na entrega · #${o.order_number}`,
    body: `${reason.slice(0, 120)} — reprocesse ou reembolse no painel`,
    url: orderUrl(o),
    tag: `order-${o.id}-fail`,
  }),
  paymentRejected: (o: Order, reason: string | null): PushMessage => ({
    title: `❌ Pagamento recusado · #${o.order_number}`,
    body: `${who(o)} · ${formatBRL(o.total_cents)}${reason ? ` · ${reason}` : ""}`,
    url: orderUrl(o),
    tag: `order-${o.id}`,
  }),
  supportMessage: (c: { id: string; customer_name: string }, body: string): PushMessage => ({
    title: `💬 ${c.customer_name.slice(0, 40)} · Suporte`,
    body: body.replace(/\s+/g, " ").trim().slice(0, 160),
    url: `/admin/suporte/${c.id}`,
    tag: `support-${c.id}`,
  }),
  orderRefunded: (o: Order): PushMessage => ({
    title: `↩️ Reembolso · #${o.order_number}`,
    body: `${formatBRL(o.total_cents)} estornado para ${who(o)}`,
    url: orderUrl(o),
    tag: `order-${o.id}`,
  }),
};

/** Notificações push para o app do administrador. */
export class AdminPushNotifier implements Notifier {
  constructor(private send: (event: PushEventKey, msg: PushMessage) => Promise<void> = sendAdminPush) {}

  orderCreated(o: Order, items: OrderItem[]) {
    return schedule(() => this.send("order_created", pushMessages.orderCreated(o, items)));
  }
  pixGenerated(o: Order) {
    return schedule(() => this.send("pix_generated", pushMessages.pixGenerated(o)));
  }
  paymentApproved(o: Order) {
    return schedule(() => this.send("payment_approved", pushMessages.paymentApproved(o)));
  }
  keysDelivered(o: Order, items: OrderItem[]) {
    return schedule(() => this.send("keys_delivered", pushMessages.keysDelivered(o, items)));
  }
  deliveryFailed(o: Order, reason: string) {
    return schedule(() => this.send("delivery_failed", pushMessages.deliveryFailed(o, reason)));
  }
  paymentRejected(o: Order, reason: string | null) {
    return schedule(() => this.send("payment_rejected", pushMessages.paymentRejected(o, reason)));
  }
  orderRefunded(o: Order) {
    return schedule(() => this.send("order_refunded", pushMessages.orderRefunded(o)));
  }
}
