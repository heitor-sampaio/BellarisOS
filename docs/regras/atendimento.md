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
  - **a "Minha agenda" é o horário DELA** ("Reforça", item 8 da 5ª simulação):
    a grade do dia é unidade ∩ ela (`janelaDoDia`), estendida pelos
    atendimentos de fora, com o resto sombreado; no dia em que ela não atende,
    a janela da unidade e "Você não atende neste dia". A Renata, de 07–12, via
    07:00–21:00 livre. Prova: `e2e/agenda-minha-agenda-horario.spec.ts`. O
    destaque do topo (`[data-destaque-de-hoje]`), sem nada por vir hoje e com
    um atendimento de hoje já passado ou concluído, diz "Nenhum outro
    atendimento hoje" — "Sem atendimentos" contradizia o "Hoje 1 atendimento"
    ao lado (A30 da 7ª simulação; prova: `e2e/agenda-atritos-da-7.spec.ts`);
  - a capacidade da ocupação (`capacidadeEmMinutos`, §13.1).
  A equipe ainda marca fora do horário (encaixe): os seletores do checkout e
  das sessões do plano continuam livres.
  - **O encaixe é permitido, mas AVISADO** (J-30, 2026-10-30): o modal de
    agendamento diz, antes do Confirmar, "Fora do horário de atendimento de X
    (10:00–18:00). O encaixe é permitido." e o choque com outro atendimento
    dela ("X já tem atendimento das 11:00 às 12:00.") — `avisosDoHorario` →
    `avisosDoHorarioCore` (`lib/appointments/encaixe.ts`), com
    `cabeNoHorario` e o `primeiroConflito` do núcleo (a mesma conta de
    `horarioOcupado`). Na grade do dia, a coluna de cada profissional sombreia
    o que é fora do horário DELA (`forasDoHorario`); o clique ali continua
    agendando. Recusado por choque com o aviso na tela, fica UMA mensagem
    ("Não foi agendado: X já tem atendimento das…", A26 da 5ª simulação; eram
    o aviso e a recusa repetidos). O horário no passado diz "Escolha a partir
    de 01/11/2026 às 10:40." (`limiteLegivel`, `ValidacaoEmPortugues`; era o
    ISO "2026-11-01T10:40"). Prova: `e2e/agenda-encaixe-avisa.spec.ts`,
    `tests/validacao-limite-legivel.test.ts`. **O horário fora da grade de 30
    em 30 min também se diz encaixe** (A17 da 10ª, 2026-11-10; como o "Outro
    horário (encaixe)" do plano): no expediente, o Agendar com 04:15 diz "04:15
    fica fora da grade de 30 em 30 minutos: é um encaixe (permitido)."
    (`[data-fora-da-grade]`, a grade de `gradeDoCheckout`); fora do
    expediente, vale o aviso de sempre. Prova:
    `e2e/atendimento-uso-da-10.spec.ts` ("A17").
  - **Na agenda da REDE, cada coluna de unidade sombreia o fechado DELA, e o
    encaixe fica marcado** (A26 da 6ª simulação, 2026-11-04): ao lado de uma
    unidade 24 h, a madrugada de quem abre às 10:00 parecia livre, e o
    agendamento das 03:00 ficava sem destaque. A grade do dia
    (`admin-agenda-view.tsx`) sombreia `forasDoHorario` do horário da
    unidade (`[data-fora-do-horario]`; o clique continua agendando), e o bloco
    que cai fora dele leva "Encaixe" (`foraDoHorarioDaUnidade`,
    `lib/agenda/horario.ts`, Brasília; `[data-encaixe]`). Prova:
    `e2e/agenda-rede-unidade-fechada.spec.ts`, `tests/agenda-horario.test.ts`.
  - **Desmarcar "Segue o horário da unidade"** (Equipe) parte do horário da
    unidade do membro, não do comercial (J-9, `horarioDeQuemDeixaDeSeguir`);
    o membro da rede parte da unidade quando a rede tem uma só e, com várias,
    da UNIÃO dos horários delas (A11 da 6ª simulação, 2026-11-04, princípio
    4: o Dr. Igor partia de 08–20 com a Boa Viagem em 24 h e a Casa Forte em
    06–22; `uniaoDosHorarios`, a unidade sem cadastro conta como o padrão
    dela). Prova: `e2e/equipe-horario-parte-da-unidade.spec.ts`,
    `tests/agenda-horario.test.ts` ("A11").
  - **O X do segundo período TIRA aquele período** (A7 da 5ª simulação,
    2026-11-01; `components/shared/editor-de-horario.tsx`): era "Tirar a
    pausa", que juntava os dois — a profissional de 07–12 e 18–22 ficava
    07–22. Juntar é outro botão, "Sem pausa". Prova: o mesmo spec.
  Prova:
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
    **Hoje, a grade começa em AGORA** (A24 da 6ª simulação, 2026-11-04: de
    madrugada, numa unidade 24 h, a sessão do pacote oferecia 00:00–04:00):
    `aPartirDeAgora` (Brasília) corta o que já passou, e o "Outro horário" no
    passado diz "Escolha a partir de HH:MM." sem escolher. **As sessões de
    pacote e de plano dizem o procedimento e oferecem a sala**
    (`SessionScheduler` com `procedimento`, `[data-agendar-sessao]`): a
    sala é opcional, a lista é a do agendar (`salasParaAgendar`, "(ocupada)"
    desligada) e o servidor confere (`schedulePackageSession` e, desde a D5 da
    9ª simulação, `schedulePlanSession` pelo núcleo, com a sessão como
    crédito). A unidade pré-paga segue só
    com o horário (o crédito decide o procedimento no servidor). Prova:
    `e2e/pacote-sessao-agendar.spec.ts`. **A sala aparece desde o início**
    (A32 e A58 da 8ª simulação, 2026-11-06): só depois do horário escolhido,
    e o "Agendar a 1ª sessão" da venda do pacote parecia não pedir a sala;
    escolhido o horário, ela diz qual está "(ocupada)". Prova:
    `e2e/agenda-atritos-da-8.spec.ts` ("A32/A58"). **E diz que os horários vêm
    depois** (A22 da 12ª simulação, 2026-11-11): antes da profissional e da
    data, "Escolha a profissional e a data para ver os horários livres."
    (`[data-dica-dos-horarios]`). Prova: `e2e/vendas-atritos-da-12.spec.ts` ("A22").
- **Na agenda da REDE, o novo agendamento nasce sem unidade** (A14 da 8ª
  simulação, 2026-11-06; princípio 3): o "+ Agendar" da ficha da rede (e o
  "Novo agendamento" com "Toda a rede") começava na primeira unidade em ordem
  alfabética. Com várias, "Selecione a unidade…" (obrigatório); com uma, ela;
  com o filtro de unidade da agenda ou o clique numa coluna, a dela. A
  primeira escolha mantém o procedimento e a profissional pedidos (o
  "Reagendar"); o que a unidade não tem cai. O "Novo cliente" da rede, igual
  (a unidade de cadastro sem pré-escolha). Prova:
  `e2e/vendas-unidade-da-venda.spec.ts` ("A14").
- **O BLOQUEIO pontual da agenda** (decisão 3 do Heitor, 7ª simulação,
  2026-11-05: "concordo" — a Lia e a Rita procuraram em Agenda, Equipe e
  Configurações onde bloquear o almoço, a folga e as férias). "Bloquear
  horário" no cabeçalho da agenda da unidade, da "Minha agenda" e da agenda
  da rede com UMA unidade na tela (a clínica de uma unidade vive no `/admin`,
  H3): por PROFISSIONAL ou por SALA, com início e fim (data e hora — o almoço
  de hoje ou as férias de vários dias, até um ano) e o motivo (obrigatório,
  até 200 caracteres). `agenda_bloqueios` (migration `20261105003002`; só o
  servidor lê e grava, com as restritivas do suporte), gravado por
  `bloquearHorario` e desfeito por `desfazerBloqueio` (`actions/agenda-bloqueios.ts`);
  a conta pura e o texto em `lib/agenda/bloqueio.ts`, a leitura em
  `lib/agenda/bloqueios.ts`.
  - **Na grade**: o da profissional na coluna dela (a pessoa: a da rede vale em
    todas as unidades); o da sala, numa linha acima da grade da unidade
    ("Sala bloqueada: …", `[data-bloqueios-de-sala]`); na agenda da rede, na
    coluna da unidade de onde foi feito. A faixa (`[data-bloqueio]`) NÃO
    segura o clique — clicar no bloqueado abre o novo agendamento —, e o
    rótulo (`[data-rotulo-do-bloqueio]`, por cima dos cartões) abre a janela
    "Horário bloqueado": o período, o motivo, quem bloqueou e "Desfazer
    bloqueio".
  - **Agendar no bloqueado pela EQUIPE avisa e deixa** (princípio 2), como o
    encaixe fora do horário: o modal (e o remarcar da janela) diz "Horário
    bloqueado para Bruna das 12:00 às 13:00 (Almoço). O encaixe é permitido."
    e, com a sala escolhida, "Sala X está bloqueada das …" (`avisosDoHorarioCore`,
    o `bloqueio` dos avisos). Ao bloquear um período com atendimento já
    marcado, ele continua, e o aviso diz quantos ("…continuam na agenda.
    Remarque se precisar.").
  - **Os livres não oferecem o bloqueado**: `computeAvailableSlots` tira o
    bloqueio da profissional — logo o app da cliente (agendar, "Sem
    preferência", remarcar), o Copilot (os livres), o CRM e a sugestão do
    próximo livre (A20). O Copilot também RECUSA agendar e remarcar no
    bloqueado ("…está com o horário bloqueado das 12:00 às 13:00 (Almoço).
    Escolha outro horário — o encaixe num horário bloqueado é pela agenda.").
    O bloqueio da SALA não muda os livres (o app e o Copilot agendam sem sala).
    **E a régua da equipe também não** (D5 e D15 da 8ª simulação,
    2026-11-06; princípio 3): o horário de N minutos está livre quando o
    intervalo INTEIRO [início, início + N) não bate em agendamento dela (em
    qualquer unidade da rede, até o fim da ocupação — `fimDaOcupacao`) nem em
    bloqueio dela — `ocupanteDoHorario`, `lib/agenda/horario-livre.ts`, puro.
    A grade das sessões do pacote/plano e do checkout (`GradeDeHorarios`, que
    `getSchedulingDaySlots` alimenta com os agendamentos e os `bloqueios`) usa
    essa régua: o bloqueado sai "Bloqueado · motivo", desligado (o encaixe
    segue pelo "Outro horário"). Era só o INÍCIO dentro de um ocupado, da
    unidade: 10:00 aparecia livre para 60 min com outro às 10:30, e o
    Confirmar recusava. O "Horário livre" da "Minha agenda" tira o bloqueio do
    vão (`livresEntre`): a Débora de férias via "Horário livre 02:45 – 04:00".
    A ocupação desconta o bloqueado (`blocosDosBloqueios`, `indicadores.md`).
    Prova: `e2e/agenda-defeitos-da-8.spec.ts` ("D5", "D15"),
    `tests/agenda-horario-livre.test.ts`.
  - **O modal Agendar tem a grade dos livres, e o choque diz que não grava**
    (A58 e A21 da 8ª simulação, 2026-11-06; princípio 3): o seletor de
    horários livres só existia no agendar da sessão do pacote. Escolhida a
    profissional e o dia, o modal mostra a MESMA `GradeDeHorarios` (a régua de
    `ocupanteDoHorario` com os agendamentos e os bloqueios de
    `getSchedulingDaySlots`; sem o "Outro horário", que ali é o campo de data
    e hora — `semOutroHorario`), e clicar escolhe o horário. O choque com
    outro atendimento dela não é encaixe — o servidor recusa —, e o aviso
    parecia só aviso: agora "Não vai ser agendado: X já tem atendimento das…"
    (`[data-choque-do-horario]`) com "Usar o próximo livre: 11:00"
    (`proximoHorarioLivre` com `aPartirDe`, a partir do horário escolhido). O
    Confirmar segue clicável (a recusa de sempre, uma mensagem só). O remarcar
    da janela diz "Não vai ser remarcado: …" e, recusado, fica UMA mensagem
    ("Não foi remarcado: …"). Prova: `e2e/agenda-atritos-da-8.spec.ts` ("A21",
    "A58").
  - **O Confirmar espera os avisos DESTE horário** (D9 da 8ª simulação,
    2026-11-06): `avisosDoHorario` roda 200 ms depois de cada mudança, e o
    botão não esperava — a Ana às 23:55, nas férias e fora do expediente,
    gravou "sem nenhum aviso". O "Confirmar agendamento" fica em "Conferindo o
    horário…" até a conferência do horário escolhido chegar (a falha libera,
    sem aviso: o servidor confere ao gravar), como espera as salas (D12 da
    7ª); o "Confirmar novo horário" do remarcar, igual. O aviso (bloqueio,
    fora do expediente, choque) está na tela ANTES de gravar; o encaixe segue
    permitido. Prova: `e2e/agenda-defeitos-da-8.spec.ts` ("D9").
  - **A sala escolhida no Agendar risca a grade, e o "Dia inteiro" se diz
    assim** (A17 da 9ª simulação, 2026-11-07; princípio 3): o bloqueio da
    profissional riscava a grade de horários livres do modal, o da sala não —
    a sala bloqueada o dia inteiro parecia livre. Com a sala escolhida,
    `getSchedulingDaySlots` traz também os bloqueios dela ("Sala Rosa:
    Manutenção"), e a grade os mostra como bloqueados (o encaixe segue pelo
    campo de data e hora). E o aviso dizia "das 00:00 às 24:00": o bloqueio de
    meia-noite a meia-noite é "o dia 10/11 inteiro" (ou "de 10/11 a 12/11, os
    dias inteiros"; `trechoDoBloqueio`). Prova: `e2e/agenda-unidade-da-9.spec.ts`
    ("A17"), `tests/agenda-bloqueio-dia-inteiro.test.ts`.
  - **O "Agendar" do cabeçalho abre no dia que está na tela** (A16 da 9ª,
    2026-11-07): abria no próximo horário a partir de agora, e a Ana agendou no
    dia errado. Com um dia DEPOIS de hoje na agenda (da unidade ou da rede), o
    modal abre nele (`diaInicial`), e o "próximo livre" da profissional é dele
    em diante (`proximoHorarioLivre` com `aPartirDe`); hoje e o passado, como
    antes. Prova: o mesmo spec ("A16").
  - **"Dia inteiro", e o início de outro dia avisa** (A23 da 8ª simulação,
    2026-11-06): a folga e as férias eram o 12:00–13:00 de padrão trocado à
    mão. "Dia inteiro" troca o início e o fim por "Do dia"/"Até o dia" (da
    meia-noite do primeiro à meia-noite depois do último). E às 23:30 a
    "próxima hora cheia" do padrão já é amanhã: a janela diz "O bloqueio
    começa no dia seguinte…" (`[data-bloqueio-outro-dia]`). Prova:
    `e2e/agenda-atritos-da-8.spec.ts` ("A23").
  - **Iniciar dentro de um bloqueio avisa** (A31): a tela do atendimento
    ainda não concluído diz "Horário bloqueado para Débora de 06/11 às 00:00
    a 13/11 às 00:00 (Férias). O atendimento pode seguir: o bloqueio só
    avisa." (`[data-aviso-do-bloqueio]`, `avisoDoBloqueioNoAtendimento`; o da
    profissional, senão o da sala). Só aviso (princípio 2). Prova:
    `e2e/atendimento-atritos-da-8.spec.ts` ("A31").
  - **Quem bloqueia**: quem tem a Agenda em Gerenciar, na unidade ao alcance;
    com "só os meus", só o PRÓPRIO horário, sem sala ("Com a agenda “só os
    meus”, você bloqueia só o seu horário.") — decidido pela regra do Heitor
    de 28/10 ("quem tem 'só os meus' vê 'só os meus', em qualquer lugar").
    Quem só vê a agenda vê o bloqueio e não bloqueia. Desfazer segue a mesma
    regra.
  - **A vista da SEMANA também mostra** (sobra da F30, 2026-11-05): a célula do
    dia não tem horas, então o bloqueio é uma etiqueta que abre a mesma janela
    (`EtiquetaDoBloqueio`, `[data-bloqueio-da-semana]`; o pedaço do dia por
    `trechoNoDia` — "das 12:00 às 13:00", "o dia todo" no meio das férias): na
    agenda da unidade, o da profissional na célula dela e o da sala numa linha
    "Salas bloqueadas"; na da rede, no dia, com o rótulo de quem é; na "Minha
    agenda", o dia da faixa da semana diz "Bloqueado" (`[data-bloqueado-no-dia]`).
  - **A semana tem os 7 dias** (D3 da 8ª simulação, 2026-11-06; decidido
    pelo princípio 3): a da unidade ia de segunda a sábado — numa clínica que
    abre aos domingos, o agendamento de domingo só aparecia no Mês e no Dia, e
    o contador da semana parava na meia-noite de sábado (8 contra 9 do Mês).
    Agora segunda a DOMINGO sempre (o domingo fechado também: o encaixe de
    domingo não some), e o contador conta os dias do período pela data de
    Brasília (`diasDoPeriodo` + `dayKeyTZ`). **Na semana da REDE, o dia é o de
    Brasília** (D4): o agrupamento era `scheduled_at.slice(0, 10)`, o dia em
    UTC — o das 23:55 de quinta caía na sexta; agora `dayKeyTZ`, e a conta das
    datas da tela é do calendário (meio-dia UTC), não `toISOString` da
    meia-noite local. Prova: `e2e/agenda-defeitos-da-8.spec.ts` ("D3", "D4").
  - Prova: `e2e/agenda-bloqueio.spec.ts`, `tests/agenda-bloqueio.test.ts`.
- **Quem atende é marcado POR UNIDADE** (decisão 2 do Heitor sobre a 8ª
  simulação, 2026-11-06: "Inves de atende também em, o atende vira um
  checklist com todas as unidades, as que estiverem marcadas ficam
  disponiveis"; até ali, D1 de 2026-10-28: o da REDE atendia em todas e o de
  uma unidade só na dele, e a Talita da Água Verde só cobria o Batel ganhando
  a rede inteira — A12). O "Atende" da Equipe é a lista das unidades ativas,
  cada uma marcável (`users.atende_em`, migration `20261106003601`); numa
  clínica de uma unidade, a caixa de sempre. Marcada, a pessoa aparece ali na
  agenda, no agendar (equipe, app e Copilot), no horário dos profissionais, na
  ocupação, no "próximo livre", no repasse da desativação, na comissão e nos
  relatórios. O filtro é UM, `filtroDeQuemAtendeNaUnidade`
  (`lib/cached-queries.ts`: `atende_em cs {unidade}`, num `.or()`), usado por
  `getCachedBranchProfessionals` e por toda lista ou conferência de "quem
  atende aqui" — nunca `branch_id = unidade` nem "a da rede atende em todas".
  A tag da lista é da rede (`professionals:<rede>`).
  - **A abrangência NÃO muda com o checklist** (decidido por "ficam
    disponíveis" + o acesso continuar o dela): a Talita é da Água Verde e,
    marcada no Batel, alcança no Batel só os agendamentos DELA — ver, marcar a
    chegada, iniciar, concluir, a evolução, o anexo do atendimento e a
    comissão. A regra é UMA, `alcancaOAgendamento` (`lib/auth.ts`: a unidade
    ao alcance, ou o agendamento dela numa unidade marcada), em
    `agendamentoAoAlcance`, `startAppointment`, `finishSession`, a conclusão,
    a evolução, o histórico, o pré-atendimento e o anexo. A agenda do Batel, os
    clientes e o caixa de lá seguem fora (o layout de `[slug]` a leva à dela).
    A "Minha agenda" dela traz os dela de fora como cartões ("Na unidade
    Batel", `[data-outra-unidade]`), e a agenda inteira da unidade, a lista
    "Seus atendimentos em outras unidades" (`[data-meus-de-outras-unidades]`);
    os dois abrem a tela do atendimento pelo portal dela
    (`/[slug]/agenda/[id]` resolve a unidade do agendamento). **Quem é da
    rede abre no endereço da unidade DO AGENDAMENTO** (D10 da 9ª simulação,
    2026-11-07): a Carolina, na agenda da Menino Deus, clicava num da Moinhos
    e ia a `/menino-deus/agenda/<id da Moinhos>` — 404. O link da lista é o
    da unidade dele (o portal dela para quem tem unidade fixa), e
    `/[slug]/agenda/[id]` de outra unidade ao alcance redireciona ao endereço
    certo. A lista mostra só o que está EM ABERTO (o concluído de hoje
    aparecia como pendente). Prova: `e2e/agenda-unidade-da-9.spec.ts` ("D10"). "Minhas comissões" (o
    financeiro "só as próprias") cobre também as unidades em que ela atende,
    com o filtro de unidade (`app/[slug]/financeiro/comissoes`).
  - **`provides_services` = "atende em alguma unidade"**, mantido junto da
    lista por um gatilho só (`private.atende_em_sincronizar`): gravar a lista
    acerta o `provides_services`; gravar só o `provides_services` (o caminho de
    antes) liga com o que a pessoa alcança (unidade fixa → a dela; da rede → as
    ativas de agora) ou esvazia a lista; trocar a abrangência sem mexer na
    lista leva junto a lista que seguia a abrangência. A lista só aceita
    unidade da rede. Coluna, não tabela membro × unidade: a tabela com
    chave estrangeira para `users` e `branches` viraria junção no PostgREST
    (PGRST201, §14 do CLAUDE.md).
  - **A unidade NOVA nasce sem ninguém marcado** (princípio 6), e a Equipe
    dela (e a da rede) diz "Ninguém atende nesta unidade ainda" (`[data-ninguem-atende]`),
    como o cartão dela em Configurações → Unidades ("N pessoas atendem aqui",
    `[data-quem-atende-na-unidade]`).
  - **A gerente de unidade fixa marca e desmarca só a DELA** (H7): as outras
    unidades aparecem travadas no checklist, e `updateTeamMember`/
    `createTeamMember` mudam só a dela (`atendeQueGrava`, `lib/equipe/atende.ts`).
    Quem é de fora e atende ali aparece na Equipe da unidade ("Da rede" ou
    "Da unidade Água Verde"), sem ações.
  Prova: `e2e/equipe-atende-por-unidade.spec.ts`, `tests/equipe-atende.test.ts`,
  `e2e/agenda-profissional-da-rede.spec.ts` (a da rede marcada nas duas).
- **O nome de quem está no registro da unidade não vem pelo join da SESSÃO**
  (D2 da simulação de 2026-11-01): a agenda da unidade (o cartão, a janela,
  a "Minha agenda") e o Financeiro da unidade leem o agendamento e o
  lançamento pela sessão, mas o nome da cliente e do profissional sai de
  `nomesDosRegistros` (`lib/nomes-dos-registros.ts`, cliente de serviço, com
  a rede, só os ids dos registros já lidos). Pela sessão, `clients_select`
  mostra a ficha só à unidade de CADASTRO e a política de `users` mostra a
  quem tem unidade fixa só os membros da unidade dele: a cliente cadastrada
  em outra unidade e o profissional da rede viravam "—". A RLS de `clients` e
  `users` não foi alargada (decisão de produto). Prova:
  `e2e/agenda-nomes-de-outra-unidade.spec.ts`.
- **Desativar oferece REPASSAR** (H6, decisão do Heitor, 2026-11-01: "os
  agendamentos e oportunidades de quem é desativado, no momento da
  desativação, [dar] a opção de repassar para outra pessoa, caso a caso ou
  todos de uma vez"). A janela do "Desativar" (`DesativarMembro`, Equipe dos
  dois portais) mostra os agendamentos FUTUROS em aberto (agendado/confirmado)
  e as oportunidades ABERTAS da pessoa, com "Repassar todos … para" e um
  seletor por item ("Deixar com X (sem repasse)" é a escolha padrão). O
  agendamento só vai para quem ATENDE na unidade dele (a regra de
  `filtroDeQuemAtendeNaUnidade`) e REALIZA o procedimento dele ("Quem
  realiza", §9.3 — a lista e a action, "X não realiza este procedimento"), passando por `conferirPecasDoAgendamento` e
  livre no horário (`horarioOcupado`): quem está ocupada aparece desligada, e o
  "todos para" avisa na linha que conflita e a deixa para o caso a caso. A
  oportunidade vai para quem tem o CRM (ou "Sem responsável"), por
  `trocarResponsavelCore`. Repassar pede a Agenda em Gerenciar de todos e
  `podeTrocarResponsavel`; sem isso a janela só diz quantos ficam. A action
  (`deactivateTeamMember` com o repasse) confere CADA item de novo
  (`aplicarRepasse`, `lib/equipe/repasse.ts`); o que falhar volta à tela e a
  pessoa segue ativa. O histórico do agendamento ganha "Repassado de X para Y
  ao desativar X" (REASSIGNED); o do lead, a troca de responsável. O filtro
  "Responsável" do quadro marca quem saiu "(inativo)". Prova:
  `e2e/equipe-desativar-repassa.spec.ts`.
  **Cancelar também, e os vencidos entram** (A10 da 8ª simulação,
  2026-11-06; princípio 3): a janela só repassava ou "Deixar com Débora", e a
  Ana das 23:55 de ontem (agendada, sem ninguém fechar) ficou com ela sem
  aviso. A lista é dos agendamentos EM ABERTO — os futuros e os que já
  passaram sem fechar, nos últimos 30 dias, com "já passou, sem fechar" —, cada
  um com "Cancelar este agendamento" (e "Cancelar todos" no "todos para"), que
  cancela pelo `cancelarCore` com o motivo "Profissional desativada (Débora)";
  e a janela diz o que fica (`[data-o-que-fica]`): "O que ficar sem repasse
  continua no nome de Débora, desativada…", com quantos já passaram. **Sem
  ninguém livre, diz quem atende em OUTRA unidade** (A11): "Atende em outra
  unidade: Talita (Batel). Para repassar a ela, marque “Água Verde” no “Atende
  clientes em” dela, na Equipe, e abra o Desativar de novo — ou cancele aqui."
  Prova: `e2e/equipe-atritos-da-8.spec.ts` ("A10", "A11").
  **Deixar de atender numa unidade também oferece o repasse** (D3, A8 e A51
  da 9ª simulação, 2026-11-07; decidido pelo princípio 3): a Priscila passou a
  atender só na Menino Deus, e os 2 agendamentos dela na Moinhos sumiram da
  grade (o cabeçalho dizia 6, a tela mostrava 4), sem aviso; no app da Rosana,
  um virou "já no horário". Desmarcar a unidade no "Atende clientes em" (ou
  desmarcar o "Atende" de vez) com agendamentos EM ABERTO ali não grava:
  `updateTeamMember` devolve `repasseDoAtende` (a lista de
  `pendenciasDoMembro` só daquelas unidades), e a janela de editar mostra
  "Priscila tem 2 agendamentos em aberto em Moinhos. Sem atender lá, quem fica
  com eles?" com o MESMO repasse do Desativar — "Todos para", um a um, "Cancelar
  este agendamento", ou deixar com ela (`[data-repasse-do-atende]`,
  `RepasseDoAtende`). "Salvar e repassar" aplica o repasse (`aplicarRepasse`,
  com o histórico "Repassado de A para B: A deixou de atender em Moinhos" e o
  cancelamento "A deixou de atender em Moinhos") e só então muda o "Atende"; o
  que falhar volta à tela sem mudar nada. **E a grade da unidade mantém a
  coluna de quem tem agendamento ali** sem atender mais
  (`colunasDeQuemNaoAtende`, "Não atende mais nesta unidade",
  `[data-nao-atende-aqui]`, no dia e na semana): nada some; a coluna não entra
  no agendar. O "a partir de" (A8) não existe: a mudança vale na hora, e o
  repasse cuida do que já estava marcado. Prova:
  `e2e/equipe-unidade-da-9.spec.ts` ("D3").
- **A dona que atende** (D2 da simulação de 2026-10-29): o Admin da rede
  marca "Atende clientes", a comissão e o horário na Equipe da rede com o
  cargo TRAVADO (CLAUDE.md §11; só outra Admin da rede muda o cargo dela,
  revisão do Heitor de 2026-10-29) e entra na agenda, no agendar e na comissão
  como qualquer profissional da rede. A **Equipe da unidade** lista também
  quem é de fora e atende ali (ativo, com a unidade marcada no "Atende"), com o chip "Da rede" ou "Da unidade X", só o nome e o
  cargo, e SEM ações: cargo, comissão e acesso se mexem na Equipe da rede
  (quem é da rede vê o lápis que leva para lá). A sessão de unidade não lê
  membros da rede (RLS): essa lista vem pelo servidor. **E diz o recorte**
  (A12 da 6ª simulação, 2026-11-04: a gerente fixa via 3 de 7 sem saber por
  quê): "Equipe da unidade Casa Forte: quem é dela e quem é da rede e atende
  aqui. Quem é da rede e não atende fica na Equipe da rede."
  (`[data-recorte-da-equipe]`); o "Adicionar membro" dela diz "Entra na
  unidade Casa Forte." (A13). Prova:
  `e2e/equipe-dona-que-atende.spec.ts`.
- **A Admin cadastra outra Admin direto** (eq-01, revisão do Heitor de
  2026-11-02: "oferecer no cadastro; o caminho em dois passos não protege
  nada"): o "Adicionar membro" da Equipe da rede oferece o cargo de sistema
  Admin a quem É Admin (`cargoDeAdminId`); escolhido, a abrangência não se
  pergunta — a Admin é da clínica toda (o servidor já gravava assim e recusa a
  quem não é Admin, `assertRoleInTenant`). Quem gere a equipe sem ser Admin
  não vê o cargo. Prova: `e2e/equipe-dona-que-atende.spec.ts` (eq-01).
- **Rebaixar uma Admin pergunta antes** (A10 da 6ª simulação, 2026-11-04;
  princípio 2: a Admin decide, no máximo avisar): trocar o cargo de quem é
  Admin da rede mostra "Marta é Admin da rede: com o cargo novo, deixa de ter
  acesso total e passa a ver só o que o cargo libera. Trocar o cargo mesmo
  assim?" com "Trocar o cargo mesmo assim" e "Manter como Admin"
  (`[data-rebaixar-admin]`). O servidor pergunta também: `updateTeamMember`
  sem `_rebaixarAdmin=sim` devolve `{ pergunta }` e não grava. As recusas de
  antes continuam (a própria Admin, a última ativa). Prova:
  `e2e/equipe-dona-que-atende.spec.ts` ("A10").
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
  `e2e/agenda-chegar-e-iniciar.spec.ts`. **E quem é a profissional DAQUELE
  agendamento, qualquer que seja o escopo** (A25 da 6ª simulação,
  2026-11-04): a dona que atende, com a agenda de todas, chegava ao dela em
  quatro cliques e uma confirmação ("Chegou" → "Iniciar" → "mesmo assim"); a
  janela (dos dois portais) oferece "Marcar chegada e iniciar" quando o
  agendamento é do membro logado e ele tem a agenda em Gerenciar (`meuId`).
  O início adiantado continua perguntando (r2-age-06). Prova:
  `e2e/agenda-dona-chega-e-inicia.spec.ts`.
  **Um gesto de chegada em destaque** (A5 da 10ª simulação, 2026-11-10;
  princípio 3): no agendamento DELA a janela tinha "Confirmar agendamento",
  "Chegou" e "Marcar chegada e iniciar", dois em rosé. Só o próximo passo é
  primário — o gesto dela no agendamento dela (que vem primeiro); chegou,
  iniciar; confirmado, a chegada; agendado, confirmar — e, com mais de um, a
  linha diz o que cada um faz ("Confirmar: a cliente confirmou que vem.
  Chegou: ela está na espera. …", `[data-o-que-cada-um-faz]`). **Quem não
  conclui lê ANTES de iniciar** (A20): sem o Prontuário em Gerenciar, a janela
  (`podeConcluir`) e a tela do atendimento dizem "Quem conclui é o
  profissional" já no agendado/confirmado/chegou, não só depois de iniciar. E
  o concluído A RECEBER não diz "Este agendamento já foi encerrado." embaixo
  do "Receber pagamento" (A14). Prova: `e2e/atendimento-uso-da-10.spec.ts`.
- **A agenda "só os meus" vale também pelo ID** (D4 da simulação de
  2026-10-28, decisão do Heitor): com `agenda` OWN, a tela do atendimento
  (`app/_shared/sessao-de-atendimento.tsx`, os dois portais) de um
  agendamento de OUTRO profissional diz "Este atendimento é de outra
  profissional", com o nome dela e "Voltar à agenda", e nada do atendimento
  (`AtendimentoDeOutraProfissional`; r2-atd-04, revisão do Heitor de
  2026-11-03: o 404 "Página não encontrada" da A38 parecia defeito — e antes
  dele era `semAcesso()`, "Seu cargo não libera esta tela", e o cargo libera;
  o que não é dela é este atendimento), e as actions pelo id o
  recusam — check-in (`checkinCore`), confirmar, remarcar, cancelar
  (`confirmarCore`/`remarcarCore`/`cancelarCore`, logo também o Copilot),
  iniciar pelo status (`updateAppointmentStatus`), trocar o profissional e
  salvar a evolução. A regra é UMA, `deOutroProfissional`
  (`lib/appointments/alteracoes.ts`); `startAppointment`, `finishSession` e
  `chegarEIniciar` já conferiam. A recepção (ALL) faz o de todos. Antes a
  profissional abria pela URL o atendimento de outra e marcava o check-in ("o
  check-in comum não confere o profissional"). Prova:
  `e2e/agenda-so-os-meus-pelo-id.spec.ts`.
- **Iniciar ANTES do horário PERGUNTA** (A32 da 5ª simulação: a
  Tatiane iniciou às 11:07 o das 13:00, sem aviso). Em QUALQUER quantidade de
  tempo antes do horário marcado (r2-age-06, o Heitor em 2026-11-03:
  "confirma iniciar mesmo assim em qualquer período de tempo anterior ao
  horário marcado"; de 03/11 até ali, só a partir de 30 min) —
  `perguntaDoInicioAdiantado`, `lib/appointments/inicio-adiantado.ts` —, o
  servidor recusa com "O atendimento está marcado para as 13:00 — faltam
  1 h 53 min. Iniciar mesmo assim?" ("faltam menos de 1 min" no último
  minuto); na hora marcada ou depois, inicia direto. Só inicia com
  `{ inicioAdiantadoConfirmado: true }` — nos TRÊS
  caminhos: `startAppointment`, `updateAppointmentStatus` (IN_PROGRESS) e
  `chegarEIniciar` (este pergunta ANTES da chegada: sem a resposta, nem o
  check-in se marca). A tela do atendimento e a janela da agenda mostram a
  pergunta com "Iniciar mesmo assim" / "Agora não". Prova:
  `e2e/agenda-inicio-adiantado.spec.ts`, `tests/inicio-adiantado.test.ts`.
  **Em OUTRO dia, a pergunta diz os dias e pede cuidado** (A24 da 9ª
  simulação, 2026-11-07): era a mesma com 19 minutos e com 15 dias ("faltam
  369 h 30 min"), e o retorno de 22/11 foi concluído em 07/11. Marcado para
  outro dia do calendário de Brasília: "O atendimento está marcado para 22/11
  às 10:00 — faltam 15 dias, não é hoje. Iniciar agora registra o atendimento
  como feito hoje, 07/11: confira se é este o agendamento da cliente. Iniciar
  mesmo assim?" ("falta 1 dia" amanhã). A regra — perguntar sempre — fica.
  Prova: `tests/inicio-adiantado.test.ts` ("A24").
- **A chegada é do DIA do agendamento** (A18, 2026-10-27): `checkinCore`
  recusa fora do dia (Brasília, `ehODiaDoAgendamento`) — vale para a agenda, o
  Copilot e "Marcar chegada e iniciar" — e a janela não oferece "Chegou". O
  cancelado traz o motivo inteiro na janela e no tooltip do bloco. **No
  "Marcar chegada e iniciar", a trava do dia vem ANTES da pergunta do
  horário** (D10 da 7ª simulação, 2026-11-05): numa sessão de amanhã a tela
  perguntava "Iniciar mesmo assim?" e só no clique dizia "A chegada só se
  marca no dia do agendamento". `chegarEIniciar` confere o dia
  (`ehODiaDoAgendamento`) antes de `perguntaDoInicio`. Prova:
  `e2e/agenda-inicio-adiantado.spec.ts` ("D10").
- **A "Minha agenda" agenda — para ela** (A25 da 8ª simulação, 2026-11-06;
  decidido pelo princípio 3): com a Agenda em Gerenciar "só os meus", a Paula
  não marcava a avaliação nem o retorno — o cargo deixava e a tela escondia.
  A "Minha agenda" tem "Agendar" (quando ela atende na unidade), o modal de
  sempre com a profissional = ela, e o servidor recusa outra profissional
  ("Com a agenda “só os meus”, você agenda só para você." — `addAppointment`;
  a regra do Heitor de 28/10, como no bloqueio). Prova:
  `e2e/agenda-atritos-da-8.spec.ts` ("A25").
- **Trocar a profissional pela janela, com confirmação e "de quem para quem"**
  (A22 da 8ª simulação, 2026-11-06): só se trocava arrastando, sem
  confirmação, e o histórico dizia "Remarcado". A janela do agendamento tem
  "Trocar profissional" (`TrocarProfissional`, a quem tem a Agenda em
  Gerenciar de todos): só quem ATENDE na unidade do agendamento, com
  "(ocupada)" na que tem atendimento no horário (`profissionaisParaTrocar`), e
  "Trocar a profissional de A para B?" antes. Arrastar para a coluna de outra
  profissional pergunta também ("Trocar a profissional de A para B e marcar às
  14:00?", `[data-confirmar-arraste]`). O servidor recusa quem não atende na
  unidade (`recusaDeQuemNaoAtende`, em `reassignProfessional` e no
  `remarcarCore` com outra profissional), e o histórico grava "Profissional
  trocado de A para B" (`textoDaTroca`; a janela o mostra — `rotuloDaAcao`).
  Soltar no ocupado diz o porquê, em destaque (8 s). E o horário do arraste é
  o da posição na coluna: somar o `scrollTop` da grade outra vez (o retângulo
  da coluna já anda com a rolagem) jogava o solto para horas depois. Prova:
  `e2e/agenda-atritos-da-8.spec.ts` ("A22").
- **Mudar a UNIDADE de um agendamento pela janela** (A33 da 9ª simulação,
  2026-11-07; H5: "a cliente é da clínica"): mover a sessão da Luana para a
  Menino Deus exigia cancelar e refazer — o Remarcar só muda o horário e o
  "Trocar profissional" só oferece quem atende na unidade. A janela do
  agendamento em aberto (Agendado/Confirmado), na clínica de duas ou mais
  unidades e para quem tem a Agenda em Gerenciar de todos, tem "Mudar de
  unidade" (`MudarDeUnidade`, `[data-mudar-de-unidade]`): a unidade nova (as
  que quem muda alcança), a profissional que ATENDE lá ("(ocupada)"
  desligada) e a sala (opcional, livre); o horário fica. Confirma antes. O
  servidor confere tudo de novo (`mudarUnidadeCore`, `lib/appointments/alteracoes.ts`:
  as duas unidades ao alcance, `conferirPecasDoAgendamento`,
  `recusaDeQuemNaoAtende`, conflito da profissional e da sala); o avulso sem
  lançamento passa ao preço da unidade nova (D2), o já pago fica com o dele;
  o histórico grava "Unidade mudada de Moinhos para Menino Deus"
  (`BRANCH_CHANGED`) e a troca de profissional; a cliente recebe o "Novo
  horário … na unidade Menino Deus". A Equipe diz que "Unidade" (o acesso) e
  "Atende clientes em" (onde agenda) são dois controles
  (`[data-atende-e-unidade]`). Prova: `e2e/agenda-unidade-da-9.spec.ts` ("A33").
- **"Só os meus" cancela e marca a falta do DELA** (agenda-06, revisão do
  Heitor de 2026-11-02; em 28/10 ele confirmou que a profissional cancela o
  que é dela): com a agenda em Gerenciar e escopo "só os meus", a janela da
  agenda (`/admin/agenda`, a da profissional da rede; a da unidade é a "Minha
  agenda", que abre a tela do atendimento) mostra "Cancelar" e "Não
  compareceu", e `updateAppointmentStatus` deixa CANCELLED e NO_SHOW no
  agendamento dela (`deOutroProfissional` recusa o de outra). Confirmar e
  "Chegou" seguem com a recepção. Prova: `e2e/agenda-so-os-meus-pelo-id.spec.ts`.
- **O remarcar da janela AVISA antes de confirmar** (A25 e cli-01, 2026-11-02):
  o horário novo fora do expediente da profissional e o choque (a conta do
  agendar, `avisosDoHorarioCore`, sem o próprio agendamento), e a cliente
  ARQUIVADA ("avisar ao remarcar, sem recusar" — revisão do Heitor):
  `avisosDoRemarcar` → `[data-aviso-do-remarcar]`. Só aviso: o remarcar
  continua. Prova: `e2e/agenda-remarcar-avisa.spec.ts`.
- **Os atritos da agenda da 11ª simulação** (2026-11-10; princípios 2 e 3):
  - **Na agenda da REDE, o bloqueio de UMA profissional é uma faixa estreita**
    na borda da coluna da unidade, com o rótulo dizendo de quem é (A23: pintava
    a coluna inteira, e parecia a clínica fechada; `BlocoDoBloqueio estreita`,
    `[data-bloqueio-estreito]`). O da sala segue como era; na agenda da
    unidade, a coluna já é dela.
  - **Remarcar para um horário que já passou avisa e deixa** (A24): "O horário
    novo (09/11/2026 às 10:00) já passou: o agendamento fica no passado…"
    (`avisoDoHorarioPassado`, `lib/appointments/horario-passado.ts`, no
    `avisosDoRemarcar`).
  - **O atraso do início se diz** (A25: começar 57 min depois não dizia nada,
    e antes da hora a tela pergunta): sem perguntar (atrasar não é engano de
    agendamento), a tela do atendimento diz "Atrasado: 57 min depois do horário
    marcado (10:00)." antes de iniciar (o relógio do navegador, `useAgora`) e,
    iniciado, "Iniciado 57 min depois do horário marcado (10:00)."
    (`atrasoDoInicio`, `lib/appointments/inicio-adiantado.ts`; até 5 min é a
    hora — a régua da tela). Nada se grava.
  - **A "Minha agenda" abre perto de agora** (A26: na clínica 24 h ela abria
    às 00:00, 12 telas até o meio-dia no celular): a grade dela rola pela MESMA
    régua da agenda da unidade (`rolagemDaGrade`: hoje, uma hora antes de
    agora; outro dia, o primeiro atendimento ou o começo do horário dela;
    `[data-rolagem-minha-agenda][data-rolagem="pronta"]`). O destaque
    "Próximo atendimento" é um LINK para a tela do atendimento e o nome quebra
    a linha em vez de cortar. E a grade do Dia da unidade tem a largura mínima
    das colunas que há (60 + 150 por profissional — era 500 fixo, e a segunda
    profissional saía cortada a 412 px).
  - Prova: `e2e/agenda-atritos-da-11.spec.ts`, `e2e/atendimento-atritos-da-11.spec.ts`,
    `tests/agenda-remarcar-no-passado.test.ts`, `tests/inicio-adiantado.test.ts` ("A25").
- **Os atritos da agenda da 12ª simulação** (2026-11-11; princípio 3):
  - **O destaque da "Minha agenda" anda com o relógio e diz o atrasado** (A26:
    às 00:3x a Gabi lia "Próximo atendimento 22:00" — a tela aberta na véspera
    congelava o dia e a hora —, com a avaliação das 00:30 em aberto). O "agora"
    é o `useAgora` (de 30 em 30 s); o horário que já começou e segue em aberto
    (agendado, confirmado ou chegou, ainda dentro da duração) vem antes do
    próximo: "Atrasado: 5 min" (ou "Chegou · atrasado 5 min").
  - **A janela diz quando a falta aparece** (A27; a regra fica — "Não
    compareceu" só depois do início): antes do horário, "“Não compareceu”
    aparece a partir do horário marcado (…): antes dele, a cliente ainda pode
    vir. Para desmarcar agora, é “Cancelar”, com o motivo."
    (`[data-falta-depois-do-horario]`).
  - **No celular, a "Minha agenda" cabe** (A28): o título do dia não quebra (no
    celular, o dia curto — "qua, 11 de nov" —, `onde-no-celular`), a navegação
    e a legenda quebram a LINHA (`[data-legenda-da-agenda]`), e "Minhas
    comissões" fica no topo dela para quem tem o Financeiro em Ver
    (`[data-minhas-comissoes]`).
  - Ficou como está: o toque no cartão da "Minha agenda" abre o atendimento, e
    o da agenda de todas abre a janela de ações (A25) — é o desenho do
    agenda-06 (a "Minha agenda" abre a tela do atendimento).
  - Prova: `e2e/agenda-atritos-da-12.spec.ts`.
- **A grade do dia rola a cada troca de dia** (D8): hoje, uma hora antes de
  agora; outro dia, o primeiro atendimento ou a abertura da unidade, o que
  vier antes (`rolagemDaGrade`). A grade da REDE (`/admin/agenda`) segue a
  mesma régua desde a F64 (D13 da 13ª: abria sempre no topo — numa unidade
  24 h, à meia-noite), com o "hoje" no fuso da rede e a abertura da janela
  das unidades (`[data-grade-da-rede][data-rolagem="pronta"]`; prova:
  `e2e/fuso-da-unidade-sobras.spec.ts`). O novo agendamento sugere o próximo horário
  livre da profissional (A20, `proximoHorarioLivre`, a conta de
  `computeAvailableSlots`) quando a hora não veio de um clique na grade.
  **E a troca nunca é calada** (D7 da 12ª simulação, 2026-11-11; princípio 3:
  às 23:10 o modal abriu em 23:30 — o último início era 23:00 — e gravou 11/11
  00:00 sem a Heloísa ver). A conta parte da hora que está NA TELA (`aPartirDe` =
  a hora de abertura): se ela cabe, fica; se não cabe, o campo vai ao próximo
  livre e a janela diz "Hoje não há mais horário livre para Gabi. O próximo é
  amanhã, 00:00." (ou "14:00 não está livre para Gabi. O próximo horário livre
  é 15:30." — `textoDoProximoLivre`, `lib/agenda/proximo-livre.ts`,
  `[data-proximo-livre]`). O Confirmar espera essa conta ("Conferindo o
  horário…"), e a hora escolhida pela pessoa (o campo, a grade, o "Usar o
  próximo livre") não se troca mais. Prova: `e2e/agenda-defeitos-da-12.spec.ts`
  ("D7", com o relógio às 23:30), `tests/defeitos-da-12.test.ts` ("D7").
  A linha do tempo da cliente registra confirmação e chegada (A23).
- **Os atendimentos de dias anteriores ainda ABERTOS avisam** (J-32,
  2026-10-30): a agenda e o dashboard da unidade mostram "N atendimentos de
  dias anteriores ainda abertos" — quem CHEGOU ou está EM ATENDIMENTO num dia
  que já passou (últimos 30 dias), com o link para a tela do atendimento
  (`abertosDeAntes`, `lib/metrics/abertos-de-antes.ts` — na fonte única desde
  o ind-02, 2026-11-02; o aviso em `components/branch/abertos-de-antes.tsx`).
  A cliente das 23:50 sumia da agenda à meia-noite. O agendado/confirmado que
  passou sem ninguém mexer vem num GRUPO À PARTE (agenda-03, revisão de
  2026-11-02: "N agendamentos de dias anteriores passaram sem chegada —
  marcar falta ou concluir?"); era deixado de fora. O aviso aparece também
  no dashboard da REDE (H3, "a dona vê tudo, sempre": a dona da clínica única
  usa o /admin), das unidades do recorte, com a unidade de cada linha quando
  há mais de uma e o link para `/admin/agenda/<id>`. Respeita o "só os meus"
  da agenda. Prova:
  `e2e/agenda-abertos-de-dias-anteriores.spec.ts`.
- **O de HOJE que passou do horário em aberto é marcado no cartão** (A21 da 9ª
  simulação, 2026-11-07: o órfão das 00:30 da Rosana parecia um agendamento
  como outro qualquer): agendado ou confirmado com o FIM já passado diz "·
  passou do horário" (`[data-passou-sem-fechar]`, aviso; a dica: "marque a
  falta, a chegada ou conclua"), no Dia e na Semana da agenda da unidade
  (`passouSemFechar`, `lib/use-agora.ts` — o relógio do navegador, sem erro
  de hidratação: no servidor não marca). Nada se fecha sozinho (princípio 6).
  **E na agenda da REDE** (`/admin/agenda`, o Dia e a Semana; sobra da F43,
  2026-11-07), com a duração MARCADA (`duration_min`). Prova:
  `e2e/agenda-atritos-da-9.spec.ts`.
- **A grade do dia da REDE desenha o bloco com a duração marcada** (sobra da
  F44, 2026-11-07): `duration_min`, como a da unidade — era 60 min para todo
  bloco não concluído (o de 30 parecia de uma hora, o de 90 também). A altura
  é a duração (`apptHeight`, piso de 24 px); o texto que não cabe é cortado, e
  a dica do bloco diz tudo, com os minutos. Prova:
  `e2e/agenda-atritos-da-9.spec.ts` ("sobra da F44").
- **A grade do dia da unidade marca quando já rolou** (F45):
  `[data-grade-do-dia][data-rolagem="pronta"]`, posto pelo efeito de
  `rolagemDaGrade` depois de hidratar. O clique num cartão logo depois de abrir
  a tela disputava com essa rolagem e caía na coluna ("Novo agendamento" às
  01:45 no lugar da janela). O E2E clica pelo `cartaoNaGradeDoDia`
  (`e2e/apoio/agenda.ts`), que espera a marca.
- **O concluído mostra a hora REAL** ao lado da agendada (J-34): "23:30 ·
  concluído em 29/10 às 00:22" na grade do dia, na janela, na agenda da rede e
  no cartão da Agenda do app da cliente (`textoDoConcluido`,
  `lib/agenda/hora-real.ts`, Brasília). Prova:
  `e2e/agenda-concluido-hora-real.spec.ts`, `tests/agenda-hora-real.test.ts`.
  No Histórico do app a marcada se diz: "marcado para 19:00 · concluído às
  18:11" (A31 da 14ª, F73, `textoDoHorarioNoHistorico`). O cartão "Como foram
  os seus atendimentos?" da home diz a hora (a real) e, com mais de uma
  unidade, onde: "Concluído em 12/11 às 18:11 · Manacá Pampulha · toque para
  avaliar" (A30, `textoDoParaAvaliar`). E o "Agendamento remarcado" do app diz
  a unidade nova quando mudou: "… às 15:00, na Manacá Pampulha (outro
  endereço)." (A29, `textoDoRemarcado`). Os três em
  `lib/clientes/textos-do-app.ts`; prova:
  `tests/textos-do-app-da-cliente-f73.test.ts`.
- **"Não compareceu" só depois do início** do agendamento (a folha esconde, a
  action recusa). **E pergunta antes de gravar** (A25 da 7ª simulação,
  2026-11-05: gravava no clique): "Marcar que X não compareceu às 10:00? Os
  termos em aberto deste horário são cancelados, e o que estava pago (pacote,
  plano, pré-pago) volta para ela." com "Confirmar a falta" / "Voltar"
  (`[data-confirmar-falta]`). Prova: `e2e/ficha-cadastro-atritos-da-7.spec.ts` ("A25"). `updateAppointmentStatus` devolve `{ error }` (só a trava de
  permissão lança): a folha mostra o erro e, no sucesso, a agenda dá o aviso
  (o `toast` do sonner, o de todo o app). A agenda da unidade leva o dia na URL (`?date=`), e a
  grade de hoje abre na hora de agora. Prova: `e2e/agenda-avisos.spec.ts`.
- **O prontuário na ficha da cliente** é a aba "Prontuário" (a chave segue
  `fichas`): aparece para quem pode ver o clínico mesmo antes do primeiro
  atendimento, com a anamnese. **A alergia vai em destaque** na ficha e no
  atendimento (`alergiasDaAnamnese` + `AlertaDeAlergia`: o campo `allergies` ou
  de rótulo "alerg…", sem "não"/"nenhuma"), só para quem vê o prontuário.
  **As anotações da ficha aparecem junto da anamnese** (A28 da 8ª simulação,
  2026-11-06): a alergia que veio da planilha nas anotações da cliente
  (`clients.notes`) não chegava ao atendimento. A tela do atendimento mostra
  "Anotações da ficha da cliente: …" como estão escritas
  (`[data-anotacoes-da-ficha]`), só a quem vê o prontuário — sem interpretar
  o texto nem virar faixa de alergia (atend-15: "nada interpreta texto"), e
  sem copiar para a anamnese. Prova: `e2e/atendimento-atritos-da-8.spec.ts`
  ("A28").
  Para quem TEM o app, o concluído diz "A cliente ainda não confirmou nem
  avaliou pelo app (opcional).", sem alerta (A49 da 5ª simulação: era
  "⏳ Aguardando confirmação…", lido como pagamento pendente); sem o app, que
  a confirmação não se aplica.
  Prova: `e2e/prontuario-atritos.spec.ts`.
- **A avaliação da cliente: o atendimento e cada procedimento** (F17-3, o
  Heitor: "a ser configurado pela clínica, mas, a princípio, avaliação do
  atendimento e avaliação por procedimento também"). A cliente avalia no app,
  ao confirmar o atendimento concluído ("Confirmar e avaliar", no Histórico →
  `/[slug]/cliente/atendimentos/[id]/confirmar`), com estrelas opcionais e o
  comentário. **O que ela avalia é da clínica** (Configurações → Geral, "O que
  a cliente avalia", `tenants.avaliacao_o_que`): "O atendimento e cada
  procedimento" (`OS_DOIS`, o padrão), "Só o atendimento" ou "Só cada
  procedimento"; a gerente de unidade fixa não muda (`recusaDaConfigDaClinica`).
  - A nota do **ATENDIMENTO** ("Atendimento — como foi, com a Dra. X") é
    `appointments.client_rating` e vale para o atendimento e a profissional.
    Era o "Profissional" de antes.
  - A de **cada procedimento** feito nele — a sessão de plano Botox +
    Preenchimento pede as duas; o mesmo procedimento duas vezes na sessão, uma
    — mora em `avaliacoes_dos_procedimentos` (só o servidor; o id do
    procedimento SEM chave estrangeira, abaixo). Os procedimentos são os de
    `metrics_procedimentos_executados` (`procedimentosDoAtendimento`,
    `lib/avaliacao/leitura.ts`).
  - Grava UMA transação, `avaliar_atendimento` (`confirmAndRateAppointment`):
    o agendamento travado, só a dona da ficha, só concluído e não confirmado,
    só o que a clínica pede (a configuração é lida lá dentro), e recusa o
    procedimento que não foi feito ("Esta avaliação tem um procedimento que
    não foi feito neste atendimento.").
  - Nos rankings (`indicadores.md`): o por procedimento usa a nota de cada
    procedimento; o por profissional, a do atendimento. Com "Só o
    atendimento", cada procedimento do atendimento fica com a nota dele; com
    "Só cada procedimento", a profissional fica com a média das notas daquele
    atendimento (decididos pelo princípio 3). A avaliação de ANTES continua
    valendo: a nota do atendimento e a de procedimento (`procedure_rating`) no
    procedimento do agendamento.
  - A equipe vê "Atendimento 4/5 · Botox 5/5 · Preenchimento 4/5" na tela do
    atendimento (`[data-avaliacao-da-cliente]`) e na linha do tempo da ficha
    ("Avaliou: …"); a cliente, no Histórico do app (`notasDaAvaliacao`,
    `lib/avaliacao/notas.ts`).
  - **No Início do app, o concluído é para avaliar** (A56 da 12ª simulação,
    2026-11-11; princípio 3: "Aguardando sua confirmação · Toque para
    confirmar e avaliar" se lia como confirmar presença): a seção é "Como
    foram os seus atendimentos?", diz que é opcional, e cada cartão "Concluído
    em 10/11 · toque para avaliar" (`[data-aguardando-confirmacao]`). Prova:
    `e2e/portal-cliente-atritos-da-12.spec.ts` ("A56").
  - Prova: `e2e/portal-cliente-avaliacao-por-procedimento.spec.ts`,
    `e2e/portal-cliente.spec.ts` ("confirma e avalia"),
    `tests/historico-autor-e-avaliacao.test.ts`.
- Campo `source`: `INTERNAL` (equipe pelo web/app), `CLIENT_APP` (cliente pelo portal, só procedimentos `visible_on_client_app`), `COMMERCIAL` (o agendamento do COMERCIAL, abaixo). `ONLINE` é legado do agendamento público, que foi descartado — não usar em código novo.
- **O núcleo do agendar lê junto o que não depende** (A33 da 5ª simulação:
  "Agendando…" passou de 3,5 s, com 9 a 12 idas ao banco em série).
  `createAppointmentCore` confere as peças, lê o procedimento, a oportunidade
  aberta e o nome de quem agenda num `Promise.all`, e os conflitos de sala e
  de profissional noutro; o card do CRM (`ligarAgendamentoAOportunidade`) e
  o evento `agendamento.criado` saem em `after()`, depois da resposta. As
  recusas e a ordem delas são as de antes. Teste que confere o card ou o
  evento logo depois de agendar ESPERA (`expect.poll`). Prova: os specs da
  agenda e `e2e/crm-agendar-liga-oportunidade.spec.ts`.
- **O agendamento novo aparece na ficha na hora** (D9 da 7ª simulação,
  2026-11-05; princípio 3): a Lia remarcou o Cláudio e a ficha dizia "Nenhum
  agendamento futuro" até recarregar duas vezes. A ficha lê um cache de 60 s
  (`getCachedClientProfileData`, tag `appointments:<rede>`), e o agendar da
  agenda (`addAppointment`, também o "Reagendar" da falta) não o expirava.
  `createAppointmentCore` expira a tag (`revalidateTag(…, { expire: 0 })`) —
  são cinco caminhos que agendam; remarcar, cancelar e confirmar já expiravam
  (`revalidarAgendamento`). Prova:
  `e2e/clientes-ficha-proximos-depois-de-agendar.spec.ts`.
- **A origem COMMERCIAL é da cliente com oportunidade ABERTA, não de quem agenda** (D11/A12 da
  simulação de 2026-10-27): `createAppointmentCore` procura a oportunidade aberta da cliente
  (`oportunidadeDoAgendamento`, `lib/crm/liga-agendamento.ts`; o card passa o `leadId` já
  conferido por `leadAoAlcance`) e, havendo, grava `COMMERCIAL` — agendando pelo card, pela ficha,
  pela agenda ou pelo Copilot, e seja o SDR da rede ou de UNIDADE (o `isComercial` antigo
  era `ctx.branchId === null`). Pelo card o agendamento é sempre COMMERCIAL. A cliente que agenda
  sozinha pelo app segue `CLIENT_APP`. Sem oportunidade aberta (nenhuma, ganha ou perdida) é
  `INTERNAL`. Fora do plano `oportunidades` não se liga nada.
  Agendar escreve `APPOINTMENT_CREATED` na linha do tempo do card (o núcleo, não a action) e
  **não move o card** (crm-05, revisão do Heitor de 2026-11-02: "não existe movimento automático
  padrão nos funis; caso queiram, podem fazer isso através do módulo de automações com as regras
  que quiserem"). Até ali ele ia para a etapa marcada "agendado" (`crm_stages.marca`, A12 de
  2026-10-27); a coluna ficou e nada a lê. O `agendamento.criado` leva a oportunidade aberta
  ligada (`dados.leadId`), e é por ela que "Agendamento criado → Mover de etapa" acha o card
  (`automacoes.md`). Prova: `e2e/crm-agendar-liga-oportunidade.spec.ts`.
- **A cliente cancela e remarca pelo portal até o prazo da rede**
  (`tenants.portal_prazo_alteracao_horas`, 24h por padrão, Configurações →
  Geral; decisão do Heitor, 2026-10-21): o cartão da agenda abre o detalhe
  (`/[slug]/cliente/agendamentos/[id]`, só a ficha DELA), e
  `actions/portal-agendamentos.ts` confere de novo o prazo e o status; o horário
  novo é um dos livres do self-service, para o mesmo profissional. Dentro do
  prazo, só "Falar com a clínica" (WhatsApp da unidade). Prova:
  `e2e/portal-cliente-alterar-agendamento.spec.ts`.
  O prazo aparece em DIA E HORA (J-61, `limiteParaAlterar`,
  `lib/clientes/agenda-do-portal.ts`, Brasília): "Pelo app, você cancela ou
  remarca até terça-feira, 03/11 às 10:00 (24 horas antes do horário)" — o dia
  da semana por extenso (A58 da 11ª simulação, 2026-11-10: "até ter, 10/11"),
  "O prazo …
  terminou em …", e no cartão da agenda "Alterar até …", com a seta de que o
  cartão abre. **Fora do prazo, a saída é inteira** (A53 da 7ª simulação,
  2026-11-05; a regra do prazo fica): o cartão da lista diz "Prazo do app
  encerrado: fale com a clínica para alterar" (`[data-prazo-encerrado]`), e o
  detalhe (`[data-fora-do-prazo]`) diz até quando era, "Falar com a clínica"
  com a mensagem "Preciso cancelar ou remarcar o meu agendamento de X em
  DD/MM HH:MM (o prazo do app já passou)" e "Ligar para a clínica" (`tel:`). O motivo do cancelamento é "Motivo (opcional)" (J-64). Prova:
  `e2e/portal-cliente-prazo-na-tela.spec.ts`, `tests/agenda-do-portal.test.ts`.
  **Remarcar oferece "Sem preferência"** (A59 da 5ª simulação, "Reforça",
  item 11): com mais de uma profissional que atende na unidade e realiza o
  procedimento, o remarcar do app pergunta "Com quem?" — "Com X" ou "Sem
  preferência", que escolhe de novo quem estiver livre no horário (as mesmas
  `candidatasDoDia`/`escolherQuemAtende` do agendar, sem o próprio
  agendamento ocupando o horário). O agendamento feito em "Sem preferência"
  guarda isso (`appointments.sem_preferencia`, migration `20261101000602`) e
  o remarcar começa por aí; antes, ele prendia a escolhida (a Renata só de
  manhã). **O cancelamento sem motivo** grava "Pela cliente no app" (A61: era
  "Pela cliente no app: Cancelado pela cliente no app"). Prova:
  `e2e/portal-cliente-remarcar-sem-preferencia.spec.ts`.
  **E diz quem atende ANTES de confirmar, sem contar o próprio horário** (A56
  da 11ª simulação, 2026-11-10; princípio 3: a Bruna virou Carla e a cliente
  só soube depois): escolhido o horário em "Sem preferência", "Com Bia (a
  mesma de antes) — quem está livre neste horário."
  (`[data-quem-atende-no-remarcar]`, `quemAtendeNoRemarcar`, a MESMA escolha do
  remarcar); e o próprio agendamento não conta como atendimento do dia de quem
  o tem (`candidatasDoDia` com `ignorarAgendamentoId` tira ele da contagem —
  contava, e a escolha pendia para a outra). **O horário novo dentro do prazo
  avisa** (A57 da 11ª): "Este horário fica a menos de 24 horas: depois de
  remarcar, para mudar de novo ou cancelar, fale com a clínica."
  (`[data-dentro-do-prazo]`), como o Confirmar do agendar (A52 da 8ª, que já
  valia para qualquer dia). Prova: `e2e/portal-cliente-atritos-da-11.spec.ts`.
  **E o "Sem preferência" diz o que é, e o remarcado diz com quem** (A50 e A51
  da 12ª simulação, 2026-11-11; princípio 3: a Ana via "Sem preferência"
  marcado ao lado de "Com Helena" e não sabia se a profissional podia mudar; a
  Sabrina passou da Eva à Fernanda e o "Agendamento remarcado." não dizia):
  marcado, "Sem preferência: hoje o agendamento é com Helena; no horário novo,
  fica com quem estiver livre — pode ser outra profissional. Para ficar com
  Helena, escolha “Só com Helena”." (`[data-o-que-e-sem-preferencia]`; o outro
  botão é "Só com X"); o "Confirmar novo horário" espera a conta de quem atende
  ("Conferindo quem atende…"; a falha libera, o servidor confere ao gravar); e
  o aviso é "Agendamento remarcado: com Fernanda, quinta-feira, 13/11 às
  11:00." (`remarcarPelaCliente` devolve `quemAtende`). **O agendar dentro do
  prazo diz o que acontece com ESTE agendamento** (A52 da 12ª): "o agendamento
  nasce sem cancelar nem remarcar pelo app (pelo app, só até 24 horas antes)",
  e o "Horário marcado" repete ("…para cancelar ou remarcar, fale com a
  clínica"). Prova: `e2e/portal-cliente-atritos-da-12.spec.ts`.
- **"Sem preferência" de profissional no app** (D-16, decisão do Heitor,
  2026-10-30): com mais de uma profissional na unidade, o passo
  "Profissional" do agendamento oferece "Sem preferência". A data mostra os
  horários de TODAS, juntos (`juntarHorarios`); ao confirmar,
  `createClientAppointment` (com `professionalId` nulo) escolhe no servidor
  quem está livre naquele horário, com menos atendimentos no dia (qualquer
  unidade, fora cancelado e falta) e, no empate, a primeira pelo nome
  (`escolherQuemAtende`, `lib/appointments/sem-preferencia.ts`). As
  candidatas e os livres são `candidatasDoDia` (`lib/appointments/core.ts`):
  quem atende na unidade (`filtroDeQuemAtendeNaUnidade`) e os livres de
  `computeAvailableSlots` — a escolhida passa depois pelas mesmas
  conferências de quem a cliente escolheu. As candidatas são só as que
  REALIZAM o procedimento ("Quem realiza", §9.3; sem ninguém marcado, todas as
  que atendem na unidade). **Confirmado, o app diz quem ficou** (A48 da 6ª
  simulação, 2026-11-04: o resumo dizia só "Sem preferência"): o aviso
  "Horário marcado — Com Bia, quarta, 05/11 às 10:00." (`quemAtende` de
  `createClientAppointment`; vale também para quem escolheu). Prova:
  `e2e/portal-cliente-sem-preferencia.spec.ts`, `tests/sem-preferencia.test.ts`.
  **Com UMA profissional que realiza, o passo nem aparece** (A2 da 10ª
  simulação, 2026-11-10): o procedimento leva direto à data, com "Com X" e
  quando ela atende; o Voltar volta ao procedimento. Prova:
  `e2e/agenda-clinica-de-uma-opcao.spec.ts`.
- **A cliente agenda em QUALQUER unidade da clínica pelo app** (H5, decisão do
  Heitor, 2026-11-01: "A cliente é da clínica, pode agendar em qualquer
  unidade da clínica"; A62/A65 da 5ª simulação). A ficha é da REDE: o portal
  de qualquer unidade ATIVA da rede da ficha abre a mesma ficha
  (`slugsDaClinica` em `fichaDaRequisicao`, e o layout de `[slug]` confere a
  rede, não a unidade de cadastro — que abre mesmo desativada, por ser o
  destino do login). Com mais de uma unidade, o agendar começa por "Em qual
  unidade?": cada uma é o agendar do endereço DELA, e os procedimentos, as
  profissionais e os horários vêm de lá; o resumo diz a unidade. Os cartões da
  Agenda do app dizem a unidade de cada agendamento quando a clínica tem mais
  de uma. Até 2026-11-02 a Zona Sul voltava à Moinhos sem aviso, e o agendar
  dava 404 fora da unidade de cadastro. A lista de unidades da cliente é cache
  de 5 min (`getCachedFichasDoLogin`): a unidade nova aparece no app em até
  5 min. Prova: `e2e/portal-cliente-outra-unidade.spec.ts`,
  `tests/ficha-da-requisicao.test.ts`.
  **O aviso "Horário marcado" diz a unidade** quando a clínica tem mais de
  uma ativa (A28 da 6ª simulação, 2026-11-04): "Botox em 05/11 às 10:00, na
  unidade Boa Viagem." (`textoDoHorarioMarcado`, `unidadeParaOAviso`, nos dois
  avisos de agendamento novo). Prova: `e2e/pacote-sessao-agendar.spec.ts`,
  `tests/texto-do-horario-marcado.test.ts`.
  **E o remarcado e o cancelado também; e nenhum aviso decide o gênero** (A48
  da 9ª simulação, 2026-11-07): "Seu Avaliação foi concluído" e "Seu Drenagem
  linfática foi concluído" — o nome do procedimento é da clínica, e o texto
  não decide por ele. Os avisos à cliente ficam neutros, com o procedimento
  depois de dois-pontos ("Atendimento concluído: Avaliação.", "Pagamento
  confirmado: Avaliação.", "Agendamento cancelado: Avaliação de 07/11 às
  10:00, na unidade Moinhos.", "Novo horário: … na unidade Moinhos." —
  `lib/appointments/texto-do-aviso.ts`), e o da equipe também ("Cancelado:
  Juliana — Avaliação de …"). Prova: `tests/textos-dos-avisos-da-9.test.ts`.
- **O agendar do app passa pelo NÚCLEO da agenda** (por-05, revisão do Heitor
  de 2026-11-02): `createClientAppointment` confere o que é do app (o
  procedimento visível no app, o horário entre os livres, quem atende na
  unidade, o "Sem preferência") e grava por `createAppointmentCore` —
  peças da rede, arquivada, conflito, preço, crédito pré-pago/pacote,
  oportunidade aberta e o evento "agendamento criado" (com o ator `cliente`),
  que o app não emitia. Só a sessão livre do PLANO se liga depois, no app.
- **A cliente ARQUIVADA não agenda pelo app** (o Heitor: "concordo"): o
  agendar mostra "Fale com a clínica para agendar." e o cartão da unidade
  (`AgendarComAClinica`), e `createClientAppointment` recusa com a mesma frase
  (`CLIENTE_ARQUIVADA_NO_APP`). Prova: o mesmo spec.
- **O cartão do pacote leva ao agendamento DELE** (A63 da 5ª simulação): na
  home do app, o pacote diz "N de M sessões realizadas · restam R" e, pela
  próxima sessão livre, "Agendar <procedimento>" — o agendar abre já na
  profissional (`?procedimento=`). Se o procedimento não é agendável pelo app
  (fora do app, inativo ou de outra unidade), diz "<procedimento>: agende com
  a clínica", com o WhatsApp. Era "Agendar procedimento", cuja lista não tinha
  o Laser. Prova: `e2e/agenda-pago-antes.spec.ts` ("A63"). **Com mais de uma
  unidade, o atalho pergunta "Em qual unidade?" antes** (D12 da 9ª simulação,
  2026-11-07; H5): "Agendar Drenagem linfática" assumia a Moinhos e listava só
  quem atende lá. O agendar com `?procedimento=` começa no passo da unidade,
  com o procedimento já escolhido, e cada unidade leva a
  `?procedimento=…&unidade=escolhida`, que segue direto para a profissional.
  Prova: `e2e/portal-cliente-unidade-da-9.spec.ts`.
- **O cartão do plano FECHADO abre** (A45 da 6ª simulação, 2026-11-04): na
  home do app, "Plano de tratamento · 1 de 3 sessões feitas · 1 agendada", e
  aberto (`<details>`, `.cartao-que-abre`) cada sessão com os procedimentos e
  a situação ("Feita em 28/10", "Agendada para 11/11 às 10:00", "A agendar")
  e o dinheiro: "Pago R$ X" e "A pagar R$ Y · próxima em DD/MM/AAAA", com o
  link para os pagamentos. Os números são os de `getFinanceiroDoPlano`
  (`lib/metrics/plano.ts`, a regra única de receita); nada clínico vai.
  Prova: `e2e/portal-cliente-plano-fechado.spec.ts`. **O cartão diz o nome que
  a clínica deu ao plano e o desconto** (A55 da 12ª simulação, 2026-11-11;
  princípio 3: a Marina via só "Plano de tratamento", sem o "Manchas — laser"
  combinado): o título é `treatment_plans.name` (sem nome, "Plano de
  tratamento"; o proposto, "X (proposto)"), com "Com desconto de R$ 70,00"
  quando houve (`nomeDoPlanoNoApp`, `descontoDoPlanoNoApp`,
  `lib/plano-de-tratamento/nome.ts`); e o Financeiro do app diz, embaixo de
  cada lançamento do plano, "Plano “Manchas — laser” · com desconto de R$ 70,00
  no total" (`[data-plano-do-lancamento]`). Prova:
  `e2e/portal-cliente-atritos-da-12.spec.ts` ("A55").
- **O agendar do app diz QUANDO cada profissional atende** (J-60) e tem
  "Hoje"/"Amanhã" e os horários por Manhã/Tarde/Noite (J-59, o mesmo
  `gruposDeHorario` do remarcar). O texto é `resumoDoHorario`
  (`lib/agenda/horario.ts`: a unidade ∩ ela, dias seguidos de mesmo horário
  juntos — "Seg a sex, 18:00–22:00"), no cartão da profissional e no passo da
  data. O "hoje" é o de Brasília. Prova:
  `e2e/portal-cliente-agendar-horarios.spec.ts`, `tests/resumo-do-horario.test.ts`.
- **"Próximo" no portal da cliente é UMA regra** (D14 da simulação de
  2026-10-29; `lib/clientes/agenda-do-portal.ts`): em aberto (agendado,
  confirmado ou na clínica) E com o horário ainda por vir — os "Próximos" da
  Agenda e o "Próximo agendamento" da home. O que passou sem ser fechado vai
  ao histórico. A Agenda filtrava só o status, e o "Na clínica" de ontem
  aparecia em "Próximos". Prova: `tests/agenda-do-portal.test.ts`. **O de
  HOJE fica até a conclusão** (A51 da 7ª simulação, 2026-11-05: às 15:00 o
  das 10:00 ainda "Agendado" sumia, e a home dizia "Nenhum agendamento
  próximo"): "Próximo" é em aberto (agora também em atendimento) e de HOJE
  em diante (`inicioDosProximos`, o início do dia de Brasília); o que passou
  da hora diz "Hoje, já no horário: a clínica registra quando o atendimento
  terminar." (`[data-passou-da-hora]`). O de ontem em aberto segue no
  histórico. Prova: o mesmo teste e `e2e/portal-cliente-alterar-agendamento.spec.ts` ("A51").
- **A janela do agendamento diz duração, sala e unidade** (A29 da 5ª
  simulação; `[data-detalhes-do-agendamento]`), o cartão da grade diz a sala,
  e o cancelado (e a falta) ganha "Reagendar" — o novo agendamento já com a
  cliente (`?novo=1&cliente=`), para quem cancela. **O cartão curto (30
  min) diz o procedimento e a sala** numa segunda linha, e todo cartão tem a
  dica com hora, cliente, procedimento, sala e duração (A23 da 6ª simulação:
  mostrava só "03:50 Paula Reis"). Prova:
  `e2e/agenda-janela-detalhes.spec.ts`. **O de 45 min também diz o
  procedimento** (A29 da 7ª simulação, 2026-11-05: o cartão de 56 px tinha a
  hora e a cliente, sem o procedimento); o rótulo da primeira hora (o 00:00
  da unidade 24 h) não fica por baixo do cabeçalho fixo da grade; o clique
  num vazio da coluna abre o novo agendamento JÁ com a profissional dela; e
  o nome do termo na janela quebra a linha, inteiro (`[data-titulo-do-documento]`,
  com a dica), em vez de sair cortado. Prova: `e2e/agenda-atritos-da-7.spec.ts`
  ("A29"), `e2e/agenda-janela-termo.spec.ts`.
  **Até 40 min, o cartão é de DUAS linhas** (A24 da 8ª simulação, 2026-11-06):
  o de 40 min tinha três linhas em 49 px, e o de 30 cortava o procedimento.
  Na agenda da unidade, abaixo de 56 px (menos de 45 min), a hora e a
  cliente, e o procedimento e a sala; na "Minha agenda", abaixo de 1 h (o
  cartão grande tem o avatar), a hora, a cliente e a situação, e o
  procedimento e a duração (`[data-procedimento-do-cartao]`). Prova:
  `e2e/agenda-atritos-da-8.spec.ts` ("A24").
  **"Reagendar" a falta (e o cancelado) vem com o procedimento e a
  profissional** (A27 da 7ª simulação; abria só com a cliente e sugeria um
  horário já passado): `?novo=1&cliente=&procedimento=&profissional=`
  (`useNovoAgendamentoDaUrl`), e o horário é o próximo livre DELA a partir de
  agora (`proximoHorarioLivre`, A20). A duração é a do procedimento, como em
  todo agendamento. Prova: `e2e/agenda-atritos-da-7.spec.ts` ("A27").
- **O concluído adiantado libera o resto do horário e a sala** (A31 da 5ª
  simulação): o CONCLUÍDO ocupa só até a conclusão (`fimDaOcupacao`,
  `lib/appointments/core.ts`), em `primeiroConflito`/`horarioOcupado` (logo
  no núcleo, na remarcação, nas salas e no aviso do modal) e nos livres de
  `computeAvailableSlots`. A Bianca concluiu às 10:53 o das 12:00, e o das
  12:00 seguia ocupado — foi assim que a Priscila ficou sem a Sala Rosa.
  **E o concluído ANTES de começar não ocupa nada, também na recusa** (D3 da
  11ª simulação, 2026-11-10; princípio 3): marcado às 10:30 e concluído às
  10:14, a grade já o mostrava livre (A16 da 10ª), mas a recusa e o aviso
  diziam "Carla já tem atendimento das 10:30 às 10:14" ao remarcar para as
  10:07. A régua é UMA, pura, `bateNaOcupacao` (`lib/appointments/ocupacao.ts`,
  com `fimDaOcupacao`): a ocupação vazia ou invertida não bate em nada — em
  `conflitosDoHorario` (a recusa, o aviso do modal, a remarcação) e nos livres
  de `computeAvailableSlots`. A mensagem nunca cita intervalo invertido.
  Prova: `e2e/agenda-defeitos-da-11.spec.ts` ("D3"),
  `tests/agenda-concluido-antes-de-comecar.test.ts`.
  **E a GRADE desenha pela mesma régua** (A17 da 14ª simulação, F75): o
  concluído adiantado é desenhado até a conclusão — a Cliente 02 das 19:00,
  concluída às 18:10, seguia desenhada até as 20:00 por cima da Bianca das
  18:45, e no celular o toque caía no cartão errado. `minutosDesenhados` e
  `ladoALado` (`lib/agenda/desenho.ts`, puros) servem às três grades — a da
  unidade (também a do celular), a da rede e a "Minha agenda"; o que ainda se
  cruza NA TELA (a altura mínima do cartão) fica lado a lado, e na grade da
  unidade o concluído que liberou o horário vai para a metade direita, como o
  cancelado (`data-liberou`). Trava: `tests/agenda-desenho-ate-a-ocupacao.test.ts`.
- **O conflito diz a unidade do outro atendimento** (A30): o profissional da
  rede atende em várias, e a recepção de uma não vê a agenda da outra. O
  aviso do modal ("…das 15:00 às 16:00, na unidade Moinhos.") e a recusa
  (`recusaDoConflito`: "…nesse horário, na unidade Moinhos.") dizem onde,
  quando é OUTRA unidade. Prova: `e2e/agenda-conflito-atritos.spec.ts`.
  **E cita TODOS os que bloqueiam** (A28 da 7ª simulação, 2026-11-05;
  princípio 3: citava só um dos dois): "X já tem atendimento das 10:00 às
  10:30 e das 10:30 às 11:00." — `conflitosDoHorario` (`lib/appointments/core.ts`,
  a conta de `primeiroConflito`, do mais cedo ao mais tarde). Prova:
  `e2e/agenda-atritos-da-7.spec.ts` ("A28").
- **"Mostrar cancelados"** (2026-10-21, decisão do Heitor): a agenda da
  unidade deixa o cancelado e a falta fora da grade; o botão do cabeçalho
  (`?cancelados=1`, a consulta do servidor) os traz de volta, apagados, riscados
  e com o motivo (`cancellation_reason`). Não contam em nada (atendimentos,
  ocupação, a contagem do profissional) e não se arrastam; no dia, dividem o
  horário com quem o ocupou depois (o ativo à esquerda). A agenda da rede, que
  sempre os mostrou, apaga o bloco e diz o motivo. Prova:
  `e2e/agenda-cancelados.spec.ts`.
- **O que já foi pago aparece como PAGO** (D12 da 5ª simulação): a janela da
  agenda (unidade e rede) e a Agenda do app da cliente mostram "Pré-pago · 1
  de 2", "Pacote X · sessão 1 de 2" ou "Sessão do plano de tratamento" no
  lugar do valor (`pagosAntes`, `lib/appointments/pago-antes.ts`; na janela,
  "Já pago"). Era "VALOR R$ 140,00", lido como cobrança pendente. Prova:
  `e2e/agenda-pago-antes.spec.ts`. **E o atendimento pago com desconto
  mostra o valor COBRADO** no cartão da Agenda do app (D8 da 7ª simulação,
  2026-11-05; princípio 3): a Toxina da Ana aparecia a R$ 1.200 (o preço do
  agendamento) e Pagamentos dizia R$ 1.100 — o desconto mora no lançamento.
  O cartão diz "R$ 1.100,00 · desconto de R$ 100,00" (`valoresCobrados`,
  `lib/appointments/valor-cobrado.ts`: o lançamento vivo do atendimento,
  `amount + loyalty_discount` — os pontos são forma de pagamento, não
  desconto —, e o `sale_discount`). Prova:
  `e2e/portal-cliente-pagamentos.spec.ts` ("D8").
- **A agendada não está "para agendar"** (A27 da 6ª simulação, 2026-11-04;
  princípio 3): o pré-pago diz "2 para agendar · 1 agendada" na ficha e no
  app, e o cartão do pacote/plano "2 sessões restantes · 1 agendada"
  (`contagemDoPago`, `textoDoParaAgendar`, `textoDasRestantes`,
  `lib/pre-pago/contagem.ts`: a unidade/sessão disponível com agendamento
  ligado é agendada). Era "3 para agendar" até a conclusão. Prova:
  `e2e/pre-pago-agendados.spec.ts`, `tests/pre-pago-contagem.test.ts`.
- **A ficha de tratamento diz o ANDAMENTO** (A22 da 6ª simulação,
  2026-11-04): o plano fechado no checkout aparecia "FECHADO" com 0 de 2
  sessões feitas. O selo da ficha (`[data-situacao-do-tratamento]`) é
  `situacaoDaExecucao` (`lib/plano-de-tratamento/situacao.ts`): "A começar ·
  0 de 2 sessões", "Em andamento · 1 de 2 sessões", "Concluído · 2 de 2
  sessões"; os outros estados são os do plano. "Fechado" segue como o nome
  do estado comercial (J-37) nas listas de planos. Prova:
  `e2e/pre-pago-agendados.spec.ts`, `tests/situacao-da-execucao.test.ts`.
- **A sessão de plano com mais de um procedimento diz todos** (A36 da 6ª
  simulação, 2026-11-04): o agendamento tem UM procedimento, e a sessão
  Botox + Preenchimento aparecia só "Botox" na tela do atendimento e no app;
  o plano se chamava "Botox + 1 mais". O nome é `nomeDosProcedimentos` /
  `nomeDaSessao` (`lib/plano-de-tratamento/nome.ts`: na ordem, sem repetir,
  até três e depois "+ N mais"): o título do atendimento, o cartão do plano na
  ficha, a Agenda e a home do app (`nomesDasSessoesDoPlano`). Prova:
  `e2e/plano-sessao-com-dois-procedimentos.spec.ts`,
  `tests/nome-dos-procedimentos.test.ts`. **E os próximos agendamentos da
  ficha também** (A32 da 7ª simulação, 2026-11-05, sobra da A36: a sessão
  Criolipólise + Drenagem aparecia só "Criolipólise"): as duas páginas da
  ficha leem `nomesDasSessoesDoPlano` (`[data-proximos-agendamentos]`). Prova:
  `e2e/agenda-atritos-da-7.spec.ts` ("A32"). **E a duração prevista é a do
  AGENDAMENTO** (D5 da 7ª simulação, 2026-11-05; princípio 3): a sessão
  Criolipólise + Drenagem gravava 110 min e a tela do atendimento dizia "60
  min", a do procedimento principal. `sessao-de-atendimento.tsx` lê
  `appointments.duration_min`; o procedimento só vale sem ela. Prova: o mesmo
  spec ("D5").
- **A sessão do plano grava o preço e a duração DELA** (D5 da 9ª simulação,
  2026-11-07; princípio 3): as sessões alternavam criolipólise (R$ 585, 60 min)
  e drenagem (R$ 144, 50 min), e a sessão 2 nasceu com R$ 585 e 60 min — o
  modal mandava o preço e a duração do cartão (os do primeiro procedimento do
  plano), e `schedulePlanSession` gravava o que vinha. Agora a sessão é um
  CRÉDITO do núcleo (`credito: { tipo: 'PLANO', id: sessão }`,
  `lib/creditos/credito.ts`): o servidor lê a sessão e decide o procedimento (o
  primeiro dela — outro é recusado), o PREÇO (a soma dos procedimentos dela no
  plano, com o desconto) e a DURAÇÃO (a soma das durações;
  `valoresDaSessaoDoPlano`, a conta do checkout); o agendamento nasce com o
  `treatment_plan_id` (o gatilho dos documentos não emite o do avulso), e a
  sessão se liga por compare-and-swap. Só o plano FECHADO (ACCEPTED) agenda
  sessão — o proposto se agenda no checkout; o cancelado, não. O preço é o
  VENDIDO no plano (o da unidade entrou quando o plano foi montado — D2): o
  plano fechado não muda de preço ao agendar. A grade do modal mede o horário
  com a duração da sessão. Na produção, 1 agendamento ligado a sessão de plano
  estava com o preço e a duração de outra (na [sim] Begônia, já fechado; ficou
  como está — a comissão da sessão lê o preço do plano). Prova:
  `e2e/plano-atritos-da-9.spec.ts` ("D5").
- **O "+ Agendar" da ficha oferece a sessão do plano** (A18 da 9ª simulação;
  "os dois são, em essencia, conjuntos de procedimentos" — decisão 2 do
  Heitor): o "Já pago" do modal (`creditosDoCliente`) lista também a próxima
  sessão livre de cada plano fechado, por procedimento principal ("Drenagem —
  Plano de tratamento · 2 restantes"), e ela vem escolhida quando o
  procedimento bate, como a do pacote (A20 da 8ª): "Já pago: Plano de
  tratamento (sessão 2 de 3)". A grade de horários é a do modal. O avulso já
  marcado não se liga a uma sessão de plano (`agendamento_usar_credito` é do
  pacote e do pré-pago). E o cartão "Tratamento em andamento" diz "Abrir para
  ver e agendar as sessões" (`[data-tratamento-que-abre]`). Prova: o mesmo spec
  ("A18").
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
- **As salas da unidade** (D5, decisão do Heitor, 2026-10-30; migration
  `20261029001401`): Configurações → Unidades → a unidade, cartão "Salas"
  (`components/admin/salas-da-unidade.tsx`, `actions/salas.ts`): criar,
  renomear, desativar e reativar — não se apaga (agendamentos apontam para
  ela). Quem tem `settings: MANAGE`, na unidade ao alcance; o nome é único
  entre as ATIVAS da unidade (`rooms_nome_unico_na_unidade`). A sessão não
  grava sala pelo PostgREST (as políticas de escrita saíram): só o servidor.
  - **O caminho das salas** (A3 da 5ª simulação, 2026-11-02): na clínica de
    UMA unidade, o cartão "Salas" está na própria aba Configurações →
    Unidades (era Ver detalhes → o fim da página); no portal da unidade, na
    aba Unidade. A busca "salas" leva ao cartão (`#salas`,
    `ANCORA_DO_APELIDO` em `lib/busca/paginas.ts`). Com duas ou mais
    unidades, as salas são de cada uma, no "Ver detalhes". Prova:
    `e2e/rede-de-uma-unidade.spec.ts` (A3), `tests/busca-universal.test.ts`.
  - **O procedimento se liga às salas em que é feito** (`procedure_rooms`, no
    cadastro do procedimento, "Salas em que é feito"). Ligação OPCIONAL e por
    UNIDADE: sem sala ligada nesta unidade, qualquer sala ativa dela serve;
    com sala ligada, só as ligadas. A regra é UMA, pura,
    `lib/agenda/salas.ts` (`salasParaOProcedimento`).
  - **O agendar** (agenda dos dois portais e o CRM) oferece só as salas que
    servem, com "(ocupada)" na que tem atendimento no horário, e já escolhe a
    primeira livre (`salasParaAgendar` / `salasParaAgendarNoCrm` →
    `salasDoAgendar`, `lib/appointments/salas.ts`) — **só quando o
    procedimento é LIGADO a salas nesta unidade** (A27 da 5ª simulação: sem
    procedimento, ou com o que serve em qualquer sala, nenhuma vem escolhida;
    vinha a "Sala Rosa — facial" para a avaliação). Com todas as salas do
    procedimento ocupadas, a janela AVISA "…ocupada(s) nesse horário: o
    agendamento vai sem sala" (A28, `[data-aviso-da-sala]`; a sala é opcional,
    H1). Prova: `e2e/agenda-salas.spec.ts` ("A27/A28"). **O que a janela
    mostra é o que grava** (D12 da 7ª simulação, 2026-11-05; princípio 3):
    a sala sugerida chega do servidor DEPOIS de escolher o horário, e quem
    clicava "Agendar" (o card do CRM) ou "Confirmar agendamento" (a agenda)
    antes dela gravava sem sala — e a janela, logo depois, mostrava a
    Corporal escolhida. Enquanto a lista das salas do horário não chega, o
    botão espera ("Conferindo as salas…" no CRM); a falha da lista vira a
    lista da unidade, sem sugestão. Prova:
    `e2e/crm-agendar-liga-oportunidade.spec.ts` ("D12"). **A unidade de UMA
    sala, livre no horário, a traz escolhida** no Agendar (A2 da 10ª, a clínica
    de uma opção só — `unicaOpcao`, `design.md`), e a profissional única
    também; prova: `e2e/agenda-clinica-de-uma-opcao.spec.ts`. **Unidade sem sala: o
    campo nem aparece.** **A sala é opcional** em todo agendamento e
    atendimento (decisão do Heitor, 2026-11-01: "não deve ser obrigatório
    selecionar sala"): o app da cliente, o checkout, as sessões e o Copilot
    agendam sem sala, e nada exige uma. A sala escolhida é que é conferida.
  - **O servidor confere em todo caminho que passa por
    `conferirPecasDoAgendamento`** (com `procedureId`): sala ativa da unidade
    ("Sala não encontrada nesta unidade.") e que serve ao procedimento ("Esta
    sala não é usada para este procedimento."); o conflito ("Esta sala já está
    ocupada nesse horário.") é `horarioOcupado`, no núcleo e na remarcação.
    O checkout do plano, a unidade pré-paga e o Copilot não escolhem sala
    (agendam sem); as sessões de pacote e de plano oferecem (A24, acima).
    **Mas a sala ÚNICA do procedimento vem** (D8 da 12ª simulação, 2026-11-11;
    a regra da única opção, A2 da 10ª — as sessões de laser da Marina ficavam
    sem a Sala do laser, a única em que o laser se faz): o checkout do plano e o
    remarcar do app gravam a sala quando UMA serve ao procedimento (a ligada a
    ele na unidade, ou a única da unidade) e ela está livre no horário
    (`salaUnicaDoHorario`, `lib/appointments/salas.ts`). Ocupada, a sessão vai
    sem sala e o checkout diz "A Sala do laser está ocupada em 14/11 às 14:00:
    essa sessão vai sem sala." (`avisoDaSala`, um aviso na tela). No remarcar do
    app, a sala que o agendamento tinha fica se segue livre no horário novo;
    ocupada, vale a única livre, senão sem sala (a cliente não escolhe sala).
    Prova: `e2e/plano-defeitos-da-12.spec.ts` ("D8"). Prova: `e2e/agenda-salas.spec.ts`,
    `tests/agenda-salas.test.ts`.
- `cancellationReason`: obrigatório ao cancelar para rastreabilidade
- Ao marcar `COMPLETED`: consumo de estoque + comissão, numa transação — ver §10. Os pontos de fidelidade NÃO nascem aqui: nascem no pagamento (§9.2.2).

**Decididas no levantamento das regras** (o Heitor, 2026-11-11, pela página
de decisões) — **implementadas na F65 (2026-11-12)**:
- **Quem faz o quê na agenda (D20; princípio 3: a tela de Cargos já diz
  isso).** A Agenda em Ver inicia e conclui, dentro do escopo. A Agenda em
  Gerenciar confirma, marca a chegada, cancela, marca a falta, remarca e
  troca a profissional. Com "só os meus" e Gerenciar, cancela e marca a falta
  só dos próprios. A tabela está na `SCOPE_NOTE` de
  `lib/permissions-copy.ts`. `updateAppointmentStatusInterno` pede Gerenciar
  para Confirmado, Chegou, Cancelado e Falta (C10); o Cancelado passa pelo
  `cancelarCore` (motivo, aviso, histórico — C12), a Falta só sai de
  Agendado/Confirmado/Chegou e nunca vira Cancelado, e o "Em atendimento"
  passa pelo início de verdade (`startAppointment`). A janela só mostra o
  que o cargo faz. Prova: `e2e/agenda-guardas-de-status.spec.ts`,
  `e2e/permissoes-acoes.spec.ts` ("agenda: cancelar agendamento" pede
  Gerenciar).
  **Com "só os meus" e Gerenciar, a janela mostra o "Remarcar" do PRÓPRIO**
  (F75): a action (`remarcarCore`) já remarcava o próprio; a janela escondia
  o botão (`ehMeu` passou a mostrá-lo). ⚠️ É a leitura da F75 (a tarefa da
  frente), não uma resposta escrita do Heitor: a F65 levou a ele a pergunta
  "só os meus" + Gerenciar remarcando o próprio, e ela segue aberta para
  confirmar. Prova: `e2e/agenda-f75-remarcar-o-proprio.spec.ts`.
- **Quem inicia e conclui o atendimento de outra profissional é o ESCOPO
  (D21; os três eixos, CLAUDE.md §11),** na tela e no servidor: com "só os
  meus", só o próprio; com "todos", qualquer um da unidade ao alcance (C14).
  Prova: `e2e/atendimento-quem-inicia-e-conclui.spec.ts`.
- **O "Iniciar" não reabre o que acabou** (C11): só sai de Confirmado ou
  Chegou (a gravação confere a situação); o gatilho do banco recusa sair de
  Concluído ("Atendimento concluído não muda de situação…", migration
  `20261112006501`). Os pontos não duplicam: nascem no pagamento, e o
  "Concluído" da agenda (`completeAppointment`) não conclui mais nada (§10).
  **O remarcar recusa o que está em atendimento** (C15, `remarcarCore`), e
  as anotações de rascunho recusam o cancelado e a falta.
- **A remarcação e a confirmação (H3, opção c; princípio 3: "Confirmado" é
  "a cliente disse que vem nesse horário").** A cliente que remarca pelo app
  escolheu o horário novo: ele já nasce Confirmado, sem pedir a confirmação
  de novo. Quando a equipe ou o Copilot remarcam, ninguém ouviu a cliente: o
  horário volta a Agendado (sem `confirmed_at` nem `arrived_at`) e a
  confirmação é pedida de novo (C8). Prova:
  `e2e/portal-cliente-remarcar-pelo-nucleo.spec.ts`.
- **Quem só agenda cria a ficha, mas não mexe na que existe (H4, opção b;
  princípio 3: a mesma ação não muda conforme a porta).** O "+ Agendar" com
  nome e telefone, e o agendar pelo CRM, criam a ficha rápida sem pedir
  Clientes em Gerenciar — agendar a cliente nova é o trabalho da recepção.
  "Unificar com a ficha de X" e "Reativar a ficha de X" pedem Clientes em
  Gerenciar, na tela e na action (`garantirClienteRapido` recusa o
  "atualizar:<id>"); sem ele, a pergunta (`PerguntaJaExiste`,
  `podeUnificar`) oferece "Agendar para a ficha de X" (a resposta
  "usar:<id>": a ficha como está, nada se grava nela; a arquivada não) ou
  "Cadastrar mesmo assim". O cartão do Copilot, igual (C66). Prova:
  `e2e/agenda-ja-existe-sem-clientes.spec.ts`.
- **O agendamento só nasce com quem ATENDE na unidade** (F65): o
  `conferirPecasDoAgendamento` recusa a profissional sem a unidade no
  "Atende clientes em" ("X não atende nesta unidade (o “Atende clientes em”
  dela, na Equipe)") — o encaixe fora do HORÁRIO continua permitido (é
  aviso). E só com o procedimento que a unidade FAZ (D7 da 13ª, §9.3).
  Prova: `e2e/agenda-procedimento-e-quem-atende-na-unidade.spec.ts`.
- **O remarcar do app passa pelo núcleo e pergunta a unidade** (C8, A15 da
  13ª; H5: a cliente é da clínica). `remarcarPelaCliente` confere as peças
  (`conferirPecasDoAgendamento`: a ficha arquivada não remarca), reprecifica
  quando a unidade muda e escreve no histórico o remarcado, a troca de
  unidade e, no "Sem preferência" que troca a profissional, de quem para
  quem. Com mais de uma unidade que faz o procedimento, a tela pergunta "Em
  qual unidade?"; noutra unidade, a mesma profissional só se atende lá (senão
  o horário fica com quem estiver livre, e a tela diz). O que a cliente faz
  pelo app entra no histórico como "Fulana (app)" (`changed_by_id` aceita
  nulo, migration `20261112006502`). Prova:
  `e2e/portal-cliente-remarcar-pelo-nucleo.spec.ts`.
- **A foto clínica no atendimento da outra unidade em que ela atende entra**
  (D5 da 13ª): a unidade do anexo é a do ATENDIMENTO, lida pelo servidor
  depois da rede e do alcance — a leitura pela sessão com `.single()`
  derrubava a tela com 500. Pela ficha, a unidade do contexto vence a do
  formulário (`ctx.branchId ?? branchId`), como no cadastro e no crédito
  (`resolveBranch`). Prova: `e2e/atendimento-foto-de-outra-unidade.spec.ts`.
- **No celular, o cartão da outra unidade não esconde o nome da cliente** (A8
  da 13ª): na "Minha agenda", o selo "Na unidade X" vai para a linha do
  procedimento e encolhe com reticências (o nome inteiro na dica); o nome da
  cliente cede por último. Prova:
  `e2e/agenda-cartao-de-outra-unidade-no-celular.spec.ts`.

---

### 9.3 Procedimentos
- `branchId: null` = catálogo base da rede (criado pelo NETWORK_ADMIN)
- **A tela diz de quem é o catálogo** (A35 da 8ª simulação, 2026-11-06; a regra
  — o catálogo é da rede — não mudou): no portal da unidade, "O catálogo de
  procedimentos é da clínica toda: quem cria e muda é quem administra a rede…
  Aqui ele é consulta." (`[data-catalogo-da-rede]`, pela fala da clínica de uma
  unidade); na rede, quem só vê lê "Seu cargo só consulta o catálogo"
  (`[data-catalogo-so-consulta]`). E o formulário do procedimento só existe
  com a janela ABERTA (A4: montado escondido em cada linha, eram N+1
  formulários no DOM, `name=price` repetido; o "Novo procedimento" do vazio
  aparecia a quem só vê). Prova: `e2e/procedimentos-atritos-da-8.spec.ts`.
  **Quem pode editar é levado ao catálogo da clínica** (A20 da 9ª simulação,
  2026-11-07: a dona da clínica de uma unidade lia "aqui ele é consulta" e não
  sabia que se edita no `/admin`): com Procedimentos em Gerenciar e a clínica
  toda (`ctx.branchId === null`, o mesmo do "Novo procedimento"), a frase ganha
  "Editar no catálogo da clínica →" (`/admin/procedures`); a gerente de unidade
  fixa segue só lendo (H7). Prova: o mesmo spec ("A20 da 9ª").
- `visibleOnClientApp`: controla se o procedimento aparece para o cliente agendar pelo app
- **O procedimento que a unidade NÃO faz sai de toda lista e o núcleo o
  recusa** (D7 da 13ª, F65). "Em quais unidades" do cadastro
  (`procedure_branch_availability`; sem nenhuma marcada, todas) vale na agenda
  (`getCachedBranchProcedures`), no app da cliente, no Vender
  (`procedimentosAVenda`, `venderProcedimento`), no editor do plano com a
  unidade e no Copilot; `conferirPecasDoAgendamento` (com o procedimento) e o
  agendar do app recusam: "X não é feito na unidade Y. Escolha outra unidade
  ou outro procedimento." A regra é UMA, `ofereceNaUnidade` /
  `recusaDoProcedimentoNaUnidade` (`lib/procedimentos/disponivel-na-unidade.ts`).
  Prova: `e2e/agenda-procedimento-e-quem-atende-na-unidade.spec.ts`.
  **O plano: o catálogo é o da unidade DO PLANO** (D4 da 14ª, F73): o plano
  da Pampulha aberto pela rede oferecia o Laser que só a Savassi faz, e o
  servidor gravava. `procedimentosParaPlano` sempre com a unidade: a do plano
  aberto (`getPlanoParaEditar` traz o `catalogo` dele; a tela do plano lê
  `getCabecalhoDoPlano().unidadeId`), a do atendimento (a sessão de
  atendimento) e, no plano NOVO, a unidade em que ele nasce (a filial da
  ficha). O que já estava no plano e a unidade não faz continua à vista
  ("X (não é feito nesta unidade)"). E o servidor recusa:
  `recusaDosProcedimentosDoPlano`, em `gravarSessoes` (antes de apagar as
  sessões antigas) e antes do `gerar_plano_da_avaliacao`. Prova:
  `e2e/plano-unidade-do-plano-f73.spec.ts`, `tests/catalogo-do-plano.test.ts`.
- **O preço vazio é R$ 0,00 — o procedimento gratuito** (A1 da 6ª simulação,
  2026-11-04; princípios 2 e 4): a avaliação grátis tinha só o "0,00" de
  exemplo, e o navegador recusava o campo vazio. O campo não é mais
  obrigatório; vazio ou zero, a tela diz "o procedimento fica gratuito — o
  atendimento não tem o que cobrar" (`[data-preco-gratuito]`), e o servidor
  grava 0 (`dinheiroDoFormulario`; negativo e ilegível seguem recusados).
  Prova: `e2e/procedimento-preco-em-reais.spec.ts` ("A1").
- **O preço DA UNIDADE vale em todo caminho de preço** (D2 da 9ª simulação,
  2026-11-07; decidido pelo princípio 3): o cadastro grava o preço próprio de
  cada unidade em `procedure_branch_pricing` ("1 unidade com preço próprio"), e
  nada o lia — na Menino Deus a criolipólise de R$ 590 era listada, agendada,
  cobrada e comissionada a R$ 650. A regra é UMA, `precoNaUnidade` /
  `precosDaUnidade` / `comPrecoDaUnidade` (`lib/procedimentos/preco-na-unidade.ts`;
  no banco, `private.preco_na_unidade`, migration `20261107004001`): o da
  unidade quando ela tem um, senão o da rede. Lê por ela o agendar
  (`createAppointmentCore` — logo a agenda, o app, o Copilot e o CRM — e as
  listas `getCachedBranchProcedures`, o app da cliente, o Copilot), o Vender
  (o pré-pago, na action e em `procedimento_vender*`; o rateio do pacote,
  `itensParaRateio`, e o pacote equivalente do checkout, `catalogoDePacotes`
  com a unidade), o editor do plano (`procedimentosParaPlano` com a unidade
  do plano, em todo portal — D4 da 14ª; o preço do plano segue editável) e o catálogo da
  unidade. A comissão sai do preço GRAVADO no agendamento/venda, então segue
  sozinha. A lista de procedimentos da rede diz embaixo do preço "R$ 590,00
  na Menino Deus" (`[data-preco-da-unidade]`). Sem unidade (a oportunidade, a
  recompensa da fidelidade), vale o da rede. O editor do plano tem sempre a
  unidade (D4 da 14ª, F73): o plano novo da ficha da rede nasce na filial da
  ficha, e o catálogo e o preço são os dela. Prova: `e2e/procedimento-preco-da-unidade.spec.ts`,
  `tests/preco-na-unidade.test.ts`.
- `ProcedurePriceHistory`: criada automaticamente ao alterar `price` de um
  procedimento. **É o histórico do preço DA REDE** (C15, F65; princípio 7): o
  preço próprio de cada unidade (`procedure_branch_pricing`) não entra nele.
  Nenhuma tela mostra o histórico hoje; quando uma mostrar, ela diz que é o
  preço da rede.
- `ProcedureProduct`: insumos consumidos por execução — base do consumo automático de estoque
  - **O catálogo diz o procedimento sem insumo ligado** (A6 da 10ª simulação,
    2026-11-10; princípio 3: o criado antes do estoque ficava sem insumo, e a
    baixa automática nunca acontecia, calada): com insumo no estoque, o topo
    da lista diz "N procedimentos ativos sem insumo ligado: a baixa automática
    do estoque não acontece neles…" (`[data-sem-insumo-ligado]`) e a linha tem
    o selo "Sem insumo ligado" (`[data-chip-sem-insumo]`). Só aviso: o que não
    usa insumo (a avaliação) fica como está. Prova:
    `e2e/configuracoes-atritos-da-10.spec.ts` ("A6").
- **A calculadora do procedimento diz que o custo é o ÚLTIMO** (A13 da 11ª,
  2026-11-10; princípio 3: R$ 7,95/U era o último custo, e o lote que sai
  primeiro custava R$ 7,80): embaixo dos insumos, "O custo de cada insumo é o
  último custo de compra… No atendimento, a baixa sai ao custo do lote que é
  usado…" (`[data-custo-do-insumo-e-o-ultimo]`). A regra (a margem do catálogo
  pelo custo atual, F49 D2) não mudou. E a embalagem tem **"seringa"** (A12: o
  ácido hialurônico virou "un", com "(seringa)" no nome; `MEDIDAS_DO_PRODUTO`).
  Prova: `e2e/configuracoes-atritos-da-11.spec.ts`, `tests/estoque-medidas.test.ts`.
  **Sem custo, sem margem** (A9 da 12ª simulação, 2026-11-11; princípio 4: a
  calculadora mostrava "Margem de lucro 100%" com custo R$ 0,00): com o custo
  total zero, o campo da margem fica vazio e diz "Sem custo cadastrado: a
  margem não se calcula…" (`[data-margem-sem-custo]`). Prova:
  `e2e/configuracoes-atritos-da-12.spec.ts` ("A9").
- **No Novo produto, cada rótulo é ligado ao campo** (A8 da 10ª: soltos e
  centralizados — `design.md`, "Formulários"; o `Label` do
  `stock-product-modal.tsx` recebe o `htmlFor`). Prova: o mesmo spec ("A8").
- **"Quem realiza"** (por-01, revisão do Heitor de 2026-11-02: "já deveria ter
  um cadastro das profissionais que podem realizar o procedimento. Isso já
  deve estar na hora da criação de um procedimento e disponível também na
  edição"; migration `20261101000601`, `procedure_professionals`). O
  cadastro do procedimento marca quem o faz, entre quem atende na rede. **Sem
  ninguém marcado, todas as que atendem realizam** (o de antes). A regra é UMA,
  `realiza` (`lib/procedimentos/quem-realiza.ts`), usada por:
  - o app da cliente: o passo "Profissional" e o "Sem preferência"
    (`candidatasDoDia` com o procedimento) oferecem só quem realiza, e
    `createClientAppointment` recusa as outras ("Esta profissional não
    realiza este procedimento.");
  - a agenda da clínica: o modal AVISA ("X não está em “Quem realiza” deste
    procedimento"), sem barrar — o encaixe é da clínica;
  - o repasse ao desativar (`lib/equipe/repasse.ts`): a lista e a action.
  Só o servidor grava a ligação (`actions/procedures.ts`, quem atende, ativa
  e da rede); a sessão lê a da própria rede. Prova:
  `e2e/procedimento-quem-realiza.spec.ts`.
- **Categorias da rede** (`procedure_categories`, 2026-10-14; Procedimentos →
  Categorias): eram quinze fixas no código. `procedures.category` continua
  TEXTO (relatórios agrupam pelo nome); a tabela é o vocabulário — cresce
  sozinho por gatilho em `procedures`, sem caixa, e a rede nova nasce com as
  dezesseis (`private.categorias_de_procedimento_padrao`; "Avaliação" entrou em
  2026-11-02, A10 da 5ª simulação — migration `20261101000801`, só para a rede nova). Renomear troca em todos
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
    copiar ou `wa.me` — "Abrir no WhatsApp do aparelho", que diz abrir o
    WhatsApp de quem está no computador ou celular, e não um ligado à clínica
    (`[data-whatsapp-do-aparelho]`; A31 da 7ª simulação: numa rede sem
    WhatsApp ligado, o botão parecia o da clínica — a regra do wa.me ficou) —,
    com `agenda: MANAGE`), que mostra só o ESTADO
    (pendente/respondida) — as respostas são do prontuário. Cliente sem CPF
    nem nascimento: a janela diz "Complete o CPF ou a data de nascimento para
    enviar o link" e leva ao cadastro (`?aba=dados`, via `lib/rotas`). **E
    pede o nascimento ali mesmo** (A12 da 10ª simulação, 2026-11-10: a cliente
    do Agendar, só com nome e telefone, ficava sem a ficha): quem tem as
    Clientes E a Agenda em Gerenciar preenche "Data de nascimento" → "Salvar o
    nascimento" (`completarNascimentoDaCliente`, `actions/pre-atendimento.ts`:
    o agendamento ao alcance, só preenche o VAZIO, nunca o futuro), e o "Enviar
    a ficha" aparece. Prova: `e2e/atendimento-uso-da-10.spec.ts` ("A12"). "Ficha já
    respondida" mostra o telefone/WhatsApp da UNIDADE para corrigir algo.
    **A ficha que a EQUIPE preencheu se CONFERE pelo link** (A52 da 7ª
    simulação, 2026-11-05: a equipe respondeu na clínica, e o link mandado
    dizia "Ficha já respondida" — a cliente não conferia nem completava): com
    o pré-atendimento RESPONDIDO pela equipe (`origem = EQUIPE`) e o link ainda
    valendo (não usado, revogado nem vencido), a página diz "X já preencheu a
    sua ficha de pré-atendimento. Confira as respostas.", pede a identidade de
    sempre e mostra as respostas (o modo CONFERIR: "Está tudo certo" ou
    "Corrigir respostas"); a obrigatória que a equipe deixou em branco a
    cliente completa (`oQueFaltaNaFicha` vale). Gravado pelo núcleo
    (`gravarAnamneseGeral`, origem CLIENTE_LINK); o pré-atendimento do link
    passa a ser da cliente, e o link morre. A que a própria cliente respondeu
    segue "já respondida". A espiada diz `conferir: true` com o estado `usado`
    (migration `20261105002902`: a função serviu ao código de antes até o
    push). Prova: `e2e/ficha-pre-atendimento.spec.ts` ("A52").
    **Antes do CPF, a página não diz nada da ficha** (A50 da 9ª simulação,
    2026-11-07: os dois times viram "A clínica já preencheu a sua ficha…"
    antes da identidade): o título é sempre "X mandou a sua ficha de
    pré-atendimento."; o "Confira as respostas que a equipe preencheu" vem
    depois do CPF (o modo CONFERIR). Prova: o mesmo spec ("A52").
    **O link que ainda vale se mostra de novo** (A22 da 9ª simulação: ele
    aparecia uma vez, e quem o perdia gerava outro — que cancela o anterior):
    o token é guardado CIFRADO pelo cofre das integrações
    (`pre_atendimento_links.token_cifrado`, `cifrarSegredos`, a chave
    `CREDENCIAIS_CHAVE` fora do banco; migration `20261107004303`), ao lado
    do hash que confere quem abre. Com o link valendo, a janela do agendamento
    tem "Mostrar o link de novo" (`linkDaFichaDeNovo`: Agenda em Gerenciar, o
    agendamento ao alcance, sem o suporte) — o MESMO link, com a mensagem e o
    wa.me; "Gerar outro" continua cancelando o anterior. Os links de antes
    (sem o token guardado) não se mostram de novo. Prova:
    `e2e/ficha-pre-atendimento-envio-manual.spec.ts` ("A22 da 9ª").
    **"Enviar a ficha" está SEMPRE na janela** (A49 da 6ª simulação,
    2026-11-04; princípio 1): sem pendente — o envio automático da rede
    desligado, que é o padrão (princípio 6), ou a ficha respondida há pouco —,
    a janela diz "A ficha de saúde não foi enviada para este agendamento." e
    o botão (e o "Mandar pela conversa") abre o pendente na hora, para ESTE
    agendamento (`pre_atendimento_abrir_manual`, só o servidor; o modo do
    gatilho, sem a janela de 30 dias — aqui é a clínica que pediu), e gera o
    link. O padrão da rede não muda; quem só vê a agenda não vê o bloco nem
    abre nada; o suporte não manda (`bloqueioDoSuporte`). Prova:
    `e2e/ficha-pre-atendimento-envio-manual.spec.ts`. Erro
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
  - **A alergia é Sim/Não, e nada interpreta texto** (atend-15, revisão do
    Heitor de 2026-11-02: "vamos precisar de uma avaliação de uma IA para
    entender o que foi escrito e isso não está no escopo; alergia: opção de
    sim ou não; se sim, campo texto livre para detalhamento e alerta";
    migration `20261101001001`). A ficha padrão pergunta "Tem alguma
    alergia?" (Sim/Não, obrigatória) e, só no "Sim", "Quais alergias?"
    (`allergiesDetalhe`, obrigatória quando aparece). O alerta
    (`alergiasDaAnamnese`): "Sim" avisa com o detalhe (ou "Sim (sem
    detalhe)"), "Não" não avisa, e a resposta em TEXTO (a ficha de antes, ou
    uma pergunta aberta que a clínica montou) avisa como está escrita. Era a
    leitura da frase ("não tenho alergia a dipirona" virava alerta). As
    fichas das redes foram trocadas (a igual à semente, inteira; a editada,
    só a pergunta `allergies` e a gestação sem "Não se aplica" — a [sim]
    Aurora); as respostas guardadas não mudam. Prova:
    `e2e/atendimento-alergia-sim-nao.spec.ts`, `tests/alergia-negativa.test.ts`.
  - **O campo que só aparece com uma resposta** (`mostrarSe: { campo,
    valor }`, `campoVisivel` em `lib/anamnesis.ts`): o construtor de fichas
    o oferece em "Mostrar só quando (opcional)", e vale nas DUAS fichas (a de
    saúde e a do procedimento). Escondido, a obrigatória não barra
    (`primeiraObrigatoriaVazia`, `oQueFaltaNaFicha` — a tela e o servidor) e
    a resposta não se grava (`respostasDaFicha`); a condição que aponta para
    um campo que saiu da ficha não esconde nada. Prova:
    `tests/campo-condicional.test.ts`.
  - **A faixa da alergia acompanha a TELA do atendimento** (A34 da 5ª
    simulação): com a anamnese mexida, a faixa sai das respostas digitadas
    (`anamneseNaTela`), não da salva — o "Sim" da Tatiane só virava faixa
    depois de concluir. O rascunho (§10) já guardava a anamnese digitada:
    recarregar mantém as respostas e a faixa. Prova: o mesmo spec.
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
  perguntas e, dentro da validade, as próprias respostas de antes — e, pelo
  link, as que a equipe preencheu para ela (A52) —, nada de evolução, foto ou
  anotação da equipe.
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
  evolução nunca ia à tela. Cada entrada diz o dia do ATENDIMENTO (a hora marcada, em
  Brasília — `diaDoAtendimento`), o mesmo da aba Documentos; era o da gravação, e
  o das 23:30 concluído à meia-noite aparecia no dia seguinte (J-56). Prova: `e2e/prontuario-evolucao.spec.ts`,
  `tests/prontuario-registros.test.ts`.
  **O atendimento CONCLUÍDO entra mesmo sem registro** (A19 da 6ª simulação,
  2026-11-04): concluído sem evolução, a aba dizia "Nenhum atendimento
  registrado ainda" e a cliente parecia nunca ter sido atendida. Ele entra
  (`buildRecordForms` com os concluídos), e o cartão diz "Sem evolução
  registrada.". Prova: o mesmo spec ("A19").
- **O prontuário diz o LOTE aplicado e as fotos do atendimento** (A33 e A34 da
  11ª simulação, 2026-11-10; princípio 3): cada atendimento da aba Prontuário
  lista o que a baixa tirou de cada lote — "Toxina — lote TOX-A1 (vence
  26/11/2026): 30 U" (`[data-lotes-do-atendimento]`, `lotesDosAtendimentos`,
  `lib/prontuario/lotes-dos-atendimentos.ts`: a ligação `stock_movement_batches`
  do `PROCEDURE_USAGE`, a mesma do "Saiu do lote" do atendimento) — e, a quem
  abre o Estoque e as Clientes, "Ver em quem o lote foi aplicado →", que leva
  ao Estoque com `?lote=<id>` e abre ali o "Aplicado em" do lote
  (`loteDaUrl`, `BotaoAplicadoEm abrirAoMontar`): num caso de reação adversa, é
  por aqui que se começa. E o campo de foto da ficha que ficou vazio, com fotos
  anexadas pelo cartão "Fotos do atendimento", diz "2 fotos deste atendimento em
  Documentos → Foto clínica" (`[data-fotos-do-atendimento]`) — dizia "Não
  informado". Prova: `e2e/prontuario-atritos-da-11.spec.ts`.
- **O recorte se diz** (A35 da 11ª): com o prontuário "só os meus", a ficha de
  quem ela não atende dizia "Nenhum termo ou contrato" e "Nenhum documento
  anexado" — eles existem. Os Termos dizem "não aparecem para você: com o
  prontuário “só os meus”…" (`[data-termos-recortados]`), e a aba Documentos
  "Há 2 anexos clínicos desta cliente (fotos, exames, laudos) que o seu cargo
  não abre…" (`[data-anexos-clinicos-fora]`) — só o número, nada do conteúdo.
  A regra de quem vê não mudou.
- **O modelo de perguntas de injetáveis** (A30 da 11ª: a ficha de
  pré-atendimento padrão não perguntava doença neuromuscular, toxina anterior,
  anticoagulante, herpes): no "Editar perguntas" da ficha de pré-atendimento,
  "Acrescentar as perguntas de injetáveis" põe no fim o bloco do modelo
  (`PERGUNTAS_DE_INJETAVEIS`, `lib/pre-atendimento/modelo-de-injetaveis.ts`;
  ids `inj_…`, sem duplicar) para a clínica revisar e salvar. Nada entra
  sozinho (princípio 6): a ficha padrão da rede nova não mudou. Prova: o mesmo
  spec ("A30"), `tests/pre-atendimento-modelo-de-injetaveis.test.ts`.
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
    não o recebe no pacote LGPD (expõe nomes da equipe). O texto da seção diz
    a regra de verdade — "quem tem o Prontuário em Gerenciar, sem unidade
    fixa" (A43 da 5ª simulação, 2026-11-01: dizia "só a administração da
    rede", e o médico da rede, com o prontuário em Gerenciar, via a lista).
    A regra ficou, e o Heitor a confirmou no levantamento das regras (H13,
    2026-11-11, opção a: pelo princípio 1 a clínica decide pelo cargo quem tem
    o Prontuário em Gerenciar, e pela H7 o controle da clínica toda é de quem é
    da rede; a gerente de unidade fixa não vê o bloco). O escopo não muda a regra,
    e o texto diz isso desde a A35 da 6ª simulação (2026-11-04): "… sem
    unidade fixa — também com o escopo “só os meus”" (o Igor, médico da rede
    com o prontuário "só os meus", via a lista e o texto parecia excluí-lo).
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
  O cartão mostra o TÍTULO dado à foto (o nome do arquivo fica na dica — J-41),
  e anexar grava no histórico do atendimento a linha `FOTO_CLINICA`, "Foto
  clínica anexada" — texto FIXO, sem o título: o histórico aparece a quem tem
  só a agenda, e o título pode dizer o que a foto mostra (J-36). **Apagar a
  foto do atendimento também deixa rastro** (atend-02, revisão do Heitor de
  2026-11-02): `FOTO_CLINICA_APAGADA`, "Foto clínica apagada por <nome>"
  (o nome do ctx, com a marca "via suporte"), no mesmo `deleteClientDocument`
  que marca `apagado_em`. **A miniatura abre a foto grande** e o cartão tem
  "Enviar à cliente" / "Tirar do app" (A37 da 5ª simulação: clicar não fazia
  nada, e o envio só existia na aba Documentos) — o mesmo
  `enviarDocumentoACliente`, para quem anexa (`canEditRecords`; a action
  confere `recusaDoAnexo`), com "Só a equipe vê" / "No app da cliente".
  Prova: `e2e/atendimento-foto-clinica.spec.ts`.
  **O cartão vazio diz onde a foto fica** (A26 da 9ª simulação, 2026-11-07;
  princípio 3): dizia "Ela fica no prontuário da cliente", e a foto vai para a
  ficha, aba Documentos, categoria Foto clínica — a regra fica. Agora "Ela
  fica na ficha da cliente, em Documentos → Foto clínica, ligada a este
  atendimento." Prova: `e2e/atendimento-atritos-da-9.spec.ts` ("A26").
  **A foto diz o momento** (A13 da 10ª, 2026-11-10: as duas saíam "Foto
  clínica — 10/11/2026"): o anexar da foto do atendimento pergunta "Momento
  da foto" — Antes, Durante, Depois (a primeira nasce "antes", a seguinte
  "depois") — e o nome sugerido o diz ("Foto clínica (antes) — 10/11/2026");
  o nome segue editável, e nada novo se grava além dele (`UploadForm
  momentos`). Prova: `e2e/atendimento-uso-da-10.spec.ts` ("A13").
- **No app da cliente aparece só o arquivo que a clínica ENVIA** (decisão do
  Heitor, 2026-10-30; migration `20261029001201`). Anexar (pela ficha ou pela
  foto do atendimento) não manda nada à cliente: o arquivo nasce "Só a equipe
  vê". Na aba Documentos da ficha, "Enviar à cliente"
  (`enviarDocumentoACliente`, `actions/client-documents.ts`) grava
  `client_documents.enviado_em`/`enviado_por`/`enviado_por_nome` e avisa a
  cliente com texto GENÉRICO ("A clínica enviou um documento para você" — o
  nome do arquivo pode dizer o procedimento); "Tirar do app" desfaz. Pode
  quem pode mexer no anexo (`recusaDoAnexo`: o clínico pede o prontuário,
  com o "só os meus"), com a unidade ao alcance; o suporte não envia
  (`bloqueioDoSuporte`). O Histórico do portal filtra `enviado_em` não nulo.
  O termo e o contrato que ela ASSINOU (`issued_documents`) continuam no
  portal como sempre; dos anexos de antes, só o termo/contrato anexado nasceu
  enviado (0 na produção), e as 2 fotos clínicas que existiam ficaram ocultas.
  O direito de acesso continua pelo pacote LGPD, que leva tudo. Prova:
  `e2e/portal-cliente-documento-enviado.spec.ts`.
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
  **UMA aplicação por mapa por atendimento** (D14 da 9ª simulação,
  2026-11-07): cada clique em "Registrar aplicação" gravava outra — a Marina
  ficou com duas iguais de 56 UI, e o "Finalizar" somava as duas na conta com
  a baixa. Registrada, o botão diz "Atualizar a aplicação registrada" (e a
  linha "Aplicação registrada neste atendimento às HH:MM",
  `[data-aplicacao-registrada]`), e o servidor grava por
  `injetavel_registrar_aplicacao` (migration `20261107004201`, só o servidor):
  o mapa TRAVADO, e a aplicação deste mapa neste atendimento é ATUALIZADA (os
  pontos, os totais, quem e a hora) em vez de nascer outra — com o atendimento
  ainda aberto; encerrado, a registrada fica ("Este atendimento já foi
  encerrado…"). O evento `injetavel.aplicado` sai só na primeira. O par
  duplicado de antes (dado de [sim]) ficou. Prova: `e2e/injetaveis-da-9.spec.ts`
  ("D14", também dois envios ao mesmo tempo).
  **O mapa se abre e se cria da própria sessão** (A10 da 9ª): era preciso ir
  ao menu Injetáveis, criar, ligar a cliente e voltar. A tela do atendimento
  tem "Mapa de injetáveis" ao lado do "Planejamento" (quem vê o clínico, no
  plano com o recurso), que abre a mesma janela direto nos injetáveis
  (`PainelPlanejamento abaInicial`), com "Novo planejamento" já ligado à
  cliente. Prova: o mesmo spec ("A10").
  **`/injetaveis` sem o prontuário é a tela de sem acesso com 200** (D17 da
  9ª): a trava do LAYOUT (`ListaDeInjetaveis`) lançava fora do Suspense do
  `loading.tsx` e o portal respondia 500. O layout, sem o módulo ou o recurso,
  só passa a página — que trava por si, como toda `page.tsx`. Prova: o mesmo
  spec ("D17").
- **O mapa no celular** (A27 e A28 da 11ª simulação, 2026-11-10): o zoom fica
  na MESMA linha das escolhas Rosto/Corpo e Feminino/Masculino (era um bloco
  solto no canto, que a 360 px cobria o "Masculino"; `[data-zoom-do-mapa]`), e a
  dica fala de toque ("Toque (ou clique) para marcar. Aproxime com + e −…",
  `[data-dica-do-mapa]`). O "marcar um ponto rola a folha" NÃO se reproduziu
  (toque de verdade a 360 e 412 px, na tela de Injetáveis e na folha do
  atendimento: a ilustração fica onde estava, e o segundo toque marca) — a
  prova continua no spec. Na folha do atendimento, uma linha diz o que cada
  botão faz (`[data-o-que-cada-botao-faz]`): "Salvar planejamento" guarda os
  pontos e as doses previstas; "Confirmar aplicação" copia a prevista para a
  aplicada, na tela; "Registrar aplicação" grava neste atendimento (depois,
  "Atualizar a aplicação registrada"). **A linha do procedimento no editor do
  plano quebra** (A29: no celular só aparecia o "R$"): `flex-wrap` e o select
  que encolhe; não se reproduziu no Chromium a 360 px, e o spec guarda o valor
  dentro da tela. Prova: `e2e/injetaveis-atritos-da-11.spec.ts`,
  `e2e/atendimento-atritos-da-11.spec.ts` ("A29").
- **O campo "Planejador de injetáveis" da ficha abre o planejamento DA
  CLIENTE** (pedido do Heitor, 2026-10-29). Era um mapa SOLTO, só na resposta
  da ficha. No atendimento, o campo (`CampoDoPlanejador`,
  `anamnesis-form-renderer.tsx`, com `injetaveis={{ clientId, branchId }}`) é
  o MESMO `PlanejamentoInjetaveis` de Planejamento → Injetáveis: lista os
  planejamentos dela para abrir, cria um novo (nasce ligado a ela) e abre o
  planejador com o "Registrar aplicação". Não há segundo planejador.
  - **As "opções" do campo são os PRODUTOS do mapa** (A4 da 7ª simulação,
    2026-11-05: a Rita e a Tânia liam "Opções" e "precisa de ao menos uma
    opção" sem saber o quê): o construtor de fichas diz "Produtos do mapa",
    para que servem e "Adicionar produto", e a recusa é "O planejador X
    precisa de ao menos um produto do mapa" (`textoDasOpcoes`,
    `faltaDeOpcoes`, `lib/anamnesis.ts`, na tela e no servidor). Prova:
    `tests/planejador-opcoes-sao-produtos.test.ts`.
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
    aceita o planejamento escolhido, mesmo sem ponto — **mas o planejamento
    sem nenhum ponto PERGUNTA** (atend-12, revisão do Heitor de 2026-11-02:
    "se o planejamento escolhido não tiver nenhum ponto, avisar e confirmar se
    deseja continuar"): o "Finalizar" e o gerar plano recusam com "O
    planejamento "X" não tem nenhum ponto. Continuar?"
    (`perguntaDoPlanejamentoVazio`, sobre o RETRATO lido no servidor) e só
    seguem com a confirmação explícita (`confirmar_planejamento_vazio` no
    formulário da conclusão; `{ confirmarPlanejamentoVazio: true }` no
    `generateEvaluationPlan`). A tela mostra a pergunta e "Continuar sem
    pontos". Prova: `e2e/atendimento-ficha-planejador-injetaveis.spec.ts`
    ("atend-12").
  - **Na leitura** (aba Prontuário da ficha, o atendimento bloqueado), o
    retrato aparece com o nome e a data ("como estava em…") e, se o
    planejamento existe e quem vê pode abri-lo (`planejamentosAbriveisDasFichas`,
    calculado na página), o link "Abrir planejamento" para Planejamento →
    Injetáveis da ficha. Nada de confirmar ou registrar aplicação fora do
    atendimento. O pacote LGPD leva o retrato no JSON, como levava o mapa.
  - **A aplicação registrada por Planejamento → Injetáveis chega à ficha**
    (D6 da 7ª simulação, 2026-11-05; princípio 3): a Rita marcou 3 pontos e
    usou "Registrar aplicação" pela sub-aba do atendimento; o campo da ficha
    ficou vazio (`{"view":"rosto_f","points":[]}`, sem planejamento) e o
    prontuário dizia "Nenhum ponto marcado". Agora o campo do planejador SEM
    planejamento e sem ponto: na tela, abre sozinho (uma vez) o planejamento
    que tem a aplicação DESTE atendimento, e a lista o marca "Aplicação
    registrada neste atendimento" (`[data-aplicado-neste-atendimento]`,
    `listarPlanejamentosDoCliente` com o atendimento); no servidor, o "Salvar
    ficha", o "Finalizar" (também a ficha salva antes com o campo vazio) e o
    gerar plano ligam esse planejamento antes do retrato
    (`retratarInjetaveis` com `appointmentId` →
    `planejamentoAplicadoNoAtendimento`, `comOPlanejamentoAplicado`; só ao
    alcance de quem age). O campo com planejamento escolhido, ou o mapa solto
    com pontos, fica como está. Prova:
    `e2e/atendimento-ficha-planejador-injetaveis.spec.ts` ("D6").
  - **"Novo planejamento" reaproveita o vazio** (A35 da 7ª, 2026-11-05): cada
    clique criava um planejamento vazio (4 na ficha da Ana). Para a cliente
    que já tem um planejamento sem ponto e sem aplicação,
    `criarPlanejamentoInjetavel` devolve esse (`reaproveitado`) e a tela o
    abre. Os 4 vazios da Ana (dado de [sim]) ficaram. Prova: o mesmo spec
    ("A35").
  - **A ficha antiga, de mapa solto** (sem `planejamento`), continua como
    está, só para ler — também no atendimento.
  - As regras do mapa (`mapaAoAlcance`, `mapaDaProfissional`,
    `clienteDaProfissional`, `mapaDoTenant`) moram em `lib/injetaveis/alcance.ts`
    — fora do `'use server'`, onde todo export é endpoint.
  Prova: `e2e/atendimento-ficha-planejador-injetaveis.spec.ts`,
  `tests/retrato-dos-injetaveis.test.ts`.
- **O ponto novo do mapa** (J-38, 2026-10-30): o PRIMEIRO nasce sem produto
  (a linha diz "Escolha o produto"); os seguintes repetem o produto, a dose e
  a unidade do ÚLTIMO marcado. Nascia com o primeiro produto do catálogo
  ("Ácido hialurônico") e dose 0. Cada ponto tem "Região (opcional)"
  (`InjectablePoint.regiao`). Prova: `e2e/injetaveis-ponto-novo.spec.ts`.
- **O produto do ponto vem do ESTOQUE, e o mapa se liga à baixa** (A36 da 5ª
  simulação: o mapa gravava 0,5 ml e o estoque baixava 1 ml, sem aviso). O
  ponto escolhe o produto numa LISTA — os insumos da unidade no atendimento
  (`ContextoDosInjetaveis.produtos`, o mesmo do Planejamento), o catálogo na
  tela de Injetáveis; o que estava escrito fora dela fica, marcado "(fora do
  estoque)". Era texto livre com sugestões (a lista do campo na ficha, que no
  atendimento deixou de ser a fonte). O "Finalizar" compara as doses do mapa
  DESTE atendimento (a aplicação registrada; sem ela, o planejamento da
  ficha — `dosesDoMapaDoAtendimento`) com a baixa, pelo nome do insumo e na
  mesma unidade (`divergenciasDaBaixa`, `lib/injetaveis/dose.ts`): "O mapa
  soma 8 UI de Toxina; a baixa está em 30 UI." com "Baixar 8 UI, a dose do
  mapa" (ou "Incluir … na baixa"), que muda o cartão de insumos. Só avisa: a
  baixa continua a da tela. A dose sai com vírgula em toda tela do mapa
  (`formatarDose`: "0,5 ml"). Prova: `e2e/injetaveis-produto-do-estoque.spec.ts`,
  `tests/injetaveis-dose.test.ts`. **"U" e "UI" são a mesma unidade na
  comparação** (D16 da 9ª simulação, 2026-11-07): a toxina do estoque se conta
  em "U" (o frasco de 100 U, J-11) e o ponto do mapa nasce em "UI" — os 56 UI
  do mapa da Marina e os 40 U da baixa nunca se comparavam, e o aviso não
  saía. A soma do mapa e a comparação juntam as duas, e o texto fala na
  unidade do insumo ("O mapa soma 56 U de Toxina; a baixa está em 40 U.").
  ml e UI seguem sem se comparar. Prova: `tests/injetaveis-dose-u-e-ui.test.ts`.
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
- **E o plano de tratamento só existe para quem tem a Agenda** (D6 da 5ª
  simulação, 2026-11-01; `getPlanosDoCliente` pede `agenda: VIEW`): na ficha,
  sem a Agenda e sem o prontuário, a aba Planejamento some; com o prontuário e
  sem a Agenda, ela é só a de injetáveis (`PainelPlanejamento podeVerPlanos`).
  A carga da lista que falha diz "Não foi possível carregar os planos de
  tratamento." — era "Carregando planos…" para sempre, com 500 na rede. E a
  ficha não oferece "+ Agendar" sem a Agenda em Gerenciar, nem "Adicionar
  primeiro documento" a quem não anexa (A23). Prova:
  `e2e/permissoes-quem-so-ve.spec.ts`.
  **Sem o "Novo plano", a tela diz quem monta** (A18 da 6ª simulação,
  2026-11-04): montar o plano pede o Prontuário em Gerenciar, e a recepção lia
  "pode ser montado agora…" sem botão. A aba Planejamento vazia e a tela
  Planejamentos dizem "Quem monta o plano é quem tem o Prontuário em Gerenciar
  (a profissional, na avaliação ou aqui)." (`TEXTO_QUEM_MONTA`,
  `lib/plano-de-tratamento/situacao.ts`). **E diz onde se libera e o que isso
  abre** (A12 da 12ª simulação, 2026-11-11; princípio 3): "Para liberar,
  Configurações → Cargos → Prontuário em Gerenciar — e o cargo passa a ver e
  escrever o prontuário (o dado clínico) das clientes." A regra fica. Prova:
  `e2e/configuracoes-atritos-da-12.spec.ts` ("A12"). E `/planejamentos/novo` (os dois
  portais) não é 404: leva à lista com `?novo=1`, que abre o "Novo plano"
  para quem monta. Prova: `e2e/planejamentos-quem-monta.spec.ts`.
- **Os planos de tratamento seguem a agenda "só os meus"** (decisão do Heitor,
  2026-10-28). Com `agenda` OWN, a tela Planejamentos (`listarPlanejamentos`),
  os planos da cliente (`getPlanosDoCliente`, o Planejamento da ficha e do
  atendimento) e TODA action pelo id do plano que passa por `planoDoTenant`
  (cabeçalho, editar, salvar, renomear, ligar cliente, enviar à recepção,
  fechar o checkout, o arquivo do tratamento), mais `getTreatmentPlanSessions`,
  só valem para o plano DELA (`planoDaProfissional`). Cancelar o plano fechado
  é do Financeiro em Gerenciar, como o pacote (D4 da 9ª, `vendas-financeiro.md`).
  **"O plano é da cliente, não da profissional"** (revisão do Heitor,
  2026-10-29): dela é o plano de toda cliente que ela atende — um agendamento
  com ela NÃO CANCELADO, inclusive futuro (eq-02, 2026-11-02: UMA regra só, a
  do dashboard — o cancelado não conta, a falta conta; prova:
  `e2e/planejamentos-so-os-meus.spec.ts`) (`clienteAtendidaPor`,
  `lib/clientes/atendida-por.ts`, a regra do prontuário OWN) —, quem quer que o
  tenha montado, e o plano que ELA montou (`professional_id`), mesmo de
  cliente sem agendamento com ela. Quem cobre uma sessão precisa ver o que foi
  feito e o que falta. Até a revisão era só `professional_id`. O filtro da
  lista é no banco (o `!inner` plano → cliente → agendamento com ela, mais os
  montados por ela). A anotação do profissional no plano continua do
  prontuário (`podeVerClinico` com quem montou). Ficam de fora os gestos de
  quem RECEBE (`getCheckoutPlan`, `cancelCheckout`, `receberDoPlano`, que
  pedem `cashier`/fechar plano, não a agenda — confirmado pelo Heitor). O
  recorte dos planos aguardando checkout no dashboard segue
  `professional_id` (indicador, §13.1). Prova:
  `e2e/planejamentos-so-os-meus.spec.ts`.
- **A tela dos planos se chama "Tratamentos", como o menu** (A30 da 8ª
  simulação, 2026-11-06; decidido pelo princípio 3): o menu "Tratamentos"
  abria "Planejamentos". Ficou o nome do menu: o grupo dele é "Planejamento"
  (Tratamentos e Injetáveis, como as duas sub-abas do Planejamento da ficha),
  e "Planejamentos" sozinho dizia também os de injetáveis. O título da lista e
  o "voltar" do plano aberto dizem "Tratamentos"; a rota segue
  `/planejamentos`. Prova: `e2e/atendimento-atritos-da-8.spec.ts` ("A30").
- **"Aceitar plano" usa o que está na tela** (A29 da 12ª simulação, 2026-11-11;
  princípio 3): com a observação digitada e não salva, a Bianca lia "Preencha
  as observações antes de enviar." O "Aceitar plano" e o "Cliente vai pensar"
  salvam o editor antes (o `ref` do `TreatmentPlanEditor`, como o "Enviar para
  a recepção" da avaliação), e a recusa diz "…antes de aceitar o plano ou
  mandá-lo à recepção." Prova: `e2e/agenda-atritos-da-12.spec.ts` ("A29").
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
  não é usada. **A nota diz o nome das unidades** (D12 da 8ª simulação,
  2026-11-06): "Transferência para Batel." na origem e "Transferência de Água
  Verde." no destino, com a observação depois (migration `20261106003403`);
  dizia "Transferência → destino." e "← origem.". As linhas de antes não foram
  reescritas: o histórico (`getProductMovements`) as resolve pela outra perna
  da mesma `reference` (`notaDaTransferencia`, `lib/estoque/transferencia.ts`).
  Prova: `e2e/estoque-transferencia-com-nomes.spec.ts`,
  `tests/estoque-transferencia-nota.test.ts`.
  **O "deu certo" diz os dois saldos** (A16 da 8ª simulação, 2026-11-06): a
  gerente de unidade fixa vê só o estoque dela e não tinha como conferir o
  destino. `estoque_transferir` devolve os saldos depois (com as linhas
  travadas), e o aviso diz "Transferido: Batel agora tem 5 un; Água Verde
  ficou com 3 un." Prova: o mesmo spec ("A16").
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
  - Continua em EMBALAGENS: o que a pessoa digita (entrada, transferência),
    `products.cost_price` (o preço da embalagem),
    `branch_product_stock.current_stock`, o mínimo e os lotes — o gatilho do
    lote converte toda saída pelo fator. O AJUSTE e a perda aceitam também a
    unidade de consumo (abaixo).
  - **O ajuste (inventário) mostra o saldo nas duas unidades e conta EXATO**
    (D3 da 7ª simulação, 2026-11-05; decidido pelo princípio 3): a toxina tinha
    780 UI (7,8 frascos), o Ajuste mostrava "Estoque atual 8" (a embalagem
    aberta arredondada), a Tânia contou 7,7 e o estoque ficou em 750 UI —
    `estoque_ajuste` contava o frasco aberto inteiro e tirava da contagem o
    "já consumido" dele (20 UI), sem a tela dizer. Agora o Ajuste mostra
    "780 UI · 7,8 frasco" (`[data-saldo-do-ajuste]`), pergunta "Contar em:
    frasco | UI" (a embalagem por padrão desde a D5 da 11ª, abaixo — era UI)
    e diz a conta ANTES de aplicar
    (`[data-ajuste-equivale]`): "765 UI = 7,65 frasco", ou "7,7 frasco =
    770 UI: o frasco aberto conta pela fração que sobra nele". A contagem vale
    exata na unidade digitada: `estoque_ajuste_em` (migration
    `20261105002801`; em embalagens, a fração é o aberto), o saldo em
    embalagens é o rendimento arredondado para cima e o movimento é o que o
    rendimento andou. O Copilot passa pela mesma função (`ajusteDeEstoqueCore`)
    e o cartão diz "7,8 → 8 frasco (780 → 800 UI)". `estoque_ajuste` (o de
    antes) ficou sem chamador. Prova: `e2e/estoque-tela-consumo-e-lotes.spec.ts`
    ("D3"), `e2e/estoque-custo-de-consumo.spec.ts`.
  - **O consumo e o valor em estoque vão pelo custo do LOTE** (D2 da 10ª
    simulação, 2026-11-10; princípio 3 — o relatório dizia "ao custo do lote"
    e usava o último custo): o Gel com 10 un a R$ 22 e 6 un a R$ 24 valia
    16 × 24, uma entrada mais barata BAIXAVA o valor de tudo, e a limpeza que
    "sai do lote" de R$ 18,50 gravava R$ 19,50. O custo de um lote é
    `custo_do_lote` (o do movimento de entrada ligado a ele — a compra, ou o
    ajuste de inventário que o criou ou somou nele; o que veio por
    transferência herda o do lote de origem). O gatilho do lote grava no
    insumo do atendimento (PROCEDURE_USAGE) e no ajuste negativo o custo dos
    lotes que o FEFO tirou — a mesma conta da perda sem lote escolhido —, e o
    que nenhum lote cobre fica com o custo que o movimento trouxe (o último);
    os insumos da comissão, lidos depois na mesma transação, já saem com ele.
    `valor_do_saldo` soma cada lote ao custo dele e o que nenhum lote cobre ao
    último custo (os lotes que passam do saldo valem a média deles). A margem
    do CATÁLOGO segue o custo atual (`custo_de_consumo`). Os movimentos de
    antes não foram reescritos. Migration `20261110004902`. Prova:
    `e2e/estoque-atritos-da-10.spec.ts` ("D2").
  - **O ajuste (inventário) fecha com os lotes e com as perdas** (D5 da 10ª,
    2026-11-10; decidido pelos princípios, o relatório da 10ª): o positivo
    não entrava em lote nenhum (saldo 18,1 com os lotes 17,1, a unidade a mais
    sem validade) e o negativo gravava custo nulo, fora de "Perdas no
    período". Agora a contagem MAIOR que o saldo pergunta "Em qual lote entra
    a diferença" — um dos lotes da unidade, ou "Um lote novo, sem número", com
    a validade opcional — e soma nele, ao custo dele (o novo, ao último
    custo); a MENOR sai pelo FEFO, ao custo do lote, e entra em "Perdas no
    período" com o motivo "Inventário" (`[data-ajuste-negativo]` diz isso
    antes de aplicar). `estoque_ajuste_com_lote` (migration `20261110004903`;
    `ajusteDeEstoqueCore`, a tela e o Copilot — que, sem lote, abre o novo sem
    número); `estoque_ajuste_em` ficou sem chamador no app. Prova: o mesmo
    spec ("D5").
  - **O ajuste a MENOS escolhe o lote, e a entrada errada se DESFAZ** (A38 da
    10ª, 2026-11-10; o relatório: "desfazer duas entradas erradas zerou o lote
    real AH-2026-0451, pelo FEFO"): a contagem menor pergunta "De qual lote sai
    a diferença" ("O que vence primeiro" por padrão) — o movimento leva o lote
    em `reference = 'lote:<id>'` e o gatilho tira dele primeiro, como a perda
    (`estoque_ajuste_com_lote`, migration `20261110005101`). E o Histórico tem
    "Desfazer entrada" na entrada cujo lote não teve saída nenhuma (sem lote:
    quando o produto não tem lote com saldo na unidade): uma ENTRADA negativa
    (`PURCHASE` com quantidade < 0, "Entrada desfeita") que tira do lote dela —
    não é perda nem consumo (fora de "Perdas no período" e do giro) —, e a
    original fica marcada (`desfeita_em`, `desfeita_por`, `desfeita_motivo`,
    `desfeita_pelo`); o último custo volta ao da entrada anterior quando era o
    dela. Nada se apaga. `estoque_desfazer_entrada` (com o motivo obrigatório)
    confere tudo de novo com o saldo e o lote travados; a action é
    `desfazerEntradaDeEstoque` (Estoque em Gerenciar, a unidade ao alcance).
    Prova: `e2e/estoque-uso-da-10.spec.ts` ("A38").
  - **O ajuste errado também se DESFAZ, e o "Contar em" é um só** (D5 da 11ª
    simulação, 2026-11-10; princípio 3: a Gisele digitou 15 querendo refis com
    a contagem em g, o sistema gravou −14.745 g e "Perdas no período" ficou com
    R$ 567,79 que não aconteceram — a correção entrou como lote novo, sem
    abater a perda). O Histórico tem "Desfazer ajuste" no ajuste de inventário
    enquanto nada saiu do lote dele DEPOIS (o que achou a mais: o lote em que
    entrou; o que achou a menos: os lotes de onde saiu), com o motivo: o saldo
    e os lotes voltam, o original fica "Desfeito em …", o movimento que o
    desfaz diz "Ajuste desfeito", e os dois saem de "Perdas no período"
    (`estoque_desfazer_ajuste`, `desfazerAjusteDeEstoque`, `metrics_perdas`;
    migration `20261110005401`). A entrega de recompensa (o voucher) não se
    desfaz por aqui. O "Contar em" do Ajuste e o "Em" da Perda nascem na
    EMBALAGEM e têm a mesma ordem (embalagem | consumo); e a contagem que muda
    o saldo em mais de 50% avisa forte, com a conta na outra unidade
    ("15 g são 0,015 refil", `[data-variacao-grande]`) — só aviso (princípio 2).
    Prova: `e2e/estoque-defeitos-da-11.spec.ts` ("D5").
  - **Os atritos de estoque da 11ª simulação** (2026-11-10; princípio 3, e o 2
    na validade vencida — avisar, não recusar):
    - **O Ajuste fala da contagem sem assustar** (A49): "Contagem do
      inventário. Digite o que há na prateleira agora… A diferença a mais
      entra num lote; a menos vai para Perdas (Inventário). Errou? Desfaça no
      Histórico." (era "Operação crítica… inconsistência com movimentações
      anteriores"), a caixa é "Confirmo que contei na prateleira", e a conta da
      embalagem diz "10,5 refil = 10.500 g. O refil aberto entra pelo que sobra
      nele: pela metade, 0,5." (era "conta pela fração que sobra nele (0,7 un =
      700 g)").
    - **O saldo como na prateleira, e a entrada na embalagem** (A50): o
      "Estoque mínimo" diz "Atual: 10 refil fechados + 1 aberto com 840 g"
      (`saldoNaPrateleira`, `lib/estoque/saldo-em-texto.ts`; era "Atual: 11
      refil", o `current_stock` com a aberta inteira), e o Histórico destaca a
      ENTRADA e a TRANSFERÊNCIA na embalagem ("+50 refil", com "50.000 g"
      embaixo; `[data-quantidade-principal]`) — o que se digita nelas; o resto
      segue na unidade de consumo.
    - **A validade que já passou avisa** (A51): "Esta validade já passou
      (01/01/2025): o lote entra vencido. Confira a data… se estiver certa, a
      entrada vale assim." (`[data-validade-vencida]`, `loteVencido`).
    - **Entrada, perda e ajuste confirmam** (A52): "Entrada registrada: +3
      frasco de Gel.", "Perda registrada: …", "Ajuste aplicado: … agora tem …".
    - **"Aplicado em: ver clientes"** (A53): o botão do lote se lia como um
      rótulo vazio no lote sem uso.
    - **A nota com vários produtos** (A54): a entrada lembra a nota e o
      fornecedor da anterior NESTA aba, por 2 horas (`lib/estoque/nota-da-entrada.ts`,
      sessionStorage), e a próxima entrada — outro produto da mesma nota — já
      vem com eles, dizendo "A nota X veio da entrada anterior… apague se esta
      for outra." (`[data-nota-da-entrada-anterior]`). A entrada de várias
      linhas numa janela só ficou de fora (decisão da F56: o atrito era repetir
      a nota).
    - Prova: `e2e/estoque-atritos-da-11.spec.ts`, `tests/estoque-saldo-na-prateleira.test.ts`.
  - **Os atritos de estoque da 12ª simulação** (2026-11-11; princípio 3):
    - **A embalagem no plural** (A49: "3 frasco", "Saem 13.500 ml (27
      frasco)"): a palavra vai ao plural a partir de 2 ("27 frascos", "10
      refis fechados", "1,5 frasco"), e as siglas ficam ("13.500 ml", "5 un")
      — `medidaNoPlural`/`quantidadeComMedida` (`lib/estoque/medidas.ts`), no
      saldo da tela (`formatarQuantidadeComUnidade`), na prateleira
      (`saldoNaPrateleira`), no Ajuste, na Perda, no Histórico, nas
      confirmações e nas Perdas dos Relatórios.
    - **O motivo do "Desfazer" diz que é obrigatório** (A48): "Motivo *", e,
      vazio, "Escreva o motivo para desfazer: ele fica no histórico."
      (`[data-motivo-obrigatorio]`) — o botão desligado não dizia por quê. Vale
      no "Desfazer entrada" e no "Desfazer ajuste".
    - **O brinde da fidelidade é perda "Brinde da fidelidade"** (A40): a entrega
      do voucher de produto (`entregar_voucher_produto`, o ajuste negativo com
      `reference = 'voucher:<id>'`) entrava em "Perdas no período" como
      "Inventário"; agora é o motivo `BRINDE`, pelo custo do lote de onde saiu
      (`metrics_perdas`, migration `20261111006101`). Métrica, como toda perda:
      fora do giro e do lucro. O brinde sem produto (A7) não mexe no estoque.
    - Prova: `e2e/estoque-atritos-da-12.spec.ts`, `tests/atritos-da-12-f61.test.ts`.
  - **O custo por unidade de consumo tem 4 casas** (D6 da 11ª; princípio 3: a
    cera a R$ 0,038/g gravava R$ 0,04, e a Drenagem dizia R$ 1,10 de insumos
    em vez de R$ 1,14): `procedure_products.unit_cost` é numeric(12,4)
    (migration `20261110005401`), o campo do insumo no procedimento lê e mostra
    até 4 casas (`lib/estoque/custo-do-insumo.ts`), e o Histórico do estoque
    diz "R$ 0,0395/g". Prova: o mesmo spec ("D4 e D6"),
    `tests/custo-do-insumo-4-casas.test.ts`.
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
- **Onde o produto está disponível: Insumo e Venda direta** (E2 do Bloco
  Estoque, 2026-11-14 — o Heitor, 13/11: "checkbox de onde o produto está
  disponivel (Insumo e Venda direta)"). O cadastro tem DOIS checkboxes no
  grupo "Onde o produto está disponível"; o produto novo nasce com Insumo
  marcado. Os dois podem estar marcados; nenhum é recusado
  (`RECUSA_SEM_USO`: o produto não estaria em lugar nenhum). O banco guarda o
  mesmo `products.uso` de antes — é o contrato que o PDV e as listas de
  insumo leem: só Insumo = `INSUMO`, só Venda direta = `REVENDA`, os dois =
  `AMBOS` (`usoDosCheckboxes`, `lib/estoque/uso.ts`); a linha do produto diz
  "Insumo", "Venda direta" ou "Insumo e venda direta" (`rotuloDoUso`). Prova:
  `e2e/estoque-marcas-e-fornecedores.spec.ts` ("E2").
  Antes (D-6, decisão do Heitor, 2026-10-29; `products.uso`, migration
  `20261029001302`) era o segmentado "Uso do produto" (Insumo, Revenda, Os
  dois). A Venda direta exige preço
  de venda (`usoEPrecoDoFormulario` e a restrição `products_uso_check`); só o
  insumo grava o preço nulo. A regra é UMA, `lib/estoque/uso.ts` (`ehInsumo`,
  `ehRevenda`): o insumo aparece no procedimento (o que já está ligado a um
  procedimento continua na lista dele), no "Adicionar insumo" do atendimento
  e no editor do plano; a revenda, na venda de produto. Os produtos de antes
  herdaram do preço de venda: com preço, "Os dois"; sem, "Insumo" (na
  produção, 1 e 9). Era o liga/desliga "venda direta", que nada lia. Prova:
  `e2e/estoque-uso-do-produto.spec.ts`. O produto de revenda tem também a
  "Comissão na venda deste produto" no cadastro, para quem muda comissão (o
  Heitor, 2026-11-03 — a regra em `comissoes.md`).
  **O SKU sem categoria segue o uso** (A6 da 7ª simulação, 2026-11-05: o
  produto de revenda da Dália nasceu "OUT-004", na sequência dos insumos): as
  três letras da categoria; sem ela, o insumo segue "OUT" e o que se vende
  (revenda e "os dois") ganha "REV" (`prefixoDoSku`, `lib/estoque/sku.ts`, no
  servidor e na prévia do cadastro). O SKU que já existe não muda. Prova:
  `e2e/configuracoes-atritos-da-7.spec.ts` ("A6"), `tests/sku-do-produto.test.ts`.
- **A saída por PERDA** (D-7, decisão do Heitor, 2026-10-29; migrations
  `20261029001303`/`304`): Gerenciar estoque → Movimentações → "Perda", com o
  LOTE (ou "sem lote — sai o que vence primeiro"), a quantidade em
  EMBALAGENS, o motivo (Vencido, Quebrou, Amostra, Uso interno —
  `lib/estoque/perda.ts`, o banco confere a mesma lista) e a observação.
  `registrarPerda` → `estoque_perda`, uma transação com a linha do saldo
  travada: recusa mais do que o lote tem ("O lote tem só 2 frasco.") e mais
  do que há. O movimento é `LOSS` (em consumo, com `motivo_da_perda`) e diz o
  lote em `reference = 'lote:<id>'`: o gatilho do lote tira DELE primeiro (o
  frasco vencido sai do lote vencido, não do bom); o resto segue o FEFO. O
  custo é o da entrada do lote; sem lote, o dos lotes que o FEFO tira. NUNCA
  gera despesa. A perda NÃO é consumo: fica fora do giro e do lucro (decisão
  para o Heitor). O relatório é a seção "Perdas no período" de Relatórios →
  Estoque (`metrics_perdas` → `getPerdas`, `indicadores.md`). Prova:
  `e2e/estoque-perda.spec.ts`.
  - **A perda aceita a unidade de CONSUMO** (est-03 da revisão, 2026-11-02:
    "um frasco aberto de toxina vence com 30 UI sobrando; a Bruna precisa
    digitar '0,3 frasco'"). O produto com unidade de consumo mostra "Em:
    frasco | UI" na perda, e a tela diz a equivalência ("= 0,3 frasco").
    `registrarPerda` manda `unidade = CONSUMO` a `estoque_perda_em`
    (migration `20261101001107`): o movimento `LOSS` sai da quantidade
    digitada EXATA (−30 UI), o lote e o saldo descem o que ela vale em
    embalagens, e a recusa fala na unidade escolhida ("O lote tem só 270
    UI."). `estoque_perda` (em embalagens) passou a chamar a mesma função.
    Prova: `e2e/estoque-perda-unidade-de-consumo.spec.ts`.
- **A DEVOLUÇÃO da venda de produto estornada** (H2, decisão do Heitor,
  2026-11-01; migrations `20261101000301`/`302`): o estorno pergunta se o
  produto voltou. Voltou: movimento `SALE_RETURN` ("Devolução de venda" no
  histórico), positivo, que devolve o que a venda tirou ao saldo e a cada
  lote de onde saiu (pelo `stock_movement_batches` da venda — o gatilho do
  lote não mexe em movimento positivo, quem devolve é a função). Não voltou:
  o estoque fica, e a venda é perda no relatório (motivo "Venda estornada").
  Não é consumo nem entrada: fora do giro. A regra é de
  `produto_estornar_venda` (`vendas-financeiro.md` §9.3.3). Prova:
  `e2e/vendas-produto.spec.ts`.
- **A tela de Estoque mostra o saldo na unidade de CONSUMO** (J-43/J-44/J-45,
  2026-10-30). A regra é UMA, `lib/estoque/situacao.ts` (tela da rede, da
  unidade e o "Estoque crítico" do dashboard): o produto com unidade de
  consumo se mostra no rendimento (268 UI) com a equivalência EXATA em
  embalagens embaixo (2,68 frasco) — o `current_stock` arredonda a embalagem
  aberta para cima, e 95 ml apareciam como "1 frasco". A situação compara o
  rendimento com o mínimo em consumo (3 frascos = 300 UI): menor é "Abaixo do
  mínimo", IGUAL é "No mínimo" (era "abaixo do mín."); os dois são "estoque
  baixo" (o cartão e o filtro "No mínimo ou abaixo", o alerta de sempre).
  - "TOTAL REDE" e "ESTOQUE POR FILIAL" só com mais de uma unidade na tela; no
    portal da unidade a coluna é "ESTOQUE".
  - O histórico do produto diz cada movimento na unidade dele E em embalagens
    (−32 UI · 0,32 frasco), o lote (número e validade) e o custo
    (`getProductMovements`: `stock_movement_batches` e `unit_cost`).
  - A linha aberta lista os lotes com saldo de cada unidade (número, validade,
    o que sobra, custo da embalagem — `lotesComSaldo`, `lib/estoque/lotes.ts`),
    e o cartão "Validade em 30 dias" diz QUAIS produtos.
  - **A entrada guarda o lote também só com a validade**, e fica LIGADA ao
    lote que criou em `stock_movement_batches` (migration `20261029001301`).
    Antes a validade sem número de lote sumia. O lote continua sem custo
    próprio: o custo dele é o de `custo_do_lote` — a tela lê pela MESMA
    função (`custos_dos_lotes`, migration `20261110005401`; D4 da 11ª
    simulação, 2026-11-10, princípio 3: o lote que o ajuste de inventário
    criou dizia "custo —" e valia R$ 39,50 na conta). O do ajuste diz "R$ 39,50/refil
    (último custo)" (o custo de então); o que veio por transferência, o do lote
    de origem. Prova: `e2e/estoque-defeitos-da-11.spec.ts` ("D4").
  - Prova: `e2e/estoque-tela-consumo-e-lotes.spec.ts`, `tests/estoque-situacao.test.ts`.
  - **A validade do lote é um DIA, e se lê pelo dia** (D1 da 7ª simulação,
    2026-11-05; princípio 3 e CLAUDE.md §14): o campo de data da entrada grava
    "AAAA-MM-DD" à meia-noite UTC, e a tela do Estoque, com `new Date(...)`,
    dizia "vence 14/11/2026" para o lote de 15/11 que Relatórios → Estoque
    dizia 15/11. A regra é UMA, `lib/estoque/validade.ts`: a tela mostra o dia
    gravado (`validadeNaTela` — a linha do lote, o seletor de lote da perda, o
    histórico), no dia da validade o lote ainda vale e vencido é do dia
    seguinte (`loteVencido`, o HOJE da unidade do lote — F62b, com o fuso
    opcional e Brasília de padrão; também o "jaVenceu" do Copilot e o FEFO,
    na tela e no banco: `estoque_perda_em`, `produto_vender*`,
    `on_stock_movement_lotes`, migration `20261111006203`), e o "vence em 30 dias" compara os dias (`venceAte` em
    `lotesVencendo`; o Copilot até o fim do dia). Prova:
    `e2e/estoque-tela-consumo-e-lotes.spec.ts` ("D1"),
    `tests/estoque-validade-do-lote.test.ts`.
  - **O lote diz em quem foi aplicado — o recall** (A40 da 7ª simulação,
    2026-11-05: não havia "quem recebeu o lote X"; a baixa segue FEFO, a regra
    fica). Cada lote da linha aberta tem "Aplicado em": a janela lista cada
    saída do lote para uma cliente — o insumo de um atendimento (a cliente, o
    dia e a hora marcados, a profissional) e a venda de produto (quem vendeu) —
    com a quantidade na unidade do movimento ("20 UI"). A ligação é a de
    sempre, `stock_movement_batches` (o gatilho do lote; a quantidade e a hora,
    abaixo, desde a 9ª); a leitura,
    `aplicacoesDoLote` (`lib/estoque/aplicacoes-do-lote.ts`, os nomes por
    `nomesDosRegistros`), pela action do mesmo nome em `actions/stock.ts`:
    pede o Estoque E as Clientes (a lista diz nomes de cliente — sem as
    Clientes, o botão nem aparece), com o lote da rede e da unidade ao alcance.
    Prova: `e2e/estoque-atritos-da-7.spec.ts` ("A40").
    **A dose é a DAQUELE lote, a hora é a da aplicação, e o esgotado continua
    aberto** (D6, D15 e A12 da 9ª simulação, 2026-11-07; princípio 3): a
    Carolina recebeu 50 U, 44 do TOX-A1 e 6 do TOX-B2, e o TOX-B2 dizia
    "Carolina · 50 U" (a baixa inteira); o TOX-A1, que acabou — o recall mais
    provável —, sumia da tela com a lista; e o "Quando" era a hora marcada
    (02:00) da aplicação feita às 00:15. Agora a quantidade é a da ligação
    (`stock_movement_batches.quantity`, em embalagens, × o rendimento), o
    "Quando" é a conclusão do atendimento (sem ela — a desistência —, a hora da
    baixa), e a linha aberta tem "Lotes esgotados" por unidade
    (`lotesEsgotados`, `actions/stock.ts`, pede o Estoque e a unidade ao
    alcance; `[data-lote-esgotado]`), cada um com o "Aplicado em". Era
    documentado "o dia e a hora marcados" (A40 da 7ª): mudou pela hora real.
    Prova: `e2e/estoque-lotes-da-9.spec.ts`. **"Ver lotes esgotados", só onde
    há algum** (A36 da 10ª, 2026-11-10: "Lotes esgotados" parecia um estado e
    aparecia em produto que nunca teve lote): a página manda os pares produto ×
    unidade com lote esgotado (`paresComLoteEsgotado`, `lib/estoque/lotes.ts`)
    e o botão só aparece neles. Prova: `e2e/estoque-uso-da-10.spec.ts` ("A36").
  - **Os cartões do topo cabem, e a validade diz o lote e a data** (A40 da
    10ª): a 1440 px saíam cortados (cinco colunas, rótulo e detalhe numa linha
    com reticências). Os dois Estoques usam `CartoesDoEstoque`
    (`components/shared/cartoes-do-estoque.tsx`: a grade se ajusta, o rótulo
    quebra linha) e o "Validade em 30 dias" lista "Gel — lote GA-1 ·
    15/11/2026", até três, e "e mais N" (`loteNoCartao`). Prova: o mesmo spec
    ("A40").
  - **O mínimo do CADASTRO vale na unidade** (D2 da 11ª simulação,
    2026-11-10; princípio 3: os 5 insumos da Marta, 3/1/2/2/3 no cadastro,
    ficaram com mínimo 0 na unidade, e o "Estoque baixo" dizia 0). A primeira
    linha da unidade (`branch_product_stock`) herda o `products.min_stock` —
    um gatilho antes do INSERT (`trg_bps_minimo_do_produto`, migration
    `20261110005401`) cobre todo caminho que a faz nascer (entrada, ajuste,
    transferência, perda, venda, conclusão). O mínimo salvo à mão na unidade
    ("Salvar mínimo") é o dela, mesmo 0 (`adminUpdateMinStock` grava por
    UPDATE depois). As 4 linhas de antes com mínimo 0 e produto com mínimo
    (2 da [sim] Violeta, 1 da [sim] Camélia, 1 da Bellaris Clinic) ficaram como
    estão: nada diz se alguém zerou o mínimo de propósito. **E a linha que nasce
    não avisa falta que não houve**: as funções criam a linha como um marcador
    de saldo 0 e gravam o saldo no UPDATE seguinte; com o mínimo herdado, o
    marcador emitia "estoque.abaixo_do_minimo, saldo 0" na entrada de 10 com
    mínimo 3. O gatilho (`on_stock_below_min`, migration `20261110005402`)
    ignora o marcador e decide pelo saldo de verdade. Prova:
    `e2e/estoque-defeitos-da-11.spec.ts` ("D2").
    **E antes da linha nascer, a tela mostra o do cadastro** (D11 da 12ª
    simulação, 2026-11-11; princípio 3: o Sérum com mínimo 3 e sem estoque
    inicial aparecia 0 na aba "Estoque mínimo", e salvar dali gravava 0). Sem a
    linha da unidade, a aba vem com `products.min_stock` e diz "Ainda sem estoque
    nesta unidade: vale o mínimo do cadastro do produto (3 frasco)."
    (`[data-minimo-do-cadastro]`, `minimoDoCadastro` das duas telas de estoque).
    Prova: `e2e/estoque-defeitos-da-12.spec.ts`.
  - **Salvar o mínimo tem nome e confirma** (A41 da 10ª): "Salvar mínimo" e
    "Mínimo salvo" (`[data-minimo-salvo]`) — era um ícone. Prova: ("A41").
  - **O mínimo e o lote vencendo avisam** (A39 da 10ª): o dashboard da
    UNIDADE ganhou o quadro "Estoque no mínimo ou abaixo"
    (`[data-estoque-abaixo-do-minimo]`, `itensAbaixoDoMinimo`,
    `lib/estoque/abaixo-do-minimo.ts`, a régua da tela de estoque) — o da rede já
    tinha o "Estoque crítico"; e o job `estoque-minimo` (de hora em hora, que já
    levava o mínimo ao sino) avisa também o lote que vence em 30 dias, UMA vez
    por lote, a quem responde pelo Estoque na unidade (`avisarLotesVencendo`,
    `lib/estoque/aviso-de-lote.ts`, tipo `batch_expiring`; `?rede=` recorta uma
    rede, para o teste). Prova: o mesmo spec ("A39"),
    `e2e/estoque-lote-vencendo-no-sino.spec.ts`.
    **E o mínimo chega ao sino pela régua da TELA** (A48 da 11ª simulação,
    2026-11-10; princípio 3: o dashboard da Gisele dizia "2" e o sino "Tudo em
    dia"). O job avisava pelo evento `estoque.abaixo_do_minimo` do gatilho,
    que compara as embalagens (o frasco aberto conta inteiro) e só o "abaixo"
    estrito — a Lâmina com 190 un (3,8 caixas) e mínimo de 4 caixas nunca
    cruzava. Agora é `avisarEstoqueMinimo` (`lib/estoque/aviso-do-minimo.ts`):
    o ESTADO de cada linha com mínimo, por `situacaoDoEstoque` (no rendimento,
    "No mínimo" conta), a quem tem o Estoque em Gerenciar na unidade ("Lâmina:
    190 un em estoque, mínimo 200 un."), UMA vez por cruzamento — a linha
    avisada ganha `branch_product_stock.minimo_avisado_em` (reivindicada antes
    de avisar), e a que sai do mínimo a perde e volta a poder avisar. O evento
    continua, para as automações. O `?rede=` recorta também o mínimo (o
    `notificacoes-interessados` rodava sem recorte e avisou uma rede [sim] na
    F51). Prova: `e2e/estoque-minimo-no-sino.spec.ts`,
    `e2e/notificacoes-interessados.spec.ts`.
  - **O giro do Estoque diz o que conta** (A13 da 9ª, 2026-11-07): "insumos
    dos atendimentos, sem a venda de produto" (`DETALHE_DO_GIRO`,
    `[data-kpi="giro"]`, nas duas telas) — o Financeiro somava o custo da
    revenda em "Insumos e produtos" (R$ 288 × R$ 243) e parecia não bater. A
    conta não mudou (`metrics_giro_estoque`, `indicadores.md`). Prova: o mesmo
    spec ("A13").
  - **O lote vencendo aparece no dashboard** (A41 da 7ª, 2026-11-05: só no
    Estoque): quem tem o Estoque vê "Lotes vencendo em 30 dias" no dashboard da
    rede e no da unidade (`[data-lotes-vencendo]`, `LotesVencendo`), com o
    produto, o lote, a validade e o que sobra, e "Ver" leva ao Estoque. A conta
    é a do cartão "Validade em 30 dias" (`lotesVencendoDoRecorte`, sobre
    `lotesComSaldo` + `lotesVencendo`). Prova: o mesmo spec ("A41").
  - **Sem produto nenhum, a tela diz isso** (A2 da 6ª simulação,
    2026-11-04): "Nenhum produto cadastrado", que os insumos vêm antes dos
    procedimentos que os usam, e o "Novo produto" ali mesmo
    (`[data-estoque-vazio]`); "Ajuste os filtros" fica para a busca que não
    achou. O do cabeçalho só aparece com produto cadastrado: um "Novo
    produto" na tela, não dois primários iguais (a completa de 2026-11-04).
    Prova: `e2e/estoque-vazio.spec.ts`.
  - **Sem estoque é não ter saldo POSITIVO no recorte** (D10 da 6ª
    simulação, 2026-11-04; princípio 3): o saldo NEGATIVO (a baixa que
    faltou, §10) e o produto ativo sem NENHUMA linha de saldo na unidade
    (nunca entrou nada) contam. A conta por produto é UMA,
    `semEstoqueNoRecorte`/`contarSituacoes` (`lib/estoque/situacao.ts`): os
    cartões "Sem estoque"/"Estoque baixo" das duas telas de estoque e o cartão
    do dashboard da rede ("Produtos zerados", que deixa de dizer "Saudável");
    Relatórios → Estoque conta `current_stock <= 0` sobre cada produto ativo ×
    cada unidade ativa do recorte (`metrics_relatorio`, migration
    `20261104002102`). Era `= 0` sobre as linhas que existiam: o Gel em −1 un
    e a luva sem entrada não contavam. Prova:
    `e2e/estoque-negativo-e-sem-saldo.spec.ts`.
    **E é UMA conta de PRODUTOS em todo lugar** (D19 da 8ª simulação,
    2026-11-06; decidido pelo princípio 3): Relatórios → Estoque contava pares
    unidade × produto e dizia "Itens zerados 1" (o Hidratante × Água Verde)
    enquanto o Estoque da rede dizia "Sem estoque 0" (ele tem saldo no
    Batel). O total de `zerados` de `metrics_relatorio` passou a ser os
    PRODUTOS ativos sem saldo positivo em nenhuma unidade do recorte (migration
    `20261106003406`), a conta de `contarSituacoes`; a linha de cada unidade
    ("Saúde do Estoque por Unidade") continua os produtos sem saldo NELA. A
    tela diz qual é: "Produtos zerados — sem saldo em nenhuma unidade do
    recorte" nos Relatórios, e "SEM ESTOQUE — produtos sem saldo em nenhuma
    unidade" (ou "nesta unidade", com o filtro) no Estoque. Prova:
    `e2e/estoque-zerados-uma-conta.spec.ts`.
- **Movimentação de estoque NUNCA gera despesa** (D13 revisto, decisão do
  Heitor, 2026-10-28: "tanto entrada quanto saída, não gera despesa. Os
  valores são informados apenas para base de cálculo de insumos, custo,
  margem e lucro"). Nenhuma porta — a "Entrada" (unidade e rede), o estoque
  inicial do cadastro do produto, a entrada por código de barras, o Copilot,
  o ajuste/perda, a transferência, o consumo do atendimento — cria
  `financial_transactions`; o custo informado fica no movimento
  (`unit_cost`, a base do custo de consumo, do giro e da margem). A compra
  que a clínica PAGOU, se ela quiser no financeiro, é um lançamento manual
  (Financeiro → Novo lançamento, categoria "Compra de estoque": conta no caixa e
  fica FORA do lucro, que já desconta o insumo consumido — 2026-10-29,
  `indicadores.md`). **A Entrada DIZ isso, e guarda o fornecedor e a nota**
  (A37 da 10ª, 2026-11-10: a Perda dizia "não gera despesa" e a Entrada não; o
  fornecedor e a nota iam nas Observações): "Não gera despesa: o custo é a
  base…" (`[data-entrada-sem-despesa]`) e os campos "Marca" e "Fornecedor"
  (das listas da rede, Bloco Estoque, abaixo) e "Nota fiscal", gravados no movimento
  (`stock_movements.fornecedor`/`nota_fiscal`, `estoque_entrada` de 10
  argumentos — a de 8 chama ela; migration `20261110005101`) e mostrados no
  Histórico ("NF 004630 · Distribuidora Sul"). Prova:
  `e2e/estoque-uso-da-10.spec.ts` ("A37"). Por 28/10 a Entrada e o cadastro tiveram
  "Lançar o custo como despesa paga hoje" (`estoque_compra`, 1b54c531): saiu
  (migrations `20261028000801`/`802`; `estoque_inicial` perdeu
  `p_despesa`). Prova: `e2e/estoque-nunca-gera-despesa.spec.ts`.
- **O estoque inicial do cadastro do produto, na rede de duas ou mais
  unidades, nasce sem unidade** (sobra da F33 da 8ª simulação, 2026-11-06;
  princípio 3): "Unidade que recebe o estoque" vinha na primeira em ordem
  alfabética; agora "Selecione a unidade…" (`unidadeInicial`,
  `lib/unidades/unidade-inicial.ts`). Prova: `tests/agenda-sobras-da-f33.test.ts`.
  **No Estoque da UNIDADE, o estoque inicial entra nela, e nada fica pela
  metade** (D8 da 9ª simulação, 2026-11-07; princípio 3): a Carolina (da rede)
  criou o produto pelo Estoque da Menino Deus com "Adicionar estoque inicial",
  sem seletor, e só o estoque foi recusado — o produto ficou (OUT-001, 0 un) e
  repetir criou o OUT-002. O modal da unidade recebe a própria unidade (o
  cabeçalho e o vazio), e `createProduct` confere a unidade ANTES de o produto
  nascer; se o `estoque_inicial` falha, o produto recém-criado sai (sem
  movimento). **O nome repetido pergunta, sem recusar** (A6; princípio 2):
  "Já existe o produto “Manta” (OUT-001). Cadastrar outro com o mesmo nome?"
  com "Cadastrar mesmo assim" (`_nomeRepetido=sim`, `[data-nome-repetido]`), e o
  seletor de insumo diz o SKU (o cadastro do procedimento e o "Adicionar
  insumo" do atendimento). Prova: `e2e/estoque-unidade-da-9.spec.ts`.

**Decididas no levantamento das regras** (o Heitor, 2026-11-11; a correção
indicada é a do consolidado do levantamento):
- **Categorias, marcas e fornecedores** (Bloco Estoque do plano de adaptação,
  `docs/revisao.md`, 2026-11-14 — o Heitor, 13/11):
  - **Três cadastros de texto livre da rede** (E1/E5): "Hoje o que é chamado
    de fornecedor vira marca. Adiciona cadastro de fornecedor, igual ao de
    marca." Tabelas `product_categories`, `marcas` e `fornecedores`
    (migration `20261114500101`; o nome é único na rede sem caixa nem
    espaços, `chave_do_nome`). As três janelas — **Categorias**, **Marcas** e
    **Fornecedores** — ficam lado a lado no cabeçalho do Estoque, nos dois
    portais (`CadastroDoEstoque`, `components/admin/cadastro-do-estoque.tsx`).
  - **Criar, renomear, excluir: quem tem o Estoque em Gerenciar, e só isso**
    (E4/E5: "é só quem tem permissão de gerenciar, mesma regra para
    categoria, marca e fornecedor"). Ser da rede deixou de contar — a
    `recusaDaConfigDaClinica` saiu dessas gravações (era a C71 e a D4/C76).
    Uma action para as três listas: `criarItemDoEstoque`,
    `renomearItemDoEstoque`, `excluirItemDoEstoque` (`actions/stock.ts`); a
    sessão só LÊ (`marcas_select`), o servidor grava. Renomear a categoria
    leva o nome aos produtos (o SKU não muda). **Excluir é excluir** (não há
    mais "arquivar"): o produto da categoria fica sem categoria, e a entrada
    da marca ou do fornecedor guarda o NOME que tinha — a ligação vira nula
    (`on delete set null`), o Histórico continua dizendo de onde veio, e o
    item sai do filtro. Renomear também mantém o nome já gravado nas entradas.
  - **Lista e campo de busca com autocomplete** (E6/E3: "Categoria, marca e
    fornecedor com lista e campo de busca com autocomplete"): o
    `CampoDaLista` (`components/admin/campo-da-lista.tsx`, no desenho do
    "Indicada por"): escreve parte do nome (sem acento conta), escolhe da
    lista; o que não existe se cria ali mesmo ("+ Nova marca “…”"), sem
    sair do formulário — só quem tem Gerenciar chega a esses formulários. É
    o campo da categoria no cadastro do produto e da marca e do fornecedor no
    estoque inicial e na Entrada (também a do leitor de código de barras).
  - **O produto não tem marca nem fornecedor** (E10: "Não existe fornecedor
    de costume. Na entrada no estoque, escolhe fornecedor e marca."):
    `products.supplier`, `products.fornecedor_id` e o gatilho do produto
    saíram (destrutivo, autorizado pelo Heitor; nada migrou — o banco será
    zerado).
  - **Toda entrada escolhe a marca e o fornecedor** (E14), opcionais
    (princípio 7): a Entrada manual, o leitor, o estoque inicial
    (`estoque_inicial` de 12 argumentos) e o Copilot (`marca` e `fornecedor`
    em texto). `stock_movements.marca_id`/`marca` ao lado de
    `fornecedor_id`/`fornecedor`; o gatilho
    `private.marca_e_fornecedor_da_lista` resolve o texto na lista (o mesmo
    nome sem caixa nem espaços é o mesmo; o novo entra) e confere que o id
    escolhido é da rede; `estoque_entrada` de 11 argumentos (`p_marca`; a de
    10 e a de 8 chamam ela). O Histórico e a linha do lote dizem "NF … ·
    marca · fornecedor". A Entrada vem com o fornecedor da nota trazida da
    entrada anterior (A54 da 11ª).
  - **Os três filtros** (E15: "Garanta que existam os 3 filtros: categorias,
    marca, fornecedores"), sempre à vista ao lado da busca: "Filtrar por
    categoria", "Filtrar por marca", "Filtrar por fornecedor". Marca e
    fornecedor mostram "os produtos que tem alguma entrada dessa
    marca/fornecedor": a entrada (PURCHASE) não desfeita, somada no banco
    (`estoque_marcas_e_fornecedores_dos_produtos`,
    `marcasEFornecedoresDosProdutos`).
  - Prova: `e2e/estoque-marcas-e-fornecedores.spec.ts`.
  - **Fora deste bloco**: E11 e E13 dependem do bloco Equipe ("a pessoa em
    mais de uma unidade") e ficaram para depois dele (`docs/revisao.md`).
  - Antes (F66/F74, para a história): a D4/C76 fez dos fornecedores uma lista
    da rede com o "fornecedor de costume" no produto, o "arquivar" e a
    janela só para quem é da rede (A12 da 14ª); a A14 da 14ª distinguia
    "de costume" × "desta entrada" (`CampoFornecedor`, que saiu). A linha do
    lote que mostra a nota e o fornecedor da compra (`lotesComSaldo`) fica.
- **O que a 14ª simulação corrigiu no Estoque** (F74, 2026-11-13):
  - O botão da linha diz **"Entrada e perda"** (A12; era uma engrenagem sem
    texto). A janela segue "Gerenciar estoque" (o `title` do botão também).
  - **A perda sem "Desfazer perda" diz por quê** (A13, princípio 3): só a
    mais nova de cada unidade se desfaz (C69), e as outras dizem "desfaça
    antes as mais novas desta unidade" (`perdaSemDesfazer`, de
    `getProductMovements`; `[data-sem-desfazer]`).
  - **O mínimo herdado do cadastro diz "(do cadastro)"** (A15, princípio 3):
    "5 seringas (do cadastro)" quando o mínimo da unidade é igual ao do
    produto (e maior que zero); o da unidade, sem a marca. Uma regra só,
    `minimoEhDoCadastro` + `rotuloDoMinimo` (`lib/estoque/situacao.ts`), em
    todo lugar que escreve o mínimo: a linha e a linha aberta do Estoque, a
    aba "Estoque mínimo" ("O mesmo do cadastro do produto"), os quadros dos
    dois dashboards, o aviso do sino e o Copilot. Trava:
    `tests/configuracoes-e-menu-da-14.test.ts` (nenhum
    `formatarQuantidadeComUnidade(minimoParaMostrar(` fora dela).
  - **A unidade filtrada vem marcada** (A16, princípio 7): com `?unidade=`, a
    Entrada (se ativa), o Ajuste e a Perda já vêm com ela, também na entrada
    pelo leitor (`unidadeSugerida`, `admin-stock-manage-modal.tsx`).
  - Prova: `e2e/estoque-atritos-da-14.spec.ts`.
- **O produto desativado com saldo (D1; princípios 3 e 2).** Continua no
  valor em estoque enquanto houver saldo — o frasco está lá —, a linha diz
  "Inativo", e desativar avisa quanto fica no estoque e no valor, sem
  recusar. (C22 — feito na F66 na LISTA: `produtosDoEstoque`,
  `lib/estoque/produtos-da-tela.ts`, em páginas, com o selo "Inativo"
  `[data-produto-inativo]`; na unidade, só onde ela tem saldo. O aviso ao
  desativar fica para quando a tela tiver o desativar: hoje nenhuma tela viva
  desativa produto — o `AdminProductTable` que o fazia, sem uso, saiu no
  Bloco Estoque, 2026-11-14.)
- **Quem tem o Estoque em Ver vê o Valor e o Giro nos DOIS portais (D2;
  telas iguais nos dois portais, CLAUDE.md §6).** Quem não deve ver custo não
  recebe o módulo (princípio 1). (Feito na F66: os cartões e a coluna VALOR
  nos dois portais; o total da rede soma as unidades das linhas — desde a
  F72, as ativas E a desativada que ainda tem saldo, com o selo "Unidade
  desativada" (H6 + princípio 3; era "só as ATIVAS" na F66, e fechar a
  Pampulha tirava R$ 894,80 do total sem nada ter saído). A desativada não
  recebe entrada nem transferência; transferir DELA, ajustar e a perda
  continuam — `plataforma.md`, H6.)
- **O uso dos produtos antigos (est-01) não tem mais efeito (D3):** o wipe
  total de 02/11 apagou os produtos antigos. O produto novo continua nascendo
  Insumo.
- **O estoque inicial não gera despesa (D5)** — já decidido pelo Heitor em
  29/10; o estoque inicial, o leitor e o Copilot são caminhos irmãos da
  Entrada e dizem "Não gera despesa" como ela.
- **A perda ganha "Desfazer perda" (H12, opção a; simétrico ao A38 e à D5 da
  11ª, e pelo princípio 3 as Perdas ficam só com o que se perdeu de fato).**
  No Histórico, a última perda de um produto tem "Desfazer perda", com motivo
  obrigatório: a quantidade volta ao MESMO lote de onde saiu, o movimento
  fica (nada se apaga) e a perda sai de `metrics_perdas`. Mesma permissão do
  "Desfazer ajuste" (Estoque em Gerenciar, a unidade ao alcance). (C69 —
  feito na F66: `estoque_desfazer_perda`, a action `desfazerPerdaDeEstoque`;
  o Histórico mostra "Perda desfeita" e o botão só na última perda não
  desfeita de cada unidade, `perdaDesfazivel`. Prova:
  `e2e/estoque-movimentos-f66.spec.ts` ("C69").)

**Corrigidas na F66** (2026-11-12, levantamento das regras):
- **Editar o produto não mexe no custo** (C17): o custo vem das entradas;
  `updateProduct` não grava `cost_price`, e o formulário abre com o mínimo
  do CADASTRO. A categoria tem de ser da rede e o mínimo não é negativo
  (C24). Prova: `e2e/estoque-cadastro-f66.spec.ts`.
- **A transferência confere o RENDIMENTO** (C18): 2 frascos de 1,5 (150 UI)
  são recusados — "Disponível: 1,5 frasco (o frasco aberto conta pelo que
  sobra nele)" —, e a janela diz o disponível pela prateleira. Era a conta
  nas embalagens arredondadas, e o destino ganhava o que não existia.
- **A perda e a venda saem ao custo DO LOTE** (C20, `custo_do_lote`, que
  acha também o lote do ajuste positivo); o que nenhum lote cobre, ao último
  custo.
- **O leitor de código de barras ACHA o produto e abre a mesma Entrada**
  (C16): em embalagens, com lote, validade (a vencida avisa), fornecedor da
  lista, nota, "Não gera despesa" e "Saldo agora: 1 frasco fechado + 1
  aberto com 50 UI" (`saldoAgoraEmTexto`). O estoque inicial do cadastro
  também diz "Não gera despesa", avisa a validade vencida e grava fornecedor e
  nota (`estoque_inicial` de 11 argumentos; de 12, com a marca, desde o Bloco Estoque). O Copilot é o quarto caminho
  irmão (`copilot.md`).
- **A lista em páginas, o Histórico de 80 em 80** (C26): `lerTodas` nos
  produtos (cortava em 1000); "Ver mais antigas" no Histórico; a tela da
  unidade assina só `stock_movements`.
- **As "Validades próximas" dos Relatórios são os lotes do recorte** (C19):
  `lotesVencendoDoRecorte`, a conta do cartão do Estoque — lia os da rede
  inteira, em UTC.
- **O aviso do lote** (C25): o vencido diz "venceu em", a medida no plural,
  com o produto, e o lote é REIVINDICADO antes do aviso
  (`vencimento_avisado_em`) — duas passagens do cron avisavam duas vezes.
  Prova: `e2e/estoque-lote-vencendo-no-sino.spec.ts` ("C25").
- O "críticos" de `metrics_relatorio` conta PRODUTOS pela régua da tela (o
  rendimento contra o mínimo × o que a embalagem rende).

---

## 10. Fluxo de conclusão de atendimento

**É UMA transação** (desde 2026-09-28). `finishSession` CALCULA — a regra de
comissão aplicada, os pontos, a baixa de cada insumo (com rendimento e o
arredondamento das embalagens) — e a função `concluir_atendimento` (migration
`20260928000003`) GRAVA tudo de uma vez. Nenhuma regra de negócio no banco: ela
recebe os números prontos. É o desenho do estorno (`estornar_transacao`).

**Só se conclui o que foi iniciado** (H5 do levantamento das regras, o
Heitor, 2026-11-11, opção a; princípio 3, a tela já só oferece "Finalizar" a
partir de "Em atendimento", e princípio 5, a execução precisa ter
acontecido). `finishSession`, `concluir_atendimento` e `completeAppointment`
recusam Agendado, Confirmado e Chegou — pelo id também, para que o termo do
início, a pergunta do horário adiantado e a trava dos termos que bloqueiam
não sejam puladas. A profissional que esqueceu de iniciar clica Iniciar e
depois Finalizar (C13, F65): `finishSession` recusa o que não está Em
atendimento ("Só se conclui o atendimento que foi iniciado…"), a função
`concluir_atendimento` confere de novo com o agendamento travado (migration
`20261112006501`), e o "Concluído" da agenda (`completeAppointment`) só
aceita o que o fechamento já concluiu — ele não muda a situação nem grava o
prontuário, só lança a conta a receber. O concluído não volta: o gatilho do
banco recusa sair de Concluído. Prova: `e2e/agenda-guardas-de-status.spec.ts`.

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
- A **receita não nasce no fechamento**: é `confirmPayment`, pela comanda do
  PDV (`docs/regras/vendas-financeiro.md`, "O PDV e as comandas"), que a
  lança já paga. A comanda nasce ao INICIAR o atendimento, e pagar antes ou
  depois de concluir é só a ordem do trabalho (PDV-P4, 2026-11-13). Marcar "Concluído" na agenda (`completeAppointment`) exige o
  fechamento feito e só lança a conta a receber, se faltar — repetir é seguro.
  O de **R$ 0 não tem o que receber** (D9, 2026-10-27): nem conta a receber,
  nem "aguardando pagamento" — a tela diz "Sem cobrança". O concluído a
  receber aparece na agenda, no Fechamento do dia e na ficha (§9.6).
- **A comanda do atendimento leva produto de Venda direta** (PDV2, fase 5b
  do plano de adaptação, 2026-11-14): "Acrescentar produto" na comanda, no
  PDV, com a quantidade; o total da comanda passa a ser o atendimento + os
  produtos, e é sobre ele que valem os pontos e o voucher (`confirmPayment` e
  `previaDoPagamento` somam `valorDosItensDoAtendimento`). Os produtos se
  vendem DENTRO de `confirmar_pagamento_do_atendimento` (a mesma transação,
  a mesma forma, a baixa pelos lotes de `produto_vender_itens`); o insumo do
  atendimento (abaixo) é outra coisa e não passa por aí. Com produto
  pendente, o atendimento não se abate de pacote. Regra em
  `vendas-financeiro.md`, "O produto na comanda do atendimento"; prova:
  `e2e/pdv-comanda-varios-itens-e-pontos.spec.ts`.
- **O insumo usado hoje se lança na tela do atendimento, em todo formato
  dela** (2026-10-20): o cartão "Insumos utilizados" (os do cadastro do
  procedimento, marcados, mais o "Adicionar insumo") aparece também no
  formulário da avaliação — o atendimento avulso abre nele, e sem o cartão a
  profissional lançava o insumo no editor do PLANO, que nunca baixa. O insumo
  adicionado entra MARCADO (só o marcado baixa). A lista de produtos é cache
  (`products:<rede>`): criar, editar e ativar produto o expiram com
  `revalidateTag(tag, { expire: 0 })` — com `'max'` o produto novo não
  aparecia na próxima tela. Prova: `e2e/atendimento-fechamento.spec.ts`.
  **A busca que não acha diz por quê** (A38 da 7ª simulação, 2026-11-05: numa
  rede sem produtos a busca do "Adicionar insumo" voltava vazia, calada): sem
  insumo cadastrado, "Nenhum produto cadastrado como insumo nesta clínica…",
  com o link do Estoque (Novo produto, uso "Insumo"); sem resultado para o
  texto, "Nenhum insumo com “x”" (`[data-busca-de-insumo-vazia]`). Prova:
  `e2e/atendimento-atritos-da-7.spec.ts` ("A38").
- **O rascunho da anamnese sobrevive ao recarregar NA MESMA ABA** (A36 da 7ª,
  conferido em 2026-11-05: não reproduzido — o robô recarregou num contexto
  novo, e o rascunho morre com a aba por decisão). Prova:
  `e2e/atendimento-finalizar-grava-tudo.spec.ts` ("recarregar"),
  `e2e/atendimento-alergia-sim-nao.spec.ts`. **E a tela DIZ isso** (A26 da
  8ª simulação, 2026-11-06; a regra fica): em andamento, para quem escreve no
  prontuário, "A anamnese, a evolução e a ficha digitadas ficam guardadas só
  nesta aba até o “Finalizar atendimento”: recarregar mantém; fechar a aba
  ou abrir em outro aparelho, não." (`[data-aviso-do-rascunho]`). Prova:
  `e2e/atendimento-atritos-da-8.spec.ts` ("A26").
- **A desistência no meio registra a intercorrência e baixa o insumo já
  aplicado** (A27 da 8ª simulação, 2026-11-06): o "Cancelar" do atendimento
  EM ANDAMENTO só pedia o motivo — a cliente passou mal depois da aplicação, e
  nem o prontuário nem o estoque ficavam sabendo. Para quem escreve no
  prontuário, a janela tem "Intercorrência (opcional)" e "Baixar do estoque o
  que já foi aplicado: …" (os insumos MARCADOS na tela). Uma transação,
  `desistir_do_atendimento` (migration `20261106003701`): o agendamento
  travado e em andamento, cancelado com o motivo e o histórico, a
  intercorrência na entrada do prontuário do atendimento (a aba Prontuário a
  lista, `buildRecordForms`) e cada insumo pela MESMA conta da conclusão
  (`montarInsumosDaBaixa`, `lib/atendimento/insumos-da-baixa.ts`, com
  `estoque_conferir_lido`/PT409 e `comNovaTentativa`). Sem comissão, sem
  sessão de pacote usada nem pré-pago: não houve conclusão — o
  `pre_pago_libera` devolve à cliente o que estava pago, como em todo
  cancelamento. Pede o Prontuário em Gerenciar (como concluir) e a agenda "só
  os meus" vale pelo id. Sem nada marcado, é o cancelar de sempre. Prova:
  `e2e/atendimento-atritos-da-8.spec.ts` ("A27"). **E a tela do cancelado
  mostra a intercorrência** (A25 da 9ª, 2026-11-07): ia ao prontuário e não
  aparecia no atendimento cancelado — agora "Intercorrência: …" abaixo do
  motivo (`[data-intercorrencia-do-cancelado]`), só a quem vê o prontuário.
  Prova: `e2e/atendimento-atritos-da-9.spec.ts` ("A25").
- **O insumo diz de qual lote sai** (A11 da 9ª simulação, 2026-11-07): o FEFO
  estava certo, mas só o Estoque dizia de qual frasco saiu. No cartão "Insumos
  utilizados", o marcado diz "Sai do lote TOX-A1 (vence 26/11/2026)" — ou,
  passando de um lote ao outro, "…: 100 U; e do lote TOX-B2 (…): 20 U", e o
  que nenhum lote cobre, "N U sem lote" (`[data-lote-do-insumo]`). É a MESMA
  ordem do gatilho (`lotesDaBaixa`, `lib/estoque/fefo.ts`, puro: os vencidos
  por último, o que vence primeiro, o sem validade depois, o que chegou antes)
  sobre os lotes com saldo da unidade; a baixa continua do gatilho (a regra
  fica, a tela não escolhe o lote). Concluído (ou desistido com baixa), "Saiu
  do lote …", da ligação que houve (`stock_movement_batches`). Prova:
  `e2e/atendimento-atritos-da-9.spec.ts` ("A11"), `tests/estoque-fefo-da-baixa.test.ts`.
- **CONCLUÍDO, a tela mostra os insumos da BAIXA** (D9 da 6ª simulação,
  2026-11-04; princípio 3): o `PROCEDURE_USAGE` do atendimento, somado por
  produto, na unidade do movimento (`app/_shared/sessao-de-atendimento.tsx`).
  Era o cadastro do procedimento (ou a sessão do plano): o insumo acrescentado
  na hora sumia — "Nenhum insumo registrado" com a baixa no banco — e o do
  cadastro que não foi usado aparecia. Prova:
  `e2e/atendimento-concluido-mostra-a-baixa.spec.ts`. A quantidade sai em
  pt-BR ("0,2 un" — era "0.2 un", A19 da 10ª); prova:
  `e2e/atendimento-uso-da-10.spec.ts` ("A19").
- **O "Finalizar" leva a evolução que está NA TELA**: o modal abre com o que a
  profissional escreveu na página (avaliação ou ficha), não com o gravado —
  sem "Salvar" antes, a evolução se perdia (simulação de 2026-10-20).
  **O campo se chama "Evolução" em toda a tela** (A42 da 5ª simulação: era
  "Anotações clínicas" na avaliação, "O que foi realizado" no formulário de
  sempre e "Observações finais" na janela de concluir — o mesmo
  `medical_record_entries.notes`), o nome da aba Prontuário, com o rótulo
  ligado ao campo. Prova: `e2e/atendimento-campos-da-tela.spec.ts`.
  **A janela do "Finalizar" não repete o que está na tela** (A29 da 8ª
  simulação, 2026-11-06): a Evolução e as Intercorrências já escritas vinham
  de novo como campos. Escritas na tela, a janela as MOSTRA (o que vai ao
  prontuário, `[data-evolucao-da-tela]`) — para mudar, é na tela; em branco,
  o campo aparece para escrever ali. Prova:
  `e2e/atendimento-atritos-da-8.spec.ts` ("A29"),
  `e2e/atendimento-plano-gerado-mantem-a-sessao.spec.ts`.
  **E é UM estado só na tela** (D8 e A29 da 6ª simulação, 2026-11-04;
  princípio 3): o formulário da avaliação e o de sempre (o do plano gerado)
  tinham dois estados para o mesmo campo, e depois de "Gerar plano e enviar à
  recepção" a tela trocava para o segundo — Evolução e Intercorrências vazias,
  sem o cartão "Insumos utilizados" —, e o "Finalizar" levava o vazio. Agora
  o que se escreveu continua, o cartão de insumos fica no ramo do plano gerado
  até concluir, e o rascunho guarda um campo só (o de antes, com dois, vale
  pelo que tem texto). **A conclusão nunca troca a evolução gravada por
  vazio**: `concluir_atendimento` mantém a evolução e a intercorrência que já
  estavam no prontuário quando a da conclusão vem em branco (migration
  `20261104002103`). Prova: `e2e/atendimento-plano-gerado-mantem-a-sessao.spec.ts`.
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
  - **A tela aponta TODAS de uma vez** (A30 da 6ª simulação, 2026-11-04;
    era uma por clique): cada obrigatória vazia — da anamnese e da ficha —
    fica marcada com a mensagem junto dela, e a tela rola até a PRIMEIRA da
    página (a anamnese antes da ficha), com o foco (`validar()` do
    `AnamnesisFormRenderer`, `obrigatoriasVazias` em `lib/anamnesis.ts`; com
    a anamnese só para ler, o cartão abre para editar e marca). O "Finalizar"
    abre a janela "Faltam N respostas obrigatórias" (`[data-o-que-falta]`),
    com a lista inteira por lugar ("Na anamnese", "Na ficha do
    procedimento") e "Responder agora" — SEM o "Confirmar conclusão". O
    gerar plano diz a mesma lista na frase do erro.
  - **O servidor recusa** (`oQueFaltaParaSeguir`,
    `lib/atendimento/obrigatorias-no-servidor.ts`) em `finishSession` e em
    `generateEvaluationPlan` — a trava não é só do navegador. A conta é UMA,
    pura (`campoVazio`/`primeiraObrigatoriaVazia` em `lib/anamnesis.ts`,
    `faltaNaAnamnese`/`faltaNaFichaDoProcedimento` em
    `lib/atendimento/obrigatorias.ts`): a tela e o servidor usam a mesma.
    **E a gravação confere de novo** (atend-04, revisão do Heitor de
    2026-11-02: "regras de negócio devem ser sempre validadas em backend";
    migration `20261101001002`): `concluir_atendimento` e
    `gerar_plano_da_avaliacao` chamam `private.obrigatoria_que_falta` — a
    mesma conta em SQL (`ficha_campo_vazio`, `ficha_campo_visivel`,
    `ficha_primeira_obrigatoria_vazia`) e a MESMA mensagem — e recusam
    (`check_violation`) a obrigatória em branco, para valer em qualquer
    caminho que não passe pela action. O app manda `sem_injetaveis` no
    `p_dados` (sem ele, o planejador conta). Mudou a conta de um lado, muda
    do outro.
  - **Vale o que FICA gravado**: a anamnese que a tela manda gravar
    (`anamneseDaEquipeParaGravar`), senão a gravada — a que a cliente
    respondeu pelo app ou pelo link vale, e a obrigatória só falta quando não
    tem resposta em lugar nenhum; a ficha da tela, senão a salva antes. As
    perguntas são as da ficha ATUAL (a de pré-atendimento da rede; a ligada ao
    procedimento). Resposta antiga, fora da validade da rede, ainda conta como
    resposta — **mas a tela AVISA** (atend-05, revisão do Heitor de
    2026-11-02: "mantém como está mas com aviso de que a ficha de saúde está
    vencida"): "A ficha de saúde de Carla está vencida (respondida em
    05/03/2026). Ela continua valendo; peça a atualização."
    (`[data-ficha-vencida]`, só para quem vê o prontuário). A conta é a do
    gatilho do envio (`fichaDeSaudeVencida`, `lib/pre-atendimento/validade.ts`:
    respondida há `pre_atendimento_validade_meses` ou mais). O texto não diz
    "da"/"do": nada decide pelo nome. Prova: `e2e/atendimento-campos-da-tela.spec.ts`,
    `tests/ficha-de-saude-vencida.test.ts`.
  - Sem ficha ligada ao procedimento, ou ficha sem obrigatória, nada barra.
    A foto e o planejador ficam fora da anamnese (a cliente responde pelo
    celular); o planejador da ficha, na rede sem o recurso de injetáveis (o
    campo é só para ver), não barra. O planejamento escolhido vale mesmo sem
    ponto, com a confirmação do atend-12 (§9.4).
  - **Quem não vê o clínico** (prontuário "só os meus" num atendimento de
    outra, com a agenda de todas): a tela não tem os campos e não aponta nada;
    o servidor recusa do mesmo jeito, com só o NOME da pergunta na mensagem.
    Quem responde é quem atende. A recepção não conclui (concluir pede
    `medical_records: MANAGE`), então não é barrada por isto — **e não recebe
    a anamnese para responder** (A31 da 6ª simulação, 2026-11-04): sem o
    prontuário a anamnese nem é lida, e o formulário da avaliação mostrava à
    recepção a ficha inteira em branco ("pediu de novo a anamnese da Márcia"
    enquanto a profissional via "Anamnese revisada"). A anamnese, nos dois
    formulários, só aparece com `canViewRecords`.
  - Prova: `e2e/atendimento-obrigatorias-barram.spec.ts`,
    `tests/obrigatorias-do-atendimento.test.ts`; a da gravação,
    `e2e/atendimento-obrigatorias-barram.spec.ts` ("atend-04", "A30", "A31"). Spec que
    finaliza sem ser sobre isto responde a ficha de saúde antes
    (`responderAnamnese`, `e2e/apoio/anamnese.ts`) — também o que conclui
    pela FUNÇÃO (`responderAnamneseDoAgendamento`), que agora recusa.
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
- **Os dois botões do plano na avaliação** (o PDV, fase 3 — 2026-11-13):
  "Aceitar plano" (era o "Fechar agora": gera e ACEITA o plano, sem dinheiro;
  a comanda do plano vai ao PDV, onde a cliente assina o contrato e paga) e
  "Gerar plano · a cliente vai pensar" (era o "Gerar plano e enviar à
  recepção": o plano fica proposto). O plano proposto mostra "A cliente vai
  pensar" com o "Aceitar plano"; o aceito, "Plano aceito · R$ X" e o caminho
  ao PDV. Não há mais checkout do plano dentro do atendimento. Onde o texto
  abaixo diz "Fechar agora", "enviar à recepção" ou "checkout do plano", leia
  o aceite e o receber no PDV (`vendas-financeiro.md`, "A comanda do plano").
- **O botão é "Gerar plano e enviar à recepção"** (J-35, 2026-10-30): era
  "Enviar para a recepção" e, no atendimento avulso, parecia um segundo
  "concluir". Ele gera o plano; a tela diz que, sem plano, basta o "Finalizar
  atendimento". E a janela do "Finalizar" diz de onde vem o pagamento (J-40):
  sessão do plano, de pacote, pré-pago, sem cobrança — ou "O pagamento será
  confirmado pela recepção" no avulso com preço (dizia isso na sessão do plano
  já pago). Prova: `e2e/atendimento-textos-do-fechamento.spec.ts`.
- **Gerado o plano, a avaliação diz que falta finalizar** (A33 da 7ª simulação,
  2026-11-05; a regra fica: gerar o plano não conclui a avaliação, quem conclui
  é o "Finalizar"): a avaliação da Sophie ficou "Em atendimento" e nada dizia
  à Tânia o que faltava. Com o plano gerado e o atendimento ainda aberto, a
  tela diz "Falta finalizar a avaliação" e o caminho (`[data-falta-finalizar]`;
  a quem não conclui, quem conclui). **O plano é OPCIONAL na tela e o desconto
  é do checkout** (A37 e A34): o formulário da avaliação abre em todo
  atendimento avulso da rede que monta plano (a regra das fichas, §9.4), e a
  drenagem avulsa via "Dores do cliente" e "Tratamento / Nova sessão" sem saber
  que podia só finalizar — o cartão do plano diz "Opcional: monte só se for
  propor um plano…" (`[data-plano-opcional]`, `TreatmentPlanEditor opcional`)
  e as dores "pedidas só para gerar um plano"; o editor do plano diz "O
  desconto é dado no checkout do plano…" (`[data-desconto-no-checkout]`: a
  Tânia não tinha onde pôr os 10% da Sophie). Prova:
  `e2e/atendimento-atritos-da-7.spec.ts` ("A33", "A34 e A37").
- **Concluído, o formulário da avaliação fica bloqueado de verdade** (A30 da
  simulação de 2026-10-29): a evolução só se lê e a anamnese aparece como
  leitura — não em branco com as obrigatórias marcadas. Quem desbloqueia
  ("Editar registro") tem os campos de volta. **Desbloquear pede a Agenda E o
  Prontuário em Gerenciar** (`canReassign && canEditRecords`; A39 da 5ª
  simulação, 2026-11-01): o botão aparecia a quem não escreve no prontuário, e
  ao lado do texto "Apenas gerentes podem editar" — que contradizia o botão da
  profissional. O texto diz agora a regra ("use Editar registro" a quem pode;
  "pede a Agenda e o Prontuário em Gerenciar" a quem não). **O cancelado e a
  falta dizem o que são** (D11 da 8ª simulação, 2026-11-06; princípio 3):
  "Atendimento cancelado" / "A cliente não compareceu", que não houve
  atendimento e não há registro a editar — sem o "Editar registro", que é só
  do concluído (`textoDoRegistroTravado`, `lib/atendimento/registro-travado.ts`).
  Dizia "Atendimento concluído. Para corrigir, use…". Prova:
  `tests/registro-travado.test.ts`.
- **Gerar o plano (o "Fechar agora" e o "Gerar plano e enviar à recepção")
  pede o Prontuário em Gerenciar** (D9 da 5ª simulação, 2026-11-01): grava a
  avaliação no prontuário (`generateEvaluationPlan`). Com ele só em Ver, o
  cartão some inteiro, com a dica do J-35 — que mandava a um "Finalizar
  atendimento" que não existe para ela (o alto da tela já diz "Quem conclui é
  o profissional"). Prova: `e2e/permissoes-quem-so-ve.spec.ts`.
- **A avaliação concluída gera o plano** (revisão do Heitor, 2026-10-29: "é
  preciso avaliar primeiro pra depois decidir o que fazer"). O A30 tinha tirado
  o "Fechar agora" e o "Enviar para a recepção" porque gerar o plano regravava
  o registro fechado; os botões VOLTARAM, e gerar o plano ali grava SÓ o plano,
  ligado à avaliação (`evaluation_appointment_id`): as dores, a evolução, a
  ficha e a anamnese daquele dia ficam como estão — a tela não as manda e
  `gerar_plano_da_avaliacao` não as grava com o atendimento COMPLETED, nem
  desbloqueado. As obrigatórias SÃO conferidas de novo, no que ficou gravado
  (atend-04: a action e a função; era "já passaram no Finalizar" — e o
  caminho que concluiu sem passar por ele gerava o plano); as dores não são
  exigidas. A tela diz que o registro fica
  como está (`data-plano-da-avaliacao-concluida`) — e diz "Este atendimento está
  concluído", não "A avaliação" (A27 da 9ª simulação: a drenagem avulsa
  concluída se lia como avaliação; o formulário vale para todo avulso da rede
  que monta plano, e o texto não decide pelo procedimento —
  `textoDoPlanoDoConcluido`, `lib/plano-de-tratamento/textos.ts`; prova:
  `tests/textos-do-plano-da-9.test.ts`) —, e o Planejamento por cima
  volta a não oferecer "Novo plano" (o plano se monta na tela, A29). Prova:
  `e2e/atendimento-plano-da-avaliacao-concluida.spec.ts`.
- **As dores do cliente são do PRONTUÁRIO do atendimento**
  (`medical_record_entries.queixas`, migration `20261028000302`), não
  `appointments.notes` — que é a observação INTERNA do agendamento e
  aparecia como dor na tela (A17). A dor nasce vazia; a observação aparece
  à parte ("Observação do agendamento"). **Sem as dores, gerar o plano
  aponta o CAMPO** (A35 da 5ª simulação): rola até ele, foca, destaca e diz
  "Registre as dores/queixas do cliente." junto dele (`[data-campo="dores"]`)
  — antes de conferir as obrigatórias, que vêm depois na página; era só a
  frase acima do botão, no fim de uma página longa. O servidor continua
  recusando com a mesma frase. Prova: `e2e/atendimento-campos-da-tela.spec.ts`. As dores só vão à tela com
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
- **Não existe "Retorno em N dias"** (aut-04, decisão do Heitor, 2026-11-02:
  "não tem necessidade real de um 'retorno em x dias', isso é basicamente só
  um novo agendamento com motivo específico, não tem necessidade de ter uma
  regra de negócio para isso"). De 2026-10-30 a 11-02 (D-12) a conclusão
  pedia o retorno, o dashboard da unidade listava os "Retornos a marcar" e o
  cron `retornos` emitia `agendamento.retorno_vencendo`; saiu tudo
  (migration `20261101000701` tirou o retorno de `concluir_atendimento`).
  As colunas `appointments.retorno_em_dias`, `retorno_para`,
  `retorno_avisado_em` e a função `retornos_a_marcar` ficam, sem ninguém
  ler, até a limpeza `20261101000709` (drop, com confirmação humana). Quem
  quer a revisão marca um agendamento. Prova: `tests/sem-retorno-em-dias.test.ts`.
- **No celular, o "Finalizar atendimento" está sempre à vista** (D1 e A3 da
  10ª simulação, 2026-11-10; a clínica única, §1, e o app Android é o portal
  web): a linha de ações do topo media 744 px numa tela de 412, o "Finalizar"
  ficava fora dela sem rolagem (a dona só concluía com um clique por
  JavaScript), o título quebrava uma palavra por linha e o selo "Atendimento em
  andamento" encostava no cronômetro. O topo quebra linha (`.sessao-topo`: o
  título com a largura da tela, as ações embaixo) e, abaixo de 768 px, a ação
  principal do estado — Marcar chegada e iniciar, Check-in, Iniciar,
  Finalizar, Confirmar pagamento (`[data-acao-principal]`) — é uma barra presa
  no rodapé, com a barra de navegação do Android (`env(safe-area-inset-bottom)`)
  e um espaço no fim da página para não cobrir nada; o botão do Copilot sobe
  acima dela (`subidaDoBotaoDoCopilot`). No computador nada muda de lugar.
  Prova: `e2e/atendimento-atritos-da-10.spec.ts` ("D1 e A3": clica no
  "Finalizar" de verdade, no alto e no fim da página),
  `tests/copilot-sobe-no-atendimento.test.ts`. **E o texto diz onde ele está**
  (A31 da 11ª simulação, 2026-11-10; princípio 3: o celular lia "use
  “Finalizar atendimento”, no alto da tela" com o botão no rodapé): "no alto
  da tela" no computador, "na barra do rodapé" no celular, pela mesma largura
  da barra (`OndeEstaOFinalizar`, as classes `.onde-no-computador` e
  `.onde-no-celular` do `globals.css`) — no "Falta finalizar a avaliação" e
  no "Sem plano a propor?". Prova: `e2e/atendimento-sobras-da-11.spec.ts`.
- **Insumo faltando NÃO impede o fechamento** — a cliente já foi atendida
  (decisão do Heitor, 2026-09-27). O saldo fica **negativo**, para a falta
  aparecer no estoque, e a tela mostra o que faltou.
- Sessão de **plano** e de **pacote** já foi paga em outro lugar:
  `confirmPayment` recusa as duas no servidor, e a tela esconde o botão. A do
  pacote TRAZIDO DE FORA (F35) não teve venda: a tela e a janela do
  "Finalizar" dizem "Sessão do pacote trazido de fora: já paga antes do
  sistema, nada a receber." (era "paga na venda do pacote" — A15 da 10ª;
  prova: `e2e/atendimento-uso-da-10.spec.ts`).
- Pontos: não são do fechamento — nascem quando o atendimento é PAGO (§9.2.2).

---

## O que nunca fazer aqui

❌ Pedir o catálogo do editor do plano sem a unidade do plano (procedimentosParaPlano com unidade nula) ou gravar sessões de plano sem recusaDosProcedimentosDoPlano (F73, D4 da 14ª; tests/catalogo-do-plano trava)

```
❌ Atualizar currentStock diretamente sem criar StockMovement
❌ Alterar price de um procedimento sem criar ProcedurePriceHistory
❌ Ler o preço de um procedimento para uma UNIDADE direto de procedures.price — é precoNaUnidade/comPrecoDaUnidade (lib/procedimentos/preco-na-unidade.ts; no banco, private.preco_na_unidade): o preço próprio da unidade vale (D2 da 9ª)
❌ Baixar lote no TypeScript (é o gatilho trg_lote_do_movimento; senão o próximo caminho esquece) — a tela só PREVÊ o lote pela mesma ordem (lotesDaBaixa, lib/estoque/fefo.ts); mudou a ordem do gatilho, muda a dela (A11 da 9ª)
❌ Gravar parte da conclusão do atendimento fora de concluir_atendimento (é uma transação só) — inclusive as dores, a anamnese e a ficha do procedimento do "Finalizar"
❌ Ramo da tela do atendimento sem a ficha própria do procedimento (o avulso da rede que monta plano ficou sem ela de 2026-09-25 a 2026-10-29)
❌ Concluir o atendimento ou gerar o plano da avaliação sem oQueFaltaParaSeguir (a obrigatória barra; a trava não é só da tela)
❌ Recriar concluir_atendimento ou gerar_plano_da_avaliacao sem a chamada a private.obrigatoria_que_falta (atend-04), ou mudar a conta das obrigatórias só no TypeScript (o SQL é o espelho)
❌ Decidir "campo vazio" por conta própria (é campoVazio/primeiraObrigatoriaVazia, lib/anamnesis.ts — a tela e o servidor dividem)
❌ Gravar o plano da avaliação (ficha, anamnese, plano, sessões, dores) fora de gerar_plano_da_avaliacao — é uma transação só, como a conclusão
❌ Gravar a ficha do procedimento com o form_id que veio do navegador (é a ficha ligada ao procedimento do agendamento, da rede: fichaParaConcluir)
❌ Gravar na ficha os pontos do planejador de injetáveis que vieram do navegador (o retrato é do planejamento gravado: retratarInjetaveis), ou um planejamento de outra cliente
❌ Um segundo planejador de injetáveis: o campo da ficha é o PlanejamentoInjetaveis de Planejamento → Injetáveis
❌ Exportar de actions/injectable-map.ts ('use server') uma regra de alcance do mapa — ela mora em lib/injetaveis/alcance.ts
❌ Inserir em injectable_applications fora de injetavel_registrar_aplicacao (uma por mapa por atendimento, com o mapa travado — D14 da 9ª)
❌ Trava de permissão (assertPermission/semAcesso) num LAYOUT fora do Suspense da página: vira HTTP 500 — o layout só passa a página, que trava por si (D17 da 9ª)
❌ Gravar as dores do cliente em appointments.notes (é a observação interna; as dores são medical_record_entries.queixas)
❌ Cancelar ou marcar falta num atendimento concluído — o que se desfaz é o pagamento (estorno)
❌ Mudar a situação do agendamento por update direto em vez dos núcleos (cancelarCore, startAppointment, a falta guardada pela situação): o Cancelado sem motivo, a Falta virando Cancelado e o "Em atendimento" que pulava o termo vinham daí (C10–C12, F65)
❌ Concluir (finishSession, concluir_atendimento, completeAppointment) o que não está Em atendimento, ou tirar um agendamento de Concluído (C13, F65)
❌ Oferecer ou aceitar no agendamento a profissional que não ATENDE na unidade, ou o procedimento que a unidade não FAZ — é conferirPecasDoAgendamento com o procedimento (F65, D7 da 13ª)
❌ Ler a unidade de um registro pela SESSÃO com .single() numa action — a unidade que a sessão não vê lança, e a tela cai em 500 (D5 da 13ª): servidor, maybeSingle, depois da rede e do alcance
❌ Deixar "Unificar" ou "Reativar a ficha" para quem não tem Clientes em Gerenciar — a resposta é "usar:<id>" (a ficha como está) ou cadastrar mesmo assim (C66)
❌ Calcular saldo de estoque depois de uma saída fora de lib/estoque/baixa.ts
❌ Criar agendamento sem procedure_id (a avaliação era a exceção e não existe mais)
❌ Gravar o agendamento do app da cliente fora de createAppointmentCore (por-05: uma regra só, a da agenda da clínica)
❌ Prender o portal da cliente à unidade de CADASTRO (clients.branch_id) — a ficha é da clínica: a unidade é a do endereço, entre as da rede
❌ Confundir a ficha do PROCEDIMENTO (forms/form_data) com a anamnese GERAL do cliente
❌ Action ou lista de ficha de procedimento sem .eq('tipo', 'PROCEDIMENTO') (edita e apaga a ficha de pré-atendimento)
❌ Gravar a anamnese geral fora de gravarAnamneseGeral (o pendente fica aberto e a cliente responde de novo)
❌ Ler general_anamnesis direto, sem paraAnamneseGeral (há dois formatos no banco)
❌ Dizer "respondida" (selo, "algo mudou?", janela de 30 dias) sem anamneseRespondida / respostas não vazias — a ficha gravada vazia não é respondida
❌ Aceitar a ficha da CLIENTE (app ou link) sem oQueFaltaNaFicha no servidor
❌ Gravar o token do link da ficha em texto (o que confere quem abre é o SHA-256; para mostrar de novo, só CIFRADO pelo cofre, com a chave fora do banco — A22 da 9ª), ou contar tentativas fora de pre_atendimento_link_abrir
❌ Action ou tela que recebe o id de um agendamento sem deOutroProfissional (a agenda "só os meus" vale pelo id, não só na lista) — na tela, "Este atendimento é de outra profissional" (AtendimentoDeOutraProfissional), nem 404 nem semAcesso() (o cargo libera; o atendimento é que não é dela)
❌ Botão que grava o prontuário (gerar o plano, "Editar registro") para quem não tem o Prontuário em Gerenciar (canEditRecords)
❌ Listar ou conferir "quem atende nesta unidade" com branch_id = unidade, ou com "a da rede atende em todas" — é a unidade marcada no "Atende" (atende_em, filtroDeQuemAtendeNaUnidade)
❌ Gravar users.atende_em ou provides_services sem passar pelo gatilho que os mantém juntos (atende_em_sincronizar), ou dar à unidade nova alguém marcado sozinho (princípio 6)
❌ Abrir a unidade inteira a quem só ATENDE nela (a Talita no Batel): o alcance é dos agendamentos DELA — alcancaOAgendamento, nunca crescer a abrangência
❌ Ler o nome da cliente ou do profissional de um registro da unidade por join da sessão (clients(name), users!professional_id(name)) — a cliente de outra unidade e o profissional da rede viram "—"; é nomesDosRegistros
❌ Conferir conflito de horário fora de horarioOcupado (lib/appointments/core.ts): a duração de CADA agendamento, e o profissional em qualquer unidade da rede
❌ Medir até quando um agendamento ocupa o horário fora de fimDaOcupacao (o concluído adiantado libera o resto — A31)
❌ Conferir se um agendamento bate num horário fora de bateNaOcupacao (o concluído antes de começar não ocupa nada — D3 da 11ª)
❌ Oferecer como livre (app da cliente, Copilot, CRM) um horário bloqueado — é computeAvailableSlots, que já tira o bloqueio; nem RECUSAR o encaixe da equipe no bloqueado (é aviso — princípio 2)
❌ Decidir na tela se um horário está livre pelo INÍCIO, ou sem os bloqueios — é ocupanteDoHorario / livresEntre (lib/agenda/horario-livre.ts), o intervalo inteiro (D5/D15 da 8ª)
❌ Deixar o Confirmar do agendar (ou do remarcar) gravar antes de chegar a conferência do horário escolhido (o aviso vinha depois — D9 da 8ª)
❌ Trocar a hora que o modal mostra sem dizer (o próximo livre que pula de dia calado — D7 da 12ª): só troca a que não cabe, e com textoDoProximoLivre
❌ Agrupar agendamento por dia com scheduled_at.slice(0, 10) ou toISOString da meia-noite local (é o dia em UTC) — é dayKeyTZ (D4 da 8ª)
❌ Trocar a profissional de um agendamento (janela, arraste, remarcação) para quem não atende na unidade dele, ou sem "de quem para quem" no histórico — é recusaDeQuemNaoAtende + textoDaTroca (A22 da 8ª)
❌ Somar o scrollTop da grade à posição do arraste (o retângulo da coluna já anda com a rolagem — A22 da 8ª)
❌ Gravar a desistência no meio (intercorrência, insumo) fora de desistir_do_atendimento, ou calcular a baixa fora de montarInsumosDaBaixa (A27 da 8ª)
❌ Deixar o "Já pago" em "Não usar" quando a cliente tem crédito do MESMO procedimento (vem escolhido, com aviso — A20 da 8ª), ou ligar crédito a agendamento já marcado fora de agendamento_usar_credito
❌ Ler as anotações da ficha (clients.notes) para decidir alergia: elas aparecem como estão escritas (A28 da 8ª; atend-15)
❌ Ler ou gravar agenda_bloqueios pela sessão (só o servidor: actions/agenda-bloqueios.ts e lib/agenda/bloqueios.ts), ou deixar quem tem "só os meus" bloquear outra pessoa ou uma sala
❌ Decidir qual sala serve a um procedimento fora de salasParaOProcedimento (lib/agenda/salas.ts), ou gravar sala pela sessão (só o servidor, actions/salas.ts)
❌ Remarcar, cancelar ou confirmar fora de remarcarCore/cancelarCore/confirmarCore (lib/appointments/alteracoes.ts) — a tela e o Copilot dividem. A exceção é pacote_cancelar (F2b): cancela as sessões agendadas na MESMA transação do dinheiro, com o status, o motivo e o histórico do cancelarCore, e a action emite o evento e o aviso depois
❌ Caminho que cria ou move agendamento (troca de profissional, sessão de plano, checkout do plano…) sem horarioOcupado — no checkout, ANTES do dinheiro
❌ Gravar o preço ou a duração da sessão do plano que o navegador mandou: é a sessão como crédito do núcleo (valoresDaSessaoDoPlano — D5 da 9ª)
❌ Gravar entrada ou ajuste de estoque fora de estoque_entrada/estoque_inicial/estoque_ajuste_em (trava: tests/estoque-so-pelas-funcoes.test.ts) (a linha do saldo travada; duas entradas juntas perdiam uma)
❌ Lançar despesa (ou qualquer financial_transactions) a partir de uma movimentação de estoque — entrada, cadastro, ajuste, perda, transferência ou consumo (D13 revisto, 2026-10-28)
❌ Transferir estoque fora de estoque_transferir (as duas linhas travadas na mesma ordem)
❌ Gravar movimento de estoque em embalagens de produto com unidade de consumo, ou com o custo da embalagem (é custo_de_consumo)
❌ Ler o custo de um movimento com coalesce(m.unit_cost, p.cost_price) (é custo_do_movimento) ou mandar o custo do insumo do app para a conclusão
❌ Avaliar o estoque ou o consumo pelo último custo (products.cost_price) quando há lote: é custo_do_lote (o gatilho do lote grava o do consumo; valor_do_saldo soma os lotes — D2 da 10ª)
❌ Ajuste positivo de estoque fora de um lote, ou o negativo fora de "Perdas no período" (estoque_ajuste_com_lote, motivo INVENTARIO — D5 da 10ª)
❌ Corrigir uma entrada lançada errada com um ajuste a menos (vira perda e sai do lote errado pelo FEFO): é "Desfazer entrada" (estoque_desfazer_entrada — A38 da 10ª), ou o ajuste com o lote escolhido
❌ Corrigir um ajuste errado com outro ajuste (a perda do primeiro fica em Perdas): é "Desfazer ajuste" (estoque_desfazer_ajuste — D5 da 11ª)
❌ Corrigir uma perda lançada errada com um ajuste a mais (a perda fica em Perdas e o lote certo não volta): é "Desfazer perda" (estoque_desfazer_perda — C69)
❌ Conferir o disponível de uma transferência (ou de qualquer saída) pelo current_stock de produto com unidade de consumo — o frasco aberto conta inteiro; é o rendimento (C18)
❌ Gravar o custo do produto ao editar o cadastro (o custo vem das entradas — C17)
❌ Campo de categoria, marca ou fornecedor em texto livre (ou num select sem busca) numa porta de entrada nova — é CampoDaLista (a lista da rede, com busca e "+ Nova …" — E6)
❌ Pôr marca ou fornecedor no PRODUTO — são da entrada (E10)
❌ Recusar a gerente de unidade nas categorias, marcas e fornecedores por ser de unidade — a regra é o Estoque em Gerenciar, e só isso (E4)
❌ Avisar um lote sem reivindicá-lo antes (vencimento_avisado_em — C25)
❌ Criar a linha da unidade (branch_product_stock) desligando o gatilho do mínimo, ou mostrar o custo de um lote por outra conta que não custo_do_lote (custos_dos_lotes — D2 e D4 da 11ª)
❌ Mostrar ou guardar o custo por unidade de consumo com 2 casas (R$ 0,038/g vira R$ 0,04 — D6 da 11ª)
❌ Escrever a quantidade com a embalagem no singular fixo ("3 frasco") — é medidaNoPlural/quantidadeComMedida (A49 da 12ª)
❌ Contar a entrega do voucher de produto (reference voucher:) como "Inventário" em metrics_perdas — é BRINDE, pelo custo do lote (A40 da 12ª)
❌ Saída calculada no app (conclusão, voucher) sem mandar o saldo LIDO (antes_embalagens/antes_rendimento) e sem comNovaTentativa — o banco confere e recusa com PT409
❌ Mostrar no ajuste o saldo em embalagens arredondadas, ou ler a contagem do inventário tirando dela o "já consumido do frasco aberto" (estoque_ajuste, o de antes): a contagem vale EXATA na unidade digitada — estoque_ajuste_em (D3 da 7ª)
❌ Dizer no "Aplicado em" do lote a baixa INTEIRA do atendimento (é stock_movement_batches.quantity × o rendimento) ou a hora marcada (é a conclusão) — D6/A12 da 9ª; ou listar só os lotes com saldo onde o recall pede o esgotado (D15)
❌ Ler a validade do lote (product_batches.expires_at) com new Date(...)/toLocaleDateString — é um DIA gravado à meia-noite UTC e vira a véspera: é lib/estoque/validade.ts (D1 da 7ª)
❌ Deletar anexo clínico de client_documents pela tela (é apagado_em), ou ler client_documents numa tela sem .is('apagado_em', null)
❌ Mostrar no portal da cliente um client_documents sem enviado_em (a clínica decide o que vai ao app)
❌ Recriar um "Retorno em N dias" (regra, lista ou cron) — é um agendamento novo (aut-04)
❌ Usar 40001 para "tente de novo" numa função chamada pelo PostgREST (ele repete sozinho, sem reler) — é PT409
❌ Gravar a avaliação da cliente fora de avaliar_atendimento, ou ler a nota de um procedimento fora de metrics_notas_dos_procedimentos (a configuração e a avaliação de antes moram ali)
❌ Ação do topo da tela do atendimento numa linha que não quebra, ou a ação principal fora de .sessao-acao-principal (no celular o "Finalizar" saía da tela — D1 da 10ª)
❌ Tabela nova com chave estrangeira para appointments E para procedures na chave primária: o PostgREST a lê como junção e TODO embed appointments → procedures(name) quebra com PGRST201 (foi a avaliacoes_dos_procedimentos por ~15 min, 2026-11-04 — migration 20261104001804)
```
