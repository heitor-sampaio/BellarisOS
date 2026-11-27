# Catálogo de regras — Indicadores

Este é o catálogo das regras dos indicadores que valem HOJE: todo número na tela — o fuso e o período, a regra única de cada conta e a tela que a explica, a receita e o dinheiro, o lucro e a margem, o ticket médio, a receita dos atendimentos, a agenda e a ocupação, as clientes nos números, as oportunidades, o estoque e as Vendas nos Relatórios, o dinheiro que só aparece com o Financeiro, as vistas pessoais, o dashboard e o recorte por unidade, a rede de uma unidade só, os anúncios e o filtro de Tags nos Relatórios. Cada regra diz a fonte: uma fala do Heitor (copiada letra por letra do documento), uma recomendação do Claude que o Heitor aprovou (com a resposta dele), um dos sete princípios de produto, "decisão do Claude". "Onde" aponta a linha do documento; "Antes" lista os números do rascunho que a regra junta (KA: `docs/regras/indicadores.md:1-310`; KB: `:311-620`; KC: `:621-894`; KD: `:895-1169`; KE: `:1170-1517`). Quem vê cada aba dos Relatórios, o cálculo das comissões, o que o Copilot responde e como o dinheiro ENTRA (o PDV, o lançamento, o estorno, o caixa) ficam nos catálogos das áreas donas e estão em "É de outra área"; aqui fica como o número é CONTADO. É um RASCUNHO para o Heitor revisar. Contagem: 133 regras (O fuso horário 8, O período e a comparação 6, Uma conta só, e a tela explica o número 7, A receita e o dinheiro 11, O lucro e a margem 15, O ticket médio e as outras médias 4, A receita dos atendimentos 10, A agenda e a ocupação nos números 12, As clientes nos números 9, As oportunidades 7, O estoque nos Relatórios 6, Relatórios → Vendas 12, O dinheiro só com o Financeiro 4, As vistas pessoais 6, O dashboard e o recorte por unidade 7, A rede de uma unidade só 1, Os anúncios 3, O filtro de Tags nos Relatórios 5), 5 perguntas e 26 divergências. Dos 150 números do rascunho, nenhum ficou fora do catálogo e nenhum é de outra área (o que os rascunhos deram como de outra área veio sem número e está resumido no apêndice); todos estão num "Antes". Das seis perguntas dos rascunhos: a da "Compra de estoque" fora do lucro é a Q02; a da venda parcelada que entra inteira na primeira parcela paga é a Q03; a da frase "contar no dia que foi feita" entrou na Q01, com as outras regras escritas como suas sem a fala; a da lista do que sai da Visão geral sem o Financeiro tinha resposta na sua fala de 23/11 ("financeiro ve entrada/saida/lucro, tudo": o Faturamento por Unidade e a Forma de Pagamento são entrada, FV-02), e só a receita dos atendimentos, que você deixou em aberto, virou a Q04; a do ticket médio no dashboard tinha resposta na sua fala de 23/11 ("ticket médio é parametro/metrica, não é algo/operação financeira", TM-03), e o texto que o dá só com o Financeiro está em "Divergências"; e a do filtro de Tags fora da Visão geral e do Financeiro é a Q05.

## O fuso horário (FU)

**FU-01.** Cada unidade escolhe o seu fuso horário, no cadastro dela (Configurações → Unidade, o "Nova unidade" e o setup, em que o CEP sugere o fuso pelo estado). O padrão é o horário de Brasília, e a unidade que já existe não muda sozinha: quem não mexe não vê nada mudar.
- Fonte: o Heitor, 2026-11-11: "Não, deixa a clinica configurar o seu fuso"
- Onde: `docs/regras/indicadores.md:21-24`; `DEVLOG.md:13713`, `:13755`
- Antes: KA-03

**FU-02.** Todo dia e toda hora de uma unidade saem no fuso dela: a agenda e o agendar (também no app), o "hoje", o horário de funcionamento, o Fechamento do dia, os indicadores, as telas (ficha, atendimento, Financeiro, parcelas, CRM, inbox, portal da cliente), o recibo (no fuso da unidade que recebeu), os CSV, o texto do lembrete e as datas dos documentos. O recebimento perto da meia-noite conta no dia local da unidade, no caixa, no Fechamento do dia, no faturamento e no fluxo: R$ 100 recebidos às 23:30 de Rio Branco (01:30 de Brasília do dia seguinte) são do dia de Rio Branco; na rede, cada lançamento vale pelo dia da sua unidade (FU-03).
- Fonte: o Heitor, 2026-11-11: "Não, deixa a clinica configurar o seu fuso"; o recebimento perto da meia-noite: decisão do Claude, 26/11 (32ª simulação, Decisão D) — é esta regra aplicada ao dinheiro, e o dia do caixa é o dia em que o dinheiro entrou ali (princípio 5)
- Onde: `docs/regras/indicadores.md:24-28`, `:49-54`
- Antes: KA-04

**FU-03.** No portal da rede, o dia e a hora são os do fuso comum das unidades na tela; com unidades em fusos diferentes, o de Brasília. Mesmo assim, no número somado da rede cada lançamento e cada atendimento cai no dia do relógio da unidade dele: as barras dos gráficos (também os do resultado e dos custos da venda) e o Fechamento da rede, com o dia de cada unidade. A grade da agenda da rede desenha cada coluna no relógio da unidade dela e diz qual é (FU-04; R16, o Heitor, 26/11: "Cada coluna no relógio da sua unidade, dizendo qual é (como ficou)").
- Fonte: decisão do Claude; a grade da agenda da rede: decisão do Claude, 26/11 (33ª simulação, D4), pela FU-04 e pelo princípio 3
- Onde: `docs/regras/indicadores.md:29-37`, `:90-92`, `:57-67`
- Antes: KA-05; antes de 26/11: a grade da rede não dizia o relógio de cada coluna

**FU-04.** Quando a unidade não está no horário de Brasília, a tela diz qual é o relógio ("Horário de Manaus"); no de Brasília, não diz nada. Na agenda da rede com unidades em fusos diferentes, o cabeçalho de cada coluna do dia diz o relógio dela (também o de Brasília), sem nota acima da grade (R16, o Heitor, 26/11: "Cada coluna no relógio da sua unidade, dizendo qual é (como ficou)"; "Mas não precisa da explicação"); com um fuso só fora de Brasília, a nota de sempre.
- Fonte: princípio 3; a agenda da rede: decisão do Claude, 26/11 (33ª simulação, D4), pelo princípio 3
- Onde: `docs/regras/indicadores.md:38-41`, `:85-87`; `DEVLOG.md:13755`, `:57-67`
- Antes: KA-06; antes de 26/11: a grade da rede não dizia o relógio (era a sugestão nº 57)

**FU-05.** O que é da rede e não tem unidade usa o fuso da rede: a fidelidade (inclusive a rotina dela), a LGPD, os aniversariantes e as campanhas (a agendada e a de todo ano).
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:42`, `:53-55`
- Antes: KA-07

**FU-06.** O dia sem hora — o "cliente desde", a última visita de antes do sistema, a faixa etária, os "para reativar", a busca "de hoje em diante" e o lote vencido do estoque — se compara com o "hoje" do lugar da tela (o da unidade; no que é da rede, o da rede), nunca com o de Brasília fixo. A última visita da lista de Clientes e o "Reativar clientes" dos dashboards contam dias de calendário nesse relógio (CL-18 de Clientes).
- Fonte: decisão do Claude; a lista e o dashboard: decisão do Claude, 26/11 (33ª simulação, D9 e o arremate)
- Onde: `docs/regras/indicadores.md:59-65`, `docs/regras/crm-inbox.md:434-446`
- Antes: KA-08; antes de 26/11: a lista e o "Reativar clientes" contavam blocos de 24 h

**FU-07.** Ficam sempre no horário de Brasília a assinatura da rede e a cobrança da plataforma, a cobrança do Copilot e o mês da Meta. O vencimento de uma conta é um dia, o mesmo em todo fuso do Brasil; quem decide se ela já venceu é o "hoje" da unidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:66-71`
- Antes: KA-09

**FU-08.** A validade do pacote acaba no fim do dia da unidade, e o cancelamento do pacote diz a validade no relógio dela.
- Fonte: o Heitor, 2026-11-11: "Não, deixa a clinica configurar o seu fuso"
- Onde: `docs/regras/indicadores.md:72-75`
- Antes: KA-10

**FU-09.** A hora de um fechamento de comissão sai no fuso da unidade dele, como a de cada lançamento: a comissão de Barra do Garças paga às 13:13 de lá é "13:13 (horário de Cuiabá)" nos "Últimos fechamentos" de uma tela em outro relógio, e "13:13" no CSV. O mês da comissão e os limites do fechamento seguem no fuso da rede (CF-08 das Comissões).
- Fonte: o Heitor, 26/11, na página de perguntas (R17): "No fuso da unidade, com o nome do relógio ao lado (a proposta)"
- Onde: `docs/regras/comissoes.md` ("As três datas"), `apps/web/lib/comissoes/extrato-texto.ts` (`textoDoFechamento`, `csvDoExtrato`)
- Antes: (nova, 26/11; era proposta do Claude da 33ª)

## O período e a comparação (PI)

**PI-01.** O período em andamento se compara com o mesmo pedaço do período anterior (a mesma duração já decorrida), nunca com o período anterior inteiro: o mês até hoje contra o mesmo número de dias do mês passado.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:95-97`
- Antes: KA-11

**PI-02.** Sem número no período anterior (o anterior é zero), não há variação: o dashboard e os Relatórios dizem "sem dados anteriores", nunca "▲ 100%" a partir do zero.
- Fonte: princípio 4
- Onde: `docs/regras/indicadores.md:98-99`, `:1003-1007`
- Antes: KA-12, KD-08

**PI-03.** Toda lista de um período vai até o fim dele, e o que acabou de ser lançado aparece na hora. Com o fim escolhido (personalizado, mês passado), a lista vai até o fim escolhido; o período que ainda corre (7 dias, todo o período) vai até o fim de hoje.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:609-621`
- Antes: KB-31

**PI-04.** A aba Agenda dos Relatórios é uma LISTA do período inteiro, até o fim dele, com os agendamentos que ainda vão acontecer e os cancelados do período, e a tela avisa isso. As outras abas seguem o dinheiro, até agora.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1008-1011`, `:1018-1019`
- Antes: KD-09

**PI-05.** O "A receber" e o "A pagar" do Financeiro comparam o período inteiro com o período anterior inteiro, nunca o período inteiro com um pedaço do anterior.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:1408-1410`
- Antes: KE-25

**PI-06.** O selo do gráfico de 6 meses compara o último mês FECHADO com o primeiro do gráfico: "▲ R$ X de jun a out" (ou ▼).
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:1410-1412`
- Antes: KE-26

## Uma conta só, e a tela explica o número (DI)

**DI-01.** Cada número da tela tem uma conta só: o mesmo indicador mostra o mesmo valor em toda tela onde aparece (o cartão, o gráfico logo abaixo e a legenda dele, os dashboards, os Relatórios, o Financeiro), e nenhuma tela faz a sua própria soma, contagem ou divisão.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:10-11`, `:100-105`, `:212-224`
- Antes: KA-01

**DI-02.** O nome acompanha a conta: dois números com o mesmo nome são a mesma conta em toda tela, e uma divisão parecida feita sobre outro conjunto ganha outro nome.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:109-112`, `:199-200`
- Antes: KA-02

**DI-03.** Todo número tem ao lado o "i" que abre a definição do que ele conta, e a definição muda junto quando a conta muda.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:918-921`
- Antes: KD-03

**DI-04.** Cada número diz de que dia é: a receita, a despesa e o ticket contam pelo dia do PAGAMENTO; os atendimentos, pela hora MARCADA (ou pela conclusão, quando ela veio antes). As dicas dos cartões do dashboard da rede, do da unidade e da Visão geral dos Relatórios dizem isso, e também que as horas estão no fuso da unidade, que o estorno sai da receita no dia em que foi feito e que a perda e o ajuste de estoque são métrica (aparecem em Relatórios → Estoque) e não entram no lucro.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:926-930`, `:1423-1425`
- Antes: KD-04, KE-29

**DI-05.** Quando um número não pode ser lido (a consulta falhou), a tela mostra o erro, nunca "R$ 0,00" ou zero como se fosse dado.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:622-634`, `:756-757`
- Antes: KC-01

**DI-06.** Número ou taxa sem base para dividir mostra "—", não 0% nem zero: a taxa de conclusão (no total e por unidade), a retenção, o giro, o ticket (também o da rede sem nenhuma cliente que pagou), a conversão e a ocupação do dia sem capacidade (ninguém atende hoje).
- Fonte: princípio 4
- Onde: `docs/regras/indicadores.md:997-1001`, `:1421-1422`
- Antes: KD-07, KE-28

**DI-07.** A tela diz a base de cada valor: a conta do resultado diz que o custo do produto conta quando ele é vendido, mesmo a receber; a Receita dos atendimentos diz que é líquida do voucher e dos pontos (por isso pode valer menos que o Total vendido das Vendas); a aba Vendas diz "Valores da venda, com o voucher e os pontos" (o voucher e os pontos contam como pagamento); a aba Procedimentos, "Receita líquida do voucher e dos pontos"; a margem por faixa de idade diz que é o preço do agendamento menos o custo do catálogo; e o Consumo no Período tem a dica do giro do estoque.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:262-267`, `:1336`, `:1440-1445`
- Antes: KA-28, KE-33

## A receita e o dinheiro (RE)

**RE-01.** Toda soma de dinheiro recebido parte da mesma receita: o que foi pago, no dia em que entrou (o dia do pagamento, nunca o dia em que o lançamento foi criado), com o estorno no dia dele. A parcela criada em agosto e paga em setembro é receita de setembro. Faturamento, receita por unidade, por forma de pagamento, por categoria, gasto por cliente e LTV saem dela.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:106-108`, `:114`, `:684-694`
- Antes: KA-13, KC-04

**RE-02.** Pagar com crédito interno não é receita em número nenhum (caixa, faturamento, receita por unidade, gráficos, as clientes que mais gastaram, a composição da receita): o dinheiro entrou quando a cliente pagou o que virou crédito, e o crédito é só o saldo dela.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:695-704`
- Antes: KC-05

**RE-03.** O gasto de cada cliente é uma conta só, pelo que ela PAGOU (o atendimento concluído e não pago não entra): a ficha mostra o total gasto (LTV) e a média por atendimento, e Relatórios → Clientes mostra, no período, as clientes que mais gastaram, com o mesmo número.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:333-341`, `:714-716`
- Antes: KB-01, KC-06

**RE-04.** A composição do Financeiro (a receita por forma de pagamento, a receita e a despesa por categoria) segue a regra do dinheiro: conta o que foi pago, no dia em que entrou ou saiu. O estorno nunca aparece ali como despesa.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:393-400`
- Antes: KB-07

**RE-05.** O pagamento conta no faturamento no dia em que entrou, pelo valor que entrou (o de antes de qualquer estorno). Um dia ou um mês que já passou não muda por um estorno feito depois.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:560-568`
- Antes: KB-23

**RE-06.** O estorno conta no período em que foi feito: no faturamento, é uma dedução desse período, como uma devolução de venda, com a forma de pagamento e a categoria do pagamento que ele estornou. O estorno de uma despesa é dinheiro que volta: deduz a despesa do período em que foi feito.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:569-574`, `:587-592`
- Antes: KB-24

**RE-07.** Pagamento e estorno no mesmo dia (dentro do mesmo período da tela) se anulam: o pagamento estornado inteiro some, o estornado em parte fica com o que sobrou, e o estorno não vira saída. Em dias diferentes, cada lado conta no seu dia.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:575-577`
- Antes: KB-25

**RE-08.** A taxa da maquininha acompanha o pagamento: a do pagamento estornado fica no dia dele e sai no dia do estorno. No custo da venda (lucro, série e caixa), o estorno de um pagamento no cartão devolve a taxa que aquele pagamento gravou, na proporção do valor; sem a taxa gravada, vale a da configuração.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:578-579`, `:1385-1390`
- Antes: KB-26, KE-22

**RE-09.** A despesa só conta quando está paga, como a receita: o lucro não mistura o dinheiro que entrou de um lado com o que ainda vai sair do outro.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:606-607`
- Antes: KB-29

**RE-10.** No Financeiro, o cartão "A receber" mostra à parte, com nome e sem somar aos lançamentos, os atendimentos concluídos ainda sem pagamento ("Atendimentos concluídos sem pagamento: R$ 650,00 (1 atendimento)"), na rede (no total e por unidade) e na unidade.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:125-130`
- Antes: KA-29

**RE-11.** O CSV do fechamento do dia só ganha a coluna "Forma, maquininha e bandeira" quando o dia teve mais de uma maquininha; com uma só, fica como era.
- Fonte: princípio 7
- Onde: `docs/regras/indicadores.md:580-586`
- Antes: KB-27

## O lucro e a margem (LU)

**LU-01.** O lucro do período é: a receita paga − as despesas operacionais pagas − os insumos consumidos e os produtos vendidos − as taxas da maquininha − as comissões lançadas. As despesas operacionais são as despesas pagas tirando as das categorias "Compra de estoque" e "Comissões", que contam no caixa (os cartões de despesa, o Fechamento, o fluxo, o gráfico) e não no lucro, para nada ser descontado duas vezes.
- Fonte: o Heitor, 2026-11-04: "pode descontar as duas" (as taxas e as comissões; a "Compra de estoque" fora do lucro é desenho do Claude — ver a Q02)
- Onde: `docs/regras/indicadores.md:225-240`, `:278-282`, `:291-296`; `DEVLOG.md:12803-12806`
- Antes: KA-19

**LU-02.** O lucro desconta o insumo pelo que foi consumido nos atendimentos, ao custo do que saiu do estoque, na unidade de consumo (o ml, a UI) — não pela compra. O consumo é uma conta só, a mesma no dashboard, no Estoque e nos Relatórios; que ele desconta do lucro está na dica do cartão, não embaixo do número.
- Fonte: o Heitor, 2026-10-29: "serve pra controle de estoque e aferimento de métricas de custo/margem/lucro"; o lugar da explicação: o Heitor, 2026-11-16: a explicação do número mora na dica, não embaixo dele (`docs/regras/design.md:215`)
- Onde: `docs/regras/indicadores.md:225-235`, `:722-725`, `:733-734`; `DEVLOG.md:11207-11210`; `apps/web/e2e/dicas-relatorios-dashboard.spec.ts`
- Antes: KA-20, KC-08

**LU-03.** O custo do produto vendido (o custo dos lotes que saíram) sai do lucro no dia da venda, mesmo com a venda a receber, na mesma linha do insumo ("Insumos e produtos vendidos"). A receita dessa venda entra pela regra de sempre, no dia em que o dinheiro entra.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:251-258`; `DEVLOG.md:5526-5530`, `:5550`
- Antes: KA-21

**LU-04.** As taxas da maquininha que o lucro desconta são as das receitas que entraram no período, no dia em que entraram: no crédito, a taxa gravada nas parcelas da operadora; sem parcelas (débito, Pix e as vendas no cartão de antes), o valor recebido × a taxa configurada.
- Fonte: o Heitor, 2026-11-04: "pode descontar as duas"
- Onde: `docs/regras/indicadores.md:283-288`
- Antes: KA-23

**LU-05.** As comissões entram no lucro no período em que foram lançadas, e o pagamento delas não mexe no lucro: R$ 100 de comissão lançados em outubro e pagos em novembro tiram R$ 100 do lucro de outubro, e a despesa paga de novembro aparece só nas despesas (o caixa) de novembro.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:289-300`
- Antes: KA-24

**LU-06.** A margem é o lucro dividido pela receita; sem receita, não há margem. A variação de uma margem contra o período anterior se mostra em pontos percentuais (p.p.), nunca como percentual de um percentual.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:232-233`, `:608`
- Antes: KA-25, KB-30

**LU-07.** O lucro é o mesmo em toda tela que o mostra: os Relatórios (Visão geral, Financeiro e o DRE), o "Lucro Líquido" do Financeiro da unidade, o "Resultado líquido" do Financeiro da rede (e de cada unidade), o custo do gráfico de evolução (dashboard da rede e Relatórios) e o Copilot. O DRE mostra cada linha: Receita − Despesas operacionais − Insumos e produtos vendidos − Taxas da maquininha − Comissões = Lucro.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:242-247`, `:258`, `:301-308`
- Antes: KA-26

**LU-08.** O resultado do Financeiro se explica na tela: embaixo do "Resultado líquido" (da rede e de cada unidade) e do "Lucro Líquido" (da unidade) vem a conta inteira, "Receita R$ 89,00 − despesas operacionais R$ 0,00 − insumos e produtos R$ 80,00 − taxas da maquininha R$ 0,00 − comissões lançadas R$ 0,00 = R$ 9,00"; quando as despesas pagas passam das operacionais, a tela diz que a compra de estoque e o pagamento das comissões ficam no caixa.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:310-321`
- Antes: KA-27

**LU-09.** Cada conta de custo tem um nome só: o cartão do dashboard da rede é "Despesas pagas do mês" (o caixa); a linha do gráfico "Evolução do Período" é "Custo do lucro", e a legenda embaixo do gráfico diz o que ela soma ("Custo do lucro = despesas operacionais + insumos e produtos vendidos + taxas da maquininha + comissões lançadas."); o cartão de Relatórios → Financeiro é "Insumos e produtos vendidos", o mesmo número da linha do DRE.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:733-745`
- Antes: KC-09, KC-10

**LU-10.** O cartão das despesas do caixa, no Financeiro da unidade e no da rede e na Visão geral dos Relatórios, se chama "Despesas pagas (caixa)" e diz que inclui a compra de estoque e o pagamento das comissões, que o lucro não desconta. No Financeiro dos Relatórios, quando o cartão soma mais que a despesa operacional, o DRE diz de que ele se compõe (as despesas operacionais, o pagamento das comissões e a compra de estoque).
- Fonte: princípio 3; o DRE diz o cartão: decisão do Claude, 26/11 (33ª simulação, A11), pelo princípio 3
- Onde: `docs/regras/indicadores.md:745-748`; `docs/regras/vendas-financeiro.md:2001-2006`, `docs/regras/indicadores.md:850-858`
- Antes: KC-11; antes de 26/11: o cartão dizia R$ 367 e o DRE "Despesas operacionais R$ 0", sem dizer por quê

**LU-11.** O cartão "Insumos e produtos" tem a dica do que soma (o insumo dos atendimentos ao custo de consumo e o custo do produto vendido), e o DRE tem a dica "O que fica fora do lucro": a perda e o ajuste de estoque.
- Fonte: princípio 3; o lugar da explicação: o Heitor, 2026-11-16: a explicação do número mora na dica, não embaixo dele (`docs/regras/design.md:215`)
- Onde: `docs/regras/indicadores.md:748-754`; `apps/web/e2e/dicas-relatorios-dashboard.spec.ts`
- Antes: KC-12

**LU-12.** A margem do procedimento é (preço − custo) ÷ preço. O custo é a soma dos insumos, pelo custo da medida de consumo (o preço da embalagem dividido pelo que ela rende), da mão de obra e dos outros custos, sempre pelo custo de hoje no catálogo.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:401-407`
- Antes: KB-08

**LU-13.** O ranking de margem do dashboard lista só os procedimentos com custo cadastrado: sem custo, a margem daria 100% sem dizer nada.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:407-411`; `DEVLOG.md:14582-14585`
- Antes: KB-09

**LU-14.** Com o dashboard recortado a uma unidade (a unidade escolhida, a unidade em que está quem não tem "A rede inteira", ou a rede de uma unidade só), a margem usa o preço e a mão de obra daquela unidade, com os insumos e os outros custos do catálogo. A rede inteira usa o catálogo.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:412-419`
- Antes: KB-10

**LU-15.** A margem por faixa etária (Relatórios → Procedimentos) usa o preço cobrado em cada atendimento e o mesmo custo do procedimento da margem do dashboard, e só entra o procedimento que tem insumo.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:420-426`
- Antes: KB-11

## O ticket médio e as outras médias (TM)

**TM-01.** O ticket médio é a média de quanto cada cliente gasta: o que as clientes pagaram no período dividido pelas clientes que pagaram. Entra tudo o que tem cliente (atendimento, pacote, plano — entrada e parcelas —, pré-pago e produto); só conta como "pagou" quem pagou mais que zero; no total da rede, a cliente que pagou em duas unidades conta uma vez; o estorno de um pagamento de outro período não entra no ticket (uma cliente que pagou R$ 500 dá ticket de R$ 500, não negativo), embora a receita do período continue descontando o estorno.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — a média por cliente, não por atendimento; o "mais que zero", o "conta uma vez" e o estorno de outro período são decisão do Claude
- Onde: `docs/regras/indicadores.md:176-191`, `:1381-1384`; `DEVLOG.md:11312-11320`, `:13341`
- Antes: KA-16, KE-21

**TM-02.** O ticket médio tem esse nome e o mesmo número em toda tela — os dashboards (o cartão e a coluna por unidade), o Financeiro da unidade, os Relatórios (Visão geral, Clientes e Procedimentos) e o Copilot —, e o antigo "Gasto médio" dos Relatórios é ele. A conta ("Pago pelas clientes ÷ 2 clientes que pagaram") está na dica "Como o ticket médio é contado".
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — um indicador só com o "Gasto médio", com o nome "Ticket médio" (a conta à vista: princípio 3; na dica: o Heitor, 2026-11-16: a explicação do número mora na dica, não embaixo dele (`docs/regras/design.md:215`))
- Onde: `docs/regras/indicadores.md:191-197`; `DEVLOG.md:11317-11319`; `apps/web/e2e/dicas-relatorios-dashboard.spec.ts`
- Antes: KA-17

**TM-03.** O ticket médio é métrica, não dinheiro do Financeiro: aparece a quem não tem o Financeiro, na Visão geral e nas abas Clientes e Procedimentos dos Relatórios (e, pela mesma fala, no dashboard — ver "Divergências").
- Fonte: o Heitor, 2026-11-23: "ticket médio é parametro/metrica, não é algo/operação financeira"
- Onde: `docs/revisao.md:2243`; `docs/regras/indicadores.md:1236-1239`; `DEVLOG.md:1846`
- Antes: KE-06

**TM-04.** As médias sobre outro conjunto têm outro nome: "Média por atend." no ranking do dashboard (o que a cliente pagou ÷ os atendimentos concluídos); "Preço médio por atend." na ficha da cliente (a receita de serviço dela ÷ os atendimentos cobrados, pagos ou não), com a conta escrita na tela e ao lado do "Investido total" (tudo o que ela pagou); "Média por execução" em Relatórios → Procedimentos (a receita paga dos atendimentos ÷ as execuções), num cartão ao lado do "Ticket médio por cliente".
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:199-211`
- Antes: KA-18

## A receita dos atendimentos (RA)

**RA-01.** A "receita dos atendimentos" — o ranking por procedimento e por quem atendeu (nos Relatórios e no dashboard), a tabela, o cartão "Receita dos atendimentos" da aba Procedimentos com o "% do Total" e a receita por categoria — é o dinheiro que entrou pelos atendimentos, não o preço dos concluídos: o avulso concluído e não pago não entra, o desconto já sai, e as sessões de pacote, pré-pago e plano entram pela parte delas (RA-04, RA-05). A venda de produto não é atendimento e fica fora. A dica diz que é a conta da execução, e que o "Meu faturamento" é a da venda. O ranking por receita ordena pela receita. A "receita de serviço" (o preço dos atendimentos concluídos, no dia em que aconteceram) é outra conta, com outro nome.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:161-162`, `:1247-1263`, `:1274-1277`, `:1287-1291`
- Antes: KE-09, KA-14

**RA-02.** Nas tabelas por procedimento e por profissional dos Relatórios, embaixo da receita, a tela diz o que ficou fora dela: "R$ 160,00 concluídos sem pagamento (1)" e "R$ 450,00 pagos com crédito interno (não é receita)". A receita dos atendimentos continua sendo a paga.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:762-771`
- Antes: KC-07

**RA-03.** A receita dos atendimentos conta no dia em que o atendimento foi feito, qualquer que seja o dia do pagamento: a Limpeza feita em 31/10 e paga em 03/11 é "1 execução · R$ 180" em outubro, e novembro não mostra nada dela — o relatório de outubro muda quando o pagamento chega depois. Assim nenhuma linha fica com valor e 0 execuções. O pagamento estornado não conta. O caixa, o faturamento, o Fechamento e o "Meu faturamento" seguem no dia do pagamento.
- Fonte: princípio 5 (a frase "contar no dia que foi feita", dada como sua, está na Q01)
- Onde: `docs/regras/indicadores.md:601-602`, `:1263-1274`, `:1344-1346`
- Antes: KE-10, KB-28

**RA-04.** A sessão de pacote feita soma, na receita dos atendimentos, a parte dela no preço do pacote, no dia da sessão, para quem atendeu. Não conta duas vezes: a sessão não tem pagamento próprio, e o dinheiro da venda continua sendo de quem vendeu.
- Fonte: o Heitor, 2026-11-03: "Somar também o pacote, rateado por sessão feita"
- Onde: `docs/regras/indicadores.md:1278-1291`
- Antes: KE-11

**RA-05.** A unidade pré-paga usada e a sessão de plano feita entram do mesmo jeito: a parte da unidade no vendido ("3 limpezas por R$ 450" → R$ 150 por limpeza atendida) e a soma dos procedimentos da sessão no plano vendido (com o desconto rateado), no dia da sessão, para quem atendeu.
- Fonte: o Heitor, 2026-11-03: "para quem atende, sessão de pacote, de pré-pago ou de plano é o mesmo trabalho"
- Onde: `docs/regras/indicadores.md:1291-1298`
- Antes: KE-12

**RA-06.** A sessão feita de um plano cancelado continua contando na receita dos atendimentos: a execução existiu. Só as sessões concluídas entram.
- Fonte: princípio 5
- Onde: `docs/regras/indicadores.md:1299-1302`
- Antes: KE-13

**RA-07.** No ranking por procedimento, cada procedimento da sessão do plano conta no SEU valor e na sua categoria: a sessão Botox R$ 800 + Preenchimento R$ 1.200 dá Botox R$ 800 e Preenchimento R$ 1.200, mesmo que o agendamento diga só "Botox". O ranking por quem atendeu e o total ficam com quem atendeu, R$ 2.000.
- Fonte: o Heitor, 2026-11-03: "dividir pelos procedimentos da sessão"
- Onde: `docs/regras/indicadores.md:1303-1313`
- Antes: KE-14

**RA-08.** Cada procedimento da sessão conta a sua execução (Botox 1 execução · R$ 800, Preenchimento 1 execução · R$ 1.200, no dia da sessão); o mesmo procedimento duas vezes na sessão são duas execuções. O "Total Execuções" da aba Procedimentos fecha com a soma da tabela, e a recorrência e o volume por faixa etária contam do mesmo jeito.
- Fonte: o Heitor, 2026-11-03: "não faz sentido ter 0 execuções e ter um valor, se não tem execução não tem valor"
- Onde: `docs/regras/indicadores.md:1314-1326`
- Antes: KE-15

**RA-09.** O ranking e a tabela por profissional contam ATENDIMENTOS: a sessão com dois procedimentos é um atendimento (+1, com os R$ 2.000), e a coluna se chama "Atendimentos". A execução por procedimento fica no ranking de procedimentos.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — o levantamento das regras de 2026-11-11 registra que ele escolheu a opção a ("atendimento"), sem as palavras dele
- Onde: `docs/regras/indicadores.md:1336-1341`; `DEVLOG.md:14139`
- Antes: KE-16

**RA-10.** O "Mais realizado" (Relatórios → Procedimentos) é o procedimento com mais execuções; no empate, o de maior receita, e a tela diz "empatou em execuções; desempate pela receita"; empatando também na receita, mostra todos os empatados ("A e B · Empate: 3 execuções cada").
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:940-945`
- Antes: KD-06

## A agenda e a ocupação nos números (OC)

**OC-01.** Um atendimento aconteceu na hora marcada ou, se foi concluído antes dela (chegou cedo, o encaixe adiantou), na hora da conclusão; o concluído depois da hora marcada continua no dia marcado. Todo indicador de atendimento conta por esse dia: o dashboard, os Relatórios (também os atendimentos comerciais da aba Oportunidades), a retenção, os rankings, a receita por categoria e as clientes a reativar.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — "a hora que vier primeiro, a marcada ou a da conclusão"
- Onde: `docs/regras/indicadores.md:163-175`, `:1391-1392`; `DEVLOG.md:11486-11488`
- Antes: KA-15, KE-24

**OC-02.** A ocupação é o tempo agendado (os atendimentos concluídos contam; os cancelados e as faltas não) sobre o tempo aberto, que é, para cada pessoa que atende e em cada dia, o horário em que a unidade e ela estão abertas ao mesmo tempo. Sai em percentual inteiro, e a agenda e o dashboard da unidade mostram o mesmo número. O tempo agendado de um dia (ou do período da agenda) é o que cada atendimento ocupa DENTRO dele, pela duração marcada (o concluído conta a duração, também o adiantado e o que acabou depois da hora): o que atravessa a meia-noite, ou dura dias, conta em cada dia o seu pedaço (o de 30 h dava mais de 100% num dia e 0% no seguinte). A contagem dos atendimentos do dia segue pelo dia em que começam. O encaixe fora do horário conta no tempo agendado, e o tempo aberto não cresce por ele.
- Fonte: decisão do Claude; o recorte pelo dia: decisão do Claude, 25/11, pelo princípio 3; o encaixe fora do horário e o concluído depois da hora: decisão do Claude, 27/11 (36ª, Decisão A), pela própria OC-02
- Onde: `docs/regras/indicadores.md:342-347`
- Antes: KB-02

**OC-03.** A ocupação da unidade conta só a agenda dela: entra quem tem o "Atende" marcado naquela unidade, com o horário dele menos o que ele tem agendado em outra unidade e menos o tempo que ele bloqueou. Ninguém aparece livre em duas unidades ao mesmo tempo. Vale também quando é ELA quem olha a agenda inteira: a ocupação no topo da agenda e a do dashboard batem (só a Minha agenda põe na grade os atendimentos dela em outra unidade, e lá eles voltam como "ocupado fora").
- Fonte: princípio 3; quem olha a agenda inteira: decisão do Claude, 26/11 (33ª simulação, D13), pelo princípio 3
- Onde: `docs/regras/indicadores.md:348-360`, `:432-439`
- Antes: KB-03; antes de 26/11: quem atende em duas unidades via uma ocupação no topo da agenda e outra no dashboard (28% × 30%)

**OC-04.** A "Minha agenda" mostra a "Ocupação hoje" de quem atende com a mesma conta: o tempo agendado dela no dia (o dia da unidade, FU-02) sobre o horário em que a unidade e ela estão abertas, menos o que ela tem em outra unidade. Sem expediente no dia, mostra "—".
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:361-367`
- Antes: KB-04

**OC-05.** A ocupação diz de onde vem. O dashboard da unidade mostra a base à vista ("340 min agendados de 2.720 min abertos (o horário de 4 profissionais que atendem)") e o que saiu do tempo aberto ("… menos 70 min de Fulano atendendo em outra unidade e 60 min bloqueados de Fulana"), com a dica do que entra e do que sai. Na agenda, o topo diz só "N% de ocupação", e a base e a definição ficam na dica "Como a ocupação é contada".
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:368-384`, `:389-392`
- Antes: KB-05

**OC-06.** Na frase do que saiu do tempo aberto, o nome vem sem gênero ("de Fulano", nunca "da" ou "do"), e o nome da outra unidade só aparece para quem alcança aquela unidade; para quem não alcança, a frase diz "outra unidade".
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:385-388`
- Antes: KB-06

**OC-07.** O dashboard da rede mostra a "Taxa de aproveitamento": os atendimentos concluídos ÷ os marcados ATÉ AGORA (só os horários que já passaram). Ela se chama "Aproveitamento", não "Ocupação", porque a ocupação da unidade é outra conta. Relatórios → Agenda mostra a "Taxa de Conclusão", que conta o período inteiro, até o fim dele, com os que ainda vão acontecer. As dicas das duas dizem por que elas diferem.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:905-906`, `:918-925`, `:1017-1018`
- Antes: KD-02

**OC-08.** O "Status dos agendamentos do período" da Visão geral dos Relatórios conta o período INTEIRO, até o fim dele, com a fatia "Em aberto" (os que ainda vão acontecer); as fatias são as mesmas da aba Agenda, e cada uma diz quantos e o percentual.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:932-938`
- Antes: KD-05

**OC-09.** O topo da agenda da rede mostra Total, Confirmados, Em atendimento, Concluídos, Cancelados e Faltas — o cancelado e a falta são dois números separados.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1370-1374`
- Antes: KE-20

**OC-10.** "Melhor/Pior avaliados" e "Procedimentos melhor/pior avaliados" do dashboard aparecem a partir de UMA nota, sem mínimo; cada linha diz quantas notas tem ("1 aval."), e os piores não repetem quem já está entre os melhores ("Nenhum outro procedimento avaliado no período.").
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:1349-1358`
- Antes: KE-17

**OC-11.** "Profissionais ativos" é quem está ativo e tem o "Atende" marcado em alguma unidade do recorte, tenha atendido no período ou não.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1360-1364`
- Antes: KE-18

**OC-12.** A tabela "Comissões por Profissional" lista quem atende (e quem atendeu no período); a comissão de quem não atende (quem só vendeu, como na venda do pacote) fica numa linha à parte, "Também têm comissão, sem atender: …", sem sumir.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1364-1367`
- Antes: KE-19

## As clientes nos números (CC)

**CC-01.** O "Reativar clientes", nos dois dashboards, conta como visita a "Última visita" trazida do sistema de antes: quem veio há 20 dias no sistema antigo não aparece; quem veio há 120, sim. O quadro diz de onde veio a data: "Última visita há 120 dias · antes do sistema". Nenhum outro número (atendimentos, receita, retenção) conta essa visita.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:646-653`
- Antes: KC-02

**CC-02.** "Novos clientes" só aparece quando a tela mostra a rede inteira (sem unidade escolhida, ou com todas as unidades ativas escolhidas). No recorte de uma unidade, somem o cartão "Novos clientes", a etapa "Novos clientes" dos quadros de clientes, a coluna "Novos" do ranking de unidades e o gráfico "Novos clientes ao longo do tempo" dos Relatórios, e o quadro da unidade se chama "Os agendamentos da unidade". Na rede de uma unidade só, a unidade é a rede e o número aparece.
- Fonte: o Heitor, 2026-11-18: "Só na rede"
- Onde: `docs/regras/indicadores.md:669-682`; `DEVLOG.md:2202`, `:2216`
- Antes: KC-03

**CC-03.** O "Clientes no mês" do dashboard da unidade conta até AGORA, como os cartões: o marcado para mais tarde e o cancelamento de amanhã ainda não entram, e o subtítulo diz "neste mês, até agora". O quadro "Clientes no mês / no período", nos dois dashboards, diz o recorte na dica "O que o quadro conta": contados até agora, os cancelados e as faltas também; Relatórios → Agenda conta o período inteiro, com os que ainda vão acontecer.
- Fonte: o Heitor, 2026-10-29: "não se sabe se o que está agendado vai acontecer"; o lugar da explicação: o Heitor, 2026-11-16: a explicação do número mora na dica, não embaixo dele (`docs/regras/design.md:215`)
- Onde: `docs/regras/indicadores.md:1012-1025`; `DEVLOG.md:11324-11327`; `apps/web/e2e/dicas-relatorios-dashboard.spec.ts`
- Antes: KD-10, KD-11

**CC-04.** O dashboard da rede tem os quadros de clientes do dashboard da unidade: "Clientes no período" (a mesma conta dos cartões, no período escolhido, até agora) e "Reativar clientes". O desenho dos quadros é o mesmo nos dois portais.
- Fonte: o Heitor (H3, na revisão de 2026-11-02): "a dona vê tudo, sempre"
- Onde: `docs/regras/indicadores.md:1051-1053`, `:1087-1088`; `DEVLOG.md:14560-14566`
- Antes: KD-21

**CC-05.** O "Reativar clientes" lista quem SUMIU da rede: cadastrada antes dos últimos 90 dias, sem visita em NENHUMA unidade nesses 90 dias (quem foi a outra unidade não sumiu) e sem horário marcado. Cada linha diz a unidade da última visita concluída (quem nunca veio fica sem unidade); na rede de uma unidade só, a unidade não aparece. É sempre o da rede, no portal da rede e no da unidade, também com uma unidade recortada.
- Fonte: o Heitor (H5, 2026-11-01): "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/indicadores.md:1053-1063`, `:1074-1077`; `CLAUDE.md:349-350`
- Antes: KD-22

**CC-06.** O "Reativar clientes" diz o recorte, o resto e o vazio: o recorte (sem visita há mais de 90 dias; quem tem horário marcado não entra) está na dica "Quem entra no Reativar clientes"; o link diz quantas faltam e o total ("Ver mais 5 (8 no total)"); vazio, diz se ninguém tem visita ainda ("Nenhuma cliente tem visita registrada ainda (30 clientes cadastradas nos últimos 90 dias)…") ou se ninguém sumiu ("Ninguém sumiu: quem já veio voltou nos últimos 90 dias 🎉"), com quantas cadastradas nos últimos 90 dias ainda não têm visita.
- Fonte: princípio 3; o lugar da explicação: o Heitor, 2026-11-16: a explicação do número mora na dica, não embaixo dele (`docs/regras/design.md:215`)
- Onde: `docs/regras/indicadores.md:1064-1077`; `apps/web/e2e/dicas-relatorios-dashboard.spec.ts`
- Antes: KD-23

**CC-07.** O total de clientes do dashboard é sempre o da REDE inteira (as clientes ativas), também com a tela recortada a uma unidade ou na vista pessoal, e a tela diz "N clientes da rede" (ou "da rede") quando está recortada ou na vista pessoal: a vista pessoal da agenda não recorta as clientes.
- Fonte: o Heitor (H5, 2026-11-01): "A cliente é da clínica, pode agendar em qualquer unidade da clínica"
- Onde: `docs/regras/indicadores.md:955-958`, `:967-970`, `:1432-1435`; `CLAUDE.md:349-350`
- Antes: KD-16, KE-31

**CC-08.** Cada quadro de clientes diz de quem fala: o "Reativar" diz "da rede" ou "com horário com você", e o subtítulo do "Clientes no mês" diz se fala das novas clientes da rede ou só dos agendamentos.
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:1436-1439`
- Antes: KE-32

**CC-09.** A retenção é as clientes atendidas no período que já tinham sido atendidas antes dele, sobre as clientes atendidas no período. "Já atendida antes" vale por qualquer pessoa e em qualquer unidade da rede, também quando a tela olha uma unidade só.
- Fonte: o Heitor, 2026-10-29: "A cliente é da clínica, o atendimento é da profissional"
- Onde: `docs/regras/indicadores.md:539-552`; `DEVLOG.md:11123-11126`, `:14574-14575`
- Antes: KB-20

## As oportunidades (FO)

**FO-01.** A conversão é das oportunidades: as que estão na etapa de ganho sobre as oportunidades do funil, sem importar se a pessoa já é cliente ("Já é cliente" é só um filtro, não é conversão). No dashboard, contam as oportunidades criadas no período. Funil sem etapa de ganho não tem conversão: mostra "—".
- Fonte: o Heitor, 2026-10-29: "o objeto é a oportunidade"
- Onde: `docs/regras/indicadores.md:506-515`, `:534-538`
- Antes: KB-17

**FO-02.** Onde a tela junta os funis (o painel de Relatórios → Oportunidades e a coluna "Conv." do ranking por vendedor, com as oportunidades de cada vendedor), a conversão é as ganhas de qualquer funil sobre as oportunidades criadas no período, só dos funis ativos: o funil arquivado não entra. Sem etapa de ganho em nenhum funil ativo, mostra "—". Os motivos de perda dos Relatórios também contam só as oportunidades dos funis ativos.
- Fonte: decisão do Claude (o documento a atribuía ao Heitor, sem a fala dele) — ele respondeu "mudar" ao cartão da conversão na revisão das decisões das frentes (2026-11-02); a forma da mudança e os motivos de perda são do Claude
- Onde: `docs/regras/indicadores.md:516-524`, `:1391`; `DEVLOG.md:14174`, `:14574-14575`
- Antes: KB-18, KE-23

**FO-03.** Relatórios → Oportunidades tem a "Conversão por origem": uma linha por origem da oportunidade ("Sem origem" quando não tem), com as oportunidades, as ganhas e a conversão, sobre as mesmas oportunidades do painel (criadas no período, dos funis ativos, de qualquer responsável). Sem etapa de ganho, mostra "—".
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:525-533`
- Antes: KB-19

**FO-04.** A aba do funil nos Relatórios se chama "Oportunidades", e a tela fala em oportunidades: "Oportunidades recebidas", "Funil de oportunidades", a coluna "Oportunidades" do ranking e da conversão por origem; no dashboard, "Funil de oportunidades por etapa". Muda só o nome: o link antigo da aba continua abrindo.
- Fonte: o Heitor, 2026-11-13: "rl1 ok, rl2 apenas \"Oportunidades\""
- Onde: `docs/regras/indicadores.md:985-995`; `docs/revisao.md:1126`, `:1155-1156`, `:2100`
- Antes: KD-20

**FO-05.** O funil do dashboard abre no funil do endereço; sem ele, no funil padrão — e, se o padrão não tem oportunidade no período, no primeiro funil ativo que tem. Todos vazios, o padrão. A aba Oportunidades dos Relatórios segue a mesma ordem, com um passo a mais logo depois do endereço: o último funil escolhido no seletor, neste navegador.
- Fonte: princípio 7
- Onde: `docs/regras/indicadores.md:1170-1178`
- Antes: KE-01

**FO-06.** O comparecimento da aba Oportunidades conta só os agendamentos (não cancelados) cujo horário já passou: o agendamento de amanhã não entra como falta. Sem nenhum que já devia ter acontecido, a tela mostra "—", não 0%. O "Agendados pelo comercial" conta todo agendamento de origem comercial (AG-17 do Atendimento) do período, inclusive o cancelado depois: é o trabalho do comercial; o que aconteceu é o comparecimento.
- Fonte: princípio 4; o que conta "Agendados pelo comercial": decisão do Claude, 27/11 (35ª, Decisão C4), pela AG-17
- Onde: `docs/regras/indicadores.md:1180-1184`
- Antes: KE-02

**FO-07.** As oportunidades são da rede (a cliente é da rede): o recorte por unidade não vale para elas. Na aba Oportunidades dos Relatórios, com uma unidade escolhida numa rede de mais de uma, os dois cartões que não seguem o recorte se chamam "Conversão (rede)" e "Oportunidades recebidas (rede)", sem nota que explique (o Heitor, 26/11: "intuitivo não é explicativo"); o recorte fica, e recorta os agendamentos. O quadro de oportunidades também não tem recorte por unidade.
- Fonte: decisão do Claude, 26/11 (33ª simulação, A10), pelo princípio 3
- Onde: `docs/regras/indicadores.md:1592-1601`; `docs/regras/crm-inbox.md` (a oportunidade é da rede)
- Antes: (nova, 26/11); antes de 26/11: com uma unidade escolhida, a aba mostrava as oportunidades da rede sem dizer

## O estoque nos Relatórios (ER)

**ER-01.** O valor em estoque conta o saldo na medida de consumo, não em embalagens inteiras (495 ml de frascos de 100 ml a R$ 90 valem R$ 445,50, não R$ 450), e é a mesma conta na aba Estoque dos Relatórios e na coluna "Valor" da tela de Estoque.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:427-432`
- Antes: KB-12

**ER-02.** O gráfico "Valor em estoque por categoria" (Relatórios → Estoque) tem a fatia "Sem categoria" para o produto sem categoria (ou com ela em branco), e as fatias somam o valor em estoque da aba. Com uma categoria só, o gráfico não aparece, e o quadro diz "Todo o valor está em <categoria>", com a dica "Por que não há gráfico".
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:437-445`
- Antes: KB-13

**ER-03.** A seção "Perdas no período" (Relatórios → Estoque) mostra as perdas do período por motivo e por produto: a quantidade e o valor perdidos de cada produto (ao custo do lote de onde saíram), o total de cada motivo e o total geral. A quantidade só aparece por produto, porque medidas diferentes não se somam.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:446-454`
- Antes: KB-14

**ER-04.** A perda é métrica, não dinheiro: não entra no lucro nem no Financeiro. O relatório mostra os cartões "Perdas no período" e "Consumo com perdas" (o insumo consumido mais as perdas), e o cartão diz o motivo certo: "Métrica: não entra no lucro, nem quando a compra é paga". A nota do DRE diz o mesmo da perda e do ajuste.
- Fonte: o Heitor, 2026-11-02 (revisão das decisões das frentes): "perdido ou não, o insumo já foi pago na compra … serve como métrica"
- Onde: `docs/regras/indicadores.md:476-490`; `DEVLOG.md:14160-14180`, `:14577-14578`
- Antes: KB-15

**ER-05.** Relatórios → Estoque tem a seção "Transferências entre unidades": cada lado da transferência é uma linha da unidade dele ("Saiu para X" ou "Entrou de Y"), com a quantidade (na medida do produto e em embalagens) e o custo, que é o custo da saída nos dois lados, porque transferir não muda o valor; com o total de cada unidade por direção. É métrica (não entra no lucro nem no Financeiro), e a seção some na rede de uma unidade só.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:491-505`
- Antes: KB-16

**ER-06.** Relatórios → Estoque tem a seção "Movimentações do período": cada movimento de estoque do recorte de unidades e do período, uma linha — data e hora no fuso da unidade do movimento, produto, tipo (entrada, consumo, venda, perda com o motivo, ajuste, transferência; o desfeito marcado), quantidade (na medida do movimento e em embalagens), lote e validade, unidade (só com mais de uma no recorte), quem fez e o custo; 50 por página, com o total. Aparece onde a aba mostra o estoque da unidade, como as perdas.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-18 (item 6 do escopo): "6 - ok" (`DEVLOG.md:1875`)
- Onde: `docs/regras/indicadores.md:538-552`
- Antes: (sem número: `docs/inventario/leitura.md` §4)

## Relatórios → Vendas (VE)

**VE-01.** A aba Vendas lista as comandas do PDV: uma linha por venda do período — atendimento avulso, pacote, pré-pago, plano, produto e crédito interno —, com o número da comanda (coluna "Comanda", na tela e no CSV; "—" na venda de antes do PDV). O produto vendido dentro do atendimento leva o número da comanda do atendimento. O filtro por tipo tem os seis: "Atendimentos avulsos", "Pacotes", "Pré-pagos", "Planos", "Produtos", "Créditos". Os totais, por tipo e o geral, vêm prontos (a tela não soma).
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-13: "rl1 ok"
- Onde: `docs/regras/indicadores.md:773-777`, `:801-808`; `docs/revisao.md:1126`, `:1152-1154`, `:2099`
- Antes: KC-13

**VE-02.** Só o que foi pago é venda, nos seis tipos: a venda entra na aba Vendas quando há o primeiro pagamento dela que está pago, não é estorno nem foi estornado e tem algum valor (dinheiro, ou pontos e voucher), e na data desse pagamento. O atendimento concluído aguardando o pagamento, o pacote e o pré-pago só com parcela em aberto, o plano aceito e nunca pago e o produto a receber ficam fora até a primeira parcela ser paga; a venda cujo único pagamento foi estornado inteiro sai. O pago com crédito interno é pago.
- Fonte: o Heitor, 2026-11-18: "nao pago nao conta na venda"
- Onde: `docs/regras/indicadores.md:778-800`, `:822-833`, `:858-869`; `DEVLOG.md:1998`, `:2209`
- Antes: KC-14

**VE-03.** O valor de cada venda é o vendido menos o cancelado, o devolvido e o desconto comercial. O parcelado (o cartão em várias vezes, a entrada + parcelas e o crediário) é UMA venda e entra inteiro no dia da primeira parcela paga (ver a Q03). O plano vale a soma dos procedimentos dele, já com o desconto rateado. Pontos e voucher são forma de pagamento, não desconto.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:790-793`, `:825-830`, `:868-869`
- Antes: KC-15

**VE-04.** O atendimento avulso é venda quando foi concluído, tem preço e não consumiu nada já vendido: a sessão de pacote, a unidade do pré-pago e a sessão de plano não são venda de novo.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:822-825`
- Antes: KC-16

**VE-05.** O crédito interno vendido é venda: aparece na lista e no CSV das Vendas e conta no "Total vendido". O que a cliente paga com ele não conta de novo: a venda paga só com crédito interno não entra, e a paga em parte entra no dia do primeiro dinheiro, valendo o resto (a parte paga com crédito sai da linha). Ele não tem quem vendeu e não entra no recorte de venda de nenhuma pessoa.
- Fonte: o Heitor, 25/11: "se o crédito foi vendido, é venda, tem que contar, não conta é quando só usa"; a parte paga com crédito sair da linha da venda (não do crédito): decisão do Claude, 25/11, pela fala
- Onde: `docs/regras/indicadores.md:705-713`, `:809-818`
- Antes: KC-17

**VE-06.** A dica do "Total vendido" diz que o voucher e os pontos pagam parte da venda e não entram no caixa, e que o desconto fica fora dos dois (sem valor, porque o desconto não tem número próprio).
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:819-821`
- Antes: KC-18

**VE-07.** A venda de produto mostra a quantidade em embalagens ("3× Sérum"). A venda de produto estornada sai das Vendas, também do mês em que foi vendida, e o custo dela não é descontado do lucro (também nesse mês).
- Fonte: o Heitor, 2026-11-18: "Uma coisa só foi vendida se foi paga." (sair também do mês dela e o custo fora do lucro: decisão do Claude)
- Onde: `docs/regras/indicadores.md:268-277`, `:831-835`; `DEVLOG.md:12490-12497`
- Antes: KC-19, KA-22

**VE-08.** A venda de produto devolvida em parte vale o que ficou: o valor e a quantidade são os do que ficou com a cliente, e o custo que desconta do lucro também; o que foi devolvido sem voltar ao estoque é perda, no dia da devolução.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:835-842`; `DEVLOG.md:13321`
- Antes: KC-20

**VE-09.** O pacote cancelado e o pré-pago com unidades canceladas valem o que ficou (o pacote, o usado; o pré-pago, o vendido menos as unidades canceladas); o que caiu inteiro (nenhuma sessão feita, todas as unidades canceladas) sai das Vendas e do CSV. Estornar só um pagamento do pacote não muda o valor da venda; se era o único pagamento, a venda sai até outro ser pago, e a data passa a ser a do primeiro pagamento que ficou.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:850-857`; `DEVLOG.md:12598-12599`
- Antes: KC-21

**VE-10.** O plano cancelado vale nas Vendas o que foi usado, como o pacote; o que caiu inteiro sai.
- Fonte: o Heitor, 2026-11-07: "usa a mesma coisa do pacote"
- Onde: `docs/regras/indicadores.md:869-872`; `DEVLOG.md:13529`
- Antes: KC-22

**VE-11.** Em todo tipo de venda, inclusive o plano, a coluna "Profissional" e o recorte por pessoa ("venda dela") são de quem está em "Quem vendeu", não de quem é responsável pelo plano. Sem "Quem vendeu", a venda fica no total, sem nome na coluna e fora do recorte de qualquer pessoa.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:872-883`
- Antes: KC-23

**VE-12.** A lista, o total e o CSV das Vendas vão até o fim do período escolhido. O CSV traz o mesmo recorte da tela, sem paginar, com as colunas Data, Comanda, Tipo, Descrição, Cliente, Profissional, Unidade e Valor, e o nome do arquivo diz o primeiro e o último dia no fuso do negócio (outubro: "vendas-2026-10-01-a-2026-10-31.csv").
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:884-891`
- Antes: KC-24

**VE-13.** O crédito interno concedido sem dinheiro (a cortesia, a compensação: CI-02 do catálogo de Vendas e financeiro) não é venda: não aparece nas Vendas nem conta no "Total vendido". Usado para pagar, sai da linha da venda como o crédito vendido (VE-05) e não é receita (RE-02): a Drenagem de R$ 140 paga com R$ 100 de cortesia e R$ 40 no Pix vale R$ 40 nas Vendas e no caixa.
- Fonte: decisão do Claude, 26/11 (31ª simulação, C10) — pela fala do Heitor da VE-05 (25/11: "não conta é quando só usa"); a cortesia não entrou como dinheiro nem foi vendida
- Onde: (ainda não está em `docs/regras/indicadores.md`; o sistema já faz isso, visto na 31ª simulação); VE-05, RE-02
- Antes: (nova, 26/11)

## O dinheiro só com o Financeiro (FV)

**FV-01.** O dinheiro dos dashboards — o faturamento, o custo, o lucro, a evolução, o ranking de unidades, os rankings de procedimento e de profissional por receita e por margem, o "Valor gasto" das clientes e o valor por CEP — só vai a quem tem o Financeiro em Ver (fora a vista pessoal, VP-01; o ticket médio segue a TM-03). Sem ele, os cartões não aparecem e o valor nem chega ao navegador; ter só a aba Oportunidades ou os Procedimentos não abre esse dinheiro.
- Fonte: o Heitor, 2026-11-23: "financeiro é uma coisa, vendas é outra. financeiro ve entrada/saida/lucro, tudo. vendas é sobre performance de vendas"
- Onde: `docs/regras/indicadores.md:1111-1124`; `DEVLOG.md:1865-1868`
- Antes: KD-25

**FV-02.** Na Visão geral dos Relatórios, a entrada, a saída e o lucro só aparecem com o Financeiro pelo menos em Ver. Sem ele saem o Faturamento, as Despesas pagas (caixa), o Lucro, a Evolução do Período, o Faturamento por Unidade e a Forma de Pagamento — e esses números nem chegam ao navegador; ficam os Atendimentos, os Novos Clientes, o Ticket médio, os Top 5 Procedimentos e Profissionais e o Status dos agendamentos.
- Fonte: o Heitor, 2026-11-23: "financeiro é uma coisa, vendas é outra. financeiro ve entrada/saida/lucro, tudo. vendas é sobre performance de vendas" (a lista cartão a cartão é do Claude, pela fala)
- Onde: `docs/regras/indicadores.md:1225-1241`; `docs/revisao.md:2237`
- Antes: KE-05

**FV-03.** A receita dos atendimentos e os Top 5 por receita dos Relatórios continuam à vista de quem não tem o Financeiro.
- Fonte: o Heitor, 2026-11-23: "acho que ok, ainda nao sei"
- Onde: `docs/revisao.md:2244`; `docs/regras/indicadores.md:1238-1240`; `DEVLOG.md:1847`
- Estado: em aberto, se o Heitor quiser rever (`docs/revisao.md:2244`) — ver a Q04
- Antes: KE-07

**FV-04.** Na aba Vendas, a explicação "Como o Total vendido se liga ao caixa" só mostra o valor do caixa a quem tem o Financeiro.
- Fonte: recomendação do Claude aprovada pelo Heitor, 2026-11-23: "ok"
- Onde: `docs/regras/indicadores.md:1225-1227`, `:1242-1243`
- Antes: KE-08

## As vistas pessoais (VP)

**VP-01.** Nos dashboards, quem tem o módulo vê os números de todos, nas unidades ao seu alcance (as dela, ou a rede toda com "A rede inteira"). Não há recorte por pessoa, a não ser a vista pessoal: quem atende e não tem a Agenda vê no dashboard da unidade a agenda e as clientes DELA (atendimentos, agendamentos, minutos, clientes); quem atende ou tem comissão no nome dela e não tem o Financeiro vê o dinheiro DELA nos dois dashboards (no da rede, como "Minha receita", só quando não vê o dinheiro de todos). O CRM não tem vista pessoal: o funil do dashboard é sempre o de todas as oportunidades (quem quer só as suas usa o filtro de responsável). A vista pessoal só existe com a funcionalidade no plano.
- Fonte: o Heitor, 2026-11-23: "pode tirar, as vistas pessoais resolvem, no crm acho que não se aplica diretamente e talvez o melhor caminho seja pelo filtro de dono da oportunidade, quem quer ver só as oportunidades que é dono, aplica o filtro"
- Onde: `docs/regras/indicadores.md:1091-1109`, `:1126-1130`, `:1167-1168`; `docs/revisao.md:1293-1296`, `:2214-2217`; `DEVLOG.md:1889`; `CLAUDE.md` §11 ("As vistas pessoais")
- Antes: KD-24

**VP-02.** Na vista pessoal, "o que é dela" é: o atendimento em que ela é a profissional do agendamento; a cliente que tem agendamento NÃO cancelado com ela numa unidade do recorte (o total, os novos clientes, a demografia, a recorrência e o gasto).
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1134-1136`, `:1154-1157`
- Antes: KD-26

**VP-03.** Na vista pessoal, o dinheiro dela é o pagamento ligado a um atendimento dela e o da venda que ela fez (ela em "Quem vendeu": produto, pacote, pré-pago e plano), no dia de cada pagamento: o pago à vista, inteiro no dia da venda; o crediário, parcela a parcela, quando entra. A sessão de pacote, de plano ou pré-paga que ela atende não soma de novo (o dinheiro é de quem vendeu). O "Meu faturamento" é de VENDA; o ranking por profissional é de EXECUÇÃO.
- Fonte: o Heitor, 2026-11-03: "o pacote soma inteiro para quem vendeu, é óbvio, não faz nem sentido não ser assim"
- Onde: `docs/regras/indicadores.md:1136-1153`, `:1211-1214`; `DEVLOG.md:14370-14372`
- Antes: KD-27

**VP-04.** Para quem tem a vista pessoal do dinheiro, o dashboard mostra o "Meu faturamento do mês": a VENDA dela — as vendas em que ela é a "Profissional" da venda (quem atendeu o avulso; quem está em "Quem vendeu" do pacote, do pré-pago, do produto e do plano; a venda sem "Quem vendeu" não é de ninguém) —, no dia do pagamento. A dica explica os três números que ela vê: o "Meu faturamento" (a venda dela, no dia do pagamento), a receita dos atendimentos dos Relatórios (a execução, no dia em que fez) e as comissões (a parte dela). A mesma dica diz o que fica fora: "A sessão de pacote, de plano ou pré-paga que você atende não entra aqui: o dinheiro é de quem vendeu. Ela aparece nas suas comissões e na receita dos atendimentos dos Relatórios." À vista fica o número; a explicação mora na dica.
- Fonte: princípio 3; a explicação na dica: o Heitor, 2026-11-16: "pode tirar esse monte de aviso e explicação, se quiser manter bota em um tooltipzinho que só aparece se passar o mouse em cima. Aproveita e faz esse ajuste pra todo sistema." (`docs/regras/design.md`, "A explicação mora na dica"); o que fica fora na dica, e não embaixo do número: decisão do Claude, 25/11 (o Heitor revisa), por essa fala, que é mais nova que a A33 da 10ª simulação (10/11)
- Onde: `docs/regras/indicadores.md:1186-1206`, `:1212-1215`, `:1250-1270`; `docs/regras/design.md:215-232`; `apps/web/app/[slug]/dashboard/page.tsx:486-492` (`DEFINICOES.foraDoMeuFaturamento` dentro da `Dica`)
- Antes: KE-03, KE-04

**VP-05.** Na vista pessoal, o dashboard mostra o dela: receita, atendimentos, ticket, a evolução só da receita, os rankings de procedimentos (feitos, recorrência, receita bruta), o de profissionais (só a linha dela) e o de clientes (gasto, recorrência), a faixa etária, as cidades e o mapa, o total de clientes e os novos clientes (onde esse número existe, no recorte da rede, CC-02), o giro (o insumo dos atendimentos dela) e, no da unidade, o "Meu faturamento" dos 6 meses. Os planos propostos e as clientes a reativar são os de todos. Fica escondido o que não se atribui a ela: o custo, o lucro, a margem por procedimento, o ranking e a ocupação por unidade, e o ranking de comissão.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1107-1108`, `:1159-1168`
- Antes: KD-28

**VP-06.** No dashboard da unidade, a vista pessoal de quem atende em mais de uma unidade ("Minhas comissões", "Meus atendimentos", "Meus agendamentos hoje", o "Meu faturamento" e o ticket dela) soma todas as unidades ativas em que ela atende e diz "nas 2 unidades"; o horário de outra unidade diz qual é.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1426-1431`
- Antes: KE-30

## O dashboard e o recorte por unidade (DB)

**DB-01.** No quadro do ciclo dos dois dashboards, quem não tem a Agenda (nem a vista pessoal dela) não vê as etapas da Agenda — em vez de um "Agendamentos 0" num dia com agendamentos; quem atende sem a Agenda vê nelas os números dela (a vista pessoal, VP-01).
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:1026-1029`, `:1126-1130`; `docs/revisao.md:1293`, `:2215`
- Antes: KD-12

**DB-02.** No dashboard da unidade, a etapa "Agendamentos" diz quantos ainda vêm hoje ("2 ainda hoje"): os de hoje depois de agora, sem os cancelados, as faltas, os concluídos e os que estão em atendimento. O recorte "até agora" do número continua.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1030-1036`
- Antes: KD-13

**DB-03.** O gráfico de evolução (dashboard da rede e Relatórios) diz o que é cada ponto: a hora ("03h") no "Hoje", a data ("04/11", no fuso do negócio) por dia, no eixo e no tooltip. O eixo não repete rótulo (guarda a casa decimal: "1,5k"), a linha é reta entre os pontos (não inventa subida antes do primeiro dia com valor) e o ponto de cada dia fica à vista (até 45 pontos). O mesmo eixo vale no fluxo de caixa.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1037-1050`
- Antes: KD-14

**DB-04.** O dashboard da rede pode mostrar uma unidade só ("ver esta unidade", pelo endereço da página): o título é a unidade, os números são os dela (o núcleo, as séries, os rankings, o hoje, o estoque), os quadros "por unidade" saem como na rede de uma unidade só, e "Ver a rede inteira" volta guardando o período. Só se recorta uma unidade ao alcance da pessoa; um valor desconhecido mostra a rede; com uma unidade só não há recorte. O nome da unidade no "Ranking de unidades" leva a esse recorte. O funil de oportunidades continua o da rede.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:947-955`
- Antes: KD-15

**DB-05.** Os Relatórios também guardam a unidade escolhida no endereço da página (o seletor de unidade a grava), como o dashboard; e o endereço em português ("relatorios", no portal da rede e no da unidade) leva aos Relatórios, com o que veio no endereço.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:959-966`
- Antes: KD-17

**DB-06.** O mapa do dashboard localiza cada unidade pelo CEP dela (pela cidade só quando não há CEP) e abre enquadrando as unidades e as clientes; tudo no mesmo ponto, ele centraliza com zoom de bairro.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:972-978`
- Antes: KD-18

**DB-07.** No mapa, um marcador não esconde o outro: as unidades no mesmo ponto (cerca de 150 m) se afastam um pouco em volta dele e o nome diz "(local aproximado)"; as que estão perto (cerca de 3 km) ficam onde estão, com os nomes em lados diferentes.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:979-983`
- Antes: KD-19

## A rede de uma unidade só (UU)

**UU-01.** Na rede com UMA unidade ativa, some o que só faz sentido com duas: o dashboard da rede se chama "Visão geral" (sem "N unidades") e não tem o "Ranking de unidades"; o Financeiro da rede fica sem "Por unidade", "Total rede" e o filtro de unidade; os Relatórios ficam sem "Faturamento por Unidade" e "Saúde do Estoque por Unidade"; o estoque, sem "Consolidado / Por unidade" e "TOTAL REDE"; o portal da unidade, sem "Voltar para a rede" e sem o seletor de unidade; o "Hoje" do dashboard da rede, sem a linha por unidade (fica só a conta do dia); o Financeiro, sem o "N unidades" do subtítulo. Fica o que é dado, não recorte: o nome da unidade nos cartões e no recibo. Os números não mudam, e tudo volta quando nasce a segunda unidade.
- Fonte: o Heitor, 2026-10-29: "Com UMA unidade ativa, somem os termos e gráficos de rede … e o seletor de unidade. O modelo não muda: tudo volta quando nascer a segunda unidade."; o "Hoje" e o subtítulo do Financeiro: decisão do Claude, 27/11 (37ª, Decisão E1), pelo mesmo critério (some o que só é recorte por unidade, como o "Ranking de unidades" e o seletor do estoque); a coluna UNIDADES da lista de procedimentos com uma unidade (o teste `tests/atritos-da-16.test.ts:186` exige o chip com o nome dela): foi ao Heitor, 27/11 (R30)
- Onde: `docs/regras/indicadores.md:895-913`; `DEVLOG.md:12282`; `apps/web/components/admin/admin-dashboard-view.tsx`, `apps/web/components/admin/admin-financial-view.tsx`
- Antes: KD-01; antes de 27/11: com uma unidade, a linha por unidade do "Hoje" e o "1 unidade" do Financeiro continuavam à vista (A14 da 37ª)

## Os anúncios (AN)

**AN-01.** Nos números dos anúncios, zero é um dado: "zero clique" aparece como 0. "Indisponível" só aparece quando a origem não mandou o número.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:553-556`
- Antes: KB-21

**AN-02.** As médias de referência dos anúncios são ponderadas pelo que as sustenta: o retorno e o custo por aquisição pelo investimento, a taxa de cliques pelas impressões. Uma campanha de R$ 5 não dita a régua das outras.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:557-559`
- Antes: KB-22

**AN-03.** O cartão de anúncios do Marketing mostra o mesmo período da tela (o mês, 15 dias, o personalizado), e o gasto e o alcance são os da conta de anúncios inteira: o alcance é de pessoas únicas, não a soma das campanhas. Sem o resumo da conta, "—".
- Fonte: princípio 3
- Onde: `docs/regras/indicadores.md:1416-1420`
- Antes: KE-27

## O filtro de Tags nos Relatórios (TF)

**TF-01.** Os Relatórios têm o filtro "Tags" ao lado do período, com as tags da rede como opções; a rede sem tag nenhuma não vê o filtro. A escolha fica no endereço da página, trocar a tag volta à primeira página, e a tag escolhida que saiu da lista da rede continua marcada, para dar para desmarcar.
- Fonte: o Heitor, 2026-11-13: "Então ela cria uma tag com o que ela quiser e depois, onde tiver for passível de filtro, um dos filtros que ela pode usar são as tags."
- Onde: `docs/regras/indicadores.md:1454-1468`; `CLAUDE.md` §1
- Antes: KE-34

**TF-02.** Nos Relatórios, a tag filtra PESSOAS: a linha entra pela cliente dela, sem distinguir maiúscula de minúscula ("VIP" e "vip" são a mesma). A linha sem cliente (a venda sem ficha, o lançamento sem cliente, a comissão sem atendimento nem lançamento de cliente) sai enquanto houver tag marcada.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1471-1476`
- Antes: KE-35

**TF-03.** Na aba Oportunidades, a tag é a da PESSOA da oportunidade — a cliente ligada e, sem cliente, o contato —, no funil, no total, na conversão, no ranking, nos motivos de perda e na conversão por origem; a oportunidade não tem tag própria. Os atendimentos comerciais (agendados, realizados, comparecimento) usam as tags da cliente deles.
- Fonte: o Heitor, 2026-11-18: "a tag é da pessoa e pode ter mais de uma tag"
- Onde: `docs/regras/indicadores.md:1477-1487`; `DEVLOG.md:1990`
- Antes: KE-36

**TF-04.** O filtro de Tags aparece nas abas de pessoas — Vendas (a lista, o resumo e o CSV), Agenda, Clientes, Procedimentos, Profissionais e Oportunidades —, e nelas os números do topo (o dinheiro, os atendimentos, as novas clientes, as comissões) e o período anterior da comparação seguem o mesmo filtro. "Profissionais ativos" não muda com a tag: é a equipe, não uma cliente.
- Fonte: decisão do Claude
- Onde: `docs/regras/indicadores.md:1488-1492`
- Antes: KE-37

**TF-05.** O filtro de Tags não aparece no Estoque (não há pessoa): ali a tag do endereço não muda conta nenhuma. A Visão geral e o Financeiro dos Relatórios têm o filtro: a receita, os atendimentos, o ticket, a receita por unidade, forma e categoria, as parcelas pendentes, o insumo consumido e o produto vendido, a taxa da maquininha e as comissões vão pela cliente; a despesa, a compra de estoque, o fechamento das comissões, as perdas e as compras no estoque (sem cliente) saem enquanto houver tag — e o lucro, a margem, o DRE e o gráfico de evolução são dessas mesmas linhas. A dica do filtro diz isso.
- Fonte: a regra das Tags (o Heitor, 2026-11-13: "onde tiver for passível de filtro, um dos filtros que ela pode usar são as tags"), pela revisão de 24/11 (Q05); o que sai com a tag: princípio 3
- Onde: `docs/regras/indicadores.md:1555-1570`
- Antes: KE-38

## Perguntas ao Heitor

Revisão de 24/11 (o Heitor, 24/11: "da uma revisada se as perguntas realmente faz sentido, as vezes tu me perguntas que são coisas obvias e se resolvem fácil com um pouco de logica sobre o contexto"). Ficam na página só a Q03 (a venda parcelada nas Vendas) e a Q04 (a receita dos atendimentos sem o Financeiro, que você deixou em aberto em 23/11). As outras se resolveram por uma regra dele ou pela lógica do contexto; cada uma diz como, no começo. Revisão de 25/11 (o Heitor, 24/11: "Em teoria não é pra ter pergunta de regra e de escopo, as regras já foram definidas e o escopo também."): a Q03 e a Q04 foram decididas pelo Claude, pelos princípios, para o Heitor revisar.

Q01. **Resolvida na revisão de 24/11:** A sua regra (CLAUDE.md §1: "Regra decidida pelo Claude diz que é dele; só se atribui ao Heitor o que a fala dele diz") já responde: sem a fala, a regra é decisão do Claude, e a fonte foi trocada. O conteúdo segue no catálogo para a revisão da área. — *Era:* **Estas regras são suas? Escritas como decisão sua, sem a sua fala.** (1) O atendimento conta no dia da hora marcada, ou no da conclusão quando ela veio antes — "a hora que vier primeiro" (OC-01; `DEVLOG.md:11486-11488`, `docs/regras/indicadores.md:163-175`). (2) O ticket médio é a média de quanto cada cliente gasta, não a média por atendimento, e é o mesmo número do antigo "Gasto médio", com o nome "Ticket médio" (TM-01, TM-02; `DEVLOG.md:11312-11320`: "Revisto pelo Heitor (2026-10-29)", sem aspas). (3) A conversão que junta os funis conta só os funis ativos (FO-02): você respondeu "mudar" ao cartão na revisão de 02/11 (`DEVLOG.md:14174`), mas a forma da mudança está escrita sem as suas palavras. (4) O ranking por profissional conta atendimentos, não execuções (RA-09): o levantamento de 11/11 registra que você escolheu a opção a, sem as suas palavras (`docs/regras/indicadores.md:1336-1341`). (5) A frase "contar no dia que foi feita", que o texto dá como sua, sem data, para a receita dos atendimentos (RA-03; `docs/regras/indicadores.md:1264`), enquanto o registro daquela entrega diz "nenhuma pergunta ao Heitor" (`DEVLOG.md:14207-14209`); a regra vale de qualquer jeito pelo princípio 5. Confirma as cinco?

Q02. **Resolvida na revisão de 24/11:** Contar a "Compra de estoque" no lucro descontaria o produto duas vezes (ele já entra no lucro como insumo consumido ou custo do produto vendido): ela conta só no caixa. É a mesma lógica da movimentação de estoque que nunca gera despesa. Fica. — *Era:* **A despesa lançada como "Compra de estoque" fica fora do lucro?** O lucro desconta o insumo consumido e o custo do produto vendido; para o produto não ser descontado duas vezes, a despesa "Compra de estoque" conta só no caixa, não no lucro (LU-01). Esse desenho foi do Claude sobre a sua fala de 29/10 sobre a movimentação do estoque não gerar outra despesa ("pagar 2x"), e o registro diz que você não o fechou ("ele não fechou; muda se quiser", `DEVLOG.md:11211`; `docs/regras/indicadores.md:229-232`). O catálogo do Atendimento já o dá como seu (a movimentação de estoque que nunca gera despesa). Confirma?

Q03. **Decidida pelo Claude, 25/11 (o Heitor revisa):** (a) Fica como está: entra inteira no dia da primeira parcela paga. Relatórios → Vendas conta o que foi VENDIDO, e a sua fala diz quando: "Uma coisa só foi vendida se foi paga." — a primeira parcela paga é a cliente comprando; o resto é o que ela deve à rede, no "A receber". O dinheiro, parcela a parcela, já tem o seu lugar: o caixa e o faturamento contam cada parcela no dia em que entrou (princípio 5). A (c) faria das Vendas uma cópia do caixa, e a (b) deixaria fora das Vendas, por meses, o plano que a cliente comprou e já começou a pagar. Nada muda no código. — *Era:* **A venda parcelada entra nas Vendas inteira já na primeira parcela paga?** Pela sua fala "nao pago nao conta na venda" e "Uma coisa só foi vendida se foi paga.", o plano, o pacote e o pré-pago no crediário entram em Relatórios → Vendas com o valor INTEIRO no dia em que a primeira parcela é paga, mesmo com as outras em aberto (VE-02, VE-03). O texto diz que essa leitura é do Claude (`docs/regras/indicadores.md:790-793`, `:862-867`). Qual fica?
- (a) Fica como está: entra inteira no dia da primeira parcela paga.
- (b) Entra só quando estiver paga inteira, no dia da última parcela.
- (c) Entra parcela a parcela, cada uma no dia em que foi paga.

Q04. **Decidida pelo Claude, 25/11 (o Heitor revisa):** Fica como está — as duas telas seguem a mesma regra: quem vê o dinheiro é decidido por uma permissão que a rede dá. Nos Relatórios, a rede escolhe em Cargos quais abas cada cargo vê (`role_report_tabs`, princípio 1); a sua resposta de 23/11 ("acho que ok") aceitou a receita dos atendimentos ali. O dashboard abre para todos, sem escolha de aba, então o ranking por receita só vai a quem tem o Financeiro. Nada muda no código. — *Era:* **A receita dos atendimentos sem o Financeiro: os Relatórios mostram, o dashboard não.** Nos Relatórios, a receita dos atendimentos e os Top 5 por receita ficam à vista de quem não tem o Financeiro (a sua resposta de 23/11: "acho que ok, ainda nao sei", FV-03); no dashboard, os rankings de procedimento e de profissional por receita só vão a quem tem o Financeiro (FV-01, `docs/regras/indicadores.md:1111-1117`). O mesmo número aparece numa tela e some na outra. Qual fica?
- (a) O dashboard segue os Relatórios: o ranking por receita dos atendimentos aparece sem o Financeiro.
- (b) Os Relatórios seguem o dashboard: a receita dos atendimentos e os Top 5 por receita só com o Financeiro.

Q05. **Resolvida na revisão de 24/11:** A sua regra das Tags ("onde tiver for passível de filtro, um dos filtros que ela pode usar são as tags") já decide: a Visão geral e a aba Financeiro dos Relatórios têm filtros, então ganham o de Tags. Defeito a corrigir. — *Era:* **O filtro de Tags na Visão geral e no Financeiro dos Relatórios.** A sua regra é que a tag é filtro "onde tiver for passível de filtro" (13/11). A tela Financeiro já filtra por tag (o a receber, o a pagar, as movimentações — `DEVLOG.md:1996`), mas a Visão geral e a aba Financeiro dos Relatórios não têm o filtro, porque o Claude julgou que um lucro filtrado por tag não é de ninguém (TF-05, `docs/regras/indicadores.md:1493-1496`). Qual fica?
- (a) Fica como está: sem o filtro de Tags nessas duas abas.
- (b) As duas abas ganham o filtro de Tags, como a tela Financeiro.

## Divergências

O texto de `docs/regras/` (ou de outro catálogo) contra a regra de hoje — para corrigir depois.

- FU-02, FU-05: `docs/regras/indicadores.md:26-27` põe as campanhas das 09:00 e o aniversário no fuso da UNIDADE; o próprio arquivo em `:42` e `:53-55`, e `docs/regras/automacoes.md:442-451` (18/11: a cliente é da rede, e o dia do aniversário é o do fuso da rede), os põem no fuso da rede.
- FU-06: `docs/regras/indicadores.md:61` compara o público da campanha com o dia da unidade; `docs/regras/automacoes.md:445-451` (auditoria de 18/11) passou o "sem retorno desde" e o "cliente desde antes de" do público ao fuso da rede.
- FU-07: `docs/regras/vendas-financeiro.md:1911-1913` (07/11) e o catálogo de Vendas e financeiro (a parcela vencida, CR-09) dizem que vencida é a conta com o vencimento antes de hoje "em Brasília"; desde o fuso da unidade (o Heitor, 11/11, "Não, deixa a clinica configurar o seu fuso"), o "hoje" que decide é o da unidade (`docs/regras/indicadores.md:70-71`, `:133-135`).
- FU-02: o catálogo do Atendimento diz que a semana da agenda agrupa "pelo dia de Brasília, na unidade e na rede" (AG-22) e que a chegada vale no dia do agendamento "(Brasília)" (AG-33), contra o fuso da unidade de 11/11 — a conferir na área da agenda (`docs/regras/atendimento.md:273-274`, `:579`).
- FU-01: o levantamento do módulo Relatórios (`docs/revisao.md:1146-1148`, 13/11) lista entre as regras dos números "o fuso de Brasília"; desde 11/11 o fuso é o da unidade.
- OC-04: `docs/regras/indicadores.md:363` conta a "Ocupação hoje" da Minha agenda pelos "minutos dela no dia de Brasília"; pelo fuso da unidade (11/11), é o dia da unidade.
- LU-04: `docs/regras/indicadores.md:283-284` diz que as taxas do lucro "são as que o Fechamento do dia mostra" e `:308-309` que a "taxa estimada" do Fechamento continua informativa; as taxas estimadas foram para o Financeiro (`docs/revisao.md:1997`) e saíram do Fechamento em 16/11 (`DEVLOG.md:4964-4972`).
- RE-10: `docs/regras/indicadores.md:130-132` diz que o Fechamento do dia passou a citar também as parcelas e os lançamentos em aberto da unidade; em 16/11 o Fechamento ficou só com os avisos de comandas abertas e de dinheiro depois do fechamento (`DEVLOG.md:4964-4969`), e os concluídos a receber viraram as comandas abertas do PDV (`docs/revisao.md:1994`).
- FO-03: `docs/regras/indicadores.md:529-530` diz que a conversão por origem conta as oportunidades do painel com "o \"só os meus\""; o "só os meus" saiu em 23/11 (`docs/revisao.md:1293-1296`, `:2214-2216`): são todas as oportunidades do painel, de qualquer responsável.
- OC-05: `docs/regras/indicadores.md:370-371` ainda diz que o topo da agenda mostra a base da ocupação ("340 min agendados de 2.720 min abertos…"); o trecho mais novo do mesmo arquivo (`:389-392`) levou a base, na agenda, para a dica, e só o dashboard da unidade a mostra à vista.
- CC-09: `docs/regras/indicadores.md:543-545` diz que os Relatórios deixaram de passar a retenção por pessoa que atende "desde a SM4"; a decisão de 23/11 que tirou dos Relatórios "a minha unidade × a rede inteira" (`docs/revisao.md:2217`) não é essa — o que tirou a vista por pessoa foi o fim do "só os meus" (`docs/revisao.md:2214`). A regra não muda; só a referência do texto.
- VE-05: `docs/regras/vendas-financeiro.md:1302-1305` diz que, nas Vendas dos Relatórios, o crédito interno vendido "NÃO aparece"; a aba que lista as comandas do PDV, crédito incluído (aprovada em 13/11, "rl1 ok"; `docs/revisao.md:1152-1154`, `:2099`), e `docs/regras/indicadores.md:711-713`, `:809-818` o põem como linha, fora do "Total vendido".
- VE-02: `docs/regras/vendas-financeiro.md:1186-1188` diz que o produto entra no relatório de vendas "na data da venda", e a ponte das Vendas com o caixa (`:2061-2063`) diz "O Total vendido é a venda, no dia em que foi feita"; desde 18/11 ("nao pago nao conta na venda", `DEVLOG.md:1998`) toda venda entra no dia do primeiro pagamento pago (`docs/regras/indicadores.md:778-800`).
- LU-09: `docs/regras/indicadores.md:733` diz que o DRE tem a linha "− Insumos consumidos"; desde que o custo do produto vendido entrou na mesma conta, a linha é "− Insumos e produtos vendidos" (`:258`, `:736-739`).
- UU-01: `docs/regras/indicadores.md:907-908` diz que, na rede de uma unidade, os Relatórios mostram "o nome da unidade no lugar de 'Rede'"; a decisão de 16/11 (`docs/revisao.md:2140`; `docs/regras/design.md:160-169`) é que o rótulo que é só a rede ("Rede", "Da rede", "Toda a rede") mostra o NOME DA REDE.
- CC-07: `docs/regras/indicadores.md:968-969` diz que, recortada a uma unidade, a tela diz "N clientes da rede" também "no cartão de novos clientes"; desde 18/11 ("Só na rede", CC-02) esse cartão não aparece no recorte de uma unidade.
- DB-01: `docs/regras/indicadores.md:1026-1029` diz que, sem a Agenda, o quadro não mostra as etapas da Agenda porque não conta os agendamentos para quem não tem a Agenda; a vista pessoal (23/11, `docs/revisao.md:2215`; `docs/regras/indicadores.md:1097-1099`) conta os agendamentos DELA para quem atende sem a Agenda: a etapa some só para quem não tem a Agenda nem a vista pessoal.
- FV-01: `docs/regras/indicadores.md:1116-1118` ainda dá o dinheiro do dashboard a quem tem "o Financeiro OU a aba Financeiro dos Relatórios"; desde 23/11 a aba Financeiro só vale com o Financeiro (o próprio texto, `:1118-1119`, diz que "na prática" é só o Financeiro). O texto deve dizer só o Financeiro.
- TM-03, FV-01: `docs/regras/indicadores.md:1111-1117` põe o ticket na lista do dinheiro do dashboard que só vai a quem tem o Financeiro; a sua fala de 23/11 ("ticket médio é parametro/metrica, não é algo/operação financeira", `docs/revisao.md:2243`) tira o ticket do Financeiro, como já é nos Relatórios. O ticket do dashboard deve seguir a mesma regra.
- VP-03: `docs/regras/indicadores.md:1136-1153` lista como dinheiro dela só o atendimento, o produto, o pacote e o pré-pago que ela vendeu; o mesmo arquivo em `:1211-1214` define a venda dela com o PLANO também, como a comissão de venda (catálogo das Comissões, a comissão de quem está em "Quem vendeu"). O trecho deve incluir o plano.
- VP-05: `docs/regras/indicadores.md:1164` fala em "planos aguardando checkout"; o plano nesse estado se chama "Proposto" em toda tela (`docs/regras/atendimento.md:2414-2415`; `DEVLOG.md:4102-4103`, `:2131-2132`).
- VP-05: `docs/regras/indicadores.md:1155` e `:1163` contam "os novos clientes" dela na vista pessoal sem dizer que, desde 18/11, o número só existe no recorte da rede inteira (CC-02); no dashboard de uma unidade, numa rede com duas ou mais, ele não aparece.
- VP-04: `docs/regras/indicadores.md:1187-1188` diz que a vista pessoal do dinheiro é "de quem atende ou tem comissão de venda"; em 23/11 (`docs/revisao.md:2238`, "vamos pela sua recomendação"; `CLAUDE.md` §11: "o percentual próprio ou uma comissão gravada") ela é de quem tem comissão no nome dela. A mesma frase já foi apontada no catálogo das Comissões.
- VP-04 (o lugar do texto): `docs/regras/indicadores.md:1264-1270` diz que o "Meu faturamento" "diz à vista o que fica fora", "embaixo do número" (A33 da 10ª, 10/11); desde 16/11 a explicação mora na dica (`docs/regras/design.md`, "A explicação mora na dica"), e o código já a põe dentro da dica (`apps/web/app/[slug]/dashboard/page.tsx:486-492`; o comentário de `apps/web/lib/metrics/definicoes.ts:69-70` ainda diz "à vista, embaixo"). O texto da regra é o que muda.
- TF-02: `docs/regras/indicadores.md:1470-1474` põe "com várias tags, entra quem tem TODAS (E)" entre as decisões do Claude; desde 19/11 ela é do Heitor (`DEVLOG.md:2007`: "Quem tem TODAS (E)").
- FO-05, TF-03, TF-04: `docs/regras/indicadores.md:1173`, `:1477` e `:1489` ainda chamam a aba de "Comercial"; desde 13/11 ela se chama "Oportunidades" (`docs/revisao.md:2100`; só o nome que se lê, a chave interna fica).

## Ficou fora do catálogo

Nenhum número de rascunho ficou fora. O rascunho KC deixou fora, sem número, por serem prática de teste ou regra técnica do sistema inteiro (CLAUDE.md §14, `docs/regras/e2e.md`): todo indicador com o valor esperado escrito à mão no teste (`docs/regras/indicadores.md:663-667`), como a aba dos Relatórios lê os agregados (`:717-721`) e o aviso de recarregar o esquema depois de criar uma função no banco (`:758-760`).

## É de outra área

Nenhum número de rascunho é de outra área: o que os rascunhos apontaram como já catalogado em outra área veio sem número, e aqui só se cita. Do catálogo de Vendas e financeiro (`docs/catalogo/vendas-financeiro.md`): o crédito em várias vezes como um pagamento só, com as parcelas no "A receber da operadora" (MQ-01), o "A receber da operadora" e o fluxo no líquido (MQ-05), o fluxo de caixa dos próximos meses (FN-12), o "A receber da cliente" e a lista do em aberto (FN-09, FN-10, FN-11), a parcela vencida (CR-09, CR-10; com a divergência do fuso acima), o estorno e a maquininha no Fechamento do dia (FC-11, FC-15), o CSV do fechamento (CS-04), o crédito interno vendido como receita no dia em que o dinheiro entrou (CI-03), o pacote trazido de fora (PA-24, PA-25), "Quem vendeu" (VD-07) e a taxa gravada em cada lançamento (MQ-14). Do catálogo do Atendimento (`docs/catalogo/atendimento.md`): a movimentação de estoque que não gera despesa (ES-13), o custo pelo lote de onde a quantidade saiu (ES-18), o produto e a unidade desativados com saldo (ES-22), os motivos que entram e saem das "Perdas no período" (ES-15, ES-16, ES-26, ES-27, ES-28), a transferência ao custo do lote (ES-29), a ocupação com os filtros da agenda (AG-29), o cancelado e a falta que não contam (AG-26), quem atende só nas unidades marcadas (AG-16), o agendar sem o passado (AG-06), a nota de cada procedimento (AG-59). Do catálogo de CRM e inbox (`docs/catalogo/crm-inbox.md`): o "Cliente desde" da importação nos novos clientes (IM-20), a última visita de antes do sistema (IM-21), arquivar não muda os novos clientes (CL-26), "Novos clientes" só na rede e o "Reativar" sempre da rede (CL-19), a lista de Clientes da rede sem filtro por unidade (CL-17), a conversão no quadro e o "Já é cliente" (OP-17), o quadro que abre no funil do endereço (OP-13), a tag da pessoa e o filtro E (TG-09, TG-12), "oportunidade" e nunca "lead" (IN-01). Do catálogo da Plataforma (`docs/catalogo/plataforma.md`): quem vê cada aba dos Relatórios e a aba Financeiro que pede o Financeiro (CG-18, CG-19), os números das unidades ao alcance (CG-20), o nome da rede nos rótulos da rede de uma unidade (CG-25), a unidade desativada que continua contada (UN-13), a hora da Auditoria (AD-26). Do catálogo das Comissões (`docs/catalogo/comissoes.md`): o mês da comissão e o fechamento no fuso da rede (CF-07, CF-08), a comissão de outra pessoa só com o Financeiro (QV-02), as Minhas comissões e o destaque do dashboard (MC-01, MC-02, MC-03), a comissão de venda de quem está em "Quem vendeu" (CV-01). Do catálogo do Copilot (`docs/catalogo/copilot.md`): o relógio dele (CK-01), as mesmas contas da tela (CJ-01, CJ-04, CJ-05) e sem "só os meus" (CW-02). Das Automações (`docs/catalogo/automacoes.md`): a hora das automações no relógio da rede (EV-04), o aniversário e o público no fuso da rede (AX-10), o público "sem retorno" (PU-04). Da Fidelidade (`docs/catalogo/fidelidade.md`): o aniversário da fidelidade (SA-07), pontos e voucher que não são desconto nem dinheiro (PD-03). Dos Documentos (`docs/catalogo/documentos.md`): a validade do pacote no contrato (DV-03).

Notas para outros catálogos, achadas nos rascunhos:
- Atendimento, a perda "Venda estornada (não voltou)" (ES-28): lá a fonte está como "atribuída ao Heitor sem a fala", mas `docs/regras/indicadores.md:455-458` diz que ela é decisão do Claude (o Heitor pediu só a pergunta "houve devolução?").
- Atendimento, a pergunta sobre a perda fora do giro e do lucro (Q29, ES-27): a fala existe — o Heitor, 2026-11-02: "perdido ou não, o insumo já foi pago na compra … serve como métrica" (`docs/regras/indicadores.md:476-477`; aqui, ER-04). A pergunta pode sair.
- CRM e inbox, "Novos clientes" só na rede (CL-19): lá a fonte está como "atribuída ao Heitor sem a fala", mas a fala existe — o Heitor, 18/11: "Só na rede" (`DEVLOG.md:2202`; aqui, CC-02).
