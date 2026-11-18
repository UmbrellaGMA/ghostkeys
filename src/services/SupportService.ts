import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getEmailService } from "@/services/container";
import { pushMessages, schedule, sendAdminPush } from "@/services/push/AdminPushNotifier";

/**
 * Chat de suporte. Todo acesso passa por aqui (service_role); quem chama já validou a identidade:
 * cliente logado (user_id) ou visitante (token aleatório guardado em cookie httpOnly; no banco só o hash).
 */

export const SUPPORT_COOKIE = "gk_support";
export const SUPPORT_COOKIE_MAX_AGE = 60 * 60 * 24 * 180;

export interface SupportMessage {
  id: string;
  sender: "customer" | "admin";
  body: string;
  created_at: string;
}

export interface SupportConversation {
  id: string;
  user_id: string | null;
  customer_name: string;
  customer_email: string;
  status: "open" | "closed";
  last_message_at: string;
  last_message_preview: string | null;
  last_sender: "customer" | "admin" | null;
  unread_admin: number;
  unread_customer: number;
  customer_last_seen_at: string | null;
  last_reply_email_at: string | null;
  created_at: string;
}

export interface SupportIdentity {
  user: { id: string; email: string; name: string | null } | null;
  guestToken: string | null;
}

export class SupportError extends Error {
  constructor(message: string, public httpStatus = 400) {
    super(message);
    this.name = "SupportError";
  }
}

export const customerMessageSchema = z.object({
  body: z.string().trim().min(1, "Escreva uma mensagem.").max(2000, "Mensagem muito longa (máximo de 2000 caracteres)."),
  name: z.string().trim().max(80, "Nome muito longo.").optional(),
  email: z.string().trim().max(254).optional(),
});

export const adminReplySchema = z.object({
  body: z.string().trim().min(1, "Escreva uma mensagem.").max(2000, "Mensagem muito longa (máximo de 2000 caracteres)."),
});

const CONV_FIELDS =
  "id, user_id, customer_name, customer_email, status, last_message_at, last_message_preview, last_sender, unread_admin, unread_customer, customer_last_seen_at, last_reply_email_at, created_at";
const MSG_FIELDS = "id, sender, body, created_at";

const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const validToken = (t: string | null | undefined): t is string => Boolean(t && /^[A-Za-z0-9_-]{40,64}$/.test(t));

/** Conversa do cliente. Ao entrar na conta, a conversa feita como visitante passa a ser da conta. */
export async function findCustomerConversation(id: SupportIdentity): Promise<SupportConversation | null> {
  const db = createAdminClient();
  if (id.user) {
    const { data } = await db.from("support_conversations").select(CONV_FIELDS).eq("user_id", id.user.id).maybeSingle();
    if (data) return data as SupportConversation;
  }
  if (!validToken(id.guestToken)) return null;
  const { data } = await db.from("support_conversations").select(CONV_FIELDS).eq("guest_token_hash", hashToken(id.guestToken)).maybeSingle();
  const conv = (data as SupportConversation | null) ?? null;
  if (!conv) return null;
  if (id.user) {
    if (conv.user_id && conv.user_id !== id.user.id) return null;
    if (!conv.user_id) {
      const { data: claimed } = await db
        .from("support_conversations")
        .update({ user_id: id.user.id, customer_email: id.user.email })
        .eq("id", conv.id)
        .is("user_id", null)
        .select(CONV_FIELDS)
        .maybeSingle();
      return (claimed as SupportConversation | null) ?? conv;
    }
  }
  return conv;
}

/** Mensagens da conversa: as últimas 100, ou só as novas depois de `after`. */
export async function listMessages(conversationId: string, after?: string | null): Promise<SupportMessage[]> {
  const db = createAdminClient();
  if (after && !Number.isNaN(Date.parse(after))) {
    const { data } = await db
      .from("support_messages")
      .select(MSG_FIELDS)
      .eq("conversation_id", conversationId)
      .gt("created_at", after)
      .order("created_at", { ascending: true })
      .limit(200);
    return (data ?? []) as SupportMessage[];
  }
  const { data } = await db
    .from("support_messages")
    .select(MSG_FIELDS)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(100);
  return ((data ?? []) as SupportMessage[]).reverse();
}

/** Cliente com o chat aberto: zera as não lidas e registra que está online (evita e-mail desnecessário). */
export async function markCustomerSeen(conversationId: string): Promise<void> {
  await createAdminClient()
    .from("support_conversations")
    .update({ unread_customer: 0, customer_last_seen_at: new Date().toISOString() })
    .eq("id", conversationId);
}

/** Mensagem do cliente (cria a conversa na primeira). Avisa o admin por push. */
export async function postCustomerMessage(
  id: SupportIdentity,
  input: z.infer<typeof customerMessageSchema>,
): Promise<{ conversation: SupportConversation; message: SupportMessage; newGuestToken: string | null }> {
  const db = createAdminClient();
  let conv = await findCustomerConversation(id);
  let newGuestToken: string | null = null;

  if (!conv) {
    let row: Record<string, unknown>;
    if (id.user) {
      const name = id.user.name?.trim() || input.name?.trim() || id.user.email.split("@")[0]!;
      row = { user_id: id.user.id, customer_name: name.slice(0, 80), customer_email: id.user.email };
    } else {
      const name = input.name?.trim();
      const email = input.email?.trim().toLowerCase();
      if (!name) throw new SupportError("Informe seu nome.");
      if (!email || !z.string().email().safeParse(email).success) throw new SupportError("Informe um e-mail válido para receber a resposta.");
      newGuestToken = randomBytes(32).toString("base64url");
      row = { guest_token_hash: hashToken(newGuestToken), customer_name: name, customer_email: email };
    }
    const { data, error } = await db.from("support_conversations").insert(row).select(CONV_FIELDS).single();
    if (error) throw error;
    conv = data as SupportConversation;
  }

  const { data: msg, error } = await db
    .from("support_messages")
    .insert({ conversation_id: conv.id, sender: "customer", author_id: id.user?.id ?? null, body: input.body })
    .select(MSG_FIELDS)
    .single();
  if (error) throw error;
  await markCustomerSeen(conv.id);

  const c = conv;
  void schedule(() => sendAdminPush("support_message", pushMessages.supportMessage(c, input.body)));
  return { conversation: conv, message: msg as SupportMessage, newGuestToken };
}

// ───────────────────────── Painel ─────────────────────────

export async function getConversation(conversationId: string): Promise<SupportConversation | null> {
  const { data } = await createAdminClient().from("support_conversations").select(CONV_FIELDS).eq("id", conversationId).maybeSingle();
  return (data as SupportConversation | null) ?? null;
}

export async function listConversations(filter: "open" | "closed" | "all", limit = 100): Promise<SupportConversation[]> {
  let q = createAdminClient().from("support_conversations").select(CONV_FIELDS);
  if (filter !== "all") q = q.eq("status", filter);
  const { data } = await q.order("unread_admin", { ascending: false }).order("last_message_at", { ascending: false }).limit(limit);
  return (data ?? []) as SupportConversation[];
}

/** Quantidade de conversas com mensagem não lida pelo admin. */
export async function adminUnreadCount(): Promise<number> {
  const { count } = await createAdminClient().from("support_conversations").select("id", { count: "exact", head: true }).gt("unread_admin", 0);
  return count ?? 0;
}

export async function markAdminRead(conversationId: string): Promise<void> {
  await createAdminClient().from("support_conversations").update({ unread_admin: 0 }).eq("id", conversationId).gt("unread_admin", 0);
}

export async function setConversationStatus(conversationId: string, status: "open" | "closed"): Promise<void> {
  const { error } = await createAdminClient().from("support_conversations").update({ status }).eq("id", conversationId);
  if (error) throw error;
}

const ONLINE_MS = 2 * 60_000; // cliente com o chat aberto nos últimos 2 min: não precisa de e-mail
const EMAIL_GAP_MS = 15 * 60_000; // no máximo um e-mail a cada 15 min por conversa

/** Decide se a resposta do admin também vai por e-mail (exportado para testes). */
export function shouldEmailReply(conv: Pick<SupportConversation, "customer_last_seen_at" | "last_reply_email_at">, now = Date.now()): boolean {
  const seen = conv.customer_last_seen_at ? Date.parse(conv.customer_last_seen_at) : 0;
  const mailed = conv.last_reply_email_at ? Date.parse(conv.last_reply_email_at) : 0;
  return now - seen > ONLINE_MS && now - mailed > EMAIL_GAP_MS;
}

/** Resposta do admin. Se o cliente não estiver com o chat aberto, avisa por e-mail. */
export async function postAdminReply(adminId: string, conversationId: string, body: string): Promise<SupportMessage> {
  const db = createAdminClient();
  const conv = await getConversation(conversationId);
  if (!conv) throw new SupportError("Conversa não encontrada.", 404);
  const { data, error } = await db
    .from("support_messages")
    .insert({ conversation_id: conv.id, sender: "admin", author_id: adminId, body })
    .select(MSG_FIELDS)
    .single();
  if (error) throw error;

  if (shouldEmailReply(conv)) {
    void schedule(async () => {
      const sent = await getEmailService().supportReply(conv.customer_email, conv.customer_name.split(/\s+/)[0] ?? "", body);
      if (sent) await db.from("support_conversations").update({ last_reply_email_at: new Date().toISOString() }).eq("id", conv.id);
    });
  }
  return data as SupportMessage;
}
