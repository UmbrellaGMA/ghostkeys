-- =====================================================================
-- Tutoriais de ativação (editados manualmente no painel › Tutoriais)
-- Cada tutorial vale para uma plataforma (ex.: "Steam"). O marcado como padrão
-- é usado quando não existe tutorial específico para a plataforma do jogo.
-- =====================================================================

create table if not exists public.activation_tutorials (
  id              uuid primary key default gen_random_uuid(),
  platform        text not null check (char_length(btrim(platform)) between 1 and 40),
  title           text not null check (char_length(btrim(title)) between 2 and 120),
  intro           text check (char_length(intro) <= 2000),
  steps           text[] not null default '{}' check (cardinality(steps) <= 30),
  activation_url  text check (activation_url is null or activation_url ~ '^https://'),
  video_url       text check (video_url is null or video_url ~ '^https://'),
  notes           text check (char_length(notes) <= 4000),
  is_default      boolean not null default false,
  active          boolean not null default true,
  sort_order      integer not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists activation_tutorials_platform_uq on public.activation_tutorials (lower(btrim(platform)));
create unique index if not exists activation_tutorials_single_default on public.activation_tutorials (is_default) where is_default;

drop trigger if exists activation_tutorials_touch on public.activation_tutorials;
create trigger activation_tutorials_touch before update on public.activation_tutorials
  for each row execute function public.touch_updated_at();

-- Leitura pública (somente ativos); escrita apenas pelo servidor (service_role)
alter table public.activation_tutorials enable row level security;
drop policy if exists activation_tutorials_public_read on public.activation_tutorials;
create policy activation_tutorials_public_read on public.activation_tutorials for select to anon, authenticated
  using (active or public.is_admin());
revoke insert, update, delete on public.activation_tutorials from anon, authenticated;

-- Tutorial inicial da Steam (aproveita o texto antigo de "Instruções de ativação", se houver)
insert into public.activation_tutorials (platform, title, intro, steps, activation_url, notes, is_default, sort_order)
select
  'Steam',
  'Como ativar sua key na Steam',
  'Leva menos de 1 minuto. Você precisa de uma conta Steam (gratuita).',
  array[
    'Abra o aplicativo da Steam no computador e entre na sua conta.',
    'No menu superior, clique em "Jogos" › "Ativar um produto no Steam...".',
    'Clique em "Avançar" e aceite o Acordo de Assinatura do Steam.',
    'Cole a key exatamente como aparece aqui (use o botão de copiar) e clique em "Confirmar".',
    'Pronto! O jogo aparece na sua Biblioteca e já pode ser baixado.'
  ],
  'https://store.steampowered.com/account/registerkey',
  (select nullif(btrim(activation_instructions), '') from public.store_settings where id = 1),
  true,
  0
where not exists (select 1 from public.activation_tutorials);
