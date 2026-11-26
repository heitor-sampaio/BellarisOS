# Fidelidade

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.2.2 Fidelidade (configurável pela rede)

**O programa é da REDE, nasce DESLIGADO e cada rede configura** (decisão do
Heitor, 2026-09-28). A config mora em `loyalty_configs` (uma linha por rede) e é
editada em Configurações → Fidelidade — pede `settings: MANAGE` e ser a Admin
da rede (o cargo de sistema; o Heitor, 18/11: a configuração da rede toda é
"só pela conta admin" — até ali bastava “A rede inteira”). O catálogo de
recompensas, igual (`salvarConfigFidelidade` e `salvarRecompensa` passam por
`recusaDaConfigDaRede`). Desligado, **nenhum sinal de pontos aparece**: nem na ficha, nem no portal.

- **O ponto nasce no PAGAMENTO**, não na conclusão: gatilho
  `trg_fidelidade_ganho` em `financial_transactions` (receita paga, com cliente,
  que não é estorno nem crédito interno). Pelo mesmo argumento do §9.9: receita
  paga nasce em vários lugares do código. Emite `fidelidade.pontos_ganhos`.
- **Modo de ganho — a rede escolhe UM:** por real pago (`floor(valor ×
  points_per_real)`) ou por procedimento (`procedures.loyalty_points`, editado
  no cadastro do procedimento, só nesse modo; sem teto de 1.000.000 — o
  Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
  feito." —: acima disso, o comum por decisão do Claude, 25/11, o cadastro
  avisa, `[data-acima-do-comum="pontos-do-procedimento"]`, e grava; recusa só
  o negativo, o fracionário e o acima do `integer`, `lerPontosDoProcedimento`).
  Os pontos de UM pagamento (os do procedimento × as unidades, ou o valor ×
  os pontos por real) se contam em bigint, e o que não cabe no registro recusa
  o pagamento com "Os pontos deste pagamento passam de 2.147.483.647 (o limite
  do registro)." (`private.pontos_no_registro`); o ganho que passaria o SALDO
  do `integer` recusa como o ajuste ("O saldo de pontos passaria de
  2.147.483.647 (o limite do registro)…", `on_transaction_loyalty_earn`) —
  decisão do Claude, 25/11; migration `20261207400001`. Plano é **cumulativo** pelo que
  já foi pago: entrada + restante somam exatamente os pontos do plano.
  **O pacote e o pré-pago no crediário também** (D14 do levantamento das
  regras, o Heitor, 2026-11-11; a regra do caminho irmão): cada parcela paga dá
  o alvo menos o que já foi dado, como o plano (C43, feito na F67 em
  `fidelidade_pontos_do_pagamento`, migrations `20261112006706`/`6707`:
  cada parcela arredondava sozinha, 3 × R$ 33,33 davam 99 pontos de R$ 100;
  o "já deu" conta o `ESTORNO_GANHO` do contra-lançamento, pelo
  `estorno_de`). Prova: `e2e/fidelidade-f67.spec.ts`.
  A regra mora numa função só: `fidelidade_pontos_do_pagamento` — e multiplica
  antes de dividir (120 × (100 ÷ 300) perdia um ponto).
  **O atendimento avulso também é cumulativo** (2026-11-16, migration
  `20261121000001`): desde que ele se recebe em várias formas e no crediário,
  são vários lançamentos — cada um dá o alvo do atendimento na proporção do
  que já foi pago, menos o que já foi dado; o procedimento com pontos fixos
  não os dá duas vezes.
  **O pago com o programa DESLIGADO não conta** (D12 da 26ª; o Heitor, 18/11:
  "se o programa é ligado no meio não conta ponto"): a entrada de R$ 200 paga
  antes de a rede ligar a fidelidade entrava no "já pago" e a parcela de
  R$ 200 dava 400 pontos. O banco guarda quando o programa foi ligado
  (`fidelidade_ligada`, pelo gatilho da config: nasceu ligada ou passou de
  desligada a ligada; o passado, pela Auditoria da config — migration
  `20261130100004`), e nos quatro ramos cumulativos o alvo e o "já deu"
  contam só os pagamentos desde então (`paid_at`; o estorno, pelo pagamento
  que ele estornou): a parcela dá 200. Religado depois de desligar, a conta
  recomeça do novo "ligado em" — o período ligado de antes já deu os pontos
  dele, e o intervalo desligado não conta. **No modo "por procedimento"** o
  alvo segue proporcional (decisão do Claude, 26ª, princípio 3): os pontos ×
  a parte paga com o programa ligado ÷ o total — o pacote de 10 pontos pago
  metade antes de ligar dá 5. Prova: `e2e/fidelidade-ganho.spec.ts`,
  `tests/fidelidade-config.test.ts`.
- **Os números com fração da configuração** (pontos por R$ 1, valor de 1
  ponto até 4 casas, teto em %) leem como o dinheiro: `parseDecimal`
  (`@estetica-os/utils`, o `parseDinheiro` com N casas). O ambíguo ("0.012")
  mostra `NUMERO_INVALIDO` ("use vírgula…") junto do campo e não salva. A tela
  tirava todos os pontos antes de trocar a vírgula: "0.5" ponto por real
  gravava 5, e "0.01" no valor do ponto, R$ 1 (frente de cadastro,
  2026-10-29). Os inteiros (mínimo, meses, bônus, dias) continuam lendo o
  ponto como milhar. Prova: `e2e/fidelidade-opcionais.spec.ts` ("0.5").
- **Acima do comum avisa, não recusa** (princípio 2, o Heitor, 2026-11-04:
  "no máximo, avisar"). Os tetos de antes (1.000 pontos por R$ 1, R$ 1.000 o
  ponto, 1.000.000 de mínimo, de bônus e da indicação, 120 meses de validade,
  90 dias de aviso, 365 dias de validade do voucher) viraram o limite do
  AVISO: acima deles o campo diz "Acima do comum (…). Confira: o valor vale
  como está." (`avisoDaFidelidade`, `avisoDaValidadeDoVoucher`,
  `lib/acima-do-comum.ts`) e grava. Só se recusa o impossível (zero onde não
  cabe, negativo) e o que o registro não guarda: o tipo da coluna, e 100 anos
  nos prazos (a conta das datas estoura). O banco perdeu os tetos na
  migration `20261204200001`. Os números são decisão do Claude, 25/11: o
  aviso começa no teto de antes. Prova: `tests/tetos-avisam-nao-recusam.test.ts`.
  O custo da recompensa também (o Heitor, 25/11: "Se não for impossível,
  ainda que improvável, pode ser feito."): acima de 10.000.000 de pontos (o
  teto de antes) o catálogo avisa (`avisoDoCustoDaRecompensa`) e grava; só o
  zero, o fracionário e o acima do registro (`integer`, 2.147.483.647) são
  recusados. Prova: `tests/validade-e-custo-acima-do-comum.test.ts`.
- **Cartão em N vezes pontua na VENDA, inteiro** (F2c, 2026-11-01): a
  cliente pagou tudo na maquininha. O que a operadora deposita em parcelas
  (`recebiveis_do_cartao`) não é pagamento e não pontua de novo. Prova:
  `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`.
- **O crédito interno VENDIDO pontua na venda, pelo dinheiro pago** (decisão
  1 do Heitor sobre a 9ª simulação, 2026-11-07: "os pontos na VENDA do
  crédito, pelo dinheiro pago, não no uso"; `vendas-financeiro.md` §9.3.4):
  `floor(valor × points_per_real)` em QUALQUER modo de ganho — também "por
  procedimento", que o crédito não tem procedimento (como o produto). O uso
  depois, pago com crédito interno, não pontua. O estorno da venda do crédito
  tira os pontos do que voltou (na proporção, no estorno parcial). É o
  primeiro ramo de `fidelidade_pontos_do_pagamento` (`credito_vendido_id`).
  Prova: `e2e/vendas-credito-interno.spec.ts`. **O bônus do crédito não
  pontua** (A20 da 11ª, decisão do Claude, pela decisão 1 do Heitor acima —
  "pelo dinheiro pago"; não há aprovação dele registrada para a A20): os pontos são sobre o PAGO (R$ 500
  de R$ 500 + R$ 50 de bônus), pelo lançamento; o bônus é concessão sem
  dinheiro. Prova: `e2e/vendas-credito-bonus.spec.ts`.
  **A tela diz isso** (A15 da 32ª; princípio 3): em Configurações →
  Fidelidade, o "Pontos por R$ 1 pago" fica à vista também no modo "Por
  procedimento" — sumia, e o crédito e o produto pontuam por ele —, e a dica
  diz que ali ele vale para o crédito interno vendido e, se ligada, a venda
  de produto (`fidelidade-config.tsx`; teste
  `tests/fidelidade-pontos-por-real-no-modo-procedimento.test.ts`).
- **Estorno** (`estornar_transacao`) tira exatamente o que aquele pagamento deu
  (lê o GANHO). Saldo pode ficar **negativo**, como estoque. **E a janela do
  estorno diz ANTES** (A30 da 12ª simulação, 2026-11-11; princípio 3: a Helena
  estornou o pagamento da Carla sem saber que saíam os 180 pontos dela e os 200
  do prêmio da Ana): "Saem 180 pontos de Carla, os que este pagamento deu: o
  saldo dela vai de 380 a 200 pontos. E saem os 200 pontos do prêmio de Ana pela
  indicação de Carla." — ou que voltam os pontos usados nele, que o prêmio passa
  ao outro pagamento dela, que o voucher do prêmio é cancelado (ou, usado, fica)
  (`[data-pontos-do-estorno]` no `ConfirmarEstorno`; a conta é do banco,
  `fidelidade_pontos_do_estorno`, migration `20261111006102`, e o texto,
  `textoDosPontosDoEstorno`, `lib/fidelidade/pontos-do-estorno.ts`). Com a
  fidelidade desligada, nada. A regra não mudou. Prova:
  `e2e/fidelidade-atritos-da-12.spec.ts` ("A30"), `tests/atritos-da-12-f61.test.ts`.
- **Ajuste manual** pela equipe (`loyalty: MANAGE`), com motivo, por
  `ajustar_pontos` — débito acima do saldo é recusado.
  **Sem teto de 1.000.000** (o Heitor, 25/11: "Se não for impossível, ainda
  que improvável, pode ser feito."): acima de 1.000.000 de pontos (o teto de
  antes, o comum — decisão do Claude, 25/11) a ficha avisa ao lado do campo
  (`avisoDoAjusteDePontos`, `[data-acima-do-comum="ajuste-de-pontos"]`) e o
  servidor grava. O impossível é o registro: os pontos são `integer` (até
  2.147.483.647; `recusaDoAjusteDePontos`, `lib/fidelidade/pontos-acima-do-comum.ts`),
  o fracionário ("Os pontos são um número inteiro.") e o zero; e o crédito
  que faria o SALDO passar do integer, recusado no banco com "O saldo passaria
  de 2.147.483.647 pontos (o limite do registro): o cliente tem N pontos."
  (migration `20261207400001`). Prova:
  `tests/pontos-do-ajuste-e-do-procedimento-acima-do-comum.test.ts`.
- **O extrato do app diz a recompensa trocada** (A26 da 25ª simulação;
  princípio 3): a troca ("Recompensa: Limpeza de pele") e o uso no pagamento
  ("Desconto no pagamento: R$ …") levam a descrição que o banco escreve,
  embaixo do título (`descricaoParaACliente`, `[data-descricao-do-lancamento]`);
  o ajuste, o voucher cancelado e o estorno NÃO levam ao app o motivo nem a
  descrição que a equipe escreveu (não são para a cliente): só o título. Prova: `tests/atritos-da-25-ficha-estoque-app.test.ts`.
- **Saldo = SOMA do extrato** (`saldo_de_pontos`). `loyalty_accounts.balance`
  saiu do banco (fase 4). Extrato e conta só se LEEM pela sessão: quem
  escreve é o gatilho e o servidor, com a trava `fidelidade:<cliente>`.
- Módulo `loyalty`: VIEW = saldo, extrato e vouchers, na ficha da cliente (a
  ficha pede Clientes em Ver; a Fidelidade não é entrada do menu, e o resumo
  do cargo diz isso — `fidelidadeNoResumo`, A13 da 30ª, decisão do Claude,
  25/11); MANAGE = trocar pontos por recompensa (ficha e PDV), cancelar e
  entregar o voucher e ajustar. Ligar o programa e definir as regras é só da
  Admin da rede (18/11). **Quem só vê lê a quem pedir** (A38 da 9ª simulação,
  2026-11-07; a regra de cargo fica, como a A33 da 8ª): na ficha, "Trocar
  pontos por recompensa e ajustar pontos é de quem tem a Fidelidade em
  Gerenciar: Lúcia, Fernanda." (`[data-quem-troca]`, `quemTrocaPontos`,
  `lib/equipe/quem-desfaz.ts`: ativos, ao alcance da unidade, e a Admin da
  rede); no app sem a troca pelo portal, "A troca é feita pela equipe, com
  quem cuida da fidelidade: Lúcia." (pela unidade do endereço). Prova:
  `e2e/financeiro-ficha-e-app-da-9.spec.ts` ("A38").
- **Pontos como desconto no pagamento** (fase 2; o lugar é o PDV desde a
  fase 5b do plano de adaptação, FD2a, 2026-11-14): no PDV, ao receber, o
  cliente abate pontos do TOTAL da comanda do atendimento (o atendimento e os
  produtos acrescentados nela) ou de uma venda à vista da "Nova venda"
  (produto, pacote, procedimento). Regras da rede: valor do ponto, mínimo e teto (% do
  valor). `financial_transactions.amount` continua sendo o DINHEIRO RECEBIDO; o
  desconto vai em `loyalty_discount` (bruto = amount + loyalty_discount) — por
  isso receita, LTV e estorno seguem certos sem mudar nada.
- **O pagamento do atendimento é UMA transação**:
  `confirmar_pagamento_do_atendimento` (o app calcula em
  `lib/fidelidade/resgate.ts`, em CENTAVOS inteiros, e o banco confere o mesmo
  número: config, teto, saldo sob a trava do cliente). Grava pagamento, RESGATE,
  e linha do tempo; a comissão, o gatilho do pagamento acerta (§9.7). O
  servidor recalcula o desconto a partir dos pontos pedidos — o valor do
  navegador não entra.
- **Comissão com pontos/voucher**: sobre o preço ou sobre o valor pago — é
  `commission_configs.base_com_pontos` (Configurações → Comissões, §9.7), não
  mais `loyalty_configs.commission_base` (a coluna ficou sem leitor). A
  escolha vale em toda comissão — o atendimento, as sessões de pacote e de
  plano e as vendas (item 10 da auditoria das regras, decisão do Claude pelos
  princípios 2 e 3, 2026-11-18; era só no avulso; `comissoes.md`).
- Pago todo com pontos: `amount` 0, sem forma de pagamento, sem "Purchase" na
  API de Conversões (o `pagamento.recebido` sai, com 0).
- Estorno devolve os pontos usados (ESTORNO_RESGATE) e tira os ganhos.
- **FD2 no PDV** (fase 5b, 2026-11-14 — regra do PDV em
  `vendas-financeiro.md`):
  - Na comanda do atendimento com produtos, os pontos e o voucher se repartem
    entre os lançamentos na proporção do valor (`private.parte_dos_itens`), e
    o RESGATE sai em uma linha por lançamento: o estorno de um deles devolve
    só os pontos dele. O voucher de procedimento fica inteiro no atendimento.
  - **A ordem é desconto comercial → voucher → pontos em todo lugar** (o
    Heitor, 2026-11-18: "Desconto, voucher, pontos" — auditoria das regras):
    na comanda do atendimento o voucher vale sobre o que sobrou do desconto
    (`voucherDepoisDoDesconto`, `lib/fidelidade/voucher-na-comanda.ts`; o
    banco confere o mesmo, migration `20261124000001`), como na "Nova venda".
  - **Em várias formas** ("+ Outra forma", D1 da 18ª, 2026-11-16): os pontos
    e o voucher ficam na PRIMEIRA forma (o `loyalty_discount` dela). Na venda,
    o lançamento dela é que se reduz, e eles não passam do valor dela ("Os
    pontos e o voucher passam do valor da primeira forma…"); a base do teto e
    do voucher é a venda inteira (`private.fidelidade_na_venda` com `p_base`).
    No atendimento avulso, só no à vista — o crediário e o a receber os tiram.
  - Na "Nova venda", só à vista e só o voucher de DESCONTO (valor ou
    percentual); a conta é `contaDaFidelidade` (`lib/fidelidade/conta-na-venda.ts`:
    desconto comercial → voucher → pontos), refeita no servidor
    (`fidelidadeDaVenda`) e conferida no banco (`private.fidelidade_na_venda`,
    pela `venda_com_fidelidade`, uma transação). A venda de crédito interno
    (`creditos_vendidos`) não usa pontos: é dinheiro guardado, não consumo.
  - **Os três limites que ficam, e por quê** (item 12 da auditoria das
    regras, decisão do Claude pelo princípio 2, 2026-11-18: só fica o que é
    impossível; nenhum recusa um valor que a rede escolheu):
    (1) **"na primeira forma"** é só a contabilidade do lançamento: toda tela
    soma a fidelidade de volta à primeira forma (`comFidelidadeNaPrimeira`),
    então a conferência do banco ("passam do valor da primeira forma") não
    dispara pela tela — não é limite para quem recebe;
    (2) **"só à vista"** (avulso e Nova venda): o desconto de pontos e voucher
    é o `loyalty_discount` de um lançamento PAGO agora, e o RESGATE e o
    voucher se prendem a ele — é por ele que o estorno e o cancelamento do
    pacote ou do plano devolvem os pontos. No crediário sem entrada e no a
    receber, nada se paga agora, e não há onde prendê-los. Se a rede pedir,
    o próximo passo é o crediário COM entrada (a fidelidade abate a entrada),
    que mexe em quatro funções do banco;
    (3) **"só o voucher de desconto na Nova venda"**: o voucher de
    procedimento paga o ATENDIMENTO daquele procedimento, e se usa na comanda
    dele; no pré-pago, no pacote e no plano ele exigiria uma unidade a preço
    zero no rateio que o cancelamento da unidade, a comissão e as Vendas leem.
  - **O ponto nasce quando a comanda é paga** (FD2b), pelo valor pago: o
    lançamento nasce em aberto e vira pago já reduzido, e o gatilho de ganho
    (`on_transaction_loyalty_earn`, no UPDATE de `is_paid`) pontua o que entrou.
    O estorno tira o que aquele lançamento deu (`estornar_transacao`, sem
    mudança). O produto só pontua se a rede ligou (como antes).
  - A ficha diz, no voucher de desconto ativo, "Usa-se no PDV, ao receber"
    (`[data-voucher-no-pdv]`); Configurações → Fidelidade diz "No PDV, ao
    receber" (FD2c).
  - **Na comanda do PLANO** (Bloco Plano de tratamento, leva 2, 2026-11-14):
    o mesmo bloco no "Receber o plano", no à vista, sobre o plano depois do
    desconto comercial; `checkoutTreatmentPlan` confere (`fidelidadeDaVenda`)
    e `plano_checkout_com_fidelidade` (service_role) lança o à vista em aberto,
    fecha o plano (`plano_checkout`) e passa pelo `private.fidelidade_na_venda`.
    No crediário, a tela diz que os pontos são do à vista. O ponto nasce do
    que foi pago (o mesmo gatilho). O contrato de plano cita o valor do plano.
  - Prova: `e2e/pdv-comanda-varios-itens-e-pontos.spec.ts`,
    `e2e/plano-tratamento-leva-2.spec.ts` ("FD2a/FD2b na comanda do PLANO").
- **Pacote cancelado** (F2b, 2026-11-01; `vendas-financeiro.md` §9.3.1): os
  pontos seguem o estorno. Devolvido como ESTORNO, cada lançamento estornado
  inteiro tira o que deu (`estornar_transacao`), e o estornado EM PARTE tira
  na proporção do que voltou (ESTORNO_GANHO de `pontos × voltou ÷ pago`,
  ligado ao contra-lançamento "Estorno parcial"). Devolvido como CRÉDITO
  interno, os pontos ficam: o dinheiro não voltou (e pagar com crédito interno
  não pontua). Parcela a receber que caiu nunca deu ponto. Prova:
  `e2e/pacote-cancelar.spec.ts`. **E a janela diz os pontos antes** (A26 da 10ª
  simulação, 2026-11-10: a Camila tinha trocado os pontos do pacote, e o estorno
  a levou a −380 sem aviso): com a fidelidade ligada e algo a devolver, o
  "Cancelar pacote" (e o "Cancelar plano") diz "Os pagamentos deste pacote
  deram 750 pontos, e a cliente tem 220 hoje. O estorno tira os pontos do que
  voltar, na proporção — e o saldo pode ficar negativo…" (`[data-pontos-do-cancelamento]`,
  `fidelidade_pontos_do_conjunto`, migration `20261110005103`). A regra não
  mudou. Prova: `e2e/ficha-uso-da-10.spec.ts` ("A26"). **A unidade cancelada do pré-pago** segue a
  mesma regra (D1 da 6ª simulação, 2026-11-04): o estorno tira os pontos do
  que voltou, o crédito interno os deixa. Prova:
  `e2e/pre-pago-cancelar-unidade.spec.ts`.
- **Catálogo de recompensas e vouchers** (fase 3): a rede cadastra recompensas
  (`loyalty_rewards`: procedimento grátis, desconto R$ ou %, produto) em
  Configurações → Fidelidade. A EQUIPE troca os pontos na ficha
  (`resgatar_recompensa`): os pontos saem na hora e nasce um voucher
  (`loyalty_vouchers`) com validade — o cliente só VÊ no portal, a não ser que
  a rede ligue a troca pelo portal (opcionais, abaixo). O voucher
  guarda um RETRATO da recompensa: editá-la depois não muda o já emitido.
  - Procedimento/desconto: aplicado no pagamento, ANTES dos pontos (os pontos
    e o teto valem sobre o que sobra); `loyalty_discount` soma os dois.
  - Produto: ENTREGUE na ficha (`entregar_voucher_produto`), com uma embalagem
    saindo do estoque da unidade (MANUAL_ADJUSTMENT, lote pelo gatilho).
    **O brinde pode não ser produto** (A7 da 12ª simulação, 2026-11-11;
    princípio 1: a "Máscara de LED cortesia" da Helena virou um produto do
    estoque): "Nenhum — brinde ou serviço fora do estoque" no catálogo; a
    recompensa é o nome, e o "Entregar brinde" só marca o voucher como usado
    (migration `20261111006003`, que relaxa `loyalty_rewards_por_tipo`).
    Prova: `tests/fidelidade-brinde-sem-estoque.test.ts`.
    **O brinde que sai do estoque é perda "Brinde da fidelidade"** (A40 da 12ª,
    2026-11-11; princípio 3: a máscara saía de 55 para 54 sem custo em nenhum
    indicador): em Relatórios → Estoque, "Perdas no período", pelo custo do
    lote (`metrics_perdas`, motivo `BRINDE`; era "Inventário"). Como toda
    perda, é métrica: não entra no lucro (`indicadores.md`). Prova:
    `e2e/estoque-atritos-da-12.spec.ts` ("A40"). **E diz o motivo onde a
    perda aparece** (D10 da 30ª; indicadores:ER-04, "com o motivo certo"; o
    texto é decisão do Claude, 25/11): a linha "Fora do resultado" do DRE
    dizia só "perdas R$ 40,00"; diz cada motivo ("Brinde da fidelidade
    R$ 40,00 · Inventário R$ 12,50"), pelo `perdasComOMotivo`
    (`lib/estoque/perda.ts`, sobre os totais do `getPerdas`). Prova:
    `tests/perdas-com-o-motivo.test.ts`.
  - Cancelar voucher não usado devolve os pontos; vencido (derivado de
    `expires_at`) não vale e não devolve; estorno do pagamento o reativa.
    **O motivo é obrigatório, e a tela diz antes** (A23 da 30ª; princípio 7):
    o campo se chama "Motivo do cancelamento (obrigatório)" e o "Confirmar
    cancelamento" só vale com ele escrito ("Escreva o motivo para
    confirmar."); o banco segue recusando sem motivo. Prova:
    `tests/voucher-cancelar-motivo-a-vista.test.ts`.
  - **O formulário diz quanto os pontos valem e de onde vem o procedimento**
    (A5 da 7ª simulação, 2026-11-05; princípio 3): "Procedimento grátis" diz
    que o procedimento precisa estar cadastrado em Procedimentos (com o link;
    `data-procedimento-da-recompensa`), e o custo diz "2.000 pontos valem
    R$ 20,00 pelo valor do ponto (R$ 0,01…) — o procedimento custa R$ 150,00
    na tabela" (`data-valor-dos-pontos`, o `redeem_points_value` da
    configuração). Nada é recusado: a rede decide o custo (princípio 2).
    Prova: `e2e/configuracoes-atritos-da-7.spec.ts` ("A5"). **Com o valor do
    ponto em zero, avisa** (A24 da 30ª; princípio 4): "Os 400 pontos não
    valem nada em reais: o valor do ponto está em R$ 0,00 na configuração
    acima." — o texto sumia (`valorDosPontosNoFormulario`,
    `lib/fidelidade/formato.ts`; sem custo digitado, nada). Prova:
    `tests/fidelidade-valor-dos-pontos-no-formulario.test.ts`. **O desconto
    acima do que os pontos valem ganha aviso** (A18 da 21ª): "O desconto
    (R$ 30,00) vale 15 vezes o que os 200 pontos valem (R$ 2,00). Confira o
    custo em pontos ou o valor do ponto." (`avisoDaRecompensaAcimaDosPontos`,
    `[data-recompensa-acima-dos-pontos]`) — e salva igual. Prova:
    `tests/fidelidade-atritos-da-21.test.ts`.
- A conta do saldo depois de uma saída de estoque é UMA: `lib/estoque/baixa.ts`
  (conclusão do atendimento e entrega de produto).
- **Validade** (fase 4): a rede escolhe "não vencem" ou N meses
  (`expiry_months`). Cada crédito recebe `expires_at` ao nascer, CONGELADO —
  mudar a regra vale para os pontos novos. O consumo é FIFO por vencimento, e a
  conta mora numa função só, em forma fechada (`fidelidade_a_expirar`): o que
  vence até D = créditos com vencimento ≤ D menos tudo que já saiu (expirações
  incluídas, por isso é idempotente). O estorno de um ganho leva o
  `expires_at` dele — sem isso o lote estornado venceria de novo.
  - A baixa é o cron `fidelidade` (`expirar_pontos`, lança
    EXPIRACAO "Pontos vencidos"). Ficha e portal mostram "vencem nos próximos
    30 dias" (`pontos_expirando`) e o "vence em" de cada linha.
- **O saldo é UM, da rede** (FD3 do plano de adaptação, o Heitor, 2026-11-13:
  "concordo"; migration `20261114900001`). A cliente é da rede e qualquer
  unidade a atende (CL3): o ponto ganho numa unidade se usa em todas — no
  desconto do pagamento, na troca por recompensa (pela equipe e pelo app), no
  ajuste e no voucher trocado em outra unidade. "Pontos só na unidade"
  (`scope_per_branch`, fase 4) SAIU, com o saldo por unidade
  (`saldos_por_unidade`, a linha "Unidade A: … · Unidade B: …" da ficha e do
  app) e a unidade das contas do saldo (`saldo_de_pontos(p_cliente)`,
  `pontos_expirando(p_cliente, p_ate)`, `fidelidade_a_expirar(p_conta,
  p_ate)`). O `branch_id` de cada lançamento e de cada voucher FICA: é o fato
  de onde ele aconteceu (o extrato diz "· Unidade X"), nunca um recorte do
  saldo — nem de quem mexe no voucher: cancelar e entregar o voucher trocado
  em outra unidade passa só pela rede (`voucherAoAlcance`; a entrega do
  produto confere a unidade do ESTOQUE de onde ele sai — FID-01 da varredura
  de 18/11). Prova: `e2e/fidelidade-saldo-da-rede.spec.ts`; a trava,
  `tests/fidelidade-saldo-da-rede.test.ts`, `tests/crm-varredura-de-18-11.test.ts`.
- **Opcionais da rede** (decisão do Heitor, 2026-09-29) — todos nascem
  DESLIGADOS e se ligam na aba Fidelidade:
  - **Bônus de aniversário** (`birthday_bonus`) e **de primeiro acesso**
    (`first_access_bonus`): lançamento BONUS, uma vez por `bonus_ref`
    (`ANIVERSARIO:<ano>`, `PRIMEIRO_ACESSO`) — é o índice único que impede dar
    duas vezes, não o app. Quem nasceu em 29/02 ganha em 28/02 fora de ano
    bissexto. O primeiro acesso é POR FICHA (por rede, desde 2026-10-19:
    a mesma pessoa pode ser cliente de várias com um login só) — o login marca
    a ficha do token, e o layout do portal marca cada outra na primeira vez
    que ela abre aquela rede. É o primeiro login do cliente
    (`clients.app_account_created_at`, marcado por `fidelidade_primeiro_acesso`
    no `loginAction` e na sessão do app); quem já tinha entrado antes da
    opção existir não ganha.
  - **O bônus é da cliente e vale em qualquer unidade** (H10 do levantamento
    das regras, o Heitor, 2026-11-11: "O bônus é da cliente. A cliente é da
    rede(clinica). A clinica decide onde pode ser usado." — a última frase
    caiu com o FD3, recomendação do Claude que ele aprovou em 13/11,
    "concordo": o saldo é um só, da rede).
    Com o FD3, o "Onde o bônus pode ser usado" e a
    correção C64 (o bônus preso à unidade de cadastro) saíram: não há o que
    escolher. O lançamento do bônus guarda uma unidade só como registro.
  - **A venda de produto pontua?** (`pontua_venda_de_produto`, D4,
    2026-10-30 — "os pontos são configuráveis pela clínica"): nasce
    DESLIGADO. Ligado, a venda de produto paga dá pontos por real pago
    (`points_per_real`) — também no modo "por procedimento", que o produto não
    tem os pontos do procedimento. A regra mora em
    `fidelidade_pontos_do_pagamento` (o lançamento com `product_sale_id`).
    Prova: `e2e/vendas-produto.spec.ts`. **E diz por quê** (A40 da 6ª
    simulação, 2026-11-04): com a fidelidade ligada e o produto sem pontuar,
    o lançamento pago da venda diz "Venda de produto não pontua" na aba
    Financeiro da ficha e no Financeiro do app (`vendaDeProdutoNaoPontua`,
    `lib/fidelidade/leitura.ts`; `data-sem-pontos`), como a janela "Vender"
    — a Paula e a Sofia acharam que os pontos do kit tinham sumido. Com a
    fidelidade desligada, nada. Prova: `e2e/fidelidade-produto-nao-pontua.spec.ts`.
    O produto na comanda do atendimento diz "· não pontua" (A32 da 20ª,
    `situacaoDoItemDaComanda`).
  - **Troca pelo portal** (`client_redeem`): o cliente troca pontos por
    recompensa em `/[slug]/cliente/fidelidade` (`actions/fidelidade-portal.ts`),
    com o saldo da rede (a unidade do portal é só onde a troca fica
    registrada). Desligada, só a equipe troca, na ficha.
  - **A recompensa fora do alcance diz quanto falta** (J-52, 2026-10-30):
    "Faltam 120 pontos" embaixo do "Trocar" desabilitado, no app e na ficha —
    o texto é UM, `faltamPontos` (`lib/fidelidade/formato.ts`). Sem a troca pelo
    app (`client_redeem` desligado), o app mostra o "Faltam N pontos" embaixo do
    custo da recompensa (A58 da 5ª simulação) — **e, com o saldo que alcança,
    "Você já pode trocar: peça à equipe."** (A53 da 12ª, 2026-11-11:
    com 780 pontos, a de 500 dizia só "a troca é feita na recepção";
    `jaPodeTrocar`, `[data-ja-pode-trocar]`). Prova:
    `tests/fidelidade-faltam-pontos.test.ts`, `e2e/fidelidade-opcionais.spec.ts`,
    `e2e/fidelidade-vouchers.spec.ts`.
  - **Aviso de vencimento por push** (`expiry_notice_days`, só com validade):
    `avisos_de_vencimento` REIVINDICA o aviso antes de o push sair (a conta
    guarda até onde já avisou) — um aviso por lote novo na janela, nunca um
    por dia nem dois por passagem concorrente. O link do push vai ao portal
    da unidade dos PONTOS que vencem (o lançamento mais recente na janela);
    sem ela ativa, a última unidade que a cliente usou no portal; senão a
    primeira ativa da rede — nunca a unidade de cadastro (auditoria das
    regras, 2026-11-18; migration `20261124200004`,
    `tests/aviso-de-vencimento-sem-unidade-de-cadastro.test.ts`).
  - O dia do aniversário e o "vence em" do aviso são os da rede (F62b:
    `fusoDaRede`; Brasília de padrão). Prova: `tests/fuso-da-unidade.test.ts`.
  - A rotina é o cron `fidelidade`: expirar → aniversário → avisos, nessa
    ordem (avisar antes de expirar contaria o que acabou de vencer).
  - ⚠️ As três funções da rotina aceitam `p_tenant` (nulo = todas, o cron).
    **Teste que as chama com data escolhida à mão passa a rede `[e2e]`** — sem
    o recorte, "e se hoje fosse 2027?" vence pontos e dá bônus de clientes
    reais na produção.
- **A indicação que premia** (A43 da 10ª simulação e o caso da Ana Clara e da
  Marina; decisão do Heitor, 2026-11-10: "1 - sim"; migrations
  `20261110005202`, `20261110005203`). A Ana indicou a Marina, a Marina pagou e
  a Ana não ganhou nada — quem tinha a Fidelidade em Gerenciar deu +300 à mão em "Ajustar pontos".
  - **"Indicada por" é um VÍNCULO com outra ficha da mesma rede**
    (`clients.indicada_por`), não um texto: escolhe-se pela busca do nome ou do
    telefone (`CampoIndicadaPor`, `buscarQuemIndicou` — a regra de
    `buscar_clientes`) no Novo cliente, no Agendar com cliente nova
    (`garantirClienteRapido`) e na ficha, aba Dados (`updateClientContactData`,
    `indicadaPor`). O id vem do navegador e é conferido antes de gravar
    (`conferirIndicadaPor`, `lib/clients/indicada-por.ts`: "A ficha de quem
    indicou não é desta rede.") e de novo no banco (`trg_indicada_por_confere`:
    de outra rede ou a própria ficha, recusado). A **importação** liga pelo
    nome quando ele bate com UMA ficha ativa (sem caixa nem acento,
    `fichas_pelo_nome`); quando não bate (nenhuma ou mais de uma), guarda o
    texto em `referred_by`, como sempre, e o resultado diz "Indicada por
    “Fulana”: nenhuma ficha com esse nome — ficou o texto, sem ligar." A ficha
    que já tem quem a indicou não muda (só o vazio se completa). Ligar na aba
    Dados tira o texto da planilha.
  - **Em Fidelidade, "Prêmio por indicação" NASCE DESLIGADO** (princípio 6;
    `loyalty_configs.indicacao_premio`: `DESLIGADO` | `PONTOS` | `RECOMPENSA`,
    com `indicacao_pontos` e `indicacao_recompensa_id`; Configurações →
    Fidelidade → Indicação, `[data-testid=opcional-indicacao]`): N pontos ou
    uma recompensa do catálogo para QUEM INDICOU. A recompensa sai como voucher
    SEM custo de pontos (o retrato da recompensa, como na troca); só a ATIVA
    (a arquivada não sai, e o app não a promete). Cancelar esse voucher não
    devolve pontos — ele não custou nenhum (`cancelar_voucher` só devolve
    `points_cost > 0`).
  - **O prêmio sai quando a indicada PAGA o primeiro atendimento ou a primeira
    venda** (princípio 5: sem dinheiro, sem prêmio) — o PRIMEIRO pagamento que
    vale: receita paga com dinheiro, que não é estorno, não foi estornada, não
    é crédito interno nem foi paga toda com pontos
    (`private.indicacao_pagamento_que_vale`). **Uma vez por indicada**
    (`indicacao_premios`, um prêmio ativo por indicada, índice único). Nunca
    retroativo: se ela já tinha um pagamento que vale (antes da indicação ou do
    prêmio ligado), esse foi o primeiro, e nada sai. Quem dá é o banco, pelo
    gatilho do pagamento (`trg_fidelidade_indicacao` →
    `private.indicacao_premiar`, com as travas `indicacao:<indicada>` e
    `fidelidade:<quem indicou>`) — o argumento do ponto: receita paga nasce em
    vários lugares. Os pontos entram como `BONUS` "Indicação de Marina"
    (`bonus_ref` `INDICACAO:<prêmio>`), na unidade do pagamento e com a validade
    da rede.
  - **O estorno desse pagamento tira o prêmio**, como tira os pontos do
    pagamento (`trg_fidelidade_estorno_da_indicacao`): os pontos voltam num
    `ESTORNO_GANHO` "Estorno da indicação de Marina (o pagamento dela foi
    estornado)", com o vencimento do prêmio; o voucher ainda ativo é cancelado
    (o já usado não volta: o prêmio fica como foi). **Se ela ainda tem outro
    pagamento que vale, o prêmio passa para o primeiro deles** (decidido pelo
    princípio 5: ela pagou — sai e volta, e fica um só); sem nenhum, o próximo
    pagamento dela é o primeiro que vale e premia. O estorno PARCIAL (o
    cancelamento do pacote que devolve parte) não tira o prêmio: o pagamento
    continua de pé. **A configuração diz isso** (A24 da 12ª simulação,
    2026-11-11; princípio 3): "…o primeiro atendimento ou a primeira compra (a
    venda de pacote, pré-pago, produto ou crédito interno também conta)… Se esse pagamento for estornado por inteiro, o prêmio sai junto; o
    estorno de uma parte não tira o prêmio." **E o número que vem é sugestão**
    (A6): os 300 pontos que o campo traz ao ligar dizem "300 pontos é uma
    sugestão: ajuste ao seu programa." (`[data-sugestao-de-pontos]`). Prova:
    `e2e/configuracoes-atritos-da-12.spec.ts` ("A6/A24").
  - **A ficha diz**: na Visão geral (`[data-indicacao-da-ficha]`), "Indicada
    por: Ana Clara" (o link da ficha; o texto da planilha sem ficha diz "ligar
    na aba Dados") e "Indicou: Marina (prêmio dado em 10/11)" — ou "prêmio
    estornado em …", "prêmio quando ela fizer o primeiro pagamento", "sem
    prêmio: ela já tinha pagado antes…" (`indicacoes_da_ficha`,
    `situacaoDoPremio` em `lib/fidelidade/indicacao.ts`). Com a fidelidade
    desligada, nada de prêmio (só os nomes). O extrato de pontos diz "Indicação
    de Marina" (`rotuloDoLancamento`) — uma vez: a descrição que repete o
    título não sai embaixo dele (A41 da 12ª, `descricaoDoLancamento`).
  - **No app, "Indique uma amiga" só com o prêmio ligado, e diz o prêmio**
    (`[data-indique-uma-amiga]` em Meus pontos, `textoDoIndiqueUmaAmiga`): "você
    ganha 300 pontos" ou "um voucher: …". **A cliente não cadastra a amiga pelo
    app** — só a rede cria ficha (CLAUDE.md §5): "É só ela dizer o seu nome
    à equipe…". **E também no Início do app** (A54 da 12ª, 2026-11-11: só
    estava em Meus pontos): o mesmo texto e o caminho para Meus pontos
    (`[data-indique-uma-amiga]` na home; só com o prêmio ligado e a
    recompensa ativa).
  - Prova: `e2e/fidelidade-indicacao.spec.ts`, `tests/fidelidade-indicacao.test.ts`.
- **O painel Fidelidade da ficha segue as props do servidor** (D16 da
  simulação de 2026-10-29): o saldo, o extrato e os vouchers copiados para o
  estado são trocados pelos novos quando o `router.refresh` (da venda, do
  pagamento) traz outra referência de `fidelidade`. O cartão "Pontos" dizia
  800 e o painel "Nenhum ponto ainda" até recarregar. Prova:
  `e2e/fidelidade-painel-atualiza.spec.ts`.
- **Trocar pontos por voucher na comanda** (A50 da 24ª, 2026-11-18): o
  receber o atendimento e a "Nova venda" do PDV oferecem "Trocar pontos por
  voucher" (`TrocarPontos`, `trocaNaComanda`), com a mesma troca da ficha
  (`resgatarRecompensa`); o voucher novo já vem escolhido. Só o que vale ali:
  o de desconto, e o de procedimento do procedimento do atendimento
  (`recompensasDaComanda`). Aparece quando o saldo alcança alguma. Troca quem
  tem a Fidelidade em Gerenciar; quem não tem lê "Trocar pontos por voucher é
  de quem tem a Fidelidade em Gerenciar: …" (`textoDeQuemTroca`). Prova:
  `tests/atritos-da-24-caixa.test.ts`.

---

## O que nunca fazer aqui

```
❌ Dar ponto de fidelidade no TypeScript (o ponto nasce no gatilho do pagamento; o saldo é saldo_de_pontos)
❌ Calcular vencimento de pontos fora de fidelidade_a_expirar (é a única cópia do FIFO)
❌ Mostrar qualquer sinal de pontos com o programa da rede desligado
❌ Recusar um número da configuração por ser grande (bônus, validade, aviso, pontos por real): acima do comum é aviso — princípio 2
❌ Pôr o desconto de pontos em amount (amount é o dinheiro recebido; o desconto é loyalty_discount)
❌ Confirmar pagamento de atendimento fora de confirmar_pagamento_do_atendimento, ou confiar no valor que o navegador manda
❌ Ler o voucher pela recompensa (o voucher tem o retrato de quando foi trocado) ou deixar o cliente trocar pontos sem client_redeem ligado
❌ Chamar expirar_pontos / fidelidade_bonus_aniversario / avisos_de_vencimento em teste sem p_tenant (vale para as redes reais)
❌ Dar o prêmio por indicação no TypeScript, ou sem o pagamento da indicada (é o gatilho do pagamento, private.indicacao_premiar — uma vez por indicada)
❌ Gravar "Indicada por" como texto livre na tela, ou com o id do navegador sem conferirIndicadaPor (a ficha é da rede e não é a própria)
❌ Deixar a cliente cadastrar a amiga pelo app (só a rede cria ficha — CLAUDE.md §5)
❌ Recortar o saldo de pontos ou os vouchers por unidade, ou trazer de volta uma opção "só na unidade" (o saldo é um só, da rede — FD3; tests/fidelidade-saldo-da-rede.test.ts trava)
```
