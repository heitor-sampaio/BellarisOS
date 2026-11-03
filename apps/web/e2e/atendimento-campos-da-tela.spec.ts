import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Os atritos da tela do atendimento (5ª simulação, F10):
 * - A35: "Registre as dores/queixas do cliente" aparecia só acima do botão,
 *   depois de uma página longa, e a tela não rolava até o campo;
 * - A42: o mesmo campo (a evolução) tinha três nomes — "Anotações clínicas",
 *   "O que foi realizado" e "Observações finais".
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function emCurso(rotulo: string): Promise<string> {
  const cliente = await rede!.criarCliente(rotulo)
  await responderAnamnese(cliente, rede!.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return data!.id
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`ct${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`ctp${marca}`, {
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
    await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string)), 'a limpeza tem de apagar tudo').toEqual([])
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('A35: sem as dores, gerar o plano rola até o campo, foca e diz o que falta junto dele', async ({ browser }) => {
  const id = await emCurso('Dores')
  await como(browser, async p => {
    await p.setViewportSize({ width: 1280, height: 700 })
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Gerar plano e enviar à recepção' }).scrollIntoViewIfNeeded()
    await p.getByRole('button', { name: 'Gerar plano e enviar à recepção' }).click()
    const dores = p.locator('[data-campo="dores"]')
    await expect(dores).toHaveAttribute('data-invalido', 'true')
    await expect(dores.getByRole('alert')).toContainText('Registre as dores')
    await expect(dores.locator('textarea')).toBeFocused()
    await expect(dores).toBeInViewport()
    // Escrever tira o aviso.
    await dores.locator('textarea').fill(`Manchas ${marca}`)
    await expect(dores).not.toHaveAttribute('data-invalido', 'true')
  })
  expect((await db().from('treatment_plans').select('id').eq('evaluation_appointment_id', id)).data, 'nenhum plano').toEqual([])
})
