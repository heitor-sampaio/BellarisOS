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
- **Estorno** (`estornar_transacao`) tira exatamente o que aquele pagamento deu
  (lê o GANHO). Saldo pode ficar **negativo**, como estoque.
- **Ajuste manual** pela equipe (`loyalty: MANAGE`), com motivo, por
  `ajustar_pontos` — débito acima do saldo é recusado.
- **Saldo = SOMA do extrato** (`saldo_de_pontos`). `loyalty_accounts.balance`
  saiu do banco (fase 4). Extrato e conta só se LEEM pela sessão: quem
  escreve é o gatilho e o servidor, com a trava `fidelidade:<cliente>`.
- Módulo `loyalty`: VIEW = saldo e extrato; MANAGE = ajustar. Configurar é
  Configurações.
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
    bissexto. O primeiro acesso é o primeiro login do cliente
    (`clients.app_account_created_at`, marcado por `fidelidade_primeiro_acesso`
    no `loginAction` e na sessão do app); quem já tinha entrado antes da
    opção existir não ganha.
  - **Troca pelo portal** (`client_redeem`): o cliente troca pontos por
    recompensa em `/[slug]/cliente/fidelidade` (`actions/fidelidade-portal.ts`),
    com o saldo da unidade daquele portal quando a abrangência é por unidade.
    Desligada, só a equipe troca, na ficha.
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
