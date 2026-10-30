# Comissões

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.7 Comissões (reforma de 2026-09-30, três fases no código)

Decisões do Heitor; o plano inteiro está no DEVLOG ("Comissões").

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
- **Só o servidor grava regra**: `comissao_regras_definir` e
  `comissao_do_procedimento_definir` (service_role, conferem profissional e
  procedimentos da rede). A sessão só LÊ — até 2026-09-30
  qualquer funcionário gravava `commission_rules` pelo PostgREST.
- **Configuração da REDE** (`commission_configs`, Configurações → Comissões,
  `financial: MANAGE` + abrangência de rede): `modo` (ATENDIMENTO, sobre o preço
  ao concluir | PAGAMENTO, sobre o recebido), descontos da base
  (`desconta_insumos`, `desconta_taxa`), `base_com_pontos` (PRECO | VALOR_PAGO,
  veio de `loyalty_configs.commission_base`) e `periodo` do fechamento
  (MENSAL | QUINZENAL | SEMANAL). **Taxas da maquininha** em `payment_fees`
  (Pix, débito, crédito 1–12x), gravadas por `comissao_taxas_definir`.
- **A comissão da VENDA DE PRODUTO** (D4, decisão do Heitor, 2026-10-29: "é
  configurável pela clínica"; migration `20261029001306`): Configurações →
  Comissões → "Venda de produto", `commission_configs.produto_pct` (vazio = sem
  comissão; mesma permissão e abrangência da configuração). Vale para QUEM
  REGISTROU a venda (`product_sales.sold_by`, como o pacote e o pré-pago), sobre
  o VENDIDO (com o desconto). A linha (`commission_lines.origem = 'PRODUTO'`,
  `product_sale_id`, sem atendimento — `appointment_id` e o do extrato aceitam
  nulo) nasce em `produto_vender`, antes do dinheiro, e é SEMPRE do modo
  "quando paga": à vista libera na hora, a receber quando entrar, o estorno
  devolve (`comissao_alvo`, o mesmo ramo do pré-pago). Retrata a taxa da
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
    sem atendimento) nasce em `pacote_vender`, antes do dinheiro, e é SEMPRE do
    modo "quando paga": à vista libera na hora; a receber, na proporção do que
    entrou (pacote de R$ 800 com 10%: R$ 40 a cada parcela de R$ 400); o
    estorno devolve a parte dele. É o ramo do pacote em `comissao_alvo`.
    Retrata a taxa da maquininha da rede; não desconta insumos.
  - **De execução**, para quem atende cada sessão (`comissao_execucao`):
    `REGRA` (a regra do profissional — o padrão, e o que valia para todo pacote
    antes), `PERCENTAGE` (da parte da sessão no rateio), `FIXED_AMOUNT` (por
    sessão) ou `NENHUMA` (sem linha). `linhasDoAtendimento` lê o retrato
    (`regraDaSessaoDePacote`) — vale também para quem não tem regra nenhuma —,
    e o modo da rede (no atendimento × quando paga) segue valendo para ela.
  - **"Abater do pacote"** segue a execução do pacote: com `REGRA`, a linha
    avulsa vira a de pacote com a mesma regra (o de antes); com a do pacote, a
    avulsa é CANCELADA e nasce UMA linha com a regra dele (ou nenhuma).
  - O extrato (`comissoes_extrato`, coluna `pacote`) diz "Venda do pacote X" e
    "Sessão do pacote X"; o fechamento é o de sempre.
  - Prova: `e2e/comissoes-pacote.spec.ts`.
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
- **A conta mora no BANCO, e só lá**: `private.comissao_alvo` diz quanto a
  linha deve AGORA, e `private.comissao_acertar_linha` lança a diferença para o
  já lançado (trava por linha; chamar duas vezes não lança duas). Não há cópia
  em TS — o recebimento do plano entra por gatilho e precisa dela.
  - Percentual: sobre preço − desconto comercial (sempre) − pontos/voucher
    (se saem da base) − taxa do recebimento (se marcada) − insumos (se
    marcados). Valor fixo: só pontos e voucher o reduzem, na proporção; taxa,
    insumos e desconto comercial não. No pacote e no plano o desconto já está
    no preço da sessão e do procedimento (§9.6).
  - ATENDIMENTO: devida desde a conclusão; o pagamento acerta (taxa, base com
    pontos) e o estorno do pagamento a zera; o recebimento novo depois do
    estorno (§9.6, D6 de 2026-10-28) a devolve UMA vez — a conta lê o
    lançamento vivo do atendimento, e o estornado só quando não há outro.
  - PAGAMENTO: avulso só vale pago; plano e pacote liberam na proporção do que
    receberam (receita paga, sem estorno ÷ soma dos procedimentos do plano, ou ÷
    preço da venda do pacote). Pacote vendido antes de 2026-09-30 (sem venda no
    sistema) libera na conclusão.
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
  setembro é dinheiro de outubro, e o plano no modo "quando paga" libera meses
  depois da sessão.
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
- Prova: `e2e/comissoes-configuracao.spec.ts`, `e2e/comissoes-calculo.spec.ts`
  e `e2e/comissoes-fechamento.spec.ts`; os valores do eixo novo no
  `e2e/indicadores-cenario.spec.ts`.

---

## O que nunca fazer aqui

```
❌ Gravar em commissions fora de comissao_acertar_linha, ou calcular valor de comissão no TypeScript (a conta é comissao_alvo)
❌ Decidir a regra de um procedimento sem as gerais (regraAplicavel sem o terceiro argumento ignora "a mesma para todos")
❌ Mandar ao banco a base de comissão que o navegador enviou (plano e pacote se leem em linhasDoAtendimento)
❌ Cancelar ou marcar falta num atendimento concluído — o que se desfaz é o pagamento (estorno)
❌ Recortar comissão por scheduled_at do atendimento (o período é o do lançamento, released_at)
❌ Mostrar comissão de outra pessoa sem financial com escopo de todos (team e reports não bastam)
❌ Pagar comissão fora de comissao_fechar (a despesa e os lançamentos pagos vão juntos)
❌ Estornar a despesa de um fechamento fora de comissao_estornar_fechamento (os lançamentos têm de voltar a "a pagar")
```
