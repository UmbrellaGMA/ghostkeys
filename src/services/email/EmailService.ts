import type { Order, OrderItem, StoreSettings } from "@/types";
import type { Notifier } from "@/services/notifier";
import type { ApiLogger } from "@/services/shadowkeys/ShadowKeysService";
import { templates, type EmailContent, type TemplateContext } from "./templates";

/**
 * Envio de e-mails transacionais via Resend (https://resend.com/docs/api-reference/emails/send-email).
 * Se RESEND_API_KEY não estiver configurada, os envios são registrados em api_logs como "skipped"
 * — a loja continua funcionando e o cliente vê tudo na área do cliente.
 */
export class EmailService implements Notifier {
  constructor(
    private readonly opts: {
      apiKey?: string;
      from?: string;
      appUrl: string;
      getSettings: () => Promise<Pick<StoreSettings, "store_name" | "support_email" | "emails_enabled" | "email_reply_to">>;
      logger?: ApiLogger;
      fetchImpl?: typeof fetch;
    },
  ) {}

  private async ctx(): Promise<TemplateContext & { enabled: boolean; replyTo: string | null }> {
    const s = await this.opts.getSettings();
    return { storeName: s.store_name, appUrl: this.opts.appUrl, supportEmail: s.support_email, enabled: s.emails_enabled, replyTo: s.email_reply_to };
  }

  async send(to: string, content: EmailContent, ctx?: { enabled: boolean; replyTo: string | null }, orderId?: string): Promise<boolean> {
    const started = Date.now();
    if (ctx && !ctx.enabled) return false;
    if (!this.opts.apiKey || !this.opts.from) {
      await this.opts.logger?.log({
        provider: "email",
        operation: "send",
        request_status: "error",
        order_id: orderId ?? null,
        response_summary: `skipped (RESEND_API_KEY/EMAIL_FROM não configurados): ${content.subject}`,
      });
      return false;
    }
    try {
      const res = await (this.opts.fetchImpl ?? fetch)("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${this.opts.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          from: this.opts.from,
          to: [to],
          subject: content.subject,
          html: content.html,
          text: content.text,
          ...(ctx?.replyTo ? { reply_to: ctx.replyTo } : {}),
        }),
      });
      await this.opts.logger?.log({
        provider: "email",
        operation: "send",
        request_status: res.ok ? "success" : "error",
        http_status: res.status,
        duration_ms: Date.now() - started,
        order_id: orderId ?? null,
        response_summary: content.subject,
      });
      return res.ok;
    } catch (e) {
      await this.opts.logger?.log({
        provider: "email",
        operation: "send",
        request_status: "error",
        order_id: orderId ?? null,
        response_summary: (e as Error).message,
      });
      return false;
    }
  }

  async orderCreated(order: Order, items: OrderItem[]) {
    const c = await this.ctx();
    await this.send(order.customer_email, templates.orderCreated(c, order, items), c, order.id);
  }
  async paymentApproved(order: Order) {
    const c = await this.ctx();
    await this.send(order.customer_email, templates.paymentApproved(c, order), c, order.id);
  }
  async paymentRejected(order: Order, reason: string | null) {
    const c = await this.ctx();
    await this.send(order.customer_email, templates.paymentRejected(c, order, reason), c, order.id);
  }
  async keysDelivered(order: Order, items: OrderItem[]) {
    const c = await this.ctx();
    await this.send(order.customer_email, templates.keysDelivered(c, order, items), c, order.id);
  }
  async orderRefunded(order: Order) {
    const c = await this.ctx();
    await this.send(order.customer_email, templates.orderRefunded(c, order), c, order.id);
  }
  async welcome(email: string, name: string) {
    const c = await this.ctx();
    await this.send(email, templates.welcome(c, name), c);
  }
}
