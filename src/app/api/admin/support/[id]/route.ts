import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { assertAdmin } from "@/lib/auth";
import { handleApiError, jsonError, rejectCrossSite } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import {
  SupportError,
  adminReplySchema,
  getConversation,
  listMessages,
  markAdminRead,
  postAdminReply,
  setConversationStatus,
} from "@/services/SupportService";

/** Conversa no painel: GET (novas mensagens), POST (responder), PATCH (abrir/fechar). */

const NO_STORE = { "Cache-Control": "no-store" };
const uuid = z.string().uuid();

type Ctx = { params: Promise<{ id: string }> };

async function load(ctx: Ctx) {
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) throw new SupportError("Conversa não encontrada.", 404);
  return id;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  try {
    await assertAdmin();
    const id = await load(ctx);
    const conv = await getConversation(id);
    if (!conv) return jsonError(404, "Conversa não encontrada.");
    const messages = await listMessages(id, req.nextUrl.searchParams.get("after"));
    if (conv.unread_admin > 0) await markAdminRead(id);
    return NextResponse.json(
      {
        conversation: {
          status: conv.status,
          customerOnline: Boolean(conv.customer_last_seen_at && Date.now() - Date.parse(conv.customer_last_seen_at) < 60_000),
          unreadCustomer: conv.unread_customer,
        },
        messages,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    if (e instanceof SupportError) return jsonError(e.httpStatus, e.message);
    return handleApiError(e);
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  try {
    const blocked = rejectCrossSite(req);
    if (blocked) return blocked;
    const admin = await assertAdmin();
    if (!(await rateLimit(`support-reply:${admin.id}`, 40, 60))) return jsonError(429, "Muitas mensagens seguidas. Aguarde alguns instantes.");
    const id = await load(ctx);
    const { body } = adminReplySchema.parse(await req.json());
    const message = await postAdminReply(admin.id, id, body);
    return NextResponse.json({ message }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof SupportError) return jsonError(e.httpStatus, e.message);
    return handleApiError(e);
  }
}

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const blocked = rejectCrossSite(req);
    if (blocked) return blocked;
    await assertAdmin();
    const id = await load(ctx);
    const { status } = z.object({ status: z.enum(["open", "closed"]) }).parse(await req.json());
    await setConversationStatus(id, status);
    return NextResponse.json({ ok: true, status }, { headers: NO_STORE });
  } catch (e) {
    if (e instanceof SupportError) return jsonError(e.httpStatus, e.message);
    return handleApiError(e);
  }
}
