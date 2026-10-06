# Variáveis de ambiente e cron

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

## 12. Variáveis de ambiente

```bash
# Banco
DATABASE_URL=postgresql://...
DIRECT_URL=postgresql://...

# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=         # apenas server-side

# Redis
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_REST_TOKEN=

# Cobrança das assinaturas das redes (Asaas, §6 "Administração do sistema")
ASAAS_API_KEY=                     # só no servidor ($aact_hmlg_… no sandbox, $aact_prod_… em produção)
ASAAS_AMBIENTE=sandbox             # sandbox | producao (padrão: sandbox)
ASAAS_WEBHOOK_TOKEN=               # 32+ caracteres; o MESMO do webhook no painel do Asaas

# Plataforma: o primeiro admin (o e-mail vira ADMIN ao entrar; vários por vírgula).
# NUNCA o e-mail de um membro de rede — a marca o tiraria do portal da rede.
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
NEXT_PUBLIC_META_APP_ID=           # o SDK da Meta no navegador (app/layout.tsx)
META_APP_SECRET=                   # troca de código por token + assinatura dos webhooks
META_VERIFY_TOKEN=                 # handshake dos webhooks (/api/webhooks/whatsapp e /meta)
META_ES_CONFIG_ID=                 # config_id do cadastro incorporado (lido no servidor)

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
```

---

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

| Serviço | Ritmo | `CRON_JOBS` |
|---|---|---|
| **Notification Cron** | `0 * * * *` (hora em hora) | vazio = o padrão (`notification-campaigns`, `lgpd-exports`, `meta-capi`, `eventos-expirados`, `estoque-minimo`, `fidelidade`, `documentos-pdf`, `suporte-sessoes`, `assinaturas`) |
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
