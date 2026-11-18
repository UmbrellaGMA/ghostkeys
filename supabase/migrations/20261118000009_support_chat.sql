-- =====================================================================
-- Chat de suporte (cliente ↔ administrador)
--  • conversa de cliente logado (user_id) ou de visitante (guest_token_hash, cookie no aparelho)
--  • acesso SOMENTE pelo servidor (service_role): rotas validam sessão/cookie antes de ler
--  • contadores de não lidas e prévia atualizados por trigger a cada mensagem
-- =====================================================================

create table if not exists public.support_conversations (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid references public.profiles(id) on delete set null,
  guest_token_hash      text unique check (guest_token_hash ~ '^[0-9a-f]{64}$'),
  customer_name         text not null check (char_length(btrim(customer_name)) between 1 and 80),
  customer_email        text not null check (char_length(customer_email) <= 254 and customer_email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  status                text not null default 'open' check (status in ('open', 'closed')),
  last_message_at       timestamptz not null default now(),
  last_message_preview  text,
  last_sender           text check (last_sender in ('customer', 'admin')),
  unread_admin          integer not null default 0 check (unread_admin >= 0),
  unread_customer       integer not null default 0 check (unread_customer >= 0),
  customer_last_seen_at timestamptz,
  last_reply_email_at   timestamptz,
  created_at            timestamptz not null default now(),
  check (user_id is not null or guest_token_hash is not null)
);

-- Uma conversa por cliente logado (reaberta a cada nova mensagem)
create unique index if not exists support_conversations_user_uidx on public.support_conversations (user_id) where user_id is not null;
create index if not exists support_conversations_inbox_idx on public.support_conversations (status, last_message_at desc);

create table if not exists public.support_messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid not null references public.support_conversations(id) on delete cascade,
  sender           text not null check (sender in ('customer', 'admin')),
  author_id        uuid references public.profiles(id) on delete set null,
  body             text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at       timestamptz not null default now()
);

create index if not exists support_messages_conversation_idx on public.support_messages (conversation_id, created_at);

-- Atualiza prévia, contadores e status da conversa a cada mensagem
create or replace function public.support_message_after_insert()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.support_conversations c set
    last_message_at      = new.created_at,
    last_message_preview = left(regexp_replace(btrim(new.body), '\s+', ' ', 'g'), 140),
    last_sender          = new.sender,
    unread_admin         = case when new.sender = 'customer' then c.unread_admin + 1 else 0 end,
    unread_customer      = case when new.sender = 'admin' then c.unread_customer + 1 else c.unread_customer end,
    status               = case when new.sender = 'customer' then 'open' else c.status end
  where c.id = new.conversation_id;
  return new;
end $$;

drop trigger if exists support_messages_after_insert on public.support_messages;
create trigger support_messages_after_insert after insert on public.support_messages
  for each row execute function public.support_message_after_insert();

revoke all on function public.support_message_after_insert() from public, anon, authenticated;

alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
-- Sem políticas: nenhum acesso via anon/authenticated
revoke all on public.support_conversations from anon, authenticated;
revoke all on public.support_messages from anon, authenticated;

-- Novo evento de notificação push: mensagem de suporte (ligado para quem já está inscrito)
alter table public.push_subscriptions alter column events set default array[
  'order_created', 'pix_generated', 'payment_approved', 'keys_delivered',
  'delivery_failed', 'payment_rejected', 'order_refunded', 'support_message'
];
update public.push_subscriptions set events = array_append(events, 'support_message')
  where not ('support_message' = any(events));
