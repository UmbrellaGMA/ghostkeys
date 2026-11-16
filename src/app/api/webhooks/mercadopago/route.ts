import { NextResponse, after, type NextRequest } from "next/server";
import { optionalEnv } from "@/lib/env";
import { enforceRateLimit } from "@/lib/api";
import { verifyWebhookSignature } from "@/services/mercadopago/MercadoPagoService";
import { getDeliveryService, getOrderService, getRepository } from "@/services/container";

/**
 * Webhook do Mercado Pago.
 *
 * 1. Valida a assinatura x-signature (HMAC-SHA256 com a assinatura secreta).
 * 2. NÃO confia no corpo: consulta o pagamento diretamente na API do Mercado Pago.
 * 3. OrderService.applyPaymentUpdate valida pedido, valor, moeda e propriedade do pagamento,
 *    e aplica transições atômicas/idempotentes (webhooks duplicados não geram efeitos duplicados).
 * 4. A entrega roda após a resposta (after) para responder rápido ao Mercado Pago.
 */
export async function POST(req: NextRequest) {
  const limited = await enforceRateLimit(req, "mp-webhook", 300, 60);
  if (limited) return limited;

  const url = req.nextUrl;
  const body = (await req.json().catch(() => ({}))) as { type?: string; action?: string; data?: { id?: string | number } };
  const topic = body.type ?? url.searchParams.get("type") ?? url.searchParams.get("topic");
  const dataId = url.searchParams.get("data.id") ?? (body.data?.id !== undefined ? String(body.data.id) : null);
  const requestId = req.headers.get("x-request-id");

  const signature = verifyWebhookSignature({
    xSignature: req.headers.get("x-signature"),
    xRequestId: requestId,
    dataId,
    secret: optionalEnv("MERCADOPAGO_WEBHOOK_SECRET") ?? "",
  });

  const repo = getRepository();
  const { data: event } = await repo.client
    .from("webhook_events")
    .upsert(
      { provider: "mercadopago", request_id: requestId, topic, action: body.action ?? null, resource_id: dataId, signature_valid: signature.valid },
      { onConflict: "provider,request_id", ignoreDuplicates: false },
    )
    .select("id")
    .maybeSingle();

  const finish = async (result: string, processed: boolean) => {
    if (event?.id) await repo.client.from("webhook_events").update({ result, processed }).eq("id", event.id);
  };

  if (!signature.valid) {
    await finish(`assinatura inválida: ${signature.reason}`, false);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  if (topic !== "payment" || !dataId) {
    await finish("ignorado (tópico não tratado)", true);
    return NextResponse.json({ ok: true });
  }

  try {
    const { result, orderId, shouldDeliver } = await getOrderService().syncPaymentFromProvider(dataId, "webhook");
    await finish(`${result}${orderId ? ` (pedido ${orderId})` : ""}`, true);
    if (shouldDeliver && orderId) {
      after(() => getDeliveryService().deliverOrder(orderId, "webhook").catch((e) => console.error("[delivery]", e)));
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    await finish(`erro: ${(e as Error).message}`, false);
    // 500 => o Mercado Pago reenviará a notificação (processamento é idempotente)
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }
}
