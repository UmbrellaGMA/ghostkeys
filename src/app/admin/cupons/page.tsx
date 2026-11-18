import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Coupon } from "@/types";
import { AdminHeader } from "@/components/admin/AdminUI";
import { CouponsManager } from "./CouponsManager";

export default async function AdminCoupons() {
  await requireAdminPage();
  const { data } = await createAdminClient().from("coupons").select("*").order("created_at", { ascending: false });
  return (
    <>
      <AdminHeader title="Cupons" description="Descontos aplicados no checkout. O desconto é recalculado no servidor ao criar o pedido." />
      <CouponsManager coupons={(data ?? []) as Coupon[]} />
    </>
  );
}
