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
    `tests/validacao-limite-legivel.test.ts`.
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
    desligada) e o servidor confere (`schedulePackageSession` pelo núcleo;
    `schedulePlanSession` por `conferirPecasDoAgendamento` com a sala e o
    procedimento, e `horarioOcupado` da sala). A unidade pré-paga segue só
    com o horário (o crédito decide o procedimento no servidor). Prova:
    `e2e/pacote-sessao-agendar.spec.ts`. **A sala aparece desde o início**
    (A32 e A58 da 8ª simulação, 2026-11-06): só depois do horário escolhido,
    e o "Agendar a 1ª sessão" da venda do pacote parecia não pedir a sala;
    escolhido o horário, ela diz qual está "(ocupada)". Prova:
    `e2e/agenda-atritos-da-8.spec.ts` ("A32/A58").
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
- **A grade do dia rola a cada troca de dia** (D8): hoje, uma hora antes de
  agora; outro dia, o primeiro atendimento ou a abertura da unidade, o que
  vier antes (`rolagemDaGrade`). O novo agendamento sugere o próximo horário
  livre da profissional (A20, `proximoHorarioLivre`, a conta de
  `computeAvailableSlots`) quando a hora não veio de um clique na grade.
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
- **O concluído mostra a hora REAL** ao lado da agendada (J-34): "23:30 ·
  concluído em 29/10 às 00:22" na grade do dia, na janela, na agenda da rede e
  no cartão da Agenda do app da cliente (`textoDoConcluido`,
  `lib/agenda/hora-real.ts`, Brasília). Prova:
  `e2e/agenda-concluido-hora-real.spec.ts`, `tests/agenda-hora-real.test.ts`.
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
  remarca até ter, 03/11 às 10:00 (24 horas antes do horário)", "O prazo …
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
  o Laser. Prova: `e2e/agenda-pago-antes.spec.ts` ("A63").
- **O cartão do plano FECHADO abre** (A45 da 6ª simulação, 2026-11-04): na
  home do app, "Plano de tratamento · 1 de 3 sessões feitas · 1 agendada", e
  aberto (`<details>`, `.cartao-que-abre`) cada sessão com os procedimentos e
  a situação ("Feita em 28/10", "Agendada para 11/11 às 10:00", "A agendar")
  e o dinheiro: "Pago R$ X" e "A pagar R$ Y · próxima em DD/MM/AAAA", com o
  link para os pagamentos. Os números são os de `getFinanceiroDoPlano`
  (`lib/metrics/plano.ts`, a regra única de receita); nada clínico vai.
  Prova: `e2e/portal-cliente-plano-fechado.spec.ts`.
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
    `e2e/crm-agendar-liga-oportunidade.spec.ts` ("D12"). **Unidade sem sala: o
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
    (agendam sem); as sessões de pacote e de plano oferecem (A24, acima). Prova: `e2e/agenda-salas.spec.ts`,
    `tests/agenda-salas.test.ts`.
- `cancellationReason`: obrigatório ao cancelar para rastreabilidade
- Ao marcar `COMPLETED`: consumo de estoque + comissão, numa transação — ver §10. Os pontos de fidelidade NÃO nascem aqui: nascem no pagamento (§9.2.2).

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
- `visibleOnClientApp`: controla se o procedimento aparece para o cliente agendar pelo app
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
  com a unidade), o editor do plano (`procedimentosParaPlano` com a unidade,
  a tela do atendimento — o preço do plano segue editável) e o catálogo da
  unidade. A comissão sai do preço GRAVADO no agendamento/venda, então segue
  sozinha. A lista de procedimentos da rede diz embaixo do preço "R$ 590,00
  na Menino Deus" (`[data-preco-da-unidade]`). Sem unidade (a oportunidade, a
  recompensa da fidelidade, a ficha da rede com várias unidades no editor do
  plano), vale o da rede. Prova: `e2e/procedimento-preco-da-unidade.spec.ts`,
  `tests/preco-na-unidade.test.ts`.
- `ProcedurePriceHistory`: criada automaticamente ao alterar `price` de um procedimento
- `ProcedureProduct`: insumos consumidos por execução — base do consumo automático de estoque
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
    enviar o link" e leva ao cadastro (`?aba=dados`, via `lib/rotas`). "Ficha já
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
    A regra ficou; decisão para o Heitor revisar. O escopo não muda a regra,
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
  `tests/injetaveis-dose.test.ts`.
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
  `lib/plano-de-tratamento/situacao.ts`). E `/planejamentos/novo` (os dois
  portais) não é 404: leva à lista com `?novo=1`, que abre o "Novo plano"
  para quem monta. Prova: `e2e/planejamentos-quem-monta.spec.ts`.
- **Os planos de tratamento seguem a agenda "só os meus"** (decisão do Heitor,
  2026-10-28). Com `agenda` OWN, a tela Planejamentos (`listarPlanejamentos`),
  os planos da cliente (`getPlanosDoCliente`, o Planejamento da ficha e do
  atendimento) e TODA action pelo id do plano que passa por `planoDoTenant`
  (cabeçalho, editar, salvar, renomear, ligar cliente, enviar à recepção,
  fechar o checkout, o arquivo do tratamento), mais `getTreatmentPlanSessions`
  e `cancelTreatmentPlan`, só valem para o plano DELA (`planoDaProfissional`).
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
    "780 UI · 7,8 frasco" (`[data-saldo-do-ajuste]`), pergunta "Contar em: UI
    | frasco" (UI por padrão) e diz a conta ANTES de aplicar
    (`[data-ajuste-equivale]`): "765 UI = 7,65 frasco", ou "7,7 frasco =
    770 UI: o frasco aberto conta pela fração que sobra nele". A contagem vale
    exata na unidade digitada: `estoque_ajuste_em` (migration
    `20261105002801`; em embalagens, a fração é o aberto), o saldo em
    embalagens é o rendimento arredondado para cima e o movimento é o que o
    rendimento andou. O Copilot passa pela mesma função (`ajusteDeEstoqueCore`)
    e o cartão diz "7,8 → 8 frasco (780 → 800 UI)". `estoque_ajuste` (o de
    antes) ficou sem chamador. Prova: `e2e/estoque-tela-consumo-e-lotes.spec.ts`
    ("D3"), `e2e/estoque-custo-de-consumo.spec.ts`.
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
- **O produto tem USO: Insumo, Revenda ou Os dois** (D-6, decisão do Heitor,
  2026-10-29; `products.uso`, migration `20261029001302`). O cadastro
  pergunta (segmentado "Uso do produto"); a revenda e "os dois" exigem preço
  de venda (`usoEPrecoDoFormulario` e a restrição `products_uso_check`); o
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
    próprio: o custo dele é o do movimento de entrada ligado (o lote que veio
    por transferência fica sem custo, "—").
  - Prova: `e2e/estoque-tela-consumo-e-lotes.spec.ts`, `tests/estoque-situacao.test.ts`.
  - **A validade do lote é um DIA, e se lê pelo dia** (D1 da 7ª simulação,
    2026-11-05; princípio 3 e CLAUDE.md §14): o campo de data da entrada grava
    "AAAA-MM-DD" à meia-noite UTC, e a tela do Estoque, com `new Date(...)`,
    dizia "vence 14/11/2026" para o lote de 15/11 que Relatórios → Estoque
    dizia 15/11. A regra é UMA, `lib/estoque/validade.ts`: a tela mostra o dia
    gravado (`validadeNaTela` — a linha do lote, o seletor de lote da perda, o
    histórico), no dia da validade o lote ainda vale e vencido é do dia
    seguinte (`loteVencido`, o HOJE de Brasília; também o "jaVenceu" do
    Copilot), e o "vence em 30 dias" compara os dias (`venceAte` em
    `lotesVencendo`; o Copilot até o fim do dia). Prova:
    `e2e/estoque-tela-consumo-e-lotes.spec.ts` ("D1"),
    `tests/estoque-validade-do-lote.test.ts`.
  - **O lote diz em quem foi aplicado — o recall** (A40 da 7ª simulação,
    2026-11-05: não havia "quem recebeu o lote X"; a baixa segue FEFO, a regra
    fica). Cada lote da linha aberta tem "Aplicado em": a janela lista cada
    saída do lote para uma cliente — o insumo de um atendimento (a cliente, o
    dia e a hora marcados, a profissional) e a venda de produto (quem vendeu) —
    com a quantidade na unidade do movimento ("20 UI"). A ligação é a de
    sempre, `stock_movement_batches` (o gatilho do lote); a leitura,
    `aplicacoesDoLote` (`lib/estoque/aplicacoes-do-lote.ts`, os nomes por
    `nomesDosRegistros`), pela action do mesmo nome em `actions/stock.ts`:
    pede o Estoque E as Clientes (a lista diz nomes de cliente — sem as
    Clientes, o botão nem aparece), com o lote da rede e da unidade ao alcance.
    Fica de fora o lote já esgotado (a linha aberta lista os lotes com saldo).
    Prova: `e2e/estoque-atritos-da-7.spec.ts` ("A40").
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
  `indicadores.md`). Por 28/10 a Entrada e o cadastro tiveram
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
  `e2e/atendimento-atritos-da-8.spec.ts` ("A27").
- **CONCLUÍDO, a tela mostra os insumos da BAIXA** (D9 da 6ª simulação,
  2026-11-04; princípio 3): o `PROCEDURE_USAGE` do atendimento, somado por
  produto, na unidade do movimento (`app/_shared/sessao-de-atendimento.tsx`).
  Era o cadastro do procedimento (ou a sessão do plano): o insumo acrescentado
  na hora sumia — "Nenhum insumo registrado" com a baixa no banco — e o do
  cadastro que não foi usado aparecia. Prova:
  `e2e/atendimento-concluido-mostra-a-baixa.spec.ts`.
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
  como está (`data-plano-da-avaliacao-concluida`), e o Planejamento por cima
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
❌ Ler o preço de um procedimento para uma UNIDADE direto de procedures.price — é precoNaUnidade/comPrecoDaUnidade (lib/procedimentos/preco-na-unidade.ts; no banco, private.preco_na_unidade): o preço próprio da unidade vale (D2 da 9ª)
❌ Baixar lote no TypeScript (é o gatilho trg_lote_do_movimento; senão o próximo caminho esquece)
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
❌ Gravar as dores do cliente em appointments.notes (é a observação interna; as dores são medical_record_entries.queixas)
❌ Cancelar ou marcar falta num atendimento concluído — o que se desfaz é o pagamento (estorno)
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
❌ Gravar o token do link da ficha (só o SHA-256), ou contar tentativas fora de pre_atendimento_link_abrir
❌ Action ou tela que recebe o id de um agendamento sem deOutroProfissional (a agenda "só os meus" vale pelo id, não só na lista) — na tela, "Este atendimento é de outra profissional" (AtendimentoDeOutraProfissional), nem 404 nem semAcesso() (o cargo libera; o atendimento é que não é dela)
❌ Botão que grava o prontuário (gerar o plano, "Editar registro") para quem não tem o Prontuário em Gerenciar (canEditRecords)
❌ Listar ou conferir "quem atende nesta unidade" com branch_id = unidade, ou com "a da rede atende em todas" — é a unidade marcada no "Atende" (atende_em, filtroDeQuemAtendeNaUnidade)
❌ Gravar users.atende_em ou provides_services sem passar pelo gatilho que os mantém juntos (atende_em_sincronizar), ou dar à unidade nova alguém marcado sozinho (princípio 6)
❌ Abrir a unidade inteira a quem só ATENDE nela (a Talita no Batel): o alcance é dos agendamentos DELA — alcancaOAgendamento, nunca crescer a abrangência
❌ Ler o nome da cliente ou do profissional de um registro da unidade por join da sessão (clients(name), users!professional_id(name)) — a cliente de outra unidade e o profissional da rede viram "—"; é nomesDosRegistros
❌ Conferir conflito de horário fora de horarioOcupado (lib/appointments/core.ts): a duração de CADA agendamento, e o profissional em qualquer unidade da rede
❌ Medir até quando um agendamento ocupa o horário fora de fimDaOcupacao (o concluído adiantado libera o resto — A31)
❌ Oferecer como livre (app da cliente, Copilot, CRM) um horário bloqueado — é computeAvailableSlots, que já tira o bloqueio; nem RECUSAR o encaixe da equipe no bloqueado (é aviso — princípio 2)
❌ Decidir na tela se um horário está livre pelo INÍCIO, ou sem os bloqueios — é ocupanteDoHorario / livresEntre (lib/agenda/horario-livre.ts), o intervalo inteiro (D5/D15 da 8ª)
❌ Deixar o Confirmar do agendar (ou do remarcar) gravar antes de chegar a conferência do horário escolhido (o aviso vinha depois — D9 da 8ª)
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
❌ Gravar entrada ou ajuste de estoque fora de estoque_entrada/estoque_inicial/estoque_ajuste_em (trava: tests/estoque-so-pelas-funcoes.test.ts) (a linha do saldo travada; duas entradas juntas perdiam uma)
❌ Lançar despesa (ou qualquer financial_transactions) a partir de uma movimentação de estoque — entrada, cadastro, ajuste, perda, transferência ou consumo (D13 revisto, 2026-10-28)
❌ Transferir estoque fora de estoque_transferir (as duas linhas travadas na mesma ordem)
❌ Gravar movimento de estoque em embalagens de produto com unidade de consumo, ou com o custo da embalagem (é custo_de_consumo)
❌ Ler o custo de um movimento com coalesce(m.unit_cost, p.cost_price) (é custo_do_movimento) ou mandar o custo do insumo do app para a conclusão
❌ Saída calculada no app (conclusão, voucher) sem mandar o saldo LIDO (antes_embalagens/antes_rendimento) e sem comNovaTentativa — o banco confere e recusa com PT409
❌ Mostrar no ajuste o saldo em embalagens arredondadas, ou ler a contagem do inventário tirando dela o "já consumido do frasco aberto" (estoque_ajuste, o de antes): a contagem vale EXATA na unidade digitada — estoque_ajuste_em (D3 da 7ª)
❌ Ler a validade do lote (product_batches.expires_at) com new Date(...)/toLocaleDateString — é um DIA gravado à meia-noite UTC e vira a véspera: é lib/estoque/validade.ts (D1 da 7ª)
❌ Deletar anexo clínico de client_documents pela tela (é apagado_em), ou ler client_documents numa tela sem .is('apagado_em', null)
❌ Mostrar no portal da cliente um client_documents sem enviado_em (a clínica decide o que vai ao app)
❌ Recriar um "Retorno em N dias" (regra, lista ou cron) — é um agendamento novo (aut-04)
❌ Usar 40001 para "tente de novo" numa função chamada pelo PostgREST (ele repete sozinho, sem reler) — é PT409
❌ Gravar a avaliação da cliente fora de avaliar_atendimento, ou ler a nota de um procedimento fora de metrics_notas_dos_procedimentos (a configuração e a avaliação de antes moram ali)
❌ Tabela nova com chave estrangeira para appointments E para procedures na chave primária: o PostgREST a lê como junção e TODO embed appointments → procedures(name) quebra com PGRST201 (foi a avaliacoes_dos_procedimentos por ~15 min, 2026-11-04 — migration 20261104001804)
```
