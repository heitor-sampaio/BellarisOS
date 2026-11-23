import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os filtros da Agenda (o Heitor, 18/11 — a agenda só tinha "mostrar
 * cancelados" e dia/semana/mês: "Então precisa arrumar"; e a regra das Tags,
 * CLAUDE.md §1): profissional, sala e tag, nos dois portais, NA CONSULTA — a
 * URL com `?profissional=` não traz o agendamento de outra pessoa (nem no HTML:
 * não é recorte no navegador), e o pedido não vence a vista pessoal (a
 * "Minha agenda", SM2 — o "só os meus" saiu em 2026-11-23).
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let outra: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let daRede: MembroDeTeste | null = null
let pessoal: MembroDeTeste | null = null
let slug = ''
let salaRosa = ''
let salaAzul = ''
let daAna = ''   // a profissional da rede, Sala Rosa, cliente VIP
let daOutra = '' // a outra profissional, Sala Azul, cliente sem tag
const AMANHA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(Date.now() + 86_400_000))

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`fil${marca}`)
  expect((await db().from('users').update({ branch_id: rede.branchId, provides_services: true }).eq('id', rede.professionalId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug

  // Uma segunda pessoa que atende na unidade.
  outra = await criarMembro(`filo${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Atende', atendeEm: [rede.branchId],
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', outra.userId)).error).toBeNull()
  recepcao = await criarMembro(`filr${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }],
  })
  daRede = await criarMembro(`filn${marca}`, {
    tenant: rede.tenantId, branchId: null, rotulo: 'Rede', permissoes: [{ modulo: 'agenda', nivel: 'VIEW' }],
  })
  // A vista pessoal (SM2, o Heitor, 2026-11-23): atende e não tem a Agenda
  // (era a Agenda em Ver "só os meus", que saiu — SM1).
  pessoal = await criarMembro(`filp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Vista pessoal', atendeEm: [rede.branchId],
    permissoes: [{ modulo: 'agenda', nivel: 'NONE' }],
  })

  const salas = await db().from('rooms').insert([
    { branch_id: rede.branchId, name: `Sala Rosa ${marca}` },
    { branch_id: rede.branchId, name: `Sala Azul ${marca}` },
  ]).select('id, name')
  expect(salas.error, 'criar as salas').toBeNull()
  salaRosa = salas.data!.find(s => (s.name as string).startsWith('Sala Rosa'))!.id as string
  salaAzul = salas.data!.find(s => (s.name as string).startsWith('Sala Azul'))!.id as string

  // A tag entra no vocabulário da rede pelo gatilho (a rede nasce sem tags).
  const vip = await rede.criarCliente('Vip')
  expect((await db().from('clients').update({ tags: ['VIP'] }).eq('id', vip)).error).toBeNull()
  const semTag = await rede.criarCliente('SemTag')

  const base = { branch_id: rede.branchId, procedure_id: rede.procedureId, source: 'INTERNAL', status: 'SCHEDULED', duration_min: 30, price: 0 }
  const ags = await db().from('appointments').insert([
    { ...base, client_id: vip, professional_id: rede.professionalId, room_id: salaRosa, scheduled_at: new Date(`${AMANHA}T10:00:00-03:00`).toISOString() },
    { ...base, client_id: semTag, professional_id: outra.userId, room_id: salaAzul, scheduled_at: new Date(`${AMANHA}T11:00:00-03:00`).toISOString() },
  ]).select('id, professional_id')
  expect(ags.error, 'agendar').toBeNull()
  daAna = ags.data!.find(a => a.professional_id === rede!.professionalId)!.id as string
  daOutra = ags.data!.find(a => a.professional_id === outra!.userId)!.id as string
})

test.afterAll(async () => {
  for (const m of [pessoal, daRede, recepcao, outra]) await m?.limpar()
  await rede?.limpar()
})

test.describe('os filtros da agenda da unidade', () => {
  test('?profissional= traz só os dela — o outro nem chega à página', async ({ browser }) => {
    await como(browser, recepcao!, async p => {
      const resposta = await p.goto(`/${slug}/agenda?date=${AMANHA}&profissional=${outra!.userId}`)
      await expect(p.locator(`[data-agendamento="${daOutra}"]`).first()).toBeVisible()
      await expect(p.locator(`[data-agendamento="${daAna}"]`)).toHaveCount(0)
      // Na CONSULTA: o id do outro agendamento não vem no HTML (não é recorte no navegador).
      expect(await resposta!.text()).not.toContain(daAna)
      // O escolhido aparece no rótulo do filtro.
      await expect(p.locator('[data-filtro-profissional] button').first()).toContainText(`[e2e]`)
    })
  })

  test('?sala= e ?tags= recortam na consulta; a ocupação não se diz com eles', async ({ browser }) => {
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slug}/agenda?date=${AMANHA}&sala=${salaRosa}`)
      await expect(p.locator(`[data-agendamento="${daAna}"]`).first()).toBeVisible()
      await expect(p.locator(`[data-agendamento="${daOutra}"]`)).toHaveCount(0)
      await expect(p.getByText('de ocupação')).toHaveCount(0)

      await p.goto(`/${slug}/agenda?date=${AMANHA}&tags=vip`)
      await expect(p.locator(`[data-agendamento="${daAna}"]`).first()).toBeVisible()
      await expect(p.locator(`[data-agendamento="${daOutra}"]`)).toHaveCount(0)
      await expect(p.locator('[data-filtro-tags] button').first()).toContainText('Tags · 1')
    })
  })

  test('escolher a profissional no filtro leva à URL e relê a agenda', async ({ browser }) => {
    await como(browser, recepcao!, async p => {
      await p.goto(`/${slug}/agenda?date=${AMANHA}`)
      await expect(p.locator(`[data-agendamento="${daAna}"]`).first()).toBeVisible()
      await expect(p.locator(`[data-agendamento="${daOutra}"]`).first()).toBeVisible()
      await p.locator('[data-filtro-profissional] button').first().click()
      await p.locator('[data-painel-picker]').getByText(`[e2e] Prof fil${marca}`).click()
      await expect(p).toHaveURL(new RegExp(`profissional=${rede!.professionalId}`))
      await expect(p.locator(`[data-agendamento="${daOutra}"]`)).toHaveCount(0)
      await expect(p.locator(`[data-agendamento="${daAna}"]`).first()).toBeVisible()
      await p.locator('[data-limpar-filtros]').click()
      await expect(p.locator(`[data-agendamento="${daOutra}"]`).first()).toBeVisible()
    })
  })

  test('na vista pessoal (a "Minha agenda"), o ?profissional= de outra pessoa não traz nada dela', async ({ browser }) => {
    await como(browser, pessoal!, async p => {
      const resposta = await p.goto(`/${slug}/agenda?date=${AMANHA}&profissional=${outra!.userId}`)
      expect(resposta!.status()).toBeLessThan(400)
      const html = await resposta!.text()
      expect(html).not.toContain(daOutra)
      expect(html).not.toContain(daAna)
      await expect(p.locator('[data-filtro-profissional]')).toHaveCount(0)
    })
  })
})

test.describe('os filtros da agenda da rede', () => {
  test('?profissional=, ?sala= e ?tags= na consulta', async ({ browser }) => {
    await como(browser, daRede!, async p => {
      const r1 = await p.goto(`/admin/agenda?date=${AMANHA}&profissional=${outra!.userId}`)
      await expect(p.locator(`[data-agendamento="${daOutra}"]`).first()).toBeVisible()
      await expect(p.locator(`[data-agendamento="${daAna}"]`)).toHaveCount(0)
      expect(await r1!.text()).not.toContain(daAna)
      await expect(p.locator('[data-kpi="Total"]')).toContainText('1')

      // A rede tem uma unidade só: a sala da unidade filtra.
      await p.goto(`/admin/agenda?date=${AMANHA}&sala=${salaAzul}`)
      await expect(p.locator(`[data-agendamento="${daOutra}"]`).first()).toBeVisible()
      await expect(p.locator(`[data-agendamento="${daAna}"]`)).toHaveCount(0)

      await p.goto(`/admin/agenda?date=${AMANHA}&tags=VIP`)
      await expect(p.locator(`[data-agendamento="${daAna}"]`).first()).toBeVisible()
      await expect(p.locator(`[data-agendamento="${daOutra}"]`)).toHaveCount(0)
    })
  })
})
