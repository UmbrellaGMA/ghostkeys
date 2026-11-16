import type { Order, OrderItem } from "@/types";

/** Notificações de ciclo de vida do pedido (implementado pelo EmailService). */
export interface Notifier {
  orderCreated(order: Order, items: OrderItem[]): Promise<void>;
  paymentApproved(order: Order): Promise<void>;
  paymentRejected(order: Order, reason: string | null): Promise<void>;
  keysDelivered(order: Order, items: OrderItem[]): Promise<void>;
  orderRefunded(order: Order): Promise<void>;
}

export const noopNotifier: Notifier = {
  async orderCreated() {},
  async paymentApproved() {},
  async paymentRejected() {},
  async keysDelivered() {},
  async orderRefunded() {},
};
