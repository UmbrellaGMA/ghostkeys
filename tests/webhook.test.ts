import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyWebhookSignature } from "@/services/mercadopago/MercadoPagoService";

const secret = "segredo-de-teste";
function sign(dataId: string, requestId: string, ts: string, key = secret) {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac("sha256", key).update(manifest).digest("hex")}`;
}

describe("Validação de webhook do Mercado Pago", () => {
  it("aceita assinatura válida", () => {
    const ts = String(Math.floor(Date.now() / 1000));
    expect(verifyWebhookSignature({ xSignature: sign("123456", "req-1", ts), xRequestId: "req-1", dataId: "123456", secret }).valid).toBe(true);
  });

  it("converte data.id alfanumérico para minúsculas conforme a documentação", () => {
    const ts = "1704908010";
    expect(verifyWebhookSignature({ xSignature: sign("abc123", "r", ts), xRequestId: "r", dataId: "ABC123", secret }).valid).toBe(true);
  });

  it("rejeita assinatura com segredo errado", () => {
    const ts = "1704908010";
    expect(verifyWebhookSignature({ xSignature: sign("1", "r", ts, "outro"), xRequestId: "r", dataId: "1", secret })).toEqual({ valid: false, reason: "invalid_signature" });
  });

  it("rejeita payload adulterado (data.id diferente)", () => {
    const ts = "1704908010";
    expect(verifyWebhookSignature({ xSignature: sign("111", "r", ts), xRequestId: "r", dataId: "222", secret }).valid).toBe(false);
  });

  it("rejeita assinatura ausente, malformada ou sem segredo configurado", () => {
    expect(verifyWebhookSignature({ xSignature: null, xRequestId: "r", dataId: "1", secret }).reason).toBe("missing_signature");
    expect(verifyWebhookSignature({ xSignature: "lixo", xRequestId: "r", dataId: "1", secret }).reason).toBe("malformed_signature");
    expect(verifyWebhookSignature({ xSignature: sign("1", "r", "1"), xRequestId: "r", dataId: "1", secret: "" }).reason).toBe("secret_not_configured");
  });

  it("aplica tolerância de tempo quando configurada (anti-replay)", () => {
    const old = "1600000000";
    const r = verifyWebhookSignature({ xSignature: sign("1", "r", old), xRequestId: "r", dataId: "1", secret, toleranceSeconds: 300 });
    expect(r).toEqual({ valid: false, reason: "timestamp_out_of_tolerance" });
  });
});
