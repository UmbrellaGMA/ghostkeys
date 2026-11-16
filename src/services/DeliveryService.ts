import type { StoreRepository } from "@/services/repository";
import type { Notifier } from "@/services/notifier";
import { ShadowKeysError, type KeySupplier } from "@/services/shadowkeys/ShadowKeysService";
import type { SKCodeLength } from "@/services/shadowkeys/types";

export interface KeyCrypto {
  encrypt(plain: string): string;
  decrypt(payload: string): string;
  hash(plain: string): string;
  last4(plain: string): string;
}

export type DeliveryResult =
  | { status: "delivered"; keysGenerated: number }
  | { status: "skipped"; reason: string }
  | { status: "retry_scheduled"; error: string; nextAttemptAt: string }
  | { status: "failed"; error: string };

/**
 * Entrega automática das keys.
 *
 * Garantias:
 *  1. Só entrega pedidos em 'paid'/'delivery_failed' (status alcançado apenas após pagamento
 *     aprovado e validado pela API do Mercado Pago).
 *  2. claim_order_for_delivery() faz um lock atômico no banco: webhooks/tentativas concorrentes
 *     não processam o mesmo pedido em paralelo — logo não há compra duplicada no fornecedor.
 *  3. Para cada item, só gera a quantidade FALTANTE (quantidade − keys já salvas). Reprocessar um
 *     pedido parcialmente entregue nunca gera keys a mais.
 *  4. digital_keys.key_hash e supplier_key_id são UNIQUE e um trigger impede mais keys do que a
 *     quantidade comprada — a mesma key nunca é entregue duas vezes.
 *  5. Falha temporária do fornecedor => pedido volta para 'paid' com nova tentativa agendada.
 *     Falha definitiva (ou excesso de tentativas) => 'delivery_failed' (reprocessar ou reembolsar).
 */
export class DeliveryService {
  constructor(
    private readonly deps: {
      repo: StoreRepository;
      supplier: KeySupplier;
      crypto: KeyCrypto;
      notifier: Notifier;
      now?: () => Date;
    },
  ) {}

  private now() {
    return this.deps.now?.() ?? new Date();
  }

  async deliverOrder(orderId: string, triggeredBy: string): Promise<DeliveryResult> {
    const { repo, supplier, crypto, notifier } = this.deps;

    const attemptId = await repo.claimOrderForDelivery(orderId, triggeredBy);
    if (!attemptId) return { status: "skipped", reason: "Pedido não está apto para entrega ou já está sendo processado." };

    const settings = await repo.getSettings();
    let generated = 0;

    try {
      const items = await repo.getOrderItems(orderId);
      if (!items.length) throw new DeliveryError("Pedido sem itens", "NO_ITEMS", false);

      for (const item of items) {
        const missing = item.quantity - item.delivered_count;
        if (missing <= 0) continue;

        const codeLength: SKCodeLength =
          settings.key_code_length === "random" ? "random" : (Number(settings.key_code_length) as 15 | 20 | 25);

        const res = await supplier.generateKeys({
          appId: item.supplier_product_id,
          quantity: missing,
          codeLength,
          orderId,
        });

        for (const key of res.keys ?? []) {
          if (!key?.code) continue;
          const result = await repo.insertDigitalKey({
            order_item_id: item.id,
            supplier_key_id: key.id ?? null,
            encrypted_key: crypto.encrypt(key.code),
            key_hash: crypto.hash(key.code),
            key_last4: crypto.last4(key.code),
            is_test: supplier.isSandbox,
          });
          if (result === "inserted") {
            generated++;
          } else {
            await repo.addOrderEvent(
              orderId,
              `Key ignorada (${result === "duplicate" ? "duplicada" : "quantidade já atingida"}) — id fornecedor ${key.id}`,
              "system",
            );
          }
        }

        if ((res.keys?.length ?? 0) < missing) {
          throw new DeliveryError(
            `Fornecedor retornou ${res.keys?.length ?? 0} de ${missing} key(s) para "${item.product_name}"`,
            "PARTIAL_RESPONSE",
            true,
          );
        }
      }

      // Confere no banco que TODOS os itens estão completos antes de marcar como entregue
      const after = await repo.getOrderItems(orderId);
      const incomplete = after.filter((i) => i.delivered_count < i.quantity);
      if (incomplete.length) {
        throw new DeliveryError(`${incomplete.length} item(ns) ainda sem key`, "INCOMPLETE", true);
      }

      await repo.transition(orderId, ["processing"], "delivered", `Entrega concluída (${generated} key(s) nesta tentativa)`, triggeredBy);
      await repo.updateOrder(orderId, { last_delivery_error: null, next_delivery_attempt_at: null });
      await repo.finishDeliveryAttempt(attemptId, { status: "success", keys_generated: generated });

      const order = await repo.getOrder(orderId);
      if (order) await notifier.keysDelivered(order, after).catch(() => {});
      return { status: "delivered", keysGenerated: generated };
    } catch (e) {
      const { message, code, retryable } = classify(e);
      const order = await repo.getOrder(orderId);
      const attempts = order?.delivery_attempts ?? 1;
      const canRetry = retryable && attempts < settings.delivery_max_attempts;

      await repo.finishDeliveryAttempt(attemptId, {
        status: generated > 0 ? "partial" : "failed",
        keys_generated: generated,
        error_code: code,
        error_message: message,
      });

      if (canRetry) {
        // Backoff exponencial: 2, 4, 8, 16... minutos (máx. 60)
        const minutes = Math.min(60, 2 ** attempts);
        const next = new Date(this.now().getTime() + minutes * 60_000).toISOString();
        await repo.transition(orderId, ["processing"], "paid", `Falha temporária na entrega: ${message}. Nova tentativa agendada.`, triggeredBy);
        await repo.updateOrder(orderId, { last_delivery_error: message, next_delivery_attempt_at: next });
        return { status: "retry_scheduled", error: message, nextAttemptAt: next };
      }

      await repo.transition(orderId, ["processing"], "delivery_failed", `Falha na entrega: ${message}`, triggeredBy);
      await repo.updateOrder(orderId, { last_delivery_error: message, next_delivery_attempt_at: null });
      if (order) await notifier.deliveryFailed?.(order, message).catch(() => {});
      return { status: "failed", error: message };
    }
  }

  /**
   * Desativa as keys de um pedido reembolsado.
   * A API ShadowKeys só revoga keys já RESGATADAS (status "redeemed"); keys ainda não resgatadas
   * não podem ser revogadas via API — nesses casos registramos um alerta para ação manual no painel do fornecedor.
   */
  async revokeOrderKeys(orderId: string, actor: string): Promise<{ revoked: number; manual: number }> {
    const { repo, supplier, crypto } = this.deps;
    const keys = await repo.listOrderKeys(orderId);
    let revoked = 0;
    let manual = 0;
    for (const k of keys) {
      if (k.delivery_status === "revoked") continue;
      await repo.markKeyRevoked(k.id); // nunca mais será exibida ao cliente
      try {
        await supplier.revokeKey(crypto.decrypt(k.encrypted_key), { orderId });
        revoked++;
      } catch (e) {
        manual++;
        const msg = e instanceof ShadowKeysError ? e.friendly : (e as Error).message;
        await repo.addOrderEvent(
          orderId,
          `Key ••••${k.supplier_key_id?.slice(-4) ?? ""} não revogada automaticamente (${msg}). Se ainda não foi resgatada, revogue/bloqueie manualmente no painel ShadowKeys.`,
          actor,
        );
      }
    }
    return { revoked, manual };
  }
}

export class DeliveryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "DeliveryError";
  }
}

function classify(e: unknown): { message: string; code: string; retryable: boolean } {
  if (e instanceof ShadowKeysError) {
    return { message: e.friendly, code: e.code ?? `HTTP_${e.status ?? "NETWORK"}`, retryable: e.retryable };
  }
  if (e instanceof DeliveryError) return { message: e.message, code: e.code, retryable: e.retryable };
  // Erros inesperados (ex.: banco indisponível) são tratados como temporários
  return { message: (e as Error)?.message ?? "Erro desconhecido", code: "UNEXPECTED", retryable: true };
}
