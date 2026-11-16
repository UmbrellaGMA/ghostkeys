import { createHmac, timingSafeEqual } from "node:crypto";
import type { ApiLogger } from "@/services/shadowkeys/ShadowKeysService";

/**
 * Integração com a API de Pagamentos do Mercado Pago (Checkout Transparente).
 * Docs: https://www.mercadopago.com.br/developers/pt/reference/payments/_payments/post
 *
 *  - PIX: POST /v1/payments com payment_method_id = "pix" → QR Code + copia e cola
 *  - Cartão: token gerado no navegador pelo Card Payment Brick (dados do cartão nunca
 *    passam pelo nosso servidor) → POST /v1/payments
 *  - Consulta: GET /v1/payments/{id}
 *  - Estorno: POST /v1/payments/{id}/refunds
 *  - Cancelamento (pendentes): PUT /v1/payments/{id} { status: "cancelled" }
 */

const API = "https://api.mercadopago.com";

export type MPPaymentStatus =
  | "pending"
  | "approved"
  | "authorized"
  | "in_process"
  | "in_mediation"
  | "rejected"
  | "cancelled"
  | "refunded"
  | "charged_back";

export interface MPPayment {
  id: number;
  status: MPPaymentStatus;
  status_detail: string | null;
  transaction_amount: number;
  transaction_amount_refunded?: number;
  currency_id: string;
  external_reference: string | null;
  payment_method_id: string | null;
  payment_type_id: string | null;
  installments: number | null;
  date_approved: string | null;
  date_of_expiration: string | null;
  live_mode?: boolean;
  metadata?: Record<string, unknown>;
  point_of_interaction?: {
    transaction_data?: { qr_code?: string; qr_code_base64?: string; ticket_url?: string };
  };
}

export class MercadoPagoError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "MercadoPagoError";
  }
}

export interface PayerInput {
  email: string;
  firstName?: string;
  lastName?: string;
  cpf?: string | null;
}

export interface MercadoPagoOptions {
  accessToken: string;
  fetchImpl?: typeof fetch;
  logger?: ApiLogger;
}

export class MercadoPagoService {
  private readonly fetchImpl: typeof fetch;
  constructor(private readonly opts: MercadoPagoOptions) {
    if (!opts.accessToken) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get isTestMode() {
    return this.opts.accessToken.startsWith("TEST-");
  }

  createPixPayment(input: {
    amountCents: number;
    description: string;
    orderId: string;
    payer: PayerInput;
    expiresAt: Date;
    notificationUrl?: string;
    idempotencyKey: string;
  }): Promise<MPPayment> {
    return this.request<MPPayment>("POST", "/v1/payments", "payments.create_pix", {
      idempotencyKey: input.idempotencyKey,
      orderId: input.orderId,
      body: {
        transaction_amount: input.amountCents / 100,
        description: input.description.slice(0, 250),
        payment_method_id: "pix",
        external_reference: input.orderId,
        notification_url: input.notificationUrl,
        date_of_expiration: formatMPDate(input.expiresAt),
        metadata: { order_id: input.orderId },
        payer: buildPayer(input.payer),
      },
    });
  }

  createCardPayment(input: {
    amountCents: number;
    description: string;
    orderId: string;
    token: string;
    paymentMethodId: string;
    issuerId?: string | number | null;
    installments: number;
    payer: PayerInput & { identificationType?: string; identificationNumber?: string };
    notificationUrl?: string;
    idempotencyKey: string;
  }): Promise<MPPayment> {
    const payer = buildPayer(input.payer);
    if (input.payer.identificationType && input.payer.identificationNumber) {
      payer.identification = { type: input.payer.identificationType, number: input.payer.identificationNumber.replace(/\D/g, "") };
    }
    return this.request<MPPayment>("POST", "/v1/payments", "payments.create_card", {
      idempotencyKey: input.idempotencyKey,
      orderId: input.orderId,
      body: {
        transaction_amount: input.amountCents / 100,
        description: input.description.slice(0, 250),
        token: input.token,
        payment_method_id: input.paymentMethodId,
        issuer_id: input.issuerId ? Number(input.issuerId) : undefined,
        installments: input.installments,
        external_reference: input.orderId,
        notification_url: input.notificationUrl,
        statement_descriptor: undefined,
        binary_mode: true, // aprovado ou recusado imediatamente — sem "em análise" para produtos digitais
        metadata: { order_id: input.orderId },
        payer,
      },
    });
  }

  getPayment(paymentId: string | number): Promise<MPPayment> {
    return this.request<MPPayment>("GET", `/v1/payments/${encodeURIComponent(String(paymentId))}`, "payments.get", {});
  }

  refundPayment(paymentId: string | number, idempotencyKey: string, amountCents?: number, orderId?: string) {
    return this.request<{ id: number; status: string; amount: number }>(
      "POST",
      `/v1/payments/${encodeURIComponent(String(paymentId))}/refunds`,
      "payments.refund",
      { idempotencyKey, orderId, body: amountCents ? { amount: amountCents / 100 } : {} },
    );
  }

  cancelPayment(paymentId: string | number, orderId?: string) {
    return this.request<MPPayment>("PUT", `/v1/payments/${encodeURIComponent(String(paymentId))}`, "payments.cancel", {
      orderId,
      body: { status: "cancelled" },
    });
  }

  private async request<T>(
    method: "GET" | "POST" | "PUT",
    path: string,
    operation: string,
    { body, idempotencyKey, orderId }: { body?: unknown; idempotencyKey?: string; orderId?: string },
  ): Promise<T> {
    const started = Date.now();
    let status: number | null = null;
    try {
      const res = await this.fetchImpl(`${API}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.opts.accessToken}`,
          "Content-Type": "application/json",
          ...(idempotencyKey ? { "X-Idempotency-Key": idempotencyKey } : {}),
        },
        body: body && method !== "GET" ? JSON.stringify(body) : undefined,
        cache: "no-store",
        signal: AbortSignal.timeout(25000),
      });
      status = res.status;
      const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!res.ok) {
        const msg = (json?.message as string) ?? `HTTP ${res.status}`;
        await this.log(operation, "error", status, started, orderId, msg);
        throw new MercadoPagoError(msg, res.status, json?.cause);
      }
      await this.log(
        operation,
        "success",
        status,
        started,
        orderId,
        json ? `id=${json.id} status=${json.status ?? ""} detail=${json.status_detail ?? ""}` : "",
      );
      return json as T;
    } catch (e) {
      if (e instanceof MercadoPagoError) throw e;
      await this.log(operation, "error", status, started, orderId, (e as Error).message);
      throw new MercadoPagoError(`Falha ao contatar o Mercado Pago: ${(e as Error).message}`, null);
    }
  }

  private async log(operation: string, s: "success" | "error", http: number | null, started: number, orderId?: string, summary?: string) {
    try {
      await this.opts.logger?.log({
        provider: "mercadopago",
        operation,
        request_status: s,
        http_status: http,
        duration_ms: Date.now() - started,
        order_id: orderId ?? null,
        response_summary: summary ?? null,
      });
    } catch {
      /* ignore */
    }
  }
}

function buildPayer(p: PayerInput): Record<string, unknown> & { identification?: { type: string; number: string } } {
  const payer: Record<string, unknown> & { identification?: { type: string; number: string } } = { email: p.email };
  if (p.firstName) payer.first_name = p.firstName;
  if (p.lastName) payer.last_name = p.lastName;
  if (p.cpf) payer.identification = { type: "CPF", number: p.cpf.replace(/\D/g, "") };
  return payer;
}

/** Formato exigido pelo MP: yyyy-MM-dd'T'HH:mm:ss.SSS-03:00 (horário de Brasília). */
export function formatMPDate(date: Date): string {
  const offsetMs = -3 * 60 * 60 * 1000;
  const local = new Date(date.getTime() + offsetMs);
  return local.toISOString().replace("Z", "-03:00");
}

// ───────────────────────── Webhook ─────────────────────────

/**
 * Valida a assinatura do webhook conforme a documentação oficial:
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 *
 * Header x-signature: "ts=<ts>,v1=<hmac>"
 * Manifesto: "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * (data.id vem da query string; se alfanumérico, deve ser convertido para minúsculas)
 * HMAC-SHA256 com a "assinatura secreta" da aplicação.
 */
export function verifyWebhookSignature(params: {
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | null;
  secret: string;
  /** Tolerância opcional para replay (segundos). */
  toleranceSeconds?: number;
  now?: number;
}): { valid: boolean; reason?: string } {
  const { xSignature, xRequestId, dataId, secret } = params;
  if (!secret) return { valid: false, reason: "secret_not_configured" };
  if (!xSignature) return { valid: false, reason: "missing_signature" };

  let ts: string | undefined;
  let v1: string | undefined;
  for (const part of xSignature.split(",")) {
    const [k, v] = part.split("=").map((s) => s?.trim());
    if (k === "ts") ts = v;
    if (k === "v1") v1 = v;
  }
  if (!ts || !v1) return { valid: false, reason: "malformed_signature" };

  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { valid: false, reason: "invalid_signature" };

  if (params.toleranceSeconds) {
    const tsNum = Number(ts);
    const tsMs = tsNum > 1e12 ? tsNum : tsNum * 1000;
    if (Math.abs((params.now ?? Date.now()) - tsMs) > params.toleranceSeconds * 1000) {
      return { valid: false, reason: "timestamp_out_of_tolerance" };
    }
  }
  return { valid: true };
}
