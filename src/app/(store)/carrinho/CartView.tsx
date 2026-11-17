"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Minus, Plus, ShoppingCart, Trash2, Globe2 } from "lucide-react";
import { useValidatedCart } from "@/hooks/useValidatedCart";
import { formatBRL } from "@/lib/money";
import { GameImage } from "@/components/product/GameImage";
import { EmptyState } from "@/components/ui/EmptyState";
import { OrderSummary } from "@/components/cart/OrderSummary";
import { toast } from "@/components/ui/Toaster";

export function CartView() {
  const { items, lines, maxQuantity, loading, totals, combo, setQuantity, remove } = useValidatedCart();
  // Barra fixa "Finalizar compra" no celular enquanto o resumo não está na tela
  const [summaryVisible, setSummaryVisible] = useState(true);
  useEffect(() => {
    const el = document.getElementById("cart-summary");
    if (!el || !("IntersectionObserver" in window)) return;
    const io = new IntersectionObserver(([e]) => setSummaryVisible(e.isIntersecting), { rootMargin: "0px 0px -40px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [items.length]);

  if (!items.length) {
    return <EmptyState icon={ShoppingCart} title="Seu carrinho está vazio" description="Explore o catálogo e adicione seus próximos jogos." action={{ label: "Explorar jogos", href: "/jogos" }} />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <ul className="space-y-3">
        {items.map((item) => {
          const l = lines[item.productId];
          const unavailable = l && !l.available;
          const price = l?.price_cents ?? item.priceCents;
          return (
            <li key={item.productId} className="card flex gap-4 p-3 sm:p-4">
              <Link href={`/jogos/${item.slug}`} className="relative aspect-[460/215] w-28 shrink-0 overflow-hidden rounded-lg sm:w-44">
                <GameImage src={item.imageUrl} alt={item.name} sizes="176px" />
              </Link>
              <div className="flex min-w-0 flex-1 flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/jogos/${item.slug}`} className="line-clamp-2 font-semibold text-white hover:text-accent">
                    {item.name}
                  </Link>
                  <button
                    onClick={() => {
                      remove(item.productId);
                      toast("Item removido do carrinho", "info");
                    }}
                    className="-m-2.5 grid size-10 shrink-0 place-items-center rounded-lg text-subtle transition hover:text-danger"
                    aria-label={`Remover ${item.name}`}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>
                {l?.activation_region && (
                  <p className="flex items-center gap-1 text-xs text-muted">
                    <Globe2 className="size-3" /> {l.platform} · Região: {l.activation_region}
                  </p>
                )}
                {unavailable && (
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                    <AlertTriangle className="size-3.5" /> Indisponível — remova para continuar
                  </p>
                )}
                <div className="mt-auto flex items-center justify-between gap-3">
                  <div className="flex items-center rounded-lg border border-line-strong">
                    <button
                      onClick={() => setQuantity(item.productId, item.quantity - 1)}
                      disabled={item.quantity <= 1}
                      className="grid size-10 place-items-center text-muted hover:text-fg disabled:opacity-30 sm:size-8"
                      aria-label="Diminuir quantidade"
                    >
                      <Minus className="size-3.5" />
                    </button>
                    <span className="w-8 text-center text-sm font-semibold" aria-live="polite">{item.quantity}</span>
                    <button
                      onClick={() => setQuantity(item.productId, Math.min(maxQuantity, item.quantity + 1))}
                      disabled={item.quantity >= maxQuantity}
                      className="grid size-10 place-items-center text-muted hover:text-fg disabled:opacity-30 sm:size-8"
                      aria-label="Aumentar quantidade"
                    >
                      <Plus className="size-3.5" />
                    </button>
                  </div>
                  <div className="text-right">
                    {l?.list_price_cents && <p className="text-xs text-subtle line-through">{formatBRL(l.list_price_cents * item.quantity)}</p>}
                    <p className="font-display font-bold text-white">{formatBRL(price * item.quantity)}</p>
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      <aside id="cart-summary" className="lg:sticky lg:top-40 lg:self-start">
        <OrderSummary
          subtotal={totals.subtotal}
          savings={totals.savings}
          couponCents={0}
          comboCents={totals.comboCents}
          comboMissingUnits={totals.comboMissingUnits}
          combo={combo}
          total={totals.subtotal - totals.comboCents}
          loading={loading}
        >
          {totals.hasUnavailable ? (
            <button disabled className="btn-primary w-full py-3">Remova os itens indisponíveis</button>
          ) : (
            <Link href="/checkout" aria-disabled={loading} className={`btn-primary w-full py-3 ${loading ? "pointer-events-none opacity-60" : ""}`}>
              Finalizar compra
            </Link>
          )}
          <p className="text-center text-xs text-muted">Cupons podem ser aplicados na próxima etapa.</p>
        </OrderSummary>
      </aside>

      {!totals.hasUnavailable && (
        <div
          aria-hidden={summaryVisible}
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t border-line bg-bg/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-lg transition-transform duration-300 lg:hidden",
            summaryVisible ? "pointer-events-none translate-y-full" : "translate-y-0",
          )}
        >
          <div className="mx-auto flex max-w-xl items-center gap-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted">Total · {items.reduce((n, i) => n + i.quantity, 0)} jogo(s)</p>
              <p className="font-display text-lg font-bold text-white">{formatBRL(totals.subtotal - totals.comboCents)}</p>
            </div>
            <Link href="/checkout" aria-disabled={loading} className={cn("btn-primary shrink-0 px-6 py-3", loading && "pointer-events-none opacity-60")}>
              Finalizar compra
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
