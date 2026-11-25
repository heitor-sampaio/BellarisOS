# Copilot

> Na tela, o Copilot não tem nome de função (A49 da 24ª; CLAUDE.md §1,
> "Vocabulário"): nem "secretária" — a matriz diz "Consultar o sistema e
> pedir gravações conversando", e o plano, "Copilot (IA)".
> `tests/vocabulario-no-texto.test.ts` trava.

> Área nova (2026-10-08). O índice está no §9 do `CLAUDE.md`. As regras gerais
> — rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam lá e
> valem aqui.

O Copilot é um chat da EQUIPE da clínica, flutuando sobre todas as telas de
`/admin` e `/[slug]` (nunca no portal do cliente), para consultar e operar o
sistema conversando — texto, voz, imagem e documento. O motor é a OpenAI
(Responses API).

## Decisões do Heitor (2026-10-08)

- **Toda gravação passa por um cartão** com Confirmar/Cancelar. Consulta é livre.
  **O cartão é a confirmação** (A32 da 16ª): o prompt não pede "responda
  Confirmar" antes nem repete no texto os dados que o cartão mostra; depois
  do cartão, a frase é dada: "Confira e confirme no cartão abaixo." (A30 da
  19ª: "uma frase curta" virou "confirme o cartão no sistema"). O
  cartão "Agendar atendimento" diz o aviso que chega DE FATO à cliente
  (`avisoDoAgendarParaACliente`, A33): "Ela recebe o aviso “Horário marcado”
  no app", ou "Nada é enviado a ela agora" — sem acesso ao app, ou sem o app
  da cliente no plano. Os cartões de remarcar e de cancelar dizem o mesmo,
  com o aviso deles ("Agendamento remarcado", "Agendamento cancelado";
  `avisoDaAgendaParaACliente`, A23 da 17ª). O cadastro termina em "Ficha de X
  criada" (A34). O painel vazio oferece, em PRIMEIRO, "Continuar a conversa
  anterior: <título>" (A31 da 16ª; acima do "Olá" desde o A25 da 17ª) — e,
  havendo uma conversa com cartão esperando o Confirmar (no prazo), ela vem
  no lugar da mais recente: "Continuar a conversa com um cartão a confirmar:
  <título>" (A28 da 19ª: recarregada a página, o "Continuar" levava à mais
  nova e o pedido era feito de novo; `listarConversas` marca
  `cartaoPendente`, `lib/copilot/continuar.ts`). **O painel vazio ABRE
  sozinho na conversa com o cartão a confirmar** (A25 da 20ª: sem ver a
  linha, um pedido novo deixou o cartão para trás) — uma vez por conversa, e
  não depois de "Nova conversa" (`conversaParaAbrirSozinha`).
  **O "Olá" e os atalhos saem da permissão** (A28 da 26ª, 2026-11-18): o
  texto ("Posso consultar a agenda, achar um cliente…") e os botões de atalho
  vêm das MESMAS ferramentas que o modelo recebe (`ferramentasDoCargo`), por
  `aberturaDoCopilot` (`lib/copilot/abertura.ts`, puro) e a action
  `aberturaDoCopilotNaTela`; "Toda gravação passa pela sua confirmação." só
  com ferramenta de escrita, e "Quanto faturamos este mês?" só com a aba
  Visão geral dos Relatórios. Era fixo ("cadastrar ou agendar", o atalho do
  faturamento) para todos. Prova: `tests/copilot-dinheiro-pelas-abas.test.ts`,
  `e2e/copilot-cargo.spec.ts` (contra o build).
- **Nada clínico vai à OpenAI**: nenhuma ferramenta lê prontuário, evolução,
  anamnese, foto clínica ou anotação clínica de plano. O prompt manda dizer que
  isso fica na tela, e o painel avisa para não mandar.
- **O máximo de módulos** já na primeira entrega: agenda, clientes, catálogo,
  indicadores, financeiro, estoque e CRM — lendo e gravando.
- **Cota mensal por rede**, no plano (`cotas.copilot`, tokens/mês; null = sem
  limite), editável no sistema; o consumo aparece no sistema e na Assinatura.

## Como é feito

- **O relógio é o do portal** (F62b, 2026-11-11): o "Agora" do prompt, o
  "hoje" e as horas que ele lê e grava saem de `fusoDoPortal` (a unidade do
  endereço; no /admin, o fuso da rede) e, por registro, de `fusoDe(c,
  unidade)` — `lib/copilot/ferramentas/datas.ts` (`janelaDoDia`, `instanteDe`,
  `quandoLegivel`, `agoraLegivel`, que diz o fuso). O mês da cobrança fica em
  Brasília. Prova: `tests/fuso-da-unidade.test.ts`.
- **Liberação** (`lib/copilot/disponivel.ts`): membro da equipe, o Copilot NO
  PLANO (o efetivo: plano ou adicional) — **sem plano não libera**, ao contrário
  das outras funcionalidades: ele custa por uso —, o Copilot NO CARGO, a
  `OPENAI_API_KEY` configurada e fora da sessão de suporte. A rota, as actions
  e o layout conferem o mesmo.
- **Fora do plano, ele aparece EXPLICADO à Admin da rede** (A51 da 6ª
  simulação, 2026-11-04; princípio 3: no teste grátis — "tudo, menos o
  Copilot", J-7 — ele sumia calado). Só à Admin da rede, pelo cargo gravado
  (`ctx.isNetworkAdmin`, `copilotForaDoPlanoNaTela`): contratar é
  configuração da rede toda (o Heitor, 18/11: "Configuração da rede toda só
  pela conta admin"; era quem tinha "A rede inteira" com Configurações em
  Gerenciar — catálogo de 24/11). O mesmo lugar do botão, sem o
  preenchimento de marca ("Copilot: fora do plano"), abre só o aviso — "O
  Copilot não está no seu plano de teste." (`redeEmTeste`, lido na hora) ou
  "O Copilot não faz parte do plano da rede." — e o link para
  Configurações → Assinatura (`CopilotForaDoPlano`). Nada se libera: a rota
  segue 403. A equipe não ganha um botão que não usa. Prova:
  `e2e/copilot-fora-do-plano.spec.ts` (roda no `next dev`: não precisa da
  OpenAI) e o caso "rede sem o Copilot no plano" de `e2e/copilot-esqueleto.spec.ts`.
- **O cargo** (o módulo `copilot` da matriz, pedido do Heitor de 2026-10-08):
  Sem acesso ou **Ver**, que LIGA a ferramenta — consultar e agir. Cada
  consulta e cada gravação pedem só a permissão da AÇÃO, como na tela
  (agendar, a Agenda em Gerenciar; lançar, o Financeiro em Gerenciar): o
  Copilot é o canal, não o passo (o Heitor, 2026-11-23: "cada passo pertence
  a UM módulo, e nenhuma ação pede dois"; lida para o Copilot na revisão de
  24/11, `docs/catalogo/copilot.md` Q02 — até ali, gravar pedia também o
  Copilot em Gerenciar). O módulo só oferece Sem acesso e Ver
  (`MODULE_LEVELS`; o Gerenciar já gravado vale Ver — `nivelAceito`,
  `ferramentaLiberada`, `lib/copilot/executor.ts`). O plano diz se a REDE
  tem; o cargo, QUEM usa. Prova: `tests/copilot-executor.test.ts`,
  `e2e/copilot-cargo.spec.ts`.
- **A rota `POST /api/copilot`** (SSE): sessão (401), Origin da clínica (403),
  plano, suporte, configuração, cota (429). Laço "modelo → ferramentas →
  modelo" de até 8 voltas (4 com anexo). Grava a fala, as chamadas (sem o id do
  item: com `store:false` a API recusa um `function_call` com id sem o
  raciocínio daquela vez) e a resposta; registra o uso.
- **O executor** (`lib/copilot/executor.ts`) é a trava ÚNICA:
  - o modelo só RECEBE as ferramentas que o cargo pode usar (`modulo`/`nivel`,
    `recurso`, `pode`);
  - a chamada é conferida de novo e validada por zod; rede e unidade vêm do
    `ctx`, nunca do modelo;
  - gravação PREPARA (`copilot_acoes`, 15 min) e só o Confirmar grava: reivindica
    a linha (pendente → executando numa escrita só), prepara DE NOVO e só grava
    se o resumo E o payload forem os mesmos do cartão (`canonico` — o jsonb
    reordena as chaves);
  - o Copilot age com o nome "Fulana (via Copilot)" nos eventos e no histórico;
  - **na Auditoria, a gravação é de quem pediu, "pelo Copilot"** (CP1,
    2026-11-16): o `efetivarAcao` roda `ferramenta.efetivar` dentro de
    `comViaDoCopilot` (`packages/nucleo/src/lib/supabase/via-da-escrita.ts`,
    um `AsyncLocalStorage`), e toda ESCRITA do cliente de serviço ali dentro —
    também a dos núcleos que abrem o próprio `createAdminClient()` — leva
    `x-bellaris-via: copilot`. O gatilho `private.auditar` (migration
    `20261116300001`) só lê o cabeçalho com a chave de SERVIÇO (pela sessão
    não vale, como o `x-bellaris-ator`) e só o valor `copilot`: grava
    `via = 'copilot'` e `ator_nome` "Fulana (pelo Copilot)", com o
    `ator_user_id` dela. O preparar e as leituras não levam marca. Prova:
    `e2e/copilot-auditoria-cp1.spec.ts`.
- **As ferramentas** (`lib/copilot/ferramentas/`) chamam os MESMOS núcleos da
  tela: `createAppointmentCore`, `remarcarCore`/`cancelarCore`/`confirmarCore`
  (`lib/appointments/alteracoes.ts`), `garantirClienteRapido`, `atualizarClienteCore`
  (`lib/clients/atualizar.ts`), `lancarCore`/
  `marcarPagoCore` (`lib/financeiro/lancamento.ts`), `estoque_entrada`/
  `estoque_ajuste_em` (`lib/estoque/movimentos.ts`; o cartão do ajuste diz o
  saldo também na unidade de consumo, D3 da 7ª), `criarOportunidadeCore`/
  `moverEtapaCore` (`lib/crm/oportunidade.ts`), `checkinCore`, o acesso ao app
  (`lib/clients/acesso.ts`), `lib/metrics`.
  **E pedem a MESMA permissão da action da tela** (ATD-A02/COP-01 da
  varredura de 18/11; a matriz trava em `tests/varredura-atendimento.test.ts`):
  `confirmar_agendamento` pede a Agenda em Gerenciar (estava em Ver);
  `cancelar_agendamento` segue `recusaDoCancelar` — o agendado é da Agenda em
  Gerenciar, o Em atendimento é DESISTIR, do Atendimento em Gerenciar (UM2),
  e o cartão diz "Desistir do atendimento" e que a sessão paga conta como
  usada; `marcar_pago` segue `podeDarBaixa` (o PDV em Gerenciar, ou o
  Financeiro em Gerenciar — CX2). Sem o "só os meus" (SM5, 2026-11-23), nenhuma
  ferramenta recorta por dono; a permissão pode ser mais estreita no Copilot,
  nunca mais larga.
- **A unidade de que a ferramenta fala** (`resolverUnidade`, `comum.ts`):
  quem é da rede escolhe qualquer uma; quem tem unidades (EQ1a, uma ou
  várias) escolhe entre AS DELA, e sem escolha fica na unidade em que está (a
  da página — a rota ajusta o `ctx.branchId`). Pedir uma de fora é recusado
  com o motivo ("fora do seu alcance. As suas: …") — até o CP1 a ferramenta
  ficava calada na da página. O prompt diz todas as unidades dela. Prova:
  `e2e/copilot-cp1-ferramentas.spec.ts`.
  **A LEITURA, sem unidade no pedido, é em todas as unidades da pessoa** (D4
  da 18ª: a pessoa de Derby e Casa Forte, na tela de Derby, não achava o
  agendamento de Casa Forte): `agendamentos`, `lancamentos` e `estoque`
  passam `paraLer` ao `resolverUnidade`, `idsDasUnidades` dá as ativas que
  ela alcança (`ctx.unidades`) e a resposta diz onde procurou (`procurouEm`).
  Gravar (o agendar e as outras) continua na unidade da tela. Prova:
  `tests/copilot-defeitos-da-18.test.ts`.
- **O PDV** (CP1): vender (pacote, pré-pago, produto, crédito interno) e
  receber a comanda são do PDV — o Copilot não vende nem recebe comanda, e o
  prompt manda indicar o PDV — **só a quem tem o PDV** (A29 da 26ª,
  2026-11-18): sem ele, o prompt diz que a permissão dela não recebe nem vende
  e que quem tem o PDV em Gerenciar faz (PV-04), sem dar o link; e
  quem não vê dinheiro (`can(financial, VIEW)` ou a aba Financeiro dos
  Relatórios) não é mandado ao Dashboard, aos Relatórios nem ao Financeiro
  para ver valor (`instrucoesDoCopilot`, `lib/copilot/prompt.ts`; prova
  `tests/copilot-dinheiro-pelas-abas.test.ts`). O `marcar_pago` é a baixa do Financeiro
  (`markTransactionPaid`, `podeDarBaixa` — CX2; a frase do prompt que o oferece
  segue a mesma régua, não o PDV — catálogo de 24/11), com o boleto na despesa, como
  a tela — só no lançamento AVULSO. **A parcela do crediário e o a receber de
  uma venda ou de um atendimento não**: o Copilot não recebe (17/11), e eles
  se recebem no PDV (CR-06). O preparo recusa o que tem chave de venda
  (`CHAVES_DA_VENDA`), atendimento ou parcela (`recebimentoDoPdv`,
  `ferramentas/gestao-escrita.ts`) e devolve o link do PDV da cliente, na
  unidade do lançamento ("Receber no PDV"). Era a VF2-05 da varredura de
  18/11 (decisão do Claude, contra a regra de 17/11; corrigida no catálogo de
  24/11). Prova: `tests/copilot-pdv-comissoes-e-vistas.test.ts`. As vendas
  dos indicadores levam o número da comanda.
  **As leituras de venda** (as pendências das simulações 15ª–23ª,
  2026-11-17), SÓ LEITURA (`lib/copilot/ferramentas/vendas.ts`):
  `comandas_abertas` (as abertas do PDV, `comandasDoPdv`, nas unidades da
  pessoa ou na pedida, e de um cliente se pedido; de quem recebe ou vê o
  Fechamento do dia), `plano` (os planos de tratamento de um cliente: a
  situação, as sessões feitas, agendadas e a agendar — a sessão do atendimento
  iniciado e cancelado conta como feita; o Atendimento em Ver, como a tela
  — era a Agenda até 2026-11-18 —, e a funcionalidade
  no plano) e, na `cliente`, os
  planos e o em aberto de cada pacote e pré-pago (`metrics_em_aberto_das_vendas`).
  **O valor só a quem vê o valor** (`mostraOValor`: quem recebe ou vê o
  Fechamento). Vender, receber e aceitar plano pelo Copilot NÃO existe — decisão
  do Heitor (17–18/11, na conversa da 24ª simulação; até aqui só estava na
  memória do Claude, e o DEVLOG passa a registrá-la): o Copilot só lê e manda ao PDV; o aceite do plano
  fica na tela do atendimento e no app da cliente. Nada clínico: a anotação do plano não sai. Prova:
  `tests/pendencias-area-3.test.ts`.
- **Anexos** (`lib/copilot/anexos.ts`) são lidos no pedido e DESCARTADOS (a
  conversa guarda nome e tipo). Tipo pelo conteúdo. Imagem ≤ 5 MB (a foto
  grande é reduzida no navegador), PDF como arquivo, txt/csv como texto, voz
  transcrita (`OPENAI_MODELO_DE_VOZ`). docx/xlsx viram texto no servidor
  (`lib/copilot/documentos.ts`, um leitor de zip sem biblioteca); doc/xls
  antigos, não.
- **Texto do modelo** vira blocos React (`lib/copilot/texto.ts`), nunca HTML;
  link só para TELA interna (não `/api`, `/auth`…), sem prefetch. O link sem
  fechamento no fim (`[x](/y`, a resposta cortada ou ainda chegando) fica só
  o texto, sem o pedaço `](/…` (D3 da 19ª). O caminho SOLTO
  ("(/unidade/agenda/<uuid>)", inteiro ou cortado com "…"; e, desde o A32 da
  22ª, também sem id: "dar baixa: /unidade/pdv") sai do texto
  (`semCaminhoCru`, A27 da 21ª), com os dois-pontos que só o apresentavam: o
  link vai com o nome, ou não vai. "19/11", "1/5" e "e/ou" ficam.
- **A lista do cartão não se repete no texto** (A33 da 22ª; princípio 7): a
  consulta que devolve um cartão de links com dois itens ou mais leva ao
  modelo `cartaoNaTela` (`executor.ts`), e o prompt manda dizer o total, o
  período e o que pede atenção, sem a lista item por item.
- **A resposta cortada diz que foi cortada** (D3 da 19ª; princípio 3): além
  do `response.incomplete`, o stream que acaba sem `response.completed` (o
  tempo, a conexão) acrescenta "(A resposta foi cortada. Peça a continuação,
  se precisar.)" (`perguntarAoModelo`). Prova: `tests/copilot-defeitos-da-19.test.ts`.
  Vale também na volta que chamou ferramenta e já escreveu texto (D5 da 21ª:
  o texto parava no meio, sem aviso); só a volta que é só chamada segue calada.
- **Dados**: `copilot_conversas`, `copilot_mensagens`, `copilot_acoes`,
  `copilot_uso_mensal` — RLS sem política (só o servidor). Retenção
  (`/api/cron/copilot-retencao`): a conversa parada há 90 dias, e a mensagem
  e a ação de mais de 90 dias numa conversa em uso.
- **A cota conta TUDO que a OpenAI cobra**: cada volta (a completa pelo
  `usage`; a que falha ou cai no meio depois de aceita, por `estimarTokens`) e
  a transcrição da voz (`aoGastar`, `lib/copilot/openai.ts`). Pedido recusado
  antes (rede, 4xx/5xx) não conta.
- **O custo estimado** (2026-10-08): cada chamada calcula o custo em dólar
  pelo preço do modelo, de entrada e de saída (`custoEmDolar`,
  `packages/nucleo/src/lib/planos/custo-do-copilot.ts`, a tabela da página de
  preços da OpenAI) e soma em `copilot_uso_mensal.custo_usd` com os tokens
  (`copilot_registrar_uso`). Modelo fora da tabela: custo nulo ("—"), nunca
  um número inventado. O sistema mostra tudo em **Copilot** (`/copilot`): o
  mês por rede, a cota, o custo (US$ e R$ pela `COTACAO_DOLAR`) e os últimos
  meses.
- **O custo REAL** (2026-10-08): com `OPENAI_ADMIN_KEY` no serviço Sistema (a
  chave de administração da organização, só leitura), a aba lê a Costs API
  da OpenAI (`custoRealDaOpenai`, `packages/nucleo/src/lib/planos/custo-real-da-openai.ts`,
  guardada 1 h; o erro não é guardado) e mostra o real no destaque, com o
  estimado e a diferença. A OpenAI não sabe as redes: o real é RATEADO na
  proporção do custo estimado de cada uma (`ratearCusto`; sem estimado, pelos
  tokens ao preço médio), sobre todas as que usaram, as de teste também.
  ⚠️ A admin key é da ORGANIZAÇÃO: sem `OPENAI_PROJECT_ID` (o `proj_…` do
  projeto do BellarisOS), o real soma os outros projetos da conta — a tela avisa.
- **A par do sistema** (2026-10-16, pedido do Heitor: "o copilot a par de
  todas as mudanças"):
  - **As telas** que a pessoa abre vão nas instruções como links
    (`telasDaPessoa`, `lib/copilot/prompt.ts`), tiradas de `paginasDaBusca`
    — o menu e as abas de Configurações, com a régua de cargo e plano. Tela
    ou aba nova entra SOZINHA; é por ela que o Copilot indica "isso é na tela
    X" para o que não faz por ferramenta (importar, criar tag, comissão,
    conectar WhatsApp, colher assinatura).
  - **Tags** (o vocabulário da rede): a lista por tag é sem caixa
    (`copilot_clientes_da_tag`) e a tag que não existe devolve o vocabulário;
    `marcar_tags` marca só o que existe no vocabulário, com o nome dele, pelo
    núcleo da ficha (`atualizarClienteCore`). Criar tag é da tela.
  - **As listas de clientes são da rede** (Bloco Tags, 2026-11-14: não
    existe tag de unidade): "novos", "tag" e "aniversariantes" não recortam
    por unidade (`copilot_clientes_da_tag` perdeu o `p_tag_unidade`), a ficha
    não separa "unidades" das tags, e criar oportunidade não põe tag. O
    "sem visita" é o "Reativar clientes" do dashboard — sempre o da rede,
    também com a unidade pedida (24ª simulação: a cliente é da rede)
    (`getClientesParaReativarDoRecorte`, r3-f13-10: "os dois têm de dar a
    mesma resposta").
  - **Os "clientes novos" são os do dashboard** (sobra da F49, 10ª simulação,
    2026-11-10): `coalesce(cliente_desde, created_at)`, a regra de
    `indicadores.md` — a importada de 2021, cadastrada hoje, não é nova. Era o
    `created_at`. O filtro é `filtroDosClientesNovos` (`lib/copilot/clientes-novos.ts`),
    e o detalhe diz o "desde" de `diaDeClienteDesde`. Prova:
    `tests/copilot-clientes-novos.test.ts`.
  - **Oportunidade**: `criar_oportunidade` aceita valor e responsável (este só
    com `podeTrocarResponsavel`, e como a tela: cria e troca em seguida);
    `trocar_responsavel` pelo `trocarResponsavelCore`; a leitura diz se já é
    cliente. **`mover_etapa` pergunta das automações** (A35 da 22ª, o Heitor:
    "se mover os cards manualmente dispararia automacoes, perguntar se deseja
    disparar ou nao"; no Copilot desde a auditoria das regras, 2026-11-18):
    com automação que o movimento dispararia (a régua da tela,
    `automacoesQueOMovimentoDispara`), o cartão diz "Mover dispara a automação
    “X”. Disparar?" e dá "Disparar" ou "Não disparar" (o "Não" move com o
    `semDespachar`). Prova: `tests/copilot-mover-pergunta-automacoes.test.ts`.
  - **Documentos** (`documentos`): a situação de cada termo e contrato, pelas
    funções da tela (`lib/metrics/documentos`) — sem o texto nem o motivo
    livre da dispensa.
  - **A cobrança da Meta** (`cobranca_do_whatsapp`): o mês de cada número
    oficial (`getCobrancaDoWhatsapp`), com a trava da tela (Configurações em
    Gerenciar).
  - **A bandeira do cartão** (r3-f13-01): `lancar` (receita paga) e
    `marcar_pago` aceitam a bandeira pelo nome ("Elo", "master"), só no
    cartão; o cartão diz "Bandeira" e o núcleo é o da tela. E as VEZES no
    crédito (F17-5, o Heitor: "pode"): `vezes` em `lancar` (só a receita
    paga) e em `marcar_pago` — "no crédito em 3x" → 3x, a operadora deposita
    em 3 —, com a trava do limite da clínica no PREPARO
    (`recusaDasVezesDaBaixa`, a mesma da baixa da tela). Prova: o caso F17-5
    de `e2e/copilot-gestao.spec.ts` (contra o build).
  - **A maquininha** (C75 da F67): `lancar` (receita paga no cartão) e
    `marcar_pago` aceitam `maquininha` pelo nome ("Stone"). Com uma só ativa,
    nada a perguntar; com mais de uma e sem o nome, a ferramenta PERGUNTA
    ("Em qual maquininha passou o cartão? Stone, Cielo.") — nunca a primeira
    calada (princípio 3). Nome que bate em mais de uma pergunta qual; fora do
    cartão, recusa. E o `marcar_pago` do lançamento sem meio exige a forma
    (C34), como a baixa da tela.
  - **A ficha da cliente não fala de pontos com o programa desligado** (C5,
    a parte da fidelidade): `pontosDeFidelidade` só vai quando a rede tem o
    programa ligado (`fidelidade.md`: nenhum sinal de pontos). Prova:
    `e2e/copilot-leituras.spec.ts` (contra o build).
- **Sem o "só os meus" no Copilot** (SM5, 2026-11-23; era o "'Só os meus'
  vale também no Copilot" de 28/10): a ferramenta `indicadores` não recorta
  por dono — fala pelos módulos e pelas abas de Relatórios da pessoa, com os
  números de todos nas unidades ao alcance (`getCoreDosModulos`,
  `getRelatorioDosModulos` sem recorte). Não é a vista pessoal dos
  dashboards (`recortePessoal`, `indicadores.md`). As comissões (as do
  núcleo e as por profissional) só vão a quem tem o Financeiro em Ver.
- **A vista pessoal no Copilot** (SM2, CLAUDE.md §11; decidida na revisão de
  24/11, `docs/catalogo/copilot.md` Q03, pela fala de 13/11: "copilot
  acompanha tudo"): a quem `vistaPessoal` devolve o id, duas leituras — só
  leitura, só as DELA, pelo id dela e nunca por um nome do pedido.
  `minha_agenda` (`ferramentas/agenda.ts`; quem atende e não tem a Agenda): os
  agendamentos dela nas unidades ao alcance, sem datas de hoje a 30 dias.
  `minhas_comissoes` (`ferramentas/comissoes.ts`; sem o Financeiro, com as
  Comissões no plano): os números da tela "Minhas comissões" — o resumo do
  banco (`resumoDasComissoes`) somado em `lib/metrics`, no período de
  fechamento da rede (o atual ou um anterior), nas unidades de leitura ao
  alcance dela. Com a Agenda ou o Financeiro, a vista não vem (o módulo já
  mostra tudo). O prompt e o "Olá" dizem as duas a quem as tem. Prova:
  `tests/copilot-executor.test.ts`, `tests/copilot-pdv-comissoes-e-vistas.test.ts`,
  `e2e/copilot-cargo.spec.ts`.
- **`indicadores` lê pelas MESMAS funções da tela** (C5 da F68, 2026-11-12):
  o "a receber" é o do Financeiro (`getEmAberto`, pelo vencimento, até o FIM
  do período — era o pendente do núcleo até agora), a aba agenda vai até o fim do período como a
  aba Agenda, e o comercial é o painel da aba Comercial (`painelComercial`,
  `lib/metrics/painel-comercial.ts`: as etapas do funil padrão, a conversão
  somando os funis ATIVOS, o comparecimento, os motivos de perda, a conversão
  por origem e por responsável). Era só o funil padrão, até agora. Prova:
  `tests/indicadores-f68.test.ts` ("C5").
- **O dinheiro de Relatórios segue as ABAS do cargo, também no Copilot**
  (decisão do Heitor, 2026-11-01: "concordo"). `indicadores` é a única
  ferramenta com o dinheiro dos Relatórios e recusa a aba que o cargo não tem
  (`podeVerRelatorio`) antes de ler qualquer número; com a aba, lê o
  dinheiro da aba, como a tela (SM4). Os `lancamentos` seguem o
  módulo Financeiro (a tela do Financeiro). Prova:
  `tests/copilot-dinheiro-pelas-abas.test.ts`.
  **Financeiro é uma coisa, vendas é outra** (o Heitor, 2026-11-23): a aba
  `financeiro` só vale com o Financeiro em Ver — marcada sem ele, a recusa diz
  "pede o Financeiro em Ver" e as "Abas liberadas" só listam as que valem
  (`abasQueValem`). Na `overview` sem o Financeiro (`veOCaixaNosRelatorios`)
  não saem o faturamento (e o anterior), o a receber, as despesas, o insumo
  consumido, as taxas da maquininha, as comissões lançadas, o lucro nem a
  margem, e nem se leem; ficam os atendimentos, o aproveitamento, o ticket,
  os clientes que pagaram, os novos clientes e a receita de serviços, e o
  `semOFinanceiro` diz ao modelo por quê. Prova:
  `tests/relatorios-financeiro-pede-o-financeiro.test.ts`.
- **O cartão pode trazer ESCOLHAS no lugar do "Confirmar"** (r2-cli-01, o
  Heitor em 2026-11-03: "no Copilot, o cartão de confirmação mostra a mesma
  pergunta"): `ResumoDaAcao.escolhas` (`{ chave, rotulo }[]`) vira um botão por
  opção (o "Cancelar" fica), e a escolhida vai ao `efetivar(c, payload,
  escolha)` — o executor recusa confirmar sem uma das opções do cartão. É o
  "Já existe a ficha de X" de `cadastrar_cliente` e do `agendar` com cliente
  novo: "Cadastrar mesmo assim" e "Unificar com a ficha de X" (o mesmo
  `garantirClienteRapido` com `jaExiste`, `crm-inbox.md`). Prova: o caso
  r2-cli-01 de `e2e/copilot-gravacoes.spec.ts` (contra o build). Sem
  Clientes em Gerenciar (C66, F65), o `agendar` troca o "Unificar"/"Reativar"
  por "Agendar para a ficha de X" (`usar`: a ficha como está), e a ficha
  ARQUIVADA só oferece cadastrar mesmo assim (`escolhasDaFichaQueJaExiste`
  pelo `podeUnificar`).
- **O `agendar` segue a janela "+ Agendar"** (C5, F65): o "Incluído" — o que
  a cliente já tem do MESMO procedimento (a sessão livre do plano, o pacote,
  o pré-pago; `pagoParaAgendar`, a escolha do app) — entra sozinho, o cartão
  diz "Incluído: …" no lugar do valor (A3 da 25ª: era "Já pago", também com
  parcelas em aberto) e a sessão do plano usa a duração dela;
  o crédito que outro agendamento pegou entre o cartão e o Confirmar vira
  avulso, e a mensagem diz. A profissional fora de "Quem realiza" é AVISADA
  no cartão, sem barrar (princípio 2). O procedimento que a unidade não faz e
  a profissional que não atende nela são recusados no preparo
  (`conferirPecasDoAgendamento`). Prova: `e2e/copilot-agendar-ja-pago.spec.ts`
  (contra a OpenAI falsa).
  **A sala pedida vai na sala** (A1 da 27ª, decisão do Claude pelo princípio 3:
  "agende na Sala 1" ia para a observação, e o agendamento ficava sem sala):
  `agendar` aceita `sala` (nome ou id, `resolverSala`, `comum.ts`: a ativa da
  unidade, o nome exato antes do parecido), conferida com as outras peças
  (`conferirPecasDoAgendamento`: a sala serve ao procedimento) e livre no
  horário; o cartão diz "Sala". Sem sala no pedido, nenhuma — como era. Prova:
  `tests/copilot-sala-abas-e-comanda.test.ts`.
- **O estoque segue as janelas** (C5, F66): a leitura `estoque` diz o saldo
  da prateleira ("1 frasco fechado + 1 aberto com 50 UI",
  `saldoNaPrateleira`), o mínimo na mesma régua (`minimoNaTela`) e a medida
  no plural — nunca o `current_stock`, que conta a embalagem aberta inteira.
  `entrada_de_estoque` leva fornecedor e marca (em texto: o banco os põe nas
  listas da rede, C76 e E14 do Bloco Estoque) e nota fiscal; o cartão diz "Não gera despesa", "+2 frascos (200
  UI)" e avisa a validade que já passou, sem recusar; o resultado diz o
  "Saldo agora" da prateleira (`saldoAgoraEmTexto`, o mesmo da Entrada).
  `ajuste_de_estoque`: o cartão diz para onde vai a diferença (a menos é
  perda "Inventário"; a mais, um lote novo) e avisa a variação de mais da
  metade do saldo. Prova: `e2e/copilot-estoque-f66.spec.ts` (contra a OpenAI
  falsa).
- **O cadastro sem CPF** (sobra da F29, decisão 1 do Heitor na 7ª simulação):
  `cadastrar_cliente` aceita `passaporte` ou `rne` no lugar do CPF — um
  documento só, pela regra do cadastro da tela (`documentoDaFicha`, via
  `documentoDoCadastroDoCopilot`), com a unicidade na rede
  (`documentoEstrangeiroRepetido`) — e, com `criar_acesso`, a senha inicial é
  o número dele (provisória, como a do CPF; o mesmo `darAcessoAoCliente`). O
  `criar_acesso_ao_app` já lia o documento da ficha. Prova:
  `tests/copilot-documento-do-cadastro.test.ts` e o caso "PASSAPORTE" de
  `e2e/copilot-extras.spec.ts` (contra o build).
- **O bloqueio pontual da agenda** (decisão 3 da 7ª simulação, 2026-11-05):
  os livres (`horarios_livres`, por `computeAvailableSlots`) já não trazem o
  horário bloqueado. Pedido num horário bloqueado, `agendar`/`remarcar` AVISAM
  no cartão e deixam confirmar, como a agenda da equipe ("…está com o horário
  bloqueado das 12:00 às 13:00 (Almoço). O encaixe é permitido: confirme só se
  for isso mesmo.", `avisoDoBloqueado`, `lib/copilot/ferramentas/agenda-escrita.ts`).
  Recusavam ("o encaixe num horário bloqueado é pela agenda"); virou aviso na
  auditoria das regras (decisão do Claude pelo princípio 2, 2026-11-18: na
  agenda o bloqueio só avisa, e o Copilot não é mais duro que ela). Bloquear e
  desfazer é da tela (Agenda → "Bloquear horário").
- **A profissional é de quem ATENDE na unidade** (decisão 2 do Heitor sobre a
  8ª simulação, 2026-11-06: o "atende" vira um checklist das unidades):
  `resolverProfissional` (`lib/copilot/ferramentas/comum.ts`), com a unidade
  dada, procura entre quem a tem marcada no "Atende"
  (`filtroDeQuemAtendeNaUnidade`) — era "da unidade ou da rede". A Talita
  marcada no Batel é achada lá; quem é da rede e não está marcada, não.
- **"Os agendamentos da Fulana" procura nos dois lados** (A27 da 19ª): a
  Tereza era cliente, e `agendamentos` a procurou como profissional. O nome
  dado como profissional, sem cliente no pedido, se procura também entre as
  clientes (`resolverCliente`): de um lado só, vale ele, e a resposta diz como
  entendeu (`entendido`); dos dois, a ferramenta pergunta qual. O filtro
  `cliente` aceita nome, telefone ou id. O cartão diz o período em dd/mm
  ("Agenda · 16/11 a 16/12/2026", `periodoLegivel` — A29 da 19ª).
  **Com a cliente e sem datas, de hoje em diante** (D2 da 20ª; princípio 3:
  "Encontrei 1 agendamento da Neusa" era só o de hoje): `agendamentos` lê de
  hoje a 30 dias à frente; sem a cliente, só hoje. O `periodo` volta legível
  ("hoje, 16/11", "de 16/11 a 16/12/2026"), e a descrição e o prompt mandam
  dizê-lo na resposta. Prova: `tests/copilot-atritos-da-20.test.ts`.
  **O mesmo com quem atende** (D2 da 22ª: "os agendamentos do Dr. Otávio em
  aberto" leu só hoje): com a cliente OU quem atende (ativo ou desativado),
  sem datas, de hoje a 30 dias; sem nenhum dos dois, só hoje. **"Em aberto"**
  é `emAberto: true` — agendado, confirmado, chegou e em atendimento, sem o
  concluído, o cancelado e a falta (o padrão segue "todos menos cancelados").
  Prova: `tests/copilot-achados-da-22.test.ts`.
  **O item do cartão diz o dia e a unidade quando precisa** (A32 da 23ª;
  princípio 3: "10:00 · Bianca Lopes" numa lista de 17 a 19/11 nas duas
  unidades): o dia vai quando o período tem mais de um ("qua., 18/11 às
  10:00 · Bianca Lopes"); a unidade, no detalhe, quando a pessoa alcança mais
  de uma. Prova: `tests/copilot-atritos-da-23.test.ts`.
- **O "Encontrado para…" diz o recorte dos agendamentos** (A33 da 23ª): a
  busca recorta pela unidade da tela (`busca.md`), e a quem alcança mais de
  uma o título diz "· agendamentos só de Centro" e o modelo recebe o
  `recorte` (para os das outras, `agendamentos`). Prova: idem.
- **O período sem data é o atual, sem perguntar** (A26 da 20ª; princípio 7:
  "Resumo da semana" pedia "Confirmo: a semana atual?"): o prompt e a
  descrição de `indicadores` dizem que "a semana" é `week` e "o mês" é
  `month`, e a resposta diz o período que leu.
- **"Repassar" um atendimento é trocar quem atende** (A27 da 20ª; a palavra
  da Equipe, "Repassou"): o prompt e a descrição de `remarcar` dizem —
  mesma data e hora, o profissional novo. O cartão dessa troca é "Trocar
  quem atende", com "Quem atende: Dr. Paulo → Tânia" e a unidade, sem De/Para;
  o resultado diz "Agora quem atende é Tânia." (A28 da 21ª). O mesmo horário
  com a mesma pessoa é recusado no preparo ("Nada muda").
- **Agendamentos de quem teve o acesso desativado se listam** (A31 da 21ª;
  princípio 3): `agendamentos` acha o nome também entre os membros
  desativados (só para LER — agendar e remarcar seguem com quem atende), e a
  lista diz "(acesso desativado)" no nome e avisa que é preciso trocar quem
  atende em cada um. Sem perguntar antes.
- **A despesa e a receita do período são de `indicadores`** (D1 da 21ª;
  princípio 3: o Copilot somou o estorno como despesa e contradisse a tela).
  `lancamentos` marca o contra-lançamento do estorno como `tipo: "estorno"`
  e o tira do filtro `despesa`/`receita`; a descrição e o prompt mandam usar
  `indicadores` para totais e nunca somar as linhas.
  **Por unidade e por categoria, a aba `financeiro`** (D1 da 24ª; princípio 3:
  "a despesa de cada unidade" saiu com a RECEITA — R$ 1.100 num dia de
  R$ 234,42 —, porque a chave era `porUnidade` e só havia a receita): cada
  chave diz o que é — `receitaPorUnidade`, `receitaPorFormaDePagamento`,
  `receitaPorCategoria` e `despesaPorUnidade` (`getByBranch`, o "Por unidade"
  do Financeiro da rede), `despesaPorCategoria` (`getComposicaoFinanceira`, sem
  o estorno), com os totais do núcleo. Prova: `tests/copilot-atritos-da-24.test.ts`.
- **As taxas da agenda vão prontas, com o nome** (A41 da 24ª; princípio 4: o
  "comparecimento" era uma conta do Copilot, 2 de 6 com os futuros): a aba
  `agenda` traz a taxa de conclusão (até o fim do período, a dos Relatórios) e
  o aproveitamento (até agora, o do dashboard), cada um com o texto de
  `DEFINICOES`, e por unidade; a `overview`, o aproveitamento. O comparecimento
  é o dos primeiros atendimentos (aba `comercial`). O prompt manda citar a que
  existe e nunca calcular uma taxa. Prova: idem.
- **A categoria que a pessoa não disse vem SUGERIDA** (A40 da 24ª; princípio 3:
  "Fornecedores" para a lavanderia, gravada calada): sem `categoriaDaPessoa`, o
  cartão do `lancar` troca a linha "Categoria" por uma lista ("Categoria
  (sugerida)", `ResumoDaAcao.escolhaEmLista`: as `escolhas` num select, a
  sugerida primeiro, com um "Confirmar") e avisa "A categoria foi sugerida pelo
  Copilot: confira ou troque antes de confirmar."; o `efetivar` grava a
  escolhida, se for da lista do tipo. Com a categoria dita pela pessoa, o
  cartão é o de sempre. Prova: idem.
- **O cartão da despesa paga diz "Pago em"** (A29 da 21ª): o dia (o de hoje,
  no fuso da unidade) vai no cartão e no payload, e é o que se grava.
- **"Receba a massagem da Bruna"** (A30 da 21ª): o Copilot não recebe; diz
  que o recebimento é no PDV, na comanda do atendimento, com o link, sem
  perguntar o caminho. **O link é o da comanda dela** (A3 da 27ª, decisão do
  Claude pelo princípio 3: o Copilot ensinou "Nova comanda"): o prompt manda
  achá-la por `comandas_abertas` e dar o link dela — sem comanda aberta, o do
  PDV —, e nunca mandar abrir comanda nova nem venda para o atendimento (a
  comanda dele já existe no PDV).
- **A aba dos Relatórios pelo nome da tela** (A2 da 27ª; princípio 7:
  "overview" saiu na resposta): a descrição de `indicadores` dá o nome de cada
  aba ("overview (Visão geral: …)"), a leitura devolve `relatorio` (o nome), a
  recusa diz o nome e as liberadas pelo nome, e o prompt manda dizer sempre o
  nome da tela, nunca a chave. Prova: `tests/copilot-sala-abas-e-comanda.test.ts`.
- **"Confira e confirme no cartão abaixo" só com cartão** (A27 da 21ª): o
  executor devolve ao modelo, no erro do preparo, que nenhum cartão
  apareceu; e, com o cartão, que não pergunte se ela quer gerar outro.
  Prova dos itens da 21ª: `tests/copilot-achados-da-21.test.ts`.
- **Quem atende se acha pelo NOME, não pela busca** (D2 da 16ª simulação): a
  `buscar` traz o que a tela de cada tipo mostra, e o membro só a quem tem a
  Equipe — quem agenda sem a Equipe ouvia "nada encontrado" e desistia. O
  prompt e as descrições de `agendar`, `remarcar` e `horarios_livres` mandam
  passar o nome que a pessoa disse direto nelas (`resolverProfissional`
  acha entre quem atende e, sem achar, diz quem atende); a `buscar` diz que
  membro só aparece a quem tem a Equipe, e, vazia para quem não a tem, aponta
  `agendar`/`horarios_livres`. A busca não se abriu.
- **A grade de `horarios_livres` é sugestão** (D4 da 17ª): de 30 em 30 min,
  dentro do horário da unidade e do profissional — a descrição dizia "das 8h
  às 20h", e o Copilot chamou de "não disponível" um 21:25 que o `agendar`
  aceitava. A descrição diz o que ela faz, e o prompt manda chamar
  `agendar`/`remarcar` com o horário pedido (eles conferem o conflito) e
  nunca concluir da grade que um horário está ocupado. Prova:
  `tests/copilot-atritos-da-17.test.ts`.
- **O prompt diz o nível de cada módulo da pessoa** (A24 da 17ª,
  `permissoesDaPessoa`): "abra Financeiro → Comissões" ia a quem tem o
  Financeiro só em Ver, que também não muda nada lá. Para MUDAR algo sem o
  módulo em Gerenciar, o Copilot não indica a tela: diz que a permissão dela
  não muda isso e que quem tem o módulo em Gerenciar muda; a configuração da
  rede toda (importar, tags, integrações e o WhatsApp, a configuração das
  comissões) é só da Admin da rede, e a quem não é ele diz "Esta configuração
  é só da Admin da rede." e quem muda. **Nas comissões são duas coisas**
  (CY-04 do catálogo de 24/11; CM-03 e CM-04): a comissão de CADA PESSOA (o
  chip "Comissão" da Equipe) muda quem tem o Financeiro em Gerenciar; a
  CONFIGURAÇÃO das comissões (Comissões e taxas, o campo no procedimento, no
  pacote e no produto), só a Admin da rede. O prompt leva os NOMES de cada
  uma, lidos pela rota só para quem não muda: `quemMudaAComissaoDasPessoas`
  (o Financeiro em Gerenciar da rede e da unidade dela, com a Admin) a quem
  não tem o Financeiro em Gerenciar, e `quemMudaAsComissoes` (as Admins da
  rede) a quem não é a Admin (A24 da 17ª, resto). Era "as comissões… são só
  da Admin da rede". Prova: `tests/copilot-pdv-comissoes-e-vistas.test.ts`.
- **"Compra de estoque" é só a mercadoria que entra no estoque** (D5 da 16ª):
  a descrição do `lancar` diz que ela conta no caixa e fica fora do
  resultado (material de limpeza, de copa ou de consumo não é), e que, sem
  uma categoria que sirva com certeza, o Copilot PERGUNTA (ou usa "Outro" se
  a pessoa disser) — nunca a mais parecida calado. O cartão da despesa nessa
  categoria avisa "conta no caixa e fica fora do resultado". O material de
  limpeza, de copa ou de consumo tem a sua: "Material de consumo (limpeza,
  copa)" (A22 da 17ª), na lista única da tela e do Copilot
  (`lib/financeiro/categorias.ts`). Prova: `tests/copilot-defeitos-da-16.test.ts`,
  `tests/copilot-atritos-da-17.test.ts`.
- **O "Feito" do cartão é da DECISÃO, não da tela de trás** (F46, a completa
  de 2026-11-07): o Confirmar gravou em 1,2 s, mas o cartão ficou 15 s em
  "Gravando…" — o `router.refresh()` estava dentro da transição do cartão, e
  o pendente dela esperava o dashboard por trás recarregar com o banco lento.
  O pendente é um estado próprio (`CartaoDoCopilot`), que acaba quando a
  action responde; o refresh corre à parte. Prova: o caso "o cartão diz Feito
  assim que grava" de `e2e/copilot-extras.spec.ts` (a tela de trás atrasada
  30 s pelo `page.route`).
- **O resumo do cartão volta ao modelo com o CPF mascarado**
  (`resumoParaOModelo`); a pessoa vê inteiro no cartão. O que a equipe ANEXA
  vai inteiro à OpenAI — por isso o aviso fixo de não mandar material clínico,
  e a política de privacidade diz isso.

## Ferramenta nova

Entra em `lib/copilot/ferramentas/index.ts` e declara o que exige. Leitura:
`executar` devolve dados ENXUTOS (o modelo paga por token) e, se útil, um
cartão de links. Gravação: `preparar` (resolve nomes, confere alcance e
conflito, monta o resumo — sem nada que mude sozinho até o Confirmar, como um
saldo) e `efetivar` (o núcleo da tela). Teste no molde de
`e2e/copilot-gravacoes.spec.ts`, com a OpenAI falsa roteirizada.

## O E2E

`e2e/apoio/openai-falsa.ts` (porta 3196, `OPENAI_BASE_URL_TESTE` à força no
build e no CI): roteirizada (`roteiro`: chamar ferramentas ou responder texto),
registra o que chegou (`ferramentasOferecidas`, `saidasDeFerramenta`) e cobra a
regra real do raciocínio. `e2e/apoio/copilot.ts`: uma rede `[e2e]` com o plano
completo e o dono. Os specs `copilot-*` são COMPARTILHADOS (porta fixa).

**O fim da página fica acima do botão no celular** (A4 da 10ª simulação,
2026-11-10): abaixo de 1024 px, com o botão na tela (fora do inbox, onde ele
já sobe), o `main` ganha embaixo a altura dele e a folga (`body:has(.copilot-botao…)
main`, `globals.css` do núcleo) — o último texto e o último botão saíam por baixo
dele, sem rolagem que os tirasse. Prova: `e2e/configuracoes-atritos-da-10.spec.ts` ("A4").
**O que ganha o foco atrás do botão sobe acima dele** (A16 da 23ª: a
1440×900 ele cobria o "Confirmar estorno" da comissão, aberto no meio da
página — o espaço no fim do `main` só resolve o fim): `useFocoAcimaDoBotao`
(`lib/copilot/abaixo-do-botao.ts`, no Copilot e no botão de fora do plano)
rola, no `focusin`, o que falta para o grupo do foco (`[role="group"]`,
`form`, ou o campo) ficar acima do botão, sem levar o topo dele para trás da
topbar; o modal (camada de cima) fica de fora. Prova: `tests/copilot-atritos-da-23.test.ts`.

## O que a permissão não mostra (D11, decisão do Claude, 25/11)

A ferramenta da ficha devolve, junto dos dados, `foraDaPermissao`
(`lib/copilot/fora-da-permissao.ts`): os atendimentos sem a Agenda em Ver, o
crédito interno sem o Financeiro em Ver nem o PDV em Gerenciar, e os pontos
sem a Fidelidade em Ver (só com a fidelidade da rede ligada e no plano, C5).
O modelo diz que a permissão não mostra, nunca que a cliente não tem
(princípio 4, CW-05). Teste: `tests/copilot-o-que-a-permissao-nao-mostra.test.ts`.

## O que nunca fazer aqui

```
❌ Ferramenta que lê dado clínico (prontuário, evolução, anamnese, foto, anotação clínica)
❌ Ferramenta de gravação que grava no preparar (só o efetivar, depois do Confirmar)
❌ Rede ou unidade vindas dos argumentos do modelo (é o ctx)
❌ Ferramenta sem declarar módulo/nível/recurso/pode (o executor só confere o que é declarado)
❌ Gravar pelo Copilot por um caminho diferente do núcleo da tela
❌ Resumo de cartão com algo que muda sozinho até o Confirmar (saldo, "daqui a 2h")
❌ Renderizar o texto do modelo como HTML, ou link do modelo fora da lista de telas
❌ Guardar o anexo (áudio, foto, documento) — lido no pedido e descartado
❌ Mandar a chamada de ferramenta ao histórico com o id do item (a API recusa sem o raciocínio)
❌ Liberar o Copilot para rede sem plano (ele custa por uso)
❌ router.refresh() dentro da transição que mostra o "Gravando…" do cartão (o pendente espera a tela de trás inteira — F46)
❌ Criar exclusão/anonimização de cliente (LGPD) sem levar as conversas do Copilot que o citam (copilot_mensagens, copilot_acoes) — hoje não há exclusão, e a retenção de 90 dias é o limite
❌ Liberar o Copilot sem conferir o módulo copilot do cargo (Ver)
❌ Pedir à gravação do Copilot um módulo a mais que a tela (o Copilot em Gerenciar): cada ação pede só a permissão dela (23/11; catálogo, 24/11)
❌ Baixa pelo Copilot na parcela do crediário ou no a receber de venda ou atendimento (é o PDV, com o link — o Copilot não recebe)
❌ Vista pessoal no Copilot que lê por um nome do pedido (é o id de vistaPessoal) ou que grava
❌ Chamar a OpenAI (resposta, transcrição) sem somar o gasto na cota — também quando falha ou cai
❌ Trocar OPENAI_MODEL / OPENAI_MODELO_DE_VOZ sem o preço do modelo em custo-do-copilot.ts (o custo some da tela)
❌ Devolver ao modelo documento (CPF) que ele não precisa reler — o resumo vai por resumoParaOModelo
❌ E2E falando com a OpenAI real (é a falsa, porta 3196)
❌ Escrever a lista de telas à mão no prompt (é telasDaPessoa, do menu e das abas — à mão, a primeira tela nova fica de fora)
❌ Comparar tag com caixa (contains exato): "VIP" e "vip" são a mesma tag da rede
❌ Copilot criando tag fora do vocabulário (criar tag é de Configurações → Tags)
❌ Funcionalidade nova na clínica sem perguntar o que o Copilot precisa saber dela (ferramenta, ou ao menos a tela na lista)
❌ Gravação do Copilot fora do comViaDoCopilot (a Auditoria a daria à pessoa sem o "pelo Copilot") — ou o cabeçalho x-bellaris-via fora do Confirmar
❌ Ferramenta que troca a unidade pedida pela da página calada (resolverUnidade recusa a de fora com o motivo)
❌ Falar de cargo como se fosse fixo no prompt ou nas mensagens ("o seu cargo…"): é a permissão
❌ Somar as linhas de lancamentos para dar despesa ou receita do período (é indicadores; o estorno não é despesa — D1 da 21ª)
❌ Chave de dinheiro que não diz se é receita ou despesa ("porUnidade" era a receita e saiu como despesa — D1 da 24ª)
❌ Taxa calculada pelo Copilot com os números das ferramentas (vai pronta de lib/metrics, com o nome — A41 da 24ª)
❌ Nome de função para o Copilot na tela ("secretária" — A49 da 24ª)
❌ Caminho de tela solto no texto, com ou sem id (o link vai com o nome — A27 da 21ª, A32 da 22ª)
❌ Cortar a chave da escolha do cartão abaixo do tamanho dela ("mesma:<uuid>" tem 42; o corte em 40 fazia o "Sim, é X" nunca valer — CP1)
```
