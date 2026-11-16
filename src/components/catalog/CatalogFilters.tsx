"use client";
import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, SlidersHorizontal } from "lucide-react";

interface Props {
  categories: Array<{ slug: string; name: string }>;
  values: { q?: string; categoria?: string; colecao?: string; min?: string; max?: string; promo?: boolean; indisponiveis?: boolean; sort?: string };
}

/** Formulário GET (funciona sem JavaScript) com envio automático ao alterar filtros. */
export function CatalogFilters({ categories, values }: Props) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

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
        apply();
      }}
      className="card space-y-5 p-5"
    >
      <div className="flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display font-bold text-white">
          <SlidersHorizontal className="size-4 text-accent" /> Filtros
        </h2>
        {pending && <Loader2 className="size-4 animate-spin text-muted" />}
      </div>

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
    </form>
  );
}
