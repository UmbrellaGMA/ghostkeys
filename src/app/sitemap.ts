import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/env";
import { createPublicClient } from "@/lib/supabase/server";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = appUrl();
  const staticPages = ["", "/jogos", "/paginas/sobre", "/paginas/faq", "/paginas/termos", "/paginas/privacidade", "/paginas/reembolso", "/paginas/atendimento"].map((p) => ({
    url: `${base}${p}`,
    changeFrequency: "daily" as const,
    priority: p === "" ? 1 : 0.6,
  }));
  try {
    const db = await createPublicClient();
    const { data } = await db.from("products").select("slug, updated_at").eq("active", true).eq("available", true).eq("nsfw", false).limit(5000);
    return [
      ...staticPages,
      ...(data ?? []).map((p) => ({ url: `${base}/jogos/${p.slug}`, lastModified: p.updated_at, changeFrequency: "daily" as const, priority: 0.8 })),
    ];
  } catch {
    return staticPages;
  }
}
