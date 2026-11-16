"use client";
import { useEffect, useState } from "react";
import { formatBRL } from "@/lib/money";
import { cn } from "@/lib/utils";
import { AddToCartButton } from "./AddToCartButton";

interface Props {
  price: number;
  listPrice: number | null;
  maxQuantity: number;
  product: { id: string; slug: string; name: string; image_url: string | null; price_cents: number };
}

/**
 * Barra fixa no rodapé (só no celular) com preço e "Comprar".
 * Aparece quando a caixa de compra principal (#buy-box) não está visível.
 */
export function MobileBuyBar({ price, listPrice, maxQuantity, product }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const box = document.getElementById("buy-box");
    if (!box || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setShow(!e.isIntersecting), { rootMargin: "0px 0px -80px 0px" });
    io.observe(box);
    return () => io.disconnect();
  }, []);

  return (
    <div
      aria-hidden={!show}
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pt-3 backdrop-blur-lg transition-transform duration-300 lg:hidden",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        show ? "translate-y-0" : "pointer-events-none translate-y-full",
      )}
    >
      <div className="mx-auto flex max-w-xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs text-muted">{product.name}</p>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-lg font-bold text-white">{formatBRL(price)}</span>
            {listPrice && listPrice > price && <span className="text-xs text-subtle line-through">{formatBRL(listPrice)}</span>}
          </p>
        </div>
        <AddToCartButton variant="icon" available maxQuantity={maxQuantity} product={product} className="size-12 shrink-0 rounded-xl" />
        <div className="w-40 shrink-0">
          <AddToCartButton variant="buy-now" available maxQuantity={maxQuantity} product={product} className="whitespace-nowrap px-3 py-3 text-sm" />
        </div>
      </div>
    </div>
  );
}
