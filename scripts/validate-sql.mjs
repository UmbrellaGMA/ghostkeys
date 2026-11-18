// Valida as migrations do projeto num Postgres real (PGlite/WASM) com shim mínimo do Supabase
// (roles anon/authenticated/service_role, auth.users, auth.uid(), storage). Não precisa de Docker.
// Uso: npm run test:sql
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { fuzzystrmatch } from "@electric-sql/pglite/contrib/fuzzystrmatch";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const root = process.argv[2] ?? process.cwd();
const db = new PGlite({ extensions: { pgcrypto, pg_trgm, fuzzystrmatch } });

const shim = `
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema auth;
create table auth.users(id uuid primary key, email text, raw_user_meta_data jsonb default '{}'::jsonb);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
grant usage on schema auth to anon, authenticated, service_role;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
create schema storage;
create table storage.buckets(id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
alter table storage.objects enable row level security;
`;

let pass = 0, fail = 0;
const ok = (name, cond, extra = "") => {
  if (cond) { pass++; console.log("  ✓", name); } else { fail++; console.log("  ✗", name, extra); }
};
async function as(role, sub, fn) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${sub ?? ""}', false); set role ${role};`);
  try { return await fn(); } finally { await db.exec("reset role;"); }
}
async function err(p) { try { await p; return null; } catch (e) { return e.message; } }

await db.exec(shim);
const migDir = join(root, "supabase", "migrations");
for (const f of readdirSync(migDir).sort()) {
  try { await db.exec(readFileSync(join(migDir, f), "utf8")); console.log("migration OK:", f); }
  catch (e) { console.log("migration FALHOU:", f, "→", e.message); process.exit(1); }
}
await db.exec(readFileSync(join(root, "supabase", "seed.sql"), "utf8"));
console.log("seed OK\n");

const A = "11111111-1111-1111-1111-111111111111", B = "22222222-2222-2222-2222-222222222222", C = "33333333-3333-3333-3333-333333333333";
await db.exec(`insert into auth.users(id,email,raw_user_meta_data) values
 ('${A}','alice@t.local','{"full_name":"Alice"}'),('${B}','bob@t.local','{}'),('${C}','boss@t.local','{}');
 update public.profiles set role='admin' where id='${C}';`);

console.log("Perfis / auth");
const prof = await db.query(`select role, full_name from profiles where id='${A}'`);
ok("trigger cria perfil com papel customer", prof.rows[0]?.role === "customer" && prof.rows[0]?.full_name === "Alice");

console.log("Pedido + key");
const o = await db.query(`select public.create_order_with_items($1::jsonb,$2::jsonb) as id`, [
  JSON.stringify({ user_id: A, customer_name: "Alice", customer_email: "alice@t.local", subtotal_cents: 2600, discount_cents: 0, total_cents: 2600, expires_at: new Date(Date.now() + 1e6).toISOString() }),
  JSON.stringify([{ product_name: "Jogo", supplier_product_id: "1", supplier_cost_cents: 2000, unit_price_cents: 2600, quantity: 1 }]),
]);
const orderId = o.rows[0].id;
const item = (await db.query(`select id from order_items where order_id=$1`, [orderId])).rows[0].id;
await db.query(`insert into digital_keys(order_item_id, encrypted_key, key_hash, key_last4) values ($1,'v1:a:b:c','h1','1234')`, [item]);
ok("pedido criado atomicamente com item e evento", (await db.query(`select count(*)::int c from order_events where order_id=$1`, [orderId])).rows[0].c === 1);

console.log("Proteção das keys");
ok("cliente NÃO lê digital_keys diretamente", (await as("authenticated", A, () => err(db.query("select * from digital_keys")))) !== null);
ok("anon NÃO lê digital_keys", (await as("anon", null, () => err(db.query("select * from digital_keys")))) !== null);
const own = await as("authenticated", A, () => db.query(`select * from get_order_keys($1)`, [orderId]));
ok("dono obtém keys via get_order_keys", own.rows.length === 1);
const other = await as("authenticated", B, () => err(db.query(`select * from get_order_keys($1)`, [orderId])));
ok("outro usuário recebe FORBIDDEN", other?.includes("FORBIDDEN"), other);
const anonKeys = await as("anon", null, () => err(db.query(`select * from get_order_keys($1)`, [orderId])));
ok("anon não executa get_order_keys", anonKeys !== null);
const adminKeys = await as("authenticated", C, () => db.query(`select * from get_order_keys($1)`, [orderId]));
ok("admin obtém keys", adminKeys.rows.length === 1);
ok("acessos registrados em key_access_logs", (await db.query("select count(*)::int c from key_access_logs")).rows[0].c === 2);

console.log("RLS de pedidos");
ok("dono vê o próprio pedido", (await as("authenticated", A, () => db.query("select id from orders"))).rows.length === 1);
ok("outro usuário não vê o pedido", (await as("authenticated", B, () => db.query("select id from orders"))).rows.length === 0);
ok("anon não vê pedidos", (await as("anon", null, () => db.query("select id from orders"))).rows.length === 0);
ok("admin vê pedidos", (await as("authenticated", C, () => db.query("select id from orders"))).rows.length === 1);
ok("cliente não altera status do pedido", (await as("authenticated", A, () => err(db.query(`update orders set status='paid' where id=$1`, [orderId])))) !== null);
ok("cliente não cria pedido direto", (await as("authenticated", A, () => err(db.query(`insert into orders(user_id,customer_name,customer_email,subtotal_cents,total_cents) values ($1,'x','x',100,100)`, [A])))) !== null);

console.log("Permissões / papéis");
ok("cliente não se promove a admin", (await as("authenticated", B, () => err(db.query(`update profiles set role='admin' where id=$1`, [B])))) !== null);
await as("authenticated", B, () => db.query(`update profiles set full_name='Bob' where id=$1`, [B]));
ok("cliente altera o próprio nome", (await db.query(`select full_name from profiles where id=$1`, [B])).rows[0].full_name === "Bob");
await as("authenticated", B, () => db.query(`update profiles set full_name='hack' where id=$1`, [A]));
ok("cliente não altera nome de outro", (await db.query(`select full_name from profiles where id=$1`, [A])).rows[0].full_name === "Alice");
ok("cliente não executa transition_order_status", (await as("authenticated", A, () => err(db.query(`select transition_order_status($1, array['pending_payment']::order_status[], 'paid')`, [orderId])))) !== null);
ok("admin (via API) não executa claim_order_for_delivery", (await as("authenticated", C, () => err(db.query(`select claim_order_for_delivery($1,'x')`, [orderId])))) !== null);
ok("cliente não executa create_order_with_items", (await as("authenticated", A, () => err(db.query(`select create_order_with_items('{}'::jsonb,'[]'::jsonb)`)))) !== null);
ok("cliente não lê cupons", (await as("authenticated", A, () => db.query("select * from coupons"))).rows.length === 0);

console.log("Idempotência");
const t1 = (await db.query(`select transition_order_status($1, array['pending_payment']::order_status[], 'paid', 'a', 'test') r`, [orderId])).rows[0].r;
const t2 = (await db.query(`select transition_order_status($1, array['pending_payment']::order_status[], 'paid', 'a', 'test') r`, [orderId])).rows[0].r;
ok("transição só ocorre uma vez", t1 === true && t2 === false);
const c1 = (await db.query(`select claim_order_for_delivery($1,'test') r`, [orderId])).rows[0].r;
const c2 = (await db.query(`select claim_order_for_delivery($1,'test') r`, [orderId])).rows[0].r;
ok("lock de entrega exclusivo", c1 !== null && c2 === null);
ok("paid_at preenchido", (await db.query(`select paid_at from orders where id=$1`, [orderId])).rows[0].paid_at !== null);
const ex = await err(db.query(`insert into digital_keys(order_item_id, encrypted_key, key_hash) values ($1,'v1:x','h2')`, [item]));
ok("trigger impede keys acima da quantidade", ex?.includes("KEY_QUANTITY_EXCEEDED"), ex);
const dup = await err(db.query(`insert into digital_keys(order_item_id, encrypted_key, key_hash) values ($1,'v1:x','h1')`, [item]));
ok("key_hash único (mesma key não é gravada 2x)", dup !== null);
ok("valores do pedido imutáveis", (await err(db.query(`update orders set total_cents=1 where id=$1`, [orderId])))?.includes("imutáveis"));
ok("itens do pedido imutáveis", (await err(db.query(`update order_items set unit_price_cents=1 where id=$1`, [item])))?.includes("imutáveis"));
await db.query(`select transition_order_status($1, array['processing']::order_status[], 'delivered', 'ok', 'test')`, [orderId]);

console.log("Catálogo");
await db.exec(`insert into products(supplier_product_id,name,slug,supplier_cost_cents,sale_price_cents,promo_price_cents,available,category_id)
  values ('1245620','Elden Ring','elden-ring',2000,2600,1990,true,(select id from categories where slug='rpg')),
         ('999','Oculto','oculto',100,200,null,true,null);
  update products set active=false where slug='oculto';
  insert into product_categories select p.id, c.id from products p, categories c where p.slug='elden-ring' and c.slug='rpg';`);
const cat = await as("anon", null, () => db.query(`select slug, price_cents, on_sale, category_ids from catalog_products`));
ok("view pública mostra só produtos ativos", cat.rows.length === 1 && cat.rows[0].slug === "elden-ring");
ok("preço efetivo considera promoção", cat.rows[0].price_cents === 1990 && cat.rows[0].on_sale === true);
ok("category_ids na view", cat.rows[0].category_ids.length === 1);
ok("anon não altera produtos", (await as("anon", null, () => err(db.query(`update products set sale_price_cents=1`)))) !== null);
ok("constraint promo < preço", (await err(db.query(`update products set promo_price_cents=5000 where slug='elden-ring'`))) !== null);

console.log("Funções auxiliares");
const rl = [];
for (let i = 0; i < 4; i++) rl.push((await db.query(`select check_rate_limit('k', 3, 60) r`)).rows[0].r);
ok("rate limit bloqueia após o limite", JSON.stringify(rl) === "[true,true,true,false]", JSON.stringify(rl));
const stats = (await db.query(`select admin_dashboard_stats(now() - interval '1 day') s`)).rows[0].s;
ok("dashboard: faturamento e lucro", stats.revenue_cents === 2600 && stats.cost_cents === 2000 && stats.delivered === 1, JSON.stringify(stats));
ok("cliente não executa admin_dashboard_stats", (await as("authenticated", C, () => err(db.query(`select admin_dashboard_stats(now())`)))) !== null);

console.log("Sincronização em lote (catálogo grande)");
// Paridade com PricingService.calculateSalePrice (mesmos casos de tests/pricing.test.ts)
const price = async (cost, s) => {
  await db.query(`update store_settings set pricing_strategy=$1, margin_percent=$2, fixed_markup_cents=$3, min_price_cents=$4, round_to_90=$5`,
    [s.strategy ?? "percent", s.margin ?? 30, s.fixed ?? 0, s.min ?? 100, s.r90 ?? false]);
  return (await db.query(`select calc_sale_price($1, s) v from store_settings s`, [cost])).rows[0].v;
};
const parity = [
  [2000, {}, 2600], [2000, { strategy: "fixed", fixed: 500 }, 2500], [2000, { strategy: "percent_plus_fixed", fixed: 100 }, 2700],
  [333, { margin: 10 }, 367], [1000, { margin: 15 }, 1150], [10, { min: 199 }, 199], [2000, { r90: true }, 2690],
  [2070, { margin: 0, r90: true }, 2090], [2095, { margin: 0, r90: true }, 2190],
];
let parityOk = true;
for (const [c, s, exp] of parity) { const v = await price(c, s); if (v !== exp) { parityOk = false; console.log("    paridade", c, s, "→", v, "esperado", exp); } }
ok("calc_sale_price idêntico ao TypeScript", parityOk);
await price(0, {}); // volta para 30%

const game = (appId, name, slug, priceCents, extra = {}) => ({ appId, name, slug, coverUrl: `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg`, shortDescription: "d", developer: "dev", publisher: "pub", releaseDate: "2022-02-25", nsfw: false, priceCents, ...extra });
const runStart = (await db.query("select now() t")).rows[0].t;
await new Promise((r) => setTimeout(r, 20));
const r1 = (await db.query(`select sync_upsert_products($1::jsonb) r`, [JSON.stringify([game("1245620", "Elden Ring", "elden-ring", 3000), game("500", "Novo Jogo", "novo-jogo", 500), game("501", "Sem Plano", "sem-plano", null)])])).rows[0].r;
ok("upsert insere novos e atualiza existentes", r1.inserted === 2 && r1.updated === 1, JSON.stringify(r1));
const er = (await db.query(`select supplier_cost_cents, sale_price_cents, promo_price_cents, name from products where supplier_product_id='1245620'`)).rows[0];
ok("custo e preço global recalculados (30%)", er.supplier_cost_cents === 3000 && er.sale_price_cents === 3900, JSON.stringify(er));
ok("promoção mantida quando ainda menor que o preço", er.promo_price_cents === 1990);
ok("jogo sem preço do plano fica indisponível", (await db.query(`select available from products where supplier_product_id='501'`)).rows[0].available === false);

await db.exec(`update products set name='Nome Editado', pricing_mode='custom', custom_price_cents=9990, sale_price_cents=9990, promo_price_cents=null where supplier_product_id='500'`);
await db.query(`select sync_upsert_products($1::jsonb)`, [JSON.stringify([game("500", "Novo Jogo", "novo-jogo", 700)])]);
const ed = (await db.query(`select name, sale_price_cents, supplier_cost_cents from products where supplier_product_id='500'`)).rows[0];
ok("preserva nome e preço personalizado do admin", ed.name === "Nome Editado" && ed.sale_price_cents === 9990 && ed.supplier_cost_cents === 700, JSON.stringify(ed));

await db.query(`select sync_upsert_products($1::jsonb)`, [JSON.stringify([game("777", "Elden Ring Clone", "elden-ring", 500)])]);
ok("slug repetido recebe o AppID", (await db.query(`select slug from products where supplier_product_id='777'`)).rows[0].slug === "elden-ring-777");

await db.exec(`update products set promo_price_cents=1990, sale_price_cents=3900 where supplier_product_id='1245620'`);
await db.query(`select sync_upsert_products($1::jsonb)`, [JSON.stringify([game("1245620", "Elden Ring", "elden-ring", 1000)])]);
ok("promoção removida quando fica >= novo preço", (await db.query(`select promo_price_cents, sale_price_cents from products where supplier_product_id='1245620'`)).rows[0].promo_price_cents === null);

const deact = (await db.query(`select sync_deactivate_missing($1) n`, [runStart])).rows[0].n;
ok("desativa jogos ausentes da passada", deact >= 0 && (await db.query(`select available from products where slug='oculto'`)).rows[0].available === false);
ok("mantém disponíveis os jogos sincronizados", (await db.query(`select available from products where supplier_product_id='1245620'`)).rows[0].available === true);

await db.exec(`update store_settings set margin_percent=50`);
const rp = (await db.query(`select reprice_global_products() n`)).rows[0].n;
ok("reprice em lote aplica nova margem", rp >= 1 && (await db.query(`select sale_price_cents from products where supplier_product_id='1245620'`)).rows[0].sale_price_cents === 1500);
ok("reprice não toca preço personalizado", (await db.query(`select sale_price_cents from products where supplier_product_id='500'`)).rows[0].sale_price_cents === 9990);

const pid = (await db.query(`select id from products where supplier_product_id='777'`)).rows[0].id;
await db.query(`select apply_product_tags($1, $2)`, [pid, ["Action", "RPG", "Open World"]]);
const tagged = (await db.query(`select p.details_synced_at, c.slug as main, (select count(*)::int from product_categories where product_id=p.id) n from products p left join categories c on c.id=p.category_id where p.id=$1`, [pid])).rows[0];
ok("tags categorizam o produto (principal + N:N)", tagged.details_synced_at !== null && tagged.main === "acao" && tagged.n === 3, JSON.stringify(tagged));
ok("cliente não executa funções de sincronização", (await as("authenticated", C, () => err(db.query(`select reprice_global_products()`)))) !== null);

console.log("Catálogo curado + Leve 3, pague 2");
ok("estratégia flat: preço padrão para qualquer custo", (await price(300, { strategy: "flat" })) === 2990 && (await price(700, { strategy: "flat" })) === 2990);
await db.exec(`update store_settings set pricing_strategy='flat', default_sale_price_cents=2990`);
await db.query(`select refresh_product_from_supplier('1245620', 300, true)`);
ok("refresh atualiza só produto existente (preço flat)", (await db.query(`select sale_price_cents from products where supplier_product_id='1245620'`)).rows[0].sale_price_cents === 2990);
await db.query(`select refresh_product_from_supplier('999999', 300, true)`);
ok("refresh nunca cria produto novo", (await db.query(`select count(*)::int c from products where supplier_product_id='999999'`)).rows[0].c === 0);
await db.query(`select refresh_product_from_supplier('1245620', null, false)`);
ok("refresh marca indisponível quando sai do fornecedor", (await db.query(`select available from products where supplier_product_id='1245620'`)).rows[0].available === false);
const oc = (await db.query(`select create_order_with_items($1::jsonb,$2::jsonb) id`, [
  JSON.stringify({ user_id: B, customer_name: "Bob", customer_email: "bob@t.local", subtotal_cents: 8970, discount_cents: 2490, combo_discount_cents: 2490, total_cents: 6480, expires_at: new Date(Date.now() + 1e6).toISOString() }),
  JSON.stringify([{ product_name: "A", supplier_product_id: "1", supplier_cost_cents: 300, unit_price_cents: 3490, quantity: 1 }, { product_name: "B", supplier_product_id: "2", supplier_cost_cents: 300, unit_price_cents: 2990, quantity: 1 }, { product_name: "C", supplier_product_id: "3", supplier_cost_cents: 300, unit_price_cents: 2490, quantity: 1 }]),
])).rows[0].id;
ok("pedido grava desconto da promoção", (await db.query(`select combo_discount_cents from orders where id=$1`, [oc])).rows[0].combo_discount_cents === 2490);
ok("desconto da promoção é imutável", (await err(db.query(`update orders set combo_discount_cents=0 where id=$1`, [oc])))?.includes("imutáveis"));
ok("combo grátis < tamanho do combo", (await err(db.query(`update store_settings set combo_free=3, combo_size=3`))) !== null);

console.log("Tutoriais de ativação");
ok("tutorial Steam padrão criado pela migration", (await db.query(`select count(*)::int c from activation_tutorials where is_default and platform='Steam'`)).rows[0].c === 1);
ok("visitante lê tutoriais ativos", (await as("anon", null, () => db.query(`select id from activation_tutorials`))).rows.length === 1);
ok("cliente NÃO edita tutoriais", (await as("authenticated", A, () => err(db.query(`update activation_tutorials set title='x'`)))) !== null);
ok("apenas um tutorial padrão", (await err(db.query(`insert into activation_tutorials(platform,title,is_default) values ('Epic','Epic',true)`))) !== null);
ok("plataforma única (sem diferenciar maiúsculas)", (await err(db.query(`insert into activation_tutorials(platform,title) values ('steam ','Outro')`))) !== null);
await db.exec(`insert into activation_tutorials(platform,title,active) values ('GOG','GOG oculto',false)`);
console.log("Busca por proximidade");
const search = (role, q) => as(role, role === "anon" ? null : A, async () => (await db.query(`select p.name from search_products($1, 10, true) s join products p on p.id = s.id`, [q])).rows.map((r) => r.name));
ok("erro de digitação encontra o jogo (\"eldn rign\")", (await search("anon", "eldn rign")).includes("Elden Ring"));
ok("sigla encontra o jogo (\"er\")", (await search("anon", "er")).includes("Elden Ring"));
ok("acentos e símbolos ignorados (\"ÉLDEN-RING™\")", (await search("anon", "ÉLDEN-RING™"))[0] === "Elden Ring");
ok("romanos viram números", (await db.query(`select search_normalize('Dark Souls™ III') v`)).rows[0].v === "dark souls 3");
ok("produto desativado NÃO aparece na busca do visitante", !(await search("anon", "oculto")).includes("Oculto"));
ok("letras trocadas encontram o jogo (\"elden rnig\")", (await search("anon", "elden rnig")).includes("Elden Ring"));
ok("busca curta demais não retorna nada", (await search("anon", "e")).length === 0);

console.log("Notificações push");
ok("cliente NÃO lê aparelhos inscritos", (await as("authenticated", A, () => err(db.query(`select * from push_subscriptions`)))) !== null);
ok("admin logado também NÃO lê direto (somente servidor)", (await as("authenticated", C, () => err(db.query(`select * from push_subscriptions`)))) !== null);
ok("endpoint precisa ser https", (await err(db.query(`insert into push_subscriptions(user_id,endpoint,p256dh,auth) values ('${C}','http://x','a','b')`))) !== null);
ok("tutorial oculto não aparece para visitante", (await as("anon", null, () => db.query(`select id from activation_tutorials where platform='GOG'`))).rows.length === 0);

console.log("Chat de suporte");
const conv = (await db.query(`insert into support_conversations(user_id, customer_name, customer_email) values ('${A}', 'Ana', 'ana@t.local') returning id`)).rows[0].id;
await db.query(`insert into support_messages(conversation_id, sender, body) values ($1, 'customer', $2)`, [conv, "  Olá,\n  minha key   não ativa  "]);
await db.query(`insert into support_messages(conversation_id, sender, body) values ($1, 'customer', 'alguém?')`, [conv]);
let cv = (await db.query(`select * from support_conversations where id=$1`, [conv])).rows[0];
ok("mensagem do cliente soma não lidas do admin", cv.unread_admin === 2 && cv.last_sender === "customer");
ok("prévia sem quebras/espaços extras", cv.last_message_preview === "alguém?");
await db.query(`update support_conversations set status='closed' where id=$1`, [conv]);
await db.query(`insert into support_messages(conversation_id, sender, body) values ($1, 'admin', 'Oi! Vou verificar.')`, [conv]);
cv = (await db.query(`select * from support_conversations where id=$1`, [conv])).rows[0];
ok("resposta do admin zera não lidas do admin e soma do cliente", cv.unread_admin === 0 && cv.unread_customer === 1);
ok("resposta do admin não reabre conversa fechada", cv.status === "closed");
await db.query(`insert into support_messages(conversation_id, sender, body) values ($1, 'customer', 'obrigado')`, [conv]);
ok("nova mensagem do cliente reabre a conversa", (await db.query(`select status from support_conversations where id=$1`, [conv])).rows[0].status === "open");
ok("mensagem vazia é rejeitada", (await err(db.query(`insert into support_messages(conversation_id, sender, body) values ($1, 'customer', '   ')`, [conv]))) !== null);
ok("mensagem acima de 2000 caracteres é rejeitada", (await err(db.query(`insert into support_messages(conversation_id, sender, body) values ($1, 'customer', $2)`, [conv, "x".repeat(2001)]))) !== null);
ok("uma conversa por cliente logado", (await err(db.query(`insert into support_conversations(user_id, customer_name, customer_email) values ('${A}', 'Ana', 'ana@t.local')`))) !== null);
ok("conversa precisa de dono (cliente ou visitante)", (await err(db.query(`insert into support_conversations(customer_name, customer_email) values ('X', 'x@t.local')`))) !== null);
ok("e-mail inválido é rejeitado", (await err(db.query(`insert into support_conversations(guest_token_hash, customer_name, customer_email) values ($1, 'X', 'nao-e-email')`, ["a".repeat(64)]))) !== null);
ok("cliente NÃO lê conversas direto", (await as("authenticated", A, () => err(db.query(`select * from support_conversations`)))) !== null);
ok("visitante NÃO lê mensagens direto", (await as("anon", null, () => err(db.query(`select * from support_messages`)))) !== null);
ok("cliente NÃO insere mensagem direto", (await as("authenticated", A, () => err(db.query(`insert into support_messages(conversation_id, sender, body) values ('${conv}', 'admin', 'falso')`)))) !== null);
ok("novo aparelho já recebe avisos de suporte", (await db.query(`select pg_get_expr(adbin, adrelid) d from pg_attrdef where adrelid='public.push_subscriptions'::regclass and adnum=(select attnum from pg_attribute where attrelid='public.push_subscriptions'::regclass and attname='events')`)).rows[0].d.includes("support_message"));

console.log("Cupom: limite por cliente");
const cup = (await db.query(`insert into coupons(code, discount_type, discount_value, max_uses_per_user) values ('UMAVEZ', 'percent', 10, 1) returning id`)).rows[0].id;
const orderWithCoupon = (user, expiresInMs = 1e6) => db.query(`select create_order_with_items($1::jsonb,$2::jsonb) id`, [
  JSON.stringify({ user_id: user, customer_name: "X", customer_email: "x@t.local", subtotal_cents: 3000, discount_cents: 300, total_cents: 2700, coupon_id: cup, coupon_code: "UMAVEZ", expires_at: new Date(Date.now() + expiresInMs).toISOString() }),
  JSON.stringify([{ product_name: "A", supplier_product_id: "1", supplier_cost_cents: 300, unit_price_cents: 3000, quantity: 1 }]),
]);
const o1 = (await orderWithCoupon(B)).rows[0].id;
ok("primeiro uso do cupom é aceito", Boolean(o1));
ok("segundo uso pelo mesmo cliente é bloqueado no banco", (await err(orderWithCoupon(B)))?.includes("COUPON_USER_LIMIT"));
ok("outro cliente ainda pode usar", Boolean((await orderWithCoupon(A)).rows[0].id));
await db.query(`update orders set status='cancelled', cancelled_at=now() where id=$1`, [o1]);
ok("pedido cancelado devolve o uso ao cliente", Boolean((await orderWithCoupon(B)).rows[0].id));
await db.query(`update coupons set max_uses_per_user = 3 where id=$1`, [cup]);
ok("contagem por cliente ignora pedidos cancelados", (await db.query(`select coupon_uses_by_user($1,$2) n`, [cup, B])).rows[0].n === 1);
ok("cliente NÃO consulta usos de cupom direto", (await as("authenticated", B, () => err(db.query(`select coupon_uses_by_user('${cup}','${B}')`)))) !== null);
ok("limite por cliente precisa ser >= 1", (await err(db.query(`update coupons set max_uses_per_user = 0 where id=$1`, [cup]))) !== null);

console.log(`\n${pass} passaram, ${fail} falharam`);
process.exit(fail ? 1 : 0);
