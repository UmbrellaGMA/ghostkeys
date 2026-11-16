-- =====================================================================
-- Segurança: funções, RLS, permissões
-- =====================================================================

-- ───────────────────────── Perfil automático ─────────────────────────
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Mantém o e-mail do perfil sincronizado com auth.users
create or replace function public.handle_user_email_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end $$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ───────────────────────── Papel ─────────────────────────
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
$$;

-- ───────────────────────── Transições de status (atômicas) ─────────────────────────
-- Retorna true somente se ESTA chamada efetuou a transição. Base da idempotência:
-- dois webhooks simultâneos => apenas um recebe true.
create or replace function public.transition_order_status(
  p_order_id uuid,
  p_from public.order_status[],
  p_to public.order_status,
  p_message text default null,
  p_actor text default 'system'
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_from public.order_status;
begin
  -- Bloqueia a linha: chamadas concorrentes são serializadas
  select status into v_from from public.orders where id = p_order_id for update;
  if v_from is null or not (v_from = any (p_from)) then
    return false;
  end if;

  update public.orders o
     set status = p_to,
         paid_at      = case when p_to = 'paid' and o.paid_at is null then now() else o.paid_at end,
         delivered_at = case when p_to = 'delivered' then now() else o.delivered_at end,
         cancelled_at = case when p_to = 'cancelled' then now() else o.cancelled_at end,
         refunded_at  = case when p_to = 'refunded' then now() else o.refunded_at end
   where o.id = p_order_id;

  insert into public.order_events (order_id, from_status, to_status, message, actor)
  values (p_order_id, v_from, p_to, p_message, p_actor);
  return true;
end $$;

-- Reserva o pedido para entrega. Apenas UM processo consegue o "lock" por vez.
-- Pedidos presos em 'processing' há mais de 10 minutos (processo interrompido) podem ser reivindicados.
create or replace function public.claim_order_for_delivery(
  p_order_id uuid,
  p_triggered_by text
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_attempt_id uuid;
  v_attempts integer;
  v_prev public.order_status;
begin
  select status into v_prev from public.orders where id = p_order_id for update;
  if v_prev is null then
    return null;
  end if;

  update public.orders
     set status = 'processing',
         delivery_attempts = delivery_attempts + 1,
         next_delivery_attempt_at = null
   where id = p_order_id
     and (status in ('paid', 'delivery_failed')
          or (status = 'processing' and updated_at < now() - interval '10 minutes'))
  returning delivery_attempts into v_attempts;

  if not found then
    return null;
  end if;

  insert into public.delivery_attempts (order_id, attempt_number, triggered_by)
  values (p_order_id, v_attempts, p_triggered_by)
  returning id into v_attempt_id;

  insert into public.order_events (order_id, from_status, to_status, message, actor)
  values (p_order_id, v_prev, 'processing', 'Entrega iniciada (tentativa ' || v_attempts || ')', p_triggered_by);

  return v_attempt_id;
end $$;

-- Ao concluir a entrega: contabiliza vendas e uso de cupom
create or replace function public.on_order_delivered()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'delivered' and old.status is distinct from 'delivered' then
    update public.products p
       set sales_count = p.sales_count + oi.quantity
      from public.order_items oi
     where oi.order_id = new.id and oi.product_id = p.id;
  end if;
  if new.status = 'paid' and old.status = 'pending_payment' and new.coupon_id is not null then
    update public.coupons set used_count = used_count + 1 where id = new.coupon_id;
  end if;
  return new;
end $$;
create trigger orders_after_status after update of status on public.orders
  for each row execute function public.on_order_delivered();

-- ───────────────────────── Leitura segura das keys ─────────────────────────
-- Única forma de um usuário obter keys: valida propriedade (ou admin), registra acesso.
-- Retorna o valor CRIPTOGRAFADO; a descriptografia ocorre apenas no servidor.
create or replace function public.get_order_keys(p_order_id uuid)
returns table (
  key_id uuid,
  order_item_id uuid,
  product_name text,
  encrypted_key text,
  key_last4 text,
  delivery_status public.key_delivery_status,
  delivered_at timestamptz,
  is_test boolean
) language plpgsql security definer set search_path = public as $$
declare
  v_owner uuid;
  v_status public.order_status;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '28000';
  end if;

  select user_id, status into v_owner, v_status from public.orders where id = p_order_id;
  if v_owner is null then
    raise exception 'ORDER_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_owner <> auth.uid() and not public.is_admin() then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  insert into public.key_access_logs (digital_key_id, user_id)
  select dk.id, auth.uid()
    from public.digital_keys dk
    join public.order_items oi on oi.id = dk.order_item_id
   where oi.order_id = p_order_id;

  return query
    select dk.id, dk.order_item_id, oi.product_name, dk.encrypted_key, dk.key_last4,
           dk.delivery_status, dk.delivered_at, dk.is_test
      from public.digital_keys dk
      join public.order_items oi on oi.id = dk.order_item_id
     where oi.order_id = p_order_id
       and dk.delivery_status = 'delivered'
     order by oi.created_at, dk.delivered_at;
end $$;

-- ───────────────────────── Rate limit (janela fixa, compartilhado entre instâncias) ─────────────────────────
create or replace function public.check_rate_limit(p_key text, p_limit integer, p_window_seconds integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_count integer;
begin
  insert into public.rate_limits as r (key, window_start, count)
  values (p_key, now(), 1)
  on conflict (key) do update
    set count = case when r.window_start < now() - make_interval(secs => p_window_seconds) then 1 else r.count + 1 end,
        window_start = case when r.window_start < now() - make_interval(secs => p_window_seconds) then now() else r.window_start end
  returning count into v_count;
  return v_count <= p_limit;
end $$;

-- ───────────────────────── Dashboard (admin) ─────────────────────────
create or replace function public.admin_dashboard_stats(p_since timestamptz)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  select jsonb_build_object(
    'revenue_cents', coalesce((select sum(total_cents) from orders where status in ('paid','processing','delivered','delivery_failed') and paid_at >= p_since), 0),
    'cost_cents', coalesce((select sum(oi.supplier_cost_cents * oi.quantity) from order_items oi join orders o on o.id = oi.order_id
                             where o.status in ('paid','processing','delivered','delivery_failed') and o.paid_at >= p_since), 0),
    'sales_count', (select count(*) from orders where status in ('paid','processing','delivered','delivery_failed') and paid_at >= p_since),
    'pending_payment', (select count(*) from orders where status = 'pending_payment'),
    'awaiting_delivery', (select count(*) from orders where status in ('paid','processing')),
    'delivered', (select count(*) from orders where status = 'delivered' and delivered_at >= p_since),
    'delivery_failed', (select count(*) from orders where status = 'delivery_failed'),
    'refunded', (select count(*) from orders where status = 'refunded' and refunded_at >= p_since),
    'top_products', coalesce((
      select jsonb_agg(t) from (
        select oi.product_name as name, sum(oi.quantity)::int as quantity, sum(oi.unit_price_cents * oi.quantity)::bigint as revenue_cents
          from order_items oi join orders o on o.id = oi.order_id
         where o.status = 'delivered' and o.paid_at >= p_since
         group by oi.product_name order by 2 desc limit 5) t), '[]'::jsonb)
  ) into v;
  return v;
end $$;

-- ───────────────────────── Permissões de execução ─────────────────────────
revoke execute on function public.transition_order_status(uuid, public.order_status[], public.order_status, text, text) from public, anon, authenticated;
revoke execute on function public.claim_order_for_delivery(uuid, text) from public, anon, authenticated;
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
revoke execute on function public.admin_dashboard_stats(timestamptz) from public, anon, authenticated;
revoke execute on function public.get_order_keys(uuid) from public, anon;
grant execute on function public.get_order_keys(uuid) to authenticated;
grant execute on function public.transition_order_status(uuid, public.order_status[], public.order_status, text, text) to service_role;
grant execute on function public.claim_order_for_delivery(uuid, text) to service_role;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;
grant execute on function public.admin_dashboard_stats(timestamptz) to service_role;

-- =====================================================================
-- Row Level Security
-- =====================================================================
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.store_settings     enable row level security;
alter table public.products           enable row level security;
alter table public.product_categories enable row level security;
alter table public.coupons            enable row level security;
alter table public.orders             enable row level security;
alter table public.order_items        enable row level security;
alter table public.payments           enable row level security;
alter table public.digital_keys       enable row level security;
alter table public.order_events       enable row level security;
alter table public.delivery_attempts  enable row level security;
alter table public.webhook_events     enable row level security;
alter table public.api_logs           enable row level security;
alter table public.key_access_logs    enable row level security;
alter table public.sync_runs          enable row level security;
alter table public.rate_limits        enable row level security;

-- profiles: o usuário vê/edita apenas o próprio nome; o papel não pode ser alterado pelo usuário
create policy profiles_select_own on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (full_name) on public.profiles to authenticated;
revoke insert, delete on public.profiles from authenticated, anon;

-- Catálogo público
create policy categories_public_read on public.categories for select to anon, authenticated using (true);
create policy products_public_read on public.products for select to anon, authenticated
  using (active or public.is_admin());
create policy product_categories_public_read on public.product_categories for select to anon, authenticated using (true);
create policy store_settings_public_read on public.store_settings for select to anon, authenticated using (true);

-- Pedidos: somente o dono (ou admin) lê; escrita apenas pelo servidor (service_role)
create policy orders_owner_read on public.orders for select to authenticated
  using (user_id = auth.uid() or public.is_admin());
create policy order_items_owner_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy payments_owner_read on public.payments for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));
create policy order_events_owner_read on public.order_events for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id and (o.user_id = auth.uid() or public.is_admin())));

-- Logs administrativos
create policy delivery_attempts_admin_read on public.delivery_attempts for select to authenticated using (public.is_admin());
create policy api_logs_admin_read on public.api_logs for select to authenticated using (public.is_admin());
create policy webhook_events_admin_read on public.webhook_events for select to authenticated using (public.is_admin());
create policy sync_runs_admin_read on public.sync_runs for select to authenticated using (public.is_admin());
create policy coupons_admin_read on public.coupons for select to authenticated using (public.is_admin());

-- digital_keys, key_access_logs, rate_limits: SEM políticas => nenhum acesso via anon/authenticated.
-- Além do RLS, retiramos os privilégios de tabela por defesa em profundidade.
revoke all on public.digital_keys    from anon, authenticated;
revoke all on public.key_access_logs from anon, authenticated;
revoke all on public.rate_limits     from anon, authenticated;

-- Nenhuma escrita direta de clientes nas tabelas transacionais
revoke insert, update, delete on public.orders, public.order_items, public.payments, public.order_events,
  public.delivery_attempts, public.webhook_events, public.api_logs, public.sync_runs, public.coupons,
  public.products, public.product_categories, public.categories, public.store_settings
  from anon, authenticated;

-- ───────────────────────── View pública do catálogo ─────────────────────────
-- security_invoker: a view respeita o RLS de products (apenas produtos ativos para visitantes).
create or replace view public.catalog_products with (security_invoker = true) as
select
  p.id, p.name, p.slug, p.short_description, p.image_url, p.background_url, p.platform,
  p.activation_region, p.release_date, p.developer, p.publisher, p.tags, p.nsfw,
  p.sale_price_cents, p.promo_price_cents, p.promo_ends_at, p.original_price_cents,
  p.available, p.active, p.featured, p.sales_count, p.category_id, p.created_at,
  public.effective_price_cents(p) as price_cents,
  (p.promo_price_cents is not null and p.promo_price_cents < p.sale_price_cents
     and (p.promo_ends_at is null or p.promo_ends_at > now()))
   or (p.original_price_cents is not null and p.original_price_cents > public.effective_price_cents(p)) as on_sale,
  array(select pc.category_id from public.product_categories pc where pc.product_id = p.id) as category_ids
from public.products p
where p.sale_price_cents > 0;

grant select on public.catalog_products to anon, authenticated;

-- ───────────────────────── Criação atômica de pedido ─────────────────────────
-- Chamado apenas pelo servidor depois de recalcular preços e validar disponibilidade.
create or replace function public.create_order_with_items(p_order jsonb, p_items jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_order_id uuid;
begin
  insert into public.orders (user_id, customer_name, customer_email, subtotal_cents, discount_cents,
                             total_cents, coupon_id, coupon_code, expires_at)
  values ((p_order->>'user_id')::uuid, p_order->>'customer_name', p_order->>'customer_email',
          (p_order->>'subtotal_cents')::int, (p_order->>'discount_cents')::int, (p_order->>'total_cents')::int,
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
