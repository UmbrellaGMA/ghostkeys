import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { optionalEnv } from "@/lib/env";
import { AdminHeader } from "@/components/admin/AdminUI";
import { pushConfigured } from "@/services/push/AdminPushNotifier";
import { PushSetup, type PushDevice } from "./PushSetup";

export const metadata = { title: "Notificações" };

export default async function AdminNotifications() {
  const profile = await requireAdminPage();
  const { data } = await createAdminClient()
    .from("push_subscriptions")
    .select("id, endpoint, device_label, events, created_at, last_sent_at")
    .eq("user_id", profile.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <AdminHeader
        title="Notificações"
        description="Receba no celular avisos de novos pedidos, PIX gerado, pagamento aprovado, compra concluída e falhas de entrega."
      />
      <PushSetup
        devices={(data ?? []) as PushDevice[]}
        vapidPublicKey={optionalEnv("VAPID_PUBLIC_KEY") ?? ""}
        serverReady={pushConfigured()}
      />
    </>
  );
}
