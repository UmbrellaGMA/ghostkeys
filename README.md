# GhostKeys — Loja de keys digitais Steam

Loja completa de keys de jogos com catálogo integrado à **ShadowKeys**, pagamentos via **Mercado Pago** (PIX e cartão), banco **Supabase** e **entrega automática** das keys.

Stack: Next.js 15 (App Router) · React 19 · TypeScript · Tailwind CSS 4 · Supabase (Postgres, Auth, Storage) · Mercado Pago (Checkout Transparente + Card Payment Brick) · Resend (e-mail) · Vitest.

---

## 1. Funcionalidades implementadas

**Loja**
- Homepage: banner com destaques reais, jogos em destaque, mais vendidos, ofertas, lançamentos, populares, categorias e vantagens.
- Cabeçalho com busca instantânea (autocomplete com teclado), categorias, conta, carrinho e indicadores de confiança. Rodapé institucional completo.
- Catálogo `/jogos` com filtros (nome, categoria, faixa de preço, promoção, disponibilidade), ordenação, paginação, skeletons e estados vazios. URL amigável `/categoria/rpg`.
- Página do produto `/jogos/[slug]`: capa, banner, descrição, preço/promoção/% de desconto, plataforma, **região de ativação em destaque**, entrega digital, instruções de ativação, relacionados, JSON-LD (SEO).
- Carrinho persistente (localStorage) com preços **sempre revalidados no servidor**; checkout com cupom e aceite de termos.
- Pagamento: PIX (QR Code + copia e cola + contagem regressiva + atualização automática) e cartão via Card Payment Brick (os dados do cartão não passam pelo servidor).
- Área do cliente: cadastro, login, recuperação/redefinição de senha, perfil, histórico de pedidos, pagamentos, linha do tempo e **visualização/cópia das keys**.
- Páginas: sobre, atendimento, FAQ, termos, privacidade (LGPD), reembolso. `robots.txt` e `sitemap.xml`.

**Automação de pedidos**
- Estados: `pending_payment → paid → processing → delivered`, além de `delivery_failed`, `cancelled` e `refunded`.
- Webhook com validação de assinatura → consulta do pagamento **na API do MP** → checagem de pedido, valor, moeda BRL e vínculo do pagamento → transição atômica → entrega.
- Entrega: lock no banco, gera só as keys **faltantes**, salva criptografadas (AES-256-GCM), confirma e envia e-mail.
- Falha temporária do fornecedor: o pedido continua **pago**, com nova tentativa automática (backoff). Falha definitiva: `delivery_failed`, para reprocessar ou reembolsar.
- Cron: re-tentativas, recuperação de entregas travadas, reconsulta de PIX pendentes (webhook perdido) e cancelamento de pedidos expirados.
- Reembolso: estorno no MP, desativação das keys e revogação na ShadowKeys quando a API permite.

**Painel administrativo `/admin`** (independente da loja; papel verificado no banco)
- Dashboard: faturamento, lucro estimado (custo congelado), vendas, pendentes, entregues, falhas, reembolsos, mais vendidos e últimas compras, com seletor de período.
- Produtos: busca/filtros, ativar/desativar, destaque, edição completa, upload de imagens (Storage), preço global ou personalizado, promoção com validade, sincronização ShadowKeys.
- Categorias (com mapeamento de tags do fornecedor) e cupons.
- Pedidos: filtros, detalhes, itens com lucro, pagamentos, keys (só os 4 últimos caracteres), tentativas de entrega, histórico, notas internas, **reprocessar entrega**, **consultar pagamento**, cancelar e reembolsar.
- Clientes: lista, compras, dados da conta e concessão/remoção de acesso administrativo.
- Configurações: dados da loja, margem global (com prévia), produto, pagamento, entrega, e-mails e **estado das integrações com credenciais mascaradas**.
- Logs: chamadas de API (ShadowKeys/MP/e-mail), webhooks e sincronizações.

---

## 2. Integrações

### ShadowKeys — `src/services/shadowkeys/ShadowKeysService.ts`
Implementada **somente** com o que está na documentação oficial (`https://revenda.shadowkeys.com.br/docs`, API v1, `Authorization: Bearer sk_live_...`):

| Uso na loja | Endpoint |
|---|---|
| Catálogo, preços e disponibilidade (sincronização) | `GET /games?page=&search=` (50/página) |
| Tags para categorizar e revalidar preço no checkout | `GET /games/{appId}` |
| Compra/geração da key após pagamento aprovado | `POST /keys/generate` (`importIfMissing: false`) |
| Revogação no reembolso | `POST /keys/{code}/revoke` |
| Consulta de status de key | `GET /keys/{code}` |

- Disponibilidade = jogo presente no catálogo **e** `priceCents != null`. Jogos que saem do catálogo são desativados (configurável), mas só ao fim de uma passada **sem nenhuma página com falha**.
- **Catálogo curado**: o fornecedor tem ~54 mil jogos, mas a loja só tem os jogos que o admin escolhe em **Admin › Produtos › Importar jogos**:
  - colar uma lista (um por linha, nome ou AppID, com preço opcional após `;`, ex.: `Elden Ring; 34,90`);
  - ou buscar no catálogo da ShadowKeys e importar um a um;
  - nomes com mais de um resultado aparecem para você escolher o certo.
- **Capas e textos (Steam)**: a ShadowKeys gera URLs de capa num formato antigo que dá 404 em jogos recentes. Por isso, ao adicionar um jogo, `SteamStoreService` consulta a API pública `store.steampowered.com/api/appdetails` e grava:
  - capa e fundo corretos;
  - descrição curta em português;
  - gêneros em português, usados nas categorias.
  - Uploads feitos pelo admin nunca são substituídos.
  - Botões "Atualizar capas" (todos os jogos) e "Buscar capa e descrição na Steam" (por jogo) no painel.
- O cron (`/api/cron/sync-catalog`, a cada 10 min) e o botão "Atualizar preços e disponibilidade" atualizam **somente os jogos importados**: custo, disponibilidade e categorias, com `GET /games/{appId}`. Nunca adicionam jogos novos.
- Categorias são atribuídas pelas tags do fornecedor. A API mistura inglês ("Action") e português de Portugal ("Desporto"); os dois estão mapeados no `seed.sql`.
- Observado na API real (difere do exemplo da documentação):
  - `releaseDate` vem como `"18 mar. 2021"` ou vazio, e é normalizado em `src/lib/dates.ts`;
  - `priceCents` é **o mesmo (R$ 3,00) para todos os jogos** no plano atual.

### Preços e promoção
- Estratégia padrão **"preço padrão igual para todos"** (`flat`), configurada em R$ 29,90. Cada jogo pode ter preço próprio, definido na importação ou na edição do produto.
- **Leve 3, pague 2** (configurável em Admin › Configurações):
  - a cada 3 jogos no carrinho, o mais barato sai de graça;
  - o desconto é calculado no servidor, aparece no carrinho e no checkout ("adicione mais X jogos") e fica registrado em `orders.combo_discount_cents`;
  - nunca deixa o pedido abaixo do custo;
  - cupons são aplicados sobre o valor já com a promoção.
- A geração de keys **nunca é repetida automaticamente** pelo cliente HTTP. A idempotência é garantida pelo banco, porque a API não documenta cabeçalho de idempotência.
- Os logs registram só IDs e status. O código da key e o token nunca vão para o log.

### Mercado Pago — `src/services/mercadopago/MercadoPagoService.ts`
- `POST /v1/payments` (PIX e cartão) com `X-Idempotency-Key`, `external_reference = id do pedido` e valor **sempre calculado no servidor**.
- `GET /v1/payments/{id}` (webhook, polling no servidor e cron), `POST /v1/payments/{id}/refunds` e `PUT /v1/payments/{id}` (cancelar PIX pendente).
- Webhook `POST /api/webhooks/mercadopago`: validação HMAC de `x-signature` (manifesto `id:…;request-id:…;ts:…;`). Webhooks duplicados não causam efeito duplicado.
- O redirecionamento do navegador nunca confirma pagamento.

### Supabase
Auth (e-mail/senha, confirmação, recuperação), Postgres com RLS, Storage (`product-images`). O Service Role é usado só no servidor (`src/lib/supabase/admin.ts`, protegido por `server-only`).

### E-mail (Resend) — `src/services/email/`
Modelos: boas-vindas, pedido recebido, pagamento aprovado, pagamento recusado, keys entregues (com link para a área segura, **sem a key**), reembolso. Os modelos de confirmação de cadastro e recuperação de senha do Supabase Auth estão em `supabase/templates/`. Sem `RESEND_API_KEY`, os envios são registrados como "skipped" e a loja continua funcionando.

---

## 3. Banco de dados (`supabase/migrations`)

Valores monetários em **centavos** (`integer`).

| Tabela | Função |
|---|---|
| `profiles` | Usuário, nome, e-mail, papel (`customer`/`admin`). Criado por trigger no cadastro |
| `categories` / `product_categories` | Categorias e mapeamento de tags do fornecedor; N:N com produtos |
| `products` | Catálogo: AppID ShadowKeys, custo, preço original/venda/promo, modo de preço, região, disponibilidade, destaque, vendas |
| `store_settings` | Linha única: loja, margem, pagamento, entrega e e-mails (sem segredos) |
| `coupons` | Cupons percentuais/fixos com validade e limite de uso |
| `orders` | Pedido, totais (imutáveis), status, tentativas e último erro de entrega |
| `order_items` | **Snapshot imutável**: nome, AppID, custo e preço no momento da compra |
| `payments` | Transações MP, chave de idempotência, dados do PIX e estornos |
| `digital_keys` | Key **criptografada**, `key_hash` único, `supplier_key_id` único e status |
| `order_events` | Histórico de status e notas |
| `delivery_attempts` | Cada tentativa de entrega (origem, resultado, erro) |
| `webhook_events` | Webhooks recebidos (assinatura válida? processado? resultado) |
| `api_logs` | Chamadas às APIs externas (sem dados sensíveis) |
| `key_access_logs` | Cada visualização de key |
| `sync_runs` | Execuções de sincronização do catálogo |
| `rate_limits` | Rate limit compartilhado entre instâncias |
| view `catalog_products` | Catálogo público com preço efetivo, promoção e categorias (`security_invoker`) |

**Funções seguras:** `transition_order_status` (transição atômica), `claim_order_for_delivery` (lock de entrega), `get_order_keys` (única forma de ler keys: dono ou admin, com registro de acesso), `create_order_with_items`, `check_rate_limit`, `admin_dashboard_stats`.

**RLS e permissões:**
- `digital_keys` não tem nenhuma política e tem privilégios revogados.
- O cliente lê apenas os próprios pedidos e só pode alterar o próprio `full_name`, por permissão de coluna.
- Escrita em pedidos, pagamentos e produtos só pelo servidor.
- Triggers impedem mais keys do que a quantidade comprada e alteração de valores de pedidos.

---

## 4. Variáveis de ambiente (`.env.example`)

| Variável | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente Supabase (público) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Somente servidor** |
| `MERCADOPAGO_ACCESS_TOKEN` | API de pagamentos (use `TEST-...` em desenvolvimento) |
| `MERCADOPAGO_PUBLIC_KEY` | Card Payment Brick (pública) |
| `MERCADOPAGO_WEBHOOK_SECRET` | Validação da assinatura do webhook |
| `SHADOWKEYS_API_URL` | `https://revenda.shadowkeys.com.br/api/v1` |
| `SHADOWKEYS_API_TOKEN` | Token `sk_live_...` |
| `SHADOWKEYS_MODE` | `live` ou `sandbox` (keys fictícias `TEST-`; bloqueado em produção) |
| `APP_URL` | URL pública (usada no webhook, nos e-mails e no SEO) |
| `KEYS_ENCRYPTION_SECRET` | 32 bytes em base64 para AES-256-GCM. **Não perca: sem ela as keys salvas não podem ser lidas** |
| `CRON_SECRET` | Protege `/api/cron/*` |
| `RESEND_API_KEY`, `EMAIL_FROM` | E-mails transacionais |

---

## 5. Configurações pendentes (o que falta para operar)

1. **Credenciais**: preencher todas as variáveis acima.
2. **Primeiro administrador**: cadastre-se na loja e execute no SQL Editor:
   `update public.profiles set role = 'admin' where email = 'seu-email@dominio.com';`
3. **Supabase Auth**:
   - Em Authentication › URL Configuration, defina *Site URL* = `APP_URL` e adicione `APP_URL/auth/callback` e `APP_URL/auth/confirm` aos *Redirect URLs*.
   - Cole os modelos de `supabase/templates/` em Email Templates.
   - Configure um SMTP próprio para produção.
4. **Mercado Pago**:
   - Em Suas integrações › Webhooks, cadastre `APP_URL/api/webhooks/mercadopago` (evento **Pagamentos**) e copie a assinatura secreta.
   - Habilite PIX e cartão na conta.
5. **ShadowKeys**: plano ativo, saldo e token em Painel › Desenvolvedores. Depois, em **Admin › Produtos › Sincronizar ShadowKeys**, importe o catálogo.
6. **Informações que a documentação da ShadowKeys não fornece** (preencha em Admin › Configurações):
   - **Região de ativação**: a API não informa. Defina a região padrão e, se necessário, a região por produto.
   - **Instruções de resgate/ativação**: a documentação não diz como o cliente final resgata a key (ela registra `steamId64` no resgate). Escreva as instruções que a ShadowKeys passar a você.
   - **Saldo e estoque**: não há endpoint documentado. O erro 402 (saldo insuficiente) é tratado e exibido no painel. A disponibilidade vem do catálogo e do preço do plano.
   - **Revogação**: a API só revoga keys **já resgatadas**. Como o saldo é cobrado na ativação, keys de pedidos reembolsados que ainda não foram resgatadas devem ser bloqueadas manualmente no painel ShadowKeys. O sistema registra um alerta no histórico do pedido.
7. **Agendamentos**: `vercel.json` define `process-orders` a cada 5 min e `sync-catalog` a cada 10 min. O `sync-catalog` continua a passada em andamento, inicia uma nova a cada 6 h e categoriza jogos. No plano Hobby da Vercel, crons rodam no máximo 1×/dia. Nesse caso, use um agendador externo (cron-job.org, GitHub Actions ou `pg_cron` + `pg_net` no Supabase) chamando os endpoints com `Authorization: Bearer CRON_SECRET`.
8. **Textos legais**: revise termos, privacidade e reembolso com seu jurídico e preencha razão social e CNPJ.

---

## 6. Executar localmente

```bash
npm install
cp .env.example .env.local          # preencha as variáveis

# Banco (opção A: projeto Supabase na nuvem)
npx supabase link --project-ref <ref>
npx supabase db push                # aplica supabase/migrations
# rode supabase/seed.sql no SQL Editor (categorias + configurações)

# Banco (opção B: local, requer Docker)
npx supabase init && npx supabase start && npx supabase db reset

npm run dev                         # http://localhost:3000
```

**Ambiente de testes (sem dinheiro e sem keys reais):**
- `MERCADOPAGO_ACCESS_TOKEN`/`MERCADOPAGO_PUBLIC_KEY` de **teste** + usuários de teste do MP. Cartão de teste com titular `APRO` = aprovado, `OTHE` = recusado.
- `SHADOWKEYS_MODE=sandbox`: a entrega gera keys fictícias `TEST-…`, marcadas como teste na área do cliente e no painel.
- Em localhost o MP não envia webhooks. A tela do pedido e o cron consultam o pagamento no servidor. Para testar o webhook, use um túnel (ex.: `ngrok http 3000`) e defina `APP_URL` com a URL https.

**Testes:**
```bash
npm test             # 73 testes unitários/fluxo (preços, pedidos, pagamentos, webhook, idempotência, entrega, falhas, reprocessamento, criptografia, ShadowKeys, fluxo sandbox completo)
npm run test:sql     # aplica as migrations num Postgres real (PGlite) e verifica RLS, proteção das keys, permissões e idempotência no banco
npm run typecheck
# Integração com Supabase real (cadastro/login, RLS via API):
SUPABASE_TEST_URL=http://127.0.0.1:54321 SUPABASE_TEST_ANON_KEY=... SUPABASE_TEST_SERVICE_ROLE_KEY=... npm test
```

---

## 7. Publicar em produção (Vercel + Supabase)

1. Crie o projeto Supabase de produção, aplique as migrations (`supabase db push`) e o `seed.sql`.
2. Importe o repositório na Vercel e cadastre todas as variáveis de ambiente. Use credenciais **de produção** do MP, `SHADOWKEYS_MODE=live` e um `KEYS_ENCRYPTION_SECRET` novo, guardado em local seguro.
3. Defina `APP_URL` com o domínio final (https) e configure o domínio na Vercel.
4. Configure o webhook do MP, as URLs do Supabase Auth, o SMTP e os templates (seção 5).
5. Faça o deploy, promova o administrador, sincronize o catálogo e defina região e instruções de ativação.
6. Faça uma compra real de baixo valor para validar o fluxo de ponta a ponta antes de divulgar.

---

## 8. Estrutura

```
src/
  app/(store)/        loja: home, jogos, produto, carrinho, checkout, pedido, conta, auth, páginas
  app/admin/          painel administrativo + server actions (assertAdmin em todas)
  app/api/            search, cart/validate, orders (criar/pagar/status/keys), webhooks, cron
  components/         layout, product, home, catalog, cart, account, admin, ui
  hooks/              useCart, useValidatedCart, useDebounce
  lib/                env, supabase (client/server/admin/middleware), crypto, money, rate-limit, auth, api
  services/           ShadowKeysService, MercadoPagoService, SupabaseService (repositório), OrderService,
                      DeliveryService, EmailService, PricingService, CatalogSyncService, CatalogService, container
  validations/        schemas Zod
  types/              tipos de domínio
  middleware.ts       sessão + proteção de rotas
supabase/             migrations, seed, templates de e-mail do Auth
tests/                unitários, fluxo sandbox, integração Supabase
scripts/              validate-sql.mjs (validação das migrations em Postgres/PGlite)
```
