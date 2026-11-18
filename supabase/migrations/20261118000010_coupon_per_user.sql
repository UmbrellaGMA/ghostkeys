-- =====================================================================
-- Cupons: limite de usos por cliente
--  • conta pedidos do cliente com o cupom que estão pagos/entregues ou aguardando pagamento
--    (ainda dentro do prazo). Cancelados, reembolsados e PIX expirados não contam.
--  • validado também no banco (trigger), com trava no cupom: pedidos simultâneos não furam o limite
-- =====================================================================

alter table public.coupons
  add column if not exists max_uses_per_user integer check (max_uses_per_user is null or max_uses_per_user >= 1);

create or replace function public.coupon_uses_by_user(p_coupon_id uuid, p_user_id uuid)
returns integer language sql stable security definer set search_path = public as $$
  select count(*)::int
  from public.orders o
  where o.coupon_id = p_coupon_id
    and o.user_id = p_user_id
    and (
      o.status in ('paid', 'processing', 'delivered', 'delivery_failed')
      or (o.status = 'pending_payment' and (o.expires_at is null or o.expires_at > now()))
    )
$$;

revoke execute on function public.coupon_uses_by_user(uuid, uuid) from public, anon, authenticated;
grant execute on function public.coupon_uses_by_user(uuid, uuid) to service_role;

create or replace function public.orders_enforce_coupon_per_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_limit integer;
begin
  if new.coupon_id is null then
    return new;
  end if;
  -- Trava o cupom: pedidos simultâneos do mesmo cupom passam um de cada vez
  select max_uses_per_user into v_limit from public.coupons where id = new.coupon_id for update;
  if v_limit is not null and public.coupon_uses_by_user(new.coupon_id, new.user_id) >= v_limit then
    raise exception 'COUPON_USER_LIMIT: limite de % uso(s) por cliente atingido', v_limit using errcode = 'P0001';
  end if;
  return new;
end $$;

revoke execute on function public.orders_enforce_coupon_per_user() from public, anon, authenticated;

drop trigger if exists orders_coupon_per_user on public.orders;
create trigger orders_coupon_per_user before insert on public.orders
  for each row execute function public.orders_enforce_coupon_per_user();
