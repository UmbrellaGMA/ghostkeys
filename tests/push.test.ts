import { describe, expect, it } from "vitest";
import { AdminPushNotifier, pushMessages, type PushMessage } from "@/services/push/AdminPushNotifier";
import { combineNotifiers, noopNotifier, type Notifier } from "@/services/notifier";
import type { Order, OrderItem } from "@/types";

const order = {
  id: "o1",
  order_number: 1042,
  customer_name: "Maria Souza",
  customer_email: "maria@t.local",
  total_cents: 5980,
  payment_method: "pix",
} as Order;
const items = [{ quantity: 2 }] as OrderItem[];

describe("mensagens de push do admin", () => {
  it("formata compra concluída com número do pedido, keys e valor", () => {
    const m = pushMessages.keysDelivered(order, items);
    expect(m.title).toContain("#1042");
    expect(m.body).toContain("2 key(s)");
    expect(m.body).toContain("Maria");
    expect(m.body).toMatch(/R\$\s?59,80/);
    expect(m.url).toBe("/admin/pedidos/o1");
  });

  it("pagamento aprovado indica o meio de pagamento", () => {
    expect(pushMessages.paymentApproved(order).body).toContain("PIX");
    expect(pushMessages.paymentApproved({ ...order, payment_method: "card" }).body).toContain("cartão");
  });
});

describe("AdminPushNotifier", () => {
  it("envia cada evento com a chave certa", async () => {
    const sent: [string, PushMessage][] = [];
    const n = new AdminPushNotifier(async (e, m) => void sent.push([e, m]));
    await n.orderCreated(order, items);
    await n.pixGenerated(order);
    await n.paymentApproved(order);
    await n.keysDelivered(order, items);
    await n.deliveryFailed(order, "sem estoque");
    expect(sent.map(([e]) => e)).toEqual(["order_created", "pix_generated", "payment_approved", "keys_delivered", "delivery_failed"]);
  });

  it("erro no envio não propaga para o fluxo do pedido", async () => {
    const n = new AdminPushNotifier(async () => {
      throw new Error("push fora do ar");
    });
    await expect(n.paymentApproved(order)).resolves.toBeUndefined();
  });
});

describe("combineNotifiers", () => {
  it("entrega a todos mesmo se um falhar e ignora métodos opcionais ausentes", async () => {
    const calls: string[] = [];
    const failing: Notifier = { ...noopNotifier, paymentApproved: async () => Promise.reject(new Error("e-mail falhou")) };
    const recording: Notifier = {
      ...noopNotifier,
      paymentApproved: async () => void calls.push("approved"),
      pixGenerated: async () => void calls.push("pix"),
    };
    const n = combineNotifiers(failing, recording);
    await n.paymentApproved(order);
    await n.pixGenerated!(order);
    expect(calls).toEqual(["approved", "pix"]);
  });
});
