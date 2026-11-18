import Link from "next/link";
import { MessageCircle, User } from "lucide-react";
import { requireAdminPage } from "@/lib/auth";
import { AdminHeader } from "@/components/admin/AdminUI";
import { AutoRefresh } from "@/components/admin/AutoRefresh";
import { listConversations } from "@/services/SupportService";
import { formatDateTime } from "@/lib/utils";
import { cn } from "@/lib/utils";

export const metadata = { title: "Suporte" };

const FILTERS = [
  { key: "open", label: "Abertas" },
  { key: "closed", label: "Fechadas" },
  { key: "all", label: "Todas" },
] as const;

function ago(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60_000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  if (min < 24 * 60) return `${Math.round(min / 60)} h`;
  return formatDateTime(iso).split(" ")[0];
}

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  await requireAdminPage();
  const { f } = await searchParams;
  const filter = FILTERS.find((x) => x.key === f)?.key ?? "open";
  const conversations = await listConversations(filter);
  const unread = conversations.filter((c) => c.unread_admin > 0).length;

  return (
    <>
      <AutoRefresh seconds={10} />
      <AdminHeader
        title="Suporte"
        description={unread ? `${unread} conversa(s) aguardando resposta.` : "Conversas do chat da loja. Novas mensagens chegam como notificação no app."}
      />

      <div className="mb-4 flex gap-2" role="tablist">
        {FILTERS.map((x) => (
          <Link
            key={x.key}
            href={x.key === "open" ? "/admin/suporte" : `/admin/suporte?f=${x.key}`}
            role="tab"
            aria-selected={filter === x.key}
            className={cn("rounded-full border px-3.5 py-1.5 text-sm", filter === x.key ? "border-accent/50 bg-accent/15 text-white" : "border-line text-muted hover:text-fg")}
          >
            {x.label}
          </Link>
        ))}
      </div>

      {conversations.length === 0 ? (
        <div className="card grid place-items-center gap-2 p-10 text-center text-muted">
          <MessageCircle className="size-8 text-subtle" />
          <p>Nenhuma conversa {filter === "open" ? "aberta" : filter === "closed" ? "fechada" : ""}.</p>
          <p className="text-xs text-subtle">Os clientes falam com você pelo botão de chat no canto da loja.</p>
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {conversations.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/suporte/${c.id}`} className="flex items-start gap-3 p-4 transition hover:bg-surface-2">
                <span className={cn("grid size-10 shrink-0 place-items-center rounded-full", c.unread_admin ? "bg-accent text-white" : "bg-surface-2 text-muted")}>
                  <User className="size-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <p className={cn("truncate", c.unread_admin ? "font-bold text-white" : "font-medium text-fg")}>{c.customer_name}</p>
                    {!c.user_id && <span className="shrink-0 rounded bg-surface-2 px-1.5 text-[10px] uppercase text-subtle">visitante</span>}
                    <span className="ml-auto shrink-0 text-xs text-subtle">{ago(c.last_message_at)}</span>
                  </div>
                  <p className="truncate text-xs text-subtle">{c.customer_email}</p>
                  <p className={cn("mt-1 line-clamp-2 text-sm", c.unread_admin ? "text-fg" : "text-muted")}>
                    {c.last_sender === "admin" && <span className="text-subtle">Você: </span>}
                    {c.last_message_preview ?? "—"}
                  </p>
                </div>
                {c.unread_admin > 0 && (
                  <span className="mt-1 grid min-w-6 place-items-center rounded-full bg-red-500 px-1.5 text-xs font-bold text-white">{c.unread_admin}</span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
