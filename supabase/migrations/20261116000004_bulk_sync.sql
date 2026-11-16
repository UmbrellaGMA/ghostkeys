-- =====================================================================
-- Sincronização em lote para catálogos grandes (a ShadowKeys tem ~54 mil jogos)
--  - Upsert por página (50 jogos por chamada) em vez de um UPDATE por produto
--  - Execução retomável (next_page) com "lease" para evitar execuções concorrentes
--  - Categorização gradual via GET /games/{appId} (details_synced_at)
-- =====================================================================

alter table public.products add column if not exists details_synced_at timestamptz;
create index if not exists products_details_pending_idx on public.products (sales_count desc) where details_synced_at is null;
create index if not exists products_synced_idx on public.products (supplier_synced_at);

alter table public.sync_runs
  add column if not exists next_page integer not null default 1,
  add column if not exists total_pages integer,
  add column if not exists locked_until timestamptz;

-- Mesma regra de src/services/PricingService.ts#calculateSalePrice (paridade verificada em scripts/validate-sql.mjs)
create or replace function public.calc_sale_price(p_cost integer, s public.store_settings)
returns integer language plpgsql immutable as $$
declare
  v numeric;
  v_price integer;
  v_candidate integer;
begin
  if p_cost is null then return null; end if;
  v := case s.pricing_strategy
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

-- Upsert de uma página do catálogo. p_games: [{appId,name,slug,coverUrl,shortDescription,developer,publisher,releaseDate,nsfw,priceCents}]
-- Preserva edições do admin (nome, slug, descrição, imagens, preço personalizado).
create or replace function public.sync_upsert_products(p_games jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  s public.store_settings;
  v_inserted integer;
  v_total integer;
begin
  select * into s from public.store_settings where id = 1;

  with g as (
    select x."appId" as app_id, x.name, x.slug, x."coverUrl" as cover, x."shortDescription" as short_desc,
           x.developer, x.publisher, nullif(x."releaseDate", '')::date as release_date,
           coalesce(x.nsfw, false) as nsfw, x."priceCents" as price
      from jsonb_to_recordset(p_games) as x("appId" text, name text, slug text, "coverUrl" text, "shortDescription" text,
                                             developer text, publisher text, "releaseDate" text, nsfw boolean, "priceCents" integer)
  ), up as (
    insert into public.products as p (
      supplier, supplier_product_id, name, slug, description, short_description, image_url, background_url,
      developer, publisher, release_date, nsfw, supplier_cost_cents, sale_price_cents, platform,
      available, active, supplier_synced_at)
    select 'shadowkeys', g.app_id, g.name,
           case when exists (select 1 from public.products e where e.slug = g.slug and e.supplier_product_id <> g.app_id)
                then g.slug || '-' || g.app_id else g.slug end,
           g.short_desc, g.short_desc, g.cover, g.cover, g.developer, g.publisher, g.release_date, g.nsfw,
           g.price, coalesce(public.calc_sale_price(g.price, s), 0), s.default_platform,
           g.price is not null, true, now()
      from g
    on conflict (supplier, supplier_product_id) do update set
      supplier_cost_cents = coalesce(excluded.supplier_cost_cents, p.supplier_cost_cents),
      available           = excluded.available,
      sale_price_cents    = case when p.pricing_mode = 'global' and excluded.supplier_cost_cents is not null
                                 then excluded.sale_price_cents else p.sale_price_cents end,
      promo_price_cents   = case when p.promo_price_cents is not null
                                  and p.promo_price_cents >= (case when p.pricing_mode = 'global' and excluded.supplier_cost_cents is not null
                                                                   then excluded.sale_price_cents else p.sale_price_cents end)
                                 then null else p.promo_price_cents end,
      image_url           = coalesce(p.image_url, excluded.image_url),
      background_url      = coalesce(p.background_url, excluded.background_url),
      short_description   = coalesce(p.short_description, excluded.short_description),
      description         = coalesce(p.description, excluded.description),
      developer           = coalesce(p.developer, excluded.developer),
      publisher           = coalesce(p.publisher, excluded.publisher),
      release_date        = coalesce(p.release_date, excluded.release_date),
      nsfw                = excluded.nsfw,
      supplier_synced_at  = now()
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted), count(*) into v_inserted, v_total from up;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_total - v_inserted);
end $$;

-- Ao final de uma passada completa: desativa o que não apareceu no catálogo
create or replace function public.sync_deactivate_missing(p_since timestamptz)
returns integer language sql security definer set search_path = public as $$
  with d as (
    update public.products set available = false
     where supplier = 'shadowkeys' and available
       and (supplier_synced_at is null or supplier_synced_at < p_since)
    returning 1)
  select count(*)::int from d
$$;

-- Recalcula todos os preços no modo global (após alterar a margem) em um único comando
create or replace function public.reprice_global_products()
returns integer language plpgsql security definer set search_path = public as $$
declare
  s public.store_settings;
  v integer;
begin
  select * into s from public.store_settings where id = 1;
  with c as (
    update public.products p
       set sale_price_cents = public.calc_sale_price(p.supplier_cost_cents, s),
           promo_price_cents = case when p.promo_price_cents >= public.calc_sale_price(p.supplier_cost_cents, s) then null else p.promo_price_cents end
     where p.pricing_mode = 'global' and p.supplier_cost_cents is not null
       and p.sale_price_cents is distinct from public.calc_sale_price(p.supplier_cost_cents, s)
    returning 1)
  select count(*)::int into v from c;
  return v;
end $$;

-- Aplica as tags de GET /games/{appId} e categoriza o produto
create or replace function public.apply_product_tags(p_product_id uuid, p_tags text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.products p
     set tags = coalesce(p_tags, '{}'),
         details_synced_at = now(),
         category_id = coalesce(p.category_id, (
           select c.id from public.categories c
            where exists (select 1 from unnest(c.supplier_tags) t where lower(t) = any (select lower(x) from unnest(p_tags) x))
            order by c.sort_order limit 1))
   where p.id = p_product_id;

  insert into public.product_categories (product_id, category_id)
  select p_product_id, c.id from public.categories c
   where exists (select 1 from unnest(c.supplier_tags) t where lower(t) = any (select lower(x) from unnest(p_tags) x))
  on conflict do nothing;
end $$;

revoke execute on function public.sync_upsert_products(jsonb) from public, anon, authenticated;
revoke execute on function public.sync_deactivate_missing(timestamptz) from public, anon, authenticated;
revoke execute on function public.reprice_global_products() from public, anon, authenticated;
revoke execute on function public.apply_product_tags(uuid, text[]) from public, anon, authenticated;
grant execute on function public.sync_upsert_products(jsonb) to service_role;
grant execute on function public.sync_deactivate_missing(timestamptz) to service_role;
grant execute on function public.reprice_global_products() to service_role;
grant execute on function public.apply_product_tags(uuid, text[]) to service_role;
