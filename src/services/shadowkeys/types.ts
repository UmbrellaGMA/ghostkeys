/**
 * Tipos da API ShadowKeys v1.
 * Fonte: https://revenda.shadowkeys.com.br/docs (consultada em 16/11/2026).
 * Base URL: https://revenda.shadowkeys.com.br/api/v1 — Autenticação: Authorization: Bearer sk_live_...
 */

/** Item de GET /games */
export interface SKGameSummary {
  appId: string;
  name: string;
  coverUrl: string | null;
  shortDescription: string | null;
  developer: string | null;
  publisher: string | null;
  releaseDate: string | null;
  nsfw: boolean;
  /** Preço do plano atual em centavos; null quando não há plano ativo. */
  priceCents: number | null;
}

/** GET /games */
export interface SKGamesPage {
  games: SKGameSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

/** GET /games/{appId} */
export interface SKGameDetails extends SKGameSummary {
  tags: string[];
}

export type SKCodeLength = 15 | 20 | 25 | "random";

/** POST /keys/generate (body) */
export interface SKGenerateKeysRequest {
  appId?: string;
  appIds?: string[];
  quantity: number;
  codeLength?: SKCodeLength;
  importIfMissing?: boolean;
  accessDurationSeconds?: number;
}

export interface SKGeneratedKey {
  id: string;
  code: string;
  gameIds: string[];
  gameNames: string[];
  isCombo: boolean;
  chargedCents: number;
}

/** POST /keys/generate (resposta) */
export interface SKGenerateKeysResponse {
  generated: number;
  totalCents: number;
  chargedCentsPerKey: number;
  gamesPerKey: number;
  isCombo: boolean;
  imported: Array<{ appId: string; via: string }>;
  keys: SKGeneratedKey[];
}

export type SKKeyStatus = "available" | "redeemed" | "revoked";

/** GET /keys/{code} — apenas os campos usados pela loja */
export interface SKKeyInfo {
  code: string;
  status: SKKeyStatus;
  isCombo: boolean;
  games: Array<{ appId: string; name: string }>;
  chargedCents: number;
  createdAt: string;
  redeemed: null | {
    steamId64: string;
    redeemedAt: string;
  };
  revokedAt: string | null;
}

/** POST /keys/{code}/revoke (resposta) */
export interface SKRevokeResponse {
  ok: boolean;
  keyId: string;
  code: string;
  refundedCents: number;
  revokedApps: Array<{ appId: string; name: string }>;
  remainingApps: Array<{ appId: string; name: string }>;
  keyStatus: SKKeyStatus;
}

/** Erros documentados: corpo com `message` e, quando aplicável, `code`. */
export interface SKErrorBody {
  message?: string;
  code?: string;
  reason?: string;
}
