import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Image as ImageIcon } from "lucide-react";
import { ActionButton } from "@/components/admin/ActionButton";
import { enrichMediaAction } from "../../actions";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Category, Product, StoreSettings } from "@/types";
import { AdminHeader } from "@/components/admin/AdminUI";
import { ProductForm } from "./ProductForm";

export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const db = createAdminClient();
  const [{ data: product }, { data: categories }, { data: links }, { data: settings }] = await Promise.all([
    db.from("products").select("*").eq("id", id).maybeSingle(),
    db.from("categories").select("*").order("sort_order"),
    db.from("product_categories").select("category_id").eq("product_id", id),
    db.from("store_settings").select("*").eq("id", 1).single(),
  ]);
  if (!product) notFound();

  return (
    <>
      <Link href="/admin/produtos" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted hover:text-fg">
        <ArrowLeft className="size-4" /> Produtos
      </Link>
      <AdminHeader
        title={(product as Product).name}
        description={`AppID ShadowKeys: ${(product as Product).supplier_product_id}`}
        actions={
          <ActionButton action={enrichMediaAction.bind(null, id)}>
            <ImageIcon className="size-4" /> Buscar capa e descrição na Steam
          </ActionButton>
        }
      />
      <ProductForm
        product={product as Product}
        categories={(categories ?? []) as Category[]}
        categoryIds={(links ?? []).map((l) => l.category_id as string)}
        settings={settings as StoreSettings}
      />
    </>
  );
}
