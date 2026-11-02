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
  - avulso: quando o atendimento está pago;
  - pacote (a comissão de venda E a de cada sessão já feita), plano, pré-pago e
    venda de produto: quando a venda inteira está paga — o recebido (com os
    pontos, que são forma de pagamento) fecha com o preço vendido;
  - **crédito em N vezes é pago na hora** (`cartao_vezes`, um lançamento
    pago): libera na hora. O que espera é só o que a cliente ainda deve à
    CLÍNICA — o crediário (entrada + parcelas a receber), o avulso concluído
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
  "atende" sem padrão).
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
  `comissao_regras_definir` recusa. Muda quem tem `financial: MANAGE` e é da
  rede. Prova: `e2e/comissoes-por-procedimento.spec.ts`.
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
    não dela (decisão desta frente, para o Heitor revisar). Vale nas duas
    portas: o chip (`salvarComissaoDoProcedimento`) e o modal do procedimento
    (antes de gravar o procedimento), e `gravarComissaoDoProcedimento` confere
    de novo. Prova: `e2e/comissoes-procedimento-da-admin.spec.ts`.
- **Só o servidor grava regra**: `comissao_regras_definir` e
  `comissao_do_procedimento_definir` (service_role, conferem profissional e
  procedimentos da rede). A sessão só LÊ — até 2026-09-30
  qualquer funcionário gravava `commission_rules` pelo PostgREST.
- **Configuração da REDE** (`commission_configs`, Configurações → Comissões,
  `financial: MANAGE` + abrangência de rede): `modo` (só `INTEGRAL` desde
  2026-11-01, acima; era ATENDIMENTO | PAGAMENTO), descontos da base
  (`desconta_insumos`, `desconta_taxa`), `base_com_pontos` (PRECO | VALOR_PAGO,
  veio de `loyalty_configs.commission_base`) e `periodo` do fechamento
  (MENSAL | QUINZENAL | SEMANAL). O padrão é a **base cheia**, e a tela diz
  com essas palavras (J-46, 2026-10-30: a dona achava que a comissão
  descontava taxa e insumo): a configuração e o extrato usam a MESMA frase,
  `rotuloDaBase` — "base cheia (sem taxa nem insumo descontados)" ou o que
  saiu dela —, o extrato pelo retrato de cada linha (`comissoes_extrato`
  devolve `desconta_taxa`/`desconta_insumos`; migration `20261029001502`), e
  o CSV ganhou a coluna "O que saiu da base". **Taxas da maquininha** em `payment_fees`
  (Pix, débito, crédito 1–12x), gravadas por `comissao_taxas_definir`.
- **A comissão da VENDA DE PRODUTO** (D4, decisão do Heitor, 2026-10-29: "é
  configurável pela clínica"; migration `20261029001306`): Configurações →
  Comissões → "Venda de produto", `commission_configs.produto_pct` (vazio = sem
  comissão; mesma permissão e abrangência da configuração). Vale para QUEM
  REGISTROU a venda (`product_sales.sold_by`, como o pacote e o pré-pago), sobre
  o VENDIDO (com o desconto). A linha (`commission_lines.origem = 'PRODUTO'`,
  `product_sale_id`, sem atendimento — `appointment_id` e o do extrato aceitam
  nulo) nasce em `produto_vender`, antes do dinheiro, e libera com a venda
  paga inteira (H4): à vista ou no cartão em N vezes, na hora; no crediário,
  com a última parcela; o estorno devolve (`comissao_alvo`, o mesmo ramo do
  pré-pago). Retrata a taxa da
  maquininha da rede; não desconta insumos. O extrato (`comissoes_extrato`)
  diz a cliente e o produto; o fechamento é o de sempre. Prova:
  `e2e/vendas-produto.spec.ts` ("a comissão da venda de produto").
- **A comissão do PACOTE é do cadastro de cada pacote** (decisão do Heitor,
  2026-10-30; migration `20261029001501`): Vendas → Pacotes, seção "Comissão"
  do formulário (só para quem tem `financial: MANAGE`, da rede e com
  comissões no plano — `podeMudarComissaoDoProcedimento`; `salvarPacote`
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
  - Prova: `e2e/comissoes-pacote.spec.ts`, `e2e/pacote-cancelar.spec.ts` (o
    cancelamento).
- **Ao criar quem atende** (2026-10-27, A10), o formulário de novo membro
  oferece "Comissão padrão (%)": só o percentual padrão (as exceções seguem no
  chip), só com `financial: MANAGE` e comissões no plano — `createTeamMember`
  ignora o campo sem isso — e grava por `comissao_regras_definir`. Prova:
  `e2e/equipe-comissao-ao-criar.spec.ts`.
- A comissão de cada membro se define na **Equipe** (chip "Comissão …" na
  linha, `ComissaoDoMembro`), só com `financial: MANAGE` — gerir a equipe não
  dá acesso a quanto cada um ganha. Quem é de unidade só mexe nos da unidade
  (a Equipe da unidade mostra quem é da rede e atende ali, mas sem o chip: a
  comissão dele é da Equipe da rede). Vale para o Admin da rede que atende
  (D2, 2026-10-29): o chip aparece quando ele marca "Atende clientes".
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
  - Taxa: `private.comissao_taxa_pct` (a do meio; no crédito, a da maior
    parcela cadastrada até a do recebimento). No plano, ponderada pelo que
    cada recebimento pagou. As vezes do recebimento: `cartao_vezes` (crédito
    em N vezes, pago na hora — 2026-10-20), senão `parcela_total`, senão 1.
    O avulso usava sempre 1x.
- **Quem acerta**: a conclusão, e o gatilho `trg_comissoes_do_pagamento` em
  `financial_transactions` (pagamento, recebimento do plano, estorno — marcar
  `notes = 'Estornada'` é o estorno). `confirmar_pagamento_do_atendimento` não
  mexe mais em comissão, e `loyalty_configs.commission_base` não é mais lido.
- **Atendimento concluído não se cancela nem vira falta** (gatilho
  `trg_atendimento_concluido_nao_cancela` + `updateAppointmentStatus`): tem
  prontuário, baixa e comissão. Desfazer o dinheiro é estornar o pagamento.
- `period_ref` do lançamento é o mês de `released_at` (fuso de SP).
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
  - "Fechar e pagar" (`fecharComissoes`, `financial: MANAGE`, e nunca com
    escopo OWN) chama `comissao_fechar`, que numa transação reivindica o que
    está ABERTO e não fechado até o fim do período (ou até agora),
    cria `commission_payouts` e a **despesa paga** (categoria "Comissões", na
    unidade) e marca os lançamentos `PAID` com `payout_id`. Trava por
    profissional e unidade: dois cliques fecham uma vez.
  - Fechamento não se reabre: estorno depois dele vira lançamento negativo
    no próximo. Saldo negativo não fecha.
  - **Estornar um fechamento** (`estornarFechamento` →
    `comissao_estornar_fechamento`, com motivo): estorna a despesa por
    `estornar_transacao` e devolve os lançamentos dele a "a pagar". É a ÚNICA
    porta — o gatilho `trg_despesa_de_fechamento` recusa estornar essa despesa
    pelo financeiro comum (a comissão ficaria "paga" com o dinheiro de volta).
- **Eventos**: `comissao.gerada` (app, na conclusão, um por LINHA — a chave era
  por atendimento e a sessão de plano perdia os outros), `comissao.liberada`
  (banco, em `comissao_acertar_linha`, quando um pagamento libera) e
  `comissao.paga` (banco, em `comissao_fechar`).
- **Quem vê quanto cada um ganha é o financeiro com escopo de TODOS.** Com
  OWN, a pessoa vê só a própria linha ("Minhas comissões"; o financeiro da rede
  a manda para lá) e não fecha. O ranking do dashboard e a comissão na aba
  Profissionais dos relatórios exigem `financial` sem OWN — o dado nem sai do
  servidor. Antes ficavam sob `team` e `reports`, e mostravam a de todos.
- O ranking de comissão é `metrics_ranking_comissao` (ordena pela comissão;
  o dashboard reordenava o top 5 por atendimentos).
- Prova: `e2e/comissoes-configuracao.spec.ts`, `e2e/comissoes-calculo.spec.ts`,
  `e2e/comissoes-pagamento-integral.spec.ts` e `e2e/comissoes-fechamento.spec.ts`; os valores do eixo novo no
  `e2e/indicadores-cenario.spec.ts`.

---

## O que nunca fazer aqui

```
❌ Gravar em commissions fora de comissao_acertar_linha, ou calcular valor de comissão no TypeScript (a conta é comissao_alvo)
❌ Liberar comissão sobre o que a cliente ainda deve à clínica (crediário, avulso sem pagamento) — só com o pagamento integral; o cartão em N vezes JÁ é pago
❌ Criar linha de comissão em outro modo que não INTEGRAL (o gatilho trg_comissao_linha_integral garante), ou reescrever o modo de uma linha antiga
❌ Decidir a regra de um procedimento sem as gerais (regraAplicavel sem o terceiro argumento ignora "a mesma para todos")
❌ Mandar ao banco a base de comissão que o navegador enviou (plano e pacote se leem em linhasDoAtendimento)
❌ Cancelar ou marcar falta num atendimento concluído — o que se desfaz é o pagamento (estorno)
❌ Recortar comissão por scheduled_at do atendimento (o período é o do lançamento, released_at)
❌ Mostrar comissão de outra pessoa sem financial com escopo de todos (team e reports não bastam)
❌ Gravar a comissão de um procedimento sem recusaDaComissaoDaAdmin (quem não é Admin mexia no valor da Admin)
❌ Pagar comissão fora de comissao_fechar (a despesa e os lançamentos pagos vão juntos)
❌ Estornar a despesa de um fechamento fora de comissao_estornar_fechamento (os lançamentos têm de voltar a "a pagar")
```
