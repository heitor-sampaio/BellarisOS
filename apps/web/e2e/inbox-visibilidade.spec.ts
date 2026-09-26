import { test, expect, type Browser } from '@playwright/test'
import { banco, tenantId, PREFIXO, apagarConversas } from './apoio/banco'
import { membroComEscopoProprio, type MembroDeTeste } from './apoio/sessao'

/**
 * Com "só os próprios leads", o inbox segue a PESSOA ou a CONVERSA — escolha da
 * clínica em Configurações → Cargos (`tenants.inbox_visibilidade`).
 *
 * O cenário é o do handoff: a Ana tem duas threads (marketing e unidade) e uma
 * oportunidade de OUTRO dono, aberta na thread do marketing. A Bia não tem
 * oportunidade nenhuma — é o controle: sem ela, uma lista vazia por qualquer
 * outro motivo passaria por "escondeu certo".
 *
 * - Pela pessoa: a Ana some inteira para o SDR; ao ganhar oportunidade dele,
 *   aparece.
 * - Pela conversa: a thread da unidade, sem oportunidade, fica no bolo comum —
 *   a Ana aparece para o SDR mesmo sendo de outro dono. É o vazamento que o
 *   modo "pessoa" fecha, e é exatamente o que a clínica escolhe aceitar.
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

async function modo(valor: 'pessoa' | 'conversa') {
  const { error } = await banco().from('tenants')
    .update({ inbox_visibilidade: valor }).eq('id', await tenantId())
  expect(error, `pôr o inbox em "${valor}"`).toBeNull()
}

async function inboxDoSdr(browser: Browser, sdr: MembroDeTeste) {
  const ctx  = await browser.newContext({ storageState: sdr.estado })
  const page = await ctx.newPage()
  await page.goto('/admin/inbox')
  await page.waitForLoadState('networkidle')
  return { ctx, page }
}

test.describe.serial('inbox com "só os próprios leads"', () => {
  let sdr: MembroDeTeste | null = null
  let cenario: Cenario | null = null

  test.beforeAll(async () => {
    sdr = await membroComEscopoProprio(marca)
    cenario = await montar()
  })

  test.afterAll(async () => {
    await modo('pessoa')
    if (cenario) await desmontar(cenario)
    if (sdr) await sdr.limpar()
  })

  test('pela pessoa: quem é de outro dono some inteiro, e aparece ao ganhar oportunidade sua', async ({ browser }) => {
    await modo('pessoa')
    const { ctx, page } = await inboxDoSdr(browser, sdr!)
    try {
      await expect(page.getByText(BIA).first(), 'o controle: sem oportunidade, aparece para todos').toBeVisible()
      await expect(page.getByText(ANA),
        'a Ana tem oportunidade só de outro dono — nenhuma thread dela pode aparecer',
      ).toHaveCount(0)

      // O SDR abre uma oportunidade com ela (sem conversa, como o cadastro
      // manual): o gatilho a acha pelo telefone, e ela passa a ser dele também.
      const db = banco()
      const { data: etapa } = await db.from('crm_stages').select('id')
        .eq('tenant_id', await tenantId()).eq('outcome', 'OPEN').limit(1).single<{ id: string }>()
      const { data: minha, error } = await db.from('leads')
        .insert({
          tenant_id: await tenantId(), name: ANA, phone: cenario!.foneAna,
          crm_stage_id: etapa!.id, owner_id: sdr!.userId,
        })
        .select('id').single<{ id: string }>()
      expect(error, 'criar a oportunidade do SDR').toBeNull()
      cenario!.leadIds.push(minha!.id)

      await page.reload()
      await page.waitForLoadState('networkidle')
      await expect(page.getByText(ANA).first(), 'com oportunidade dele, a pessoa aparece').toBeVisible()

      // Tira de novo, para o próximo cenário começar do mesmo lugar.
      await db.from('lead_events').delete().eq('lead_id', minha!.id)
      await db.from('leads').delete().eq('id', minha!.id)
      cenario!.leadIds = cenario!.leadIds.filter(id => id !== minha!.id)
    } finally {
      await ctx.close()
    }
  })

  test('pela conversa: a thread sem oportunidade fica no bolo comum', async ({ browser }) => {
    await modo('conversa')
    const { ctx, page } = await inboxDoSdr(browser, sdr!)
    try {
      await expect(page.getByText(BIA).first()).toBeVisible()
      // A thread da unidade não tem oportunidade: aparece, mesmo a Ana sendo de
      // outro dono. É o que a clínica aceita ao escolher "pela conversa".
      await expect(page.getByText(ANA).first()).toBeVisible()
    } finally {
      await ctx.close()
    }
  })
})

test('a escolha é feita na aba Cargos e fica gravada', async ({ page }) => {
  const db = banco()
  const tenant = await tenantId()
  try {
    await modo('pessoa')
    await page.goto('/admin/settings?tab=permissions')
    await page.waitForLoadState('networkidle')

    const secao = page.getByRole('region', { name: /Inbox de quem vê só os próprios leads/ })
    await expect(secao).toBeVisible()
    await expect(secao.getByTestId('explicacao-visibilidade')).toContainText('todas as conversas dela')

    await secao.getByRole('button', { name: 'Pela conversa' }).click()
    await expect(secao.getByText('Salvo')).toBeVisible()
    await expect(secao.getByTestId('explicacao-visibilidade')).toContainText('conforme a oportunidade aberta nela')

    const { data } = await db.from('tenants').select('inbox_visibilidade').eq('id', tenant).single()
    expect(data!.inbox_visibilidade, 'a tela disse "Salvo" — o banco tem de concordar').toBe('conversa')
  } finally {
    await modo('pessoa')
  }
})
