import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'
import { apagarAgendamentos } from './apoio/limpeza'
import { responderAnamnese } from './apoio/anamnese'

/**
 * D8 da 6ª simulação (2026-11-04; princípio 3) e A29: a Bia preencheu a
 * Evolução e as Intercorrências, montou o plano e clicou em "Gerar plano e
 * enviar à recepção". A tela trocou de formulário: o bloco "Insumos
 * utilizados" sumiu, e a Evolução e as Intercorrências apareceram VAZIAS — e
 * foram vazias ao "Finalizar", que gravou a evolução em branco por cima. Eram
 * dois estados (o da avaliação e o de sempre) para o mesmo campo.
 *
 * Agora é um estado só: o que se escreveu continua na tela depois do plano,
 * os insumos continuam até concluir, e a conclusão nunca troca a evolução
 * gravada por vazio.
 */

const marca = Date.now().toString(36)
const db = () => banco()
const DORES = `Rugas na testa ${marca}`
const EVOLUCAO = `Aplicada toxina em 3 pontos ${marca}`
const INTERC = `Leve hematoma ${marca}`

let rede: OutraRede | null = null
let profissional: MembroDeTeste | null = null
let slug = ''
let gel = ''
let procPlano = ''

async function como(browser: Browser, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: profissional!.estado })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

async function avaliacaoEmCurso(rotulo: string): Promise<string> {
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
  test.setTimeout(180_000)
  rede = await criarOutraRede(`pgs${marca}`)
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  gel = await rede.criarProduto('Gel')
  expect((await db().from('procedure_products').insert({ procedure_id: rede.procedureId, product_id: gel, quantity: 1 })).error).toBeNull()
  const { data, error } = await db().from('procedures').insert({
    tenant_id: rede.tenantId, name: `${PREFIXO} Toxina ${marca}`, category: 'e2e', duration_min: 30, price: 900, is_active: true,
  }).select('id').single<{ id: string }>()
  expect(error).toBeNull()
  procPlano = data!.id
  profissional = await criarMembro(`pgsp${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Profissional',
    permissoes: [
      { modulo: 'agenda', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'clients', nivel: 'VIEW' },
      { modulo: 'medical_records', nivel: 'MANAGE', escopo: 'OWN' },
      { modulo: 'stock', nivel: 'VIEW' },
    ],
  })
  expect((await db().from('users').update({ provides_services: true }).eq('id', profissional.userId)).error).toBeNull()
})

test.afterAll(async () => {
  if (rede) {
    await db().from('treatment_plans').delete().eq('branch_id', rede.branchId)
    const { data: ags } = await db().from('appointments').select('id').eq('branch_id', rede.branchId)
    expect(await apagarAgendamentos((ags ?? []).map(a => a.id as string)), 'a limpeza tem de apagar tudo').toEqual([])
    await db().from('procedure_products').delete().eq('procedure_id', rede.procedureId)
    if (procPlano) await db().from('procedures').delete().eq('id', procPlano)
  }
  await profissional?.limpar(); await rede?.limpar()
})

test('depois de "Gerar plano e enviar", a evolução, a intercorrência e os insumos continuam — e vão ao Finalizar', async ({ browser }) => {
  const id = await avaliacaoEmCurso('Bia')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByPlaceholder('Anote o que o cliente relatou: queixas estéticas, objetivos, histórico de tratamentos anteriores…').fill(DORES)
    await p.locator('#avaliacao-evolucao').fill(EVOLUCAO)
    await p.locator('#avaliacao-intercorrencias').fill(INTERC)
    await p.getByRole('button', { name: 'Nova sessão' }).click()
    await p.getByRole('button', { name: 'Adicionar procedimento' }).click()
    await p.locator('select').filter({ hasText: 'Selecionar procedimento…' }).selectOption({ label: `${PREFIXO} Toxina ${marca}` })
    await p.getByRole('button', { name: 'Gerar plano e enviar à recepção' }).click()
    await expect.poll(async () => (await db().from('treatment_plans').select('status').eq('evaluation_appointment_id', id).maybeSingle()).data?.status,
      { timeout: 30_000 }).toBe('PROPOSED')

    // A tela do plano gerado: o que foi escrito continua, e os insumos também.
    await expect(p.locator('#atendimento-evolucao')).toHaveValue(EVOLUCAO, { timeout: 15_000 })
    await expect(p.locator('#atendimento-intercorrencias')).toHaveValue(INTERC)
    await expect(p.locator('.card', { hasText: 'Insumos utilizados' }).last()).toContainText(`${PREFIXO} Gel pgs${marca}`)

    // E vão ao Finalizar.
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await expect(p.locator('#conclusao-evolucao')).toHaveValue(EVOLUCAO)
    await expect(p.locator('#conclusao-intercorrencias')).toHaveValue(INTERC)
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data?.status,
      { timeout: 30_000 }).toBe('COMPLETED')
  })
  const { data: entrada } = await db().from('medical_record_entries').select('notes, intercurrences').eq('appointment_id', id).single()
  expect(entrada).toEqual({ notes: EVOLUCAO, intercurrences: INTERC })
})

test('o Finalizar com a evolução em branco não apaga a evolução gravada', async ({ browser }) => {
  const id = await avaliacaoEmCurso('Gravada')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByPlaceholder('Anote o que o cliente relatou: queixas estéticas, objetivos, histórico de tratamentos anteriores…').fill(DORES)
    await p.locator('#avaliacao-evolucao').fill(EVOLUCAO)
    await p.getByRole('button', { name: 'Nova sessão' }).click()
    await p.getByRole('button', { name: 'Adicionar procedimento' }).click()
    await p.locator('select').filter({ hasText: 'Selecionar procedimento…' }).selectOption({ label: `${PREFIXO} Toxina ${marca}` })
    await p.getByRole('button', { name: 'Gerar plano e enviar à recepção' }).click()
    await expect.poll(async () => (await db().from('medical_record_entries').select('notes').eq('appointment_id', id).maybeSingle()).data?.notes,
      { timeout: 30_000 }).toBe(EVOLUCAO)
    await p.getByRole('button', { name: 'Finalizar atendimento' }).click()
    await p.locator('#conclusao-evolucao').fill('')
    await p.getByRole('button', { name: 'Confirmar conclusão' }).click()
    await expect.poll(async () => (await db().from('appointments').select('status').eq('id', id).single<{ status: string }>()).data?.status,
      { timeout: 30_000 }).toBe('COMPLETED')
  })
  const { data: entrada } = await db().from('medical_record_entries').select('notes').eq('appointment_id', id).single()
  expect(entrada?.notes, 'a evolução gravada pelo plano ficou').toBe(EVOLUCAO)
})

// D7 da 7ª simulação: o banco tinha a evolução da avaliação da Sophie e a
// tela, depois do plano enviado, mostrava o campo vazio. Reproduzir: gerar o
// plano com a evolução e reabrir NA MESMA ABA (o rascunho do sessionStorage
// está lá).
test('D7: gerar o plano com a evolução e recarregar na mesma aba mostra a evolução gravada', async ({ browser }) => {
  const id = await avaliacaoEmCurso('Sophie')
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await p.getByPlaceholder('Anote o que o cliente relatou: queixas estéticas, objetivos, histórico de tratamentos anteriores…').fill(DORES)
    await p.locator('#avaliacao-evolucao').fill(EVOLUCAO)
    await p.getByRole('button', { name: 'Nova sessão' }).click()
    await p.getByRole('button', { name: 'Adicionar procedimento' }).click()
    await p.locator('select').filter({ hasText: 'Selecionar procedimento…' }).selectOption({ label: `${PREFIXO} Toxina ${marca}` })
    await p.getByRole('button', { name: 'Gerar plano e enviar à recepção' }).click()
    await expect.poll(async () => (await db().from('medical_record_entries').select('notes').eq('appointment_id', id).maybeSingle()).data?.notes,
      { timeout: 30_000 }).toBe(EVOLUCAO)
    await expect(p.locator('#atendimento-evolucao')).toHaveValue(EVOLUCAO, { timeout: 15_000 })
    await p.reload()
    await expect(p.locator('#atendimento-evolucao'), 'recarregar na mesma aba').toHaveValue(EVOLUCAO, { timeout: 15_000 })
    // A recepção fechou o checkout do plano (a Sophie fechou às 09:08): a tela segue com a evolução.
    expect((await db().from('treatment_plans').update({ status: 'ACCEPTED' }).eq('evaluation_appointment_id', id)).error).toBeNull()
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.locator('#atendimento-evolucao'), 'com o plano fechado').toHaveValue(EVOLUCAO, { timeout: 15_000 })
  })
  // Numa sessão nova do navegador (sem rascunho nenhum), também.
  await como(browser, async p => {
    await p.goto(`/${slug}/agenda/${id}`)
    await expect(p.locator('#atendimento-evolucao'), 'sem rascunho').toHaveValue(EVOLUCAO, { timeout: 15_000 })
  })
})
