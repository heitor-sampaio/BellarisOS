import { test, expect } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * O "Próximo atendimento" da agenda da profissional (simulação de 2026-10-20,
 * junto da D13): mostrava a cliente que ela JÁ tinha atendido, porque escolhia
 * o próximo pela hora e só descartava cancelado e falta.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
const agora = Date.now()
const em = (min: number) => new Date(agora + min * 60_000).toISOString()
const diaBR = (iso: string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date(iso))

test.beforeAll(async () => {
  rede = await criarOutraRede(`px${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`pxp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [{ modulo: 'agenda', nivel: 'VIEW', escopo: 'OWN' }],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  const base = { branch_id: rede.branchId, procedure_id: rede.procedureId, professional_id: profissional.userId, source: 'INTERNAL', duration_min: 30, price: 100 }
  const jaAtendida = await rede.criarCliente('Ja atendida')
  const proxima = await rede.criarCliente('Proxima')
  const { error } = await db().from('appointments').insert([
    { ...base, client_id: jaAtendida, status: 'COMPLETED', scheduled_at: em(60), completed_at: em(-5) },
    { ...base, client_id: proxima, status: 'SCHEDULED', scheduled_at: em(120) },
  ])
  expect(error).toBeNull()
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('o próximo atendimento pula quem já foi atendida', async ({ browser }) => {
  // Os dois horários precisam cair HOJE (perto da meia-noite, não há "hoje" que os contenha).
  test.skip(diaBR(em(120)) !== diaBR(em(0)), 'perto da meia-noite')
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try {
    const p = await ctx.newPage()
    await p.goto(`/${slug}/agenda`)
    const destaque = p.getByText('Próximo atendimento', { exact: true }).locator('xpath=..')
    await expect(destaque).toContainText(`Proxima px${marca}`)
    await expect(destaque).not.toContainText(`Ja atendida px${marca}`)
  } finally { await ctx.close() }
})
