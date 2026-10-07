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
embaixo da topbar. Só ACHA — as ações ("Agendar", "Vender") são a fase 2.

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

---

## O que nunca fazer aqui

```
❌ Achar pela busca universal o que a tela própria do registro não mostraria (tipo novo sem módulo em tiposPermitidos, ou sem o recorte de dono/unidade)
❌ Deixar o navegador escolher o que a busca procura, ou filtrar o resultado no navegador em vez de no servidor
❌ Escrever à mão a lista de páginas da busca (vem de lib/menu.ts e lib/configuracoes/abas.ts)
```
