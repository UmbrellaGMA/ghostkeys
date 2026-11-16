import { Flame, Rocket, Sparkles, Star, Tag, Gamepad2 } from "lucide-react";
import { getCategories, getStoreSettings, homeCollections } from "@/services/CatalogService";
import { HeroBanner } from "@/components/home/HeroBanner";
import { CategoryGrid } from "@/components/home/CategoryGrid";
import { Advantages } from "@/components/home/Advantages";
import { ComboBanner } from "@/components/home/ComboBanner";
import { ProductRail } from "@/components/product/ProductRail";
import { EmptyState } from "@/components/ui/EmptyState";

export const revalidate = 120;

export default async function HomePage() {
  const [collections, categories, settings] = await Promise.all([
    homeCollections().catch(() => ({ featured: [], bestsellers: [], deals: [], releases: [], popular: [] })),
    getCategories(),
    getStoreSettings(),
  ]);
  const { featured, bestsellers, deals, releases, popular } = collections;
  const max = settings.max_quantity_per_item;
  const isEmpty = [featured, bestsellers, deals, releases, popular].every((l) => l.length === 0);

  return (
    <>
      <HeroBanner featured={featured.length ? featured : popular.slice(0, 3)} />
      {settings.combo_enabled && <ComboBanner size={settings.combo_size} free={settings.combo_free} />}

      {isEmpty ? (
        <div className="container-page py-12">
          <EmptyState
            icon={Gamepad2}
            title="Catálogo em preparação"
            description="Os jogos são importados automaticamente do nosso fornecedor. Volte em instantes para conferir as novidades."
          />
        </div>
      ) : (
        <>
          <ProductRail title="Jogos em destaque" icon={Star} href="/jogos?colecao=destaques" products={featured.slice(3)} maxQuantity={max} />
          <ProductRail title="Mais vendidos" icon={Flame} href="/jogos?colecao=mais-vendidos" products={bestsellers} maxQuantity={max} />
          <ProductRail title="Ofertas especiais" icon={Tag} href="/jogos?colecao=promocoes" products={deals} maxQuantity={max} />
          <ProductRail title="Lançamentos" icon={Rocket} href="/jogos?colecao=lancamentos" products={releases} maxQuantity={max} />
          <ProductRail title="Jogos populares" icon={Sparkles} href="/jogos" products={popular} maxQuantity={max} />
        </>
      )}

      <CategoryGrid categories={categories} />
      <Advantages />
    </>
  );
}
