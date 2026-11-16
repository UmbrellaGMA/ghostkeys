import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Category } from "@/types";
import { AdminHeader } from "@/components/admin/AdminUI";
import { CategoryEditor } from "./CategoryEditor";

export default async function AdminCategories() {
  await requireAdminPage();
  const db = createAdminClient();
  const [{ data: categories }, { data: counts }] = await Promise.all([
    db.from("categories").select("*").order("sort_order"),
    db.from("product_categories").select("category_id"),
  ]);
  const countMap = new Map<string, number>();
  for (const c of counts ?? []) countMap.set(c.category_id, (countMap.get(c.category_id) ?? 0) + 1);

  return (
    <>
      <AdminHeader
        title="Categorias"
        description="As tags do fornecedor (GET /games/{appId}) são usadas para categorizar automaticamente os jogos importados."
      />
      <div className="space-y-3">
        {((categories ?? []) as Category[]).map((c) => (
          <CategoryEditor key={c.id} category={c} productCount={countMap.get(c.id) ?? 0} />
        ))}
        <CategoryEditor category={null} productCount={0} />
      </div>
    </>
  );
}
