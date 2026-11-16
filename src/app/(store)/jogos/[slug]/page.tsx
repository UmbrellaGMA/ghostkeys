import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, CalendarDays, ChevronRight, Gift, Globe2, KeyRound, Monitor, ShieldCheck, Zap, Building2 } from "lucide-react";
import { getActivationTutorials, getCategories, getProductBySlug, getRelated, getStoreSettings } from "@/services/CatalogService";
import { pickTutorial } from "@/lib/tutorials";
import { ActivationTutorial } from "@/components/account/ActivationTutorial";
import { effectivePrice, listPrice } from "@/services/PricingService";
import { GameImage } from "@/components/product/GameImage";
import { PriceTag } from "@/components/product/PriceTag";
import { AddToCartButton } from "@/components/product/AddToCartButton";
import { ProductGrid } from "@/components/product/ProductCard";
import { appUrl } from "@/lib/env";
import { formatDate } from "@/lib/utils";

type Params = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProductBySlug(slug);
  if (!p) return { title: "Jogo não encontrado" };
  const description = p.short_description ?? `Compre ${p.name} para ${p.platform} com entrega automática.`;
  return {
    title: `${p.name} — Key ${p.platform}`,
    description,
    alternates: { canonical: `/jogos/${p.slug}` },
    openGraph: { title: p.name, description, images: p.image_url ? [p.image_url] : undefined },
  };
}

export default async function ProductPage({ params }: Params) {
  const { slug } = await params;
  const [product, settings, categories, tutorials] = await Promise.all([getProductBySlug(slug), getStoreSettings(), getCategories(), getActivationTutorials()]);
  if (!product || !product.active || product.sale_price_cents <= 0) notFound();

  const price = effectivePrice(product);
  const lp = listPrice(product);
  const region = product.activation_region ?? settings.default_activation_region;
  const category = categories.find((c) => c.id === product.category_id);
  const related = await getRelated(product).catch(() => []);
  const canBuy = product.available && price > 0;
  const tutorial = pickTutorial(tutorials, product.platform);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    image: product.image_url ?? undefined,
    description: product.short_description ?? undefined,
    brand: product.publisher ?? undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: (price / 100).toFixed(2),
      availability: canBuy ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${appUrl()}/jogos/${product.slug}`,
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />

      {/* Banner de fundo */}
      <div className="relative h-[260px] overflow-hidden sm:h-[340px]">
        <GameImage src={product.background_url ?? product.image_url} alt="" priority sizes="100vw" className="scale-105 opacity-60 blur-[2px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/70 to-bg" />
      </div>

      <div className="container-page relative -mt-48 sm:-mt-60">
        <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted" aria-label="Trilha">
          <Link href="/" className="hover:text-fg">Início</Link>
          <ChevronRight className="size-3" />
          <Link href="/jogos" className="hover:text-fg">Jogos</Link>
          {category && (
            <>
              <ChevronRight className="size-3" />
              <Link href={`/jogos?categoria=${category.slug}`} className="hover:text-fg">{category.name}</Link>
            </>
          )}
          <ChevronRight className="size-3" />
          <span className="text-fg">{product.name}</span>
        </nav>

        <div className="grid gap-8 lg:grid-cols-[1fr_380px]">
          <div className="space-y-6">
            <div className="relative aspect-[460/215] overflow-hidden rounded-3xl border border-line shadow-2xl">
              <GameImage src={product.image_url} alt={`Capa de ${product.name}`} priority sizes="(max-width: 1024px) 100vw, 60vw" />
            </div>

            <div>
              <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">{product.name}</h1>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="badge bg-surface-3 text-fg"><Monitor className="size-3" /> {product.platform}</span>
                {category && <span className="badge bg-accent/15 text-accent">{category.name}</span>}
                {product.tags.slice(0, 5).map((t) => (
                  <span key={t} className="badge bg-surface-2 text-muted">{t}</span>
                ))}
              </div>
            </div>

            <section className="card p-6">
              <h2 className="mb-3 font-display text-lg font-bold text-white">Sobre o jogo</h2>
              <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{product.description ?? product.short_description ?? "Descrição não disponível."}</p>
              <dl className="mt-5 grid gap-4 border-t border-line pt-5 text-sm sm:grid-cols-3">
                {product.developer && (
                  <div>
                    <dt className="label">Desenvolvedora</dt>
                    <dd className="flex items-center gap-1.5 text-fg"><Building2 className="size-4 text-subtle" /> {product.developer}</dd>
                  </div>
                )}
                {product.publisher && (
                  <div>
                    <dt className="label">Publicadora</dt>
                    <dd className="text-fg">{product.publisher}</dd>
                  </div>
                )}
                {product.release_date && (
                  <div>
                    <dt className="label">Lançamento</dt>
                    <dd className="flex items-center gap-1.5 text-fg"><CalendarDays className="size-4 text-subtle" /> {formatDate(product.release_date)}</dd>
                  </div>
                )}
              </dl>
            </section>

            <section className="card p-6">
              <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-white">
                <KeyRound className="size-5 text-accent" /> Como ativar
              </h2>
              {tutorial ? (
                <ActivationTutorial tutorial={tutorial} />
              ) : settings.activation_instructions ? (
                <p className="whitespace-pre-line text-sm leading-relaxed text-muted">{settings.activation_instructions}</p>
              ) : (
                <p className="text-sm text-muted">
                  Após a aprovação do pagamento, a key fica disponível em <strong className="text-fg">Minha conta › Pedidos</strong>. As instruções de
                  resgate acompanham a key. Em caso de dúvida, fale com o <Link href="/paginas/atendimento" className="text-accent hover:underline">atendimento</Link>.
                </p>
              )}
            </section>
          </div>

          {/* Caixa de compra */}
          <aside className="lg:sticky lg:top-40 lg:self-start">
            <div className="card space-y-5 p-6 shadow-[0_30px_80px_-40px_rgba(136,4,250,0.5)]">
              <PriceTag price={price} listPrice={lp} size="lg" />
              {product.promo_ends_at && lp && (
                <p className="text-xs text-warning">Oferta válida até {new Date(product.promo_ends_at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</p>
              )}

              <ul className="space-y-3 rounded-xl border border-line bg-surface-2 p-4 text-sm">
                <li className="flex items-start gap-3">
                  <Globe2 className="mt-0.5 size-4 shrink-0 text-accent-2" />
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-muted">Região de ativação</span>
                    <strong className="text-white">{region ?? "Consulte o atendimento antes de comprar"}</strong>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Monitor className="mt-0.5 size-4 shrink-0 text-accent-2" />
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-muted">Plataforma</span>
                    <strong className="text-white">{product.platform}</strong>
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <Zap className="mt-0.5 size-4 shrink-0 text-accent-2" />
                  <span>
                    <span className="block text-xs uppercase tracking-wide text-muted">Entrega</span>
                    <strong className="text-white">Digital e automática</strong>
                    <span className="block text-xs text-muted">Key liberada na sua conta após a aprovação do pagamento.</span>
                  </span>
                </li>
              </ul>

              {settings.combo_enabled && canBuy && (
                <p className="flex items-center gap-2 rounded-xl border border-accent/40 bg-accent/10 px-3 py-2.5 text-sm text-fg">
                  <Gift className="size-4 shrink-0 text-accent-2" />
                  <span>
                    <strong>Leve {settings.combo_size}, pague {settings.combo_size - settings.combo_free}:</strong> monte seu combo e o mais barato sai de graça.
                  </span>
                </p>
              )}
              {canBuy ? (
                <div className="space-y-2.5">
                  <AddToCartButton
                    variant="buy-now"
                    available
                    maxQuantity={settings.max_quantity_per_item}
                    product={{ id: product.id, slug: product.slug, name: product.name, image_url: product.image_url, price_cents: price }}
                  />
                  <AddToCartButton
                    variant="full"
                    available
                    maxQuantity={settings.max_quantity_per_item}
                    product={{ id: product.id, slug: product.slug, name: product.name, image_url: product.image_url, price_cents: price }}
                  />
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm text-amber-200">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" /> Este jogo está temporariamente indisponível no fornecedor.
                </div>
              )}

              <p className="flex items-center gap-2 text-xs text-muted">
                <ShieldCheck className="size-4 text-success" /> Pagamento seguro via Mercado Pago · PIX ou cartão
              </p>
              <p className="text-xs leading-relaxed text-subtle">
                Ao comprar, verifique a região de ativação e as condições da key. Keys digitais resgatadas não podem ser devolvidas — veja a{" "}
                <Link href="/paginas/reembolso" className="underline hover:text-fg">política de reembolso</Link>.
              </p>
            </div>
          </aside>
        </div>

        {related.length > 0 && (
          <section className="mt-14">
            <h2 className="section-title mb-5">Jogos relacionados</h2>
            <ProductGrid products={related} maxQuantity={settings.max_quantity_per_item} />
          </section>
        )}
      </div>
    </>
  );
}
