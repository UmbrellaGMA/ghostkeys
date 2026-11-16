import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit, handleApiError, jsonError } from "@/lib/api";
import { decryptSecret } from "@/lib/crypto";

/**
 * Revela as keys de um pedido.
 * - Usa a sessão do usuário (NÃO o service role) e a função segura get_order_keys(),
 *   que valida no banco se o usuário é o dono do pedido ou administrador e registra o acesso.
 * - A descriptografia acontece apenas aqui no servidor.
 * - Resposta nunca é cacheada.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return jsonError(401, "Não autenticado");

    const limited = await enforceRateLimit(req, "keys", 20, 300, user.id);
    if (limited) return limited;

    const { data, error } = await supabase.rpc("get_order_keys", { p_order_id: id });
    if (error) {
      if (error.message.includes("FORBIDDEN") || error.message.includes("ORDER_NOT_FOUND")) return jsonError(404, "Pedido não encontrado");
      throw error;
    }

    const keys = (data ?? []).map((k: { key_id: string; order_item_id: string; product_name: string; encrypted_key: string; delivered_at: string; is_test: boolean }) => ({
      id: k.key_id,
      orderItemId: k.order_item_id,
      productName: k.product_name,
      code: decryptSecret(k.encrypted_key),
      deliveredAt: k.delivered_at,
      isTest: k.is_test,
    }));
    return NextResponse.json({ keys }, { headers: { "Cache-Control": "no-store, private", Pragma: "no-cache" } });
  } catch (e) {
    return handleApiError(e);
  }
}
