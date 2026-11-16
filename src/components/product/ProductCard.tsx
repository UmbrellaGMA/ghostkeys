import Link from "next/link";
import { Globe2 } from "lucide-react";
import type { CatalogItem } from "@/services/CatalogService";
import { listPrice } from "@/services/PricingService";
import { GameImage } from "./GameImage";
import { PriceTag } from "./PriceTag";
import { AddToCartButton } from "./AddToCartButton";
import { cn } from "@/lib/utils";

export function ProductCard({ product, className, maxQuantity }: { product: CatalogItem; className?: string; maxQuantity?: number }) {
  const lp = listPrice(product);
  return (
    <Link
      href={`/jogos/${product.slug}`}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface transition-all duration-300 hover:-translate-y-1 hover:border-accent/50 hover:shadow-[0_18px_40px_-20px_rgba(136,4,250,0.55)]",
        className,
      )}
    >
      <div className="relative aspect-[460/215] overflow-hidden bg-surface-2">
        <GameImage src={product.image_url} alt={product.name} className="transition-transform duration-500 group-hover:scale-105" />
        <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent opacity-80" />
        <div className="absolute left-2.5 top-2.5 flex gap-1.5">
          <span className="badge bg-black/70 text-white backdrop-blur">{product.platform}</span>
          {product.on_sale && lp && <span className="badge bg-accent text-white">Oferta</span>}
        </div>
        {!product.available && (
          <div className="absolute inset-0 grid place-items-center bg-black/60 backdrop-blur-[2px]">
            <span className="badge bg-surface-3 text-muted">Indisponível</span>
          </div>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-3.5">
        <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-snug text-fg group-hover:text-white">{product.name}</h3>
        {product.activation_region && (
          <p className="-mt-1.5 flex items-center gap-1 text-[11px] text-muted">
            <Globe2 className="size-3" /> Ativação: {product.activation_region}
          </p>
        )}
        <div className="mt-auto flex items-end justify-between gap-2">
          <PriceTag price={product.price_cents} listPrice={lp} size="sm" />
          <AddToCartButton product={product} available={product.available} maxQuantity={maxQuantity} />
        </div>
      </div>
    </Link>
  );
}

export function ProductCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="skeleton aspect-[460/215] rounded-none" />
      <div className="space-y-3 p-3.5">
        <div className="skeleton h-4 w-4/5" />
        <div className="skeleton h-4 w-2/5" />
        <div className="flex items-end justify-between">
          <div className="skeleton h-6 w-24" />
          <div className="skeleton size-9" />
        </div>
      </div>
    </div>
  );
}

export function ProductGrid({ products, maxQuantity }: { products: CatalogItem[]; maxQuantity?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {products.map((p) => (
        <ProductCard key={p.id} product={p} maxQuantity={maxQuantity} />
      ))}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}
