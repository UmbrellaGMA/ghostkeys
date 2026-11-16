import Link from "next/link";
import { ArrowRight, CreditCard, ShieldCheck, Zap } from "lucide-react";
import type { CatalogItem } from "@/services/CatalogService";
import { listPrice } from "@/services/PricingService";
import { GameImage } from "@/components/product/GameImage";
import { PriceTag } from "@/components/product/PriceTag";

/** Banner principal. Usa jogos em destaque REAIS do catálogo; sem destaques, exibe banner institucional. */
export function HeroBanner({ featured }: { featured: CatalogItem[] }) {
  const main = featured[0];
  const side = featured.slice(1, 3);

  return (
    <section className="relative overflow-hidden border-b border-line">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(136,4,250,0.18),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(178,102,255,0.12),transparent_50%)]" />
      <div className="container-page relative grid gap-4 py-6 sm:py-8 lg:grid-cols-3">
        {main ? (
          <div className="group relative min-h-[320px] overflow-hidden rounded-3xl border border-line lg:col-span-2 lg:min-h-[420px]">
            <GameImage src={main.background_url ?? main.image_url} alt={main.name} priority sizes="(max-width: 1024px) 100vw, 66vw" className="transition-transform duration-700 group-hover:scale-105" />
            <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/60 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-r from-bg/80 via-transparent to-transparent" />
            <div className="absolute inset-x-0 bottom-0 flex flex-col gap-4 p-6 sm:p-8">
              <span className="badge w-fit bg-accent text-white">Em destaque</span>
              <h1 className="max-w-xl font-display text-3xl font-bold leading-tight text-white sm:text-5xl">{main.name}</h1>
              {main.short_description && <p className="line-clamp-2 max-w-lg text-sm text-fg/80 sm:text-base">{main.short_description}</p>}
              <div className="flex flex-wrap items-center gap-4">
                <PriceTag price={main.price_cents} listPrice={listPrice(main)} size="md" />
                <Link href={`/jogos/${main.slug}`} className="btn-primary">
                  Comprar agora <ArrowRight className="size-4" />
                </Link>
                <Link href="/jogos" className="btn-secondary">
                  Explorar jogos
                </Link>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative flex min-h-[360px] flex-col justify-center gap-6 overflow-hidden rounded-3xl border border-line bg-surface p-8 lg:col-span-2 lg:min-h-[420px] sm:p-12">
            <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-accent/20 blur-3xl" />
            <span className="badge w-fit bg-accent/15 text-accent">Keys Steam · Entrega automática</span>
            <h1 className="max-w-xl font-display text-4xl font-bold leading-tight text-white sm:text-5xl">
              Seu próximo jogo, <span className="bg-gradient-to-r from-accent-2 to-accent bg-clip-text text-transparent">na hora</span>.
            </h1>
            <p className="max-w-lg text-muted">Pague com PIX ou cartão e receba sua key automaticamente na sua área do cliente assim que o pagamento for aprovado.</p>
            <div className="flex flex-wrap gap-3">
              <Link href="/jogos" className="btn-primary">
                Explorar jogos <ArrowRight className="size-4" />
              </Link>
              <Link href="/jogos?colecao=promocoes" className="btn-secondary">
                Ver ofertas
              </Link>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
          {side.map((p) => (
            <Link key={p.id} href={`/jogos/${p.slug}`} className="group relative min-h-[180px] overflow-hidden rounded-3xl border border-line">
              <GameImage src={p.image_url} alt={p.name} sizes="(max-width: 1024px) 50vw, 33vw" className="transition-transform duration-700 group-hover:scale-105" />
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-5">
                <h2 className="line-clamp-2 font-display text-lg font-bold text-white">{p.name}</h2>
                <PriceTag price={p.price_cents} listPrice={listPrice(p)} size="sm" className="shrink-0" />
              </div>
            </Link>
          ))}
          {side.length < 2 && (
            <div className="card flex flex-col justify-center gap-4 p-6">
              {[
                { icon: Zap, title: "Entrega automática", text: "Key disponível na sua conta após a aprovação." },
                { icon: ShieldCheck, title: "Compra protegida", text: "Pagamento processado pelo Mercado Pago." },
                { icon: CreditCard, title: "PIX ou cartão", text: "Pague como preferir, com confirmação rápida." },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3">
                  <Icon className="mt-0.5 size-5 shrink-0 text-accent" />
                  <div>
                    <p className="text-sm font-semibold text-white">{title}</p>
                    <p className="text-xs text-muted">{text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
