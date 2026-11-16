import Link from "next/link";
import { Package } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { Order, OrderItem } from "@/types";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Pagination } from "@/components/catalog/Pagination";

export const metadata = { title: "Meus pedidos" };
const PER_PAGE = 10;

export default async function OrdersPage({ searchParams }: { searchParams: Promise<{ pagina?: string }> }) {
  const user = await requireUser("/conta/pedidos");
  const page = Math.max(1, Number((await searchParams).pagina) || 1);
  const supabase = await createClient();
  const { data, count } = await supabase
    .from("orders")
    .select("*, order_items(product_name, quantity)", { count: "exact" })
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PER_PAGE, page * PER_PAGE - 1);
  const orders = (data ?? []) as Array<Order & { order_items: Pick<OrderItem, "product_name" | "quantity">[] }>;

  return (
    <div className="space-y-6">
      <h1 className="font-display text-3xl font-bold text-white">Pedidos e keys</h1>
      {!orders.length ? (
        <EmptyState icon={Package} title="Nenhum pedido ainda" description="Quando você comprar, seus pedidos e keys aparecem aqui." action={{ label: "Explorar jogos", href: "/jogos" }} />
      ) : (
        <ul className="space-y-3">
          {orders.map((o) => (
            <li key={o.id}>
              <Link href={o.status === "pending_payment" ? `/pedido/${o.id}` : `/conta/pedidos/${o.id}`} className="card flex flex-col gap-3 p-5 transition hover:border-accent/50 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm text-muted">
                    Pedido <strong className="text-fg">#{o.order_number}</strong> · {formatDateTime(o.created_at)}
                  </p>
                  <p className="mt-1 line-clamp-1 font-semibold text-white">{o.order_items.map((i) => `${i.product_name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`).join(", ")}</p>
                </div>
                <div className="flex items-center gap-3">
                  <OrderStatusBadge status={o.status} />
                  <span className="font-display text-lg font-bold text-white">{formatBRL(o.total_cents)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pagination page={page} totalPages={Math.ceil((count ?? 0) / PER_PAGE)} buildHref={(p) => `/conta/pedidos${p > 1 ? `?pagina=${p}` : ""}`} />
    </div>
  );
}
