import { CheckCircle2, XCircle } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, integrationsStatus } from "@/lib/env";
import type { StoreSettings } from "@/types";
import { AdminHeader } from "@/components/admin/AdminUI";
import { SettingsForm } from "./SettingsForm";

export default async function AdminSettings() {
  await requireAdminPage();
  const { data } = await createAdminClient().from("store_settings").select("*").eq("id", 1).single();
  const integrations = integrationsStatus();

  return (
    <>
      <AdminHeader title="Configurações" description="Dados da loja, precificação, pagamentos, entrega e e-mails." />

      <section className="card mb-6 p-6">
        <h2 className="mb-1 font-display text-lg font-bold text-white">Integrações</h2>
        <p className="mb-4 text-sm text-muted">
          Credenciais ficam apenas em variáveis de ambiente do servidor e nunca são exibidas integralmente.
        </p>
        <ul className="grid gap-3 md:grid-cols-2">
          {integrations.map((i) => (
            <li key={i.name} className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 p-4">
              {i.configured ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-success" /> : <XCircle className="mt-0.5 size-5 shrink-0 text-danger" />}
              <div className="min-w-0 text-sm">
                <p className="font-semibold text-white">{i.name}</p>
                <p className="truncate text-muted">{i.detail}</p>
                {i.missing.length > 0 && <p className="mt-1 text-xs text-danger">Faltando: {i.missing.join(", ")}</p>}
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-4 space-y-1 rounded-xl border border-line bg-surface-2 p-4 text-xs text-muted">
          <p>URL do webhook do Mercado Pago (cadastre em Suas integrações › Webhooks, evento “Pagamentos”):</p>
          <code className="block break-all text-accent-2">{appUrl()}/api/webhooks/mercadopago</code>
          <p className="pt-2">Agendamentos (Authorization: Bearer CRON_SECRET):</p>
          <code className="block break-all text-accent-2">{appUrl()}/api/cron/process-orders · a cada 5 min</code>
          <code className="block break-all text-accent-2">{appUrl()}/api/cron/sync-catalog · a cada 6 h</code>
        </div>
      </section>

      <SettingsForm settings={data as StoreSettings} />
    </>
  );
}
