import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * A31 da simulação de 2026-10-27: as anotações escritas antes de finalizar se
 * perdiam ao recarregar, porque não havia rascunho.
 *
 * O rascunho vai para o sessionStorage, por agendamento: sobrevive ao
 * recarregar e morre com a aba — nada de texto clínico guardado na máquina da
 * recepção (localStorage). Finalizar o apaga.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let atendimento = ''
const EVOLUCAO = `Poros dilatados em zona T ${marca}`
const INTERCORRENCIA = `Eritema leve ${marca}`

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ra${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`rap${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  const cliente = await rede.criarCliente('Mariana')
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: profissional.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  atendimento = data!.id
})
test.afterAll(async () => {
  if (rede) await db().from('appointments').delete().eq('branch_id', rede.branchId)
  await profissional?.limpar(); await rede?.limpar()
})

test('as anotações sobrevivem ao recarregar (sessionStorage, nunca localStorage) e somem ao finalizar', async ({ browser }) => {
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${atendimento}`)
    const evolucao = p.getByPlaceholder('Técnicas utilizadas, regiões tratadas, evolução do cliente…')
    const intercorrencia = p.getByPlaceholder('Reações, intercorrências ou observações…')
    await evolucao.fill(EVOLUCAO)
    await intercorrencia.fill(INTERCORRENCIA)

    await p.reload()
    await expect(evolucao).toHaveValue(EVOLUCAO)
    await expect(intercorrencia).toHaveValue(INTERCORRENCIA)
    const guardado = await p.evaluate(() => ({
      sessao: JSON.stringify({ ...sessionStorage }),
      local:  JSON.stringify({ ...localStorage }),
    }))
    expect(guardado.sessao).toContain(EVOLUCAO)
    expect(guardado.local, 'texto clínico não fica na máquina').not.toContain(EVOLUCAO)

    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', atendimento).single()).data?.status).toBe('COMPLETED')
    await expect.poll(() => p.evaluate(() => JSON.stringify({ ...sessionStorage })), { message: 'finalizar apaga o rascunho' }).not.toContain(EVOLUCAO)
  })
  const { data: entrada } = await db().from('medical_record_entries').select('notes').eq('appointment_id', atendimento).single()
  expect(entrada?.notes).toBe(EVOLUCAO)
})
