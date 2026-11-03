# Convenções de código — os modelos

> Tirados do `CLAUDE.md` em 2026-10-06 (o §8 e o §4 apontam para cá). As
> regras continuam lá; aqui ficam os exemplos.

### Helper de contexto (web — Server Actions e Route Handlers)

```typescript
// apps/web/lib/auth.ts
export async function getTenantContext() {
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Unauthenticated')

  const claims = user.app_metadata as JwtClaims
  return {
    userId: user.id,
    tenantId: claims.tenant_id,
    branchId: claims.branch_id,
    role: claims.role,
    clientId: claims.client_id,
    isNetworkAdmin: claims.role === 'NETWORK_ADMIN',
    isClient: claims.role === 'CLIENT',
  }
}
```

> O helper real faz mais (membro no banco, rede bloqueada, sessão de suporte,
> permissões): o exemplo mostra só a origem dos claims.

### Estrutura de um Server Action (web)

```typescript
'use server'
import { getTenantContext, assertPermission } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { gravar } from '@/lib/db'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'

const EntradaDoAgendamento = z.object({ clientId: z.string().uuid(), /* … */ })

export async function createAppointment(input: unknown) {
  const ctx = await getTenantContext()
  assertPermission(ctx, 'agenda', 'MANAGE')
  const data = EntradaDoAgendamento.parse(input)

  const admin = createAdminClient()

  // branch_id SEMPRE vem do contexto — nunca do input do cliente.
  // `gravar` devolve a linha ou PARA o fluxo: não existe escrita que
  // falha em silêncio (ver §13.1).
  const appointment = await gravar(
    admin.from('appointments')
      .insert({ ...data, tenant_id: ctx.tenantId, branch_id: ctx.branchId })
      .select()
      .single(),
    'criar o agendamento',
  )

  revalidatePath(`/${ctx.branch?.slug}/agenda`)
  return appointment
}
```

### Queries — filtro obrigatório

```typescript
// ✅ Usuário operacional — filtrar por branch_id
const clients = await ler(
  admin.from('clients').select('*').eq('branch_id', ctx.branchId),
  'listar os clientes da unidade',
)

// ✅ Network Admin — filtrar por tenant_id
const branches = await ler(
  admin.from('branches').select('*').eq('tenant_id', ctx.tenantId),
  'listar as unidades da rede',
)

// ✅ Cliente final — filtrar por client_id
const appointments = await ler(
  admin.from('appointments').select('*').eq('client_id', ctx.clientId),
  'listar os agendamentos do cliente',
)

// ❌ NUNCA — sem filtro
const clients = await admin.from('clients').select('*')
```

### Lista que cresce — em páginas (2026-10-22)

O PostgREST devolve no máximo **1000 linhas** por consulta, e o que passa disso
some sem erro nenhum. `.limit(2000)` (ou `limit 2000` dentro da função)
também vira 1000. A varredura de 2026-10-22 achou o corte na lista de
clientes, na "última visita", no público das campanhas, no quadro de
oportunidades, no relatório comercial, na agenda da rede, no financeiro, nas
comissões, no checkout, nas automações e nos injetáveis.

- **Lista que a tela mostra inteira**: `lerTodas` (`lib/db.ts`), com ORDEM
  estável — a coluna da tela e o `id` de desempate. Sem o desempate, as
  páginas se sobrepõem.
  ```typescript
  const leads = await lerTodas((de, ate) => admin
    .from('leads').select('id, name').eq('tenant_id', ctx.tenantId!)
    .order('created_at', { ascending: false }).order('id')
    .range(de, ate), 'carregar os leads')
  ```
  Função do banco que devolve linhas também: `admin.rpc(…).order(…).range(de, ate)`.
- **Conta sobre uma lista** (última visita, total por cliente, quantos por
  automação): agregada no banco, numa função — não lida e contada no app.
- **Filtro que o app aplicava depois de ler** (aniversário do dia, "sem
  retorno", "fez o procedimento"): vai para a consulta. Ler 1000 quaisquer e
  filtrar em JavaScript perde quem não veio no lote — e um teto (`limit`) só
  depois do filtro (`clientes_do_publico`, `lib/clientes/publico.ts`).
- **Lista de ids** grande não vai no `.in()` (vai na URL, e passa do limite
  dela): vai no corpo de uma função (`rpc`, que é POST).
- ⚠️ Função comum (sem `security definer`) que o SERVIDOR chama não usa
  `private.*`: o schema dá `usage` a `authenticated` (as políticas) e não a
  `service_role` — ela falha sempre com 42501. Foi a primeira versão de
  `clientes_do_publico` (consertada em `20261023000001`).
- Prova: `e2e/listas-sem-corte.spec.ts` (uma rede com mais de 1000 linhas em
  cada lista, e o alvo depois da linha 1000).

### O id que vem da URL — conferido antes do banco (2026-10-29)

Toda rota `[id]` (`[planId]`, `[mapId]`) da clínica chama `idOu404(id)`
(`lib/id-da-rota.ts`) logo depois de ler os `params`, ANTES de qualquer
consulta. As colunas são uuid: o id que não é uuid (`/agenda/comissoes`) fazia o
Postgres responder 22P02, e `ler` lançava — "A tela não conseguiu carregar" no
lugar do 404 (D15 da simulação de 2026-10-29). Prova:
`e2e/nao-encontrada.spec.ts` (todas as rotas `[id]` dos três portais),
`tests/id-da-rota.test.ts`.

### O envio que chega duas vezes grava uma vez (2026-11-02)

D10 da 5ª simulação: um "Cadastrar cliente" criou duas fichas "Valdir
Duplicado" com 0,7 s de diferença — o botão só se desligava com o `pending`.
O Heitor: "se achar que precisa, use idempotência para todos os cadastros e
edições do sistema". O mecanismo é UM:

- A TELA pede a chave ao `useEnvioUnico()` (`lib/use-envio-unico.ts`) no
  envio — `dados.set('_envio', envio.chave())` no FormData, ou `envio:
  envio.chave()` no objeto — e chama `envio.renovar()` quando o envio GRAVOU
  (o próximo cadastro do mesmo formulário aberto é outro envio). A chave nasce
  no envio, não no render (hidratação).
- A ACTION embrulha a gravação em `umaVez(tenant, 'nomeDaAcao', chave, fazer,
  { gravou, ocupada })` (`lib/envio-unico.ts`), que reivindica a chave em
  `envios_unicos` (rede + ação + chave, só o servidor) ANTES de gravar. A
  segunda chegada espera a primeira e recebe o MESMO resultado; a que volta
  sem gravar (erro, aviso, pergunta) solta a chave, e a resposta da pessoa
  grava. Sem chave, só faz — o caminho antigo continua valendo.
- Sem a chave da tela (outra aba, o Copilot), a action pode travar pelo
  CONTEÚDO: `chaveDoConteudo(...)` + `validade`, ou só ENFILEIRAR as chegadas
  (`soEnfileirar`: a segunda espera a primeira e faz de novo). O cadastro da
  cliente enfileira: a segunda chegada acha a ficha que a primeira gravou e
  pergunta "Já existe a ficha de X" (r2-cli-01, 2026-11-03; até ali o mesmo
  nome com o mesmo telefone em 60 s era o mesmo cadastro, calado).
- Edição que regrava os mesmos valores já é idempotente; o que precisa disto é
  o que ACUMULA (criar, lançar, vender, mover estoque, dar pontos).
- Prova: `e2e/ficha-cadastro-uma-vez.spec.ts` (o mesmo envio ao mesmo tempo,
  sem chave, e a pergunta que não prende a chave) e
  `e2e/vendas-envio-unico.spec.ts` (dinheiro, estoque e pontos: o mesmo envio
  duas vezes ao mesmo tempo grava uma; um envio novo grava de novo).
- **Onde está** (F9, 2026-11-02): o cadastro da cliente (`addClient`, e o
  conteúdo enfileirado); o DINHEIRO — o lançamento manual
  (`createTransactionAdvanced`), o crédito interno (`grantInternalCredit`, nas
  duas telas), as vendas de pacote, de pré-pago e de produto (`venderPacote`,
  `venderProcedimento`, `venderProduto`: a chave é o último argumento); o
  ESTOQUE — a entrada (`adminAddStock`, também a do leitor de código de
  barras), a transferência e a perda; os PONTOS — o ajuste e a troca por
  recompensa (`ajustarPontos`, `resgatarRecompensa`: `envio` no objeto);
  RECEBER o plano no check-in (`receberDoPlano`, a chave é o último
  argumento — F11, 2026-11-03); a UNIDADE nova (`createBranch`, o "Nova
  unidade" e o `/setup` — F12, 2026-11-03).
- **Duas abas ao mesmo tempo (envios DIFERENTES) é outra coisa**: a chave não
  as junta. No dinheiro que lê um saldo, a função do banco TRAVA a linha e
  confere o saldo que o app leu: `plano_receber` (migration
  `20261101001101`) trava o plano, confere que os lançamentos a cobrar ainda
  estão em aberto com a soma mostrada, e só então quita ou troca o saldo por
  entrada + parcelas; a segunda chegada ouve "Este saldo já foi recebido ou
  mudou". Prova: `e2e/plano-recebimento-concorrente.spec.ts`.
- **Onde não precisou**: o que o ESTADO já barra — receber o atendimento
  (`confirmPayment`: o "já pago" é conferido dentro da transação), o ajuste de
  estoque (grava o saldo absoluto, repetir dá o mesmo saldo), o checkout e o
  cancelamento do plano e do pacote (a situação muda na primeira), o estorno.
- **Fica para depois** (não acumulam dinheiro nem estoque; o duplo clique
  cria um segundo registro visível, que se arquiva): o agendamento (`addAppointment`: o choque
  de horário já recusa o segundo do mesmo profissional), oportunidade e lead,
  procedimento, produto e categoria do estoque, membro (o e-mail é
  único), tag, sala, cargo, ficha, funil e etapa, motivo de perda, campanha,
  automação, pacote e recompensa (o cadastro), plano do cliente.
- As chaves velhas não se apagam: a tabela ganha uma linha pequena por envio.
  Se crescer, a limpeza é um cron que apaga pelo cliente de serviço o que tem
  mais de 30 dias.
