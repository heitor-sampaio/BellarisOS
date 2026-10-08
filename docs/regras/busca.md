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
  `tiposPermitidos(ctx.permissions)` (o módulo da tela de cada tipo), o dono
  por `ownerFilter` (CRM e agenda) e a unidade por `ctx.branchId ?? filial do
  slug` com `assertUnidade`. Cliente final é recusado.
- **Conversas passam por `idsDaPaginaDoInbox`** (`lib/inbox/pagina.ts`), a
  MESMA conta da lista do inbox (dono, modo pessoa × conversa, caixas do cargo)
  — não por uma consulta à parte.
- **O resto é `busca_universal`** (migration `20261003000001`, só
  `service_role`): sem acento (`private.sem_acento`, também em `inbox_pagina`),
  todas as palavras em qualquer ordem (`private.tem_todas`), telefone e CPF por
  dígitos. Procedimento respeita a disponibilidade por unidade; oportunidade de
  funil arquivado fica de fora.
- **Tipo novo** entra em três lugares: `busca_universal`, `tiposPermitidos`
  (`lib/busca/tipos.ts`) e `destinoDoResultado` (`lib/busca/destino.ts`).
- **Páginas vêm do menu e das abas** (`lib/menu.ts`,
  `lib/configuracoes/abas.ts`), com a mesma regra de visibilidade — nunca de
  uma lista escrita à mão. Os apelidos ("negócio" → Oportunidades) moram em
  `lib/busca/paginas.ts`.
- **Destinos por URL:** registro sem tela própria abre a lista filtrada
  (`?q=` em equipe, procedimentos, pacotes e estoque); a oportunidade abre o
  card no quadro (`rotaOportunidade` → `?funil=&lead=`, lido da URL pelo
  `CRMBoard`).
- A guarda do inbox no navegador (`conversaCasaComBusca`, `lib/inbox/busca.ts`)
  compara como o banco — sem acento, telefone por dígitos —, senão esconde o
  que `inbox_pagina` achou.
- **Telefone por dígitos só quando o termo é um telefone — sem letra.** Vale
  para `busca_universal`, `inbox_pagina` (migration `20261007000010`) e a
  guarda do navegador. Até 2026-10-07 o inbox pegava os dígitos soltos de um
  termo de texto: "Nome da pessoa muyl997q" achava todo telefone com "997".
- Prova: `e2e/busca-universal.spec.ts` (rede `[e2e]` própria; recusas pela
  action direta, com o admin como controle).

### As ações (fase 2, 2026-10-08)

`lib/busca/acoes.ts`. Cada ação é um ATALHO para o modal que já existe, pela
URL — a busca não grava nada, e a tela de destino confere tudo de novo:

| Ação | Onde aparece | Destino |
|---|---|---|
| Novo agendamento | sem termo, ou termo que casa ("agend", "marcar horário") | `…/agenda?novo=1` |
| Cadastrar cliente | sem termo, ou "novo cliente", "cadastro" | `…/clients/new` |
| Agendar | na linha do cliente achado | `…/agenda?novo=1&cliente=<id>` |
| Vender | na linha do cliente achado | `…/clients/<id>?acao=vender` |
| Cadastrar «termo» como cliente | no FIM, quando nenhum cliente casou | `…/clients/new?nome=` ou `?telefone=` |

- **Só aparece para quem a tela de destino libera**: agendar é `agenda:
  MANAGE` sem a agenda "só a própria" (`agendaPropria`, da topbar — aquela
  agenda é outra tela, sem o modal de criar); cadastrar é `clients: MANAGE`;
  vender é quem recebe (`recebe`, `lib/menu.ts`: caixa ou financeiro em
  Gerenciar — o `podeReceber` de `lib/auth`).
- **As portas por URL**: `useNovoAgendamentoDaUrl`
  (`components/shared/novo-agendamento-da-url.ts`) nas duas agendas; o
  `?acao=vender` na ficha (`client-profile.tsx`); o `prefillDaBusca` nas duas
  páginas de cadastro. Cada uma tira os parâmetros da URL ao abrir — recarregar
  não reabre. O nome do cliente de `?cliente=` vem do SERVIDOR
  (`clienteParaAgendar`, da rede da sessão), nunca da URL.
- **"Cadastrar «termo»" vai no FIM**: no topo, o Enter cadastraria em vez de
  abrir a conversa ou a oportunidade achada.
- **Teclado**: ↑↓ entre as linhas, → entra nas ações da linha (só com o cursor
  no fim do texto), ← volta, Enter abre a escolhida. Cada ação é uma opção da
  lista (`aria-label` "Agendar para Fulana").
- De carona, o "+ Agendar" da ficha passou a abrir o modal já com o cliente
  (era a agenda vazia).
- Prova: `e2e/busca-acoes.spec.ts` e `tests/busca-acoes.test.ts`.

---

## O que nunca fazer aqui

```
❌ Achar pela busca universal o que a tela própria do registro não mostraria (tipo novo sem módulo em tiposPermitidos, ou sem o recorte de dono/unidade)
❌ Deixar o navegador escolher o que a busca procura, ou filtrar o resultado no navegador em vez de no servidor
❌ Escrever à mão a lista de páginas da busca (vem de lib/menu.ts e lib/configuracoes/abas.ts)
❌ Ação da busca que grava, ou que aparece para quem a tela de destino não libera
❌ Porta por URL de modal que confia no nome/dado da URL (o id vem do navegador; o resto, do servidor) ou que não tira o parâmetro ao abrir
```
