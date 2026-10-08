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
- A sessão só LÊ pacote: as políticas de INSERT/UPDATE de `client_packages` e
  `service_packages` saíram (dava para dar sessão de graça pela chave pública).
- Comissão da sessão: §9.7.
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
- **Comissão**: como o pacote — a base é a parte da unidade; no modo
  "quando paga", libera na proporção do que a venda recebeu (sobre o que ela
  vale hoje: vendido − unidades canceladas). O gatilho do pagamento acerta.
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

---

### 9.6 Financeiro
- **Não existe caixa de abrir e fechar.** Foi removido em 2026-09-18: quase
  nada é recebido em dinheiro vivo (a rede opera em Pix e cartão), e a
  conferência que o fechamento existia para fazer — contar a gaveta e comparar
  com o esperado — não tinha gaveta para contar. A auditoria do dia é a própria
  tela do financeiro: período, unidade e forma de pagamento.
  A tabela `cash_registers` e a coluna `financial_transactions.cash_register_id`
  continuam no banco com o histórico do que já passou por lá; nada novo é
  escrito nelas. Registro financeiro não se apaga.
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
- Formas de pagamento: `CASH`, `PIX`, `DEBIT_CARD`, `CREDIT_CARD`, `INTERNAL_CREDIT`
- **Desconto de fidelidade** fica em `loyalty_discount`, FORA de `amount`: o
  lançamento registra o dinheiro que entrou (§9.2.2). Pago todo com pontos, o
  lançamento é de R$ 0 e sem forma de pagamento.
- **Desconto em todas as vendas** (decisão do Heitor, 2026-09-30): pacote,
  checkout do plano e o recebimento do avulso na recepção, em R$ ou %, SEM
  TETO, e fica registrado quem deu. A conta é uma só (`lib/vendas/desconto.ts`,
  em centavos; a tela usa `CampoDoDesconto`): o servidor a refaz a partir do
  pedido, e a função do banco confere.
  - **Pacote**: `client_packages.price` é o VENDIDO (`preco_tabela` −
    `desconto`, quem deu é `sold_by`); pagamento e sessões fecham com ele.
  - **Plano**: o desconto é RATEADO nos procedimentos do plano
    (`plano_aplicar_desconto`, maior resto — nenhum passa do preço de antes):
    `price` vira o vendido e o de antes fica em `preco_tabela`
    (`treatment_plans.desconto`/`desconto_por`). Contrato, sessões, comissão e
    fidelidade leem o preço vendido e não precisam saber de desconto. Parte
    sempre do preço de antes: repetir é seguro, e desconto 0 desfaz.
  - **Avulso**: `financial_transactions.sale_discount`, fora de `amount` (o
    bruto é `amount + loyalty_discount + sale_discount`). A ordem é voucher →
    desconto comercial → pontos (o teto dos pontos vale sobre o que sobra).
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
- Estorno (`estornar_transacao`, uma transação): contra-transação + a original
  marcada `notes='Estornada'` (nunca deletar). Recusa lançamento **não pago**
  e o **próprio estorno**. A contra-transação não leva `appointment_id` (há
  UNIQUE nele — levar fazia todo estorno de atendimento falhar).

---

## O que nunca fazer aqui

```
❌ Criar FinancialTransaction fora de um Appointment concluído sem justificativa
❌ Criar pacote de cliente fora de pacote_vender (sessões, retrato do preço e dinheiro vão juntos)
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
```
