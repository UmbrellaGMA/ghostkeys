-- =====================================================================
-- Notificações push do painel (app do admin no celular)
-- Cada linha é um aparelho inscrito. Acesso SOMENTE pelo servidor (service_role).
-- =====================================================================

create table if not exists public.push_subscriptions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles(id) on delete cascade,
  endpoint      text not null unique check (endpoint ~ '^https://'),
  p256dh        text not null,
  auth          text not null,
  device_label  text check (char_length(device_label) <= 80),
  events        text[] not null default array[
                  'order_created', 'pix_generated', 'payment_approved', 'keys_delivered',
                  'delivery_failed', 'payment_rejected', 'order_refunded'
                ],
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz,
  failures      integer not null default 0
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;
-- Sem políticas: nenhum acesso via anon/authenticated
revoke all on public.push_subscriptions from anon, authenticated;
