import Link from "next/link";
import { ArrowRight, Gift } from "lucide-react";

export function ComboBanner({ size, free }: { size: number; free: number }) {
  const pay = size - free;
  return (
    <section className="container-page pt-6">
      <Link
        href="/jogos"
        className="group relative flex flex-col items-start gap-4 overflow-hidden rounded-3xl border border-accent/40 bg-gradient-to-r from-accent/25 via-surface to-accent-2/15 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8"
      >
        <div className="pointer-events-none absolute -right-10 -top-16 size-56 rounded-full bg-accent-2/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent text-white shadow-[0_10px_30px_-10px_var(--color-accent)]">
            <Gift className="size-7" />
          </span>
          <div>
            <p className="font-display text-2xl font-bold text-white sm:text-3xl">
              Leve {size}, pague {pay}
            </p>
            <p className="text-sm text-fg/80">
              A cada {size} jogos no carrinho, {free === 1 ? "o mais barato sai" : `os ${free} mais baratos saem`} de graça. Desconto automático no checkout.
            </p>
          </div>
        </div>
        <span className="btn-primary relative">
          Montar meu combo <ArrowRight className="size-4 transition group-hover:translate-x-1" />
        </span>
      </Link>
    </section>
  );
}
