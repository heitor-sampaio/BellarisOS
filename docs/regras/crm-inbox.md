# Clientes, contatos, conversas e oportunidades

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.2 Clientes / CRM
- CPF (`document`) único por `tenantId` — constraint `@@unique([tenantId, document])`
- **O "Documento" tem tipo: CPF, Passaporte ou RNE** (D-11, decisão do
  Heitor, frente de cadastro de 2026-10-29; migration `20261029001001`). O
  CPF continua SÓ em `document` (máscara, `cpfValido`, unicidade, a senha
  inicial do app e `login_de_cliente_para_ligar` não mudaram); passaporte e
  RNE moram em `documento_tipo` + `documento_numero` (texto livre razoável,
  `documentoEstrangeiro`: 5 a 20 letras e números, maiúsculas, um por rede).
  A ficha tem um OU outro (`documentoDaFicha`, `lib/clients/documento.ts`, no
  cadastro e na aba Dados). Prova: `e2e/ficha-cadastro-documento.spec.ts`.
- **Sem CPF, a senha inicial do app é o número do documento da ficha**
  (decisão 1 do Heitor, 7ª simulação, 2026-11-05: "concordo" — a Sophie,
  passaporte 19FR54321, fechou um plano de R$ 7.200 e não via sessões,
  parcelas nem agenda). Até ali a regra de 29/10 era "sem CPF, sem acesso ao
  app por enquanto". Agora o passaporte ou o RNE, como está na ficha (em
  maiúsculas), é a senha inicial, PROVISÓRIA como a do CPF
  (`senha_provisoria`), e o aviso diz qual é ("a senha inicial é o número do
  passaporte, 19FR54321 (em maiúsculas)…" — `avisoDoAcessoCriado` com o
  `documento`). O documento do acesso é UM, `documentoDoAcesso`
  (`lib/clients/documento-do-acesso.ts`): o CPF de 11 dígitos, senão o
  passaporte/RNE — no cadastro, na aba Dados ("Dar acesso ao app") e no
  Copilot (`criar_acesso_ao_app`). **Sem documento nenhum, segue sem acesso**,
  e a tela diz por quê ("precisa do e-mail e de um documento (CPF, passaporte
  ou RNE)"). **A mesma pessoa em outra clínica, sem CPF, só se liga com o MESMO
  documento** (tipo e número; decidido pelo §5 do CLAUDE.md — "a mesma pessoa"
  é provada pelo documento): `login_de_cliente_para_ligar_doc` (migration
  `20261105002901`; a de antes, só CPF, ficou sem chamador); outro documento
  com o mesmo e-mail é recusado ("Este e-mail já tem uma conta no BellarisOS
  com outro documento."). A tela de login diz "a senha é o seu CPF (só os
  números) ou, sem CPF, o número do seu passaporte ou RNE". Prova:
  `e2e/ficha-acesso-sem-cpf.spec.ts`, `tests/textos-do-cadastro.test.ts`.
- **A menor de idade e o responsável legal** (decisão 2 do Heitor, 7ª
  simulação, 2026-11-05: "concordo" — a Beatriz tinha 16 anos, e a Lia
  escreveu o nome da mãe nas Anotações). Com `idadeEm` < 18
  (`ehMenorDeIdade`, `lib/clients/menor.ts`, o dia de Brasília), o cadastro e
  a aba Dados abrem "Responsável legal" (`ResponsavelLegal`,
  `components/shared/responsavel-legal.tsx`): nome, CPF (pelos verificadores),
  parentesco e telefone, em `clients.responsavel_*` (migration
  `20261105002901`; `colunasDoResponsavel` confere e só grava na menor).
  **Avisar, não barrar** (princípio 2): nada é obrigatório; sem o nome, a
  ficha (Visão geral, `[data-aviso-do-menor]`) e o atendimento avisam "Menor
  de idade (16 anos), sem responsável legal no cadastro…". A ficha leva "Menor
  de idade" (`[data-menor]`) e a linha "Responsável: Marta Lima (Mãe) · …"; a
  agenda (o bloco da grade, a janela, nos dois portais — `menoresDaAgenda` — e
  o bloco da "Minha agenda" da profissional, com o responsável na dica e, no
  bloco alto, a linha dele — sobra da F29 feita na F30) e
  a tela do atendimento mostram "Menor" e o responsável, ou a falta dele. O
  termo cita o responsável e é assinado por ele (`documentos.md`). O que a
  recepção escreveu nas Anotações antes disso não foi migrado. Prova:
  `e2e/ficha-menor-de-idade.spec.ts`, `tests/menor-de-idade.test.ts`.
- `authId` em `Client` é opcional — preenchido quando a CLÍNICA dá o acesso ao
  app. **O mesmo login pode estar em várias fichas, uma por rede** (a mesma
  pessoa cliente de várias clínicas, 2026-10-19 — regras no §5 do
  `CLAUDE.md`). Cada ficha continua da sua clínica: a LGPD (pedido, exportação)
  é por ficha, e cada clínica responde pelos dados dela.
- **A cliente de balcão** (2026-10-21, decisão do Heitor): "Novo cliente"
  pede só nome e telefone; e-mail e CPF são opcionais (preenchidos, válidos).
  O acesso ao app é a caixa "Criar o acesso ao app", que só se marca com os
  dois — sem ela, nenhum login nasce. Criado o acesso, a tela
  CONFIRMA (toast: login = e-mail, senha inicial = CPF, trocada no primeiro acesso — em texto
  NEUTRO, sem "ela" nem "a cliente": A20 da 6ª simulação, dizia "Ela" ao Bruno;
  `avisoDoAcessoCriado`, `tests/textos-do-cadastro.test.ts`) e a ficha
  ganha o selo "Tem acesso ao app" ao lado do nome (A13, 2026-10-27). Depois, a aba Dados da ficha dá o acesso
  (`darAcessoAoApp`, com o e-mail e o CPF SALVOS; o núcleo é
  `darAcessoAoCliente`). Prova: `e2e/ficha-cadastro-de-balcao.spec.ts`. O CPF
  digitado que é o da própria ficha diz "É o CPF já salvo nesta ficha." em texto
  neutro (`[data-cpf-da-ficha]`; A34 da 10ª, 2026-11-10: era "CPF já vinculado a
  este cliente." em verde, e parecia erro). Prova: `e2e/ficha-uso-da-10.spec.ts` ("A34").
- **O cadastro confere o que se digita** (D12 e D13 da simulação de
  2026-10-29; cadastro, aba Dados e "Dar acesso ao app"):
  - o CPF pelos dígitos verificadores, recusando a sequência repetida —
    `cpfValido` (`@estetica-os/utils`), a MESMA conta do Copilot e da
    importação. O 11111111111 passava e virava a senha inicial do login;
  - o telefone com 10 ou 11 dígitos nacionais (`telefoneNacional`: o 55 do
    WhatsApp é tirado); "(41) 9920" passava. **O de outro país começa com
    "+"** e o código (8 a 15 dígitos, não o +55) e passa como foi escrito
    ("+351 912 345 678"; decisão do Heitor, frente de cadastro de
    2026-10-29) — a conta é `telefoneDoCadastro` (`@estetica-os/utils`), no
    cadastro e na aba Dados; o campo do cadastro não o mascara
    (`maskTelefoneDigitando`). Sem o "+" não se adivinha o país. **Vale em
    TODO caminho** (cli-06, revisão do Heitor de 2026-11-02: "a estrangeira
    também chega pelo agendar rápido e pelo Copilot"): o "+ Agendar" com nome e
    telefone (o campo e `garantirClienteRapido`, que grava como o cadastro e
    lê o número só-dígitos do WhatsApp com 12 a 15 dígitos sem o 55 como de
    fora), o Copilot (`telefoneDoCopilot`) e a importação (`normalizarTelefone`
    com 8 a 15 dígitos; a ficha importada guarda o de fora com o "+",
    `telefoneDaFichaImportada`). Prova: `e2e/clientes-telefone-de-outro-pais.spec.ts`,
    `tests/telefone-de-outro-pais.test.ts`;
  - **a ficha que JÁ EXISTE pergunta, antes de gravar** (r2-cli-01, o Heitor
    em 2026-11-03: "antes de gravar no banco, confere se já existe; se já
    existir, retorna avisando que já existe, perguntando se deseja cadastrar
    mesmo assim ou atualizar a ficha existente"). A ficha ATIVA da rede com o
    mesmo CPF, o mesmo telefone, ou o mesmo nome (sem caixa) com a mesma data
    de nascimento (`fichasQueJaExistem`, `lib/clients/ja-existe.ts`; o texto
    e a leitura da resposta em `ja-existe-texto.ts`): nada se grava, e aparece
    "Já existe a ficha de Valdir com este telefone." com "Cadastrar mesmo
    assim" (`_jaExiste=cadastrar:<id>`, vale para AQUELA ficha e se acumula —
    mãe e filha dividem número) e **"Unificar com a ficha de Valdir"**
    (`atualizar:<id>`; era "Atualizar a ficha", e o Heitor, em 2026-11-03:
    "Vamos nomear esse procedimento de 'mesclar' ou 'unificar', assim fica
    mais claro o que vai acontecer" — r3-f14-02): grava na ficha existente SÓ
    o que foi preenchido agora, sem apagar o que está lá
    (`atualizarFichaComOPreenchido`: o campo vazio não mexe no dela, o
    preenchido toma o lugar, as observações se SOMAM, as tags se juntam, o CPF
    diferente do que ela tem é recusado), liga o card ou a conversa e abre a
    ficha. **O NOME da ficha nunca muda por aqui** (r3-f14-01, escolha do
    Heitor: o nome digitado às pressas costuma ser o pior; renomear é editando
    a ficha) — `PreenchidoAgora` nem tem o campo. **A pergunta mostra antes
    como a ficha fica** (A17 da 6ª simulação, 2026-11-04: a Daniela ficou com
    o e-mail da Renata sem a tela ter dito): "Se unificar, a ficha fica
    assim: Nome: Daniela (o da ficha) · Telefone … · E-mail:
    renata@… (o digitado agora, no lugar de daniela@…)", acompanhando o que
    se digita (`ComoFicaAoUnificar`, `[data-unificar-fica]`; o e-mail e o
    telefone dela vêm em `FichaQueJaExiste.naFicha`). Pelo CPF, só
    "Unificar" (o CPF é único; o de uma ficha ARQUIVADA é recusado com o
    caminho da busca). Substituiu a pergunta da ficha rápida ("É a mesma
    pessoa?", de 2026-10-29) e o aviso da outra cliente do telefone (D13).
    Vale em TODO caminho de cadastro: o formulário (e o do inbox), o "+
    Agendar" com nome e telefone e o agendar pelo CRM (`garantirClienteRapido`
    com `jaExiste`, `PerguntaJaExiste` na janela; ali a arquivada do telefone
    entra na mesma pergunta, com "Reativar a ficha de X") e o Copilot
    (`cadastrar_cliente` e `agendar` com cliente novo: o cartão troca o
    "Confirmar" pelas duas escolhas — `ResumoDaAcao.escolhas`, `copilot.md`).
    Na importação, a prévia mostra "Completar a ficha de X" marcada e deixa
    desmarcar (cli-07, abaixo). **O "Unificar" fica no Histórico da ficha**
    (A23 da 7ª simulação, 2026-11-05): "Ficha unificada pelo cadastro ·
    Alterou: e-mail · por Lia" (`CLIENT_UNIFIED`, `unificacoesDaFicha`,
    `lib/clients/unificacoes.ts`). O fato mora na corrente de eventos — o
    `cliente.dados_alterados` do núcleo, com a marca `unificado`; sem mudança
    nenhuma, gravado SEM despachar (nenhuma automação de "dados alterados"
    dispara à toa). Vale em todo caminho do "Unificar" (o formulário, o
    agendar rápido, o Copilot — `atualizarFichaComOPreenchido`). Prova: `e2e/ficha-cadastro-ja-existe.spec.ts`,
    `tests/ja-existe.test.ts`, o caso r2-cli-01 de `e2e/copilot-gravacoes.spec.ts`;
  - o telefone de uma PESSOA do CRM (`contacts`, pelas formas do WhatsApp,
    `variantesDoTelefone`) que ainda não é cliente — o lead, até o PERDIDO
    que voltou, ou só a conversa — faz a tela perguntar "É a mesma pessoa do
    lead X?" (D-9, frente de cadastro de 2026-10-29; `pessoaDoCrmDoTelefone`,
    `lib/clients/pessoa-do-crm.ts`). "Sim" liga à ficha nova as oportunidades
    e as conversas da pessoa que quem cadastra ALCANÇA (`leadAoAlcance`,
    `conversaAoAlcance`; sem o CRM não pergunta): a mais recente segue a
    conversão de sempre (CONVERTED, o clique do anúncio, a API de
    Conversões), as outras ganham `client_id` e CONVERTED. "Não" cadastra sem
    ligar. Resposta em `_pessoaDoCrm` (`mesma:`/`outra:<contato>`). Quem
    cadastra pelo card ou pela conversa não é perguntado (já disse quem é).
    **A pessoa do lead criado à mão também é achada** (A16 da 6ª simulação,
    2026-11-04: a Alice, criada no quadro com "(81) 99600-0070", virou uma
    ficha solta na recepção, e a Pri não soube que ela agendou): o gatilho do
    lead gravava o identificador "81996000070", sem o 55. Agora a pessoa nasce
    no formato do WhatsApp (abaixo), e a busca do cadastro olha também a forma
    antiga, sem o 55 (`formasParaAcharAPessoa`, `lib/importacao/normalizar.ts`).
    Prova: `e2e/ficha-cadastro-mesma-pessoa-do-lead.spec.ts`;
  - **e o inverso: o lead NOVO com o telefone de uma cliente** (D11 da 9ª
    simulação, 2026-11-07: a "Camila D. (repetida)" nascia em Novo, sem "✓
    Cliente", com o telefone da Camila Duarte). O "Novo lead" pergunta, junto
    ao telefone e antes do clique, "Este telefone é da ficha de Camila Duarte.
    É a mesma pessoa?" (`fichaDoTelefoneDoLead`, as fichas ATIVAS por
    `fichas_do_telefone`; `[data-ficha-do-telefone]`): "Sim, é ela" → a
    oportunidade nasce ligada à ficha (`leads.client_id`); "Não, é outra
    pessoa" → sem ficha. Sem resposta, "Criar lead" não envia e diz o que falta
    (`[data-falta-responder]`), e o `createLead` confere de novo e recusa. Quem
    não vê Clientes lê "de uma cliente da clínica", sem o nome. A pessoa que
    veio da busca (`_contatoId`) já disse quem é. Prova:
    `e2e/crm-atritos-da-9.spec.ts` ("D11");
  - o telefone de uma ficha ARQUIVADA (A20 da 5ª simulação — virou o "Valdir
    Duplicado" do D10) pergunta primeiro: "Reativar a ficha de X" (a ficha
    volta como estava, com o histórico, ligada ao card ou à conversa de onde
    veio o cadastro; o que se digitou não é gravado — `_arquivada=reativar:<id>`)
    ou "É outra pessoa" (`nova:<dígitos>`, vale para o número). As fichas do
    número vêm de `fichas_do_telefone` (ativas e arquivadas, da mais antiga);
  - **as perguntas aparecem JUNTO ao telefone, antes do clique** (A18): a
    tela confere assim que o número está completo, e a cada resposta
    (`conferirTelefoneDoCadastro`, só lê, com o CPF já digitado), na ordem
    arquivada → a ficha que já existe → pessoa do CRM (`perguntaDoTelefone`, a
    MESMA conta do `addClient`, que confere de novo — e também o nome com o
    nascimento, que só o envio tem). Respondida antes do clique, a resposta
    só fica guardada; a que veio do clique reenvia. Antes aparecia no pé da
    página só depois do primeiro "Cadastrar", e o clique parecia não fazer
    nada. Prova: `e2e/ficha-cadastro-telefone-ja-cadastrado.spec.ts`.
    **"Cadastrar" com a pergunta sem resposta diz o que falta** (A22 da 7ª
    simulação, 2026-11-05: o clique não fazia nada nem dizia por quê): o
    formulário não envia, rola até a pergunta e diz junto do botão
    "Responda antes de cadastrar: é a mesma pessoa do lead X? (Sim ou Não,
    logo abaixo do telefone)" (`oQueFaltaResponder`, `[data-falta-responder]`);
    a resposta dada depois disso envia, como a que veio do clique. Prova:
    `e2e/ficha-cadastro-atritos-da-7.spec.ts` ("A22");
  - **o cadastro grava uma vez** (D10): o mesmo envio (a chave da tela) é um
    cadastro só — o mecanismo de `convencoes.md` ("O envio que chega duas
    vezes"). Sem a chave, a trava calada dos 60 s SAIU (r2-cli-01): as
    chegadas do mesmo nome e telefone se enfileiram (`umaVez` com
    `soEnfileirar`), a primeira grava e as outras caem na pergunta "Já existe a
    ficha de X". Prova: `e2e/ficha-cadastro-uma-vez.spec.ts`;
  - o erro do Auth vai à tela em português (`erroDoAuth`,
    `lib/erro-do-auth.ts`; também na Equipe e na troca de senha). A senha
    fraca, na cliente, é o CPF: a tela diz isso. Nunca a mensagem crua do
    Supabase.
  - O formulário não se apaga com o erro nem com o aviso (`onSubmit` em vez
    do reset automático da action).
  Prova: `e2e/ficha-cadastro-validacao.spec.ts`,
  `packages/utils/tests/validacao.test.ts`, `tests/erro-do-auth.test.ts`.
- **O portal fala com a pessoa pelo sexo da ficha** (`clients.gender`: F, M,
  O ou vazio; D17 da simulação de 2026-10-29): "Bem-vinda"/"Bem-vindo" e, sem
  sexo ou "Outro", "Boas-vindas" (`boasVindas`, `lib/saudacao.ts`). O que a
  CLÍNICA diz (o fim da ficha, a assinatura recebida) é neutro ("Tudo certo!",
  não "Obrigada!"). Texto novo do portal no feminino fixo é o defeito de
  volta. Prova: `e2e/portal-cliente-tratamento.spec.ts`.
- **O cartão "A clínica" do app** (J-66, 2026-10-30): o fim da home do
  portal mostra a unidade do ENDEREÇO (o slug) — nome, endereço, telefone,
  horário (`resumoDoHorario` da unidade) e os botões WhatsApp e Ligar. A
  leitura é UMA, `aClinicaDoEndereco` (`lib/clientes/a-clinica.ts`), a mesma
  do "Falar com a clínica" do plano proposto. **O WhatsApp é o número
  CONECTADO** (por-03, revisão do Heitor de 2026-11-02: a conversa cai no
  inbox e fica registrada): o ativo rotulado com a unidade do endereço, senão
  o padrão da rede; sem nenhum, o telefone da unidade (ou o da rede). Só o
  número sai de `whatsapp_numbers`, pelo servidor — nunca a credencial. O
  "Ligar" é sempre o telefone. **"Falar com a clínica" abre com a mensagem
  pronta** (A66, `comMensagem`): o plano proposto ("Vi no app o plano de
  tratamento proposto (N sessões, R$ X)…") e o agendamento ("Quero falar
  sobre o meu agendamento de X em DD/MM HH:MM"). Sem nenhum dado cadastrado,
  o cartão não aparece. **E o cadastro da unidade diz isso** (A3 da 9ª
  simulação, 2026-11-07): junto do telefone, no setup e em Unidades, "Em
  branco, o app da cliente mostra o telefone da clínica…"
  (`[data-telefone-vazio-no-app]`; prova: `e2e/setup-atritos-da-9.spec.ts`).
  Prova: `e2e/portal-cliente-a-clinica.spec.ts`,
  `e2e/portal-cliente-plano-proposto.spec.ts`,
  `e2e/portal-cliente-alterar-agendamento.spec.ts`.
- **Os atritos do portal da 8ª simulação** (2026-11-06; princípio 3, o que a
  tela mostra é o que vale):
  - **A sessão "A agendar" do plano diz quem marca** (A51): com procedimento que
    não está no app (o laser), "quem marca é a clínica — fale com ela para
    escolher o dia"; com todos no app, "agende pelo app em Agendar"
    (`[data-quem-marca-a-sessao]`, o cartão do plano fechado do Início).
    **E cada sessão diz a dela** (A47 da 9ª simulação, 2026-11-07): o plano que
    alterna criolipólise (fora do app) e drenagem (no app) dizia "quem marca é
    a clínica" para todas, e o app deixava a Luana marcar a drenagem. Cada
    sessão "A agendar" diz "A agendar · pelo app" ou "A agendar · quem marca é
    a clínica" (`[data-sessao-do-plano]`), e o resumo separa: "Sessão 2: agende
    pelo app em “Agendar” (já está paga no plano)." / "Sessões 3 e 5: quem
    marca é a clínica…" (`quemMarcaAsSessoes`, `lib/plano-de-tratamento/textos.ts`).
    A régua é a do agendar do app (`pagoParaAgendar`): pelo app vai a sessão
    cujo PRIMEIRO procedimento está no app. Prova: `e2e/plano-atritos-da-9.spec.ts`
    ("A47"), `tests/textos-do-plano-da-9.test.ts`.
  - **O Confirmar avisa ANTES quando o horário fica dentro do prazo do app**
    (A52; `tenants.portal_prazo_alteracao_horas`): "Este horário fica a menos
    de 12 horas: pelo app, a remarcação e o cancelamento vão até 12 horas
    antes…" (`[data-dentro-do-prazo]`). O agendamento continua permitido.
  - **O Início e o Histórico dizem a unidade** (A53): com duas ou mais
    unidades, o próximo agendamento mostra o nome e o endereço da unidade
    DELE (`[data-unidade-do-agendamento]`) — a drenagem da Água Verde aparecia
    no portal do Batel sem dizer onde —, e cada atendimento do Histórico diz
    onde foi (`[data-unidade-do-atendimento]`). O cartão "A clínica" segue o do
    endereço.
  - **A nota dada se lê** (A54): as estrelas do Histórico dizem "4/5" e se
    anunciam ("Atendimento: 4 de 5 estrelas", `[data-avaliacao-dada]`);
    "Aguardando sua confirmação" diz que é opcional, e o link é "Confirmar e
    avaliar (opcional)".
  - **A nota do procedimento tem nome próprio** (A55): na tela de confirmar, o
    grupo é "Procedimento: Avaliação" (era "Avaliação", o mesmo nome do
    resumo).
  - Prova: `e2e/portal-cliente-atritos-da-8.spec.ts`.
- A conta de pontos (`loyalty_accounts`) nasce com o cliente, por `fidelidade_conta` — e sob demanda, se faltar. A fidelidade tem seção própria: §9.2.2.
- **"Indicada por" é a ligação a OUTRA ficha da clínica** (`clients.indicada_por`;
  decisão do Heitor, 2026-11-10 — a regra inteira, com o prêmio, está em
  `fidelidade.md` §9.2.2, "A indicação que premia"): escolhida pela busca no Novo
  cliente, no Agendar com cliente nova e na aba Dados; a Visão geral diz "Indicada
  por: Ana Clara" e "Indicou: Marina (…)". A importação liga pelo nome que bate com
  UMA ficha e, senão, guarda o texto (`referred_by`) e diz que não ligou. Prova:
  `e2e/fidelidade-indicacao.spec.ts`.
- Tags como `String[]` no registro; o VOCABULÁRIO é da rede (`tags`, abaixo).
  `CLIENT_TAGS` (`packages/utils/client-tags.ts`) virou só as oito com que a
  rede nova nasce.

**As tags da rede** (2026-10-13, pedido do Heitor; **Configurações → Tags**,
nos dois portais, para quem tem `clients` OU `crm` em Gerenciar — e é da rede:
quem tem unidade fixa lê "Esta configuração é da clínica toda", e
`criarTag`/`renomearTag`/`arquivarTag` recusam, H7 de 2026-11-01,
`plataforma.md`). Até aqui a
ficha oferecia oito tags fixas no código, e a tag que vinha de fora
(importação, automação, o card) ficava gravada e INVISÍVEL na ficha.
- **Um vocabulário só para a ficha e o CRM** (decisão: a tag descreve a
  pessoa). A ficha, o cadastro, o painel do inbox, o card da oportunidade
  (sugestões), as automações e as campanhas oferecem as ATIVAS
  (`tagsAtivasDaRede`, `useTagsDaRede` no navegador). A ficha mostra também a
  tag que o cliente já tem fora do vocabulário (`opcoesDeTag`).
- ⚠️ **O vocabulário cresce por GATILHO** (`trg_registrar_tags` em clients,
  contacts e leads): toda tag gravada entra, fora as `Unidade: …`. Gravar tag
  por um caminho novo não precisa registrar nada — e não deve.
- **Um nome por rede, sem caixa** (índice em `lower(nome)`): "VIP" e "vip" são
  a mesma. Marcar usa o nome do vocabulário; desmarcar tira qualquer grafia
  (`lib/tags/escolha.ts`).
- **Renomear troca em todo lugar numa transação** (`renomear_tag`: clients,
  contacts, leads e a semente das conversas). Nome que já existe JUNTA as duas
  (fica a que existia, com o nome dela, sem repetir na pessoa). O fluxo de
  automação que cita o nome antigo NÃO é reescrito (versão publicada não muda
  sozinha): a tela lista quais ajustar (`automacoes_que_citam_tag`).
- **A lista de clientes filtra pelo vocabulário** (2026-10-14): Situação
  (Ativos, Novos, Inativos — escolha única) e Tags (várias, todas valem juntas,
  sem caixa) no `PickerCompacto`, como o quadro. O segmento fixo "Todos / VIP /
  Novos / Inativos" saiu: VIP é uma tag como as outras.
- **"Aniversariantes de novembro"** na Situação (A9 da 8ª simulação,
  2026-11-06: só havia a automação desligada): quem faz aniversário no mês de
  Brasília, decidido PELO BANCO (`clientes_aniversariantes`, só o servidor;
  `aniversariantesDoMes`, `lib/clientes/aniversariantes.ts` — §14: nada de
  filtrar no app depois de ler um lote), as ativas, em ordem de dia, com
  "Aniversário dia 05/11" na linha (`[data-aniversario]`). Nos dois portais.
  Prova: `e2e/clientes-aniversariantes.spec.ts`.
- **Arquivar a cliente** (menu "Mais ações" da ficha, `clients: MANAGE`; era "Desativar") a tira das
  listas e da conta de CLIENTE NOVA do dashboard (`is_active` nas três contas: `metrics_core`,
  `metrics_by_branch`, `metrics_new_clients_series`, A24). Prova: `e2e/clientes-arquivar.spec.ts`.
- **O "só os meus" não recorta a ficha da cliente** (o Heitor, 2026-11-07, 9ª simulação: "ve tudo,
  só os meus não se aplica para visualização de clientes pq os clientes são da clinica, isso já foi
  decidido antes"): a profissional com a Agenda ou o Prontuário em "só os meus" abre a ficha de
  qualquer cliente e vê a Visão geral e o Histórico inteiros — os atendimentos de outras
  profissionais, os valores, o plano e o contrato. O escopo continua valendo onde é do módulo: a
  aba Prontuário (o dado clínico de quem ela não atendeu) e a aba Financeiro (o OWN do Financeiro).
- **A ficha é da CLÍNICA, não da unidade de cadastro** (H5, "A cliente é da clínica, pode agendar
  em qualquer unidade da clínica"; F6 da 5ª simulação, o Heitor: "concordo"): quem tem Clientes em
  Gerenciar edita os dados, as anotações e as tags e ARQUIVA/REATIVA a ficha de qualquer cliente da
  rede, mesmo cadastrada em outra unidade — a recepção fixa na Zona Sul cuida da Marlene da
  Moinhos. Toda gravação da ficha vai pelo SERVIDOR (cliente de serviço) com a rede na consulta:
  `atualizarClienteCore` e `toggleClientStatus` (até 2026-11-02 o arquivar ia pela sessão, e a RLS
  de `clients`, que recorta pela unidade de cadastro, o recusava com "Esta cliente é de outra
  unidade."). A RLS não foi alargada. Prova: `e2e/ficha-de-outra-unidade.spec.ts`,
  `e2e/abrangencia-unidade.spec.ts`.
  **E a lista da unidade diz quem é da clínica e não está nela** (A17 da 8ª
  simulação, 2026-11-06): a lista de Clientes do portal da unidade é de quem
  tem a tag dela, e a recepção fixa do Batel não achava a Helena da Água
  Verde. A busca, abaixo da lista, diz "Não está nesta unidade? 1 cliente da
  clínica com esse nome:" com o link da ficha (`[data-da-clinica-fora-da-unidade]`,
  `clientesDaClinicaForaDaUnidade`, a regra de `buscar_clientes`), e a ficha
  aberta pela URL aparece no topo da lista, marcada, com a unidade de
  cadastro (`[data-aberta-fora-da-unidade]`, `actions/clientes-da-clinica.ts`).
  A lista continua sendo a da tag (quem frequenta). Prova:
  `e2e/clientes-da-clinica-na-unidade.spec.ts`.
- **As abas da ficha são ABAS** (`tablist` "Abas da ficha" / `tab`, a escolhida com
  `aria-selected`; continuam links, a aba mora na URL — A17 da 5ª simulação):
  a aba "Oportunidades" e o "Oportunidades" do menu lateral (o quadro geral)
  eram dois links com o mesmo nome, e quem procura pelo nome caía no quadro.
  Teste que abre uma aba da ficha usa `getByRole('tab')`. Prova:
  `e2e/clientes-ficha-aba-oportunidades.spec.ts`.
- **Arquivar** tira das opções; quem já tem continua com ela, e a ficha a
  mostra marcada. Não há apagar.
- **As sobras do arquivar** (A19 da 5ª simulação, 2026-11-02):
  - a confirmação diz os agendamentos MARCADOS dela (agendado ou confirmado,
    daqui para a frente: "Ela tem 1 agendamento marcado (12/11 às 10:00), que
    continua na agenda: arquivar não o cancela") — `avisoDosAgendamentosAoArquivar`;
  - o menu "Mais ações" fecha ao arquivar (`BotaoComConfirmacao.aoFeito`);
  - a BUSCA UNIVERSAL acha a arquivada (`busca_clientes_arquivados`, a
    regra de casar da `busca_universal`), com "Arquivada" na linha e a ação
    "Reativar" (`acoesDaArquivada`, Clientes em Gerenciar), que abre a ficha
    com o menu e o "Reativar cliente" à vista (`?acao=reativar`). Achada
    uma arquivada, a busca não oferece "Cadastrar … como cliente" (era a
    duplicata);
  - o botão desligado PARECE desligado também no secundário e no fantasma
    (`.btn-secondary:disabled`, `.btn-ghost:disabled`, em `globals.css`): o
    "Vender" da arquivada parecia ativo.
  Prova: `e2e/clientes-arquivar.spec.ts` (os testes A19).
- Rede nova nasce com as oito padrão (`trg_rede_ganha_tags`,
  `private.tags_padrao()` — espelha `CLIENT_TAGS`).
- Prova: `e2e/tags-da-rede.spec.ts`, `tests/tags.test.ts`.
- `InternalCredit`: saldo de crédito do cliente (concessão manual, cancelamento de plano pago, estorno de um pagamento feito com crédito); usado como método de pagamento `INTERNAL_CREDIT`, que o desconta (§9.6)
- **A lista de clientes é cache** (`clients:<rede>`, 120 s; rede e unidade): quem
  cria, edita, importa ou etiqueta cliente a expira com
  `revalidateTag(tag, { expire: 0 })` — vale dentro e fora de Server Action
  (Copilot). Com `'max'` a lista abria sem o cadastrado; e, na prova de
  2026-10-21, nem o `updateTag` derrubou este `unstable_cache` (daí a regra do
  CLAUDE.md §14 valer para todos os caches). Prova:
  `e2e/ficha-lista-de-clientes.spec.ts`.
- **Sem Clientes, a lista responde como as outras telas sem acesso** (D11 da
  7ª simulação, 2026-11-05): `/clients` dava HTTP 500 e `/agenda` 200, com a
  mesma tela "Você não tem acesso a esta área". A trava LANÇADA no layout de
  Clientes (os dois portais) sai antes do streaming, fora do Suspense do
  `loading.tsx`. Agora o layout, sem o módulo, não lê nada e só deixa passar a
  página — e a página (`page.tsx` da lista, que não conferia nada) lança o
  `semAcesso()`, como toda tela. O "Minified React error #441" do console é
  esse lançamento no Server Component: o previsto (`e2e.md`, "Lendo o log da
  completa"). Prova: `e2e/permissoes-clientes-sem-acesso.spec.ts`.
- **A Visão geral da ficha diz o que trava e o que faltou** (A24 e A25 da 7ª
  simulação, 2026-11-05): o documento aberto que o CADASTRO trava — "“Termo
  X” não pode ser assinado: falta no cadastro CPF." com "Completar o
  cadastro" (`faltaNoCadastro`, `[data-falta-no-cadastro]`; era só na janela
  do agendamento e na aba Documentos) — e as faltas — "Não compareceu 1 vez: a
  última em 02/11/2026 (Toxina)." com "Ver no Histórico"
  (`[data-faltas-da-cliente]`; o "Histórico de procedimentos" segue só o que
  ela fez, J-26). Prova: `e2e/ficha-cadastro-atritos-da-7.spec.ts`.
- **Quem só vê os clientes não cadastra nem edita** (D4/D5 da 5ª simulação,
  2026-11-01; o Heitor: "quem só pode ver só pode ver"). Com Clientes em Ver,
  o inbox não oferece "Cadastrar cliente" nem o "Vender" de quem não tem ficha
  (`ConversationCard.podeCadastrarCliente`), o quadro não oferece "Converter",
  e a ficha mostra a aba Dados e as anotações só para ler (os campos num
  `fieldset` desligado, sem "Salvar dados" nem "Dar acesso ao app", com a
  frase "Seu cargo só consulta o cadastro"), sem "Mais ações" (arquivar). As
  actions `addClient` e `updateClientContactData` devolvem
  `SO_CONSULTA_CLIENTES` (`lib/clients/so-consulta.ts`) em `{ error }`: o
  `semAcesso()` lançado dentro do `useActionState` derrubava o inbox inteiro
  em "Você não tem acesso", e a promessa rejeitada da aba Dados dava 500 mudo.
  Prova: `e2e/permissoes-quem-so-ve.spec.ts`.
- **A aba Financeiro da ficha é do financeiro** (2026-10-20): os pagamentos e
  o crédito interno do cliente só são carregados para `financial: VIEW` ou
  quem recebe (`podeReceber`), e a aba some para os outros. Carregava para
  quem tinha só o cadastro, e o SDR via cada pagamento. Os KPIs da visão geral
  (LTV, ticket) ficam: são agregados comerciais. Prova:
  `e2e/ficha-financeiro-so-com-modulo.spec.ts`.
- `LgpdRequest`: pedido de acesso aos dados pelo titular. Só `type: "export"`
  está implementado — a exclusão continua fora de escopo por conflitar com a
  guarda legal de prontuário e de registros fiscais. **Confirmado pelo Heitor
  no levantamento das regras** (H15, 2026-11-11, opção a: "não agora"): o
  sistema não registra pedido de eliminação; a cliente pede a eliminação pelo
  contato da clínica, que responde à mão. **E a /privacidade diz isso** (D6,
  de acordo; princípio 3 e "LGPD: só exportação" de 09/09): a página pública
  deixa de prometer uma eliminação que o sistema não faz — a eliminação é
  feita sob pedido, pelo contato da clínica, respeitando as guardas legais
  (prontuário 20 anos, fiscal 5 anos). (Correção C30.) Fluxo: o cliente solicita
  em `/[slug]/cliente/perfil`, `actions/lgpd.ts` grava o pedido e processa em
  `after()` (não há fila no projeto); `/api/cron/lgpd-exports` recolhe o que
  ficar para trás. O pacote sai em PDF (legível) + JSON (portabilidade) no
  bucket privado `lgpd-exports`, com download por signed URL e validade de
  30 dias. Um pedido em aberto por cliente, garantido por índice único parcial.
- **A equipe também exporta, pela FICHA** (A21 da 6ª simulação,
  2026-11-04; até aqui só o portal pedia, e a cliente sem o app ficava sem
  caminho): "Mais ações" → "Exportar dados (LGPD)" (`ExportarLgpdDaFicha`,
  `exportarDadosPelaEquipe`) para quem tem Clientes em Gerenciar — o MESMO
  pacote, em segundo plano, com o download na janela
  (`baixarExportacaoPelaEquipe`, link de 10 min). O pedido fica registrado:
  `requested_via = 'equipe'`, `requested_by` (users.id, sem chave
  estrangeira) e `requested_by_name` (o do ctx; migration
  `20261104002202`). **O prontuário só com o Prontuário em Gerenciar** (a
  régua de liberar): incluído, o pedido já nasce liberado e o acesso vai a
  `prontuario_acessos`; baixar o pacote com prontuário pede o mesmo. O
  suporte não exporta (`bloqueioDoSuporte`). O pacote da equipe não aparece
  nos pedidos da cliente no app. Prova: `e2e/lgpd-exportacao-pela-equipe.spec.ts`.
- **O pedido feito pelo app avisa a clínica, e a ficha aponta onde responder**
  (A49 da 9ª simulação, 2026-11-07: a Beatriz procurou o pedido da Marina na
  ficha e no sino; ele estava em Configurações → LGPD). O `requestDataExport`
  avisa no sino, no `after()`, quem responde — Configurações em Gerenciar da
  clínica toda e a Admin da rede (`avisarPedidoDaCliente`,
  `lib/lgpd/aviso-do-pedido.ts`): "Pedido de dados (LGPD): Marina — … Responder
  até 22/11/2026 (15 dias do pedido), em Configurações → LGPD", com o "Abrir"
  da aba (`data.caminho`). A Visão geral da ficha diz o pedido do app
  (`[data-pedido-lgpd-da-ficha]`): o em aberto, "responder até …", e o dos
  últimos 30 dias já entregue, "o pacote já está no app dela"; a quem responde,
  o link "Abrir Configurações → LGPD"; aos outros, "Quem administra a clínica
  responde em Configurações → LGPD". O pacote da equipe (`requested_via =
  'equipe'`) não entra. Prova: `e2e/lgpd-atritos-da-9.spec.ts`.
- **O plano cancelado diz o cancelamento no pacote** (sobra da F41, 9ª
  simulação): `cancelamento: { em, valorUsado, valorQueCaiu }` no JSON e, no
  PDF, "cancelado em 07/11/2026: valeu R$ 800,00 (as sessões feitas); as que
  sobraram (R$ 1.500,00) saíram do plano" — saía só "Cancelado", sem o dia nem
  o valor (o pacote cancelado já dizia "cancelado em"). Prova:
  `tests/lgpd-plano-no-pacote.test.ts`.
- **O plano vai com as sessões, os procedimentos e os valores; a
  comunicação, com a hora** (A21): `planosDeTratamento` traz `total` e
  `sessoes[{ numero, procedimentos[{ procedimento, valor }] }]` (sem a
  anotação da profissional), e o PDF ganhou a seção "Planos de tratamento"; as
  comunicações no PDF dizem dia e hora (`lib/lgpd/plano.ts`). Prova: o mesmo
  spec e `tests/lgpd-plano-no-pacote.test.ts`.
- **O cadastro do pacote leva o responsável legal e o documento estrangeiro**
  (sobra da F29, decisões 1 e 2 da 7ª simulação, 2026-11-05): a menor tem o
  "Responsável legal" na ficha (`clients.responsavel_*`), e o pacote não o
  levava. O JSON tem `cadastro.responsavelLegal` (`{ nome, cpf, parentesco,
  telefone }`, o CPF formatado; nulo na adulta) e `cadastro.documento`
  ("Passaporte 19FR54321", "RNE …"; nulo com CPF); o PDF, as linhas
  "Responsável legal" ("Marta Lima (Mãe) · CPF … · telefone") e "Documento"
  nos dados cadastrais (`responsavelNoPacote`, `documentoNoPacote`,
  `lib/lgpd/responsavel.ts`). É dado do cadastro: parte geral. Prova:
  `e2e/lgpd-responsavel-legal.spec.ts`, `tests/lgpd-responsavel-no-pacote.test.ts`.
- **O pedido diz o PRAZO** (A60 da 5ª simulação; `data-request-card.tsx`): em
  preparo, "costuma ficar pronto em poucos minutos"; com o prontuário à espera
  da clínica, "responde até DD/MM (15 dias do pedido)" — o prazo da LGPD
  (art. 19, II). Prova: `e2e/lgpd-exportacao.spec.ts`. **A aba LGPD da clínica
  diz o MESMO prazo** (A50 da 8ª simulação, 2026-11-06: a cliente via "até
  21/11" e a clínica não via nada): "Responder até 21/11/2026 (15 dias do
  pedido)" (`[data-prazo-de-resposta]`) no pedido com o prontuário a liberar ou
  ainda em preparo, e, decidido o prontuário, "Prontuário liberado em 06/11/2026
  · o pacote novo, com o prontuário, fica pronto em poucos minutos" (ou
  "negado em", `[data-liberado-em]`, de `medical_reviewed_at`) — ficava "Em
  preparo" sem data. A conta do prazo é UMA, `prazoDeResposta`
  (`lib/lgpd/prazo.ts`), no portal e na aba. Prova: `e2e/lgpd-atritos-da-8.spec.ts`.
  (A decisão 3 do Heitor sobre a 8ª: revogar o consentimento e pedir a exclusão
  pelo app ficam como estão — "mantem do jeito que tá".)
- **Prontuário no pacote depende de liberação**: `include_medical` marca o que o
  titular pediu e `medical_status` (`not_requested | pending | approved |
  denied`) registra a decisão de quem tem `medical_records: MANAGE`, na aba
  LGPD de `/admin/settings`. Aprovar recoloca o pedido em `pending` e o pacote
  é regerado com a parte clínica. Sem o prontuário, o pacote diz POR QUÊ
  (`textoDoProntuarioForaDoPacote`): não pedido, pedido e em análise, ou não
  liberado — era sempre "não incluído", como se não tivesse pedido
  (simulação de 2026-10-20). **E o pedido também** (A56 da 8ª): ao lado do
  `solicitacao.incluiProntuario`, `solicitacao.prontuario` diz "pedido —
  pendente de liberação pela clínica", "pedido — liberado e incluído neste
  pacote", "pedido — não liberado pela clínica" ou "não pedido"
  (`prontuarioNaSolicitacao`, `lib/lgpd/situacao-do-prontuario.ts`). Prova:
  `tests/lgpd-situacao-do-prontuario.test.ts`, `e2e/lgpd-exportacao.spec.ts`.
  **Liberar pede confirmação** (o prontuário vai para a cliente; a confirmação
  nasce ABAIXO do botão, nunca no lugar dele: trocado debaixo do cursor, o
  mesmo clique liberava), e a aba mostra os pedidos esperando: "LGPD (n)".
  A lista pede Clientes (Ver): sem o módulo, a aba diz o porquê (era a tela
  inteira em "sem acesso").
- **O pacote é legível para o titular** (J-65, 2026-10-30): o JSON fala
  português — situações por extenso ("Concluído", "Receita", "Pago", "Pix"),
  a unidade pelo nome, os valores em número — e não leva id nem nome de
  coluna: as listas são montadas campo a campo e `paraOTitular`
  (`lib/lgpd/export.ts`) é a rede de segurança (tira `id`/`…_id`/`…Id`,
  `snake_case` → camelCase, em qualquer nível). O id do pedido saiu.
  `contaNoApp.ultimoAcesso` é `clients.last_app_login_at`, gravado na entrada
  do portal junto com `portal_ultima_entrada_em` (`registrarEntradaNoPortal`;
  as fichas de antes herdaram a última entrada, migration `20261029001203`).
  **Com o prontuário em análise, o pedido continua em andamento**: o cartão
  do perfil diz "Parte geral pronta" + "Prontuário em análise" (não
  "Pronto"), deixa baixar a parte geral e NÃO oferece "Solicitar meus dados";
  `requestDataExport` recusa o segundo pedido. Prova:
  `e2e/lgpd-portal-pacote-legivel.spec.ts`.
- **As fotos de cada atendimento contam a foto da TELA dele** (D16 da 6ª
  simulação, 2026-11-04): no prontuário liberado, o `fotos` de cada
  atendimento soma `record_photos` e a foto clínica anexada pelo cartão
  "Fotos do atendimento" (`client_documents` com o `appointment_id` dele,
  categoria `foto_clinica`, não apagada) — no JSON e no PDF. Dizia "fotos: 0"
  com a foto anexada. O arquivo continua listado em "Documentos anexados".
  Prova: `e2e/lgpd-exportacao.spec.ts`.
- **Os insumos de cada atendimento vêm do ESTOQUE** (D18 da 8ª simulação,
  2026-11-06): o pacote lia `medical_record_entries.products_used`, que
  nenhuma action nem função grava, e dizia `insumos: null` no atendimento que
  baixou 1 Gel condutor. O consumo mora no movimento `PROCEDURE_USAGE` com o
  `appointment_id` (a conclusão o grava): `insumosDosAtendimentos`
  (`lib/lgpd/insumos.ts`) leva, por atendimento do prontuário liberado, o
  produto, a quantidade na unidade de consumo (`unidadeDoInsumo`) e o lote da
  baixa — no JSON (`insumos`, lista vazia quando nada foi usado) e no PDF ("—
  insumos: Gel condutor 1 un"). A entrada sem atendimento segue com o
  `products_used` de antes. Prova: `e2e/lgpd-insumos-do-atendimento.spec.ts`.
- **A ficha de saúde (pré-atendimento) no pacote** (2026-10-21): o
  HISTÓRICO (`fichasDeSaude`: quando foi mandada, ficha completa ou
  confirmação, a situação, quando e por onde foi respondida) vai na parte
  geral; as perguntas e respostas, pergunta a pergunta e com o rótulo da
  ficha do ENVIO, só no prontuário liberado (`prontuario.fichasDeSaude`).
  Prova: `e2e/lgpd-exportacao.spec.ts`.

**O importador de contatos (CSV)** (2026-10-13; **Configurações → Importações**,
nos dois portais — pedido do Heitor, saiu de Clientes e de Oportunidades;
`/importar-contatos` só redireciona para a aba; corpo em
`app/_shared/importar-contatos.tsx`, `lib/importacao/`): arquivo → colunas →
prévia → importação em segundo plano. ⚠️ A aba abre com `clients` OU `crm` em
Gerenciar (`alternativas` em `lib/configuracoes/abas.ts`, lidas por
`abaLiberada` na tela, na busca e no menu; a página de Configurações aceita
`MODULOS_DAS_ABAS`): a SDR que só tem o CRM também importa a lista de leads
dela — e vê Configurações só com essa aba.
- **O arquivo escolhido antes de a tela hidratar vale** (A54 da 7ª simulação,
  2026-11-05: o "Continuar" ficava desligado — o `onChange` do React ainda não
  existia, e o arquivo ficava no campo sem chegar ao estado): ao montar, o
  importador lê o arquivo que já está no campo. Prova:
  `e2e/importacao-antes-da-hidratacao.spec.ts` (o JavaScript da página
  segurado até o arquivo estar escolhido).
- **A importação é de quem é da REDE** (H8 do levantamento das regras, o
  Heitor, 2026-11-11: "Importações é da rede, ela que vai importar os seus
  clientes ou o que for, e na importação poder escolher se aquilo pertence a
  uma unidade"): quem tem unidade fixa não importa (`recusaDaConfigDaClinica`;
  a aba diz "Esta configuração é da clínica toda"), e a importação escolhe a
  unidade a que os registros pertencem. (Correção C73: hoje a gerente importa
  para a unidade dela.) `plataforma.md`, "A configuração da clínica toda".
- **O destino é escolhido a cada importação**: *clientes* (a ficha, na unidade
  escolhida; `clients: MANAGE`) ou *contatos do CRM* (só a
  pessoa: nome, telefone, e-mail, rede social, tags; `crm: MANAGE`). Oportunidade no funil é
  opcional (`crm: MANAGE` + recurso `oportunidades`; responsável que não é
  quem importa só com `podeTrocarResponsavel`) e não duplica: quem já tem uma
  aberta no mesmo funil não ganha outra — e a que já existe NÃO é completada
  (a planilha não mexe no card que alguém está trabalhando).
- **Os campos que se oferecem dependem da importação** (`camposDoDestino`,
  2026-10-13 — "quanto mais completa, melhor"): a oportunidade se decide no
  PASSO 1, antes das colunas, porque com ela entram os campos do CARD —
  origem (as origens DA CLÍNICA primeiro — `crm_origens`, A14 da 7ª —, depois
  os apelidos: "facebook" é Meta Ads; o desconhecido vira "Outro", não erro;
  `normalizarOrigem` com `refs.origens`), valor estimado ("R$ 1.500,00"),
  observações, procedimento de interesse, etapa (do funil escolhido), responsável
  (nome ou e-mail da equipe ativa), UTM source/medium/campaign e tags da
  oportunidade. Etapa e responsável da linha vencem os da tela; vazio, valem os
  da tela. ⚠️ A COLUNA de responsável distribui leads: a action a recusa para
  quem não tem `podeTrocarResponsavel` (a tela nem a oferece).
- **O que a linha cita por nome** (unidade, etapa, responsável, procedimento) é
  resolvido sem acento nem caixa; não achado — ou ambíguo, como dois membros
  com o mesmo nome — recusa a linha com o motivo. A prévia usa as listas que a
  página manda; o servidor monta as suas (`referenciasDaRede`,
  `lib/importacao/referencias.ts`).
- **No cliente**: a situação (ativo/inativo) vale só para quem NASCE (quem já
  existe fica como a clínica tem); a unidade POR LINHA só na rede (quem é de
  unidade importa para a dela), e a escolhida na tela vale para as linhas sem.
  A rede social não é da ficha: no destino clientes ela só vai para o card.
- **O arquivo é lido no navegador** (`csv.ts`: UTF-8 ou Windows-1252, `;` `,`
  ou tabulação, aspas RFC 4180; `campos.ts` sugere a coluna pelo cabeçalho);
  **o servidor valida cada linha de novo** com o MESMO `normalizar.ts` — a
  prévia não é confiável. Até 5 MB e 10 mil linhas.
- **O telefone se EXIBE formatado em toda tela, seja qual for o formato gravado** (A25, 2026-10-27):
  `maskPhone` (`@estetica-os/utils`) aceita só dígitos, máscara, "+55" e o 55 do WhatsApp, e devolve
  como veio o que não é número nacional. Tela nova que mostra telefone passa por ele; a ficha
  criada (cadastro, conversão do lead) grava `(48) 99000-0011`, como a de balcão. Prova:
  `e2e/telefone-formatado.spec.ts`, `packages/utils/tests/format.test.ts`.
- **Telefone no formato do WhatsApp** (só dígitos, 55 + DDD + número): é o que
  `contacts.identifiers` guarda e o webhook manda. Sem DDD é erro (não se
  adivinha a cidade). ⚠️ Para ACHAR a pessoa, as duas formas do celular
  (`variantesDoTelefone`): o WhatsApp guarda muito número SEM o nono dígito, e
  a planilha o traz COM — procurar uma só dobrava a pessoa. A oportunidade vai
  com o telefone da pessoa ACHADA (o gatilho a liga pelo número exato).
- **Quem já existe só tem o VAZIO completado** e as tags juntadas — nunca se
  troca o que a clínica tem; importar de novo é seguro. Cliente: pelo CPF; sem
  achar, a ficha SEM CPF do mesmo telefone (`cliente_por_telefone`,
  `p_sem_cpf`) — a regra do cadastro manual (telefone de ficha com CPF pode
  ser de outra pessoa). Contato: pelo telefone exato; sem telefone, pelo
  e-mail (sem caixa).
- **A prévia diz o que vai JUNTAR** (A15 da 5ª simulação: "10 linhas prontas",
  e a "Renata Quintas" sumiu na Luana Prado pelo telefone — só o resultado
  dizia "1 completado"): quem cada linha pronta encontra na rede, pela regra
  da importação (`cruzamentoDaImportacao` → `importacao_cruzamento`, só lê) —
  "completa a ficha de X (o mesmo CPF)", "junta com X (o mesmo telefone)", a
  linha que repete o telefone de outra, e quem entra sem telefone. **A ficha
  SEM CPF completada pelo TELEFONE se desmarca** (cli-07, revisão do Heitor de
  2026-11-02: a filha com o telefone da mãe completava a ficha rápida da mãe):
  "Completar a ficha de Marlene" vem marcada; desmarcada, a linha vira ficha
  nova (`importacoes.nao_completar`; o CPF continua juntando, é a mesma
  pessoa). Prova: `e2e/importacao-previa-cruzamento.spec.ts`.
- **O contato entra com o telefone OU o e-mail** (D-10, decisão do Heitor,
  frente de cadastro de 2026-10-29): a linha só com e-mail vira pessoa sem
  telefone (`identifiers` vazio), e a oportunidade dela vai para ESSA pessoa
  (`criarOportunidadeCore(…, { contatoId })` — sem telefone, o gatilho criaria
  outra). Sem os dois, a linha é recusada; a tela pede a coluna de um dos dois
  (`colunasQueFaltam`). A FICHA (clientes) continua exigindo o telefone
  (`clients.phone` é NOT NULL).
- **No contato, o telefone repetido JUNTA** (D-10): não é "Repetida na
  planilha" — a segunda linha completa o vazio da pessoa que a primeira
  criou e junta as tags; a ORIGEM da linha (`op_origem`) entra como tag da
  pessoa (como a do anúncio, `deriveLeadSource`), também na pessoa nova. Na
  ficha (clientes) a repetida continua recusada (mesmo CPF, ou sem CPF o
  mesmo telefone COM O MESMO NOME). Prova: `e2e/importacao-contatos.spec.ts` ("só com e-mail").
  **A coluna da origem se mapeia também SEM oportunidade** (A16 da 7ª
  simulação, 2026-11-05; princípio 3: a coluna "origem" não se oferecia no
  contato, e a prévia dizia que "a origem se junta"): "Origem (vira tag da
  pessoa)" no grupo da pessoa (`camposDoDestino`). A prévia diz como cada
  valor entra — "A origem de cada linha entra como tag da pessoa: facebook →
  Meta Ads · Feira de noivas" (`OrigensDaPlanilha`, `data-origens-da-planilha`)
  —, e o texto do telefone repetido diz a regra inteira: "as tags se juntam (a
  origem entra como tag), e o nome e o e-mail que ficam são os da primeira
  linha". **E o e-mail que se perde** (A17): "— o e-mail desta linha (joana@…)
  não entra: fica o da linha 2 (marta@…)"; com quem já existe, "o e-mail
  desta linha só entra se X ainda não tiver um". A regra D-10/A14 não mudou.
  Prova: `e2e/crm-atritos-da-7.spec.ts` ("A16/A17"), `tests/importacao.test.ts`.
- **O mesmo telefone com OUTRO nome na planilha** (A14 da 6ª simulação,
  2026-11-04; princípios 1 e 3: a Karina sumia na Bianca, calada): não é a
  repetida. **Na ficha**, a prévia mostra "Linha 3 · Karina tem o mesmo
  telefone da linha 2 · Bianca" com a caixa "Juntar Karina com Bianca",
  marcada (o padrão é a regra do telefone: completa só o vazio da ficha da
  Bianca, como a ficha que já existe); desmarcada, a Karina vira a ficha dela,
  com o mesmo telefone (`importacoes.nao_completar`, o mesmo do cli-07). O
  nome compara sem caixa, acento e espaço (`nomeDiferente`); o mesmo nome
  segue "Repetida na planilha". **No contato** não há escolha: um telefone é
  uma pessoa só (a conversa do WhatsApp é uma, e dois contatos com o mesmo
  identificador é o defeito do §9.2.1), e a prévia diz "… junta com a linha 2
  · Bianca (o mesmo telefone) — o nome que fica é Bianca", também na pessoa
  que já existe, e manda importar como clientes quem são duas pessoas.
  `marcarRepetidas` (a prévia) e `processarImportacao` (o servidor) dividem a
  regra. Prova: `e2e/importacao-previa-cruzamento.spec.ts` ("A14"),
  `tests/importacao.test.ts`.
- **Cliente novo**: tag da unidade (é por ela que a lista filtra) e conta de
  fidelidade (`fidelidade_conta`); **SEM acesso ao portal** (cria-se na ficha).
  A importação de clientes não cria contato do CRM: a ficha se liga à pessoa
  quando a conversa começar, como no cadastro manual.
- ⚠️ **Nenhum evento de domínio** (`criarOportunidadeCore(…, { semEventos })`,
  e cliente/contato gravados direto): uma planilha não pode virar mil
  automações de boas-vindas.
- **Só o impossível recusa a linha; o campo opcional ilegível vira AVISO**
  (D2 da 8ª simulação, 2026-11-06; decidido pelo princípio 2 — "só se recusa
  o impossível; no máximo avisar"). A Isabela (CPF 123.456.789-00) sumia
  inteira, com nome, telefone e nascimento bons. Agora a linha entra SEM o
  campo ruim e diz por quê: "CPF inválido ("123.456.789-00"): importada sem o
  CPF." — o CPF, o e-mail, o nascimento, o gênero, o CEP, a UF, a situação
  ("importada como ativa"), a unidade ("importada na unidade escolhida na
  tela"), as datas e o responsável legal; no card, o valor, a etapa, o
  responsável e o procedimento ("a oportunidade entra sem ele"/"na etapa
  escolhida na tela"); no contato, o telefone ruim com um e-mail bom ("importada
  só com o e-mail"). Recusa só: sem nome (na ficha), a ficha sem telefone que
  preste (`clients.phone` é NOT NULL), o contato sem telefone nem e-mail
  válido, e a repetida na planilha. `validarLinha` devolve `erros` (recusam)
  e `avisos` (entram); a prévia e o resultado mostram as duas listas
  ("Linha 5 · Isabela: …", `[data-linhas-recusadas]`,
  `[data-importadas-com-aviso]`), e o servidor as guarda (`importacoes.erros`
  e `.avisos`, com o nome da linha; `com_aviso`). Prova:
  `e2e/importacao-migracao.spec.ts`, `tests/importacao-migracao.test.ts`.
- **O relatório e o histórico** (A6 da 8ª simulação: a aba voltava ao passo 1
  sem histórico, e a dona só descobria a recusada pela ausência). O CSV
  (`/api/importacoes/[id]/erros`, "Baixar o relatório") traz "Linha; Nome;
  Situação; Motivo" — as recusadas e as importadas com aviso. A aba mostra
  "Importações anteriores" (`importacoesAnteriores`,
  `lib/importacao/historico.ts`; `[data-importacao-anterior]`): as que a
  pessoa alcança (a régua de `importacaoAoAlcance`), com o placar ("4 novos ·
  2 com aviso · 1 recusada") e o relatório enquanto ele vale (7 dias).
- **A migração: as colunas "Cliente desde", "Última visita", "Pacote de antes"
  e o responsável legal** (decisão 1 (c) do Heitor sobre a 8ª simulação,
  2026-11-06: "concordo"; A5, A7, A8; migration `20261106003502`):
  - **"Cliente desde"** (`clients.cliente_desde`, data; aceita "03/2021" e
    "2019"): a ficha de antes do mês NÃO conta como cliente nova dele — os
    novos clientes contam por `coalesce(cliente_desde, created_at)`
    (`indicadores.md`), e o selo "Novo" da lista também. **E a tela diz o
    dela** (D6 da 10ª simulação, 2026-11-10; princípio 3): a ficha e o
    atendimento diziam "Cliente desde nov 2026" (o cadastro no sistema) para
    quem a planilha diz desde 2021. "Cliente desde" na ficha, no cabeçalho do
    atendimento e no pacote LGPD é o `cliente_desde`, senão o cadastro — UMA
    regra, `lib/clientes/cliente-desde.ts` (o dia gravado lido como dia: o
    01/03 não vira fevereiro); o pacote LGPD diz também o "Cadastro no
    sistema" quando os dois existem. Prova: `e2e/ficha-atritos-da-10.spec.ts`,
    `e2e/atendimento-atritos-da-10.spec.ts` ("D6"), `tests/cliente-desde.test.ts`.
  - **"Última visita"** (`clients.ultima_visita_antes`, data): a última
    visita no sistema de ANTES. **Não vira atendimento** (nada se inventa: sem
    agendamento, prontuário, receita nem comissão); entra onde a tela pergunta
    "quando ela veio por último" — o "Reativar clientes" (sumida = sem visita,
    nem a de antes, nos 90 dias; a "última visita" é a mais recente das duas,
    com "antes_do_sistema"), o público "sem retorno" das campanhas e a "Última
    visita" da lista de Clientes (decidido pelo princípio 3: o que a tela
    mostra é o que vale na conta).
  - **"Pacote de antes (procedimento; total; usadas)"** — e, opcionais, o valor
    de referência e a validade ("Limpeza de pele; 10; 7; 1500; 31/12/2027";
    mais de um com "|"; `lerPacotesDaPlanilha`): cria o pacote trazido de
    fora (`vendas-financeiro.md` §9.3.1) na unidade da linha, pela mesma porta
    da ficha (`trazerPacoteCore`). Só se oferece a quem traz pacote de fora (o
    Financeiro em Gerenciar; a action recusa a coluna aos outros). Importar de
    novo não o traz duas vezes (o mesmo procedimento, total e usadas). O que
    não se entende fica de fora com o motivo (D2). **O Histórico do app diz o
    que veio de antes** (A42 da 10ª simulação, 2026-11-10: as 5 sessões da
    Ana Clara apareciam só no cartão da home): "Antes do sistema — 5 sessões
    de Limpeza de pele, do pacote que você trouxe · Última visita antes do
    sistema: 12/09/2026" (`[data-de-antes-do-sistema]`, a última visita é a
    `ultima_visita_antes`). Não vira atendimento: sem data, profissional nem
    avaliação. Prova: `e2e/portal-cliente-historico-da-10.spec.ts`.
  - **O responsável legal** (A5: nome, CPF, parentesco, telefone): só na
    MENOR (pelo nascimento que a ficha fica tendo — a regra de
    `colunasDoResponsavel`); na adulta, "Responsável legal não gravado".
    A menor que fica sem responsável é avisada na prévia e no resultado ("Menor
    de idade (15 anos), sem responsável legal no cadastro…") — avisar, não
    barrar.
  - Quem já existe só tem o VAZIO completado, como sempre (inclusive as datas
    e o responsável).
  Prova: `e2e/importacao-migracao.spec.ts`.
- **A prévia mostra uma amostra, e o pacote se explica antes** (A7 da 10ª
  simulação, 2026-11-10; princípios 3 e 4: dizia só "20 linhas prontas", e o
  pacote sem valor só se via depois, na ficha). O passo das colunas, com a
  coluna do pacote escolhida, diz o formato ("procedimento; total; usadas" e,
  se tiver, o valor e a validade — `[data-formato-do-pacote]`); a prévia mostra
  como entram as três primeiras (nome, telefone, e-mail, os pacotes —
  `[data-amostra-da-importacao]`) e avisa "N pacotes de antes sem valor de
  referência: … não geram comissão de execução (R$ 0) nem entram na receita"
  (`[data-pacotes-sem-valor]`, `pacotesDaLinha`). **Com UMA unidade, a
  importação não pergunta qual** (A2 da 10ª, `design.md`). Prova:
  `e2e/configuracoes-atritos-da-10.spec.ts` ("A7").
- Roda em `after()` (`lib/importacao/processar.ts`), no padrão do histórico do
  WhatsApp: `importacoes` reivindicada com uma `execucao` nova, e TODO sinal de
  vida e a gravação final filtram por ela — a passagem que perdeu a vez para de
  gravar. Sinal a cada 100 linhas, ANTES de tirar o pedaço de
  `importacao_linhas` (cair no meio regrava o pedaço, o que é seguro; o
  contrário perderia as contagens). O sinal que o banco recusa (o tempo limite
  de um engasgo) é tentado mais duas vezes, com 2 s e 5 s de pausa, antes de a
  importação virar "Falhou" (F26, 2026-11-05: na 3ª completa UMA gravação do
  andamento derrubou a importação inteira, com as linhas já gravadas). Prova:
  `tests/importacao-andamento.test.ts`. Interrompida, "Tentar de novo" continua de
  onde parou; upload que falha no meio apaga a importação inteira (retomar uma
  truncada importaria meio arquivo em silêncio).
- **Ler, retomar e baixar os erros** conferem o módulo do DESTINO e, nos
  clientes, a unidade (`importacaoAoAlcance`). O relatório guarda o valor
  errado (dado pessoal): expira em 7 dias, também na falha, conferido na leitura
  e varrido pelo cron `importacoes` (hora em hora). O "Linha N" é o da
  planilha (`lerCsv` devolve `numeros`: linha em branco e célula de várias
  linhas contam). A etapa da oportunidade é de funil ATIVO.
- Prova: `e2e/importacao-contatos.spec.ts`, `tests/importacao.test.ts`.

### 9.2.1 Contato, conversa, oportunidade e cliente — quem é quem

São quatro entidades e é fácil confundi-las. A regra é:

| | O que é | Cardinalidade |
|---|---|---|
| **`contacts`** | a **PESSOA** | uma por rede |
| **`conversations`** | a **THREAD** — um canal, uma caixa | várias por pessoa |
| **`leads`** | a **OPORTUNIDADE** no funil | várias por pessoa |
| **`clients`** | a **FICHA** na clínica (CPF, prontuário, financeiro) | no máximo uma por pessoa |

**A conversa NÃO é a pessoa.** Ela era, e isso funcionava enquanto cada pessoa
tinha uma conversa só. Deixou de funcionar com vários números: o dedup inclui a
caixa — de propósito, porque no celular do cliente são duas conversas mesmo —,
então a mesma pessoa falando com duas caixas virava duas fichas de contato, com
dois nomes, duas listas de tags e duas atribuições de anúncio. E
`leads.conversation_id` é singular, então o card ficava preso numa delas
enquanto o atendimento acontecia na outra.

O buraco aparecia exatamente no **handoff** — lead entra pelo número de
marketing, a SDR qualifica e agenda, a unidade assume por outro número —, que é
o momento em que ler o histórico é o que mais importa. E já acontecia antes dos
múltiplos números, entre Instagram e WhatsApp: ali a mesma pessoa sempre foram
duas conversas.

- **Contato não vira `clients` automaticamente.** Quem pergunta "abrem sábado?"
  não pode entrar na base clínica e financeira — e `LoyaltyAccount` nasce junto
  no cadastro (§9.2).
- **A identidade é `contacts.identifiers`** — telefone, @lid, BSUID, PSID,
  IGSID, todos na mesma lista. A invariante é: `contact_aliases` de cada conversa
  é **subconjunto** de `identifiers` do contato dela. Se um alias novo ficar só
  na conversa, a próxima mensagem que chegar por ele não acha a pessoa e nasce um
  segundo contato — em silêncio.
- ⚠️ **A ligação é feita por GATILHO no banco**
  (`trg_conversa_ganha_contato`, `trg_contato_aprende`), não no TypeScript. Há
  três pontos que criam conversa e vão existir mais; instrumentar um a um é
  garantir esquecer o próximo — mesmo argumento de `pagamento.*` e `estoque.*`
  (§9.9). Quem lê o código não vê isso acontecer, e
  `lib/inbox/resolve-conversation.ts` diz onde olhar. De brinde, o contato criado
  pelo gatilho é desfeito junto quando o insert da conversa colide no `23505`.
- **A busca do contato não tem recorte de canal nem de caixa** — é justamente o
  cruzamento que interessa. Com filtro, cada caixa criaria o seu contato e o
  problema voltaria com outro nome.
- **Contato órfão (sem thread) não é defeito.** Em produção conversa não se
  apaga. O que é defeito é a mesma pessoa cadastrada duas vezes, ou seja, dois
  contatos com identificador em comum — nenhum índice proíbe sobreposição de
  array, então a trava é `e2e/contato-espinha.spec.ts`.
  **Mas ele se acha** (A15 da 6ª simulação): a pessoa sem oportunidade e sem
  conversa (a importada sem card) aparece na busca universal ("Contatos do
  CRM"), e abrir cria a oportunidade dela no quadro (`busca.md`).

**E-mail e rede social também são da pessoa** (`contacts.email`,
`contacts.social_media`, 2026-10-13): o importador os grava nela (só o vazio)
mesmo sem oportunidade, e o painel do inbox os mostra e edita na seção do
contato (`atualizarContato`). Não propagam: a oportunidade tem a SUA cópia
(`leads.email`, `social_media`), que é o card e se edita no card. Prova:
`e2e/inbox-contato-email.spec.ts`.
- O "Cadastrar cliente" do inbox vem com o e-mail da pessoa e, sem ele, o da
  oportunidade (A16 da 5ª simulação: a cópia do card tinha o e-mail e o
  cadastro vinha sem); o telefone do painel aparece FORMATADO (`maskPhone`) e,
  ao editar, como está gravado — formatar o valor faria o salvamento
  automático regravar o número da pessoa, que é o destino da conversa. Prova:
  `e2e/inbox-contato-email.spec.ts` (A16).

**As TAGS são da pessoa** (`contacts.tags`), e sempre eram — o comentário em
`conversations.tags` já dizia "Tags do CONTATO: descrevem a pessoa, não o
negócio". `conversations.tags` sobrevive como **semente**: escrita uma vez no
nascimento da thread (é de onde vêm as tags derivadas da origem), lida pelo
gatilho que a leva para a pessoa, e **nunca lida pelo app**. **Fica** — decisão
do Heitor em 2026-09-28: tirá-la obrigaria cada ponto que cria conversa a
escrever na pessoa, que é o que o gatilho existe para evitar (comentário na
coluna, migration `20260928000008`).

⚠️ **Variável de plpgsql não pode se chamar como uma coluna.** `declare tags
text[]` num gatilho de `contacts` fez a referência ficar ambígua (`42702`)
dentro do `update`, o INSERT da conversa falhar e a mensagem do cliente ser
DESCARTADA — e só no caso de quem já tem contato, que é o que esta frente existe
para suportar. As colunas no `update` do gatilho são qualificadas (`c.tags`) para
isso não voltar em silêncio.

**A atribuição do anúncio NÃO mudou de casa, e é deliberado.**
`conversations.attribution` aponta para o último anúncio *daquele* retorno
(`marcarAnuncioNaConversa` a reescreve quando a pessoa volta por outro) — é
informação da THREAD. O que seria do contato é a PRIMEIRA origem, e isso é um
dado novo, não uma mudança de casa: não entra antes de alguém precisar dele.
- ⚠️ Mas quem procura "o anúncio deste cliente" tem de procurar a conversa mais
  recente **que tenha anúncio**, não simplesmente a mais recente: com várias
  threads, a última a receber mensagem costuma ser a do atendimento, não a que
  veio da campanha. `on_transaction_paid` fazia isso errado e mandava a compra
  para a API de Conversões da Meta com `ad_id` nulo — ROI menor do que é, sem
  nada acusando.

**A fila do inbox vem de 30 em 30, filtrada no BANCO** (`inbox_pagina`,
migration `20260928000007`), e o fim da lista busca a próxima pelo cursor
`(last_message_at, id)`. Eram as 200 mais recentes filtradas no navegador: a
201ª não aparecia nunca, nem procurando. Consequências:
- **Filtro e busca vão ao servidor.** `passaNosFiltros` continua no navegador
  só como guarda do que chega pelo realtime — as duas definições têm de
  continuar iguais (a da função cita a do componente).
- **As opções dos menus vêm da rede** (`inbox_opcoes`), não das conversas
  carregadas: o dono que só aparece na página 5 sumiria do menu.
- **O realtime recarrega o tanto que já está na tela**, com os filtros de
  agora — recarregar "do zero" encolheria a lista de quem rolou.
- O alcance entra na mesma consulta: no modo "pela conversa" os leads do dono
  vêm de `leads_do_dono` (um array só; o select parava em 1000).
- **O filtro "Número"** (r2-cfg-06, 2026-11-03): as conversas de um número
  de WhatsApp — também o REMOVIDO, cujas conversas ficam no inbox
  (`whatsapp-push.md`). `p_filtros.numeros`, `inbox_opcoes.numeros`.
  VÁRIOS de uma vez (r3-f14-11, o Heitor: "a recepção que cuida de dois
  números vê os dois juntos"): pastilhas que acumulam (`.chip-filtro` +
  `aria-pressed`, no grupo "Número de WhatsApp"), uma por linha, o nome
  longo cortado com reticências dentro do painel — era uma escolha só.
  Prova: `e2e/whatsapp-remover-numero.spec.ts` ("r3-f14-11").
- Prova: `e2e/inbox-paginado.spec.ts`, numa rede `[e2e]` própria.

**A fila do inbox é de CONVERSAS** — a mesma pessoa em duas caixas são duas
linhas, cada uma com o nome da caixa quando a rede tem mais de uma. Foi por
pessoa por um dia (2026-09-25/26) e voltou por decisão do Heitor, vendo um caso
real: a linha única escondia em qual conversa o clique cairia, e alternar entre
as threads ficou confuso. **A pessoa une as conversas no PAINEL, não na fila.**

**O cruzamento é o que conserta o handoff.** `getConversationCard` devolve
`outrasThreads` — as outras conversas da mesma pessoa —, e o painel do inbox as
mostra na seção do CONTATO (não na das oportunidades: é sobre a pessoa). Clicar
abre aquela thread. **Respeita o alcance do CRM pela mesma regra da lista**
(`alcanceDoDono`, ver abaixo): abrir exceção ali seria furar, por uma tela, a
regra que vale na tela ao lado.

**A oportunidade é da PESSOA** (`leads.contato_id`, NOT NULL). `leads.conversation_id`
continua existindo com outro sentido: a thread onde a oportunidade **nasceu**.
Ninguém pergunta mais "as oportunidades desta conversa" — lista do inbox, card
do contato, histórico, checagem de duplicata e propagação de nome leem por
`contato_id`, e o card do quadro mostra a atividade de todas as threads da
pessoa (`lib/crm/atividade-da-pessoa.ts`).
- ⚠️ **O dono é posto por GATILHO** (`trg_oportunidade_ganha_contato`): a
  pessoa da conversa de origem, senão a do telefone (só dígitos, o formato do
  webhook), senão uma nova. O cadastro manual (`createLead`) nunca gravou
  `conversation_id`, e o lead nascia sem pessoa — o motivo de não ser código.
  **O telefone digitado vira o do WhatsApp** (A16 da 6ª simulação; migration
  `20261104002301`): o número nacional (10 ou 11 dígitos, sem "+") ganha o
  55, a busca olha as duas formas do celular e a forma antiga sem o 55, e a
  pessoa nova nasce com o 55. O escrito com "+" é de outro país e fica como
  veio. As pessoas gravadas sem o 55 antes disso não foram reescritas: as
  buscas do gatilho e do cadastro as acham.
- **A oportunidade tem "Agendar"** (A16 da 6ª simulação, 2026-11-04): o
  card do quadro (os dois portais) tem o botão ao lado de "Ir para a
  conversa", a MESMA janela do painel do inbox (`ScheduleModal`,
  `createCrmAppointment`): nome e telefone do lead, a ficha nasce ligada ao
  card (`leads.client_id`), o agendamento é COMMERCIAL e a linha do tempo
  do card diz que houve o agendamento. Aparece com o CRM em Gerenciar e a
  agenda no plano (`podeAgendar`). Prova: `e2e/crm-agendar-liga-oportunidade.spec.ts` ("A16").
  **Na rede de duas ou mais unidades, a janela nasce SEM unidade** (sobra da
  F33 da 8ª simulação, 2026-11-06; princípio 3): nascia na primeira em ordem
  alfabética; agora "Selecione a unidade…" (`unidadeInicial`,
  `lib/unidades/unidade-inicial.ts` — com uma só, ela). Prova:
  `tests/agenda-sobras-da-f33.test.ts`.
- **Os separadores de dia da conversa são do dia de Brasília** (sobra da F33):
  agrupavam por `created_at.slice(0, 10)`, o dia em UTC — a mensagem das
  23:30 caía no separador do dia seguinte. É `agruparPorDia`
  (`lib/inbox/dias-da-conversa.ts`, `dayKeyTZ`). Prova: o mesmo teste.
- `on delete restrict`: pessoa com oportunidade não se apaga.
- **Oportunidade não se apaga** (decisão do Heitor, 2026-09-28): apagar levava
  o histórico junto (`lead_events` em cascata). A que não vai adiante é marcada
  perdida. Não há action, botão nem política de DELETE — e `lead_events` é
  append-only pela sessão (ler e acrescentar). Prova: `e2e/lead-nao-se-apaga.spec.ts`.
- **Com escopo OWN, o inbox segue a pessoa OU a conversa — escolha da clínica**
  (`tenants.inbox_visibilidade`, Configurações → Cargos, pede `roles: MANAGE`).
  Decisão do Heitor em 2026-09-26: "pessoa" é o padrão, mas configurável.
  - **Pela pessoa:** tem oportunidade sua → você vê todas as threads dela; só
    de outros donos → nenhuma; nenhuma oportunidade → todo mundo vê.
  - **Pela conversa:** cada thread pela oportunidade ligada a ELA
    (`conversations.lead_id`); thread sem oportunidade fica no bolo comum —
    inclusive a thread nova de quem é de outro dono.
  - A regra mora em UM lugar (`lib/inbox/alcance.ts`: `alcanceDoDono`), usado
    pela lista e pelos atalhos das outras threads. Quem esconde quem é conta
    do banco (`contatos_ocultos_do_dono`, só `service_role`), que devolve um
    array só — ler os leads com dono no app bateria no teto de 1000 linhas.
  - Erro ao ler o alcance mostra NADA, nunca tudo.
  - ⚠️ **Esconder da lista não basta: a abertura por id é trancada.** Toda
    action que recebe o id de uma conversa ou de uma mensagem passa por
    `conversaAoAlcance` / `mensagemAoAlcance` (dono + caixas do cargo) e, fora
    do alcance, responde como se a conversa não existisse. Até 2026-09-27
    `/admin/inbox?c=<id>` entregava as mensagens de qualquer conversa da rede.
    Action nova de conversa sem esse portão é o furo de volta.
  - O mesmo vale para a **oportunidade**: `leadAoAlcance` (`lib/crm/alcance.ts`)
    aplica a regra do funil (sua ou sem dono) a toda action que recebe o id de
    uma — inclusive fora do inbox (`createCrmAppointment`, `addClient` com
    `_leadId`). Os dois portões exigem `crm: VIEW`: `clients: MANAGE` não é
    passe para mexer em card nem em conversa.

**O alcance do módulo ligado num cargo nasce SEM ESCOLHA** (A2 da 12ª
simulação, 2026-11-11; princípio 3 — substitui a A5 da 9ª, que fazia o CRM
nascer em "Todos" e os outros escopáveis em "só os meus"): na matriz de
Cargos, o alcance (CRM, agenda, prontuário, financeiro, relatórios) só aparece
com o módulo ligado, e ligado ele vem sem nenhum dos dois marcado ("Escolha o
que este cargo enxerga aqui."). Salvar sem escolher não grava um padrão
escondido: a tela diz o que falta (`[data-falta-escolher]`) e a action recusa
("Escolha o que o cargo enxerga em …"). O já ligado mantém o escolhido, e o
"só os meus" guardado do módulo desligado volta ao religar (D6). O Relatórios
em "Ver" pede ao menos um relatório antes de salvar. `escopoInicial`
(`lib/cargos/escopo-inicial.ts`). Prova: `tests/cargo-escopo-inicial.test.ts`,
`e2e/configuracoes-atritos-da-12.spec.ts` ("A2").

**O RESPONSÁVEL da oportunidade** (`leads.owner_id`, 2026-10-09). Na tela e no
histórico é sempre "Responsável", nunca "Dono" (decisão do Heitor: o mesmo
conceito não pode ter dois nomes) — no código segue `owner`.
- Nasce de quem cria o lead; o card mostra as iniciais (o nome no `title`), e
  o modal do lead tem o campo "Responsável" (os membros ATIVOS da rede, mais
  "Sem responsável" — que devolve o card ao bolo comum).
- **O lead novo ABRE com quem o cria, e o vazio só tira o responsável quando
  a tela mostrou o campo** (D1 da 11ª simulação, 2026-11-10; princípio 3: a
  Tatiane criou 6 leads seguidos e 4 nasceram "Sem responsável"). Da 2ª
  abertura do "Novo lead" em diante a lista de responsáveis já estava em
  memória: o select aparecia em "Sem responsável" até o servidor responder, e
  o lead gravado nesse meio-tempo mandava `owner_id=''`. Agora o modal abre
  com o `eu` da lista em memória, a resposta que chega depois não troca o que
  a pessoa escolheu, e o select vai com a marca `_responsavelNaTela`; sem ela,
  o `owner_id` vazio não troca nada (`responsavelDoForm`, `createLead` e
  `updateLead`). Prova: `e2e/crm-defeitos-da-11.spec.ts` ("D1").
- **Troca só quem tem o CRM em Gerenciar com escopo "todos"**
  (`podeTrocarResponsavel`, `lib/crm/responsavel.ts`). O "só os meus" vê o
  nome e não troca: passar o card adiante o tiraria do próprio alcance, e
  pegar o de outro é o que o escopo impede. O servidor confere de novo — quem
  não pode e manda `owner_id` no form não muda nada.
- Tela e automação ("Definir responsável") passam pelo MESMO núcleo,
  `trocarResponsavelCore`: a pessoa é da rede e ativa, e a linha do tempo diz
  DE quem PARA quem (até 2026-10-09 a automação gravava sempre "de: —").
  Prova: `e2e/crm-responsavel.spec.ts`.
- **Desativar a pessoa oferece repassar as oportunidades abertas dela** (H6,
  2026-11-01; a regra inteira em `atendimento.md` §9.1): para quem tem o CRM
  ou "Sem responsável", pelo mesmo `trocarResponsavelCore`. O filtro
  "Responsável" do quadro marca "(inativo)" quem foi desativado e ainda é
  responsável por algum card. Prova: `e2e/equipe-desativar-repassa.spec.ts`.

**O filtro de situação do quadro** é "Já é cliente / Ainda não é cliente"
(2026-10-09; era "Convertidos / Não convertidos", que se lia como "ganho").
Olha só se a oportunidade tem um cliente ligado (`leads.client_id`, gravado
ao cadastrar o cliente pelo card, pelo inbox ou ao agendar pelo CRM) — não a
etapa nem o desfecho: há card ganho sem cliente e card perdido com cliente.
É SÓ filtro: a conversão do quadro é da oportunidade (as na etapa de ganho ÷
as do funil; sem etapa de ganho, "—" — `indicadores.md`, 2026-10-29).
Situação e período têm a forma dos outros filtros da barra (`PickerCompacto`
de escolha única com o MESMO marcador quadrado dos vizinhos — `marcadorQuadrado` —,
o gatilho mostra a escolhida, e sem divisor entre eles), e o período tem
"Personalizado": De/Até no rodapé do painel, que só filtra ao aplicar e
compara o DIA da criação no fuso do negócio (`dayKeyTZ`).

**O funil da rede NOVA** (`DEFAULT_STAGES`, `lib/crm.ts`, criado no primeiro
acesso por `seedDefaultFunnel`): Novo, Em contato, Avaliação, Em negociação,
Agendado, Fechado, Perdido. "Em negociação" entrou em 2026-10-21 (decisão do
Heitor) — as redes que já existiam não mudaram. Prova:
`tests/crm-etapas-padrao.test.ts`. O funil e as etapas nascem numa transação
só, com a rede travada (`crm_funil_padrao`, só `service_role`, migration
`20261027000071`; 2026-10-27): o primeiro acesso de vários ao mesmo tempo dava
"duplicate key uq_crm_funnels_default", e quem caísse entre as duas idas ao
banco deixava funil sem etapa. Prova: `e2e/crm-funil-padrao.spec.ts`,
`tests/crm-funil-padrao.test.ts`.

**O card não anda sozinho** (crm-05, revisão do Heitor de 2026-11-02: "não
existe movimento automático padrão nos funis; caso queiram, podem fazer isso
através do módulo de automações com as regras que quiserem, lembre-se, o
objetivo é ser o mais flexível possível"). Quem move é a pessoa (arraste,
painel do inbox, modal, Copilot) ou uma AUTOMAÇÃO da clínica ("Mover de
etapa", "Marcar ganho/perdido"). Agendar não leva mais o card à etapa
"Agendado" (era o A12, pela `crm_stages.marca`, que ficou sem leitor); a
linha do tempo continua dizendo que houve o agendamento. Para ter o
movimento, o modelo "Agendou: o card muda de etapa" (`automacoes.md`). As
redes que já existiam ficam com os funis e os cards como estão; o card só não
anda mais ao agendar. Prova: `e2e/crm-agendar-liga-oportunidade.spec.ts`.
**E nenhum outro fato move o card** (r2-cfg-04, o Heitor em 2026-11-03:
"nenhum card se movimenta sozinho, toda e qualquer automação deve ser feita
através dos módulos de automações"). Conferido em 03/11: a etapa
(`leads.crm_stage_id`) só é gravada por `moverEtapaCore` (a pessoa: arraste,
painel do inbox, mudar de funil, Copilot a pedido dela), `updateLead` (o modal)
e as ações de automação (`moverDeEtapa`, `marcarDesfecho`). Concluir o
atendimento, pagar, a conversa nova e o cadastro do cliente só escrevem na
linha do tempo (`CONVERTED`, `APPOINTMENT_CREATED`) ou ligam a ficha; nenhuma
função nem gatilho do banco grava a etapa (`crm_funil_padrao` só cria as
etapas). A trava é `tests/card-so-anda-pela-pessoa.test.ts`: gravar a etapa
em outro arquivo falha.

**Quem monta o funil é Configurações** (D-1, decisão do Heitor, 2026-10-29):
criar, renomear, reordenar, arquivar, apagar e escolher o padrão de funis e
etapas, a cor e o desfecho da etapa e os motivos de perda pedem
`settings: MANAGE` (mais `crm: VIEW`, de quem vê o quadro) — nas actions
(`actions/crm-funnels.ts`, `crm-stages.ts`, `crm-motivos.ts`) e na tela
("Configurar funis" só aparece com Configurações, nos dois portais). Mover os
cards, criar e editar oportunidades continua com quem opera o quadro
(`crm: MANAGE`). Antes bastava o CRM em Gerenciar, e a SDR mexia no funil da
clínica inteira. Prova: `e2e/crm-funis-pede-configuracoes.spec.ts`. E é da
REDE (H7, 2026-11-01): quem tem unidade fixa não configura o funil nem com
Configurações em Gerenciar (`recusaDaConfigDaClinica`; o botão some do quadro
da unidade). Prova: `e2e/permissoes-gerente-de-unidade.spec.ts`.

**O motivo da perda** (2026-10-21, decisão do Heitor). Levar a oportunidade
a uma etapa de desfecho `LOST` pela TELA pergunta "Por que perdeu?": um
motivo da lista da REDE (`crm_motivos_perda`, editada em Configurar funis →
"Motivos de perda"; desativar tira da escolha sem apagar) e uma observação
opcional. Vale no arraste do quadro, no painel do inbox (marcar perdida ou
escolher a etapa) e no modal do lead.
- Tudo passa por `moverEtapaCore` com `exigirMotivo: true` (`updateLeadStage`,
  `definirSituacaoOportunidade` — que até então gravava a etapa direto, sem
  linha do tempo nem evento de ganho/perda) ou por `camposDaPerda`
  (`updateLead`). Sem motivo, a action recusa.
- O Copilot e as automações movem sem perguntar: o lead fica sem motivo e
  conta como "Sem motivo" no relatório.
- No lead: `motivo_perda_id`, `motivo_perda_obs`, `perdido_em`; sair da
  etapa perdida limpa os três (a linha do tempo guarda o histórico, com o
  motivo na mudança do `STAGE_CHANGED`).
- Relatórios → Comercial → "Motivos de perda": `metrics_motivos_de_perda`
  (`getMotivosDePerda`), pelo `perdido_em` no período, da rede inteira. O
  quadro filtra por "Motivo da perda".
- Sem escolher o motivo o botão não fica apagado: diz "Escolha o motivo da perda" (A14), e "Outro" vem
  sempre por último na escolha (`motivosComOutroPorUltimo`, A15). O inbox vazio manda ligar o
  WhatsApp com atalho só para quem tem Configurações em Gerenciar; os outros leem "Peça a quem
  administra a clínica para conectar o WhatsApp" (A16).
- Rede nova nasce com Preço, Sem retorno, Fechou com outra clínica, Sem
  horário que sirva, Desistiu, Outro (gatilho `trg_motivos_perda_na_rede_nova`).
Prova: `e2e/crm-motivo-da-perda.spec.ts`.

**As origens do lead são da CLÍNICA** (A14 da 7ª simulação, 2026-11-05;
princípio 1, "a clínica decide"): eram uma lista fixa (`LEAD_SOURCES`), e a
Gardênia não tinha onde pôr "Feira de noivas". `crm_origens` (migration
`20261105003101`; RLS sem política permissiva, com as restritivas do suporte),
editada em Configurar funis → "Origens dos leads" como os motivos de perda
(`OrigensDoLeadConfig`, `actions/crm-origens.ts`: Configurações em Gerenciar,
da rede — H7). A rede nasce com as de sempre (Meta Ads, Google Ads, Orgânico,
Instagram, Indicação, WhatsApp, Telefone, Site, Evento, Outro — gatilho
`trg_origens_na_rede_nova`; as redes que já existiam ganharam as mesmas).
Desativar tira da escolha sem apagar. `leads.source` segue o NOME (texto): nada
se reescreve, e a origem do anúncio continua vindo da atribuição. Oferecem as
da clínica: o modal do lead (o select passou a controlado — a lista chega
depois de abrir), o painel do inbox (`useOrigensDaRede`), o Copilot
(`criar_oportunidade`) e a importação (acima). Prova:
`e2e/crm-atritos-da-7.spec.ts` ("A14"), `e2e/crm-funis-pede-configuracoes.spec.ts`.

**Enter grava o nome da etapa e do funil** (A11 da 7ª simulação): só gravava
ao sair do campo, e o Enter não fazia nada visível. Enter grava, Esc desfaz, a
linha diz "Salvo" (`data-etapa-salva`), e `renameStage`/`renameFunnel`
devolvem `{ error }` — a recusa aparece (o resultado era descartado). Prova:
o mesmo spec ("A11").

**O card diz o que a cliente ligada fez** (A18 da 7ª simulação, 2026-11-05):
"Agendado 06/11 10:30" (o próximo agendamento marcado dela,
`data-agendado-em`) e, quando ela COMPROU depois de a oportunidade nascer
(pacote, pré-pago ou plano aceito) e o card segue aberto, "Comprou Pacote X. A
oportunidade segue aberta." com "Mover para Fechado" (`data-sugere-ganho`). É
SUGESTÃO: nada se move sozinho (crm-05, princípio 6) — quem move é a pessoa,
no botão, pelo `updateLeadStage` de sempre. Uma ida ao banco para o quadro
inteiro (`crm_sinais_dos_clientes`, migration `20261105003102`, só
`service_role`; `lib/crm/sinais-do-card.ts`). **Os lembretes do CRM são avisos para a pessoa, nunca o card andando** (A42 e
A45 da 9ª simulação, 2026-11-07; princípio 6). Migration `20261107004302`.
- **O lembrete de retorno** (A42: a SDR só tinha as Observações para "ligar de
  novo na quinta"): o card tem "Lembrete de retorno" — "Retornar em" (o DIA,
  `leads.retornar_em`) e "O que fazer no retorno" (`retornar_obs`), no "Novo
  lead" e na edição (`diaDoRetorno`, `lib/crm/retorno.ts`) — e o quadro diz
  "Retornar 12/11", "Retornar hoje" (aviso) ou "Retorno atrasado (10/11)"
  (`[data-retornar-em]`, `textoDoRetorno`). No dia, o cron `crm-lembretes` (de
  hora em hora) avisa o RESPONSÁVEL no sino: "Retorno de hoje: X" a partir das
  7h de Brasília (o de madrugada tocaria o celular), ou "Retorno atrasado: X
  (10/11)"; uma vez por dia marcado (`retorno_avisado_em`, reivindicado antes
  de sair; trocar a data o zera). Card ganho ou perdido não avisa; sem
  responsável, não há a quem avisar (o card mostra).
- **O ganho a marcar** (A45: a SDR criou o lead, outra pessoa vendeu o plano, e
  o card ficou em "Mover para Fechado"): quando a cliente ligada compra (pacote,
  pré-pago ou plano aceito) com a oportunidade aberta — a régua da sugestão do
  card (A18 da 7ª) —, o responsável recebe "Marque o ganho: X — X comprou Plano
  Y, e a oportunidade dela segue aberta…" (`crm_lembretes_de_ganho`, só
  `service_role`; uma vez por oportunidade, `ganho_lembrado_em`). As que já
  estavam assim no dia da migration foram marcadas como lembradas (o card já
  sugeria).
- O aviso abre o card: `data.caminho` (`/admin/oportunidades?lead=` ou o da
  unidade do responsável), que o sino da equipe mostra como "Abrir" (só caminho
  deste app, `caminhoInterno`).
- Prova: `e2e/crm-lembretes.spec.ts` (o cron, uma vez cada, sem mover o card),
  `e2e/crm-atritos-da-9.spec.ts` ("A42", o campo e o card).

**O resumo do quadro diz a base e leva aos perdidos** (A44 da 9ª simulação,
2026-11-07): "0,0% de conversão: 0 ganhas de 7 oportunidades do funil (abertas,
ganhas e perdidas)" (`ResumoDoQuadro`, `[data-resumo-do-quadro]`) — era "0 de 7
ganhas", sem dizer que a base é todo lead; e o "N perdidos" é um botão que leva
à coluna de desfecho LOST, fora da primeira dobra (`IrParaOsPerdidos`). A
conta não mudou. **"Ir para a conversa" sem canal diz que não há canal** (A43):
sem conversa da pessoa e sem WhatsApp conectado (`redeTemWhatsapp`),
`openLeadConversation` não cria mais a conversa de WhatsApp com o banner "não
está conectado": diz "Ainda não há conversa com X, e a clínica não tem um
WhatsApp conectado…", com o caminho (Configurações → Integrações, ou pedir a
quem administra). Prova: `e2e/crm-atritos-da-9.spec.ts` ("A43", "A44").

**A idade do card é pelo DIA de Brasília** (D12 da 12ª simulação, 2026-11-11;
princípio 3): o lead criado às 23:20 de 10/11 dizia "hoje" às 00:05 de 11/11 —
era `differenceInDays`, 24 h corridas. "hoje", "ontem" e "há N dias" são os
dias de calendário (`idadeDoLead`, `lib/crm/idade-do-lead.ts`, por `dayKeyTZ`).
Prova: `tests/defeitos-da-12.test.ts` ("D12").
**Ganhar ou perder sem rolar**
(A19): a 1440 px as colunas de desfecho ficam fora da tela; o menu do card tem
"Marcar como ganho (Fechado)" e "Marcar como perdido (Perdido)", e arrastando
um card aparece embaixo "Soltar em Fechado / Soltar em Perdido"
(`data-soltar-desfecho`) — soltar ali é soltar na coluna (o perdido pergunta o
motivo). Prova: o mesmo spec ("A18", "A19").

**Nome e telefone são da pessoa, e as cópias acompanham** (2026-09-28). A conversa
e a oportunidade guardam cópia, e a edição em qualquer
um dos dois lugares — painel do inbox (`atualizarContato`) ou card da
oportunidade (`updateLead`) — passa por `propagarDadosDaPessoa`
(`lib/contatos/propagar.ts`):
- **nome** → a pessoa, TODAS as conversas e TODAS as oportunidades;
- **telefone** → a pessoa (que passa a ser achada pelo número novo) e as
  conversas com o MESMO número antigo ou sem número. Conversa com outro número
  é outro WhatsApp da pessoa, e ali o telefone é o DESTINO da mensagem: não
  muda. Nas oportunidades vai para todas;
- cada oportunidade que mudou registra o de → para na linha do tempo.
Prova: `e2e/contato-propaga.spec.ts`. Editar cópia sem passar por aí é o
defeito de volta.
**A ficha renomeada também propaga** (A21 da 7ª simulação, 2026-11-05: o card
seguia "Lead 3 Cardoso" com a ficha já "Patrícia"): `atualizarClienteCore`
(a aba Dados e o Copilot), quando o nome muda, leva-o às pessoas ligadas à
ficha — pelas oportunidades (`leads.client_id`) e pelas conversas
(`conversations.client_id`) — pelo mesmo `propagarDadosDaPessoa`. Prova:
`e2e/crm-atritos-da-7.spec.ts` ("A21").

**A tela lê o NOME da pessoa, não a cópia** — lista, busca (`inbox_pagina`),
card do contato, "virar cliente", template, agendamento pelo CRM e o evento da
conversa (embed `pessoa:contacts!conversations_contato_id_fkey(name)`; a cópia
só na falta). O **telefone da conversa não é cópia**: é o destino daquela thread,
e é dele que o envio, a lista e o card leem. Prova:
`e2e/inbox-nome-da-pessoa.spec.ts` (a pessoa renomeada com a cópia velha).

Em teste, limpar conversa é `apagarConversas()` de `e2e/apoio/banco.ts`, que tira
o contato junto.

**Os atritos do CRM da 11ª simulação** (2026-11-10; princípios 3 e 1):
- **O "Agendar" da oportunidade traz o procedimento** (A1: a Tatiane abria o
  Agendar da Beatriz, interessada em Bioestimulador, e tudo vinha em
  "Selecione…"). O `ScheduleModal` (o card do quadro e o painel do inbox) recebe
  os procedimentos de interesse e escolhe o primeiro que a unidade oferece; sem
  interesse no card, a AVALIAÇÃO da unidade quando há UMA (categoria "Avaliação"
  ou o nome) — `sugestaoDoAgendar`, `lib/crm/sugestao-do-agendar.ts`. A tela diz
  de onde veio (`[data-procedimento-sugerido]`); a pessoa troca à vontade, e o
  crédito já pago continua fixando o dele.
- **A aba que o cargo não abre avisa** (A2: `?aba=fichas` da Comercial caía calado
  na Visão geral): "Seu cargo não abre a aba Prontuário desta ficha: abrimos a
  Visão geral." (`[data-aba-sem-acesso]`, `ClientProfile`). A regra de quem vê
  não mudou.
- **O menu "…" do card move de etapa** (A3: só tinha ganho e perdido; no celular
  arrastar pesa): "Mover para a etapa" lista as outras etapas ABERTAS do funil
  (`[data-mover-para-etapa]`), pelo `updateLeadStage` de sempre — e a recusa
  (antes descartada) volta o card e diz por quê.
- **O card da cliente que comprou diz o VENDIDO** (A4: depois do plano de
  R$ 8.400, o card da Beatriz seguia com R$ 2.600, o preço do procedimento de
  interesse). Com a compra que o card já sugere marcar como ganho (A18 da 7ª),
  o valor do card é o vendido dela — "R$ 8.400,00 vendido"
  (`[data-valor-vendido]`): o pacote menos o cancelado, o pré-pago, o plano
  (a soma dos procedimentos vendidos menos o cancelado). `crm_sinais_do_quadro`
  (migration `20261110005501`, só `service_role`) é a conta de
  `crm_sinais_dos_clientes` com o valor ao lado; a de antes ficou para o cron
  dos lembretes. Nada se move sozinho (princípio 6).
- Prova: `e2e/crm-atritos-da-11.spec.ts`, `tests/crm-sugestao-do-agendar.test.ts`.

---

## O que nunca fazer aqui

```
❌ Gerar exportação de LGPD dentro do request — usar after() + o cron de retomada
❌ Entregar pacote de LGPD com consulta que falhou em silêncio — no export, erro aborta
❌ Ler os insumos do atendimento de medical_record_entries.products_used (nada grava ali) — moram no estoque: o movimento PROCEDURE_USAGE do appointment_id (D18 da 8ª)
❌ Tratar a conversa como a pessoa — a pessoa é contacts, a conversa é uma thread
❌ Editar nome/telefone numa cópia (conversa, oportunidade) sem propagarDadosDaPessoa
❌ Buscar oportunidades por leads.conversation_id (é a thread de ORIGEM; a dona é contato_id)
❌ Ler leads pela SESSÃO numa tela que roda na unidade (a política de leitura só deixa passar quem é da rede, e o lead é sempre da rede: o quadro da unidade via "0 leads" até 2026-10-20) — o servidor lê pelo cliente de serviço, com a rede e o ownerFilter na consulta
❌ Agrupar a fila do inbox por pessoa — é uma linha por conversa (decisão de 2026-09-26)
❌ Ler tags de conversations.tags (é semente; a fonte é contacts.tags)
❌ Procurar "o anúncio do cliente" na conversa mais recente em vez da mais recente COM anúncio
❌ Ligar conversa a contato no TypeScript (é gatilho; senão o próximo ponto esquece)
❌ Filtrar por canal ou caixa ao procurar o contato (é o cruzamento que interessa)
❌ Mostrar o nome da conversa (contact_name) em vez do da pessoa (contacts.name)
❌ Oferecer apagar oportunidade (lead) — a que não vai adiante é marcada perdida
❌ Mover o card sozinho por um fato do sistema (agendar, concluir, pagar) — "não existe movimento automático padrão nos funis": é a automação da clínica (crm-05)
❌ Levar lead a etapa perdida pela tela sem o motivo, ou gravar crm_stage_id fora de moverEtapaCore / camposDaPerda (o motivo e o perdido_em ficam velhos)
❌ Importar (planilha, lote) emitindo evento de domínio, ou trocando dado que a ficha já tem
❌ Recusar a linha da planilha por um campo OPCIONAL ilegível (CPF, e-mail, data, unidade, etapa…): ela entra sem ele, com o aviso — só o impossível recusa (D2 da 8ª, princípio 2)
❌ Gravar a "última visita" da planilha como atendimento (inventa agendamento, receita e comissão): é clients.ultima_visita_antes (F35)
❌ Contar como cliente nova do mês a ficha importada com "cliente desde" de antes — é coalesce(cliente_desde, created_at)
❌ Escrever "Cliente desde" pelo created_at, ou ler cliente_desde com new Date (vira a véspera): é lib/clientes/cliente-desde.ts (D6 da 10ª)
❌ Gravar telefone importado fora do formato do WhatsApp (55 + DDD + número, só dígitos) — a pessoa não se acha depois
❌ Escrever "Dono" na tela para o responsável da oportunidade (é "Responsável" em todo lugar)
❌ Trocar leads.owner_id fora de trocarResponsavelCore (o histórico perde o "de")
❌ Ler o owner_id vazio sem a marca _responsavelNaTela como "Sem responsável", ou abrir o "Novo lead" com um Responsável diferente do que a tela vai mandar (D1 da 11ª)
❌ Oferecer tag de uma lista fixa (CLIENT_TAGS) ou do que está em uso — é o vocabulário da rede (tagsAtivasDaRede)
❌ Oferecer a origem do lead da lista fixa (LEAD_SOURCES) onde a clínica escolhe — são as origens dela (crm_origens: origensDaRede, useOrigensDaRede); LEAD_SOURCES fica para a atribuição do anúncio e o fallback (A14 da 7ª)
❌ Dizer "hoje"/"ontem" de um registro por 24 h corridas (differenceInDays) — é o dia de Brasília (idadeDoLead, dayKeyTZ — D12 da 12ª)
❌ Mover o card porque a cliente comprou — o card SUGERE ("Mover para Fechado"), quem move é a pessoa (A18 da 7ª, crm-05)
❌ Renomear a ficha sem levar o nome às pessoas ligadas a ela (atualizarClienteCore → propagarDadosDaPessoa — A21 da 7ª)
❌ Renomear tag com update à mão em uma tabela só (é renomear_tag, nas quatro, numa transação)
❌ Gravar a ficha da cliente (dados, anotações, arquivar) pela SESSÃO — a RLS recorta pela unidade de cadastro e a cliente é da clínica: é pelo servidor, com a rede na consulta
❌ Lançar a trava de módulo (assertPermission) num layout.tsx de seção: sai antes do streaming e a resposta é 500 — o layout sem o módulo só deixa passar a página, e a trava é dela (D11 da 7ª)
❌ Recusar o acesso ao app de quem tem passaporte ou RNE, ou escolher a senha inicial fora de documentoDoAcesso (o CPF, senão o documento da ficha — decisão 1 da 7ª)
❌ Ligar a ficha à conta de outra clínica sem o MESMO documento (login_de_cliente_para_ligar_doc: o CPF, ou o tipo e o número do passaporte/RNE)
❌ Barrar o cadastro ou o atendimento da menor sem responsável (é aviso — princípio 2), ou decidir "menor" fora de ehMenorDeIdade
❌ Oferecer cadastrar ou editar cliente a quem tem Clientes em Ver, ou recusar isso lançando semAcesso dentro do useActionState (é { error: SO_CONSULTA_CLIENTES })
```
