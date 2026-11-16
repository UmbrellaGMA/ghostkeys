import Link from "next/link";
import { AlertTriangle, CheckCircle2, Clock, DollarSign, Hourglass, ShoppingBag, TrendingUp } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import type { Order } from "@/types";
import { AdminHeader, StatCard, Table } from "@/components/admin/AdminUI";
import { OrderStatusBadge } from "@/components/account/OrderStatusBadge";

const PERIODS = { "7": "7 dias", "30": "30 dias", "90": "90 dias", "365": "12 meses" } as const;

interface Stats {
  revenue_cents: number;
  cost_cents: number;
  sales_count: number;
  pending_payment: number;
  awaiting_delivery: number;
  delivered: number;
  delivery_failed: number;
  refunded: number;
  top_products: Array<{ name: string; quantity: number; revenue_cents: number }>;
}

export default async function AdminDashboard({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  await requireAdminPage();
  const periodo = ((await searchParams).periodo ?? "30") as keyof typeof PERIODS;
  const days = Number(PERIODS[periodo] ? periodo : "30");
  const since = new Date(Date.now() - days * 86_400_000).toISOString();
  const db = createAdminClient();

  const [{ data: statsData, error }, { data: recent }] = await Promise.all([
    db.rpc("admin_dashboard_stats", { p_since: since }),
    db.from("orders").select("*").order("created_at", { ascending: false }).limit(10),
  ]);
  const s = (statsData ?? {}) as Stats;
  const profit = (s.revenue_cents ?? 0) - (s.cost_cents ?? 0);

  return (
    <>
      <AdminHeader
        title="Dashboard"
        description="Visão geral das vendas e entregas."
        actions={Object.entries(PERIODS).map(([k, label]) => (
          <Link key={k} href={`/admin?periodo=${k}`} className={k === String(days) ? "btn-primary" : "btn-secondary"}>
            {label}
          </Link>
        ))}
      />
      {error && <p className="mb-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-red-200">Erro ao carregar estatísticas: {error.message}</p>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Faturamento" value={formatBRL(s.revenue_cents ?? 0)} icon={DollarSign} hint={`Últimos ${PERIODS[periodo] ?? "30 dias"}`} />
        <StatCard label="Lucro estimado" value={formatBRL(profit)} icon={TrendingUp} tone="success" hint="Receita − custo congelado na venda" />
        <StatCard label="Vendas" value={s.sales_count ?? 0} icon={ShoppingBag} />
        <StatCard label="Entregues" value={s.delivered ?? 0} icon={CheckCircle2} tone="success" />
        <StatCard label="Aguardando pagamento" value={s.pending_payment ?? 0} icon={Hourglass} tone="warning" />
        <StatCard label="Pagos aguardando entrega" value={s.awaiting_delivery ?? 0} icon={Clock} tone="warning" />
        <StatCard label="Entregas com falha" value={s.delivery_failed ?? 0} icon={AlertTriangle} tone="danger" hint={s.delivery_failed ? "Requer atenção" : undefined} />
        <StatCard label="Reembolsos" value={s.refunded ?? 0} icon={DollarSign} tone="danger" />
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1fr_360px]">
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display text-lg font-bold text-white">Últimas compras</h2>
            <Link href="/admin/pedidos" className="text-sm text-accent hover:underline">Ver todos</Link>
          </div>
          <Table>
            <thead>
              <tr><th>Pedido</th><th>Cliente</th><th>Data</th><th>Status</th><th className="text-right">Total</th></tr>
            </thead>
            <tbody>
              {((recent ?? []) as Order[]).map((o) => (
                <tr key={o.id}>
                  <td><Link href={`/admin/pedidos/${o.id}`} className="font-semibold text-accent hover:underline">#{o.order_number}</Link></td>
                  <td className="max-w-48 truncate">{o.customer_email}</td>
                  <td className="text-muted">{formatDateTime(o.created_at)}</td>
                  <td><OrderStatusBadge status={o.status} /></td>
                  <td className="text-right font-semibold text-white">{formatBRL(o.total_cents)}</td>
                </tr>
              ))}
              {!recent?.length && (
                <tr><td colSpan={5} className="py-8 text-center text-muted">Nenhum pedido ainda.</td></tr>
              )}
            </tbody>
          </Table>
        </section>
        <section className="card h-fit p-5">
          <h2 className="mb-4 font-display text-lg font-bold text-white">Produtos mais vendidos</h2>
          {!s.top_products?.length ? (
            <p className="text-sm text-muted">Sem vendas entregues no período.</p>
          ) : (
            <ol className="space-y-3">
              {s.top_products.map((p, i) => (
                <li key={p.name} className="flex items-center gap-3 text-sm">
                  <span className="grid size-7 shrink-0 place-items-center rounded-lg bg-surface-3 font-bold text-muted">{i + 1}</span>
                  <span className="flex-1 truncate text-fg">{p.name}</span>
                  <span className="text-right">
                    <span className="block font-semibold text-white">{p.quantity} un.</span>
                    <span className="text-xs text-muted">{formatBRL(Number(p.revenue_cents))}</span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </>
  );
}
