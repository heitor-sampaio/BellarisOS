import { test, expect, type Browser, type Page } from '@playwright/test'
import { banco, PREFIXO } from './apoio/banco'
import { criarMembro, type MembroDeTeste } from './apoio/sessao'
import { criarOutraRede, type OutraRede } from './apoio/outra-rede'

/**
 * Os atritos do prontuário de injetáveis da 11ª simulação (2026-11-10, a Dra.
 * Renata e a Sofia da [sim] Clínica Violeta), numa rede [e2e] própria:
 *
 * - A30: a ficha de pré-atendimento não tinha perguntas de injetáveis, e não
 *   havia modelo — agora é OPÇÃO da clínica (princípio 6).
 * - A33: o lote aplicado não aparecia no prontuário; quem parte da paciente
 *   (a reação adversa) não chegava ao lote.
 * - A34: o campo "Foto de antes / depois" dizia "Não informado" com duas
 *   fotos anexadas no atendimento.
 * - A35: para a Sofia ("só os meus"), a ficha dizia "Nenhum termo ou
 *   contrato" e "Nenhum documento anexado" quando eles existem.
 */

test.setTimeout(180_000)

const marca = Date.now().toString(36)
const db = () => banco()
const nome = (r: string) => `${PREFIXO} ${r} ${marca}`
let rede: OutraRede
let slug = ''
let dona: MembroDeTeste
let sofia: MembroDeTeste
let cliente = ''
let atendimento = ''
let loteId = ''

async function como(browser: Browser, m: MembroDeTeste, fn: (p: Page) => Promise<void>) {
  const ctx = await browser.newContext({ storageState: m.estado, viewport: { width: 1440, height: 900 } })
  try { await fn(await ctx.newPage()) } finally { await ctx.close() }
}

test.beforeAll(async () => {
  rede = await criarOutraRede(`pr11${marca}`)
  expect((await db().from('tenants').update({ onboarding_completed_at: new Date().toISOString() }).eq('id', rede.tenantId)).error).toBeNull()
  slug = (await db().from('branches').select('slug').eq('id', rede.branchId).single<{ slug: string }>()).data!.slug
  dona = await criarMembro(`pr11d${marca}`, { tenant: rede.tenantId, donoDaRede: true, rotulo: 'Dona', permissoes: [] })
  sofia = await criarMembro(`pr11s${marca}`, {
    tenant: rede.tenantId, branchId: rede.branchId, rotulo: 'Biomedica',
    permissoes: [{ modulo: 'clients', nivel: 'VIEW' }, { modulo: 'medical_records', nivel: 'VIEW', escopo: 'OWN' }, { modulo: 'documents', nivel: 'VIEW' }],
  })

  // A toxina com um lote, e a Helena atendida pela profissional da rede (não a Sofia).
  const { data: p, error } = await db().from('products')
    .insert({ tenant_id: rede.tenantId, name: nome('Toxina'), unit: 'frasco', consumption_unit: 'U', units_per_package: 100 })
    .select('id').single<{ id: string }>()
  expect(error).toBeNull()
  expect((await db().rpc('estoque_entrada', {
    p_produto: p!.id, p_unidade: rede.branchId, p_quantidade: 1, p_custo: 780, p_observacao: null,
    p_lote: `TOX-${marca}`.toUpperCase(), p_validade: '2027-03-01', p_autor: 'e2e',
  })).error).toBeNull()
  loteId = (await db().from('product_batches').select('id').eq('product_id', p!.id).single<{ id: string }>()).data!.id
  cliente = await rede.criarCliente('Helena')
  const ontem = new Date(Date.now() - 86_400_000).toISOString()
  const { data: ag } = await db().from('appointments').insert({
    branch_id: rede.branchId, client_id: cliente, procedure_id: rede.procedureId, professional_id: rede.professionalId,
    status: 'COMPLETED', source: 'INTERNAL', duration_min: 30, price: 0, scheduled_at: ontem, completed_at: ontem,
  }).select('id').single<{ id: string }>()
  atendimento = ag!.id
  expect((await db().from('stock_movements').insert({
    branch_id: rede.branchId, product_id: p!.id, type: 'PROCEDURE_USAGE', quantity: -30, balance_after: 70,
    appointment_id: atendimento, created_by: 'e2e', created_at: ontem,
  })).error).toBeNull()
  // A ficha do procedimento com o campo de foto, sem foto nele — e duas fotos pelo cartão do atendimento.
  const { data: mr } = await db().from('medical_records').upsert({ client_id: cliente }, { onConflict: 'client_id' }).select('id').single<{ id: string }>()
  expect((await db().from('medical_record_entries').insert({
    medical_record_id: mr!.id, appointment_id: atendimento, professional_id: rede.professionalId,
    form_data: { ficha: { formId: null, name: 'Ficha da toxina', rows: [{ id: 'r1', fields: [{ id: 'foto', type: 'photo', label: 'Foto de antes / depois' }] }], answers: {} } },
  })).error).toBeNull()
  for (const momento of ['antes', 'depois']) {
    expect((await db().from('client_documents').insert({
      branch_id: rede.branchId, client_id: cliente, appointment_id: atendimento, category: 'foto_clinica',
      name: nome(`Foto clínica (${momento})`), file_name: 'foto.png', file_path: `e2e/${marca}/${momento}.png`,
    })).error).toBeNull()
  }
})

test.afterAll(async () => {
  await dona?.limpar(); await sofia?.limpar()
  await rede?.limpar()
})

test('A33 e A34: o prontuário diz o lote aplicado, com o caminho ao "Aplicado em", e onde estão as fotos do atendimento', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto(`/admin/clients/${cliente}?aba=fichas`)
    const lotes = p.locator('[data-lotes-do-atendimento]')
    await expect(lotes).toContainText(`lote TOX-${marca}`.toUpperCase().replace('LOTE', 'lote'))
    await expect(lotes).toContainText('30 U')
    await expect(p.locator('[data-fotos-do-atendimento]')).toContainText('2 fotos deste atendimento em Documentos → Foto clínica')
    await lotes.locator('[data-aplicado-em-do-lote]').click()
    await expect(p).toHaveURL(new RegExp(`/estoque\\?lote=${loteId}`))
    const janela = p.getByRole('dialog', { name: /Aplicado em/ })
    await expect(janela.locator('[data-aplicacao-do-lote]')).toContainText(`Helena pr11${marca}`)
  })
})

test('A35: para quem tem o prontuário "só os meus", a ficha diz que os termos e os anexos clínicos ficam de fora', async ({ browser }) => {
  await como(browser, sofia, async p => {
    await p.goto(`/${slug}/clients/${cliente}?aba=documentos`)
    await expect(p.locator('[data-anexos-clinicos-fora]')).toContainText('Há 2 anexos clínicos desta cliente')
    await expect(p.locator('[data-termos-recortados]')).toContainText('“só os meus”')
  })
})

test('A30: a ficha de pré-atendimento acrescenta o modelo de perguntas de injetáveis, se a clínica quiser', async ({ browser }) => {
  await como(browser, dona, async p => {
    await p.goto('/admin/settings?tab=fichas')
    await p.locator('[data-pre-atendimento]').getByRole('button', { name: 'Editar perguntas' }).click()
    await p.getByRole('button', { name: 'Acrescentar as perguntas de injetáveis' }).click()
    await expect(p.getByText('Tem doença neuromuscular').first()).toBeVisible()
    await p.getByRole('button', { name: 'Salvar ficha' }).click()
    await expect(p.getByText('Ficha de pré-atendimento salva.')).toBeVisible({ timeout: 20_000 })
  })
  await expect.poll(async () => JSON.stringify((await db().from('forms').select('schema')
    .eq('tenant_id', rede.tenantId).eq('tipo', 'PRE_ATENDIMENTO').single<{ schema: unknown }>()).data?.schema ?? null))
    .toContain('inj_neuromuscular')
})
