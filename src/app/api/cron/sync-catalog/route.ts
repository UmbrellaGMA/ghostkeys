import { NextResponse } from "next/server";
import { isCronAuthorized } from "../_auth";
import { getCatalogSync } from "@/services/container";

export const maxDuration = 300;

/**
 * Atualização agendada (recomendado: a cada 10 minutos) dos jogos JÁ IMPORTADOS:
 * custo, disponibilidade e categorias. Nunca adiciona jogos novos — a escolha é do admin.
 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const r = await getCatalogSync().refreshImported({ timeBudgetMs: 240_000 });
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
