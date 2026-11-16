import { randomUUID } from "node:crypto";
import { decryptSecret, encryptSecret, hashSecret, last4 } from "@/lib/crypto";
import type { KeyCrypto } from "@/services/DeliveryService";
import { ShadowKeysError, type KeySupplier } from "@/services/shadowkeys/ShadowKeysService";
import type { SKGenerateKeysResponse } from "@/services/shadowkeys/types";
import type { MPPayment } from "@/services/mercadopago/MercadoPagoService";
import type { Notifier } from "@/services/notifier";

export const testCrypto: KeyCrypto = { encrypt: (s) => encryptSecret(s), decrypt: (s) => decryptSecret(s), hash: (s) => hashSecret(s), last4 };

/** Fornecedor falso que conta chamadas e permite simular falhas. */
export class FakeSupplier implements KeySupplier {
  readonly isSandbox = true;
  calls: Array<{ appId: string; quantity: number }> = [];
  revoked: string[] = [];
  failNext: ShadowKeysError[] = [];
  /** Retorna menos keys do que o pedido (simula resposta parcial). */
  shortBy = 0;
  /** Atraso artificial para simular concorrência. */
  delayMs = 0;
  /** Força a repetição de um código já entregue. */
  repeatCode: string | null = null;

  async generateKeys(input: { appId: string; quantity: number }): Promise<SKGenerateKeysResponse> {
    this.calls.push({ appId: input.appId, quantity: input.quantity });
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    const err = this.failNext.shift();
    if (err) throw err;
    const n = Math.max(0, input.quantity - this.shortBy);
    const keys = Array.from({ length: n }, () => {
      const code = this.repeatCode ?? `TEST-${randomUUID().slice(0, 5).toUpperCase()}-${randomUUID().slice(0, 5).toUpperCase()}`;
      return { id: `sk_${randomUUID()}`, code, gameIds: [input.appId], gameNames: ["Jogo"], isCombo: false, chargedCents: 0 };
    });
    return { generated: n, totalCents: 0, chargedCentsPerKey: 0, gamesPerKey: 1, isCombo: false, imported: [], keys };
  }

  async revokeKey(code: string) {
    this.revoked.push(code);
    return { ok: true, keyId: "x", code, refundedCents: 0, revokedApps: [], remainingApps: [], keyStatus: "revoked" as const };
  }
}

export function recordingNotifier() {
  const sent: string[] = [];
  const n: Notifier = {
    async orderCreated() {
      sent.push("orderCreated");
    },
    async paymentApproved() {
      sent.push("paymentApproved");
    },
    async paymentRejected() {
      sent.push("paymentRejected");
    },
    async keysDelivered() {
      sent.push("keysDelivered");
    },
    async orderRefunded() {
      sent.push("orderRefunded");
    },
  };
  return { notifier: n, sent };
}

export function mpPayment(overrides: Partial<MPPayment> = {}): MPPayment {
  return {
    id: 123456789,
    status: "approved",
    status_detail: "accredited",
    transaction_amount: 26,
    currency_id: "BRL",
    external_reference: null,
    payment_method_id: "pix",
    payment_type_id: "bank_transfer",
    installments: 1,
    date_approved: new Date().toISOString(),
    date_of_expiration: null,
    ...overrides,
  };
}

/** fetch falso que registra requisições e responde em sequência. */
export function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  const fn = (async (url: string | URL | Request, init?: RequestInit) => {
    requests.push({ url: String(url), init: init ?? {} });
    const r = responses.shift() ?? { status: 500, body: { message: "sem resposta configurada" } };
    return new Response(JSON.stringify(r.body), { status: r.status, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  return { fetch: fn, requests };
}
