import "server-only";
import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { CheckoutError } from "@/services/OrderService";
import { AuthorizationError } from "@/lib/auth";
import { MissingConfigError } from "@/lib/env";
import { rateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/utils";

export function jsonError(status: number, message: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: { "Cache-Control": "no-store" } });
}

export function handleApiError(e: unknown) {
  if (e instanceof ZodError) {
    return jsonError(422, e.issues[0]?.message ?? "Dados inválidos", { issues: e.issues.map((i) => ({ path: i.path, message: i.message })) });
  }
  if (e instanceof CheckoutError) return jsonError(e.httpStatus, e.message, { code: e.code, details: e.details });
  if (e instanceof AuthorizationError) return jsonError(403, e.message);
  if (e instanceof MissingConfigError) {
    console.error(e.message);
    return jsonError(503, "Serviço temporariamente indisponível (configuração pendente).", { code: "NOT_CONFIGURED" });
  }
  console.error("[api] erro inesperado", e);
  return jsonError(500, "Erro interno. Tente novamente em instantes.");
}

/** Aplica rate limit por IP (+ chave opcional). Retorna uma resposta 429 se excedido. */
export async function enforceRateLimit(req: Request, bucket: string, limit: number, windowSeconds: number, extraKey = "") {
  const ip = getClientIp(req.headers);
  const ok = await rateLimit(`${bucket}:${ip}:${extraKey}`, limit, windowSeconds);
  return ok ? null : jsonError(429, "Muitas requisições. Aguarde alguns instantes.");
}

/**
 * Proteção CSRF para rotas que alteram dados com cookie de sessão: exige JSON e mesma origem.
 * Retorna uma resposta 403 se a requisição vier de outro site.
 */
export function rejectCrossSite(req: Request) {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) return jsonError(415, "Formato inválido.");
  const origin = req.headers.get("origin");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  if (origin && host) {
    let same = false;
    try {
      same = new URL(origin).host === host;
    } catch {}
    if (!same) return jsonError(403, "Origem não permitida.");
  }
  return null;
}
