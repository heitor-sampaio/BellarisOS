import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'

/**
 * A sessão só lê SINAIS (o Heitor, 19/11, "vai na 2", à proposta "a sessão não
 * lê nem grava tabela nenhuma; só escuta os sinais do tempo real";
 * CLAUDE.md §4).
 *
 * A chave pública está no navegador: o que uma política de leitura deixa a
 * sessão ler, qualquer membro (ou cliente) lê direto no PostgREST, sem a trava
 * do servidor (permissão, escopo, abrangência). Toda leitura é do servidor; o
 * navegador só assina as tabelas de sinal (sem conteúdo) e recarrega pelo
 * servidor.
 *
 * Três provas:
 * - a TRAVA: `e2e_leituras_pela_sessao()` lista todo caminho de leitura que a
 *   sessão tem (política de leitura fora dos sinais, tabela sem RLS, view,
 *   função exposta, tabela do Realtime que não é sinal) — e a lista é vazia;
 * - a Admin da rede (o cargo que tudo alcança) e a cliente final leem, pela
 *   chave pública, as tabelas em que há linha delas — e não vem nada;
 * - o sinal chega: o agendamento que muda marca `sinais` da rede (a equipe o
 *   lê); o aviso da cliente marca o dela (só ela o lê); a outra rede não vê
 *   nenhum dos dois.
 */
test.setTimeout(240_000)

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const marca = Date.now().toString(36)
const db = () => banco()

function comToken(accessToken: string): SupabaseClient {
  return createClient(URL_, ANON, {
    auth: { persistSession: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  })
}

let rede: OutraRede
let outra: OutraRede
let admin: MembroDeTeste
let deFora: MembroDeTeste
let cliente: ClienteDeTeste
let fichaDaRede = ''
let conversaDaRede = ''
const limpar: (() => PromiseLike<unknown>)[] = []

async function inserir(tabela: string, linha: Record<string, unknown>): Promise<string> {
  const { data, error } = await db().from(tabela).insert(linha).select('id').single<{ id: string }>()
  expect(error, `criar a linha de teste em ${tabela}: ${error?.message}`).toBeNull()
  limpar.push(() => db().from(tabela).delete().eq('id', data!.id))
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ssl${marca}`)
  outra = await criarOutraRede(`sslo${marca}`)
  admin = await criarMembro(`sslA${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  deFora = await criarMembro(`sslF${marca}`, { tenant: outra.tenantId, donoDaRede: true, permissoes: [] })
  cliente = await clienteComSessao(`sslC${marca}`, { id: rede.branchId, slug: `e2e-un-${marca}` }, { tenant: rede.tenantId })
  fichaDaRede = await rede.criarCliente('ficha da rede')
  await rede.criarProduto('produto')

  for (const client_id of [fichaDaRede, cliente.clientId]) {
    await inserir('appointments', {
      branch_id: rede.branchId, client_id, professional_id: rede.professionalId, procedure_id: rede.procedureId,
      scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED',
    })
  }
  const funil = await inserir('crm_funnels', { tenant_id: rede.tenantId, name: `${PREFIXO} funil ${marca}`, position: 90 })
  const etapa = await inserir('crm_stages', { tenant_id: rede.tenantId, funnel_id: funil, name: `${PREFIXO} etapa ${marca}`, position: 1 })
  const contato = await inserir('contacts', { tenant_id: rede.tenantId, name: `${PREFIXO} contato ${marca}`, identifiers: [] })
  await inserir('leads', { tenant_id: rede.tenantId, name: `${PREFIXO} lead ${marca}`, contato_id: contato, crm_stage_id: etapa })
  const conversa = await inserir('conversations', { tenant_id: rede.tenantId, branch_id: rede.branchId, contact_name: 'c', channel: 'whatsapp' })
  conversaDaRede = conversa
  await inserir('messages', { conversation_id: conversa, tenant_id: rede.tenantId, content: `${PREFIXO} oi ${marca}`, direction: 'inbound' })
  await inserir('treatment_plans', { branch_id: rede.branchId, professional_id: rede.professionalId, client_id: fichaDaRede })
  await inserir('user_notifications', { user_id: admin.userId, title: `${PREFIXO} aviso ${marca}` })
  await inserir('client_notifications', { client_id: cliente.clientId, title: `${PREFIXO} aviso ${marca}` })
})

test.afterAll(async () => {
  for (const f of limpar.reverse()) await f()
  await cliente?.limpar()
  await admin?.limpar()
  await deFora?.limpar()
  await rede?.limpar()
  await outra?.limpar()
})

test('a trava: a sessão não tem caminho nenhum de leitura no banco, além dos sinais', async () => {
  const { data, error } = await db().rpc('e2e_leituras_pela_sessao')
  expect(error, error?.message).toBeNull()
  expect(data ?? [], 'política de leitura fora dos sinais, tabela sem RLS, view, função exposta ou tabela do Realtime que não é sinal').toEqual([])
})

/** Tabelas em que a rede tem linha (o serviço confere antes) e o filtro da linha. */
const DA_ADMIN: [string, (r: OutraRede) => Record<string, string>][] = [
  ['tenants', r => ({ id: r.tenantId })],
  ['branches', r => ({ tenant_id: r.tenantId })],
  ['users', r => ({ tenant_id: r.tenantId })],
  ['tenant_roles', r => ({ tenant_id: r.tenantId })],
  ['clients', r => ({ tenant_id: r.tenantId })],
  ['appointments', r => ({ branch_id: r.branchId })],
  ['procedures', r => ({ tenant_id: r.tenantId })],
  ['products', r => ({ tenant_id: r.tenantId })],
  ['branch_product_stock', r => ({ branch_id: r.branchId })],
  ['crm_funnels', r => ({ tenant_id: r.tenantId })],
  ['contacts', r => ({ tenant_id: r.tenantId })],
  ['leads', r => ({ tenant_id: r.tenantId })],
  ['conversations', r => ({ tenant_id: r.tenantId })],
  ['treatment_plans', r => ({ branch_id: r.branchId })],
  ['user_notifications', () => ({ user_id: admin.userId })],
]

function filtrar<Q>(q: Q, filtro: Record<string, string>): Q {
  let r = q as unknown as { eq(c: string, v: string): unknown }
  for (const [c, v] of Object.entries(filtro)) r = r.eq(c, v) as typeof r
  return r as unknown as Q
}

for (const [tabela, filtroDe] of DA_ADMIN) {
  test(`a Admin da rede não lê ${tabela} pela chave pública`, async () => {
    const filtro = filtroDe(rede)
    const { data: existe } = await filtrar(db().from(tabela).select('*', { count: 'exact' }), filtro).limit(1)
    expect((existe ?? []).length, `o serviço vê a linha de ${tabela}`).toBeGreaterThan(0)
    const { data, error } = await filtrar(comToken(admin.accessToken).from(tabela).select('*'), filtro)
    // Sem política, o PostgREST devolve lista vazia (ou recusa): nada sai.
    expect(error ? [] : (data ?? []), `${tabela} pela sessão`).toEqual([])
  })
}

test('a Admin da rede não lê as mensagens da conversa pela chave pública', async () => {
  const { data } = await comToken(admin.accessToken).from('messages').select('id, content').like('content', `%${marca}%`)
  expect(data ?? []).toEqual([])
})

test('a cliente final não lê a própria ficha, os agendamentos nem os avisos pela chave pública', async () => {
  const s = comToken(cliente.accessToken)
  for (const [tabela, filtro] of [
    ['clients', { id: cliente.clientId }],
    ['appointments', { client_id: cliente.clientId }],
    ['client_notifications', { client_id: cliente.clientId }],
    ['branches', { tenant_id: rede.tenantId }],
    ['procedures', { tenant_id: rede.tenantId }],
  ] as [string, Record<string, string>][]) {
    const { data, error } = await filtrar(s.from(tabela).select('*'), filtro)
    expect(error ? [] : (data ?? []), `${tabela} pela sessão da cliente`).toEqual([])
  }
})

test('o sinal chega: a equipe lê o da rede, a cliente o dela, a outra rede nenhum', async () => {
  const { data: ag } = await db().from('appointments').select('id').eq('client_id', cliente.clientId).single<{ id: string }>()
  expect((await db().from('appointments').update({ notes: `mudou ${marca}` }).eq('id', ag!.id)).error).toBeNull()

  const daEquipe = await comToken(admin.accessToken).from('sinais').select('topico, chave').eq('tenant_id', rede.tenantId).eq('topico', 'agenda')
  expect(daEquipe.error, daEquipe.error?.message).toBeNull()
  expect(daEquipe.data, 'a equipe da rede recebe o sinal da agenda').toEqual([{ topico: 'agenda', chave: '' }])

  const daCliente = await comToken(cliente.accessToken).from('sinais').select('topico, chave').eq('tenant_id', rede.tenantId)
  expect(daCliente.error, daCliente.error?.message).toBeNull()
  expect((daCliente.data ?? []).map(s => s.topico), 'a cliente recebe o sinal dela, e só o dela').toEqual(['avisos'])
  expect((daCliente.data ?? []).every(s => s.chave !== ''), 'nenhum sinal da equipe chega à cliente').toBe(true)

  const deOutra = await comToken(deFora.accessToken).from('sinais').select('topico').eq('tenant_id', rede.tenantId)
  expect(deOutra.data ?? [], 'a outra rede não vê sinal desta').toEqual([])

  // O sinal não carrega conteúdo: só a rede, o tópico, a chave e quando mudou.
  const { data: colunas } = await db().from('sinais').select('*').eq('tenant_id', rede.tenantId).limit(1)
  expect(Object.keys(colunas?.[0] ?? {}).sort()).toEqual(['chave', 'mudou_em', 'tenant_id', 'topico'])
})

/**
 * O inbox não recarrega a rede inteira a cada recibo (19/11, ao Heitor: "o
 * inbox que pode ter muita atualização e vai atualizar toda rede"). O grosso
 * do volume são os recibos do WhatsApp (enviada, entregue, lida), que só
 * mudam `messages`: eles marcam o sinal DAQUELA conversa (`c:<id>`), que só a
 * tela com ela aberta assina. A lista (`inbox`, a rede) só se move quando muda
 * a conversa (a última mensagem, as não lidas, o status) ou a oportunidade.
 */
test('o recibo do WhatsApp marca só o sinal da conversa: a lista do inbox da rede não se move', async () => {
  const sinal = async (topico: string, chave: string) => {
    const { data } = await db().from('sinais').select('mudou_em')
      .eq('tenant_id', rede.tenantId).eq('topico', topico).eq('chave', chave).maybeSingle<{ mudou_em: string }>()
    return data?.mudou_em ?? null
  }
  const daConversa = `c:${conversaDaRede}`
  const msg = await inserir('messages', {
    conversation_id: conversaDaRede, tenant_id: rede.tenantId, content: `${PREFIXO} saiu ${marca}`, direction: 'outbound', status: 'sent',
  })
  const listaAntes = await sinal('inbox', '')
  const conversaAntes = await sinal('conversa', daConversa)
  expect(listaAntes, 'a mensagem nova (a conversa ganhou a última mensagem) moveu a lista').not.toBeNull()
  expect(conversaAntes, 'a mensagem nova marcou o sinal da conversa').not.toBeNull()

  // O recibo: só `messages.status` muda.
  expect((await db().from('messages').update({ status: 'delivered' }).eq('id', msg)).error).toBeNull()
  expect(await sinal('inbox', ''), 'o recibo não move a lista da rede').toBe(listaAntes)
  const conversaDepois = await sinal('conversa', daConversa)
  expect(conversaDepois, 'o recibo move o sinal da conversa').not.toBe(conversaAntes)

  // Quem lê o sinal da conversa: a equipe da rede; a cliente e a outra rede, não.
  const lido = (token: string) => comToken(token).from('sinais').select('topico, chave').eq('tenant_id', rede.tenantId).eq('chave', daConversa)
  expect((await lido(admin.accessToken)).data, 'a equipe lê o sinal da conversa').toEqual([{ topico: 'conversa', chave: daConversa }])
  expect((await lido(cliente.accessToken)).data ?? [], 'a cliente não').toEqual([])
  expect((await lido(deFora.accessToken)).data ?? [], 'a outra rede não').toEqual([])

  // Mudar a conversa (as não lidas) move os dois: a lista e quem a tem aberta.
  expect((await db().from('conversations').update({ unread_count: 3 }).eq('id', conversaDaRede)).error).toBeNull()
  expect(await sinal('inbox', ''), 'mudar a conversa move a lista').not.toBe(listaAntes)
  expect(await sinal('conversa', daConversa), 'e o sinal da conversa').not.toBe(conversaDepois)
})
