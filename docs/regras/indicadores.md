# Indicadores — fonte única

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

## 13.1 Indicadores — fonte única

> **OBRIGATÓRIO:** todo número exibido (KPI, gráfico, ranking, taxa, média) vem
> de `apps/web/lib/metrics/`. Nenhuma tela soma, conta ou divide por conta própria.

- **Agregação no Postgres**, nunca em JavaScript. As funções `metrics_*`
  (migrations `20260909000001..2`) fazem a conta no banco. Somar em JS o
  resultado de um `select` significa somar no máximo 1000 linhas — o teto do
  PostgREST — e subcontar em silêncio quando a base cresce.
- **Fuso**: janelas de período por `apps/web/lib/datetime.ts`
  (`startOfDayTZ`, `startOfMonthTZ`, `dayKeyTZ`…), nunca `new Date(y, m, d)`
  nem `startOfMonth()` do date-fns. O container roda com `TZ=America/Sao_Paulo`,
  mas os helpers não dependem do fuso do processo.
- **Período** por `resolvePeriod()`: o período anterior tem a mesma duração
  decorrida do atual. Comparar mês parcial com mês anterior inteiro faz todo
  delta nascer negativo.
- **Sem base de comparação, sem delta.** `delta()` retorna `null`; a UI mostra
  "sem dados anteriores". Nunca "▲ 100%" a partir do zero.
- **Nenhuma tela soma dinheiro.** Receita, despesa, ticket e as séries dos
  gráficos vêm de `getCore` / `getSeries` (`lib/metrics/`). Repetir a
  definição num `filter().reduce()` cria uma segunda cópia da regra, e duas
  cópias divergem — é questão de quando. Foi assim que a tela de relatórios
  mostrou **R$ 5.200 no cartão e R$ 5.450 na legenda do gráfico logo abaixo**:
  o KPI excluía o estorno e o gráfico, não.
  - O eixo do caixa é `paid_at`, nunca `created_at`. Filtrar a lista por
    `created_at` e somar dali põe a parcela criada em agosto e paga em
    setembro no mês errado — e o checkout de plano cria exatamente isso.
  - **O rótulo acompanha a conta.** "Ticket médio" é o pago pelas clientes ÷
    as clientes que pagaram, em toda tela; se a conta for outra, o nome tem de
    ser outro. `e2e/relatorios-coerencia.spec.ts` compara tela, gráfico e
    banco para que a divergência não volte em silêncio.
- **Definições canônicas** (uma só por indicador):
  - `revenueCash` — recebido (INCOME pago, eixo em `paid_at`)
  - `revenuePending` — a receber, pelo VENCIMENTO (`data_de_referencia`;
    sem vencimento, a criação). Era pela criação: o parcelado inteiro caía no
    mês da venda. O de cada unidade (`metrics_by_branch`) ainda contava pela
    criação até 2026-10-27 (A34): agora também pelo vencimento.
  - `serviceRevenue` — preço dos atendimentos concluídos, no eixo
    `appointments.aconteceu_em`
  - **O atendimento conta quando ACONTECEU** (D13, decisão do Heitor,
    2026-10-22): `aconteceu_em` (coluna gerada) é a hora marcada, ou a da
    conclusão quando ela veio ANTES. Todo indicador de atendimento usa esse
    eixo — `metrics_core`, `by_branch`, `relatorio`, `retention`, os rankings,
    a receita por categoria, `metrics_vendas` e os clientes a reativar
    (migration `20261022000001`). Era `scheduled_at`, e como o período em
    andamento fecha em "agora", o concluído antes da hora (chegou cedo, o
    encaixe adiantou) ficava fora do dashboard até a hora marcada passar. O
    concluído DEPOIS da hora (finalizado no dia seguinte) segue no dia
    marcado: contar pela conclusão pura mudaria o atendimento de dia e de mês.
    Indicador novo de atendimento filtra por `aconteceu_em`, nunca por
    `scheduled_at`. Prova: `e2e/indicadores-concluido-antes-da-hora.spec.ts`.
  - **`ticketMedio` = a média de quanto cada CLIENTE gasta na clínica**
    (decisão do Heitor, 2026-10-29; muda a regra de 2026-10-27): o que as
    clientes pagaram no período ÷ as clientes que pagaram — quem não pagou não
    entra. Pelo eixo da receita paga (`metrics_receitas_pagas`), entra tudo
    que tem cliente: atendimento, pacote, plano (entrada e parcelas),
    pré-pago e, quando existir, produto. A conta é UMA: `metrics_ticket_medio`
    (o pago e as clientes, por unidade e no total — a cliente que pagou em
    duas unidades conta uma vez no total; migration `20261029001102`),
    `getTicketMedio` e a divisão `ticketMedio()` em `lib/metrics/resultado.ts`;
    sem cliente que pagou, nulo e a tela mostra "—". É UM indicador só com o
    antigo "Gasto médio" de Relatórios → Clientes (o mesmo número), que passou
    a se chamar "Ticket médio": dashboards (o cartão e a coluna por filial),
    financeiro da unidade, Relatórios (Visão geral, Clientes, Procedimentos) e
    Copilot. Com o financeiro "só os meus", é o DELA (o dinheiro dos
    atendimentos dela). O subtítulo diz a conta ("pago pelas clientes ÷ 2
    clientes que pagaram"). Era `serviceRevenue ÷ atendimentos COBRADOS`
    (2026-10-27: a avaliação de R$ 0 puxava a média para R$ 90). Prova:
    `e2e/indicadores-ticket-medio.spec.ts`, `e2e/indicadores-uma-conta-so.spec.ts`.
    Divisão parecida sobre OUTRO conjunto tem outro nome: "Média por atend."
    (no ranking do dashboard, o pago da cliente ÷ os concluídos; na FICHA da
    cliente, a receita de serviço dela ÷ os concluídos cobrados —
    `mediaPorAtendimentoCobrado`, a conta antiga do ticket: numa cliente só, o
    ticket novo seria o próprio LTV) e "Média por execução" (por
    procedimento, nos Relatórios). Até 2026-10-28 o dashboard dizia "receita ÷ atendimentos" e a
    aba Procedimentos dividia pelos concluídos — R$ 90 ao lado dos R$ 180 da
    Visão geral (D11). Essas duas médias, e o "% do Total" da tabela por
    procedimento, também moram em `lib/metrics/resultado.ts`
    (`mediaPorAtendimento`, `mediaPorExecucao`, `participacaoPct`): a tela
    dividia por conta própria até a frente F (`tests/metrics-medias-das-tabelas`
    trava).
  - **Lucro e margem também moram em lib/metrics** (`resultadoDoPeriodo`,
    `variacaoDaMargemPp` em `lib/metrics/resultado.ts`): lucro = receita paga
    − despesa paga; margem = lucro ÷ receita, nula sem receita; a variação da
    margem em p.p. Relatórios (visão geral e financeiro), o financeiro da
    unidade e o da rede usavam cada um a sua subtração (2026-10-27).
  - **O gasto de cada cliente é UMA conta** (`metrics_gasto_por_cliente`: o
    pago pela regra de receita, a receita de serviço, os concluídos e os
    cobrados). A ficha a chama com a cliente e a janela inteira (`getDoCliente`:
    LTV e a média por atendimento); Relatórios → Clientes, com o período (o
    top clientes; o "Gasto médio" de lá virou o ticket médio, de
    `metrics_ticket_medio` — o mesmo número). A ficha da Mariana dizia
    "ticket R$ 0,00" ao lado de "LTV R$ 600" e os relatórios "Gasto médio
    R$ 390", cada um de uma conta (A26). `metrics_do_cliente` virou um
    invólucro dela (o app não a chama mais).
  - `occupancy` = minutos agendados (sem cancelados e faltas; os concluídos
    contam) ÷ a capacidade do HORÁRIO de funcionamento — por profissional e
    por dia, unidade ∩ profissional (`occupancyPct()` → `ocupacaoEmPct`,
    `lib/agenda/horario.ts`; 2026-10-21). Percentual inteiro. A agenda e o
    dashboard da unidade usam a MESMA função: eram 12 h na agenda (sem os
    concluídos) e 8 h no dashboard, e as duas davam números diferentes.
    A ocupação da unidade conta só a agenda DA unidade: o profissional entra
    na capacidade com o horário dele MENOS o que tem agendado em outra
    unidade (`ocupadoFora`; o da rede atende em todas — decisão do Heitor,
    2026-10-28). Sem isso ele aparecia livre em duas unidades ao mesmo tempo.
    A **"Minha agenda"** (agenda "só os meus") usa a MESMA conta para a
    "Ocupação hoje": `ocupacaoDoDia` (`lib/metrics/ocupacao.ts`, puro, roda no
    navegador) — os minutos dela no dia de Brasília ÷ o horário unidade ∩
    dela, menos o que ela tem em outra unidade; sem expediente, "—". Era um
    dia fixo de 8 h, dividido na tela: a Camila (18:00–23:30) via 32% em vez
    de 47% (D11 da simulação de 2026-10-29). Prova:
    `e2e/agenda-minha-ocupacao.spec.ts`, `tests/metrics-ocupacao.test.ts`.
  - **composição do financeiro** (receita por forma de pagamento, receita e
    despesa por categoria) = `metrics_financeiro_composicao`
    (`getComposicaoFinanceira`, 2026-10-21), com a regra de `metrics_core`.
    A tela da unidade somava a lista e contava a contra-transação do estorno
    como despesa. O gráfico do mesmo hub vem de `metrics_series` (que
    aceita `'week'`; `lib/financeiro/barras.ts` só posiciona) e o "A
    pagar", de `metrics_a_pagar` (2026-10-21) — o hub não soma mais nada. Prova:
    `e2e/financeiro-composicao.spec.ts`.
  - `margem por procedimento` = (preço − custo) ÷ preço, com o custo = insumos
    ao custo da unidade de CONSUMO (o preço da embalagem ÷ o que ela rende) +
    mão de obra + outros custos (`metrics_margem_procedimentos`,
    `getMargemPorProcedimento`; 2026-10-21). É o custo ATUAL do catálogo — o
    giro de estoque é que usa o custo do movimento. Até então a página fazia a
    conta com o preço da embalagem inteira (a Toxina saía com −3858%). Prova:
    `e2e/indicadores-margem.spec.ts`.
    **O custo do procedimento é UMA conta** (`metrics_custo_dos_procedimentos`,
    2026-10-27): a margem do dashboard e a margem por faixa etária dos
    relatórios (`metrics_relatorio`, aba Procedimentos — só procedimentos com
    insumo) saem dela. A dos relatórios ainda usava o preço da embalagem e a
    Limpeza de pele saía com −150% (D3 da simulação).
  - **valor em estoque** = saldo em CONSUMO × custo de consumo
    (`valor_do_saldo`: `metrics_valor_em_estoque`, a aba Estoque dos
    relatórios e a coluna "Valor" da tela de estoque, que vem de
    `metrics_valor_em_estoque_por_produto` — `getValorEmEstoquePorProduto`).
    Contava embalagens inteiras: 495 ml de um frasco de 100 ml a R$ 90 valiam
    R$ 450, e não R$ 445,50 (A39, 2026-10-27).
    O gráfico "Valor em estoque por categoria" (aba Estoque) tem uma fatia
    **"Sem categoria"** para o produto sem categoria ou com ela em branco, e
    as fatias somam o valor em estoque da aba. Até 2026-10-28 esse produto
    sumia, e a tela dizia "Sem dados no período" com R$ 5.562 em estoque (D17,
    migration `20261028000502`). Prova: `e2e/indicadores-uma-conta-so.spec.ts`.
  - **A conversão é da OPORTUNIDADE** (decisão do Heitor, 2026-10-29: "o
    objeto é a oportunidade"): as oportunidades na etapa de GANHO (desfecho
    `WON`) ÷ as oportunidades do funil, sem importar se a pessoa já é cliente.
    UMA conta, `conversaoDasOportunidades` (`lib/metrics/resultado.ts`), que
    `resumoDoFunil` usa no dashboard, no funil dos Relatórios e no quadro de
    Oportunidades ("33,3% de conversão (1 de 3 ganhas)"). O quadro a chama no
    recorte que mostra (`getFunilDoQuadro`): o funil de AGORA, sem período, e
    com o CRM "só os meus" os leads da pessoa e os sem dono; o dashboard, os
    criados no período. **Funil sem etapa de ganho não tem conversão: "—"**
    (num pós-venda ela nasceria 0% ou 100% sem dizer nada).
    - **Onde a tela junta funis, junta as oportunidades deles**: o painel de
      Relatórios → Comercial (`metrics_comercial`: `ganhos` de qualquer funil
      ÷ as oportunidades do período; `tem_ganho` = a rede tem alguma etapa de
      ganho) e a coluna "Conv." do ranking por vendedor (a mesma conta sobre
      as dele, em `getPainelComercial` — a tela não divide). Migration
      `20261029001101`.
    - "Já é cliente" (`converted`, `leads.client_id`) não é conversão: é só o
      filtro do quadro ("Já é cliente / Ainda não é cliente") e um dado
      informativo para o Copilot. De 2026-10-28 a 10-29 a conversão foi
      "viraram cliente ÷ leads" (D10), e o Heitor a devolveu à oportunidade.
    Prova: `e2e/indicadores-uma-conta-so.spec.ts`, `tests/metrics-resultado.test.ts`.
  - `retenção` = clientes atendidos no período que **já tinham sido atendidos
    antes dele** ÷ atendidos no período (`getRetention`). Não confundir com
    recorrência dentro da janela, que em períodos curtos dá zero por construção.
- **Zero é um dado, não ausência de dado.** Em métricas de anúncio, `0 ||
  undefined` transformava "zero clique no link" em "Indisponível" e escondia
  justamente a campanha problemática. Só use `undefined` quando a origem
  realmente não devolveu o campo.
- **Médias de referência são ponderadas** pela grandeza que as sustenta (ROI e
  CPA por investimento, CTR por impressões). Média simples por campanha deixa
  uma campanha de R$ 5 ditar a régua de todas as outras.
- **Estorno** sai dos dois lados: a transação marcada `notes='Estornada'` e a
  contra-transação `category='Estorno'`. Contar só uma faz o estorno bater duas
  vezes no resultado.
- **Receita e despesa simétricas**: se a receita exige `is_paid`, a despesa
  também. Senão o "lucro" mistura caixa de um lado com competência do outro.
- **Percentual de percentual não existe**: variação de margem é em **p.p.**
- **Janela DECORRIDA é do delta; LISTA usa o fim do período.**
  `resolvePeriod` devolve `to` (o quanto do período já passou, para
  comparar com o anterior de mesmo tamanho) e `fullTo` (o fim do período).
  Fechar uma lista em `to` é corrida de relógio: o `created_at` vem
  do Postgres, que está **à frente** do relógio do app — medi 0,2s contra o
  Supabase —, então o lançamento feito neste segundo nasce no futuro e some da
  tela que acabou de criá-lo. Preso em
  `e2e/financeiro-lancamento-aparece.spec.ts`.
  - Com fim escolhido (personalizado, mês passado), `fullTo` é o fim
    ESCOLHIDO; só o período aberto até agora (7 dias, todo o período) vai até
    o fim de hoje. Até 2026-10-14 o personalizado já encerrado caía no fim de
    hoje, e a lista de março trazia tudo até agora
    (`tests/metrics-period.test.ts`).
- **Erro de query nunca é descartado — e isso vale no sistema inteiro, não só
  aqui.** `lib/db.ts` dá os três jeitos de terminar uma consulta, e nenhum é o
  silêncio: `gravar` (escreve, ou para o fluxo), `ler` (lê, ou para o fluxo) e
  `tentar` (registra e segue — só para o que é acessório, com o motivo escrito
  ao lado). `await admin.from(x).update(…)` solto não entra mais: ali o erro
  não chega nem a existir para o código.
  - Quem chama uma action que grava **tem de olhar o `{ error }`**. Fazer a
    gravação falhar alto e a tela engolir o resultado troca um silêncio por
    outro, mais caro de achar.
  - Sem checar `error`, drift de schema vira "R$ 0,00" silencioso em vez de
    falha visível. Foi assim que a lista de clientes do `/admin` passou meses
    com "última visita" em branco: `appointments` não tem `tenant_id`, o
    Postgres respondia 42703 e ninguém via.

**Todo indicador tem valor esperado escrito à mão** em
`e2e/indicadores-cenario.spec.ts` (unidade `[e2e]` + janela em 2021, antes de
qualquer dado real). `relatorios-coerencia` prova que tela e RPC concordam;
aquele prova que estão CERTOS. Mexeu numa `metrics_*`, o cenário tem de continuar
batendo — ou mudar junto, com o porquê. `new_clients` respeita a unidade como a
série (a unidade escolhida mais os clientes sem unidade).

**Uma regra de receita, e toda soma de dinheiro parte dela.**
`metrics_receitas_pagas` (migration `20260927000011`) é o conjunto canônico —
INCOME pago, sem estorno dos dois lados, eixo em `paid_at` — e é o mesmo
predicado de `metrics_core.revenue_cash`. Receita por unidade, por forma de
pagamento, por categoria, gasto por cliente e LTV saem DELE. Até 2026-09-27 os
relatórios somavam esses gráficos por `created_at` e com estorno, ao lado de um
KPI que não fazia nenhum dos dois.
- **LTV é o que o cliente PAGOU**, desde sempre (`metrics_do_cliente`,
  `metrics_top_clients`). Não é "preço dos atendimentos": atendimento concluído
  e não pago não é dinheiro que entrou.
- **Relatórios**: `metrics_relatorio(…, aba)` devolve os agregados só da aba
  aberta; a tela ordena, rotula e desenha. Contagens que o núcleo já tem
  (atendimentos, novos clientes, agenda, comissões, ticket) vêm de `getCore`, não
  de uma segunda conta. Listas curtas e com limite (lotes vencendo, parcelas)
  continuam listas.
- **Consumo de insumo é uma conta só** (`metrics_giro_estoque`, por
  `custo_do_movimento`): custo do MOVIMENTO, que é o da unidade de CONSUMO
  (§9.5); o de consumo do cadastro só como reserva. Dashboard, estoque e
  relatórios. **É informativo: não entra no resultado** — o resultado é
  receita paga − despesa paga, e movimentação de estoque NUNCA gera despesa
  (D13 revisto, 2026-10-28; a compra paga, se a clínica quiser no caixa, é um
  lançamento manual). O gráfico "Evolução do Período" dos relatórios
  somava o consumo à despesa e dizia CUSTO R$ 5.350 ao lado do cartão de
  R$ 4.900 (D2, 2026-10-27): o ponto agora vem pronto de
  `pontosDaEvolucao` (`lib/metrics/evolucao.ts`), com custo = a despesa paga.
  O DRE não tem mais a linha "− Custo de Insumos" (era fixa em R$ 0,00); o
  KPI de consumo diz que é informativo.
- **`lib/metrics` para a tela quando o RPC falha** (`logRpcError` lança). Ele
  registrava e devolvia zero — "R$ 0,00" com cara de dado.
- ⚠️ **Migration que cria função termina com `notify pgrst, 'reload schema'`.**
  Sem isso, parte das réplicas do PostgREST não conhece a função nova por um
  tempo e a chamada falha às vezes (visto em 2026-09-27: 1 em 3 rodadas).

**Relatório de vendas** (aba Vendas, 2026-10-14): cada venda do período, uma
linha — `metrics_vendas` (migration `20261014000001`), paginada por
`metrics_vendas_pagina` e totalizada por `metrics_vendas_resumo` (por tipo e
geral; a tela não soma). Venda é o fato COMERCIAL, não o dinheiro:
- **Procedimento** avulso: atendimento concluído, com preço, que não consumiu
  nada já vendido. A sessão de pacote, a unidade pré-paga e a sessão de plano
  não são venda de novo. Data `scheduled_at` (o eixo de `serviceRevenue`);
  vale o preço menos o desconto comercial da recepção (`sale_discount`; ponto
  é forma de pagamento, não desconto).
- **Pacote** (`purchased_at`, o vendido, quem vendeu) e **pré-pago**
  (`sold_at`, o vendido, quem vendeu). O parcelado é UMA venda.
- **Plano**: `treatment_plans.aceito_em` (gatilho `trg_plano_aceito_em` na
  passagem para ACCEPTED; os antigos herdaram o evento `plano.aceito`, o
  primeiro lançamento ou o `updated_at`), e vale a soma dos procedimentos dele
  (já com o desconto rateado). Cancelado depois de aceito sai.
- A lista e o total fecham no `fullTo`. A exportação (`/api/relatorios/vendas`,
  CSV) leva o mesmo recorte sem página e se defende sozinha: sessão, a aba no
  cargo, a unidade ao alcance; a rede inteira só para quem vê o consolidado.
- Quem já via a aba Financeiro ganhou a Vendas na migration; daí em diante ela
  se marca em Cargos. Prova: `e2e/relatorio-vendas.spec.ts`.

**Variação contra o período anterior e a aba Agenda (2026-10-27)**
- Sem período anterior (anterior = 0) não existe variação:
  `variacaoPercentual` (`lib/metrics/resultado.ts`) devolve nulo e a tela diz
  "sem dados anteriores" — dashboard e Relatórios, a mesma regra. Nunca "100%"
  inventado a partir do zero.
- A aba **Agenda** dos Relatórios é uma LISTA do período: o núcleo e
  `metrics_relatorio` dela fecham no `fullTo`, com os agendamentos futuros e
  os cancelados do período, e a tela avisa. As demais abas seguem o dinheiro
  (até agora). Prova: `e2e/indicadores-dashboard-e-agenda.spec.ts`.
- O card **"Clientes no mês"** do dashboard da unidade também é contagem de
  agendamentos do mês: um núcleo próprio até o `fullTo` (D12, 2026-10-28 —
  dizia 0 agendamentos com 3 marcados para hoje). Os cartões de dinheiro
  seguem até agora. A "Taxa de aproveitamento" da rede fica até agora de
  propósito: é "horários PASSADOS concluídos ÷ total marcado".
  Prova: `e2e/indicadores-uma-conta-so.spec.ts`.
- O gráfico de evolução do dashboard da rede sai de `pontosDaEvolucao`, como o
  dos Relatórios.

**Dashboard com "só os meus" (D7 da simulação de 2026-10-28; "quem tem 'só os
meus' vê 'só os meus', em qualquer lugar", decisão do Heitor no mesmo dia)**:
com a agenda OU o financeiro em OWN — e o módulo ABERTO no cargo: o OWN de um
módulo NONE não vale (D6 de 2026-10-29, CLAUDE.md §11; a contadora sem agenda
via "Meu faturamento R$ 0") —, TODO número dos dois dashboards (rede e
unidade) é o DELA — o `professionalId` vai a cada função de `lib/metrics`
(`metrics_core`, `_series`, `_top_procedures`, `_top_professionals`,
`_top_clients`, `_demografia`, `_giro_estoque`, `_clientes_para_reativar`, com
`p_professional_id default null`; migration `20261028000601`). O recorte é
UM, o de `metrics_core`:
- **atendimento dela**: `appointments.professional_id = ela`;
- **dinheiro dela**: a transação ligada a um atendimento dela
  (`appointment_id`) — a evolução e o gráfico dos 6 meses batem com o cartão;
- **cliente dela**: quem tem agendamento NÃO CANCELADO com ela numa unidade
  do recorte (o total, os novos clientes, a demografia, a recorrência e o
  gasto). Até 2026-10-28 os novos clientes com profissional eram 0 por
  construção.

Mostram o dela: receita, atendimentos, ticket, a evolução SÓ DA RECEITA (sem
custo nem lucro — `EvolutionChart soReceita`), os rankings de procedimentos
(feitos, recorrência, receita bruta), de profissionais (só a linha dela) e de
clientes (gasto, recorrência), faixa etária, cidades e mapa, o total e os
novos clientes, o giro (o insumo dos atendimentos dela), os planos aguardando
checkout (`treatment_plans.professional_id`), as clientes a reativar (as dela
que sumiram da UNIDADE — sem visita nela com qualquer profissional) e, no da
unidade, o "Meu faturamento" dos 6 meses. Fica escondido o que não se atribui
a ela: o custo e o lucro, a margem por procedimento (custo do catálogo), o
ranking e a ocupação por filial, e o ranking de comissão (de todas). Com o
**CRM** "só os meus", o funil do dashboard conta os leads dela e os sem dono
(`p_owner`, o recorte do quadro). Prova:
`e2e/indicadores-dashboard-da-rede-so-os-meus.spec.ts`.

O mesmo recorte vale no **Copilot** (`copilot.md`) e nas funções dos
Relatórios, que ganharam `p_professional_id default null` com os MESMOS
predicados (migration `20261028000803`): `metrics_receitas_pagas` (o dinheiro
dela), `metrics_gasto_por_cliente`, `metrics_receita_por_categoria_de_procedimento`,
`metrics_relatorio` (cada aba: o dinheiro, os atendimentos, as clientes e o
consumo dela; a comissão dela; o saldo do estoque segue o da unidade — quem
mostra o esconde) e `metrics_vendas` (+ `_pagina`, `_resumo`). **Venda dela**
é a pessoa da coluna "Profissional" da venda: quem atendeu o avulso, quem
vendeu o pacote e o pré-pago, a dona do plano.

**Os Relatórios com "só os meus"** (`reports-bi-section`, os dois portais):
com a agenda OU o financeiro em OWN, cada aba é a DELA — o `professionalId`
vai a `getCore`, `getSeries`, `getRelatorio`, às vendas (e ao CSV de
`/api/relatorios/vendas`), a `getRetention` e a `getNewClientsSeries`
(`metrics_retention`/`metrics_new_clients_series`, migration
`20261028000804`: as clientes que ELA atendeu; "voltou" = já tinha vindo a
ELA antes — decisão nova). Com o CRM em OWN, a aba Comercial é a dos leads
dela e dos sem dono: o funil (`ownerId`), o painel (`metrics_comercial`:
também os agendamentos que ela marcou) e os motivos de perda
(`metrics_motivos_de_perda`), todos com `p_owner`. Some da tela (`soOsMeus`)
o que não se atribui a ela: despesa, lucro, margem e DRE (visão geral e
financeiro; a evolução só com a receita), as parcelas a receber, a margem por
faixa etária (custo do catálogo) e o saldo do estoque (valor, giro, críticos,
zerados, por categoria, por unidade, validades) — fica o consumo dos
atendimentos dela. A comissão que chega já é a dela e aparece. Prova:
`e2e/relatorios-so-os-meus.spec.ts`.

Dados de demonstração para conferir os números na mão: `supabase/seed_demo.sql`
(idempotente; os valores esperados estão no cabeçalho do arquivo).
