import Link from "next/link";
import { Car, Castle, Crosshair, Ghost, Map, Plane, Sparkles, Swords, Trophy, Gamepad2, type LucideIcon } from "lucide-react";
import type { Category } from "@/types";

const ICONS: Record<string, LucideIcon> = {
  acao: Crosshair,
  aventura: Map,
  rpg: Swords,
  terror: Ghost,
  corrida: Car,
  estrategia: Castle,
  indie: Sparkles,
  simulacao: Plane,
  esportes: Trophy,
};

export function CategoryGrid({ categories }: { categories: Category[] }) {
  if (!categories.length) return null;
  return (
    <section className="container-page py-8">
      <h2 className="section-title mb-5">Explore por categoria</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {categories.map((c) => {
          const Icon = ICONS[c.slug] ?? Gamepad2;
          return (
            <Link
              key={c.id}
              href={`/jogos?categoria=${c.slug}`}
              className="group relative flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-surface p-4 transition hover:-translate-y-0.5 hover:border-accent/50"
            >
              <span className="grid size-11 place-items-center rounded-xl bg-gradient-to-br from-accent/25 to-accent-2/10 transition group-hover:from-accent group-hover:to-accent-2">
                <Icon className="size-5 text-accent transition group-hover:text-white" />
              </span>
              <span className="font-display font-semibold text-white">{c.name}</span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
