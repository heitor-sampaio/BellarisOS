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
- **O fuso é o da UNIDADE** (F62, o Heitor, 2026-11-11: "Não, deixa a clinica
  configurar o seu fuso"). `branches.fuso` (Configurações → Unidade, o "Nova
  unidade" e o setup; o CEP sugere pelo estado), com o horário de Brasília de
  padrão — quem não mexe não vê nada mudar. Todo dia e toda hora da unidade
  saem nele: a agenda e o agendar (inclusive o app), o "hoje", o horário de
  funcionamento, o Fechamento do dia, os indicadores, o cron (as campanhas
  das 09:00, o aniversário, os retornos do CRM, o texto do lembrete) e as
  datas dos documentos.
  - **O fuso do recorte**: a unidade, o dela (`fusoDaUnidade`); a rede, o
    comum das unidades (`fusoDoRecorte` / `fusoDaRede`; no banco,
    `fuso_do_recorte(p_tenant, p_branch_ids)`) — com fusos diferentes, o de
    Brasília. É nele que `resolvePeriod(…, fuso)` monta a janela e as funções
    `metrics_*` montam dia, mês e hora (migration `20261111006202`, como
    subconsulta: uma vez por chamada).
  - **"O dia é o da unidade"** no consolidado: cada lançamento cai no dia do
    relógio da unidade dele (a barra de `metrics_series`; o Fechamento da rede
    com a janela do dia de cada unidade).
    - **Os agendamentos também** (D5 da 26ª, decisão do Claude para cumprir
      esta regra): na rede com fusos diferentes a janela é a de Brasília, mas o
      agendamento conta no dia da unidade DELE — o núcleo (`metrics_core`), a
      aba Agenda e a Visão geral de `metrics_relatorio` (o status, o dia da
      semana no relógio da unidade, a origem, por unidade) e `metrics_by_branch`,
      por `metrics_no_dia_da_unidade` (migration `20261130100001`); o "Hoje"
      do dashboard da rede, uma janela por fuso (`janelasDoDiaNasUnidades`,
      `agendamentosDeHojeNasUnidades`). O limite que é a virada do dia (00:00,
      23:59:59 no relógio do recorte) vale na mesma hora da parede no relógio
      da unidade; o "até agora" fica como está (é o mesmo instante em todo
      relógio). Ficam com a janela única, por ora: o dinheiro
      (`metrics_receitas_pagas` e o que parte dele) e as execuções ligadas à
      receita (Procedimentos, Profissionais).
    - **A hora de outra unidade** (D3 da 26ª, decisão do Claude, princípio 3):
      o agendamento de outra unidade (a Minha agenda, "Seus atendimentos em
      outras unidades", a "Agenda de hoje" do dashboard da unidade) diz a hora
      no relógio da unidade DELE e, quando ele não é o da tela, o nome
      ("18:55 (horário de Cuiabá)" — `horaNaUnidadeDele`,
      `lib/unidades/hora-da-unidade.ts`). A grade segue no relógio do portal.
    - **A grade da agenda da REDE diz o relógio** (D4 da 33ª, FU-04; R16, o
      Heitor, 26/11: "Cada coluna no relógio da sua unidade, dizendo qual é" e
      "não precisa da explicação"): ela desenha cada coluna no relógio da
      unidade dela (F62). Com unidades em fusos diferentes, o cabeçalho de cada
      coluna do dia diz o relógio dela (também o de Brasília), sem nota acima
      da grade; com um fuso só fora de Brasília, a nota de sempre ("Horário de
      Manaus"); em Brasília, nada (`relogioDaGradeDaRede`,
      `lib/agenda/relogio-da-grade.ts`).
      Prova: `tests/agenda-da-rede-diz-o-relogio.test.ts`.
  - **No navegador**, o fuso vem do `FusoProvider` dos layouts (`useFuso`); a
    grade da agenda trabalha "na parede" (`naParede`/`daParede`), e a hora
    escolhida vira o instante por `instanteNoFuso`. A tela diz o relógio
    quando não é o de Brasília (`NotaDoFuso`, princípio 3). Decisões do
    Claude, 26ª: o app da cliente diz o relógio no agendar, no remarcar, na
    Agenda e no Início (A9), cada agendamento no fuso da unidade dele (D4); o
    prazo do remarcar conta no fuso do agendamento original e diz o relógio
    (A10); a edição do membro diz em que relógio vale o horário próprio — o
    de cada unidade em que ela atende (A11, `textoDoRelogioDoHorario`; como o
    horário é lido não mudou); o cartão da unidade, em Configurações, diz o
    fuso fora do de Brasília (A12).
  - A campanha (a agendada e a de todo ano) é da REDE (não tem unidade): roda no fuso comum.
  - Helper novo com dia ou hora recebe o fuso como parâmetro opcional (padrão
    o de Brasília) — nunca lê `America/Sao_Paulo` fixo. Componente com data
    ou hora passa `timeZone: fuso` (`useFuso`) mesmo onde o navegador
    "acertaria": sem ele vale o relógio do aparelho, e a mesma linha diz duas
    horas em dois computadores. Página do servidor nunca formata sem
    `timeZone` (o servidor é UTC).
  - **F62b (2026-11-11): tudo o que mostra ou decide uma hora ou um dia**
    segue a regra — as telas (ficha, atendimento, Financeiro, comissões,
    parcelas, fidelidade, vouchers, CRM, inbox, portal), o recibo (a unidade
    que recebeu) e os CSV, o Copilot (o relógio do portal: `fusoDoPortal`), o
    início adiantado, as automações (silêncio, gatilho de horário,
    aniversário) e a rotina da fidelidade (a rede). O que é da REDE sem
    unidade (fidelidade, LGPD, aniversariantes, a campanha) usa `fusoDaRede`.
    A Auditoria também: cada linha no fuso da unidade dela, a sem unidade no
    da rede, com o relógio na linha e a coluna "Relógio" no CSV (D6 da 26ª;
    era o fuso do recorte, D2 da 23ª), e a hora do agendamento citado no da
    unidade dele (`plataforma.md`); os "Últimos fechamentos" das comissões no
    fuso da rede (D3 da 23ª), e cada lançamento do extrato — na tela e no CSV —
    no da unidade dele (D7 da 26ª, `csvDoExtrato(…, fusos)`).
  - **O dia sem hora no banco** (migration `20261111006203`): o "cliente
    desde", a última visita de antes, a faixa etária (`metrics_faixa_etaria`
    com `p_fuso`), o público da campanha, `metrics_by_branch`, os
    "para reativar", a busca ("de hoje em diante") e o FEFO do estoque
    (vencido pelo dia da unidade: `(expires_at at time zone 'UTC')::date <
    (now() at time zone fuso_da_unidade(branch_id))::date`) comparam com o dia
    da unidade, não com o de Brasília.
  - **Ficam em Brasília de propósito**: a plataforma e as assinaturas (a
    cobrança é do BellarisOS), a cobrança do Copilot e o mês da Meta, e o
    VENCIMENTO, âncora ao meio-dia de −03 (`vencimentoDoDia`): o dia dela se
    lê em Brasília (cai no mesmo dia em todo fuso do Brasil), e o "hoje" que
    decide se venceu é o da unidade (`situacaoDoVencimento(…, fuso)`,
    `separarOEmAberto`, o pago no dia de `lancarCore`).
  - **A validade do pacote é o fim do dia DA UNIDADE** (F64): o pacote trazido
    de fora grava `fimDoDiaDaValidade(dia, fuso)` e o cancelar diz a
    validade no relógio dela. O pacote gravado antes (fim do dia de
    Brasília) não muda — em Manaus a última hora dele já conta vencida.
  - **As comissões são do fuso da REDE** (D12, o Heitor, 2026-11-11): o
    `period_ref`, os limites e o rótulo do fechamento (`periodoDe`,
    `periodosRecentes`, `periodRef(…, fusoDaRede)`; no banco,
    `comissao_acertar_linha` e `comissao_fechar_escolhidos` com
    `fuso_do_recorte(rede, null)`).
  - **O instante se formata no fuso**: `formatarNoFuso` (`lib/formatar-no-fuso.ts`)
    no lugar do `format` do date-fns num instante, `diaRelativo` no lugar de
    `isToday`/`isYesterday`; o `format` direto só no Date "de parede" da
    grade (a linha diz `parede`). `tests/fuso-sem-relogio-do-aparelho.test.ts`
    trava. A hora que vale para a REDE (o "Às" do relógio das automações, os
    modelos, a campanha agendada) diz SEMPRE o relógio (`RelogioDaRede`: "No
    horário de Brasília."); a da unidade, só fora de Brasília (`NotaDoFuso`).
  - **A campanha agendada**: a hora digitada é a do relógio da rede
    (`instanteDaCampanha`); ia crua e o banco a lia como UTC.
  - **Os gráficos do resultado e dos custos da venda** (`metrics_series_do_resultado`,
    `metrics_series_dos_custos_da_venda`) põem cada lançamento no dia da
    unidade dele, como `metrics_series` (F64).
  - Prova: `e2e/fuso-da-unidade.spec.ts`, `e2e/fuso-da-unidade-sobras.spec.ts`,
    `tests/fuso-da-unidade.test.ts` e `tests/fuso-sobras-f64.test.ts`.
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
    criação até 2026-10-27 (A34): agora também pelo vencimento. O cartão
    "A receber" do financeiro diz embaixo todo o em aberto, de qualquer
    vencimento (D-14, `getAReceberEmAberto` — `vendas-financeiro.md`). Na
    rede, esse em aberto inclui a unidade DESATIVADA (ind-11, 2026-11-02: "a
    unidade pode ter sido desativada comercialmente mas ainda tem contas a
    receber"), que também aparece no "Por unidade" enquanto tiver conta em
    aberto (prova: `e2e/financeiro-a-receber-todos-os-vencimentos.spec.ts`).
    E o atendimento CONCLUÍDO sem pagamento ("Reforça", item 4 da 5ª,
    2026-11-02) aparece no mesmo cartão, SEPARADO e nomeado — "Atendimentos
    concluídos sem pagamento: R$ 650,00 (1 atendimento)" —, sem se somar
    aos lançamentos: `getTotalDosAtendimentosAReceber`
    (`lib/metrics/a-receber.ts`, o conjunto de `atendimentos_a_receber`,
    contado no banco), na rede (total e por unidade) e na unidade. Só aparecia no Fechamento do dia, que
    passou a citar também as parcelas e lançamentos em aberto da unidade
    (`getAReceberEmAberto`, aviso `parcelas-em-aberto`).
  - **a receber VENCIDO** (D13 da 9ª simulação, 2026-11-07) = o a receber da
    cliente em aberto (o conjunto de `metrics_a_receber_em_aberto`) com o
    vencimento antes de hoje no fuso da unidade (F62) — `metrics_a_receber_vencido` →
    `getAReceberVencido` (`lib/metrics/vencidas.ts`), por unidade e no total,
    por cliente (o check-in), a quem tem o Financeiro em Ver. O cartão "A receber
    da cliente", o dashboard e o check-in dizem esse número
    (`vendas-financeiro.md` §9.6).
  - **a receber SEM cliente** (A17 da 30ª simulação; princípio 3; decisão do
    Claude) = a parte do em aberto (o conjunto de
    `metrics_a_receber_em_aberto`) sem cliente nem atendimento — a sublocação
    da sala, um aluguel — `metrics_a_receber_sem_cliente` →
    `getAReceberSemCliente` (`lib/metrics/a-receber-sem-cliente.ts`), por
    unidade e no total. O cartão "A receber · em aberto" (o nome desde 25/11, o Heitor: "O cartão vira 'A receber · em aberto' e soma tudo") segue
    somando todo o em aberto (FN-11), e a nota diz "Inclui sem cliente: R$ …"
    (a dica diz o que é). Prova: `tests/financeiro-a-receber-sem-cliente.test.ts`,
    `e2e/financeiro-a-receber-todos-os-vencimentos.spec.ts`.
  - **Dinheiro na tela com os centavos** (A7 da 30ª; princípio 3): o dashboard
    da unidade arredondava ao real (as comissões de R$ 192,50 eram "R$ 193
    lançados"); hoje mostra os centavos, como o da rede. Prova:
    `tests/dashboard-dinheiro-com-centavos.test.ts`.
  - **A parcela pendente dos Relatórios diz o prazo em palavras** (A18 da 30ª;
    princípio 7): a coluna "Prazo" diz "vence em 61 dias", "vence amanhã",
    "vence hoje" ou "3 dias de atraso" (`prazoDaParcela`), e a linha é o
    procedimento com a parcela, "Microagulhamento — parcela 2/3"
    (`nomeDaLinhaDoLancamento`, `lib/financeiro/nome-da-parcela.ts`; sem
    procedimento, a descrição). Prova: `tests/financeiro-nome-da-parcela.test.ts`.
  - **O cartão em N vezes conta no dia da VENDA** (decisão do Heitor,
    2026-11-01: "conta no mês do dia da venda"): a receita é o lançamento
    pago, inteiro, no `paid_at` dele — a regra única não muda. As parcelas
    que a OPERADORA deposita em parcelas (`recebiveis_do_cartao`) não são
    receita e não entram em `revenuePending`: são o "A receber da operadora"
    (`metrics_a_receber_da_operadora` → `getAReceberDaOperadora`,
    `lib/metrics/operadora.ts`: o em aberto com vencimento no período, o
    recebido no período, todo o em aberto e o próximo vencimento), ao lado do
    "A receber da cliente" no Financeiro. A parcela recebida (na data ou
    antecipada) NÃO soma receita. Prova:
    `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`
    (`vendas-financeiro.md` §9.6).
  - **fluxo de caixa** (r2-fin-04, 2026-11-03) = por mês, dos próximos 3, 6
    ou 12 (a escolha do cartão, r3-f13-11; o banco devolve os 12): o
    a receber em aberto + o a receber da operadora − o a pagar, pelo
    vencimento; o vencido em aberto no mês atual — `metrics_fluxo_de_caixa_liquido`
    → `getFluxoDeCaixa`. **A operadora entra no LÍQUIDO** (o que ela
    deposita, já sem a taxa), com o bruto ao lado — no fluxo e no cartão "A
    receber da operadora" (`metrics_a_receber_da_operadora_liquido`; A30 da
    9ª simulação, 2026-11-07). As mesmas definições dos três cartões do Financeiro,
    só que por mês (`vendas-financeiro.md` §9.6).
  - `serviceRevenue` — preço dos atendimentos concluídos, no eixo
    `appointments.aconteceu_em`
  - **O atendimento conta quando ACONTECEU** (D13, decisão do Heitor,
    2026-10-22): `aconteceu_em` (coluna gerada) é a hora marcada, ou a da
    conclusão quando ela veio ANTES. Todo indicador de atendimento usa esse
    eixo — `metrics_core`, `by_branch`, `relatorio`, `retention`, os rankings,
    a receita por categoria e os clientes a reativar
    (migration `20261022000001`; `metrics_vendas` usava também até a D6 de
    18/11 — a venda agora é datada pelo primeiro recebimento pago, abaixo). Era `scheduled_at`, e como o período em
    andamento fecha em "agora", o concluído antes da hora (chegou cedo, o
    encaixe adiantou) ficava fora do dashboard até a hora marcada passar. O
    concluído DEPOIS da hora (finalizado no dia seguinte) segue no dia
    marcado: contar pela conclusão pura mudaria o atendimento de dia e de mês.
    Indicador novo de atendimento filtra por `aconteceu_em`, nunca por
    `scheduled_at`. Prova: `e2e/indicadores-concluido-antes-da-hora.spec.ts`.
    **A desistência no meio aconteceu na hora da desistência** (D14 da 33ª,
    Decisão A — decisão do Claude, 26/11, princípio 5): o atendimento INICIADO
    e cancelado antes da hora marcada vale pelo `cancelled_at` (entra no "até
    agora" dos Cancelados/faltas do dashboard); o desistido depois da hora, e
    o cancelado sem início, seguem na hora marcada (migration
    `20261212100001`). Prova: `tests/desistencia-aconteceu-na-hora.test.ts`.
  - **`ticketMedio` = a média de quanto cada CLIENTE gasta na rede**
    (decisão do Heitor, 2026-10-29; muda a regra de 2026-10-27): o que as
    clientes pagaram no período ÷ as clientes que pagaram — quem não pagou não
    entra. Pelo eixo da receita paga (`metrics_receitas_pagas`), entra tudo
    que tem cliente: atendimento, pacote, plano (entrada e parcelas),
    pré-pago e, quando existir, produto. A conta é UMA: `metrics_ticket_medio`
    (o pago e as clientes, por unidade e no total — a cliente que pagou em
    duas unidades conta uma vez no total; migration `20261029001102`),
    `getTicketMedio` e a divisão `ticketMedio()` em `lib/metrics/resultado.ts`;
    sem cliente que pagou, nulo e a tela mostra "—". **"Pagou" é pagar mais
    que zero** (D7 da 8ª simulação, 2026-11-06): a cliente só com lançamento
    pago de R$ 0 (o pacote migrado a zero, a venda com 100% de desconto) não
    entra no denominador — na unidade, o que ela pagou nela; no total, o que
    pagou na rede (migration `20261106003402`). Eram "R$ 437 · 10 clientes
    que pagaram" no lugar de R$ 4.368 ÷ 8 = R$ 546. Prova:
    `e2e/indicadores-ticket-medio.spec.ts` ("D7"). É UM indicador só com o
    antigo "Gasto médio" de Relatórios → Clientes (o mesmo número), que passou
    a se chamar "Ticket médio": dashboards (o cartão e a coluna por unidade),
    financeiro da unidade, Relatórios (Visão geral, Clientes, Procedimentos) e
    Copilot. Na vista pessoal do dinheiro (dashboards, SM2), é o DELA. O subtítulo diz a conta ("pago pelas clientes ÷ 2
    clientes que pagaram"). Era `serviceRevenue ÷ atendimentos COBRADOS`
    (2026-10-27: a avaliação de R$ 0 puxava a média para R$ 90). Prova:
    `e2e/indicadores-ticket-medio.spec.ts`, `e2e/indicadores-uma-conta-so.spec.ts`.
    Divisão parecida sobre OUTRO conjunto tem outro nome: "Média por atend."
    (no ranking do dashboard, o pago da cliente ÷ os concluídos; na FICHA da
    cliente, a receita de serviço dela ÷ os concluídos cobrados —
    `mediaPorAtendimentoCobrado`, a conta antiga do ticket: numa cliente só, o
    ticket novo seria o próprio LTV; desde 2026-11-02, A56, o cartão se chama
    "Preço médio por atend." e tem a dica `DEFINICOES.precoMedioPorAtendimento`
    — ao lado do "Investido total", que é tudo o que ela pagou; desde a A39 da
    9ª, 2026-11-07, a conta aparece na tela, "R$ 2.400,00 ÷ 2 atendimentos
    cobrados (o preço de cada um, pago ou não)…", `[data-preco-medio-explica]`,
    com a soma e os cobrados de `getDoCliente`) e "Média por execução" (por
    procedimento, nos Relatórios; na aba Procedimentos, a receita paga dos
    atendimentos ÷ as execuções, num cartão ao lado do "Ticket médio por
    cliente" — A55, 2026-11-02: o ticket fica, com o nome que diz a conta). Até 2026-10-28 o dashboard dizia "receita ÷ atendimentos" e a
    aba Procedimentos dividia pelos concluídos — R$ 90 ao lado dos R$ 180 da
    Visão geral (D11). Essas duas médias, e o "% do Total" da tabela por
    procedimento, também moram em `lib/metrics/resultado.ts`
    (`mediaPorAtendimento`, `mediaPorExecucao`, `participacaoPct`): a tela
    dividia por conta própria até a frente F (`tests/metrics-medias-das-tabelas`
    trava). **As taxas dos Relatórios também** (decisão do Heitor, 2026-10-29):
    a taxa de conclusão da agenda (no total e por unidade, `taxaDeConclusao`),
    a retenção (`taxaDeRetencao`), o giro do estoque (`giroDoEstoque`), a
    conversão por vendedor das Oportunidades (`conversaoDasOportunidades`, em
    `getPainelComercial`) e a variação contra o período anterior dos cartões
    (`variacaoPercentual`) moram em `lib/metrics/resultado.ts`; a tela só
    formata. Os números não mudaram (`tests/metrics-divisoes-dos-relatorios`
    trava).
  - **Lucro e margem também moram em lib/metrics** (`resultadoDoPeriodo`,
    `variacaoDaMargemPp` em `lib/metrics/resultado.ts`): **lucro = receita paga
    − (despesa paga − compra de estoque paga) − insumo consumido** (o Heitor,
    2026-10-29: o consumo "serve pra controle de estoque e aferimento de
    métricas de custo/margem/lucro", e a movimentação não gera outra despesa,
    "pagar 2x" — é dele que o lucro desconta o insumo; tirar do lucro a
    despesa "Compra de estoque" foi desenho do Claude sobre essa fala, que
    ele não fechou); margem = lucro ÷ receita, nula sem receita; a
    variação da margem em p.p. O insumo entra pelo que foi CONSUMIDO nos
    atendimentos (o custo do movimento, `metrics_giro_estoque`; o lote não
    guarda custo próprio). A despesa da categoria **"Compra de estoque"**
    (`lib/financeiro/categorias.ts`; o banco também lê a antiga "Estoque")
    conta no CAIXA — o cartão de despesas, o fechamento, o gráfico do
    financeiro — e NÃO no lucro: senão o produto seria descontado duas
    vezes. As duas parcelas vêm de `metrics_resultado` (por unidade e no
    total; `getResultadoDoEstoque`) e, por fatia, de
    `metrics_series_do_resultado` (`getSeriesDoResultado` → o 3º argumento de
    `pontosDaEvolucao`); migration `20261029001104`. Valem no lucro dos
    Relatórios (visão geral e financeiro, com o DRE "Receita − Despesas
    operacionais − Insumos consumidos = Lucro"), no "Lucro Líquido" do
    financeiro da unidade, no "Resultado líquido" do da rede, na evolução
    (dashboard da rede e Relatórios: o custo do gráfico é o do lucro) e no
    Copilot. Na vista pessoal do dinheiro (SM2), o lucro não aparece. A margem do
    catálogo (por procedimento) já descontava o insumo. Até 2026-10-29 o lucro
    era receita − despesa paga, e o consumo era informativo. Prova:
    `e2e/indicadores-lucro-desconta-insumo.spec.ts`, `tests/metrics-resultado.test.ts`.
    **O custo do PRODUTO VENDIDO entra na mesma parcela** (D4, 2026-10-30;
    migration `20261029001307`): a receita da venda de produto entra pela
    regra única, e o custo dela (`product_sales.custo`, o custo dos lotes que
    saíram, retratado na venda) sai do lucro na data da venda — é o mesmo caso
    do insumo: o estoque que saiu para gerar a receita. A coluna continua
    `consumo_de_insumo` (em `metrics_resultado` e
    `metrics_series_do_resultado`; com o profissional, a venda de quem vendeu), e
    o DRE diz "− Insumos e produtos vendidos". A perda (D-7) NÃO entra (não
    gerou receita; a pergunta que ficou aqui ao Heitor ele respondeu na revisão
    de 2026-11-02, est-04/est-05: a perda é métrica, não dinheiro — abaixo, em
    "A perda é MÉTRICA"). Prova: `e2e/vendas-produto.spec.ts`.
    **A tela diz isso** (A10/A36/A37 da 22ª; só o texto, a regra não mudou):
    a conta do resultado diz "o custo do produto quando ele é vendido, mesmo
    a receber"; a Receita dos atendimentos diz que é líquida do voucher e dos
    pontos (por isso pode valer menos que o Total vendido das Vendas); o
    Consumo no Período dos Relatórios tem a dica do giro. Prova:
    `tests/atritos-da-22-caixa.test.ts`.
    **A venda ESTORNADA não entra** (`product_sales.estornada_em`; de quem é:
    sair das Vendas segue a regra do Heitor, 18/11, "Uma coisa só foi vendida
    se foi paga"; a H2 de 01/11 pediu a pergunta "houve devolução?"; o custo
    do que não voltou virar perda no dia do estorno e a venda sair também do
    mês dela são decisões do Claude na F3, pelos princípios):
    nem o custo no lucro (`metrics_resultado`, `metrics_series_do_resultado`),
    nem a venda em Relatórios → Vendas. Se o produto não voltou, o custo dela
    aparece em "Perdas no período" (`metrics_perdas`, motivo
    `VENDA_ESTORNADA`, no dia do estorno). Na 5ª simulação o protetor
    estornado ainda tirava R$ 45 do lucro ("Lucro 2.754" em vez de 2.799).
    **E desconta as TAXAS DA MAQUININHA e as COMISSÕES** (decisão do Heitor,
    2026-11-04, a pergunta da 6ª simulação: "pode descontar as duas"):
    **lucro = receita paga − (despesa paga − compra de estoque − despesa de
    comissões) − insumo e produto vendido − taxas da maquininha − comissões
    lançadas**; a margem acompanha.
    - As taxas são as que o Fechamento do dia mostra, no dia em que a receita
      ENTROU (o conjunto de `metrics_receitas_pagas`): a GRAVADA nas parcelas
      da operadora (`recebiveis_do_cartao.taxa`, o crédito de 1x ao limite da maquininha — até 1.200x, o Heitor, 25/11 —, com a
      sobra do arredondamento na última) e, sem parcelas (débito, Pix, as
      vendas no cartão de antes), o recebimento × a taxa da configuração
      (`private.comissao_taxa_pct`).
    - As comissões são as LANÇADAS no período (`released_at`) — a conta de
      Financeiro → Comissões.
    - **Sem contar duas vezes**: o "Fechar e pagar" lança a despesa PAGA
      "Comissões"; ela fica no CAIXA (os cartões de despesa, o Fechamento, o
      fluxo) e SAI da despesa operacional do lucro, como a "Compra de
      estoque". Ex.: R$ 100 de comissão lançados em outubro e pagos em
      novembro tiram R$ 100 do lucro de OUTUBRO; os R$ 100 de despesa de
      novembro aparecem nas despesas de novembro e não mexem no lucro dele.
      Num mês: receita R$ 2.100 (Pix 1.000 a 1%, débito 500 a 2%, crédito 2x
      600 a 3%), aluguel R$ 200, comissão lançada e paga R$ 100: despesas
      (caixa) R$ 300, taxas R$ 38, lucro 2.100 − 200 − 38 − 100 = R$ 1.762
      (era R$ 1.800).
    - A conta é `metrics_custos_da_venda` e, por fatia,
      `metrics_series_dos_custos_da_venda` (migration `20261104002104`),
      somadas às do estoque em `getResultadoDoEstoque`/`getSeriesDoResultado`
      e descontadas em `resultadoDoPeriodo`/`pontosDaEvolucao` — valem nos
      Relatórios (visão geral, financeiro e o DRE, que ganhou "− Taxas da
      maquininha" e "− Comissões"), no "Lucro Líquido" do financeiro da
      unidade, no "Resultado líquido" do da rede (e de cada unidade), no
      "Custo do lucro" da evolução (dashboard e Relatórios) e no Copilot. A
      "taxa estimada" do Fechamento continua informativa (não sai do saldo).
      **O resultado do Financeiro se explica na tela** (D8 da 8ª simulação,
      2026-11-06; princípio 3): o da rede dizia "Receita R$ 89 · Despesas
      R$ 0 · Comissões R$ 0 · Resultado líquido R$ 9", e os R$ 80 de insumo e
      de custo do produto não apareciam em cartão nenhum. Embaixo do
      "Resultado líquido" (rede, e cada unidade no recorte) e do "Lucro
      Líquido" (unidade), a conta: "Receita R$ 89,00 − despesas operacionais
      R$ 0,00 − insumos e produtos R$ 80,00 − taxas da maquininha R$ 0,00 −
      comissões lançadas R$ 0,00 = R$ 9,00" (`ContaDoResultado`,
      `[data-conta-do-resultado]`, as parcelas de `resultadoDoPeriodo`); quando
      as despesas pagas do cartão passam da operacional, diz que a compra de
      estoque e o pagamento das comissões ficam no caixa. Prova:
      `e2e/indicadores-lucro-desconta-taxas-e-comissoes.spec.ts` ("D8").
      Prova: `e2e/indicadores-lucro-desconta-taxas-e-comissoes.spec.ts`,
      `tests/metrics-resultado.test.ts`, `tests/metrics-evolucao.test.ts`.
      **E a frase diz a regra de verdade** (D4 da 10ª simulação, 2026-11-10;
      princípio 3): dizia "É o resultado do período (competência)", e o
      aluguel de novembro a pagar (R$ 9.000) ficava fora — a regra é a despesa
      PAGA, como a receita ("Receita e despesa simétricas", abaixo). Agora "É o
      resultado do período: a receita e a despesa pelo que foi pago; o insumo
      quando é usado; a comissão quando é lançada." e, com despesa em aberto
      vencendo no período, "A pagar no período, fora do resultado: R$ 9.000,00"
      (`[data-a-pagar-fora-do-resultado]`, o "A pagar" de `getEmAberto`). A
      conta não mudou. Prova: `e2e/financeiro-atritos-da-10.spec.ts` ("D4").
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
    unidade (`ocupadoFora`). Em quais unidades a pessoa atende é o "Atende"
    por unidade (`users.atende_em`, decisão 2 do Heitor na 8ª simulação, que
    substituiu a de 2026-10-28, "o da rede atende em todas"). Sem isso ele
    aparecia livre em duas unidades ao mesmo tempo.
    **E menos o tempo BLOQUEADO dele** (D15 da 8ª simulação, 2026-11-06;
    princípio 3): o bloqueio pontual da profissional (`agenda_bloqueios`) entra
    como bloco ocupado (`blocosDosBloqueios`, `lib/agenda/horario-livre.ts`; os
    blocos se fundem com os de fora, nada sai duas vezes) — no dashboard da
    unidade, na agenda da unidade e na "Minha agenda". "430 min de 4.230 min
    disponíveis" somava as 23 h e meia da Iara bloqueada. Prova:
    `e2e/agenda-defeitos-da-8.spec.ts` ("D15"), `tests/agenda-horario-livre.test.ts`.
    A **"Minha agenda"** (a vista pessoal da agenda, SM2) usa a MESMA conta para a
    "Ocupação hoje": `ocupacaoDoDia` (`lib/metrics/ocupacao.ts`, puro, roda no
    navegador) — os minutos dela no dia de Brasília ÷ o horário unidade ∩
    dela, menos o que ela tem em outra unidade; sem expediente, "—". Era um
    dia fixo de 8 h, dividido na tela: a Camila (18:00–23:30) via 32% em vez
    de 47% (D11 da simulação de 2026-10-29). Prova:
    `e2e/agenda-minha-ocupacao.spec.ts`, `tests/metrics-ocupacao.test.ts`.
    **O que ela tem em outra unidade sai também quando é ELA quem olha a
    agenda inteira** (D13 da 33ª, §13.1): a página tirava do "ocupado fora" de
    quem vê os agendamentos que ela mostra como cartão em "Seus atendimentos
    em outras unidades" — o Dr. Itamar via 28% (255/900) no topo da agenda e
    30% (255/855) no dashboard. Só a Minha agenda os tira (lá eles entram na
    grade e voltam como "ocupado fora": `semOsQueJaSaoCartao`,
    `lib/agenda/ocupado-fora.ts`). Prova: `tests/ocupacao-de-quem-atende-em-duas.test.ts`.
    **A ocupação diz a base** (A53 da 9ª simulação, 2026-11-07: "13%" sem a
    conta, e a Carolina não conseguiu prová-la — 340 ÷ 2.720): o dashboard da
    unidade e o topo da agenda dizem "340 min agendados de 2.720 min abertos
    (o horário de 4 profissionais que atendem)" (`baseDaOcupacao`,
    `lib/metrics/ocupacao.ts`; `[data-base-da-ocupacao]`; os minutos abertos
    são os de `capacidadeEmMinutos`, a mesma da porcentagem), com a dica
    `DEFINICOES.ocupacao` (o que entra: os concluídos; o que sai: cancelados,
    faltas, o tempo bloqueado e o que ela tem em outra unidade). A conta não
    mudou. Prova: `e2e/agenda-atritos-da-9.spec.ts` ("A53"),
    `tests/metrics-ocupacao.test.ts`. **E diz o que saiu da capacidade** (A9
    da 13ª, F65; princípio 3: os minutos abertos não fechavam com o horário
    da tela): "… (o horário de 2 profissionais que atendem, menos 140 min da
    Patrícia na Água Verde e 60 min bloqueados da Ana)" — `descontosDaOcupacao`
    (`lib/metrics/ocupacao.ts`), a MESMA `capacidadeEmMinutos` acumulada um
    grupo por vez (o bloqueio sobre o horário da outra unidade não sai duas
    vezes; a soma é o que a capacidade perdeu). Prova:
    `e2e/agenda-ocupacao-diz-o-desconto.spec.ts`, `tests/metrics-ocupacao.test.ts` ("A9 da 13ª").
    **Sem gênero e sem a agenda de fora** (A13 da 16ª): "menos 70 min de Dr.
    Caio Brandão atendendo em outra unidade" — "de", não "da/do", e a outra
    unidade só sai pelo nome a quem a alcança (`alcancaUnidade`); a quem não,
    "outra unidade".
    **Os minutos são o trecho DO DIA** (decisão do Claude, 25/11, pelo
    princípio 3; o procedimento não tem duração máxima): de cada atendimento
    conta o que ele ocupa DENTRO do dia (ou do período da agenda) — o mesmo
    trecho que as agendas desenham, pela duração MARCADA (o concluído conta a
    duração, também o adiantado: só o recorte é novo). Somava a duração inteira no dia do
    início: o de 30 h dava mais de 100% num dia e 0% no seguinte. A conta é
    UMA, `minutosAgendadosNoPeriodo` (`lib/metrics/ocupacao.ts`), na agenda da
    unidade (era uma soma no componente), no dashboard da unidade (era uma
    soma na página) e na Minha agenda (`ocupacaoDoDia`). A definição não muda;
    a contagem dos atendimentos do dia segue pelo dia de início. Prova:
    `tests/o-dia-conta-o-atendimento-que-continua-de-antes.test.ts`.
    **Na agenda, a base mora na dica** (A15 da 21ª; princípio 7: com os
    descontos, a linha quebrava com parênteses aninhados): o topo diz "3% de
    ocupação" e a dica "Como a ocupação é contada" traz a base e a definição.
    O dashboard da unidade segue com a base à vista.
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
    `e2e/indicadores-margem.spec.ts`. O ranking do dashboard lista só o
    procedimento com custo cadastrado (A13, 2026-11-02; migration
    `20261101000707`): sem custo nenhum a margem é 100% por construção, e a
    5ª simulação via "100%" em todos; a tabela tem colunas fixas e cabe no
    cartão estreito (a coluna "Margem" saía cortada).
    **Recortada a UMA unidade, o preço e a mão de obra dela** (sobra da F40,
    9ª simulação, 2026-11-07): com o preço por unidade (D2,
    `private.preco_na_unidade`), o ranking do dashboard da rede com
    `?unidade=` (ou a unidade em que está quem não tem “A rede inteira”, ou a rede de uma só) usa o preço DELA e a
    mão de obra dela (`procedure_branch_pricing.labor_cost`), com o insumo e os
    outros custos do catálogo — `metrics_margem_procedimentos_na_unidade`
    (migration `20261107004408`), por `getMargemPorProcedimento({ unidadeId })`.
    A rede inteira segue o catálogo. Prova: `e2e/indicadores-margem-da-unidade.spec.ts`.
    (A margem por faixa etária dos Relatórios segue o preço do atendimento e o
    custo do catálogo.)
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
    R$ 450, e não R$ 445,50 (A39, 2026-10-27). **E o custo é o de cada LOTE**
    (D2 da 10ª simulação, 2026-11-10): o saldo coberto pelos lotes vale o
    custo de cada um (`custo_do_lote`), e só o que nenhum lote cobre vale o
    último custo — era tudo pelo último custo, e uma entrada mais barata
    baixava o valor do que já estava na prateleira (`atendimento.md` §9.5).
    O gráfico "Valor em estoque por categoria" (aba Estoque) tem uma fatia
    **"Sem categoria"** para o produto sem categoria ou com ela em branco, e
    as fatias somam o valor em estoque da aba. Até 2026-10-28 esse produto
    sumia, e a tela dizia "Sem dados no período" com R$ 5.562 em estoque (D17,
    migration `20261028000502`). Prova: `e2e/indicadores-uma-conta-so.spec.ts`.
    Com uma categoria só, o gráfico não aparece (A30 da 23ª: era uma pizza de
    100% "Sem categoria", que não diz nada) — e o quadro diz por quê: "Todo o
    valor está em <categoria>", com a dica "Por que não há gráfico" (A31 da
    24ª, `[data-categoria-unica]`).
  - **perdas do estoque** (D-7, 2026-10-30) = os movimentos `LOSS` NEGATIVOS
    e não desfeitos do período (C69, F66: a perda desfeita — "Desfazer perda",
    `desfeita_em` — sai, e o movimento positivo que a desfaz não conta), ao
    custo do movimento (`custo_do_movimento`; desde a F66 a perda e a venda
    saem ao custo DO LOTE, `custo_do_lote`, também o do ajuste — C20), por motivo e
    produto (o motivo é o da rede, pelo nome de hoje, ou o nome gravado se
    ele foi excluído — item 7 do escopo de 18/11; e cada produto diz os
    LOTES de onde saiu, com a validade — item 6), com o total de cada motivo e o geral — `metrics_perdas`
    (grouping sets; a quantidade só por produto, que unidades diferentes não
    se somam) → `getPerdas` (`lib/metrics/perdas.ts`). É a seção "Perdas no
    período" de Relatórios → Estoque. A perda não entra no giro nem no lucro. A venda de
    produto estornada cujo produto NÃO voltou também é perda ali
    (`VENDA_ESTORNADA`, "Venda estornada (não voltou)" — decisão do Claude
    na F3, pelos princípios; a H2 de 01/11 pediu só a pergunta "houve
    devolução?"), com o lote de onde a venda saiu (o movimento da venda —
    A11 da 35ª, `20261214200001`).
    **E o ajuste de inventário que contou a MENOS** (`INVENTARIO`,
    "Inventário" — D5 da 10ª, 2026-11-10; migration `20261110004903`): o
    movimento `MANUAL_ADJUSTMENT` negativo, ao custo do lote de onde saiu (os
    de antes, sem custo gravado, ao último custo). **O ajuste desfeito não é
    perda** (D5 da 11ª, migration `20261110005401`): nem ele nem o movimento
    que o desfaz entram (`desfeita_em`, `desfeita_pelo`). **E o brinde da
    fidelidade entregue** (`BRINDE`, "Brinde da fidelidade" — A40 da 12ª,
    2026-11-11; migration `20261111006101`): o ajuste negativo da entrega do
    voucher (`reference = 'voucher:<id>'`) era contado como "Inventário"; é o
    motivo dele, ao custo do lote.
    **E o ajuste da "Correção de cadastro" não é perda** (A10 da 24ª, o
    Heitor: "As duas"; migration `20261123600001`): o custo ou a quantidade
    digitados errado na entrada, acertados por Ajuste depois que já saiu algo
    do lote. O movimento nasce com `correcao_de_cadastro` (o
    `estoque_ajuste_de_correcao`, motivo "Correção de cadastro" na janela do
    Ajuste) e fica fora de "Perdas no período", do "Consumo com perdas" e do
    giro (`metrics_perdas`: `and not m.correcao_de_cadastro`).
    **A perda é MÉTRICA, não dinheiro** (est-04/est-05, revisão de 2026-11-02:
    "perdido ou não, o insumo já foi pago na compra … serve como métrica";
    reafirmada em 18/11, sobre o pedido da 26ª de pô-la no lucro: "8 mantém"):
    não entra no lucro nem no financeiro, e o relatório mostra, além da
    quantidade e do valor perdidos por produto (ao custo do lote), os cartões
    "Perdas no período" e "Consumo com perdas" (o insumo consumido + as
    perdas, `consumoComPerdas` em `lib/metrics/resultado.ts`) — o custo com
    perdas para análise. Prova: `e2e/estoque-perda.spec.ts`. **O motivo que
    a tela dá é a regra** (D8 da 10ª simulação, 2026-11-10; princípio 3): era
    "Não sai do lucro: já foi paga na compra" — mas a compra também fica fora
    do lucro (o lucro tira a compra de estoque paga, acima), e os R$ 640 da
    Toxina quebrada nunca apareciam no resultado. Agora o cartão diz "Métrica:
    não entra no lucro, nem quando a compra é paga", e a nota do DRE
    (`[data-fora-do-lucro]`), que a perda e o ajuste são métrica e não entram
    no resultado, nem quando a compra é paga. Prova:
    `e2e/financeiro-atritos-da-10.spec.ts` ("D8").
  - **As transferências entre unidades** (A33 da 20ª simulação, 2026-11-17;
    migration `20261123200002`): o relatório de Estoque não as mostrava (só a
    Auditoria). Cada perna de `estoque_transferir` (`TRANSFER_OUT` na origem,
    `TRANSFER_IN` no destino, ligadas pela `reference`) é uma linha da unidade
    dela — "Saiu para X" ou "Entrou de Y" —, com a quantidade (na unidade do
    movimento e em embalagens) e o custo, que é o da SAÍDA nas duas pernas (os
    lotes que saíram, `custo_do_lote`; o que nenhum lote cobre, à conta de
    `custo_do_movimento`): a transferência não muda o valor. Por unidade ×
    direção × outra unidade × produto, e o total da unidade × direção —
    `metrics_transferencias_de_estoque` (grouping sets, só o servidor chama)
    → `getTransferenciasDeEstoque` (`lib/metrics/transferencias.ts`). É a
    seção "Transferências entre unidades" de Relatórios → Estoque
    (`[data-transferencias]`), que some na rede de uma unidade só. É métrica: não entra no lucro
    nem no financeiro. Prova: `tests/pendencias-pdv-estoque-documentos.test.ts`,
    `e2e/estoque-transferencia-no-relatorio.spec.ts`.
  - **As movimentações do período** (item 6 do escopo de 18/11, o Heitor:
    "ok"; migration `20261201100002`): cada movimento de estoque do recorte
    de unidades e do período, uma linha — data e hora no fuso da UNIDADE do
    movimento, produto, tipo (entrada, consumo, venda, perda com o motivo,
    ajuste, transferência; o desfeito marcado), quantidade (na unidade do
    movimento e em embalagens), lote/validade, unidade (só com mais de uma no
    recorte), quem fez e o custo (`custo_do_movimento`). O filtro, a ordem, a
    página (50) e o total são do banco — `metrics_movimentos_de_estoque` (só
    o servidor chama) → `getMovimentosDeEstoque`
    (`lib/metrics/movimentos-de-estoque.ts`); o tipo e o rótulo saem de
    `lib/estoque/tipo-do-movimento.ts`. É a seção "Movimentações do período"
    de Relatórios → Estoque (`[data-movimentos-do-estoque]`, `?pagina=`), que
    aparece onde a aba mostra o estoque da unidade (como as perdas). A aba não
    tem CSV, e a lista não ganhou um. Prova:
    `tests/pendencias-pdv-estoque-documentos.test.ts`, `e2e/estoque-perda.spec.ts`.
  - **A conversão é da OPORTUNIDADE** (decisão do Heitor, 2026-10-29: "o
    objeto é a oportunidade"): as oportunidades na etapa de GANHO (desfecho
    `WON`) ÷ as oportunidades do funil, sem importar se a pessoa já é cliente.
    UMA conta, `conversaoDasOportunidades` (`lib/metrics/resultado.ts`), que
    `resumoDoFunil` usa no dashboard, no funil dos Relatórios e no quadro de
    Oportunidades ("33,3% de conversão (1 de 3 ganhas)"). O quadro a chama no
    recorte que mostra (`getFunilDoQuadro`): o funil de AGORA, sem período,
    com todas as oportunidades (sem o "só os meus", SM3); o dashboard, as
    criadas no período. **Funil sem etapa de ganho não tem conversão: "—"**
    (num pós-venda ela nasceria 0% ou 100% sem dizer nada).
    - **Onde a tela junta funis, junta as oportunidades deles**: o painel de
      Relatórios → Oportunidades (`metrics_comercial`: `ganhos` de qualquer funil
      ÷ as oportunidades do período; `tem_ganho` = a rede tem alguma etapa de
      ganho) e a coluna "Conv." do ranking por vendedor (a mesma conta sobre
      as dele, em `getPainelComercial` — a tela não divide). Migration
      `20261029001101`. **Só os funis ATIVOS** (ind-07, 2026-11-02; migration
      `20261101000705`): as oportunidades, os ganhos e o "tem ganho" ignoram
      o funil arquivado — o ganho de um funil arquivado fazia a tela dizer
      "0%" em vez de "—". Prova: `e2e/relatorios-conversao-funis-ativos.spec.ts`.
    - **A conversão por ORIGEM** (A20 da 7ª simulação, 2026-11-05: "para quem
      decide onde investir em anúncio, é o número que falta"): Relatórios →
      Oportunidades → "Conversão por origem", uma linha por `leads.source`
      ("Sem origem" sem ela) com oportunidades, ganhas e a conversão — as MESMAS
      oportunidades do painel (criadas no período, funis ativos, o "só os
      meus"), contadas no banco (`metrics_conversao_por_origem`, migration
      `20261105003103`) e divididas por `conversaoDasOportunidades`
      (`getConversaoPorOrigem`); sem etapa de ganho, "—". Prova:
      `e2e/crm-atritos-da-7.spec.ts` ("A20").
    - "Já é cliente" (`converted`, `leads.client_id`) não é conversão: é só o
      filtro do quadro ("Já é cliente / Ainda não é cliente") e um dado
      informativo para o Copilot. De 2026-10-28 a 10-29 a conversão foi
      "viraram cliente ÷ leads" (D10), e o Heitor a devolveu à oportunidade.
    Prova: `e2e/indicadores-uma-conta-so.spec.ts`, `tests/metrics-resultado.test.ts`.
  - `retenção` = clientes atendidos no período que **já tinham sido atendidos
    antes dele** ÷ atendidos no período (`getRetention`). Não confundir com
    recorrência dentro da janela, que em períodos curtos dá zero por construção.
    **"A cliente é da clínica, o atendimento é da profissional"** (decisão do
    Heitor, 2026-10-29): com um profissional (a função guarda o parâmetro; os
    Relatórios não o passam desde a SM4), entram as clientes que ELA
    atendeu no período, e "voltou" é quem a REDE já tinha atendido antes —
    por qualquer profissional, em QUALQUER unidade da rede (ind-08,
    2026-11-02, migration `20261101000706`: era "nas unidades do recorte", e
    a Carla atendida na Moinhos contava como nova olhando a Zona Sul — prova:
    `e2e/indicadores-retencao-rede-inteira.spec.ts`; migration anterior
    `20261029001103`). Era "já tinha vindo a ela" (20261028000804), e a cliente
    que trocou de profissional contava como primeira vez. Prova:
    `e2e/indicadores-retencao-da-rede.spec.ts`.
- **Zero é um dado, não ausência de dado.** Em métricas de anúncio, `0 ||
  undefined` transformava "zero clique no link" em "Indisponível" e escondia
  justamente a campanha problemática. Só use `undefined` quando a origem
  realmente não devolveu o campo.
- **Médias de referência são ponderadas** pela grandeza que as sustenta (ROI e
  CPA por investimento, CTR por impressões). Média simples por campanha deixa
  uma campanha de R$ 5 ditar a régua de todas as outras.
- **Estorno: cada lado no seu dia** (D2 da 12ª simulação, 2026-11-11 —
  DECIDIDO pelo princípio 5, "o caixa e o faturamento, no dia em que o dinheiro
  entrou"; troca o "sai dos dois lados" de antes, que era regra de frente). A
  Acácia fechou 10/11 com "Bateu" em R$ 1.730, o cancelamento do plano em 11/11
  levou o 10/11 a R$ 1.100, e o 11/11 não mostrava saída nenhuma.
  - O PAGAMENTO conta no dia dele pelo valor que ENTROU — o de antes de todo
    estorno (o estorno parcial reduz o lançamento, r2-ven-05, mas o dia dele
    volta a contar os R$ 1.100 pagos). Um dia (ou um mês) que já passou não
    muda por um estorno feito depois — fechado ou não.
  - O ESTORNO conta no dia em que foi feito: no Fechamento, é SAÍDA na forma do
    pagamento (o parcial, a parte devolvida; o inteiro, o valor todo — e o
    relançado do "estornar inteiro e lançar o usado de novo" é entrada do dia);
    no faturamento, uma dedução do período em que aconteceu, como uma devolução
    de venda. O estorno de uma DESPESA é o dinheiro que VOLTA ao caixa: entrada
    do dia (e dedução da despesa do período).
  - **No mesmo dia (na mesma janela), um anula o outro**, como sempre foi: o
    pagamento estornado inteiro some, o parcial fica com o que sobrou, e o
    estorno não vira saída. Em dias diferentes, cada lado conta no seu dia.
  - As taxas da maquininha acompanham o pagamento: a do estornado fica no dia
    dele e sai no dia do estorno.
  - **O cartão do Fechamento por maquininha** (C75 da F67): o quadro do cartão
    sai de `metrics_fechamento_por_maquininha` (forma, maquininha, bandeira) —
    a mesma régua dos movimentos pagos. Só quando o DIA teve mais de uma
    maquininha a tela agrupa ("Stone: Visa R$ …, Elo R$ …") e o CSV da
    contabilidade ganha a coluna ("Forma, maquininha e bandeira"); com uma só,
    fica como era (princípio 7). A despesa não tem maquininha (o cartão da
    rede não é maquininha).
  - A régua é UMA: `metrics_movimentos_pagos` (migration `20261111005901`) — o
    pagamento da janela pelo que entrou, menos o estorno na própria janela, e o
    estorno feito na janela de um pagamento de FORA dela como linha negativa
    (com os dados do pagamento: forma, categoria, cliente, atendimento, venda;
    `estorno_de` preenchido). `metrics_receitas_pagas` parte dela, e a despesa
    paga também (núcleo, por unidade, séries, composição, Fechamento, avisos,
    custos da venda, resultado). O contra-lançamento sabe o pagamento que
    estorna (`financial_transactions.estorno_de`, gravado pelas cinco portas do
    estorno; os de antes, ligados pela migration). Sem ligação, a regra de
    antes: os dois lados fora.
  - Os números PASSADOS mudaram nas redes que tiveram estorno noutro dia: na
    produção, 2 estornos em 2 redes — o parcial do crédito da Bruna ([sim]
    Margarida, R$ 136,36) e o cancelamento do plano da Patrícia ([sim] Acácia,
    R$ 630), os dois de 10/11 estornados em 11/11, no mesmo mês.
  - A receita dos atendimentos por EXECUÇÃO (`metrics_receitas_pagas_dos_executados`,
    o dia em que foi feito) não mudou: o pagamento estornado segue fora dela.
  - Prova: `e2e/financeiro-dinheiro-da-12.spec.ts` (paga ontem, estorna hoje —
    parcial, inteiro e o relançado —, os dois Fechamentos, o faturamento do mês
    passado e deste, e o CSV).
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

**Os "novos clientes" contam por quando ela é cliente** (decisão 1 (c) do
Heitor sobre a 8ª simulação, 2026-11-06; A7 — a Lúcia importou 5 anos de base
e o mês contou 32 clientes novas): `coalesce(clients.cliente_desde,
created_at)` em `metrics_core`, `metrics_by_branch`,
`metrics_new_clients_series` e no "cadastrada nos 90 dias" do Reativar
(migration `20261106003502`). A ficha sem "cliente desde" segue pela criação.
**E a arquivada continua contando** (auditoria das regras, 2026-11-18;
decisão do Claude pelos princípios 3 e 5): arquivar não desfaz o fato do
período — as três contas não filtram mais `is_active` (migration
`20261124200005`; regra em `crm-inbox.md`, "Arquivar a cliente").
E o **"Reativar clientes" lê a última visita do sistema de ANTES**
(`clients.ultima_visita_antes`, a coluna da importação): ela conta como visita
(quem veio há 20 dias no sistema antigo não sumiu; quem veio há 120, sim, com
"ultima_visita" = essa data e `antes_do_sistema`), sem virar atendimento —
nenhum outro número (atendimentos, receita, retenção) a lê. **E o quadro diz
isso** (sobra da F35): "Última visita há 120 dias · antes do sistema"
(`[data-antes-do-sistema]`, nos dois dashboards). Prova:
`e2e/importacao-migracao.spec.ts`.
**E a ficha só com a "Última visita" é cliente de antes** (D7 da 25ª
simulação; decisão do Claude pelo princípio 3, cumprindo a 1 (c) do Heitor):
o "é cliente antes do corte" do Reativar (o "cadastrada há mais de 90 dias")
e do público "sem retorno" (`cliente_desde_antes`) é
`least(coalesce(cliente_desde, created_at), ultima_visita_antes)` — a
importada sem "Cliente desde" ficava com o cadastro de hoje e saía das duas
listas (migration `20261125000001`). Os "novos clientes" e o selo "Novo"
seguem por `coalesce(cliente_desde, created_at)`.

**Todo indicador tem valor esperado escrito à mão** em
`e2e/indicadores-cenario.spec.ts` (unidade `[e2e]` + janela em 2021, antes de
qualquer dado real). `relatorios-coerencia` prova que tela e RPC concordam;
aquele prova que estão CERTOS. Mexeu numa `metrics_*`, o cenário tem de continuar
batendo — ou mudar junto, com o porquê.

**"Novos clientes" só existe na REDE** (o Heitor, 2026-11-18, 24ª simulação —
resolve a A44): a cliente é da rede, e nenhuma unidade "tem" clientes novas.
`new_clients` de `metrics_core`, `metrics_by_branch` e
`metrics_new_clients_series` é NULO fora do recorte da rede inteira (nulo ou
todas as unidades ativas, `public.recorte_e_a_clinica`; na rede de UMA
unidade, a unidade é a rede e o número existe) — migration
`20261123600001`. A tela esconde o que é nulo (`newClients: number | null`
em `lib/metrics/queries.ts`): o cartão "Novos clientes", a etapa "Novos
clientes" dos quadros de clientes, a coluna "Novos" do ranking de unidades e
o gráfico "Novos clientes ao longo do tempo" dos Relatórios. O quadro da
unidade diz "Os agendamentos da unidade". ~~As clientes novas ATENDIDAS na
unidade~~ (T1/H16 do Bloco Tags, 2026-11-14) era uma leitura do Claude, não
uma regra do Heitor, e saiu; antes dela, a tag "Unidade: X" (C6 da F68) e a
unidade de cadastro (`clients.branch_id`).

**Uma regra de receita, e toda soma de dinheiro parte dela.**
`metrics_receitas_pagas` (migration `20260927000011`) é o conjunto canônico —
INCOME pago, eixo em `paid_at`, o estorno no dia dele (desde a F59,
`metrics_movimentos_pagos`: "Estorno: cada lado no seu dia", acima) — e é o
mesmo conjunto de `metrics_core.revenue_cash`. Ele pode trazer linhas
NEGATIVAS (o estorno de um pagamento de fora da janela, com `estorno_de`):
quem SOMA já sai certo; quem lista ENTRADAS (o Fechamento, "Por quem recebeu")
separa pelo `estorno_de`. Receita por unidade, por forma de
pagamento, por categoria, gasto por cliente e LTV saem DELE. Até 2026-09-27 os
relatórios somavam esses gráficos por `created_at` e com estorno, ao lado de um
KPI que não fazia nenhum dos dois.
- **Pagar com CRÉDITO INTERNO não é receita** (F7 da 5ª, 2026-11-02; achado
  da F2b): o dinheiro entrou quando a cliente pagou (o Pix do pacote que
  virou crédito fica), e o crédito é só o saldo dela. O lançamento pago com
  `payment_method = 'INTERNAL_CREDIT'` sai da fonte única e das contas que
  repetem o predicado dela — `metrics_receitas_pagas`, `metrics_core`,
  `metrics_by_branch`, `metrics_series`, `metrics_top_clients` e a composição
  (migration `20261101000702`). Contava duas vezes: R$ 600 de receita para
  R$ 300 que entraram. Função nova que soma receita paga parte de
  `metrics_receitas_pagas` ou repete o predicado INTEIRO, com o crédito
  interno fora. Prova: `e2e/indicadores-credito-interno.spec.ts`.
- **O Crédito interno VENDIDO é receita no dia em que o dinheiro entrou**
  (decisão 1 do Heitor sobre a 9ª simulação, 2026-11-07; princípio 5;
  `vendas-financeiro.md` §9.3.4): o lançamento pago da venda do "vale"
  (`credito_vendido_id`) é receita paga com cliente — a regra única o conta
  sem mudança (caixa, Fechamento, faturamento, ticket, LTV). O uso depois é
  o pagamento com crédito interno, fora da receita (acima). Em Relatórios →
  Vendas ele é uma LINHA (a comanda dele, desde o RL1, 2026-11-14) e conta no
  "Total vendido"; o que se paga com ele não conta de novo (o Heitor, 25/11:
  "se o crédito foi vendido, é venda, tem que contar, não conta é quando só
  usa"; abaixo, em Vendas). Prova:
  `e2e/vendas-credito-interno.spec.ts`, `e2e/relatorio-vendas-comandas.spec.ts`.
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
  relatórios. **Entra no lucro** (o Heitor, 2026-10-29; acima, em
  "Lucro e margem") — e a movimentação de estoque NUNCA gera despesa (D13
  revisto, 2026-10-28): a compra paga, se a rede quiser no caixa, é um
  lançamento manual na categoria "Compra de estoque", que fica fora do lucro
  (desenho do Claude, para o produto não sair duas vezes; ele não o fechou).
  O ponto do gráfico "Evolução do Período" vem pronto de `pontosDaEvolucao`
  (`lib/metrics/evolucao.ts`), com o custo do LUCRO (a despesa sem a compra
  de estoque, mais o insumo consumido). O DRE tem a linha "− Insumos
  consumidos"; o KPI de consumo diz "Desconta do lucro". **Um nome para
  cada conta** (A54 e "Reforça", item 2, 2026-11-02): o cartão do dashboard
  da rede é "Despesas pagas do mês" (o caixa, decisão 5d), a linha do gráfico
  é "Custo do lucro", e o cartão de Relatórios → Financeiro é "Insumos e
  produtos vendidos" — o MESMO número do DRE (`metrics_resultado`); era
  "Custo do mês R$ 0" ao lado do gráfico "Custo R$ 445", e "Consumo de
  insumos R$ 380" ao lado do DRE de R$ 445. Prova:
  `e2e/indicadores-custo-um-nome-so.spec.ts`. **E a legenda diz o que o
  "Custo do lucro" soma** (A39 da 11ª simulação, 2026-11-10; princípio 3):
  embaixo dela, "Custo do lucro = despesas operacionais + insumos e produtos
  vendidos + taxas da maquininha + comissões lançadas."
  (`[data-custo-do-lucro-soma]`, `DEFINICOES.custoDoLucro`, com o resto na
  dica). O nome e a conta não mudaram. Prova: o mesmo spec. O cartão do caixa no Financeiro
  (unidade e rede) e na Visão geral dos Relatórios é "Despesas pagas (caixa)",
  com a compra de estoque e o pagamento das comissões, que o lucro não desconta
  (A24 da 10ª simulação, 2026-11-10; `vendas-financeiro.md` §9.6). O DRE não explica de que se compõe o cartão: a nota da A11 da 33ª saiu em 26/11
  (o Heitor, 26/11: "isso não é ser intuitivo, é ser explicativo e não isso que eu quero"); prova `tests/telas-sem-texto-que-explica.test.ts`. **E o cartão diz o que soma, e
  a tela diz o que fica fora** (A50 da 7ª simulação, 2026-11-05: "Insumos e
  produtos R$ 495" sem legenda, e a perda de R$ 380 fora do lucro parecia
  erro — é a regra F7): o cartão tem a dica `DEFINICOES.insumosEProdutos` (o
  insumo dos atendimentos ao custo de consumo + o custo do produto vendido) e,
  embaixo do DRE, "A perda e o ajuste de estoque ficam fora do lucro…"
  (`[data-fora-do-lucro]`). Prova: `e2e/estoque-atritos-da-7.spec.ts` ("A50"). De 2026-10-27 a
  10-29 o consumo era informativo e o custo do gráfico, a despesa paga (D2).
- **`lib/metrics` para a tela quando o RPC falha** (`logRpcError` lança). Ele
  registrava e devolvia zero — "R$ 0,00" com cara de dado.
- ⚠️ **Migration que cria função termina com `notify pgrst, 'reload schema'`.**
  Sem isso, parte das réplicas do PostgREST não conhece a função nova por um
  tempo e a chamada falha às vezes (visto em 2026-09-27: 1 em 3 rodadas).

**O que fica fora da receita dos atendimentos, a tela diz** (A47 e A43 da 8ª
simulação, 2026-11-06; a regra F18 fica — a receita dos atendimentos é a PAGA,
e o crédito interno não é receita, F7): nas tabelas por procedimento e por
profissional dos Relatórios, embaixo da receita, "R$ 160,00 concluídos sem
pagamento (1)" e "R$ 450,00 pagos com crédito interno (não é receita)"
(`[data-sem-receita]`) — `metrics_atendimentos_sem_receita` (o avulso
concluído no período, o conjunto de `atendimentos_a_receber`; migration
`20261106003803`) → `getAtendimentosSemReceita`. A Rafaela via R$ 474 de
comissão e a receita sem o atendimento pago com crédito, sem nota. Prova:
`e2e/relatorios-atritos-da-8.spec.ts`.

**Relatório de vendas** (aba Vendas, 2026-10-14): cada venda do período, uma
linha — `metrics_vendas` (migration `20261014000001`), paginada por
`metrics_vendas_pagina` e totalizada por `metrics_vendas_resumo` (por tipo e
geral; a tela não soma). Venda é o fato COMERCIAL, não o dinheiro — mas
**só o que foi pago é venda**:
- **Não pago não conta na venda** (D6, o Heitor, 18/11, sobre a 25ª
  simulação: "nao pago nao conta na venda"; a mesma fala do plano: "Uma coisa
  só foi vendida se foi paga."). TODO tipo segue a régua do plano: a venda
  entra quando há dinheiro PAGO dela — o primeiro lançamento de receita ligado
  a ela (o avulso por `appointment_id`, o pacote por `client_package_id`, o
  pré-pago por `procedure_sale_id`, o produto por `product_sale_id`, o crédito
  por `credito_vendido_id`, o plano por `treatment_plan_id`) que está pago,
  não é estorno nem estornado e tem algum valor (dinheiro, ou os pontos e o
  voucher, `loyalty_discount`) — e na DATA desse recebimento
  (`min(coalesce(paid_at, created_at))`), a mesma para os seis tipos baterem
  entre si. O concluído aguardando o pagamento, o pacote e o pré-pago só com
  parcela em aberto e o produto a receber ficam FORA até a primeira parcela
  ser paga; o que teve o único pagamento estornado inteiro também sai. O
  VALOR de cada tipo não muda (o vendido, menos o cancelado, o devolvido e o
  desconto: o parcelado entra inteiro no dia da primeira parcela paga), nem o
  "Quem vendeu". O pago com crédito interno NÃO faz a venda (abaixo, 25/11).
  Migration `20261125100001` (troca de trechos no corpo vivo de `metrics_vendas`);
  na produção de 18/11, o avulso caía de 33 para 31, o pacote de 24 para 23 e
  o pré-pago de 7 para 5. O que lê as vendas segue sozinho: a aba, o CSV e o
  Copilot (`getResumoDeVendas`/`getVendas`). A comissão do avulso já era do
  atendimento pago (`comissoes.md`), e o caixa, o faturamento e o "Meu
  faturamento" são dinheiro recebido (princípio 5): nada disso mudou. Prova:
  `tests/vendas-so-o-pago.test.ts`, `e2e/relatorio-vendas-so-o-pago.spec.ts`.
- **Cada linha é uma COMANDA do PDV** (RL1 da revisão do Heitor, 2026-11-14:
  "rl1 ok"): atendimento avulso, pacote, pré-pago, plano, produto e crédito
  interno, com o número da comanda (`metrics_vendas.comanda`, coluna
  "Comanda" na tela e no CSV; "—" na venda de antes do PDV). O produto vendido
  dentro do atendimento leva o número da comanda do atendimento
  (`comanda_itens.product_sale_id`). O filtro por tipo tem os seis
  ("Atendimentos avulsos", "Pacotes", "Pré-pagos", "Planos", "Produtos",
  "Créditos"). Migration `20261115700003`.
- **O Crédito interno vendido** (`creditos_vendidos`, tipo `CREDITO`, na
  data do pagamento — D6 —, o valor menos o devolvido; o estornado inteiro sai) é
  VENDA: aparece na lista e no CSV e o "Total vendido" o soma (o Heitor, 25/11:
  "se o crédito foi vendido, é venda, tem que contar, não conta é quando só
  usa"; era o contrário desde o RL1, decisão do Claude de 14/11). O que conta
  uma vez só é o USO: o lançamento pago com crédito interno
  (`payment_method = 'INTERNAL_CREDIT'`) não faz venda nenhuma entrar — a régua
  do primeiro recebimento pago (D6) o pula, e a venda paga só com crédito fica
  fora — e sai do valor da linha (a paga em parte vale o resto, no dia do
  primeiro dinheiro). Decisão do Claude, 25/11, pela fala: a parte paga com
  crédito sai da linha da venda, não do crédito (o crédito vendido é a venda;
  o uso é que não é). Migration `20261208500001` (troca no corpo vivo de
  `metrics_vendas`; `metrics_vendas_resumo` devolve o geral com todos os
  tipos e `linhas`, a paginação). A tela não tem mais o "Fora do total". O crédito não
  tem quem vendeu: no recorte por profissional ("venda dela") ele não entra. Prova:
  `e2e/relatorio-vendas-comandas.spec.ts`, `e2e/relatorio-vendas-so-o-pago.spec.ts`,
  `tests/vendas-credito-vendido-conta-e-o-uso-nao.test.ts`.
  A dica do Total vendido (`[data-ponte-vendas-caixa]`) diz também que o
  voucher e os pontos pagam parte da venda e não entram no caixa, e que o
  desconto fica fora dos dois (A31 da 20ª; sem número: não há métrica dele).
- **Atendimento avulso** (era "Procedimento"): atendimento concluído, com preço, que não consumiu
  nada já vendido. A sessão de pacote, a unidade pré-paga e a sessão de plano
  não são venda de novo. Data: a do primeiro recebimento pago (D6; era
  `aconteceu_em`, o dia em que aconteceu — o concluído não pago entrava);
  vale o preço menos o desconto comercial da venda (`sale_discount`; ponto
  é forma de pagamento, não desconto).
- **Pacote** (o vendido, quem vendeu) e **pré-pago** (o vendido, quem
  vendeu), no dia do primeiro recebimento pago (D6; eram `purchased_at` e
  `sold_at`). O parcelado é UMA venda.
- **Produto** (D4, 2026-10-30): no dia do primeiro recebimento pago (D6;
  era `product_sales.sold_at`), o vendido, quem
  vendeu; a quantidade são as embalagens ("3× Sérum"). A venda ESTORNADA sai
  (o Heitor, 18/11: "Uma coisa só foi vendida se foi paga"; sair também do
  mês dela é decisão do Claude na F3): era R$ 6.013 contra R$ 5.915 na 5ª simulação. **A
  devolvida em PARTE vale o que ficou** (A34 da 8ª, 2026-11-06): o valor é
  `price − valor_devolvido` e a quantidade, as unidades que ficaram com a
  cliente; o custo dela no lucro é `custo − custo_devolvido`, e o que voltou
  sem voltar ao estoque é perda ("Venda estornada (não voltou)", no dia da
  devolução) — `metrics_vendas`, `metrics_resultado`,
  `metrics_series_do_resultado`, `metrics_perdas` (migration
  `20261106003802`; `vendas-financeiro.md` §9.3.3).
- **O pacote TRAZIDO DE FORA não é venda** (decisão 1 do Heitor sobre a 8ª
  simulação, 2026-11-06; `vendas-financeiro.md` §9.3.1): `metrics_vendas`
  tira o `client_packages.de_fora` (migration `20261106003501`). Ele também
  não está no caixa, no faturamento nem no ticket (não tem lançamento). A
  sessão dele feita entra na receita dos ATENDIMENTOS (a execução) pela parte
  no valor de referência (`package_sessions.preco`, r2-ind-01) — sem valor,
  nada. Prova: `e2e/pacote-de-fora.spec.ts`.
- **Pacote CANCELADO e pré-pago com unidade cancelada valem o que ficou**
  (F2b, 2026-11-01; migration `20261101000252`): o pacote, `price −
  valor_cancelado` (o usado), e o pré-pago, o vendido menos as unidades
  canceladas — na data do primeiro recebimento pago (D6). O que caiu inteiro (nenhuma sessão feita,
  todas as unidades canceladas) sai das Vendas e do CSV. Estornar só um
  LANÇAMENTO do pacote (o pagamento errado) não muda o VALOR da venda; se era
  o ÚNICO pagamento, a venda sai até outro ser pago (D6), e a data passa a ser
  a do primeiro pagamento que ficou.
- **Plano**: a data é a do PRIMEIRO RECEBIMENTO PAGO dele — o primeiro
  lançamento de receita do plano (`financial_transactions.treatment_plan_id`)
  pago, que não é estorno nem estornado, com algum valor; o dia é o do
  pagamento (`paid_at`). O Heitor, 18/11: "Obviamente que no recebimento. Uma
  coisa só foi vendida se foi paga." Era o `aceito_em` até 13/11 e, depois, o
  primeiro lançamento pago ou não (no crediário, a parcela em aberto já fazia
  a venda); a régua do pago é a do "Comprou" do CRM
  (`private.plano_pagamento_que_vale`), escrita por extenso em
  `metrics_vendas` — leitura do Claude da fala do Heitor, na 25ª simulação
  (migration `20261124900002`). O aceito que nunca foi pago não aparece. Vale
  a soma dos procedimentos dele (já com o desconto rateado). Prova:
  `e2e/relatorio-vendas-plano-no-recebimento.spec.ts`. **O plano cancelado vale o que foi usado, como o
  pacote** (D4 da 9ª simulação, decisão 2 do Heitor, 2026-11-07; migration
  `20261107004103`): a soma menos `treatment_plans.valor_cancelado`; o que caiu
  inteiro sai. O cancelado antes desta regra (sem `cancelado_em`) segue fora. **É de quem
  VENDEU** (D14 da 8ª simulação, 2026-11-06): a coluna "Profissional" é o
  "Quem vendeu" do checkout (`treatment_plans.vendido_por`). Era sempre a
  responsável — a "Dra. Paula" no plano que a Marta vendeu. O recorte por
  profissional ("venda dela") segue a mesma pessoa (migration `20261106003404`). **Sem "Quem vendeu", a venda não
  é de ninguém** (com-06, o Heitor: "Campo vazio não gera comissão para
  ninguém"; o campo nasce sempre vazio, r2-ven-12): fica no total, sem nome na
  coluna e fora da "venda dela" de todas — como o pacote, o pré-pago e o
  produto sem `sold_by`. Até a auditoria de 18/11 ia para a responsável pelo
  plano, que ninguém escolheu (migration `20261124250001`). Prova:
  `e2e/relatorio-vendas-plano-de-quem-vendeu.spec.ts`,
  `tests/vendas-plano-sem-vendedor.test.ts`.
- A lista e o total fecham no `fullTo`. A exportação (`/api/relatorios/vendas`,
  CSV: `Data;Comanda;Tipo;Descrição;Cliente;Profissional;Unidade;Valor`,
  `colunasDoCsvDeVendas`) leva o mesmo recorte sem página e se defende sozinha: sessão, a aba no
  cargo, a unidade ao alcance; a rede inteira só para quem vê o consolidado.
  O NOME do arquivo diz o primeiro e o último dia no fuso do negócio
  (`nomeDoCsvDeVendas`, J-53 de 2026-10-30): outubro é
  "vendas-2026-10-01-a-2026-10-31.csv" — saía "…-a-2026-11-01", o fim do
  período em UTC.
- Quem já via a aba Financeiro ganhou a Vendas na migration; daí em diante ela
  se marca em Cargos. Prova: `e2e/relatorio-vendas.spec.ts`.

**A rede de UMA unidade só não vê os quadros de rede** (D-19, decisão do Heitor,
2026-10-29: "Com UMA unidade ativa, somem os termos e gráficos de rede
('TOTAL REDE', 'por filial', os rankings de filial, 'Voltar para a rede') e o
seletor de unidade. O modelo não muda: tudo volta quando nascer a segunda
unidade."). A régua é UMA: `redeTemUmaUnidade(tenantId)`
(`lib/unidades/uma-so.ts`, as unidades ATIVAS pelo cache
`getCachedNetworkBranches`, tag `branches:<rede>` — criar, editar e
ativar/desativar unidade a expiram na hora); a tela que já tem a lista das
ativas usa `umaUnidadeSo(n)`, a mesma regra. Com uma unidade: o dashboard da
rede é "Visão geral" (sem "N unidades"), sem o "Ranking de unidades", com
"Hoje" e "Aproveitamento" (era "Ocupação"; ind-13, 2026-11-02: a
ocupação da unidade é outra conta — conta outra, nome outro); o financeiro da rede sem "Por unidade", "Total rede" e o
filtro de unidade; Relatórios com o nome da unidade no lugar de "Rede" e sem
"Faturamento por Unidade" (também o "— Período Atual/Anterior" da aba
Financeiro), "Comparativo por Unidade" e "Saúde do Estoque por Unidade" — nos
Relatórios da rede e nos da unidade (D5 da 34ª: a página da unidade passa
`redeTemUmaUnidade`); o estoque sem
"Consolidado / Por unidade" e "TOTAL REDE"; o portal da unidade sem "Voltar
para a rede" nem o seletor de unidade. Os números não mudam — só o que só
faz sentido com duas. Seletor de unidade que já some com `length > 1` (agenda
da rede, filtro dos Relatórios, estoque) segue a mesma regra. Prova:
`e2e/rede-de-uma-unidade.spec.ts`. O VOCABULÁRIO das outras telas (o menu,
o cargo "Admin", Equipe, Configurações…) segue a mesma régua desde a F8 da 5ª
simulação (refeita pelo PO2, 16/11): `docs/regras/design.md`, "A rede de UMA
unidade fala o nome dela no rótulo que é só a rede".

**O número diz o que conta** (J-55/J-56, 2026-10-30): a dica `<Dica>`
(`components/shared/dica.tsx`, o "i" que abre a definição) fica ao lado do
número, e o texto mora UM lugar, `lib/metrics/definicoes.ts` (`DEFINICOES`) —
mudou a conta, muda o texto junto. A "Taxa de aproveitamento" (dashboard da
rede: concluídos ÷ marcados ATÉ AGORA) e a "Taxa de Conclusão" (Relatórios →
Agenda: o período inteiro, até o FIM dele, com os que ainda vão acontecer)
dizem por que diferem. As duas contas moram em `lib/metrics/resultado.ts`
(`taxaDeAproveitamento`, `taxaDeConclusao`), e o Copilot as cita prontas, com
o nome e a definição — nunca divide os números da agenda (A41 da 24ª,
`copilot.md`). E a data de cada número (J-56): a receita, a despesa e o
ticket contam pelo dia do PAGAMENTO; os atendimentos, pela hora MARCADA (ou a
conclusão, quando veio antes) — dicas nos cartões do dashboard da rede, do da
unidade e da Visão geral dos Relatórios. Prova: `e2e/indicadores-dicas-das-taxas.spec.ts`.

**O "Status dos agendamentos do período" da Visão geral** (J-57, 2026-10-30)
conta o período INTEIRO, até o fim dele (o núcleo com `fullTo`, a janela da
aba Agenda), com a fatia "Em aberto" — era só até agora, e com 7 no mês
mostrava 80% concluídos e 20% cancelados, sem os 2 por vir. As fatias são
`statusDosAgendamentos` (`lib/metrics/resultado.ts`), as mesmas da aba
Agenda; cada uma diz quantos e o percentual. Prova:
`e2e/relatorios-status-com-os-abertos.spec.ts`.

**O "Mais realizado"** (Relatórios → Procedimentos, J-58, 2026-10-30) é
`maisRealizado` (`lib/metrics/resultado.ts`): o de mais execuções; no empate,
o de maior RECEITA ("empatou em execuções; desempate pela receita"); e,
empatando também nela, todos os empatados ("A e B · Empate: 3 execuções
cada"). Era a ordem alfabética, calada. Prova:
`e2e/relatorios-mais-realizado-empate.spec.ts`, `tests/metrics-status-e-mais-realizado.test.ts`.

**O dashboard da rede recorta a unidade do `?unidade=<id|slug>`** (J-54,
2026-10-30; o drill-down do CLAUDE.md §6, que ele ignorava): o título é a
unidade, os números são os dela (o núcleo, as séries, os rankings, o hoje, o
estoque — `branchIds` dela), os quadros "por unidade" saem como na rede de
uma unidade só, e "Ver a rede inteira" volta guardando o período. A
abrangência vence o pedido (`ctx.branchId ?? unidade`); valor desconhecido cai
na rede; com uma unidade só (D-19) não há recorte. O nome da unidade no
"Ranking de unidades" leva a esse recorte. O funil de oportunidades continua o
da rede. Clientes do /admin NÃO recorta: a cliente é da rede (CL2 do Bloco
Tags, 2026-11-14) — sem filtro nem contador por unidade; o contador é o da
rede (`getClientesAtivos`, contado no banco; o "2 ativos na Zona Sul" da A24
da 5ª saiu com a tag). Prova: `e2e/tags-sem-unidade.spec.ts` ("CL1/CL2").
Os **Relatórios** também (A57 da 5ª, 2026-11-02): `?unidade=<id|endereço>`,
com `?branch=<id>` como apelido, e o seletor de unidade grava `?unidade=`
(prova: `e2e/relatorios-unidade-na-url.spec.ts`). **E o endereço em português
leva a eles** (A47 da 11ª, 2026-11-10: `/admin/relatorios` dava 404):
`/admin/relatorios` e `/[slug]/relatorios` são o redirect de uma linha para
`…/reports`, com a URL que veio (CLAUDE.md §6, "caminho antigo vira
redirect"). Prova: `e2e/relatorios-atritos-da-11.spec.ts`.
Prova: `e2e/indicadores-unidade-na-url.spec.ts`.
Recortado a uma unidade, o total de clientes continua o da REDE (H5: "a
cliente é da clínica") — e a tela diz "N clientes da rede" no subtítulo e
no cartão de novos clientes (A42 da 6ª simulação, 2026-11-04: "13 clientes"
em cada unidade parecia ser de cada uma). Prova: o mesmo spec.

**O mapa do dashboard enquadra as UNIDADES** (D15 da 5ª, 2026-11-02): a
unidade é localizada pelo CEP dela (a cidade só sem CEP —
`ondeGeocodificarAUnidade`), e o mapa abre nos limites das unidades e das
clientes (`enquadramentoDoMapa`, `components/admin/hotmap-types.ts`); tudo no
mesmo ponto centraliza com zoom de bairro. Pela cidade, Moinhos e Zona Sul
caíam no mesmo ponto e o mapa abria só na Zona Sul. Prova:
`tests/mapa-enquadra-as-unidades.test.ts` (o geocoding é externo).
**E um marcador não esconde o outro** (A19 da 8ª simulação, 2026-11-06: a
Água Verde ficava atrás do Batel): as unidades no mesmo ponto (~150 m) se
afastam um pouco em volta dele e o nome diz "(local aproximado)"; as que estão
perto (~3 km) ficam onde estão, com os nomes em lados diferentes
(`marcadoresDasUnidades`, puro). Prova: `tests/mapa-unidades-proximas.test.ts`.
**O CEP que o geocoding não acha, com a cidade achada, não avisa** (A37 da
26ª, 2026-11-18, decisão do Claude): o marcador fica no centro da cidade
como sempre, e o aviso "no centro da cidade" saía em toda unidade de CEP
novo, sem nada a corrigir. Só a unidade que não se localiza nem pela cidade
avisa: "X sem localização: confira o CEP … e a cidade." (`avisosDoMapa`,
`components/admin/hotmap-types.ts`). Prova: `tests/mapa-unidades-proximas.test.ts`,
`tests/atritos-da-18-atendimento.test.ts`.

**A aba fora da permissão leva à primeira dela, com o aviso** (A21 da 26ª,
2026-11-18): `?tab=` de uma aba que a permissão não abre (ou que não existe)
abria outra calada, com a URL da pedida. As duas páginas de Relatórios
redirecionam (`destinoDaAbaPedida`, `lib/relatorios/aba-pedida.ts`) à
primeira aba da permissão na ordem de `ALL_REPORT_TABS`, mantendo o período,
a unidade e as tags, com `?aviso=aba-de-relatorio` (ou
`aba-de-relatorio-inexistente`), que o `<AvisoDaUrl>` mostra e tira da URL.
Prova: `tests/relatorios-financeiro-pede-o-financeiro.test.ts`,
`e2e/relatorios-unidade-na-url.spec.ts`.

**A aba do funil se chama "Oportunidades"** (RL2 do bloco Relatórios, com o
CR1 — a revisão do Heitor de 2026-11-13; antes "Funil comercial", A9 da 6ª
simulação, e antes ainda "Comercial"): o mesmo nome no cargo
(`REPORT_TAB_LABELS.comercial`, e a dica `REPORT_TAB_HINTS`) e na tela de
Relatórios, que o lê de lá. A tela fala em oportunidades: "Oportunidades
recebidas", "Funil de oportunidades", a coluna "Oportunidades" do ranking e
da conversão por origem; o dashboard, "Funil de oportunidades por etapa". A
CHAVE continua `comercial` (no banco, `role_report_tabs.tab`, e na URL,
`?tab=comercial`): trocar só o rótulo resolve, sem migrar dado nem quebrar
link (princípio 7). Prova: `tests/aba-comercial-funil.test.ts`,
`e2e/crm-contato-e-oportunidade.spec.ts`.

**Taxa sem denominador é "—", não 0%** (ind-10, revisão de 2026-11-02:
"0% diz que foi ruim; '—' diz que não houve"): a taxa de conclusão (no
total e por unidade), a retenção e o giro dos Relatórios mostram "—" quando
a função de `lib/metrics` devolve nulo, como o ticket e a conversão. Prova:
`e2e/relatorios-taxa-sem-denominador.spec.ts`.

**Variação contra o período anterior e a aba Agenda (2026-10-27)**
- Sem período anterior (anterior = 0) não existe variação:
  `variacaoPercentual` (`lib/metrics/resultado.ts`) devolve nulo e a tela diz
  "sem dados anteriores" — dashboard e Relatórios, a mesma regra. Nunca "100%"
  inventado a partir do zero.
- A aba **Agenda** dos Relatórios é uma LISTA do período: o núcleo e
  `metrics_relatorio` dela fecham no `fullTo`, com os agendamentos futuros e
  os cancelados do período, e a tela avisa. As demais abas seguem o dinheiro
  (até agora). Prova: `e2e/indicadores-dashboard-e-agenda.spec.ts`.
- O card **"Clientes no mês"** do dashboard da unidade conta até AGORA
  (revisto pelo Heitor, 2026-10-29: "não se sabe se o que está agendado vai
  acontecer"): é o núcleo do mês até `to`, o mesmo dos cartões, e o subtítulo
  diz "neste mês, até agora". O marcado para mais tarde e o cancelado de
  amanhã ainda não entram. De 2026-10-28 a 10-29 ele fechava no `fullTo`
  (D12). A "Taxa de aproveitamento" da rede segue como está, até agora: é
  "horários PASSADOS concluídos ÷ total marcado". A aba Agenda dos Relatórios
  continua uma LISTA do período, até o fim dele (acima).
  Prova: `e2e/indicadores-uma-conta-so.spec.ts`. **E o quadro diz o recorte**
  (A49 da 8ª simulação, 2026-11-06: "Cancelados 2" no dashboard e 6 nos
  Relatórios, sem dizer por quê): embaixo do "Clientes no mês/no período" (os
  dois dashboards), "Contados até agora, os cancelados e as faltas também.
  Relatórios → Agenda conta o período inteiro, com os que ainda vão acontecer."
  (`[data-recorte-dos-cancelados]`). Prova: `e2e/relatorios-atritos-da-8.spec.ts`.
  **Sem a Agenda, o quadro não mostra as etapas dela** (A32 da 24ª: o núcleo
  não conta os agendamentos para quem não tem a Agenda, e o quadro dizia
  "Agendamentos 0" num dia de 4): `etapasDoQueOCargoVe`
  (`lib/dashboard/etapas-do-ciclo.ts`), nos dois dashboards.
  **E diz os que ainda vêm hoje** (A12 da 16ª: "Agendamentos 0" com 2
  marcados para mais tarde): o recorte "até agora" continua, e a etapa
  Agendamentos do dashboard da unidade leva "2 ainda hoje"
  (`aindaHojeNaAgenda`, `lib/metrics/agenda-do-dia.ts`: os de hoje depois de
  agora, sem os cancelados e as faltas — e sem os concluídos e os em
  atendimento, D6 da 18ª: o concluído adiantado contava como "ainda hoje";
  `[data-nota-da-etapa]`).
- O gráfico de evolução do dashboard da rede sai de `pontosDaEvolucao`, como o
  dos Relatórios. **Cada ponto diz o que é** (A44 da 6ª simulação,
  2026-11-04): `rotulo` — "03h" na série por hora (o "Hoje"), a DATA ("04/11",
  no fuso do negócio) na série por dia; o tooltip e o eixo o usam. Era "Dia
  {eixo}" sempre: no "Hoje" de madrugada, o hover das 03h dizia "DIA 3", e por
  dia o eixo era o dia do período (1, 2, 3…), não a data. Prova:
  `tests/metrics-evolucao.test.ts`.
  **E o eixo não repete rótulo, nem a curva inventa valor** (A52 da 9ª
  simulação, 2026-11-07): o eixo dizia "2k, 2k" (o 1.500 arredondado ao lado
  do 2.000), e a curva suavizada parecia subir antes do primeiro dia com valor.
  O rótulo curto do eixo guarda a casa decimal ("1,5k" — `rotuloDoEixo`,
  `lib/chart-utils.ts`, também nos Relatórios e no fluxo de caixa), e a
  curva é reta entre os pontos (`CURVA_DA_EVOLUCAO`), com o ponto de cada dia
  à vista (até 45 pontos). Prova: `tests/eixo-dos-graficos.test.ts`.
- **O dashboard da rede tem os quadros de clientes da unidade** (F7b, H3: "a
  dona vê tudo, sempre"): "Clientes no período" (o mesmo núcleo dos cartões,
  no período escolhido, até agora) e "Reativar clientes". Na rede, as
  sumidas da REDE inteira — sem visita em NENHUMA unidade há 90 dias
  (`metrics_clientes_para_reativar_rede` → `getClientesParaReativarDaRede`,
  migration `20261102000702`): quem foi a outra unidade não está sumida —,
  com a unidade de cada uma (a da última visita concluída; quem nunca veio,
  sem unidade — a do cadastro saiu na 24ª). **É sempre o da rede**, em
  qualquer portal e com o `?unidade=` (o Heitor, 2026-11-18, 24ª: a
  cliente é da rede): o quadro da unidade que contava "as atendidas nela"
  (T1 do Bloco Tags) saiu com a regra dos novos clientes, acima. Na rede de
  UMA unidade, a unidade de cada linha não aparece (r2-ind-03, D-19).
  Prova: `e2e/indicadores-reativar-clientes-da-rede.spec.ts` ("r2-ind-03").
  A cliente cadastrada há pouco e sem visita não entra: cliente nova não é
  cliente sumida (2026-10-20; o caso "cadastrada há pouco" do mesmo spec). A
  função por unidade (`metrics_clientes_para_reativar`), que nenhuma tela
  usava, saiu (o Heitor, 25/11: "ok mas tenha certeza absoluta que não é
  usada"; migration `20261206700001`).
  **O vazio diz o que é** (D16 da 8ª simulação, 2026-11-06): o quadro conta
  quem SUMIU (cadastrada antes dos 90 dias, sem visita neles), e com a base
  importada no dia dizia "Todos os clientes retornaram 🎉" para 30 clientes que
  nunca vieram. As duas contas devolvem também `com_visita` (as do recorte com
  alguma visita concluída) e `recentes_sem_visita` (as cadastradas nos 90 dias
  sem nenhuma — migration `20261106003405`), e o vazio diz "Nenhuma cliente tem
  visita registrada ainda (30 clientes cadastradas nos últimos 90 dias)…" ou
  "Ninguém sumiu: quem já veio voltou nos últimos 90 dias 🎉 2 clientes
  cadastradas nos últimos 90 dias ainda não têm visita." (`vazioDoReativar`,
  `quadros-de-clientes.tsx`). Prova: `e2e/indicadores-reativar-sem-visita.spec.ts`.
  **E diz o recorte e o resto** (A35 da 10ª simulação, 2026-11-10: "Ver 5
  clientes inativos" parecia o total): "Sem visita há mais de 90 dias — quem
  tem horário marcado não entra", e o link "Ver mais 5 (8 no total)". A conta
  não mudou. Prova: `e2e/ficha-uso-da-10.spec.ts` ("A35").
  **E o Copilot dá a mesma resposta** (r3-f13-10, o Heitor, 2026-11-03: "os
  dois têm de dar a mesma resposta"): a escolha entre a conta da unidade e a
  da rede mora num lugar só, `getClientesParaReativarDoRecorte` (desde a 24ª,
  sempre a da rede)
  (`lib/metrics/unidade.ts`), que os dois dashboards e o "sem visita" do
  Copilot chamam (sem recorte por profissional, também na vista pessoal). O Copilot, sem
  unidade, juntava as listas de cada unidade pela tag e deixava de fora a
  cliente sem a tag. Prova: `tests/reativar-clientes-uma-regra.test.ts` (ninguém
  fora de lá chama as duas contas), o caso r3-f13-10 de
  `e2e/copilot-novidades.spec.ts` (contra o build). O desenho é um só nos dois
  portais (`components/shared/quadros-de-clientes.tsx`). Prova:
  `e2e/indicadores-reativar-clientes-da-rede.spec.ts`.

**Os números seguem a abrangência, não o dono** (SM1 e SM4, 2026-11-23; era
o "Cada número segue o escopo do SEU módulo" de 29/10): quem tem o módulo vê
os números de todos, nas unidades ao alcance — as dela, ou a rede toda com
"A rede inteira". As abas de Relatórios do cargo continuam (`podeVerRelatorio`).
Os Relatórios e o Copilot não recortam por pessoa nenhuma. **O único recorte
por pessoa é a vista pessoal dos dashboards** (SM2): `recortePessoal(ctx)`
(`lib/metrics/escopo.ts`) → `{ agenda, financeiro, crm: null }` — a AGENDA e
as CLIENTES dela (atendimentos, agendamentos, minutos, clientes) a quem ATENDE
sem a Agenda (`vistaPessoal(ctx, 'agenda')`); o DINHEIRO dela (receita,
ticket, comissões, a evolução, os rankings de VALOR, o gasto das clientes, o
consumo de insumo) a quem atende ou tem comissão de venda sem o Financeiro
(`vistaPessoal(ctx, 'financial')`); o CRM não tem vista pessoal (quem quer só
as suas usa o filtro de responsável). A vista só existe com a funcionalidade
no plano. As funções do banco recebem UM profissional, e com os dois
recortes diferentes pedem-se os dois e juntam-se (`juntarNucleos`,
`getCoreDosModulos` em `lib/metrics/dos-modulos.ts`). Escondido na vista
pessoal do dinheiro: o que não se atribui a ela (custo, lucro, margem, a
comissão das outras, o ranking de unidades). Os parágrafos abaixo (28/10)
descrevem os PREDICADOS de "o que é dela", que valem na vista pessoal.

**O dinheiro do dashboard da rede é de quem vê o dinheiro** (D2 da 6ª
simulação, 2026-11-04; sobra da F7 — o exemplo do CLAUDE.md §11, "o time
comercial vê o funil sem ver o faturamento"): o faturamento, o custo, o lucro,
o ticket, a evolução, o ranking de unidades, os rankings de procedimento e de
profissional por receita e por margem, o "Valor gasto" das clientes e o LTV
por CEP vão a quem tem o Financeiro OU a aba Financeiro dos Relatórios
(`veDinheiro = can(ctx, 'financial') || podeVerRelatorio(ctx, 'financeiro')`,
a régua dos Relatórios e do Copilot). Desde 2026-11-23 a aba Financeiro pede
o Financeiro em Ver (abaixo), e a conta é, na prática, só o Financeiro. Sem ela as props vão VAZIAS — o valor
nem chega ao navegador — e a tela esconde os cartões. Quem tinha só a aba
Oportunidades via o gráfico e o ranking de unidades (`can('reports')`), e
quem tinha os Procedimentos, os rankings de receita e margem (`can('procedures')`). O dashboard
da unidade já pedia o Financeiro. Prova:
`e2e/indicadores-dashboard-dinheiro-so-com-financeiro.spec.ts`.

**O dashboard na vista pessoal** (SM2, 2026-11-23; era o "Dashboard com 'só
os meus'", D7 de 28/10): sem o módulo e com a vista pessoal dele (acima), os
números DAQUELE módulo no dashboard são os DELA — o dinheiro nos dois (rede e
unidade; na rede, só a quem não vê o dinheiro de todos), a agenda só no da
unidade — o `professionalId` vai a cada função de `lib/metrics`
(`metrics_core`, `_series`, `_top_procedures`, `_top_professionals`,
`_top_clients`, `_demografia`, `_giro_estoque`, `_clientes_para_reativar_rede`, com
`p_professional_id default null`; migration `20261028000601`). O recorte é
UM, o de `metrics_core`:
- **atendimento dela**: `appointments.professional_id = ela`;
- **dinheiro dela**: a transação ligada a um atendimento dela
  (`appointment_id`) — a evolução e o gráfico dos 6 meses batem com o cartão;
  e, desde 2026-11-02 (decisão do Heitor: "concordo"), a da venda de
  PRODUTO que ela vendeu (`product_sale_id` → `product_sales.sold_by`), como
  nas Vendas — `metrics_receitas_pagas`, `metrics_core`, `metrics_series` e
  `metrics_top_clients` (migration `20261101000703`). Prova:
  `e2e/indicadores-venda-de-produto-de-quem-vendeu.spec.ts`. E desde
  2026-11-03 (r2-ven-15, o Heitor: "o pacote soma inteiro para quem vendeu,
  é óbvio, não faz nem sentido não ser assim") o PACOTE e o PRÉ-PAGO que ela
  vendeu (`client_package_id` → `client_packages.sold_by`,
  `procedure_sale_id` → `procedure_sales.sold_by`; migration
  `20261103001304`), pela regra única: no dia de cada pagamento — o pago à
  vista, inteiro no dia da venda; o crediário, parcela a parcela, quando
  entra. A sessão de pacote (ou a unidade pré-paga) que ela ATENDE não soma
  de novo: a sessão não tem lançamento, e o dinheiro da venda já é de quem
  vendeu. O "Meu faturamento" é de VENDA; o ranking por profissional é de
  EXECUÇÃO (abaixo, "A receita por procedimento e por profissional"). Prova:
  `e2e/indicadores-pacote-de-quem-vendeu-e-de-quem-atendeu.spec.ts`;
- **cliente dela**: quem tem agendamento NÃO CANCELADO com ela numa unidade
  do recorte (o total, os novos clientes, a demografia, a recorrência e o
  gasto). Até 2026-10-28 os novos clientes com profissional eram 0 por
  construção.

Mostram o dela: receita, atendimentos, ticket, a evolução SÓ DA RECEITA (sem
custo nem lucro — `EvolutionChart soReceita`), os rankings de procedimentos
(feitos, recorrência, receita bruta), de profissionais (só a linha dela) e de
clientes (gasto, recorrência), faixa etária, cidades e mapa, o total e os
novos clientes, o giro (o insumo dos atendimentos dela) e, no da
unidade, o "Meu faturamento" dos 6 meses. Os planos aguardando checkout e as
clientes a reativar são os de todos (a cliente é da rede). Fica escondido o que não se atribui
a ela: o custo e o lucro, a margem por procedimento (custo do catálogo), o
ranking e a ocupação por unidade, e o ranking de comissão (de todas). O funil
do dashboard é sempre o de todas as oportunidades (SM3).

**O funil do dashboard abre no funil que tem oportunidade** (A30 da 20ª;
princípio 7): o `?funil=` vale sempre; sem ele, o padrão — e, com o padrão
vazio no período, o primeiro funil ativo com oportunidade (`funilDoDashboard`,
`lib/crm/funil-do-dashboard.ts`). Todos vazios, o padrão. **A aba Comercial
dos Relatórios e o quadro de Oportunidades seguem a mesma regra** (A28 da
23ª: abriam no "Funil de vendas" vazio, com as 8 no Corporal), e lá o último
funil escolhido no seletor vem logo depois do `?funil=` (A34; o cookie de
`lib/crm/funil-lembrado.ts`, que o `FunnelSelect` anota). Prova:
`tests/atritos-da-23-importacao-crm.test.ts`, `e2e/crm-atritos-da-23.spec.ts`.

**O comparecimento conta só o que já devia ter acontecido** (A29 da 23ª;
princípio 4): "Comparecimento 0,0%" era o agendamento comercial de amanhã. Em
`metrics_comercial` (migration `20261123000001`), `considerados` é o não
cancelado com `aconteceu_em <= now()`; sem nenhum, "—" (o `comparecimento`
de `painelComercial` é nulo, e o Copilot diz que não há nenhum).

**A vista pessoal do financeiro é "Minhas comissões"** (A52 e A41 da 6ª
simulação, 2026-11-04; princípio 3; desde a SM2, 2026-11-23, é de quem atende
ou tem comissão de venda e NÃO tem o Financeiro): a tela de Financeiro a leva
às comissões dela (o da rede e o da unidade redirecionam). O menu tem "Minhas
comissões" (`veMinhasComissoes`, `lib/menu.ts` — também na pré-visualização
do cargo), e o
dashboard da unidade tem como destaque "Minhas comissões · a pagar"
(`[data-minhas-comissoes]`, o a pagar e o lançado do período de fechamento
da rede, pelo MESMO `resumoDasComissoes` da tela), que leva a elas. O
faturamento dela continua, com o nome que diz a conta: **"Meu faturamento do
mês"**, e a dica `DEFINICOES.meuFaturamento` explica os três números — o
"Meu faturamento" (a VENDA dela, no dia do pagamento), a receita dos
atendimentos dos Relatórios (a EXECUÇÃO, no dia em que fez) e as comissões (a
parte dela). Prova: `e2e/comissoes-minhas-no-menu.spec.ts`,
`tests/menu.test.ts`. **E diz o que fica fora** (A33 da 10ª simulação,
2026-11-10: a Daniela via a comissão da sessão do plano e não a sessão no
faturamento): na dica do rótulo do número (era embaixo dele; a explicação
mora na dica, o Heitor, 16/11 — `docs/regras/design.md`), "A sessão de pacote,
de plano ou pré-paga que você atende não entra aqui: o dinheiro é de quem
vendeu. Ela aparece nas suas comissões e na receita dos atendimentos dos
Relatórios." (`[data-fora-do-meu-faturamento]`,
`DEFINICOES.foraDoMeuFaturamento`). Prova:
`e2e/comissoes-uso-da-10.spec.ts` ("A33").

As funções dos Relatórios guardam o `p_professional_id default null`, com os
MESMOS predicados (migration `20261028000803`): `metrics_receitas_pagas`,
`metrics_gasto_por_cliente`, `metrics_receita_por_categoria_de_procedimento`,
`metrics_relatorio` e `metrics_vendas` (+ `_pagina`, `_resumo`); os Relatórios
e o **Copilot** (`copilot.md`) passam sempre nulo (SM4, SM5). **Venda dela**
(a do "Meu faturamento") é a pessoa da coluna "Profissional" da venda: quem
atendeu o avulso, quem vendeu o pacote, o pré-pago, o produto e o plano (sem
"Quem vendeu", de ninguém — com-06; D14 da 8ª, abaixo).

**Os Relatórios não recortam por dono** (SM4, 2026-11-23; `reports-bi-section`,
os dois portais; era o "Os Relatórios com 'só os meus'" de 28/10 e o "Agenda
DELA, dinheiro da rede" da ind-05): cada aba mostra os números de todos, nas
unidades que a página manda — e toda unidade pedida tem de estar ao alcance
(`alcancaUnidade`; fora dele, sem acesso). A aba que o cargo não tem não abre
(`podeVerRelatorio`), e as comissões por profissional só vão a quem tem o
Financeiro em Ver.

**Financeiro é uma coisa, vendas é outra** (o Heitor, 2026-11-23: "financeiro
é uma coisa, vendas é outra. financeiro ve entrada/saida/lucro, tudo. vendas é
sobre performance de vendas."; "ok" à proposta):
- A aba **Financeiro** só vale com o módulo Financeiro pelo menos em Ver:
  marcada sem ele, não abre (`podeVerRelatorio` → `abaDeRelatorioVale`,
  `MODULO_DA_ABA` em `lib/permissions.ts`, a regra num lugar só). A aba
  **Vendas** é independente: só a marca.
- Na **Visão geral**, a entrada, a saída e o lucro só com o Financeiro em Ver
  (`cartoesDaVisaoGeral`/`veOCaixaNosRelatorios`, `lib/metrics/visao-geral.ts`).
  Decisão do Claude, cartão a cartão, pela fala: saem sem o Financeiro o
  Faturamento, as Despesas pagas (caixa), o Lucro, a Evolução do Período
  (receita, custo do lucro e lucro por dia), o Faturamento por Unidade e a
  Forma de Pagamento; ficam os Atendimentos (o destaque, sem o Faturamento),
  os Novos Clientes, o Ticket médio (também nas abas Clientes e
  Procedimentos), os Top 5 Procedimentos e Profissionais (a produção dos
  atendimentos, como nas abas deles) e o Status dos agendamentos. O que sai
  nem chega ao navegador (`reports-bi-section` não lê a série e zera o caixa).
- Na aba Vendas, a ponte "Como o Total vendido se liga ao caixa" só mostra o
  valor do caixa com o Financeiro.
- O Copilot segue a mesma divisão (`copilot.md`). Prova:
  `tests/relatorios-financeiro-pede-o-financeiro.test.ts`.

**A receita por procedimento e por profissional é a PAGA dos atendimentos**
(D3 da 5ª simulação, 2026-11-02): o que entrou pela regra única
(`metrics_receitas_pagas`) ligado a um atendimento (`appointment_id`), pelo
procedimento e pela profissional dele — `metrics_top_procedures`,
`metrics_top_professionals`, `metrics_relatorio` (por procedimento, por
profissional e o total `receita_dos_atendimentos`, o card "Receita dos
atendimentos" da aba Procedimentos — era "Receita paga dos atendimentos" — e
o denominador do "% do Total"; `reports-bi-view.tsx`) e
`metrics_receita_por_categoria_de_procedimento` (migration
`20261101000704`). Era a soma do PREÇO dos concluídos com o nome "Receita
bruta"/"Receita Gerada": entravam o avulso concluído e não pago, a sessão de
pacote/pré-pago já vendida e o preço sem o desconto (Laser R$ 1.200 contra
R$ 780 de receita no mês). O nome foi "receita paga"; hoje é "receita dos
atendimentos" (abaixo, r2-ind-01), com a dica
`DEFINICOES.receitaDosAtendimentos`. O produto não é de um atendimento e não
entra aqui; o pacote, o pré-pago e o plano entraram depois, pela sessão feita
(abaixo). **A receita entra no dia da
EXECUÇÃO** (F18, o Heitor: "contar no dia que foi feita"; princípio 5 do
CLAUDE.md): o pagamento do avulso conta no `aconteceu_em` do atendimento
concluído, qualquer que seja o dia em que foi pago — a Limpeza feita em 31/10
e paga em 03/11 é "1 execução · R$ 180" em OUTUBRO, e novembro não mostra
nada dela; o relatório de outubro muda quando o pagamento chega depois
(aceito). A régua é `metrics_receitas_pagas_dos_executados` (o predicado
inteiro da regra única, sobre os lançamentos dos atendimentos concluídos no
período; migration `20261104001801`), nas quatro contas. O caixa, o
faturamento, o Fechamento e o "Meu faturamento" seguem no dia do pagamento
(`metrics_receitas_pagas` não mudou). Assim nenhuma linha fica com valor e 0
execuções. O ranking por receita do dashboard pede a lista larga (50) e
ordena pela receita.
`serviceRevenue` (o preço dos concluídos) continua no núcleo, com o nome
"receita de serviço". Prova: `e2e/indicadores-receita-paga-por-procedimento.spec.ts`.
**A sessão de PACOTE entra pelo rateio** (r2-ind-01, o Heitor, 2026-11-03:
"Somar também o pacote, rateado por sessão feita"): o ranking por
procedimento e por profissional é de EXECUÇÃO, e a sessão de pacote feita
soma a parte dela no preço do pacote (`package_sessions.preco`, o mesmo do
"manter como avulso" do cancelamento), no dia da sessão, para quem ATENDEU —
nas quatro contas da tela (`metrics_top_procedures`,
`metrics_top_professionals`, `metrics_relatorio` por procedimento, por
profissional e `receita_dos_atendimentos`, e
`metrics_receita_por_categoria_de_procedimento`; migration
`20261103001305`). O nome passou a ser "receita dos atendimentos" ("Ranking —
Profissionais por receita dos atendimentos", "Receita dos atendimentos
(de todos)"), e a dica diz que é a conta da EXECUÇÃO — o pago pelos
atendimentos feitos, para quem atendeu, no dia do atendimento (curta desde a
A13 da 38ª: o contraste com o "Meu faturamento" mora na dica dele). Não conta duas vezes: a sessão não tem
lançamento. **E também a unidade PRÉ-PAGA usada e a sessão de PLANO feita**
(r3-f13-07, o Heitor, 2026-11-03: "para quem atende, sessão de pacote, de
pré-pago ou de plano é o mesmo trabalho"; migration `20261103001501`): a
parte da unidade no vendido (`procedure_sale_units.preco` — "3 limpezas por
R$ 450" → R$ 150 por limpeza atendida) e a soma dos procedimentos da sessão
no plano vendido (ACCEPTED/COMPLETED; `treatment_plan_session_procedures
.price`, com o desconto rateado), no dia da sessão, para quem atendeu — nas
mesmas quatro contas. **A sessão FEITA de um plano cancelado continua contando**
(D4 da 9ª, princípio 5: "sem execução, sem valor" — a execução existiu): as
contas aceitam o plano ACCEPTED/COMPLETED e o cancelado pelo "Cancelar plano"
(`cancelado_em`), e só as sessões concluídas entram nelas (migration
`20261107004103`). O plano cancelado antes da regra segue fora.
**No ranking por PROCEDIMENTO, cada procedimento da sessão conta no SEU**
(r4-f15-03, o Heitor, revisão das decisões da F15, 2026-11-03: "dividir pelos
procedimentos da sessão"; migration `20261103001601`): sessão Botox R$ 800 +
Preenchimento R$ 1.200, atendimento marcado "Botox" → Botox R$ 800 e
Preenchimento R$ 1.200, cada um na sua categoria (era Botox R$ 2.000). O
conjunto das quatro contas tem a coluna `procedure_id` (a do procedimento da
sessão no plano; nula no resto, que segue o do atendimento) e a conta por
procedimento lê `coalesce(t.procedure_id, a.procedure_id)`. O ranking de
PROFISSIONAIS e o total não mudam (quem atendeu, R$ 2.000). Nenhuma das duas
tem lançamento ligado ao atendimento, e o "Meu faturamento" (venda) não muda.
Produto segue fora (não é atendimento).
**E cada procedimento da sessão conta a SUA execução** (F16-1, o Heitor,
revisão das decisões da F16, 2026-11-03: "não faz sentido ter 0 execuções e
ter um valor, se não tem execução não tem valor"; migration
`20261103001701`): Botox 1 execução · R$ 800, Preenchimento 1 execução ·
R$ 1.200, no dia da sessão. A régua é UMA, `metrics_procedimentos_executados
(atendimento, procedimento)`: as linhas da sessão do plano vendido
(ACCEPTED/COMPLETED, o recorte da receita) — o mesmo procedimento duas vezes
na sessão são duas execuções, como as duas linhas de comissão —, senão o
procedimento do atendimento. Valem por ela as execuções e a recorrência de
`metrics_top_procedures`, a tabela por procedimento e o volume por faixa
etária de `metrics_relatorio`, e o "Total Execuções" da aba Procedimentos
(`execucoes_total`/`execucoes_total_anterior`; era o número de atendimentos
do núcleo, e deixaria de fechar com a soma da tabela). A NOTA de cada
procedimento é a que a cliente deu A ELE (F17-3, `atendimento.md`):
`metrics_notas_dos_procedimentos(atendimento)` — as notas por procedimento;
sem nenhuma, o do agendamento fica com a nota de procedimento de antes
(`procedure_rating`), quando houver, e o resto fica SEM nota: fora da média,
sem herdar a nota do atendimento (decisão do Claude pelo princípio 4,
2026-11-18, na auditoria das regras — com "Só o atendimento" herdava; migration
`20261123900003`). A configuração e o dashboard dizem isso
(`TEXTO_DA_NOTA_DO_PROCEDIMENTO`). A da profissional (`metrics_top_professionals`) é a do atendimento;
sem ela ("Só cada procedimento"), a média das dos procedimentos daquele
atendimento. A margem por faixa segue o preço do atendimento. O ranking e a tabela por PROFISSIONAL contam
ATENDIMENTOS: a sessão é um atendimento (+1, com os R$ 2.000) — decisão da
F17, confirmada pelo Heitor no levantamento das regras (H11, 2026-11-11,
opção a: "atendimento" é como a rede mede o trabalho da profissional, e a
execução já tem o seu lugar no ranking de procedimentos); a coluna se chama
"Atendimentos". Prova:
`e2e/indicadores-pacote-de-quem-vendeu-e-de-quem-atendeu.spec.ts` (com os
casos r3-f13-07 e r4-f15-03 / F16-1).
**O avulso pago noutro período** era o último caminho de "0 execuções ·
R$ X" (F17); desde a F18 ele conta no dia da execução (acima). Prova:
`e2e/indicadores-receita-paga-por-procedimento.spec.ts` ("o avulso pago
noutro mês").

**As avaliações entram com UMA nota** (D11 da 6ª simulação, 2026-11-04;
princípio 3, nada de regra escondida): "Melhor/Pior avaliados" e
"Procedimentos melhor/pior avaliados" do dashboard são
`rankingDasAvaliacoes` (`lib/metrics/resultado.ts`), sem mínimo — a linha diz
quantas notas ("1 aval."), e os piores não repetem quem já está entre os
melhores ("Nenhum outro procedimento avaliado no período."). Era
`MIN_RATINGS = 3` na página, e o vazio dizia "Sem avaliações no período" com
as notas gravadas (a nota por procedimento não aparecia em tela nenhuma).
Prova: `e2e/indicadores-avaliacao-com-uma-nota.spec.ts`,
`tests/metrics-avaliacoes.test.ts`.

**"Profissionais ativos" é quem ATENDE** (D14 da 5ª simulação,
2026-11-02): ativo, com alguma unidade do recorte marcada no "Atende"
(`atende_em`, decisão 2 da 8ª simulação; era "as dela e as da rede") — `getQuemAtende` (`lib/metrics/relatorio.ts`,
contado no banco). Era quem teve produção no período, contado na tela (a
Renata, sem atendimento, ficava de fora). A tabela "Comissões por
Profissional" lista quem atende (e quem atendeu no período); a comissão de
quem NÃO atende (quem só vendeu, como na venda do pacote) fica numa linha à parte
("Também têm comissão, sem atender: …"), sem sumir. Prova:
`e2e/relatorios-profissionais-ativos.spec.ts`.

**O topo da agenda da rede** (D13 da 5ª simulação, 2026-11-02) é
`contagemDaAgenda` (`lib/metrics/resultado.ts`), sobre a lista que a tela já
carregou inteira: Total, Confirmados, Em atendimento, Concluídos, **Cancelados**
e **Faltas** — dois números. "Cancelamentos" somava a falta, contado na tela.
Prova: `e2e/agenda-cancelados.spec.ts`.

Dados de demonstração para conferir os números na mão: `supabase/seed_demo.sql`
(idempotente; os valores esperados estão no cabeçalho do arquivo).

**F68 — os indicadores do levantamento das regras (2026-11-12).** O que
mudou, pelos princípios (3: o que a tela mostra é o que vale; 4: não chutar):
- **Ticket médio sem estorno de fora** (C44a): o numerador é o pago pelas
  clientes que PAGARAM (> 0) — as do denominador. O estorno de um pagamento de
  outro período entrava negativo e o ticket saía −R$ 500 com uma cliente que
  pagou R$ 500. A receita do período continua descontando o estorno.
- **A taxa do cartão no estorno é a GRAVADA** (C44b):
  `private.taxa_gravada_do_cartao` (proporcional ao valor, das parcelas de
  `recebiveis_do_cartao`, procurada pelo `estorno_de`) em
  `metrics_custos_da_venda`, na série e no caixa dos lançamentos; sem
  recebível, a configuração como antes. O dia do pagamento fica com a taxa
  dele, e o do estorno a devolve.
- **Réguas** (C49): os motivos de perda só dos funis ATIVOS; o comercial conta
  o agendamento por `aconteceu_em`; ~~o "Reativar" da unidade mostra a última
  visita NA unidade~~ (24ª: o Reativar é sempre o da rede).
- ~~A unidade da cliente é a tag~~ (C6/C45) — desfeito no Bloco Tags
  (2026-11-14), e o público das campanhas e do "Buscar clientes"
  (`clientes_do_publico`) não tem mais filtro de unidade (MK2).
  ~~As novas clientes de uma unidade são as ATENDIDAS nela~~ (H16): saiu na
  24ª — "Novos clientes" só existe na rede (acima).
- **O total da rede conta a unidade desativada** (C45): o dashboard e o
  Financeiro da rede inteira somam todas as unidades — a desativada com
  movimento já aparecia no "Por unidade", e o total não fechava. Desde a F72
  (decisão do Claude pelo princípio 3; D1 da 14ª) o recorte de uma unidade, as listas e os filtros de LEITURA
  também a alcançam enquanto ela tiver o que ficou ou movimento no período
  (`unidadesParaLer`, `lib/unidades/da-tela.ts`, com o selo "Unidade
  desativada"); só os seletores de coisa NOVA seguem as ativas
  (`unidadesParaCriar`). Regra inteira em `plataforma.md` (a unidade
  desativada continua contada e alcançável).
- **Comparações** (C46): `resolvePeriod` devolve `prevFullTo` (o fim do
  período anterior INTEIRO); o "A receber" e o "A pagar" do hub comparam com
  `getEmAberto` até ele (eram o período inteiro × o pedaço decorrido). O selo
  do gráfico de 6 meses é `variacaoDoSemestre` (`lib/metrics/evolucao.ts`):
  o último mês FECHADO contra o primeiro, "▲ R$ X de jun a out" (ou ▼). A
  variação do hub é `variacaoPercentual`; as somas das comissões, de
  `lib/metrics/comissoes.ts` (`totaisDoResumoDasComissoes`,
  `totaisDasComissoes`).
- **Marketing** (C47): o cartão pede à Meta o MESMO período da tela
  (`intervaloDosAnuncios`, `lib/ads/periodo.ts`: o mês, 15 dias e o
  personalizado vão com `since`/`until`), e o gasto e o alcance são os da
  CONTA (`getResumoDaConta`, `act_<id>/insights`): o alcance é de pessoas
  únicas, não a soma das campanhas. Sem o resumo, "—".
- **"—" e não zero** (C48): o ticket da rede sem cliente que pagou; a ocupação
  do dia sem capacidade (ninguém atende hoje).
- **As dicas** (C50): "no fuso da unidade" (era "horário de Brasília"); a
  receita diz que o estorno sai no dia em que foi feito; a perda e o ajuste
  são métrica (era "já foi pago na compra").
- **O "Meus…" de quem atende em mais de uma unidade** (D10 da 13ª): no
  dashboard da unidade, na vista pessoal (SM2), "Minhas comissões",
  "Meus atendimentos", "Meus agendamentos hoje", o "Meu faturamento" e o
  ticket dela contam as unidades em que ela ATENDE (`unidadesDoQueEDela`,
  `lib/metrics/escopo.ts`; só as ativas), e dizem "nas 2 unidades"; o horário
  de fora diz a unidade. Como a Minha agenda e a tela de comissões.
- **O total de clientes do cabeçalho do dashboard da rede é o da rede inteira**
  (D12 da 13ª): as ativas (`getClientesAtivos`), com "da rede" quando a
  tela está recortada (unidade ou vista pessoal). A vista pessoal da agenda
  não recorta a ficha.
- **Cada quadro de clientes diz o seu recorte** (A10 da 13ª):
  `deQuemSaoAsClientes` — "da rede" ou "com horário com você" (o "atendidas
  na unidade" saiu na 24ª) — no "Reativar", e o subtítulo do "Clientes no
  mês" diz se fala das novas clientes da rede ou só dos agendamentos.
- **Cada aba dos Relatórios diz a base do valor** (A30 da 24ª; princípio 3):
  Vendas, "Valores da venda, com o voucher e os pontos" (o voucher e os
  pontos contam como pagamento); Procedimentos, "Receita líquida do voucher e
  dos pontos", e a margem por faixa de idade diz que é o preço do agendamento
  menos o custo do catálogo (`DEFINICOES.baseDasVendas`,
  `baseDosProcedimentos`, `[data-base-da-aba]`).
- **O Copilot usa as funções da tela** (C5): o "a receber" é o do Financeiro
  (`getEmAberto` até o fim do período), a aba agenda vai até o fim do período,
  e o comercial é o painel da aba Oportunidades (`painelComercial`, que saiu da
  tela para `lib/metrics/painel-comercial.ts`: o funil padrão, a conversão dos
  funis ativos, os motivos e a conversão por origem).
- **As oportunidades são da rede, e o rótulo diz no recorte por unidade** (A10 da 33ª,
  princípio 3; decisão do Claude, 26/11): a oportunidade não tem unidade (a cliente é da
  rede), e só os agendamentos do comercial (e o comparecimento) respeitam o recorte
  (`painelComercial`). Com uma unidade escolhida, numa rede de mais de uma, os dois cartões
  que não seguem o recorte se chamam "Conversão (rede)" e "Oportunidades recebidas (rede)".
  No portal da unidade também (D12 da 41ª; decisão do Claude, 28/11, pela própria regra): a
  unidade da rota é o recorte (`selectedBranchId`, e as unidades ativas da rede em
  `todasAsUnidades`); na rede de uma unidade, sem "(rede)". Prova:
  `tests/relatorios-oportunidades-da-rede-no-portal-da-unidade.test.ts`,
  `e2e/relatorios-conversao-funis-ativos.spec.ts` ("FO-07").
  Sem nota explicando o recorte (o Heitor, 26/11: "isso não é ser intuitivo, é ser explicativo e não isso que eu quero"). O recorte fica: ele recorta os agendamentos. Prova:
  `tests/telas-sem-texto-que-explica.test.ts`. O QUADRO de
  oportunidades não tem recorte por unidade: as duas páginas não leem `?unidade=`
  (o arremate da 33ª conferiu: o A10 é só da aba dos Relatórios).
Prova: `e2e/indicadores-f68-contas.spec.ts`, `e2e/indicadores-f68-telas.spec.ts`,
`tests/indicadores-f68.test.ts`.

## O filtro de Tags nos Relatórios (18/11)

A regra das tags vale para o sistema inteiro (CLAUDE.md §1, o Heitor,
13/11: "onde tiver for passível de filtro, um dos filtros que ela pode usar
são as tags … além dos filtros que a gente já apresenta ali fixos em cada
página"). Nos Relatórios, o gatilho "Tags" (o `<FiltroDeTags>` compartilhado
com o Financeiro — `<PickerCompacto multiplo>`, "Tags · N",
`[data-filtro-de-tags]`, ao lado do período; trocar a tag volta à primeira
página) guarda a escolha na URL (`?tags=a,b`, com o leitor das outras telas,
`lib/tags/filtro-na-url.ts`: a vírgula do nome vai escapada) e vai à CONSULTA:
as funções ganharam `p_tags text[] default null` (migration
`20261125100002`), e sem tag a chamada é a de antes. As opções são o
vocabulário da rede (`tagsAtivasDaRede`, lido no servidor); a rede sem tag
nenhuma não vê o filtro. A tag escolhida que saiu do vocabulário segue na
lista, marcada, para dar para desmarcar.

Decisões do Claude (princípios 3 e 7) — e a do Heitor, onde a fala dele vem citada:
- **A tag filtra PESSOAS.** A linha entra se a cliente dela (`clients.tags`)
  tem TODAS as tags marcadas (E), sem distinguir maiúscula de minúscula —
  "VIP" e "vip" são a mesma, como na lista de Clientes. Uma régua só, no
  banco: `public.metrics_tem_as_tags` / `metrics_cliente_tem_as_tags`. A linha
  sem cliente (a venda sem ficha, o lançamento sem cliente, a comissão sem
  atendimento nem lançamento de cliente) sai enquanto houver tag.
- **Na aba Comercial, a tag é a da PESSOA da oportunidade** (o Heitor,
  18/11: "a tag é da pessoa e pode ter mais de uma tag" — a oportunidade não
  tem tag própria, e `leads.tags` não é lida): o funil, o total, a conversão,
  o ranking, os motivos de perda e a conversão por origem. A pessoa é a
  cliente ligada (`leads.client_id` → `clients.tags`) e, sem cliente, o
  contato (`leads.contato_id` → `contacts.tags`) — num lugar só,
  `public.metrics_tags_da_pessoa_da_oportunidade` (a régua:
  `metrics_oportunidade_tem_as_tags`). Desde a `20261125500001` a ficha e os
  contatos dela têm a MESMA lista (o banco espelha; `crm-inbox.md`), e a
  `20261125500002` tirou `leads.tags`. Os atendimentos comerciais (agendados, realizados,
  comparecimento) não têm oportunidade ligada: valem as tags da cliente deles.
- **O filtro aparece nas abas de pessoas**: Vendas (a lista, o resumo e o
  CSV), Agenda, Clientes, Procedimentos, Profissionais e Comercial — e nelas o
  núcleo (`metrics_core`: o dinheiro, os atendimentos, as novas, as comissões)
  e o período anterior da comparação no mesmo filtro. "Profissionais ativos"
  (a equipe) não muda: não é de uma cliente.
- **Não aparece no Estoque** (não há pessoa): ali a tag da URL nem chega à
  conta (`tagsDaAba`).
- **A Visão geral e o Financeiro têm o filtro** (Q05 do catálogo dos
  Indicadores, revisão de 24/11: "a Visão geral e a aba Financeiro dos
  Relatórios têm filtros, então ganham o de Tags"; antes, o Claude as deixava
  de fora). A régua é a de cima: a receita, os atendimentos, o ticket, o status
  do período, a receita por unidade, forma e categoria, as parcelas pendentes,
  o insumo consumido e o produto vendido, a taxa da maquininha e as comissões
  vão pela cliente; a despesa, a compra de estoque, o fechamento das comissões,
  as perdas e as compras no estoque (sem cliente) saem enquanto houver tag — e
  o lucro, a margem, o DRE e o gráfico de evolução são dessas mesmas linhas
  (princípio 3). A dica do filtro diz isso. Migration `20261203400001`.
- Funções com `p_tags`: `metrics_vendas_pagina`, `metrics_vendas_resumo`,
  `metrics_core`, `metrics_relatorio`, `metrics_retention`,
  `metrics_new_clients_series`, `metrics_ticket_medio`,
  `metrics_atendimentos_sem_receita`,
  `metrics_receita_por_categoria_de_procedimento`, `metrics_comercial`,
  `metrics_lead_funnel`, `metrics_conversao_por_origem`,
  `metrics_motivos_de_perda`, `metrics_series`, `metrics_resultado`,
  `metrics_series_do_resultado`, `metrics_custos_da_venda` e
  `metrics_series_dos_custos_da_venda` — a assinatura nova fica só com o
  `service_role`, como as vizinhas.
Prova: `tests/relatorios-filtro-de-tags.test.ts`,
`tests/relatorios-tags-na-visao-geral-e-no-financeiro.test.ts`,
`e2e/relatorios-filtro-de-tags.spec.ts`.

---

## Correções de 25/11 (decisões do Claude)

- **O ranking de recorrência conta visitas** (D16): "Mais recorrentes" do
  dashboard da rede vem de `metrics_recorrencia_das_clientes` (os
  atendimentos CONCLUÍDOS no período, por `aconteceu_em`, só quem tem ao menos
  um; migration `20261204300001`) e de `rankingDaRecorrencia`
  (`lib/metrics/recorrencia.ts`). O `metrics_top_clients` ordena pelo gasto e
  punha quem não voltou na lista.
- **O ticket médio por unidade diz a conta** (D15): a coluna do dashboard da
  rede tem a Dica "Pago pelas clientes ÷ as clientes que pagaram na unidade",
  e a célula mostra as clientes que pagaram.
- **A vista pessoal no dashboard da unidade** (DB-01; VP-01, o Heitor, 23/11):
  quem só tem a Minha agenda vê, nas etapas da agenda do funil, os
  agendamentos DELA (o `core` da vista pessoal), com o subtítulo "Os seus
  agendamentos" — não os da unidade, nem zero.
- **Relatórios → Vendas** (A10, P17): a venda de plano ou pacote cancelado
  depois diz "Plano cancelado"/"Pacote cancelado" na linha e no CSV
  (`marcaDoCancelamento`, `lib/metrics/vendas-comum.ts`); a coluna Profissional
  diz, por linha, "Quem atendeu" (procedimento) ou "Quem vendeu" (o resto,
  `quemDaVenda`). Teste: `tests/relatorio-vendas-o-que-a-linha-diz.test.ts`.

## Correções de 26/11 (decisões do Claude)

- **O número aparece com o valor da conta** (D3 da 31ª; princípio 3): o
  dashboard da rede e os Relatórios contavam cada número de 0 até o valor em
  0,9 s (`useCountUp`), e o servidor desenhava R$ 0,00. O "Giro do mês" de
  R$ 14,10 foi lido como R$ 12,53 e R$ 12,70 por quem olhou no meio — parecia
  outra conta para outra pessoa, e a conta (`metrics_giro_estoque`) é uma só.
  Agora o número sai pronto (o design system já não tem animação de entrada).
  Teste: `tests/indicadores-o-numero-da-tela-e-o-da-conta.test.ts`.
- **"Produtos críticos" conta produtos; a linha da unidade, o produto nela**
  (D22 da 31ª; ES-30; a mesma régua do D19 da 8ª, `atendimento.md`): o cartão
  de Relatórios → Estoque (era "Itens Críticos") conta o produto no mínimo ou
  abaixo dele em alguma unidade do recorte UMA vez, e a dica diz isso; a dica
  da "Saúde do Estoque por Unidade" diz o "Críticos" de cada linha (o mesmo
  produto em duas unidades conta nas duas). No dashboard da rede, a lista
  "Estoque crítico" diz na dica que cada linha é um produto numa unidade, e o
  número dela é o de TODAS as linhas (a página manda só as 20 primeiras, e o
  número dizia 20). No mínimo é crítico nas duas contas (`estoqueBaixo`,
  `saldo <= mínimo`). Teste: `tests/estoque-critico-diz-o-que-conta.test.ts`.
- **Dashboard × Relatórios na agenda** (D6 da 31ª, não era defeito): "Clientes
  no mês" conta até agora (o Heitor, 29/10) e Relatórios → Agenda, o período
  inteiro; a dica do quadro já diz isso (`[data-recorte-dos-cancelados]`).

## Correções de 27/11 (decisões do Claude)

- **O que some com uma unidade, além da lista do D-19** (A14 da 37ª; UU-01;
  Decisão E1, do Claude: some o que só é recorte por unidade, fica o que é
  dado): o "Hoje" do dashboard da rede de uma unidade (ou recortado a uma) não
  lista a unidade — fica a conta do dia (`[data-hoje-da-unidade-unica]`); o
  Financeiro da rede de uma unidade não diz "1 unidade" no subtítulo. O modo do
  mapa que junta as duas camadas se chama "Concentração e LTV" (era
  "Consolidado", lido como a rede consolidada). Teste:
  `tests/rede-de-uma-unidade-o-que-some.test.ts`; E2E:
  `e2e/rede-de-uma-unidade.spec.ts` ("A14 da 37ª").
- **A margem do recorte é a do que a unidade oferece** (A19 da 37ª; LU-14):
  `metrics_margem_procedimentos_na_unidade` lista só o procedimento que a
  unidade faz — a régua de `ofereceNaUnidade` (o dela, o da rede sem
  disponibilidade, o da rede com ela na disponibilidade). Listava o catálogo
  inteiro, e o recorte de uma unidade mostrava o procedimento da outra.
  Migration `20261216500001`. Teste:
  `tests/margem-da-unidade-so-o-que-ela-faz.test.ts`; E2E:
  `e2e/indicadores-margem-da-unidade.spec.ts` ("A19 da 37ª").
- **Relatórios: a tela não se contradiz e diz a conta** (38ª simulação):
  "A receber em aberto" não diz "Nada a receber em aberto." quando há
  concluídos sem pagamento — só a nota deles aparece (A11; RE-10); o "Ticket
  médio" da aba Clientes tem a dica `DEFINICOES.ticket`, como a Visão geral e
  os Procedimentos (A12; TM-02); e a dica `DEFINICOES.receitaDosAtendimentos`
  diz a conta numa frase, sem o parágrafo que explicava a tela (A13; princípio
  7, "intuitivo não é explicativo"). Teste:
  `tests/relatorios-a-tela-nao-se-contradiz.test.ts`.

## Correções de 28/11 (decisões do Claude)

- **O "Meu faturamento" diz as unidades do número** (D5 da 43ª; CA-06,
  princípio 3): a vista pessoal soma a unidade do endereço e as outras em que
  ela atende (`unidadesDoQueEDela`) — a do endereço entra mesmo sem o
  "Atende" nela. A linha dizia "Nas 2 unidades em que você atende" a quem
  atende em uma; diz as unidades pelo nome ("Em Friburgo e Teresópolis",
  `nomesDasUnidades`, `lib/metrics/escopo.ts`). Teste:
  `tests/meus-numeros-dizem-as-unidades.test.ts`.
- **O eixo do fluxo de caixa cabe** (A5 da 43ª; princípio 7): o eixo diz o
  mês curto ("dez") e o ano só no primeiro rótulo e em janeiro ("jan/27") —
  `rotuloDoMesNoEixo`, `lib/chart-utils.ts` —, com folga entre os rótulos; a
  dica e a tabela seguem com "dez/26". Teste:
  `tests/fluxo-de-caixa-o-eixo-cabe.test.ts`.
- **O "Reativar" não diz "Nunca veio" da cliente de antes do sistema** (A14
  da 43ª; CC-05, IM-20, princípio 3): sem visita nenhuma (nem a de antes), a
  linha da ficha com "Cliente desde" diz "Cliente desde mar 2017"
  (`semVisitaDoReativar`, `quadros-de-clientes.tsx`); sem ele, "Nunca veio".
  A "Última visita" de antes já aparece como visita ("· antes do sistema").
  Teste: `tests/reativar-a-ficha-de-antes-nao-nunca-veio.test.ts`.
- **O "Ver mais" do "Reativar" abre as que faltam no próprio quadro** (A18 da
  43ª; CC-06, princípio 3): "Ver mais 6 (9 no total)" levava à lista de
  Clientes inteira, sem o recorte. Agora traz a página seguinte (20 por vez) do
  MESMO recorte, com o desenho das primeiras (`LinhaDoReativar`), e o link diz
  o novo resto até sumir. A lista de Clientes não ganhou filtro. A leitura é
  `maisClientesParaReativar` (`actions/reativar-clientes.ts`: Clientes em Ver,
  a rede do contexto, a unidade da tela pelo alcance, só para o relógio dos
  dias) → `getClientesParaReativarDoRecorte` com o `deslocamento` →
  `metrics_clientes_para_reativar_rede(…, p_deslocamento)`, com o desempate
  por id na ordem (migration `20261222100001`). Teste:
  `tests/reativar-ver-mais-no-proprio-quadro.test.ts`; E2E:
  `e2e/indicadores-reativar-clientes-da-rede.spec.ts` ("A18 da 43ª").

## O que nunca fazer aqui

```
❌ Montar a lista de movimentações do estoque lendo stock_movements pela tela (corta em 1000, sem total) — é metrics_movimentos_de_estoque, paginada no banco (item 6 do escopo de 18/11)
❌ Escrever "lead" num número, rótulo, coluna ou dica da tela (Relatórios, dashboard, Marketing) — é "oportunidade" (CR1/RL2; tests/oportunidade-no-texto trava)
❌ Trocar a CHAVE de uma aba de Relatórios para mudar o nome dela (role_report_tabs e a URL guardam a chave) — muda o rótulo em REPORT_TAB_LABELS
❌ Filtrar por tag DEPOIS de ler as linhas (no app ou na tela) — a tag vai à função (`p_tags`), senão o corte de 1000 e o total não batem
❌ Contar como venda o que não tem recebimento pago (D6) — a régua é a do primeiro lançamento de receita pago, a mesma dos seis tipos
❌ Número que conta de 0 até o valor na tela (quem olha no meio lê um número que não existe — D3 da 31ª)
❌ Número de uma lista cortada (as 20 primeiras) no lugar do total dela
❌ "Ver mais N (T no total)" que leva a uma lista sem o recorte do quadro — o resto abre no quadro, pela mesma conta (A18 da 43ª)
```
