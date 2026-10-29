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
    agendamentos que caem fora dele — a MESMA regra (`estenderJanela`, `lib/agenda/grade.ts`) na
    agenda da unidade, na "Minha agenda" e em `/admin/agenda` (na rede, o mais cedo e o mais
    tarde entre as unidades; D5 de 2026-10-28, era 07–21 fixo nas duas últimas);
  - a capacidade da ocupação (`capacidadeEmMinutos`, §13.1).
  A equipe ainda marca fora do horário (encaixe): os seletores do checkout e
  das sessões do plano continuam livres. Prova:
  `e2e/agenda-horario-de-funcionamento.spec.ts`, `tests/agenda-horario.test.ts`.
  - **Livre não é fixo** (D8 da simulação de 2026-10-29): a grade desses
    seletores (`GradeDeHorarios`, `components/shared/grade-de-horarios.tsx` —
    o checkout do plano, as sessões do plano/pacote e o "Agendar" do pré-pago)
    é a janela da UNIDADE naquele dia, de 30 em 30 min, sem a pausa e até o
    último início antes do fechamento (`gradeDoCheckout`,
    `lib/checkout/grade-de-horarios.ts`). Os horários da profissional (unidade
    ∩ dela) ficam em destaque; os outros, tracejados, são encaixe e se
    escolhem; o que nem a unidade oferece (madrugada, dia fechado) vai pelo
    "Outro horário (encaixe)". Era 08:00–20:00 fixo: oferecia a pausa e
    cortava a noite. A action `getSchedulingDaySlots` devolve os dois
    horários. Prova: `e2e/checkout-grade-de-horarios.spec.ts`,
    `tests/checkout-grade-de-horarios.test.ts`.
- **Quem atende e é da REDE atende em TODAS as unidades** (D1 da simulação de
  2026-10-28, decisão do Heitor): o membro com `provides_services` e
  `branch_id` nulo aparece na agenda de cada unidade, no agendar (equipe e app
  da cliente), no horário dos profissionais e na ocupação do dashboard da
  unidade; o de uma unidade, só na dele. O filtro é UM,
  `filtroDeQuemAtendeNaUnidade` (`lib/cached-queries.ts`, com a rede), usado
  por `getCachedBranchProfessionals` e por toda lista ou conferência de "quem
  atende aqui" — nunca `branch_id = unidade`. A tag da lista é da rede
  (`professionals:<rede>`): mexer num membro da rede expira todas as unidades.
  Escolher em QUAIS unidades ele atende fica para depois. Prova:
  `e2e/agenda-profissional-da-rede.spec.ts`.
- **A dona que atende** (D2 da simulação de 2026-10-29): o Admin da rede
  marca "Atende clientes", a comissão e o horário na Equipe da rede com o
  cargo TRAVADO (CLAUDE.md §11) e entra na agenda, no agendar e na comissão
  como qualquer profissional da rede. A **Equipe da unidade** lista também
  quem é da rede e atende ali (ativo), com o chip "Da rede", só o nome e o
  cargo, e SEM ações: cargo, comissão e acesso se mexem na Equipe da rede
  (quem é da rede vê o lápis que leva para lá). A sessão de unidade não lê
  membros da rede (RLS): essa lista vem pelo servidor. Prova:
  `e2e/equipe-dona-que-atende.spec.ts`.
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
- **A agenda "só os meus" vale também pelo ID** (D4 da simulação de
  2026-10-28, decisão do Heitor): com `agenda` OWN, a tela do atendimento
  (`app/_shared/sessao-de-atendimento.tsx`, os dois portais) de um
  agendamento de OUTRO profissional é `semAcesso()`, e as actions pelo id o
  recusam — check-in (`checkinCore`), confirmar, remarcar, cancelar
  (`confirmarCore`/`remarcarCore`/`cancelarCore`, logo também o Copilot),
  iniciar pelo status (`updateAppointmentStatus`), trocar o profissional e
  salvar a evolução. A regra é UMA, `deOutroProfissional`
  (`lib/appointments/alteracoes.ts`); `startAppointment`, `finishSession` e
  `chegarEIniciar` já conferiam. A recepção (ALL) faz o de todos. Antes a
  profissional abria pela URL o atendimento de outra e marcava o check-in ("o
  check-in comum não confere o profissional"). Prova:
  `e2e/agenda-so-os-meus-pelo-id.spec.ts`.
- **A chegada é do DIA do agendamento** (A18, 2026-10-27): `checkinCore`
  recusa fora do dia (Brasília, `ehODiaDoAgendamento`) — vale para a agenda, o
  Copilot e "Marcar chegada e iniciar" — e a janela não oferece "Chegou". Com a
  agenda "só os meus", a janela também não mostra Cancelar nem "Não
  compareceu" (a action recusa): mostra só o que a action deixa fazer. O
  cancelado traz o motivo inteiro na janela e no tooltip do bloco.
- **A grade do dia rola a cada troca de dia** (D8): hoje, uma hora antes de
  agora; outro dia, o primeiro atendimento ou a abertura da unidade, o que
  vier antes (`rolagemDaGrade`). O novo agendamento sugere o próximo horário
  livre da profissional (A20, `proximoHorarioLivre`, a conta de
  `computeAvailableSlots`) quando a hora não veio de um clique na grade.
  A linha do tempo da cliente registra confirmação e chegada (A23).
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
- Campo `source`: `INTERNAL` (equipe pelo web/app), `CLIENT_APP` (cliente pelo portal, só procedimentos `visible_on_client_app`), `COMMERCIAL` (o agendamento do COMERCIAL, abaixo). `ONLINE` é legado do agendamento público, que foi descartado — não usar em código novo.
- **A origem COMMERCIAL é da cliente com oportunidade ABERTA, não de quem agenda** (D11/A12 da
  simulação de 2026-10-27): `createAppointmentCore` procura a oportunidade aberta da cliente
  (`oportunidadeDoAgendamento`, `lib/crm/liga-agendamento.ts`; o card passa o `leadId` já
  conferido por `leadAoAlcance`) e, havendo, grava `COMMERCIAL` — agendando pelo card, pela ficha,
  pela agenda ou pelo Copilot, e seja o SDR da rede ou de UNIDADE (o `isComercial` antigo
  era `ctx.branchId === null`). Pelo card o agendamento é sempre COMMERCIAL. A cliente que agenda
  sozinha pelo app segue `CLIENT_APP`. Sem oportunidade aberta (nenhuma, ganha ou perdida) é
  `INTERNAL`. Fora do plano `oportunidades` não se liga nada.
  Agendar também move o card para a etapa de agendado do funil, achada pela MARCA
  (`crm_stages.marca = 'AGENDADO'`, nunca pelo nome: a clínica renomeia), sem recuar quem já
  passou dela nem mexer em ganho/perdido (`etapaParaAgendar`), e escreve `APPOINTMENT_CREATED`
  na linha do tempo (o núcleo, não a action). O funil padrão nasce com a marca; funil sem etapa
  marcada não move o card. Prova: `e2e/crm-agendar-liga-oportunidade.spec.ts`.
- **A cliente cancela e remarca pelo portal até o prazo da rede**
  (`tenants.portal_prazo_alteracao_horas`, 24h por padrão, Configurações →
  Geral; decisão do Heitor, 2026-10-21): o cartão da agenda abre o detalhe
  (`/[slug]/cliente/agendamentos/[id]`, só a ficha DELA), e
  `actions/portal-agendamentos.ts` confere de novo o prazo e o status; o horário
  novo é um dos livres do self-service, para o mesmo profissional. Dentro do
  prazo, só "Falar com a clínica" (WhatsApp da unidade). Prova:
  `e2e/portal-cliente-alterar-agendamento.spec.ts`.
- **"Próximo" no portal da cliente é UMA regra** (D14 da simulação de
  2026-10-29; `lib/clientes/agenda-do-portal.ts`): em aberto (agendado,
  confirmado ou na clínica) E com o horário ainda por vir — os "Próximos" da
  Agenda e o "Próximo agendamento" da home. O que passou sem ser fechado vai
  ao histórico. A Agenda filtrava só o status, e o "Na clínica" de ontem
  aparecia em "Próximos". Prova: `tests/agenda-do-portal.test.ts`.
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
  - **A ficha aparece em TODO ramo da tela do atendimento** (D1 da simulação
    de 2026-10-29): o formulário da avaliação (todo atendimento fora de plano,
    inclusive o de pacote, na rede que monta plano) tem o cartão "Ficha do
    procedimento" (`data-ficha-do-procedimento`); o plano já gerado e a sessão
    de plano (ou a rede sem planos) a têm dentro da "Ficha de atendimento".
    Faltava no primeiro desde 2026-09-25, e a profissional concluía sem ela.
    Só vai à tela com `canViewRecords` (o acesso já é registrado na sessão).
    A obrigatória barra o "Salvar ficha", o "Enviar para a recepção" e,
    desde a revisão do Heitor de 2026-10-29, também o "Finalizar" (§10). Prova:
    `e2e/atendimento-ficha-do-procedimento.spec.ts`.
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
    (pendente/respondida) — as respostas são do prontuário. Cliente sem CPF
    nem nascimento: a janela diz "Complete o CPF ou a data de nascimento para
    enviar o link" e leva ao cadastro (`?aba=dados`, via `lib/rotas`). "Ficha já
    respondida" mostra o telefone/WhatsApp da UNIDADE para corrigir algo. Erro
    de validação (no link e nas fichas): rola ao primeiro campo obrigatório
    vazio, foca, destaca e escreve a mensagem junto dele.
  - **A ficha não se responde vazia** (D2 da simulação de 2026-10-28,
    decisões do Heitor): a cliente (app e link) não envia sem resposta
    nenhuma nem com pergunta obrigatória em branco — `oQueFaltaNaFicha`
    (`lib/anamnese-geral.ts`), conferido no SERVIDOR
    (`responderPreAtendimento`, `confirmarQueNadaMudou`, `responderPorLink`);
    a tela diz o que falta junto do campo. A ficha padrão nasce com alergia,
    gestação, medicamentos e condições de saúde obrigatórios
    (`private.ficha_de_pre_atendimento_padrao`, migration `20261028000301`);
    nas redes que já existiam, só a ficha padrão nunca editada mudou.
    **A gestação tem "Não se aplica"** (revisão do Heitor, 2026-10-29;
    migration `20261029000601`): "Sim", "Não" e "Não se aplica", e continua
    obrigatória — o cliente do sexo masculino era obrigado a responder Sim ou
    Não. Mudou a semente e, nas redes que já existiam, a ficha igual à semente
    de 28/10 (a editada é da rede); a resposta antiga guarda o retrato da
    ficha dela e não foi reescrita. Nada lê a resposta como booleano: o alerta
    da tela é só o de alergia, o PDF e o pacote LGPD escrevem o texto, o
    Copilot não lê a anamnese, e a conversão do legado (`simNao`) só diz
    "Sim" do verdadeiro e deixa um texto como está.
    A obrigatória vale para todo preenchimento pelo construtor: a equipe
    também a preenche ao salvar a anamnese, mandar a avaliação ou FINALIZAR
    o atendimento (§10, "Tudo que é obrigatório barra").
  - **A ficha gravada vazia não é "respondida" em lugar nenhum**
    (`anamneseRespondida`): sem "Anamnese revisada" nem "Respondida…" no
    atendimento (a tela diz "Ficha de saúde vazia"), sem "algo mudou?", sem
    selo de respondida na agenda, e o gatilho do envio não a conta como
    última resposta (nem a anamnese de `respostas` vazias, nem o pendente
    respondido sem resposta). `gravarAnamneseGeral` com respostas vazias não
    fecha o pendente nem avisa a profissional. Prova:
    `e2e/ficha-pre-atendimento-obrigatoria.spec.ts`,
    `tests/pre-atendimento-obrigatoria.test.ts`.
  - **O alerta de alergia** (`alergiasDaAnamnese`) trata como NEGATIVA a
    resposta que começa por negação ("não", "nenhuma", "sem", "nego", "nunca
    tive"; caixa, acento e pontuação ignorados) — salvo ressalva ("não sei",
    "mas", "só", "exceto") ou alergia nomeada ("não tenho alergia a X"): na
    dúvida, avisa. Tabela em `tests/alergia-negativa.test.ts`.
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
- **Apagar anexo CLÍNICO só o marca** (2026-10-27, migration
  `20261027000070`): `deleteClientDocument` grava `apagado_em`,
  `apagado_por` (users.id, sem chave estrangeira) e `apagado_por_nome` (o do
  ctx, com a marca "via suporte"); a linha e o arquivo do bucket ficam. Toda
  leitura de tela filtra `apagado_em is null` (a ficha nos dois portais, as
  fotos do atendimento, o portal da cliente); o pacote LGPD lista o apagado,
  com a data. O anexo COMUM (RG, comprovante, "outro") continua se apagando
  de verdade — não é prontuário. Prova: `e2e/clinico-so-com-prontuario.spec.ts`
  e `e2e/prontuario.spec.ts`.
- **A foto clínica entra pela tela do ATENDIMENTO, ligada a ele** (A30 da
  simulação de 2026-10-27; migration `20261027000030`): o cartão "Fotos do
  atendimento" (`components/branch/fotos-do-atendimento.tsx`) usa o MESMO
  formulário e a MESMA action dos Documentos (`UploadForm` →
  `uploadClientDocument`: bucket privado, URL assinada, `recusaDoAnexo`),
  com a categoria fixa "Foto clínica" e `client_documents.appointment_id`.
  A action confere que o atendimento é DESTA cliente, da rede e de unidade ao
  alcance. O cartão só existe para quem vê o prontuário do atendimento
  (`canViewRecords`, já registrado em `prontuario_acessos`); anexar, para
  quem escreve nele. A foto aparece também na aba Documentos da ficha, com a
  linha "Atendimento de dd/mm/aaaa · Procedimento" levando à tela dele
  (`atendimentoDoAnexo`, `lib/clientes/anexos.ts`; o dia no fuso do negócio).
  Prova: `e2e/atendimento-foto-clinica.spec.ts`.
- **A aplicação de injetáveis se CONFIRMA e se REGISTRA só no atendimento**
  (D14 da simulação de 2026-10-28, decisão do Heitor): a aplicação congelada
  (`injectable_applications`) só nasce por "Registrar aplicação", dentro de um
  atendimento (Planejamento → Injetáveis). Fora dele (a tela de Injetáveis, a
  ficha da cliente), o mapa não oferece "Confirmar aplicação" — dizia
  "Aplicação confirmada" sem gravar nada (`salvarPlanejamentoInjetavel` grava
  só a vista e os pontos) — e mostra no lugar a linha "A aplicação se
  registra no atendimento…" (`InjectableMapField confirmaAqui`). O mapa no
  corpo do atendimento depende de CONFIGURAÇÃO: só aparece quando o
  procedimento tem uma ficha com o campo "planejador de injetáveis"; sem ela
  (a Toxina da simulação não tinha ficha), o mapa do atendimento é o do
  Planejamento. Prova: `e2e/injetaveis-confirmar-so-no-atendimento.spec.ts`.
- **O campo "Planejador de injetáveis" da ficha abre o planejamento DA
  CLIENTE** (pedido do Heitor, 2026-10-29). Era um mapa SOLTO, só na resposta
  da ficha. No atendimento, o campo (`CampoDoPlanejador`,
  `anamnesis-form-renderer.tsx`, com `injetaveis={{ clientId, branchId }}`) é
  o MESMO `PlanejamentoInjetaveis` de Planejamento → Injetáveis: lista os
  planejamentos dela para abrir, cria um novo (nasce ligado a ela) e abre o
  planejador com o "Registrar aplicação". Não há segundo planejador.
  - **A resposta guarda o id e um RETRATO**: `{ view, points, planejamento:
    { id, nome }, retratoEm }` — os pontos do planejamento GRAVADO no momento
    do "Salvar ficha" (`salvarFichaDoProcedimento`) ou do "Finalizar"
    (`finishSession`, na transação de `concluir_atendimento`, em
    `form_data.ficha`). O navegador diz QUAL planejamento; os pontos o
    servidor lê (`retratarInjetaveis`, `lib/injetaveis/alcance.ts`; a conta
    pura em `lib/atendimento/retrato-dos-injetaveis.ts`). Edição do mapa não
    salva no planejamento não entra no retrato (a tela diz isso no campo).
  - O planejamento tem de ser da cliente DO ATENDIMENTO, da rede, da unidade ao
    alcance e, no prontuário "só os meus", de cliente que ela atende — senão o
    salvar e o finalizar recusam ("Planejamento de injetáveis não encontrado
    para esta cliente."). O plano é da CLIENTE: quem a atende vê e usa os
    planejamentos dela, quem quer que os tenha desenhado (`mapaDaProfissional`).
  - Finalizar sem mexer na ficha já salva com planejamento: o retrato se
    refaz com o planejamento de agora (o resto da ficha fica como foi salvo);
    se o planejamento saiu do alcance, a ficha salva fica como está.
  - Voltar à lista no campo é tirar o planejamento da ficha. A obrigatória
    aceita o planejamento escolhido, mesmo sem ponto.
  - **Na leitura** (aba Prontuário da ficha, o atendimento bloqueado), o
    retrato aparece com o nome e a data ("como estava em…") e, se o
    planejamento existe e quem vê pode abri-lo (`planejamentosAbriveisDasFichas`,
    calculado na página), o link "Abrir planejamento" para Planejamento →
    Injetáveis da ficha. Nada de confirmar ou registrar aplicação fora do
    atendimento. O pacote LGPD leva o retrato no JSON, como levava o mapa.
  - **A ficha antiga, de mapa solto** (sem `planejamento`), continua como
    está, só para ler — também no atendimento.
  - As regras do mapa (`mapaAoAlcance`, `mapaDaProfissional`,
    `clienteDaProfissional`, `mapaDoTenant`) moram em `lib/injetaveis/alcance.ts`
    — fora do `'use server'`, onde todo export é endpoint.
  Prova: `e2e/atendimento-ficha-planejador-injetaveis.spec.ts`,
  `tests/retrato-dos-injetaveis.test.ts`.
- **Os mapas de injetáveis seguem o prontuário "só os meus"** (decisão do
  Heitor, 2026-10-28: "quem tem 'só os meus' vê 'só os meus', em qualquer
  lugar"). Com `medical_records` OWN, a lista de Injetáveis
  (`listarMapasDeInjetaveis`), os planejamentos da cliente e TODA action pelo
  id do mapa (abrir, salvar, renomear, ligar cliente, registrar aplicação —
  `mapaDoTenant`) só valem para o mapa DELA: da cliente que ela atende (um
  agendamento com ela — a regra da ficha e de `recusaDoAnexo`) ou, avulso
  (sem cliente), o que ela mexeu por último (`updated_by`). O filtro da lista
  é no banco (`!inner` mapa → cliente → agendamento com ela). Antes a lista
  conferia só `medical_records: VIEW` e mostrava os mapas de todas. Prova:
  `e2e/injetaveis-so-os-meus.spec.ts`.
- **A sub-aba Planejamento → Injetáveis só existe para quem vê o clínico**
  (D7 da simulação de 2026-10-29): `PainelPlanejamento podeVerInjetaveis` é a
  decisão clínica da tela que o monta — `podeVerProntuario` na ficha,
  `canViewRecords` no atendimento. Sem ela, nem pela URL
  (`?planejamento=injetaveis` cai no plano de tratamento). E a lista nunca
  fica em "Carregando…": a action LANÇA sem o módulo (`semAcesso()`), e a
  promessa rejeitada vira o aviso "Não foi possível carregar…"
  (`buscarPlanejamentos`). A recepção abria a sub-aba, recebia 500 e ficava
  carregando para sempre. Prova: `e2e/injetaveis-sem-prontuario.spec.ts`.
- **Os planos de tratamento seguem a agenda "só os meus"** (decisão do Heitor,
  2026-10-28). Com `agenda` OWN, a tela Planejamentos (`listarPlanejamentos`),
  os planos da cliente (`getPlanosDoCliente`, o Planejamento da ficha e do
  atendimento) e TODA action pelo id do plano que passa por `planoDoTenant`
  (cabeçalho, editar, salvar, renomear, ligar cliente, enviar à recepção,
  fechar o checkout, o arquivo do tratamento), mais `getTreatmentPlanSessions`
  e `cancelTreatmentPlan`, só valem para o plano DELA:
  `treatment_plans.professional_id` (`planoDaProfissional` — o recorte dos
  planos aguardando checkout no dashboard). O filtro da lista é no banco.
  Ficam de fora os gestos de quem RECEBE (`getCheckoutPlan`, `cancelCheckout`,
  `receberDoPlano`, que pedem `cashier`/fechar plano, não a agenda). Prova:
  `e2e/planejamentos-so-os-meus.spec.ts`.
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
  - **O insumo se mostra na unidade de consumo em toda tela** — a regra é UMA,
    `unidadeDoInsumo` (`lib/estoque/unidade-de-consumo.ts`): o cadastro, o
    atendimento, o editor do plano e o checkout (D9 da simulação de
    2026-10-29: o plano dizia "5 frasco" para os 5 ml do Peeling, porque
    `procedimentosParaPlano` lia `products.unit`). O plano GRAVADO guarda a
    unidade que a tela mandou (`treatment_plan_session_procedures.products`),
    e os de antes guardam a da embalagem para quantidades em ml: quem lê um
    plano gravado (`getPlanoParaEditar`, `getTreatmentPlanSessions`, a sessão
    de atendimento) mostra a unidade do PRODUTO, lida na hora
    (`unidadesDosInsumos`); o texto gravado só vale se o produto não existe
    mais. Nada foi reescrito no banco. Prova: `e2e/plano-unidade-de-consumo.spec.ts`.
  - Prova: `e2e/estoque-custo-de-consumo.spec.ts` (a entrada, o consumo de
    5 ml a R$ 4,50 no movimento, no giro, no relatório, na margem e na
    comissão com "descontar insumos", o valor em estoque, ajuste e
    transferência, o histórico).
- **Movimentação de estoque NUNCA gera despesa** (D13 revisto, decisão do
  Heitor, 2026-10-28: "tanto entrada quanto saída, não gera despesa. Os
  valores são informados apenas para base de cálculo de insumos, custo,
  margem e lucro"). Nenhuma porta — a "Entrada" (unidade e rede), o estoque
  inicial do cadastro do produto, a entrada por código de barras, o Copilot,
  o ajuste/perda, a transferência, o consumo do atendimento — cria
  `financial_transactions`; o custo informado fica no movimento
  (`unit_cost`, a base do custo de consumo, do giro e da margem). A compra
  que a clínica PAGOU, se ela quiser no financeiro, é um lançamento manual
  (Financeiro → Novo lançamento). Por 28/10 a Entrada e o cadastro tiveram
  "Lançar o custo como despesa paga hoje" (`estoque_compra`, 1b54c531): saiu
  (migrations `20261028000801`/`802`; `estoque_inicial` perdeu
  `p_despesa`). Prova: `e2e/estoque-nunca-gera-despesa.spec.ts`.

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
| 2 | o prontuário do cliente (nasce se não existe) e a entrada deste atendimento — evolução, intercorrência, as DORES do cliente e a ficha do procedimento da tela (D1, 2026-10-29); e a anamnese digitada na tela, fechando o pré-atendimento pendente (D3, 2026-10-28) | `medical_records`, `medical_record_entries`, `pre_atendimentos` |
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
- **E leva também as dores e a anamnese digitadas, na MESMA transação** (D3
  da simulação de 2026-10-28, decisão do Heitor): só o "Enviar para a
  recepção" (que exige plano) as mandava. `finishSession` recebe `queixas`
  (só quando a tela tem o campo — sem ele, a dor gravada fica) e a anamnese
  que alguém MEXEU (`anamneseDaEquipeParaGravar`, `lib/pre-atendimento/ficha.ts`:
  a ficha atual, as respostas limpas; nula sem resposta ou sem mudança — a
  ficha que a cliente respondeu não vira "pela equipe"), e
  `concluir_atendimento` grava tudo e fecha o pré-atendimento pendente. As
  obrigatórias, desde 2026-10-29, barram (abaixo). Prova: `e2e/atendimento-finalizar-grava-tudo.spec.ts`,
  `tests/rascunho-do-atendimento.test.ts`.
- **E a ficha própria do procedimento também** (D1 da simulação de
  2026-10-29; migration `20261029000401`): o "Finalizar" leva as respostas
  que alguém MEXEU na tela (campo `ficha`), em qualquer ramo, e
  `finishSession` monta o retrato com a ficha ligada ao PROCEDIMENTO, da
  rede e `tipo = 'PROCEDIMENTO'` (`fichaParaConcluir`,
  `lib/atendimento/ficha-do-procedimento.ts`: só as respostas dos campos
  dela) — o navegador não escolhe a ficha. `concluir_atendimento` grava em
  `form_data.ficha` (o formato do `salvarFichaDoProcedimento`), mantendo o
  resto de `form_data`; sem `ficha`, a salva antes fica. Antes, só o
  "Salvar" a gravava, e finalizar sem salvar a perdia. Desde 2026-10-29 a
  ficha também está no rascunho (A31, abaixo).
  O planejador de injetáveis da ficha entra com o RETRATO do planejamento
  da cliente lido no servidor (`retratarInjetaveis`, §9.4) — também quando a
  ficha salva não foi tocada na tela.
  Prova: `e2e/atendimento-ficha-do-procedimento.spec.ts`,
  `tests/ficha-do-procedimento-na-conclusao.test.ts`.
- **Tudo que é obrigatório barra** (revisão do Heitor, 2026-10-29: "tudo que
  for obrigatório é obrigatório e barra qualquer progressão se não for
  feito"). A pergunta obrigatória sem resposta — na ANAMNESE (a ficha de
  pré-atendimento da rede) ou na FICHA DO PROCEDIMENTO — barra o "Finalizar
  atendimento", o "Enviar para a recepção" e o "Fechar agora". Era o
  contrário ("a cliente já foi atendida", D2/D3 de 28/10 e D1 de 29/10).
  - **A tela aponta** a primeira que falta — a anamnese antes da ficha, a
    ordem da página — rolando até o campo, com o foco e a mensagem junto dele
    (`validar()` do `AnamnesisFormRenderer`; com a anamnese só para ler, o
    cartão abre para editar e aponta). A janela de concluir nem abre.
  - **O servidor recusa** (`oQueFaltaParaSeguir`,
    `lib/atendimento/obrigatorias-no-servidor.ts`) em `finishSession` e em
    `generateEvaluationPlan` — a trava não é só do navegador. A conta é UMA,
    pura (`campoVazio`/`primeiraObrigatoriaVazia` em `lib/anamnesis.ts`,
    `faltaNaAnamnese`/`faltaNaFichaDoProcedimento` em
    `lib/atendimento/obrigatorias.ts`): a tela e o servidor usam a mesma.
    Fica no app, não em `concluir_atendimento` (o app calcula, a função
    grava): a função chamada direto, sem o app, não confere.
  - **Vale o que FICA gravado**: a anamnese que a tela manda gravar
    (`anamneseDaEquipeParaGravar`), senão a gravada — a que a cliente
    respondeu pelo app ou pelo link vale, e a obrigatória só falta quando não
    tem resposta em lugar nenhum; a ficha da tela, senão a salva antes. As
    perguntas são as da ficha ATUAL (a de pré-atendimento da rede; a ligada ao
    procedimento). Resposta antiga, fora da validade da rede, ainda conta como
    resposta.
  - Sem ficha ligada ao procedimento, ou ficha sem obrigatória, nada barra.
    A foto e o planejador ficam fora da anamnese (a cliente responde pelo
    celular); o planejador da ficha, na rede sem o recurso de injetáveis (o
    campo é só para ver), não barra. O planejamento escolhido vale mesmo sem
    ponto.
  - **Quem não vê o clínico** (prontuário "só os meus" num atendimento de
    outra, com a agenda de todas): a tela não tem os campos e não aponta nada;
    o servidor recusa do mesmo jeito, com só o NOME da pergunta na mensagem.
    Quem responde é quem atende. A recepção não conclui (concluir pede
    `medical_records: MANAGE`), então não é barrada por isto.
  - Prova: `e2e/atendimento-obrigatorias-barram.spec.ts`,
    `tests/obrigatorias-do-atendimento.test.ts`. Spec que finaliza sem ser
    sobre isto responde a ficha de saúde antes (`responderAnamnese`,
    `e2e/apoio/anamnese.ts`).
- **O plano da avaliação é UMA gravação** (revisão do Heitor, 2026-10-29;
  migration `20261029000801`). O "Enviar para a recepção" e o "Fechar agora"
  salvavam a ficha do procedimento numa action e depois geravam o plano em
  outra — e o plano gravava a anamnese, o plano, as sessões e as dores em
  passos soltos: o plano que falhava deixava a ficha, a anamnese e um plano
  PROPOSTO sem procedimento. Agora `generateEvaluationPlan` CALCULA (a
  anamnese no formato da ficha atual com `anamneseDaEquipeParaGravar`, o
  retrato da ficha do procedimento com `fichaParaConcluir` e
  `retratarInjetaveis` — a ficha que a tela manda no 9º argumento —, as
  obrigatórias) e `gerar_plano_da_avaliacao` GRAVA tudo numa transação: o
  plano (PROPOSED, ligado por `evaluation_appointment_id`) e as sessões, a
  ficha em `form_data.ficha`, as dores, a evolução (quando veio), a anamnese,
  o pré-atendimento pendente que fecha e o histórico. Falhou um passo, nada
  fica. A função confere que todo procedimento do plano é da rede, recusa o
  agendamento cancelado e o plano já fechado (ACCEPTED/COMPLETED), e só o
  servidor a chama. A action confere também a agenda "só os meus" pelo id
  (`deOutroProfissional`). Prova: `e2e/atendimento-ficha-e-plano-juntos.spec.ts`.
- **Concluído, o formulário da avaliação fica bloqueado de verdade** (A30 da
  simulação de 2026-10-29): a evolução só se lê e a anamnese aparece como
  leitura — não em branco com as obrigatórias marcadas. Quem desbloqueia
  ("Editar registro") tem os campos de volta.
- **A avaliação concluída gera o plano** (revisão do Heitor, 2026-10-29: "é
  preciso avaliar primeiro pra depois decidir o que fazer"). O A30 tinha tirado
  o "Fechar agora" e o "Enviar para a recepção" porque gerar o plano regravava
  o registro fechado; os botões VOLTARAM, e gerar o plano ali grava SÓ o plano,
  ligado à avaliação (`evaluation_appointment_id`): as dores, a evolução, a
  ficha e a anamnese daquele dia ficam como estão — a tela não as manda e
  `gerar_plano_da_avaliacao` não as grava com o atendimento COMPLETED, nem
  desbloqueado. As obrigatórias não são conferidas de novo (passaram no
  "Finalizar"); as dores não são exigidas. A tela diz que o registro fica
  como está (`data-plano-da-avaliacao-concluida`), e o Planejamento por cima
  volta a não oferecer "Novo plano" (o plano se monta na tela, A29). Prova:
  `e2e/atendimento-plano-da-avaliacao-concluida.spec.ts`.
- **As dores do cliente são do PRONTUÁRIO do atendimento**
  (`medical_record_entries.queixas`, migration `20261028000302`), não
  `appointments.notes` — que é a observação INTERNA do agendamento e
  aparecia como dor na tela (A17). A dor nasce vazia; a observação aparece
  à parte ("Observação do agendamento"). As dores só vão à tela com
  `canViewRecords`, aparecem na aba Prontuário da ficha e no pacote LGPD
  (parte clínica). O "Enviar para a recepção" grava nelas; o envio do plano
  em rascunho aceita as dores OU a observação, como antes.
- **A evolução escrita tem rascunho, e ele morre com a aba** (A31 da
  simulação de 2026-10-27, decisão do Heitor): a evolução e a intercorrência
  da tela do atendimento (dos dois formulários) — e, desde o D3 de 2026-10-28,
  as dores, a anamnese digitada e os insumos (a dose e o marcado, depois que
  alguém mexe) e, desde a revisão do Heitor de 2026-10-29, a ficha do
  PROCEDIMENTO (as respostas da tela; o planejador de injetáveis volta com o
  planejamento escolhido aberto — os pontos, o servidor retrata ao gravar) —
  vão para o SESSIONStorage,
  por agendamento (`lib/atendimento/rascunho.ts`) — recarregar não as perde,
  e fechar a aba as apaga: texto clínico não fica na máquina da recepção.
  Nunca localStorage. Encerrar o atendimento, salvar no servidor ou gerar o
  plano da avaliação apaga o rascunho; todo acesso ao armazenamento é
  protegido (ele pode faltar ou lançar). Salvar a ficha no servidor ("Salvar
  ficha") a tira do rascunho: o "Finalizar" leva a salva. Prova:
  `e2e/atendimento-rascunho.spec.ts`, `e2e/atendimento-rascunho-da-ficha.spec.ts`,
  `tests/rascunho-do-atendimento.test.ts`.
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
❌ Gravar parte da conclusão do atendimento fora de concluir_atendimento (é uma transação só) — inclusive as dores, a anamnese e a ficha do procedimento do "Finalizar"
❌ Ramo da tela do atendimento sem a ficha própria do procedimento (o avulso da rede que monta plano ficou sem ela de 2026-09-25 a 2026-10-29)
❌ Concluir o atendimento ou gerar o plano da avaliação sem oQueFaltaParaSeguir (a obrigatória barra; a trava não é só da tela)
❌ Decidir "campo vazio" por conta própria (é campoVazio/primeiraObrigatoriaVazia, lib/anamnesis.ts — a tela e o servidor dividem)
❌ Gravar o plano da avaliação (ficha, anamnese, plano, sessões, dores) fora de gerar_plano_da_avaliacao — é uma transação só, como a conclusão
❌ Gravar a ficha do procedimento com o form_id que veio do navegador (é a ficha ligada ao procedimento do agendamento, da rede: fichaParaConcluir)
❌ Gravar na ficha os pontos do planejador de injetáveis que vieram do navegador (o retrato é do planejamento gravado: retratarInjetaveis), ou um planejamento de outra cliente
❌ Um segundo planejador de injetáveis: o campo da ficha é o PlanejamentoInjetaveis de Planejamento → Injetáveis
❌ Exportar de actions/injectable-map.ts ('use server') uma regra de alcance do mapa — ela mora em lib/injetaveis/alcance.ts
❌ Gravar as dores do cliente em appointments.notes (é a observação interna; as dores são medical_record_entries.queixas)
❌ Cancelar ou marcar falta num atendimento concluído — o que se desfaz é o pagamento (estorno)
❌ Calcular saldo de estoque depois de uma saída fora de lib/estoque/baixa.ts
❌ Criar agendamento sem procedure_id (a avaliação era a exceção e não existe mais)
❌ Confundir a ficha do PROCEDIMENTO (forms/form_data) com a anamnese GERAL do cliente
❌ Action ou lista de ficha de procedimento sem .eq('tipo', 'PROCEDIMENTO') (edita e apaga a ficha de pré-atendimento)
❌ Gravar a anamnese geral fora de gravarAnamneseGeral (o pendente fica aberto e a cliente responde de novo)
❌ Ler general_anamnesis direto, sem paraAnamneseGeral (há dois formatos no banco)
❌ Dizer "respondida" (selo, "algo mudou?", janela de 30 dias) sem anamneseRespondida / respostas não vazias — a ficha gravada vazia não é respondida
❌ Aceitar a ficha da CLIENTE (app ou link) sem oQueFaltaNaFicha no servidor
❌ Gravar o token do link da ficha (só o SHA-256), ou contar tentativas fora de pre_atendimento_link_abrir
❌ Action ou tela que recebe o id de um agendamento sem deOutroProfissional (a agenda "só os meus" vale pelo id, não só na lista)
❌ Listar ou conferir "quem atende nesta unidade" com branch_id = unidade (a da rede atende em todas: filtroDeQuemAtendeNaUnidade)
❌ Conferir conflito de horário fora de horarioOcupado (lib/appointments/core.ts): a duração de CADA agendamento, e o profissional em qualquer unidade da rede
❌ Remarcar, cancelar ou confirmar fora de remarcarCore/cancelarCore/confirmarCore (lib/appointments/alteracoes.ts) — a tela e o Copilot dividem
❌ Caminho que cria ou move agendamento (troca de profissional, sessão de plano, checkout do plano…) sem horarioOcupado — no checkout, ANTES do dinheiro
❌ Gravar entrada ou ajuste de estoque fora de estoque_entrada/estoque_inicial/estoque_ajuste (trava: tests/estoque-so-pelas-funcoes.test.ts) (a linha do saldo travada; duas entradas juntas perdiam uma)
❌ Lançar despesa (ou qualquer financial_transactions) a partir de uma movimentação de estoque — entrada, cadastro, ajuste, perda, transferência ou consumo (D13 revisto, 2026-10-28)
❌ Transferir estoque fora de estoque_transferir (as duas linhas travadas na mesma ordem)
❌ Gravar movimento de estoque em embalagens de produto com unidade de consumo, ou com o custo da embalagem (é custo_de_consumo)
❌ Ler o custo de um movimento com coalesce(m.unit_cost, p.cost_price) (é custo_do_movimento) ou mandar o custo do insumo do app para a conclusão
❌ Saída calculada no app (conclusão, voucher) sem mandar o saldo LIDO (antes_embalagens/antes_rendimento) e sem comNovaTentativa — o banco confere e recusa com PT409
❌ Deletar anexo clínico de client_documents pela tela (é apagado_em), ou ler client_documents numa tela sem .is('apagado_em', null)
❌ Usar 40001 para "tente de novo" numa função chamada pelo PostgREST (ele repete sozinho, sem reler) — é PT409
```
