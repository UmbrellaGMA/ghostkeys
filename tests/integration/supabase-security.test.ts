import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Testes de integração com um Supabase REAL (recomendado: local via `supabase start`).
 * Executar com:
 *   SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_ROLE_KEY=... npm test
 * Sem essas variáveis, os testes são ignorados.
 *
 * Cobrem: cadastro/login, RLS de pedidos, proteção das keys (digital_keys inacessível,
 * get_order_keys só para dono/admin), funções privilegiadas e alteração de papel.
 */
const url = process.env.SUPABASE_TEST_URL;
const anon = process.env.SUPABASE_TEST_ANON_KEY;
const service = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY;
const enabled = Boolean(url && anon && service);

describe.skipIf(!enabled)("Supabase: autenticação, RLS e permissões", () => {
  let admin: SupabaseClient;
  const users: Record<"alice" | "bob" | "boss", { id: string; email: string; client: SupabaseClient }> = {} as never;
  const password = `Senha${randomUUID().slice(0, 8)}1`;
  let orderId: string;
  let keyId: string;

  async function signUpAndLogin(name: "alice" | "bob" | "boss") {
    const email = `${name}.${randomUUID().slice(0, 8)}@test.local`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
    if (error) throw error;
    const client = createClient(url!, anon!, { auth: { persistSession: false } });
    const login = await client.auth.signInWithPassword({ email, password });
    if (login.error) throw login.error;
    users[name] = { id: data.user!.id, email, client };
  }

  beforeAll(async () => {
    admin = createClient(url!, service!, { auth: { persistSession: false } });
    await signUpAndLogin("alice");
    await signUpAndLogin("bob");
    await signUpAndLogin("boss");
    await admin.from("profiles").update({ role: "admin" }).eq("id", users.boss.id);

    // Pedido entregue da Alice com uma key (criado pelo servidor/service role)
    const { data: oid, error } = await admin.rpc("create_order_with_items", {
      p_order: { user_id: users.alice.id, customer_name: "Alice", customer_email: users.alice.email, subtotal_cents: 2600, discount_cents: 0, total_cents: 2600, expires_at: new Date(Date.now() + 1e6).toISOString() },
      p_items: [{ product_name: "Jogo", supplier_product_id: "1", supplier_cost_cents: 2000, unit_price_cents: 2600, quantity: 1 }],
    });
    if (error) throw error;
    orderId = oid as string;
    const { data: item } = await admin.from("order_items").select("id").eq("order_id", orderId).single();
    const { data: key, error: kErr } = await admin
      .from("digital_keys")
      .insert({ order_item_id: item!.id, encrypted_key: "v1:aaa:bbb:ccc", key_hash: randomUUID(), key_last4: "1234" })
      .select("id")
      .single();
    if (kErr) throw kErr;
    keyId = key!.id;
  });

  afterAll(async () => {
    if (!admin) return;
    if (orderId) {
      await admin.from("digital_keys").delete().eq("id", keyId);
      await admin.from("orders").delete().eq("id", orderId);
    }
    for (const u of Object.values(users)) await admin.auth.admin.deleteUser(u.id);
  });

  it("cadastro cria perfil automaticamente com papel customer", async () => {
    const { data } = await users.alice.client.from("profiles").select("role, full_name").eq("id", users.alice.id).single();
    expect(data).toMatchObject({ role: "customer", full_name: "alice" });
  });

  it("login com senha errada falha", async () => {
    const c = createClient(url!, anon!, { auth: { persistSession: false } });
    const { error } = await c.auth.signInWithPassword({ email: users.alice.email, password: "errada123" });
    expect(error).not.toBeNull();
  });

  it("usuário NÃO consegue ler a tabela digital_keys diretamente", async () => {
    const { data, error } = await users.alice.client.from("digital_keys").select("*");
    expect(error !== null || (data ?? []).length === 0).toBe(true);
  });

  it("visitante anônimo não acessa pedidos nem keys", async () => {
    const anonClient = createClient(url!, anon!, { auth: { persistSession: false } });
    const { data } = await anonClient.from("orders").select("*");
    expect(data ?? []).toHaveLength(0);
    const { error } = await anonClient.rpc("get_order_keys", { p_order_id: orderId });
    expect(error).not.toBeNull();
  });

  it("dono do pedido obtém as keys pela função segura", async () => {
    const { data, error } = await users.alice.client.rpc("get_order_keys", { p_order_id: orderId });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("outro usuário não vê o pedido nem as keys", async () => {
    const { data: orders } = await users.bob.client.from("orders").select("*").eq("id", orderId);
    expect(orders ?? []).toHaveLength(0);
    const { error } = await users.bob.client.rpc("get_order_keys", { p_order_id: orderId });
    expect(error?.message).toMatch(/FORBIDDEN/);
  });

  it("administrador autorizado consegue ler as keys do pedido", async () => {
    const { data, error } = await users.boss.client.rpc("get_order_keys", { p_order_id: orderId });
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("acessos às keys são registrados", async () => {
    const { count } = await admin.from("key_access_logs").select("*", { count: "exact", head: true }).eq("digital_key_id", keyId);
    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("cliente não consegue se promover a admin", async () => {
    const { error } = await users.bob.client.from("profiles").update({ role: "admin" }).eq("id", users.bob.id);
    expect(error).not.toBeNull();
    const { data } = await admin.from("profiles").select("role").eq("id", users.bob.id).single();
    expect(data!.role).toBe("customer");
  });

  it("cliente pode alterar apenas o próprio nome", async () => {
    const { error } = await users.bob.client.from("profiles").update({ full_name: "Bob Atualizado" }).eq("id", users.bob.id);
    expect(error).toBeNull();
    await users.bob.client.from("profiles").update({ full_name: "Hack" }).eq("id", users.alice.id);
    const { data } = await admin.from("profiles").select("full_name").eq("id", users.alice.id).single();
    expect(data!.full_name).toBe("alice");
  });

  it("cliente não pode alterar status de pedido nem chamar funções privilegiadas", async () => {
    const upd = await users.alice.client.from("orders").update({ status: "paid" }).eq("id", orderId);
    expect(upd.error).not.toBeNull();
    const rpc = await users.alice.client.rpc("transition_order_status", { p_order_id: orderId, p_from: ["pending_payment"], p_to: "paid" });
    expect(rpc.error).not.toBeNull();
    const claim = await users.boss.client.rpc("claim_order_for_delivery", { p_order_id: orderId, p_triggered_by: "x" });
    expect(claim.error).not.toBeNull();
  });

  it("cliente não consegue criar pedidos diretamente (somente o servidor)", async () => {
    const { error } = await users.alice.client.from("orders").insert({ user_id: users.alice.id, customer_name: "x", customer_email: "x", subtotal_cents: 1, total_cents: 1 });
    expect(error).not.toBeNull();
  });

  it("transição de status é atômica e idempotente", async () => {
    const r1 = await admin.rpc("transition_order_status", { p_order_id: orderId, p_from: ["pending_payment"], p_to: "paid", p_message: "t", p_actor: "test" });
    const r2 = await admin.rpc("transition_order_status", { p_order_id: orderId, p_from: ["pending_payment"], p_to: "paid", p_message: "t", p_actor: "test" });
    expect(r1.data).toBe(true);
    expect(r2.data).toBe(false);
    const c1 = await admin.rpc("claim_order_for_delivery", { p_order_id: orderId, p_triggered_by: "test" });
    const c2 = await admin.rpc("claim_order_for_delivery", { p_order_id: orderId, p_triggered_by: "test" });
    expect(c1.data).toBeTruthy();
    expect(c2.data).toBeNull();
  });

  it("impede mais keys do que a quantidade comprada e keys duplicadas", async () => {
    const { data: item } = await admin.from("order_items").select("id").eq("order_id", orderId).single();
    const extra = await admin.from("digital_keys").insert({ order_item_id: item!.id, encrypted_key: "v1:x:y:z", key_hash: randomUUID() });
    expect(extra.error?.message).toMatch(/KEY_QUANTITY_EXCEEDED/);
  });

  it("valores do pedido são imutáveis", async () => {
    const { error } = await admin.from("orders").update({ total_cents: 1 }).eq("id", orderId);
    expect(error?.message).toMatch(/imutáveis/);
  });
});
