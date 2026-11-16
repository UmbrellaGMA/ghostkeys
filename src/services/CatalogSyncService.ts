import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { slugify } from "@/lib/utils";
import { parseReleaseDate } from "@/lib/dates";
import { parseBRLInput } from "@/lib/money";
import type { Category } from "@/types";
import { ShadowKeysError, type ShadowKeysService } from "@/services/shadowkeys/ShadowKeysService";
import type { SKGameSummary } from "@/services/shadowkeys/types";
import { isReplaceableImage, type SteamStoreService } from "@/services/steam/SteamStoreService";

export type ImportLineResult =
  | { line: string; status: "imported" | "updated"; appId: string; name: string; slug: string; priceCents: number | null }
  | { line: string; status: "not_found" | "error"; message: string }
  | { line: string; status: "ambiguous"; candidates: Array<{ appId: string; name: string }> };

/**
 * Catálogo CURADO: o admin escolhe quais jogos da ShadowKeys entram na loja.
 *  - importLines(): recebe linhas "Nome do jogo" ou "AppID", opcionalmente "; 29,90" com o preço,
 *    localiza cada jogo na ShadowKeys (GET /games?search= ou GET /games/{appId}) e importa.
 *  - refreshImported(): atualiza custo/disponibilidade/tags APENAS dos jogos já importados
 *    (GET /games/{appId}), em rodízio, sem nunca adicionar jogos novos.
 */
export class CatalogSyncService {
  constructor(
    private readonly db: SupabaseClient,
    private readonly skClient: ShadowKeysService | null,
    private readonly steam: SteamStoreService | null = null,
  ) {}

  /**
   * Completa o produto com dados oficiais da Steam: capa e fundo (substitui só imagens da Steam,
   * nunca uploads do admin), descrição em português (só se o texto ainda for o do fornecedor) e
   * gêneros em português (somados às tags para categorizar).
   */
  async enrichFromSteam(productId: string): Promise<"updated" | "no_data" | "skipped"> {
    if (!this.steam) return "skipped";
    const { data: p } = await this.db
      .from("products")
      .select("id, supplier_product_id, image_url, background_url, description, short_description, tags")
      .eq("id", productId)
      .single();
    if (!p) return "skipped";
    const media = await this.steam.getAppMedia(p.supplier_product_id);
    if (!media) return "no_data";

    const patch: Record<string, unknown> = {};
    if (media.headerImage && isReplaceableImage(p.image_url)) patch.image_url = media.headerImage;
    if (media.backgroundImage && isReplaceableImage(p.background_url)) patch.background_url = media.backgroundImage;
    const untouched = !p.description || p.description === p.short_description;
    if (media.shortDescription && untouched) {
      patch.short_description = media.shortDescription.slice(0, 600);
      patch.description = media.shortDescription;
    }
    if (Object.keys(patch).length) await this.db.from("products").update(patch).eq("id", p.id);

    if (media.genres.length) {
      const tags = [...new Set([...(p.tags ?? []), ...media.genres])];
      await this.db.rpc("apply_product_tags", { p_product_id: p.id, p_tags: tags });
    }
    return "updated";
  }

  /** Atualiza capas/descrições de todos os jogos (ou só os sem imagem válida) até o tempo-limite. */
  async enrichAllFromSteam(opts: { timeBudgetMs: number }): Promise<{ updated: number; noData: number; total: number }> {
    const deadline = Date.now() + opts.timeBudgetMs;
    const { data: rows } = await this.db.from("products").select("id").order("created_at", { ascending: false });
    let updated = 0;
    let noData = 0;
    for (const r of rows ?? []) {
      if (Date.now() > deadline) break;
      const res = await this.enrichFromSteam(r.id);
      if (res === "updated") updated++;
      if (res === "no_data") noData++;
    }
    return { updated, noData, total: rows?.length ?? 0 };
  }

  private get sk(): ShadowKeysService {
    if (!this.skClient) throw new Error("ShadowKeys não configurada (SHADOWKEYS_API_TOKEN ausente).");
    return this.skClient;
  }

  /** Busca no catálogo do fornecedor (para a tela de importação). */
  async searchSupplier(query: string) {
    const res = await this.sk.listGames({ search: query.trim().slice(0, 80) });
    const { data: existing } = await this.db.from("products").select("supplier_product_id").in("supplier_product_id", res.games.map((g) => g.appId));
    const imported = new Set((existing ?? []).map((e) => e.supplier_product_id));
    return res.games.slice(0, 30).map((g) => ({ ...g, imported: imported.has(g.appId) }));
  }

  async importLines(lines: string[]): Promise<ImportLineResult[]> {
    const out: ImportLineResult[] = [];
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      try {
        out.push(await this.importLine(line));
      } catch (e) {
        if (e instanceof ShadowKeysError && (e.status === 401 || e.status === 403)) throw new Error(e.friendly);
        out.push({ line, status: "error", message: e instanceof ShadowKeysError ? e.friendly : (e as Error).message });
      }
    }
    return out;
  }

  private async importLine(line: string): Promise<ImportLineResult> {
    const { query, priceCents } = parseImportLine(line);
    let game: SKGameSummary | null = null;

    if (/^\d{2,10}$/.test(query)) {
      try {
        game = await this.sk.getGame(query);
      } catch (e) {
        if (e instanceof ShadowKeysError && e.status === 404) return { line, status: "not_found", message: `AppID ${query} não existe no catálogo ShadowKeys` };
        throw e;
      }
    } else {
      // Tenta o nome original e, se nada for encontrado, variações simplificadas
      let games: SKGameSummary[] = [];
      for (const q of searchVariants(query)) {
        games = (await this.sk.listGames({ search: q })).games;
        if (games.length) break;
      }
      const pick = pickBestMatch(query, games);
      if (pick.kind === "none") return { line, status: "not_found", message: `"${query}" não encontrado na ShadowKeys` };
      if (pick.kind === "ambiguous") return { line, status: "ambiguous", candidates: pick.candidates.map((g) => ({ appId: g.appId, name: g.name })) };
      game = pick.game;
    }

    if (game.priceCents === null || game.priceCents === undefined) {
      return { line, status: "error", message: `"${game.name}" está sem preço no seu plano ShadowKeys (plano inativo?)` };
    }

    const { data: before } = await this.db.from("products").select("id").eq("supplier_product_id", game.appId).maybeSingle();
    const { error } = await this.db.rpc("sync_upsert_products", { p_games: withSlugs([game]) });
    if (error) throw error;

    const { data: product } = await this.db.from("products").select("id, slug").eq("supplier_product_id", game.appId).single();
    // Garante que o jogo esteja visível (se tinha sido desativado antes) e aplica o preço informado
    const patch: Record<string, unknown> = { active: true };
    if (priceCents) Object.assign(patch, { pricing_mode: "custom", custom_price_cents: priceCents, sale_price_cents: priceCents, promo_price_cents: null });
    await this.db.from("products").update(patch).eq("id", product!.id);

    // Tags/categorias: GET /games/{appId} (quando o jogo veio da busca, ainda não temos as tags)
    try {
      const details = "tags" in game ? (game as SKGameSummary & { tags: string[] }) : await this.sk.getGame(game.appId);
      await this.db.rpc("apply_product_tags", { p_product_id: product!.id, p_tags: details.tags ?? [] });
    } catch {
      /* categorização será feita depois pelo refresh */
    }
    // Capa/fundo corretos, descrição e gêneros em português (Steam)
    await this.enrichFromSteam(product!.id).catch(() => null);

    return { line, status: before ? "updated" : "imported", appId: game.appId, name: game.name, slug: product!.slug, priceCents };
  }

  /** Atualiza os jogos importados (mais antigos primeiro) até esgotar o tempo. */
  async refreshImported(opts: { timeBudgetMs: number; limit?: number }): Promise<{ refreshed: number; unavailable: number; total: number }> {
    void this.sk;
    const deadline = Date.now() + opts.timeBudgetMs;
    const { data: rows, count } = await this.db
      .from("products")
      .select("id, supplier_product_id, details_synced_at", { count: "exact" })
      .eq("supplier", "shadowkeys")
      .order("supplier_synced_at", { ascending: true, nullsFirst: true })
      .limit(opts.limit ?? 500);

    let refreshed = 0;
    let unavailable = 0;
    for (const p of rows ?? []) {
      if (Date.now() > deadline) break;
      try {
        const g = await this.sk.getGame(p.supplier_product_id);
        await this.db.rpc("refresh_product_from_supplier", { p_app_id: p.supplier_product_id, p_price: g.priceCents, p_available: g.priceCents !== null });
        if (!p.details_synced_at) await this.db.rpc("apply_product_tags", { p_product_id: p.id, p_tags: g.tags ?? [] });
        if (g.priceCents === null) unavailable++;
        refreshed++;
      } catch (e) {
        if (e instanceof ShadowKeysError && e.status === 404) {
          // saiu do catálogo do fornecedor
          await this.db.rpc("refresh_product_from_supplier", { p_app_id: p.supplier_product_id, p_price: null, p_available: false });
          unavailable++;
          refreshed++;
        } else if (e instanceof ShadowKeysError && (e.status === 401 || e.status === 403)) {
          throw new Error(e.friendly);
        }
        // erros temporários: tenta na próxima execução
      }
    }
    await this.db.from("sync_runs").insert({
      triggered_by: "refresh",
      status: "success",
      stats: { totalSupplier: count ?? 0, created: 0, updated: refreshed, deactivated: unavailable, errors: [] },
      finished_at: new Date().toISOString(),
    });
    return { refreshed, unavailable, total: count ?? 0 };
  }

  /** Recalcula o preço de todos os produtos no modo global (após mudar a configuração) — um único comando SQL. */
  async repriceAll(): Promise<number> {
    const { data, error } = await this.db.rpc("reprice_global_products");
    if (error) throw error;
    return Number(data ?? 0);
  }
}

/** "Elden Ring ; 34,90" → { query: "Elden Ring", priceCents: 3490 }. Aceita ";" ou TAB como separador. */
export function parseImportLine(line: string): { query: string; priceCents: number | null } {
  const [name, price] = line.split(/\s*[;\t]\s*/);
  const priceCents = price ? parseBRLInput(price) : null;
  return { query: (name ?? "").trim(), priceCents: priceCents && priceCents > 0 ? priceCents : null };
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[™®©:'’\-–—_.,!?()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Remove decorações que costumam diferir entre lojas: ™ ® ©, "- Edição Completa", "+ DLCs", "(2017)". */
export function simplifyName(name: string): string {
  return name
    .replace(/[™®©]/g, "")
    .replace(/[’‘`]/g, "'")
    .split(/\s+[-—–+]\s+/)[0]!
    .replace(/\((?:19|20)\d{2}\)/g, "")
    .replace(/\s+(edição|edition)\s+(completa|padrão|padrao|standard|complete|definitiva|deluxe)\b.*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Consultas tentadas em ordem: nome original → simplificado → sem apóstrofos/dois-pontos. */
export function searchVariants(query: string): string[] {
  const simple = simplifyName(query);
  const bare = simple.replace(/['’:]/g, " ").replace(/\s+/g, " ").trim();
  return [...new Set([query.trim(), simple, bare].filter((q) => q.length >= 2))];
}

const EXTRA_CONTENT = /\b(soundtrack|ost|dlc|artbook|art book|season pass|expansion|upgrade|pack|bundle|demo|playtest|dedicated server|sdk|editor)\b/i;

/**
 * Escolhe o jogo certo entre os resultados da busca:
 * nome exato (normalizado, também na forma simplificada) > resultado único >
 * único jogo base depois de descartar trilhas sonoras/DLCs/packs > ambíguo (admin escolhe).
 */
export function pickBestMatch(
  query: string,
  games: SKGameSummary[],
): { kind: "match"; game: SKGameSummary } | { kind: "ambiguous"; candidates: SKGameSummary[] } | { kind: "none" } {
  if (!games.length) return { kind: "none" };
  const targets = new Set([norm(query), norm(simplifyName(query))]);
  const wantsExtra = EXTRA_CONTENT.test(query); // ex.: o admin pediu explicitamente um "Deluxe Pack"
  const base = wantsExtra ? games : games.filter((g) => !EXTRA_CONTENT.test(g.name));
  // 1) nome idêntico; 2) idêntico após simplificar (só entre jogos base, para não casar com trilhas sonoras)
  const exact = games.filter((g) => targets.has(norm(g.name)));
  const exactSimple = exact.length ? exact : base.filter((g) => targets.has(norm(simplifyName(g.name))));
  if (exactSimple.length >= 1) return { kind: "match", game: exactSimple.find((g) => g.priceCents !== null) ?? exactSimple[0]! };
  if (games.length === 1) return { kind: "match", game: games[0]! };
  if (base.length === 1) return { kind: "match", game: base[0]! };
  return { kind: "ambiguous", candidates: (base.length ? base : games).slice(0, 6) };
}

/**
 * Prepara jogos para o upsert: slug amigável (nomes sem caracteres latinos usam "jogo-<appId>";
 * repetidos recebem o AppID) e data de lançamento normalizada para ISO.
 */
export function withSlugs(games: SKGameSummary[]) {
  const seen = new Set<string>();
  return games.map((g) => {
    let slug = slugify(g.name ?? "") || `jogo-${g.appId}`;
    if (seen.has(slug)) slug = `${slug}-${g.appId}`;
    seen.add(slug);
    return {
      appId: g.appId,
      name: g.name,
      slug,
      coverUrl: g.coverUrl,
      shortDescription: g.shortDescription,
      developer: g.developer,
      publisher: g.publisher,
      nsfw: g.nsfw,
      releaseDate: parseReleaseDate(g.releaseDate),
      priceCents: typeof g.priceCents === "number" ? g.priceCents : null,
    };
  });
}

export function matchCategories(tags: string[], cats: Category[]): Category[] {
  const lower = new Set(tags.map((t) => t.toLowerCase()));
  return cats.filter((c) => c.supplier_tags.some((t) => lower.has(t.toLowerCase()))).sort((a, b) => a.sort_order - b.sort_order);
}
