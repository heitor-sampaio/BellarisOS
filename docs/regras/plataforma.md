# Plataforma: suporte, sistema e assinaturas

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### Plataforma e suporte (`/suporte`, 2026-10-03)

A PLATAFORMA é a equipe do BellarisOS que atende as redes que assinam. Tem
portal próprio (`/suporte`), fora dos portais das redes.

- **Quem é da plataforma não é membro de rede**: é um login do Auth com
  `app_metadata.plataforma` (`SUPORTE` | `ADMIN`) e uma linha em
  `platform_staff` — a fonte de verdade. Sem `tenant_id`, nenhuma RLS de rede
  o alcança: o painel lê pelo servidor (service role), conferindo a pessoa em
  cada página e action com `getPlatformContext` (`lib/plataforma/contexto.ts`).
- **Verificação em duas etapas obrigatória** (TOTP do Supabase, `aal2`):
  sem ela, `/suporte/verificacao`. O painel enxerga todas as redes.
- **Os dois lados não se misturam**: o proxy desvia quem tem a marca para o
  `/suporte` e quem não tem para fora dele; `buildContext` recusa a marca
  ANTES do padrão CLIENT (sem `role`, o atendente viraria cliente final); os
  destinos de login (`destinoDaSessao`, `/auth/redirect`, `/api/auth/session`)
  mandam a plataforma para a verificação.
- **Dois portais, dois papéis:** o `/suporte` (o ATENDIMENTO: chamados,
  redes para consulta e diagnóstico, reenviar acesso, reativar membro,
  "entrar como") é de SUPORTE e ADMIN; o `/sistema` (a ADMINISTRAÇÃO do
  negócio: painel, redes, planos, cobrança, equipe da plataforma, auditoria,
  configurações) é só de ADMIN. Quem é ADMIN troca pelo seletor no topo e
  começa no `/sistema` (`inicioDaPlataforma`, `lib/plataforma/destino.ts`); o
  proxy desvia o SUPORTE para fora do `/sistema`, e toda página e action de
  lá pede `getPlatformContext({ papel: 'ADMIN' })`.
- **Tudo o que a plataforma faz vai para `platform_audit_log`**
  (`registrarNaPlataforma`, só acrescenta), inclusive abrir o painel de uma
  rede ou um chamado — e a clínica vê isso. Registro DEPOIS de um efeito que
  já saiu (resposta no chamado) não devolve erro se falhar: a pessoa
  repetiria e o efeito sairia duas vezes — vai para o log.
- **Diagnóstico sem segredo e sem dado de cliente**
  (`lib/plataforma/diagnostico.ts`): das caixas e integrações só o estado
  (lista fechada); dos eventos só nome, entidade, ator e hora (os `dados`
  carregam retrato de cliente, e o painel não depende de autorização).
- **O primeiro admin nasce pela variável `PLATAFORMA_ADMIN_EMAIL`**, sem
  script (`lib/plataforma/primeiro-admin.ts`): quem entra com esse e-mail é
  promovido no login (`loginAction` e `/api/auth/session`, com a sessão
  renovada para o token vir com a marca); sem conta ainda, o "Esqueci minha
  senha" cria o login já marcado. Membro de rede com esse e-mail NÃO é
  promovido, e só e-mail CONFIRMADO é promovido (com a confirmação desligada
  no Auth, um `signUp` direto com o e-mail da variável viraria ADMIN). Os seguintes, o ADMIN cadastra em `/sistema/equipe` (SUPORTE ou
  ADMIN). E-mail de membro de rede é recusado.
- Tabelas da plataforma: RLS ligada e ZERO políticas, como credencial.
- Prova: `e2e/suporte-plataforma.spec.ts` (atendentes `[e2e]` com o TOTP
  calculado no teste, `e2e/apoio/plataforma.ts`), `e2e/sistema-portal.spec.ts`
  e `e2e/plataforma-primeiro-admin.spec.ts` (contra o build).

**Administração do sistema (`/sistema`) e assinaturas (2026-10-03):**
- **A rede BLOQUEADA é uma regra só** (`lib/redes/situacao.ts`, igual a
  `private.rede_bloqueada`): `tenants.is_active = false` (DESLIGADA à mão
  pelo admin — abuso, pedido; a cobrança nunca religa) OU `plan_status` em
  `suspended`/`canceled` (a assinatura, que a cobrança escreve e desfaz).
  - **O portão é `buildContext`**: rede bloqueada → `/conta-suspensa`, para
    página e action da equipe e para o cliente final (a rede dele vem de
    `getCachedRedeDoCliente`). `getCachedRede` tem tag `rede:<id>`: quem muda a
    situação EXPIRA a marca (actions, webhook, cron); sem isso vale até 60 s.
  - `/conta-suspensa` fica fora dos layouts e não chama `getTenantContext`
    (voltaria para ela): lê pelos claims. Quem administra a rede vê a fatura em
    aberto e o "Pagar"; o paciente vê "Portal indisponível".
  - **A RLS também barra**: `jwt_claim` devolve nulo para o token de membro de
    rede bloqueada (o estado da rede é lido uma vez por transação, GUC
    `bellaris.rede`, em `private.rede_estado`) — sem isso o membro seguia
    lendo e gravando pelo PostgREST e pelo Realtime com a chave pública.
  - **Saída para o paciente PAUSA** com a rede bloqueada (`redeEstaBloqueada`):
    automação (o despacho não cria run; o run na fila volta a esperar sem
    gastar tentativa — o "esperar 3 dias" não se perde), campanha e lembrete
    (o cron pula a rede; a agendada NÃO é marcada concluída) e todo push ao
    paciente (`notifyClient`). O que CHEGA (webhook do WhatsApp) continua
    sendo gravado.
- **A rede nasce num caminho só** (`semearRede`, `lib/redes/criar.ts`): o
  cadastro público e o "Nova rede" do `/sistema` (este cria o login do
  responsável e manda o e-mail de definir senha; a unidade fica para o
  `/setup`). Rede não se apaga — cancela.
- **Planos**: catálogo em `platform_plans` (não se apaga, desativa); a rede
  guarda o RETRATO do valor em `tenant_subscriptions.valor_centavos` — é o
  preço especial e o que o catálogo novo não muda. `tenants.plan_name` é a
  cópia do nome para leitura.
- **A situação é recalculada POR ESTADO no banco**
  (`assinatura_aplicar_cobranca`): os eventos do Asaas chegam fora de ordem e
  repetidos, então a função olha as faturas (`subscription_invoices`) — em
  atraso = em aberto com vencimento passado. Só PAGAR (ou o Asaas remover a
  cobrança vencida) tira do atraso; cancelada não volta sozinha.
  - ⚠️ **Fatura PAGA não volta a "em aberto/vencida"** por um evento atrasado
    (estorno e contestação, sim). E a cobrança que chega antes de o app gravar
    o id da assinatura é achada pelo CLIENTE.
  - **"Marcar em dia" e "Estender teste" perdoam o atraso até o dia**
    (`tenants.atraso_perdoado_ate`): sem isso o próximo evento recalculava o
    atraso antigo e o cron suspendia na hora seguinte.
  - O dia do pagamento é o de São Paulo (o banco roda em UTC).
  - Ligar a cobrança tem TRAVA (`tenant_subscriptions.ativando_em`): dois
    cliques não criam duas assinaturas. Estorno e contestação ficam no
    registro (`assinatura.contestacao`); a situação, quem decide é o admin.
- **As regras de tempo** (`assinaturas_aplicar_regras`, cron `assinaturas`):
  teste vencido sem pagamento → em atraso (contado do fim do teste); em
  atraso além de `platform_settings.dias_de_carencia` → suspensa. A condição
  do update é a reivindicação. ⚠️ Teste que a chama passa `p_tenant`.
- **O Asaas** (`lib/asaas/cliente.ts`): cliente procurado pelo
  `externalReference` (o id da rede) antes de criar — o Asaas aceita
  duplicado e não tem chave de idempotência; assinatura MENSAL com
  `billingType: UNDEFINED` (a clínica escolhe Pix, boleto ou cartão); o teste
  fica só no nosso banco (a assinatura vence no fim dele).
- **O webhook** (`/api/webhooks/asaas`) se defende pelo `asaas-access-token`
  (tempo constante; sem token de 32+ caracteres configurado, recusa tudo),
  GRAVA o evento pela chave do Asaas (o repetido bate no 23505), responde 200
  na hora e processa em `after()`; o cron recolhe o que ficou parado.
- **Depois de cada mudança** (`depoisDaMudanca`): expira a marca da rede,
  avisa no sino quem administra a rede (tipo `assinatura`) e registra as
  automáticas em `platform_audit_log` sem pessoa.
- **O lado da clínica**: Configurações → Assinatura (rede + `settings:
  MANAGE`; o "Pagar" some no modo suporte) e o aviso no topo para quem
  administra a rede (teste acabando em 7 dias; em atraso, com a data da
  suspensão e o link da fatura).
- Prova: `e2e/sistema-redes.spec.ts` (criar, editar, desligar, as regras) e
  `e2e/assinaturas-asaas.spec.ts` (contra o build, com o Asaas falso).

**Entrar como (impersonificação autorizada):**
- **Só com AUTORIZAÇÃO vigente da clínica** (`support_grants`: 24 h, 72 h
  ou 7 dias; uma por pessoa). Autoriza o próprio membro (para si) ou quem é da
  rede com `settings: MANAGE` (Configurações → Suporte); "incluir dados
  clínicos" pede prontuário MANAGE de quem autoriza (`lib/suporte/regras.ts`).
- **É uma sessão REAL do Auth do membro** (`lib/suporte/entrar.ts`,
  `POST /api/suporte/entrar`): parte do app e todo o Realtime falam com o banco
  pelo token, então trocar só o contexto do servidor não funcionaria. O token é
  gerado no servidor (`generateLink` + `verifyOtp`) e ligado à sessão de
  suporte (`support_sessions.auth_session_id`, com `not_after` no Auth) antes de
  ir ao navegador. Prazo: 60 min, nunca além da autorização.
- **Quem é o suporte se acha pelo `session_id` do JWT**
  (`lib/suporte/sessao.ts`, cache de 15 s com tag) — não por cookie. O
  `getTenantContext` monta `ctx.suporte`, troca o nome para "Ana (via suporte:
  Heitor)" (é o que fica em TODO registro), rebaixa o prontuário para NONE sem
  autorização clínica e registra cada requisição em `support_access_log`
  (caminho e action, pelo cabeçalho `x-bellaris-caminho` que o proxy escreve).
  Encerrada, revogada ou vencida → `/auth/suporte-fim`.
- **A RLS também sabe:** `jwt_claim` devolve nulo para token de sessão de
  suporte que acabou (o access token restante não alcança mais a rede), e as
  tabelas clínicas (e os anexos clínicos de `client_documents`) têm política
  RESTRICTIVE `suporte_sem_clinico`. Senha, e-mail, telefone (inclusive a
  troca pendente) e fatores do membro não mudam durante a sessão — gatilhos em
  `auth.users`, `auth.mfa_factors` e `auth.identities` (o GoTrue troca senha
  só com o token). `push_tokens` recusa sessão de suporte e
  `user_notifications` recusa a encerrada (políticas restritivas: as
  originais conferem `auth.uid()`, não `jwt_claim`).
  - ⚠️ **O estado da sessão de suporte é lido UMA vez por transação**
    (`private.suporte_estado`, guardado no GUC local `bellaris.suporte`), e
    `jwt_claim` é uma função plpgsql só, que lê esse cache. A primeira versão
    consultava `support_sessions` a cada chamada, por linha, em toda política
    (20 mil linhas: 2,8 s; agora 120 ms; o `auth.jwt()` puro dá 35 ms).
    Mexeu em `jwt_claim`? Meça de novo.
  - `jwt_claim` NÃO é security definer e só toca o schema `private` quando o
    token tem `session_id`: o `anon` (sem acesso a `private`) recebia 42501
    em vez de nada.
- **Autorização revogada ou SUBSTITUÍDA derruba a sessão que corria nela**
  (gatilho `trg_autorizacao_revogada_encerra`): re-autorizar sem dado clínico
  não pode deixar a sessão seguir com o retrato antigo. Quem mexe na
  autorização lê as sessões em curso ANTES (`sessoesEmCurso`) para expirar o
  cache delas (`updateTag(tagDaSessao(…))`). Desativar o atendente também
  derruba a dele, e `sessaoVigente` confere que ele segue na equipe.
- **No modo suporte nada sai para o paciente**: `bloqueioDoSuporte(ctx, …)`
  (`lib/suporte/travas.ts`) nas actions de envio do inbox (texto, template,
  mídia), campanha, pedido de assinatura e link de assinatura (gerar e pela
  conversa). O push ao cliente (`notifyClient`) não sai, e fato gravado na
  sessão não dispara automação (o evento fica, com `suporte_sessao_id`).
  Também não sai, não troca senha e não registra aparelho de push.
  - ⚠️ **A marca "esta requisição é do suporte" vem do TOKEN**
    (`sessaoDeSuporteAtual`, `lib/suporte/requisicao.ts`), não só do `cache`
    do React: o marcador não sobrevive numa server action, e o push do
    cancelamento feito no suporte saiu para o cliente até isso ser provado.
    Dentro de `after()`, comece a pergunta ANTES (`notificadorDoCliente()`).
- **O que fica como permanente, o suporte não faz**: cadastrar membro, mudar
  cargo, abrangência ou a matriz de um cargo (`createTeamMember`,
  `updateTeamMember`, `createRole`, `updateRole`, `saveRolePermissions`) —
  seria acesso fora do prazo da autorização. Nem colher assinatura, marcar
  papel ou dispensar documento: `document_signatures` é evidência imutável, e
  ali o atendente apareceria como o membro.
- **O fim** (`app/auth/suporte-fim/route.ts`, o "Sair" do banner): encerra a
  sessão, apaga a sessão do Auth e devolve o atendente ao painel (ou ao
  chamado de onde ele entrou) com o cookie de volta (`bellaris_suporte_volta`:
  o refresh token dele, AES-GCM com chave derivada da service role). Revogar na
  clínica derruba na próxima tela; o cron `suporte-sessoes` fecha as vencidas.
  É GET (é um link): sem sessão de suporte nem cookie de volta, não faz nada —
  um link de outro site não desloga um membro.
- **Transparência:** a clínica é avisada no sino quando o suporte entra e
  sai, e vê em Configurações → Suporte cada sessão, o que foi aberto e feito
  (acessos + `domain_events.suporte_sessao_id`) e o que a plataforma fez.
- **Hook de token (opcional):** `public.suporte_hook_do_token` pronto e
  testado; ligado no painel do Supabase (Auth → Hooks → Custom Access Token),
  o token passa a carregar `suporte` e o Auth recusa renovar sessão encerrada.
  Nada depende dele.
- Prova: `e2e/suporte-impersonar.spec.ts`, `e2e/suporte-clinico.spec.ts` e
  `e2e/suporte-credenciais.spec.ts` — o token "capturado" dos cookies é usado
  direto no PostgREST e no Auth para provar o bloqueio (`e2e/apoio/suporte.ts`).

**Chamados (o botão "Ajuda" da topbar):**
- A clínica abre o chamado pela Ajuda (`components/shared/ajuda.tsx`,
  `actions/chamados.ts`); o suporte atende em `/suporte/chamados` (a primeira
  aba, com o contador dos abertos; `actions/chamados-suporte.ts`).
- **O contexto vem da sessão**: quem, cargo, unidade e rede pelo servidor; do
  navegador só a tela, a janela e o navegador (`contextoDoNavegador`).
- **O print é PNG/JPEG até 5 MB pelo cabeçalho do arquivo**, no bucket privado
  `suporte-anexos` (o bucket também recusa outro tipo e tamanho), em
  `<rede>/<uuid>.<ext>`; gravação que falhou apaga o arquivo.
- **Autorizar pelo chamado** ("Autorizo o suporte…" ao abrir, ou o botão na
  conversa) cria a autorização de 72 h do PRÓPRIO membro, ligada ao chamado
  (o chamado tem de ser dele). Revogar fica na mesma conversa — quem autoriza
  por ali pode não ter acesso a Configurações.
- **O suporte nunca se autoriza**: "Pedir autorização" é uma mensagem do
  sistema na conversa + sino; quem decide é a clínica.
- **Nota interna** (`interna`) é filtrada NO BANCO para a clínica. Só a
  resposta do suporte atribui o chamado e avisa no sino — com texto genérico
  (o push aparece na tela de bloqueio). O "Ver a resposta" do sino abre a Ajuda
  no chamado (evento `bellaris:ajuda`).
- **O chamado é de quem abriu e de quem administra a rede** (rede + `settings:
  MANAGE`); o colega recebe "não encontrado", também pela action. Cliente final
  e contexto sem membro nunca alcançam.
- **A fila se atualiza pelo SINAL** `support_signals` (uma linha sem dado, só
  a plataforma lê — o padrão de `crm_quadro_sinais`) e por um refresh a cada
  minuto. A rota `/api/suporte/contagem` do plano não existe: seria mais um
  endpoint a defender para dizer o que o refresh já diz.
- Um gatilho garante que o chamado de uma autorização ou sessão é da mesma rede.
- Tabelas: RLS ligada e ZERO políticas. Prova: `e2e/chamados.spec.ts`.

---

## O que nunca fazer aqui

```
❌ Deixar a plataforma (marca app_metadata.plataforma) cair no buildContext como CLIENT, ou abrir /suporte sem getPlatformContext
❌ Entrar na conta de um membro sem autorização vigente (suporte_sessao_abrir) ou entregar o token ao navegador antes de suporte_sessao_ativar
❌ Ação do suporte que fica PERMANENTE (membro, cargo, matriz, assinatura) sem bloqueioDoSuporte
❌ notifyClient dentro de after() sem notificadorDoCliente() (a pergunta "é suporte?" tem de começar na requisição)
❌ Confiar só no marcador de React cache para saber se é sessão de suporte numa action — é sessaoDeSuporteAtual (o token)
❌ Mexer numa autorização de suporte sem ler antes as sessões em curso (sessoesEmCurso) e expirar o cache delas
❌ Mostrar nota interna do chamado à clínica, ou o suporte autorizar acesso por conta própria
❌ Página ou action do /sistema sem getPlatformContext({ papel: 'ADMIN' }) (o SUPORTE é desviado só pela navegação)
❌ Decidir "rede bloqueada" fora de lib/redes/situacao.ts (ou a cobrança religar uma rede DESLIGADA à mão — is_active é só do admin)
❌ Mudar plan_status ou is_active sem expirar a marca rede:<id> (o portão seguiria a situação velha)
❌ Mudar a situação da assinatura evento a evento no TS — é assinatura_aplicar_cobranca, por estado, no banco
❌ Criar rede fora de semearRede (o cadastro público e o /sistema têm de nascer iguais)
❌ Criar cliente ou assinatura no Asaas sem procurar antes pelo externalReference (o Asaas aceita duplicado)
❌ Webhook do Asaas que responde diferente de 200 para o que já gravou (o Asaas repete e, com 15 falhas, pausa a fila)
❌ Mandar automação, campanha ou push ao paciente de uma rede bloqueada (redeEstaBloqueada)
❌ Chamar assinaturas_aplicar_regras em teste sem p_tenant (vale para as redes reais)
```
