import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, handleApiError, jsonError } from "@/lib/api";
import { createOrderSchema } from "@/validations/schemas";
import { getOrderService } from "@/services/container";

/** Cria o pedido (status pending_payment) com preços recalculados no servidor. */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError(401, "Faça login para finalizar a compra.");

    const limited = await enforceRateLimit(req, "create-order", 10, 600, user.id);
    if (limited) return limited;

    const body = createOrderSchema.parse(await req.json());
    const service = getOrderService({ withSupplierCheck: true });
    const { orderId } = await service.createOrder({
      user: { id: user.id, email: user.email!, name: body.customerName },
      lines: body.items,
      couponCode: body.couponCode ?? null,
    });
    // Mantém o nome do perfil atualizado (somente o próprio usuário, via RLS)
    await supabase.from("profiles").update({ full_name: body.customerName }).eq("id", user.id);
    return NextResponse.json({ orderId }, { status: 201 });
  } catch (e) {
    return handleApiError(e);
  }
}
