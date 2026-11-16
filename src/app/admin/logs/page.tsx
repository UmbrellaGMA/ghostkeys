import Link from "next/link";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDateTime } from "@/lib/utils";
import { AdminHeader, Table } from "@/components/admin/AdminUI";

const TABS = { api: "Chamadas de API", webhooks: "Webhooks", sync: "Sincronizações" } as const;

export default async function AdminLogs({ searchParams }: { searchParams: Promise<{ aba?: string; provider?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const tab = (sp.aba ?? "api") as keyof typeof TABS;
  const db = createAdminClient();

  return (
    <>
      <AdminHeader
        title="Logs"
        description="Registro das integrações (sem dados sensíveis: tokens e keys nunca são gravados)."
        actions={Object.entries(TABS).map(([k, v]) => (
          <Link key={k} href={`/admin/logs?aba=${k}`} className={k === tab ? "btn-primary" : "btn-secondary"}>{v}</Link>
        ))}
      />
      {tab === "api" && <ApiLogs provider={sp.provider} db={db} />}
      {tab === "webhooks" && <WebhookLogs db={db} />}
      {tab === "sync" && <SyncLogs db={db} />}
    </>
  );
}

type DB = ReturnType<typeof createAdminClient>;

async function ApiLogs({ provider, db }: { provider?: string; db: DB }) {
  let q = db.from("api_logs").select("*").order("created_at", { ascending: false }).limit(200);
  if (provider) q = q.eq("provider", provider);
  const { data } = await q;
  return (
    <>
      <div className="mb-4 flex gap-2 text-sm">
        {["", "shadowkeys", "mercadopago", "email"].map((p) => (
          <Link key={p} href={`/admin/logs?aba=api${p ? `&provider=${p}` : ""}`} className={(provider ?? "") === p ? "badge bg-accent px-3 py-1 text-white" : "badge bg-surface-3 px-3 py-1 text-muted"}>
            {p || "todos"}
          </Link>
        ))}
      </div>
      <Table>
        <thead><tr><th>Data</th><th>Provedor</th><th>Operação</th><th>Status</th><th>HTTP</th><th>ms</th><th>Resumo</th></tr></thead>
        <tbody>
          {(data ?? []).map((l) => (
            <tr key={l.id}>
              <td className="whitespace-nowrap text-muted">{formatDateTime(l.created_at)}</td>
              <td>{l.provider}</td>
              <td className="font-mono text-xs">{l.operation}</td>
              <td className={l.request_status === "success" ? "text-success" : "text-danger"}>{l.request_status}</td>
              <td>{l.http_status ?? "—"}</td>
              <td className="text-muted">{l.duration_ms ?? "—"}</td>
              <td className="max-w-md truncate text-xs text-muted" title={l.response_summary ?? ""}>
                {l.order_id && <Link href={`/admin/pedidos/${l.order_id}`} className="mr-2 text-accent">pedido</Link>}
                {l.response_summary}
              </td>
            </tr>
          ))}
          {!data?.length && <tr><td colSpan={7} className="py-8 text-center text-muted">Sem registros.</td></tr>}
        </tbody>
      </Table>
    </>
  );
}

async function WebhookLogs({ db }: { db: DB }) {
  const { data } = await db.from("webhook_events").select("*").order("received_at", { ascending: false }).limit(200);
  return (
    <Table>
      <thead><tr><th>Recebido</th><th>Tópico</th><th>Recurso</th><th>Assinatura</th><th>Processado</th><th>Resultado</th></tr></thead>
      <tbody>
        {(data ?? []).map((w) => (
          <tr key={w.id}>
            <td className="whitespace-nowrap text-muted">{formatDateTime(w.received_at)}</td>
            <td>{w.topic}{w.action ? ` · ${w.action}` : ""}</td>
            <td className="font-mono text-xs">{w.resource_id}</td>
            <td className={w.signature_valid ? "text-success" : "text-danger"}>{w.signature_valid ? "válida" : "inválida"}</td>
            <td>{w.processed ? "sim" : "não"}</td>
            <td className="max-w-md truncate text-xs text-muted">{w.result}</td>
          </tr>
        ))}
        {!data?.length && <tr><td colSpan={6} className="py-8 text-center text-muted">Nenhum webhook recebido.</td></tr>}
      </tbody>
    </Table>
  );
}

async function SyncLogs({ db }: { db: DB }) {
  const { data } = await db.from("sync_runs").select("*").order("started_at", { ascending: false }).limit(50);
  return (
    <Table>
      <thead><tr><th>Início</th><th>Origem</th><th>Status</th><th>Fornecedor</th><th>Novos</th><th>Atualizados</th><th>Desativados</th><th>Erros</th></tr></thead>
      <tbody>
        {(data ?? []).map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap text-muted">{formatDateTime(r.started_at)}</td>
            <td className="text-xs">{r.triggered_by}</td>
            <td className={r.status === "success" ? "text-success" : r.status === "failed" ? "text-danger" : "text-warning"}>{r.status}</td>
            <td>{r.stats?.totalSupplier ?? "—"}</td>
            <td>{r.stats?.created ?? "—"}</td>
            <td>{r.stats?.updated ?? "—"}</td>
            <td>{r.stats?.deactivated ?? "—"}</td>
            <td className="max-w-xs truncate text-xs text-danger" title={[r.error, ...(r.stats?.errors ?? [])].filter(Boolean).join("\n")}>
              {r.error ?? (r.stats?.errors?.length ? `${r.stats.errors.length} erro(s)` : "")}
            </td>
          </tr>
        ))}
        {!data?.length && <tr><td colSpan={8} className="py-8 text-center text-muted">Nenhuma sincronização.</td></tr>}
      </tbody>
    </Table>
  );
}
