import { randomBytes, randomUUID } from "node:crypto";
import type {
  SKCodeLength,
  SKErrorBody,
  SKGameDetails,
  SKGamesPage,
  SKGenerateKeysRequest,
  SKGenerateKeysResponse,
  SKKeyInfo,
  SKRevokeResponse,
} from "./types";

/**
 * Cliente da API ShadowKeys v1 — implementado estritamente conforme a documentação oficial
 * (https://revenda.shadowkeys.com.br/docs). Endpoints usados:
 *   GET  /games?search=&page=         catálogo (50 por página)
 *   GET  /games/{appId}               detalhes + tags + preço do plano
 *   POST /keys/generate               gera keys (saldo é cobrado na ATIVAÇÃO pelo cliente)
 *   GET  /keys/{code}                 status da key
 *   POST /keys/{code}/revoke          revoga key resgatada (estorna saldo)
 *
 * A API NÃO documenta: endpoint de saldo, estoque, webhooks ou cabeçalho de idempotência.
 * Por isso a idempotência de entrega é garantida pelo nosso banco (ver DeliveryService).
 */

export interface ApiLogEntry {
  provider: string;
  operation: string;
  request_status: "success" | "error";
  http_status?: number | null;
  duration_ms?: number;
  order_id?: string | null;
  response_summary?: string | null;
}

export interface ApiLogger {
  log(entry: ApiLogEntry): Promise<void> | void;
}

export class ShadowKeysError extends Error {
  constructor(
    message: string,
    public readonly status: number | null,
    public readonly code: string | null,
    /** true quando faz sentido tentar novamente mais tarde (rede, 5xx, 503). */
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "ShadowKeysError";
  }

  /** Mensagem amigável para o painel, com base nos códigos documentados. */
  get friendly(): string {
    switch (this.status) {
      case 401:
        return "Token da ShadowKeys ausente, inválido ou revogado.";
      case 402:
        return "Saldo insuficiente na conta de revendedor ShadowKeys.";
      case 403:
        return "Plano inativo, combo não permitido ou revogação bloqueada na ShadowKeys.";
      case 404:
        return "Jogo ou key não encontrado na ShadowKeys.";
      case 409:
        return "Conflito: a key já foi processada.";
      case 503:
        return "ShadowKeys temporariamente indisponível.";
      default:
        return this.message;
    }
  }
}

/** Contrato usado pela entrega automática (permite sandbox e testes). */
export interface KeySupplier {
  readonly isSandbox: boolean;
  generateKeys(input: { appId: string; quantity: number; codeLength?: SKCodeLength; orderId?: string }): Promise<SKGenerateKeysResponse>;
  revokeKey(code: string, opts?: { orderId?: string }): Promise<SKRevokeResponse>;
}

export interface ShadowKeysOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  logger?: ApiLogger;
  timeoutMs?: number;
}

export class ShadowKeysService implements KeySupplier {
  readonly isSandbox = false;
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly logger?: ApiLogger;
  private readonly timeoutMs: number;

  constructor(opts: ShadowKeysOptions) {
    if (!opts.baseUrl) throw new Error("SHADOWKEYS_API_URL não configurada");
    if (!opts.token) throw new Error("SHADOWKEYS_API_TOKEN não configurado");
    this.baseUrl = opts.baseUrl.replace(/\/$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.logger = opts.logger;
    this.timeoutMs = opts.timeoutMs ?? 20000;
  }

  // ───────────── Catálogo ─────────────

  listGames(params: { page?: number; search?: string } = {}): Promise<SKGamesPage> {
    const qs = new URLSearchParams();
    if (params.page) qs.set("page", String(params.page));
    if (params.search) qs.set("search", params.search);
    const suffix = qs.toString() ? `?${qs}` : "";
    return this.request<SKGamesPage>("GET", `/games${suffix}`, "games.list");
  }

  /** Percorre todas as páginas do catálogo. */
  async listAllGames(onPage?: (page: number, totalPages: number) => void): Promise<SKGamesPage["games"]> {
    const first = await this.listGames({ page: 1 });
    const all = [...first.games];
    onPage?.(1, first.totalPages);
    for (let page = 2; page <= first.totalPages; page++) {
      const res = await this.listGames({ page });
      all.push(...res.games);
      onPage?.(page, first.totalPages);
    }
    return all;
  }

  getGame(appId: string): Promise<SKGameDetails> {
    return this.request<SKGameDetails>("GET", `/games/${encodeURIComponent(appId)}`, "games.get");
  }

  // ───────────── Keys ─────────────

  generateKeys(input: { appId: string; quantity: number; codeLength?: SKCodeLength; orderId?: string }): Promise<SKGenerateKeysResponse> {
    if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > 100) {
      throw new ShadowKeysError("quantity deve estar entre 1 e 100", null, "INVALID_QUANTITY", false);
    }
    const body: SKGenerateKeysRequest = {
      appId: input.appId,
      quantity: input.quantity,
      codeLength: input.codeLength ?? 20,
      importIfMissing: false, // nunca importar jogos automaticamente durante uma venda
    };
    // Sem retry automático aqui: uma nova tentativa é decidida pelo DeliveryService.
    return this.request<SKGenerateKeysResponse>("POST", "/keys/generate", "keys.generate", body, input.orderId, { retry: false });
  }

  getKey(code: string): Promise<SKKeyInfo> {
    return this.request<SKKeyInfo>("GET", `/keys/${encodeURIComponent(code)}`, "keys.get");
  }

  revokeKey(code: string, opts: { appId?: string; orderId?: string } = {}): Promise<SKRevokeResponse> {
    return this.request<SKRevokeResponse>(
      "POST",
      `/keys/${encodeURIComponent(code)}/revoke`,
      "keys.revoke",
      opts.appId ? { appId: opts.appId } : {},
      opts.orderId,
      { retry: false },
    );
  }

  // ───────────── HTTP ─────────────

  private async request<T>(
    method: "GET" | "POST",
    path: string,
    operation: string,
    body?: unknown,
    orderId?: string,
    { retry = true }: { retry?: boolean } = {},
  ): Promise<T> {
    const maxAttempts = retry ? 3 : 1;
    let lastError: ShadowKeysError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
          method,
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
            ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
          },
          body: method === "POST" ? JSON.stringify(body ?? {}) : undefined,
          signal: controller.signal,
          cache: "no-store",
        });
        const text = await res.text();
        const json = text ? safeJson(text) : null;

        if (!res.ok) {
          const err = json as SKErrorBody | null;
          const retryable = res.status >= 500 || res.status === 429;
          lastError = new ShadowKeysError(err?.message ?? `HTTP ${res.status}`, res.status, err?.code ?? null, retryable);
          await this.log(operation, "error", res.status, started, orderId, `${err?.code ?? ""} ${err?.message ?? ""}`.trim());
          if (retryable && attempt < maxAttempts) {
            await wait(attempt * 750);
            continue;
          }
          throw lastError;
        }

        await this.log(operation, "success", res.status, started, orderId, summarize(operation, json));
        return json as T;
      } catch (e) {
        if (e instanceof ShadowKeysError) throw e;
        const aborted = (e as Error)?.name === "AbortError";
        lastError = new ShadowKeysError(
          aborted ? "Tempo limite excedido ao contatar a ShadowKeys" : `Falha de rede: ${(e as Error)?.message}`,
          null,
          aborted ? "TIMEOUT" : "NETWORK_ERROR",
          true,
        );
        await this.log(operation, "error", null, started, orderId, lastError.message);
        if (attempt < maxAttempts) {
          await wait(attempt * 750);
          continue;
        }
        throw lastError;
      } finally {
        clearTimeout(timer);
      }
    }
    throw lastError ?? new ShadowKeysError("Erro desconhecido", null, null, true);
  }

  private async log(operation: string, status: "success" | "error", http: number | null, started: number, orderId?: string, summary?: string) {
    try {
      await this.logger?.log({
        provider: "shadowkeys",
        operation,
        request_status: status,
        http_status: http,
        duration_ms: Date.now() - started,
        order_id: orderId ?? null,
        response_summary: summary ?? null,
      });
    } catch {
      /* logging nunca deve derrubar a operação */
    }
  }
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text.slice(0, 300) };
  }
}

function wait(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Resumo para log — NUNCA inclui o código das keys. */
function summarize(operation: string, json: unknown): string {
  const j = json as Record<string, unknown> | null;
  if (!j) return "";
  switch (operation) {
    case "games.list":
      return `page=${j.page} total=${j.total} totalPages=${j.totalPages}`;
    case "games.get":
      return `appId=${j.appId} priceCents=${j.priceCents}`;
    case "keys.generate":
      return `generated=${j.generated} totalCents=${j.totalCents} keyIds=${((j.keys as Array<{ id: string }>) ?? []).map((k) => k.id).join(",")}`;
    case "keys.get":
      return `status=${j.status}`;
    case "keys.revoke":
      return `ok=${j.ok} keyStatus=${j.keyStatus} refundedCents=${j.refundedCents}`;
    default:
      return "";
  }
}

/**
 * Fornecedor de TESTE: gera keys fictícias marcadas com prefixo "TEST-" para simular
 * a entrega ponta a ponta sem consumir keys reais. Bloqueado em produção (ver env.shadowKeysMode).
 */
export class SandboxKeySupplier implements KeySupplier {
  readonly isSandbox = true;
  constructor(private readonly opts: { failWith?: ShadowKeysError } = {}) {}

  async generateKeys(input: { appId: string; quantity: number }): Promise<SKGenerateKeysResponse> {
    if (this.opts.failWith) throw this.opts.failWith;
    const keys = Array.from({ length: input.quantity }, () => {
      const parts = Array.from({ length: 3 }, () => randomBytes(3).toString("hex").toUpperCase().slice(0, 5));
      return {
        id: `sandbox_${randomUUID()}`,
        code: `TEST-${parts.join("-")}`,
        gameIds: [input.appId],
        gameNames: [`Sandbox ${input.appId}`],
        isCombo: false,
        chargedCents: 0,
      };
    });
    return { generated: keys.length, totalCents: 0, chargedCentsPerKey: 0, gamesPerKey: 1, isCombo: false, imported: [], keys };
  }

  async revokeKey(code: string): Promise<SKRevokeResponse> {
    return { ok: true, keyId: "sandbox", code, refundedCents: 0, revokedApps: [], remainingApps: [], keyStatus: "revoked" };
  }
}
