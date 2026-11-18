import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConversation, listMessages, markAdminRead } from "@/services/SupportService";
import { SupportThread, type CustomerOrder } from "./SupportThread";

export const metadata = { title: "Conversa · Suporte" };

export default async function AdminSupportThread({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const conv = await getConversation(id);
  if (!conv) notFound();

  const db = createAdminClient();
  let ordersQ = db.from("orders").select("id, order_number, status, total_cents, created_at");
  ordersQ = conv.user_id ? ordersQ.eq("user_id", conv.user_id) : ordersQ.ilike("customer_email", conv.customer_email.replace(/[%_\\]/g, "\\$&"));
  const [messages, { data: orders }] = await Promise.all([
    listMessages(id),
    ordersQ.order("created_at", { ascending: false }).limit(10),
    conv.unread_admin > 0 ? markAdminRead(id) : Promise.resolve(),
  ]);

  return (
    <SupportThread
      conversation={{
        id: conv.id,
        name: conv.customer_name,
        email: conv.customer_email,
        isGuest: !conv.user_id,
        status: conv.status,
        createdAt: conv.created_at,
      }}
      initialMessages={messages}
      orders={(orders ?? []) as CustomerOrder[]}
    />
  );
}
