import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarClientes } from './apoio/limpeza'

/**
 * D-9 (decisão do Heitor, frente de cadastro de 2026-10-29): cadastrar a
 * cliente com o telefone de um lead do CRM — inclusive o PERDIDO que voltou —
 * perguntava nada e criava uma ficha solta: o card continuava "Ainda não é
 * cliente" e a conversa sem o selo. Agora a tela pergunta "É a mesma pessoa do
 * lead X?": Sim liga a oportunidade e a conversa da pessoa à ficha nova; Não
 * cadastra sem ligar. Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let comercial: MembroDeTeste | null = null
let etapaPerdida = ''
let etapaAberta = ''
const nome = (r: string) => `${PREFIXO} Mesma pessoa ${r} ${marca}`
const sufixo = String(Date.now()).slice(-4)

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: comercial!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function preencher(p: Page, dados: { nome: string; telefone: string }) {
  await p.goto('/admin/clients/new')
  await expect(async () => {
    await p.locator('input[name="name"]').fill(dados.nome)
    await p.locator('input[name="phone"]').fill('')
    await p.locator('input[name="phone"]').fill(dados.telefone)
    await expect(p.locator('input[name="phone"]')).toHaveValue(/\(\d\d\)/, { timeout: 1000 })
  }).toPass()
}

/** O lead (o gatilho dá a ele a pessoa pelo telefone) e uma conversa da mesma pessoa. */
async function leadComConversa(rotulo: string, whatsapp: string, etapa: string, perdido = false) {
  const { data: lead, error } = await db().from('leads').insert({
    tenant_id: rede!.tenantId, name: nome(rotulo), phone: whatsapp, crm_stage_id: etapa,
    ...(perdido ? { perdido_em: new Date().toISOString() } : {}),
  }).select('id, contato_id').single<{ id: string; contato_id: string }>()
  expect(error).toBeNull()
  const { data: conversa, error: e2 } = await db().from('conversations').insert({
    tenant_id: rede!.tenantId, channel: 'whatsapp', contact_phone: whatsapp, contact_name: nome(rotulo),
    contato_id: lead!.contato_id, contact_aliases: [whatsapp],
  }).select('id').single<{ id: string }>()
  expect(e2).toBeNull()
  return { leadId: lead!.id, contatoId: lead!.contato_id, conversaId: conversa!.id }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`mp${marca}`)
  const { data: funil } = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: 'F', is_default: true, position: 0 }).select('id').single<{ id: string }>()
  const { data: aberta } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Novo', color: '#c34d6b', position: 0, outcome: 'OPEN' }).select('id').single<{ id: string }>()
  const { data: perdida } = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: funil!.id, name: 'Perdido', color: '#c34d6b', position: 1, outcome: 'LOST' }).select('id').single<{ id: string }>()
  etapaAberta = aberta!.id
  etapaPerdida = perdida!.id
  comercial = await criarMembro(`mp${marca}`, {
    tenant: rede.tenantId, rotulo: 'Comercial',
    permissoes: [{ modulo: 'crm', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'MANAGE' }, { modulo: 'agenda', nivel: 'MANAGE' }],
  })
})

test.afterAll(async () => {
  if (rede) {
    await db().from('conversations').update({ client_id: null }).eq('tenant_id', rede.tenantId)
    await db().from('leads').update({ client_id: null }).eq('tenant_id', rede.tenantId)
    const { data } = await db().from('clients').select('id').eq('tenant_id', rede.tenantId).like('name', `%Mesma pessoa%${marca}`)
    expect(await apagarClientes((data ?? []).map(c => c.id as string))).toEqual([])
    const { data: leads } = await db().from('leads').select('id').eq('tenant_id', rede.tenantId)
    const ids = (leads ?? []).map(l => l.id as string)
    if (ids.length) { await db().from('lead_events').delete().in('lead_id', ids); await db().from('leads').delete().in('id', ids) }
    await db().from('conversations').delete().eq('tenant_id', rede.tenantId)
    await db().from('contacts').delete().eq('tenant_id', rede.tenantId)
  }
  await comercial?.limpar()
  await rede?.limpar()
})

const fichaDe = async (n: string) => (await db().from('clients').select('id')
  .eq('tenant_id', rede!.tenantId).eq('name', n).maybeSingle<{ id: string }>()).data

test('o telefone do lead PERDIDO que voltou: "É a mesma pessoa do lead X?" — Sim liga a oportunidade e a conversa', async ({ browser }) => {
  const nacional = `489${sufixo}0001`
  const { leadId, conversaId } = await leadComConversa('lead perdido', `55${nacional}`, etapaPerdida, true)

  await como(browser, async p => {
    await preencher(p, { nome: nome('voltou'), telefone: nacional })
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    const pergunta = p.getByRole('alert').filter({ hasText: 'É a mesma pessoa' })
    await expect(pergunta).toContainText(`É a mesma pessoa do lead ${nome('lead perdido')}?`)
    await expect(pergunta).toContainText('perdida')
    expect(await fichaDe(nome('voltou')), 'perguntar não cadastra').toBeNull()

    await pergunta.getByRole('button', { name: 'Sim, é a mesma pessoa' }).click()
    await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
  })
  const ficha = await fichaDe(nome('voltou'))
  expect(ficha).toBeTruthy()
  const { data: lead } = await db().from('leads').select('client_id').eq('id', leadId).single<{ client_id: string | null }>()
  expect(lead?.client_id, 'a oportunidade passa a ser da cliente').toBe(ficha!.id)
  const { data: conversa } = await db().from('conversations').select('client_id').eq('id', conversaId).single<{ client_id: string | null }>()
  expect(conversa?.client_id, 'a conversa ganha o selo de cliente').toBe(ficha!.id)
  const { data: eventos } = await db().from('lead_events').select('type').eq('lead_id', leadId).eq('type', 'CONVERTED')
  expect(eventos ?? [], 'a linha do tempo do card registra a conversão').toHaveLength(1)
})

test('"Não, é outra pessoa": cadastra sem ligar nada', async ({ browser }) => {
  const nacional = `489${sufixo}0002`
  const { leadId, conversaId } = await leadComConversa('lead aberto', `55${nacional}`, etapaAberta)

  await como(browser, async p => {
    await preencher(p, { nome: nome('outra'), telefone: nacional })
    await p.getByRole('button', { name: 'Cadastrar cliente' }).click()
    const pergunta = p.getByRole('alert').filter({ hasText: 'É a mesma pessoa' })
    await expect(pergunta).toContainText(nome('lead aberto'))
    await pergunta.getByRole('button', { name: 'Não, é outra pessoa' }).click()
    await expect(p).toHaveURL(/\/admin\/clients\/[0-9a-f-]{36}/)
  })
  expect(await fichaDe(nome('outra'))).toBeTruthy()
  const { data: lead } = await db().from('leads').select('client_id').eq('id', leadId).single<{ client_id: string | null }>()
  expect(lead?.client_id).toBeNull()
  const { data: conversa } = await db().from('conversations').select('client_id').eq('id', conversaId).single<{ client_id: string | null }>()
  expect(conversa?.client_id).toBeNull()
})
