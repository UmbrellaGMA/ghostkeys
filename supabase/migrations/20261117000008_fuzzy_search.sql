-- =====================================================================
-- Busca por proximidade (nomes parecidos com o digitado)
--  • normalização: minúsculas, sem acentos/símbolos (™ ® : - '), romanos → números (III → 3)
--  • tolerância a erros de digitação (pg_trgm word_similarity)
--  • siglas: "gta" → Grand Theft Auto, "re4" → Resident Evil 4, "rdr2", "cod"...
--  • palavras em qualquer ordem e sem espaço ("spiderman" → Spider-Man)
-- =====================================================================

create extension if not exists pg_trgm;
create extension if not exists fuzzystrmatch with schema public;   -- levenshtein()

-- Normaliza um texto para busca (imutável: usado em colunas geradas)
create or replace function public.search_normalize(t text, roman_to_number boolean default true)
returns text language sql immutable parallel safe as $$
  select coalesce(string_agg(
    case when not roman_to_number then w else case w
      when 'i' then '1' when 'ii' then '2' when 'iii' then '3' when 'iv' then '4' when 'v' then '5'
      when 'vi' then '6' when 'vii' then '7' when 'viii' then '8' when 'ix' then '9' when 'x' then '10'
      when 'xi' then '11' when 'xii' then '12'
      else w
    end end, ' ' order by n), '')
  from regexp_split_to_table(
    btrim(regexp_replace(
      regexp_replace(
        translate(lower(coalesce(t, '')),
          'áàâãäåéèêëíìîïóòôõöúùûüçñýÿ',
          'aaaaaaeeeeiiiiooooouuuucnyy'),
        '[''’`´]', '', 'g'),            -- assassin's → assassins
      '[^a-z0-9]+', ' ', 'g')),           -- demais símbolos viram espaço
    ' ') with ordinality as s(w, n)
  where w <> ''
$$;

-- Sigla a partir do texto normalizado: iniciais das palavras + números inteiros
-- "grand theft auto 5 enhanced" → "gta5e" · "resident evil 4" → "re4"
create or replace function public.search_acronym(normalized text)
returns text language sql immutable parallel safe as $$
  select coalesce(string_agg(case when w ~ '^[0-9]+$' then w else left(w, 1) end, '' order by n), '')
  from regexp_split_to_table(coalesce(normalized, ''), ' ') with ordinality as s(w, n)
  where w <> ''
$$;

alter table public.products
  add column if not exists search_name text generated always as (public.search_normalize(name)) stored;
alter table public.products
  add column if not exists search_acronym text generated always as (public.search_acronym(public.search_normalize(name))) stored;
-- Sigla mantendo romanos: "grand theft auto v enhanced" → "gtave" (para quem digita "gtav")
alter table public.products
  add column if not exists search_acronym_roman text generated always as (public.search_acronym(public.search_normalize(name, false))) stored;

create index if not exists products_search_name_trgm_idx on public.products using gin (search_name gin_trgm_ops);

-- Busca ranqueada. SECURITY INVOKER: respeita o RLS (visitantes só veem produtos ativos).
create or replace function public.search_products(
  p_query text,
  p_limit integer default 8,
  p_include_unavailable boolean default false
)
returns table (id uuid, score real)
language sql stable security invoker set search_path = public as $$
  with q as (
    select public.search_normalize(left(p_query, 80)) as nq,
           replace(public.search_normalize(left(p_query, 80), false), ' ', '') as raw_compact
  ), q2 as (
    select nq, raw_compact, replace(nq, ' ', '') as compact, string_to_array(nq, ' ') as words from q
  ), scored as (
    select
      p.id, p.available, p.sales_count,
      case
        when p.search_name = q2.nq then 100
        when p.search_name like q2.nq || '%' then 85
        when p.search_name like '% ' || q2.nq || '%' then 75                    -- começa numa palavra
        when length(q2.compact) >= 5 and replace(p.search_name, ' ', '') like '%' || q2.compact || '%' then 65 -- "spiderman"
        when length(q2.compact) between 2 and 8
             and (p.search_acronym like q2.compact || '%' or p.search_acronym_roman like q2.raw_compact || '%') then 60
        when not exists (select 1 from unnest(q2.words) w where p.search_name not like '%' || w || '%') then 50
        else 0
      end as base,
      word_similarity(q2.nq, p.search_name) as ws,
      -- Erro de digitação por palavra: cada palavra digitada (4+ letras) está no nome ou difere
      -- em até 1–2 letras de uma palavra do nome (ou de duas palavras coladas: "spider"+"man")
      not exists (
        select 1 from unnest(q2.words) w
        where p.search_name not like '%' || w || '%'
          and (length(w) < 4 or not exists (
            select 1
            from (
              select a.nw from unnest(string_to_array(p.search_name, ' ')) as a(nw)
              union all
              select x.a || y.b
              from unnest(string_to_array(p.search_name, ' ')) with ordinality as x(a, i)
              join unnest(string_to_array(p.search_name, ' ')) with ordinality as y(b, j) on y.j = x.i + 1
            ) c(nw)
            where left(c.nw, 1) = left(w, 1)
              and abs(length(c.nw) - length(w)) <= 2
              and levenshtein(left(w, 40), left(c.nw, 40)) <= case when length(w) >= 8 then 3 else 2 end
          ))
      ) as typo_ok
    from public.products p, q2
    where p.active and not p.nsfw
      and length(q2.compact) >= 2
      and (p_include_unavailable or p.available)
  ), ranked as (
    select s.*,
           max(s.base) over () >= 50 as has_direct,
           (s.base + 40 * s.ws + case when s.typo_ok and s.base < 50 then 20 else 0 end)::real as score
    from scored s
  )
  select r.id, r.score
  from ranked r, q2
  where r.base >= 50                                                    -- algum critério direto bateu
     or (length(q2.compact) >= 4 and not r.has_direct and (r.ws >= 0.5 or r.typo_ok))  -- só parecidos (erros de digitação)
     or (length(q2.compact) >= 4 and r.ws >= 0.7)                       -- muito parecido (ex.: mesma série)
  order by r.score desc, r.available desc, r.sales_count desc
  limit greatest(1, least(p_limit, 200))
$$;

revoke execute on function public.search_products(text, integer, boolean) from public;
grant execute on function public.search_products(text, integer, boolean) to anon, authenticated, service_role;
