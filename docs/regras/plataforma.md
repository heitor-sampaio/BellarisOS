# Plataforma: suporte, sistema e assinaturas

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### Plataforma e suporte (2026-10-03; em apps e hosts próprios desde 2026-10-06)

A PLATAFORMA é a equipe do BellarisOS que atende as redes que assinam. Desde
2026-10-06 ela mora em DOIS APPS, cada um no seu serviço e no seu host — nada
dela fica no app da rede:

| App | Host | Quem entra | O que tem |
|---|---|---|---|
| `apps/sistema` | `admin.bellarisos.com` (`SISTEMA_URL`) | ADMIN (administra) e GERENTE (só vê) | painel, redes, planos, cobrança/Asaas, equipe, auditoria, configurações, webhook do Asaas, cron `assinaturas`, primeiro admin |
| `apps/suporte` | `suporte.bellarisos.com` (`SUPORTE_URL`) | SUPORTE e ADMIN | chamados, redes (consulta e diagnóstico), reenviar acesso, reativar membro, a abertura do "entrar como" |

Por que dois hosts: o app da rede desenha conteúdo de fora (WhatsApp, editor de
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
- **O proxy do app da rede redireciona o POST com 303, e o login só envia
  hidratado** (D17 da 6ª simulação, 2026-11-04): o 500 do primeiro login do
  Bruno foi `POST /login 307` → `POST /…/cliente 307` → `POST
  /update-password 500` ("Failed to find Server Action", log do Railway às
  06:37:25Z; o Supabase sem nenhum 5xx). O formulário saiu antes de o React
  hidratar (o POST nativo da action), o Next desenhou /login já com a sessão e
  redirecionou com 307, que REPETE o POST — e o 307 da senha provisória no
  proxy repetiu de novo. Agora o "Entrar" fica desligado até hidratar
  (`useSyncExternalStore`), e todo redirecionamento do proxy
  (`lib/supabase/middleware.ts`, `redirecionar`) de um pedido que não é
  GET/HEAD é 303. Prova: `e2e/autenticacao-login-antes-da-hidratacao.spec.ts`.
- **O app da rede recusa a marca da plataforma**: o proxy dele desfaz a sessão e
  manda a `/login?acesso=plataforma` ("a equipe da plataforma entra por…"); o
  `buildContext` (ANTES do padrão CLIENT — sem `role`, o atendente viraria
  cliente final), o `loginAction`, `/auth/redirect`, `/conta-suspensa` e
  `/api/auth/session` recusam também.
- **Nenhum login do app da rede sem vínculo** (o Heitor, 5ª simulação,
  2026-11-01: "não deve ter como ter um login sem vínculo, ou é rede ou é
  unidade"): todo login do app da rede é membro de uma rede (abrangência rede ou
  unidade) ou cliente com ficha; os da plataforma (`platform_staff`) seguem
  como são. Quem cria login e grava o vínculo depois passa por `comLoginNovo`
  (`lib/login-novo.ts`): o passo que lança ou falha apaga o login NOVO (o
  cadastro da rede nova e o "Novo membro"; o acesso da cliente tem
  `desfazerLogin`, e o "Nova rede" e o primeiro admin do sistema já
  desfaziam). Desfazer vínculo não deixa sobra: não existe remover membro,
  apagar cliente nem apagar rede — desativar bane o login e mantém a linha;
  arquivar mantém a ficha. O login sem vínculo que sobrar não entra
  (`contaSemVinculo`, `lib/destino-da-sessao.ts`, no banco e não nos claims):
  a sessão recém-aberta é desfeita e a tela diz "Esta conta não tem acesso a
  nenhuma rede." Prova: `e2e/autenticacao-login-sem-vinculo.spec.ts`,
  `tests/login-novo.test.ts`.
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
- **URL entre hosts vem do ambiente** (`urlDoHost`, `urlDoAppDaRede`), nunca do
  pedido. O e-mail de "definir senha" volta pelo app da rede para membro de rede e
  pelo host do papel para atendente (`linkDeDefinirSenha`).
- **Cache que um app muda e outro guarda** (`expirarEm`/`expirarNoAppDaRede`,
  `lib/plataforma/expirar-no-app-da-rede.ts`): a situação da rede (`rede:`), a
  sessão de suporte (`suporte-sessao:`) e o membro (`user:`) moram no APP DA REDE;
  a pessoa da plataforma (`plataforma:`) também no SUPORTE. Quem muda chama
  `/api/interno/expirar` do dono, com `INTERNO_SECRET` (32+, tempo constante)
  e a lista fechada de `lib/interno.ts`. Acessório: o TTL e a RLS seguem
  valendo se o aviso falhar.
- **CSP estrita com nonce nos dois hosts** (`politicaDeConteudo`,
  `lib/plataforma/porta.ts`): script só com o nonce da requisição; sem
  moldura; `form-action` só para o próprio host (e o app da rede, no suporte).
  Lista de IPs opcional (`PLATAFORMA_IPS`, pelo `X-Real-IP`).
- **Tudo o que a plataforma faz vai para `platform_audit_log`**
  (`registrarNaPlataforma`, só acrescenta), inclusive abrir o painel de uma
  rede ou um chamado — e a rede vê isso. Registro DEPOIS de um efeito que
  já saiu (resposta no chamado) não devolve erro se falhar: a pessoa
  repetiria e o efeito sairia duas vezes — vai para o log.
- **Fato que a plataforma grava na corrente da rede não dispara
  automação** (`gravarEvento`, `lib/events/gravar.ts`, sem despacho): é o
  princípio do modo suporte. Hoje: `membro.reativado` pelo suporte.
- **Diagnóstico sem segredo e sem dado de cliente**
  (`apps/suporte/lib/plataforma/diagnostico.ts`): das caixas e integrações só
  o estado (lista fechada); dos eventos só nome, entidade, ator e hora.
- **O primeiro admin nasce pela variável `PLATAFORMA_ADMIN_EMAIL`** — SÓ no
  sistema (`apps/sistema/lib/plataforma/primeiro-admin.ts`): quem entra com
  esse e-mail no login do sistema é promovido (sessão renovada para o token
  vir com a marca); sem conta ainda, o "Esqueci minha senha" do sistema cria o
  login já marcado. O app da rede não promove ninguém. Membro de rede com esse
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
- **O `/setup` retoma de onde parou** (2026-10-20): os dados já gravados da
  rede vêm preenchidos (o campo vazio grava nulo — sem isso, confirmar apagava
  o telefone), a rede que já tem unidade ativa vai direto ao "Tudo pronto!"
  (sem isso, a única saída era criar uma segunda unidade), e o passo da
  unidade tem "Voltar". Prova: `e2e/setup-retoma.spec.ts`.
- **O setup se dá por concluído quando a unidade existe** (A1 da 9ª simulação,
  2026-11-07): criada a unidade, toda URL do `/admin` voltava ao "Tudo pronto!"
  até o clique em "Acessar o painel", e quem fechava a aba no fim caía nele de
  novo (os dois times). O layout do `/admin` só manda ao `/setup` a rede SEM
  unidade ativa; o "Tudo pronto!" segue a quem abre o `/setup`. **E o passo da
  unidade** (A2, A7): "Repetir o horário de segunda em todos os dias (domingo
  incluído)" no editor de horário (`[data-repetir-horario]`; a unidade 24 h
  preenchia 14 campos) e o "Número" do endereço, que entra depois do
  logradouro ("Rua Padre Chagas, 123 — Moinhos de Vento",
  `enderecoComNumero`, `lib/unidades/endereco-com-numero.ts`; também no "Nova
  unidade"). O `id="br-phone"` em dobro não se reproduziu: o passo 1 usa
  `net-phone`, e o setup tem um campo só. Prova: `e2e/setup-atritos-da-9.spec.ts`,
  `tests/endereco-com-numero.test.ts`.
- **"Aberta 24 horas, todos os dias"** (A11 da 11ª simulação, 2026-11-10: a
  Renata abriu a Violeta 24 h com 7 pares de hora e o domingo à mão; o
  "Repetir" existia e não foi notado): no editor de horário (o setup, Unidades
  e a Equipe), ao lado do "Repetir", o atalho grava os 7 dias de 00:00 a 24:00
  (`[data-aberta-24-horas]`), e o dia inteiro aparece como "24 horas" com
  "Escolher o horário" (`[data-dia-inteiro]`) — o campo de hora não mostra
  24:00. Prova: `e2e/setup-atritos-da-11.spec.ts`. **E se desfaz com um
  toque** (A1 da 12ª simulação, 2026-11-11: a Helena e a Cláudia deixaram o
  24 h ligado por engano, e desfazer era 7 × "Escolher o horário"): ligado, o
  atalho fica marcado (`aria-pressed`) e diz "Ligado. Toque de novo para
  voltar ao horário de antes." (`[data-desfazer-24-horas]`); o segundo toque
  devolve o horário de antes do atalho. Prova:
  `e2e/configuracoes-atritos-da-12.spec.ts` ("A1").
- **O endereço que se dá à cliente é o do APP DA CLIENTE, inteiro** (A4 da
  6ª simulação, 2026-11-04; princípio 3): Configurações → Geral mostrava como
  "Endereço do portal" o identificador da rede (`/{tenants.slug}`), que não
  abre tela nenhuma, e Unidades o da unidade (`/begonia-savassi`); quem administra a
  rede não sabia qual dar. Agora Geral diz "App da cliente:
  https://…/begonia-savassi/cliente" (por unidade ativa, com "Qualquer
  unidade abre a mesma ficha" quando há mais de uma) e para que serve, e o
  cartão de cada unidade em Unidades diz o dela (`lib/unidades/app-da-cliente.ts`,
  com o domínio de `origemPublicaDe`). O identificador da rede saiu da tela.
  Prova: `e2e/configuracoes-endereco-do-app.spec.ts`.
- **O fim do `/setup` sugere os próximos passos, NA ORDEM** (A3 da 6ª
  simulação, 2026-11-04: o procedimento nascia antes da equipe e do estoque —
  "Ninguém atende…", "o insumo precisa existir antes"): Equipe → Estoque →
  Procedimentos → Taxas da maquininha, cada um com o porquê
  (`PROXIMOS_PASSOS`, `[data-proximos-passos]`), e o clique conclui o setup e
  leva à tela dele. Prova: `e2e/setup-retoma.spec.ts` ("A3").
  **São LINKS e citam o resto do que o procedimento pede** (A1 da 7ª
  simulação, 2026-11-05: o procedimento escolhe a ficha e o termo que JÁ
  existem): Equipe → Estoque → Fichas → Documentos → Procedimentos →
  Taxas da maquininha → Fidelidade → Funil de oportunidades, cada um um `<a>`
  com o endereço (o clique comum conclui o setup antes de ir; o do meio abre
  em outra aba). O passo de uma funcionalidade fora do plano da rede não
  aparece (`foraDoPlano`). **O domingo fechado está à vista** (A2): o passo
  da unidade diz "O domingo vem fechado. Se a unidade abre aos domingos (ou
  24 horas), marque o domingo…" (`data-domingo-fechado`). Prova: o mesmo spec
  ("A3/A1", "A2").
  **E começam pela 2ª unidade e passam pelas Salas, com o painel em destaque**
  (A1 da 8ª simulação, 2026-11-06): "Outra unidade (se houver)" vem antes da
  Equipe (quem atende se marca em cada unidade — o checklist do "Atende") e
  "Salas" antes do Estoque e do Procedimento (`/admin/settings?tab=unidades#salas`;
  com duas unidades, as salas ficam no "Ver detalhes" de cada uma, e o passo
  diz). O "Acessar o painel →" é o botão principal, logo abaixo do "Tudo
  pronto!", e a lista vem depois ("Ou comece pelos próximos passos"). Prova:
  `e2e/setup-retoma.spec.ts` ("A3/A1").
- **A unidade nova NÃO herda o CNPJ da rede calada** (cfg-01, revisão do
  Heitor de 2026-11-02: "se em branco, avisa e confirma decisão. Talvez uma
  clínica possa ter 2 unidades físicas operando no mesmo CNPJ. Uma unidade
  física não precisa necessariamente de um novo CNPJ. Flexibilidade é a
  palavra"). `createBranch` com o CNPJ vazio (ou sem o campo) não grava:
  devolve `perguntaCnpj` com o CNPJ da rede formatado, e a tela ("Nova
  unidade" e o passo da unidade do `/setup`) mostra o aviso "A unidade vai
  ficar sem CNPJ…" com "Usar o CNPJ da rede (…)" e "Criar sem CNPJ" (`_cnpj=sem`). Duas
  unidades com o MESMO CNPJ podem existir (não há índice único). O `/setup`
  continua trazendo o CNPJ da rede preenchido, à vista (J-6), e o "Nova
  unidade" também (A20 da 15ª simulação, princípio 7: o mesmo do `/setup`;
  `settings-branches.tsx` passa o da rede ao `BranchForm`) — apagado, volta
  a pergunta. Prova: `e2e/configuracoes-unidade-cnpj.spec.ts` ("A20"). O "Nova
  unidade" grava uma vez por envio (`umaVez`) e passou a gravar a inscrição
  estadual (o campo existia e se perdia). **A inscrição estadual é OPCIONAL**
  (r2-cfg-05, o Heitor, 2026-11-03: "manter, mas opcional"): o campo diz
  "Inscrição Estadual (opcional)" no criar e no editar a unidade, e nem a tela
  nem o servidor nem o banco a exigem (vazia grava nulo). Prova:
  `e2e/configuracoes-unidade-cnpj.spec.ts`, `e2e/setup-passo-da-unidade.spec.ts`.
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
    (`aplicarPlanoAtual`). Mudar o plano da rede expira `rede:<id>` aqui e no
    app da rede — o retrato vem no `getCachedRede`.
  - **Onde vale, no app da rede:**
    - funcionalidade que é um MÓDULO inteiro: `buildContext` derruba o módulo
      para NONE (`modulosForaDoPlano`) — inclusive para a Admin da rede; somem
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
    - **A Admin da rede conta em membros** — é um membro ativo como os outros.
  - A rede vê o plano em Configurações → Assinatura (`PlanoDaRede`): cada
    funcionalidade dentro ou fora, e o uso de cada limite ("2 de 3").
  - Templates continuam utilizáveis pelo inbox mesmo com `templates` fora:
    a funcionalidade é a TELA de criar e editar modelos; a resposta de 24 h
    da Cloud API precisa do modelo aprovado que já existe.
  - O que só LÊ não trava (a ficha do cliente lê pacotes e planos que já
    existem), e o que JÁ foi vendido continua valendo (agendar a sessão de um
    pacote vendido). A comissão continua sendo calculada no banco; trava a
    tela, a configuração e o fechamento.
  - **O PDV e a Auditoria são de TODO plano** (PL1, Bloco Plataforma do plano
    de adaptação, 2026-11-16 — o Heitor: "Sim"): é pelo PDV que entra o
    dinheiro (como Clientes, que não é opção), e a auditoria é segurança da
    rede. Nenhuma funcionalidade do catálogo cobre o `cashier` nem o `audit`,
    e o único caminho pelo qual o plano tira um módulo é `modulosForaDoPlano`
    (no `buildContext` e nos interessados dos avisos) — então plano nenhum, nem
    o teste grátis (tudo menos o Copilot), nem a rede bloqueada que volta com o
    retrato dela, os tira. Trava: `tests/planos-pdv-e-auditoria.test.ts`
    (funcionalidade nova que liste um dos dois quebra o teste).
  - **Os rótulos do catálogo seguem os nomes da revisão** (PL1): "Documentos
    (assinatura eletrônica)" (era "Termos e contratos…", DC1), "Fichas de
    atendimento personalizadas" (era "Personalização de fichas de
    atendimento", FC1), "Portal e app da cliente" (era "do cliente"). Moram só
    no código (`recursos.ts`): o banco guarda as CHAVES, então o sistema, a
    aba Assinatura, o comparativo e o site mudam juntos, sem migration.
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
    (tela da rede, `definirAdicional`, pode dar preço especial) e a rede
    (Configurações → Assinatura, `contratarAdicional`, sempre o preço do
    plano). A ÚNICA porta de escrita é `assinatura_adicional_definir` (banco,
    só service role): confere se cabe no plano, a quantidade (WhatsApp 0 ou mais, sem teto desde 2026-10-19;
    Copilot 0–1) e, ao tirar conexão, se os números ativos cabem — sob a
    mesma trava do gatilho do limite.
  - **O preço é RETRATADO** ao contratar: aumentar a quantidade mantém o
    contratado; mudar o preço no catálogo vale para quem contratar depois.
  - **Preço especial** (o sistema deu um preço diferente da oferta: cortesia,
    desconto) fica marcado (`especial: true`): a rede cancela, mas não
    aumenta a quantidade dele — senão uma conexão de cortesia virava dez de
    graça. Com a cobrança ligada, nenhum adicional deixa a mensalidade em
    R$ 0 (o Asaas não cobra zero; encerrar é com o BellarisOS).
  - **No app da rede contrata quem é da rede** (com “A rede inteira”) com
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
    adicional contratado pela rede no meio sumiria).
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
  - **O app da rede não fala com o Asaas**: grava pela função do banco e pede ao
    sistema (`pedirAoSistemaLevarValor` → `POST /api/interno/levar-valor`,
    `INTERNO_SECRET`; só o id da rede vai no pedido, o valor sai do banco).
    Falhou: a rede é avisada ("chega à cobrança em até uma hora"), e o
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
  - **Voltou a ter valor** (a cortesia acabou, a rede contratou algo pago,
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
  - Item com condição é condição especial: a rede cancela, não aumenta. Tirar
    o adicional tira a condição dele; sem plano, nenhuma.
  - A rede vê cada condição na aba Assinatura ("Condições do BellarisOS"),
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
  `billingType: UNDEFINED` (a rede escolhe Pix, boleto ou cartão); o teste
  fica só no nosso banco (a assinatura vence no fim dele).
- **O webhook** (`/api/webhooks/asaas`) se defende pelo `asaas-access-token`
  (tempo constante; sem token de 32+ caracteres configurado, recusa tudo),
  GRAVA o evento pela chave do Asaas (o repetido bate no 23505), responde 200
  na hora e processa em `after()`; o cron recolhe o que ficou parado.
- **Depois de cada mudança** (`depoisDaMudanca`): expira a marca da rede,
  avisa no sino quem administra a rede (tipo `assinatura`) e registra as
  automáticas em `platform_audit_log` sem pessoa.
- **O lado da rede**: Configurações → Assinatura (rede + `settings:
  MANAGE`; o "Pagar" some no modo suporte) e o aviso no topo para quem
  administra a rede (teste acabando em 7 dias; em atraso, com a data da
  suspensão e o link da fatura).
- Prova: `e2e/sistema-redes.spec.ts` (criar, editar, desligar, as regras) e
  `e2e/assinaturas-asaas.spec.ts` (contra o build, com o Asaas falso).

**Entrar como (impersonificação autorizada):**
- **Só com AUTORIZAÇÃO vigente da rede** (`support_grants`: 24 h, 72 h
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
     lax do atendente iria junto num POST que partisse do app da rede):
     `abrirSessaoDeSuporte` abre a sessão (`suporte_sessao_abrir`: autorização,
     motivo, uma por atendente e por conta) e cria o código (32 bytes, 60 s; só o
     SHA-256 vai a `support_entry_codes`, RLS sem política). A resposta é uma
     página com CSP própria que POSTA o código ao app da rede — no corpo, fora da URL;
  2. no APP DA REDE (`POST /auth/suporte-entrada`, rota de auth no proxy): só com
     `Origin` do host do suporte; `ativarSessaoDeSuporte` consome o código
     (`suporte_entrada_consumir`, uma vez, atômico) e só então gera a sessão do
     membro (`generateLink` + `verifyOtp`, ligada por `suporte_sessao_ativar`
     com `not_after`), grava os cookies httpOnly DELE neste host e avisa a
     rede no sino.
  - A sessão do atendente NUNCA vai para o app da rede: não existe mais o cookie
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
  cache delas (`revalidateTag(tagDaSessao(…), { expire: 0 })`). Desativar o atendente também
  derruba a dele, e `sessaoVigente` confere que ele segue na equipe.
- **A sessão de suporte não GRAVA pelo PostgREST** (2026-10-08): o token
  dela está no navegador do atendente (httpOnly não esconde das ferramentas
  de desenvolvedor), e ele gravava direto o que a RLS deixa ao membro, fora do
  registro. Política RESTRICTIVE `suporte_sem_escrita_ins/_upd/_del` em toda
  tabela de `public` com RLS (o laço da migration `20261008000010`; tabela
  nova entra nele). O que o suporte muda, muda pelo app, que grava pelo
  cliente de serviço. Ler continua como o membro (menos o clínico).
- **No modo suporte nada sai para o paciente**: `bloqueioDoSuporte(ctx, …)`
  (`lib/suporte/travas.ts`) nas actions de envio do inbox (texto, template,
  mídia), campanha, pedido de assinatura e link de assinatura (gerar e pela
  conversa). O push ao cliente (`notifyClient`) não sai, e fato gravado na
  sessão não dispara automação (o evento fica, com `suporte_sessao_id`).
  Também o fato que o GATILHO SQL cria (pagamento, estoque, comissão…): toda
  escrita do cliente de serviço na requisição do suporte leva o cabeçalho
  `x-bellaris-suporte-sessao`, e o gatilho de `domain_events` grava a marca
  (F71; `automacoes.md`). O fato da equipe ou da cliente no mesmo período
  dispara normalmente — o que o suporte cala é o que ELE fez.
  Também não sai, não troca senha e não registra aparelho de push.
  - ⚠️ **A marca "esta requisição é do suporte" vem do TOKEN**
    (`sessaoDeSuporteAtual`, `lib/suporte/requisicao.ts`), não só do `cache`
    do React: o marcador não sobrevive numa server action, e o push do
    cancelamento feito no suporte saiu para o cliente até isso ser provado.
    Dentro de `after()`, comece a pergunta ANTES (`notificadorDoCliente()`).
- **O que fica como permanente, o suporte não faz**: cadastrar membro, mudar
  cargo, abrangência ou a matriz de um cargo (`createTeamMember`,
  `updateTeamMember`, `createRole`, `updateRole`, `saveRolePermissions`) —
  seria acesso fora do prazo da autorização. Nem tirar ou devolver o acesso
  de alguém, nem apagar cargo (`deactivateTeamMember`, `reactivateTeamMember`,
  `deleteRole` — F63, C7; o `deleteRole` dava a mensagem genérica do banco),
  nem ligar automação ou mudar os limites dela (D18; `automacoes.md`).
  ⚠️ Desde a F63 a matriz de cargos grava pelo cliente de SERVIÇO (a sessão
  só lê, migration `20261112006302`): a restritiva do suporte não a protege
  mais, e quem a protege é o `bloqueioDoSuporte` da action. Action nova que
  grava cargo, matriz ou membro nasce com ele. Prova (contra o build):
  `e2e/suporte-credenciais.spec.ts`. Nem colher assinatura, marcar
  papel ou dispensar documento: `document_signatures` é evidência imutável, e
  ali o atendente apareceria como o membro.
- **O fim** (`app/auth/suporte-fim/route.ts` do app da rede, o "Sair" do banner): encerra a
  sessão, apaga a sessão do Auth e os cookies do membro NESTE host, e leva ao
  painel no host do SUPORTE (`SUPORTE_URL` + o chamado ou a rede) — onde o
  atendente segue logado na sessão dele, que nunca saiu de lá. Revogar no
  app da rede derruba na próxima tela; o cron `suporte-sessoes` (no app da rede, onde
  mora o cache da sessão) fecha as vencidas. É GET (é um link): sem sessão de
  suporte, não faz nada — um link de outro site não desloga um membro.
  - ⚠️ **O pedido INTERNO do Next (RSC de um clique no menu, prefetch) não
    roda o fim** (`pedidoInternoDoNext`): responde 200 sem RSC, e o Next faz a
    navegação inteira até a rota — é ELA que encerra. Rodando no pedido RSC, o
    fim apagava os cookies, o Next refazia como navegação inteira já sem
    sessão, e o atendente caía no /login do app da rede (a completa de
    2026-10-08 pegou pelo trace; o `goto` do teste antigo não passava por aí).
    Vale para toda rota com efeito chamada por `redirect()` de uma página.
- **Transparência:** a rede é avisada no sino quando o suporte entra e
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
- O membro da rede abre o chamado pela Ajuda (`components/shared/ajuda.tsx`,
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
  sistema na conversa + sino; quem decide é a rede.
- **Nota interna** (`interna`) é filtrada NO BANCO para a rede. Só a
  resposta do suporte atribui o chamado e avisa no sino — com texto genérico
  (o push aparece na tela de bloqueio). O "Ver a resposta" do sino abre a Ajuda
  no chamado (evento `bellaris:ajuda`).
- **O chamado é de quem abriu e de quem administra a rede** (rede + `settings:
  MANAGE`); o colega recebe "não encontrado", também pela action. Cliente final
  e contexto sem membro nunca alcançam.
- **A fila se atualiza pelo SINAL** `support_signals` (uma linha sem dado, só
  a plataforma lê — o padrão de `crm_quadro_sinais`) e por um refresh a cada
  minuto. O Realtime do painel pega o access token no `/api/auth/token` DO
  SUPORTE (`rotaDoToken`, no núcleo, a mesma do app da rede). A rota `/api/suporte/contagem` do plano não existe: seria mais um
  endpoint a defender para dizer o que o refresh já diz.
- Um gatilho garante que o chamado de uma autorização ou sessão é da mesma rede.
- Tabelas: RLS ligada e ZERO políticas. Prova: `e2e/chamados.spec.ts`.

**A configuração da rede toda (H7, decisão do Heitor, 2026-11-01:
"gerente de uma unidade só mexe no que é da unidade"):**
- Quem não tinha “A rede inteira”, com os módulos em Gerenciar, abria Configurações
  no portal da unidade e gravava o que vale para todas as unidades (A6 da 5ª
  simulação) — a tela só avisava "alterar aqui muda para todas". A trava é da
  ABRANGÊNCIA (`ctx.branchId`), nunca do nome do cargo: `mexeNaConfigDaRede`
  / `recusaDaConfigDaRede` (`lib/configuracao-da-rede.ts`), na action E na
  tela.
- **Quem é da rede chega, pelo portal da UNIDADE, ao que só a rede tem** (A1
  da 14ª simulação, F74, 2026-11-13; CLAUDE.md §1, a rede de uma unidade só: quem tem o cargo Admin da rede
  entra pelo endereço da unidade e não achava Comissões nem Automações). Uma
  lista só — o que o menu da rede tem e o da unidade não
  (`SO_NO_MENU_DA_REDE`, `lib/menu.ts`) — e três lugares que a leem: o MENU
  da unidade (`menuDaUnidadeFor`: as entradas de `BRANCH_MENU` na unidade, e
  as que só a rede tem levando a `/admin`), a BUSCA da topbar
  (`paginasDaBusca`, `opcoes.daRede`) e as CONFIGURAÇÕES da unidade (a aba
  pedida que só a rede tem vira link, `linkDaAbaNaRede`; e as abas da rede toda
  ficam numa linha "Nas Configurações da rede: …", `abasSoDaRede`, com a
  permissão e o plano de cada uma). Quem não tem “A rede inteira” não vê nada disso
  (não entra em `/admin`). Trava: `tests/configuracoes-e-menu-da-14.test.ts`
  (toda entrada de `ADMIN_MENU` chega ao menu da unidade de quem é da rede).
- **A aba da rede toda diz QUEM muda** (A5 da 14ª, princípio 3): depois de
  "Esta configuração é da rede toda", "Quem muda: …" com os nomes de quem é
  da rede e tem o módulo da aba em Gerenciar (`quemMudaNaRede`,
  `lib/equipe/quem-desfaz.ts` — a mesma consulta do "quem desfaz").
- **Fica com quem é da rede** (a action recusa, a aba diz "Esta configuração é
  da rede toda" sem o editor, `ABAS_DA_REDE_TODA`): tags
  (`actions/tags.ts`), funis, etapas e motivos de perda (`crm-funnels`,
  `crm-stages`, `crm-motivos`; o "Configurar funis" some do quadro da
  unidade), cargos, a matriz e quem vê o inbox (`roles`, `permissions`,
  `rede.atualizarVisibilidadeDoInbox`), os dados da rede e o setup
  (`rede.atualizarDadosDaRede`, `setup`; a aba Geral fica só para ler), as
  fichas (`fichas`) e a ficha de saúde, os modelos de documento
  (`modelos-de-documento`), as integrações e as caixas de WhatsApp
  (`integrations`, `uazapi-connection`, o OAuth da Meta em `/api/oauth/meta`;
  o inbox vazio manda pedir a quem administra), as ações em lote
  (`acoes-em-lote`), as automações, as campanhas e os templates (que já eram
  só do portal da rede, D-2). Já eram da rede antes: a fidelidade, a configuração de
  comissões, as taxas e a comissão do procedimento, criar/desativar unidade, a
  assinatura e o suporte.
- **O catálogo de procedimentos, as categorias e os pacotes são de quem tem
  Procedimentos em Gerenciar, e só isso** (PR1/PR6 e PC6 do plano de
  adaptação, 2026-11-13): saíram da lista do que é da rede. Ver
  `docs/regras/atendimento.md` §9.3.
- **Fica com a unidade** (o alcance de sempre, `alcancaUnidade`): a aba
  **Unidade** do portal da unidade (nova): os dados, o horário e as salas da
  unidade do endereço (`updateBranch`, `actions/salas.ts`); o estoque dela
  (entrada, ajuste, perda, mínimo, transferência que sai dela); a equipe dela
  (e a comissão de quem é dela); os cadastros e a operação do dia.
- **O catálogo, as categorias do estoque (revista em 2026-11-14, abaixo), as
  respostas rápidas e as Importações** (H8 do levantamento das regras, respondida pelo Heitor em
  2026-11-11, na 2ª volta: "catalogo de produtos pode ser da rede ou da unidade, decisão da rede. Categorias de estoque é da rede, normalmente a rede usa o mesmo produto/fornecedor em todas unidades. Respostas rápidas, na verdade, o mais certo seria ser de cada usuário, cada usuário poder configurar as suas. Importações é da rede, ela que vai importar os seus clientes ou o que for, e na importação poder escolher se aquilo pertence a uma unidade."
  Era a decisão da F4 "para revisar", que deixava as quatro com a unidade;
  substitui a 1ª resposta, "Catalogo da unidade, o resto da clinica"):
  - **Saiu em 2026-11-15 (E13 do Bloco Estoque, o Heitor, 13/11: "Quem
    cadastra é só quem tem permissão de gerenciar"):** quem cria e edita
    produto é quem tem o Estoque em Gerenciar, na rede ou numa unidade; a
    configuração abaixo e a coluna `tenants.catalogo_de_produtos` saíram
    (`atendimento.md` §9.5). Para a história:
  - **O catálogo de produtos é decisão da REDE** (princípio 1): uma
    configuração da rede, "Quem cadastra e edita os produtos", com "A unidade"
    (quem não tem “A rede inteira” cria e edita, `createProduct`/`updateProduct`;
    o produto aparece em todas as unidades) ou "Só a rede" (quem não tem “A rede inteira” usa os produtos e lança o estoque deles, mas não cria, edita nem desativa; a
    action recusa com `recusaDoCatalogo` e a tela diz por quê). O padrão é "A
    unidade", que é o comportamento de hoje (princípio 6: nada muda sozinho).
    **Feito na F66 (C63, 2026-11-12):** `tenants.catalogo_de_produtos`
    (`UNIDADE`/`REDE`, `lib/estoque/catalogo.ts`), escolhido numa linha do
    cabeçalho do Estoque da rede ("Produtos: … · Mudar",
    `[data-catalogo-de-produtos]`; `salvarCatalogoDeProdutos`, de quem é da
    rede). Com "Só a rede", o Estoque da unidade não mostra "Novo produto" nem
    o lápis e diz `CATALOGO_DA_REDE` (`[data-catalogo-da-rede]`). Prova:
    `e2e/estoque-cadastro-f66.spec.ts` ("C63").
  - **As categorias, as marcas e os fornecedores do estoque são de quem tem o
    Estoque em Gerenciar, e só isso** (Bloco Estoque do plano de adaptação,
    2026-11-14, o Heitor, 13/11: "é só quem tem permissão de gerenciar, mesma
    regra para categoria, marca e fornecedor"). Substitui a C71 (as categorias
    eram da rede toda e recusavam quem não tem “A rede inteira” com
    `recusaDaConfigDaRede`) e a mesma regra dos Fornecedores (D4, C76): ser
    da rede deixou de contar. As três listas são da rede (todas as unidades
    usam as mesmas), e quem não tem “A rede inteira”, com o Estoque em Gerenciar,
    cria, renomeia e exclui (`criarItemDoEstoque`, `renomearItemDoEstoque`,
    `excluirItemDoEstoque`). Regra em `atendimento.md` §9.5; prova:
    `e2e/estoque-marcas-e-fornecedores.spec.ts`.
  - **As respostas rápidas são de cada pessoa** (`quick_replies`): cada membro
    cria, edita, apaga e vê só as suas, no inbox (`created_by` em toda leitura
    e gravação de `actions/quick-replies.ts`; o nome é único por pessoa,
    `uq_quick_replies_titulo_da_pessoa`; a sessão não lê nem grava a tabela).
    Quem guarda é quem MANDA mensagem (o CRM em Gerenciar, como o envio).
    Deixaram de ser uma biblioteca da rede (C72, F69; a única linha da
    produção tinha autor). **Têm um lugar fixo** (A8 da 14ª, F71): o botão
    "Minhas respostas rápidas" no topo da lista do Inbox, nos dois portais,
    lista, cria, edita e apaga as suas — sem conversa aberta e sem canal
    ligado (era só o ⚡/"/" de uma conversa, e a rede sem WhatsApp não
    tinha onde criá-las). É o mesmo editor; fora da conversa, o clique no
    atalho o edita. Prova: `e2e/inbox-respostas-de-cada-pessoa.spec.ts`,
    `e2e/inbox-minhas-respostas-rapidas.spec.ts`.
  - **As Importações são de quem é da rede**, e a importação escolhe a que
    unidade os registros pertencem (a ficha da cliente, os produtos). Quem
    não tem “A rede inteira” não importa: a aba diz "Esta configuração é da
    rede toda", e a action recusa (`importarContatos`,
    `retomarImportacao`; a aba está em `ABAS_DA_REDE_TODA`). Prova:
    `e2e/permissoes-f70.spec.ts` ("C73").
- Sem aba pedida, quem não tem “A rede inteira” abre Configurações na primeira aba que
  é DELA.
- **A aba pedida que não abre diz por quê** (A11 da 12ª simulação, 2026-11-11;
  princípio 3: quem tinha só a Acácia abria `?tab=commissions` e
  `?tab=permissions` e caía nas Tags calada). A tela abre a primeira aba que
  a pessoa alcança e diz "A aba Cargos pede Cargos e permissões em Gerenciar
  no cargo, e o seu não tem. Abrimos Tags." — ou "é da rede toda", "fica
  nas Configurações da rede", "não está no plano", "não existe"
  (`[data-aba-fora-do-acesso]`, `motivoDaAbaFechada`; os nomes em inglês de
  link antigo valem pela aba: `chaveDaAbaPedida`, `lib/configuracoes/abas.ts`).
  **E a Equipe só para ver diz** "Você vê a equipe. Cadastrar e editar é de
  quem tem a Equipe em Gerenciar no cargo." (`[data-equipe-so-leitura]`, nos
  dois portais). O `/admin/settings` de quem não tem “A rede inteira” já levava à
  unidade com o aviso do portal da rede (J-29) — o aviso some da URL depois de
  mostrado. Prova: `e2e/configuracoes-atritos-da-12.spec.ts` ("A11").
- **Quem ATENDE na outra unidade é levado à própria agenda** (A20 da 14ª,
  F73; princípio 3): a Bianca, fixa na Savassi e marcada para atender na
  Pampulha, abria `/pampulha/agenda` e lia "Você não tem acesso a essa
  unidade". Agora o layout de `[slug]` a leva a `/<a dela>/agenda` com
  "Os seus atendimentos nessa unidade estão na sua agenda, aqui." (a chave
  `atende-em-outra-unidade`) — é lá que os dela de fora aparecem (§9.1). Quem
  não atende ali segue com o aviso de sempre. Prova:
  `e2e/abrangencia-atende-em-outra-unidade-f73.spec.ts`.
- **O resumo do cargo diz QUAIS abas de Configurações** (A7 da 7ª simulação,
  2026-11-05; princípio 3): sem Configurações em Gerenciar, a pessoa chega à
  tela só pelas abas dos outros módulos, e "O que essa pessoa vai ver" diz
  "Configurações (só Comissões e taxas)" para o Financeiro
  (`rotuloDasAbasAlcancadas`, `lib/configuracoes/abas.ts`, pela mesma
  `abaLiberada`). O menu lateral segue "Configurações" (o rótulo longo
  cortava, J-16). **E o cartão do cargo não conta Relatórios "só a unidade"
  como "só os próprios"** (A8): "3 áreas · 1 só os próprios · Relatórios só
  da unidade" — em Relatórios o escopo é a unidade (CLAUDE.md §11). **A Admin
  vem primeiro no seletor de cargo** da Equipe (A9), como na tela de Cargos.
  Prova: `e2e/configuracoes-atritos-da-7.spec.ts` ("A7/A8", "A9"),
  `tests/resumo-do-cargo.test.ts`. **A linha de Configurações na matriz diz o
  que vem junto e o que as unidades da pessoa alcançam** (A10 da 10ª, 2026-11-10;
  princípio 3): o Gerenciar cita as integrações (o WhatsApp e as contas de
  anúncio, na aba Integrações), e a nota deixou de dizer "Só funciona para
  quem tem abrangência de rede" — falso desde a H7: "Quem não tem “A rede
  inteira” mexe só na aba Unidade (os dados, o horário e as salas das
  unidades dela): as integrações, os funis, as fichas, os documentos e o
  resto são da rede toda…"
  (`notaDeAbrangencia`, `lib/permissions-copy.ts`). **E a lista de cargos não
  muda de ordem ao salvar** (A9): os modelos nascem na mesma transação (o
  mesmo `created_at`), e o nome desempata. Prova:
  `tests/permissoes-copia-configuracoes.test.ts`,
  `e2e/configuracoes-atritos-da-10.spec.ts` ("A9").
  **E o resumo diz o que o módulo abre, só a quem cabe** (A15 e A16 da 11ª,
  2026-11-10; princípio 3): a linha do PDV em Gerenciar diz que vê
  o "Fechamento do dia" (a Comercial ganhou o item no menu sem a tela dizer), e
  o "Não vê as próprias comissões…" (A48 da 7ª) só aparece a quem PODE ter
  comissão — atende (Agenda, Prontuário) ou vende (CRM, PDV) — sem o
  Financeiro (`avisaSemMinhasComissoes`, `lib/permissions-copy.ts`): a
  Estoquista não o lia mais. Prova: `tests/resumo-do-cargo-da-11.test.ts`.
- **O Gerente modelo nasce com Configurações em Gerenciar** (D15 da 6ª
  simulação, 2026-11-04; princípio 1, o padrão sensato é o que a H7
  descreve): sem o módulo, quem tinha o Gerente numa unidade só não chegava à aba
  Unidade até a Admin da rede liberar. `private.cargos_modelo_semear` (migration `20261104002101`); as
  redes que já existiam não mudam sozinhas (princípio 6), só as `[e2e]`.
  Prova: `e2e/permissoes-gerente-modelo.spec.ts`.
- **A Recepcionista modelo nasce vendo as próprias comissões** (A3 da 12ª
  simulação, 2026-11-11; princípio 1): quem recebe no balcão e vende é o caso comum, e
  a Admin da rede da Margarida criou um cargo "Recepção com vendas" à mão. O modelo
  traz o Financeiro em "Ver, só as próprias" — o "Minhas comissões", sem o
  financeiro da rede (migration `20261111006001`). Só a rede nova; os
  cargos já gravados não mudam (princípio 6). Prova:
  `e2e/configuracoes-atritos-da-12.spec.ts` ("A3").
- Prova: `e2e/permissoes-config-de-quem-tem-uma-unidade.spec.ts` (a action direta de cada
  área recusada para quem não tem “A rede inteira”, com a Admin da rede como controle; a aba Unidade; as
  telas).

**Decididas no levantamento das regras** (o Heitor, 2026-11-11; as três
abaixo entraram na F70, 2026-11-12):
- **Ninguém dá um cargo com mais acesso que o próprio** (H7, opção b; o
  espírito da regra de 29/10, "somente admin promove a admin", aplicado aos
  módulos). Quem tem a Equipe em Gerenciar só dá (ao criar ou editar um
  membro) um cargo cujos módulos, níveis e escopos não passem dos do próprio
  cargo; o que passa aparece desabilitado na lista, "Financeiro (tem módulos
  que você não tem)", com a nota "Só quem tem esses módulos pode dar este
  cargo." A Admin da rede continua dando qualquer cargo. A action recusa
  também. "Acima" é, em algum módulo: um nível acima, o "todos" onde quem dá
  tem "só os meus", ou uma aba de Relatórios que ela não vê; manter o cargo
  que o membro já tem não é dar. Mora em `lib/equipe/cargo-acima.ts`
  (`cargosAcimaDoMeu`, `assertRoleInTenant`). Prova:
  `e2e/permissoes-f70.spec.ts` ("C62").
- **Desativar uma unidade mostra o que fica e oferece resolver, sem impedir**
  (H6, opção a; a mesma regra da H6 de 01/11 para o membro, e os princípios 2
  e 3). "A unidade Jardins tem 2 pessoas da equipe só nela e 14 agendamentos
  marcados. [Mudar a equipe de unidade] [Ver os agendamentos] [Desativar
  mesmo assim]" — nas duas portas (a lista e o detalhe da unidade), com
  confirmação. A janela é `DesativarUnidade`
  (`components/admin/desativar-unidade.tsx`, com `lib/unidades/desativar.ts`):
  "Mudar a equipe de unidade" é `moverEquipeDaUnidade` — leva quem é fixo nela
  para outra unidade ATIVA (a abrangência e os claims; o "Atende" de cada
  pessoa não muda, e nunca "para a rede", que daria mais acesso); "Ver os
  agendamentos" abre a agenda dela, onde se remarca ou cancela. Prova:
  `e2e/permissoes-f70.spec.ts` ("C67").
  - **A janela diz TUDO o que fica** (D2 e A32 da 14ª, F72): a equipe fixa,
    os agendamentos futuros, o estoque com saldo (valor e itens), o a receber
    (e os atendimentos concluídos sem pagamento, à parte) e a comissão a
    pagar — cada número da MESMA conta da tela que o mostra
    (`oQueFicaNaUnidade`). E leva a resolver cada um na tela que já existe
    (`caminhosDoQueFica`, `components/admin/o-que-ficou.tsx`): "Ver os
    agendamentos" (a agenda dela, no dia do primeiro), "Transferir o estoque"
    (o estoque dela; a transferência abre com ela de origem), "Ver o a
    receber" (`?aberto=todos` dela), "Fechar as comissões" (as dela). Sem
    repasse em lote novo. Depois do clique, o cartão e o detalhe da
    desativada continuam dizendo o que ficou, com os mesmos caminhos
    (`[data-o-que-ficou]`).
- **A unidade desativada continua CONTADA e ALCANÇÁVEL enquanto tiver o que
  ficou** (H6, o Heitor; C45 em `indicadores.md`; princípio 3 — D1, D2 e A32
  da 14ª, F72). A regra é uma, em `lib/unidades/da-tela.ts`:
  - **para LER** — `unidadesParaLer(tenantId, { periodo?, colunas? })`: as
    ativas e as desativadas com o que ficou (`temOQueFicou`: agenda futura,
    estoque com saldo, a receber, comissão a pagar) ou com movimento no
    período da tela (`periodoDaTela`). É o que usam o dashboard, os
    Relatórios (e o CSV de vendas), a agenda, o estoque, o Financeiro, as
    Comissões, o Fechamento e os Documentos da rede: o total a conta, o
    `?unidade=` a alcança, e ela leva o selo "Unidade desativada"
    (`nomeNaTela`, `SeloUnidadeDesativada`). "Uma unidade só" (D-19) é uma
    nos NÚMEROS: com dado da desativada, o cabeçalho diz "Rede".
  - **para CRIAR** — `unidadesParaCriar` / `quantasUnidadesAtivas`: só as
    ativas. É o seletor de agendar, de dar entrada e transferir PARA, de
    vender, de lançar, de cadastrar, de campanha, de equipe e o trocador de
    unidade do portal. O servidor confere também: `conferirPecasDoAgendamento`
    recusa agendamento novo ou horário novo na desativada, e o estoque recusa
    entrada, estoque inicial e transferência PARA ela
    (`unidadeDesativada`, `lib/estoque/movimentos.ts`) — tirar DELA
    (transferir, ajustar, perda) continua, é resolver.
  - **No app da cliente**, o cartão do agendamento numa unidade desativada
    diz que ela foi desativada (`AvisoUnidadeDesativada`), e remarcar leva às
    ativas ("Em qual unidade?"; o servidor não remarca mantendo a fechada).
  - Nenhuma tela filtra `is_active` das unidades por conta própria:
    `tests/unidades-da-tela.test.ts` trava. Prova:
    `e2e/unidade-desativada-f72.spec.ts`.
- **Só uma Admin autoriza o suporte a entrar na conta de uma Admin** (D19; a
  regra de 29/10, "somente admin pode alterar admin": entrar como ela é agir
  como ela). Para a própria conta, ela mesma; para a de outra Admin, outra
  Admin. Quem tem Configurações em Gerenciar sem ser Admin não vê o botão na
  linha de uma Admin, e a action recusa. Quem autoriza também revoga.
  `podeAutorizar(quem, alvo, { alvoEhAdmin })` em `lib/suporte/regras.ts`; a
  aba Suporte mostra a conta dela desligada, "(só uma Admin da rede
  autoriza)". Prova: `tests/suporte-regras.test.ts`, `e2e/permissoes-f70.spec.ts`
  ("C59").

**A pessoa de VÁRIAS unidades (EQ1a, EQ1b, EQ1c e PO1 — Bloco Equipe e
Portais, 2026-11-14; o Heitor, 2026-11-13: "permitir linkar a pessoa em mais
de uma unidade"):**
- O cadastro da Equipe tem **"Unidades"**: "A rede inteira" (todas, inclusive
  as que vierem) ou as unidades marcadas, uma ou mais
  (`components/shared/unidades-do-membro.tsx`). No banco, `users.branch_id`
  nulo = a rede inteira; preenchido = a principal, e `users.outras_unidades`
  as outras (gatilho `trg_a_unidades_do_membro`: sem repetição, sem a
  principal, só unidades da rede, vazia para a rede inteira). Sem tabela de
  junção (PGRST201) e sem backfill: o membro de antes segue igual.
- **Ela vê e opera só as DELA**: `ctx.unidades` (null = a rede inteira) e
  `alcancaUnidade`; `ctx.branchId` é a unidade em que ela ESTÁ (a do endereço,
  se é dela; senão a principal). A RLS a acompanha:
  `private.can_access_branch` e as políticas de leitura de `branches` e
  `users` aceitam as outras (`private.minhas_outras_unidades()`).
- **"Da rede" é só "A rede inteira"** (EQ1b): duas unidades marcadas não
  abrem o `/admin`, não gravam a configuração da rede toda (H7) e não veem a
  lista de quem abriu o prontuário.
- **Quem dá as unidades**: "A rede inteira" só quem a tem; quem tem unidades
  marca só as DELA, e a unidade que o membro já tinha fora do alcance dela fica
  como estava (`unidadesQueGrava`, `lib/unidades/do-membro.ts`). Editar exige
  alcançar ALGUMA unidade do membro; trocar o cargo, desativar e reativar, TODAS
  (o login e o cargo são um só). A Admin da rede é sempre da rede.
- **O portal (PO1)**: a pessoa de várias unidades entra no portal da unidade —
  a ÚLTIMA usada (o cookie `bellaris-unidade`, que o seletor grava; o servidor
  confere que ainda é dela e está ativa, `lib/unidades/de-entrada.ts`), senão a
  principal. No topo, "Unidade: X ▾" (`components/shared/seletor-de-unidade.tsx`)
  com só as dela; trocar leva à MESMA tela na outra (`rotaNaOutraUnidade`,
  `lib/rotas.ts`; o registro de uma unidade volta à lista). O layout de
  `[slug]` aceita qualquer unidade dela; a que não é dela leva à dela com o
  aviso. Quem tem a rede inteira segue no portal da rede.
- Prova: `e2e/equipe-varias-unidades.spec.ts`, `tests/unidades-do-membro.test.ts`.

**O "Atende" é por unidade — e não é abrangência (§11 do CLAUDE.md; decisão 2
do Heitor sobre a 8ª simulação, 2026-11-06: "Inves de atende também em, o
atende vira um checklist com todas as unidades, as que estiverem marcadas ficam
disponiveis"):**
- `provides_services` passou a querer dizer "atende em ALGUMA unidade"; ONDE
  atende é `users.atende_em` (o checklist do "Atende" na Equipe), e o gatilho
  `private.atende_em_sincronizar` mantém os dois juntos. Continua não sendo
  permissão: diz onde a pessoa aparece como profissional (agenda, agendar,
  repasse, comissão, relatórios da unidade) — §9.1 de `atendimento.md`.
- **Uma caixa (EQ1c)**: "Atende clientes" marcada vale em todas as unidades
  DELA (a rede inteira: as ativas na hora de salvar — a unidade aberta depois
  nasce sem ninguém marcado, princípio 6). Com mais de uma unidade, "Escolher em
  quais unidades atende" (fechado por padrão) abre a lista; a marca de antes
  fora das unidades dela aparece na lista e não some calada.
- A ABRANGÊNCIA (`users.branch_id`/`outras_unidades`) não muda com o "Atende": marcar a Talita (da
  Água Verde) no Batel não a põe no Batel. Ela alcança lá só os agendamentos
  DELA (`alcancaOAgendamento`, `lib/auth.ts`) — ver, iniciar, concluir, a
  comissão —, e o resto do Batel (agenda, clientes, caixa) continua fora. Quem
  gere a equipe deixou de precisar dar a rede inteira para alguém cobrir uma unidade (A12).
- Marca e desmarca quem gere a equipe; quem não tem a rede inteira, só as
  unidades DELA (H7) — as outras aparecem travadas e o servidor as mantém
  (`atendeQueGrava`, `lib/equipe/atende.ts`).
- Prova: `e2e/equipe-atende-por-unidade.spec.ts`.

**A sessão aberta quando a unidade ou o cargo mudam (D9 da 9ª simulação,
2026-11-07):** o app lê a unidade e o cargo do BANCO (`buildContext`), mas a
RLS lê o TOKEN, e `set_user_claims` não renova o token que já está aberto. A
Priscila, mudada da Moinhos para a Menino Deus com a sessão aberta, via 500 em
toda tela até relogar: o layout de `[slug]` lia a unidade nova pela sessão, a
RLS (claim velha) a escondia, e o `.single()` lançava.
- O layout lê a unidade do membro pelo servidor (com a rede), como o `/admin`.
- Com o token diferente do banco (`claimsVelhas`, `lib/sessao/claims-velhas.ts`:
  a unidade, ou o cargo quando o token o tem), a PÁGINA (GET, fora de `/api` e
  `/auth`) passa por `/auth/renovar` (`getTenantContext`, só fora da sessão de
  suporte): grava as claims do banco do membro DESTA sessão (`set_user_claims`)
  e renova o token (`refreshSession`), e volta ao mesmo caminho (só interno).
  O pedido RSC/prefetch responde 200 sem RSC (o Next refaz como navegação
  inteira). Um cookie de 60 s (`bellaris-renovou`) evita o laço se a renovação
  não pegar. A action segue pelo banco, como antes.
- Prova: `e2e/equipe-unidade-da-9.spec.ts` ("D9"), `tests/claims-velhas.test.ts`.

### Auditoria (CF3a–CF3c, docs/revisao.md — 2026-11-16)

"Queria um lugar para auditoria [...] onde o admin pudesse ver tudo o que
aconteceu" (o Heitor, 2026-11-13). A tela (menu → Gestão, ao lado de
Relatórios; `/admin/auditoria` e `/[slug]/auditoria`, corpo em
`app/_shared/auditoria.tsx`) é só de leitura: quando, quem, o quê em
português, o link e a unidade; filtros de período (`resolvePeriod`, até o
`fullTo`), pessoa, ação, unidade e cliente; CSV em `/api/auditoria/csv`.

- **O registro é `public.auditoria`** (migration `20261116000001`): uma linha
  por registro que um comando mudou (`criou`, `editou`, `apagou`), mais a
  abertura do prontuário (`abriu`, o insert em `prontuario_acessos`) e a
  entrada no sistema (`entrou`, `auditoria_registrar_entrada` no
  `loginAction` e no `/api/auth/session`; só membro).
- **Quem grava é o gatilho** `private.auditar`, por COMANDO (`for each
  statement`, com as tabelas de transição): um insert por comando, por mais
  linhas que o comando mude. A lista das tabelas (e as que ficam de fora, com
  o porquê) está na migration. Tabela nova que guarda o que alguém FAZ entra
  na lista; a que só registra andamento (fila, sinal, cache, log) não.
  A função roda com `plan_cache_mode = force_generic_plan` (migration
  `20261116300002`). Com o plano personalizado, cada gravação custava 1,7 ms,
  contra 0,54 ms agora, e o banco cedeu sob a completa. Um `create or replace`
  da função tem de repor o ajuste: `tests/auditoria-plano-generico.test.ts`
  trava.
- **Quem agiu sai da requisição, nunca do corpo.** Pela sessão (role
  `authenticated`), o dono do token. Pelo servidor (`service_role`), o
  cabeçalho `x-bellaris-ator` — o login da requisição, que o
  `createAdminClient` põe em toda ESCRITA (`comAtor`,
  `packages/nucleo/src/lib/supabase/ator-da-escrita.ts`, com o mesmo memo por
  token da marca do suporte) — e o `x-bellaris-suporte-sessao`. O banco só lê
  os cabeçalhos com a chave de serviço: pela sessão, o forjado não vale. Sem
  ninguém (cron, webhook, script, SQL): "O sistema". O nome é o do `ctx`: o
  membro, e na sessão de suporte "Fulana (via suporte: Atendente)" — a conta
  de `nomeComSuporte`, refeita no banco. **A gravação do Copilot** (CP1,
  2026-11-16) é de quem pediu, com a marca: o Confirmar põe
  `x-bellaris-via: copilot` (`comViaDoCopilot`), e o banco — só com a chave
  de serviço, só o valor `copilot` — grava `via = 'copilot'` e "Fulana (pelo
  Copilot)" (migration `20261116300001`; `docs/regras/copilot.md`).
- **Nunca o conteúdo.** Das tabelas clínicas (`medical_records`,
  `medical_record_entries`, `prontuario_anotacoes`, injetáveis,
  a ficha de saúde, documentos da cliente, termos) e das de credencial
  (`integration_configs`, `whatsapp_numbers`, links de assinatura) vão só os
  NOMES das colunas mudadas. Das outras, os nomes e uma lista curta de valores
  sem dado pessoal (situação, datas, valores, o nome da sala ou da tag). O nome
  da cliente e do membro se lê na hora de mostrar (`lib/auditoria/frase.ts`):
  anonimizada pela LGPD, sai anonimizada aqui também.
- **Não se altera nem se apaga — nem pelo servidor** (`auditoria_imutavel`,
  e o `truncate` recusado). Sai só com a rede (a cascata de `tenants`) e na
  limpeza da rede de teste (`bellaris.apagando_rede`, que também cala o
  gatilho). Nenhuma linha antiga entrou: a auditoria começa na migration.
- **A sessão não lê**: nenhuma política permissiva e nenhum privilégio para
  `anon`/`authenticated` (as restritivas `suporte_sem_escrita_*` estão lá
  mesmo assim). A tela e o CSV leem pelo servidor (`lib/auditoria/leitura.ts`),
  paginado no banco (`.range`, 50 na tela, 1000 por vez no CSV com teto dito).
- **A permissão é "Auditoria"** (`audit`, a 19ª linha da matriz, no grupo de
  Gestão; Sem acesso ou Ver). Nasce só no Admin da rede (que tem tudo); os
  modelos não a têm; nenhuma funcionalidade do plano a cobre. Quem tem
  unidades vê só as linhas DELAS (`unidadesDoContexto`); a linha sem unidade
  (a tag, o cargo, a ficha da cliente) é da rede — como no `alcancaUnidade`. A
  unidade pedida na URL não vence a abrangência.
- **O filtro "Quem" sai das linhas que a pessoa alcança** (D7 da 15ª
  simulação, 2026-11-15): quem é da rede inteira lê todos os membros; quem tem
  unidades lê quem AGIU nelas (`auditoria_pessoas_das_unidades`, migration
  `20261116400002`, só o servidor). Era `users.branch_id in (as dela)`: ficava
  de fora quem tem "A rede inteira", com as ações dele na tela. Prova:
  `e2e/auditoria-pessoas-do-filtro.spec.ts`.
- **A tela lê a GRAVAÇÃO, não a linha** (A27/A28 da 15ª simulação, 2026-11-15;
  princípios 7 e 3). Nada deixa de ser gravado: muda a leitura
  (`gruposDaAuditoria`, `lib/auditoria/frase.ts`).
  - As linhas de uma mesma gravação (o mesmo `criado_em`, que é o `now()` da
    transação, e a mesma pessoa) viram UMA linha, com as outras guardadas nela
    ("Ver as N mudanças desta gravação", `[data-detalhe-da-auditoria]`; a frase
    da linha é `[data-frase-da-auditoria]`). A tabela-filha se lê sob a do pai
    ("Criou o cargo X (19 permissões)"); sem o pai, no plural ("Criou 3 e
    apagou 3 insumos do procedimento"); a semente da rede nova é "Montou a rede
    nova X (N registros: …)".
  - A frase lê o fato: "Estornou a venda de produto (R$ 139,00), e 1 Sérum
    voltou ao estoque" (o motivo é texto livre e não entra na auditoria),
    "Desativou/Reativou Fulana", "Transferiu 2 Protetor de Batel para Água
    Verde", "Deu entrada em 5 …", "Registrou a perda de 1 …". O produto e o
    cargo das permissões se leem na hora, como os nomes ("Criou a permissão de
    Agenda do cargo X"; "Criou 19 permissões do cargo X").
  - **A gravação se lê pelo FATO, e leva a unidade e o link dele** (D6/D7 da
    16ª simulação, `fatoDaGravacao`): a venda do pacote, do pré-pago e do
    crédito ("Vendeu o pacote 5 radiofrequências (R$ 1.650,00) — Bárbara"); o
    início e a conclusão do atendimento ("Concluiu o atendimento — Bárbara",
    na unidade do agendamento, não na do pacote cuja sessão foi usada); a
    venda de produto avulsa ("Vendeu 1 Hidratante e recebeu R$ 39,00 (Pix)");
    o recebimento ("Recebeu R$ 1.600,00 (Pix) — Rita", "Recebeu a parcela
    1/4 (R$ 200,00, Pix)", sozinha ou com os pontos). Recebido é o lançamento
    que ficou pago NA gravação (criado pago, ou o `paid_at` saiu do nulo),
    no estado do fim dela; o que a baixa não grava (o valor, a parcela) e o
    nome do pacote se leem agora (`nomesDaAuditoria`). A comissão, os pontos,
    o contrato e as sessões gravados junto ficam guardados na linha.
    Prova: `tests/auditoria-defeitos-da-16.test.ts`, `e2e/auditoria-defeitos-da-16.spec.ts`.
  - O campo se nomeia (a lista `CAMPO`); a coluna fora dela sai pelo próprio
    nome, sem "um campo"/"outros campos". Toda coisa da auditoria tem o plural
    (`COISA_DA_AUDITORIA` × `PLURAL_DA_AUDITORIA`: "Criou 2 links de
    assinatura"); o lançamento criado diz o que é e quanto ("Criou a despesa
    Material de limpeza (R$ 120,00)"), e a sala, a unidade ("Criou a sala
    Cabine 1 em Moinhos") (A35 da 16ª).
  - **O que a cliente fez pelo link é dela** (A36 da 16ª): o link público não
    tem sessão e o banco grava "O sistema"; a leitura diz "Dona Cida, pelo
    link" (tipo cliente) na edição da ficha de saúde, do link dela, do link
    de assinatura e do documento, na assinatura e na ficha de saúde do
    prontuário (`feitoPeloLink`). O link CRIADO segue de quem o criou. A
    resposta da ficha é o fato da gravação: "Respondeu a ficha de saúde" (pela
    equipe, "Preencheu a ficha de saúde de X").
  - **Abrir o documento sem mudar nada não grava** (A35 da 16ª):
    `garantirRenderizado` só chama `documento_registrar_texto` quando a
    montagem muda a situação, o hash ou os campos que faltam, ou leva um
    pagamento (`montagemMudou`, `lib/documentos/montagem-mudou.ts`) — eram 14
    "Editou o documento (geração…)" de quem só abriu a tela.
  - O filtro "Quem" tem "Só o que foi pelo Copilot" (`pessoa=copilot` →
    `via = 'copilot'`, A37 da 16ª).
  - A página segue por gravação (`?antes=<id>`): a gravação que começa numa
    página termina nela. O CSV segue uma linha por registro, e cada uma leva a
    frase da gravação dela na coluna "Gravação" (`linhasDoCsvDaAuditoria`,
    A38 da 16ª: quem procura "Estornou" no arquivo acha); o CSV lê todas as
    páginas antes de agrupar, para a gravação não se partir.
  - O filtro "Abriu o prontuário" sai da lista de quem tem unidades
    (`operacoesDoFiltro`): a abertura é da rede, e ela nunca a alcança.
  - Prova: `tests/atritos-da-15.test.ts`, `e2e/auditoria-atritos-da-15.spec.ts`.
- **A falha do registro não derruba a gravação.** O gatilho segura o erro,
  grava uma linha `incompleto` (quando acha a rede) e deixa um WARNING no log:
  trancar a venda porque o registro dela falhou seria pior; calar esconderia o
  buraco — a linha incompleta aparece na tela como "(registro incompleto)".
- Prova: `e2e/auditoria.spec.ts` (o registro, o ator pela sessão e pelo
  servidor, o suporte, o texto clínico ausente, a imutabilidade, a sessão que
  não lê, a permissão, a tela, os filtros, as unidades, o CSV, a paginação).

---

## O que nunca fazer aqui

```
❌ Route handler com efeito (encerrar, deslogar, gravar) que roda no pedido RSC/prefetch do Next — responda 200 sem RSC e deixe a navegação inteira agir (pedidoInternoDoNext)
❌ Redirecionar no proxy um pedido que não é GET com 307 (repete o POST da action numa tela que não a tem: "Failed to find Server Action", D17) — é `redirecionar`, 303
❌ Tela ou action de funcionalidade que é PARTE de um módulo (pacotes, inbox, campanhas…) sem assertRecurso, ou rotina sem tela sem redeTemRecurso
❌ Acrescentar chave ao catálogo de lib/planos/recursos.ts sem migration nova decidindo os planos e retratos que já existem
❌ Funcionalidade do plano que cubra o cashier (PDV) ou o audit (Auditoria) — são de todo plano (PL1; tests/planos-pdv-e-auditoria.test.ts trava)
❌ Gravar retrato (tenant_subscriptions.recursos) fora de definirAssinatura/criarRede/aplicarPlanoAtual
❌ Gravar tenant_subscriptions.adicionais fora de assinatura_adicional_definir — nem na troca de plano (quem tira o que não cabe é o gatilho trg_retrato_sem_plano)
❌ Deixar a rede (p_valor_centavos null) aumentar adicional com preço especial
❌ Ler valor_centavos como a mensalidade — é a base; o que se cobra é valor_total_centavos (plano + adicionais, com cortesia e desconto)
❌ Calcular desconto ou cortesia fora de lib/planos/condicoes.ts / private.valor_com_condicao (as duas contas têm de bater)
❌ Gravar tenant_subscriptions.condicoes fora de assinatura_condicao_definir (o vencimento é assinaturas_encerrar_condicoes_vencidas)
❌ Levar valor ao Asaas pelo app da rede (ele não tem a chave) — é o sistema, por /api/interno/levar-valor ou pelo cron
❌ Decidir limite ou funcionalidade pelo retrato cru quando há adicional — é o efetivo (recursosEfetivos, getCachedRede)
❌ Decidir se a verificação em duas etapas é pedida fora de verificacaoPendente (ou cachear a opção: o outro host não a veria mudar)
❌ Mandar e-mail pelo Auth (convite, reenviar acesso) e descartar o { error } — a tela diria "enviado" com o e-mail parado no SMTP
❌ Deixar a marca da plataforma passar no app da rede (proxy, buildContext, login), ou página/action do sistema ou do suporte sem getPlatformContext
❌ Entrar na conta de um membro sem autorização vigente (suporte_sessao_abrir) ou entregar o token ao navegador antes de suporte_sessao_ativar
❌ Ação do suporte que fica PERMANENTE (membro, cargo, matriz, assinatura) sem bloqueioDoSuporte
❌ notifyClient dentro de after() sem notificadorDoCliente() (a pergunta "é suporte?" tem de começar na requisição)
❌ Confiar só no marcador de React cache para saber se é sessão de suporte numa action — é sessaoDeSuporteAtual (o token)
❌ Mexer numa autorização de suporte sem ler antes as sessões em curso (sessoesEmCurso) e expirar o cache delas
❌ Mostrar nota interna do chamado à rede, ou o suporte autorizar acesso por conta própria
❌ Action do sistema sem getPlatformContext({ papel: 'ADMIN' }), ou página sem { verSistema: true } (o proxy é a primeira parede, não a única)
❌ Abrir uma action do sistema ao GERENTE (ele só vê) ou o suporte a ele — o alcance de cada papel é papelAlcanca
❌ Parte editável numa tela do sistema fora de um fieldset sistema-leitura (o Gerente veria o botão ativo)
❌ Pôr tela ou rota da plataforma no apps/web, ou código só da plataforma no núcleo (o app da rede não carrega a plataforma)
❌ Levar a sessão do atendente ao domínio do app da rede (o "entrar como" é o código de uso único; não há cookie de volta)
❌ /api/entrar sem conferir o Origin do PRÓPRIO painel (um script no app da rede abriria sessões pelo cookie do atendente)
❌ Montar URL de outro host a partir do pedido — é urlDoHost / urlDoAppDaRede (o ambiente)
❌ Mudar no sistema/suporte um cache que o app da rede guarda sem expirarNoAppDaRede (rede:, suporte-sessao:, user:)
❌ Abrir /api/interno/expirar a tag fora da lista fechada de lib/interno.ts
❌ Gravar evento da plataforma por emitirEvento (dispara automação da rede) — é gravarEvento
❌ Decidir "rede bloqueada" fora de lib/redes/situacao.ts (ou a cobrança religar uma rede DESLIGADA à mão — is_active é só do admin)
❌ Mudar plan_status ou is_active sem expirar a marca rede:<id> — aqui E no app da rede (o portão seguiria a situação velha)
❌ Mudar a situação da assinatura evento a evento no TS — é assinatura_aplicar_cobranca, por estado, no banco
❌ Criar rede fora de semearRede (o cadastro público e o sistema têm de nascer iguais)
❌ Dar à unidade nova o CNPJ da rede sem a pessoa escolher (cfg-01: vazio pergunta, com "Usar o CNPJ da rede" e "Criar sem CNPJ")
❌ Criar login do app da rede e gravar o vínculo (claims, users, rede) fora de comLoginNovo — o passo que falha deixa um login sem vínculo
❌ Criar cliente ou assinatura no Asaas sem procurar antes pelo externalReference (o Asaas aceita duplicado)
❌ Webhook do Asaas que responde diferente de 200 para o que já gravou (o Asaas repete e, com 15 falhas, pausa a fila)
❌ Mandar automação, campanha ou push ao paciente de uma rede bloqueada (redeEstaBloqueada)
❌ Action ou tela que grava configuração da rede toda sem recusaDaConfigDaRede / mexeNaConfigDaRede (quem não tinha “A rede inteira” mudava para todas — H7), ou decidir isso pelo nome do cargo
❌ Chamar assinaturas_aplicar_regras em teste sem p_tenant (vale para as redes reais)
❌ Ler pela SESSÃO a unidade do membro que vem do banco (ctx.branchId) com .single(): com a claim velha a RLS a esconde e a tela dá 500 (D9 da 9ª) — é pelo servidor, com a rede
❌ Abrir a leitura da auditoria pela sessão, gravar nela fora do gatilho/da função, ou pôr nela o TEXTO de um registro clínico ou de credencial (só os nomes das colunas)
❌ Escrever pelo servidor com um cliente de serviço que não seja o createAdminClient (sem o x-bellaris-ator, a auditoria diz "O sistema" no lugar da pessoa)
```
