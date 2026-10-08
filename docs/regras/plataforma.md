# Plataforma: suporte, sistema e assinaturas

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### Plataforma e suporte (2026-10-03; em apps e hosts próprios desde 2026-10-06)

A PLATAFORMA é a equipe do BellarisOS que atende as redes que assinam. Desde
2026-10-06 ela mora em DOIS APPS, cada um no seu serviço e no seu host — nada
dela fica no app da clínica:

| App | Host | Quem entra | O que tem |
|---|---|---|---|
| `apps/sistema` | `admin.bellarisos.com` (`SISTEMA_URL`) | ADMIN (administra) e GERENTE (só vê) | painel, redes, planos, cobrança/Asaas, equipe, auditoria, configurações, webhook do Asaas, cron `assinaturas`, primeiro admin |
| `apps/suporte` | `suporte.bellarisos.com` (`SUPORTE_URL`) | SUPORTE e ADMIN | chamados, redes (consulta e diagnóstico), reenviar acesso, reativar membro, a abertura do "entrar como" |

Por que dois hosts: a clínica desenha conteúdo de fora (WhatsApp, editor de
documentos), e um script injetado ali alcançava a sessão de quem é da
plataforma na mesma origem. Origem separada = cookie separado (host-only) e
um muro que não depende de cada trava do código.

- **Quem é da plataforma não é membro de rede**: é um login do Auth com
  `app_metadata.plataforma` (`SUPORTE` | `ADMIN` | `GERENTE`) e uma linha em
  `platform_staff` — a fonte de verdade. Sem `tenant_id`, nenhuma RLS de rede
  o alcança: o painel lê pelo servidor (service role), conferindo a pessoa em
  cada página e action com `getPlatformContext`
  (`packages/nucleo/src/lib/plataforma/contexto.ts`).
- **O que cada papel alcança** é `papelAlcanca` (`lib/plataforma/destino.ts`,
  2026-10-07): `administrar` (gravar no sistema) só o ADMIN; `ver-sistema`
  (abrir as telas do sistema) o ADMIN e o GERENTE; `atender` (o suporte) o
  SUPORTE e o ADMIN. No código: toda ACTION do sistema pede
  `getPlatformContext({ papel: 'ADMIN' })`; toda PÁGINA do sistema,
  `{ verSistema: true }` (menos `/redes/nova`, que só serve para criar); o
  suporte usa o padrão, que é o atendimento — o padrão NEGA o Gerente, e papel
  novo não alcança nada até entrar em `papelAlcanca`.
- **O GERENTE** (pedido do Heitor, 2026-10-07) vê o sistema inteiro e não
  edita nada: as telas trazem as partes editáveis num
  `<fieldset className="sistema-leitura" disabled={!ctx.podeEditar}>` (o
  navegador trava todo controle de dentro; `display: contents` tira a caixa do
  layout), sem "Nova rede" nem o link para o suporte, com o aviso "Só para
  ver" no topo. Não entra no suporte, e o banco recusa abrir sessão de suporte
  para ele (`suporte_sessao_abrir`). Prova: `e2e/plataforma-gerente.spec.ts`.
- **A porta de cada host é o proxy** (`proxyDaPlataforma`, núcleo): nega por
  padrão; sem sessão, só o acesso e as rotas públicas do host (health, e no
  sistema o webhook e o cron; `/api/interno/expirar` nos dois); sessão de quem
  não é do host (membro, cliente, SUPORTE no sistema) é DESFEITA ali mesmo e
  volta ao login. A regra é uma só: `aceitaNoHost`/`recusaDoHost`
  (`lib/plataforma/destino.ts`). O login de cada app recusa pelo mesmo
  motivo (`entrarNaPlataforma`, `lib/plataforma/acesso.ts`).
- **A clínica recusa a marca da plataforma**: o proxy dela desfaz a sessão e
  manda a `/login?acesso=plataforma` ("a equipe da plataforma entra por…"); o
  `buildContext` (ANTES do padrão CLIENT — sem `role`, o atendente viraria
  cliente final), o `loginAction`, `/auth/redirect`, `/conta-suspensa` e
  `/api/auth/session` recusam também.
- **Verificação em duas etapas (TOTP do Supabase, `aal2`) é OPÇÃO do admin
  do sistema** (decisão do Heitor, 2026-10-06 — era obrigatória desde
  2026-10-03): `platform_settings.exigir_verificacao`, em Configurações do
  sistema, nasce DESLIGADA. A regra é uma só (`verificacaoPendente`,
  `lib/plataforma/verificacao-exigida.ts`), usada pelo `getPlatformContext` e
  pelos layouts:
  - já verificada → entra; a plataforma exige → `/verificacao`;
  - não exige, mas a pessoa TEM autenticador → `/verificacao` (o cadastro
    não pode deixar de valer);
  - não exige e sem autenticador → entra só com a senha. `/verificacao`
    continua aberta para quem quiser cadastrar ("Agora não" volta ao painel).
  - A opção é lida a cada requisição, sem cache (o sistema e o suporte a veem
    na hora); erro ao ler conta como EXIGE. Mudar fica em
    `platform_audit_log` (`plataforma.configurada`).
  - Vale em CADA host: quem é ADMIN entra nos dois, com uma sessão (e, com
    autenticador, um código) em cada. Não há atalho de um host para o outro
    (o seletor saiu em 2026-10-06, a pedido do Heitor): cada um se abre pelo
    seu endereço.
- **URL entre hosts vem do ambiente** (`urlDoHost`, `urlDaClinica`), nunca do
  pedido. O e-mail de "definir senha" volta pela clínica para membro de rede e
  pelo host do papel para atendente (`linkDeDefinirSenha`).
- **Cache que um app muda e outro guarda** (`expirarEm`/`expirarNaClinica`,
  `lib/plataforma/expirar-na-clinica.ts`): a situação da rede (`rede:`), a
  sessão de suporte (`suporte-sessao:`) e o membro (`user:`) moram na CLÍNICA;
  a pessoa da plataforma (`plataforma:`) também no SUPORTE. Quem muda chama
  `/api/interno/expirar` do dono, com `INTERNO_SECRET` (32+, tempo constante)
  e a lista fechada de `lib/interno.ts`. Acessório: o TTL e a RLS seguem
  valendo se o aviso falhar.
- **CSP estrita com nonce nos dois hosts** (`politicaDeConteudo`,
  `lib/plataforma/porta.ts`): script só com o nonce da requisição; sem
  moldura; `form-action` só para o próprio host (e a clínica, no suporte).
  Lista de IPs opcional (`PLATAFORMA_IPS`, pelo `X-Real-IP`).
- **Tudo o que a plataforma faz vai para `platform_audit_log`**
  (`registrarNaPlataforma`, só acrescenta), inclusive abrir o painel de uma
  rede ou um chamado — e a clínica vê isso. Registro DEPOIS de um efeito que
  já saiu (resposta no chamado) não devolve erro se falhar: a pessoa
  repetiria e o efeito sairia duas vezes — vai para o log.
- **Fato que a plataforma grava na corrente da clínica não dispara
  automação** (`gravarEvento`, `lib/events/gravar.ts`, sem despacho): é o
  princípio do modo suporte. Hoje: `membro.reativado` pelo suporte.
- **Diagnóstico sem segredo e sem dado de cliente**
  (`apps/suporte/lib/plataforma/diagnostico.ts`): das caixas e integrações só
  o estado (lista fechada); dos eventos só nome, entidade, ator e hora.
- **O primeiro admin nasce pela variável `PLATAFORMA_ADMIN_EMAIL`** — SÓ no
  sistema (`apps/sistema/lib/plataforma/primeiro-admin.ts`): quem entra com
  esse e-mail no login do sistema é promovido (sessão renovada para o token
  vir com a marca); sem conta ainda, o "Esqueci minha senha" do sistema cria o
  login já marcado. A clínica não promove ninguém. Membro de rede com esse
  e-mail NÃO é promovido, e só e-mail CONFIRMADO é promovido. Os seguintes, o
  ADMIN cadastra em Equipe (SUPORTE ou ADMIN). E-mail de membro de rede é
  recusado.
  - **Ninguém digita senha no cadastro**: o login nasce sem senha e o
    CONVITE (o e-mail de "definir senha", `enviarConvite` em
    `apps/sistema/lib/equipe/convite.ts`) leva ao host do papel. O resultado
    do envio é conferido: e-mail que não saiu vira AVISO na tela (o cadastro
    fica), e o "Reenviar convite" da linha manda de novo (só ADMIN, só
    ativo, `equipe.convite_reenviado` na auditoria). As pessoas `[e2e]` só
    aparecem na Equipe com `?teste=1`.
- Tabelas da plataforma: RLS ligada e ZERO políticas, como credencial.
- Prova: `e2e/plataforma-hosts.spec.ts` (os três hosts, a CSP), 
  `e2e/suporte-plataforma.spec.ts`, `e2e/sistema-portal.spec.ts` e
  `e2e/plataforma-primeiro-admin.spec.ts` — todos contra o build, com os três
  servidores (`docs/regras/e2e.md`).

**Administração do sistema (`apps/sistema`) e assinaturas (2026-10-03):**
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
- **O plano define o que a rede USA** (2026-10-06, decisão do Heitor): as
  funcionalidades (liga/desliga) e os limites (unidades, membros, números de
  WhatsApp; 1 a 10 ou ilimitado). O catálogo é FECHADO em
  `packages/nucleo/src/lib/planos/recursos.ts`; o plano guarda
  `platform_plans.recursos`, e a rede, o RETRATO
  (`tenant_subscriptions.recursos`).
  - **Sem plano, sem retrato = tudo liberado** (nenhuma rede antiga tinha
    plano). O gatilho `trg_retrato_sem_plano` zera o retrato quando o
    `plan_id` vira nulo.
  - O retrato só muda quando o PLANO da rede muda (trocar só o valor não traz
    a versão nova) ou no "Aplicar a versão atual do plano"
    (`aplicarPlanoAtual`). Mudar o plano da rede expira `rede:<id>` aqui e na
    clínica — o retrato vem no `getCachedRede`.
  - **Onde vale, na clínica:**
    - funcionalidade que é um MÓDULO inteiro: `buildContext` derruba o módulo
      para NONE (`modulosForaDoPlano`) — inclusive para o dono da rede; somem
      também as abas de Relatórios dela (`abasForaDoPlano`) e o módulo da tela
      de Cargos;
    - o que é PARTE de um módulo (pacotes, pré-pago, planos de tratamento,
      inbox, oportunidades, templates, campanhas, anúncios, comissões, e desde
      2026-10-07 o planejador de injetáveis e a personalização de fichas):
      `assertRecurso(ctx, …)` na página e na action que cria ou altera; o
      item do menu, a aba de Configurações e a página da busca declaram o
      `recurso` e somem;
    - o portal do cliente: o paciente vai para "Portal indisponível";
    - o que roda sem tela confere `redeTemRecurso` (automações, campanhas,
      push ao paciente, API de Conversões, responsáveis por módulo); no banco,
      `private.rede_tem_recurso` (o ponto de fidelidade, os bônus e a emissão
      de documentos e o pendente, que sem o módulo não trava atendimento nem
      checkout — ninguém conseguiria assinar nem dispensar);
    - dentro do inbox, o painel da conversa esconde as oportunidades sem
      `oportunidades` e o "Agendar" sem `agenda` (`comOportunidades`,
      `comAgenda` no cartão); a busca tira conversa, oportunidade e pacote
      pelo plano (`RECURSO_DO_TIPO`); a sessão de atendimento não oferece
      montar plano sem `planos_de_tratamento`; sem `injetaveis`, o construtor
      de fichas não oferece o campo do planejador e o campo das fichas que já o
      têm fica só para ver; sem `fichas`, a aba Fichas some e criar/editar
      ficha é recusado — as fichas que existem seguem no atendimento.
  - **Os limites** (`lib/planos/limites.ts`: `conferirLimite`, que conta os
    ATIVOS): criar e REATIVAR unidade (`createBranch`, `toggleBranchStatus`),
    membro (`createTeamMember`, `reactivateTeamMember`, o reativar do
    suporte) e número de WhatsApp (o formulário, a uazapi, o cadastro
    incorporado). A action de formulário devolve `{ error }` com o limite; a
    que é chamada por formulário que não lê o retorno lança `limiteDoPlano`
    (digest `BELLARIS_LIMITE_DO_PLANO`, em `limite-digest.ts`, que a tela de
    erro e `erroParaTela` reconhecem). O que já existe acima do limite não é
    apagado — só não cresce. EDITAR o que existe não confere limite.
    - **O banco é a segunda linha** (`private.limite_do_plano`, gatilho
      `trg_limite_do_plano` em `branches`, `users` e `whatsapp_numbers`):
      toda linha que FICA ativa (insert ativo, ou inativa → ativa) trava a
      rede com `pg_advisory_xact_lock`, conta os ativos e recusa com P0001 e
      hint `BELLARIS_LIMITE_DO_PLANO`. Cobre a linha que nasce inativa e é
      ligada depois (uazapi, cadastro incorporado) e dois cliques ao mesmo
      tempo.
    - **O dono da rede conta em membros** — é um membro ativo como os outros.
  - A clínica vê o plano em Configurações → Assinatura (`PlanoDaRede`): cada
    funcionalidade dentro ou fora, e o uso de cada limite ("2 de 3").
  - Templates continuam utilizáveis pelo inbox mesmo com `templates` fora:
    a funcionalidade é a TELA de criar e editar modelos; a resposta de 24 h
    da Cloud API precisa do modelo aprovado que já existe.
  - O que só LÊ não trava (a ficha do cliente lê pacotes e planos que já
    existem), e o que JÁ foi vendido continua valendo (agendar a sessão de um
    pacote vendido). A comissão continua sendo calculada no banco; trava a
    tela, a configuração e o fechamento.
  - ⚠️ **Chave nova no catálogo exige migration NOVA**: retratos e planos
    antigos não a têm, e `lerRecursos` a trata como fora (falha fechada). A
    migration decide, com `jsonb_set`, se ela entra nos planos e retratos
    existentes. A trava `tests/planos-recursos.test.ts` ("a migration") compara
    o catálogo com a lista da migration 20261006000003 — quando o catálogo
    crescer, ela passa a comparar com a lista mais a da migration nova.
  - ⚠️ **A trava do plano é do APP** (menos os limites, que o gatilho também
    garante), como a de módulo sempre foi: a RLS não conhece o plano, e um membro que fale direto com o PostgREST pela chave
    pública alcança as tabelas que a rede dele alcança.
  - Prova: `e2e/planos-recursos.spec.ts` e `tests/planos-recursos.test.ts`.
- **O comparativo dos planos** (2026-10-07): no topo da tela de Planos do
  sistema, tudo o que cada plano inclui, lado a lado — preço, funcionalidades
  por grupo, limites e adicionais à venda. A montagem é pura
  (`comparativoDosPlanos`, `apps/sistema/lib/planos/comparativo.ts`) e sai do
  catálogo: item novo em `recursos.ts` aparece sozinho. Só lê (o Gerente vê).
  No celular é `cards-mobile` (um bloco por linha, o plano no `data-label`),
  sem rolagem lateral; no computador, os nomes dos planos ficam presos no topo
  (o card usa `overflow: clip`, não `hidden`, para o `sticky` funcionar).
  Prova: `e2e/planos-comparativo.spec.ts` e `apps/sistema/tests/comparativo.test.ts`.
- **Os ADICIONAIS do plano** (2026-10-07, decisão do Heitor): conexões de
  WhatsApp além do limite e o Copilot avulso, SOMADOS à mensalidade — uma
  assinatura só no Asaas, com o total.
  - **O plano oferece** (`recursos.adicionais`, `{ whatsapp: { valor_centavos },
    copilot: { valor_centavos } }`), no editor do plano ("Adicionais à
    venda"). Ausente = não oferece. A oferta vale pelo plano do CATÁLOGO (não
    pelo retrato): oferecer depois num plano vale para quem já o assina.
    WhatsApp extra só em plano COM limite de
    números; Copilot avulso só em plano que NÃO o inclui
    (`adicionalCabeNoPlano`). O catálogo é `ADICIONAIS` em
    `lib/planos/recursos.ts`; o contratado, `lib/planos/adicionais.ts`.
  - **A rede contrata** (`tenant_subscriptions.adicionais`,
    `{ chave: { quantidade, valor_centavos } }`) pelos DOIS lados: o sistema
    (tela da rede, `definirAdicional`, pode dar preço especial) e a clínica
    (Configurações → Assinatura, `contratarAdicional`, sempre o preço do
    plano). A ÚNICA porta de escrita é `assinatura_adicional_definir` (banco,
    só service role): confere se cabe no plano, a quantidade (WhatsApp 0–10,
    Copilot 0–1) e, ao tirar conexão, se os números ativos cabem — sob a
    mesma trava do gatilho do limite.
  - **O preço é RETRATADO** ao contratar: aumentar a quantidade mantém o
    contratado; mudar o preço no catálogo vale para quem contratar depois.
  - **Preço especial** (o sistema deu um preço diferente da oferta: cortesia,
    desconto) fica marcado (`especial: true`): a clínica cancela, mas não
    aumenta a quantidade dele — senão uma conexão de cortesia virava dez de
    graça. Com a cobrança ligada, nenhum adicional deixa a mensalidade em
    R$ 0 (o Asaas não cobra zero; encerrar é com o BellarisOS).
  - **Na clínica contrata quem é da rede** (sem unidade fixa) com
    configurações MANAGE; a sessão de suporte não contrata
    (`bloqueioDoSuporte`). Rede cancelada não contrata. Cada mudança vai à
    auditoria da plataforma (`assinatura.adicional`, com a origem).
  - **O que a rede usa é o EFETIVO** (`recursosEfetivos`): o limite de
    WhatsApp do retrato + as conexões extras, e o Copilot contratado entra nas
    funcionalidades. `getCachedRede` já devolve o efetivo (é o que o
    `buildContext`, `conferirLimite` e a aba Assinatura leem); no banco,
    `limite_do_plano` soma o extra e `rede_tem_recurso` conta o avulso.
  - **Trocar de plano** (ou aplicar a versão nova) tira o adicional que o
    plano novo já inclui; o resto fica, com o preço contratado. Sem plano (ou
    sem retrato), saem todos. Quem tira é o gatilho `trg_retrato_sem_plano`,
    no MESMO comando que muda o plano — o app não regrava a lista (um
    adicional contratado pela clínica no meio sumiria).
  - **A mensalidade** é `valor_total_centavos` — cada item (o plano e os
    adicionais) já com a cortesia ou o desconto dele, mantida pelo gatilho
    `trg_total_da_assinatura` (deixou de ser coluna gerada em 2026-10-07) —
    `AssinaturaLida.totalCentavos`. `valor_centavos` é só a
    base (o plano ou o preço especial). O Asaas recebe o total ao ligar a
    cobrança e em cada mudança (`levarValorAoAsaas`, com
    `updatePendingPayments`: a fatura em aberto também muda), e
    `valor_no_asaas_centavos` anota o que foi levado — só se o total ainda for
    aquele: duas levadas ao mesmo tempo chegam fora de ordem, então, depois de
    levar, relê e leva de novo se o total mudou.
  - **A clínica não fala com o Asaas**: grava pela função do banco e pede ao
    sistema (`pedirAoSistemaLevarValor` → `POST /api/interno/levar-valor`,
    `INTERNO_SECRET`; só o id da rede vai no pedido, o valor sai do banco).
    Falhou: a clínica é avisada ("chega à cobrança em até uma hora"), e o
    cron `assinaturas` do sistema leva o que ficou pendente
    (`levarValoresPendentes` / `pendentesNoAsaas`: total ≠ valor no Asaas).
  - ⚠️ **Adicional novo exige migration**: o gatilho do total, a função de
    escrita e o rótulo do banco conhecem as chaves pelo nome.
  - Prova: `e2e/planos-adicionais.spec.ts`, o bloco "os adicionais levam o
    total ao Asaas" de `e2e/assinaturas-asaas.spec.ts` e
    `tests/planos-adicionais.test.ts`.
- **Cortesia e desconto** (2026-10-07, decisões do Heitor), na tela da rede do
  sistema ("Cortesia e desconto"): por ITEM — o plano, as conexões de
  WhatsApp, o Copilot avulso —, desconto em percentual (1 a 100) ou em reais,
  ou cortesia (de graça), com data de fim opcional (vale o dia inteiro).
  - Mora em `tenant_subscriptions.condicoes`; a conta é
    `lib/planos/condicoes.ts` e, no banco, `private.valor_com_condicao` — o
    E2E compara as duas caso a caso. A escrita é
    `assinatura_condicao_definir` (service role), pela action
    `definirCondicao` (ADMIN), que leva o total ao Asaas e registra
    (`assinatura.condicao`).
  - **Rede de cortesia = TEM PLANO e NADA A PAGAR**, seja por cortesia, por
    100% de desconto, por desconto do tamanho do preço ou por preço zero
    (verificação de 2026-10-07). O gatilho `trg_cortesia_pela_mensalidade`
    (depois de gravar, venha a mudança de onde vier) a põe "active", perdoa o
    atraso (`atraso_perdoado_ate`) e, sem cobrança ligada, marca a cobrança
    `cortesia`. Com cobrança ligada, `levarValorAoAsaas` PAUSA: tira a
    assinatura do Asaas e marca `cortesia` — sem `cancelada_em` (não é
    cancelamento, não entra em "canceladas no mês"). `assinaturas_aplicar_regras`
    não move rede com plano e total zero.
  - **Voltou a ter valor** (a cortesia acabou, a clínica contratou algo pago,
    o plano mudou): `levarValorAoAsaas` RELIGA a cobrança sozinha
    (`religarDepoisDaCortesia`, primeiro vencimento em 3 dias). Não deu (sem
    CPF/CNPJ, o Asaas recusou): a cobrança vira "sem cobrança" (o painel conta),
    fica registrado (`assinatura.cortesia_sem_cobranca`) e o erro sobe a quem
    pediu.
  - **O mínimo do Asaas (R$ 5,00)**: a mensalidade é zero ou pelo menos isso —
    o gatilho do total recusa o meio, em qualquer caminho (o Asaas recusaria e
    seguiria cobrando o valor antigo). Boleto pode exigir mais (R$ 10,00).
  - **Trocar de plano** tira a condição do PLANO (cortesia no Básico não deixa
    o Pro de graça); as dos adicionais ficam.
  - **O fim**: no dia seguinte, o cron `assinaturas` tira a condição
    (`assinaturas_encerrar_condicoes_vencidas`, registrado como
    `assinatura.condicao_vencida`) ANTES de levar os valores pendentes — o
    Asaas recebe o preço normal na mesma passagem.
  - Item com condição é condição especial: a clínica cancela, não aumenta. Tirar
    o adicional tira a condição dele; sem plano, nenhuma.
  - A clínica vê cada condição na aba Assinatura ("Condições do BellarisOS"),
    com o preço cheio riscado e o que fica.
  - Prova: `e2e/planos-condicoes.spec.ts`, o fim do bloco dos adicionais em
    `e2e/assinaturas-asaas.spec.ts` e `tests/planos-condicoes.test.ts`.
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
- **É uma sessão REAL do Auth do membro**: parte do app e todo o Realtime
  falam com o banco pelo token, então trocar só o contexto do servidor não
  funcionaria. Prazo: 60 min, nunca além da autorização.
- **Entre ORIGENS, por um código de uso único** (2026-10-06;
  `lib/suporte/entrar.ts` no núcleo, migration `20261006000001`):
  1. no PAINEL (`apps/suporte`, `POST /api/entrar`, o form abre em aba nova),
     só com o `Origin` do próprio painel (os hosts são o mesmo SITE: o cookie
     lax do atendente iria junto num POST que partisse da clínica):
     `abrirSessaoDeSuporte` abre a sessão (`suporte_sessao_abrir`: autorização,
     motivo, uma por atendente e por conta) e cria o código (32 bytes, 60 s; só o
     SHA-256 vai a `support_entry_codes`, RLS sem política). A resposta é uma
     página com CSP própria que POSTA o código à clínica — no corpo, fora da URL;
  2. na CLÍNICA (`POST /auth/suporte-entrada`, rota de auth no proxy): só com
     `Origin` do host do suporte; `ativarSessaoDeSuporte` consome o código
     (`suporte_entrada_consumir`, uma vez, atômico) e só então gera a sessão do
     membro (`generateLink` + `verifyOtp`, ligada por `suporte_sessao_ativar`
     com `not_after`), grava os cookies httpOnly DELE neste host e avisa a
     clínica no sino.
  - A sessão do atendente NUNCA vai para a clínica: não existe mais o cookie
    de volta. Código não usado deixa a sessão "abrindo", que fecha em 2 min.
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
- **O fim** (`app/auth/suporte-fim/route.ts` da clínica, o "Sair" do banner): encerra a
  sessão, apaga a sessão do Auth e os cookies do membro NESTE host, e leva ao
  painel no host do SUPORTE (`SUPORTE_URL` + o chamado ou a rede) — onde o
  atendente segue logado na sessão dele, que nunca saiu de lá. Revogar na
  clínica derruba na próxima tela; o cron `suporte-sessoes` (na clínica, onde
  mora o cache da sessão) fecha as vencidas. É GET (é um link): sem sessão de
  suporte, não faz nada — um link de outro site não desloga um membro.
  - ⚠️ **O pedido INTERNO do Next (RSC de um clique no menu, prefetch) não
    roda o fim** (`pedidoInternoDoNext`): responde 200 sem RSC, e o Next faz a
    navegação inteira até a rota — é ELA que encerra. Rodando no pedido RSC, o
    fim apagava os cookies, o Next refazia como navegação inteira já sem
    sessão, e o atendente caía no /login da clínica (a completa de
    2026-10-08 pegou pelo trace; o `goto` do teste antigo não passava por aí).
    Vale para toda rota com efeito chamada por `redirect()` de uma página.
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
  `actions/chamados.ts`); o suporte atende em Chamados, no app do suporte (a primeira
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
  minuto. O Realtime do painel pega o access token no `/api/auth/token` DO
  SUPORTE (`rotaDoToken`, no núcleo, a mesma da clínica). A rota `/api/suporte/contagem` do plano não existe: seria mais um
  endpoint a defender para dizer o que o refresh já diz.
- Um gatilho garante que o chamado de uma autorização ou sessão é da mesma rede.
- Tabelas: RLS ligada e ZERO políticas. Prova: `e2e/chamados.spec.ts`.

---

## O que nunca fazer aqui

```
❌ Route handler com efeito (encerrar, deslogar, gravar) que roda no pedido RSC/prefetch do Next — responda 200 sem RSC e deixe a navegação inteira agir (pedidoInternoDoNext)
❌ Tela ou action de funcionalidade que é PARTE de um módulo (pacotes, inbox, campanhas…) sem assertRecurso, ou rotina sem tela sem redeTemRecurso
❌ Acrescentar chave ao catálogo de lib/planos/recursos.ts sem migration nova decidindo os planos e retratos que já existem
❌ Gravar retrato (tenant_subscriptions.recursos) fora de definirAssinatura/criarRede/aplicarPlanoAtual
❌ Gravar tenant_subscriptions.adicionais fora de assinatura_adicional_definir — nem na troca de plano (quem tira o que não cabe é o gatilho trg_retrato_sem_plano)
❌ Deixar a clínica (p_valor_centavos null) aumentar adicional com preço especial
❌ Ler valor_centavos como a mensalidade — é a base; o que se cobra é valor_total_centavos (plano + adicionais, com cortesia e desconto)
❌ Calcular desconto ou cortesia fora de lib/planos/condicoes.ts / private.valor_com_condicao (as duas contas têm de bater)
❌ Gravar tenant_subscriptions.condicoes fora de assinatura_condicao_definir (o vencimento é assinaturas_encerrar_condicoes_vencidas)
❌ Levar valor ao Asaas pela clínica (ela não tem a chave) — é o sistema, por /api/interno/levar-valor ou pelo cron
❌ Decidir limite ou funcionalidade pelo retrato cru quando há adicional — é o efetivo (recursosEfetivos, getCachedRede)
❌ Decidir se a verificação em duas etapas é pedida fora de verificacaoPendente (ou cachear a opção: o outro host não a veria mudar)
❌ Mandar e-mail pelo Auth (convite, reenviar acesso) e descartar o { error } — a tela diria "enviado" com o e-mail parado no SMTP
❌ Deixar a marca da plataforma passar na clínica (proxy, buildContext, login), ou página/action do sistema ou do suporte sem getPlatformContext
❌ Entrar na conta de um membro sem autorização vigente (suporte_sessao_abrir) ou entregar o token ao navegador antes de suporte_sessao_ativar
❌ Ação do suporte que fica PERMANENTE (membro, cargo, matriz, assinatura) sem bloqueioDoSuporte
❌ notifyClient dentro de after() sem notificadorDoCliente() (a pergunta "é suporte?" tem de começar na requisição)
❌ Confiar só no marcador de React cache para saber se é sessão de suporte numa action — é sessaoDeSuporteAtual (o token)
❌ Mexer numa autorização de suporte sem ler antes as sessões em curso (sessoesEmCurso) e expirar o cache delas
❌ Mostrar nota interna do chamado à clínica, ou o suporte autorizar acesso por conta própria
❌ Action do sistema sem getPlatformContext({ papel: 'ADMIN' }), ou página sem { verSistema: true } (o proxy é a primeira parede, não a única)
❌ Abrir uma action do sistema ao GERENTE (ele só vê) ou o suporte a ele — o alcance de cada papel é papelAlcanca
❌ Parte editável numa tela do sistema fora de um fieldset sistema-leitura (o Gerente veria o botão ativo)
❌ Pôr tela ou rota da plataforma no apps/web, ou código só da plataforma no núcleo (a clínica não carrega a plataforma)
❌ Levar a sessão do atendente ao domínio da clínica (o "entrar como" é o código de uso único; não há cookie de volta)
❌ /api/entrar sem conferir o Origin do PRÓPRIO painel (um script na clínica abriria sessões pelo cookie do atendente)
❌ Montar URL de outro host a partir do pedido — é urlDoHost / urlDaClinica (o ambiente)
❌ Mudar no sistema/suporte um cache que a clínica guarda sem expirarNaClinica (rede:, suporte-sessao:, user:)
❌ Abrir /api/interno/expirar a tag fora da lista fechada de lib/interno.ts
❌ Gravar evento da plataforma por emitirEvento (dispara automação da clínica) — é gravarEvento
❌ Decidir "rede bloqueada" fora de lib/redes/situacao.ts (ou a cobrança religar uma rede DESLIGADA à mão — is_active é só do admin)
❌ Mudar plan_status ou is_active sem expirar a marca rede:<id> — aqui E na clínica (o portão seguiria a situação velha)
❌ Mudar a situação da assinatura evento a evento no TS — é assinatura_aplicar_cobranca, por estado, no banco
❌ Criar rede fora de semearRede (o cadastro público e o sistema têm de nascer iguais)
❌ Criar cliente ou assinatura no Asaas sem procurar antes pelo externalReference (o Asaas aceita duplicado)
❌ Webhook do Asaas que responde diferente de 200 para o que já gravou (o Asaas repete e, com 15 falhas, pausa a fila)
❌ Mandar automação, campanha ou push ao paciente de uma rede bloqueada (redeEstaBloqueada)
❌ Chamar assinaturas_aplicar_regras em teste sem p_tenant (vale para as redes reais)
```
