import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { enforceRateLimit, handleApiError } from "@/lib/api";
import { effectivePrice } from "@/services/PricingService";
import { searchProductIds } from "@/services/CatalogService";
import type { Product } from "@/types";

/** Pesquisa instantânea (autocomplete do cabeçalho). */
export async function GET(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "search", 60, 60);
    if (limited) return limited;

    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ results: [] });

    // Busca por proximidade (erros de digitação, siglas, romanos); ids já vêm em ordem de relevância
    const hits = await searchProductIds(q, 8, true);
    if (!hits.length) return NextResponse.json({ results: [] }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
    const rank = new Map(hits.map((h, i) => [h.id, i]));
    const supabase = await createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, name, slug, image_url, sale_price_cents, promo_price_cents, promo_ends_at, available")
      .eq("active", true)
      .eq("nsfw", false)
      .in("id", hits.map((h) => h.id));
    if (error) throw error;
    const ordered = ((data ?? []) as Product[]).sort((a, b) => (rank.get(a.id) ?? 99) - (rank.get(b.id) ?? 99));

    const results = ordered.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      image_url: p.image_url,
      price_cents: effectivePrice(p),
      available: p.available,
    }));
    return NextResponse.json({ results }, { headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60" } });
  } catch (e) {
    return handleApiError(e);
  }
}
