import { describe, expect, it } from "vitest";
import { DeliveryService } from "@/services/DeliveryService";
import { ShadowKeysError } from "@/services/shadowkeys/ShadowKeysService";
import { decryptSecret } from "@/lib/crypto";
import { MemoryRepository } from "./helpers/memory-repository";
import { FakeSupplier, recordingNotifier, testCrypto } from "./helpers/fakes";

function setup() {
  const repo = new MemoryRepository();
  const supplier = new FakeSupplier();
  const { notifier, sent } = recordingNotifier();
  const delivery = new DeliveryService({ repo, supplier, crypto: testCrypto, notifier });
  return { repo, supplier, delivery, sent };
}

describe("Entrega automática", () => {
  it("compra as keys, salva criptografadas e marca como entregue", async () => {
    const { repo, supplier, delivery, sent } = setup();
    const orderId = await repo.seedPaidOrder(2);
    const r = await delivery.deliverOrder(orderId, "webhook");
    expect(r).toEqual({ status: "delivered", keysGenerated: 2 });
    expect(supplier.calls).toEqual([{ appId: "1245620", quantity: 2 }]);
    expect((await repo.getOrder(orderId))!.status).toBe("delivered");
    expect(repo.keys).toHaveLength(2);
    for (const k of repo.keys) {
      expect(k.encrypted_key.startsWith("v1:")).toBe(true);
      expect(k.encrypted_key).not.toContain("TEST-");
      expect(decryptSecret(k.encrypted_key)).toMatch(/^TEST-/);
    }
    expect(sent).toContain("keysDelivered");
  });

  it("não compra keys antes da aprovação do pagamento", async () => {
    const { repo, supplier, delivery } = setup();
    const orderId = await repo.seedPaidOrder();
    repo.orders.get(orderId)!.status = "pending_payment";
    const r = await delivery.deliverOrder(orderId, "webhook");
    expect(r.status).toBe("skipped");
    expect(supplier.calls).toHaveLength(0);
  });

  it("entregas concorrentes geram uma única compra no fornecedor", async () => {
    const { repo, supplier, delivery } = setup();
    supplier.delayMs = 20;
    const orderId = await repo.seedPaidOrder();
    const results = await Promise.all(Array.from({ length: 5 }, () => delivery.deliverOrder(orderId, "webhook")));
    expect(results.filter((r) => r.status === "delivered")).toHaveLength(1);
    expect(results.filter((r) => r.status === "skipped")).toHaveLength(4);
    expect(supplier.calls).toHaveLength(1);
    expect(repo.keys).toHaveLength(1);
  });

  it("pedido já entregue não gera nova compra", async () => {
    const { repo, supplier, delivery } = setup();
    const orderId = await repo.seedPaidOrder();
    await delivery.deliverOrder(orderId, "webhook");
    const again = await delivery.deliverOrder(orderId, "admin");
    expect(again.status).toBe("skipped");
    expect(supplier.calls).toHaveLength(1);
  });

  it("fornecedor indisponível: pedido continua pago com nova tentativa agendada", async () => {
    const { repo, supplier, delivery } = setup();
    supplier.failNext.push(new ShadowKeysError("Service Unavailable", 503, null, true));
    const orderId = await repo.seedPaidOrder();
    const r = await delivery.deliverOrder(orderId, "webhook");
    expect(r.status).toBe("retry_scheduled");
    const order = (await repo.getOrder(orderId))!;
    expect(order.status).toBe("paid");
    expect(order.next_delivery_attempt_at).not.toBeNull();
    expect(order.last_delivery_error).toMatch(/indisponível/);
    expect(repo.keys).toHaveLength(0);
  });

  it("erro definitivo (saldo insuficiente): entrega falha e aguarda ação do admin", async () => {
    const { repo, supplier, delivery } = setup();
    supplier.failNext.push(new ShadowKeysError("Saldo insuficiente", 402, null, false));
    const orderId = await repo.seedPaidOrder();
    const r = await delivery.deliverOrder(orderId, "webhook");
    expect(r).toMatchObject({ status: "failed" });
    expect((await repo.getOrder(orderId))!.status).toBe("delivery_failed");
  });

  it("após atingir o máximo de tentativas, marca delivery_failed", async () => {
    const { repo, supplier, delivery } = setup();
    repo.settings.delivery_max_attempts = 2;
    supplier.failNext.push(new ShadowKeysError("x", 503, null, true), new ShadowKeysError("x", 503, null, true));
    const orderId = await repo.seedPaidOrder();
    expect((await delivery.deliverOrder(orderId, "webhook")).status).toBe("retry_scheduled");
    expect((await delivery.deliverOrder(orderId, "cron")).status).toBe("failed");
    expect((await repo.getOrder(orderId))!.status).toBe("delivery_failed");
  });

  it("reprocessamento administrativo seguro: gera somente as keys faltantes", async () => {
    const { repo, supplier, delivery } = setup();
    supplier.shortBy = 1; // fornecedor devolve 2 de 3
    const orderId = await repo.seedPaidOrder(3);
    const first = await delivery.deliverOrder(orderId, "webhook");
    expect(first.status).toBe("retry_scheduled");
    expect(repo.keys).toHaveLength(2);

    supplier.shortBy = 0;
    const second = await delivery.deliverOrder(orderId, "admin:1");
    expect(second).toEqual({ status: "delivered", keysGenerated: 1 });
    expect(supplier.calls.map((c) => c.quantity)).toEqual([3, 1]);
    expect(repo.keys).toHaveLength(3);
  });

  it("uma mesma key nunca é entregue duas vezes", async () => {
    const { repo, supplier, delivery } = setup();
    supplier.repeatCode = "TEST-AAAAA-BBBBB";
    const a = await repo.seedPaidOrder();
    const b = await repo.seedPaidOrder();
    expect((await delivery.deliverOrder(a, "webhook")).status).toBe("delivered");
    const r = await delivery.deliverOrder(b, "webhook");
    expect(r.status).not.toBe("delivered");
    expect(repo.keys.filter((k) => decryptSecret(k.encrypted_key) === "TEST-AAAAA-BBBBB")).toHaveLength(1);
    expect(repo.events.some((e) => e.order_id === b && e.message.includes("duplicada"))).toBe(true);
  });

  it("revogação no reembolso marca keys como revogadas e registra as que exigem ação manual", async () => {
    const { repo, supplier, delivery } = setup();
    const orderId = await repo.seedPaidOrder(2);
    await delivery.deliverOrder(orderId, "webhook");
    let calls = 0;
    supplier.revokeKey = async (code: string) => {
      if (calls++ === 0) throw new ShadowKeysError("available", 409, null, false);
      return { ok: true, keyId: "x", code, refundedCents: 0, revokedApps: [], remainingApps: [], keyStatus: "revoked" };
    };
    const r = await delivery.revokeOrderKeys(orderId, "admin:1");
    expect(r).toEqual({ revoked: 1, manual: 1 });
    expect(repo.keys.every((k) => k.delivery_status === "revoked")).toBe(true);
  });
});
