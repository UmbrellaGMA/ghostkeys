import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Ban, RefreshCw, RotateCcw, Search, Undo2 } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABEL, type Order, type OrderItem, type OrderStatus, type Payment } from "@/types";
import { itemProfit } from "@/services/PricingService";
import { AdminHeader, Table } from "@/components/admin/AdminUI";
import { ActionButton } from "@/components/admin/ActionButton";
import { OrderStatusBadge, PAYMENT_STATUS_LABEL } from "@/components/account/OrderStatusBadge";
import { cancelOrderAction, refundOrderAction, retryDeliveryAction, syncPaymentAction } from "../../actions";
import { OrderNoteForm } from "./OrderNoteForm";

export default async function AdminOrderDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const db = createAdminClient();
  const { data: order } = await db.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) notFound();
  const o = order as Order;

  const [{ data: items }, { data: payments }, { data: attempts }, { data: events }, { data: keys }] = await Promise.all([
    db.from("order_items").select("*").eq("order_id", id),
    db.from("payments").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    db.from("delivery_attempts").select("*").eq("order_id", id).order("started_at", { ascending: false }),
    db.from("order_events").select("*").eq("order_id", id).order("created_at", { ascending: false }),
    // Nunca seleciona encrypted_key no painel: apenas metadados
    db.from("digital_keys").select("id, order_item_id, supplier_key_id, key_last4, delivery_status, is_test, delivered_at, revoked_at, order_items!inner(order_id)").eq("order_items.order_id", id),
  ]);
  const its = (items ?? []) as OrderItem[];
  const profit = its.reduce((s, i) => s + itemProfit(i), 0) - o.discount_cents;
  const canRetry = ["paid", "delivery_failed"].includes(o.status) || (o.status === "processing" && Date.now() - new Date(o.updated_at).getTime() > 10 * 60_000);
  const canRefund = ["paid", "delivered", "delivery_failed"].includes(o.status);

  return (
    <>
      <Link href="/admin/pedidos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Pedidos
      </Link>
      <AdminHeader
        title={`Pedido #${o.order_number}`}
        description={`${o.customer_name} · ${o.customer_email} · criado em ${formatDateTime(o.created_at)}`}
        actions={
          <>
            <ActionButton action={syncPaymentAction.bind(null, o.id)}>
              <Search className="size-4" /> Consultar pagamento
            </ActionButton>
            <ActionButton action={retryDeliveryAction.bind(null, o.id)} disabled={!canRetry} className="btn-primary" confirm="Reprocessar a entrega? Apenas as keys faltantes serão geradas.">
              <RotateCcw className="size-4" /> Reprocessar entrega
            </ActionButton>
            {o.status === "pending_payment" && (
              <ActionButton action={cancelOrderAction.bind(null, o.id)} className="btn-danger" confirm="Cancelar este pedido? Pagamentos PIX pendentes serão cancelados no Mercado Pago.">
                <Ban className="size-4" /> Cancelar
              </ActionButton>
            )}
            {canRefund && (
              <ActionButton action={refundOrderAction.bind(null, o.id)} className="btn-danger" confirm={`Reembolsar ${formatBRL(o.total_cents)} via Mercado Pago e desativar as keys deste pedido?`}>
                <Undo2 className="size-4" /> Reembolsar
              </ActionButton>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="card p-4"><p className="text-xs text-muted">Status</p><OrderStatusBadge status={o.status} className="mt-2" /></div>
        <div className="card p-4"><p className="text-xs text-muted">Total</p><p className="mt-1 font-display text-xl font-bold text-white">{formatBRL(o.total_cents)}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Lucro estimado</p><p className={`mt-1 font-display text-xl font-bold ${profit >= 0 ? "text-success" : "text-danger"}`}>{formatBRL(profit)}</p></div>
        <div className="card p-4"><p className="text-xs text-muted">Tentativas de entrega</p><p className="mt-1 font-display text-xl font-bold text-white">{o.delivery_attempts}</p></div>
      </div>
      {o.last_delivery_error && o.status !== "delivered" && (
        <p className="mb-6 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-red-200">
          Último erro: {o.last_delivery_error}
          {o.next_delivery_attempt_at && ` · próxima tentativa automática: ${formatDateTime(o.next_delivery_attempt_at)}`}
        </p>
      )}

      <section className="mb-6">
        <h2 className="mb-3 font-display text-lg font-bold text-white">Itens</h2>
        <Table>
          <thead><tr><th>Produto</th><th>AppID</th><th>Região</th><th>Qtd.</th><th className="text-right">Custo (un.)</th><th className="text-right">Preço (un.)</th><th className="text-right">Lucro</th></tr></thead>
          <tbody>
            {its.map((i) => (
              <tr key={i.id}>
                <td className="font-semibold text-fg">{i.product_name}</td>
                <td className="font-mono text-xs text-muted">{i.supplier_product_id}</td>
                <td>{i.activation_region ?? "—"}</td>
                <td>{i.quantity}</td>
                <td className="text-right">{formatBRL(i.supplier_cost_cents)}</td>
                <td className="text-right">{formatBRL(i.unit_price_cents)}</td>
                <td className="text-right text-success">{formatBRL(itemProfit(i))}</td>
              </tr>
            ))}
          </tbody>
        </Table>
        {o.discount_cents > 0 && <p className="mt-2 text-sm text-muted">Desconto aplicado: {formatBRL(o.discount_cents)} {o.coupon_code ? `(cupom ${o.coupon_code})` : ""}</p>}
      </section>

      <div className="grid gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-white">Pagamentos (Mercado Pago)</h2>
          <Table>
            <thead><tr><th>ID MP</th><th>Método</th><th>Status</th><th className="text-right">Valor</th><th>Data</th></tr></thead>
            <tbody>
              {((payments ?? []) as Payment[]).map((p) => (
                <tr key={p.id}>
                  <td className="font-mono text-xs">{p.external_payment_id ?? "—"}</td>
                  <td>{p.payment_method === "pix" ? "PIX" : `Cartão ${p.payment_method_id ?? ""}${p.installments ? ` ${p.installments}x` : ""}`}</td>
                  <td>{PAYMENT_STATUS_LABEL[p.status] ?? p.status}<span className="block text-xs text-muted">{p.status_detail}</span></td>
                  <td className="text-right">{formatBRL(p.amount_cents)}{p.refunded_amount_cents > 0 && <span className="block text-xs text-danger">estornado {formatBRL(p.refunded_amount_cents)}</span>}</td>
                  <td className="text-muted">{formatDateTime(p.created_at)}</td>
                </tr>
              ))}
              {!payments?.length && <tr><td colSpan={5} className="py-6 text-center text-muted">Nenhum pagamento.</td></tr>}
            </tbody>
          </Table>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-white">Keys entregues</h2>
          <Table>
            <thead><tr><th>ID fornecedor</th><th>Final</th><th>Status</th><th>Entregue</th></tr></thead>
            <tbody>
              {(keys ?? []).map((k) => (
                <tr key={k.id}>
                  <td className="font-mono text-xs">{k.supplier_key_id ?? "—"}{k.is_test && <span className="badge ml-2 bg-warning/15 text-warning">teste</span>}</td>
                  <td className="font-mono">••••{k.key_last4}</td>
                  <td>{k.delivery_status === "delivered" ? "Entregue" : `Revogada ${formatDateTime(k.revoked_at)}`}</td>
                  <td className="text-muted">{formatDateTime(k.delivered_at)}</td>
                </tr>
              ))}
              {!keys?.length && <tr><td colSpan={4} className="py-6 text-center text-muted">Nenhuma key entregue.</td></tr>}
            </tbody>
          </Table>
          <p className="mt-2 text-xs text-muted">Por segurança, o painel exibe apenas os 4 últimos caracteres. O cliente visualiza a key completa na área do cliente.</p>
        </section>

        <section>
          <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-bold text-white"><RefreshCw className="size-4" /> Tentativas de entrega</h2>
          <Table>
            <thead><tr><th>#</th><th>Origem</th><th>Resultado</th><th>Keys</th><th>Início</th></tr></thead>
            <tbody>
              {(attempts ?? []).map((a) => (
                <tr key={a.id}>
                  <td>{a.attempt_number}</td>
                  <td className="text-xs text-muted">{a.triggered_by}</td>
                  <td>
                    <span className={a.status === "success" ? "text-success" : a.status === "started" ? "text-warning" : "text-danger"}>{a.status}</span>
                    {a.error_message && <span className="block max-w-64 truncate text-xs text-muted" title={a.error_message}>{a.error_code}: {a.error_message}</span>}
                  </td>
                  <td>{a.keys_generated}</td>
                  <td className="text-muted">{formatDateTime(a.started_at)}</td>
                </tr>
              ))}
              {!attempts?.length && <tr><td colSpan={5} className="py-6 text-center text-muted">Nenhuma tentativa.</td></tr>}
            </tbody>
          </Table>
        </section>

        <section>
          <h2 className="mb-3 font-display text-lg font-bold text-white">Histórico de processamento</h2>
          <div className="card p-4">
            <OrderNoteForm orderId={o.id} />
            <ol className="mt-4 space-y-3">
              {(events ?? []).map((e: { id: number; from_status: OrderStatus | null; to_status: OrderStatus | null; message: string | null; actor: string; created_at: string }) => (
                <li key={e.id} className="border-l-2 border-line pl-3 text-sm">
                  <p className="text-fg">
                    {e.to_status && <strong>{e.from_status ? `${ORDER_STATUS_LABEL[e.from_status]} → ` : ""}{ORDER_STATUS_LABEL[e.to_status]}</strong>}
                    {e.to_status && e.message ? " · " : ""}
                    <span className={e.message?.startsWith("ALERTA") ? "text-warning" : ""}>{e.message}</span>
                  </p>
                  <p className="text-xs text-subtle">{formatDateTime(e.created_at)} · {e.actor}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>
      </div>
    </>
  );
}
