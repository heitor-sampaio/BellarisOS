import { test, expect } from '@playwright/test'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { banco, PREFIXO } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, clienteComSessao, type MembroDeTeste, type ClienteDeTeste } from './apoio/sessao'

/**
 * A sessão NUNCA grava (o Heitor, 19/11: "Qualquer gravação que não passa pela
 * validação do backend ta errada e é uma brecha de segurança"; CLAUDE.md §4).
 *
 * A chave pública está no navegador: o que uma política deixa a sessão gravar,
 * qualquer membro (ou cliente) grava direto no PostgREST, sem a trava da
 * action. Até a 20261128100001 sobravam 21 políticas de escrita em 17 tabelas.
 *
 * Duas provas:
 * - a TRAVA: `e2e_gravacoes_pela_sessao()` lista todo caminho de escrita que a
 *   sessão tem no banco (política de escrita, tabela sem RLS, view gravável,
 *   função volátil exposta) — e a lista é vazia. A tabela nova que nascer com
 *   política de escrita derruba este teste;
 * - cada uma das 17 tabelas: a Admin da rede (o cargo que tudo alcança) e a
 *   cliente final tentam inserir, mudar e apagar pela chave pública, e o banco
 *   (lido pelo serviço) não muda.
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
let admin: MembroDeTeste
let cliente: ClienteDeTeste
let outraUnidade = ''
let clienteId = ''
let produtoId = ''
let procedimento2 = ''
let agendamentoId = ''
let leadId = ''
let funilId = ''
let etapaId = ''
let conversaId = ''
let planoId = ''
const limpar: (() => PromiseLike<unknown>)[] = []

async function inserir<T extends { [k: string]: unknown }>(tabela: string, linha: Record<string, unknown>, chave = 'id'): Promise<T> {
  const { data, error } = await db().from(tabela).insert(linha).select('*').single<T>()
  expect(error, `criar a linha de teste em ${tabela}: ${error?.message}`).toBeNull()
  limpar.push(() => db().from(tabela).delete().eq(chave, data![chave] as string))
  return data!
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`sng${marca}`)
  const { data: un, error: eUn } = await db().from('branches')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Unidade 2 ${marca}`, slug: `e2e-un2-${marca}` })
    .select('id').single<{ id: string }>()
  expect(eUn, 'criar a segunda unidade').toBeNull()
  outraUnidade = un!.id
  admin = await criarMembro(`sngA${marca}`, { tenant: rede.tenantId, donoDaRede: true, permissoes: [] })
  cliente = await clienteComSessao(`sngC${marca}`, { id: rede.branchId, slug: `e2e-un-${marca}` }, { tenant: rede.tenantId })
  clienteId = await rede.criarCliente('cliente da ficha')
  produtoId = await rede.criarProduto('produto')
  const { data: pr2, error: ePr2 } = await db().from('procedures')
    .insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Proc 2 ${marca}`, category: 'e2e', duration_min: 30, price: 0 })
    .select('id').single<{ id: string }>()
  expect(ePr2, 'criar o segundo procedimento').toBeNull()
  procedimento2 = pr2!.id

  agendamentoId = (await inserir<{ id: string }>('appointments', {
    branch_id: rede.branchId, client_id: clienteId, professional_id: rede.professionalId, procedure_id: rede.procedureId,
    scheduled_at: new Date(Date.now() + 86_400_000).toISOString(), duration_min: 30, price: 100, status: 'SCHEDULED', notes: 'original',
  })).id
  funilId = (await inserir<{ id: string }>('crm_funnels', { tenant_id: rede.tenantId, name: `${PREFIXO} funil ${marca}`, position: 90 })).id
  etapaId = (await inserir<{ id: string }>('crm_stages', { tenant_id: rede.tenantId, funnel_id: funilId, name: `${PREFIXO} etapa ${marca}`, position: 1 })).id
  const contato = await inserir<{ id: string }>('contacts', { tenant_id: rede.tenantId, name: `${PREFIXO} contato ${marca}`, identifiers: [] })
  leadId = (await inserir<{ id: string }>('leads', { tenant_id: rede.tenantId, name: `${PREFIXO} lead ${marca}`, contato_id: contato.id, crm_stage_id: etapaId })).id
  conversaId = (await inserir<{ id: string }>('conversations', {
    tenant_id: rede.tenantId, branch_id: rede.branchId, contact_name: 'original', channel: 'whatsapp',
  })).id
  planoId = (await inserir<{ id: string }>('treatment_plans', { branch_id: rede.branchId, professional_id: rede.professionalId, client_id: clienteId })).id
})

test.afterAll(async () => {
  for (const f of limpar.reverse()) await f()
  await cliente?.limpar()
  await admin?.limpar()
  await rede?.limpar()
})

test('a trava: a sessão não tem caminho nenhum de escrita no banco', async () => {
  const { data, error } = await db().rpc('e2e_gravacoes_pela_sessao')
  expect(error, error?.message).toBeNull()
  expect(data ?? [], 'política de escrita, tabela sem RLS, view gravável ou função que grava, aberta à sessão').toEqual([])
})

/**
 * Cada caso: a linha que já existe (criada pelo serviço), a coluna que a
 * sessão tenta mudar e a linha que ela tenta inserir — achada depois pelo
 * `marcador`.
 */
interface Caso {
  tabela: string
  quem: 'admin' | 'cliente'
  existente: () => Promise<{ filtro: Record<string, string>; coluna?: string; valor?: unknown }>
  nova: () => Record<string, unknown>
  marcador: Record<string, string>
}

const CASOS: Caso[] = [
  {
    tabela: 'appointments', quem: 'admin',
    existente: async () => ({ filtro: { id: agendamentoId }, coluna: 'notes', valor: `plantada ${marca}` }),
    nova: () => ({ branch_id: rede.branchId, client_id: clienteId, professional_id: rede.professionalId, procedure_id: rede.procedureId,
      scheduled_at: new Date(Date.now() + 2 * 86_400_000).toISOString(), duration_min: 30, price: 1, status: 'SCHEDULED', notes: `nova ${marca}` }),
    marcador: { notes: `nova ${marca}` },
  },
  {
    tabela: 'appointment_history', quem: 'admin',
    existente: async () => {
      const h = await inserir<{ id: string }>('appointment_history', { appointment_id: agendamentoId, changed_by_name: 'e2e', action: 'CREATED', description: 'original' })
      return { filtro: { id: h.id }, coluna: 'description', valor: `plantada ${marca}` }
    },
    nova: () => ({ appointment_id: agendamentoId, changed_by_name: 'e2e', action: 'CREATED', description: `nova ${marca}` }),
    marcador: { description: `nova ${marca}` },
  },
  {
    tabela: 'branch_product_stock', quem: 'admin',
    existente: async () => ({ filtro: { branch_id: rede.branchId, product_id: produtoId }, coluna: 'quantity', valor: 9999 }),
    nova: () => ({ branch_id: outraUnidade, product_id: produtoId, quantity: 9999 }),
    marcador: { branch_id: outraUnidade, product_id: produtoId },
  },
  {
    tabela: 'cash_registers', quem: 'admin',
    existente: async () => {
      const c = await inserir<{ id: string }>('cash_registers', { branch_id: rede.branchId, opened_by: 'e2e', notes: 'original' })
      return { filtro: { id: c.id }, coluna: 'notes', valor: `plantada ${marca}` }
    },
    nova: () => ({ branch_id: rede.branchId, opened_by: `nova ${marca}` }),
    marcador: { opened_by: `nova ${marca}` },
  },
  {
    tabela: 'client_notifications', quem: 'cliente',
    existente: async () => {
      const n = await inserir<{ id: string }>('client_notifications', { client_id: cliente.clientId, title: 'original' })
      return { filtro: { id: n.id }, coluna: 'title', valor: `plantada ${marca}` }
    },
    nova: () => ({ client_id: cliente.clientId, title: `nova ${marca}` }),
    marcador: { title: `nova ${marca}` },
  },
  {
    tabela: 'conversations', quem: 'admin',
    existente: async () => ({ filtro: { id: conversaId }, coluna: 'contact_name', valor: `plantada ${marca}` }),
    nova: () => ({ tenant_id: rede.tenantId, branch_id: rede.branchId, contact_name: `nova ${marca}`, channel: 'whatsapp' }),
    marcador: { contact_name: `nova ${marca}` },
  },
  {
    tabela: 'crm_funnels', quem: 'admin',
    existente: async () => ({ filtro: { id: funilId }, coluna: 'name', valor: `plantada ${marca}` }),
    nova: () => ({ tenant_id: rede.tenantId, name: `nova ${marca}`, position: 91 }),
    marcador: { name: `nova ${marca}` },
  },
  {
    tabela: 'crm_stages', quem: 'admin',
    existente: async () => ({ filtro: { id: etapaId }, coluna: 'name', valor: `plantada ${marca}` }),
    nova: () => ({ tenant_id: rede.tenantId, funnel_id: funilId, name: `nova ${marca}`, position: 2 }),
    marcador: { name: `nova ${marca}` },
  },
  {
    tabela: 'lead_events', quem: 'admin',
    existente: async () => {
      const e = await inserir<{ id: string }>('lead_events', { tenant_id: rede.tenantId, lead_id: leadId, type: 'UPDATED', actor_name: 'original' })
      return { filtro: { id: e.id }, coluna: 'actor_name', valor: `plantada ${marca}` }
    },
    nova: () => ({ tenant_id: rede.tenantId, lead_id: leadId, type: 'UPDATED', actor_name: `nova ${marca}` }),
    marcador: { actor_name: `nova ${marca}` },
  },
  {
    tabela: 'lead_procedures', quem: 'admin',
    existente: async () => {
      const { error } = await db().from('lead_procedures').insert({ lead_id: leadId, procedure_id: rede.procedureId })
      expect(error, 'criar a linha de teste em lead_procedures').toBeNull()
      limpar.push(() => db().from('lead_procedures').delete().eq('lead_id', leadId))
      return { filtro: { lead_id: leadId, procedure_id: rede.procedureId } }
    },
    nova: () => ({ lead_id: leadId, procedure_id: procedimento2 }),
    marcador: { lead_id: leadId, procedure_id: procedimento2 },
  },
  {
    tabela: 'message_templates', quem: 'admin',
    existente: async () => {
      const m = await inserir<{ id: string }>('message_templates', { tenant_id: rede.tenantId, name: `e2e_original_${marca}`, body_text: 'original' })
      return { filtro: { id: m.id }, coluna: 'body_text', valor: `plantada ${marca}` }
    },
    nova: () => ({ tenant_id: rede.tenantId, name: `e2e_nova_${marca}`, body_text: 'nova' }),
    marcador: { name: `e2e_nova_${marca}` },
  },
  {
    tabela: 'messages', quem: 'admin',
    existente: async () => {
      const m = await inserir<{ id: string }>('messages', { tenant_id: rede.tenantId, conversation_id: conversaId, direction: 'inbound', content: 'original' })
      return { filtro: { id: m.id }, coluna: 'content', valor: `plantada ${marca}` }
    },
    nova: () => ({ tenant_id: rede.tenantId, conversation_id: conversaId, direction: 'outbound', content: `nova ${marca}` }),
    marcador: { content: `nova ${marca}` },
  },
  {
    tabela: 'push_tokens', quem: 'admin',
    existente: async () => {
      const p = await inserir<{ id: string }>('push_tokens', { token: `e2e-original-${marca}`, platform: 'android', user_id: admin.userId })
      return { filtro: { id: p.id }, coluna: 'token', valor: `e2e-plantada-${marca}` }
    },
    nova: () => ({ token: `e2e-nova-${marca}`, platform: 'android', user_id: admin.userId }),
    marcador: { token: `e2e-nova-${marca}` },
  },
  {
    tabela: 'stock_transfers', quem: 'admin',
    existente: async () => {
      const t = await inserir<{ id: string }>('stock_transfers', { from_branch_id: rede.branchId, to_branch_id: outraUnidade, requested_by: 'e2e', notes: 'original' })
      return { filtro: { id: t.id }, coluna: 'notes', valor: `plantada ${marca}` }
    },
    nova: () => ({ from_branch_id: rede.branchId, to_branch_id: outraUnidade, requested_by: `nova ${marca}` }),
    marcador: { requested_by: `nova ${marca}` },
  },
  {
    tabela: 'treatment_plan_items', quem: 'admin',
    existente: async () => {
      const i = await inserir<{ id: string }>('treatment_plan_items', { plan_id: planoId, procedure_id: rede.procedureId, unit_price: 10, sort_order: 1 })
      return { filtro: { id: i.id }, coluna: 'unit_price', valor: 9999 }
    },
    nova: () => ({ plan_id: planoId, procedure_id: procedimento2, unit_price: 1, sort_order: 77 }),
    marcador: { plan_id: planoId, procedure_id: procedimento2 },
  },
  {
    tabela: 'user_notifications', quem: 'admin',
    existente: async () => {
      const n = await inserir<{ id: string }>('user_notifications', { user_id: admin.userId, title: 'original' })
      return { filtro: { id: n.id }, coluna: 'title', valor: `plantada ${marca}` }
    },
    nova: () => ({ user_id: admin.userId, title: `nova ${marca}` }),
    marcador: { title: `nova ${marca}` },
  },
  {
    tabela: 'web_push_subscriptions', quem: 'cliente',
    existente: async () => {
      const w = await inserir<{ id: string }>('web_push_subscriptions', { client_id: cliente.clientId, endpoint: `https://e2e.invalid/original-${marca}`, keys: {} })
      return { filtro: { id: w.id }, coluna: 'endpoint', valor: `https://e2e.invalid/plantada-${marca}` }
    },
    nova: () => ({ client_id: cliente.clientId, endpoint: `https://e2e.invalid/nova-${marca}`, keys: {} }),
    marcador: { endpoint: `https://e2e.invalid/nova-${marca}` },
  },
]

/** `.eq` de cada coluna do filtro (a chave de `branch_product_stock` e de `lead_procedures` é dupla). */
function filtrar<Q>(q: Q, filtro: Record<string, string>): Q {
  let r = q as unknown as { eq(c: string, v: string): unknown }
  for (const [c, v] of Object.entries(filtro)) r = r.eq(c, v) as typeof r
  return r as unknown as Q
}

for (const caso of CASOS) {
  test(`${caso.tabela}: ${caso.quem === 'admin' ? 'a Admin da rede' : 'a cliente'} não insere, não muda e não apaga pela chave pública`, async () => {
    const s = comToken(caso.quem === 'admin' ? admin.accessToken : cliente.accessToken)
    const { filtro, coluna, valor } = await caso.existente()
    const antes = (await filtrar(db().from(caso.tabela).select('*'), filtro)).data ?? []
    expect(antes.length, 'a linha de teste existe').toBe(1)

    // Os novos que a sessão plantar saem no fim, se a regressão voltar.
    limpar.push(() => filtrar(db().from(caso.tabela).delete(), caso.marcador))

    await s.from(caso.tabela).insert(caso.nova())
    if (coluna) await filtrar(s.from(caso.tabela).update({ [coluna]: valor }), filtro)
    await filtrar(s.from(caso.tabela).delete(), filtro)

    const novos = (await filtrar(db().from(caso.tabela).select('*'), caso.marcador)).data ?? []
    expect(novos, 'a linha não nasce pela sessão').toEqual([])
    const depois = (await filtrar(db().from(caso.tabela).select('*'), filtro)).data ?? []
    expect(depois, 'a linha não muda nem some pela sessão').toEqual(antes)
  })
}
