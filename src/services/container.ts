import "server-only";
import { appUrl, optionalEnv, requireEnv, shadowKeysMode } from "@/lib/env";
import { decryptSecret, encryptSecret, hashSecret, last4 } from "@/lib/crypto";
import { SupabaseRepository } from "@/services/SupabaseService";
import { ShadowKeysService, SandboxKeySupplier, type KeySupplier } from "@/services/shadowkeys/ShadowKeysService";
import { MercadoPagoService } from "@/services/mercadopago/MercadoPagoService";
import { EmailService } from "@/services/email/EmailService";
import { DeliveryService } from "@/services/DeliveryService";
import { OrderService } from "@/services/OrderService";
import { CatalogSyncService } from "@/services/CatalogSyncService";
import { calculateSalePrice } from "@/services/PricingService";
import { SteamStoreService } from "@/services/steam/SteamStoreService";
import { AdminPushNotifier } from "@/services/push/AdminPushNotifier";
import { combineNotifiers } from "@/services/notifier";

/**
 * Composição dos serviços (injeção de dependências).
 * Tudo aqui roda somente no servidor; as credenciais vêm de variáveis de ambiente.
 */

export function getRepository() {
  return new SupabaseRepository();
}

export function getShadowKeys(repo = getRepository()) {
  return new ShadowKeysService({
    baseUrl: optionalEnv("SHADOWKEYS_API_URL") ?? "https://revenda.shadowkeys.com.br/api/v1",
    token: requireEnv("SHADOWKEYS_API_TOKEN"),
    logger: repo,
  });
}

export function getKeySupplier(repo = getRepository()): KeySupplier {
  return shadowKeysMode() === "sandbox" ? new SandboxKeySupplier() : getShadowKeys(repo);
}

export function getMercadoPago(repo = getRepository()) {
  return new MercadoPagoService({ accessToken: requireEnv("MERCADOPAGO_ACCESS_TOKEN"), logger: repo });
}

export function getEmailService(repo = getRepository()) {
  return new EmailService({
    apiKey: optionalEnv("RESEND_API_KEY"),
    from: optionalEnv("EMAIL_FROM"),
    appUrl: appUrl(),
    getSettings: () => repo.getSettings(),
    logger: repo,
  });
}

/** E-mail para o cliente + push para o app do administrador. */
export function getNotifier(repo = getRepository()) {
  return combineNotifiers(getEmailService(repo), new AdminPushNotifier());
}

export const keyCrypto = {
  encrypt: (s: string) => encryptSecret(s),
  decrypt: (s: string) => decryptSecret(s),
  hash: (s: string) => hashSecret(s),
  last4,
};

export function getDeliveryService(repo = getRepository()) {
  return new DeliveryService({ repo, supplier: getKeySupplier(repo), crypto: keyCrypto, notifier: getNotifier(repo) });
}

/** URL pública do webhook. O Mercado Pago não aceita localhost: nesse caso o webhook é configurado no painel. */
function notificationUrl(): string | undefined {
  const url = appUrl();
  return url.startsWith("https://") ? `${url}/api/webhooks/mercadopago` : undefined;
}

export function getOrderService(opts: { withPayments?: boolean; withSupplierCheck?: boolean } = {}) {
  const repo = getRepository();
  const hasSK = Boolean(optionalEnv("SHADOWKEYS_API_TOKEN"));
  const sk = hasSK ? getShadowKeys(repo) : null;
  return new OrderService({
    repo,
    notifier: getNotifier(repo),
    mercadoPago: opts.withPayments !== false && optionalEnv("MERCADOPAGO_ACCESS_TOKEN") ? getMercadoPago(repo) : undefined,
    delivery: hasSK || shadowKeysMode() === "sandbox" ? getDeliveryService(repo) : undefined,
    priceChecker:
      opts.withSupplierCheck && sk
        ? {
            currentCost: async (appId) => {
              const g = await sk.getGame(appId);
              return g.priceCents;
            },
          }
        : undefined,
    calculatePrice: (cost, settings) => calculateSalePrice(cost, settings),
    notificationUrl: notificationUrl(),
  });
}

export function getCatalogSync() {
  const repo = getRepository();
  return new CatalogSyncService(
    repo.client,
    optionalEnv("SHADOWKEYS_API_TOKEN") ? getShadowKeys(repo) : null,
    new SteamStoreService({ logger: repo }),
  );
}
