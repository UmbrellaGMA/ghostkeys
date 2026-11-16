import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ActivationTutorial } from "@/types";
import { AdminHeader } from "@/components/admin/AdminUI";
import { TutorialEditor } from "./TutorialEditor";

export default async function AdminTutorials() {
  await requireAdminPage();
  const db = createAdminClient();
  const [{ data: tutorials }, { data: settings }] = await Promise.all([
    db.from("activation_tutorials").select("*").order("sort_order").order("platform"),
    db.from("store_settings").select("default_platform").eq("id", 1).maybeSingle(),
  ]);
  const list = (tutorials ?? []) as ActivationTutorial[];

  return (
    <>
      <AdminHeader
        title="Tutoriais de ativação"
        description="Passo a passo exibido para o cliente junto da key logo após a compra, no pedido e na página do jogo. Crie um por plataforma (ex.: Steam); o marcado como padrão vale para as plataformas sem tutorial próprio."
      />
      <div className="space-y-6">
        {list.map((t) => (
          <TutorialEditor key={t.id} tutorial={t} />
        ))}
        <TutorialEditor tutorial={null} defaultPlatform={list.length ? "" : (settings?.default_platform ?? "Steam")} />
      </div>
    </>
  );
}
