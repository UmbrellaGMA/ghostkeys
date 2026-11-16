-- Dados estruturais (NÃO são produtos): configurações e categorias.
-- Produtos são importados pelo admin (Admin › Produtos › Importar jogos) a partir da ShadowKeys.
insert into public.store_settings (id) values (1) on conflict (id) do nothing;

-- supplier_tags: tags retornadas por GET /games/{appId}. A API mistura inglês ("Action")
-- e português de Portugal ("Desporto"), por isso as duas formas estão mapeadas.
insert into public.categories (name, slug, supplier_tags, sort_order) values
  ('Ação',       'acao',       array['Action','Shooter','FPS','Hack and Slash','Fighting','Beat ''em up','Ação','Acção','Tiroteio','Luta','Atirador em primeira pessoa'], 1),
  ('Aventura',   'aventura',   array['Adventure','Open World','Exploration','Story Rich','Aventura','Mundo aberto','Exploração'], 2),
  ('RPG',        'rpg',        array['RPG','Action RPG','JRPG','Souls-like','CRPG','Party-Based RPG','RPG de ação'], 3),
  ('Terror',     'terror',     array['Horror','Survival Horror','Psychological Horror','Terror','Horror de sobrevivência'], 4),
  ('Corrida',    'corrida',    array['Racing','Driving','Automobile Sim','Corrida','Condução'], 5),
  ('Estratégia', 'estrategia', array['Strategy','RTS','Turn-Based Strategy','Grand Strategy','4X','Tower Defense','Estratégia'], 6),
  ('Indie',      'indie',      array['Indie','Independente'], 7),
  ('Simulação',  'simulacao',  array['Simulation','Simulação','Simulador'], 8),
  ('Esportes',   'esportes',   array['Sports','Football','Soccer','Desporto','Esportes','Futebol','Basquetebol'], 9),
  ('Casual',     'casual',     array['Casual','Party Game','Puzzle','Quebra-cabeça'], 10),
  ('Programas',  'programas',  array['Utilities','Utilitários','Software','Audio Production','Produção de áudio','Design & Illustration','Design e ilustração','Video Production','Produção de vídeo','Photo Editing','Edição de fotos','Animation & Modeling','Animação e modelagem'], 11)
on conflict (slug) do update set supplier_tags = excluded.supplier_tags;

-- Para promover um usuário a administrador (após ele se cadastrar):
-- update public.profiles set role = 'admin' where email = 'seu-email@dominio.com';
