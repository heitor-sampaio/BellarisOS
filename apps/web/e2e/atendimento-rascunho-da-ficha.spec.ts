import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Revisão do Heitor, 2026-10-29: a ficha do procedimento entra no rascunho do
 * atendimento (A31) — o mesmo que já guardava a evolução, as dores, a
 * anamnese e os insumos. Recarregar a página trazia a ficha em branco: o
 * "Salvar ficha" era o único jeito de guardar antes de finalizar.
 *
 * O planejador de injetáveis da ficha volta com o planejamento ESCOLHIDO
 * aberto (os pontos, o servidor retrata ao gravar). O rascunho é o mesmo
 * sessionStorage: morre com a aba e some ao finalizar.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const FICHA = `Ficha de toxina ${marca}`
const ACIDO = `Mandélico 30% ${marca}`
const NOME_DO_MAPA = `Toxina glabela ${marca}`

let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let fichaId = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  test.setTimeout(180_000)
  rede = await criarOutraRede(`rf${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  const { data: ficha, error } = await db().from('forms').insert({
    tenant_id: rede.tenantId, name: FICHA, is_active: true, tipo: 'PROCEDIMENTO',
    schema: { rows: [
      { id: 'r1', fields: [
        { id: 'fototipo', type: 'select', label: 'Fototipo', required: true, options: ['I', 'II', 'III', 'IV'] },
        { id: 'acido', type: 'text', label: 'Ácido utilizado' },
      ] },
      { id: 'r2', fields: [{ id: 'mapa', type: 'injectable_map', label: 'Planejador de injetáveis', options: ['Toxina botulínica'] }] },
    ] },
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  fichaId = ficha!.id
  expect((await db().from('procedures').update({ form_id: fichaId, price: 0 }).eq('id', rede.procedureId)).error).toBeNull()
  profissional = await criarMembro(`rfp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})
test.afterAll(async () => {
  if (rede) {
    await db().from('injectable_maps').delete().eq('tenant_id', rede.tenantId)
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string)), 'a limpeza tem de apagar tudo').toEqual([])
    await db().from('procedures').update({ form_id: null }).eq('id', rede.procedureId)
    await db().from('forms').delete().eq('id', fichaId)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('recarregar não perde a ficha do procedimento nem o planejamento aberto — e o "Finalizar" leva os dois', async ({ browser }) => {
  const cliente = await rede!.criarCliente('Recarregar')
  await responderAnamnese(cliente, rede!.tenantId)
  const { data: mapa, error: eMapa } = await db().from('injectable_maps').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, client_id: cliente, name: `[e2e] ${NOME_DO_MAPA}`, view: 'rosto_f', points: [],
  }).select('id').single<{ id: string }>()
  expect(eMapa).toBeNull()
  const { data: ag, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  const id = ag!.id

  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const fototipo = p.locator('[data-campo="fototipo"] select')
    const acido = p.locator('[data-campo="acido"] input')
    const campoDoMapa = p.locator('[data-campo="mapa"]')
    const sessao = () => p.evaluate(() => JSON.stringify({ ...sessionStorage }))
    // A escolha feita antes de a página hidratar não chega ao React: repete
    // até o rascunho a ter (no next dev, a primeira abertura compila a página).
    await expect(async () => {
      await fototipo.selectOption('II')
      expect(await sessao()).toContain('\\"fototipo\\":\\"II\\"')
    }).toPass({ timeout: 30_000 })
    await acido.fill(ACIDO)
    await campoDoMapa.getByText(NOME_DO_MAPA).click()
    await expect(campoDoMapa.getByRole('heading', { name: `[e2e] ${NOME_DO_MAPA}` })).toBeVisible()
    await expect.poll(sessao, { message: 'o planejamento escolhido vai ao rascunho' }).toContain('planejamento')

    await p.reload()
    await expect(fototipo, 'a resposta da ficha volta do rascunho').toHaveValue('II')
    await expect(acido).toHaveValue(ACIDO)
    await expect(campoDoMapa.getByRole('heading', { name: `[e2e] ${NOME_DO_MAPA}` }), 'o planejamento escolhido volta aberto').toBeVisible()
    const guardado = await p.evaluate(() => ({ sessao: JSON.stringify({ ...sessionStorage }), local: JSON.stringify({ ...localStorage }) }))
    expect(guardado.sessao).toContain(ACIDO)
    expect(guardado.local, 'texto clínico não fica na máquina').not.toContain(ACIDO)

    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single()).data?.status).toBe('COMPLETED')
    await expect.poll(() => p.evaluate(() => JSON.stringify({ ...sessionStorage })), { message: 'finalizar apaga o rascunho' }).not.toContain(ACIDO)
  })
  const { data } = await db().from('medical_record_entries').select('form_data').eq('appointment_id', id).single()
  const answers = (data?.form_data as { ficha?: { answers?: Record<string, unknown> } } | null)?.ficha?.answers
  expect(answers).toMatchObject({ fototipo: 'II', acido: ACIDO, mapa: { planejamento: { id: mapa!.id } } })
})
