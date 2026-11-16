import Link from "next/link";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { CatalogItem } from "@/services/CatalogService";
import { ProductCard } from "./ProductCard";

/** Seção horizontal da homepage. Não renderiza nada se não houver produtos reais. */
export function ProductRail({
  title,
  icon: Icon,
  href,
  products,
  maxQuantity,
}: {
  title: string;
  icon: LucideIcon;
  href: string;
  products: CatalogItem[];
  maxQuantity?: number;
}) {
  if (!products.length) return null;
  return (
    <section className="container-page py-8">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="section-title flex items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg bg-accent/15">
            <Icon className="size-4 text-accent" />
          </span>
          {title}
        </h2>
        <Link href={href} className="-my-2 flex items-center gap-1 py-2 text-sm font-semibold text-accent hover:text-accent-2">
          Ver todos <ArrowRight className="size-4" />
        </Link>
      </div>
      <div className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible sm:px-0 lg:grid-cols-5">
        {products.slice(0, 10).map((p, i) => (
          <ProductCard
            key={p.id}
            product={p}
            maxQuantity={maxQuantity}
            className={`w-[68%] shrink-0 snap-start sm:w-auto ${i >= 6 ? "sm:hidden" : ""} ${i >= 5 ? "lg:hidden" : ""}`}
          />
        ))}
      </div>
    </section>
  );
}
