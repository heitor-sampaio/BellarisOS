# Eventos de domínio e automações

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.9 Eventos de domínio e automações

Toda ação relevante do sistema vira um fato em `domain_events` — 47 eventos
nomeados pela **intenção** (`agendamento.nao_compareceu`), catálogo tipado em
`packages/types/src/eventos.ts`. As automações assinam essa corrente.

- **O emissor mora em `lib/events/`, fora de `actions/`.** Todo export de um
  arquivo `'use server'` vira endpoint público, e um gravador exposto assim
  deixaria qualquer cliente forjar a corrente que dispara as automações. Vale
  igual para o motor: em `actions/automacoes.ts` só entra LEITURA.
- **Acrescentar nome ao catálogo sem emissor quebra o teste** — de propósito:
  catálogo prometendo evento que ninguém emite faz a automação ser montada e
  nunca disparar.
- **Retenção de 30 dias.** A corrente é uma janela, não arquivo: automação que
  precise olhar mais para trás consulta o dado de negócio.
- **Eventos clínicos não carregam conteúdo clínico**, e o contexto da automação
  também não hidrata prontuário. A automação avisa que a ficha chegou; quem
  precisa do conteúdo abre o prontuário, com a permissão que ele exige.
- `pagamento.*`, `estoque.*`, `comissao.liberada` e `comissao.paga` saem de GATILHO ou função no banco (`origem: 'banco'`, sem
  ator), porque esses fatos nascem em cinco ou seis lugares do código e
  instrumentar um a um é garantir esquecer o próximo.
- **`pagamento.estornado` é só do que estava PAGO** (achado da F2b,
  migration `20261101001003`): a parcela nunca paga que cai como
  `Estornada` (o crediário que o cancelamento do pacote derruba, a venda de
  produto toda a receber cancelada) não emite — uma automação nesse evento
  avisaria a cliente de um estorno que não houve. Prova:
  `e2e/financeiro-estorno-evento.spec.ts`.
- **A campanha é AVISO NO CELULAR (push), e a tela diz isso** (D-3, decisão do
  Heitor, 2026-10-29: "O WhatsApp fica para o futuro."). Ela chega a quem tem
  um aparelho registrado (`push_tokens`, o app; `web_push_subscriptions`, o
  navegador) e fica no sino do portal. A lista, a criação e o detalhe mostram
  `<CanalDaCampanha>` ("não vai pelo WhatsApp"), e o público mostra os dois
  números — quantas no público e quantas RECEBEM (`publico_com_aparelho`, o
  mesmo critério do disparo). Prova: `e2e/campanha-aviso-no-celular.spec.ts`.
- **Não há gatilho "Retorno vencendo"** (aut-04, 2026-11-02): o
  `agendamento.retorno_vencendo` e o cron `retornos` saíram com o "Retorno em N
  dias" (`atendimento.md` §10). O retorno é um agendamento novo; o gatilho de
  quem quer avisar é o do próprio agendamento.
- **Campanha ≠ automação.** Campanha é disparo em massa por público; automação
  é reação a um fato. São dois produtos, e nada migra de um para o outro.
- **A fila do motor é `automation_runs`**, no Postgres — não há broker no
  projeto. O disparo é imediato (`after()`); o cron recolhe o que espera, o que
  falhou e o que é de tempo.
  - ⚠️ **Tirar trabalho da fila exige REIVINDICAR a linha**, não só selecionar.
    `retomarPendentes` faz isso com um compare-and-swap em `tentativas`
    (`.eq('tentativas', lido)`) que, na MESMA escrita, põe o run em `rodando`
    (só se ainda estiver `esperando`/`falhou`). Sem tirar da fila, a passagem
    que lesse DEPOIS da reivindicação via o run ainda esperando, com a
    tentativa já somada, e o CAS dela também passava (2026-09-30). E
    `dispararAgendas` com um em
    `ultimo_disparo_agenda`: quem escreve primeiro leva, e quem não muda linha
    nenhuma passa adiante. Sem isso, duas passagens concorrentes do cron —
    normal, porque o serviço roda de 5 em 5 minutos e uma fila grande passa
    disso — executam o MESMO run duas vezes. Num aviso é ruído; numa ação de
    mensagem é o cliente recebendo a mesma coisa duas vezes.
- **O gatilho de tempo tem duas famílias**: intervalo (`minutos`, `horas`, conta
  a partir do último disparo) e relógio (`diaria`/`semanal`/`mensal`, num
  horário do dia). Cada uma usa o seu campo — `intervalo` ou `hora` — e o outro
  não vai para o grafo. **O piso do intervalo é `INTERVALO_MINIMO_MIN` (5 min),
  que é o ritmo do cron**: prometer menos é prometer o que o relógio não
  entrega. Quem controla a repetição é `automations.ultimo_disparo_agenda`, e a
  marca é gravada ANTES de executar, conferindo quantas linhas mudou.
- **Cada salvamento deixa um retrato em `automation_versions`** (os últimos 30).
  Voltar para uma versão **carrega** o fluxo dela no editor e não grava nada —
  salvar continua sendo explícito, e o retrato de onde se veio permanece. O
  histórico é append-only: restaurar gera a versão seguinte, nunca apaga.
- **Três travas contra o anel**: origem `'automacao'`, `profundidade` com teto
  de 3, e índice único `(automation_id, evento_id)`. Ação de automação que
  emite evento **passa a profundidade adiante** — sem isso, um grafo em anel
  manda mensagem ao cliente em laço.
- **Tudo se propaga.** O contexto da execução carrega o payload do gatilho
  (`evento.dados.*`) e **o que cada passo deixou** (`passos.<nome do passo>.*`);
  qualquer node à frente lê os dois, em condição ou em `{{variável}}`.
  - O **nome do passo** (`NoDoGrafo.nome`) é a chave — por isso ele é único no
    grafo e a validação recusa nome repetido ou referência a passo que não é
    antecessor. Renomear depois de citar quebra a referência, e é o validador
    que avisa.
  - **O que cada node produz se declara em `DADOS_DO_NO`**, e o que cada evento
    carrega em `CAMPOS_DO_EVENTO` (`packages/types`). Node ou evento sem
    entrada ali funciona, mas fica invisível para quem monta o fluxo — que é o
    mesmo erro mudo do gatilho que nunca dispara.
  - A tela soma a essas listas os campos **vistos no último fato real**
    (`amostraDoEvento`): `dados` tem índice livre e nenhum catálogo cobre tudo.
  - **Renomear um passo reescreve quem o citava** (`renomearPasso`). A troca é
    por segmento inteiro: renomear "Mandar mensagem" não pode mexer no que cita
    "Mandar mensagem 2".
- **Campo de condição aceita EXPRESSÃO**, não só caminho — decisão do Heitor em
  2026-09-24, que abriu o "condição é construtor, não linguagem" original. A
  lista de campos continua sendo o caminho normal da tela; a expressão é a saída
  para o que ela não cobre.
  - `lib/automacoes/expressao.ts` é o avaliador: analisador próprio, **sem
    `eval` e sem `new Function`**. O texto vem do banco e roda no servidor
    dentro do motor — ali um `new Function` seria execução remota de código a um
    `update` de distância. Funções só as da lista fechada; `__proto__`,
    `constructor` e `prototype` não são navegáveis.
  - **Expressão quebrada devolve vazio, não derruba o run** — parar um fluxo no
    meio dos efeitos por um erro de digitação seria pior. Quem reclama é o
    validador, antes de ativar.
  - Toda leitura de campo passa por `valorDoCampo`, e toda hidratação por
    `caminhosDoCampo`: ler à mão com `lerCaminho` volta a ignorar expressões, e
    o texto sai vazio sem nada explicar.
- **A oportunidade de um fato de CONVERSA vem da conversa** (`contexto.ts`,
  `oportunidadeDaConversa`): os eventos de conversa não carregam `leadId`, então
  o motor usa a ligada à thread (`conversations.lead_id`) e, sem ela, a aberta
  mais recente da PESSOA. Até 2026-09-27 mover etapa, desfecho, responsável e
  anotar num fluxo de "mensagem recebida" terminavam sempre em "sem
  oportunidade" — e o editor oferecia os quatro.
- **A oportunidade de um fato de CLIENTE vem da cliente** (crm-05, 2026-11-03;
  `oportunidadeDaCliente`): sem `leadId` no fato e sem conversa, é a
  oportunidade ABERTA mais recente da cliente (`dados.clienteId`) — ganho e
  perdido não entram. O `agendamento.criado` leva o `leadId` da oportunidade
  a que o agendamento se ligou (o card por onde se agendou). É o que deixa a
  clínica montar o movimento que o sistema deixou de fazer sozinho
  ("Agendamento criado → Mover de etapa", "Atendimento concluído → Mover para
  Fechado"): "não existe movimento automático padrão nos funis" (`crm-inbox.md`).
  O modelo "Agendou: o card muda de etapa" (`agendou-move-o-card`) nasce com a
  etapa vazia — a validação não deixa ligar até a clínica escolher a do funil
  dela. **Ele nasce DESLIGADO e só se a clínica o pedir** (r2-cfg-04, o
  Heitor em 2026-11-03: "pode manter o modelo, desativado, rede usa se
  quiser"): não há semente de automação na rede nova (`semearRede`,
  `crm_funil_padrao` e os gatilhos de `tenants` não criam automação); ele só
  existe quando alguém escolhe "Usar um modelo", e nasce RASCUNHO, como todo
  modelo. Em 03/11 nenhuma rede real o tinha (a única automação de mover
  etapa fora das `[e2e]` é um rascunho da Bellaris Clinic de 24/09). Prova: `e2e/crm-agendar-liga-oportunidade.spec.ts`,
  `tests/automacoes-modelos.test.ts`.
- **"Definir responsável"** (`acao.atribuir`) usa o núcleo da tela,
  `trocarResponsavelCore` (`lib/crm/responsavel.ts`): a pessoa é da rede e
  ATIVA, e a linha do tempo diz de quem para quem (até 2026-10-09 o "de" era
  sempre vazio). Regra do responsável em `crm-inbox.md`.
- O node guarda o desfecho em português (`ganho`/`perdido`); a etapa, no
  código do banco (`WON`/`LOST`). Comparar os dois direto nunca acha etapa.
- **O seletor mostra o que está NA CONFIG** (D16, 2026-10-28): o passo "Mandar mensagem" nasce
  com `canal: 'whatsapp'` gravado (`configPadrao`, `lib/automacoes/ids.ts`); o salvo sem canal mostra
  "Escolha o canal…" — nunca um WhatsApp que a config não tem (a validação continua exigindo o canal).
  Prova: `e2e/automacoes-canal-gravado.spec.ts`.
- **Modelos prontos são OPÇÃO, ao lado do "Nova automação"** (D-4, decisão do
  Heitor, 2026-10-29): "Nova automação" continua começando vazia; "Usar um
  modelo" lista `MODELOS_DE_AUTOMACAO` (`lib/automacoes/modelos.ts` —
  aniversário, retorno depois do atendimento, lembrete antes do agendamento e,
  desde o crm-05, "Agendou: o card muda de etapa") e
  `criarAutomacaoDeModelo` grava o grafo DO SERVIDOR (o navegador manda só a
  chave), em RASCUNHO, para a clínica revisar. O procedimento fica no passo
  "Se", nunca no gatilho. Modelo novo usa só nodes e eventos do catálogo, e
  nasce com tudo ligado (`tests/automacoes-modelos.test.ts` confere).
- **Regra do "Se" sem valor não liga** (D-4): "Procedimento é ___" nunca é
  verdade; o validador acusa erro em toda regra que compara (tudo menos "está
  vazio"/"está preenchido") sem valor. É o que segura o modelo de retorno até
  a clínica escolher o procedimento. Prova: `e2e/automacoes-modelos.spec.ts`.
- **Sem WhatsApp conectado, a mensagem vai como aviso no celular** (A14 da 5ª
  simulação, 2026-11-03). "Conectado" = um `whatsapp_numbers` ATIVO da rede
  (`redeTemWhatsapp`, `lib/automacoes/canal-da-rede.ts`, só no servidor). A
  janela de modelos avisa, e o modelo nasce com `canal: 'push'`
  (`semWhatsapp`, `lib/automacoes/modelos.ts`). O passo "Mandar mensagem"
  ganhou o canal **Aviso no celular (push)** — `notifyClient`: o sino do
  portal, o app e o navegador da cliente, sem conversa (a resposta não chega
  no inbox); o título é o nome da clínica. O passo em WhatsApp numa rede sem
  número mostra o aviso com "Mandar como aviso no celular".
- **O seletor de campo não repete rótulo**, e o card diz o campo em
  português (A14): o rótulo repetido leva de onde vem — "Situação do
  agendamento", "Procedimento (do gatilho)" (`rotulosUnicos`); o card usa
  `rotuloDoCaminho` ("Procedimento é Botox", nunca
  "evento.dados.procedimentoNome é"), e a expressão escrita à mão passa como
  está. Nos campos de procedimento (`CAMPOS_DE_PROCEDIMENTO`) com "é" / "não
  é", o valor sai da lista dos procedimentos ativos da rede — o salvo que
  saiu da lista aparece "(fora da lista)". Prova:
  `e2e/automacoes-modelo-retorno-atritos.spec.ts`.
- **O passo novo nasce LIGADO ao anterior** (J-14, 2026-10-30): o anterior é o
  passo aberto no painel ou, sem nenhum, o último que entrou; a ligação sai da
  primeira saída livre dele (no "Se", a Sim, depois a Não), e o passo nasce na
  altura dela (`encaixarPasso`, `lib/automacoes/encaixe.ts`). Gatilho e saída
  já usada não se ligam: o passo nasce solto, sem desfazer nada. O quadro
  enquadra o passo novo com o anterior (nunca atrás do painel) e só se
  reenquadra quando a LARGURA muda — a faixa de problemas encolhendo depois
  da primeira ligação deslocava tudo. Prova: `e2e/automacoes-quadro-encaixe.spec.ts`.
- **Sair do editor com alteração solta pergunta antes** (A12 da 7ª simulação,
  2026-11-05: a Camila montou o fluxo, clicou em "Automações" e o perdeu sem
  aviso). Salvar continua EXPLÍCITO (acima); o "Salvar" fica sempre na barra
  (desligado sem nada a salvar, com "Salvo"/"Não salvo" ao lado — só aparecia
  depois de mexer), e um link do app com a tela suja abre "Sair sem salvar?"
  com "Sair sem salvar", "Continuar editando" e "Salvar e sair"
  (`useAvisoAoSair`, `lib/use-aviso-ao-sair.ts`; fechar a aba ou recarregar
  usa o aviso do navegador). **A lista diz a situação em palavra** (A13):
  "Rascunho", "Desligada" ou "Ligada" ao lado do nome
  (`data-situacao-da-automacao`; o círculo apagado não dizia nada). Prova:
  `e2e/crm-atritos-da-7.spec.ts` ("A12/A13").
- **O "Revisar" da campanha diz o filtro do público** (A15 da 7ª simulação: só
  "0 clientes", sem dizer que era a tag VIP): "Filtros do público: Tags: VIP ·
  Só quem tem o app" (`filtrosDoPublico`, `lib/notifications/resumo-do-publico.ts`,
  `data-filtros-do-publico`); sem filtro, "todas as clientes ativas". Prova: o
  mesmo spec ("A15"), `tests/campanha-filtros-do-publico.test.ts`.
- **Cada regra gravada do público chega à prévia E ao disparo** (D1 da 9ª
  simulação, 2026-11-07, ALTA: a "Reativação 60 dias" gravava
  `max_days_since_visit: 60` e nem a prévia nem o disparo o liam — ativada,
  iria a TODA cliente, e o "Revisar" dizia "Vieram nos últimos 60 dias"). A
  conta é UMA, `filtrosDaCampanha` (`lib/notifications/filtros-da-campanha.ts`),
  usada pela prévia (`previewAudienceCount`), pelo disparo
  (`dispatchCampaignInline`: a imediata, a agendada e a data anual) e pelo
  cron das automáticas: o aniversário lê todas as regras (lia só a unidade e o
  app), e o "dias depois da visita", o "antes do agendamento" e o "antes do
  pacote vencer" passam as clientes do fato por `clientes_do_publico` com
  `client_ids` (não liam regra nenhuma). **"Sem visita há mais de N dias"** =
  nenhum atendimento concluído desde N dias atrás (nem a última visita do
  sistema de antes) E cliente da clínica de antes disso
  (`cliente_desde_antes`: `coalesce(cliente_desde, created_at)` — a cadastrada
  ontem não "sumiu", a régua do "Reativar clientes"); o resumo diz "Sem visita
  há mais de 60 dias". "Com ao menos N visitas" (`min_visits`) conta os
  concluídos. Migration `20261107004301`. Regra nova em `AudienceRules` sem
  leitor em `filtrosDaCampanha` quebra
  `tests/campanha-filtros-chegam-ao-disparo.test.ts`. Prova (uma regra por
  teste, a prévia e o disparo): `e2e/campanha-cada-filtro-chega.spec.ts`; as
  automáticas pelo cron: `e2e/campanha-aniversario.spec.ts` ("D1").
- **O gatilho da campanha automática começa SEM escolha, e a tela diz quando
  ela sai** (D8 da 11ª simulação, 2026-11-10; princípios 3 e 6: a
  "Reativação 60 dias" da Marta nasceu com o gatilho "Aniversário", que vinha
  marcado, e só sairia no aniversário de quem sumiu). Nenhum gatilho vem
  marcado (`aria-pressed`, "Escolha quando a campanha sai…",
  `[data-escolha-o-gatilho]`), e o "Próximo" espera a escolha. A revisão e os
  detalhes da campanha dizem "Dispara: 60 dias depois do último atendimento da
  cliente, a partir das 09:00" (`[data-quando-dispara]`, `quandoDispara`,
  `lib/notifications/quando-dispara.ts`). E a hora é verdade: os gatilhos do
  DIA (aniversário, data comemorativa, depois da visita, antes de o pacote
  vencer) saem a partir das 09:00 da clínica (F62b: o fuso da rede;
  o silêncio noturno e o teto, o da unidade da mensagem; o "aniversário
  hoje" do contexto, o da unidade da cliente) (`jaEhHoraDeDisparar`, no cron
  `notification-campaigns`; `?hora=` é a costura do teste) — saíam logo
  depois da meia-noite, e o aviso tocava o celular da cliente de madrugada. O
  lembrete do agendamento segue de hora em hora. Prova:
  `e2e/campanha-defeitos-da-11.spec.ts`, `tests/campanha-quando-dispara.test.ts`.
  **Os 30 dias que o "Pós-visita" e o "antes do vencimento" trazem dizem que
  são sugestão** (A6 da 12ª simulação, 2026-11-11; princípio 3): "30 dias é
  uma sugestão: ajuste ao retorno dos seus procedimentos."
  (`[data-dias-sugestao]`, na campanha nova). Prova:
  `e2e/configuracoes-atritos-da-12.spec.ts` ("A6/A24").
- **O construtor fala português, e o modelo dito pronto não avisa à toa** (A18
  da 11ª simulação, 2026-11-10; princípio 3: o "Lembrete antes do agendamento"
  dizia "Esperar até 1d antes de evento.dados.agendadoPara" e "não é nenhum de
  CANCELLED, NO_SHOW, COMPLETED", e avisava "Só um lado da condição está
  ligado"). O card da espera diz "1 dia antes de “Data e hora do agendamento”"
  (o campo por `rotuloDoCaminho`, o tempo por extenso); a condição diz as
  situações pelo nome ("Cancelado, Não compareceu, Concluído" — `VALOR_TEXTO`,
  `lib/automacoes/resumo.ts`), e o painel as escolhe por nome
  (`[data-situacoes-da-regra]`, `SITUACOES_DO_AGENDAMENTO`); o relógio diz o dia
  ("Todo mês, dia 1, às 09:00"). O "Se" com uma saída só que termina DE
  PROPÓSITO (`ConfigCondicaoSe.outroLadoTerminaDeProposito`: os modelos de
  lembrete e de retorno; no painel, "o outro caminho termina aqui de
  propósito") não leva o aviso; o montado à mão continua avisando.
- **O modelo de reativação** (A19 da 11ª: não havia, e a "Reativação 60 dias"
  da Marta virou campanha de aniversário): "Reativação de quem sumiu" —
  todo mês, dia 1, às 9h, busca quem está sem atendimento há mais de 60 dias e
  manda o convite. Quem continua sumida recebe de novo no mês seguinte, e a
  descrição diz isso. Nasce RASCUNHO, como todo modelo (princípio 6).
- **Quem receberia hoje, fora do assistente** (A21 da 11ª): o detalhe da
  campanha (rascunho, ativa ou pausada) mostra o público e quantos recebem
  (`AudiencePreview`, a conta do disparo — `[data-quem-receberia-hoje]`, a quem
  tem o Marketing em Gerenciar); o passo "Buscar clientes" da automação diz
  "Hoje, a busca acharia N clientes" (`contarBuscaDeClientes`, só LÊ, a
  `buscarClientes` do motor — `[data-quem-acharia-hoje]`). E a prévia do título
  da campanha diz que "Ana" é um nome de EXEMPLO (`[data-previa-do-titulo]`).
- **Na campanha automática, "Quem receberia hoje" é o GATILHO de hoje** (D10 da
  12ª simulação, 2026-11-11; princípio 3: o Aniversário e o Pós-visita 7 dias
  diziam "12 clientes no público" — o público inteiro — quando ninguém fazia
  aniversário nem fez 7 dias da visita). O detalhe diz quantas o gatilho escolhe
  HOJE e quantas têm o app ("1 aniversariante hoje · 1 vai receber o aviso no
  celular", ou "Hoje ninguém do público faz aniversário: a campanha não sai para
  ninguém hoje." — `[data-receberiam-hoje]`), e o público inteiro fica numa
  linha à parte, "Público da campanha" (`AudiencePreview`). A escolha é UMA, a
  do cron: `lib/notifications/gatilho-de-hoje.ts` (`aniversariantes`,
  `concluiramNoDia`, `pacotesVencendoNoDia`, `agendadosNaJanela`, todas pelo
  público da campanha) — o cron `notification-campaigns` passou a usá-las, e o
  detalhe lê `quemReceberiaHoje`. O lembrete do agendamento conta o resto do dia
  (de agora ao fim de hoje, mais a antecedência); a data comemorativa, o público
  inteiro só no dia dela. A imediata e a agendada seguem com o público.
  Prova: `e2e/campanha-defeitos-da-12.spec.ts`.
- **As ações da lista de campanhas têm nome** (A22 da 11ª: "Ativar" e
  "Arquivar" eram ícones lado a lado): "Ver", "Ativar", "Pausar", "Arquivar"
  escritos no botão. Prova: `e2e/automacoes-atritos-da-11.spec.ts`,
  `tests/automacoes-atritos-da-11.test.ts`.
- **Automações e Campanhas são da clínica, e ficam só no portal da rede**
  (D-2, decisão do Heitor, 2026-10-29: "a automação é da clínica, mesmo que o
  alvo seja a unidade"). Não há tela delas em `/[slug]`; quem tem unidade fixa
  não as alcança, tenha o módulo que tiver. A tela de Cargos diz isso na linha
  de Marketing e de Automações, ligadas ou não (`SO_NA_REDE_NOTE`,
  `lib/permissions-copy.ts`; os dois em `NETWORK_ONLY`). Prova:
  `e2e/permissoes-config-atritos.spec.ts`.
- Prova de ponta a ponta: `e2e/mensagens-saida.spec.ts` — webhook real →
  automação → resposta pela caixa falsa + os quatro efeitos no card.

---

## O que nunca fazer aqui

```
❌ Avaliar expressão de automação com eval/new Function (o texto vem do banco)
❌ Montar o filtro do público da campanha à mão (branch_ids: rules.branch_ids…) — é filtrosDaCampanha, senão a regra nova fica sem leitor e a campanha vai a todas (D1 da 9ª)
❌ Contar "quem receberia hoje" da campanha automática pelo público inteiro, ou escolher as clientes do gatilho fora de lib/notifications/gatilho-de-hoje (o cron e o detalhe dividem a escolha — D10 da 12ª)
❌ Trazer um gatilho de campanha já marcado, ou dizer quando ela sai fora de quandoDispara (a hora é a do cron, jaEhHoraDeDisparar — D8 da 11ª)
```
