-- =====================================================================
-- Loja de keys digitais — schema principal
-- Valores monetários são armazenados em CENTAVOS (integer) para evitar
-- erros de arredondamento. Ex.: R$ 26,00 => 2600.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ───────────────────────── Tipos ─────────────────────────
create type public.user_role as enum ('customer', 'admin');

create type public.order_status as enum (
  'pending_payment', 'paid', 'processing', 'delivered',
  'delivery_failed', 'cancelled', 'refunded'
);

create type public.key_delivery_status as enum ('delivered', 'revoked');

create type public.pricing_mode as enum ('global', 'custom');

-- ───────────────────────── Utilitário updated_at ─────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ───────────────────────── profiles ─────────────────────────
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  email       text not null,
  role        public.user_role not null default 'customer',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index profiles_email_idx on public.profiles (lower(email));
create index profiles_role_idx on public.profiles (role);
create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ───────────────────────── categories ─────────────────────────
create table public.categories (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  -- Tags retornadas por GET /games/{appId} (ShadowKeys) que mapeiam para esta categoria
  supplier_tags text[] not null default '{}',
  sort_order    integer not null default 0,
  created_at    timestamptz not null default now()
);

-- ───────────────────────── store_settings (linha única) ─────────────────────────
-- Nenhum segredo é armazenado aqui: credenciais ficam apenas em variáveis de ambiente.
create table public.store_settings (
  id                       smallint primary key default 1 check (id = 1),
  store_name               text not null default 'GhostKeys',
  store_legal_name         text,
  store_document           text,               -- CNPJ
  support_email            text,
  support_whatsapp         text,
  support_hours            text default 'Seg. a Sáb., 9h às 21h',
  -- Precificação global
  pricing_strategy         text not null default 'percent'
                           check (pricing_strategy in ('percent', 'fixed', 'percent_plus_fixed')),
  margin_percent           numeric(7,2) not null default 30 check (margin_percent >= 0 and margin_percent <= 1000),
  fixed_markup_cents       integer not null default 0 check (fixed_markup_cents >= 0),
  min_price_cents          integer not null default 100 check (min_price_cents >= 1),
  round_to_90              boolean not null default false,
  -- Produto
  default_platform         text not null default 'Steam',
  default_activation_region text,
  activation_instructions  text,
  import_nsfw              boolean not null default false,
  auto_deactivate_missing  boolean not null default true,
  max_quantity_per_item    integer not null default 5 check (max_quantity_per_item between 1 and 100),
  -- Pagamento
  pix_enabled              boolean not null default true,
  card_enabled             boolean not null default true,
  pix_expiration_minutes   integer not null default 30 check (pix_expiration_minutes between 10 and 1440),
  max_installments         integer not null default 1 check (max_installments between 1 and 12),
  -- Entrega
  auto_delivery_enabled    boolean not null default true,
  delivery_max_attempts    integer not null default 5 check (delivery_max_attempts between 1 and 50),
  key_code_length          text not null default '20' check (key_code_length in ('15','20','25','random')),
  -- E-mails
  emails_enabled           boolean not null default true,
  email_reply_to           text,
  updated_at               timestamptz not null default now()
);
create trigger store_settings_touch before update on public.store_settings
  for each row execute function public.touch_updated_at();

-- ───────────────────────── products ─────────────────────────
create table public.products (
  id                   uuid primary key default gen_random_uuid(),
  supplier             text not null default 'shadowkeys',
  supplier_product_id  text not null,             -- Steam AppID na ShadowKeys
  name                 text not null,
  slug                 text not null unique,
  description          text,
  short_description    text,
  image_url            text,
  background_url       text,
  developer            text,
  publisher            text,
  release_date         date,
  tags                 text[] not null default '{}',
  nsfw                 boolean not null default false,
  -- Preços (centavos)
  supplier_cost_cents  integer check (supplier_cost_cents >= 0),     -- priceCents da ShadowKeys
  original_price_cents integer check (original_price_cents >= 0),    -- preço "de" exibido riscado
  sale_price_cents     integer not null default 0 check (sale_price_cents >= 0),
  promo_price_cents    integer check (promo_price_cents > 0),
  promo_ends_at        timestamptz,
  pricing_mode         public.pricing_mode not null default 'global',
  custom_price_cents   integer check (custom_price_cents > 0),
  category_id          uuid references public.categories (id) on delete set null,
  platform             text not null default 'Steam',
  activation_region    text,
  -- Disponibilidade: available = fornecedor oferece (preço != null e presente no catálogo)
  available            boolean not null default false,
  active               boolean not null default true,   -- controle manual do admin
  featured             boolean not null default false,
  sales_count          integer not null default 0,
  supplier_synced_at   timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (supplier, supplier_product_id),
  constraint promo_lower_than_sale check (promo_price_cents is null or promo_price_cents < sale_price_cents),
  constraint custom_requires_price check (pricing_mode = 'global' or custom_price_cents is not null)
);
create index products_listing_idx on public.products (active, available, featured);
create index products_category_idx on public.products (category_id);
create index products_sales_idx on public.products (sales_count desc);
create index products_release_idx on public.products (release_date desc nulls last);
create index products_name_trgm_idx on public.products using gin (name gin_trgm_ops);
create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();

create table public.product_categories (
  product_id  uuid not null references public.products (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  primary key (product_id, category_id)
);
create index product_categories_category_idx on public.product_categories (category_id);

-- Preço efetivo exibido na loja (promoção vigente ou preço de venda)
create or replace function public.effective_price_cents(p public.products)
returns integer language sql stable as $$
  select case
    when p.promo_price_cents is not null and (p.promo_ends_at is null or p.promo_ends_at > now())
      then p.promo_price_cents
    else p.sale_price_cents
  end
$$;

-- ───────────────────────── coupons ─────────────────────────
create table public.coupons (
  id               uuid primary key default gen_random_uuid(),
  code             text not null unique check (code = upper(code) and length(code) between 3 and 40),
  discount_type    text not null check (discount_type in ('percent', 'fixed')),
  discount_value   integer not null check (discount_value > 0), -- percent: 1..100 / fixed: centavos
  min_order_cents  integer not null default 0,
  max_uses         integer,
  used_count       integer not null default 0,
  expires_at       timestamptz,
  active           boolean not null default true,
  created_at       timestamptz not null default now(),
  constraint percent_range check (discount_type <> 'percent' or discount_value <= 100)
);

-- ───────────────────────── orders ─────────────────────────
create table public.orders (
  id                      uuid primary key default gen_random_uuid(),
  order_number            bigint generated always as identity unique,
  user_id                 uuid not null references public.profiles (id) on delete restrict,
  customer_name           text not null,
  customer_email          text not null,
  subtotal_cents          integer not null check (subtotal_cents >= 0),
  discount_cents          integer not null default 0 check (discount_cents >= 0),
  total_cents             integer not null check (total_cents > 0),
  coupon_id               uuid references public.coupons (id) on delete set null,
  coupon_code             text,
  status                  public.order_status not null default 'pending_payment',
  payment_method          text check (payment_method in ('pix', 'card')),
  expires_at              timestamptz,
  paid_at                 timestamptz,
  delivered_at            timestamptz,
  cancelled_at            timestamptz,
  refunded_at             timestamptz,
  delivery_attempts       integer not null default 0,
  next_delivery_attempt_at timestamptz,
  last_delivery_error     text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint total_consistent check (total_cents = subtotal_cents - discount_cents)
);
create index orders_user_idx on public.orders (user_id, created_at desc);
create index orders_status_idx on public.orders (status, created_at desc);
create index orders_retry_idx on public.orders (next_delivery_attempt_at) where status in ('paid', 'delivery_failed');
create trigger orders_touch before update on public.orders
  for each row execute function public.touch_updated_at();

-- Snapshot imutável do item no momento da compra (preço e custo preservados)
create table public.order_items (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  product_id           uuid references public.products (id) on delete set null,
  product_name         text not null,
  product_slug         text,
  product_image_url    text,
  supplier_product_id  text not null,
  supplier_cost_cents  integer not null check (supplier_cost_cents >= 0),
  unit_price_cents     integer not null check (unit_price_cents > 0),
  quantity             integer not null check (quantity between 1 and 100),
  platform             text not null default 'Steam',
  activation_region    text,
  created_at           timestamptz not null default now()
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);

-- Impede alteração de preços/custos de itens já gravados
create or replace function public.order_items_immutable()
returns trigger language plpgsql as $$
begin
  if new.unit_price_cents is distinct from old.unit_price_cents
     or new.supplier_cost_cents is distinct from old.supplier_cost_cents
     or new.quantity is distinct from old.quantity
     or new.order_id is distinct from old.order_id
     or new.supplier_product_id is distinct from old.supplier_product_id then
    raise exception 'order_items são imutáveis após a criação';
  end if;
  return new;
end $$;
create trigger order_items_immutable before update on public.order_items
  for each row execute function public.order_items_immutable();

-- Valores do pedido também são imutáveis
create or replace function public.orders_amounts_immutable()
returns trigger language plpgsql as $$
begin
  if new.total_cents is distinct from old.total_cents
     or new.subtotal_cents is distinct from old.subtotal_cents
     or new.discount_cents is distinct from old.discount_cents
     or new.user_id is distinct from old.user_id then
    raise exception 'valores do pedido são imutáveis';
  end if;
  return new;
end $$;
create trigger orders_amounts_immutable before update on public.orders
  for each row execute function public.orders_amounts_immutable();

-- ───────────────────────── payments ─────────────────────────
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  order_id             uuid not null references public.orders (id) on delete cascade,
  provider             text not null default 'mercadopago',
  external_payment_id  text,
  idempotency_key      uuid not null unique,
  payment_method       text not null check (payment_method in ('pix', 'card')),
  payment_method_id    text,     -- ex.: pix, visa, master
  amount_cents         integer not null check (amount_cents > 0),
  currency             text not null default 'BRL',
  status               text not null default 'pending',
  status_detail        text,
  installments         integer,
  pix_qr_code          text,
  pix_qr_code_base64   text,
  pix_ticket_url       text,
  expires_at           timestamptz,
  approved_at          timestamptz,
  refunded_amount_cents integer not null default 0,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, external_payment_id)
);
create index payments_order_idx on public.payments (order_id);
create trigger payments_touch before update on public.payments
  for each row execute function public.touch_updated_at();

-- ───────────────────────── digital_keys ─────────────────────────
-- A key é armazenada criptografada (AES-256-GCM, chave fora do banco).
-- key_hash (HMAC-SHA256) garante que a mesma key nunca seja gravada/entregue duas vezes.
create table public.digital_keys (
  id               uuid primary key default gen_random_uuid(),
  order_item_id    uuid not null references public.order_items (id) on delete restrict,
  supplier_key_id  text unique,
  encrypted_key    text not null,
  key_hash         text not null unique,
  key_last4        text,
  delivery_status  public.key_delivery_status not null default 'delivered',
  is_test          boolean not null default false,
  delivered_at     timestamptz not null default now(),
  revoked_at       timestamptz,
  created_at       timestamptz not null default now()
);
create index digital_keys_item_idx on public.digital_keys (order_item_id);

-- Nunca mais keys do que a quantidade comprada
create or replace function public.digital_keys_quantity_guard()
returns trigger language plpgsql as $$
declare
  v_qty integer;
  v_count integer;
begin
  select quantity into v_qty from public.order_items where id = new.order_item_id for update;
  select count(*) into v_count from public.digital_keys where order_item_id = new.order_item_id;
  if v_count >= v_qty then
    raise exception 'KEY_QUANTITY_EXCEEDED: item % já possui % key(s)', new.order_item_id, v_count;
  end if;
  return new;
end $$;
create trigger digital_keys_quantity_guard before insert on public.digital_keys
  for each row execute function public.digital_keys_quantity_guard();

-- ───────────────────────── Histórico / auditoria ─────────────────────────
create table public.order_events (
  id           bigint generated always as identity primary key,
  order_id     uuid not null references public.orders (id) on delete cascade,
  from_status  public.order_status,
  to_status    public.order_status,
  message      text,
  actor        text not null default 'system',  -- system | webhook | cron | admin:<uuid>
  created_at   timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.delivery_attempts (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid not null references public.orders (id) on delete cascade,
  attempt_number   integer not null,
  status           text not null default 'started' check (status in ('started', 'success', 'partial', 'failed')),
  triggered_by     text not null,
  keys_generated   integer not null default 0,
  error_code       text,
  error_message    text,
  started_at       timestamptz not null default now(),
  finished_at      timestamptz
);
create index delivery_attempts_order_idx on public.delivery_attempts (order_id, started_at desc);

create table public.webhook_events (
  id               uuid primary key default gen_random_uuid(),
  provider         text not null,
  request_id       text,
  topic            text,
  action           text,
  resource_id      text,
  signature_valid  boolean not null,
  processed        boolean not null default false,
  result           text,
  received_at      timestamptz not null default now(),
  -- NULLs são distintos: notificações sem x-request-id não colidem
  constraint webhook_events_request_uq unique (provider, request_id)
);
create index webhook_events_resource_idx on public.webhook_events (provider, resource_id);

create table public.api_logs (
  id                bigint generated always as identity primary key,
  provider          text not null,
  operation         text not null,
  request_status    text not null,
  http_status       integer,
  duration_ms       integer,
  order_id          uuid,
  response_summary  text,
  created_at        timestamptz not null default now()
);
create index api_logs_created_idx on public.api_logs (created_at desc);
create index api_logs_provider_idx on public.api_logs (provider, created_at desc);

create table public.key_access_logs (
  id              bigint generated always as identity primary key,
  digital_key_id  uuid not null references public.digital_keys (id) on delete cascade,
  user_id         uuid,
  accessed_at     timestamptz not null default now()
);

create table public.sync_runs (
  id            uuid primary key default gen_random_uuid(),
  triggered_by  text not null,
  status        text not null default 'running' check (status in ('running', 'success', 'failed')),
  stats         jsonb not null default '{}',
  error         text,
  started_at    timestamptz not null default now(),
  finished_at   timestamptz
);

create table public.rate_limits (
  key           text primary key,
  window_start  timestamptz not null,
  count         integer not null
);
