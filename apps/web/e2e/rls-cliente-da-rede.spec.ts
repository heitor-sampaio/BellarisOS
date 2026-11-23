import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { leOSinalDaRede } from './apoio/sinais'

/**
 * A ficha é da REDE, também na RLS (o Heitor: "o cliente não é da unidade, o
 * cliente é da rede" — H16; "Como o cliente pertence à clínica, a unidade, o
 * portal da unidade vê todos os clientes" — CL-P1, revisao.md:504; "Nada se
 * prende a clients.branch_id" — CLAUDE.md §5).
 *
 * Até 18/11 `clients_select`/`clients_update` recortavam por
 * `can_access_branch(clients.branch_id)` — a unidade em que a ficha NASCEU: o
 * membro de uma unidade não lia, pela sessão, a cliente cadastrada na outra
 * (e o mapa de injetáveis dela também não), e as telas contornavam pelo
 * servidor. Agora a RLS confere a REDE; a trava do módulo (Clientes em
 * Gerenciar) é da action.
 *
 * Provado COMO o membro (o token dele no PostgREST), numa rede `[e2e]` com
 * duas unidades. Desde 19/11 a sessão só lê SINAIS (o Heitor, "vai na 2"):
 * o membro de A não lê nem altera ficha nenhuma pela chave pública — a ficha
 * nascida em B ele abre pelo servidor; o controle é a ficha de OUTRA rede,
 * que continua invisível e intocável.
 */

const marca = Date.now().toString(36)
const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const db = () => banco()

function comoMembro(membro: MembroDeTeste): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${membro.accessToken}` } },
  })
}

let rede: OutraRede | null = null
let alheia: OutraRede | null = null
let membroDeA: MembroDeTeste | null = null
let unidadeB = ''
let fichaDeB = ''
let fichaAlheia = ''

test.describe.configure({ timeout: 180_000 })

test.beforeAll(async () => {
  test.setTimeout(240_000)
  rede = await criarOutraRede(`rlscr${marca}`)
  alheia = await criarOutraRede(`rlsca${marca}`)
  const { data: b, error: eB } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade B ${marca}`, slug: `e2e-rlscrb-${marca}` })
    .select('id').single<{ id: string }>()
  expect(eB, 'criar a unidade B').toBeNull()
  unidadeB = b!.id

  // A ficha nasce em B (`clients.branch_id` = B: "onde nasceu", sem efeito).
  const { data: f, error: eF } = await db().from('clients')
    .insert({ tenant_id: rede.tenantId, branch_id: unidadeB, name: `${PREFIXO} Nascida em B ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
    .select('id').single<{ id: string }>()
  expect(eF, 'criar a ficha nascida em B').toBeNull()
  fichaDeB = f!.id
  // A aplicação de injetáveis conferia a unidade pela FICHA (`c.branch_id`).
  const { error: eApl } = await db().from('injectable_applications').insert({ client_id: fichaDeB, points: [], notes: `${PREFIXO} ${marca}` })
  expect(eApl, 'criar a aplicação de injetáveis da ficha').toBeNull()

  fichaAlheia = await alheia.criarCliente('Ficha de outra rede')

  // Só a unidade A, com o Clientes em Gerenciar — e o Prontuário em Ver, para
  // o caso dos injetáveis abaixo provar que nem com ele a sessão os lê.
  membroDeA = await criarMembro(`rlscm${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Unidade A',
    permissoes: [{ modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'medical_records', nivel: 'VIEW' }],
  })
})

test.afterAll(async () => {
  if (fichaDeB) await db().from('injectable_applications').delete().eq('client_id', fichaDeB)
  await membroDeA?.limpar()
  await rede?.limpar()
  await alheia?.limpar()
})

// Desde 19/11 a sessão só lê SINAIS (o Heitor, "vai na 2"; CLAUDE.md §4): a
// ficha não se lê pela chave pública, de unidade nenhuma — a da outra unidade
// o membro abre pelo SERVIDOR (e2e/ficha-de-outra-unidade.spec.ts). Até ali o
// teste provava que a RLS a deixava ler a ficha nascida na outra unidade.
test('o membro de UMA unidade não lê, pela sessão, a ficha nascida na outra — nem nenhuma', async () => {
  const { data, error } = await comoMembro(membroDeA!).from('clients').select('id').eq('id', fichaDeB)
  expect(error).toBeNull()
  expect(data ?? [], 'a ficha não sai pela chave pública').toHaveLength(0)
  // O controle: o token vale e alcança a rede dele (o sinal, o que ele ainda lê).
  expect(await leOSinalDaRede(membroDeA!.accessToken, rede!.tenantId), 'o sinal da rede').toBe(1)
})

// A sessão só LÊ a ficha (20261125500001: a ficha tem CPF e as tags da pessoa,
// que o banco espelha nos contatos — CLAUDE.md §4, F63). Quem altera, de
// qualquer unidade da rede, é a action (`updateClientContactData`), pelo
// servidor: era "e altera a ficha nascida na outra" pela chave pública.
test('e não altera a ficha pela sessão — quem altera é a action, pelo servidor', async () => {
  const cidade = `${PREFIXO} cidade ${marca}`
  const { data } = await comoMembro(membroDeA!).from('clients').update({ city: cidade }).eq('id', fichaDeB).select('id')
  expect(data ?? [], 'a alteração não atingiu a ficha').toHaveLength(0)
  const { data: lida } = await db().from('clients').select('city').eq('id', fichaDeB).single<{ city: string | null }>()
  expect(lida?.city).not.toBe(cidade)
})

// Os injetáveis são PRONTUÁRIO: desde 18/11 (ATD-P01) a sessão não os lê de
// jeito nenhum, nem com o Prontuário — quem lê é o servidor
// (lib/injetaveis/alcance.ts), que aplica a rede e a permissão (a sessão só
// lê sinais, o Heitor, 19/11).
// Prova completa: e2e/rls-sessao-so-le-prontuario-e-automacoes.spec.ts.
test('as aplicações de injetáveis não se leem pela sessão, nem com o Prontuário (é o servidor)', async () => {
  const { data, error } = await comoMembro(membroDeA!).from('injectable_applications').select('id').eq('client_id', fichaDeB)
  expect(error).toBeNull()
  expect(data ?? []).toHaveLength(0)
  const { data: noBanco } = await db().from('injectable_applications').select('id').eq('client_id', fichaDeB)
  expect(noBanco ?? [], 'a aplicação existe').toHaveLength(1)
})

test('o controle: a ficha de OUTRA rede segue invisível e intocável', async () => {
  const api = comoMembro(membroDeA!)
  const { data: lida, error } = await api.from('clients').select('id').eq('id', fichaAlheia)
  expect(error).toBeNull()
  expect(lida ?? []).toHaveLength(0)
  const { data: mudou } = await api.from('clients').update({ city: 'invadido' }).eq('id', fichaAlheia).select('id')
  expect(mudou ?? []).toHaveLength(0)
  const { data: ainda } = await db().from('clients').select('city').eq('id', fichaAlheia).single<{ city: string | null }>()
  expect(ainda?.city).not.toBe('invadido')
})

test('não dá para plantar ficha em outra rede pela sessão', async () => {
  const { data, error } = await comoMembro(membroDeA!).from('clients')
    .insert({ tenant_id: alheia!.tenantId, branch_id: alheia!.branchId, name: `${PREFIXO} plantada ${marca}`, phone: '5548' + String(Date.now()).slice(-9) })
    .select('id')
  if (data?.length) await db().from('clients').delete().in('id', data.map(d => d.id as string))
  expect(error, 'a RLS recusa a ficha em outra rede').not.toBeNull()
})
