# Comissões

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.7 Comissões (reforma de 2026-09-30, três fases no código)

Decisões do Heitor; o plano inteiro está no DEVLOG ("Comissões").

- **A comissão só fica A PAGAR com o pagamento INTEGRAL da cliente** (H4,
  decisão do Heitor, 2026-11-01: "comissão só paga com pagamento integral do
  cliente; note que pagamento parcelado no cartão deve ser considerado como
  pagamento integral da parte do cliente, o repasse do valor das parcelas é de
  responsabilidade da operadora do cartão, o cliente já fez o pagamento
  integral"; migration `20261101000201`). O modo é UM, `INTEGRAL`:
  - avulso: quando o atendimento está pago — os lançamentos vivos dele
    cobrem o preço e nenhum está em aberto. Desde 2026-11-16 o avulso se
    recebe em várias formas e no crediário (`docs/regras/vendas-financeiro.md`,
    PDV): pago em duas formas, as duas contam; no crediário, espera a última
    parcela, como a venda;
  - pacote (a comissão de venda E a de cada sessão já feita), plano, pré-pago e
    venda de produto: quando a venda inteira está paga — o recebido (com os
    pontos, que são forma de pagamento) fecha com o preço vendido;
  - **crédito em N vezes é pago na hora** (`cartao_vezes`, um lançamento
    pago): libera na hora. As parcelas que a OPERADORA deposita em parcelas
    (`recebiveis_do_cartao`, F2c de 2026-11-01) moram fora de
    `financial_transactions`: a quitação olha a VENDA, e elas nunca deixam a
    comissão "aguardando" (prova:
    `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`). O que espera é só o que a cliente ainda deve à
    REDE — o crediário (entrada + parcelas a receber), o avulso concluído
    sem pagamento —, e ele libera quando a última parcela entra ("f2 ok,
    concordamos", o Heitor, 2026-11-01);
  - o estorno de um pagamento tira a quitação: a comissão volta a aguardar
    (lançamento ESTORNO). Pacote vendido antes da venda no sistema (sem preço
    vendido) libera na conclusão, como sempre.
  - **Antes de liberar, a linha APARECE**: `comissoes_extrato` devolve a linha
    que aguarda (`kind`/`status` `AGUARDANDO`, valor 0 e o `previsto`), e
    `comissoes_resumo` tem a coluna `aguardando` — a tela diz "R$ 110,00
    aguardando o pagamento integral" no card do profissional e "previsto"
    no extrato, fora do "a pagar", do fechamento e de toda métrica (que leem
    os lançamentos). Quem aguarda é `private.comissoes_aguardando`: linha
    INTEGRAL ativa, sem nada lançado, não quitada, com previsto > 0. Era o
    A53 da 5ª simulação: R$ 192,50 da sessão 1 de um pacote com 90% a
    receber, e o extrato não dizia nada.
  - Toda linha NOVA nasce INTEGRAL pelo gatilho `trg_comissao_linha_integral`
    (vale em `concluir_atendimento`, `pacote_vender`, `produto_vender` e
    `atendimento_abater_do_pacote` sem mexer em cada um). As linhas de ANTES
    guardam o modo delas (`ATENDIMENTO`, devida na conclusão; `PAGAMENTO`,
    na proporção do recebido) e seguem a conta delas em
    `private.comissao_conta` — o passado não se reescreve. Na produção
    ficaram assim, já lançadas sobre dinheiro que não entrou inteiro, seis
    linhas de antes (das redes [sim] e da rede de teste; uma já fechada e
    paga, as outras a pagar — a do Dr. Paulo, R$ 192,50, entre elas).
  - Configurações → Comissões não oferece mais o modo: diz a regra. A rede
    que estava em "quando o cliente paga" passou a `base_com_pontos =
    VALOR_PAGO` (a base que ela já tinha); `commission_configs.modo` só aceita
    `INTEGRAL`, e a action recusa outro.
  - Prova: `e2e/comissoes-pagamento-integral.spec.ts` (pacote no crediário,
    avulso no crédito 3x, pacote no Pix e a tela da configuração).

- **A regra é do PROFISSIONAL, na rede** (`commission_rules`: `tenant_id`,
  `professional_id uuid → users`, `procedure_id` nulo = PADRÃO): um padrão
  (% ou R$ fixo) e EXCEÇÕES por procedimento. Índice único
  `(professional_id, procedure_id) nulls not distinct`. Qual vale:
  `regraAplicavel` (`lib/comissoes/config.ts`) — a exceção, senão o padrão,
  senão nenhuma (o atendimento conclui sem comissão, e a tela avisa quem
  "atende" sem padrão). Sem NINGUÉM marcado como "atende clientes", a tela
  diz isso, e não "todos têm comissão" (A12 da 5ª, 2026-11-02; prova:
  `e2e/comissoes-sem-quem-atende.spec.ts`).
- **A comissão do PROCEDIMENTO** (2026-10-15; chip na coluna "Comissão" de
  Procedimentos e seção "Comissão" do modal de criar/editar — o MESMO
  `EditorDeComissao`; o modal só manda o campo `comissao` se ele mudou, e
  `comissaoDoFormulario` confere a permissão ANTES de gravar o procedimento): cada procedimento é "a mesma para
  todos" (a GERAL: linha de `commission_rules` com `professional_id` NULO) ou
  "por profissional" (as exceções acima, vistas pelo procedimento; quem fica no
  "Padrão" segue o padrão dele). **A geral vence tudo** — exceção e padrão:
  `regraAplicavel(regras, procedimento, gerais)`, e `linhasDoAtendimento` lê
  as gerais junto (vale para quem não tem regra nenhuma). Procedimento com
  geral não tem exceção: `comissao_do_procedimento_definir` substitui o
  conjunto inteiro do procedimento, a Equipe não o oferece como exceção e
  `comissao_regras_definir` recusa. Muda quem tem `financial: MANAGE` e é a
  Admin da rede (desde 18/11, o Heitor: a configuração da rede toda é "só pela
  conta admin"; até ali, quem tinha “A rede inteira”). Prova:
  `e2e/comissoes-por-procedimento.spec.ts`, `tests/config-da-rede-so-da-admin.test.ts`.
  - **A comissão da profissional, na Equipe, diz QUAIS procedimentos têm a
    geral** (A11 da 10ª simulação, 2026-11-10; princípio 3: a Camila tinha
    35% e a janela não dizia que o Microagulhamento pagava 40% "para todos"):
    "Com comissão geral — vale para todas e vence a regra acima; muda em
    Procedimentos: Microagulhamento: 40%" (`[data-gerais-que-vencem]`,
    `procedimentosComComissaoGeral`). A regra não mudou. O "aplicar a todas que
    estão sem comissão" do relatório ficou de fora (ver o relatório da F50).
    Prova: `e2e/configuracoes-atritos-da-10.spec.ts` ("A11").
  - **O valor de uma Admin da rede no procedimento só outra Admin muda**
    (achado da compilação da 5ª simulação, 2026-11-01; a regra é a do
    CLAUDE.md §11, "somente admin pode alterar admin"): o procedimento grava o
    conjunto inteiro dos profissionais, e quem tinha o Financeiro em Gerenciar
    punha, mudava ou tirava a exceção da Admin por aqui. `recusaDaComissaoDaAdmin`
    (`lib/comissoes/gravacao.ts`, com `adminsDaRede` de
    `lib/equipe/admin-da-rede.ts`) compara o que cada Admin tem no procedimento
    com o que fica: igual passa (a tela manda a lista toda), diferente recusa
    ("Só quem é Admin da rede altera a comissão de uma Admin da rede."). "A
    mesma para todos" tira a exceção dela e conta como mexer; a regra geral
    nova num procedimento em que ela não tem valor próprio é do procedimento,
    não dela — confirmado pelo Heitor no levantamento das regras (H9,
    2026-11-11, opção a: a Admin da rede já controla quem tem o Financeiro em
    Gerenciar). **Com o aviso** (princípio 3): quando a regra geral nova muda o
    que uma Admin ganha, a janela diz antes de salvar — "A mesma para todos:
    20%. Vale também para a Dra. Ana (Admin da rede), que hoje recebe 40% pelo
    padrão dela." (correção C68; hoje salva calada). Vale nas duas
    portas: o chip (`salvarComissaoDoProcedimento`) e o modal do procedimento
    (antes de gravar o procedimento), e `gravarComissaoDoProcedimento` confere
    de novo. Prova: `e2e/comissoes-procedimento-da-admin.spec.ts`.
- **Só o servidor grava regra**: `comissao_regras_definir` e
  `comissao_do_procedimento_definir` (service_role, conferem profissional e
  procedimentos da rede). A sessão só LÊ — até 2026-09-30
  qualquer funcionário gravava `commission_rules` pelo PostgREST.
- **A aba se chama "Comissões e taxas"** (A2 da 14ª simulação, F74,
  2026-11-13: a Admin da rede procurava as taxas da maquininha e não achava; a aba
  guardava as duas coisas e só dizia uma). A chave segue `comissoes`; todo
  texto que manda à aba diz "Configurações → Comissões e taxas" (trava em
  `tests/configuracoes-e-menu-da-14.test.ts`). O passo do setup segue "Taxas
  da maquininha" e diz o nome da aba.
- **Configuração da REDE** (`commission_configs`, Configurações → Comissões,
  `financial: MANAGE` + a Admin da rede desde 18/11, `mexeNaConfigDaRede`;
  também o máximo de parcelas do crediário): `modo` (só `INTEGRAL` desde
  2026-11-01, acima; era ATENDIMENTO | PAGAMENTO), descontos da base
  (`desconta_insumos`, `desconta_taxa`), `base_com_pontos` (PRECO | VALOR_PAGO,
  veio de `loyalty_configs.commission_base`) e `periodo` do fechamento
  (MENSAL | QUINZENAL | SEMANAL). O padrão é a **base cheia**, e a tela diz
  com essas palavras (J-46, 2026-10-30: a Admin da rede achava que a comissão
  descontava taxa e insumo): a configuração e o extrato usam a MESMA frase,
  `rotuloDaBase` — "base cheia (sem taxa nem insumo descontados)" ou o que
  saiu dela —, o extrato pelo retrato de cada linha (`comissoes_extrato`
  devolve `desconta_taxa`/`desconta_insumos`; migration `20261029001502`), e
  o CSV ganhou a coluna "O que saiu da base". **E a frase diz os PONTOS** (A10
  da 7ª simulação, 2026-11-05; princípio 3: a Tânia lia R$ 480 — 40% de
  R$ 1.200 — sobre R$ 1.180 pagos e achou erro): "base cheia (sem taxa nem
  insumo descontados; os pontos e o voucher usados não saem dela)" na regra
  "Sobre o preço", ou "base sem os pontos e o voucher usados…" no "Sobre o valor
  pago" (`rotuloDaBase` com `base_com_pontos`). No extrato vale o retrato da
  linha (`comissoes_extrato_linhas` devolve `base_com_pontos`), em TODA origem.
  **A taxa da maquininha por procedimento**
  (o Heitor, 18/11, ao item 11: "ok"): no cadastro do procedimento, junto da
  comissão dele, "Taxa da maquininha" tem três escolhas — "Como a rede" (o padrão: vale o
  `desconta_taxa` acima), "Desconta a taxa" e "Não desconta". Mora em
  `procedures.desconta_taxa` (nulo = como a rede; todo procedimento que já
  existia nasce assim, e nenhuma conta muda) e se grava com a comissão do
  procedimento, na mesma função (`comissao_do_procedimento_definir`,
  `p_desconta_taxa`) — configuração da rede, só da Admin da rede, como a
  comissão do procedimento. A tela diz o que vale: no "Como a rede", o que a
  rede faz hoje (`rotuloDaTaxaDoProcedimento`). A linha de comissão do
  ATENDIMENTO do procedimento (o avulso e as sessões de pacote, plano e
  pré-pago: com `appointment_id` e `procedure_id`) nasce com a escolha dele
  retratada em `desconta_taxa` (gatilho `trg_comissao_linha_taxa_do_procedimento`,
  migration `20261130100005`); a conta no banco e o extrato ("base sem a
  taxa…" / "base cheia") leem esse retrato, como sempre. A linha que já
  existe fica como está; a comissão de VENDA (sem atendimento) segue a escolha
  da rede — é a de quem vende, não a do procedimento (decisão do Claude, 26ª).
  Prova: `tests/comissoes-config.test.ts` e
  `e2e/comissoes-calculo.spec.ts`.
  **A escolha da rede vale em toda comissão** (item 10 das correções da
  auditoria das regras — decisão do Claude pelos princípios 2 e 3,
  2026-11-18; era "só no avulso: no pacote, no plano e nas vendas os pontos
  são forma de pagamento e nunca saem da base", e a escolha da rede não valia
  ali): com "Sobre o valor pago", os pontos e o voucher usados saem da base
  também na venda do pacote e em cada sessão dele, na venda do plano e em cada
  procedimento executado dele, no pré-pago e na venda de produto. A parte de
  cada linha é a proporção do preço dela no preço cheio da venda (a sessão de
  R$ 200 de um pacote de R$ 800 leva 1/4 dos pontos); os pontos lidos são os
  dos lançamentos pagos e vivos da venda, e o estorno os devolve à base
  (`private.comissao_conta_detalhe`, migration `20261124000201`). Com "Sobre o
  preço", nada muda. Configurações → Comissões diz isso nas duas opções ("Vale
  no atendimento, nas sessões de pacote e de plano e nas vendas.",
  `OPCOES_DA_BASE_COM_PONTOS`, `lib/comissoes/config.ts`), e o extrato diz a
  frase do retrato em toda linha (`rotuloDaBaseDoLancamento`). Para a
  QUITAÇÃO os pontos continuam contando como pagamento (o pacote pago com
  pontos está pago). Prova: `tests/comissoes-config.test.ts`,
  `tests/comissoes-pontos-e-pacote-de-fora.test.ts`,
  `e2e/comissoes-configuracao.spec.ts`, `e2e/comissoes-pacote.spec.ts`,
  `e2e/comissoes-pontos-na-base-das-vendas.spec.ts`.
  **O valor ao lado da frase é a base EFETIVA** (D3 da 10ª simulação,
  2026-11-10; princípio 3): o extrato dizia "base sem a taxa da maquininha:
  R$ 420,00 · 40%" ao lado de R$ 165,48 (40% de 420 daria 168), e o CSV punha
  o preço na coluna Base — a venda do plano cancelado com Base 1.700 e
  Previsto 35. A base que a conta usa sai do banco: `private.comissao_conta_detalhe`
  (o corpo da conta, que `comissao_conta` passou a ler — a conta continua num
  lugar só; migration `20261110004901`) devolve a base (base × regra =
  previsto), o desconto, a taxa e os insumos em reais e a proporção do que
  ficou (pacote/plano cancelado, venda devolvida em parte), e o extrato é
  `comissoes_extrato_com_base` (o `comissoes_extrato_linhas` de antes ficou sem
  chamador no app). A tela diz "base sem a taxa da maquininha: R$ 413,70
  (R$ 420,00 − R$ 6,30 da taxa) · 40%" (`textoDaBase`,
  `lib/comissoes/base-efetiva.ts`), e o CSV tem Preço, Desconto, Taxa da
  maquininha, Insumos, Proporção que ficou e Base. No valor fixo, a base é o
  preço sem os pontos e o voucher. Prova: `e2e/comissoes-atritos-da-10.spec.ts`,
  `tests/comissoes-base-efetiva.test.ts`.
  **Os pontos e o voucher não se chamam "desconto" na base** (A17 da 25ª;
  decisão do Claude pelo princípio 3 — vendas-financeiro.md: os pontos e o voucher "não é desconto"): com
  "Sobre o valor pago", a base saía "R$ 200,00 − R$ 40,00 de desconto" quando
  os R$ 40 eram pontos. A conta (`comissao_conta_detalhe`,
  `comissao_base_do_pagamento`) devolve também `base_fidelidade`, a parte de
  `base_desconto` que foi de pontos e voucher (`base_desconto` segue o total
  que saiu antes da taxa: nenhuma conta mudou), e o extrato
  (`comissoes_extrato_com_regra`) a leva; a tela diz "R$ 20,00 de desconto −
  R$ 20,00 de pontos e voucher", e o CSV tem a coluna "Pontos e voucher que
  saíram da base" ao lado da do desconto. Migration `20261124900003`. Prova:
  `tests/comissao-base-pontos-e-voucher-da-25.test.ts`.
  **Cada lançamento com a base DA HORA DELE** (D7 da 11ª simulação,
  2026-11-10; princípio 3): depois do cancelamento do pacote de R$ 1.100
  (ficaram R$ 110), a liberação de R$ 33,00 — lançada com o pacote inteiro —
  dizia "base cheia R$ 110,00 (… na proporção do que ficou (10%)) · 3%". O
  extrato aplicava o fator de HOJE a todos os lançamentos da linha. O fator (a
  proporção do que ficou) só muda no cancelamento do pacote e do plano
  (`cancelado_em`) e na devolução da venda de produto
  (`product_sale_returns.created_at`); `private.comissao_fator_em` diz o de
  um instante, e `comissoes_extrato_com_base` o usa no `released_at` de cada
  lançamento (o que aguarda, o de agora; migration `20261110005403`). A
  liberação diz "base cheia: R$ 1.100,00 · 3%"; o acerto, "R$ 110,00
  (R$ 1.100,00, na proporção do que ficou (10%))". A conta não mudou. Prova:
  `e2e/comissoes-defeitos-da-11.spec.ts`.
  **Cada lançamento com a base DO PAGAMENTO DELE** (D5 da 18ª simulação,
  2026-11-16; princípio 3): o avulso pago com R$ 88,44 de desconto (+R$
  423,47), estornado (−R$ 423,47) e recebido de novo cheio (+R$ 450,00) dizia
  "base cheia R$ 1.500,00" nas três linhas — a base era a da linha de HOJE.
  No atendimento avulso, o lançamento ligado a um pagamento
  (`commissions.transaction_id`: a liberação e o estorno dele) diz a base
  daquele pagamento — o desconto, a taxa e os insumos, a régua de
  `comissao_conta_detalhe` com ele como o pago
  (`private.comissao_base_do_pagamento`, em `comissoes_extrato_com_regra`;
  migration `20261118300002`). O resto segue a conta da linha. A conta da
  comissão não mudou. Prova: `tests/pdv-caixa-da-18.test.ts`.
  **Cada lançamento com o RETRATO da base** (decisão do Claude, 26ª,
  princípio 3): toda linha é INTEGRAL, e a liberação se conta com a venda
  inteira (a taxa média de todas as formas, os pontos e o voucher de todos os
  pagamentos) — a "base do pagamento" de um só mostraria a taxa da última
  parcela ao lado de um valor contado com todas. Por isso o lançamento NOVO
  guarda, ao nascer (`private.comissao_acertar_linha`), o que o extrato mostra
  da base: `commissions.base_retrato` com o preço, o %, a base, o desconto, os
  pontos e o voucher, a taxa, os insumos e o fator de `comissao_conta_detalhe`
  naquele instante — a conta que deu o valor dele. O ESTORNO retrata a base da
  liberação que ele desfaz (a última liberação da linha). Vale para todo tipo
  (avulso, pacote, plano, pré-pago e produto). O extrato
  (`comissoes_extrato_com_regra`) e o CSV, que sai dele, usam o retrato quando
  existe; sem ele — o lançamento de antes da migration `20261130100006`, ou a
  linha cancelada, sem base —, a conta de hoje, e no avulso ligado a um
  pagamento a D5 acima. Nada se recalcula. O retrato só se grava ao nascer:
  fica fora da frase da Auditoria (o gatilho lista colunas só na edição).
  Prova: `tests/comissoes-extrato-texto.test.ts` e
  `e2e/comissoes-calculo.spec.ts`.
  **O pagamento em várias formas é UM pagamento** (D1 da 18ª, 2026-11-16;
  migration `20261121000001`): as formas nascem na mesma transação (o mesmo
  `created_at`) e a base do pagamento soma os descontos e os pontos delas; a
  taxa é a média das taxas de cada forma, pesada pelo valor
  (`private.comissao_base_do_pagamento`, e o bloco do AVULSO de
  `comissao_conta_detalhe`). No modo "sobre o pago" (PAGAMENTO), o avulso
  vale na proporção do que os lançamentos vivos já cobrem do preço.
  **Taxas da maquininha** — desde a F67 (C75), POR MAQUININHA: a tabela
  `maquininhas` (débito e crédito 1–12x em `taxas`, sem teto desde a F16-3,
  e a comissão sobre o líquido nunca fica negativa; cada bandeira pode ter
  as suas em `por_bandeira`, quando ela `cobra_por_bandeira`), gravada por
  `salvarMaquininha` (`actions/maquininhas.ts`), e o Pix à parte
  (`salvarTaxaDoPix`). A comissão desconta a taxa da maquininha do
  pagamento (`financial_transactions.maquininha_id`) e, dentro dela, a da
  bandeira — `vendas-financeiro.md` §9.6. Antes era `payment_fees` +
  `tenants.cartao_por_bandeira` (a "regra geral"), que um gatilho de espelho
  ainda copia para a primeira maquininha até a limpeza depois do deploy.
  **A "Maquininha" de fábrica se preenche** (A4 da 23ª, princípio 7): na rede
  que só tem a vazia com que nasceu (nome "Maquininha", sem taxa, sem limite
  de vezes, sem bandeira), o "+ Adicionar maquininha" abre ESSA, com o nome
  vazio, em vez de criar uma segunda (`vaziaDeFabrica`,
  `lib/financeiro/maquininha-de-fabrica.ts`). No CSV do extrato, a coluna é
  "Desconto que saiu da base" (A20 da 23ª), e os pontos e o voucher têm a
  coluna deles, "Pontos e voucher que saíram da base" (A17 da 25ª).
- **A comissão da VENDA DE PRODUTO** (D4, decisão do Heitor, 2026-10-29: "é
  configurável pela clínica"; migration `20261029001306`): Configurações →
  Comissões → "Venda de produto", `commission_configs.produto_pct` (vazio = sem
  comissão; mesma permissão e abrangência da configuração). Vale para QUEM
  VENDEU (`product_sales.sold_by`, escolhido na venda — com-06, abaixo; era quem registrou), sobre
  o VENDIDO (com o desconto). A linha (`commission_lines.origem = 'PRODUTO'`,
  `product_sale_id`, sem atendimento — `appointment_id` e o do extrato aceitam
  nulo) nasce em `produto_vender`, antes do dinheiro, e libera com a venda
  paga inteira (H4): à vista ou no cartão em N vezes, na hora; no crediário,
  com a última parcela; o estorno devolve (`comissao_alvo`, o mesmo ramo do
  pré-pago). Retrata a taxa da
  maquininha da rede; não desconta insumos. O extrato (`comissoes_extrato`)
  diz a cliente e o produto; o fechamento é o de sempre. Prova:
  `e2e/vendas-produto.spec.ts` ("a comissão da venda de produto").
  - **Uma regra sobre o total OU por produto** (r2-ven-10, o Heitor,
    2026-11-03: "deixar a clínica decidir, flexibilidade"). Em Configurações →
    Comissões → "Venda de produto", a rede escolhe
    (`commission_configs.produto_modo`): "Uma regra sobre o total" (o de cima:
    UMA linha sobre o vendido do kit inteiro) ou "Por produto" — cada produto
    de revenda com "% do vendido" ou "R$ por unidade"
    (`products.comissao_tipo`/`comissao_valor`).
  - **A regra de cada produto se registra no CADASTRO dele** (o Heitor,
    2026-11-03: "se cada produto pode ter uma comissão diferente, o que faz
    sentido é que em cada produto se possa registrar uma comissão
    diferente"): "Comissão na venda deste produto" no criar e no editar
    produto (Estoque; `ComissaoDoProduto`, só para o produto de revenda ou "os
    dois"), com o campo `comissao` gravado por `createProduct`/`updateProduct`
    (`comissaoDoProdutoNoFormulario`, `lib/comissoes/gravacao.ts`, conferido
    ANTES de gravar). Mostra e grava SÓ quem muda comissão — o Financeiro em
    Gerenciar, comissões no plano e a Admin da rede
    (`podeMudarComissaoDoProcedimento`: desde 18/11 só a Admin da rede, como
    toda configuração da rede toda; quem só tem o Estoque não vê a seção, e o
    servidor recusa o campo: "Seu cargo
    não muda a comissão dos produtos."). Com "Uma regra sobre o total", o
    cadastro não oferece campo: diz "A rede comissiona a venda de produto
    por uma regra sobre o total (5% do vendido)…" com o caminho para
    Configurações → Comissões (decisão do Claude na F14, pelos princípios). Em
    Configurações → Comissões ficam a escolha e a regra geral, e o RESUMO só
    de leitura de cada produto ("10% do vendido", "R$ 3,00 por unidade",
    "regra geral") com o caminho do Estoque — um lugar só para editar
    (`salvarComissaoDosProdutos`, da F13, saiu). Por produto, cada ITEM do kit nasce com
    a sua linha (`item` = a ordem dele), sobre a parte dele no vendido (o
    desconto rateado pela tabela, a última parte com o arredondamento); o
    produto sem regra própria cai na geral (`produto_pct`, "Regra geral — o
    produto sem a sua"); sem as duas, o item não gera linha. A conta de cada
    linha é a de sempre (`comissao_conta`: libera com a venda paga inteira;
    o estorno da venda cancela todas). Grava `produto_vender_itens`
    (migration `20261103001306`). Prova: `e2e/comissoes-produto-por-produto.spec.ts`.
- **"Quem vendeu" é escolhido na venda, separado de quem registrou** (com-06
  da revisão, 2026-11-02; o Heitor: "às vezes quem vai registrar a venda é
  recepção e quem vendeu foi a profissional (...) um campo para informar quem
  foi quem realizou aquela venda. Se o campo ficar vazio, aviso e
  confirmação. Campo vazio não gera comissão para ninguém"). A venda de
  produto, de pacote e de pré-pago tem "Quem vendeu" (`CampoQuemVendeu`,
  nasce VAZIO em toda venda — r2-ven-12, o Heitor, 2026-11-03: "nasce sempre
  vazio"; quem registra se acha na lista pelo "(você)", e vazio continua
  valendo: ninguém, sem comissão de venda). `sold_by` é QUEM
  VENDEU — a comissão de venda (produto e pacote), a coluna Profissional das
  Vendas e o "Meu faturamento" —, e quem registrou vai em `registrado_por`
  (migration `20261101001106`). Vazio, a venda PERGUNTA — na tela
  (`PerguntaDaVenda`) e no servidor (`quemVendeu`,
  `lib/vendas/equipe-da-venda.ts`, devolve `confirmarSemVendedor` sem
  gravar); confirmada, `sold_by` fica nulo e nenhuma linha de comissão de
  venda nasce. A pessoa escolhida é conferida no servidor (da rede, ativa, e
  da unidade ou da rede, ou de fora e que ATENDE nela — decisão 2 da 8ª) e na
  função; a responsável do pacote tem de atender NESTA unidade. **O caminho
  que não manda o campo (`vendedorId` ausente) não dá a venda a ninguém** (o
  Heitor, com-06: "Campo vazio não gera comissão para ninguém"; auditoria das
  regras, 2026-11-18 — era "segue como antes: quem registrou", uma comissão
  sem ninguém escolher): sem o campo, `sold_by` fica nulo, sem comissão de
  venda e fora do "Meu faturamento" de quem registrou. Toda tela de venda
  (pacote, pré-pago, produto, plano) manda o campo. O produto acrescentado na
  comanda do atendimento também tem o seu, "Quem vendeu os produtos", vazio
  (era quem atendeu — `vendas-financeiro.md`, "O produto na comanda do
  atendimento").
  Prova: `e2e/vendas-quem-vendeu.spec.ts`. **A lista vem em grupos** (A15 da
  8ª simulação, 2026-11-06: quem tinha só o Financeiro em Ver aparecia no meio): "Quem
  atende" (nesta unidade), "Quem recebe" (o PDV em Gerenciar, PV-04,
  ou a Admin) e "Quem tem o Comercial no cargo" (`equipeDaVenda`).
  **E só quem VENDE** (A42 da 11ª simulação, 2026-11-10 — a frente F56: "a
  lista 'Quem vendeu' só com quem tem Vendas" — o grupo hoje se chama Comercial; a lista trazia quem só tinha o Estoque, e
  dava para pôr comissão de venda em quem nem entra no Comercial; até aqui era
  "ninguém sai"): fica quem atende NESTA unidade, quem recebe, ou quem tem o
  grupo Comercial no cargo (`crm` ou `procedures` abertos — `cargosQueVendem`,
  `lib/vendas/equipe-da-venda.ts`); a rede decide quem vende pelo cargo
  (princípio 1). O servidor confere o mesmo (`quemVendeu`: "Quem vendeu:
  escolha quem vende — quem atende aqui, quem recebe ou quem tem o Comercial no
  cargo."). Prova: `e2e/equipe-atritos-da-8.spec.ts` ("A15"),
  `e2e/comissoes-atritos-da-11.spec.ts` ("A42").
- **A comissão do PACOTE é do cadastro de cada pacote** (decisão do Heitor,
  2026-10-30; migration `20261029001501`): Comercial → Pacotes, seção "Comissão"
  do formulário (só para quem tem `financial: MANAGE`, é a Admin da rede
  (desde 18/11) e tem comissões no plano — `podeMudarComissaoDoProcedimento`; `salvarPacote`
  recusa o campo `comissao` de quem não pode, antes de gravar). Duas, cada uma
  ligada ou não, gravadas em `service_packages` e RETRATADAS em
  `client_packages` na venda (mudar o catálogo vale para as próximas):
  - **De venda**, para quem vendeu (`sold_by`): % do VENDIDO (com o desconto)
    ou valor fixo. A linha (`origem = 'PACOTE_VENDA'`, `client_package_id`,
    sem atendimento) nasce em `pacote_vender`, antes do dinheiro, e libera com
    o pacote pago inteiro (H4): à vista ou no cartão em N vezes, na hora; no
    crediário, com a última parcela (pacote de R$ 800 com 10%: os R$ 80 quando
    a segunda parcela de R$ 400 entra — era R$ 40 a cada uma); o estorno de
    um pagamento a devolve. É o ramo do pacote em `comissao_alvo`.
    Retrata a taxa da maquininha da rede; não desconta insumos.
  - **De execução**, para quem atende cada sessão (`comissao_execucao`):
    `REGRA` (a regra do profissional — o padrão, e o que valia para todo pacote
    antes), `PERCENTAGE` (da parte da sessão no rateio), `FIXED_AMOUNT` (por
    sessão) ou `NENHUMA` (sem linha). `linhasDoAtendimento` lê o retrato
    (`regraDaSessaoDePacote`) — vale também para quem não tem regra nenhuma —,
    e ela também só libera com o pacote pago inteiro (H4).
  - **Ou sobre o VALOR DO PACOTE, para a pessoa responsável** (com-04
    da revisão, 2026-11-02; o Heitor: "se foi vendido um pacote de 900,
    Renata recebe a comissão sobre o valor do pacote, no momento em que o
    pagamento integral do pacote foi realizado (...) mas devemos manter o
    sistema com a maior flexibilidade possível e a rede define como
    operar"). Na execução do cadastro, "Valor do pacote" (% ou R$ fixo):
    `service_packages.comissao_responsavel_tipo`/`_valor`, com a execução
    por sessão `NENHUMA` (a restrição do banco garante). A venda pede a
    "Profissional responsável" (só quem atende, da unidade; conferida por
    `recusaDoMembroDaVenda`) e nasce UMA linha sobre o vendido, para ela:
    `origem = 'PACOTE_VENDA'` com `pacote_responsavel = true` — a MESMA conta
    da comissão de venda do pacote (`comissao_conta`): libera com o pacote
    pago inteiro (o crediário espera a última parcela; o cartão em N vezes é
    na hora) e cai na proporção do cancelado (F2b). As sessões não geram
    linha. Sem responsável, a venda PERGUNTA ("Ninguém foi marcado como
    responsável… Vender assim?"; `venderPacote` devolve
    `confirmarSemResponsavel` sem gravar); confirmada, ninguém recebe essa
    comissão. O extrato diz "Pacote X (responsável)"
    (`comissoes_extrato` devolve a origem `PACOTE_RESPONSAVEL`). Grava
    `pacote_vender_com_equipe` (migration `20261101001105`; o
    `pacote_vender` de antes fica sem uso). Prova:
    `e2e/comissoes-pacote-responsavel.spec.ts`.
  - **O pacote TRAZIDO DE FORA** (decisão 1 do Heitor sobre a 8ª simulação,
    2026-11-06: "concordo"; `vendas-financeiro.md` §9.3.1): não tem comissão
    de venda (não é venda). A de EXECUÇÃO da sessão trazida sai pela regra do
    profissional (`REGRA`) sobre a parte da sessão no rateio do valor de
    referência (`package_sessions.preco`), e libera na conclusão — o pacote
    não tem preço de venda (`client_packages.price` nulo: nada que a cliente
    deva à rede, `comissao_conta`). Sem valor de referência, o PERCENTUAL dá
    R$ 0 e a tela avisa (princípio 4: não se chuta o valor) —
    `linhasDoAtendimento` não cria a linha percentual para a sessão sem preço
    de um pacote `de_fora`. **O "R$ fixo por sessão" é pago** (item 11 das
    correções da auditoria das regras — decisão do Claude pelo princípio 2,
    2026-11-18: o fixo é o valor que a rede escolheu e não depende do valor de
    referência; era R$ 0 também): a linha nasce com o fixo e `preco` 0, e
    libera na conclusão. A janela de trazer, o cartão da ficha, a ficha de
    tratamento e a importação dizem "a comissão de execução em percentual é
    R$ 0 (a de R$ fixo por sessão é paga)" (`contaDoPacoteDeFora`). Prova:
    `e2e/pacote-de-fora.spec.ts`, `tests/comissoes-pontos-e-pacote-de-fora.test.ts`.
  - **"Abater do pacote"** segue a execução do pacote: com `REGRA`, a linha
    avulsa vira a de pacote com a mesma regra (o de antes); com a do pacote, a
    avulsa é CANCELADA e nasce UMA linha com a regra dele (ou nenhuma).
  - O extrato (`comissoes_extrato`, coluna `pacote`) diz "Venda do pacote X" e
    "Sessão do pacote X"; o fechamento é o de sempre.
  - **O pacote CANCELADO** (F2b, 2026-11-01; `vendas-financeiro.md` §9.3.1):
    a comissão de VENDA volta na proporção do que foi cancelado — 10% de um
    pacote de R$ 3.300 com R$ 2.200 cancelados deve R$ 110, e o acerto lança a
    diferença ("Cancelamento do pacote"). Vale também para a PREVISTA: se a
    linha ainda aguardava o pagamento integral, o previsto cai do mesmo jeito,
    e nada libera sobre o que caiu. A de EXECUÇÃO das sessões feitas fica. A
    quitação passa a ser pelo que ficou (vendido − cancelado): o crediário que
    passava do usado caiu, e a comissão libera quando o que sobrou dele entra.
    É `private.comissao_conta` (o total do pacote é `price − valor_cancelado`,
    e a linha `PACOTE_VENDA` leva o fator `(price − valor_cancelado) ÷ price`
    no valor e no previsto; migration `20261101000252`).
  - **O acerto do cancelamento é UM, com o dinheiro do fim** (D11 da 26ª;
    decisão do Claude, princípio 3): o pacote e o plano cancelados acertavam
    antes de o dinheiro mexer — a linha contava como quitada pelo cartão que
    o mesmo cancelamento ia estornar ("Liberação — Cancelamento do pacote" de
    R$ 71,63 = 15% de R$ 477,50, ao lado de "base R$ 500,00 · taxa 0,00"), e
    o gatilho do pagamento acertava de novo a cada mexida (−R$ 71,63, +R$ 75,00).
    Agora, enquanto o dinheiro do cancelamento mexe, a marca da transação
    `bellaris.comissao_adiada` faz o gatilho (`private.comissoes_do_pagamento`)
    pular a venda; no fim, o cancelamento acerta todas as linhas dela uma vez,
    com o motivo "Cancelamento do pacote"/"do plano", ligado ao lançamento que
    gravou agora (o "usado": o `comissao.liberada` segue saindo). O valor e o
    detalhe do extrato contam a mesma conta. Os lançamentos de antes ficam
    (migration `20261130100002`).
  - Prova: `e2e/comissoes-pacote.spec.ts`, `e2e/pacote-cancelar.spec.ts` (o
    cancelamento), `e2e/comissoes-calculo.spec.ts`, `tests/comissoes-base-efetiva.test.ts`.
- **A comissão de VENDA do PLANO de tratamento** (decisão 4 da 7ª simulação,
  2026-11-05 — o Heitor: "concordo"; o Paulo vendeu o plano de R$ 3.672 e não
  ganhou nada, e o pacote tinha a dele). Configurações → Comissões → "Venda de
  plano": `commission_configs.plano_pct`, VAZIO por padrão (princípio 6; mesma
  permissão e abrangência da configuração). Vale para quem vendeu (o "Quem
  vendeu" do checkout do plano, `treatment_plans.vendido_por` — nasce vazio,
  `vendas-financeiro.md`), sobre o valor do plano (a soma dos procedimentos, já
  com o desconto rateado). O caminho é o do pacote, sem conta nova: a linha é
  `origem = 'PLANO'` com `treatment_plan_id` e SEM atendimento, gravada por
  `plano_comissao_de_venda` depois do aceite (migration `20261105003001`), e a
  conta é a de sempre (`comissao_conta`: libera com o plano pago inteiro — à
  vista ou no cartão em N vezes, na hora; no crediário, com a última parcela;
  o estorno devolve). **O plano CANCELADO segue a regra do pacote** (D4 da 9ª
  simulação, decisão 2 do Heitor, 2026-11-07: "sim usa a mesma coisa do
  pacote"): a de VENDA volta na proporção do que foi cancelado — 10% de um plano
  de R$ 1.314 com R$ 729 cancelados deve R$ 58,50, e o previsto cai junto —, a
  quitação passa a ser pelo usado (soma − `treatment_plans.valor_cancelado`) e as
  de EXECUÇÃO das sessões feitas ficam (`private.comissao_conta`, migration
  `20261107004102`; o cancelamento acerta cada linha, `plano_cancelar_devolvendo`).
  Era `cancelTreatmentPlan`, que cancelava a linha de venda inteira; os planos
  cancelados assim (sem `valor_cancelado`) ficaram como estavam, e
  `plano_cancelar_comissao_de_venda` ficou sem chamador. Prova:
  `e2e/plano-cancelar.spec.ts`. Retrata a taxa da maquininha da rede; não desconta insumos. O
  extrato diz "Venda do plano X" (`comissoes_extrato_linhas`, origem
  `PLANO_VENDA`, com a cliente e o dia do aceite); o lucro desconta como toda
  comissão lançada. Prova: `e2e/comissoes-venda-do-plano.spec.ts`.
- **O Crédito interno VENDIDO não tem comissão de venda** (decisão 1 do
  Heitor sobre a 9ª simulação, 2026-11-07; `vendas-financeiro.md` §9.3.4): a
  venda do "vale" não pergunta "Quem vendeu" e nenhuma linha nasce. Quem
  atende depois, pago com o crédito, recebe a comissão de EXECUÇÃO do
  atendimento, como sempre. Prova: `e2e/vendas-credito-interno.spec.ts`.
- **Não existe "sem comissão, de propósito"** (o Heitor, 2026-11-13: "Só tira
  o \"de proposito\" na caixa tambem"). Saíram o botão "É de propósito" da
  linha da Equipe (A4 da 12ª), o "Desfazer" dele (A6 da 14ª) e a caixa da
  janela de comissão (A14 da 11ª). Quem atende sem comissão padrão fica no
  aviso de Configurações → Comissões e na pílula âmbar "Sem comissão" da
  Equipe. A coluna `users.sem_comissao_de_proposito` saiu do banco em
  2026-11-14 (migration `20261114900901`). Prova: `e2e/configuracoes-atritos-da-11.spec.ts` ("A14
  (revista)") e `e2e/configuracoes-atritos-da-12.spec.ts` ("A4 (revista)").
- **A comissão de venda POR PESSOA** (A17 da 11ª simulação, 2026-11-10;
  decidido pelo princípio 1 — a rede decide; configuração com padrão que não
  muda nada: os dois times quiseram um percentual de venda por vendedora).
  "Comissão de venda (%)" no cadastro de comissão de cada pessoa, na Equipe, ao
  lado da de execução (`[data-comissao-de-venda-da-pessoa]`), VAZIO por padrão
  (`users.comissao_venda_pct`, só o servidor grava — `salvarRegrasDoProfissional`,
  `vendaPct`; o chip diz "· venda 3%" e aparece também para quem vende sem
  atender — aí, "Venda 3%", A22 da 19ª). Vale para PACOTE, PLANO, PRÉ-PAGO e PRODUTO, sobre o vendido, para
  quem está em "Quem vendeu":
  - **a regra do item vence a da pessoa**, como na execução: o "De venda" do
    pacote, a comissão do produto (no "Por produto") — **também quando é 0%**
    (D13 do levantamento das regras, o Heitor, 2026-11-11; princípio 2: o 0 é
    o valor que a rede escolheu). A tela do Vender e o
    `pacote_vender_com_equipe` seguem isso desde a F67 (C40; liam
    `valor > 0`); **sem nenhuma das duas, a
    da rede** — o "venda de plano (%)" e a "venda de produto" (a geral ou a
    regra sobre o total). O pacote e o pré-pago não têm regra da rede.
  - **O pré-pago ganhou a linha de venda**: `origem = 'PRE_PAGO'` SEM
    atendimento (como a venda do plano é a `PLANO` sem atendimento), sobre o
    vendido, que cai na proporção das unidades canceladas (`comissao_conta_detalhe`
    e `comissao_fator_em`). A da execução das unidades usadas continua.
  - Liberação e cancelamento como hoje (H4; a proporção do que ficou no pacote
    e no plano cancelados, na devolução de produto).
  - **A tela diz de onde veio o percentual**: a linha guarda
    `commission_lines.regra_de` (ITEM, PESSOA, CLINICA), e o extrato e o CSV
    dizem "3% — da Tatiane", "10% — do pacote", "5% — da rede"
    (`regraDoLancamento`, `lib/comissoes/extrato-texto.ts`; o extrato é
    `comissoes_extrato_com_regra` — o `comissoes_extrato_com_base` ficou sem
    chamador no app). As linhas de antes dizem só a regra.
  - **O "De venda" do pacote diz que vence** (A5 da 12ª simulação,
    2026-11-11; princípio 3: o pacote com 5% não dizia que valia no lugar do
    3% da Paula e do 8% da Rita): "Vale no lugar da comissão de venda de cada
    pessoa (Equipe → Comissão)", e o "A de quem vendeu" (era "Nenhuma" até a A4
    da 25ª; o resumo da lista diz "Venda: a de quem vendeu") diz "Sem regra no pacote, vale
    a comissão de venda de quem vendeu…" — dizia "Quem vende o pacote não
    recebe comissão", falso desde a A17 (`[data-ajuda-da-venda]`). Prova:
    `e2e/configuracoes-atritos-da-12.spec.ts` ("A5").
  - O Crédito interno vendido continua SEM comissão de venda (abaixo).
  - As funções: `pacote_vender_com_equipe`, `plano_comissao_de_venda`,
    `procedimento_vender_com_equipe`, `produto_vender_itens`
    (`private.comissao_venda_da_pessoa`; migration `20261110005603`). Prova:
    `e2e/comissoes-atritos-da-11.spec.ts`, `tests/comissoes-extrato-texto.test.ts`.
- **A venda diz que é venda no extrato** (A43 da 11ª; princípio 3: a venda do
  plano aparecia "Procedimento · Beatriz Nogueira"): o título do lançamento de
  venda é "Venda do plano X" / "Venda de plano", "Venda do pacote X", "Venda de
  produto: Sérum", "Venda de procedimento: Drenagem" (`tituloDoLancamento`; era
  "Venda de pré-pago", A20 da 12ª — o Vender chama de "Procedimento"); o do
  atendimento segue o procedimento. Prova: o mesmo spec, `tests/vendas-atritos-da-12.test.ts`.
- **O Vender diz a comissão de venda ANTES de vender** (A18 da 12ª simulação,
  2026-11-11; princípio 3: a Rita só sabia pelo extrato): escolhido quem
  vendeu, embaixo do campo, "Comissão de venda de Rita: 8% do vendido — da
  Rita. Sai quando a venda estiver paga inteira." ("5% do vendido — do
  pacote", "2% do vendido — da rede"; no kit, cada produto com a sua) —
  `[data-comissao-da-venda]`, `textoDaComissaoDaVenda`
  (`lib/comissoes/comissao-da-venda.ts`), a MESMA precedência do banco (item >
  pessoa > rede; o pré-pago só a da pessoa; a do produto só no "Por
  produto"). Só a REGRA: o valor em reais é do banco (`comissao_conta`). A
  comissão de OUTRA pessoa só aparece a quem vê a de todos
  (`veComissaoDeTodos`, `lib/comissoes/quem-ve.ts`: o Financeiro em Ver;
  `equipeDaVenda` só manda a da própria pessoa a quem não o tem) — a regra do pacote, que vence,
  aparece sempre. O "Receber o plano" (`checkout-wizard.tsx`) mostra a mesma
  frase (C42, F67). Prova:
  `e2e/vendas-atritos-da-12.spec.ts` ("A18").
- **O CSV não diz 0,00 do que não sai da base** (A44 da 11ª): "Taxa da
  maquininha" e "Insumos" ficam VAZIOS quando a configuração não os desconta
  (com a base cheia, "0,00" parecia "não houve custo"); com o desconto, o valor
  (`csvDoExtrato`). Prova: `tests/comissoes-extrato-texto.test.ts`.
- **Ao criar quem atende** (2026-10-27, A10), o formulário de novo membro
  oferece "Comissão padrão (%)": só o percentual padrão (as exceções seguem no
  chip), só com `financial: MANAGE` e comissões no plano — `createTeamMember`
  ignora o campo sem isso — e grava por `comissao_regras_definir`. Prova:
  `e2e/equipe-comissao-ao-criar.spec.ts`.
- A comissão de cada membro se define na **Equipe** (chip "Comissão …" na
  linha, `ComissaoDoMembro`), só com `financial: MANAGE` — gerir a equipe não
  dá acesso a quanto cada um ganha. Quem é de unidade só mexe nos da unidade
  (a Equipe da unidade mostra quem é de fora — da rede ou de outra unidade — e
  atende ali, mas sem o chip: a comissão dele é da Equipe da rede). A regra é
  da PESSOA, na rede: a Talita marcada no Batel (decisão 2 da 8ª) tem a mesma
  comissão nas duas unidades. O formulário de novo membro da UNIDADE também
  pede a comissão padrão (A3 da 8ª simulação). Vale para o Admin da rede que atende
  (D2, 2026-10-29): o chip aparece quando ele marca "Atende clientes".
  **O chip diz QUAL comissão** (A22 da 19ª simulação, princípio 3; era "Sem
  comissão" em toda linha, e a Patrícia deu 25% de atendimento a quem só
  vende): quem atende sem padrão, "Sem comissão de atendimento"; quem não
  atende, "Venda 3%" ou "Venda: a do pacote, produto ou rede" (A6 da 24ª: o
  "Sem comissão de venda" escondia a do pacote, do produto e da rede, que
  valem); com padrão, como antes
  ("Comissão 25% · 2 exceções · venda 3%") — `chipDaComissao`
  (`lib/comissoes/chip-do-membro.ts`). O campo do valor da regra mostra um
  exemplo ("Ex.: 10", "Ex.: 50,00"), não um 0 que parecia já preenchido (A24).
- **A comissão da venda do pacote se acha em Comissões e taxas** (A24 da 19ª,
  princípio 7): o bloco "Venda de pacote" diz que ela fica no próprio pacote
  (Comercial → Pacotes → o pacote → Comissão), e sem ela vale a de quem vendeu
  (Equipe → Comissão) — `[data-comissao-do-pacote]`. Só o caminho: a regra é a
  de sempre (acima).
- **O extrato liga o estorno à liberação** (A8 da 19ª, princípio 3: "+500,
  −500, +500" sem dizer o vínculo): a linha do estorno diz "desfaz a liberação
  das 06:42" — a do MESMO pagamento (`commissions.transaction_id`, lido em
  `extratoDasComissoes` só quando há estorno no extrato) — e a liberação
  seguinte do mesmo atendimento, "de novo, depois do estorno das 06:45"
  (`vinculosDoExtrato`, `[data-vinculo-do-estorno]`). Prova:
  `tests/atritos-da-19-caixa.test.ts`. **Também a liberação da CONCLUSÃO**
  (D3 da 20ª: pago antes de concluir, a comissão é liberada pela conclusão,
  sem o lançamento): sem a liberação daquele pagamento, o estorno desfaz a
  liberação sem pagamento do mesmo atendimento e valor. Prova:
  `tests/comissoes-atritos-da-20.test.ts`.
- **A sessão não lê comissão nenhuma; a tela escuta um SINAL** (F63, C1 do
  levantamento das regras). `commissions` ia pelo Realtime, legível por toda
  a unidade: quem o cargo deixa ver "só as minhas" recebia no websocket cada
  comissão das colegas — e `commission_lines`, `_rules`, `_payouts`,
  `_configs` e `payment_fees` se liam pela chave pública. Desde a migration
  `20261112006302` nenhuma delas tem política de leitura (tudo se lê pelo
  servidor, `lib/comissoes/leitura.ts`, com o "só as minhas" do cargo), e
  `commissions` saiu da publicação. O Financeiro e "Comissões da equipe"
  assinam `comissoes_sinais` (`20261112006301`): uma linha por rede, "as
  comissões mudaram às X", marcada por gatilho nas quatro tabelas, e a tela
  recarrega pelo servidor — o modelo do `crm_quadro_sinais`. Tela nova de
  comissão assina o sinal, nunca a tabela. Prova: `e2e/rls-sessao-so-le.spec.ts`
  (com o token de uma profissional de unidade).
- **A comissão DEVIDA é uma linha por procedimento executado**
  (`commission_lines`), e `commissions` é o EXTRATO dela: cada lançamento
  (`kind` LIBERACAO | AJUSTE | ESTORNO, com `motivo`, `released_at` e a
  transação que o causou) é uma diferença. Soma do extrato = o que a linha deve.
  - A linha nasce em `concluir_atendimento`, com o RETRATO da regra e da
    configuração (modo, descontos, base com pontos): mudar a configuração vale
    para os próximos atendimentos, não reescreve os concluídos.
  - **A base é lida no servidor** (`linhasDoAtendimento`,
    `lib/comissoes/leitura.ts`): avulso = preço do atendimento; sessão de plano
    = CADA procedimento da sessão com o preço dele no plano (e a regra dele);
    sessão de pacote = a parte DELA no rateio da venda (`package_sessions.preco`), e a regra do procedimento dela — ou a execução que o pacote diz (acima). Antes a regra do primeiro
    procedimento valia sobre a sessão inteira, e o pacote usava o preço que o
    navegador mandou.
  - Os insumos da linha são o custo dos movimentos do atendimento (a conta de
    `metrics_giro_estoque`, `custo_do_movimento`), rateado pelo preço de cada
    procedimento. O custo é o da unidade de CONSUMO (§9.5): 5 ml de um frasco
    de 100 ml a R$ 90 descontam R$ 4,50, não R$ 450 (D1, 2026-10-27).
- **A conta mora no BANCO, e só lá**: `private.comissao_conta` diz quanto a
  linha deve AGORA (`alvo`), quanto deveria paga (`previsto`) e se está paga
  (`quitado`); `private.comissao_alvo` é o `alvo` dela, e
  `private.comissao_acertar_linha` lança a diferença para o
  já lançado (trava por linha; chamar duas vezes não lança duas). Não há cópia
  em TS — o recebimento do plano entra por gatilho e precisa dela.
  - Percentual: sobre preço − desconto comercial (sempre) − pontos/voucher
    (se saem da base) − taxa do recebimento (se marcada) − insumos (se
    marcados). Valor fixo: só pontos e voucher o reduzem, na proporção; taxa,
    insumos e desconto comercial não. No pacote e no plano o desconto já está
    no preço da sessão e do procedimento (§9.6).
  - INTEGRAL (toda linha desde 2026-11-01): avulso só vale pago; plano,
    pacote, pré-pago e produto só com o recebido (com os pontos) fechando com o
    total (soma dos procedimentos do plano, preço da venda do pacote, vendido −
    unidades canceladas do pré-pago, vendido do produto). O recebimento novo
    depois do estorno (§9.6, D6 de 2026-10-28) a devolve UMA vez — a conta lê
    o lançamento vivo do atendimento, e o estornado só quando não há outro.
    Pacote vendido antes de 2026-09-30 (sem venda no sistema) libera na
    conclusão.
  - As linhas de ANTES seguem o modo retratado: ATENDIMENTO (devida desde a
    conclusão; o estorno do pagamento a zera) e PAGAMENTO (plano e pacote na
    proporção do que receberam).
  - Taxa: `private.comissao_taxa_pct` (a do meio; no crédito, a das vezes
    EXATAS do recebimento; com a BANDEIRA do pagamento, a dela das vezes
    exatas, senão a geral daquelas vezes — r3-f13-01, sem herdar faixa da
    bandeira desde o r4-f15-01; sem nenhuma das duas, 0% — F16-2, nunca a de
    outras vezes: a comissão é sobre o valor cheio). No plano, ponderada pelo que
    cada recebimento pagou. **Com as taxas POR MAQUININHA** (D8 do levantamento
    das regras, o Heitor, 2026-11-11; `vendas-financeiro.md` §9.6), a taxa
    descontada da base é a da MAQUININHA do recebimento daquelas vezes (e a da
    bandeira dentro dela, quando ela cobra diferente), pela mesma
    `private.comissao_taxa_pct`; sem taxa naquelas vezes, 0%. Feito na F67
    (C75): a maquininha vem do lançamento (`maquininha_id`, que o gatilho
    `private.maquininha_do_lancamento` preenche com a primeira ativa quando a
    tela não pergunta). As vezes do recebimento: `cartao_vezes` (crédito em N
    vezes, pago na hora — 2026-10-20; nulo = 1x) — em TODO ramo. NUNCA
    `parcela_total`: ela é do crediário (a parcela 2 de 3 paga no crédito à
    vista é crédito 1x, e cobrava a taxa do 3x — VF2-01 da varredura de 18/11,
    decisão do Claude pela regra das vezes, `vendas-financeiro.md` §9.6; a
    migration `20261124600002` tirou o `parcela_total` das contas da taxa, da
    comissão e do caixa).
- **Quem acerta**: a conclusão, e o gatilho `trg_comissoes_do_pagamento` em
  `financial_transactions` (pagamento, recebimento do plano, estorno — marcar
  `notes = 'Estornada'` é o estorno). `confirmar_pagamento_do_atendimento` não
  mexe mais em comissão, e `loyalty_configs.commission_base` não é mais lido.
- **Atendimento concluído não se cancela nem vira falta** (gatilho
  `trg_atendimento_concluido_nao_cancela` + `updateAppointmentStatus`): tem
  prontuário, baixa e comissão. Desfazer o dinheiro é estornar o pagamento.
- `period_ref` do lançamento é o mês de `released_at` (fuso de SP).
  **Passa ao fuso da REDE** (D12 do levantamento das regras, o Heitor,
  2026-11-11; princípio 3: o mesmo mês em toda tela): o `period_ref` e os
  limites do fechamento usam `fusoDaRede` (`lib/comissoes/periodo.ts`,
  `private.comissao_acertar_linha`) — correção C4; até ela entrar, é SP.
- **O período de uma comissão é o do LANÇAMENTO** (`released_at`), em toda
  métrica (`metrics_core`, `_by_branch`, `_commissions_detail`,
  `_top_professionals`, a aba Profissionais de `metrics_relatorio`) e no
  fechamento — não o do atendimento: o ajuste de outubro de um atendimento de
  setembro é dinheiro de outubro, e o plano no crediário libera meses depois
  da sessão, quando a última parcela entra.
- **Fechamento** (Financeiro → Comissões, `/admin/financeiro/comissoes` e
  `/[slug]/financeiro/comissoes`, corpo em `app/_shared/comissoes-da-equipe.tsx`):
  - Os períodos são os da configuração, no fuso (`lib/comissoes/periodo.ts`:
    mensal, quinzenal 1–15/16–fim, semanal segunda a domingo).
  - A tela lê do banco, agregado: `comissoes_resumo` (por profissional e
    unidade: lançado, a pagar, pago) e `comissoes_extrato`. O CSV é o extrato,
    montado no navegador.
  - **O filtro de Tags** (Q04 do catálogo das Comissões, revisão de 24/11: "a
    aba Comissões tem filtro, então ganha o de Tags (a tag da cliente da
    comissão)"): ao lado do período e da unidade, na URL (`?tags=`, que a
    troca de período, de unidade e as abas do Financeiro levam). A régua é a
    dos Relatórios (TF-02): entra a comissão cuja cliente tem TODAS as tags
    marcadas — a cliente da comissão mora num lugar só,
    `public.cliente_da_comissao` (a do atendimento, a do lançamento e, sem os
    dois, a da venda da linha: produto, pacote, plano, pré-pago). No banco
    (`p_tags` de `comissoes_resumo` e `comissoes_extrato_com_regra`,
    migration `20261203400003`): o lançado, o a pagar, o aguardando e o
    extrato contam só essas; o pago, só a parte delas em cada fechamento. Os
    "Últimos fechamentos" são da pessoa inteira e não mudam — e, com tag
    marcada, o título diz isso ("· sem o filtro de tags",
    `[data-fechamentos-sem-tags]`, com a explicação na Dica; decisão do
    Claude, 25/11, princípio 3). Com tag marcada
    o "Fechar e pagar" sai e a linha diz "limpe as tags para fechar e pagar"
    — o fechamento paga TODAS as comissões da pessoa, e o botão ao lado de um
    a pagar filtrado pagaria um valor que a tela não mostra (princípio 3;
    decisão do Claude, catálogo de 24/11).
  - "Fechar e pagar" (`fecharComissoes`, `financial: MANAGE`; a vista pessoal
    não fecha) chama `comissao_fechar`, que numa transação reivindica o que
    está ABERTO e não fechado até o fim do período (ou até agora),
    cria `commission_payouts` e a **despesa paga** (categoria "Comissões", na
    unidade) e marca os lançamentos `PAID` com `payout_id`. Trava por
    profissional e unidade: dois cliques fecham uma vez.
    **E a tela diz que o fechamento é por unidade** (A27 da 14ª, F75): com
    mais de uma unidade, as Comissões dizem "O fechamento é por unidade: quem
    atende em mais de uma tem um fechamento em cada, e cada um vira uma
    despesa paga no financeiro daquela unidade" (`[data-fechamento-por-unidade]`).
    Prova: `e2e/indicadores-f75-recortes-ditos.spec.ts`.
  - **No lucro, a comissão entra quando é LANÇADA, e a despesa do fechamento
    fica só no caixa** (decisão do Heitor, 2026-11-04: o lucro desconta as
    comissões; `indicadores.md`, "Lucro e margem"): a despesa paga
    "Comissões" sai da despesa operacional do lucro, senão a comissão
    descontaria duas vezes.
  - **No período em curso, o fechamento é até AGORA, e a tela diz** (A32 da
    10ª simulação, 2026-11-10: no dia 10, a janela dizia "até o fim de
    nov/2026" e o fechamento gravava "de 10/11 a 10/11"): com o período ainda
    correndo (`periodoEmCurso`), "tudo o que está a pagar até agora. O período
    de nov/2026 ainda está em curso: o que for lançado até o fim dele fica para
    o próximo fechamento."; e cada fechamento diz "lançamentos de 10/11/2026
    até 10/11/2026 às 02:30" (o primeiro lançamento e o fim, que é a hora do
    pagamento). A regra não mudou. Prova: `e2e/comissoes-uso-da-10.spec.ts` ("A32").
    As três datas (o início, o fim com a hora e o pago) vão no fuso da rede
    (`textoDoFechamento`, `lib/comissoes/extrato-texto.ts`; D3 da 23ª: a tela
    dizia a hora de Brasília e o CSV a da rede). O pago diz também a HORA
    ("pago em 18/11/2026 às 10:05" — A29 da 24ª): dois fechamentos do mesmo
    dia se distinguem.
  - **Pagar só parte: marcar e desmarcar os lançamentos** (A21 da 10ª
    simulação; decisão do Heitor, 2026-11-10: "concordo com marcar e
    desmarcar" — a Admin da rede queria pagar parte da comissão da Camila agora e o
    resto depois). O "Fechar e pagar" lista os lançamentos a pagar da pessoa na
    unidade (os de antes do período inclusive), TODOS MARCADOS
    (`[data-lancamentos-do-fechamento]`), e o "Pagar agora" se refaz ao
    desmarcar (`[data-pagar-agora]`: "Pagar agora (1 lançamento fica a pagar)
    R$ 54,00"). O desmarcado continua "a pagar" no extrato e volta MARCADO no
    próximo fechamento. **Não existe pagar um valor digitado**: um lançamento é
    pago inteiro ou fica (o adiantamento em valor criaria um saldo que a próxima
    conta teria de descontar). Quem paga é o banco, pelos ids marcados:
    `comissao_fechar_escolhidos` (migration `20261110005201`) — o fechamento de
    sempre (despesa paga, `commission_payouts`, lançamentos `PAID` com o
    `payout_id`, `comissao.paga`, a mesma trava por profissional e unidade)
    sobre os escolhidos; cada um tem de ser desta pessoa, desta unidade, aberto,
    sem fechamento e lançado até o fim, senão nada se paga ("Um dos lançamentos
    escolhidos já foi pago ou mudou…"). `comissao_fechar` (tudo) passou a chamar
    este com todos os abertos — a conta do fechamento mora num lugar só; o
    `fecharComissoes` sem a lista (chamador antigo) segue pagando tudo. **E cada
    lançamento diz se foi pago**: o extrato e o "Minhas comissões" mostram
    "Paga em 10/11/2026" ou "A pagar" na linha, e o CSV ganhou a coluna "Pago
    em" ao lado da "Situação" (o dia do fechamento dele, `pagoEm` em
    `extratoDasComissoes`). Prova: `e2e/comissoes-pagamento-parcial.spec.ts`.
    **O CSV segue a ordem do tempo e diz a ligação** (A8 da 21ª; princípio
    3): as linhas pela hora em que foram lançadas, com a coluna "Hora", e a
    coluna "Ligação" com o mesmo texto da tela ("desfaz a liberação das
    13:45", `vinculosDoExtrato`). Prova: `tests/atritos-da-21-caixa.test.ts`.
    **O estorno já descontado diz isso** (A17 da 22ª): a linha negativa paga
    num fechamento é "Descontada em dd/mm/aaaa" na tela e "Descontada no
    pagamento" no CSV ("A descontar" enquanto aberta), não "Paga"; e o CSV
    termina com "Pagamentos das comissões" (cada fechamento, o dia e a hora,
    o valor e se foi estornado). Prova: `tests/atritos-da-22-caixa.test.ts`.
  - Fechamento não se reabre: estorno depois dele vira lançamento negativo
    no próximo. Saldo negativo não fecha.
  - **Estornar um fechamento** (`estornarFechamento` →
    `comissao_estornar_fechamento`, com motivo — numa janela, "Estornar o
    fechamento?", com quem e quanto: A29 da 24ª; era um grupo aberto na
    própria linha): estorna a despesa por
    `estornar_transacao` e devolve os lançamentos dele a "a pagar". É a ÚNICA
    porta — o gatilho `trg_despesa_de_fechamento` recusa estornar essa despesa
    pelo financeiro comum (a comissão ficaria "paga" com o dinheiro de volta).
- **Eventos**: `comissao.gerada` (app, na conclusão, um por LINHA — a chave era
  por atendimento e a sessão de plano perdia os outros), `comissao.liberada`
  (banco, em `comissao_acertar_linha`, quando um pagamento libera) e
  `comissao.paga` (banco, em `comissao_fechar`).
- **Quem vê quanto cada um ganha é quem tem o Financeiro em Ver** (sem o "só
  os meus", SM1, 2026-11-23): vê as comissões de todos, nas unidades ao
  alcance. **A vista pessoal "Minhas comissões"** (SM2,
  `vistaPessoal(ctx, 'financial')`) é de quem atende ou tem comissão no nome
  dela e NÃO tem o Financeiro (comissão no nome dela = o percentual de venda
  próprio OU alguma comissão gravada: a venda do plano e a do produto pagam pela
  regra da REDE a quem vendeu, sem percentual no cadastro — decisão do Claude
  aprovada pelo Heitor em 23/11, "vamos pela sua recomendação"; a primeira
  comissão aparece no menu quando o cache do membro vence, até 1 h): ela vê só a PRÓPRIA comissão — a tela "Minhas
  comissões" (o financeiro da rede a manda para lá) e o destaque do dashboard
  da unidade — e não fecha (a vista só mostra). As comissões da aba
  Profissionais dos relatórios, o ranking do dashboard e as do Copilot exigem
  o Financeiro em Ver; a comissão das outras nunca sai do servidor. `team` e
  `reports` não bastam (COM-01 da varredura de 18/11).
  **A tela de Cargos diz isso**: com o Financeiro em "Sem acesso", a linha
  diz "Não aparece para esta pessoa — a menos que ela atenda ou tenha comissão
  no nome dela: aí vê as Minhas comissões, só as dela." (`LEVEL_COPY`,
  `lib/permissions-copy.ts`). Saiu o aviso "Não vê as próprias comissões…"
  (A48 da 7ª, `[data-sem-minhas-comissoes]`): com a vista pessoal, quem vende
  vê as dela sem o Financeiro.
- O ranking de comissão é `metrics_ranking_comissao` (ordena pela comissão;
  o dashboard reordenava o top 5 por atendimentos).
- Prova: `e2e/comissoes-configuracao.spec.ts`, `e2e/comissoes-calculo.spec.ts`,
  `e2e/comissoes-pagamento-integral.spec.ts` e `e2e/comissoes-fechamento.spec.ts`; os valores do eixo novo no
  `e2e/indicadores-cenario.spec.ts`.
- **Quem foi desativado aparece "(inativo)" em Financeiro → Comissões** (A43
  da 6ª simulação, 2026-11-04): a comissão dele continua (a pagar, lançada,
  paga), com a marca do filtro "Responsável" do quadro (H6) — era igual à de
  quem está ativo (`ComissoesDaEquipe`). Prova:
  `e2e/comissoes-minhas-no-menu.spec.ts` ("A43").

---

## O que nunca fazer aqui

```
❌ Gravar em commissions fora de comissao_acertar_linha, ou calcular valor de comissão no TypeScript (a conta é comissao_alvo)
❌ Mostrar o preço da linha (commission_lines.preco) como "base", ou refazer a base no TypeScript — é a de comissao_conta_detalhe (comissoes_extrato_com_base — D3 da 10ª); mudou a conta, muda nela (comissao_conta lê dela)
❌ Dizer no lançamento de um pagamento a base de outro (o pagamento de hoje): é a do pagamento dele (private.comissao_base_do_pagamento — D5 da 18ª)
❌ Mostrar no lançamento com retrato a base de hoje: é a do base_retrato, gravado ao nascer (o estorno, o da liberação que desfaz — 26ª)
❌ Escrever no lançamento antigo a base de HOJE (o fator do cancelamento que veio depois dele): é a da hora do lançamento (private.comissao_fator_em — D7 da 11ª)
❌ Liberar comissão sobre o que a cliente ainda deve à rede (crediário, avulso sem pagamento) — só com o pagamento integral; o cartão em N vezes JÁ é pago
❌ Criar linha de comissão em outro modo que não INTEGRAL (o gatilho trg_comissao_linha_integral garante), ou reescrever o modo de uma linha antiga
❌ Decidir a regra de um procedimento sem as gerais (regraAplicavel sem o terceiro argumento ignora "a mesma para todos")
❌ Mandar ao banco a base de comissão que o navegador enviou (plano e pacote se leem em linhasDoAtendimento)
❌ Deixar a escolha da rede sobre os pontos ("Sobre o valor pago") valer só no avulso — vale no pacote, no plano e nas vendas (comissao_conta_detalhe; item 10 da auditoria)
❌ Zerar a comissão de "R$ fixo por sessão" do pacote de fora por falta do valor de referência — só o percentual depende dele (item 11 da auditoria)
❌ Cancelar ou marcar falta num atendimento concluído — o que se desfaz é o pagamento (estorno)
❌ Recortar comissão por scheduled_at do atendimento (o período é o do lançamento, released_at)
❌ Mostrar comissão de outra pessoa sem o Financeiro em Ver (team, reports e a vista pessoal não bastam)
❌ Gravar a comissão de um procedimento sem recusaDaComissaoDaAdmin (quem não é Admin mexia no valor da Admin)
❌ Criar a comissão da responsável do pacote com outra conta que não a da linha PACOTE_VENDA (pacote_responsavel = true) — ela é sobre o pacote pago inteiro e cai com o cancelamento, como a de venda
❌ Pagar comissão fora de comissao_fechar / comissao_fechar_escolhidos (a despesa e os lançamentos pagos vão juntos)
❌ Pagar parte de um lançamento, ou um valor digitado no fechamento: o lançamento é pago inteiro ou fica (A21 da 10ª — "marcar e desmarcar")
❌ Contar no lucro a despesa paga "Comissões" do fechamento (a comissão já desconta quando é lançada — 2026-11-04): ela fica só no caixa
❌ Estornar a despesa de um fechamento fora de comissao_estornar_fechamento (os lançamentos têm de voltar a "a pagar")
❌ Criar comissão de venda sem a precedência item > pessoa > rede, ou sem gravar de onde veio (commission_lines.regra_de — A17 da 11ª)
❌ Aceitar em "Quem vendeu" quem não vende (não atende na unidade, não recebe, sem o Comercial no cargo) — A42 da 11ª
❌ Mandar ao navegador a comissão de venda de outra pessoa a quem não tem o Financeiro (equipeDaVenda sem veComissaoDeTodos — A18 da 12ª)
❌ Criar a comissão de venda do plano com outra conta que não a da linha PLANO sem atendimento (plano_comissao_de_venda + comissao_conta), ou deixá-la inteira no plano cancelado (ela vale o usado, na proporção — D4 da 9ª)
```
