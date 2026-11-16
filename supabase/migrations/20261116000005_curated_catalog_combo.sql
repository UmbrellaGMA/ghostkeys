-- =====================================================================
-- Catálogo curado (o admin escolhe o que importar) + promoção "Leve 3, pague 2"
-- =====================================================================

-- Promoção por quantidade: a cada `combo_size` jogos no carrinho, `combo_free` (os mais baratos) saem de graça
alter table public.store_settings
  add column if not exists combo_enabled boolean not null default true,
  add column if not exists combo_size integer not null default 3 check (combo_size between 2 and 20),
  add column if not exists combo_free integer not null default 1 check (combo_free >= 1),
  add column if not exists default_sale_price_cents integer not null default 2990 check (default_sale_price_cents > 0);

alter table public.store_settings drop constraint if exists combo_free_lt_size;
alter table public.store_settings add constraint combo_free_lt_size check (combo_free < combo_size);

-- Estratégia "flat": todos os jogos no modo global custam default_sale_price_cents (o custo ShadowKeys é igual para todos)
alter table public.store_settings drop constraint if exists store_settings_pricing_strategy_check;
alter table public.store_settings add constraint store_settings_pricing_strategy_check
  check (pricing_strategy in ('flat', 'percent', 'fixed', 'percent_plus_fixed'));

-- Desconto da promoção registrado separadamente (discount_cents continua sendo o desconto TOTAL)
alter table public.orders add column if not exists combo_discount_cents integer not null default 0 check (combo_discount_cents >= 0);
alter table public.orders drop constraint if exists combo_within_discount;
alter table public.orders add constraint combo_within_discount check (combo_discount_cents <= discount_cents);

create or replace function public.orders_amounts_immutable()
returns trigger language plpgsql as $$
begin
  if new.total_cents is distinct from old.total_cents
     or new.subtotal_cents is distinct from old.subtotal_cents
     or new.discount_cents is distinct from old.discount_cents
     or new.combo_discount_cents is distinct from old.combo_discount_cents
     or new.user_id is distinct from old.user_id then
    raise exception 'valores do pedido são imutáveis';
  end if;
  return new;
end $$;

-- Preço: acrescenta a estratégia "flat" (mesma regra em PricingService.calculateSalePrice)
create or replace function public.calc_sale_price(p_cost integer, s public.store_settings)
returns integer language plpgsql immutable as $$
declare
  v numeric;
  v_price integer;
  v_candidate integer;
begin
  if p_cost is null then return null; end if;
  v := case s.pricing_strategy
         when 'flat' then s.default_sale_price_cents
         when 'fixed' then p_cost + s.fixed_markup_cents
         when 'percent_plus_fixed' then p_cost * (1 + s.margin_percent / 100) + s.fixed_markup_cents
         else p_cost * (1 + s.margin_percent / 100)
       end;
  v_price := ceil(v)::integer;
  if s.round_to_90 then
    v_candidate := floor(v_price / 100.0)::integer * 100 + 90;
    if v_candidate < v_price then v_candidate := v_candidate + 100; end if;
    v_price := v_candidate;
  end if;
  return greatest(v_price, s.min_price_cents);
end $$;

create or replace function public.create_order_with_items(p_order jsonb, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
begin
  insert into public.orders (user_id, customer_name, customer_email, subtotal_cents, discount_cents, combo_discount_cents,
                             total_cents, coupon_id, coupon_code, expires_at)
  values ((p_order->>'user_id')::uuid, p_order->>'customer_name', p_order->>'customer_email',
          (p_order->>'subtotal_cents')::int, (p_order->>'discount_cents')::int,
          coalesce((p_order->>'combo_discount_cents')::int, 0), (p_order->>'total_cents')::int,
          nullif(p_order->>'coupon_id','')::uuid, nullif(p_order->>'coupon_code',''),
          (p_order->>'expires_at')::timestamptz)
  returning id into v_order_id;

  insert into public.order_items (order_id, product_id, product_name, product_slug, product_image_url,
                                  supplier_product_id, supplier_cost_cents, unit_price_cents, quantity,
                                  platform, activation_region)
  select v_order_id, (i->>'product_id')::uuid, i->>'product_name', i->>'product_slug', i->>'product_image_url',
         i->>'supplier_product_id', (i->>'supplier_cost_cents')::int, (i->>'unit_price_cents')::int,
         (i->>'quantity')::int, coalesce(i->>'platform','Steam'), i->>'activation_region'
    from jsonb_array_elements(p_items) i;

  insert into public.order_events (order_id, from_status, to_status, message, actor)
  values (v_order_id, null, 'pending_payment', 'Pedido criado', 'system');

  return v_order_id;
end $$;
revoke execute on function public.create_order_with_items(jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.create_order_with_items(jsonb, jsonb) to service_role;

-- Atualização de UM produto já importado (refresh periódico): nunca cria produtos novos
create or replace function public.refresh_product_from_supplier(p_app_id text, p_price integer, p_available boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  s public.store_settings;
begin
  select * into s from public.store_settings where id = 1;
  update public.products p
     set supplier_cost_cents = coalesce(p_price, p.supplier_cost_cents),
         available = p_available and p_price is not null,
         sale_price_cents = case when p.pricing_mode = 'global' and p_price is not null
                                 then public.calc_sale_price(p_price, s) else p.sale_price_cents end,
         promo_price_cents = case when p.promo_price_cents is not null and p.promo_price_cents >=
                                       (case when p.pricing_mode = 'global' and p_price is not null
                                             then public.calc_sale_price(p_price, s) else p.sale_price_cents end)
                                  then null else p.promo_price_cents end,
         supplier_synced_at = now()
   where p.supplier = 'shadowkeys' and p.supplier_product_id = p_app_id;
end $$;
revoke execute on function public.refresh_product_from_supplier(text, integer, boolean) from public, anon, authenticated;
grant execute on function public.refresh_product_from_supplier(text, integer, boolean) to service_role;
