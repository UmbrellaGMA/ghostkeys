import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { OrderService } from "@/services/OrderService";
import { DeliveryService } from "@/services/DeliveryService";
import { MercadoPagoService } from "@/services/mercadopago/MercadoPagoService";
import { SandboxKeySupplier, ShadowKeysError } from "@/services/shadowkeys/ShadowKeysService";
import { decryptSecret } from "@/lib/crypto";
import { MemoryRepository } from "./helpers/memory-repository";
import { mockFetch, recordingNotifier, testCrypto } from "./helpers/fakes";

/**
 * Ambiente de testes ponta a ponta, sem keys reais e sem cobrança:
 * carrinho → pedido → PIX → webhook aprovado → entrega (SandboxKeySupplier) → keys na conta.
 */
describe("Fluxo completo em ambiente sandbox", () => {
  it("do pedido à key entregue", async () => {
    const repo = new MemoryRepository();
    const product = repo.addProduct({ supplier_product_id: "1259420" });
    const user = { id: randomUUID(), email: "teste@example.com", name: "Teste Sandbox" };
    const { notifier, sent } = recordingNotifier();
    const supplier = new SandboxKeySupplier();
    const delivery = new DeliveryService({ repo, supplier, crypto: testCrypto, notifier });

    const { fetch } = mockFetch([]);
    const mp = new MercadoPagoService({ accessToken: "TEST-sandbox", fetchImpl: fetch });
    const orders = new OrderService({ repo, notifier, delivery, mercadoPago: mp });

    // 1-4. Pedido criado com preço do servidor
    const { orderId } = await orders.createOrder({ user, lines: [{ productId: product.id, quantity: 1 }] });
    expect((await repo.getOrder(orderId))!.status).toBe("pending_payment");

    // 5. PIX criado no Mercado Pago (sandbox)
    (mp as unknown as { fetchImpl: typeof globalThis.fetch }).fetchImpl = mockFetch([
      { status: 201, body: { id: 42, status: "pending", transaction_amount: 26, currency_id: "BRL", point_of_interaction: { transaction_data: { qr_code: "pix", qr_code_base64: "b64" } } } },
      // 6. consulta do pagamento feita pelo webhook
      { status: 200, body: { id: 42, status: "approved", status_detail: "accredited", transaction_amount: 26, currency_id: "BRL", external_reference: orderId, date_approved: new Date().toISOString() } },
    ]).fetch;
    await orders.createPixPayment(orderId, user.id);

    // 6-7. Webhook → consulta MP → pago
    const res = await orders.syncPaymentFromProvider("42", "webhook");
    expect(res).toMatchObject({ result: "paid", shouldDeliver: true });

    // 8-11. Entrega
    const d = await delivery.deliverOrder(orderId, "webhook");
    expect(d.status).toBe("delivered");

    // 12. Key disponível (criptografada, marcada como teste)
    const keys = await repo.listOrderKeys(orderId);
    expect(keys).toHaveLength(1);
    expect(keys[0]!.is_test).toBe(true);
    expect(decryptSecret(keys[0]!.encrypted_key)).toMatch(/^TEST-/);

    // 13. E-mails
    expect(sent).toEqual(expect.arrayContaining(["orderCreated", "paymentApproved", "keysDelivered"]));
  });

  it("simula falha do fornecedor e recuperação por reprocessamento", async () => {
    const repo = new MemoryRepository();
    const orderId = await repo.seedPaidOrder();
    const failing = new DeliveryService({ repo, supplier: new SandboxKeySupplier({ failWith: new ShadowKeysError("offline", 503, null, true) }), crypto: testCrypto, notifier: recordingNotifier().notifier });
    expect((await failing.deliverOrder(orderId, "webhook")).status).toBe("retry_scheduled");

    const healthy = new DeliveryService({ repo, supplier: new SandboxKeySupplier(), crypto: testCrypto, notifier: recordingNotifier().notifier });
    expect((await healthy.deliverOrder(orderId, "admin:1")).status).toBe("delivered");
  });
});
