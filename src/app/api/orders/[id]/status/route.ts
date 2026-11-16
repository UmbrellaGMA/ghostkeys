import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { handleApiError, jsonError } from "@/lib/api";
import { rateLimit } from "@/lib/rate-limit";
import { getDeliveryService, getOrderService } from "@/services/container";
import type { Order, Payment } from "@/types";

/**
 * Status do pedido para a tela de pagamento (polling).
 * Se o pagamento ainda estiver pendente, consulta o Mercado Pago no servidor no máximo
 * a cada 15s por pedido — cobre webhooks atrasados sem confiar no navegador.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError(401, "Não autenticado");

    // RLS garante que apenas o dono (ou admin) lê o pedido
    const load = async () => {
      const { data: order } = await supabase.from("orders").select("*").eq("id", id).maybeSingle();
      const { data: payments } = await supabase.from("payments").select("*").eq("order_id", id).order("created_at", { ascending: false });
      return { order: order as Order | null, payments: (payments ?? []) as Payment[] };
    };
    let { order, payments } = await load();
    if (!order) return jsonError(404, "Pedido não encontrado");

    const pending = payments.find((p) => p.external_payment_id && ["pending", "in_process", "authorized"].includes(p.status));
    if (order.status === "pending_payment" && pending && (await rateLimit(`mp-sync:${id}`, 1, 15))) {
      try {
        const res = await getOrderService().syncPaymentFromProvider(pending.external_payment_id!, "status_poll");
        if (res.shouldDeliver) after(() => getDeliveryService().deliverOrder(id, "status_poll").catch(() => {}));
        ({ order, payments } = await load());
      } catch {
        /* falha temporária ao consultar o MP: mantém o status atual */
      }
    }

    const pix = payments.find((p) => p.payment_method === "pix" && p.pix_qr_code);
    const last = payments[0];
    return NextResponse.json(
      {
        status: order!.status,
        paymentStatus: last?.status ?? null,
        paymentStatusDetail: last?.status_detail ?? null,
        pix: pix && pix.status === "pending" ? { qrCode: pix.pix_qr_code, qrCodeBase64: pix.pix_qr_code_base64, expiresAt: pix.expires_at } : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return handleApiError(e);
  }
}
