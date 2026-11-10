# Fidelidade

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.2.2 Fidelidade (configurável pela rede)

**O programa é da REDE, nasce DESLIGADO e cada rede configura** (decisão do
Heitor, 2026-09-28). A config mora em `loyalty_configs` (uma linha por rede) e é
editada em Configurações → Fidelidade — pede `settings: MANAGE` e abrangência de
rede. Desligado, **nenhum sinal de pontos aparece**: nem na ficha, nem no portal.

- **O ponto nasce no PAGAMENTO**, não na conclusão: gatilho
  `trg_fidelidade_ganho` em `financial_transactions` (receita paga, com cliente,
  que não é estorno nem crédito interno). Pelo mesmo argumento do §9.9: receita
  paga nasce em vários lugares do código. Emite `fidelidade.pontos_ganhos`.
- **Modo de ganho — a rede escolhe UM:** por real pago (`floor(valor ×
  points_per_real)`) ou por procedimento (`procedures.loyalty_points`, editado
  no cadastro do procedimento, só nesse modo). Plano é **cumulativo** pelo que
  já foi pago: entrada + restante somam exatamente os pontos do plano.
  A regra mora numa função só: `fidelidade_pontos_do_pagamento` — e multiplica
  antes de dividir (120 × (100 ÷ 300) perdia um ponto).
- **Os números com fração da configuração** (pontos por R$ 1, valor de 1
  ponto até 4 casas, teto em %) leem como o dinheiro: `parseDecimal`
  (`@estetica-os/utils`, o `parseDinheiro` com N casas). O ambíguo ("0.012")
  mostra `NUMERO_INVALIDO` ("use vírgula…") junto do campo e não salva. A tela
  tirava todos os pontos antes de trocar a vírgula: "0.5" ponto por real
  gravava 5, e "0.01" no valor do ponto, R$ 1 (frente de cadastro,
  2026-10-29). Os inteiros (mínimo, meses, bônus, dias) continuam lendo o
  ponto como milhar. Prova: `e2e/fidelidade-opcionais.spec.ts` ("0.5").
- **Cartão em N vezes pontua na VENDA, inteiro** (F2c, 2026-11-01): a
  cliente pagou tudo na maquininha. O que a operadora deposita em parcelas
  (`recebiveis_do_cartao`) não é pagamento e não pontua de novo. Prova:
  `e2e/financeiro-cartao-a-receber-da-operadora.spec.ts`.
- **O crédito na clínica VENDIDO pontua na venda, pelo dinheiro pago** (decisão
  1 do Heitor sobre a 9ª simulação, 2026-11-07: "os pontos na VENDA do
  crédito, pelo dinheiro pago, não no uso"; `vendas-financeiro.md` §9.3.4):
  `floor(valor × points_per_real)` em QUALQUER modo de ganho — também "por
  procedimento", que o crédito não tem procedimento (como o produto). O uso
  depois, pago com crédito interno, não pontua. O estorno da venda do crédito
  tira os pontos do que voltou (na proporção, no estorno parcial). É o
  primeiro ramo de `fidelidade_pontos_do_pagamento` (`credito_vendido_id`).
  Prova: `e2e/vendas-credito-na-clinica.spec.ts`.
- **Estorno** (`estornar_transacao`) tira exatamente o que aquele pagamento deu
  (lê o GANHO). Saldo pode ficar **negativo**, como estoque.
- **Ajuste manual** pela equipe (`loyalty: MANAGE`), com motivo, por
  `ajustar_pontos` — débito acima do saldo é recusado.
- **Saldo = SOMA do extrato** (`saldo_de_pontos`). `loyalty_accounts.balance`
  saiu do banco (fase 4). Extrato e conta só se LEEM pela sessão: quem
  escreve é o gatilho e o servidor, com a trava `fidelidade:<cliente>`.
- Módulo `loyalty`: VIEW = saldo e extrato; MANAGE = ajustar. Configurar é
  Configurações. **Quem só vê lê a quem pedir** (A38 da 9ª simulação,
  2026-11-07; a regra de cargo fica, como a A33 da 8ª): na ficha, "Trocar
  pontos por recompensa e ajustar pontos é de quem tem a Fidelidade em
  Gerenciar: Lúcia, Fernanda." (`[data-quem-troca]`, `quemTrocaPontos`,
  `lib/equipe/quem-desfaz.ts`: ativos, ao alcance da unidade, e a Admin da
  rede); no app sem a troca pelo portal, "A troca é feita na recepção, com
  quem cuida da fidelidade: Lúcia." (pela unidade do endereço). Prova:
  `e2e/financeiro-ficha-e-app-da-9.spec.ts` ("A38").
- **Pontos como desconto no pagamento** (fase 2): na recepção, o cliente abate
  pontos do atendimento. Regras da rede: valor do ponto, mínimo e teto (% do
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
  mais `loyalty_configs.commission_base` (a coluna ficou sem leitor).
- Pago todo com pontos: `amount` 0, sem forma de pagamento, sem "Purchase" na
  API de Conversões (o `pagamento.recebido` sai, com 0).
- Estorno devolve os pontos usados (ESTORNO_RESGATE) e tira os ganhos.
- **Pacote cancelado** (F2b, 2026-11-01; `vendas-financeiro.md` §9.3.1): os
  pontos seguem o estorno. Devolvido como ESTORNO, cada lançamento estornado
  inteiro tira o que deu (`estornar_transacao`), e o estornado EM PARTE tira
  na proporção do que voltou (ESTORNO_GANHO de `pontos × voltou ÷ pago`,
  ligado ao contra-lançamento "Estorno parcial"). Devolvido como CRÉDITO na
  clínica, os pontos ficam: o dinheiro não voltou (e pagar com crédito interno
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
  que voltou, o crédito na clínica os deixa. Prova:
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
  - Cancelar voucher não usado devolve os pontos; vencido (derivado de
    `expires_at`) não vale e não devolve; estorno do pagamento o reativa.
  - **O formulário diz quanto os pontos valem e de onde vem o procedimento**
    (A5 da 7ª simulação, 2026-11-05; princípio 3): "Procedimento grátis" diz
    que o procedimento precisa estar cadastrado em Procedimentos (com o link;
    `data-procedimento-da-recompensa`), e o custo diz "2.000 pontos valem
    R$ 20,00 pelo valor do ponto (R$ 0,01…) — o procedimento custa R$ 150,00
    na tabela" (`data-valor-dos-pontos`, o `redeem_points_value` da
    configuração). Nada é recusado: a clínica decide o custo (princípio 2).
    Prova: `e2e/configuracoes-atritos-da-7.spec.ts` ("A5").
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
- **Abrangência** (fase 4): rede inteira (padrão) ou só na unidade
  (`scope_per_branch`). Todo lançamento sempre levou `branch_id`; "só na
  unidade" é o saldo filtrado por ela — pagamento, troca de recompensa e
  débito só usam o saldo da unidade onde acontecem (`saldos_por_unidade`
  para a ficha). **A troca é recusada depois do primeiro lançamento da rede**
  (action e tela travada): mudaria em silêncio o saldo de quem já tem.
- **Opcionais da rede** (decisão do Heitor, 2026-09-29) — todos nascem
  DESLIGADOS e se ligam na aba Fidelidade:
  - **Bônus de aniversário** (`birthday_bonus`) e **de primeiro acesso**
    (`first_access_bonus`): lançamento BONUS, uma vez por `bonus_ref`
    (`ANIVERSARIO:<ano>`, `PRIMEIRO_ACESSO`) — é o índice único que impede dar
    duas vezes, não o app. Quem nasceu em 29/02 ganha em 28/02 fora de ano
    bissexto. O primeiro acesso é POR FICHA (por clínica, desde 2026-10-19:
    a mesma pessoa pode ser cliente de várias com um login só) — o login marca
    a ficha do token, e o layout do portal marca cada outra na primeira vez
    que ela abre aquela clínica. É o primeiro login do cliente
    (`clients.app_account_created_at`, marcado por `fidelidade_primeiro_acesso`
    no `loginAction` e na sessão do app); quem já tinha entrado antes da
    opção existir não ganha.
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
  - **Troca pelo portal** (`client_redeem`): o cliente troca pontos por
    recompensa em `/[slug]/cliente/fidelidade` (`actions/fidelidade-portal.ts`),
    com o saldo da unidade daquele portal quando a abrangência é por unidade.
    Desligada, só a equipe troca, na ficha.
  - **A recompensa fora do alcance diz quanto falta** (J-52, 2026-10-30):
    "Faltam 120 pontos" embaixo do "Trocar" desabilitado, no app e na ficha —
    o texto é UM, `faltamPontos` (`lib/fidelidade/formato.ts`). Sem a troca pelo
    app (`client_redeem` desligado), o app mostra o "Faltam N pontos" embaixo do
    custo da recompensa (A58 da 5ª simulação). Prova:
    `tests/fidelidade-faltam-pontos.test.ts`, `e2e/fidelidade-opcionais.spec.ts`,
    `e2e/fidelidade-vouchers.spec.ts`.
  - **Aviso de vencimento por push** (`expiry_notice_days`, só com validade):
    `avisos_de_vencimento` REIVINDICA o aviso antes de o push sair (a conta
    guarda até onde já avisou) — um aviso por lote novo na janela, nunca um
    por dia nem dois por passagem concorrente.
  - A rotina é o cron `fidelidade`: expirar → aniversário → avisos, nessa
    ordem (avisar antes de expirar contaria o que acabou de vencer).
  - ⚠️ As três funções da rotina aceitam `p_tenant` (nulo = todas, o cron).
    **Teste que as chama com data escolhida à mão passa a rede `[e2e]`** — sem
    o recorte, "e se hoje fosse 2027?" vence pontos e dá bônus de clientes
    reais na produção.
- **O painel Fidelidade da ficha segue as props do servidor** (D16 da
  simulação de 2026-10-29): o saldo, o extrato e os vouchers copiados para o
  estado são trocados pelos novos quando o `router.refresh` (da venda, do
  pagamento) traz outra referência de `fidelidade`. O cartão "Pontos" dizia
  800 e o painel "Nenhum ponto ainda" até recarregar. Prova:
  `e2e/fidelidade-painel-atualiza.spec.ts`.

---

## O que nunca fazer aqui

```
❌ Dar ponto de fidelidade no TypeScript (o ponto nasce no gatilho do pagamento; o saldo é saldo_de_pontos)
❌ Calcular vencimento de pontos fora de fidelidade_a_expirar (é a única cópia do FIFO)
❌ Mostrar qualquer sinal de pontos com o programa da rede desligado
❌ Pôr o desconto de pontos em amount (amount é o dinheiro recebido; o desconto é loyalty_discount)
❌ Confirmar pagamento de atendimento fora de confirmar_pagamento_do_atendimento, ou confiar no valor que o navegador manda
❌ Ler o voucher pela recompensa (o voucher tem o retrato de quando foi trocado) ou deixar o cliente trocar pontos sem client_redeem ligado
❌ Chamar expirar_pontos / fidelidade_bonus_aniversario / avisos_de_vencimento em teste sem p_tenant (vale para as redes reais)
```
