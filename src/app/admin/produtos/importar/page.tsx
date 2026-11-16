import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatBRL } from "@/lib/money";
import { AdminHeader } from "@/components/admin/AdminUI";
import { ImportTool } from "./ImportTool";

export default async function ImportPage() {
  await requireAdminPage();
  const db = createAdminClient();
  const [{ data: settings }, { count }] = await Promise.all([
    db.from("store_settings").select("pricing_strategy, default_sale_price_cents").eq("id", 1).single(),
    db.from("products").select("id", { count: "exact", head: true }),
  ]);
  const defaultPrice = settings?.pricing_strategy === "flat" ? formatBRL(settings.default_sale_price_cents) : "conforme a margem global";

  return (
    <>
      <Link href="/admin/produtos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Produtos
      </Link>
      <AdminHeader title="Adicionar jogos" description={`Busque no catálogo da ShadowKeys e adicione com um clique. A loja tem ${count ?? 0} jogo(s).`} />
      <ImportTool defaultPriceLabel={defaultPrice} />
    </>
  );
}
