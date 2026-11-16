import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { OrderService } from "@/services/OrderService";
import { DeliveryService } from "@/services/DeliveryService";
import { MercadoPagoService } from "@/services/mercadopago/MercadoPagoService";
import { MemoryRepository } from "./helpers/memory-repository";
import { FakeSupplier, mockFetch, mpPayment, recordingNotifier, testCrypto } from "./helpers/fakes";

const user = { id: randomUUID(), email: "cliente@example.com", name: "Cliente Teste" };

async function setup() {
  const repo = new MemoryRepository();
  const p = repo.addProduct();
  const { notifier, sent } = recordingNotifier();
  const supplier = new FakeSupplier();
  const delivery = new DeliveryService({ repo, supplier, crypto: testCrypto, notifier });
  const service = new OrderService({ repo, notifier, delivery });
  const { orderId } = await service.createOrder({ user, lines: [{ productId: p.id, quantity: 1 }] });
  const payment = await repo.createPayment({ order_id: orderId, idempotency_key: randomUUID(), payment_method: "pix", amount_cents: 2600 });
  await repo.updatePayment(payment.id, { external_payment_id: "123456789", status: "pending" });
  return { repo, service, delivery, supplier, sent, orderId, paymentId: payment.id };
}

describe("Processamento de pagamentos (webhook → applyPaymentUpdate)", () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  beforeEach(async () => {
    ctx = await setup();
  });

  it("aprovado: marca o pedido como pago e solicita entrega", async () => {
    const r = await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId }), "webhook");
    expect(r).toMatchObject({ result: "paid", shouldDeliver: true });
    expect((await ctx.repo.getOrder(ctx.orderId))!.status).toBe("paid");
    expect(ctx.repo.payments.get(ctx.paymentId)!.status).toBe("approved");
    expect(ctx.sent).toContain("paymentApproved");
  });

  it("webhooks duplicados não geram efeitos duplicados nem compra dupla no fornecedor", async () => {
    const pay = mpPayment({ external_reference: ctx.orderId });
    const results = await Promise.all([1, 2, 3].map(() => ctx.service.applyPaymentUpdate(pay, "webhook")));
    expect(results.filter((r) => r.result === "paid")).toHaveLength(1);
    expect(results.filter((r) => r.result === "already_paid")).toHaveLength(2);

    // Todos pedem entrega, mas o lock garante uma única compra no fornecedor
    const deliveries = await Promise.all(results.filter((r) => r.shouldDeliver).map(() => ctx.delivery.deliverOrder(ctx.orderId, "webhook")));
    expect(deliveries.filter((d) => d.status === "delivered")).toHaveLength(1);
    expect(ctx.supplier.calls).toHaveLength(1);
    expect(ctx.repo.keys).toHaveLength(1);

    // Webhook repetido depois da entrega: nada acontece
    const late = await ctx.service.applyPaymentUpdate(pay, "webhook");
    expect(late).toMatchObject({ result: "already_paid", shouldDeliver: false });
    expect(ctx.sent.filter((s) => s === "paymentApproved")).toHaveLength(1);
  });

  it("bloqueia aprovação com valor divergente", async () => {
    const r = await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId, transaction_amount: 1 }), "webhook");
    expect(r.result).toBe("mismatch");
    expect((await ctx.repo.getOrder(ctx.orderId))!.status).toBe("pending_payment");
  });

  it("bloqueia aprovação em moeda diferente de BRL", async () => {
    const r = await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId, currency_id: "USD" }), "webhook");
    expect(r.result).toBe("mismatch");
  });

  it("ignora pagamento que não pertence ao pedido", async () => {
    const r = await ctx.service.applyPaymentUpdate(mpPayment({ id: 999, external_reference: ctx.orderId }), "webhook");
    expect(r.result).toBe("ignored");
    expect((await ctx.repo.getOrder(ctx.orderId))!.status).toBe("pending_payment");
  });

  it("ignora external_reference de outro pedido", async () => {
    const other = await ctx.repo.seedPaidOrder();
    const r = await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: other }), "webhook");
    expect(r.result).toBe("ignored");
  });

  it("recusado: pedido continua aguardando pagamento (cliente pode tentar de novo)", async () => {
    const r = await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId, status: "rejected", status_detail: "cc_rejected_other_reason" }), "webhook");
    expect(r.result).toBe("rejected");
    expect((await ctx.repo.getOrder(ctx.orderId))!.status).toBe("pending_payment");
    expect(ctx.sent).toContain("paymentRejected");
  });

  it("pendente: nada muda", async () => {
    const r = await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId, status: "pending" }), "webhook");
    expect(r).toMatchObject({ result: "pending", shouldDeliver: false });
  });

  it("cancelado/expirado: cancela o pedido", async () => {
    await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId, status: "cancelled" }), "webhook");
    expect((await ctx.repo.getOrder(ctx.orderId))!.status).toBe("cancelled");
  });

  it("estorno após entrega: pedido reembolsado e keys revogadas", async () => {
    await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId }), "webhook");
    await ctx.delivery.deliverOrder(ctx.orderId, "webhook");
    const r = await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId, status: "refunded", transaction_amount_refunded: 26 }), "webhook");
    expect(r.result).toBe("refunded");
    expect((await ctx.repo.getOrder(ctx.orderId))!.status).toBe("refunded");
    expect(ctx.repo.keys.every((k) => k.delivery_status === "revoked")).toBe(true);
    expect(ctx.supplier.revoked).toHaveLength(1);
    // Estorno duplicado não revoga de novo
    await ctx.service.applyPaymentUpdate(mpPayment({ external_reference: ctx.orderId, status: "refunded" }), "webhook");
    expect(ctx.supplier.revoked).toHaveLength(1);
  });
});

describe("Criação de pagamentos no Mercado Pago", () => {
  it("PIX: envia valor do servidor, external_reference e X-Idempotency-Key; salva QR Code", async () => {
    const repo = new MemoryRepository();
    const p = repo.addProduct();
    const { fetch, requests } = mockFetch([
      {
        status: 201,
        body: {
          id: 555,
          status: "pending",
          status_detail: "pending_waiting_transfer",
          transaction_amount: 26,
          currency_id: "BRL",
          payment_method_id: "pix",
          date_of_expiration: new Date(Date.now() + 1800_000).toISOString(),
          point_of_interaction: { transaction_data: { qr_code: "00020126...", qr_code_base64: "iVBOR...", ticket_url: "https://mp/ticket" } },
        },
      },
    ]);
    const mp = new MercadoPagoService({ accessToken: "TEST-123", fetchImpl: fetch });
    const service = new OrderService({ repo, notifier: recordingNotifier().notifier, mercadoPago: mp, notificationUrl: "https://loja.example/api/webhooks/mercadopago" });
    const { orderId } = await service.createOrder({ user, lines: [{ productId: p.id, quantity: 1 }] });

    const payment = await service.createPixPayment(orderId, user.id);
    expect(payment.pix_qr_code).toBe("00020126...");
    expect(payment.external_payment_id).toBe("555");

    const req = requests[0]!;
    expect(req.url).toBe("https://api.mercadopago.com/v1/payments");
    const headers = req.init.headers as Record<string, string>;
    expect(headers["X-Idempotency-Key"]).toBe(payment.idempotency_key);
    expect(headers.Authorization).toBe("Bearer TEST-123");
    const body = JSON.parse(String(req.init.body));
    expect(body).toMatchObject({ transaction_amount: 26, payment_method_id: "pix", external_reference: orderId });
    expect(body.date_of_expiration).toMatch(/-03:00$/);

    // Reutiliza o PIX pendente em vez de criar outro
    const again = await service.createPixPayment(orderId, user.id);
    expect(again.id).toBe(payment.id);
    expect(requests).toHaveLength(1);
  });

  it("não permite pagar pedido de outro usuário", async () => {
    const repo = new MemoryRepository();
    const p = repo.addProduct();
    const service = new OrderService({ repo, notifier: recordingNotifier().notifier, mercadoPago: new MercadoPagoService({ accessToken: "TEST-1", fetchImpl: mockFetch([]).fetch }) });
    const { orderId } = await service.createOrder({ user, lines: [{ productId: p.id, quantity: 1 }] });
    await expect(service.createPixPayment(orderId, randomUUID())).rejects.toMatchObject({ code: "ORDER_NOT_FOUND" });
  });

  it("Cartão: valor sempre do servidor e aprovação imediata segue o fluxo idempotente", async () => {
    const repo = new MemoryRepository();
    const p = repo.addProduct();
    const { fetch, requests } = mockFetch([]);
    const mp = new MercadoPagoService({ accessToken: "TEST-1", fetchImpl: fetch });
    const service = new OrderService({ repo, notifier: recordingNotifier().notifier, mercadoPago: mp });
    const { orderId } = await service.createOrder({ user, lines: [{ productId: p.id, quantity: 1 }] });
    // resposta do MP configurada após conhecer o orderId
    const { fetch: fetch2, requests: req2 } = mockFetch([
      { status: 201, body: { id: 777, status: "approved", status_detail: "accredited", transaction_amount: 26, currency_id: "BRL", external_reference: orderId, payment_method_id: "visa", installments: 1 } },
    ]);
    (mp as unknown as { fetchImpl: typeof fetch }).fetchImpl = fetch2;

    const r = await service.createCardPayment(orderId, user.id, { token: "tok_abcdefghij", paymentMethodId: "visa", installments: 1, payerEmail: "cliente@example.com" });
    expect(r.result).toBe("paid");
    expect(r.shouldDeliver).toBe(true);
    expect(JSON.parse(String(req2[0]!.init.body)).transaction_amount).toBe(26);
    expect(requests).toHaveLength(0);
  });

  it("Cartão: rejeita parcelas acima do configurado", async () => {
    const repo = new MemoryRepository();
    const p = repo.addProduct();
    const service = new OrderService({ repo, notifier: recordingNotifier().notifier, mercadoPago: new MercadoPagoService({ accessToken: "TEST-1", fetchImpl: mockFetch([]).fetch }) });
    const { orderId } = await service.createOrder({ user, lines: [{ productId: p.id, quantity: 1 }] });
    await expect(service.createCardPayment(orderId, user.id, { token: "tok_abcdefghij", paymentMethodId: "visa", installments: 12, payerEmail: "a@b.com" })).rejects.toMatchObject({
      code: "INVALID_INSTALLMENTS",
    });
  });
});
