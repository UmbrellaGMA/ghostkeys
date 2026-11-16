import { randomUUID } from "node:crypto";
import { reaisToCents } from "@/lib/money";
import type { Coupon, Order, Payment, Product, StoreSettings } from "@/types";
import type { OrderDraft, OrderDraftItem, StoreRepository } from "@/services/repository";
import type { Notifier } from "@/services/notifier";
import { comboDiscount, couponDiscount, effectivePrice, type ComboConfig } from "@/services/PricingService";
import type { DeliveryService } from "@/services/DeliveryService";
import { MercadoPagoError, type MPPayment, type MercadoPagoService } from "@/services/mercadopago/MercadoPagoService";

export class CheckoutError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = "CheckoutError";
  }
}

export interface CartLine {
  productId: string;
  quantity: number;
}

/** Monta o rascunho do pedido a partir do banco — NUNCA a partir de preços enviados pelo navegador. */
export function buildOrderDraft(args: {
  user: { id: string; email: string; name: string };
  lines: CartLine[];
  products: Product[];
  settings: Pick<StoreSettings, "max_quantity_per_item" | "default_activation_region" | "pix_expiration_minutes"> & Partial<ComboConfig>;
  coupon: Coupon | null;
  couponCode?: string | null;
  now?: Date;
}): OrderDraft {
  const now = args.now ?? new Date();
  if (!args.lines.length) throw new CheckoutError("Carrinho vazio", "EMPTY_CART");

  // Agrupa linhas repetidas
  const merged = new Map<string, number>();
  for (const l of args.lines) merged.set(l.productId, (merged.get(l.productId) ?? 0) + l.quantity);

  const byId = new Map(args.products.map((p) => [p.id, p]));
  const problems: Array<{ productId: string; reason: string }> = [];
  const items: OrderDraftItem[] = [];

  for (const [productId, quantity] of merged) {
    const p = byId.get(productId);
    if (!p) {
      problems.push({ productId, reason: "Produto não encontrado" });
      continue;
    }
    if (!p.active || !p.available) {
      problems.push({ productId, reason: `"${p.name}" está indisponível no momento` });
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > args.settings.max_quantity_per_item) {
      problems.push({ productId, reason: `Quantidade máxima por jogo: ${args.settings.max_quantity_per_item}` });
      continue;
    }
    if (p.supplier_cost_cents === null) {
      problems.push({ productId, reason: `"${p.name}" está sem preço do fornecedor` });
      continue;
    }
    const unit = effectivePrice(p, now);
    if (unit <= 0 || unit < p.supplier_cost_cents) {
      // Proteção: nunca vender abaixo do custo de aquisição
      problems.push({ productId, reason: `"${p.name}" está temporariamente indisponível (preço em atualização)` });
      continue;
    }
    items.push({
      product_id: p.id,
      product_name: p.name,
      product_slug: p.slug,
      product_image_url: p.image_url,
      supplier_product_id: p.supplier_product_id,
      supplier_cost_cents: p.supplier_cost_cents,
      unit_price_cents: unit,
      quantity,
      platform: p.platform,
      activation_region: p.activation_region ?? args.settings.default_activation_region,
    });
  }

  if (problems.length) throw new CheckoutError("Alguns itens do carrinho precisam de atenção", "CART_INVALID", problems, 409);

  const subtotal = items.reduce((s, i) => s + i.unit_price_cents * i.quantity, 0);

  // Promoção "Leve N, pague N-1": recalculada sempre no servidor
  const combo = comboDiscount(items, {
    combo_enabled: args.settings.combo_enabled ?? false,
    combo_size: args.settings.combo_size ?? 3,
    combo_free: args.settings.combo_free ?? 1,
  });
  // Não deixa o combo vender abaixo do custo total do pedido
  const totalCost = items.reduce((s, i) => s + i.supplier_cost_cents * i.quantity, 0);
  const comboCents = Math.max(0, Math.min(combo, subtotal - totalCost));

  let discount = comboCents;
  let coupon: Coupon | null = null;
  if (args.couponCode) {
    const c = args.coupon;
    if (!c || !c.active) throw new CheckoutError("Cupom inválido", "COUPON_INVALID");
    if (c.expires_at && new Date(c.expires_at) <= now) throw new CheckoutError("Cupom expirado", "COUPON_EXPIRED");
    if (c.max_uses !== null && c.used_count >= c.max_uses) throw new CheckoutError("Cupom esgotado", "COUPON_EXHAUSTED");
    if (subtotal - comboCents < c.min_order_cents) throw new CheckoutError("Valor mínimo do cupom não atingido", "COUPON_MIN_ORDER");
    discount += couponDiscount(subtotal - comboCents, c);
    coupon = c;
  }

  const total = subtotal - discount;
  if (total < 100) throw new CheckoutError("O valor mínimo do pedido é R$ 1,00", "MIN_TOTAL");

  return {
    user_id: args.user.id,
    customer_name: args.user.name,
    customer_email: args.user.email,
    subtotal_cents: subtotal,
    discount_cents: discount,
    combo_discount_cents: comboCents,
    total_cents: total,
    coupon_id: coupon?.id ?? null,
    coupon_code: coupon?.code ?? null,
    expires_at: new Date(now.getTime() + args.settings.pix_expiration_minutes * 60_000).toISOString(),
    items,
  };
}

/** Verificação opcional de preço/disponibilidade ao vivo no fornecedor antes de cobrar. */
export interface SupplierPriceChecker {
  /** Retorna priceCents atual (null = sem plano) ou lança erro 404 se o jogo saiu do catálogo. */
  currentCost(appId: string): Promise<number | null>;
}

export type PaymentUpdateResult =
  | "ignored"
  | "mismatch"
  | "paid"
  | "already_paid"
  | "pending"
  | "rejected"
  | "cancelled"
  | "refunded";

export class OrderService {
  constructor(
    private readonly deps: {
      repo: StoreRepository;
      notifier: Notifier;
      mercadoPago?: MercadoPagoService;
      delivery?: DeliveryService;
      priceChecker?: SupplierPriceChecker;
      calculatePrice?: (costCents: number, settings: StoreSettings) => number;
      notificationUrl?: string;
    },
  ) {}

  private get mp(): MercadoPagoService {
    if (!this.deps.mercadoPago) throw new CheckoutError("Mercado Pago não configurado", "PAYMENT_NOT_CONFIGURED", undefined, 503);
    return this.deps.mercadoPago;
  }

  // ───────────────────────── Criação do pedido ─────────────────────────

  async createOrder(input: { user: { id: string; email: string; name: string }; lines: CartLine[]; couponCode?: string | null }) {
    const { repo } = this.deps;
    const settings = await repo.getSettings();
    const products = await repo.getProductsByIds([...new Set(input.lines.map((l) => l.productId))]);
    const coupon = input.couponCode ? await repo.getCouponByCode(input.couponCode) : null;

    const draft = buildOrderDraft({ user: input.user, lines: input.lines, products, settings, coupon, couponCode: input.couponCode });

    // Revalida o custo diretamente na ShadowKeys (protege contra preço desatualizado)
    if (this.deps.priceChecker) await this.revalidateWithSupplier(draft, products, settings);

    const orderId = await repo.createOrder(draft);
    const order = await repo.getOrder(orderId);
    if (order) {
      const items = await repo.getOrderItems(orderId);
      this.deps.notifier.orderCreated(order, items).catch(() => {});
    }
    return { orderId };
  }

  private async revalidateWithSupplier(draft: OrderDraft, products: Product[], settings: StoreSettings) {
    const changed: Array<{ productId: string; reason: string }> = [];
    for (const item of draft.items) {
      const product = products.find((p) => p.id === item.product_id)!;
      let cost: number | null;
      try {
        cost = await this.deps.priceChecker!.currentCost(item.supplier_product_id);
      } catch (e) {
        if ((e as { status?: number }).status === 404) {
          await this.deps.repo.updateProduct(product.id, { available: false });
          changed.push({ productId: product.id, reason: `"${product.name}" não está mais disponível no fornecedor` });
        }
        // Fornecedor fora do ar: segue com os dados sincronizados (entrega será re-tentada se necessário)
        continue;
      }
      if (cost === null) {
        await this.deps.repo.updateProduct(product.id, { available: false });
        changed.push({ productId: product.id, reason: `"${product.name}" está indisponível no momento` });
        continue;
      }
      if (cost !== product.supplier_cost_cents) {
        const patch: Partial<Product> = { supplier_cost_cents: cost };
        if (product.pricing_mode === "global" && this.deps.calculatePrice) {
          patch.sale_price_cents = this.deps.calculatePrice(cost, settings);
          if (product.promo_price_cents && product.promo_price_cents >= patch.sale_price_cents) patch.promo_price_cents = null;
        }
        await this.deps.repo.updateProduct(product.id, patch);
        if (cost > item.unit_price_cents || (patch.sale_price_cents && patch.sale_price_cents !== product.sale_price_cents)) {
          changed.push({ productId: product.id, reason: `O preço de "${product.name}" foi atualizado. Revise o carrinho.` });
        }
      }
    }
    if (changed.length) throw new CheckoutError("Preços ou disponibilidade foram atualizados", "PRICE_CHANGED", changed, 409);
  }

  // ───────────────────────── Pagamento ─────────────────────────

  private async payableOrder(orderId: string, userId: string): Promise<Order> {
    const order = await this.deps.repo.getOrder(orderId);
    if (!order || order.user_id !== userId) throw new CheckoutError("Pedido não encontrado", "ORDER_NOT_FOUND", undefined, 404);
    if (order.status !== "pending_payment") throw new CheckoutError("Este pedido não aceita pagamento", "ORDER_NOT_PAYABLE", undefined, 409);
    if (order.expires_at && new Date(order.expires_at) < new Date()) {
      throw new CheckoutError("Pedido expirado. Faça um novo pedido.", "ORDER_EXPIRED", undefined, 409);
    }
    const payments = await this.deps.repo.listPayments(orderId);
    if (payments.some((p) => p.status === "approved")) throw new CheckoutError("Pedido já pago", "ALREADY_PAID", undefined, 409);
    return order;
  }

  /** Gera (ou reutiliza) um PIX para o pedido. */
  async createPixPayment(orderId: string, userId: string, cpf?: string | null): Promise<Payment> {
    const { repo } = this.deps;
    const order = await this.payableOrder(orderId, userId);
    const settings = await repo.getSettings();
    if (!settings.pix_enabled) throw new CheckoutError("PIX desativado", "PIX_DISABLED");

    // Reutiliza PIX pendente ainda válido (evita múltiplos QR codes para o mesmo pedido)
    const existing = (await repo.listPayments(orderId)).find(
      (p) => p.payment_method === "pix" && p.status === "pending" && p.pix_qr_code && p.expires_at && new Date(p.expires_at) > new Date(),
    );
    if (existing) return existing;

    const payment = await repo.createPayment({
      order_id: orderId,
      idempotency_key: randomUUID(),
      payment_method: "pix",
      amount_cents: order.total_cents,
    });
    const [firstName, ...rest] = order.customer_name.trim().split(/\s+/);
    try {
      const mp = await this.mp.createPixPayment({
        amountCents: order.total_cents,
        description: `Pedido #${order.order_number}`,
        orderId,
        payer: { email: order.customer_email, firstName, lastName: rest.join(" ") || undefined, cpf },
        expiresAt: new Date(order.expires_at ?? Date.now() + settings.pix_expiration_minutes * 60_000),
        notificationUrl: this.deps.notificationUrl,
        idempotencyKey: payment.idempotency_key,
      });
      const td = mp.point_of_interaction?.transaction_data;
      const patch: Partial<Payment> = {
        external_payment_id: String(mp.id),
        payment_method_id: mp.payment_method_id,
        status: mp.status,
        status_detail: mp.status_detail,
        pix_qr_code: td?.qr_code ?? null,
        pix_qr_code_base64: td?.qr_code_base64 ?? null,
        pix_ticket_url: td?.ticket_url ?? null,
        expires_at: mp.date_of_expiration,
      };
      await repo.updatePayment(payment.id, patch);
      await repo.updateOrder(orderId, { payment_method: "pix" });
      this.deps.notifier.pixGenerated?.({ ...order, payment_method: "pix" }).catch(() => {});
      return { ...payment, ...patch } as Payment;
    } catch (e) {
      await repo.updatePayment(payment.id, { status: "error", status_detail: (e as Error).message.slice(0, 200) });
      throw e instanceof MercadoPagoError ? new CheckoutError("Não foi possível gerar o PIX. Tente novamente.", "MP_ERROR", e.message, 502) : e;
    }
  }

  /** Pagamento com cartão a partir do token do Card Payment Brick. */
  async createCardPayment(
    orderId: string,
    userId: string,
    card: {
      token: string;
      paymentMethodId: string;
      issuerId?: string | number | null;
      installments: number;
      payerEmail: string;
      identificationType?: string;
      identificationNumber?: string;
    },
  ): Promise<{ payment: Payment; result: PaymentUpdateResult; shouldDeliver: boolean }> {
    const { repo } = this.deps;
    const order = await this.payableOrder(orderId, userId);
    const settings = await repo.getSettings();
    if (!settings.card_enabled) throw new CheckoutError("Cartão desativado", "CARD_DISABLED");
    if (card.installments < 1 || card.installments > settings.max_installments) {
      throw new CheckoutError("Número de parcelas inválido", "INVALID_INSTALLMENTS");
    }
    const payment = await repo.createPayment({
      order_id: orderId,
      idempotency_key: randomUUID(),
      payment_method: "card",
      amount_cents: order.total_cents,
    });
    const [firstName, ...rest] = order.customer_name.trim().split(/\s+/);
    let mp: MPPayment;
    try {
      mp = await this.mp.createCardPayment({
        amountCents: order.total_cents, // valor SEMPRE do servidor
        description: `Pedido #${order.order_number}`,
        orderId,
        token: card.token,
        paymentMethodId: card.paymentMethodId,
        issuerId: card.issuerId,
        installments: card.installments,
        payer: {
          email: card.payerEmail || order.customer_email,
          firstName,
          lastName: rest.join(" ") || undefined,
          identificationType: card.identificationType,
          identificationNumber: card.identificationNumber,
        },
        notificationUrl: this.deps.notificationUrl,
        idempotencyKey: payment.idempotency_key,
      });
    } catch (e) {
      await repo.updatePayment(payment.id, { status: "error", status_detail: (e as Error).message.slice(0, 200) });
      throw e instanceof MercadoPagoError ? new CheckoutError("Pagamento não processado. Verifique os dados do cartão.", "MP_ERROR", e.message, 402) : e;
    }
    await repo.updatePayment(payment.id, { external_payment_id: String(mp.id), payment_method_id: mp.payment_method_id, installments: mp.installments });
    await repo.updateOrder(orderId, { payment_method: "card" });
    // A resposta vem diretamente da API do Mercado Pago (servidor-servidor), então é confiável;
    // passa pelo MESMO fluxo idempotente do webhook.
    const { result, shouldDeliver } = await this.applyPaymentUpdate(mp, "payment_api");
    return { payment: { ...payment, external_payment_id: String(mp.id), status: mp.status } as Payment, result, shouldDeliver };
  }

  /** Busca o pagamento no Mercado Pago e aplica (usado pelo webhook e por consultas manuais). */
  async syncPaymentFromProvider(externalPaymentId: string, actor: string) {
    const mp = await this.mp.getPayment(externalPaymentId);
    return this.applyPaymentUpdate(mp, actor);
  }

  /**
   * Aplica o estado de um pagamento obtido DA API do Mercado Pago.
   * Idempotente: pode ser chamado N vezes com o mesmo pagamento.
   */
  async applyPaymentUpdate(mp: MPPayment, actor: string): Promise<{ result: PaymentUpdateResult; orderId?: string; shouldDeliver: boolean }> {
    const { repo, notifier } = this.deps;
    const orderId = mp.external_reference;
    if (!orderId) return { result: "ignored", shouldDeliver: false };

    const order = await repo.getOrder(orderId);
    if (!order) return { result: "ignored", shouldDeliver: false };

    const payment = await repo.findPaymentByExternalId(String(mp.id));
    if (!payment || payment.order_id !== order.id) {
      await repo.addOrderEvent(order.id, `ALERTA: pagamento ${mp.id} não pertence a este pedido — ignorado.`, actor);
      return { result: "ignored", orderId, shouldDeliver: false };
    }

    const previousStatus = payment.status;
    await repo.updatePayment(payment.id, {
      status: mp.status,
      status_detail: mp.status_detail,
      currency: mp.currency_id,
      approved_at: mp.date_approved,
      refunded_amount_cents: reaisToCents(mp.transaction_amount_refunded ?? 0),
    });

    const amountOk = reaisToCents(mp.transaction_amount) === order.total_cents && payment.amount_cents === order.total_cents;
    const currencyOk = mp.currency_id === "BRL";

    switch (mp.status) {
      case "approved": {
        if (!amountOk || !currencyOk) {
          await repo.addOrderEvent(
            order.id,
            `ALERTA: pagamento ${mp.id} aprovado com divergência (valor ${mp.transaction_amount} ${mp.currency_id}, esperado ${order.total_cents / 100} BRL). Entrega bloqueada — revise manualmente.`,
            actor,
          );
          return { result: "mismatch", orderId, shouldDeliver: false };
        }
        const paidNow = await repo.transition(order.id, ["pending_payment", "cancelled"], "paid", `Pagamento ${mp.id} aprovado`, actor);
        if (paidNow) {
          const fresh = await repo.getOrder(order.id);
          if (fresh) notifier.paymentApproved(fresh).catch(() => {});
        }
        const settings = await repo.getSettings();
        const current = await repo.getOrder(order.id);
        const shouldDeliver = settings.auto_delivery_enabled && current?.status === "paid";
        return { result: paidNow ? "paid" : "already_paid", orderId, shouldDeliver };
      }
      case "rejected": {
        if (previousStatus !== "rejected") notifier.paymentRejected(order, mp.status_detail).catch(() => {});
        await repo.addOrderEvent(order.id, `Pagamento ${mp.id} recusado (${mp.status_detail ?? "sem detalhe"})`, actor);
        return { result: "rejected", orderId, shouldDeliver: false };
      }
      case "cancelled": {
        const others = (await repo.listPayments(order.id)).filter((p) => p.id !== payment.id);
        const hasActive = others.some((p) => ["approved", "pending", "in_process", "authorized"].includes(p.status));
        if (!hasActive) await repo.transition(order.id, ["pending_payment"], "cancelled", `Pagamento ${mp.id} cancelado/expirado`, actor);
        return { result: "cancelled", orderId, shouldDeliver: false };
      }
      case "refunded":
      case "charged_back": {
        const refundedNow = await repo.transition(
          order.id,
          ["paid", "processing", "delivered", "delivery_failed"],
          "refunded",
          mp.status === "charged_back" ? `Chargeback do pagamento ${mp.id}` : `Pagamento ${mp.id} estornado`,
          actor,
        );
        if (refundedNow) {
          await this.deps.delivery?.revokeOrderKeys(order.id, actor);
          const fresh = await repo.getOrder(order.id);
          if (fresh) notifier.orderRefunded(fresh).catch(() => {});
        }
        return { result: "refunded", orderId, shouldDeliver: false };
      }
      case "in_mediation":
        await repo.addOrderEvent(order.id, `ALERTA: pagamento ${mp.id} em disputa (mediação).`, actor);
        return { result: "pending", orderId, shouldDeliver: false };
      default:
        return { result: "pending", orderId, shouldDeliver: false };
    }
  }

  // ───────────────────────── Ações administrativas ─────────────────────────

  /** Reembolso total via Mercado Pago. O estado final é confirmado também pelo webhook. */
  async refundOrder(orderId: string, actor: string): Promise<void> {
    const { repo } = this.deps;
    const order = await repo.getOrder(orderId);
    if (!order) throw new CheckoutError("Pedido não encontrado", "ORDER_NOT_FOUND", undefined, 404);
    if (!["paid", "processing", "delivered", "delivery_failed"].includes(order.status)) {
      throw new CheckoutError("Somente pedidos pagos podem ser reembolsados", "NOT_REFUNDABLE", undefined, 409);
    }
    if (order.status === "processing") throw new CheckoutError("Aguarde o fim do processamento da entrega", "BUSY", undefined, 409);
    const approved = (await repo.listPayments(orderId)).find((p) => p.status === "approved" && p.external_payment_id);
    if (!approved) throw new CheckoutError("Pagamento aprovado não encontrado", "NO_APPROVED_PAYMENT", undefined, 409);

    await this.mp.refundPayment(approved.external_payment_id!, `refund-${approved.id}`, undefined, orderId);
    // Confirma o novo estado consultando a API (não confia apenas na resposta do estorno)
    await this.syncPaymentFromProvider(approved.external_payment_id!, actor);
    const after = await repo.getOrder(orderId);
    if (after?.status !== "refunded") {
      await repo.addOrderEvent(orderId, "Estorno solicitado ao Mercado Pago; aguardando confirmação.", actor);
    }
  }

  /** Cancela pedido ainda não pago (cancela PIX pendente no Mercado Pago). */
  async cancelOrder(orderId: string, actor: string): Promise<void> {
    const { repo } = this.deps;
    const order = await repo.getOrder(orderId);
    if (!order) throw new CheckoutError("Pedido não encontrado", "ORDER_NOT_FOUND", undefined, 404);
    if (order.status !== "pending_payment") {
      throw new CheckoutError("Apenas pedidos aguardando pagamento podem ser cancelados. Para pedidos pagos, use o reembolso.", "NOT_CANCELLABLE", undefined, 409);
    }
    for (const p of await repo.listPayments(orderId)) {
      if (!p.external_payment_id) continue;
      // Antes de cancelar, confere se o pagamento não foi aprovado nesse meio tempo
      const fresh = await this.mp.getPayment(p.external_payment_id);
      if (fresh.status === "approved") {
        await this.applyPaymentUpdate(fresh, actor);
        throw new CheckoutError("O pagamento deste pedido acabou de ser aprovado; ele não foi cancelado.", "ALREADY_PAID", undefined, 409);
      }
      if (["pending", "in_process", "authorized"].includes(fresh.status)) {
        await this.mp.cancelPayment(p.external_payment_id, orderId).catch(() => {});
        await repo.updatePayment(p.id, { status: "cancelled" });
      }
    }
    await repo.transition(orderId, ["pending_payment"], "cancelled", "Pedido cancelado", actor);
  }
}
