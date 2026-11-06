import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco } from './apoio/banco'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { responderAnamnese } from './apoio/anamnese'

/**
 * Os atritos do atendimento da 8ª simulação (2026-11-06), da F37:
 * - A26: a anamnese e a evolução digitadas não ficam ao recarregar noutra aba,
 *   e a tela não dizia que nada fica salvo antes de finalizar.
 * - A27: a desistência no meio só pedia o motivo — sem registrar a
 *   intercorrência no prontuário nem baixar o insumo já aplicado.
 * - A28: a alergia das anotações da ficha não aparecia na anamnese.
 * - A29: o Finalizar repetia a Evolução e as Intercorrências já digitadas.
 * - A30: o menu "Tratamentos" abria a tela "Planejamentos".
 * - A31: iniciar dentro do bloqueio de férias não avisava.
 *
 * Numa rede [e2e] própria.
 */

const marca = Date.now().toString(36)
const db = () => banco()
let rede: OutraRede | null = null
let slug = ''
let profissional: MembroDeTeste | null = null
let recepcao: MembroDeTeste | null = null
let nomeDaProf = ''
let gel = ''

async function como(browser: Browser, quem: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: quem.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

/** Um atendimento da profissional (em curso, por padrão), com a ficha de saúde respondida. */
async function atendimento(rotulo: string, extra: Record<string, unknown> = {}) {
  const cliente = await rede!.criarCliente(rotulo)
  await responderAnamnese(cliente, rede!.tenantId)
  const { data, error } = await db().from('appointments').insert({
    branch_id: rede!.branchId, client_id: cliente, procedure_id: rede!.procedureId, professional_id: profissional!.userId,
    status: 'IN_PROGRESS', source: 'INTERNAL', duration_min: 30, price: 0,
    scheduled_at: new Date(Date.now() - 30 * 60_000).toISOString(), started_at: new Date(Date.now() - 20 * 60_000).toISOString(),
    ...extra,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  return { id: data!.id, cliente }
}

test.beforeAll(async () => {
  test.setTimeout(150_000)
  rede = await criarOutraRede(`at8${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  profissional = await criarMembro(`at8p${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
  nomeDaProf = (await db().from('users').select('name').eq('id', profissional.userId).single<{ name: string }>()).data!.name
  recepcao = await criarMembro(`at8r${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Recepção',
    permissoes: [{ modulo: 'agenda', nivel: 'MANAGE' }, { modulo: 'clients', nivel: 'VIEW' }, { modulo: 'cashier', nivel: 'MANAGE' }],
  })
  // O insumo do procedimento (já marcado na tela do atendimento).
  gel = await rede.criarProduto('Gel', 10)
  expect((await db().from('procedure_products').insert({ procedure_id: rede.procedureId, product_id: gel, quantity: 1, unit_cost: 0 })).error).toBeNull()
})

test.afterAll(async () => {
  await profissional?.limpar(); await recepcao?.limpar(); await rede?.limpar()
})

test('A26: a tela do atendimento diz que o digitado só fica salvo ao finalizar', async ({ browser }) => {
  const { id } = await atendimento('Rascunho')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const aviso = p.locator('[data-aviso-do-rascunho]')
    await expect(aviso).toContainText('nesta aba')
    await expect(aviso).toContainText('Finalizar')
  })
})

test('A27: a desistência no meio registra a intercorrência e baixa o insumo já aplicado', async ({ browser }) => {
  const { id } = await atendimento('Desistiu')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByRole('button', { name: 'Cancelar', exact: true }).click()
    const janela = p.getByRole('dialog', { name: 'Cancelar atendimento' })
    await janela.getByLabel('Motivo do cancelamento *').fill('A cliente passou mal e desistiu')
    await janela.getByLabel('Intercorrência (opcional)').fill('Lipotimia após a aplicação; recuperou em 10 min')
    await janela.getByLabel(/Baixar do estoque o que já foi aplicado/).check()
    await janela.getByRole('button', { name: 'Confirmar cancelamento' }).click()
    await expect(janela).toBeHidden()
  })
  const { data: ag } = await db().from('appointments').select('status, cancellation_reason').eq('id', id).single<{ status: string; cancellation_reason: string }>()
  expect(ag).toEqual({ status: 'CANCELLED', cancellation_reason: 'A cliente passou mal e desistiu' })
  const { data: entrada } = await db().from('medical_record_entries').select('intercurrences').eq('appointment_id', id).single<{ intercurrences: string }>()
  expect(entrada?.intercurrences).toBe('Lipotimia após a aplicação; recuperou em 10 min')
  const { data: mov } = await db().from('stock_movements').select('quantity, type').eq('appointment_id', id)
  expect(mov).toEqual([{ quantity: -1, type: 'PROCEDURE_USAGE' }])
  const { data: com } = await db().from('commission_lines').select('id').eq('appointment_id', id)
  expect(com ?? [], 'desistência não gera comissão').toHaveLength(0)
})

test('A28: as anotações da ficha (a alergia) aparecem junto da anamnese', async ({ browser }) => {
  const { id, cliente } = await atendimento('Alergica')
  expect((await db().from('clients').update({ notes: 'Alergia a dipirona (relato da planilha)' }).eq('id', cliente)).error).toBeNull()
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.locator('[data-anotacoes-da-ficha]').first()).toContainText('Alergia a dipirona (relato da planilha)')
  })
})

test('A29: o Finalizar não repete a Evolução e as Intercorrências já digitadas', async ({ browser }) => {
  const { id } = await atendimento('Finalizar')
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByLabel('Evolução', { exact: true }).fill(`Limpeza feita ${marca}`)
    await p.getByLabel('Intercorrências', { exact: true }).fill('Leve vermelhidão')
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    const janela = p.getByRole('dialog', { name: 'Finalizar atendimento' })
    await expect(janela.locator('[data-evolucao-da-tela]')).toContainText(`Limpeza feita ${marca}`)
    await expect(janela.locator('[data-evolucao-da-tela]')).toContainText('Leve vermelhidão')
    await expect(janela.locator('textarea'), 'sem os campos repetidos').toHaveCount(0)
    await janela.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data?.status,
      { timeout: 30_000 }).toBe('COMPLETED')
  })
  const { data } = await db().from('medical_record_entries').select('notes, intercurrences').eq('appointment_id', id).single()
  expect(data).toEqual({ notes: `Limpeza feita ${marca}`, intercurrences: 'Leve vermelhidão' })
})

test('A30: o menu e a tela dos planos de tratamento têm o mesmo nome', async ({ browser }) => {
  await como(browser, recepcao!, async p => {
    await p.goto(`/${slug}/planejamentos`)
    await expect(p.getByRole('heading', { name: 'Tratamentos', exact: true })).toBeVisible()
    await expect(p.getByRole('link', { name: 'Tratamentos', exact: true }).first()).toBeVisible()
  })
})

test('A31: o atendimento dentro de um bloqueio da profissional avisa na tela', async ({ browser }) => {
  const inicio = new Date(Date.now() + 2 * 3_600_000)
  const { id } = await atendimento('Ferias', {
    status: 'CONFIRMED', started_at: null, scheduled_at: inicio.toISOString(),
  })
  const { error } = await db().from('agenda_bloqueios').insert({
    tenant_id: rede!.tenantId, branch_id: rede!.branchId, professional_id: profissional!.userId,
    inicio: new Date(inicio.getTime() - 3_600_000).toISOString(), fim: new Date(inicio.getTime() + 5 * 3_600_000).toISOString(),
    motivo: 'Férias', criado_por_nome: 'e2e',
  })
  expect(error).toBeNull()
  await como(browser, profissional!, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    const aviso = p.locator('[data-aviso-do-bloqueio]')
    await expect(aviso).toContainText(`Horário bloqueado para ${nomeDaProf}`)
    await expect(aviso).toContainText('Férias')
  })
})

