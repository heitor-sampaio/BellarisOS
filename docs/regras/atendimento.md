# Agenda, procedimentos, prontuário, estoque e conclusão do atendimento

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.1 Agenda
- **O horário de funcionamento é da UNIDADE e, dentro dele, do PROFISSIONAL**
  (decisão do Heitor, 2026-10-21): `branches.horario` e `users.horario`
  (jsonb, por dia da semana, com pausa), editados em Configurações → Unidades e
  na Equipe ("segue o horário da unidade"). Sem cadastro, a unidade é segunda a
  sábado 08–20 e o profissional segue a unidade. A conta é UMA, pura, em
  `lib/agenda/horario.ts` (`normalizarHorario` confere o que vem da tela):
  - os livres (`computeAvailableSlots`: app da cliente, CRM, Copilot) só
    dentro de unidade ∩ profissional, inteiros num período (não atravessam a
    pausa) e, hoje, nunca antes de agora;
  - a grade da agenda (dia) abre e fecha no horário da unidade, estendida pelos
    agendamentos que caem fora dele;
  - a capacidade da ocupação (`capacidadeEmMinutos`, §13.1).
  A equipe ainda marca fora do horário (encaixe): os seletores do checkout e
  das sessões do plano continuam livres. Prova:
  `e2e/agenda-horario-de-funcionamento.spec.ts`, `tests/agenda-horario.test.ts`.
- Status: `SCHEDULED → CONFIRMED → ARRIVED → IN_PROGRESS → COMPLETED → CANCELLED | NO_SHOW`
- Campos de timestamp por transição: `confirmedAt`, `arrivedAt`, `startedAt`, `completedAt`, `cancelledAt`
- **Confirmar e chegar são passos diferentes** (2026-10-21, decisão do Heitor;
  migrations `20261021000009/10`): CONFIRMED é "confirmou presença"; ARRIVED
  ("Chegou", `arrived_at`) é o check-in — a cliente está na sala de espera.
  Antes os dois gravavam CONFIRMED. O check-in (`checkinCore`, a agenda e o
  Copilot) vale de Agendado (chegar também confirma) ou de Confirmado; o
  atendimento começa de Confirmado ou de Chegou. Chegar emite os documentos do
  início, como confirmar. Lista nova de status "em aberto" inclui ARRIVED.
  Prova: `e2e/agenda-check-in.spec.ts`.
- **A profissional marca a chegada e inicia num gesto** (A21 da simulação de
  2026-10-27): no agendamento DELA que ainda não chegou (Agendado ou
  Confirmado), a tela do atendimento e a janela da agenda mostram "Marcar
  chegada e iniciar" (`chegarEIniciar`, `actions/appointments.ts`) — o MESMO
  `checkinCore` (documentos do início, e o plano em aberto aparece na tela
  como em todo check-in) e depois o MESMO `startAppointment` (a trava dos
  documentos). Com a agenda "só os meus", só no agendamento dela. Sem o
  check-in no cargo, a tela diz que a recepção marca a chegada. Prova:
  `e2e/agenda-chegar-e-iniciar.spec.ts`.
- **"Não compareceu" só depois do início** do agendamento (a folha esconde, a
  action recusa). `updateAppointmentStatus` devolve `{ error }` (só a trava de
  permissão lança): a folha mostra o erro e, no sucesso, a agenda dá o aviso
  (o `toast` do sonner, o de todo o app). A agenda da unidade leva o dia na URL (`?date=`), e a
  grade de hoje abre na hora de agora. Prova: `e2e/agenda-avisos.spec.ts`.
- **O prontuário na ficha da cliente** é a aba "Prontuário" (a chave segue
  `fichas`): aparece para quem pode ver o clínico mesmo antes do primeiro
  atendimento, com a anamnese. **A alergia vai em destaque** na ficha e no
  atendimento (`alergiasDaAnamnese` + `AlertaDeAlergia`: o campo `allergies` ou
  de rótulo "alerg…", sem "não"/"nenhuma"), só para quem vê o prontuário.
  "Aguardando confirmação do cliente pelo app" só para quem TEM o app.
  Prova: `e2e/prontuario-atritos.spec.ts`.
- Campo `source`: `INTERNAL` (equipe pelo web/app), `CLIENT_APP` (cliente pelo portal, só procedimentos `visible_on_client_app`), `COMMERCIAL` (o time comercial agendando pelo CRM, `createCrmAppointment`). `ONLINE` é legado do agendamento público, que foi descartado — não usar em código novo.
- **A cliente cancela e remarca pelo portal até o prazo da rede**
  (`tenants.portal_prazo_alteracao_horas`, 24h por padrão, Configurações →
  Geral; decisão do Heitor, 2026-10-21): o cartão da agenda abre o detalhe
  (`/[slug]/cliente/agendamentos/[id]`, só a ficha DELA), e
  `actions/portal-agendamentos.ts` confere de novo o prazo e o status; o horário
  novo é um dos livres do self-service, para o mesmo profissional. Dentro do
  prazo, só "Falar com a clínica" (WhatsApp da unidade). Prova:
  `e2e/portal-cliente-alterar-agendamento.spec.ts`.
- **"Mostrar cancelados"** (2026-10-21, decisão do Heitor): a agenda da
  unidade deixa o cancelado e a falta fora da grade; o botão do cabeçalho
  (`?cancelados=1`, a consulta do servidor) os traz de volta, apagados, riscados
  e com o motivo (`cancellation_reason`). Não contam em nada (atendimentos,
  ocupação, a contagem do profissional) e não se arrastam; no dia, dividem o
  horário com quem o ocupou depois (o ativo à esquerda). A agenda da rede, que
  sempre os mostrou, apaga o bloco e diz o motivo. Prova:
  `e2e/agenda-cancelados.spec.ts`.
- **Cancelar (ou faltar) devolve o que estava pago**: o gatilho
  `private.pre_pago_libera` solta a unidade pré-paga, a sessão de pacote e a
  sessão do plano (estas duas ficavam presas ao agendamento cancelado).
- **O procedimento novo nasce FORA do app** (`visible_on_client_app` desligado,
  2026-10-21): só vai para o self-service o que a clínica marca. Nascia ligado,
  e a Toxina da simulação ficaria agendável pelo app.
- **Todo agendamento tem procedimento.** A "avaliação" era a exceção que
  permitia marcar sem escolher um — ela deixou de ser entidade em 2026-09-25 e
  virou um procedimento como outro qualquer, com a ficha que precisar. Não há
  mais `is_evaluation` em lugar nenhum: se o atendimento é uma avaliação,
  isso está no procedimento escolhido.
- O funil comercial passou a ser medido por `source = COMMERCIAL`, que é
  o que a métrica de "avaliações agendadas × comparecimento" sempre quis saber.
- `clientNotes`: observações que o cliente envia ao agendar pelo app
- `roomId`: sala/cabine opcional — uma sala não pode ter dois agendamentos simultâneos (validar no action)
- `cancellationReason`: obrigatório ao cancelar para rastreabilidade
- Ao marcar `COMPLETED`: consumo de estoque + comissão, numa transação — ver §10. Os pontos de fidelidade NÃO nascem aqui: nascem no pagamento (§9.2.2).

---

### 9.3 Procedimentos
- `branchId: null` = catálogo base da rede (criado pelo NETWORK_ADMIN)
- `visibleOnClientApp`: controla se o procedimento aparece para o cliente agendar pelo app
- `ProcedurePriceHistory`: criada automaticamente ao alterar `price` de um procedimento
- `ProcedureProduct`: insumos consumidos por execução — base do consumo automático de estoque
- **Categorias da rede** (`procedure_categories`, 2026-10-14; Procedimentos →
  Categorias): eram quinze fixas no código. `procedures.category` continua
  TEXTO (relatórios agrupam pelo nome); a tabela é o vocabulário — cresce
  sozinho por gatilho em `procedures`, sem caixa, e a rede nova nasce com as
  quinze (`private.categorias_de_procedimento_padrao`). Renomear troca em todos
  os procedimentos e junta se o nome já existe
  (`renomear_categoria_de_procedimento`); arquivar tira das opções. O cadastro
  sempre oferece a categoria ATUAL do procedimento, mesmo arquivada ou de fora
  — senão abria em "Selecione…" e salvar a trocava. Gerencia quem tem
  `procedures: MANAGE` e abrangência de rede. Prova:
  `e2e/categorias-de-procedimento.spec.ts`.

Query correta para buscar procedimentos de uma filial — o catálogo base da
rede (`branch_id` nulo) MAIS o que é local da unidade:
```typescript
const procedures = await ler(
  admin.from('procedures')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .or(`branch_id.is.null,branch_id.eq.${ctx.branchId}`),
  'listar os procedimentos da unidade',
)
```

---

### 9.4 Prontuário
- `MedicalRecord`: 1 por cliente
- `MedicalRecordEntry`: 1 por `Appointment` concluído (`appointmentId @unique`)
- **A ficha do procedimento é UMA**, montada no construtor
  (Configurações → Fichas, tabela `forms`) e ligada ao procedimento por
  `procedures.form_id`. As respostas ficam em
  `medical_record_entries.form_data`.
  - Eram DUAS — "de anamnese" e "de atendimento" —, com o mesmo construtor, os
    mesmos campos possíveis e o mesmo momento de preenchimento. Quem cadastrava
    um procedimento tinha de escolher em qual das duas pôr cada pergunta, e a
    escolha não mudava nada. Unificadas em 2026-09-25.
  - **Não confundir com `medical_records.general_anamnesis`**: aquilo é o
    questionário de saúde do CLIENTE, preenchido uma vez, que alimenta o termo
    de consentimento e o planejamento. Esse continua existindo e é outra coisa.
- **A anamnese geral é a ficha de PRÉ-ATENDIMENTO da rede** (2026-10-20,
  decisões do Heitor): perguntas sobre a PESSOA (alergias, medicamentos,
  gestação…), iguais para qualquer atendimento.
  - **Uma ficha por rede**: `forms.tipo = 'PRE_ATENDIMENTO'`
    (`forms_um_pre_atendimento_por_rede`), que nasce com a rede (gatilho em
    `tenants`) com as perguntas da anamnese de campos fixos de antes, e os
    MESMOS ids (`allergies`, `medications`, `skinType`…). Edita só quem tem
    `forms: MANAGE` e é da rede, em Configurações → Fichas; sem foto nem
    planejador de injetáveis (`TIPOS_FORA_DO_PRE_ATENDIMENTO`: a cliente
    responde pelo celular). As actions e listas das fichas de PROCEDIMENTO
    filtram `tipo = 'PROCEDIMENTO'` — sem isso, editavam e apagavam esta.
  - **O formato gravado** é `{ versao: 2, ficha: { formId, nome, rows },
    respostas, respondidoEm, origem, respondidoPor }`: a resposta leva o retrato
    das perguntas de quando foi respondida. A de campos fixos foi convertida
    (`anamnese_do_legado`, migration `20261020000003`); quem lê usa
    `paraAnamneseGeral` (`lib/anamnese-geral.ts`), que entende os dois.
  - **Grava por UM caminho**: `gravarAnamneseGeral`
    (`lib/pre-atendimento/ficha.ts`) — a equipe na sessão e na avaliação, a
    cliente no app e pelo link. Ele fecha o pendente da cliente: quem
    respondeu na clínica não responde de novo no app. A EQUIPE regravando as
    MESMAS respostas não troca a autoria nem a data (a avaliação marcava como
    "pela equipe" a ficha que a cliente respondeu pelo link — 2026-10-20); a
    cliente confirmando ("nada mudou") renova a data, que é a validade.
  - **O envio ao agendar é da rede** (`tenants.pre_atendimento_envio`,
    desligado por padrão): o gatilho `trg_pre_atendimento_no_agendamento`
    cria o pendente em `pre_atendimentos` por QUALQUER caminho que agende —
    um por cliente (`pre_atendimentos_um_pendente`), com o retrato da ficha
    do momento. Dentro da validade
    (`tenants.pre_atendimento_validade_meses`, padrão 6) o modo é
    `CONFIRMAR` ("algo mudou?"); fora dela, ou sem resposta, `COMPLETO`.
    **Respondida (ou confirmada) há menos de 30 dias, o agendamento não abre
    pendente** (decisão do Heitor, 2026-10-21; migration `20261021000008`):
    a última resposta é a mais recente entre a anamnese e os pré-atendimentos
    respondidos.
    **A cliente respondeu (app ou link): a PROFISSIONAL do agendamento é
    avisada** (sino e celular; o aviso diz a alergia, se houver — decisão do
    Heitor, 2026-10-21), dentro de `gravarAnamneseGeral`.
  - **A cliente responde no app** (`/[slug]/cliente/pre-atendimento`, o
    cartão da tela inicial e um aviso no celular ao ser agendada — genérico,
    sem nada de saúde, só quando ESTE agendamento abriu o pendente) **ou pelo
    link** (`/pre-atendimento/[token]`, no molde do link de assinatura, §9.4.1):
    só o hash do token, CPF ou nascimento antes de qualquer pergunta,
    `pre_atendimento_link_abrir` conta as tentativas (5 derrubam o link, 20 na
    hora param o IP), responder confere de novo, e o link morre com o pendente.
    A equipe manda o link pela janela do agendamento ("Enviar a ficha":
    copiar ou `wa.me`, com `agenda: MANAGE`), que mostra só o ESTADO
    (pendente/respondida) — as respostas são do prontuário.
    Com a rede mandando também pela conversa (a MESMA chave do link de
    assinatura, `documentos_link_pela_conversa` — decisão do Heitor,
    2026-10-21), aparece "Mandar pela conversa" (`enviarFichaPelaConversa`):
    as regras do §9.4.1 — conversa achada ANTES de gerar, caixa da conversa,
    janela fechada devolve o link para copiar. A mensagem é a genérica.
    Prova: `e2e/ficha-pre-atendimento-conversa.spec.ts`.
    Na agenda (rede e unidade, dia e semana), o BLOCO do agendamento leva o
    selo da ficha (`selosDaFicha`, `lib/pre-atendimento/selos.ts`, a mesma
    regra da janela: pendente da cliente em horário que ainda vai acontecer,
    respondida para ESTE agendamento) — só o estado, nunca as respostas.
  - `pre_atendimentos` e `pre_atendimento_links` têm RLS ligada e nenhuma
    política permissiva: só o servidor lê e grava. Prova:
    `e2e/ficha-pre-atendimento.spec.ts`.
- `RecordPhoto.source`: `"web"` ou `"mobile"` — rastrear de onde veio o upload
- `RecordPhoto.type`: `"before"`, `"after"`, ou `"during"`
- `ConsentTerm.signedVia`: `"web"` ou `"paper"` — `consent_terms` é o LEGADO dos
  termos fixos do checkout; os termos e contratos novos são o §9.4.1
- Cliente NÃO acessa o prontuário pelo app — apenas histórico de procedimentos.
  A exceção é a ficha de pré-atendimento PENDENTE dela: ali ela vê as
  perguntas e, dentro da validade, as próprias respostas de antes — nada de
  evolução, foto ou anotação da equipe.
- **Dado clínico só com o módulo de prontuário, venha da tela que vier**
  (`podeVerClinico(ctx)`, `lib/auth.ts`; 2026-10-03). Vazavam por telas de
  outros módulos e foram fechados: a evolução na sessão de atendimento (só
  `agenda`), os anexos clínicos do cliente (`lib/clientes/anexos.ts`: exame,
  laudo, foto clínica, receita, termo — só `clients`), a anotação do
  profissional no plano e a anamnese no arquivo do tratamento (só `agenda`).
  Concluir o atendimento e salvar a evolução pedem `medical_records: MANAGE`
  (gravam prontuário). Prova: `e2e/clinico-so-com-prontuario.spec.ts`.
- **A aba Prontuário lista TODO atendimento com registro clínico** (D4 da
  simulação de 2026-10-27): a evolução (`medical_record_entries.notes`), a
  intercorrência ou a ficha do procedimento — basta um dos três
  (`buildRecordForms`, `lib/record-forms.ts`). Só entrava o que tinha FICHA, e
  a avaliação (sem ficha ligada) sumia com a evolução gravada; o texto da
  evolução nunca ia à tela. Prova: `e2e/prontuario-evolucao.spec.ts`,
  `tests/prontuario-registros.test.ts`.
- **Quem abriu o prontuário fica registrado** (2026-10-27, decisões do Heitor;
  `lib/prontuario/acessos.ts`, tabela `prontuario_acessos`). Toda leitura
  clínica: a ficha da cliente (com os anexos clínicos), a sessão de
  atendimento, o plano com a anotação ou a anamnese (`getPlanosDoCliente`,
  `getPlanoParaEditar`, `getCheckoutPlan`, `getTreatmentPlanDetails`) e a
  liberação do prontuário no pacote LGPD.
  - Registra-se DEPOIS de decidir que o dado vai à tela (o mesmo
    `canViewRecords`/`podeVerClinico`), nunca só por abrir a página: quem não
    tem o módulo abre a ficha e não entra no registro. Tela nova que mostra
    dado clínico chama `registrarAcessoAoProntuario`.
  - A mesma pessoa relendo a mesma cliente no mesmo ponto (e referência) em
    30 min é uma linha só (`prontuario_registrar_acesso`): a tela recarrega
    sozinha. Falha no registro vai ao log e não tranca o atendimento.
  - Quem VÊ é o admin da REDE (`ctx.branchId === null` e
    `medical_records: MANAGE`), no fim da aba Prontuário da ficha. A cliente
    não o recebe no pacote LGPD (expõe nomes da equipe).
  - Só o servidor lê e grava (RLS sem política); um acesso não se altera
    (gatilho); `user_id` sem chave estrangeira — o registro sobrevive ao
    membro, e o nome é o do ctx (com a marca "via suporte").
  - Prova: `e2e/prontuario-acessos.spec.ts` e o caso da liberação em
    `e2e/lgpd-exportacao.spec.ts`.
- **Anexar (e apagar) anexo CLÍNICO é do prontuário, não do cadastro**
  (2026-10-20, `recusaDoAnexo` em `actions/client-documents.ts`):
  `medical_records: MANAGE` com o alcance da ficha — no "só os meus", só de
  cliente que o profissional atendeu. O anexo comum (RG, comprovante) segue
  `clients: MANAGE`. A ficha oferece a cada um só as categorias dele. Antes
  tudo pedia o cadastro, e a profissional não tinha onde anexar a foto
  clínica (simulação de um dia de clínica).
- **A foto clínica entra pela tela do ATENDIMENTO, ligada a ele** (A30 da
  simulação de 2026-10-27; migration `20261027000030`): o cartão "Fotos do
  atendimento" (`components/branch/fotos-do-atendimento.tsx`) usa o MESMO
  formulário e a MESMA action dos Documentos (`UploadForm` →
  `uploadClientDocument`: bucket privado, URL assinada, `recusaDoAnexo`),
  com a categoria fixa "Foto clínica" e `client_documents.appointment_id`.
  A action confere que o atendimento é DESTA cliente, da rede e de unidade ao
  alcance. O cartão só existe para quem vê o prontuário do atendimento
  (`canViewRecords`, já registrado em `prontuario_acessos`); anexar, para
  quem escreve nele. A foto aparece também na aba Documentos da ficha.
  Prova: `e2e/atendimento-foto-clinica.spec.ts`.
- **"Novo plano" (de tratamento) só grava ao salvar** (2026-10-21, decisão do
  Heitor): na ficha da cliente e no atendimento, o botão abre o editor com um
  rascunho que existe só na tela; o plano nasce no primeiro "Salvar plano"
  (`salvarPlanoNovo`, que cria e grava as sessões — e desfaz o plano vazio se
  as sessões falharem). Aceitar e "Cliente vai pensar" só aparecem depois de
  salvo. Antes ele nascia vazio no clique, e quem desistia deixava um rascunho
  de zero sessões. Prova: `e2e/plano-novo-so-ao-salvar.spec.ts`.
- **Na avaliação, o plano se monta NA TELA** (A29, 2026-10-27): enquanto o
  plano da avaliação não foi gerado, a tela do atendimento já tem o editor
  dele ("Tratamento"), e o Planejamento aberto por cima (`planoNaTela`) lista
  os planos da cliente mas não oferece "Novo plano" — diz que o plano desta
  avaliação se monta na própria tela. Eram dois "Nova sessão" no mesmo gesto,
  e o plano feito no Planejamento ficava fora do "Enviar para a recepção".
  Prova: `e2e/plano-dica-do-pacote.spec.ts`.

---

### 9.5 Estoque
- `currentStock` nunca atualizado diretamente — sempre via `StockMovement` em transação
- `StockMovement.balanceAfter`: saldo snapshot no momento da movimentação (imutável)
- **Transferência entre unidades é imediata** (`adminTransferStock` →
  `estoque_transferir`, numa transação com as duas linhas de saldo travadas,
  desde 2026-10-08): as duas pernas (`TRANSFER_OUT` e `TRANSFER_IN`) no mesmo
  insert, ligadas por uma `reference` aleatória. A tabela `stock_transfers` com confirmação do destino
  não é usada.
- **O lote é DA UNIDADE e BAIXA com a saída** (`product_batches.branch_id`,
  migration `20260928000001`). A baixa é GATILHO (`trg_lote_do_movimento`),
  pelo mesmo argumento do evento de estoque: FEFO entre os lotes ainda válidos,
  os vencidos só depois; o consumo do atendimento vem em unidade de consumo e
  é convertido para embalagens; a transferência leva o lote para o destino.
  Cada baixa deixa a ligação em `stock_movement_batches` — é ela que diz de qual
  lote saiu o que foi aplicado. Lote vencido é sinalizado, não bloqueado. Até
  2026-09-28 a tabela não tinha unidade, a entrada COM número de lote falhava
  inteira e o lote nunca baixava. Prova: `e2e/lotes-baixa.spec.ts`.
- **Todo MOVIMENTO está na unidade de CONSUMO, e o custo também** (D1 da
  simulação de 2026-10-27, decisões do Heitor; migration `20261027000011`).
  O produto com unidade de consumo (`units_per_package` > 0 e
  `consumption_unit`) conta o movimento nela: a entrada de 5 frascos de
  100 ml grava `quantity` 500 e `balance_after` = o rendimento depois; o
  ajuste e a transferência gravam o que o rendimento andou; o consumo do
  atendimento já vinha em ml. `unit_cost` é o custo de UMA unidade de
  consumo: R$ 90 o frasco = R$ 0,90 o ml. Antes, a compra gravava 5
  (frascos), o consumo −5 com saldo 495 (ml), e a conclusão gravava o preço
  do FRASCO por ml (5 ml custavam R$ 450).
  - Continua em EMBALAGENS: o que a pessoa digita (entrada, ajuste,
    transferência), `products.cost_price` (o preço da embalagem),
    `branch_product_stock.current_stock`, o mínimo e os lotes — o gatilho do
    lote converte toda saída pelo fator.
  - **A regra é UMA, no banco**: `tem_unidade_de_consumo`, `fator_de_consumo`,
    `custo_de_consumo` (o preço da embalagem ÷ o que ela rende; sem unidade de
    consumo, ÷ 1), `saldo_de_consumo`, `valor_do_saldo` e
    `custo_do_movimento` (|quantidade| × o custo do movimento, senão o de
    consumo). A conclusão e a entrega do voucher NÃO mandam custo: o banco
    grava o de consumo. Todo leitor de custo de movimento usa
    `custo_do_movimento` — nunca `coalesce(m.unit_cost, p.cost_price)`, que é
    o preço da embalagem.
  - O histórico do estoque mostra o movimento na unidade dele e o saldo
    também em embalagens ("saldo 495 ml · 4,95 frasco").
  - Prova: `e2e/estoque-custo-de-consumo.spec.ts` (a entrada, o consumo de
    5 ml a R$ 4,50 no movimento, no giro, no relatório, na margem e na
    comissão com "descontar insumos", o valor em estoque, ajuste e
    transferência, o histórico).

---

## 10. Fluxo de conclusão de atendimento

**É UMA transação** (desde 2026-09-28). `finishSession` CALCULA — a regra de
comissão aplicada, os pontos, a baixa de cada insumo (com rendimento e o
arredondamento das embalagens) — e a função `concluir_atendimento` (migration
`20260928000003`) GRAVA tudo de uma vez. Nenhuma regra de negócio no banco: ela
recebe os números prontos. É o desenho do estorno (`estornar_transacao`).

O que a transação grava, na ordem:

| # | O que grava | Onde |
|---|---|---|
| 1 | status `COMPLETED` + `completed_at` (agendamento TRAVADO, status conferido de novo) | `appointments` |
| 2 | o prontuário do cliente (nasce se não existe) e a entrada deste atendimento | `medical_records`, `medical_record_entries` |
| 3 | uma linha de comissão por procedimento (regra e configuração retratadas) e o primeiro acerto do extrato (§9.7) | `commission_lines`, `commissions` |
| 4 | cada insumo — e, pelos gatilhos, evento, mínimo e baixa do lote | `stock_movements`, `branch_product_stock` |
| 5 | a sessão do pacote usada e o contador (soma no banco) | `package_sessions`, `client_packages` |
| 6 | a linha do tempo | `appointment_history` |

Os pontos de fidelidade saíram daqui em 2026-09-28: nascem no pagamento (§9.2.2).

- **Falha em qualquer passo desfaz todos.** Antes, falhar o quinto deixava os
  quatro primeiros, e o atendimento ficava concluído com comissão e sem baixa
  de estoque — sem jeito de refazer, porque o status já dizia concluído.
- **Dois "finalizar" ao mesmo tempo concluem uma vez**: o agendamento é travado
  (`for update`) e o status conferido lá dentro. Antes, os dois passavam.
- **Eventos e notificações saem DEPOIS**, no TypeScript, só se a transação
  gravou — são aviso do que aconteceu.
- O mesmo insumo duas vezes na lista SOMA antes do cálculo (a baixa é
  calculada sobre o saldo lido uma vez).
- Prova: `e2e/conclusao-atomica.spec.ts` (falha no meio, pacote, concorrência)
  e `e2e/atendimento-fechamento.spec.ts` (a tela).

O resto do fluxo:
- A **receita não nasce no fechamento**: é `confirmPayment`, na recepção, que a
  lança já paga. Marcar "Concluído" na agenda (`completeAppointment`) exige o
  fechamento feito e só lança a conta a receber, se faltar — repetir é seguro.
  O de **R$ 0 não tem o que receber** (D9, 2026-10-27): nem conta a receber,
  nem "aguardando pagamento" — a tela diz "Sem cobrança". O concluído a
  receber aparece na agenda, no Fechamento do dia e na ficha (§9.6).
- **O insumo usado hoje se lança na tela do atendimento, em todo formato
  dela** (2026-10-20): o cartão "Insumos utilizados" (os do cadastro do
  procedimento, marcados, mais o "Adicionar insumo") aparece também no
  formulário da avaliação — o atendimento avulso abre nele, e sem o cartão a
  profissional lançava o insumo no editor do PLANO, que nunca baixa. O insumo
  adicionado entra MARCADO (só o marcado baixa). A lista de produtos é cache
  (`products:<rede>`): criar, editar e ativar produto o expiram com
  `revalidateTag(tag, { expire: 0 })` — com `'max'` o produto novo não
  aparecia na próxima tela. Prova: `e2e/atendimento-fechamento.spec.ts`.
- **O "Finalizar" leva a evolução que está NA TELA**: o modal abre com o que a
  profissional escreveu na página (avaliação ou ficha), não com o gravado —
  sem "Salvar" antes, a evolução se perdia (simulação de 2026-10-20).
- **Insumo faltando NÃO impede o fechamento** — a cliente já foi atendida
  (decisão do Heitor, 2026-09-27). O saldo fica **negativo**, para a falta
  aparecer no estoque, e a tela mostra o que faltou.
- Sessão de **plano** e de **pacote** já foi paga em outro lugar:
  `confirmPayment` recusa as duas no servidor, e a tela esconde o botão.
- Pontos: não são do fechamento — nascem quando o atendimento é PAGO (§9.2.2).

---

## O que nunca fazer aqui

```
❌ Atualizar currentStock diretamente sem criar StockMovement
❌ Alterar price de um procedimento sem criar ProcedurePriceHistory
❌ Baixar lote no TypeScript (é o gatilho trg_lote_do_movimento; senão o próximo caminho esquece)
❌ Gravar parte da conclusão do atendimento fora de concluir_atendimento (é uma transação só)
❌ Cancelar ou marcar falta num atendimento concluído — o que se desfaz é o pagamento (estorno)
❌ Calcular saldo de estoque depois de uma saída fora de lib/estoque/baixa.ts
❌ Criar agendamento sem procedure_id (a avaliação era a exceção e não existe mais)
❌ Confundir a ficha do PROCEDIMENTO (forms/form_data) com a anamnese GERAL do cliente
❌ Action ou lista de ficha de procedimento sem .eq('tipo', 'PROCEDIMENTO') (edita e apaga a ficha de pré-atendimento)
❌ Gravar a anamnese geral fora de gravarAnamneseGeral (o pendente fica aberto e a cliente responde de novo)
❌ Ler general_anamnesis direto, sem paraAnamneseGeral (há dois formatos no banco)
❌ Gravar o token do link da ficha (só o SHA-256), ou contar tentativas fora de pre_atendimento_link_abrir
❌ Conferir conflito de horário fora de horarioOcupado (lib/appointments/core.ts): a duração de CADA agendamento, e o profissional em qualquer unidade da rede
❌ Remarcar, cancelar ou confirmar fora de remarcarCore/cancelarCore/confirmarCore (lib/appointments/alteracoes.ts) — a tela e o Copilot dividem
❌ Caminho que cria ou move agendamento (troca de profissional, sessão de plano, checkout do plano…) sem horarioOcupado — no checkout, ANTES do dinheiro
❌ Gravar entrada ou ajuste de estoque fora de estoque_entrada/estoque_inicial/estoque_ajuste (trava: tests/estoque-so-pelas-funcoes.test.ts) (a linha do saldo travada; duas entradas juntas perdiam uma)
❌ Transferir estoque fora de estoque_transferir (as duas linhas travadas na mesma ordem)
❌ Gravar movimento de estoque em embalagens de produto com unidade de consumo, ou com o custo da embalagem (é custo_de_consumo)
❌ Ler o custo de um movimento com coalesce(m.unit_cost, p.cost_price) (é custo_do_movimento) ou mandar o custo do insumo do app para a conclusão
❌ Saída calculada no app (conclusão, voucher) sem mandar o saldo LIDO (antes_embalagens/antes_rendimento) e sem comNovaTentativa — o banco confere e recusa com PT409
❌ Usar 40001 para "tente de novo" numa função chamada pelo PostgREST (ele repete sozinho, sem reler) — é PT409
```
