# Busca universal

> Regras do BellarisOS para esta área, tiradas do `CLAUDE.md` em 2026-10-06
> para ele caber no contexto (o índice está no §9 de lá). As regras gerais —
> rede e RLS, permissões, `gravar`/`ler`/`tentar`, portais — continuam no
> `CLAUDE.md` e valem aqui. Os números de seção são os de sempre.

### Busca universal (topbar, 2026-10-03)

Um campo no meio da topbar dos dois portais da equipe (`BuscaUniversal`,
`components/shared/busca-universal.tsx`) acha cliente, conversa, oportunidade,
próximo agendamento, membro, procedimento, pacote, produto e as próprias
páginas. `Ctrl/⌘+K` e `/` focam; no celular, a lupa abre a busca em tela cheia
embaixo da topbar. Desde a fase 2 (2026-10-08) também tem AÇÕES (abaixo).

- **A busca não abre exceção de alcance.** Quem não acha um registro na tela
  própria dele não o acha aqui. O navegador manda só o termo e o slug do
  portal; `buscarTudo` (`actions/busca.ts`) decide os tipos por
  `tiposPermitidos(ctx.permissions)` (o módulo da tela de cada tipo) e a
  unidade por `ctx.branchId ?? unidade do slug` com `assertUnidade`. Sem o
  "só os meus" (SM1, 2026-11-23), não há recorte por dono: quem tem o módulo
  acha tudo da abrangência. Cliente final é recusado.
- **Conversas passam por `idsDaPaginaDoInbox`** (`lib/inbox/pagina.ts`), a
  MESMA conta da lista do inbox (as caixas do cargo; sem dono nem modo desde a SM3)
  — não por uma consulta à parte.
- **O resto é `busca_universal`** (migration `20261003000001`, só
  `service_role`): sem acento (`private.sem_acento`, também em `inbox_pagina`),
  todas as palavras em qualquer ordem (`private.tem_todas`), telefone e CPF por
  dígitos. Procedimento respeita a disponibilidade por unidade; oportunidade de
  funil arquivado fica de fora.
- **"Próximo agendamento" é o EM ABERTO** (D17 da 25ª simulação; princípio 3):
  agendado, confirmado, chegou ou em atendimento, de hoje em diante no dia da
  unidade — a mesma régua do "Próximo" do app (`STATUS_DO_PROXIMO`,
  `atendimento.md`): o de hoje fica até a conclusão, mesmo com o horário já
  passado; a falta e o concluído de hoje saem (só o cancelado saía). Migration
  `20261125000002`. Prova: `e2e/busca-universal-proximos-em-aberto.spec.ts`,
  `tests/atritos-da-25-migracao.test.ts`.
- **As páginas que não são do menu** entram em `paginasDaBusca` partindo da
  entrada do menu de que dependem (a mesma visibilidade): o "Automações → O que
  já aconteceu" (CF2, 2026-11-16) só aparece com as Automações no menu, e
  "Configurações → Eventos" saiu com a aba. A Auditoria (CF3a) é entrada do
  menu (`auditoria`, módulo `audit`) e se acha por "auditoria", "quem fez",
  "quem alterou".
- **Tipo novo** entra em três lugares: `busca_universal`, `tiposPermitidos`
  (`lib/busca/tipos.ts`) e `destinoDoResultado` (`lib/busca/destino.ts`).
- **Páginas vêm do menu e das abas** (`lib/menu.ts`,
  `lib/configuracoes/abas.ts`), com a mesma regra de visibilidade — nunca de
  uma lista escrita à mão. Os apelidos ("negócio" → Oportunidades) moram em
  `lib/busca/paginas.ts`.
- **As configurações se acham pelo nome que as pessoas usam** (A18 da 8ª
  simulação, 2026-11-06: "Funil" abria o quadro, "Termos" os documentos
  emitidos, e "Cargos" e "Taxas" não achavam nada no portal da unidade):
  - "funil", "etapas", "motivos de perda", "origens" acham "Oportunidades →
    Configurar funis" (`?configurar=funis`, a porta por URL da janela
    `CRMStageSettings`, que tira o parâmetro ao abrir), com as oportunidades
    no plano, para quem a PÁGINA abre a janela: a Admin da rede com
    Configurações em Gerenciar (`adminDaRede`, `mexeNaConfigDaRede`; o Heitor,
    2026-11-18: "Configuração da rede toda só pela conta admin" — CLAUDE.md
    §11). Até a varredura de 18/11 (CRM-05) a busca a oferecia a quem tinha o
    CRM em Gerenciar, e a página não abria;
  - duas telas achadas pelo mesmo apelido dizem qual é qual
    (`SUBTITULO_PELO_APELIDO`): "Os documentos emitidos e assinados" ×
    "Os modelos de termo e contrato (a configuração)";
  - no portal da unidade, quem é da REDE acha também as abas que só a rede tem
    (as taxas e comissões, a fidelidade, as unidades…), com o endereço da rede
    (`daRede`, do layout da unidade à topbar); quem não tem “A rede inteira”, não — não
    abre.
  Prova: `tests/busca-configuracoes.test.ts`, `e2e/busca-configuracoes.spec.ts`.
- **Destinos por URL:** registro sem tela própria abre a lista filtrada
  (`?q=` em equipe, procedimentos, pacotes e estoque); a oportunidade abre o
  card no quadro (`rotaOportunidade` → `?funil=&lead=`, lido da URL pelo
  `CRMBoard`).
- A guarda do inbox no navegador (`conversaCasaComBusca`, `lib/inbox/busca.ts`)
  compara como o banco — sem acento, telefone por dígitos —, senão esconde o
  que `inbox_pagina` achou.
- **A busca de CLIENTE é uma regra só** (D6 da 8ª simulação, 2026-11-06): a
  lista de Clientes e o modal Agendar não ignoravam acento ("Zelia" não achava
  "Zélia") e a lista comparava o telefone cru ("85991000034" não achava "(85)
  99100-0034"); o Ctrl K não achava o número com o 55 do WhatsApp e oferecia
  "Cadastrar … como cliente" — a ficha em dobro. Agora a lista de Clientes, o
  modal Agendar (`buscar_clientes`), o crédito interno e o Ctrl K
  (`busca_universal`, as arquivadas e os contatos do CRM) casam igual: sem
  acento, todas as palavras, e o telefone por DÍGITOS com o 55 e o nono dígito
  do celular tolerados (`private.telefone_casa`, migration `20261106003401`;
  o espelho do navegador é `clienteCasaComBusca` / `telefoneCasaComDigitos`,
  `lib/busca/cliente.ts`). O telefone da ficha continua guardado como foi
  digitado. Prova: `e2e/busca-de-cliente-uma-regra.spec.ts`,
  `tests/busca-de-cliente.test.ts`.
- **Telefone por dígitos só quando o termo é um telefone — sem letra.** Vale
  para `busca_universal`, `inbox_pagina` (migration `20261007000010`) e a
  guarda do navegador. Até 2026-10-07 o inbox pegava os dígitos soltos de um
  termo de texto: "Nome da pessoa muyl997q" achava todo telefone com "997".
- Prova: `e2e/busca-universal.spec.ts` (rede `[e2e]` própria; recusas pela
  action direta, com o admin como controle).
- **A pessoa do CRM sem oportunidade e sem conversa se acha** (A15 da 6ª
  simulação, 2026-11-04: os contatos importados sem "criar oportunidade" não
  apareciam em lugar nenhum). Grupo "Contatos do CRM" (tipo `contato`),
  de `busca_pessoas_sem_oportunidade` (migration `20261104002302`, só
  `service_role`, a regra de casar da `busca_universal`). Quem tem
  oportunidade ou conversa já se acha por elas, com o alcance de lá. Só para
  quem CRIA oportunidade (CRM em Gerenciar, e o recurso `oportunidades`):
  abrir leva ao quadro com `?contato=<id>`, e o "Nova oportunidade" abre sozinho com
  o nome, o telefone e o e-mail dela, lidos no SERVIDOR
  (`pessoaParaNovoLead`, `lib/crm/pessoa-para-novo-lead.ts`); a oportunidade
  nasce ligada a ESSA pessoa (`_contatoId` em `createLead`, conferido: da rede
  e ainda sem oportunidade) — também a que só tem e-mail. O parâmetro sai da
  URL ao abrir. Prova: `e2e/busca-universal-contato.spec.ts`. O contato que
  já tem ficha (`contacts.client_id`, 18/11 — `crm-inbox.md` §9.2.1) não entra
  no grupo: ele é achado como a cliente (migration `20261125500001`).

### As ações (fase 2, 2026-10-08)

`lib/busca/acoes.ts`. Cada ação é um ATALHO para o modal que já existe, pela
URL — a busca não grava nada, e a tela de destino confere tudo de novo:

| Ação | Onde aparece | Destino |
|---|---|---|
| Novo agendamento | sem termo, ou termo que casa ("agend", "marcar horário") | `…/agenda?novo=1` |
| Cadastrar cliente | sem termo, ou "novo cliente", "cadastro" | `…/clients/new` |
| Agendar | na linha do cliente achado | `…/agenda?novo=1&cliente=<id>` |
| Vender | na linha do cliente achado | `…/pdv?nova=1&cliente=<id>` (BU1) |
| Cadastrar «termo» como cliente | no FIM, quando nenhum cliente casou | `…/clients/new?nome=` ou `?telefone=` |
| Reativar | na linha da cliente ARQUIVADA (A19) | `…/clients/<id>?acao=reativar` |

- **Só aparece para quem a tela de destino libera**: agendar é `agenda:
  MANAGE` sem a agenda "só a própria" (`agendaPropria`, da topbar — aquela
  agenda é outra tela, sem o modal de criar); cadastrar é `clients: MANAGE`;
  vender é quem vende no PDV (`recebe`, `lib/menu.ts`: o PDV em Gerenciar,
  PV-04 — o `podeReceber` de `lib/auth`, a MESMA trava da página do PDV).
- **As portas por URL**: `useNovoAgendamentoDaUrl`
  (`components/shared/novo-agendamento-da-url.ts`) nas duas agendas; o
  `?nova=1&cliente=` do PDV (`app/_shared/pdv.tsx`, nos dois portais); o
  `prefillDaBusca` nas duas páginas de cadastro. Cada uma tira os parâmetros da URL ao abrir — recarregar
  não reabre. O nome do cliente de `?cliente=` vem do SERVIDOR
  (`clienteParaAgendar`, da rede da sessão), nunca da URL.
- **A cliente arquivada também se acha** (A19 da 5ª simulação): vem de
  `busca_clientes_arquivados` (a mesma regra de casar), depois das ativas,
  com "Arquivada" na linha e só a ação "Reativar" (nada de agendar nem
  vender). Ela conta como cliente achado: o "Cadastrar «termo»" não aparece
  (criaria a duplicata).
- **"Cadastrar «termo»" vai no FIM**: no topo, o Enter cadastraria em vez de
  abrir a conversa ou a oportunidade achada.
- **Teclado**: ↑↓ entre as linhas, → entra nas ações da linha (só com o cursor
  no fim do texto), ← volta, Enter abre a escolhida. Cada ação é uma opção da
  lista (`aria-label` "Agendar para Fulana").
- De carona, o "+ Agendar" da ficha passou a abrir o modal já com o cliente
  (era a agenda vazia).
- **"Vender" leva ao PDV** (BU1, Bloco Busca do plano de adaptação — a venda
  saiu da ficha no PDV7, 2026-11-13): `…/pdv?nova=1&cliente=<id>` pelo
  `rotaNoPortal` (o PDV da rede ou o da unidade, onde a pessoa está). Na rede
  com mais de uma unidade, a venda pergunta "Em qual unidade?" antes. A
  página do PDV confere o id da URL antes do banco: `ehUuid`
  (`lib/id-da-rota.ts` — o `/^[0-9a-f-]{36}$/` de antes deixava passar 36
  hífens, e o 22P02 dava a tela de erro), a cliente DA REDE da sessão (a
  ficha é da rede, H5) e ativa; a unidade, pela abrangência (`alcancaUnidade`
  no portal da unidade, a lista recortada no da rede). O que não passa abre a
  venda sem cliente, com a busca de cliente. A ficha não tem mais o
  `?acao=vender` (saiu com o "Vender" dela). Prova:
  `e2e/busca-vender-no-pdv.spec.ts`.
- Prova: `e2e/busca-acoes.spec.ts`, `e2e/busca-vender-no-pdv.spec.ts` e
  `tests/busca-acoes.test.ts`.

### A busca da lista de Planejamentos (F73)

A sobra da F70: `listarPlanejamentos` filtrava com `toLowerCase().includes` e
o telefone cru — "Jose" não achava o plano da "José". Agora é a regra da
busca de cliente (`planoCasaComBusca`, `lib/busca/cliente.ts`): o nome do
plano e o da cliente sem acento, o telefone pelos dígitos nacionais
(`clienteCasaComBusca`), o documento por dígitos. Prova:
`tests/planejamentos-busca.test.ts`.

---

## O que nunca fazer aqui

```
❌ Achar pela busca universal o que a tela própria do registro não mostraria (tipo novo sem módulo em tiposPermitidos, ou sem o recorte de dono/unidade)
❌ Deixar o navegador escolher o que a busca procura, ou filtrar o resultado no navegador em vez de no servidor
❌ Filtrar cliente por nome com toLowerCase().includes ou comparar o telefone pelo texto gravado — é clienteCasaComBusca (navegador) e private.telefone_casa (banco): sem acento, por dígitos, com o 55 e o 9 tolerados (D6 da 8ª)
❌ Escrever à mão a lista de páginas da busca (vem de lib/menu.ts e lib/configuracoes/abas.ts)
❌ Ação da busca que grava, ou que aparece para quem a tela de destino não libera
❌ Porta por URL de modal que confia no nome/dado da URL (o id vem do navegador; o resto, do servidor) ou que não tira o parâmetro ao abrir
```
