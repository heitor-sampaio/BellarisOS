import { test, expect, type Browser } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'
import { membroDoCrm, type MembroDeTeste } from './apoio/sessao'

/**
 * Sem o "só os meus" no inbox (SM3, o Heitor, 2026-11-23: "quem quer ver só
 * as oportunidades que é dono, aplica o filtro"). Saiu o refino "pela pessoa
 * ou pela conversa" (`tenants.inbox_visibilidade`) e a escolha dele na aba
 * Cargos: quem tem o CRM vê as conversas de todos (as caixas do cargo
 * continuam — `inbox-caixas-do-cargo.spec.ts`).
 *
 * O cenário é o do handoff: a Ana tem duas threads (marketing e unidade) e uma
 * oportunidade de OUTRO dono, aberta na thread do marketing. A Bia não tem
 * oportunidade nenhuma — é o controle.
 */

const marca = Date.now().toString(36)
const ANA = `${PREFIXO} Ana ${marca}`
const BIA = `${PREFIXO} Bia ${marca}`

interface Cenario {
  caixas: string[]
  convIds: string[]
  leadIds: string[]
  foneAna: string
  threadMkt: string
}

async function montar(): Promise<Cenario> {
  const db     = banco()
  const tenant = await tenantId()
  const foneAna = '5548' + String(Date.now() + 31).slice(-9)
  const foneBia = '5548' + String(Date.now() + 37).slice(-9)
  const c: Cenario = { caixas: [], convIds: [], leadIds: [], foneAna, threadMkt: '' }

  for (const rotulo of ['Mkt', 'Unid']) {
    const { data, error } = await db.from('whatsapp_numbers')
      .insert({
        tenant_id: tenant, provider: 'uazapi', label: `${PREFIXO} Vis ${rotulo} ${marca}`,
        is_active: true, config: { token: `e2e-vis-${rotulo}-${marca}`, baseUrl: 'https://e2e.invalido' },
      })
      .select('id').single<{ id: string }>()
    expect(error, `criar a caixa ${rotulo}`).toBeNull()
    c.caixas.push(data!.id)
  }

  const agora = new Date().toISOString()
  const thread = async (nome: string, fone: string, caixa: string) => {
    const { data, error } = await db.from('conversations')
      .insert({
        tenant_id: tenant, channel: 'whatsapp', status: 'open', provider: 'uazapi',
        whatsapp_number_id: caixa, contact_name: nome, contact_phone: fone,
        contact_external_id: fone, contact_aliases: [fone],
        last_message_at: agora, last_message: 'oi',
      })
      .select('id').single<{ id: string }>()
    expect(error, `criar a thread de ${nome}`).toBeNull()
    c.convIds.push(data!.id)
    return data!.id
  }

  c.threadMkt = await thread(ANA, foneAna, c.caixas[0]!)
  await thread(ANA, foneAna, c.caixas[1]!)
  await thread(BIA, foneBia, c.caixas[0]!)

  // A oportunidade da Ana é do ADMIN — outro dono, para o SDR.
  const { data: admin } = await db.from('users').select('id')
    .eq('email', process.env.E2E_ADMIN_EMAIL ?? 'admin@bellaris.com.br').single<{ id: string }>()
  const { data: etapa } = await db.from('crm_stages').select('id')
    .eq('tenant_id', tenant).eq('outcome', 'OPEN').limit(1).single<{ id: string }>()
  const { data: lead, error } = await db.from('leads')
    .insert({
      tenant_id: tenant, name: ANA, phone: foneAna, crm_stage_id: etapa!.id,
      owner_id: admin!.id, conversation_id: c.threadMkt,
    })
    .select('id').single<{ id: string }>()
  expect(error, 'criar a oportunidade do outro dono').toBeNull()
  c.leadIds.push(lead!.id)
  // Como `criarOportunidade` faz: a thread de origem aponta para o card.
  await db.from('conversations').update({ lead_id: lead!.id }).eq('id', c.threadMkt)

  return c
}

async function desmontar(c: Cenario) {
  const db = banco()
  await db.from('conversations').update({ lead_id: null }).in('id', c.convIds)
  if (c.leadIds.length) {
    await db.from('lead_events').delete().in('lead_id', c.leadIds)
    await db.from('leads').delete().in('id', c.leadIds)
  }
  await apagarConversas(c.convIds)
  if (c.caixas.length) await db.from('whatsapp_numbers').delete().in('id', c.caixas)
}

async function inboxDoSdr(browser: Browser, sdr: MembroDeTeste) {
  const ctx  = await browser.newContext({ storageState: sdr.estado })
  const page = await ctx.newPage()
  await page.goto('/admin/inbox')
  await page.waitForLoadState('networkidle')
  return { ctx, page }
}

test.describe.serial('inbox sem o "só os meus"', () => {
  let sdr: MembroDeTeste | null = null
  let cenario: Cenario | null = null

  test.beforeAll(async () => {
    sdr = await membroDoCrm(marca)
    cenario = await montar()
  })

  test.afterAll(async () => {
    if (cenario) await desmontar(cenario)
    if (sdr) await sdr.limpar()
  })

  // Sem o "só os meus" (SM3, o Heitor, 2026-11-23): quem tem o CRM vê a pessoa de outro dono.
  test('com o CRM em Gerenciar, a pessoa com oportunidade só de outro dono aparece', async ({ browser }) => {
    const { ctx, page } = await inboxDoSdr(browser, sdr!)
    try {
      await expect(page.getByText(BIA).first(), 'o controle: sem oportunidade, aparece').toBeVisible()
      await expect(page.getByText(ANA).first(), 'a Ana, de outro dono, também aparece').toBeVisible()
    } finally {
      await ctx.close()
    }
  })

  // Sem o "só os meus" (SM3, o Heitor, 2026-11-23): a thread de outro dono abre pelo id.
  test('a thread de outro dono abre pelo id, com as mensagens', async ({ browser }) => {
    const db = banco()
    const texto = `segredo-ana-${marca}`
    const { error } = await db.from('messages').insert({
      conversation_id: cenario!.threadMkt, tenant_id: await tenantId(), direction: 'inbound',
      content: texto, channel: 'manual', status: 'delivered',
    })
    expect(error, 'criar a mensagem da Ana').toBeNull()

    const ctx  = await browser.newContext({ storageState: sdr!.estado })
    const page = await ctx.newPage()
    // O corpo pela rota (`route.fetch`): o Chromium às vezes não guarda o da
    // resposta de uma action (ver `inbox-caixas-do-cargo.spec.ts`).
    const corpos: string[] = []
    await page.route('**/admin/inbox**', async route => {
      const req = route.request()
      if (req.method() !== 'POST' || !req.headers()['next-action']) return route.continue()
      const resposta = await route.fetch()
      const corpo = await resposta.text()
      corpos.push(corpo)
      await route.fulfill({ response: resposta, body: corpo })
    })
    try {
      await page.goto(`/admin/inbox?c=${cenario!.threadMkt}`)
      await page.waitForLoadState('networkidle')
      expect(corpos.length, 'a tela tem de ter pedido as mensagens').toBeGreaterThan(0)
      expect(corpos.join('\n'), 'a thread de outro dono sai pelo id').toContain(texto)
    } finally {
      await ctx.close()
    }
  })
})
