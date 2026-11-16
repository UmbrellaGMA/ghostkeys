import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { enforceRateLimit, handleApiError } from "@/lib/api";
import { effectivePrice } from "@/services/PricingService";
import type { Product } from "@/types";

/** Pesquisa instantânea (autocomplete do cabeçalho). */
export async function GET(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "search", 60, 60);
    if (limited) return limited;

    const q = (req.nextUrl.searchParams.get("q") ?? "").trim().slice(0, 80);
    if (q.length < 2) return NextResponse.json({ results: [] });

    // Escapa curingas do LIKE; o valor é enviado parametrizado pelo PostgREST (sem SQL injection)
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    const supabase = await createPublicClient();
    const { data, error } = await supabase
      .from("products")
      .select("id, name, slug, image_url, sale_price_cents, promo_price_cents, promo_ends_at, available")
      .eq("active", true)
      .eq("nsfw", false)
      .ilike("name", pattern)
      .order("available", { ascending: false })
      .order("sales_count", { ascending: false })
      .limit(8);
    if (error) throw error;

    const results = ((data ?? []) as Product[]).map((p) => ({
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
