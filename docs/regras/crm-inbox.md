# Clientes, contatos, conversas e oportunidades

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### 9.2 Clientes / CRM
- CPF (`document`) único por `tenantId` — constraint `@@unique([tenantId, document])`
- `authId` em `Client` é opcional — preenchido quando a CLÍNICA dá o acesso ao
  app. **O mesmo login pode estar em várias fichas, uma por rede** (a mesma
  pessoa cliente de várias clínicas, 2026-10-19 — regras no §5 do
  `CLAUDE.md`). Cada ficha continua da sua clínica: a LGPD (pedido, exportação)
  é por ficha, e cada clínica responde pelos dados dela.
- A conta de pontos (`loyalty_accounts`) nasce com o cliente, por `fidelidade_conta` — e sob demanda, se faltar. A fidelidade tem seção própria: §9.2.2.
- Tags como `String[]` no registro; o VOCABULÁRIO é da rede (`tags`, abaixo).
  `CLIENT_TAGS` (`packages/utils/client-tags.ts`) virou só as oito com que a
  rede nova nasce.

**As tags da rede** (2026-10-13, pedido do Heitor; **Configurações → Tags**,
nos dois portais, para quem tem `clients` OU `crm` em Gerenciar). Até aqui a
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
- **Arquivar** tira das opções; quem já tem continua com ela, e a ficha a
  mostra marcada. Não há apagar.
- Rede nova nasce com as oito padrão (`trg_rede_ganha_tags`,
  `private.tags_padrao()` — espelha `CLIENT_TAGS`).
- Prova: `e2e/tags-da-rede.spec.ts`, `tests/tags.test.ts`.
- `InternalCredit`: saldo de crédito do cliente (concessão manual, cancelamento de plano pago, estorno de um pagamento feito com crédito); usado como método de pagamento `INTERNAL_CREDIT`, que o desconta (§9.6)
- **A aba Financeiro da ficha é do financeiro** (2026-10-20): os pagamentos e
  o crédito interno do cliente só são carregados para `financial: VIEW` ou
  quem recebe (`podeReceber`), e a aba some para os outros. Carregava para
  quem tinha só o cadastro, e o SDR via cada pagamento. Os KPIs da visão geral
  (LTV, ticket) ficam: são agregados comerciais. Prova:
  `e2e/ficha-financeiro-so-com-modulo.spec.ts`.
- `LgpdRequest`: pedido de acesso aos dados pelo titular. Só `type: "export"`
  está implementado — a exclusão continua fora de escopo por conflitar com a
  guarda legal de prontuário e de registros fiscais. Fluxo: o cliente solicita
  em `/[slug]/cliente/perfil`, `actions/lgpd.ts` grava o pedido e processa em
  `after()` (não há fila no projeto); `/api/cron/lgpd-exports` recolhe o que
  ficar para trás. O pacote sai em PDF (legível) + JSON (portabilidade) no
  bucket privado `lgpd-exports`, com download por signed URL e validade de
  30 dias. Um pedido em aberto por cliente, garantido por índice único parcial.
- **Prontuário no pacote depende de liberação**: `include_medical` marca o que o
  titular pediu e `medical_status` (`not_requested | pending | approved |
  denied`) registra a decisão de quem tem `medical_records: MANAGE`, na aba
  LGPD de `/admin/settings`. Aprovar recoloca o pedido em `pending` e o pacote
  é regerado com a parte clínica. Sem o prontuário, o pacote diz POR QUÊ
  (`textoDoProntuarioForaDoPacote`): não pedido, pedido e em análise, ou não
  liberado — era sempre "não incluído", como se não tivesse pedido
  (simulação de 2026-10-20).

**O importador de contatos (CSV)** (2026-10-13; **Configurações → Importações**,
nos dois portais — pedido do Heitor, saiu de Clientes e de Oportunidades;
`/importar-contatos` só redireciona para a aba; corpo em
`app/_shared/importar-contatos.tsx`, `lib/importacao/`): arquivo → colunas →
prévia → importação em segundo plano. ⚠️ A aba abre com `clients` OU `crm` em
Gerenciar (`alternativas` em `lib/configuracoes/abas.ts`, lidas por
`abaLiberada` na tela, na busca e no menu; a página de Configurações aceita
`MODULOS_DAS_ABAS`): a SDR que só tem o CRM também importa a lista de leads
dela — e vê Configurações só com essa aba.
- **O destino é escolhido a cada importação**: *clientes* (a ficha, na unidade
  escolhida — na unidade, a dela; `clients: MANAGE`) ou *contatos do CRM* (só a
  pessoa: nome, telefone, e-mail, rede social, tags; `crm: MANAGE`). Oportunidade no funil é
  opcional (`crm: MANAGE` + recurso `oportunidades`; responsável que não é
  quem importa só com `podeTrocarResponsavel`) e não duplica: quem já tem uma
  aberta no mesmo funil não ganha outra — e a que já existe NÃO é completada
  (a planilha não mexe no card que alguém está trabalhando).
- **Os campos que se oferecem dependem da importação** (`camposDoDestino`,
  2026-10-13 — "quanto mais completa, melhor"): a oportunidade se decide no
  PASSO 1, antes das colunas, porque com ela entram os campos do CARD —
  origem (no vocabulário de `LEAD_SOURCES`, com apelidos: "facebook" é Meta
  Ads; o desconhecido vira "Outro", não erro), valor estimado ("R$ 1.500,00"),
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
  ser de outra pessoa). Contato: pelo telefone exato.
- **Cliente novo**: tag da unidade (é por ela que a lista filtra) e conta de
  fidelidade (`fidelidade_conta`); **SEM acesso ao portal** (cria-se na ficha).
  A importação de clientes não cria contato do CRM: a ficha se liga à pessoa
  quando a conversa começar, como no cadastro manual.
- ⚠️ **Nenhum evento de domínio** (`criarOportunidadeCore(…, { semEventos })`,
  e cliente/contato gravados direto): uma planilha não pode virar mil
  automações de boas-vindas.
- Campo opcional preenchido e ilegível (CPF, e-mail, data, UF…) **recusa a
  linha** com o motivo — sumir com o dado em silêncio seria pior.
- Roda em `after()` (`lib/importacao/processar.ts`), no padrão do histórico do
  WhatsApp: `importacoes` reivindicada com uma `execucao` nova, e TODO sinal de
  vida e a gravação final filtram por ela — a passagem que perdeu a vez para de
  gravar. Sinal a cada 100 linhas, ANTES de tirar o pedaço de
  `importacao_linhas` (cair no meio regrava o pedaço, o que é seguro; o
  contrário perderia as contagens). Interrompida, "Tentar de novo" continua de
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

**E-mail e rede social também são da pessoa** (`contacts.email`,
`contacts.social_media`, 2026-10-13): o importador os grava nela (só o vazio)
mesmo sem oportunidade, e o painel do inbox os mostra e edita na seção do
contato (`atualizarContato`). Não propagam: a oportunidade tem a SUA cópia
(`leads.email`, `social_media`), que é o card e se edita no card. Prova:
`e2e/inbox-contato-email.spec.ts`.

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

**O RESPONSÁVEL da oportunidade** (`leads.owner_id`, 2026-10-09). Na tela e no
histórico é sempre "Responsável", nunca "Dono" (decisão do Heitor: o mesmo
conceito não pode ter dois nomes) — no código segue `owner`.
- Nasce de quem cria o lead; o card mostra as iniciais (o nome no `title`), e
  o modal do lead tem o campo "Responsável" (os membros ATIVOS da rede, mais
  "Sem responsável" — que devolve o card ao bolo comum).
- **Troca só quem tem o CRM em Gerenciar com escopo "todos"**
  (`podeTrocarResponsavel`, `lib/crm/responsavel.ts`). O "só os meus" vê o
  nome e não troca: passar o card adiante o tiraria do próprio alcance, e
  pegar o de outro é o que o escopo impede. O servidor confere de novo — quem
  não pode e manda `owner_id` no form não muda nada.
- Tela e automação ("Definir responsável") passam pelo MESMO núcleo,
  `trocarResponsavelCore`: a pessoa é da rede e ativa, e a linha do tempo diz
  DE quem PARA quem (até 2026-10-09 a automação gravava sempre "de: —").
  Prova: `e2e/crm-responsavel.spec.ts`.

**O filtro de situação do quadro** é "Já é cliente / Ainda não é cliente"
(2026-10-09; era "Convertidos / Não convertidos", que se lia como "ganho").
Olha só se a oportunidade tem um cliente ligado (`leads.client_id`, gravado
ao cadastrar o cliente pelo card, pelo inbox ou ao agendar pelo CRM) — não a
etapa nem o desfecho: há card ganho sem cliente e card perdido com cliente.
Situação e período têm a forma dos outros filtros da barra (`PickerCompacto`
de escolha única com o MESMO marcador quadrado dos vizinhos — `marcadorQuadrado` —,
o gatilho mostra a escolhida, e sem divisor entre eles), e o período tem
"Personalizado": De/Até no rodapé do painel, que só filtra ao aplicar e
compara o DIA da criação no fuso do negócio (`dayKeyTZ`).

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

**A tela lê o NOME da pessoa, não a cópia** — lista, busca (`inbox_pagina`),
card do contato, "virar cliente", template, agendamento pelo CRM e o evento da
conversa (embed `pessoa:contacts!conversations_contato_id_fkey(name)`; a cópia
só na falta). O **telefone da conversa não é cópia**: é o destino daquela thread,
e é dele que o envio, a lista e o card leem. Prova:
`e2e/inbox-nome-da-pessoa.spec.ts` (a pessoa renomeada com a cópia velha).

Em teste, limpar conversa é `apagarConversas()` de `e2e/apoio/banco.ts`, que tira
o contato junto.

---

## O que nunca fazer aqui

```
❌ Gerar exportação de LGPD dentro do request — usar after() + o cron de retomada
❌ Entregar pacote de LGPD com consulta que falhou em silêncio — no export, erro aborta
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
❌ Importar (planilha, lote) emitindo evento de domínio, ou trocando dado que a ficha já tem
❌ Gravar telefone importado fora do formato do WhatsApp (55 + DDD + número, só dígitos) — a pessoa não se acha depois
❌ Escrever "Dono" na tela para o responsável da oportunidade (é "Responsável" em todo lugar)
❌ Trocar leads.owner_id fora de trocarResponsavelCore (o histórico perde o "de")
❌ Oferecer tag de uma lista fixa (CLIENT_TAGS) ou do que está em uso — é o vocabulário da rede (tagsAtivasDaRede)
❌ Renomear tag com update à mão em uma tabela só (é renomear_tag, nas quatro, numa transação)
```
