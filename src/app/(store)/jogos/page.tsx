import type { Metadata } from "next";
import { SearchX } from "lucide-react";
import { getCategories, getStoreSettings, listCatalog, type CatalogQuery, type SortOption } from "@/services/CatalogService";
import { CatalogFilters } from "@/components/catalog/CatalogFilters";
import { Pagination } from "@/components/catalog/Pagination";
import { ProductGrid } from "@/components/product/ProductCard";
import { EmptyState } from "@/components/ui/EmptyState";
import { parseBRLInput } from "@/lib/money";

type SP = Record<string, string | string[] | undefined>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

const COLLECTION_TITLES: Record<string, string> = {
  promocoes: "Promoções",
  lancamentos: "Lançamentos",
  "mais-vendidos": "Mais vendidos",
  destaques: "Jogos em destaque",
};

export async function generateMetadata({ searchParams }: { searchParams: Promise<SP> }): Promise<Metadata> {
  const sp = await searchParams;
  const categories = await getCategories();
  const cat = categories.find((c) => c.slug === one(sp.categoria));
  const col = COLLECTION_TITLES[one(sp.colecao) ?? ""];
  const q = one(sp.q);
  const title = q ? `Busca: ${q}` : cat ? `Jogos de ${cat.name}` : col ?? "Todos os jogos";
  return { title, description: `${title} — keys para Steam com entrega automática.`, alternates: { canonical: "/jogos" } };
}

export default async function CatalogPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const [categories, settings] = await Promise.all([getCategories(), getStoreSettings()]);

  const colecao = one(sp.colecao) as CatalogQuery["colecao"];
  const min = one(sp.min) ? parseBRLInput(one(sp.min)!) ?? undefined : undefined;
  const max = one(sp.max) ? parseBRLInput(one(sp.max)!) ?? undefined : undefined;
  const query: CatalogQuery = {
    q: one(sp.q)?.slice(0, 80),
    categoria: one(sp.categoria),
    colecao: colecao && COLLECTION_TITLES[colecao] ? colecao : undefined,
    min,
    max,
    promo: one(sp.promo) === "1",
    disponivel: one(sp.indisponiveis) === "1" ? false : true,
    sort: (one(sp.sort) as SortOption) || undefined,
    page: Math.max(1, Number(one(sp.pagina)) || 1),
  };

  let result: Awaited<ReturnType<typeof listCatalog>> = { items: [], total: 0, page: 1, totalPages: 0 };
  let failed = false;
  try {
    result = await listCatalog(query);
  } catch {
    failed = true;
  }

  const cat = categories.find((c) => c.slug === query.categoria);
  const title = query.q ? `Resultados para “${query.q}”` : cat ? cat.name : query.colecao ? COLLECTION_TITLES[query.colecao] : "Todos os jogos";

  const buildHref = (page: number) => {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      const val = one(v);
      if (val && k !== "pagina") params.set(k, val);
    }
    if (page > 1) params.set("pagina", String(page));
    return `/jogos${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="container-page py-8">
      <div className="mb-6">
        <h1 className="font-display text-3xl font-bold text-white">{title}</h1>
        <p className="mt-1 text-sm text-muted">{failed ? "Não foi possível carregar o catálogo." : `${result.total} jogo(s) encontrado(s)`}</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
        <aside className="lg:sticky lg:top-40 lg:self-start">
          <CatalogFilters
            categories={categories}
            values={{
              q: query.q,
              categoria: query.categoria,
              colecao: query.colecao,
              min: one(sp.min),
              max: one(sp.max),
              promo: query.promo,
              indisponiveis: query.disponivel === false,
              sort: one(sp.sort),
            }}
          />
        </aside>
        <section>
          {failed ? (
            <EmptyState icon={SearchX} title="Catálogo indisponível" description="Tente novamente em alguns instantes." action={{ label: "Recarregar", href: buildHref(query.page ?? 1) }} />
          ) : result.items.length === 0 ? (
            <EmptyState icon={SearchX} title="Nenhum jogo encontrado" description="Tente remover alguns filtros ou buscar por outro nome." action={{ label: "Ver todos os jogos", href: "/jogos" }} />
          ) : (
            <>
              <ProductGrid products={result.items} maxQuantity={settings.max_quantity_per_item} />
              <Pagination page={result.page} totalPages={result.totalPages} buildHref={buildHref} />
            </>
          )}
        </section>
      </div>
    </div>
  );
}
