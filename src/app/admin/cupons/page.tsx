import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Coupon } from "@/types";
import { formatBRL } from "@/lib/money";
import { formatDateTime } from "@/lib/utils";
import { AdminHeader, Table } from "@/components/admin/AdminUI";
import { Toggle } from "@/components/admin/ActionButton";
import { toggleCouponAction } from "../actions";
import { CouponForm } from "./CouponForm";

export default async function AdminCoupons() {
  await requireAdminPage();
  const { data } = await createAdminClient().from("coupons").select("*").order("created_at", { ascending: false });
  const coupons = (data ?? []) as Coupon[];
  return (
    <>
      <AdminHeader title="Cupons" description="Descontos aplicados no checkout. O desconto é recalculado no servidor ao criar o pedido." />
      <CouponForm />
      <div className="mt-6">
        <Table>
          <thead>
            <tr><th>Código</th><th>Desconto</th><th>Pedido mínimo</th><th>Usos</th><th>Expira</th><th>Ativo</th></tr>
          </thead>
          <tbody>
            {coupons.map((c) => (
              <tr key={c.id}>
                <td className="font-mono font-semibold text-white">{c.code}</td>
                <td>{c.discount_type === "percent" ? `${c.discount_value}%` : formatBRL(c.discount_value)}</td>
                <td>{c.min_order_cents ? formatBRL(c.min_order_cents) : "—"}</td>
                <td>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                <td className="text-muted">{c.expires_at ? formatDateTime(c.expires_at) : "Sem validade"}</td>
                <td><Toggle checked={c.active} label="Ativo" action={toggleCouponAction.bind(null, c.id)} /></td>
              </tr>
            ))}
            {!coupons.length && <tr><td colSpan={6} className="py-8 text-center text-muted">Nenhum cupom criado.</td></tr>}
          </tbody>
        </Table>
      </div>
    </>
  );
}
