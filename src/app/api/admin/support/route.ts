import { NextResponse } from "next/server";
import { assertAdmin } from "@/lib/auth";
import { handleApiError } from "@/lib/api";
import { adminUnreadCount } from "@/services/SupportService";

/** Quantidade de conversas com mensagens não lidas (selo do menu do painel). */
export async function GET() {
  try {
    await assertAdmin();
    return NextResponse.json({ unread: await adminUnreadCount() }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return handleApiError(e);
  }
}
