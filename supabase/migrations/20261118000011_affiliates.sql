-- =====================================================================
-- Cupons de afiliado
--  • cupom com dono (afiliado) e % de comissão sobre o valor pago em cada venda
--  • o % é gravado no pedido ao ser criado (mudar o cupom depois não altera semanas passadas)
--  • pagamentos de comissão registrados por semana (segunda a domingo, horário de Brasília)
--  • link privado do afiliado (token) para ele acompanhar as próprias vendas
-- =====================================================================

alter table public.coupons
  add column if not exists affiliate_name text check (affiliate_name is null or char_length(btrim(affiliate_name)) between 1 and 80),
  add column if not exists commission_percent numeric(5,2) check (commission_percent is null or (commission_percent > 0 and commission_percent <= 100)),
  add column if not exists affiliate_token text unique check (affiliate_token is null or affiliate_token ~ '^[A-Za-z0-9_-]{24,64}$');

alter table public.coupons drop constraint if exists coupons_affiliate_requires_name;
alter table public.coupons add constraint coupons_affiliate_requires_name
  check (commission_percent is null or affiliate_name is not null);

alter table public.orders
  add column if not exists affiliate_commission_percent numeric(5,2)
    check (affiliate_commission_percent is null or (affiliate_commission_percent > 0 and affiliate_commission_percent <= 100));

create index if not exists orders_coupon_paid_idx on public.orders (coupon_id, paid_at) where coupon_id is not null;

-- Congela o % de comissão do cupom no pedido (sempre vindo do banco, nunca do cliente)
create or replace function public.orders_set_affiliate_commission()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  new.affiliate_commission_percent := case
    when new.coupon_id is null then null
    else (select c.commission_percent from public.coupons c where c.id = new.coupon_id)
  end;
  return new;
end $$;

revoke execute on function public.orders_set_affiliate_commission() from public, anon, authenticated;

drop trigger if exists orders_affiliate_commission on public.orders;
create trigger orders_affiliate_commission before insert on public.orders
  for each row execute function public.orders_set_affiliate_commission();

-- Depois de criado, o % de comissão do pedido não muda
create or replace function public.orders_affiliate_commission_immutable()
returns trigger language plpgsql as $$
begin
  if new.affiliate_commission_percent is distinct from old.affiliate_commission_percent then
    raise exception 'comissão do pedido é imutável';
  end if;
  return new;
end $$;

drop trigger if exists orders_affiliate_commission_immutable on public.orders;
create trigger orders_affiliate_commission_immutable before update on public.orders
  for each row execute function public.orders_affiliate_commission_immutable();

-- Comissões pagas (uma linha por cupom e semana)
create table if not exists public.affiliate_payouts (
  id            uuid primary key default gen_random_uuid(),
  coupon_id     uuid not null references public.coupons(id) on delete cascade,
  week_start    date not null check (extract(isodow from week_start) = 1),  -- sempre uma segunda-feira
  amount_cents  integer not null check (amount_cents >= 0),
  paid_at       timestamptz not null default now(),
  paid_by       uuid references public.profiles(id) on delete set null,
  unique (coupon_id, week_start)
);

alter table public.affiliate_payouts enable row level security;
revoke all on public.affiliate_payouts from anon, authenticated;
