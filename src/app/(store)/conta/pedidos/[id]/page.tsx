import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Clock, CreditCard, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getActivationTutorials } from "@/services/CatalogService";
import { tutorialsForPlatforms } from "@/lib/tutorials";
import { ActivationTutorial } from "@/components/account/ActivationTutorial";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { ORDER_STATUS_LABEL, type Order, type OrderItem, type OrderStatus, type Payment } from "@/types";
import { OrderStatusBadge, PAYMENT_STATUS_LABEL } from "@/components/account/OrderStatusBadge";
import { KeyReveal } from "@/components/account/KeyReveal";
import { GameImage } from "@/components/product/GameImage";

export const metadata = { title: "Detalhes do pedido" };

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/conta/pedidos/${id}`);
  const supabase = await createClient();

  // Todas as consultas usam a sessão do usuário: RLS limita ao dono do pedido
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) notFound();
  const [{ data: items }, { data: payments }, { data: events }, allTutorials] = await Promise.all([
    supabase.from("order_items").select("*").eq("order_id", id),
    supabase.from("payments").select("id, payment_method, payment_method_id, status, status_detail, amount_cents, installments, created_at, approved_at").eq("order_id", id).order("created_at", { ascending: false }),
    supabase.from("order_events").select("id, to_status, created_at").eq("order_id", id).not("to_status", "is", null).order("created_at"),
    getActivationTutorials(),
  ]);
  const o = order as Order;
  const its = (items ?? []) as OrderItem[];
  const keyCount = its.reduce((s, i) => s + i.quantity, 0);
  const tutorials = tutorialsForPlatforms(allTutorials, its.map((i) => i.platform));

  return (
    <div className="space-y-6">
      <Link href="/conta/pedidos" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Voltar aos pedidos
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-white">Pedido #{o.order_number}</h1>
          <p className="text-sm text-muted">Realizado em {formatDateTime(o.created_at)}</p>
        </div>
        <OrderStatusBadge status={o.status} className="px-3 py-1 text-xs" />
      </div>

      {/* Keys */}
      <section className="card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">Suas keys</h2>
        {o.status === "delivered" ? (
          <>
            <KeyReveal orderId={o.id} keyCount={keyCount} autoLoad />
            {tutorials.map((t) => (
              <ActivationTutorial key={t.id} tutorial={t} className="mt-6 border-t border-line pt-6" />
            ))}
          </>
        ) : o.status === "pending_payment" ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">Aguardando pagamento. As keys são liberadas automaticamente após a aprovação.</p>
            <Link href={`/pedido/${o.id}`} className="btn-primary">
              <CreditCard className="size-4" /> Pagar agora
            </Link>
          </div>
        ) : o.status === "paid" || o.status === "processing" ? (
          <p className="flex items-center gap-2 text-sm text-muted">
            <Clock className="size-4 text-accent" /> Pagamento aprovado. Suas keys estão sendo geradas — atualize a página em instantes.
          </p>
        ) : o.status === "delivery_failed" ? (
          <p className="text-sm text-warning">
            Pagamento aprovado, mas a entrega está pendente por instabilidade no fornecedor. Nossa equipe vai concluir a entrega ou reembolsar você.{" "}
            <Link href="/paginas/atendimento" className="underline">Falar com o atendimento</Link>
          </p>
        ) : (
          <p className="text-sm text-muted">Pedido {ORDER_STATUS_LABEL[o.status].toLowerCase()} — nenhuma key disponível.</p>
        )}
      </section>

      {/* Itens */}
      <section className="card p-6">
        <h2 className="mb-4 font-display text-lg font-bold text-white">Itens</h2>
        <ul className="divide-y divide-line">
          {its.map((i) => (
            <li key={i.id} className="flex items-center gap-4 py-3">
              <div className="relative aspect-[460/215] w-28 shrink-0 overflow-hidden rounded-lg">
                <GameImage src={i.product_image_url} alt={i.product_name} sizes="112px" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-white">{i.product_name}</p>
                <p className="text-xs text-muted">
                  {i.platform} · Região: {i.activation_region ?? "—"} · Qtd. {i.quantity}
                </p>
              </div>
              <span className="font-semibold text-white">{formatBRL(i.unit_price_cents * i.quantity)}</span>
            </li>
          ))}
        </ul>
        <dl className="mt-4 space-y-1.5 border-t border-line pt-4 text-sm">
          <div className="flex justify-between text-muted"><dt>Subtotal</dt><dd>{formatBRL(o.subtotal_cents)}</dd></div>
          {o.discount_cents > 0 && <div className="flex justify-between text-muted"><dt>Desconto</dt><dd className="text-success">−{formatBRL(o.discount_cents)}</dd></div>}
          <div className="flex justify-between font-semibold text-white"><dt>Total</dt><dd>{formatBRL(o.total_cents)}</dd></div>
        </dl>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white"><CreditCard className="size-5 text-accent" /> Pagamentos</h2>
          {!payments?.length ? (
            <p className="text-sm text-muted">Nenhuma tentativa de pagamento.</p>
          ) : (
            <ul className="space-y-3 text-sm">
              {(payments as Payment[]).map((p) => (
                <li key={p.id} className="flex justify-between gap-3">
                  <span className="text-fg">
                    {p.payment_method === "pix" ? "PIX" : `Cartão${p.installments ? ` · ${p.installments}x` : ""}`}
                    <span className="block text-xs text-muted">{formatDateTime(p.created_at)}</span>
                  </span>
                  <span className="text-right">
                    <span className="font-semibold text-white">{PAYMENT_STATUS_LABEL[p.status] ?? p.status}</span>
                    <span className="block text-xs text-muted">{formatBRL(p.amount_cents)}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="card p-6">
          <h2 className="mb-4 flex items-center gap-2 font-display text-lg font-bold text-white"><History className="size-5 text-accent" /> Histórico</h2>
          <ol className="relative space-y-4 border-l border-line pl-5">
            {(events ?? []).map((e: { id: number; to_status: OrderStatus; created_at: string }) => (
              <li key={e.id} className="relative">
                <span className="absolute -left-[25px] top-1.5 size-2.5 rounded-full bg-accent ring-4 ring-surface" />
                <p className="text-sm font-semibold text-fg">{ORDER_STATUS_LABEL[e.to_status]}</p>
                <p className="text-xs text-muted">{formatDateTime(e.created_at)}</p>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
