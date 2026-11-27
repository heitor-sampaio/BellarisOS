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
  `?unidade=`), corpo em `app/_shared/pdv.tsx`. No menu, em Comercial, para quem
  RECEBE (`podeReceber`: o PDV em Gerenciar, e só ele — PV-04 do catálogo de
  24/11; o Heitor, 23/11, "cada passo pertence a UM módulo … PDV: receber":
  "concordo". A baixa de um lançamento no Financeiro segue `podeDarBaixa`,
  CX2). À esquerda as
  comandas (Abertas / Fechadas hoje / Todas, busca pela cliente); à direita a
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
  espera a forma. Com o contrato do procedimento ASSINADO, receber com outro
  pagamento (ou outro desconto) pergunta antes e, confirmado, substitui o
  contrato na mesma transação do dinheiro (D1 da 33ª; DG-03 e VD-10 do
  catálogo; `documentos.md`, "O contrato do PROCEDIMENTO também cita o pagamento").
- **Só se vende pelo PDV** (PDV-P3: "O vender da ficha sai e o do inbox ele
  pode sair, ele pode levar pro PDV, tá? Porque só vende pelo PDV."). A
  "Nova venda" (`?nova=1`) escolhe a cliente (busca na rede inteira,
  `buscarClientesParaVender`) e mostra os MESMOS formulários do antigo
  "Vender" (`VendaNaTela`, `components/shared/vender.tsx`): procedimento
  pré-pago, pacote, produto e crédito interno, com desconto, "Quem vendeu" e
  pagamento. A unidade da venda é a do PDV: o catálogo, o estoque, "Quem
  vendeu" e o caixa são os dela; no PDV da rede sem unidade na URL (e com
  mais de uma), a "Nova venda" pergunta antes "Em qual unidade é a venda?"
  (`[data-unidade-da-venda]`, `nova-venda.tsx`; `unidadeEscolhida` em
  `app/admin/pdv/page.tsx`). A ficha não tem o "Vender"; o "Vender" do inbox
  e o da busca universal levam a `/<portal>/pdv?nova=1&cliente=<id>` (no inbox, a pessoa sem ficha passa
  pelo cadastro e chega lá).
  **A unidade desativada não vende** (D4 da 30ª; plataforma:UN-14, "de
  vender: só as ativas"): o PDV dela segue aberto para receber o que ficou
  (UN-13), sem o botão "Nova venda" e com o vazio dizendo por quê
  (`[data-unidade-nao-vende]`); o "Em qual unidade é a venda?" lista só as
  ativas; e as quatro actions de venda (pacote, pré-pago, produto, crédito
  interno) recusam a desativada — "Esta unidade foi desativada e não vende
  mais…" (`recusaDaVendaNaUnidade`, `lib/vendas/unidade-da-venda.ts`). Prova:
  `tests/pdv-unidade-desativada-nao-vende.test.ts`,
  `e2e/unidade-desativada-f72.spec.ts` ("D4 da 30ª").
  ⚠️ Onde este arquivo ainda diz o "Vender" (da ficha, do inbox), leia a
  "Nova venda" do PDV: o formulário e as regras são os mesmos.
- **Toda venda é uma comanda** (PDV2): o gatilho `comanda_da_venda`, no
  primeiro lançamento de receita da venda (pacote, pré-pago, produto, crédito
  vendido), cria a comanda `VENDA` ligada a ela (uma coluna por tipo, única) —
  vale em todo caminho que vende (tela, action, Copilot). As parcelas
  seguintes não fazem outra. O pacote trazido de fora não é venda: não tem
  comanda. A venda nasce paga (vendida com a forma escolhida): aparece em
  "Fechadas hoje" pela hora da venda; a estornada inteira diz "Estornada".
  **O que ficou em aberto se diz** (A1/A17 da 15ª simulação, princípio 3):
  a venda no crediário ou no a receber nasce paga, mas a linha e a comanda
  dizem "Crediário · R$ 1.800,00 em aberto (3 parcelas, a 1ª em 15/12)", e o
  selo é "A receber", nunca "Paga" — nem o cabeçalho da comanda, que diz
  "Fechada às 09:29 · A receber · R$ 0,00 recebidos" enquanto houver dinheiro
  em aberto (A9 da 30ª; `verboDaComandaPaga`, `lib/pdv/situacoes.ts`; a venda
  segue "Vendida às"). **A linha do lançamento diz qual parcela é** (A16 da
  30ª; CR-05, AC-01): com o procedimento, "Microagulhamento — parcela 2/3"
  ou "— entrada" (`nomeDaLinhaDoLancamento`,
  `lib/financeiro/nome-da-parcela.ts`; a aba Financeiro da ficha, pela
  `lib/clientes/financeiro-da-ficha.ts`). O número sai do banco (`pdv_comandas`:
  `em_aberto`, `parcelas_em_aberto`, `proxima_parcela`, migration
  `20261116500001`), não da tela. **A comanda do crediário diz como entrou o
  que já entrou** (A15 da 26ª, princípio 3): "Crediário (Crédito 3x · Cielo)
  · R$ 1.000,00 recebidos" — as formas do que entrou (`pdv_comandas.formas`,
  agora também na venda do crediário) e, no cartão, a maquininha quando a
  rede tem mais de uma (A18 da 14ª; migration `20261130100003`). A linha da comanda do atendimento diz o
  produto que ela leva ("Limpeza de pele + 1 produto", A3). A comanda paga
  diz, a quem não tem o Financeiro em Gerenciar, de quem é o estorno — a
  mesma frase da ficha, com os nomes (A2). Prova: `e2e/pdv-atritos-da-15.spec.ts`.
  **A comanda do crediário recebe a parcela ali mesmo** (A1 da 16ª,
  princípio 7): a comanda paga com o em aberto traz "Parcelas desta venda",
  o mesmo `ParcelasEmAberto` da Nova venda, só com as parcelas DESTA venda
  (`parcelasEmAbertoDaCliente({ daVenda })`, pelas chaves da comanda), a
  quem pode receber (`podeReceber`). O PDV vazio diz "Ela nasce quando um
  atendimento é iniciado e tem o que cobrar" (A6), e a aba da Nova venda que
  vende o pré-pago se chama "Procedimento pré-pago" (A7: o avulso se cobra na
  comanda do atendimento). Prova: `e2e/pdv-atritos-da-16.spec.ts` ("A1").
  **A comanda paga diz o que foi pago** (17ª simulação, princípio 3; a
  conta é do banco, `pdv_comandas`, migration `20261117610001`):
  - as formas TODAS, cada uma com o valor ("Dinheiro R$ 180,00 + Pix
    R$ 120,00": o atendimento e o produto vendido nela, D3 —
    `formasDaComandaEmTexto`);
  - o desconto, o voucher e os pontos em linhas acima do "Total pago" (A1,
    `descontosDaComanda`); a lista "Fechadas hoje" mostra o cobrado da
    comanda do atendimento, não o preço (`valorNaLista`; com o em aberto do
    crediário, D6 da 27ª);
  - a quem estorna (`podeEstornar`), os pagamentos da comanda, cada um com o
    "Estornar" da ficha (`AcoesDoLancamentoDaFicha`, a janela de sempre;
    `lancamentosDaComanda`) — A2;
  - reaberta pelo estorno, o estorno de antes: "Estornada às 21:20 —
    R$ 250,00, Pix, com R$ 30,00 de desconto. Ao receber de novo, o desconto
    se escolhe de novo." (`estorno_anterior`, `estornoAnteriorEmTexto`, A2);
  - "Parcelas desta venda" uma por linha, com o "Receber" ao lado
    (`ParcelasEmAberto compacta`, A4).
  A Entrada do crediário ganha a máscara de dinheiro ao sair do campo
  ("100" → "100,00", A5). "Quem vendeu" e a trava da venda
  (`recusaDoMembroDaVenda`) leem as unidades do membro — a principal E as
  outras (`filtroDosMembrosDaUnidade`, `membroAlcancaAUnidade` em
  `lib/unidades/do-membro.ts`; D1): quem lê "os membros da unidade" em
  `users` usa esse filtro, nunca `branch_id.eq` sozinho. Prova:
  `e2e/pdv-atritos-da-17.spec.ts`, `tests/pdv-caixa-da-17.test.ts`.
- **A comanda do plano nasce no ACEITE** (PDV4 e PT1a–PT1c; o Heitor: "a
  partir do momento que a cliente aceita o plano, ela precisa daí pagar e
  agendar as sessões"; sobre perguntar a forma no aceite: "pode ser
  intimidador e levar a desistencia"; e "primeiro colhe assinatura, depois
  paga"):
  - **Aceitar é só "quero fazer"** (`aceitarPlano` → `plano_aceitar`): o plano
    vira ACCEPTED (os termos e os outros documentos já nasceram na CRIAÇÃO do
    plano — DC4, "o do pacote e o do plano, na venda/na criação"; o contrato
    de plano não: ele nasce no PDV, com a forma) e a comanda
    `PLANO` nasce no PDV com o valor do plano — o desconto combinado no editor
    já aplicado aos preços, na mesma transação (22ª A20, abaixo em "Desconto
    em todas as vendas"). Nenhum dinheiro, nenhum agendamento, nenhuma pergunta
    de forma. Aceita quem monta o plano — o Atendimento em Gerenciar, com a
    unidade do plano ao alcance, ou a Admin da rede (`montaPlano`; UM3,
    2026-11-23, revê a PT2 de 14/11, que era "quem ATENDE na unidade dele") —
    ou quem recebe (`podeReceber`). Na página do plano o botão é o do passo ① ("Aceite", PT1a);
    na tela do atendimento, "Aceitar plano"; "a cliente vai pensar" deixa o
    plano proposto (PROPOSED), para aceitar depois. Na página do plano, o
    passo ③ ("Contrato e pagamento") leva à comanda do plano no PDV
    ("Receber no PDV", `?unidade=…&comanda=…`).
  - **A cliente aceita PELO APP** (PT1b, Bloco Plano de tratamento, leva 2,
    2026-11-14 — o Heitor: "A cliente recebe o plano no app, analisa e
    aceita."): a página do plano no app (`/[slug]/cliente/planos/[id]`) tem
    "Aceitar o plano" (`aceitarPlanoPelaCliente`, `actions/plano-da-cliente.ts`)
    — o MESMO `plano_aceitar`, sem pergunta de dinheiro. Só o plano DELA
    (`ctx.clientId`, a ficha da rede do endereço), só o PROPOSTO — **vencido,
    o app avisa e aceita** (decisão do Claude pelo princípio 2, auditoria das
    regras, 2026-11-18: a validade da proposta é "só informação", como diz o
    bloco do plano aprovado, e o checkout na unidade já não recusava; o app
    recusava): "Proposta vencida em …: os valores podem ter mudado. Na dúvida,
    fale com <a rede> antes de aceitar." (o nome dela, CA1; `avisoDaPropostaVencida`,
    `[data-proposta-vencida]`, prova: `e2e/vendas-auditoria-c-dinheiro.spec.ts`),
    com o "Aceitar o plano" —, não a arquivada, não na sessão de
    suporte (`bloqueioDoSuporte`). **A equipe é avisada** (sino e push,
    `user_notifications` tipo `plano_aceito`) pela PERMISSÃO: quem tem Agenda,
    Caixa ou Financeiro em Gerenciar na unidade do plano ou na rede inteira
    (`interessadosNoFato`), e quem atende o plano. O evento `plano.aceito` sai
    com o ator `cliente`. Prova: `e2e/plano-tratamento-leva-2.spec.ts`.
  - **A sessão do plano não cobra nada** (PT1e): o dinheiro do plano é o da
    comanda dele; a parcela vencida do crediário aparece no PDV da cliente.
  - **O dinheiro é no PDV**: a comanda do plano tem "Receber o plano", o mesmo
    assistente do antigo checkout (`CheckoutWizard`, `podeAgendar={false}`) —
    desconto, "Quem vendeu", à vista ou crediário, o contrato e então o
    recebimento. Sem "Receber no atendimento" (não existe pagamento sem forma,
    PDV8) e sem agendar sessões ali: as sessões se agendam pelo plano/agenda.
  - **Só o contrato do plano trava o dinheiro** (`plano_checkout`: falta
    assinar um `CONTRATO_PLANO` → recusa). Os outros termos não travam mais o
    aceite (`documentos_bloqueiam_plano` só os emite).
  - **O contrato e o pagamento andam juntos, no PDV** (PT1c, leva 2): no
    "Receber o plano", escolhe-se a forma (o desconto e "Quem vendeu"
    junto) → o contrato de plano NASCE com ela (`prepararDocumentosDoCheckout`
    → `documentos_emitir_do_plano(plano)`, que emite também o contrato; o
    aceite chama `(plano, false)`) e a cliente assina → recebe-se. Sem o
    contrato assinado ou dispensado com motivo, o PDV não recebe
    (`recusaDosDocumentosDoPlano` na action — que emite antes de conferir, e
    quem chama direto não escapa — e `plano_checkout` no banco).
  - **Os pontos e o voucher na comanda do plano** (FD2a/FD2b, leva 2): o
    bloco "Fidelidade" do receber (`useFidelidadeNaVenda`, o das outras
    vendas), no à vista, sobre o plano depois do desconto. A action confere
    (`fidelidadeDaVenda`) e `plano_checkout_com_fidelidade` (só service_role)
    lança o à vista em aberto, fecha o plano e passa por
    `private.fidelidade_na_venda`, que abate, marca pago e tira os pontos. O
    ponto nasce do que foi PAGO (o gatilho de sempre). O contrato cita o
    valor do plano: os pontos são um meio de pagar (decisão pelos princípios,
    DEVLOG).
  - O plano aceito se recebe UMA vez ("Este plano já foi recebido"); o
    proposto não se recebe ("Aceite o plano antes de receber"). O plano
    cancelado (ou recusado) leva a comanda que não foi paga.
  - A comanda do plano está "Paga" quando o receber lançou o dinheiro (à
    vista ou no crediário, como a venda), na hora do primeiro lançamento.
  - **O plano é venda quando é PAGO** (`metrics_vendas`; o Heitor, 18/11:
    "Obviamente que no recebimento. Uma coisa só foi vendida se foi paga."):
    a data da venda do plano é a do primeiro recebimento PAGO dele (o
    lançamento de receita do plano pago, que não é estorno nem estornado, no
    dia do pagamento), não a do aceite — o aceito que nunca se pagou não
    vendeu nada. Até a 25ª simulação contava o primeiro lançamento, pago ou
    não: no crediário, a parcela em aberto já fazia a venda (a leitura do
    pago, a mesma do "Comprou" do CRM, é do Claude — migration
    `20261124900002`). Plano antigo aceito sem recebimento pago sai do
    relatório.
  - A rota antiga `/checkout/<plano>` leva aonde a coisa mora: proposto → o
    plano; aceito → a comanda dele no PDV.
- **O Fechamento do dia mora no PDV** (CX4, fase 4, 2026-11-14): "Fechar o
  dia", no topo do PDV, abre `/<portal>/pdv?fechar=1` (com `dia=` e, na rede,
  `unidade=`), com o cabeçalho do PDV e "Voltar às comandas". A trava da
  página é `podeVerFechamento` com `?fechar=1` e `podeReceber` sem ele.
  `/[slug]/fechamento` e `/admin/fechamento` são redirect de uma linha (levam
  o dia e a unidade), e o item "Fechamento do dia" do menu aponta para
  `/pdv?fechar=1`. As regras do fechamento estão em §9.6, "Fechamento do dia".
- **Os textos da fila do antigo checkout** (fase 4): "Planos propostos" / "a
  cliente vai pensar", com o link à página do plano
  (`/<portal>/planejamentos/<id>`). As rotas não mudaram.
- **Não existe pagamento sem forma; o crediário é uma forma** (PDV8, fase 5a,
  2026-11-14 — o Heitor, 13/11: "sempre tem que ter forma de pagamento, o
  crediario é uma forma de pagamento, não existe pagamento sem forma de
  pagamento"). Toda tela que vende ou recebe mostra as formas em blocos
  (`FormasDePagamento`): Pix, Dinheiro, Débito, Crédito, Crédito interno, e
  ao lado o **Crediário** e o **A receber** onde cabem. O bloco de um meio é o
  à vista nele (sai o "À vista" × "Entrada + parcelas" × "A receber" e o
  seletor de meio). No Crediário, a ENTRADA, se houver, pede a forma dela
  ("Forma da entrada *"); sem entrada, nada entra agora — a venda é
  registrada no Crediário e as parcelas nascem sem meio (D6). O "A receber"
  não tem meio nenhum (o servidor recusa um: `EntradaDoPagamento`). A forma
  se escolhe quando o dinheiro ENTRA: a parcela no PDV (abaixo) ou a baixa no
  Financeiro (§9.6). Na comanda da venda e do plano, a forma é `CREDIARIO`
  quando há parcelas do crediário e `A_RECEBER` quando não há meio e há algo
  em aberto (`pdv_comandas`, migration `20261114600101`); no contrato,
  "no crediário" / "no crediário, com a entrada no Pix" / "a receber" — o
  `pagamento.metodo` nunca fica vazio. Prova:
  `e2e/pdv-crediario-e-parcela.spec.ts`.
- **A parcela se recebe no PDV** (CX1, fase 5a): escolhida a cliente na "Nova
  venda", o PDV mostra o que ela tem em aberto NESTA unidade, sem agendamento
  (`parcelasEmAbertoDaCliente`, `lib/pdv/parcelas-da-cliente.ts`: "Parcela 2
  de 3 do crediário: R$ …", o vencimento — a vencida em destaque — e o
  "A receber: R$ …" de uma venda a receber). "Receber esta parcela" abre a
  janela com as formas (sem o Crediário), a bandeira, a maquininha e as vezes
  do crédito; sem forma, o botão espera. A action é `receberParcelaNoPdv`
  (`actions/pdv.ts`): `podeReceber`, a forma conferida (`''` → "Escolha a
  forma de pagamento."; Crediário/A receber recusados), o id pela rede e pelo
  alcance (`lancamentoAoAlcance`) e só receita; a baixa é a de sempre,
  `marcarPagoCore` (uma gravação com a guarda de não pago e não estornado).
- **O clique duplo no "Receber" diz "recebido" nas duas respostas** (o
  Heitor, 25/11, escolheu "As duas respostas dizem 'recebido'": a segunda
  dizia "Esse lançamento já está pago", e quem clicou achava que tinha
  falhado). O MESMO envio — o clique duplo, a chave `useEnvioUnico` da tela —
  grava uma vez, e as duas respostas são a do recebimento (`umaVez`,
  `lib/envio-unico.ts`; `convencoes.md`). Vale para todo "Receber" do PDV: a
  comanda do atendimento (`confirmPayment`, `_envio` no formulário), a parcela
  e o a receber (`receberParcelaNoPdv`, a chave no último argumento; a
  resposta diz `recebido`, o valor) e o plano (`checkoutTreatmentPlan`, a
  chave no último argumento; só o que recebeu se guarda — a pergunta "Quem
  vendeu?" solta a chave). DOIS envios (duas abas) não mudam: um recebe, o
  outro ouve que já está pago (a guarda da baixa, o "já pago" de
  `confirmar_pagamento_do_atendimento`, a trava de `plano_checkout`). Prova:
  `tests/pdv-envio-unico.test.ts`, `e2e/plano-recebimento-concorrente.spec.ts`
  ("o mesmo envio duas vezes"), `e2e/plano-checkout-uma-transacao.spec.ts`,
  `e2e/pdv-varias-formas-e-crediario-avulso.spec.ts` ("duplo clique").
- **O produto na comanda do atendimento** (PDV2, fase 5b, 2026-11-14 — o
  desenho: "na saída ela levou um sérum, que se acrescenta na mesma
  comanda"). Na comanda do atendimento ainda não paga, "Acrescentar produto"
  oferece o que é de Venda direta (`products.uso` REVENDA/AMBOS) com a
  quantidade; cada um vira uma linha de `comanda_itens` (sem
  `product_sale_id` enquanto pendente), com "Tirar" até receber. A action é
  `acrescentarProdutoNaComanda` / `tirarProdutoDaComanda` (`actions/pdv.ts`):
  `podeReceber`, os ids, a comanda pela rede e pelo alcance
  (`alcancaUnidade`), e a gravação pelas funções `comanda_acrescentar_item` /
  `comanda_tirar_item` (só o servidor; recusam comanda paga ou que não é de
  atendimento, produto que não é de Venda direta e estoque que não basta).
  - **A quantidade é a que quem recebe escolhe** (o Heitor, 25/11: "Se não for
    impossível, ainda que improvável, pode ser feito."; era de 1 a 100 de
    cada, somando o que já estava na comanda, e até 20 produtos): acima de 100
    de um produto e de 20 produtos a tela avisa e grava; só o impossível
    (zero, fracionário, acima de 2.147.483.647, o estoque que não cobre) se
    recusa — a mesma regra da venda (§9.3.3, `lib/vendas/quantidades.ts`).
  - O produto vale o **preço de venda de agora** (o mesmo que
    `produto_vender_itens` usa), entra no total da comanda e na conta dos
    pontos e do voucher. O estoque NÃO se reserva ao acrescentar; confere-se
    de novo ao receber.
  - **Ao receber** (`confirmar_pagamento_do_atendimento`), os itens pendentes
    se vendem por `produto_vender_itens` (os lotes, o FEFO, a baixa do
    estoque — nada duplicado), na MESMA forma do atendimento, com quem a tela
    escolheu em **"Quem vendeu os produtos"** como quem vendeu (o Heitor,
    com-06: "às vezes quem vai registrar a venda é recepção e quem vendeu foi a
    profissional (...) Se o campo ficar vazio, aviso e confirmação. Campo vazio
    não gera comissão para ninguém"; r2-ven-12: "nasce sempre vazio" —
    auditoria das regras, 2026-11-18; era o profissional do atendimento, sem
    ninguém escolher). O campo aparece no "Receber" da comanda com produto a
    vender (`equipeDosProdutos`), nasce VAZIO, e vazio a tela pergunta
    (`PerguntaDaVenda`, "Receber assim"); a action confere (`quemVendeu`) e o
    banco grava `p_dados.vendedor_dos_produtos` (migration
    `20261124000001`); confirmado vazio, ninguém vendeu. O lançamento do produto
    nasce em aberto e vira pago junto, para o ganho de pontos pegar o valor
    pago. A venda não abre comanda própria (`bellaris.venda_na_comanda`
    segura o gatilho `comanda_da_venda`): ela é da comanda do atendimento.
  - Os descontos (desconto comercial, voucher, pontos — nesta ordem, a de
    todo lugar: o Heitor, 2026-11-18, "Desconto, voucher, pontos") se repartem
    entre o atendimento e os produtos na proporção do valor
    (`private.parte_dos_itens`); o voucher de PROCEDIMENTO fica inteiro no
    atendimento.
  - O estorno e o cancelamento do produto são os da venda de produto (o
    estoque volta pelos lotes, os pontos do lançamento saem).
  - Com produto pendente, o atendimento não se abate de pacote (a comanda
    tem dinheiro a receber).
  - `pdv_comandas` do atendimento: valor = preço do atendimento + produtos
    (pendentes ao preço de agora; vendidos pelo `preco_tabela` da venda);
    recebido = o lançamento do atendimento + os dos produtos.
  - **A comanda REABERTA cobra só o que falta** (D1 da 16ª simulação): o
    estorno só do atendimento reabre a comanda, e o produto já vendido nela
    continua pago. Aberta, o valor é o atendimento + os produtos AINDA não
    vendidos (o mesmo `valorDosItensDoAtendimento` que o recebimento cobra),
    e o vendido vai em `ja_pago` (`pdv_comandas`, migration
    `20261116600001`): a tela diz "Já pago (os produtos)" e "Falta receber",
    o item diz "já pago, fora do que falta receber", e o "Receber" é só o
    que falta. Paga, o valor volta a ser o da comanda inteira.
  - **O produto ESTORNADO sai do "pago"** (D2 da 18ª, princípio 3): a venda
    de produto estornada (`product_sales.estornada_em`) não entra em
    `ja_pago` nem no vendido da comanda (`pdv_comandas`, migration
    `20261118300001`); o item diz "estornado · voltou ao estoque" (ou "não
    voltou ao estoque", pelo `produto_voltou`; `situacaoDoItemDaComanda`),
    e a comanda reaberta diz "Produto estornado às HH:MM — Nome × 1, voltou
    ao estoque. Fica fora do que falta receber." (`[data-produto-estornado]`,
    `produtosEstornadosEmTexto`).
  - **Pago junto** (A1 da 18ª): a comanda paga mostra os pagamentos a quem
    a abre quando há mais de um (o atendimento e o produto), cada um com o
    que pagou ("Atendimento · Pix · R$ 250,00", `rotuloDoPagamentoDaComanda`),
    e, na mesma forma, "Pago junto: atendimento R$ X + produtos R$ Y (Pix).
    Cada parte se estorna sozinha." (`[data-pago-junto]`,
    `pagoJuntoEmTexto`). O "Estornar" de cada um só a quem estorna
    (`podeEstornar`); a quem não, "Estornar o atendimento ou o produto
    desta comanda é de quem tem o Financeiro em Gerenciar".
  - Prova: `e2e/pdv-comanda-varios-itens-e-pontos.spec.ts`,
    `tests/pdv-caixa-da-18.test.ts`.
- **O motivo ao lado do botão desligado** (A5 da 18ª, princípios 3 e 7): o
  "Vender" (e o seguir do pacote) desligado pela regra do pagamento diz o
  porquê ao lado (`MotivoDoBotao`, `[data-motivo-do-botao]`) — "Escolha a
  forma da entrada", por exemplo, no crediário. A recusa que já aparece junto
  do campo não se repete (`recusaForaDoCampo`). Prova:
  `tests/pdv-caixa-da-18.test.ts`.
- **O contrato do pacote avisa ANTES de vender** (A6 da 18ª, princípio 3):
  escolhida a cliente na "Nova venda", se o contrato de pacote ATIVO da rede
  (DC1) pede do cadastro o que a ficha não tem, o pacote diz "O contrato
  deste pacote (X) pede Endereço (rua, número e bairro), que falta no
  cadastro…", com "Completar o cadastro" a quem tem Clientes em Gerenciar
  (`faltaParaOContratoDoPacote`, `lib/documentos/falta-no-cadastro.ts` — a
  mesma régua do "Agendar", `faltandoDoCadastro`;
  `[data-contrato-pede-cadastro]`). Só avisa: a venda segue (princípio 2).
  Os termos dos procedimentos do pacote não entram aqui (nascem ao agendar,
  e o "Agendar" já avisa).
- **A venda estornada e recebida de novo** (19ª simulação, princípio 3;
  `pdv_comandas`, migration `20261119100001`):
  - **Vale o vendido UMA vez** (D1): o estorno da venda viva reabre o valor
    num lançamento novo (`estornar_e_reabrir`), e a comanda somava o
    estornado e o reaberto (o pacote de R$ 1.000 dizia R$ 2.000,00). O
    estornado que ganhou o reaberto — o mesmo `created_at` do estorno, a
    mesma venda e parcela — fica fora do valor e da forma; o estornado sem
    reaberto (a venda cancelada) segue no valor, e a comanda diz "Estornada".
  - **A comanda da venda e do plano diz o estorno** (`estorno_anterior`,
    `estornoDaVendaEmTexto`, `[data-estorno-da-venda]`): a receber de novo,
    "Estornada às 09:27 — R$ 1.000,00, Débito: o valor voltou a receber.";
    recebida de novo, "Recebida de novo depois do estorno das 09:27
    (R$ 1.000,00, Débito)." A do atendimento segue a regra da 17ª (só a
    receber, e paga de novo o estorno sai).
  - **A forma com a bandeira** (A1): as `formas` levam a bandeira ("Crédito
    Mastercard 10x"), e a venda paga à vista também as tem (a forma de
    agora, não a do estornado; no crediário e no a receber, a da venda). Os
    pagamentos da comanda também (`lancamentosDaComanda`).
  - **Depois de "Receber", a tela diz o que entrou** (A2): "Recebido
    R$ 2.060,00 (Crédito Mastercard 10x). A comanda saiu das abertas e está
    em “Fechadas hoje”." com "Ver a comanda" (`?recebida=`,
    `recebidaAgoraEmTexto`, `[data-recebida-agora]`; a comanda da URL que já
    saiu das Abertas também, porque o tempo real a tira antes).
  - O PDV sem comanda escolhida diz "Escolha uma comanda na lista" (A4: no
    celular a lista fica em cima); o telefone da cliente na Nova venda vai
    com a máscara (A5).
  - **O voucher depois do estorno só do produto** (A7): a comanda paga diz
    "O voucher “X” segue usado na parte do atendimento (R$ 28,71). A parte
    dele no produto estornado saiu com o estorno."
    (`voucherDoProdutoEstornadoEmTexto`, `[data-voucher-do-produto-estornado]`).
  - **O estorno do pacote diz as sessões feitas** (A6): a janela antes de
    estornar diz "1 das 5 sessões já foi feita, e o pacote segue com as 4 que
    restam." (`textoDaReaberturaDoPacote`, `lib/financeiro/reabertura-do-estorno.ts`).
  - Prova: `e2e/pdv-atritos-da-19.spec.ts`, `tests/atritos-da-19-caixa.test.ts`.
- **O PDV e o caixa da 20ª simulação** (2026-11-17; princípios 3 e 4):
  - O selo da comanda diz a origem (D4): a do plano é "Plano aceito, a
    pagar"; a da Nova venda, "A receber"; "Atendida, a pagar" é só a do
    atendimento (`seloDaComanda`).
  - O crediário diz quantos pagamentos dá (A1): com entrada, "3x + entrada
    (4 pagamentos)" — PDV, checkout do plano e tela do atendimento
    (`rotuloDaOpcaoDeParcelas`).
  - A venda estornada diz "Para cobrar de novo, faça uma Nova venda."
    (A2, `vendaEstornadaEmTexto`).
  - Receber uma parcela com outra ANTERIOR da mesma venda em aberto avisa
    "Adiantada: a 1/2 (vence …) segue em aberto." — só avisa, recebe
    (A5, `anterioresEmAbertoEmTexto`, `[data-parcela-adiantada]`).
  - No fechamento, o dinheiro registrado negativo avisa que a gaveta não fica
    negativa e pede conferir a saída ou o fundo de troco (A4,
    `avisoDaGavetaNegativa`, `[data-gaveta-negativa]`); o botão diz "Fechar
    de novo" quando reabre (A6, `rotuloDoBotaoDeFechar`).
  - O estorno de um recebimento diz, antes de confirmar, a comissão que
    volta a aguardar (com nome e valor a quem vê a comissão de todos; sem
    valor aos outros) e que a taxa da maquininha daquele pagamento sai da
    conta (A7, `comissaoETaxaDoEstorno`, `textoDaComissaoETaxaDoEstorno`,
    `[data-comissao-e-taxa-do-estorno]`). Sem o valor da taxa: não se chuta.
  - Prova: `tests/atritos-da-20-vendas.test.ts`.
- **O PDV e o caixa da 21ª simulação** (2026-11-17; princípios 3 e 4):
  - A linha da comanda diz a quantidade e o preço de cada um (D3,
    `linhaDaComanda`, `lib/pdv/linha-da-comanda.ts`): "2 × R$ 150,00" (e o
    desconto); o plano diz as sessões ("3 sessões: 2 × Limpeza, 1 ×
    Peeling", A5). Kit de vários itens e atendimento seguem "1".
  - O topo do PDV diz "Hoje em <unidade>" e conta as comandas com valor a
    receber — as abertas mais as pagas hoje com parcela em aberto (A2/A10,
    `rotuloDoDiaNoPdv`, `contarComValorEmAberto`).
  - A parcela adiantada avisa também no "Receber" da ficha e do financeiro
    (A3, a mesma `anterioresEmAbertoEmTexto`).
  - A gaveta negativa diz "Saiu R$ X a mais do que entrou em dinheiro:
    confira a saída em dinheiro, ou informe o fundo de troco." (A4).
  - O CSV das movimentações tem a coluna "Pago com pontos/voucher"
    (`loyalty_discount`), depois do Desconto (A6): não é desconto.
  - Prova: `tests/atritos-da-21-caixa.test.ts`.
- **O PDV e o caixa da 22ª simulação** (2026-11-17; princípios 3 e 7):
  - A aba é "Fechadas hoje" (A8): a comanda no crediário fecha sem ter sido
    paga, e "Pagas" mentia. O texto do "Receber" acompanha.
  - O "+ Outra forma" aparece já com o diálogo aberto, antes de escolher a
    forma (A7), na comanda, na parcela e no "Receber" da ficha.
  - O produto pendente da comanda tem "−" e "+" (A13): `comanda_tirar_um_item`
    tira UMA unidade (a linha some na última), com as travas do
    `comanda_tirar_item`; o "+" é o `comanda_acrescentar_item` (estoque).
  - Quem alcança mais de uma unidade vê, nas Abertas, "N comandas abertas em
    <unidade>" com o link (A15, `abertasNasOutrasEmTexto`).
  - A comanda da venda estornada INTEIRA mantém o "Pago com" (A11: o `vp` de
    `pdv_comandas` lê os lançamentos 'Estornada' quando `v_estornada`).
  - A linha do pagamento quebra em vez de cortar com "…" (A14).
  - O lançamento da venda de pré-pago diz "Massagem relaxante — 1 sessão"
    (A31, `procedimento_vender` e `_com_equipe`).
  - O "Fechar de novo" do fechamento não mostra "Não conferido" no que ainda
    se vai conferir (A12, `diferencaNaTela`).
  - O CSV da contadora diz "Maquininha ou forma" (A16): o dinheiro e o Pix
    não têm maquininha.
  - O cartão do Financeiro é "A receber da cliente · em aberto" (A9, e a A17
    da 23ª, `ROTULO_DO_A_RECEBER_DA_CLIENTE`): o número grande é o em aberto
    (todos os vencimentos), e o que vence no período vai na nota ("Vence no
    período: R$ …").
  - Prova: `tests/atritos-da-22-caixa.test.ts`; migration
    `20261122600001_pdv_atritos_da_22`.
- **O PDV e o caixa da 23ª simulação** (2026-11-17; princípios 3 e 7;
  prova: `tests/atritos-da-23-financeiro.test.ts`):
  - O topo das Abertas diz "N vendas com parcelas a receber", com o link para
    elas (A12, `textoDasComValorEmAberto`).
  - Nenhuma comanda aberta aqui e alguma na outra unidade: o vazio diz
    "Nenhuma comanda aberta em <unidade>." e põe o link da outra dentro dele
    (A11, `vazioDasAbertas`).
  - A coluna da comanda acompanha o que sai no "Receber" — o voucher, o
    desconto, os pontos — e o total é o que se vai receber (A10,
    `oQueSaiNoReceber`).
  - O estorno de uma forma da venda de produto mostra a venda inteira: "A
    venda inteira: R$ 300,00 (Pix R$ 200,00 e Dinheiro R$ 100,00)." (A13,
    `vendaDoEstorno`, `vendaDoEstornoEmTexto`).
  - A parcela recebida em parte diz o pago e o que falta: "1/3 · R$ 150,00 ·
    pago R$ 50,00, falta R$ 100,00" (A14, `valorDaParcelaEmTexto`; o pago vem
    das partes da mesma parcela, `pagoDasParcelas`).
  - Sem estoque suficiente, a venda de produto diz "Só há N un de X nesta
    unidade." com o "Dar entrada no Estoque", e o "Vender" desliga (A15,
    `faltaDeEstoqueNaVenda`). **O link é só de quem tem o Estoque em
    Gerenciar; o aviso da falta, de todos** (o Heitor, 26/11, página de
    perguntas, R04: "O link só para quem tem o Estoque em Gerenciar; o aviso
    da falta para todos (a proposta)"; `podeDarEntradaNoEstoque`).
  - **Sem estoque, nenhum caminho vende produto** (o Heitor, 26/11, R04: "e
    tb não deixa realizar a venda de produto sem estoque"): a Nova venda
    (`produto_vender_itens`, direto ou por `venda_com_fidelidade`) e a comanda
    do atendimento (`comanda_acrescentar_item` ao acrescentar, e
    `confirmar_pagamento_do_atendimento` → `produto_vender_itens` ao receber)
    recusam no servidor. Na comanda, o "Acrescentar" e o "+" desligam no que
    há (somado o que já está nela), e o produto que passou do saldo depois (o
    saldo caiu) diz a falta e desliga o "Receber", cada um com o motivo
    (`faltaAoAcrescentarNaComanda`, `faltaDosProdutosDaComanda`; decisão do
    Claude, 26/11, pela regra do botão desligado com o motivo). O Copilot não
    vende. Prova: `tests/vendas-produto-sem-estoque.test.ts`,
    `e2e/vendas-produto.spec.ts`, `e2e/pdv-comanda-varios-itens-e-pontos.spec.ts`.
  - O cartão do Financeiro volta a "A receber da cliente · em aberto" (A17):
    o número grande é o em aberto, e a nota diz "Vence no período: R$ …"
    (`noTopoOEmAberto`). Era o A9 da 22ª.
  - **O cartão se chama "A receber · em aberto"** (o Heitor, 25/11: "O
    cartão vira 'A receber · em aberto' e soma tudo"): o número segue somando
    todo o em aberto, inclusive o que não é de cliente nenhuma (a sublocação
    de uma sala), e o nome dizia "da cliente". A nota "Inclui sem cliente:
    R$ …" fica: diz o que o número leva dentro (princípio 3; decisão do
    Claude, 25/11). `ROTULO_DO_A_RECEBER_DA_CLIENTE` (`lib/financeiro/abas.ts`),
    nos dois Financeiros.
  - A dica do cartão cujo número é o em aberto (o "A receber · em aberto" e o
    "A receber da operadora") diz isso: "O valor é o em aberto, de qualquer
    vencimento." — dizia "o que vence no período", que é o da nota (D7 da
    34ª; `DicaDoVencimento` com `noTopoOEmAberto`). O "A pagar · vence no
    período" segue pelo vencimento. Prova: `tests/dica-do-a-receber-em-aberto.test.ts`.
- **O PDV e o caixa da 24ª simulação** (2026-11-18; princípios 2, 3 e 7;
  prova: `tests/atritos-da-24-caixa.test.ts`):
  - O "N vendas com parcelas a receber" abre SÓ essas vendas: Fechadas hoje
    com `?so=a-receber` (A14, `hrefDasComValorEmAberto`, `comandasDoFiltro`),
    e a tela diz o filtro e o "Ver todas as fechadas hoje".
  - A venda com desconto mostra o item CHEIO e uma linha "Desconto −R$ …"
    (A15; produto, pré-pago e pacote — `desconto` em `linhaDaComanda`). O
    detalhe da linha fica só com o unitário ("2 × R$ 98,00"): o "(… de
    desconto)" saiu dele.
  - A comanda da venda de pacote com contrato a assinar leva a ele: "Colher a
    assinatura" (A16, `documentosParaColher`); logo depois da venda o
    "Colher a assinatura agora" é botão.
  - Com "+ Outra forma", a 1ª forma tem a caixa dela, com o valor (o que falta
    das outras) no lugar do campo (A17).
  - Sem estoque, o resumo do produto não diz "sai do estoque agora", e o
    motivo do "Vender" desligado é "Falta estoque nesta unidade." (A18,
    `fimDoResumoDoProduto`, `motivoDaFaltaNoBotao`). A parcela em aberto não
    corta o texto (A19).
  - O checkout do plano: o botão final diz o que entra ("Receber R$ …" ou
    "Fechar a comanda", `rotuloDoReceberOPlano`); "O que se recebe agora" diz
    a forma; o aviso do plano fechado diz o nome da cliente (A20). Os passos
    ficam: o contrato se assina antes de cobrar (PT1c).
  - O Fechamento do dia com diferença pede o motivo na observação — sugere,
    não obriga (A21, `pedidoDoMotivoDaDiferenca`); os fechamentos anteriores
    dizem o motivo ou "sem motivo anotado" (`motivoDoFechamentoAnterior`).
    E leva ao CSV do fechamento no Financeiro → Movimentações, a quem vê o
    Financeiro da unidade inteira (A23, `linkDoCsvDoFechamento`).
  - O CSV do fechamento, na rede sem unidade recortada, sai de "Todas as
    unidades": um bloco por unidade ao alcance, no mesmo arquivo (A24,
    `csvDoFechamentoDoDia('TODAS', …)`, `juntarCsvsDoFechamento`).
  - "Receber" a parcela no Financeiro usa as formas em blocos, como o PDV, e
    o cartão diz "Ver e receber" (A25).
  - Pagar a comissão em Dinheiro que deixa a gaveta de hoje negativa avisa
    (A22, `dinheiroNaGavetaDeHoje`, `avisoDaGavetaNoPagamento`) — não recusa.
  - A maquininha de fábrica, ao ser escolhida para preencher, diz "Use esta,
    que ainda não tem taxas: dê o nome e as taxas da sua maquininha, e salve."
    (A7, `AVISO_DA_DE_FABRICA`).
- **O PDV e o Financeiro da 27ª simulação** (2026-11-24; decisões do Claude
  pelos princípios 3 e 7; prova: `tests/pdv-total-da-comanda-e-sem-cobranca.test.ts`,
  `tests/financeiro-lista-vazia-sem-lancar.test.ts`; migration
  `20261202200001`):
  - A comanda do atendimento paga no crediário ou no a receber mostra o
    TOTAL dela — o recebido mais o em aberto, já sem o desconto —, na lista e
    no "Total" (D6, `valorNaLista`, `rotuloDoTotalDaComanda`): o item de
    R$ 200 com R$ 100 de entrada dizia "Total R$ 100,00". O recebido se diz
    em "R$ … recebidos", e o em aberto, ao lado. "Total pago" só quando o
    total é o pago (com desconto, nada em aberto).
  - A comanda sem cobrança (cancelada, falta, sessão do pacote, pré-pago) e a
    estornada vêm à parte no fim da lista, em "Fora do que se recebe", com o
    valor riscado (A13, `separarAsQueNaoValem`, `[data-comandas-fora-do-recebido]`).
  - No Fechamento do dia, o título é "Fechamento do dia · PDV" (A14,
    `tituloDoPdv`), e o cartão diz o dia.
  - A comanda do PLANO no crediário diz a forma da entrada, como a da venda
    (A15 da 26ª): "Crediário (Pix) · R$ 1.000,00 recebidos" (`pdv_comandas`
    lê as formas também pelo `treatment_plan_id`).
  - O valor em reais do total (a comanda, o "Total:" e o "Total a cobrar" do
    plano) não quebra em duas linhas.
  - A lista vazia do Financeiro só sugere o "Novo lançamento" a quem o tem
    (A12, `vazioDaListaDoFinanceiro`); a quem só vê, "Ajuste os filtros.".
- **Os pontos e o voucher no PDV** (FD2a, fase 5b): na comanda do atendimento
  valem sobre o TOTAL da comanda (atendimento + produtos: `previaDoPagamento`
  e `confirmPayment` somam `valorDosItensDoAtendimento`); na "Nova venda"
  (produto, pacote, procedimento) o bloco "Fidelidade" (`PontosNaVenda`)
  aparece quando a cliente tem saldo ou voucher de desconto, e vale só no
  pagamento À VISTA (no Crediário e no A receber a tela diz "Os pontos e o
  voucher se usam no pagamento à vista."). Ordem: desconto comercial →
  voucher → pontos (`contaDaFidelidade`). Só o voucher de DESCONTO (valor ou
  percentual) vale na venda. A action refaz a conta
  (`fidelidadeDaVenda`, `lib/fidelidade/na-venda.ts`) e grava por
  `venda_com_fidelidade` (uma transação: a venda de sempre, depois
  `private.fidelidade_na_venda` reduz o lançamento, grava o
  `loyalty_discount`, marca o voucher USADO e lança o RESGATE). A comanda do
  PLANO também usa (FD2a/FD2b, "Os pontos e o voucher na comanda do plano",
  acima — RC-1 da varredura de 18/11: o texto dizia que ainda não usava).
- **A comanda recebe em mais de uma forma** (D1 da 18ª; o Heitor,
  2026-11-16: "Ok"): no à vista, o "+ Outra forma" (`OutrasFormas`,
  `CamposDoPagamento variasFormas`) acrescenta formas, cada uma com o valor
  dela, quantas quem recebe quiser — sem teto e sem aviso (o Heitor, 25/11,
  sobre o limite de 5 formas: "Não precisa de aviso, essa não é uma ação
  automatica, o usuario vai precisar clicar em um botão, então ele fez de
  proposito."; o botão segue depois da 5ª, e a action e o banco aceitam
  quantas vierem — migration `20261207700001`); a de cima fica com o que falta
  ("Pix: R$ 200,00 (o que falta das outras)"). Vale onde houver "Receber": a
  comanda do atendimento, a Nova venda (pacote, procedimento, produto) e o
  plano. **Um lançamento por forma** (`lancamentosDoPagamento`, com as vezes,
  a bandeira e a maquininha de cada uma), todos na MESMA transação — nascem
  com o mesmo `created_at`, e é por ele que a comissão e as vendas reconhecem
  as formas de um pagamento. As formas fecham o total ao centavo, senão a
  action e o banco recusam ("As formas somam … e não fecham o total"). Os
  pontos e o voucher abatem na PRIMEIRA forma (`comFidelidadeNaPrimeira`; no
  banco, `private.fidelidade_na_venda` com a base da venda inteira) e não
  podem passar do valor dela. O crediário e o a receber não se dividem
  (princípio 7: a entrada é uma forma só). O crédito interno vendido segue
  numa forma.
  **Receber a parcela ou o a receber também** (A1 da 21ª): o "Receber" da
  parcela no PDV, da ficha e do financeiro tem o "+ Outra forma". A linha em
  aberto vira a primeira forma e as outras nascem como cópias pagas dela
  (mesma venda, parcela e vencimento), numa transação só
  (`marcarPagoEmFormasCore` → `lancamento_receber_em_formas`; a conferência
  em `lib/financeiro/baixa-em-formas.ts`). Quantas formas quem recebe quiser
  (o Heitor, 25/11, a mesma fala), cada uma acima de zero e fechando o valor ao
  centavo; a linha com desconto ou pontos não se divide.
  **O crediário na comanda do atendimento** (decisão do Claude, 25/11): o banco
  recusava mais de 30 lançamentos ("Formas demais neste pagamento.") — e a
  entrada e cada parcela são um lançamento, então a comanda em 30x com entrada
  não fechava. As formas pagas agora não têm teto; as parcelas (o que não se
  paga agora) seguem o teto do crediário, 32.767 (`TETO_DO_CREDIARIO`, uma
  linha por parcela), com "No máximo 32.767 parcelas (o limite do registro)."
  (`confirmar_pagamento_do_atendimento`, migration `20261207700001`). Prova:
  `tests/formas-do-pagamento-sem-limite-de-quantidade.test.ts`.
  **As formas da mesma parcela são UMA linha nas listas** (limite da 21ª,
  2026-11-17; princípio 3: "Parcela 2/4" duas vezes parecia parcela
  repetida): o Financeiro (as duas listas), a ficha e o plano (o da equipe e o
  do app) mostram a parcela uma vez, com o total e "Pix R$ 400,00 + Dinheiro
  R$ 200,00" (`juntarAsFormasDaParcela`, `lib/financeiro/formas-da-parcela.ts`:
  a mesma descrição, parcela, criação e pagamento, paga e viva). O recibo e o
  estorno seguem POR FORMA, na própria linha ("Estornar (Pix)"). No CSV, uma
  linha por forma (a contadora concilia assim), com "(forma 1 de 2)" na
  descrição (`posicaoNaParcela`). **E o Financeiro e o Histórico → Pagamentos
  do app também** (D8 da 36ª: liam só `formaDoLancamento`, e a parcela vinha em
  duas linhas): a mesma junção, com um recibo por forma ("Recibo (Pix)",
  "Recibo (Dinheiro)"; a linha de uma forma só segue "Recibo") —
  `formaERecibosDaLinha`. Prova: `tests/app-da-cliente-formas-da-parcela.test.ts`,
  `e2e/portal-cliente-pagamentos.spec.ts` ("D8 e A4 da 36ª"). As formas vêm na ordem do valor, a maior primeiro (as cópias da parcela
  nascem com a mesma criação, e a ordem lida empatava: a mesma parcela lia
  "Dinheiro + Pix" numa tela e "Pix + Dinheiro" noutra; decisão do Claude, 27/11).
- **O troco no dinheiro** (item 14 do escopo de 18/11; o Heitor: "ok"): em
  toda tela que recebe — a comanda do atendimento e a Nova venda
  (`CamposDoPagamento`), a parcela no PDV, o "Receber" do Financeiro e da
  ficha (`ReceberNoCartao`), o plano no PDV (`CheckoutWizard`) e no
  atendimento —, com parte do pagamento em DINHEIRO, aparece "Valor entregue
  (opcional)" (`CampoDoTroco`, `components/shared/campo-do-troco.tsx`), que diz
  "Troco: R$ X" (`[data-troco]`). O dinheiro é a 1ª forma em Dinheiro (com o
  que falta das outras) mais as outras em Dinheiro; no crediário, a entrada
  (`emDinheiro`/`emDinheiroDoEstado`, `lib/checkout/troco.ts`, em centavos). O
  entregue MENOR (ou ilegível) diz "O valor entregue (R$ 50,00) é menor que os
  R$ 80,00 em dinheiro: faltam R$ 30,00." (`[data-entregue-menor]`) e o botão
  não confirma (`recusaDoTroco`, também dentro de `recusaDoPagamento`); vazio,
  recebe. **O entregue não se grava** (decisão do Claude, 26ª, pelo princípio
  7): fica só na tela — `montarPagamento` não o leva —, o que se registra é o
  pagamento, e o caixa e o Fechamento do dia contam o recebido. Prova:
  `tests/pdv-varias-formas-e-crediario-avulso.test.ts`, `e2e/pdv-nova-venda.spec.ts`.
- **O avulso tem as formas da venda** (o Heitor, 2026-11-16: "Mesma regra de
  pagamentos dos outros"): a comanda do atendimento oferece à vista (numa
  forma ou em várias), o Crediário com entrada e parcelas (até o limite da
  rede, C38) e o A receber, com os mesmos campos da Nova venda
  (`FormularioDeReceberAtendimento` → `CamposDoPagamento`). `confirmPayment`
  lê o `pagamento` (o `EntradaDoPagamento` da venda; sem ele, a forma única
  dos campos de antes), monta os lançamentos e `confirmar_pagamento_do_atendimento`
  grava tudo numa transação: o atendimento primeiro, depois os produtos da
  comanda (cada forma se reparte nessa ordem). O "a receber" sem forma do
  "Concluir" antigo (sem nota) é reaproveitado como a primeira linha; a
  parcela e o a receber do avulso levam a nota ("Atendimento — a receber"),
  e é a nota que os separa dele. **A comanda fecha** quando os lançamentos
  vivos do atendimento (pagos, ou a receber com nota) cobrem o preço; diz
  "Crediário · R$ … em aberto" como a da venda, e as parcelas se recebem
  nela e no PDV da cliente (`parcelasEmAbertoDaCliente`, agora também pelo
  `appointment_id`). Os pontos e o voucher só no à vista ("Os pontos e o
  voucher se usam no pagamento à vista."; o porquê está em `fidelidade.md`,
  "Os três limites que ficam"). O estorno de UMA das formas reabre
  a comanda só no que falta (`jaCobertoDoAtendimento`; a tela diz "Já pago"
  com o que ficou), e `atendimentos_a_receber.price` passa a ser o que FALTA.
  No crediário e no a receber o botão diz "Fechar a comanda" (nada, ou só a
  entrada, entra agora).
- Prova: `e2e/pdv-comanda-do-atendimento.spec.ts`, `e2e/pdv-nova-venda.spec.ts`,
  `e2e/pdv-comanda-do-plano.spec.ts`, `e2e/pdv-fechar-o-dia.spec.ts`,
  `e2e/pdv-crediario-e-parcela.spec.ts`,
  `e2e/pdv-comanda-varios-itens-e-pontos.spec.ts`,
  `e2e/pdv-varias-formas-e-crediario-avulso.spec.ts`,
  `tests/pdv-varias-formas-e-crediario-avulso.test.ts`.

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
do plano, um percentual da rede (Configurações → Comissões → "Venda de
plano").

- **Documentos do pacote** (PC2/PC7, Bloco Documentos leva 1, 2026-11-14): a
  cliente assina UMA vez, pelo pacote — a sessão de pacote não emite documento.
  A sessão nasce como agendamento comum e, ligada ao pacote
  (`package_sessions.appointment_id`), os documentos abertos dela são
  cancelados (`trg_documentos_da_sessao_de_pacote`). O **contrato de pacote**
  é um modelo da rede, um só ativo, e toda rede nasce com o padrão (DC1/DC2,
  `documentos.md`). **O contrato de pacote se assina ANTES do dinheiro,
  como no plano** (PC2, o Heitor, 2026-11-13: "o ideal era funcionar como no
  plano de tratamento"; do plano: "primeiro colhe assinatura, depois paga" —
  a auditoria das regras de 2026-11-18 corrigiu o "a venda não espera"): com
  o contrato de pacote ativo, `venderPacote` devolve o contrato a colher
  (`contratoParaAssinar`, montado com o `pacote.*` e o `pagamento.*` da venda)
  e não grava nada; assinado — ou dispensado, com o motivo —, a venda fecha e o
  adota; assinado com outro pagamento, pergunta antes de substituir.
  Enquanto o contrato espera a assinatura, o que a tela escolheu (o pacote, o
  pagamento, o desconto, quem vendeu, a responsável) fica na aba do navegador
  e volta se a tela se monta de novo ou recarrega, na aba Pacote (A6 da 34ª;
  `lib/vendas/venda-do-pacote-na-aba.ts`, sessionStorage por unidade e
  cliente; vender ou cancelar apaga; o servidor confere tudo de novo).
  De volta da assinatura ("Continuar"), a tela diz "Conferindo a
  assinatura…" enquanto o servidor confere — o pedido do contrato não volta à
  tela nesse meio —, e a conferência que falha diz o erro (D14 da 35ª).
  **A venda emite** (leva 2, 2026-11-14) os documentos puxados dos
  procedimentos distintos — o termo e os "Outros documentos", menos os que o
  pacote exclui no pop-up (`documentos_excluidos`). Esses NÃO seguram o
  dinheiro: a tela da venda diz o que ficou para assinar, e o "Bloqueia" deles
  trava o início de cada SESSÃO. Cancelar o pacote cancela os documentos
  abertos dele. Regra inteira em `documentos.md`; prova:
  `e2e/documentos-pacote-assina-antes-de-pagar.spec.ts`,
  `e2e/documentos-link-unico-e-pacote.spec.ts`.
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
- **O tratamento comprado é da REDE; o dinheiro dele, do caixa da unidade
  da venda** (D3 da 14ª simulação, F73; H5, CLAUDE.md §5: "A cliente é da
  clínica, pode agendar em qualquer unidade da clínica"). Vale para o pacote,
  o plano fechado e o pré-pago. Quem agendava na Pampulha abria o pacote que a
  Marina comprou na Savassi e via "0 / 6 sessões", sem erro: a lista e o
  agendar estavam presos à unidade da venda. São DUAS regras, cada uma com o
  seu nome (`lib/tratamento/alcance.ts`):
  - **ver e agendar as sessões** — `alcancaOTratamento`: o registro é da rede
    de quem chama (`getClientPackageSessions`, `getPlannedSessionAppointments`,
    `schedulePackageSession`, `schedulePlanSession`, `agendarUnidadePrePaga`,
    a ficha de tratamento do plano por `planoDaRede`). A unidade do
    AGENDAMENTO segue pelo alcance, no núcleo (`conferirPecasDoAgendamento`):
    quem tem só a Pampulha agenda na Pampulha, não na Savassi;
  - **cancelar, estornar, fechar** — `alcancaOCaixaDoTratamento`: a rede E a
    unidade da venda ao alcance (`pacoteDaClienteAoAlcance`,
    `planoFechadoAoAlcance`, `unidadeAoAlcance` do pré-pago). O checkout e a
    edição do plano (`planoDoTenant`) seguem na unidade do plano.
  `tests/tratamento-da-rede.test.ts` trava a action que voltar a decidir
  por conta própria. A primeira janela do pacote na ficha ("Abrir para ver e
  agendar as sessões") já lista as sessões, cada livre com "Agendar", que abre
  o agendar DELA (A21 da 14ª; "Gerenciar sessões" continua). Prova:
  `e2e/pacote-plano-da-rede-f73.spec.ts`.

- **Catálogo da rede** em Comercial → Pacotes (`/admin/pacotes` e
  `/[slug]/pacotes`, corpo em `app/_shared/pacotes.tsx`, `PacotesCatalogo`):
  os procedimentos e quantas sessões de cada, preço, validade em dias (vazio =
  sem validade), à venda ou não. A validade acima de 3.650 dias (o teto de
  antes) avisa e grava (o Heitor, 25/11: "Se não for impossível, ainda que
  improvável, pode ser feito."); só se recusa o zero e o acima de 100 anos,
  36.500 dias (a validade vira data; decisão do Claude, 25/11) — o mesmo na
  validade do pré-pago (`recusaDaValidadeEmDias`/`avisoDaValidadeEmDias`,
  `lib/vendas/validade.ts`; migration `20261207100001`). Prova:
  `tests/validade-e-custo-acima-do-comum.test.ts`. **As sessões e o preço
  também só recusam o impossível** (o Heitor, 25/11: "Se não for impossível,
  ainda que improvável, pode ser feito."): recusavam-se mais de 100 sessões (no
  total e em cada procedimento), mais de 30 procedimentos e o preço acima de
  R$ 1.000.000, o preço com a mensagem do zod em inglês. Decisão do Claude,
  25/11: o "comum" é o antigo teto — acima de 100 sessões e de R$ 1.000.000 a
  tela avisa ao lado do campo (`[data-acima-do-comum="sessoes-do-pacote"]`,
  `"preco-do-pacote"`) e o servidor grava; o impossível é o registro — cada
  sessão vira uma linha em `package_sessions`, então até 32.767 sessões (o
  limite do crediário), e o preço grava em `service_packages.price`
  (numeric(10,2)), até R$ 99.999.999,99. Os 30 procedimentos saíram (sem
  motivo técnico: cada linha tem ao menos uma sessão, e as sessões já têm o
  limite). Uma regra só, `lib/pacotes/tamanho-e-valor.ts`, lida pela tela, por
  `salvarPacote`, por `trazerPacoteDeFora` e pela importação; no banco, o
  CHECK de `service_package_items` e `pacote_salvar` (migration
  `20261207300001`). Prova: `tests/pacote-sessoes-e-preco-acima-do-comum.test.ts`.
  Ver pede `procedures: VIEW`; editar,
  `procedures: MANAGE`, e só isso (PC6 do plano de adaptação, 2026-11-13: sai
  a exigência de ser da rede), nos dois portais (`salvarPacote`). **O preço
  nasce com a soma** (PC1): sessões × preço de tabela, e acompanha a soma até
  alguém mexer no campo; o pacote que já existe guarda o seu. Prova:
  `e2e/procedimentos-por-permissao.spec.ts` ("PC1", "PC6").
- **O menu tem Comercial e Marketing separados** (decisão do Heitor, 2026-09-30):
  Comercial = Inbox, Oportunidades, Procedimentos e Pacotes (o funil e o que se
  vende); Marketing = Notificações, Marketing e Templates. A tela de cargos
  agrupa os módulos igual (`MODULE_GROUPS`: `crm` e `procedures` em Comercial,
  `marketing` em Marketing). O grupo se chamava "Vendas" até 2026-11-17 (A11
  da 21ª, o Heitor: "opcao 2"): o nome era o mesmo da aba Vendas dos
  Relatórios. "Vendas" é só a aba; a chave interna do grupo segue `vendas`.
  Prova: `tests/menu-comercial.test.ts`.
- **Cada categoria do menu recolhe pelo título** (pedido do Heitor,
  2026-09-30; `SecaoDoMenu`, `components/shared/secao-do-menu.tsx`, nos dois
  menus). Nasce aberta; fechada, ainda mostra o item da página aberta; lembra
  por navegador (`localStorage`); com a barra recolhida em ícones, não recolhe.
  Prova: `e2e/menu-lateral.spec.ts`.
- **Venda à cliente** (era a "Venda na ficha do cliente", "Vender pacote",
  `VenderPacote`; desde o PDV7, 2026-11-13, é a "Nova venda" do PDV), para
  quem recebe (`podeReceber`), com o vocabulário do plano: à vista, entrada +
  parcelas, a receber (`CamposDoPagamento`, o mesmo do pagamento do contrato).
  - Os formulários são os do antigo **"Vender"** (`VendaNaTela`,
    `components/shared/vender.tsx`), em abas: Procedimento (pré-pago,
    §9.3.2), Pacote, Produto e Crédito interno — separados no banco, só
    dividem a porta. Vender é o que o cliente compra e como paga; Agendar,
    quando ele vem.
  - O botão "Vender" saiu do cabeçalho da ficha (PDV7: "O vender da ficha
    sai"); a ficha segue com o "+ Agendar".
  - **A venda pergunta a unidade na REDE com duas ou mais** (D1 da 8ª
    simulação, 2026-11-06; H5: "nada se prende a clients.branch_id";
    decidido pelo princípio 3: nenhuma vem escolhida). Era a unidade de
    CADASTRO da cliente — ou a primeira em ordem alfabética —, sem perguntar:
    a Patrícia (Água Verde) via "Hidratante — sem estoque", e a venda no Batel
    só deu pelo portal do Batel; o "Quem vendeu" era a equipe da Água Verde.
    Hoje a unidade é a do PDV, e o PDV da rede sem unidade escolhida pergunta
    "Em qual unidade é a venda?" (`[data-unidade-da-venda]`) antes de tudo;
    o catálogo (procedimento, pacote, produto com o estoque DELA), a equipe,
    o caixa, a baixa e a comissão são os dela. O mesmo vale para o que a
    ficha da rede grava por unidade: o crédito interno, o ajuste de pontos, a troca e a entrega do
    voucher (o produto baixa no estoque da escolhida) e o agendar da unidade
    pré-paga e da sessão — todos nascem sem unidade (`perguntaAUnidade`). Com
    uma unidade só, nada a perguntar; no portal da unidade, é ela. Prova:
    `e2e/vendas-unidade-da-venda.spec.ts`.
  - Também no painel da direita do inbox, com as ações da pessoa
    (`getConversationCard` → `venda`), **com ou sem ficha**: o "Vender" é um
    link ao PDV do portal em que a pessoa está, com a cliente escolhida
    (`rotaDaVenda` em `inbox-lead-panel.tsx` →
    `/<portal>/pdv?nova=1&cliente=<id>`; PDV7: "o do inbox… pode levar pro
    PDV"). `venda` é só o sinal de quem recebe (`podeReceber`): o catálogo e
    a unidade são os do PDV, que pergunta a unidade na rede com duas ou mais
    (sobra da F33 da 8ª simulação, 2026-11-06; H5: "nada se prende a
    clients.branch_id" — era "senão a do cliente", a unidade de cadastro).
    Como as outras ações da pessoa, o botão some com o painel só de leitura
    (sem `crm: MANAGE`). Prova: `e2e/agenda-atritos-da-8.spec.ts` ("sobra
    da F33").
  - **Sem ficha, primeiro o cadastro** (decisão do Heitor, 2026-09-30): o
    "Vender" (a quem também pode cadastrar, Clientes em Gerenciar) abre o
    cadastro, e ao salvar leva ao PDV com a cliente nova
    (`venderAposCadastro`).
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
    sem o dia. **A linha diz "Sem vencimento"** no lugar da data (A4 da 36ª,
    princípio 3: o Financeiro e a ficha mostravam a data de criação, e o app
    dizia "Vence" nesse dia): o Financeiro (as duas listas), a ficha e o app
    (Financeiro e Histórico), por `emAbertoSemVencimento`/`SEM_VENCIMENTO`
    (`lib/financeiro/vencimentos.ts`). No período ele continua contando pela
    criação (FN-09), e no app a ordem segue a mesma. Prova:
    `tests/a-receber-sem-vencimento-na-linha.test.ts`.
- **Liberar as sessões do pacote no crediário é da REDE, e a tela diz o que
  falta pagar** (decisão do Claude pelo princípio 1, 2026-11-18 — item 8 da
  auditoria das regras; era "o pacote segue liberando: princípio 1, nada muda
  sem a rede pedir", A41 da 11ª, e o princípio 1 pede que a rede decida).
  Configurações → Geral → "Pacote com valor em aberto"
  (`tenants.pacote_crediario_libera`, `lib/pacotes/regras.ts`):
  - **"Libera as sessões e avisa o que falta"** (o PADRÃO, o de antes): o
    pacote vendido no crediário (ou a receber) libera todas as sessões, e a
    tela avisa (princípio 2).
  - **"Libera as sessões só depois de pago"**: a sessão do pacote com valor em
    aberto não se liga a agendamento nenhum até o pacote estar pago — "Este
    pacote ainda tem R$ 300,00 em aberto, e a rede libera as sessões do pacote
    no crediário só depois de pago. O que falta se recebe no PDV." Vale em
    todo caminho que agenda ou usa a sessão, porque todos passam por
    `conferirCredito` (`lib/creditos/credito.ts`): o agendar da equipe e o do
    app (PT3), pelo núcleo do agendamento, o Copilot e o "Abater do pacote". O
    banco é a segunda linha (`private.pacote_sessao_liberada`, BEFORE UPDATE
    OF `appointment_id` em `package_sessions`, só na ligação de livre a
    ligada; migration `20261124000301`). O em aberto é o de
    `metrics_em_aberto_dos_pacotes` (a parcela estornada não conta).
    **A sessão presa não oferece "Agendar"** (A5 da 37ª, decisão do Claude,
    27/11 — PA-13 e CLAUDE.md §14, o botão que não se pode usar, a tela
    esconde): a ficha (o cartão diz "Abrir para ver as sessões"), a ficha de
    tratamento, "Gerenciar sessões" e o cartão do pacote no app escondem o
    "Agendar" dessas sessões (`sessoesPresas`, `ProfilePackage.sessoesPresas`);
    a action e o banco seguem recusando. No modal da agenda, UM aviso: o do em
    aberto a quem recebe; a recusa a quem não o vê. No app, a recusa fala com
    a cliente: "As sessões deste pacote se liberam quando ele estiver pago."
    (`recusaDaSessaoNaoLiberadaNoApp`, pelo `paraACliente` do núcleo; o cartão
    do Início diz o mesmo no lugar do "Agendar"). Prova:
    `tests/agendar-credito-escolhido-e-sessao-presa.test.ts`.
  O pacote de entrada R$ 150 + 3 × R$ 100 liberava as 6 sessões
  calado (A41). Na ficha, embaixo do cartão "Tratamento em andamento", e ao agendar a
  sessão (a ficha de tratamento → "Gerenciar sessões"): "R$ 300,00 deste
  pacote ainda em aberto (3 parcelas do crediário). As sessões seguem
  liberadas; o que falta se recebe no PDV." — sem liberar, "As sessões se
  liberam quando ele estiver pago; o que falta se recebe no PDV."
  (`textoDoPacoteEmAberto`) — e o "Receber no PDV", que leva à
  "Nova venda" com a cliente no PDV da unidade do pacote, onde as parcelas
  dela aparecem (CX1; `rotaDaClienteNoPdv`, `lib/rotas.ts` — dizia "no
  Financeiro" até 2026-11-16) (`AvisoDoPacoteEmAberto`,
  `[data-pacote-em-aberto]`), só a quem recebe (o dinheiro é do caixa, como o
  saldo do plano — A39 da 7ª). A conta é do banco (`metrics_em_aberto_dos_pacotes`
  → `getEmAbertoDosPacotes`, `lib/metrics/pacote-em-aberto.ts`; migration
  `20261110005604`). Prova: `e2e/vendas-atritos-da-11.spec.ts` ("A41"),
  `e2e/pacote-regras-da-rede.spec.ts` ("8"), `tests/pacote-regras-da-rede.test.ts`.
  **O cartão do pacote na ficha diz a parte de cada sessão e a validade**
  (A1 da 37ª, PA-07, PA-11, princípio 3; o pacote de antes também), como o
  pré-pago: "R$ 124,90 × 3 · R$ 195,15 × 2 · vale até 29/12/2026"
  (`[data-partes-do-pacote]`, `partesDoPacote` em
  `lib/clientes/pacotes-da-ficha.ts`; a sessão sem preço gravado vale
  valor ÷ sessões; o de antes sem valor de referência, só a validade).
- **"Abater do pacote": o pacote vendido DEPOIS paga o avulso já concluído**
  (D9 da simulação de 2026-10-28, decisão do Heitor). No recebimento de um
  avulso CONCLUÍDO e a receber — a comanda dele no PDV, desde o PDV7 (a
  janela "Confirmar pagamento" da tela do atendimento saiu) —, se a cliente tem
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
  - **O pago além do usado volta, como quem cancela escolher**: ESTORNO (o
    estorno de sempre, `estornar_transacao`, do lançamento mais novo para o
    mais antigo; o último em parte — o lançamento fica com o que sobra e um
    contra-lançamento "Estorno parcial", na mesma forma, leva o resto, com os
    pontos daquele pagamento na proporção) ou CRÉDITO INTERNO
    (`internal_credits`, "Cancelamento do pacote X"; o dinheiro fica e os
    pontos também — ele não voltou). Ex.: Pix de R$ 3.300, 2 de 6 feitas:
    R$ 2.200 de crédito, ou o Pix fica com R$ 1.100 e R$ 2.200 voltam.
  - **O pagamento que volta EM PARTE: duas formas, quem cancela escolhe**
    (r2-ven-05, o Heitor, 2026-11-03: "dar as duas opções, não sabemos como a
    operadora da clínica vai lidar com essa parte de estorno, não sabemos se
    vai ser possível fazer estorno parcial, então precisamos dar opção.
    flexibilidade"). No estorno, quando o que volta é menor que um pagamento,
    a janela pergunta "Como estornar o Pix de R$ 3.300,00?":
    (a) **Estorno parcial** — o de cima: o pagamento passa a valer o usado e o
    "Estorno parcial" leva o resto; (b) **Estornar o pagamento inteiro e
    lançar o usado de novo** — o estorno de sempre do pagamento todo
    (`estornar_transacao`, com os pontos dele) e um pagamento NOVO do usado,
    pago agora, na forma que quem cancela escolher ("Forma do pagamento do
    usado", e as vezes no crédito, até o limite da rede), com o pacote
    (`client_package_id`) e os pontos pelos gatilhos de sempre; a comissão,
    uma vez no fim do cancelamento, com o dinheiro do fim (D11 da 26ª,
    `comissoes.md`). **A forma do usado nasce VAZIA** (decisão do Claude pelo princípio 4,
    auditoria das regras, 2026-11-18 — como toda forma de pagamento, A37 da
    24ª: o sistema não chuta como a cliente paga): escolhido o "inteiro" (no
    cartão, ele já vem), a "Forma do pagamento do usado", as vezes e a
    bandeira ficam em branco, e quem cancela escolhe; o que já tinha escolhido
    não se desfaz (`comOPagamentoInteiro`, `escolha-da-devolucao.tsx`; vale no
    pacote, na unidade do pré-pago e na devolução de produto). Substitui a A41
    da 8ª simulação, que trazia a do pagamento estornado. Prova:
    `e2e/vendas-produto-devolver-parte.spec.ts` ("forma do usado vazia"),
    `tests/auditoria-c-dinheiro.test.ts`.
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
  - **As sessões já agendadas**: quem cancela escolhe cancelar os agendamentos
    (status, motivo "Pacote cancelado: …", histórico na transação; o evento
    `agendamento.cancelado` e o aviso à cliente e à equipe depois, na action,
    como todo cancelamento) ou mantê-los como atendimento AVULSO (soltos do
    pacote, com o preço que tinham — a parte da sessão —, a cobrar). Sessão em
    atendimento agora (chegou ou em andamento) recusa o cancelamento.
  - As sessões que sobraram ficam `CANCELLED` (`PackageSessionStatus`, que não
    se agendam); o pacote guarda `cancelado_em`, quem, o motivo,
    `valor_cancelado` e o retrato da conta (`cancelamento`). Pacote já
    cancelado ou com todas as sessões feitas não se cancela.
  - **Cancelar o pacote VENCIDO é da rede** (decisão do Claude pelo
    princípio 1, 2026-11-18 — item 9 da auditoria das regras; o Heitor, 18/11:
    "pacote vencido = configuração da rede"). Configurações → Geral →
    "Pacote vencido" (`tenants.pacote_vencido_cancela`): **"Não se cancela"**
    (o PADRÃO, o de antes — "Este pacote venceu em …: as sessões que sobraram
    não se devolvem. Cancelar o pacote vencido é uma opção da rede, em
    Configurações → Geral.") ou **"Pode ser cancelado, com a devolução"**: o
    vencido com sessão que sobrou se cancela pela MESMA conta
    (`pacote_cancelar_devolvendo`, só a trava do vencido olha a opção;
    migration `20261124000301`) — as sessões que sobraram, o crediário que
    cai e o que volta. A ficha (para quem tem o Financeiro em Gerenciar) mostra
    o vencido fora do "Tratamento em andamento" — "Pacote X venceu em
    10/11/2026, com 4 sessões que sobraram." — com o "Cancelar pacote", que
    abre a janela de sempre (`pacoteVencidoDaFicha`,
    `lib/pacotes/regras-da-rede.ts`; `[data-pacote-vencido]`). Prova:
    `e2e/pacote-regras-da-rede.spec.ts` ("9"). O cartão explica, na dica, o
    que é e o que se pode fazer (A24 da 29ª, princípio 7 — só texto): fora do
    Tratamento em andamento; o "Cancelar pacote" mostra a conta antes de
    confirmar (o usado, o pago e o que volta, se houver); deixar como está
    também vale (`SOBRE_O_PACOTE_VENCIDO`, `lib/clientes/pacotes-da-ficha.ts`).
  - Tudo numa transação (`pacote_cancelar_devolvendo`, migration
    `20261103001303`, a partir de `20261101000252`; o valor novo do enum em
    `20261101000251`).
  - A comissão: a de venda volta na proporção do que foi cancelado, e a de
    execução das sessões feitas fica (`comissoes.md`). Os pontos seguem o
    estorno (`fidelidade.md`). Nas Vendas, o pacote vale o usado
    (`indicadores.md`).
  - Na ficha, o pacote cancelado sai do "Tratamento em andamento" e entra no
    Histórico ("Pacote cancelado: X — 4 sessões canceladas · R$ 2.200,00 em
    crédito interno · Motivo: …"); no app da cliente, sai dos tratamentos
    em curso; o lembrete de vencimento (cron) não o lembra; o pacote LGPD diz
    "cancelado em". **E o app diz o que aconteceu com o dinheiro** (A46 da 6ª
    simulação, 2026-11-04): no Histórico → Pagamentos e no Financeiro, o
    pagamento do pacote diz "Pacote cancelado em 04/11/2026"
    (`data-pacote-cancelado`), e o ESTORNO devolvido a ela aparece como
    saída — "− R$ 600,00 · Estorno" (`data-estorno`; a contra-transação,
    `category = 'Estorno'`, com o `client_id` dela). A Márcia via só "Pacote
    R$ 200 Pix Pago". O "Total investido" segue o do banco. Prova:
    `e2e/portal-cliente-pacote-cancelado.spec.ts`. O Financeiro do app
    também mostra o que está **"A pagar na unidade"** (A14 da 16ª: só
    aparecia em Histórico → Pagamentos), pela mesma leitura do Histórico
    (`getAtendimentosAReceber`, `[data-a-pagar-na-unidade]`).
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
    **E na janela do estorno** (D1 da 35ª; decisão do Claude, 27/11): quem tem
    só o Financeiro em Gerenciar não abre a ficha (o Clientes) nem a página do
    plano (o Atendimento), e a janela do estorno mandava cancelar "na ficha".
    O estorno do pagamento do pacote, do plano aceito ou do pré-pago oferece ali
    mesmo "Cancelar pacote", "Cancelar plano" ou "Cancelar a sessão N" (as
    livres), que abre a janela de sempre (`reaberturaDoEstorno` → `cancelar`,
    `ConfirmarEstorno`, `[data-cancelar-pelo-estorno]`), e a frase termina em
    "Para desfazer a venda:". Vale nos dois financeiros, na ficha e no PDV.
    Prova: `tests/cancelar-pelo-estorno.test.ts`.
  - **O usado é o preço das sessões FEITAS no plano** (o agendamento
    concluído), cada uma pela soma dos procedimentos dela, já com o desconto
    rateado — sem multa e sem preço de tabela. Ex.: 3 sessões (R$ 585 + R$ 144 +
    R$ 585, R$ 1.314), entrada de R$ 500 + 2 × R$ 407, 1 sessão feita: usado
    R$ 585, caem R$ 729 — a 2ª parcela inteira e R$ 322 da 1ª, que fica com
    R$ 85 — e nada a devolver. O crediário que passa do usado cai antes; o
    pago além dele volta como estorno (parcial ou o inteiro com o usado lançado
    de novo; no cartão, só o inteiro) ou crédito interno, a escolher; as
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
  - **O plano ainda NÃO aceito (rascunho ou proposto) se cancela sem dinheiro**
    (A1a da 25ª; o Heitor, 18/11: "sim"): nada foi vendido nem recebido, então
    não há conta — é o "Cancelar plano" de quem monta o plano, com o motivo
    (`cancelarPlanoProposto` → `plano_cancelar_proposto`). A regra está em
    `atendimento.md` ("O plano ainda não aceito também se cancela").
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
  em Gerenciar, a "Nova venda" do PDV (o formulário do antigo "Vender",
  `podeAgendar` em `app/_shared/pdv.tsx`) diz "Venda registrada. Agendar a 1ª sessão
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
    **Acima do comum avisa** (o Heitor, 25/11: "Se não for impossível, ainda
    que improvável, pode ser feito."): eram de 1 a 100 sessões (a importação,
    até 200) e o valor de referência até R$ 10.000.000, este com a mensagem em
    inglês. Decisão do Claude, 25/11: acima de 100 sessões e de R$ 10.000.000
    (os antigos tetos) a janela avisa
    (`[data-acima-do-comum="sessoes-do-pacote-de-fora"]`, `"valor-de-referencia"`)
    e o servidor grava; o impossível é o registro — até 32.767 sessões (uma
    linha por sessão) e R$ 99.999.999,99 (o valor de referência grava também em
    `service_packages.price`, numeric(10,2)). A mesma regra do catálogo
    (`lib/pacotes/tamanho-e-valor.ts`; `pacote_trazer`, migration `20261207300001`).
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
    da sessão (`comissoes.md`); sem valor de referência, o percentual dá R$ 0
    (princípio 4: o app não cria a linha), e o "R$ fixo por sessão" é pago
    (item 11 da auditoria das regras, decisão do Claude pelo princípio 2,
    2026-11-18). A receita dos atendimentos (a execução) conta essa
    parte no dia da sessão, pelo `package_sessions.preco` (r2-ind-01); sem
    ela, nada (princípio 5). O caixa e o faturamento nunca contam.
  - **A tela diz o que é** (A57): o cartão da ficha "PACOTE DE ANTES · 4 de 6
    restantes · 2 usadas antes do sistema" (`[data-pacote-de-fora]`; sem valor,
    o aviso `[data-pacote-sem-valor]`), a ficha de tratamento "Pacote de antes:
    2 usadas antes do sistema." e, nas sessões, "Usada antes do sistema"; o
    Histórico, "Pacote de antes registrado" sem valor; o app da cliente,
    "Pacote de antes: 4 de 6 restantes" (`restantesDoPacoteDeFora`) — sem
    pagamento nem recibo.
  - **A validade já passada se aceita, e a janela avisa** (decisão A2 da 37ª,
    do Claude, 27/11, pelo princípio 2 e a fala do Heitor de 25/11): "Esta
    validade já passou: o pacote nasce vencido." (`[data-pacote-nasce-vencido]`,
    `avisoDoPacoteDeForaVencido`).
  - **Cancelar o pacote trazido** é o cancelamento de sempre: nada foi pago à
    rede por ele, então não há o que devolver nem parcela a cair, e nenhum
    lançamento nem crédito nasce (prova: o caso "sobra da F35" de
    `e2e/pacote-de-fora.spec.ts`).
  - Os pacotes "Saldo migrado" a R$ 0 que a Hortênsia criou antes disso são
    dado de [sim] e ficaram como estão.
  - Prova: `e2e/pacote-de-fora.spec.ts`.
- **A tela de Pacotes manda à "Nova venda" do PDV** (A46; era o "Vender" da
  ficha, e antes "Vender pacote"): "A venda é no PDV, em “Nova venda”
  (escolha Pacote)…" (`TEXTO_DA_VENDA_DO_PACOTE`, `lib/permissions-copy.ts`).
- **A taxa e o líquido da maquininha no Vender são de quem vê o financeiro da
  rede** (A19 da 12ª simulação, 2026-11-11: a Rita, com o PDV e sem o
  financeiro da rede, via "Taxa da maquininha… a rede recebe R$ …"): o
  `[data-liquido-do-cartao]` e o `[data-taxa-do-debito]` com a taxa só aparecem
  a quem tem o Financeiro em Ver (`veComissaoDeTodos`; sem o "só os meus",
  SM1, 2026-11-23) — a régua de "quem vê quanto cada um ganha" e do texto do
  cargo do PDV ("não vê o financeiro da unidade", A39). Quem só recebe
  segue vendo o aviso de taxa NÃO cadastrada (sem valor). Muda a A40 da 8ª,
  que os mostrava a todo mundo que recebe. **Confirmado pelo Heitor no levantamento
  das regras** (D7, 2026-11-11, opção a; princípio 3: a tela de quem só recebe
  não mostra o financeiro da rede), e o servidor também deixa de mandar os
  números a quem só recebe (F63, C3): `taxasDoCartaoDeCredito`, `taxaDoDebito`
  e `cartaoPorBandeiraDaRede` mandam a quem não vê o financeiro de todos só
  QUAIS vezes e bandeiras estão cadastradas, com a taxa 0 e sem o prazo — é
  o que o aviso "não há taxa cadastrada" precisa; sem `podeReceber`, a
  bandeira nem responde. E a sessão não lê `payment_fees` pela chave pública
  (migration `20261112006302`). Prova: `e2e/vendas-atritos-da-12.spec.ts`
  ("A19"), `e2e/caixa-atritos-da-8.spec.ts` ("A40", agora com a Admin da rede),
  `e2e/permissoes-respostas-sem-permissao.spec.ts` (a resposta da action).
- **Quem vende é quem RECEBE, e a tela diz** (D1 da 12ª simulação, 2026-11-11;
  princípio 3 — quem vende segue decidido pelo cargo, princípio 1): a Rita, com
  Procedimentos, CRM e Clientes em Gerenciar, lia "fechar a venda do pacote" na
  linha de Procedimentos e não via o "Vender" (`podeReceber`: o PDV — desde o
  PV-04, 24/11, só ele). A linha de Procedimentos em Gerenciar não promete mais
  a venda ("Vender é no PDV, de quem tem o PDV."), o resumo do cargo
  ("O que essa pessoa vai ver") diz "Não vende no PDV: vender é de quem tem o
  PDV." — ou "Vende no PDV (procedimento,
  pacote, produto e crédito)." — (`quemVendeNoResumo`, `[data-quem-vende]`), e a tela de Pacotes diz o
  mesmo (`TEXTO_DA_VENDA_DO_PACOTE`, `lib/permissions-copy.ts`). A trava não mudou.
  Prova: `tests/defeitos-da-12.test.ts` ("D1").
- Prova: `e2e/pacotes-venda.spec.ts`.

### 9.3.2 Procedimento pré-pago (2026-09-30)

N unidades de UM procedimento, pagas antes (ou a receber) e agendadas depois.
**Separado do pacote de propósito** — o Heitor recusou reaproveitar
`client_packages`: pacote é um conjunto vendido por um preço só; o pré-pago é
o procedimento avulso pago antes.

- **A venda** é `procedure_sales` (retrato: preço unitário e total de tabela,
  desconto, vendido, validade OPCIONAL — acima de 3.650 dias avisa, até 100
  anos, como a do pacote —, quem vendeu) e as **unidades**,
  `procedure_sale_units` (uma linha por unidade, com a SUA parte do vendido —
  rateio igual em centavos, a base da comissão dela —, a situação
  `DISPONIVEL | USADA | CANCELADA` e o agendamento que a usa). O dinheiro leva
  `financial_transactions.procedure_sale_id`. Uma transação:
  `procedimento_vender` (`venderProcedimento`, `actions/pre-pago.ts`, para
  quem recebe). Desconto como toda venda (§9.6).
- **Quantas sessões é o que quem vende escolhe** (o Heitor, 25/11: "Se não
  for impossível, ainda que improvável, pode ser feito."; era de 1 a 100):
  acima de 100 a tela avisa ao lado do campo
  (`[data-acima-do-comum="sessoes-do-pre-pago"]`) e o servidor grava. O
  impossível (decisão do Claude, 25/11): zero, fracionário e acima de 32.767 —
  cada sessão é UMA LINHA em `procedure_sale_units`, o limite do crediário
  (`recusaDasSessoesDoPrePago`, `lib/vendas/quantidades.ts`; no banco,
  `procedimento_vender*` e o CHECK `procedure_sales_quantity_check`, migration
  `20261207200001`). O "Pré-pago · 5 de N" da agenda lê o N da venda
  (`procedure_sales.quantity`), não conta as linhas (que cortavam em 1000).
- A sessão só LÊ (equipe que alcança a unidade; o cliente, o que é dele).
- **No atendimento**: o agendamento liga a unidade (`appointment_id`, único);
  `concluir_atendimento` a marca USADA e liga a linha de comissão à venda
  (origem `PRE_PAGO`); o recebimento RECUSA cobrar (`confirmar_pagamento…`),
  e a tela esconde o botão.
- **Agendar usando o que já foi pago** (unidade pré-paga OU sessão de pacote)
  é o **crédito** do agendamento, e passa pelo NÚCLEO:
  `createAppointmentCore(… credito: { tipo: 'PRE_PAGO' | 'PACOTE' | 'PLANO', id })`
  (`lib/creditos/credito.ts`; a sessão do plano fechado desde a D5/A18 da 9ª —
  `atendimento.md`). O crédito é conferido (do cliente, da rede,
  livre, na validade) e decide o procedimento e o preço — procedimento
  diferente é recusado. **A validade vale o DIA MARCADO** (A3 e A6 da 37ª,
  decisões do Claude, 27/11, PP-05): a sessão do pacote ou do pré-pago não se
  marca para depois do dia da validade em caminho nenhum — o agendar da
  equipe e o do app (pelo núcleo, `quando`), a remarcação (da equipe e do
  app, `recusaDoCreditoDoAgendamento`), a ligação do avulso já marcado
  (`recusaDoCreditoNoDia`); a recusa diz até quando ("Este pacote vale até
  29/11/2026: marque a sessão até esse dia."; vencido hoje, "Este pacote
  venceu em …"). A validade é um dia, no fuso da unidade do crédito, não a
  hora gravada em `expires_at` (`lib/creditos/validade.ts`); o "Incluído" do
  modal e o do avulso só oferecem o que vale. Prova:
  `tests/credito-vale-no-dia-marcado.test.ts`; depois do insert ele é ligado por compare-and-swap
  (`appointment_id` nulo), e quem perde a corrida tem o agendamento desfeito.
  Com conflito de horário, histórico e evento, como todo agendamento.
  - Onde: o card "Procedimentos pagos" ("Agendar" na unidade,
    `agendarUnidadePrePaga`), o modal da agenda e o do inbox (campo "Já
    pago", `creditosParaAgendar`), e o "Agendar agora" depois de vender um
    procedimento (quem tem `agenda: MANAGE`).
  - **No modal da agenda, o "Incluído" (era "Já pago" até a A3 da 25ª: o
    crediário tem parcelas em aberto) vem ESCOLHIDO quando o procedimento
    bate** (A20 da 8ª simulação, 2026-11-06; decidido pelo princípio 3): a
    Bruna saiu avulsa a R$ 180 com a sessão do pacote livre ("Não usar —
    cobrar no atendimento" era o padrão). Escolhido o procedimento, o crédito
    dele (o mais antigo) vem escolhido, com o aviso "Incluído no pacote X
    (sessão 2 de 3). Para cobrar à parte, escolha “Não usar”." (o porquê na
    dica: "Escolhido porque o procedimento é o mesmo.") (`[data-credito-pre-escolhido]`). Como o
    app (que já usava o pacote sozinho). **O mais antigo é pela data da
    compra, de qualquer tipo** (D3 da 37ª, decisão do Claude, 27/11): o
    pacote e o pré-pago juntos, pelo dia da compra no fuso da unidade;
    empatando, o que vence antes (`creditosDoCliente`). **A frase acompanha o
    crédito escolhido à mão também** (A2 da 37ª, princípio 3); a dica é só da
    escolha automática.
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
  pagar, ficou para trás com as decisões do pacote — F2b: a rede escolhe;
  F13/r2-fin-03: no cartão, o pagamento inteiro). Com motivo, só a DISPONÍVEL
  e não agendada, por quem tem o **Financeiro em Gerenciar** (C36 da F67: era
  de quem recebe, e o caixa devolvia dinheiro por ali; como cancelar o pacote),
  com a unidade ao alcance:
  "Cancelar" no card "Procedimentos pagos" abre a janela "Cancelar sessão"
  (`CancelarUnidadePrePaga`; na tela é "sessão" — A6 da 25ª: "unidade" é a
  unidade da rede), com a conta que o BANCO fez
  (`procedimento_cancelar_unidade_devolvendo` com `p_simular`,
  `previaDoCancelamentoDaUnidade`): a venda passa a valer o vendido menos as
  unidades canceladas; o a receber que passa disso cai ANTES (a parcela
  inteira sai `Estornada`, a que cai em parte diminui); o pago além disso
  volta como quem cancela escolher — ESTORNO (o de sempre; o pagamento pego em
  parte, estorno parcial ou o pagamento inteiro estornado e o que fica lançado
  de novo, na forma escolhida — no CARTÃO só o inteiro, e os recebíveis da
  operadora dele caem pelo gatilho) ou CRÉDITO INTERNO (`internal_credits`,
  "Cancelamento da sessão 2 de Peeling" — A6 da 25ª, migration
  `20261124900004`: as recusas, o motivo do estorno e o acerto da comissão
  também dizem "sessão"; "unidade" é a da rede; o dinheiro e os pontos ficam). A
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
- **A porta é a "Nova venda" do PDV** (aba "Produto", `FormularioDoProduto` em
  `components/shared/vender.tsx`; era o "Vender" da ficha), nos dois portais,
  para quem recebe (`podeReceber`) — o "Vender" do inbox e o da busca levam a
  ela com a cliente. **Exige cliente cadastrada**: no
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
  e recebe duas vezes"). A janela tem "Adicionar produto" e o resumo "2 ×
  R$ 100,00 + 1 × R$ 90,00 = R$ 290,00". `venderProduto` recebe a lista de itens (um id
  sozinho ainda vale) e `produto_vender_itens` (migration `20261101001103`)
  grava numa transação: cada saldo travado na ordem do produto, a baixa de
  cada um pelo FEFO, a venda e os itens (`product_sale_items`: produto,
  quantidade, preço, custo e o movimento dele), a comissão (uma sobre o total, ou uma por item quando a rede comissiona por produto — r2-ven-10, `comissoes.md`) e
  o dinheiro. Sem estoque de UM, nada grava. A venda guarda o total (tabela,
  desconto, vendido, custo, unidades); as colunas de antes
  (`product_id`, `preco_unitario`, `stock_movement_id`) ficam com o PRIMEIRO
  item, e `descricao` ("2× Sérum + 1× Protetor") existe só no kit — é o
  que as Vendas, o extrato da comissão e a descrição do lançamento dizem.
  O estorno ("O produto voltou?") devolve CADA item ao saldo e aos lotes, e
  a venda estornada que não voltou é perda por produto (`metrics_perdas`).
  As vendas de antes (sem itens) seguem pelo cabeçalho. Prova:
  `e2e/vendas-produto-varios.spec.ts`.
- **As quantidades são as que quem vende escolhe** (o Heitor, 25/11, sobre os
  limites que recusavam o valor que a rede escolheu: "Se não for impossível,
  ainda que improvável, pode ser feito."). Recusava-se mais de 100 de cada
  produto, mais de 100 unidades e mais de 20 produtos numa venda. Decisão do
  Claude, 25/11: o "comum" é o teto de antes — acima dele a tela avisa ao lado
  do campo e do resumo (`[data-acima-do-comum]`) e o servidor grava; o
  impossível é o zero, o negativo, o fracionário, o acima do registro
  (`integer`: 2.147.483.647 de cada produto e na venda) e o estoque que não
  cobre (que já barra antes, "Estoque insuficiente…"). O número de produtos
  não tem limite próprio: o laço é por produto, e cada um entra uma vez,
  somado (a leitura dos produtos vai em lotes de 100 ids, por causa da URL do
  `.in()`). O valor que o registro não guarda — um pagamento acima de
  R$ 99.999.999,99 (`financial_transactions.amount`, numeric(10,2)) ou a
  venda acima de R$ 9.999.999.999,99 (`preco_tabela`, numeric(12,2)) — se
  recusa com a mensagem, em vez de estourar no banco. Uma regra só,
  `lib/vendas/quantidades.ts`, na tela e nas actions (`venderProduto`,
  `acrescentarProdutoNaComanda`, `venderProcedimento`, a devolução); no banco,
  `produto_vender_itens`, `comanda_acrescentar_item`, `procedimento_vender*` e
  os CHECKs (migration `20261207200001`). Prova:
  `tests/quantidades-da-venda-acima-do-comum.test.ts`.
- O dinheiro segue a regra única de receita (`metrics_receitas_pagas`): caixa,
  faturamento e ticket médio. O relatório de vendas ganha o tipo **Produto**
  (`metrics_vendas`: na data da venda, pelo vendido, "quem vendeu" na coluna
  Profissional).
- Pontos: só se a rede ligar (Configurações → Fidelidade → "Venda de
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
  "Devolver só parte da venda" (`[data-devolver-so-parte]`) — também no
  estorno da ficha da cliente
  (`acoes-do-lancamento-da-ficha.tsx`, D1 de 25/11: a ficha só estornava a
  venda inteira) —, que abre
  "Devolver parte da venda" (`DevolverParteDaVenda`,
  `components/shared/devolver-parte-da-venda.tsx`; `actions/devolucao-de-produto.ts`,
  a mesma permissão do estorno — o Financeiro em Gerenciar, a unidade ao
  alcance): quantas de cada produto voltam (sem teto próprio desde 25/11:
  segue a venda, e só o que passa do que a cliente ainda tem o banco recusa;
  acima de 100 restantes o campo é de número, não a lista), se voltaram ao
  estoque e a conta
  que o BANCO fez (`produto_devolver_itens` com `p_simular`; migration
  `20261106003801`) — o que volta (a parte de cada item no vendido, com o
  desconto rateado pela tabela, como a comissão por produto), o que a venda
  passa a valer, o a receber que cai antes e o que volta. O dinheiro é o fluxo
  do cancelamento da sessão do pré-pago: o a receber que passa do novo valor
  cai antes; o pago além dele volta como quem cancela escolher — ESTORNO (o
  "Estorno parcial" na mesma forma, ou, no CARTÃO, o pagamento inteiro
  estornado e o que fica lançado de novo, r2-fin-03) ou CRÉDITO INTERNO. O
  estoque: voltou, um `SALE_RETURN` das unidades, aos lotes de onde a venda as
  tirou (`private.devolver_aos_lotes`); não voltou, fica, e é perda. Cada
  devolução fica em `product_sale_returns` (com o retrato; só o servidor lê) e
  soma em `product_sale_items.devolvidas/valor_devolvido/custo_devolvido` e
  `product_sales.valor_devolvido/custo_devolvido/unidades_devolvidas`. A venda
  continua viva e passa a valer `price − valor_devolvido`: nas Vendas (valor e
  unidades), na comissão de quem vendeu (`comissao_conta`: a quitação contra o
  que a venda vale, e a linha do total ou a do item na proporção do que ficou),
  no custo do lucro (`custo − custo_devolvido`) e nas perdas (o que não voltou,
  no dia da devolução; migration `20261106003802`). **E na comanda do PDV**
  (D9 da 29ª simulação, 2026-11-25; decisão do Claude pela PR-08 e pelo
  princípio 3): `pdv_comandas` dá à comanda da venda de produto o
  `price − valor_devolvido` (era o valor de antes do estorno, e a lista dizia
  R$ 390 da venda que vale R$ 190; migration `20261205200001`), e a tela da
  comanda mostra o item pelo vendido, a linha "Devolvido: 1× Sérum −R$ X"
  (`[data-devolvido-da-venda]`, `linhaDaComanda().devolvido`) e o total do que
  vale. O que ainda está com a
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

### 9.3.4 Crédito interno VENDIDO — o "vale" (decisão 1 do Heitor sobre a 9ª simulação, 2026-11-07)

O Heitor: "concordo" com a recomendação — "'Crédito na clínica' no Vender, para
quem recebe, com a forma de pagamento; entra no caixa, no fechamento e no
faturamento no dia em que o dinheiro entrou (princípio 5), e o uso depois segue
a regra de hoje (não é receita de novo); os pontos na VENDA do crédito, pelo
dinheiro pago, não no uso; sem comissão de venda; o 'Conceder crédito' continua
como está, para o que não teve dinheiro". A Rosana pagou R$ 300 no Pix para usar
depois em qualquer coisa, e quem recebia só achou o "Conceder crédito" (fora do
caixa): os R$ 300 não entraram no caixa, no fechamento nem no faturamento.

- **A porta é a "Nova venda" do PDV**, aba "Crédito interno"
  (`FormularioDoCredito`, `components/shared/vender.tsx`; era o "Vender" da
  ficha), nos dois portais, para quem recebe (`podeReceber`) — o "Vender" do
  inbox e o da busca levam a ela com a cliente; a aba existe em toda unidade (não
  depende de catálogo). "Valor do crédito" (`parseDinheiro`) e a forma — só À
  VISTA: Pix, dinheiro, débito ou crédito em N vezes (com a bandeira), nunca
  "Crédito do cliente" (`CamposDoPagamento semCredito`). Sem "Quem vendeu":
  não há comissão de venda. A tela diz a regra ("Entra no caixa hoje… Usar
  depois não conta como receita de novo. Sem comissão de venda.",
  `[data-regra-do-credito]`). Decidido pelo princípio 5 ("sem dinheiro, sem
  crédito vendido"): o crédito vendido é o dinheiro que entrou, então não há
  crediário nem "a receber" para ele — o crédito sem dinheiro é a concessão.
- **Uma transação, `credito_vender`** (`venderCredito`, `actions/credito-interno.ts`;
  a chave do envio vale, D10): a venda (`creditos_vendidos`, só o servidor
  lê), o lançamento de receita PAGO agora ("Crédito interno", categoria
  "Crédito interno", `financial_transactions.credito_vendido_id`) e o
  crédito (`internal_credits` +valor, "Crédito interno comprado", com o
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
  cliente hoje, até o que ela pagou — o que ela já usou fica pago —, **tirado
  antes o crédito CONCEDIDO** (decisão do Claude pelos princípios, auditoria
  das regras, 2026-11-18, sobre a fala do Heitor no bônus: "não vamos fazer as
  clinicas perderem dinheiro"; migration `20261124000002`): o "Conceder
  crédito" e o bônus de OUTRA venda (`internal_credits.concedido`) são os
  últimos a ser gastos, ficam com a cliente como crédito e nunca voltam em
  dinheiro; o bônus desta venda segue a escolha de sempre. A janela
  diz "Vendido R$ 300,00 · Já usado R$ 119,00 · Volta à cliente R$ 181,00",
  e, havendo, "Crédito concedido (fica com a cliente)" (`concedido_fica`,
  `[data-concedido-fica]`; prova: `e2e/vendas-auditoria-c-dinheiro.spec.ts`).
  Voltando tudo, o estorno de sempre; voltando parte, a escolha de sempre
  (`EscolhaDaDevolucao soEstorno`): estorno parcial (o pagamento fica com o
  usado e um "Estorno parcial" leva o resto, com os pontos na proporção) ou o
  pagamento inteiro estornado e o usado lançado de novo — no CARTÃO, só este
  (r2-fin-03). O crédito que voltou sai do saldo dela (`internal_credits`
  negativo), e a venda guarda `estornado_em` e o retrato. Confirmar manda o
  "volta" que a janela mostrou (`p_esperado`); o banco recusa se mudou.
  Decidido pelo princípio 3: o crédito é um saldo só, então "o que ela não
  usou" é o saldo dela hoje, até o vendido, menos o concedido (a tela mostra
  a conta).
- **O lançamento solto não se estorna**: `estornar_transacao` recusa o da venda
  do crédito ("Este lançamento é de uma venda de crédito interno: estorne a
  venda…") — só `credito_estornar_venda` o deixa passar
  (`set_config('bellaris.estorno_do_credito', …)`), como a venda de produto.
- O **"Conceder crédito"** (`grantInternalCredit`) continua como está: fora do
  caixa, para o crédito de fora e o que não teve dinheiro.
- Prova: `e2e/vendas-credito-interno.spec.ts`.
- **O bônus no crédito** (A20 da 11ª simulação; DECIDIDO pelo Heitor,
  2026-11-10: "No estorno sai o bonus junto, a clinica decide se integral ou
  parcial" — e "não vamos fazer as clinicas perderem dinheiro"). A Marta quis
  vender R$ 500 de crédito que vira R$ 550.
  - "Bônus (opcional)" no "Crédito interno", VAZIO por padrão (princípio 6;
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
  - **No estorno o bônus SAI junto, e a rede escolhe como** (a janela
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
  acesso continua sendo a rede, na ficha (CLAUDE.md §5). Prova: o mesmo spec.

---

### 9.6 Financeiro

- **A tela são cinco abas** (Bloco Financeiro do plano de adaptação, FI1–FI8,
  2026-11-14 — o Heitor: "Nada de recurso novo: o que já existe, organizado
  pelas cinco perguntas de quem cuida do dinheiro"). Nos dois portais
  (`/admin/financeiro` e `/[slug]/financeiro`), a aba mora na URL
  (`?aba=`, `lib/financeiro/abas.ts`; a barra é `AbasDoFinanceiro`,
  `components/shared/abas-do-financeiro.tsx`), e a troca leva o período e a
  unidade da tela:
  - **Resumo** (o padrão, sem `?aba=`): o que entrou, o que saiu e o
    resultado do período (os cartões de sempre, de `lib/metrics/`); embaixo,
    "O que vem pela frente" — o a receber da cliente, o da operadora e o a
    pagar, cada um com o link para a aba dele —, o fluxo de caixa, a evolução,
    as formas e as categorias (na rede, "Por unidade"). O Resumo não lê a
    lista de lançamentos.
  - **A receber** (`?aba=a-receber`): todo o a receber em aberto das
    clientes, de qualquer vencimento, do mais antigo para o mais novo (as
    vencidas primeiro), com "Receber" (CX2) e "Remarcar vencimento"
    na linha; "Só as vencidas" é `&aberto=vencidas`. **O botão da receita é
    "Receber", o da despesa "Pagar"** (A2 da 16ª, princípio 3), e a janela diz
    quanto e de quem (`[data-receber-quanto]`: "R$ 200,00 — Paula Neves").
    Prova: `e2e/pdv-atritos-da-16.spec.ts` ("A2"). Embaixo, as parcelas da
    operadora (`#recebiveis-da-operadora`, CX6).
  - **A pagar** (`?aba=a-pagar`): toda conta a pagar em aberto, de qualquer
    mês, do vencimento mais próximo; o "Novo lançamento" lança a avulsa, a
    parcelada e a recorrente (e as Contas).
  - **Movimentações** (`?aba=movimentacoes`): o extrato do período, com o
    filtro, o estorno, o recibo, a devolução, o cancelamento da venda, o
    "Exportar CSV" e o "CSV do fechamento do dia"; os avisos das taxas
    (`[data-aviso-sem-taxa]`, `[data-taxas-estimadas]`, CX6) moram aqui.
  - **Comissões**: a página dela (`/financeiro/comissoes`), com a mesma barra;
    some quando o plano da rede não tem comissões (`temRecurso`).
  - **O topo só tem "Novo lançamento"** (FI7), para quem tem o Financeiro em
    Gerenciar. O crédito interno se concede na ficha da cliente, aba
    Financeiro ("Conceder crédito", `GrantCreditForm`, Financeiro em
    Gerenciar) — o modal "Crédito para cliente" do Financeiro saiu.
  - **Link antigo leva à aba nova** (redirect no servidor, `abaDoFinanceiro`):
    `?aberto=todos` → A receber, `?aberto=vencidas` → A receber só com as
    vencidas, `?aberto=a-pagar` → A pagar; `/[slug]/financial` segue para
    `/[slug]/financeiro`. Link novo para o Financeiro é `?aba=`.
  - O período, o filtro de unidade da rede e as permissões não mudaram:
    quem só vê lê as abas sem lançar, dar baixa nem remarcar; quem atende sem
    o Financeiro vai às Minhas comissões (a vista pessoal, SM2).
  - **As Tags nas listas** (CLAUDE.md §1, Tags — o Heitor, 13/11: "onde
    tiver for passível de filtro, um dos filtros que ela pode usar são as tags
    … além dos filtros que a gente já apresenta ali fixos em cada página"):
    A receber, A pagar e Movimentações, nos dois portais, têm o filtro "Tags"
    (`FiltroDeTags`, `components/shared/filtro-de-tags.tsx`: o
    `PickerCompacto` múltiplo ao lado dos filtros fixos da lista). A tag
    filtra PESSOAS: o lançamento entra se a cliente dele (`clients.tags`) tem
    TODAS as tags marcadas (E, como Clientes e o inbox); o lançamento sem
    cliente (a despesa, o fornecedor) sai quando há tag marcada. Decisões do
    Claude (princípios 3 e 7): o filtro vai NA CONSULTA — a cliente pelo
    embed INNER e o `cs` do PostgREST (`comAsTags`/`selectComAsTags`,
    `lib/financeiro/filtro-de-tags.ts`), lido em páginas, nunca recortando
    um lote já lido —; mora na URL (`?tags=`, `lib/tags/filtro-na-url.ts`), e
    as abas e a troca de período ou de unidade o levam junto (a aba Comissões
    também, desde que ganhou o filtro — Q04 do catálogo das Comissões,
    revisão de 24/11; `linkDaAba`, `lib/financeiro/abas.ts`); as opções são o vocabulário da rede, lido no
    servidor (`tagsAtivasDaRede`), e sem tag nenhuma na rede o filtro não
    aparece; o "Exportar CSV" e o "caixa da lista" são os da lista filtrada.
    **Os cartões e números não mudam com a tag** — o Resumo não tem o
    filtro, e os cartões do A receber e do A pagar seguem os da unidade (ou
    do recorte da rede): misturam despesa sem pessoa, e a tag recortaria só
    um lado da conta. (Nos Relatórios, a Visão geral e a aba Financeiro têm o
    filtro desde a Q05 da revisão de 24/11, e lá o lucro é o das mesmas
    linhas — `indicadores.md`.) A dica do filtro diz isso. As parcelas da operadora
    (embaixo do A receber) também não mudam. Prova:
    `tests/financeiro-filtro-de-tags.test.ts`,
    `e2e/financeiro-filtro-de-tags.spec.ts`.
  - Prova: `e2e/financeiro-abas.spec.ts`, `tests/financeiro-abas.test.ts`.

- **O que a F67 fechou (2026-11-12) — a régua de quem mexe no dinheiro**:
  - **O checkout do plano é UMA transação** (C32): o app confere (permissão,
    documentos, peças da agenda, horário, quem vendeu) e MONTA os lançamentos
    e os agendamentos; `plano_checkout` trava o plano (`for update`), confere
    que ainda é PROPOSED e grava tudo junto — desconto, lançamentos,
    agendamentos, sessões, o ACCEPTED e a comissão de venda. A segunda
    chegada (duas abas, "tentar de novo") ouve "Este plano já foi fechado.
    Recarregue a tela.". "Quem vendeu" fica no plano (`vendido_por`, A13) e a
    tela o retoma. Prova: `e2e/plano-checkout-uma-transacao.spec.ts`.
  - **O que passa pelo balcão é do PDV** (C33): receber — o atendimento, o
    plano, a parcela, a venda — é de `podeReceber`, o PDV em Gerenciar e só
    ele (PV-04, o Heitor, 2026-11-23; até o catálogo de 24/11 o Financeiro em
    Gerenciar também recebia). O plano não se recebe mais no check-in: é na
    comanda dele, no PDV (PV-01; o `receberDoPlano` saiu, inventário dos
    testes, 24/11). **A baixa NO FINANCEIRO** ("Receber"/"Pagar" da
    lista, `markTransactionPaid`) é do PDV OU do Financeiro em Gerenciar
    (`podeDarBaixa`, `lib/financeiro/so-os-meus.ts`) — CX2 do plano de
    adaptação, aprovado pelo Heitor em 13/11 ("Blz pode ser assim"): "O
    Financeiro tem a lista de tudo que falta receber, de todas as clientes, e
    dá baixa só no que entra sem passar pelo balcão (a transferência que caiu
    na conta)". Até a leva seguinte à auditoria de 18/11 a baixa era só do
    PDV (o texto do C33 dizia "em todo caminho"), contra o CX2. A quem não dá
    baixa, a lista diz "Receber é de quem tem o PDV ou o Financeiro em
    Gerenciar." Prova: `tests/financeiro-baixa-cx2.test.ts`,
    `e2e/financeiro-f67.spec.ts` ("CX2").
  - **A baixa do lançamento sem meio exige a forma** (C34), no
    `marcarPagoCore` e no `marcar_pago` do Copilot: "Escolha a forma de
    pagamento." (ficava "Não informado").
  - **O C35 saiu** (SM1, 2026-11-23): sem o "só os meus" do Financeiro, o
    `recusaDoSoOsMeus` saiu; estornar, lançar, cancelar pacote, plano e
    unidade pré-paga, dar crédito, trazer pacote de fora, devolver produto,
    remarcar e antecipar seguem só a trava de cada action (o Financeiro em
    Gerenciar) e a unidade ao alcance, em qualquer registro da abrangência.
  - **O estornado do plano não conta como recebido** (C37,
    `emAbertoDoPlano`): o que falta receber do plano saía a menos (era o
    check-in que cobrava; hoje o aviso da tela do atendimento e a comanda).
  - **Com a unidade filtrada, o "Débito no período" do Financeiro da rede é o
    da unidade** (D8 da 13ª simulação; era o da rede inteira).
  - **As telas do dinheiro assinam o SINAL `financeiro_sinais`**, não
    `financial_transactions` (a sobra da F63; migration `20261112006710`):
    Financeiro, Fechamento do dia, dashboards, relatórios e a sessão de
    atendimento. Uma linha por rede, marcada por gatilho de COMANDO
    (`trg_sinal_financeiro_ins/upd/del`, com tabela de transição: o lote marca
    uma vez); a tela recarrega pelo servidor, que aplica o alcance. A linha do
    lançamento (valor, cliente) não vai mais pelo websocket a quem o cargo
    não deixa ver. `financial_transactions` sai da publicação DEPOIS
    do deploy (`20261112006711`). Prova: `e2e/financeiro-sinal.spec.ts`,
    `tests/realtime-assina-sinal.test.ts` (trava a tabela crua num
    `RealtimeRefresher`).
  - **A sessão não lê nem grava lançamento** (F75, a sobra da F63; C1 do
    levantamento): a política "Operacional acessa financeiro da filial" era ALL
    para todo membro da unidade, sem o módulo — um membro sem o
    Financeiro lia o caixa pela chave pública, e qualquer membro gravava um
    recebimento falso. A lista do Financeiro da unidade lê pelo cliente de
    serviço, depois do `assertPermission` e do alcance
    (`assertUnidade`); a política RESTRITIVA `financeiro_so_pelo_servidor`
    (migration `20261113007503`, depois do deploy) fecha a sessão; a
    política antiga saiu de vez em 2026-11-14 (FI8, migration
    `20261115000001`). Leitura nova de lançamento é pelo servidor. Prova:
    `e2e/rls-f75-financeiro-pela-sessao.spec.ts` (com o token de cada membro).
  - Prova do resto: `e2e/financeiro-f67.spec.ts`, `tests/vendas-f67.test.ts`.
- **O que era do Fechamento do dia e é do Financeiro** (CX6, fase 4 do PDV,
  2026-11-14): nos dois Financeiros (`/admin/financeiro` e
  `/[slug]/financeiro`), para quem tem o Financeiro em Ver
  (`can(financial, VIEW)`), no período e nas unidades
  da tela: o aviso "Sem taxa da maquininha cadastrada…" (`[data-aviso-sem-taxa]`)
  e a linha "Taxas da maquininha no período (estimadas): R$ X — só para
  conferência; não saem do saldo." (`[data-taxas-estimadas]`), as duas de
  `getTaxasDoPeriodo` (`lib/metrics/queries.ts`: as contas do fechamento por
  unidade, somadas em centavos); o a receber da operadora já estava aqui; e o
  botão "CSV do fechamento do dia" (abaixo, "O CSV das movimentações"). O
  "Exportar CSV" dos lançamentos fica. Componentes em
  `components/shared/caixa-no-financeiro.tsx`. Prova:
  `e2e/pdv-fechar-o-dia.spec.ts` ("CX6"), `e2e/fechamento-do-dia-avisos.spec.ts`.
  **O DRE também avisa** (A14 da 29ª simulação, 2026-11-25; princípio 4 —
  decisão do Claude no texto): em Relatórios → Financeiro, embaixo do DRE,
  "Sem taxa da maquininha cadastrada, a taxa destas vendas é R$ 0,00 (0%) no
  DRE: Débito: 2 vendas, R$ X. Cadastre a taxa em Configurações → Comissões e
  taxas." (`[data-dre-sem-taxa]`, `avisoDoDreSemTaxa`,
  `lib/financeiro/vendas-sem-taxa.ts`), da mesma `getTaxasDoPeriodo`, e o CSV
  do DRE leva a linha "Sem taxa da maquininha cadastrada (vale 0%)". Com tag
  no filtro o aviso não sai (a conta das formas sem taxa não tem o filtro, e o
  aviso não bateria com o DRE). Prova: `tests/vendas-o-valor-que-vale-na-tela.test.ts`.
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
  desde a fase 4 do PDV (CX4, 2026-11-14) mora DENTRO do PDV:
  `/[slug]/pdv?fechar=1` e `/admin/pdv?fechar=1&unidade=` ("Fechar o dia" no
  topo do PDV; o item "Fechamento do dia" do menu leva lá; os caminhos antigos
  `/[slug]/fechamento` e `/admin/fechamento` são redirect), corpo em
  `app/_shared/fechamento-do-dia.tsx` e `components/shared/fechamento-do-dia-tela.tsx`.
  O dia da unidade por forma de pagamento — entradas (a regra de
  `metrics_receitas_pagas`), saídas pagas e saldo, com o total, tudo de
  `metrics_fechamento_do_dia` (`getFechamentoDoDia`) —, o dinheiro em espécie
  esperado (o saldo de `CASH`), a contagem e quem fechou.
  - **A conferência por forma** (CX4): uma tabela, uma linha por forma —
    Registrado × Conferido × Diferença. O registrado do Dinheiro é o esperado
    na gaveta (com o fundo de troco, que fica na linha do Dinheiro); o das
    outras formas, o saldo do dia. O Dinheiro é obrigatório (em branco = R$ 0
    quando não houve dinheiro, A50); as outras formas são OPCIONAIS — em
    branco é "não conferido" (princípio 4: nunca vira zero nem o registrado).
    `fecharODia` recebe os conferidos (forma → valor ou nulo), confere que a
    forma é do dia (`conferidoValido`, `lib/financeiro/conferencia-do-fechamento.ts`)
    e grava só os preenchidos em `fechamentos_do_dia.conferido` (jsonb,
    migration `20261113008301`; o Dinheiro segue em `contado_dinheiro`). Os
    pontos e o "Sem forma" não se conferem, e **a forma só com saída também
    não** (A8 da 16ª: o Pix com R$ 120 de saída e nenhuma entrada ficava "não
    conferido" sem ter o que conferir) — a não ser que já tenha sido
    conferida no último fechamento. A linha da forma diz o estornado de um
    pagamento de HOJE ("R$ 320,00 estornado de um pagamento de hoje: já fora
    das entradas", `[data-estornado-hoje]`, `estornadoNoMesmoDiaPorForma`,
    A3 da 16ª): a regra de que no mesmo dia um anula o outro continua, e a
    tela a diz. Depois de fechar, cada linha
    mostra o último conferido e a diferença contra o registrado do RETRATO
    daquele fechamento ("Bateu", "Faltou R$ X", "Sobrou R$ X", "não
    conferido"); "Fechar de novo" reabre com os valores do último. Enquanto
    se confere, a diferença acompanha o que se digita — a MESMA conta do
    fechamento, conferido − registrado em centavos (`diferencaAoDigitar`;
    A3 da 19ª: a linha seguia "a conferir" até fechar); o que vale é o que o
    servidor grava ao fechar.
    **O registrado mudou depois do fechamento** (D2 da 17ª, princípios 3 e
    4): a linha não diz "Bateu" juntando o registrado de agora com o
    conferido de antes — a diferença diz "a conferir · mudou depois do
    fechamento", e o conferido diz "às HH:MM, quando o registrado era R$ X"
    (`linhasDaConferencia`: `mudouDepois`, `registradoNoFechamento`; o
    dinheiro compara o `esperado_dinheiro` do fechamento, as outras formas o
    saldo do retrato). Prova: `e2e/pdv-fechar-o-dia.spec.ts`.
    **O CSV do fechamento diz o mesmo** (D2 da 21ª): a Situação do dia
    fica "a conferir · mudou depois do fechamento", e a seção "Conferência
    do último fechamento" traz Forma, Registrado, Conferido e Diferença pela
    MESMA `linhasDaConferencia` (`fechamentoGravadoDaLinha`) — nunca "Bateu"
    com o registrado de agora.
    18ª simulação (princípios 3 e 4; `tests/pdv-caixa-da-18.test.ts`):
    - o conferido de uma forma que não é dinheiro pode ser NEGATIVO (o Pix
      que saiu mais do que entrou: "−210,00" ou "-210,00",
      `lerConferidoDoCampo`); a tela diz "confira com o sinal de menos"
      (`[data-conferido-negativo]`) e o servidor aceita
      (`conferidoValido`) — nunca um "Sobrou" contra um número recusado (D3);
    - o conferido de uma forma não tem teto de R$ 10.000.000 (o Heitor, 25/11:
      "Se não for impossível, ainda que improvável, pode ser feito."; recusava
      acima, em módulo, com uma mensagem que não dizia o limite): acima de
      R$ 10.000.000, em módulo (o teto de antes, o comum — decisão do Claude,
      25/11), a célula avisa (`avisoDoConferido`,
      `[data-acima-do-comum="conferido"]`) e o servidor grava. O impossível:
      `conferido` é jsonb (sem tipo), então o limite é o dos centavos exatos
      na conta (R$ 90.071.992.547.409,91, o maior inteiro seguro do JavaScript
      em centavos); o vazio que não é número diz "Informe o valor conferido ou
      deixe em branco.";
    - "Fechar de novo" traz em branco a linha que mudou depois do fechamento
      (`valoresParaFecharDeNovo`): o conferido de antes não vale para o
      registrado de agora (A2);
    - "Estornos do dia: R$ X" numa linha própria do resumo
      (`[data-estornos-no-resumo]`), não colado ao "por quem recebeu" (A3);
    - a forma estornada no mesmo dia (entrada e estorno se anulam) continua
      na tabela, com zero, para conferir (`linhasDaConferencia` recebe
      `estornadoHoje`, de `estornadoNoMesmoDiaPorForma`) — sumir a linha
      escondia o que aconteceu (A4).
  - É o dinheiro da UNIDADE inteira (D6 da simulação de 2026-10-27): vê
    quem tem o PDV em Gerenciar ou o Financeiro em Ver (`podeVerFechamento`
    em `lib/auth.ts`, `veFechamento` em `lib/menu.ts` — a página, o menu e a
    busca; sem o "só os meus", SM1, 2026-11-23); FECHA quem recebe e vê
    (`podeReceber` + `podeVerFechamento`, `fecharODia` em
    `actions/fechamento.ts`). A vista pessoal "Minhas comissões" (SM2) não
    abre o Fechamento. É a tela de quem só tem `cashier`. Quem vê e não
    fecha lê na tela "Só para ver: conferir e fechar o dia é de quem tem o
    PDV." — a mesma frase do resumo do cargo (`FECHAMENTO_SO_PARA_VER`,
    `fechamentoNoResumo`; A26 da 32ª, princípio 3).
  - Cada fechamento é um REGISTRO em `fechamentos_do_dia` (com o retrato do
    resumo, refeito no servidor; a diferença é coluna gerada). Fechar de novo
    não apaga o anterior — vale o mais recente. Dia futuro não fecha.
  - **Os avisos são DOIS** (CX5, 2026-11-14; eram cinco desde a J-49):
    (1) "Há N comanda(s) aberta(s)" — as comandas abertas do PDV da unidade
    (`comandasDoPdv`), com o link para `?ver=ABERTAS` a quem recebe; e (2)
    "Houve movimento depois do fechamento das HH:MM (entrou R$ X e saiu
    R$ Y): confira e feche de novo" — movimento pago depois de `fechado_em`
    (`metrics_avisos_do_fechamento`, `getAvisosDoFechamento`). O que entrou e
    o que saiu é o dia de agora contra o retrato do fechamento
    (`movimentoDepoisDoFechamento`, `textoDoMovimentoDepois`): o estorno é
    "saiu", não "entrou dinheiro" (A3 da 17ª). Saíram do fechamento: a lista "Concluídos a
    receber" (o concluído sem pagamento é comanda aberta, CX3), as parcelas
    em aberto, a espécie negativa (a linha do Dinheiro já mostra o registrado
    negativo), o a receber da operadora, a venda sem taxa e as taxas
    estimadas — as duas últimas moram no Financeiro (CX6, abaixo), e o a
    receber da operadora já morava lá. "Por quem recebeu" e "Estornos do dia"
    ficam num `<details>` recolhido, "Detalhes do dia"
    (`[data-detalhes-do-dia]`). Prova: `e2e/fechamento-do-dia-avisos.spec.ts`,
    `e2e/pdv-fechar-o-dia.spec.ts`.
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
    registrado do Dinheiro só fica negativo quando o esperado COM o fundo
    fica negativo, e o fechamento guarda o fundo no
    retrato (`fechamentos_do_dia.fundo_de_troco`). Sem fundo, tudo segue
    como antes. Migration `20261101001108`.
    Prova: `e2e/fechamento-do-dia-fundo-de-troco.spec.ts`.
    **Sem teto de R$ 1.000.000** (o Heitor, 25/11: "Se não for impossível,
    ainda que improvável, pode ser feito."; o servidor recusava acima com uma
    mensagem que não dizia o limite): acima de R$ 1.000.000 (o teto de antes,
    o comum — decisão do Claude, 25/11) o campo avisa
    (`avisoDoFundoDeTroco`, `[data-acima-do-comum="fundo-de-troco"]`) e o
    servidor grava. O impossível é o registro do fechamento:
    `fechamentos_do_dia.esperado_dinheiro`/`contado_dinheiro` são
    `numeric(12,2)`, até R$ 9.999.999.999,99 (`LIMITE_DO_DINHEIRO_DO_FECHAMENTO`,
    `recusaDoFundoDeTroco`, `recusaDoDinheiroContado`,
    `lib/financeiro/conferencia-do-fechamento.ts`); e o "Fechar o dia" cujo
    esperado (fundo + o dia) passaria disso recusa com "O dinheiro esperado na
    gaveta passa de R$ 9.999.999.999,99 (o limite do registro): confira o
    fundo de troco." (`recusaDoEsperadoNaGaveta`). Prova:
    `tests/fundo-de-troco-e-conferido-acima-do-comum.test.ts`.
  - O que a operadora do cartão ainda vai depositar (A44 da 7ª simulação)
    saiu do fechamento no CX5: mora só no Financeiro
    (`#recebiveis-da-operadora`, F20 D3).
  - **Os atritos do Fechamento da 8ª simulação** (2026-11-06; princípio 3):
    - **Os estornos do dia aparecem** (A42; nos "Detalhes do dia" desde o
      CX5): "Estornos do dia · R$ 397,00" (`[data-estornos-do-dia]`) lista cada estorno pago no dia (a descrição,
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
      (no Financeiro, CX6) traz "Pagamento de" e "Nas saídas do dia". Prova:
      `e2e/financeiro-dinheiro-da-12.spec.ts`.
    - **Os estornos do dia são o que voltou às CLIENTES** (D3 da 12ª; sobra da
      F38): o estorno de uma DESPESA (a energia paga duas vezes) aparecia como
      "O que voltou às clientes", com "− R$ 780,00" — o dinheiro voltou ao
      CAIXA. Ele sai da lista (e do CSV); no outro dia, é ENTRADA do caixa na
      forma dele (no mesmo dia, um anula o outro). A linha do Financeiro do
      contra-lançamento de uma despesa diz "Anula a despesa estornada"
      (`[data-anula-a-despesa]`). O estorno do uso do crédito interno
      também sai (não é dinheiro do caixa). **E por isso quem só tem
      o PDV não lê no Fechamento a descrição nem o motivo de uma
      despesa** (A39 da 12ª): as saídas aparecem só pela forma; a descrição e
      o motivo da despesa ficam no Financeiro, de quem o tem. Prova: o mesmo
      spec ("D3", "A39").
    - **O da rede abre na unidade com movimento e mostra a rede toda**
      (A45): com duas ou mais, "O dia na rede" (`[data-fechamento-da-rede]`)
      — cada unidade com as entradas e as saídas do dia (ou "Sem movimento"),
      a aberta marcada, e o "Total da rede" (`getMovimentoDasUnidades`, a
      conta do Fechamento por unidade); sem `?unidade=`, abre na primeira que
      teve movimento (era a primeira em ordem alfabética). Fechar continua por
      unidade.
    - O "a receber de qualquer dia" (A48) saiu com a lista dos concluídos
      a receber (CX5).
    - Prova: `e2e/financeiro-atritos-da-8.spec.ts`.
  - **Por quem recebeu** (A40 da 11ª simulação, 2026-11-10; nos "Detalhes do
    dia" desde o CX5; princípio 3: a
    Elaine e a Fabiana no caixa da Azaleia, e cada uma precisava saber o que
    entrega): o quadro "Por quem recebeu" (`[data-por-quem-recebeu]`) lista as
    entradas do dia de cada pessoa, por forma, e o total dela — o mesmo conjunto
    do resumo (a regra única de receita), contado no banco
    (`metrics_fechamento_por_quem_recebeu` → `getFechamentoPorQuemRecebeu`,
    `lib/metrics/fechamento-extra.ts`). Quem recebeu é
    `financial_transactions.recebido_por` (migration `20261110005601`): no
    lançamento que já nasce pago, quem o lançou (o gatilho
    `trg_lancamento_guarda_o_pagamento`, pelo `created_by`); na baixa depois
    (a parcela do crediário, o atendimento concluído, o plano — hoje no PDV), quem
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
- **O atendimento CONCLUÍDO a receber é uma comanda aberta do PDV** (D5 da
  simulação de 2026-10-27; desde CX3/PDV7, a revisão do Heitor de
  2026-11-13: "Os 'Concluídos a receber' viram as comandas abertas do PDV
  (sai a lista à parte na agenda, no Fechamento e na ficha)" e "Sai a
  cobrança da conclusão do atendimento como porta própria (vira a comanda)").
  A conta é UMA, no banco
  (`atendimentos_a_receber`, `getAtendimentosAReceber` em
  `lib/metrics/a-receber.ts`): concluído, com preço, avulso (sem plano, sem
  sessão de pacote, sem unidade pré-paga) e sem recebimento pago — o mesmo
  conjunto que `confirmar_pagamento_do_atendimento` aceita. Ela alimenta:
  - a janela da agenda (`situacaoDaCobranca`, `actions/a-receber.ts`, que
    devolve a comanda do atendimento): "Receber no PDV", que abre a comanda no
    PDV da unidade dela (`rotaDaComanda`, `lib/rotas.ts`: `/pdv?unidade=…&comanda=…`,
    pelos dois portais); a quem não recebe, "Pagamento a receber no PDV.". Era
    o "Receber pagamento", que levava à tela do atendimento com `?receber=1`;
  - a tela do atendimento concluído não tem mais janela de pagamento (saíram
    o `PaymentModal`, o "Confirmar pagamento" e o `?receber=1`): a quem recebe,
    o "Receber no PDV" leva à comanda (`comandaId`, lido em
    `sessao-de-atendimento.tsx`). Tudo o que a janela fazia o PDV faz — o mesmo
    `FormularioDeReceberAtendimento`: abater do pacote (D9), desconto e motivo,
    voucher, pontos, maquininha, vezes, bandeira, saldo do crédito interno e o
    combinado do contrato;
  - (o Fechamento do dia listava os "Concluídos a receber" até o CX5,
    2026-11-14: hoje o concluído sem pagamento é comanda aberta do PDV, e o
    fechamento só avisa quantas há);
  - a ficha da cliente: não lista mais (saiu o "Atendimentos a receber"):
    o resumo "N comanda(s) aberta(s) no PDV · R$ X" (`ComandasAbertasDaFicha`,
    `[data-comandas-abertas]`) e, a quem recebe, o "Receber no PDV" para a
    comanda mais antiga numa unidade ao alcance (`comandaParaReceber`, em
    `financeiroDaFicha`); a quem não recebe, "Recebe-se no PDV, com quem tem o
    PDV em Gerenciar." (PV-04);
  - a "Nova venda" do PDV (aba Procedimento, `aReceber`; era o "Vender" da
    ficha), que avisa quando há um a receber do MESMO procedimento (cobraria
    duas vezes) e leva à comanda dele.
  Quem recebe é quem tem o PDV em Gerenciar (`podeReceber`; PV-04, 24/11),
  na ficha, na agenda, na tela do atendimento e em `confirmPayment`.
  Prova: `e2e/financeiro-a-receber-concluido.spec.ts`.
- **A aba Financeiro da ficha da cliente** é UMA leitura nos dois portais
  (`financeiroDaFicha`, `lib/clientes/financeiro-da-ficha.ts`): os
  lançamentos da cliente, os totais do banco (`metrics_financeiro_do_cliente`
  — pago pela regra de receita, a receber = lançamentos em aberto + os
  concluídos a receber sem lançamento, e o crédito interno) e os
  atendimentos a receber. Abre a quem tem o Financeiro em Ver ou recebe
  (`podeReceber`), e mostra tudo da cliente (o recorte "só os próprios" da D6
  de 27/10 saiu com a SM1, 2026-11-23). A aba somava na tela as últimas 50 linhas.
  **As Transações saem em ordem e cabem no celular** (D7 da 10ª simulação,
  2026-11-10; princípio 3): a tabela de cinco colunas rolava de lado a 412 px
  (695 px num espaço de 378), escondendo o valor, a forma e o "Vencida em", e
  as parcelas gravadas no mesmo instante saíam embaralhadas (3/3, 1/3, 2/3,
  entrada). No celular cada lançamento é um cartão (`cards-mobile`), e a ordem
  é a da data que a LINHA MOSTRA, da mais nova para a mais antiga — o dia do
  atendimento, senão o lançamento; no empate, a parcela maior primeiro
  (`ordenarTransacoesDaFicha`, `lib/clientes/ordem-das-transacoes.ts`). Prova:
  `e2e/ficha-atritos-da-10.spec.ts` ("D7"), `tests/ordem-das-transacoes.test.ts`.
  **As parcelas em aberto vêm primeiro, em ordem de vencimento** (item 17 do
  escopo de 18/11; o Heitor: "ok"): o a receber (nem pago, nem estornado, nem
  estorno) abre a lista, do vencimento mais antigo ao mais novo — a vencida, ou
  a mais próxima, primeiro; sem vencimento, depois; no empate, a parcela menor
  —, e o resto segue a ordem do D7. A vencida e não paga fica em destaque: a
  linha com o fundo de alerta (`var(--danger-soft)`, `[data-vencida-da-ficha]`)
  e o chip "Vencida há 4 dias" (`vencidaHaEmTexto`; os dias vêm do servidor,
  `diasVencida` em `financeiroDaFicha`, de dia a dia no fuso da unidade —
  `diasAteOVencimento`); a data fica na coluna ao lado ("Vence 14/11/2026").
  Prova: `tests/ordem-das-transacoes.test.ts`, `tests/financeiro-vencida.test.ts`,
  `e2e/ficha-atritos-da-10.spec.ts`.
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
- O módulo `cashier` **é o PDV** (o rótulo na tela de Cargos, `MODULE_LABELS`
  em `lib/permissions.ts`; só "Sem acesso" ou Gerenciar): vender e receber —
  a "Nova venda", a comanda do atendimento e do plano, as parcelas — e o
  Fechamento do dia. Abre a tela do PDV (`/[slug]/pdv`, `/admin/pdv`; o
  item "PDV" do menu, `recebe` em `lib/menu.ts`) e o "Fechamento do dia"
  (`/pdv?fechar=1`, `veFechamento`). O financeiro da unidade e o da rede
  continuam pedindo `financial`. `podeReceber` (`cashier` OU `financial` em
  Gerenciar) é o gate de quem vende e recebe — também da página do PDV. A
  baixa no Financeiro (CX2) é `podeDarBaixa`: a mesma régua, sem o "só os
  meus" do Financeiro.
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
  2026-11-01): a RLS mostrava a ficha só à unidade de CADASTRO, e a venda da
  cliente de outra unidade saía com "—" (regra em `atendimento.md` §9.1). Desde
  2026-11-18 a RLS de `clients` confere a REDE (migration `20261124200001`);
  o contorno pelo servidor ficou.
  Prova: `e2e/agenda-nomes-de-outra-unidade.spec.ts`.
  - **"A receber" e "A pagar" valem pelo VENCIMENTO e dizem isso** (A34,
    2026-10-27): os dois cartões (unidade e rede, e cada unidade no recorte da
    rede) vêm de `getEmAberto` (`metrics_em_aberto`): em aberto com a data de
    referência no período, até o FIM dele (o "A receber" ia só até agora), e o
    PRÓXIMO vencimento depois do período. O cartão diz "Pelo vencimento, no
    período." e, com zero, "Próximo: R$ 300,00 em 05/11"
    (`NotaDoVencimento`). O "A pagar R$ 0" com a conta vencendo no mês
    seguinte parecia conta sumida. Prova: `e2e/financeiro-a-pagar-vencimento.spec.ts`.
    O cartão do a pagar diz o recorte no TÍTULO, "A pagar · vence no período"
    (`ROTULO_DO_A_PAGAR`, `lib/financeiro/abas.ts`), e o total de baixo, "Em
    aberto, de qualquer vencimento: R$ X" — a aba A pagar lista todos, e o
    cartão com outro número parecia errado (A6 de 25/11; os nomes são decisão
    do Claude).
  - **O "A receber" diz também todo o crediário** (D-14, decisão do Heitor,
    2026-10-29): o cartão mantém o número do mês e, abaixo, "Em aberto, todos
    os vencimentos: R$ X" — todas as parcelas e recebíveis em aberto, de
    qualquer vencimento (`metrics_a_receber_em_aberto` → `getAReceberEmAberto`:
    o conjunto do "a receber" de `metrics_em_aberto`, sem a janela; migration
    `20261029001105`). Nos dois financeiros (a rede, cada unidade no recorte e
    a unidade), nas unidades ao alcance. Prova: `e2e/financeiro-a-receber-todos-os-vencimentos.spec.ts`.
- **O fluxo de caixa dos PRÓXIMOS meses** (r2-fin-04, o Heitor, 2026-11-03:
  "crie o gráfico"). Nos dois financeiros, o cartão "Fluxo de caixa — próximos
  6 meses" (`FluxoDeCaixa`, `components/shared/fluxo-de-caixa.tsx`) — **3, 6 ou
  12 meses, a rede escolhe no cartão** (r3-f13-11, o Heitor: "quem vende
  pacote em 10x quer ver o ano"; 6 por padrão, o título acompanha: o servidor
  manda os 12, a tela mostra os primeiros N): por mês
  (Brasília, a partir do atual), o que ENTRA — o "A receber · em aberto" (os
  lançamentos de receita em aberto, com e sem cliente; o Heitor, 25/11, "3
  sim": o nome do cartão, era "A receber da cliente") e o que a operadora do cartão ainda
  deposita (`recebiveis_do_cartao` vivos e não recebidos), empilhados — e o que
  SAI (as despesas a pagar), pelo vencimento, num gráfico de barras e numa
  tabela com o saldo de cada mês. O que já venceu e está em aberto conta no
  mês atual. A conta é `metrics_fluxo_de_caixa` → `getFluxoDeCaixa`
  (`lib/metrics/fluxo-de-caixa.ts`; migration `20261103001307`); na rede, o
  do recorte e o de cada unidade (o filtro de unidade troca o gráfico). Os
  concluídos sem pagamento (sem lançamento, sem vencimento) não entram. Prova:
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
  (e do Resultado da rede) "É o resultado do período: a receita e a despesa
  pelo que foi pago; o insumo quando é usado; o custo do produto quando ele é
  vendido, mesmo a receber; a comissão quando é lançada. O total da lista de
  lançamentos é o caixa." (`[data-base-do-resultado]`, `ContaDoResultado`; o
  "competência" saiu na D4 da 10ª, `indicadores.md`).
  Em Relatórios → Financeiro, o cartão é "Despesas pagas (caixa)", com o
  detalhe de que entram a compra de estoque e o pagamento das comissões (o DRE
  usa só a operacional). Prova: `e2e/financeiro-ficha-e-app-da-9.spec.ts` ("A31").
  **E é o caixa de verdade** (D9 e D2 da 12ª simulação, 2026-11-11; princípio
  3): "13 lançamentos · caixa da lista R$ 3.383,64" ao lado da receita de
  R$ 3.203,64 — os R$ 180 pagos com crédito interno entravam, e a própria
  linha dizia "não é receita". Cada lançamento conta no caixa o que o BANCO diz
  (`metrics_caixa_dos_lancamentos` → `getTaxaDosLancamentos`, `no_caixa`): o
  pagamento pelo valor que entrou, o estorno ligado com o sinal dele, e nada o
  em aberto, o uso do crédito interno (e o estorno dele) e o pago todo em
  pontos — a mesma régua do Fechamento (`metrics_movimentos_pagos`). Somado na
  lista do dia, é o saldo do Fechamento do dia (`resultadoDaLista` soma o
  `no_caixa`; sem ele, a regra de antes, sem o crédito interno). Prova:
  `e2e/financeiro-dinheiro-da-12.spec.ts` ("D9"), `tests/metrics-resultado-da-lista.test.ts`.
- **O "Em aberto, todos os vencimentos" leva à baixa** (A38 da 8ª simulação,
  2026-11-06): a parcela do crediário que vence no mês que vem não aparecia em
  Lançamentos (a lista é do período, pela data de referência), e não se via
  onde dar baixa. O cartão "A receber da cliente" diz "Ver e receber" (era
  "Ver e dar baixa" até a A25 da 24ª), que
  abre a lista com TODO o a receber em aberto, de qualquer vencimento
  (desde o FI3, a aba A receber, `?aba=a-receber`; `[data-so-o-em-aberto]`,
  nos dois financeiros), com o "Pagar" na linha.
  **A quem só vê, "Ver a lista"** (A42 da 12ª simulação, 2026-11-11; princípio
  3: a Ivone, que só vê o Financeiro, lia "Ver e dar baixa" e "use “Pagar” na linha" sem
  botão nenhum): sem a baixa (`canPay`), o link é "Ver a lista" e a faixa diz
  "Receber é de quem tem o PDV ou o Financeiro em Gerenciar." (`NotaDoVencimento
  podeDarBaixa`). **E o a PAGAR também** (A43 da 12ª): o cartão "A pagar" diz
  "Em aberto, todos os vencimentos: R$ 5.200,00 · Ver e pagar" (ou "Ver a
  lista") — `metrics_a_pagar_em_aberto` → `getAPagarEmAberto` (migration
  `20261111006103`), o espelho do a receber —, que abre a lista de toda conta a
  pagar em aberto, de qualquer mês (a aba A pagar, `?aba=a-pagar`, nos dois financeiros).
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
  - As listas dos dois financeiros dizem "Vencida em 05/11"
    (`SituacaoDoEmAberto`, `[data-vencida]`), e a aba Financeiro da ficha
    "Vencida há N dias" (item 17 do escopo de 18/11, acima em "A aba Financeiro
    da ficha"); a lista da unidade tem a situação "Vencidas" no filtro.
  - O cartão "A receber da cliente" diz "Vencidas: R$ 1.294,00 (1 parcela,
    desde 05/11) · Ver as vencidas" (`[data-vencidas]`), que abre a lista só
    das vencidas, de qualquer mês (`?aba=a-receber&aberto=vencidas`, nos dois financeiros).
  - O dashboard (da unidade e da rede, a quem vê o financeiro inteiro) avisa
    "1 parcela vencida da cliente: R$ 1.294,00 (a mais antiga venceu em
    05/11)… Ver no Financeiro" (`ParcelasVencidas`, `[data-parcelas-vencidas]`).
  - O app (Financeiro e Histórico → Pagamentos) diz "Vencida em 05/11" e a
    situação "Vencida".
  - **O check-in avisa, sem recusar**: quem marca "Chegou" lê
    "Mariana tem 1 parcela vencida (R$ 1.294,00, desde 05/11): receba no
    PDV." (`updateAppointmentStatus`/`checkinAppointment` devolvem
    `aviso`, só para quem recebe; `lib/appointments/vencidas-na-chegada.ts`).
    O check-in não cobra nada: a parcela e o plano se recebem no PDV (PV-01).
  - Prova: `e2e/financeiro-vencidas-da-9.spec.ts`, `tests/financeiro-vencida.test.ts`.
- **Remarcar o vencimento** (A37 da 9ª simulação): a parcela do crediário só
  tinha "Pagar". Quem tem o Financeiro em Gerenciar (com a unidade ao
  alcance) tem "Remarcar vencimento" na linha em aberto dos dois
  financeiros (`RemarcarVencimento`, `remarcarVencimento` em
  `actions/financial.ts`): o novo dia e um motivo opcional, gravados por
  `lancamento_remarcar_vencimento` (migration `20261107004404`), que guarda o
  histórico no lançamento (`vencimentos_anteriores`: de, para, quem, quando,
  motivo). A linha diz "Vencimento remarcado: era 05/11 (Lúcia, em 07/11 —
  combinado com a cliente)" (`[data-vencimento-remarcado]`). O pago e o
  estornado não se remarcam. Prova: `e2e/financeiro-vencidas-da-9.spec.ts` ("A37").
- **O CSV das movimentações** (A44 da 8ª: quem só via o Financeiro só tinha o de Comissões):
  "Exportar CSV" na lista dos dois financeiros — o que a lista tem, com os
  filtros da tela (na rede, todas as movimentações do recorte, não só as 100
  que a tabela desenha), com Data; Descrição; Cliente; (Unidade;) Categoria;
  Tipo; Forma; Situação; Valor — o valor com sinal (despesa e estorno
  negativos), ponto e vírgula e BOM (`csvDosLancamentos`,
  `lib/financeiro/csv-dos-lancamentos.ts`; o arquivo
  "lancamentos-AAAA-MM-DD-a-AAAA-MM-DD.csv"). Prova: o mesmo spec,
  `tests/financeiro-csv-dos-lancamentos.test.ts`.
  **E é o pacote da contabilidade** (A31 da 10ª simulação, 2026-11-10: a Lúcia não
  fechava o mês com o que exportava): o CSV ganhou Taxa da maquininha e Líquido
  (da receita paga, pela MESMA conta do lucro — `metrics_taxa_dos_lancamentos`,
  `getTaxaDosLancamentos`, `lib/metrics/contadora.ts`), Vencimento, Pago em,
  Fornecedor e Nota fiscal. O "Novo lançamento" pede "Fornecedor" (na despesa)
  e "Nota fiscal" (`financial_transactions.fornecedor`/`nota_fiscal`, migration
  `20261110005102`; os três caminhos do lançamento os gravam). A "competência"
  pedida não existe como regra (a despesa entra quando é paga — `indicadores.md`):
  o CSV dá o vencimento e o dia do pagamento, e a contabilidade monta a dela. E se
  exportam também o **DRE** (Relatórios → Financeiro, "Exportar o DRE (CSV)":
  as linhas do DRE e o que fica FORA do resultado — as compras no estoque, ao
  custo, com fornecedor e nota, e as perdas —, `csvDoDre`) e o **Fechamento do
  dia** (as formas, o total, o esperado em espécie e os estornos,
  `csvDoFechamento`; os dois em `lib/financeiro/csv-da-contadora.ts`). Desde o
  CX6 (2026-11-14) o CSV do Fechamento sai do FINANCEIRO, não do fechamento:
  o botão "CSV do fechamento do dia" (ao lado do "Exportar CSV", nos dois
  portais) abre uma janela com o Dia (e a Unidade, quando há mais de uma) e
  baixa pelo servidor (`csvDoFechamentoDoDia`, `actions/fechamento.ts` — a
  mesma conta de antes; vê quem tem o Financeiro em Ver,
  `can(financial, VIEW)`; unidade ao alcance).
  A compra e a perda chegam a quem tem o Financeiro sem o Estoque: embaixo do DRE,
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
  o desconto e quem atendeu): as colunas Unidade (sempre, também na rede de
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
  gráfico, o "Custo do lucro"). A conta não mudou. A Dica do cartão diz
  QUANTO de cada (`DespesasDoCaixa`, `components/shared/despesas-do-caixa.tsx`:
  "Deste valor, R$ X do pagamento das comissões e R$ Y da compra de estoque
  ficam fora do Lucro Líquido…", pelos números de `estoqueNoResultado`), nos
  dois financeiros e no recorte de cada unidade — despesas maiores que o
  faturamento com lucro positivo parecia conta errada (A5 de 25/11; o texto é
  decisão do Claude). E **o valor não parte o
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
- **O uso do crédito interno diz que não é receita** (A37 da 11ª): a linha
  "Receita · Pago · + R$ 130,00" do pagamento com `INTERNAL_CREDIT` ganha "Uso
  do crédito interno: não é receita — o caixa foi quando o crédito foi
  comprado…" (`notaDoUsoDeCredito`, `[data-uso-de-credito]`). A regra F7 fica.
- **O lançamento do atendimento diz o procedimento** (A26 da 24ª;
  princípio 3): "Atendimento concluído" vira o nome do procedimento do
  agendamento ("Preenchimento labial", "Limpeza de pele — saldo") nas
  Movimentações dos dois financeiros, no CSV delas e nas parcelas a receber
  da operadora — lido na hora pelo `appointment_id` (`comOProcedimento`,
  `parcelasComOProcedimento`, `lib/financeiro/procedimento-do-lancamento.ts`;
  a troca é `descricaoComOProcedimento`). A descrição gravada não muda.
- **O cartão da operadora tem o em aberto em destaque** (A27 da 24ª), como o
  da cliente: o número grande é o que a operadora ainda vai depositar, e o
  total do período fica embaixo (`NotaDoVencimento noTopoOEmAberto`).
- **O "A receber da operadora" diz o débito** (A38 da 11ª; princípio 4: o
  débito e o Pix não têm prazo configurado): "Débito no período: R$ 540,00 —
  conta como recebido no dia da venda" (`NotaDoDebito`,
  `[data-debito-no-periodo]`, o débito da composição por forma,
  `metrics_financeiro_composicao`), nos dois financeiros. Prova (A36–A38):
  `e2e/financeiro-atritos-da-11.spec.ts`, `tests/financeiro-notas-do-lancamento.test.ts`.
- **"Remarcar vencimento" com a palavra, também na ficha** (A22 da 10ª; sobra
  da A37 da 9ª): o botão da lista dos dois financeiros diz "Remarcar
  vencimento" (era só o ícone), e a parcela em aberto da aba Financeiro da
  ficha o tem para quem remarca (o Financeiro em Gerenciar).
  Prova: ("A22").
- **As Vendas fazem a ponte com o caixa** (A30 da 10ª; princípio 5): embaixo
  dos cartões de Relatórios → Vendas, "O Total vendido é a venda, no dia em
  que foi feita; o caixa do período é o dinheiro, no dia em que entrou: R$ X
  (Financeiro). A diferença é a regra…" — o crédito interno vendido, o
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
  **E fecha a cada lançamento salvo**, o segundo seguido também (D3 de 25/11):
  o modal fechava pelo `state.success`, que no segundo envio já era `true` e
  não mudava; agora reage a cada estado novo do `useActionState`
  (`financial-transaction-modal.tsx`).
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
  (caixa e lucro), como a "Material de consumo (limpeza, copa)" (A22 da 17ª
  simulação: o material de limpeza caía em "Outro"); só a "Compra de estoque"
  fica fora do lucro (`lib/financeiro/categorias.ts`, a lista única da tela e
  do Copilot). A lista vem pela ordem do uso (A28 da 24ª): "Compra de
  estoque", "Salários", "Aluguel", "Contas…", "Marketing", "Material de
  consumo…", "Manutenção", "Equipamentos", "Fornecedores", "Material de
  escritório" e, por último, "Outro". Prova: `e2e/financeiro-despesa-sem-desconto.spec.ts`,
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
    total)` em `CamposDoPagamento`; o checkout do plano também — o receber do plano no check-in saiu: o plano se recebe no PDV, PV-01). O SERVIDOR recusa com a mesma frase
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
- **A despesa parcelada ou recorrente em quantas vezes a rede quiser** (o
  Heitor, 25/11, à pergunta se o "no máximo, avisar" do princípio 2 vale para
  os limites da despesa: "Se não for impossível, ainda que improvável, pode ser
  feito."). Era recusada acima de 48 parcelas e de 60 repetições; agora, acima
  disso (o comum), a tela avisa ao lado do campo ("Acima do comum (mais de 48
  parcelas). Confira: o valor vale como está.", `[data-aviso-das-parcelas]`,
  `[data-aviso-das-repeticoes]`) e o servidor grava. **O impossível** (decisão
  do Claude, 25/11): menos de 2, fração (o `parseInt` cortava "1.5" em 1,
  calado) e a última data a mais de 100 anos — cada parcela ou repetição é um
  lançamento com a sua data: 1.200 parcelas (mensais, `LIMITE_DE_MESES`); as
  repetições, pela frequência (5.214 semanais, 1.200 mensais, 100 anuais —
  `limiteDasRepeticoes`). A regra é UMA,
  `lib/financeiro/despesa-agendada.ts` (`recusaDasParcelasDaDespesa`,
  `recusaDasRepeticoesDaDespesa` e os avisos), na tela e em
  `createTransactionAdvanced`; o banco só confere a coerência da parcela
  (migration `20261206900001`). Prova: `tests/despesa-parcelas-acima-do-comum.test.ts`.
- **O valor do lançamento até o que o registro guarda, conferido no servidor**
  (o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
  feito."; CLAUDE.md §4, o Heitor, 19/11: "Qualquer gravação que não passa pela
  validação do backend ta errada"). Sem teto de "comum": o impossível (decisão
  do Claude, 25/11) é o zero ("Valor deve ser maior que zero.") e o que
  `financial_transactions.amount` (numeric(10,2)) não guarda — acima de
  R$ 99.999.999,99, contado nos centavos como o banco: "No máximo
  99.999.999,99 reais (o limite do registro).". Era o "numeric field overflow"
  do banco, em inglês, na tela. `lancarCore` confere (a tela e o Copilot passam
  por ele); na despesa parcelada, cada PARCELA ("Cada parcela: No máximo…" — o
  total pode passar, dividido), e na recorrente, cada repetição
  (`createTransactionAdvanced`). A regra é UMA, `lib/financeiro/limites-do-registro.ts`
  (`LIMITE_DO_DINHEIRO`, `recusaDoDinheiroAcimaDoRegistro`, `passaDoRegistro`),
  que o Copilot lê. Prova: `tests/nucleo-recusa-o-que-o-registro-nao-guarda.test.ts`.
- **A despesa recorrente guarda a forma de pagamento, como a parcelada** (D11
  do levantamento das regras, o Heitor, 2026-11-11; princípio 3): a forma
  escolhida ao lançar vai a cada lançamento da recorrência (C70, F67:
  a recorrente a omitia, e o "Pagar despesa" perguntava a forma). Prova:
  `e2e/financeiro-f67.spec.ts` ("C70").
- **O "Pagar" da despesa sem forma pergunta a forma** (A15 da 9ª; decidido pelo
  princípio 3 — a parcela da cliente e a comissão já perguntavam): "Pagar
  despesa" (`PagarDespesa`, nos dois financeiros), a forma nasce vazia e é
  obrigatória, com o Boleto. **A despesa que já tem forma também abre a
  janela** (A13 da 26ª; decisão do Claude, princípio 3 — revê a da 9ª, que
  baixava direto): a forma lançada vem escolhida, e quem paga confirma ou
  troca, como na baixa da receita; a janela diz quanto e, quando a despesa
  diz, a quem. Prova: `e2e/financeiro-atritos-da-9.spec.ts` ("A14", "A15"),
  `e2e/financeiro-a-pagar-vencimento.spec.ts`, `tests/financeiro-baixa-cx2.test.ts`.
- **A forma nasce VAZIA em toda tela de cobrança** (A37 da 6ª simulação,
  2026-11-04; princípio 3): o recebimento do atendimento (a comanda dele no
  PDV, desde o PDV7; era o "Confirmar pagamento" que o `?receber=1` abria), o checkout do plano
  (o "Receber o plano" do PDV; nenhum meio marcado) e o `CamposDoPagamento`
  (o "Vender" de pacote, pré-pago e produto, e o pagamento do contrato); o
  "Pagar" de uma receita no Financeiro também. O que se recebe
  agora (à vista, a entrada) não confirma sem ela — o botão espera, e o
  servidor recusa ("Escolha a forma de pagamento."). O "a receber" e o
  crediário sem entrada não têm forma agora: ela se escolhe quando o dinheiro
  entra (PDV8, 2026-11-14 — saiu o "Meio de pagamento (opcional)"). Só o meio
  COMBINADO vem escolhido — no contrato, e na baixa da receita que nasceu com
  um (quem recebe confirma ou troca).
- **A baixa da RECEITA pede a forma sempre** (PDV8/CX2, 2026-11-14): o "Pagar"
  de toda receita em aberto, nos dois financeiros e na ficha, abre "Receber"
  (`ReceberNoCartao`; "Receber no cartão" quando a forma é um cartão) com a
  forma — o meio combinado no lançamento já escolhido —, a bandeira, a
  maquininha e as vezes. `marcarPagoCore` recusa receita sem forma ("Escolha
  a forma de pagamento."), e o Copilot (`marcar_pago`) pergunta como foi
  pago. A despesa abre "Pagar despesa" com a forma lançada já escolhida
  (A13 da 26ª, acima). O Pix era o padrão calado: um clique gravou o peeling do Jorge
  no Pix, que ele pagou no cartão. Nos specs, `pagoNoPix`
  (`e2e/apoio/vender.ts`) escolhe o Pix onde a forma não é o assunto. Prova:
  `e2e/vendas-forma-nasce-vazia.spec.ts`.
- **Cartão de crédito em N vezes é PAGO na hora PELA CLIENTE** (decisão do
  Heitor, 2026-10-20): quem paga a rede é a maquininha, então para o
  cliente está quitado. É o "À vista" com o meio Cartão de crédito e "Vezes
  no cartão" (1–1.200; acima de 12 a tela avisa — o Heitor, 25/11, abaixo
  em D-15): UM lançamento pago, com
  `financial_transactions.cartao_vezes` (2–1.200, só no crédito — a
  restrição do banco confere). Para a comissão, é pagamento INTEGRAL (H4, 2026-11-01):
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
    rede: Configurações → Comissões → "Prazo da operadora (dias)", junto
    das taxas (`tenants.cartao_prazo_dias`, 30 por padrão, de 1 dia para
    cima — acima de 120 a tela avisa e o valor vale, princípio 2, o Heitor,
    2026-11-04; só o zero e o acima do registro, 32.767, são recusados:
    `recusaDoPrazoDaOperadora`/`avisoDoPrazoDaOperadora`, o mesmo na
    maquininha; migration `20261204200001`;
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
        com `financial: MANAGE`, o recurso comissões e o cargo de Admin da
        rede — `recusaDaConfigDaRede`; o Heitor, 18/11: a configuração da
        rede toda é "só pela conta admin"; até ali bastava “A rede inteira”).
        O Pix em `tenants.pix_taxa_pct` (padrão 0). A venda guarda a sua em
        `financial_transactions.maquininha_id`.
      - **A migração**: a configuração de cada rede virou a 1ª maquininha,
        "Maquininha". O lançamento já gravado fica com a taxa que tem (o
        recebível é retratado; o Pix, o débito e o crédito 1x, que não têm
        recebível, guardam a taxa em `financial_transactions.taxa_pct_retrato`
        quando entram pagos — gatilho `trg_taxa_do_lancamento`, refeita só se o
        meio, as vezes, a bandeira ou a maquininha mudam. Toda leitura da taxa
        de um lançamento — o caixa, o aviso e as taxas do Fechamento, os
        custos da venda — parte de `private.taxa_gravada_do_cartao`: VF2-02 da
        varredura de 18/11, decisão do Claude; trocar a taxa mudava o
        passado). As vezes do cartão são `cartao_vezes` (nulo = 1x), nunca a
        `parcela_total` do crediário (VF2-01). `payment_fees` e `tenants.cartao_*` seguem
        só com um ESPELHO para a 1ª maquininha (gatilhos
        `trg_maquininha_espelha_*`), até a limpeza com o Heitor.
      - **Quem decide a maquininha da venda**: a escolhida; sem escolha, o
        banco põe a PRIMEIRA ativa (`private.maquininha_do_lancamento`, por
        `ordem`); o estorno herda a do pagamento; a de outra rede é recusada
        ("Esta maquininha não é desta rede."); a DESPESA no cartão não tem
        maquininha (20261112006709). **Com mais de uma ativa, o cartão não
        segue sem ela** — na tela (o botão espera) e no servidor
        (`recusaDasVezesDaRede`: "Escolha a maquininha do cartão."): a
        primeira não vale calada (princípio 3). Todos os caminhos: avulso,
        checkout do plano (o "Receber o plano" do PDV), pacote, pré-pago, produto, crédito
        interno, Novo lançamento, "Receber no cartão", o Copilot (`lancar`
        e `marcar_pago` pedem o nome; com mais de uma, sem ele, perguntam) e
        o pagamento NOVO do usado — o estorno inteiro de pacote, plano,
        unidade pré-paga, venda de produto ou de crédito, que entra de novo
        no cartão (`p_novo ->> 'maquininha'`; VF-01 da varredura de 18/11).
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
        de uma (`metrics_fechamento_por_maquininha`; a despesa no cartão não
        tem maquininha — migration `20261112006709` — e aparece como
        "Cartão", `fechamento-do-dia-tela.tsx` e `csv-da-contadora.ts`), na
        tela e no CSV.
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
        dela, se ela cobra diferente). **Com mais de uma e nenhuma escolhida,
        a tela não diz taxa nenhuma** (A16 da 26ª, princípio 4): o aviso da
        taxa dizia a da primeira ("Taxa da maquininha (Stone)…") com o campo
        em "Escolha…" — `maquininhaDoAviso`; o valor já estava guardado, o
        servidor recusa o cartão sem a escolha ("Escolha a maquininha do
        cartão.").
      - **O Fechamento do dia separa por maquininha** (e, dentro dela, por
        bandeira quando houver).
        **E o CSV dele leva a taxa e o líquido de cada maquininha** (A28 da
        14ª, F75 — a Ivone concilia o depósito de cada operadora): a seção
        "Taxa e líquido por maquininha (estimados)", com o Pix numa linha
        própria — a mesma conta da linha "Taxas da maquininha no dia",
        separada (`metrics_taxas_por_maquininha`, migration
        `20261113007502`; `getTaxasPorMaquininha`). Só a quem vê o
        financeiro da rede (`veComissaoDeTodos`). Desde o CX6 (2026-11-14) o
        CSV mora no Financeiro, e a linha das taxas estimadas saiu da tela do
        fechamento — quem só recebe não vê taxa nenhuma (o D7 vale inteiro).
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
      bandeira pode ter o SEU prazo e as SUAS taxas (débito e crédito 1x até o limite da maquininha, que pode passar de 12x;
      Pix não tem bandeira), gravados juntos em `tenants.cartao_por_bandeira`
      (`salvarCartaoPorBandeira`, a mesma permissão e abrangência das taxas;
      a tela diz "Com regra própria: Elo"). O de antes é a **REGRA GERAL**:
      vale para a bandeira sem regra própria (o campo vazio mostra a geral) e
      para o pagamento sem bandeira — a rede que não mexe não vê diferença.
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
      **A rede fica sabendo**: em "Taxas da maquininha", a linha sem taxa
      (na regra geral; na bandeira, quando nem ela nem a geral têm) aparece em
      destaque de aviso — "Sem taxa: as vendas em 4x saem sem desconto da
      operadora." (`data-sem-taxa`) —, menos o Pix (sem taxa é comum) e o
      crédito acima do "Parcelar no crédito até" (não se vende ali; decisões
      da F17). Com as maquininhas (C75), esse destaque SAI: o campo vazio
      mostra "0%" (acima); e o Financeiro (desde o CX6, 2026-11-14; era o
      Fechamento do dia), com venda no cartão sem taxa no período e nas
      unidades da tela, diz "Sem taxa da maquininha cadastrada — saiu sem
      desconto da operadora: Crédito 4x (Elo): 1 venda, R$ 1.100,00…"
      (`metrics_vendas_sem_taxa_do_fechamento` por unidade, somado em
      `getTaxasDoPeriodo`; `[data-aviso-sem-taxa]`). Prova:
      `e2e/financeiro-cartao-por-bandeira.spec.ts` ("F16-2"),
      `tests/financeiro-formas.test.ts`, `tests/cartao-por-bandeira.test.ts`.
    - **"Preencher pela taxa por parcela"** (r4-f15-01; o Heitor: "a taxa é
      por parcela, por exemplo 1.15% por parcela, então a taxa total é a taxa
      vezes a quantidade de parcelas"): em "Taxas da maquininha", na regra
      geral e em cada bandeira, a pessoa digita a taxa por parcela (1,15%) e o
      botão preenche o crédito 1x a 12x com a taxa × as vezes, em duas casas
      (1x 1,15%, 2x 2,30% … 12x 13,80%; `creditoPelaTaxaPorParcela`) — ou
      até o limite da maquininha, quando ele passa de 12x (o Heitor, 25/11). Só
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
      a rede cola ou digita (princípio 4: não chutar número). Prova:
      `e2e/configuracoes-atritos-da-8.spec.ts` ("A4 da 9ª"),
      `tests/tabela-da-operadora.test.ts`.
    - **O "Preencher" diz antes o que vai pôr, e a taxa que BAIXA com mais
      vezes avisa** (A2 da 8ª simulação, 2026-11-06; decidido pelo princípio
      2 — "no máximo, avisar"): os dois times multiplicaram sem ver (1x 2,80%
      virou 0,99%, e o 2x 1,98% ficou abaixo do à vista). A caixa do "taxa por
      parcela" mostra, enquanto se digita, "Vai preencher: 1x 0,99% · 2x
      1,98% …" e "o crédito à vista (1x) deixa de ser 2,80%"
      (`data-vai-preencher`), e tem o "Colar a tabela da operadora" ali dentro.
      O "Salvar taxas" grava o que a rede escolheu e, quando mais vezes sai
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
      quê. No **Automático** todas as linhas aparecem (1x a 12x, ou até a maior
      com taxa quando ela passa de 12): o limite sai delas (a
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
      3,04); a rede recebe R$ 186,96" — a da bandeira quando ela tem a sua
      (`AvisoDaTaxaDoDebito`, `[data-taxa-do-debito]`, em `CampoDaBandeira` com
      o `total`; sem nenhuma cadastrada, "sai sem desconto (0%)"). Prova:
      `e2e/financeiro-atritos-da-9.spec.ts` ("A34").
    - **O pagamento no cartão diz a bandeira, opcional** ("Bandeira (opcional)",
      `CampoDaBandeira`): o recebimento do atendimento (a comanda no PDV),
      o checkout do plano (o "Receber o plano" do PDV), o "Vender" (pacote, pré-pago, produto, contrato —
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
      limite da rede, `useOpcoesDeVezes`, com o valor da parcela e o aviso
      da taxa), gravado em `cartao_vezes` — UM lançamento pago, que a
      operadora deposita em N (`recebiveis_do_cartao`, pelo gatilho, com o
      prazo e a taxa da bandeira), exatamente como o crédito em N vezes da
      "Nova venda" do PDV. A tela diz a diferença: "Um pagamento só: a cliente
      pagou tudo agora, e a operadora deposita em 3 parcelas (no “A receber da
      operadora”). Não é o crediário da cliente." (o mesmo texto no "Receber no
      cartão", `ReceberNoCartao`; o "Parcelado" do modal é o da despesa). Débito
      é 1x; o lançamento PENDENTE não pergunta — as vezes são da baixa.
      `lancarCore` (`vezes`) recusa acima do limite (`recusaDasVezesDaRede`).
      Prova: `e2e/financeiro-cartao-por-bandeira.spec.ts` ("F16-5").
    - **A baixa no crédito também escolhe as vezes** (F17-5, o Heitor:
      "pode"): o "Receber no cartão" (`ReceberNoCartao`, nos dois
      financeiros) de um pendente no CRÉDITO pergunta "Vezes no cartão" (até o
      limite da rede, com o valor da parcela e o aviso da taxa), além da
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
      no check-in gravava a bandeira e a maquininha DENTRO de `plano_receber`
      desde a VF2-04 da varredura de 18/11; esse caminho saiu: o plano se recebe no PDV, PV-01), o gatilho refaz o
      prazo e a taxa das parcelas enquanto a operadora não pagou nenhuma, e a
      comissão se acerta pelo gatilho dela. Prova:
      `e2e/financeiro-cartao-por-bandeira.spec.ts`, `tests/cartao-por-bandeira.test.ts`.
    - **A receita é da VENDA**: entra inteira no dia dela, pela regra única;
      a parcela recebida NÃO soma receita (`indicadores.md`).
    - **A baixa é na leitura, sem cron**: a parcela vira recebida SOZINHA
      quando vence (`recebiveis_do_cartao_lista` deriva a situação —
      A_RECEBER, RECEBIDA, ANTECIPADA, CANCELADA, ESTORNADA). "Marcar
      recebida" é a antecipação (`anteciparParcelaDaOperadora`, com
      `financial: MANAGE` e a unidade ao alcance;
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
      `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`, "D3").
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
      (ou no da rede), com a taxa do 1x — como as N vezes. O débito e o Pix
      seguem recebidos no dia: não há prazo configurado para eles (princípio
      4). A receita continua da venda, no dia dela (princípio 5); o Fechamento
      não muda (a taxa do 1x já era estimada), e o "A receber da operadora", a
      lista e o fluxo de caixa passam a mostrar o 1x. As vendas no 1x de antes
      ficam sem parcela. ⚠️ A restrição `recebiveis_do_cartao_check` aceita
      `parcela_total` de 1 a 12 desde esta migration: o gatilho com o 1x
      ANTES dela recusa toda venda no crédito à vista (foi o que a
      `20261104002001` fez por alguns minutos). Desde a `20261206800001`,
      de 1 a 1.200, e o gatilho gera tantas parcelas quantas as vezes (antes
      cortava em 12). Prova:
      `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts` ("D4").
    - As vendas antigas no cartão N× (3 na produção em 2026-11-01: Aurora
      R$ 600, Jasmim R$ 150, Lótus R$ 280) ficam como estão, sem parcelas.
    - Migration `20261101000261`. Prova:
      `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`. "Entrada + parcelas" é o CREDIÁRIO da própria rede: cada
  parcela a receber, e a comissão espera a última. Vale nas cinco portas: pacote e pré-pago
  (`lancamentosDoPagamento`), checkout do plano (o "Receber o plano" do PDV)
  e o pagamento do atendimento avulso (`p_dados.cartao_vezes`); o recebimento
  do plano no check-in saiu (PV-01).
  Até aqui "3x no cartão" só cabia em entrada + parcelas, a receber.
  - **O crediário NÃO é cartão** (D6 da 6ª simulação, 2026-11-04): as
    parcelas do saldo, que a cliente paga à REDE, nascem SEM meio de
    pagamento (`payment_method` nulo) — o meio se escolhe ao receber cada uma.
    Nasciam com o meio da entrada (`CREDIT_CARD`), e o contrato dizia "+ 2
    parcelas de R$ 1.700,00 no cartão de crédito". O meio, as vezes e a
    bandeira do "entrada + parcelas" são da ENTRADA. O contrato
    (`pagamento.forma`) diz "entrada de R$ 1.000,00 no cartão de crédito em 3x
    + 2 parcelas de R$ 1.700,00 no crediário: R$ 1.700,00 em 04/12/2026 e R$ 1.700,00 em 04/01/2027"
    (`pagamento.metodo` é o da entrada; sem entrada, vazio), a tela e a linha
    do tempo dizem o mesmo (`frasesDoPagamento`, `rotuloDoPagamento`: "entrada
    de R$ 1.000,00 em Crédito 3x + 2x no crediário"), e a ficha e o app
    mostram a parcela sem meio como "Crediário" (`formaDoLancamento`,
    `lib/financeiro/formas.ts`). O "Pagar" do Financeiro (os dois portais) de
    uma receita sem meio abre "Receber", com "Forma de pagamento" vazia e
    obrigatória — e, no cartão, a bandeira e as vezes (`ReceberNoCartao`,
    `markTransactionPaid(…, forma)`): era dar baixa sem forma nenhuma. As
    portas: `lancamentosDoPagamento` (pacote, pré-pago, produto), o checkout
    do plano e `plano_receber` (migration `20261104002005`). As parcelas já
    gravadas com meio (17 nas redes [sim] e de teste, em 2026-11-04) ficaram
    como estão. Prova: `e2e/checkout-entrada-no-cartao.spec.ts`,
    `tests/checkout-crediario-da-rede.test.ts`.
  - **A ENTRADA no crédito também tem as vezes** (D5 da 6ª simulação): no
    "Entrada + parcelas" com a entrada no cartão de crédito, "Vezes no cartão
    (a entrada)" — no checkout do plano, no `CamposDoPagamento` (pacote,
    pré-pago, produto, contrato); o recebimento do plano no check-in saiu (PV-01) —, com
    o limite da rede, a dica do valor e o aviso da taxa, como o à vista. A
    entrada é UM lançamento pago com `cartao_vezes`, e a operadora a deposita
    em N (`recebiveis_do_cartao`, com a taxa daquelas vezes e da bandeira).
    `PagamentoDoPlano` PARCELADO ganhou `vezes`; `vezesNoCartao` devolve as
    da entrada (o servidor recusa acima do limite em todas as portas); o
    retrato do contrato as guarda só quando passam de 1. Prova:
    `e2e/checkout-entrada-no-cartao.spec.ts`.
  - **A descrição não leva texto interno** (A47 da 6ª simulação): o plano
    grava "Plano de tratamento — entrada" e "Plano de tratamento — parcela
    1/2" (era "— checkout novo paciente —" e "— recebimento no check-in —",
    que chegavam ao app e ao recibo da cliente; os de antes foram trocados na
    migration `20261104002006`).
  - **A rede diz até quantas vezes** (D-15, decisão do Heitor,
    2026-10-29: "A clínica configura 'parcela até Nx'. O padrão é o maior
    número de parcelas com taxa cadastrada."): Configurações → Comissões →
    "Parcelar no crédito até" (`tenants.cartao_max_vezes`, 1–1.200 desde a
    `20261206800001`, era 1–12 na migration `20261029001603`; grava `salvarMaximoDeVezes`, a mesma permissão das
    taxas — desde a F67, C75, é de CADA maquininha: `maquininhas.max_vezes`,
    e a venda usa o da maquininha escolhida). Vazio = automático: a maior parcela do CRÉDITO com taxa em
    `payment_fees`; sem nenhuma, 12x (`maximoDeVezes`,
    `lib/financeiro/vezes-do-cartao.ts`). Todo "Vezes no cartão" monta as
    opções por `useOpcoesDeVezes` (recebimento do avulso, checkout do plano
    — o "Receber o plano" do PDV —, `CamposDoPagamento` — pacote, pré-pago,
    produto e o pagamento do contrato), e o servidor RECUSA acima do limite
    (`recusaDasVezesDaRede`, `lib/financeiro/vezes-da-rede.ts`) em
    `confirmPayment`, no checkout do plano, em `venderPacote`,
    `venderProcedimento`, `venderProduto`, `definirPagamentoDoContrato`,
    `prepararDocumentosDoCheckout` e o "Novo lançamento" (`lancarCore`,
    F16-5). Vale só para o cartão em N vezes; as
    parcelas do crediário ("entrada + parcelas") têm o limite delas, abaixo. Prova:
    `e2e/financeiro-parcelas-no-credito.spec.ts`, `tests/financeiro-vezes-do-cartao.test.ts`.
  - **Acima de 12 vezes AVISA, não recusa** (o Heitor, 25/11, perguntado se
    o "no máximo, avisar" do princípio 2 vale para o limite de 12 vezes: "Se
    não for impossível, ainda que improvável, pode ser feito."). O "Parcelar
    no crédito até" oferece Automático, 1x a 12x e "Mais de 12x…", que abre o
    número digitado; acima de 12 a tela diz "Acima do comum (mais de 12
    vezes). Confira: o valor vale como está." (`avisoDasVezesNoCartao`,
    `data-aviso-das-vezes`) e o servidor grava. As linhas do crédito na
    tabela de taxas vão até esse limite (13x, 14x… com taxa própria); sem a
    taxa daquelas vezes vale 0% e a venda avisa (princípio 4, F16-2) —
    nunca a do 12x, que era o que `taxaNaMaquininha` e
    `private.taxa_da_maquininha` faziam cortando em 12. **O impossível**
    (decisão do Claude, 25/11): zero, negativo, fracionário e acima de 1.200
    vezes — cada parcela vira um recebível mensal da operadora, e 1.200
    meses são 100 anos, o limite das datas (`LIMITE_DE_VEZES_NO_CARTAO` =
    `LIMITE_DE_MESES`, `lib/acima-do-comum.ts`; `recusaDasVezesNoCartao`,
    `lib/financeiro/vezes-do-cartao.ts`). O "comum" (12) é o teto de antes,
    também decisão do Claude. Valem os mesmos 1.200 no pagamento do
    atendimento, no checkout, nas vendas, no crédito na clínica, nas
    devoluções, no "Novo lançamento", no Copilot e nas travas do banco
    (migration `20261206800001_cartao_acima_de_12_vezes.sql`). Prova:
    `tests/cartao-acima-de-12-vezes.test.ts`.
  - **O crediário em quantas vezes é decisão da REDE** (D10 do levantamento
    das regras, o Heitor, 2026-11-11: "Decisão da rede"; princípio 1). Uma
    configuração da rede — o máximo de parcelas do "entrada + parcelas", padrão
    12 — vale igual em todo caminho que vende no crediário: o Vender (pacote,
    pré-pago, produto, o pagamento do contrato) e o checkout do plano (o
    "Receber o plano" do PDV; o check-in do plano não recebe mais, PV-01). A
    tela oferece até o limite da rede e o servidor recusa acima dele, nos
    dois (C38, F67: `tenants.crediario_max_parcelas`, no
    card "Crediário" da aba de Comissões; o Vender cortava em 12 e
    o checkout e o check-in em 48, calados — `maximoDeParcelasDaRede`).
    **O limite é o número que a rede digita, de 1 para cima** (princípio 2, o
    Heitor, 2026-11-04: "no máximo, avisar"): acima de 48 a tela avisa
    (`avisoDoMaximoDeParcelas`) e o valor vale; só acima do registro (32.767,
    o `smallint`) é recusado (`recusaDoMaximoDeParcelas`,
    `lib/financeiro/parcelas-do-crediario.ts`; migration `20261204200001`
    tira o teto de 48 do banco). E `lancamentosDoPagamento` não corta mais as
    parcelas em 12 (gerava 12 lançamentos de uma venda em 24x). Decisão do
    Claude, 25/11: o aviso começa no teto de antes. A despesa também avisa
    em vez de recusar (o Heitor, 25/11 — abaixo, em "A despesa parcelada (ou
    recorrente)"). E o banco não prende mais a parcela em 48
    (`financial_transactions_parcela_coerente`, migration `20261206900001`:
    o crediário em 60 vezes era recusado ao gravar), nem a forma do pagamento
    do contrato do plano (`pagamentoValido`, `lib/checkout/pagamento-valido.ts`, vai até
    o registro e o limite da rede vem depois).
  - **O crediário tem UM nome, diz o limite e só pede a forma da entrada**
    (A23 da 14ª simulação, F75; princípio 7; PDV8, 2026-11-14): a
    configuração dizia "Crediário da clínica" e o Vender, "Entrada +
    parcelas" — a Wanda e a Débora não ligavam um ao outro. O Crediário é um
    BLOCO de forma, ao lado dos meios, com o nome "Crediário"
    (`ROTULO_DO_CREDIARIO`, `lib/financeiro/parcelas-do-crediario.ts`; na
    comanda, `rotuloDaForma('CREDIARIO')`), e a lista das parcelas diz "até
    6x, o limite da rede" (`limiteDoCrediarioEmTexto`). Com entrada, ela
    pede a forma dela ("Forma da entrada *"); sem entrada, nada se recebe
    agora e forma nenhuma é pedida — na tela (`recusaDoPagamento`) e no
    servidor (`EntradaDoPagamento`: o meio é um meio ou nulo, nunca `''`;
    com entrada e sem meio, "Escolha a forma da entrada."). Vale para o
    PDV, o receber do plano no PDV e a caixa do plano no atendimento
    (`receberDoPlanoInterno` recusa igual) — e o contrato do plano e o do
    avulso (`pagamentoValido`; D2 da 35ª: o crediário sem entrada era
    "Forma de pagamento inválida."). Quem pede a forma do que entra agora é
    `pedeAFormaAgora` (`lib/checkout/pagamento-valido.ts`). Trava:
    `tests/crediario-nomes-e-entrada.test.ts` (nenhuma tela escreve o nome
    velho à mão), `tests/crediario-sem-entrada-no-contrato.test.ts`.
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
    crédito 3x: 2,97% (R$ 2,97) — a rede recebe R$ 97,03, que a operadora
    deposita em 3 parcelas." (`[data-liquido-do-cartao]`, no `AvisoDaTaxa` —
    sem a taxa, o aviso de sempre; a conta é `liquidoNaMaquininha`,
    `lib/metrics/resultado.ts`); e, à vista, a linha das vezes diz para que
    serve: "À vista · parcela até 4x no crédito em “Vezes no cartão”". Prova:
    `e2e/caixa-atritos-da-8.spec.ts` ("A40"), `tests/liquido-na-maquininha.test.ts`.
  - **Uma conta só para a parcela do crediário** (D2 da 7ª simulação,
    2026-11-05; princípio 3): o checkout do plano dizia "3× de R$ 890,67" (o
    saldo ÷ 3) e o recebimento do plano no check-in (que saiu, PV-01) "3x de
    R$ 890,67", e o banco gravou 890,66 + 890,66 + 890,68. A tela diz as parcelas
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
    a de outras vezes). As taxas vão de à vista ao limite da maquininha (12x, ou mais — o
    Heitor, 25/11) em Configurações →
    Comissões. A quem não cadastra a taxa (quem não é a Admin da rede, desde
    18/11), o aviso diz QUEM cadastra, pelo nome das Admins da rede ativas
    (`textoDeQuemCadastraATaxa`, `adminsAtivasDaRede` em
    `maquininhasParaAVenda`), em vez de mandar a Configurações (A5 da 16ª).
    O mesmo no aviso da venda sem taxa do Financeiro e do DRE dos Relatórios
    (D6 da 34ª; MQ-10): `quemCadastraATaxa`
    (`lib/financeiro/quem-cadastra-a-taxa-no-servidor.ts`) passa os nomes a
    `AvisosDasTaxas` e a `avisoDoDreSemTaxa`. Prova:
    `tests/aviso-da-taxa-a-quem-nao-cadastra.test.ts`.
  - **A linha do tempo também diz a forma pelo nome** (D18 da simulação de
    2026-10-29; migration `20261029000301`): "Pagamento confirmado via
    Crédito 3x", "via Dinheiro" — era "via CREDIT_CARD em 3x". No banco,
    `private.rotulo_da_forma` é o espelho de `rotuloDaForma` (os nomes
    curtos), usado por `confirmar_pagamento_do_atendimento`; no app, o
    checkout do plano (`rotuloDoPagamento`) usa `rotuloDaForma` (o
    recebimento do plano no check-in, que também usava, saiu — PV-01). Forma nova entra NOS DOIS. O histórico
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
- **A página do plano proposto tem o aceite para quem recebe** (A44 da 5ª
  simulação; desde a fase 3 do PDV, "Aceitar plano" — o "Fechar checkout"
  saiu): em Tratamentos, quem RECEBE e não monta o plano vê "Aceitar plano" no
  passo ① do plano PROPOSTO. Prova:
  `e2e/plano-fechar-checkout-na-pagina.spec.ts`.
  **E o erro fica junto do botão** (A24 da 14ª, F75): o erro do "Aceitar
  plano" e do "Cliente vai pensar" (este só no rascunho) aparece ao lado
  deles (`ErroDoBotao`, `[data-erro-do-botao]`, em
  `planejamento-tratamento.tsx`), não no topo da página. No PROPOSTO quem
  escreve no plano vê o "Aceitar plano" (era o "Continuar o checkout"); o
  aceito com saldo diz "Plano aceito. Falta receber: a comanda do plano está
  no PDV…" e, a quem recebe, "Receber no PDV" (`passos-do-plano.tsx`,
  `ResumoDoPlano`). Prova: `e2e/plano-f75-aceitar.spec.ts`.
- **O pagamento do plano cobra só o plano** (uma venda, uma comanda — o
  Heitor, 13/11: "Tudo que for uma venda gera uma comanda"; a revisão das
  perguntas de 24/11 deu a regra de 20/10 por vencida): o atendimento que
  GEROU o plano (`evaluation_appointment_id`) tem a comanda dele no PDV,
  aberta no início (PDV3), e se recebe lá, como qualquer avulso. A comanda do
  plano não o mostra nem o soma. Saíram o "atendimento de hoje" do checkout
  (`atendimentoDeHojeDoPlano`, de 2026-10-20) e as frases dele (A38 da 6ª).
  Prova: `tests/plano-uma-venda-uma-comanda.test.ts`,
  `e2e/checkout-de-plano.spec.ts`.
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
  do plano” é o modelo do documento: em Configurações → Documentos, a rede
  escolhe se ele “Bloqueia” o checkout ou “Só avisa”." (`textoDaExigenciaDoModelo`,
  `lib/checkout/exigencia-do-modelo.ts`, `[data-exigencia-do-modelo]`). Prova:
  `tests/checkout-exigencia-do-modelo.test.ts`.
- **O checkout do plano diz o que fica sem data e confirma ao concluir** (A37
  da 8ª simulação, 2026-11-06; princípio 3). O "Receber o plano" do PDV — o
  único que abre o checkout — não agenda as sessões (DP-01: elas se agendam
  pelo plano ou pela agenda; `podeAgendar={false}` em
  `components/shared/pdv/receber-o-plano.tsx`; até o PDV4 o checkout tinha o
  passo de agendar, opcional). Antes de concluir, "As sessões 2 e 3 ficam sem data: agende
  pela ficha da cliente (Tratamentos) quando ela marcar."
  (`[data-sessoes-sem-data]`), e concluir mostra "Plano fechado: 3 sessões. 2
  sem data — agende pela ficha…" (`avisoDoPlanoFechado`,
  `lib/checkout/sessoes-sem-data.ts`) — caía na ficha calado. Prova:
  `e2e/checkout-entrada-no-cartao.spec.ts` ("D2, A42"),
  `tests/checkout-sessoes-sem-data.test.ts`.
  - **Parte das sessões já agendadas** (D3 da 15ª simulação, 2026-11-15;
    princípio 3): a sessão que já tem agendamento vivo antes do checkout (a
    cliente marca pelo app ou pela página do plano antes de pagar — PT1d/PT3)
    aparece como "Sessão 1 — já agendada: 16/11 às 14:00", no fuso da unidade
    (`agendada` de `getTreatmentPlanSessions`, `textoDaSessaoJaAgendada`), não
    é oferecida de novo no agendamento, e o servidor não a agenda de novo
    (`checkoutTreatmentPlan` a pula). O aviso do fim a conta: "Plano fechado:
    5 sessões. 1 já agendada, 4 sem data — …". Prova:
    `e2e/checkout-de-plano-sessao-ja-agendada.spec.ts`, `tests/defeitos-da-15.test.ts`.
- **O checkout do plano tem "Quem vendeu"** (decisão 4 da 7ª simulação,
  2026-11-05: "concordo"): no passo do pagamento, nascendo VAZIO como em toda
  venda (`CampoQuemVendeu`, `[data-quem-vendeu-do-plano]`); vazio, "Ir para a
  documentação" pergunta antes ("Ninguém foi marcado em “Quem vendeu”…
  Vender assim?", `PERGUNTA_SEM_VENDEDOR`, `lib/vendas/pergunta-sem-vendedor.ts`),
  e o servidor faz a mesma pergunta (`checkoutTreatmentPlan` com `equipe`;
  `quemVendeu`, antes do dinheiro). Fica em `treatment_plans.vendido_por` e
  leva a comissão de VENDA do plano (`comissoes.md`). O chamador que não manda
  `equipe` (os de antes) fecha sem comissão de venda. A coluna "Profissional"
  das Vendas do plano é quem vendeu (D14 da 8ª); sem ele, a venda não é de
  ninguém (com-06, o Heitor: "Campo vazio não gera comissão para ninguém";
  até 18/11 ia à profissional do plano — `indicadores.md`). Prova:
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
  "Valor" é "Incluído no pacote X (sessão 2 de 3)" (A10/A17 da 15ª: era
  "Já pago", e o pacote do crediário tinha dinheiro em aberto; ou "Faz parte
  do seu plano de
  tratamento (sessão N de M)", ou "Incluído no pré-pago de Y (unidade N de M)"), e a
  lista de procedimentos diz "Incluído" no lugar do preço — a MESMA escolha
  que o agendamento usa (`jaPagoNoApp`, ao lado de `pagoParaAgendar`) —, e,
  abaixo da duração, o texto inteiro ("Faz parte do seu plano de tratamento
  (sessão n de t)", `[data-ja-pago]`; 23ª A38, 2026-11-17: só "Incluído" não
  dizia de quê). Prova: `e2e/portal-cliente-confirmar-ja-pago.spec.ts`,
  `tests/pendencias-area-1.test.ts`.
- **O que falta do plano separa o que VENCEU** (`emAbertoDoPlano` /
  `separarOEmAberto`): em aberto sem data ou com vencimento até o fim de hoje
  (no fuso da unidade). Parcela que vence depois já está combinada — aparece
  no banner como "a vencer", sem botão. O check-in não cobra nada (PV-01): o
  banner da tela do atendimento só avisa, e a parcela se recebe no PDV. Antes o banner
  oferecia "Receber R$ 600" de um plano parcelado: cobrança em dobro (a
  simulação de 2026-10-20 achou). Prova: `e2e/plano-recebimento.spec.ts`.
  **O saldo do plano aparece a quem RECEBE** (A39 da 7ª simulação,
  2026-11-05; decidido pelo princípio 3): quem atende, sem o Financeiro e sem
  receber, via "Plano · R$ 2.672 a vencer" na tela do atendimento — dinheiro que
  não é dela tratar. O banner do plano (`[data-plano-em-aberto]`, o em aberto e
  o a vencer) só é lido e mostrado com `podeReceber`; quem recebe o vê como
  antes. Prova: `e2e/atendimento-atritos-da-7.spec.ts` ("A39").
  - **Uma transação, com o plano travado** (F11, sobra da F9): o app calcula o
    que cobrar e os lançamentos novos, e `plano_receber` grava tudo de uma
    vez — trava o plano, confere que o em aberto que o app leu continua em
    aberto e com a mesma soma, e só então quita ou troca o saldo por entrada
    + parcelas. Duas abas ao mesmo tempo: uma recebe, a outra ouve "Este
    saldo já foi recebido ou mudou". A entrada acima do em aberto é recusada
    (ven-02, abaixo). Prova: `e2e/plano-recebimento-concorrente.spec.ts`.
    O recebimento do saldo pela tela do atendimento (`receberDoPlano`) saiu
    (inventário dos testes, 24/11; PV-01); a função `plano_receber` ficou no banco.
- **A tela do plano FECHADO mostra o dinheiro e as sessões** (J-42,
  2026-10-30): "Valor do plano", "Recebido" e "A receber" (contados no banco,
  `metrics_financeiro_do_plano` → `getFinanceiroDoPlano`,
  `lib/metrics/plano.ts`; o recebido é a regra única de receita), cada
  lançamento — entrada e "Parcela 2/3", com "Pago em … · Pix", "A vencer em
  …" ou "Vencida em … · receba no PDV" (dizia "cobrada no check-in" até
  2026-11-16) — e "1 de 3 sessões feitas · 1
  agendada". Dizia só "O que estiver em aberto é recebido no check-in", e o
  check-in cobrava só o que venceu (hoje não cobra nada: é no PDV, PV-01). Migration `20261029001801`. Prova:
  `e2e/plano-tela-mostra-o-pago.spec.ts`. **O rodapé diz com quem fica a
  parcela que vence depois** (A28 da 9ª simulação; a regra de cargo fica): a
  pessoa sem o Financeiro lia "se recebe no financeiro", tela que ela
  não abre. Desde o PDV (PDV1/CX1, 2026-11-16), o lugar é o PDV: "Plano
  fechado. O que falta (as parcelas em aberto) se recebe no PDV." e, a quem
  recebe, o "Receber no PDV" (a "Nova venda" com a cliente, `rotaDaClienteNoPdv`);
  a quem não recebe, "…se recebe no PDV, com quem tem o PDV em
  Gerenciar: Lúcia, Fernanda." (PV-04) (`rodapeDoPlanoFechado`,
  `lib/plano-de-tratamento/textos.ts`; os nomes de `quemRecebeNoPdv`,
  `lib/equipe/quem-desfaz.ts` — `cashier` em Gerenciar, PV-04 —, pela
  unidade do plano; `[data-rodape-do-plano]`). Prova: `e2e/plano-atritos-da-9.spec.ts` ("A28"),
  `tests/textos-do-plano-da-9.test.ts`.
- **Desconto de fidelidade** fica em `loyalty_discount`, FORA de `amount`: o
  lançamento registra o dinheiro que entrou (§9.2.2). Pago todo com pontos, o
  lançamento é de R$ 0 e sem forma de pagamento.
- **Desconto em todas as vendas** (decisão do Heitor, 2026-09-30): pacote,
  checkout do plano e o recebimento do avulso no PDV, em R$ ou %, SEM
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
    **O desconto COMBINADO no editor do plano** (22ª A20, 2026-11-17;
    `treatment_plans.desconto_combinado_tipo`/`_valor`/`_por`) vira o
    `desconto` aplicado NO ACEITE (decisão do CLAUDE pelo princípio 3,
    2026-11-18, levada ao Heitor): o `plano_aceitar` chama o `plano_aplicar_desconto` na mesma
    transação, e desde o aceite a comanda, o em aberto
    (`metrics_em_aberto_das_vendas`), a agenda, a ficha, o app e o contrato
    leem o preço vendido. O checkout do plano abre com o combinado (o passo
    salvo e o contrato assinado continuam vencendo) e ainda o ajusta; como o
    rateio parte sempre do `preco_tabela`, receber com o mesmo desconto não
    o aplica duas vezes. Antes do aceite, os preços são os de tabela e as
    telas mostram o total com o combinado (§9.4 de `atendimento.md`, A34).
  - **Avulso**: `financial_transactions.sale_discount`, fora de `amount` (o
    bruto é `amount + loyalty_discount + sale_discount`). **A ordem é desconto
    comercial → voucher → pontos**, a mesma da Nova venda (o Heitor,
    2026-11-18: "Desconto, voucher, pontos" — auditoria das regras; era voucher
    → desconto → pontos só no avulso): o desconto vale sobre o total da
    comanda, o voucher sobre o que sobrou dele (o de % sobre o que sobrou; o
    de R$ até o que sobrou; o de procedimento paga o que sobra do atendimento
    depois da parte dele no desconto — `voucherDepoisDoDesconto`,
    `lib/fidelidade/voucher-na-comanda.ts`, o espelho de
    `private.parte_dos_itens`), e os pontos sobre o resto. A tela, a action e
    o banco (`confirmar_pagamento_do_atendimento`, migration
    `20261124000001`) fazem a mesma conta, e o "o que sai" do receber lista
    nessa ordem (`oQueSaiNoReceber`).
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
  simulação, 2026-11-06; princípio 3): escolhido o crédito interno — no
  "Vender" (`CamposDoPagamento`), no recebimento do atendimento (a comanda no PDV) e
  no checkout do plano —, "Crédito interno: R$ 270,00 · depois deste
  pagamento: R$ 170,00", ou que não cobre e quanto falta
  (`[data-saldo-do-credito]`, `SaldoDoCredito`; o saldo do banco,
  `getCreditoInternoDoCliente`, pela action `saldoDoCreditoDaCliente`, de quem
  recebe). Prova: `e2e/caixa-atritos-da-8.spec.ts`.
- **O crédito comprado conta no Investido total na compra, e a ficha diz** (A29
  da 10ª simulação, 2026-11-10: logo depois da venda do vale, o LTV foi a R$ 650
  sem nota): com um crédito interno comprado (`internal_credits.credito_vendido_id`),
  "Inclui o crédito interno comprado: o dinheiro conta aqui no dia da compra,
  e usar o crédito depois não conta de novo." (`[data-pago-com-credito]`). Prova:
  `e2e/ficha-uso-da-10.spec.ts` ("A29").
- **A ficha diz o que ela pagou com crédito** (A43 da 8ª): "+ R$ 180,00 pagos
  com crédito interno: não contam aqui…" embaixo do "Investido total" e na
  aba Financeiro (`[data-pago-com-credito]`,
  `metrics_pago_com_credito_do_cliente`, migration `20261106003803`) — o
  crédito não é receita (F7), e a ficha dizia "R$ 0" ao lado do "Preço médio
  R$ 450" sem explicar. **E diz de onde veio o crédito** (A41 da 9ª; princípio
  3): "o dinheiro entrou quando o crédito nasceu" era falso no CONCEDIDO.
  Agora "o crédito foi concedido, sem dinheiro — não é receita",
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
  (`[data-quem-estorna]`). **E o avulso concluído aguardando o PDV diz quem
  recebe** (A11 da 19ª), a quem não recebe: "Quem recebe é quem tem o PDV em
  Gerenciar: …" (`[data-quem-recebe]`, `quemRecebeNoPdv`, `textoDeQuemRecebe`;
  receber é só do PDV desde 24/11, PV-04).
- **Estornar e receber na própria ficha** (A32 e A35 da 12ª; princípio 3: a
  Helena, no celular, só achava o estorno em Financeiro → Lançamentos, uma
  página de 20 mil px; a parcela do crediário na ficha não tinha ação): na aba
  Financeiro da ficha, o lançamento pago tem "Estornar" para quem estorna (o
  Financeiro em Gerenciar) — a MESMA janela dos financeiros
  (`ConfirmarEstorno`, com os pontos que saem; a venda de crédito abre a dela) —
  e a parcela em aberto tem "Receber" para quem recebe (o PDV), que
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
  validade e "Falar com <a rede>" (o nome dela, CA1; o WhatsApp da unidade do endereço,
  `aUnidadeDoEndereco`). Desde o PT1b (2026-11-14, o Heitor: "A cliente
  recebe o plano no app, analisa e aceita.") o app também ACEITA ("Aceitar o
  plano", acima em "A cliente aceita PELO APP"); até ali o aceite era só na
  unidade. A anotação do profissional (`professional_notes`) e a da sessão
  (`treatment_plan_sessions.notes`) são clínicas e nem são lidas pela tela.
  A validade é da REDE (`tenants.plano_validade_dias`, 30 por padrão, de 1
  dia para cima — acima de 365 a tela avisa e grava, até 36.500, os 100 anos:
  o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser
  feito."; o limite dos 100 anos é decisão do Claude, 25/11 —,
  Configurações → Geral; migrations `20261029001202` e `20261207000001`), contada de quando o
  plano foi proposto; vencida, o app diz "Proposta vencida em …". É só
  informação: o checkout na unidade não recusa o plano vencido. Prova:
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
  2026-10-30): o Financeiro do portal mostra "Crédito em <a rede>" (o nome, CA1) com o saldo
  da ficha da rede do ENDEREÇO (`ctx.clientId`), só quando é maior que
  zero — `getCreditoInternoDoCliente` (`lib/metrics/unidade.ts`, a conta de
  `metrics_financeiro_do_cliente`, a mesma da ficha). Só o saldo: os
  lançamentos do crédito (com a descrição interna) ficam com a equipe.
  Prova: `e2e/portal-cliente-credito-interno.spec.ts`. **E o Início também**
  (A46 da 9ª simulação: a Rosana, sem plano, só chegou ao Financeiro pela URL —
  o único link ficava no detalhe de um plano): o cartão "Crédito em <a rede> ·
  R$ 181,00 · Use em qualquer atendimento ou produto. · Ver no Financeiro"
  (`[data-credito-interno-no-inicio]`), com o mesmo saldo. Prova:
  `e2e/financeiro-ficha-e-app-da-9.spec.ts` ("A46").
- **Os pagamentos do app dizem o vencimento e o que falta pagar** (A64 da 5ª
  simulação; Histórico → Pagamentos): a parcela pendente diz "Parcela 2 de 3 ·
  vence em 01/12/2026" (`due_date`, senão `data_de_referencia`, por
  `formatDia`), e o atendimento avulso concluído e não pago aparece "A pagar
  na unidade" — a conta de `atendimentos_a_receber` (`getAtendimentosAReceber`),
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
  (os dois portais; a quem tem o Financeiro em Ver ou recebe — a rota recusa
  o resto), no Histórico → Pagamentos do app (que passou a dizer
  "Estornado" no estornado, como o Financeiro do app) e na tela do
  atendimento pago, ao lado do "Pagamento confirmado" (para quem recebe). É
  `GET /api/recibos/[id]` (abre o PDF no navegador — imprimir ou baixar):
  sessão; da equipe, quem recebe ou vê o financeiro da unidade inteira, com
  a rede e a unidade ao alcance; da cliente, só o pagamento de uma ficha DELA.
  Do a receber ou do estornado, 404. O texto (`reciboDoLancamento`,
  `lib/financeiro/recibo.ts`, pelo gerador simples de `lib/pdf.ts`): nº,
  quem pagou (com o CPF, ou o passaporte/RNE), a quantia, o referente, a
  forma ("Crédito 3x"), quando, o desconto e o motivo quando há, e quem
  recebeu (rede, unidade, CNPJ, endereço, telefone; a seção se chama
  "Emitente", porque "Quem recebeu" no Fechamento do dia é a PESSOA que deu a
  baixa — decisão do Claude, 25/11, princípio 3) — e "Este recibo não
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
  venda, com o mesmo vencimento — a rede não perde dinheiro sem perceber, e
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
    VIVO, sem `notes = 'Estornada'`), e a comanda dele volta a ficar aberta no PDV —
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
    "Pagamento recebido" duas vezes e nenhum estorno); recebido de novo (na
    comanda do PDV), a tela do atendimento não mostra mais o "Fechar agora" (o
    checkout do plano aqui mesmo — ao lado do "Pagamento confirmado" ele se lia
    como receber de novo; o "Enviar ao PDV" fica). Na lista
    dos dois financeiros, o contra-lançamento é "Estorno" (não "Despesa") e
    diz "Anula a receita estornada". Prova: `e2e/financeiro-estorno-atritos.spec.ts`.

- **A 31ª simulação (decisão do Claude, 26/11):**
  - **O agendar da Agenda sabe do pacote em aberto** (D15, PA-13/PA-14):
    `creditosDoCliente` traz, por sessão de pacote, o em aberto (só a quem
    recebe, `podeReceber`) e a recusa da rede que libera só depois de pago
    (`recusaDaSessaoNaoLiberada`, a todos).
  - **O plano proposto mostra a validade na tela da equipe** (D16, PL-23):
    "Proposta válida até…" / "Proposta vencida em…: … o plano ainda se aceita"
    (`textoDaValidadeNaEquipe`, `[data-validade-da-proposta]`).
  - **O passo "Contrato e pagamento" diz o saldo** (D7, DP-03): "Recebido em
    parte · R$ X a receber" quando o plano tem a receber
    (`rotuloDoPassoDoPagamento`); a situação do plano não muda (PL-20).
  - **A ficha do pré-pago vale o vendido menos as canceladas** (D8, PP-03):
    "R$ 170,00 (vendido por R$ 340,00; 1 sessão cancelada, R$ 170,00)"
    (`valorDoPrePagoNaFicha`); a sessão agendada diz que se cancela antes o
    agendamento, na agenda (A11, `[data-agendada-se-cancela-na-agenda]`).
  - **A parcela do plano diz os procedimentos** (A5, CR-05/AC-01): a descrição
    gravada segue "Plano de tratamento — parcela 1/2"; a linha mostra
    "Plano de tratamento (3× Microagulhamento) — parcela 1/2"
    (`nomeDaLinhaDoPlano` com `procedimentosDosPlanos`): no PDV, na ficha, no app e em Relatórios → Parcelas pendentes.
  - **O rodapé do Fechamento do dia diz a regra do dia** (A7): sem espécie no
    dia, "o dinheiro em branco fecha em R$ 0,00"; com espécie, "O dinheiro é
    obrigatório" (`regraDosCamposDoFechamento`).

---

### O que a tela do dinheiro diz (decisões do Claude, 26/11 — 32ª simulação)

- A janela do estorno diz o voucher usado no pagamento, que volta a valer, em todo estorno que o devolve — não só no de R$ 0 (ES-01/ES-02; `textoDosPontosDoEstorno`).
- A recusa do estorno parcial no cartão diz "No cartão, o estorno é do pagamento inteiro: …" e o que fazer, sem o porquê (EX-06) — em toda função que recusa. A 32ª tinha posto o porquê; o Heitor, 26/11 (página de perguntas, R08): "Não precisa dessa explicação." (`20261211100001`).
- Todo campo de vezes no cartão avisa acima de 12x e deixa (MQ-01; `DicaDasVezes`, princípio 2).
- O receber da comanda fora do à vista diz "Os pontos e o voucher se usam no pagamento à vista." (PD-06; `TEXTO_PONTOS_SO_A_VISTA`, a mesma da venda).
- O aviso depois de receber diz o que ficou em aberto e quando vence ("Nada recebido agora (A receber): R$ 200,00 em aberto, vence em 06/12.").
- Na comanda, a parcela do crediário recebida é "Parcela 1/2 de <procedimento>", não "Atendimento".
- O pago só com a data (gravado no meio-dia de Brasília) mostra só a data (`diaSemHora`).
- O Fechamento do dia de outro dia diz o dia ("Sem espécie em 25/11"); a forma só com saída diz por que não se confere (FC-10); a forma sem bandeira nenhuma não lista "Bandeira não informada"; o estorno diz a maquininha do pagamento estornado (`maquininhaDosEstornos`; a saída não leva maquininha); no portal da rede, o fechamento diz a unidade.
- Relatórios → Financeiro, "A receber em aberto": a régua do cartão "A receber · em aberto" (FN-11) — as parcelas e o "A receber", fora o estorno.
- E a nota "Concluídos sem pagamento: R$ … (N atendimentos)" do Financeiro, embaixo da lista — a mesma linha (`NotaDosConcluidosSemPagamento`) e o mesmo número (`getTotalDosAtendimentosAReceber`): a cobrança do avulso reaberta pelo estorno da parcela (EX-09) é atendimento a receber, não lançamento (A12 da 35ª, princípio 3).
- A mudança da parcela da operadora (marcada como recebida, desfeita) entra na Auditoria (AD-04): só o UPDATE de `recebiveis_do_cartao` (a criação vem com o pagamento).

## O que nunca fazer aqui

❌ Prender ver ou agendar as sessões do pacote, do plano ou do pré-pago à unidade da VENDA (é alcancaOTratamento; o dinheiro é alcancaOCaixaDoTratamento — lib/tratamento/alcance.ts, F73)

❌ Gravar "paga" na comanda (a situação é o lançamento vivo pago da venda) ou criar a comanda do atendimento fora do gatilho comanda_do_atendimento

❌ Receber dinheiro sem forma (PDV8): a baixa da receita, a entrada do crediário e a parcela no PDV pedem a forma — o crediário sem entrada e o "a receber" é que nascem sem meio, e nunca com `''`

```
❌ Criar FinancialTransaction fora de um Appointment concluído sem justificativa
❌ Criar pacote de cliente fora de pacote_vender (sessões, retrato do preço e dinheiro vão juntos) — o trazido de fora é pacote_trazer (F35)
❌ Migrar o saldo de um pacote de fora como venda a R$ 0 (entra no caixa, nas Vendas, no ticket e no app com recibo): é "Trazer pacote de fora" (decisão 1 da 8ª), sem lançamento
❌ Listar no catálogo de venda (ou deixar editar) o service_packages de_fora — é o registro do pacote trazido
❌ Gravar pela ficha da rede (venda, crédito, pontos, voucher, sessão) na unidade de cadastro da cliente ou na primeira da lista — com duas ou mais unidades, pergunta (D1 da 8ª)
❌ Estornar em parte um pagamento no cartão (crédito ou débito): o cartão estorna o pagamento inteiro (r2-fin-03) — no cancelamento do pacote é o "estornar o pagamento inteiro e lançar o usado de novo"
❌ Cancelar pacote fora de pacote_cancelar_devolvendo, ou fazer a conta do cancelamento na tela (é a simulação da mesma função), ou ler "pacote em andamento" sem tirar o cancelado (cancelado_em)
❌ Decidir no código se a sessão do pacote em aberto se agenda, ou se o vencido se cancela — é a regra da REDE (tenants.pacote_crediario_libera, pacote_vencido_cancela; itens 8 e 9 da auditoria), lida em conferirCredito e em pacote_cancelar_devolvendo
❌ Cancelar o plano fechado fora de plano_cancelar_devolvendo, com uma conta própria (preço de tabela, multa) ou mexendo no dinheiro fora de private.cancelamento_dinheiro — é a regra do pacote (decisão 2 do Heitor sobre a 9ª)
❌ Calcular desconto de venda fora de lib/vendas/desconto.ts, ou confiar no valor de desconto que o navegador manda
❌ Pôr desconto comercial em amount ou em loyalty_discount (é sale_discount no avulso; no pacote e no plano, o preço vendido)
❌ Gravar um parcelado como um lançamento só (cada parcela é um lançamento; divida com dividirEmParcelas) ou escrever em installments
❌ Mostrar o valor da parcela como saldo ÷ parcelas (a média arredondada não soma o saldo): é a divisão gravada, dividirEmParcelas / parcelasEmTexto (D2 da 7ª)
❌ Recortar a lista do financeiro por created_at (é data_de_referencia: pago no pagamento, em aberto no vencimento)
❌ Mexer no preço dos procedimentos do plano no checkout fora de plano_aplicar_desconto
❌ Reaproveitar pacote (client_packages) para o procedimento pré-pago — são separados (decisão do Heitor)
❌ Vender pré-pago fora de procedimento_vender, ou cancelar unidade fora de procedimento_cancelar_unidade_devolvendo
❌ Gravar a parcela do crediário da rede com o meio da entrada (é sem meio, escolhido ao receber — D6), ou dizer no contrato que ela é "no cartão de crédito"
❌ Deixar uma forma de pagamento escolhida de antemão numa tela de cobrança (o Pix calado — A37): nasce vazia, salvo o meio combinado no contrato
❌ Gravar na descrição de um lançamento texto interno da tela ("checkout novo paciente") — ela chega à cliente (A47)
❌ Registrar o que volta de um cancelamento como despesa "Devolução" a pagar — é estorno ou crédito interno, a escolha de quem cancela (D1, 6ª simulação)
❌ Ligar crédito (unidade pré-paga ou sessão de pacote) a agendamento fora de createAppointmentCore/ligarCredito, ou com o preço que o navegador mandou
❌ Gravar due_date como "AAAA-MM-DD" cru (meia-noite UTC = 21h da VÉSPERA em Brasília) — use vencimentoDoDia (lib/financeiro/lancamento.ts)
❌ Dar baixa sem a guarda do já pago/estornado (marcarPagoCore confere a linha devolvida)
❌ Gravar "cartão de crédito em N vezes" como parcelas a receber DA CLIENTE (ela pagou na hora: é UM lançamento pago, com cartao_vezes) — entrada + parcelas é o crediário da rede; o que a operadora deposita em parcelas mora em recebiveis_do_cartao, nascido pelo gatilho
❌ Contar a parcela da operadora (recebiveis_do_cartao) como receita ou como dívida da cliente — a receita é da venda, no dia dela
❌ Ler a taxa ou o prazo do cartão sem a bandeira do pagamento (é private.comissao_taxa_pct com a bandeira e private.prazo_da_operadora; o de 3 argumentos é só a regra geral)
❌ Dar à bandeira a taxa de OUTRA quantidade de vezes dela (a Elo do 3x no 5x) — sem a taxa exata na bandeira, vale a regra geral daquelas vezes (r4-f15-01)
❌ Pôr teto de negócio na taxa da maquininha (F16-3: só não negativa), ou ler a regra geral por payment_fees.taxa_pct sozinho (acima de 100% ela está em taxa_pct_sem_teto)
❌ Cair na taxa de OUTRA quantidade de vezes, na bandeira ou na regra geral (o 3x no 4x) — sem a taxa exata, é 0% e a tela avisa (F16-2); a taxa que existe é private.taxa_da_maquininha
❌ Ler a taxa, o prazo ou o "parcelar até" sem a maquininha da venda (C75): é private.taxa_da_maquininha / comissao_taxa_pct / prazo_da_operadora COM financial_transactions.maquininha_id; payment_fees e tenants.cartao_* são só o espelho da 1ª maquininha até a limpeza
❌ Caminho novo de cartão sem "Qual maquininha?" (CampoDaMaquininha + useFaltaAMaquininha/useRecusaDoPagamento na tela, recusaDasVezesDaRede com a maquininha e o método no servidor) — com mais de uma, a primeira não vale calada
❌ Pôr maquininha em despesa (o cartão da rede não é maquininha) ou assinar financial_transactions no Realtime (é o sinal financeiro_sinais)
❌ Ler ou gravar financial_transactions pela sessão (é o servidor, depois da trava e do alcance — a política restritiva financeiro_so_pelo_servidor recusa)
❌ Montar o rótulo de um pagamento de cartão sem a maquininha quando a rede tem mais de uma (é rotuloDaForma com maquininhaDoRotulo; no banco, private.rotulo_do_pagamento)
❌ Escrever "Entrada + parcelas" à mão numa tela (é ROTULO_DO_CREDIARIO)
❌ Contar como "a receber agora" a parcela do plano que ainda não venceu (já está combinada; é emAbertoDoPlano quem separa) — e cobrar o plano fora do PDV (PV-01: o check-in não cobra)
❌ Receber o saldo do plano sem travar o plano e conferir o saldo na mesma transação (duas abas recebiam o mesmo saldo duas vezes — F11; era o plano_receber do check-in)
❌ Fechar o checkout de um plano deixando de fora o atendimento de origem com preço e sem pagamento (atendimentoDeHojeDoPlano)
❌ Decidir na tela se um atendimento concluído está "a receber" (é atendimentos_a_receber), ou pedir pagamento de atendimento de R$ 0
❌ Gravar texto para pessoas (histórico, descrição) com o código da forma (CASH, CREDIT_CARD) — é rotuloDaForma no app e private.rotulo_da_forma no banco
❌ Cortar calado a entrada maior que o total (Math.min(entrada, total)) — é recusaDaEntradaAcimaDoTotal, na tela e no servidor (ven-02)
❌ Ler dinheiro digitado com uma regra própria (Number(s.replace…), parseFloat em campo de texto) — é parseDinheiro, e o NaN dele é recusa, não zero
❌ Ler "o lançamento do atendimento" (appointment_id) sem tirar o estornado — o atendimento pode ter o estornado e o recebimento novo (maybeSingle quebra; o "pago" mente)
❌ Devolver e.message num catch de action (o 'Forbidden' da trava ia em inglês para a tela) — é mensagemDoErro
❌ Gravar sold_by como quem registrou a venda quando a tela disse outra pessoa (ou ninguém) em "Quem vendeu" — sold_by é quem vendeu, registrado_por é quem registrou (com-06)
❌ Recusar a quantidade da venda de produto, da comanda, do pré-pago ou da devolução por ser grande (acima do comum é aviso — o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."): o impossível é o de lib/vendas/quantidades.ts, e o banco não prende a quantidade em 100 (os CHECKs de 20261207200001)
❌ Vender produto fora de produto_vender_itens (a de um produto só, produto_vender, é a versão velha e nada a chama), ou ler os produtos de uma venda pelo product_id do cabeçalho (no kit é só o primeiro: são os product_sale_items)
❌ Estornar o lançamento de uma venda de produto fora de produto_estornar_venda (a venda, o estoque e o custo não saberiam), ou contar product_sales sem tirar a estornada (estornada_em)
❌ Devolver parte de uma venda de produto estornando a venda inteira e vendendo de novo, ou fora de produto_devolver_itens — e ler o valor, as unidades ou o custo de uma venda de produto sem tirar o devolvido (price − valor_devolvido, custo − custo_devolvido)
❌ Preencher sozinho a "Forma do pagamento do usado" no estorno inteiro (com a do pagamento estornado ou qualquer outra): nasce vazia, quem cancela escolhe (comOPagamentoInteiro — item 13 da auditoria, decisão do Claude pelo princípio 4)
❌ Devolver em dinheiro, no estorno da venda de crédito, o crédito CONCEDIDO (o "Conceder crédito", o bônus de outra venda): ele fica com a cliente (credito_estornar_venda — item 6 da auditoria)
❌ Recusar, no app, o aceite do plano com a proposta vencida: avisa (avisoDaPropostaVencida) e aceita (item 7 da auditoria, decisão do Claude pelo princípio 2)
❌ Dar o produto acrescentado na comanda a quem atendeu como quem vendeu: é o "Quem vendeu os produtos", que nasce vazio (com-06, r2-ven-12)
❌ Aplicar o voucher antes do desconto comercial, ou numa ordem diferente em algum caminho: é desconto → voucher → pontos em todo lugar (o Heitor, 2026-11-18)
❌ Mostrar o a receber vencido como "Pendente", ou decidir no navegador se venceu (o dia é do servidor: situacaoDoVencimento; os números, metrics_a_receber_vencido — D13 da 9ª)
❌ Tabela de lançamentos sem cards-mobile, ou as Transações da ficha fora de ordenarTransacoesDaFicha (o em aberto primeiro, pelo vencimento — item 17 do escopo de 18/11; o resto pela data que a linha mostra — D7 da 10ª)
❌ Gravar ou mandar ao servidor o "Valor entregue" do troco, ou receber em dinheiro com o entregue menor que o valor (recusaDoTroco — item 14 do escopo de 18/11)
❌ Trocar o due_date de um lançamento sem lancamento_remarcar_vencimento (o histórico da remarcação se perde — A37 da 9ª)
❌ Calcular a taxa ou o líquido de um lançamento na tela (o CSV) — é metrics_taxa_dos_lancamentos, a conta do lucro (A31 da 10ª)
❌ Rotular o cartão do caixa só "Despesas": é "Despesas pagas (caixa)", que tem a compra de estoque e o pagamento das comissões (A24 da 10ª)
❌ Recusar o prazo da operadora, o limite do crediário ou as parcelas e repetições da despesa por serem grandes (acima do comum é aviso — princípio 2; o Heitor, 25/11: "Se não for impossível, ainda que improvável, pode ser feito."), pôr teto na parcela no banco (financial_transactions_parcela_coerente), ou cortar as parcelas em silêncio ao gerar os lançamentos
❌ Vender crédito interno pelo "Conceder crédito" (fica fora do caixa) ou por um lançamento manual (o crédito não nasce): é credito_vender, a aba "Crédito interno" da Nova venda (decisão 1 da 9ª)
❌ Estornar o lançamento da venda de crédito fora de credito_estornar_venda (o dinheiro voltava e o crédito ficava), ou devolver mais que o saldo que a cliente ainda tem
❌ Lançar o bônus do crédito interno como receita, ou deixar o bônus no saldo depois do estorno da venda (ele sai junto, inteiro ou na proporção — a rede escolhe; A20 da 11ª)
❌ Tirar do dia do pagamento um estorno feito noutro dia (o Fechamento de um dia passado não muda): o estorno é a saída do dia em que foi feito — metrics_movimentos_pagos (D2 da 12ª, princípio 5)
❌ Gravar um contra-lançamento de estorno (category = 'Estorno') sem estorno_de (o pagamento que ele estorna): sem a ligação, ele cai na regra antiga e some dos dois dias
❌ Somar ENTRADAS a partir de metrics_receitas_pagas sem separar o estorno de outro dia (estorno_de, linha negativa): é saída, não entrada negativa
❌ Pôr o estorno de uma DESPESA nos "Estornos do dia" ou com o sinal de devolução à cliente: o dinheiro voltou ao caixa (D3 da 12ª)
❌ Somar o "caixa da lista" (ou a coluna do CSV) por uma regra própria: é o no_caixa de metrics_caixa_dos_lancamentos (D9 e A45 da 12ª)
❌ Pôr o desconto de uma venda em cada parcela do CSV (ele sai UMA vez por venda — extrasDoCsv, A44 da 12ª)
❌ Dizer "Ver e dar baixa" ou "use Pagar na linha" a quem não tem a baixa (quem só vê o Financeiro — A42 da 12ª)
❌ Link para o Financeiro com ?aberto=todos ou ?aberto=a-pagar: é ?aba=a-receber / ?aba=a-pagar (linkDaAba, lib/financeiro/abas.ts — FI1)
❌ Pôr no topo do Financeiro outro botão além do "Novo lançamento" (o crédito interno é da ficha da cliente — FI7)
❌ Ler a lista de lançamentos no Resumo (ele é feito dos números de lib/metrics; a lista é das abas — FI2)
❌ Filtrar a lista do Financeiro por tag na tela, depois de ler (é na consulta: comAsTags, o embed INNER da cliente), ou deixar o ?tags= de fora de um link de aba ou da troca de período
❌ Recriar uma política de leitura ou escrita em financial_transactions para a sessão (saiu no FI8; a lista é do servidor)
❌ Ler "os membros da unidade" em users com branch_id.eq sozinho: as outras unidades ficam de fora — é filtroDosMembrosDaUnidade / membroAlcancaAUnidade (D1 da 17ª)
❌ Dizer "Bateu" no fechamento com o registrado de agora e o conferido de um fechamento em que ele era outro (D2 da 17ª: "a conferir")
❌ Somar no valor da comanda da venda o lançamento "Estornada" que ganhou o reaberto (estornar_e_reabrir): o reaberto é ele de novo (D1 da 19ª)
❌ Mostrar a hora da âncora (meio-dia de Brasília) de um pagamento gravado só com a data: é a data só (diaSemHora — A24 da 32ª)
```
