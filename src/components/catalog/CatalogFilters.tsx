"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Loader2, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  categories: Array<{ slug: string; name: string }>;
  values: { q?: string; categoria?: string; colecao?: string; min?: string; max?: string; promo?: boolean; indisponiveis?: boolean; sort?: string };
}

/** Formulário GET (funciona sem JavaScript) com envio automático ao alterar filtros. */
export function CatalogFilters({ categories, values }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  // No celular os filtros começam recolhidos para os jogos aparecerem logo
  const [open, setOpen] = useState(false);
  const activeCount = [values.q, values.categoria, values.min, values.max, values.promo, values.indisponiveis, values.sort].filter(Boolean).length;

  const apply = () => {
    const form = formRef.current;
    if (!form) return;
    const params = new URLSearchParams();
    new FormData(form).forEach((v, k) => {
      if (typeof v === "string" && v.trim() !== "") params.set(k, v.trim());
    });
    startTransition(() => router.push(`/jogos${params.size ? `?${params}` : ""}`));
  };

  return (
    <form
      ref={formRef}
      method="get"
      action="/jogos"
      onSubmit={(e) => {
        e.preventDefault();
        setOpen(false);
        apply();
      }}
      className={cn("card p-4 sm:p-5", open && "space-y-5", "lg:space-y-5")}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="catalog-filters-body"
        className="flex w-full items-center justify-between gap-2 text-left lg:pointer-events-none"
      >
        <h2 className="flex items-center gap-2 font-display font-bold text-white">
          <SlidersHorizontal className="size-4 text-accent" /> Filtros
          {activeCount > 0 && <span className="badge bg-accent text-white">{activeCount}</span>}
        </h2>
        {pending ? (
          <Loader2 className="size-4 animate-spin text-muted" />
        ) : (
          <ChevronDown className={cn("size-5 text-muted transition lg:hidden", open && "rotate-180")} />
        )}
      </button>

      <div id="catalog-filters-body" className={cn("space-y-5", open ? "block" : "hidden lg:block")}>

      {values.colecao && <input type="hidden" name="colecao" value={values.colecao} />}

      <div>
        <label className="label" htmlFor="f-q">Nome</label>
        <input id="f-q" name="q" defaultValue={values.q} className="input" placeholder="Ex.: Elden Ring" />
      </div>

      <div>
        <label className="label" htmlFor="f-cat">Categoria</label>
        <select id="f-cat" name="categoria" defaultValue={values.categoria ?? ""} onChange={apply} className="input">
          <option value="">Todas</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
      </div>

      <div>
        <span className="label">Preço (R$)</span>
        <div className="flex items-center gap-2">
          <input name="min" inputMode="decimal" defaultValue={values.min} className="input" placeholder="Mín." aria-label="Preço mínimo" />
          <span className="text-subtle">—</span>
          <input name="max" inputMode="decimal" defaultValue={values.max} className="input" placeholder="Máx." aria-label="Preço máximo" />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="f-sort">Ordenar por</label>
        <select id="f-sort" name="sort" defaultValue={values.sort ?? ""} onChange={apply} className="input">
          <option value="">Relevância</option>
          <option value="menor-preco">Menor preço</option>
          <option value="maior-preco">Maior preço</option>
          <option value="mais-vendidos">Mais vendidos</option>
          <option value="lancamentos">Lançamentos</option>
          <option value="nome">Nome (A-Z)</option>
        </select>
      </div>

      <div className="space-y-2.5">
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg">
          <input type="checkbox" name="promo" value="1" defaultChecked={values.promo} onChange={apply} className="size-4 accent-[var(--color-accent)]" />
          Somente promoções
        </label>
        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-fg">
          <input type="checkbox" name="indisponiveis" value="1" defaultChecked={values.indisponiveis} onChange={apply} className="size-4 accent-[var(--color-accent)]" />
          Mostrar indisponíveis
        </label>
      </div>

      <div className="flex gap-2">
        <button type="submit" className="btn-primary flex-1">Aplicar</button>
        <button type="button" onClick={() => startTransition(() => router.push("/jogos"))} className="btn-ghost">Limpar</button>
      </div>
      </div>
    </form>
  );
}
