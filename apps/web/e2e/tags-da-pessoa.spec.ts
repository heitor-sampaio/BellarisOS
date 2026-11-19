import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao, chamarAcaoComFormulario } from './apoio/acao-direta'

/**
 * A tag é da PESSOA (o Heitor, 18/11, noite: "a tag é da pessoa e pode ter
 * mais de uma tag"; crm-inbox.md §9.2.1). Uma lista por pessoa — a ficha e os
 * contatos dela, que o banco mantém iguais (20261125500001) —, marcada na
 * ficha, no painel do inbox ou no card, e válida em todo filtro.
 *
 * E a conversa que chega pelo telefone de UMA ficha ativa se liga sozinha a
 * ela (o Heitor, 18/11, noite: "sim, liga sozinha quando bater com uma ficha
 * só"); com duas (mãe e filha no mesmo número), não liga.
 *
 * As conversas nascem direto no banco: a ligação é do gatilho da conversa, o
 * mesmo para o webhook, o "iniciar conversa" e a importação. Rede `[e2e]` própria.
 */

test.describe.configure({ mode: 'serial' })
test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede
let admin: MembroDeTeste
let etapa = ''
const convs: string[] = []

const fone = (n: number) => '5548' + String(Date.now() + n).slice(-9)
const VIP = `VIP ${marca}`
const NOIVA = `Noiva ${marca}`

test.beforeAll(async () => {
  rede = await criarOutraRede(`tgp${marca}`)
  admin = await criarMembro(`tgp${marca}`, { tenant: rede.tenantId, rotulo: 'Admin', donoDaRede: true, permissoes: [] })
  // O vocabulário da rede: as tags que a pessoa marca.
  expect((await db().from('tags').insert([
    { tenant_id: rede.tenantId, nome: VIP }, { tenant_id: rede.tenantId, nome: NOIVA },
  ])).error, 'o vocabulário').toBeNull()
  const f = await db().from('crm_funnels').insert({ tenant_id: rede.tenantId, name: `${PREFIXO} Funil ${marca}`, is_default: true }).select('id').single<{ id: string }>()
  expect(f.error).toBeNull()
  const e = await db().from('crm_stages').insert({ tenant_id: rede.tenantId, funnel_id: f.data!.id, name: 'Novo', position: 0 }).select('id').single<{ id: string }>()
  expect(e.error).toBeNull()
  etapa = e.data!.id
})

test.afterAll(async () => {
  if (convs.length) await db().from('conversations').delete().in('id', convs)
  await admin?.limpar()
  await rede?.limpar()
})

async function como<T>(browser: Browser, fn: (p: Page) => Promise<T>): Promise<T> {
  const ctx = await browser.newContext({ storageState: admin.estado })
  try { return await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function ficha(nome: string, telefone: string, extra: Record<string, unknown> = {}) {
  const { data, error } = await db().from('clients').insert({
    tenant_id: rede.tenantId, branch_id: rede.branchId, name: `${PREFIXO} ${nome} ${marca}`, phone: telefone, is_active: true, ...extra,
  }).select('id').single<{ id: string }>()
  expect(error, `a ficha ${nome}`).toBeNull()
  return data!.id
}

async function conversa(nome: string, telefone: string) {
  const { data, error } = await db().from('conversations').insert({
    tenant_id: rede.tenantId, status: 'open', channel: 'whatsapp', provider: 'uazapi',
    contact_name: `${PREFIXO} ${nome} ${marca}`, contact_phone: telefone, contact_external_id: telefone,
    contact_aliases: [telefone], last_message_at: new Date().toISOString(),
  }).select('id, contato_id').single<{ id: string; contato_id: string }>()
  expect(error, `a conversa de ${nome}`).toBeNull()
  convs.push(data!.id)
  return data!
}

const doContato = async (id: string) =>
  (await db().from('contacts').select('client_id, tags').eq('id', id).single<{ client_id: string | null; tags: string[] }>()).data!
const daFicha = async (id: string) =>
  (await db().from('clients').select('tags').eq('id', id).single<{ tags: string[] }>()).data!.tags

test('a conversa do telefone de UMA ficha liga sozinha a ela — e aparece no filtro "VIP" do inbox', async ({ browser }) => {
  const telefone = fone(1)
  const cliente = await ficha('Vip', telefone, { tags: [VIP] })
  const c = await conversa('Vip', telefone)

  const { data: conv } = await db().from('conversations').select('client_id').eq('id', c.id).single<{ client_id: string | null }>()
  expect(conv!.client_id, 'a conversa ganhou a ficha').toBe(cliente)
  expect(await doContato(c.contato_id), 'o contato é da ficha, com as tags dela').toEqual({ client_id: cliente, tags: [VIP] })

  const r = await como(browser, p => chamarAcao(p, 'actions/inbox.ts', 'getConversations', '/admin/inbox', [{ filtros: { tags: [VIP] } }]))
  expect(r.texto, 'o filtro "VIP" do inbox acha a conversa nova da cliente VIP').toContain(c.id)
})

test('com DUAS fichas ativas no telefone (mãe e filha), a conversa não liga — fica para a equipe', async () => {
  const telefone = fone(2)
  await ficha('Mãe', telefone, { tags: [VIP] })
  await ficha('Filha', telefone)
  const c = await conversa('Mãe ou filha', telefone)

  const { data: conv } = await db().from('conversations').select('client_id').eq('id', c.id).single<{ client_id: string | null }>()
  expect(conv!.client_id, 'a conversa segue sem ficha').toBeNull()
  expect(await doContato(c.contato_id), 'o contato segue sem ficha e sem tag').toEqual({ client_id: null, tags: [] })
})

test('a ficha inativa não conta: com uma ativa e uma arquivada no telefone, liga à ativa', async () => {
  const telefone = fone(3)
  const ativa = await ficha('Ativa', telefone)
  await ficha('Arquivada', telefone, { is_active: false })
  const c = await conversa('Ativa', telefone)
  expect((await doContato(c.contato_id)).client_id).toBe(ativa)
})

test('marcar no card da oportunidade grava na PESSOA — a ficha e o contato dela', async ({ browser }) => {
  const telefone = fone(4)
  const cliente = await ficha('Card', telefone)
  const c = await conversa('Card', telefone)
  const l = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Card ${marca}`, phone: telefone, conversation_id: c.id, crm_stage_id: etapa,
  }).select('id').single<{ id: string }>()
  expect(l.error).toBeNull()

  const r = await como(browser, p => chamarAcaoComFormulario(p, 'actions/leads.ts', 'updateLead', '/admin/oportunidades', [undefined], {
    _leadId: l.data!.id, _slug: '', name: `${PREFIXO} Card ${marca}`, phone: telefone, email: '', social_media: '', source: '', notes: '',
    tags: JSON.stringify([NOIVA]),
  }))
  expect(r.texto, 'a action não recusa').not.toMatch(/^1:{"error":/m)
  expect(await daFicha(cliente), 'a ficha tem a tag do card').toEqual([NOIVA])
  expect((await doContato(c.contato_id)).tags, 'o contato dela também').toEqual([NOIVA])
})

test('marcar no painel do inbox grava na pessoa, e a ficha acompanha', async ({ browser }) => {
  const telefone = fone(5)
  const cliente = await ficha('Inbox', telefone)
  const c = await conversa('Inbox', telefone)
  const r = await como(browser, p => chamarAcao(p, 'actions/inbox.ts', 'atualizarContato', '/admin/inbox', [c.id, { tags: [VIP, NOIVA] }]))
  expect(r.texto).not.toMatch(/^1:{"error":/m)
  expect([...await daFicha(cliente)].sort(), 'a ficha tem as tags marcadas no inbox').toEqual([NOIVA, VIP].sort())
})

test('marcar na ficha vale no contato (o inbox e o quadro leem dele)', async () => {
  const telefone = fone(6)
  const cliente = await ficha('Ficha', telefone)
  const c = await conversa('Ficha', telefone)
  expect((await db().from('clients').update({ tags: [NOIVA] }).eq('id', cliente)).error).toBeNull()
  expect((await doContato(c.contato_id)).tags).toEqual([NOIVA])
})

test('quando o contato e a ficha se encontram, as tags dos dois se juntam (sem repetir, pelo nome do vocabulário)', async () => {
  // O contato já tinha "noiva" (minúscula) e a ficha "VIP": ao ligar pela
  // oportunidade ("É a mesma pessoa"), a pessoa fica com as duas.
  const telefone = fone(7)
  const k = await db().from('contacts').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Junta ${marca}`, phone: telefone, identifiers: [telefone], tags: [NOIVA.toLowerCase()],
  }).select('id, tags').single<{ id: string; tags: string[] }>()
  expect(k.error).toBeNull()
  expect(k.data!.tags, 'a tag gravada sai com o nome do vocabulário').toEqual([NOIVA])
  const l = await db().from('leads').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Junta ${marca}`, phone: telefone, contato_id: k.data!.id, crm_stage_id: etapa,
  }).select('id').single<{ id: string }>()
  expect(l.error).toBeNull()
  // A ficha nasce DEPOIS (outro telefone, para o caso ser só o "É a mesma pessoa").
  const cliente = await ficha('Junta', fone(8), { tags: [VIP] })
  expect((await db().from('leads').update({ client_id: cliente }).eq('id', l.data!.id)).error).toBeNull()

  expect((await doContato(k.data!.id)).client_id, 'o contato é da ficha').toBe(cliente)
  expect([...await daFicha(cliente)].sort(), 'a ficha juntou').toEqual([NOIVA, VIP].sort())
  expect([...(await doContato(k.data!.id)).tags].sort(), 'o contato também').toEqual([NOIVA, VIP].sort())
})

test('o quadro mostra as tags da pessoa no card (a oportunidade não tem tag própria)', async ({ browser }) => {
  const telefone = fone(9)
  const k = await db().from('contacts').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Quadro ${marca}`, phone: telefone, identifiers: [telefone], tags: [VIP],
  }).select('id').single<{ id: string }>()
  expect(k.error).toBeNull()
  const nome = `${PREFIXO} Quadro ${marca}`
  expect((await db().from('leads').insert({
    tenant_id: rede.tenantId, name: nome, phone: telefone, contato_id: k.data!.id, crm_stage_id: etapa,
  })).error).toBeNull()
  await como(browser, async p => {
    await p.goto('/admin/oportunidades')
    await expect(p.locator('[data-lead-card]').filter({ hasText: nome }), 'o card mostra a tag da pessoa').toContainText(VIP)
  })
})
