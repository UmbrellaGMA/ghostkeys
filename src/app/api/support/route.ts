import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { enforceRateLimit, handleApiError, jsonError, rejectCrossSite } from "@/lib/api";
import { getCurrentProfile } from "@/lib/auth";
import {
  SUPPORT_COOKIE,
  SUPPORT_COOKIE_MAX_AGE,
  SupportError,
  customerMessageSchema,
  findCustomerConversation,
  listMessages,
  markCustomerSeen,
  postCustomerMessage,
  type SupportIdentity,
} from "@/services/SupportService";

/** Chat de suporte do cliente (logado ou visitante). */

const NO_STORE = { "Cache-Control": "no-store" };

async function identity(): Promise<SupportIdentity> {
  const [profile, jar] = await Promise.all([getCurrentProfile().catch(() => null), cookies()]);
  return {
    user: profile ? { id: profile.id, email: profile.email, name: profile.full_name } : null,
    guestToken: jar.get(SUPPORT_COOKIE)?.value ?? null,
  };
}

/** GET ?after=<iso>&seen=1 → conversa + mensagens (novas depois de `after`). `seen=1` marca como lidas. */
export async function GET(req: NextRequest) {
  try {
    const limited = await enforceRateLimit(req, "support-read", 90, 60);
    if (limited) return limited;
    const id = await identity();
    const conv = await findCustomerConversation(id);
    const me = id.user ? { loggedIn: true, name: id.user.name, email: id.user.email } : { loggedIn: false, name: null, email: null };
    if (!conv) return NextResponse.json({ me, conversation: null, messages: [] }, { headers: NO_STORE });

    const messages = await listMessages(conv.id, req.nextUrl.searchParams.get("after"));
    const seen = req.nextUrl.searchParams.get("seen") === "1";
    if (seen) await markCustomerSeen(conv.id);
    return NextResponse.json(
      {
        me,
        conversation: { id: conv.id, status: conv.status, unread: seen ? 0 : conv.unread_customer },
        messages,
      },
      { headers: NO_STORE },
    );
  } catch (e) {
    return handleApiError(e);
  }
}

/** POST { body, name?, email? } → envia mensagem (cria a conversa na primeira). */
export async function POST(req: NextRequest) {
  try {
    const blocked = rejectCrossSite(req);
    if (blocked) return blocked;
    const limited =
      (await enforceRateLimit(req, "support-send-min", 8, 60)) ?? (await enforceRateLimit(req, "support-send-hour", 60, 3600));
    if (limited) return limited;

    const input = customerMessageSchema.parse(await req.json());
    const id = await identity();
    const { conversation, message, newGuestToken } = await postCustomerMessage(id, input);

    const res = NextResponse.json({ conversation: { id: conversation.id, status: "open", unread: 0 }, message }, { headers: NO_STORE });
    if (newGuestToken) {
      res.cookies.set(SUPPORT_COOKIE, newGuestToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: SUPPORT_COOKIE_MAX_AGE,
      });
    }
    return res;
  } catch (e) {
    if (e instanceof SupportError) return jsonError(e.httpStatus, e.message);
    return handleApiError(e);
  }
}
