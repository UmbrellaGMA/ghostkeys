import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABEL, type Order, type OrderStatus } from "@/types";
import { AdminHeader, Table } from "@/components/admin/AdminUI";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { Pagination } from "@/components/catalog/Pagination";
import { OrderCards } from "@/components/admin/OrderCards";

const PER_PAGE = 30;

export default async function AdminOrders({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; pagina?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.pagina) || 1);
  const db = createAdminClient();

  let q = db.from("orders").select("*", { count: "exact" });
  if (sp.status && sp.status in ORDER_STATUS_LABEL) q = q.eq("status", sp.status);
  if (sp.q) {
    const term = sp.q.trim().replace(/^#/, "");
    q = /^\d+$/.test(term) ? q.eq("order_number", Number(term)) : q.ilike("customer_email", `%${term.replace(/[\\%_,()]/g, "")}%`);
  }
  const { data, count } = await q.order("created_at", { ascending: false }).range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const orders = (data ?? []) as Order[];

  const href = (p: number) => {
    const params = new URLSearchParams();
    if (sp.status) params.set("status", sp.status);
    if (sp.q) params.set("q", sp.q);
    if (p > 1) params.set("pagina", String(p));
    return `/admin/pedidos${params.size ? `?${params}` : ""}`;
  };

  return (
    <>
      <AdminHeader title="Pedidos" description={`${count ?? 0} pedido(s)`} />
      <form className="mb-4 grid grid-cols-[1fr_auto] gap-2 sm:flex sm:flex-wrap" action="/admin/pedidos">
        <input name="q" defaultValue={sp.q} placeholder="Nº do pedido ou e-mail" className="input col-span-2 sm:max-w-xs" type="search" />
        <select name="status" defaultValue={sp.status ?? ""} className="input sm:max-w-56">
          <option value="">Todos os status</option>
          {(Object.keys(ORDER_STATUS_LABEL) as OrderStatus[]).map((s) => (
            <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
          ))}
        </select>
        <button className="btn-secondary">Filtrar</button>
      </form>
      <OrderCards orders={orders} />
      <div className="hidden md:block">
      <Table>
        <thead>
          <tr><th>Pedido</th><th>Cliente</th><th>Criado</th><th>Pagamento</th><th>Status</th><th>Tentativas</th><th className="text-right">Total</th></tr>
        </thead>
        <tbody>
          {orders.map((o) => (
            <tr key={o.id}>
              <td><Link href={`/admin/pedidos/${o.id}`} className="font-semibold text-accent hover:underline">#{o.order_number}</Link></td>
              <td><p className="max-w-56 truncate">{o.customer_name}</p><p className="max-w-56 truncate text-xs text-muted">{o.customer_email}</p></td>
              <td className="text-muted">{formatDateTime(o.created_at)}</td>
              <td className="uppercase text-muted">{o.payment_method ?? "—"}</td>
              <td><OrderStatusBadge status={o.status} />{o.last_delivery_error && o.status !== "delivered" && <p className="mt-1 max-w-56 truncate text-xs text-danger" title={o.last_delivery_error}>{o.last_delivery_error}</p>}</td>
              <td className="text-muted">{o.delivery_attempts}</td>
              <td className="text-right font-semibold text-white">{formatBRL(o.total_cents)}</td>
            </tr>
          ))}
          {!orders.length && <tr><td colSpan={7} className="py-10 text-center text-muted">Nenhum pedido encontrado.</td></tr>}
        </tbody>
      </Table>
      </div>
      <Pagination page={page} totalPages={Math.ceil((count ?? 0) / PER_PAGE)} buildHref={href} />
    </>
  );
}
