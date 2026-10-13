import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO, apagarConversas } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { chamarAcao } from './apoio/acao-direta'
import { subirUazapiFalsa, type UazapiFalsa } from './apoio/uazapi-falsa'

/**
 * O histórico do WhatsApp Web (uazapi) vem para o inbox (pedido do Heitor,
 * 2026-10-13). Ao parear, o WhatsApp manda à instância um recorte recente das
 * conversas; a uazapi o guarda, e o BellarisOS o busca (`/chat/find` +
 * `/message/find`) e grava como IMPORTADO — lido, sem disparar automação —,
 * como o histórico da coexistência. Grupo fica de fora. Trazer de novo não
 * duplica nada.
 *
 * Numa rede `[e2e]` própria, com a uazapi falsa.
 */

test.describe.configure({ mode: 'serial' })

const marca = Date.now().toString(36)
const db = () => banco()
let outra: OutraRede
let membro: MembroDeTeste
let alheio: MembroDeTeste
let outraAlheia: OutraRede
let falsa: UazapiFalsa
let caixa: string
const FONE_A = `5548${String(Date.now()).slice(-9)}`
const FONE_B = `5547${String(Date.now()).slice(-9)}`
const agora = Date.now()

test.beforeAll(async () => {
  test.setTimeout(240_000)
  falsa = await subirUazapiFalsa()
  falsa.historico = {
    status: { processingComplete: true, progress: 100, diagnosis: [] },
    chats: [
      { wa_chatid: `${FONE_A}@s.whatsapp.net`, phone: FONE_A, wa_contactName: `${PREFIXO} Ana ${marca}`, wa_isGroup: false, wa_lastMsgTimestamp: agora - 60_000 },
      { wa_chatid: `1203630${marca}@g.us`, wa_name: 'Grupo', wa_isGroup: true, wa_lastMsgTimestamp: agora - 120_000 },
      { wa_chatid: `${FONE_B}@s.whatsapp.net`, phone: FONE_B, wa_contactName: `${PREFIXO} Bia ${marca}`, wa_isGroup: false, wa_lastMsgTimestamp: agora - 86_400_000 },
    ],
    mensagens: {
      [`${FONE_A}@s.whatsapp.net`]: [
        // A uazapi devolve da mais recente para a mais antiga.
        { messageid: `H${marca}A3`, chatid: `${FONE_A}@s.whatsapp.net`, fromMe: true, text: 'Temos às 15h!', messageTimestamp: agora - 60_000 },
        { messageid: `H${marca}A2`, chatid: `${FONE_A}@s.whatsapp.net`, fromMe: false, sender_pn: `${FONE_A}@s.whatsapp.net`, text: 'Tem horário amanhã?', messageTimestamp: agora - 120_000 },
        { messageid: `H${marca}A1`, chatid: `${FONE_A}@s.whatsapp.net`, fromMe: false, sender_pn: `${FONE_A}@s.whatsapp.net`, text: 'Oi!', messageTimestamp: agora - 180_000 },
      ],
      [`1203630${marca}@g.us`]: [
        { messageid: `H${marca}G1`, chatid: `1203630${marca}@g.us`, isGroup: true, fromMe: false, text: 'mensagem de grupo', messageTimestamp: agora - 120_000 },
      ],
      [`${FONE_B}@s.whatsapp.net`]: [
        { messageid: `H${marca}B1`, chatid: `${FONE_B}@s.whatsapp.net`, fromMe: false, sender_pn: `${FONE_B}@s.whatsapp.net`, text: 'Bom dia', messageTimestamp: agora - 86_400_000 },
      ],
    },
  }
  outra = await criarOutraRede(`hist${marca}`)
  outraAlheia = await criarOutraRede(`histx${marca}`)
  membro = await criarMembro(`hist${marca}`, { tenant: outra.tenantId, rotulo: 'Config', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
  alheio = await criarMembro(`histx${marca}`, { tenant: outraAlheia.tenantId, rotulo: 'Config', permissoes: [{ modulo: 'settings', nivel: 'MANAGE' }] })
  const { data, error } = await db().from('whatsapp_numbers').insert({
    tenant_id: outra.tenantId, provider: 'uazapi', label: `${PREFIXO} Recepção ${marca}`, is_active: true,
    config: { token: `e2e-hist-${marca}`, baseUrl: falsa.url },
  }).select('id').single<{ id: string }>()
  expect(error, 'criar a caixa').toBeNull()
  caixa = data!.id
})
test.afterAll(async () => {
  const b = db()
  if (outra) {
    const { data } = await b.from('conversations').select('id').eq('tenant_id', outra.tenantId)
    await apagarConversas((data ?? []).map(c => c.id as string))
    await b.from('domain_events').delete().eq('tenant_id', outra.tenantId)
    await b.from('contacts').delete().eq('tenant_id', outra.tenantId)
    await b.from('whatsapp_historicos').delete().eq('tenant_id', outra.tenantId)
    await b.from('whatsapp_numbers').delete().eq('tenant_id', outra.tenantId)
  }
  await membro?.limpar(); await alheio?.limpar()
  await outra?.limpar(); await outraAlheia?.limpar()
  await falsa?.fechar()
})

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}
const trazer = (p: Page) => chamarAcao(p, 'actions/uazapi-connection.ts', 'trazerHistoricoUazapi', '/admin/settings', [caixa])
const importacao = async () => (await db().from('whatsapp_historicos')
  .select('status, conversas, mensagens, erro').eq('whatsapp_number_id', caixa).order('criada_em', { ascending: false }).limit(1)).data?.[0]
const mensagensDe = async (fone: string) => {
  const { data: conv } = await db().from('conversations').select('id').eq('tenant_id', outra.tenantId).eq('contact_phone', fone).maybeSingle()
  if (!conv) return []
  return ((await db().from('messages').select('content, direction, importada, is_read, external_id, whatsapp_number_id')
    .eq('conversation_id', conv.id).order('created_at')).data ?? []) as
    { content: string; direction: string; importada: boolean; is_read: boolean; external_id: string; whatsapp_number_id: string }[]
}

test('quem é de outra rede não traz o histórico da caixa', async ({ browser }) => {
  await como(browser, alheio, async p => {
    await trazer(p)
    await p.waitForTimeout(1500)
    expect(await importacao()).toBeUndefined()
  })
})

test('trazer o histórico grava as conversas como importadas — lidas, na caixa, sem grupo e sem evento', async ({ browser }) => {
  await como(browser, membro, async p => {
    const r = await trazer(p)
    expect(r.texto).toContain('"ok":true')
    await expect.poll(async () => (await importacao())?.status, { timeout: 60_000 }).toBe('concluida')
    expect(await importacao()).toMatchObject({ conversas: 2, mensagens: 4, erro: null })
  })

  expect(await mensagensDe(FONE_A)).toEqual([
    { content: 'Oi!', direction: 'inbound', importada: true, is_read: true, external_id: `H${marca}A1`, whatsapp_number_id: caixa },
    { content: 'Tem horário amanhã?', direction: 'inbound', importada: true, is_read: true, external_id: `H${marca}A2`, whatsapp_number_id: caixa },
    { content: 'Temos às 15h!', direction: 'outbound', importada: true, is_read: true, external_id: `H${marca}A3`, whatsapp_number_id: caixa },
  ])
  expect((await mensagensDe(FONE_B)).map(m => m.content)).toEqual(['Bom dia'])
  const { count: deGrupo } = await db().from('messages').select('id', { count: 'exact', head: true })
    .eq('tenant_id', outra.tenantId).eq('content', 'mensagem de grupo')
  expect(deGrupo).toBe(0)
  // O nome da conversa vem do WhatsApp.
  const { data: conv } = await db().from('conversations').select('contact_name').eq('tenant_id', outra.tenantId).eq('contact_phone', FONE_A).single()
  expect(conv?.contact_name).toBe(`${PREFIXO} Ana ${marca}`)
  // Nada de "conversa iniciada" nem "mensagem recebida": a automação de boas-
  // vindas responderia a conversas de semanas atrás.
  const { count: eventos } = await db().from('domain_events').select('id', { count: 'exact', head: true })
    .eq('tenant_id', outra.tenantId).like('nome', 'conversa.%')
  expect(eventos).toBe(0)
})

test('trazer de novo não duplica nada', async ({ browser }) => {
  await como(browser, membro, async p => {
    expect((await trazer(p)).texto).toContain('"ok":true')
    await expect.poll(async () => (await importacao())?.status, { timeout: 60_000 }).toBe('concluida')
    expect(await importacao()).toMatchObject({ mensagens: 0 })
  })
  expect(await mensagensDe(FONE_A)).toHaveLength(3)
})
