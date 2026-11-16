"use server";
import { revalidatePath } from "next/cache";
import { ZodError } from "zod";
import { assertAdmin, AuthorizationError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { rateLimit } from "@/lib/rate-limit";
import { categorySchema, couponSchema, productUpdateSchema, settingsSchema, tutorialSchema } from "@/validations/schemas";
import { getCatalogSync, getDeliveryService, getOrderService } from "@/services/container";
import { CheckoutError } from "@/services/OrderService";
import { calculateSalePrice } from "@/services/PricingService";
import type { StoreSettings } from "@/types";
import { z } from "zod";
import { PUSH_EVENT_KEYS, type PushEventKey } from "@/lib/push-events";
import { pushConfigured, sendToSubscriptions } from "@/services/push/AdminPushNotifier";

export type ActionResult = { ok: boolean; message: string };

async function run(fn: (adminId: string) => Promise<string>): Promise<ActionResult> {
  try {
    const admin = await assertAdmin();
    const message = await fn(admin.id);
    return { ok: true, message };
  } catch (e) {
    if (e instanceof AuthorizationError) return { ok: false, message: "Acesso negado." };
    if (e instanceof ZodError) return { ok: false, message: e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") };
    if (e instanceof CheckoutError) return { ok: false, message: e.message };
    console.error("[admin action]", e);
    return { ok: false, message: (e as Error).message ?? "Erro inesperado" };
  }
}

const actor = (id: string) => `admin:${id}`;

// ───────────────────────── Catálogo ─────────────────────────

export async function syncCatalogAction(): Promise<ActionResult> {
  return run(async (adminId) => {
    if (!(await rateLimit(`admin-sync:${adminId}`, 10, 600))) throw new Error("Muitas execuções seguidas. Aguarde alguns minutos.");
    // Atualiza preço/disponibilidade SOMENTE dos jogos já importados (nunca adiciona jogos novos)
    const r = await getCatalogSync().refreshImported({ timeBudgetMs: 50_000 });
    revalidatePath("/admin/produtos");
    revalidatePath("/", "layout");
    return `${r.refreshed} de ${r.total} jogo(s) atualizados${r.unavailable ? `, ${r.unavailable} indisponível(is) no fornecedor` : ""}.${r.refreshed < r.total ? " O agendador atualiza o restante automaticamente." : ""}`;
  });
}

export async function enrichMediaAction(productId?: string): Promise<ActionResult> {
  return run(async () => {
    const sync = getCatalogSync();
    if (productId) {
      const r = await sync.enrichFromSteam(productId);
      revalidatePath("/", "layout");
      revalidatePath(`/admin/produtos/${productId}`);
      return r === "updated" ? "Capa, fundo e descrição atualizados pela Steam" : "A Steam não tem dados para este jogo";
    }
    const r = await sync.enrichAllFromSteam({ timeBudgetMs: 55_000 });
    revalidatePath("/", "layout");
    revalidatePath("/admin/produtos");
    return `${r.updated} de ${r.total} jogo(s) atualizados pela Steam${r.noData ? ` · ${r.noData} sem dados na Steam` : ""}${r.updated + r.noData < r.total ? " · clique de novo para continuar" : ""}.`;
  });
}

export async function searchSupplierAction(query: string) {
  try {
    await assertAdmin();
    if (query.trim().length < 2) return { ok: true as const, games: [] };
    const games = await getCatalogSync().searchSupplier(query);
    return { ok: true as const, games };
  } catch (e) {
    return { ok: false as const, message: e instanceof AuthorizationError ? "Acesso negado." : (e as Error).message, games: [] };
  }
}

/** Importa uma lista ("Nome" ou "AppID", opcional "; preço"). O cliente envia em lotes pequenos. */
export async function importLinesAction(lines: string[]) {
  try {
    await assertAdmin();
    const clean = lines.map((l) => String(l).slice(0, 200)).filter((l) => l.trim()).slice(0, 25);
    const results = await getCatalogSync().importLines(clean);
    revalidatePath("/admin/produtos");
    revalidatePath("/", "layout");
    return { ok: true as const, results };
  } catch (e) {
    return { ok: false as const, message: e instanceof AuthorizationError ? "Acesso negado." : (e as Error).message, results: [] };
  }
}

/** Remove o jogo do catálogo. Pedidos antigos não são afetados (guardam nome, preço e custo próprios). */
export async function deleteProductAction(productId: string): Promise<ActionResult> {
  return run(async () => {
    const { error } = await createAdminClient().from("products").delete().eq("id", productId);
    if (error) throw error;
    revalidatePath("/admin/produtos");
    revalidatePath("/", "layout");
    return "Jogo removido do catálogo";
  });
}

export async function toggleProductFlag(productId: string, field: "active" | "featured", value: boolean): Promise<ActionResult> {
  return run(async () => {
    const { error } = await createAdminClient().from("products").update({ [field]: value }).eq("id", productId);
    if (error) throw error;
    revalidatePath("/admin/produtos");
    revalidatePath("/", "layout");
    return field === "active" ? (value ? "Produto ativado" : "Produto desativado") : value ? "Marcado como destaque" : "Removido dos destaques";
  });
}

export async function updateProductAction(productId: string, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const data = productUpdateSchema.parse(input);
    const db = createAdminClient();
    const [{ data: product }, { data: settings }] = await Promise.all([
      db.from("products").select("supplier_cost_cents").eq("id", productId).single(),
      db.from("store_settings").select("*").eq("id", 1).single(),
    ]);
    if (!product) throw new Error("Produto não encontrado");

    let sale: number;
    if (data.pricing_mode === "custom") {
      if (!data.custom_price_cents || data.custom_price_cents <= 0) throw new Error("Informe o preço personalizado");
      sale = data.custom_price_cents;
    } else {
      if (product.supplier_cost_cents === null) throw new Error("Produto sem custo do fornecedor; use preço personalizado ou sincronize.");
      sale = calculateSalePrice(product.supplier_cost_cents, settings as StoreSettings);
    }
    if (product.supplier_cost_cents !== null && sale < product.supplier_cost_cents) {
      throw new Error("O preço de venda não pode ser menor que o custo do fornecedor.");
    }
    if (data.promo_price_cents && data.promo_price_cents >= sale) throw new Error("O preço promocional deve ser menor que o preço de venda.");
    if (data.promo_price_cents && product.supplier_cost_cents !== null && data.promo_price_cents < product.supplier_cost_cents) {
      throw new Error("O preço promocional não pode ser menor que o custo do fornecedor.");
    }

    const { category_ids, ...fields } = data;
    const { error } = await db
      .from("products")
      .update({
        ...fields,
        custom_price_cents: data.pricing_mode === "custom" ? data.custom_price_cents : null,
        promo_price_cents: data.promo_price_cents || null,
        original_price_cents: data.original_price_cents || null,
        promo_ends_at: data.promo_ends_at ? new Date(data.promo_ends_at).toISOString() : null,
        sale_price_cents: sale,
      })
      .eq("id", productId);
    if (error) throw new Error(error.code === "23505" ? "Já existe um produto com este slug" : error.message);

    await db.from("product_categories").delete().eq("product_id", productId);
    const allCats = [...new Set([...(category_ids ?? []), ...(data.category_id ? [data.category_id] : [])])];
    if (allCats.length) await db.from("product_categories").insert(allCats.map((c) => ({ product_id: productId, category_id: c })));

    revalidatePath("/admin/produtos");
    revalidatePath("/", "layout");
    return "Produto atualizado";
  });
}

export async function uploadProductImageAction(formData: FormData): Promise<ActionResult & { url?: string }> {
  let url: string | undefined;
  const res = await run(async () => {
    const file = formData.get("file");
    if (!(file instanceof File)) throw new Error("Arquivo inválido");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Use JPG, PNG ou WEBP");
    if (file.size > 5 * 1024 * 1024) throw new Error("Máximo de 5 MB");
    const ext = file.type.split("/")[1];
    const path = `products/${crypto.randomUUID()}.${ext}`;
    const db = createAdminClient();
    const { error } = await db.storage.from("product-images").upload(path, file, { contentType: file.type, upsert: false });
    if (error) throw error;
    url = db.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    return "Imagem enviada";
  });
  return { ...res, url };
}

// ───────────────────────── Categorias ─────────────────────────

export async function saveCategoryAction(id: string | null, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const data = categorySchema.parse(input);
    const db = createAdminClient();
    const { error } = id ? await db.from("categories").update(data).eq("id", id) : await db.from("categories").insert(data);
    if (error) throw new Error(error.code === "23505" ? "Slug já utilizado" : error.message);
    revalidatePath("/admin/categorias");
    revalidatePath("/", "layout");
    return id ? "Categoria atualizada" : "Categoria criada";
  });
}

export async function deleteCategoryAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const { error } = await createAdminClient().from("categories").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/admin/categorias");
    revalidatePath("/", "layout");
    return "Categoria removida";
  });
}

// ───────────────────────── Tutoriais de ativação ─────────────────────────

export async function saveTutorialAction(id: string | null, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const data = tutorialSchema.parse(input);
    if (!data.steps.length && !data.intro && !data.notes) throw new Error("Escreva pelo menos um passo ou uma explicação.");
    const db = createAdminClient();
    // Só pode existir um tutorial padrão: desmarca o anterior antes de salvar
    if (data.is_default) {
      const q = db.from("activation_tutorials").update({ is_default: false }).eq("is_default", true);
      const { error } = id ? await q.neq("id", id) : await q;
      if (error) throw error;
    }
    const { error } = id ? await db.from("activation_tutorials").update(data).eq("id", id) : await db.from("activation_tutorials").insert(data);
    if (error) throw new Error(error.code === "23505" ? "Já existe um tutorial para essa plataforma" : error.message);
    revalidatePath("/admin/tutoriais");
    revalidatePath("/", "layout");
    return id ? "Tutorial atualizado" : "Tutorial criado";
  });
}

export async function deleteTutorialAction(id: string): Promise<ActionResult> {
  return run(async () => {
    const { error } = await createAdminClient().from("activation_tutorials").delete().eq("id", id);
    if (error) throw error;
    revalidatePath("/admin/tutoriais");
    revalidatePath("/", "layout");
    return "Tutorial removido";
  });
}

// ───────────────────────── Cupons ─────────────────────────

export async function saveCouponAction(id: string | null, input: unknown): Promise<ActionResult> {
  return run(async () => {
    const data = couponSchema.parse(input);
    if (data.discount_type === "percent" && data.discount_value > 100) throw new Error("Percentual máximo: 100");
    const row = { ...data, expires_at: data.expires_at ? new Date(data.expires_at).toISOString() : null };
    const db = createAdminClient();
    const { error } = id ? await db.from("coupons").update(row).eq("id", id) : await db.from("coupons").insert(row);
    if (error) throw new Error(error.code === "23505" ? "Código já existe" : error.message);
    revalidatePath("/admin/cupons");
    return id ? "Cupom atualizado" : "Cupom criado";
  });
}

export async function toggleCouponAction(id: string, active: boolean): Promise<ActionResult> {
  return run(async () => {
    await createAdminClient().from("coupons").update({ active }).eq("id", id);
    revalidatePath("/admin/cupons");
    return active ? "Cupom ativado" : "Cupom desativado";
  });
}

// ───────────────────────── Pedidos ─────────────────────────

export async function retryDeliveryAction(orderId: string): Promise<ActionResult> {
  return run(async (adminId) => {
    const r = await getDeliveryService().deliverOrder(orderId, actor(adminId));
    revalidatePath(`/admin/pedidos/${orderId}`);
    switch (r.status) {
      case "delivered":
        return `Entregue (${r.keysGenerated} key(s) gerada(s) nesta tentativa).`;
      case "skipped":
        throw new Error(r.reason);
      case "retry_scheduled":
        throw new Error(`Falha temporária: ${r.error}. Nova tentativa agendada.`);
      case "failed":
        throw new Error(`Falha: ${r.error}`);
    }
  });
}

export async function syncPaymentAction(orderId: string): Promise<ActionResult> {
  return run(async (adminId) => {
    const db = createAdminClient();
    const { data: payments } = await db.from("payments").select("external_payment_id").eq("order_id", orderId).not("external_payment_id", "is", null);
    if (!payments?.length) throw new Error("Nenhum pagamento registrado no Mercado Pago para este pedido.");
    const service = getOrderService();
    const results: string[] = [];
    for (const p of payments) {
      const r = await service.syncPaymentFromProvider(p.external_payment_id!, actor(adminId));
      results.push(`${p.external_payment_id}: ${r.result}`);
      if (r.shouldDeliver) await getDeliveryService().deliverOrder(orderId, actor(adminId));
    }
    revalidatePath(`/admin/pedidos/${orderId}`);
    return `Consulta concluída — ${results.join(", ")}`;
  });
}

export async function cancelOrderAction(orderId: string): Promise<ActionResult> {
  return run(async (adminId) => {
    await getOrderService().cancelOrder(orderId, actor(adminId));
    revalidatePath(`/admin/pedidos/${orderId}`);
    return "Pedido cancelado";
  });
}

export async function refundOrderAction(orderId: string): Promise<ActionResult> {
  return run(async (adminId) => {
    if (!(await rateLimit(`admin-refund:${orderId}`, 2, 60))) throw new Error("Aguarde antes de tentar novamente.");
    await getOrderService().refundOrder(orderId, actor(adminId));
    revalidatePath(`/admin/pedidos/${orderId}`);
    return "Reembolso solicitado ao Mercado Pago. As keys do pedido foram desativadas.";
  });
}

export async function addOrderNoteAction(orderId: string, note: string): Promise<ActionResult> {
  return run(async (adminId) => {
    const text = note.trim().slice(0, 1000);
    if (!text) throw new Error("Nota vazia");
    await createAdminClient().from("order_events").insert({ order_id: orderId, message: `Nota: ${text}`, actor: actor(adminId) });
    revalidatePath(`/admin/pedidos/${orderId}`);
    return "Nota registrada";
  });
}

// ───────────────────────── Clientes ─────────────────────────

export async function setUserRoleAction(userId: string, role: "customer" | "admin"): Promise<ActionResult> {
  return run(async (adminId) => {
    if (userId === adminId && role !== "admin") throw new Error("Você não pode remover seu próprio acesso de administrador.");
    const { error } = await createAdminClient().from("profiles").update({ role }).eq("id", userId);
    if (error) throw error;
    revalidatePath(`/admin/clientes/${userId}`);
    return role === "admin" ? "Usuário promovido a administrador" : "Acesso administrativo removido";
  });
}

// ───────────────────────── Configurações ─────────────────────────

export async function saveSettingsAction(input: unknown): Promise<ActionResult> {
  return run(async () => {
    const data = settingsSchema.parse(input);
    if (data.combo_free >= data.combo_size) throw new Error("Na promoção, a quantidade grátis deve ser menor que o tamanho do combo.");
    const db = createAdminClient();
    const { data: before } = await db.from("store_settings").select("*").eq("id", 1).single();
    const { error } = await db.from("store_settings").update(data).eq("id", 1);
    if (error) throw error;

    const pricingChanged =
      before &&
      (before.pricing_strategy !== data.pricing_strategy ||
        before.default_sale_price_cents !== data.default_sale_price_cents ||
        Number(before.margin_percent) !== data.margin_percent ||
        before.fixed_markup_cents !== data.fixed_markup_cents ||
        before.min_price_cents !== data.min_price_cents ||
        before.round_to_90 !== data.round_to_90);
    let msg = "Configurações salvas";
    if (pricingChanged) {
      const n = await getCatalogSync().repriceAll();
      msg += ` · ${n} preço(s) recalculado(s)`;
    }
    revalidatePath("/", "layout");
    return msg;
  });
}

// ───────────────────────── Notificações push (app do admin) ─────────────────────────

const pushSubscriptionSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(8).max(100) }),
  label: z.string().trim().max(80).optional(),
});
const pushEventsSchema = z.array(z.enum(PUSH_EVENT_KEYS as [PushEventKey, ...PushEventKey[]])).max(PUSH_EVENT_KEYS.length);

export async function subscribePushAction(input: unknown): Promise<ActionResult> {
  return run(async (adminId) => {
    if (!pushConfigured()) throw new Error("Notificações não configuradas no servidor (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY).");
    const sub = pushSubscriptionSchema.parse(input);
    const db = createAdminClient();
    const { data: existing } = await db.from("push_subscriptions").select("id").eq("endpoint", sub.endpoint).maybeSingle();
    const row = { user_id: adminId, endpoint: sub.endpoint, p256dh: sub.keys.p256dh, auth: sub.keys.auth, device_label: sub.label || null, failures: 0 };
    const { error } = existing
      ? await db.from("push_subscriptions").update(row).eq("id", existing.id)
      : await db.from("push_subscriptions").insert(row);
    if (error) throw error;
    revalidatePath("/admin/notificacoes");
    return "Notificações ativadas neste aparelho";
  });
}

export async function updatePushEventsAction(endpoint: string, events: unknown): Promise<ActionResult> {
  return run(async (adminId) => {
    const list = pushEventsSchema.parse(events);
    const { error } = await createAdminClient().from("push_subscriptions").update({ events: list }).eq("endpoint", endpoint).eq("user_id", adminId);
    if (error) throw error;
    revalidatePath("/admin/notificacoes");
    return "Preferências salvas";
  });
}

export async function removePushAction(idOrEndpoint: { id?: string; endpoint?: string }): Promise<ActionResult> {
  return run(async (adminId) => {
    const q = createAdminClient().from("push_subscriptions").delete().eq("user_id", adminId);
    const { error } = idOrEndpoint.id ? await q.eq("id", idOrEndpoint.id) : await q.eq("endpoint", idOrEndpoint.endpoint ?? "");
    if (error) throw error;
    revalidatePath("/admin/notificacoes");
    return "Aparelho removido";
  });
}

export async function testPushAction(endpoint?: string): Promise<ActionResult> {
  return run(async (adminId) => {
    if (!(await rateLimit(`push-test:${adminId}`, 10, 300))) throw new Error("Muitos testes seguidos. Aguarde alguns minutos.");
    let q = createAdminClient().from("push_subscriptions").select("id, endpoint, p256dh, auth, failures").eq("user_id", adminId);
    if (endpoint) q = q.eq("endpoint", endpoint);
    const { data, error } = await q;
    if (error) throw error;
    if (!data?.length) throw new Error("Nenhum aparelho inscrito. Ative as notificações primeiro.");
    const r = await sendToSubscriptions(data, {
      title: "🔔 GhostKeys",
      body: "Notificações funcionando! Você será avisado sobre PIX, pagamentos e entregas.",
      url: "/admin/notificacoes",
      tag: "test",
    });
    if (!r.sent) throw new Error("Não foi possível entregar a notificação. Desative e ative de novo neste aparelho.");
    return `Notificação de teste enviada para ${r.sent} aparelho(s)`;
  });
}
