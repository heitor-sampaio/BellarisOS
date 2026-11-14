# O PDV, pacotes, procedimento pré-pago e financeiro

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### O PDV e as comandas (PDV1–PDV3, CX1 e CX3 — a revisão do Heitor, 2026-11-13)

O Heitor: "vamos fazer um PDV. E aí tudo que foi relacionado a alguma coisa
que tenha cobrança vira uma comanda. E aí o pagamento acontece por dentro
desse PDV, seja do que for." E: "Uma comanda para cada coisa" — uma venda, uma
comanda (PDV-P1).

- **A tela**: `/[slug]/pdv` e `/admin/pdv` (uma unidade por vez,
  `?unidade=`), corpo em `app/_shared/pdv.tsx`. No menu, em Vendas, para quem
  RECEBE (`podeReceber`: o caixa ou o Financeiro em Gerenciar). À esquerda as
  comandas (Abertas / Pagas hoje / Todas, busca pela cliente); à direita a
  comanda escolhida, com o "Receber" em blocos de forma de pagamento
  (`FormasDePagamento`). No topo, o que entrou hoje (`getFechamentoDoDia`) e
  quantas estão abertas.
- **A comanda é o CABEÇALHO da venda** (`public.comandas`: rede, unidade,
  cliente, número da rede, origem `ATENDIMENTO`/`PLANO`/`VENDA`). O dinheiro
  continua nas tabelas e funções de sempre. "Paga" NÃO se grava: é o
  lançamento vivo e pago da venda — o estorno a devolve a aberta sozinho. Só
  se grava o cancelamento, com o motivo. A lista sai de `pdv_comandas`
  (service_role; a action confere quem recebe e o alcance).
- **A comanda do atendimento nasce ao INICIAR** (PDV-P4: "quando inicia o
  atendimento, gera a comanda. Aí fica a critério da clínica se precisa pagar
  primeiro ou se paga depois"). O gatilho em `appointments`
  (`private.comanda_do_atendimento`) a cria quando o status vira IN_PROGRESS
  ou COMPLETED (o que já chega concluído, como na importação), em todo
  caminho — agenda, app, Copilot. Agendar, confirmar e remarcar não geram.
  Não há comanda sem o que cobrar: R$ 0, sessão de plano, sessão de pacote,
  pré-pago.
- **Pagar antes ou depois é só a ordem do trabalho**: o atendimento EM
  ANDAMENTO também se recebe (`confirmar_pagamento_do_atendimento` aceita
  IN_PROGRESS e COMPLETED; o agendado ouve "O atendimento ainda não começou: a
  comanda nasce quando ele é iniciado."). A conclusão confere o pagamento
  que já existe, e a comissão da conclusão o enxerga.
- **A comanda sai sem cobrança** — fica na lista "Todas" do dia, com o
  motivo — na falta ("A cliente não compareceu"), no cancelamento
  ("Atendimento cancelado") e quando o avulso passa a ser pago de outro jeito
  ("Abater do pacote": "Sessão do pacote"; o pré-pago: "Procedimento
  pré-pago"). A paga não sai: o dinheiro que entrou se desfaz pelo estorno.
- **Quem recebe é `podeReceber`** em todo caminho do recebimento
  (`confirmPayment`, `previaDoPagamento`, `abaterDoPacote`,
  `situacaoDaCobranca`): o caixa OU o Financeiro em Gerenciar, a mesma régua
  do menu. Era o caixa só, e o PDV abria para quem não podia receber nele.
- **O "Receber" do PDV é o mesmo do atendimento** (`FormularioDeReceberAtendimento`,
  `components/shared/receber-atendimento.tsx`): prévia, voucher, desconto e
  motivo, pontos, maquininha, vezes, bandeira, saldo de crédito, o combinado
  do plano. Não existe pagamento sem forma (PDV8): o botão "Receber R$ X"
  espera a forma.
- **Só se vende pelo PDV** (PDV-P3: "O vender da ficha sai e o do inbox ele
  pode sair, ele pode levar pro PDV, tá? Porque só vende pelo PDV."). A
  "Nova venda" (`?nova=1`) escolhe a cliente (busca na rede inteira,
  `buscarClientesParaVender`) e mostra os MESMOS formulários do antigo
  "Vender" (`VendaNaTela`, `components/shared/vender.tsx`): procedimento
  pré-pago, pacote, produto e crédito na rede, com desconto, "Quem vendeu" e
  pagamento. A unidade da venda é a do PDV — não há mais "Unidade da venda".
  A ficha não tem o "Vender"; o "Vender" do inbox e o da busca universal levam
  a `/<portal>/pdv?nova=1&cliente=<id>` (no inbox, a pessoa sem ficha passa
  pelo cadastro e chega lá).
  ⚠️ Onde este arquivo ainda diz o "Vender" (da ficha, do inbox), leia a
  "Nova venda" do PDV: o formulário e as regras são os mesmos.
- **Toda venda é uma comanda** (PDV2): o gatilho `comanda_da_venda`, no
  primeiro lançamento de receita da venda (pacote, pré-pago, produto, crédito
  vendido), cria a comanda `VENDA` ligada a ela (uma coluna por tipo, única) —
  vale em todo caminho que vende (tela, action, Copilot). As parcelas
  seguintes não fazem outra. O pacote trazido de fora não é venda: não tem
  comanda. A venda nasce paga (vendida com a forma escolhida): aparece em
  "Pagas hoje" pela hora da venda; a estornada inteira diz "Estornada".
- **A comanda do plano nasce no ACEITE** (PDV4 e PT1a–PT1c; o Heitor: "a
  partir do momento que a cliente aceita o plano, ela precisa daí pagar e
  agendar as sessões"; sobre perguntar a forma no aceite: "pode ser
  intimidador e levar a desistencia"; e "primeiro colhe assinatura, depois
  paga"):
  - **Aceitar é só "quero fazer"** (`aceitarPlano` → `plano_aceitar`): o plano
    vira ACCEPTED, os documentos ficam prontos e a comanda `PLANO` nasce no PDV
    com o valor inteiro. Nenhum dinheiro, nenhum agendamento, nenhuma pergunta
    de forma. Aceita quem monta o plano (prontuário em Gerenciar) ou quem
    recebe. Na página do plano e na tela do atendimento o botão é "Aceitar
    plano"; "a cliente vai pensar" deixa o plano proposto (PROPOSED), para
    aceitar depois.
  - **O dinheiro é no PDV**: a comanda do plano tem "Receber o plano", o mesmo
    assistente do antigo checkout (`CheckoutWizard`, `podeAgendar={false}`) —
    desconto, "Quem vendeu", à vista ou crediário, o contrato e então o
    recebimento. Sem "Receber no atendimento" (não existe pagamento sem forma,
    PDV8) e sem agendar sessões ali: as sessões se agendam pelo plano/agenda.
  - **Só o contrato do plano trava o dinheiro** (`plano_checkout`: falta
    assinar um `CONTRATO_PLANO` → recusa). Os outros termos não travam mais o
    aceite (`documentos_bloqueiam_plano` só os emite).
  - O plano aceito se recebe UMA vez ("Este plano já foi recebido"); o
    proposto não se recebe ("Aceite o plano antes de receber"). O plano
    cancelado (ou recusado) leva a comanda que não foi paga.
  - A comanda do plano está "Paga" quando o receber lançou o dinheiro (à
    vista ou no crediário, como a venda), na hora do primeiro lançamento.
  - **O plano é venda quando é RECEBIDO** (`metrics_vendas`, decisão pelos
    princípios 3 e 5, 2026-11-13): a data da venda do plano é a do primeiro
    lançamento de receita, não a do aceite — o aceito que nunca se recebeu não
    vendeu nada. Plano antigo aceito sem lançamento algum sai do relatório.
  - A rota antiga `/checkout/<plano>` leva aonde a coisa mora: proposto → o
    plano; aceito → a comanda dele no PDV.
- Ainda por vir (o plano de adaptação, `docs/revisao.md`): o Fechamento do dia
  no PDV; o crediário como forma, a parcela do crediário e os pontos dentro da
  comanda; vários itens numa comanda.
- Prova: `e2e/pdv-comanda-do-atendimento.spec.ts`, `e2e/pdv-nova-venda.spec.ts`,
  `e2e/pdv-comanda-do-plano.spec.ts`.

### 9.3.1 Pacotes (2026-09-30)

Um CONJUNTO de procedimentos, iguais ou não ("5 limpezas + 3 drenagens"),
vendido por um preço só (decisão do Heitor, 2026-09-30). Até 2026-09-30 só
existiam no banco de demonstração — nenhuma tela criava pacote nem o vendia.

**Pacote × plano de tratamento** (o Heitor, 2026-11-05, decisão 4 da 7ª
simulação): "a diferença entre pacote e plano é que um plano é algo
personalizado de acordo com a necessidade de cliente e um pacote é um conjunto
de procedimentos já estabelecidos previamente". O pacote é do CATÁLOGO (Vendas
→ Pacotes) e se vende igual a qualquer cliente; o plano nasce da avaliação,
para UMA cliente, e se fecha no checkout do plano. Os dois têm "Quem vendeu" e
comissão de venda (`comissoes.md`): a do pacote é do cadastro de cada pacote; a
do plano, um percentual da clínica (Configurações → Comissões → "Venda de
plano").

- **Os itens** moram em `service_package_items` (procedimento + quantidade);
  `service_packages.total_sessions` é a soma e `procedure_id` o primeiro item
  (as leituras de "o procedimento do pacote" seguem certas). Pacote e itens se
  gravam juntos em `pacote_salvar`; o mesmo procedimento em duas linhas vira
  uma, somada.
- **Cada sessão vendida** (`package_sessions`) guarda o SEU procedimento e a SUA
  parte do preço (`preco`): o preço do pacote rateado pelo preço de TABELA de
  cada procedimento, em centavos, com a última sessão levando o arredondamento
  (`sessoesDoPacote`, `lib/pacotes/rateio.ts`). `pacote_vender` confere que as
  sessões batem com os itens e que a soma fecha com o preço. A parte da sessão
  é a base da comissão dela.
- **Agendar uma sessão** usa o procedimento, a parte do preço e a duração DELA
  (`schedulePackageSession` recusa outro procedimento — o navegador não
  escolhe).
- **O tratamento comprado é da CLÍNICA; o dinheiro dele, do caixa da unidade
  da venda** (D3 da 14ª simulação, F73; H5, CLAUDE.md §5: "A cliente é da
  clínica, pode agendar em qualquer unidade da clínica"). Vale para o pacote,
  o plano fechado e o pré-pago. A recepção da Pampulha abria o pacote que a
  Marina comprou na Savassi e via "0 / 6 sessões", sem erro: a lista e o
  agendar estavam presos à unidade da venda. São DUAS regras, cada uma com o
  seu nome (`lib/tratamento/alcance.ts`):
  - **ver e agendar as sessões** — `alcancaOTratamento`: o registro é da rede
    de quem chama (`getClientPackageSessions`, `getPlannedSessionAppointments`,
    `schedulePackageSession`, `schedulePlanSession`, `agendarUnidadePrePaga`,
    a ficha de tratamento do plano por `planoDaClinica`). A unidade do
    AGENDAMENTO segue pelo alcance, no núcleo (`conferirPecasDoAgendamento`):
    a recepção da Pampulha agenda na Pampulha, não na Savassi;
  - **cancelar, estornar, fechar** — `alcancaOCaixaDoTratamento`: a rede E a
    unidade da venda ao alcance (`pacoteDaClienteAoAlcance`,
    `planoFechadoAoAlcance`, `unidadeAoAlcance` do pré-pago). O checkout e a
    edição do plano (`planoDoTenant`) seguem na unidade do plano.
  `tests/tratamento-da-clinica.test.ts` trava a action que voltar a decidir
  por conta própria. A primeira janela do pacote na ficha ("Abrir para ver e
  agendar as sessões") já lista as sessões, cada livre com "Agendar", que abre
  o agendar DELA (A21 da 14ª; "Gerenciar sessões" continua). Prova:
  `e2e/pacote-plano-da-clinica-f73.spec.ts`.

- **Catálogo da rede** em Vendas → Pacotes (`/admin/pacotes` e
  `/[slug]/pacotes`, corpo em `app/_shared/pacotes.tsx`, `PacotesCatalogo`):
  os procedimentos e quantas sessões de cada, preço, validade em dias (vazio =
  sem validade), à venda ou não. Ver pede `procedures: VIEW`; editar, `procedures: MANAGE` e
  abrangência de rede (`salvarPacote`) — na unidade é consulta.
- **O menu tem Vendas e Marketing separados** (decisão do Heitor, 2026-09-30):
  Vendas = Inbox, Oportunidades, Procedimentos e Pacotes (o funil e o que se
  vende); Marketing = Notificações, Marketing e Templates. A tela de cargos
  agrupa os módulos igual (`MODULE_GROUPS`: `crm` e `procedures` em Vendas,
  `marketing` em Marketing).
- **Cada categoria do menu recolhe pelo título** (pedido do Heitor,
  2026-09-30; `SecaoDoMenu`, `components/shared/secao-do-menu.tsx`, nos dois
  menus). Nasce aberta; fechada, ainda mostra o item da página aberta; lembra
  por navegador (`localStorage`); com a barra recolhida em ícones, não recolhe.
  Prova: `e2e/menu-lateral.spec.ts`.
- **Venda na ficha do cliente** ("Vender pacote", `VenderPacote`), para quem
  recebe (`podeReceber`), com o vocabulário do plano: à vista, entrada +
  parcelas, a receber (`CamposDoPagamento`, o mesmo do pagamento do contrato).
  - A venda sai pelo botão **"Vender"** (`components/shared/vender.tsx`),
    que pergunta Procedimento (pré-pago, §9.3.2) ou Pacote — os dois são
    separados no banco, só dividem a porta. Vender é o que o cliente compra
    e como paga; Agendar, quando ele vem.
  - O botão fica no cabeçalho da ficha, à esquerda do "+ Agendar".
  - **Na ficha da REDE com duas ou mais unidades, a venda pergunta a unidade**
    (D1 da 8ª simulação, 2026-11-06; H5: "nada se prende a clients.branch_id";
    decidido pelo princípio 3: nenhuma vem escolhida). Era a unidade de
    CADASTRO da cliente — ou a primeira em ordem alfabética —, sem perguntar:
    a Patrícia (Água Verde) via "Hidratante — sem estoque", e a venda no Batel
    só deu pelo portal do Batel; o "Quem vendeu" era a equipe da Água Verde.
    Agora "Unidade da venda" (`[data-unidade-da-venda]`, "Selecione a
    unidade…") vem antes de tudo, e o catálogo (procedimento, pacote,
    produto com o estoque DELA) e a equipe são os da escolhida
    (`VendaDaUnidade`, lido por unidade na página); o caixa, a baixa e a
    comissão saem dela. O mesmo vale para o que a ficha da rede grava por
    unidade: o crédito interno, o ajuste de pontos, a troca e a entrega do
    voucher (o produto baixa no estoque da escolhida) e o agendar da unidade
    pré-paga e da sessão — todos nascem sem unidade (`perguntaAUnidade`). Com
    uma unidade só, nada a perguntar; no portal da unidade, é ela. Prova:
    `e2e/vendas-unidade-da-venda.spec.ts`.
  - Também no painel da direita do inbox, com as ações da pessoa
    (`getConversationCard` → `venda`), **com ou sem ficha**. A
    unidade é a de quem atende (a unidade fixa), senão a única da rede; **na
    rede com duas ou mais, quem é da rede ESCOLHE** — "Unidade da venda", sem
    nenhuma escolhida, como na ficha da rede (`venda.unidades`; sobra da F33
    da 8ª simulação, 2026-11-06; H5: "nada se prende a clients.branch_id" —
    era "senão a do cliente", a unidade de cadastro). Com cliente, fora do
    alcance ou sem nada à venda, o botão não aparece. Como as outras ações da
    pessoa, também some com o painel só de leitura (sem `crm: MANAGE`). Prova:
    `e2e/agenda-atritos-da-8.spec.ts` ("sobra da F33").
  - **Sem ficha, primeiro o cadastro** (decisão do Heitor, 2026-09-30): o
    botão abre o "Cadastrar como cliente" com o aviso, e ao salvar a venda
    abre sozinha para o cliente novo (`abrirSinal` do `Vender`). Rede
    com várias unidades só sabe a unidade da venda depois do cadastro. Por
    isso ali `branchId` vem nulo e as listas vazias: é só o sinal de que a
    rede tem o que vender. Se a unidade escolhida não tiver nada à venda, a
    tela diz isso em vez de abrir.
  - `lancamentosDoPagamento` (`lib/checkout/lancamentos.ts`) monta o dinheiro:
    o recebido agora e o a receber em lançamentos separados; a última parcela
    leva o arredondamento.
  - `pacote_vender` grava tudo numa transação: o pacote do cliente com o
    RETRATO do preço, das sessões e da validade (mudar o catálogo vale para as
    próximas vendas), todas as sessões (`AVAILABLE`) e o dinheiro com
    `financial_transactions.client_package_id`. Recusa se a soma não fechar
    com o preço.
  - O a receber se quita no financeiro, como qualquer conta a receber. O
    vencimento do "a receber" é OPCIONAL (aqui e no pagamento do contrato):
    sem data, o lançamento nasce sem `due_date` e o contrato diz "a receber"
    sem o dia.
- **O pacote no crediário segue liberando, e a tela diz o que falta pagar**
  (A41 da 11ª simulação, 2026-11-10; decidido pelos princípios — o pacote
  segue liberando: princípio 1, nada muda sem a clínica pedir; a tela avisa:
  princípio 2). O pacote de entrada R$ 150 + 3 × R$ 100 liberava as 6 sessões
  calado. Na ficha, embaixo do cartão "Tratamento em andamento", e ao agendar a
  sessão (a ficha de tratamento → "Gerenciar sessões"): "R$ 300,00 deste
  pacote ainda em aberto (3 parcelas do crediário). As sessões seguem
  liberadas; o que falta se recebe no Financeiro." (`AvisoDoPacoteEmAberto`,
  `[data-pacote-em-aberto]`), só a quem recebe (o dinheiro é do caixa, como o
  saldo do plano — A39 da 7ª). A conta é do banco (`metrics_em_aberto_dos_pacotes`
  → `getEmAbertoDosPacotes`, `lib/metrics/pacote-em-aberto.ts`; migration
  `20261110005604`). Prova: `e2e/vendas-atritos-da-11.spec.ts` ("A41").
- **"Abater do pacote": o pacote vendido DEPOIS paga o avulso já concluído**
  (D9 da simulação de 2026-10-28, decisão do Heitor). Na janela do
  "Confirmar pagamento" de um avulso CONCLUÍDO e a receber, se a cliente tem
  pacote (na validade) com sessão livre do MESMO procedimento, a tela oferece
  "Abater do pacote" (`abaterDoPacote`, `actions/a-receber.ts`, quem recebe —
  `cashier` — e unidade ao alcance; a sessão é conferida como crédito,
  `conferirCredito`). Uma transação, `atendimento_abater_do_pacote`, que
  confere tudo de novo sob trava: a sessão é ligada e USADA, o contador soma,
  o preço do atendimento vira a parte da sessão no rateio, a conta a receber
  que existisse é substituída (valor zero e nota), e a comissão passa à regra
  da sessão de pacote — a linha AVULSO é CANCELADA (o acerto devolve o que
  ela liberou) e nasce a linha PACOTE (base = a parte da sessão; liberada com
  o pacote pago inteiro — H4, `comissoes.md`). O estoque já baixou na
  conclusão. Sem cobrança nova; o atendimento sai de "a receber" e vira
  "Sessão de pacote". Prova: `e2e/pacote-abater-avulso.spec.ts`.
- **Cancelar pacote** (F2b da 5ª simulação; decisão do Heitor, 2026-11-01:
  "concordo"). A cliente compra 6, faz 2 e desiste — até aqui não havia o que
  fazer. "Cancelar pacote" fica na ficha (embaixo do cartão "Tratamento em
  andamento") e na ficha de tratamento do pacote, para quem tem
  `financial: MANAGE`; a action (`cancelarPacote`, `actions/pacotes.ts`)
  confere a permissão e a unidade do pacote ao alcance.
  - **A conta é do banco, e a tela só a mostra**: `pacote_cancelar` com
    `p_simular` (`previaDoCancelamentoDoPacote`) devolve as sessões restantes
    e o valor delas — a soma de `package_sessions.preco`, o rateio do pacote
    COM o desconto —, o usado (vendido − restantes), o pago, o a receber, as
    parcelas que caem e o que volta. A janela (`CancelarPacote`,
    `components/shared/cancelar-pacote.tsx`) diz tudo isso; confirmar manda o
    "a devolver" que ela mostrou (`p_esperado`), e o banco recusa se mudou no
    meio ("Os valores do pacote mudaram…").
  - **O crediário cai antes de devolver qualquer coisa**: o a receber que
    passa do usado (`pago + a receber − usado`, até o a receber) cai do mais
    novo para o mais antigo — a parcela inteira sai marcada `Estornada` (sem
    contra-lançamento, como no estorno da venda de produto), a que cai em
    parte diminui. Ex.: entrada R$ 300 + 3 × R$ 1.000, 2 de 6 sessões de
    R$ 550 feitas (usado R$ 1.100): caem a 3ª e a 2ª inteiras e R$ 200 da 1ª,
    que fica com R$ 800. Nada a devolver.
  - **O pago além do usado volta, como a recepção escolher**: ESTORNO (o
    estorno de sempre, `estornar_transacao`, do lançamento mais novo para o
    mais antigo; o último em parte — o lançamento fica com o que sobra e um
    contra-lançamento "Estorno parcial", na mesma forma, leva o resto, com os
    pontos daquele pagamento na proporção) ou CRÉDITO NA CLÍNICA
    (`internal_credits`, "Cancelamento do pacote X"; o dinheiro fica e os
    pontos também — ele não voltou). Ex.: Pix de R$ 3.300, 2 de 6 feitas:
    R$ 2.200 de crédito, ou o Pix fica com R$ 1.100 e R$ 2.200 voltam.
  - **O pagamento que volta EM PARTE: duas formas, a recepção escolhe**
    (r2-ven-05, o Heitor, 2026-11-03: "dar as duas opções, não sabemos como a
    operadora da clínica vai lidar com essa parte de estorno, não sabemos se
    vai ser possível fazer estorno parcial, então precisamos dar opção.
    flexibilidade"). No estorno, quando o que volta é menor que um pagamento,
    a janela pergunta "Como estornar o Pix de R$ 3.300,00?":
    (a) **Estorno parcial** — o de cima: o pagamento passa a valer o usado e o
    "Estorno parcial" leva o resto; (b) **Estornar o pagamento inteiro e
    lançar o usado de novo** — o estorno de sempre do pagamento todo
    (`estornar_transacao`, com os pontos dele) e um pagamento NOVO do usado,
    pago agora, na forma que a recepção escolher ("Forma do pagamento do
    usado", e as vezes no crédito, até o limite da rede), com o pacote
    (`client_package_id`), os pontos e a comissão pelos gatilhos de sempre.
    **A forma do usado já vem a ORIGINAL** (A41 da 8ª simulação, 2026-11-06;
    decidido pelo princípio 5): escolhido o "inteiro" (no cartão, ele já vem),
    a "Forma do pagamento do usado" vem com o meio, as vezes e a bandeira do
    pagamento estornado — "Crédito 3x" —, e a recepção troca se a cliente
    pagar de outro jeito. Vinha em branco, e o Pix de R$ 800 da Helena foi
    inventado (`comOPagamentoInteiro`, `escolha-da-devolucao.tsx`; vale no
    pacote, na unidade do pré-pago e na devolução de produto). Prova:
    `e2e/vendas-produto-devolver-parte.spec.ts` ("A41").
    O retrato do cancelamento guarda a escolha (`cancelamento.estorno`,
    `.novo`). **No cartão (crédito, em qualquer número de vezes, e débito)
    só existe a (b)** (r2-fin-03, §9.6): a (a) fica desligada com o motivo
    ("No cartão, a operadora estorna o pagamento inteiro") e a (b) já vem
    escolhida; o banco recusa a (a). Na (b), a receita do usado entra no dia
    do cancelamento (é um pagamento novo, e o Fechamento do dia o mostra na
    forma escolhida), e o pagamento estornado FICA no dia dele: o estorno é a
    saída do dia do cancelamento (D2 e A33 da 12ª, decidido pelo princípio 5 —
    era "a do pagamento estornado sai do dia dele", decisão de frente;
    `indicadores.md`, "Estorno: cada lado no seu dia"). A função é
    `pacote_cancelar_devolvendo` (`p_estorno` PARCIAL | INTEIRO, `p_novo`
    { metodo, vezes }; migration `20261103001303`); `pacote_cancelar` ficou
    um invólucro dela sem a escolha (fora do cartão, parcial; no cartão,
    recusa). Prova: `e2e/pacote-cancelar.spec.ts` (as duas formas no Pix, o
    cartão), `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`.
  - **As sessões já agendadas**: a recepção escolhe cancelar os agendamentos
    (status, motivo "Pacote cancelado: …", histórico na transação; o evento
    `agendamento.cancelado` e o aviso à cliente e à equipe depois, na action,
    como todo cancelamento) ou mantê-los como atendimento AVULSO (soltos do
    pacote, com o preço que tinham — a parte da sessão —, a cobrar). Sessão em
    atendimento agora (chegou ou em andamento) recusa o cancelamento.
  - As sessões que sobraram ficam `CANCELLED` (`PackageSessionStatus`, que não
    se agendam); o pacote guarda `cancelado_em`, quem, o motivo,
    `valor_cancelado` e o retrato da conta (`cancelamento`). Pacote vencido,
    já cancelado ou com todas as sessões feitas não se cancela.
  - Tudo numa transação (`pacote_cancelar_devolvendo`, migration
    `20261103001303`, a partir de `20261101000252`; o valor novo do enum em
    `20261101000251`).
  - A comissão: a de venda volta na proporção do que foi cancelado, e a de
    execução das sessões feitas fica (`comissoes.md`). Os pontos seguem o
    estorno (`fidelidade.md`). Nas Vendas, o pacote vale o usado
    (`indicadores.md`).
  - Na ficha, o pacote cancelado sai do "Tratamento em andamento" e entra no
    Histórico ("Pacote cancelado: X — 4 sessões canceladas · R$ 2.200,00 em
    crédito na clínica · Motivo: …"); no app da cliente, sai dos tratamentos
    em curso; o lembrete de vencimento (cron) não o lembra; o pacote LGPD diz
    "cancelado em". **E o app diz o que aconteceu com o dinheiro** (A46 da 6ª
    simulação, 2026-11-04): no Histórico → Pagamentos e no Financeiro, o
    pagamento do pacote diz "Pacote cancelado em 04/11/2026"
    (`data-pacote-cancelado`), e o ESTORNO devolvido a ela aparece como
    saída — "− R$ 600,00 · Estorno" (`data-estorno`; a contra-transação,
    `category = 'Estorno'`, com o `client_id` dela). A Márcia via só "Pacote
    R$ 200 Pix Pago". O "Total investido" segue o do banco. Prova:
    `e2e/portal-cliente-pacote-cancelado.spec.ts`.
  - Prova: `e2e/pacote-cancelar.spec.ts`.
- **Cancelar o plano fechado é o "Cancelar pacote"** (D4 da 9ª simulação,
  2026-11-07; decisão 2 do Heitor: "sim usa a mesma coisa do pacote, como ja
  expliquei, a diferenca entre pacote e plano é que o plano é personalizado
  para o cliente conforme a necessidade dele e o pacote é uma oferta de um
  conjunto de procedimentos montado previsamente, os dois são, em essencia,
  conjuntos de procedimentos"). A Luana fez 1 de 10 sessões e desistiu: o plano
  fechado não se cancelava, e o "A receber" e o app dela seguiam com as
  parcelas. Agora a MESMA regra, sem configuração nova (nem tabela, nem multa):
  - **"Cancelar plano"** no cartão "Tratamento em andamento" da ficha, na ficha
    de tratamento e no "Gerenciar" das sessões, para quem tem o Financeiro em
    Gerenciar (a permissão do pacote), com a unidade do plano ao alcance
    (`cancelarPlano` e `previaDoCancelamentoDoPlano`, `actions/treatment-plans.ts`).
    Quem recebe e não cancela lê "Cancelar o plano é de quem tem o Financeiro em
    Gerenciar: …" (`quemDesfazNoCaixa`). **Também na página do plano**
    (`/planejamentos/<id>`, A27 da 10ª simulação, 2026-11-10: os dois times
    procuraram ali): o resumo do plano fechado tem "Cancelar plano"
    (`[data-cancelar-plano]`, `getResumoDoPlano` devolve `podeCancelar`) ou, para
    quem não pode, o "a quem pedir" (`[data-quem-cancela-o-plano]`). Prova:
    `e2e/ficha-uso-da-10.spec.ts` ("A27"). A janela é a do pacote
    (`CancelarPlano`, `components/shared/cancelar-pacote.tsx`).
  - **O usado é o preço das sessões FEITAS no plano** (o agendamento
    concluído), cada uma pela soma dos procedimentos dela, já com o desconto
    rateado — sem multa e sem preço de tabela. Ex.: 3 sessões (R$ 585 + R$ 144 +
    R$ 585, R$ 1.314), entrada de R$ 500 + 2 × R$ 407, 1 sessão feita: usado
    R$ 585, caem R$ 729 — a 2ª parcela inteira e R$ 322 da 1ª, que fica com
    R$ 85 — e nada a devolver. O crediário que passa do usado cai antes; o
    pago além dele volta como estorno (parcial ou o inteiro com o usado lançado
    de novo; no cartão, só o inteiro) ou crédito na clínica, a escolher; as
    sessões agendadas se cancelam (com o evento e o aviso) ou ficam AVULSAS, a
    cobrar, com o preço da sessão. Sessão em atendimento agora recusa. As
    sessões agendadas se cancelam juntas, com UM motivo (o A19 da 9ª: cancelar
    sessão a sessão pedia o motivo a cada uma; o caminho é o "Cancelar plano").
  - **O mesmo núcleo**: o dinheiro do cancelamento mora em
    `private.cancelamento_dinheiro`, que `pacote_cancelar_devolvendo` e
    `plano_cancelar_devolvendo` chamam (uma transação cada; a prévia é a mesma
    função com `p_simular`, e confirmar manda o "a devolver" que a janela
    mostrou). O plano fica `CANCELLED` com o retrato (`cancelado_em`,
    `cancelado_por`, `cancelamento_motivo`, `valor_cancelado`, `cancelamento`;
    migration `20261107004101`).
  - A comissão de venda volta na proporção (`comissoes.md`); nas Vendas, o plano
    vale o usado, e a sessão feita segue na receita dos atendimentos
    (`indicadores.md`).
  - Depois: a ficha tira o plano do "Tratamento em andamento" e o Histórico diz
    "Plano cancelado: X — 2 sessões canceladas · nada a devolver · Motivo: …";
    o "A receber" não tem mais as parcelas que caíram; o app não mostra o cartão
    do plano ("N sessões a agendar") e o pagamento diz "Plano cancelado em …"
    (`data-plano-cancelado`).
  - **O plano cancelado é um retrato, só de leitura, e a tela muda na hora**
    (D4 e D5 da 12ª simulação, 2026-11-11; princípio 3): ele reabria como
    rascunho editável ("Nova sessão", lixeiras, preços), e cancelar deixava a
    tela em "Fechado e pago" com o "Cancelar plano" até recarregar. O cancelado
    (e o recusado de antes) é travado no editor (`isPlanLocked`) e mostra
    "Cancelado em 11/11/2026 às 01:48, por Cláudia.", o motivo, as sessões
    canceladas, o usado que fica, o a receber que caiu, o que voltou (estorno ou
    crédito) e o que aconteceu com os agendamentos (`[data-retrato-do-cancelamento]`,
    `retratoDoCancelamento`, `lib/plano-de-tratamento/retrato-do-cancelamento.ts`,
    do `cancelamento` que o banco grava; `getPlanoParaEditar` o devolve). Ao
    cancelar, a janela chama `onCancelado` e a tela relê o plano aberto e a
    lista (o `router.refresh()` não chega ao estado do navegador). Prova:
    `e2e/plano-defeitos-da-12.spec.ts` ("D5 e D4").
  - Substitui o "Cancelar tratamento" (`cancelTreatmentPlan`, que não mexia nas
    parcelas e dava de crédito o preço dos agendamentos futuros, pago ou não, a
    quem tinha a Agenda em Gerenciar). Prova: `e2e/plano-cancelar.spec.ts`.
- A sessão só LÊ pacote: as políticas de INSERT/UPDATE de `client_packages` e
  `service_packages` saíram (dava para dar sessão de graça pela chave pública).
- Comissão: a de VENDA e a de EXECUÇÃO são do cadastro de cada pacote
  (2026-10-30, §9.7 "A comissão do PACOTE"); a do "Abater do pacote" segue a
  de execução dele. As duas só ficam a pagar com o pacote pago INTEIRO (H4,
  2026-11-01): no crediário, quando a última parcela entra; no cartão em N
  vezes, na hora.
- **Vendido o pacote, a janela oferece "Agendar a 1ª sessão agora"** (A47 da 7ª
  simulação, 2026-11-05: o pré-pago oferecia, o pacote não). A quem tem a Agenda
  em Gerenciar, a janela do "Vender" diz "Venda registrada. Agendar a 1ª sessão
  agora?" com o procedimento da sessão nº 1 (`venderPacote` devolve
  `primeiraSessao`), e o agendar é o de sempre das sessões
  (`schedulePackageSession`, pelo núcleo; `[data-agendar-a-primeira-sessao]`).
  "Cancelar" deixa para depois. Prova: `e2e/financeiro-atritos-da-7.spec.ts` ("A47").
  A sala (opcional) aparece desde o início, antes do horário (A32 da 8ª;
  `atendimento.md` §9.1).
- **"Trazer pacote de fora": o saldo que a cliente já tinha** (decisão 1 do
  Heitor sobre a 8ª simulação, 2026-11-06: "concordo" com a recomendação (a) +
  (c)). A Lúcia migrava a base: a Camila tinha 7 de 10 limpezas usadas no
  sistema antigo, e a tela só vendia pacote cheio — o improviso, o pacote
  "Saldo migrado" a R$ 0, entrou no catálogo, nas Vendas ("venda de 05/11"), no
  ticket médio e no app ("Pix R$ 0,00 Pago", com recibo).
  - **Na ficha**, "Trazer pacote de fora" (no cartão do tratamento em
    andamento; `TrazerPacoteDeFora`, `trazerPacoteDeFora` em
    `actions/pacotes.ts`): procedimento, sessões do pacote, já usadas antes do
    sistema, validade (opcional) e o **valor de referência OPCIONAL**. Quem traz
    é quem dá o crédito interno — o Financeiro em Gerenciar (decidido pelo
    princípio 3: é o mesmo tipo de saldo trazido de fora). A unidade: a da
    sessão; na ficha da rede com duas ou mais, a janela pergunta (D1). A
    janela diz a conta antes de gravar ("Ficam 4 de 6 sessões para agendar ·
    R$ 200,00 por sessão…", `contaDoPacoteDeFora`, `lib/pacotes/de-fora.ts`).
    Também pela importação (a coluna "Pacote de antes", `crm-inbox.md`).
  - **Não é venda**: sem lançamento no caixa, sem pontos, sem comissão de
    venda; fora do catálogo de venda (`catalogoDePacotes` tira o `de_fora`; o
    `pacote_vender` recusa o desativado), do Relatório de Vendas
    (`metrics_vendas`), do ticket médio e do faturamento (não há lançamento).
    `client_packages.price` fica nulo — `de_fora`, `valor_referencia`,
    `usadas_antes` (migration `20261106003501`). Uma porta só, `pacote_trazer`
    (`trazerPacoteCore`, `lib/pacotes/trazer.ts`): nasce um `service_packages`
    `de_fora` e desativado ("Limpeza (pacote de antes)", o nome que as leituras
    mostram), o pacote da cliente e as sessões — as já usadas `USED` sem
    atendimento, as restantes `AVAILABLE`, cada uma com a parte dela no
    valor de referência (rateio igual, a sobra na última; sem valor, nulo).
  - **A sessão restante se agenda e se consome como a de um pacote vendido
    aqui** ("Já pago" no agendar, no app e na sessão; a conclusão a marca
    usada). A comissão de EXECUÇÃO sai pela regra do profissional sobre a parte
    da sessão (`comissoes.md`); sem valor de referência, R$ 0 (princípio 4: o
    app não cria a linha). A receita dos atendimentos (a execução) conta essa
    parte no dia da sessão, pelo `package_sessions.preco` (r2-ind-01); sem
    ela, nada (princípio 5). O caixa e o faturamento nunca contam.
  - **A tela diz o que é** (A57): o cartão da ficha "PACOTE DE ANTES · 4 de 6
    restantes · 2 usadas antes do sistema" (`[data-pacote-de-fora]`; sem valor,
    o aviso `[data-pacote-sem-valor]`), a ficha de tratamento "Pacote de antes:
    2 usadas antes do sistema." e, nas sessões, "Usada antes do sistema"; o
    Histórico, "Pacote de antes registrado" sem valor; o app da cliente,
    "Pacote de antes: 4 de 6 restantes" (`restantesDoPacoteDeFora`) — sem
    pagamento nem recibo.
  - **Cancelar o pacote trazido** é o cancelamento de sempre: nada foi pago à
    clínica por ele, então não há o que devolver nem parcela a cair, e nenhum
    lançamento nem crédito nasce (prova: o caso "sobra da F35" de
    `e2e/pacote-de-fora.spec.ts`).
  - Os pacotes "Saldo migrado" a R$ 0 que a Hortênsia criou antes disso são
    dado de [sim] e ficaram como estão.
  - Prova: `e2e/pacote-de-fora.spec.ts`.
- **A tela de Pacotes manda ao "Vender" da ficha** (A46): dizia "Vender pacote",
  e o botão se chama "Vender" (escolha Pacote).
- **A taxa e o líquido da maquininha no Vender são de quem vê o financeiro da
  clínica** (A19 da 12ª simulação, 2026-11-11: a Rita, com Recebimentos e "só
  as próprias comissões", via "Taxa da maquininha… a clínica recebe R$ …"): o
  `[data-liquido-do-cartao]` e o `[data-taxa-do-debito]` com a taxa só aparecem
  a quem tem o Financeiro com escopo de todos (`mostraOLiquidoDaMaquininha`,
  `veComissaoDeTodos`) — a régua de "quem vê quanto cada um ganha" e do texto do
  cargo de Recebimentos ("não vê o financeiro da unidade", A39). Quem só recebe
  segue vendo o aviso de taxa NÃO cadastrada (sem valor). Muda a A40 da 8ª,
  que os mostrava a toda a recepção. **Confirmado pelo Heitor no levantamento
  das regras** (D7, 2026-11-11, opção a; princípio 3: a tela de quem só recebe
  não mostra o financeiro da clínica), e o servidor também deixa de mandar os
  números a quem só recebe (F63, C3): `taxasDoCartaoDeCredito`, `taxaDoDebito`
  e `cartaoPorBandeiraDaRede` mandam a quem não vê o financeiro de todos só
  QUAIS vezes e bandeiras estão cadastradas, com a taxa 0 e sem o prazo — é
  o que o aviso "não há taxa cadastrada" precisa; sem `podeReceber`, a
  bandeira nem responde. E a sessão não lê `payment_fees` pela chave pública
  (migration `20261112006302`). Prova: `e2e/vendas-atritos-da-12.spec.ts`
  ("A19"), `e2e/caixa-atritos-da-8.spec.ts` ("A40", agora com a dona),
  `e2e/permissoes-respostas-sem-permissao.spec.ts` (a resposta da action).
- **Quem vende é quem RECEBE, e a tela diz** (D1 da 12ª simulação, 2026-11-11;
  princípio 3 — quem vende segue decidido pelo cargo, princípio 1): a Rita, com
  Procedimentos, CRM e Clientes em Gerenciar, lia "fechar a venda do pacote" na
  linha de Procedimentos e não via o "Vender" (`podeReceber`: Recebimentos, ou o
  Financeiro em Gerenciar). A linha de Procedimentos em Gerenciar não promete mais
  a venda ("Vender (o “Vender” da ficha) é de Recebimentos."), o resumo do cargo
  ("O que essa pessoa vai ver") diz "Não vende pelo “Vender” da ficha: vender é
  de Recebimentos (ou do Financeiro em Gerenciar)." — ou "Vende pelo “Vender” da
  ficha…" — (`quemVendeNoResumo`, `[data-quem-vende]`), e a tela de Pacotes diz o
  mesmo (`TEXTO_DA_VENDA_DO_PACOTE`, `lib/permissions-copy.ts`). A trava não mudou.
  Prova: `tests/defeitos-da-12.test.ts` ("D1").
- Prova: `e2e/pacotes-venda.spec.ts`.

### 9.3.2 Procedimento pré-pago (2026-09-30)

N unidades de UM procedimento, pagas antes (ou a receber) e agendadas depois.
**Separado do pacote de propósito** — o Heitor recusou reaproveitar
`client_packages`: pacote é um conjunto vendido por um preço só; o pré-pago é
o procedimento avulso pago antes.

- **A venda** é `procedure_sales` (retrato: preço unitário e total de tabela,
  desconto, vendido, validade OPCIONAL, quem vendeu) e as **unidades**,
  `procedure_sale_units` (uma linha por unidade, com a SUA parte do vendido —
  rateio igual em centavos, a base da comissão dela —, a situação
  `DISPONIVEL | USADA | CANCELADA` e o agendamento que a usa). O dinheiro leva
  `financial_transactions.procedure_sale_id`. Uma transação:
  `procedimento_vender` (`venderProcedimento`, `actions/pre-pago.ts`, para
  quem recebe). Desconto como toda venda (§9.6).
- A sessão só LÊ (equipe que alcança a unidade; o cliente, o que é dele).
- **No atendimento**: o agendamento liga a unidade (`appointment_id`, único);
  `concluir_atendimento` a marca USADA e liga a linha de comissão à venda
  (origem `PRE_PAGO`); a recepção RECUSA cobrar (`confirmar_pagamento…`),
  e a tela esconde o botão.
- **Agendar usando o que já foi pago** (unidade pré-paga OU sessão de pacote)
  é o **crédito** do agendamento, e passa pelo NÚCLEO:
  `createAppointmentCore(… credito: { tipo: 'PRE_PAGO' | 'PACOTE' | 'PLANO', id })`
  (`lib/creditos/credito.ts`; a sessão do plano fechado desde a D5/A18 da 9ª —
  `atendimento.md`). O crédito é conferido (do cliente, da rede,
  livre, na validade) e decide o procedimento e o preço — procedimento
  diferente é recusado; depois do insert ele é ligado por compare-and-swap
  (`appointment_id` nulo), e quem perde a corrida tem o agendamento desfeito.
  Com conflito de horário, histórico e evento, como todo agendamento.
  - Onde: o card "Procedimentos pagos" ("Agendar" na unidade,
    `agendarUnidadePrePaga`), o modal da agenda e o do inbox (campo "Já
    pago", `creditosParaAgendar`), e o "Agendar agora" depois de vender um
    procedimento (quem tem `agenda: MANAGE`).
  - **No modal da agenda, o "Já pago" vem ESCOLHIDO quando o procedimento
    bate** (A20 da 8ª simulação, 2026-11-06; decidido pelo princípio 3): a
    Bruna saiu avulsa a R$ 180 com a sessão do pacote livre ("Não usar —
    cobrar no atendimento" era o padrão). Escolhido o procedimento, o crédito
    dele (o mais antigo) vem escolhido, com o aviso "Já pago: Pacote X
    (sessão 2 de 3) — escolhido porque o procedimento é o mesmo. Para cobrar
    à parte, escolha “Não usar”." (`[data-credito-pre-escolhido]`). Como o
    app (que já usava o pacote sozinho).
  - **O avulso já marcado se liga depois** (A20): a janela do agendamento EM
    ABERTO, avulso (sem plano, sem crédito ligado, sem lançamento vivo), de
    quem tem crédito do MESMO procedimento, oferece "Usar o pacote X (sessão
    N de M)" (`UsarOQueJaFoiPago`, `creditosDoAgendamento` →
    `usarCreditoNoAgendamento`). Uma transação, `agendamento_usar_credito`
    (migration `20261106003702`): o agendamento e o crédito travados e
    conferidos de novo, a ligação, o preço passa à parte do crédito e o
    histórico "Ligado ao que já foi pago" (`CREDIT_LINKED`). O concluído segue
    pelo "Abater do pacote". Prova: `e2e/agenda-atritos-da-8.spec.ts` ("A20").
  - `schedulePackageSession` (o modal de sessões do pacote) também passa
    pelo núcleo, com a sessão como crédito (2026-09-30). A tela já escondia
    o horário ocupado, mas só pelo INÍCIO (60 min às 10:00 passava por cima
    de outro às 10:30), e o servidor não conferia nada.
  - ⚠️ A conferência de conflito lê com `.limit(1)`, não `.maybeSingle()`:
    o horário pode encostar em DOIS agendamentos, e o `maybeSingle` dava
    "Não consegui buscar o agendamento" em vez de "já tem agendamento".
  - Prova: `e2e/agendar-com-credito.spec.ts`.
- **Comissão**: como o pacote — a base é a parte da unidade, e ela libera só
  com a venda paga inteira (sobre o que ela vale hoje: vendido − unidades
  canceladas; H4, 2026-11-01, `comissoes.md`). O gatilho do pagamento acerta.
- **Falta ou cancelamento do agendamento DEVOLVE a unidade** (gatilho
  `trg_pre_pago_libera`): pode remarcar. Decisão do Heitor.
- **Cancelar a unidade vai pelo fluxo do PACOTE** (D1 da 6ª simulação,
  2026-11-04; a regra de 30/09, "registra para fazer estorno" como DEVOLUÇÃO a
  pagar, ficou para trás com as decisões do pacote — F2b: a clínica escolhe;
  F13/r2-fin-03: no cartão, o pagamento inteiro). Com motivo, só a DISPONÍVEL
  e não agendada, por quem tem o **Financeiro em Gerenciar** (C36 da F67: era
  de quem recebe, e o caixa devolvia dinheiro por ali; como cancelar o pacote)
  sem "só os meus", e com a unidade ao alcance:
  "Cancelar" no card "Procedimentos pagos" abre a janela "Cancelar unidade"
  (`CancelarUnidadePrePaga`), com a conta que o BANCO fez
  (`procedimento_cancelar_unidade_devolvendo` com `p_simular`,
  `previaDoCancelamentoDaUnidade`): a venda passa a valer o vendido menos as
  unidades canceladas; o a receber que passa disso cai ANTES (a parcela
  inteira sai `Estornada`, a que cai em parte diminui); o pago além disso
  volta como a recepção escolher — ESTORNO (o de sempre; o pagamento pego em
  parte, estorno parcial ou o pagamento inteiro estornado e o que fica lançado
  de novo, na forma escolhida — no CARTÃO só o inteiro, e os recebíveis da
  operadora dele caem pelo gatilho) ou CRÉDITO NA CLÍNICA (`internal_credits`,
  "Cancelamento da unidade 2 de Peeling"; o dinheiro e os pontos ficam). A
  escolha é o mesmo componente do pacote (`EscolhaDaDevolucao`). Os pontos
  seguem o estorno; a comissão das unidades usadas se acerta pela venda que
  ficou. Confirmar manda o "a devolver" que a janela mostrou (`p_esperado`); o
  banco recusa se mudou. A unidade guarda o retrato da conta
  (`procedure_sale_units.cancelamento`). A "Devolução" a pagar que a versão de
  antes gravou (na produção, a do Jorge na Begônia, R$ 250, dado de [sim])
  ficou como está e desconta do que volta. `procedimento_cancelar_unidade`
  virou um invólucro sem a escolha (por estorno; no cartão, recusa). Migration
  `20261104002004`. Prova: `e2e/pre-pago-cancelar-unidade.spec.ts`.
- **Fidelidade por procedimento**: os pontos das unidades ativas, na proporção
  do pago (como o plano). O pacote passou a ganhar do mesmo jeito (dava zero).
- Na ficha: card "Procedimentos pagos" (`ProcedimentosPagos`); no portal, em
  "Tratamentos em curso"; no export da LGPD, seção própria.
- Prova: `e2e/pre-pago.spec.ts`.

### 9.3.3 Venda de produto (D4, 2026-10-30)

Decisão do Heitor (2026-10-29): "Produto entra no 'Vender' da ficha da
cliente, com quantidade, desconto e forma de pagamento. O estoque baixa pelo
lote que vence primeiro. A venda vai para o caixa, para as vendas e para o
faturamento." Até aqui a única saída era o ajuste, sem receita nem caixa.

- **Só produto de REVENDA** (ou "os dois", `products.uso` — D-6, §9.5), ativo
  e com preço de venda: `produtosAVenda` (`lib/produtos/leitura.ts`) diz
  também quantas EMBALAGENS INTEIRAS há na unidade (a aberta não se vende).
- **A porta é o "Vender"** (aba "Produto", `FormularioDoProduto` em
  `components/shared/vender.tsx`), na ficha (os dois portais) e no painel do
  inbox, para quem recebe (`podeReceber`). **Exige cliente cadastrada**: no
  inbox sem ficha o botão abre o cadastro (o rápido serve) antes, e a action
  recusa sem a ficha da rede.
- `venderProduto` (`actions/produtos.ts`) confere permissão, rede e alcance,
  calcula o desconto (`lib/vendas/desconto.ts`) e os lançamentos
  (`lancamentosDoPagamento`: à vista — inclusive crédito em N vezes —, entrada
  + parcelas, a receber), e `produto_vender` grava TUDO numa transação: a
  venda (`product_sales`, com o RETRATO do preço unitário e de tabela, do
  desconto, do vendido, do CUSTO do que saiu e de quem vendeu), o movimento
  `SALE` (o gatilho do lote tira pelo que vence primeiro), o saldo (linha
  travada; sem estoque suficiente, recusa: "Estoque insuficiente: há 2 un de
  Sérum nesta unidade.") e o dinheiro (`financial_transactions.product_sale_id`,
  categoria "Venda de produto", com a cliente). Nunca despesa.
- O custo do que saiu é o da entrada de cada lote que o FEFO tirou, na
  proporção (sem lote com custo, o custo de consumo do cadastro).
- **Vários produtos numa venda, um pagamento só** (ven-04 da revisão,
  2026-11-02: "a Carla leva 2 séruns e 1 protetor; a Bruna faz duas vendas
  e recebe duas vezes"). A janela tem "Adicionar produto" (até 20, cada um
  de 1 a 100; até 100 unidades na venda) e o resumo "2 × R$ 100,00 + 1 ×
  R$ 90,00 = R$ 290,00". `venderProduto` recebe a lista de itens (um id
  sozinho ainda vale) e `produto_vender_itens` (migration `20261101001103`)
  grava numa transação: cada saldo travado na ordem do produto, a baixa de
  cada um pelo FEFO, a venda e os itens (`product_sale_items`: produto,
  quantidade, preço, custo e o movimento dele), a comissão (uma sobre o total, ou uma por item quando a clínica comissiona por produto — r2-ven-10, `comissoes.md`) e
  o dinheiro. Sem estoque de UM, nada grava. A venda guarda o total (tabela,
  desconto, vendido, custo, unidades); as colunas de antes
  (`product_id`, `preco_unitario`, `stock_movement_id`) ficam com o PRIMEIRO
  item, e `descricao` ("2× Sérum + 1× Protetor") existe só no kit — é o
  que as Vendas, o extrato da comissão e a descrição do lançamento dizem.
  O estorno ("O produto voltou?") devolve CADA item ao saldo e aos lotes, e
  a venda estornada que não voltou é perda por produto (`metrics_perdas`).
  As vendas de antes (sem itens) seguem pelo cabeçalho. Prova:
  `e2e/vendas-produto-varios.spec.ts`.
- O dinheiro segue a regra única de receita (`metrics_receitas_pagas`): caixa,
  faturamento e ticket médio. O relatório de vendas ganha o tipo **Produto**
  (`metrics_vendas`: na data da venda, pelo vendido, "quem vendeu" na coluna
  Profissional).
- Pontos: só se a clínica ligar (Configurações → Fidelidade → "Venda de
  produto", `fidelidade.md`). **A janela da venda DIZ** (A48 da 5ª
  simulação): com a fidelidade ligada, "A venda de produto não gera pontos de
  fidelidade (Configurações → Fidelidade)." ou "A venda gera pontos de
  fidelidade quando for paga." (`data-pontos-do-produto`; `produtosAVenda`
  lê a config da rede). Com a fidelidade desligada, não fala de pontos.
- **O estorno é da VENDA e pergunta se o produto voltou** (H2, decisão do
  Heitor, 2026-11-01: "estorno de produto precisa ter um campo para indicar
  se houve devolução de produto ou não; se sim, produto volta ao estoque").
  O "Estornar" de qualquer lançamento de uma venda de produto (nos dois
  financeiros) abre "Estornar esta venda de produto?" com "O produto voltou
  ao estoque?" (Sim / Não, sem resposta não confirma) e o motivo;
  `reverseTransaction` exige o `voltou` e chama `produto_estornar_venda`,
  UMA transação: os lançamentos PAGOS passam por `estornar_transacao`
  (contra-lançamento na mesma forma, pontos, crédito interno), os A RECEBER
  saem marcados `Estornada` (sem contra-lançamento: não entrou dinheiro), a
  linha de comissão é CANCELADA e acertada, e a venda guarda `estornada_em`,
  quem, o motivo e `produto_voltou`.
  - **Voltou**: um movimento `SALE_RETURN` ("Devolução de venda", com
    `reference = 'venda:<id>'`) devolve ao saldo (linha travada) o que a
    venda tirou, e a cada LOTE o que saiu dele (`stock_movement_batches` do
    movimento da venda), ao custo do movimento da venda.
  - **Não voltou**: o estoque fica, e a venda vira PERDA — a seção "Perdas
    no período" de Relatórios → Estoque a mostra com o motivo "Venda
    estornada (não voltou)" (`VENDA_ESTORNADA`, no dia do estorno, pelo custo
    retratado na venda). Como toda perda, fora do lucro (D-7).
  - Nos dois casos a venda sai de Relatórios → Vendas (e do CSV) e o custo
    dela sai do lucro (`indicadores.md`).
  - `estornar_transacao` RECUSA sozinho o lançamento de venda de produto
    ("estorne a venda, dizendo se o produto voltou"): estornar só o dinheiro
    deixava a venda viva. Só `produto_estornar_venda` o deixa passar
    (`set_config('bellaris.estorno_da_venda', …)`, só para aquela venda).
  - Venda estornada não se estorna de novo ("Esta venda já foi estornada.").
  - **A venda toda A RECEBER (nada pago) se CANCELA** (sobra da F3,
    2026-11-01): o lançamento em aberto de uma venda de produto tem
    "Cancelar venda" (nos dois financeiros), que abre a mesma janela como
    "Cancelar esta venda de produto?" — "O produto voltou ao estoque?" e o
    motivo — e passa pela mesma `produto_estornar_venda` (o a receber sai
    `Estornada`, o produto volta ou vira perda, a venda sai das Vendas).
  - Prova: `e2e/vendas-produto.spec.ts` (voltou pela tela, não voltou e a
    venda em entrada + parcela pela action, e o "Cancelar venda" da venda
    toda a receber pela tela).
- **A devolução de PARTE da venda, por linha** (A34 da 8ª simulação,
  2026-11-06; decidido pelo princípio 3): a Karina levou 2 séruns e devolveu 1,
  e a Marta estornou a venda inteira e vendeu de novo o que ficou — três
  lançamentos. A janela do "Estornar" de uma venda de produto oferece
  "Devolver só parte da venda" (`[data-devolver-so-parte]`), que abre
  "Devolver parte da venda" (`DevolverParteDaVenda`,
  `components/shared/devolver-parte-da-venda.tsx`; `actions/devolucao-de-produto.ts`,
  a mesma permissão do estorno — o Financeiro em Gerenciar, a unidade ao
  alcance): quantas de cada produto voltam, se voltaram ao estoque e a conta
  que o BANCO fez (`produto_devolver_itens` com `p_simular`; migration
  `20261106003801`) — o que volta (a parte de cada item no vendido, com o
  desconto rateado pela tabela, como a comissão por produto), o que a venda
  passa a valer, o a receber que cai antes e o que volta. O dinheiro é o fluxo
  do cancelamento da unidade do pré-pago: o a receber que passa do novo valor
  cai antes; o pago além dele volta como a recepção escolher — ESTORNO (o
  "Estorno parcial" na mesma forma, ou, no CARTÃO, o pagamento inteiro
  estornado e o que fica lançado de novo, r2-fin-03) ou CRÉDITO NA CLÍNICA. O
  estoque: voltou, um `SALE_RETURN` das unidades, aos lotes de onde a venda as
  tirou (`private.devolver_aos_lotes`); não voltou, fica, e é perda. Cada
  devolução fica em `product_sale_returns` (com o retrato; só o servidor lê) e
  soma em `product_sale_items.devolvidas/valor_devolvido/custo_devolvido` e
  `product_sales.valor_devolvido/custo_devolvido/unidades_devolvidas`. A venda
  continua viva e passa a valer `price − valor_devolvido`: nas Vendas (valor e
  unidades), na comissão de quem vendeu (`comissao_conta`: a quitação contra o
  que a venda vale, e a linha do total ou a do item na proporção do que ficou),
  no custo do lucro (`custo − custo_devolvido`) e nas perdas (o que não voltou,
  no dia da devolução; migration `20261106003802`). O que ainda está com a
  cliente se devolve de novo (em parte, ou o estorno da venda inteira, que
  devolve só o que restou — `produto_estornar_venda` desconta o já devolvido).
  Devolver tudo o que resta é o estorno da venda ("É a venda inteira…"); a
  venda de antes de 01/11 (sem itens) só se estorna inteira. Prova:
  `e2e/vendas-produto-devolver-parte.spec.ts`. **A janela só fala em pontos
  se a venda pontuou** (A40 da 9ª simulação; princípio 3): "e os pontos dele
  saem do saldo" aparecia na venda que "não pontua" — agora só quando algum
  pagamento da venda tem o GANHO no extrato (`previaDaDevolucao`, `vendaPontuou`).
  Prova: `e2e/financeiro-ficha-e-app-da-9.spec.ts` ("A40").
- A sessão só LÊ `product_sales` (a equipe que alcança a unidade, a cliente a
  dela); as restritivas do suporte valem.
- Prova: `e2e/vendas-produto.spec.ts`.

### 9.3.4 Crédito na clínica VENDIDO — o "vale" (decisão 1 do Heitor sobre a 9ª simulação, 2026-11-07)

O Heitor: "concordo" com a recomendação — "'Crédito na clínica' no Vender, para
quem recebe, com a forma de pagamento; entra no caixa, no fechamento e no
faturamento no dia em que o dinheiro entrou (princípio 5), e o uso depois segue
a regra de hoje (não é receita de novo); os pontos na VENDA do crédito, pelo
dinheiro pago, não no uso; sem comissão de venda; o 'Conceder crédito' continua
como está, para o que não teve dinheiro". A Rosana pagou R$ 300 no Pix para usar
depois em qualquer coisa, e a recepção só achou o "Conceder crédito" (fora do
caixa): os R$ 300 não entraram no caixa, no fechamento nem no faturamento.

- **A porta é o "Vender"**, aba "Crédito na clínica" (`FormularioDoCredito`,
  `components/shared/vender.tsx`), na ficha (os dois portais) e no painel do
  inbox, para quem recebe (`podeReceber`); a aba existe em toda unidade (não
  depende de catálogo). "Valor do crédito" (`parseDinheiro`) e a forma — só À
  VISTA: Pix, dinheiro, débito ou crédito em N vezes (com a bandeira), nunca
  "Crédito do cliente" (`CamposDoPagamento semCredito`). Sem "Quem vendeu":
  não há comissão de venda. A tela diz a regra ("Entra no caixa hoje… Usar
  depois não conta como receita de novo. Sem comissão de venda.",
  `[data-regra-do-credito]`). Decidido pelo princípio 5 ("sem dinheiro, sem
  crédito vendido"): o crédito vendido é o dinheiro que entrou, então não há
  crediário nem "a receber" para ele — o crédito sem dinheiro é a concessão.
- **Uma transação, `credito_vender`** (`venderCredito`, `actions/credito-na-clinica.ts`;
  a chave do envio vale, D10): a venda (`creditos_vendidos`, só o servidor
  lê), o lançamento de receita PAGO agora ("Crédito na clínica", categoria
  "Crédito na clínica", `financial_transactions.credito_vendido_id`) e o
  crédito (`internal_credits` +valor, "Crédito na clínica comprado", com o
  `credito_vendido_id`). Migrations `20261107004401` e `…004402`.
- **O dinheiro**: o lançamento é receita paga com cliente — a regra única
  (`metrics_receitas_pagas`) o conta sem mudar nada: caixa, Fechamento do dia
  (na forma), faturamento, ticket médio. O USO depois é o pagamento com
  `INTERNAL_CREDIT` de sempre: desconta do saldo e não é receita (F7). Nas
  Vendas (Relatórios), o crédito NÃO aparece: a venda de verdade é a do
  procedimento ou do produto pago com ele, quando a cliente usa (decidido pelo
  princípio 3 — senão o mesmo dinheiro seria duas vendas).
- **Os pontos** saem na VENDA, pelo dinheiro pago (`points_per_real`), em
  qualquer modo de ganho — também "por procedimento" (`fidelidade.md`). O uso
  não pontua.
- **Sem comissão de venda**: nenhuma linha nasce. Quem atende depois recebe a
  comissão de execução do atendimento, como sempre.
- **O estorno é da VENDA e devolve o saldo não usado** (`EstornarVendaDeCredito`,
  o "Estornar" do lançamento nos dois financeiros; `previaDoEstornoDoCredito`
  e `estornarVendaDeCredito`, com o Financeiro em Gerenciar e a unidade ao
  alcance — a permissão do estorno). A conta é do banco
  (`credito_estornar_venda`, com `p_simular`): volta o SALDO de crédito da
  cliente hoje, até o que ela pagou — o que ela já usou fica pago. A janela
  diz "Vendido R$ 300,00 · Já usado R$ 119,00 · Volta à cliente R$ 181,00".
  Voltando tudo, o estorno de sempre; voltando parte, a escolha de sempre
  (`EscolhaDaDevolucao soEstorno`): estorno parcial (o pagamento fica com o
  usado e um "Estorno parcial" leva o resto, com os pontos na proporção) ou o
  pagamento inteiro estornado e o usado lançado de novo — no CARTÃO, só este
  (r2-fin-03). O crédito que voltou sai do saldo dela (`internal_credits`
  negativo), e a venda guarda `estornado_em` e o retrato. Confirmar manda o
  "volta" que a janela mostrou (`p_esperado`); o banco recusa se mudou.
  Decidido pelo princípio 3: o crédito é um saldo só, então "o que ela não
  usou" é o saldo dela hoje, até o vendido (a tela mostra a conta).
- **O lançamento solto não se estorna**: `estornar_transacao` recusa o da venda
  do crédito ("Este lançamento é de uma venda de crédito na clínica: estorne a
  venda…") — só `credito_estornar_venda` o deixa passar
  (`set_config('bellaris.estorno_do_credito', …)`), como a venda de produto.
- O **"Conceder crédito"** (`grantInternalCredit`) continua como está: fora do
  caixa, para o crédito de fora e o que não teve dinheiro.
- Prova: `e2e/vendas-credito-na-clinica.spec.ts`.
- **O bônus no crédito** (A20 da 11ª simulação; DECIDIDO pelo Heitor,
  2026-11-10: "No estorno sai o bonus junto, a clinica decide se integral ou
  parcial" — e "não vamos fazer as clinicas perderem dinheiro"). A Marta quis
  vender R$ 500 de crédito que vira R$ 550.
  - "Bônus (opcional)" no "Crédito na clínica", VAZIO por padrão (princípio 6;
    só o negativo é recusado). A janela diz a conta antes de vender ("A cliente
    fica com R$ 550,00 de crédito: R$ 500,00 pagos + R$ 50,00 de bônus. O
    caixa recebe só os R$ 500,00 pagos…", `[data-conta-do-bonus]`).
  - **O caixa e o faturamento recebem só o pago**: o lançamento é o valor pago
    (a regra única o conta), e os pontos saem dele (o gatilho de sempre). O
    bônus entra no saldo como CONCESSÃO ligada à venda (`internal_credits`
    com `concedido` e o `credito_vendido_id`): sem dinheiro, não é receita.
    `creditos_vendidos.bonus`; `credito_vender` ganhou `p_bonus` (a de 9
    argumentos chama a nova com zero; migration `20261110005602`).
  - **A tela e o app dizem** "R$ 500,00 pagos + R$ 50,00 de bônus"
    (`textoDoBonus`, `lib/creditos/bonus.ts`): na linha do crédito da ficha (a
    descrição do crédito comprado) e no app, no Início e no Financeiro, ao lado
    do saldo (`bonusDosCreditosDaCliente`, as compras de pé).
  - **No estorno o bônus SAI junto, e a clínica escolhe como** (a janela
    pergunta "Como o bônus sai?", `[data-como-sai-o-bonus]`, com a conta do banco
    de cada opção; sem escolher, não confirma, e o banco recusa): INTEIRO — o
    bônus sai todo (até o saldo), e volta o saldo menos o bônus, até o pago —
    ou PROPORCIONAL — o saldo se divide entre o pago e o bônus, e o bônus sai
    na proporção do que volta. Ex.: R$ 500 + R$ 50, usados R$ 130 (saldo
    R$ 420): inteiro, volta R$ 370 e saem R$ 50 de bônus; na proporção, volta
    R$ 381,82 e saem R$ 38,18. **Nunca volta mais do que ela pagou**, e o que
    sai do crédito nunca passa do saldo dela. O resto do estorno é o de sempre
    (parcial ou o inteiro com o usado de novo; no cartão, só o inteiro; os
    pontos do que voltou). `credito_estornar_venda` ganhou `p_bonus`.
  - **O "Já usado" diz a fatia do bônus** (A31 da 12ª; princípio 3): a Bruna
    (R$ 300 + R$ 30, usou R$ 180, o bônus na proporção) lia "Já usado
    R$ 163,64" — o usado do PAGO. Agora "R$ 180,00 usados, R$ 16,36 deles do
    bônus" (`textoDoJaUsado`, `lib/creditos/bonus.ts`: o usado do pago + o
    bônus que não sai; `[data-ja-usado]`). A conta não mudou. Prova:
    `e2e/financeiro-dinheiro-da-12.spec.ts` ("A31"), `tests/credito-ja-usado.test.ts`.
  - O uso segue a regra do crédito: não é receita de novo, e a comissão de
    execução é a do atendimento. Sem comissão de venda.
  - Prova: `e2e/vendas-credito-bonus.spec.ts`.
- **A venda do crédito avisa que a cliente não tem acesso ao app** (A55 da 11ª;
  princípio 3: a Daniela comprou o pré-pago e o login dizia só "E-mail ou senha
  incorretos"): "Esta cliente não tem acesso ao app: ela não vai ver o saldo do
  crédito pelo celular. Dar acesso ao app na aba Dados da ficha."
  (`[data-sem-acesso-ao-app]`, `acessoDaClienteAoApp`). Só aviso: quem cria o
  acesso continua sendo a clínica, na ficha (CLAUDE.md §5). Prova: o mesmo spec.

---

### 9.6 Financeiro

- **O que a F67 fechou (2026-11-12) — a régua de quem mexe no dinheiro**:
  - **O checkout do plano é UMA transação** (C32): o app confere (permissão,
    documentos, peças da agenda, horário, quem vendeu) e MONTA os lançamentos
    e os agendamentos; `plano_checkout` trava o plano (`for update`), confere
    que ainda é PROPOSED e grava tudo junto — desconto, lançamentos,
    agendamentos, sessões, o ACCEPTED e a comissão de venda. A segunda
    chegada (duas abas, "tentar de novo") ouve "Este plano já foi fechado.
    Recarregue a tela.". "Quem vendeu" fica no plano (`vendido_por`, A13) e a
    tela o retoma. Prova: `e2e/plano-checkout-uma-transacao.spec.ts`.
  - **A baixa é de Recebimentos (o caixa) em todo caminho** (C33): o
    Financeiro em Gerenciar sem o caixa não tem "Pagar"/"Receber", e o
    check-in do plano usa o caixa, como o avulso.
  - **A baixa do lançamento sem meio exige a forma** (C34), no
    `marcarPagoCore` e no `marcar_pago` do Copilot: "Escolha a forma de
    pagamento." (ficava "Não informado").
  - **O "só os meus" do Financeiro tranca a ACTION** (C35,
    `recusaDoSoOsMeus`, `lib/financeiro/so-os-meus.ts`): não estorna, não
    lança, não cancela pacote, plano nem unidade pré-paga, não dá crédito, não
    traz pacote de fora, não devolve produto, não remarca nem antecipa — a tela
    já escondia, e pela action direta gravava em qualquer registro da unidade.
  - **O estornado do plano não conta como recebido** (C37,
    `emAbertoDoPlano`): o check-in cobrava a menos.
  - **Com a unidade filtrada, o "Débito no período" do Financeiro da rede é o
    da unidade** (D8 da 13ª simulação; era o da rede inteira).
  - **As telas do dinheiro assinam o SINAL `financeiro_sinais`**, não
    `financial_transactions` (a sobra da F63; migration `20261112006710`):
    Financeiro, Fechamento do dia, dashboards, relatórios e a sessão de
    atendimento. Uma linha por rede, marcada por gatilho de COMANDO
    (`trg_sinal_financeiro_ins/upd/del`, com tabela de transição: o lote marca
    uma vez); a tela recarrega pelo servidor, que aplica o alcance. A linha do
    lançamento (valor, cliente) não vai mais pelo websocket a quem o cargo
    deixa ver só "os meus". `financial_transactions` sai da publicação DEPOIS
    do deploy (`20261112006711`). Prova: `e2e/financeiro-sinal.spec.ts`,
    `tests/realtime-assina-sinal.test.ts` (trava a tabela crua num
    `RealtimeRefresher`).
  - **A sessão não lê nem grava lançamento** (F75, a sobra da F63; C1 do
    levantamento): a política "Operacional acessa financeiro da filial" era ALL
    para todo membro da unidade, sem o módulo — a profissional sem o
    Financeiro lia o caixa pela chave pública, e qualquer membro gravava um
    recebimento falso. A lista do Financeiro da unidade lê pelo cliente de
    serviço, depois do `assertPermission`, do "só os meus" e do alcance
    (`assertUnidade`); a política RESTRITIVA `financeiro_so_pelo_servidor`
    (migration `20261113007503`, depois do deploy) fecha a sessão. Leitura
    nova de lançamento é pelo servidor. Prova:
    `e2e/rls-f75-financeiro-pela-sessao.spec.ts` (com o token de cada membro).
  - Prova do resto: `e2e/financeiro-f67.spec.ts`, `tests/vendas-f67.test.ts`.
- **Não existe caixa de ABRIR** (o fechamento do dia, abaixo, é outra coisa:
  conferência, não gaveta aberta). O caixa de abrir e fechar foi removido em 2026-09-18: quase
  nada é recebido em dinheiro vivo (a rede opera em Pix e cartão), e a
  conferência que o fechamento existia para fazer — contar a gaveta e comparar
  com o esperado — não tinha gaveta para contar. A auditoria do dia é a própria
  tela do financeiro: período, unidade e forma de pagamento.
  A tabela `cash_registers` e a coluna `financial_transactions.cash_register_id`
  continuam no banco com o histórico do que já passou por lá; nada novo é
  escrito nelas. Registro financeiro não se apaga.
- **O FECHAMENTO DO DIA** (2026-10-21, decisão do Heitor — sem abertura):
  Dinheiro e estoque → "Fechamento do dia" (`/[slug]/fechamento` e
  `/admin/fechamento?unidade=`, corpo em `app/_shared/fechamento-do-dia.tsx`).
  O dia da unidade por forma de pagamento — entradas (a regra de
  `metrics_receitas_pagas`), saídas pagas e saldo, com o total, tudo de
  `metrics_fechamento_do_dia` (`getFechamentoDoDia`) —, o dinheiro em espécie
  esperado (o saldo de `CASH`), a contagem e quem fechou.
  - É o dinheiro da UNIDADE inteira (D6 da simulação de 2026-10-27): vê
    quem recebe (`cashier`) ou o financeiro com escopo de TODOS
    (`podeVerFechamento` em `lib/auth.ts`, `veFechamento` em `lib/menu.ts`
    — a página, o menu e a busca); FECHA quem recebe e vê (`podeReceber` +
    `podeVerFechamento`, `fecharODia` em `actions/fechamento.ts`). O
    `financial: Ver, só os próprios` da Profissional (que existe para ela ver
    as comissões DELA) abria o saldo da unidade. O menu recebe o escopo
    (`menuSectionsFor(…, scopes)`). É a tela de quem só tem `cashier`.
    Prova: `e2e/fechamento-escopo-proprio.spec.ts`.
  - Cada fechamento é um REGISTRO em `fechamentos_do_dia` (com o retrato do
    resumo, refeito no servidor; a diferença é coluna gerada). Fechar de novo
    não apaga o anterior — vale o mais recente. Dia futuro não fecha.
  - **Os avisos** (J-49, 2026-10-30), acima da tabela, todos com número do
    banco: (1) há dinheiro a receber — os concluídos a receber da unidade
    (o total da lista `atendimentos_a_receber`); (2) houve lançamento DEPOIS
    do último fechamento (pago depois de `fechado_em`: feche de novo); (3)
    saiu em espécie mais do que entrou (o esperado na gaveta é negativo — não
    há caixa de abrir, então é "pagou em dinheiro mais do que recebeu em
    dinheiro"); e (4) uma linha só INFORMATIVA com as taxas da maquininha
    estimadas do dia (cada recebimento × a taxa da forma, a tabela de
    Configurações → Comissões — `comissao_taxa_pct`), que não saem do saldo.
    (2) e (4) são `metrics_avisos_do_fechamento` (`getAvisosDoFechamento`;
    migration `20261029001504`). E (5), F16-2: a venda no cartão do dia sem
    taxa da maquininha cadastrada para a forma, as vezes e a bandeira — saiu
    sem desconto da operadora (`metrics_vendas_sem_taxa_do_fechamento`, §9.6
    "Sem a taxa EXATA"). Prova: `e2e/fechamento-do-dia-avisos.spec.ts`,
    `e2e/financeiro-cartao-por-bandeira.spec.ts` ("F16-2").
  - **Sem dinheiro em espécie, não se digita 0; e o dia aberto avisa** (A50
    da 5ª simulação). Nada esperado e nenhum movimento em dinheiro no dia: o
    "Dinheiro contado" é opcional, e em branco fecha com R$ 0,00. Hoje,
    antes do fim do expediente da unidade (`diaAindaAberto`, o horário da
    unidade naquele dia da semana), a tela diz "A unidade atende até 22:00: o
    dia ainda está aberto. O que entrar depois deste fechamento pede fechar
    de novo." — só aviso: fechar antes continua valendo. Prova:
    `e2e/fechamento-do-dia-atritos.spec.ts`, `tests/fechamento-dia-aberto.test.ts`.
  - **Fundo de troco OPCIONAL** (ven-03 da revisão, 2026-11-02; o Heitor:
    "flexibilidade, precisamos dar as opções para que a rede possa operar da
    maneira que melhor lhe convier"). "Informar fundo de troco" no
    Fechamento (quem fecha o dia; `informarFundoDeTroco`, unidade ao
    alcance): o dinheiro que já estava na gaveta no começo do dia, um por
    unidade e dia em `fundos_de_troco` (informar de novo troca; zero é sem
    fundo). Informado, o "Dinheiro em espécie esperado" é o fundo + o saldo
    em dinheiro do dia ("R$ 100,00 de fundo de troco − R$ 50,00 do dia em
    espécie"), e a conta é de `getFechamentoDoDia` (`lib/metrics`,
    `fundoDeTroco`/`saldoDinheiro`/`esperadoDinheiro`, em centavos); o
    aviso "saiu mais dinheiro em espécie do que entrou" só aparece quando o
    esperado COM o fundo fica negativo, e o fechamento guarda o fundo no
    retrato (`fechamentos_do_dia.fundo_de_troco`). Sem fundo, tudo segue
    como antes. A taxa da maquininha estimada continua a linha informativa
    de sempre: não sai do saldo nem do fundo. Migration `20261101001108`.
    Prova: `e2e/fechamento-do-dia-fundo-de-troco.spec.ts`.
  - **E aponta o que a operadora do cartão ainda vai depositar** (A44 da 7ª
    simulação, 2026-11-05; o a receber da operadora mora no Financeiro, F20 D3):
    "A operadora do cartão ainda vai depositar R$ 1.100,00 (o próximo, R$ 550,00
    em 05/12/2026)…" — o em aberto de `getAReceberDaOperadora` da unidade (aviso
    `a-receber-da-operadora`), com "Ver no Financeiro" (a lista das parcelas,
    `#recebiveis-da-operadora`) a quem abre o Financeiro da unidade inteira. Só
    informação: não mexe no saldo. Prova: `e2e/financeiro-atritos-da-7.spec.ts` ("A44").
  - **Os atritos do Fechamento da 8ª simulação** (2026-11-06; princípio 3):
    - **Os estornos do dia aparecem** (A42): "Estornos do dia · R$ 397,00"
      (`[data-estornos-do-dia]`) lista cada estorno pago no dia (a descrição,
      a forma e o motivo), com o total de `getEstornosDoDia`
      (`lib/metrics/fechamento-extra.ts`, em centavos).
    - **O estorno sai no dia em que o dinheiro sai** (D2 da 12ª simulação,
      2026-11-11 — DECIDIDO pelo princípio 5; `indicadores.md`, "Estorno: cada
      lado no seu dia"): o Fechamento de um dia, fechado ou não, não muda por
      um estorno feito depois — o pagamento fica nele pelo valor que entrou (o
      parcial, pelo de antes). O estorno de um pagamento de OUTRO dia é SAÍDA
      do dia em que foi feito, na forma do pagamento; o do MESMO dia já está
      fora das entradas (um anula o outro, como sempre). Cada item dos
      estornos diz qual dos dois: "Pagamento de 10/11: sai nas saídas deste
      dia." ou "Pagamento deste dia: já fora das entradas."
      (`[data-estorno-do-dia]`, `[data-de-outro-dia]`), e o texto diz quanto
      das saídas são estornos de outros dias (`metrics_estornos_das_clientes_do_dia`:
      `pago_em`, `mesmo_dia`, `total_de_outros_dias`). O CSV do Fechamento
      traz "Pagamento de" e "Nas saídas do dia". Prova:
      `e2e/financeiro-dinheiro-da-12.spec.ts`.
    - **Os estornos do dia são o que voltou às CLIENTES** (D3 da 12ª; sobra da
      F38): o estorno de uma DESPESA (a energia paga duas vezes) aparecia como
      "O que voltou às clientes", com "− R$ 780,00" — o dinheiro voltou ao
      CAIXA. Ele sai da lista (e do CSV); no outro dia, é ENTRADA do caixa na
      forma dele (no mesmo dia, um anula o outro). A linha do Financeiro do
      contra-lançamento de uma despesa diz "Anula a despesa estornada"
      (`[data-anula-a-despesa]`). O estorno do uso do crédito na clínica
      também sai (não é dinheiro do caixa). **E por isso quem só tem
      Recebimentos não lê no Fechamento a descrição nem o motivo de uma
      despesa** (A39 da 12ª): as saídas aparecem só pela forma; a descrição e
      o motivo da despesa ficam no Financeiro, de quem o tem. Prova: o mesmo
      spec ("D3", "A39").
    - **O da rede abre na unidade com movimento e mostra a clínica toda**
      (A45): com duas ou mais, "O dia na clínica" (`[data-fechamento-da-rede]`)
      — cada unidade com as entradas e as saídas do dia (ou "Sem movimento"),
      a aberta marcada, e o "Total da clínica" (`getMovimentoDasUnidades`, a
      conta do Fechamento por unidade); sem `?unidade=`, abre na primeira que
      teve movimento (era a primeira em ordem alfabética). Fechar continua por
      unidade.
    - **Num dia passado, o "a receber" diz que é o de hoje** (A48; a regra D5
      de 27/10 fica): "Os concluídos a receber abaixo são os de hoje, de
      qualquer dia (até alguém receber) — não só os deste dia."
      (`[data-a-receber-de-qualquer-dia]`), e o título "Concluídos a receber
      hoje, de qualquer dia".
    - Prova: `e2e/financeiro-atritos-da-8.spec.ts`.
  - **Por quem recebeu** (A40 da 11ª simulação, 2026-11-10; princípio 3: a
    Elaine e a Fabiana no caixa da Azaleia, e cada uma precisava saber o que
    entrega): o quadro "Por quem recebeu" (`[data-por-quem-recebeu]`) lista as
    entradas do dia de cada pessoa, por forma, e o total dela — o mesmo conjunto
    do resumo (a regra única de receita), contado no banco
    (`metrics_fechamento_por_quem_recebeu` → `getFechamentoPorQuemRecebeu`,
    `lib/metrics/fechamento-extra.ts`). Quem recebeu é
    `financial_transactions.recebido_por` (migration `20261110005601`): no
    lançamento que já nasce pago, quem o lançou (o gatilho
    `trg_lancamento_guarda_o_pagamento`, pelo `created_by`); na baixa depois
    (a parcela do crediário, o atendimento concluído, o plano no check-in), quem
    deu a baixa (`marcarPagoCore`, `confirmar_pagamento_do_atendimento`,
    `plano_receber`). O recebimento de antes da coluna só é atribuído quando
    nasceu pago; o resto aparece "Quem recebeu não registrado" (princípio 4).
    As saídas e os estornos ficam no total da unidade. O CSV do Fechamento traz
    a seção "Por quem recebeu" (A44 da 11ª: só trazia as formas). Prova:
    `e2e/financeiro-atritos-da-11.spec.ts` ("A40"), `tests/csv-da-contadora.test.ts`.
  - **O dia que ninguém fechou diz "Ainda não fechado"** (A47 da 12ª
    simulação, 2026-11-11; princípio 3: a Ivone não sabia se o dia faltava
    fechar): "Ainda não fechado: ninguém fechou este dia."
    (`[data-ainda-nao-fechado]`), para quem fecha e para quem só vê; o CSV do
    Fechamento traz "Situação do dia" ("Ainda não fechado" ou "Fechado por
    Cláudia em 11/11/2026 às 01:51; Bateu", `situacaoDoFechamento`). Prova:
    `e2e/financeiro-atritos-da-12.spec.ts` ("A47").
  - Prova: `e2e/fechamento-do-dia.spec.ts`.
- **O atendimento CONCLUÍDO a receber tem porta e lista** (D5 da simulação
  de 2026-10-27, decisões do Heitor). A conta é UMA, no banco
  (`atendimentos_a_receber`, `getAtendimentosAReceber` em
  `lib/metrics/a-receber.ts`): concluído, com preço, avulso (sem plano, sem
  sessão de pacote, sem unidade pré-paga) e sem recebimento pago — o mesmo
  conjunto que `confirmar_pagamento_do_atendimento` aceita. Ela alimenta:
  - a janela da agenda (`situacaoDaCobranca`, `actions/a-receber.ts`):
    "Receber pagamento", que leva à tela do atendimento com `?receber=1` (a
    janela do pagamento já aberta), pelos dois portais (`lib/rotas`);
  - o Fechamento do dia: "Concluídos a receber" da unidade, de QUALQUER dia
    (cliente, procedimento, valor, "Receber"), com o total do banco;
  - a ficha da cliente ("Atendimentos a receber") e o "Vender" da ficha, que
    avisa quando há um a receber do MESMO procedimento (cobraria duas vezes).
  O botão "Receber" é de quem tem `cashier` (o mesmo de `confirmPayment`).
  Prova: `e2e/financeiro-a-receber-concluido.spec.ts`.
- **A aba Financeiro da ficha da cliente** é UMA leitura nos dois portais
  (`financeiroDaFicha`, `lib/clientes/financeiro-da-ficha.ts`): os
  lançamentos da cliente, os totais do banco (`metrics_financeiro_do_cliente`
  — pago pela regra de receita, a receber = lançamentos em aberto + os
  concluídos a receber sem lançamento, e o crédito interno) e os
  atendimentos a receber. Com `financial` "só os próprios" e sem `cashier`,
  só o que é dos atendimentos DELA, totais incluídos, e sem o crédito interno
  (é da cliente, não de um atendimento) — D6, 2026-10-27. Quem recebe vê
  tudo. A aba somava na tela as últimas 50 linhas.
  **As Transações saem em ordem e cabem no celular** (D7 da 10ª simulação,
  2026-11-10; princípio 3): a tabela de cinco colunas rolava de lado a 412 px
  (695 px num espaço de 378), escondendo o valor, a forma e o "Vencida em", e
  as parcelas gravadas no mesmo instante saíam embaralhadas (3/3, 1/3, 2/3,
  entrada). No celular cada lançamento é um cartão (`cards-mobile`), e a ordem
  é a da data que a LINHA MOSTRA, da mais nova para a mais antiga — o
  vencimento da parcela em aberto, o dia do atendimento, senão o lançamento;
  no empate, a parcela maior primeiro (`ordenarTransacoesDaFicha`,
  `lib/clientes/ordem-das-transacoes.ts`). Prova:
  `e2e/ficha-atritos-da-10.spec.ts` ("D7"), `tests/ordem-das-transacoes.test.ts`.
- **A pergunta "Ninguém foi marcado em “Quem vendeu”… Vender assim?" fica à
  vista** (A1 da 10ª simulação, 2026-11-10): no Vender a 412 px ela nascia no
  fim da janela, abaixo da tela, e o botão parecia morto. Ao aparecer, a
  pergunta (`PerguntaDaVenda`, a mesma do checkout do plano) rola até ficar
  inteira na tela e o foco vai para "Vender assim"; e a folha do modal no
  celular passou a caber na tela (`design.md`). Prova:
  `e2e/vendas-pergunta-no-celular.spec.ts`.
- **Atendimento de R$ 0 conclui SEM cobrança** (D9, 2026-10-27): a tela diz
  "Sem cobrança", não entra em "a receber", concluir não lança conta a
  receber de zero, e `confirmar_pagamento_do_atendimento` recusa
  ("Atendimento sem cobrança"). A avaliação de R$ 0 ficava "Aguardando
  confirmação de pagamento" para sempre. (Não havia lançamento de zero preso
  na produção: os dois concluídos de R$ 0 não tinham lançamento.)
- O módulo `cashier` **sobreviveu com outro significado**: RECEBER o pagamento
  do atendimento e do plano, na recepção. Não abre tela nenhuma por si só — o
  financeiro da unidade e o da rede pedem `financial`. `podeReceber` (cashier OU
  financial) continua sendo o gate de quem fecha uma venda.
- `FinancialTransaction` criada automaticamente ao concluir `Appointment`
- **Cada parcela é um LANÇAMENTO** (pedido do Heitor, 2026-09-30): o
  parcelado grava a entrada ("— entrada") e uma linha de
  `financial_transactions` por parcela, com o vencimento dela, "— parcela
  2/3" na descrição e `parcela_numero`/`parcela_total`/`parcela_grupo` (o grupo
  liga as parcelas do mesmo parcelamento). Pagar, estornar, comissão,
  fidelidade e métricas já operam por lançamento — passam a valer por
  parcela. Vale para pacote, pré-pago, checkout e recebimento do plano e
  despesa parcelada; a divisão é uma só (`dividirEmParcelas`,
  `lib/checkout/parcelas.ts`: centavos, sobra na última, dia 31 vira o último
  dia do mês curto).
  - Era UM lançamento com o saldo inteiro e o vencimento da 1ª; as parcelas
    moravam em `installments`, que nenhuma tela lia, e o "Pagar" quitava o
    saldo de uma vez. `installments` agora é histórico (nada novo é escrito).
  - **`data_de_referencia`** (coluna gerada): o pago, no dia do pagamento; o
    em aberto, no vencimento (ou na criação, sem vencimento). É por ela que a
    lista do financeiro recorta o período — a parcela de novembro aparece em
    novembro — e que o "a receber" do período conta.
- **O financeiro da rede tem "A receber" e "A pagar"**, e as duas listas (rede
  e unidade) a coluna **Cliente** (2026-10-21, decisão do Heitor). Os números
  são os da unidade: `revenuePending` (getCore/getByBranch) e
  `metrics_a_pagar` até o fim do período; com uma unidade recortada, os dela.
  O cliente é `financial_transactions.client_id` (embed
  `clients!financial_transactions_client_id_fkey` na rede); sem ele, "—". Prova:
  `e2e/financeiro-rede-a-receber.spec.ts`. **Na unidade, o nome vem de
  `nomesDosRegistros`, não do embed da sessão** (D2 da simulação de
  2026-11-01): a RLS mostra a ficha só à unidade de CADASTRO, e a venda da
  cliente de outra unidade saía com "—" (regra em `atendimento.md` §9.1).
  Prova: `e2e/agenda-nomes-de-outra-unidade.spec.ts`.
  - **"A receber" e "A pagar" valem pelo VENCIMENTO e dizem isso** (A34,
    2026-10-27): os dois cartões (unidade e rede, e cada unidade no recorte da
    rede) vêm de `getEmAberto` (`metrics_em_aberto`): em aberto com a data de
    referência no período, até o FIM dele (o "A receber" ia só até agora), e o
    PRÓXIMO vencimento depois do período. O cartão diz "Pelo vencimento, no
    período." e, com zero, "Próximo: R$ 300,00 em 05/11"
    (`NotaDoVencimento`). O "A pagar R$ 0" com a conta vencendo no mês
    seguinte parecia conta sumida. Prova: `e2e/financeiro-a-pagar-vencimento.spec.ts`.
  - **O "A receber" diz também todo o crediário** (D-14, decisão do Heitor,
    2026-10-29): o cartão mantém o número do mês e, abaixo, "Em aberto, todos
    os vencimentos: R$ X" — todas as parcelas e recebíveis em aberto, de
    qualquer vencimento (`metrics_a_receber_em_aberto` → `getAReceberEmAberto`:
    o conjunto do "a receber" de `metrics_em_aberto`, sem a janela; migration
    `20261029001105`). Nos dois financeiros (a rede, cada unidade no recorte e
    a unidade), no escopo do financeiro ("só os meus": o ligado aos
    atendimentos dela). Prova: `e2e/financeiro-a-receber-todos-os-vencimentos.spec.ts`.
- **O fluxo de caixa dos PRÓXIMOS meses** (r2-fin-04, o Heitor, 2026-11-03:
  "crie o gráfico"). Nos dois financeiros, o cartão "Fluxo de caixa — próximos
  6 meses" (`FluxoDeCaixa`, `components/shared/fluxo-de-caixa.tsx`) — **3, 6 ou
  12 meses, a clínica escolhe no cartão** (r3-f13-11, o Heitor: "quem vende
  pacote em 10x quer ver o ano"; 6 por padrão, o título acompanha: o servidor
  manda os 12, a tela mostra os primeiros N): por mês
  (Brasília, a partir do atual), o que ENTRA — o a receber da cliente (os
  lançamentos de receita em aberto) e o que a operadora do cartão ainda
  deposita (`recebiveis_do_cartao` vivos e não recebidos), empilhados — e o que
  SAI (as despesas a pagar), pelo vencimento, num gráfico de barras e numa
  tabela com o saldo de cada mês. O que já venceu e está em aberto conta no
  mês atual. A conta é `metrics_fluxo_de_caixa` → `getFluxoDeCaixa`
  (`lib/metrics/fluxo-de-caixa.ts`; migration `20261103001307`); na rede, o
  do recorte e o de cada unidade (o filtro de unidade troca o gráfico). Os
  concluídos sem pagamento (sem lançamento, sem vencimento) não entram. Com o
  financeiro "só os meus", não aparece (é o dinheiro da unidade). Prova:
  `e2e/financeiro-fluxo-de-caixa.spec.ts`.
- **O total da LISTA do financeiro tem sinal** (J-48, 2026-10-30): "2
  lançamentos · resultado −R$ 2.400,00" — o pago que entrou menos o pago que
  saiu do que está filtrado na tela, sem os dois lados do estorno. A conta é
  `resultadoDaLista` (`lib/metrics/resultado.ts`, em centavos), sobre a lista
  lida inteira (`lerTodas`); a tela fazia o reduce e tirava o sinal com
  `Math.abs` (só a cor dizia que era negativo). Prova:
  `e2e/financeiro-lista-total-com-sinal.spec.ts`, `tests/metrics-resultado-da-lista.test.ts`.
  **E diz que é o caixa da lista, não o resultado do período** (A31 da 9ª
  simulação, 2026-11-07; princípio 3): eram dois "resultados" na tela (o
  "Lucro líquido" de −R$ 4.325,82 e a lista de −R$ 1.929). A lista diz "14
  lançamentos · caixa da lista −R$ 1.929,00", e embaixo da conta do Lucro
  (e do Resultado da rede) "É o resultado do período (competência): o insumo
  conta quando é usado e a comissão quando é lançada. O total da lista de
  lançamentos é o caixa." (`[data-base-do-resultado]`, `ContaDoResultado`).
  Em Relatórios → Financeiro, o cartão é "Despesas pagas (caixa)", com o
  detalhe de que entram a compra de estoque e o pagamento das comissões (o DRE
  usa só a operacional). Prova: `e2e/financeiro-ficha-e-app-da-9.spec.ts` ("A31").
  **E é o caixa de verdade** (D9 e D2 da 12ª simulação, 2026-11-11; princípio
  3): "13 lançamentos · caixa da lista R$ 3.383,64" ao lado da receita de
  R$ 3.203,64 — os R$ 180 pagos com crédito na clínica entravam, e a própria
  linha dizia "não é receita". Cada lançamento conta no caixa o que o BANCO diz
  (`metrics_caixa_dos_lancamentos` → `getTaxaDosLancamentos`, `no_caixa`): o
  pagamento pelo valor que entrou, o estorno ligado com o sinal dele, e nada o
  em aberto, o uso do crédito na clínica (e o estorno dele) e o pago todo em
  pontos — a mesma régua do Fechamento (`metrics_movimentos_pagos`). Somado na
  lista do dia, é o saldo do Fechamento do dia (`resultadoDaLista` soma o
  `no_caixa`; sem ele, a regra de antes, sem o crédito interno). Prova:
  `e2e/financeiro-dinheiro-da-12.spec.ts` ("D9"), `tests/metrics-resultado-da-lista.test.ts`.
- **O "Em aberto, todos os vencimentos" leva à baixa** (A38 da 8ª simulação,
  2026-11-06): a parcela do crediário que vence no mês que vem não aparecia em
  Lançamentos (a lista é do período, pela data de referência), e não se via
  onde dar baixa. O cartão "A receber da cliente" diz "Ver e dar baixa", que
  abre a lista com TODO o a receber em aberto, de qualquer vencimento
  (`?aberto=todos`, `[data-so-o-em-aberto]`, nos dois financeiros), com o
  "Pagar" na linha e "Voltar ao período". O período da lista não mudou.
  **A quem só vê, "Ver a lista"** (A42 da 12ª simulação, 2026-11-11; princípio
  3: a Ivone, contadora, lia "Ver e dar baixa" e "use “Pagar” na linha" sem
  botão nenhum): sem a baixa (`canPay`), o link é "Ver a lista" e a faixa diz
  "Dar baixa é de quem tem Recebimentos (o caixa)…" (`NotaDoVencimento
  podeDarBaixa`). **E o a PAGAR também** (A43 da 12ª): o cartão "A pagar" diz
  "Em aberto, todos os vencimentos: R$ 5.200,00 · Ver e pagar" (ou "Ver a
  lista") — `metrics_a_pagar_em_aberto` → `getAPagarEmAberto` (migration
  `20261111006103`), o espelho do a receber —, que abre a lista de toda conta a
  pagar em aberto, de qualquer mês (`?aberto=a-pagar`, nos dois financeiros).
  Prova: `e2e/financeiro-atritos-da-12.spec.ts` ("A42 e A43").
- **A parcela VENCIDA tem nome, filtro e aviso** (D13 da 9ª simulação,
  2026-11-07; decidido pelo princípio 3): a 1ª parcela da Mariana venceu em
  05/11 e era "Pendente", igual à que vai vencer, no Financeiro, na ficha, no
  dashboard e no app. Vencida é o a receber em aberto com o vencimento ANTES
  de hoje em Brasília (o que vence hoje ainda não venceu) — a régua é UMA,
  `situacaoDoVencimento` (`lib/financeiro/vencimentos.ts`, decidida no
  servidor, que manda `vencida` à tela) e, para os números,
  `metrics_a_receber_vencido` → `getAReceberVencido` (`lib/metrics/vencidas.ts`;
  migration `20261107004403`).
  - As listas dos dois financeiros e a aba Financeiro da ficha dizem "Vencida
    em 05/11" (`SituacaoDoEmAberto`, `[data-vencida]`); a lista da unidade tem
    a situação "Vencidas" no filtro.
  - O cartão "A receber da cliente" diz "Vencidas: R$ 1.294,00 (1 parcela,
    desde 05/11) · Ver as vencidas" (`[data-vencidas]`), que abre a lista só
    das vencidas, de qualquer mês (`?aberto=vencidas`, nos dois financeiros).
  - O dashboard (da unidade e da rede, a quem vê o financeiro inteiro) avisa
    "1 parcela vencida da cliente: R$ 1.294,00 (a mais antiga venceu em
    05/11)… Ver no Financeiro" (`ParcelasVencidas`, `[data-parcelas-vencidas]`).
  - O app (Financeiro e Histórico → Pagamentos) diz "Vencida em 05/11" e a
    situação "Vencida".
  - **O check-in avisa, sem recusar**: a recepção marca "Chegou" e lê
    "Mariana tem 1 parcela vencida (R$ 1.294,00, desde 05/11): receba no
    Financeiro." (`updateAppointmentStatus`/`checkinAppointment` devolvem
    `aviso`, só para quem recebe). A cobrança no check-in continua só a do
    plano (`emAbertoDoPlano`).
  - Prova: `e2e/financeiro-vencidas-da-9.spec.ts`, `tests/financeiro-vencida.test.ts`.
- **Remarcar o vencimento** (A37 da 9ª simulação): a parcela do crediário só
  tinha "Pagar". Quem tem o Financeiro em Gerenciar (sem "só os meus", com a
  unidade ao alcance) tem "Remarcar vencimento" na linha em aberto dos dois
  financeiros (`RemarcarVencimento`, `remarcarVencimento` em
  `actions/financial.ts`): o novo dia e um motivo opcional, gravados por
  `lancamento_remarcar_vencimento` (migration `20261107004404`), que guarda o
  histórico no lançamento (`vencimentos_anteriores`: de, para, quem, quando,
  motivo). A linha diz "Vencimento remarcado: era 05/11 (Lúcia, em 07/11 —
  combinado com a cliente)" (`[data-vencimento-remarcado]`). O pago e o
  estornado não se remarcam. Prova: `e2e/financeiro-vencidas-da-9.spec.ts` ("A37").
- **O CSV das movimentações** (A44 da 8ª: a contadora só tinha o de Comissões):
  "Exportar CSV" na lista dos dois financeiros — o que a lista tem, com os
  filtros da tela (na rede, todas as movimentações do recorte, não só as 100
  que a tabela desenha), com Data; Descrição; Cliente; (Unidade;) Categoria;
  Tipo; Forma; Situação; Valor — o valor com sinal (despesa e estorno
  negativos), ponto e vírgula e BOM (`csvDosLancamentos`,
  `lib/financeiro/csv-dos-lancamentos.ts`; o arquivo
  "lancamentos-AAAA-MM-DD-a-AAAA-MM-DD.csv"). Prova: o mesmo spec,
  `tests/financeiro-csv-dos-lancamentos.test.ts`.
  **E é o pacote da contadora** (A31 da 10ª simulação, 2026-11-10: a Lúcia não
  fechava o mês com o que exportava): o CSV ganhou Taxa da maquininha e Líquido
  (da receita paga, pela MESMA conta do lucro — `metrics_taxa_dos_lancamentos`,
  `getTaxaDosLancamentos`, `lib/metrics/contadora.ts`), Vencimento, Pago em,
  Fornecedor e Nota fiscal. O "Novo lançamento" pede "Fornecedor" (na despesa)
  e "Nota fiscal" (`financial_transactions.fornecedor`/`nota_fiscal`, migration
  `20261110005102`; os três caminhos do lançamento os gravam). A "competência"
  pedida não existe como regra (a despesa entra quando é paga — `indicadores.md`):
  o CSV dá o vencimento e o dia do pagamento, e a contadora monta a dela. E se
  exportam também o **DRE** (Relatórios → Financeiro, "Exportar o DRE (CSV)":
  as linhas do DRE e o que fica FORA do resultado — as compras no estoque, ao
  custo, com fornecedor e nota, e as perdas —, `csvDoDre`) e o **Fechamento do
  dia** ("Exportar CSV": as formas, o total, o esperado em espécie e os
  estornos, `csvDoFechamento`; os dois em `lib/financeiro/csv-da-contadora.ts`).
  A compra e a perda chegam à contadora, que não abre o Estoque: embaixo do DRE,
  "Fora do resultado no período: compras no estoque R$ X · perdas R$ Y"
  (`[data-fora-do-resultado]`, `metrics_entradas_de_estoque` →
  `getEntradasDeEstoque`). Prova: `e2e/financeiro-uso-da-10.spec.ts` ("A31"),
  `tests/financeiro-csv-dos-lancamentos.test.ts`, `tests/csv-da-contadora.test.ts`.
  **E diz o que conta no caixa** (A45 da 12ª; princípio 3): o CSV trazia o
  pagamento "Estornado", o "Estorno" e a nova linha juntos, e somar a coluna
  Valor dava errado sem filtrar a Situação. A coluna "Conta no caixa" (Sim/Não,
  logo depois do Valor) é o `no_caixa` do banco, e o Valor do "Sim" é o que ele
  conta (o pagamento estornado em parte, pelo que entrou; o estorno, negativo):
  somar só os "Sim" dá o caixa do período. A taxa e o líquido seguem a mesma
  régua (a taxa do estornado no dia dele, a do estorno negativa no dele). Prova:
  `e2e/financeiro-dinheiro-da-12.spec.ts` ("A45"), `tests/financeiro-csv-dos-lancamentos.test.ts`.
  **E tem a bandeira, o desconto, a profissional e a unidade** (A44 da 12ª;
  princípio 3: a Ivone concilia com a operadora por bandeira e fecha o mês com
  o desconto e quem atendeu): as colunas Unidade (sempre, também na clínica de
  uma só), Profissional (quem atendeu; na venda, quem vendeu — a coluna
  Profissional das Vendas), Bandeira (do cartão) e Desconto (em reais: o do
  avulso no lançamento; o da venda UMA vez, no lançamento do motivo ou no
  primeiro dela — `extrasDoCsv`, `lib/financeiro/extras-do-csv.ts`), e o
  fornecedor e a nota dizem "(se informado)". O Fechamento do dia divide o
  cartão por bandeira ("Cartão de crédito 6x — Visa R$ 630,00 · Mastercard R$
  600,00", `[data-bandeiras-da-forma]`, `metrics_fechamento_por_bandeira` →
  `getFechamentoPorBandeira`, migration `20261111006103`; o mesmo conjunto do
  resumo), e o CSV dele ganha "Cartão por bandeira". Prova:
  `e2e/financeiro-atritos-da-12.spec.ts` ("A44"), `tests/atritos-da-12-f61.test.ts`.
- **Os cartões dizem a base** (A24 da 10ª simulação; princípio 3: Faturamento
  − Despesas ≠ Lucro, e pagar as comissões subia as Despesas sem mexer no
  lucro): o cartão das despesas é "Despesas pagas (caixa)" no Financeiro da
  unidade, no da rede ("Despesas pagas da unidade (caixa)" no recorte) e na
  Visão geral dos Relatórios, e diz que tem a compra de estoque e o pagamento
  das comissões, que ficam fora do lucro (o lucro usa a despesa operacional; o
  gráfico, o "Custo do lucro"). A conta não mudou. E **o valor não parte o
  sinal** (A25): os valores dos cartões e do DRE são `white-space: nowrap` — o
  "-" de "-R$ 13.020,00" ficava sozinho numa linha. Prova: o mesmo spec ("A24",
  "A25").
- **O pagamento de R$ 0 diz com o que foi pago** (A23 da 10ª): o pago todo com
  o voucher ou os pontos (`amount` 0, `loyalty_discount` > 0) dizia "Receita ·
  Pago · + R$ 0,00" com "Estornar". A linha diz "Pago com o voucher “X”: R$
  180,00" (ou "Pago com pontos: …", `pagosSemDinheiro`,
  `lib/financeiro/pago-sem-dinheiro.ts`; `[data-pago-sem-dinheiro]`) e o botão é
  "Desfazer o pagamento" — a janela diz que nenhum dinheiro volta: o voucher
  volta a valer e os pontos voltam ao saldo. O estorno fica (é o caminho
  documentado de desfazer o uso do voucher, `fidelidade.md`). Prova: ("A23").
- **O pagamento estornado em parte diz o que foi pago** (A36 da 11ª simulação,
  2026-11-10; princípio 3 — a regra r2-ven-05 não muda: o pagamento passa a
  valer o usado e o "Estorno parcial" leva o resto). A linha do pacote dizia só
  "Pix · 110,00", e quem lia não via que a Camila pagou R$ 1.100. O pagamento
  PAGO de receita que diminui guarda o valor de antes
  (`financial_transactions.valor_antes_do_estorno`, pelo gatilho
  `trg_lancamento_guarda_o_pagamento` — vale nas cinco portas do estorno
  parcial; migration `20261110005601`), e a linha dos dois financeiros diz
  "Pago R$ 1.100,00 · R$ 990,00 estornados" (`notaDoEstornoParcial`,
  `lib/financeiro/notas-do-lancamento.ts`, `[data-estorno-parcial-do-lancamento]`).
  Os estornos parciais de antes da coluna ficam sem a nota. No caixa, o dia do
  pagamento conta o valor de antes, e o estorno sai no dia dele (D2 da 12ª,
  acima). **E o app da cliente diz o mesmo** (A57 da 12ª): a compra de crédito
  da Bruna estornada em parte aparecia "Crédito na clínica R$ 163,64 Pago";
  agora, embaixo, "R$ 300,00 pagos · R$ 136,36 devolvidos"
  (`notaDoEstornoParcialParaACliente`, `[data-devolvido-em-parte]`, no
  Financeiro do app). Prova: `e2e/financeiro-dinheiro-da-12.spec.ts` ("A57"),
  `tests/financeiro-notas-do-lancamento.test.ts`.
- **O uso do crédito na clínica diz que não é receita** (A37 da 11ª): a linha
  "Receita · Pago · + R$ 130,00" do pagamento com `INTERNAL_CREDIT` ganha "Uso
  do crédito na clínica: não é receita — o caixa foi quando o crédito foi
  comprado…" (`notaDoUsoDeCredito`, `[data-uso-de-credito]`). A regra F7 fica.
- **O "A receber da operadora" diz o débito** (A38 da 11ª; princípio 4: o
  débito e o Pix não têm prazo configurado): "Débito no período: R$ 540,00 —
  conta como recebido no dia da venda" (`NotaDoDebito`,
  `[data-debito-no-periodo]`, o débito da composição por forma,
  `metrics_financeiro_composicao`), nos dois financeiros. Prova (A36–A38):
  `e2e/financeiro-atritos-da-11.spec.ts`, `tests/financeiro-notas-do-lancamento.test.ts`.
- **"Remarcar vencimento" com a palavra, também na ficha** (A22 da 10ª; sobra
  da A37 da 9ª): o botão da lista dos dois financeiros diz "Remarcar
  vencimento" (era só o ícone), e a parcela em aberto da aba Financeiro da
  ficha o tem para quem remarca (o Financeiro em Gerenciar, sem "só os meus").
  Prova: ("A22").
- **As Vendas fazem a ponte com o caixa** (A30 da 10ª; princípio 5): embaixo
  dos cartões de Relatórios → Vendas, "O Total vendido é a venda, no dia em
  que foi feita; o caixa do período é o dinheiro, no dia em que entrou: R$ X
  (Financeiro). A diferença é a regra…" — o crédito na clínica vendido, o
  pacote e o plano inteiros, a sessão que não é venda de novo
  (`[data-ponte-vendas-caixa]`; o caixa é o `revenueCash` do núcleo). Prova:
  ("A30").
- **"Novo lançamento" é de quem lança** (D7 da 5ª simulação, 2026-11-01):
  com o Financeiro em Ver, o financeiro da rede mostrava o botão
  (`AdminFinancialView canWrite`, como o da unidade já fazia), e a recusa
  chegava como "Forbidden". Todo `catch` das actions que devolvia `e.message`
  passa por `mensagemDoErro` ("Seu cargo não libera esta ação."), e o erro cru
  do banco no lançamento parcelado/recorrente virou "Não consegui gravar os
  lançamentos." Prova: `e2e/permissoes-quem-so-ve.spec.ts`.
- **O lançamento manual pago tem a DATA do pagamento** (2026-10-21, decisão
  do Heitor): "Data do pagamento" no Novo lançamento (hoje por padrão, nunca no
  futuro — a tela limita e `pagoNoDia`, em `lib/financeiro/lancamento.ts`,
  recusa). Hoje é o instante de agora; antes de hoje, o meio-dia daquele dia
  em Brasília. Era sempre "agora": a conta paga na semana passada caía no caixa
  de hoje. Prova: `e2e/financeiro-data-do-lancamento.spec.ts`.
- **A despesa não tem desconto, e tem "Contas"** (J-50, 2026-10-30): no Novo
  lançamento, o "Desconto" só aparece na RECEITA (desconto é de venda; a
  despesa é o que se pagou — o campo diz "Valor", não "Valor bruto"), e o
  desconto digitado antes de trocar para despesa não entra no valor. A
  categoria "Contas (energia, água, internet)" é despesa operacional comum
  (caixa e lucro); só a "Compra de estoque" fica fora do lucro
  (`lib/financeiro/categorias.ts`). Prova: `e2e/financeiro-despesa-sem-desconto.spec.ts`,
  `tests/financeiro-categorias.test.ts`.
- **O dinheiro DIGITADO tem UMA leitura** (`parseDinheiro`,
  `@estetica-os/utils`; D10 de 2026-10-27 e D3 de 2026-10-29): "180" é
  R$ 180,00; com vírgula, ela é a dos centavos (até dois dígitos) e o ponto é
  milhar ("1.400,50"); sem vírgula, o ponto seguido de grupos de EXATAMENTE
  três dígitos é milhar ("1.400", "12.500") e com um ou dois é decimal
  ("180.50"). O ambíguo ("0.012", "1.4000", "1,400.50", centavos com três
  dígitos) é NaN — não se adivinha: a tela mantém o que foi escrito e mostra
  `DINHEIRO_INVALIDO` ("use vírgula para os centavos") junto do campo, e a
  action recusa com a mesma frase. "1.400" no preço da Toxina gravava
  R$ 1,40, sem aviso. Valem por ela o cadastro do procedimento (preço, mão de
  obra, outros custos, preço por unidade), a comissão padrão do membro, as
  regras de comissão, o preço do pacote, o desconto, a entrada (contrato e
  checkout), o dinheiro contado do fechamento e o valor da oportunidade. Os
  campos `type="number"` (lançamento manual, crédito, custo do insumo) o
  navegador já lê. Prova: `tests/dinheiro-do-formulario.test.ts`,
  `e2e/procedimento-preco-em-reais.spec.ts`.
  - **A entrada do "entrada + parcelas"** (contrato do procedimento, venda de
    pacote e de pré-pago, checkout do plano) é `lerEntrada`
    (`lib/checkout/entrada.ts`; frente de cadastro, 2026-10-29): vazia é sem
    entrada; ilegível mostra `DINHEIRO_INVALIDO` junto do campo e a tela NÃO
    salva (`recusaDoPagamento` em `CamposDoPagamento`, `recusaDaEntrada` no
    checkout). Era `parseDinheiro(…) || 0`: "1,400.50" vendia com entrada
    R$ 0, calado. Prova: `e2e/pacotes-venda.spec.ts` ("entrada ilegível").
  - **A entrada MAIOR que o total é recusada, não cortada** (ven-02 da
    revisão, 2026-11-02: "o plano custa R$ 900 e a Bruna digita entrada de
    R$ 1.000; grava R$ 900 sem dizer nada"). A regra é UMA,
    `recusaDaEntradaAcimaDoTotal` (`lib/checkout/entrada.ts`): "A entrada
    (R$ 1.000,00) passa do total do plano (R$ 900,00). Corrija a entrada." —
    junto do campo, e o botão de seguir fica desligado (`recusaDoPagamento(e,
    total)` em `CamposDoPagamento`; o checkout e o receber do plano no
    check-in também). O SERVIDOR recusa com a mesma frase
    (`recusaDaEntradaDoPagamento`, `lib/checkout/lancamentos.ts`) em
    `venderPacote`, `venderProcedimento`, `venderProduto`,
    `checkoutTreatmentPlan`, `prepararDocumentosDoCheckout`,
    `definirPagamentoDoContrato` e `receberDoPlano`, antes de qualquer
    gravação. Igual ao total passa (é tudo na entrada). O corte de
    `lancamentosDoPagamento` fica só como rede de segurança. Prova:
    `e2e/vendas-entrada-acima-do-total.spec.ts`.
- Formas de pagamento: `CASH`, `PIX`, `DEBIT_CARD`, `CREDIT_CARD`, `INTERNAL_CREDIT`
  e, só na DESPESA, `BOLETO` (A14 da 9ª simulação, 2026-11-07: a luz e o
  aluguel ficavam "Não informado"; migration `20261107004405`; o nome é
  "Boleto" em `rotuloDaForma` e em `private.rotulo_da_forma`). A tela só o
  oferece na despesa (`FORMAS_DA_DESPESA`), e a action recusa na receita
  ("Boleto é forma de pagar uma despesa.").
- **A despesa parcelada (ou recorrente) pede UM vencimento** (A14): o da 1ª
  parcela (ou o primeiro); o "Vencimento" do lançamento único não aparece junto.
- **A despesa recorrente guarda a forma de pagamento, como a parcelada** (D11
  do levantamento das regras, o Heitor, 2026-11-11; princípio 3): a forma
  escolhida ao lançar vai a cada lançamento da recorrência (C70, F67:
  a recorrente a omitia, e o "Pagar despesa" perguntava a forma). Prova:
  `e2e/financeiro-f67.spec.ts` ("C70").
- **O "Pagar" da despesa sem forma pergunta a forma** (A15 da 9ª; decidido pelo
  princípio 3 — a parcela da cliente e a comissão já perguntavam): "Pagar
  despesa" (`PagarDespesa`, nos dois financeiros), a forma nasce vazia e é
  obrigatória, com o Boleto; a despesa que já tem forma baixa direto, como
  antes. Prova: `e2e/financeiro-atritos-da-9.spec.ts` ("A14", "A15").
- **A forma nasce VAZIA em toda tela de cobrança** (A37 da 6ª simulação,
  2026-11-04; princípio 3): o "Confirmar pagamento" do atendimento (que o
  `?receber=1` abre sozinho — e só abre, nunca confirma), o "Receber" do plano
  no check-in, o checkout do plano (nenhum meio marcado) e o `CamposDoPagamento`
  (o "Vender" de pacote, pré-pago e produto, e o pagamento do contrato); o
  "Pagar" de uma receita sem meio no Financeiro (D6) também. O que se recebe
  agora (à vista, a entrada) não confirma sem ela — o botão espera, e o
  servidor recusa ("Escolha a forma de pagamento."). O "a receber" segue com
  a forma opcional ("Não informado"). Só o meio COMBINADO no contrato vem
  escolhido. O Pix era o padrão calado: um clique gravou o peeling do Jorge
  no Pix, que ele pagou no cartão. Nos specs, `pagoNoPix`
  (`e2e/apoio/vender.ts`) escolhe o Pix onde a forma não é o assunto. Prova:
  `e2e/vendas-forma-nasce-vazia.spec.ts`.
- **Cartão de crédito em N vezes é PAGO na hora PELA CLIENTE** (decisão do
  Heitor, 2026-10-20): quem paga a clínica é a maquininha, então para o
  cliente está quitado. É o "À vista" com o meio Cartão de crédito e "Vezes
  no cartão" (1–12): UM lançamento pago, com
  `financial_transactions.cartao_vezes` (2–12, só no crédito — a restrição do
  banco confere). Para a comissão, é pagamento INTEGRAL (H4, 2026-11-01):
  libera na hora.
  - **E a OPERADORA deposita em N parcelas: a receber DELA** (F2c da
    5ª simulação; decisões do Heitor, 2026-11-01: "no financeiro mês a mês,
    como a receber" e "conta no mês do dia da venda"). O lançamento pago no
    crédito em 2+ vezes ganha, por gatilho (`trg_recebiveis_do_cartao`, vale
    nas cinco portas), N linhas em `recebiveis_do_cartao` — FORA de
    `financial_transactions` de propósito: nada que conta receita, ponto,
    comissão ou dívida da cliente as vê. Cada parcela tem o seu valor (a
    divisão em centavos, a sobra na última), a taxa da maquininha de N vezes
    retratada (`private.comissao_taxa_pct`, a mesma da comissão) — e a TAXA
    também fecha com a da venda: a sobra do arredondamento vai na última
    parcela (D13 da 6ª simulação; `recebiveis_do_cartao.taxa_sobra`, migration
    `20261104002001`): Visa 2x de R$ 750 a 2,38% são 8,93 + 8,92 = R$ 17,85, o
    que o Fechamento estima (eram 8,93 + 8,93) —, o líquido e
    o vencimento a cada N DIAS CORRIDOS contados da venda — a parcela k em
    venda + k × N (r2-fin-01, o Heitor, 2026-11-03: "como a operadora paga de
    verdade e configurável o prazo"; era o mesmo dia de cada mês). O N é da
    clínica: Configurações → Comissões → "Prazo da operadora (dias)", junto
    das taxas (`tenants.cartao_prazo_dias`, 30 por padrão, 1–120;
    `salvarPrazoDaOperadora`, a mesma permissão e abrangência das taxas). O
    vencimento é retratado na parcela: mudar o prazo vale para as próximas
    vendas. Migration `20261103001301`.
    - **As taxas passam a ser POR MAQUININHA** (D8 do levantamento das
      regras, o Heitor, 2026-11-11, 4ª volta, opção b: "Quem escolhe a taxa é a operadora: stone, mercadopago, elo e por ai vai… a rede precisa configurar suas taxas, por operadora.";
      e a primeira tela da passada de simplificação, princípio 7). **Feito na
      F67 (C75, 2026-11-12)**; o que se lê adiante sobre a "regra geral" e
      `tenants.cartao_*`/`payment_fees` é o modelo de antes — a "regra geral"
      é hoje a taxa DA MAQUININHA, e a bandeira, a de dentro dela.
      - **Onde mora**: `maquininhas` (nome, `taxas` jsonb "DEBIT_CARD:1" /
        "CREDIT_CARD:N", `max_vezes`, `prazo_dias`, `cobra_por_bandeira`,
        `por_bandeira`, `arquivada_em`; a sessão NÃO lê nem grava — sem
        política; grava `actions/maquininhas.ts` pelo cliente de serviço,
        com `financial: MANAGE`, o recurso comissões e abrangência de rede).
        O Pix em `tenants.pix_taxa_pct` (padrão 0). A venda guarda a sua em
        `financial_transactions.maquininha_id`.
      - **A migração**: a configuração de cada rede virou a 1ª maquininha,
        "Maquininha". O lançamento já gravado fica com a taxa que tem (o
        recebível é retratado). `payment_fees` e `tenants.cartao_*` seguem
        só com um ESPELHO para a 1ª maquininha (gatilhos
        `trg_maquininha_espelha_*`), até a limpeza com o Heitor.
      - **Quem decide a maquininha da venda**: a escolhida; sem escolha, o
        banco põe a PRIMEIRA ativa (`private.maquininha_do_lancamento`, por
        `ordem`); o estorno herda a do pagamento; a de outra rede é recusada
        ("Esta maquininha não é desta clínica."); a DESPESA no cartão não tem
        maquininha (20261112006709). **Com mais de uma ativa, o cartão não
        segue sem ela** — na tela (o botão espera) e no servidor
        (`recusaDasVezesDaRede`: "Escolha a maquininha do cartão."): a
        primeira não vale calada (princípio 3). Todos os caminhos: avulso,
        check-in do plano, checkout, pacote, pré-pago, produto, crédito na
        clínica, Novo lançamento, "Receber no cartão" e o Copilot (`lancar`
        e `marcar_pago` pedem o nome; com mais de uma, sem ele, perguntam).
        O pagamento combinado do CONTRATO não pergunta (é só texto: a
        maquininha se escolhe quando o dinheiro entra).
      - **Quem lê**: `private.taxa_da_maquininha(rede, método, vezes,
        bandeira, maquininha)` (Pix → `pix_taxa_pct`; a da bandeira só com
        `cobra_por_bandeira`), `comissao_taxa_pct` e `prazo_da_operadora`
        com a maquininha — a comissão, os recebíveis, o líquido e os
        indicadores. Na tela, `taxaNaMaquininha` (`lib/financeiro/maquininhas.ts`)
        é o espelho; `maquininhasParaAVenda` manda a quem só recebe a
        PRESENÇA de cada taxa (0), nunca o valor (D7).
      - **A tela**: Configurações → Comissões → "Taxas da maquininha": o Pix;
        a maquininha (com mais de uma, o seletor de qual editar); "+ Adicionar
        maquininha"; arquivar ("Arquivar Stone") e "Voltar a usar" — a última
        ativa não se arquiva; um "Salvar taxas" grava o Pix e as maquininhas
        que mudaram. A bandeira aparece só com a opção marcada.
      - **O Fechamento** separa o cartão por maquininha quando o dia teve mais
        de uma (`metrics_fechamento_por_maquininha`; a despesa no cartão
        aparece como "Cartão da clínica"), na tela e no CSV.
      - Prova: `e2e/maquininhas-f67.spec.ts`, `tests/maquininhas.test.ts`; os
        specs das taxas leem pela `e2e/apoio/maquininha.ts`.
      - **A rede cadastra as maquininhas que usa** (Stone, Mercado Pago…):
        o nome, a taxa do débito, a do crédito à vista, até quantas vezes ela
        parcela, a taxa de cada vez e o prazo de recebimento. O "Parcelar no
        crédito até" e o "Prazo da operadora" passam a ser de cada maquininha.
      - **A bandeira mora dentro da maquininha**, numa opção FECHADA por
        padrão: "Esta maquininha cobra diferente em alguma bandeira?". Aberta,
        a bandeira escolhida tem as suas taxas (e o seu prazo) naquela
        maquininha; o campo vazio dela é a taxa da maquininha daquelas vezes
        (a mesma régua do r4-f15-01, sem herdar faixa).
      - **Na venda com cartão, "Qual maquininha?"** — só quando a rede tem
        mais de uma; com uma, ela vale sem perguntar. A taxa, o líquido, o
        recebível e o prazo saem da maquininha da venda (e da bandeira dentro
        dela, se ela cobra diferente).
      - **O Fechamento do dia separa por maquininha** (e, dentro dela, por
        bandeira quando houver).
        **E o CSV dele leva a taxa e o líquido de cada maquininha** (A28 da
        14ª, F75 — a Ivone concilia o depósito de cada operadora): a seção
        "Taxa e líquido por maquininha (estimados)", com o Pix numa linha
        própria — a mesma conta da linha "Taxas da maquininha no dia",
        separada (`metrics_taxas_por_maquininha`, migration
        `20261113007502`; `getTaxasPorMaquininha`). Só a quem vê o
        financeiro da clínica: para quem só recebe, o servidor nem a busca.
        ⚠️ É o D7 (escrito para o VENDER) estendido ao CSV pela F75, a
        confirmar com o Heitor — a linha "Taxas da maquininha no dia" da TELA
        do Fechamento segue à vista da recepção (`fechamento-do-dia-avisos:82`).
        Prova: `e2e/fechamento-f75-taxas-por-maquininha.spec.ts`.
      - **O Pix tem um campo próprio na tela de Taxas, fora das
        maquininhas** (o Heitor, 2026-11-11, sobre a C75: "A taxa do pix fica em algum lugar nessas configurações e o aviso sem taxa acho que nem precisa na verdade"),
        com o padrão 0%.
      - **Sem o aviso "Sem taxa" nos campos** (a mesma resposta): o campo
        vazio mostra "0%" e vale 0% — o princípio 4 (faltou o dado, vale zero
        e a tela diz) cumprido pelo próprio campo. Saem o destaque
        `data-sem-taxa` das linhas e a nota do Pix sem taxa que a 1ª proposta
        da D8 trazia.
    - **Prazo e taxas POR BANDEIRA** (r3-f13-01, o Heitor, 2026-11-03:
      "Lembre-se, flexibilidade. Prazo por bandeira. Taxas também
      configuráveis por bandeira."; migration `20261103001502`). Em
      Configurações → Comissões → "Taxas da maquininha", o seletor "Bandeira"
      (Regra geral, Visa, Mastercard, Elo, Amex, Hipercard, Outras): cada
      bandeira pode ter o SEU prazo e as SUAS taxas (débito e crédito 1x–12x;
      Pix não tem bandeira), gravados juntos em `tenants.cartao_por_bandeira`
      (`salvarCartaoPorBandeira`, a mesma permissão e abrangência das taxas;
      a tela diz "Com regra própria: Elo"). O de antes é a **REGRA GERAL**:
      vale para a bandeira sem regra própria (o campo vazio mostra a geral) e
      para o pagamento sem bandeira — a clínica que não mexe não vê diferença.
      **O campo vazio da bandeira é a regra geral DAQUELAS vezes** (r4-f15-01,
      o Heitor, revisão das decisões da F15, 2026-11-03; migration
      `20261103001602`): a bandeira vale com a taxa EXATA daquele número de
      vezes (e o débito); senão vale a regra geral daquelas vezes — o número
      que a tela mostra no campo vazio. Sem herdar faixa da bandeira: a Elo só
      com o 3x (3%) e a geral com o 5x (6%) → a venda Elo em 5x usa 6%; a Elo
      em 3x, os 3% dela. É `private.comissao_taxa_pct` com a bandeira e, na
      tela, `taxaDoCreditoNaBandeira` (`lib/financeiro/bandeiras.ts`, o aviso
      da taxa); o prazo, o dela, senão o geral (`private.prazo_da_operadora`).
    - **Sem a taxa EXATA daquelas vezes, a taxa é 0%** (F16-2, o Heitor,
      revisão das decisões da F16, opção A — o fallback "pode levar a erros
      de cálculos"; migration `20261103001702`): nem na bandeira nem na regra
      geral → 0%, nunca a de outras vezes. Nada em 4x, a venda Elo 4x sai com
      0% — comissão sobre o valor cheio, o depósito previsto da operadora é o
      valor da venda (era o 3x da geral). Débito e 1x seguem a mesma regra.
      Nada é recusado: a venda grava normalmente. A taxa que existe mora em
      `private.taxa_da_maquininha` (a da bandeira, senão a geral exata,
      `private.taxa_geral_exata`; ou nula), e `comissao_taxa_pct` é ela ou 0.
      **A clínica fica sabendo**: em "Taxas da maquininha", a linha sem taxa
      (na regra geral; na bandeira, quando nem ela nem a geral têm) aparece em
      destaque de aviso — "Sem taxa: as vendas em 4x saem sem desconto da
      operadora." (`data-sem-taxa`) —, menos o Pix (sem taxa é comum) e o
      crédito acima do "Parcelar no crédito até" (não se vende ali; decisões
      da F17). Com as maquininhas (C75), esse destaque SAI: o campo vazio
      mostra "0%" (acima); e o Fechamento do dia com venda no
      cartão sem taxa diz "Sem taxa da maquininha cadastrada — saiu sem
      desconto da operadora: Crédito 4x (Elo): 1 venda, R$ 1.100,00…"
      (`metrics_vendas_sem_taxa_do_fechamento`, aviso `sem-taxa`). Prova:
      `e2e/financeiro-cartao-por-bandeira.spec.ts` ("F16-2"),
      `tests/financeiro-formas.test.ts`, `tests/cartao-por-bandeira.test.ts`.
    - **"Preencher pela taxa por parcela"** (r4-f15-01; o Heitor: "a taxa é
      por parcela, por exemplo 1.15% por parcela, então a taxa total é a taxa
      vezes a quantidade de parcelas"): em "Taxas da maquininha", na regra
      geral e em cada bandeira, a pessoa digita a taxa por parcela (1,15%) e o
      botão preenche o crédito 1x a 12x com a taxa × as vezes, em duas casas
      (1x 1,15%, 2x 2,30% … 12x 13,80%; `creditoPelaTaxaPorParcela`). Só
      preenche os campos — grava no "Salvar taxas" de sempre, cada campo
      segue editável, o débito não muda —, e a tabela continua sendo a verdade
      do cálculo: não há coluna de "taxa por parcela" no banco. **O 1x também
      muda, e a tela DIZ** (A5 da 6ª simulação, 2026-11-04; decidido pelo
      princípio 3, mantendo o "1x a 12x" do Heitor): o texto diz "de 1x (à
      vista, inclusive)", e quando o 1x tinha outro valor aparece "O crédito à
      vista (1x) também mudou: era 1,19%, agora 1,15%. Confira antes de
      salvar." (`data-aviso-do-1x`). Prova:
      `e2e/financeiro-cartao-por-bandeira.spec.ts` ("A5").
    - **"Colar a tabela da operadora"** (A3 da 7ª simulação, 2026-11-05;
      decidido pelo princípio 3): a taxa × as vezes não serve à tabela real
      (2,99% à vista, 6,50% em 6x), e os dois times digitaram linha por linha.
      A regra do Heitor fica; ao lado do botão dela, "Colar a tabela da
      operadora" lê a tabela copiada da operadora ou de uma planilha ("6x
      6,50%", ou só os números, em ordem a partir do 1x —
      `taxasDaTabelaColada`, `lib/financeiro/bandeiras.ts`) e mostra ANTES
      "Vai preencher: 1x 2,99% · … · 6x 6,50%" (`data-tabela-colada`), o que
      fica de fora do "Parcelar no crédito até" e as linhas do débito e do Pix
      (têm campo próprio). O que não se entende é erro, sem chutar (princípio
      4). Só preenche os campos, como o outro: grava no "Salvar taxas". O
      texto do "taxa por parcela" diz que ele serve à operadora que cobra a
      mesma taxa por parcela. Prova: `e2e/configuracoes-atritos-da-7.spec.ts`
      ("A3"), `tests/tabela-da-operadora.test.ts`.
      **É o caminho principal, e "de X a Y" leva a ele** (A4 da 9ª simulação,
      2026-11-07: com a tabela "de 3,1 a 11,9", os dois times digitaram as 12
      caixas sem achar o colar): "Colar a tabela da operadora" é o botão cheio
      (o "taxa por parcela" fica ao lado, secundário). A faixa digitada na
      taxa por parcela ("de 3,1 a 11,9", "2,9% até 9,5%" — `faixaDaOperadora`)
      não vira taxa por parcela nem é recusada como número inválido: a caixa
      diz "é a faixa da tabela da operadora (o 1x e o 12x)… o sistema não
      inventa as do meio" (`[data-faixa-da-operadora]`) e o botão (ou o
      Enter) abre o colar já com "1x 3,1% / … / 12x 11,9%" — as pontas; o meio
      a clínica cola ou digita (princípio 4: não chutar número). Prova:
      `e2e/configuracoes-atritos-da-8.spec.ts` ("A4 da 9ª"),
      `tests/tabela-da-operadora.test.ts`.
    - **O "Preencher" diz antes o que vai pôr, e a taxa que BAIXA com mais
      vezes avisa** (A2 da 8ª simulação, 2026-11-06; decidido pelo princípio
      2 — "no máximo, avisar"): os dois times multiplicaram sem ver (1x 2,80%
      virou 0,99%, e o 2x 1,98% ficou abaixo do à vista). A caixa do "taxa por
      parcela" mostra, enquanto se digita, "Vai preencher: 1x 0,99% · 2x
      1,98% …" e "o crédito à vista (1x) deixa de ser 2,80%"
      (`data-vai-preencher`), e tem o "Colar a tabela da operadora" ali dentro.
      O "Salvar taxas" grava o que a clínica escolheu e, quando mais vezes sai
      mais barato (na regra geral ou numa bandeira), avisa: "2x (1,98%) sai
      mais barato que o crédito à vista (2,80%)… Ficou salvo como está."
      (`avisoDaTaxaQueBaixa`, `lib/financeiro/bandeiras.ts`;
      `data-aviso-taxa-menor`). Prova: `e2e/configuracoes-atritos-da-8.spec.ts`,
      `tests/taxa-que-baixa.test.ts`.
    - **As linhas do crédito só até o "Parcelar no crédito até"** (F17-4, o
      Heitor: "as linhas só devem aparecer se estiverem dentro do range de
      parcelas que são oferecidas"): com o limite escolhido (até 5x), a tabela
      mostra o crédito de 1x a 5x — na regra geral e em cada bandeira —, e o
      6x a 12x nem aparecem; o "Preencher pela taxa por parcela" preenche só
      as que aparecem. O seletor do limite fica logo acima do crédito
      parcelado. Com "Só à vista", o crédito parcelado some e a tela diz por
      quê. No **Automático** todas as linhas aparecem: o limite sai delas (a
      maior com taxa) — decisão da F18, confirmada no levantamento das regras
      (D9, o Heitor, 2026-11-11). O que está
      gravado acima do limite NÃO se apaga (fica no formulário e é regravado
      no "Salvar taxas"), e aumentar o limite traz as linhas de volta, as
      vazias com o aviso "Sem taxa" (que sai com a C75). **O Pix tem a sua taxa** (na regra geral;
      Pix não tem bandeira): `payment_fees` `PIX`, que já valia no líquido da
      comissão e na estimativa do Fechamento; vazio é sem taxa, sem aviso, e a
      tela diz "o Pix, só se a sua operadora cobrar". Com as maquininhas
      (C75), o Pix fica num campo próprio da tela de Taxas, fora delas, com
      o padrão 0%. Prova:
      `e2e/financeiro-cartao-por-bandeira.spec.ts` ("F17-4").
    - **Nenhum teto nas taxas** (F16-3, o Heitor: "não é pra recusar nada,
      juros podem passar facilmente de 100% no acumulado"; migration
      `20261103001703`): na regra geral e nas bandeiras, e no "Preencher pela
      taxa por parcela" (10% por parcela → 12x 120%), só não negativa
      (`recusaDaTaxaDaMaquininha`, `lib/financeiro/vezes-do-cartao.ts`; o
      zod das duas entradas). O único limite é o do registro, 999,99% (a
      parcela da operadora guarda a taxa em numeric(6,3) — decisão da F17).
      A regra geral acima de 100% mora em `payment_fees.taxa_pct_sem_teto`
      (o gatilho `trg_payment_fees_sem_teto` a preenche antes do CHECK antigo
      de 0–100, que fica em `taxa_pct` com até 100); a que vale é
      `coalesce(taxa_pct_sem_teto, taxa_pct)`. Com a taxa acima de 100%:
      a comissão sobre o líquido fica em R$ 0 (nunca negativa —
      `comissao_conta`), o depósito previsto da operadora não fica abaixo de
      zero (na lista das parcelas, o líquido é no mínimo R$ 0 e a taxa, no
      máximo a parcela inteira) e a estimativa do Fechamento segue só
      informativa. Prova: `e2e/financeiro-cartao-por-bandeira.spec.ts`
      ("F16-3"), `tests/cartao-por-bandeira.test.ts`, `tests/comissoes-config.test.ts`.
    - **A bandeira aparece onde a forma aparece** (A39 da 6ª simulação,
      2026-11-04): o recibo, o "Pagamento confirmado" da tela do atendimento,
      a ficha e o app (Financeiro e Histórico → Pagamentos) dizem "Crédito
      Visa 5x" (`rotuloDaForma(…, { bandeira })`; o nome da bandeira é o de
      `BANDEIRAS`, `tests/financeiro-formas.test.ts` trava). No "Confirmar
      pagamento", o campo das vezes tem o rótulo "Vezes no cartão", e os
      rótulos `.field-label` (a classe que os formulários usavam e não
      existia) têm um tamanho só. Prova: `e2e/financeiro-recibo.spec.ts`
      ("A39"). **E a opção diz "6x", como em toda tela de cobrança**
      (acessibilidade, 9ª simulação: só aqui era "6x no cartão", e quem
      escolhe pelo nome da opção — o leitor de tela, o robô — não achava o
      "6x" e a venda ficou em 1x). Prova: `e2e/financeiro-atritos-da-9.spec.ts`
      ("acessibilidade").
    - **O débito diz a taxa que vai valer** (A34 da 9ª simulação; princípio
      3): com a bandeira "Não informada" vale a regra geral, e a tela não
      dizia qual. Embaixo do "Bandeira (opcional)", no débito, "Taxa da
      maquininha no débito: 1,6% — a regra geral (bandeira não informada) (R$
      3,04); a clínica recebe R$ 186,96" — a da bandeira quando ela tem a sua
      (`AvisoDaTaxaDoDebito`, `[data-taxa-do-debito]`, em `CampoDaBandeira` com
      o `total`; sem nenhuma cadastrada, "sai sem desconto (0%)"). Prova:
      `e2e/financeiro-atritos-da-9.spec.ts` ("A34").
    - **O pagamento no cartão diz a bandeira, opcional** ("Bandeira (opcional)",
      `CampoDaBandeira`): o recebimento do atendimento e do plano no check-in,
      o checkout do plano, o "Vender" (pacote, pré-pago, produto, contrato —
      `CamposDoPagamento`), o pagamento novo do usado no cancelamento do
      pacote, a baixa no Financeiro de um lançamento no cartão ("Receber no
      cartão", `ReceberNoCartao`), o "Novo lançamento" do Financeiro — a
      RECEITA PAGA no cartão (r4-f15-02, o Heitor, revisão das decisões da
      F15: "flexibilidade, e é o mesmo campo opcional dos outros lugares";
      `createTransactionAdvanced` → `lancarCore`; a receita lançada em aberto
      tem a bandeira perguntada na baixa, e a despesa não tem bandeira) — e o
      Copilot (`lancar`, `marcar_pago`).
    - **O "Novo lançamento" escolhe as vezes no crédito** (F16-5, o Heitor,
      revisão das decisões da F16: "ajuste isso para permitir escolher
      parcelas"): a RECEITA PAGA no crédito tem "Vezes no cartão" (até o
      limite da clínica, `useOpcoesDeVezes`, com o valor da parcela e o aviso
      da taxa), gravado em `cartao_vezes` — UM lançamento pago, que a
      operadora deposita em N (`recebiveis_do_cartao`, pelo gatilho, com o
      prazo e a taxa da bandeira), exatamente como o crédito em N vezes do
      "Vender". A tela diz a diferença: "Um pagamento só: a cliente pagou tudo
      agora, e a operadora deposita em 3 parcelas… Não é um parcelamento da
      cliente com a clínica." (o "Parcelado" do modal é o da despesa). Débito
      é 1x; o lançamento PENDENTE não pergunta — as vezes são da baixa.
      `lancarCore` (`vezes`) recusa acima do limite (`recusaDasVezesDaRede`).
      Prova: `e2e/financeiro-cartao-por-bandeira.spec.ts` ("F16-5").
    - **A baixa no crédito também escolhe as vezes** (F17-5, o Heitor:
      "pode"): o "Receber no cartão" (`ReceberNoCartao`, nos dois
      financeiros) de um pendente no CRÉDITO pergunta "Vezes no cartão" (até o
      limite da clínica, com o valor da parcela e o aviso da taxa), além da
      bandeira; `markTransactionPaid` → `marcarPagoCore` (`vezes`) grava
      `cartao_vezes` junto do `is_paid`, e o gatilho faz as parcelas da
      operadora com o prazo e a taxa daquelas vezes e da bandeira. R$ 1.200 em
      3x → "A receber da operadora" 3 × R$ 400 com a taxa de 3x. Débito, 1x.
      A regra é UMA, `recusaDasVezesDaBaixa` (`lib/financeiro/lancamento.ts`:
      só a receita no crédito, de 1 ao limite) — e o **Copilot** (`lancar` e
      `marcar_pago`, `vezes`) passa por ela já no preparo: "registra R$ 1.200
      no crédito em 3x" vira o cartão "pago · cartão de crédito · 3x", e acima
      do limite nem vira cartão. Prova:
      `e2e/financeiro-cartao-por-bandeira.spec.ts` ("F17-5"),
      `e2e/copilot-gestao.spec.ts` ("F17-5", contra o build).
      Gravada em `financial_transactions.cartao_bandeira` (só no crédito e no
      débito — a restrição do banco confere; `private.bandeira_do_cartao`
      recusa a desconhecida). A taxa da bandeira vale onde a taxa já valia —
      o líquido da comissão (`comissao_conta`), o que a operadora deposita
      (`recebiveis_do_cartao`) e a estimativa do Fechamento do dia —, e o
      prazo no nascimento das parcelas da operadora. O estorno herda a
      bandeira. **Informada ou trocada DEPOIS de pago** (o recebimento do plano
      no check-in grava logo depois de `plano_receber`), o gatilho refaz o
      prazo e a taxa das parcelas enquanto a operadora não pagou nenhuma, e a
      comissão se acerta pelo gatilho dela. Prova:
      `e2e/financeiro-cartao-por-bandeira.spec.ts`, `tests/cartao-por-bandeira.test.ts`.
    - **A receita é da VENDA**: entra inteira no dia dela, pela regra única;
      a parcela recebida NÃO soma receita (`indicadores.md`).
    - **A baixa é na leitura, sem cron**: a parcela vira recebida SOZINHA
      quando vence (`recebiveis_do_cartao_lista` deriva a situação —
      A_RECEBER, RECEBIDA, ANTECIPADA, CANCELADA, ESTORNADA). "Marcar
      recebida" é a antecipação (`anteciparParcelaDaOperadora`, com
      `financial: MANAGE` sem "só os meus" e a unidade ao alcance;
      `recebivel_do_cartao_receber`). **A antecipada tem "Desfazer"**
      (r2-fin-02, o Heitor, 2026-11-03: "mudar solicitando confirmação antes
      de desfazer"): a janela "Desfazer o recebimento?" confirma, e a parcela
      volta a receber (`desfazerRecebimentoDaParcelaDaOperadora` →
      `recebivel_do_cartao_desfazer`, a mesma permissão; migration
      `20261103001302`). Só a antecipada: a que venceu foi recebida na data, e
      o banco recusa desfazê-la.
    - **A cliente não deve nada**: a ficha, o app ("Financeiro") e o
      Fechamento não as veem. O Financeiro (os dois portais) mostra os dois a
      receber, NOMEADOS: "A receber da cliente" (o de sempre) e "A receber da
      operadora" (`getAReceberDaOperadora`, pelo vencimento no período, com o
      próximo vencimento e todo o em aberto), e a lista "Cartão de crédito: a
      receber da operadora" (`ParcelasDaOperadora`) com TODO o em aberto, de
      qualquer vencimento, mais o que vence no período, agrupada pelo MÊS do
      depósito — e o cartão tem "Ver as parcelas", que leva até ela (D3 da 6ª
      simulação: o cartão dizia "Em aberto R$ 2.360" e a lista do mês vinha
      vazia, porque tudo vencia no mês seguinte; `recebiveis_do_cartao_da_tela`,
      migration `20261104002003`; prova:
      `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`, "D3"). Com o
      financeiro "só os meus", não aparece.
      **E conta o LÍQUIDO, com o bruto ao lado** (A30 da 9ª simulação,
      2026-11-07; decidido pelo princípio 3): o cartão e o fluxo de caixa
      somavam o bruto e a lista mostrava o líquido (R$ 2.386,82 × R$ 2.289,47).
      O que a operadora deposita é o líquido (`recebiveis_do_cartao.liquido`,
      entre zero e a parcela): o cartão diz "Líquido (o que a operadora
      deposita)… — R$ X bruto" e "Em aberto…: R$ 950,00 líquido (R$ 1.000,00
      bruto)", a coluna do fluxo é "Da operadora (líquido)" com o bruto
      embaixo, e o aviso do Fechamento diz "R$ X líquido"
      (`metrics_a_receber_da_operadora_liquido`, `metrics_fluxo_de_caixa_liquido`;
      migration `20261107004406` — as funções de antes ficaram sem leitor).
      Prova: `e2e/financeiro-atritos-da-9.spec.ts` ("A30").
    - **O estorno no cartão é sempre do pagamento INTEIRO** (r2-fin-03, o
      Heitor, 2026-11-03: "estornar no cartão estorna a venda inteira, todas
      as operadoras fazem assim"): crédito à vista ou em N vezes, e débito.
      Saiu o "estorno em parte" do cartão: o cancelamento do pacote estorna o
      pagamento todo e lança o usado de novo (§9.3.1), e o gatilho
      `trg_recebiveis_do_cartao` RECUSA diminuir o valor de um pagamento no
      cartão já pago ("No cartão, o estorno é do pagamento inteiro…";
      migration `20261103001303`). O estorno é acompanhado pelo gatilho, na
      mesma transação: cai o que ainda não foi recebido (CANCELADA); o já
      recebido é ESTORNADO (a operadora toma de volta: `estornado`).
    - **O crédito À VISTA (1x) também vira recebível** (D4 da 6ª simulação,
      F20; migration `20261104002050`): UMA parcela, no prazo da bandeira
      (ou no da clínica), com a taxa do 1x — como as N vezes. O débito e o Pix
      seguem recebidos no dia: não há prazo configurado para eles (princípio
      4). A receita continua da venda, no dia dela (princípio 5); o Fechamento
      não muda (a taxa do 1x já era estimada), e o "A receber da operadora", a
      lista e o fluxo de caixa passam a mostrar o 1x. As vendas no 1x de antes
      ficam sem parcela. ⚠️ A restrição `recebiveis_do_cartao_check` aceita
      `parcela_total` de 1 a 12 desde esta migration: o gatilho com o 1x
      ANTES dela recusa toda venda no crédito à vista (foi o que a
      `20261104002001` fez por alguns minutos). Prova:
      `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts` ("D4").
    - As vendas antigas no cartão N× (3 na produção em 2026-11-01: Aurora
      R$ 600, Jasmim R$ 150, Lótus R$ 280) ficam como estão, sem parcelas.
    - Migration `20261101000261`. Prova:
      `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`. "Entrada + parcelas" é o CREDIÁRIO da própria clínica: cada
  parcela a receber, e a comissão espera a última. Vale nas cinco portas: pacote e pré-pago
  (`lancamentosDoPagamento`), checkout do plano, recebimento do plano no
  check-in e o pagamento do atendimento avulso (`p_dados.cartao_vezes`).
  Até aqui "3x no cartão" só cabia em entrada + parcelas, a receber.
  - **O crediário NÃO é cartão** (D6 da 6ª simulação, 2026-11-04): as
    parcelas do saldo, que a cliente paga à CLÍNICA, nascem SEM meio de
    pagamento (`payment_method` nulo) — o meio se escolhe ao receber cada uma.
    Nasciam com o meio da entrada (`CREDIT_CARD`), e o contrato dizia "+ 2
    parcelas de R$ 1.700,00 no cartão de crédito". O meio, as vezes e a
    bandeira do "entrada + parcelas" são da ENTRADA. O contrato
    (`pagamento.forma`) diz "entrada de R$ 1.000,00 no cartão de crédito em 3x
    + 2 parcelas de R$ 1.700,00 com a clínica: R$ 1.700,00 em 04/12/2026 e R$ 1.700,00 em 04/01/2027"
    (`pagamento.metodo` é o da entrada; sem entrada, vazio), a tela e a linha
    do tempo dizem o mesmo (`frasesDoPagamento`, `rotuloDoPagamento`: "entrada
    de R$ 1.000,00 em Crédito 3x + 2x com a clínica"), e a ficha e o app
    mostram a parcela sem meio como "Com a clínica" (`formaDoLancamento`,
    `lib/financeiro/formas.ts`). O "Pagar" do Financeiro (os dois portais) de
    uma receita sem meio abre "Receber", com "Forma de pagamento" vazia e
    obrigatória — e, no cartão, a bandeira e as vezes (`ReceberNoCartao`,
    `markTransactionPaid(…, forma)`): era dar baixa sem forma nenhuma. As
    portas: `lancamentosDoPagamento` (pacote, pré-pago, produto), o checkout
    do plano e `plano_receber` (migration `20261104002005`). As parcelas já
    gravadas com meio (17 nas redes [sim] e de teste, em 2026-11-04) ficaram
    como estão. Prova: `e2e/checkout-entrada-no-cartao.spec.ts`,
    `tests/checkout-crediario-da-clinica.test.ts`.
  - **A ENTRADA no crédito também tem as vezes** (D5 da 6ª simulação): no
    "Entrada + parcelas" com a entrada no cartão de crédito, "Vezes no cartão
    (a entrada)" — no checkout do plano, no `CamposDoPagamento` (pacote,
    pré-pago, produto, contrato) e no recebimento do plano no check-in —, com
    o limite da clínica, a dica do valor e o aviso da taxa, como o à vista. A
    entrada é UM lançamento pago com `cartao_vezes`, e a operadora a deposita
    em N (`recebiveis_do_cartao`, com a taxa daquelas vezes e da bandeira).
    `PagamentoDoPlano` PARCELADO ganhou `vezes`; `vezesNoCartao` devolve as
    da entrada (o servidor recusa acima do limite em todas as portas, e o
    atendimento de hoje que entra junto no checkout vai nas mesmas vezes); o
    retrato do contrato as guarda só quando passam de 1. Prova:
    `e2e/checkout-entrada-no-cartao.spec.ts`.
  - **A descrição não leva texto interno** (A47 da 6ª simulação): o plano
    grava "Plano de tratamento — entrada" e "Plano de tratamento — parcela
    1/2" (era "— checkout novo paciente —" e "— recebimento no check-in —",
    que chegavam ao app e ao recibo da cliente; os de antes foram trocados na
    migration `20261104002006`).
  - **A clínica diz até quantas vezes** (D-15, decisão do Heitor,
    2026-10-29: "A clínica configura 'parcela até Nx'. O padrão é o maior
    número de parcelas com taxa cadastrada."): Configurações → Comissões →
    "Parcelar no crédito até" (`tenants.cartao_max_vezes`, 1–12, migration
    `20261029001603`; grava `salvarMaximoDeVezes`, a mesma permissão das
    taxas — desde a F67, C75, é de CADA maquininha: `maquininhas.max_vezes`,
    e a venda usa o da maquininha escolhida). Vazio = automático: a maior parcela do CRÉDITO com taxa em
    `payment_fees`; sem nenhuma, 12x (`maximoDeVezes`,
    `lib/financeiro/vezes-do-cartao.ts`). Todo "Vezes no cartão" monta as
    opções por `useOpcoesDeVezes` (recebimento do avulso, do plano no
    check-in, checkout do plano, `CamposDoPagamento` — pacote, pré-pago,
    produto e o pagamento do contrato), e o servidor RECUSA acima do limite
    (`recusaDasVezesDaRede`, `lib/financeiro/vezes-da-rede.ts`) em
    `confirmPayment`, no checkout e no recebimento do plano, em `venderPacote`,
    `venderProcedimento`, `venderProduto`, `definirPagamentoDoContrato`,
    `prepararDocumentosDoCheckout` e o "Novo lançamento" (`lancarCore`,
    F16-5). Vale só para o cartão em N vezes; as
    parcelas do crediário ("entrada + parcelas") têm o limite delas, abaixo. Prova:
    `e2e/financeiro-parcelas-no-credito.spec.ts`, `tests/financeiro-vezes-do-cartao.test.ts`.
  - **O crediário em quantas vezes é decisão da REDE** (D10 do levantamento
    das regras, o Heitor, 2026-11-11: "Decisão da rede"; princípio 1). Uma
    configuração da rede — o máximo de parcelas do "entrada + parcelas", padrão
    12 — vale igual em todo caminho que vende no crediário: o Vender (pacote,
    pré-pago, produto, o pagamento do contrato), o checkout do plano e o
    check-in do plano. A tela oferece até o limite da rede e o servidor recusa
    acima dele, nos três (C38, F67: `tenants.crediario_max_parcelas`, no
    card "Crediário da clínica" da aba de Comissões; o Vender cortava em 12 e
    o checkout e o check-in em 48, calados — `maximoDeParcelasDaRede`). A
    DESPESA não muda: parcelada de 2 a 48, recorrente de 2 a 60 (é a clínica
    pagando, não vendendo).
  - **O crediário tem UM nome, diz o limite e só pede o meio com entrada**
    (A23 da 14ª simulação, F75; princípio 7): a configuração dizia
    "Crediário da clínica" e o Vender, "Entrada + parcelas" — a Wanda e a
    Débora não ligavam um ao outro. Toda tela que vende nele diz
    "Crediário (entrada + parcelas)" (`ROTULO_DO_CREDIARIO`,
    `lib/financeiro/parcelas-do-crediario.ts`), e a lista das parcelas diz
    "até 6x, o limite da clínica" (`limiteDoCrediarioEmTexto`). O meio é o da
    ENTRADA ("Meio de pagamento da entrada", `rotuloDoMeioNoCrediario`): sem
    entrada, nada se recebe agora e ele não é pedido — na tela
    (`recusaDoPagamento`) e no servidor (`EntradaDoPagamento`), que só o
    exigem com entrada ("Escolha o meio de pagamento da entrada."). A caixa
    do plano no atendimento (o pagamento do dia) segue pedindo a forma: lá
    sempre se recebe algo. Trava: `tests/crediario-nomes-e-entrada.test.ts`
    (nenhuma tela escreve o nome velho à mão).
  - **A tela diz o limite e o valor da parcela** (A47 da 5ª simulação):
    junto de todo "Vezes no cartão" (venda de pacote, pré-pago e produto, o
    recebimento do avulso e do plano, o checkout), "Até 4x no crédito" e,
    escolhidas as vezes, "· 3× R$ 1.100,00" (`DicaDasVezes`, a divisão de
    `dividirEmParcelas`). E a venda em "Entrada + parcelas" mostra o resumo
    antes do "Vender por…" (A46): "Entrada R$ 300,00 + 3× R$ 1.000,00"
    (`ResumoDasParcelas`, `lib/checkout/resumo-do-pagamento.ts`; as
    parcelas iguais se juntam). Prova: `e2e/vendas-resumo-do-pagamento.spec.ts`,
    `tests/resumo-do-pagamento.test.ts`. **E a taxa e o líquido aparecem ao
    escolher** (A40 da 8ª simulação, 2026-11-06; só apareciam no Financeiro):
    com a taxa daquelas vezes (e bandeira) cadastrada, "Taxa da maquininha no
    crédito 3x: 2,97% (R$ 2,97) — a clínica recebe R$ 97,03, que a operadora
    deposita em 3 parcelas." (`[data-liquido-do-cartao]`, no `AvisoDaTaxa` —
    sem a taxa, o aviso de sempre; a conta é `liquidoNaMaquininha`,
    `lib/metrics/resultado.ts`); e, à vista, a linha das vezes diz para que
    serve: "À vista · parcela até 4x no crédito em “Vezes no cartão”". Prova:
    `e2e/caixa-atritos-da-8.spec.ts` ("A40"), `tests/liquido-na-maquininha.test.ts`.
  - **Uma conta só para a parcela do crediário** (D2 da 7ª simulação,
    2026-11-05; princípio 3): o checkout do plano dizia "3× de R$ 890,67" (o
    saldo ÷ 3) e o recebimento do plano no check-in "3x de R$ 890,67", e o
    banco gravou 890,66 + 890,66 + 890,68. As duas telas dizem as parcelas
    como serão gravadas — "2x de R$ 890,66 + 1x de R$ 890,68"
    (`parcelasEmTexto`, `lib/checkout/resumo-do-pagamento.ts`, sobre
    `dividirEmParcelas`; `[data-parcelas-do-saldo]` no checkout) —, e o
    contrato lista cada parcela com a data (`documentos.md`). O recibo e o app
    já mostravam o lançamento gravado. Prova:
    `e2e/checkout-entrada-no-cartao.spec.ts` ("D2, A42"),
    `tests/checkout-parcelas-gravadas.test.ts`.
  - **O "3x" aparece** (A33, 2026-10-27): o nome da forma é UM
    (`rotuloDaForma`, `lib/financeiro/formas.ts` — "Crédito 3x" nas listas do
    financeiro, na ficha, no "Pagamento confirmado" do atendimento e no
    portal da cliente); o Fechamento do dia separa o crédito por vezes
    (`CREDIT_CARD:3`, "Cartão de crédito 3x"). Escolher N vezes sem a taxa
    da maquininha de N vezes cadastrada AVISA quem recebe (`AvisoDaTaxa`):
    a venda sai sem desconto da operadora (0%), também na comissão
    (`taxaQueVale`, o espelho de `private.comissao_taxa_pct` — F16-2: nunca
    a de outras vezes). As taxas vão de à vista a 12x em Configurações →
    Comissões.
  - **A linha do tempo também diz a forma pelo nome** (D18 da simulação de
    2026-10-29; migration `20261029000301`): "Pagamento confirmado via
    Crédito 3x", "via Dinheiro" — era "via CREDIT_CARD em 3x". No banco,
    `private.rotulo_da_forma` é o espelho de `rotuloDaForma` (os nomes
    curtos), usado por `confirmar_pagamento_do_atendimento`; no app, o
    checkout do plano (`rotuloDoPagamento`) e o recebimento do plano no
    check-in usam `rotuloDaForma`. Forma nova entra NOS DOIS. O histórico
    gravado antes foi TRADUZIDO em todas as redes (pedido do Heitor, frente
    de cadastro de 2026-10-29; migration `20261029001002`, 6 linhas → 0) por
    `historico_forma_em_portugues`, que troca o código só nos formatos que o
    sistema gravava; o E2E confere que nenhuma linha do histórico guarda o
    código. Prova:
    `e2e/financeiro-historico-forma-em-portugues.spec.ts`,
    `tests/checkout-pagamento.test.ts`.
  - **E diz a MAQUININHA, quando a rede tem mais de uma** (A18 da 14ª
    simulação, F75: com duas, o pagamento dizia só "Débito", e quem estornava
    não sabia de qual): "Débito Visa · Stone", "Crédito Mastercard 3x ·
    Mercado Pago" — `rotuloDaForma(…, { maquininha })`, com o nome dado por
    `maquininhaDoRotulo` + `nomesDasMaquininhas` (`lib/financeiro/vezes-da-rede.ts`;
    as arquivadas contam, o pagamento antigo foi nelas; com uma só, nada). No
    banco, `private.rotulo_do_pagamento` (migration `20261113007501`) é o
    espelho com a bandeira e a maquininha, e o histórico do pagamento
    confirmado o usa desde então (o gravado antes fica como está). Os lugares:
    a confirmação do atendimento, o histórico, a lista do Financeiro (unidade e
    rede) e o CSV dos lançamentos (na coluna Forma). Prova:
    `e2e/financeiro-f75-pagamento-com-maquininha.spec.ts`,
    `tests/rotulo-do-pagamento-com-maquininha.test.ts`.
  - **"Sem forma (pontos)" só para o que os pontos pagaram** (A35): no
    Fechamento do dia, a receita sem forma com `loyalty_discount` é `PONTOS`;
    todo o resto sem forma (a compra de estoque) é "Sem forma de pagamento".
  - Prova: `e2e/financeiro-credito-em-vezes.spec.ts`, `tests/financeiro-formas.test.ts`.
- **A página do plano proposto tem "Fechar checkout"** (A44 da 5ª
  simulação): em Tratamentos, quem RECEBE e não escreve no plano (a recepção,
  sem o prontuário em Gerenciar) vê "Fechar checkout" no plano PROPOSTO — o
  mesmo wizard do atendimento. O botão só existia na tela da avaliação; quem
  escreve no plano segue com o "Aceitar plano". Prova:
  `e2e/plano-fechar-checkout-na-pagina.spec.ts`.
  **E o erro fica junto do botão; o plano aceito diz "Continuar o
  checkout"** (A24 da 14ª, F75): o erro do "Aceitar plano", do "Cliente vai
  pensar" e do "Fechar checkout" aparece ao lado deles (`ErroDoBotao`,
  `[data-erro-do-botao]`), não no topo da página; e no PROPOSTO (o checkout
  ficou pela metade) quem escreve no plano vê "Continuar o checkout". Prova:
  `e2e/plano-f75-aceitar.spec.ts`.
- **O checkout do plano cobra também o "atendimento de hoje"** (decisão do
  Heitor, 2026-10-20): o atendimento que GEROU o plano
  (`evaluation_appointment_id`), quando está concluído, tem preço, é avulso e
  ainda não foi recebido (`atendimentoDeHojeDoPlano`,
  `lib/checkout/atendimento-de-hoje.ts`). O wizard o mostra como item; se algo
  é recebido agora (à vista ou entrada + parcelas), ele entra junto, à vista e
  no mesmo meio, por `confirmar_pagamento_do_atendimento` — com o
  `appointment_id`, como qualquer avulso (comissão e métricas iguais). "A
  receber" e "no atendimento" o deixam para o "Confirmar pagamento" da tela
  dele. Na simulação, a limpeza de R$ 180 que gerou um plano nunca foi
  cobrada: o checkout ("Novo paciente") cobrava só o plano. Prova:
  `e2e/checkout-de-plano.spec.ts`.
  - **A tela diz UMA coisa sobre ele** (A38 da 6ª simulação, 2026-11-04): o
    passo do plano diz só "Ainda não foi recebido"; o do pagamento diz o que
    acontece com a forma escolhida — "Entra neste checkout: R$ 900,00
    cobrados junto com o que se recebe agora, no mesmo meio (e nas mesmas
    3x)" ou "Não entra neste checkout: receba pela tela do atendimento."
    (`data-hoje-entra`) —, e o total diz "(com o atendimento de hoje)". Eram
    três frases: "entram juntos", "fica fora deste checkout" e "entra
    junto". Prova: `e2e/checkout-de-plano.spec.ts` ("A38").
  - **Recarregar não volta ao passo "Plano"** (A45 da 7ª simulação, 2026-11-05):
    o passo e o pagamento escolhidos ficam no sessionStorage, por plano (morrem
    com a aba; `lib/checkout/passo-do-checkout.ts`), e ao recarregar a tela volta
    a eles — da documentação em diante, monta os documentos de novo com o MESMO
    pagamento (o contrato assinado para ele fica; `prepararDocumentosDoCheckout`
    confere). Fechar ou cancelar o checkout o apaga. Prova:
    `e2e/financeiro-atritos-da-7.spec.ts` ("A45").
- **A assinatura que trava o checkout diz de onde vem a exigência** (A28 da 10ª
  simulação, 2026-11-10; princípio 1): com um documento que "Bloqueia" sem
  assinatura, o passo da documentação diz "Quem exige a assinatura de “Contrato
  do plano” é o modelo do documento: em Configurações → Documentos, a clínica
  escolhe se ele “Bloqueia” o checkout ou “Só avisa”." (`textoDaExigenciaDoModelo`,
  `lib/checkout/exigencia-do-modelo.ts`, `[data-exigencia-do-modelo]`). Prova:
  `tests/checkout-exigencia-do-modelo.test.ts`.
- **O checkout do plano diz o que fica sem data e confirma ao concluir** (A37
  da 8ª simulação, 2026-11-06; princípio 3 — agendar no checkout continua
  opcional): no passo do agendamento, "As sessões 2 e 3 ficam sem data: agende
  pela ficha da cliente (Tratamentos) quando ela marcar."
  (`[data-sessoes-sem-data]`), e concluir mostra "Plano fechado: 3 sessões. 2
  sem data — agende pela ficha…" (`avisoDoPlanoFechado`,
  `lib/checkout/sessoes-sem-data.ts`) — caía na ficha calado. Prova:
  `e2e/checkout-entrada-no-cartao.spec.ts` ("D2, A42"),
  `tests/checkout-sessoes-sem-data.test.ts`.
- **O checkout do plano tem "Quem vendeu"** (decisão 4 da 7ª simulação,
  2026-11-05: "concordo"): no passo do pagamento, nascendo VAZIO como em toda
  venda (`CampoQuemVendeu`, `[data-quem-vendeu-do-plano]`); vazio, "Ir para a
  documentação" pergunta antes ("Ninguém foi marcado em “Quem vendeu”…
  Vender assim?", `PERGUNTA_SEM_VENDEDOR`, `lib/vendas/pergunta-sem-vendedor.ts`),
  e o servidor faz a mesma pergunta (`checkoutTreatmentPlan` com `equipe`;
  `quemVendeu`, antes do dinheiro). Fica em `treatment_plans.vendido_por` e
  leva a comissão de VENDA do plano (`comissoes.md`). O chamador que não manda
  `equipe` (os de antes) fecha sem comissão de venda. A coluna "Profissional"
  das Vendas do plano é quem vendeu (D14 da 8ª; sem ele, a dona do plano —
  `indicadores.md`). Prova:
  `e2e/comissoes-venda-do-plano.spec.ts`.
- **O CPF e o telefone com máscara no checkout e no atendimento** (A45 da 11ª;
  princípio 3: "CPF 00515996270 · 31997000013"): "CPF 005.159.962-70 · (31)
  99700-0013" (`documentoNaTela`, `lib/clients/documento-na-tela.ts` — o
  passaporte e o RNE ficam como vieram; `maskPhone`), e o telefone do cartão do
  atendimento (`AttendanceRecordCard`). Prova: `e2e/vendas-atritos-da-11.spec.ts` ("A45").
- **O "Quem vendeu" vazio cabe no celular** (A46 da 11ª): a opção vazia é
  "Escolha quem vendeu", e a explicação ("Vazio: ninguém vendeu — sem comissão
  de venda.", `[data-quem-vendeu-vazio]`) fica embaixo do campo — o texto longo
  saía cortado a 412 px. O "Quem vendeu" e o "Profissional" do checkout seguem
  nascendo vazios com mais de uma pessoa (r2-ven-12; A14 da 8ª). Prova: o mesmo spec ("A46").
- **O checkout do plano SUGERE o pacote equivalente** (2026-10-21, decisão
  do Heitor): quando as sessões do plano têm os MESMOS procedimentos, nas
  mesmas quantidades, de um pacote ativo à venda na unidade, e ele sai mais
  barato (`pacoteEquivalente`, `lib/checkout/pacote-equivalente.ts`, em
  centavos; o mais barato se houver dois), o passo do pagamento mostra "X tem
  as mesmas sessões: R$ … (economia de R$ …)". "Fechar como pacote" põe a
  economia no campo de DESCONTO: o plano continua por procedimento, e o
  desconto é rateado como qualquer outro. Não vira venda de pacote. Prova:
  `tests/pacote-equivalente.test.ts`, `e2e/checkout-pacote-equivalente.spec.ts`.
  - **O PLANO avisa antes** (A28 da simulação de 2026-10-27): o editor do
    plano (avaliação, Planejamento, ficha) busca os pacotes à venda na
    unidade (`pacotesParaODicaDoPlano`, o mesmo `catalogoDePacotes` do
    checkout) e, quando as sessões batem (`pacoteEquivalente`, a MESMA
    conta), diz "Há o pacote X por R$ Y — no checkout a economia (R$ Z)
    entra como desconto". O plano segue por procedimento (decisão de
    21/10); a dica só fala do pacote que o checkout vai oferecer — o plano
    inteiro, não um pedaço dele. A Lívia e o Rafael montaram 4 × R$ 180
    sem saber do pacote de R$ 600. Prova: `e2e/plano-dica-do-pacote.spec.ts`.
- **O agendamento pela cliente no app usa o que ela já pagou** (2026-10-21,
  decisão do Heitor): a sessão livre de um plano VENDIDO (`ACCEPTED`, a mais
  antiga, cujo primeiro procedimento é o agendado — preço = a soma da sessão)
  ou, sem ela, o crédito de pacote/pré-pago (`pagoParaAgendar`,
  `lib/creditos/pago-no-app.ts`). A ligação é compare-and-swap; perdeu a
  corrida, o agendamento fica avulso. **A sessão do plano passa pelo crédito
  `PLANO` do núcleo, como na equipe** (sobra da F41, 9ª simulação,
  2026-11-07): o app a ligava DEPOIS de criar, com a duração do procedimento;
  agora `createClientAppointment` manda `credito: { tipo: 'PLANO', id: sessão }`
  ao `createAppointmentCore` — o preço, a DURAÇÃO (a soma da sessão: a grade
  livre e o "Sem preferência" medem com ela) e o plano vêm da sessão. Quem perde
  a disputa pelo crédito (`CREDITO_JA_USADO`) agenda sem ele, avulso. Prova:
  `e2e/portal-cliente-agendar-o-que-ja-pagou.spec.ts` ("sobra da F41").
  **E o Confirmar DIZ** (D10 da 8ª simulação, 2026-11-06; sobra da F28): o
  passo mostrava "Valor R$ 180,00" na sessão que o pacote cobria. Agora o
  "Valor" é "Já pago pelo pacote X (sessão 2 de 3)" (ou "pelo plano de
  tratamento (sessão N de M)", ou "Já pago: Y pré-pago (unidade N de M)"), e a
  lista de procedimentos diz "Já pago" no lugar do preço — a MESMA escolha
  que o agendamento usa (`jaPagoNoApp`, ao lado de `pagoParaAgendar`). Prova:
  `e2e/portal-cliente-confirmar-ja-pago.spec.ts`.
- **O check-in só cobra o que VENCEU** (`emAbertoDoPlano` /
  `separarOEmAberto`): em aberto sem data ou com vencimento até o fim de hoje
  (Brasília). Parcela que vence depois já está combinada — aparece no banner
  como "a vencer", sem botão, e se recebe no financeiro. Antes o banner
  oferecia "Receber R$ 600" de um plano parcelado: cobrança em dobro (a
  simulação de 2026-10-20 achou). Prova: `e2e/plano-recebimento.spec.ts`.
  **O saldo do plano aparece a quem RECEBE** (A39 da 7ª simulação,
  2026-11-05; decidido pelo princípio 3): a profissional sem o Financeiro e sem
  receber via "Plano · R$ 2.672 a vencer" na tela do atendimento — dinheiro que
  não é dela tratar. O banner do plano (`[data-plano-em-aberto]`, o em aberto e
  o a vencer) só é lido e mostrado com `podeReceber`; a recepção o vê como
  antes. Prova: `e2e/atendimento-atritos-da-7.spec.ts` ("A39").
  - **Uma transação, com o plano travado** (F11, sobra da F9): o app calcula o
    que cobrar e os lançamentos novos, e `plano_receber` grava tudo de uma
    vez — trava o plano, confere que o em aberto que o app leu continua em
    aberto e com a mesma soma, e só então quita ou troca o saldo por entrada
    + parcelas. Duas abas ao mesmo tempo: uma recebe, a outra ouve "Este
    saldo já foi recebido ou mudou". A entrada acima do em aberto é recusada
    (ven-02, abaixo). Prova: `e2e/plano-recebimento-concorrente.spec.ts`.
- **A tela do plano FECHADO mostra o dinheiro e as sessões** (J-42,
  2026-10-30): "Valor do plano", "Recebido" e "A receber" (contados no banco,
  `metrics_financeiro_do_plano` → `getFinanceiroDoPlano`,
  `lib/metrics/plano.ts`; o recebido é a regra única de receita), cada
  lançamento — entrada e "Parcela 2/3", com "Pago em … · Pix", "A vencer em
  …" ou "Vencida em … · cobrada no check-in" — e "1 de 3 sessões feitas · 1
  agendada". Dizia só "O que estiver em aberto é recebido no check-in", e o
  check-in só cobra o que venceu. Migration `20261029001801`. Prova:
  `e2e/plano-tela-mostra-o-pago.spec.ts`. **O rodapé diz com quem fica a
  parcela que vence depois** (A28 da 9ª simulação; a regra de cargo fica): a
  recepcionista sem o Financeiro lia "se recebe no financeiro", tela que ela
  não abre; para quem não tem o Financeiro em Gerenciar, "…a que vence depois
  se recebe no Financeiro, com quem tem o Financeiro em Gerenciar: Lúcia,
  Fernanda." (`rodapeDoPlanoFechado`, `lib/plano-de-tratamento/textos.ts`; os
  nomes de `quemDesfazNoCaixa`, a lista da A33 da 8ª, pela unidade do plano;
  `[data-rodape-do-plano]`). Prova: `e2e/plano-atritos-da-9.spec.ts` ("A28"),
  `tests/textos-do-plano-da-9.test.ts`.
- **Desconto de fidelidade** fica em `loyalty_discount`, FORA de `amount`: o
  lançamento registra o dinheiro que entrou (§9.2.2). Pago todo com pontos, o
  lançamento é de R$ 0 e sem forma de pagamento.
- **Desconto em todas as vendas** (decisão do Heitor, 2026-09-30): pacote,
  checkout do plano e o recebimento do avulso na recepção, em R$ ou %, SEM
  TETO, e fica registrado quem deu. A conta é uma só (`lib/vendas/desconto.ts`,
  em centavos; a tela usa `CampoDoDesconto`): o servidor a refaz a partir do
  pedido, e a função do banco confere.
  - **Pacote**: `client_packages.price` é o VENDIDO (`preco_tabela` −
    `desconto`; quem deu é quem registrou, `registrado_por` — `sold_by` é quem VENDEU, com-06); pagamento e sessões fecham com ele.
  - **Plano**: o desconto é RATEADO nos procedimentos do plano
    (`plano_aplicar_desconto`, maior resto — nenhum passa do preço de antes):
    `price` vira o vendido e o de antes fica em `preco_tabela`
    (`treatment_plans.desconto`/`desconto_por`). Contrato, sessões, comissão e
    fidelidade leem o preço vendido e não precisam saber de desconto. Parte
    sempre do preço de antes: repetir é seguro, e desconto 0 desfaz.
  - **Avulso**: `financial_transactions.sale_discount`, fora de `amount` (o
    bruto é `amount + loyalty_discount + sale_discount`). A ordem é voucher →
    desconto comercial → pontos (o teto dos pontos vale sobre o que sobra).
    O desconto tem um **motivo OPCIONAL** (J-47, 2026-10-30): o campo
    "Motivo do desconto (opcional)" aparece na janela do pagamento quando há
    desconto, e `confirmar_pagamento_do_atendimento` o grava em
    `financial_transactions.desconto_motivo` (até 300 caracteres; sem
    desconto, nulo) e na linha do tempo ("com desconto de R$ 50,00 (Cliente
    fiel)"). Migration `20261029001503`. Prova: `e2e/vendas-desconto.spec.ts`.
  - **O motivo em TODA venda, e na lista** (fin-01 da revisão, 2026-11-02;
    o Heitor: "adicionar campo de texto livre para informar motivo, não
    obrigatório"). Com desconto, o `CampoDoDesconto comMotivo` pede "Motivo
    do desconto (opcional)" na venda de produto, de pacote, de pré-pago e no
    checkout do plano; o motivo vai em `desconto_motivo` do PRIMEIRO
    lançamento da venda (`comMotivoDoDesconto`; as três funções de venda o
    leem — migration `20261101001102`). A lista do Financeiro (unidade e
    rede) diz embaixo do valor "Desconto R$ 20,00 · cliente antiga"
    (`descontosDosLancamentos`, `lib/financeiro/desconto-do-lancamento.ts`:
    o avulso pelo `sale_discount` do lançamento; a venda pelo desconto
    gravado nela, no lançamento que leva o motivo — um por venda, não um
    por parcela). Venda com desconto e SEM motivo não ganha a linha (o
    desconto dela aparece em Relatórios → Vendas). Prova:
    `e2e/financeiro-motivo-do-desconto.spec.ts`.
  - **O motivo segue opcional, e a janela lembra que ele existe** (A49 da 7ª
    simulação, 2026-11-05: o desconto de R$ 100 da Ana gravou sem o porquê): com
    desconto e o motivo em branco, a janela do pagamento e as do "Vender" dizem
    "Sem motivo, a lista do Financeiro mostra só o valor do desconto…"
    (`LembreteDoMotivo`, `[data-lembrete-do-motivo]`). Prova:
    `e2e/financeiro-atritos-da-7.spec.ts` ("A49").
  - **Contrato**: o desconto é parte do COMBINADO — vai no retrato do
    pagamento (`pagamentoNormalizado(p, desconto)`, só quando existe), e
    trocá-lo depois de assinar substitui o contrato como trocar a forma.
    `pagamento.forma` fala do valor com desconto e diz o desconto; há
    `pagamento.subtotal` e `pagamento.desconto`.
  - Prova: `e2e/vendas-desconto.spec.ts`.
- **Pagar com `INTERNAL_CREDIT` desconta do saldo e recusa sem saldo**
  (2026-09-27). É GATILHO (`trg_credito_interno_uso`), pelo argumento do §9.9:
  receita paga nasce em cinco lugares. O saldo é a soma de
  `internal_credits.amount` — concessão positiva, uso NEGATIVO com o
  `transaction_id` que o consumiu. Estornar um pagamento feito com crédito
  devolve o crédito. **A tela de cobrança diz o saldo antes** (A36 da 8ª
  simulação, 2026-11-06; princípio 3): escolhido o crédito na clínica — no
  "Vender" (`CamposDoPagamento`), no "Confirmar pagamento" do atendimento e
  no checkout do plano —, "Crédito na clínica: R$ 270,00 · depois deste
  pagamento: R$ 170,00", ou que não cobre e quanto falta
  (`[data-saldo-do-credito]`, `SaldoDoCredito`; o saldo do banco,
  `getCreditoInternoDoCliente`, pela action `saldoDoCreditoDaCliente`, de quem
  recebe). Prova: `e2e/caixa-atritos-da-8.spec.ts`.
- **O crédito comprado conta no Investido total na compra, e a ficha diz** (A29
  da 10ª simulação, 2026-11-10: logo depois da venda do vale, o LTV foi a R$ 650
  sem nota): com um crédito na clínica comprado (`internal_credits.credito_vendido_id`),
  "Inclui o crédito na clínica comprado: o dinheiro conta aqui no dia da compra,
  e usar o crédito depois não conta de novo." (`[data-pago-com-credito]`). Prova:
  `e2e/ficha-uso-da-10.spec.ts` ("A29").
- **A ficha diz o que ela pagou com crédito** (A43 da 8ª): "+ R$ 180,00 pagos
  com crédito na clínica: não contam aqui…" embaixo do "Investido total" e na
  aba Financeiro (`[data-pago-com-credito]`,
  `metrics_pago_com_credito_do_cliente`, migration `20261106003803`) — o
  crédito não é receita (F7), e a ficha dizia "R$ 0" ao lado do "Preço médio
  R$ 450" sem explicar. **E diz de onde veio o crédito** (A41 da 9ª; princípio
  3): "o dinheiro entrou quando o crédito nasceu" era falso no CONCEDIDO.
  Agora "o crédito foi concedido pela clínica, sem dinheiro — não é receita",
  "o dinheiro entrou quando o crédito foi comprado (ou ficou de um
  cancelamento)" ou as duas coisas (`textoDaOrigemDoCredito`,
  `lib/creditos/origem.ts`), pela origem de cada crédito:
  `internal_credits.concedido` (o "Conceder crédito" grava; os de antes,
  marcados pela migration `20261107004407`), o comprado (`credito_vendido_id`)
  e o que ficou de um pagamento. Prova: `e2e/financeiro-ficha-e-app-da-9.spec.ts`
  ("A41"), `tests/credito-origem.test.ts`.
- **A quem pedir o que o caixa não desfaz** (A33 da 8ª; a regra de cargo fica:
  estornar, devolver e cancelar pacote são do Financeiro em Gerenciar): para
  quem recebe e não desfaz, a aba Financeiro da ficha diz "Estornar um
  pagamento, devolver uma venda de produto ou cancelar um pacote é de quem tem
  o Financeiro em Gerenciar: Lúcia, Fernanda." (`[data-quem-desfaz]`) e o cartão
  do pacote, "Cancelar o pacote é de…" — os nomes de `quemDesfazNoCaixa`
  (`lib/equipe/quem-desfaz.ts`: ativos, ao alcance da unidade, e a Admin da
  rede). **E a tela do atendimento pago também** (A35 da 12ª simulação,
  2026-11-11: a Heloísa procurou ali): embaixo do "Pagamento confirmado",
  "Estornar este pagamento é de quem tem o Financeiro em Gerenciar: …"
  (`[data-quem-estorna]`).
- **Estornar e receber na própria ficha** (A32 e A35 da 12ª; princípio 3: a
  Helena, no celular, só achava o estorno em Financeiro → Lançamentos, uma
  página de 20 mil px; a parcela do crediário na ficha não tinha ação): na aba
  Financeiro da ficha, o lançamento pago tem "Estornar" para quem estorna (o
  Financeiro em Gerenciar, sem "só os meus") — a MESMA janela dos financeiros
  (`ConfirmarEstorno`, com os pontos que saem; a venda de crédito abre a dela) —
  e a parcela em aberto tem "Receber" para quem recebe (Recebimentos), que
  pergunta a forma (`ReceberNoCartao`) — `AcoesDoLancamentoDaFicha`
  (`components/shared/acoes-do-lancamento-da-ficha.tsx`). As actions conferem
  tudo de novo. Prova: `e2e/financeiro-atritos-da-12.spec.ts` ("A32", "A35").
  **E no atendimento pago** (A19 da 14ª, F75): a página do atendimento
  mostra o "Estornar" junto de "Pagamento confirmado", com a mesma janela.
  Quem vê o botão é uma conta só, `podeEstornar(ctx)`
  (`lib/financeiro/so-os-meus.ts`, a trava de `reverseTransaction`), usada
  pela ficha (unidade e rede) e pelo atendimento. Prova:
  `e2e/financeiro-f75-pagamento-com-maquininha.spec.ts`.
- **A venda concluída avisa** (A46 da 8ª): o "Vender" (produto, procedimento e
  pacote) fechava a janela calado; agora "Venda registrada: 2× Sérum —
  R$ 200,00. O recibo fica na aba Financeiro da ficha." (`avisoDaVenda`).
- **O plano PROPOSTO no app** (D-18, decisão do Heitor, 2026-10-30): a home
  do portal mostra o plano proposto (`data-plano-proposto`) com as sessões e
  os procedimentos, o valor (a soma dos preços das sessões, em centavos), a
  validade e "Falar com a clínica" (o WhatsApp da unidade do endereço,
  `aClinicaDoEndereco`). O app NÃO aceita: o texto diz "O aceite é feito na
  clínica". A anotação do profissional (`professional_notes`) e a da sessão
  (`treatment_plan_sessions.notes`) são clínicas e nem são lidas pela tela.
  A validade é da REDE (`tenants.plano_validade_dias`, 30 por padrão, 1–365,
  Configurações → Geral; migration `20261029001202`), contada de quando o
  plano foi proposto; vencida, o app diz "Proposta vencida em …". É só
  informação: o checkout na clínica não recusa o plano vencido. Prova:
  `e2e/portal-cliente-plano-proposto.spec.ts`, `e2e/configuracoes-geral.spec.ts`.
- **O plano e o avulso do MESMO procedimento AVISAM** (D-18, "Reforça" item
  12, e A68 da 5ª simulação: a Rosana via o plano de R$ 3.600 — 2×
  Bioestimulador — e, ao lado, o Bioestimulador de R$ 1.800 agendado pelo
  médico, sem ligação: "a cliente não sabe se paga os dois";
  `lib/checkout/plano-e-avulso.ts`):
  - o AGENDAR — o modal da agenda e, desde o r2-age-07 (o Heitor,
    2026-11-03: "Pôr o aviso também no agendar pelo CRM"), o "Agendar" da
    conversa/oportunidade no inbox, quando a conversa já tem a ficha —, com a
    cliente e o procedimento escolhidos:
    "Rosana tem um plano proposto com Bioestimulador (2 sessões · R$ 3.600,00).
    Agendar pelo plano? Avulso, ele é cobrado à parte." — no plano fechado,
    as sessões dele ainda sem agendamento —, com "Abrir o plano"
    (`avisoDoPlanoAoAgendar`);
  - o CHECKOUT do plano e o app da cliente (o cartão do plano proposto):
    "Bioestimulador agendado à parte em 06/11 às 16:00 (R$ 1.800,00)" — o
    agendado ainda por vir, sem plano, fora de pacote e de pré-pago, de um
    procedimento do plano (`avulsosDoPlano`).
  Só aviso: nada se liga sozinho nem se bloqueia; quem fecha cancela o avulso
  e agenda pela sessão, ou ajusta o plano. Prova: `e2e/plano-e-avulso.spec.ts`.
- **A cliente vê o saldo do crédito no app** (D-17, decisão do Heitor,
  2026-10-30): o Financeiro do portal mostra "Crédito na clínica" com o saldo
  da ficha da clínica do ENDEREÇO (`ctx.clientId`), só quando é maior que
  zero — `getCreditoInternoDoCliente` (`lib/metrics/unidade.ts`, a conta de
  `metrics_financeiro_do_cliente`, a mesma da ficha). Só o saldo: os
  lançamentos do crédito (com a descrição interna) ficam com a equipe.
  Prova: `e2e/portal-cliente-credito-interno.spec.ts`. **E o Início também**
  (A46 da 9ª simulação: a Rosana, sem plano, só chegou ao Financeiro pela URL —
  o único link ficava no detalhe de um plano): o cartão "Crédito na clínica ·
  R$ 181,00 · Use em qualquer atendimento ou produto · Ver no Financeiro"
  (`[data-credito-na-clinica-no-inicio]`), com o mesmo saldo. Prova:
  `e2e/financeiro-ficha-e-app-da-9.spec.ts` ("A46").
- **Os pagamentos do app dizem o vencimento e o que falta pagar** (A64 da 5ª
  simulação; Histórico → Pagamentos): a parcela pendente diz "Parcela 2 de 3 ·
  vence em 01/12/2026" (`due_date`, senão `data_de_referencia`, por
  `formatDia`), e o atendimento avulso concluído e não pago aparece "A pagar
  na clínica" — a conta de `atendimentos_a_receber` (`getAtendimentosAReceber`),
  a mesma do Fechamento e da ficha. Prova: `e2e/portal-cliente-pagamentos.spec.ts`.
  **E o Financeiro do app também** (D4 da 7ª simulação, 2026-11-05; princípio
  3): as três parcelas da Larissa apareciam com a data de CRIAÇÃO (05/11), na
  ordem 3/3, 2/3, 1/3. O pendente diz "Vence 05/12/2026" (`due_date`, senão
  `data_de_referencia`, por `formatDia`) e vem primeiro, pela próxima a
  vencer; o resto, pelo dia do pagamento, do mais recente. Prova: o mesmo
  spec ("D4"). **E o Histórico → Pagamentos também** (D17 da 8ª simulação,
  2026-11-06): ordenava pela criação, e a parcela 2/2 vinha antes da 1/2. A
  ordem é UMA, `ordemDosPagamentosDoApp` (`lib/clientes/ordem-dos-pagamentos.ts`),
  nas duas telas. Prova: o mesmo spec ("D17").
- **O RECIBO do pagamento, em PDF** (ven-06 da revisão, 2026-11-02; o
  Heitor: "um recibo simples em PDF, pelo app ou impresso"). Todo lançamento
  de receita PAGO e vivo (sem estorno) tem "Recibo" na lista dos dois
  financeiros, e a cliente tem "Recibo" no Financeiro do app. **E também**
  (r2-ven-13, o Heitor, 2026-11-03) na aba Financeiro da ficha da cliente
  (os dois portais; não para quem tem o financeiro "só os meus" sem receber,
  que a rota recusa), no Histórico → Pagamentos do app (que passou a dizer
  "Estornado" no estornado, como o Financeiro do app) e na tela do
  atendimento pago, ao lado do "Pagamento confirmado" (para quem recebe). É
  `GET /api/recibos/[id]` (abre o PDF no navegador — imprimir ou baixar):
  sessão; da equipe, quem recebe ou vê o financeiro da unidade inteira, com
  a rede e a unidade ao alcance; da cliente, só o pagamento de uma ficha DELA.
  Do a receber ou do estornado, 404. O texto (`reciboDoLancamento`,
  `lib/financeiro/recibo.ts`, pelo gerador simples de `lib/pdf.ts`): nº,
  quem pagou (com o CPF, ou o passaporte/RNE), a quantia, o referente, a
  forma ("Crédito 3x"), quando, o desconto e o motivo quando há, e quem
  recebeu (clínica, unidade, CNPJ, endereço, telefone) — e "Este recibo não
  substitui a nota fiscal." Prova: `e2e/financeiro-recibo.spec.ts`.
  **O recibo do ATENDIMENTO diz o que foi pago** (A43 da 7ª simulação,
  2026-11-05: dizia "Atendimento concluído", a descrição do lançamento): o
  "Referente a" é o procedimento, o dia e a hora do atendimento e a profissional
  ("Toxina — atendimento de 05/11/2026 às 10:00, com Rita"), e o crédito em N
  vezes ganha "Parcelas no cartão: 2x de R$ 550,00" (`parcelasEmTexto`). Prova:
  `e2e/financeiro-atritos-da-7.spec.ts` ("A43").
- **Estornar pede confirmação** (`ConfirmarEstorno`, nos financeiros da rede e
  da unidade; 2026-10-20): mostra o lançamento e o valor e avisa que não se
  desfaz. Era um clique só.
- **O estorno avulso do pagamento de um pacote, plano ou pré-pago REABRE a
  cobrança** (H2 do levantamento das regras, o Heitor, 2026-11-11, opção a; a
  mesma regra da D6 de 28/10 para o atendimento avulso). O "Estornar" da lista
  devolve o dinheiro, e aquele pagamento volta a ser "a receber" da mesma
  venda, com o mesmo vencimento — a clínica não perde dinheiro sem perceber, e
  corrigir a forma continua possível (estorna e recebe de novo). A janela diz
  isso antes: "Estornar o Pix de R$ 900,00 do pacote 6 limpezas? O dinheiro
  volta à cliente, e o pacote volta a ter R$ 900,00 a receber. Para desfazer a
  venda, use 'Cancelar pacote' na ficha." Desfazer a venda continua sendo o
  "Cancelar pacote/plano/unidade". Feito na F67 (C39): `estornar_e_reabrir`,
  que só o "Estornar" da lista chama — os cancelamentos usam
  `estornar_transacao` direto, porque ali a venda é desfeita. Prova:
  `e2e/financeiro-f67.spec.ts` ("C39").
- Estorno (`estornar_transacao`, uma transação): contra-transação + a original
  marcada `notes='Estornada'` (nunca deletar). Recusa lançamento **não pago**
  e o **próprio estorno**. A contra-transação não leva `appointment_id` (há
  UNIQUE nele — levar fazia todo estorno de atendimento falhar).
  - **O estorno pede o MOTIVO e sai na forma da original** (A36,
    2026-10-27): `financial_transactions.estorno_motivo`, gravado nas duas
    pontas e mostrado na lista ("Motivo: …"); obrigatório na tela
    (`ConfirmarEstorno`) e na action (`reverseTransaction`) — a função
    aceita sem ele só pelos chamadores antigos. O contra-lançamento herda
    `payment_method` e `cartao_vezes`: a linha do estorno ficava "—", e
    quem conferia a gaveta não sabia que o dinheiro saiu do caixa em
    espécie. Continua fora de toda conta e de todo gatilho de dinheiro
    (categoria 'Estorno'). Prova: `e2e/financeiro-estorno-motivo.spec.ts`.
  - **O estorno REABRE a cobrança do atendimento** (D6 da simulação de
    2026-10-28, decisão do Heitor; migration `20261028000201`): estornada a
    receita de um atendimento avulso, ele volta aos concluídos a receber
    (`atendimentos_a_receber` e a guarda de
    `confirmar_pagamento_do_atendimento` só contam como pago o lançamento
    VIVO, sem `notes = 'Estornada'`), e o "Confirmar pagamento" vale de novo —
    um lançamento NOVO, com cliente, pontos e comissão pelos gatilhos de
    sempre. A unicidade de `financial_transactions.appointment_id` é só do
    lançamento vivo (índice parcial): o estornado fica no histórico ao lado.
    Nada duplica: o estorno já devolveu a comissão (ESTORNO) e os pontos
    (ESTORNO_GANHO), e a comissão do avulso (`comissao_alvo`) e a venda
    (`metrics_vendas`) leem o lançamento vivo (sem ele, o último estornado).
    Quem lê "o pagamento do atendimento" filtra o estornado (a tela do
    atendimento diz "Pagamento estornado — … O atendimento voltou a receber").
    O portal da cliente mostra o estornado como "Estornado" (não "Pago"), e a
    ficha mostra o original "Estornado" e o estorno com o sinal de saída.
    O pagamento de novo NÃO manda outro "Purchase" à Meta (decisão do
    Heitor, 2026-10-28; `on_transaction_paid`, migration `20261028000701`):
    a Meta não sabe do estorno e contaria duas compras. O evento interno
    `pagamento.recebido` continua.
    Prova: `e2e/financeiro-estorno-reabre.spec.ts`.
  - **O estorno do atendimento DIZ isso** (A51/A52 da 5ª simulação): a
    janela do estorno de um recebimento de atendimento avisa "O atendimento
    volta a receber: a cobrança dele reabre…" (`ConfirmarEstorno
    doAtendimento`); o histórico do agendamento ganha `PAYMENT_REVERSED`,
    "Pagamento estornado — <motivo>" (`reverseTransaction`; dizia
    "Pagamento recebido" duas vezes e nenhum estorno); recebido de novo, a
    tela tira o `?receber=1` da URL e não mostra mais o "Fechar agora" (o
    checkout do plano aqui mesmo — ao lado do "Pagamento confirmado" ele se lia
    como receber de novo; o "Gerar plano e enviar à recepção" fica). Na lista
    dos dois financeiros, o contra-lançamento é "Estorno" (não "Despesa") e
    diz "Anula a receita estornada". Prova: `e2e/financeiro-estorno-atritos.spec.ts`.

---

## O que nunca fazer aqui

❌ Prender ver ou agendar as sessões do pacote, do plano ou do pré-pago à unidade da VENDA (é alcancaOTratamento; o dinheiro é alcancaOCaixaDoTratamento — lib/tratamento/alcance.ts, F73)

❌ Gravar "paga" na comanda (a situação é o lançamento vivo pago da venda) ou criar a comanda do atendimento fora do gatilho comanda_do_atendimento

```
❌ Criar FinancialTransaction fora de um Appointment concluído sem justificativa
❌ Criar pacote de cliente fora de pacote_vender (sessões, retrato do preço e dinheiro vão juntos) — o trazido de fora é pacote_trazer (F35)
❌ Migrar o saldo de um pacote de fora como venda a R$ 0 (entra no caixa, nas Vendas, no ticket e no app com recibo): é "Trazer pacote de fora" (decisão 1 da 8ª), sem lançamento
❌ Listar no catálogo de venda (ou deixar editar) o service_packages de_fora — é o registro do pacote trazido
❌ Gravar pela ficha da rede (venda, crédito, pontos, voucher, sessão) na unidade de cadastro da cliente ou na primeira da lista — com duas ou mais unidades, pergunta (D1 da 8ª)
❌ Estornar em parte um pagamento no cartão (crédito ou débito): o cartão estorna o pagamento inteiro (r2-fin-03) — no cancelamento do pacote é o "estornar o pagamento inteiro e lançar o usado de novo"
❌ Cancelar pacote fora de pacote_cancelar_devolvendo, ou fazer a conta do cancelamento na tela (é a simulação da mesma função), ou ler "pacote em andamento" sem tirar o cancelado (cancelado_em)
❌ Cancelar o plano fechado fora de plano_cancelar_devolvendo, com uma conta própria (preço de tabela, multa) ou mexendo no dinheiro fora de private.cancelamento_dinheiro — é a regra do pacote (decisão 2 do Heitor sobre a 9ª)
❌ Calcular desconto de venda fora de lib/vendas/desconto.ts, ou confiar no valor de desconto que o navegador manda
❌ Pôr desconto comercial em amount ou em loyalty_discount (é sale_discount no avulso; no pacote e no plano, o preço vendido)
❌ Gravar um parcelado como um lançamento só (cada parcela é um lançamento; divida com dividirEmParcelas) ou escrever em installments
❌ Mostrar o valor da parcela como saldo ÷ parcelas (a média arredondada não soma o saldo): é a divisão gravada, dividirEmParcelas / parcelasEmTexto (D2 da 7ª)
❌ Recortar a lista do financeiro por created_at (é data_de_referencia: pago no pagamento, em aberto no vencimento)
❌ Mexer no preço dos procedimentos do plano no checkout fora de plano_aplicar_desconto
❌ Reaproveitar pacote (client_packages) para o procedimento pré-pago — são separados (decisão do Heitor)
❌ Vender pré-pago fora de procedimento_vender, ou cancelar unidade fora de procedimento_cancelar_unidade_devolvendo
❌ Gravar a parcela do crediário da clínica com o meio da entrada (é sem meio, escolhido ao receber — D6), ou dizer no contrato que ela é "no cartão de crédito"
❌ Deixar uma forma de pagamento escolhida de antemão numa tela de cobrança (o Pix calado — A37): nasce vazia, salvo o meio combinado no contrato
❌ Gravar na descrição de um lançamento texto interno da tela ("checkout novo paciente") — ela chega à cliente (A47)
❌ Registrar o que volta de um cancelamento como despesa "Devolução" a pagar — é estorno ou crédito na clínica, a escolha da recepção (D1, 6ª simulação)
❌ Ligar crédito (unidade pré-paga ou sessão de pacote) a agendamento fora de createAppointmentCore/ligarCredito, ou com o preço que o navegador mandou
❌ Gravar due_date como "AAAA-MM-DD" cru (meia-noite UTC = 21h da VÉSPERA em Brasília) — use vencimentoDoDia (lib/financeiro/lancamento.ts)
❌ Dar baixa sem a guarda do já pago/estornado (marcarPagoCore confere a linha devolvida)
❌ Gravar "cartão de crédito em N vezes" como parcelas a receber DA CLIENTE (ela pagou na hora: é UM lançamento pago, com cartao_vezes) — entrada + parcelas é o crediário da clínica; o que a operadora deposita em parcelas mora em recebiveis_do_cartao, nascido pelo gatilho
❌ Contar a parcela da operadora (recebiveis_do_cartao) como receita ou como dívida da cliente — a receita é da venda, no dia dela
❌ Ler a taxa ou o prazo do cartão sem a bandeira do pagamento (é private.comissao_taxa_pct com a bandeira e private.prazo_da_operadora; o de 3 argumentos é só a regra geral)
❌ Dar à bandeira a taxa de OUTRA quantidade de vezes dela (a Elo do 3x no 5x) — sem a taxa exata na bandeira, vale a regra geral daquelas vezes (r4-f15-01)
❌ Pôr teto de negócio na taxa da maquininha (F16-3: só não negativa), ou ler a regra geral por payment_fees.taxa_pct sozinho (acima de 100% ela está em taxa_pct_sem_teto)
❌ Cair na taxa de OUTRA quantidade de vezes, na bandeira ou na regra geral (o 3x no 4x) — sem a taxa exata, é 0% e a tela avisa (F16-2); a taxa que existe é private.taxa_da_maquininha
❌ Ler a taxa, o prazo ou o "parcelar até" sem a maquininha da venda (C75): é private.taxa_da_maquininha / comissao_taxa_pct / prazo_da_operadora COM financial_transactions.maquininha_id; payment_fees e tenants.cartao_* são só o espelho da 1ª maquininha até a limpeza
❌ Caminho novo de cartão sem "Qual maquininha?" (CampoDaMaquininha + useFaltaAMaquininha/useRecusaDoPagamento na tela, recusaDasVezesDaRede com a maquininha e o método no servidor) — com mais de uma, a primeira não vale calada
❌ Pôr maquininha em despesa (o cartão da clínica não é maquininha) ou assinar financial_transactions no Realtime (é o sinal financeiro_sinais)
❌ Ler ou gravar financial_transactions pela sessão (é o servidor, depois da trava e do alcance — a política restritiva financeiro_so_pelo_servidor recusa)
❌ Montar o rótulo de um pagamento de cartão sem a maquininha quando a rede tem mais de uma (é rotuloDaForma com maquininhaDoRotulo; no banco, private.rotulo_do_pagamento)
❌ Escrever "Entrada + parcelas" à mão numa tela (é ROTULO_DO_CREDIARIO)
❌ Cobrar no check-in parcela que ainda não venceu (já está combinada; é emAbertoDoPlano quem separa)
❌ Receber o plano no check-in fora de plano_receber (o plano travado e o saldo conferido: duas abas recebiam o mesmo saldo duas vezes — F11)
❌ Fechar o checkout de um plano deixando de fora o atendimento de origem com preço e sem pagamento (atendimentoDeHojeDoPlano)
❌ Decidir na tela se um atendimento concluído está "a receber" (é atendimentos_a_receber), ou pedir pagamento de atendimento de R$ 0
❌ Gravar texto para pessoas (histórico, descrição) com o código da forma (CASH, CREDIT_CARD) — é rotuloDaForma no app e private.rotulo_da_forma no banco
❌ Cortar calado a entrada maior que o total (Math.min(entrada, total)) — é recusaDaEntradaAcimaDoTotal, na tela e no servidor (ven-02)
❌ Ler dinheiro digitado com uma regra própria (Number(s.replace…), parseFloat em campo de texto) — é parseDinheiro, e o NaN dele é recusa, não zero
❌ Ler "o lançamento do atendimento" (appointment_id) sem tirar o estornado — o atendimento pode ter o estornado e o recebimento novo (maybeSingle quebra; o "pago" mente)
❌ Devolver e.message num catch de action (o 'Forbidden' da trava ia em inglês para a tela) — é mensagemDoErro
❌ Gravar sold_by como quem registrou a venda quando a tela disse outra pessoa (ou ninguém) em "Quem vendeu" — sold_by é quem vendeu, registrado_por é quem registrou (com-06)
❌ Vender produto fora de produto_vender_itens (a de um produto só, produto_vender, é a versão velha e nada a chama), ou ler os produtos de uma venda pelo product_id do cabeçalho (no kit é só o primeiro: são os product_sale_items)
❌ Estornar o lançamento de uma venda de produto fora de produto_estornar_venda (a venda, o estoque e o custo não saberiam), ou contar product_sales sem tirar a estornada (estornada_em)
❌ Devolver parte de uma venda de produto estornando a venda inteira e vendendo de novo, ou fora de produto_devolver_itens — e ler o valor, as unidades ou o custo de uma venda de produto sem tirar o devolvido (price − valor_devolvido, custo − custo_devolvido)
❌ Deixar a "Forma do pagamento do usado" em branco no estorno inteiro: vem a do pagamento original (comOPagamentoInteiro — A41 da 8ª)
❌ Mostrar o a receber vencido como "Pendente", ou decidir no navegador se venceu (o dia é do servidor: situacaoDoVencimento; os números, metrics_a_receber_vencido — D13 da 9ª)
❌ Tabela de lançamentos sem cards-mobile, ou as Transações da ficha fora da ordem da data que a linha mostra (ordenarTransacoesDaFicha — D7 da 10ª)
❌ Trocar o due_date de um lançamento sem lancamento_remarcar_vencimento (o histórico da remarcação se perde — A37 da 9ª)
❌ Calcular a taxa ou o líquido de um lançamento na tela (o CSV) — é metrics_taxa_dos_lancamentos, a conta do lucro (A31 da 10ª)
❌ Rotular o cartão do caixa só "Despesas": é "Despesas pagas (caixa)", que tem a compra de estoque e o pagamento das comissões (A24 da 10ª)
❌ Vender crédito na clínica pelo "Conceder crédito" (fica fora do caixa) ou por um lançamento manual (o crédito não nasce): é credito_vender, o "Crédito na clínica" do Vender (decisão 1 da 9ª)
❌ Estornar o lançamento da venda de crédito fora de credito_estornar_venda (o dinheiro voltava e o crédito ficava), ou devolver mais que o saldo que a cliente ainda tem
❌ Lançar o bônus do crédito na clínica como receita, ou deixar o bônus no saldo depois do estorno da venda (ele sai junto, inteiro ou na proporção — a clínica escolhe; A20 da 11ª)
❌ Tirar do dia do pagamento um estorno feito noutro dia (o Fechamento de um dia passado não muda): o estorno é a saída do dia em que foi feito — metrics_movimentos_pagos (D2 da 12ª, princípio 5)
❌ Gravar um contra-lançamento de estorno (category = 'Estorno') sem estorno_de (o pagamento que ele estorna): sem a ligação, ele cai na regra antiga e some dos dois dias
❌ Somar ENTRADAS a partir de metrics_receitas_pagas sem separar o estorno de outro dia (estorno_de, linha negativa): é saída, não entrada negativa
❌ Pôr o estorno de uma DESPESA nos "Estornos do dia" ou com o sinal de devolução à cliente: o dinheiro voltou ao caixa (D3 da 12ª)
❌ Somar o "caixa da lista" (ou a coluna do CSV) por uma regra própria: é o no_caixa de metrics_caixa_dos_lancamentos (D9 e A45 da 12ª)
❌ Pôr o desconto de uma venda em cada parcela do CSV (ele sai UMA vez por venda — extrasDoCsv, A44 da 12ª)
❌ Dizer "Ver e dar baixa" ou "use Pagar na linha" a quem não tem a baixa (a contadora só vê — A42 da 12ª)
```
