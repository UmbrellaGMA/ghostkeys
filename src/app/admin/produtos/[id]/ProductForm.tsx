"use client";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import type { Category, Product, StoreSettings } from "@/types";
import { calculateSalePrice } from "@/services/PricingService";
import { formatBRL, parseBRLInput } from "@/lib/money";
import { toast } from "@/components/ui/Toaster";
import { updateProductAction, uploadProductImageAction } from "../../actions";

const centsToInput = (c: number | null | undefined) => (c ? (c / 100).toFixed(2).replace(".", ",") : "");

function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export function ProductForm({ product, categories, categoryIds, settings }: { product: Product; categories: Category[]; categoryIds: string[]; settings: StoreSettings }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);
  const [f, setF] = useState({
    name: product.name,
    slug: product.slug,
    description: product.description ?? "",
    short_description: product.short_description ?? "",
    image_url: product.image_url ?? "",
    background_url: product.background_url ?? "",
    category_id: product.category_id ?? "",
    category_ids: categoryIds,
    platform: product.platform,
    activation_region: product.activation_region ?? "",
    pricing_mode: product.pricing_mode,
    custom_price: centsToInput(product.custom_price_cents),
    original_price: centsToInput(product.original_price_cents),
    promo_price: centsToInput(product.promo_price_cents),
    promo_ends_at: toLocalInput(product.promo_ends_at),
    active: product.active,
    featured: product.featured,
  });
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((s) => ({ ...s, [k]: v }));

  const globalPrice = useMemo(() => (product.supplier_cost_cents !== null ? calculateSalePrice(product.supplier_cost_cents, settings) : null), [product.supplier_cost_cents, settings]);
  const customCents = parseBRLInput(f.custom_price);
  const salePreview = f.pricing_mode === "custom" ? customCents : globalPrice;

  const upload = async (field: "image_url" | "background_url", file: File) => {
    setUploading(field);
    const fd = new FormData();
    fd.set("file", file);
    const r = await uploadProductImageAction(fd);
    setUploading(null);
    if (r.ok && r.url) set(field, r.url);
    toast(r.message, r.ok ? "success" : "error");
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: f.name,
      slug: f.slug,
      description: f.description || null,
      short_description: f.short_description || null,
      image_url: f.image_url,
      background_url: f.background_url,
      category_id: f.category_id,
      category_ids: f.category_ids,
      platform: f.platform,
      activation_region: f.activation_region,
      pricing_mode: f.pricing_mode,
      custom_price_cents: f.pricing_mode === "custom" ? parseBRLInput(f.custom_price) : null,
      original_price_cents: f.original_price ? parseBRLInput(f.original_price) : null,
      promo_price_cents: f.promo_price ? parseBRLInput(f.promo_price) : null,
      promo_ends_at: f.promo_ends_at || null,
      active: f.active,
      featured: f.featured,
    };
    start(async () => {
      const r = await updateProductAction(product.id, payload);
      toast(r.message, r.ok ? "success" : "error");
      if (r.ok) router.refresh();
    });
  };

  return (
    <form onSubmit={submit} className="grid gap-6 xl:grid-cols-[1fr_380px]">
      <div className="space-y-6">
        <section className="card grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-display text-lg font-bold text-white sm:col-span-2">Informações</h2>
          <div><label className="label">Nome</label><input className="input" value={f.name} onChange={(e) => set("name", e.target.value)} required /></div>
          <div><label className="label">Slug (URL)</label><input className="input font-mono" value={f.slug} onChange={(e) => set("slug", e.target.value.toLowerCase())} required /></div>
          <div className="sm:col-span-2"><label className="label">Resumo</label><input className="input" value={f.short_description} onChange={(e) => set("short_description", e.target.value)} maxLength={600} /></div>
          <div className="sm:col-span-2"><label className="label">Descrição</label><textarea className="input min-h-36" value={f.description} onChange={(e) => set("description", e.target.value)} /></div>
          <div><label className="label">Plataforma</label><input className="input" value={f.platform} onChange={(e) => set("platform", e.target.value)} required /></div>
          <div>
            <label className="label">Região de ativação</label>
            <input className="input" value={f.activation_region} onChange={(e) => set("activation_region", e.target.value)} placeholder={settings.default_activation_region ? `Padrão: ${settings.default_activation_region}` : "Ex.: Brasil, Global"} />
          </div>
        </section>

        <section className="card grid gap-4 p-6 sm:grid-cols-2">
          <h2 className="font-display text-lg font-bold text-white sm:col-span-2">Imagens</h2>
          {(["image_url", "background_url"] as const).map((field) => (
            <div key={field}>
              <label className="label">{field === "image_url" ? "Capa" : "Imagem de fundo"}</label>
              <input className="input mb-2" value={f[field]} onChange={(e) => set(field, e.target.value)} placeholder="https://..." />
              <label className="btn-secondary cursor-pointer text-xs">
                {uploading === field ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />} Enviar arquivo
                <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(field, e.target.files[0])} />
              </label>
              {f[field] && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={f[field]} alt="" className="mt-3 aspect-[460/215] w-full rounded-lg object-cover" />
              )}
            </div>
          ))}
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="font-display text-lg font-bold text-white">Categorias</h2>
          <div>
            <label className="label">Categoria principal</label>
            <select className="input max-w-xs" value={f.category_id} onChange={(e) => set("category_id", e.target.value)}>
              <option value="">Nenhuma</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            {categories.map((c) => {
              const on = f.category_ids.includes(c.id);
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => set("category_ids", on ? f.category_ids.filter((x) => x !== c.id) : [...f.category_ids, c.id])}
                  className={`badge cursor-pointer px-3 py-1.5 text-xs ${on ? "bg-accent text-white" : "bg-surface-3 text-muted hover:text-fg"}`}
                >
                  {c.name}
                </button>
              );
            })}
          </div>
          {product.tags.length > 0 && <p className="text-xs text-muted">Tags do fornecedor: {product.tags.join(", ")}</p>}
        </section>
      </div>

      <aside className="space-y-6 xl:sticky xl:top-8 xl:self-start">
        <section className="card space-y-4 p-6">
          <h2 className="font-display text-lg font-bold text-white">Preço</h2>
          <dl className="grid grid-cols-2 gap-2 rounded-xl bg-surface-2 p-3 text-sm">
            <dt className="text-muted">Custo fornecedor</dt><dd className="text-right font-semibold">{formatBRL(product.supplier_cost_cents)}</dd>
            <dt className="text-muted">Preço pela margem global</dt><dd className="text-right font-semibold">{formatBRL(globalPrice)}</dd>
            <dt className="text-muted">Preço de venda</dt><dd className="text-right font-bold text-white">{formatBRL(salePreview ?? null)}</dd>
          </dl>
          <div className="grid grid-cols-2 gap-2">
            {(["global", "custom"] as const).map((m) => (
              <label key={m} className={`btn cursor-pointer border ${f.pricing_mode === m ? "border-accent bg-accent/15 text-white" : "border-line-strong text-muted"}`}>
                <input type="radio" className="hidden" checked={f.pricing_mode === m} onChange={() => set("pricing_mode", m)} />
                {m === "global" ? "Margem global" : "Personalizado"}
              </label>
            ))}
          </div>
          {f.pricing_mode === "custom" && (
            <div><label className="label">Preço personalizado (R$)</label><input className="input" inputMode="decimal" value={f.custom_price} onChange={(e) => set("custom_price", e.target.value)} placeholder="0,00" /></div>
          )}
          <div><label className="label">Preço original “de” (opcional)</label><input className="input" inputMode="decimal" value={f.original_price} onChange={(e) => set("original_price", e.target.value)} placeholder="0,00" /></div>
          <div><label className="label">Preço promocional (opcional)</label><input className="input" inputMode="decimal" value={f.promo_price} onChange={(e) => set("promo_price", e.target.value)} placeholder="0,00" /></div>
          <div><label className="label">Promoção válida até</label><input type="datetime-local" className="input" value={f.promo_ends_at} onChange={(e) => set("promo_ends_at", e.target.value)} /></div>
          <p className="text-xs text-muted">Alterações de preço não afetam pedidos já criados (preço e custo ficam congelados em cada pedido).</p>
        </section>

        <section className="card space-y-3 p-6">
          <label className="flex items-center justify-between text-sm"><span>Ativo na loja</span><input type="checkbox" checked={f.active} onChange={(e) => set("active", e.target.checked)} className="size-4 accent-[var(--color-accent)]" /></label>
          <label className="flex items-center justify-between text-sm"><span>Em destaque</span><input type="checkbox" checked={f.featured} onChange={(e) => set("featured", e.target.checked)} className="size-4 accent-[var(--color-accent)]" /></label>
          <p className="text-xs text-muted">Disponibilidade no fornecedor: <strong className={product.available ? "text-success" : "text-warning"}>{product.available ? "disponível" : "indisponível"}</strong> (atualizada pela sincronização).</p>
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending && <Loader2 className="size-4 animate-spin" />} Salvar alterações
          </button>
        </section>
      </aside>
    </form>
  );
}
