import Link from "next/link";
import { Image as ImageIcon, Plus, RefreshCw, Trash2 } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { Product } from "@/types";
import { effectivePrice } from "@/services/PricingService";
import { AdminHeader, Table } from "@/components/admin/AdminUI";
import { ActionButton, Toggle } from "@/components/admin/ActionButton";
import { Pagination } from "@/components/catalog/Pagination";
import { GameImage } from "@/components/product/GameImage";
import { deleteProductAction, enrichMediaAction, syncCatalogAction, toggleProductFlag } from "../actions";

const PER_PAGE = 30;
const FILTERS = { todos: "Todos", ativos: "Ativos", inativos: "Inativos", indisponiveis: "Indisponíveis", destaques: "Destaques", personalizados: "Preço personalizado" } as const;

export default async function AdminProducts({ searchParams }: { searchParams: Promise<{ q?: string; filtro?: string; pagina?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const filtro = (sp.filtro ?? "todos") as keyof typeof FILTERS;
  const db = createAdminClient();

  let q = db.from("products").select("*", { count: "exact" });
  if (sp.q) q = /^\d+$/.test(sp.q) ? q.eq("supplier_product_id", sp.q) : q.ilike("name", `%${sp.q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (filtro === "ativos") q = q.eq("active", true);
  if (filtro === "inativos") q = q.eq("active", false);
  if (filtro === "indisponiveis") q = q.eq("available", false);
  if (filtro === "destaques") q = q.eq("featured", true);
  if (filtro === "personalizados") q = q.eq("pricing_mode", "custom");
  const [{ data, count }, { data: lastSync }] = await Promise.all([
    q.order("name").range((page - 1) * PER_PAGE, page * PER_PAGE - 1),
    db.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const products = (data ?? []) as Product[];

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (sp.q) params.set("q", sp.q);
    if (filtro !== "todos") params.set("filtro", filtro);
    if (p > 1) params.set("pagina", String(p));
    return `/admin/produtos${params.size ? `?${params}` : ""}`;
  };

  return (
    <>
      <AdminHeader
        title="Produtos"
        description={`${count ?? 0} produto(s). Preços, disponibilidade e catálogo sincronizados com a ShadowKeys.`}
        actions={
          <>
            <ActionButton action={syncCatalogAction}>
              <RefreshCw className="size-4" /> Atualizar preços
            </ActionButton>
            <ActionButton action={enrichMediaAction.bind(null, undefined)} confirm="Buscar capas, fundos e descrições em português na Steam para todos os jogos? (uploads feitos por você não são substituídos)">
              <ImageIcon className="size-4" /> Atualizar capas
            </ActionButton>
            <Link href="/admin/produtos/importar" className="btn-primary">
              <Plus className="size-4" /> Adicionar jogos
            </Link>
          </>
        }
      />

      {lastSync && (
        <p className="mb-4 text-xs text-muted">
          Última sincronização: {formatDateTime(lastSync.started_at)} ·{" "}
          <span className={lastSync.status === "failed" ? "text-danger" : lastSync.status === "running" ? "text-warning" : "text-success"}>
            {lastSync.status === "running" ? `em andamento — página ${Math.max(0, (lastSync.next_page ?? 1) - 1)} de ${lastSync.total_pages ?? "?"}` : lastSync.status}
          </span>
          {lastSync.error ? ` · ${lastSync.error}` : ""}
          {lastSync.stats?.totalSupplier !== undefined ? ` · ${lastSync.stats.created} novos, ${lastSync.stats.updated} atualizados, ${lastSync.stats.deactivated} desativados` : ""}
        </p>
      )}

      <form className="mb-4 flex flex-wrap gap-2" action="/admin/produtos">
        <input name="q" defaultValue={sp.q} placeholder="Nome ou AppID" className="input max-w-xs" />
        <select name="filtro" defaultValue={filtro} className="input max-w-52">
          {Object.entries(FILTERS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>

      <Table>
        <thead>
          <tr>
            <th>Jogo</th><th>AppID</th><th className="text-right">Custo</th><th className="text-right">Preço</th><th className="text-right">Margem</th>
            <th>Fornecedor</th><th>Ativo</th><th>Destaque</th><th></th>
          </tr>
        </thead>
        <tbody>
          {products.map((p) => {
            const price = effectivePrice(p);
            const margin = p.supplier_cost_cents ? ((price - p.supplier_cost_cents) / p.supplier_cost_cents) * 100 : null;
            return (
              <tr key={p.id}>
                <td>
                  <div className="flex items-center gap-3">
                    <div className="relative h-9 w-[78px] shrink-0 overflow-hidden rounded">
                      <GameImage src={p.image_url} alt="" sizes="78px" />
                    </div>
                    <div className="min-w-0">
                      <p className="max-w-64 truncate font-semibold text-fg">{p.name}</p>
                      <p className="text-xs text-muted">{p.pricing_mode === "custom" ? "Preço personalizado" : "Margem global"}{p.promo_price_cents ? " · Promoção" : ""}</p>
                    </div>
                  </div>
                </td>
                <td className="font-mono text-xs text-muted">{p.supplier_product_id}</td>
                <td className="text-right">{formatBRL(p.supplier_cost_cents)}</td>
                <td className="text-right font-semibold text-white">{formatBRL(price)}</td>
                <td className={`text-right ${margin !== null && margin < 0 ? "text-danger" : "text-success"}`}>{margin === null ? "—" : `${margin.toFixed(1)}%`}</td>
                <td>{p.available ? <span className="badge bg-success/15 text-green-300">Disponível</span> : <span className="badge bg-surface-3 text-muted">Indisponível</span>}</td>
                <td><Toggle checked={p.active} label="Ativo" action={toggleProductFlag.bind(null, p.id, "active")} /></td>
                <td><Toggle checked={p.featured} label="Destaque" action={toggleProductFlag.bind(null, p.id, "featured")} /></td>
                <td>
                  <div className="flex items-center gap-3">
                    <Link href={`/admin/produtos/${p.id}`} className="text-sm font-semibold text-accent hover:underline">Editar</Link>
                    <ActionButton action={deleteProductAction.bind(null, p.id)} className="text-subtle hover:text-danger" confirm={`Remover "${p.name}" do catálogo? Pedidos antigos não são afetados.`}>
                      <Trash2 className="size-4" />
                    </ActionButton>
                  </div>
                </td>
              </tr>
            );
          })}
          {!products.length && (
            <tr><td colSpan={9} className="py-10 text-center text-muted">Nenhum jogo no catálogo. Use “Adicionar jogos” para escolher os jogos da loja.</td></tr>
          )}
        </tbody>
      </Table>
      <Pagination page={page} totalPages={Math.ceil((count ?? 0) / PER_PAGE)} buildHref={href} />
    </>
  );
}
