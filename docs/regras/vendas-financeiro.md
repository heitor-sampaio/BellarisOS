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
  ela liberou) e nasce a linha PACOTE (base = a parte da sessão; no modo
  "quando paga", na proporção do que a venda recebeu). O estoque já baixou na
  conclusão. Sem cobrança nova; o atendimento sai de "a receber" e vira
  "Sessão de pacote". Prova: `e2e/pacote-abater-avulso.spec.ts`.
- A sessão só LÊ pacote: as políticas de INSERT/UPDATE de `client_packages` e
  `service_packages` saíram (dava para dar sessão de graça pela chave pública).
- Comissão: a de VENDA e a de EXECUÇÃO são do cadastro de cada pacote
  (2026-10-30, §9.7 "A comissão do PACOTE"); a do "Abater do pacote" segue a
  de execução dele.
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
- O dinheiro segue a regra única de receita (`metrics_receitas_pagas`): caixa,
  faturamento e ticket médio. O relatório de vendas ganha o tipo **Produto**
  (`metrics_vendas`: na data da venda, pelo vendido, "quem vendeu" na coluna
  Profissional).
- Pontos: só se a clínica ligar (Configurações → Fidelidade → "Venda de
  produto", `fidelidade.md`).
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
    migration `20261029001504`). Prova: `e2e/fechamento-do-dia-avisos.spec.ts`.
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
  `clients!financial_transactions_client_id_fkey`); sem ele, "—". Prova:
  `e2e/financeiro-rede-a-receber.spec.ts`.
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
- **O total da LISTA do financeiro tem sinal** (J-48, 2026-10-30): "2
  lançamentos · resultado −R$ 2.400,00" — o pago que entrou menos o pago que
  saiu do que está filtrado na tela, sem os dois lados do estorno. A conta é
  `resultadoDaLista` (`lib/metrics/resultado.ts`, em centavos), sobre a lista
  lida inteira (`lerTodas`); a tela fazia o reduce e tirava o sinal com
  `Math.abs` (só a cor dizia que era negativo). Prova:
  `e2e/financeiro-lista-total-com-sinal.spec.ts`, `tests/metrics-resultado-da-lista.test.ts`.
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
- Formas de pagamento: `CASH`, `PIX`, `DEBIT_CARD`, `CREDIT_CARD`, `INTERNAL_CREDIT`
- **Cartão de crédito em N vezes é PAGO na hora** (decisão do Heitor,
  2026-10-20): quem paga a clínica é a maquininha, então para o cliente está
  quitado. É o "À vista" com o meio Cartão de crédito e "Vezes no cartão"
  (1–12): UM lançamento pago, com `financial_transactions.cartao_vezes`
  (2–12, só no crédito — a restrição do banco confere) — só para a taxa da
  comissão (§9.7). "Entrada + parcelas" é o CREDIÁRIO da própria clínica: cada
  parcela a receber. Vale nas cinco portas: pacote e pré-pago
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
    `venderProcedimento`, `venderProduto`, `definirPagamentoDoContrato` e
    `prepararDocumentosDoCheckout`. Vale só para o cartão em N vezes; as
    parcelas do crediário ("entrada + parcelas") não mudaram. Prova:
    `e2e/financeiro-parcelas-no-credito.spec.ts`, `tests/financeiro-vezes-do-cartao.test.ts`.
  - **O "3x" aparece** (A33, 2026-10-27): o nome da forma é UM
    (`rotuloDaForma`, `lib/financeiro/formas.ts` — "Crédito 3x" nas listas do
    financeiro, na ficha, no "Pagamento confirmado" do atendimento e no
    portal da cliente); o Fechamento do dia separa o crédito por vezes
    (`CREDIT_CARD:3`, "Cartão de crédito 3x"). Escolher N vezes sem a taxa
    da maquininha de N vezes cadastrada AVISA quem recebe (`AvisoDaTaxa`):
    a comissão usa a da maior parcela cadastrada abaixo (`taxaQueVale`, o
    espelho de `private.comissao_taxa_pct`) ou nenhuma. As taxas vão de
    à vista a 12x em Configurações → Comissões.
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
    O desconto tem um **motivo OPCIONAL** (J-47, 2026-10-30): o campo
    "Motivo do desconto (opcional)" aparece na janela do pagamento quando há
    desconto, e `confirmar_pagamento_do_atendimento` o grava em
    `financial_transactions.desconto_motivo` (até 300 caracteres; sem
    desconto, nulo) e na linha do tempo ("com desconto de R$ 50,00 (Cliente
    fiel)"). Migration `20261029001503`. Prova: `e2e/vendas-desconto.spec.ts`.
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
- **A cliente vê o saldo do crédito no app** (D-17, decisão do Heitor,
  2026-10-30): o Financeiro do portal mostra "Crédito na clínica" com o saldo
  da ficha da clínica do ENDEREÇO (`ctx.clientId`), só quando é maior que
  zero — `getCreditoInternoDoCliente` (`lib/metrics/unidade.ts`, a conta de
  `metrics_financeiro_do_cliente`, a mesma da ficha). Só o saldo: os
  lançamentos do crédito (com a descrição interna) ficam com a equipe.
  Prova: `e2e/portal-cliente-credito-interno.spec.ts`.
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
❌ Gravar "cartão de crédito em N vezes" como parcelas a receber (é pago na hora, com cartao_vezes) — entrada + parcelas é o crediário da clínica
❌ Cobrar no check-in parcela que ainda não venceu (já está combinada; é emAbertoDoPlano quem separa)
❌ Fechar o checkout de um plano deixando de fora o atendimento de origem com preço e sem pagamento (atendimentoDeHojeDoPlano)
❌ Decidir na tela se um atendimento concluído está "a receber" (é atendimentos_a_receber), ou pedir pagamento de atendimento de R$ 0
❌ Gravar texto para pessoas (histórico, descrição) com o código da forma (CASH, CREDIT_CARD) — é rotuloDaForma no app e private.rotulo_da_forma no banco
❌ Ler dinheiro digitado com uma regra própria (Number(s.replace…), parseFloat em campo de texto) — é parseDinheiro, e o NaN dele é recusa, não zero
❌ Ler "o lançamento do atendimento" (appointment_id) sem tirar o estornado — o atendimento pode ter o estornado e o recebimento novo (maybeSingle quebra; o "pago" mente)
```
