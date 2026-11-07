# Variáveis de ambiente e cron

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

## 12. Variáveis de ambiente

```bash
# Banco: NENHUMA conexão direta ao Postgres (2026-10-23). O app só fala com o
# banco por HTTPS (PostgREST, com as chaves abaixo). DATABASE_URL e DIRECT_URL
# eram cópias da senha do Postgres que nada lia — saíram do Railway, e as
# Network Restrictions do Supabase (painel → Database) ficam fechando a porta
# direta. Não as traga de volta.

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # apenas server-side
CREDENCIAIS_CHAVE=                 # SÓ no serviço BellarisOS (a clínica): 32 bytes em base64.
                                   # Cifra os tokens de integração no banco (lib/integracoes/cofre.ts).
                                   # A MESMA no .env.local e no secret `e2e` do GitHub. Perdê-la é
                                   # reconectar toda integração: tem cópia com o Heitor.

# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_REST_TOKEN=

# Os TRÊS apps (2026-10-06) — cada serviço do Railway leva os três endereços.
CLINICA_URL=https://app.bellarisos.com       # a clínica (apps/web)
SISTEMA_URL=https://admin.bellarisos.com     # o sistema (apps/sistema, só ADMIN)
SUPORTE_URL=https://suporte.bellarisos.com   # o suporte (apps/suporte)
INTERNO_SECRET=                    # 32+ caracteres, o MESMO nos três: /api/interno/expirar (lib/interno.ts)
PLATAFORMA_IPS=                    # opcional (sistema e suporte): IPs permitidos, por vírgula; vazio = todos
BELLARIS_APP=web                   # o app da imagem: web | sistema | suporte | site (build arg, ver o Dockerfile)
SITE_URL=https://bellarisos.com    # só no serviço Site (canonical, sitemap, imagem de compartilhamento)

# Cobrança das assinaturas das redes (Asaas) — SÓ no serviço do sistema
ASAAS_API_KEY=                     # só no servidor ($aact_hmlg_… no sandbox, $aact_prod_… em produção)
ASAAS_AMBIENTE=sandbox             # sandbox | producao (padrão: sandbox)
ASAAS_WEBHOOK_TOKEN=               # 32+ caracteres; o MESMO do webhook no painel do Asaas

# Plataforma: o primeiro admin (o e-mail vira ADMIN ao entrar NO SISTEMA; vários
# por vírgula). SÓ no serviço do sistema. NUNCA o e-mail de um membro de rede.
PLATAFORMA_ADMIN_EMAIL=

# WhatsApp não oficial (uazapi). As caixas (uazapi e oficial) moram em
# whatsapp_numbers, uma linha por número — não em env.
UAZAPI_BASE_URL=https://bellarisos.uazapi.com
UAZAPI_ADMIN_TOKEN=
UAZAPI_MAX_INSTANCIAS=0            # 0 = sem teto (toda a instalação)
UAZAPI_MAX_POR_REDE=5              # teto por rede; cada instância é COBRADA
UAZAPI_PROXY_TEMPLATE=             # vazio = proxy gerenciado pela própria uazapi

# Meta — o app do BellarisOS (Tech Provider): login de anúncios/Instagram/
# Messenger, cadastro incorporado do WhatsApp e webhooks (§9.8.0, §9.8.1)
META_APP_ID=                       # o mesmo app_id do link do cadastro incorporado
NEXT_PUBLIC_META_APP_ID=           # o SDK da Meta, só no "Conectar pela Meta" (lido no servidor, configuracoes.tsx)
META_APP_SECRET=                   # troca de código por token + assinatura dos webhooks
META_VERIFY_TOKEN=                 # handshake dos webhooks (/api/webhooks/whatsapp e /meta)
META_ES_CONFIG_ID=                 # config_id do cadastro incorporado (lido no servidor)

# Copilot (a secretária virtual, docs/regras/copilot.md) — SÓ no serviço da clínica.
# Sem a chave, o Copilot não aparece (nem para rede que o tem no plano).
OPENAI_API_KEY=                    # só no servidor
OPENAI_MODEL=gpt-5-mini            # o modelo do chat (function calling + visão)
OPENAI_MODELO_DE_VOZ=gpt-4o-mini-transcribe  # a transcrição dos áudios
# Trocou o modelo? O custo estimado sai da tabela de preços em
# packages/nucleo/src/lib/planos/custo-do-copilot.ts — modelo fora dela fica sem custo.

# Uso do Copilot (a tela do sistema) — SÓ no serviço Sistema. Opcional.
COTACAO_DOLAR=5.50                 # a cotação da ESTIMATIVA em reais; sem ela, 5,50
OPENAI_ADMIN_KEY=                  # a chave de ADMINISTRAÇÃO da OpenAI (só leitura): o custo REAL
                                   # da fatura (Costs API) e o rateio por rede. Sem ela, só a estimativa.
OPENAI_PROJECT_ID=                 # o proj_… do projeto do BellarisOS na OpenAI: a admin key é da
                                   # ORGANIZAÇÃO, e sem isto o custo real soma todos os projetos.

# Cron (as rotas /api/cron/* conferem; ver §14.1)
CRON_SECRET=

# App
NEXT_PUBLIC_APP_URL=https://app.bellarisos.com
# (NEXT_PUBLIC_SCHEDULE_URL existia para o agendamento público, descartado — não é lida por nenhum código)

# Push
NEXT_PUBLIC_VAPID_PUBLIC_KEY=      # Web Push
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=
# FCM (app Android): conta de serviço do Firebase — ver lib/notifications/push.ts

# SÓ TESTE (nunca em produção)
# META_GRAPH_BASE_TESTE=http://127.0.0.1:3199   # Graph falsa do cadastro incorporado (playwright.build.config)
# E2E_IDADE_DA_SOBRA_MIN=60                      # idade mínima de sobra [e2e] que a varredura apaga
# ASAAS_BASE_URL_TESTE=http://127.0.0.1:3198     # o Asaas falso (e2e/apoio/asaas-falso.ts; playwright.build.config)
# COOKIE_DE_SESSAO_SEM_SECURE=1                  # cookie de sessão sem Secure no build em http (playwright.build.config, workflow)
# OPENAI_BASE_URL_TESTE=http://127.0.0.1:3196/v1 # a OpenAI falsa do Copilot (e2e/apoio/openai-falsa.ts; playwright.build.config, workflow)
```

---

## Os serviços no Railway (2026-10-06)

Um Dockerfile só, na raiz (o `railway.toml` o fixa para todos os serviços).
Cada serviço escolhe o app pela variável `BELLARIS_APP` — o Railway a passa
como build arg por estar declarada (`ARG`) no Dockerfile:

| Serviço | `BELLARIS_APP` | Domínio | Além do comum |
|---|---|---|---|
| BellarisOS | `web` (padrão) | app.bellarisos.com | Meta, uazapi, OpenAI (Copilot), `CRON_SECRET` |
| Sistema | `sistema` | admin.bellarisos.com | `ASAAS_*`, `PLATAFORMA_ADMIN_EMAIL` (só aqui), `CRON_SECRET`, `COTACAO_DOLAR`, `OPENAI_ADMIN_KEY` e `OPENAI_PROJECT_ID` (opcionais) |
| Suporte | `suporte` | suporte.bellarisos.com | — |
| Site | `site` | bellarisos.com e www.bellarisos.com | SÓ `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `CLINICA_URL` e `SITE_URL` — nada de service role, VAPID ou segredo (2026-10-17) |
| Notification Cron / Automations Cron | `web` (imagem) | — | `APP_URL`, `SISTEMA_URL`, `CRON_SECRET` |

O COMUM, nos três apps: as chaves do Supabase, `CLINICA_URL`, `SISTEMA_URL`,
`SUPORTE_URL`, `INTERNO_SECRET` (o mesmo valor) e VAPID/FCM (o sino da
clínica também toca a partir do sistema e do suporte). `CRON_SECRET` é o
mesmo valor na clínica, no sistema e nos dois serviços de cron. Os dois
serviços novos sobem SEM domínio `*.up.railway.app`: é um segundo endereço que
ninguém precisa (e pularia um muro na frente do domínio, se um dia houver).
No Supabase (Auth → URL Configuration) entram os dois hosts novos nas
Redirect URLs.

**A imagem é buildada SEM as `NEXT_PUBLIC_*`**: o navegador as recebe do
layout raiz em runtime, de dois jeitos — o `<script>` que põe
`window.__SUPABASE_URL__`/`__SUPABASE_KEY__` e as
`<meta name="bellaris-supabase-url|key">`. Quem lê é
`configDoSupabaseNoNavegador` (`lib/supabase/config-do-navegador`, no
núcleo): janela → `<meta>` → `NEXT_PUBLIC_*`. A `<meta>` é a reserva da
página desenhada pelo NAVEGADOR — o 404 dos portais (o `notFound()` fora de
Suspense, D18) vem na casca de erro do Next (`<html id="__next_error__">`), e
nela o React não executa script de `dangerouslySetInnerHTML`. Até 2026-10-28
o 404 da produção dizia "Algo deu errado" (`supabaseUrl is required`). O
`next dev` e o build local embutem as `NEXT_PUBLIC_*` do `.env.local` e não
mostram a quebra: só a produção. Config nova que o navegador precise ler em
runtime segue o mesmo caminho (as duas formas no layout), nunca só o script.

**O Site** (2026-10-17, `docs/regras/site.md`) é a exceção ao comum: é
página de apresentação, não opera nada, e leva só a chave PÚBLICA (lê os
planos por `planos_do_site()`). As duas chaves do Supabase e o
`CLINICA_URL` são REFERÊNCIA às do serviço Suporte (`${{Suporte.…}}`): trocou
lá, vale aqui. Ele tem o domínio `*.up.railway.app` (é página pública, não há
muro a pular). O `www` redireciona para o domínio sem `www`
no próprio app (`apps/site/proxy.ts`); os dois domínios vão no mesmo serviço.
No DNS do `bellarisos.com` ficam os registros do Resend (MX, SPF, DKIM) — o
apontamento do domínio raiz não os toca, e no domínio raiz o CNAME só vale com
ALIAS/"CNAME flattening".

**Medir lentidão antes de mexer** (A54 da 7ª simulação, 2026-11-05: "10–15 s
por tela, o 1º clique > 60 s" na madrugada): o tempo do SERVIDOR é o
`http-response-time` do serviço BellarisOS no Railway (p50/p99 por faixa) e os
`http` logs com `@totalDuration:>3000`; o do BANCO, o `edge_logs` do Supabase
por minuto (contagem, 5xx, maior `response.origin_time`). Naquela madrugada,
das 05:12 às 09:36Z, o servidor respondeu com p50 de 7–9 ms e p99 de ~0,5 s,
o banco com p95 < 0,4 s e nenhum 5xx, CPU ≤ 0,05 vCPU e 1,3 GB de 8 GB: a
demora era do lado de quem usava (os navegadores dos agentes da simulação, na mesma
máquina), não do código. As únicas respostas > 3 s foram o webhook do WhatsApp
da Meta (500 em ~12 s, "Não consegui buscar a mensagem" — PGRST116, duas linhas
num `.single()` em `lib/inbox/resolve-conversation`), à parte.

**A lentidão do BANCO nas completas (F45, 2026-11-07).** As duas completas de
06–07/11 caíram por paradas do Postgres de produção, de 9 a 52 s
(`edge_logs`: 23:45–00:15 e 01:29–01:58 UTC), com o resto do tempo normal
(p50 ~40 ms). Nas paradas: INSERT simples cancelado pelo `statement_timeout`
(57014, o de 8 s do `authenticator`), o Auth em "context deadline exceeded"
(até a consulta dele ao HaveIBeenPwned esgotou), o Realtime com o
`list_changes` cancelado, o pool dele sem conexão e o slot recriado. Como
medir: `pg_stat_statements` (o tempo total por consulta), `get_advisors` de
performance, `query_logs` (`edge_logs` por minuto, `postgres_logs`,
`realtime_logs`, `auth_logs`). O que se viu:
- **O Realtime é o maior consumidor do banco**: `realtime.list_changes` era
  61% de todo o tempo de execução desde 04/11 (401 mil chamadas, ~5.840 s;
  a mais lenta, 12,7 s). Cada linha mudada de tabela PUBLICADA passa por
  `apply_rls`, uma vez por inscrito. **Tabela que nenhuma tela assina não fica
  na publicação `supabase_realtime`** (saíram `crm_stages`, `cash_registers`,
  `treatment_plan_items` — migration `20261107004501`). Tela nova que assina
  uma tabela a põe na publicação na mesma migration.
- **Toda chave estrangeira de public tem índice** (migration
  `20261107004502`, as 131 que o advisor apontava): apagar o pai conferia cada
  filho por varredura — `e2e_apagar_rede`, `DELETE users` (45 colunas apontam
  para `users`). `role_permissions` sem índice no `tenant_id` somava 47
  milhões de linhas lidas desde 04/11. Chave estrangeira nova nasce com índice.
- Os gatilhos do INSERT em `tenants` (as sementes: cargos, permissões, abas,
  tags, categorias, ficha, motivos, origens — ~90 linhas) levam ~17–46 ms; o
  máximo de 6 s era a parada, não eles.
- **A instância é Micro** (`max_connections` 60, `shared_buffers` 256 MB:
  1 GB e 2 vCPUs compartilhadas), e o Auth tem 10 conexões FIXAS (advisor
  `auth_db_connections_absolute`). Subir de tamanho é decisão de custo do
  Heitor; ver o relatório da F45.

## O CSP da clínica (bloqueia desde 2026-10-22)

Toda página da clínica leva `Content-Security-Policy` (`lib/seguranca/csp.ts`,
posto pelo proxy em `lib/supabase/middleware.ts`): script só com o nonce da
requisição (`strict-dynamic`), e uma lista curta do que vem de fora — o
Supabase (e o `wss` do tempo real), as fontes do Google, os ladrilhos do
ArcGIS, o ViaCEP, a Meta (o SDK do "Conectar pela Meta" e a miniatura do
criativo do anúncio, `*.fbcdn.net`). Ficou de outubro a 22/10 em modo de
aviso; os avisos de duas semanas e um inventário do código fecharam a lista.

- **Só bloqueia no build.** No `next dev` segue `-Report-Only`
  (`cabecalhoDoCsp`): o painel de erros do Next injeta script sem nonce.
  Por isso a quebra só aparece contra o build (a completa, a produção).
- **O navegador relata o que barrou** em `/api/csp-relatorio`, e o log do
  serviço BellarisOS ganha `[csp] <diretiva> barrou <origem> em <página>`.
  Linha nova ali é uma tela que perdeu algo: se for legítimo, liberar na
  política (com o teste em `tests/csp-clinica.test.ts`).
- **Página precisa ser dinâmica.** O nonce entra na renderização; página
  pré-gerada no build sai sem ele e fica sem JavaScript. Hoje só o
  `/_global-error` é estático.
- **O app Android fica fora dela**: o Capacitor busca o HTML sozinho (para
  injetar a ponte nativa) e o entrega ao WebView sem os cabeçalhos.
- Prova: `e2e/csp-clinica.spec.ts` (o cabeçalho que bloqueia no build e
  treze telas abertas sem nenhuma violação).

## 14.1 Jobs agendados (cron)

São **dois serviços** no Railway, com ritmos diferentes, e os dois rodam o
mesmo `node /app/cron.mjs` da mesma imagem. O script chama as rotas
`/api/cron/*` do app com o `CRON_SECRET` e sai com código 1 se alguma falhar —
assim a execução aparece vermelha no painel em vez de falhar em silêncio.
Quando a chamada NÃO chegou ao app — falha de rede, 502/503/504 ou o 404
"Application not found" da borda do Railway —, tenta de novo (15 s, 30 s).
Tempo esgotado não repete: o job pode estar rodando, e rodaria duas vezes.

**O cron de produção roda no MESMO banco do E2E** e passa pelos dados
`[e2e]` como por quaisquer outros. É seguro porque toda fila reivindica a
linha (§9.9) e os testes conferem o estado final, não um intermediário que o
cron possa atravessar. Por isso: rota de cron que "recolhe o que ficou para
trás" recolhe só o que está PARADO há um tempo (`lgpd-exports`: 15 min), não
o recém-criado, que é do `after()` — e teste que precisa de um pendente
"esquecido" o cria com a data no passado.

**Cada job vai ao app DONO dele** (2026-10-06, `baseDoJob` em
`scripts/cron.mjs`): `assinaturas` ao sistema (`SISTEMA_URL`, que tem a chave do
Asaas); o resto à clínica (`APP_URL`) — inclusive `suporte-sessoes`, porque o
cache da sessão de suporte mora no processo da clínica. O serviço de cron leva
as duas variáveis; sem `SISTEMA_URL`, o `assinaturas` é PULADO com aviso (o sistema ainda não está no ar); sem `APP_URL`, falha.

| Serviço | Ritmo | `CRON_JOBS` |
|---|---|---|
| **Notification Cron** | `0 * * * *` (hora em hora) | vazio = o padrão (`notification-campaigns`, `lgpd-exports`, `meta-capi`, `eventos-expirados`, `estoque-minimo`, `fidelidade`, `documentos-pdf`, `suporte-sessoes`, `copilot-retencao` (as conversas do Copilot com mais de 90 dias), `importacoes` (a importação de contatos parada vira interrompida; o relatório de erros some em 7 dias), `crm-lembretes` (o retorno combinado e o ganho a marcar, no sino de quem tem o lead — A42/A45 da 9ª; o retorno do dia a partir das 7h), `assinaturas`) |
| **Automations Cron** | `*/5 * * * *` (5 min) | `automacoes` |

O segundo existe porque **granularidade de uma hora não serve a automação**:
"esperar 30 minutos e mandar" viraria "em até 1h30". E os jobs do primeiro
varrem a base inteira — rodá-los de cinco em cinco minutos seria carga sem
motivo. Por isso a lista de jobs é escolhida por env (`CRON_JOBS`), e não um
script por serviço: o `railway.toml` da raiz fixa o Dockerfile para todos, e
cada ritmo novo faria o Dockerfile crescer.

**Para adicionar um job:** criar `apps/web/app/api/cron/<nome>/route.ts`
(protegida por `CRON_SECRET`) e acrescentar o nome ao `PADRAO` do script — ou
ao `CRON_JOBS` do serviço que deve chamá-lo.

Três detalhes de infraestrutura que não são óbvios e já custaram tempo:

- O serviço usa o **Dockerfile principal**, e `scripts/cron.mjs` é copiado para
  `/app/cron.mjs` no estágio runner. Não adianta criar um Dockerfile próprio: o
  `railway.toml` da raiz fixa `dockerfilePath = "Dockerfile"` e sobrescreve o
  que for configurado no serviço.
- Config-as-code **por serviço** foi depreciada pelo Railway — `railwayConfigFile`
  é recusado. Não há como dar um `railway.<algo>.toml` só para o cron.
- Start command **não é aplicado** a serviço cuja fonte é imagem pública. Com
  uma imagem como `alpine:3`, o container sobe o shell padrão, sai na hora e
  não executa nada, sem log e sem erro. A fonte precisa ser o repositório.

Para validar sem esperar uma hora: trocar o schedule para `*/5 * * * *`, criar
uma pendência real, conferir os logs do deployment e **restaurar `0 * * * *`**.
