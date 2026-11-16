import type { Order, OrderItem } from "@/types";

/** Notificações de ciclo de vida do pedido (EmailService para o cliente, AdminPushNotifier para o admin). */
export interface Notifier {
  orderCreated(order: Order, items: OrderItem[]): Promise<void>;
  paymentApproved(order: Order): Promise<void>;
  paymentRejected(order: Order, reason: string | null): Promise<void>;
  keysDelivered(order: Order, items: OrderItem[]): Promise<void>;
  orderRefunded(order: Order): Promise<void>;
  /** Opcionais: só interessam ao administrador. */
  pixGenerated?(order: Order): Promise<void>;
  deliveryFailed?(order: Order, reason: string): Promise<void>;
}

/** Repassa cada evento a vários notificadores; a falha de um não impede os outros. */
export function combineNotifiers(...list: Notifier[]): Notifier {
  const all = (fn: (n: Notifier) => Promise<void> | undefined) =>
    Promise.allSettled(list.map((n) => fn(n) ?? Promise.resolve())).then(() => undefined);
  return {
    orderCreated: (o, i) => all((n) => n.orderCreated(o, i)),
    paymentApproved: (o) => all((n) => n.paymentApproved(o)),
    paymentRejected: (o, r) => all((n) => n.paymentRejected(o, r)),
    keysDelivered: (o, i) => all((n) => n.keysDelivered(o, i)),
    orderRefunded: (o) => all((n) => n.orderRefunded(o)),
    pixGenerated: (o) => all((n) => n.pixGenerated?.(o)),
    deliveryFailed: (o, r) => all((n) => n.deliveryFailed?.(o, r)),
  };
}

export const noopNotifier: Notifier = {
  async orderCreated() {},
  async paymentApproved() {},
  async paymentRejected() {},
  async keysDelivered() {},
  async orderRefunded() {},
};
