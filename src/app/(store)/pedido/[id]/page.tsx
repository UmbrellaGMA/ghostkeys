import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getActivationTutorials, getStoreSettings } from "@/services/CatalogService";
import { tutorialsForPlatforms } from "@/lib/tutorials";
import { publicEnv } from "@/lib/env";
import { formatBRL } from "@/lib/money";
import type { Order, OrderItem } from "@/types";
import { PaymentPanel } from "./PaymentPanel";

export const metadata: Metadata = { title: "Pagamento do pedido", robots: { index: false } };

export default async function OrderPaymentPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser(`/pedido/${id}`);
  const supabase = await createClient();
  // RLS: só retorna se o pedido pertencer ao usuário (ou admin)
  const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
  if (!order) notFound();
  const { data: items } = await supabase.from("order_items").select("*").eq("order_id", id);
  const [settings, allTutorials] = await Promise.all([getStoreSettings(), getActivationTutorials()]);
  const o = order as Order;
  const its = (items ?? []) as OrderItem[];
  const keyCount = its.reduce((s, i) => s + i.quantity, 0);
  const tutorials = tutorialsForPlatforms(allTutorials, its.map((i) => i.platform));

  return (
    <div className="container-page py-6 sm:py-8">
      <div className="mb-6">
        <p className="text-sm text-muted">Pedido #{o.order_number}</p>
        <h1 className="font-display text-3xl font-bold text-white">{o.status === "delivered" ? "Suas keys" : "Pagamento"}</h1>
      </div>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <PaymentPanel
          orderId={o.id}
          initialStatus={o.status}
          totalCents={o.total_cents}
          email={o.customer_email}
          pixEnabled={settings.pix_enabled}
          cardEnabled={settings.card_enabled && Boolean(publicEnv.mercadoPagoPublicKey)}
          maxInstallments={settings.max_installments}
          publicKey={publicEnv.mercadoPagoPublicKey}
          keyCount={keyCount}
          tutorials={tutorials}
        />
        <aside className="card h-fit space-y-4 p-4 sm:p-6">
          <h2 className="font-display text-lg font-bold text-white">Seu pedido</h2>
          <ul className="space-y-3 text-sm">
            {its.map((i) => (
              <li key={i.id} className="flex justify-between gap-3">
                <span className="text-fg">
                  {i.product_name} <span className="text-muted">× {i.quantity}</span>
                  <span className="block text-xs text-muted">{i.platform}{i.activation_region ? ` · ${i.activation_region}` : ""}</span>
                </span>
                <span className="font-semibold text-white">{formatBRL(i.unit_price_cents * i.quantity)}</span>
              </li>
            ))}
          </ul>
          <dl className="space-y-1.5 border-t border-line pt-4 text-sm">
            {o.combo_discount_cents > 0 && (
              <div className="flex justify-between text-muted">
                <dt>Promoção leve {settings.combo_size}, pague {settings.combo_size - settings.combo_free}</dt>
                <dd className="text-success">−{formatBRL(o.combo_discount_cents)}</dd>
              </div>
            )}
            {o.discount_cents - o.combo_discount_cents > 0 && (
              <div className="flex justify-between text-muted">
                <dt>Cupom{o.coupon_code ? ` (${o.coupon_code})` : ""}</dt>
                <dd className="text-success">−{formatBRL(o.discount_cents - o.combo_discount_cents)}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="font-semibold text-white">Total</dt>
              <dd className="font-display text-xl font-bold text-white">{formatBRL(o.total_cents)}</dd>
            </div>
          </dl>
        </aside>
      </div>
    </div>
  );
}
