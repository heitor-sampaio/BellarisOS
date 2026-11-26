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
  `lib/agenda/horario.ts` (`normalizarHorario` confere o que vem da tela).
  **O fim do dia é UM formato, o 24:00** (A4 da 29ª, princípios 3 e 7;
  decisão do Claude, 25/11): o campo de hora não aceita "24:00", e quem atende
  até a meia-noite digita 23:59 — `normalizarHorario` grava o fim às 23:59
  como 24:00 (o último horário das 23:30 cabe, como na unidade 24 h), e o
  editor mostra 23:59 com "meia-noite (24:00)" (`[data-ate-a-meia-noite]`) e o
  "Fica assim" já com 24:00. Prova: `tests/horario-ate-a-meia-noite.test.ts`:
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
  - a capacidade da ocupação (`capacidadeEmMinutos`, §13.1);
  - **o intervalo de quem atende aparece pelo nome** (A8 da 31ª; decisão do
    Claude, 26/11, pelo princípio 3): a pausa entre dois períodos do dia
    (`pausasDoDia`, `lib/agenda/intervalos-da-grade.ts`) diz "Intervalo
    01:20–03:20" na coluna dela na vista do dia e no dia dela na vista da
    semana (`[data-intervalo-do-horario]`), a quem vê a agenda dela — o
    sombreado sozinho era o mesmo do fora do horário, e a semana não mostrava
    nada. Prova: `tests/agenda-intervalo-na-grade.test.ts`. A Minha agenda
    também (D4 da 32ª): a pausa dela diz "Intervalo", e o "Horário livre" não
    cai na pausa nem fora do horário dela (`foraDoHorarioComoCortes`);
  - **o dia sem horário diz** (A6 da 32ª; decisão do Claude, 26/11, pelo
    princípio 3): a unidade não abre → "Fechado" (no cabeçalho do dia da
    semana e acima da grade do dia, `[data-dia-fechado]`); abre e a pessoa não
    atende → "Não atende neste dia" (`[data-nao-atende-no-dia]`), no estilo do
    "Intervalo" (`rotuloDoDiaSemHorario`). Prova:
    `tests/agenda-fechado-bloqueio-e-horario-que-parte-da-unidade.test.ts`.
  A equipe ainda marca fora do horário (encaixe), mas só pelo campo de horário
  (no Agendar, o de data e hora; no checkout e nas sessões, o "Outro horário
  (encaixe)"): as listas não oferecem o fora do horário (R15, abaixo).
  - **O encaixe é permitido, mas AVISADO** (J-30, 2026-10-30): o modal de
    agendamento diz, antes do Confirmar, "Fora do horário de atendimento de X
    (10:00–18:00). O encaixe é permitido." e o choque com outro atendimento
    dela ("X já tem atendimento das 11:00 às 12:00.") — `avisosDoHorario` →
    `avisosDoHorarioCore` (`lib/appointments/encaixe.ts`), com
    `cabeNoHorario` e o `primeiroConflito` do núcleo (a mesma conta de
    `horarioOcupado`). O que só passa da meia-noite num dia de 00:00–24:00
    diz "Passa da meia-noite (fim às 00:25)…" (A37 da 24ª, `avisoForaDoHorario`).
    Fora também do horário da UNIDADE, o aviso diz as duas coisas (A7 da 26ª;
    o horário é da unidade e, dentro dele, do profissional): "Fora do horário
    de atendimento de X (08:00–17:00) e do horário da unidade (08:00–22:00).",
    "X não atende neste dia, e é fora do horário da unidade (…)." ou "A
    unidade não abre neste dia." (o `daUnidade` de `avisoForaDoHorario`).
    Na grade do dia, a coluna de cada profissional sombreia
    o que é fora do horário DELA (`forasDoHorario`); o clique ali continua
    agendando. Recusado por choque com o aviso na tela, fica UMA mensagem
    ("Não foi agendado: X já tem atendimento das…", A26 da 5ª simulação; eram
    o aviso e a recusa repetidos). O horário no passado diz "Escolha a partir
    de 01/11/2026 às 10:40." (`limiteLegivel`, `ValidacaoEmPortugues`; era o
    ISO "2026-11-01T10:40"). Prova: `e2e/agenda-encaixe-avisa.spec.ts`,
    `tests/validacao-limite-legivel.test.ts`. **A mesma cliente com o mesmo procedimento
    no dia também avisa** (A22 da 23ª; princípio 3, como o aviso do plano ×
    avulso): "Helena já tem Avaliação neste dia, às 10:00." — só os que a
    pessoa alcança, fora os cancelados e as faltas, no relógio da unidade
    (`avisoDoMesmoProcedimentoNoDia`, `textoDoMesmoProcedimentoNoDia`,
    `[data-aviso-mesmo-no-dia]`). Só aviso: o agendamento segue (princípio 2). **O horário fora da grade de 30
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
  - **O editor diz o horário em texto antes de salvar** (A25 da 19ª,
    princípio 3: o "Repetir o horário de segunda em todos os dias (domingo
    incluído)" abriu o domingo, e quem repetiu achava que ele seguia fechado):
    "Fica assim: Seg a dom, 09:00–24:00", com os dias fechados ditos ("Seg a
    sáb, 09:00–18:00. Domingo fechado") — o mesmo resumo de quem agenda
    (`resumoDoEditorDeHorario`, `lib/unidades/horario-no-editor.ts`,
    `[data-resumo-do-horario]`). Prova: `tests/atritos-da-19-cadastros.test.ts`.
  Prova:
  `e2e/agenda-horario-de-funcionamento.spec.ts`, `tests/agenda-horario.test.ts`.
  - **Livre não é fixo** (D8 da simulação de 2026-10-29): a grade desses
    seletores (`GradeDeHorarios`, `components/shared/grade-de-horarios.tsx` —
    o checkout do plano, as sessões do plano/pacote e o "Agendar" do pré-pago)
    é o horário de QUEM ATENDE naquele dia (a unidade ∩ ela), de 30 em 30 min,
    sem a pausa e até o último início antes do fechamento (`gradeDoCheckout`,
    `lib/checkout/grade-de-horarios.ts`, marca o `doProfissional`, e a grade
    só mostra esses). O fora do horário dela não aparece (R15, abaixo; era
    tracejado e se escolhia): o encaixe vai pelo "Outro horário (encaixe)"
    (no Agendar, o campo de data e hora). O dia sem horário dela diz "X não
    atende neste dia. Para um encaixe, use “Outro horário”." (a unidade
    fechada, "A unidade não abre neste dia…"). Era 08:00–20:00 fixo: oferecia
    a pausa e cortava a noite. A action `getSchedulingDaySlots` devolve os
    dois horários. Prova: `e2e/checkout-grade-de-horarios.spec.ts`,
    `tests/checkout-grade-de-horarios.test.ts`.
    **Hoje, a grade começa em AGORA** (A24 da 6ª simulação, 2026-11-04: de
    madrugada, numa unidade 24 h, a sessão do pacote oferecia 00:00–04:00):
    `aPartirDeAgora` (Brasília) corta o que já passou, e o "Outro horário" no
    passado diz "Escolha a partir de HH:MM." sem escolher. O "agora" anda com
    o relógio (`useAgora`), no fuso da unidade — o Agendar passa o `fuso` à
    grade (A38 da 24ª: aberta havia minutos, ela oferecia o horário passado).
    Um nome só para cada situação: `ROTULO_DO_STATUS` (A39 da 24ª: a agenda
    dizia "Aguardando" e o detalhe e o app, "Agendado"). **As sessões de
    pacote e de plano dizem o procedimento e oferecem a sala**
    (`SessionScheduler` com `procedimento`, `[data-agendar-sessao]`): a
    sala é opcional, a lista é a do agendar (`salasParaAgendar`: só as livres
    no horário — R13, abaixo; sem nenhuma, "Nenhuma sala está livre nesse
    horário: a sessão vai sem sala.") e o servidor confere (`schedulePackageSession` e, desde a D5 da
    9ª simulação, `schedulePlanSession` pelo núcleo, com a sessão como
    crédito). A unidade pré-paga segue só
    com o horário (o crédito decide o procedimento no servidor). Prova:
    `e2e/pacote-sessao-agendar.spec.ts`. **A sala aparece desde o início**
    (A32 e A58 da 8ª simulação, 2026-11-06): só depois do horário escolhido,
    e o "Agendar a 1ª sessão" da venda do pacote parecia não pedir a sala;
    escolhido o horário, a ocupada e a bloqueada saem da lista (R13). Prova:
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
  "Reagendar"); o que a unidade não tem cai. Prova:
  `e2e/vendas-unidade-da-venda.spec.ts` ("A14").
- **O "Novo cliente" não pergunta nem mostra unidade** (auditoria das regras,
  2026-11-18; o Heitor: "o cliente não é da unidade, o cliente é da rede" —
  H16; "Nada se prende a clients.branch_id" — CLAUDE.md §5). Era "Unidade de
  cadastro *" (sem pré-escolha) pela rede, e "Unidade de cadastro: X" com uma
  só. A ficha nasce na unidade do ENDEREÇO (o portal da unidade, a conversa
  aberta nela); pela rede, sem unidade. `clients.branch_id` fica no banco só
  como "onde a ficha nasceu": nada o lê para decidir — nem o portal, nem o
  plano, nem o mapa de injetáveis, nem as automações, nem a LGPD
  (`tests/cliente-da-rede-sem-unidade-de-cadastro.test.ts` trava toda
  consulta a `clients` que peça a coluna). Com várias unidades, o cadastro diz
  "A cliente é da rede: aparece na lista de Clientes de todas as unidades, e
  qualquer uma a atende." (`avisoDaFichaDaRede`). Prova:
  `e2e/vendas-unidade-da-venda.spec.ts` ("A14"),
  `e2e/agenda-rede-de-uma-opcao.spec.ts` ("A2"),
  `tests/cadastro-sem-unidade-de-cadastro.test.ts`.
- **O BLOQUEIO pontual da agenda** (decisão 3 do Heitor, 7ª simulação,
  2026-11-05: "concordo" — a Lia e a Rita procuraram em Agenda, Equipe e
  Configurações onde bloquear o almoço, a folga e as férias). "Bloquear
  horário" no cabeçalho da agenda da unidade, da "Minha agenda" e da agenda
  da rede com UMA unidade na tela (a rede de uma unidade só vive no `/admin`,
  H3): por PROFISSIONAL ou por SALA, com início e fim (data e hora — o almoço
  de hoje, as férias de vários dias, uma licença) e o motivo (obrigatório,
  até 200 caracteres). **Acima de um ano AVISA** (o Heitor, 25/11, perguntado
  se um bloqueio mais longo — uma licença — recusa ou avisa: escolheu "Acima
  de 1 ano avisa"; era "até um ano"): vale o fim que a pessoa escolher, e a
  janela diz ao lado do fim "Acima do comum (mais de 1 ano). Confira: o valor
  vale como está." (`avisoDoBloqueioLongo`, `[data-acima-do-comum="bloqueio"]`).
  Só se recusa acima de 100 anos, o limite das datas ("No máximo 36.500 dias
  (100 anos, o limite das datas).", `recusaDoBloqueio`) — decisão do Claude,
  25/11: o comum é o teto de antes (um ano), o impossível é `LIMITE_DE_DIAS`;
  o banco tem a mesma faixa (`agenda_bloqueios_periodo`, migration
  `20261207500001`). A grade, a Semana e os livres leem o bloqueio por
  sobreposição (`inicio < fim da janela` e `fim > início da janela`), então um
  bloqueio de anos não pesa. Prova: `tests/bloqueio-acima-de-um-ano-avisa.test.ts`. `agenda_bloqueios` (migration `20261105003002`; só o
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
  - **O horário bloqueado não se marca** (o Heitor, 26/11 (R07), no chat:
    "r07 se ta bloqueado não dá pra marcar"; era "avisa e deixa encaixar",
    pelo princípio 2): o bloqueio da pessoa que atende ou da sala, o do dia
    inteiro também, RECUSA marcar ou mover um agendamento para dentro dele, em
    todo caminho — o agendar da agenda (`createAppointmentCore`, logo a sessão
    de pacote e de plano, o CRM, o pré-pago e o app da cliente), o remarcar e
    o arraste na grade (`remarcarCore`), o mudar de unidade
    (`mudarUnidadeCore`), a troca de quem atende (`reassignProfessionalInterno`)
    e o repasse ao desativar (`lib/equipe/repasse.ts`), o checkout do plano e o
    Copilot (agendar e remarcar, já no preparo do cartão). A frase é uma só,
    `recusaDoBloqueioNoHorario` (`lib/appointments/core.ts`), no relógio da
    unidade: "Bruna está com o horário bloqueado das 12:00 às 13:00 (Almoço).
    Escolha outro horário." / "Sala Rosa está bloqueada o dia 10/11 inteiro
    (Manutenção). Escolha outro horário.". A sala só entra quando é a do
    agendamento no horário novo (só trocar quem atende não a confere). Na
    tela, como o choque (R06): a janela de agendar diz "Não vai ser agendado:
    Bruna está com o horário bloqueado das …" (`[data-bloqueio-do-horario]`,
    o `bloqueio` de `avisosDoHorarioCore`) e a de remarcar "Não vai ser
    remarcado: …"; o Confirmar desliga, com o motivo ao lado ("Escolha outro
    horário: este está bloqueado.", `motivoDoConfirmarDesligado`,
    `lib/agenda/motivo-do-confirmar.ts`), e o Enter não envia. A sala ÚNICA que
    o sistema escolhe sozinho (`salaUnicaDoHorario` no checkout do plano e no
    remarcar pela cliente, e a sala de antes no remarcar pela cliente) não
    entra bloqueada: o agendamento vai sem sala, como com a ocupada (decisão
    do Claude, 26/11; a sala é opcional, H1), e o checkout diz "A Sala X está
    bloqueada em …: essa sessão vai sem sala.". **Fica encaixe, com aviso**: o
    fora do horário de quem atende ou da unidade, o dia em que a unidade não
    abre ou em que a pessoa não atende e o que passa da meia-noite — nada disso
    é bloqueio (`avisoForaDoHorario`). **O que já estava marcado fica**: ao
    bloquear um período com atendimento já marcado, ele continua, e o aviso
    diz quantos ("…continuam na agenda. Remarque se precisar.") — na janela,
    ANTES de gravar (`marcadosNoBloqueio`, `[data-marcados-no-bloqueio]`; A10
    da 32ª), e no toast depois; a recusa é só a de marcar ou mover PARA dentro
    do bloqueio. Os vários bloqueios do horário se juntam numa frase
    (`avisoDosBloqueios`; o "Confirme só se for isso mesmo." da A9 da 32ª saiu
    com a R07: não há o que confirmar). Prova: `e2e/agenda-bloqueio.spec.ts`,
    `e2e/agenda-defeitos-da-8.spec.ts` ("D9"),
    `tests/agendar-no-horario-bloqueado-recusa.test.ts`.
  - **As listas só mostram o que está livre** (o Heitor, 26/11, na página de
    perguntas — R13, sobre o "Trocar profissional" e o "Mudar de unidade":
    "Só mostra os horarios, salas e pessoas que estão livres"; R14, sobre o
    "Usar o próximo livre" no bloqueio: "Horarios, salas e pessoas não
    disponíveis não devem aparecer nas listas"). A leitura é do Claude
    (26/11): **"não disponível" é o que o sistema RECUSARIA naquele horário**
    — o choque com outro atendimento, o bloqueio (da pessoa ou da sala), a
    sala ocupada, o horário que já passou. **E quem está FORA DO HORÁRIO**
    (o Heitor, 26/11, na página de perguntas, R15: "Não: quem está fora do horário também some das listas (o encaixe só pelo campo de horário)"):
    fora do horário dela naquela unidade (sem horário próprio, o da unidade;
    a unidade fechada, fora) — a MESMA conta do aviso do encaixe
    (`foraDoHorarioDeQuemAtende`, `lib/agenda/horario.ts`, dentro de
    `indisponibilidadeNoHorario`, o motivo `'fora_do_horario'`). O encaixe
    segue permitido (o servidor aceita, com o aviso), mas só pelo campo de
    horário: a lista não o oferece. Com o horário digitado antes da pessoa e
    TODOS só fora do horário (ninguém ocupado nem bloqueado), a lista vazia do
    Agendar diz, ao lado do "Ninguém está livre nesse horário. Escolha outro
    horário para ver quem atende.", o caminho do encaixe: "Para um encaixe fora
    do horário, apague o horário, escolha primeiro quem atende e depois digite
    o horário." (`encaixeDaListaVazia`, `lib/agenda/so-o-que-esta-livre.ts`;
    decisão do Claude, 26/11, princípio 7; prova
    `tests/agenda-lista-vazia-diz-o-encaixe.test.ts`). As salas não têm horário próprio: a unidade
    fechada não as tira (decisão do Claude, 26/11). Quem não atende na unidade
    já não aparecia. Valem:
    - a grade de horários (`GradeDeHorarios`: o Agendar, as sessões do
      pacote/plano e o checkout) — o ocupado, o bloqueado e o fora do horário
      de quem atende saem; com a sala escolhida, também o da sala;
    - as salas do agendar, das sessões e do "Mudar de unidade"
      (`salasParaOHorario` → `indisponibilidadeNoHorario`, que dá
      `'ocupada' | 'bloqueada'`);
    - quem atende no Agendar (`quemNaoEstaLivreNoHorario`), no "Trocar
      profissional" e no "Mudar de unidade";
    - o "Usar o próximo livre" (livre da pessoa E da sala; aparece também no
      bloqueio e na sala ocupada).
    - a sala do agendar pelo painel da oportunidade (CRM; sem sala livre, "Nenhuma
      sala está livre nesse horário: o agendamento vai sem sala.");
    - o repasse da desativação (`lib/equipe/repasse.ts`): quem tem atendimento,
      BLOQUEIO ou está fora do horário no horário não aparece; o "repassar
      todos para X" diz o motivo ("…está com o horário bloqueado: escolha outra
      pessoa.", "…está fora do horário de atendimento nesse horário: escolha
      outra pessoa.").
    **A já escolhida que deixou de estar livre FICA** como valor do campo, com
    "(ocupada)"/"(bloqueada)" e o "Não vai ser agendado", e o Confirmar
    desligado; fora do horário, com "(fora do horário)" e o aviso do encaixe,
    e o Confirmar LIGADO — é o encaixe pelo campo de horário: escolhida a
    pessoa, o horário digitado fora do expediente dela segue (`soOQueEstaLivre`,
    `rotuloDaEscolhida`, `lib/agenda/so-o-que-esta-livre.ts`) — sumir com ela
    trocaria a escolha calada. No Agendar, a lista de quem atende só filtra depois que a pessoa
    escolheu o horário: enquanto ele é só a sugestão (o próximo livre de quem
    ela escolher, A20), todas aparecem. Lista vazia diz por quê: "Ninguém está
    livre nesse horário." (`NINGUEM_LIVRE_NO_HORARIO`), "Nenhuma sala … está
    livre nesse horário: … vai sem sala.", "Nenhum horário livre de X neste
    dia: escolha outro dia." O servidor segue recusando ao gravar. Prova:
    `tests/agenda-so-mostra-o-que-esta-livre.test.ts` (com o "R15"),
    `tests/listas-so-com-o-livre-crm-e-repasse.test.ts`,
    `e2e/agenda-salas.spec.ts`, `e2e/agenda-atritos-da-8.spec.ts` ("A58",
    "A22 (R13)", "A22 (R15)"), `e2e/agenda-defeitos-da-8.spec.ts` ("D5", "D9 (R14)"),
    `e2e/agenda-unidade-da-9.spec.ts` ("A17").
  - **Os livres não oferecem o bloqueado**: `computeAvailableSlots` tira o
    bloqueio da profissional — logo o app da cliente (agendar, "Sem
    preferência", remarcar), o Copilot (os livres), o CRM e a sugestão do
    próximo livre (A20). Pedido no bloqueado, o Copilot RECUSA já no preparo
    do cartão de agendar e de remarcar, com a frase da agenda
    (`recusaDoBloqueioNoHorario`; o Heitor, 26/11 (R07): "r07 se ta bloqueado
    não dá pra marcar" — de 18/11 até ali avisava e deixava confirmar, decisão
    do Claude pelo princípio 2). O app da cliente já não oferecia nem gravava
    o bloqueado da profissional (o agendar e o remarcar conferem o horário
    pedido contra `computeAvailableSlots`: "Este horário não está mais
    disponível. Escolha outro.").
    O bloqueio da SALA não muda os livres do app e do Copilot (eles agendam
    sem sala; a sala que o sistema escolhe sozinho não entra bloqueada). Na
    equipe, com a sala escolhida, muda: a grade do dia conta os atendimentos e
    os bloqueios DA SALA (`getSchedulingDaySlots` com `ocupacaoDaSala`), e o
    "Usar o próximo livre" pula o horário em que ela não está livre (R14, abaixo).
    **E a régua da equipe também não** (D5 e D15 da 8ª simulação,
    2026-11-06; princípio 3): o horário de N minutos está livre quando o
    intervalo INTEIRO [início, início + N) não bate em agendamento dela (em
    qualquer unidade da rede, até o fim da ocupação — `fimDaOcupacao`) nem em
    bloqueio dela — `ocupanteDoHorario`, `lib/agenda/horario-livre.ts`, puro.
    A grade das sessões do pacote/plano e do checkout (`GradeDeHorarios`, que
    `getSchedulingDaySlots` alimenta com os agendamentos e os `bloqueios`) usa
    essa régua: o ocupado e o bloqueado SAEM da grade (R14, abaixo; eram
    riscados, "Bloqueado · motivo", desligados), e o dia sem nenhum diz
    "Nenhum horário livre de X neste dia: escolha outro dia." (o "Outro
    horário" é encaixe fora da grade, não no bloqueio: no bloqueado o servidor
    recusa — R07). Era só o INÍCIO dentro de um ocupado, da
    unidade: 10:00 aparecia livre para 60 min com outro às 10:30, e o
    Confirmar recusava. O "Horário livre" da "Minha agenda" tira o bloqueio do
    vão (`livresEntre`): a Débora de férias via "Horário livre 02:45 – 04:00".
    A ocupação desconta o bloqueado (`blocosDosBloqueios`, `indicadores.md`).
    Prova: `e2e/agenda-defeitos-da-8.spec.ts` ("D5", "D15"),
    `tests/agenda-horario-livre.test.ts`. **Com QUALQUER duração** (decisão do
    Claude, 25/11, pelo princípio 3; o procedimento não tem duração máxima e o
    agendamento soma as durações): a conferência do choque
    (`conflitosDoHorario`, logo `horarioOcupado`), os livres
    (`computeAvailableSlots`), o "ocupada" do repasse e a contagem do "Bloquear
    horário" leem quem começou até 12 h antes (a duração comum,
    `DURACAO_COMUM_MIN`) OU dura mais que isso, de qualquer data
    (`podemOcuparDesde`, `lib/appointments/core.ts`), em páginas — o
    agendamento não grava o fim (é `scheduled_at + duration_min`), e os longos
    são raros. Até ali a janela era fixa em 12 h: o atendimento de 14 h das
    08:00 deixava de bloquear quem começava às 21:00, calado. E o "próximo
    livre" procura com a duração inteira (era cortada em 8 h: o atendimento de
    10 h recebia um horário em que só cabiam 8); a busca termina em 14 dias.
    Prova: `tests/choque-com-agendamento-de-qualquer-duracao.test.ts`,
    `tests/proximo-livre-com-a-duracao-inteira.test.ts`. **E a grade lê da véspera ao fim do
    dia SEGUINTE** (D6 da 28ª simulação; decisão do Claude, 25/11, pelo
    princípio 3): a sessão de 60 min às 23:30 vai até 00:30, e a grade só lia
    os agendamentos até 23:59:59 do dia — o das 00:00 de amanhã não chegava a
    ela, o 23:30 aparecia livre e o Confirmar recusava. `getSchedulingDaySlots`
    lê os agendamentos e os bloqueios pela `janelaDaGrade`
    (`lib/appointments/janela-da-grade.ts`). Prova:
    `tests/agenda-janela-da-grade.test.ts`. **Para trás, com qualquer duração**
    (decisão do Claude, 25/11, pelo princípio 3): a véspera fixa (24 h) deixava
    de fora o atendimento de mais de 24 h que começou antes de ontem — a grade
    oferecia o horário e o Confirmar recusava. `getSchedulingDaySlots` lê quem
    pode ocupar o dia (`podemOcuparDesde` desde a meia-noite dele, até o fim do
    dia seguinte), em páginas, e devolve só o que ainda ocupa o dia. Prova:
    `tests/agenda-mostra-o-atendimento-de-qualquer-duracao.test.ts`.
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
    remarcar da janela diz "Não vai ser remarcado: …". **Com o choque à vista,
    o Confirmar fica DESLIGADO, com o motivo ao lado** (o Heitor, 26/11, página
    de perguntas, R06: "Desliga o botão, e os três testes conferem o botão
    desligado (a proposta)"; era "segue clicável"): "Escolha outro horário:
    este bate com outro atendimento." (`[data-motivo-do-confirmar]`), no
    "Confirmar agendamento" e no "Confirmar novo horário" (e o Enter não
    envia). O bloqueio também desliga (R07, acima: "Escolha outro horário:
    este está bloqueado."), e a sala escolhida que ficou ocupada no horário
    novo também ("Não vai ser agendado: X já está ocupada nesse horário.",
    `[data-sala-ocupada]`; "Escolha outra sala ou outro horário: esta sala
    está ocupada."); o encaixe fora do horário NÃO desliga. **O "Usar o
    próximo livre" aparece no choque, no bloqueio e na sala ocupada** (R14,
    abaixo; era só no choque — `[data-proximo-livre-do-bloqueio]`,
    `[data-proximo-livre-da-sala]`), e é livre da pessoa E da sala escolhida
    (`proximoHorarioLivre` com a sala: os atendimentos e os bloqueios dela;
    o da pessoa já vem de `computeAvailableSlots`). O servidor continua recusando o choque (a ação direta
    prova); a recusa que chega assim mesmo (outra pessoa agendou depois da
    conferência) fica UMA mensagem ("Não foi agendado: …"/"Não foi remarcado:
    …"). Prova: `e2e/agenda-atritos-da-8.spec.ts` ("A21", "A58"),
    `e2e/agenda-encaixe-avisa.spec.ts`, `tests/agendar-choque-recusado-e-avisos.test.ts` ("R06").
  - **O Confirmar espera os avisos DESTE horário** (D9 da 8ª simulação,
    2026-11-06): `avisosDoHorario` roda 200 ms depois de cada mudança, e o
    botão não esperava — a Ana às 23:55, nas férias e fora do expediente,
    gravou "sem nenhum aviso". O "Confirmar agendamento" fica em "Conferindo o
    horário…" até a conferência do horário escolhido chegar (a falha libera,
    sem aviso: o servidor confere ao gravar), como espera as salas (D12 da
    7ª); o "Confirmar novo horário" do remarcar, igual. O aviso (bloqueio,
    fora do expediente, choque) está na tela ANTES de gravar; o encaixe fora
    do expediente segue permitido, e o bloqueio e o choque desligam o
    Confirmar (R06, R07). Prova: `e2e/agenda-defeitos-da-8.spec.ts` ("D9").
  - **A sala escolhida no Agendar risca a grade, e o "Dia inteiro" se diz
    assim** (A17 da 9ª simulação, 2026-11-07; princípio 3): o bloqueio da
    profissional riscava a grade de horários livres do modal, o da sala não —
    a sala bloqueada o dia inteiro parecia livre. Com a sala escolhida,
    `getSchedulingDaySlots` traz também os bloqueios dela ("Sala Rosa:
    Manutenção"), e a grade os mostra como bloqueados (pelo campo de data e
    hora, o bloqueado diz "Não vai ser agendado" — R07). E o aviso dizia "das 00:00 às 24:00": o bloqueio de
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
  - **Quem bloqueia**: quem tem a Agenda em Gerenciar, na unidade ao alcance
    — qualquer pessoa e qualquer sala (o "bloqueia só o seu horário" saiu com
    o "só os meus", SM1, 23/11). Quem só vê a agenda (ou só tem a Minha
    agenda, a vista pessoal — SM2) vê o bloqueio e não bloqueia. Desfazer
    segue a mesma regra.
  - **A vista da SEMANA também mostra** (sobra da F30, 2026-11-05): a célula do
    dia não tem horas, então o bloqueio é uma etiqueta que abre a mesma janela
    (`EtiquetaDoBloqueio`, `[data-bloqueio-da-semana]`; o pedaço do dia por
    `trechoNoDia` — "das 12:00 às 13:00", "o dia todo" no meio das férias): na
    agenda da unidade, o da profissional na célula dela e o da sala numa linha
    "Salas bloqueadas"; na da rede, no dia, com o rótulo de quem é; na "Minha
    agenda", o dia da faixa da semana diz "Bloqueado" (`[data-bloqueado-no-dia]`).
    A etiqueta quebra a linha, não corta (A26 da 22ª: "Bloqueado das 12…").
  - **A semana tem os 7 dias** (D3 da 8ª simulação, 2026-11-06; decidido
    pelo princípio 3): a da unidade ia de segunda a sábado — numa unidade que
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
  a rede inteira — A12). O "Atende" da Equipe é a lista das unidades ativas
  DA PESSOA (desde 23/11 — ver abaixo), cada uma marcável (`users.atende_em`, migration `20261106003601`); numa
  rede de uma unidade, a caixa de sempre. Marcada, a pessoa aparece ali na
  agenda, no agendar (equipe, app e Copilot), no horário dos profissionais, na
  ocupação, no "próximo livre", no repasse da desativação, na comissão e nos
  relatórios. O filtro é UM, `filtroDeQuemAtendeNaUnidade`
  (`lib/cached-queries.ts`: `atende_em cs {unidade}`, num `.or()`), usado por
  `getCachedBranchProfessionals` e por toda lista ou conferência de "quem
  atende aqui" — nunca `branch_id = unidade` nem "a da rede atende em todas".
  A tag da lista é da rede (`professionals:<rede>`).
  - **Na tela, o "Atende" é UMA caixa** (EQ1c, Bloco Equipe, 2026-11-14:
    "Atende" é uma caixa; marcada, atende em todas as unidades dela). Fechada,
    `atende_em` = as unidades da pessoa (a principal e as outras — EQ1a; a rede
    inteira: as ativas na hora de salvar). Com mais de uma unidade, "Escolher
    em quais unidades atende" (fechado por padrão) abre a lista
    (`AtendeDoMembro`, `components/shared/unidades-do-membro.tsx`). `atende_em`
    continua a fonte, e o gatilho `atende_em_sincronizar` usa as unidades da
    pessoa como padrão de quem atende sem a lista. A unidade que a rede abrir
    depois entra no "Atende" de quem tem "A rede inteira" e atende em todas
    (EQ1 — ver "A unidade NOVA", abaixo).
  - **A unidade acrescentada às "Unidades" não entra sozinha no "Atende"** (D9
    da 32ª, decisão do Claude, 26/11, pela regra do Heitor da 8ª: "as que
    estiverem marcadas ficam disponiveis"). Na edição de quem já atende, a
    lista dela fica; a unidade nova aparece desmarcada, com a lista à vista
    (`estadoDoAtende`, `lib/equipe/atende.ts`), e desmarcar antes de salvar
    vale. A caixa só acompanha as "Unidades" quando quem edita a liga ali (ou
    pede "Atender em todas as unidades dela"), e no cadastro novo. A lista
    mandada pela Equipe vai com o cabeçalho `x-bellaris-atende-escolhido`, e o
    gatilho `atende_em_sincronizar` não a estende (migration `20261210500001`).
  - **O "Atende" só vale nas unidades DA PESSOA** (o Heitor, 2026-11-23:
    "não faz o menor sentido a ana ter marcado atende na sul e se a sul nao
    esta entre as unidades dela. uma pessoa só pode atender nas unidades que
    faz parte, isso é obvio"). "A rede inteira" cabe qualquer unidade da rede;
    quem tem unidades, só a principal e as outras dela. Na Equipe, o
    checklist mostra só as unidades escolhidas no campo "Unidades" (tirada
    uma, a marca nela sai do que se envia — e o repasse abaixo pergunta, se
    havia agendamento em aberto ali); no servidor, `createTeamMember` e
    `updateTeamMember` (e o "Marcar no Atende" do Desativar, pelo mesmo
    núcleo) recusam com "O “Atende” só vale nas unidades da pessoa. Sul não
    está entre as unidades dela: marque em “Unidades” ou tire do “Atende”."
    (`atendeForaDasUnidades`, `ATENDE_SO_NAS_UNIDADES_DA_PESSOA`,
    `lib/equipe/atende.ts`). Também a troca de abrangência que deixaria o
    "Atende" de fora é recusada (não se tira a marca calado — princípio 3,
    decisão do Claude); a marca numa unidade DESATIVADA fora das unidades da
    pessoa, que a tela não mostra, sai ao salvar (`atendeQueGrava`,
    `unidadesDaPessoa`). O "Marcar <unidade> no Atende" da janela do
    Desativar (A11, 18ª A29) só sugere quem tem a unidade entre as suas
    (`membroAlcancaAUnidade` em `pendenciasDoMembro`). Prova:
    `tests/atende-so-nas-unidades-da-pessoa.test.ts`,
    `e2e/equipe-atende-por-unidade.spec.ts`,
    `e2e/abrangencia-atende-em-outra-unidade-f73.spec.ts`.
  - **Saiu: alcançar o agendamento DELA numa unidade fora da abrangência**
    (AG-30, de 06/11 até 23/11; a Talita da Água Verde, marcada no Batel,
    iniciava e concluía os dela no Batel). `alcancaOAgendamento`
    (`lib/auth.ts`) é a abrangência e só (`alcancaUnidade`), e segue o nome
    único que `agendamentoAoAlcance`, `startAppointment`, `finishSession`, a
    conclusão, a evolução, o histórico, a ficha de saúde e o anexo conferem.
    O layout de `[slug]` não tem mais o desvio "Os seus atendimentos nessa
    unidade estão na sua agenda" (F73): a unidade fora é o aviso de sempre.
    Cada passo continua com a permissão do módulo dele (o "Atende" não dá
    permissão nenhuma, UM5).
    A "Minha agenda" de quem tem mais de uma unidade traz os dela das outras como cartões ("Na unidade
    Batel", `[data-outra-unidade]`) — e aí os cartões do topo dizem de onde é
    cada número: "Hoje · suas unidades", "Esta semana · suas unidades" e
    "Ocupação hoje · <a unidade>" (A22 da 22ª, `rotulosDaMinhaAgenda`) —, e a
    "Semana" dela lista, embaixo da faixa dos dias, os atendimentos de cada dia
    (fora os cancelados), cada um abrindo o atendimento (A27 da 23ª,
    `semanaEmLista`, `[data-semana-em-lista]`: eram só barrinhas) —, e a agenda inteira da unidade, a lista
    "Seus atendimentos em outras unidades" (`[data-meus-de-outras-unidades]`)
    — nos dois, e na "Agenda de hoje" do dashboard da unidade, a hora do de
    outra unidade sai no relógio da unidade DELE, com o nome quando não é o da
    tela ("18:55 (horário de Cuiabá)"; D3 da 26ª, decisão do Claude pelo
    princípio 3, `horaNaUnidadeDele`; `indicadores.md`);
    os dois abrem a tela do atendimento pelo portal dela
    (`/[slug]/agenda/[id]` resolve a unidade do agendamento). **Quem é da
    rede abre no endereço da unidade DO AGENDAMENTO** (D10 da 9ª simulação,
    2026-11-07): a Carolina, na agenda da Menino Deus, clicava num da Moinhos
    e ia a `/menino-deus/agenda/<id da Moinhos>` — 404. O link da lista é o
    da unidade dele (o portal dela para quem não tem “A rede inteira”), e
    `/[slug]/agenda/[id]` de outra unidade ao alcance redireciona ao endereço
    certo. A lista mostra só o que está EM ABERTO (o concluído de hoje
    aparecia como pendente). Prova: `e2e/agenda-unidade-da-9.spec.ts` ("D10"). "Minhas comissões" (a
    vista pessoal do Financeiro, SM2) cobre também as outras unidades dela em que ela atende,
    com o filtro de unidade (`app/[slug]/financeiro/comissoes`).
  - **`provides_services` = "atende em alguma unidade"**, mantido junto da
    lista por um gatilho só (`private.atende_em_sincronizar`): gravar a lista
    acerta o `provides_services`; gravar só o `provides_services` (o caminho de
    antes) liga com o que a pessoa alcança (sem “A rede inteira” → as dela; da rede → as
    ativas de agora) ou esvazia a lista; trocar a abrangência sem mexer na
    lista leva junto a lista que seguia a abrangência. A lista só aceita
    unidade da rede. Coluna, não tabela membro × unidade: a tabela com
    chave estrangeira para `users` e `branches` viraria junção no PostgREST
    (PGRST201, §14 do CLAUDE.md).
  - **A unidade NOVA entra no "Atende" de quem tem "A rede inteira"** (EQ1 do
    Bloco Equipe, o Heitor, 2026-11-14, "Concord." à "A rede inteira (todas,
    inclusive as que vierem)"): quem é da rede inteira e atende em todas as
    outras unidades ativas passa a atender na que abriu — ou voltou a abrir
    (`trg_atende_na_unidade_nova`, migration `20261123900002`; `createBranch`
    e `toggleBranchStatus` expiram a lista de quem atende). Quem escolheu à
    mão um subconjunto fica como escolheu, e quem é de unidades não ganha a
    nova. Era "nasce sem ninguém marcado (princípio 6)" — saiu na auditoria
    das regras, 2026-11-18. Sem ninguém assim, a Equipe
    dela (e a da rede) diz "Ninguém atende nesta unidade ainda" (`[data-ninguem-atende]`),
    como o cartão dela em Configurações → Unidades ("N pessoas atendem aqui",
    `[data-quem-atende-na-unidade]`).
  - **Quem não tem “A rede inteira” (com a Equipe em Gerenciar) marca e desmarca só as DELA** (H7): as outras
    unidades do membro aparecem travadas no checklist, e `updateTeamMember`/
    `createTeamMember` mudam só a dela (`atendeQueGrava`, `lib/equipe/atende.ts`).
    Quem é de fora e atende ali aparece na Equipe da unidade ("Da rede"), sem
    ações — "Da unidade X" só sobra para dado de antes de 23/11 (o "Atende"
    só vale nas unidades da pessoa).
  Prova: `e2e/equipe-atende-por-unidade.spec.ts`, `tests/equipe-atende.test.ts`,
  `e2e/agenda-profissional-da-rede.spec.ts` (a da rede marcada nas duas).
- **O nome de quem está no registro da unidade não vem pelo join da SESSÃO**
  (D2 da simulação de 2026-11-01): a agenda da unidade (o cartão, a janela,
  a "Minha agenda") e o Financeiro da unidade leem o agendamento e o
  lançamento pela sessão, mas o nome da cliente e do profissional sai de
  `nomesDosRegistros` (`lib/nomes-dos-registros.ts`, cliente de serviço, com
  a rede, só os ids dos registros já lidos). Pela sessão, a política de
  `users` mostra a quem não tem “A rede inteira” só os membros das unidades
  dele: o profissional da rede virava "—". A de `clients` recortava pela
  unidade de CADASTRO até 2026-11-18 — era "decisão de produto", do Claude,
  contra a fala do Heitor ("o cliente não é da unidade, o cliente é da rede",
  H16; CL-P1): agora confere a REDE (migration `20261124200001`,
  `crm-inbox.md`; prova `e2e/rls-cliente-da-rede.spec.ts`). O contorno pelo
  servidor fica, sem dano. Prova: `e2e/agenda-nomes-de-outra-unidade.spec.ts`.
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
  Só quem tem a unidade do agendamento entre as suas (desde 23/11: o "Atende"
  só vale nas unidades da pessoa).
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
- **A Admin da rede que atende** (D2 da simulação de 2026-10-29): o Admin da rede
  marca "Atende clientes", a comissão e o horário na Equipe da rede com o
  cargo TRAVADO (CLAUDE.md §11; só outra Admin da rede muda o cargo dela,
  revisão do Heitor de 2026-10-29) e entra na agenda, no agendar e na comissão
  como qualquer profissional da rede. A **Equipe da unidade** lista também
  quem é de fora e atende ali (ativo, com a unidade marcada no "Atende"), com o chip "Da rede" ou "Da unidade X", só o nome e o
  cargo, e SEM ações: cargo, comissão e acesso se mexem na Equipe da rede
  (quem é da rede vê o lápis que leva para lá). A sessão de unidade não lê
  membros da rede (RLS): essa lista vem pelo servidor. **E diz o recorte**
  (A12 da 6ª simulação, 2026-11-04: quem não tinha “A rede inteira” via 3 de 7 sem saber por
  quê): "Equipe da unidade Casa Forte: quem é dela e quem é da rede e atende
  aqui. Quem é da rede e não atende fica na Equipe da rede."
  (`[data-recorte-da-equipe]`); o "Adicionar membro" dela diz "Entra na
  unidade Casa Forte." (A13). A quem é da rede inteira, ela diz onde a pessoa
  se acha (A8 da 26ª, princípio 7: a Admin da rede não achava onde marcar o
  próprio "Atende"): "Quem é da rede inteira (você também) está na Equipe da
  rede: é lá que se marca o “Atende clientes” de cada um.", com o link
  (`[data-equipe-da-rede]`; `tests/equipe-atende.test.ts`). Prova:
  `e2e/equipe-dona-que-atende.spec.ts`.
- **A Admin cadastra outra Admin direto** (eq-01, revisão do Heitor de
  2026-11-02: "oferecer no cadastro; o caminho em dois passos não protege
  nada"): o "Adicionar membro" da Equipe da rede oferece o cargo de sistema
  Admin a quem É Admin (`cargoDeAdminId`); escolhido, a abrangência não se
  pergunta — a Admin é da rede toda (o servidor já gravava assim e recusa a
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
  atendimento começa de Confirmado ou de Chegou. Chegar não emite documento
  nenhum: desde o DC4 (2026-11-14) todos nascem ao agendar (`documentos.md`). Lista nova de status "em aberto" inclui ARRIVED.
  Prova: `e2e/agenda-check-in.spec.ts`.
- **A chegada e o início num gesto, no agendamento dela** (A21 da simulação de
  2026-10-27): no agendamento DELA que ainda não chegou (Agendado ou
  Confirmado), a tela do atendimento e a janela da agenda mostram "Marcar
  chegada e iniciar" (`chegarEIniciar`, `actions/appointments.ts`) — o MESMO
  `checkinCore` (o plano em aberto aparece na tela
  como em todo check-in) e depois o MESMO `startAppointment` (a trava dos
  documentos). Cada metade com o seu módulo (UM2): a chegada pede a Agenda em
  Gerenciar, e iniciar o Atendimento em Gerenciar (desde 2026-11-18, §9.1
  "Quem faz o quê na agenda e no atendimento"): sem os dois, o "Marcar
  chegada e iniciar" não aparece, e sem o Atendimento nem o "Iniciar"
  (`podeAtenderEste`). Sem o
  check-in no cargo, a tela diz que quem tem a Agenda em Gerenciar marca a chegada
  — e o NOME de quem marca (A10 da 19ª, princípio 3; `quemMarcaAChegada`,
  `textoDeQuemMarcaAChegada`). Prova:
  `e2e/agenda-chegar-e-iniciar.spec.ts`, `tests/atritos-da-19-atendimento.test.ts`. **E a quem atende AQUELE
  agendamento** (A25 da 6ª simulação,
  2026-11-04): a Admin da rede que atende, na agenda da unidade, chegava ao dela em
  quatro cliques e uma confirmação ("Chegou" → "Iniciar" → "mesmo assim"); a
  janela (dos dois portais) oferece "Marcar chegada e iniciar" quando o
  agendamento é do membro logado e ele tem a agenda e o Atendimento em
  Gerenciar (`meuId`, `podeAtenderEste`).
  O início adiantado continua perguntando (r2-age-06). Prova:
  `e2e/agenda-dona-chega-e-inicia.spec.ts`.
  **Um gesto de chegada em destaque** (A5 da 10ª simulação, 2026-11-10;
  princípio 3): no agendamento DELA a janela tinha "Confirmar agendamento",
  "Chegou" e "Marcar chegada e iniciar", dois em rosé. Só o próximo passo é
  primário — o gesto dela no agendamento dela (que vem primeiro); chegou,
  iniciar; confirmado, a chegada; agendado, confirmar — e, com mais de um, a
  linha diz o que cada um faz ("Confirmar: a cliente confirmou que vem.
  Chegou: ela está na espera. …", `[data-o-que-cada-um-faz]`). **Quem não
  inicia nem conclui lê ANTES de iniciar** (A20): sem o Atendimento em
  Gerenciar, a
  janela (`podeConcluir`) e a tela do atendimento não
  oferecem o "Iniciar" nem o "Finalizar" e dizem quem faz já no
  agendado/confirmado/chegou — pela PERMISSÃO e com os nomes (A9 da 20ª,
  `textoDeQuemConclui`, `quemConcluiOAtendimento`): "Iniciar e concluir o
  atendimento é de quem tem o Atendimento em Gerenciar (…)". **É um aviso
  que trava, à vista** (A12 da 21ª; princípio 3): fundo de aviso, cadeado e
  "Você não inicia nem conclui este atendimento." antes da frase (na janela,
  no topo das ações; na tela, antes do botão). Marcar a chegada continua da
  Agenda em Gerenciar. A regra é a do Heitor, 2026-11-18 ("Agenda é agenda e atendimento é atendimento. Só inicia e conclui atendimento quem tem gerenciar no atendimento.");
  até ali concluir pedia o Prontuário em Gerenciar. **Os nomes são de quem
  tem o Atendimento em Gerenciar** (UM2; `quemConcluiOAtendimento`: ativos,
  ao alcance da unidade, e a Admin da rede sempre), na janela da agenda dos
  dois portais e na tela do atendimento (a mesma função). Saíram com o "só
  os meus" (SM1, 23/11) o "e a Agenda de todos" (D1 da 22ª) e a profissional
  que concluía só o dela (A9 da 25ª). E
  o concluído A RECEBER não diz "Este agendamento já foi encerrado." embaixo
  do "Receber no PDV" (A14; era o "Receber pagamento" — desde o PDV7 a
  janela leva à comanda do atendimento no PDV, `rotaDaComanda`). Prova:
  `e2e/atendimento-uso-da-10.spec.ts`.
- **A tela do atendimento abre com o Atendimento em Ver** (UM1, 2026-11-23;
  era a Agenda em Ver) — ou, como vista pessoal (SM2), a quem atende e não
  tem o módulo, só no agendamento DELA (`app/_shared/sessao-de-atendimento.tsx`,
  os dois portais; o de outra pessoa pelo id é `semAcesso()`). A vista só
  MOSTRA: o que se faz ali pede a permissão de cada passo. Quem tem o módulo
  abre o atendimento de qualquer pessoa, na unidade ao alcance. Saiu com o
  "só os meus" (SM1) a tela "Este atendimento é de outra pessoa que atende"
  e a recusa pelo id do agendamento de outra pessoa (`deOutroProfissional`,
  D4 de 28/10). **A janela do agendamento leva a ela** (A8 da 28ª simulação;
  decisão do Claude, 25/11, pelo UM1): fora do Em atendimento, quem tem o
  Atendimento em Ver (ou a vista pessoal, no dela) acha o "Abrir a tela do
  atendimento" na janela (`[data-abrir-o-atendimento]`) — sem ele, quem só vê
  não tinha caminho até a tela. Prova:
  `tests/sessao-do-atendimento-o-que-a-tela-diz.test.ts`.
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
  **O que falta assinar vem ANTES da pergunta** (A7 da 29ª, princípio 7: a
  pergunta vinha primeiro e, respondida, o banco recusava pelo termo): com
  documento que BLOQUEIA aberto, `startAppointment` responde "Falta assinar: …
  Colha a assinatura antes de iniciar o atendimento." (a frase da trava do
  banco, `faltaAssinarParaIniciar`, `lib/appointments/documentos-do-inicio.ts`)
  sem perguntar do horário, e o "Marcar chegada e iniciar" marca a chegada sem
  perguntar e diz o que falta, com o "Colher assinatura neste aparelho". A
  trava continua sendo o gatilho. Prova: `tests/inicio-diz-antes-o-que-falta.test.ts`.
- **A chegada é do DIA do agendamento** (A18, 2026-10-27): `checkinCore`
  recusa fora do dia (Brasília, `ehODiaDoAgendamento`) — vale para a agenda, o
  Copilot e "Marcar chegada e iniciar" — e a janela não oferece "Chegou". O
  cancelado traz o motivo inteiro na janela e no tooltip do bloco. **No
  "Marcar chegada e iniciar", a trava do dia vem ANTES da pergunta do
  horário** (D10 da 7ª simulação, 2026-11-05): numa sessão de amanhã a tela
  perguntava "Iniciar mesmo assim?" e só no clique dizia "A chegada só se
  marca no dia do agendamento". `chegarEIniciar` confere o dia
  (`ehODiaDoAgendamento`) antes de `perguntaDoInicio`. Prova:
  `e2e/agenda-inicio-adiantado.spec.ts` ("D10"). **E a tela do atendimento
  também não oferece a chegada fora do dia** (D2 da 28ª simulação; decisão do
  Claude, 25/11, CLAUDE.md §14: o botão que não se pode usar, a tela esconde):
  o "Check-in" e o "Marcar chegada e iniciar" da tela do atendimento só
  aparecem no dia (`ehODiaDoAgendamento`, no fuso da unidade), e o `{ error }`
  do check-in aparece na tela — era descartado, e o clique não fazia nada.
  Prova: `tests/sessao-do-atendimento-o-que-a-tela-diz.test.ts`.
- **A "Minha agenda" só mostra** (SM2, 2026-11-23): é a vista pessoal de quem
  atende e não tem a Agenda — não agenda nem bloqueia; agendar é da Agenda em
  Gerenciar, para qualquer pessoa que atende na unidade. Saiu com o "só os
  meus" (SM1) o "Agendar" da Minha agenda só para ela (A25 da 8ª).
- **Trocar a profissional pela janela, com confirmação e "de quem para quem"**
  (A22 da 8ª simulação, 2026-11-06): só se trocava arrastando, sem
  confirmação, e o histórico dizia "Remarcado". A janela do agendamento tem
  "Trocar profissional" (`TrocarProfissional`, a quem tem a Agenda em
  Gerenciar, UM1–UM5; o "no agendamento DELA" do "só os meus" saiu com o
  SM1): só quem ATENDE na unidade do agendamento E está livre no horário —
  sem choque e sem bloqueio (R13, abaixo; era "(ocupada)" desligada, e a
  bloqueada aparecia — `profissionaisParaTrocar`, `indisponibilidadeNoHorario`).
  Ninguém livre: "Ninguém está livre nesse horário. Para trocar em outro
  horário, remarque antes." E "Trocar quem atende de A para B?" antes. Arrastar para a coluna de outra
  profissional pergunta também ("Trocar quem atende de A para B e marcar às
  14:00?", `[data-confirmar-arraste]`; o texto neutro é da revisão de 24/11). O servidor recusa quem não atende na
  unidade (`recusaDeQuemNaoAtende`, em `reassignProfessional` e no
  `remarcarCore` com outra profissional), e o histórico grava "Profissional
  trocado de A para B" (`textoDaTroca`; a janela o mostra — `rotuloDaAcao`,
  que diz também o novo horário da remarcação, a da equipe e a da cliente pelo
  app: "Remarcado pela cliente no app para 25/11, 14:00" — A20 da 27ª).
  Soltar no ocupado diz o porquê, em destaque (8 s). E o horário do arraste é
  o da posição na coluna: somar o `scrollTop` da grade outra vez (o retângulo
  da coluna já anda com a rolagem) jogava o solto para horas depois. Prova:
  `e2e/agenda-atritos-da-8.spec.ts` ("A22").
- **Mudar a UNIDADE de um agendamento pela janela** (A33 da 9ª simulação,
  2026-11-07; H5: "a cliente é da clínica"): mover a sessão da Luana para a
  Menino Deus exigia cancelar e refazer — o Remarcar só muda o horário e o
  "Trocar profissional" só oferece quem atende na unidade. A janela do
  agendamento em aberto (Agendado/Confirmado), na rede de duas ou mais
  unidades e para quem tem a Agenda em Gerenciar, tem "Mudar de
  unidade" (`MudarDeUnidade`, `[data-mudar-de-unidade]`): a unidade nova (as
  que quem muda alcança), a profissional que ATENDE lá e está livre no
  horário, e a sala (opcional) que serve ao procedimento e está livre (R13,
  abaixo; era "(ocupada)" desligada, e a bloqueada aparecia —
  `opcoesParaMudarDeUnidade`). Sem ninguém livre: "Ninguém está livre nesse
  horário. Para mudar para X em outro horário, remarque antes."; sem sala
  livre: "Nenhuma sala de X está livre nesse horário: o agendamento vai sem
  sala." O horário fica. Confirma antes. O
  servidor confere tudo de novo (`mudarUnidadeCore`, `lib/appointments/alteracoes.ts`:
  as duas unidades ao alcance, `conferirPecasDoAgendamento`,
  `recusaDeQuemNaoAtende`, conflito da profissional e da sala); o avulso sem
  lançamento passa ao preço da unidade nova (D2), o já pago fica com o dele;
  o histórico grava "Unidade mudada de Moinhos para Menino Deus"
  (`BRANCH_CHANGED`) e a troca de profissional; a cliente recebe o "Novo
  horário … na unidade Menino Deus". A Equipe diz que "Unidade" (o acesso) e
  "Atende clientes em" (onde agenda) são dois controles
  (`[data-atende-e-unidade]`). Prova: `e2e/agenda-unidade-da-9.spec.ts` ("A33").
- **O remarcar da janela AVISA antes de confirmar** (A25 e cli-01, 2026-11-02):
  o horário novo fora do expediente da profissional e o choque (a conta do
  agendar, `avisosDoHorarioCore`, sem o próprio agendamento), e a cliente
  ARQUIVADA ("avisar ao remarcar, sem recusar" — revisão do Heitor):
  `avisosDoRemarcar` → `[data-aviso-do-remarcar]`. Só aviso: o remarcar
  continua. Prova: `e2e/agenda-remarcar-avisa.spec.ts`.
- **Os atritos da agenda da 11ª simulação** (2026-11-10; princípios 2 e 3):
  - **Na agenda da REDE, o bloqueio de UMA profissional é uma faixa estreita**
    na borda da coluna da unidade, com o rótulo dizendo de quem é (A23: pintava
    a coluna inteira, e parecia a unidade fechada; `BlocoDoBloqueio estreita`,
    `[data-bloqueio-estreito]`). O da sala segue como era; na agenda da
    unidade, a coluna já é dela.
  - **Remarcar para um horário que já passou RECUSA** (o Heitor, 25/11:
    "remarcar para o passado é possível desde que não tenha passado do horario
    já, o que tornaria impossível desse atendimento acontecer" — confirmado na
    mesma data: para mais cedo que o marcado pode; para um horário que já
    passou, recusa. Era aviso desde a A24 da 11ª). A conferência antes de
    confirmar diz "Não vai ser remarcado: Esse horário (09/11/2026 às 10:00) já
    passou. Escolha a partir de 10/11/2026 às 10:40." e o núcleo
    (`remarcarCore`) recusa; só trocar a profissional, com o mesmo horário, não
    é horário novo. O MESMO vale no Agendar, no SERVIDOR
    (`createAppointmentCore`, todo caminho que agenda): até 25/11 a recusa da
    AG-06 era só a do navegador. O minuto de agora vale (a cliente que chegou
    sem horário; decisão do Claude, 25/11). A regra mora em
    `recusaDoHorarioPassado` (`lib/appointments/horario-passado.ts`). Prova:
    `tests/agenda-remarcar-no-passado.test.ts`.
  - **O atraso do início se diz** (A25: começar 57 min depois não dizia nada,
    e antes da hora a tela pergunta): sem perguntar (atrasar não é engano de
    agendamento), a tela do atendimento diz "Atrasado: 57 min depois do horário
    marcado (10:00)." antes de iniciar (o relógio do navegador, `useAgora`) e,
    iniciado, "Iniciado 57 min depois do horário marcado (10:00)."
    (`atrasoDoInicio`, `lib/appointments/inicio-adiantado.ts`; até 5 min é a
    hora — a régua da tela). Nada se grava.
  - **A "Minha agenda" abre perto de agora** (A26: na unidade 24 h ela abria
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
    e a legenda quebram a LINHA (`[data-legenda-da-agenda]`; a legenda é uma
    só nas duas agendas, com o Concluído e o Agendado tracejado —
    `LEGENDA_DA_AGENDA`, `lib/agenda/legenda.ts`, A6 da 29ª), e "Minhas
    comissões" fica no topo dela para quem tem o Financeiro em Ver ou a vista
    pessoal das comissões (SM2; `[data-minhas-comissoes]`).
  - Ficou como está: o toque no cartão da "Minha agenda" abre o atendimento, e
    o da agenda da unidade abre a janela de ações (A25) — é o desenho do
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
  no dashboard da REDE (H3, "a dona vê tudo, sempre": quem tem o cargo Admin da rede, na rede de uma
  unidade só, usa o /admin), das unidades do recorte, com a unidade de cada linha quando
  há mais de uma e o link para `/admin/agenda/<id>`. Na vista pessoal (a
  Minha agenda, SM2), só os dela (`vistaPessoal(ctx, 'agenda')`). Prova:
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
  A tela "Confirmar e avaliar" diz a mesma hora real: "Concluído em 12 de
  novembro às 18:11" (`completed_at`; sem ele, a marcada — A9 da 17ª
  simulação). Prova: `tests/atritos-da-17-cadastros.test.ts`.
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
  atendimento, com a ficha de saúde. **A alergia vai em destaque** na ficha e no
  atendimento (`alergiasDaAnamnese` + `AlertaDeAlergia`: o campo `allergies` ou
  de rótulo "alerg…", sem "não"/"nenhuma"), só para quem vê o prontuário.
  **As anotações da ficha aparecem junto da ficha de saúde** (A28 da 8ª simulação,
  2026-11-06): a alergia que veio da planilha nas anotações da cliente
  (`clients.notes`) não chegava ao atendimento. A tela do atendimento mostra
  "Anotações da ficha da cliente: …" como estão escritas
  (`[data-anotacoes-da-ficha]`), só a quem vê o prontuário — sem interpretar
  o texto nem virar faixa de alergia (atend-15: "nada interpreta texto"), e
  sem copiar para a ficha de saúde. Prova: `e2e/atendimento-atritos-da-8.spec.ts`
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
  comentário. O botão tem um rótulo só, "Confirmar que realizei o
  atendimento" (`BOTAO_DE_CONFIRMAR_NO_APP`; A36 da 23ª: o da A41 da 22ª
  mudava ao marcar as estrelas), e o cartão diz "Avalie (opcional) · vai
  junto ao confirmar". Confirmado, o aviso diz "Atendimento confirmado;
  avaliação enviada." (A45 da 24ª, `textoDoConfirmadoNoApp`). **O que ela avalia é da rede** (Configurações → Geral, "O que
  a cliente avalia", `tenants.avaliacao_o_que`): "O atendimento e cada
  procedimento" (`OS_DOIS`, o padrão), "Só o atendimento" ou "Só cada
  procedimento"; só a Admin da rede muda (`recusaDaConfigDaRede`; o Heitor,
  2026-11-18: "Configuração da rede toda só pela conta admin" — era quem tinha
  “A rede inteira”).
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
    só o que a rede pede (a configuração é lida lá dentro), e recusa o
    procedimento que não foi feito ("Esta avaliação tem um procedimento que
    não foi feito neste atendimento.").
  - Nos rankings (`indicadores.md`): o por procedimento usa só a nota
    PRÓPRIA de cada procedimento (a da avaliação por procedimento, senão a
    `procedure_rating` de antes no procedimento do agendamento); o por
    profissional, a do atendimento. **O procedimento sem nota própria fica
    FORA da média** — não herda a nota do atendimento (decisão do Claude pelo
    princípio 4, 2026-11-18, na auditoria das regras: com "Só o atendimento"
    cada procedimento herdava a nota dele; `metrics_notas_dos_procedimentos`,
    migration `20261123900003`). A configuração (Configurações → Geral) e o
    dashboard ("Procedimentos melhor avaliados") dizem isso
    (`TEXTO_DA_NOTA_DO_PROCEDIMENTO`, `lib/avaliacao/notas.ts`). Com "Só cada
    procedimento", quem atendeu fica com a média das notas daquele
    atendimento (decidido pelo princípio 3). A avaliação de ANTES continua
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
  pela agenda ou pelo Copilot, e seja quem tem o CRM da rede ou de UNIDADE (o `isComercial` antigo
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
  prazo, só "Falar com <a rede>" (o nome dela, CA1 — `crm-inbox.md`; o WhatsApp da unidade). Prova:
  `e2e/portal-cliente-alterar-agendamento.spec.ts`.
  **Os prazos acima do comum avisam, não recusam** (o Heitor, 25/11, sobre
  este prazo, a validade do plano proposto e a da ficha de saúde: "Se não for
  impossível, ainda que improvável, pode ser feito."): acima do teto de antes
  (720 horas, 365 dias, 36 meses) o campo diz "Acima do comum (mais de 720
  horas). Confira: o valor vale como está." e o servidor grava. Só o impossível
  se recusa (decisão do Claude, 25/11): negativo, zero onde não cabe (a
  validade do plano e da ficha começam em 1; este prazo aceita 0),
  fracionário, e acima de 100 anos — cada um vira uma data, e a conta da data
  estoura no banco: 876.000 horas, 36.500 dias, 1.200 meses
  (`LIMITE_DE_HORAS`/`_DIAS`/`_MESES`, `lib/acima-do-comum.ts`). A regra mora
  em `lib/configuracoes/prazos-da-rede.ts` (a tela e as actions); o banco tem a
  mesma faixa (migration `20261207000001`). Prova:
  `tests/prazos-da-rede-acima-do-comum.test.ts`.
  O prazo aparece em DIA E HORA (J-61, `limiteParaAlterar`,
  `lib/clientes/agenda-do-portal.ts`, Brasília): "Pelo app, você cancela ou
  remarca até terça-feira, 03/11 às 10:00 (24 horas antes do horário)" — o dia
  da semana por extenso (A58 da 11ª simulação, 2026-11-10: "até ter, 10/11"),
  "O prazo …
  terminou em …", e no cartão da agenda "Alterar até …", com a seta de que o
  cartão abre. O limite que cai em outro ano que o do horário diz o ano
  ("terça-feira, 08/12/2026 às 02:00", decisão do Claude, 25/11, pelo princípio
  3: o prazo pode passar de um ano, e "08/12" se leria como o dezembro seguinte). **Fora do prazo, a saída é inteira** (A53 da 7ª simulação,
  2026-11-05; a regra do prazo fica): o cartão da lista diz "Prazo do app
  encerrado: fale com <a rede> para alterar" (`[data-prazo-encerrado]`; o
  nome da rede, CA1), e o detalhe (`[data-fora-do-prazo]`) diz até quando
  era, "Falar com <a rede>"
  com a mensagem "Preciso cancelar ou remarcar o meu agendamento de X em
  DD/MM HH:MM (o prazo do app já passou)" e "Ligar" (`tel:`). O motivo do cancelamento é "Motivo (opcional)" (J-64). Prova:
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
  **E lista quem realiza e marca os dias livres** (22ª A42, 2026-11-17;
  princípio 7, como o Agendar do app): além de "Só com X" e "Sem
  preferência", um seletor com as OUTRAS pessoas que realizam o procedimento
  e atendem na unidade do horário novo (`[data-com-quem]`, "Ou com outra
  pessoa"; "Com quem?" quando a de hoje não atende lá —
  `quemRealizaNoRemarcar`, sobre `quemRealizaNaUnidade` do núcleo, a mesma
  lista do `candidatasDoDia`). E os dias com horário livre nas próximas duas
  semanas, pela escolha, em chips (`[data-dias-livres]`,
  `diasLivresParaRemarcar`; `DIAS_DO_REMARCAR` = 14, a partir de hoje no
  relógio da unidade). Escolhida outra pessoa, os horários e o remarcar são
  os DELA (`horariosParaRemarcar`/`remarcarPelaCliente` com
  `profissionalId`: o servidor confere que ela realiza, atende lá e está livre
  no horário), e o agendamento deixa de ser "Sem preferência". Prova:
  `e2e/portal-cliente-remarcar-com-quem.spec.ts`.
  **E diz quem atende ANTES de confirmar, sem contar o próprio horário** (A56
  da 11ª simulação, 2026-11-10; princípio 3: a Bruna virou Carla e a cliente
  só soube depois): escolhido o horário em "Sem preferência", "Com Bia (a
  mesma de antes) — quem está livre neste horário."
  (`[data-quem-atende-no-remarcar]`, `quemAtendeNoRemarcar`, a MESMA escolha do
  remarcar); e o próprio agendamento não conta como atendimento do dia de quem
  o tem (`candidatasDoDia` com `ignorarAgendamentoId` tira ele da contagem —
  contava, e a escolha pendia para a outra). **O horário novo dentro do prazo
  avisa** (A57 da 11ª): "Este horário fica a menos de 24 horas: depois de
  remarcar, para mudar de novo ou cancelar, fale com <a rede>." (o nome, CA1)
  (`[data-dentro-do-prazo]`), como o Confirmar do agendar (A52 da 8ª, que já
  valia para qualquer dia). Prova: `e2e/portal-cliente-atritos-da-11.spec.ts`.
  **E o "Sem preferência" diz o que é, e o remarcado diz com quem** (A50 e A51
  da 12ª simulação, 2026-11-11; princípio 3: a Ana via "Sem preferência"
  marcado ao lado de "Com Helena" e não sabia se a profissional podia mudar; a
  Sabrina passou da Eva à Fernanda e o "Agendamento remarcado." não dizia):
  marcado, "Sem preferência: hoje o agendamento é com Helena; no horário novo,
  fica com quem estiver livre — pode ser outra pessoa. Para ficar com
  Helena, escolha “Só com Helena”." (`[data-o-que-e-sem-preferencia]`; o outro
  botão é "Só com X"); o "Confirmar novo horário" espera a conta de quem atende
  ("Conferindo quem atende…"; a falha libera, o servidor confere ao gravar); e
  o aviso é "Agendamento remarcado: com Fernanda, quinta-feira, 13/11 às
  11:00." (`remarcarPelaCliente` devolve `quemAtende`). **O agendar dentro do
  prazo diz o que acontece com ESTE agendamento** (A52 da 12ª): "o agendamento
  nasce sem cancelar nem remarcar pelo app (pelo app, só até 24 horas antes)",
  e o "Horário marcado" repete ("…para cancelar ou remarcar, fale com a
  equipe"). Prova: `e2e/portal-cliente-atritos-da-12.spec.ts`.
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
  `e2e/agenda-rede-de-uma-opcao.spec.ts`.
- **A cliente agenda em QUALQUER unidade da rede pelo app** (H5, decisão do
  Heitor, 2026-11-01: "A cliente é da clínica, pode agendar em qualquer
  unidade da clínica"; A62/A65 da 5ª simulação). A ficha é da REDE: o portal
  de qualquer unidade ATIVA da rede da ficha abre a mesma ficha
  (`slugsDaRede` em `fichaDaRequisicao`, e o layout de `[slug]` confere a
  rede e que a unidade está ATIVA — a de cadastro não tem exceção). **O
  destino do login é a ÚLTIMA unidade usada no portal** (auditoria das
  regras, 2026-11-18; era a de cadastro): cada entrada anota a unidade do
  endereço em `clients.portal_ultima_unidade` (`registrarEntradaNoPortal`), e
  o login, o seletor de rede e o "entrar" vão a ela; sem nenhuma (ou
  desativada), a primeira unidade ativa da rede por nome (`unidadeDoPortal`,
  `lib/clientes/unidade-do-portal.ts` — decisão do Claude pelo princípio de
  que qualquer unidade abre a mesma ficha, 18/11). O pedido de assinatura
  pelo app vai ao portal da unidade do DOCUMENTO (ou da de quem pede), e o
  aviso de pontos a vencer ao da unidade dos PONTOS que vencem
  (`avisos_de_vencimento`, migration `20261124200004`), cada um com a última
  usada como reserva. Com mais de uma unidade, o agendar começa por "Em qual
  unidade?": cada uma é o agendar do endereço DELA, e os procedimentos, as
  profissionais e os horários vêm de lá; o resumo diz a unidade. Os cartões da
  Agenda do app dizem a unidade de cada agendamento quando a rede tem mais
  de uma. Até 2026-11-02 a Zona Sul voltava à Moinhos sem aviso, e o agendar
  dava 404 fora da unidade de cadastro. A lista de unidades da cliente é cache
  de 5 min (`getCachedFichasDoLogin`): a unidade nova aparece no app em até
  5 min. Prova: `e2e/portal-cliente-outra-unidade.spec.ts`,
  `tests/ficha-da-requisicao.test.ts`, `tests/portal-sem-unidade-de-cadastro.test.ts`,
  `tests/aviso-de-vencimento-sem-unidade-de-cadastro.test.ts`.
  **O aviso "Horário marcado" diz a unidade** quando a rede tem mais de
  uma ativa (A28 da 6ª simulação, 2026-11-04): "Botox em 05/11 às 10:00, na
  unidade Boa Viagem." (`textoDoHorarioMarcado`, `unidadeParaOAviso`, nos dois
  avisos de agendamento novo). Prova: `e2e/pacote-sessao-agendar.spec.ts`,
  `tests/texto-do-horario-marcado.test.ts`.
  **E o remarcado e o cancelado também; e nenhum aviso decide o gênero** (A48
  da 9ª simulação, 2026-11-07): "Seu Avaliação foi concluído" e "Seu Drenagem
  linfática foi concluído" — o nome do procedimento é da rede, e o texto
  não decide por ele. Os avisos à cliente ficam neutros, com o procedimento
  depois de dois-pontos ("Atendimento concluído: Avaliação.", "Pagamento
  confirmado: Avaliação.", "Agendamento cancelado: Avaliação de 07/11 às
  10:00, na unidade Moinhos.", "Novo horário: … na unidade Moinhos." —
  `lib/appointments/texto-do-aviso.ts`), e o da equipe também ("Cancelado:
  Juliana — Avaliação de …"). Prova: `tests/textos-dos-avisos-da-9.test.ts`.
  **O motivo do cancelamento vai no aviso, e o campo diz** (A11 da 25ª;
  princípio 3): "Vai também no aviso à cliente." embaixo do "Motivo do
  cancelamento *", na janela da agenda e na sessão
  (`[data-motivo-vai-a-cliente]`). Prova: `tests/atritos-da-25-atendimento.test.ts`.
- **O agendar do app passa pelo NÚCLEO da agenda** (por-05, revisão do Heitor
  de 2026-11-02): `createClientAppointment` confere o que é do app (o
  procedimento visível no app, o horário entre os livres, quem atende na
  unidade, o "Sem preferência") e grava por `createAppointmentCore` —
  peças da rede, arquivada, conflito, preço, crédito pré-pago/pacote,
  oportunidade aberta e o evento "agendamento criado" (com o ator `cliente`),
  que o app não emitia. Só a sessão livre do PLANO se liga depois, no app.
- **A cliente ARQUIVADA não agenda pelo app** (o Heitor: "concordo"): o
  agendar mostra "Fale com <a rede> para agendar." (o nome dela, CA1) e o
  cartão da unidade (`AgendarComAEquipe`), e `createClientAppointment` recusa
  com a mesma frase (`clienteArquivadaNoApp`, `lib/clients/arquivada.ts`). Prova: o mesmo spec.
- **O cartão do pacote leva ao agendamento DELE** (A63 da 5ª simulação): na
  home do app, o pacote diz "N de M sessões realizadas · restam R" e, pela
  próxima sessão livre, "Agendar <procedimento>" — o agendar abre já na
  profissional (`?procedimento=`). Se o procedimento não é agendável pelo app
  (fora do app, inativo ou de outra unidade), diz "<procedimento>: agende com
  a equipe.", com o WhatsApp. Era "Agendar procedimento", cuja lista não tinha
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
  a rede deu ao plano e o desconto** (A55 da 12ª simulação, 2026-11-11;
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
  confirmado ou já chegou) E com o horário ainda por vir — os "Próximos" da
  Agenda e o "Próximo agendamento" da home. O que passou sem ser fechado vai
  ao histórico. A Agenda filtrava só o status, e o de ontem que já tinha chegado
  aparecia em "Próximos". Prova: `tests/agenda-do-portal.test.ts`. **O de
  HOJE fica até a conclusão** (A51 da 7ª simulação, 2026-11-05: às 15:00 o
  das 10:00 ainda "Agendado" sumia, e a home dizia "Nenhum agendamento
  próximo"): "Próximo" é em aberto (agora também em atendimento) e de HOJE
  em diante (`inicioDosProximos`, o início do dia de Brasília); o que passou
  da hora diz "Hoje, já no horário: a equipe registra quando o atendimento
  terminar." (`[data-passou-da-hora]`). O de ontem em aberto segue no
  histórico. **O horário que já ACABOU** (início + duração; agendado ou
  confirmado) diz isso (A46 da 24ª, `horarioPassouSemAtender`): o cartão da
  Agenda, "Horário passou" no lugar de "Agendado" e "O horário já passou; a
  equipe ainda vai registrar o atendimento." no lugar de "Prazo do app
  encerrado"; a home, o mesmo texto no lugar de "Hoje, já no horário". **O
  cartão dentro do prazo tem o "Remarcar"** (A47 da 24ª, princípio 7): abre o
  detalhe com o formulário já aberto (`?remarcar=1`, `abrirRemarcando`). Prova: o mesmo teste e `e2e/portal-cliente-alterar-agendamento.spec.ts` ("A51").
  **Acima dos "Próximos", o "Em andamento"** (o Heitor, 25/11, sobre o
  atendimento que dura mais de um dia: "Um "Em andamento" não seria
  melhor?"; e a regra que ele aprovou: "Em aberto, com o início já passado e
  o fim ainda por vir, de qualquer dia (o de 30 horas que começou ontem
  entra). Sai dali quando a equipe conclui ou quando o horário acaba. O que
  acabou sem ser fechado segue a regra de hoje: fica em "Próximos" com "o
  horário passou" até o fim do dia, depois vai ao Histórico. A home mostra
  "Em andamento" no lugar de "Próximo agendamento" enquanto ele dura.").
  Em aberto são os mesmos status do "Próximo" (`STATUS_DO_PROXIMO`); o fim é
  o da ocupação (`fimDaOcupacao`, a duração nula vale 60), e o que acaba
  agora já acabou (`emAndamento`, `lib/agenda/em-andamento.ts`: início <=
  agora < fim; a mesma regra da equipe). A separação é uma
  só, `separarAgendaDoPortal`, que devolve `emAndamento`, `proximos` e
  `historico` sem repetir nada. A Agenda mostra o grupo "Em andamento" acima
  de "Próximos", só quando tem algo (`[data-em-andamento]`); a home troca o
  título do cartão e marca `[data-em-andamento]` no lugar de
  `[data-proximo-agendamento]`, sem a linha "Hoje, já no horário". As ações
  do cartão, o "Alterar até" e os avisos no celular seguem as regras de
  antes (o que já começou já passou do prazo do app). A home lê a janela que
  alcança o fim mais longe (as últimas 24 horas ou a maior duração em aberto
  da cliente) inteira, com `lerTodas`, mais o primeiro que ainda vai começar
  (decisão do Claude, 25/11). Prova:
  `tests/agenda-do-portal-em-andamento.test.ts` e
  `e2e/portal-cliente-alterar-agendamento.spec.ts` ("A51", a parte final).
  O "Em andamento" diz, à vista, quem registra o fim: "A equipe registra
  quando o atendimento terminar." (`TEXTO_DO_EM_ANDAMENTO_NO_APP`,
  `[data-em-andamento-registra]`), no cartão da home e no grupo da Agenda
  (D20 da 31ª, AG-55; o texto só existia na dica do "passou da hora"). Prova:
  `tests/em-andamento-no-app-diz-quem-registra.test.ts`.
  **O "Em andamento" também nas telas da equipe** (o Heitor, 25/11: "Acho que
  seria mais útil para rede/clínica. A cliente vai estar sendo atendida não
  vai ficar vendo o app durante o atendimento, mas pode manter lá."; e a
  proposta que ele aprovou: cada bloco mostra "quem está sendo atendido, por
  quem, em qual sala, desde quando e até quando; só aparece quando houver
  algo; segue a abrangência e a permissão da Agenda (na Minha agenda, a vista
  pessoal: só os dela)"). A regra é a mesma `emAndamento`; a leitura é uma,
  `lerEmAndamento` (`lib/agenda/ler-em-andamento.ts`: as unidades da tela, os
  em aberto já começados, de qualquer duração por `podemOcuparDesde`, e a
  vista pessoal em `profissional`), e o bloco é um, `EmAndamentoAgora`
  (`components/shared/em-andamento-agora.tsx`, `[data-em-andamento]`), que
  roda a regra de novo com o relógio andando (o que acabou sai da tela aberta).
  Cada linha: a cliente, o procedimento, quem atende, a sala, a unidade
  (com mais de uma na tela) e "desde 14:00 · até 15:00" no relógio da unidade
  (de outro dia, com a data: "desde 09/12 10:00"); abre o atendimento só a
  quem tem o Atendimento em Ver. Onde:
  - **O painel da unidade**: no topo do cartão "Agenda de hoje", a quem vê a
    agenda; na vista pessoal, só os dela, nas unidades dela.
  - **O painel da rede**: as unidades do recorte juntas, a quem tem a Agenda,
    com a unidade em cada linha.
  - **A Agenda** (da unidade e da rede): uma faixa acima da grade, no dia e na
    semana (não no mês), com o que acontece AGORA, qualquer que seja o dia
    aberto na tela; na rede, na vista pessoal, só os dela. Os filtros da
    agenda (profissional, sala, tag) não recortam a faixa (decisão do Claude,
    25/11: ela é o "agora" da unidade, não o período da grade).
  - **A Minha agenda**: no DESTAQUE do topo, não num segundo bloco
    (`destaqueDaMinhaAgenda`): o "já começou e segue" ("Atrasado", "Chegou ·
    atrasado") é a regra `emAndamento`; o em andamento diz "até 15:00" e a
    sala, e os outros dela em andamento ao mesmo tempo aparecem em "Também em
    andamento" (`[data-tambem-em-andamento]`). O que ela iniciou e não
    concluiu segue "Em atendimento agora", mesmo passado do horário.
  Prova: `tests/em-andamento-nas-telas-da-equipe.test.ts`.
  **O que acabou sem ser fechado segue a D14 e a A51 de sempre, pelo dia do
  INÍCIO** ("segue a regra de hoje", no texto aprovado pelo Heitor): o que
  começou hoje fica em "Próximos" até a conclusão; o que começou ontem vai ao
  Histórico quando o horário acaba, mesmo que tenha acabado hoje (o de 30
  horas de ontem que acabou hoje às 08:00, o "Na clínica" de ontem 23:30).
  **O "Prazo do app encerrado" vale para todo em andamento** (decisão do
  Claude, 25/11, princípio 3: depois do início o prazo já passou, e o mesmo
  cartão não diz coisas diferentes conforme o dia em que começou): a
  condição da A53, `prazoDoAppEncerrado`, ganhou o `emAndamento` ao lado do
  "de hoje em diante". Prova:
  `tests/agenda-do-portal-prazo-encerrado-em-andamento.test.ts`.
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
  `e2e/agenda-atritos-da-8.spec.ts` ("A24"). **Na "Minha agenda", um
  desenho só** (23ª A24, 2026-11-17): eram dois cartões diferentes pelo
  tamanho. Agora todo cartão tem a hora · duração · situação (e os selos) na
  primeira linha e a cliente e o procedimento na segunda; o alto (76 px ou
  mais) ganha o avatar e o espaço, o baixo (`[data-compacto]`) aperta.
  Prova: `tests/pendencias-area-1.test.ts`.
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
  **E em CADA dia que ocupa** (decisão do Claude, 25/11, pelo princípio 3; o
  procedimento não tem duração máxima): as agendas punham o agendamento só no
  dia em que começa, e o que atravessa a meia-noite, ou dura dias, sumia dos
  dias seguintes — o dia parecia livre e o choque recusava. Como o bloqueio de
  vários dias (`bloqueioNoDia`): `trechoDoAgendamentoNoDia` e
  `agendamentosNoDia` (`lib/agenda/trecho-do-agendamento.ts`, puros) dão o
  pedaço de cada dia, até o fim da OCUPAÇÃO (o cancelado e a falta não
  continuam). No dia seguinte o cartão começa no topo da grade e diz o início
  real ("Continua de 09/12 às 08:00"), não se arrasta (soltar remarcaria o
  atendimento inteiro) e abre a janela do agendamento; no dia em que começa, o
  que segue amanhã para no fim da grade, que fecha em 24 (`janelaComOsTrechos`).
  O que acaba antes da abertura abre a grade na última hora dele. Vale no dia,
  na semana e no mês da unidade, na grade da rede e na "Minha agenda" (a grade
  do dia, a faixa da semana e o mês); as páginas leem quem se sobrepõe ao
  período, de qualquer duração (`podemOcuparDesde`). O dentro do dia não muda.
  A CONTAGEM do topo (atendimentos, "aguardando", o "Hoje: N") segue contando
  cada agendamento no dia em que começa. Prova:
  `tests/agenda-mostra-o-atendimento-de-qualquer-duracao.test.ts`.
  **E o dia conta o que continua de antes** (decisão do Claude, 25/11, pelo
  princípio 3, completando a de cima): a ocupação do dia, o destaque da Minha
  agenda, a "Agenda de hoje" do dashboard e as leituras de agenda do Copilot
  olhavam só o dia em que o atendimento COMEÇA — o de 30 h dava mais de 100%
  de ocupação num dia e 0% no seguinte, o longo em atendimento desde ontem
  sumia do "Em atendimento agora", e o Copilot dava a pessoa como livre.
  - A **ocupação** (a agenda da unidade, a Minha agenda e o dashboard da
    unidade) conta de cada atendimento o que ele ocupa DENTRO do dia ou do
    período — o mesmo trecho do desenho, até o fim da ocupação
    (`minutosAgendadosNoPeriodo`, `lib/metrics/ocupacao.ts`; o "· 2h35" do
    cartão Hoje da Minha agenda também). A definição não muda (`indicadores.md`).
  - O **destaque da Minha agenda** ("Em atendimento agora", "Atrasado", o
    próximo) olha quem ocupa hoje (`destaqueDaMinhaAgenda`,
    `lib/agenda/minha-agenda.ts`), e o que continua de ontem diz "Continua de
    09/12 às 18:00" no lugar da hora.
  - A **"Agenda de hoje" do dashboard da unidade** lista o que acontece hoje
    (`agendaDoPeriodo`, `lib/metrics/agenda-do-dia.ts`): o que continua de
    ontem entra, primeiro, com a hora real e "desde 09/12"
    (`[data-continua-de-antes]`). A leitura é a de quem se sobrepõe ao dia, de
    qualquer duração (`podemOcuparDesde`), em páginas; o "ocupado fora" da
    capacidade também (era "desde a véspera").
  - O **Copilot** (`agendamentos` e `minha_agenda`) traz, além dos que começam
    no período, os que começaram antes e ainda o ocupam, com o início real e
    `continuaDeAntes: true` (no cartão, "desde qua., 09/12 às 18:00"). O
    cancelado e a falta não continuam; o concluído, só até a conclusão
    (`ocupaOPeriodo`).
  Prova: `tests/o-dia-conta-o-atendimento-que-continua-de-antes.test.ts`.
  **O concluído DEPOIS da hora ocupa até o fim marcado** (item 18 do escopo
  de 18/11 — o Heitor, sobre o concluído liberar o resto: "pode liberar";
  decisão do Claude, 26ª, pelo princípio 3): a das 10:00 às 11:00 concluída às
  11:20 ocupa até as 11:00, não até o clique — a hora da conclusão é a de quem
  apertou "Concluir", que pode vir muito depois, e esticar a ocupação além do
  bloco que a grade desenha seria um choque que a tela não mostra. A grade e a
  conta são a mesma `fimDaOcupacao` (o menor entre o fim marcado e a
  conclusão). O cancelado e a falta não ocupam nada (`IGNORED_STATUS`). Trava:
  `tests/agenda-desenho-ate-a-ocupacao.test.ts`.
- **O conflito diz a unidade do outro atendimento** (A30): o profissional da
  rede atende em várias, e quem tem a agenda de uma não vê a da outra. O
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
  e com o motivo (`cancellation_reason`). No celular a barra do cabeçalho
  quebra a linha, em vez de cortar o botão (A14 da 19ª). Não contam em nada (atendimentos,
  ocupação, a contagem do profissional) e não se arrastam; no dia, dividem o
  horário com quem o ocupou depois (o ativo à esquerda). A agenda da rede, que
  sempre os mostrou, apaga o bloco e diz o motivo. Prova:
  `e2e/agenda-cancelados.spec.ts`.
- **Os filtros: profissional, sala e tag** (o Heitor, 18/11, sobre a agenda
  que só tinha "mostrar cancelados" e dia/semana/mês: "Então precisa
  arrumar"; e a regra das Tags, CLAUDE.md §1). Na barra do cabeçalho da agenda
  da unidade e da rede, cada um um `PickerCompacto`
  (`FiltrosDaAgendaNaBarra`, `components/shared/filtros-da-agenda.tsx`), com
  "Limpar filtros". A regra é UMA, pura, `lib/agenda/filtros.ts`.
  - **Na CONSULTA**, nunca no navegador: `?profissional=`, `?sala=` e
    `?tags=a,b` vão na URL, como o `?date=`, e o servidor relê a agenda com
    eles (`filtrosDaAgenda` + `aplicarFiltrosDaAgenda`); a tag vai na cliente
    embutida (`clients(tags)` com `clients=not.is.null`, o `!inner`).
  - **O pedido não vence a abrangência**: só vale o que está nas
    opções da tela — quem ATENDE na(s) unidade(s) da tela (§9.1, "Atende" por
    unidade), as salas da unidade, o vocabulário ATIVO da rede
    (`tagsAtivasDaRede`, lido no servidor: quem só tem a Agenda também filtra
    por tag); o resto não vira filtro escondido. Na Minha agenda (a vista
    pessoal, SM2) o filtro de profissional não existe.
  - **A tag filtra PESSOAS**: o agendamento entra se a cliente dele tem TODAS
    as tags marcadas (E, como Clientes e o inbox); sem cliente, sai. Rede sem
    tag nenhuma: o filtro não aparece.
  - **Na rede, a sala só com a unidade escolhida** (decisão do Claude pelo
    princípio 7): as salas são de cada unidade ("Sala 1" de duas unidades
    seria uma lista confusa); a rede de uma unidade só já a tem. Trocar de
    unidade tira a sala e mantém a profissional e as tags.
  - **Os números respeitam o filtro** (princípio 3): o "N atendimentos" e os
    contadores da rede contam o filtrado; com a profissional, a grade é só a
    coluna dela e a ocupação, a dela; com sala ou tag, a ocupação (tempo das
    profissionais) não se diz, e a dica explica (`ocupacaoSeMede`,
    `[data-ocupacao-com-filtro]`). O bloqueio segue o filtro: o da
    profissional, o da sala (`bloqueioPassaNoFiltro`). Agendar e bloquear
    seguem com todas.
  - **A "Minha agenda" (a vista pessoal, SM2) não tem filtro** (decisão
    do Claude pelo princípio 7): a profissional é ela, a agenda de uma pessoa
    cabe na tela e cada cartão já diz a cliente e a sala; ela não tem barra de
    filtros fixos à qual a tag se somaria.
  - A lista "Seus atendimentos em outras unidades" segue os filtros (a
    profissional que não é a pessoa, ou a sala desta unidade, a esvaziam); o
    aviso dos abertos de dias anteriores, não (é aviso, não a agenda).
  Prova: `e2e/agenda-filtros.spec.ts`, `tests/agenda-filtros.test.ts`.
- **O que já foi pago aparece como PAGO** (D12 da 5ª simulação): a janela da
  agenda (unidade e rede) e a Agenda do app da cliente mostram "Pré-pago · 1
  de 2", "Pacote X · sessão 1 de 2" ou "Sessão do plano de tratamento" no
  lugar do valor (`pagosAntes`, `lib/appointments/pago-antes.ts`; na janela,
  "Já pago"). Era "VALOR R$ 140,00", lido como cobrança pendente. Prova:
  `e2e/agenda-pago-antes.spec.ts`. **A sessão do plano aceito e AINDA NÃO
  recebido não parece paga** (21ª, o limite do "Incluído" sem valor;
  princípios 3 e 4): o plano sem lançamento diz "Sessão do plano · a receber
  no PDV (R$ X)" na agenda — o valor do plano (`getFinanceiroDoPlano`) só a
  quem vê o valor (`mostraOValor`, o D4 da 21ª) — e "Sessão do plano · a pagar
  na unidade (R$ X)" no app da cliente; o rótulo da janela é "A receber" (cor
  de aviso), não "Incluído" (`textoDoPlanoAReceber`/`rotuloDoPagoAntes`,
  `lib/appointments/pago-antes-textos.ts`). Prova: `tests/pendencias-area-1.test.ts`. **E o atendimento pago com desconto
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
  ligado é agendada). Era "3 para agendar" até a conclusão. Na home do app,
  o cartão do pré-pago diz também os já usados: "3 já pagos · 1 usado · 2
  para agendar" (`textoDoPrePagoNoApp`, `lib/clientes/textos-do-app.ts`; o
  "· N usados" só aparece com algum usado). Prova:
  `e2e/pre-pago-agendados.spec.ts`, `tests/pre-pago-contagem.test.ts`,
  `tests/portal-textos-da-rede-e-do-pre-pago.test.ts`.
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
  `e2e/agenda-atritos-da-7.spec.ts` ("A32"). **E dizem a unidade** na rede de
  duas ou mais (A15 da 25ª; princípio 7): "… · Dra. Ana · Moinhos"
  (`unidadeNaFicha`, `[data-unidade-do-agendamento]`). Prova:
  `tests/atritos-da-25-ficha-estoque-app.test.ts`. **E são de hoje em diante**
  (A16 da 31ª; a regra dos próximos do app, AG-55; princípio 3): o em aberto
  de um dia anterior (no relógio da unidade dele; o Em atendimento fica) sai
  dos próximos e aparece à parte, "Em aberto de dias anteriores"
  (`[data-em-aberto-de-antes]`), até a equipe registrar a falta, a chegada ou
  a conclusão — decisão do Claude, 26/11: o "Histórico de procedimentos" é o
  que ela fez (J-26), e sumir com ele esconderia o que está em aberto
  (`marcarOsDeAntes`, `lib/clientes/proximos-da-ficha.ts`). Prova:
  `tests/ficha-proximos-de-hoje-em-diante.test.ts`. **E a duração prevista é a do
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
  procedimento bate, como a do pacote (A20 da 8ª): "Incluído no plano de
  tratamento (sessão 2 de 3)" (A3 da 25ª: era "Já pago", também com o plano no
  crediário, de parcelas em aberto; o campo é "Incluído",
  `textoDoCreditoAoAgendar`). A grade de horários é a do modal. O avulso já
  marcado não se liga a uma sessão de plano (`agendamento_usar_credito` é do
  pacote e do pré-pago). E o cartão "Tratamento em andamento" diz "Abrir para
  ver e agendar as sessões" (`[data-tratamento-que-abre]`). Prova: o mesmo spec
  ("A18").
- **Cancelar (ou faltar) devolve o que estava pago**: o gatilho
  `private.pre_pago_libera` solta a unidade pré-paga, a sessão de pacote e a
  sessão do plano (estas duas ficavam presas ao agendamento cancelado).
- **O procedimento novo nasce FORA do app** (`visible_on_client_app` desligado,
  2026-10-21): só vai para o self-service o que a rede marca. Nascia ligado,
  e a Toxina da simulação ficaria agendável pelo app.
- **A sessão JÁ COMPRADA se agenda pelo app mesmo fora do "Permitir auto
  agendamento"** (PT3/CA3, Bloco Plano de tratamento, leva 2, 2026-11-14 — o
  Heitor: "se for uma sessão de plano ou pacote, pode agendar"): a sessão
  livre de um plano ACEITO (pelo primeiro procedimento dela) ou de um pacote.
  O pré-pago avulso segue a marca do procedimento. A regra é uma
  (`agendavelPeloApp`, `lib/clientes/agendavel-no-app.ts`): a tela do agendar
  oferece o marcado OU o comprado (`procedimentosComSessaoComprada`), a action
  (`createClientAppointment`) recusa o resto ("Procedimento não disponível") e
  grava só pelo `createAppointmentCore`, com o crédito. O cartão do pacote e o
  do plano no Início dizem "pelo app"; só o procedimento inativo fica com a
  equipe. O texto não diz "já paga": o plano aceito pode ainda não ter sido
  recebido ("faz parte do seu plano"; o Confirmar diz "Faz parte do seu plano
  de tratamento (sessão 2 de 3)" — princípio 3). Prova:
  `e2e/plano-tratamento-leva-2.spec.ts`.
- **O plano no app** (PT3/CA2, leva 2): `/[slug]/cliente/planos/[id]` — só o
  plano DELA (`ctx.clientId`), proposto, aceito ou concluído; o resto é 404.
  O proposto mostra as sessões e o valor, a validade e "Aceitar o plano"
  (PT1b, `docs/regras/vendas-financeiro.md`); o aceito, cada sessão (feita,
  agendada ou a agendar, `situacaoDaSessaoNoApp`) com o "Agendar" da que está
  em aberto, os pagamentos (de `getFinanceiroDoPlano`) e os documentos do
  plano (`documentosDoPlanoNoPortal`). Nada clínico: a anotação da
  profissional não sai do servidor. Os cartões do Início levam a ela ("Ver o
  plano").
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
  ela). A unidade SEM sala: o Agendar não mostra o campo nem fala de sala, e o
  agendamento segue sem sala (princípio 7 — a revisão das perguntas de 24/11,
  Q14 do catálogo; decisão do Claude: saiu a linha "Sem sala cadastrada nesta
  unidade" da A52 da 24ª). Prova: `tests/atritos-da-24-cargos-atendimento-app.test.ts`.
  Quem tem `settings: MANAGE`, na unidade ao alcance; o nome é único
  entre as ATIVAS da unidade (`rooms_nome_unico_na_unidade`). A sessão não
  grava sala pelo PostgREST (as políticas de escrita saíram): só o servidor.
  - **O caminho das salas** (A3 da 5ª simulação, 2026-11-02): na rede de
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
    servem E estão livres no horário (R13, abaixo; era "(ocupada)" desligada,
    e a bloqueada aparecia livre — `salasParaOHorario` confere o atendimento e
    o bloqueio da sala); a JÁ escolhida que deixou de estar livre fica, com
    "(ocupada)"/"(bloqueada)" e o Confirmar desligado. E já escolhe a
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
    sala, livre no horário, a traz escolhida** no Agendar (A2 da 10ª, a unidade
    de uma opção só — `unicaOpcao`, `design.md`), e a profissional única
    também; prova: `e2e/agenda-rede-de-uma-opcao.spec.ts`. **Unidade sem sala: o
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
    Prova: `e2e/plano-defeitos-da-12.spec.ts` ("D8"). **Enquanto a lista do
    horário carrega, o seletor diz "Conferindo as salas…"**, não "Sem sala
    definida" (A13 da 19ª: a pessoa achava que tinha perdido a sala; o
    Confirmar já esperava). Prova: `e2e/agenda-salas.spec.ts`,
    `tests/agenda-salas.test.ts`.
- `cancellationReason`: obrigatório ao cancelar para rastreabilidade
- Ao marcar `COMPLETED`: consumo de estoque + comissão, numa transação — ver §10. Os pontos de fidelidade NÃO nascem aqui: nascem no pagamento (§9.2.2).

**Decididas no levantamento das regras** (o Heitor, 2026-11-11, pela página
de decisões) — **implementadas na F65 (2026-11-12)**:
- **Quem faz o quê na agenda e no atendimento** (D20, revisto pelo Heitor em
  2026-11-18: "Agenda é agenda e atendimento é atendimento. Só inicia e conclui atendimento quem tem gerenciar no atendimento.").
  Cada passo, um módulo (UM1–UM5, o Heitor, 2026-11-23: "concordo, pode
  anotar, marcar as questões e ajustar o codigo"). Iniciar, concluir e
  desistir no meio são do módulo **Atendimento** em Gerenciar, e só dele
  (UM2), em qualquer atendimento da unidade ao alcance (sem o "só os meus",
  SM1). Nem a Agenda nem o Prontuário iniciam ou concluem:
  saíram o "a Agenda em Ver inicia e conclui" e o "concluir também pede o
  Prontuário em Gerenciar". O registro CLÍNICO do atendimento (a evolução, as
  fotos, a ficha de saúde, a ficha de atendimento, as dores, a
  intercorrência) continua do Prontuário em Gerenciar, sem precisar atender
  (UM4): sem ele, quem tem o
  Atendimento em Gerenciar inicia e conclui, e o clínico não se escreve
  (`registraClinico` em `finishSession`; a tela não mostra os campos). A
  matriz, o resumo do cargo (`conclusaoNoResumo`) e `quemConcluiOAtendimento`
  dizem isso. A Agenda em Gerenciar agenda, confirma, marca a chegada,
  cancela (o que não está em andamento), marca a falta, remarca e troca a
  profissional. Receber é do PDV (`podeReceber`). O "Atende" não dá
  permissão nenhuma (UM5).
  **O módulo Atendimento** (2026-11-18; migration `20261123900001`): Ver e
  Gerenciar. Ver abre a tela do atendimento (UM1; não abre mais com a Agenda
  em Ver) e Tratamentos (os planos); Gerenciar inicia, conclui, baixa os
  insumos, desiste no meio e monta o plano — na avaliação aberta, na
  concluída ou pelo "Novo plano" (UM3); "Editar registro" pede
  ele e o Prontuário em Gerenciar. Segue o recurso Agenda do plano da rede
  (`FUNCIONALIDADES`). Os cargos que existiam e os modelos semeados ganharam o
  Atendimento em Gerenciar onde tinham a Agenda (Ver ou Gerenciar) e o
  Prontuário em Gerenciar, e em Ver onde tinham só a Agenda (decisão do
  Claude pelo princípio 3: ninguém perdeu o que fazia de
  clínico). ⚠️ O cargo com a Agenda em Gerenciar sem o Prontuário em
  Gerenciar deixou de iniciar — e de abrir a comanda do atendimento pelo
  início (PDV3); a rede que quiser dá o Atendimento em Gerenciar a ele.
  `updateAppointmentStatusInterno` pede Gerenciar
  para Confirmado, Chegou, Cancelado e Falta (C10) — o Cancelado do Em
  atendimento é a desistência, do Atendimento em Gerenciar (ATD-A01); o Cancelado passa pelo
  `cancelarCore` (motivo, aviso, histórico — C12), a Falta só sai de
  Agendado/Confirmado/Chegou e nunca vira Cancelado, e o "Em atendimento"
  passa pelo início de verdade (`startAppointment`). A janela só mostra o
  que o cargo faz. Prova: `e2e/agenda-guardas-de-status.spec.ts`,
  `e2e/permissoes-acoes.spec.ts` ("agenda: cancelar agendamento" pede
  Gerenciar).
  O "Remarcar do próprio" com "só os meus" (F75) e a pergunta da D20 saíram
  com o "só os meus" (SM1; revisao.md: "D20 … Revisto em 23/11").
- **Quem inicia e conclui o atendimento de outra pessoa que atende** (D21,
  revista em 23/11): quem tem o Atendimento em Gerenciar, qualquer um da
  unidade ao alcance (UM2, SM1 — saiu o "só os meus" = só o próprio), na tela
  e no servidor (C14). Prova: `e2e/atendimento-quem-inicia-e-conclui.spec.ts`.
- **O "Iniciar" não reabre o que acabou** (C11): só sai de Confirmado ou
  Chegou (a gravação confere a situação); o gatilho do banco recusa sair de
  Concluído ("Atendimento concluído não muda de situação…", migration
  `20261112006501`). Os pontos não duplicam: nascem no pagamento, e o
  "Concluído" da agenda (`completeAppointment`) não conclui mais nada (§10).
  **O remarcar recusa o que está em atendimento** (C15, `remarcarCore`), e
  as anotações de rascunho recusam o cancelado e a falta.
- **A remarcação volta a Agendado, venha de onde vier** (o Heitor, 25/11, ao
  rever a H3, que fazia o remarcado pelo app nascer Confirmado: "Discordo —
  Ela já desmarcou uma vez, pode acabar desmarcando de novo, melhor
  reconfirmar."). Pelo app (`remarcarPelaCliente`), pela equipe ou pelo
  Copilot (`remarcarCore`, C8), o horário novo fica Agendado (sem
  `confirmed_at` nem `arrived_at`) e a confirmação é pedida de novo, como a de
  qualquer agendamento. **O app diz** (A12 da 19ª): "Agendamento remarcado: …
  O horário novo fica como Agendado até ser confirmado." (`textoDoRemarcado`,
  `lib/clientes/textos-do-app.ts`; o texto é decisão do Claude, 25/11), e o
  diz ANTES de confirmar, com o horário escolhido (`AVISO_DO_HORARIO_NOVO_NO_APP`;
  A1 da 31ª, decisão do Claude, 26/11, pelo princípio 3). Prova:
  `tests/remarcar-no-app-avisa-antes.test.ts`,
  `e2e/portal-cliente-remarcar-pelo-nucleo.spec.ts`,
  `tests/remarcar-pelo-app-volta-a-agendado.test.ts`.
- **A remarcação diz de quando para quando** (A2 da 31ª; decisão do Claude,
  26/11, pelo princípio 3): o histórico do agendamento grava "Remarcado de
  28/11, 10:00 para 29/11, 14:00" (pelo app, "Remarcado pela cliente no app de
  … para …"), cada horário no relógio da sua unidade, e o metadata guarda o
  `de_scheduled_at` (`textoDaRemarcacao`, `lib/appointments/texto-da-remarcacao.ts`,
  no `remarcarCore` e no `remarcarPelaCliente`). O registro de antes (só
  "para") fica como está: o horário de antes não estava gravado. A linha do
  tempo da ficha registra cada remarcação ("Remarcado: <procedimento>", com o
  texto e "por Fulana (app)" — `eventosDeRemarcacao`), e o "por …" de todo
  evento de agendamento sai do id do agendamento, não do link: sem o
  Atendimento em Ver o link é nulo (UM1), e o autor sumia de quem só tem a
  Agenda ou os Clientes. Prova: `tests/agenda-remarcacao-de-quando-para-quando.test.ts`.
- **Quem só agenda cria a ficha, mas não mexe na que existe (H4, opção b;
  princípio 3: a mesma ação não muda conforme a porta).** O "+ Agendar" com
  nome e telefone, e o agendar pelo CRM (cujos horários se chamam "Horários
  livres · N", com a dica de que os ocupados e os bloqueados ficam de fora —
  A24 da 22ª), criam a ficha rápida sem pedir
  Clientes em Gerenciar — criar a cliente nova faz parte do agendar.
  "Unificar com a ficha de X" e "Reativar a ficha de X" pedem Clientes em
  Gerenciar, na tela e na action (`garantirClienteRapido` recusa o
  "atualizar:<id>"); sem ele, a pergunta (`PerguntaJaExiste`,
  `podeUnificar`) oferece "Agendar para a ficha de X" (a resposta
  "usar:<id>": a ficha como está, nada se grava nela; a arquivada não) ou
  "Cadastrar mesmo assim". O cartão do Copilot, igual (C66). Prova:
  `e2e/agenda-ja-existe-sem-clientes.spec.ts`.
- **O agendamento só nasce com quem ATENDE na unidade** (F65): o
  `conferirPecasDoAgendamento` recusa a profissional sem a unidade no
  "Atende" ("X não atende nesta unidade: marque o “Atende clientes” (com mais
  de uma unidade, em “Escolher em quais unidades atende”) no lápis dela, na
  Equipe." — os nomes que a ficha da Equipe mostra, em `O_ATENDE_NA_FICHA`,
  `lib/equipe/atende.ts`; o Heitor, 25/11, à proposta de usar a frase da
  Equipe: "ok"; o mesmo nos avisos do Desativar e da janela do agendamento.
  Prova: `tests/atende-clientes-o-nome-que-a-tela-mostra.test.ts`) — o encaixe fora do HORÁRIO continua permitido (é
  aviso). E só com o procedimento que a unidade FAZ (D7 da 13ª, §9.3).
  Prova: `e2e/agenda-procedimento-e-quem-atende-na-unidade.spec.ts`.
- **O remarcar do app passa pelo núcleo e pergunta a unidade** (C8, A15 da
  13ª; H5: a cliente é da rede). `remarcarPelaCliente` confere as peças
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
- `branchId: null` = catálogo base da rede.
- **O catálogo é de quem tem Procedimentos em Gerenciar, e só isso** (PR1/PR6
  do plano de adaptação, a revisão do Heitor de 2026-11-13: "Sai a exigência
  de ser da rede"). Criar, editar, ativar/desativar o procedimento e as
  categorias: a action confere só `procedures: MANAGE` (saíram o `assertRede`
  de `actions/procedures.ts` e a abrangência de `quemGerencia`). O catálogo
  tem um corpo só, `app/_shared/catalogo-de-procedimentos.tsx`: o portal da
  rede o mostra sempre, e o da unidade a quem tem o módulo em Gerenciar — a
  pessoa sem “A rede inteira” cuida dele dali, sem ir à rede. Quem só vê lê, no
  portal da unidade, a consulta com o preço daquela unidade e "quem cria e
  muda é quem tem Procedimentos em Gerenciar" (`[data-catalogo-da-rede]`); na
  rede, "Seu cargo só consulta o catálogo" (`[data-catalogo-so-consulta]`).
  Ficou com a Admin da rede só a comissão do procedimento (é configuração da
  rede: `recusaDaConfigDaRede`, o Heitor, 2026-11-18 — era "com a rede"). O formulário só existe com a janela ABERTA (A4 da 8ª: eram N+1
  formulários no DOM). Prova: `e2e/procedimentos-por-permissao.spec.ts`,
  `e2e/procedimentos-atritos-da-8.spec.ts` (A35 e A20, revistos).
- **Os nomes do formulário** (PR2/PR3): "Permitir auto agendamento" (era
  "Visível no app do cliente"; a coluna `visible_on_client_app` é a mesma) e
  "Ficha de atendimento" (era "Ficha"; a mesma lista).
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
  atendimento) e, no plano NOVO, a unidade em que ele nasce — a do endereço;
  na ficha da REDE com duas ou mais unidades, a escolhida em "Unidade do
  plano *" (`?unidadeDoPlano=`; o "Novo plano" espera a escolha), nunca a de
  cadastro da cliente (auditoria das regras, 2026-11-18; `criarPlanoDoCliente`
  sem unidade recusa "Selecione a unidade do plano."). O servidor recusa o
  procedimento NOVO que a unidade do plano não faz (o editor nem o oferece):
  `recusaDosProcedimentosDoPlano`, em `gravarSessoes` (antes de apagar as
  sessões antigas) e antes do `gerar_plano_da_avaliacao`. **O que já estava no
  plano e a unidade não faz mais se salva com ele** (princípio 2, "no máximo,
  avisar" — a revisão das perguntas de 24/11, Q24 do catálogo; decisão do
  Claude): fica à vista, "X (não é feito nesta unidade)", e essa marca é o
  aviso; até 24/11 o plano antigo só se salvava tirando o item. Agendar a
  sessão na unidade que não o faz segue recusado (`conferirPecasDoAgendamento`).
  Prova: `e2e/plano-unidade-do-plano-f73.spec.ts`, `tests/catalogo-do-plano.test.ts`.
- **O plano se grava numa transação só, e o fechado não volta a rascunho**
  (A20d da 25ª; §14): `gravarSessoes` confere e monta, e `plano_gravar_sessoes`
  (só o servidor) grava o cabeçalho (o rascunho da avaliação; as observações e
  o desconto do editor) e as sessões juntos, com o plano travado, conferindo de
  novo a rede, o plano fechado e os procedimentos — a falha no meio não deixa
  mais o plano sem sessões. Fechado é o aceito, o concluído, o cancelado e o
  recusado (`planoFechado`, `lib/plano-de-tratamento/fechado.ts`): o "Salvar"
  da avaliação e o do editor recusam "Este plano já foi fechado e não pode mais
  ser alterado." antes de gravar (o rascunho da avaliação reabria o aceito como
  DRAFT). Prova: `tests/plano-sessoes-numa-transacao.test.ts`,
  `e2e/plano-tratamento-leva-1.spec.ts` (A20d).
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
  unidade (D4 da 14ª, F73): o plano novo da ficha da rede nasce na unidade
  escolhida em "Unidade do plano" (com uma só, ela), e o catálogo e o preço
  são os dela. Prova: `e2e/procedimento-preco-da-unidade.spec.ts`,
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
    `e2e/configuracoes-atritos-da-10.spec.ts` ("A6"). **A faixa diz QUAIS**
    (A23 da 21ª: contava a Avaliação e a Massagem sem nome): "3 procedimentos
    ativos sem insumo ligado (Avaliação, Massagem e Peeling)", até quatro
    nomes e "mais N" (`nomesDosSemInsumo`). **A rede marca o que não usa
    insumo** (A7 da 23ª = A23 da 21ª; princípio 1): "Este procedimento não usa
    insumo" nos Insumos do cadastro (`procedures.sem_insumo`, migration
    `20261123200001`; só aparece e só vale sem insumo ligado —
    `marcaSemInsumo`), e a faixa e o selo deixam o marcado de fora
    (`procedimentosSemInsumoLigado`). Prova:
    `tests/pendencias-pdv-estoque-documentos.test.ts`. **O seletor
    do insumo não corta o nome** (A22 da 21ª: "Toxina 1 f"): a linha do insumo
    quebra, o seletor guarda 260 px e o nome inteiro vai no `title`. Prova:
    `tests/telas-atritos-da-21.test.ts`.
- **A calculadora do procedimento diz que o custo é o ÚLTIMO** (A13 da 11ª,
  2026-11-10; princípio 3: R$ 7,95/U era o último custo, e o lote que sai
  primeiro custava R$ 7,80): embaixo dos insumos, "O custo de cada insumo é o
  último custo de compra… No atendimento, a baixa sai ao custo do lote que é
  usado…" (`[data-custo-do-insumo-e-o-ultimo]`). A regra (a margem do catálogo
  pelo custo atual, F49 D2) não mudou. E a embalagem tem **"seringa"** (A12: o
  ácido hialurônico virou "un", com "(seringa)" no nome; `MEDIDAS_DO_PRODUTO`)
  e **"pote"** (o Heitor, 26/11, página de perguntas, R03: "Sim: 'pote' entra
  na lista"): embalagem contável como o frasco e a caixa — "potes" no plural,
  "1/10 do pote" na parte da embalagem (`EMBALAGEM_NA_FRASE`).
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
  - a agenda da equipe: o modal AVISA ("X não está em “Quem realiza” deste
    procedimento"), sem barrar — o encaixe é da rede;
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
  `procedures: MANAGE`, e só isso (PR1, 2026-11-13). Prova:
  `e2e/categorias-de-procedimento.spec.ts`.

Query correta para buscar procedimentos de uma unidade — o catálogo base da
rede (`branch_id` nulo) MAIS o que é local da unidade, só o que ela FAZ ("Em
quais unidades", `ofereceNaUnidade`) e com o preço DELA (`comPrecoDaUnidade`).
O `branch_id` sozinho listava o que a unidade não faz, ao preço da rede (a
revisão das perguntas de 24/11, Q23 do catálogo). Na agenda, é
`getCachedBranchProcedures`; no plano, `procedimentosParaPlano` com a unidade.
Prova: `tests/preco-na-unidade.test.ts`.
```typescript
const lidos = await ler(
  admin.from('procedures')
    .select(`id, name, duration_min, price, ${COLUNAS_DA_OFERTA}`)
    .eq('tenant_id', ctx.tenantId)
    .eq('is_active', true)
    .or(`branch_id.is.null,branch_id.eq.${unidadeId}`),
  'listar os procedimentos da unidade',
)
const procedures = await comPrecoDaUnidade(admin, unidadeId,
  (lidos ?? []).filter(p => ofereceNaUnidade(p, unidadeId)))
```

---

### 9.4 Prontuário
- `MedicalRecord`: 1 por cliente
- `MedicalRecordEntry`: 1 por `Appointment` concluído (`appointmentId @unique`)
- **A ficha de atendimento é UMA**, montada no construtor
  (Configurações → Fichas, tabela `forms`) e ligada ao procedimento por
  `procedures.form_id`. As respostas ficam em
  `medical_record_entries.form_data`.
  - Eram DUAS — "de anamnese" e "de atendimento" —, com o mesmo construtor, os
    mesmos campos possíveis e o mesmo momento de preenchimento. Quem cadastrava
    um procedimento tinha de escolher em qual das duas pôr cada pergunta, e a
    escolha não mudava nada. Unificadas em 2026-09-25.
  - **A ficha aparece em TODO ramo da tela do atendimento** (D1 da simulação
    de 2026-10-29): o formulário da avaliação (todo atendimento fora de plano,
    inclusive o de pacote, na rede que monta plano) tem o cartão "Ficha de
    atendimento" (`data-ficha-do-procedimento`); o plano já gerado e a sessão
    de plano (ou a rede sem planos) a têm dentro da "Ficha de atendimento".
    Faltava no primeiro desde 2026-09-25, e a profissional concluía sem ela.
    Só vai à tela com `canViewRecords` (o acesso já é registrado na sessão).
    A obrigatória barra o "Salvar ficha", os dois botões do plano ("Aceitar
    plano" e "Gerar plano · a cliente vai pensar" — era o "Enviar para a
    recepção") e, desde a revisão do Heitor de 2026-10-29, também o
    "Finalizar" (§10). Prova:
    `e2e/atendimento-ficha-do-procedimento.spec.ts`.
  - **Não confundir com `medical_records.general_anamnesis`**: aquilo é o
    questionário de saúde do CLIENTE, preenchido uma vez, que alimenta o termo
    de consentimento e o planejamento. Esse continua existindo e é outra coisa.
- **A ficha de saúde é UMA ficha da rede** (no banco, `general_anamnesis` e `pre_atendimento*`; 2026-10-20,
  decisões do Heitor): perguntas sobre a PESSOA (alergias, medicamentos,
  gestação…), iguais para qualquer atendimento.
  - **Uma ficha por rede**: `forms.tipo = 'PRE_ATENDIMENTO'`
    (`forms_um_pre_atendimento_por_rede`), que nasce com a rede (gatilho em
    `tenants`) com as perguntas da ficha de saúde de campos fixos de antes, e os
    MESMOS ids (`allergies`, `medications`, `skinType`…). Edita só a Admin da
    rede (`recusaDaConfigDaRede`: as fichas estão na lista do CLAUDE.md §11; o
    Heitor, 2026-11-18: "Configuração da rede toda só pela conta admin" — era
    `forms: MANAGE` e ser da rede; texto corrigido pelo Claude), em Configurações → Fichas; sem foto nem
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
    respondeu na unidade não responde de novo no app. A EQUIPE regravando as
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
    A validade é de 1 mês para cima: acima de 36 meses a tela avisa e grava,
    até 1.200 (100 anos) — o Heitor, 25/11: "Se não for impossível, ainda que
    improvável, pode ser feito."; o limite dos 100 anos é decisão do Claude,
    25/11 (ver "Os prazos acima do comum", no prazo do portal).
    **Respondida (ou confirmada) há menos de 30 dias, o agendamento não abre
    pendente** (decisão do Heitor, 2026-10-21; migration `20261021000008`):
    a última resposta é a mais recente entre a ficha de saúde gravada e os pendentes
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
    WhatsApp de quem está no computador ou celular, e não um ligado à rede
    (`[data-whatsapp-do-aparelho]`; A31 da 7ª simulação: numa rede sem
    WhatsApp ligado, o botão parecia o da rede — a regra do wa.me ficou) —,
    com `agenda: MANAGE`), que mostra só o ESTADO
    (pendente/respondida) — as respostas são do prontuário. Cliente sem CPF
    nem nascimento: a janela diz "Para quem não tem CPF, complete a data de nascimento para
    enviar o link" e leva ao cadastro (`?aba=dados`, via `lib/rotas`). **E
    pede o nascimento ali mesmo** (A12 da 10ª simulação, 2026-11-10: a cliente
    do Agendar, só com nome e telefone, ficava sem a ficha): quem tem as
    Clientes E a Agenda em Gerenciar preenche "Data de nascimento" → "Salvar o
    nascimento" (`completarNascimentoDaCliente`, `actions/pre-atendimento.ts`:
    o agendamento ao alcance, só preenche o VAZIO, nunca o futuro), e o "Enviar
    a ficha" aparece. Prova: `e2e/atendimento-uso-da-10.spec.ts` ("A12"). "Ficha já
    respondida" mostra o telefone/WhatsApp da UNIDADE para corrigir algo.
    **A ficha que a EQUIPE preencheu se CONFERE pelo link** (A52 da 7ª
    simulação, 2026-11-05: a equipe respondeu na unidade, e o link mandado
    dizia "Ficha já respondida" — a cliente não conferia nem completava): com
    a ficha de saúde RESPONDIDA pela equipe (`origem = EQUIPE`) e o link ainda
    valendo (não usado, revogado nem vencido), a página diz "X já preencheu a
    sua ficha de pré-atendimento. Confira as respostas.", pede a identidade de
    sempre e mostra as respostas (o modo CONFERIR: "Está tudo certo" ou
    "Corrigir respostas"); a obrigatória que a equipe deixou em branco a
    cliente completa (`oQueFaltaNaFicha` vale). Gravado pelo núcleo
    (`gravarAnamneseGeral`, origem CLIENTE_LINK); a ficha de saúde do link
    passa a ser da cliente, e o link morre. A que a própria cliente respondeu
    segue "já respondida". A espiada diz `conferir: true` com o estado `usado`
    (migration `20261105002902`: a função serviu ao código de antes até o
    push). Prova: `e2e/ficha-pre-atendimento.spec.ts` ("A52").
    **Também pelo link NOVO** (D16 da 33ª, FI-13; decisão do Claude, 26/11):
    a ficha preenchida pela equipe (origem EQUIPE, ou a do formato antigo) e
    mandada DEPOIS por um link novo, dentro da validade, abre no modo CONFERIR
    — era "Algo mudou na sua saúde? Nada mudou", o modo de quem respondeu ela
    mesma (`modoDaFichaPeloLink`, `lib/pre-atendimento/modo-da-ficha.ts`).
    **E no app**, a mesma regra (o arremate da 33ª; princípio 3, decisão do
    Claude, 26/11): `/[slug]/cliente/pre-atendimento` decide o modo por
    `modoDaFichaPeloLink` (sem o `conferir`, que é do link) — a ficha da equipe
    abria no app em "Algo mudou?"; "Está tudo certo" a grava como da cliente
    (CLIENTE_APP).
    Prova: `tests/ficha-da-equipe-pelo-link-novo.test.ts`,
    `e2e/ficha-pre-atendimento.spec.ts` ("a cliente confere também no app").
    **Antes do CPF, a página não diz nada da ficha** (A50 da 9ª simulação,
    2026-11-07: os dois times viram "A clínica já preencheu a sua ficha…"
    antes da identidade): o título é sempre "X mandou a sua ficha de
    saúde."; o "Confira as respostas que a equipe preencheu" vem
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
    gatilho, sem a janela de 30 dias — aqui é a equipe que pediu), e gera o
    link. O padrão da rede não muda; quem só vê a agenda não vê o bloco nem
    abre nada (D9 da 26ª: a janela do agendamento e o "Enviar o link" da
    faixa do atendimento conferem a Agenda em Gerenciar, `podeMandar`; quem
    só via clicava e lia "Você não tem acesso a esta ação."); o suporte não
    manda (`bloqueioDoSuporte`). Com a ficha de saúde da cliente respondida e
    VÁLIDA, a janela não diz "não foi enviada" (A1 da 26ª, princípios 3 e 7):
    "A cliente tem a ficha de saúde válida até 10/05/2027 (respondida em
    10/11/2026). Enviar a ficha pede que ela responda de novo."
    (`textoDaFichaValida`, `fichaDeSaudeValidaAte`: a mesma conta do
    vencimento). Prova:
    `e2e/ficha-pre-atendimento-envio-manual.spec.ts`,
    `e2e/vistas-pessoais-e-cada-passo.spec.ts`. Erro
    de validação (no link e nas fichas): rola ao primeiro campo obrigatório
    vazio, foca, destaca e escreve a mensagem junto dele.
    **A janela diz quando a ficha já foi ao app** (A6 da 17ª simulação;
    princípio 3): com a ficha pendente avisada no app da cliente
    (`client_notifications` `pre_atendimento`), "Mandada ao app da cliente ao
    agendar, em 12/11 às 18:11. O link é para mandar de novo, ou a quem não
    usa o app." (`situacao.noAppEm`). Prova: `tests/atritos-da-17-cadastros.test.ts`.
    Só para a cliente COM acesso ao app (A10 da 25ª; princípio 3): sem o
    acesso, o aviso fica gravado mas ninguém o lê, e a janela não diz que foi
    (`clients.auth_id`). Prova: `tests/atritos-da-25-atendimento.test.ts`.
    **O app OFERECE a ficha a quem tem atendimento marcado** (15ª A33 = 16ª
    A11, 2026-11-17): com o envio automático desligado (o padrão, princípio
    6), o pendente nunca nascia e a cliente não tinha onde responder. Com a
    ficha de saúde da rede ativa, atendimento futuro e nenhuma ficha válida
    (nunca respondida, ou vencida pela validade da rede), o Início do app
    mostra "Responda a sua ficha de saúde" (`[data-testid="oferta-da-ficha-de-saude"]`,
    `ofereceAFichaNoApp` + `dadosDaOfertaNoApp`). O pendente nasce no CLIQUE
    dela (`abrirMinhaFichaDeSaude` → `pre_atendimento_abrir_manual`, para o
    próximo agendamento, que tem de ser DELA e estar marcado), não sozinho, e
    a ficha abre na tela de sempre (`/cliente/pre-atendimento`). Com pendente,
    o Início mostra o dele, como antes. Prova: `tests/pendencias-area-1.test.ts`.
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
    Copilot não lê a ficha de saúde, e a conversão do legado (`simNao`) só diz
    "Sim" do verdadeiro e deixa um texto como está.
    A obrigatória vale para todo preenchimento pelo construtor: a equipe
    também a preenche ao salvar a ficha de saúde, mandar a avaliação ou FINALIZAR
    o atendimento (§10, "Tudo que é obrigatório barra").
  - **A ficha gravada vazia não é "respondida" em lugar nenhum**
    (`anamneseRespondida`): sem "Ficha de saúde revisada" nem "Respondida…" no
    atendimento (a tela diz "Ficha de saúde vazia"), sem "algo mudou?", sem
    selo de respondida na agenda, e o gatilho do envio não a conta como
    última resposta (nem a ficha de saúde de `respostas` vazias, nem o pendente
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
    uma pergunta aberta que a rede montou) avisa como está escrita. Era a
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
    simulação): com a ficha de saúde mexida, a faixa sai das respostas digitadas
    (`anamneseNaTela`), não da salva — o "Sim" da Tatiane só virava faixa
    depois de concluir. O rascunho (§10) já guardava a ficha de saúde digitada:
    recarregar mantém as respostas e a faixa. Prova: o mesmo spec.
    Com a rede mandando também pela conversa (a MESMA chave do link de
    assinatura, `documentos_link_pela_conversa` — a chave é decisão do
    Heitor de 2026-09-30, para o link de assinatura; valer também para a
    ficha foi decisão do Claude em 2026-10-21, pelos princípios), aparece
    "Mandar pela conversa" (`enviarFichaPelaConversa`):
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
  termos fixos do checkout; os Documentos novos são o §9.4.1
- Cliente NÃO acessa o prontuário pelo app — apenas histórico de procedimentos.
  A exceção é a ficha de saúde PENDENTE dela: ali ela vê as
  perguntas e, dentro da validade, as próprias respostas de antes — e, pelo
  link, as que a equipe preencheu para ela (A52) —, nada de evolução, foto ou
  anotação da equipe.
- **Dado clínico só com o módulo de prontuário, venha da tela que vier**
  (`podeVerClinico(ctx)`, `lib/auth.ts`; 2026-10-03). Vazavam por telas de
  outros módulos e foram fechados: a evolução na sessão de atendimento (só
  `agenda`), os anexos clínicos do cliente (`lib/clientes/anexos.ts`: exame,
  laudo, foto clínica, receita, termo — só `clients`), a anotação do
  profissional no plano e a ficha de saúde no arquivo do tratamento (só `agenda`).
  Concluir o atendimento pede o Atendimento em Gerenciar (o clínico dele, o
  Prontuário em Gerenciar); salvar a evolução, a ficha do procedimento e a
  foto dela pede o Prontuário em Gerenciar, sem precisar atender (UM4 de
  23/11; de 18/11 a 23/11 pedia os dois — ATD-A03). Prova: `e2e/clinico-so-com-prontuario.spec.ts`.
- **A aba Prontuário lista TODO atendimento com registro clínico** (D4 da
  simulação de 2026-10-27): a evolução (`medical_record_entries.notes`), a
  intercorrência ou a ficha de atendimento — basta um dos três
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
  anexadas pelo cartão "Fotos do atendimento", diz "2 fotos deste atendimento,
  em Fotos do atendimento, neste registro" (`[data-fotos-na-ficha]`; era "em
  Documentos → Foto clínica" até o PR1a, 2026-11-14) — dizia "Não
  informado". Prova: `e2e/prontuario-atritos-da-11.spec.ts`.
- **O recorte do prontuário saiu** (SM1, 23/11): sem o "só os meus", quem tem
  o Prontuário em Ver vê os termos e os anexos clínicos de toda cliente da
  rede; o aviso "não aparecem para você" (A35 da 11ª) não tem mais caso. Sem
  o módulo, o aviso dos anexos clínicos fora fica na aba Documentos
  (`[data-anexos-clinicos-fora]`) — só o número, nada do conteúdo.
- **O modelo de perguntas de injetáveis** (A30 da 11ª: a ficha de
  saúde padrão não perguntava doença neuromuscular, toxina anterior,
  anticoagulante, herpes): no "Editar perguntas" da ficha de saúde,
  "Acrescentar as perguntas de injetáveis" põe no fim o bloco do modelo
  (`PERGUNTAS_DE_INJETAVEIS`, `lib/pre-atendimento/modelo-de-injetaveis.ts`;
  ids `inj_…`, sem duplicar) para a rede revisar e salvar. Nada entra
  sozinho (princípio 6): a ficha padrão da rede nova não mudou. Prova: o mesmo
  spec ("A30"), `tests/pre-atendimento-modelo-de-injetaveis.test.ts`.
- **Quem abriu o prontuário fica registrado** (2026-10-27, decisões do Heitor;
  `lib/prontuario/acessos.ts`, tabela `prontuario_acessos`). Toda leitura
  clínica: a ficha da cliente (com os anexos clínicos), a sessão de
  atendimento, o plano com a anotação ou a ficha de saúde (`getPlanosDoCliente`,
  `getPlanoParaEditar`, `getCheckoutPlan`, `getTreatmentPlanDetails`), a
  liberação do prontuário no pacote LGPD e os mapas de injetáveis — abrir o
  planejamento, a lista da cliente e a lista da tela de Injetáveis (cada
  cliente dela), no ponto "Planejamento de injetáveis" (ATD-P09, 18/11;
  migration `20261124500002`; decisão do Claude pela regra do CLAUDE.md §14).
  - Registra-se DEPOIS de decidir que o dado vai à tela (o mesmo
    `canViewRecords`/`podeVerClinico`), nunca só por abrir a página: quem não
    tem o módulo abre a ficha e não entra no registro. Tela nova que mostra
    dado clínico chama `registrarAcessoAoProntuario`.
  - **Na ficha da cliente, o prontuário só vai à tela na aba Prontuário**
    (`?aba=fichas`; A30 da 15ª simulação — minimização da LGPD, sem mudar
    quem vê): as evoluções, a ficha de saúde e os anexos clínicos não viajam
    nas outras abas, e abri-las não registra acesso. A exceção é o alerta de
    alergia (regra própria: na ficha e no atendimento, para quem vê o
    prontuário): nas outras abas vai só o TEXTO da alergia, e mostrá-lo
    registra o acesso. Prova: `e2e/prontuario-acessos.spec.ts` ("A30").
  - A mesma pessoa relendo a mesma cliente no mesmo ponto em 30 min é uma
    linha só (`prontuario_registrar_acesso`): a tela recarrega sozinha. A
    referência (o plano, o agendamento) fica gravada e não entra na conta, e a
    gravação trava por pessoa e cliente (`pg_advisory_xact_lock`): o layout e a
    página renderizam em paralelo e entravam os dois (D7 da 29ª, decisão do
    Claude, 25/11; migration `20261205100001`,
    `tests/prontuario-acesso-uma-vez.test.ts`). Falha no registro vai ao log e não tranca o atendimento.
  - Quem VÊ é o admin da REDE (`ctx.branchId === null` e
    `medical_records: MANAGE`), no fim da aba Prontuário da ficha. A cliente
    não o recebe no pacote LGPD (expõe nomes da equipe). O texto da seção diz
    a regra de verdade — "quem tem o Prontuário em Gerenciar, sem unidade
    fixa" (A43 da 5ª simulação, 2026-11-01: dizia "só a administração da
    rede", e o médico da rede, com o prontuário em Gerenciar, via a lista).
    A regra ficou, e o Heitor a confirmou no levantamento das regras (H13,
    2026-11-11, opção a: pelo princípio 1 a rede decide pelo cargo quem tem
    o Prontuário em Gerenciar, e pela H7 o controle da rede toda é de quem é
    da rede; quem não tem “A rede inteira” não vê o bloco). O "também com o
    escopo “só os meus”" do texto (A35 da 6ª) sai com o "só os meus" (SM1).
  - Só o servidor lê e grava (RLS sem política); um acesso não se altera
    (gatilho); `user_id` sem chave estrangeira — o registro sobrevive ao
    membro, e o nome é o do ctx (com a marca "via suporte").
  - Prova: `e2e/prontuario-acessos.spec.ts` e o caso da liberação em
    `e2e/lgpd-exportacao.spec.ts`.
- **Anexar (e apagar) anexo CLÍNICO é do prontuário, não do cadastro**
  (2026-10-20, `recusaDoAnexo` em `actions/client-documents.ts`):
  `medical_records: MANAGE` com o alcance da ficha (a rede; sem o "só os
  meus", SM1, de qualquer cliente). O anexo comum (RG, comprovante) segue
  `clients: MANAGE`. A ficha oferece a cada um só as categorias dele. Antes
  tudo pedia o cadastro, e a profissional não tinha onde anexar a foto
  clínica (simulação de um dia de operação).
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
  quem escreve nele. Na ficha da cliente a foto mora no PRONTUÁRIO (PR1a,
  2026-11-14): no registro do atendimento dela, e — a do atendimento ainda
  sem registro — em "Anexos clínicos", com a linha "Atendimento de
  dd/mm/aaaa · Procedimento" levando à tela dele (`atendimentoDoAnexo`,
  `lib/clientes/anexos.ts`; o dia no fuso do negócio). Não está mais na aba
  Documentos.
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
  Enviar e tirar do app também deixam rastro no histórico do atendimento
  (A8 da 17ª simulação): `FOTO_ENVIADA` "Foto enviada à cliente por <nome>" e
  `FOTO_TIRADA_DO_APP`; no app, a foto se diz "Foto" no Histórico.
  Prova: `tests/atritos-da-17-cadastros.test.ts`.
  **O campo do nome da foto é "Nome no prontuário"** (A15 da 19ª): com a dica
  "Só a equipe lê este nome. No app, a cliente vê “Uma foto do seu
  atendimento”." (`DICA_DO_NOME_DA_FOTO`, `[data-dica-do-nome]`).
  **"Enviar à cliente" já no anexar** (A10 da 18ª simulação): com o portal no
  plano, a caixa do anexo manda a foto ao app no mesmo passo (o mesmo
  `enviarDocumentoACliente`, depois de gravar). O aviso diz "Foto nova" —
  "<unidade> enviou uma foto do seu atendimento." — e, no app, a foto do
  atendimento se diz "Uma foto do seu atendimento" (`tituloDoArquivoNoApp`).
  O aviso (a foto e o documento) abre o Histórico na aba "Fotos e arquivos",
  onde eles estão (`linkDoDocumentoNoApp`, `?aba=documentos`; A13 da 21ª; A35
  da 23ª: a aba se chamava "Documentos", como a tela dos termos e contratos, e
  a cliente procurava a foto na outra — `ROTULO_DOS_ARQUIVOS_NO_APP`; a tela
  Documentos leva a ela, `[data-fotos-e-arquivos]`). Lá, a
  foto aparece pela miniatura, não pelo ícone de documento (`miniaturaNoApp`,
  `[data-miniatura-da-foto]`; A40 da 22ª).
  Prova: `tests/app-da-cliente-atritos-da-21.test.ts`, `tests/atritos-da-23-cargos-atendimento-app.test.ts`.
  **O cartão vazio diz onde a foto fica** (A26 da 9ª simulação, revisto no
  PR1a do bloco Prontuário, 2026-11-14): "Nenhuma foto neste atendimento. Ela
  fica no prontuário da cliente, no registro deste atendimento." (de
  2026-11-07 a 2026-11-14 dizia "em Documentos → Foto clínica"). Prova:
  `e2e/atendimento-atritos-da-9.spec.ts` ("A26"),
  `e2e/prontuario-fotos-e-anexos.spec.ts`.
  **A foto diz o momento** (A13 da 10ª, 2026-11-10: as duas saíam "Foto
  clínica — 10/11/2026"): o anexar da foto do atendimento pergunta "Momento
  da foto" — Antes, Durante, Depois (a primeira nasce "antes", a seguinte
  "depois") — e o nome sugerido o diz ("Foto clínica (antes) — 10/11/2026");
  o nome segue editável (`UploadForm momentos`). Desde o PR1a (2026-11-14) o
  momento também se GRAVA: `client_documents.momento` (`ANTES`/`DURANTE`/
  `DEPOIS`, só na foto clínica), e a miniatura o mostra
  (`[data-momento-da-foto]`). Prova: `e2e/atendimento-uso-da-10.spec.ts`
  ("A13"), `e2e/prontuario-fotos-e-anexos.spec.ts`.
- **No app da cliente aparece só o arquivo que a equipe ENVIA** (decisão do
  Heitor, 2026-10-30; migration `20261029001201`). Anexar (pela ficha ou pela
  foto do atendimento) não manda nada à cliente: o arquivo nasce "Só a equipe
  vê". Na aba Documentos da ficha, "Enviar à cliente"
  (`enviarDocumentoACliente`, `actions/client-documents.ts`) grava
  `client_documents.enviado_em`/`enviado_por`/`enviado_por_nome` e avisa a
  cliente com texto GENÉRICO ("<unidade> enviou um documento para você" — o
  nome do arquivo pode dizer o procedimento); "Tirar do app" desfaz. Pode
  quem pode mexer no anexo (`recusaDoAnexo`: o clínico pede o Prontuário em
  Gerenciar), com a unidade ao alcance; o suporte não envia
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
  Planejamento. Sem o atendimento, a action (`registrarAplicacao`) e a função
  do registro recusam (ATD-P07, 18/11; migration `20261124500001` — a função
  inseria a aplicação sem atendimento). Prova:
  `e2e/injetaveis-confirmar-so-no-atendimento.spec.ts`.
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
  "Atualizar a aplicação registrada"). **O "Registrar aplicação" também guarda
  o planejamento** (A35 da 24ª: a tela recarregava o salvo, vazio, e os pontos
  sumiam — "Nenhum ponto nesta ilustração"): `registrarAplicacao` grava os
  pontos no `injectable_maps` junto. **A linha do procedimento no editor do
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
  - O planejamento tem de ser da cliente DO ATENDIMENTO, da rede e da unidade
    ao alcance (o "de cliente que ela atende" do prontuário "só os meus" saiu,
    SM1) — senão o salvar e o finalizar recusam ("Planejamento de injetáveis
    não encontrado para esta cliente."). O plano é da CLIENTE: quem tem o
    Prontuário vê e usa os planejamentos dela, quem quer que os tenha
    desenhado.
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
    **Logo depois de concluir, a tela já mostra o retrato** (A3 da 26ª,
    princípio 3): digitando, o campo guarda só a ligação (`{ planejamento: {
    id, nome: '' }, points: [] }`), e a ficha concluída mostrava "Planejamento
    sem nome / Nenhum ponto marcado" até recarregar. A ficha remonta com o que
    o servidor gravou quando o atendimento se encerra (`chaveDaFicha`), e o
    rascunho do navegador não vale mais.
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
  baixa continua a da tela. **O planejamento para outro dia não é consumo**
  (A1 da 33ª, Decisão A — decisão do Claude, 26/11, princípio 5): sem
  aplicação registrada, o planejamento só se compara com o produto que ESTE
  atendimento tem no cartão de insumos, marcado ou não (o da Toxina numa
  sessão de Toxina); a Toxina desenhada numa Avaliação, que não a usa, não
  avisa nem oferece "Incluir … na baixa" (`totaisQueSeComparam`; a aplicação
  registrada aqui se compara sempre). Prova:
  `tests/injetaveis-planejamento-para-outro-dia.test.ts`. A dose sai com vírgula em toda tela do mapa
  (`formatarDose`: "0,5 ml"). Prova: `e2e/injetaveis-produto-do-estoque.spec.ts`,
  `tests/injetaveis-dose.test.ts`. **"U" e "UI" são a mesma unidade na
  comparação** (D16 da 9ª simulação, 2026-11-07): a toxina do estoque se conta
  em "U" (o frasco de 100 U, J-11) e o ponto do mapa nasce em "UI" — os 56 UI
  do mapa da Marina e os 40 U da baixa nunca se comparavam, e o aviso não
  saía. A soma do mapa e a comparação juntam as duas, e o texto fala na
  unidade do insumo ("O mapa soma 56 U de Toxina; a baixa está em 40 U.").
  ml e UI seguem sem se comparar. Prova: `tests/injetaveis-dose-u-e-ui.test.ts`.
  **O insumo do mapa contado em outra medida também avisa** (D10 da 31ª;
  decisão do Claude, 26/11, princípios 3 e 4): o produto do mapa que não está
  na baixa e que o estoque conta noutra medida (a toxina em frasco, o ácido em
  seringa, sem a medida de consumo) passava calado. Agora: "O mapa soma 30 UI
  de Toxina, que não está nos insumos da baixa. O estoque conta este produto
  em frasco: inclua no cartão de insumos quanto foi usado." — sem botão (o
  sistema não converte UI em frasco: não chuta número). O mapa continua sem
  dar baixa sozinho. Prova: `tests/injetaveis-dose-em-outra-medida.test.ts`.
- **Os injetáveis são de quem realiza o atendimento; ver é do Prontuário**
  (o Heitor, 2026-11-23: "o mapa de injetaveis é pra quem realiza
  atendimento"; e "ok" à proposta "criar e editar o plano (planejamento) de
  injetáveis e registrar a aplicação: Atendimento em Gerenciar; ver os planos
  e mapas: Prontuário em Ver" — revê o UM4 de 23/11, que punha os injetáveis
  no Prontuário em Gerenciar). Criar, salvar, renomear, ligar a cliente e
  registrar a aplicação (`criarPlanejamentoInjetavel`,
  `salvarPlanejamentoInjetavel`, `renomearPlanejamentoInjetavel`,
  `vincularClienteAoPlanejamento`, `registrarAplicacao`) pedem o Atendimento
  em Gerenciar — a permissão, não o "Atende" da Equipe (UM5) — E o Prontuário
  em Ver (o Heitor, 2026-11-23, "3 - ok", à proposta "gravar injetáveis: pedir
  as duas permissões": quem planeja ou registra a aplicação vê as anteriores, e
  a action diz o mesmo que a tela, que só mostra o mapa com o Prontuário em
  Ver). A tela só oferece editar com as duas (`podeEditar` e
  `podeEditarInjetaveis` = Atendimento em Gerenciar && Prontuário em Ver). A lista de
  Injetáveis (`listarMapasDeInjetaveis`), o planejamento aberto, os
  planejamentos da cliente e as doses do mapa abrem com o Prontuário em Ver
  (sem o "só os meus", SM1). Toda action pelo id do mapa (`mapaDoTenant`)
  confere a rede e o alcance. A tela só oferece "Novo planejamento", marcar
  pontos, "Salvar planejamento", renomear, "Ligar a um cliente" e "Registrar
  aplicação" a quem tem o Atendimento em Gerenciar (`podeEditar` da tela de
  Injetáveis, `podeEditarInjetaveis` do `PainelPlanejamento` na ficha e no
  atendimento, `ContextoDosInjetaveis.podeEditar` no campo do planejador da
  ficha — sem ele, o campo abre e escolhe o planejamento da cliente, sem mexer
  no mapa). Saiu o recorte ao mapa DELA (da cliente que ela atende ou, avulso,
  o que ela mexeu por último). E o vazio da tela de Injetáveis só convida a
  "começar um novo" quem grava o mapa (`InjetavelVazio podeEditar`; A6 da
  27ª). Prova: `tests/injetaveis-quem-realiza-atendimento.test.ts`,
  `tests/ficha-e-atendimento-o-que-a-tela-oferece.test.ts`.
- **A sub-aba Planejamento → Injetáveis só existe para quem vê o clínico**
  (D7 da simulação de 2026-10-29): `PainelPlanejamento podeVerInjetaveis` é a
  decisão clínica da tela que o monta — `podeVerProntuario` na ficha,
  `canViewRecords` no atendimento. Sem ela, nem pela URL
  (`?planejamento=injetaveis` cai no plano de tratamento). E a lista nunca
  fica em "Carregando…": a action LANÇA sem o módulo (`semAcesso()`), e a
  promessa rejeitada vira o aviso "Não foi possível carregar…"
  (`buscarPlanejamentos`). Quem não tinha o Prontuário abria a sub-aba, recebia 500 e ficava
  carregando para sempre. Prova: `e2e/injetaveis-sem-prontuario.spec.ts`.
- **E o plano de tratamento só existe para quem tem o Atendimento** (D6 da
  5ª simulação, 2026-11-01, que pedia a Agenda; desde 2026-11-18 o
  Atendimento — o Heitor: "Agenda é agenda e atendimento é atendimento"; UM3):
  `getPlanosDoCliente`, `listarPlanejamentos`, as
  páginas de Tratamentos e o menu pedem `atendimento: VIEW` (todos os planos
  das unidades ao alcance; sem o "só os meus", SM1). Na ficha, sem o Atendimento e sem o prontuário, a aba
  Planejamento some; com o prontuário e sem o Atendimento, ela é só a de
  injetáveis (`PainelPlanejamento podeVerPlanos`).
  A carga da lista que falha diz "Não foi possível carregar os planos de
  tratamento." — era "Carregando planos…" para sempre, com 500 na rede. E a
  ficha não oferece "+ Agendar" sem a Agenda em Gerenciar, nem "Adicionar
  primeiro documento" a quem não anexa (A23). Prova:
  `e2e/permissoes-quem-so-ve.spec.ts`.
  **Quem monta o plano é quem tem o Atendimento em Gerenciar, com a unidade
  do plano ao alcance** (UM3, 2026-11-23 — revê a PT2 de 14/11, "quem monta
  o plano é quem atende"; o Heitor, 23/11: "concordo, pode anotar, marcar as
  questões e ajustar o codigo"). O "Atende" da Equipe deixou de ser a trava
  (UM5: não dá permissão nenhuma); a Admin da rede monta em qualquer unidade.
  A regra mora num lugar só: `montaPlano(ctx, unidade)`
  (`lib/plano-de-tratamento/quem-monta.ts`). O Prontuário em Gerenciar não
  entra na trava de montar — criar, salvar, renomear,
  ligar a cliente, "Cliente vai pensar" e o rascunho da avaliação
  (`criarPlanoDoCliente`, `salvarPlanoDoCliente`, `renomearPlano`,
  `vincularClienteAoPlano`, `proposeTreatmentPlan`, `saveTreatmentPlan`)
  devolvem `{ error: RECUSA_QUEM_MONTA }` a quem não monta na unidade do
  plano, depois de conferidos a rede e o alcance.
  - **A anotação clínica dentro do plano continua do Prontuário** (as
    "Observações de quem atende", `professional_notes`; A9 da 15ª): só quem tem o
    Prontuário em Gerenciar (`anotaNoPlano`) a escreve. Para quem monta sem ele, o editor não mostra o
    campo (`podeAnotar`), a action ignora a anotação que chega e a que está
    gravada FICA — nem se apaga (a `gerar_plano_da_avaliacao` só mexe nela
    quando recebe `notas_do_plano`, migration `20261115500001`). E o "envio"
    não pede a observação a quem não pode escrevê-la.
  - **Monta-se na avaliação ou DEPOIS** ("a dra pode realizar a avaliação e
    depois com calma montar o plano"): o "Novo plano" na ficha (Planejamento →
    Tratamentos) e no menu Tratamentos; e "Montar um plano" no atendimento
    CONCLUÍDO (o plano nasce ligado a ele; A21 da 22ª: dizia "desta
    avaliação" também numa drenagem). **Antes de iniciar, o plano é opcional**
    (A21): no agendado, confirmado ou chegou, o cartão diz "Propor um plano
    (opcional)" e o "Aceitar plano" não é a ação grande (`planoAntesDeIniciar`).
    **E durante o atendimento avulso também** (A25 da 23ª, princípio 7: ao
    iniciar, o "Aceitar plano" virava o botão grande acima do "basta
    Finalizar"; `planoDuranteOAtendimento`). A janela Planejamento, com o plano
    na tela, diz as "Queixas e dores" antes da "Nova sessão" quando elas estão
    em branco (são o que barra o plano), e o botão dela leva às dores
    ("Ir às Queixas e dores") ou ao cartão "Tratamento" (A21 da 23ª,
    `textoDoPlanoNaTela`). **E a ficha de saúde, antes do clique** (A36 da
    24ª): o bloco do plano diz "Para gerar o plano, falta responder na ficha de
    saúde: …", com o "Responder aqui" (`avisoDaFichaParaOPlano`,
    `[data-ficha-antes-do-plano]`).
    **As dores dizem no campo** "obrigatório para gerar o plano" (A18). Na avaliação ABERTA,
    gera e aceita o plano quem tem o Atendimento em Gerenciar, com a unidade
    ao alcance (UM3; `montaPlano`, `RECUSA_QUEM_ATENDE`: "Gerar e aceitar o
    plano na avaliação pede o Atendimento em Gerenciar."). O Prontuário em Gerenciar saiu
    dessa trava na auditoria das regras (2026-11-18). O clínico que a mesma
    gravação escreve (as dores, a ficha, a ficha de saúde, a evolução) só vai
    com o Prontuário em Gerenciar — sem ele, só o plano, como no "Finalizar".
  - No portal da rede, o "Novo plano" oferece só as unidades em que ela monta
    (`montaPlano`: as ao alcance dela; UM3).
  **Sem o "Novo plano", a tela diz quem monta** (A18 da 6ª simulação,
  2026-11-04, revisto no UM3): a aba Planejamento vazia e a tela Tratamentos
  dizem "Quem monta o plano é quem tem o Atendimento em Gerenciar nesta
  unidade, na avaliação ou aqui." (`TEXTO_QUEM_MONTA`). Prova: `e2e/plano-tratamento-leva-1.spec.ts`,
  `e2e/configuracoes-atritos-da-12.spec.ts` ("A12"). E `/planejamentos/novo` (os dois
  portais) não é 404: leva à lista com `?novo=1`, que abre o "Novo plano"
  para quem monta. Prova: `e2e/planejamentos-quem-monta.spec.ts`.
- **A página do plano é o centro, com os passos** (PT1a, 2026-11-14):
  ① Aceite ② Documentos ③ Contrato e pagamento ④ Sessões (`PassosDoPlano`,
  `getPassosDoPlano`). Cada passo diz o estado e leva aonde se faz: o aceite
  ali mesmo ("Aceitar plano" e "Cliente vai pensar", que salvam o que está na
  tela antes); os documentos, à ficha da cliente (o link e o aparelho que já
  existem); o contrato e o pagamento, à comanda do plano no PDV ("Receber no
  PDV", a quem recebe); as sessões, ao agendar. O passo da vez é o número
  preenchido, na ordem do Heitor: aceitar → assinar → pagar → agendar. As
  contagens das sessões são da fonte única (`metrics_financeiro_do_plano`).
  Aceita quem monta o plano (o Atendimento em Gerenciar na unidade dele, UM3)
  ou quem recebe (`podeReceber`).
- **O plano ainda não aceito também se cancela** (A1a da 25ª simulação; o
  Heitor, 18/11, à pergunta "o plano proposto e ainda não aceito não tem um
  botão 'Cancelar'. Entra?": "sim"). No rascunho e no PROPOSTO, ao lado do
  "Aceitar plano", o "Cancelar plano" (`[data-cancelar-proposto]`, a janela
  `CancelarPlanoProposto`) — a forma do cancelamento do aceito (o motivo
  obrigatório), sem a conta do dinheiro: nada foi vendido nem recebido (o
  Heitor, 18/11: "Uma coisa só foi vendida se foi paga."; a comanda do plano
  só nasce no aceite). Cancela quem MONTA o plano (`montaPlano`, a permissão
  de quem o edita e o manda à cliente); quem só recebe não vê o botão, e
  `cancelarPlanoProposto` recusa com `{ error: RECUSA_QUEM_MONTA }` depois de
  conferidos a rede e o alcance (`planoDoTenant`). O aceito
  segue com o "Cancelar plano" do Financeiro em Gerenciar, com o dinheiro
  (`vendas-financeiro.md`); a action e a função recusam o aceito, o concluído
  e o já cancelado (`recusaDoCancelamentoSemDinheiro`,
  `lib/plano-de-tratamento/cancelar-proposto.ts`). Numa transação
  (`plano_cancelar_proposto`, só o servidor; migration `20261125400001`): o
  plano fica `CANCELLED` com o retrato (`cancelado_em`, `cancelado_por`,
  `cancelamento_motivo`, `cancelamento.antes_do_aceite`), e o gatilho
  `documentos_do_plano_cancelado` cancela os documentos que esperavam
  assinatura e revoga os links deles. A tela mostra "Cancelado antes do
  aceite: nada foi vendido nem recebido." e quantos documentos caíram
  (`retratoDoCancelamento`); o Histórico da ficha diz "antes do aceite"
  (`historicoDoCancelamento`). O app da cliente deixa de mostrar o plano (o
  Início e a página leem só o proposto, o aceito e o concluído), e o aceite
  dele recusa "Este plano foi cancelado e não pode mais ser aceito. Fale com
  a equipe se quiser retomar o tratamento." (`plano_aceitar` diz o mesmo à
  equipe — era "Este plano já foi aceito."). A Auditoria registra quem
  cancelou (o gatilho de `treatment_plans`). A oportunidade da cliente não se
  move (nada se move sozinho; R12), e nenhum evento sai. Prova:
  `tests/plano-cancelar-proposto.test.ts`, `e2e/plano-cancelar-proposto.spec.ts`.
- **Cada sessão tem o [Agendar], e há o "Agendar todas"** (PT1d), a qualquer
  momento depois do aceite (antes dele, o passo ④ diz "depois do aceite" — e o
  servidor recusa a sessão de plano não aceito, `conferirCredito`). O agendar
  já vem com a cliente, o procedimento e a duração da sessão
  (`SessionScheduler` + `schedulePlanSession`, pelo `createAppointmentCore`);
  o "Agendar todas" segue para a próxima sessão livre a cada uma salva.
  Agendar é da Agenda em Gerenciar. O "+ Agendar" da agenda continua
  oferecendo as sessões do plano.
- **A sessão do plano não cobra nada** (PT1e): a comanda do atendimento não
  nasce para a sessão de plano; o dinheiro do plano é o da comanda do plano
  no PDV, e a parcela que venceu aparece no PDV da cliente
  (`parcelasEmAbertoDaCliente`, "Receber esta parcela"). Prova:
  `e2e/plano-tratamento-leva-1.spec.ts` ("PT1e"). **E a tela do atendimento
  não recebe o plano** (AT-13, PV-13; o Heitor, 13/11, PV-01: "o pagamento
  acontece por dentro desse PDV, seja do que for"): saiu a janela de receber o
  plano no check-in (`receberDoPlano`, 28ª simulação). A tela DIZ o saldo do
  plano aceito (`[data-plano-em-aberto]`: o que venceu, "Mais R$ X a
  vencer", ou "Parcelas combinadas — a próxima vence em …. Nada a receber
  agora.") e, a quem recebe (`podeReceber`) e só com algo vencido, leva ao PDV
  da cliente ("Receber no PDV", `rotaDaClienteNoPdv`), onde a parcela se
  recebe. O plano aceito já recebido diz isso no lugar de "assina o contrato e
  paga" (D8 da 28ª; `andamentoDosPlanos(...).recebido`). A função do banco
  `plano_receber` fica (os testes de taxa a chamam). Prova:
  `e2e/plano-recebimento.spec.ts`, `e2e/plano-recebimento-concorrente.spec.ts`,
  `tests/sessao-do-atendimento-o-que-a-tela-diz.test.ts`.
- **A página do plano diz o que houve** (D7 e D19 da 28ª simulação; decisão do
  Claude, 25/11, pelo princípio 3): a sessão feita diz a hora em que foi feita
  ("Realizada em …", `completed_at`; era a hora marcada), também na janela das
  sessões do pacote e do plano; e o plano cancelado diz "Cancelado" no passo
  do pagamento e não fala em "depois do aceite". Prova:
  `tests/sessao-do-atendimento-o-que-a-tela-diz.test.ts`.
- **O agendar da sessão (pacote, plano, pré-pago) só oferece as unidades ao
  alcance** (D18 da 28ª simulação; CLAUDE.md §11 e §14): a lista vinha das
  unidades do pacote e oferecia uma fora da abrangência da pessoa — escolhida,
  o Profissional ficava vazio e a Data travada, sem explicação. O
  `SessionScheduler` filtra pela `unidadesAoAlcance` (`actions/appointments.ts`,
  `alcancaUnidade`); com uma só, ela vem escolhida. Prova:
  `tests/sessao-do-atendimento-o-que-a-tela-diz.test.ts`.
- **Tratamentos filtra pela situação** (PT1f): Rascunho, Proposto, Aceito
  (falta assinar), Falta pagar, Em andamento, Concluído, Cancelado
  (`situacaoComercialDoPlano`, `lib/plano-de-tratamento/situacao.ts`; o banco
  lido em `andamento-do-plano.ts`). O aceito com documento por assinar — ou
  com o contrato de plano por emitir/assinar — é "Aceito (falta assinar)"; sem
  isso e sem dinheiro, "Falta pagar"; com dinheiro recebido, "Em andamento" (o
  recebido vence o documento aberto). O REJECTED antigo é "Cancelado". Sete
  situações: um seletor (`.filtro-select`), não um segmentado. O plano
  proposto se chama "Proposto" em toda tela (era "Aguardando checkout").
- **Os planos de tratamento seguem o Atendimento, sem recorte** (era a
  Agenda até 2026-11-18; sem o "só os meus" desde 23/11, SM1): a tela
  Tratamentos (`listarPlanejamentos`), os planos da cliente
  (`getPlanosDoCliente`, o Planejamento da ficha e do atendimento) e toda
  action pelo id do plano que passa por `planoDoTenant` (cabeçalho, editar,
  salvar, renomear, ligar cliente, enviar ao PDV, aceitar, receber dele no
  PDV, o arquivo do tratamento) valem para todo plano da rede, na unidade ao
  alcance. Saiu o recorte ao plano DELA (`planoDaProfissional`,
  `clienteAtendidaPor`). Cancelar o plano fechado é do Financeiro em
  Gerenciar, como o pacote (D4 da 9ª, `vendas-financeiro.md`). A anotação do
  profissional no plano continua do Prontuário (`podeVerClinico`). Os gestos
  de quem RECEBE (`getCheckoutPlan`, `cancelCheckout`; o `receberDoPlano`
  saiu na 28ª, o plano se recebe no PDV) pedem `cashier`/fechar plano, não o
  Atendimento.
- **A tela dos planos se chama "Tratamentos", como o menu** (A30 da 8ª
  simulação, 2026-11-06; decidido pelo princípio 3): o menu "Tratamentos"
  abria "Planejamentos". Ficou o nome do menu: o grupo dele é "Planejamento"
  (Tratamentos e Injetáveis, como as duas sub-abas do Planejamento da ficha),
  e "Planejamentos" sozinho dizia também os de injetáveis. O título da lista e
  o "voltar" do plano aberto dizem "Tratamentos"; a rota segue
  `/planejamentos`. Prova: `e2e/atendimento-atritos-da-8.spec.ts` ("A30").
- **A sessão de pacote se diz paga** (A7 da 18ª simulação; princípio 3): a
  tela do atendimento abre com "Sessão 2 de 6 do pacote X, já paga." ("…,
  trazido de fora: já paga antes do sistema." no de fora;
  `textoDaSessaoDoPacote`). **No crediário, "incluída", não "já paga"** (D4
  da 21ª): o pacote com dinheiro em aberto diz "Sessão 2 de 6 do pacote X:
  incluída no pacote, que tem R$ 600,00 em aberto." (o valor só a quem
  recebe, `podeReceber`; aos outros, "que tem parcelas em aberto"); a janela
  da agenda diz "Incluído" no lugar de "Já pago", e a agenda e o app da
  cliente somam o em aberto da venda (`pagosAntes` →
  `getEmAbertoDasVendas`), dizendo de quem ele é: "4 limpezas · sessão 1 de
  4 · pacote com R$ 400,00 em aberto" (A19 da 26ª, princípio 3; "pré-pago
  com…", "plano com…"). Ali o plano é opcional: "Propor um plano novo
  (opcional)", e o "Aceitar plano" é o secundário. A linha do insumo diz a
  quantidade com a embalagem do produto (`linhaDoInsumo`, A9).
- **"Aceitar plano" usa o que está na tela** (A29 da 12ª simulação, 2026-11-11;
  princípio 3): com a observação digitada e não salva, a Bianca lia "Preencha
  as observações antes de enviar." O "Aceitar plano" e o "Cliente vai pensar"
  salvam o editor antes (o `ref` do `TreatmentPlanEditor`, como o "Enviar para
  a recepção" da avaliação), e a recusa diz "…antes de aceitar o plano ou
  mandá-lo à cliente." Prova: `e2e/agenda-atritos-da-12.spec.ts` ("A29").
- **"Novo plano" (de tratamento) só grava ao salvar** (2026-10-21, decisão do
  Heitor): na ficha da cliente e no atendimento, o botão abre o editor com um
  rascunho que existe só na tela; o plano nasce no primeiro "Salvar plano"
  (`salvarPlanoNovo`, que cria e grava as sessões — e desfaz o plano vazio se
  as sessões falharem). Aceitar e "Cliente vai pensar" só aparecem depois de
  salvo. Antes ele nascia vazio no clique, e quem desistia deixava um rascunho
  de zero sessões. Prova: `e2e/plano-novo-so-ao-salvar.spec.ts`. **O plano
  novo ainda não salvo fica guardado NA ABA** (23ª A21, 2026-11-17): fechar o
  editor (ou recarregar) perdia o que estava montado. Ele se guarda no
  armazenamento da aba, por cliente e agendamento
  (`gravarPlanoNaoSalvo`/`lerPlanoNaoSalvo`, `lib/atendimento/rascunho.ts` —
  como o rascunho da evolução, morre com a aba), o botão diz "Continuar o
  plano não salvo" e o editor volta com ele (`[data-plano-nao-salvo]`, com
  "Descartar"); o "Salvar plano" o apaga. O botão "Planejamento" do
  atendimento é secundário. Prova: `tests/pendencias-area-1.test.ts`.
- **Na avaliação, o plano se monta NA TELA** (A29, 2026-10-27): enquanto o
  plano da avaliação não foi gerado, a tela do atendimento já tem o editor
  dele ("Tratamento"), e o Planejamento aberto por cima (`planoNaTela`) lista
  os planos da cliente mas não oferece "Novo plano" — diz que o plano desta
  avaliação se monta no cartão “Tratamento” da tela do atendimento, com o
  "Ir ao Tratamento", que fecha a janela e leva ao cartão (A14 da 21ª: "em
  Tratamento" não dizia onde). **E o primeiro passo** (A19 da 22ª; princípio
  7: o caminho parecia circular): a janela e o Tratamento vazio dizem
  "comece em “Nova sessão” e escolha o procedimento", e o "Ir ao Tratamento"
  põe o foco no "Nova sessão". Eram dois "Nova sessão" no mesmo gesto,
  e o plano feito no Planejamento ficava fora do plano gerado na avaliação
  (então o "Enviar para a recepção"; hoje os dois botões do plano, "Aceitar
  plano" e "Gerar plano · a cliente vai pensar").
  Prova: `e2e/plano-dica-do-pacote.spec.ts`.

---

- **Bloco Prontuário (revisão do Heitor, 2026-11-13; entregue em
  2026-11-14)**:
  - **PR1a — a foto mora no atendimento dela**: a aba Prontuário da ficha
    mostra, dentro do registro de cada atendimento
    (`[data-registro-do-atendimento]`), as fotos dele (`FotosDoAtendimento
    embutido`): a miniatura abre grande, o momento (Antes/Durante/Depois), o
    título, "Enviar à cliente"/"Tirar do app" e "Excluir" (só marca) a quem
    tem o Prontuário em Gerenciar com o alcance da ficha. Saiu o "N fotos em
    Documentos → Foto clínica".
  - **PR1b — "Anexos clínicos" no Prontuário**: o exame, o laudo, a receita, a
    foto e o termo anexados sem atendimento (e a foto do atendimento que ainda
    não tem registro) moram na seção "Anexos clínicos" da aba Prontuário
    (`components/branch/anexos-clinicos.tsx`, `[data-anexos-clinicos]`):
    anexar (só as categorias clínicas), ver, enviar à cliente e excluir (só
    marca, `apagado_em`). A aba Documentos fica com o COMUM (RG, comprovante,
    "outro", contrato) e só oferece o comum. A página só manda à tela o
    anexo clínico de quem vê o prontuário (`canViewRecords`, com o acesso
    registrado), com o link assinado só na aba que o mostra.
  - **PR2a — "Acrescentar anotação"**: no atendimento CONCLUÍDO, quem tem o
    Prontuário em Gerenciar, com o alcance de hoje (a rede, a unidade ao
    alcance ou o atendimento dela), acrescenta
    um texto datado com o nome do ctx (a marca "via suporte" junto) —
    `acrescentarAnotacao` (`actions/prontuario.ts`), tabela
    `prontuario_anotacoes`. Não se edita nem se apaga: não há botão, e o
    gatilho `prontuario_registro_imutavel` recusa UPDATE e DELETE (só a
    cascata e a limpeza da rede de teste passam). Aparece no atendimento e no
    registro da aba Prontuário, na ordem do tempo
    (`[data-anotacoes-do-atendimento]`). Antes de concluir, escreve-se na
    evolução — a action recusa.
  - **PR2b — a correção guarda a versão de antes**: o "Editar registro" do
    concluído salva pela `prontuario_corrigir_registro` (UMA transação,
    `lib/prontuario/corrigir.ts`): grava em `prontuario_versoes` a evolução, a
    intercorrência e a ficha de atendimento como estavam, com quem corrigiu
    (o nome do ctx) e quando, e só então troca. Sem mudança, nada se grava; a
    ficha só "muda" quando muda a RESPOSTA (o retrato das perguntas
    remontado não conta — migration `20261115100003`). A versão não se altera
    nem se apaga (o mesmo gatilho). A tela diz "Editado por X em dd/mm — ver
    a anterior" (`[data-registro-editado]`, `[data-versao-anterior]`), no
    atendimento e no registro da aba Prontuário. A avaliação concluída
    destravada ganhou o "Salvar" (não tinha: destravar não gravava nada).
    **Os insumos não se corrigem ali** (A2 da 33ª, Decisão A — decisão do
    Claude, 26/11, princípio 7): a baixa é movimento do estoque, e a faixa do
    registro destravado diz "Os insumos não se editam aqui: o ajuste é no
    Estoque, por quem tem o Estoque em Gerenciar."
    (`TEXTO_DOS_INSUMOS_NO_EDITAR_REGISTRO`). Prova: `tests/registro-travado.test.ts`.
    Corrigir pede o Prontuário em Gerenciar, e só ele (UM4 de 23/11; de 18/11
    a 23/11 pedia também o Atendimento, e antes a Agenda), também a ficha do
    procedimento e a foto dela; a ficha cancelada ou de falta não se preenche
    mais. **E se corrige na ficha da cliente** (D4 da 31ª; decisão do Claude,
    26/11, princípio 7): sem precisar atender, quem tem o Prontuário em
    Gerenciar corrige na aba Prontuário — no registro do atendimento
    CONCLUÍDO, "Corrigir o registro" (`CorrecaoDoRegistro`,
    `[data-corrigir-registro]`) abre a evolução, a intercorrência e a ficha de
    atendimento e salva pelas mesmas actions (`saveDraftNotes`, que no
    concluído chama a `prontuario_corrigir_registro`, e
    `salvarFichaDoProcedimento`); o acesso já fica registrado pela aba. Só
    existia na tela do atendimento, que pede o Atendimento em Ver. Prova:
    `tests/prontuario-correcao-na-ficha.test.ts`,
    `e2e/prontuario-anotacoes-e-versoes.spec.ts` ("D4").
  - **As duas tabelas são só do servidor**: RLS ligada sem política
    permissiva (a sessão não lê nem grava — prova com o token de um membro no
    spec), as restritivas `suporte_sem_clinico` e `suporte_sem_escrita_*`,
    e a função `security definer` fechada a `anon`/`authenticated`.
  - **PR2c — o pacote LGPD leva as anotações e as versões** de cada
    atendimento (`anotacoes`, `versoesAnteriores` no JSON; linhas no PDF).
  - **PR3 — "Ficha de saúde" em todo texto que se lê**: tela da equipe, app
    da cliente, link público, Configurações → Fichas, Copilot, mensagens de
    erro e o nome da ficha da rede (migration `20261115100002`). O código e o
    banco mantêm `pre_atendimento`/`anamnese`. A trava é
    `tests/ficha-de-saude-no-texto.test.ts`.
  - Prova: `e2e/prontuario-fotos-e-anexos.spec.ts`,
    `e2e/prontuario-anotacoes-e-versoes.spec.ts`.

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
  **O "deu certo" diz os dois saldos** (A16 da 8ª simulação, 2026-11-06): quem
  não tem “A rede inteira” vê só o estoque das unidades dela e não tinha como conferir o
  destino. `estoque_transferir` devolve os saldos depois (com as linhas
  travadas), e o aviso diz "Transferido: Batel agora tem 5 un; Água Verde
  ficou com 3 un." Prova: o mesmo spec ("A16").
  **E aparece no relatório** (A33 da 20ª, 2026-11-17): Relatórios → Estoque,
  "Transferências entre unidades" — o que saiu e o que entrou em cada unidade,
  ao custo do lote que saiu (`metrics_transferencias_de_estoque`,
  `indicadores.md`).
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
    a diferença" ("O válido que vence primeiro (o vencido, por último)" por
    padrão; era "O que vence primeiro", que prometia o contrário da ES-24 para
    o lote vencido — A1 da 28ª simulação, decisão do Claude, 25/11; a perda sem
    lote diz o mesmo, e as opções do lote vencido dizem "venceu") — o movimento leva o lote
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
  - **O custo fora do comum avisa, e o desfazer se acha** (A19 da 19ª,
    princípios 2 e 4: R$ 90.000 por frasco passou calado, e a correção por
    Ajuste virou perda de R$ 180.000): na Entrada, o custo unitário acima de
    10 vezes o custo do cadastro (sem ele, o preço de venda) AVISA — não
    recusa — "Confira o custo unitário: se estiver certo, a entrada vale
    assim." (`avisoDoCustoDaEntrada`, `lib/estoque/custo-da-entrada.ts`,
    `[data-custo-fora-do-comum]`). ~~Sem referência, nada se diz~~ (A10 da
    24ª, o Heitor: "As duas"): sem custo nem preço de venda — o produto novo —,
    o custo a partir de R$ 10.000 por embalagem (`CUSTO_FORA_DO_COMUM`)
    também avisa, na Entrada, no cadastro com o estoque inicial e no "Corrigir
    custo". É só o aviso: o número não entra em conta nenhuma (princípio 4), e
    o valor da rede vale (princípio 2). O lápis do
    produto diz "Em “Movimentar” → Histórico, use “Desfazer entrada” e lance
    de novo" (`[data-desfazer-entrada]`). Prova:
    `tests/atritos-da-19-cadastros.test.ts`, `tests/correcoes-da-24-area3.test.ts`.
  - **O impossível se recusa no SERVIDOR, em português** (o Heitor, 25/11: "Se
    não for impossível, ainda que improvável, pode ser feito."; CLAUDE.md §4, o
    Heitor, 19/11: "Qualquer gravação que não passa pela validação do backend ta
    errada"). Até aqui o custo negativo só o `min="0"` do campo barrava, e o
    que o registro não guarda voltava do banco como "numeric field overflow".
    O impossível (decisão do Claude, 25/11): o custo unitário negativo ("O
    custo unitário não pode ser negativo."; o zero vale), o custo acima de
    R$ 99.999.999,99 (`products.cost_price`, numeric(10,2)), e a quantidade e
    o saldo acima de 999.999,9999 na unidade do MOVIMENTO
    (`stock_movements.quantity`/`balance_after`, `product_batches.quantity`,
    `stock_movement_batches.quantity`, numeric(10,4)) — a de consumo quando o
    produto tem uma: o frasco de 100 UI vai até 9.999,9999 frascos ("No máximo
    9.999,9999 frascos de uma vez (999.999,9999 UI, o limite do registro).").
    Onde se confere: a Entrada (`entradaDeEstoqueCore`, com o saldo DEPOIS lido
    na hora de gravar: "O saldo passaria de…"), o Ajuste (`ajusteDeEstoqueCore`,
    a contagem), a Transferência (o saldo do DESTINO depois,
    `recusaDoRegistroNaTransferencia`; o que falta na origem segue com a recusa
    do banco), o cadastro do produto (o custo e o custo e a quantidade do
    estoque inicial — o custo inicial negativo sumia calado) e a baixa do
    atendimento (`montarInsumosDaBaixa`: a quantidade digitada e o saldo que
    falta, para menos: "O saldo passaria de −999.999,9999 UI…"). A Perda não
    precisa: ela não tira mais do que há. A regra é UMA,
    `lib/estoque/limites-do-registro.ts`, que o Copilot lê. Prova:
    `tests/nucleo-recusa-o-que-o-registro-nao-guarda.test.ts`. O app lê o
    saldo FORA da transação: duas entradas ao mesmo tempo passavam da
    conferência, e a segunda voltava do banco em inglês. `estoque_entrada` e
    `estoque_transferir` (que já travam o saldo) conferem o mesmo limite
    depois do saldo novo calculado ("O estoque passaria de 999.999,9999 (o
    limite do registro)."; migration `20261208100001`, decisão do Claude,
    25/11). Prova: `tests/estoque-limite-do-registro-dentro-da-transacao.test.ts`.
  - **O custo do lote se corrige enquanto nada saiu dele** (A10 da 24ª, o
    Heitor: "As duas"; migration `20261123600001`): "Corrigir custo", na
    linha do lote, para quem tem o Estoque em Gerenciar e a unidade do lote
    ao alcance. Grava o custo por embalagem no movimento de entrada do lote
    (`unit_cost` = custo ÷ rendimento) e, se é a entrada mais recente com
    custo, o `cost_price` do produto — numa transação
    (`estoque_corrigir_custo_do_lote`, que recusa o lote de onde já saiu algo
    e o que veio por transferência: o custo é o do lote de origem). A tela só
    oferece o botão nesse caso (`lotes_com_custo_editavel` →
    `custoEditavel`). A Auditoria diz "Corrigiu o custo do lote de X: de R$ A
    para R$ B por <embalagem>". **Depois da primeira saída**, o caminho é o
    Ajuste com o tipo "Correção de cadastro" (`estoque_ajuste_de_correcao`,
    `stock_movements.correcao_de_cadastro`): acerta o saldo e NÃO conta como
    perda — fica fora de "Perdas no período", do "Consumo com perdas" e do
    giro (`indicadores.md`); o Histórico o diz "Correção de cadastro".
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
  - **O cadastro do procedimento diz quanto da embalagem a dose é** (A7 da
    17ª simulação): "1 ml (1/100 do frasco)", "2 un (1/2 da seringa)"
    (`parteDaEmbalagem`, `lib/estoque/unidade-de-consumo.ts`); sem unidade de
    consumo, nada. Prova: `tests/atritos-da-17-cadastros.test.ts`. **E o
    custo diz a unidade** (A3 da 28ª simulação; ES-19): "R$ 3,00 /ml" ao lado
    de "4 ml" (`[data-custo-por-unidade]`; o title "Custo por unidade (ml)") —
    o custo é por unidade de consumo, e a tela não dizia. Prova:
    `tests/estoque-o-que-a-tela-diz.test.ts`.
  - **A quantidade do insumo nasce em branco e diz o que falta** (A13 da 15ª,
    princípio 4: o 1 de antes dava a margem errada; A21 da 19ª): a linha vazia
    diz "quanto sai a cada atendimento (obrigatório)"
    (`[data-quantidade-em-branco]`) — não volta a nascer com 1. Prova:
    `tests/atritos-da-19-cadastros.test.ts`.
  - Prova: `e2e/estoque-custo-de-consumo.spec.ts` (a entrada, o consumo de
    5 ml a R$ 4,50 no movimento, no giro, no relatório, na margem e na
    comissão com "descontar insumos", o valor em estoque, ajuste e
    transferência, o histórico).
- **Onde o produto está disponível: Insumo e Venda direta** (E2 do Bloco
  Estoque, 2026-11-14 — o Heitor, 13/11: "checkbox de onde o produto está
  disponivel (Insumo e Venda direta)"). O cadastro tem DOIS checkboxes no
  grupo "Onde o produto está disponível"; o produto novo nasce sem caixa
  marcada, e a pessoa escolhe (o Heitor, 25/11: "ok" à proposta; era "nasce
  com Insumo", e o de revenda nascia como insumo; `checkboxesIniciais`). Os
  dois podem estar marcados; nenhum é recusado
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
  A prévia diz "Gerado ao salvar (REV-…)", esmaecida — o número só existe
  quando o produto grava (A8 da 23ª: "REV-NNN" parecia um valor).
- **A saída por PERDA** (D-7, decisão do Heitor, 2026-10-29; migrations
  `20261029001303`/`304`): Gerenciar estoque → Movimentações → "Perda", com o
  LOTE (ou "sem lote — sai o que vence primeiro"), a quantidade em
  EMBALAGENS, o motivo (um dos motivos de perda da rede — abaixo; até
  18/11 era a lista fixa Vencido, Quebrou, Amostra, Uso interno) e a observação.
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
  - **Os motivos da perda são um cadastro da REDE** (item 7 do escopo de
    18/11, o Heitor: "motivos de perda configuraveis, poder
    adicionar/editar/excluir"; migration `20261201100001`): a lista fixa saiu.
    `estoque_motivos_de_perda` fica ao lado das categorias, das marcas e dos
    fornecedores (botão "Motivos de perda" no Estoque, `CadastroDoEstoque`,
    as mesmas actions `criar/renomear/excluirItemDoEstoque`), e a rede nasce
    com os quatro de antes, editáveis (`private.estoque_motivos_de_perda_semear`,
    pelo gatilho da rede nova). Quem mexe é quem tem o Estoque em Gerenciar
    (decisão do Claude, 26ª, pela regra das outras três listas). O formulário
    manda o id; `estoque_perda_em` resolve o motivo pelo id ou pelo nome, da
    REDE do produto (`private.motivo_da_perda_de`; as chaves de antes,
    `VENCIDO`…, ainda valem para quem chama por dentro). O movimento grava o
    NOME (`motivo_da_perda`) e o id (`motivo_da_perda_id`, `on delete set
    null`): **excluir um motivo usado não apaga a história** (decisão do
    Claude, 26ª) — ele sai das opções, e a perda guarda o nome; renomear
    junta no relatório as perdas do motivo sob o nome novo. A tabela nasce sem
    política nenhuma para a sessão (o Heitor, 19/11: a sessão nunca grava e só
    lê sinais): o servidor lê e grava. Prova: `e2e/estoque-perda.spec.ts` ("os
    motivos de perda da rede…"), `tests/estoque-so-pelas-funcoes.test.ts`.
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
  - "TOTAL REDE" e "ESTOQUE POR UNIDADE" só com mais de uma unidade na tela; no
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
    quebra linha) e o "Validade em 30 dias" lista "Gel — lote GA-1 · vence
    15/11/2026", até três, e "e mais N" (`loteNoCartao`). Prova: o mesmo spec
    ("A40"). **O vencido diz "venceu"** (D12 da 28ª simulação; ES-24, "o
    vencido é sinalizado"): "Hidratante — lote H1 · venceu 14/11/2026", pelo
    dia da unidade, como o quadro do dashboard. Prova:
    `tests/estoque-o-que-a-tela-diz.test.ts`.
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
    tinha o "Estoque crítico". **O número do quadro conta só o no mínimo ou
    abaixo**, como o "Estoque baixo" do Estoque (D14 da 28ª simulação; ES-20,
    "Sem estoque" é separado; decisão do Claude, 25/11, quanto à forma): o
    zerado com mínimo aparece à parte, em "Sem estoque" (`[data-sem-estoque]`,
    `semEstoque`), fora da conta (`[data-conta-do-minimo]`), e a lista não se
    corta antes de contar (`tests/estoque-o-que-a-tela-diz.test.ts`); e o job `estoque-minimo` (de hora em hora, que já
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
    `lotesComSaldo` + `lotesVencendo`). Prova: o mesmo spec ("A41"). **O
    que sobra se diz na unidade de consumo, com o equivalente em embalagens**
    (D13 da 28ª simulação; ES-19): "22 ml · 0,73 frasco" — era "0,73 frasco"
    no dashboard e "0.7334" nos Relatórios. O lote leva o saldo pronto
    (`LoteVencendo.saldo`, `saldoDoLoteNaTela` em `lib/estoque/situacao.ts`),
    e o quadro o mostra. Prova: `tests/estoque-o-que-a-tela-diz.test.ts`.
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
    Relatórios → Estoque conta o saldo da tela — o rendimento, quando o
    produto tem unidade de consumo (`saldo_de_consumo`, 4 casas; D6 da 33ª,
    migration `20261212200003`), que até 26/11 era `current_stock <= 0` —
    sobre cada produto ativo × cada unidade ativa do recorte
    (`metrics_relatorio`, migration `20261104002102`). Era `= 0` sobre as linhas que existiam: o Gel em −1 un
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
    O "críticos" segue a mesma régua (D22 da 31ª, decisão do Claude, 26/11):
    o cartão de Relatórios → Estoque se chama "Produtos críticos" e conta o
    PRODUTO no mínimo ou abaixo dele uma vez; a linha de cada unidade, o
    produto crítico NELA.
- **Movimentação de estoque NUNCA gera despesa** (D13 revisto, decisão do
  Heitor, 2026-10-28: "tanto entrada quanto saída, não gera despesa. Os
  valores são informados apenas para base de cálculo de insumos, custo,
  margem e lucro"). Nenhuma porta — a "Entrada" (unidade e rede), o estoque
  inicial do cadastro do produto, a entrada por código de barras, o Copilot,
  o ajuste/perda, a transferência, o consumo do atendimento — cria
  `financial_transactions`; o custo informado fica no movimento
  (`unit_cost`, a base do custo de consumo, do giro e da margem). A compra
  que a rede PAGOU, se ela quiser no financeiro, é um lançamento manual
  (Financeiro → Novo lançamento, categoria "Compra de estoque": conta no caixa e
  fica FORA do lucro, que já desconta o insumo consumido — 2026-10-29,
  `indicadores.md`). **E a despesa também não dá entrada no estoque** (o
  Heitor, 18/11, sobre a pergunta da 26ª: "fica como esta pq provavelmente sao
  pessoas diferentes que vao fazer isso, normalmente quem é do financeiro nao
  controla estoque"): a "Compra de estoque" do Financeiro e a "Entrada" do
  Estoque são dois registros, cada um na tela de quem cuida dele. **A Entrada DIZ isso, e guarda o fornecedor e a nota**
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
- **Quem cadastra produto, e em qual unidade entra o estoque inicial** (E13 do
  Bloco Estoque e o EQ1d do Bloco Equipe, plano de adaptação, 2026-11-15 — o
  Heitor, 13/11: "Quem cadastra é só quem tem permissão de gerenciar. Se for
  pessoa de uma unidade especifica, unidade vem pré-preenchida e não pode ser
  mudada. Se a pessoa tiver mais de uma unidade, a lista mostra apenas as
  unidades dela."):
  - **Cria, edita e desativa produto quem tem o Estoque em Gerenciar, e só
    isso**, na rede ou numa unidade (`createProduct`, `updateProduct`,
    `toggleProductActive`). Saiu a configuração da rede "Quem cadastra e edita
    os produtos" (A unidade × Só a rede — a C63 da F66): a linha do cabeçalho
    do Estoque da rede, o aviso `[data-catalogo-da-rede]` da unidade, a action
    `salvarCatalogoDeProdutos`, `lib/estoque/catalogo.ts` e a coluna
    `tenants.catalogo_de_produtos` (migration `20261115900001`, destrutiva;
    nenhuma rede tinha "Só a rede"). Nada dela ficou: o catálogo é um só, da
    rede, e o produto aparece em todas as unidades, como antes.
  - **A unidade do estoque inicial segue as unidades da pessoa**
    (`unidadesDoCadastro`, `lib/estoque/estoque-inicial.ts`: as ATIVAS que ela
    alcança): de UMA unidade, ela vem escrita e travada
    (`[data-unidade-travada]`, sem lista); de mais de uma, a lista só com as
    dela, já com a unidade em que ela está (a do endereço); a rede inteira,
    todas — no portal da rede, nenhuma escolhida com duas ou mais (sobra da
    F33); no da unidade, a do endereço. A tela esconder não basta: a action
    confere cada unidade com `alcancaUnidade`, e a da outra rede é recusada.
- **O estoque inicial se DIVIDE entre as unidades** (E11, o Heitor, 13/11:
  "ok, mantem como está, mas com possibilidade de dividir a entrada entre as
  unidades"). Fica como estava — o lote, a validade, a nota fiscal, o custo,
  as observações, a marca e o fornecedor (E14), iguais em todas as linhas —, e
  cada linha é uma unidade com a quantidade dela ("Dividir com outra
  unidade", `[data-linha-do-estoque-inicial]`; a lista de cada linha não
  oferece a unidade já escolhida em outra). O formulário manda `_branchId` e
  `initial_qty` repetidos, na mesma ordem (`linhasDoEstoqueInicial`: a linha
  sem quantidade não conta; sem `_branchId`, vale a unidade em que a pessoa
  está; a unidade repetida é recusada). **Uma transação só**: o app calcula
  (o SKU, o uso e o preço, a comissão, as unidades ao alcance) e
  `produto_cadastrar` (migration `20261115900001`, só service_role) grava o
  produto e um `estoque_inicial` por linha — a unidade de outra rede, a
  desativada ou a repetida derruba tudo, e nada fica, nem o produto. Era o
  produto gravado pelo app, uma unidade só e o produto apagado à mão se o
  estoque falhasse (D8 da 9ª). O lote nasce em cada unidade (o lote é DA
  UNIDADE). Prova: `e2e/estoque-produto-por-unidades.spec.ts`,
  `tests/estoque-inicial-por-unidades.test.ts`.

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
    `recusaDaConfigDaRede` saiu dessas gravações (era a C71 e a D4/C76).
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
  - **E11 e E13** ficaram para depois do bloco Equipe ("a pessoa em mais de
    uma unidade") e entraram em 2026-11-15, com o EQ1d (acima, depois do
    estoque inicial do cadastro do produto).
  - Antes (F66/F74, para a história): a D4/C76 fez dos fornecedores uma lista
    da rede com o "fornecedor de costume" no produto, o "arquivar" e a
    janela só para quem é da rede (A12 da 14ª); a A14 da 14ª distinguia
    "de costume" × "desta entrada" (`CampoFornecedor`, que saiu). A linha do
    lote que mostra a nota e o fornecedor da compra (`lotesComSaldo`) fica.
- **O que a 14ª simulação corrigiu no Estoque** (F74, 2026-11-13):
  - O botão da linha diz **"Movimentar"** (A12; era uma engrenagem sem
    texto). A janela segue "Gerenciar estoque" (o `title` do botão também).
    Na 15ª (A12) o "Entrada e perda" virou "Movimentar" — escondia a
    Transferência —, e o destino da transferência diz "Pode mandar para
    qualquer unidade da rede" a quem tem a origem fixa.
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
  - **O mínimo do cadastro diz quando vale** (A27 da 25ª; princípio 3): ao
    lado do "Estoque mínimo" do produto, a dica "Vale para a unidade quando o
    produto entra nela. Depois, cada unidade tem o seu, na aba “Estoque
    mínimo” do produto." (`[data-minimo-padrao]`) — editar o do cadastro não
    muda o da unidade que já tem o seu. Prova:
    `tests/atritos-da-25-ficha-estoque-app.test.ts`.
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
  (C24) — no cadastro, na edição e no mínimo da unidade (o cadastro e a
  edição gravavam o negativo até a varredura de 18/11, ATD-E02). Prova:
  `e2e/estoque-cadastro-f66.spec.ts`, `tests/varredura-atendimento.test.ts`.
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

**Corrigidas na 31ª simulação** (2026-11-26):
- **A transferência vale o custo do lote que saiu** (D1; ES-18, ES-29): as
  duas pernas gravam o `unit_cost` dos lotes que a saída tira, pelo mesmo
  FEFO do gatilho do lote (`private.custo_da_saida_pelos_lotes`, lido antes
  do insert), e `metrics_transferencias_de_estoque` multiplica a ligação ao
  lote (em embalagens) pelo rendimento. 1 pote de 1000 g a R$ 0,11/g vale
  R$ 110,00, não R$ 119,99. As de antes ganham o custo dos lotes ligados
  quando eles cobrem a quantidade inteira e todos têm custo; a outra fica com
  o último custo (decisão do Claude, 26/11; princípio 4). Prova:
  `e2e/estoque-transferencia-no-relatorio.spec.ts` ("D1 da 31ª").
- **A embalagem é o que se compra, o conteúdo é quanto ela tem** (D2;
  decisão do Claude, 26/11, princípios 2 e 3): "1 g com 1000 g" é impossível
  e o cadastro recusa (`recusaDaEmbalagem`, `lib/estoque/medidas.ts`: a
  embalagem e o conteúdo da mesma grandeza só com o fator certo — 1 kg com
  1000 g vale). Uma medida como embalagem com o conteúdo em outra grandeza é
  improvável e só avisa (`avisoDaEmbalagem`); a medida como embalagem sem
  conteúdo continua valendo. O produto já gravado assim se lê como está, e o
  cadastro, a Entrada e o cartão do ajuste do Copilot avisam ("a quantidade
  aqui conta embalagens"); corrigir a embalagem não muda número nenhum. A
  Entrada diz a conta em consumo (`[data-entrada-equivale]`). O ajuste do
  Copilot conta em embalagem (padrão) ou na medida de uso (`contarEm`), como
  o "Contar em" da tela. Prova: `tests/estoque-embalagem-e-conteudo.test.ts`.
- **A Auditoria do movimento guarda o motivo da perda e o saldo depois**
  (D9): os valores do gatilho de `stock_movements` ganham `motivo_da_perda` e
  `balance_after`, para a frase dizer "perda de 2 frascos (Vencido)" e "o
  inventário ajustou de 970 g para 950 g". A frase é da Auditoria
  (`plataforma.md`).
- **O inventário é por unidade** (D24, NÃO ERA): o "saldo nas duas unidades"
  da ES-26 são as duas MEDIDAS (a embalagem e a de uso, "780 UI · 7,8
  frasco"), não duas unidades da rede.
- **O nome repetido de uma lista diz que já existe** (A12; princípios 3 e 7):
  "solares " com a "Solares" cadastrada é o mesmo item (sem caixa nem
  espaços); a janela da lista diz "já está na lista" (`[data-ja-existe]`) e
  nada se cria, e o campo com busca diz "já existe: escolha da lista". Prova:
  `e2e/estoque-marcas-e-fornecedores.spec.ts` ("A12 da 31ª").
- **O "Corrigir custo" fica no Histórico** (A13; princípio 3): a entrada
  guarda o custo com que foi gravada e quando foi corrigida
  (`custo_corrigido_de`, `custo_corrigido_em`), e o Histórico diz "Custo
  corrigido de R$ 520,00 para R$ 52,00/un em …" (`[data-custo-corrigido]`).
  O "de" é o custo da entrada, não o da correção do meio (decisão do Claude,
  26/11; as do meio estão na Auditoria). As corrigidas antes ganham o de
  antes da Auditoria. Prova: `e2e/estoque-custo-de-consumo.spec.ts` ("A13 da 31ª").
- **O Valor em estoque e o Giro têm dica** (A14; princípio 7): o Valor é o
  saldo ao custo do lote de onde veio (o que nenhum lote com custo cobre, ao
  último custo), não o preço de venda (`DICA_DO_VALOR`); o Giro, os insumos
  dos atendimentos do mês (`DICA_DO_GIRO`). Nos dois portais, também para
  quem só vê. Prova: `e2e/estoque-lotes-da-9.spec.ts` ("A14 da 31ª").

**Corrigidas na 33ª simulação** (2026-11-26):
- **O lote que entra cobre a falta que ficou sem lote** (D5; ES-18, ES-20,
  princípio 3; decisão do Claude, 26/11): o consumo maior que o saldo deixa a
  parte que nenhum lote cobriu em saldo negativo (o ácido em −2 ml), e a
  entrada seguinte com lote paga essa falta antes de encher o lote — o AM2 de
  10 ml com o saldo em −2 ml fica com 8 ml, e a soma dos lotes volta a ser o
  saldo. É um gatilho ADIADO (`trg_lote_cobre_a_falta`, fim da transação:
  a entrada grava o movimento antes do lote), que abate a falta de antes do
  movimento positivo, sem passar do que os lotes têm a mais que o saldo, nos
  lotes que o próprio movimento pôs; a ligação diz o que entrou no lote (o
  "Desfazer entrada" confere por ela). A entrada grava as embalagens pelo
  rendimento (a aberta inteira, a devida para longe do zero, a regra de
  `lib/estoque/baixa.ts`): era o saldo de antes + o que entrou, e o ácido
  ficava "0 frasco" com 8 ml. Os de antes: só o que o banco prova (a entrada
  com lote depois do saldo negativo), sem linha nova na Auditoria. O
  Histórico do produto e as Movimentações dos Relatórios dizem o que cada lote
  cobriu: "Lote AM1: 2 ml · 2 ml sem lote" e "Lote AM2 val. …: 8 ml · 2 ml
  cobriram a falta de antes (sem lote)"; o lote que cobre o movimento inteiro
  diz só o lote, como antes (`partesDoMovimento`/`textoDasPartes`,
  `lib/estoque/lotes-do-movimento.ts`; a ligação × o rendimento — a coluna
  Lote das Movimentações dos Relatórios lê as `partes` que o carregador manda,
  `reports-bi-view.tsx`). Migration
  `20261212200002`. Prova: `tests/estoque-saldo-e-lotes-batem.test.ts`,
  `e2e/lotes-baixa.spec.ts` ("o lote que entra cobre a falta").
- **O zerado dos Relatórios é o saldo da tela** (D6; princípio 3; decisão do
  Claude, 26/11): `metrics_relatorio` conta "Produtos zerados", na rede e por
  unidade, pelo saldo que o Estoque mostra (`saldo_de_consumo`, o rendimento
  com 4 casas, como `situacaoDoEstoque`), não por `current_stock`. Migration
  `20261212200003`. Prova: `tests/estoque-zerados-pelo-rendimento.test.ts`,
  `e2e/estoque-zerados-uma-conta.spec.ts` ("o zerado é pelo saldo que a tela mostra").
- **O custo do insumo vai no próprio insert** (D7; AD-19; decisão do Claude,
  26/11): o insumo do atendimento e o ajuste a menos nascem com o custo dos
  lotes de onde vão sair — um gatilho ANTES do insert
  (`trg_custo_da_saida_pelos_lotes`, `private.custo_da_saida_do_movimento`:
  o lote escolhido primeiro, depois o FEFO do gatilho do lote; o resto, o
  custo que o movimento trouxe). O gatilho do lote deixou de fazer o UPDATE de
  `unit_cost` depois do insert, que a Auditoria lia como "Corrigiu o custo do
  lote". A transferência usa a mesma conta (`custo_da_saida_pelos_lotes`). O
  número gravado não muda; as linhas "Corrigiu" de antes ficam na Auditoria.
  Migration `20261212200001`. Prova: `tests/estoque-saldo-e-lotes-batem.test.ts`,
  `e2e/lotes-baixa.spec.ts` ("o lote que entra cobre a falta").

---

## 10. Fluxo de conclusão de atendimento

**É UMA transação** (desde 2026-09-28). `finishSession` CALCULA — a regra de
comissão aplicada, os pontos, a baixa de cada insumo (com rendimento e o
arredondamento das embalagens) — e a função `concluir_atendimento` (migration
`20260928000003`) GRAVA tudo de uma vez. Nenhuma regra de negócio no banco: ela
recebe os números prontos. É o desenho do estorno (`estornar_transacao`).

**Quem inicia e conclui é quem tem o Atendimento em Gerenciar** (o Heitor,
2026-11-18: "Agenda é agenda e atendimento é atendimento. Só inicia e conclui atendimento quem tem gerenciar no atendimento."; UM2), em qualquer atendimento da unidade ao alcance (sem o "só os meus", SM1) — §9.1, "Quem faz o quê na
agenda e no atendimento". O clínico da transação (a linha 2 abaixo) só vai
com o Prontuário em Gerenciar; sem ele, a entrada do prontuário nasce sem a
evolução, as dores e as fichas da tela, e a obrigatória em branco continua
barrando (`obrigatoria_que_falta`) — quem a responde é quem tem o Prontuário.

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
| 2 | o prontuário do cliente (nasce se não existe) e a entrada deste atendimento — evolução, intercorrência, as DORES do cliente e a ficha de atendimento da tela (D1, 2026-10-29); e a ficha de saúde digitada na tela, fechando o pendente dela (D3, 2026-10-28) | `medical_records`, `medical_record_entries`, `pre_atendimentos` |
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
  insumo cadastrado, "Nenhum produto cadastrado como insumo nesta rede…",
  com o link do Estoque (Novo produto, uso "Insumo"); sem resultado para o
  texto, "Nenhum insumo com “x”" (`[data-busca-de-insumo-vazia]`). Prova:
  `e2e/atendimento-atritos-da-7.spec.ts` ("A38").
- **O rascunho da ficha de saúde sobrevive ao recarregar NA MESMA ABA** (A36 da 7ª,
  conferido em 2026-11-05: não reproduzido — o robô recarregou num contexto
  novo, e o rascunho morre com a aba por decisão). Prova:
  `e2e/atendimento-finalizar-grava-tudo.spec.ts` ("recarregar"),
  `e2e/atendimento-alergia-sim-nao.spec.ts`. **E a tela DIZ isso** (A26 da
  8ª simulação, 2026-11-06; a regra fica): em andamento, para quem escreve no
  prontuário, "Fica só nesta aba: fechar a aba antes do “Finalizar
  atendimento” perde o que foi digitado." (A14 da 21ª: dizer o que se perde),
  e o detalhe na dica (recarregar mantém; outro aparelho, não)
  (`[data-aviso-do-rascunho]`). Prova:
  `e2e/atendimento-atritos-da-8.spec.ts` ("A26").
- **A desistência no meio registra a intercorrência e baixa o insumo já
  aplicado** (A27 da 8ª simulação, 2026-11-06): o "Cancelar" do atendimento
  EM ANDAMENTO só pedia o motivo — a cliente passou mal depois da aplicação, e
  nem o prontuário nem o estoque ficavam sabendo. A janela tem
  "Intercorrência (opcional)", a quem escreve no prontuário, e "Baixar do
  estoque o que já foi aplicado: …" (os insumos MARCADOS na tela). Uma transação,
  `desistir_do_atendimento` (migration `20261106003701`): o agendamento
  travado e em andamento, cancelado com o motivo e o histórico, a
  intercorrência na entrada do prontuário do atendimento (a aba Prontuário a
  lista, `buildRecordForms`) e cada insumo pela MESMA conta da conclusão
  (`montarInsumosDaBaixa`, `lib/atendimento/insumos-da-baixa.ts`, com
  `estoque_conferir_lido`/PT409 e `comNovaTentativa`). Sem comissão e sem
  pontos: não houve conclusão. **Mas a sessão já paga NÃO volta** (o Heitor,
  2026-11-18: "Não existe isso de desistir no meio do atendimento. Se isso por
  ventura acontecer, problema de quem desistir."): o atendimento INICIADO e
  cancelado gasta a sessão do pacote (`package_sessions` USED, `used_sessions`
  + 1), a unidade do pré-pago (`procedure_sale_units` USADA) e a sessão do
  plano (fica ligada a ele e conta como feita em `metrics_financeiro_do_plano`;
  o app da cliente diz "Usada em … (atendimento interrompido)") —
  `pre_pago_libera`, migration `20261123900004`. Até ali devolvia, como em
  todo cancelamento; o cancelado ANTES de iniciar continua devolvendo. A
  janela diz isso (`TEXTO_DA_SESSAO_NA_DESISTENCIA`, `[data-sessao-paga-conta]`).
  A sessão do pacote gasta na desistência emite o MESMO fato da conclusão,
  "Sessão de pacote usada" (`pacote.sessao_usada`, com as restantes), pelo
  próprio gatilho, com a chave da conclusão (`pacote.sessao_usada:<agendamento>`
  — um atendimento, um consumo) e origem `banco` (migration
  `20261124250002`; decisão do Claude pelos princípios: a automação de "acabou,
  renove" não via a última sessão gasta assim). Prova:
  `e2e/atendimento-desistencia-evento-do-pacote.spec.ts`,
  `tests/desistencia-emite-sessao-usada.test.ts`. **Desistir — cancelar o Em
  atendimento, com ou sem insumo — pede o Atendimento em Gerenciar**, e só
  ele (UM2; sem o "só os meus", SM1), não a Agenda (CLAUDE.md §11, o
  Heitor, 2026-11-18: o módulo Atendimento "desiste no meio"; ATD-A01 da
  varredura de 18/11): a regra é UMA, `recusaDoCancelar`
  (`lib/appointments/quem-cancela.ts`), lida no `cancelarCore` e na
  desistência com insumo pela situação do agendamento — o agendado segue com
  a Agenda em Gerenciar —, e a gravação vale só na situação lida. A janela da
  agenda mostra o "Cancelar" do Em atendimento a quem tem o Atendimento em
  Gerenciar (`podeAtenderEste`), com o aviso da sessão paga, e sem o "Não compareceu"
  (o servidor recusa: "não é falta"); a tela do atendimento, a quem tem o
  Atendimento (`canManage`); o Copilot (`cancelar_agendamento`), pela mesma
  regra, com o aviso no cartão. A intercorrência pede o Prontuário em
  Gerenciar. Sem nada marcado, é o cancelar de sempre. **O botão do Em
  atendimento diz "Cancelar"**, como antes do início (o Heitor, 25/11, à troca
  por "Desistir do atendimento" da A9 da 28ª: "Discordo — Mantem o Cancelar"):
  na janela da agenda e na tela do atendimento, a janela "Cancelar
  atendimento", com "Motivo do cancelamento *" e "Confirmar cancelamento". Só
  o nome volta; a desistência por dentro (insumo, intercorrência, sessão paga)
  segue igual. Prova: `tests/sessao-do-atendimento-o-que-a-tela-diz.test.ts`. Prova:
  `e2e/atendimento-desistir-pelo-modulo.spec.ts`,
  `tests/varredura-atendimento.test.ts`. Prova:
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
  tinham dois estados para o mesmo campo, e depois de gerar o plano (então
  "Gerar plano e enviar à recepção") a tela trocava para o segundo — Evolução e Intercorrências vazias,
  sem o cartão "Insumos utilizados" —, e o "Finalizar" levava o vazio. Agora
  o que se escreveu continua, o cartão de insumos fica no ramo do plano gerado
  até concluir, e o rascunho guarda um campo só (o de antes, com dois, vale
  pelo que tem texto). **A conclusão nunca troca a evolução gravada por
  vazio**: `concluir_atendimento` mantém a evolução e a intercorrência que já
  estavam no prontuário quando a da conclusão vem em branco (migration
  `20261104002103`). Prova: `e2e/atendimento-plano-gerado-mantem-a-sessao.spec.ts`.
- **E leva também as dores e a ficha de saúde digitadas, na MESMA transação** (D3
  da simulação de 2026-10-28, decisão do Heitor): só o "Enviar para a
  recepção" (que exige plano) as mandava. `finishSession` recebe `queixas`
  (só quando a tela tem o campo — sem ele, a dor gravada fica) e a ficha de saúde
  que alguém MEXEU (`anamneseDaEquipeParaGravar`, `lib/pre-atendimento/ficha.ts`:
  a ficha atual, as respostas limpas; nula sem resposta ou sem mudança — a
  ficha que a cliente respondeu não vira "pela equipe"), e
  `concluir_atendimento` grava tudo e fecha a ficha de saúde pendente. As
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
  feito"). A pergunta obrigatória sem resposta — na FICHA DE SAÚDE (a da
  rede) ou na FICHA DE ATENDIMENTO — barra o "Finalizar
  atendimento", o "Aceitar plano" e o "Gerar plano · a cliente vai pensar"
  (eram o "Fechar agora" e o "Enviar para a recepção"). Era o
  contrário ("a cliente já foi atendida", D2/D3 de 28/10 e D1 de 29/10).
  - **A tela aponta TODAS de uma vez** (A30 da 6ª simulação, 2026-11-04;
    era uma por clique): cada obrigatória vazia — da ficha de saúde e da ficha —
    fica marcada com a mensagem junto dela, e a tela rola até a PRIMEIRA da
    página (a ficha de saúde antes da ficha), com o foco (`validar()` do
    `AnamnesisFormRenderer`, `obrigatoriasVazias` em `lib/anamnesis.ts`; com
    a ficha de saúde só para ler, o cartão abre para editar e marca). O "Finalizar"
    abre a janela "Faltam N respostas obrigatórias" (`[data-o-que-falta]`),
    com a lista inteira por lugar ("Na ficha de saúde", "Na ficha de
    atendimento") e "Responder agora" — SEM o "Confirmar conclusão". O
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
  - **Vale o que FICA gravado**: a ficha de saúde que a tela manda gravar
    (`anamneseDaEquipeParaGravar`), senão a gravada — a que a cliente
    respondeu pelo app ou pelo link vale, e a obrigatória só falta quando não
    tem resposta em lugar nenhum; a ficha da tela, senão a salva antes. As
    perguntas são as da ficha ATUAL (a ficha de saúde da rede; a ligada ao
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
  - **A ficha NUNCA respondida também avisa, no alto** (15ª A7, 2026-11-17;
    princípios 3 e 7): o "Finalizar" barrava pelas obrigatórias dela e a tela
    só falava da vencida. Com o atendimento aberto, a quem vê o prontuário:
    "A ficha de saúde de X ainda não foi respondida (N obrigatórias)."
    (`[data-ficha-nao-respondida]`, `avisoDaFichaNaoRespondida` em
    `lib/atendimento/obrigatorias.ts`; some com a ficha respondida ou sem
    pergunta), com "Responder aqui" (quem escreve no prontuário: rola à ficha)
    e "Enviar o link" (o envio da janela, `PreAtendimentoDoAgendamento`; só
    com a Agenda em Gerenciar — D9 da 26ª —, atenda a pessoa ou não: o
    "Atende" não esconde nem mostra botão, CLAUDE.md §11; D11 da 29ª, decisão
    do Claude, 25/11 — a tela do atendimento escondia o link, e o bloco do
    profissional com o "trocar", de quem atende; `tests/atende-nao-esconde-botao.test.ts`). A contagem é
    a da TELA (A5 da 26ª, princípio 3: seguia "4 obrigatórias" com os 4
    campos preenchidos): digitando, desce; sem obrigatória faltando, a faixa
    some (o "Finalizar" leva as respostas). Prova:
    `tests/pendencias-area-1.test.ts`, `tests/pre-atendimento-aviso.test.ts`.
  - Sem ficha ligada ao procedimento, ou ficha sem obrigatória, nada barra.
    A foto e o planejador ficam fora da ficha de saúde (a cliente responde pelo
    celular); o planejador da ficha, na rede sem o recurso de injetáveis (o
    campo é só para ver), não barra. O planejamento escolhido vale mesmo sem
    ponto, com a confirmação do atend-12 (§9.4).
  - **Quem vê e não escreve o clínico** (`canEditRecords`: o Prontuário em
    Gerenciar — cada passo um módulo, UM4 de 23/11; D8 da 26ª): a ficha de
    saúde, as queixas e as observações se LEEM na avaliação, sem campos, com
    a nota "Só para ler: escrever a ficha de saúde, as queixas e a evolução
    pede o Prontuário em Gerenciar." (`TEXTO_DO_CLINICO_SO_LEITURA`,
    `[data-clinico-so-leitura]`). Ganhava o formulário editável, e o
    digitado se perdia na conclusão (que grava sem o clínico). Prova:
    `e2e/vistas-pessoais-e-cada-passo.spec.ts`. No "Finalizar" com a ficha de
    saúde obrigatória em branco, a janela do que falta diz por que trava e
    quem responde — "Você lê a ficha de saúde, mas não a responde. Quem
    responde a ficha de saúde é quem tem o Prontuário em Gerenciar (…), ou a
    cliente, pelo app ou pelo link." (`[data-quem-responde-a-ficha]`, os nomes
    de `quemRespondeAFichaDeSaude`) —, com "Entendi" no lugar do "Responder
    agora", que levava a campos que ela não escreve (A17 da 31ª; decisão do
    Claude, 26/11, princípio 7; a trava fica). Prova:
    `tests/atendimento-ficha-de-saude-quem-responde.test.ts`. **Também na
    avaliação** (D17 da 33ª, FI-07): lá a ficha de saúde de quem só LÊ o
    prontuário é o cartão de leitura, que não estava ligado à conferência — a
    tela chegava ao "Confirmar conclusão" e só o servidor recusava; o cartão
    de leitura agora confere as obrigatórias como o editável.
  - **Quem não vê o clínico** (sem o Prontuário em Ver; o caso do prontuário
    "só os meus" num atendimento de outra saiu com o SM1): a tela não tem os
    campos e não aponta nada; o servidor recusa do mesmo jeito, com só o NOME
    da pergunta na mensagem. Quem responde é quem tem o Prontuário em
    Gerenciar, sem precisar atender (UM4) — também na ficha da cliente, aba
    Prontuário, com as perguntas atuais da rede (`podeEditarFichaDeSaude`, a
    permissão de `salvarAnamneseGeral`, que expira na hora a ficha da cliente —
    `expirarAFichaDaCliente`, tag `client:<id>`; a ficha aparecia vazia logo
    depois de salva, D6 da 29ª; o link público também expira; o app da
    cliente expira no `after()`, depois da resposta — dentro da action
    recarregaria a tela dela e tiraria o "Respostas enviadas"; prova:
    `tests/ficha-de-saude-expira-o-cache.test.ts`; no registro mais recente, um
    formulário só; D2 da 27ª: lá era sempre só leitura). Quem não o tem
    conclui com o Atendimento em Gerenciar (2026-11-18), sem o clínico — a
    obrigatória em branco a barra como a qualquer um, e quem responde é quem
    tem o Prontuário; a recusa diz isso, com os nomes: "Quem responde a ficha
    de saúde é quem tem o Prontuário em Gerenciar (…), ou a cliente, pelo app
    ou pelo link." (A8 da 25ª, princípio 7; `aQuemPedirAFichaDeSaude`, no
    "Finalizar" e no "Gerar plano") —, **e não recebe a ficha de saúde para responder** (A31 da 6ª simulação, 2026-11-04): sem o
    prontuário a ficha de saúde nem é lida, e o formulário da avaliação mostrava a
    quem não tem o Prontuário a ficha inteira em branco ("pediu de novo a anamnese da Márcia"
    enquanto a profissional via "Anamnese revisada"). A ficha de saúde, nos dois
    formulários, só aparece com `canViewRecords`.
  - Prova: `e2e/atendimento-obrigatorias-barram.spec.ts`,
    `tests/obrigatorias-do-atendimento.test.ts`; a da gravação,
    `e2e/atendimento-obrigatorias-barram.spec.ts` ("atend-04", "A30", "A31"). Spec que
    finaliza sem ser sobre isto responde a ficha de saúde antes
    (`responderAnamnese`, `e2e/apoio/anamnese.ts`) — também o que conclui
    pela FUNÇÃO (`responderAnamneseDoAgendamento`), que agora recusa.
- **O plano da avaliação é UMA gravação** (revisão do Heitor, 2026-10-29;
  migration `20261029000801`). Os botões do plano (então o "Enviar para a
  recepção" e o "Fechar agora") salvavam a ficha de atendimento numa action e depois geravam o plano em
  outra — e o plano gravava a ficha de saúde, o plano, as sessões e as dores em
  passos soltos: o plano que falhava deixava a ficha, a ficha de saúde e um plano
  PROPOSTO sem procedimento. Agora `generateEvaluationPlan` CALCULA (a
  ficha de saúde no formato da ficha atual com `anamneseDaEquipeParaGravar`, o
  retrato da ficha de atendimento com `fichaParaConcluir` e
  `retratarInjetaveis` — a ficha que a tela manda no 9º argumento —, as
  obrigatórias) e `gerar_plano_da_avaliacao` GRAVA tudo numa transação: o
  plano (PROPOSED, ligado por `evaluation_appointment_id`) e as sessões, a
  ficha em `form_data.ficha`, as dores, a evolução (quando veio), a ficha de saúde,
  o pendente dela, que fecha, e o histórico. Falhou um passo, nada
  fica. A função confere que todo procedimento do plano é da rede, recusa o
  agendamento cancelado e o plano já fechado (ACCEPTED/COMPLETED), e só o
  servidor a chama. A action confere quem monta (`montaPlano`, UM3); a
  conferência da agenda "só os meus" pelo id saiu (SM1). O "Aceitar plano" aceita DEPOIS, em outra action
  (`aceitarPlano`, no `gerarPlano` de `appointment-session.tsx`): falhou o
  aceite, o plano gerado fica proposto e a tela diz "Plano gerado, mas não
  foi aceito: …". Prova: `e2e/atendimento-ficha-e-plano-juntos.spec.ts`.
- **Os dois botões do plano na avaliação** (o PDV, fase 3 — 2026-11-13):
  "Aceitar plano" (era o "Fechar agora": gera e ACEITA o plano, sem dinheiro;
  a comanda do plano vai ao PDV, onde a cliente assina o contrato e paga) e
  "Gerar plano · a cliente vai pensar" (era o "Gerar plano e enviar à
  recepção": o plano fica proposto). O plano proposto mostra "A cliente vai
  pensar" com o "Aceitar plano"; o aceito, "Plano aceito · R$ X" e o caminho
  ao PDV. Não há mais checkout do plano dentro do atendimento. Onde o texto
  abaixo diz "Fechar agora", "enviar à recepção" ou "checkout do plano", leia
  o aceite e o receber no PDV (`vendas-financeiro.md`, "A comanda do plano").
- **O botão que só gera o plano é "Gerar plano · a cliente vai pensar"**
  (J-35, 2026-10-30, quando virou "Gerar plano e enviar à recepção"; era
  "Enviar para a recepção" e, no atendimento avulso, parecia um segundo
  "concluir"). Ele gera o plano; a tela diz que, sem plano, basta o "Finalizar
  atendimento" (`[data-dica-do-avulso]`). E a janela do "Finalizar" diz de onde vem o pagamento (J-40):
  sessão do plano, de pacote, pré-pago, sem cobrança — ou "O pagamento é
  recebido no PDV" no avulso com preço (dizia isso na sessão do plano
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
  e as dores "pedidas só para gerar um plano". **O desconto do plano se
  combina NO EDITOR** (22ª A20, 2026-11-17; princípio 3 — a regra A34 da 7ª
  punha o desconto só no checkout, e o plano de valor fechado, "as três por
  420", exigia mexer em cada sessão): "Desconto do plano (opcional)", em R$
  ou % (`CampoDoDesconto`), ao lado do total, que mostra o subtotal riscado e
  o que fica (`[data-desconto-do-plano]`, `[data-total-do-plano]`). Ele fica
  guardado no plano (`treatment_plans.desconto_combinado_tipo`/`_valor`/`_por`,
  migration `20261123100001`; a avaliação o grava junto, em
  `gerar_plano_da_avaliacao`). Enquanto o plano é rascunho ou proposto, os
  preços das sessões ficam os de tabela e as telas mostram o total com o
  combinado (o editor, o app da cliente — que aceita vendo esse total). **No
  ACEITE ele se aplica aos preços** (decisão do CLAUDE pelo princípio 3,
  2026-11-18, levada ao Heitor: vale em TODA tela a partir do aceite): o `plano_aceitar` — o aceite da
  equipe e o da cliente no app — o aplica na mesma transação, pelo
  `plano_aplicar_desconto` (rateio de `ratear`, ao centavo; o de antes fica
  em `preco_tabela` e o `desconto` do plano é o combinado em reais; migration
  `20261123100002`). Daí em diante a comanda do PDV, o em aberto, a agenda, a
  ficha, o app e o contrato leem o preço vendido, e nenhuma tela soma o
  combinado de novo. O checkout do plano parte do preço de antes e abre com o
  combinado — ainda se ajusta —, e o receber refaz o rateio a partir do
  `preco_tabela`: o mesmo desconto dá os mesmos preços, nunca dois descontos.
  A conta é uma (`lib/plano-de-tratamento/desconto-combinado.ts`, sobre
  `descontoEmReais`).
  A dica do editor diz que o desconto "vai pronto ao checkout do plano"
  (`[data-desconto-no-checkout]`). Prova:
  `e2e/atendimento-atritos-da-7.spec.ts` ("A33", "A34 e A37"),
  `e2e/plano-desconto-combinado-no-aceite.spec.ts`, `tests/pendencias-area-1.test.ts`.
- **Concluído, o formulário da avaliação fica bloqueado de verdade** (A30 da
  simulação de 2026-10-29): a evolução só se lê e a ficha de saúde aparece como
  leitura — não em branco com as obrigatórias marcadas. O campo travado tem a
  cara do só leitura (`CAMPO_SO_LEITURA`: o fundo do app, sem a alça; A7 da
  27ª, princípio 3) — o que se faz depois é "Editar registro" ou "Acrescentar
  anotação" (PR2a/PR2b). Quem desbloqueia
  ("Editar registro") tem os campos de volta. **Desbloquear pede o Atendimento
  E o Prontuário em Gerenciar** (`canEditRecords`, que soma os dois; A39 da 5ª
  simulação, 2026-11-01 — era a Agenda até 2026-11-18): o botão aparecia a quem não escreve no prontuário, e
  ao lado do texto "Apenas gerentes podem editar" — que contradizia o botão da
  profissional. O texto diz agora a regra ("use Editar registro" a quem pode;
  "pede o Atendimento e o Prontuário em Gerenciar" a quem não). **O cancelado e a
  falta dizem o que são** (D11 da 8ª simulação, 2026-11-06; princípio 3):
  "Atendimento cancelado" / "A cliente não compareceu", que não houve
  atendimento e não há registro a editar — sem o "Editar registro", que é só
  do concluído (`textoDoRegistroTravado`, `lib/atendimento/registro-travado.ts`).
  Dizia "Atendimento concluído. Para corrigir, use…". Prova:
  `tests/registro-travado.test.ts`.
- **Gerar o plano na avaliação ABERTA (o "Aceitar plano" e o "Gerar plano ·
  a cliente vai pensar") é do Atendimento em Gerenciar** (UM3;
  `generateEvaluationPlan`, `montaPlano`). Pedia o Prontuário em Gerenciar (D9 da 5ª
  simulação, 2026-11-01) — saiu na auditoria das regras, 2026-11-18; o clínico
  da avaliação só se grava com o Prontuário (ver o plano de tratamento, §9.4).
  Na avaliação CONCLUÍDA, só o plano nasce: monta quem tem o Atendimento em
  Gerenciar na unidade (UM3, "Montar um plano"; o "quem atende" da PT2 saiu).
  Com o Atendimento só em Ver, o
  cartão some inteiro, com a dica do J-35 — que mandava a um "Finalizar
  atendimento" que não existe para ela (o alto da tela já diz quem inicia e
  conclui). O editor do plano (o cartão "Tratamento") pede o Atendimento ao
  menos em Ver, como as actions dele (D10 da 26ª, `podeVerPlanos`): sem o
  Atendimento, o cartão não aparece — nem no concluído, onde só o recurso
  do plano decidia. **Com o Atendimento só em Ver, o cartão só se LÊ** (UM3;
  D3 da 27ª): sem "Nova sessão", "Adicionar procedimento" nem as lixeiras — o
  rascunho que existe aparece como está, e sem plano o cartão diz "Nenhum
  plano montado." com o `TEXTO_QUEM_MONTA` (`TreatmentPlanEditor podeEditar`
  = `montaPlano`, no atendimento e na janela Planejamento).
  Prova: `e2e/permissoes-quem-so-ve.spec.ts`, `e2e/vistas-pessoais-e-cada-passo.spec.ts`,
  `tests/ficha-e-atendimento-o-que-a-tela-oferece.test.ts`.
- **Quem recebe, na unidade** (A8 da 20ª, princípio 3): o avulso concluído a
  receber e a janela de finalizar dizem quem recebe NESTA unidade
  (`quemRecebeNaUnidade`); sem ninguém dela, "Ninguém desta unidade tem o PDV
  em Gerenciar; quem recebe, pela rede: …" (PV-04). O concluído a
  receber deixa o "Aceitar plano" como secundário (A16): o passo da vez é
  receber.
- **A avaliação concluída gera o plano** (revisão do Heitor, 2026-10-29: "é
  preciso avaliar primeiro pra depois decidir o que fazer"). O A30 tinha tirado
  o "Fechar agora" e o "Enviar para a recepção" porque gerar o plano regravava
  o registro fechado; os botões VOLTARAM (hoje "Aceitar plano" e "Gerar plano
  · a cliente vai pensar"), e gerar o plano ali grava SÓ o plano,
  ligado à avaliação (`evaluation_appointment_id`): as dores, a evolução, a
  ficha e a ficha de saúde daquele dia ficam como estão — a tela não as manda e
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
  (parte clínica). Gerar o plano na avaliação aberta (os dois botões do plano,
  `gerar_plano_da_avaliacao`) grava nelas; o envio do plano em rascunho (o
  "Enviar ao PDV" do editor e o aceite, `recusaDoEnvioDoPlano`) aceita as
  dores OU a observação, como antes.
- **A evolução escrita tem rascunho, e ele morre com a aba** (A31 da
  simulação de 2026-10-27, decisão do Heitor): a evolução e a intercorrência
  da tela do atendimento (dos dois formulários) — e, desde o D3 de 2026-10-28,
  as dores, a ficha de saúde digitada e os insumos (a dose e o marcado, depois que
  alguém mexe) e, desde a revisão do Heitor de 2026-10-29, a ficha do
  PROCEDIMENTO (as respostas da tela; o planejador de injetáveis volta com o
  planejamento escolhido aberto — os pontos, o servidor retrata ao gravar) —
  vão para o SESSIONStorage,
  por agendamento (`lib/atendimento/rascunho.ts`) — recarregar não as perde,
  e fechar a aba as apaga: texto clínico não fica no computador da unidade.
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
  10ª simulação, 2026-11-10; a rede de uma unidade só, §1, e o app Android é o portal
  web): a linha de ações do topo media 744 px numa tela de 412, o "Finalizar"
  ficava fora dela sem rolagem (a Admin da rede só concluía com um clique por
  JavaScript), o título quebrava uma palavra por linha e o selo "Atendimento em
  andamento" encostava no cronômetro. O topo quebra linha (`.sessao-topo`: o
  título com a largura da tela, as ações embaixo) e, abaixo de 768 px, a ação
  principal do estado — Marcar chegada e iniciar, Check-in, Iniciar,
  Finalizar, Receber no PDV (`[data-acao-principal]`; era o "Confirmar
  pagamento", que abria a janela do pagamento — saiu no PDV7) — é uma barra presa
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
  prova: `e2e/atendimento-uso-da-10.spec.ts`). A do pacote com parcelas em
  aberto (o crediário) não é "paga na venda" (A4 da 26ª, princípio 3, como a
  D4 da 21ª): "Sessão de pacote: incluída no pacote, que tem parcelas em
  aberto; nada a receber neste atendimento." na janela, e "Sessão de pacote —
  incluída no pacote, que tem parcelas em aberto; nada a receber nesta
  sessão." no concluído (`lib/atendimento/pagamento-ao-finalizar.ts`).
- Pontos: não são do fechamento — nascem quando o atendimento é PAGO (§9.2.2).

---

## O que nunca fazer aqui

❌ Oferecer numa lista (horário, sala, pessoa) o que o servidor recusaria no horário — o ocupado, o bloqueado, a sala ocupada — ou quem está fora do horário dela na unidade: sai da lista, e só a JÁ escolhida fica, marcada (o Heitor, 26/11, R13/R14: "Só mostra os horarios, salas e pessoas que estão livres"; R15: "Não: quem está fora do horário também some das listas (o encaixe só pelo campo de horário)") — e o fora do horário é a conta do aviso do encaixe (foraDoHorarioDeQuemAtende), não outra
❌ Pedir o catálogo do editor do plano sem a unidade do plano (procedimentosParaPlano com unidade nula) ou gravar sessões de plano sem recusaDosProcedimentosDoPlano (F73, D4 da 14ª; tests/catalogo-do-plano trava) — nem recusar o que JÁ estava no plano e a unidade não faz mais (é aviso, princípio 2: o jaGravado da recusa)

```
❌ Atualizar currentStock diretamente sem criar StockMovement
❌ Alterar price de um procedimento sem criar ProcedurePriceHistory
❌ Listar os procedimentos de uma unidade só pelo branch_id (o da rede + o local dela): falta o "Em quais unidades" (ofereceNaUnidade) e o preço dela (comPrecoDaUnidade) — Q23 de 24/11; tests/preco-na-unidade trava
❌ Ler o preço de um procedimento para uma UNIDADE direto de procedures.price — é precoNaUnidade/comPrecoDaUnidade (lib/procedimentos/preco-na-unidade.ts; no banco, private.preco_na_unidade): o preço próprio da unidade vale (D2 da 9ª)
❌ Baixar lote no TypeScript (é o gatilho trg_lote_do_movimento; senão o próximo caminho esquece) — a tela só PREVÊ o lote pela mesma ordem (lotesDaBaixa, lib/estoque/fefo.ts); mudou a ordem do gatilho, muda a dela (A11 da 9ª)
❌ Gravar parte da conclusão do atendimento fora de concluir_atendimento (é uma transação só) — inclusive as dores, a ficha de saúde e a ficha de atendimento do "Finalizar"
❌ Ramo da tela do atendimento sem a ficha própria do procedimento (o avulso da rede que monta plano ficou sem ela de 2026-09-25 a 2026-10-29)
❌ Concluir o atendimento ou gerar o plano da avaliação sem oQueFaltaParaSeguir (a obrigatória barra; a trava não é só da tela)
❌ Recriar concluir_atendimento ou gerar_plano_da_avaliacao sem a chamada a private.obrigatoria_que_falta (atend-04), ou mudar a conta das obrigatórias só no TypeScript (o SQL é o espelho)
❌ Decidir "campo vazio" por conta própria (é campoVazio/primeiraObrigatoriaVazia, lib/anamnesis.ts — a tela e o servidor dividem)
❌ Gravar o plano da avaliação (ficha, ficha de saúde, plano, sessões, dores) fora de gerar_plano_da_avaliacao — é uma transação só, como a conclusão
❌ Gravar a ficha de atendimento com o form_id que veio do navegador (é a ficha ligada ao procedimento do agendamento, da rede: fichaParaConcluir)
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
❌ Gravar o agendamento do app da cliente fora de createAppointmentCore (por-05: uma regra só, a da agenda da equipe)
❌ Prender o portal da cliente à unidade de CADASTRO (clients.branch_id) — a ficha é da rede: a unidade é a do endereço, entre as da rede
❌ Ler clients.branch_id para decidir qualquer coisa (o destino do portal, a unidade do plano novo, do mapa de injetáveis, do aviso de pontos, o fuso das automações, a LGPD, o cadastro) — é só "onde a ficha nasceu" (auditoria das regras, 18/11; tests/cliente-da-rede-sem-unidade-de-cadastro trava)
❌ Confundir a ficha de ATENDIMENTO (forms/form_data) com a ficha de SAÚDE do cliente
❌ Action ou lista de ficha de atendimento sem .eq('tipo', 'PROCEDIMENTO') (edita e apaga a ficha de saúde)
❌ Gravar a ficha de saúde fora de gravarAnamneseGeral (o pendente fica aberto e a cliente responde de novo)
❌ Ler general_anamnesis direto, sem paraAnamneseGeral (há dois formatos no banco)
❌ Dizer "respondida" (selo, "algo mudou?", janela de 30 dias) sem anamneseRespondida / respostas não vazias — a ficha gravada vazia não é respondida
❌ Aceitar a ficha da CLIENTE (app ou link) sem oQueFaltaNaFicha no servidor
❌ Gravar o token do link da ficha em texto (o que confere quem abre é o SHA-256; para mostrar de novo, só CIFRADO pelo cofre, com a chave fora do banco — A22 da 9ª), ou contar tentativas fora de pre_atendimento_link_abrir
❌ Abrir a tela do atendimento pela vista pessoal (quem atende, sem o Atendimento) no agendamento de OUTRA pessoa, ou deixar a vista pessoal fazer alguma coisa — ela só mostra o dela; cada passo pede o módulo dele (SM2, UM1)
❌ Botão que grava o prontuário (o clínico da avaliação, "Editar registro") para quem não tem o Prontuário em Gerenciar (canEditRecords)
❌ Pedir o Prontuário para gerar ou aceitar o plano na avaliação aberta, ou deixá-lo a quem não tem o Atendimento em Gerenciar (montaPlano — UM3)
❌ Decidir quem monta o plano pelo Prontuário, pelo "Atende" ou por nome de cargo — é montaPlano (o Atendimento em Gerenciar com a unidade do plano ao alcance; a Admin da rede tem tudo — UM3, UM5)
❌ Gravar ou apagar a anotação clínica do plano (professional_notes) sem anotaNoPlano — quem monta sem o Prontuário não a escreve nem a zera
❌ Cobrar a sessão do plano (comanda do atendimento, preço no caixa): o plano se paga na comanda dele, no PDV (PT1e)
❌ Listar ou conferir "quem atende nesta unidade" com branch_id = unidade, ou com "a da rede atende em todas" — é a unidade marcada no "Atende" (atende_em, filtroDeQuemAtendeNaUnidade)
❌ Gravar users.atende_em ou provides_services sem passar pelo gatilho que os mantém juntos (atende_em_sincronizar), ou deixar a unidade nova (ou reativada) fora do "Atende" de quem tem "A rede inteira" e atende em todas (EQ1; trg_atende_na_unidade_nova)
❌ Marcar o "Atende" numa unidade fora da abrangência da pessoa, ou dar a alguém o agendamento de uma unidade que não é dela por ser DELE (o AG-30 saiu em 23/11 — o Heitor: "uma pessoa só pode atender nas unidades que faz parte"): o "Atende" cabe nas unidades dela (atendeForaDasUnidades), e alcancaOAgendamento é a abrangência, e só
❌ Ler o nome da cliente ou do profissional de um registro da unidade por join da sessão (clients(name), users!professional_id(name)) — a cliente de outra unidade e o profissional da rede viram "—"; é nomesDosRegistros
❌ Conferir conflito de horário fora de horarioOcupado (lib/appointments/core.ts): a duração de CADA agendamento, e o profissional em qualquer unidade da rede
❌ Ler os agendamentos que ocupam um horário com uma janela fixa para trás (as 12 h de antes): é podemOcuparDesde (qualquer duração), e o "próximo livre" com a duração inteira, sem teto (25/11)
❌ Pôr um agendamento numa grade só pelo dia em que COMEÇA (isSameDay do início, a chave do dia): é agendamentosNoDia (lib/agenda/trecho-do-agendamento), que traz o que continua de antes — e a leitura da agenda pega quem se sobrepõe ao período (podemOcuparDesde), não .gte no início (25/11)
❌ Medir até quando um agendamento ocupa o horário fora de fimDaOcupacao (o concluído adiantado libera o resto — A31)
❌ Conferir se um agendamento bate num horário fora de bateNaOcupacao (o concluído antes de começar não ocupa nada — D3 da 11ª)
❌ Oferecer como livre (app da cliente, Copilot, CRM) um horário bloqueado — é computeAvailableSlots, que já tira o bloqueio
❌ Caminho que cria ou move agendamento sem recusaDoBloqueioNoHorario (lib/appointments/core.ts): o horário bloqueado não se marca, nem pela equipe nem pelo Copilot (o Heitor, 26/11 (R07): "r07 se ta bloqueado não dá pra marcar") — e o fora do horário, que não é bloqueio, segue encaixe com aviso
❌ Decidir na tela se um horário está livre pelo INÍCIO, ou sem os bloqueios — é ocupanteDoHorario / livresEntre (lib/agenda/horario-livre.ts), o intervalo inteiro (D5/D15 da 8ª)
❌ Deixar o Confirmar do agendar (ou do remarcar) gravar antes de chegar a conferência do horário escolhido (o aviso vinha depois — D9 da 8ª)
❌ Trocar a hora que o modal mostra sem dizer (o próximo livre que pula de dia calado — D7 da 12ª): só troca a que não cabe, e com textoDoProximoLivre
❌ Filtrar a agenda (profissional, sala, tag) no navegador, sobre o que já veio, ou aceitar da URL o que não está nas opções da tela — é filtrosDaAgenda + aplicarFiltrosDaAgenda, na consulta (lib/agenda/filtros.ts)
❌ Agrupar agendamento por dia com scheduled_at.slice(0, 10) ou toISOString da meia-noite local (é o dia em UTC) — é dayKeyTZ (D4 da 8ª)
❌ Trocar a profissional de um agendamento (janela, arraste, remarcação) para quem não atende na unidade dele, ou sem "de quem para quem" no histórico — é recusaDeQuemNaoAtende + textoDaTroca (A22 da 8ª)
❌ Somar o scrollTop da grade à posição do arraste (o retângulo da coluna já anda com a rolagem — A22 da 8ª)
❌ Gravar a desistência no meio (intercorrência, insumo) fora de desistir_do_atendimento, ou calcular a baixa fora de montarInsumosDaBaixa (A27 da 8ª)
❌ Deixar o "Incluído" (era "Já pago") em "Não usar" quando a cliente tem crédito do MESMO procedimento (vem escolhido, com aviso — A20 da 8ª), ou ligar crédito a agendamento já marcado fora de agendamento_usar_credito
❌ Ler as anotações da ficha (clients.notes) para decidir alergia: elas aparecem como estão escritas (A28 da 8ª; atend-15)
❌ Ler ou gravar agenda_bloqueios pela sessão (só o servidor: actions/agenda-bloqueios.ts e lib/agenda/bloqueios.ts), ou deixar bloquear quem não tem a Agenda em Gerenciar (a Minha agenda só mostra — SM2)
❌ Decidir qual sala serve a um procedimento fora de salasParaOProcedimento (lib/agenda/salas.ts), ou gravar sala pela sessão (só o servidor, actions/salas.ts)
❌ Remarcar, cancelar ou confirmar fora de remarcarCore/cancelarCore/confirmarCore (lib/appointments/alteracoes.ts) — a tela e o Copilot dividem. A exceção é pacote_cancelar (F2b): cancela as sessões agendadas na MESMA transação do dinheiro, com o status, o motivo e o histórico do cancelarCore, e a action emite o evento e o aviso depois
❌ Caminho que cria ou move agendamento (troca de profissional, sessão de plano, checkout do plano…) sem horarioOcupado — no checkout, ANTES do dinheiro
❌ Gravar o preço ou a duração da sessão do plano que o navegador mandou: é a sessão como crédito do núcleo (valoresDaSessaoDoPlano — D5 da 9ª)
❌ Gravar entrada ou ajuste de estoque fora de estoque_entrada/estoque_inicial/estoque_ajuste_em (trava: tests/estoque-so-pelas-funcoes.test.ts) (a linha do saldo travada; duas entradas juntas perdiam uma)
❌ Lançar despesa (ou qualquer financial_transactions) a partir de uma movimentação de estoque — entrada, cadastro, ajuste, perda, transferência ou consumo (D13 revisto, 2026-10-28)
❌ Transferir estoque fora de estoque_transferir (as duas linhas travadas na mesma ordem)
❌ Gravar movimento de estoque em embalagens de produto com unidade de consumo, ou com o custo da embalagem (é custo_de_consumo)
❌ Ler o custo de um movimento com coalesce(m.unit_cost, p.cost_price) (é custo_do_movimento) ou mandar o custo do insumo do app para a conclusão
❌ Avaliar o estoque ou o consumo pelo último custo (products.cost_price) quando há lote: é custo_do_lote (o gatilho ANTES do insert grava o do consumo — D7 da 33ª; valor_do_saldo soma os lotes — D2 da 10ª)
❌ Ajuste positivo de estoque fora de um lote, ou o negativo fora de "Perdas no período" (estoque_ajuste_com_lote, motivo INVENTARIO — D5 da 10ª)
❌ Corrigir uma entrada lançada errada com um ajuste a menos (vira perda e sai do lote errado pelo FEFO): é "Desfazer entrada" (estoque_desfazer_entrada — A38 da 10ª), ou o ajuste com o lote escolhido
❌ Corrigir um ajuste errado com outro ajuste (a perda do primeiro fica em Perdas): é "Desfazer ajuste" (estoque_desfazer_ajuste — D5 da 11ª)
❌ Corrigir o custo de um lote de onde já saiu algo, ou mexer no unit_cost fora de estoque_corrigir_custo_do_lote: depois da saída é o Ajuste "Correção de cadastro" (estoque_ajuste_de_correcao — A10 da 24ª), que não é perda
❌ Corrigir uma perda lançada errada com um ajuste a mais (a perda fica em Perdas e o lote certo não volta): é "Desfazer perda" (estoque_desfazer_perda — C69)
❌ Lista fixa de motivos de perda na tela ou no banco: os motivos são da REDE (estoque_motivos_de_perda), e a perda grava o nome e o id pelo private.motivo_da_perda_de (item 7 do escopo de 18/11)
❌ Conferir o disponível de uma transferência (ou de qualquer saída) pelo current_stock de produto com unidade de consumo — o frasco aberto conta inteiro; é o rendimento (C18)
❌ Gravar o custo do produto ao editar o cadastro (o custo vem das entradas — C17)
❌ Campo de categoria, marca ou fornecedor em texto livre (ou num select sem busca) numa porta de entrada nova — é CampoDaLista (a lista da rede, com busca e "+ Nova …" — E6)
❌ Pôr marca ou fornecedor no PRODUTO — são da entrada (E10)
❌ Recusar quem não tem “A rede inteira” nas categorias, marcas e fornecedores por ser de unidade — a regra é o Estoque em Gerenciar, e só isso (E4)
❌ Decidir quem cadastra produto por ser da rede ou de unidade (era a C63) — é o Estoque em Gerenciar, e só isso; a unidade do estoque inicial é das que a pessoa alcança, conferida na action (E13)
❌ Gravar o produto e o estoque inicial em passos soltos (o produto ficava se o estoque falhasse) — é produto_cadastrar, uma transação com todas as linhas (E11)
❌ Avisar um lote sem reivindicá-lo antes (vencimento_avisado_em — C25)
❌ Criar a linha da unidade (branch_product_stock) desligando o gatilho do mínimo, ou mostrar o custo de um lote por outra conta que não custo_do_lote (custos_dos_lotes — D2 e D4 da 11ª)
❌ Mostrar ou guardar o custo por unidade de consumo com 2 casas (R$ 0,038/g vira R$ 0,04 — D6 da 11ª)
❌ Escrever a quantidade com a embalagem no singular fixo ("3 frasco") — é medidaNoPlural/quantidadeComMedida (A49 da 12ª)
❌ Contar a entrega do voucher de produto (reference voucher:) como "Inventário" em metrics_perdas — é BRINDE, pelo custo do lote (A40 da 12ª)
❌ Gravar o custo de um movimento por UPDATE depois do insert (a Auditoria lê como "Corrigiu o custo do lote"): o custo vai no insert, pelo gatilho ANTES (D7 da 33ª)
❌ Entrada com lote que enche o lote sem pagar a falta que ficou sem lote (a soma dos lotes passa do saldo), ou gravar as embalagens da entrada somando ao saldo de antes em vez de arredondar o rendimento (D5 da 33ª)
❌ Contar "zerado" por current_stock num produto com unidade de consumo — é o saldo da tela (saldo_de_consumo, D6 da 33ª)
❌ Dizer no Histórico ou nas Movimentações o lote ligado como se cobrisse o movimento inteiro — é o que cada lote cobriu (textoDasPartes, D5 da 33ª)
❌ Saída calculada no app (conclusão, voucher) sem mandar o saldo LIDO (antes_embalagens/antes_rendimento) e sem comNovaTentativa — o banco confere e recusa com PT409
❌ Mostrar no ajuste o saldo em embalagens arredondadas, ou ler a contagem do inventário tirando dela o "já consumido do frasco aberto" (estoque_ajuste, o de antes): a contagem vale EXATA na unidade digitada — estoque_ajuste_em (D3 da 7ª)
❌ Dizer no "Aplicado em" do lote a baixa INTEIRA do atendimento (é stock_movement_batches.quantity × o rendimento) ou a hora marcada (é a conclusão) — D6/A12 da 9ª; ou listar só os lotes com saldo onde o recall pede o esgotado (D15)
❌ Ler a validade do lote (product_batches.expires_at) com new Date(...)/toLocaleDateString — é um DIA gravado à meia-noite UTC e vira a véspera: é lib/estoque/validade.ts (D1 da 7ª)
❌ Deletar anexo clínico de client_documents pela tela (é apagado_em), ou ler client_documents numa tela sem .is('apagado_em', null)
❌ Pôr anexo clínico (exame, laudo, receita, foto, termo) na aba Documentos da ficha — ele mora no Prontuário (PR1b)
❌ Trocar a evolução, a intercorrência ou a ficha do atendimento CONCLUÍDO fora de prontuario_corrigir_registro (a versão de antes se perderia — PR2b)
❌ Abrir prontuario_anotacoes ou prontuario_versoes à sessão, ou dar UPDATE/DELETE nelas (o gatilho recusa; só o servidor lê e grava)
❌ Política para a sessão (leitura ou escrita) em medical_records, medical_record_entries, injectable_maps ou injectable_applications — a RLS não aplica o módulo: lê e grava só o servidor —, ou assinar medical_record_entries no Realtime (é prontuario_sinais); e escrita pela sessão em procedures, procedure_products e products (ATD-P01/P02/E01, 18/11; e2e/rls-sessao-so-le-prontuario-e-automacoes.spec.ts)
❌ Escrever "pré-atendimento" ou "anamnese" em texto que se lê — é "ficha de saúde" (tests/ficha-de-saude-no-texto trava)
❌ Mostrar no portal da cliente um client_documents sem enviado_em (a rede decide o que vai ao app)
❌ Recriar um "Retorno em N dias" (regra, lista ou cron) — é um agendamento novo (aut-04)
❌ Usar 40001 para "tente de novo" numa função chamada pelo PostgREST (ele repete sozinho, sem reler) — é PT409
❌ Gravar a avaliação da cliente fora de avaliar_atendimento, ou ler a nota de um procedimento fora de metrics_notas_dos_procedimentos (a configuração e a avaliação de antes moram ali)
❌ Dar ao procedimento sem nota própria a nota do atendimento no ranking (princípio 4: fica fora da média — migration 20261123900003)
❌ Iniciar, concluir ou desistir no meio (startAppointment, o "Em atendimento", finishSession, o cancelar do Em atendimento, generateEvaluationPlan na avaliação aberta) sem o Atendimento em Gerenciar, ou decidir isso pela Agenda, pelo Prontuário ou pelo "Atende" (o Heitor, 2026-11-18; UM2, UM5)
❌ Cancelar o plano proposto ou o rascunho mexendo em dinheiro, comanda ou oportunidade, ou fora de plano_cancelar_proposto (nada foi vendido: "Uma coisa só foi vendida se foi paga." — o Heitor, 18/11; A1a da 25ª)
❌ Devolver à cliente a sessão paga (pacote, pré-pago, plano) do atendimento INICIADO e cancelado — a desistência no meio gasta a sessão (o Heitor, 2026-11-18; pre_pago_libera)
❌ Ação do topo da tela do atendimento numa linha que não quebra, ou a ação principal fora de .sessao-acao-principal (no celular o "Finalizar" saía da tela — D1 da 10ª)
❌ Tabela nova com chave estrangeira para appointments E para procedures na chave primária: o PostgREST a lê como junção e TODO embed appointments → procedures(name) quebra com PGRST201 (foi a avaliacoes_dos_procedimentos por ~15 min, 2026-11-04 — migration 20261104001804)
```
