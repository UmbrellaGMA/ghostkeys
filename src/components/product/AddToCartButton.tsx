"use client";
import { useRouter } from "next/navigation";
import { ShoppingCart, Zap } from "lucide-react";
import { useCart } from "@/hooks/useCart";
import { toast } from "@/components/ui/Toaster";
import { cn } from "@/lib/utils";

interface Props {
  product: { id: string; slug: string; name: string; image_url: string | null; price_cents: number };
  available: boolean;
  maxQuantity?: number;
  variant?: "icon" | "full" | "buy-now";
  className?: string;
}

export function AddToCartButton({ product, available, maxQuantity = 5, variant = "icon", className }: Props) {
  const { add } = useCart(maxQuantity);
  const router = useRouter();

  const handle = (e: React.MouseEvent, goToCart: boolean) => {
    e.preventDefault();
    e.stopPropagation();
    if (!available) return;
    add({ productId: product.id, slug: product.slug, name: product.name, imageUrl: product.image_url, priceCents: product.price_cents });
    if (goToCart) router.push("/carrinho");
    else toast(`${product.name} adicionado ao carrinho`);
  };

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={(e) => handle(e, false)}
        disabled={!available}
        aria-label={available ? `Adicionar ${product.name} ao carrinho` : "Indisponível"}
        className={cn(
          "grid size-9 place-items-center rounded-lg border border-line-strong bg-surface-2 text-fg transition hover:border-accent hover:bg-accent hover:text-white disabled:opacity-40 disabled:hover:bg-surface-2",
          className,
        )}
      >
        <ShoppingCart className="size-4" />
      </button>
    );
  }

  if (variant === "buy-now") {
    return (
      <button type="button" onClick={(e) => handle(e, true)} disabled={!available} className={cn("btn-primary w-full py-3.5 text-base", className)}>
        <Zap className="size-5" />
        {available ? "Comprar agora" : "Indisponível"}
      </button>
    );
  }

  return (
    <button type="button" onClick={(e) => handle(e, false)} disabled={!available} className={cn("btn-secondary w-full py-3", className)}>
      <ShoppingCart className="size-4" />
      Adicionar ao carrinho
    </button>
  );
}
