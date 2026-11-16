"use client";
import Link from "next/link";
import { ShoppingCart } from "lucide-react";
import { useCart } from "@/hooks/useCart";

export function CartButton() {
  const { count } = useCart();
  return (
    <Link href="/carrinho" className="relative grid size-11 place-items-center rounded-xl border border-line-strong bg-surface-2 transition hover:border-accent" aria-label={`Carrinho (${count} itens)`}>
      <ShoppingCart className="size-5 text-fg" />
      {count > 0 && (
        <span className="absolute -right-1.5 -top-1.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[11px] font-bold text-white ring-2 ring-bg">
          {count}
        </span>
      )}
    </Link>
  );
}
