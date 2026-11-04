# Pacotes, procedimento pré-pago e financeiro

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.3.1 Pacotes (2026-09-30)

Um CONJUNTO de procedimentos, iguais ou não ("5 limpezas + 3 drenagens"),
vendido por um preço só (decisão do Heitor, 2026-09-30). Até 2026-09-30 só
existiam no banco de demonstração — nenhuma tela criava pacote nem o vendia.

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
  - Também no painel da direita do inbox, com as ações da pessoa
    (`getConversationCard` → `venda`), **com ou sem ficha**. A
    unidade é a de quem atende, senão a do cliente, senão a única da rede.
    Com cliente, fora do alcance ou sem pacote na unidade, o botão não
    aparece. Como as outras ações da pessoa, também some com o painel só de
    leitura (sem `crm: MANAGE`).
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
    O retrato do cancelamento guarda a escolha (`cancelamento.estorno`,
    `.novo`). **No cartão (crédito, em qualquer número de vezes, e débito)
    só existe a (b)** (r2-fin-03, §9.6): a (a) fica desligada com o motivo
    ("No cartão, a operadora estorna o pagamento inteiro") e a (b) já vem
    escolhida; o banco recusa a (a). Na (b), a receita do usado entra no dia
    do cancelamento (é um pagamento novo, e o Fechamento do dia o mostra na
    forma escolhida), e a do pagamento estornado sai do dia dele, como todo
    estorno (decisão desta frente, para o Heitor revisar). A função é
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
    "cancelado em".
  - Prova: `e2e/pacote-cancelar.spec.ts`.
- A sessão só LÊ pacote: as políticas de INSERT/UPDATE de `client_packages` e
  `service_packages` saíram (dava para dar sessão de graça pela chave pública).
- Comissão: a de VENDA e a de EXECUÇÃO são do cadastro de cada pacote
  (2026-10-30, §9.7 "A comissão do PACOTE"); a do "Abater do pacote" segue a
  de execução dele. As duas só ficam a pagar com o pacote pago INTEIRO (H4,
  2026-11-01): no crediário, quando a última parcela entra; no cartão em N
  vezes, na hora.
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
  `createAppointmentCore(… credito: { tipo: 'PRE_PAGO' | 'PACOTE', id })`
  (`lib/creditos/credito.ts`). O crédito é conferido (do cliente, da rede,
  livre, na validade) e decide o procedimento e o preço — procedimento
  diferente é recusado; depois do insert ele é ligado por compare-and-swap
  (`appointment_id` nulo), e quem perde a corrida tem o agendamento desfeito.
  Com conflito de horário, histórico e evento, como todo agendamento.
  - Onde: o card "Procedimentos pagos" ("Agendar" na unidade,
    `agendarUnidadePrePaga`), o modal da agenda e o do inbox (campo "Já
    pago", `creditosParaAgendar`), e o "Agendar agora" depois de vender um
    procedimento (quem tem `agenda: MANAGE`).
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
- **Cancelar a unidade** (`procedimento_cancelar_unidade`, com motivo, só a
  DISPONÍVEL e não agendada): a venda passa a valer menos; o a receber que
  sobrou diminui primeiro (e as parcelas em aberto, da última para a
  primeira); o que o cliente pagou além disso vira **DEVOLUÇÃO a pagar** no
  financeiro (despesa não paga, categoria "Devolução") — "registra para fazer
  estorno" (decisão do Heitor).
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
- A sessão só LÊ `product_sales` (a equipe que alcança a unidade, a cliente a
  dela); as restritivas do suporte valem.
- Prova: `e2e/vendas-produto.spec.ts`.

---

### 9.6 Financeiro
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
    retratada (`private.comissao_taxa_pct`, a mesma da comissão), o líquido e
    o vencimento a cada N DIAS CORRIDOS contados da venda — a parcela k em
    venda + k × N (r2-fin-01, o Heitor, 2026-11-03: "como a operadora paga de
    verdade e configurável o prazo"; era o mesmo dia de cada mês). O N é da
    clínica: Configurações → Comissões → "Prazo da operadora (dias)", junto
    das taxas (`tenants.cartao_prazo_dias`, 30 por padrão, 1–120;
    `salvarPrazoDaOperadora`, a mesma permissão e abrangência das taxas). O
    vencimento é retratado na parcela: mudar o prazo vale para as próximas
    vendas. Migration `20261103001301`.
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
      da F17, para o Heitor revisar); e o Fechamento do dia com venda no
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
      do cálculo: não há coluna de "taxa por parcela" no banco.
    - **As linhas do crédito só até o "Parcelar no crédito até"** (F17-4, o
      Heitor: "as linhas só devem aparecer se estiverem dentro do range de
      parcelas que são oferecidas"): com o limite escolhido (até 5x), a tabela
      mostra o crédito de 1x a 5x — na regra geral e em cada bandeira —, e o
      6x a 12x nem aparecem; o "Preencher pela taxa por parcela" preenche só
      as que aparecem. O seletor do limite fica logo acima do crédito
      parcelado. Com "Só à vista", o crédito parcelado some e a tela diz por
      quê. No **Automático** todas as linhas aparecem: o limite sai delas (a
      maior com taxa) — decisão da F18, para o Heitor revisar. O que está
      gravado acima do limite NÃO se apaga (fica no formulário e é regravado
      no "Salvar taxas"), e aumentar o limite traz as linhas de volta, as
      vazias com o aviso "Sem taxa". **O Pix tem a sua taxa** (na regra geral;
      Pix não tem bandeira): `payment_fees` `PIX`, que já valia no líquido da
      comissão e na estimativa do Fechamento; vazio é sem taxa, sem aviso, e a
      tela diz "o Pix, só se a sua operadora cobrar". Prova:
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
      próximo vencimento e todo o em aberto), e a lista "Cartão em várias
      vezes: a receber da operadora" com as parcelas que vencem no período
      (`ParcelasDaOperadora`). Com o financeiro "só os meus", não aparece.
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
    - As vendas antigas no cartão N× (3 na produção em 2026-11-01: Aurora
      R$ 600, Jasmim R$ 150, Lótus R$ 280) ficam como estão, sem parcelas.
    - Migration `20261101000261`. Prova:
      `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`. "Entrada + parcelas" é o CREDIÁRIO da própria clínica: cada
  parcela a receber, e a comissão espera a última. Vale nas cinco portas: pacote e pré-pago
  (`lancamentosDoPagamento`), checkout do plano, recebimento do plano no
  check-in e o pagamento do atendimento avulso (`p_dados.cartao_vezes`).
  Até aqui "3x no cartão" só cabia em entrada + parcelas, a receber.
  - **A clínica diz até quantas vezes** (D-15, decisão do Heitor,
    2026-10-29: "A clínica configura 'parcela até Nx'. O padrão é o maior
    número de parcelas com taxa cadastrada."): Configurações → Comissões →
    "Parcelar no crédito até" (`tenants.cartao_max_vezes`, 1–12, migration
    `20261029001603`; grava `salvarMaximoDeVezes`, a mesma permissão das
    taxas). Vazio = automático: a maior parcela do CRÉDITO com taxa em
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
    parcelas do crediário ("entrada + parcelas") não mudaram. Prova:
    `e2e/financeiro-parcelas-no-credito.spec.ts`, `tests/financeiro-vezes-do-cartao.test.ts`.
  - **A tela diz o limite e o valor da parcela** (A47 da 5ª simulação):
    junto de todo "Vezes no cartão" (venda de pacote, pré-pago e produto, o
    recebimento do avulso e do plano, o checkout), "Até 4x no crédito" e,
    escolhidas as vezes, "· 3× R$ 1.100,00" (`DicaDasVezes`, a divisão de
    `dividirEmParcelas`). E a venda em "Entrada + parcelas" mostra o resumo
    antes do "Vender por…" (A46): "Entrada R$ 300,00 + 3× R$ 1.000,00"
    (`ResumoDasParcelas`, `lib/checkout/resumo-do-pagamento.ts`; as
    parcelas iguais se juntam). Prova: `e2e/vendas-resumo-do-pagamento.spec.ts`,
    `tests/resumo-do-pagamento.test.ts`.
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
  corrida, o agendamento fica avulso. Prova:
  `e2e/portal-cliente-agendar-o-que-ja-pagou.spec.ts`.
- **O check-in só cobra o que VENCEU** (`emAbertoDoPlano` /
  `separarOEmAberto`): em aberto sem data ou com vencimento até o fim de hoje
  (Brasília). Parcela que vence depois já está combinada — aparece no banner
  como "a vencer", sem botão, e se recebe no financeiro. Antes o banner
  oferecia "Receber R$ 600" de um plano parcelado: cobrança em dobro (a
  simulação de 2026-10-20 achou). Prova: `e2e/plano-recebimento.spec.ts`.
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
  `e2e/plano-tela-mostra-o-pago.spec.ts`.
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
  devolve o crédito.
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
  Prova: `e2e/portal-cliente-credito-interno.spec.ts`.
- **Os pagamentos do app dizem o vencimento e o que falta pagar** (A64 da 5ª
  simulação; Histórico → Pagamentos): a parcela pendente diz "Parcela 2 de 3 ·
  vence em 01/12/2026" (`due_date`, senão `data_de_referencia`, por
  `formatDia`), e o atendimento avulso concluído e não pago aparece "A pagar
  na clínica" — a conta de `atendimentos_a_receber` (`getAtendimentosAReceber`),
  a mesma do Fechamento e da ficha. Prova: `e2e/portal-cliente-pagamentos.spec.ts`.
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
- **Estornar pede confirmação** (`ConfirmarEstorno`, nos financeiros da rede e
  da unidade; 2026-10-20): mostra o lançamento e o valor e avisa que não se
  desfaz. Era um clique só.
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

```
❌ Criar FinancialTransaction fora de um Appointment concluído sem justificativa
❌ Criar pacote de cliente fora de pacote_vender (sessões, retrato do preço e dinheiro vão juntos)
❌ Estornar em parte um pagamento no cartão (crédito ou débito): o cartão estorna o pagamento inteiro (r2-fin-03) — no cancelamento do pacote é o "estornar o pagamento inteiro e lançar o usado de novo"
❌ Cancelar pacote fora de pacote_cancelar_devolvendo, ou fazer a conta do cancelamento na tela (é a simulação da mesma função), ou ler "pacote em andamento" sem tirar o cancelado (cancelado_em)
❌ Calcular desconto de venda fora de lib/vendas/desconto.ts, ou confiar no valor de desconto que o navegador manda
❌ Pôr desconto comercial em amount ou em loyalty_discount (é sale_discount no avulso; no pacote e no plano, o preço vendido)
❌ Gravar um parcelado como um lançamento só (cada parcela é um lançamento; divida com dividirEmParcelas) ou escrever em installments
❌ Recortar a lista do financeiro por created_at (é data_de_referencia: pago no pagamento, em aberto no vencimento)
❌ Mexer no preço dos procedimentos do plano no checkout fora de plano_aplicar_desconto
❌ Reaproveitar pacote (client_packages) para o procedimento pré-pago — são separados (decisão do Heitor)
❌ Vender pré-pago fora de procedimento_vender, ou cancelar unidade fora de procedimento_cancelar_unidade
❌ Ligar crédito (unidade pré-paga ou sessão de pacote) a agendamento fora de createAppointmentCore/ligarCredito, ou com o preço que o navegador mandou
❌ Gravar due_date como "AAAA-MM-DD" cru (meia-noite UTC = 21h da VÉSPERA em Brasília) — use vencimentoDoDia (lib/financeiro/lancamento.ts)
❌ Dar baixa sem a guarda do já pago/estornado (marcarPagoCore confere a linha devolvida)
❌ Gravar "cartão de crédito em N vezes" como parcelas a receber DA CLIENTE (ela pagou na hora: é UM lançamento pago, com cartao_vezes) — entrada + parcelas é o crediário da clínica; o que a operadora deposita em parcelas mora em recebiveis_do_cartao, nascido pelo gatilho
❌ Contar a parcela da operadora (recebiveis_do_cartao) como receita ou como dívida da cliente — a receita é da venda, no dia dela
❌ Ler a taxa ou o prazo do cartão sem a bandeira do pagamento (é private.comissao_taxa_pct com a bandeira e private.prazo_da_operadora; o de 3 argumentos é só a regra geral)
❌ Dar à bandeira a taxa de OUTRA quantidade de vezes dela (a Elo do 3x no 5x) — sem a taxa exata na bandeira, vale a regra geral daquelas vezes (r4-f15-01)
❌ Pôr teto de negócio na taxa da maquininha (F16-3: só não negativa), ou ler a regra geral por payment_fees.taxa_pct sozinho (acima de 100% ela está em taxa_pct_sem_teto)
❌ Cair na taxa de OUTRA quantidade de vezes, na bandeira ou na regra geral (o 3x no 4x) — sem a taxa exata, é 0% e a tela avisa (F16-2); a taxa que existe é private.taxa_da_maquininha
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
```
