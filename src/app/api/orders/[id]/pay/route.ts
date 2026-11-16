import { NextResponse, after, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, handleApiError, jsonError } from "@/lib/api";
import { paymentSchema } from "@/validations/schemas";
import { getDeliveryService, getOrderService } from "@/services/container";

/** Inicia o pagamento de um pedido: PIX (QR Code) ou cartão (token do Card Payment Brick). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError(401, "Sessão expirada. Faça login novamente.");

    const limited = await enforceRateLimit(req, "pay", 8, 300, user.id);
    if (limited) return limited;

    const body = paymentSchema.parse(await req.json());
    const service = getOrderService();

    if (body.method === "pix") {
      const p = await service.createPixPayment(id, user.id, body.cpf ?? null);
      return NextResponse.json({
        method: "pix",
        status: p.status,
        qrCode: p.pix_qr_code,
        qrCodeBase64: p.pix_qr_code_base64,
        ticketUrl: p.pix_ticket_url,
        expiresAt: p.expires_at,
      });
    }

    const { payment, result, shouldDeliver } = await service.createCardPayment(id, user.id, {
      token: body.token,
      paymentMethodId: body.payment_method_id,
      issuerId: body.issuer_id,
      installments: body.installments,
      payerEmail: body.payer.email,
      identificationType: body.payer.identification?.type,
      identificationNumber: body.payer.identification?.number,
    });
    if (shouldDeliver) {
      // Entrega após responder ao navegador
      after(() => getDeliveryService().deliverOrder(id, "payment_api").catch((e) => console.error("[delivery]", e)));
    }
    return NextResponse.json({ method: "card", status: payment.status, result });
  } catch (e) {
    return handleApiError(e);
  }
}
