import Link from "next/link";
import { ChevronRight, CreditCard, QrCode } from "lucide-react";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { Order } from "@/types";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";

/** Lista de pedidos em cartões (celular). No computador as páginas usam a tabela. */
export function OrderCards({ orders, empty = "Nenhum pedido encontrado." }: { orders: Order[]; empty?: string }) {
  if (!orders.length) return <p className="card p-8 text-center text-sm text-muted md:hidden">{empty}</p>;
  return (
    <ul className="space-y-2.5 md:hidden">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/admin/pedidos/${o.id}`} className="card flex items-center gap-3 p-4 active:bg-surface-2">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="font-display font-bold text-white">#{o.order_number}</span>
                <span className="font-semibold text-white">{formatBRL(o.total_cents)}</span>
              </div>
              <p className="truncate text-sm text-fg">{o.customer_name || o.customer_email}</p>
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
                <OrderStatusBadge status={o.status} />
                {o.payment_method === "pix" && <span className="inline-flex items-center gap-1"><QrCode className="size-3" /> PIX</span>}
                {o.payment_method === "card" && <span className="inline-flex items-center gap-1"><CreditCard className="size-3" /> Cartão</span>}
                <span>{formatDateTime(o.created_at)}</span>
              </div>
              {o.last_delivery_error && o.status !== "delivered" && <p className="line-clamp-2 text-xs text-danger">{o.last_delivery_error}</p>}
            </div>
            <ChevronRight className="size-4 shrink-0 text-subtle" />
          </Link>
        </li>
      ))}
    </ul>
  );
}
