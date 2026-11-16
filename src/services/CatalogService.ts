import "server-only";
import { cache } from "react";
import { createPublicClient } from "@/lib/supabase/server";
import type { ActivationTutorial, Category, Product, StoreSettings } from "@/types";

/** Leitura pública do catálogo (cliente anônimo + RLS). */

export interface CatalogItem {
  id: string;
  name: string;
  slug: string;
  short_description: string | null;
  image_url: string | null;
  background_url: string | null;
  platform: string;
  activation_region: string | null;
  release_date: string | null;
  sale_price_cents: number;
  promo_price_cents: number | null;
  promo_ends_at: string | null;
  original_price_cents: number | null;
  price_cents: number;
  on_sale: boolean;
  available: boolean;
  featured: boolean;
  sales_count: number;
  category_id: string | null;
  category_ids: string[];
}

const CARD_FIELDS =
  "id, name, slug, short_description, image_url, background_url, platform, activation_region, release_date, sale_price_cents, promo_price_cents, promo_ends_at, original_price_cents, price_cents, on_sale, available, featured, sales_count, category_id, category_ids";

export const PAGE_SIZE = 24;

const DEFAULT_SETTINGS: Pick<StoreSettings, "store_name" | "support_email" | "support_whatsapp" | "support_hours" | "default_activation_region" | "activation_instructions" | "max_quantity_per_item" | "store_legal_name" | "store_document" | "pix_enabled" | "card_enabled" | "max_installments" | "combo_enabled" | "combo_size" | "combo_free"> = {
  store_name: "GhostKeys",
  combo_enabled: false,
  combo_size: 3,
  combo_free: 1,
  support_email: null,
  support_whatsapp: null,
  support_hours: null,
  default_activation_region: null,
  activation_instructions: null,
  max_quantity_per_item: 5,
  store_legal_name: null,
  store_document: null,
  pix_enabled: true,
  card_enabled: true,
  max_installments: 1,
};

export const getStoreSettings = cache(async () => {
  try {
    const db = await createPublicClient();
    const { data } = await db.from("store_settings").select("*").eq("id", 1).maybeSingle();
    return { ...DEFAULT_SETTINGS, ...(data ?? {}) } as StoreSettings;
  } catch {
    return DEFAULT_SETTINGS as StoreSettings;
  }
});

/** Tutoriais de ativação ativos (editados no painel › Tutoriais de ativação). */
export const getActivationTutorials = cache(async (): Promise<ActivationTutorial[]> => {
  try {
    const db = await createPublicClient();
    const { data } = await db.from("activation_tutorials").select("*").eq("active", true).order("sort_order").order("platform");
    return (data ?? []) as ActivationTutorial[];
  } catch {
    return [];
  }
});

export const getCategories = cache(async (): Promise<Category[]> => {
  try {
    const db = await createPublicClient();
    const { data } = await db.from("categories").select("*").order("sort_order");
    return (data ?? []) as Category[];
  } catch {
    return [];
  }
});

export type SortOption = "relevancia" | "menor-preco" | "maior-preco" | "lancamentos" | "mais-vendidos" | "nome";

export interface CatalogQuery {
  q?: string;
  categoria?: string;
  colecao?: "promocoes" | "lancamentos" | "mais-vendidos" | "destaques";
  min?: number; // centavos
  max?: number;
  promo?: boolean;
  disponivel?: boolean;
  sort?: SortOption;
  page?: number;
}

export async function listCatalog(query: CatalogQuery): Promise<{ items: CatalogItem[]; total: number; page: number; totalPages: number }> {
  const db = await createPublicClient();
  const page = Math.max(1, query.page ?? 1);
  let req = db.from("catalog_products").select(CARD_FIELDS, { count: "exact" }).eq("nsfw", false);

  if (query.q) req = req.ilike("name", `%${query.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (query.categoria) {
    const cat = (await getCategories()).find((c) => c.slug === query.categoria);
    if (!cat) return { items: [], total: 0, page, totalPages: 0 };
    req = req.contains("category_ids", [cat.id]);
  }
  if (query.min !== undefined) req = req.gte("price_cents", query.min);
  if (query.max !== undefined) req = req.lte("price_cents", query.max);
  if (query.promo || query.colecao === "promocoes") req = req.eq("on_sale", true);
  if (query.disponivel !== false) req = req.eq("available", true);
  if (query.colecao === "destaques") req = req.eq("featured", true);
  if (query.colecao === "mais-vendidos") req = req.gt("sales_count", 0);

  const sort: SortOption =
    query.sort ?? (query.colecao === "lancamentos" ? "lancamentos" : query.colecao === "mais-vendidos" ? "mais-vendidos" : "relevancia");
  switch (sort) {
    case "menor-preco":
      req = req.order("price_cents", { ascending: true });
      break;
    case "maior-preco":
      req = req.order("price_cents", { ascending: false });
      break;
    case "lancamentos":
      req = req.order("release_date", { ascending: false, nullsFirst: false });
      break;
    case "mais-vendidos":
      req = req.order("sales_count", { ascending: false });
      break;
    case "nome":
      req = req.order("name", { ascending: true });
      break;
    default:
      req = req.order("available", { ascending: false }).order("featured", { ascending: false }).order("sales_count", { ascending: false });
  }
  req = req.order("id").range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  const { data, count, error } = await req;
  if (error) throw error;
  const total = count ?? 0;
  return { items: (data ?? []) as unknown as CatalogItem[], total, page, totalPages: Math.ceil(total / PAGE_SIZE) };
}

/** Listas da homepage. Retorna [] em caso de erro (a página mostra estados vazios). */
export async function homeCollections() {
  const db = await createPublicClient();
  const base = () => db.from("catalog_products").select(CARD_FIELDS).eq("nsfw", false).eq("available", true);
  const safe = async (p: PromiseLike<{ data: unknown }>) => {
    try {
      return ((await p).data ?? []) as CatalogItem[];
    } catch {
      return [] as CatalogItem[];
    }
  };
  const [featured, bestsellers, deals, releases, popular] = await Promise.all([
    safe(base().eq("featured", true).order("sales_count", { ascending: false }).limit(8)),
    safe(base().gt("sales_count", 0).order("sales_count", { ascending: false }).limit(10)),
    safe(base().eq("on_sale", true).order("sales_count", { ascending: false }).limit(10)),
    safe(base().not("release_date", "is", null).order("release_date", { ascending: false }).limit(10)),
    safe(base().order("sales_count", { ascending: false }).order("release_date", { ascending: false, nullsFirst: false }).limit(10)),
  ]);
  return { featured, bestsellers, deals, releases, popular };
}

export const getProductBySlug = cache(async (slug: string): Promise<Product | null> => {
  const db = await createPublicClient();
  const { data } = await db.from("products").select("*").eq("slug", slug).maybeSingle();
  return (data as Product) ?? null;
});

export async function getRelated(product: Product, limit = 6): Promise<CatalogItem[]> {
  const db = await createPublicClient();
  let req = db.from("catalog_products").select(CARD_FIELDS).eq("nsfw", false).eq("available", true).neq("id", product.id);
  if (product.category_id) req = req.contains("category_ids", [product.category_id]);
  const { data } = await req.order("sales_count", { ascending: false }).limit(limit);
  return (data ?? []) as unknown as CatalogItem[];
}
