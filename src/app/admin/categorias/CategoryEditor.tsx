"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2 } from "lucide-react";
import type { Category } from "@/types";
import { slugify } from "@/lib/utils";
import { toast } from "@/components/ui/Toaster";
import { deleteCategoryAction, saveCategoryAction } from "../actions";

export function CategoryEditor({ category, productCount }: { category: Category | null; productCount: number }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [f, setF] = useState({
    name: category?.name ?? "",
    slug: category?.slug ?? "",
    tags: category?.supplier_tags.join(", ") ?? "",
    sort_order: String(category?.sort_order ?? 99),
  });

  const save = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const r = await saveCategoryAction(category?.id ?? null, {
        name: f.name,
        slug: f.slug || slugify(f.name),
        supplier_tags: f.tags.split(",").map((t) => t.trim()).filter(Boolean),
        sort_order: f.sort_order,
      });
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) {
        if (!category) setF({ name: "", slug: "", tags: "", sort_order: "99" });
        router.refresh();
      }
    });
  };

  return (
    <form onSubmit={save} className={`card grid gap-3 p-4 md:grid-cols-[1fr_1fr_2fr_90px_auto] md:items-end ${!category ? "border-dashed" : ""}`}>
      <div>
        <label className="label">{category ? "Nome" : "Nova categoria"}</label>
        <input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: category ? f.slug : slugify(e.target.value) })} required />
      </div>
      <div><label className="label">Slug</label><input className="input font-mono" value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} required /></div>
      <div>
        <label className="label">Tags do fornecedor (separadas por vírgula)</label>
        <input className="input" value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="Action, Shooter" />
      </div>
      <div><label className="label">Ordem</label><input className="input" type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: e.target.value })} /></div>
      <div className="flex gap-2">
        <button disabled={pending} className="btn-primary">
          {pending ? <Loader2 className="size-4 animate-spin" /> : !category && <Plus className="size-4" />} {category ? "Salvar" : "Criar"}
        </button>
        {category && (
          <button
            type="button"
            className="btn-danger px-3"
            aria-label="Excluir"
            onClick={() => {
              if (!confirm(`Excluir "${category.name}"? ${productCount} produto(s) perderão esta categoria.`)) return;
              start(async () => {
                const r = await deleteCategoryAction(category.id);
                toast(r.message, r.ok ? "success" : "error");
                router.refresh();
              });
            }}
          >
            <Trash2 className="size-4" />
          </button>
        )}
      </div>
      {category && <p className="text-xs text-muted md:col-span-5">{productCount} produto(s) nesta categoria</p>}
    </form>
  );
}
